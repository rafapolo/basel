// Decodificador do formato compacto das malhas (tarefa 20; codificador e formato em script/compacta.py).
// decodifica(buf, ncol, nbIndice) -> { cols: [Int16Array x ncol] (vértices únicos), idx: Uint32Array }
export function decodifica(buf, ncol, nbIndice) {
  const dv = new DataView(buf), nu = dv.getUint32(0, true), ni = dv.getUint32(4, true);
  const b = new Uint8Array(buf);
  let off = 8;
  const cols = [];
  for (let c = 0; c < ncol; c++) {
    const out = new Int16Array(nu), lo = off, hi = off + nu;
    let acc = 0;
    for (let i = 0; i < nu; i++) {
      const u = b[lo + i] | (b[hi + i] << 8);
      acc = (acc + ((u >>> 1) ^ -(u & 1))) << 16 >> 16; // soma módulo 2^16, como o cumsum em int16 do Python
      out[i] = acc;
    }
    cols.push(out);
    off += 2 * nu;
  }
  const idx = new Uint32Array(ni);
  let prox = 0;
  for (let i = 0; i < ni; i++) {
    let c = b[off + i] | (b[off + ni + i] << 8);
    if (nbIndice > 2) c |= b[off + 2 * ni + i] << 16;
    idx[i] = c === 0 ? prox++ : prox - c;
  }
  return { cols, idx };
}
