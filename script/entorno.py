"""Entorno da cidade (2026-11-19): relevo grosso de 8 × 7,6 km em volta do recorte e o Reno inteiro, da fronteira alemã
(Grenzach / Birsfelden, a leste) até o Dreiländereck e a fronteira francesa (ao norte). Assim a cidade deixa de ser uma
ilha: o chão segue até o horizonte e o rio entra e sai do mapa.
  relevo  Copernicus GLO-30 (DSM, 30 m; cobre Suíça, Alemanha e França), reprojetado para LV95; uma erosão de 3 × 3 células
          (90 m) e uma suavização tiram os prédios do modelo de superfície; numa faixa de 150 m em volta do recorte a altura
          se funde com a borda do relevo fino (relevo.bin), para não haver degrau
  rio     polígonos de água (natural=water, water=river) do OSM; o leito é escavado e a água fica no nível do Reno
Saída: docs/data/entorno.bin (Int16 em dm, grade nx × nz) e docs/data/entorno.json (grade, rio em triângulos, fonte).
   uv run --with numpy --with scipy --with shapely --with pyproj --with mapbox-earcut python script/entorno.py
"""
import json, subprocess, tempfile
from pathlib import Path
import numpy as np
from scipy import ndimage
from shapely.geometry import Polygon, MultiPolygon, box
from shapely.ops import unary_union
from pyproj import Transformer
import mapbox_earcut as earcut
import recorte as RC

RAIZ = Path(__file__).resolve().parent.parent
D = RAIZ / "data/22-entorno"
E0, E1, N0, N1 = 2607600.0, 2615600.0, 1264000.0, 1271600.0
PASSO = 30.0
nx, nz = int((E1 - E0) / PASSO) + 1, int((N1 - N0) / PASSO) + 1

with tempfile.TemporaryDirectory() as tmp:
    raw = Path(tmp) / "dem.tif"
    subprocess.run(["gdalwarp", "-q", "-overwrite", "-s_srs", "EPSG:4326", "-t_srs", "EPSG:2056", "-te", str(E0 - PASSO / 2), str(N0 - PASSO / 2), str(E1 + PASSO / 2), str(N1 + PASSO / 2),
                    "-ts", str(nx), str(nz), "-r", "bilinear", "-ot", "Float32", "-of", "ENVI", str(D / "cop30_N47_E007.tif"), str(raw)], check=True)
    h = np.fromfile(raw, dtype=np.float32).reshape(nz, nx)  # linha 0 = norte
h = ndimage.gaussian_filter(ndimage.minimum_filter(h, size=3), 1.2) - RC.BASE_Z  # sem prédios, suave, relativo à base

# coordenadas locais da grade
xs = E0 + np.arange(nx) * PASSO - RC.ORIGEM_E
zs = -((N1 - np.arange(nz) * PASSO) - RC.ORIGEM_N)  # linha 0 = norte = menor z
X, Z = np.meshgrid(xs, zs)

# borda do recorte: altura do relevo de 5 m (relevo.bin) no ponto mais perto dentro do recorte
meta = json.loads((RAIZ / "docs/data/predios.json").read_text()); R = meta["relevo"]
rel = np.fromfile(RAIZ / "docs/data/relevo.bin", dtype=np.uint16).reshape(R["ny"], R["nx"]) / 100.0
cx = np.clip(X, RC.X0, RC.X1); cz = np.clip(Z, RC.Z0, RC.Z1)
hb = rel[np.clip(np.round((cz - R["z0"]) / R["passo"]).astype(int), 0, R["ny"] - 1), np.clip(np.round((cx - R["x0"]) / R["passo"]).astype(int), 0, R["nx"] - 1)]
dist = np.hypot(X - cx, Z - cz)  # 0 dentro do recorte
w = np.clip(1 - dist / 150.0, 0, 1) ** 2
h = h * (1 - w) + hb * w
dentro = dist == 0
h[dentro] = hb[dentro] - 0.6  # sob o relevo fino: escondido, sem brigar com ele

# rio
tr = Transformer.from_crs(4326, 2056, always_xy=True)
osm = json.loads((D / "rio.json").read_text())["elements"]
def anel(geo):
    e, n = tr.transform([p["lon"] for p in geo], [p["lat"] for p in geo])
    return [(a - RC.ORIGEM_E, -(b - RC.ORIGEM_N)) for a, b in zip(e, n)]
polys = []
for el in osm:
    if el["type"] == "way" and el.get("geometry") and el["geometry"][0] == el["geometry"][-1]:
        polys.append(Polygon(anel(el["geometry"])).buffer(0))
    elif el["type"] == "relation":
        aneis = [anel(m["geometry"]) for m in el.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
        # os membros "outer" vêm em pedaços: junta tudo e poligoniza
        from shapely.ops import polygonize, linemerge
        from shapely.geometry import LineString
        ls = [LineString(a) for a in aneis if len(a) > 1]
        for p in polygonize(linemerge(ls)): polys.append(p.buffer(0))
rio = unary_union([p for p in polys if p.area > 5000]).intersection(box(xs[0], zs[0], xs[-1], zs[-1]))
print(f"rio: {rio.area / 1e6:.2f} km²")
from shapely import contains_xy
noRio = contains_xy(rio, X, Z)
nivel = json.loads((RAIZ / "docs/data/reno.json").read_text())["nivel"]
h[noRio & ~dentro] = nivel - 3.0  # leito escavado

# água fora do recorte, em triângulos (x, z), y = nível
agua = rio.difference(box(RC.X0 + 1, RC.Z0 + 1, RC.X1 - 1, RC.Z1 - 1)).simplify(2.0)
tri = []
for p in (agua.geoms if hasattr(agua, "geoms") else [agua]):
    if p.geom_type != "Polygon" or p.area < 500: continue
    an = [np.array(p.exterior.coords)[:-1]] + [np.array(i.coords)[:-1] for i in p.interiors]
    V = np.concatenate(an); fins = np.cumsum([len(a) for a in an]).astype(np.uint32)
    for t in earcut.triangulate_float64(V, fins).reshape(-1, 3):
        tri.extend(np.round(V[t], 1).ravel().tolist())
(RAIZ / "docs/data/entorno.bin").write_bytes(np.clip(np.round(h * 10), -32000, 32000).astype("<i2").tobytes())
(RAIZ / "docs/data/entorno.json").write_text(json.dumps({
    "fonte": "Copernicus GLO-30 DEM (© DLR e Airbus, uso livre); Reno: OpenStreetMap (ODbL)",
    "nx": nx, "nz": nz, "x0": float(xs[0]), "z0": float(zs[0]), "passo": PASSO, "nivel": nivel,
    "recorte": [RC.X0, RC.Z0, RC.X1, RC.Z1], "agua": tri}, separators=(",", ":")))
print(f"grade {nx} × {nz}, água {len(tri) // 6} triângulos; entorno.bin {(nx * nz * 2) / 1024:.0f} KB")
