// Gente e movimento (tarefa 19). Tudo instanciado, sem arquivo de modelo:
//  - bondes BVB (verdes) e BLT (amarelos) nos trilhos do OSM, saídas e tempos do GTFS estático suíço (data/vida.json,
//    gerado por script/vida.py): cada viagem acelera, para na parada e sai pelo horário; 3 módulos que seguem a curva
//  - pedestres com pinta de gente (como os bonecos da sim do atlas do tocador): pernas e braços que balançam no shader,
//    sapato, calça, casaco por estação, cabelo, pele. Andam pelas ruas e vielas do OSM e vagam pelas praças e zonas de
//    pedestres; mais densos onde a contagem 100013 (data.bs.ch) indica, no ritmo da hora, do dia da semana e do mês
//  - bicicletas e alguns carros (fora da zona de pedestres, mão direita), gaivotas sobre o Reno, nadadores com a boia
//    "Wickelfisch" no verão (zonas 100270), arrastados pela corrente
// A densidade segue ceu.estado() (hora e data) e a estação. O relógio dos bondes parte da hora do céu e
// corre em tempo real; com prefers-reduced-motion nada anda (tudo parado, mas presente). Modo leve (ceu.leve): bem menos
// gente, sem sombras. Ganchos de som: window.ambiente (docs/ambiente-som.js).
import { cotaPonta } from './chao.js';

