"""Recorte e origem do Basel 3D, num lugar só (todos os scripts importam daqui).

O recorte foi de 1,1 × 1,15 km (Altstadt) a 2,3 × 1,95 km em 2026-11-19: a oeste até a Allschwilerplatz (entradas do
GWR em 2609875–2609990 / 1267390–1267410) e ao sul até a estação SBB e a Centralbahnplatz (2611390/1266430).

A ORIGEM fica fixa no centro do recorte antigo: as coordenadas locais já espalhadas pelo código (câmeras, marcos, ponte,
tour, pontos) continuam valendo. Local: x = E − ORIGEM_E (leste), z = −(N − ORIGEM_N) (sul é +z).
"""

E0, E1 = 2609600.0, 2611900.0  # oeste: 250 m além da Allschwilerplatz, com a Oekolampad (igreja, Gemeindehaus e a Anlage)
N0, N1 = 1266150.0, 1268100.0
ORIGEM_E, ORIGEM_N = 2611350.0, 1267525.0
BASE_Z = 244.0
ESCALA = 16  # Int16 em 1/16 m (6 cm): ±2048 m, cobre o recorte novo (x de −1750 a 550, z de −575 a 1375, +60 m de folga)

# em coordenadas locais
X0, X1 = E0 - ORIGEM_E, E1 - ORIGEM_E
Z0, Z1 = -(N1 - ORIGEM_N), -(N0 - ORIGEM_N)
CX, CZ = (X0 + X1) / 2, (Z0 + Z1) / 2


def dentro(x, z, folga=0.0):
    return X0 - folga <= x <= X1 + folga and Z0 - folga <= z <= Z1 + folga


def bbox_wgs84(folga_m=60.0):
    """(sul, oeste, norte, leste) em graus, para o Overpass."""
    from pyproj import Transformer  # só aqui: o resto dos scripts não precisa do pyproj
    t = Transformer.from_crs(2056, 4326, always_xy=True)
    lo0, la0 = t.transform(E0 - folga_m, N0 - folga_m)
    lo1, la1 = t.transform(E1 + folga_m, N1 + folga_m)
    return round(la0, 5), round(lo0, 5), round(la1, 5), round(lo1, 5)

# relevo fino (script/chao.py): grade (2^k + 1)² a 0,6 m centrada no meio do recorte (4096 × 0,6 = 2458 m, cobre 2300 × 1950)
DEM_N = 4097
DEM_PASSO = 0.6
CENTRO_E, CENTRO_N = (E0 + E1) / 2, (N0 + N1) / 2

# relevo de 5 m (relevo.bin, legado; reserva enquanto o fino carrega)
RELEVO_PASSO = 5
RELEVO_NX, RELEVO_NY = int(round((E1 - E0) / RELEVO_PASSO)), int(round((N1 - N0) / RELEVO_PASSO))


def local(e, n):
    return e - ORIGEM_E, -(n - ORIGEM_N)
