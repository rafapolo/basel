#!/usr/bin/env python3
"""Tarefa 19: gera docs/data/vida.json (bondes, contagens, zonas de pedestres, nadadores).

Fontes (baixadas em data/19-vida/):
  - GTFS estático suíço (opentransportdata.swiss, licença aberta com citação): gtfs_fp2026_20261114.zip
    (a etapa de download está em script/baixa-vida.sh; este script lê data/19-vida/gtfs/).
  - data.bs.ch 100013 (contagem de pedestres e bicicletas, CC BY 4.0): zaehlung_2025.csv
  - data.bs.ch 100270 (zonas recomendadas de nado no Reno, CC BY 4.0): schwimm.geojson
  - data/15-chao/fussgaenger.geojson (zona de pedestres, data.bs.ch)
  - docs/data/ruas.json (trilhos do OSM, já carregados por docs/chao.js)

Uso: uv run --with polars --with shapely --with pyproj --with numpy script/vida.py
"""
import heapq
import json
import math
import random
from collections import defaultdict
from pathlib import Path

import numpy as np
import polars as pl
from pyproj import Transformer
from shapely.geometry import LineString, Point, Polygon, box, shape
from shapely.ops import transform as shp_transform

RAIZ = Path(__file__).resolve().parent.parent
D = RAIZ / 'data' / '19-vida'
G = D / 'gtfs'
OUT = RAIZ / 'docs' / 'data' / 'vida.json'
from recorte import ORIGEM_E, ORIGEM_N, X0, X1, Z0, Z1
ORIGEM = (ORIGEM_E, ORIGEM_N)
T = Transformer.from_crs(4326, 2056, always_xy=True)
FOLGA = 5                        # dentro do recorte, com 5 m de folga da borda
DIAS = {'util': '2026-11-17', 'sab': '2026-11-21', 'dom': '2026-11-22'}   # terça, sábado, domingo de referência (no calendário do feed)


def xz(lon, lat):
    e, n = T.transform(lon, lat)
    return e - ORIGEM[0], -(n - ORIGEM[1])


def seg(hms: str) -> int:
    h, m, s = hms.split(':')
    return int(h) * 3600 + int(m) * 60 + int(s)


