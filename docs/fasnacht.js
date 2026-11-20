// Fasnacht (2026-11-19): uma Clique passando, como nos três dias de Basel: a lanterna pintada e acesa na frente, levada
// por quatro, o tambor-mor com o bastão, quatro fileiras de flautins (Piccolos) e três de tambores, todos de Larve (as
// máscaras grandes, de nariz comprido) e fantasia colorida. Anda a passo de marcha por um caminho (pontos x,z) e, perto da
// câmera, soa o tambor de marcha (ruído filtrado, sintetizado; nada é baixado).
// No tour ela desce a Augustinergasse em fevereiro; fora dele, aparece nos dias reais: da segunda depois da Quarta-feira de
// Cinzas (Páscoa − 41 dias, 4h, Morgestraich) até quinta às 4h, num circuito pela Freie Strasse e a Marktplatz.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
// Páscoa (algoritmo de Meeus/Jones/Butcher), em UTC
function pascoa(a) {
  const b = Math.floor(a / 100), c = a % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * (a % 19) + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor(((a % 19) + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(a, mes - 1, dia);
}
// segunda-feira da Fasnacht (Morgestraich), em ms UTC
export const segundaFasnacht = (a) => pascoa(a) - 41 * 86400000;
// Morgestraich: segunda às 4h em ponto a cidade apaga as luzes (janelas, postes, vitrines) e as Cliques saem no escuro
// com as lanternas acesas; a luz volta com o dia (~6h45 no fim de fevereiro)
export function ehMorgestraich(data, hora) {
  const [a, m, d] = data.split('-').map(Number), seg = new Date(pascoa(a) - 41 * 86400000);
  return seg.getUTCMonth() === m - 1 && seg.getUTCDate() === d && hora >= 4 && hora < 6.75;
}
// é Fasnacht em Basel nesta data e hora? (de segunda 4h a quinta 4h)
export function ehFasnacht(data, hora) {
  const [a, m, d] = data.split('-').map(Number);
  const seg = pascoa(a) - 41 * 86400000, t = Date.UTC(a, m - 1, d) + hora * 3600000;
  return t >= seg + 4 * 3600000 && t < seg + (3 * 24 + 4) * 3600000;
}

// temas das Cliques, das fotos do Commons (Category:Basler Fasnacht): cada Clique tem a mesma fantasia (o "Kostüm" do
// sujet do ano), Larven iguais de nariz enorme, cabeleira de lã e chapéu; o tambor é branco com cordas em diagonal
const TEMAS = [
  { padrao: 'listra', a: '#1f5aa6', b: '#f4f1ea', larve: '#f2c9b8', cabelo: '#ff8a1a', chapeu: '#1f5aa6' },   // Waggis
  { padrao: 'xadrez', a: '#151515', b: '#f4f1ea', larve: '#f4efe6', cabelo: '#e8e8e8', chapeu: '#151515' },   // arlequim p&b
  { padrao: 'losango', a: '#c8102e', b: '#2f8a4a', larve: '#f6e2c8', cabelo: '#f2c14e', chapeu: '#c8102e' },
  { padrao: 'liso', a: '#8a6a4a', b: '#d9772b', larve: '#f0b39a', cabelo: '#d9772b', chapeu: '#2b2b2b' },      // casaco com gola de pelo
  { padrao: 'losango', a: '#7b2d8b', b: '#f4f1ea', larve: '#f4efe6', cabelo: '#c8102e', chapeu: '#7b2d8b' },
  { padrao: 'losango', a: '#f2c14e', b: '#151515', larve: '#f6e2c8', cabelo: '#151515', chapeu: '#f2c14e' },
  { padrao: 'xadrez', a: '#2f8a4a', b: '#f4f1ea', larve: '#f2d0b0', cabelo: '#2f8a4a', chapeu: '#f4f1ea' },
  { padrao: 'listra', a: '#c8102e', b: '#f4f1ea', larve: '#f4efe6', cabelo: '#151515', chapeu: '#151515' },
  // retalhos: o Kostüm costurado de pedaços de 3 a 4 cores vivas, o mais comum nas fotos
  { padrao: 'retalho', a: '#e8452c', b: '#f2c14e', c: ['#1f9ad6', '#3fae5a', '#d6458f'], larve: '#f6e2c8', cabelo: '#ff2f8a', chapeu: '#1f9ad6' },
  { padrao: 'retalho', a: '#7b2d8b', b: '#ffd23f', c: ['#00a6a6', '#ff7a1a'], larve: '#f2d0b0', cabelo: '#ffd23f', chapeu: '#ff7a1a' },
  { padrao: 'losango', a: '#ff2f8a', b: '#00a6a6', larve: '#f4efe6', cabelo: '#7ad13b', chapeu: '#ffd23f' },
  { padrao: 'retalho', a: '#3fae5a', b: '#ff5fa2', c: ['#1f5aa6', '#f2c14e', '#e8452c'], larve: '#f6e2c8', cabelo: '#ff7a1a', chapeu: '#7b2d8b' },
];
function texPadrao({ padrao, a, b, c: extra = [] }) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = b; g.fillRect(0, 0, 128, 128); g.fillStyle = a;
  if (padrao === 'xadrez') for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { if ((x + y) % 2) g.fillRect(x * 16, y * 16, 16, 16); }
  else if (padrao === 'listra') for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 16, 128);
  else if (padrao === 'retalho') { const cs = [a, b, ...extra]; for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) { g.fillStyle = cs[(x * 7 + y * 3 + ((x * y) % 3)) % cs.length]; g.fillRect(x * 22 - 4, y * 22 - 4, 26, 26); } g.strokeStyle = '#151515'; g.lineWidth = 1.5; for (let k = 0; k < 7; k++) { g.beginPath(); g.moveTo(k * 22 - 4, 0); g.lineTo(k * 22 - 4, 128); g.moveTo(0, k * 22 - 4); g.lineTo(128, k * 22 - 4); g.stroke(); } }
  else if (padrao === 'losango') for (let y = -1; y < 5; y++) for (let x = -1; x < 5; x++) if ((x + y) % 2 === 0) { g.beginPath(); g.moveTo(x * 32 + 16, y * 32); g.lineTo(x * 32 + 32, y * 32 + 16); g.lineTo(x * 32 + 16, y * 32 + 32); g.lineTo(x * 32, y * 32 + 16); g.fill(); }
  else { g.fillRect(0, 0, 128, 128); g.fillStyle = b; g.fillRect(0, 0, 128, 18); } // casaco liso com gola
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); return t;
}
// rosto da Larve, pintado num canvas: o centro do rosto fica em u = 0,25 (a frente, +z, da SphereGeometry)
function texRosto(T) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = T.larve; g.fillRect(0, 0, 256, 128);
  const cx = 64;
  for (const s of [-1, 1]) {
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(cx + s * 13, 50, 10, 13, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#151515'; g.beginPath(); g.ellipse(cx + s * 12, 52, 5, 6, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#151515'; g.lineWidth = 3; g.beginPath(); g.arc(cx + s * 13, 44, 13, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); // sobrancelha
    g.fillStyle = 'rgba(220,60,60,0.55)'; g.beginPath(); g.arc(cx + s * 22, 72, 9, 0, Math.PI * 2); g.fill();                      // bochecha
  }
  g.fillStyle = '#b8202a'; g.beginPath(); g.ellipse(cx, 88, 14, 6, 0, 0, Math.PI); g.fill();                                   // boca
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const texTambor = (() => { let t = null; return () => { if (t) return t;
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 256, 64); g.strokeStyle = '#151515'; g.lineWidth = 3;
  for (let x = -64; x < 256; x += 16) { g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 32, 56); g.stroke(); }
  g.fillStyle = '#c8102e'; g.fillRect(0, 0, 256, 8); g.fillRect(0, 56, 256, 8);
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }; })();

