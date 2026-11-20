// Fachadas procedurais (tarefa 12): janelas em grade, andares, portas e vitrines, pedra e reboco,
// soco, telha com relevo, cumeeira, chaminés e trapeiras. Tudo no shader, sem textura baixada.
//
// O swissBUILDINGS3D é LOD2 (paredes lisas): o UV de parede, os andares e o beiral saem do próprio triângulo,
// aqui no cliente. Cada vértice ganha dois atributos vec4:
//   fa  parede: (u ao longo da parede em m, altura acima do pé da parede em m, comprimento da parede, altura até o beiral)
//       telhado: (y da cumeeira do plano, 1 se o plano toca o topo do prédio, 1 se inclinado, -1)
//   fb  parede: (andares, material + 10 se antigo, loja 0/1/2, semente da parede); telhado: (0, material, 0, 0)
// Do predios.json vêm: and (gastw do GWR), mat (0 reboco, 1 arenito, 2 concreto/vidro), lj (loja no térreo), ano.
//
// Ganchos para outros módulos (ortofoto etc.):
//   ganchos.telhadoCor  corpo GLSL de `vec3 telhadoCor(vec3 base, vec3 mundo)`: recebe a cor de telha do vértice e a
//                       posição no mundo e devolve a cor-base do telhado. Troque ANTES do primeiro render (o shader
//                       compila uma vez). A telha em relevo (uTelhaDetalhe) é multiplicada por cima do resultado.
//   U.uFotoTelhado      0..1 reservado para quem pintar o telhado com a foto aérea (a telha vira só um leve relevo)
//   U.uTelhaDetalhe     0..1 intensidade da telha/relevo e das chaminés; 0 deixa o telhado liso
//   U.uFachada          1 = materiais da fachada (reboco/pedra/concreto), 0 = cor chapada do modo "época"
//   U.uJanelas          0..1 liga e desliga a grade de janelas, portas e vitrines
import * as THREE from 'three';

export const ganchos = { telhadoCor: 'return base;' };

const hash = (i) => { let x = Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
const hash2 = (a, b) => hash(Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663));

