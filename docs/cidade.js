// Basel em 3D: prédios do swissBUILDINGS3D com o ano do GWR, relevo swissALTI3D, Reno, ruas e
// bondes do OSM; máquina do tempo no shader (cada prédio sobe no ano de construção), cor por época,
// noite com janelas acesas e ficha do prédio ao clicar. Dados gerados por script/predios.py.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { iniciarCeu } from './ceu.js';
import { criaOrtofoto } from './ortofoto.js';
import { criarFachadas } from './fachadas.js';
import { criarArvores } from './arvores.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);

const [meta, ruas, bin, rel] = await Promise.all([
  fetch('data/predios.json').then((r) => r.json()),
  fetch('data/ruas.json').then((r) => r.json()),
  fetch('data/predios.bin').then((r) => r.arrayBuffer()),
  fetch('data/relevo.bin').then((r) => r.arrayBuffer()),
]);
const P = meta.predios;
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
Object.assign(sol.shadow.camera, { left: -700, right: 700, top: 700, bottom: -700, near: 10, far: 2000 });
sol.shadow.bias = -0.0004;
sol.shadow.normalBias = 0.6;
cena.add(sol, sol.target);

// ---------- relevo e Reno ----------
const R = meta.relevo;
const alturas = new Uint16Array(rel);
const altura = (x, z) => {
  const fx = (x - R.x0) / R.passo, fz = (z - R.z0) / R.passo;
  const i = Math.max(0, Math.min(R.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(R.ny - 2, Math.floor(fz)));
  const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j));
  const h = (a, b) => alturas[b * R.nx + a] / 100;
  return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
};
{
  const larg = (R.nx - 1) * R.passo, prof = (R.ny - 1) * R.passo;
  const g = new THREE.PlaneGeometry(larg, prof, R.nx - 1, R.ny - 1);
  g.rotateX(-Math.PI / 2);
  g.translate(R.x0 + larg / 2, 0, R.z0 + prof / 2);
  const pos = g.attributes.position, cores = new Float32Array(pos.count * 3);
  const chao = new THREE.Color('#dcd0b2'), agua = new THREE.Color('#6f8e99'), margem = new THREE.Color('#c9bd9c'), c = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    const h = alturas[k] / 100;
    pos.setY(k, h);
    if (h < NIVEL_RENO) c.copy(agua); else c.copy(chao).lerp(margem, Math.max(0, 1 - (h - NIVEL_RENO) / 3));
    c.toArray(cores, k * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.receiveShadow = true;
  orto.chao(m);
  cena.add(m);
  // espelho d'água do Reno: um plano liso no nível do rio, um pouco brilhante
  const rio = new THREE.Mesh(
    new THREE.PlaneGeometry(larg, prof).rotateX(-Math.PI / 2).translate(R.x0 + larg / 2, NIVEL_RENO - 0.35, R.z0 + prof / 2),
    new THREE.MeshPhongMaterial({ color: 0x6f8e99, shininess: 60, specular: 0x9fb7c0, transparent: true, opacity: 0.85 }),
  );
  rio.receiveShadow = true;
  rio.name = 'rio';
  cena.add(rio);
}

// ---------- ruas, bondes e muralha (faixas sobre o relevo) ----------
const LARGURA = { secondary: 8, secondary_link: 6, tertiary: 7, unclassified: 6, residential: 6, living_street: 5, pedestrian: 6,
  service: 3.5, footway: 2, path: 1.6, steps: 2, cycleway: 2, construction: 4, tram: 1.1 };
const ruasObj = new THREE.Group();
{
  const pos = [], cor = [];
  const cRua = new THREE.Color('#c6b48c'), cPe = new THREE.Color('#d2c39f'), cBonde = new THREE.Color('#2f6b3f');
  const faixa = (c, larg, cc, eleva, ponte) => {
    // subdivide a cada 4 m para seguir o relevo; ponte: reta entre as cotas das pontas
    const pts = [];
    for (let i = 0; i < c.length - 2; i += 2) {
      const [x0, z0, x1, z1] = [c[i], c[i + 1], c[i + 2], c[i + 3]];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 4));
      for (let k = 0; k < n; k++) pts.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]);
    }
    pts.push([c[c.length - 2], c[c.length - 1]]);
    const hA = altura(pts[0][0], pts[0][1]), hB = altura(pts.at(-1)[0], pts.at(-1)[1]);
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
    if (!larg) continue;
    const pe = ['footway', 'path', 'steps', 'cycleway', 'pedestrian', 'living_street'].includes(l.t);
    faixa(l.c, larg, l.t === 'tram' ? cBonde : pe ? cPe : cRua, l.t === 'tram' ? 0.45 : pe ? 0.25 : 0.3, !!l.ponte);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.receiveShadow = true;
  ruasObj.add(m);
  // muralha (OSM historic=citywalls): faixa vertical de 5 m
  const mp = [];
  for (const c of ruas.muralha) for (let i = 0; i < c.length - 2; i += 2) {
    const [ax, az, bx, bz] = [c[i], c[i + 1], c[i + 2], c[i + 3]];
    if (Math.abs(ax) > 560 || Math.abs(az) > 585) continue;
    const ya = altura(ax, az), yb = altura(bx, bz);
    mp.push(ax, ya, az, bx, yb, bz, bx, yb + 5, bz, ax, ya, az, bx, yb + 5, bz, ax, ya + 5, az);
  }
  if (mp.length) {
    const gm = new THREE.BufferGeometry(); gm.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3)); gm.computeVertexNormals();
    const mm = new THREE.Mesh(gm, new THREE.MeshLambertMaterial({ color: 0x8a3b2a, side: THREE.DoubleSide }));
    mm.castShadow = true; ruasObj.add(mm);
  }
  cena.add(ruasObj);
}

