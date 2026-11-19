"""Baixa do Overpass tudo o que vem do OpenStreetMap, com a caixa tirada de script/recorte.py (2026-11-19: antes cada
consulta tinha a sua caixa escrita à mão). Grava nos mesmos arquivos de sempre; o que já existe é mantido com --resto.
   uv run --with pyproj python script/baixa_osm.py
"""
import json, sys, time, urllib.parse, urllib.request
from pathlib import Path
import recorte as RC

RAIZ = Path(__file__).resolve().parent.parent
S, W, N, E = RC.bbox_wgs84(60)
B = f"({S},{W},{N},{E})"
S2, W2, N2, E2 = RC.bbox_wgs84(150)
B2 = f"({S2},{W2},{N2},{E2})"  # árvores, água e detalhes: um pouco além da borda
CONSULTAS = {
    "data/raw/osm.json": f'[out:json][timeout:180];(way["highway"]{B};way["railway"="tram"]{B};way["historic"="citywalls"](47.540,7.565,47.575,7.610);node["amenity"="fountain"]{B};);out geom;',
    "data/12-fachadas/lojas.json": f'[out:json][timeout:180];(node["shop"]{B};way["shop"]{B};node["amenity"~"^(restaurant|cafe|bar|pub|fast_food|ice_cream|bank|pharmacy)$"]{B};way["amenity"~"^(restaurant|cafe|bar|pub|fast_food|ice_cream|bank|pharmacy)$"]{B};);out center;',
    "data/14-reno/osm_agua.json": (RAIZ / "data/14-reno/q.txt").read_text().replace("(47.5525,7.5815,47.5640,7.5975)", B2),
    "data/16-arvores/osm_verde.json": (RAIZ / "data/16-arvores/q.txt").read_text().replace("(47.550,7.578,47.567,7.600)", B2),
    "data/17-detalhes/osm_overpass.kumi.systems.json": (RAIZ / "data/17-detalhes/q.txt").read_text().replace("(47.5515,7.5800,47.5650,7.5990)", B2),
}
SERVIDORES = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]

for arq, q in CONSULTAS.items():
    assert B in q or B2 in q or "citywalls" in q, arq
    destino = RAIZ / arq
    for tentativa in range(8):
        url = SERVIDORES[tentativa % len(SERVIDORES)]
        try:
            req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": "basel-3d-prototipo/0.1"})
            corpo = urllib.request.urlopen(req, timeout=240).read()
            d = json.loads(corpo)
            if "elements" not in d or not d["elements"]:
                raise ValueError(d.get("remark", "vazio"))
            destino.write_bytes(corpo)
            print(f"{arq}: {len(d['elements'])} elementos ({len(corpo) / 1e6:.1f} MB)", flush=True)
            break
        except Exception as e:
            print(f"{arq}: tentativa {tentativa + 1} em {url.split('/')[2]} falhou: {str(e)[:80]}", flush=True)
            time.sleep(15 + 10 * tentativa)
    else:
        sys.exit(f"{arq}: desisti")
    time.sleep(5)
