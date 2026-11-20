# Fronteiras (2026-11-20): a nacional (Suíça × Alemanha e França) e o contorno de Basel-Stadt (com Riehen e Bettingen),
# das áreas oficiais da swisstopo (swissBOUNDARIES3D, via api3.geo.admin.ch: Landesgrenzen e Kantonsgrenzen).
# Saída docs/data/fronteira.json:
#   nacional / cantao: linhas [x, z, y, ...] a cada ~8 m, y do relevo (relevo.bin de 5 m no recorte, Copernicus de 30 m fora)
#   fora: polígonos (anéis [x, z, ...]) do quadrado do terreno que caem fora da Suíça: chao.js tira esses triângulos
# e o polígono da Suíça perto de Basel em data/23-fronteira/ch_local.json, para o entorno.py cortar o Reno de fora.
#   uv run --with numpy --with shapely --with pyproj python script/fronteira.py   (precisa de gdalwarp)
import json
import subprocess
import tempfile
import urllib.request
from pathlib import Path

import numpy as np
from shapely.geometry import box, shape, LineString, MultiLineString
from shapely.ops import transform, linemerge

RAIZ = Path(__file__).resolve().parent.parent
D = RAIZ / "data/23-fronteira"; D.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "basel-3d/0.1 (https://rafapolo.github.io/basel/)"}
API = "https://api3.geo.admin.ch/rest/services/api/MapServer/find?returnGeometry=true&geometryFormat=geojson&sr=2056&contains=false"


def baixa(nome, url):
    f = D / nome
    if not f.exists():
        f.write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read())
    return shape(json.loads(f.read_text())["results"][0]["geometry"])


ch = baixa("ch.json", API + "&layer=ch.swisstopo.swissboundaries3d-land-flaeche.fill&searchText=CH&searchField=id")
bs = baixa("bs.json", API + "&layer=ch.swisstopo.swissboundaries3d-kanton-flaeche.fill&searchText=Basel-Stadt&searchField=name")
meta = json.loads((RAIZ / "docs/data/predios.json").read_text())
oe, on = meta["origem_lv95"]
loc = lambda g: transform(lambda x, y, z=None: (x - oe, -(y - on)), g)
CH, BS = loc(ch).buffer(0), loc(bs).buffer(0)

# área de trabalho: o terreno, o Reno de fora (entorno.json) e o cantão inteiro, com folga
E = json.loads((RAIZ / "docs/data/entorno.json").read_text())
xa, za = E["agua"][0::2], E["agua"][1::2]
bx0, bz0, bx1, bz1 = BS.bounds
AREA = box(min(min(xa), bx0) - 300, min(min(za), bz0) - 300, max(max(xa), bx1) + 300, max(max(za), bz1) + 300)
(D / "ch_local.json").write_text(json.dumps(CH.intersection(AREA.buffer(2000)).__geo_interface__))

# relevo: Copernicus GLO-30 (o mesmo do entorno) numa grade de 30 m em LV95, e o relevo.bin de 5 m por cima onde houver
PASSO = 30.0
x0, z0, x1, z1 = AREA.bounds
E0, E1, N0, N1 = x0 + oe, x1 + oe, on - z1, on - z0
nx, nz = int((E1 - E0) / PASSO) + 1, int((N1 - N0) / PASSO) + 1
with tempfile.TemporaryDirectory() as tmp:
    raw = Path(tmp) / "dem.bin"
    subprocess.run(["gdalwarp", "-q", "-overwrite", "-s_srs", "EPSG:4326", "-t_srs", "EPSG:2056", "-te", str(E0 - PASSO / 2), str(N0 - PASSO / 2), str(E1 + PASSO / 2), str(N1 + PASSO / 2),
                    "-ts", str(nx), str(nz), "-r", "bilinear", "-ot", "Float32", "-of", "ENVI", str(RAIZ / "data/22-entorno/cop30_N47_E007.tif"), str(raw)], check=True)
    dem = np.fromfile(raw, dtype=np.float32).reshape(nz, nx)  # linha 0 = norte
import sys; sys.path.insert(0, str(RAIZ / "script")); from recorte import BASE_Z  # noqa: E402
R = meta["relevo"]
rel = np.fromfile(RAIZ / "docs/data/relevo.bin", dtype=np.uint16).reshape(R["ny"], R["nx"]) / 100.0
nivel = json.loads((RAIZ / "docs/data/reno.json").read_text())["nivel"]


def alt(x, z):
    i, j = (x - R["x0"]) / R["passo"], (z - R["z0"]) / R["passo"]
    if 0 <= i < R["nx"] - 1 and 0 <= j < R["ny"] - 1:
        return float(rel[int(round(j)), int(round(i))])
    e, n = x + oe, on - z
    ci, cj = (e - E0) / PASSO, (N1 - n) / PASSO
    ci, cj = min(max(ci, 0), nx - 1.001), min(max(cj, 0), nz - 1.001)
    i0, j0 = int(ci), int(cj); fx, fy = ci - i0, cj - j0
    h = dem[j0, i0] * (1 - fx) * (1 - fy) + dem[j0, i0 + 1] * fx * (1 - fy) + dem[j0 + 1, i0] * (1 - fx) * fy + dem[j0 + 1, i0 + 1] * fx * fy
    return max(float(h) - BASE_Z, nivel)  # no rio a linha fica na água


def linhas(geom, passo=8.0):
    """geometria de linhas → [[x, z, y, ...], ...] com um ponto a cada `passo` m (o relevo segue a linha)"""
    gs = geom.geoms if hasattr(geom, "geoms") else [geom]
    out = []
    for g in gs:
        if g.length < 20: continue
        n = max(2, int(g.length / passo) + 1)
        pts = [g.interpolate(i / (n - 1), normalized=True) for i in range(n)]
        out.append([v for p in pts for v in (round(p.x, 1), round(p.y, 1), round(alt(p.x, p.y), 1))])
    return out


borda = AREA.boundary.buffer(1.0)
mescla = lambda g: linemerge(g) if g.geom_type == 'MultiLineString' else g
nac = mescla(CH.boundary.intersection(AREA).difference(borda))
cant = mescla(BS.buffer(-3).boundary)  # 3 m para dentro: onde coincide com a nacional, as duas cortinas não se cruzam
T = meta["terreno"]; L = T.get("nvlado", 2048) * T["passo"]
terreno = box(T["x0"], T["z0"], T["x0"] + L, T["z0"] + L)
fora = terreno.difference(CH).simplify(1.0)
fora_l = [list(np.round(np.array(p.exterior.coords)[:-1], 1).ravel()) for p in (fora.geoms if hasattr(fora, "geoms") else [fora]) if p.geom_type == "Polygon" and p.area > 50]
out = {
    "fonte": "swissBOUNDARIES3D (© swisstopo), via api3.geo.admin.ch; relevo: swissALTI3D e Copernicus GLO-30",
    "nacional": linhas(nac), "cantao": linhas(cant), "fora": [[float(v) for v in a] for a in fora_l],
}
(RAIZ / "docs/data/fronteira.json").write_text(json.dumps(out, separators=(",", ":")))
print(f"nacional {nac.length / 1000:.1f} km · cantão {cant.length / 1000:.1f} km · fora do país no terreno {fora.area / 1e6:.2f} km² em {len(fora_l)} polígonos")