// ---------- prédios ----------
const nVert = meta.n_tris * 3;
const q16 = new Int16Array(bin, 0, nVert * 3);
const ids16 = new Uint16Array(bin, nVert * 6, nVert);
const posicoes = new Float32Array(nVert * 3);
for (let i = 0; i < q16.length; i++) posicoes[i] = q16[i] / meta.escala;
const base = new Float32Array(P.length).fill(1e9);
for (let v = 0; v < nVert; v++) base[ids16[v]] = Math.min(base[ids16[v]], posicoes[v * 3 + 1]);
const aAno = new Float32Array(nVert), aBase = new Float32Array(nVert), aPid = new Float32Array(nVert);
for (let v = 0; v < nVert; v++) {
  const id = ids16[v];
  aAno[v] = P[id].ano ?? -1; aBase[v] = base[id]; aPid[v] = id;
}
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(posicoes, 3));
geo.setAttribute('ano', new THREE.BufferAttribute(aAno, 1));
geo.setAttribute('base', new THREE.BufferAttribute(aBase, 1));
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

export const EPOCAS = [
  { ate: 1499, cor: '#7a1f1a', nome: t('antes de 1500', 'before 1500', 'vor 1500') },
  { ate: 1799, cor: '#b5542c', nome: '1500–1799' },
  { ate: 1899, cor: '#d9a441', nome: '1800–1899' },
  { ate: 1945, cor: '#8aa36b', nome: '1900–1945' },
  { ate: 1999, cor: '#4f7f8f', nome: '1946–1999' },
  { ate: 9999, cor: '#2c3e73', nome: t('2000 em diante', '2000 onwards', 'ab 2000') },
];
const SEM_ANO = '#b9b2a4';
const hash = (i) => { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
let modo = 'gravura';
function colorir() {
  const parede = ['#f6efe0', '#f1e6cf', '#faf4e8', '#eee0c2', '#e9dfcc', '#f7ead2', '#e6d4cf', '#dfe0d2'].map((c) => new THREE.Color(c));
  const telhas = ['#9c4f35', '#8e4a33', '#a85d3d', '#7f4636', '#6e5a4e'].map((c) => new THREE.Color(c));
  const epocas = EPOCAS.map((e) => new THREE.Color(e.cor)), sem = new THREE.Color(SEM_ANO);
  const c = new THREE.Color();
  for (let t = 0; t < meta.n_tris; t++) {
    const id = ids16[t * 3], h = hash(id), p = P[id];
    if (modo === 'epoca') {
      c.copy(p.ano ? epocas[EPOCAS.findIndex((e) => p.ano <= e.ate)] : sem);
      if (ehTelhado[t]) c.multiplyScalar(0.72);
    } else {
      // telhados planos (modernos) ficam cinza; inclinados, de telha
      c.copy(ehTelhado[t] ? telhas[Math.floor(h * telhas.length)] : parede[Math.floor(h * parede.length)]);
      if (ehTelhado[t] && (p.ano ?? 0) > 1945) c.set('#8c8578');
    }
    for (let k = 0; k < 3; k++) c.toArray(cores, (t * 3 + k) * 3);
  }
  geo.attributes.color.needsUpdate = true;
}
colorir();

// máquina do tempo e destaque no shader: cada prédio cresce nos 12 anos antes do ano de construção;
// antes disso vira um lote pálido de 1,5 m (ou some, sem os lotes pálidos)
const U = {
  uAno: { value: 2026 }, uPalido: { value: 1 }, uSel: { value: -1 }, uNoite: { value: 0 },
};
const FACH = criarFachadas({ cena, meta, posicoes, ids16, U });
geo.setAttribute('fa', FACH.atributos.fa);
geo.setAttribute('fb', FACH.atributos.fb);
const VERT_DECL = `
attribute float ano; attribute float base; attribute float pid;
uniform float uAno; uniform float uPalido; uniform float uSel;
varying float vEstado; varying float vSel; varying vec3 vMundo; varying float vPid;`;
const VERT_CORPO = `
  vec3 transformed = vec3(position);
  // sem ano: de pé só em 2026; no passado, lote pálido (não se sabe desde quando existe)
  float sobe = ano < 0.0 ? (uAno > 2025.5 ? 1.0 : 0.0) : clamp((uAno - ano + 12.0) / 12.0, 0.0, 1.0);
  vEstado = 0.0;
  if (sobe <= 0.0) {
    vEstado = uPalido > 0.5 ? 1.0 : 2.0;
    transformed.y = base + min(position.y - base, 1.5);
  } else {
    transformed.y = base + (position.y - base) * sobe;
  }
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
    .replace('void main() {', 'void main() {\n  if (vEstado > 1.5) discard;');
  if (!cheio) return;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <color_fragment>', `#include <color_fragment>
  if (vEstado > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.9, 0.84), 0.75);
  if (vSel > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.70, 0.15, 0.12), 0.65);`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  // noite: janelas acesas nas paredes, em andares de 3,2 m, sorteadas por prédio e por janela
  if (uNoite > 0.01 && vEstado < 0.5) {
    vec3 nW = normalize(cross(dFdx(vMundo), dFdy(vMundo)));
    if (abs(nW.y) < 0.3) {
      vec2 tg = normalize(vec2(-nW.z, nW.x));
      float u = dot(vMundo.xz, tg) / 2.7, v = (vMundo.y - 0.8) / 3.2;
      vec2 cel = floor(vec2(u, v));
      float acesa = step(0.58, fract(sin(dot(cel, vec2(12.9898, 78.233)) + vPid * 0.618) * 43758.5453));
      float jan = step(0.28, fract(u)) * step(fract(u), 0.72) * step(0.3, fract(v)) * step(fract(v), 0.78) * step(1.0, v);
      totalEmissiveRadiance += vec3(1.0, 0.72, 0.38) * jan * acesa * uNoite * 1.4;
    }
  }`);
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
const ceu = await iniciarCeu({ cena, renderer, camera, hemi, sol, U, leve, patchNormal: (s) => { const f = s.fragmentShader; injetar(s, false); s.fragmentShader = f.replace('void main() {', 'varying float vEstado;\nvoid main() {\n  if (vEstado > 1.5) discard;'); arvores?.patchNormal(s); } });
arvores = q.get('arvores') === '0' ? null : await criarArvores({ THREE, cena, camera, altura, ceu }); // cadastro de árvores e gramados (tarefa 16)

