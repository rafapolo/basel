// Chão e ruas (tarefa 15): relevo swissALTI3D 0,5 m em malha adaptativa (terreno.v2.bin), ruas como áreas
// (ruas_a.webp / ruas_b.webp, rasterizadas por script/chao.py), pintadas no shader do chão por cima da ortofoto:
// paralelepípedo, asfalto com marca de faixa, calçada de lajes, oclusão falsa junto às fachadas e desgaste
// procedural (rugosidade com ruído, como na simulação do atlas do tocador, design/realismo-tocador-sim.md).
// Também: meio-fio em relevo, trilhos de bonde (bitola de 1 m), fio aéreo e postes.
// criarChao(THREE, { meta, ruas, orto, nivelReno }) -> { malha, altura, grupo, ruas(on) }
import { decodifica, baixaBin } from './compacta.js';
import { injetarSombra } from './nuvens.js';

// cota da ponta de uma ponte do OSM: a ponta costuma cair na beira do cais, onde o relevo já despenca para o rio
// (a calçada de montante da Mittlere Brücke começava a 2,2 m, rente à água). Vale o maior entre a ponta e o chão
// 2 m para fora, na direção do caminho. (x, z) = ponta; (xi, zi) = o ponto vizinho, para dentro da ponte.
export function cotaPonta(altura, x, z, xi, zi) {
  const dx = x - xi, dz = z - zi, L = Math.hypot(dx, dz) || 1;
  return Math.max(altura(x, z), altura(x + (dx / L) * 2, z + (dz / L) * 2));
}

