#!/usr/bin/env bun
// Teste de fumaça do dist/ antes do deploy (CI, .github/workflows/deploy.yml): abre a página num Chromium headless e
// falha se houver erro de JS, resposta >= 400 do próprio site ou se a cidade não terminar de desenhar em 90 s.
//   bun script/smoke.mjs http://localhost:8000/ [webkit]
// Com `webkit` roda no WebKit do Playwright (`bunx playwright install webkit`): o motor do Safari no Mac, não um iPhone
import { chromium, webkit } from 'playwright';

const url = process.argv[2] || 'http://localhost:8000/';
const erros = [];
const b = process.argv[3] === 'webkit' ? await webkit.launch() : await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
try {
  // uma página por consulta: navegar com tiles ainda chegando faz o WebKit rejeitar os downloads abortados ("Load failed")
  // SMOKE_RAPIDO=1 (CI): só o modo normal; o leve em alemão custava ~1 min a mais no swiftshader e roda à mão quando muda
  const casos = process.env.SMOKE_RAPIDO ? ['?hora=15&data=2026-06-21'] : ['?hora=15&data=2026-06-21', '?lang=de&leve=1'];
  for (const q of casos) {
    const pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
    // serviços de fora (tempo, radar, fontes, mapas) ficam bloqueados: o teste é do site, e um 429 deles não pode barrar o
    // deploy (2026-11-22: o Open-Meteo respondeu 429 na CI). A página segue sem eles, como sem rede
    await pg.route((u) => u.origin !== new URL(url).origin, (r) => r.abort());
    pg.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
    pg.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED/.test(m.text())) erros.push(`console: ${m.text()}`); }); // recursos de fora bloqueados acima
    pg.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(new URL(url).origin)) erros.push(`${r.status()} ${r.url()}`); });
    await pg.goto(url + q, { waitUntil: 'load', timeout: 60000 });
    await pg.waitForSelector('#carregando.fora', { state: 'attached', timeout: 90000 });
    const ok = await pg.evaluate(() => !!window.ceu && typeof window.ceu.estado === 'function');
    if (!ok) erros.push(`${q}: window.ceu ausente`);
    console.log(`ok ${q}`);
    await pg.close();
  }
} catch (e) {
  erros.push(String(e));
} finally {
  await b.close();
}
if (erros.length) { console.error(erros.join('\n')); process.exit(1); }
console.log('fumaça: sem erros');
