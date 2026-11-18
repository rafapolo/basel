"""Tarefa 14: contorno do Reno, nível da água, pilares das pontes e cor/temperatura (data.bs.ch).

Fontes: OSM (natural=water + water=river, way 1467859273; ODbL) em data/14-reno/osm_agua.json;
relevo swissALTI3D reamostrado (data/raw/alti/crop5.raw) só para achar o nível da superfície;
data.bs.ch 100046 (temperatura, CC BY 4.0) e 100323 (turbidez, CC0 1.0).
Saída: docs/data/reno.json (coordenadas locais: x leste, z = -norte, y = m acima de BASE_Z).
Uso: uv run --with numpy --with shapely --with pyproj script/reno.py [--baixa]
"""
import json, sys, subprocess, urllib.request
from pathlib import Path
import numpy as np
from pyproj import Transformer
from shapely.geometry import Polygon, LineString, box, Point

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / "data/14-reno"
ORIG_E, ORIG_N, BASE_Z = 2611350.0, 1267525.0, 244.0
E0, N0, E1, N1 = 2610800.0, 1266950.0, 2611900.0, 1268100.0
ID_RIO = 1467859273
tr = Transformer.from_crs(4326, 2056, always_xy=True)

def local(geo):
    xs, ys = tr.transform([g["lon"] for g in geo], [g["lat"] for g in geo])
    return [(x - ORIG_E, -(y - ORIG_N)) for x, y in zip(xs, ys)]

def baixa(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "basel-3d-prototipo/0.1"})
    dest.write_bytes(urllib.request.urlopen(req, timeout=60).read())

def main():
    if "--baixa" in sys.argv:
        for d, f in [(100046, "r100046.json"), (100323, "r100323.json")]:
            baixa(f"https://data.bs.ch/api/explore/v2.1/catalog/datasets/{d}/records?limit=96&order_by=startzeitpunkt%20desc", DADOS / f)
    osm = json.loads((DADOS / "osm_agua.json").read_text())
    rio = next(e for e in osm["elements"] if e["id"] == ID_RIO)
    recorte = box(E0 - ORIG_E, -(N1 - ORIG_N), E1 - ORIG_E, -(N0 - ORIG_N))
    poly = Polygon(local(rio["geometry"])).buffer(0)
    poly = poly.intersection(recorte.buffer(-0.01)).simplify(0.4)
    partes = [poly] if poly.geom_type == "Polygon" else list(poly.geoms)
    partes = [p for p in partes if p.area > 2000]
    # nível: moda das alturas do relevo bem dentro do polígono (swissALTI3D põe a água plana)
    alt = np.fromfile(RAIZ / "data/raw/alti/crop5.raw", dtype=np.float32).reshape(230, 220)
    xs = -550 + 5 * np.arange(220); zs = -575 + 5 * np.arange(230)
    vals = []
    nucleo = poly.buffer(-12)
    for j in range(0, 230, 1):
        for i in range(0, 220, 1):
            if nucleo.contains(Point(xs[i], zs[j])): vals.append(alt[j, i])
    v = np.round(np.array(vals), 1)
    mv, cn = np.unique(v, return_counts=True)
    nivel = float(mv[cn.argmax()]) - BASE_Z
    print("nível do relevo dentro do rio: moda", mv[cn.argmax()], "mediana", float(np.median(v)), "n", len(v))
    # pilares: pontes do OSM (highway + bridge) que cruzam a água, um pilar a cada ~32 m do trecho molhado
    pil = []
    bruto = json.loads((RAIZ / "data/raw/osm.json").read_text())
    for e in bruto["elements"]:
        tg = e.get("tags", {})
        if e["type"] != "way" or not tg.get("bridge") or not (tg.get("highway") or tg.get("railway")): continue
        ln = LineString(local(e["geometry"]))
        trecho = ln.intersection(poly)
        for seg in ([trecho] if trecho.geom_type == "LineString" else list(getattr(trecho, "geoms", []))):
            if seg.geom_type != "LineString" or seg.length < 60: continue
            n = max(1, round(seg.length / 32))
            for k in range(1, n):
                p = seg.interpolate(seg.length * k / n); q = seg.interpolate(min(seg.length, seg.length * k / n + 2))
                ang = float(np.arctan2(q.y - p.y, q.x - p.x))
                a, b = ln.coords[0], ln.coords[-1]
                pil.append({"x": round(p.x, 1), "z": round(p.y, 1), "ang": round(ang, 3), "w": 3.2, "l": 9,
                            "a": [round(a[0], 1), round(a[1], 1)], "b": [round(b[0], 1), round(b[1], 1)], "f": round(ln.project(p) / ln.length, 3)})
    # dedupe pilares de pontes paralelas (mesma ponte tracejada duas vezes)
    uniq = []
    for p in pil:
        if all(np.hypot(p["x"] - u["x"], p["z"] - u["z"]) > 12 for u in uniq): uniq.append(p)
    clima = {}
    try:
        a = json.loads((DADOS / "r100046.json").read_text())["results"]
        te = next((r["rus_w_o_s3_te"] for r in a if r["rus_w_o_s3_te"] is not None), None)
        t = json.loads((DADOS / "r100323.json").read_text())["results"]
        trb = next((r["rus_w_o_ms_tr"] for r in t if r["rus_w_o_ms_tr"] is not None), None)
        clima = {"temp": te, "turb": trb, "em": a[0]["startzeitpunkt"]}
    except Exception as ex:
        print("sem clima:", ex)
    saida = {
        "nivel": round(nivel, 2),
        "aneis": [[round(c, 1) for xy in p.exterior.coords for c in xy] for p in partes],
        "pilares": uniq, "clima": clima,
        "fonte": "OSM way 1467859273 (ODbL); data.bs.ch 100046 CC BY 4.0, 100323 CC0 1.0",
    }
    (RAIZ / "docs/data/reno.json").write_text(json.dumps(saida, separators=(",", ":")))
    print("anéis", len(partes), [len(p.exterior.coords) for p in partes], "pilares", len(uniq), "clima", clima, "nivel", nivel)

main()