// prédios demolidos que o GWR registra: pinos vermelhos enquanto existiam
const pinos = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.4, 0.2, 9, 8).translate(0, 4.5, 0),
  new THREE.MeshLambertMaterial({ color: 0xb3261e }), meta.demolidos.length);
pinos.castShadow = true;
cena.add(pinos);
const m4 = new THREE.Matrix4();
function atualizarPinos(ano) {
  meta.demolidos.forEach((d, i) => {
    const vivo = d.ano && d.ano <= ano && ano < d.fim;
    m4.makeScale(vivo ? 1 : 0, vivo ? 1 : 0, vivo ? 1 : 0).setPosition(d.x, altura(d.x, d.z), d.z);
    pinos.setMatrixAt(i, m4);
  });
  pinos.instanceMatrix.needsUpdate = true;
}

// ---------- ano: régua não linear (mais espaço para os séculos com mais prédios) ----------
const NOS = [[0, 1100], [250, 1500], [450, 1800], [700, 1900], [1000, 2026]];
const reguaParaAno = (v) => {
  for (let i = 1; i < NOS.length; i++) if (v <= NOS[i][0]) {
    const [a, ya] = NOS[i - 1], [b, yb] = NOS[i];
    return Math.round(ya + ((v - a) / (b - a)) * (yb - ya));
  }
  return 2026;
};
const anoParaRegua = (y) => {
  for (let i = 1; i < NOS.length; i++) if (y <= NOS[i][1]) {
    const [a, ya] = NOS[i - 1], [b, yb] = NOS[i];
    return a + ((y - ya) / (yb - ya)) * (b - a);
  }
  return 1000;
};
document.querySelectorAll('.marcas span').forEach((s, i) => {
  s.style.cssText = `position:absolute;left:${NOS[i][0] / 10}%;transform:translateX(${i === 0 ? 0 : i === NOS.length - 1 ? -100 : -50}%)`;
});
document.querySelector('.marcas').style.cssText = 'position:relative;height:16px';

