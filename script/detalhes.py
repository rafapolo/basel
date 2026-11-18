#!/usr/bin/env python3
"""Detalhes de rua (tarefa 17): posições de fontanários, postes de luz, bancos, lixeiras, bicicletários, toldos, mesas,
letreiros, bandeiras, balsas e navios. Gera docs/data/detalhes.json.

Fontes (em data/17-detalhes/, baixadas em 2026-11-18):
  osm_overpass.kumi.systems.json  OSM (Overpass, espelho kumi.systems): street_lamp, bench, waste_basket, bicycle_parking,
                                  drinking_fountain, fountain, café/restaurante/bar/loja, route=ferry. © OpenStreetMap contributors, ODbL
  brunnen_100008.json             data.bs.ch 100008, "Bade-, Trinkwasser- und Zierbrunnen in Basel" (IWB). Freie Nutzung, fonte obrigatória
  velos_100241.json               data.bs.ch 100241, "Veloabstellplätze" (Kanton Basel-Stadt). CC BY 4.0
Também lê docs/data/predios.{json,bin} (pegadas dos prédios) e ruas_a.png (máscara de rua e calçada, 0,5 m/px).

Coordenadas locais como no resto do projeto: x = leste, z = −norte, em metros, a partir de `origem_lv95`. Ângulos: `ang` é a
rotação em Y (three.js) que leva o +z local à direção alvo: atan2(nx, nz). A altura sobre o relevo é calculada no navegador.
Letreiros guardam só a categoria da loja, nunca o nome (sem marcas).

Uso: uv run --with polars --with shapely --with pyproj --with numpy --with pillow script/detalhes.py
"""
import json
import math
from pathlib import Path

import numpy as np
import polars as pl
import shapely
from PIL import Image
from pyproj import Transformer
from shapely import STRtree
from shapely.geometry import LineString, Point

RAIZ = Path(__file__).resolve().parent.parent
BRUTO = RAIZ / "data/17-detalhes"
DOCS = RAIZ / "docs/data"
rng = np.random.default_rng(17)

meta = json.loads((DOCS / "predios.json").read_text())
P = meta["predios"]
E0, N0 = meta["origem_lv95"]
RE0, RN0, RE1, RN1 = meta["recorte_lv95"]
XMIN, XMAX, ZMIN, ZMAX = RE0 - E0, RE1 - E0, -(RN1 - N0), -(RN0 - N0)
tr = Transformer.from_crs(4326, 2056, always_xy=True)


def local(lon, lat):
    e, n = tr.transform(lon, lat)
    return round(e - E0, 1), round(-(n - N0), 1)


def dentro(x, z, folga=4):
    return XMIN + folga < x < XMAX - folga and ZMIN + folga < z < ZMAX - folga


def ang(nx, nz):
    return round(math.atan2(nx, nz), 2)


# ---------- prédios: pegadas por sólido (união dos triângulos projetados em xz) ----------
nv = meta["n_tris"] * 3
raw = (DOCS / "predios.bin").read_bytes()
q = np.frombuffer(raw, dtype=np.int16, count=nv * 3).reshape(-1, 3) / meta["escala"]
ids = np.frombuffer(raw, dtype=np.uint16, count=nv, offset=nv * 6)
tris = q[:, [0, 2]].reshape(-1, 3, 2)
tid = ids[::3]
d1, d2 = tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0]
area = 0.5 * np.abs(d1[:, 0] * d2[:, 1] - d1[:, 1] * d2[:, 0])
ok = area > 1e-4
polys = shapely.polygons(np.concatenate([tris, tris[:, :1]], axis=1))
pegadas = [None] * len(P)
for i in np.unique(tid):
    sel = (tid == i) & ok
    if sel.any():
        u = shapely.union_all(polys[sel]).buffer(0.05)
        pegadas[int(i)] = u
validos = [i for i, g in enumerate(pegadas) if g is not None and not g.is_empty]
geos = [pegadas[i] for i in validos]
arv = STRtree(geos)
print("prédios com pegada:", len(validos))