# ---------------------------------------------------------------- grafo dos trilhos
def grafo_trilhos():
    ruas = json.loads((RAIZ / 'docs/data/ruas.json').read_text())
    chave, P, ponte = {}, [], []
    arestas = set()

    def vid(p):
        k = (round(p[0] * 5), round(p[1] * 5))
        if k not in chave:
            chave[k] = len(P)
            P.append((k[0] / 5, k[1] / 5))
            ponte.append(False)
        return chave[k]

    for l in ruas['linhas']:
        if l['t'] != 'tram':
            continue
        c = l['c']
        if any((not (Z0 + FOLGA < v < Z1 - FOLGA) if i % 2 else not (X0 + FOLGA < v < X1 - FOLGA)) for i, v in enumerate(c)):
            continue
        ids = [vid((c[i], c[i + 1])) for i in range(0, len(c), 2)]
        for a, b in zip(ids, ids[1:]):
            if a != b:
                arestas.add((min(a, b), max(a, b)))
        if l.get('ponte'):
            for i in ids:
                ponte[i] = True
    P = np.array(P)
    # junta pontas de ways diferentes que quase se tocam (até 1,5 m)
    n = len(P)
    for i in range(n):
        d = np.hypot(P[:, 0] - P[i, 0], P[:, 1] - P[i, 1])
        for j in np.nonzero((d < 1.5) & (np.arange(n) > i))[0]:
            arestas.add((i, int(j)))
    # componentes isolados no OSM (falta de ligação nos dados): une pelo par de vértices mais próximo (até 35 m)
    while True:
        comp, cc = {}, 0
        viz = defaultdict(list)
        for a, b in arestas:
            viz[a].append(b); viz[b].append(a)
        for s0 in range(n):
            if s0 in comp:
                continue
            pilha = [s0]; comp[s0] = cc
            while pilha:
                u = pilha.pop()
                for w in viz[u]:
                    if w not in comp:
                        comp[w] = cc; pilha.append(w)
            cc += 1
        if cc == 1:
            break
        melhor = None
        for i in range(n):
            d = np.hypot(P[:, 0] - P[i, 0], P[:, 1] - P[i, 1])
            d[[k for k in range(n) if comp[k] == comp[i]]] = 1e9
            j = int(d.argmin())
            if melhor is None or d[j] < melhor[0]:
                melhor = (float(d[j]), i, j)
        if melhor[0] > 35:
            break
        print('  une componentes por', round(melhor[0], 1), 'm')
        arestas.add((min(melhor[1], melhor[2]), max(melhor[1], melhor[2])))
    adj = defaultdict(list)
    for a, b in arestas:
        L = float(np.hypot(*(P[a] - P[b])))
        adj[a].append((b, L))
        adj[b].append((a, L))
    # penaliza a via da esquerda quando há outra paralela à direita (circulação pela direita)
    pen = {}
    for a, b in arestas:
        for u, v in ((a, b), (b, a)):
            d = P[v] - P[u]
            L = np.hypot(*d)
            if L < 0.5:
                pen[(u, v)] = 1.0
                continue
            d = d / L
            dir_dir = (-d[1], d[0])
            m = (P[u] + P[v]) / 2
            ruim = False
            for x, y in arestas:
                if (x, y) in ((u, v), (v, u)):
                    continue
                e = P[y] - P[x]
                Le = np.hypot(*e)
                if Le < 0.5 or abs(np.dot(e / Le, d)) < 0.9:
                    continue
                mm = (P[x] + P[y]) / 2 - m
                lat = float(np.dot(mm, dir_dir))
                lon = float(np.dot(mm, d))
                if 1.2 < lat < 5.5 and abs(lon) < 25:
                    ruim = True
                    break
            pen[(u, v)] = 4.0 if ruim else 1.0
    return P, adj, pen, ponte


def dijkstra(adj, pen, s, t):
    dist, ant = {s: 0.0}, {}
    fila = [(0.0, s)]
    while fila:
        d, u = heapq.heappop(fila)
        if u == t:
            break
        if d > dist.get(u, 1e18):
            continue
        for v, L in adj[u]:
            nd = d + L * pen.get((u, v), 1.0)
            if nd < dist.get(v, 1e18):
                dist[v] = nd
                ant[v] = u
                heapq.heappush(fila, (nd, v))
    if t not in dist:
        return None
    r = [t]
    while r[-1] != s:
        r.append(ant[r[-1]])
    return r[::-1]


def estende(P, adj, caminho, fim, maximo=450.0):
    """Segue os trilhos além da primeira/última parada até a ponta da malha (reto, até 450 m)."""
    c = list(caminho)
    extra = 0.0
    visto = set(c)
    while extra < maximo:
        n, p = (c[-1], c[-2]) if fim else (c[0], c[1])
        d = P[n] - P[p]
        d = d / (np.hypot(*d) or 1)
        melhor, mc = None, 0.5
        for w, L in adj[n]:
            if w in visto:
                continue
            e = P[w] - P[n]
            Le = np.hypot(*e)
            if Le < 0.5:
                melhor, mc = w, 2
                break
            cs = float(np.dot(e / Le, d))
            if cs > mc:
                melhor, mc = w, cs
        if melhor is None:
            break
        extra += float(np.hypot(*(P[melhor] - P[n])))
        visto.add(melhor)
        if fim:
            c.append(melhor)
        else:
            c.insert(0, melhor)
    return c