// o swissBUILDINGS3D parte um prédio em vários sólidos (o Museum der Kulturen são 8): as contagens são por prédio
// (EGID do GWR; sólido sem EGID conta sozinho)
const unicos = [...new Map(P.map((p, i) => [p.egid ?? `s${i}`, p])).values()];
const anosOrdenados = unicos.map((p) => p.ano).filter(Boolean).sort((a, b) => a - b);
const existentes = (ano) => { let lo = 0, hi = anosOrdenados.length; while (lo < hi) { const m = (lo + hi) >> 1; if (anosOrdenados[m] <= ano) lo = m + 1; else hi = m; } return lo; };
let anoAtual = 2026;
function definirAno(ano, deRegua = false) {
  anoAtual = Math.round(Math.max(1100, Math.min(2026, ano)));
  U.uAno.value = ano; // o shader recebe o valor contínuo, para o crescimento ficar liso no tour
  $('ano-num').textContent = anoAtual;
  if (!deRegua) $('regua').value = anoParaRegua(anoAtual);
  const n = existentes(anoAtual);
  $('contagem').textContent = t(`${fmt(n)} de ${fmt(anosOrdenados.length)} prédios de hoje (com ano) já estavam de pé`,
    `${fmt(n)} of today’s ${fmt(anosOrdenados.length)} dated buildings were already standing`,
    `${fmt(n)} von ${fmt(anosOrdenados.length)} heutigen Häusern (mit Baujahr) standen schon`);
  atualizarPinos(anoAtual);
}
$('regua').addEventListener('input', (e) => definirAno(reguaParaAno(+e.target.value), true));
document.querySelector('.nota').innerHTML = document.querySelector('.nota').innerHTML.replace('{d}', meta.demolidos.length);

