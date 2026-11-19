// Marcos em alta definição (tarefa 18): Münster, Rathaus, Mittlere Brücke (arcos e Käppelijoch) e as igrejas de
// São Martinho, São Pedro e São Leonardo. Modelagem própria, procedural, no estilo do resto (sem arquivo externo,
// sem licença de terceiros). A geometria vem de duas fontes, ambas do swissBUILDINGS3D / OSM já no projeto:
//   - Münster: reconstruído do zero (planta e alturas lidas do LOD2 do mesmo EGID 243009807);
//   - Rathaus e igrejas: os triângulos do LOD2 do mesmo EGID são copiados para uma malha nova com material de pedra/
//     pintura, e as torres (blocos do LOD2) são trocadas por torres com fuste, galeria, tambor e flecha;
//   - Mittlere Brücke: arcos extrudados ao longo do eixo da ponte do OSM (way "Mittlere Rheinbrücke").
// Os triângulos originais desses prédios são colapsados em cidade.js (esconde()); a ficha continua valendo: cada marco
// guarda o id do prédio no predios.json e responde ao clique.
// Materiais (design/realismo-tocador-sim.md): MeshStandardMaterial com roughnessMap de ruído de valor em duas oitavas,
// envMap (PMREM de estúdio neutro) só no telhado vidrado do Münster e no ouro.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { cotaPonta } from './chao.js';

