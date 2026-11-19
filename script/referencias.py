"""Fotos de referência das coisas mais conhecidas de Basel (2026-11-19), para corrigir formas, cores e materiais do modelo.
Fonte: Wikidata (item, coordenada, imagem P18) e Wikimedia Commons (arquivo, licença, autoria). Só licenças livres:
as imagens ficam em data/21-referencia/commons/ (fora do git) como referência de trabalho; o catálogo com o crédito de
cada uma vai em data/21-referencia/catalogo.json.
   uv run --with pyproj python script/referencias.py
"""
import json, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path
import recorte as RC

RAIZ = Path(__file__).resolve().parent.parent
DIR = RAIZ / "data/21-referencia"
FOTOS = DIR / "commons"
UA = {"User-Agent": "basel-3d-prototipo/0.1"}

# escolhidos a mão das consultas por fama (sitelinks) e por tipo (fontes, esculturas) na caixa de Basel
NOMES = [
    "Basler Münster", "Rathaus Basel", "Spalentor", "Mittlere Brücke", "Käppelijoch", "Bahnhof Basel SBB", "Kunstmuseum Basel Hauptbau",
    "Hotel Les Trois Rois", "Theater Basel", "Historisches Museum Basel", "Barfüsserkirche (Basel)", "Museum der Kulturen Basel",
    "Naturhistorisches Museum Basel", "Antikenmuseum Basel und Sammlung Ludwig", "Kunsthalle Basel", "Stadtcasino Basel",
    "Pauluskirche", "Elisabethenkirche (Basel)", "Martinskirche (Basel)", "Peterskirche", "Leonhardskirche (Basel)", "Predigerkirche",
    "St. Clara (Basel)", "Synagoge Basel", "Antoniuskirche", "Markgräflerhof", "Das Blaue und das Weisse Haus", "Haus zum Kirschgarten",
    "Steinentor", "Spalenschwibbogen", "St. Alban-Tor", "Basler Stadtmauer", "Letziturm", "BIZ-Turm", "Meret Oppenheim Hochhaus",
    "Roche-Turm", "Roche-Turm Bau 2", "Messeturm Basel", "Markthalle", "Hauptpost Basel", "Café Spitz", "Lohnhof", "Wettsteinbrücke",
    "Johanniterbrücke", "Heuwaage-Viadukt", "Basler Fähren", "Barfüsserplatz", "Marktplatz", "Münsterplatz", "Petersplatz", "Schifflände",
    "Fasnachts-Brunnen", "Strassburger Denkmal", "St. Jakobs-Denkmal", "Helvetia auf der Reise", "Sevogelbrunnen", "Elisabethenbrunnen",
    "Fischmarktbrunnen", "Holbeinbrunnen", "Hebel-Denkmal", "Pisoni-Brunnen", "Urbanbrunnen", "Jakobsbrunnen", "Affenbrunnen",
    "Totengässlein", "Rittergasse", "Freie Strasse",
]
EXTRA = {"Fischmarktbrunnen": "Q19362806", "Holbeinbrunnen": "Q29684291", "Käppelijoch": "Q20754701", "Kunstmuseum Basel Hauptbau": "Q69541078"}

def json_url(url, dados=None):
    for t in range(4):
        try:
            return json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90).read())
        except Exception as e:
            print("  repete:", str(e)[:60]); time.sleep(5 + 5 * t)
    raise SystemExit("falhou: " + url)

# itens: das duas consultas já salvas (wd.json, wd2.json) + os extras por id
itens = {}
for f in ("wd.json", "wd2.json"):
    for b in json.loads((DIR / f).read_text())["results"]["bindings"]:
        n = b["itemLabel"]["value"]
        if n in NOMES and n not in itens:
            itens[n] = {"q": b["item"]["value"].rsplit("/", 1)[1], "img": b["img"]["value"], "coord": b["coord"]["value"]}
falta = {n: q for n, q in EXTRA.items() if n not in itens}
if falta:
    d = json_url("https://www.wikidata.org/w/api.php?action=wbgetentities&props=claims&format=json&ids=" + "|".join(falta.values()))
    for n, q in falta.items():
        c = d["entities"][q]["claims"]
        if "P18" in c:
            img = c["P18"][0]["mainsnak"]["datavalue"]["value"]
            co = c.get("P625", [{}])[0].get("mainsnak", {}).get("datavalue", {}).get("value", {})
            itens[n] = {"q": q, "img": "http://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(img), "coord": f"Point({co.get('longitude')} {co.get('latitude')})"}

from pyproj import Transformer
tr = Transformer.from_crs(4326, 2056, always_xy=True)
FOTOS.mkdir(parents=True, exist_ok=True)
catalogo = []
for n in NOMES:
    it = itens.get(n)
    if not it:
        print("sem imagem:", n); continue
    arquivo = urllib.parse.unquote(it["img"].rsplit("/", 1)[1])
    info = json_url("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "titles": "File:" + arquivo, "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 1280, "format": "json"}))
    ii = next(iter(info["query"]["pages"].values()))["imageinfo"][0]
    meta = ii.get("extmetadata", {})
    lic = meta.get("LicenseShortName", {}).get("value", "")
    if not any(k in lic for k in ("CC", "Public domain", "PD", "GFDL", "FAL")):
        print("licença não livre, pulado:", n, lic); continue
    slug = "".join(ch if ch.isalnum() else "-" for ch in n.lower()).strip("-")
    destino = FOTOS / f"{slug}.jpg"
    if not destino.exists():  # o Commons limita o ritmo (429): uma foto a cada ~4 s, com espera crescente
        for t in range(6):
            try:
                destino.write_bytes(urllib.request.urlopen(urllib.request.Request(ii["thumburl"], headers=UA), timeout=90).read()); break
            except urllib.error.HTTPError as e:
                if e.code != 429 or t == 5: raise
                time.sleep(20 * (t + 1))
        time.sleep(4)
    lon, lat = map(float, it["coord"].removeprefix("Point(").removesuffix(")").split())
    e, nn = tr.transform(lon, lat)
    x, z = RC.local(e, nn)
    import re
    autor = re.sub("<[^>]+>", "", meta.get("Artist", {}).get("value", "")).strip()
    catalogo.append({"nome": n, "wikidata": it["q"], "arquivo": arquivo, "foto": f"commons/{destino.name}", "licenca": lic, "autor": autor,
                     "pagina": ii["descriptionurl"], "x": round(x, 1), "z": round(z, 1), "no_recorte": RC.dentro(x, z)})
    print(f"{len(catalogo):2d} {n:42s} {lic:14s} {'dentro' if RC.dentro(x, z) else 'fora'}")
(DIR / "catalogo.json").write_text(json.dumps(catalogo, ensure_ascii=False, indent=1))
print(len(catalogo), "fotos;", sum(c["no_recorte"] for c in catalogo), "dentro do recorte")