# ---------------------------------------------------------------- bondes
def bondes():
    P, adj, pen, ponte = grafo_trilhos()
    print('trilhos:', len(P), 'vértices')
    ag = pl.read_csv(G / 'agency.txt', infer_schema_length=0)
    nomes_ag = {r['agency_id']: r['agency_name'] for r in ag.iter_rows(named=True)}
    bvb = [k for k, v in nomes_ag.items() if v.startswith('Basler Verkehrsbetriebe')]
    blt = [k for k, v in nomes_ag.items() if v.startswith('Baselland Transport')]
    rotas = pl.read_csv(G / 'routes.txt', infer_schema_length=0).filter(
        pl.col('route_type') == '900', pl.col('agency_id').is_in(bvb + blt))
    viag = pl.read_csv(G / 'trips.txt', infer_schema_length=0).filter(pl.col('route_id').is_in(rotas['route_id'].to_list()))
    cache = D / 'gtfs_bondes_stop_times.parquet'
    if cache.exists():
        st = pl.read_parquet(cache)
    else:
        st = pl.scan_csv(G / 'stop_times.txt', infer_schema_length=0).filter(
            pl.col('trip_id').is_in(viag['trip_id'].to_list())).collect()
        st.write_parquet(cache)
    print('viagens de bonde BVB/BLT:', viag.height, ' stop_times:', st.height)

    # paradas -> vértice mais próximo (até 30 m)
    sp = pl.read_csv(G / 'stops.txt', infer_schema_length=0).filter(pl.col('stop_id').is_in(st['stop_id'].unique().to_list()))
    parada_no, parada_nome = {}, {}
    for r in sp.iter_rows(named=True):
        x, z = xz(float(r['stop_lon']), float(r['stop_lat']))
        d = np.hypot(P[:, 0] - x, P[:, 1] - z)
        j = int(d.argmin())
        if d[j] <= 30:
            cand = [int(k) for k in np.argsort(d)[:8] if d[k] <= d[j] + 14]
            parada_no[r['stop_id']] = cand
            parada_nome[r['stop_id']] = r['stop_name'].replace('Basel, ', '')

    # dias de referência
    cal = pl.read_csv(G / 'calendar.txt', infer_schema_length=0)
    cd = pl.scan_csv(G / 'calendar_dates.txt', infer_schema_length=0).filter(
        pl.col('date').is_in([d.replace('-', '') for d in DIAS.values()])).collect()
    ativos = {}
    nomes_sem = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    import datetime
    for k, d in DIAS.items():
        dd = datetime.date.fromisoformat(d)
        s = set()
        for r in cal.iter_rows(named=True):
            if r['start_date'] <= d.replace('-', '') <= r['end_date'] and r[nomes_sem[dd.weekday()]] == '1':
                s.add(r['service_id'])
        for r in cd.filter(pl.col('date') == d.replace('-', '')).iter_rows(named=True):
            (s.add if r['exception_type'] == '1' else s.discard)(r['service_id'])
        ativos[k] = s

    # viagens -> padrões (linha, sentido, sequência de vértices)
    info = {r['trip_id']: r for r in viag.iter_rows(named=True)}
    rinfo = {r['route_id']: r for r in rotas.iter_rows(named=True)}
    padroes = defaultdict(list)
    st = st.with_columns(pl.col('stop_sequence').cast(pl.Int32)).sort('trip_id', 'stop_sequence')
    for tid, g in st.group_by('trip_id', maintain_order=True):
        tid = tid[0] if isinstance(tid, tuple) else tid
        seq = []
        for r in g.iter_rows(named=True):
            if r['stop_id'] not in parada_no:
                continue
            nome = parada_nome[r['stop_id']]
            a, dd = seg(r['arrival_time']), seg(r['departure_time'])
            if seq and seq[-1][0] == nome:
                seq[-1][2] = dd
                continue
            seq.append([nome, a, dd, r['stop_id']])
        if len(seq) < 2:
            continue
        v = info[tid]
        r = rinfo[v['route_id']]
        chave = (r['route_short_name'], 'BLT' if r['agency_id'] in blt else 'BVB', v['direction_id'], tuple(s[0] for s in seq))
        padroes[chave].append((v['service_id'], v['trip_headsign'], seq))
    print('padrões:', len(padroes))

    saida = []
    cache_dij = {}
    for (linha, empresa, sentido, nomes), viagens in sorted(padroes.items(), key=lambda kv: -len(kv[1])):
        if len(viagens) < 3:
            continue
        # escolha dos vértices das paradas (Viterbi: o caminho total mais curto, na mão certa) e caminho entre elas
        cands = [parada_no[sq[3]] for sq in viagens[0][2]]
        dpv = [{c: (0.0, None) for c in cands[0]}]
        for i in range(1, len(cands)):
            nova = {}
            for b in cands[i]:
                melhor = None
                for a, (ca, _) in dpv[-1].items():
                    if a == b:
                        custo = ca
                    else:
                        pth = cache_dij.get((a, b))
                        if pth is None:
                            pth = cache_dij[(a, b)] = dijkstra(adj, pen, a, b) or False
                        if not pth:
                            continue
                        custo = ca + sum(float(np.hypot(*(P[u] - P[v]))) * pen.get((u, v), 1.0) for u, v in zip(pth, pth[1:]))
                    if melhor is None or custo < melhor[0]:
                        melhor = (custo, a)
                if melhor:
                    nova[b] = melhor
            dpv.append(nova)
            if not nova:
                break
        if len(dpv) < len(cands) or not dpv[-1]:
            print('  sem caminho:', linha, sentido, nomes)
            continue
        fim_no = min(dpv[-1], key=lambda k: dpv[-1][k][0])
        nos = [fim_no]
        for i in range(len(cands) - 1, 0, -1):
            nos.append(dpv[i][nos[-1]][1])
        nos = nos[::-1]
        cam = [nos[0]]
        for a, b in zip(nos, nos[1:]):
            if a == b:
                continue
            p = cache_dij[(a, b)]
            ret = float(np.hypot(*(P[a] - P[b])))
            comp = sum(float(np.hypot(*(P[u] - P[v]))) for u, v in zip(p, p[1:]))
            if comp > 3 * ret + 60:
                print(f'  aviso: {linha} {sentido}: trecho {nomes} com {comp:.0f} m para {ret:.0f} m em linha reta')
            cam += p[1:]
        if len(cam) < 2:
            continue
        ini = estende(P, adj, cam, False)
        n_ini = len(ini) - len(cam)
        cam2 = estende(P, adj, ini, True)
        cam = cam2
        # distância acumulada
        acum = [0.0]
        for u, v in zip(cam, cam[1:]):
            acum.append(acum[-1] + float(np.hypot(*(P[u] - P[v]))))
        # posição das paradas ao longo do caminho (primeira vez que o vértice aparece a partir da parada anterior)
        pos, k = [], 0
        for n in nos:
            k = cam.index(n, k)
            pos.append(acum[k])
        ext_ini = pos[0]
        ext_fim = acum[-1] - pos[-1]
        V = 7.5  # m/s nos trechos além das paradas
        # tempos medianos relativos à saída da primeira parada
        arr = np.median([[s[1] - v[2][0][2] for s in v[2]] for v in viagens], axis=0)
        dep = np.median([[s[2] - v[2][0][2] for s in v[2]] for v in viagens], axis=0)
        dt0 = ext_ini / V + max(0.0, float(dep[0] - arr[0]))
        paradas = [[round(pos[i], 1), int(round(arr[i] + dt0)), int(round(dep[i] + dt0)), parada_nome[viagens[0][2][i][3]]] for i in range(len(nos))]
        fim_t = int(round(dep[-1] + dt0 + ext_fim / V))
        inicios = {}
        for dia, serv in ativos.items():
            inicios[dia] = sorted(int(v[2][0][2] - dt0) for v in viagens if v[0] in serv)
        if not any(inicios.values()):
            continue
        # caminho: x,z em dm; vértice de ponte
        c = []
        for n in cam:
            c += [int(round(P[n][0] * 10)), int(round(P[n][1] * 10))]
        saida.append({
            'l': linha, 'e': empresa, 'd': int(sentido), 'cab': viagens[0][1], 'c': c,
            'p': [i for i, n in enumerate(cam) if ponte[n]],
            'k': paradas, 'T': fim_t,
            **{f'i_{d}': v for d, v in inicios.items()},
        })
        print(f'  {linha:>3} {empresa} sent {sentido} -> {viagens[0][1]:<28} {len(nos):>2} paradas, {acum[-1]:>5.0f} m, '
              f'{fim_t // 60} min, saídas útil/sáb/dom = {len(inicios["util"])}/{len(inicios["sab"])}/{len(inicios["dom"])}')
    feed = pl.read_csv(G / 'feed_info.txt', infer_schema_length=0).row(0, named=True)
    return {'feed': {'versao': feed['feed_version'], 'de': feed['feed_start_date'], 'ate': feed['feed_end_date'], 'dias_ref': DIAS}, 'padroes': saida}


