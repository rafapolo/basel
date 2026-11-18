// Marcos em alta definição (tarefa 18): Münster, Rathaus, Mittlere Brücke (arcos e Käppelijoch) e as igrejas de
// São Martinho, São Pedro e São Leonardo. Modelagem própria, procedural, no estilo do resto (sem arquivo externo,
// sem licença de terceiros). A geometria vem de duas fontes, ambas do swissBUILDINGS3D / OSM já no projeto:
//   - Münster: reconstruído do zero (planta e alturas lidas do LOD2 do mesmo EGID 243009807);
//   - Rathaus e igrejas: os triângulos do LOD2 do mesmo EGID são copiados para uma malha nova com material de pedra/
//     pintura, e as torres (blocos do LOD2) são trocadas por torres com fuste, galeria, tambor e flecha;
//   - Mittlere Brücke: arcos extrudados ao longo do eixo da ponte do OSM (way "Mittlere Rheinbrücke").
// Os triângulos originais desses prédios são colapsados em cidade.js (esconde()), então ficha, ano e máquina do tempo
// continuam valendo: o grupo de cada marco sobe no mesmo ano do prédio (id do predios.json) e responde ao clique.
// Materiais (design/realismo-tocador-sim.md): MeshStandardMaterial com roughnessMap de ruído de valor em duas oitavas,
// envMap (PMREM de estúdio neutro) só no telhado vidrado do Münster e no ouro.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const SRGB = THREE.SRGBColorSpace;
const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---------- texturas procedurais ----------
function tex(w, h, desenha, cor = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  desenha(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (cor) t.colorSpace = SRGB;
  return t;
}
// ruído de valor em duas oitavas, ladrilhável (roughnessMap: quebra o aspecto de plástico liso)
function ruido(tam = 128) {
  const r = mulberry(7), grade = (n) => Float32Array.from({ length: n * n }, r);
  const g1 = grade(8), g2 = grade(32);
  const amostra = (g, n, x, y) => {
    const fx = (x / tam) * n, fy = (y / tam) * n, i = Math.floor(fx), j = Math.floor(fy);
    const u = fx - i, v = fy - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const G = (a, b) => g[(((b % n) + n) % n) * n + (((a % n) + n) % n)];
    return (G(i, j) * (1 - su) + G(i + 1, j) * su) * (1 - sv) + (G(i, j + 1) * (1 - su) + G(i + 1, j + 1) * su) * sv;
  };
  return tex(tam, tam, (g, w, h) => {
    const im = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = 0.62 + 0.38 * (0.65 * amostra(g1, 8, x, y) + 0.35 * amostra(g2, 32, x, y));
      const k = (y * w + x) * 4; im.data[k] = im.data[k + 1] = im.data[k + 2] = Math.round(v * 255); im.data[k + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  }, false);
}
const sombra = (hex, f) => { const c = new THREE.Color(hex); c.multiplyScalar(f); return `#${c.getHexString()}`; };
// pedra aparelhada em fiadas de 0,45 m; janela ogival opcional (célula cw x ch metros)
function texPedra({ cw, ch, cor, janela, seed = 1 }) {
  const ppm = 48, W = Math.round(cw * ppm), H = Math.round(ch * ppm);
  return tex(W, H, (g) => {
    const r = mulberry(seed), fiada = 0.45 * ppm;
    g.fillStyle = sombra(cor, 0.82); g.fillRect(0, 0, W, H);
    for (let y = 0, k = 0; y < H; y += fiada, k++) {
      let x = -r() * 40;
      while (x < W) {
        const l = (0.8 + r() * 0.9) * ppm, f = 0.9 + r() * 0.2, m = (r() - 0.5) * 0.06;
        g.fillStyle = sombra(cor, f * (1 + m)); g.fillRect(x + 1, y + 1, l - 2, fiada - 2);
        x += l;
      }
    }
    // manchas finas de pátina
    for (let i = 0; i < W * H / 90; i++) { g.fillStyle = `rgba(40,25,15,${r() * 0.05})`; g.fillRect(r() * W, r() * H, 2 + r() * 5, 2 + r() * 5); }
    if (janela) {
      const cx = W / 2, l = 0.55 * ppm, y0 = H - 0.32 * H, y1 = H - 0.72 * H;
      const arco = (dx, cor2) => {
        g.fillStyle = cor2; g.beginPath(); g.moveTo(cx - l - dx, y0 + dx);
        g.lineTo(cx - l - dx, y1); g.quadraticCurveTo(cx - l - dx, y1 - 0.7 * ppm - dx, cx, y1 - 1.5 * ppm - dx);
        g.quadraticCurveTo(cx + l + dx, y1 - 0.7 * ppm - dx, cx + l + dx, y1); g.lineTo(cx + l + dx, y0 + dx); g.closePath(); g.fill();
      };
      arco(4, sombra(cor, 1.18)); arco(0, '#2b3238');
      g.fillStyle = sombra(cor, 1.1); g.fillRect(cx - 2, y1 - 1.4 * ppm, 4, y0 - y1 + 1.4 * ppm);
      g.fillRect(cx - l, y1 + 0.2 * ppm, 2 * l, 3);
    }
  });
}
// parede pintada do Rathaus: vermelho com manchas, faixa de andar e janelas de moldura clara (célula 3,6 x 4,2 m)
function texRathaus() {
  const ppm = 64, W = Math.round(3.6 * ppm), H = Math.round(4.2 * ppm);
  return tex(W, H, (g) => {
    const r = mulberry(3);
    g.fillStyle = '#a2392d'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2400; i++) { g.fillStyle = `rgba(${r() > 0.5 ? '255,200,160' : '60,10,5'},${r() * 0.07})`; g.fillRect(r() * W, r() * H, 3 + r() * 14, 3 + r() * 10); }
    g.fillStyle = '#d4b878'; g.fillRect(0, H - 14, W, 14); g.fillStyle = '#7f261e'; g.fillRect(0, H - 17, W, 3);
    const cx = W / 2, jw = 1.0 * ppm, jh = 1.9 * ppm, jy = 0.8 * ppm;
    g.fillStyle = '#dccfa8'; g.fillRect(cx - jw / 2 - 8, jy - 8, jw + 16, jh + 16);
    g.fillStyle = '#2d3640'; g.fillRect(cx - jw / 2, jy, jw, jh);
    g.fillStyle = '#dccfa8'; g.fillRect(cx - 2, jy, 4, jh); g.fillRect(cx - jw / 2, jy + jh * 0.35, jw, 4);
    g.fillStyle = '#c9ba92'; g.fillRect(cx - jw / 2 - 14, jy + jh + 8, jw + 28, 7);
    g.strokeStyle = 'rgba(235,220,185,0.55)'; g.lineWidth = 2; g.strokeRect(6, 6, W - 12, H - 12);
  });
}
// telha vidrada do Münster: losangos concêntricos amarelo, vermelho, verde, preto; telhas de 8 px
function texTelhaVidrada() {
  const N = 256, paleta = ['#c9a844', '#8f3a2a', '#3d6a52', '#2b2a2d', '#3d6a52', '#8f3a2a'];
  return tex(N, N, (g) => {
    const r = mulberry(5);
    for (let y = 0; y < N; y += 8) for (let x = 0; x < N; x += 8) {
      const d = Math.abs(x + 4 - N / 2) + Math.abs(y + 4 - N / 2), k = Math.floor(d / 18) % paleta.length;
      g.fillStyle = sombra(paleta[k], 0.9 + r() * 0.2); g.fillRect(x, y, 8, 8);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + 7, 8, 1); g.fillRect(x + 7, y, 1, 8);
    }
  });
}
function texTelha(cor, seed = 2) {
  return tex(128, 128, (g) => {
    const r = mulberry(seed);
    for (let y = 0; y < 128; y += 8) for (let x = 0; x < 128; x += 8) {
      g.fillStyle = sombra(cor, 0.85 + r() * 0.3); g.fillRect(x + ((y / 8) % 2) * 4 - 4, y, 8, 8);
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, y + 7, 8, 1);
    }
  });
}
function texRelogio() {
  return tex(128, 128, (g) => {
    g.fillStyle = '#e8dcb4'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
    g.strokeStyle = '#b08a2a'; g.lineWidth = 6; g.stroke();
    g.strokeStyle = '#2b2218'; g.lineWidth = 3;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; g.beginPath(); g.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50); g.lineTo(64 + Math.sin(a) * 58, 64 - Math.cos(a) * 58); g.stroke(); }
    g.lineWidth = 5; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 24); g.stroke(); g.beginPath(); g.moveTo(64, 64); g.lineTo(88, 74); g.stroke();
  });
}
function texRosace() {
  return tex(256, 256, (g) => {
    g.fillStyle = '#7f3a2a'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#243040'; g.beginPath(); g.arc(128, 128, 118, 0, 7); g.fill();
    const cores = ['#c0392b', '#e3b341', '#2f6fa3', '#3d8b5f'];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * 6.283; g.fillStyle = cores[i % 4];
      g.beginPath(); g.arc(128 + Math.cos(a) * 70, 128 + Math.sin(a) * 70, 22, 0, 7); g.fill();
    }
    g.fillStyle = '#e3b341'; g.beginPath(); g.arc(128, 128, 26, 0, 7); g.fill();
    g.strokeStyle = '#d9c9a0'; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 112, 0, 7); g.stroke(); g.beginPath(); g.arc(128, 128, 40, 0, 7); g.stroke();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * 6.283; g.beginPath(); g.moveTo(128 + Math.cos(a) * 40, 128 + Math.sin(a) * 40); g.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); g.stroke(); }
  });
}