function clique({ cena, altura, semente = 0, semLuz = false, semGugge = false }) {
  const T = TEMAS[semente % TEMAS.length];
  const g = new THREE.Group(); g.name = 'clique'; g.visible = false; cena.add(g);
  // ---- quem é quem: [papel, fileira (m atrás da frente), deslocamento lateral (m)] ----
  // Clique de pífaros e tambores (com a lanterna na frente) ou, uma a cada quatro, Guggenmusik: metais e bumbos, sem lanterna
  const gugge = !semGugge && semente % 4 === 3, M = []; // no Morgestraich não há Guggenmusik: só pífaros e tambores
  if (!gugge) {
    for (const b of [-0.9, 0.9]) for (const f of [-1.1, 1.1]) M.push(['carregador', f, b]);
    M.push(['tambormor', 4.5, 0]);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) M.push(['piccolo', 7 + r * 1.3, (c - 1.5) * 0.95]);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) M.push(['tambor', 13 + r * 1.5, (c - 1.5) * 1.0]);
  } else {
    M.push(['tambormor', 0, 0]);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) M.push(['metal', 2.5 + r * 1.4, (c - 2) * 0.95]);
    for (let c = 0; c < 3; c++) M.push(['bumbo', 7.4, (c - 1) * 1.3]);
    for (let c = 0; c < 4; c++) M.push(['tambor', 9.0, (c - 1.5) * 1.0]);
  }
  const n = M.length;
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0 });
  const matCorpo = new THREE.MeshStandardMaterial({ map: texPadrao(T), roughness: 0.8 });
  const matLarve = new THREE.MeshStandardMaterial({ map: texRosto(T), roughness: 0.45 });
  const matNariz = new THREE.MeshStandardMaterial({ color: T.larve, roughness: 0.45 });
  const matCabelo = new THREE.MeshStandardMaterial({ color: T.cabelo, roughness: 1 });
  const matChapeu = new THREE.MeshStandardMaterial({ color: T.chapeu, roughness: 0.7 });
  const matTambor = new THREE.MeshStandardMaterial({ map: texTambor(), roughness: 0.5 });
  const matPerna = new THREE.MeshStandardMaterial({ color: T.padrao === 'liso' ? '#2b2b2b' : T.b, roughness: 0.85 });
  const matAcess = { piccolo: new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.3 }), tambor: new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.6 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: 0.85, roughness: 0.25 }), bumbo: new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.6 }) };
  const inst = (geo, cont, m0 = mat) => { const m = new THREE.InstancedMesh(geo, m0, cont); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.castShadow = true; m.frustumCulled = false; g.add(m); return m; };
  // corpo: fantasia até o joelho, pernas de meia e sapato preto
  const corpo = inst(new THREE.CylinderGeometry(0.21, 0.34, 1.0, 12).translate(0, 0.95, 0), n, matCorpo);
  const pernas = inst(mergeGeometries([0.1, -0.1].flatMap((x) => [new THREE.CylinderGeometry(0.065, 0.055, 0.5, 6).translate(x, 0.27, 0), new THREE.BoxGeometry(0.11, 0.07, 0.24).translate(x, 0.035, 0.05)])), n, matPerna);
  // Larve: cabeça grande, rosto pintado (olhos enormes, bochechas, boca), nariz comprido, cabeleira de lã, chapéu
  const cabeca = inst(new THREE.SphereGeometry(0.3, 16, 12).scale(1.05, 1.3, 1.05).translate(0, 1.72, 0), n, matLarve);
  const nariz = inst(new THREE.ConeGeometry(0.1, 0.62, 8).rotateX(Math.PI / 2).translate(0, 1.67, 0.55), n, matNariz);
  const cabelo = inst(new THREE.TorusGeometry(0.3, 0.13, 6, 14).rotateX(Math.PI / 2).translate(0, 1.94, -0.04), n, matCabelo);
  // Kopfladärne: a lanterninha acesa presa no alto do chapéu (no escuro do Morgestraich é ela que mostra quem passa)
  const matKopf = new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffd27a, emissiveIntensity: 0.2, roughness: 0.5 });
  const kopf = inst(new THREE.BoxGeometry(0.2, 0.24, 0.2).translate(0, T.padrao === 'liso' ? 2.26 : 2.72, 0), n, matKopf); kopf.castShadow = false;
  const chapeu = inst(T.padrao === 'liso' ? new THREE.CylinderGeometry(0.34, 0.36, 0.14, 3).translate(0, 2.05, 0) : new THREE.ConeGeometry(0.28, 0.62, 8).translate(0, 2.32, 0), n, matChapeu); // tricórnio ou chapéu de ponta
  // braços e o que cada um leva, na pose do papel (ombros a 1,38 m)
  const braco = (a, b, rr = 0.055) => { const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), L = va.distanceTo(vb); const c = new THREE.CylinderGeometry(rr, rr * 0.85, L, 6); c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize())); return c.translate((va.x + vb.x) / 2, (va.y + vb.y) / 2, (va.z + vb.z) / 2); };
  const POSE = {
    carregador: [[[-0.22, 1.38, 0], [-0.3, 1.25, 0.15]], [[0.22, 1.38, 0], [0.3, 1.25, 0.15]]],
    tambormor: [[[-0.22, 1.38, 0], [-0.3, 0.95, 0.12]], [[0.22, 1.38, 0], [0.38, 1.75, 0.25]]],
    piccolo: [[[-0.22, 1.38, 0], [-0.08, 1.55, 0.38]], [[0.22, 1.38, 0], [0.22, 1.55, 0.36]]],
    tambor: [[[-0.22, 1.38, 0], [-0.16, 1.02, 0.36]], [[0.22, 1.38, 0], [0.16, 1.05, 0.36]]],
    metal: [[[-0.22, 1.38, 0], [-0.06, 1.55, 0.36]], [[0.22, 1.38, 0], [0.06, 1.52, 0.4]]],
    bumbo: [[[-0.22, 1.38, 0], [-0.3, 1.15, 0.3]], [[0.22, 1.38, 0], [0.3, 1.2, 0.3]]],
  };
  const ACESS = {
    piccolo: () => braco([-0.1, 1.6, 0.42], [0.32, 1.58, 0.38], 0.016),                                      // o flautim, de lado
    tambor: () => mergeGeometries([braco([-0.16, 1.02, 0.36], [-0.05, 1.12, 0.5], 0.012), braco([0.16, 1.05, 0.36], [0.05, 1.1, 0.5], 0.012)]), // baquetas
    metal: () => mergeGeometries([new THREE.ConeGeometry(0.11, 0.28, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 1.55, 0.72), braco([0, 1.55, 0.36], [0, 1.55, 0.6], 0.025)]), // trompete
    bumbo: () => new THREE.CylinderGeometry(0.46, 0.46, 0.36, 18).rotateZ(Math.PI / 2).translate(0, 1.0, 0.45),      // bumbo de lado
  };
  const papeis = [...new Set(M.map((x) => x[0]))], idx = new Int32Array(n), cont = {};
  M.forEach(([p], i) => { idx[i] = cont[p] = (cont[p] ?? -1) + 1; });
  const bracos = {}, acess = {};
  for (const p of papeis) {
    bracos[p] = inst(mergeGeometries(POSE[p].map(([a, b]) => braco(a, b))), cont[p] + 1, matCorpo);
    if (ACESS[p]) acess[p] = inst(ACESS[p](), cont[p] + 1, p === 'bumbo' ? matTambor : matAcess[p]);
  }
  const nT = M.filter((x) => x[0] === 'tambor').length;
  const tambor = inst(new THREE.CylinderGeometry(0.24, 0.24, 0.36, 16).translate(0, 0.86, 0.32), Math.max(1, nT), matTambor); // de pé na frente do corpo, como na Basler Trommel
  const bastao = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.9, 6), new THREE.MeshStandardMaterial({ color: 0xc9a13b, metalness: 0.7, roughness: 0.3 }));
  g.add(bastao);
  // lanterna: caixa translúcida pintada (sujet satírico, cores fortes) que brilha por dentro, em dois varais
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 384;
  { const c = cv.getContext('2d'); c.fillStyle = '#f6ecd0'; c.fillRect(0, 0, 256, 384);
    const cores = ['#e8102e', '#1f7ae6', '#2fb04a', '#ffc81e', '#a12dbb', '#ff6a00', '#ff2f8a', '#00b3b3', '#151515'];
    c.fillStyle = cores[semente % 8]; c.fillRect(0, 0, 256, 384); c.fillStyle = '#ffe9a8'; c.fillRect(14, 14, 228, 330);
    for (let i = 0; i < 40; i++) { c.fillStyle = cores[i % cores.length]; c.beginPath(); c.ellipse(20 + ((i * 97) % 220), 30 + ((i * 53) % 320), 12 + (i % 5) * 9, 10 + (i % 4) * 12, i, 0, TAU); c.fill(); }
    c.fillStyle = '#151515'; c.font = 'bold 34px serif'; c.fillText('BASEL', 70, 360); c.lineWidth = 8; c.strokeStyle = '#151515'; c.strokeRect(4, 4, 248, 376); }
  const texL = new THREE.CanvasTexture(cv); texL.colorSpace = THREE.SRGBColorSpace;
  const matL = new THREE.MeshStandardMaterial({ map: texL, emissive: 0xffffff, emissiveMap: texL, emissiveIntensity: 0.6, roughness: 0.6 });
  const lanterna = new THREE.Group();
  lanterna.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.55).translate(0, 2.55, 0), matL));
  const madeira = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.9 });
  for (const b of [-0.9, 0.9]) lanterna.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 3.0).translate(b, 1.25, 0), madeira));
  lanterna.add(new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.08).translate(0, 1.27, 0.6), madeira), new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.08).translate(0, 1.27, -0.6), madeira));
  // luz de verdade só nas Cliques de sempre (cada luz a mais pesa em todos os materiais); as extras do Morgestraich só brilham
  const luzL = semLuz ? { intensity: 0 } : new THREE.PointLight(0xffe2a8, 0, 14, 2); if (!semLuz) { luzL.position.set(0, 2.5, 0); lanterna.add(luzL); }
  g.add(lanterna);
  lanterna.visible = !gugge;
  // variação leve de tom entre os membros (o tema é o mesmo; tecido e tinta mudam um pouco)
  { const c = new THREE.Color();
    const h = new THREE.Color();
    for (let i = 0; i < n; i++) { const k = 0.9 + ((i * 37) % 11) / 50; c.setRGB(k, k, k);
      for (const m of [corpo, cabeca, nariz, pernas]) m.setColorAt(i, c);
      // cabeleira e chapéu: o tema e, em parte da Clique, outra cor viva (cada um enfeita a sua)
      h.setHSL(((i * 0.618) + semente * 0.13) % 1, 0.85, 0.55);
      cabelo.setColorAt(i, (i * 7) % 3 === 0 ? h : c); chapeu.setColorAt(i, (i * 5) % 4 === 0 ? h : c); }
    for (const m of [corpo, cabeca, nariz, cabelo, chapeu, pernas]) m.instanceColor.needsUpdate = true; }
  // quem a e-bike (ou quem anda) derruba: s no chão e direção da queda; a Clique segue, o caído fica onde caiu
  const caido = new Float32Array(n), caiX = new Float32Array(n), caiZ = new Float32Array(n), caiP = new Float32Array(n * 3), CAIDO = 6;
  const eixo = new THREE.Vector3(), qT = new THREE.Quaternion();
  // ---- caminho e marcha ----
  let pts = null, acum = null, total = 0, s0 = 0, vel = 1.05, t0 = 0, volta = false, vaivem = false;
  const em = (s, o) => { // posição e rumo no caminho a s metros
    let inverte = false;
    if (vaivem) { s = ((s % (2 * total)) + 2 * total) % (2 * total); if (s > total) { s = 2 * total - s; inverte = true; } } // chega ao fim e volta
    else if (volta) s = ((s % total) + total) % total; else s = Math.max(0, Math.min(total, s));
    let i = 1; while (i < acum.length - 1 && acum[i] < s) i++;
    const a = pts[i - 1], b = pts[i], k = (s - acum[i - 1]) / Math.max(1e-6, acum[i] - acum[i - 1]);
    o.x = a[0] + (b[0] - a[0]) * k; o.z = a[1] + (b[1] - a[1]) * k; const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; o.hx = (b[0] - a[0]) / L * (inverte ? -1 : 1); o.hz = (b[1] - a[1]) / L * (inverte ? -1 : 1); return o;
  };
  function marchar(caminho, { inicio = 0, velocidade = 1.05, circuito = false, idaEVolta = false } = {}) {
    pts = caminho; acum = [0];
    for (let i = 1; i < pts.length; i++) acum.push(acum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    total = acum.at(-1); s0 = inicio; vel = velocidade; volta = circuito; vaivem = idaEVolta; t0 = performance.now(); g.visible = true;
  }
  function parar() { g.visible = false; pts = null; }

  // ---- a cada quadro ----
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), esc = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0), P = {};
  function atualizar(agora, camera, noite = 0) {
    if (!g.visible || !pts) return;
    const s = s0 + ((agora - t0) / 1000) * vel;
    let iT = 0, dMin = 1e9;
    const dt = Math.min(0.1, (agora - (atualizar.t || agora)) / 1000); atualizar.t = agora;
    M.forEach(([tipo, fil, lat], i) => {
      em(s - fil, P);
      let x = P.x - P.hz * lat, z = P.z + P.hx * lat, y = altura(x, z);
      if (caido[i] > 0) { caido[i] = Math.max(0, caido[i] - dt); x = caiP[i * 3]; z = caiP[i * 3 + 2]; y = caiP[i * 3 + 1]; }
      const fase = (agora / 1000) * vel * 1.9 + i * 0.37, pulo = Math.abs(Math.sin(fase * Math.PI)) * 0.05;
      q.setFromAxisAngle(Y, Math.atan2(P.hx, P.hz) + Math.sin(fase * Math.PI) * 0.05);
      if (caido[i] > 0) { // tomba: gira em torno do eixo horizontal perpendicular à queda
        const th = (Math.PI / 2) * Math.min(1, (CAIDO - caido[i]) / 0.35, caido[i] / 0.6);
        qT.setFromAxisAngle(eixo.set(caiZ[i], 0, -caiX[i]), th); q.premultiply(qT);
      }
      const k = tipo === 'tambormor' ? 1.2 : 1;
      esc.set(k, k, k); m4.compose(v.set(x, y + pulo, z), q, esc);
      for (const im of [corpo, pernas, cabeca, nariz, cabelo, chapeu, kopf]) im.setMatrixAt(i, m4);
      bracos[tipo].setMatrixAt(idx[i], m4); if (acess[tipo]) acess[tipo].setMatrixAt(idx[i], m4);
      if (tipo === 'tambor') tambor.setMatrixAt(iT++, m4);
      if (tipo === 'tambormor') { bastao.position.set(x + P.hx * 0.4, y + 1.2 + Math.sin(fase * 2) * 0.35, z + P.hz * 0.4); bastao.rotation.set(Math.sin(fase) * 0.4, 0, 0.2); }
      if (camera) dMin = Math.min(dMin, Math.hypot(x - camera.position.x, z - camera.position.z));
    });
    for (const im of [corpo, pernas, cabeca, nariz, cabelo, chapeu, kopf, tambor, ...Object.values(bracos), ...Object.values(acess)]) im.instanceMatrix.needsUpdate = true;
    em(s, P); lanterna.position.set(P.x, altura(P.x, P.z) + Math.abs(Math.sin((agora / 1000) * vel * 1.9 * Math.PI)) * 0.04, P.z); lanterna.rotation.y = Math.atan2(P.hx, P.hz);
    luzL.intensity = 6 * noite; matL.emissiveIntensity = 0.35 + 1.4 * noite; matKopf.emissiveIntensity = 0.15 + 2.6 * noite;
    return dMin;
  }
  // derruba quem estiver a menos de r de (x, z); devolve quantos
  function derruba(x0, z0, r, fx, fz) {
    if (!g.visible || !pts) return 0;
    const s = s0 + ((performance.now() - t0) / 1000) * vel; let k = 0;
    M.forEach(([, fil, lat], i) => {
      if (caido[i] > 0) return;
      em(s - fil, P); const x = P.x - P.hz * lat, z = P.z + P.hx * lat;
      if (Math.hypot(x - x0, z - z0) < r) { caido[i] = CAIDO; caiX[i] = fx; caiZ[i] = fz; caiP[i * 3] = x; caiP[i * 3 + 1] = altura(x, z); caiP[i * 3 + 2] = z; k++; }
    });
    return k;
  }
  return { marchar, parar, atualizar, derruba, grupo: g, visivel: () => g.visible, onde: () => (gugge ? [corpo.instanceMatrix.array[12], corpo.instanceMatrix.array[13], corpo.instanceMatrix.array[14]] : lanterna.position.toArray()) };
}

