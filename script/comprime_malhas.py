"""Cópias .gz das malhas com zopfli (mesmo formato gzip, ~4% menores que o gzip do GitHub Pages), só em dist/.
Chamado por script/build.js quando o `uv` existe; docs/compacta.js (baixaBin) as abre com DecompressionStream.

    uv run --with zopfli python script/comprime_malhas.py dist/data/predios.v2.bin dist/data/terreno.v2.bin
"""
import gzip
import sys
from concurrent.futures import ProcessPoolExecutor

import zopfli.gzip


def um(arq):
    b = open(arq, "rb").read()
    z = zopfli.gzip.compress(b, numiterations=15)
    assert gzip.decompress(z) == b, arq
    open(arq + ".gz", "wb").write(z)
    return f"{arq}: {len(b) / 1e6:.2f} MB → {len(z) / 1e6:.2f} MB"


if __name__ == "__main__":
    with ProcessPoolExecutor() as ex:
        for linha in ex.map(um, sys.argv[1:]):
            print(linha)
