# Muralha externa de Basel (1361–1400, demolida 1860–1879) e a de Kleinbasel (c. 1270), para docs/muralha.js.
# Traçado pela Wikipédia (de: "Basler Stadtmauer", seção "Verlauf"): os fossos viraram as ruas e parques de hoje,
# então a linha segue esses trechos do OSM (docs/data/ruas.json), encadeados na ordem, ancorada nos portões e nas
# torres das pontas (coordenadas dos artigos da Wikipédia de cada portão).
#   Grossbasel: Thomasturm (Reno) · St. Johanns-Tor · Schanzenstrasse · Spalentor · Schützengraben · Steinengraben ·
#               Steinentor · Elisabethenanlage · Aeschentor · Aeschengraben · St. Alban-Anlage · St. Alban-Tor ·
#               Mühlegraben (o trecho que sobrou, no "Dalbeloch") · Reno
#   Kleinbasel: Reno · Klingentalgraben · Bläsitor · Claragraben · Riehentor · Theodorsgraben · Reno
# Sete portões: cinco na muralha externa (três de pé até hoje) e dois em Kleinbasel.
# uso: python3 script/muralha.py  → docs/data/muralha.json
import json
import math
from pathlib import Path

from pyproj import Transformer

RAIZ = Path(__file__).resolve().parent.parent
meta = json.loads((RAIZ / "docs/data/predios.json").read_text())
oe, on = meta["origem_lv95"]
tr = Transformer.from_crs(4326, 2056, always_xy=True)


def local(lat, lon):
    e, n = tr.transform(lon, lat)
    return [round(e - oe, 1), round(-(n - on), 1)]


# portões e torres (Wikipédia de); `existe`: ainda de pé (já está no modelo: não desenha outro, só abre a muralha)
PORTOES = {
    "Thomasturm": (47.56695833, 7.582975, True),
    "St. Johanns-Tor": (47.56654722, 7.58204444, True),
    "Spalentor": (47.55805556, 7.58138889, True),
    "Steinentor": (47.55119444, 7.58771389, False),
    "Aeschentor": (47.55168333, 7.59458889, False),
    "St. Alban-Tor": (47.55335278, 7.60325, True),
    "Bläsitor": (47.56317222, 7.59196389, False),
    "Riehentor": (47.55996111, 7.59674722, False),
}
P = {k: local(la, lo) for k, (la, lo, _) in PORTOES.items()}

linhas = json.loads((RAIZ / "docs/data/ruas.json").read_text())["linhas"]


def rua(nome):
    """trechos do OSM com esse nome encadeados pelas pontas; devolve a cadeia mais longa"""
    ls = [[(l["c"][i], l["c"][i + 1]) for i in range(0, len(l["c"]), 2)] for l in linhas if l.get("n") == nome]
    perto = lambda p, q: math.dist(p, q) < 2.0
    melhor = []
    for k in range(len(ls)):
        cad, resto, mudou = list(ls[k]), [l for j, l in enumerate(ls) if j != k], True
        while mudou:
            mudou = False
            for l in list(resto):
                if perto(cad[-1], l[0]): cad += l[1:]
                elif perto(cad[-1], l[-1]): cad += l[-2::-1]
                elif perto(cad[0], l[-1]): cad = l[:-1] + cad
                elif perto(cad[0], l[0]): cad = l[:0:-1] + cad
                else: continue
                resto.remove(l); mudou = True
        if sum(math.dist(a, b) for a, b in zip(cad, cad[1:])) > sum(math.dist(a, b) for a, b in zip(melhor, melhor[1:])): melhor = cad
    if not melhor: raise SystemExit(f"rua sem traçado no OSM: {nome}")
    return melhor


def pontos(nomes):
    return [(l["c"][i], l["c"][i + 1]) for l in linhas if l.get("n") in nomes for i in range(0, len(l["c"]), 2)]


