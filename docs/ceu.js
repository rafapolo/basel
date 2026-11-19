// Luz e céu de Basel: sol real (fórmulas do SunCalc) para a data e a hora locais, céu físico (Preetham, o
// `Sky` do three.js), névoa tirada do mesmo céu, tone mapping ACES com exposição que se ajusta devagar,
// sombras em cascata (CSM), oclusão de ambiente (GTAO) e bloom só de noite. Modo leve: sem CSM, GTAO e bloom.
//
// API para outros módulos (árvores, Reno…): `import { ceu } from './ceu.js'` (ou `window.ceu`):
//   ceu.estado()                  → { data, hora, altitude, azimute, dir, noite, dia, luz:{cor,intensidade}, nascer, poente }
//   ceu.definirHora(h, {animar})  → hora local de Basel, 0–24 (decimal); animar = desliza até lá
//   ceu.definirData('AAAA-MM-DD') → data (só mês e dia mudam o sol de forma visível)
//   ceu.noite(true|false)         → vai para a noite (22h30) ou volta à hora de antes
//   ceu.aoMudar(fn)               → fn(estado) a cada mudança de hora/data (também durante o deslize); devolve quem desliga
//   evento `ceu:mudou` na window  → mesmo estado em `e.detail`
//   ceu.solEm(data, hora)         → estado puro (sem mexer na cena), para sombras de árvores, reflexo do Reno etc.
//   ceu.leve                      → true se o modo leve está ligado
// Direção `dir` e `azimute`: `dir` aponta DO chão PARA o sol, no sistema da cena (x = leste, y = cima, z = −norte);
// `azimute` em radianos a partir do norte, no sentido horário (π/2 = leste); `altitude` em radianos acima do horizonte.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const LAT = 47.557, LNG = 7.59; // Basel
const rad = Math.PI / 180;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---------- sol (SunCalc, domínio público) ----------
function posicaoSol(ms) {
  const d = ms / 86400000 - 0.5 + 2440588 - 2451545;
  const M = rad * (357.5291 + 0.98560028 * d);
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI, e = rad * 23.4397;
  const dec = Math.asin(Math.sin(L) * Math.sin(e));
  const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
  const H = rad * (280.16 + 360.9856235 * d) - rad * -LNG - ra, phi = rad * LAT;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI; // do norte, horário
  return { altitude: alt, azimute: az };
}
// horário de verão da Europa: do último domingo de março ao último de outubro (01:00 UTC)
function deslocamentoBasel(a, m, d) {
  const ultDom = (mes) => { const u = new Date(Date.UTC(a, mes + 1, 0)); return u.getUTCDate() - u.getUTCDay(); };
  const t = Date.UTC(a, m - 1, d, 12);
  return t >= Date.UTC(a, 2, ultDom(2), 1) && t < Date.UTC(a, 9, ultDom(9), 1) ? 2 : 1;
}
function paraMs(data, hora) {
  const [a, m, d] = data.split('-').map(Number);
  return Date.UTC(a, m - 1, d) + (hora - deslocamentoBasel(a, m, d)) * 3600000;
}
// agora no fuso de Basel (Europe/Zurich), qualquer que seja o fuso de quem vê
function agoraEmBasel() {
  const f = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { data: `${f.year}-${f.month}-${f.day}`, hora: +f.hour + +f.minute / 60 + +f.second / 3600 };
}
const hhmm = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