// ---- Wagen: os carros alegóricos do Cortège (segunda e quarta à tarde): trator puxando uma carreta enfeitada com uma
// escultura satírica de papel machê, e Waggis em cima (máscara de nariz enorme, cabeleira amarela, camisa azul e branca)
// jogando laranjas, balas e Räppli para o público
const SUJETS = [ // a escultura de cima: cabeça de caricatura, pilha de formas, um bicho
  { tipo: 'cabeca', cor: '#f2c9b8', extra: '#e8102e' }, { tipo: 'pilha', cor: '#1f7ae6', extra: '#ffc81e' },
  { tipo: 'bicho', cor: '#2fb04a', extra: '#ff6a00' }, { tipo: 'cabeca', cor: '#ffd23f', extra: '#7b2d8b' },
  { tipo: 'pilha', cor: '#ff2f8a', extra: '#00b3b3' }, { tipo: 'bicho', cor: '#a12dbb', extra: '#f4f1ea' },
];
function texLateral(cores, semente) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = cores[0]; g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 18; i++) { g.fillStyle = cores[(i + semente) % cores.length]; g.beginPath(); g.arc((i * 61 + semente * 17) % 256, 12 + (i * 23) % 44, 6 + (i % 4) * 4, 0, TAU); g.fill(); }
  g.fillStyle = '#151515'; g.font = 'bold 20px sans-serif'; g.fillText(['FASNACHT', 'BASEL', 'SUJET', 'DÄSCHER', 'WAGGIS', 'RÄPPLI'][semente % 6], 70, 42);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function wagen({ cena, semente = 0 }) {
  const g = new THREE.Group(); g.name = 'wagen'; g.visible = false; cena.add(g);
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  const roda = (r, w, x, y, z) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14).rotateZ(Math.PI / 2), M(0x1d1d1d)); o.position.set(x, y, z); g.add(o); return o; };
  // trator (verde, rodas grandes atrás) na frente, +z
  box(1.4, 1.0, 2.4, M(0x2f7a32), 0, 1.05, 4.6); box(1.1, 1.0, 1.0, M(0x2f7a32), 0, 2.0, 4.0); box(1.0, 0.7, 0.05, M(0x8fb4c4, { roughness: 0.2 }), 0, 2.1, 4.52);
  roda(0.75, 0.45, 0.85, 0.75, 3.9); roda(0.75, 0.45, -0.85, 0.75, 3.9); roda(0.45, 0.3, 0.7, 0.45, 5.4); roda(0.45, 0.3, -0.7, 0.45, 5.4);
  // carreta: plataforma de 6 × 2,5 m com laterais pintadas e saia de franjas
  const S = SUJETS[semente % SUJETS.length], cores = [S.cor, S.extra, '#f4f1ea', '#151515', '#ffc81e'];
  const lat = new THREE.MeshStandardMaterial({ map: texLateral(cores, semente), roughness: 0.75 });
  box(2.5, 0.2, 6, M(0x5a3a22), 0, 1.0, 0);
  for (const sx of [-1, 1]) { const l = box(0.06, 0.8, 6, lat, sx * 1.26, 0.6, 0); l.rotation.y = 0; }
  for (const sz of [-1, 1]) box(2.5, 0.8, 0.06, lat, 0, 0.6, sz * 3.0);
  for (const z of [-2, 2]) { roda(0.4, 0.3, 1.1, 0.4, z); roda(0.4, 0.3, -1.1, 0.4, z); }
  // escultura de cima
  const mc = M(S.cor, { roughness: 0.6 }), me = M(S.extra, { roughness: 0.6 });
  if (S.tipo === 'cabeca') { // cabeça de caricatura com nariz comprido e chapéu
    const c = new THREE.Mesh(new THREE.SphereGeometry(1.4, 18, 14).scale(1, 1.15, 1), mc); c.position.set(0, 3.4, -1.2); g.add(c);
    const n = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2.2, 12).rotateX(Math.PI / 2), mc); n.position.set(0, 3.3, 0.6); g.add(n);
    const ch = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.8, 14), me); ch.position.set(0, 5.2, -1.2); g.add(ch);
    for (const sx of [-1, 1]) { const o = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), M(0xffffff)); o.position.set(sx * 0.5, 3.8, 0.0); g.add(o); const p = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), M(0x151515)); p.position.set(sx * 0.5, 3.8, 0.28); g.add(p); }
  } else if (S.tipo === 'pilha') { // pilha torta de caixas e uma bola, o sujet do ano
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.8 - i * 0.3, 0.9, 1.8 - i * 0.3), i % 2 ? me : mc); b.position.set((i % 2 ? 0.2 : -0.2), 1.6 + i * 0.9, -1.4); b.rotation.y = i * 0.35; g.add(b); }
    const bola = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 10), me); bola.position.set(0, 5.4, -1.4); g.add(bola);
  } else { // bicho: corpo, cabeça, orelhas
    const corpo = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12).scale(1.6, 1, 1), mc); corpo.position.set(0, 2.6, -1.4); corpo.rotation.y = Math.PI / 2; g.add(corpo);
    const cab = new THREE.Mesh(new THREE.SphereGeometry(0.8, 14, 10), mc); cab.position.set(0, 3.6, 0.6); g.add(cab);
    for (const sx of [-1, 1]) { const o = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 8), me); o.position.set(sx * 0.45, 4.4, 0.6); g.add(o); }
  }
  // Waggis em cima da carreta: camisa azul e branca, cabeleira amarela, nariz enorme, braço que joga
  const waggis = [];
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Group(), x = (i % 2 ? 0.8 : -0.8), z = i < 2 ? 2.0 : 0.6;
    const corpo = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.0, 10), new THREE.MeshStandardMaterial({ map: texPadrao({ padrao: 'listra', a: '#1f5aa6', b: '#f4f1ea' }), roughness: 0.8 })); corpo.position.y = 0.6;
    const cab = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10).scale(1, 1.2, 1), M(0xf2c9b8)); cab.position.y = 1.4;
    const nar = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.55, 8).rotateX(Math.PI / 2), M(0xf2c9b8)); nar.position.set(0, 1.35, 0.42);
    const cab2 = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.13, 6, 14).rotateX(Math.PI / 2), M(0xffc81e, { roughness: 1 })); cab2.position.y = 1.62;
    const braco = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.6, 6).translate(0, 0.3, 0), M(0xf4f1ea)); braco.position.set(0.25, 1.0, 0);
    w.add(corpo, cab, nar, cab2, braco); w.position.set(x, 1.1, z); w.rotation.y = (i % 2 ? -1 : 1) * 1.2; g.add(w); waggis.push({ w, braco, fase: i * 1.7 });
  }
  // laranjas voando: 18 por carro, em arco, dos Waggis para a calçada
  const NL = 18, pl = new Float32Array(NL * 3), gl = new THREE.BufferGeometry(); gl.setAttribute('position', new THREE.BufferAttribute(pl, 3));
  const laranjas = new THREE.Points(gl, new THREE.PointsMaterial({ color: 0xff8a1a, size: 0.16, sizeAttenuation: true })); laranjas.frustumCulled = false; cena.add(laranjas); laranjas.visible = false;
  return { g, waggis, laranjas, pl, gl, NL };
}
// os carros seguem o caminho (pontos x,z) num vaivém, a ~1,1 m/s (o passo do Cortège)
function andarWagen(W, cam, s, agora, altura) {
  const { pts, acum, total } = cam; let ss = ((s % (2 * total)) + 2 * total) % (2 * total), volta = false; if (ss > total) { ss = 2 * total - ss; volta = true; }
  let i = 1; while (i < acum.length - 1 && acum[i] < ss) i++;
  const a = pts[i - 1], b = pts[i], k = (ss - acum[i - 1]) / Math.max(1e-6, acum[i] - acum[i - 1]);
  const x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k; let rumo = Math.atan2(b[0] - a[0], b[1] - a[1]); if (volta) rumo += Math.PI;
  W.g.position.set(x, altura(x, z), z); W.g.rotation.y = rumo;
  const t = agora / 1000;
  for (const q of W.waggis) q.braco.rotation.x = -1.2 - 1.1 * Math.max(0, Math.sin(t * 2.2 + q.fase)); // o braço que joga
  // laranjas: cada uma num arco de 1,4 s, saindo de um Waggis para um lado da rua
  const sx = Math.sin(rumo), sz = Math.cos(rumo), nx = sz, nz = -sx;
  for (let j = 0; j < W.NL; j++) {
    const u = ((t * 0.7 + j / W.NL) % 1), lado = j % 2 ? 1 : -1, w = W.waggis[j % 4].w.position, d = 1 + 6 * u;
    const ox = x + sx * w.z + nx * (w.x + lado * d), oz = z + sz * w.z + nz * (w.x + lado * d);
    W.pl[j * 3] = ox; W.pl[j * 3 + 1] = altura(x, z) + 2.6 + 3.2 * u - 6 * u * u; W.pl[j * 3 + 2] = oz;
  }
  W.gl.attributes.position.needsUpdate = true;
}

