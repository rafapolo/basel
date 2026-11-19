// Neve (2026-11-19): manto branco no que olha para cima (telhados, chão, galhos, marcos) e flocos caindo em volta da
// câmera. Com o relógio ao vivo vale a neve de agora em Basel (Open-Meteo: snow_depth e snowfall, pedidos em nuvens.js);
// numa data escolhida (ou no tour), a climatologia: Basel tem neve de vez em quando de meados de dezembro a fevereiro,
// mais em janeiro. Uso: injetarNeve(shader) em qualquer MeshStandard/Lambert, antes de <emissivemap_fragment>.
import * as THREE from 'three';
import { TEMPO } from './nuvens.js';

export const NEVE = { uNeve: { value: 0 } };
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// cobertura pela data (0..1): dia do ano, com o fim de dezembro valendo como antes de janeiro
export function neveClima(data) {
  const [a, m, d] = data.split('-').map(Number);
  let doy = Math.round((Date.UTC(a, m - 1, d) - Date.UTC(a, 0, 0)) / 86400000);
  if (doy > 340) doy -= 365;
  return ss(-14, 4, doy) * (1 - ss(32, 52, doy));
}

const GLSL = `
uniform float uNeve;
float nvHs(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743); }
float nvRu(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(nvHs(i), nvHs(i + vec2(1, 0)), f.x), mix(nvHs(i + vec2(0, 1)), nvHs(i + vec2(1, 1)), f.x), f.y); }`;
// mancha: expressão GLSL (0..1) que tira neve (ex.: rua limpa); xz: posição no mundo para o ruído das bordas
export function injetarNeve(s, { xz = 'vNeveXZ', tira = '0.0', forca = '1.0' } = {}) {
  Object.assign(s.uniforms, NEVE);
  if (xz === 'vNeveXZ') {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vNeveXZ;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  { vec4 wN = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wN = instanceMatrix * wN;
  #endif
    vNeveXZ = (modelMatrix * wN).xz; }`);
  }
  s.fragmentShader = s.fragmentShader
    .replace('#include <common>', `#include <common>\n${GLSL}${xz === 'vNeveXZ' ? '\nvarying vec2 vNeveXZ;' : ''}`)
    .replace('#include <emissivemap_fragment>', `
  if (uNeve > 0.01) {
    float upN = dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
    float bord = nvRu(${xz} * 0.35) * 0.6 + nvRu(${xz} * 1.7) * 0.4;
    // mais neve quanto mais plana a face; as bordas da mancha seguem o ruído (telhado íngreme guarda menos)
    float nv = smoothstep(0.35, 0.75, upN + (bord - 0.5) * 0.35) * smoothstep(0.0, 0.6, uNeve * 1.25 - bord * 0.45);
    nv *= (1.0 - clamp(${tira}, 0.0, 1.0)) * ${forca};
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.90, 0.92, 0.96) * (0.94 + 0.08 * bord), clamp(nv, 0.0, 1.0));
  }
#include <emissivemap_fragment>`);
}

// flocos: pontos numa caixa de 180 m que acompanha a câmera, caindo a ~1 m/s com o vento
export function criarFlocos({ cena, camera, leve }) {
  const N = leve ? 2500 : 9000, L = 180, H = 90;
  const pos = new Float32Array(N * 3), fase = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = Math.random() * L; pos[i * 3 + 1] = Math.random() * H; pos[i * 3 + 2] = Math.random() * L; fase[i] = Math.random(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aFase', new THREE.BufferAttribute(fase, 1));
  const u = { uT: { value: 0 }, uCam: { value: new THREE.Vector3() }, uDens: { value: 0 }, uVento: { value: new THREE.Vector2(0.6, 0.2) }, uChuva: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false,
    vertexShader: `
uniform float uT, uDens, uChuva; uniform vec3 uCam; uniform vec2 uVento; attribute float aFase; varying float vA; varying float vChuva;
void main() {
  vec3 p = position;
  p.y = mod(p.y - uT * mix(0.8 + aFase * 0.5, 7.0 + aFase * 2.0, uChuva), ${H.toFixed(1)}); // gota: ~8 m/s; floco: ~1 m/s
  p.xz += uVento * uT + vec2(sin(uT * 0.7 + aFase * 30.0), cos(uT * 0.6 + aFase * 20.0)) * 0.6;
  // caixa que dá a volta em torno da câmera (sem salto: cada floco reaparece do outro lado)
  vec3 c = uCam - vec3(${(L / 2).toFixed(1)}, ${(H * 0.45).toFixed(1)}, ${(L / 2).toFixed(1)});
  p.xz = c.xz + mod(p.xz - c.xz, ${L.toFixed(1)});
  p.y = c.y + p.y;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vA = step(aFase, uDens) * (1.0 - smoothstep(60.0, 90.0, -mv.z));
  gl_PointSize = clamp(mix(90.0, 45.0, uChuva) / -mv.z, 1.0, 7.0); vChuva = uChuva;
}`,
    fragmentShader: `
varying float vA; varying float vChuva;
void main() { vec2 d = gl_PointCoord - 0.5; d.x *= mix(1.0, 3.5, vChuva); float a = vA * smoothstep(0.5, 0.15, length(d)); if (a < 0.02) discard; gl_FragColor = vec4(mix(vec3(0.96), vec3(0.72, 0.78, 0.86), vChuva), a * mix(0.9, 0.55, vChuva)); }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false; pts.renderOrder = 5;
  pts.visible = false;
  cena.add(pts);
  return { pts, u };
}

// a cada quadro: cobertura (devagar) e densidade dos flocos
let flocos = null, t0 = null;
export function atualizarNeve(agora, ceu, cena, camera, leve) {
  if (!flocos) flocos = criarFlocos({ cena, camera, leve });
  const dt = t0 == null ? 0 : Math.min(0.1, (agora - t0) / 1000); t0 = agora;
  const e = ceu.estado();
  let alvo, cai;
  let chove = 0;
  if (ceu.aoVivo && TEMPO.ok) { alvo = THREE.MathUtils.clamp((TEMPO.neve || 0) / 0.04, 0, 1); cai = (TEMPO.nevando || 0) > 0 ? Math.min(1, 0.3 + TEMPO.nevando) : 0;
    if (!cai && (TEMPO.chuva || 0) > 0) { chove = 1; cai = Math.min(1, 0.35 + TEMPO.chuva / 3); } } // chuva de agora: as mesmas partículas, como gotas
  else { alvo = neveClima(e.data); cai = alvo > 0.05 ? 0.25 + 0.75 * ss(0.3, 0.9, alvo) : 0; }
  NEVE.uNeve.value += (alvo - NEVE.uNeve.value) * Math.min(1, dt * 1.5);
  const u = flocos.u;
  u.uDens.value += (cai - u.uDens.value) * Math.min(1, dt * 1.5);
  u.uChuva.value += (chove - u.uChuva.value) * Math.min(1, dt * 2);
  u.uT.value += dt;
  u.uCam.value.copy(camera.position);
  flocos.pts.visible = u.uDens.value > 0.01;
}
window.neve = NEVE;
