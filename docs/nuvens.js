// Nuvens no céu (ceu.js desenha a camada, a ~1,5 km). As sombras delas no chão saíram em 2026-11-19: as manchas de luz
// andando pela cidade pareciam holofotes de festa. injetarSombra() fica aqui, sem uso, caso se queira voltar.
// A cobertura e o vento são os de agora em Basel quando o relógio está ao vivo (Open-Meteo, sem chave; nada do usuário vai
// no pedido); senão, a média do mês (Basel: céu mais fechado no inverno). Uso: injetarSombra(shader, 'vMundoXZ').
import * as THREE from 'three';

const ALTURA = 1500; // m
export const NUV = {
  uNuvT: { value: 0 }, uNuvCob: { value: 0.45 }, uNuvVento: { value: new THREE.Vector2(4, 1.5) },
  uSolDir: { value: new THREE.Vector3(0, 1, 0) }, uNuvDia: { value: 1 },
  // três camadas (2026-11-19): baixa (~1,2 km), média (~3,5 km) e alta (cirros, ~9 km), cada uma com a sua cobertura
  uNuvBaixa: { value: 0.3 }, uNuvMedia: { value: 0.2 }, uNuvAlta: { value: 0.2 },
  // mapa do tempo de agora em volta de Basel (2026-11-21): r baixa, g média, b alta (Open-Meteo numa grade de 5 × 5 pontos)
  // e a chuva do radar (RainViewer); cobre uNuvMapaExt metros, centrado na cidade. Ligado só ao vivo
  uNuvMapa: { value: null }, uNuvMapaOn: { value: 0 }, uNuvMapaExt: { value: 40000 },
};
// média de nebulosidade por mês em Basel (0..1, MeteoSchweiz, aproximada)
const MEDIA = [0.78, 0.72, 0.64, 0.6, 0.6, 0.55, 0.5, 0.52, 0.56, 0.66, 0.78, 0.82];

export const GLSL_NUVEM = `
uniform float uNuvT, uNuvCob, uNuvDia; uniform vec2 uNuvVento; uniform vec3 uSolDir;
float nvH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nvN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(nvH(i), nvH(i + vec2(1, 0)), f.x), mix(nvH(i + vec2(0, 1)), nvH(i + vec2(1, 1)), f.x), f.y); }
float nvFbm(vec2 p) { float a = 0.5, s = 0.0; for (int k = 0; k < 5; k++) { s += a * nvN(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
// densidade da nuvem (0..1) no ponto xz da camada
float nuvem(vec2 xz) {
  // cúmulos de algumas centenas de metros; a cobertura desloca o limiar (0,2 → poucas nuvens, 0,9 → quase fechado)
  float f = nvFbm((xz + uNuvVento * uNuvT) / 240.0);
  float c = mix(0.68, 0.30, uNuvCob);
  return smoothstep(c, c + 0.07, f);
}
// sombra no chão: a nuvem que fica entre o ponto e o sol
// camadas do céu: cobertura 0..1 de cada uma desloca o limiar do ruído; a alta é esticada no sentido do vento (cirros)
uniform float uNuvBaixa, uNuvMedia, uNuvAlta; uniform sampler2D uNuvMapa; uniform float uNuvMapaOn, uNuvMapaExt;
// o mapa do tempo no ponto (fora dos 40 km, a borda); sem mapa, as coberturas únicas
vec4 mapaNuv(vec2 xz) { return uNuvMapaOn > 0.5 ? texture2D(uNuvMapa, clamp(xz / uNuvMapaExt + 0.5, 0.0, 1.0)) : vec4(uNuvBaixa, uNuvMedia, uNuvAlta, 0.0); }
float camadaBaixa(vec2 xz) { vec4 mp = mapaNuv(xz); float cob = max(mp.r, mp.a * 0.9); float f = nvFbm((xz + uNuvVento * uNuvT) / 260.0); float c = mix(0.70, 0.28, cob); return smoothstep(c, c + 0.09, f); }
float camadaMedia(vec2 xz) { float cob = mapaNuv(xz).g; vec2 p = (xz + uNuvVento * uNuvT * 1.6) / 520.0; float f = nvFbm(p) * 0.75 + nvN(p * 6.0) * 0.25; float c = mix(0.68, 0.32, cob); return smoothstep(c, c + 0.06, f); }
float camadaAlta(vec2 xz) {
  vec2 v = normalize(uNuvVento + vec2(1e-3)), n = vec2(-v.y, v.x);
  vec2 p = xz + uNuvVento * uNuvT * 3.0; p = vec2(dot(p, v) / 2600.0, dot(p, n) / 380.0);
  float f = nvFbm(p); float c = mix(0.72, 0.38, mapaNuv(xz).b); return smoothstep(c, c + 0.12, f) * 0.6;
}
float sombraNuvem(vec2 xz) {
  vec2 desvio = uSolDir.xz / max(uSolDir.y, 0.12) * ${ALTURA.toFixed(1)};
  return nuvem(xz + desvio) * uNuvDia; // 0 = sol, 1 = sombra de nuvem
}`;

