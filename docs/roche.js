// Torres da Roche e o campus da Grenzacherstrasse (2026-11-19), fora do recorte a leste: Bau 1 (178 m, 2015) e Bau 2
// (205 m, 2022, o prédio mais alto da Suíça), de Herzog & de Meuron, com os terraços em degraus e as faixas brancas de
// cada andar. Sólidos do swissBUILDINGS3D (script/roche.py → data/roche.json, em decímetros, coordenadas da cidade).
// Em volta, um chão neutro até o horizonte, para as torres não flutuarem no vazio além do recorte.
import * as THREE from 'three';

export async function criarRoche({ cena, U, recorte }) {
  const d = await fetch('data/roche.json').then((r) => r.json());
  const k = 1 / d.escala, pos = [], alta = [];
  for (const p of d.predios) {
    const v = p.v, t = p.t;
    // giro: o volume assinado diz se o sólido veio do avesso (z = −norte espelha o LV95)
    let vol = 0;
    for (let i = 0; i < t.length; i += 3) {
      const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
      vol += v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c]) + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c]);
    }
    for (let i = 0; i < t.length; i += 3) {
      const ord = vol < 0 ? [t[i], t[i + 2], t[i + 1]] : [t[i], t[i + 1], t[i + 2]];
      for (const j of ord) { pos.push(v[j * 3] * k, v[j * 3 + 1] * k, v[j * 3 + 2] * k); alta.push(p.alt > 150 ? 1 : 0); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aTorre', new THREE.Float32BufferAttribute(alta, 1));
  g.computeVertexNormals();
  // fachada: lajes brancas a cada 4,3 m e vidro cinza-azulado entre elas (nas torres, a faixa branca é larga, o "beiral"
  // de cada andar); telhados e terraços em cinza claro; de noite, escritórios acesos aqui e ali
  const mat = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.55, metalness: 0.05, flatShading: true, side: THREE.DoubleSide }); // o LOD2 tem faces com giro trocado
  mat.onBeforeCompile = (s) => {
    s.uniforms.uNoite = U.uNoite;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTorre; varying float vTorre; varying vec3 vRoche;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTorre = aTorre; vRoche = position;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTorre; varying vec3 vRoche; uniform float uNoite; float vidroR = 0.0;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec3 nW = normalize(cross(dFdx(vRoche), dFdy(vRoche)));
    if (abs(nW.y) < 0.4) {
      float andar = mod(vRoche.y - 11.0, 4.3);
      float laje = vTorre > 0.5 ? 1.3 : 0.9;
      vidroR = step(laje, andar);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.42, 0.48), vidroR); // vidro: reflete o céu (sem montantes: de longe viravam ruído)
    } else diffuseColor.rgb *= 0.86;
  }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.12, vidroR);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  if (uNoite > 0.01 && vidroR > 0.5) {
    vec2 cel = floor(vec2(dot(vRoche.xz, vec2(0.7, 0.7)) / 6.0, (vRoche.y - 11.0) / 4.3));
    float acesa = step(0.55, fract(sin(dot(cel, vec2(12.9898, 78.233))) * 43758.5453));
    totalEmissiveRadiance += vec3(0.95, 0.9, 0.78) * acesa * uNoite * 0.9;
  }`);
  };
  mat.customProgramCacheKey = () => 'roche';
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  m.name = 'roche';
  cena.add(m);

  // chão até o horizonte, com um buraco do tamanho do recorte (o relevo fica por cima, a borda some na névoa)
  const { x0, x1, z0, z1, y } = recorte, R = 9000;
  const sh = new THREE.Shape([new THREE.Vector2(-R, -R), new THREE.Vector2(R, -R), new THREE.Vector2(R, R), new THREE.Vector2(-R, R)]);
  // o plano da Shape é xy; depois de girar −90° em x, y vira −z: o buraco vai com z trocado de sinal
  sh.holes.push(new THREE.Path([new THREE.Vector2(x0, -z1), new THREE.Vector2(x0, -z0), new THREE.Vector2(x1, -z0), new THREE.Vector2(x1, -z1)]));
  const gc = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2).translate(0, y, 0);
  const chao = new THREE.Mesh(gc, new THREE.MeshLambertMaterial({ color: 0x7f7a6c }));
  chao.receiveShadow = true;
  chao.name = 'chão de fora';
  cena.add(chao);
  return { malha: m, chao };
}
