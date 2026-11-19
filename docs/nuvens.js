// Nuvens no céu (ceu.js desenha a camada, a ~1,5 km). As sombras delas no chão saíram em 2026-11-19: as manchas de luz
// andando pela cidade pareciam holofotes de festa. injetarSombra() fica aqui, sem uso, caso se queira voltar.
// A cobertura e o vento são os de agora em Basel quando o relógio está ao vivo (Open-Meteo, sem chave; nada do usuário vai
// no pedido); senão, a média do mês (Basel: céu mais fechado no inverno). Uso: injetarSombra(shader, 'vMundoXZ').
import * as THREE from 'three';

const ALTURA = 1500; // m
export const NUV = {
  uNuvT: { value: 0 }, uNuvCob: { value: 0.45 }, uNuvVento: { value: new THREE.Vector2(4, 1.5) },
  uSolDir: { value: new THREE.Vector3(0, 1, 0) }, uNuvDia: { value: 1 },
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
  if (!ceu.aoVivo || !NUV.vivo) NUV.uNuvCob.value = MEDIA[+e.data.slice(5, 7) - 1];
  if (ceu.aoVivo && !buscado) { buscado = true; tempoAgora(); }
}

// tempo de agora em Basel (Open-Meteo): cobertura de nuvens, vento, temperatura
export const TEMPO = { ok: false };
async function tempoAgora() {
  try {
    const u = 'https://api.open-meteo.com/v1/forecast?latitude=47.557&longitude=7.59&current=cloud_cover,wind_speed_10m,wind_direction_10m,temperature_2m,precipitation&timezone=Europe%2FZurich';
    const r = await fetch(u);
    if (!r.ok) return;
    const c = (await r.json()).current;
    NUV.uNuvCob.value = THREE.MathUtils.clamp(c.cloud_cover / 100, 0.05, 0.98);
    // vento de onde sopra (graus) → para onde a nuvem anda, em x (leste) e z (−norte)
    const a = THREE.MathUtils.degToRad(c.wind_direction_10m + 180), v = Math.max(1.5, c.wind_speed_10m / 3.6);
    NUV.uNuvVento.value.set(Math.sin(a) * v, -Math.cos(a) * v);
    NUV.vivo = true;
    Object.assign(TEMPO, { ok: true, temp: c.temperature_2m, nuvens: c.cloud_cover, chuva: c.precipitation });
    dispatchEvent(new CustomEvent('tempo:agora', { detail: TEMPO }));
  } catch { /* sem rede: fica a média do mês */ }
}
window.nuvens = NUV; // depuração e tour
