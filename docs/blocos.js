// Blocos (2026-11-20): prédios e chão eram uma malha só cada, desenhada inteira em todo passe (a cena, as três cascatas de
// sombra e o G-buffer do GTAO), mesmo quando a cascata mais próxima cobre só uma rua. Aqui os triângulos são ordenados
// por bloco de `lado` metros e cada bloco vira uma Mesh com a própria esfera envolvente, compartilhando os mesmos buffers
// na GPU (só drawRange muda): o three descarta o que está fora de cada câmera.

// centro(t, s): escreve em s[0], s[1] o (x, z) do triângulo t. Devolve a ordem nova dos triângulos e as faixas por bloco.
export function ordenarPorBloco(nTri, centro, lado) {
  const cx = new Float32Array(nTri), cz = new Float32Array(nTri), s = [0, 0];
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity;
  for (let t = 0; t < nTri; t++) { centro(t, s); cx[t] = s[0]; cz[t] = s[1]; if (s[0] < x0) x0 = s[0]; if (s[0] > x1) x1 = s[0]; if (s[1] < z0) z0 = s[1]; }
  const nbx = Math.floor((x1 - x0) / lado) + 1, chave = new Uint32Array(nTri);
  let nb = 0;
  for (let t = 0; t < nTri; t++) { const k = Math.floor((cz[t] - z0) / lado) * nbx + Math.floor((cx[t] - x0) / lado); chave[t] = k; if (k + 1 > nb) nb = k + 1; }
  const conta = new Uint32Array(nb + 1);
  for (let t = 0; t < nTri; t++) conta[chave[t] + 1]++;
  for (let b = 0; b < nb; b++) conta[b + 1] += conta[b];
  const ordem = new Uint32Array(nTri), cur = conta.slice(0, nb);
  for (let t = 0; t < nTri; t++) ordem[cur[chave[t]]++] = t;
  const faixas = [];
  for (let b = 0; b < nb; b++) if (conta[b + 1] > conta[b]) faixas.push([conta[b], conta[b + 1] - conta[b]]);
  return { ordem, faixas };
}

// permuta um array por triângulo (k valores por triângulo) na ordem dada
export function permutar(arr, ordem, k) {
  const c = arr.slice();
  for (let i = 0; i < ordem.length; i++) { const o = ordem[i] * k, d = i * k; for (let j = 0; j < k; j++) arr[d + j] = c[o + j]; }
}

// uma Mesh por faixa [triângulo inicial, n], com os atributos (e o índice) da geometria-mãe; pos: Float32 das posições
export function malhasPorBloco(THREE, geo, material, faixas, pos, nome) {
  const idx = geo.index?.array, out = [];
  for (const [t0, n] of faixas) {
    const g = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(geo.attributes)) g.setAttribute(k, a);
    if (geo.index) g.setIndex(geo.index);
    g.setDrawRange(t0 * 3, n * 3);
    const b = new THREE.Box3(), v = new THREE.Vector3();
    for (let i = t0 * 3; i < (t0 + n) * 3; i++) { const j = idx ? idx[i] : i; b.expandByPoint(v.set(pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2])); }
    g.boundingBox = b; g.boundingSphere = b.getBoundingSphere(new THREE.Sphere());
    const m = new THREE.Mesh(g, material); m.name = nome; m.matrixAutoUpdate = false;
    out.push(m);
  }
  return out;
}

// libera a cópia em JS de um atributo depois de subir para a GPU (cores, atributos das fachadas: ~120 MB nos prédios)
export function soltarAposSubir(...attrs) { for (const a of attrs) a.onUpload(function () { this.array = null; }); }