export function criarFachadas({ cena, meta, posicoes, ids16, U }) {
  const P = meta.predios, nTris = meta.n_tris, nVert = nTris * 3;
  let fa = new Float32Array(nVert * 4), fb = new Float32Array(nVert * 4); // soltos depois de virar atributo (83 MB)
  const muro = (p) => !p.egid && p.ano == null;
  const velho = (p) => (p.ano ?? 2000) < 1950 ? 1 : 0;

  // ---- 1. agrupa triângulos por plano: paredes (u,v) e telhados (cumeeira) ----
  // tabela de hash própria (endereçamento aberto) para as chaves numéricas: o Map com chaves acima de 2^31 (doubles) era
  // metade do tempo da etapa
  const tabela = (bits) => {
    const n = 1 << bits, mask = n - 1, k = new Float64Array(n), v = new Int32Array(n).fill(-1);
    return {
      get(c) { let i = (Math.imul((c / 65536) | 0, 0x9e3779b1) ^ (c & 0xffff) * 0x85eb) & mask; while (v[i] >= 0) { if (k[i] === c) return v[i]; i = (i + 1) & mask; } return undefined; },
      set(c, x) { let i = (Math.imul((c / 65536) | 0, 0x9e3779b1) ^ (c & 0xffff) * 0x85eb) & mask; while (v[i] >= 0) i = (i + 1) & mask; k[i] = c; v[i] = x; },
    };
  };
  const VIZ = [0, -1, 1, -65536, 65536, -81 * 65536, 81 * 65536]; // d ±0,2 m, nz ±1, nx ±1 (as diagonais custavam 25 ms e quase nada juntavam)
  const bitsTab = Math.max(10, Math.ceil(Math.log2(nTris))); // ~2 triângulos por grupo: carga < 30%
  const paredes = tabela(bitsTab), telhados = tabela(bitsTab);
  const triParede = new Int32Array(nTris).fill(-1);
  const grupos = [], gTelhado = [];
  const triTelhado = new Int32Array(nTris).fill(-1);
  const bTopo = new Float32Array(P.length).fill(-1e9);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  // chave numérica (era uma string por triângulo: ~60% do tempo da etapa); mesma conta do Vector3 (cross, normalize),
  // então os mesmos grupos na mesma ordem. id < 2^14, cada componente arredondado cabe em 7 bits, d em 16: < 2^53
  for (let t = 0; t < nTris; t++) {
    const o = t * 9;
    const ax = posicoes[o], ay = posicoes[o + 1], az = posicoes[o + 2];
    const ux = posicoes[o + 3] - ax, uy = posicoes[o + 4] - ay, uz = posicoes[o + 5] - az;
    const vx = posicoes[o + 6] - ax, vy = posicoes[o + 7] - ay, vz = posicoes[o + 8] - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz), area = len / 2;
    if (area < 1e-4) continue;
    const inv = 1 / len; nx *= inv; ny *= inv; nz *= inv;
    const id = ids16[t * 3];
    if (Math.abs(ny) <= 0.35) {
      const h = Math.hypot(nx, nz), tx = -nz / h, tz = nx / h;
      const d = nx * ax + nz * az;
      const chave = ((id * 81 + Math.round(nx * 40) + 40) * 81 + Math.round(nz * 40) + 40) * 65536 + Math.round(d * 5) + 32768;
      // parede quase plana partida entre baldes vizinhos (normal a ±1,4°, d a ±0,2 m): junta com o vizinho que já existe,
      // senão cada pedaço tinha comprimento e beiral próprios e triângulos inteiros ficavam sem janela
      let gi = paredes.get(chave);
      for (let i = 1; gi === undefined && i < VIZ.length; i++) gi = paredes.get(chave + VIZ[i]);
      if (gi === undefined) {
        gi = grupos.length; paredes.set(chave, gi);
        grupos.push({ id, tx, tz, umin: 1e9, umax: -1e9, ymin: 1e9, ymax: -1e9, tris: [] });
      }
      const g = grupos[gi];
      g.tris.push(t); triParede[t] = gi;
      for (let k = 0; k < 3; k++) {
        const u = posicoes[o + k * 3] * tx + posicoes[o + k * 3 + 2] * tz, y = posicoes[o + k * 3 + 1];
        if (u < g.umin) g.umin = u; if (u > g.umax) g.umax = u; if (y < g.ymin) g.ymin = y; if (y > g.ymax) g.ymax = y;
      }
    } else {
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const d = nx * ax + ny * ay + nz * az;
      const chave = (((id * 61 + Math.round(nx * 30) + 30) * 31 + Math.round(ny * 30)) * 61 + Math.round(nz * 30) + 30) * 65536 + Math.round(d * 3) + 32768;
      let gi = telhados.get(chave);
      if (gi === undefined) {
        gi = gTelhado.length; telhados.set(chave, gi);
        gTelhado.push({ id, ny, nx, nz, ymax: -1e9, area: 0, tris: [] });
      }
      const g = gTelhado[gi];
      g.tris.push(t); g.area += area; triTelhado[t] = gi;
      const ym = Math.max(ay, posicoes[o + 4], posicoes[o + 7]);
      if (ym > g.ymax) g.ymax = ym;
      if (ym > bTopo[id]) bTopo[id] = ym;
    }
  }

  // ---- 2. por parede: comprimento, beiral (aresta horizontal mais alta que cruza a parede) e andares ----
  // beiral: a cota (em dm) mais alta cuja faixa de vértices cobre metade da parede; cotas distintas são poucas por parede,
  // então busca linear em arrays reaproveitados (era um Map, um spread e um sort por parede)
  const fotoMax = new Map(); // EGID → { direção, u mínimo e máximo } da fachada lida de foto
  let yk = new Int32Array(64), umn = new Float64Array(64), umx = new Float64Array(64);
  for (const g of grupos) {
    const len = g.umax - g.umin;
    let m = 0;
    for (const t of g.tris) for (let k = 0; k < 3; k++) {
      const u = posicoes[t * 9 + k * 3] * g.tx + posicoes[t * 9 + k * 3 + 2] * g.tz, y = Math.round(posicoes[t * 9 + k * 3 + 1] * 10);
      let j = 0;
      while (j < m && yk[j] !== y) j++;
      if (j === m) {
        if (m === yk.length) { const n2 = m * 2; const y2 = new Int32Array(n2), a2 = new Float64Array(n2), b2 = new Float64Array(n2); y2.set(yk); a2.set(umn); b2.set(umx); yk = y2; umn = a2; umx = b2; }
        yk[m] = y; umn[m] = 1e9; umx[m] = -1e9; m++;
      }
      if (u < umn[j]) umn[j] = u; if (u > umx[j]) umx[j] = u;
    }
    let eave = g.ymax, melhor = -Infinity;
    // a faixa de cada cota junta os vértices até 0,5 m abaixo dela: os cantos de uma empena a 15,8 e 16,2 m são o mesmo beiral
    for (let j = 0; j < m; j++) {
      if (yk[j] <= melhor) continue;
      let a = umn[j], b = umx[j];
      for (let k = 0; k < m; k++) if (yk[k] < yk[j] && yk[k] >= yk[j] - 5) { if (umn[k] < a) a = umn[k]; if (umx[k] > b) b = umx[k]; }
      if (b - a >= 0.5 * len) melhor = yk[j];
    }
    if (melhor > -Infinity) eave = melhor / 10;
    const hW = Math.max(1, eave - g.ymin);
    const p = P[g.id];
    let nF = p.and > 0 ? p.and : Math.round(hW / 3.1);
    nF = Math.max(1, Math.min(nF, 40));
    if (!p.andFoto && hW / nF < 2.5) nF = Math.max(1, Math.round(hW / 2.9)); // andares lidos de foto valem como estão
    if (!p.andFoto && hW / nF > 4.6) nF = Math.max(1, Math.round(hW / 4.0));
    g.len = len; g.hW = hW; g.nF = nF;
    g.seed = hash(g.id * 977 + Math.round(g.umin * 3) + Math.round(g.ymin));
    // sem registro no GWR (sem EGID nem ano): muro, cais ou terraço do swissBUILDINGS3D (o muro da Pfalz sob o
    // Münster é o caso clássico), não prédio: pedra de cantaria e nenhuma janela, porta ou vitrine (material 3)
    g.mat = (muro(p) ? 3 : (p.mat ?? 0)) + 10 * velho(p);
    g.loja = muro(p) ? 0 : (p.lj ?? 0);
    // lido de foto (retoques.json, script/fachadas_reno.py): janelas por andar e cor das venezianas na fachada virada para
    // `frente` (graus, 0 = norte, 90 = leste); empacotado em fb.z junto com a loja: loja + 10·janelas + 1000·(cor RGB 4+4+4 bits + 1)
    if (p.frente != null && (p.jan || p.ven)) {
      const az = Math.atan2(g.tz, g.tx) * 180 / Math.PI; // normal para fora = (tz, −tx): az = atan2(nx, −nz), 0 = −z (norte), 90 = +x (leste)
      const dif = Math.abs(((az - p.frente) % 360 + 540) % 360 - 180);
      if (dif < 35) {
        g.jan = Math.min(60, p.jan ?? 0); // colunas na largura da fachada inteira (grade comum, abaixo)
        if (g.jan) {
          // largura da fachada do prédio (EGID: o swissBUILDINGS3D parte um prédio em vários sólidos), na direção desta parede
          const k = p.egid ?? -g.id - 1, f = fotoMax.get(k) ?? { tx: g.tx, tz: g.tz, a: Infinity, b: -Infinity };
          for (const t of g.tris) for (let q = 0; q < 3; q++) {
            const u = posicoes[t * 9 + q * 3] * f.tx + posicoes[t * 9 + q * 3 + 2] * f.tz;
            if (u < f.a) f.a = u; if (u > f.b) f.b = u;
          }
          fotoMax.set(k, f); g.fotoK = k;
        }
        if (p.ven) { const c = new THREE.Color(p.ven); g.ven = 1 + (Math.round(c.r * 15) << 8 | Math.round(c.g * 15) << 4 | Math.round(c.b * 15)); }
        // tamanho da janela medido na foto (jw: largura / coluna, jh: altura / andar), em passos de 0,05; vai em fb.w = semente + 2·código
        if (p.jw && p.jh) g.jdim = 1 + Math.round(Math.min(1, p.jw) * 20) + 21 * Math.round(Math.min(1, p.jh) * 20);
      }
    }
  }
  // a fachada lida de foto vem partida em pedaços e sólidos (o Reischacherhof somava 45 colunas para 10 eixos): todos os
  // pedaços usam uma grade só, com u a partir da borda da fachada inteira e as `jan` colunas da foto na largura toda
  for (let t = 0; t < nTris; t++) {
    const gi = triParede[t];
    if (gi >= 0) {
      const g = grupos[gi];
      for (let k = 0; k < 3; k++) {
        const v = (t * 3 + k) * 4;
        const f = g.jan ? fotoMax.get(g.fotoK) : null;
        fa[v] = f ? posicoes[t * 9 + k * 3] * f.tx + posicoes[t * 9 + k * 3 + 2] * f.tz - f.a : posicoes[t * 9 + k * 3] * g.tx + posicoes[t * 9 + k * 3 + 2] * g.tz - g.umin;
        fa[v + 1] = posicoes[t * 9 + k * 3 + 1] - g.ymin; fa[v + 2] = f ? Math.max(g.len, f.b - f.a) : g.len; fa[v + 3] = g.hW;
        fb[v] = g.nF; fb[v + 1] = g.mat; fb[v + 2] = g.loja + 10 * (g.jan ?? 0) + 1000 * (g.ven ?? 0); fb[v + 3] = g.seed + 2 * (g.jdim ?? 0);
      }
      continue;
    }
    const ri = triTelhado[t];
    if (ri >= 0) {
      const g = gTelhado[ri], p = P[g.id];
      const inclinado = g.ny < 0.97 ? 1 : 0;
      const cumeeira = inclinado && g.ymax >= bTopo[g.id] - 0.6 ? 1 : 0;
      for (let k = 0; k < 3; k++) {
        const v = (t * 3 + k) * 4;
        fa[v] = g.ymax; fa[v + 1] = cumeeira; fa[v + 2] = inclinado; fa[v + 3] = -1;
        fb[v + 1] = (p.mat ?? 0) + 10 * velho(p);
      }
    }
  }

  // ---- 3. chaminés e trapeiras sobre os telhados inclinados ----
  const chamines = [], trapeiras = [];
  const porPredio = new Map();
  gTelhado.forEach((g) => { if (g.ny < 0.92 && g.ny > 0.3 && g.area > 6) { (porPredio.get(g.id) ?? porPredio.set(g.id, []).get(g.id)).push(g); } });
  const pontoNoPlano = (g, sorteio, encolhe) => {
    // triângulo sorteado por área; ponto perto do centroide (para não cair na borda)
    let alvo = sorteio(0) * g.area, ti = g.tris[0];
    for (const t of g.tris) { const o = t * 9; a.fromArray(posicoes, o); b.fromArray(posicoes, o + 3); c.fromArray(posicoes, o + 6); const ar = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2; alvo -= ar; ti = t; if (alvo <= 0) break; }
    const o = ti * 9; a.fromArray(posicoes, o); b.fromArray(posicoes, o + 3); c.fromArray(posicoes, o + 6);
    const cen = a.clone().add(b).add(c).divideScalar(3);
    const r1 = sorteio(1), r2 = sorteio(2);
    const s = r1 + r2 > 1 ? 1 : 0, u = s ? 1 - r1 : r1, v = s ? 1 - r2 : r2;
    const q = a.clone().multiplyScalar(1 - u - v).add(b.clone().multiplyScalar(u)).add(c.clone().multiplyScalar(v));
    return q.lerp(cen, encolhe);
  };
  for (const [id, gs] of porPredio) {
    const p = P[id];
    if ((p.mat ?? 0) === 2 || muro(p)) continue; // concreto e vidro: telhado quase sempre plano; muro: sem telhado
    const sorteio = (k) => hash2(id * 31 + 7, k);
    gs.sort((x, y) => y.ymax - x.ymax);
    const alto = gs[0];
    const topo = bTopo[id];
    const q = pontoNoPlano(alto, (k) => hash2(id * 131 + 3, k), 0.45);
    chamines.push({ x: q.x, y: q.y, z: q.z, topo: Math.min(topo + 0.9 + hash(id) * 0.5, q.y + 2.4 + hash(id) * 0.8), id, cor: hash(id + 5) });
    const grande = gs.filter((g) => g.area > 22);
    const nT = Math.min(3, Math.floor(grande.reduce((s, g) => s + g.area, 0) / 90));
    for (let k = 0; k < nT; k++) {
      const g = grande[Math.floor(hash2(id, k + 40) * grande.length)];
      if (g.ny > 0.86) continue;
      const q2 = pontoNoPlano(g, (j) => hash2(id * 17 + k, j + 90), 0.5);
      trapeiras.push({ x: q2.x, y: q2.y, z: q2.z, fx: g.nx, fz: g.nz, id, cor: hash2(id, k) });
    }
  }

  const corTelhaDe = (id) => P[id].telha ? new THREE.Color(P[id].telha).getHex() : P[id].ano > 1945 ? 0x8c8578 : [0x9c4f35, 0x8e4a33, 0xa85d3d, 0x7f4636, 0x6e5a4e][Math.floor(hash(id) * 5)];
  const instancias = [];
  const matInst = (chop) => {
    const m = chop ? new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }) : new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    m.onBeforeCompile = (s) => {
      s.uniforms.uTelhaDetalhe = U.uTelhaDetalhe;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTelhaDetalhe;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  if (uTelhaDetalhe < 0.5) transformed = vec3(0.0);');
    };
    return m;
  };
  const caixa = (pos, col, x0, x1, y0, y1, z0, z1, cor) => {
    const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    for (const f of [[4, 5, 6, 7], [1, 0, 3, 2], [5, 1, 2, 6], [0, 4, 7, 3], [7, 6, 2, 3], [0, 1, 5, 4]]) {
      for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...v[f[k]]); col.push(cor.r, cor.g, cor.b); }
    }
  };
  // chaminé: caixa de 0,7 m com boné; escala em y no instanciamento (a base afunda 1,2 m no telhado)
  {
    const pos = [], col = [];
    caixa(pos, col, -0.36, 0.36, 0, 0.92, -0.36, 0.36, new THREE.Color('#8b6a57'));
    caixa(pos, col, -0.46, 0.46, 0.92, 1.0, -0.46, 0.46, new THREE.Color('#6e655c'));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    instancias.push({ lista: chamines, geo: g, cor: () => new THREE.Color(1, 1, 1), matriz: (d, m) => {
      const base = d.y - 1.2, alt = Math.max(1.4, d.topo - base);
      m.makeScale(1, alt, 1).setPosition(d.x, base, d.z);
    } });
  }
  // trapeira: caixa com janela escura e telhado de duas águas
  {
    const pos = [], col = [];
    caixa(pos, col, -0.8, 0.8, -0.9, 1.0, -1.7, 0.0, new THREE.Color('#efe6d2'));
    caixa(pos, col, -0.38, 0.38, 0.12, 0.88, -0.02, 0.03, new THREE.Color('#33424d'));
    const tel = new THREE.Color('#8e4a33');
    const T = (p0, p1, p2, cc) => { pos.push(...p0, ...p1, ...p2); for (let i = 0; i < 3; i++) col.push(cc.r, cc.g, cc.b); };
    const xa = -0.95, xb = 0.95, zf = 0.1, zb = -1.8, yb = 1.0, yc = 1.75;
    T([xa, yb, zf], [xb, yb, zf], [0, yc, zf], new THREE.Color('#efe6d2'));
    T([xb, yb, zb], [xa, yb, zb], [0, yc, zb], new THREE.Color('#efe6d2'));
    for (const [p0, p1, p2, p3] of [[[xa, yb, zf], [0, yc, zf], [0, yc, zb], [xa, yb, zb]], [[xb, yb, zb], [0, yc, zb], [0, yc, zf], [xb, yb, zf]]]) {
      T(p0, p1, p2, tel); T(p0, p2, p3, tel);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    instancias.push({ lista: trapeiras, geo: g, cor: (d) => new THREE.Color(corTelhaDe(d.id)).lerp(new THREE.Color(1, 1, 1), 0.65 + 0.35 * 0), matriz: (d, m) => {
      q.setFromAxisAngle(up, Math.atan2(d.fx, d.fz));
      p.set(d.x, d.y - 0.35, d.z);
      m.compose(p, q, s);
    } });
  }
  const malhas = instancias.map(({ lista, geo, cor, matriz }) => {
    const mesh = new THREE.InstancedMesh(geo, matInst(false), lista.length);
    const m = new THREE.Matrix4();
    lista.forEach((d, i) => { matriz(d, m); mesh.setMatrixAt(i, m); mesh.setColorAt(i, cor(d)); });
    mesh.customDepthMaterial = matInst(true);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    cena.add(mesh);
    return mesh;
  });

  // ---- 4. atributos e shader ----
  const atributos = { fa: new THREE.BufferAttribute(fa, 4), fb: new THREE.BufferAttribute(fb, 4) };
  fa = fb = null; // o atributo segura o array até subir para a GPU (cidade.js, soltarAposSubir)
  Object.assign(U, {
    uFachada: { value: 1 }, uJanelas: { value: 1 }, uTelhaDetalhe: { value: 1 }, uFotoTelhado: { value: 0 },
  });

  const GLSL_FUNCOES = `
float fh21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fhn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fh21(i), fh21(i + vec2(1, 0)), f.x), mix(fh21(i + vec2(0, 1)), fh21(i + vec2(1, 1)), f.x), f.y); }
vec3 telhadoCor(vec3 base, vec3 mundo) { ${ganchos.telhadoCor} }`;

  const GLSL_COR = `#include <color_fragment>
  float fachJan = 0.0, fachAcesa = 0.0, fachH = 0.0, fachBump = 0.0;
  if (uJanelas > 0.5 || uTelhaDetalhe > 0.01) {
    float vPred = fh21(vec2(vPidF, 3.7));
    if (vFa.w < -0.5) {
      // ---- telhado ----
      vec3 nW = normalize(cross(dFdx(vMundo), dFdy(vMundo)));
      if (nW.y < 0.0) nW = -nW;
      vec3 base = telhadoCor(diffuseColor.rgb, vMundo);
      if (vFa.z > 0.5) {
        vec3 dn = normalize(vec3(nW.x, -(nW.x * nW.x + nW.z * nW.z) / max(nW.y, 0.05), nW.z));
        vec3 tr = cross(nW, dn);
        float s = dot(vMundo, dn) / 0.30, tt = dot(vMundo, tr) / 0.20;
        float lin = fwidth(s) * 0.30;
        float fade = (1.0 - smoothstep(0.07, 0.24, lin)) * uTelhaDetalhe;
        float row = floor(s), fr = s - row;
        float col = floor(tt + 0.5 * mod(row, 2.0)), fc = fract(tt + 0.5 * mod(row, 2.0));
        float tom = 0.80 + 0.34 * fh21(vec2(col, row) + vPred * 91.0);
        float lip = smoothstep(0.0, 0.85, fr) * (1.0 - 0.45 * pow(abs(fc - 0.5) * 2.0, 3.0));
        float sombra = mix(0.72, 1.0, smoothstep(0.0, 0.2, fr));
        float musgo = 0.92 + 0.16 * fhn(vMundo.xz * 0.35);
        base *= mix(1.0, tom * sombra * (0.88 + 0.2 * lip) * musgo, fade * (1.0 - 0.6 * uFotoTelhado));
        if (vFa.y > 0.5) {
          float dy = vFa.x - vMundo.y;
          float cap = 1.0 - smoothstep(0.10, 0.20, dy);
          base = mix(base, base * vec3(0.66, 0.62, 0.6), cap);
          base += vec3(0.05) * (1.0 - smoothstep(0.0, 0.06, dy)) * cap;
        }
        fachH = lip * fade; fachBump = 0.55;
      } else {
        // telhado plano: cascalho/impermeabilização
        float lin = fwidth(vMundo.x) + fwidth(vMundo.z);
        float fade = (1.0 - smoothstep(0.1, 0.4, lin)) * uTelhaDetalhe;
        base *= mix(1.0, 0.9 + 0.14 * fh21(floor(vMundo.xz * 7.0)), fade);
      }
      diffuseColor.rgb = base;
    } else if (vFa.z > 0.5 && uJanelas > 0.5) {
      // ---- parede ----
      float u = vFa.x, v = vFa.y, len = vFa.z, hW = vFa.w, nF = vFb.x, jdim = floor(vFb.w / 2.0), wseed = vFb.w - 2.0 * jdim;
      float mat = mod(vFb.y, 10.0), antigo = step(9.5, vFb.y), loja = mod(vFb.z, 10.0);
      float janFoto = mod(floor(vFb.z / 10.0), 100.0), venFoto = floor(vFb.z / 1000.0); // lidos de foto (0 = procedural)
      vec3 venCor = vec3(floor((venFoto - 1.0) / 256.0), mod(floor((venFoto - 1.0) / 16.0), 16.0), mod(venFoto - 1.0, 16.0)) / 15.0;
      float lw = max(fwidth(u), fwidth(v));            // metros por pixel
      vec3 parede = diffuseColor.rgb;
      // material
      if (uFachada > 0.5) {
        if (mat > 0.5 && mat < 1.5) {
          float rowB = floor(v / 0.42); float bu = u / 0.9 + 0.5 * mod(rowB, 2.0) + wseed * 7.0;
          float jx = smoothstep(0.0, 0.05, fract(bu)) * smoothstep(1.0, 0.95, fract(bu)), jy = smoothstep(0.0, 0.08, fract(v / 0.42));
          float f = 1.0 - smoothstep(0.12, 0.4, lw / 0.42);
          vec3 pedra = vec3(0.64, 0.36, 0.28) * (0.86 + 0.28 * fh21(vec2(floor(bu), rowB) + vPred * 37.0));
          parede = mix(vec3(0.60, 0.36, 0.29), pedra * mix(0.68, 1.0, jx * jy), f);
          fachH = mix(0.0, jx * jy, f); fachBump = 0.35;
        } else if (mat > 2.5) {
          // muro de cantaria (Pfalz, cais, terraços): blocos grandes de arenito acinzentado, juntas fundas, manchas de umidade
          float rowB = floor(v / 0.55); float bu = u / 1.3 + 0.5 * mod(rowB, 2.0) + wseed * 5.0;
          float jx = smoothstep(0.0, 0.04, fract(bu)) * smoothstep(1.0, 0.96, fract(bu)), jy = smoothstep(0.0, 0.07, fract(v / 0.55));
          float f = 1.0 - smoothstep(0.12, 0.45, lw / 0.55);
          vec3 pedra = vec3(0.58, 0.52, 0.46) * (0.82 + 0.3 * fh21(vec2(floor(bu), rowB) + vPred * 23.0));
          pedra *= 1.0 - 0.18 * smoothstep(0.55, 0.9, fhn(vec2(u * 0.15, v * 0.5) + wseed * 9.0)); // escorrido de umidade
          parede = mix(vec3(0.55, 0.50, 0.45), pedra * mix(0.62, 1.0, jx * jy), f);
          fachH = mix(0.0, jx * jy, f); fachBump = 0.45;
        } else if (mat > 1.5) {
          float pj = smoothstep(0.0, 0.025, fract(u / 2.4)) * smoothstep(0.0, 0.025, fract(v / 3.1));
          parede = mix(vec3(0.70, 0.69, 0.66), vec3(0.63, 0.64, 0.64), vPred) * mix(0.92, 1.0, mix(1.0, pj, 1.0 - smoothstep(0.2, 0.7, lw)));
        } else {
          float f = 1.0 - smoothstep(0.1, 0.35, lw);
          parede *= 1.0 + f * (0.05 * (fhn(vec2(u, v) * 3.0) - 0.5) + 0.07 * (fhn(vec2(u, v) * 0.8 + wseed * 40.0) - 0.5));
        }
        // sujeira perto do chão e sombra sob o beiral
        parede *= mix(0.80, 1.0, smoothstep(0.0, 1.6, v)) * mix(0.9, 1.0, smoothstep(0.0, 0.5, hW - v));
      }
      if (len > 1.3 && v < hW + 0.01 && mat < 2.5) {
        float cols = janFoto > 0.5 ? janFoto : max(1.0, floor(len / (2.5 + 1.3 * vPred) + 0.5));
        float cw = len / cols, cu = u / cw, ci = clamp(floor(cu), 0.0, cols - 1.0), fu = cu - ci;
        float fh = hW / max(nF, 1.0), cv = v / fh, ri = floor(cv), fv = cv - ri;
        float dist = 1.0 - smoothstep(0.15, 0.6, lw);     // 1 perto, 0 longe (começava a 0,30 m/px: janelas de 3 px cintilavam)
        float fino = 1.0 - smoothstep(0.02, 0.06, lw);    // detalhes de 3–7 cm (cruz, moldura, ripas) só quando cabem num pixel
        vec3 cJan = vec3(0.0); float tem = 0.0; float vidro = 0.0;
        float x0 = 0.5 - mix(0.20, 0.30, fh21(vec2(vPidF, 11.0))), y0 = mix(0.2, 0.3, fh21(vec2(vPidF, 12.0))), wH = mix(0.5, 0.6, fh21(vec2(vPidF, 13.0)));
        if (mat > 1.5) { x0 = 0.04; y0 = 0.27; wH = 0.46; }
        if (jdim > 0.5) { // medido na foto
          float jw = mod(jdim - 1.0, 21.0) / 20.0, jh = floor((jdim - 1.0) / 21.0) / 20.0;
          x0 = 0.5 - 0.5 * jw; wH = jh; y0 = clamp(0.45 * (1.0 - jh), 0.1, 0.3);
        }
        float soco = antigo * (1.0 - step(0.62, v));
        float sorteioC = fh21(vec2(ci, ri) + wseed * 53.0 + vPidF);
        float ehPorta = (ri < 0.5 && loja < 0.5 && ci == floor(fh21(vec2(wseed, vPidF)) * cols) && len > 3.2) ? 1.0 : 0.0;
        if (ri < 0.5 && loja > 0.5 && len > 3.0) {
          // vitrine no térreo: pilar, janela larga, faixa do letreiro
          float inV = step(0.07, fu) * step(fu, 0.93) * step(0.14, fv) * step(fv, 0.74);
          float letr = step(0.78, fv) * step(fv, 0.97) * step(0.04, fu) * step(fu, 0.96);
          vec3 cart = vec3(0.30, 0.17, 0.12);
          vec3 letrCor = mix(mix(vec3(0.17, 0.26, 0.20), vec3(0.22, 0.24, 0.30), fh21(vec2(wseed, 1.0))), vec3(0.45, 0.14, 0.12), step(0.7, fh21(vec2(wseed, 2.0))));
          cJan = inV > 0.5 ? mix(vec3(0.34, 0.30, 0.25), vec3(0.15, 0.18, 0.2), smoothstep(0.1, 0.5, fv)) : letrCor;
          tem = max(inV, letr * 0.9); vidro = inV;
          if (inV > 0.5 && fract(fu * 3.0 + 0.5) < 0.04 && fino > 0.5) cJan = cart;
        } else if (ehPorta > 0.5) {
          float inP = step(0.3, fu) * step(fu, 0.7) * step(fv, 0.74);
          vec3 cp = mix(vec3(0.27, 0.17, 0.11), vec3(0.17, 0.28, 0.20), step(0.5, fh21(vec2(vPidF, 21.0))));
          cJan = cp * (0.9 + 0.2 * smoothstep(0.38, 0.4, abs(fu - 0.5) * 2.0)); tem = inP;
          if (inP > 0.5 && fv > 0.5 && fv < 0.68 && abs(fu - 0.5) < 0.17) { cJan = vec3(0.16, 0.2, 0.24); vidro = 0.5; }
        } else if (ri < nF - 0.5 || nF < 1.5) {
          float yy = ri < 0.5 ? y0 + 0.1 : y0;
          float inW = step(x0, fu) * step(fu, 1.0 - x0) * step(yy, fv) * step(fv, yy + wH);
          float borda = 0.045 / max(0.6, 1.0);
          float inG = mix(inW, step(x0 + borda, fu) * step(fu, 1.0 - x0 - borda) * step(yy + 0.04, fv) * step(fv, yy + wH - 0.04), fino);
          vec3 ceu = mix(vec3(0.22, 0.30, 0.36), vec3(0.58, 0.68, 0.74), smoothstep(0.0, 1.0, fv - yy));
          vec3 vid = ceu * (0.75 + 0.4 * sorteioC);
          // cortina clara na metade de baixo de parte das janelas (casas, não escritórios)
          if (mat < 1.5 && sorteioC < 0.28) vid = mix(vid, vec3(0.86, 0.84, 0.79), step(fv, yy + wH * 0.55) * 0.75 * dist);
          // caixilho: branco, creme, cinza ou (casas antigas) verde-escuro e marrom, sorteado por prédio
          float kc = fh21(vec2(vPidF, 41.0));
          vec3 mold = mat > 1.5 ? vec3(0.28, 0.29, 0.30)
            : kc < 0.55 ? vec3(0.93, 0.91, 0.86) : kc < 0.75 ? vec3(0.86, 0.80, 0.66) : kc < 0.87 || antigo < 0.5 ? vec3(0.62, 0.62, 0.60)
            : kc < 0.94 ? vec3(0.20, 0.30, 0.22) : vec3(0.33, 0.22, 0.15);
          float cruz = (mat > 1.5 ? step(abs(fu - 0.5), 0.012) : step(abs(fu - 0.5), 0.02)) * step(0.5, fino);
          cJan = inG > 0.5 ? (cruz > 0.5 ? mold : vid) : mold;
          tem = inW; vidro = inG * (1.0 - cruz);
          // peitoril em pedra
          float peit = step(yy - 0.05, fv) * step(fv, yy) * step(x0 - 0.04, fu) * step(fu, 1.0 - x0 + 0.04) * step(0.5, fino);
          if (peit > 0.5 && tem < 0.5) { cJan = vec3(0.80, 0.77, 0.71); tem = 1.0; }
          // persianas: só em reboco antigo, sorteadas por prédio
          if (mat < 0.5 && (venFoto > 0.5 || (antigo > 0.5 && fh21(vec2(vPidF, 31.0)) > 0.42)) && tem < 0.5) {
            float inS = (step(x0 - 0.17, fu) * step(fu, x0 - 0.01) + step(1.0 - x0 + 0.01, fu) * step(fu, 1.0 - x0 + 0.17)) * step(yy, fv) * step(fv, yy + wH);
            if (inS > 0.5) {
              float k = fh21(vec2(vPidF, 32.0));
              vec3 cs = venFoto > 0.5 ? venCor : k < 0.3 ? vec3(0.22, 0.38, 0.26) : k < 0.55 ? vec3(0.50, 0.55, 0.52) : k < 0.8 ? vec3(0.44, 0.47, 0.50) : vec3(0.42, 0.20, 0.16);
              cs *= 1.0 - 0.18 * smoothstep(0.35, 0.65, abs(fract(fv * fh / 0.07) - 0.5)) * fino;
              cJan = cs; tem = 1.0;
            }
            // algumas fechadas: as duas folhas sobre o vidro
            if (fh21(vec2(ci, ri) + vPidF * 3.1) > 0.82 && inW > 0.5) {
              float k = fh21(vec2(vPidF, 32.0));
              vec3 cs = venFoto > 0.5 ? venCor : k < 0.3 ? vec3(0.22, 0.38, 0.26) : k < 0.55 ? vec3(0.50, 0.55, 0.52) : k < 0.8 ? vec3(0.44, 0.47, 0.50) : vec3(0.42, 0.20, 0.16);
              cs *= 1.0 - 0.18 * smoothstep(0.35, 0.65, abs(fract(fv * fh / 0.07) - 0.5)) * fino;
              cJan = mix(cs, cs * 0.7, step(abs(fu - 0.5), 0.008)); vidro = 0.0;
            }
          }
          // escorrido de chuva sob o peitoril: listras verticais mais escuras que somem para baixo
          if (tem < 0.5 && ri > 0.5 && fu > x0 && fu < 1.0 - x0 && fv < yy) {
            float esc = (1.0 - smoothstep(0.0, 0.45, yy - fv)) * smoothstep(0.35, 0.8, fhn(vec2(u * 14.0, v * 0.7) + wseed * 3.0));
            parede *= 1.0 - 0.13 * esc * (1.0 - smoothstep(0.03, 0.08, lw));
          }
        }
        if (soco > 0.5) {
          float rb = floor(v / 0.3), bj = u / 0.7 + 0.5 * mod(rb, 2.0);
          float j = smoothstep(0.0, 0.07, fract(bj)) * smoothstep(0.0, 0.1, fract(v / 0.3));
          cJan = vec3(0.54, 0.50, 0.45) * mix(0.8, 1.0, j) * (0.9 + 0.2 * fh21(vec2(floor(bj), rb))); tem = 1.0; vidro = 0.0;
        }
        // escorrido sob o beiral (o telhado pinga na parede): faixa irregular mais escura no alto
        if (mat < 2.5) parede *= 1.0 - 0.10 * (1.0 - smoothstep(0.0, 1.4, hW - v)) * smoothstep(0.3, 0.7, fhn(vec2(u * 3.0, 1.0) + wseed));
        // lintel/cordão entre andares nas casas de reboco
        if (mat < 0.5 && fv < 0.035 && ri > 0.5 && tem < 0.5) parede *= 0.93;
        // cor por distância: de longe a janela vira uma média escura
        float media = mix(1.0, 0.82, 0.5);
        vec3 saida = mix(parede, cJan, tem * (0.35 + 0.65 * dist));
        if (tem > 0.5 && dist < 0.5) saida = mix(parede * 0.84, saida, dist * 2.0);
        diffuseColor.rgb = saida;
        fachJan = vidro;
        if (tem > 0.5 && soco < 0.5) fachBump = 0.0;
        fachAcesa = step(loja > 0.5 && ri < 0.5 ? 0.15 : 0.55, fh21(vec2(ci, ri) + vPidF * 0.618 + wseed * 3.1));
      } else {
        diffuseColor.rgb = parede;
      }
    }
  }`;

  const GLSL_BUMP = `#include <normal_fragment_maps>
  if (fachBump > 0.0) {
    vec3 sx = normalize(dFdx(-vViewPosition)), sy = normalize(dFdy(-vViewPosition));
    vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
    float det = dot(sx, r1);
    vec2 dh = vec2(dFdx(fachH), dFdy(fachH)) * fachBump;
    normal = normalize(abs(det) * normal - sign(det) * (dh.x * r1 + dh.y * r2));
  }`;

  const GLSL_NOITE = `#include <emissivemap_fragment>
  if (uNoite > 0.01 && fachJan > 0.0) {
    totalEmissiveRadiance += vec3(1.0, 0.72, 0.38) * fachJan * fachAcesa * uNoite * 1.5 * (1.0 - uApagao); // Morgestraich: tudo apagado
  }`;

  return {
    atributos, malhas, ganchos, stats: { paredes: grupos.length, telhados: gTelhado.length, chamines: chamines.length, trapeiras: trapeiras.length },
    // chamado de dentro do onBeforeCompile do material dos prédios (depois de injetar do cidade.js)
    injetar(shader) {
      shader.uniforms.uFachada = U.uFachada; shader.uniforms.uJanelas = U.uJanelas;
      shader.uniforms.uTelhaDetalhe = U.uTelhaDetalhe; shader.uniforms.uFotoTelhado = U.uFotoTelhado;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 fa; attribute vec4 fb; varying vec4 vFa; flat varying vec4 vFb; flat varying float vPidF;')
        .replace('#include <project_vertex>', 'vFa = fa; vFb = fb; vPidF = pid;\n#include <project_vertex>');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec4 vFa; flat varying vec4 vFb; flat varying float vPidF; uniform float uFachada; uniform float uJanelas; uniform float uTelhaDetalhe; uniform float uFotoTelhado;\n${GLSL_FUNCOES}`)
        .replace('#include <color_fragment>', GLSL_COR)
        .replace('#include <normal_fragment_maps>', GLSL_BUMP)
        // a grade de janelas acesas antiga (2,7 x 3,2 m) dá lugar à grade real das fachadas
        .replace('if (uNoite > 0.01 && vEstado < 0.5) {', 'if (false) {')
        .replace('#include <emissivemap_fragment>', GLSL_NOITE);
    },
  };
}
