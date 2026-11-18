"""Formato compacto das malhas (tarefa 20): predios.v2.bin e terreno.v2.bin.

O gzip do GitHub Pages comprime mal números de 16/32 bits misturados. Aqui cada malha vira:

  cabeçalho  u32 nu (vértices únicos), u32 ni (entradas do índice)
  vértices   em ordem de primeira aparição no índice; cada coluna é delta + zigzag em u16 e vai em dois planos
             de bytes (todos os bytes baixos, depois todos os altos)
  índice     "marca d'água": c = próximo_novo - índice (0 = vértice novo), em planos de bytes (2 para os prédios,
             3 para o terreno)

Decodificador: docs/compacta.js. Prédios: a sopa de triângulos (Int16 x,y,z + Uint16 id) sai idêntica, byte a byte;
terreno: os mesmos vértices e triângulos, só em outra ordem de vértices.

  uv run --with numpy script/compacta.py      converte predios.bin / terreno.bin.gz antigos (se houver) e confere a volta

Os geradores (script/predios.py e script/chao.py) já gravam direto no formato novo.
"""
import gzip
import json
import struct
import sys
from pathlib import Path

import numpy as np


def _zz(d):  # int16 com estouro -> u16
    d = d.astype(np.int16).astype(np.int32)
    return ((d << 1) ^ (d >> 31)).astype(np.uint32) & 0xFFFF


def _unzz(u):
    u = u.astype(np.int32)
    return ((u >> 1) ^ -(u & 1)).astype(np.int16)


def _planos(a, nb):
    a = a.astype(np.uint32)
    return b"".join(((a >> (8 * k)) & 255).astype(np.uint8).tobytes() for k in range(nb))


def _de_planos(buf, off, n, nb):
    a = np.zeros(n, np.uint32)
    for k in range(nb):
        a |= np.frombuffer(buf, np.uint8, n, off + k * n).astype(np.uint32) << (8 * k)
    return a, off + nb * n


def codifica(colunas, indice, nb_indice):
    """colunas: lista de arrays (int16 ou uint16) já na ordem dos vértices; indice: array int."""
    indice = np.asarray(indice, np.int64)
    nv = len(colunas[0])
    primeiro = np.full(nv, np.iinfo(np.int64).max)
    np.minimum.at(primeiro, indice, np.arange(len(indice)))
    usados = primeiro < np.iinfo(np.int64).max
    perm = np.argsort(primeiro, kind="stable")[: usados.sum()]
    rank = np.full(nv, -1, np.int64)
    rank[perm] = np.arange(len(perm))
    idx = rank[indice]
    marca = np.maximum.accumulate(np.concatenate([[-1], idx[:-1]])) + 1
    c = marca - idx
    assert c.min() >= 0 and c.max() < 1 << (8 * nb_indice), c.max()
    out = struct.pack("<II", len(perm), len(idx))
    for col in colunas:
        v = col[perm].astype(np.int64)
        out += _planos(_zz(np.diff(v, prepend=0)), 2)
    return out + _planos(c, nb_indice), perm


def decodifica(buf, ncol, nb_indice):
    nu, ni = struct.unpack_from("<II", buf, 0)
    off, cols = 8, []
    for _ in range(ncol):
        u, off = _de_planos(buf, off, nu, 2)
        cols.append(np.cumsum(_unzz(u).astype(np.int64)).astype(np.int16))  # soma módulo 2^16, como no JS
    c, off = _de_planos(buf, off, ni, nb_indice)
    idx = np.empty(ni, np.int64)
    prox = 0
    c = c.astype(np.int64)
    # vetorizado: onde c == 0 nasce um vértice novo, numerado em sequência
    novo = c == 0
    prox_antes = np.concatenate([[0], np.cumsum(novo)[:-1]])
    idx = np.where(novo, prox_antes, prox_antes - c)
    return cols, idx


def predios(q, ids):
    """q: (n,3) int16, ids: (n,) uint16 — sopa de triângulos. Devolve o blob."""
    chave = np.concatenate([q.astype(np.int64), ids[:, None].astype(np.int64)], 1)
    unicos, inv = np.unique(chave, axis=0, return_inverse=True)
    cols = [unicos[:, k].astype(np.int16) for k in range(3)] + [unicos[:, 3].astype(np.uint16).view(np.int16)]
    blob, _ = codifica(cols, inv.ravel(), 2)
    return blob


def le_predios(caminho):
    """Lê predios.v2.bin e devolve a sopa de triângulos: q (n,3) int16 e ids (n,) uint16."""
    cols, idx = decodifica(Path(caminho).read_bytes(), 4, 2)
    return np.stack(cols[:3], 1)[idx], cols[3].view(np.uint16)[idx]


def terreno(col, lin, hh, tris):
    """Devolve o blob (a ordem dos vértices muda; os triângulos são os mesmos)."""
    cols = [a.astype(np.uint16).view(np.int16) for a in (col, lin, hh)]
    blob, _ = codifica(cols, tris.ravel(), 3)
    return blob


if __name__ == "__main__":
    D = Path(__file__).resolve().parent.parent / "docs/data"
    if not (D / "predios.bin").exists():
        sys.exit("nada a converter: docs/data já está no formato v2")
    meta = json.loads((D / "predios.json").read_text())
    b = (D / "predios.bin").read_bytes()
    nv = len(b) // 8
    q = np.frombuffer(b, np.int16, nv * 3).reshape(-1, 3)
    ids = np.frombuffer(b, np.uint16, nv, nv * 6)
    blob = predios(q, ids)
    cols, idx = decodifica(blob, 4, 2)
    volta = np.stack(cols[:3], 1)[idx].astype("<i2").tobytes() + cols[3].view(np.uint16)[idx].astype("<u2").tobytes()
    assert volta == b, "predios: a volta não bate"
    (D / "predios.v2.bin").write_bytes(blob)
    print(f"predios.v2.bin: {len(blob) / 1e6:.2f} MB (gzip {len(gzip.compress(blob, 9)) / 1e6:.2f}); volta idêntica")

    T = meta["terreno"]
    buf = gzip.decompress((D / "terreno.bin.gz").read_bytes())
    n, nt = T["nv"], T["nt"]
    col = np.frombuffer(buf, "<u2", n, 0); lin = np.frombuffer(buf, "<u2", n, n * 2); hh = np.frombuffer(buf, "<u2", n, n * 4)
    tris = np.frombuffer(buf, "<u4", nt * 3, n * 6).reshape(-1, 3)
    blob = terreno(col, lin, hh, tris)
    cols, idx = decodifica(blob, 3, 3)
    v_novo = np.stack([c.view(np.uint16) for c in cols], 1)[idx.reshape(-1, 3)]
    v_velho = np.stack([col, lin, hh], 1)[tris]
    assert np.array_equal(v_novo, v_velho), "terreno: os triângulos não batem"
    (D / "terreno.v2.bin").write_bytes(blob)
    print(f"terreno.v2.bin: {len(blob) / 1e6:.2f} MB (gzip {len(gzip.compress(blob, 9)) / 1e6:.2f}); triângulos idênticos")
    sys.exit(0)
