"""Pipeline dos prédios da Altstadt (tarefa 01).

Junta o swissBUILDINGS3D 3.0 (blocos 1047-34 e 1047-43, edição 2024) com o GWR do data.bs.ch
(100230 prédios, 100231 entradas), o relevo swissALTI3D (2 m, reamostrado a 5 m) e ruas, trilhos,
muralha e fontanários do OpenStreetMap. Gera em docs/data/:

  predios.bin    triângulos de todos os prédios: Int16 x,y,z (escala 1/50 m) + Uint16 id do prédio
  predios.json   atributos por prédio (id = posição na lista) e metadados
  relevo.bin     grade de altitudes Uint16 (cm acima da base) do recorte
  ruas.json      linhas do OSM em coordenadas locais

Coordenadas locais: x = leste, y = altura, z = −norte, em metros, a partir de ORIGEM (LV95)
e da cota BASE_Z (o Reno em Basel fica perto de 245 m).

Uso: uv run --with polars --with shapely --with pyproj --with numpy script/predios.py
"""

import json
import re
import subprocess
import zlib
from pathlib import Path

import numpy as np
import polars as pl
from pyproj import Transformer
from shapely import STRtree, points
from shapely.geometry import MultiPolygon, Polygon
from shapely.ops import unary_union

RAIZ = Path(__file__).resolve().parent.parent
BRUTO = RAIZ / "data/raw"
SAIDA = RAIZ / "docs/data"

# Recorte: Grossbasel entre Barfüsserplatz, Spalenberg, Petersgraben e Münster, e a margem de
# Kleinbasel em frente (posicionado pelas entradas do GWR: Spalenberg 25 = 2611085/1267365,
# Münsterplatz 4 = 2611516/1267388, Oberer Rheinweg 5 = 2611508/1267734).
E0, E1 = 2610800.0, 2611900.0
N0, N1 = 1266950.0, 1268100.0
ORIGEM_E, ORIGEM_N = (E0 + E1) / 2, (N0 + N1) / 2
BASE_Z = 244.0
ESCALA = 50  # Int16 em 1/50 m: ±655 m

BLOCOS = sorted((BRUTO / "sb3d").glob("*.gdb"))


def le_blocos():
    """Lê Building_solid de cada bloco recortado; devolve {uuid: (props, [triângulos])}."""
    predios = {}
    for gdb in BLOCOS:
        tmp = BRUTO / f"sb3d/{gdb.stem}_recorte.geojson"
        if not tmp.exists():
            subprocess.run(
                ["ogr2ogr", "-f", "GeoJSON", str(tmp), str(gdb), "Building_solid",
                 "-spat", str(E0), str(N0), str(E1), str(N1), "-nlt", "MULTIPOLYGON Z",
                 "-select", "UUID,EGID,OBJEKTART,NAME_KOMPLETT,GESAMTHOEHE,GELAENDEPUNKT,DACH_MAX"],
                check=True, stderr=subprocess.DEVNULL,
            )
        for f in json.loads(tmp.read_text())["features"]:
            p = f["properties"]
            if p["UUID"] in predios or not f["geometry"]:
                continue  # a costura entre blocos repete prédios
            tris = [anel[0][:3] for anel in f["geometry"]["coordinates"] if len(anel[0]) >= 4]
            # prédios que saem muito do recorte estourariam o Int16 (±655 m): ficam de fora
            if any(not (E0 - 60 < x < E1 + 60 and N0 - 60 < y < N1 + 60) for t in tris for x, y, _ in t):
                continue
            predios[p["UUID"]] = (p, tris)
    return predios


def faixa_periodo(texto):
    """'Periode von 1919 bis 1945' -> (1919, 1945); 'vor 1919' -> (1300, 1918); 'nach 2015' -> (2016, 2024)."""
    if texto is None:
        return None
    n = [int(x) for x in re.findall(r"\d{4}", texto)]
    if "vor" in texto:
        return (1300, n[0] - 1)
    if "nach" in texto:
        return (n[0] + 1, 2024)
    return (n[0], n[1])


