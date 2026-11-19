// Basel em 3D: prédios do swissBUILDINGS3D com o ano do GWR, relevo swissALTI3D, Reno, ruas e
// bondes do OSM; máquina do tempo no shader (cada prédio sobe no ano de construção), cor por época,
// noite com janelas acesas e ficha do prédio ao clicar. Dados gerados por script/predios.py.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { iniciarCeu } from './ceu.js';
import { criaOrtofoto } from './ortofoto.js';
import { criarFachadas } from './fachadas.js';
import { criarMarcos, MITTLERE } from './marcos.js';
import { criaAgua } from './agua.js';
import { criarArvores } from './arvores.js';
import { criarChao, cotaPonta } from './chao.js';
import { criarDetalhes } from './detalhes.js';
import { decodifica, baixaBin } from './compacta.js';
import { atualizarNuvens, TEMPO } from './nuvens.js';
import { injetarNeve, atualizarNeve } from './neve.js';
import { criarRoche } from './roche.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);

const carga = window.carga;
carga?.etapa(0.03, t('baixando os dados…', 'downloading the data…', 'Daten werden geladen…'));
const binTerreno = baixaBin('data/terreno.v2.bin'); // em paralelo com os prédios: a barra da abertura conta os dois
const [meta, ruas, bin, rel] = await Promise.all([
  fetch('data/predios.json').then((r) => r.json()),
  fetch('data/ruas.json').then((r) => r.json()),
  baixaBin('data/predios.v2.bin'),
  fetch('data/relevo.bin').then((r) => r.arrayBuffer()),
]);
const P = meta.predios;
// recorte em coordenadas locais (predios.json): desde 2026-11-19 vai da Allschwilerplatz (oeste) à SBB (sul)
const REC = (() => { const [e0, n0, e1, n1] = meta.recorte_lv95, [oe, on] = meta.origem_lv95; return { x0: e0 - oe, x1: e1 - oe, z0: -(n1 - on), z1: -(n0 - on) }; })();
const foraREC = (x, z, f = 0) => x < REC.x0 + f || x > REC.x1 - f || z < REC.z0 + f || z > REC.z1 - f;
const NIVEL_RENO = 2.3; // m acima de BASE_Z (244 m): abaixo disso o relevo é água

// ---------- cena ----------
const canvas = $('cena');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const cena = new THREE.Scene();
const COR = {
  papel: new THREE.Color('#efe6d2'), ceuNoite: new THREE.Color('#151a2a'),
};
cena.background = COR.papel.clone();
cena.fog = new THREE.Fog(COR.papel.clone(), 900, 2600);

const camera = new THREE.PerspectiveCamera(42, 1, 1, 6000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = THREE.MathUtils.degToRad(86);
controls.minDistance = 25;
controls.maxDistance = 2600;
controls.screenSpacePanning = false;
const orto = criaOrtofoto(THREE, renderer, controls); // foto aérea no chão e nos telhados (docs/ortofoto.js)

const hemi = new THREE.HemisphereLight(0xfff6e4, 0xb9a785, 1.7);
cena.add(hemi);
const sol = new THREE.DirectionalLight(0xfff0d6, 2.4);
sol.position.set(-420, 520, 300);
sol.castShadow = true;
sol.shadow.mapSize.set(4096, 4096);
// modo leve (sem CSM): a sombra segue o alvo da câmera (quadro()); cobrir o recorte inteiro de 2,3 km deixava cada texel
// com 0,7 m e a parede se sombreava sozinha em pontinhos e listras (acne)
Object.assign(sol.shadow.camera, { left: -600, right: 600, top: 600, bottom: -600, near: 10, far: 2000 });
sol.shadow.bias = -0.0004;
sol.shadow.normalBias = 0.6;
cena.add(sol, sol.target);

// ---------- relevo e Reno ----------
const R = meta.relevo;
const alturas = new Uint16Array(rel);
let CH;
const altura = (x, z) => (CH ? CH.altura(x, z) : altura0(x, z));
const altura0 = (x, z) => {
  const fx = (x - R.x0) / R.passo, fz = (z - R.z0) / R.passo;
  const i = Math.max(0, Math.min(R.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(R.ny - 2, Math.floor(fz)));
  const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j));
  const h = (a, b) => alturas[b * R.nx + a] / 100;
  return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
};
carga?.etapa(0.7, t('o Reno…', 'the Rhine…', 'der Rhein…'));
const AGUA = await criaAgua({ THREE, cena, renderer, camera, meta, altura, ruas, q });
{
  const larg = (R.nx - 1) * R.passo, prof = (R.ny - 1) * R.passo;
  // relevo fino e ruas como áreas: docs/chao.js (tarefa 15); o relevo de 5 m (relevo.bin) fica só como reserva
  CH = await criarChao(THREE, { meta, ruas, orto, nivelReno: NIVEL_RENO, ajuste: AGUA.relevo, binTerreno }); // ajuste: leito e margem do Reno (agua.js)
  cena.add(CH.malha);
}

// ---------- ruas, bondes e muralha (faixas sobre o relevo) ----------
const LARGURA = { secondary: 8, secondary_link: 6, tertiary: 7, unclassified: 6, residential: 6, living_street: 5, pedestrian: 6,
  service: 3.5, footway: 2, path: 1.6, steps: 2, cycleway: 2, construction: 4, tram: 1.1 };