// ---------- céu Preetham em JS (o mesmo cálculo do shader do Sky, para a névoa) ----------
const PARAM = { turbidez: 4, rayleigh: 2, mie: 0.005, g: 0.8 };
function corDoCeu(dir, sol, noite) {
  const TR = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
  const MC = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
  const ci = clamp(sol.y, -1, 1);
  const sunE = 1000 * Math.max(0, 1 - Math.exp(-((1.6110731556870734 - Math.acos(ci)) / 1.5)));
  const fade = 1 - clamp(1 - Math.exp((sol.y * 400000) / 450000));
  const rc = PARAM.rayleigh - (1 - fade);
  const cm = 0.2 * PARAM.turbidez * 10e-18 * 0.434 * PARAM.mie;
  const z = Math.acos(Math.max(0, dir.y));
  const inv = 1 / (Math.cos(z) + 0.15 * Math.pow(93.885 - (z * 180) / Math.PI, -1.253));
  const cosT = dir.dot(sol), rPh = 0.05968310365946075 * (1 + Math.pow(cosT * 0.5 + 0.5, 2));
  const g2 = PARAM.g * PARAM.g, mPh = 0.07957747154594767 * ((1 - g2) / Math.pow(1 - 2 * PARAM.g * cosT + g2, 1.5));
  const mix = clamp(Math.pow(1 - sol.y, 5));
  const nf = [0, 0, 0];
  return TR.map((tr, i) => {
    const bR = tr * rc, bM = cm * MC[i];
    const fex = Math.exp(-(bR * 8400 * inv + bM * 1250 * inv));
    const base = sunE * ((bR * rPh + bM * mPh) / (bR + bM));
    const lin = Math.pow(base * (1 - fex), 1.5) * (1 + (Math.pow(base * fex, 0.5) - 1) * mix);
    const tex = (lin + 0.1 * fex) * 0.04 + [0, 0.0003, 0.00075][i];
    return Math.pow(tex, 1 / (1.2 + 1.2 * fade)) + noite * (NOITE_H[i] + (NOITE_Z[i] - NOITE_H[i]) * clamp(dir.y * 1.5)) + nf[i];
  });
}
const NOITE_H = [0.012, 0.017, 0.04], NOITE_Z = [0.003, 0.005, 0.018]; // horizonte e zênite da noite (linear)

// ---------- estado do sol ----------
const S = { data: '2026-06-21', hora: 15, alvo: 15, ant: null, deslize: null, aposNoite: 15, ouvintes: new Set(), cache: null, cacheChave: '', nascerPoente: null, nascerChave: '' };
function solEm(data, hora) {
  const p = posicaoSol(paraMs(data, hora));
  const ca = Math.cos(p.altitude);
  const dir = new THREE.Vector3(Math.sin(p.azimute) * ca, Math.sin(p.altitude), -Math.cos(p.azimute) * ca);
  const alt = p.altitude / rad;
  const noite = 1 - smooth(-10, 3, alt), dia = smooth(-2, 12, alt);
  const cor = new THREE.Color().setRGB(1, 0.5, 0.2).lerp(new THREE.Color().setRGB(1, 0.93, 0.82), smooth(0, 28, alt));
  return { data, hora, altitude: p.altitude, azimute: p.azimute, altitudeGraus: alt, dir, noite, dia, luz: { cor, intensidade: 3.6 * dia } };
}
function nascerPoente(data) {
  if (S.nascerChave === data) return S.nascerPoente;
  let nasc = null, poe = null, ant = solEm(data, 0).altitude;
  for (let h = 0.1; h <= 24; h += 0.1) {
    const a = solEm(data, h).altitude;
    if (ant < 0 && a >= 0) nasc = h; if (ant >= 0 && a < 0) poe = h;
    ant = a;
  }
  S.nascerChave = data; S.nascerPoente = { nascer: nasc, poente: poe };
  return S.nascerPoente;
}
function estado() {
  const k = `${S.data}|${S.hora.toFixed(4)}`;
  if (S.cacheChave !== k) { S.cache = { ...solEm(S.data, S.hora), ...nascerPoente(S.data) }; S.cacheChave = k; }
  return S.cache;
}
function emitir() {
  const e = estado();
  S.ouvintes.forEach((f) => f(e));
  dispatchEvent(new CustomEvent('ceu:mudou', { detail: e }));
}
const ceu = {
  leve: false,
  estado, solEm, nascerPoente,
  aoVivo: false, // segue o relógio real de Basel até alguém mudar hora, data ou noite
  definirHora(h, { animar = false, vivo = false } = {}) {
    if (!vivo) ceu.aoVivo = false;
    h = ((h % 24) + 24) % 24;
    if (animar) { S.deslize = { de: S.hora, para: h, t0: null }; return; }
    S.deslize = null; S.hora = S.alvo = h; emitir();
  },
  definirData(d, { vivo = false } = {}) { if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { if (!vivo) ceu.aoVivo = false; S.data = d; emitir(); } },
  noite(on) {
    const e = estado();
    if (on) { if (e.noite < 0.5) { S.aposNoite = S.hora; ceu.definirHora(22.5, { animar: true }); } }
    else if (e.noite >= 0.5) ceu.definirHora(S.aposNoite, { animar: true });
  },
  aoMudar(f) { S.ouvintes.add(f); return () => S.ouvintes.delete(f); },
};
window.ceu = ceu;

