"""Fachadas da margem do Reno a partir de fotos reais (tarefa 22, item 4).
1. baixa: fotos escolhidas a mão das categorias do Commons (Oberer Rheinweg, Unterer Rheinweg, Rheinsprung), só licença
   livre, em data/22-fachadas-reno/commons/ (fora do git), com o crédito em data/22-fachadas-reno/fotos.json.
2. lista: os prédios das ruas da margem na ordem ao longo do rio (posição, frente para o rio, altura e andares do GWR),
   em data/22-fachadas-reno/predios.json, para casar cada casa da foto com o EGID.
3. casas: prédios com categoria própria no Commons (endereço no nome): baixa até 3 fotos de cada, acha o EGID pelo
   endereço e a fachada da rua (a parede virada para a rua do endereço, por ruas.json), em data/22-fachadas-reno/casas.json.
4. aplica: data/22-fachadas-reno/leitura.json (o que se leu das fotos, por EGID) vai para docs/data/retoques.json.
   uv run --with numpy python script/fachadas_reno.py [baixa|lista|casas|aplica]
"""
import json, re, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))

RAIZ = Path(__file__).resolve().parent.parent
DIR = RAIZ / "data/22-fachadas-reno"
UA = {"User-Agent": "basel-3d/0.1 (https://rafapolo.github.io/basel/)"}

FOTOS = [
    # Kleinbasel visto de Grossbasel (da Pfalz, do Münster, da ponte)
    "Basel, de Oberer Rheinweg vanaf de Mittleren Brücke IMG 1437 2022-05-14 20.01.jpg",
    "Oberer Rheinweg.jpg", "Oberer Rheinweg - panoramio.jpg", "Basel Blick vom Münster 3.JPG", "Basel Blick vom Münster 4.JPG",
    "Basel Blick vom Münster 5.JPG", "Basel - Münsterpanorama Juni 2019 smallerVersion.jpg", "Basel Panorama.jpg", "Basler Rheinpanorama - panoramio.jpg",
    "Kleinbasel, Oberer Rheinweg 87, 89, Ansicht vom Martinsturm Basel 20230531 0038.jpg",
    "Kleinbasel, Oberer Rheinweg 91, Ansicht vom Martinsturm Basel 20230531 0037.jpg",
    "Kleinbasel, Oberer Rheinweg 93, Ansicht vom Martinsturm Basel 20230531 0035.jpg",
    "Altstadt Kleinbasel, Basel, Switzerland - panoramio (10).jpg", "Altstadt Kleinbasel, Basel, Switzerland - panoramio (13).jpg",
    "Altstadt Kleinbasel, Basel, Switzerland - panoramio (15).jpg", "Altstadt Kleinbasel, Basel, Switzerland - panoramio (21).jpg",
    "Basel-Muensterblick-2006-patpatpat3.jpg", "Basel-Muensterblick-2006-patpatpat4.jpg", "The Rhine in Basel.jpg",
    "Unterer Rheinweg 14 in Basel (2023).jpg", "Basel Unterer Rheinweg (217731878).jpg", "Unterer Rheinweg, Basel, Switzerland - panoramio.jpg",
    "Rainbow over Unterer Rheinweg, Basel, Switzerland julesvernex2.jpg", "River Rhine from the Rheingasse Bridge, Basel.jpg",
    # Grossbasel visto de Kleinbasel: os fundos do Rheinsprung sobre o rio
    "Basel suedliches Rheinufer.jpg", "Rhein, Basel, Switzerland - panoramio.jpg", "Rhein, Basel, Switzerland - panoramio (1).jpg",
    "Alte Universität, Blaues und Weisses Haus n Basel (2023).jpg", "Rheinsprung Basel (5676560912).jpg", "Basel 2017 20170122 (32439357146).jpg",
    "Basel (4942045189).jpg", "Rhine Rhein Basel 2006 868.JPG",
]
LIVRE = ("CC", "Public domain", "PD", "GFDL", "FAL")


def json_url(url):
    for t in range(4):
        try:
            return json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90).read())
        except Exception as e:
            print("  repete:", str(e)[:60]); time.sleep(5 + 5 * t)
    raise SystemExit("falhou: " + url)