// ---------- geometria ----------
// quadro local do marco: origem (ox, oz), eixo a = (cos ang, sin ang) no plano XZ, b = perpendicular, y = absoluto
const quadro = (ox, oz, ang) => new THREE.Matrix4().set(
  Math.cos(ang), 0, -Math.sin(ang), ox,
  0, 1, 0, 0,
  Math.sin(ang), 0, Math.cos(ang), oz,
  0, 0, 0, 1);

// UVs em metros: parede pela tangente do plano (continua ao longo da parede), topo por x,z. sx, sy = metros por repetição
function uvMetros(g, sx = 4, sy = 4) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.attributes.position, uv = new Float32Array(p.count * 2), n = new Float32Array(p.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nm = new THREE.Vector3();
  for (let t = 0; t < p.count; t += 3) {
    a.fromBufferAttribute(p, t); b.fromBufferAttribute(p, t + 1); c.fromBufferAttribute(p, t + 2);
    nm.copy(b).sub(a).cross(c.clone().sub(a)).normalize();
    for (let k = 0; k < 3; k++) {
      const x = p.getX(t + k), y = p.getY(t + k), z = p.getZ(t + k);
      if (Math.abs(nm.y) > 0.6) { uv[(t + k) * 2] = x / sx; uv[(t + k) * 2 + 1] = z / sx; }
      else { const h = Math.hypot(nm.x, nm.z) || 1; uv[(t + k) * 2] = (x * -nm.z + z * nm.x) / h / sx; uv[(t + k) * 2 + 1] = y / sy; }
      n[(t + k) * 3] = nm.x; n[(t + k) * 3 + 1] = nm.y; n[(t + k) * 3 + 2] = nm.z;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return g;
}
const limpa = (g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; };

class Marco {
  constructor(m) { this.m = m; this.partes = {}; }
  // g em coordenadas locais (a,y,b); `mat` é o nome do material; `uvPronto` se g já traz uv
  add(mat, g, { uvPronto = false, sx = 4, sy = 4 } = {}) {
    g.applyMatrix4(this.m);
    g = limpa(g);
    if (!uvPronto) g = uvMetros(g, sx, sy);
    else g.computeVertexNormals();
    (this.partes[mat] ??= []).push(g);
  }
  caixa(mat, a0, a1, b0, b1, y0, y1, o) {
    const g = new THREE.BoxGeometry(a1 - a0, y1 - y0, b1 - b0).translate((a0 + a1) / 2, (y0 + y1) / 2, (b0 + b1) / 2);
    this.add(mat, g, o);
  }
  // prisma regular (n lados) ou cone/tronco, eixo vertical em (ca, cb)
  tronco(mat, ca, cb, r0, r1, y0, y1, n, rot = 0, o) {
    const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, n, 1, false).rotateY(rot).translate(ca, (y0 + y1) / 2, cb);
    this.add(mat, g, o);
  }
  // plano de telhado por 4 cantos locais (a,y,b); UV ao longo da cumeeira e da inclinação
  plano(mat, p, esc = 6) {
    const [A, B, C, D] = p.map((q) => new THREE.Vector3(...q));
    const ab = B.clone().sub(A), ad = D.clone().sub(A);
    const pos = [], uv = [];
    const V = (q, u, v) => { pos.push(q.x, q.y, q.z); uv.push(u, v); };
    const lu = ab.length() / esc, lv = ad.length() / esc;
    V(A, 0, 0); V(B, lu, 0); V(C, lu, lv); V(A, 0, 0); V(C, lu, lv); V(D, 0, lv);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    // normal para cima
    if (g.attributes.normal.getY(0) < 0) { const q = g.attributes.position.array; for (let i = 0; i < q.length; i += 9) for (let k = 0; k < 3; k++) { const t = q[i + 3 + k]; q[i + 3 + k] = q[i + 6 + k]; q[i + 6 + k] = t; } const u = g.attributes.uv.array; for (let i = 0; i < u.length; i += 6) { for (let k = 0; k < 2; k++) { const t = u[i + 2 + k]; u[i + 2 + k] = u[i + 4 + k]; u[i + 4 + k] = t; } } g.computeVertexNormals(); }
    this.add(mat, g, { uvPronto: true });
  }
  // telhado de duas águas: eixo da cumeeira em a (a0..a1), largura b0..b1; frontões em pedra
  duasAguas(matT, matP, a0, a1, b0, b1, yBeiral, yCumeeira, beiral = 0.5, esc = 6) {
    const bm = (b0 + b1) / 2, bb0 = b0 - beiral, bb1 = b1 + beiral;
    const k = (yCumeeira - yBeiral) / ((b1 - b0) / 2), yb = yBeiral - beiral * k;
    this.plano(matT, [[a0 - 0.3, yb, bb0], [a1 + 0.3, yb, bb0], [a1 + 0.3, yCumeeira, bm], [a0 - 0.3, yCumeeira, bm]], esc);
    this.plano(matT, [[a1 + 0.3, yb, bb1], [a0 - 0.3, yb, bb1], [a0 - 0.3, yCumeeira, bm], [a1 + 0.3, yCumeeira, bm]], esc);
    for (const a of [a0, a1]) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([a, yBeiral, b0, a, yBeiral, b1, a, yCumeeira, bm], 3));
      g.computeVertexNormals(); this.add(matP, g, { sx: 4 });
    }
  }
  // água única (aba): baixa em b = bBaixo (yBaixo), alta em bAlto (yAlto)
  aba(mat, a0, a1, bBaixo, bAlto, yBaixo, yAlto, esc = 6) {
    this.plano(mat, [[a0, yBaixo, bBaixo], [a1, yBaixo, bBaixo], [a1, yAlto, bAlto], [a0, yAlto, bAlto]], esc);
  }
  junta(materiais) {
    const g = new THREE.Group();
    for (const [nome, lista] of Object.entries(this.partes)) {
      if (!lista.length) continue;
      const geo = mergeGeometries(lista, false);
      const mesh = new THREE.Mesh(geo, materiais[nome]);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
    }
    return g;
  }
}

