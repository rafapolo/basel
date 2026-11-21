// Muralha de Basel como era antes de 1860 (data/muralha.json, script/muralha.py): a externa de Grossbasel (1361–1400,
// ~4 km, ainda de pé o Spalentor, o St. Johanns-Tor e o St. Alban-Tor) e a de Kleinbasel (c. 1270). Os quatro portões
// que sumiram (Steinentor, Aeschentor, Riehentor e Bläsitor) voltam como torres altas com arco de passagem; nos três
// que existem a muralha só se abre (eles já estão no modelo). Pano de pedra de ~8 m com ameias, torres quadradas com
// telhado de telha a cada ~75 m. Uma malha só para o pano, uma para os telhados; liga e desliga no painel.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ALT = 8, ESP = 1.7, AMEIA = 1.1, PASSO_AMEIA = 2.4, TORRE_CADA = 75;

export async function criarMuralha({ cena, altura, dentro = () => true, ponte = null, base = 'data/' }) {
  const M = await fetch(base + 'muralha.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!M) return null;
  // chão: o relevo fino no recorte; fora dele (St. Johann) o campo do fundo (fundo.js, a −6 m), onde a muralha pousa
  const chao = (x, z) => (dentro(x, z) ? altura(x, z) : -6);
  const pedra = [], telha = [], escuro = [];
  const cor = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const tom = (k) => new THREE.Color().setRGB(0.66 + 0.06 * k, 0.6 + 0.05 * k, 0.5 + 0.04 * k); // calcário cinza-bege, pedra a pedra
  const hs = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  // caixa de comprimento L, centrada em (x, z), virada para o rumo a, do chão y0 até y1
  const caixa = (L, e, x, z, a, y0, y1, lista, c) => {
    const g = new THREE.BoxGeometry(L, y1 - y0, e); g.rotateY(-a); g.translate(x, (y0 + y1) / 2, z); lista.push(cor(g, c)); };
  const telhado = (w, d, x, z, a, y, h) => { // pirâmide de quatro águas
    const g = new THREE.ConeGeometry(Math.SQRT1_2 * Math.max(w, d) * 1.08, h, 4, 1); g.rotateY(Math.PI / 4 - a); g.scale(1, 1, d / w); g.translate(x, y + h / 2, z);
    telha.push(cor(g, new THREE.Color('#8a3d2c'))); };

  // portões: os perdidos viram torre; todos abrem um vão na muralha
  const portoes = M.portoes.map((p) => ({ ...p, y: chao(p.x, p.z, p.y) }));
  const vao = (x, z) => portoes.some((p) => Math.hypot(p.x - x, p.z - z) < (p.existe ? 9 : 5.5));

  let iTorre = 0;
  for (const linha of M.linhas) {
    // alisa os cotovelos do traçado (uma passada de Chaikin) e corta em pedaços de até 4 m, cada um no chão do seu meio
    let pts = linha;
    { const s = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]]; s.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25, a[2] * 0.75 + b[2] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75, a[2] * 0.25 + b[2] * 0.75]); } s.push(pts.at(-1)); pts = s; }
    let percorrido = 0, proxTorre = 30;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az, ay] = pts[i], [bx, bz, by] = pts[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 0.3) continue;
      const a = Math.atan2(bz - az, bx - ax), n = Math.ceil(L / 4);
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n, tm = (t0 + t1) / 2, x = ax + (bx - ax) * tm, z = az + (bz - az) * tm, l = L / n;
        if (vao(x, z)) continue;
        const y = Math.min(chao(ax + (bx - ax) * t0, az + (bz - az) * t0, ay + (by - ay) * t0), chao(ax + (bx - ax) * t1, az + (bz - az) * t1, ay + (by - ay) * t1));
        caixa(l + 0.05, ESP, x, z, a, y - 1.5, y + ALT, pedra, tom(hs(i * 31 + k)));
        // ameias: dentes no lado de fora do caminho de ronda
        for (let m = 0; m < l / PASSO_AMEIA; m++) {
          const tt = t0 + ((m + 0.25) * PASSO_AMEIA / L), mx = ax + (bx - ax) * tt, mz = az + (bz - az) * tt;
          if (tt < t1) caixa(PASSO_AMEIA * 0.5, ESP * 0.5, mx, mz, a, y + ALT, y + ALT + AMEIA, pedra, tom(0.4));
        }
      }
      percorrido += L;
      // torre quadrada a cada ~75 m, meio para fora da muralha
      while (percorrido >= proxTorre) {
        const t = 1 - (percorrido - proxTorre) / L, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        proxTorre += TORRE_CADA * (0.85 + 0.3 * hs(iTorre++));
        if (vao(x, z)) continue;
        const y = chao(x, z, ay + (by - ay) * t), h = ALT + 5 + 3 * hs(iTorre * 7);
        caixa(6, 6, x, z, a, y - 1.5, y + h, pedra, tom(0.2 + 0.5 * hs(iTorre)));
        telhado(6.4, 6.4, x, z, a, y + h, 4.5);
      }
    }
  }
  // portões desenhados (os que sumiram e o St. Johanns-Tor, que fica fora do recorte): torre quadrada com a altura, o lado
  // e o telhado de cada um (muralha.json), arco de passagem nas duas faces, cornija; o Aeschentor com relógio
  const rumoNo = (x, z) => { let best = 1e9, a = 0;
    for (const l of M.linhas) for (let i = 0; i < l.length - 1; i++) {
      const [ax, az] = l[i], [bx, bz] = l[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d < best) { best = d; a = Math.atan2(dz, dx); }
    } return a; };
  const relogio = (x, y, z, a, s, lado) => { // mostrador branco com ponteiros, nas duas faces de fora/dentro
    for (const k of [-1, 1]) {
      const d = new THREE.CircleGeometry(1.5, 20); d.rotateY(k > 0 ? 0 : Math.PI); d.translate(0, 0, k * (lado / 2 + 0.05)); d.rotateY(-a + Math.PI / 2); d.translate(x, y, z); escuro.push(cor(d, new THREE.Color('#f1ece0')));
      for (const [w, h, r] of [[0.12, 1.1, 0.4], [0.1, 0.8, 2.2]]) { const p = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0); p.rotateZ(r); p.rotateY(k > 0 ? 0 : Math.PI); p.translate(0, 0, k * (lado / 2 + 0.08)); p.rotateY(-a + Math.PI / 2); p.translate(x, y, z); escuro.push(cor(p, new THREE.Color('#151515'))); }
    } };
  const lalle = (x, y, z, a, lado) => { // o Lällekönig: cabeça de rei, coroa dourada e a língua de fora, virado para Kleinbasel
    const c = new THREE.SphereGeometry(0.9, 12, 10); c.translate(0, 0, lado / 2 + 0.6); c.rotateY(-a); c.translate(x, y, z); pedra.push(cor(c, new THREE.Color('#d0745a')));
    const co = new THREE.CylinderGeometry(0.75, 0.85, 0.6, 10); co.translate(0, 0.95, lado / 2 + 0.6); co.rotateY(-a); co.translate(x, y, z); telha.push(cor(co, new THREE.Color('#d9b24a')));
    const li = new THREE.BoxGeometry(0.35, 0.12, 0.7); li.translate(0, -0.45, lado / 2 + 1.45); li.rotateY(-a); li.translate(x, y, z); telha.push(cor(li, new THREE.Color('#c8202a')));
  };
  const torreDePortao = ({ x, z, y, h, lado, telhado: tt, extra }, a) => {
    caixa(lado, lado, x, z, a, y - 1.5, y + h, pedra, tom(0.55));
    caixa(lado + 0.6, lado + 0.6, x, z, a, y + h - 0.6, y + h, pedra, tom(0.9)); // cornija
    for (const s of [-1, 1]) { // arco: o vão de passagem, nas duas faces
      const g = new THREE.PlaneGeometry(4, 6), c = new THREE.CircleGeometry(2, 12, 0, Math.PI).translate(0, 3, 0);
      const arco = mergeGeometries([g, c]); arco.translate(0, 3.02, 0);
      arco.rotateY(s > 0 ? 0 : Math.PI); arco.translate(0, 0, s * (lado / 2 + 0.03)); arco.rotateY(-a + Math.PI / 2); arco.translate(x, y, z);
      escuro.push(cor(arco, new THREE.Color('#1c1712')));
    }
    const hr = tt === 'agudo' ? lado * 1.35 : tt === 'quatro' ? lado * 0.6 : lado * 0.9;
    telhado(lado + 0.4, lado + 0.4, x, z, a, y + h, hr);
    if (extra.includes('relogio')) relogio(x, y + h - 5, z, a, 1, lado);
  };
  for (const p of portoes) if (!p.existe) torreDePortao(p, rumoNo(p.x, p.z));
  // torres redondas das pontas (Thomasturm, na beira do Reno em St. Johann): cilindro com telhado cônico
  for (const t of M.torres ?? []) {
    if (t.existe) continue;
    const y = chao(t.x, t.z, t.y), g = new THREE.CylinderGeometry(3.6, 3.9, t.h + 1.5, 16); g.translate(t.x, y - 1.5 + (t.h + 1.5) / 2, t.z); pedra.push(cor(g, tom(0.5)));
    const r = new THREE.ConeGeometry(4.2, 6, 16); r.translate(t.x, y + t.h + 3, t.z); telha.push(cor(r, new THREE.Color('#8a3d2c')));
  }
  // Rheintor: a torre da cabeceira de Grossbasel da Mittlere Brücke (demolida em 1839), com relógio e o Lällekönig
  if (ponte) {
    const { A, B } = ponte, dA = Math.hypot(A[0] + 102, A[1] - 20), dB = Math.hypot(B[0] + 102, B[1] - 20);
    const [g0, g1] = dA < dB ? [A, B] : [B, A], L = Math.hypot(g0[0] - g1[0], g0[1] - g1[1]), ux = (g0[0] - g1[0]) / L, uz = (g0[1] - g1[1]) / L;
    const x = g0[0] + ux * 4, z = g0[1] + uz * 4, a = Math.atan2(uz, ux) + Math.PI / 2, y = chao(x, z, 8);
    torreDePortao({ x, z, y, h: 26, lado: 8, telhado: 'agudo', extra: 'relogio' }, a);
    lalle(x, y + 15, z, -Math.atan2(-ux, -uz), 8); // de frente para a ponte, mostrando a língua a Kleinbasel
  }
  const grupo = new THREE.Group(); grupo.name = 'muralha';
  const mk = (lista, mat) => { if (!lista.length) return; const g = mergeGeometries(lista.map((x) => x.index ? x.toNonIndexed() : x)); g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; grupo.add(m); };
  mk(pedra, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  mk(telha, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }));
  mk(escuro, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  cena.add(grupo);
  return { grupo, ligar: (on) => { grupo.visible = on; }, portoes: M.portoes };
}