def baixa():
    pasta = DIR / "commons"; pasta.mkdir(parents=True, exist_ok=True)
    cat = []
    for arq in FOTOS:
        info = json_url("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
            "action": "query", "titles": "File:" + arq, "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 2000, "format": "json"}))
        pg = next(iter(info["query"]["pages"].values()))
        if "imageinfo" not in pg:
            print("não existe:", arq); continue
        ii = pg["imageinfo"][0]; meta = ii.get("extmetadata", {})
        lic = meta.get("LicenseShortName", {}).get("value", "")
        if not any(k in lic for k in LIVRE):
            print("licença não livre, pulado:", arq, lic); continue
        slug = re.sub(r"-+", "-", "".join(ch if ch.isalnum() else "-" for ch in arq.rsplit(".", 1)[0].lower())).strip("-")[:70]
        destino = pasta / f"{slug}.jpg"
        if not destino.exists():  # o Commons limita o ritmo (429): uma foto a cada ~4 s, com espera crescente
            for t in range(6):
                try:
                    destino.write_bytes(urllib.request.urlopen(urllib.request.Request(ii["thumburl"], headers=UA), timeout=90).read()); break
                except urllib.error.HTTPError as e:
                    if e.code != 429 or t == 5: raise
                    time.sleep(20 * (t + 1))
            time.sleep(4)
        autor = re.sub("<[^>]+>", "", meta.get("Artist", {}).get("value", "")).strip()
        cat.append({"arquivo": arq, "foto": f"commons/{destino.name}", "licenca": lic, "autor": autor, "pagina": ii["descriptionurl"]})
        print(f"{len(cat):2d} {lic:14s} {destino.name}")
    (DIR / "fotos.json").write_text(json.dumps(cat, ensure_ascii=False, indent=1))


RUAS = ("Oberer Rheinweg", "Unterer Rheinweg", "Rheinsprung", "Rheingasse", "Schifflände", "Pfalz", "Augustinergasse", "Rittergasse", "Münsterplatz")


def lista():
    from compacta import le_predios
    meta = json.loads((RAIZ / "docs/data/predios.json").read_text()); P = meta["predios"]
    q, ids = le_predios(RAIZ / "docs/data/predios.v2.bin")
    v = q.astype(float) / meta["escala"]; tris = v.reshape(-1, 3, 3); tid = ids[::3]
    reno = json.loads((RAIZ / "docs/data/reno.json").read_text())
    print("reno.json:", list(reno)[:12])
    out = []
    for pid, p in enumerate(P):
        end = p.get("end") or ""
        if not any(end.startswith(r) for r in RUAS):
            continue
        t = tris[tid == pid]
        if not len(t):
            continue
        pts = t.reshape(-1, 3)
        # parede mais larga e sua normal (para fora): a frente para o rio é a que aponta para o rio (norte em Grossbasel, sul em Kleinbasel)
        n = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]); area = np.linalg.norm(n, axis=1) / 2
        nn = n / np.maximum(1e-9, np.linalg.norm(n, axis=1))[:, None]
        par = np.abs(nn[:, 1]) < 0.35
        frente = {}
        for k in np.where(par)[0]:
            az = int(round(np.degrees(np.arctan2(nn[k, 0], -nn[k, 2])) / 15)) * 15 % 360  # 0 = norte (−z), 90 = leste (+x)
            frente[az] = frente.get(az, 0) + area[k]
        out.append({"pid": pid, "egid": p.get("egid"), "end": end, "x": round(float(pts[:, 0].mean()), 1), "z": round(float(pts[:, 2].mean()), 1),
                    "alt": p.get("alt"), "and": p.get("and"), "ano": p.get("ano"), "mat": p.get("mat"), "lj": p.get("lj"),
                    "frentes": sorted(((a, round(s)) for a, s in frente.items()), key=lambda x: -x[1])[:4]})
    out.sort(key=lambda o: o["x"])
    (DIR / "predios.json").write_text(json.dumps(out, ensure_ascii=False, indent=0))
    for o in out:
        print(f"{o['end']:28s} pid {o['pid']:5d} egid {o['egid']} x {o['x']:7.1f} z {o['z']:7.1f} alt {o['alt']} and {o['and']} ano {o['ano']} frentes {o['frentes'][:3]}")


