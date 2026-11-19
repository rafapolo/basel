"""Torres da Roche (Bau 1, 178 m, 2015; Bau 2, 205 m, 2022) e os prédios altos do campus da Grenzacherstrasse, fora do
recorte a leste: os sólidos do swissBUILDINGS3D (bloco 1047-43, já baixado) viram docs/data/roche.json, em decímetros
nas coordenadas locais da cidade (x = E − 2611350, y = Z − 244, z = −(N − 1267525)). Os maiores prédios da Suíça
aparecem no horizonte de qualquer ponto da Altstadt.
   uv run --with numpy --with mapbox-earcut python script/roche.py
"""
import json, subprocess, tempfile
from pathlib import Path
import numpy as np
import mapbox_earcut as earcut

RAIZ = Path(__file__).resolve().parent.parent
GDB = RAIZ / "data/raw/sb3d/swissBUILDINGS3D_3-0_1047-43.gdb"
ORIGEM_E, ORIGEM_N, BASE_Z = 2611350.0, 1267525.0, 244.0
BBOX = (2612450, 1267450, 2612900, 1267850)  # campus da Roche em Kleinbasel
ALTURA_MIN = 25.0  # m acima do chão: só os prédios que contam no horizonte
NOMES = {243058129: "Roche Bau 2", 243053964: "Roche Bau 1"}

with tempfile.TemporaryDirectory() as tmp:
    gj = Path(tmp) / "r.geojson"
    subprocess.run(["ogr2ogr", "-f", "GeoJSON", str(gj), str(GDB), "Building_solid", "-spat", *map(str, BBOX), "-nlt", "MULTIPOLYGON Z"], check=True, capture_output=True)
    feats = json.loads(gj.read_text())["features"]

saida = []
for f in feats:
    faces = f["geometry"]["coordinates"]
    zs = [p[2] for face in faces for anel in face for p in anel]
    if max(zs) - min(zs) < ALTURA_MIN:
        continue
    pos, tris = [], []
    for face in faces:
        aneis = [np.array(a, float)[:-1] for a in face]  # sem o ponto que fecha o anel
        V = np.concatenate(aneis)
        if len(V) < 3:
            continue
        # projeta no plano da face (normal de Newell) para triangular
        n = np.zeros(3)
        A = aneis[0]
        for i in range(len(A)):
            a, b = A[i], A[(i + 1) % len(A)]
            n += [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]
        if np.linalg.norm(n) < 1e-9:
            continue
        k = int(np.argmax(np.abs(n)))
        p2 = np.delete(V, k, axis=1)
        fins = np.cumsum([len(a) for a in aneis]).astype(np.uint32)
        t = earcut.triangulate_float64(p2, fins).reshape(-1, 3)
        base = len(pos)
        pos.extend(V.tolist())
        tris.extend((t + base).tolist())
    P = np.array(pos)
    loc = np.stack([P[:, 0] - ORIGEM_E, P[:, 2] - BASE_Z, -(P[:, 1] - ORIGEM_N)], 1)
    egid = f["properties"].get("EGID")
    saida.append({
        "nome": NOMES.get(int(egid)) if egid else None, "egid": int(egid) if egid else None,
        "alt": round(float(max(zs) - min(zs)), 1),
        "v": np.round(loc * 10).astype(int).ravel().tolist(), "t": np.array(tris, int).ravel().tolist(),
    })
    print(f"{egid}  {max(zs) - min(zs):6.1f} m  {len(tris)} triângulos  {NOMES.get(int(egid)) if egid else ''}")

(RAIZ / "docs/data/roche.json").write_text(json.dumps({"fonte": "swissBUILDINGS3D 3.0 (swisstopo), bloco 1047-43", "escala": 10, "predios": saida}, separators=(",", ":")))
print(f"roche.json: {(RAIZ / 'docs/data/roche.json').stat().st_size / 1024:.0f} KB")