const TAU = Math.PI * 2;
const lim = (v, a, b) => Math.max(a, Math.min(b, v));
const suave = (a, b, v) => { const t = lim((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mulberry = (s) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export async function criarVida({ THREE, cena, ceu, altura, ruas, camera, controls, nivelRio = 1.95, nivelReno = 2.3, leve = false, cotaPonte = () => null, ponte = null, recorte = { x0: -560, x1: 560, z0: -585, z1: 585 }, base = 'data/' }) {
  const V = await fetch(base + 'vida.json').then((r) => r.json());
  // lugares onde a gente para (script/pontos.py): rodinhas, Rheinbord, paradas de bonde e focos de quem anda
  const PT = await fetch(base + 'pontos.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  // parques e gramados do OSM (arvores.json → verde): famílias de pé e de piquenique (2026-11-21)
  const VERDE = await fetch(base + 'arvores.json').then((r) => (r.ok ? r.json() : null)).then((a) => a?.verde ?? []).catch(() => []);
  const rnd = mulberry(1912);
  const parado = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const grupo = new THREE.Group(); grupo.name = 'vida';
  cena.add(grupo);
  const UV = { uVidaT: { value: 0 }, uVidaNoite: { value: 0 }, uAnima: { value: parado ? 0 : 1 } };
  const cor = (h) => new THREE.Color(h);

  // ---------- estado do tempo: dia da semana, hora, mês ----------
  const T0 = performance.now() / 1000;
  const S = { simT: 15 * 3600, base: 15 * 3600, ref: 0, dia: 'util', mes: 5, estacao: 'verao', noite: 0, dia01: 1, relogio: 0, sol: 1 };
  function lerCeu() {
    const e = ceu.estado();
    S.base = e.hora * 3600; S.ref = performance.now() / 1000 - T0;
    const [y, m, d] = e.data.split('-').map(Number);
    const sem = new Date(y, m - 1, d).getDay();
    S.dia = sem === 0 ? 'dom' : sem === 6 ? 'sab' : 'util';
    S.mes = m - 1; S.diaAno = m * 31 + d;
    S.estacao = m >= 11 || m <= 2 ? 'inverno' : m >= 5 && m <= 9 ? 'verao' : 'meia';
    S.noite = e.noite; S.dia01 = e.dia; S.alt = e.altitudeGraus;
  }
  lerCeu();
  let estAnt = S.estacao;
  ceu.aoMudar(() => { lerCeu(); if (S.estacao !== estAnt) { estAnt = S.estacao; recolorir = true; } });
  let recolorir = false;
  // perfil horário (0..1), interpolado entre as horas (a contagem é "hora cheia"; o centro da hora é h + 0,5)
  const perfil = (arr, h) => { const x = (h - 0.5 + 24) % 24, i = Math.floor(x), f = x - i; return arr[i] * (1 - f) + arr[(i + 1) % 24] * f; };
  const hora = () => (S.simT / 3600) % 24;

  // ---------- material comum de gente, bicicleta, carro e nadador ----------
  // partes por vértice: 0 pele, 1 tronco/manga/carroceria, 2 calça, 3 sapato/escuro, 4 cabelo/touca; lado ±1 balança
  function unir(partes) {
    const P = [], N = [], A = [];
    for (const { g, parte, lado = 0, opc = 0 } of partes) {
      const ng = g.index ? g.toNonIndexed() : g;
      P.push(...ng.attributes.position.array); N.push(...ng.attributes.normal.array);
      for (let i = 0; i < ng.attributes.position.count; i++) A.push(parte, lado, opc);
    }
    const r = new THREE.BufferGeometry();
    r.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    r.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    r.setAttribute('aPL', new THREE.Float32BufferAttribute(A, 3)); // parte, lado (balança), peça opcional (10·grupo + estilo)
    r.userData.opcoes = partes.some((q) => q.opc);
    return r;
  }
  const mat4 = (g, x, y, z, sx = 1, sy = 1, sz = 1) => g.scale(sx, sy, sz).translate(x, y, z);
  const matGente = (rugo = 0.82) => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rugo, metalness: 0.02 });
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, UV);
      s.vertexShader = s.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec3 aPL; attribute vec3 aTorso; attribute vec3 aCalca; attribute vec3 aPele; attribute vec3 aCabelo; attribute vec3 aAnim;
attribute vec3 aAcess;
uniform float uVidaT; uniform float uAnima;`)
        .replace('#include <color_vertex>', `
  { float parte = aPL.x;
    vColor = parte < 0.5 ? aPele : parte < 1.5 ? aTorso : parte < 2.5 ? aCalca : parte < 3.5 ? vec3(0.025) : parte < 4.5 ? aCabelo : aAcess; }`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  // peças opcionais (cabelo comprido, chapéu, casaco, cachecol, mochila…): aOpc = 10·grupo + estilo; só aparece a peça
  // do estilo da pessoa (aEstilo: cabelo, chapéu, casaco, extra); as outras colapsam num ponto e não custam pixel
  // o estilo vem num número só (aAnim.z = cabelo + 4·chapéu + 16·casaco + 64·extra), por causa do limite de atributos
  if (aPL.z > 0.5) {
    float grupoO = floor(aPL.z / 10.0), valO = aPL.z - grupoO * 10.0;
    float est = mod(floor(aAnim.z / pow(4.0, grupoO - 1.0)), 4.0);
    if (abs(est - valO) > 0.5) transformed = vec3(0.0);
  }
  if (uAnima > 0.5 && aPL.y != 0.0 && aAnim.y > 0.05) {
    float braco = aPL.x < 1.5 ? 1.0 : 0.0;
    float a = sin(uVidaT * aAnim.y * 4.6 + aAnim.x) * min(0.62, aAnim.y * 0.44) * aPL.y * (braco > 0.5 ? -0.8 : 1.0);
    float piv = braco > 0.5 ? 1.48 : 0.9;
    float yy = transformed.y - piv, zz = transformed.z;
    transformed.y = piv + yy * cos(a) - zz * sin(a);
    transformed.z = yy * sin(a) + zz * cos(a);
  }`);
    };
    m.customProgramCacheKey = () => 'vida-gente';
    return m;
  };
  // atributos por instância
  const atr = (n, tam) => new THREE.InstancedBufferAttribute(new Float32Array(n * tam), tam);
  function malhaInst(geo, mat, n, sombra) {
    geo.setAttribute('aTorso', atr(n, 3)); geo.setAttribute('aCalca', atr(n, 3)); geo.setAttribute('aPele', atr(n, 3));
    geo.setAttribute('aCabelo', atr(n, 3)); geo.setAttribute('aAnim', atr(n, 3));
    geo.setAttribute('aAcess', atr(n, 3)); // sempre: o estilo e a cor dos acessórios moram na malha de longe também
    const im = new THREE.InstancedMesh(geo, mat, n);
    im.frustumCulled = false; im.castShadow = sombra && !leve; im.receiveShadow = true;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) im.setMatrixAt(i, z);
    grupo.add(im);
    return im;
  }
  const PELE = ['#f1c9a5', '#e0ac82', '#c68863', '#8d5a3c', '#5a3a28', '#f6d9bd'].map(cor);
  const CABELO = ['#1b1410', '#3a2a1c', '#6b4a2a', '#a67c3d', '#c9b27a', '#8a8a88', '#2a2a2a'].map(cor);
  const TORSO = {
    verao: ['#e8e4da', '#d8493f', '#3d6fb3', '#e2b542', '#4c9a6a', '#f0f0f0', '#2b2b30', '#c77ab0', '#8dbfd6', '#e98a3a', '#a1b34a', '#7e5fa8'].map(cor),
    inverno: ['#26262b', '#3b3f4a', '#5a2f2a', '#2f4a3a', '#6b6258', '#1c2a46', '#8a1f2d', '#a39a8e', '#4a3b2e', '#d6cdbd', '#314d6e', '#d8493f'].map(cor),
  };
  TORSO.meia = [...TORSO.verao.slice(0, 6), ...TORSO.inverno.slice(0, 6)];
  const CALCA = ['#2a2f3a', '#1f2430', '#3d4a63', '#5b4e3a', '#262626', '#6a6f78', '#8a7a5a', '#c9bfa8', '#43506b'].map(cor);
  const CARRO = ['#e9e9e6', '#1c1d20', '#7d8288', '#a31f24', '#27406b', '#c9ccd0', '#3a3f44', '#b9a77a', '#e9e9e6', '#4d6a54'].map(cor);
  const sorteia = (a, r = rnd) => a[Math.floor(r() * a.length)];
  // roupa de criança: anoraques e capas de chuva em cores vivas, mochilas de escola
  const INFANTIL = ['#e8452c', '#f2b51d', '#2f8fd8', '#3fae5a', '#d6458f', '#ff7a1a', '#7a4fc9', '#18a5a5', '#e9e2cf'].map(cor);
  const hash01 = (i) => { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
  const poe3 = (at, i, c) => at.setXYZ(i, c.r, c.g, c.b);
  // figurino pela estação (como o atlas de ../tocador, que veste cada um conforme o cenário): cabelo comprido ou coque,
  // gorro / boné / chapéu, casaco comprido ou vestido, cachecol / mochila / bolsa, e a cor desses acessórios; poucos
  // com jaqueta neon. Crianças: mochila de escola, gorro no inverno, chapéu de sol no verão
  const ACESS = {
    inverno: ['#b23a3a', '#2f4a6b', '#d8c07a', '#3a3a3a', '#e0e0e0', '#5a7a3a', '#7a2a4a'].map(cor),
    meia: ['#6b4a2a', '#2f4a6b', '#c8202a', '#3a3a3a', '#d8c07a', '#3c8f4a'].map(cor),
    verao: ['#e2cf9a', '#f4f1ea', '#2a5fb0', '#c8202a', '#151515', '#e8a020', '#6b4a2a'].map(cor),
  };
  const NEON = ['#ff3ad8', '#3af0ff', '#b4ff3a', '#ffb43a'].map(cor);
  const chance = (tab) => { const r = rnd(); let a = 0; for (let k = 0; k < tab.length; k++) { a += tab[k]; if (r < a) return k + 1; } return 0; };
  function vestir(A, i, kid, est) {
    if (!A.aAcess) return;
    const inv = est === 'inverno', ver = est === 'verao';
    const cab = kid ? chance([0.3]) : chance([0.33, 0.12]);
    const chap = kid ? (inv ? chance([0.6]) : ver ? (rnd() < 0.3 ? 3 : 0) : chance([0.15])) : chance(inv ? [0.45, 0, 0.05] : ver ? [0, 0.18, 0.14] : [0.12, 0.1, 0.04]);
    const cas = kid ? 0 : chance(inv ? [0.55, 0] : ver ? [0, 0.22] : [0.25, 0.08]);
    const ext = kid ? (rnd() < 0.5 ? 2 : inv && rnd() < 0.4 ? 1 : 0) : chance(inv ? [0.5, 0.1, 0.12] : ver ? [0, 0.18, 0.2] : [0.15, 0.2, 0.15]);
    A.aAnim.setZ(i, cab + 4 * chap + 16 * cas + 64 * ext);
    poe3(A.aAcess, i, sorteia(ACESS[est] ?? ACESS.meia));
    if (!kid && rnd() < 0.03) poe3(A.aTorso, i, sorteia(NEON)); // um ou outro de jaqueta neon
  }

  // ---------- grafos de ruas (do que ruas.json já carrega) ----------
  const FORA = (x, z) => x < recorte.x0 - 10 || x > recorte.x1 + 10 || z < recorte.z0 - 10 || z > recorte.z1 + 10;
  function criarGrafo(tipos, pesoTipo, dens) {
    const chave = new Map(), X = [], Z = [], Y = [], viz = [], tp = [], el = [];
    const vid = (x, z) => {
      const k = Math.round(x * 4) + ',' + Math.round(z * 4);
      let v = chave.get(k);
      if (v === undefined) { v = X.length; chave.set(k, v); X.push(x); Z.push(z); Y.push(altura(x, z) + 0.02); viz.push([]); tp.push([]); el.push([]); }
      return v;
    };
    for (const l of ruas.linhas) {
      if (!tipos.has(l.t)) continue;
      const c = l.c;
      if (FORA(c[0], c[1]) && FORA(c[c.length - 2], c[c.length - 1])) continue;
      const pts = [];
      for (let i = 0; i < c.length - 2; i += 2) {
        const n = Math.max(1, Math.ceil(Math.hypot(c[i + 2] - c[i], c[i + 3] - c[i + 1]) / 4));
        for (let k = 0; k < n; k++) pts.push([c[i] + ((c[i + 2] - c[i]) * k) / n, c[i + 1] + ((c[i + 3] - c[i + 1]) * k) / n]);
      }
      pts.push([c[c.length - 2], c[c.length - 1]]);
      const hA = cotaPonta(altura, ...pts[0], ...pts[1]), hB = cotaPonta(altura, ...pts.at(-1), ...pts.at(-2));
      const ids = pts.map(([x, z], i) => {
        if (FORA(x, z)) return -1;
        const v = vid(x, z);
        if (l.ponte) Y[v] = hA + (hB - hA) * (i / (pts.length - 1)) + 0.62;
        return v;
      });
      for (let i = 0; i < ids.length - 1; i++) {
        const a = ids[i], b = ids[i + 1];
        if (a < 0 || b < 0 || a === b || viz[a].includes(b)) continue;
        const L = Math.hypot(X[a] - X[b], Z[a] - Z[b]);
        viz[a].push(b); tp[a].push(l.t); el[a].push(L); viz[b].push(a); tp[b].push(l.t); el[b].push(L);
      }
    }
    const n = X.length, W = new Float64Array(n), acum = new Float64Array(n);
    for (let v = 0; v < n; v++) {
      let w = 0;
      viz[v].forEach((u, j) => { w += el[v][j] * (pesoTipo[tp[v][j]] ?? 0); });
      W[v] = w * dens(X[v], Z[v]); acum[v] = (v ? acum[v - 1] : 0) + W[v];
    }
    // compacto (2026-11-20): vizinhos em CSR (off/adj) e tipo de via por índice, em vez de 3 arrays JS por vértice a cada 4 m
    // de rua (~50 MB de objetos pequenos na memória)
    const off = new Uint32Array(n + 1);
    for (let v = 0; v < n; v++) off[v + 1] = off[v] + viz[v].length;
    const adj = new Int32Array(off[n]), tiposV = [...new Set(tp.flat())], tpI = new Uint8Array(off[n]), iT = new Map(tiposV.map((t, i) => [t, i]));
    for (let v = 0; v < n; v++) for (let j = 0; j < viz[v].length; j++) { adj[off[v] + j] = viz[v][j]; tpI[off[v] + j] = iT.get(tp[v][j]); }
    return { X: Float32Array.from(X), Z: Float32Array.from(Z), Y: Float32Array.from(Y), off, adj, tipos: tiposV, tpI, W, acum, n, total: acum[n - 1] || 1 };
  }
  const sorteiaVertice = (g, r = rnd) => {
    const x = r() * g.total; let lo = 0, hi = g.n - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (g.acum[m] < x) lo = m + 1; else hi = m; }
    return lo;
  };
  // densidade pelas estações de contagem (data.bs.ch 100013): gaussiana de 260 m em volta de cada uma
  const sitios = (t) => V.contagem.sitios.filter((s) => s.t === t);
  const mk = (t, base0, ganho) => {
    const S2 = sitios(t), mx = Math.max(...S2.map((s) => s.m), 1);
    return (x, z) => { let a = 0; for (const s of S2) a += (s.m / mx) * Math.exp(-((x - s.x) ** 2 + (z - s.z) ** 2) / (2 * 260 * 260)); return base0 + ganho * Math.min(1.4, a); };
  };
  const densP0 = mk('p', 0.3, 2.2), densV = mk('v', 0.4, 1.6);
  // pontos conhecidos (Münsterplatz, Pfalz, Marktplatz, Barfüsserplatz, Clarastrasse, Rheinbord): gaussiana de 70 m
  const FOCOS = PT?.focos ?? [];
  const densP = (x, z) => { let a = densP0(x, z); for (const [fx, fz, w] of FOCOS) a += 1.6 * w * Math.exp(-((x - fx) ** 2 + (z - fz) ** 2) / (2 * 70 * 70)); return a; };

  const PESO_PED = { pedestrian: 3, living_street: 2.4, footway: 2, path: 1, steps: 0.5, residential: 1.2, service: 0.35, tertiary: 1, secondary: 1, unclassified: 1, platform: 1.5, cycleway: 0.3 };
  const LARG = { secondary: 8, secondary_link: 6, tertiary: 7, unclassified: 6, residential: 6, living_street: 5, pedestrian: 6, service: 3.5, footway: 2, path: 1.6, steps: 2, cycleway: 2, platform: 3 };
  const gPed = criarGrafo(new Set(Object.keys(PESO_PED)), PESO_PED, densP);
  const PESO_BIKE = { cycleway: 1.5, residential: 1.4, tertiary: 1.3, secondary: 1.3, unclassified: 1, living_street: 0.8, secondary_link: 0.7, pedestrian: 0.25, service: 0.3 };
  const gBike = criarGrafo(new Set(Object.keys(PESO_BIKE)), PESO_BIKE, densV);
  // carros: fora da zona de pedestres (polígonos da data.bs.ch) e sem pontes (a Mittlere Brücke só tem bonde, bicicleta e gente)
  const zonas = V.zonas.map((z) => { const p = []; for (let i = 0; i < z.length; i += 2) p.push([z[i] / 10, z[i + 1] / 10]); return p; });
  const dentro = (x, z, p) => { let d = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < ((p[j][0] - p[i][0]) * (z - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) d = !d; return d; };
  const naZonaPed = (x, z) => zonas.some((p) => dentro(x, z, p));
  const PESO_CARRO = { secondary: 1.5, tertiary: 1.2, residential: 1, unclassified: 0.8, secondary_link: 0.8 };
  const gCarro = criarGrafo(new Set(Object.keys(PESO_CARRO)), PESO_CARRO, densV);
  for (let v = 0; v < gCarro.n; v++) if (naZonaPed(gCarro.X[v], gCarro.Z[v]) || gCarro.Y[v] > altura(gCarro.X[v], gCarro.Z[v]) + 0.3) { gCarro.W[v] = 0; }
  { let a = 0; for (let v = 0; v < gCarro.n; v++) { a += gCarro.W[v]; gCarro.acum[v] = a; } gCarro.total = a || 1; }

  // ---------- população em grafo (pedestres, bicicletas, carros) ----------
  const LIVRES = V.livres;
  const matriz = (im, i, x, y, z, hx, hz, sx, sy, sz) => {
    const L = Math.hypot(hx, hz) || 1, s = hx / L, c = hz / L, a = im.instanceMatrix.array, o = i * 16;
    a[o] = c * sx; a[o + 1] = 0; a[o + 2] = -s * sx; a[o + 3] = 0;
    a[o + 4] = 0; a[o + 5] = sy; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = s * sz; a[o + 9] = 0; a[o + 10] = c * sz; a[o + 11] = 0;
    a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
  };
  // matriz de alguém caído: tomba na direção (fx, fz) em 0,35 s, fica deitado e levanta nos últimos 0,6 s (resta = s no chão)
  const CAIDO = 6;
  const matrizCaida = (a, i, px, py, pz, fx, fz, resta, e, sy) => {
    const tq = CAIDO - resta, th = (Math.PI / 2) * Math.min(1, tq / 0.35, resta / 0.6), sT = Math.sin(th), cT = Math.cos(th), o = i * 16;
    a[o] = -fz * e; a[o + 1] = 0; a[o + 2] = fx * e; a[o + 3] = 0;
    a[o + 4] = sT * fx * sy; a[o + 5] = cT * sy; a[o + 6] = sT * fz * sy; a[o + 7] = 0;
    a[o + 8] = -fx * cT * e; a[o + 9] = sT * e; a[o + 10] = -fz * cT * e; a[o + 11] = 0;
    a[o + 12] = px; a[o + 13] = py + 0.12 * sT; a[o + 14] = pz; a[o + 15] = 1;
  };
  function populacao({ n, grafo, geo, mat, vel, desloc, offTipo, livres = 0, sombra = true, respawnLonge = false, crianca = null }) {
    const im = malhaInst(geo, mat, n, sombra);
    const x = new Float32Array(n), z = new Float32Array(n), y = new Float32Array(n), hx = new Float32Array(n), hz = new Float32Array(n);
    const alvo = new Int32Array(n), ant = new Int32Array(n), spd = new Float32Array(n), off = new Float32Array(n), esc = new Float32Array(n);
    const modo = new Uint8Array(n), seg = new Int32Array(n), sentido = new Uint8Array(n), pausa = new Float32Array(n), tx = new Float32Array(n), tz = new Float32Array(n);
    const offA = new Float32Array(n), tipoA = new Array(n), alt = new Float32Array(n), prog = new Float32Array(n), elen = new Float32Array(n), escI = new Float32Array(n).fill(1);
    const caido = new Float32Array(n), caiX = new Float32Array(n), caiZ = new Float32Array(n); // derrubados pela e-bike ou por quem anda na vista de rua
    const g = grafo;
    const escolhe = (i) => {
      const v = alvo[i], a0 = g.off[v], nn = Math.min(16, g.off[v + 1] - a0);
      if (!nn) return -1;
      if (nn === 1) return g.adj[a0];
      let tot = 0; const w = escolhe.w || (escolhe.w = new Float64Array(16));
      for (let k = 0; k < nn; k++) {
        const u = g.adj[a0 + k];
        let p;
        if (u === ant[i]) p = 0.03;
        else { const dx = g.X[u] - g.X[v], dz = g.Z[u] - g.Z[v], L = Math.hypot(dx, dz) || 1; p = (0.35 + 0.65 * Math.max(0, (dx * hx[i] + dz * hz[i]) / L)) * (g.W[u] + 0.01); }
        w[k] = p; tot += p;
      }
      let r = rnd() * tot, k = 0;
      while (k < nn - 1 && r > w[k]) { r -= w[k]; k++; }
      return g.adj[a0 + k];
    };
    const irPara = (i, u) => { // próximo vértice u: posição de partida = vértice atual
      ant[i] = alvo[i]; alvo[i] = u; tx[i] = g.X[u]; tz[i] = g.Z[u];
      const v = ant[i]; let j = g.off[v]; while (j < g.off[v + 1] - 1 && g.adj[j] !== u) j++; tipoA[i] = g.tipos[g.tpI[j]];
      elen[i] = Math.hypot(tx[i] - g.X[v], tz[i] - g.Z[v]) || 1; prog[i] = 0;
      const dx = tx[i] - g.X[v], dz = tz[i] - g.Z[v], L = Math.hypot(dx, dz) || 1;
      if (hx[i] === 0 && hz[i] === 0) { hx[i] = dx / L; hz[i] = dz / L; }
    };
    const semear = (i, longe) => {
      let v = sorteiaVertice(g);
      if (longe && controls) for (let t = 0; t < 8 && Math.hypot(g.X[v] - controls.target.x, g.Z[v] - controls.target.z) < 140; t++) v = sorteiaVertice(g);
      modo[i] = 0; alvo[i] = v; ant[i] = v; x[i] = g.X[v]; z[i] = g.Z[v]; y[i] = g.Y[v]; hx[i] = hz[i] = 0;
      const u = escolhe(i);
      if (u < 0) { alvo[i] = v; tx[i] = x[i]; tz[i] = z[i]; return; }
      irPara(i, u);
      x[i] = g.X[v]; z[i] = g.Z[v];
    };
    const semearLivre = (i) => {
      modo[i] = 1; seg[i] = Math.floor(rnd() * LIVRES.length); sentido[i] = rnd() < 0.5 ? 0 : 1;
      const s = LIVRES[seg[i]], k = sentido[i] ? 2 : 0, t = rnd();
      x[i] = s[k] + (s[2 - k] - s[k]) * t; z[i] = s[k + 1] + (s[3 - k] - s[k + 1]) * t;
      tx[i] = s[2 - k]; tz[i] = s[3 - k]; hx[i] = tx[i] - x[i]; hz[i] = tz[i] - z[i]; pausa[i] = 0; y[i] = altura(x[i], z[i]) + 0.02;
    };
    const proximoLivre = (i) => {
      // outro trajeto da praça com uma ponta a até 16 m da ponta de chegada; senão, volta
      const px = tx[i], pz = tz[i], ini = Math.floor(rnd() * LIVRES.length);
      for (let q = 0; q < 40; q++) {
        const j = (ini + q * 7) % LIVRES.length, s = LIVRES[j];
        for (const k of [0, 2]) if (Math.hypot(s[k] - px, s[k + 1] - pz) < 16 && j !== seg[i]) { seg[i] = j; sentido[i] = k ? 1 : 0; tx[i] = s[2 - k]; tz[i] = s[3 - k]; return; }
      }
      const s = LIVRES[seg[i]], k = sentido[i] ? 0 : 2; sentido[i] ^= 1; tx[i] = s[2 - k]; tz[i] = s[3 - k];
    };
    for (let i = 0; i < n; i++) {
      if (i < livres) semearLivre(i); else semear(i, false);
      spd[i] = vel[0] + (vel[1] - vel[0]) * rnd(); off[i] = desloc(i, rnd); offA[i] = off[i]; esc[i] = 0;
      im.geometry.attributes.aAnim.setXY(i, rnd() * TAU, spd[i]);
      alt[i] = 0.94 + rnd() * 0.14;
    }
    // crianças (crianca(i) → 0 adulto, 1 de mão com o adulto i − 1, 2 sozinha): 0,48–0,7 (pequenas) e 0,65–0,85 (escolares) da altura, ombros na proporção;
    // a de família anda no ritmo e na trilha do adulto, 0,6 m ao lado
    const tipoC = new Uint8Array(n), larg = new Float32Array(n).fill(1);
    const ultX = new Float32Array(n), ultY = new Float32Array(n), ultZ = new Float32Array(n);
    if (crianca) for (let i = 0; i < n; i++) {
      tipoC[i] = crianca(i);
      if (tipoC[i]) { alt[i] = tipoC[i] === 1 ? 0.48 + rnd() * 0.22 : 0.65 + rnd() * 0.2; larg[i] = 0.7 + 0.3 * (alt[i] - 0.48) / 0.37; if (tipoC[i] === 2) spd[i] *= 1.1; }
    }
    let primeiro = true;
    const pos = { perto: 0 };
    return {
      im, n, x, z, esc, tipoC,
      cores(fn) { for (let i = 0; i < n; i++) fn(i, im.geometry.attributes); for (const k of ['aTorso', 'aCalca', 'aPele', 'aCabelo', 'aAnim', 'aAcess']) if (im.geometry.attributes[k]) im.geometry.attributes[k].needsUpdate = true; },
      atualizar(dt, ativos, alvoCam) {
        const A = im.geometry.attributes.aAnim, a = im.instanceMatrix.array;
        let animar = false, perto = 0, ult = -1;
        for (let i = 0; i < n; i++) {
          const quer = i < ativos ? 1 : 0;
          if (primeiro) esc[i] = quer; else esc[i] += lim(quer - esc[i], -dt / 1.6, dt / 1.6);
          if (esc[i] <= 0.01) { a.fill(0, i * 16, i * 16 + 16); if (!quer) esc[i] = 0; continue; }
          ult = i;
          let v = spd[i];
          if (caido[i] > 0) { caido[i] = Math.max(0, caido[i] - dt); v = 0; }
          if (modo[i] === 1 && pausa[i] > 0) { pausa[i] -= dt; v = 0; if (pausa[i] <= 0) { proximoLivre(i); } }
          if (dt > 0 && v > 0) {
            const dx = tx[i] - x[i], dz = tz[i] - z[i], d = Math.hypot(dx, dz), passo = v * dt;
            if (d <= passo + 1e-4) {
              x[i] = tx[i]; z[i] = tz[i];
              if (modo[i] === 0) {
                const u = escolhe(i);
                if (u < 0 || (g.off[alvo[i] + 1] - g.off[alvo[i]] === 1 && respawnLonge)) semear(i, true); else irPara(i, u);
                if (u >= 0 && g.off[alvo[i] + 1] - g.off[alvo[i]] === 1 && !respawnLonge) { /* beco: volta */ }
              } else proximoLivre(i); // sem pausas: todo mundo anda
            } else { x[i] += (dx / d) * passo; z[i] += (dz / d) * passo; if (modo[i] === 0) prog[i] = 1 - d / elen[i]; }
          }
          // rumo suave e deslocamento lateral (mão direita: direita do rumo = (−hz, hx))
          const dirx = tx[i] - x[i], dirz = tz[i] - z[i], Ld = Math.hypot(dirx, dirz);
          if (Ld > 0.05 && v > 0) { const k = Math.min(1, dt * 7); hx[i] += (dirx / Ld - hx[i]) * k; hz[i] += (dirz / Ld - hz[i]) * k; const Lh = Math.hypot(hx[i], hz[i]) || 1; hx[i] /= Lh; hz[i] /= Lh; }
          const oAlvo = modo[i] === 0 && offTipo ? offTipo(tipoA[i], off[i]) : off[i];
          offA[i] += lim(oAlvo - offA[i], -dt * 2.5, dt * 2.5);
          const px = x[i] - hz[i] * offA[i], pz = z[i] + hx[i] * offA[i];
          let py;
          if (modo[i] === 0) { const va = ant[i], vb = alvo[i]; py = g.Y[va] + (g.Y[vb] - g.Y[va]) * lim(prog[i], 0, 1); }
          else py = altura(px, pz) + 0.02;
          if (py < nivelReno - 0.3) py = nivelReno - 0.3;
          let e = esc[i], qx = px, qy = py, qz = pz, vv = v > 0 ? spd[i] : 0;
          if (tipoC[i] === 1 && esc[i - 1] > 0.01) { // ao lado do adulto da frente, no mesmo rumo e ritmo
            const p0 = i - 1; hx[i] = hx[p0]; hz[i] = hz[p0];
            qx = ultX[p0] - hz[p0] * 0.6; qz = ultZ[p0] + hx[p0] * 0.6; qy = ultY[p0]; x[i] = qx; z[i] = qz; tx[i] = qx + hx[p0]; tz[i] = qz + hz[p0];
            vv = A.getY(p0) * 1.25; e = Math.min(e, esc[p0]);
          }
          ultX[i] = qx; ultY[i] = qy; ultZ[i] = qz;
          if (caido[i] > 0) matrizCaida(a, i, qx, qy, qz, caiX[i], caiZ[i], caido[i], e * larg[i], e * alt[i]);
          else matriz(im, i, qx, qy, qz, hx[i], hz[i], e * larg[i], e * alt[i], e * larg[i]);
          if (A.getY(i) !== vv) { A.setY(i, vv); animar = true; }
          if (alvoCam && Math.abs(px - alvoCam.x) < 70 && Math.abs(pz - alvoCam.z) < 70) perto++;
        }
        primeiro = false;
        // só desenha até o último visível: instância de escala zero ainda roda o vertex shader (~2 ms com 1500 pedestres)
        im.count = ult + 1;
        im.instanceMatrix.needsUpdate = true;
        if (animar) A.needsUpdate = true;
        pos.perto = perto;
      },
      perto: () => pos.perto,
      // derruba quem estiver a menos de r de (x, z), caindo na direção (fx, fz); devolve quantos caíram
      derruba(x0, z0, r, fx, fz) {
        let k = 0;
        for (let i = 0; i < n; i++) {
          if (esc[i] < 0.5 || caido[i] > 0) continue;
          const px = x[i] - hz[i] * offA[i], pz = z[i] + hx[i] * offA[i];
          if (Math.hypot(px - x0, pz - z0) < r) { caido[i] = CAIDO; caiX[i] = fx; caiZ[i] = fz; k++; }
        }
        return k;
      },
    };
  }

  // ---------- perto e longe ----------
  // a malha de longe (só o corpo) desenha todo mundo; quem está a menos de R m da câmera passa para a malha de perto (com
  // roupa e acessórios), numa vaga copiada da de longe: matriz e atributos (estes só quando a vaga muda de dono)
  const ATR = ['aTorso', 'aCalca', 'aPele', 'aCabelo', 'aAnim', 'aAcess'];
  function separarPerto(imL, imP, dono, R) {
    if (!camera) return;
    const a = imL.instanceMatrix.array, b = imP.instanceMatrix.array, cx = camera.position.x, cz = camera.position.z, R2 = R * R;
    const AL = imL.geometry.attributes, AP = imP.geometry.attributes, cap = dono.length;
    let k = 0, mudou = false;
    for (let i = 0; i < imL.count && k < cap; i++) {
      const o = i * 16; if (a[o + 15] === 0) continue;
      const dx = a[o + 12] - cx, dz = a[o + 14] - cz; if (dx * dx + dz * dz > R2) continue;
      for (let j = 0; j < 16; j++) b[k * 16 + j] = a[o + j];
      a.fill(0, o, o + 16);
      if (dono[k] !== i) { dono[k] = i; mudou = true; for (const n of ATR) { const s = AL[n], d = AP[n]; for (let c = 0; c < s.itemSize; c++) d.array[k * s.itemSize + c] = s.array[i * s.itemSize + c]; } }
      k++;
    }
    imP.count = k; imL.instanceMatrix.needsUpdate = imP.instanceMatrix.needsUpdate = true;
    if (mudou) for (const n of ATR) AP[n].needsUpdate = true;
  }

  // ---------- geometrias ----------
  const cil = (r0, r1, h, s = 6) => new THREE.CylinderGeometry(r0, r1, h, s);
  const geoGente = (roupa = true) => {
    const partes = [];
    for (const l of [-1, 1]) {
      partes.push({ g: mat4(cil(0.075, 0.06, 0.82, roupa ? 5 : 4), l * 0.085, 0.46, 0), parte: 2, lado: l });
      partes.push({ g: mat4(new THREE.BoxGeometry(0.1, 0.07, 0.25), l * 0.085, 0.045, 0.05), parte: 3, lado: l });
      partes.push({ g: mat4(cil(0.042, 0.036, 0.5, roupa ? 5 : 4), l * 0.235, 1.21, 0), parte: 1, lado: l });
      partes.push({ g: mat4(new THREE.SphereGeometry(0.045, 4, roupa ? 3 : 2), l * 0.235, 0.9, 0), parte: 0, lado: l });
    }
    partes.push({ g: mat4(cil(0.17, 0.2, 0.62, roupa ? 7 : 6), 0, 1.19, 0, 1.2, 1, 0.72), parte: 1 });
    partes.push({ g: mat4(cil(0.045, 0.05, 0.08, 5), 0, 1.54, 0), parte: 0 });
    partes.push({ g: mat4(new THREE.SphereGeometry(0.115, roupa ? 7 : 5, roupa ? 5 : 4), 0, 1.65, 0), parte: 0 });
    partes.push({ g: mat4(new THREE.SphereGeometry(0.124, roupa ? 7 : 5, roupa ? 4 : 2, 0, TAU, 0, Math.PI * 0.55), 0, 1.66, -0.005), parte: 4 });
    if (!roupa) return unir(partes); // de longe: só o corpo (a roupa custava ~1100 vértices por pessoa, mesmo escondida)
    const DY = 0, DZ = 0;
    // peças opcionais (aOpc = 10·grupo + estilo; ver o shader): 1x cabelo, 2x chapéu, 3x casaco, 4x extra; parte 5 = aAcess
    const O = (g, parte, opc) => partes.push({ g, parte, opc });
    O(mat4(new THREE.BoxGeometry(0.22, 0.3, 0.06), 0, 1.55 + DY, -0.095 + DZ), 4, 11);                       // cabelo comprido
    O(mat4(new THREE.SphereGeometry(0.06, 4, 3), 0, 1.75 + DY, -0.1 + DZ), 4, 12);                           // coque
    O(mat4(new THREE.SphereGeometry(0.134, 6, 3, 0, TAU, 0, Math.PI * 0.55), 0, 1.665 + DY, DZ), 5, 21);    // gorro
    O(mat4(new THREE.SphereGeometry(0.04, 4, 2), 0, 1.81 + DY, DZ), 5, 21);                                   // pompom
    O(mat4(cil(0.128, 0.128, 0.07, 6), 0, 1.73 + DY, DZ), 5, 22);                                             // boné
    O(mat4(new THREE.BoxGeometry(0.17, 0.02, 0.13), 0, 1.705 + DY, 0.15 + DZ), 5, 22);                        // aba do boné
    O(mat4(cil(0.23, 0.23, 0.02, 8), 0, 1.71 + DY, DZ), 5, 23);                                              // chapéu: aba larga
    O(mat4(cil(0.12, 0.13, 0.13, 6), 0, 1.78 + DY, DZ), 5, 23);                                               // copa
    O(mat4(new THREE.TorusGeometry(0.1, 0.045, 3, 7).rotateX(Math.PI / 2), 0, 1.5 + DY, DZ), 5, 41);       // cachecol
    O(mat4(cil(0.205, 0.27, 0.52, 7), 0, 0.68, 0, 1.15, 1, 0.82), 1, 31);                                  // casaco comprido
    O(mat4(cil(0.19, 0.31, 0.46, 7), 0, 0.68, 0, 1.1, 1, 0.9), 1, 32);                                      // vestido
    O(mat4(new THREE.BoxGeometry(0.3, 0.36, 0.14), 0, 1.22, -0.2), 5, 42);                                    // mochila
    O(mat4(new THREE.BoxGeometry(0.07, 0.22, 0.22), 0.27, 0.98, 0.02), 5, 43);                                // bolsa de lado
    return unir(partes);
  };
  const geoBici = () => {
    const rot = (g, rx, ry, rz) => g.rotateX(rx).rotateY(ry).rotateZ(rz);
    const roda = (z0) => rot(new THREE.TorusGeometry(0.33, 0.028, 4, 10), 0, Math.PI / 2, 0).translate(0, 0.35, z0);
    return unir([
      { g: roda(0.55), parte: 3 }, { g: roda(-0.55), parte: 3 },
      { g: mat4(new THREE.BoxGeometry(0.05, 0.05, 1.1), 0, 0.62, 0), parte: 3 },
      { g: mat4(new THREE.BoxGeometry(0.05, 0.4, 0.05), 0, 0.5, -0.15), parte: 3 },
      { g: mat4(new THREE.BoxGeometry(0.42, 0.03, 0.03), 0, 0.98, 0.4), parte: 3 },
      { g: rot(cil(0.07, 0.06, 0.55, 5), 0.55, 0, 0).translate(0, 0.95, -0.17), parte: 1 }, // costas inclinadas
      { g: rot(cil(0.06, 0.05, 0.5, 5), -0.75, 0, 0).translate(0.1, 0.78, 0.1), parte: 2 },
      { g: rot(cil(0.06, 0.05, 0.5, 5), -0.75, 0, 0).translate(-0.1, 0.78, 0.1), parte: 2 },
      { g: rot(cil(0.035, 0.03, 0.5, 4), -1.1, 0, 0).translate(0.17, 1.12, 0.22), parte: 1 },
      { g: rot(cil(0.035, 0.03, 0.5, 4), -1.1, 0, 0).translate(-0.17, 1.12, 0.22), parte: 1 },
      { g: mat4(new THREE.SphereGeometry(0.105, 7, 5), 0, 1.4, 0.0), parte: 0 },
      { g: mat4(new THREE.SphereGeometry(0.115, 7, 4, 0, TAU, 0, Math.PI * 0.55), 0, 1.41, -0.005), parte: 4 },
    ]);
  };
  const geoCarro = () => unir([
    { g: mat4(new THREE.BoxGeometry(1.8, 0.62, 4.2), 0, 0.62, 0), parte: 1 },
    { g: mat4(new THREE.BoxGeometry(1.62, 0.52, 2.2), 0, 1.18, -0.2), parte: 1 },
    { g: mat4(new THREE.BoxGeometry(1.64, 0.38, 2.0), 0, 1.2, -0.2), parte: 3 }, // vidros
    ...[[-1, 1.3], [1, 1.3], [-1, -1.3], [1, -1.3]].map(([a, b]) => ({ g: mat4(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 8).rotateZ(Math.PI / 2), a * 0.88, 0.33, b), parte: 3 })),
  ]);

  // ---------- pedestres, bicicletas e carros ----------
  const VIA_CARRO = new Set(['secondary', 'secondary_link', 'tertiary', 'unclassified', 'residential', 'service']);
  const matG = matGente();
  const matC = matGente(0.45);
  const NPED = leve ? 360 : 1500, NBIKE = leve ? 160 : 650, NCARRO = leve ? 45 : 160; // carros: eram 36 na cidade inteira; bicicletas: Basel pedala muito (eram 280)
  const ped = populacao({ n: NPED, grafo: gPed, geo: geoGente(false), mat: matG, sombra: false, vel: [0.95, 1.65], livres: Math.round(NPED * 0.34),
    desloc: (i, r) => (r() < 0.5 ? -1 : 1) * (0.2 + r() * 0.9),
    offTipo: (t, o) => (VIA_CARRO.has(t) ? Math.sign(o) * (LARG[t] / 2 + 1.1) : o),
    // Basel tem muita criança na rua: ~18% de mão com um adulto (o índice anterior), ~7% sozinhas (escolares)
    crianca: (i) => { const h = hash01(i * 7919 + 13); return i > 0 && h < 0.18 ? 1 : h < 0.25 ? 2 : 0; } });
  // pedestres em ruas de carro andam na calçada: afasta do eixo conforme a largura (sorteado uma vez, no vértice)
  const bici = populacao({ n: NBIKE, grafo: gBike, geo: geoBici(), mat: matC, sombra: false, vel: [3.2, 5.6], respawnLonge: true, desloc: (i, r) => 1.1 + r() * 0.5 });
  const carro = populacao({ n: NCARRO, grafo: gCarro, geo: geoCarro(), mat: matC, vel: [4.5, 9], respawnLonge: true, desloc: (i, r) => 1.7 + r() * 0.3 });
  function pintar() {
    const tor = TORSO[S.estacao];
    ped.cores((i, A) => { poe3(A.aTorso, i, sorteia(ped.tipoC[i] ? INFANTIL : tor)); poe3(A.aCalca, i, sorteia(ped.tipoC[i] && hash01(i + 3) < 0.5 ? INFANTIL : CALCA)); poe3(A.aPele, i, sorteia(PELE)); poe3(A.aCabelo, i, sorteia(CABELO)); vestir(A, i, !!ped.tipoC[i], S.estacao); });
    bici.cores((i, A) => { poe3(A.aTorso, i, sorteia(TORSO.verao)); poe3(A.aCalca, i, sorteia(CALCA)); poe3(A.aPele, i, sorteia(PELE)); poe3(A.aCabelo, i, sorteia(CABELO)); });
    carro.cores((i, A) => { poe3(A.aTorso, i, sorteia(CARRO)); poe3(A.aCalca, i, CARRO[0]); poe3(A.aPele, i, CARRO[0]); poe3(A.aCabelo, i, CARRO[0]); });
  }
  pintar();
  const pedPerto = malhaInst(geoGente(true), matG, leve ? 120 : 360, false), donoPed = new Int32Array(pedPerto.count).fill(-1), R_PERTO = 110;
  // cachorros: ~9% dos adultos que andam levam um, na guia, um pouco à frente e à direita; porte e pelagem variados
  // (de salsicha a pastor), rabo e cabeça; a guia é uma linha da mão até a coleira
  const caes = (() => {
    const donos = []; for (let i = 0; i < ped.n; i++) if (!ped.tipoC[i] && !(ped.tipoC[i + 1] === 1) && hash01(i * 31 + 7) < 0.09) donos.push(i);
    if (!donos.length) return null;
    const P = [];
    P.push({ g: mat4(new THREE.CapsuleGeometry(0.11, 0.38, 3, 7).rotateX(Math.PI / 2), 0, 0.34, 0), parte: 1 });       // corpo
    for (const [x, z] of [[-0.08, 0.17], [0.08, 0.17], [-0.08, -0.17], [0.08, -0.17]]) P.push({ g: mat4(cil(0.032, 0.028, 0.26, 5), x, 0.13, z), parte: 1 }); // patas
    P.push({ g: mat4(new THREE.SphereGeometry(0.1, 7, 5), 0, 0.46, 0.3), parte: 1 });                                     // cabeça
    P.push({ g: mat4(new THREE.BoxGeometry(0.08, 0.07, 0.12), 0, 0.43, 0.41), parte: 1 });                                 // focinho
    P.push({ g: mat4(new THREE.SphereGeometry(0.022, 4, 3), 0, 0.44, 0.475), parte: 3 });                                  // nariz
    for (const x of [-0.065, 0.065]) P.push({ g: mat4(new THREE.BoxGeometry(0.04, 0.09, 0.06).rotateZ(x > 0 ? -0.3 : 0.3), x, 0.53, 0.27), parte: 4 }); // orelhas
    P.push({ g: mat4(cil(0.018, 0.012, 0.24, 4).rotateX(-0.9), 0, 0.42, -0.3), parte: 4 });                               // rabo
    const im = malhaInst(unir(P), matG, donos.length, false);
    const PEL = ['#3a2a1c', '#c8a06a', '#151515', '#e8e0d0', '#8a5a2a', '#d8b070', '#6b6b6b', '#a06030'].map(cor);
    const A = im.geometry.attributes, porte = donos.map((_, k) => 0.55 + hash01(k * 13 + 5) * 0.95);
    donos.forEach((_, k) => { const c = PEL[Math.floor(hash01(k * 17 + 3) * PEL.length)]; poe3(A.aTorso, k, c); poe3(A.aCalca, k, c); poe3(A.aPele, k, c); poe3(A.aCabelo, k, hash01(k + 9) < 0.5 ? c : PEL[2]); });
    for (const k of ['aTorso', 'aCalca', 'aPele', 'aCabelo']) A[k].needsUpdate = true;
    const guia = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(donos.length * 6), 3)), new THREE.LineBasicMaterial({ color: 0x2a2a2a }));
    guia.frustumCulled = false; guia.name = "guias"; grupo.add(guia);
    const pd = ped.im.instanceMatrix.array, pc = im.instanceMatrix.array, pg = guia.geometry.attributes.position.array, sx = new THREE.Vector3();
    return function atualizarCaes(t) {
      donos.forEach((o, k) => {
        const e = o * 16;
        if (o >= ped.im.count || pd[e + 15] === 0 || pd[e] * pd[e] + pd[e + 2] * pd[e + 2] < 1e-6) { pc.fill(0, k * 16, k * 16 + 16); pg.fill(0, k * 6, k * 6 + 6); return; }
        sx.set(pd[e], pd[e + 1], pd[e + 2]); const esc = sx.length(); // escala do dono (some e aparece com ele)
        const fx = pd[e + 8] / esc, fz = pd[e + 10] / esc, rx = pd[e] / esc, rz = pd[e + 2] / esc; // frente e direita do dono
        const ox = pd[e + 12], oy = pd[e + 13], oz = pd[e + 14], s = porte[k] * Math.min(1, esc);
        const x = ox + fx * 0.9 + rx * 0.45, z = oz + fz * 0.9 + rz * 0.45, y = oy + Math.sin(t * 9 + k) * 0.012 * s;
        matriz(im, k, x, y, z, fx, fz, s, s, s);
        pg.set([ox + rx * 0.24, oy + 0.9 * Math.min(1, esc), oz + rz * 0.24, x + fx * 0.3 * s, y + 0.4 * s, z + fz * 0.3 * s], k * 6);
      });
      im.instanceMatrix.needsUpdate = true; guia.geometry.attributes.position.needsUpdate = true;
    };
  })();
  for (const p of [bici, carro]) { const A = p.im.geometry.attributes.aAnim; for (let i = 0; i < p.n; i++) A.setY(i, 0); A.needsUpdate = true; }

  // ---------- gente parada: rodinhas nas praças, sentados no Rheinbord, debruçados na Mittlere, à espera do bonde ----------
  // Cada lugar ganha um limiar sorteado; aparece quando a lotação do tipo (hora, dia, estação) passa dele.
  const geoSentado = () => {
    const partes = [], dy = -0.78; // tronco e cabeça como os de quem anda, baixados até o chão
    for (const l of [-1, 1]) {
      partes.push({ g: mat4(cil(0.075, 0.06, 0.82, 5).rotateX(Math.PI / 2), l * 0.1, 0.09, 0.4), parte: 2 });
      partes.push({ g: mat4(new THREE.BoxGeometry(0.1, 0.22, 0.07), l * 0.1, 0.12, 0.84), parte: 3 });
      partes.push({ g: mat4(cil(0.042, 0.036, 0.5, 5).rotateX(-0.35), l * 0.235, 1.21 + dy, -0.06), parte: 1 });
      partes.push({ g: mat4(new THREE.SphereGeometry(0.045, 4, 3), l * 0.235, 0.12, -0.14), parte: 0 });
    }
    partes.push({ g: mat4(cil(0.17, 0.2, 0.62, 7), 0, 1.19 + dy, 0, 1.2, 1, 0.72), parte: 1 });
    partes.push({ g: mat4(cil(0.045, 0.05, 0.08, 5), 0, 1.54 + dy, 0), parte: 0 });
    partes.push({ g: mat4(new THREE.SphereGeometry(0.115, 7, 5), 0, 1.65 + dy, 0.02), parte: 0 });
    partes.push({ g: mat4(new THREE.SphereGeometry(0.124, 7, 4, 0, TAU, 0, Math.PI * 0.55), 0, 1.66 + dy, 0.015), parte: 4 });
    // (sem as peças opcionais: sentados quase sempre se veem de longe, e eram 1467 vértices cada)
    return unir(partes);
  };
  const LUG = { x: [], z: [], y: [], hx: [], hz: [], tipo: [], lim: [], alt: [], larg: [], kid: [] };
  // pKid: chance de ser criança (menor, mais estreita e de anoraque colorido, como as que andam)
  const lugar = (x, z, y, hx, hz, tipo, pKid = 0, lim = null) => {
    if (leve && lim == null && rnd() < 0.5) return;
    const kid = rnd() < pKid, alt = kid ? 0.5 + rnd() * 0.3 : 0.94 + rnd() * 0.14;
    LUG.x.push(x); LUG.z.push(z); LUG.y.push(y); LUG.hx.push(hx); LUG.hz.push(hz); LUG.tipo.push(tipo); LUG.lim.push(lim ?? rnd()); LUG.alt.push(alt); // lim: o mesmo para a família inteira (aparece junta)
    LUG.larg.push(kid ? 0.7 + 0.3 * (alt - 0.5) / 0.3 : 1); LUG.kid.push(kid ? 1 : 0);
  };
  const SENT = []; // os sentados vão numa malha à parte
  if (PT) {
    for (const [cx, cz] of PT.grupos) { // rodinha de 2 a 5, de frente para o centro
      const k = 2 + Math.floor(rnd() * 4), r = 0.45 + 0.12 * k, a0 = rnd() * TAU;
      for (let j = 0; j < k; j++) {
        const a = a0 + (TAU * j) / k + (rnd() - 0.5) * 0.5, x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
        lugar(x, z, null, cx - x, cz - z, 0, 0.22);
      }
    }
    for (const [x, z, ang] of PT.sentados) SENT.push([x, z, Math.sin(ang), Math.cos(ang)]);
    for (const [px, pz] of PT.paradas) { // 1 a 4 à espera, olhando para lados quaisquer
      const k = 1 + Math.floor(rnd() * 4);
      for (let j = 0; j < k; j++) { const a = rnd() * TAU; lugar(px + (rnd() - 0.5) * 6, pz + (rnd() - 0.5) * 3, null, Math.sin(a), Math.cos(a), 3, 0.15); }
    }
  }
  // famílias nos parques: um ou dois adultos e de uma a três crianças por perto; quatro em cada dez num piquenique (toalha
  // xadrez no chão, dois sentados e as crianças em volta). Uma família a cada ~1000 m² de parque ou gramado, até 25 por
  // parque e 400 no total (120 no leve)
  const PIQ = []; // [x, z, rumo, sentados (índices em SENT)]
  {
    const dentroP = (x, z, p) => { let d = false; for (let i = 1, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > z) !== (p[j + 1] > z) && x < ((p[j] - p[i]) * (z - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) d = !d; return d; };
    const areaP = (p) => { let a = 0; for (let i = 1, j = p.length - 2; i < p.length; j = i, i += 2) a += (p[j] + p[i]) * (p[j + 1] - p[i + 1]); return Math.abs(a / 2); };
    let n = 0; const teto = leve ? 120 : 400;
    for (const p of VERDE) {
      if (p[0] !== 0 && p[0] !== 2) continue; // parques e gramados públicos (os jardins do OSM são quase todos particulares)
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let i = 1; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]); }
      const k = Math.min(25, Math.floor(areaP(p) / 1000 + rnd()));
      for (let j = 0, t = 0; j < k && t < k * 6 && n < teto; t++) {
        const cx = x0 + rnd() * (x1 - x0), cz = z0 + rnd() * (z1 - z0);
        if (!dentroP(cx, cz, p) || FORA(cx, cz)) continue;
        j++; n++;
        const ang = rnd() * TAU, adultos = 1 + (rnd() < 0.65 ? 1 : 0), criancas = 1 + Math.floor(rnd() * 3), lf = rnd(); // lf: limiar da família
        if (rnd() < 0.4) { // piquenique: os adultos sentados na toalha, as crianças de pé em volta
          const sent = [];
          for (let a = 0; a < adultos; a++) { const aa = ang + a * Math.PI; SENT.push([cx + Math.cos(aa) * 0.5, cz + Math.sin(aa) * 0.5, -Math.cos(aa), -Math.sin(aa), 1, lf]); sent.push(SENT.length - 1); }
          PIQ.push([cx, cz, ang, lf]);
          for (let c = 0; c < criancas; c++) { const a = ang + 1.2 + c * 1.1, r = 1.3 + rnd() * 1.2, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; lugar(x, z, null, cx - x, cz - z, 4, 1, lf); }
        } else { // de pé, conversando, com as crianças em volta
          for (let a = 0; a < adultos; a++) { const x = cx + (a - 0.5) * 0.7, z = cz + (rnd() - 0.5) * 0.4; lugar(x, z, null, Math.cos(ang), Math.sin(ang), 4, 0, lf); }
          for (let c = 0; c < criancas; c++) { const a = ang + (rnd() - 0.5) * 2.4, r = 1.0 + rnd() * 2.0, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; lugar(x, z, null, cx - x, cz - z, 4, 1, lf); }
        }
      }
    }
  }
  // Markthalle (Steinentorberg) e Centralbahnplatz (SBB): gente de pé na calçada, sobretudo em dia útil (a feira da Markthalle,
  // quem espera o trem); conversando em rodinhas de 2 a 4. Tipo 1 na densidade (parados())
  for (const [x0, x1, z0, z1, n] of [[-215, -135, 1047, 1055, leve ? 16 : 34], [-5, 65, 1148, 1165, leve ? 22 : 50]]) {
    for (let k = 0; k < n; ) {
      const cx = x0 + rnd() * (x1 - x0), cz = z0 + rnd() * (z1 - z0), m = 2 + Math.floor(rnd() * 3), a0 = rnd() * TAU, lim = rnd();
      for (let j = 0; j < m && k < n; j++, k++) { const a = a0 + (TAU * j) / m, x = cx + Math.sin(a) * 0.6, z = cz + Math.cos(a) * 0.6; lugar(x, z, null, cx - x, cz - z, 1, 0.08, lim); }
    }
  }
  if (ponte) { // debruçados no parapeito da Mittlere, de frente para o rio (o mesmo quadro de marcos.js)
    const { A, B, larg } = ponte, L = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L, nx = -uz, nz = ux;
    for (let sP = 18; sP < L - 18; sP += 3.2) for (const sg of [-1, 1]) {
      const b = sg * (larg / 2 - 0.85), s2 = sP + (rnd() - 0.5) * 1.5, x = A[0] + ux * s2 + nx * b, z = A[1] + uz * s2 + nz * b;
      lugar(x, z, cotaPonte(x, z), nx * sg, nz * sg, 2);
    }
  }
  const nLug = LUG.x.length;
  { // em ordem de limiar: quem aparece primeiro fica no começo e o resto sai do desenho (count), não só some com escala zero
    const ord = LUG.lim.map((_, i) => i).sort((p, q) => LUG.lim[p] - LUG.lim[q]);
    for (const k in LUG) LUG[k] = ord.map((i) => LUG[k][i]);
  }
  const imPar = nLug ? malhaInst(geoGente(false), matG, nLug, false) : null;
  const parSalvo = new Float32Array(nLug * 16); // as matrizes de verdade dos parados (separarPerto zera as de perto na malha de longe)
  const imParPerto = nLug ? malhaInst(geoGente(true), matG, leve ? 80 : 250, false) : null, donoPar = new Int32Array(imParPerto?.count ?? 0).fill(-1);
  const imSent = SENT.length ? malhaInst(geoSentado(), matG, SENT.length, false) : null;
  const limSent = SENT.map((e) => e[5] ?? rnd()), altSent = SENT.map(() => 0.94 + rnd() * 0.14);
  // toalhas dos piqueniques: xadrez em cores de toalha (vermelho, azul, verde, amarelo), uma por família sentada
  const imToalha = PIQ.length ? (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 32; const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 32, 32); g.fillStyle = 'rgba(0,0,0,.45)'; for (let i = 0; i < 4; i++) { g.fillRect(i * 8, 0, 4, 32); g.fillRect(0, i * 8, 32, 4); }
    const tx = new THREE.CanvasTexture(cv); tx.magFilter = THREE.NearestFilter;
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.9, 1.5).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.95 }), PIQ.length);
    const CT = ['#c8202a', '#2a5fb0', '#3c8f4a', '#e0a020'].map((c) => new THREE.Color(c));
    PIQ.forEach((p, i) => m.setColorAt(i, CT[i % CT.length]));
    m.frustumCulled = false; m.receiveShadow = true; grupo.add(m); return m;
  })() : null;
  const yToalha = PIQ.map(([x, z]) => altura(x, z) + 0.03);
  for (let i = 0; i < nLug; i++) if (LUG.y[i] == null) LUG.y[i] = altura(LUG.x[i], LUG.z[i]) + 0.02;
  const ySent = SENT.map(([x, z]) => altura(x, z) + 0.02);
  function pintarParados() {
    const tor = TORSO[S.estacao];
    for (const im of [imPar, imSent]) {
      if (!im) continue;
      const A = im.geometry.attributes;
      for (let i = 0; i < A.aTorso.count; i++) { const kid = im === imPar && LUG.kid[i]; poe3(A.aTorso, i, sorteia(kid ? INFANTIL : tor)); poe3(A.aCalca, i, sorteia(kid && rnd() < 0.5 ? INFANTIL : CALCA)); poe3(A.aPele, i, sorteia(PELE)); poe3(A.aCabelo, i, sorteia(CABELO)); vestir(A, i, !!kid, S.estacao); A.aAnim.setXY(i, rnd() * TAU, 0.3 + rnd() * 0.25); } // ninguém fica estátua: braços e pernas mexem de leve
      for (const k of ['aTorso', 'aCalca', 'aPele', 'aCabelo', 'aAnim', 'aAcess']) if (A[k]) A[k].needsUpdate = true;
    }
  }
  pintarParados();
  const ESTACAO_RIO = { verao: 1, meia: 0.4, inverno: 0.1 };
  let tParados = -1e9;
  const caidoP = new Float32Array(nLug), caiPX = new Float32Array(nLug), caiPZ = new Float32Array(nLug);
  let algumCaidoP = false;
  // quem está parado (rodinhas, parapeito, paradas) também cai; anima a cada quadro enquanto houver alguém no chão
  function caidosParados(dt) {
    if (!algumCaidoP || !imPar) return;
    const m = imPar.instanceMatrix.array; algumCaidoP = false;
    for (let i = 0; i < nLug; i++) {
      if (caidoP[i] <= 0) continue;
      caidoP[i] = Math.max(0, caidoP[i] - dt);
      if (caidoP[i] > 0) { algumCaidoP = true; matrizCaida(m, i, LUG.x[i], LUG.y[i], LUG.z[i], caiPX[i], caiPZ[i], caidoP[i], LUG.larg[i], LUG.alt[i]); }
      else matriz(imPar, i, LUG.x[i], LUG.y[i], LUG.z[i], LUG.hx[i], LUG.hz[i], LUG.larg[i], LUG.alt[i], LUG.larg[i]);
      parSalvo.set(m.subarray(i * 16, i * 16 + 16), i * 16);
    }
    imPar.instanceMatrix.needsUpdate = true;
  }
  function derrubaParados(x, z, r, fx, fz) {
    if (!imPar) return 0;
    const m = parSalvo; let k = 0;
    for (let i = 0; i < nLug; i++) {
      if (caidoP[i] > 0 || m[i * 16 + 15] !== 1) continue; // só quem está à vista
      if (Math.hypot(LUG.x[i] - x, LUG.z[i] - z) < r) { caidoP[i] = CAIDO; caiPX[i] = fx; caiPZ[i] = fz; k++; algumCaidoP = true; }
    }
    return k;
  }
  function parados(agora, fp, h) {
    if (agora - tParados < 900) return; // muda pouco: uma vez por segundo
    tParados = agora;
    const f = lim(fp, 0, 1);
    // lotação de cada tipo (0..1); escalas que dão ~250–400 a mais numa tarde de verão
    // famílias nos parques: de dia (mais à tarde), muito mais no fim de semana e no verão, quase ninguém no inverno
    const dParque = 0.8 * suave(9.5, 11.5, h) * (1 - suave(18.5, 20.5, h)) * ({ verao: 1, meia: 0.6, inverno: 0.15 })[S.estacao] * (S.dia === 'util' ? 0.5 : 1) * (0.4 + 0.6 * lim(f * 1.5, 0, 1));
    const dens = [
      0.6 * lim(0.12 + 0.95 * f, 0, 1),                                        // rodinhas
      0.75 * lim(0.2 + 0.9 * f, 0, 1) * (S.dia === 'util' ? 1 : 0.45) * suave(6.5, 8, h) * (1 - suave(20, 22.5, h)), // Markthalle e SBB
      0.6 * lim(0.15 + 0.9 * f, 0, 1),                                         // parapeito da ponte
      0.5 * lim(0.1 + 0.9 * f, 0, 1),                                          // paradas de bonde
      dParque,                                                                 // famílias nos parques
    ];
    // Rheinbord: tardes e começo de noite, sobretudo no verão
    const dRio = 0.5 * lim(f * 1.2, 0, 1) * suave(10, 15, h) * (1 - 0.7 * suave(21, 24, h)) * ESTACAO_RIO[S.estacao];
    if (imToalha) { const m = imToalha.instanceMatrix.array; PIQ.forEach(([x, z, a, lf], i) => { if (lf < dParque) matriz(imToalha, i, x, yToalha[i], z, Math.cos(a), Math.sin(a), 1, 1, 1); else m.fill(0, i * 16, i * 16 + 16); }); imToalha.instanceMatrix.needsUpdate = true; }
    let n = 0;
    if (imPar) {
      const m = imPar.instanceMatrix.array;
      let ult = -1;
      for (let i = 0; i < nLug; i++) {
        if (caidoP[i] > 0) { n++; ult = i; continue; } // no chão: caidosParados() cuida
        if (LUG.lim[i] < dens[LUG.tipo[i]]) { matriz(imPar, i, LUG.x[i], LUG.y[i], LUG.z[i], LUG.hx[i], LUG.hz[i], LUG.larg[i], LUG.alt[i], LUG.larg[i]); n++; ult = i; }
        else m.fill(0, i * 16, i * 16 + 16);
      }
      imPar.count = ult + 1; parSalvo.set(imPar.instanceMatrix.array);
      imPar.instanceMatrix.needsUpdate = true;
    }
    if (imSent) {
      const m = imSent.instanceMatrix.array;
      for (let i = 0; i < SENT.length; i++) {
        const [x, z, hx, hz] = SENT[i];
        if (limSent[i] < (SENT[i][4] === 1 ? dParque : dRio)) { matriz(imSent, i, x, ySent[i], z, hx, hz, 1, altSent[i], 1); n++; }
        else m.fill(0, i * 16, i * 16 + 16);
      }
      imSent.instanceMatrix.needsUpdate = true;
    }
    info.parados = n;
  }

  // ---------- bondes ----------
  const padroes = V.bondes.padroes;
  const DS = 2; // m entre pontos do caminho
  const trilhos = padroes.map((p) => {
    const n = p.c.length / 2, X = new Float64Array(n), Z = new Float64Array(n), Yv = new Float64Array(n), ponte = new Uint8Array(n);
    for (let i = 0; i < n; i++) { X[i] = p.c[i * 2] / 10; Z[i] = p.c[i * 2 + 1] / 10; }
    for (const i of p.p) ponte[i] = 1;
    // ponte: reta entre as cotas das pontas da sequência (como o chao.js)
    for (let i = 0; i < n; i++) Yv[i] = altura(X[i], Z[i]) + 0.06;
    for (let i = 0; i < n;) {
      if (!ponte[i]) { i++; continue; }
      let j = i; while (j + 1 < n && ponte[j + 1]) j++;
      const hA = j > i ? cotaPonta(altura, X[i], Z[i], X[i + 1], Z[i + 1]) : altura(X[i], Z[i]), hB = j > i ? cotaPonta(altura, X[j], Z[j], X[j - 1], Z[j - 1]) : hA;
      let L = 0; const acL = [0]; for (let k = i + 1; k <= j; k++) { L += Math.hypot(X[k] - X[k - 1], Z[k] - Z[k - 1]); acL.push(L); }
      for (let k = i; k <= j; k++) Yv[k] = hA + (hB - hA) * (L ? acL[k - i] / L : 0) + 0.6; // como os trilhos de chao.js
      i = j + 1;
    }
    // reamostra a cada DS m
    const xs = [], ys = [], zs = []; let falta = 0;
    for (let i = 0; i < n - 1; i++) {
      const L = Math.hypot(X[i + 1] - X[i], Z[i + 1] - Z[i]);
      for (let d = falta; d < L; d += DS) {
        const f = L ? d / L : 0;
        const ex = X[i] + (X[i + 1] - X[i]) * f, ez = Z[i] + (Z[i + 1] - Z[i]) * f;
        xs.push(ex); zs.push(ez);
        ys.push(ponte[i] && ponte[i + 1] ? Yv[i] + (Yv[i + 1] - Yv[i]) * f : altura(ex, ez) + 0.06);
        falta = d + DS - L;
      }
      falta = Math.max(0, falta);
    }
    xs.push(X[n - 1]); ys.push(Yv[n - 1]); zs.push(Z[n - 1]);
    // quadros-chave de tempo → posição (s)
    const k = p.k, kf = [[0, 0, 0]];
    let tp = 0; // a tabela só tem minutos: garante ao menos 14 s de parada e tempos que não voltam atrás
    k.forEach(([s, ta, td]) => { ta = Math.max(ta, tp); td = Math.min(Math.max(td, ta + 14), ta + 20); kf.push([ta, s, 1], [td, s, 2]); tp = td + 4; }); // parada de 14–20 s: a tabela só tem minutos e o bonde ficava um minuto inteiro parado
    kf.push([Math.max(p.T, tp), (xs.length - 1) * DS, 3]);
    return { xs, ys, zs, total: (xs.length - 1) * DS, kf, p };
  });
  // linhas coloridas (desligadas por padrão; chave no painel): uma fita por linha sobre os trilhos, só no sentido 0 (o de
  // volta passa pelos mesmos trilhos), deslocada para o lado pela posição da linha na lista, para as que dividem a rua
  // aparecerem lado a lado. Cores distintas, aproximadas do mapa da rede (não as oficiais)
  const COR_LINHA = { 1: '#8c5a2b', 2: '#c9a227', 3: '#1f3f8f', 6: '#2a7fd4', 8: '#d6408f', 10: '#f2c200', 11: '#d62828', 14: '#7a3fb0', 15: '#2e9e4f', 16: '#8cc63f', 17: '#20b2aa' };
  const linhasCor = (() => {
    const nums = [...new Set(padroes.map((p) => p.l))].sort((a, b) => +a - +b), g = new THREE.Group(); g.name = 'linhas de bonde'; g.visible = false;
    nums.forEach((l, slot) => {
      const P = [], I = [], off = ((slot % 5) - 2) * 2.0, w = 1.8;
      for (const tr of trilhos) {
        if (tr.p.l !== l || tr.p.d) continue;
        const n = tr.xs.length;
        for (let i = 0; i < n; i++) {
          const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1), dx = tr.xs[i1] - tr.xs[i0], dz = tr.zs[i1] - tr.zs[i0], L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L, v = P.length / 3, y = tr.ys[i] + 0.12;
          P.push(tr.xs[i] + nx * (off - w / 2), y, tr.zs[i] + nz * (off - w / 2), tr.xs[i] + nx * (off + w / 2), y, tr.zs[i] + nz * (off + w / 2));
          if (i) I.push(v - 2, v - 1, v, v - 1, v + 1, v);
        }
      }
      if (!P.length) return;
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setIndex(I);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: COR_LINHA[l] ?? '#888', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, fog: true }));
      m.renderOrder = 1; m.material.userData.semNeve = true; g.add(m);
    });
    cena.add(g); // fora do grupo da vida: as cores ficam mesmo com gente e bondes desligados
    return { g, nums };
  })();
  function posS(tr, s, o) {
    const f = lim(s / DS, 0, tr.xs.length - 1.001), i = Math.floor(f), u = f - i;
    o.x = tr.xs[i] + (tr.xs[i + 1] - tr.xs[i]) * u; o.y = tr.ys[i] + (tr.ys[i + 1] - tr.ys[i]) * u; o.z = tr.zs[i] + (tr.zs[i + 1] - tr.zs[i]) * u;
  }
  function sDe(tr, t) {
    const kf = tr.kf;
    for (let j = 0; j < kf.length - 1; j++) {
      const a = kf[j], b = kf[j + 1];
      if (t > b[0]) continue;
      if (b[1] === a[1] || b[0] === a[0]) return { s: a[1], vel: 0, parada: true };
      const u = lim((t - a[0]) / (b[0] - a[0]), 0, 1);
      const ini = a[2] === 2, fim = b[2] === 1; // acelera ao sair da parada, freia ao chegar
      const e = ini && fim ? u * u * (3 - 2 * u) : ini ? u * u : fim ? 1 - (1 - u) * (1 - u) : u;
      const de = ini && fim ? 6 * u * (1 - u) : ini ? 2 * u : fim ? 2 * (1 - u) : 1;
      return { s: a[1] + (b[1] - a[1]) * e, vel: ((b[1] - a[1]) / (b[0] - a[0])) * de, parada: false };
    }
    return { s: kf.at(-1)[1], vel: 0, parada: true };
  }
  const MOD = 3, LM = 8.6, GAP = 0.45, NBOND = 40;
  const geoBonde = () => {
    const partes = [], P = [], C = [], J = [], I = [];
    const caixa = (w, h, l, x, y, z, c, jan = 0) => {
      const g = new THREE.BoxGeometry(w, h, l).translate(x, y, z).toNonIndexed();
      P.push(...g.attributes.position.array);
      const cc = new THREE.Color(c);
      for (let i = 0; i < g.attributes.position.count; i++) { C.push(cc.r, cc.g, cc.b); J.push(jan); }
    };
    return { caixa, fim() {
      const r = new THREE.BufferGeometry();
      r.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); r.computeVertexNormals();
      r.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); r.setAttribute('aJan', new THREE.Float32BufferAttribute(J, 1));
      return r;
    } };
  };
  // bonde no desenho do histórico verde da BVB (motor 1914 com reboque, foto do depósito Wiesenplatz): carroceria de madeira
  // pintada, janelas altas com colunas, teto em arco com lanternim, plataformas abertas nas pontas, farol redondo, truques à mostra
  function corpoBonde(cBase, cEscuro) {
    const b = geoBonde(), meio = LM / 2, plat = 0.85, corpo = LM - 2 * plat;
    b.caixa(2.0, 0.32, LM - 0.4, 0, 0.42, 0, '#2c2d2e');                          // chassi
    for (const z of [-1, 1]) {                                                    // truque: rodas, molas e caixa de eixo
      b.caixa(2.05, 0.5, 2.1, 0, 0.36, z * (meio - 2.1), '#3b3c3d');
      for (const x of [-1, 1]) for (const dz of [-0.55, 0.55]) b.caixa(0.12, 0.62, 0.62, x * 0.86, 0.33, z * (meio - 2.1) + dz, '#1d1e1f');
    }
    b.caixa(2.3, 0.95, corpo, 0, 1.12, 0, cBase);                                 // painel de baixo
    b.caixa(2.32, 0.06, corpo, 0, 1.62, 0, cEscuro);                              // friso sob as janelas
    b.caixa(2.3, 0.28, corpo, 0, 2.95, 0, cBase);                                 // faixa sobre as janelas
    const nJ = 6, passo = corpo / nJ;
    for (const l of [-1, 1]) {
      b.caixa(0.03, 1.2, corpo - 0.1, l * 1.15, 2.22, 0, '#24302f', 1);            // vidros (acesos à noite)
      for (let i = 0; i <= nJ; i++) b.caixa(0.06, 1.24, 0.13, l * 1.165, 2.22, -corpo / 2 + i * passo, cBase); // colunas
    }
    b.caixa(2.36, 0.07, corpo + 0.1, 0, 3.12, 0, cEscuro);                        // beiral do teto
    b.caixa(2.2, 0.16, LM - 0.1, 0, 3.22, 0, '#7a7d7e');                          // teto (cobre as plataformas)
    b.caixa(1.1, 0.26, corpo - 0.6, 0, 3.42, 0, '#686b6c');                       // lanternim
    for (const l of [-1, 1]) b.caixa(0.02, 0.14, corpo - 0.8, l * 0.56, 3.42, 0, '#1e2627', 1); // janelinhas do lanternim
    b.caixa(0.12, 0.12, 3.2, 0, 3.62, 0, '#2a2a2a');                              // base do pantógrafo
    b.caixa(0.06, 0.06, 2.0, 0, 3.95, -0.6, '#2a2a2a');                           // haste
    for (const z of [-1, 1]) {
      const zp = z * (meio - plat / 2);
      b.caixa(2.1, 1.0, 0.12, 0, 1.15, z * (meio - 0.06), cBase);                  // anteparo da plataforma (painel do maquinista)
      b.caixa(2.1, 1.25, 0.04, 0, 2.25, z * (meio - 0.05), '#24302f', 1);           // para-brisa em três vidros
      for (const x of [-0.36, 0.36]) b.caixa(0.09, 1.25, 0.07, x, 2.25, z * (meio - 0.03), cBase);
      for (const x of [-1, 1]) b.caixa(0.1, 2.3, 0.1, x * 1.0, 1.95, z * (meio - 0.08), cBase); // cantos
      b.caixa(2.0, 0.14, plat, 0, 0.66, zp, '#3a3b3c');                             // piso da plataforma e degrau
      b.caixa(0.28, 0.28, 0.08, 0, 1.25, z * (meio + 0.01), '#f4ecd0', 1);          // farol redondo
      b.caixa(1.0, 0.22, 0.05, 0, 3.3, z * (meio + 0.0), '#f2f0e8', 1);             // placa de destino no teto
      b.caixa(1.8, 0.12, 0.25, 0, 0.3, z * (meio + 0.08), '#2c2d2e');               // para-choque e engate
    }
    return b.fim();
  }
  const matBonde = (cor0) => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 });
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, UV);
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aJan; varying float vJan;').replace('#include <begin_vertex>', '#include <begin_vertex>\n  vJan = aJan;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vJan; uniform float uVidaNoite;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3(1.0, 0.82, 0.5) * vJan * uVidaNoite * 1.5;');
    };
    m.customProgramCacheKey = () => 'vida-bonde';
    return m;
  };
  const mBVB = new THREE.InstancedMesh(corpoBonde('#69b33c', '#2f6b26'), matBonde(), NBOND * MOD);
  const mBLT = new THREE.InstancedMesh(corpoBonde('#f0c21c', '#6b5a1c'), matBonde(), NBOND * MOD); // BLT: o mesmo desenho, no amarelo dela
  for (const m of [mBVB, mBLT]) {
    m.frustumCulled = false; m.castShadow = !leve; m.receiveShadow = true; m.count = 0; m.name = 'bondes';
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); grupo.add(m);
  }
  const ativos = new Map(); // viagem → { estado de parada anterior }
  const eu = new THREE.Euler(0, 0, 0, 'YXZ'), qq = new THREE.Quaternion(), m4 = new THREE.Matrix4(), v3 = new THREE.Vector3(), esc3 = new THREE.Vector3(1, 1, 1);
  const pA = { x: 0, y: 0, z: 0 }, pB = { x: 0, y: 0, z: 0 }, pC = { x: 0, y: 0, z: 0 };
  const lbound = (a, v) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; } return lo; };
  const bondeInfo = { perto: 1e9, vel: 0, n: 0 };
  const modulos = []; // [x, z, ux, uz] de cada módulo de bonde no quadro (o jogo testa colisão com eles)
  function bondes(dt) {
    let nB = 0, nL = 0; const visto = new Set();
    modulos.length = 0;
    bondeInfo.perto = 1e9; bondeInfo.vel = 0;
    const alvoCam = controls?.target;
    const diaCh = `i_${S.dia}`;
    for (let pi = 0; pi < trilhos.length; pi++) {
      const tr = trilhos[pi], ini = tr.p[diaCh];
      for (const off of [0, 86400]) {
        const t = S.simT + off;
        for (let k = lbound(ini, t - tr.p.T); k < ini.length && ini[k] <= t; k++) {
          const chave = `${pi}|${ini[k]}|${off}`;
          const tt = t - ini[k];
          if (tt < 0 || tt > tr.p.T) continue;
          visto.add(chave);
          const e = sDe(tr, tt);
          const est = ativos.get(chave);
          if (est && est.parada && !e.parada && window.ambiente) {
            posS(tr, e.s, pA);
            const d = alvoCam ? Math.hypot(pA.x - alvoCam.x, pA.z - alvoCam.z) : 999;
            if (d < 320) window.ambiente.evento('bonde', lim(1 - d / 320, 0, 1), (pA.x - (alvoCam?.x ?? 0)) / 320);
          }
          ativos.set(chave, { parada: e.parada });
          const m = tr.p.e === 'BLT' ? mBLT : mBVB, nn = tr.p.e === 'BLT' ? nL : nB;
          if (nn >= NBOND) continue;
          for (let q = 0; q < MOD; q++) {
            const sc = e.s + (q - 1) * (LM + GAP);
            posS(tr, sc, pA); posS(tr, sc - 3, pB); posS(tr, sc + 3, pC);
            const dx = pC.x - pB.x, dz = pC.z - pB.z, dy = pC.y - pB.y, Lh = Math.hypot(dx, dz) || 1;
            eu.set(-Math.atan2(dy, Lh), Math.atan2(dx, dz), 0);
            qq.setFromEuler(eu);
            m4.compose(v3.set(pA.x, pA.y, pA.z), qq, esc3);
            m.setMatrixAt(nn * MOD + q, m4);
            if (dx * dx + dz * dz > 1e-6) modulos.push([pA.x, pA.z, dx / Lh, dz / Lh]); // no fim da linha pB = pC: sem direção, ficaria de fora
          }
          if (tr.p.e === 'BLT') nL++; else nB++;
          if (alvoCam && !e.parada) { posS(tr, e.s, pA); const d = Math.hypot(pA.x - alvoCam.x, pA.z - alvoCam.z); if (d < bondeInfo.perto) { bondeInfo.perto = d; bondeInfo.vel = Math.abs(e.vel); } }
        }
      }
    }
    for (const k of ativos.keys()) if (!visto.has(k)) ativos.delete(k);
    mBVB.count = nB * MOD; mBLT.count = nL * MOD;
    mBVB.instanceMatrix.needsUpdate = mBLT.instanceMatrix.needsUpdate = true;
    bondeInfo.n = nB + nL;
  }

  // ---------- rio: máscara de água, corrente, gaivotas e nadadores ----------
  const RX0 = recorte.x0 - 10, RZ0 = recorte.z0 - 10, RP = 8, RNX = Math.ceil((recorte.x1 - recorte.x0 + 20) / RP) + 1, RNZ = Math.ceil((recorte.z1 - recorte.z0 + 20) / RP) + 1;
  const agua = new Uint8Array(RNX * RNZ);
  for (let j = 0; j < RNZ; j++) for (let i = 0; i < RNX; i++) agua[j * RNX + i] = altura(RX0 + i * RP, RZ0 + j * RP) < nivelReno ? 1 : 0;
  const ehAgua = (x, z) => { const i = Math.round((x - RX0) / RP), j = Math.round((z - RZ0) / RP); return i >= 0 && j >= 0 && i < RNX && j < RNZ && agua[j * RNX + i] === 1; };
  const celAgua = []; for (let j = 0; j < RNZ; j++) for (let i = 0; i < RNX; i++) if (agua[j * RNX + i]) celAgua.push([RX0 + i * RP, RZ0 + j * RP]);
  // corrente: eixo principal da água num raio de 70 m, orientado para jusante (do sudeste para o noroeste: −x, −z)
  const FP = 24, FNX = Math.ceil((RNX * RP) / FP), FNZ = Math.ceil((RNZ * RP) / FP), corrente = new Float32Array(FNX * FNZ * 2);
  for (let fj = 0; fj < FNZ; fj++) for (let fi = 0; fi < FNX; fi++) {
    const cx = RX0 + fi * FP, cz = RZ0 + fj * FP; let n = 0, mx = 0, mz = 0, sxx = 0, szz = 0, sxz = 0;
    for (let j = Math.max(0, Math.floor((cz - 70 - RZ0) / RP)); j <= Math.min(RNZ - 1, Math.ceil((cz + 70 - RZ0) / RP)); j++)
      for (let i = Math.max(0, Math.floor((cx - 70 - RX0) / RP)); i <= Math.min(RNX - 1, Math.ceil((cx + 70 - RX0) / RP)); i++)
        if (agua[j * RNX + i]) { const x = RX0 + i * RP, z = RZ0 + j * RP; n++; mx += x; mz += z; sxx += x * x; szz += z * z; sxz += x * z; }
    if (n < 12) continue;
    mx /= n; mz /= n; const a = sxx / n - mx * mx, b = sxz / n - mx * mz, c = szz / n - mz * mz;
    const th = 0.5 * Math.atan2(2 * b, a - c); let dx = Math.cos(th), dz = Math.sin(th);
    if (dx + dz > 0) { dx = -dx; dz = -dz; }
    corrente[(fj * FNX + fi) * 2] = dx; corrente[(fj * FNX + fi) * 2 + 1] = dz;
  }
  const fluxo = (x, z, o) => {
    const fi = lim(Math.round((x - RX0) / FP), 0, FNX - 1), fj = lim(Math.round((z - RZ0) / FP), 0, FNZ - 1);
    o.x = corrente[(fj * FNX + fi) * 2]; o.z = corrente[(fj * FNX + fi) * 2 + 1];
    if (!o.x && !o.z) { o.x = -0.6; o.z = -0.8; }
  };
  // cota do espelho d'água: vem de agua.js (AGUA.nivel), passada por cidade.js
  const nivelAgua = () => nivelRio;
  // gaivotas
  const NAVE = leve ? 10 : 26;
  const geoAve = (() => {
    const P = [], C = [];
    const tri = (a, b, c, cc) => { P.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) C.push(...cc[i]); };
    const br = [0.93, 0.93, 0.9], pt = [0.25, 0.26, 0.28], cz = [0.8, 0.8, 0.78];
    for (const l of [-1, 1]) {
      tri([0, 0, 0.22], [0, 0, -0.18], [l * 0.35, 0, -0.04], [br, br, br]);
      tri([l * 0.35, 0, -0.04], [0, 0, -0.18], [l * 0.78, 0.0, -0.2], [br, br, pt]);
      tri([l * 0.35, 0, -0.04], [0, 0, 0.22], [l * 0.78, 0.0, -0.2], [br, br, pt]);
    }
    tri([0, 0.05, 0.3], [0.05, -0.02, 0.0], [-0.05, -0.02, 0.0], [cz, cz, cz]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.computeVertexNormals();
    g.setAttribute('aFase', new THREE.InstancedBufferAttribute(new Float32Array(NAVE), 1));
    return g;
  })();
  const matAve = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, emissive: 0x8a8a84 });
  matAve.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, UV);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFase; uniform float uVidaT; uniform float uAnima;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed.y += abs(position.x) * sin(uVidaT * 9.0 + aFase) * 0.55 * uAnima;');
  };
  matAve.customProgramCacheKey = () => 'vida-ave';
  const aves = new THREE.InstancedMesh(geoAve, matAve, NAVE); aves.frustumCulled = false; aves.count = 0; aves.name = 'gaivotas';
  grupo.add(aves);
  const ave = Array.from({ length: NAVE }, (_, i) => {
    const c = celAgua[Math.floor(rnd() * celAgua.length)] ?? [0, 0];
    return { cx: c[0], cz: c[1], alvoX: c[0], alvoZ: c[1], raio: 8 + rnd() * 26, w: (rnd() < 0.5 ? -1 : 1) * (0.25 + rnd() * 0.35), ang: rnd() * TAU, h: 16 + rnd() * 26, ph: rnd() * TAU, bando: Math.floor(i / 5) };
  });
  const bandoPos = Array.from({ length: Math.ceil(NAVE / 5) }, () => { const c = celAgua[Math.floor(rnd() * celAgua.length)] ?? [0, 0]; return { x: c[0], z: c[1], tx: c[0], tz: c[1] }; });
  geoAve.attributes.aFase.array.forEach((_, i) => { geoAve.attributes.aFase.array[i] = rnd() * TAU; });
  function gaivotas(dt, n) {
    aves.count = n;
    for (const b of bandoPos) {
      if (Math.hypot(b.tx - b.x, b.tz - b.z) < 20) { const c = celAgua[Math.floor(rnd() * celAgua.length)]; if (c) { b.tx = c[0]; b.tz = c[1]; } }
      const dx = b.tx - b.x, dz = b.tz - b.z, L = Math.hypot(dx, dz) || 1; b.x += (dx / L) * 7 * dt; b.z += (dz / L) * 7 * dt;
    }
    for (let i = 0; i < n; i++) {
      const v = ave[i], b = bandoPos[v.bando];
      v.ang += v.w * dt;
      const x = b.x + Math.cos(v.ang) * v.raio, z = b.z + Math.sin(v.ang) * v.raio, y = nivelAgua() + v.h + Math.sin(S.relogio * 0.7 + v.ph) * 2.2;
      const hx = -Math.sin(v.ang) * Math.sign(v.w) + (b.tx - b.x) * 0.002, hz = Math.cos(v.ang) * Math.sign(v.w) + (b.tz - b.z) * 0.002;
      matriz(aves, i, x, y, z, hx, hz, 1.9, 1.9, 1.9);
    }
    aves.instanceMatrix.needsUpdate = true;
  }
  // nadadores (Wickelfisch laranja ou amarelo, touca de cor)
  // no auge do verão, milhares descem o Reno ao mesmo tempo (o "Rheinschwimmen", da Tinguely à Johanniterbrücke); de resto, poucos
  const NNAD = leve ? 1500 : 8000; // 2026-11-21: num sábado quente de agosto passam milhares ao mesmo tempo
  // cabeça e ombros fora d'água, um braço por cima do Wickelfisch (o saco-boia em forma de peixe, ~0,8 m, que leva a roupa)
  const geoNad = unir([ // poucos lados: 5000 deles, e de longe cada um é um ponto colorido
    { g: mat4(new THREE.SphereGeometry(0.11, 6, 4), 0, 0.1, 0.12), parte: 0 },
    { g: mat4(new THREE.SphereGeometry(0.116, 6, 3, 0, TAU, 0, Math.PI * 0.55), 0, 0.11, 0.115), parte: 4 },
    { g: mat4(new THREE.BoxGeometry(0.42, 0.14, 0.5), 0, -0.01, -0.14), parte: 2 },            // ombros (o maiô)
    { g: mat4(new THREE.ConeGeometry(0.2, 0.26, 6).rotateX(-Math.PI / 2).translate(0, 0, -0.44), 0.38, 0.03, 0), parte: 1 }, // rabo do peixe
    { g: mat4(new THREE.CapsuleGeometry(0.2, 0.55, 2, 6).rotateX(Math.PI / 2), 0.38, 0.03, 0.04), parte: 1 }, // Wickelfisch
    { g: mat4(new THREE.BoxGeometry(0.11, 0.06, 0.42), 0.22, 0.2, 0.1), parte: 0 },            // braço por cima da boia
  ]);
  // longe (> 150 m da câmera) basta a boia e a cabeça, 24 triângulos: a malha detalhada desenha só os de perto, em
  // vagas recopiadas quando muda quem está perto (as cores ficam no índice do nadador, na malha de longe)
  const geoNadLonge = unir([
    { g: mat4(new THREE.BoxGeometry(0.4, 0.3, 0.9), 0.3, 0.03, 0), parte: 1 },
    { g: mat4(new THREE.BoxGeometry(0.22, 0.22, 0.22), 0, 0.1, 0.12), parte: 4 },
  ]);
  const matNad = matGente(0.5);
  const nad = malhaInst(geoNadLonge, matNad, NNAD, false), nadPerto = malhaInst(geoNad, matNad, leve ? 300 : 900, false);
  const PERTO2 = 150 * 150, vaga = new Int32Array(nadPerto.count).fill(-1);
  // Wickelfisch: laranja, amarelo, verde, azul, rosa, vermelho (os da loja têm o peixe estampado em cores fortes)
  const BOIA = ['#ff6a1a', '#ff9a1a', '#ffd21a', '#ff4a4a', '#3fbf4a', '#1f9ad6', '#ff5fa2', '#7ad13b', '#00b3b3'].map(cor), TOUCA = ['#ffffff', '#ff5a5a', '#2f7fff', '#ffd21a', '#222', '#3a2a1e', '#8a5a2a'].map(cor);
  const MAIO = ['#1c2a46', '#d8493f', '#222', '#3d6fb3', '#e2b542', '#4c9a6a', '#c77ab0'].map(cor);
  for (let i = 0; i < NNAD; i++) { poe3(nad.geometry.attributes.aTorso, i, sorteia(BOIA)); poe3(nad.geometry.attributes.aPele, i, sorteia(PELE)); poe3(nad.geometry.attributes.aCabelo, i, sorteia(TOUCA)); poe3(nad.geometry.attributes.aCalca, i, sorteia(MAIO)); nad.geometry.attributes.aAnim.setXY(i, 0, 0); }
  const zonasNado = V.nado.map((p) => p.map(([x, z]) => [x, z]));
  const noNado = (x, z) => zonasNado.some((p) => dentro(x, z, p));
  let nadoForcado = 0; // o tour, quando fala do Reno no verão, põe todo mundo de boia na água
  const nd = Array.from({ length: NNAD }, () => ({ x: 0, z: 0, vida: 0, ph: rnd() * TAU, v: 1 + rnd() * 0.5, esc: 0 }));
  const fl = { x: 0, z: 0 };
  // perto da margem? (terra a até 22 m em alguma das 8 direções): quase todo mundo desce a uns metros da beira, poucos no meio
  const pertoMargem = (x, z) => { for (let k = 0; k < 8; k++) { const a = (k * TAU) / 8; if (!ehAgua(x + Math.cos(a) * 22, z + Math.sin(a) * 22)) return true; } return false; };
  function lancar(s, i) {
    // em turma: metade entra junto de alguém que já está descendo (amigos de 2 a 6, a poucos metros)
    if (rnd() < 0.5) {
      const o = nd[Math.floor(rnd() * Math.max(1, i))];
      if (o && o.vida > 5 && o.esc > 0.5) { const x = o.x + (rnd() - 0.5) * 4, z = o.z + (rnd() - 0.5) * 4; if (ehAgua(x, z)) { s.x = x; s.z = z; s.vida = o.vida; s.v = o.v; return; } }
    }
    for (let t = 0; t < 60; t++) {
      const c = celAgua[Math.floor(rnd() * celAgua.length)]; if (!c) return;
      const x = c[0] + (rnd() - 0.5) * RP, z = c[1] + (rnd() - 0.5) * RP;
      if (noNado(x, z) && ehAgua(x, z) && (t > 40 || rnd() < 0.15 || pertoMargem(x, z))) { s.x = x; s.z = z; s.vida = 40 + rnd() * 160; s.v = 1 + rnd() * 0.5; return; }
    }
    s.vida = 0;
  }
  let quadroNad = 0;
  const nadoQuer = () => {
    const dia = S.diaAno, verao = suave(170, 190, dia) * (1 - suave(300, 320, dia)); // meados de maio a fim de setembro (dia = mês·31 + dia)
    // auge: julho e agosto (dia ~ 217–278), à tarde; fora dele uns poucos por cento. Ao vivo, o calor de agora pesa
    const auge = suave(205, 225, dia) * (1 - suave(270, 290, dia)), tarde = suave(11, 14, hora()) * (1 - suave(19, 21, hora()));
    const temp = window.nuvens?.vivo && window.TEMPO_BASEL ? lim((window.TEMPO_BASEL.temp - 18) / 12, 0.05, 1) : 1;
    const base = verao * suave(8, 11, hora()) * (1 - suave(19, 21.5, hora())) * suave(18, 30, S.alt ?? 40) * (S.dia === 'util' ? 0.85 : 1);
    return base * (0.02 + 0.98 * auge * tarde) * temp;
  };
  function nadadores(dt, quer, cam) {
    const n = Math.round(NNAD * quer);
    let ult = -1, k = 0, mudou = false; quadroNad++;
    const cx = cam ? cam.position.x : 0, cz = cam ? cam.position.z : 0, maxP = vaga.length, aL = nad.geometry.attributes, aP = nadPerto.geometry.attributes;
    for (let i = 0; i < NNAD; i++) {
      const s = nd[i], a = nad.instanceMatrix.array;
      const q = i < n ? 1 : 0;
      s.esc += lim(q - s.esc, -dt / 2, dt / 2);
      if (s.esc <= 0.01) { a.fill(0, i * 16, i * 16 + 16); continue; }
      ult = i;
      // saiu da água ou da zona de nado? confere 1 em 8 quadros por nadador (5000 polígonos por quadro custavam ~1 ms)
      if (s.vida <= 0 || ((i + quadroNad) % 8 === 0 && (!noNado(s.x, s.z) || !ehAgua(s.x, s.z)))) { lancar(s, i); if (s.vida <= 0) continue; }
      fluxo(s.x, s.z, fl);
      s.x += fl.x * (1.1 + s.v * 0.5) * dt; s.z += fl.z * (1.1 + s.v * 0.5) * dt; s.vida -= dt;
      const y = nivelAgua() + 0.02 + Math.sin(S.relogio * 1.6 + s.ph) * 0.03;
      const dx = s.x - cx, dz = s.z - cz;
      if (cam && k < maxP && dx * dx + dz * dz < PERTO2) {
        a.fill(0, i * 16, i * 16 + 16);
        if (vaga[k] !== i) { vaga[k] = i; mudou = true; for (const c of ['aTorso', 'aPele', 'aCabelo', 'aCalca']) aP[c].setXYZ(k, aL[c].getX(i), aL[c].getY(i), aL[c].getZ(i)); }
        matriz(nadPerto, k++, s.x, y, s.z, fl.x, fl.z, s.esc, s.esc, s.esc);
      } else matriz(nad, i, s.x, y, s.z, fl.x, fl.z, s.esc, s.esc, s.esc);
    }
    nad.count = ult + 1; nadPerto.count = k;
    nad.instanceMatrix.needsUpdate = true; nadPerto.instanceMatrix.needsUpdate = true;
    if (mudou) for (const c of ['aTorso', 'aPele', 'aCabelo', 'aCalca']) aP[c].needsUpdate = true;
    return n;
  }

  // ---------- laço ----------
  const info = { pessoas: 0, bicicletas: 0, carros: 0, bondes: 0, gaivotas: 0, nadadores: 0 };
  let ultimo = null, ligado = true, tCtx = 0;
  const alvoCam = controls?.target;
  function atualizar(agora) {
    if (!ligado) return;
    const dt = ultimo == null ? 0.016 : Math.min(0.1, (agora - ultimo) / 1000); ultimo = agora;
    const sd = parado ? 0 : dt;
    S.relogio += sd;
    const seg = (performance.now() / 1000 - T0) - S.ref;
    S.simT = S.base + (parado ? 0 : seg);
    UV.uVidaT.value = S.relogio; UV.uVidaNoite.value = S.noite; matAve.emissiveIntensity = 0.55 * (1 - S.noite);
    if (recolorir) { recolorir = false; pintar(); pintarParados(); donoPed.fill(-1); donoPar.fill(-1); } // cores novas: as vagas de perto recopiam
    const h = hora();
    const fp = perfil(V.contagem.ped.hora[S.dia], h) * (0.55 + 0.45 * V.contagem.ped.mes[S.mes]);
    const fv = perfil(V.contagem.velo.hora[S.dia], h) * (0.45 + 0.55 * V.contagem.velo.mes[S.mes]) * (1 - 0.35 * S.noite);
    const nPed = Math.round(NPED * lim(0.04 + 1.0 * fp, 0, 1));
    const nBici = Math.round(NBIKE * lim(0.03 + 1.1 * fv, 0, 1));
    const fc = lim(0.05 + 0.6 * fv + 0.25 * suave(6, 9, h) * (1 - suave(19, 23, h)), 0, 1) * (S.dia === 'dom' ? 0.55 : 1);
    const nCarro = Math.round(NCARRO * fc);
    ped.atualizar(sd, nPed, alvoCam); bici.atualizar(sd, nBici, alvoCam); carro.atualizar(sd, nCarro, alvoCam);
    caes?.(S.relogio);
    separarPerto(ped.im, pedPerto, donoPed, R_PERTO);
    parados(agora, fp, h);
    caidosParados(sd);
    if (imPar) { imPar.instanceMatrix.array.set(parSalvo); separarPerto(imPar, imParPerto, donoPar, R_PERTO); }
    bondes(sd);
    const nAve = Math.round(NAVE * suave(-4, 8, S.alt ?? 40) * (S.noite > 0.9 ? 0 : 1));
    gaivotas(sd, nAve);
    const nNad = nadadores(sd, Math.max(nadoQuer(), nadoForcado), camera);
    info.pessoas = Math.round(nPed); info.bicicletas = nBici; info.carros = nCarro; info.bondes = bondeInfo.n; info.gaivotas = nAve; info.nadadores = nNad;
    // contexto para o som ambiente (a cada ~0,4 s)
    if (agora - tCtx > 400) {
      tCtx = agora;
      let na = 0, nt = 0;
      // o som segue a câmera: a água é medida num raio que cresce com a distância (de perto, só o rio que está ali) e `alto`
      // (0 rente ao chão, 1 lá de cima) troca a cidade e a gente pelo vento do céu
      const dCam = alvoCam && camera ? camera.position.distanceTo(alvoCam) : 300, R = lim(dCam * 0.35, 20, 160), pas = R / 5;
      const alto = lim((Math.max(dCam, camera ? camera.position.y - altura(camera.position.x, camera.position.z) : 0) - 60) / 640, 0, 1);
      if (alvoCam) for (let dz = -R; dz <= R + 0.1; dz += pas) for (let dx = -R; dx <= R + 0.1; dx += pas) { nt++; if (ehAgua(alvoCam.x + dx, alvoCam.z + dz)) na++; }
      window.ambiente?.contexto({ agua: nt ? na / nt : 0, alto, gente: lim(ped.perto() / 45, 0, 1) * lim(nPed / NPED * 2, 0, 1), bonde: bondeInfo.perto, bondeVel: bondeInfo.vel, gaivotas: nAve / NAVE, nadadores: nNad,
        noite: S.noite, dia: S.dia01, carros: carro.perto(), hora: h, simT: S.simT });
    }
  }
  function ligar(on) { ligado = on; grupo.visible = on; if (on) ultimo = null; if (!on) window.ambiente?.contexto?.({ agua: 0, gente: 0, bonde: 1e9, bondeVel: 0, gaivotas: 0, nadadores: 0, noite: S.noite, dia: S.dia01, carros: 0, hora: hora(), simT: S.simT }); }
  // colisão para o jogo: um disco de raio r em (x, z) bate num bonde (caixa de LM × 2,4 m) ou num carro (disco de 2,2 m)?
  function bate(x, z, r) {
    if (!ligado) return null;
    for (const [mx, mz, ux, uz] of modulos) {
      const dx = x - mx, dz = z - mz, a = dx * ux + dz * uz, b = -dx * uz + dz * ux;
      if (Math.abs(a) < LM / 2 + r && Math.abs(b) < 1.2 + r) return 'bonde';
    }
    for (let i = 0; i < carro.n; i++) if (carro.esc[i] > 0.5 && Math.hypot(x - carro.x[i], z - carro.z[i]) < 2.2 + r) return 'carro';
    return null;
  }
  // a e-bike do jogo e quem anda na vista de rua derrubam gente: quem anda, os ciclistas e quem está parado (os sentados ficam)
  const atropela = (x, z, r, fx, fz) => (ligado ? ped.derruba(x, z, r, fx, fz) + bici.derruba(x, z, r + 0.3, fx, fz) + derrubaParados(x, z, r, fx, fz) : 0);
  const api = { grupo, atualizar, ligar, info, S, bate, linhasCores: (on) => { linhasCor.g.visible = on; }, coresLinhas: () => linhasCor.nums.map((l) => [l, COR_LINHA[l] ?? '#888']), fluxo: (x, z) => { const o = { x: 0, z: 0 }; fluxo(x, z, o); return o; }, forcarNado: (v) => { nadoForcado = v ? 1 : 0; }, bondePerto: () => (ligado ? bondeInfo.perto : 1e9), atropela, perfil: () => ({ ped: V.contagem.ped, velo: V.contagem.velo }), padroes: () => trilhos.map((t) => ({ l: t.p.l, e: t.p.e, cab: t.p.cab, total: t.total })), ehAgua, nadadores: () => nd.filter((s) => s.esc > 0.5).map((s) => [s.x, s.z]), gaivotas: () => ave.map((v) => { const b = bandoPos[v.bando]; return [b.x + Math.cos(v.ang) * v.raio, b.z + Math.sin(v.ang) * v.raio]; }) };
  window.vida = api;
  return api;
}
