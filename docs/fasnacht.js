// Fasnacht (2026-11-19): uma Clique passando, como nos três dias de Basel: a lanterna pintada e acesa na frente, levada
// por quatro, o tambor-mor com o bastão, quatro fileiras de flautins (Piccolos) e três de tambores, todos de Larve (as
// máscaras grandes, de nariz comprido) e fantasia colorida. Anda a passo de marcha por um caminho (pontos x,z) e, perto da
// câmera, soa o tambor de marcha (ruído filtrado, sintetizado; nada é baixado).
// No tour ela desce a Augustinergasse em fevereiro; fora dele, aparece nos dias reais: da segunda depois da Quarta-feira de
// Cinzas (Páscoa − 41 dias, 4h, Morgestraich) até quinta às 4h, num circuito pela Freie Strasse e a Marktplatz.
import * as THREE from 'three';

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
];
function texPadrao({ padrao, a, b }) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = b; g.fillRect(0, 0, 128, 128); g.fillStyle = a;
  if (padrao === 'xadrez') for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { if ((x + y) % 2) g.fillRect(x * 16, y * 16, 16, 16); }
  else if (padrao === 'listra') for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 16, 128);
  else if (padrao === 'losango') for (let y = -1; y < 5; y++) for (let x = -1; x < 5; x++) if ((x + y) % 2 === 0) { g.beginPath(); g.moveTo(x * 32 + 16, y * 32); g.lineTo(x * 32 + 32, y * 32 + 16); g.lineTo(x * 32 + 16, y * 32 + 32); g.lineTo(x * 32, y * 32 + 16); g.fill(); }
  else { g.fillRect(0, 0, 128, 128); g.fillStyle = b; g.fillRect(0, 0, 128, 18); } // casaco liso com gola
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); return t;
}
const texTambor = (() => { let t = null; return () => { if (t) return t;
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 256, 64); g.strokeStyle = '#151515'; g.lineWidth = 3;
  for (let x = -64; x < 256; x += 16) { g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 32, 56); g.stroke(); }
  g.fillStyle = '#c8102e'; g.fillRect(0, 0, 256, 8); g.fillRect(0, 56, 256, 8);
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }; })();

