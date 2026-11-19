"""Casa cada lugar de data/21-referencia/catalogo.json com o prédio do modelo: o sólido cuja planta contém a coordenada da
Wikidata ou, sem isso, o de centro mais perto (até 30 m). Escreve o EGID e o pid no catálogo (para os retoques).
   uv run --with numpy --with shapely python script/casa_referencias.py
"""
import json, sys
from pathlib import Path
import numpy as np
from shapely.geometry import Point, Polygon
from shapely.ops import unary_union
sys.path.insert(0, str(Path(__file__).parent))
from compacta import le_predios

RAIZ = Path(__file__).resolve().parent.parent
meta = json.loads((RAIZ / "docs/data/predios.json").read_text()); P = meta["predios"]
q, ids = le_predios(RAIZ / "docs/data/predios.v2.bin")
v = q.astype(float) / meta["escala"]
cat = json.loads((RAIZ / "data/21-referencia/catalogo.json").read_text())
tris = v.reshape(-1, 3, 3); tid = ids[::3]
cent = {}
for pid in np.unique(tid):
    t = tris[tid == pid]; cent[int(pid)] = t.reshape(-1, 3)[:, [0, 2]].mean(0)
for c in cat:
    if not c["no_recorte"]:
        continue
    pt = np.array([c["x"], c["z"]])
    perto = sorted(cent, key=lambda k: np.hypot(*(cent[k] - pt)))[:12]
    achou = None
    for pid in perto:
        t = tris[tid == pid]
        pol = unary_union([Polygon(tt[:, [0, 2]]).buffer(0) for tt in t if Polygon(tt[:, [0, 2]]).area > 0.01])
        if pol.buffer(1.0).contains(Point(*pt)):
            achou = pid; break
    if achou is None and np.hypot(*(cent[perto[0]] - pt)) < 30:
        achou = perto[0]
    if achou is not None:
        c["pid"] = int(achou); c["egid"] = P[achou].get("egid"); c["nome_modelo"] = P[achou].get("nome") or P[achou].get("end")
    print(f"{c['nome'][:38]:38s} -> {c.get('pid')} {c.get('egid')} {c.get('nome_modelo')}")
(RAIZ / "data/21-referencia/catalogo.json").write_text(json.dumps(cat, ensure_ascii=False, indent=1))