# ---------------------------------------------------------------- contagens (data.bs.ch 100013)
def contagens():
    d = pl.read_csv(D / 'zaehlung_2025.csv', separator=';', encoding='utf8-lossy')
    d = d.with_columns(
        pl.col('geo_point_2d').str.split(',').list.get(0).cast(pl.Float64).alias('lat'),
        pl.col('geo_point_2d').str.split(',').list.get(1).str.strip_chars().cast(pl.Float64).alias('lon'),
        pl.when(pl.col('weekday') <= 4).then(pl.lit('util')).when(pl.col('weekday') == 5).then(pl.lit('sab')).otherwise(pl.lit('dom')).alias('dia'),
    )
    sitios = []
    for (tipo,), g in d.group_by('traffictype'):
        pass
    por_sitio = d.group_by('zst_id', 'sitename', 'traffictype', 'lat', 'lon').agg(pl.col('total').mean().alias('media'))
    perto = []
    for r in por_sitio.drop_nulls('lat').iter_rows(named=True):
        x, z = xz(r['lon'], r['lat'])
        if abs(x) < 1500 and abs(z) < 1500:
            perto.append({**r, 'x': x, 'z': z})
    ids_ped = sorted({r['zst_id'] for r in perto if r['traffictype'] == 'Fussgänger'})
    ids_vel = sorted({r['zst_id'] for r in perto if r['traffictype'] == 'Velo'})
    out = {}
    for nome, tipo, ids in (('ped', 'Fussgänger', ids_ped), ('velo', 'Velo', ids_vel)):
        f = d.filter(pl.col('traffictype') == tipo, pl.col('zst_id').is_in(ids))
        # por sítio: média por (dia, hora), normalizada pelo máximo do sítio; depois média ponderada pela média do sítio
        horas = {k: np.zeros(24) for k in DIAS}
        pesos = 0
        for (zid,), gs in f.group_by('zst_id'):
            tot = gs['total'].mean()
            m = gs.group_by('dia', 'hourfrom').agg(pl.col('total').mean().alias('m'))
            arr = {k: np.zeros(24) for k in DIAS}
            for r in m.iter_rows(named=True):
                arr[r['dia']][r['hourfrom']] = r['m']
            pico = max(a.max() for a in arr.values()) or 1
            for k in DIAS:
                horas[k] += arr[k] / pico * tot
            pesos += tot
        pico = max(h.max() for h in horas.values()) or 1
        mes = f.group_by('month').agg(pl.col('total').mean().alias('m')).sort('month')['m'].to_numpy()
        out[nome] = {'hora': {k: [round(float(v / pico), 3) for v in h] for k, h in horas.items()}, 'mes': [round(float(v / mes.max()), 3) for v in mes]}
    out['sitios'] = [{'n': r['sitename'], 't': 'p' if r['traffictype'] == 'Fussgänger' else 'v', 'x': round(r['x']), 'z': round(r['z']), 'm': round(r['media'], 1)}
                     for r in perto if abs(r['x']) < 900 and abs(r['z']) < 900]
    print('sítios de contagem perto:', len(out['sitios']), ' ped:', len(ids_ped), ' velo:', len(ids_vel))
    return out