def em_predio(x, z, folga=0.0):
    pt = Point(x, z)
    idx = arv.query(pt.buffer(folga) if folga else pt, predicate="intersects")
    return len(idx) > 0


# ---------- máscara de rua/calçada ----------
ma = np.asarray(Image.open(DOCS / "ruas_a.png").convert("RGB")).astype(np.float32) / 255
COB = np.clip(ma.sum(axis=2), 0, 1)
MX0, MZ0 = XMIN, ZMIN


def andavel(x, z, lim=0.35):
    c, r = int((x - MX0) / 0.5), int((z - MZ0) / 0.5)
    return 0 <= r < COB.shape[0] and 0 <= c < COB.shape[1] and COB[r, c] > lim


# ---------- relevo (só para o tabuleiro das pontes; o resto usa altura() no navegador) ----------
N_DEM, P_DEM, BASE_Z = 2049, 0.6, meta["base_z"]
DEM = np.fromfile(BRUTO.parent / "15-chao/dem06.raw", dtype=np.float32).reshape(N_DEM, N_DEM)


def dem(x, z):
    m = (N_DEM - 1) * P_DEM / 2  # a grade é centrada na origem local; linha 0 = norte
    c, r = int(round((x + m) / P_DEM)), int(round((z + m) / P_DEM))
    return float(DEM[min(max(r, 0), N_DEM - 1), min(max(c, 0), N_DEM - 1)]) - BASE_Z


# ---------- ruas (linhas do OSM) ----------
ruas = json.loads((DOCS / "ruas.json").read_text())
LARG = {"secondary": 8, "secondary_link": 6, "tertiary": 7, "unclassified": 6, "residential": 6, "living_street": 5, "pedestrian": 6, "service": 3.5}
linhas_rua = [(l, LineString(np.array(l["c"]).reshape(-1, 2))) for l in ruas["linhas"] if l["t"] in LARG or l["t"] in ("footway", "path", "steps", "cycleway")]
arv_ruas = STRtree([g for _, g in linhas_rua])


def tangente_rua(x, z):
    """direção unitária da rua mais próxima (para alinhar bancos, bicicletários, fontes)."""
    pt = Point(x, z)
    i = int(arv_ruas.nearest(pt))
    g = linhas_rua[i][1]
    s = g.project(pt)
    a, b = g.interpolate(max(0, s - 1)), g.interpolate(min(g.length, s + 1))
    dx, dz = b.x - a.x, b.y - a.y
    L = math.hypot(dx, dz) or 1
    return dx / L, dz / L, g.distance(pt)


def parede_perto(x, z, maxd=8.0, exige_calcada=True):
    """ponto da fachada mais próximo de (x, z): (px, pz, nx, nz, id do prédio) ou None. Normal para fora do prédio."""
    pt = Point(x, z)
    cand = arv.query(pt.buffer(maxd + 6), predicate="intersects")
    melhor, melhor_s = None, 1e9
    for ci in cand:
        g = geos[int(ci)]
        for poly in getattr(g, "geoms", [g]):
            ring = poly.exterior
            L = ring.length
            if L < 4:
                continue
            n = max(8, int(L / 0.8))
            ss = np.linspace(0, L, n, endpoint=False)
            pts = shapely.line_interpolate_point(ring, ss)
            ptsb = shapely.line_interpolate_point(ring, (ss + 0.6) % L)
            xy = shapely.get_coordinates(pts)
            xyb = shapely.get_coordinates(ptsb)
            tx, tz = xyb[:, 0] - xy[:, 0], xyb[:, 1] - xy[:, 1]
            Lt = np.hypot(tx, tz) + 1e-9
            nx, nz = tz / Lt, -tx / Lt
            # a normal para fora é a que cai fora da pegada
            sond = shapely.points(xy[:, 0] + nx * 0.4, xy[:, 1] + nz * 0.4)
            fora = ~shapely.intersects(poly, sond)
            nx, nz = np.where(fora, nx, -nx), np.where(fora, nz, -nz)
            d = np.hypot(xy[:, 0] - x, xy[:, 1] - z)
            score = d.copy()
            if exige_calcada:
                for k in np.where(d < maxd + 4)[0]:
                    if not andavel(xy[k, 0] + nx[k] * 1.3, xy[k, 1] + nz[k] * 1.3):
                        score[k] += 10
            k = int(np.argmin(score))
            if score[k] < melhor_s and d[k] < maxd + 4:
                melhor_s = score[k]
                melhor = (float(xy[k, 0]), float(xy[k, 1]), float(nx[k]), float(nz[k]), validos[int(ci)])
    return melhor if melhor and melhor_s < maxd + 4 else None


