// Muralha de Basel como era antes de 1860 (data/muralha.json, script/muralha.py): a externa de Grossbasel (1361–1400,
// ~4 km, ainda de pé o Spalentor, o St. Johanns-Tor e o St. Alban-Tor) e a de Kleinbasel (c. 1270). Os quatro portões
// que sumiram (Steinentor, Aeschentor, Riehentor e Bläsitor) voltam como torres altas com arco de passagem; nos três
// que existem a muralha só se abre (eles já estão no modelo). Pano de pedra de ~8 m com ameias, torres quadradas com
// telhado de telha a cada ~75 m. Uma malha só para o pano, uma para os telhados; liga e desliga no painel.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ALT = 8, ESP = 1.7, AMEIA = 1.1, PASSO_AMEIA = 2.4, TORRE_CADA = 75;

export async function criarMuralha({ cena, altura, base = 'data/' }) {
  const M = await fetch(base + 'muralha.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!M) return null;
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
  const portoes = M.portoes.map((p) => ({ ...p, y: altura(p.x, p.z) }));
  const vao = (x, z) => portoes.some((p) => Math.hypot(p.x - x, p.z - z) < (p.existe ? 9 : 5.5));

  let iTorre = 0;
  for (const linha of M.linhas) {
    // alisa os cotovelos do traçado (uma passada de Chaikin) e corta em pedaços de até 4 m, cada um no chão do seu meio
    let pts = linha;
    { const s = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]]; s.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } s.push(pts.at(-1)); pts = s; }
    let percorrido = 0, proxTorre = 30;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 0.3) continue;
      const a = Math.atan2(bz - az, bx - ax), n = Math.ceil(L / 4);
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n, tm = (t0 + t1) / 2, x = ax + (bx - ax) * tm, z = az + (bz - az) * tm, l = L / n;
        if (vao(x, z)) continue;
        const y = Math.min(altura(ax + (bx - ax) * t0, az + (bz - az) * t0), altura(ax + (bx - ax) * t1, az + (bz - az) * t1));
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
        const y = altura(x, z), h = ALT + 5 + 3 * hs(iTorre * 7);
        caixa(6, 6, x, z, a, y - 1.5, y + h, pedra, tom(0.2 + 0.5 * hs(iTorre)));
        telhado(6.4, 6.4, x, z, a, y + h, 4.5);
      }
    }
  }
  // portões perdidos: torre de ~9 × 9 m e 26–30 m, arco de passagem nas duas faces, telhado alto
  for (const p of portoes) {
    if (p.existe) continue;
    // rumo da muralha no portão: o pedaço de linha mais perto
    let best = 1e9, a = 0;
    for (const l of M.linhas) for (let i = 0; i < l.length - 1; i++) {
      const [ax, az] = l[i], [bx, bz] = l[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / L2)), d = Math.hypot(ax + dx * t - p.x, az + dz * t - p.z);
      if (d < best) { best = d; a = Math.atan2(dz, dx); }
    }
    const h = 24 + 4 * hs(p.x), y = p.y;
    caixa(9, 9, p.x, p.z, a, y - 1.5, y + h, pedra, tom(0.55));
    caixa(9.6, 9.6, p.x, p.z, a, y + h - 0.6, y + h, pedra, tom(0.9)); // cornija
    // arco: escuro de 4 m × 6 m nas duas faces (o vão de passagem), com a ponta redonda
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(4, 6); const c = new THREE.CircleGeometry(2, 12, 0, Math.PI).translate(0, 3, 0);
      const arco = mergeGeometries([g.translate(0, 0, 0), c]); arco.translate(0, 3 + 0.02, 0);
      arco.rotateY(s > 0 ? 0 : Math.PI); arco.translate(0, 0, s * 4.53); arco.rotateY(-a + Math.PI / 2); arco.translate(p.x, y, p.z);
      escuro.push(cor(arco, new THREE.Color('#1c1712')));
    }
    telhado(9.4, 9.4, p.x, p.z, a, y + h, 9);
  }
  const grupo = new THREE.Group(); grupo.name = 'muralha';
  const mk = (lista, mat) => { if (!lista.length) return; const g = mergeGeometries(lista.map((x) => x.index ? x.toNonIndexed() : x)); g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; grupo.add(m); };
  mk(pedra, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  mk(telha, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }));
  mk(escuro, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  cena.add(grupo);
  return { grupo, ligar: (on) => { grupo.visible = on; }, portoes: M.portoes };
}