# casas com categoria própria no Commons, escolhidas pelo que aparece nas vistas da cidade (Marktplatz, Münsterplatz,
# Rheinsprung e Augustinergasse, que dão para o Reno)
CASAS = [
    "Haus zum Gold (Marktplatz 5, Basel)", "Geschäftsgebäude Marktplatz 11 (Basel)", "Geltenzunft (Marktplatz 13, Basel)",
    "Geschäftshaus zur Laute (Marktplatz 16/Gerbergasse 1/5, Basel)", "Geschäfts- und Wohnhaus Marktplatz 17 (Basel)",
    "Wohn- und Geschäftshaus Marktplatz 18 (Basel)", "Wohn- und Geschäftshaus Marktplatz 19 (Basel)",
    "Wohn- und Geschäftshaus Marktplatz 21/Sattelgasse 1 (Basel)", "Geschäftshaus Marktplatz 30 (Basel)",
    "Singerhaus (Marktplatz 34/Stadthausgasse 10, Basel)", "Märthof (Marktplatz 36, Basel)",
    "Haus zur Kapelle (Münsterplatz 1, Basel)", "Haus zur St. Johanns-Kapelle (Münsterplatz 2, Basel)",
    "Allgemeine Lesegesellschaft (Münsterplatz 8, Basel)", "Falkensteinerhof (Münsterplatz 11, Basel)",
    "Mentelinhof (Münsterplatz 14, Basel)", "Reischacherhof (Münsterplatz 16, Basel)", "Andlauerhof (Münsterplatz 17, Basel)",
    "Reinacherhof (Münsterplatz 18, Basel)", "Schürhof (Münsterplatz 19, Basel)", "Rollerhof (Münsterplatz 20, Basel)",
    "Zum Sonnenfroh (Rheinsprung 2, Basel)", "Haus zum Kranichstreyt (Rheinsprung 7, Basel)", "Zum Brauer (Rheinsprung 14, Basel)",
    "St. Oswald-Pfruendhus (Rheinsprung 17, Basel)", "Augustinerschütte (Rheinsprung 21, Basel)",
    "Zur hohen Sonnenluft (Augustinergasse 1–3, Basel)", "Zum goldenen Stauffen (Augustinergasse 5, Basel)",
    "Zum Rappenfels (Augustinergasse 7, Basel)", "Zu den vier Häusern (Augustinergasse 9, Basel)", "Zum Selbviert (Augustinergasse 11, Basel)",
    "Zem Wildemann (Augustinergasse 13, Basel)", "Zum guldin Critz (Augustinergasse 15, Basel)", "Haus zur hohen Tanne (Augustinergasse 21, Basel)",
]


def endereco(cat):
    m = re.search(r"([A-ZÄÖÜ][\wäöüß.\- ]+?) (\d+)", cat.split("(", 1)[1] if "(" in cat and re.search(r"\(.*\d", cat) else cat)
    return f"{m.group(1).strip()} {m.group(2)}" if m else None