// ---- som: tambor de marcha (ruído em rajadas com acento), da Clique mais perto ----
let ac = null, ganho = null, ultCompasso = 0;
function somVol(v) { if (ganho) ganho.gain.setTargetAtTime(v, ac.currentTime, 0.3); }
function tocar() {
  try {
    ac ??= new AudioContext(); if (ac.state === 'suspended') ac.resume();
    if (!ganho) { ganho = ac.createGain(); ganho.gain.value = 0; ganho.connect(ac.destination); }
    const t = ac.currentTime, buf = ac.createBuffer(1, ac.sampleRate * 0.06, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.012));
    const passo = 60 / 112 / 4; // semicolcheias a 112 bpm (marcha de Basel)
    const ritmo = [1, 0, 0.5, 0.4, 0.8, 0, 0.5, 0.5, 1, 0.4, 0.4, 0.4, 0.9, 0, 0.6, 0];
    for (let k = 0; k < 16; k++) { if (!ritmo[k]) continue;
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), gg = ac.createGain();
      s.buffer = buf; f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.8; gg.gain.value = ritmo[k];
      s.connect(f).connect(gg).connect(ganho); s.start(t + k * passo); }
  } catch { /* sem áudio */ }
}

// ruas do centro por onde as Cliques passam (nomes do OSM); cada uma vira um caminho de ida e volta
const RUAS = ['Freie Strasse', 'Gerbergasse', 'Spalenberg', 'Clarastrasse', 'Augustinergasse', 'Steinenvorstadt', 'Eisengasse', 'Marktplatz',
  'Spalenvorstadt', 'Rheinsprung', 'Münsterplatz', 'Barfüsserplatz', 'Steinenberg', 'Greifengasse', 'Rheingasse', 'Schneidergasse'];
