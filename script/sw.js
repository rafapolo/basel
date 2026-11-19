// Service worker do site publicado (script/build.js troca o nome do cache pelo commit, então cada deploy instala
// um worker novo, que apaga os caches antigos). Mesmo desenho do ../cantography/sw.js.
const V = 'basel-dev';

// o que a abertura sempre pede; o resto entra no cache na primeira vez que a página pede
const PRECACHE = [
  './', './index.html', './cidade.js?v=dev', './i18n.js?v=dev', './som.js?v=dev', './ambiente-som.js?v=dev',
  './data/predios.json', './data/predios.v2.bin', './data/terreno.v2.bin', './data/relevo.bin', './data/ruas.json',
  './data/ruas_a.webp', './data/ruas_b.webp', './data/ortofoto/geral.webp',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  // por cima do cache HTTP (max-age=600 no GitHub Pages): senão uma visita de minutos antes do deploy
  // encheria o cache novo com os arquivos velhos
  e.waitUntil(caches.open(V).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))));
  self.clients.claim();
});

const guarda = (e, req, res) => e.waitUntil(caches.open(V).then((c) => c.put(req, res)).catch(() => {}));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // data.bs.ch (temperatura do Reno) segue o cache HTTP dela
  // página: rede primeiro, para o deploy aparecer na hora; o cache é o fallback offline
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'manual' })
      .then((res) => { if (res.ok) guarda(e, e.request, res.clone()); return res; })
      .catch(() => caches.match(e.request).then((h) => h || caches.match('./index.html'))));
    return;
  }
  // o resto, dados incluídos: cache primeiro dentro de um deploy (o cache tem o nome do commit)
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(new Request(e.request, { cache: 'no-cache' }))
    .then((res) => { if (res.ok && res.type !== 'opaque') guarda(e, e.request, res.clone()); return res; })
    .catch(() => fetch(e.request, { cache: 'force-cache' }))));
});