export async function criarChao(THREE, { meta, ruas, orto, nivelReno, ajuste, base = 'data/' }) {
  const T = meta.terreno;
  // terreno.v2.bin (script/compacta.py): mesmos vértices e triângulos do terreno.bin.gz, em ~55% dos bytes
  const { cols, idx } = decodifica(await baixaBin(base + 'terreno.v2.bin'), 3, 3);
  const nv = cols[0].length, nt = idx.length / 3;
  const [col, lin, hh] = cols.map((c) => new Uint16Array(c.buffer));
  const pos = new Float32Array(nv * 3), cores = new Float32Array(nv * 3);
  const cChao = new THREE.Color('#dcd0b2'), cAgua = new THREE.Color('#6f8e99'), cMargem = new THREE.Color('#c9bd9c'), c = new THREE.Color();
  for (let k = 0; k < nv; k++) {
    const y = hh[k] / 100 - T.off;
    pos[k * 3] = T.x0 + col[k] * T.passo; pos[k * 3 + 1] = y; pos[k * 3 + 2] = T.z0 + lin[k] * T.passo;
    if (y < nivelReno) c.copy(cAgua); else c.copy(cChao).lerp(cMargem, Math.max(0, 1 - (y - nivelReno) / 3));
    c.toArray(cores, k * 3);
  }
  if (ajuste) ajuste({ count: nv, getX: (k) => pos[k * 3], getY: (k) => pos[k * 3 + 1], getZ: (k) => pos[k * 3 + 2], setX: (k, v) => { pos[k * 3] = v; }, setY: (k, v) => { pos[k * 3 + 1] = v; }, setZ: (k, v) => { pos[k * 3 + 2] = v; } }, cores); // ganchos do Reno (agua.js)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  { // o three só desenha a face da frente: se a ordem saiu invertida, vira os triângulos
    const n = g.attributes.normal; let s = 0;
    for (let k = 0; k < nv; k += 7) s += n.getY(k);
    if (s < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.computeVertexNormals(); }
  }

  // altura(x, z): o triângulo da malha sob o ponto, rasterizado numa grade de 1 m (consulta em O(1))
  const P1 = 1, X0 = T.x0, Z0 = T.z0, GN = Math.ceil(((T.nvlado ?? 2048) * T.passo) / P1) + 1;
  const grade = new Float32Array(GN * GN).fill(NaN);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, d = idx[t + 2] * 3;
    const ax = pos[a], az = pos[a + 2], bx = pos[b], bz = pos[b + 2], dx = pos[d], dz = pos[d + 2];
    const den = (bz - dz) * (ax - dx) + (dx - bx) * (az - dz);
    if (Math.abs(den) < 1e-9) continue;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, dx) - X0) / P1)), i1 = Math.min(GN - 1, Math.ceil((Math.max(ax, bx, dx) - X0) / P1));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, dz) - Z0) / P1)), j1 = Math.min(GN - 1, Math.ceil((Math.max(az, bz, dz) - Z0) / P1));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = X0 + i * P1, pz = Z0 + j * P1;
      const l1 = ((bz - dz) * (px - dx) + (dx - bx) * (pz - dz)) / den, l2 = ((dz - az) * (px - dx) + (ax - dx) * (pz - dz)) / den, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      grade[j * GN + i] = l1 * pos[a + 1] + l2 * pos[b + 1] + l3 * pos[d + 1];
    }
  }
  const altura = (x, z) => {
    const fx = (x - X0) / P1, fz = (z - Z0) / P1;
    const i = Math.max(0, Math.min(GN - 2, Math.floor(fx))), j = Math.max(0, Math.min(GN - 2, Math.floor(fz)));
    const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j));
    const h = (a, b) => { const y = grade[b * GN + a]; return y === y ? y : 0; };
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
  };

  // ---------- texturas das ruas ----------
  const carregaImg = (nome) => new Promise((ok, no) => {
    const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = base + nome;
  });
  const [imA, imB] = await Promise.all([carregaImg('ruas_a.webp'), carregaImg('ruas_b.webp')]);
  const mk = (im) => {
    const t = new THREE.Texture(im);
    t.flipY = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.anisotropy = 8; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; return t;
  };
  const [x0, z0, x1, z1] = [meta.recorte_lv95[0] - meta.origem_lv95[0], -(meta.recorte_lv95[3] - meta.origem_lv95[1]),
    meta.recorte_lv95[2] - meta.origem_lv95[0], -(meta.recorte_lv95[1] - meta.origem_lv95[1])];
  const U = {
    uRuasA: { value: mk(imA) }, uRuasB: { value: mk(imB) }, uRuasRet: { value: new THREE.Vector4(x0, z0, 1 / (x1 - x0), 1 / (z1 - z0)) },
    uRuasOn: { value: 1 },
  };

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, U);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vChaoP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvChaoP = position.xz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vChaoP; uniform sampler2D uRuasA; uniform sampler2D uRuasB; uniform vec4 uRuasRet; uniform float uRuasOn;
float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hsh(i), hsh(i + vec2(1, 0)), f.x), mix(hsh(i + vec2(0, 1)), hsh(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { return vnoise(p) * 0.6 + vnoise(p * 2.1 + 7.3) * 0.4; }
float gRelevo = 0.0; // relevo fino da rua (m), só perto da câmera: vira normal em <normal_fragment_maps>`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  if (uRuasOn > 0.5) {
    vec2 uvR = (vChaoP - uRuasRet.xy) * uRuasRet.zw;
    vec4 ra = texture2D(uRuasA, uvR), rb = texture2D(uRuasB, uvR);
    float dist = length(vViewPosition);
    float perto = (1.0 - smoothstep(35.0, 170.0, dist)) * uRuasOn;
    float asf = ra.r, pav = ra.g, cal = ra.b, ao = rb.g;
    float cobre = clamp(asf + pav + cal, 0.0, 1.0) * uRuasOn;
    if (cobre > 0.003 || rb.b + rb.r > 0.003) {
    float ruido = fbm(vChaoP * 0.9), mancha = fbm(vChaoP * 0.18 + 3.1);
    vec3 foto = diffuseColor.rgb;
    // asfalto: cinza quente, grão fino e manchas largas; rugosidade com ruído
    float grao = hsh(floor(vChaoP * 14.0));
    vec3 cAsf = vec3(0.30, 0.29, 0.28) * (0.82 + 0.3 * mancha + (grao - 0.5) * 0.18 * perto);
    // paralelepípedo: fileiras desencontradas de pedras de ~16 x 11 cm, junta escura, cor por pedra
    vec2 pp = vChaoP / vec2(0.17, 0.115); float fil = floor(pp.y); pp.x += hsh(vec2(fil, 3.0)) * 8.0;
    vec2 cel = floor(pp), fr = fract(pp);
    float junta = 1.0 - smoothstep(0.0, 0.16, min(min(fr.x, 1.0 - fr.x) * 0.7, min(fr.y, 1.0 - fr.y)));
    float tom = hsh(cel);
    vec3 cPav = mix(vec3(0.42, 0.40, 0.38), vec3(0.58, 0.54, 0.49), tom) * (0.85 + 0.25 * mancha);
    cPav = mix(cPav, cPav * 0.45, junta * perto);
    cPav = mix(cPav, vec3(0.50, 0.47, 0.43) * (0.9 + 0.2 * mancha), 1.0 - perto);
    // calçada: lajes de 60 cm com juntas finas, mais clara e lisa onde se pisa
    vec2 lp = vChaoP / 0.6; vec2 lf = fract(lp);
    float jl = 1.0 - smoothstep(0.0, 0.035, min(min(lf.x, 1.0 - lf.x), min(lf.y, 1.0 - lf.y)));
    vec3 cCal = vec3(0.66, 0.63, 0.58) * (0.9 + 0.2 * hsh(floor(lp)) * perto + 0.12 * mancha);
    cCal = mix(cCal, cCal * 0.7, jl * perto);
    float cobMat = max(asf + pav + cal, 1e-3);
    vec3 cRua = (cAsf * asf + cPav * pav + cCal * cal) / cobMat;
    // a foto continua mandando no tom (cobertura parcial da máscara = borda macia); o material dá a textura
    float pesoFoto = mix(0.55, 0.18, perto);
    vec3 fotoLum = vec3(dot(foto, vec3(0.299, 0.587, 0.114)));
    vec3 rua = mix(cRua, cRua * (0.55 + foto / max(fotoLum, 0.05) * 0.0 + fotoLum * 1.1), pesoFoto);
    // ---- de perto (até ~40 m): relevo das pedras, juntas fundas, bueiros e manchas de óleo; de longe nada disso pesa
    float rente = (1.0 - smoothstep(12.0, 40.0, dist)) * uRuasOn;
    if (rente > 0.01) {
      // paralelepípedo abaulado (até 2 cm no meio da pedra), laje com junta afundada, asfalto com grão
      float domo = (1.0 - junta) * (0.6 + 0.4 * hsh(cel + 3.0));
      float laje = 1.0 - jl;
      gRelevo = rente * (pav * 0.02 * domo + cal * 0.006 * laje + asf * 0.003 * hsh(floor(vChaoP * 40.0))) / cobMat * cobre;
      // manchas de óleo e de chuva no asfalto
      float oleo = smoothstep(0.62, 0.8, fbm(vChaoP * 1.7 + 11.0)) * asf;
      rua *= 1.0 - 0.25 * oleo * rente;
      // bueiros e tampas de ferro: um a cada ~20 m de asfalto, sorteado por célula
      vec2 cB = floor(vChaoP / 19.0), oB = (vec2(hsh(cB), hsh(cB + 5.0)) * 0.6 + 0.2) * 19.0;
      float dB = length(vChaoP - (cB * 19.0 + oB));
      float tampa = (1.0 - smoothstep(0.33, 0.36, dB)) * step(0.6, asf) * step(0.35, hsh(cB + 9.0));
      float aro = smoothstep(0.27, 0.29, dB) * (1.0 - smoothstep(0.33, 0.35, dB));
      float grelha = step(0.5, fract(dot(vChaoP, vec2(0.7071)) * 9.0));
      vec3 ferro = vec3(0.16, 0.15, 0.14) * (0.8 + 0.4 * grelha) * (1.0 - 0.4 * aro);
      rua = mix(rua, ferro, tampa * rente);
      gRelevo += tampa * rente * (aro * 0.01 - 0.004);
    }
    diffuseColor.rgb = mix(diffuseColor.rgb, rua, cobre * 0.92);
    // leito do bonde: concreto escuro; marca de faixa branca
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.33, 0.31) * (0.9 + 0.2 * ruido), rb.b * 0.7 * uRuasOn);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.84, 0.78), rb.r * 0.85 * (0.4 + 0.6 * perto));
    // oclusão falsa junto às fachadas (só a luz indireta, mas aqui basta escurecer o chão)
    diffuseColor.rgb *= mix(1.0, 0.62, ao * uRuasOn * cobre);
    // rugosidade: asfalto e calçada gastos ficam mais lisos no meio (mancha), pedra áspera
    roughnessFactor = clamp(0.95 - 0.28 * mancha * (asf + cal) - 0.06 * ruido + 0.05 * pav, 0.4, 1.0);
    }
    diffuseColor.rgb *= mix(1.0, 0.62, ao * uRuasOn * 0.35 * (1.0 - cobre));
  }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { // relevo fino (bump) a partir de gRelevo: método de Mikkelsen, como o bumpmap do three
    vec2 dH = vec2(dFdx(gRelevo), dFdy(gRelevo));
    if (abs(dH.x) + abs(dH.y) > 1e-6) {
      vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition), r1 = cross(sy, normal), r2 = cross(normal, sx);
      float det = dot(sx, r1);
      normal = normalize(abs(det) * normal - sign(det) * (dH.x * r1 + dH.y * r2));
    }
  }`);
    injetarSombra(s, 'vChaoP');
  };
  const malha = new THREE.Mesh(g, mat);
  malha.receiveShadow = true;
  orto.chao(malha);

  // ---------- meio-fio, trilhos, fio e postes ----------
  const grupo = new THREE.Group();
  const caixa = (pts, larg, alto, dy, cor, opts = {}) => {
    // fita com seção retangular larg × alto ao longo de pts [[x, y, z]...] (y = chão); devolve a malha
    const P = [], I = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const [x, y, z] = pts[i];
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[2] - a[2]; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
      const nx = -tz * larg / 2, nz = tx * larg / 2, y0 = y + dy, y1 = y + dy + alto;
      P.push(x - nx, y0, z - nz, x - nx, y1, z - nz, x + nx, y1, z + nz, x + nx, y0, z + nz);
    }
    for (let i = 0; i < n - 1; i++) {
      const o = i * 4, p = o + 4;
      for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0]]) I.push(o + a, p + a, o + b, o + b, p + a, p + b);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); gg.setIndex(I); gg.computeVertexNormals();
    const m = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: cor, roughness: 0.6, metalness: 0, side: THREE.DoubleSide, ...opts }));
    m.castShadow = true; m.receiveShadow = true; return m;
  };
  const fundir = (geos) => {
    const P = [], I = []; let o = 0;
    for (const gg of geos) { P.push(...gg.attributes.position.array); I.push(...Array.from(gg.index.array, (v) => v + o)); o += gg.attributes.position.count; }
    const r = new THREE.BufferGeometry(); r.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); r.setIndex(I); r.computeVertexNormals(); return r;
  };
  // meio-fio: fita de 18 cm de largura e 14 cm de altura sobre a linha da calçada
  {
    const gs = [];
    for (const c of ruas.meio_fio ?? []) {
      const pts = [];
      for (let i = 0; i < c.length - 2; i += 2) {
        const n = Math.max(1, Math.ceil(Math.hypot(c[i + 2] - c[i], c[i + 3] - c[i + 1]) / 3));
        for (let k = 0; k < n; k++) { const x = c[i] + ((c[i + 2] - c[i]) * k) / n, z = c[i + 1] + ((c[i + 3] - c[i + 1]) * k) / n; pts.push([x, altura(x, z), z]); }
      }
      pts.push([c[c.length - 2], altura(c[c.length - 2], c[c.length - 1]), c[c.length - 1]]);
      if (pts.length > 1) gs.push(caixa(pts, 0.2, 0.14, 0.0, 0).geometry);
    }
    if (gs.length) {
      const m = new THREE.Mesh(fundir(gs), new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.85 }));
      m.receiveShadow = true; m.castShadow = true; m.name = 'meio-fio'; grupo.add(m);
    }
  }
  // bonde: dois trilhos a 1 m (bitola métrica, eixo a eixo), fio a 5,6 m e postes a cada ~32 m
  {
    const trilhos = [], fios = [], postes = [], visto = new Set();
    for (const l of ruas.linhas) {
      if (l.t !== 'tram') continue;
      const c = l.c, pts = [];
      if (c.some((v, i) => (i % 2 ? Math.abs(v) > 570 : Math.abs(v) > 545))) continue; // fora da malha do relevo
      for (let i = 0; i < c.length - 2; i += 2) {
        const n = Math.max(1, Math.ceil(Math.hypot(c[i + 2] - c[i], c[i + 3] - c[i + 1]) / 2));
        for (let k = 0; k < n; k++) pts.push([c[i] + ((c[i + 2] - c[i]) * k) / n, c[i + 1] + ((c[i + 3] - c[i + 1]) * k) / n]);
      }
      pts.push([c[c.length - 2], c[c.length - 1]]);
      const hA = cotaPonta(altura, ...pts[0], ...pts[1]), hB = cotaPonta(altura, ...pts.at(-1), ...pts.at(-2));
      const y = (i) => (l.ponte ? hA + (hB - hA) * (i / (pts.length - 1)) + 0.6 : // ponte: trilho rente à faixa da pista (0,6 m), não enterrado nela
        altura(pts[i][0], pts[i][1]) + 0.06);
      for (const lado of [-0.5, 0.5]) {
        const f = pts.map(([x, z], i) => {
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          return [x - ((b[1] - a[1]) / L) * lado, y(i), z + ((b[0] - a[0]) / L) * lado];
        });
        trilhos.push(caixa(f, 0.07, 0.1, 0, 0).geometry);
      }
      const wire = pts.map(([x, z], i) => [x, y(i) + 5.4, z]);
      for (let i = 0; i < wire.length - 1; i++) fios.push(...wire[i], ...wire[i + 1]);
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (acc < 32) continue;
        acc = 0;
        const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const px = b[0] - ((b[1] - a[1]) / L) * 2.4, pz = b[1] + ((b[0] - a[0]) / L) * 2.4;
        const key = `${Math.round(px / 4)}_${Math.round(pz / 4)}`;
        if (visto.has(key)) continue;
        visto.add(key); postes.push([px, y(i), pz, b[0], b[1]]);
      }
    }
    if (trilhos.length) {
      const m = new THREE.Mesh(fundir(trilhos), new THREE.MeshStandardMaterial({ color: 0x8b8e92, roughness: 0.4, metalness: 0.35 }));
      m.castShadow = m.receiveShadow = true; m.name = 'trilhos'; grupo.add(m);
    }
    if (fios.length) {
      const gf = new THREE.BufferGeometry(); gf.setAttribute('position', new THREE.Float32BufferAttribute(fios, 3));
      const lf = new THREE.LineSegments(gf, new THREE.LineBasicMaterial({ color: 0x2a2622 })); lf.name = 'fio'; lf.frustumCulled = false; grupo.add(lf);
    }
    if (postes.length) {
      const poste = new THREE.CylinderGeometry(0.07, 0.11, 6.4, 6).translate(0, 3.2, 0);
      const braco = new THREE.BoxGeometry(0.08, 0.08, 2.4).translate(0, 5.75, -1.2); // aponta para a via (−z local)
      const gp = fundir([poste, braco]);
      const im = new THREE.InstancedMesh(gp, new THREE.MeshStandardMaterial({ color: 0x3d4a45, roughness: 0.6, metalness: 0.3 }), postes.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), e = new THREE.Vector3(), esc = new THREE.Vector3(1, 1, 1);
      postes.forEach(([x, y, z, tx, tz], i) => {
        q.setFromAxisAngle(up, Math.atan2(x - tx, z - tz) + Math.PI); // o braço (−z local) aponta ao trilho
        m4.compose(e.set(x, y, z), q, esc); im.setMatrixAt(i, m4);
      });
      im.castShadow = true; im.name = 'postes'; grupo.add(im);
    }
  }
  // dentro(x, z): o relevo cobre o ponto? (fora do recorte a grade fica vazia e altura() devolve 0)
  const dentro = (x, z) => { const i = Math.round((x - X0) / P1), j = Math.round((z - Z0) / P1); return i >= 0 && j >= 0 && i < GN && j < GN && grade[j * GN + i] === grade[j * GN + i]; };
  return { malha, altura, dentro, grupo, ruas: (on) => { U.uRuasOn.value = on ? 1 : 0; grupo.visible = on; }, estat: { nv, nt } };
}
