// Árvores e verde de Basel (tarefa 16): cadastro de árvores (data.bs.ch 100052) instanciado por gênero, 3 níveis de detalhe,
// balanço ao vento e estações pela data do céu (ceu.aoMudar). Gramados e jardins do OSM como manchas sobre o relevo.
// Dados: docs/data/arvores.bin/json, gerados por script/arvores.py. A altura do chão vem de `altura(x, z)` de cidade.js.
//
// Custo: 1 InstancedMesh por classe (gênero) e por LOD, matrizes refeitas só quando a câmera anda. A sombra no CSM sai da
// mesma malha (customDepthMaterial com o mesmo balanço e a mesma queda de folhas). Modo leve (ceu.leve): sem LOD 0, sem balanço.
export async function criarArvores({ THREE, cena, camera, altura, dentro = () => true, ceu, nivelRio = 2.4 }) {
  const [meta, bin] = await Promise.all([fetch('data/arvores.json').then((r) => r.json()), fetch('data/arvores.bin').then((r) => r.arrayBuffer())]);
  const leve = ceu.leve;
  const N = meta.n;
  const f32 = new Float32Array(bin, 0, N * 4), cls8 = new Uint8Array(bin, N * 16, N);

  // ---------- árvores: cadastro + extras do OSM (classes variadas, copa média) ----------
  const hash = (i) => { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
  const arv = [];
  for (let i = 0; i < N; i++) arv.push({ x: f32[i * 4], z: f32[i * 4 + 1], h: f32[i * 4 + 2], c: f32[i * 4 + 3], k: cls8[i] });
  meta.extras.forEach(([x, z], i) => { const h = 7 + hash(i) * 8; arv.push({ x, z, h, c: h * 0.7, k: [0, 1, 5, 5, 2, 4][Math.floor(hash(i + 99) * 6)] }); });
  for (const a of arv) { // sem idade no cadastro a altura sai igual: variação de ±15% por árvore
  const v = hash(Math.round(a.x * 7 + a.z * 13));
  a.y = altura(a.x, a.z); a.rot = v * 6.283; const k = 0.85 + 0.3 * hash(Math.round(a.x * 11 - a.z * 5)); a.h *= k; a.c *= 0.9 + 0.2 * v;
}
  const vivas = arv.filter((a) => a.y > nivelRio);

  // ---------- geometria procedural: tronco, galhos (madeira, tipo 0) e lóbulos de copa (folha, tipo 1); altura 1, copa 1 ----------
  const rng = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const CLASSES = [ // [fração do tronco limpo, lóbulos LOD0, espalhamento, achatamento vertical, verde base, verde variação]
    { limpo: 0.28, lob: 7, esp: 0.26, vert: 1.0, cor: [0.30, 0.42, 0.14], ever: false }, // tília
    { limpo: 0.22, lob: 6, esp: 0.25, vert: 0.95, cor: [0.28, 0.43, 0.12], ever: false }, // bordo
    { limpo: 0.2, lob: 7, esp: 0.3, vert: 0.85, cor: [0.20, 0.38, 0.10], ever: false }, // castanheiro
    { limpo: 0.38, lob: 8, esp: 0.32, vert: 0.8, cor: [0.31, 0.42, 0.15], ever: false }, // plátano
    { limpo: 0.25, lob: 8, esp: 0.33, vert: 0.8, cor: [0.24, 0.38, 0.11], ever: false }, // carvalho
    { limpo: 0.25, lob: 6, esp: 0.26, vert: 0.95, cor: [0.30, 0.43, 0.15], ever: false }, // outras folhosas
    { limpo: 0.08, lob: 0, esp: 0, vert: 1, cor: [0.10, 0.24, 0.12], ever: true }, // conífera
    { limpo: 0.14, lob: 5, esp: 0.12, vert: 1.35, cor: [0.34, 0.44, 0.14], ever: false }, // colunar
  ];
  // calendário de cada espécie em Basel (dia do ano; fenologia da MeteoSwiss, médias recentes): brotar [início, copa cheia],
  // cor de outono [início, auge] e queda [início, pelada]. O castanheiro abre as folhas primeiro (fim de março, começo de abril)
  // e escurece já em setembro (a mariposa-minadora); plátano e carvalho brotam por último e seguram a folha até novembro
  const FENO = [
    { brota: [98, 122], tinta: [272, 300], cai: [288, 318] },  // tília: amarelo em outubro
    { brota: [93, 116], tinta: [270, 298], cai: [290, 318] },  // bordo: laranja e vermelho em outubro
    { brota: [86, 110], tinta: [245, 285], cai: [272, 305] },  // castanheiro: o primeiro a brotar e a cair
    { brota: [106, 130], tinta: [285, 318], cai: [300, 340] }, // plátano: marrom-amarelado, cai tarde
    { brota: [108, 132], tinta: [290, 322], cai: [305, 345] }, // carvalho: marrom, segura até o fim de novembro
    { brota: [92, 118], tinta: [275, 308], cai: [292, 328] },  // outras folhosas (aqui entram as cerejeiras e magnólias dos jardins)
    null,                                                      // conífera: sempre verde
    { brota: [90, 112], tinta: [280, 302], cai: [288, 315] },  // colunar (choupo, carpino): amarelo
  ];
  // flor de primavera antes da folha, em parte das árvores de jardim (cerejeira, magnólia, ameixeira): fim de março a meados de abril
  const FLOR = [0, 0, 1, 0, 0, 0.3, 0, 0]; // fração da classe que floresce: castanheiros todos (as velas brancas e rosa, já com folha); um terço das outras folhosas
  const AUTUMN = [[1.0, 0.78, 0.15], [0.95, 0.30, 0.08], [0.62, 0.42, 0.10], [0.82, 0.58, 0.14], [0.55, 0.28, 0.10], [0.80, 0.62, 0.18], [0.1, 0.24, 0.12], [0.98, 0.75, 0.15]];
  const CASCA = [0.20, 0.15, 0.11];

  function construir(ci, lod) {
    const P = CLASSES[ci], r = rng(ci * 7919 + 13);
    const pos = [], col = [], nor = [], tip = [], idx = [];
    const push = (p, n, c, t) => { pos.push(...p); nor.push(...n); col.push(...c); tip.push(t); return pos.length / 3 - 1; };
    const lados = lod === 0 ? 5 : 4;
    const cil = (a, b, r0, r1, t = 0, c = CASCA) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const L = Math.hypot(dx, dy, dz) || 1, u = [dx / L, dy / L, dz / L];
      const e1 = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      let s = [u[1] * e1[2] - u[2] * e1[1], u[2] * e1[0] - u[0] * e1[2], u[0] * e1[1] - u[1] * e1[0]];
      const sl = Math.hypot(...s); s = s.map((v) => v / sl);
      const w = [u[1] * s[2] - u[2] * s[1], u[2] * s[0] - u[0] * s[2], u[0] * s[1] - u[1] * s[0]];
      const base = pos.length / 3;
      for (let k = 0; k < lados; k++) {
        const an = (k / lados) * 6.283, nx = Math.cos(an) * s[0] + Math.sin(an) * w[0], ny = Math.cos(an) * s[1] + Math.sin(an) * w[1], nz = Math.cos(an) * s[2] + Math.sin(an) * w[2];
        const v = 0.85 + 0.3 * ((k * 37) % 5) / 5;
        push([a[0] + nx * r0, a[1] + ny * r0, a[2] + nz * r0], [nx, ny, nz], c.map((q) => q * v), t);
        push([b[0] + nx * r1, b[1] + ny * r1, b[2] + nz * r1], [nx, ny, nz], c.map((q) => q * v), t);
      }
      for (let k = 0; k < lados; k++) {
        const a0 = base + k * 2, a1 = base + ((k + 1) % lados) * 2;
        idx.push(a0, a1, a0 + 1, a1, a1 + 1, a0 + 1);
      }
    };
    const bolha = (cx, cy, cz, rx, ry, rz, detalhe) => {
      const ico = new THREE.IcosahedronGeometry(1, detalhe), p = ico.attributes.position;
      const base = pos.length / 3, sem = r() * 100;
      for (let v = 0; v < p.count; v++) {
        const dx = p.getX(v), dy = p.getY(v), dz = p.getZ(v);
        const bump = 1 + 0.16 * Math.sin(dx * 5.1 + sem) * Math.sin(dy * 4.3 + sem * 1.3) + 0.12 * Math.sin(dz * 6.7 + sem * 0.7);
        const m = 0.78 + 0.22 * (dy * 0.5 + 0.5); // mais escura por baixo (oclusão falsa)
        const j = 0.82 + 0.36 * r();
        push([cx + dx * rx * bump, cy + dy * ry * bump, cz + dz * rz * bump], [dx, dy, dz], P.cor.map((q, i) => q * m * j * [0.72, 0.68, 0.7][i]), 1);
      }
      for (let v = 0; v < p.count; v++) idx.push(base + v);
    };
    const topo = 1, ini = P.limpo, copaAlt = topo - ini;
    if (ci === 6) { // conífera: cones empilhados
      cil([0, 0, 0], [0, 0.18, 0], 0.012, 0.01);
      const n = lod === 0 ? 5 : lod === 1 ? 3 : 2;
      for (let k = 0; k < n; k++) {
        const f = k / n, y0 = 0.08 + f * 0.7, rr = 0.5 * (1 - f * 0.85), h = (0.92 - y0) * (lod === 2 ? 0.9 : 0.5 + 0.5 * (1 - f));
        const base = pos.length / 3, seg = lod === 2 ? 6 : 8;
        push([0, Math.min(1, y0 + h * 1.35), 0], [0, 1, 0], P.cor.map((q) => q * 1.1), 1);
        for (let s = 0; s < seg; s++) {
          const an = (s / seg) * 6.283, c = Math.cos(an), sn = Math.sin(an), v = 0.8 + 0.4 * r();
          push([c * rr, y0, sn * rr], [c * 0.8, 0.5, sn * 0.8], P.cor.map((q) => q * v * 0.8), 1);
        }
        for (let s = 0; s < seg; s++) idx.push(base, base + 1 + s, base + 1 + ((s + 1) % seg));
      }
      return finalizar();
    }
    // tronco e galhos
    const tx = (r() - 0.5) * 0.03, tz = (r() - 0.5) * 0.03;
    cil([0, 0, 0], [tx, ini + copaAlt * 0.35, tz], 0.014, 0.008);
    const nGalhos = lod === 0 ? 7 : lod === 1 ? 4 : 0;
    for (let g = 0; g < nGalhos; g++) {
      const an = g * 2.4 + r(), alc = P.esp * (1.0 + r() * 0.8) * (ci === 7 ? 0.6 : 0.95);
      const y0 = ini + copaAlt * (0.12 + 0.3 * r()), y1 = y0 + copaAlt * (0.25 + 0.3 * r());
      const mid = [tx + Math.cos(an) * alc * 0.8, Math.min(y1, ini + copaAlt * 0.72), tz + Math.sin(an) * alc * 0.8];
      cil([tx, y0, tz], mid, 0.007, 0.0035);
      if (lod === 0) for (let k = 0; k < 3; k++) {
        const a2 = an + (k - 1) * 0.9 + (r() - 0.5) * 0.5;
        cil(mid, [mid[0] + Math.cos(a2) * 0.09, Math.min(mid[1] + copaAlt * (0.08 + 0.1 * r()), 0.93), mid[2] + Math.sin(a2) * 0.09], 0.0035, 0.0012);
      }
    }
    // copa: lóbulos (nível alto) ou uma bolha só (distante)
    const cy = ini + copaAlt * 0.5, ry = copaAlt * 0.5 * P.vert;
    const det = lod === 0 ? 1 : 0;
    if (lod === 2) bolha(tx, cy, tz, 0.5, ry * 1.1, 0.5, 0);
    else {
      const nl = lod === 0 ? P.lob : Math.max(3, Math.round(P.lob * 0.5));
      bolha(tx, cy + ry * 0.1, tz, 0.32 + P.esp * 0.5, ry * 0.65, 0.32 + P.esp * 0.5, det);
      for (let k = 0; k < nl; k++) {
        const an = (k / nl) * 6.283 + r(), rr = P.esp * (0.8 + 0.6 * r()), yy = cy + (r() - 0.45) * ry * 0.9;
        const s = 0.2 + 0.1 * r();
        bolha(tx + Math.cos(an) * (0.5 - s) * 0.95 * (rr / P.esp) * 0.7, yy, tz + Math.sin(an) * (0.5 - s) * 0.95 * (rr / P.esp) * 0.7, s + 0.08, Math.max(0.1, ry * 0.5 * (0.8 + 0.4 * r())), s + 0.08, det);
      }
    }
    return finalizar();
    function finalizar() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute('aTipo', new THREE.Float32BufferAttribute(tip, 1));
      g.setIndex(idx);
      if (ci !== 6) { // normais dos troncos ficam por cilindro; as da copa são esféricas (sombreamento macio)
        g.computeBoundingSphere();
      } else g.computeBoundingSphere();
      return g;
    }
  }

  // ---------- shader: balanço, queda de folha, cor de outono, oclusão falsa e rugosidade com ruído ----------
  const G = { uT: { value: 0 }, uVento: { value: leve ? 0 : 1 }, uFolha: { value: 1 }, uTinta: { value: 0 }, uBrota: { value: 0 }, uTrans: { value: 0.1 }, uFlor: { value: 0 }, uFlorQ: { value: 0 } };
  const GLSL_COMUM = `
uniform float uT, uVento, uFolha, uTinta, uBrota, uTrans, uEver, uFlor, uFlorQ; uniform vec3 uOutono;
varying vec3 vLocal; varying float vRnd, vTipo;
float h3(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
// quanto desta árvore está em flor (0..1): só a fração uFlorQ da classe, sorteada pela posição
float flor(float rnd){ return uFlor * step(1.0 - uFlorQ, fract(rnd * 7.31)); }
bool folhaCai(vec3 loc, float rnd){
  float dens = uEver > 0.5 ? 1.0 : clamp(uFolha * 1.4 - rnd * 0.4, 0.0, 1.0);
  dens = max(dens, flor(rnd) * 0.8); // a copa em flor antes das folhas
  // grão fino (1/36 da árvore): em cubos de 1/13 as copas de outono pareciam recortadas em papel
  return h3(floor(loc * 36.0) + rnd * 17.0) > dens * 1.0001;
}`;
  function injetar(s, { cheio, leveSemBalanco }) {
    Object.assign(s.uniforms, G, { uEver: { value: s.uEver ?? 0 }, uOutono: { value: new THREE.Vector3(1, 0.7, 0.2) } });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aTipo;\n${GLSL_COMUM}`)
      .replace('#include <begin_vertex>', `
  vec3 transformed = vec3(position);
  float rnd0 = 0.5;
  #ifdef USE_INSTANCING
    rnd0 = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
  #endif
  vRnd = rnd0; vLocal = position; vTipo = aTipo;
  float pesoV = pow(clamp(position.y, 0.0, 1.0), 2.0);
  float fase = rnd0 * 6.283;
  float rajada = 0.65 + 0.35 * sin(uT * 0.23 + fase * 0.3);
  float bal = (sin(uT * 1.15 + fase) * 0.6 + sin(uT * 2.3 + fase * 1.7) * 0.4) * rajada;
  transformed.x += bal * pesoV * uVento * 0.028;
  transformed.z += bal * 0.55 * pesoV * uVento * 0.028;
  // copa que perde folha também afina um pouco (sem isso, o outono só abria buracos numa casca do mesmo tamanho)
  if (aTipo > 0.5 && uEver < 0.5) transformed.xz *= mix(0.86, 1.0, clamp(uFolha, 0.0, 1.0));
  if (aTipo > 0.5) transformed += uVento * 0.006 * vec3(sin(uT * 4.7 + position.x * 31.0 + fase), sin(uT * 3.9 + position.z * 27.0), sin(uT * 4.1 + position.y * 29.0)) * pesoV;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_COMUM}`);
    if (cheio) {
      s.fragmentShader = s.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
  if (vTipo > 0.5) {
    if (folhaCai(vLocal, vRnd)) discard;
    float ti = smoothstep(0.0, 1.0, uTinta * 1.6 - vRnd * 0.6) * (1.0 - uEver);
    vec3 c = diffuseColor.rgb;
    c = mix(c, uOutono * (0.75 + 0.5 * h3(floor(vLocal * 7.0))), ti * 0.9);
    // fim do outono: o que sobra na copa escurece para o marrom de folha seca (o amarelo vivo é de outubro)
    c = mix(c, vec3(0.42, 0.28, 0.15) * (0.8 + 0.4 * vRnd), ti * (1.0 - uEver) * 0.6 * smoothstep(0.85, 0.25, uFolha));
    c = mix(c, vec3(0.50, 0.62, 0.16) * (0.7 + 0.5 * vRnd), uBrota * (1.0 - uEver) * 0.55);
    // flor: rosa (cerejeira japonesa, magnólia) ou branca (cerejeira, ameixeira; as velas do castanheiro), some quando a folha cresce
    float fl = flor(vRnd), pet = h3(floor(vLocal * 40.0) + vRnd * 5.0);
    vec3 cFlor = fract(vRnd * 13.7) < 0.45 ? vec3(0.98, 0.72, 0.82) : vec3(0.97, 0.95, 0.90);
    c = mix(c, cFlor * (0.85 + 0.2 * pet), fl * step(mix(0.25, 0.86, smoothstep(0.4, 0.9, uFolha)), pet)); // com a copa cheia, só pontos (as velas)
    c *= mix(0.55, 1.0, smoothstep(0.0, 0.8, vLocal.y)) * (0.9 + 0.2 * vRnd);   // copa mais escura por baixo e por dentro
    if (!gl_FrontFacing) c *= 0.5; // o lado de dentro da copa, visto pelos vãos das folhas que caíram
    diffuseColor.rgb = c;
  } else {
    diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(0.0, 0.25, vLocal.y));          // pé do tronco escurecido (oclusão falsa)
  }`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor * (0.85 + 0.3 * h3(floor(vLocal * 40.0))), 0.6, 1.0);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  if (vTipo > 0.5) totalEmissiveRadiance += diffuseColor.rgb * uTrans;`);
    } else { // passe de sombra (profundidade): mesmo recorte de folhas
      s.fragmentShader = s.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if (vTipo > 0.5 && folhaCai(vLocal, vRnd)) discard;`);
    }
  }
  function rastro(s) { injetar(s, { cheio: true }); }
  // G-buffer do GTAO (cidade.js chama isto): copas sem folha não podem escurecer o chão
  const patchNormal = (s) => {
    Object.assign(s.uniforms, G, { uEver: { value: 0 } });
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\nattribute float aTipo; varying vec3 vLocalA; varying float vRndA, vTipoA;`)
      .replace('#include <project_vertex>', `vLocalA = position; vTipoA = 0.0; vRndA = 0.5;
  #ifdef USE_INSTANCING
    vTipoA = aTipo; vRndA = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
  #endif
  #include <project_vertex>`);
    s.fragmentShader = s.fragmentShader.replace('void main() {', `varying vec3 vLocalA; varying float vRndA, vTipoA; uniform float uFolha;
float h3a(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
void main() {
  if (vTipoA > 0.5 && h3a(floor(vLocalA * 36.0) + vRndA * 17.0) > clamp(uFolha * 1.4 - vRndA * 0.4, 0.0, 1.0) * 0.985) discard;`);
  };

  // uniforms da estação por classe (cada espécie no seu calendário, FENO); G guarda a média para o G-buffer do GTAO
  const UC = CLASSES.map((_, ci) => ({ uFolha: { value: 1 }, uTinta: { value: 0 }, uBrota: { value: 0 }, uFlor: { value: 0 }, uFlorQ: { value: FLOR[ci] ?? 0 } }));
  // ---------- malhas: 1 por classe e LOD ----------
  const porClasse = CLASSES.map(() => []);
  for (const a of vivas) porClasse[a.k].push(a);
  const grupo = new THREE.Group(); grupo.name = 'arvores';
  const malhas = []; // [classe][lod]
  const LODS = leve ? [1, 2] : [0, 1, 2];
  CLASSES.forEach((P, ci) => {
    const lista = porClasse[ci];
    malhas[ci] = [];
    for (const lod of LODS) {
      // os dois lados: pelos vãos das folhas que caem aparece o outro lado da copa, e não o vazio de uma casca oca
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
      const uEver = { value: P.ever ? 1 : 0 }, uOut = { value: new THREE.Vector3(...AUTUMN[ci].map((v, i) => v * [0.8, 0.74, 0.8][i])) }, F = UC[ci];
      mat.onBeforeCompile = (s) => {
        injetar(s, { cheio: true }); s.uniforms.uEver = uEver; s.uniforms.uOutono = uOut; Object.assign(s.uniforms, F);
      };
      mat.customProgramCacheKey = () => 'arv';
      const dep = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
      dep.onBeforeCompile = (s) => { injetar(s, { cheio: false }); s.uniforms.uEver = uEver; Object.assign(s.uniforms, F); };
      dep.customProgramCacheKey = () => 'arv-dep';
      const m = new THREE.InstancedMesh(construir(ci, lod), mat, Math.max(1, lista.length));
      m.count = 0; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.customDepthMaterial = dep;
      grupo.add(m); malhas[ci][lod] = m;
    }
  });
  cena.add(grupo);

  // ---------- LOD por distância à câmera (refeito quando a câmera anda) ----------
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), esc = new THREE.Vector3(), eixoY = new THREE.Vector3(0, 1, 0);
  const D0 = 130, D1 = 380;
  let ultima = new THREE.Vector3(1e9, 0, 0), estat = { lod0: 0, lod1: 0, lod2: 0, total: vivas.length };
  function atualizarLOD(forca) {
    if (!forca && camera.position.distanceTo(ultima) < 6) return;
    ultima.copy(camera.position);
    const cont = malhas.map((l) => l.map(() => 0));
    estat = { lod0: 0, lod1: 0, lod2: 0, total: vivas.length };
    const d0 = leve ? -1 : D0, d1 = leve ? 220 : D1;
    porClasse.forEach((lista, ci) => {
      for (const a of lista) {
        const d = Math.hypot(a.x - camera.position.x, a.y - camera.position.y, a.z - camera.position.z);
        const lod = d < d0 ? 0 : d < d1 ? 1 : 2;
        const m = malhas[ci][lod];
        q.setFromAxisAngle(eixoY, a.rot); pos.set(a.x, a.y - 0.1, a.z); esc.set(a.c, a.h, a.c);
        M.compose(pos, q, esc);
        m.setMatrixAt(cont[ci][lod]++, M);
        estat['lod' + lod]++;
      }
    });
    malhas.forEach((l, ci) => l.forEach((m, lod) => { if (!m) return; m.count = cont[ci][lod]; m.instanceMatrix.needsUpdate = true; }));
  }
  atualizarLOD(true);

  // ---------- estações: pela data de ceu.estado() ----------
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // grama: parda no inverno, verde vivo na primavera (abril–junho), mais seca no alto verão, amarelada no outono
  const lawn = { cor: new THREE.Color(), primavera: new THREE.Color('#5c9a36'), verao: new THREE.Color('#758a3e'), outono: new THREE.Color('#8f8b45'), inverno: new THREE.Color('#8c8a62') };
  let gramaMat = null;
  function estacao(e) {
    const [a, mes, dia] = e.data.split('-').map(Number);
    const doy = Math.round((Date.UTC(a, mes - 1, dia) - Date.UTC(a, 0, 0)) / 86400000);
    G.uFolha.value = ss(96, 122, doy) * (1 - ss(292, 335, doy)); // média: copa cheia até meados de outubro, quase pelada no fim de novembro
    G.uTinta.value = doy > 200 ? ss(272, 318, doy) : 0;
    G.uBrota.value = doy < 200 ? ss(96, 114, doy) * (1 - ss(114, 150, doy)) : 0;
    FENO.forEach((f, ci) => {
      const u = UC[ci]; if (!f) return;
      const [b0, b1] = f.brota, meio = (b0 + b1) / 2;
      u.uFolha.value = ss(b0, b1, doy) * (1 - ss(f.cai[0], f.cai[1], doy));
      u.uTinta.value = doy > 200 ? ss(f.tinta[0], f.tinta[1], doy) : 0;
      u.uBrota.value = doy < 200 ? ss(b0, meio, doy) * (1 - ss(meio, b1 + 25, doy)) : 0; // verde-claro das folhas novas, maio adentro
      // flor: das ornamentais, do fim de março a meados de abril; do castanheiro (velas), no fim de abril e começo de maio
      u.uFlor.value = ci === 2 ? ss(112, 120, doy) * (1 - ss(130, 140, doy)) : ss(78, 88, doy) * (1 - ss(104, 116, doy));
    });
    G.uTrans.value = 0.1 * e.dia;
    if (gramaMat) {
      const pri = ss(75, 110, doy) * (1 - ss(165, 200, doy)), seco = ss(180, 215, doy) * (1 - ss(250, 270, doy));
      const out = ss(260, 300, doy) * (1 - ss(330, 355, doy)), inv = doy < 75 || doy > 330 ? 1 : (1 - ss(60, 100, doy)) + ss(320, 345, doy);
      lawn.cor.copy(lawn.verao).lerp(lawn.primavera, pri).lerp(lawn.outono, Math.max(out, 0.35 * seco)).lerp(lawn.inverno, Math.min(1, inv) * 0.85);
      gramaMat.color.copy(lawn.cor).multiplyScalar(0.3 + 0.7 * Math.max(e.dia, 0.25));
    }
  }
  ceu.aoMudar(estacao);

  // ---------- gramados e jardins do OSM: manchas semitransparentes sobre a ortofoto, assentadas no relevo ----------
  {
    const COR = [[0.36, 0.5, 0.2], [0.42, 0.5, 0.22], [0.45, 0.58, 0.25], [0.55, 0.4, 0.3], [0.2, 0.32, 0.14], [0.55, 0.53, 0.42]];
    const pos = [], cor = [];
    const sub = (a, b, c, k, depth) => { // subdivide até as arestas ficarem abaixo de 4 m, para seguir o relevo de 0,5 m (tarefa 15)
      const e = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c[0] - b[0], c[1] - b[1]), Math.hypot(a[0] - c[0], a[1] - c[1]));
      if (e < 4 || depth > 6) {
        // fora do relevo (gramados do OSM além do recorte) a altura cai a 0 e a mancha boiava no céu, atrás da cidade
        if (![a, b, c].every((p) => dentro(p[0], p[1]))) return;
        for (const p of [a, b, c]) {
          pos.push(p[0], altura(p[0], p[1]) + 0.3 + k * 0.01, p[1]);
          const v = 0.85 + 0.3 * hash(Math.round(p[0] * 3) * 131 + Math.round(p[1] * 3));
          cor.push(COR[k][0] * v, COR[k][1] * v, COR[k][2] * v);
        }
        return;
      }
      const mid = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2], ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      sub(a, ab, ca, k, depth + 1); sub(ab, b, bc, k, depth + 1); sub(ca, bc, c, k, depth + 1); sub(ab, bc, ca, k, depth + 1);
    };
    for (const poly of meta.verde) {
      const k = poly[0];
      if (k === 4 || k === 5) continue; // mata e quadras: só as árvores contam
      const pts = []; for (let i = 1; i < poly.length; i += 2) pts.push(new THREE.Vector2(poly[i], poly[i + 1]));
      if (pts.length > 2 && pts[0].distanceTo(pts.at(-1)) < 0.5) pts.pop();
      if (pts.length < 3) continue;
      const tris = THREE.ShapeUtils.triangulateShape(pts, []);
      for (const [i, j, l] of tris) sub([pts[i].x, pts[i].y], [pts[j].x, pts[j].y], [pts[l].x, pts[l].y], k, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
    g.computeVertexNormals();
    gramaMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const m = new THREE.Mesh(g, gramaMat);
    m.receiveShadow = true; m.renderOrder = 1; m.name = 'gramados';
    cena.add(m);
    ceu.semAO?.push(m); // película sobre o relevo: o chão por baixo já dá a profundidade ao GTAO (0,6 M triângulos a menos)
  }
  estacao(ceu.estado());

  // ---------- laço próprio: balanço e LOD (sem balanço no modo leve) ----------
  let tAnt = 0;
  const laco = (agora) => {
    requestAnimationFrame(laco);
    if (!leve) G.uT.value = agora / 1000;
    if (agora - tAnt > 250) { tAnt = agora; atualizarLOD(false); }
  };
  requestAnimationFrame(laco);

  return {
    grupo, patchNormal, estat: () => estat, config: meta.conferencia,
    reposicionar() { for (const a of arv) a.y = altura(a.x, a.z); atualizarLOD(true); },
    visivel(on) { grupo.visible = on; },
  };
}