export function criarMarcos({ renderer, cena, meta, posicoes, ids16, altura, nivelReno, U }) {
  const P = meta.predios;
  const RUG = ruido();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const ENV = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const std = (map, o = {}) => new THREE.MeshStandardMaterial({ map, roughness: 1, roughnessMap: RUG, metalness: 0.02, ...o });

  const mats = {
    pedraM: std(texPedra({ cw: 4, ch: 4, cor: '#a9553c', seed: 11 })),
    pedraMJ: std(texPedra({ cw: 4, ch: 11, cor: '#a9553c', janela: true, seed: 12 })),
    pedraMTorre: std(texPedra({ cw: 4, ch: 12, cor: '#a54f38', janela: true, seed: 13 })),
    telhaV: std(texTelhaVidrada(), { roughness: 0.35, roughnessMap: RUG, metalness: 0.1, envMap: ENV, envMapIntensity: 0.9 }),
    telhaM: std(texTelha('#8b4a35')),
    rosace: std(texRosace(), { roughness: 0.4, envMap: ENV, envMapIntensity: 0.6 }),
    rathaus: std(texRathaus()),
    telhaR: std(texTelha('#8d4a34', 4)),
    pedraN: std(texPedra({ cw: 4, ch: 4, cor: '#b98a68', seed: 21 })),
    pedraNJ: std(texPedra({ cw: 4, ch: 12, cor: '#b98a68', janela: true, seed: 22 })),
    pedraL: std(texPedra({ cw: 4, ch: 4, cor: '#b99a7a', seed: 23 })),
    pedraLJ: std(texPedra({ cw: 4, ch: 12, cor: '#b99a7a', janela: true, seed: 24 })),
    telhaI: std(texTelha('#7c4634', 6)),
    ponte: std(texPedra({ cw: 4, ch: 4, cor: '#a39482', seed: 31 })),
    flecha: std(texTelha('#6c3a2e', 8)),
    ouro: new THREE.MeshStandardMaterial({ color: 0xc9a13b, roughness: 0.3, metalness: 0.85, envMap: ENV, envMapIntensity: 1.1 }),
    relogio: new THREE.MeshStandardMaterial({ map: texRelogio(), roughness: 0.4, metalness: 0.2, envMap: ENV, envMapIntensity: 0.5 }),
  };
  for (const k of ['rathaus', 'telhaR', 'telhaI', 'pedraN', 'pedraNJ', 'pedraL', 'pedraLJ', 'flecha']) mats[k].side = THREE.DoubleSide; // o LOD2 tem triângulos com giro invertido
  const raiz = new THREE.Group();
  raiz.name = 'marcos';
  cena.add(raiz);
  const lista = []; // {grupo, pid, ano, base}

  const triangulos = (ids) => {
    const alvo = new Set(ids), out = [];
    for (let t = 0; t < meta.n_tris; t++) if (alvo.has(ids16[t * 3])) out.push(t);
    return out;
  };
  const tri = (t) => [0, 1, 2].map((k) => new THREE.Vector3(posicoes[t * 9 + k * 3], posicoes[t * 9 + k * 3 + 1], posicoes[t * 9 + k * 3 + 2]));
  const yMin = (ts) => Math.min(...ts.flatMap((t) => [1, 4, 7].map((k) => posicoes[t * 9 + k])));

  // copia os triângulos do LOD2 (já em mundo) para uma malha nova, sem os blocos de torre; paredes e telhados em materiais próprios
  function recapeia(m, ts, tirar, matP, matT, sxP = 4, syP = 4) {
    const par = [], tel = [];
    for (const t of ts) {
      const [a, b, c] = tri(t);
      if (tirar && [a, b, c].every(tirar)) continue;
      const n = b.clone().sub(a).cross(c.clone().sub(a)); if (n.lengthSq() < 1e-9) continue; n.normalize();
      (Math.abs(n.y) > 0.35 ? tel : par).push(a, b, c);
    }
    const mk = (v) => { const g = new THREE.BufferGeometry().setFromPoints(v); return g; };
    if (par.length) { (m.mundo[matP] ??= []).push(uvMetros(mk(par), sxP, syP)); }
    if (tel.length) { const g = uvMetros(mk(tel), 5, 5); (m.mundo[matT] ??= []).push(g); }
  }
  // torre com fuste, galeria, tambor octogonal e flecha (coordenadas de mundo; ang = giro do quadrado)
  function torre(m, { cx, cz, ang, s, y0, yFuste, yTambor, yTopo, matF, matS, relogio = 0, sx = 4 }) {
    const q = quadro(cx, cz, ang);
    const t = new Marco(q);
    t.caixa(matF, -s / 2, s / 2, -s / 2, s / 2, y0 - 3, yFuste, { sx, sy: 12 });
    t.caixa(matF, -s / 2 - 0.4, s / 2 + 0.4, -s / 2 - 0.4, s / 2 + 0.4, yFuste - 0.5, yFuste + 0.3, { sx });
    for (const [da, db] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) t.tronco(matS, da * s / 2, db * s / 2, 0.55, 0.0, yFuste + 0.3, yFuste + 3.2, 4, Math.PI / 4);
    t.tronco(matF, 0, 0, s * 0.43, s * 0.4, yFuste + 0.3, yTambor, 8, Math.PI / 8, { sx, sy: 6 });
    t.tronco(matS, 0, 0, s * 0.5, 0.0, yTambor, yTopo, 8, Math.PI / 8, { sx: 6, sy: 6 });
    t.tronco('ouro', 0, 0, 0.5, 0.5, yTopo - 0.4, yTopo + 0.9, 8);
    if (relogio) for (let k = 0; k < 4; k++) {
      const g = new THREE.CircleGeometry(relogio, 24); g.rotateY(k * Math.PI / 2);
      const [da, db] = [[0, 1], [1, 0], [0, -1], [-1, 0]][k];
      g.translate(da * (s / 2 + 0.06), yFuste - 5, db * (s / 2 + 0.06)); g.rotateY(0);
      t.add('relogio', g, { uvPronto: true });
    }
    for (const [nome, ls] of Object.entries(t.partes)) for (const g of ls) (m.mundo[nome] ??= []).push(g);
  }
  const SEM = { pedraM: 'pedraM' };

  function fecha(m, nome, pid, ocultar) {
    const grupo = new THREE.Group();
    const mats2 = { ...mats };
    const ver = [];
    for (const [k, ls] of Object.entries(m.mundo)) {
      const geo = mergeGeometries(ls.map(limpa), false); geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mats2[k]);
      mesh.castShadow = mesh.receiveShadow = true; mesh.userData.pid = pid;
      grupo.add(mesh); ver.push(mesh);
    }
    grupo.name = nome;
    raiz.add(grupo);
    const ano = P[pid]?.ano ?? null;
    const y = m.y0 ?? 0;
    lista.push({ grupo, pid, ano, base: y, nome });
    return grupo;
  }
  const novo = () => ({ mundo: {}, y0: 0 });
  // junta partes de um Marco (já em mundo) no objeto de mundo
  const empurra = (m, marco) => { for (const [k, ls] of Object.entries(marco.partes)) for (const g of ls) (m.mundo[k] ??= []).push(g); };

  // =====================================================================================================
  // Münster (EGID 243009807, sólido 1872). Eixo a: oeste → leste (-34°); origem entre as torres da fachada.
  // =====================================================================================================
  {
    const ang = Math.atan2(-0.559, 0.829);
    const q = quadro(197.3, 226.3, -ang * 0 + ang);
    const y0 = 22.28;
    const m = novo(); m.y0 = y0;
    const mk = new Marco(q);
    const yb = y0 - 3;
    // nave central, naves laterais e fachada oeste entre as torres
    mk.caixa('pedraMJ', 3.5, 37, -7.6, 7.6, yb, y0 + 22, { sx: 4, sy: 11 });
    mk.caixa('pedraMJ', 3.5, 37, -16.6, -7.4, yb, y0 + 11, { sx: 4, sy: 11 });
    mk.caixa('pedraMJ', 3.5, 37, 7.4, 16.6, yb, y0 + 11, { sx: 4, sy: 11 });
    mk.caixa('pedraM', -4.4, 4, -16.6, 16.6, yb, y0 + 20, { sx: 4, sy: 4 });
    // cruzeiro e coro
    mk.caixa('pedraMJ', 37, 52, -7.6, 7.6, yb, y0 + 22, { sx: 4, sy: 11 });
    mk.caixa('pedraMJ', 37, 47, -19.5, 19.5, yb, y0 + 15, { sx: 4, sy: 11 });
    mk.caixa('pedraMJ', 52, 58, -9.5, 9.5, yb, y0 + 14, { sx: 4, sy: 11 });
    // abside poligonal (7 lados)
    mk.tronco('pedraMJ', 58, 0, 9.5, 9.5, yb, y0 + 14, 7, -Math.PI / 2 * 0 + Math.PI / 7 * 0.5, { sx: 4, sy: 11 });
    // coberturas
    mk.duasAguas('telhaV', 'pedraM', 3.5, 52.5, -7.6, 7.6, y0 + 22, y0 + 33, 0.5, 6);
    mk.aba('telhaM', 3.5, 37, -16.9, -7.6, y0 + 11, y0 + 17.5);
    mk.aba('telhaM', 3.5, 37, 16.9, 7.6, y0 + 11, y0 + 17.5);
    mk.duasAguas('telhaV', 'pedraM', 37, 47, -19.5, 19.5, y0 + 15, y0 + 28, 0.5, 6);
    mk.duasAguas('telhaM', 'pedraM', 52, 58, -9.5, 9.5, y0 + 14, y0 + 24, 0.4, 6);
    mk.tronco('telhaM', 58, 0, 9.6, 0.2, y0 + 14, y0 + 24, 7, Math.PI / 7 * 0.5);
    // contrafortes ao longo das naves laterais
    for (let a = 8; a < 36; a += 5.8) for (const b of [-17.2, 17.2]) mk.caixa('pedraM', a - 0.6, a + 0.6, b - 0.6, b + 0.6, yb, y0 + 13, { sx: 2 });
    // rosácea e portal da fachada oeste (entre as torres, voltada para -a)
    {
      const g = new THREE.CircleGeometry(3.6, 32).rotateY(-Math.PI / 2).translate(-4.5, y0 + 15, 0);
      mk.add('rosace', g, { uvPronto: true });
      mk.caixa('pedraM', -4.9, -4.4, -2.6, 2.6, y0, y0 + 8, { sx: 2 });
    }
    // Kreuzgang e capelas: anel baixo a sudeste (b > 17)
    for (const [a0, a1, b0, b1] of [[40, 68, 17, 23], [40, 68, 36, 42], [40, 46, 17, 42], [62, 68, 17, 42]]) mk.caixa('pedraM', a0, a1, b0, b1, yb, y0 + 7.5, { sx: 4 });
    mk.caixa('pedraM', 40, 68, 17, 42, y0 + 7.4, y0 + 7.6, { sx: 4 });
    // torres: fuste 28 m, tambor, flecha (topo 68,5 m acima do chão: igual ao LOD2)
    empurra(m, mk);
    for (const b of [-6.3, 6.1]) {
      const w = new THREE.Vector3(0, 0, b).applyMatrix4(q);
      torre(m, { cx: w.x, cz: w.z, ang, s: 9, y0, yFuste: y0 + 31, yTambor: y0 + 38, yTopo: y0 + 68.5, matF: 'pedraMTorre', matS: 'pedraM', sx: 4 });
    }
    fecha(m, 'Münster', 1872);
  }

  // =====================================================================================================
  // Rathaus (EGID 440080, sólido 1734): fachada vermelha pintada, torre com relógio
  // =====================================================================================================
  {
    const ts = triangulos([1734]);
    const m = novo(); m.y0 = yMin(ts);
    const c = new THREE.Vector2(-90.6, 31.5);
    recapeia(m, ts, (v) => Math.hypot(v.x - c.x, v.z - c.y) < 5.6, 'rathaus', 'telhaR', 3.6, 4.2);
    torre(m, { cx: c.x, cz: c.y, ang: 62 * Math.PI / 180, s: 7.6, y0: m.y0, yFuste: 41.8, yTambor: 46, yTopo: 52.4, matF: 'rathaus', matS: 'flecha', relogio: 1.5, sx: 3.6 });
    fecha(m, 'Rathaus', 1734);
  }

  // =====================================================================================================
  // Igrejas: LOD2 recapeado em pedra e telha, torre trocada
  // =====================================================================================================
  function igreja(nome, ids, pid, t, pedra, pedraJ) {
    const ts = triangulos(ids);
    const m = novo(); m.y0 = yMin(ts);
    recapeia(m, ts, (v) => Math.hypot(v.x - t.cx, v.z - t.cz) < t.r, pedraJ, 'telhaI', 4, 12);
    const topo = Math.max(...ts.flatMap((k) => [1, 4, 7].map((o) => posicoes[k * 9 + o])));
    torre(m, { cx: t.cx, cz: t.cz, ang: t.ang, s: t.s, y0: m.y0, yFuste: topo - t.flecha - t.tambor, yTambor: topo - t.flecha, yTopo: topo, matF: pedraJ, matS: 'flecha', sx: 4 });
    fecha(m, nome, pid);
  }
  igreja('Martinskirche', [1535, 1536], 1535, { cx: -72.7, cz: -57.4, r: 5.2, ang: Math.atan2(0.367, -0.93), s: 7.2, flecha: 17, tambor: 5 }, 'pedraN', 'pedraNJ');
  igreja('Peterskirche', [504, 505], 504, { cx: -296.7, cz: -113.1, r: 5.2, ang: 0, s: 6.8, flecha: 14, tambor: 4 }, 'pedraN', 'pedraNJ');
  igreja('Leonhardskirche', [807], 807, { cx: -100.5, cz: 365, r: 5.8, ang: Math.atan2(-0.297, 0.955), s: 7.4, flecha: 15, tambor: 5 }, 'pedraL', 'pedraLJ');

  // =====================================================================================================
  // Mittlere Brücke: arcos de pedra extrudados ao longo do eixo da ponte do OSM, parapeitos e Käppelijoch
  // =====================================================================================================
  {
    const A = [-49.7, -148.3], B = [95.1, -255.6];
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]), ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
    const q = quadro(A[0], A[1], ang);
    const mk = new Marco(q);
    const hA = altura(...A), hB = altura(...B);
    const yConv = (s) => hA + (hB - hA) * (s / L) + 0.42; // tabuleiro logo abaixo da faixa de rua (0,6 m)
    // trecho de água: onde o relevo fica abaixo do nível do Reno
    let sA = 0, sB = L;
    for (let s = 0; s <= L; s += 1) { const w = altura(A[0] + Math.cos(ang) * s, A[1] + Math.sin(ang) * s) < nivelReno; if (w) { sA = s; break; } }
    for (let s = L; s >= 0; s -= 1) { const w = altura(A[0] + Math.cos(ang) * s, A[1] + Math.sin(ang) * s) < nivelReno; if (w) { sB = s; break; } }
    const N = 6, passo = (sB - sA) / N, larg = 12, pilar = 3.2;
    // perfil lateral (s, y): bloco de pedra com furos em arco de segmento; tabuleiro inclinado entre as cotas das pontas
    const yFundo = 0.8, yTop0 = yConv(0), yTop1 = yConv(L);
    const sh = new THREE.Shape();
    sh.moveTo(0, yFundo); sh.lineTo(L, yFundo); sh.lineTo(L, yTop1 - 0.9); sh.lineTo(0, yTop0 - 0.9); sh.closePath();
    for (let i = 0; i < N; i++) {
      const s0 = sA + i * passo + pilar / 2, s1 = sA + (i + 1) * passo - pilar / 2, mid = (s0 + s1) / 2, vao = (s1 - s0) / 2;
      const mola = nivelReno + 1.6, flecha = Math.min(vao * 0.55, yConv(mid) - 0.9 - mola - 0.8);
      const h = new THREE.Path();
      h.moveTo(s0, yFundo + 0.1); h.lineTo(s0, mola);
      h.absellipse(mid, mola, vao, flecha, Math.PI, 0, true);
      h.lineTo(s1, yFundo + 0.1); h.closePath();
      sh.holes.push(h);
    }
    const g = new THREE.ExtrudeGeometry(sh, { depth: larg, bevelEnabled: false, curveSegments: 20 });
    g.translate(0, 0, -larg / 2); // (s, y, b)
    // ExtrudeGeometry: x = s, y = y, z = b: já está no quadro local (a = s)
    mk.add('ponte', g, { sx: 4, sy: 4 });
    // faixa de tabuleiro (laje) e parapeitos
    const nPar = 36;
    for (const b of [-larg / 2 + 0.2, larg / 2 - 0.2]) {
      const pos = [], idx = [];
      for (let i = 0; i <= nPar; i++) { const s = (L * i) / nPar, y = yConv(s); pos.push(s, y - 0.9, b - 0.2, s, y + 0.9, b - 0.2, s, y + 0.9, b + 0.2, s, y - 0.9, b + 0.2); }
      for (let i = 0; i < nPar; i++) { const o = i * 4; for (const [x, yy, z] of [[0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]) idx.push(o + x, o + yy, o + z); }
      const gp = new THREE.BufferGeometry(); gp.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gp.setIndex(idx);
      mk.add('ponte', gp.toNonIndexed(), { sx: 4, sy: 4 });
    }
    // quebra-mares triangulares nos pilares (a montante e a jusante)
    for (let i = 1; i < N; i++) {
      const s = sA + i * passo;
      for (const d of [-1, 1]) {
        const gt = new THREE.CylinderGeometry(0.01, 1.6, yConv(s) - 0.9 - 0.8, 3, 1).rotateY(Math.PI / 2 * (d > 0 ? 1 : -1) + Math.PI / 6 * 0).translate(s, (yConv(s) - 0.9 + 0.8) / 2, d * (larg / 2 + 0.2));
        gt.scale(1, 1, 1);
        mk.add('ponte', gt, { sx: 4, sy: 4 });
      }
    }
    // Käppelijoch: capela de pedra sobre o pilar do lado de Kleinbasel, pendurada a jusante
    {
      const s = sA + (N - 2) * passo, y = yConv(s), b0 = larg / 2 - 0.3;
      mk.caixa('pedraL', s - 1.9, s + 1.9, b0, b0 + 3.6, y - 0.6, y + 4.8, { sx: 2, sy: 2 });
      mk.caixa('pedraL', s - 2.1, s + 2.1, b0 - 0.1, b0 + 3.8, y - 1.2, y - 0.5, { sx: 2 });
      mk.tronco('telhaI', s, b0 + 1.8, 3.1, 0.0, y + 4.8, y + 9.4, 4, Math.PI / 4, { sx: 3, sy: 3 });
      mk.tronco('ouro', s, b0 + 1.8, 0.15, 0.15, y + 9.0, y + 10.2, 6);
      // corbéis sob a capela
      mk.tronco('pedraL', s, b0 + 1.8, 2.4, 0.9, y - 3.2, y - 1.2, 4, Math.PI / 4, { sx: 2, sy: 2 });
    }
    const m = novo(); empurra(m, mk);
    const gr = fecha(m, 'Mittlere Brücke', -1);
    lista.at(-1).ano = null; // sem ano no predios.json: sempre de pé
  }

  // ---------- integração ----------
  // esconde os triângulos do LOD2 de `ids` (colapsa em um ponto; some do desenho, da sombra e do raio)
  function esconde(geo) {
    const ocultos = new Set([1872, 1734, 1535, 1536, 504, 505, 807]);
    // `posicoes` fica intacta (centro(), fachadas e tour leem dela); a geometria desenhada ganha uma cópia colapsada
    const copia = new Float32Array(posicoes);
    for (let v = 0; v < ids16.length; v++) if (ocultos.has(ids16[v])) { copia[v * 3] = 0; copia[v * 3 + 1] = -50; copia[v * 3 + 2] = 0; }
    geo.setAttribute('position', new THREE.BufferAttribute(copia, 3));
    geo.computeBoundingSphere();
  }
  const alvos = new Map(); // pid -> pids irmãos (sólidos do mesmo EGID)
  alvos.set(1536, 1535);
  alvos.set(505, 504);
  const crescimento = (ano, uAno) => (ano == null ? 1 : Math.min(1, Math.max(0, (uAno - ano + 12) / 12)));
  // chamado a cada quadro: máquina do tempo (sobe nos 12 anos antes do ano do prédio) e destaque da ficha
  function atualiza(uAno, uSel) {
    for (const m of lista) {
      const s = crescimento(m.ano, uAno);
      m.grupo.visible = s > 0.001 || (m.ano != null && U.uPalido.value > 0.5 && false);
      if (m.grupo.visible) { m.grupo.scale.y = s; m.grupo.position.y = m.base * (1 - s); }
      const sel = m.pid >= 0 && m.pid === uSel || alvos.get(uSel) === m.pid ? 1 : 0;
      for (const c of m.grupo.children) { const mt = c.material; if (mt.emissive) { mt.emissive.setRGB(0.5 * sel, 0.06 * sel, 0.04 * sel); } }
    }
  }
  // raio: devolve {pid, distance} do marco mais próximo atingido
  const raioAux = new THREE.Raycaster();
  function acerta(raio) {
    const hs = raio.intersectObjects(raiz.children.filter((g) => g.visible), true).filter((h) => h.object.userData.pid >= 0);
    return hs[0] ? { pid: hs[0].object.userData.pid, distance: hs[0].distance } : null;
  }
  return { grupo: raiz, esconde, atualiza, acerta, lista, ENV, mats };
}