// ---------- cena: céu, luzes, sombras e pós-processamento ----------
export async function iniciarCeu({ cena, renderer, camera, hemi, sol, U, patchNormal, leve = false, pixelMax = 1.5 }) {
  ceu.leve = leve;
  const q = new URLSearchParams(location.search);
  // sem ?hora/?data/?noite: abre na hora e na data reais de Basel e acompanha o relógio (a cada 20 s)
  const agora = agoraEmBasel();
  S.data = q.get('data') || agora.data;
  S.hora = S.alvo = q.get('hora') != null ? +q.get('hora') : q.get('noite') ? 22.5 : agora.hora;
  if (q.get('noite')) S.aposNoite = 15;
  ceu.aoVivo = !q.get('hora') && !q.get('data') && !q.get('noite');
  setInterval(() => {
    if (!ceu.aoVivo || S.deslize) return;
    const a = agoraEmBasel();
    if (a.data !== S.data) ceu.definirData(a.data, { vivo: true });
    ceu.definirHora(a.hora, { vivo: true });
  }, 20000);
  const fundo = cena.background;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  // céu: cena à parte, desenhada antes (a cúpula do Sky fica sempre no fundo)
  const cenaCeu = new THREE.Scene();
  const sky = new Sky();
  sky.scale.setScalar(450000);
  const su = sky.material.uniforms;
  su.turbidity.value = PARAM.turbidez; su.rayleigh.value = PARAM.rayleigh; su.mieCoefficient.value = PARAM.mie; su.mieDirectionalG.value = PARAM.g;
  su.uNoite = { value: 0 };
  sky.material.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader
      .replace('void main() {', 'uniform float uNoite;\nvoid main() {')
      // abaixo do horizonte (fora do recorte, vista de cima) o Preetham dava um cinza-claro chapado (#e8e8ea): escurece
    // para uma bruma de terra distante, verde-acinzentada, que deixa a borda da cidade legível
    .replace('gl_FragColor = vec4( retColor, 1.0 );', `retColor = mix(retColor, retColor * vec3(0.3, 0.34, 0.32), smoothstep(0.0, -0.35, direction.y));
    retColor += uNoite * mix(vec3(${NOITE_H.join(',')}), vec3(${NOITE_Z.join(',')}), clamp(direction.y * 1.5, 0.0, 1.0));
    gl_FragColor = vec4( retColor, 1.0 );`);
  };
  cenaCeu.add(sky);

  const dirLuz = new THREE.Vector3(), lua = new THREE.Vector3(-0.35, 0.8, 0.45).normalize(), luaCor = new THREE.Color(0x8fa6e6);
  const hemiDia = { c: new THREE.Color(0xfff6e4), g: new THREE.Color(0xb9a785) }, hemiNoite = { c: new THREE.Color(0x4a5a86), g: new THREE.Color(0x1d1a22) };
  const contra = new THREE.DirectionalLight(0xffffff, 0), corContra = new THREE.Color(0xffd9a8); cena.add(contra);
  let luzes = [sol], csm = null, composer = null, gtao = null, bloom = null, expo = 1, fundoOculto = false, csmPronto = false;

  if (leve) {
    sol.shadow.mapSize.set(2048, 2048);
  } else {
    const [{ CSM }, { EffectComposer }, { RenderPass }, { GTAOPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
      import('three/addons/csm/CSM.js'), import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/GTAOPass.js'), import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/OutputPass.js'),
    ]);
    sol.castShadow = false; sol.visible = false;
    csm = new CSM({ camera, parent: cena, cascades: 3, maxFar: 1800, mode: 'practical', shadowMapSize: 2048, shadowBias: -0.0004,
      lightDirection: new THREE.Vector3(-0.5, -1, -0.3).normalize(), lightIntensity: 3, lightNear: 1, lightFar: 4000, lightMargin: 500 });
    csm.fade = true;
    luzes = csm.lights;
    luzes.forEach((l, i) => { l.shadow.normalBias = 0.25 + i * 0.4; });
    const w = innerWidth, h = innerHeight, pr = Math.min(renderer.getPixelRatio(), pixelMax);
    const alvoRT = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, alvoRT);
    composer.setPixelRatio(pr);
    const passeCeu = new RenderPass(cenaCeu, camera);
    const passeCena = new RenderPass(cena, camera);
    passeCena.clear = false; passeCena.clearDepth = true;
    gtao = new GTAOPass(cena, camera, w, h);
    gtao.updateGtaoMaterial({ radius: 6, distanceExponent: 1.5, thickness: 6, scale: 1.1, samples: 8, distanceFallOff: 1, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 8 });
    gtao.blendIntensity = 0.9;
    if (q.get('dbg') === 'ao') gtao.output = GTAOPass.OUTPUT.AO; if (q.get('dbg') === 'normal') gtao.output = GTAOPass.OUTPUT.Normal;
    // o G-buffer do GTAO também precisa da máquina do tempo (prédios que sobem), senão o AO erra com o ano < 2026
    gtao.normalMaterial.flatShading = true; // os prédios não têm atributo normal (o material deles usa flatShading)
    if (patchNormal) { gtao.normalMaterial.onBeforeCompile = patchNormal; gtao.normalMaterial.customProgramCacheKey = () => 'gtao-ano'; }
    bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0, 0.55, 0.9);
    composer.addPass(passeCeu); composer.addPass(passeCena); if (q.get('dbg') !== 'nogtao') composer.addPass(gtao); composer.addPass(bloom); composer.addPass(new OutputPass());
    ceu.aoMeia = () => { const sz = composer.renderTarget1; gtao.setSize(Math.round(sz.width / 2), Math.round(sz.height / 2)); };
    ceu.aoMeia();
    csm.update();
  }

  // todo material da cena recebe a sombra em cascata; encadeia o onBeforeCompile que já existia (a máquina do tempo)
  function ligarCSM() {
    csmPronto = true;
    if (!csm || q.get('dbg') === 'nocsm') return;
    const vistos = new Set();
    cena.traverse((o) => {
      for (const m of [].concat(o.material || [])) {
        if (vistos.has(m) || !m.isMeshLambertMaterial && !m.isMeshPhongMaterial && !m.isMeshStandardMaterial) continue;
        vistos.add(m);
        const antes = m.onBeforeCompile, chave = m.customProgramCacheKey();
        csm.setupMaterial(m);
        const dele = m.onBeforeCompile;
        m.onBeforeCompile = function (s, r) { antes.call(this, s, r); dele.call(this, s, r); };
        m.customProgramCacheKey = () => `csm|${chave || ''}`;
        m.needsUpdate = true;
      }
    });
  }

  const vFrente = new THREE.Vector3();
  let tAnt = null, ultimoEmit = '';
  function atualizar(agora) {
    const dt = tAnt == null ? 0.016 : Math.min(0.1, (agora - tAnt) / 1000); tAnt = agora;
    // deslize suave da hora (3 s, com ease)
    if (S.deslize) {
      const d = S.deslize; if (d.t0 == null) d.t0 = agora;
      const k = clamp((agora - d.t0) / 3000), e = k * k * (3 - 2 * k);
      S.hora = d.de + (d.para - d.de) * e; if (k >= 1) { S.hora = d.para; S.deslize = null; }
      emitir();
    }
    const e = estado(), n = e.noite;
    const chave = `${e.data}|${e.hora.toFixed(3)}`;
    if (chave !== ultimoEmit) { ultimoEmit = chave; atualizarUI(e); }
    U.uNoite.value = n;
    document.body.classList.toggle('noite', n > 0.5);

    // luz: sol de dia, lua azulada de noite (a troca acontece com as duas quase apagadas)
    const lunar = e.altitude < 0, intens = lunar ? 0.55 * smooth(-3, -12, e.altitudeGraus) : e.luz.intensidade;
    dirLuz.copy(lunar ? lua : e.dir);
    if (!lunar && dirLuz.y < 0.07) { dirLuz.y = 0.07; dirLuz.normalize(); } // sol rasante: não deixa a sombra esticar ao infinito
    const cor = lunar ? luaCor : e.luz.cor;
    if (csm) { csm.lightDirection.copy(dirLuz).negate(); luzes.forEach((l) => { l.color.copy(cor); l.intensity = intens; }); csm.update(); }
    else { sol.position.copy(sol.target.position).addScaledVector(dirLuz, 900); sol.color.copy(cor); sol.intensity = intens; }
    hemi.color.copy(hemiDia.c).lerp(hemiNoite.c, n); hemi.groundColor.copy(hemiDia.g).lerp(hemiNoite.g, n);
    hemi.intensity = 0.35 + 0.8 * e.dia + 0.2 * n;
    // contraluz fraca do lado oposto ao sol (separa telhados e paredes na sombra), como na sim do tocador
    contra.position.set(-dirLuz.x, 0.45, -dirLuz.z).normalize().multiplyScalar(800);
    contra.color.copy(hemiNoite.c).lerp(corContra, e.dia); contra.intensity = 0.5 * e.dia + 0.15 * n;

    // céu e névoa
    su.sunPosition.value.copy(e.dir).multiplyScalar(400000);
    su.uNoite.value = n;
    camera.getWorldDirection(vFrente); vFrente.y = 0; if (vFrente.lengthSq() < 1e-4) vFrente.set(0, 0, -1);
    vFrente.normalize(); vFrente.y = 0.03; vFrente.normalize();
    const [fr, fg, fb] = corDoCeu(vFrente, e.dir, n);
    cena.fog.color.setRGB(fr, fg, fb, THREE.LinearSRGBColorSpace);
    // névoa que acompanha a câmera (como na sim do tocador): de 900–2600 m fixos, a câmera alta (500–900 m) via a
    // cidade do outro lado do recorte já leitosa; o começo e o fim crescem com a distância da câmera ao centro
    const dc = camera.position.length();
    cena.fog.near = Math.max(900, 300 + 0.9 * dc); cena.fog.far = cena.fog.near + 1700 + dc;
    if (fundo) fundo.copy(cena.fog.color);

    // exposição: mais aberta com o sol baixo e de noite, devagar (constante de ~1,2 s)
    const alvoExpo = 0.62 + 0.55 * smooth(25, 0, e.altitudeGraus) + 0.55 * n;
    expo += (alvoExpo - expo) * (1 - Math.exp(-dt / 1.2));
    renderer.toneMappingExposure = expo;
    if (bloom) { bloom.strength = 0.75 * n; bloom.enabled = n > 0.03; }
    if (gtao) gtao.blendIntensity = 0.9 - 0.3 * n;
  }

  // controles na página (hora, data, modo leve)
  const hr = document.getElementById('c-hora'), dt = document.getElementById('c-data'), tx = document.getElementById('hora-txt'), info = document.getElementById('sol-info'), lv = document.getElementById('c-leve');
  function atualizarUI(e) {
    if (hr && document.activeElement !== hr) hr.value = e.hora;
    const cn = document.getElementById('c-noite'); if (cn) cn.checked = e.noite > 0.5;
    if (tx) tx.textContent = hhmm(e.hora);
    if (dt && dt.value !== e.data) dt.value = e.data;
    if (info) info.textContent = `${Math.round(e.altitudeGraus)}° · ${e.nascer ? hhmm(e.nascer) : '—'} → ${e.poente ? hhmm(e.poente) : '—'}`;
  }
  hr?.addEventListener('input', () => ceu.definirHora(+hr.value));
  dt?.addEventListener('change', () => ceu.definirData(dt.value));
  if (lv) {
    lv.checked = leve;
    lv.addEventListener('change', () => { const p = new URLSearchParams(location.search); p.set('leve', lv.checked ? '1' : '0'); location.search = p.toString(); });
  }

  ceu.atualizar = atualizar;
  ceu.redimensionar = (w, h) => {
    if (composer) { composer.setPixelRatio(Math.min(renderer.getPixelRatio(), pixelMax)); composer.setSize(w, h); ceu.aoMeia(); csm.updateFrustums(); }
  };
  ceu.render = () => {
    if (!csmPronto) ligarCSM();
    cena.background = null; // o céu é desenhado à parte
    if (composer) composer.render();
    else { renderer.autoClear = false; renderer.clear(); renderer.render(cenaCeu, camera); renderer.clearDepth(); renderer.render(cena, camera); renderer.autoClear = true; }
    cena.background = fundo;
  };
  ceu.pronto = true;
  atualizarUI(estado());
  return ceu;
}
export { ceu, posicaoSol, corDoCeu };