// Mittlere Brücke: eixo do OSM e vãos (trecho molhado dividido em N arcos). agua.js usa os mesmos pilares para a
// espuma e para não pôr os pilares genéricos dele (a cada ~32 m, fora do lugar) dentro dos arcos desta ponte.
// larg: 20 m de parapeito a parapeito; as calçadas do OSM correm a +7,5 e −6,6 m do eixo e os postes a ±10 m (no parapeito)
export const MITTLERE = { A: [-49.7, -148.3], B: [95.1, -255.6], N: 6, larg: 20, pilar: 3.2 };
export function vaosMittlere(altura, nivelReno = 2.3) {
  const { A, B, N } = MITTLERE;
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]), ang = Math.atan2(B[1] - A[1], B[0] - A[0]), c = Math.cos(ang), s_ = Math.sin(ang);
  // trecho de água: onde o relevo fica abaixo do nível do Reno
  let sA = 0, sB = L;
  for (let s = 0; s <= L; s += 1) if (altura(A[0] + c * s, A[1] + s_ * s) < nivelReno) { sA = s; break; }
  for (let s = L; s >= 0; s -= 1) if (altura(A[0] + c * s, A[1] + s_ * s) < nivelReno) { sB = s; break; }
  const passo = (sB - sA) / N;
  const pilares = [];
  for (let i = 1; i < N; i++) { const s = sA + i * passo; pilares.push({ s, x: A[0] + c * s, z: A[1] + s_ * s }); }
  return { L, ang, sA, sB, passo, pilares };
}

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
// fachada do Rathaus para a Marktplatz (2026-11-19), num desenho só de 41,4 x 36,5 m (de 6,1 m, o chão da praça, para
// cima), em vez da célula repetida: à esquerda a Kanzlei de 1606–08, com janelas em cruz e pinturas em grisalha; no meio
// o corpo de 1504–14, com os três arcos da Bogenhalle, a fileira de janelas góticas, o relógio dourado com a Justitia,
// os anjos com os escudos de Basel sobre os arcos e o friso pintado (Hans Bock, 1608–11, em versão de longe); à direita o pé
// da torre de 1898–1904. Fatos conferidos na Wikipedia (de: Rathaus Basel) em 2026-11-19.
// u em metros ao longo da fachada a partir do canto norte (x −110,96, z −1,18); v em metros acima de 6,1 m.
const RATH = { L: 41.4, H: 36.5, ppm: 40, kanzlei: [0, 17.6], corpo: [17.6, 34], topoCorpo: 18.6, topoKanzlei: 22.9 };
function texRathausFrente() {
  const { L, H, ppm } = RATH, W = Math.round(L * ppm), Hp = Math.round(H * ppm);
  return tex(W, Hp, (g) => {
    const r = mulberry(17);
    const X = (u) => u * ppm, Y = (v) => Hp - v * ppm; // v em metros acima da praça
    const ret = (u0, v0, u1, v1, cor) => { g.fillStyle = cor; g.fillRect(X(u0), Y(v1), X(u1) - X(u0), Y(v0) - Y(v1)); };
    // reboco vermelho com manchas de tempo
    ret(0, 0, L, H, '#a8352a');
    for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${r() > 0.5 ? '255,190,150' : '50,8,4'},${r() * 0.06})`; g.fillRect(r() * W, r() * Hp, 4 + r() * 22, 4 + r() * 14); }
    // ---- Kanzlei (esquerda): 4 andares de janelas em cruz com molduras de arenito e pinturas em grisalha entre elas
    const [k0, k1] = RATH.kanzlei;
    ret(k0, 0, k1, 0.5, '#7d2b22');
    for (let f = 0; f < 4; f++) {
      const v0 = 1.2 + f * 5.2;
      for (let c = 0; c < 4; c++) {
        const u = k0 + 1.4 + c * 4.1;
        if (f === 0) { // térreo: portas em arco
          ret(u - 0.3, v0 - 1.2, u + 2.3, v0 + 3.3, '#cdb68a');
          ret(u, v0 - 1.2, u + 2, v0 + 2.6, '#231c18');
          g.fillStyle = '#231c18'; g.beginPath(); g.arc(X(u + 1), Y(v0 + 2.6), ppm, Math.PI, 0); g.fill();
          continue;
        }
        ret(u - 0.25, v0 - 0.25, u + 2.25, v0 + 3.05, '#d6c194');
        ret(u, v0, u + 2, v0 + 2.8, '#2a3440');
        ret(u + 0.92, v0, u + 1.08, v0 + 2.8, '#d6c194'); ret(u, v0 + 1.9, u + 2, v0 + 2.05, '#d6c194');
        ret(u - 0.4, v0 - 0.45, u + 2.4, v0 - 0.25, '#c4ac7e'); // peitoril
        // pintura em grisalha entre as janelas: figura de pé num nicho fingido
        if (c < 3) {
          const uc = u + 3.05, vc = v0 + 0.3;
          ret(uc - 0.7, vc, uc + 0.7, vc + 2.6, 'rgba(225,205,160,0.35)');
          g.fillStyle = 'rgba(235,215,170,0.55)'; g.beginPath(); g.ellipse(X(uc), Y(vc + 2.25), 0.22 * ppm, 0.26 * ppm, 0, 0, 7); g.fill();
          g.beginPath(); g.moveTo(X(uc - 0.45), Y(vc + 0.1)); g.lineTo(X(uc + 0.45), Y(vc + 0.1)); g.lineTo(X(uc + 0.2), Y(vc + 1.95)); g.lineTo(X(uc - 0.2), Y(vc + 1.95)); g.fill();
        }
      }
      ret(k0, v0 + 3.6, k1, v0 + 3.8, '#c9b185'); // cornija de andar
    }
    // cunhais pintados nas quinas
    for (const u of [k0, k1 - 0.9]) for (let v = 0; v < RATH.topoKanzlei; v += 1.1) ret(u, v, u + (Math.round(v / 1.1) % 2 ? 0.9 : 0.6), v + 1.0, '#c7ad80');
    // ---- corpo principal (meio): Bogenhalle, janelas góticas, relógio, escudos e friso
    const [c0, c1] = RATH.corpo, cw = c1 - c0, cm = (c0 + c1) / 2, topo = RATH.topoCorpo;
    // três arcos redondos de 4,2 m de vão e 6,2 m de altura, em arenito claro
    for (let i = 0; i < 3; i++) {
      const uc = c0 + cw * (i + 0.5) / 3, h = 4.6, rr = 2.1;
      g.fillStyle = '#d2ba8c'; g.beginPath(); g.arc(X(uc), Y(h), (rr + 0.55) * ppm, Math.PI, 0); g.lineTo(X(uc + rr + 0.55), Y(0)); g.lineTo(X(uc - rr - 0.55), Y(0)); g.fill();
      g.fillStyle = '#1d1714'; g.beginPath(); g.arc(X(uc), Y(h), rr * ppm, Math.PI, 0); g.lineTo(X(uc + rr), Y(0)); g.lineTo(X(uc - rr), Y(0)); g.fill();
      // grade dourada da porta e o fundo pintado do pátio (vermelho, mais escuro)
      g.strokeStyle = 'rgba(214,170,64,0.8)'; g.lineWidth = 3;
      for (let k = -4; k <= 4; k++) { g.beginPath(); g.moveTo(X(uc + k * rr / 5), Y(0)); g.lineTo(X(uc + k * rr / 5), Y(h + Math.sqrt(Math.max(0, rr * rr - (k * rr / 5) ** 2)) - 0.1)); g.stroke(); }
      g.fillStyle = 'rgba(120,30,22,0.35)'; g.fillRect(X(uc - rr * 0.8), Y(h), X(rr * 1.6), X(h * 0.6));
    }
    ret(c0, 6.9, c1, 7.25, '#c8ae80'); // cornija sobre os arcos
    // fileira de janelas góticas (arco quebrado, vitral em chumbo)
    for (let i = 0; i < 5; i++) {
      const u = c0 + 1.0 + i * (cw - 2) / 5 + 0.35, w = 2.2, v0 = 8.0, h = 3.4;
      g.fillStyle = '#d2ba8c';
      g.beginPath(); g.moveTo(X(u - 0.25), Y(v0 - 0.25)); g.lineTo(X(u - 0.25), Y(v0 + h)); g.quadraticCurveTo(X(u - 0.25), Y(v0 + h + 1.3), X(u + w / 2), Y(v0 + h + 1.6));
      g.quadraticCurveTo(X(u + w + 0.25), Y(v0 + h + 1.3), X(u + w + 0.25), Y(v0 + h)); g.lineTo(X(u + w + 0.25), Y(v0 - 0.25)); g.fill();
      const vid = g.createLinearGradient(0, Y(v0 + h + 1.3), 0, Y(v0));
      vid.addColorStop(0, '#3e5a6a'); vid.addColorStop(0.5, '#2c3c48'); vid.addColorStop(1, '#4d5a52');
      g.fillStyle = vid;
      g.beginPath(); g.moveTo(X(u), Y(v0)); g.lineTo(X(u), Y(v0 + h)); g.quadraticCurveTo(X(u), Y(v0 + h + 1.05), X(u + w / 2), Y(v0 + h + 1.3));
      g.quadraticCurveTo(X(u + w), Y(v0 + h + 1.05), X(u + w), Y(v0 + h)); g.lineTo(X(u + w), Y(v0)); g.fill();
      g.strokeStyle = '#d2ba8c'; g.lineWidth = 3; g.beginPath(); g.moveTo(X(u + w / 2), Y(v0)); g.lineTo(X(u + w / 2), Y(v0 + h + 1.2)); g.stroke();
      g.strokeStyle = 'rgba(30,30,30,0.5)'; g.lineWidth = 1;
      for (let y = v0 + 0.3; y < v0 + h; y += 0.3) { g.beginPath(); g.moveTo(X(u), Y(y)); g.lineTo(X(u + w), Y(y)); g.stroke(); }
    }
    // relógio dourado no meio, com a Justitia em cima e um escudo de Basel de cada lado
    const vr = 14.4;
    g.fillStyle = '#c9a13b'; g.fillRect(X(cm - 2.2), Y(vr + 2.3), X(4.4), X(4.6));
    g.fillStyle = '#20305c'; g.beginPath(); g.arc(X(cm), Y(vr), 1.75 * ppm, 0, 7); g.fill();
    g.strokeStyle = '#e8c55a'; g.lineWidth = 6; g.beginPath(); g.arc(X(cm), Y(vr), 1.55 * ppm, 0, 7); g.stroke();
    g.fillStyle = '#e8c55a';
    for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; g.fillRect(X(cm) + Math.cos(a) * 1.3 * ppm - 3, Y(vr) + Math.sin(a) * 1.3 * ppm - 3, 6, 6); }
    g.lineWidth = 5; g.beginPath(); g.moveTo(X(cm), Y(vr)); g.lineTo(X(cm + 0.7), Y(vr + 0.6)); g.moveTo(X(cm), Y(vr)); g.lineTo(X(cm - 0.2), Y(vr - 1.1)); g.stroke();
    // Justitia (figura dourada com a balança)
    g.fillStyle = '#d9b24a';
    g.beginPath(); g.ellipse(X(cm), Y(vr + 3.65), 0.22 * ppm, 0.25 * ppm, 0, 0, 7); g.fill();
    g.beginPath(); g.moveTo(X(cm - 0.55), Y(vr + 2.35)); g.lineTo(X(cm + 0.55), Y(vr + 2.35)); g.lineTo(X(cm + 0.25), Y(vr + 3.4)); g.lineTo(X(cm - 0.25), Y(vr + 3.4)); g.fill();
    g.strokeStyle = '#d9b24a'; g.lineWidth = 3; g.beginPath(); g.moveTo(X(cm - 0.9), Y(vr + 3.3)); g.lineTo(X(cm + 0.9), Y(vr + 3.3)); g.stroke();
    for (const s of [-0.9, 0.9]) { g.beginPath(); g.arc(X(cm + s), Y(vr + 2.95), 0.2 * ppm, 0, Math.PI); g.stroke(); }
    // sobre os arcos, nos vãos entre eles: anjos da vitória segurando os escudos de Basel (báculo preto sobre branco)
    for (const fr of [1 / 3, 2 / 3]) {
      const uc = c0 + cw * fr, v = 5.75, k = 0.62;
      g.fillStyle = '#d9b24a'; // asas
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(X(uc + s * 0.7 * k), Y(v + 0.9 * k)); g.quadraticCurveTo(X(uc + s * 2.1 * k), Y(v + 1.9 * k), X(uc + s * 2.0 * k), Y(v - 0.2 * k)); g.quadraticCurveTo(X(uc + s * 1.4 * k), Y(v + 0.4 * k), X(uc + s * 0.7 * k), Y(v - 0.4 * k)); g.fill(); }
      g.fillStyle = '#c9a13b'; g.beginPath(); g.moveTo(X(uc - 1.05 * k), Y(v + 1.45 * k)); g.lineTo(X(uc + 1.05 * k), Y(v + 1.45 * k)); g.lineTo(X(uc + 1.05 * k), Y(v - 0.2 * k)); g.quadraticCurveTo(X(uc + 1.05 * k), Y(v - 1.4 * k), X(uc), Y(v - 1.75 * k)); g.quadraticCurveTo(X(uc - 1.05 * k), Y(v - 1.4 * k), X(uc - 1.05 * k), Y(v - 0.2 * k)); g.fill();
      g.fillStyle = '#f1ece0'; g.beginPath(); g.moveTo(X(uc - 0.9 * k), Y(v + 1.3 * k)); g.lineTo(X(uc + 0.9 * k), Y(v + 1.3 * k)); g.lineTo(X(uc + 0.9 * k), Y(v - 0.2 * k)); g.quadraticCurveTo(X(uc + 0.9 * k), Y(v - 1.25 * k), X(uc), Y(v - 1.55 * k)); g.quadraticCurveTo(X(uc - 0.9 * k), Y(v - 1.25 * k), X(uc - 0.9 * k), Y(v - 0.2 * k)); g.fill();
      g.fillStyle = '#151515'; g.fillRect(X(uc - 0.12 * k), Y(v + 0.6 * k), X(0.24 * k), X(1.9 * k));
      g.lineWidth = 6 * k; g.strokeStyle = '#151515'; g.beginPath(); g.arc(X(uc + 0.12 * k), Y(v + 0.65 * k), 0.4 * k * ppm, Math.PI, 0.2 * Math.PI, true); g.stroke();
      g.fillRect(X(uc - 0.35 * k), Y(v - 1.25 * k), X(0.7 * k), X(0.18 * k));
      g.fillStyle = '#e0b894'; g.beginPath(); g.ellipse(X(uc), Y(v + 1.75 * k), 0.2 * k * ppm, 0.24 * k * ppm, 0, 0, 7); g.fill(); // cabeça do anjo
    }
    // dos lados do relógio: janelas da Vordere Ratsstube, a sala onde fica a Justitia
    for (const s of [-1, 1]) { const u = cm + s * 4.6; ret(u - 1.25, 13.2, u + 1.25, 16.4, '#d2ba8c'); ret(u - 1.0, 13.45, u + 1.0, 16.15, '#2c3c48'); ret(u - 0.06, 13.45, u + 0.06, 16.15, '#d2ba8c'); }
    // friso pintado no alto do corpo: figuras em vestes coloridas entre colunas fingidas (os murais, vistos de longe)
    const f0 = 18.6 - 4.0 + 0.6, f1 = 18.6 - 0.6;
    ret(c0, f0 - 0.35, c1, f0, '#c8ae80');
    const vestes = ['#2f4f7a', '#3f6b45', '#c9a13b', '#6a2a5a', '#d8c9a8', '#8a5a2a'];
    for (let i = 0; i < 9; i++) {
      const u = c0 + 0.9 + i * (cw - 1.8) / 9;
      ret(u - 0.12, f0, u + 0.12, f1, '#cdb487'); // coluna fingida
      const uc = u + (cw - 1.8) / 18;
      g.fillStyle = vestes[i % vestes.length];
      g.beginPath(); g.moveTo(X(uc - 0.5), Y(f0 + 0.15)); g.lineTo(X(uc + 0.5), Y(f0 + 0.15)); g.lineTo(X(uc + 0.22), Y(f1 - 0.7)); g.lineTo(X(uc - 0.22), Y(f1 - 0.7)); g.fill();
      g.fillStyle = '#e0b894'; g.beginPath(); g.ellipse(X(uc), Y(f1 - 0.45), 0.2 * ppm, 0.24 * ppm, 0, 0, 7); g.fill();
      g.fillStyle = vestes[(i + 3) % vestes.length]; g.fillRect(X(uc - 0.55), Y(f1 - 0.85), X(1.1), X(0.18)); // braços abertos
    }
    ret(c0, f1, c1, topo + 0.2, '#c8ae80'); // cornija sob as ameias
    // cunhais do corpo
    for (const u of [c0, c1 - 0.8]) for (let v = 0; v < topo; v += 1.1) ret(u, v, u + (Math.round(v / 1.1) % 2 ? 0.8 : 0.55), v + 1.0, '#cdb487');
    // ---- pé da torre (direita) e o alto, acima dos telhados (o que sobrar do LOD2 ali)
    ret(c1, 0, L, H, '#a33429');
    for (let v = 2; v < H; v += 4.4) { ret(c1 + 2.2, v, c1 + 3.6, v + 2.4, '#d6c194'); ret(c1 + 2.4, v + 0.2, c1 + 3.4, v + 2.2, '#2a3440'); }
  });
}
// escudos dos cantões nas ameias (Wikipedia: "Zinnen mit den Wappen der Kantone"): oito brasões simplificados num atlas 8 x 1
function texBrasoes() {
  const N = 8, w = 64, h = 80;
  const cores = [['#d52b1e', '#ffffff', 'cruz'], ['#1f5aa6', '#ffffff', 'faixa'], ['#ffffff', '#151515', 'baculo'], ['#f2c14e', '#151515', 'urso'],
    ['#d52b1e', '#f2c14e', 'faixa'], ['#2f7a3a', '#ffffff', 'faixa'], ['#151515', '#f2c14e', 'cruz'], ['#ffffff', '#1f5aa6', 'faixa']];
  return tex(N * w, h, (g) => {
    g.fillStyle = '#a8352a'; g.fillRect(0, 0, N * w, h);
    cores.forEach(([fundo, fig, tipo], i) => {
      const x = i * w;
      const escudo = () => { g.beginPath(); g.moveTo(x + 8, 6); g.lineTo(x + w - 8, 6); g.lineTo(x + w - 8, 40); g.quadraticCurveTo(x + w - 8, 66, x + w / 2, 76); g.quadraticCurveTo(x + 8, 66, x + 8, 40); g.closePath(); };
      g.fillStyle = '#c9a13b'; escudo(); g.fill();
      g.save(); g.translate(x + w / 2, 41); g.scale(0.86, 0.88); g.translate(-(x + w / 2), -41); g.fillStyle = fundo; escudo(); g.fill(); g.clip();
      g.fillStyle = fig;
      if (tipo === 'cruz') { g.fillRect(x + w / 2 - 5, 18, 10, 40); g.fillRect(x + 16, 33, w - 32, 10); }
      else if (tipo === 'faixa') g.fillRect(x, 6, w, 30);
      else if (tipo === 'baculo') { g.fillRect(x + w / 2 - 3, 26, 6, 40); g.lineWidth = 6; g.strokeStyle = fig; g.beginPath(); g.arc(x + w / 2 + 3, 26, 9, Math.PI, 0.2 * Math.PI, true); g.stroke(); }
      else { g.beginPath(); g.ellipse(x + w / 2, 44, 14, 18, 0, 0, 7); g.fill(); }
      g.restore();
    });
  });
}
// pintura da torre (Wilhelm Balmer, 1901): o porta-bandeira Hans Bär, morto em Marignano em 1515, de pé com a bandeira
function texBalmer() {
  const ppm = 40, W = 6 * ppm, H = 10 * ppm;
  return tex(W, H, (g) => {
    g.fillStyle = '#a33429'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#c8ae80'; g.fillRect(8, 8, W - 16, H - 16); g.fillStyle = '#e9dfc4'; g.fillRect(16, 16, W - 32, H - 32);
    const cx = W / 2;
    // bandeira de Basel tremulando
    g.fillStyle = '#5a3a22'; g.fillRect(cx + 34, 40, 6, H - 80);
    g.fillStyle = '#f6f2e6'; g.beginPath(); g.moveTo(cx + 40, 44); g.quadraticCurveTo(cx + 90, 30, cx + 100, 70); g.quadraticCurveTo(cx + 80, 130, cx + 40, 140); g.fill();
    g.fillStyle = '#151515'; g.fillRect(cx + 62, 66, 6, 50); g.lineWidth = 5; g.strokeStyle = '#151515'; g.beginPath(); g.arc(cx + 68, 70, 8, Math.PI, 0.2 * Math.PI, true); g.stroke();
    // o porta-bandeira: gibão vermelho e branco, calção, chapéu com pluma
    g.fillStyle = '#e0b894'; g.beginPath(); g.ellipse(cx, 120, 16, 19, 0, 0, 7); g.fill();
    g.fillStyle = '#2b2b2b'; g.beginPath(); g.ellipse(cx, 104, 26, 8, 0, 0, 7); g.fill();
    g.fillStyle = '#f6f2e6'; g.beginPath(); g.moveTo(cx + 10, 100); g.quadraticCurveTo(cx + 40, 70, cx + 34, 104); g.fill();
    g.fillStyle = '#b3201c'; g.fillRect(cx - 28, 140, 28, 90); g.fillStyle = '#f6f2e6'; g.fillRect(cx, 140, 28, 90);
    g.fillStyle = '#b3201c'; g.fillRect(cx + 26, 150, 14, 50); g.fillStyle = '#f6f2e6'; g.fillRect(cx - 40, 150, 14, 60);
    g.fillStyle = '#3a3a5a'; g.fillRect(cx - 24, 230, 20, 100); g.fillRect(cx + 4, 230, 20, 100);
    g.fillStyle = '#2b2b2b'; g.fillRect(cx - 28, 326, 26, 10); g.fillRect(cx + 2, 326, 26, 10);
    g.fillStyle = '#9a9a9a'; g.fillRect(cx - 50, 200, 8, 120); // espada
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
    rathausFrente: std(texRathausFrente()),
    brasoes: std(texBrasoes(), { roughness: 0.5 }),
    balmer: std(texBalmer()),
    telhaR: std(texTelha('#8d4a34', 4)),
    pedraN: std(texPedra({ cw: 4, ch: 4, cor: '#b98a68', seed: 21 })),
    pedraNJ: std(texPedra({ cw: 4, ch: 12, cor: '#b98a68', janela: true, seed: 22 })),
    pedraL: std(texPedra({ cw: 4, ch: 4, cor: '#b99a7a', seed: 23 })),
    pedraLJ: std(texPedra({ cw: 4, ch: 12, cor: '#b99a7a', janela: true, seed: 24 })),
    telhaI: std(texTelha('#7c4634', 6)),
    ponte: std(texPedra({ cw: 4, ch: 4, cor: '#a9a59c', seed: 31 })), // granito cinza-claro (foto aérea oblíqua, 2026-11-19)
    ferro: new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.55, metalness: 0.6, envMap: ENV, envMapIntensity: 0.5 }),
    flecha: std(texTelha('#6c3a2e', 8)),
    ouro: new THREE.MeshStandardMaterial({ color: 0xc9a13b, roughness: 0.3, metalness: 0.85, envMap: ENV, envMapIntensity: 1.1 }),
    relogio: new THREE.MeshStandardMaterial({ map: texRelogio(), roughness: 0.4, metalness: 0.2, envMap: ENV, envMapIntensity: 0.5 }),
  };
  for (const k of ['rathaus', 'rathausFrente', 'brasoes', 'balmer', 'telhaR', 'telhaI', 'pedraN', 'pedraNJ', 'pedraL', 'pedraLJ', 'flecha', 'ferro']) mats[k].side = THREE.DoubleSide; // o LOD2 tem triângulos com giro invertido
  let cotaMittlere = null;
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
    // a frente para a Marktplatz (plano de normal (−0,89, 0,457)) sai do recapeamento e ganha a textura própria
    const o = new THREE.Vector2(-110.96, -1.18), dir = new THREE.Vector2(0.457, 0.89), nf = new THREE.Vector2(-0.89, 0.457), Y0 = 6.1;
    const frente = [], resto = [];
    for (const t of ts) {
      const [a, b, cc] = tri(t);
      const n = b.clone().sub(a).cross(cc.clone().sub(a)); if (n.lengthSq() < 1e-9) continue; n.normalize();
      const naFrente = Math.abs(n.y) < 0.2 && Math.abs(n.x * nf.x + n.z * nf.y) > 0.97 && [a, b, cc].every((v) => Math.abs((v.x - o.x) * nf.x + (v.z - o.y) * nf.y) < 0.8);
      (naFrente ? frente : resto).push(t);
    }
    if (frente.length) {
      const pos = [], uv = [];
      for (const t of frente) for (const v of tri(t)) {
        pos.push(v.x + nf.x * 0.03, v.y, v.z + nf.y * 0.03);
        uv.push(((v.x - o.x) * dir.x + (v.z - o.y) * dir.y) / RATH.L, (v.y - Y0) / RATH.H);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      (m.mundo.rathausFrente ??= []).push(g);
    }
    recapeia(m, resto, (v) => Math.hypot(v.x - c.x, v.z - c.y) < 5.6, 'rathaus', 'telhaV', 3.6, 4.2);
    // ameias sobre o corpo de 1504 (vermelhas, com cobertura de arenito) e pináculos dourados nas quinas e no meio
    {
      const ang = Math.atan2(dir.y, dir.x), mk = new Marco(quadro(o.x, o.y, ang)), [c0, c1] = RATH.corpo, yt = Y0 + RATH.topoCorpo;
      let nb = 0;
      for (let u = c0 + 0.2; u < c1 - 0.6; u += 1.3) {
        mk.caixa('rathaus', u, u + 0.75, -0.25, 0.35, yt - 0.2, yt + 1.15, { sx: 3.6, sy: 4.2 });
        mk.caixa('pedraL', u - 0.05, u + 0.8, -0.3, 0.4, yt + 1.15, yt + 1.3, { sx: 2 });
        // brasão de um cantão na frente de cada ameia (b = 0,36: 1 cm à frente)
        const k = nb++ % 8, q = new THREE.PlaneGeometry(0.6, 0.75); // de frente para +b, a normal da fachada
        const uvq = q.attributes.uv; for (let i = 0; i < uvq.count; i++) uvq.setX(i, (k + uvq.getX(i)) / 8);
        q.translate(u + 0.375, yt + 0.5, 0.36);
        mk.add('brasoes', q, { uvPronto: true });
      }
      // Erker da ala esquerda (1898–1904): balcão fechado de dois andares, saliente 1,2 m, com telhadinho em ponta
      { const u0 = 5.6, u1 = 9.4, y0 = Y0 + 6.2, y1 = Y0 + 13.4;
        mk.caixa('rathaus', u0, u1, 0, 1.25, y0, y1, { sx: 3.6, sy: 4.2 });
        mk.caixa('pedraL', u0 - 0.15, u1 + 0.15, -0.05, 1.4, y0 - 0.5, y0, { sx: 2 });
        mk.tronco('flecha', (u0 + u1) / 2, 0.62, 2.5, 0.05, y1, y1 + 2.6, 4, Math.PI / 4);
        mk.tronco('ouro', (u0 + u1) / 2, 0.62, 0.08, 0.08, y1 + 2.6, y1 + 3.4, 6); }
      // pintura de Wilhelm Balmer (1901) na face da torre voltada para a praça
      { const q = new THREE.PlaneGeometry(4.6, 7.6); q.translate(38.4, Y0 + 22, 0.68); // centro da torre: u 38,4, b −3,2; face a +0,6
        mk.add('balmer', q, { uvPronto: true }); }
      for (const u of [c0 + 0.3, (c0 + c1) / 2, c1 - 0.3]) {
        mk.tronco('ouro', u, 0.05, 0.28, 0.28, yt + 1.3, yt + 2.2, 6);
        mk.tronco('ouro', u, 0.05, 0.3, 0.0, yt + 2.2, yt + 4.4, 6);
      }
      // Dachreiter: torrinha dourada no telhado, atrás do relógio
      mk.tronco('ouro', (c0 + c1) / 2, -4, 0.55, 0.55, yt + 4, yt + 7, 8);
      mk.tronco('flecha', (c0 + c1) / 2, -4, 0.75, 0.0, yt + 7, yt + 12, 8);
      empurra(m, mk);
    }
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
    const { A, B, N, larg, pilar } = MITTLERE;
    const { L, ang, sA, sB, passo } = vaosMittlere(altura, nivelReno);
    const q = quadro(A[0], A[1], ang);
    const mk = new Marco(q);
    // pontas do eixo: a mesma regra das faixas de rua, dos trilhos e da gente (chao.js), para o tabuleiro casar com elas
    const hA = cotaPonta(altura, ...A, A[0] + Math.cos(ang), A[1] + Math.sin(ang)), hB = cotaPonta(altura, ...B, B[0] - Math.cos(ang), B[1] - Math.sin(ang));
    const yConv = (s) => hA + (hB - hA) * (s / L) + 0.42; // tabuleiro logo abaixo da faixa de rua (0,6 m)
    // perfil lateral (s, y): bloco de pedra com furos em arco de segmento; tabuleiro inclinado entre as cotas das pontas.
    // O pé fica bem abaixo da água (o Reno está a 0,8 m): com o pé a 0,8 m, a laje de 10 cm sob os furos boiava
    // rente à superfície e parecia um piso de tábuas embaixo dos arcos
    const yFundo = nivelReno - 4.5, yTop0 = yConv(0), yTop1 = yConv(L);
    const sh = new THREE.Shape();
    // o topo do bloco é o tabuleiro (18 cm sob as faixas de rua e calçada de cidade.js): sem vala entre a pista e o parapeito
    sh.moveTo(0, yFundo); sh.lineTo(L, yFundo); sh.lineTo(L, yTop1 - 0.05); sh.lineTo(0, yTop0 - 0.05); sh.closePath();
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
    // pilares como na foto: quebra-mar de ponta arredondada a montante e a jusante, que sobe até o parapeito e vira um
    // balcão semicircular; em cada balcão, um mastro fino e alto (o fio do bonde e a luz)
    for (let i = 1; i < N; i++) {
      const s = sA + i * passo, y = yConv(s);
      for (const d of [-1, 1]) {
        const meio = (g) => g.translate(s, 0, d * (larg / 2 - 0.2));
        // meia-coluna: θ de −π/2 a π/2 cobre z ≥ 0 (lado +b); o outro lado gira π
        const rot = d > 0 ? -Math.PI / 2 : Math.PI / 2;
        mk.add('ponte', meio(new THREE.CylinderGeometry(1.7, 1.9, y + 0.9 - yFundo, 16, 1, false, rot, Math.PI).translate(0, (y + 0.9 + yFundo) / 2, 0)), { sx: 4, sy: 4 });
        mk.add('ponte', meio(new THREE.CylinderGeometry(1.95, 1.95, 0.25, 16, 1, false, rot, Math.PI).translate(0, y + 1.0, 0)), { sx: 2, sy: 2 }); // cornija do balcão
        const bm = d * (larg / 2 + 0.9);
        mk.add('ferro', new THREE.CylinderGeometry(0.06, 0.1, 9.5, 8).translate(s, y + 1.1 + 4.75, bm));
        mk.add('ferro', new THREE.SphereGeometry(0.14, 8, 6).translate(s, y + 10.7, bm));
      }
    }
    // grade de ferro fundido no alto do parapeito, dos dois lados (a faixa escura que se vê de longe)
    for (const b of [-larg / 2 - 0.02, larg / 2 + 0.02]) {
      const pos = [], idx = [], n = 36;
      for (let i = 0; i <= n; i++) { const s = (L * i) / n, y = yConv(s); pos.push(s, y + 0.35, b, s, y + 0.85, b); }
      for (let i = 0; i < n; i++) { const o = i * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
      const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setIndex(idx);
      mk.add('ferro', gg.toNonIndexed());
    }
    // Käppelijoch: capela de pedra pendurada a jusante, no meio da ponte. Posição do sólido 949 do swissBUILDINGS3D
    // (a capela real, sem registro no GWR), que esconde() tira: o pé (dz) do relevo fino o afundava 9 m no rio
    {
      const s = 89.5, y = yConv(s), b0 = larg / 2 - 0.3;
      mk.caixa('pedraL', s - 1.9, s + 1.9, b0, b0 + 3.6, y - 0.6, y + 4.8, { sx: 2, sy: 2 });
      mk.caixa('pedraL', s - 2.1, s + 2.1, b0 - 0.1, b0 + 3.8, y - 1.2, y - 0.5, { sx: 2 });
      mk.tronco('telhaI', s, b0 + 1.8, 3.1, 0.0, y + 4.8, y + 9.4, 4, Math.PI / 4, { sx: 3, sy: 3 });
      mk.tronco('ouro', s, b0 + 1.8, 0.15, 0.15, y + 9.0, y + 10.2, 6);
      // corbéis sob a capela
      mk.tronco('pedraL', s, b0 + 1.8, 2.4, 0.9, y - 3.2, y - 1.2, 4, Math.PI / 4, { sx: 2, sy: 2 });
    }
    // cota do tabuleiro para quem põe coisas na ponte (postes de detalhes.js): null fora dela
    cotaMittlere = (x, z) => {
      const dx = x - A[0], dz = z - A[1], sx = dx * Math.cos(ang) + dz * Math.sin(ang), bx = -dx * Math.sin(ang) + dz * Math.cos(ang);
      if (sx < 0 || sx > L || Math.abs(bx) > larg / 2 + 0.5) return null;
      return yConv(sx) + (Math.abs(bx) > larg / 2 - 0.6 ? 0.9 : 0.18); // no parapeito ou no piso
    };
    const m = novo(); empurra(m, mk);
    const gr = fecha(m, 'Mittlere Brücke', -1);
    lista.at(-1).ano = null; // sem ano no predios.json: sempre de pé
  }

  // ---------- integração ----------
  // esconde os triângulos do LOD2 de `ids` (colapsa em um ponto; some do desenho, da sombra e do raio)
  function esconde(geo) {
    const ocultos = new Set([1872, 1734, 1535, 1536, 504, 505, 807, 949]); // 949: Käppelijoch, refeita acima
    // `posicoes` fica intacta (centro(), fachadas e tour leem dela); a geometria desenhada ganha uma cópia colapsada
    const copia = new Float32Array(posicoes);
    for (let v = 0; v < ids16.length; v++) if (ocultos.has(ids16[v])) { copia[v * 3] = 0; copia[v * 3 + 1] = -50; copia[v * 3 + 2] = 0; }
    geo.setAttribute('position', new THREE.BufferAttribute(copia, 3));
    geo.computeBoundingSphere();
  }
  const alvos = new Map(); // pid -> pids irmãos (sólidos do mesmo EGID)
  alvos.set(1536, 1535);
  alvos.set(505, 504);
  // chamado a cada quadro: destaque do marco da ficha
  function atualiza(uSel) {
    for (const m of lista) {
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
  return { grupo: raiz, esconde, atualiza, acerta, lista, ENV, mats, cotaPonte: (x, z) => cotaMittlere?.(x, z) ?? null };
}
