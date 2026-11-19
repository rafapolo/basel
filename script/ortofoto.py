"""Ortofoto da Altstadt (tarefa 11): swissIMAGE 10 cm (edição 2024, swisstopo OGD) -> tiles WebP.

Recorta o mesmo retângulo LV95 de script/predios.py, reamostra para ~27 cm/px (4096 × 4096 px no
total, em NxN tiles de 1024 px) e clareia as sombras pintadas na foto. Gera em docs/data/ortofoto/:

  geral.webp   visão geral do recorte inteiro, 512 × 512 px (abre primeiro, ~2 m/px)
  t_<i>_<j>.webp  tiles de 1024 px (i = coluna a partir do oeste, j = linha a partir do norte)
  ortofoto.json  retângulo em coordenadas locais (x = leste, z = −norte, m), grade e tamanhos

Os GeoTIFFs de 10 cm (6 blocos de 1 km, ~65 MB cada) vão para data/11-ortofoto/ e só são baixados
se faltarem. Uso: uv run --with rasterio --with numpy --with pillow script/ortofoto.py
"""

import json
import subprocess
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.merge import merge
from rasterio.enums import Resampling

RAIZ = Path(__file__).resolve().parent.parent
TIF = RAIZ / "data/11-ortofoto"
SAIDA = RAIZ / "docs/data/ortofoto"

# mesmo recorte e origem de script/predios.py
from recorte import E0, E1, N0, N1, ORIGEM_E, ORIGEM_N

GRADE = 4          # 4 × 4 tiles
LADO = 1024        # px por tile
GERAL = 512        # px da visão geral
QUALIDADE = 72     # WebP
ANO = 2024
URL = "https://data.geo.admin.ch/ch.swisstopo.swissimage-dop10/swissimage-dop10_{ano}_{b}/swissimage-dop10_{ano}_{b}_0.1_2056.tif"


def baixa():
    TIF.mkdir(parents=True, exist_ok=True)
    arquivos = []
    for e in range(int(E0 // 1000), int(E1 // 1000) + 1):
        for n in range(int(N0 // 1000), int(N1 // 1000) + 1):
            b = f"{e}-{n}"
            f = TIF / f"swissimage-dop10_{ANO}_{b}_0.1_2056.tif"
            if not f.exists():
                subprocess.run(["curl", "-sS", "-f", "-o", str(f), URL.format(ano=ANO, b=b)], check=True)
            arquivos.append(f)
    return arquivos


def clareia_sombras(rgb):
    """A foto já traz sombra pintada (sol do voo) e a cena tem a própria: levanta os tons escuros."""
    x = rgb.astype(np.float32) / 255
    lum = (0.299 * x[..., 0] + 0.587 * x[..., 1] + 0.114 * x[..., 2])[..., None]
    alvo = 0.12 + 0.88 * lum ** 0.62  # curva que sobe as sombras e mantém as luzes
    x = x * (alvo / np.maximum(lum, 1e-3))
    return (np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8)


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)
    ds = [rasterio.open(f) for f in baixa()]
    n = GRADE * LADO
    res = ((E1 - E0) / n, (N1 - N0) / n)
    mosaico, _ = merge(ds, bounds=(E0, N0, E1, N1), res=res, resampling=Resampling.average, nodata=0)
    rgb = clareia_sombras(np.moveaxis(mosaico[:3], 0, -1))
    print("mosaico", rgb.shape, "res m/px", res)

    total = 0
    for i in range(GRADE):
        for j in range(GRADE):
            t = rgb[j * LADO:(j + 1) * LADO, i * LADO:(i + 1) * LADO]
            f = SAIDA / f"t_{i}_{j}.webp"
            Image.fromarray(t).save(f, "WEBP", quality=QUALIDADE, method=6)
            total += f.stat().st_size
    g = SAIDA / "geral.webp"
    Image.fromarray(rgb).resize((GERAL, GERAL), Image.LANCZOS).save(g, "WEBP", quality=QUALIDADE, method=6)
    meta = {
        "fonte": f"swissIMAGE 10 cm {ANO}, swisstopo (OGD)",
        "x0": E0 - ORIGEM_E, "x1": E1 - ORIGEM_E,
        "z0": -(N1 - ORIGEM_N), "z1": -(N0 - ORIGEM_N),  # z = −norte: o topo da imagem é o menor z
        "grade": GRADE, "lado": LADO, "geral": GERAL, "m_px": list(res),
    }
    (SAIDA / "ortofoto.json").write_text(json.dumps(meta))
    print(f"tiles {total/1e6:.2f} MB, geral {g.stat().st_size/1e3:.0f} KB")


if __name__ == "__main__":
    main()