def casas():
    from compacta import le_predios
    meta = json.loads((RAIZ / "docs/data/predios.json").read_text()); P = meta["predios"]
    q, ids = le_predios(RAIZ / "docs/data/predios.v2.bin")
    v = q.astype(float) / meta["escala"]; tris = v.reshape(-1, 3, 3); tid = ids[::3]
    ruas = json.loads((RAIZ / "docs/data/ruas.json").read_text())["linhas"]
    pasta = DIR / "casas"; pasta.mkdir(parents=True, exist_ok=True)
    out = []
    for cat in CASAS:
        end = endereco(cat)
        pids = [i for i, p in enumerate(P) if p.get("end") == end]
        if not pids:
            print("sem prédio:", end); continue
        pid = max(pids, key=lambda i: (tid == i).sum())
        t = tris[tid == pid]; pts = t.reshape(-1, 3); cx, cz = pts[:, 0].mean(), pts[:, 2].mean()
        # rumo da rua do endereço a partir do centro do prédio
        rua = end.rsplit(" ", 1)[0]; melhor = (1e9, 0, 0)
        for l in ruas:
            if l.get("n") != rua: continue
            c = np.array(l["c"]).reshape(-1, 2)
            d = np.hypot(c[:, 0] - cx, c[:, 1] - cz); k = d.argmin()
            if d[k] < melhor[0]: melhor = (d[k], c[k, 0], c[k, 1])
        az_rua = np.degrees(np.arctan2(melhor[1] - cx, -(melhor[2] - cz))) % 360 if melhor[0] < 1e8 else None
        # a parede do prédio mais alinhada com esse rumo (normal para fora; 0 = norte, 90 = leste)
        n = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]); area = np.linalg.norm(n, axis=1) / 2
        nn = n / np.maximum(1e-9, 2 * area)[:, None]; par = np.abs(nn[:, 1]) < 0.35
        az = np.degrees(np.arctan2(nn[par, 0], -nn[par, 2])) % 360; ar = area[par]
        frente = None
        if az_rua is not None and len(az):
            dif = np.abs((az - az_rua + 180) % 360 - 180); ok = dif < 50
            if ok.any(): frente = int(round(float(np.average(az[ok], weights=ar[ok])) if np.ptp(az[ok]) < 180 else float(az_rua)))
        larg = float(ar[np.abs((az - (frente or 0) + 180) % 360 - 180) < 30].sum() / max(1, P[pid].get("alt") or 10)) if frente is not None else None
        membros = json_url("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
            "action": "query", "list": "categorymembers", "cmtitle": "Category:" + cat, "cmtype": "file", "cmlimit": 20, "format": "json"}))
        arqs = [m["title"][5:] for m in membros["query"]["categorymembers"] if m["title"].lower().endswith((".jpg", ".jpeg", ".png"))][:3]
        fotos = []
        for arq in arqs:
            info = json_url("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
                "action": "query", "titles": "File:" + arq, "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 1280, "format": "json"}))
            ii = next(iter(info["query"]["pages"].values()))["imageinfo"][0]; meta2 = ii.get("extmetadata", {})
            lic = meta2.get("LicenseShortName", {}).get("value", "")
            if not any(k in lic for k in LIVRE): continue
            destino = pasta / f"{re.sub(r'[^a-z0-9]+', '-', end.lower())}-{len(fotos)}.jpg"
            if not destino.exists():
                for tt in range(6):
                    try:
                        destino.write_bytes(urllib.request.urlopen(urllib.request.Request(ii["thumburl"], headers=UA), timeout=90).read()); break
                    except urllib.error.HTTPError as e:
                        if e.code != 429 or tt == 5: raise
                        time.sleep(20 * (tt + 1))
                time.sleep(3)
            autor = re.sub("<[^>]+>", "", meta2.get("Artist", {}).get("value", "")).strip()
            fotos.append({"foto": f"casas/{destino.name}", "pagina": ii["descriptionurl"], "licenca": lic, "autor": autor})
        p = P[pid]
        out.append({"cat": cat, "end": end, "pid": pid, "egid": p.get("egid"), "frente": frente, "largura": round(larg, 1) if larg else None,
                    "alt": p.get("alt"), "and": p.get("and"), "ano": p.get("ano"), "mat": p.get("mat"), "fotos": fotos})
        print(f"{end:24s} pid {pid:5d} egid {p.get('egid')} frente {frente} larg {larg and round(larg,1)} and {p.get('and')} fotos {len(fotos)}")
    (DIR / "casas.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))


def aplica():
    leit = json.loads((DIR / "leitura.json").read_text())
    ret = json.loads((RAIZ / "docs/data/retoques.json").read_text())
    for egid, d in leit.items():
        r = ret.setdefault(str(egid), {})
        for k in ("parede", "telhado", "mat", "and", "jan", "ven", "frente", "lj"):
            if k in d:
                r[k] = d[k]
        r["fonte"] = d["fonte"]
    linhas = [f" {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}" for k, v in ret.items()]  # um prédio por linha, como antes
    (RAIZ / "docs/data/retoques.json").write_text("{\n" + ",\n".join(linhas) + "\n}\n")
    print(len(leit), "prédios retocados;", len(ret), "no total")


if __name__ == "__main__":
    {"baixa": baixa, "lista": lista, "casas": casas, "aplica": aplica}[sys.argv[1] if len(sys.argv) > 1 else "baixa"]()
