"""Chão da Altstadt (tarefa 15): relevo swissALTI3D 0,5 m em malha adaptativa e máscaras das ruas.

Chamado por predios.py. Gera em docs/data/:

  terreno.v2.bin   malha RTIN do relevo: u16 coluna, u16 linha, u16 altitude (cm, + `off` m acima de BASE_Z) por
                   vértice e os índices dos triângulos, no formato compacto de script/compacta.py. Coordenada local: x = x0 + coluna*passo, z = z0 + linha*passo.
  ruas_a.webp      RGB (WebP sem perdas): R asfalto, G paralelepípedo, B calçada (cobertura 0..1, 0,5 m/px, recorte inteiro)
  ruas_b.webp      RGB (WebP sem perdas): R marca de faixa, G leito do bonde, B reservado
  ruas.json        ganha "faixas" (linhas de rua com largura e tipo) e "tram" com ponte/túnel resolvidos

Dados baixados em data/15-chao/ (swissALTI3D 0,5 m, zonas de pedestres 100251, OSM extra).
"""
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import compacta
import rtin

RAIZ = Path(__file__).resolve().parent.parent
BRUTO15 = RAIZ / "data/15-chao"

N = 2049
PASSO = 0.6
OFF = 10.0  # m somados à altitude antes de gravar em Uint16 (o relevo mais baixo fica ~ BASE_Z + 0,7)


def carrega_dem(origem_e, origem_n):
    """swissALTI3D 0,5 m reamostrado a 0,6 m numa grade 2049² centrada na origem local (cobre o recorte com folga)."""
    raw = BRUTO15 / "dem06.raw"
    meio = (N - 1) * PASSO / 2
    e0, n1 = origem_e - meio, origem_n + meio
    if not raw.exists():
        vrt = BRUTO15 / "alti05.vrt"
        subprocess.run(["gdalbuildvrt", "-q", "-overwrite", str(vrt), *map(str, sorted(BRUTO15.glob("swissalti3d_*_0.5_*.tif")))], check=True)
        subprocess.run(["gdalwarp", "-q", "-overwrite", "-te", str(e0), str(n1 - 2 * meio), str(e0 + 2 * meio), str(n1),
                        "-ts", str(N), str(N), "-r", "bilinear", "-ot", "Float32", "-of", "ENVI", str(vrt), str(raw)], check=True)
    h = np.fromfile(raw, dtype=np.float32).reshape(N, N)
    return h, e0, n1


def _poly_px(g, e0, n1, c0=0, r0=0, k=1.0):
    return [((x - e0) / PASSO * k - c0, (n1 - y) / PASSO * k - r0) for x, y in g.exterior.coords]


def pes_dos_predios(h, e0, n1, pegadas, bases):
    """Para cada prédio, quanto a base do sólido está acima do chão mais baixo ao redor (0 = encostado ou enterrado).
    Devolve (dz por prédio: m a descer a base, ou None; estatísticas)."""
    dz, dif = [], []
    for fp, base in zip(pegadas, bases):
        if fp.is_empty or base is None:
            dz.append(None); continue
        anel = fp.buffer(1.0).difference(fp.buffer(0.2))
        x0, y0, x1, y1 = fp.buffer(1.5).bounds
        c0, c1 = int((x0 - e0) / PASSO), int((x1 - e0) / PASSO) + 2
        r0, r1 = int((n1 - y1) / PASSO), int((n1 - y0) / PASSO) + 2
        if c0 < 0 or r0 < 0 or c1 >= N or r1 >= N:
            dz.append(None); continue
        m = Image.new("L", (c1 - c0, r1 - r0), 0)
        d = ImageDraw.Draw(m)
        for g in getattr(anel, "geoms", [anel]):
            if g.geom_type != "Polygon":
                continue
            d.polygon(_poly_px(g, e0, n1, c0, r0), fill=1)
            for it in g.interiors:
                d.polygon([((x - e0) / PASSO - c0, (n1 - y) / PASSO - r0) for x, y in it.coords], fill=0)
        v = h[r0:r1, c0:c1][np.array(m) > 0]
        if v.size < 5:
            dz.append(None); continue
        gap = base - float(v.min())
        dif.append(gap)
        dz.append(round(gap + 0.25, 2) if gap > 0.05 else None)
    return dz, np.array(dif)