function clique({ cena, altura, semente = 0 }) {
  const T = TEMAS[semente % TEMAS.length];
  const g = new THREE.Group(); g.name = 'clique'; g.visible = false; cena.add(g);
  // ---- quem é quem: [tipo, fileira (m atrás da lanterna), deslocamento lateral (m)] ----
  const M = [];
  for (const b of [-0.9, 0.9]) for (const f of [-1.1, 1.1]) M.push(['carregador', f, b]);
  M.push(['tambormor', 4.5, 0]);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) M.push(['piccolo', 7 + r * 1.3, (c - 1.5) * 0.95]);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) M.push(['tambor', 13 + r * 1.5, (c - 1.5) * 1.0]);
  const n = M.length;
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0 });
  const matCorpo = new THREE.MeshStandardMaterial({ map: texPadrao(T), roughness: 0.8 });
  const matLarve = new THREE.MeshStandardMaterial({ color: T.larve, roughness: 0.45 });
  const matCabelo = new THREE.MeshStandardMaterial({ color: T.cabelo, roughness: 1 });
  const matChapeu = new THREE.MeshStandardMaterial({ color: T.chapeu, roughness: 0.7 });
  const matTambor = new THREE.MeshStandardMaterial({ map: texTambor(), roughness: 0.5 });
  const inst = (geo, cont, m0 = mat) => { const m = new THREE.InstancedMesh(geo, m0, cont); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.castShadow = true; m.frustumCulled = false; g.add(m); return m; };
  const corpo = inst(new THREE.CylinderGeometry(0.2, 0.32, 1.25, 10).translate(0, 0.62, 0), n, matCorpo);
  // Larve: cabeça grande (40% maior que uma de verdade), nariz enorme, cabeleira de lã em volta
  const cabeca = inst(new THREE.SphereGeometry(0.3, 12, 10).scale(1.05, 1.3, 1.05).translate(0, 1.6, 0), n, matLarve);
  const nariz = inst(new THREE.ConeGeometry(0.1, 0.62, 8).rotateX(Math.PI / 2).translate(0, 1.55, 0.55), n, matLarve);
  const cabelo = inst(new THREE.TorusGeometry(0.3, 0.13, 6, 14).rotateX(Math.PI / 2).translate(0, 1.82, -0.04), n, matCabelo);
  const chapeu = inst(new THREE.ConeGeometry(0.28, 0.62, 8).translate(0, 2.2, 0), n, matChapeu);
  const nT = M.filter((x) => x[0] === 'tambor').length;
  const tambor = inst(new THREE.CylinderGeometry(0.24, 0.24, 0.36, 16).translate(0, 0.86, 0.32), nT, matTambor); // de pé na frente do corpo, como na Basler Trommel
  const bastao = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.9, 6), new THREE.MeshStandardMaterial({ color: 0xc9a13b, metalness: 0.7, roughness: 0.3 }));
  g.add(bastao);
  // lanterna: caixa translúcida pintada (sujet satírico, cores fortes) que brilha por dentro, em dois varais
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 384;
  { const c = cv.getContext('2d'); c.fillStyle = '#f6ecd0'; c.fillRect(0, 0, 256, 384);
    const cores = ['#c8102e', '#1f5aa6', '#2f8a4a', '#f2c14e', '#7b2d8b', '#151515'];
    for (let i = 0; i < 26; i++) { c.fillStyle = cores[i % cores.length]; c.beginPath(); c.ellipse(20 + ((i * 97) % 220), 30 + ((i * 53) % 320), 12 + (i % 5) * 9, 10 + (i % 4) * 12, i, 0, TAU); c.fill(); }
    c.fillStyle = '#151515'; c.font = 'bold 34px serif'; c.fillText('BASEL', 70, 360); c.lineWidth = 8; c.strokeStyle = '#151515'; c.strokeRect(4, 4, 248, 376); }
  const texL = new THREE.CanvasTexture(cv); texL.colorSpace = THREE.SRGBColorSpace;
  const matL = new THREE.MeshStandardMaterial({ map: texL, emissive: 0xffffff, emissiveMap: texL, emissiveIntensity: 0.6, roughness: 0.6 });
  const lanterna = new THREE.Group();
  lanterna.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.55).translate(0, 2.55, 0), matL));
  const madeira = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.9 });
  for (const b of [-0.9, 0.9]) lanterna.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 3.0).translate(b, 1.25, 0), madeira));
  lanterna.add(new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.08).translate(0, 1.27, 0.6), madeira), new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.08).translate(0, 1.27, -0.6), madeira));
  const luzL = new THREE.PointLight(0xffe2a8, 0, 14, 2); luzL.position.set(0, 2.5, 0); lanterna.add(luzL);
  g.add(lanterna);
  // variação leve de tom entre os membros (o tema é o mesmo; tecido e tinta mudam um pouco)
  { const c = new THREE.Color();
    for (let i = 0; i < n; i++) { const k = 0.88 + ((i * 37) % 11) / 45; c.setRGB(k, k, k);
      for (const m of [corpo, cabeca, nariz, cabelo, chapeu]) m.setColorAt(i, c); }
    for (let i = 0; i < nT; i++) tambor.setColorAt(i, new THREE.Color(1, 1, 1));
    for (const m of [corpo, cabeca, nariz, cabelo, chapeu, tambor]) m.instanceColor.needsUpdate = true; }
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
    M.forEach(([tipo, fil, lat], i) => {
      em(s - fil, P);
      const x = P.x - P.hz * lat, z = P.z + P.hx * lat, y = altura(x, z);
      const fase = (agora / 1000) * vel * 1.9 + i * 0.37, pulo = Math.abs(Math.sin(fase * Math.PI)) * 0.05;
      q.setFromAxisAngle(Y, Math.atan2(P.hx, P.hz) + Math.sin(fase * Math.PI) * 0.05);
      const k = tipo === 'tambormor' ? 1.2 : 1;
      esc.set(k, k, k); m4.compose(v.set(x, y + pulo, z), q, esc);
      for (const im of [corpo, cabeca, nariz, cabelo, chapeu]) im.setMatrixAt(i, m4);
      if (tipo === 'tambor') tambor.setMatrixAt(iT++, m4);
      if (tipo === 'tambormor') { bastao.position.set(x + P.hx * 0.4, y + 1.2 + Math.sin(fase * 2) * 0.35, z + P.hz * 0.4); bastao.rotation.set(Math.sin(fase) * 0.4, 0, 0.2); }
      if (camera) dMin = Math.min(dMin, Math.hypot(x - camera.position.x, z - camera.position.z));
    });
    for (const im of [corpo, cabeca, nariz, cabelo, chapeu, tambor]) im.instanceMatrix.needsUpdate = true;
    em(s, P); lanterna.position.set(P.x, altura(P.x, P.z) + Math.abs(Math.sin((agora / 1000) * vel * 1.9 * Math.PI)) * 0.04, P.z); lanterna.rotation.y = Math.atan2(P.hx, P.hz);
    luzL.intensity = 6 * noite; matL.emissiveIntensity = 0.35 + 1.4 * noite;
    return dMin;
  }
  return { marchar, parar, atualizar, grupo: g, visivel: () => g.visible, onde: () => lanterna.position.toArray() };
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
const RUAS = ['Freie Strasse', 'Gerbergasse', 'Spalenberg', 'Clarastrasse', 'Augustinergasse', 'Steinenvorstadt', 'Eisengasse', 'Marktplatz'];
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
  let ligada = false, forcar = null;
  function ligar(on) {
    if (on === ligada) return; ligada = on;
    cs.forEach((c, i) => (on ? c.marchar(caminhos[i], { inicio: i * 37, velocidade: 1.0 + (i % 3) * 0.08, idaEVolta: true }) : c.parar()));
    if (!on) somVol(0);
  }
  function atualizar(agora, camera, noite = 0) {
    const e = ceu.estado();
    ligar(forcar ?? ehFasnacht(e.data, e.hora));
    if (!ligada) return;
    let d = 1e9; for (const c of cs) d = Math.min(d, c.atualizar(agora, camera, noite) ?? 1e9);
    const prox = Math.max(0, 1 - d / 120);
    if (prox > 0.02 && agora - ultCompasso > (60 / 112) * 4 * 1000 - 30) { ultCompasso = agora; tocar(); }
    somVol(prox * prox * 0.35);
  }
  return { atualizar, forcar: (v) => { forcar = v; }, cliques: cs.length, ativa: () => ligada, onde: () => cs.map((c) => c.onde()) };
}
