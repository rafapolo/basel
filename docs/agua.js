// O Reno de verdade (tarefa 14): contorno do OSM (data/reno.json, gerado por script/reno.py), superfície com reflexo
// dos prédios e do céu, ondas que descem para noroeste, espuma nas margens e nos pilares, cor pela temperatura e
// turbidez reais (data.bs.ch 100046 e 100323), muros de cais, pilares de ponte e escadas até a água.
// Uso em cidade.js: `const AGUA = await criaAgua({...})`; AGUA.relevo(pos, cores) ajusta o relevo antes das normais;
// AGUA.iniciar({leve}) cria a água depois do céu; AGUA.atualizar(agora) a cada quadro.
import { ceu, corDoCeu } from './ceu.js';
import { MITTLERE, vaosMittlere } from './marcos.js';
import { cotaPonta } from './chao.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const FLUXO = [-0.62, -0.78]; // rio abaixo: para noroeste (−x oeste, −z norte)

// distância (m, em células de 1 m) até a célula mais próxima onde alvo[i] = 1; chanfro 3-4
function chanfro(alvo, W, H) {
  const d = new Float32Array(W * H), INF = 1e6;
  for (let i = 0; i < d.length; i++) d[i] = alvo[i] ? 0 : INF;
  const A = 1, B = 1.4142;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + A);
    if (y > 0) { v = Math.min(v, d[i - W] + A); if (x > 0) v = Math.min(v, d[i - W - 1] + B); if (x < W - 1) v = Math.min(v, d[i - W + 1] + B); }
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; let v = d[i];
    if (x < W - 1) v = Math.min(v, d[i + 1] + A);
    if (y < H - 1) { v = Math.min(v, d[i + W] + A); if (x < W - 1) v = Math.min(v, d[i + W + 1] + B); if (x > 0) v = Math.min(v, d[i + W - 1] + B); }
    d[i] = v;
  }
  return d;
}

