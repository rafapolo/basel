#!/usr/bin/env python3
"""Árvores e verde de Basel → docs/data/arvores.bin + arvores.json.

Fontes: Baumkataster (data.bs.ch 100052, CC BY 4.0), cobertura de copa 2024 (100357, CC BY 4.0, só para conferir),
OSM (gramados, parques, jardins, árvores soltas; ODbL). Baixados em data/16-arvores/ (ver README do script abaixo).
Uso: uv run --with polars --with pyproj --with numpy --with rasterio script/arvores.py
"""
import json
from pathlib import Path
import numpy as np, polars as pl
from pyproj import Transformer

RAIZ = Path(__file__).resolve().parent.parent
BR = RAIZ / "data" / "16-arvores"
OUT = RAIZ / "docs" / "data"
meta = json.loads((OUT / "predios.json").read_text())
OE, ON = meta["origem_lv95"]
E0, N0, E1, N1 = meta["recorte_lv95"]
MARGEM = 40
to = Transformer.from_crs(4326, 2056, always_xy=True)

# gêneros → classe de modelo, altura adulta (m), idade de referência (anos), copa/altura, folha de outono
GEN = {  # classe: 0 tília 1 bordo 2 castanheiro 3 plátano 4 carvalho 5 outras folhosas 6 conífera 7 colunar
    "Tilia": (0, 24, 80, 0.75), "Acer": (1, 20, 70, 0.8), "Aesculus": (2, 22, 80, 0.85), "Platanus": (3, 28, 90, 0.8),
    "Quercus": (4, 24, 120, 0.85), "Fraxinus": (5, 24, 80, 0.7), "Carpinus": (5, 18, 70, 0.7), "Betula": (5, 20, 60, 0.55),
    "Robinia": (5, 20, 60, 0.65), "Prunus": (5, 12, 50, 0.8), "Fagus": (4, 26, 120, 0.8), "Populus": (7, 30, 60, 0.45),
    "Salix": (5, 16, 50, 0.9), "Ulmus": (5, 24, 80, 0.8), "Sorbus": (5, 12, 50, 0.7), "Pyrus": (7, 12, 50, 0.5),
    "Gleditsia": (5, 18, 60, 0.7), "Styphnolobium": (5, 16, 60, 0.8), "Parrotia": (5, 8, 60, 0.9), "Corylus": (5, 8, 40, 0.9),
    "Pinus": (6, 22, 100, 0.4), "Picea": (6, 24, 100, 0.35), "Cedrus": (6, 24, 120, 0.6), "Taxus": (6, 10, 100, 0.6),
    "Abies": (6, 24, 100, 0.35), "Juniperus": (6, 8, 60, 0.4), "Thuja": (6, 12, 60, 0.35), "Cupressus": (6, 14, 60, 0.3),
    "Sequoiadendron": (6, 30, 100, 0.35), "Metasequoia": (6, 24, 80, 0.35), "Ginkgo": (7, 20, 100, 0.5), "Liquidambar": (5, 20, 70, 0.6),
    "Malus": (5, 8, 50, 0.9), "Catalpa": (5, 14, 60, 0.9), "Magnolia": (5, 10, 60, 0.8), "Celtis": (5, 18, 70, 0.8),
    "Liriodendron": (5, 26, 80, 0.6), "Zelkova": (5, 18, 60, 0.8), "Carya": (5, 20, 80, 0.7), "Juglans": (5, 20, 80, 0.8),
    "Alnus": (5, 16, 50, 0.6), "Morus": (5, 10, 60, 0.9), "Cercis": (5, 8, 50, 0.9), "Crataegus": (5, 8, 50, 0.8),
}
PADRAO = (5, 14, 60, 0.75)
CLASSES = ["tilia", "acer", "aesculus", "platanus", "quercus", "outras", "conifera", "colunar"]