const ruasObj = new THREE.Group();
{
  const pos = [], cor = [];
  // pista de asfalto e calçada de lajes de granito (eram faixas creme, cor de papel, que denunciavam a ponte)
  const cRua = new THREE.Color('#57534e'), cPe = new THREE.Color('#9a948a'), cBonde = new THREE.Color('#2f6b3f');
  const faixa = (c, larg, cc, eleva, ponte) => {
    // subdivide a cada 4 m para seguir o relevo; ponte: reta entre as cotas das pontas
    const pts = [];
    for (let i = 0; i < c.length - 2; i += 2) {
      const [x0, z0, x1, z1] = [c[i], c[i + 1], c[i + 2], c[i + 3]];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 4));
      for (let k = 0; k < n; k++) pts.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]);
    }
    pts.push([c[c.length - 2], c[c.length - 1]]);
    const hA = cotaPonta(altura, ...pts[0], ...pts[1]), hB = cotaPonta(altura, ...pts.at(-1), ...pts.at(-2));
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
      const nx = (-dz / L) * larg / 2, nz = (dx / L) * larg / 2;
      const ya = ponte ? hA + (hB - hA) * (i / (pts.length - 1)) + 0.6 : altura(ax, az) + eleva;
      const yb = ponte ? hA + (hB - hA) * ((i + 1) / (pts.length - 1)) + 0.6 : altura(bx, bz) + eleva;
      pos.push(ax + nx, ya, az + nz, ax - nx, ya, az - nz, bx + nx, yb, bz + nz,
        ax - nx, ya, az - nz, bx - nx, yb, bz - nz, bx + nx, yb, bz + nz);
      for (let k = 0; k < 6; k++) cor.push(cc.r, cc.g, cc.b);
    }
  };
  for (const l of ruas.linhas) {
    const larg = LARGURA[l.t];
    if (!larg || !l.ponte || l.t === 'tram') continue; // chão e bonde: chao.js; aqui só as pontes
    const pe = ['footway', 'path', 'steps', 'cycleway', 'pedestrian', 'living_street'].includes(l.t);
    faixa(l.c, larg, l.t === 'tram' ? cBonde : pe ? cPe : cRua, l.t === 'tram' ? 0.45 : pe ? 0.25 : 0.3, !!l.ponte);
  }
  // tabuleiro das outras pontes (a Mittlere tem o de pedra em marcos.js): no OSM cada pista e calçada é uma linha à
  // parte, e entre as faixas via-se o rio (a Wettsteinbrücke tem duas pistas separadas). Junta as linhas de ponte
  // próximas e põe por baixo uma laje de concreto que cobre de uma borda à outra, com 1,2 m de espessura.
  {
    const lin = ruas.linhas.filter((l) => l.ponte && l.c.length >= 4 && Math.hypot(l.c.at(-2) - l.c[0], l.c.at(-1) - l.c[1]) > 30);
    const grupos = [];
    for (const l of lin) {
      const mx = (l.c[0] + l.c.at(-2)) / 2, mz = (l.c[1] + l.c.at(-1)) / 2;
      let g = grupos.find((G) => Math.hypot(G.mx - mx, G.mz - mz) < 40);
      if (!g) grupos.push((g = { mx, mz, ls: [] }));
      g.ls.push(l);
    }
    const cConc = new THREE.Color('#8b877e');
    for (const G of grupos) {
      if (G.ls.some((l) => l.n === 'Mittlere Rheinbrücke')) continue;
      const ref = G.ls.reduce((a, b) => (Math.hypot(b.c.at(-2) - b.c[0], b.c.at(-1) - b.c[1]) > Math.hypot(a.c.at(-2) - a.c[0], a.c.at(-1) - a.c[1]) ? b : a));
      const ax = ref.c[0], az = ref.c[1], dx = ref.c.at(-2) - ax, dz = ref.c.at(-1) - az, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
      let b0 = Infinity, b1 = -Infinity, s0 = Infinity, s1 = -Infinity;
      for (const l of G.ls) {
        const meia = (LARGURA[l.t] || 2) / 2;
        for (let i = 0; i < l.c.length; i += 2) {
          const px = l.c[i] - ax, pz = l.c[i + 1] - az, s = px * ux + pz * uz, b = px * nx + pz * nz;
          b0 = Math.min(b0, b - meia); b1 = Math.max(b1, b + meia); s0 = Math.min(s0, s); s1 = Math.max(s1, s);
        }
      }
      b0 -= 0.8; b1 += 0.8;
      const hA = cotaPonta(altura, ax, az, ax + ux * 4, az + uz * 4), hB = cotaPonta(altura, ax + dx, az + dz, ax + dx - ux * 4, az + dz - uz * 4);
      const yTop = (s) => hA + (hB - hA) * (s / L) + 0.55; // 5 cm sob as faixas (0,6 m)
      const P = (s, b, y) => [ax + ux * s + nx * b, y, az + uz * s + nz * b];
      const quad = (a, b, c, d) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); for (let k = 0; k < 6; k++) cor.push(cConc.r, cConc.g, cConc.b); };
      const n = Math.max(1, Math.ceil((s1 - s0) / 8));
      for (let i = 0; i < n; i++) {
        const sa = s0 + ((s1 - s0) * i) / n, sb = s0 + ((s1 - s0) * (i + 1)) / n, ya = yTop(sa), yb = yTop(sb);
        quad(P(sa, b0, ya), P(sa, b1, ya), P(sb, b1, yb), P(sb, b0, yb));                         // topo
        quad(P(sa, b0, ya - 1.2), P(sb, b0, yb - 1.2), P(sb, b1, yb - 1.2), P(sa, b1, ya - 1.2)); // fundo
        quad(P(sa, b0, ya), P(sb, b0, yb), P(sb, b0, yb - 1.2), P(sa, b0, ya - 1.2));             // lados
        quad(P(sa, b1, ya), P(sa, b1, ya - 1.2), P(sb, b1, yb - 1.2), P(sb, b1, yb));
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.receiveShadow = true;
  ruasObj.add(m);
  // muralha (OSM historic=citywalls): faixa vertical de 5 m
  const mp = [];
  for (const c of ruas.muralha) for (let i = 0; i < c.length - 2; i += 2) {
    const [ax, az, bx, bz] = [c[i], c[i + 1], c[i + 2], c[i + 3]];
    if (foraREC(ax, az, -10)) continue;
    const ya = altura(ax, az), yb = altura(bx, bz);
    mp.push(ax, ya, az, bx, yb, bz, bx, yb + 5, bz, ax, ya, az, bx, yb + 5, bz, ax, ya + 5, az);
  }
  if (mp.length) {
    const gm = new THREE.BufferGeometry(); gm.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3)); gm.computeVertexNormals();
    const mm = new THREE.Mesh(gm, new THREE.MeshLambertMaterial({ color: 0x8a3b2a, side: THREE.DoubleSide }));
    mm.castShadow = true; ruasObj.add(mm);
  }
  ruasObj.add(CH.grupo);
  cena.add(ruasObj);
}

