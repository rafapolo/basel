// Flores pela estação (2026-11-21): vasos de pedra em volta dos fontanários (detalhes.json), os canteiros do OSM
// (flowerbed) cheios e flores soltas nos parques, jardins e gramados (arvores.json → verde). Cor e quantidade pelo dia
// do ano, como em Basel: crocos e narcisos em março (também nos gramados), tulipas em abril e maio, gerânios vermelhos e
// rosa e lavanda no verão (os vasos das fontes), ásteres e crisântemos no outono, e no inverno só a urze dos vasos.
// Duas malhas instanciadas (folhas e flores, as cores das flores por instância) e uma de vasos; tudo pequeno, sem sombra.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const VASO = 0, CANTEIRO = 1, GRAMA = 2;
// paletas por fase do ano (dia do ano): [início, fim, cores, fração visível por tipo [vaso, canteiro, gramado]]
const FASES = [
  [0, 62, ['#d98fb8', '#f2e6ee', '#c76a9e'], [0.55, 0, 0]],                                        // inverno: urze (Erika) nos vasos
  [62, 100, ['#8e6cc9', '#f4f0e6', '#f2c84b', '#f7d93c', '#b48ad8'], [0.8, 0.7, 0.55]],          // crocos e narcisos, também na grama
  [100, 152, ['#d6252c', '#f2b51d', '#f07aa5', '#ffffff', '#9b3bb0', '#ff7a1a'], [1, 1, 0.35]],   // tulipas; margaridas na grama
  [152, 250, ['#e23b3b', '#f05f8c', '#ffffff', '#c2185b', '#8a72c8', '#e23b3b'], [1, 1, 0.3]],    // gerânios e lavanda; flores do campo
  [250, 318, ['#8a5bc4', '#e07b28', '#c9452b', '#f0b23a', '#b85bc4'], [0.95, 0.85, 0.08]],        // ásteres e crisântemos
  [318, 367, ['#d98fb8', '#f2e6ee', '#8a5bc4'], [0.5, 0.15, 0]],                                    // fim de outono: urze e os últimos ásteres
];
const CAMPO = ['#ffffff', '#f7f3e8', '#f2d84b', '#7a8ce0', '#ffffff']; // na grama: margaridas, botões-de-ouro, flores do campo
// as cores já como THREE.Color (antes cada troca de dia reinterpretava ~10 mil textos de cor: lixo no tour)
const COR_PRONTA = new Map(); const corPronta = (h) => { let c = COR_PRONTA.get(h); if (!c) { c = new THREE.Color(h); COR_PRONTA.set(h, c); } return c; };