// junta os trechos do OSM com o mesmo nome numa linha só (encadeando pelas pontas), a mais longa
function ruaPorNome(ruas, nome) {
  const ls = ruas.linhas.filter((l) => l.n === nome).map((l) => { const p = []; for (let i = 0; i < l.c.length; i += 2) p.push([l.c[i], l.c[i + 1]]); return p; });
  if (!ls.length) return null;
  let melhor = null;
  for (let k = 0; k < ls.length; k++) {
    let cad = ls[k].slice(); const resto = ls.filter((_, j) => j !== k); let mudou = true;
    while (mudou) { mudou = false;
      for (let j = 0; j < resto.length; j++) { const l = resto[j], a = cad.at(-1), b = cad[0], perto = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.5;
        if (perto(a, l[0])) cad = cad.concat(l.slice(1)); else if (perto(a, l.at(-1))) cad = cad.concat(l.slice(0, -1).reverse());
        else if (perto(b, l.at(-1))) cad = l.slice(0, -1).concat(cad); else if (perto(b, l[0])) cad = l.slice(1).reverse().concat(cad); else continue;
        resto.splice(j, 1); j--; mudou = true; } }
    const L = cad.reduce((s, p, i) => s + (i ? Math.hypot(p[0] - cad[i - 1][0], p[1] - cad[i - 1][1]) : 0), 0);
    if (!melhor || L > melhor.L) melhor = { cad, L };
  }
  return melhor.L > 60 ? melhor.cad : null;
}