def grava_terreno(h, saida, erro, origem_e, origem_n, metade_x, metade_z):
    """Malha RTIN recortada ao retângulo local [-metade_x, metade_x] × [-metade_z, metade_z] (+ 2 m de folga)."""
    verts, tris = rtin.malha(h, erro)
    meio = (N - 1) * PASSO / 2
    x = -meio + verts[:, 0] * PASSO
    z = -meio + verts[:, 1] * PASSO
    cx = x[tris].mean(axis=1)
    cz = z[tris].mean(axis=1)
    fica = (np.abs(cx) < metade_x + 2) & (np.abs(cz) < metade_z + 2)
    tris = tris[fica]
    usados = np.unique(tris)
    novo = np.full(len(verts), -1, np.int64)
    novo[usados] = np.arange(len(usados))
    tris = novo[tris].astype(np.uint32)
    v = verts[usados]
    hv = np.round((h[v[:, 1], v[:, 0]] - 244.0 + OFF) * 100)
    assert hv.min() >= 0 and hv.max() < 65536
    # triângulos com o lado de fora para cima (o three descarta a face de trás)
    xs, zs = x[usados][tris], z[usados][tris]
    area = (xs[:, 1] - xs[:, 0]) * (zs[:, 2] - zs[:, 0]) - (xs[:, 2] - xs[:, 0]) * (zs[:, 1] - zs[:, 0])
    inv = area > 0  # em x,z com y para cima, a área "z para baixo" positiva é horária visto de cima: troca
    tris[inv] = tris[inv][:, [0, 2, 1]]
    (saida / "terreno.v2.bin").write_bytes(compacta.terreno(v[:, 0], v[:, 1], hv, tris))
    return {"nv": int(len(usados)), "nt": int(len(tris)), "passo": PASSO, "x0": -meio, "z0": -meio, "off": OFF, "erro": erro}


# ---------------------------------------------------------------- ruas como áreas
VIAS = {  # largura da pista (m) de cada classe do OSM; a calçada e a fachada recortam o excesso
    "secondary": 8.0, "secondary_link": 6.0, "tertiary": 7.0, "unclassified": 5.6, "residential": 5.4, "living_street": 5.0,
    "service": 3.4, "construction": 4.0, "pedestrian": 6.0,
}
CAMINHOS = {"footway": 2.2, "path": 1.8, "steps": 2.0, "cycleway": 2.2, "platform": 3.0}
PARALELEPIPEDO = {"sett", "unhewn_cobblestone", "cobblestone", "cobblestone:flattened"}
LAJES = {"paving_stones", "concrete:plates", "paving_stones:lanes", "paved", "concrete"}
ESCALA_MASC = 2  # supersample para a cobertura (anti-aliasing) das máscaras


def _largura(t, base):
    try:
        w = float(str(t.get("width", "")).replace(",", ".").split()[0])
        if 1.0 <= w <= 30:
            return w
    except (ValueError, IndexError):
        pass
    return base


def _material(t, na_zona, via):
    s = t.get("surface")
    if na_zona or s in PARALELEPIPEDO:
        return "pav"
    if s in LAJES and not via:
        return "laje"
    if s in ("asphalt", None) and via:
        return "asf"
    return "laje" if not via else "asf"