# ---------------------------------------------------------------- zona de pedestres, trajetos livres, nado
def projeta(g):
    return shp_transform(lambda x, y, z=None: xz(x, y), g)


def zonas():
    rng = random.Random(19)
    f = json.loads((RAIZ / 'data/15-chao/fussgaenger.geojson').read_text())
    recorte = box(X0 + FOLGA, Z0 + FOLGA, X1 - FOLGA, Z1 - FOLGA)
    livres = []
    areas = []
    for ft in f['features']:
        g = projeta(shape(ft['geometry'])).intersection(recorte)
        if g.is_empty or g.area < 40:
            continue
        areas.append(g)
    total = sum(g.area for g in areas)
    for g in areas:
        miolo = g.buffer(-0.9)
        if miolo.is_empty:
            miolo = g.buffer(-0.3)
        if miolo.is_empty:
            continue
        n = max(2, int(round(g.area / 55)))
        n = min(n, 90)
        minx, miny, maxx, maxy = miolo.bounds
        tent = 0
        feitos = 0
        while feitos < n and tent < n * 60:
            tent += 1
            p = Point(rng.uniform(minx, maxx), rng.uniform(miny, maxy))
            if not miolo.contains(p):
                continue
            a = rng.uniform(0, 2 * math.pi)
            L = rng.uniform(6, 38)
            q = Point(p.x + math.cos(a) * L, p.y + math.sin(a) * L)
            if not LineString([p, q]).within(miolo):
                continue
            livres.append([round(p.x, 1), round(p.y, 1), round(q.x, 1), round(q.y, 1), round(g.area)])
            feitos += 1
    zonas_out = []
    for g in areas:
        for pol in (g.geoms if hasattr(g, 'geoms') else [g]):
            if pol.geom_type == 'Polygon' and pol.area > 20:
                zonas_out.append([int(round(v * 10)) for xy in pol.simplify(0.8).exterior.coords for v in xy])
    print('zona de pedestres:', len(areas), 'polígonos,', round(total), 'm2;', len(livres), 'trajetos livres')
    s = json.loads((D / 'schwimm.geojson').read_text())
    nado = []
    for ft in s['features']:
        g = projeta(shape(ft['geometry'])).intersection(recorte)
        if g.is_empty:
            continue
        for p in (g.geoms if hasattr(g, 'geoms') else [g]):
            if p.area > 300:
                nado.append([[round(x, 1), round(y, 1)] for x, y in p.simplify(1.5).exterior.coords])
    print('zonas de nado no recorte:', len(nado), [len(p) for p in nado])
    return livres, nado, zonas_out


def main():
    b = bondes()
    c = contagens()
    livres, nado, zped = zonas()
    out = {
        'fontes': {
            'gtfs': 'opentransportdata.swiss, GTFS estático (Fahrplan 2026), BVB e BLT',
            'contagem': 'data.bs.ch 100013, CC BY 4.0 (2025)',
            'nado': 'data.bs.ch 100270, CC BY 4.0',
            'pedestres': 'data.bs.ch, Fussgängerzone (data/15-chao)',
        },
        'bondes': b, 'contagem': c, 'livres': livres, 'nado': nado, 'zonas': zped,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    print('gravado', OUT, round(OUT.stat().st_size / 1024), 'KB')


if __name__ == '__main__':
    main()
