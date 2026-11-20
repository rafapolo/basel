#!/usr/bin/env bun
// Build do site (mesmo fluxo do ../cantography): docs/ → dist/, publicado pelo GitHub Actions (.github/workflows/deploy.yml).
//  - three.js e os addons empacotados com o código (Bun.build, só o que a cidade usa), sem o jsDelivr: um bloqueador
//    ou uma queda do CDN derrubava a página inteira; os import() dinâmicos viram pedaços à parte, carregados sob demanda
//  - terser por cima do minificador do Bun (comprime um pouco mais), index.html minificado
//  - sw.js com o cache batizado pelo commit; os scripts da página levam ?v=<commit>
// Em desenvolvimento docs/ continua servindo sozinho (importmap para o jsDelivr): `bun run dev`.
import { minify } from 'html-minifier-terser';
import { minify as terser } from 'terser';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'docs');
const DIST = join(ROOT, 'dist');
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
const sha = (process.env.GITHUB_SHA || Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: ROOT }).stdout.toString().trim() || 'dev').slice(0, 8);

// ── 1. módulos: cidade.js e tudo o que ele importa, three incluído ──────────────────────────────────────────────
const r = await Bun.build({
  entrypoints: [join(SRC, 'cidade.js')],
  outdir: DIST, root: SRC, target: 'browser', format: 'esm', splitting: true, minify: true,
  naming: { entry: '[name].[ext]', chunk: 'js/[name]-[hash].[ext]' },
  define: { 'process.env.NODE_ENV': '"production"' },
});
if (!r.success) throw new AggregateError(r.logs, 'bundle falhou');
const terse = async (arq, opts) => { const t = await terser(readFileSync(arq, 'utf-8'), opts); writeFileSync(arq, t.code); };
for (const o of r.outputs) if (o.path.endsWith('.js')) await terse(o.path, { module: true, compress: { passes: 2 }, mangle: true, format: { comments: false } });

// ── 2. scripts clássicos da página ───────────────────────────────────────────────────────────────────────────────
const CLASSICOS = ['i18n.js', 'som.js', 'ambiente-som.js'];
for (const f of CLASSICOS) {
  const t = await terser(readFileSync(join(SRC, f), 'utf-8'), { compress: { passes: 2 }, mangle: true, format: { comments: false } });
  writeFileSync(join(DIST, f), t.code);
}

// ── 3. dados, e cópias .gz das malhas com zopfli quando o `uv` existe (o CI instala) ─────────────────────────────
cpSync(join(SRC, 'data'), join(DIST, 'data'), { recursive: true });
const MALHAS = ['data/predios.v2.bin', 'data/terreno.v2.bin'];
const z = Bun.spawnSync(['uv', 'run', '--quiet', '--with', 'zopfli', 'python', join(ROOT, 'script/comprime_malhas.py'), ...MALHAS.map((m) => join(DIST, m))], { cwd: ROOT });
const comGz = z.exitCode === 0;
console.log(comGz ? z.stdout.toString().trim() : 'zopfli: sem uv, as malhas vão sem .gz');
// hash do conteúdo de cada arquivo de dados: chave do cache de dados do service worker
const HASH = {};
for (const f of readdirSync(join(DIST, 'data'), { recursive: true })) {
  const abs = join(DIST, 'data', String(f));
  if (statSync(abs).isDirectory()) continue;
  HASH[relative(DIST, abs)] = createHash('sha256').update(readFileSync(abs)).digest('hex').slice(0, 10);
}

// ── 4. index.html: sem importmap, scripts sob o commit, preload do que a abertura pede, service worker ───────────
let html = readFileSync(join(SRC, 'index.html'), 'utf-8');
const antes = html;
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
if (html === antes) throw new Error('index.html: importmap não encontrado');
for (const f of [...CLASSICOS, 'cidade.js']) {
  const a = html;
  html = html.replace(`src="${f}"`, `src="${f}?v=${sha}"`);
  if (html === a) throw new Error(`index.html: <script src="${f}"> não encontrado`);
}
// pedaços importados estaticamente pelo cidade.js (o three entre eles): o navegador os pede já, sem esperar o parse
const entrada = readFileSync(join(DIST, 'cidade.js'), 'utf-8');
const estaticos = [...new Set([...entrada.matchAll(/(?:^|[;}\s])import\s*(?:[^'"()]*?from\s*)?["'](\.\/js\/[^"']+)["']/g)].map((m) => m[1]))];
const ABERTURA = ['data/predios.json', 'data/ruas.json', 'data/relevo.bin', 'data/entorno.json', ...MALHAS.map((m) => (comGz ? m + '.gz' : m))];
const pre = [
  ...estaticos.map((u) => `<link rel="modulepreload" href="${u}">`),
  ...ABERTURA.map((u) => `<link rel="preload" href="${u}" as="fetch" crossorigin>`),
].join('');
html = html.replace('</head>', `${pre}${comGz ? '<script>window.BASEL_GZ=1</script>' : ''}</head>`);
html = html.replace('</body>', `<script>if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}))</script>\n</body>`);
const min = await minify(html, {
  collapseWhitespace: true, removeComments: true, removeRedundantAttributes: true, removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true, useShortDoctype: true, minifyCSS: true, minifyJS: true, sortAttributes: true,
});
writeFileSync(join(DIST, 'index.html'), min);
console.log(`preload     ${estaticos.length} módulos, ${ABERTURA.length} arquivos de dados`);

// ── 5. service worker: código no cache do commit, dados no cache pelo conteúdo ───────────────────────────────────
const CODIGO = ['./', './index.html', ...[...CLASSICOS, 'cidade.js'].map((f) => `./${f}?v=${sha}`), ...estaticos];
let sw = readFileSync(join(ROOT, 'script/sw.js'), 'utf-8')
  .replace("const V = 'basel-dev';", `const V = 'basel-${sha}';`)
  .replace('const HASH = {};', `const HASH = ${JSON.stringify(HASH)};`)
  .replace('const ABERTURA = [];', `const ABERTURA = ${JSON.stringify(ABERTURA)};`)
  .replace("const CODIGO = ['./', './index.html'];", `const CODIGO = ${JSON.stringify(CODIGO)};`);
if (!sw.includes(`basel-${sha}`) || sw.includes('const HASH = {};')) throw new Error('sw.js: marcadores não encontrados');
writeFileSync(join(DIST, 'sw.js'), (await terser(sw, { toplevel: true, compress: { passes: 2 }, mangle: true, format: { comments: false } })).code);

// ── 6. tamanhos ──────────────────────────────────────────────────────────────────────────────────────────────────
const gz = (f) => Bun.gzipSync(readFileSync(f)).length;
const js = readdirSync(DIST, { recursive: true }).filter((f) => String(f).endsWith('.js')).map((f) => join(DIST, String(f)));
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`index.html  ${kb(statSync(join(DIST, 'index.html')).size)} (${kb(gz(join(DIST, 'index.html')))} gzip)`);
console.log(`cidade.js   ${kb(statSync(join(DIST, 'cidade.js')).size)} (${kb(gz(join(DIST, 'cidade.js')))} gzip), com o three`);
console.log(`todo o JS   ${js.length} arquivos, ${kb(js.reduce((n, f) => n + gz(f), 0))} gzip`);
const du = (d) => readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? du(join(d, e.name)) : statSync(join(d, e.name)).size), 0);
console.log(`dist/       ${(du(DIST) / 1048576).toFixed(1)} MB (cache basel-${sha})`);