export async function criarFlores({ cena, altura, ceu, leve = false, base = 'data/' }) {
  const [det, arv] = await Promise.all([fetch(base + 'detalhes.json').then((r) => r.json()), fetch(base + 'arvores.json').then((r) => r.json())]).catch(() => [null, null]);
  if (!det || !arv) return null;
  let sem = 91; const rnd = () => ((sem = (sem * 16807) % 2147483647) / 2147483647);
  const itens = []; // {x, y, z, s, tipo, r}
  const vasos = [];
  // 1. fontanários: 3 ou 4 vasos redondos em volta, fora da bacia, 4 a 6 tufos em cada
  for (const [x, z, t, a] of det.fontes) {
    const s = t ? 0.62 : 1, n = t ? 3 : 6, R = 1.5 * s + 1.1;
    for (let k = 0; k < n; k++) {
      const ang = a + Math.PI / 4 + (k * 2 * Math.PI) / n + (rnd() - 0.5) * 0.3, vx = x + Math.cos(ang) * R, vz = z + Math.sin(ang) * R, vy = altura(vx, vz);
      vasos.push([vx, vy, vz]);
      const m = 7 + Math.floor(rnd() * 3); // vaso cheio, transbordando
      for (let j = 0; j < m; j++) { const aa = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 0.3; itens.push({ x: vx + Math.cos(aa) * rr, y: vy + 0.46, z: vz + Math.sin(aa) * rr, s: 1.25 + rnd() * 0.45, tipo: VASO, r: rnd() }); }
    }
  }
  // 2. canteiros e verdes do OSM: pontos sorteados dentro dos polígonos, densidade pelo tipo
  const dentro = (x, z, p) => { let d = false; for (let i = 1, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > z) !== (p[j + 1] > z) && x < ((p[j] - p[i]) * (z - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) d = !d; return d; };
  const area = (p) => { let s = 0; for (let i = 1, j = p.length - 2; i < p.length; j = i, i += 2) s += (p[j] + p[i]) * (p[j + 1] - p[i + 1]); return Math.abs(s / 2); };
  const TETO = { [CANTEIRO]: leve ? 1200 : 3500, [GRAMA]: leve ? 900 : 3000 };
  const POR_M2 = { 3: [CANTEIRO, 1 / 1.2], 1: [GRAMA, 1 / 30], 0: [GRAMA, 1 / 45], 2: [GRAMA, 1 / 60] };
  const cont = { [CANTEIRO]: 0, [GRAMA]: 0 };
  for (const p of arv.verde) {
    const regra = POR_M2[p[0]]; if (!regra) continue;
    const [tipo, dens] = regra; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 1; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]); }
    const n = Math.min(400, Math.round(area(p) * dens));
    for (let k = 0, tent = 0; k < n && tent < n * 4 && cont[tipo] < TETO[tipo]; tent++) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
      if (!dentro(x, z, p)) continue;
      const y = altura(x, z); if (!y && y !== 0) continue;
      // na grama as flores vêm em manchas: cada ponto puxa 2 a 4 vizinhos
      const tufos = tipo === GRAMA ? 2 + Math.floor(rnd() * 3) : 1;
      for (let j = 0; j < tufos; j++) itens.push({ x: x + (rnd() - 0.5) * 1.2 * (j > 0), y: y + 0.3, z: z + (rnd() - 0.5) * 1.2 * (j > 0), s: tipo === GRAMA ? 0.55 + rnd() * 0.3 : 0.8 + rnd() * 0.4, tipo, r: rnd() });
      k++; cont[tipo]++;
    }
  }
  // geometrias: tufo de folhas (cone baixo) e três flores (octaedros) no alto dele
  const folhas = new THREE.ConeGeometry(0.13, 0.26, 5).translate(0, 0.13, 0);
  const flor = mergeGeometries([[0, 0.27, 0], [0.07, 0.22, 0.04], [-0.06, 0.24, -0.05]].map(([x, y, z]) => new THREE.OctahedronGeometry(0.055).translate(x, y, z)));
  const n = itens.length;
  const mF = new THREE.InstancedMesh(folhas, new THREE.MeshStandardMaterial({ color: 0x3f6b2a, roughness: 0.9 }), n);
  const mB = new THREE.InstancedMesh(flor, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), n);
  const geoVaso = new THREE.CylinderGeometry(0.42, 0.32, 0.5, 10).translate(0, 0.25, 0);
  const mV = new THREE.InstancedMesh(geoVaso, new THREE.MeshStandardMaterial({ color: 0xa9a092, roughness: 0.9 }), Math.max(1, vasos.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Vector3(), p3 = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  vasos.forEach(([x, y, z], i) => { mV.setMatrixAt(i, m4.compose(p3.set(x, y, z), q.identity(), e.set(1, 1, 1))); });
  for (const m of [mF, mB, mV]) { m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; }
  const grupo = new THREE.Group(); grupo.name = 'flores'; grupo.add(mV, mF, mB); cena.add(grupo);
  // estação: quem aparece (escala 0 esconde) e a cor de cada um; só refaz quando muda o dia
  const cor = new THREE.Color(); let diaAnt = -1;
  function estacao(st) {
    const [a, m, d] = st.data.split('-').map(Number), doy = Math.round((Date.UTC(a, m - 1, d) - Date.UTC(a, 0, 0)) / 86400000);
    if (doy === diaAnt) return; diaAnt = doy;
    const f = FASES.find(([i0, i1]) => doy >= i0 && doy < i1) ?? FASES[0], [i0, i1, pal, vis] = f;
    // borda das fases: as flores abrem e murcham aos poucos (nos primeiros e últimos 8 dias da fase)
    const abre = Math.min(1, (doy - i0) / 8, (i1 - doy) / 8 + (i1 >= 367 ? 1 : 0)), viradaAno = i0 === 0;
    itens.forEach((it, i) => {
      const k = Math.max(0.05, viradaAno ? 1 : 0.35 + 0.65 * Math.max(0, abre));
      const mostra = it.r < vis[it.tipo] * (viradaAno ? 1 : Math.max(0.25, abre));
      const s = mostra ? it.s : 0;
      m4.compose(p3.set(it.x, it.y, it.z), q.setFromAxisAngle(Y, it.r * 40), e.set(s, s * (0.8 + 0.4 * k), s));
      mF.setMatrixAt(i, m4); mB.setMatrixAt(i, m4);
      const p = it.tipo === GRAMA && pal !== FASES[1][2] ? CAMPO : pal;
      mB.setColorAt(i, corPronta(p[Math.floor(((it.r * 7.31) % 1) * p.length)]));
    });
    mF.instanceMatrix.needsUpdate = mB.instanceMatrix.needsUpdate = true; if (mB.instanceColor) mB.instanceColor.needsUpdate = true;
  }
  estacao(ceu.estado());
  ceu.aoMudar(estacao);
  return { grupo, n, vasos: vasos.length };
}