// ---------- prédios ----------
carga?.etapa(0.76, t('os prédios…', 'the buildings…', 'die Häuser…'));
const nVert = meta.n_tris * 3;
// predios.v2.bin (script/compacta.py): vértices únicos + índice; aqui volta à sopa de triângulos de sempre
const q16 = new Int16Array(nVert * 3), ids16 = new Uint16Array(nVert);
{
  const { cols: [cx, cy, cz, cid], idx } = decodifica(bin, 4, 2);
  // giro dos triângulos: o swissBUILDINGS3D chega com quase todo sólido do avesso (1.889 de 1.892: volume assinado
  // negativo, porque z = −norte espelha o LV95). Com FrontSide o three cortava as faces de fora: o telhado (visto de
  // cima) sumia e só se viam as paredes de dentro do lado oposto, "de papel". Aqui cada sólido do avesso é desvirado.
  const vol = new Float64Array(P.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    vol[cid[a]] += cx[a] * (cy[b] * cz[c] - cz[b] * cy[c]) - cy[a] * (cx[b] * cz[c] - cz[b] * cx[c]) + cz[a] * (cx[b] * cy[c] - cy[b] * cx[c]);
  }
  for (let v = 0; v < nVert; v++) {
    const r = v % 3, k0 = idx[v - r];
    const k = vol[cid[k0]] < 0 && r ? idx[v - r + 3 - r] : idx[v]; // do avesso: troca o 2º e o 3º vértice
    q16[v * 3] = cx[k]; q16[v * 3 + 1] = cy[k]; q16[v * 3 + 2] = cz[k]; ids16[v] = cid[k];
  }
}
const posicoes = new Float32Array(nVert * 3);
for (let i = 0; i < q16.length; i++) posicoes[i] = q16[i] / meta.escala;
for (let v = 0; v < nVert; v++) { const dz = P[ids16[v]].dz; if (dz) posicoes[v * 3 + 1] -= dz; } // base flutuando sobre o relevo fino (chao.py)
const aPid = new Float32Array(nVert);
for (let v = 0; v < nVert; v++) aPid[v] = ids16[v];
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(posicoes, 3));
geo.setAttribute('pid', new THREE.BufferAttribute(aPid, 1));
const cores = new Float32Array(nVert * 3);
geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
geo.computeBoundingSphere();

// telhado ou parede, pela normal de cada triângulo (para colorir sem depender do shader)
const ehTelhado = new Uint8Array(meta.n_tris);
{
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < meta.n_tris; t++) {
    a.fromArray(posicoes, t * 9); b.fromArray(posicoes, t * 9 + 3); c.fromArray(posicoes, t * 9 + 6);
    const n = b.sub(a).cross(c.sub(a)).normalize();
    ehTelhado[t] = Math.abs(n.y) > 0.35 ? 1 : 0;
  }
}