d = pl.read_parquet(BR / "baumkataster.parquet")
import struct
xy = np.array([struct.unpack("<2d", b[5:21]) for b in d["geo_point_2d"].to_list()])  # WKB de ponto (lon, lat)
lon, lat = xy[:, 0], xy[:, 1]
e, n = to.transform(lon, lat)
d = d.with_columns(pl.Series("e", e), pl.Series("n", n))
d = d.filter((pl.col("e") > E0 - MARGEM) & (pl.col("e") < E1 + MARGEM) & (pl.col("n") > N0 - MARGEM) & (pl.col("n") < N1 + MARGEM))
genero = d["baumart_lateinisch"].fill_null("").str.split(" ").list.first().to_list()
idade = np.array([a if a is not None else np.nan for a in d["ba_baumalter"].to_list()], dtype=float)
arv = []
for g, a in zip(genero, idade):
    cls, hmax, aref, cr = GEN.get(g, PADRAO)
    a = 40.0 if np.isnan(a) else a
    h = hmax * (1 - np.exp(-3.0 * min(a, 300) / aref)) ** 1.2 if cls != 6 else hmax * (1 - np.exp(-2.5 * a / aref))
    arv.append((cls, max(2.5, min(hmax * 1.1, h)), cr))
cls = np.array([a[0] for a in arv], np.uint8); H = np.array([a[1] for a in arv]); C = 0.9 * H * np.array([a[2] for a in arv])
x = (d["e"].to_numpy() - OE); z = -(d["n"].to_numpy() - ON)
X0, X1, Z0, Z1 = E0 - OE, E1 - OE, -(N1 - ON), -(N0 - ON)  # recorte local, de predios.json
dentro = (x > X0 - 10) & (x < X1 + 10) & (z > Z0 - 10) & (z < Z1 + 10)
x, z, H, C, cls = x[dentro], z[dentro], H[dentro], C[dentro], cls[dentro]
ids = np.arange(len(x))
# estrutura: x,z (float32 m), altura, diâmetro de copa (m, float32), classe (uint8) — x,z,h,c em Float32Array, depois classes
buf = np.stack([x, z, H, C], 1).astype("<f4").tobytes() + cls.tobytes()
(OUT / "arvores.bin").write_bytes(buf)

# verde do OSM: polígonos [tipo, x0,z0,x1,z1,...] e árvores soltas ainda não no cadastro
osm = json.loads((BR / "osm_verde.json").read_text())
TIPO = {"park": 0, "garden": 1, "grass": 2, "village_green": 2, "meadow": 2, "recreation_ground": 2, "flowerbed": 3, "wood": 4, "forest": 4, "scrub": 4, "pitch": 5, "playground": 5}
verde, soltas = [], []
for el in osm["elements"]:
    t = el.get("tags", {})
    if el["type"] == "node" and t.get("natural") == "tree":
        ee, nn = to.transform(el["lon"], el["lat"])
        soltas.append((ee - OE, -(nn - ON)))
    elif el["type"] == "way" and "geometry" in el:
        k = t.get("leisure") or t.get("landuse") or t.get("natural")
        if k not in TIPO: continue
        pts = [to.transform(p["lon"], p["lat"]) for p in el["geometry"]]
        c = [v for p in pts for v in (round(p[0] - OE, 1), round(-(p[1] - ON), 1))]
        verde.append([TIPO[k]] + c)
# árvores do OSM a mais de 4 m de uma do cadastro entram como extras (copa média)
from scipy.spatial import cKDTree
ex = []
if soltas:
    arr = np.array(soltas); dist, _ = cKDTree(np.stack([x, z], 1)).query(arr)
    ex = [[round(a, 1), round(b, 1)] for (a, b), dd in zip(arr, dist) if dd > 4 and X0 - 10 < a < X1 + 10 and Z0 - 10 < b < Z1 + 10]

# conferência: copa do cadastro × cobertura de copa 2024 (raster 0,5 m; >0 = copa) na mesma área
conf = {}
try:
    import rasterio
    from rasterio.windows import from_bounds
    r = rasterio.open(BR / "Baumkronenbedeckung_2024.tif")
    a = r.read(1, window=from_bounds(E0, N0, E1, N1, r.transform))
    area_raster = float((a > 0).sum()) * 0.25
    area_cad = float((np.pi * (C / 2) ** 2).sum())
    conf = {"copa_raster_m2": round(area_raster), "copa_cadastro_m2": round(area_cad), "razao": round(area_cad / area_raster, 2)}
except Exception as ex_:
    conf = {"erro": str(ex_)}
print("árvores", len(x), "extras OSM", len(ex), "polígonos verdes", len(verde), "conferência", conf)
(OUT / "arvores.json").write_text(json.dumps({"n": int(len(x)), "classes": CLASSES, "extras": ex, "verde": verde, "conferencia": conf,
    "fonte": "Baumkataster Basel-Stadt (data.bs.ch 100052, CC BY 4.0); OSM (ODbL); Baumkronenbedeckung 2024 (100357, CC BY 4.0)"},
    separators=(",", ":")))
