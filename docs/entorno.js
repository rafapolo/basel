// Entorno (2026-11-19): o chão de 8 × 7,6 km em volta do recorte e o Reno inteiro, da fronteira alemã à francesa
// (script/entorno.py: Copernicus GLO-30 sem prédios, fundido à borda do relevo fino; rio do OSM). De longe, na névoa, a
// cidade continua até o horizonte em vez de terminar numa borda reta, como uma ilha.
import * as THREE from 'three';

export async function criarEntorno({ cena, base = 'data/' }) {
  // desde 2026-11-19 só o rio fora do recorte (onde não há dados de verdade, não se mostra terreno): o chão do Copernicus
  // (entorno.bin, 136 KB) deixou de ser baixado e montado
  const M = await fetch(base + 'entorno.json').then((r) => r.json());
  // o Reno fora do recorte: água escura e lisa, no nível do rio
  const ga = new THREE.BufferGeometry(), pa = new Float32Array((M.agua.length / 2) * 3);
  for (let i = 0, k = 0; i < M.agua.length; i += 2, k += 3) { pa[k] = M.agua[i]; pa[k + 1] = M.nivel; pa[k + 2] = M.agua[i + 1]; }
  ga.setAttribute('position', new THREE.BufferAttribute(pa, 3)); ga.computeVertexNormals();
  // o tom do Reno do recorte visto de cima (cinza-esverdeado) e fosco: liso e metálico, ele virava uma faixa clara e branca de
  // reflexo do sol, com emenda dura onde começa a água de verdade (2026-11-22)
  const matAgua = new THREE.MeshStandardMaterial({ color: 0x4a5a5c, roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
  matAgua.userData.semNeve = true;
  // some com a distância do recorte (80 a 650 m): longe, a faixa escura e fosca subia pela névoa do horizonte como uma
  // sombra no céu (2026-11-22)
  if (M.recorte) {
    const [x0, z0, x1, z1] = M.recorte; matAgua.transparent = true; matAgua.depthWrite = false;
    matAgua.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vEntP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvEntP = position.xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vEntP;')
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  { vec2 d = max(vec2(${x0.toFixed(1)}, ${z0.toFixed(1)}) - vEntP, vEntP - vec2(${x1.toFixed(1)}, ${z1.toFixed(1)}));
    float fora = length(max(d, 0.0)); gl_FragColor.a *= 1.0 - smoothstep(80.0, 650.0, fora); }`);
    };
  }
  const agua = new THREE.Mesh(ga, matAgua); agua.name = 'Reno (entorno)'; agua.receiveShadow = true;
  cena.add(agua);
  const altura = () => M.nivel; // fora do recorte, só a água
  return { agua, altura };
}