const hash = (i) => { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
function colorir() {
  // reboco de Basel: ocres, rosados, cinzas e areias, alguns tons mais fortes; a paleta antiga era quase toda branca
  // (#f6efe0, #faf4e8…) e, com o sol do ACES, as fachadas viravam papel branco
  const parede = ['#e6d6b8', '#dcc59c', '#e8dccb', '#d7c7a6', '#d2c8b6', '#e2c7a2', '#d9b9a6', '#c9ccbb', '#d8b07e', '#c99f93', '#b9c1b2', '#ece3d2'].map((c) => new THREE.Color(c));
  const telhas = ['#9c4f35', '#8e4a33', '#a85d3d', '#7f4636', '#6e5a4e'].map((c) => new THREE.Color(c));
  const c = new THREE.Color();
  for (let t = 0; t < meta.n_tris; t++) {
    const id = ids16[t * 3], h = hash(id), p = P[id];
    // telhados planos (modernos) ficam cinza; inclinados, de telha
    c.copy(ehTelhado[t] ? telhas[Math.floor(h * telhas.length)] : parede[Math.floor(h * parede.length)]);
    if (ehTelhado[t] && (p.ano ?? 0) > 1945) c.set('#8c8578');
    for (let k = 0; k < 3; k++) c.toArray(cores, (t * 3 + k) * 3);
  }
  geo.attributes.color.needsUpdate = true;
}
colorir();

// destaque do prédio da ficha e noite, no shader (a cidade é a de hoje: sem máquina do tempo)
const U = { uSel: { value: -1 }, uNoite: { value: 0 } };
const FACH = criarFachadas({ cena, meta, posicoes, ids16, U });
geo.setAttribute('fa', FACH.atributos.fa);
geo.setAttribute('fb', FACH.atributos.fb);
const VERT_DECL = `
attribute float pid;
uniform float uSel;
varying float vEstado; varying float vSel; varying vec3 vMundo; varying float vPid;`;
const VERT_CORPO = `
  vec3 transformed = vec3(position);
  vEstado = 0.0; // (era o estado na máquina do tempo; fica 0 para os shaders encadeados que ainda o leem)
  vSel = abs(pid - uSel) < 0.5 ? 1.0 : 0.0;
  vPid = pid;
  vMundo = (modelMatrix * vec4(transformed, 1.0)).xyz;`;
function injetar(shader, cheio) {
  Object.assign(shader.uniforms, U);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
    .replace('#include <begin_vertex>', VERT_CORPO);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying float vEstado; varying float vSel; varying vec3 vMundo; varying float vPid; uniform float uNoite;`)

  if (!cheio) return;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <color_fragment>', `#include <color_fragment>
  if (vSel > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.70, 0.15, 0.12), 0.65);`)
    // (as janelas acesas da noite são de fachadas.js, na grade real de cada fachada; a grade antiga de 2,7 x 3,2 m, calculada
    // pixel a pixel, voltou por engano em 2026-11-19 e salpicava as paredes de pontos claros: removida)
}
const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
material.onBeforeCompile = (s) => { injetar(s, true); FACH.injetar(s); };
// a ortofoto encadeia depois das fachadas: a foto entra logo após <color_fragment> e vira a base da telha
orto.telhados(material);
const predios = new THREE.Mesh(geo, material);
predios.castShadow = predios.receiveShadow = true;
predios.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
predios.customDepthMaterial.onBeforeCompile = (s) => injetar(s, false);
predios.frustumCulled = false;
cena.add(predios);
// luz e céu (sol real, CSM, GTAO, bloom): ver ceu.js. Modo leve: ?leve=1, ou automático em celular
const leve = q.get('leve') === '1' || (q.get('leve') !== '0' && (matchMedia('(pointer:coarse)').matches || innerWidth < 700 || (navigator.deviceMemory || 8) <= 4));
let arvores; // árvores (arvores.js): o G-buffer do GTAO precisa do recorte de folhas delas
carga?.etapa(0.82, t('o céu e a luz…', 'sky and light…', 'Himmel und Licht…'));
const ceu = await iniciarCeu({ cena, renderer, camera, hemi, sol, U, leve, patchNormal: (s) => { const f = s.fragmentShader; injetar(s, false); s.fragmentShader = f; arvores?.patchNormal(s); } });
arvores = q.get('arvores') === '0' ? null : await criarArvores({ THREE, cena, camera, altura, dentro: CH.dentro, ceu }); // cadastro de árvores e gramados (tarefa 16)
// marcos em alta definição (docs/marcos.js): substituem o sólido LOD2 pelo mesmo EGID
carga?.etapa(0.88, t('o Münster, o Rathaus e as pontes…', 'the Münster, the Rathaus and the bridges…', 'Münster, Rathaus und Brücken…'));
const MARC = criarMarcos({ renderer, cena, meta, posicoes, ids16, altura, nivelReno: NIVEL_RENO, U });
MARC.esconde(geo);

AGUA.iniciar({ leve }); // superfície do Reno, depois do céu (usa o sol e a névoa dele)
// detalhes de rua (tarefa 17): fontes, postes, bancos, toldos, bandeiras, balsas e navios; antes do 1º render, para a sombra em cascata pegar
carga?.etapa(0.92, t('fontes, postes e bancos…', 'fountains, lamps and benches…', 'Brunnen, Laternen und Bänke…'));
if (q.get('detalhes') !== '0') await criarDetalhes({ THREE, cena, renderer, U, altura, ceu, P, leve, nivelAgua: () => AGUA.nivel, cotaPonte: MARC.cotaPonte });

// relógio e estação no painel: a hora de Basel (ceu.js segue o relógio real até alguém mexer)
const ESTACAO = { inverno: ['inverno', 'winter', 'Winter'], primavera: ['primavera', 'spring', 'Frühling'], verao: ['verão', 'summer', 'Sommer'], outono: ['outono', 'autumn', 'Herbst'] };
const estacaoDe = (data) => { const [, m, d] = data.split('-').map(Number), x = m * 100 + d; return x < 320 || x >= 1221 ? 'inverno' : x < 621 ? 'primavera' : x < 923 ? 'verao' : x < 1221 ? 'outono' : 'inverno'; };
function relogio(e) {
  $('relogio').textContent = `${String(Math.floor(e.hora)).padStart(2, '0')}:${String(Math.floor((e.hora % 1) * 60)).padStart(2, '0')}`;
  const tempo = ceu.aoVivo && TEMPO.ok ? ` · ${Math.round(TEMPO.temp)} °C` : '';
  $('estacao').textContent = `${t(...ESTACAO[estacaoDe(e.data)])}${ceu.aoVivo ? t(' · agora', ' · live', ' · live') : ''}${tempo}`;
}
addEventListener('tempo:agora', () => relogio(ceu.estado()));
// ---------- chaves ----------
$('c-ruas').addEventListener('change', (e) => { ruasObj.visible = e.target.checked; CH.ruas(e.target.checked); });
let noiteAlvo = 0;
function definirNoite(on) { noiteAlvo = on ? 1 : 0; ceu.noite(on); $('c-noite').checked = on; document.body.classList.toggle('noite', on); }
$('c-noite').addEventListener('change', (e) => definirNoite(e.target.checked));

// ---------- ficha do prédio ----------
// uso do prédio: classes do GWR (em alemão no registro) → [pt, en, de]
const USO = {
  'Gebäude mit drei oder mehr Wohnungen': ['moradia (3 ou mais apartamentos)', 'housing (3 or more flats)'],
  'Gebäude mit einer Wohnung': ['moradia (1 apartamento)', 'housing (1 flat)'],
  'Gebäude mit zwei  Wohnungen': ['moradia (2 apartamentos)', 'housing (2 flats)'],
  'Bürogebäude': ['escritórios', 'offices'], 'Kirchen und sonstige Kultgebäude': ['igreja ou culto', 'church or place of worship'],
  'Museen und Bibliotheken': ['museu ou biblioteca', 'museum or library'],
  'Schul- und Hochschulgebäude, Forschungseinrichtungen': ['escola, universidade ou pesquisa', 'school, university or research'],
  'Gross-und Einzelhandelsgebäude': ['comércio', 'retail'], 'Hotelgebäude': ['hotel', 'hotel'],
  'Restaurants und Bars in Gebäuden ohne Wohnnutzung': ['restaurante ou bar', 'restaurant or bar'],
  'Garagengebäude': ['garagem', 'garage'], 'Gebäude für Kultur- und Freizeitzwecke': ['cultura e lazer', 'culture and leisure'],
  'Industriegebäude': ['indústria', 'industry'], 'Krankenhäuser und Facheinrichtungen des Gesundheitswesens': ['hospital ou saúde', 'hospital or health care'],
  'Wohngebäude mit Nebennutzung': ['moradia com outro uso', 'housing with other use'],
  'Sonstige Hochbauten, anderweitig nicht genannt': ['outro', 'other'],
  'Gebäude des Verkehrs- und Nachrichtenwesens ohne Garagen': ['transporte ou comunicação', 'transport or communications'],
  'Andere Gebäude für die kurzfristige Beherbergung': ['hospedagem', 'short-stay lodging'],
};
const uso = (cls) => (USO[cls] ? t(USO[cls][0], USO[cls][1], cls) : cls);
const PERIODO = (s) => (LANG === 'de' ? s?.replace('Periode ', '')
  : LANG === 'en' ? s?.replace('Periode vor', 'before').replace('Periode nach', 'after').replace('Periode von', 'from').replace(' bis ', ' to ')
  : s?.replace('Periode vor', 'antes de').replace('Periode nach', 'depois de').replace('Periode von', 'de').replace(' bis ', ' a '));
function abrirFicha(id) {
  const p = P[id];
  U.uSel.value = id;
  $('f-nome').textContent = p.nome || (p.cls ? uso(p.cls).replace(/^\w/, (c) => c.toUpperCase()) : t('Prédio sem registro', 'Unregistered building', 'Gebäude ohne Eintrag'));
  $('f-end').textContent = p.end || t('endereço não registrado', 'no address on record', 'keine Adresse erfasst');
  const linhas = [];
  if (p.ano) linhas.push([t('Ano', 'Year', 'Baujahr'), p.f === 'gbauj' ? `${p.ano}` : t(`por volta de ${p.ano} (estimado)`, `around ${p.ano} (estimated)`, `um ${p.ano} (geschätzt)`)]);
  else linhas.push([t('Ano', 'Year', 'Baujahr'), t('não registrado', 'not on record', 'nicht erfasst')]);
  if (p.per) linhas.push([t('Época (GWR)', 'Period (GWR)', 'Bauperiode (GWR)'), PERIODO(p.per)]);
  if (p.and) linhas.push([t('Andares', 'Floors', 'Geschosse'), p.and]);
  if (p.apt) linhas.push([t('Apartamentos', 'Flats', 'Wohnungen'), p.apt]);
  if (p.alt) linhas.push([t('Altura', 'Height', 'Höhe'), `${fmt(p.alt)} m`]);
  if (p.cls) linhas.push([t('Uso', 'Use', 'Nutzung'), uso(p.cls)]);
  if (p.prot) linhas.push([t('Proteção', 'Protection', 'Schutz'), t('patrimônio protegido', 'listed heritage', 'geschützt')]);
  if (p.egid) linhas.push(['EGID', `<a href="https://map.geo.admin.ch/?lang=${LANG}&layers=ch.bfs.gebaeude_wohnungs_register&swisssearch=${p.egid}" target="_blank" rel="noopener">${p.egid}</a>`]);
  $('f-dl').innerHTML = linhas.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
  $('ficha').hidden = false;
}
function fecharFicha() { $('ficha').hidden = true; U.uSel.value = -1; }
$('ficha').querySelector('.x').addEventListener('click', fecharFicha);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !(typeof window.tour?.ativo === "function" && window.tour.ativo())) fecharFicha(); });

const raio = new THREE.Raycaster();
let apertou = null;
canvas.addEventListener('pointerdown', (e) => { apertou = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!apertou || Math.hypot(e.clientX - apertou[0], e.clientY - apertou[1]) > 5 || (typeof window.tour?.ativo === "function" && window.tour.ativo()) || window.jogo?.ativo()) return;
  const r = canvas.getBoundingClientRect();
  raio.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const hits = raio.intersectObject(predios, false);
  const hit = hits[0];
  const hm = MARC.acerta(raio);
  if (hm && (!hit || hm.distance < hit.distance)) abrirFicha(hm.pid);
  else if (hit) abrirFicha(ids16[hit.face.a]); else fecharFicha();
});

// ---------- vista de rua: clique duplo no chão desce a câmera à altura dos olhos ali ----------
// Arrastar olha em volta (a órbita fica a 30 cm à frente do olho), um novo clique duplo anda até o ponto, a roda para trás
// ou Esc voltam para o alto. Clique duplo num prédio desce na rua em frente à fachada clicada.
const RUA = { on: false, salvo: null, anim: 0 };
const chipRua = document.createElement('div');
chipRua.id = 'rua-chip'; chipRua.hidden = true;
chipRua.textContent = t('Vista de rua · W/S ou ↑/↓ anda, A/D ou ←/→ vira, Shift corre · arraste para olhar · clique duplo salta · roda ou Esc sai', 'Street view · W/S or ↑/↓ walk, A/D or ←/→ turn, Shift runs · drag to look · double-click jumps · scroll or Esc to leave', 'Strassenansicht · W/S oder ↑/↓ gehen, A/D oder ←/→ drehen, Shift rennt · ziehen zum Umschauen · Doppelklick springt · Mausrad oder Esc beendet');
Object.assign(chipRua.style, { position: 'fixed', left: '50%', bottom: '18px', transform: 'translateX(-50%)', zIndex: 30, background: 'rgba(20,18,24,.75)', color: '#f6efe0', font: '600 13px system-ui, sans-serif', padding: '8px 14px', borderRadius: '999px', pointerEvents: 'none', maxWidth: 'calc(100% - 32px)', textAlign: 'center' });
document.body.appendChild(chipRua);
function voarPara(posFim, alvoFim, ms = 900) {
  cancelAnimationFrame(RUA.anim);
  const p0 = camera.position.clone(), a0 = controls.target.clone(), t0 = performance.now();
  const passo = (agora) => {
    const k = Math.min(1, (agora - t0) / ms), e = k * k * (3 - 2 * k);
    camera.position.lerpVectors(p0, posFim, e); controls.target.lerpVectors(a0, alvoFim, e);
    camera.lookAt(controls.target);
    if (k < 1) RUA.anim = requestAnimationFrame(passo);
  };
  RUA.anim = requestAnimationFrame(passo);
}
function entrarRua(x, z) {
  if (!RUA.on) {
    RUA.salvo = { minDistance: controls.minDistance, maxPolarAngle: controls.maxPolarAngle, minPolarAngle: controls.minPolarAngle, enablePan: controls.enablePan, enableZoom: controls.enableZoom, rotateSpeed: controls.rotateSpeed };
    Object.assign(controls, { minDistance: 0.05, maxPolarAngle: THREE.MathUtils.degToRad(170), minPolarAngle: THREE.MathUtils.degToRad(10), enablePan: false, enableZoom: false, rotateSpeed: -0.35 });
    RUA.on = true; chipRua.hidden = false; fecharFicha(); window.jogo?.livreRua(0, 0); velRua = 0;
    camera.near = 0.25; camera.updateProjectionMatrix(); // perto das fachadas: o corte de 1 m mostrava o lado de dentro
  }
  // olha na direção em que a câmera já olhava, na horizontal
  const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; if (f.lengthSq() < 1e-6) f.set(0, 0, -1); f.normalize();
  const y = altura(x, z) + 1.7, olho = new THREE.Vector3(x, y, z);
  voarPara(olho, olho.clone().addScaledVector(f, 0.3));
}
function sairRua(voo = true) {
  if (!RUA.on) return;
  RUA.on = false; chipRua.hidden = true;
  camera.near = 1; camera.updateProjectionMatrix();
  const salvo = RUA.salvo;
  if (!voo) { cancelAnimationFrame(RUA.anim); Object.assign(controls, salvo); return; } // o jogo assume a câmera daqui
  setTimeout(() => { if (!RUA.on) Object.assign(controls, salvo); }, 1150); // depois do voo: com minDistance de 25 m já valendo, a câmera saltava
  const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
  const alvo = camera.position.clone(); alvo.y -= 1.7;
  voarPara(alvo.clone().addScaledVector(f, -90).add(new THREE.Vector3(0, 80, 0)), alvo, 1100);
}
canvas.addEventListener('dblclick', (e) => {
  if ((typeof window.tour?.ativo === 'function' && window.tour.ativo()) || window.jogo?.ativo()) return;
  const r = canvas.getBoundingClientRect();
  raio.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const chao = raio.intersectObject(CH.malha, false)[0], pr = raio.intersectObject(predios, false)[0];
  let p = chao?.point;
  // prédio na frente do chão: desce na rua diante da fachada clicada
  if (pr && (!chao || pr.distance < chao.distance)) p = pr.point.clone();
  if (!p || foraREC(p.x, p.z, 2)) return;
  // fora de qualquer prédio: recua na horizontal, para o lado de quem olha, até achar a rua (grade de jogo.js, 1 m)
  const livre = window.jogo?.livreRua;
  if (livre && !livre(p.x, p.z)) {
    const v = new THREE.Vector2(camera.position.x - p.x, camera.position.z - p.z).normalize();
    let d0 = 0;
    for (let d = 1; d <= 40 && !d0; d += 1) if (livre(p.x + v.x * d, p.z + v.y * d)) d0 = d;
    if (!d0) return;
    // e mais até 8 m pela rua (enquanto livre), para ver a fachada clicada inteira e não colado nela
    let d1 = d0; while (d1 < d0 + 8 && livre(p.x + v.x * (d1 + 1), p.z + v.y * (d1 + 1))) d1++;
    p = p.clone(); p.x += v.x * d1; p.z += v.y * d1;
  }
  e.preventDefault();
  entrarRua(p.x, p.z);
});
canvas.addEventListener('wheel', (e) => { if (RUA.on && e.deltaY > 0) sairRua(); }, { passive: true });
// andar na vista de rua, como na e-bike (jogo.js): W/S ou ↑/↓ para frente e para trás, A/D ou ←/→ viram, Shift corre.
// Os prédios e o Reno barram o passo (grade de jogo.js); o olho segue o relevo e as pontes a 1,7 m
const PASSO_RUA = { frente: false, tras: false, esq: false, dir: false, correr: false };
const TECLA_RUA = { KeyW: 'frente', ArrowUp: 'frente', KeyS: 'tras', ArrowDown: 'tras', KeyA: 'esq', ArrowLeft: 'esq', KeyD: 'dir', ArrowRight: 'dir', ShiftLeft: 'correr', ShiftRight: 'correr' };
addEventListener('keydown', (e) => { const k = TECLA_RUA[e.code]; if (k && RUA.on && !e.target.closest?.('input, textarea, select')) { PASSO_RUA[k] = true; e.preventDefault(); } });
addEventListener('keyup', (e) => { const k = TECLA_RUA[e.code]; if (k) PASSO_RUA[k] = false; });
addEventListener('blur', () => { for (const k in PASSO_RUA) PASSO_RUA[k] = false; });
const vRua = new THREE.Vector3();
let velRua = 0;
function andarRua(dt) {
  if (!RUA.on || !window.jogo) return;
  const P = PASSO_RUA, J = window.jogo;
  const giro = (P.esq ? 1 : 0) - (P.dir ? 1 : 0);
  // vira: gira o alvo (30 cm à frente) em torno do olho
  if (giro) { vRua.subVectors(controls.target, camera.position).applyAxisAngle(THREE.Object3D.DEFAULT_UP, giro * 1.6 * dt); controls.target.copy(camera.position).add(vRua); }
  const quer = (P.frente ? 1 : 0) - (P.tras ? 1 : 0), vmax = P.correr ? 4.2 : 1.6; // passo e corrida (m/s)
  velRua += (quer * vmax - velRua) * Math.min(1, dt * 6);
  if (Math.abs(velRua) < 0.02) return;
  vRua.subVectors(controls.target, camera.position); vRua.y = 0;
  if (vRua.lengthSq() < 1e-8) return;
  vRua.normalize();
  const x = camera.position.x, z = camera.position.z, s = Math.sign(velRua);
  // 1,2 m de folga à frente: a parede não chega ao plano de corte da câmera
  const pode = (px, pz) => { if (J.bloqueado(px + vRua.x * 1.2 * s, pz + vRua.z * 1.2 * s) || J.bloqueado(px, pz) || foraREC(px, pz, 2)) return false; const p = J.piso(px, pz); return p.ponte || p.y > AGUA.nivel - 0.25; };
  let nx = x + vRua.x * velRua * dt, nz = z + vRua.z * velRua * dt;
  if (!pode(nx, nz)) { if (pode(nx, z)) nz = z; else if (pode(x, nz)) nx = x; else { velRua = 0; return; } } // desliza ao longo da parede
  const y = J.piso(nx, nz).y + 1.7 + Math.abs(Math.sin(performance.now() / 280)) * 0.03 * Math.min(1, Math.abs(velRua));
  const d = new THREE.Vector3(nx - x, y - camera.position.y, nz - z);
  camera.position.add(d); controls.target.add(d);
}
addEventListener('keydown', (e) => { if (e.key === 'Escape' && RUA.on) sairRua(); });

// ---------- câmera: posição por alvo, distância, rumo (az) e inclinação (polar) ----------
const esf = new THREE.Spherical();
function lerCamera() {
  esf.setFromVector3(camera.position.clone().sub(controls.target));
  return { alvo: controls.target.toArray(), dist: esf.radius, az: esf.theta, polar: esf.phi };
}
function porCamera({ alvo, dist, az, polar }) {
  controls.target.fromArray(alvo);
  esf.set(dist, polar, az);
  camera.position.setFromSpherical(esf).add(controls.target);
  camera.lookAt(controls.target);
}
// vista inicial: da Pfalz, atrás do Münster, olhando o Reno e a Mittlere Brücke (eco da vista de Merian)
// (a Mittlere Brücke fica em x≈25, z≈−204; o Münster em x≈213, z≈211; a câmera fica um pouco além e acima dele)
const VISTA_PFALZ = { alvo: [25, 4, -190], dist: 540, az: THREE.MathUtils.degToRad(24), polar: THREE.MathUtils.degToRad(70) };
porCamera(VISTA_PFALZ);
// ?cam=<nome>: uma das 6 câmeras fixas de cameras.js (tarefa 21), para comparar com fotos da cidade real
const CAM = q.get('cam') && (await import('./cameras.js')).CAMERAS[q.get('cam')];

// ---------- laço ----------
function redimensionar() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  ceu.redimensionar?.(w, h);
}
addEventListener('resize', redimensionar);
redimensionar();

// a câmera para o som: distância, inclinação, rumo, velocidade e giro (lidos por som.js)
const camSom = { dist: 400, polar: 1, az: 0, vel: 0, giro: 0 };
window.camSom = camSom;
let ant = null;
const cDia = { hemi: new THREE.Color(0xfff6e4), hemiChao: new THREE.Color(0xb9a785), sol: new THREE.Color(0xfff0d6) };
const cNoite = { hemi: new THREE.Color(0x4a5a86), hemiChao: new THREE.Color(0x1d1a22), sol: new THREE.Color(0x9fb3e8) };
let tQuadro = 0;
function quadro(agora) {
  requestAnimationFrame(quadro);
  andarRua(Math.min(0.05, (agora - (tQuadro || agora)) / 1000)); tQuadro = agora;
  if (!(typeof window.tour?.ativo === "function" && window.tour.ativo()) && !window.jogo?.ativo()) controls.update();
  // nunca abaixo do chão nem dentro do Reno: a câmera fica ao menos 1,5 m acima do relevo (ou da água)
  { const p = camera.position, T = meta.terreno, L = (T.nvlado ?? 2048) * T.passo;
    const fora = p.x < T.x0 || p.z < T.z0 || p.x > T.x0 + L || p.z > T.z0 + L, h = fora ? (ROCHE && Math.hypot(p.x - 1300, p.z + 180) < 380 ? 8 : 0) : altura(p.x, p.z); // fora: o disco de chão da Roche (roche.js), em 8 m
    const piso = Math.max(Number.isFinite(h) ? h : 0, AGUA.nivel) + 1.5;
    if (p.y < piso) p.y = piso;
    const t = controls.target, pisoT = altura(t.x, t.z) - 2; if (t.y < pisoT) t.y = pisoT; }
  // noite que cai devagar
  const n = U.uNoite.value + (noiteAlvo - U.uNoite.value) * 0.04;
  U.uNoite.value = n;
  cena.background.copy(COR.papel).lerp(COR.ceuNoite, n);
  cena.fog.color.copy(cena.background);
  hemi.color.copy(cDia.hemi).lerp(cNoite.hemi, n); hemi.groundColor.copy(cDia.hemiChao).lerp(cNoite.hemiChao, n);
  hemi.intensity = 1.7 - n * 1.25;
  sol.color.copy(cDia.sol).lerp(cNoite.sol, n); sol.intensity = 2.4 - n * 2.05;
  // som: velocidade da câmera (m/s relativos à distância + giro)
  const c = lerCamera();
  if (ant) {
    const dt = Math.max(0.001, (agora - ant.t) / 1000);
    const mov = Math.hypot(c.alvo[0] - ant.alvo[0], c.alvo[1] - ant.alvo[1], c.alvo[2] - ant.alvo[2]) / Math.max(60, c.dist);
    let giro = c.az - ant.az; giro = Math.atan2(Math.sin(giro), Math.cos(giro));
    const bruto = (mov + Math.abs(Math.log(c.dist / ant.dist)) + Math.abs(giro) * 0.8 + Math.abs(c.polar - ant.polar)) / dt;
    const alvo = Math.min(1, Math.sqrt(bruto / 1.2));
    camSom.vel += (alvo - camSom.vel) * (alvo > camSom.vel ? 0.25 : 0.05);
    camSom.giro = THREE.MathUtils.radToDeg(giro) / dt;
  }
  ant = { ...c, t: agora };
  Object.assign(camSom, { dist: c.dist, polar: c.polar, az: c.az });
  MARC.atualiza(U.uSel.value);
  VIDA.atualizar(agora);
  atualizarNuvens(agora, ceu);
  atualizarNeve(agora, ceu, cena, camera, leve);
  ceu.atualizar(agora);
  if (sol.castShadow) { // a sombra do modo leve acompanha a câmera, em passos de 8 m (sem tremer a cada quadro)
    const tx = Math.round(controls.target.x / 8) * 8, tz = Math.round(controls.target.z / 8) * 8;
    if (tx !== sol.target.position.x || tz !== sol.target.position.z) {
      const d = sol.position.clone().sub(sol.target.position);
      sol.target.position.set(tx, 0, tz); sol.target.updateMatrixWorld(); sol.position.copy(sol.target.position).add(d);
    }
  }
  AGUA.atualizar(agora);
  ceu.render();
}
// torres da Roche e o chão além do recorte (roche.js)
const ROCHE = q.get('roche') === '0' ? null : await criarRoche({ cena, U, recorte: (() => { const T = meta.terreno, L = (T.nvlado ?? 2048) * T.passo; return { x0: T.x0 + 0.3, x1: T.x0 + L - 0.3, z0: T.z0 + 0.3, z1: T.z0 + L - 0.3, y: 8 }; })() }); // buraco do tamanho do relevo fino (chao.py), não do relevo de 5 m
// neve (neve.js): em tudo o que já está na cena (prédios, marcos, árvores, detalhes), antes da gente e dos bondes; o chão à
// parte, com as ruas limpas (a máscara de ruas de chao.js tira a neve do asfalto e de parte das calçadas)
{
  const feitos = new Set();
  const comNeve = (m, op) => {
    if (feitos.has(m) || m.userData.semNeve || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial)) return;
    feitos.add(m);
    const orig = m.onBeforeCompile, chave = m.customProgramCacheKey();
    m.onBeforeCompile = (sh, r) => { orig?.call(m, sh, r); injetarNeve(sh, op); };
    m.customProgramCacheKey = () => `${chave}|neve`;
    m.needsUpdate = true;
  };
  comNeve(CH.malha.material, { xz: 'vChaoP', tira: '(texture2D(uRuasA, (vChaoP - uRuasRet.xy) * uRuasRet.zw).r * 0.85 + texture2D(uRuasA, (vChaoP - uRuasRet.xy) * uRuasRet.zw).b * 0.45) * uRuasOn' });
  cena.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o !== CH.malha && !o.userData.semNeve) for (const m of [o.material].flat()) comNeve(m); });
}
// gente e movimento (tarefa 19, docs/vida.js): bondes pelo horário do GTFS, pedestres, bicicletas, carros, gaivotas e nadadores
carga?.etapa(0.96, t('gente e bondes…', 'people and trams…', 'Menschen und Trams…'));
const VIDA = await (await import('./vida.js')).criarVida({ THREE, cena, ceu, altura, ruas, camera, controls, nivelReno: AGUA.nivel + 0.05, nivelRio: AGUA.nivel, leve, cotaPonte: MARC.cotaPonte, ponte: MITTLERE, recorte: REC });
$('c-vida').addEventListener('change', (e) => VIDA.ligar(e.target.checked));
if (q.get('vida') === '0') { $('c-vida').checked = false; VIDA.ligar(false); }
relogio(ceu.estado()); ceu.aoMudar(relogio);
if (q.get('noite')) definirNoite(true);
if (CAM) {
  const a = typeof CAM.alvo === 'string' ? centro(CAM.alvo) : [...CAM.alvo];
  if (a[1] === null) a[1] = altura(a[0], a[2]);
  porCamera({ alvo: a, dist: CAM.dist, az: THREE.MathUtils.degToRad(CAM.az), polar: THREE.MathUtils.degToRad(CAM.polar) });
  controls.update();
}
requestAnimationFrame(quadro);
orto.carrega(); // tiles chegam depois da abertura
carga?.etapa(1, '');
$('carregando').classList.add('fora');

// ---------- estatística para o tour (contada dos dados) ----------
// o swissBUILDINGS3D parte um prédio em vários sólidos (o Museum der Kulturen são 8): a contagem é por prédio (EGID)
const estat = { total: new Set(P.map((p, i) => p.egid ?? `s${i}`)).size, solidos: P.length };

// centro e topo de um prédio pelo nome (para o tour mirar em marcos sem coordenadas fixas)
function centro(nome) {
  const ids = new Set(P.map((p, i) => (p.nome === nome ? i : -1)).filter((i) => i >= 0));
  let sx = 0, sz = 0, n = 0, topo = 0;
  for (let v = 0; v < nVert; v++) if (ids.has(ids16[v])) {
    sx += posicoes[v * 3]; sz += posicoes[v * 3 + 2]; topo = Math.max(topo, posicoes[v * 3 + 1]); n++;
  }
  return n ? [sx / n, topo * 0.5, sz / n] : [0, 10, 0];
}

window.cidade = {
  THREE, FACH, MARC, U, camera, arvores, centro, controls, lerCamera, porCamera, definirNoite, fecharFicha, abrirFicha,
  noite: () => ceu.estado().noite > 0.5, estat, VISTA_PFALZ, altura, ceu, cena, sairRua, rua: () => RUA.on,
  // para o modo jogo (jogo.js): plantas dos prédios, pontes e o Reno
  posicoes, nTris: meta.n_tris, ruas, cotaPonta, cotaPonte: MARC.cotaPonte, nivelReno: AGUA.nivel, relevo: R, ponte: MITTLERE,
};
await import('./tour.js');
await import('./jogo.js');