// várias Cliques pela cidade nos dias de Fasnacht (ou quando o tour pede); `forcar`: true liga, false desliga, null segue a data
export function criarFasnacht({ cena, altura, ruas, ceu }) {
  const caminhos = RUAS.map((n) => ruaPorNome(ruas, n)).filter(Boolean);
  const cs = caminhos.map((_, i) => clique({ cena, altura, semente: i }));
  // Räppli: confete colorido pelo chão das ruas por onde as Cliques passam (some quando acaba a Fasnacht)
  const pc = [], cc = [], CORES = ['#c8102e', '#f2c14e', '#1f5aa6', '#2f8a4a', '#f4f1ea', '#ff7a1a', '#7b2d8b', '#ff5fa2'].map((c) => new THREE.Color(c));
  let sem = 7; const rnd = () => ((sem = (sem * 16807) % 2147483647) / 2147483647);
  for (const cam of caminhos) for (let i = 1; i < cam.length; i++) {
    const [ax, az] = cam[i - 1], [bx, bz] = cam[i], L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / (L || 1), nz = (bx - ax) / (L || 1);
    for (let k = 0; k < L * 22; k++) { const t = rnd(), d = (rnd() - 0.5) * 8; const x = ax + (bx - ax) * t + nx * d, z = az + (bz - az) * t + nz * d;
      pc.push(x, altura(x, z) + 0.03, z); CORES[Math.floor(rnd() * CORES.length)].toArray(cc, cc.length); }
  }
  const gC = new THREE.BufferGeometry(); gC.setAttribute('position', new THREE.Float32BufferAttribute(pc, 3)); gC.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
  const rappli = new THREE.Points(gC, new THREE.PointsMaterial({ size: 0.1, vertexColors: true, sizeAttenuation: true }));
  rappli.visible = false; rappli.frustumCulled = false; rappli.name = 'Räppli'; cena.add(rappli);
  // bandeirinhas: varais de flâmulas coloridas atravessando as ruas do desfile, a cada ~14 m, a 6–7 m do chão, com barriga
  const BAND = [];
  for (const cam of caminhos) { let falta = 6;
    for (let i = 1; i < cam.length; i++) {
      const [ax, az] = cam[i - 1], [bx, bz] = cam[i], L = Math.hypot(bx - ax, bz - az); if (L < 1e-3) continue;
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (let t = falta; t < L; t += 14) { const x = ax + (bx - ax) * t / L, z = az + (bz - az) * t / L; BAND.push([x, z, nx, nz, altura(x, z) + 6 + rnd()]); }
      falta = 14 - ((L - falta) % 14);
    } }
  const POR = 16, LARGV = 9; // flâmulas por varal, largura do varal (m)
  const geoF = new THREE.BufferGeometry(); geoF.setAttribute('position', new THREE.Float32BufferAttribute([-0.17, 0, 0, 0.17, 0, 0, 0, -0.42, 0], 3)); geoF.computeVertexNormals();
  const band = new THREE.InstancedMesh(geoF, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7, emissive: 0x222222 }), BAND.length * POR);
  const pv = []; { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), Yv = new THREE.Vector3(0, 1, 0), CF = ['#e8102e', '#ffc81e', '#1f7ae6', '#2fb04a', '#ff6a00', '#a12dbb', '#ff2f8a', '#00b3b3', '#f4f1ea'].map((c) => new THREE.Color(c));
    BAND.forEach(([x, z, nx, nz, y], b) => {
      q.setFromAxisAngle(Yv, Math.atan2(nz, -nx) + 0); // flâmula no plano do varal
      for (let k = 0; k < POR; k++) { const u = (k + 0.5) / POR - 0.5, d = u * LARGV, yy = y - 0.9 * (1 - 4 * u * u);
        m.compose(p.set(x + nx * d, yy, z + nz * d), q, e); band.setMatrixAt(b * POR + k, m); band.setColorAt(b * POR + k, CF[(k + b * 3) % CF.length]); }
      for (let k = 0; k < 12; k++) { const u0 = k / 12 - 0.5, u1 = (k + 1) / 12 - 0.5; pv.push(x + nx * u0 * LARGV, y - 0.9 * (1 - 4 * u0 * u0), z + nz * u0 * LARGV, x + nx * u1 * LARGV, y - 0.9 * (1 - 4 * u1 * u1), z + nz * u1 * LARGV); }
    }); }
  band.frustumCulled = false; band.visible = false; band.name = 'bandeirinhas'; cena.add(band);
  const gV = new THREE.BufferGeometry(); gV.setAttribute('position', new THREE.Float32BufferAttribute(pv, 3));
  const varal = new THREE.LineSegments(gV, new THREE.LineBasicMaterial({ color: 0x3a3a3a })); varal.visible = false; varal.frustumCulled = false; cena.add(varal);
  // Cortège: os Wagen saem nas tardes de segunda e quarta (13h30–18h30) pelas ruas largas; no tour, também na Augustinergasse
  const RUAS_WAGEN = ['Freie Strasse', 'Gerbergasse', 'Clarastrasse', 'Steinenvorstadt', 'Marktplatz', 'Barfüsserplatz', 'Steinenberg', 'Greifengasse', 'Augustinergasse', 'Münsterplatz'];
  const camW = RUAS_WAGEN.map((n) => ruaPorNome(ruas, n)).filter(Boolean).map((pts) => { const acum = [0]; for (let i = 1; i < pts.length; i++) acum.push(acum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return { pts, acum, total: acum.at(-1) }; });
  let carros = null, cortegeOn = false, forcarCortege = null;
  const ehCortege = (data, hora) => { const [a, m, d] = data.split('-').map(Number), seg = segundaFasnacht(a), dia = Math.round((Date.UTC(a, m - 1, d) - seg) / 86400000); return (dia === 0 || dia === 2) && hora >= 13.5 && hora < 18.5; };
  function cortege(on) {
    if (on === cortegeOn) return; cortegeOn = on;
    if (on && !carros) carros = camW.flatMap((c, i) => [0, 1].map((k) => ({ W: wagen({ cena, semente: i * 2 + k }), c, s0: k * c.total * 0.5 + i * 23, v: 1.0 + ((i + k) % 3) * 0.12 })));
    carros?.forEach(({ W }) => { W.g.visible = on; W.laranjas.visible = on; });
  }
  let ligada = false, forcar = null;
  function ligar(on) {
    if (on === ligada) return; ligada = on; rappli.visible = on; band.visible = on; varal.visible = on;
    cs.forEach((c, i) => (on ? c.marchar(caminhos[i], { inicio: i * 37, velocidade: 1.0 + (i % 3) * 0.08, idaEVolta: true }) : c.parar()));
    if (!on) somVol(0);
  }
  // Morgestraich: às 4h saem muitas mais Cliques; uma segunda em cada rua, no outro trecho, criada só na primeira vez
  // (sem Guggenmusik e sem luz de ponto: a lanterna grande e as de cabeça brilham sozinhas no escuro)
  let extras = null, extrasOn = false;
  function morgestraich(on) {
    if (on === extrasOn) return; extrasOn = on;
    if (on && !extras) extras = caminhos.map((_, i) => clique({ cena, altura, semente: i + 5, semLuz: true, semGugge: true }));
    extras?.forEach((c, i) => (on ? c.marchar(caminhos[i], { inicio: i * 37 + 140, velocidade: 0.92 + (i % 4) * 0.06, idaEVolta: true }) : c.parar()));
  }
  function atualizar(agora, camera, noite = 0, apagao = 0) {
    const e = ceu.estado();
    ligar(forcar ?? ehFasnacht(e.data, e.hora));
    morgestraich(ligada && apagao > 0.5);
    cortege(ligada && (forcarCortege ?? ehCortege(e.data, e.hora)));
    if (cortegeOn) for (const k of carros) andarWagen(k.W, k.c, k.s0 + (agora / 1000) * k.v, agora, altura);
    if (!ligada) return;
    const brilho = Math.max(noite, apagao); // no apagão as lanternas brilham como de noite
    rappli.material.color.setScalar(1 - 0.8 * brilho); // o confete do chão não tem luz própria: no escuro, escuro
    let d = 1e9; for (const c of cs) d = Math.min(d, c.atualizar(agora, camera, brilho) ?? 1e9);
    if (extrasOn) for (const c of extras) d = Math.min(d, c.atualizar(agora, camera, brilho) ?? 1e9);
    const prox = Math.max(0, 1 - d / 120);
    if (prox > 0.02 && agora - ultCompasso > (60 / 112) * 4 * 1000 - 30) { ultCompasso = agora; tocar(); }
    somVol(prox * prox * 0.35);
  }
  const derruba = (x, z, r, fx, fz) => (ligada ? [...cs, ...(extrasOn ? extras : [])].reduce((k, c) => k + c.derruba(x, z, r, fx, fz), 0) : 0);
  return { atualizar, derruba, forcar: (v) => { forcar = v; }, forcarCortege: (v) => { forcarCortege = v; }, cortege: () => cortegeOn, cliques: cs.length, ativa: () => ligada, morgestraich: () => extrasOn, onde: () => [...cs, ...(extrasOn ? extras : [])].map((c) => c.onde()) };
}