# ---------- fontes de dados ----------
osm = json.loads((BRUTO / "osm_overpass.kumi.systems.json").read_text())["elements"]
nos = pl.DataFrame([{"id": e["id"], "lon": e["lon"], "lat": e["lat"], **{k: e.get("tags", {}).get(k) for k in
                    ("highway", "amenity", "shop", "man_made", "direction", "name")}} for e in osm if e["type"] == "node"], infer_schema_length=None)
nos = nos.with_columns(
    pl.struct("lon", "lat").map_elements(lambda s: local(s["lon"], s["lat"]), return_dtype=pl.List(pl.Float64)).alias("xz")
).with_columns(pl.col("xz").list.get(0).alias("x"), pl.col("xz").list.get(1).alias("z")).drop("xz")
nos = nos.filter((pl.col("x") > XMIN + 3) & (pl.col("x") < XMAX - 3) & (pl.col("z") > ZMIN + 3) & (pl.col("z") < ZMAX - 3))
print("nós OSM no recorte:", nos.height)


def pontos(df):
    return list(zip(df["x"].to_list(), df["z"].to_list()))


def sem_duplicatas(lista, dmin):
    """lista de (x, z, ...) → remove os que ficam a menos de dmin m de outro já aceito (hash espacial)."""
    cel, saida = {}, []
    for it in lista:
        cx, cz = int(it[0] // dmin), int(it[1] // dmin)
        if any(math.hypot(it[0] - o[0], it[1] - o[1]) < dmin for dx in (-1, 0, 1) for dz in (-1, 0, 1) for o in cel.get((cx + dx, cz + dz), [])):
            continue
        cel.setdefault((cx, cz), []).append(it)
        saida.append(it)
    return saida


# ---------- fontanários ----------
brun = json.loads((BRUTO / "brunnen_100008.json").read_text())
fontes = []
for b in brun:
    g = b["geo_point_2d"]
    x, z = local(g["lon"], g["lat"])
    if dentro(x, z, 2) and not em_predio(x, z):
        fontes.append((x, z, 0))  # 0 = fonte grande (data.bs.ch 100008 lista Zier-, Trink- e Badebrunnen)
for r in nos.filter(pl.col("amenity").eq("fountain") | pl.col("man_made").eq("drinking_fountain")).iter_rows(named=True):
    if not em_predio(r["x"], r["z"]):
        fontes.append((r["x"], r["z"], 1 if r["man_made"] == "drinking_fountain" and r["amenity"] != "fountain" else 0))
fontes = sem_duplicatas(fontes, 4.0)
fontes = [[x, z, t, ang(*tangente_rua(x, z)[:2][::-1])] for x, z, t in fontes]
print("fontanários:", len(fontes))

# ---------- bancos e lixeiras ----------
bancos = []
for r in nos.filter(pl.col("amenity").eq("bench")).iter_rows(named=True):
    x, z = r["x"], r["z"]
    if em_predio(x, z):
        continue
    a = None
    if r["direction"] and str(r["direction"]).replace(".", "").isdigit():
        d = math.radians(float(r["direction"]))  # rumo do norte, horário; z = −norte
        a = ang(math.sin(d), -math.cos(d))
    else:
        w = parede_perto(x, z, 3.0, exige_calcada=False)
        if w and math.hypot(w[0] - x, w[1] - z) < 2.2:
            a = ang(w[2], w[3])  # costas na parede, de frente para fora
        else:
            tx, tz, dist = tangente_rua(x, z)
            a = ang(-tz, tx)  # de frente para a rua mais próxima
    bancos.append([x, z, a])
bancos = sem_duplicatas(bancos, 1.2)
lixeiras = [[x, z] for x, z in pontos(nos.filter(pl.col("amenity").eq("waste_basket"))) if not em_predio(x, z)]
print("bancos:", len(bancos), "lixeiras:", len(lixeiras))

# ---------- bicicletários: data.bs.ch 100241 primeiro, OSM para o que faltar ----------
velos = json.loads((BRUTO / "velos_100241.json").read_text())
bic = []
for v in velos:
    g = v["geo_point_2d"]
    x, z = local(g["lon"], g["lat"])
    if dentro(x, z, 2) and not em_predio(x, z):
        bic.append([x, z, int(v.get("anzahl_velos") or 6), 1 if v.get("gedeckt") == "ja" else 0, 1])
n_bs = len(bic)
for x, z in pontos(nos.filter(pl.col("amenity").eq("bicycle_parking"))):
    if em_predio(x, z) or any(math.hypot(x - b[0], z - b[1]) < 12 for b in bic):
        continue
    bic.append([x, z, 6, 0, 0])
bicicletarios = []
for x, z, n, cob, bs in bic:
    w = parede_perto(x, z, 4.0, exige_calcada=False)
    if w and math.hypot(w[0] - x, w[1] - z) < 3.5:
        a = ang(w[2], w[3])
    else:
        tx, tz, _ = tangente_rua(x, z)
        a = ang(-tz, tx)
    bicicletarios.append([x, z, a, n, cob])
print("bicicletários:", len(bicicletarios), "(data.bs.ch:", n_bs, ")")

# ---------- postes de luz ----------
lampadas = [[x, z, round(float(rng.uniform(0, 6.28)), 2), 0] for x, z in pontos(nos.filter(pl.col("highway").eq("street_lamp"))) if not em_predio(x, z)]
n_osm = len(lampadas)
# complemento a cada ~25 m ao longo das ruas de carro e de pedestres (não escadas nem trilhas)
def ponto_livre_lampada(cx, cz, nx, nz, meia):
    for lado in (1, -1):
        for off in (meia + 0.3, meia - 0.4):
            x, z = cx + lado * nx * off, cz + lado * nz * off
            if andavel(x, z, 0.5) and not em_predio(x, z, 0.9) and dentro(x, z, 3):
                return x, z
    return None


vistos = [(x, z) for x, z, *_ in lampadas]
grade = {}
for x, z in vistos:
    grade.setdefault((int(x // 12), int(z // 12)), []).append((x, z))


def perto_de_lampada(x, z, d=12):
    cx, cz = int(x // 12), int(z // 12)
    return any(math.hypot(x - a, z - b) < d for i in (-1, 0, 1) for j in (-1, 0, 1) for a, b in grade.get((cx + i, cz + j), []))


for l, g in linhas_rua:
    t = l["t"]
    if t not in LARG:
        continue
    L = g.length
    if L < 12:
        continue
    meia = LARG[t] / 2
    k = 0
    for s in np.arange(min(8.0, L / 2), L - 4, 25.0):
        a, b = g.interpolate(s), g.interpolate(min(L, s + 1.5))
        dx, dz = b.x - a.x, b.y - a.y
        Ln = math.hypot(dx, dz) or 1
        nx, nz = -dz / Ln, dx / Ln
        k += 1
        if not dentro(a.x, a.y, 4) or perto_de_lampada(a.x, a.y):
            continue
        item = None
        poste = ponto_livre_lampada(a.x, a.y, nx * (1 if k % 2 else -1), nz * (1 if k % 2 else -1), meia)
        if LARG[t] <= 6 or not poste:
            w = parede_perto(a.x, a.y, meia + 2.0, exige_calcada=False)
            if w and math.hypot(w[0] - a.x, w[1] - a.y) < meia + 2.0:
                item = [round(w[0] + w[2] * 0.12, 1), round(w[1] + w[3] * 0.12, 1), ang(w[2], w[3]), 1]
        if item is None and poste:
            item = [round(poste[0], 1), round(poste[1], 1), round(float(rng.uniform(0, 6.28)), 2), 0]
            if l.get("ponte"):  # tabuleiro: reta entre as cotas das pontas (como em chao.js), mais 0,6 m
                hA, hB = dem(*g.coords[0]), dem(*g.coords[-1])
                item.append(round(hA + (hB - hA) * s / L + 0.6, 2))
        if item:
            lampadas.append(item)
            grade.setdefault((int(item[0] // 12), int(item[1] // 12)), []).append((item[0], item[1]))
print("postes:", len(lampadas), "(OSM:", n_osm, ")")

# ---------- lojas, cafés: toldos, letreiros, mesas com guarda-sol ----------
CAT = {  # categoria → índice no atlas de letreiros (docs/detalhes.js, TEXTOS)
    "cafe": 0, "restaurant": 1, "bar": 2, "pub": 2, "fast_food": 3, "ice_cream": 4, "bakery": 5, "pastry": 5, "confectionery": 5, "chocolate": 5,
    "clothes": 6, "shoes": 6, "fashion_accessories": 6, "jewelry": 7, "watches": 7, "hairdresser": 8, "beauty": 8, "cosmetics": 8, "perfumery": 8,
    "books": 9, "florist": 10, "optician": 11, "hearing_aids": 11, "supermarket": 12, "convenience": 12, "kiosk": 12, "newsagent": 12,
    "wine": 13, "antiques": 14, "second_hand": 14, "interior_decoration": 15, "furniture": 15, "toys": 16, "bicycle": 17, "electronics": 18,
    "telecommunication": 18, "mobile_phone": 18, "travel_agency": 19, "ticket": 19, "gift": 20,
}
comer = {"cafe", "restaurant", "bar", "pub", "fast_food", "ice_cream"}
lojas = []
for r in nos.iter_rows(named=True):
    c = r["amenity"] if r["amenity"] in CAT else (r["shop"] if r["shop"] in CAT else None)
    if c:
        lojas.append((r["x"], r["z"], c))
toldos, mesas, letreiros = [], [], []
usados_t, usados_l = [], []
for x, z, c in lojas:
    w = parede_perto(x, z, 9.0)
    if not w:
        continue
    px, pz, nx, nz, bid = w
    if any(math.hypot(px - u[0], pz - u[1]) < 3.2 for u in usados_l):
        continue
    usados_l.append((px, pz))
    letreiros.append([round(px + nx * 0.05, 1), round(pz + nz * 0.05, 1), ang(nx, nz), CAT[c], bid])
    if c in comer and not any(math.hypot(px - u[0], pz - u[1]) < 4.5 for u in usados_t):
        usados_t.append((px, pz))
        toldos.append([round(px, 1), round(pz, 1), ang(nx, nz), int(rng.integers(0, 6)), bid])
        # duas ou três mesas com guarda-sol à frente do café, se houver chão livre
        tx, tz = -nz, nx
        n_m = 0
        for dist, lat in ((3.2, -1.6), (3.2, 1.6), (5.4, 0.0), (3.2, 0.0)):
            mx, mz = px + nx * dist + tx * lat, pz + nz * dist + tz * lat
            if n_m < 3 and andavel(mx, mz, 0.5) and not em_predio(mx, mz, 1.0) and all(math.hypot(mx - m[0], mz - m[1]) > 2.4 for m in mesas):
                mesas.append([round(mx, 1), round(mz, 1), round(float(rng.uniform(0, 6.28)), 2), int(rng.integers(0, 6)), bid])
                n_m += 1
print("letreiros:", len(letreiros), "toldos:", len(toldos), "mesas:", len(mesas))

# ---------- bandeiras de Basel nos prédios públicos ----------
PUBLICOS = {"Museen und Bibliotheken", "Schul- und Hochschulgebäude, Forschungseinrichtungen", "Kirchen und sonstige Kultgebäude"}
bandeiras, vistos_egid = [], set()
cands = []
for i in validos:
    p = P[i]
    nome = p.get("nome") or ""
    if nome == "Rathaus":
        cands.append((0, i, 3))
    elif ("Universität Basel" in nome and "Kollegienhaus" in nome) or "Kunstmuseum" in nome or "Museum" in nome:
        cands.append((1, i, 2))
    elif p.get("cls") in PUBLICOS and (p.get("alt") or 0) >= 10 and p.get("egid") not in vistos_egid and p.get("cls") != "Kirchen und sonstige Kultgebäude":
        cands.append((2, i, 1))
cands.sort()
for _, i, n_bandeiras in cands:
    if len(bandeiras) >= 48:
        break
    eg = P[i].get("egid")
    if eg in vistos_egid:
        continue
    if eg:
        vistos_egid.add(eg)
    g = pegadas[i]
    poly = max(getattr(g, "geoms", [g]), key=lambda s: s.area)
    co = np.array(poly.exterior.coords)
    arestas = []
    for a, b in zip(co[:-1], co[1:]):
        L = float(np.hypot(*(b - a)))
        if L < 7:
            continue
        m = (a + b) / 2
        t = (b - a) / L
        n1 = np.array([t[1], -t[0]])
        if poly.contains(Point(*(m + n1 * 0.4))):
            n1 = -n1
        if andavel(*(m + n1 * 2.0)):
            arestas.append((L, m, n1, t))
    arestas.sort(key=lambda e: -e[0])
    for L, m, n1, t in arestas[:1]:
        alt = P[i].get("alt") or 10
        h = float(min(max(5.2, alt * 0.45), 8.5))
        for k in range(n_bandeiras):
            off = (k - (n_bandeiras - 1) / 2) * min(5.0, L / (n_bandeiras + 1))
            c = m + t * off
            bandeiras.append([round(float(c[0] + n1[0] * 0.1), 1), round(float(c[1] + n1[1] * 0.1), 1), ang(n1[0], n1[1]), round(h, 1), i])
print("bandeiras:", len(bandeiras))

# ---------- balsas do Reno (balsas de cabo) e navios ----------
ways = {e["id"]: e for e in osm if e["type"] == "way"}
rels = {e["id"]: e for e in osm if e["type"] == "relation"}
membros = {m["ref"]: [local(p["lon"], p["lat"]) for p in m["geometry"]] for m in rels[6376741]["members"] if m.get("geometry")}
BALSAS = [  # (nome, id do trecho no OSM, local)
    ("Leu", 170862718, "Münsterfähre"), ("Vogel Gryff", 24872915, "Klingentalfähre"),
    ("Wilde Maa", 24519494, "St. Johann-Fähre"), ("Ueli", 25400030, "St. Alban-Fähre"),
]
balsas, fora = [], []
for nome, wid, linha in BALSAS:
    pts = [local(p["lon"], p["lat"]) for p in ways[wid]["geometry"]] if wid in ways else membros[wid]
    a, b = pts[0], pts[-1]
    item = {"nome": nome, "linha": linha, "a": list(a), "b": list(b)}
    (balsas if all(dentro(*p, 0) for p in (a, b)) else fora).append(item)
print("balsas no recorte:", [b["nome"] for b in balsas], "| fora do recorte:", [b["nome"] for b in fora])
rio = [local(p["lon"], p["lat"]) for p in ways[447459116]["geometry"]] + [local(p["lon"], p["lat"]) for p in ways[447461432]["geometry"]][1:]
rio = [p for p in rio if XMIN - 40 < p[0] < XMAX + 40 and ZMIN - 40 < p[1] < ZMAX + 40]
pier = [list(local(p["lon"], p["lat"])) for p in ways[447403358]["geometry"]]

saida = {
    "fontes": fontes, "lampadas": lampadas, "bancos": bancos, "lixeiras": lixeiras, "bicicletarios": bicicletarios,
    "toldos": toldos, "mesas": mesas, "letreiros": letreiros, "bandeiras": bandeiras,
    "balsas": balsas, "balsas_fora": fora, "rio": [list(p) for p in rio], "pier": pier,
}
destino = DOCS / "detalhes.json"
destino.write_text(json.dumps(saida, separators=(",", ":"), ensure_ascii=False))
print("gravado", destino, round(destino.stat().st_size / 1024), "KB")
