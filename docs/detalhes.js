import { desenharStab } from './baselstab.js';
// Detalhes de rua (tarefa 17): fontanários com água e jatos, postes de luz que acendem de noite (com poça de luz no chão e brilho
// no bloom), bancos, lixeiras, bicicletários (data.bs.ch 100241), toldos e mesas de café com guarda-sol no verão, letreiros
// de loja por categoria (sem marcas), bandeiras de Basel nos prédios públicos, balsas de cabo do Reno e navios.
// Posições: docs/data/detalhes.json (script/detalhes.py). Tudo em InstancedMesh (poucas chamadas de desenho).
// A cidade é a de hoje: tudo aparece (não há mais máquina do tempo).
// Modo leve (`ceu.leve`): sem sombras, sem poça de luz, menos postes e menos gotas.
// criarDetalhes({ THREE, cena, renderer, camera, U, altura, ceu, P, nivelAgua, leve, base }) -> { grupo, estat, ... }
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export async function criarDetalhes({ THREE, cena, renderer, U, altura, ceu, P, nivelAgua, cotaPonte = () => null, leve = false, base = 'data/' }) {
  const D = await fetch(base + 'detalhes.json').then((r) => r.json());
  const grupo = new THREE.Group(); grupo.name = 'detalhes';
  cena.add(grupo);
  const UL = { uNoite: U.uNoite, uApagao: U.uApagao ?? { value: 0 }, uLuz: { value: 0 }, uTempo: { value: 0 }, uPx: { value: 400 } };
  const estat = { instancias: 0, malhas: 0 };
  const rnd = (i) => { let x = Math.imul(i + 1, 0x9e3779b1); x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b); return ((x ^ (x >>> 13)) >>> 0) / 4294967296; };

  // ---------- peças comuns ----------
  const col = (h) => new THREE.Color(h);
  // junta peças (geometria, cor, 0/1 de luz própria) numa geometria só, com atributos color e luz
  function juntar(partes) {
    const gs = partes.map(({ g, c, luz = 0, m }) => {
      let x = g.index ? g.toNonIndexed() : g.clone();
      if (m) x.applyMatrix4(m);
      x.deleteAttribute('uv');
      const n = x.attributes.position.count, cor = new Float32Array(n * 3), lz = new Float32Array(n).fill(luz);
      const cc = col(c); for (let i = 0; i < n; i++) { cor[i * 3] = cc.r; cor[i * 3 + 1] = cc.g; cor[i * 3 + 2] = cc.b; }
      x.setAttribute('color', new THREE.BufferAttribute(cor, 3)); x.setAttribute('luz', new THREE.BufferAttribute(lz, 1));
      return x;
    });
    return mergeGeometries(gs);
  }
  const T = (x, y, z, ry = 0, rx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(1, 1, 1));
  const cil = (r0, r1, h, seg = 8) => new THREE.CylinderGeometry(r1, r0, h, seg);
  const caixa = (a, b, c) => new THREE.BoxGeometry(a, b, c);

  // material com luz própria (vértices com `luz`=1 acendem de noite), época por instância e vento opcional
  function material(nome, { luz = true, ...resto } = {}) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.25, ...resto });
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, UL);
      s.vertexShader = s.vertexShader
        .replace('#include <common>', `#include <common>\n${luz ? 'attribute float luz; varying float vLuz;' : ''}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${luz ? 'vLuz = luz;' : ''}`);
      if (luz) s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vLuz; uniform float uLuz;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.72, 0.38) * vLuz * uLuz;');
    };
    m.customProgramCacheKey = () => `det-${nome}`;
    return m;
  }
  function profundidade() {
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, UL);
    };
    m.customProgramCacheKey = () => 'det-prof';
    return m;
  }

  const q = new THREE.Quaternion(), e = new THREE.Vector3(), esc = new THREE.Vector3(), m4 = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
  // itens: [{ x, y, z, r (rotação em Y), s (escala) ou sx, sy, sz, cor }]
  function instanciar(nome, geo, mat, itens, { sombra = false, recebe = true, cores = false } = {}) {
    if (!itens.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, itens.length);
    itens.forEach((it, i) => {
      q.setFromAxisAngle(UP, it.r || 0);
      const s = it.s ?? 1;
      m4.compose(e.set(it.x, it.y, it.z), q, esc.set(it.sx ?? s, it.sy ?? s, it.sz ?? s));
      im.setMatrixAt(i, m4);
      if (cores) im.setColorAt(i, it.cor ?? col(0xffffff));
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = sombra && !leve; im.receiveShadow = recebe && !leve;
    if (im.castShadow) im.customDepthMaterial = profundidade();
    im.frustumCulled = false; im.name = nome;
    grupo.add(im); estat.instancias += itens.length; estat.malhas++;
    return im;
  }
  // na Mittlere Brücke o chão é o tabuleiro (marcos.js), não o leito do rio: os postes do parapeito ficavam na água
  const noChao = (x, z, y) => (y ?? cotaPonte(x, z) ?? altura(x, z));

  // ---------- postes de luz ----------
  const FERRO = 0x2d3532, VIDRO = 0xf3e6c0;
  const geoPoste = juntar([
    { g: cil(0.16, 0.12, 0.35, 6), c: FERRO, m: T(0, 0.175, 0) }, // 6 lados (eram 8): 756 postes na cidade
    { g: cil(0.07, 0.05, 3.7, 5), c: FERRO, m: T(0, 2.2, 0) },
    { g: cil(0.09, 0.09, 0.1, 6), c: FERRO, m: T(0, 4.1, 0) },
    { g: cil(0.12, 0.18, 0.4, 4), c: VIDRO, luz: 1, m: T(0, 4.35, 0, Math.PI / 4) },
    { g: new THREE.ConeGeometry(0.27, 0.3, 4), c: FERRO, m: T(0, 4.7, 0, Math.PI / 4) },
    { g: new THREE.SphereGeometry(0.05, 6, 4), c: FERRO, m: T(0, 4.9, 0) },
  ]);
  const geoParede = juntar([
    { g: caixa(0.12, 0.3, 0.05), c: FERRO, m: T(0, 3.5, 0.02) },
    { g: caixa(0.04, 0.04, 0.95), c: FERRO, m: T(0, 3.6, 0.47) },
    { g: caixa(0.04, 0.3, 0.04), c: FERRO, m: T(0, 3.45, 0.2, 0, 0.5) },
    { g: cil(0.1, 0.15, 0.36, 4), c: VIDRO, luz: 1, m: T(0, 3.35, 0.95, Math.PI / 4) },
    { g: new THREE.ConeGeometry(0.21, 0.22, 4), c: FERRO, m: T(0, 3.64, 0.95, Math.PI / 4) },
  ]);
  const lamp = D.lampadas.filter((l, i) => !leve || i < 25 || i % 2 === 0);
  const poste = lamp.filter((l) => l[3] === 0), parede = lamp.filter((l) => l[3] === 1);
  const matLamp = material('lamp');
  const item = (l) => ({ x: l[0], z: l[1], y: noChao(l[0], l[1], l[4]), r: l[2] });
  instanciar('postes', geoPoste, matLamp, poste.map((l) => item(l)), { sombra: true });
  instanciar('lampadas-parede', geoParede, matLamp, parede.map((l) => item(l)), { sombra: false });
  // poça de luz no chão: disco aditivo com gradiente radial (só de noite; no modo leve fica de fora)
  let pocas = null;
  if (!leve) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0.8)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.32)'); gr.addColorStop(0.65, 'rgba(255,255,255,0.07)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
    const geoDisco = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const matDisco = new THREE.MeshBasicMaterial({ map: tx, color: new THREE.Color(1.0, 0.62, 0.28), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const discos = lamp.map((l) => {
      const off = l[3] === 1 ? 1.7 : 0, x = l[0] + Math.sin(l[2]) * off, z = l[1] + Math.cos(l[2]) * off;
      return { x, z, y: noChao(x, z, l[4]) + 0.12, s: 11 };
    });
    pocas = instanciar('pocas-de-luz', geoDisco, matDisco, discos, { recebe: false });
    pocas.visible = false;
  }

  // ---------- bancos, lixeiras ----------
  const MADEIRA = 0x8a6a45, METAL = 0x2f3433;
  const geoBanco = juntar([
    { g: caixa(1.7, 0.05, 0.42), c: MADEIRA, m: T(0, 0.46, 0) }, { g: caixa(1.7, 0.4, 0.04), c: MADEIRA, m: T(0, 0.78, -0.2, 0, -0.12) },
    { g: caixa(0.06, 0.46, 0.4), c: METAL, m: T(-0.75, 0.23, 0) }, { g: caixa(0.06, 0.46, 0.4), c: METAL, m: T(0.75, 0.23, 0) },
  ]);
  const matBanco = material('banco', { luz: false, roughness: 0.78 });
  instanciar('bancos', geoBanco, matBanco, D.bancos.map((b) => ({ x: b[0], z: b[1], y: altura(b[0], b[1]), r: b[2] })));
  const geoLixo = juntar([{ g: cil(0.22, 0.22, 0.8, 10), c: 0x33473c, m: T(0, 0.4, 0) }, { g: cil(0.24, 0.24, 0.06, 10), c: 0x24302a, m: T(0, 0.83, 0) }]);
  instanciar('lixeiras', geoLixo, material('lixo', { luz: false }), D.lixeiras.map((b) => ({ x: b[0], z: b[1], y: altura(b[0], b[1]) })));

  // ---------- bicicletários (data.bs.ch 100241): um U invertido a cada 0,7 m; cobertos ganham teto ----------
  {
    const arco = juntar([{ g: new THREE.TorusGeometry(0.3, 0.018, 5, 10, Math.PI).rotateY(Math.PI / 2), c: 0x8d9296, m: T(0, 0.3, 0) }]);
    const lo = [], tetos = [], pil = [];
    for (const [x, z, a, n, cob] of D.bicicletarios) {
      const voltas = Math.max(1, Math.min(10, Math.round(n / 2))), cx = Math.cos(a), cz = -Math.sin(a), y0 = altura(x, z);
      for (let k = 0; k < voltas; k++) {
        const o = (k - (voltas - 1) / 2) * 0.7;
        lo.push({ x: x + cx * o, z: z + cz * o, y: y0, r: a + Math.PI / 2 });
      }
      if (cob) {
        const L = voltas * 0.7 + 0.6;
        tetos.push({ x, z, y: y0 + 2.3, r: a, sx: L, sy: 1, sz: 1 });
        for (const lado of [-1, 1]) pil.push({ x: x + cx * lado * (L / 2 - 0.1), z: z + cz * lado * (L / 2 - 0.1), y: y0 });
      }
    }
    instanciar('bicicletario-arcos', arco, material('arco', { luz: false, metalness: 0.7, roughness: 0.4 }), lo);
    instanciar('bicicletario-tetos', juntar([{ g: caixa(1, 0.07, 1.8), c: 0x4f6b7a }]), material('teto', { luz: false }), tetos, { sombra: true });
    instanciar('bicicletario-pilares', juntar([{ g: cil(0.04, 0.04, 2.3, 6), c: 0x3a3f42, m: T(0, 1.15, 0) }]), material('pilar', { luz: false }), pil);
  }

  // ---------- fontanários: bacia de pedra, coluna, água com ondas e jatos ----------
  const fontes = D.fontes;
  {
    const PEDRA = 0xb3ab9b, ESCURA = 0x8a8374;
    const perfil = [[0.001, 0], [1.4, 0], [1.4, 0.55], [1.5, 0.64], [1.5, 0.74], [1.32, 0.74], [1.32, 0.52], [0.001, 0.52]].map(([r, y]) => new THREE.Vector2(r, y));
    const geoFonte = juntar([
      { g: new THREE.LatheGeometry(perfil, 14), c: PEDRA },
      { g: cil(0.5, 0.36, 0.5, 10), c: ESCURA, m: T(0, 0.75, 0) },
      { g: cil(0.2, 0.17, 1.0, 10), c: PEDRA, m: T(0, 1.25, 0) },
      { g: cil(0.4, 0.2, 0.16, 10), c: PEDRA, m: T(0, 1.8, 0) },
      { g: new THREE.SphereGeometry(0.17, 8, 6), c: ESCURA, m: T(0, 2.0, 0) },
    ]);
    const itensF = fontes.map(([x, z, t, a], i) => ({ x, z, y: altura(x, z), r: a, s: t ? 0.62 : 1 }));
    instanciar('fontanarios', geoFonte, material('fonte', { luz: false, roughness: 0.85, metalness: 0 }), itensF, { sombra: true });
    // água: disco no nível da bacia, normal perturbada por ondas (relógio uTempo)
    const agua = new THREE.MeshStandardMaterial({ color: 0x5f95ad, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88 });
    agua.userData.semNeve = true; // neve.js: a água da fonte não junta neve
    agua.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, UL);
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vAg;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAg = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xz;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vAg; uniform float uTempo;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  normal = normalize(normal + 0.22 * vec3(sin(vAg.x * 9.0 + uTempo * 2.6) + sin(vAg.y * 7.0 - uTempo * 2.1), 0.0, cos(vAg.y * 8.0 + uTempo * 2.3) + cos(vAg.x * 6.0 - uTempo * 1.7)));`);
    };
    agua.customProgramCacheKey = () => 'det-agua';
    instanciar('fontanarios-agua', new THREE.CircleGeometry(1.34, 16).rotateX(-Math.PI / 2).translate(0, 0.63, 0), agua,
      itensF.map((it) => ({ ...it, sombra: false })), { recebe: false });
    // jatos: gotas em arco calculadas no shader de vértice (sem custo de CPU); 6 bicas na grande, 1 na pequena
    const gotas = leve ? 5 : 10, P_ = [], B_ = [], S_ = [];
    fontes.forEach(([x, z, t, a], i) => {
      const y = altura(x, z), s = t ? 0.62 : 1, bicas = t ? 1 : 6;
      for (let b = 0; b < bicas; b++) for (let k = 0; k < gotas; k++) {
        P_.push(0, 0, 0); B_.push(x, y, z, s);
        S_.push(t ? a + Math.PI / 2 + (rnd(i * 7 + k) - 0.5) * 0.25 : (b / bicas) * Math.PI * 2 + (rnd(i + k * 3) - 0.5) * 0.2, k / gotas + rnd(i * 13 + b) * 0.05, t ? 0.9 : 1.3 + rnd(i + b) * 0.3, t ? 1.0 : 1.75);
      }
    });
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(P_, 3)); gg.setAttribute('aBase', new THREE.Float32BufferAttribute(B_, 4)); gg.setAttribute('aSeed', new THREE.Float32BufferAttribute(S_, 4));
    const mj = new THREE.ShaderMaterial({
      uniforms: { uTempo: UL.uTempo, uPx: UL.uPx }, transparent: true, depthWrite: false,
      vertexShader: `attribute vec4 aBase; attribute vec4 aSeed; uniform float uTempo; uniform float uPx; varying float vA;
        void main() {
          float u = fract(uTempo * 0.5 + aSeed.y), hs = aSeed.w * aBase.w, vy = 1.9 * aBase.w, vh = aSeed.z * aBase.w;
          float Tf = (vy + sqrt(vy * vy + 19.6 * (hs - 0.62 * aBase.w))) / 9.8, tt = u * Tf;
          vec3 p = aBase.xyz + vec3(cos(aSeed.x) * vh * tt, hs + vy * tt - 4.9 * tt * tt, sin(aSeed.x) * vh * tt);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(uPx * 0.045 * aBase.w / max(1.0, -mv.z) * 6.0, 1.5, 7.0);
          vA = 0.75 * smoothstep(0.0, 0.1, u) * (1.0 - smoothstep(0.8, 1.0, u));
        }`,
      fragmentShader: `varying float vA; void main() { vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard; gl_FragColor = vec4(0.82, 0.93, 1.0, vA * (1.0 - d * 3.0)); }`,
    });
    const pts = new THREE.Points(gg, mj); pts.frustumCulled = false; pts.name = 'jatos'; grupo.add(pts); estat.instancias += P_.length / 3;
  }

  // ---------- toldos de café, mesas com guarda-sol, letreiros ----------
  const PALETA = [0xb23a2e, 0x3f6b4a, 0x2a4468, 0xc79a36, 0x7a2f3f, 0x2f7478].map(col);
  {
    // toldo: lona inclinada (do alto da parede para a frente, 1,5 m) com bambolina; listras pelo shader (largura real em metros)
    const g = new THREE.BufferGeometry();
    const v = [-0.5, 2.95, 0, 0.5, 2.95, 0, 0.5, 2.35, 1.5, -0.5, 2.35, 1.5, -0.5, 2.35, 1.5, 0.5, 2.35, 1.5, 0.5, 2.1, 1.5, -0.5, 2.1, 1.5,
      -0.5, 2.95, 0, -0.5, 2.35, 1.5, -0.5, 2.35, 0, 0.5, 2.95, 0, 0.5, 2.35, 0, 0.5, 2.35, 1.5];
    const idx = [0, 3, 2, 0, 2, 1, 4, 7, 6, 4, 6, 5, 8, 10, 9, 11, 13, 12];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex(idx); g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, UL);
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying float vTira;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTira = position.x * length(instanceMatrix[0].xyz);');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vTira;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.88, 0.82), step(0.5, fract(vTira / 0.36)));');
    };
    mat.customProgramCacheKey = () => 'det-toldo';
    instanciar('toldos', g, mat, D.toldos.map(([x, z, a, c, bid]) => ({ x, z, y: altura(x, z), r: a, sx: 3.2 + rnd(bid + c) * 1.8, cor: PALETA[c] })), { sombra: true, cores: true });
  }
  let guardaSois = null;
  {
    const geoMesa = juntar([
      { g: cil(0.4, 0.4, 0.03, 12), c: 0x3a3d3c, m: T(0, 0.74, 0) }, { g: cil(0.03, 0.03, 0.72, 6), c: 0x3a3d3c, m: T(0, 0.37, 0) },
      ...[0, 1, 2].flatMap((k) => { const a = (k / 3) * Math.PI * 2 + 0.4, x = Math.sin(a) * 0.62, z = Math.cos(a) * 0.62;
        return [{ g: caixa(0.38, 0.04, 0.38), c: 0x45403a, m: T(x, 0.45, z, a) }, { g: caixa(0.38, 0.4, 0.03), c: 0x45403a, m: T(x + Math.sin(a) * 0.19, 0.65, z + Math.cos(a) * 0.19, a) },
          { g: cil(0.015, 0.015, 0.45, 4), c: 0x2a2a2a, m: T(x, 0.22, z) }]; }),
    ]);
    const itens = D.mesas.map(([x, z, r, c, bid]) => ({ x, z, y: altura(x, z), r }));
    instanciar('mesas', geoMesa, material('mesa', { luz: false }), itens, { sombra: true });
    // guarda-sol (só de 20 de abril a 10 de outubro, pela data de ceu.estado()): mastro e lona de 8 gomos
    const geoSol = juntar([{ g: cil(0.03, 0.03, 2.5, 6), c: 0x55504a, m: T(0, 1.25, 0) }, { g: new THREE.ConeGeometry(1.35, 0.5, 8, 1, true), c: 0xffffff, m: T(0, 2.55, 0) }]);
    const matSol = material('sol', { luz: false, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    // a cor do guarda-sol vem da instância (vertex color branca × instanceColor); mastro fica claro demais, aceitável
    const CORES_SOL = [0xefe6cf, 0xb23a2e, 0x2f6b4a, 0x2a4468, 0xd9b04a, 0xe3d9c2].map(col);
    guardaSois = instanciar('guarda-sois', geoSol, matSol, itens.map((it, i) => ({ ...it, cor: CORES_SOL[D.mesas[i][3]] })),
      { sombra: true, cores: true });
  }
  {
    // letreiros de loja (bandeira perpendicular à fachada, no alto da porta): atlas 5×5 de textos genéricos, nenhuma marca
    const TEXTOS = ['Café', 'Restaurant', 'Bar', 'Imbiss', 'Glace', 'Bäckerei', 'Mode', 'Schmuck', 'Coiffeur', 'Bücher', 'Blumen', 'Optik', 'Laden', 'Weine', 'Antiquitäten',
      'Wohnen', 'Spielwaren', 'Velo', 'Technik', 'Reisen', 'Geschenke'];
    const FUNDOS = ['#7a2f3f', '#2f5d4a', '#27406a', '#8a6a2a', '#4d3a5e', '#2a5f68'], CW = 160, CH = 128;
    const cv = document.createElement('canvas'); cv.width = CW * 5; cv.height = CH * 5;
    const g = cv.getContext('2d');
    TEXTOS.forEach((tx, i) => {
      const x = (i % 5) * CW, y = Math.floor(i / 5) * CH;
      g.fillStyle = FUNDOS[i % FUNDOS.length]; g.fillRect(x, y, CW, CH);
      g.strokeStyle = '#e9d9a8'; g.lineWidth = 6; g.strokeRect(x + 7, y + 7, CW - 14, CH - 14);
      g.fillStyle = '#f4ead0'; g.textAlign = 'center'; g.textBaseline = 'middle';
      let px = 40; g.font = `bold ${px}px Georgia, serif`;
      while (g.measureText(tx).width > CW - 34 && px > 14) { px -= 2; g.font = `bold ${px}px Georgia, serif`; }
      g.fillText(tx, x + CW / 2, y + CH / 2 + 2);
    });
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const sup = juntar([{ g: caixa(0.04, 0.04, 0.78), c: 0x25292a, m: T(0, 3.35, 0.39) }]);
    sup.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(sup.attributes.position.count * 2), 2));
    const painel = new THREE.BoxGeometry(0.035, 0.52, 0.62).translate(0, 2.98, 0.5).toNonIndexed(); // faces ±x com o atlas
    const np = painel.attributes.position.count;
    painel.setAttribute('color', new THREE.BufferAttribute(new Float32Array(np * 3).fill(1), 3));
    painel.setAttribute('luz', new THREE.BufferAttribute(new Float32Array(np), 1));
    const gs = mergeGeometries([sup, painel]);
    const mat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.7, metalness: 0.05 });
    mat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, UL);
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float iCat;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = (vMapUv + vec2(mod(iCat, 5.0), 4.0 - floor(iCat / 5.0))) / 5.0;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNoite; uniform float uApagao;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.3 * uNoite * (1.0 - uApagao);');
    };
    mat.customProgramCacheKey = () => 'det-letreiro';
    const itens = D.letreiros.map(([x, z, a, cat, bid]) => ({ x, z, y: altura(x, z), r: a }));
    const im = instanciar('letreiros', gs, mat, itens, { sombra: false });
    if (im) gs.setAttribute('iCat', new THREE.InstancedBufferAttribute(Float32Array.from(D.letreiros, (l) => l[3]), 1));
  }

  // ---------- bandeiras de Basel (o Baselstab preto sobre branco) ----------
  let bandeiras = null;
  {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 170;
    const g = cv.getContext('2d');
    g.fillStyle = '#f5f2ea'; g.fillRect(0, 0, 256, 170);
    desenharStab(g, 128, 14, 142, '#141414');
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    // pano: plano paralelo à fachada, preso ao fim do mastro, com onda que cresce para a ponta livre
    const pano = new THREE.PlaneGeometry(1.5, 1.0, 14, 2).translate(0.8, -0.18, 1.95); // pende do fim do mastro, paralela à fachada
    // a bandeira pende do mastro: topo em y=0; o mastro está em juntar() abaixo
    const sup = juntar([{ g: cil(0.03, 0.03, 2.1, 6), c: 0x2b2b2b, m: T(0, 0.36, 0.99, 0, Math.PI / 2 - 0.35) }, { g: caixa(0.12, 0.12, 0.06), c: 0x2b2b2b, m: T(0, 0, 0.03) }]);
    const mat = material('mastro', { luz: false });
    const itens = D.bandeiras.map(([x, z, a, h, bid]) => ({ x, z, y: altura(x, z) + h, r: a }));
    instanciar('bandeiras-mastros', sup, mat, itens);
    const mf = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide });
    mf.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, UL);
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTempo;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  float onda = clamp((position.x - 0.05) / 1.5, 0.0, 1.0);
  transformed.z += sin(position.x * 5.0 - uTempo * 4.5 + instanceMatrix[3].x) * 0.12 * onda;
  transformed.y -= 0.12 * onda * onda;`);
    };
    mf.customProgramCacheKey = () => 'det-bandeira';
    bandeiras = instanciar('bandeiras', pano, mf, itens);
  }

  // ---------- balsas do Reno e navios ----------
  const nivel = () => (nivelAgua ? nivelAgua() : 1.95);
  const matBarco = material('barco', { roughness: 0.55 });
  const rio = D.rio, comp = [0];
  for (let i = 1; i < rio.length; i++) comp.push(comp[i - 1] + Math.hypot(rio[i][0] - rio[i - 1][0], rio[i][1] - rio[i - 1][1]));
  const naRio = (s) => { // posição e rumo (x, z, hx, hz) na linha do rio, parametrizada por comprimento
    s = Math.max(0, Math.min(comp.at(-1) - 0.01, s));
    let i = 1; while (i < comp.length - 1 && comp[i] < s) i++;
    const u = (s - comp[i - 1]) / (comp[i] - comp[i - 1] || 1), [ax, az] = rio[i - 1], [bx, bz] = rio[i], L = Math.hypot(bx - ax, bz - az) || 1;
    return { x: ax + (bx - ax) * u, z: az + (bz - az) * u, hx: (bx - ax) / L, hz: (bz - az) / L };
  };
  const casco = (L, B, y0, y1, proa = 0.18, popa = 0.04) => {
    const s = new THREE.Shape();
    s.moveTo(-L / 2, -B / 2 + B * popa); s.lineTo(-L / 2 + L * popa, -B / 2); s.lineTo(L / 2 - L * proa, -B / 2); s.lineTo(L / 2, -B * 0.1);
    s.lineTo(L / 2, B * 0.1); s.lineTo(L / 2 - L * proa, B / 2); s.lineTo(-L / 2 + L * popa, B / 2); s.lineTo(-L / 2, B / 2 - B * popa); s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y0, 0);
  };
  const barcos = []; // { obj, x, z, hx, hz, atualiza(t) }
  function novoBarco(geo, luzes = true) {
    const m = new THREE.Mesh(geo, matBarco); m.castShadow = m.receiveShadow = !leve; m.frustumCulled = false;
    const o = new THREE.Group(); o.add(m); grupo.add(o); estat.malhas++; return o;
  }
  const poseBarco = (o, x, z, hx, hz) => { o.position.set(x, nivel(), z); o.rotation.y = Math.atan2(-hz, hx); };

  // balsa de cabo (Gierseilfähre): casco de madeira, teto sobre quatro pilares, mastro para a roldana; vai e volta pendurada no cabo
  const balsas = [];
  const cabos = new THREE.Group(); cabos.name = 'cabos'; grupo.add(cabos);
  const CORES_BALSA = { Leu: [0x4d3a2b, 0xc9c2ae, 0x2f5d4a], 'Vogel Gryff': [0x4d3a2b, 0xd8d0bc, 0x8b2f2a] };
  for (const [bi, bb] of D.balsas.entries()) {
    const [cc, ct, cp] = CORES_BALSA[bb.nome] || [0x4d3a2b, 0xd8d0bc, 0x333333];
    const geo = juntar([
      { g: casco(12.5, 3.1, -0.6, 0.55, 0.12, 0.02), c: cc }, { g: casco(12.0, 2.8, 0.55, 0.62, 0.12, 0.02), c: 0x8a7556 },
      ...[[-4.4, -1.2], [-4.4, 1.2], [4.4, -1.2], [4.4, 1.2], [0, -1.2], [0, 1.2]].map(([x, z]) => ({ g: cil(0.05, 0.05, 2.1, 6), c: cp, m: T(x, 1.67, z) })),
      { g: caixa(10.2, 0.1, 3.0), c: ct, m: T(0, 2.75, 0) }, { g: caixa(9.0, 0.06, 0.4), c: 0x6b5236, m: T(0, 0.82, -1.0) }, { g: caixa(9.0, 0.06, 0.4), c: 0x6b5236, m: T(0, 0.82, 1.0) },
      { g: cil(0.08, 0.06, 3.0, 6), c: 0x2b2b2b, m: T(0.6, 4.2, 0) }, { g: new THREE.SphereGeometry(0.16, 8, 6), c: VIDRO, luz: 1, m: T(0, 2.45, 0) },
      { g: new THREE.SphereGeometry(0.1, 6, 4), c: 0xff7a5a, luz: 1, m: T(-5.9, 1.1, 0) }, { g: new THREE.SphereGeometry(0.1, 6, 4), c: 0xfff0c0, luz: 1, m: T(6.0, 1.1, 0) },
    ]);
    const o = novoBarco(geo); o.visible = true;
    const [ax, az] = bb.a, [bx, bz] = bb.b, topo = 9;
    const yA = altura(ax, az) + topo, yB = altura(bx, bz) + topo;
    // cabo no alto (catenária rasa) e dois mastros nas margens
    const pc = [];
    for (let k = 0; k <= 24; k++) { const u = k / 24; pc.push(ax + (bx - ax) * u, yA + (yB - yA) * u - 1.6 * 4 * u * (1 - u), az + (bz - az) * u); }
    const gc = new THREE.BufferGeometry(); gc.setAttribute('position', new THREE.Float32BufferAttribute(pc, 3));
    const cabo = new THREE.Line(gc, new THREE.LineBasicMaterial({ color: 0x1e1e1e })); cabo.frustumCulled = false; cabos.add(cabo);
    for (const [px, pz, py] of [[ax, az, yA], [bx, bz, yB]]) {
      const mastro = new THREE.Mesh(cil(0.18, 0.12, topo + 1, 6), new THREE.MeshStandardMaterial({ color: 0x4a4f4c, roughness: 0.6 }));
      mastro.position.set(px, py - (topo + 1) / 2 + 0.5, pz); mastro.castShadow = !leve; cabos.add(mastro);
    }
    const corda = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x2a2520 })); corda.frustumCulled = false; cabos.add(corda);
    balsas.push({ bb, o, corda, yA, yB, fase: bi * 37 });
    estat.instancias += 1;
  }
  const rumoRio = (x, z) => { // direção da corrente (rumo a jusante) perto de (x, z)
    let melhor = 0, d = 1e9; for (let i = 0; i < rio.length; i++) { const dd = Math.hypot(rio[i][0] - x, rio[i][1] - z); if (dd < d) { d = dd; melhor = i; } }
    const p = naRio(comp[melhor]); return [p.hx, p.hz];
  };
  const ease = (t) => t * t * (3 - 2 * t);
  const PERIODO = 130, TRAVESSIA = 50, ESPERA = 15;
  function moverBalsas(t, noite) {
    for (const b of balsas) {
      const [ax, az] = b.bb.a, [bx, bz] = b.bb.b;
      let c = ((t + b.fase) % PERIODO) / 1, u, ida;
      // 0..ESPERA parada em A; ..+TRAVESSIA A→B; espera em B; volta
      if (c < ESPERA) { u = 0; ida = true; } else if (c < ESPERA + TRAVESSIA) { u = ease((c - ESPERA) / TRAVESSIA); ida = true; }
      else if (c < 2 * ESPERA + TRAVESSIA) { u = 1; ida = false; } else { u = 1 - ease((c - 2 * ESPERA - TRAVESSIA) / TRAVESSIA); ida = false; }
      if (noite > 0.8) { u = 0; ida = true; } // de noite fica atracada
      const x = ax + (bx - ax) * u, z = az + (bz - az) * u;
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, [fx, fz] = rumoRio(x, z);
      // a proa aponta contra a corrente, inclinada para o lado da travessia (como as balsas reais)
      const sgn = ida ? 1 : -1;
      let hx = -fx * 0.9 + (dx / L) * sgn * 0.45, hz = -fz * 0.9 + (dz / L) * sgn * 0.45; const Hh = Math.hypot(hx, hz) || 1; hx /= Hh; hz /= Hh;
      poseBarco(b.o, x, z, hx, hz);
      const yc = b.yA + (b.yB - b.yA) * u - 1.6 * 4 * u * (1 - u), pa = b.corda.geometry.attributes.position;
      pa.setXYZ(0, x + 0.6 * hx, nivel() + 5.6, z + 0.6 * hz); pa.setXYZ(1, x, yc, z); pa.needsUpdate = true;
    }
  }

  // navios: cargueiro (sobe e desce o rio), barco de passeio e um barco de passeio atracado no cais da Schifflände
  const cargueiro = (() => {
    const L = 86, B = 9.6;
    return juntar([
      { g: casco(L, B, -2.2, 0, 0.16, 0.03), c: 0x7a2a22 }, { g: casco(L, B, 0, 1.5, 0.16, 0.03), c: 0x23364d },
      { g: caixa(L * 0.6, 0.8, B * 0.78), c: 0x39495a, m: T(L * 0.05, 1.9, 0) }, { g: caixa(L * 0.58, 0.14, B * 0.74), c: 0x8a8f94, m: T(L * 0.05, 2.35, 0) },
      { g: caixa(6.5, 3.0, B * 0.88), c: 0xeeebe2, m: T(-L / 2 + 5.5, 3.0, 0) }, { g: caixa(6.55, 0.9, B * 0.89), c: 0x24323d, m: T(-L / 2 + 5.5, 3.6, 0) },
      { g: caixa(6.2, 0.9, B * 0.86), c: 0xffe0a0, luz: 1, m: T(-L / 2 + 5.5, 3.6, 0) },
      { g: caixa(6.7, 0.2, B * 0.9), c: 0xdad6cc, m: T(-L / 2 + 5.5, 4.55, 0) }, { g: cil(0.1, 0.1, 3.5, 6), c: 0x2b2b2b, m: T(-L / 2 + 5.5, 6.2, 0) },
      { g: caixa(3.0, 2.0, 3.0), c: 0xc8c4b8, m: T(-L / 2 + 10.5, 2.5, 0) },
      { g: new THREE.SphereGeometry(0.2, 6, 4), c: 0xfff0c0, luz: 1, m: T(-L / 2 + 5.5, 8.0, 0) },
      { g: new THREE.SphereGeometry(0.2, 6, 4), c: 0xff6a4a, luz: 1, m: T(L / 2 - 4, 2.3, -B / 2 + 0.6) }, { g: new THREE.SphereGeometry(0.2, 6, 4), c: 0x6aff8a, luz: 1, m: T(L / 2 - 4, 2.3, B / 2 - 0.6) },
    ]);
  })();
  const passeio = (() => {
    const L = 36, B = 7.4;
    return juntar([
      { g: casco(L, B, -0.9, 0, 0.14, 0.03), c: 0x2a4468 }, { g: casco(L, B, 0, 1.7, 0.14, 0.03), c: 0xf2efe6 },
      { g: caixa(L * 0.66, 2.0, B * 0.84), c: 0xf6f3ea, m: T(-L * 0.04, 2.7, 0) }, { g: caixa(L * 0.67, 0.75, B * 0.85), c: 0x24323d, m: T(-L * 0.04, 2.95, 0) },
      { g: caixa(L * 0.65, 0.75, B * 0.86), c: 0xffe0a0, luz: 1, m: T(-L * 0.04, 2.95, 0) },
      { g: caixa(L * 0.6, 0.12, B * 0.9), c: 0x3a5a7a, m: T(-L * 0.04, 3.8, 0) }, { g: caixa(L * 0.34, 1.7, B * 0.7), c: 0xf6f3ea, m: T(L * 0.02, 4.65, 0) },
      { g: caixa(L * 0.35, 0.12, B * 0.76), c: 0x3a5a7a, m: T(L * 0.02, 5.55, 0) }, { g: cil(0.08, 0.08, 3.0, 6), c: 0x2b2b2b, m: T(L * 0.02, 7.0, 0) },
      { g: new THREE.SphereGeometry(0.18, 6, 4), c: 0xfff0c0, luz: 1, m: T(L * 0.02, 8.6, 0) },
    ]);
  })();
  const navios = [
    { geo: cargueiro, tipo: 'cargueiro', v: 2.4, fase: 0.35, sentido: 1 },
    { geo: passeio, tipo: 'passeio', v: 3.6, fase: 0.8, sentido: -1 },
  ].map((n) => ({ ...n, o: novoBarco(n.geo) }));
  // barco atracado no cais da Schifflände (OSM man_made=pier): paralelo à margem, proa rio acima
  let atracado = null;
  if (D.pier?.length) {
    const cx = D.pier.reduce((a, p) => a + p[0], 0) / D.pier.length, cz = D.pier.reduce((a, p) => a + p[1], 0) / D.pier.length;
    let melhor = 0, dm = 1e9; for (let i = 0; i < rio.length; i++) { const d = Math.hypot(rio[i][0] - cx, rio[i][1] - cz); if (d < dm) { dm = d; melhor = i; } }
    const p = naRio(comp[melhor]);
    atracado = novoBarco(passeio);
    const nx = -p.hz, nz = p.hx; // normal ao rio, apontando para o lado do cais
    const lado = Math.sign((cx - p.x) * nx + (cz - p.z) * nz) || 1;
    poseBarco(atracado, cx - nx * lado * 6.5, cz - nz * lado * 6.5, -p.hx, -p.hz);
  }
  function moverNavios(t) {
    const total = comp.at(-1) + 160;
    for (const n of navios) {
      const raw = ((t * n.v + n.fase * total) % total + total) % total;
      const s = n.sentido > 0 ? raw - 80 : total - raw - 80;
      const p = naRio(s), off = n.sentido > 0 ? 5.5 : -5.5; // mão direita: cada sentido ocupa um lado do canal
      n.o.visible = s > 0 && s < comp.at(-1) - 1;
      const hx = p.hx * n.sentido, hz = p.hz * n.sentido;
      poseBarco(n.o, p.x - p.hz * off, p.z + p.hx * off, hx, hz);
    }
  }

  // ---------- laço próprio: relógio dos jatos, ondas, bandeiras, balsas, luz de noite e estação ----------
  const t0 = performance.now();
  let ultimo = 0;
  const mesAno = (d) => { const [, m, dia] = d.split('-').map(Number); return m * 100 + dia; };
  function quadro(agora) {
    requestAnimationFrame(quadro);
    const t = (agora - t0) / 1000;
    if (agora - ultimo < (leve ? 40 : 15)) return; // no modo leve, ~25 quadros/s para o movimento
    ultimo = agora;
    const est = ceu.estado(), noite = est.noite;
    UL.uTempo.value = t;
    const ligada = (noite < 0.15 ? 0 : Math.min(1, (noite - 0.15) / 0.45)) * (1 - UL.uApagao.value); // Morgestraich: postes apagados
    UL.uLuz.value = ligada * 4.5; // acima de 1: entra no bloom noturno (limiar 0,9)
    if (pocas) { pocas.visible = ligada > 0.02; matPocas(ligada); }
    UL.uPx.value = renderer.domElement.height * 0.5;
    if (guardaSois) { const md = mesAno(est.data); guardaSois.visible = md >= 420 && md <= 1010; }
    moverBalsas(t, noite);
    moverNavios(t);
  }
  const matPocas = (l) => { if (pocas) pocas.material.color.setRGB(0.5 * l, 0.31 * l, 0.14 * l); };
  requestAnimationFrame(quadro);
  const api = { grupo, estat, D, balsas, navios, UL };
  window.detalhes = api;
  return api;
}