export async function criaAgua({ THREE, cena, renderer, camera, meta, altura, ruas, q }) {
  const [{ Reflector }, reno] = await Promise.all([
    import('three/addons/objects/Reflector.js'),
    fetch('data/reno.json').then((r) => r.json()),
  ]);
  const NIVEL = reno.nivel; // m acima de BASE_Z (superfície da água)
  const R = meta.relevo;
  const X0 = R.x0, Z0 = R.z0, W = (R.nx - 1) * R.passo, H = (R.ny - 1) * R.passo; // 1 m por célula
  const anel = reno.aneis[0];

  // ---- máscara e campo de distância assinado (+ dentro da água, − fora) ----
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.fillStyle = '#000'; cx.fillRect(0, 0, W, H);
  cx.fillStyle = '#fff';
  for (const a of reno.aneis) {
    cx.beginPath();
    for (let i = 0; i < a.length; i += 2) cx[i ? 'lineTo' : 'moveTo'](a[i] - X0, a[i + 1] - Z0);
    cx.fill();
  }
  const px = cx.getImageData(0, 0, W, H).data;
  const dentro = new Uint8Array(W * H), fora = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { dentro[i] = px[i * 4] > 127 ? 1 : 0; fora[i] = dentro[i] ? 0 : 1; }
  // pilares entram como "terra" para a espuma cercá-los
  const terraPil = Uint8Array.from(fora);
  // pilares: os de reno.json são genéricos (um a cada ~32 m do trecho molhado). Na Mittlere Brücke os arcos de
  // marcos.js têm pilares próprios; os genéricos caíam no meio dos vãos e o topo furava o tabuleiro (a "bolha branca").
  // Lá eles dão lugar aos pilares de marcos.js, só para a espuma (sem geometria: `marco`)
  const pil = (() => {
    const { A, B, larg, pilar } = MITTLERE, L = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L;
    const naPonte = (p) => { const s = (p.x - A[0]) * ux + (p.z - A[1]) * uz, b = -(p.x - A[0]) * uz + (p.z - A[1]) * ux; return Math.abs(b) < larg / 2 && s > 0 && s < L; };
    const outros = reno.pilares.filter((p) => !naPonte(p));
    return outros.concat(vaosMittlere(altura).pilares.map((p) => ({ x: p.x, z: p.z, w: pilar, l: larg + 3, marco: true })));
  })();
  for (const p of pil) {
    const r = Math.ceil(Math.max(p.w, p.l) / 2) + 1;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const x = Math.round(p.x - X0) + dx, z = Math.round(p.z - Z0) + dz;
      if (x < 0 || z < 0 || x >= W || z >= H) continue;
      // elipse alinhada ao fluxo
      const u = dx * FLUXO[0] + dz * FLUXO[1], v = -dx * FLUXO[1] + dz * FLUXO[0];
      if ((u / (p.l / 2)) ** 2 + (v / (p.w / 2)) ** 2 <= 1) terraPil[z * W + x] = 1;
    }
  }
  const dInt = chanfro(fora, W, H), dExt = chanfro(dentro, W, H), dPil = chanfro(terraPil, W, H);
  const dsig = (x, z) => { // + dentro, − fora (m), por célula
    const i = clamp(Math.round(z - Z0), 0, H - 1) * W + clamp(Math.round(x - X0), 0, W - 1);
    return dentro[i] ? dInt[i] : -dExt[i];
  };
  const dados = new Uint8Array(W * H * 2);
  for (let i = 0; i < W * H; i++) { dados[i * 2] = dentro[i] ? Math.min(255, dPil[i] * 5) : 0; dados[i * 2 + 1] = dentro[i] ? Math.min(255, dInt[i] * 5) : 0; }
  const texDist = new THREE.DataTexture(dados, W, H, THREE.RGFormat, THREE.UnsignedByteType);
  texDist.minFilter = texDist.magFilter = THREE.LinearFilter; texDist.needsUpdate = true;

  // ---- cor pela temperatura e turbidez ----
  const clima = { ...reno.clima };
  const cRasa = new THREE.Color(), cFunda = new THREE.Color();
  function corDaAgua() {
    const k = smooth(2, 45, clima.turb ?? 6), f = smooth(4, 24, clima.temp ?? 11); // turvo → marrom-verde; quente → mais verde (algas)
    cRasa.set('#4f8f86').lerp(new THREE.Color('#9a9660'), k).lerp(new THREE.Color('#5f9a6a'), f * 0.25);
    cFunda.set('#0f4750').lerp(new THREE.Color('#55512c'), k).lerp(new THREE.Color('#1c5a3c'), f * 0.25);
  }
  corDaAgua();
  const rotulo = document.createElement('div');
  rotulo.style.cssText = 'position:fixed;right:16px;bottom:14px;z-index:5;font:11px/1.2 Inter,system-ui,sans-serif;color:#6b5f48;pointer-events:none;text-shadow:0 0 3px #efe6d2';
  function pintaRotulo() {
    if (clima.temp == null && clima.turb == null) return;
    const f = (n, d = 1) => n.toFixed(d).replace('.', LANG === 'en' ? '.' : ',');
    rotulo.textContent = `${t('Reno', 'Rhine', 'Rhein')}: ${clima.temp != null ? f(clima.temp) + ' °C' : ''}${clima.turb != null ? ` · ${f(clima.turb)} FNU` : ''} (data.bs.ch)`;
  }
  pintaRotulo(); document.body.appendChild(rotulo);
  // dados ao vivo; se falhar (offline), fica o instantâneo de reno.json
  const base = 'https://data.bs.ch/api/explore/v2.1/catalog/datasets';
  Promise.all([
    fetch(`${base}/100046/records?limit=8&order_by=startzeitpunkt%20desc&select=startzeitpunkt,rus_w_o_s3_te`).then((r) => r.json()),
    fetch(`${base}/100323/records?limit=4&order_by=startzeitpunkt%20desc&select=startzeitpunkt,rus_w_o_ms_tr`).then((r) => r.json()),
  ]).then(([a, b]) => {
    const te = a.results.find((r) => r.rus_w_o_s3_te != null)?.rus_w_o_s3_te, tr = b.results.find((r) => r.rus_w_o_ms_tr != null)?.rus_w_o_ms_tr;
    if (te != null) clima.temp = te; if (tr != null) clima.turb = tr;
    corDaAgua(); pintaRotulo(); if (mat) aplicaCores();
  }).catch(() => {});

  // ---- hook no relevo: dentro da água o leito afunda; fora, a margem sobe até a altura do cais ----
  const bed = new THREE.Color('#5d6a55'), terra = new THREE.Color('#d6caa8');
  const COTA_CAIS = NIVEL + 2.0;
  // a malha do relevo (chao.js, swissALTI3D 0,5 m) já traz a margem; aqui só afunda o leito dentro do contorno
  // (a água plana do DEM ficaria na mesma cota da superfície) e tira a cor de água de fora do contorno
  function relevo(pos, cores) {
    for (let k = 0; k < pos.count; k++) {
      const d = dsig(pos.getX(k), pos.getZ(k));
      if (d > 0) { pos.setY(k, Math.min(pos.getY(k), NIVEL - Math.min(0.7, 0.08 + 0.25 * d))); bed.toArray(cores, k * 3); }
      else if (pos.getY(k) < 2.4) terra.toArray(cores, k * 3);
    }
  }

  // ---- geometria: muros de cais, pilares e escadas (construída em iniciar(), depois do relevo) ----
  const grupo = new THREE.Group(); grupo.name = 'agua-estruturas';
  function estruturas() {
  // arenito de cais: blocos de ~2,5 × 0,5 m pintados num canvas (u pelo comprimento do muro, v pela altura).
  // Arenito vermelho-acinzentado do Reno (Buntsandstein), com tom por bloco e junta escura; sorteio com semente
  // (antes era Math.random e um creme claro e uniforme, uma grade regular que denunciava o muro ao longo do rio inteiro)
  let sem = 0x5eed; const rnd = () => { sem = (sem + 0x6d2b79f5) | 0; let t = Math.imul(sem ^ (sem >>> 15), 1 | sem); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const tc = document.createElement('canvas'); tc.width = tc.height = 256;
  { const c = tc.getContext('2d'); c.fillStyle = '#77726a'; c.fillRect(0, 0, 256, 256); // junta clara: de longe a junta escura fazia o muro ler como tijolo
    for (let r = 0; r < 8; r++) for (let b = -1; b < 4; b++) {
      const x = b * 64 + (r % 2) * 32 + Math.round((rnd() - 0.5) * 10), y = r * 32;
      // 2026-11-19: o vermelho dominante lia como tijolo; o cais é quase todo de calcário e arenito cinza-bege, com
      // blocos de arenito vermelho trocados aqui e ali (sob a Pfalz há mais deles)
      const k = rnd(), verm = rnd() < 0.2 ? 1 : 0;
      const R = verm ? 150 + k * 20 : 156 + k * 26, G = verm ? 122 + k * 16 : 152 + k * 24, B = verm ? 108 + k * 14 : 142 + k * 22;
      c.fillStyle = `rgb(${R | 0},${G | 0},${B | 0})`; c.fillRect(x + 2, y + 2, 60, 28);
      for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(${rnd() < 0.5 ? '40,30,25' : '220,200,180'},${rnd() * 0.1})`; c.fillRect(x + 2 + rnd() * 56, y + 2 + rnd() * 25, 1 + rnd() * 5, 1 + rnd() * 3); }
    } }
  const texPedra = new THREE.CanvasTexture(tc); texPedra.wrapS = texPedra.wrapT = THREE.RepeatWrapping; texPedra.colorSpace = THREE.SRGBColorSpace; texPedra.anisotropy = 4;
  texPedra.repeat.set(0.5, 0.5); // o canvas tem 4 × 8 blocos: mesma escala de antes (2,5 × 0,5 m), menos repetição
  const pedra = new THREE.MeshLambertMaterial({ map: texPedra, color: 0xffffff, side: THREE.DoubleSide });
  // faixa molhada e lodo junto à linha d'água (pela altura no mundo), mais escura e esverdeada
  pedra.onBeforeCompile = (sh) => {
    sh.uniforms.uNivelCais = { value: NIVEL };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vCaisY;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  { vec4 wp = vec4(transformed, 1.0);\n  #ifdef USE_INSTANCING\n  wp = instanceMatrix * wp;\n  #endif\n  vCaisY = (modelMatrix * wp).y; }');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCaisY; uniform float uNivelCais;')
      .replace('#include <map_fragment>', `#include <map_fragment>
  { float molhado = 1.0 - smoothstep(uNivelCais + 0.35, uNivelCais + 1.1, vCaisY);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.54, 0.47), molhado * 0.8); }`);
  };
  pedra.customProgramCacheKey = () => 'cais-molhado';
  {
    const pos = [], idx = [], uvs = [];
    const area = anel.reduce((s, _, i) => (i % 2 ? s : s + anel[i] * anel[(i + 3) % anel.length] - anel[(i + 2) % anel.length] * anel[i + 1]), 0);
    const sgn = area > 0 ? 1 : -1; // normal para fora da água
    const amostras = []; // pontos da margem, de 3 em 3 m; liga: este ponto e o anterior formam um trecho de muro
    const bordaMapa = (x, z) => Math.abs(x - (X0 + W / 2)) > W / 2 - 3 || Math.abs(z - (Z0 + H / 2)) > H / 2 - 3;
    for (let i = 0; i < anel.length - 2; i += 2) {
      const [ax, az, bx, bz] = [anel[i], anel[i + 1], anel[i + 2], anel[i + 3]];
      const L = Math.hypot(bx - ax, bz - az); if (L < 0.1) continue;
      const nx = (sgn * (bz - az)) / L, nz = (-sgn * (bx - ax)) / L;
      const corte = bordaMapa(ax, az) && bordaMapa(bx, bz); // corte do recorte, não é margem
      const n = Math.max(1, Math.ceil(L / 3));
      for (let k = 0; k <= n; k++) {
        const x0 = ax + ((bx - ax) * k) / n, z0 = az + ((bz - az) * k) / n;
        const x = x0 - nx * 1.8, z = z0 - nz * 1.8; // o muro entra 1,8 m na água: esconde o talude que a grade de 5 m deixa
        const h = Math.max(altura(x0 + nx * 2, z0 + nz * 2), altura(x0 + nx * 4, z0 + nz * 4), altura(x0 + nx * 6, z0 + nz * 6)) - 0.15;
        amostras.push({ x, z, nx, nz, h, liga: k > 0 && !corte });
      }
    }
    // topo do muro: média móvel de ±18 m (a grade de 5 m do relevo serrilha a margem), nunca abaixo da cota do cais
    const N = amostras.length;
    amostras.forEach((a2, i) => {
      let s2 = 0, c2 = 0; for (let j = -6; j <= 6; j++) { s2 += amostras[(i + j + N) % N].h; c2++; }
      a2.topo = Math.max(COTA_CAIS, s2 / c2 + 0.1);
    });
    let acum = 0;
    for (let i = 1; i < N; i++) {
      const A = amostras[i - 1], C = amostras[i]; if (!C.liga) continue;
      const u0 = acum / 5, u1 = (acum += Math.hypot(C.x - A.x, C.z - A.z)) / 5;
      const v0 = pos.length / 3, fundo = NIVEL - 1.2, c = 0.45; // coroamento: laje de 45 cm que avança sobre o chão
      pos.push(A.x, fundo, A.z, C.x, fundo, C.z, C.x, C.topo, C.z, A.x, A.topo, A.z,
        A.x, A.topo, A.z, C.x, C.topo, C.z, C.x + C.nx * c, C.topo, C.z + C.nz * c, A.x + A.nx * c, A.topo, A.z + A.nz * c);
      const vv = (y) => y / 2;
      uvs.push(u0, vv(fundo), u1, vv(fundo), u1, vv(C.topo), u0, vv(A.topo), u0, 0, u1, 0, u1, 0.2, u0, 0.2);
      idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3, v0 + 4, v0 + 5, v0 + 6, v0 + 4, v0 + 6, v0 + 7);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, pedra); m.castShadow = m.receiveShadow = true; m.name = 'muros-de-cais';
    grupo.add(m);
  }
  {
    // pilares: octógonos alongados no sentido da corrente, do leito até a pista da ponte (mesma fórmula de cidade.js)
    const geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, false).translate(0, 0.5, 0);
    const pg = pil.filter((c) => !c.marco);
    const im = new THREE.InstancedMesh(geo, pedra, pg.length);
    const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    pg.forEach((c, i) => {
      // pontas como as faixas da ponte (cotaPonta), para o topo ficar sob a pista
      const ux = c.b[0] - c.a[0], uz = c.b[1] - c.a[1];
      const hA = cotaPonta(altura, c.a[0], c.a[1], c.a[0] + ux * 0.01, c.a[1] + uz * 0.01), hB = cotaPonta(altura, c.b[0], c.b[1], c.b[0] - ux * 0.01, c.b[1] - uz * 0.01);
      const topo = hA + (hB - hA) * c.f - 0.2; // dentro da laje de concreto das pontes (cidade.js, de −0,65 a +0,55 m): sem furar o tabuleiro
      const fundo = NIVEL - 2.5;
      e.set(0, -Math.atan2(FLUXO[1], FLUXO[0]) + Math.PI / 2, 0);
      qt.setFromEuler(e); s.set(c.w, Math.max(2, topo - fundo), c.l); p.set(c.x, fundo, c.z);
      im.setMatrixAt(i, m4.compose(p, qt, s));
    });
    im.castShadow = im.receiveShadow = true; im.frustumCulled = false; im.name = 'pilares';
    grupo.add(im);
  }
  {
    // escadas da margem: degraus (OSM highway=steps) com uma ponta a menos de 7 m da água descem até a água
    const degraus = [];
    for (const l of ruas.linhas) {
      if (l.t !== 'steps' || l.c.length < 4) continue;
      const c = l.c, a = [c[0], c[1]], b = [c[c.length - 2], c[c.length - 1]];
      const da = dsig(...a), db = dsig(...b);
      const perto = (d) => d > -7 && d < 3;
      if (!perto(da) && !perto(db)) continue;
      const [agua, terra2] = perto(da) && (!perto(db) || da > db) ? [a, b] : [b, a];
      const Lw = Math.hypot(terra2[0] - agua[0], terra2[1] - agua[1]);
      if (Lw < 3 || Lw > 40) continue;
      const hTopo = altura(terra2[0], terra2[1]), hBase = NIVEL + 0.1;
      if (hTopo - hBase < 0.8 || hTopo - hBase > 7) continue;
      const n = Math.round((hTopo - hBase) / 0.17), run = Lw / n;
      const ang = Math.atan2(terra2[1] - agua[1], terra2[0] - agua[0]);
      for (let k = 0; k < n; k++) {
        const t0 = (k + 0.5) / n;
        degraus.push([agua[0] + (terra2[0] - agua[0]) * t0, agua[1] + (terra2[1] - agua[1]) * t0, hBase + (hTopo - hBase) * ((k + 1) / n), run, ang]);
      }
    }
    if (degraus.length) {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0), pedra, degraus.length);
      const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      degraus.forEach((d, i) => {
        qt.setFromAxisAngle(up, -d[4]); s.set(d[3] * 1.05, Math.max(0.3, d[2] - (NIVEL - 0.6)), 2.4); p.set(d[0], d[2], d[1]);
        im.setMatrixAt(i, m4.compose(p, qt, s));
      });
      im.castShadow = im.receiveShadow = true; im.frustumCulled = false; im.name = 'escadas-da-margem';
      grupo.add(im);
    }
  }
  cena.add(grupo);
  }

  // ---- superfície ----
  let mat = null, malha = null, reflexo = false, aoMudarOff = null;
  const U = {
    uTempo: { value: 0 }, uDist: { value: texDist }, uDim: { value: new THREE.Vector4(X0, Z0, W, H) },
    uRasa: { value: cRasa }, uFunda: { value: cFunda }, uFluxo: { value: new THREE.Vector2(...FLUXO) },
    uSolDir: { value: new THREE.Vector3(0, 1, 0) }, uSolCor: { value: new THREE.Color(1, 1, 1) }, uSolI: { value: 1 },
    uZenite: { value: new THREE.Color(0.1, 0.2, 0.5) }, uHoriz: { value: new THREE.Color(0.5, 0.6, 0.7) },
    uLuz: { value: 1 }, uNoite: { value: 0 }, uRefl: { value: 1 },
    uFogCor: { value: new THREE.Color() }, uFogPerto: { value: 900 }, uFogLonge: { value: 2600 },
  };
  const COMUM = `
    uniform float uTempo, uLuz, uNoite, uRefl, uSolI, uFogPerto, uFogLonge;
    uniform vec4 uDim; uniform vec2 uFluxo; uniform sampler2D uDist;
    uniform vec3 uRasa, uFunda, uSolDir, uSolCor, uZenite, uHoriz, uFogCor;`;
  const VERT = `
    uniform mat4 textureMatrix; varying vec4 vUvR; varying vec3 vMundo;
    void main() {
      vUvR = textureMatrix * vec4(position, 1.0);
      vec4 w = modelMatrix * vec4(position, 1.0); vMundo = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const FRAG = `
    ${COMUM}
    uniform sampler2D tDiffuse; varying vec4 vUvR; varying vec3 vMundo;
    float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
    // inclinação da superfície: ondas que andam com a corrente (noroeste) e marolinhas cruzadas
    vec2 onda(vec2 p, float t, float px) {
      vec2 g = vec2(0.0);
      vec2 F = uFluxo, P = vec2(-F.y, F.x);
      const int N = 6;
      float comp[6] = float[6](23.0, 11.0, 6.3, 3.4, 1.9, 1.1);
      float amp[6] = float[6](0.12, 0.09, 0.06, 0.04, 0.026, 0.016);
      float rum[6] = float[6](0.00, 0.55, -0.7, 1.15, -1.3, 0.3);
      for (int i = 0; i < N; i++) {
        float c = cos(rum[i]), s = sin(rum[i]);
        vec2 d = normalize(F * c + P * s);
        float k = 6.2832 / comp[i], w = sqrt(9.81 * k) * 0.8 + 0.6; // um pouco mais rápido que a água parada: lê-se a correnteza
        float fase = dot(d, p) * k - w * t + float(i) * 2.17 + sin(dot(P, p) * 0.05 * float(i + 1)) * 1.5;
        g += d * cos(fase) * amp[i] * k * smoothstep(1.5, 5.0, comp[i] / px);
      }
      // ruído fino arrastado pela corrente
      vec2 a = p * 0.55 - F * t * 0.9, b = p * 1.3 + P * t * 0.3 - F * t * 1.4;
      g += (vec2(vn(a + 3.1) - vn(a - 3.1), vn(a + vec2(0, 3.1)) - vn(a - vec2(0, 3.1))) + 0.5 * vec2(vn(b + 1.7) - vn(b - 1.7), vn(b + vec2(0, 1.7)) - vn(b - vec2(0, 1.7)))) * 0.09 * smoothstep(1.5, 5.0, 1.8 / px);
      return g;
    }
    void main() {
      vec2 p = vMundo.xz;
      vec2 uvd = (p - uDim.xy) / uDim.zw;
      vec2 dd = texture2D(uDist, uvd).rg * 51.0; // x: m até a terra ou pilar; y: m até a margem
      float dPil = dd.x, dMargem = dd.y;
      // tamanho do pixel no chão: o maior entre a distância e a derivada de tela (rasante, o pixel se estica ao longo
      // da vista e as ondas curtas viravam anéis e moiré regulares); onda menor que ~3 px some
      vec2 fw = fwidth(p);
      float px = max(0.05, max(length(vMundo - cameraPosition) * 0.0016, max(fw.x, fw.y) * 0.9));
      vec2 g = onda(p, uTempo, px);
      // ondas menores perto da margem/pilar (água abrigada) e mais agitadas ao meio
      g *= mix(0.5, 1.0, smoothstep(0.0, 14.0, dPil));
      vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
      vec3 V = normalize(cameraPosition - vMundo);
      float cosv = clamp(dot(N, V), 0.0, 1.0);
      float fres = clamp(0.05 + 0.95 * pow(1.0 - cosv, 4.0), 0.0, 1.0);
      vec3 Rv = reflect(-V, N);
      // céu refletido: do horizonte (cor da névoa) ao zênite
      vec3 ceuR = mix(uHoriz * 0.8, uZenite, pow(clamp(Rv.y, 0.0, 1.0), 0.45)); // horizonte refletido um pouco abaixo do céu (a água absorve)
      // sol: disco mais halo, quebrado pelas ondas
      float sd = max(dot(Rv, uSolDir), 0.0);
      // brilho contido: o halo largo e o disco somados estouravam um rastro branco no Reno inteiro nas vistas altas
      vec3 brilho = min(uSolCor * uSolI * (pow(sd, 900.0) * 18.0 + pow(sd, 80.0) * 0.25), vec3(2.2));
      vec3 refl = ceuR;
      if (uRefl > 0.5) {
        vec2 uv = vUvR.xy / vUvR.w + g * 0.035;
        vec4 tr = texture2D(tDiffuse, uv);
        refl = mix(ceuR, tr.rgb, tr.a);
      }
      // corpo da água: mais claro e verde perto da margem (raso), escuro ao meio
      vec3 corpo = mix(uRasa, uFunda, smoothstep(1.0, 22.0, dMargem)) * (0.04 + 0.96 * uLuz);
      corpo += uHoriz * 0.04;
      vec3 cor = mix(corpo, refl, fres) + brilho * fres * 1.2;
      // espuma: manchas que descem a corrente, coladas nas margens e nos pilares
      vec2 pf = p * 0.8 - uFluxo * uTempo * 1.3;
      float ru = vn(pf) * 0.6 + vn(pf * 2.3 + 7.0) * 0.4;
      float perto = 1.0 - smoothstep(0.2, 3.2, dPil + ru * 1.6);
      // rastro depois do pilar (a jusante): amostra a máscara rio acima
      vec2 acima = (p + uFluxo * 7.0 - uDim.xy) / uDim.zw;
      float dAc = texture2D(uDist, acima).r * 51.0;
      float rastro = (1.0 - smoothstep(0.5, 3.0, dAc + ru * 2.0)) * 0.75;
      float espuma = clamp(max(perto, rastro) * smoothstep(0.38, 0.62, ru + 0.15), 0.0, 1.0);
      float linha = 1.0 - smoothstep(0.0, 0.9, dPil);
      espuma = max(espuma, linha * 0.9);
      cor = mix(cor, vec3(0.86, 0.88, 0.86) * (0.05 + 0.95 * uLuz) + uHoriz * 0.05, espuma * 0.85);
      float alfa = mix(0.62, 0.97, smoothstep(0.0, 5.0, dMargem));
      alfa = max(alfa, max(espuma, fres));
      float dist = length(vMundo - cameraPosition);
      cor = mix(cor, uFogCor, smoothstep(uFogPerto, uFogLonge, dist));
      gl_FragColor = vec4(cor, alfa);
    }`;
  function aplicaCores() { U.uRasa.value = cRasa; U.uFunda.value = cFunda; }

  // forma: o polígono do rio, triangulado (shape y = −z, depois a malha gira −90° em X)
  function geometria() {
    const pts = []; for (let i = 0; i < anel.length - 2; i += 2) pts.push(new THREE.Vector2(anel[i], -anel[i + 1]));
    return new THREE.ShapeGeometry(new THREE.Shape(pts));
  }

  function iniciar({ leve }) {
    estruturas();
    reflexo = !leve;
    const forma = { name: 'AguaReno', uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, ...U }, vertexShader: VERT, fragmentShader: FRAG };
    U.uRefl.value = reflexo ? 1 : 0;
    if (reflexo) {
      const pr = Math.min(renderer.getPixelRatio(), 1);
      malha = new Reflector(geometria(), { textureWidth: Math.round(innerWidth * 0.5 * pr), textureHeight: Math.round(innerHeight * 0.5 * pr), clipBias: 0.003, shader: forma, multisample: 0 });
      mat = malha.material;
      Object.assign(mat.uniforms, U); // o Reflector clona os uniformes: volta aos compartilhados
      // a sombra já foi desenhada neste quadro; o desenho espelhado a reaproveita
      const antes = malha.onBeforeRender;
      malha.onBeforeRender = (r, s, c) => { const a = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false; antes(r, s, c); r.shadowMap.autoUpdate = a; };
      const rt = malha.getRenderTarget();
      ceu.reflexoRT = rt;
      addEventListener('resize', () => { rt.setSize(Math.round(innerWidth * 0.5 * pr), Math.round(innerHeight * 0.5 * pr)); });
    } else {
      mat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, textureMatrix: { value: new THREE.Matrix4() }, ...U }, vertexShader: VERT, fragmentShader: FRAG });
      malha = new THREE.Mesh(geometria(), mat);
    }
    mat.transparent = true; mat.depthWrite = false; mat.side = THREE.DoubleSide;
    malha.rotation.x = -Math.PI / 2; malha.position.y = NIVEL; malha.name = 'rio'; malha.renderOrder = 2;
    cena.add(malha);
    aoMudarOff = ceu.aoMudar(sol);
    sol(ceu.estado());
  }

  const lua = new THREE.Vector3(-0.35, 0.8, 0.45).normalize(), vTopo = new THREE.Vector3(0, 1, 0);
  function sol(e) {
    const lunar = e.altitude < 0;
    U.uSolDir.value.copy(lunar ? lua : e.dir);
    U.uSolCor.value.copy(lunar ? new THREE.Color(0x8fa6e6) : e.luz.cor);
    U.uSolI.value = lunar ? 0.5 * smooth(-3, -12, e.altitudeGraus) : e.luz.intensidade * 0.45;
    U.uLuz.value = clamp(e.dia * 0.9 + 0.1 * smooth(0, 30, e.altitudeGraus) + (lunar ? 0.03 : 0));
    U.uNoite.value = e.noite;
    const z = corDoCeu(vTopo, U.uSolDir.value, e.noite);
    U.uZenite.value.setRGB(z[0], z[1], z[2], THREE.LinearSRGBColorSpace);
  }
  function atualizar(agora) {
    if (!malha) return;
    U.uTempo.value = agora / 1000;
    U.uHoriz.value.copy(cena.fog.color);
    U.uFogCor.value.copy(cena.fog.color); U.uFogPerto.value = cena.fog.near; U.uFogLonge.value = cena.fog.far;
  }
  return { relevo, iniciar, atualizar, nivel: NIVEL, distancia: dsig, reno, clima, grupo, get malha() { return malha; } };
}
