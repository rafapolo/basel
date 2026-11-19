// Service worker do site publicado (mesmo desenho do ../cantography/sw.js, com uma diferença: os dados).
//  - código e página: cache com o nome do commit (script/build.js troca 'basel-dev'), refeito a cada deploy
//  - dados (docs/data): cache à parte, com chave pelo hash do conteúdo de cada arquivo (HASH, escrito pelo build).
//    Um deploy que só muda código não faz quem volta baixar de novo os ~2,7 MB de malhas e mapas.
const V = 'basel-dev';
const D = 'basel-dados';
const HASH = {}; // 'data/arquivo' → hash do conteúdo
const ABERTURA = []; // dados que a abertura sempre pede (pré-carregados na instalação)
const CODIGO = ['./', './index.html'];

const base = () => new URL(self.registration.scope).pathname;
const chaveDado = (rel) => `${base()}${rel}?h=${HASH[rel]}`;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(Promise.all([
    // por cima do cache HTTP (max-age=600 no Pages): senão uma visita de minutos antes do deploy enche o cache novo de velhos
    caches.open(V).then((c) => c.addAll(CODIGO.map((u) => new Request(u, { cache: 'reload' })))).catch(() => {}),
    caches.open(D).then(async (c) => {
      for (const rel of ABERTURA) {
        if (await c.match(chaveDado(rel))) continue; // já está, com o mesmo conteúdo
        const r = await fetch(rel, { cache: 'reload' }).catch(() => null);
        if (r && r.ok) await c.put(chaveDado(rel), r);
      }
    }).catch(() => {}),
  ]));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== V && k !== D) await caches.delete(k);
    // dados: fica só a versão atual de cada arquivo
    const c = await caches.open(D), validas = new Set(Object.keys(HASH).map(chaveDado));
    for (const req of await c.keys()) if (!validas.has(new URL(req.url).pathname + new URL(req.url).search)) await c.delete(req);
  })());
  self.clients.claim();
});

const guarda = (e, cache, chave, res) => e.waitUntil(caches.open(cache).then((c) => c.put(chave, res)).catch(() => {}));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // data.bs.ch (temperatura do Reno) segue o cache HTTP dela
  if (e.request.mode === 'navigate') { // página: rede primeiro, para o deploy aparecer na hora
    e.respondWith(fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'manual' })
      .then((res) => { if (res.ok) guarda(e, V, e.request, res.clone()); return res; })
      .catch(() => caches.match(e.request).then((h) => h || caches.match('./index.html'))));
    return;
  }
  const rel = url.pathname.slice(base().length);
  if (HASH[rel] && !url.search) { // dado conhecido: cache pelo conteúdo, vale entre deploys
    const chave = chaveDado(rel);
    e.respondWith(caches.open(D).then((c) => c.match(chave)).then((hit) => hit || fetch(new Request(e.request, { cache: 'no-cache' }))
      .then((res) => { if (res.ok) guarda(e, D, chave, res.clone()); return res; })));
    return;
  }
  // código e o resto: cache primeiro dentro de um deploy
  e.respondWith(caches.match(e.request, { cacheName: V }).then((hit) => hit || fetch(new Request(e.request, { cache: 'no-cache' }))
    .then((res) => { if (res.ok && res.type !== 'opaque') guarda(e, V, e.request, res.clone()); return res; })
    .catch(() => fetch(e.request, { cache: 'force-cache' }))));
});