// injeta a sombra das nuvens num MeshStandard/Lambert: `xz` é a expressão GLSL da posição no mundo (no fragment)
export function injetarSombra(s, xz) {
  Object.assign(s.uniforms, NUV);
  s.fragmentShader = s.fragmentShader
    .replace('#include <common>', `#include <common>\n${GLSL_NUVEM}`)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  { float sn = sombraNuvem(${xz});
    reflectedLight.directDiffuse *= 1.0 - 0.85 * sn; reflectedLight.directSpecular *= 1.0 - 0.9 * sn;
    reflectedLight.indirectDiffuse *= 1.0 - 0.18 * sn; }`);
}

let ultimo = null, buscado = false;
export function atualizarNuvens(agora, ceu) {
  const dt = ultimo == null ? 0 : Math.min(0.1, (agora - ultimo) / 1000);
  ultimo = agora;
  NUV.uNuvT.value += dt * 6; // o vento real é ~m/s; acelerado 6x para a sombra andar na tela
  const e = ceu.estado();
  NUV.uSolDir.value.copy(e.dir);
  NUV.uNuvDia.value = THREE.MathUtils.smoothstep(e.altitudeGraus, -2, 8);
  NUV.uNuvMapaOn.value = ceu.aoVivo && NUV.uNuvMapa.value ? 1 : 0; // o mapa é o de agora: com outra data, a média do mês
  if ((!ceu.aoVivo || !NUV.vivo) && !TEMPO.forcado) { // média do mês, repartida entre as camadas (as baixas mandam no inverno de Basel)
    const m = MEDIA[+e.data.slice(5, 7) - 1], inv = m > 0.7 ? 1 : 0;
    NUV.uNuvCob.value = m; NUV.uNuvBaixa.value = m * (0.55 + 0.25 * inv); NUV.uNuvMedia.value = m * 0.4; NUV.uNuvAlta.value = 0.25 + 0.2 * (1 - inv);
  }
  if (ceu.aoVivo && !buscado) { buscado = true; tempoAgora(); }
}

// tempo de agora em Basel (Open-Meteo): cobertura de nuvens, vento, temperatura
export const TEMPO = { ok: false };
window.TEMPO_BASEL = TEMPO; // vida.js lê o calor de agora para o número de nadadores
async function tempoAgora() {
  try {
    const u = 'https://api.open-meteo.com/v1/forecast?latitude=47.557&longitude=7.59&current=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,wind_direction_10m,temperature_2m,precipitation,rain,snowfall,snow_depth,weather_code&timezone=Europe%2FZurich';
    const r = await fetch(u);
    if (!r.ok) return;
    const c = (await r.json()).current;
    NUV.uNuvCob.value = THREE.MathUtils.clamp(c.cloud_cover / 100, 0.05, 0.98);
    if (c.cloud_cover_low != null) { NUV.uNuvBaixa.value = c.cloud_cover_low / 100; NUV.uNuvMedia.value = c.cloud_cover_mid / 100; NUV.uNuvAlta.value = c.cloud_cover_high / 100; }
    // vento de onde sopra (graus) → para onde a nuvem anda, em x (leste) e z (−norte)
    const a = THREE.MathUtils.degToRad(c.wind_direction_10m + 180), v = Math.max(1.5, c.wind_speed_10m / 3.6);
    NUV.uNuvVento.value.set(Math.sin(a) * v, -Math.cos(a) * v);
    NUV.vivo = true;
    Object.assign(TEMPO, { ok: true, temp: c.temperature_2m, nuvens: c.cloud_cover, chuva: c.rain ?? c.precipitation, camadas: [c.cloud_cover_low, c.cloud_cover_mid, c.cloud_cover_high], nevando: c.snowfall || 0, neve: c.snow_depth || 0, codigo: c.weather_code, trovoada: c.weather_code >= 95 });
    dispatchEvent(new CustomEvent('tempo:agora', { detail: TEMPO }));
    mapaTempo().catch(() => {});
  } catch { /* sem rede: fica a média do mês */ }
}
// mapa do tempo em volta: a cobertura de nuvens numa grade de 5 × 5 pontos (~10 km entre eles, Open-Meteo, uma chamada) e
// a chuva do radar (RainViewer, o quadro mais recente, 3 × 3 ladrilhos de zoom 7) → uma textura de 32 × 32 sobre 40 km
const LAT0 = 47.5596, LON0 = 7.5886, EXT = 40000, NG = 5, NT = 32;
async function mapaTempo() {
  const dLat = EXT / (NG - 1) / 111320, dLon = EXT / (NG - 1) / (111320 * Math.cos((LAT0 * Math.PI) / 180));
  const lats = [], lons = [];
  for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) { lats.push((LAT0 + EXT / 2 / 111320 - j * dLat).toFixed(4)); lons.push((LON0 - (EXT / 2) / (111320 * Math.cos((LAT0 * Math.PI) / 180)) + i * dLon).toFixed(4)); }
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=cloud_cover_low,cloud_cover_mid,cloud_cover_high,weather_code&timezone=Europe%2FZurich`);
  if (!r.ok) return;
  const pts = (await r.json()).map((o) => o.current); // na ordem pedida: linha 0 = norte, coluna 0 = oeste
  if (pts.some((p) => p.weather_code >= 95)) TEMPO.trovoada = true; // trovoada por perto: ouve-se de longe
  const chuva = await radarRegiao().catch(() => null); // NT × NT, 0..1, ou null
  const dados = new Uint8Array(NT * NT * 4);
  const amostra = (u, v, k) => { // bilinear na grade 5 × 5
    const x = u * (NG - 1), y = v * (NG - 1), i = Math.min(NG - 2, Math.floor(x)), j = Math.min(NG - 2, Math.floor(y)), fx = x - i, fy = y - j;
    const q = (a, b) => (pts[b * NG + a][k] ?? 0) / 100;
    return q(i, j) * (1 - fx) * (1 - fy) + q(i + 1, j) * fx * (1 - fy) + q(i, j + 1) * (1 - fx) * fy + q(i + 1, j + 1) * fx * fy;
  };
  for (let y = 0; y < NT; y++) for (let x = 0; x < NT; x++) {
    const u = x / (NT - 1), v = y / (NT - 1), o = (y * NT + x) * 4;
    dados[o] = 255 * amostra(u, v, 'cloud_cover_low'); dados[o + 1] = 255 * amostra(u, v, 'cloud_cover_mid'); dados[o + 2] = 255 * amostra(u, v, 'cloud_cover_high');
    dados[o + 3] = chuva ? 255 * chuva[y * NT + x] : 0;
  }
  const t = new THREE.DataTexture(dados, NT, NT, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  NUV.uNuvMapa.value = t; NUV.uNuvMapaExt.value = EXT; NUV.uNuvMapaOn.value = 1;
}
async function radarRegiao() {
  const m = await (await fetch('https://api.rainviewer.com/public/weather-maps.json')).json();
  const q = m.radar?.past?.at(-1); if (!q) return null;
  const z = 7, n = 2 ** z, lr = (LAT0 * Math.PI) / 180;
  const fx = ((LON0 + 180) / 360) * n, fy = ((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2) * n;
  const tx = Math.floor(fx), ty = Math.floor(fy), cv = document.createElement('canvas'); cv.width = cv.height = 768;
  const g = cv.getContext('2d', { willReadFrequently: true });
  await Promise.all([-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => new Promise((ok) => {
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => { g.drawImage(im, (dx + 1) * 256, (dy + 1) * 256); ok(); }; im.onerror = ok;
    im.src = `${m.host}${q.path}/256/${z}/${tx + dx}/${ty + dy}/0/0_0.png`;
  }))));
  const mpp = (156543.03 * Math.cos(lr)) / n, cx = (fx - tx + 1) * 256, cy = (fy - ty + 1) * 256, meio = EXT / 2 / mpp;
  const px = g.getImageData(0, 0, 768, 768).data, out = new Float32Array(NT * NT);
  for (let y = 0; y < NT; y++) for (let x = 0; x < NT; x++) {
    const sx = Math.round(cx - meio + (x / (NT - 1)) * 2 * meio), sy = Math.round(cy - meio + (y / (NT - 1)) * 2 * meio), o = (sy * 768 + sx) * 4;
    out[y * NT + x] = px[o + 3] > 0 ? Math.min(1, 0.35 + (px[o] / 255) * 1.3) : 0; // pixel com chuva: mais forte quanto mais claro
  }
  return out;
}
// ?tempo=trovoada força um temporal (para ver relâmpagos e trovões sem esperar um)
if (new URLSearchParams(location.search).get('tempo') === 'trovoada') {
  Object.assign(TEMPO, { forcado: true, trovoada: true });
  NUV.uNuvBaixa.value = 0.95; NUV.uNuvMedia.value = 0.8; NUV.uNuvCob.value = 0.95;
}
window.nuvens = NUV; // depuração e tour