def trecho(A, B, nomes, larg=70.0, passo=14.0):
    """de A a B seguindo as ruas `nomes`: só os pontos delas num corredor de `larg` m em volta de AB, ordenados ao
    longo de AB e alisados em fatias de `passo` m (os ramos e cruzamentos do OSM ficam de fora)"""
    dx, dz = B[0] - A[0], B[1] - A[1]; L = math.hypot(dx, dz); ux, uz = dx / L, dz / L
    fat = {}
    for x, z in pontos(nomes):
        t = (x - A[0]) * ux + (z - A[1]) * uz; d = abs(-(x - A[0]) * uz + (z - A[1]) * ux)
        if 4 < t < L - 4 and d < larg: fat.setdefault(int(t // passo), []).append((x, z))
    meio = [[round(sum(p[0] for p in v) / len(v), 1), round(sum(p[1] for p in v) / len(v), 1)] for k, v in sorted(fat.items())]
    return [list(A)] + meio


def longe(nomes, de, perto_de=None):
    """ponta da rua mais longe de `de` (a ponta que encosta no Reno)"""
    return list(max(pontos(nomes), key=lambda p: math.dist(p, de)))


def canto(nomes, A, B):
    """o ponto das ruas mais afastado da reta AB, do lado de fora (o baluarte)"""
    dx, dz = B[0] - A[0], B[1] - A[1]; L = math.hypot(dx, dz)
    return list(max(pontos(nomes), key=lambda p: (-(p[0] - A[0]) * dz + (p[1] - A[1]) * dx) / L * -1))


# baluarte Elisabethen: o ponto da Elisabethenanlage mais longe do centro (Marktplatz), para o lado de fora
MP = (-102.0, 20.0)
EL = list(max(pontos(["Elisabethenanlage"]), key=lambda p: math.dist(p, MP)))
# o pedaço que sobrou no «Dalbeloch» (OSM historic=citywalls, ruas.json → muralha): a muralha passa exatamente por ele
SOBRA = json.loads((RAIZ / "docs/data/ruas.json").read_text())["muralha"]
SOBRA = max(([(c[i], c[i + 1]) for i in range(0, len(c), 2)] for c in SOBRA), key=len)
KL = longe(["Klingentalgraben"], P["Bläsitor"])
TH = longe(["Theodorsgraben"], P["Riehentor"])
gb = ([P["Thomasturm"]] + trecho(P["St. Johanns-Tor"], P["Spalentor"], ["Schanzenstrasse"], 90)
      + trecho(P["Spalentor"], P["Steinentor"], ["Schützengraben", "Steinengraben"], 80)
      + trecho(P["Steinentor"], EL, ["Wallstrasse", "Elisabethenanlage"], 60)
      + trecho(EL, P["Aeschentor"], ["Elisabethenanlage", "Aeschengraben"], 60)
      + trecho(P["Aeschentor"], P["St. Alban-Tor"], ["St. Alban-Anlage", "Aeschengraben"], 70)
      + [P["St. Alban-Tor"]] + [list(q) for q in (SOBRA if math.dist(SOBRA[0], P["St. Alban-Tor"]) < math.dist(SOBRA[-1], P["St. Alban-Tor"]) else SOBRA[::-1])])
kb = (trecho(KL, P["Bläsitor"], ["Klingentalgraben"], 50) + trecho(P["Bläsitor"], P["Riehentor"], ["Claragraben"], 60)
      + trecho(P["Riehentor"], TH, ["Theodorsgraben"], 60) + [TH])
out = {
    "fonte": "Wikipédia (de) «Basler Stadtmauer» e os artigos de cada portão; traçado pelos antigos fossos no OSM",
    "linhas": [gb, kb],
    "portoes": [{"n": k, "x": P[k][0], "z": P[k][1], "existe": v[2]} for k, v in PORTOES.items() if k != "Thomasturm"],
    "torres": [{"n": "Thomasturm", "x": P["Thomasturm"][0], "z": P["Thomasturm"][1], "existe": True}],
}
(RAIZ / "docs/data/muralha.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
comp = lambda l: sum(math.dist(a, b) for a, b in zip(l, l[1:]))
print(f"Grossbasel {comp(gb):.0f} m em {len(gb)} pontos · Kleinbasel {comp(kb):.0f} m em {len(kb)} pontos · {len(out['portoes'])} portões")