def ano_estavel(chave, faixa):
    """Sorteio estável (mesmo resultado a cada execução) dentro da faixa."""
    a, b = faixa
    return a + zlib.crc32(str(chave).encode()) % (b - a + 1)


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)
    predios = le_blocos()
    print(f"prédios 3D no recorte: {len(predios)}")

    gwr = pl.read_parquet(BRUTO / "gwr_100230.parquet")
    ent = pl.read_parquet(BRUTO / "gwr_100231.parquet")
    endereco = (
        ent.filter(pl.col("strname").is_not_null())
        .sort("egid", "strname", "deinr")
        .group_by("egid", maintain_order=True)
        .agg(pl.concat_str(pl.col("strname"), pl.lit(" "), pl.col("deinr").fill_null("")).first().alias("endereco"))
    )
    gwr = gwr.join(endereco, on="egid", how="left")
    no_recorte = gwr.filter(pl.col("gkode").is_between(E0, E1) & pl.col("gkodn").is_between(N0, N1))
    vivos = no_recorte.filter(pl.col("gstat_decoded").is_in(["Gebäude bestehend", "Gebäude im Bau"]))
    demolidos = no_recorte.filter(
        (pl.col("gstat_decoded") == "Gebäude abgebrochen") & pl.col("gabbj").is_not_null()
    )
    por_egid = {r["egid"]: r for r in vivos.iter_rows(named=True)}

    # pegada 2D de cada prédio, para casar pontos do GWR sem EGID igual
    uuids = list(predios)
    pegadas = []
    for u in uuids:
        tris = [Polygon([(x, y) for x, y, _ in t]) for t in predios[u][1]]
        tris = [t for t in tris if t.is_valid and t.area > 0.01]
        pegadas.append(unary_union(tris) if tris else MultiPolygon())
    arvore = STRtree(pegadas)
    pts = points(vivos["gkode"].to_numpy(), vivos["gkodn"].to_numpy())
    idx_pt, idx_pred = arvore.query(pts, predicate="within")
    linhas_vivos = list(vivos.iter_rows(named=True))
    dentro = {}
    for ip, ib in zip(idx_pt, idx_pred):
        dentro.setdefault(int(ib), []).append(linhas_vivos[int(ip)])

    atributos = []
    casados_egid = casados_ponto = com_gbauj = com_periodo = 0
    for i, u in enumerate(uuids):
        p, _ = predios[u]
        regs = []
        if p["EGID"] in por_egid:
            regs.append(por_egid[p["EGID"]])
            casados_egid += 1
        extras = [r for r in dentro.get(i, []) if r["egid"] != p["EGID"]]
        if not regs and extras:
            casados_ponto += 1
        regs += extras
        # regra para várias entradas do GWR no mesmo sólido: vale o ano mais antigo
        anos = [r["gbauj"] for r in regs if r["gbauj"]]
        principal = regs[0] if regs else None
        fonte = None
        if anos:
            ano, fonte = min(anos), "gbauj"
            com_gbauj += 1
        elif principal and faixa_periodo(principal["gbaup_decoded"]):
            ano, fonte = ano_estavel(u, faixa_periodo(principal["gbaup_decoded"])), "gbaup"
            com_periodo += 1
        else:
            ano = None
        nome = p["NAME_KOMPLETT"] or (principal and principal["gbez"]) or None
        a = {
            "ano": ano,
            "f": fonte,
            "alt": round(p["GESAMTHOEHE"] or 0, 1),
        }
        if nome:
            a["nome"] = nome
        if principal:
            a |= {
                "egid": principal["egid"],
                "end": principal["endereco"],
                "and": principal["gastw"],
                "apt": principal["ganzwhg"],
                "cls": principal["gklas_decoded"],
                "per": principal["gbaup_decoded"],
            }
            if principal["gschutzr_decoded"] == "Ja":
                a["prot"] = 1
        atributos.append({k: v for k, v in a.items() if v is not None})

    # geometria
    n_tris = sum(len(predios[u][1]) for u in uuids)
    pos = np.empty((n_tris * 3, 3), dtype=np.float64)
    ids = np.empty(n_tris * 3, dtype=np.uint16)
    k = 0
    for i, u in enumerate(uuids):
        for t in predios[u][1]:
            for x, y, z in t:
                pos[k] = (x - ORIGEM_E, z - BASE_Z, -(y - ORIGEM_N))
                ids[k] = i
                k += 1
    q = np.round(pos * ESCALA).astype(np.int16)
    with open(SAIDA / "predios.bin", "wb") as f:
        f.write(q.tobytes())
        f.write(ids.tobytes())

    # relevo 5 m
    relevo_tif = BRUTO / "alti/crop5.tif"
    subprocess.run(
        ["gdal_translate", "-q", "-of", "ENVI", "-ot", "Float32", str(relevo_tif), str(BRUTO / "alti/crop5.raw")],
        check=True,
    )
    alt = np.fromfile(BRUTO / "alti/crop5.raw", dtype=np.float32).reshape(230, 220)
    np.round((alt - BASE_Z) * 100).astype(np.uint16).tofile(SAIDA / "relevo.bin")

    # OSM
    tr = Transformer.from_crs(4326, 2056, always_xy=True)
    osm = json.loads((BRUTO / "osm.json").read_text())
    linhas, fontes, muralha = [], [], []
    for e in osm["elements"]:
        tg = e.get("tags", {})
        if e["type"] == "node":
            x, y = tr.transform(e["lon"], e["lat"])
            fontes.append([round(x - ORIGEM_E, 1), round(-(y - ORIGEM_N), 1)])
            continue
        geo = e.get("geometry") or []
        xs, ys = tr.transform([g["lon"] for g in geo], [g["lat"] for g in geo])
        coords = [c for xy in zip(xs, ys) for c in (round(xy[0] - ORIGEM_E, 1), round(-(xy[1] - ORIGEM_N), 1))]
        if tg.get("historic") == "citywalls":
            muralha.append(coords)
        elif tg.get("railway") == "tram":
            linhas.append({"t": "tram", "c": coords})
        elif tg.get("highway"):
            if tg.get("layer", "0").startswith("-") or tg.get("tunnel"):
                continue
            linhas.append({"t": tg["highway"], "c": coords, **({"n": tg["name"]} if "name" in tg else {}),
                           **({"ponte": 1} if tg.get("bridge") else {})})

    dem = []
    for r in demolidos.iter_rows(named=True):
        dem.append({
            "x": round(r["gkode"] - ORIGEM_E, 1), "z": round(-(r["gkodn"] - ORIGEM_N), 1),
            "ano": r["gbauj"], "fim": int(r["gabbj"]), **({"end": r["endereco"]} if r["endereco"] else {}),
        })

    meta = {
        "origem_lv95": [ORIGEM_E, ORIGEM_N], "base_z": BASE_Z, "escala": ESCALA,
        "recorte_lv95": [E0, N0, E1, N1],
        "relevo": {"nx": 220, "ny": 230, "passo": 5, "x0": E0 - ORIGEM_E, "z0": -(N1 - ORIGEM_N)},
        "n_tris": int(n_tris),
        "predios": atributos,
        "demolidos": dem,
    }
    (SAIDA / "predios.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")))
    (SAIDA / "ruas.json").write_text(
        json.dumps({"linhas": linhas, "fontes": fontes, "muralha": muralha}, ensure_ascii=False, separators=(",", ":"))
    )

    n = len(uuids)
    sem = n - casados_egid - casados_ponto
    print(f"casados por EGID: {casados_egid} ({casados_egid / n:.1%}); por ponto na pegada: {casados_ponto}; "
          f"sem GWR: {sem} ({sem / n:.1%})")
    print(f"ano exato (gbauj): {com_gbauj} ({com_gbauj / n:.1%}); ano sorteado na época (gbaup): {com_periodo}")
    print(f"GWR vivos no recorte: {vivos.height}, demolidos com ano: {len(dem)}")
    print(f"triângulos: {n_tris}; predios.bin {(SAIDA / 'predios.bin').stat().st_size / 1e6:.1f} MB")
    anos = sorted(a["ano"] for a in atributos if "ano" in a)
    print(f"ano mais antigo: {anos[0]}, mediana: {anos[len(anos) // 2]}")
    seculos = {}
    for a in anos:
        seculos[a // 100 * 100] = seculos.get(a // 100 * 100, 0) + 1
    print("por século:", dict(sorted(seculos.items())))


if __name__ == "__main__":
    main()