def mascaras(osm, pegadas, origem_e, origem_n, e0, n0, e1, n1, saida, passo=0.5):
    """Rasteriza as ruas como áreas (cobertura por material) em ruas_a.webp / ruas_b.webp e devolve o meio-fio e a estatística."""
    from pyproj import Transformer
    from shapely.geometry import LineString, Polygon, box, mapping
    from shapely.ops import substring, unary_union
    from shapely import prepared
    from scipy.ndimage import distance_transform_edt

    tr = Transformer.from_crs(4326, 2056, always_xy=True)
    zonas = []
    gj = json.loads((BRUTO15 / "fussgaenger.geojson").read_text())
    for f in gj["features"]:
        g = f["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for p in polys:
            an = [[tr.transform(lo, la) for lo, la in r] for r in p]
            pg = Polygon(an[0], an[1:]).buffer(0)
            if not pg.is_empty:
                zonas.append(pg)
    recorte = box(e0, n0, e1, n1)
    zona = unary_union(zonas).intersection(recorte)
    zona_p = prepared.prep(zona)
    predios = unary_union([p for p in pegadas if not p.is_empty]).buffer(0.12)

    grupos = {k: [] for k in ("pav_pe", "laje", "asf", "pav", "calc", "tram", "marca", "asf_via")}
    marcas, caixas_pista = [], []
    for e in osm["elements"]:
        t = e.get("tags", {})
        if e["type"] != "way" or not e.get("geometry"):
            continue
        hw, rw = t.get("highway"), t.get("railway")
        if (hw is None and rw != "tram") or t.get("tunnel") or t.get("bridge") or str(t.get("layer", "0")).startswith("-"):
            continue
        xs, ys = tr.transform([g["lon"] for g in e["geometry"]], [g["lat"] for g in e["geometry"]])
        pts = list(zip(xs, ys))
        if len(pts) < 2:
            continue
        linha = LineString(pts)
        if not linha.intersects(recorte):
            continue
        meio = linha.interpolate(0.5, normalized=True)
        na_zona = zona_p.contains(meio)
        if rw == "tram":
            grupos["tram"].append(linha.buffer(1.45, cap_style=2))
            continue
        if hw in CAMINHOS:
            w = _largura(t, CAMINHOS[hw])
            area = Polygon(pts).buffer(0) if (t.get("area") == "yes" and len(pts) > 3 and pts[0] == pts[-1]) else linha.buffer(w / 2, cap_style=2)
            m = _material(t, na_zona, False)
            grupos["pav" if m == "pav" else "laje" if m == "laje" else "asf"].append(area)
        elif hw in VIAS:
            w = _largura(t, VIAS[hw])
            if hw == "pedestrian" and t.get("area") == "yes" and pts[0] == pts[-1] and len(pts) > 3:
                area = Polygon(pts).buffer(0)
            else:
                area = linha.buffer(w / 2, cap_style=2)
            m = _material(t, na_zona, True)
            if hw == "pedestrian":
                m = "pav" if (na_zona or t.get("surface") in PARALELEPIPEDO) else "laje" if t.get("surface") in LAJES else "asf"
            grupos["pav" if m == "pav" else "laje" if m == "laje" else "asf_via"].append(area)
            lados = t.get("sidewalk", "")
            if hw in ("secondary", "tertiary", "unclassified", "residential") and not na_zona:
                esq = lados in ("both", "left")
                dir_ = lados in ("both", "right")
                if esq:
                    grupos["calc"].append(linha.buffer(w / 2 + 1.9, single_sided=True, cap_style=2))
                if dir_:
                    grupos["calc"].append(linha.buffer(-(w / 2 + 1.9), single_sided=True, cap_style=2))
            if hw in ("secondary", "tertiary") and not na_zona and w >= 6.5 and not t.get("oneway") == "yes":
                marcas.append(linha)
    U = lambda l: unary_union(l) if l else Polygon()
    pav, laje, asf_c, asf_v, calc, tram = (U(grupos[k]) for k in ("pav", "laje", "asf", "asf_via", "calc", "tram"))
    asf = unary_union([asf_c, asf_v])
    # pavimento da zona de pedestres: o que não é prédio e está dentro da zona vira paralelepípedo
    pav = unary_union([pav, zona]).difference(predios)
    laje = laje.difference(predios)
    asf = asf.difference(predios)
    calc = calc.difference(predios)
    tram_bed = tram.difference(predios)

    W, H = int(round((e1 - e0) / passo)), int(round((n1 - n0) / passo))
    k = ESCALA_MASC
    Wk, Hk = W * k, H * k

    def desenha(geo, valor, img):
        d = ImageDraw.Draw(img)
        for g in getattr(geo, "geoms", [geo]):
            if g.is_empty or g.geom_type != "Polygon":
                continue
            d.polygon([((x - e0) / passo * k, (n1 - y) / passo * k) for x, y in g.exterior.coords], fill=valor)
            for it in g.interiors:
                d.polygon([((x - e0) / passo * k, (n1 - y) / passo * k) for x, y in it.coords], fill=0 if valor else 0)
        return img

    # classes por sub-pixel: 1 asfalto, 2 paralelepípedo, 3 calçada/lajes; ordem de pintura = prioridade
    cls = Image.new("L", (Wk, Hk), 0)
    for geo, v in ((laje, 3), (calc, 3), (pav, 2), (asf, 1)):
        # buracos só apagam o próprio desenho: pinta num rascunho e cola onde marcou
        r = desenha(geo, v, Image.new("L", (Wk, Hk), 0))
        cls.paste(r, mask=r.point(lambda p: 255 if p else 0))
    c = np.array(cls)
    cob = lambda v: c.reshape(H, k, W, k).__eq__(v).mean(axis=(1, 3)).astype(np.float32)
    A = np.stack([cob(1), cob(2), cob(3)], axis=-1)

    # marcas de faixa: eixo tracejado (2 m de traço, 4 m de vão) a 0,2 m de largura
    mk = Image.new("L", (Wk, Hk), 0)
    dmk = ImageDraw.Draw(mk)
    n_marca = 0
    asf_p = prepared.prep(asf)
    for l in marcas:
        s = 1.0
        while s + 2.0 < l.length:
            seg = substring(l, s, s + 2.0)
            if asf_p.contains(seg) and not tram.intersects(seg):
                for g in getattr(seg.buffer(0.1, cap_style=2), "geoms", [seg.buffer(0.1, cap_style=2)]):
                    dmk.polygon([((x - e0) / passo * k, (n1 - y) / passo * k) for x, y in g.exterior.coords], fill=255)
                n_marca += 1
            s += 6.0
    M = (np.array(mk).reshape(H, k, W, k).mean(axis=(1, 3)) / 255.0).astype(np.float32)

    # proximidade da fachada (oclusão falsa): 1 encostado, 0 a 4 m
    bm = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(bm)
    for p in pegadas:
        for g in getattr(p, "geoms", [p]):
            if g.is_empty or g.geom_type != "Polygon":
                continue
            d.polygon([((x - e0) / passo, (n1 - y) / passo) for x, y in g.exterior.coords], fill=255)
    dist = distance_transform_edt(np.array(bm) == 0) * passo
    ao = np.clip(1 - dist / 4.0, 0, 1) ** 1.6
    ao[np.array(bm) > 0] = 1.0
    leito = Image.new("L", (Wk, Hk), 0)
    desenha(tram_bed, 255, leito)
    T = (np.array(leito).reshape(H, k, W, k).mean(axis=(1, 3)) / 255.0).astype(np.float32)
    B = np.stack([M, ao.astype(np.float32), T], axis=-1)

    q8 = lambda a: np.round(a * 255).astype(np.uint8)
    Image.fromarray(q8(A), "RGB").save(saida / "ruas_a.webp", lossless=True, quality=100, method=6, exact=True)
    Image.fromarray(q8(B), "RGB").save(saida / "ruas_b.webp", lossless=True, quality=100, method=6, exact=True)

    # meio-fio: onde a pista de asfalto encosta na calçada
    meio_fio = []
    borda = asf.boundary.intersection(calc.buffer(0.3)).intersection(recorte) if not calc.is_empty and not asf.is_empty else Polygon()
    for g in getattr(borda, "geoms", [borda]):
        if g.geom_type == "LineString" and g.length > 1.0:
            gs = g.simplify(0.15)
            meio_fio.append([c for x, y in gs.coords for c in (round(x - origem_e, 1), round(-(y - origem_n), 1))])
    stats = {"asfalto_m2": int(asf.area), "paralelepipedo_m2": int(pav.area), "calcada_m2": int((laje.area + calc.area)),
             "zona_m2": int(zona.area), "marcas": n_marca, "meio_fio": len(meio_fio),
             "meio_fio_m": int(sum(g.length for g in getattr(borda, "geoms", [borda])))}
    return meio_fio, stats
