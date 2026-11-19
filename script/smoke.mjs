#!/usr/bin/env bun
// Teste de fumaça do dist/ antes do deploy (CI, .github/workflows/deploy.yml): abre a página num Chromium headless e
// falha se houver erro de JS, resposta >= 400 do próprio site ou se a cidade não terminar de desenhar em 90 s.
//   bun script/smoke.mjs http://localhost:8000/
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:8000/';
const erros = [];
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
try {
  const pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
  pg.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
  pg.on('console', (m) => { if (m.type() === 'error') erros.push(`console: ${m.text()}`); });
  pg.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(new URL(url).origin)) erros.push(`${r.status()} ${r.url()}`); });
  for (const q of ['?hora=15&data=2026-06-21', '?lang=de&leve=1']) {
    await pg.goto(url + q, { waitUntil: 'load', timeout: 60000 });
    await pg.waitForSelector('#carregando.fora', { state: 'attached', timeout: 90000 });
    const ok = await pg.evaluate(() => !!window.ceu && typeof window.ceu.estado === 'function');
    if (!ok) erros.push(`${q}: window.ceu ausente`);
    console.log(`ok ${q}`);
  }
} catch (e) {
  erros.push(String(e));
} finally {
  await b.close();
}
if (erros.length) { console.error(erros.join('\n')); process.exit(1); }
console.log('fumaça: sem erros');
