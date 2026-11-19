#!/usr/bin/env python3
"""Lugares onde a gente para (pedido de 2026-11-19): grava docs/data/pontos.json para docs/vida.js.

  grupos     centros de rodinhas de 2 a 5 pessoas: Münsterplatz, Pfalz, Marktplatz, Barfüsserplatz, Claraplatz
             e as calçadas da Clarastrasse (áreas e linhas com esse nome no OSM, data/raw/osm.json)
  sentados   gente sentada no Rheinbord de Kleinbasel (Unterer e Oberer Rheinweg), virada para o rio: a cada
             ~2,4 m da via, o ponto da margem (reno.json) mais perto, 1,4 m para dentro da terra
  paradas    paradas de bonde do GTFS (data/19-vida/gtfs/stops.txt) no recorte, com o nome
  focos      centros que puxam a densidade de quem anda (somados às contagens 100013 em vida.js)

A ponte (gente debruçada no parapeito da Mittlere) sai do eixo de marcos.js, no cliente.
Coordenadas locais (x leste, z = −norte) a partir de predios.json: origem_lv95.

  uv run --with shapely --with pyproj script/pontos.py
"""
import csv
import json
import math
import random
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import nearest_points, unary_union

RAIZ = Path(__file__).resolve().parent.parent
DOCS = RAIZ / "docs/data"
ORIGEM = json.loads((DOCS / "predios.json").read_text())["origem_lv95"]
T = Transformer.from_crs(4326, 2056, always_xy=True)
from recorte import dentro as no_recorte
LIM = None  # (era 545: ±545 m em x e z; agora vale o retângulo de script/recorte.py, com 15 m de folga)
fora = lambda x, z: not no_recorte(x, z, -15)
rnd = random.Random(19)


def xz(lon, lat):
    e, n = T.transform(lon, lat)
    return e - ORIGEM[0], -(n - ORIGEM[1])


osm = json.loads((RAIZ / "data/raw/osm.json").read_text())["elements"]


def geometrias(nome):
    out = []
    for e in osm:
        if e.get("tags", {}).get("name") != nome or "geometry" not in e:
            continue
        pts = [xz(p["lon"], p["lat"]) for p in e["geometry"]]
        area = e["tags"].get("area") == "yes" and len(pts) >= 4
        out.append(Polygon(pts) if area else LineString(pts))
    return out


def regiao(nome, buf_linha):
    gs = geometrias(nome)
    return unary_union([g.buffer(0) if isinstance(g, Polygon) else g.buffer(buf_linha) for g in gs]) if gs else None


def amostra(reg, n, dist_min):
    x0, z0, x1, z1 = reg.bounds
    pts, tent = [], 0
    while len(pts) < n and tent < n * 400:
        tent += 1
        p = (rnd.uniform(x0, x1), rnd.uniform(z0, z1))
        if fora(p[0], p[1]) or not reg.contains(Point(p)):
            continue
        if all(math.hypot(p[0] - q[0], p[1] - q[1]) >= dist_min for q in pts):
            pts.append(p)
    return pts


# ---------------------------------------------------------------- rodinhas
LUGARES = [  # nome, largura das linhas (m), quantos grupos, peso no foco de quem anda
    ("Münsterplatz", 9, 18, 1.0), ("Pfalz", 0, 10, 0.7), ("Marktplatz", 9, 16, 1.0),
    ("Barfüsserplatz", 9, 16, 1.0), ("Claraplatz", 8, 8, 0.7), ("Clarastrasse", 7, 14, 0.9),
    # recorte de 2026-11-19: a estação SBB (sempre cheia), a Steinenvorstadt e a Allschwilerplatz
    ("Centralbahnplatz", 12, 30, 1.6), ("Steinenvorstadt", 7, 12, 0.9), ("Allschwilerplatz", 8, 8, 0.6),
]
grupos, focos = [], []
for nome, buf, n, peso in LUGARES:
    reg = regiao(nome, buf)
    if reg is None or reg.is_empty:
        print("sem geometria:", nome)
        continue
    pts = amostra(reg, n, 5.5)
    grupos += [[round(x, 1), round(z, 1), nome] for x, z in pts]
    c = reg.centroid
    if not fora(c.x, c.y):
        focos.append([round(c.x, 1), round(c.y, 1), peso])
    print(f"{nome}: {len(pts)} grupos")

# ---------------------------------------------------------------- Rheinbord
reno = json.loads((DOCS / "reno.json").read_text())
anel = reno["aneis"][0]
margem = LineString([(anel[i], anel[i + 1]) for i in range(0, len(anel) - 1, 2)])
sentados = []
for nome in ("Unterer Rheinweg", "Oberer Rheinweg"):
    for g in geometrias(nome):
        if not isinstance(g, LineString):
            continue
        d = 0.0
        while d < g.length:
            p = g.interpolate(d)
            d += 2.4
            if fora(p.x, p.y):
                continue
            m = nearest_points(margem, p)[0]
            dist = p.distance(m)
            if dist < 2 or dist > 35:
                continue
            ux, uz = (p.x - m.x) / dist, (p.y - m.y) / dist   # da água para a terra
            x, z = m.x + ux * 1.4, m.y + uz * 1.4
            ang = math.atan2(-ux, -uz)                          # de frente para o rio
            sentados.append([round(x, 1), round(z, 1), round(ang, 2)])
focos.append([round(sum(s[0] for s in sentados) / max(1, len(sentados)), 1),
              round(sum(s[1] for s in sentados) / max(1, len(sentados)), 1), 0.6])
print("Rheinbord:", len(sentados), "lugares")

# ---------------------------------------------------------------- paradas de bonde
paradas, vistos = [], set()
with open(RAIZ / "data/19-vida/gtfs/stops.txt", encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        if not r["stop_name"].startswith("Basel"):
            continue
        x, z = xz(float(r["stop_lon"]), float(r["stop_lat"]))
        if fora(x, z):
            continue
        k = (round(x / 6), round(z / 6))
        if k in vistos:
            continue
        vistos.add(k)
        paradas.append([round(x, 1), round(z, 1), r["stop_name"].replace("Basel, ", "")])
print("paradas:", len(paradas))

out = {"fonte": "OpenStreetMap (ODbL), reno.json, GTFS opentransportdata.swiss", "grupos": grupos,
       "sentados": sentados, "paradas": paradas, "focos": focos}
(DOCS / "pontos.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
print("docs/data/pontos.json:", (DOCS / "pontos.json").stat().st_size, "bytes")