// ---------- chaves ----------
function definirModo(m) {
  modo = m; orto.modo(m); $('c-epoca').checked = m === 'epoca';
  U.uFachada.value = U.uFotoTelhado.value = m === 'epoca' ? 0 : 1; colorir();
  const leg = $('legenda');
  leg.classList.toggle('on', m === 'epoca');
  leg.innerHTML = EPOCAS.map((e) => `<span><i style="background:${e.cor}"></i>${e.nome}</span>`).join('') + `<span><i style="background:${SEM_ANO}"></i>${t('sem ano', 'no year', 'ohne Jahr')}</span>`;
}
$('c-epoca').addEventListener('change', (e) => definirModo(e.target.checked ? 'epoca' : 'gravura'));
$('c-palidos').addEventListener('change', (e) => { U.uPalido.value = e.target.checked ? 1 : 0; });
$('c-ruas').addEventListener('change', (e) => { ruasObj.visible = e.target.checked; });
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
  if (p.ano && p.ano > anoAtual) linhas.push([t('Em ', 'In ', 'Im Jahr ') + anoAtual, t('ainda não existia', 'not yet built', 'noch nicht gebaut')]);
  if (p.egid) linhas.push(['EGID', `<a href="https://map.geo.admin.ch/?lang=${LANG === 'pt' ? 'en' : LANG}&layers=ch.bfs.gebaeude_wohnungs_register&swisssearch=${p.egid}" target="_blank" rel="noopener">${p.egid}</a>`]);
  $('f-dl').innerHTML = linhas.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
  $('ficha').hidden = false;
}
function fecharFicha() { $('ficha').hidden = true; U.uSel.value = -1; }
$('ficha').querySelector('.x').addEventListener('click', fecharFicha);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !window.tour?.ativo()) fecharFicha(); });

const raio = new THREE.Raycaster();
let apertou = null;
canvas.addEventListener('pointerdown', (e) => { apertou = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!apertou || Math.hypot(e.clientX - apertou[0], e.clientY - apertou[1]) > 5 || window.tour?.ativo()) return;
  const r = canvas.getBoundingClientRect();
  raio.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const hits = raio.intersectObject(predios, false);
  // o raio vê a geometria inteira; ignora prédios escondidos pela máquina do tempo
  const hit = hits.find((h) => { const p = P[ids16[h.face.a]]; return (p.ano ? p.ano <= anoAtual : anoAtual >= 2026) || U.uPalido.value > 0.5; });
  if (hit) abrirFicha(ids16[hit.face.a]); else fecharFicha();
});

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
function quadro(agora) {
  requestAnimationFrame(quadro);
  if (!window.tour?.ativo()) controls.update();
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
  ceu.atualizar(agora);
  ceu.render();
}
const ini = +(q.get('ano') || 2026);
definirAno(ini);
definirModo(q.get('epoca') ? 'epoca' : 'gravura');
if (q.get('noite')) definirNoite(true);
if (CAM) {
  const a = typeof CAM.alvo === 'string' ? centro(CAM.alvo) : [...CAM.alvo];
  if (a[1] === null) a[1] = altura(a[0], a[2]);
  porCamera({ alvo: a, dist: CAM.dist, az: THREE.MathUtils.degToRad(CAM.az), polar: THREE.MathUtils.degToRad(CAM.polar) });
  controls.update();
}
requestAnimationFrame(quadro);
orto.carrega(); // tiles chegam depois da abertura
$('carregando').classList.add('fora');

// ---------- estatística para o tour (contada dos dados) ----------
const estat = (() => {
  const comAno = unicos.filter((p) => p.ano);
  const minimo = Math.min(...comAno.map((p) => p.ano));
  const maisAntigos = [...new Set(comAno.filter((p) => p.ano === minimo).map((p) => p.nome).filter(Boolean))];
  const porEpoca = EPOCAS.map((e, i) => comAno.filter((p) => p.ano <= e.ate && (i === 0 || p.ano > EPOCAS[i - 1].ate)).length);
  const sec19 = comAno.filter((p) => p.ano >= 1800 && p.ano < 1900).length;
  const rathaus = P.find((p) => p.nome === 'Rathaus');
  return { total: unicos.length, solidos: P.length, comAno: comAno.length, minimo, maisAntigos, porEpoca, sec19, rathaus, demolidos: meta.demolidos.length };
})();

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
  THREE, FACH, U, camera, arvores, centro, controls, lerCamera, porCamera, definirAno, definirModo, definirNoite, fecharFicha, abrirFicha,
  ano: () => U.uAno.value, modo: () => modo, noite: () => ceu.estado().noite > 0.5, estat, VISTA_PFALZ, altura,
  temPalidos: () => U.uPalido.value > 0.5,
  palidos: (on) => { U.uPalido.value = on ? 1 : 0; $('c-palidos').checked = on; },
};
await import('./tour.js');
