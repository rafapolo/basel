// Entorno (2026-11-19): o chão de 8 × 7,6 km em volta do recorte e o Reno inteiro, da fronteira alemã à francesa
// (script/entorno.py: Copernicus GLO-30 sem prédios, fundido à borda do relevo fino; rio do OSM). De longe, na névoa, a
// cidade continua até o horizonte em vez de terminar numa borda reta, como uma ilha.
import * as THREE from 'three';

export async function criarEntorno({ cena, base = 'data/' }) {
  const [M, buf] = await Promise.all([fetch(base + 'entorno.json').then((r) => r.json()), fetch(base + 'entorno.bin').then((r) => r.arrayBuffer())]);
  const h16 = new Int16Array(buf), { nx, nz, x0, z0, passo } = M, [rx0, rz0, rx1, rz1] = M.recorte;
  const H = (i, j) => h16[j * nx + i] / 10;
  const pos = new Float32Array(nx * nz * 3), cor = new Float32Array(nx * nz * 3);
  const hs = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
  // ruído contínuo (valor interpolado) em vez de blocos: manchas que se fundem, sem degraus de 60 m
  const ru = (x, z, k) => { const fx = x / k, fz = z / k, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    return (hs(i, j) * (1 - su) + hs(i + 1, j) * su) * (1 - sv) + (hs(i, j + 1) * (1 - su) + hs(i + 1, j + 1) * su) * sv; };
  const cUrb = new THREE.Color('#9a9080'), cTelha = new THREE.Color('#9c6f5a'), cVerde = new THREE.Color('#7a8660'), cMato = new THREE.Color('#5d6e4c'), c = new THREE.Color(); // tons médios da foto aérea do recorte
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = x0 + i * passo, z = z0 + j * passo, y = H(i, j);
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    // cor: cidade (cinza quente com telhados) no plano baixo, mato nos morros e encostas; manchas de 30–90 m
    const dx = (H(Math.min(nx - 1, i + 1), j) - H(Math.max(0, i - 1), j)) / (2 * passo), dz = (H(i, Math.min(nz - 1, j + 1)) - H(i, Math.max(0, j - 1))) / (2 * passo);
    const decl = Math.hypot(dx, dz), r = ru(x, z, 220), r2 = ru(x + 500, z, 90);
    const verde = Math.min(1, Math.max(0, (y - 28) / 40) + decl * 4 + Math.max(0, 0.32 - r) * 2.2);
    c.copy(cUrb).lerp(cTelha, 0.15 + 0.35 * r2).lerp(r > 0.5 ? cVerde : cMato, verde * 0.85);
    c.multiplyScalar(0.94 + 0.12 * r2);
    c.toArray(cor, k * 3);
  }
  const idx = [];
  const dentro = (i, j) => { const x = x0 + i * passo, z = z0 + j * passo; return x > rx0 + 2 && x < rx1 - 2 && z > rz0 + 2 && z < rz1 - 2; };
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    if (dentro(i, j) && dentro(i + 1, j) && dentro(i, j + 1) && dentro(i + 1, j + 1)) continue; // o recorte tem o relevo fino
    const a = j * nx + i, b = a + 1, c2 = a + nx, d = c2 + 1;
    idx.push(a, c2, b, b, c2, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(cor, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  const chao = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  chao.receiveShadow = true; chao.name = 'entorno'; chao.userData.semNeve = false;
  cena.add(chao);
  // o Reno fora do recorte: água escura e lisa, no nível do rio
  const ga = new THREE.BufferGeometry(), pa = new Float32Array((M.agua.length / 2) * 3);
  for (let i = 0, k = 0; i < M.agua.length; i += 2, k += 3) { pa[k] = M.agua[i]; pa[k + 1] = M.nivel; pa[k + 2] = M.agua[i + 1]; }
  ga.setAttribute('position', new THREE.BufferAttribute(pa, 3)); ga.computeVertexNormals();
  const matAgua = new THREE.MeshStandardMaterial({ color: 0x4d777d, roughness: 0.12, metalness: 0.25, side: THREE.DoubleSide }); // perto do tom do Reno do recorte
  matAgua.userData.semNeve = true;
  const agua = new THREE.Mesh(ga, matAgua); agua.name = 'Reno (entorno)'; agua.receiveShadow = true;
  cena.add(agua);
  // altura no entorno (para a câmera não descer abaixo do chão fora do recorte)
  const altura = (x, z) => {
    const fi = (x - x0) / passo, fj = (z - z0) / passo, i = Math.max(0, Math.min(nx - 2, Math.floor(fi))), j = Math.max(0, Math.min(nz - 2, Math.floor(fj)));
    const u = Math.min(1, Math.max(0, fi - i)), v = Math.min(1, Math.max(0, fj - j));
    return Math.max(M.nivel, (H(i, j) * (1 - u) + H(i + 1, j) * u) * (1 - v) + (H(i, j + 1) * (1 - u) + H(i + 1, j + 1) * u) * v);
  };
  return { chao, agua, altura };
}
