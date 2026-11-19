#!/usr/bin/env bash
# Baixa as fontes brutas do recorte da Altstadt para data/raw/ (tarefa 01). Depois: script/predios.py
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/raw/sb3d data/raw/alti

# swissBUILDINGS3D 3.0, edição 2024, blocos que cobrem a Altstadt (FileGDB, LV95 + LN02)
for t in 1047-34 1047-43; do
  f="swissbuildings3d_3_0_2024_${t}_2056_5728.gdb.zip"
  [ -f "data/raw/sb3d/$f" ] || curl -sfo "data/raw/sb3d/$f" "https://data.geo.admin.ch/ch.swisstopo.swissbuildings3d_3_0/swissbuildings3d_3_0_2024_$t/$f"
  (cd data/raw/sb3d && unzip -oq "$f")
done

# GWR do data.bs.ch: prédios (100230) e entradas (100231)
for id in 100230 100231; do
  curl -sfo "data/raw/gwr_$id.parquet" "https://data.bs.ch/api/explore/v2.1/catalog/datasets/$id/exports/parquet"
done

# swissALTI3D 2 m, edição 2025, recortado e reamostrado a 5 m
for t in 2610-1266 2610-1267 2610-1268 2611-1266 2611-1267 2611-1268; do
  f="swissalti3d_2025_${t}_2_2056_5728.tif"
  [ -f "data/raw/alti/$f" ] || curl -sfo "data/raw/alti/$f" "https://data.geo.admin.ch/ch.swisstopo.swissalti3d/swissalti3d_2025_$t/$f"
done
(cd data/raw/alti && gdalbuildvrt -q -overwrite alti.vrt swissalti3d_*.tif \
  && gdalwarp -q -overwrite -te 2609600 1266150 2613000 1268100 -tr 5 5 -r average alti.vrt crop5.tif)

# OSM (ruas, lojas, água, verde, detalhes), com a caixa de script/recorte.py
(cd script && uv run --with pyproj python baixa_osm.py)
exit 0
# (consulta antiga, de antes da expansão de 2026-11-19; o Overpass responde 406 sem User-Agent)
curl -sf -m 120 -A "basel-3d-prototipo/0.1" https://overpass-api.de/api/interpreter -o data/raw/osm.json --data-urlencode \
  'data=[out:json][timeout:90];(way["highway"](47.5525,7.5815,47.5630,7.5965);way["railway"="tram"](47.5525,7.5815,47.5630,7.5965);way["historic"="citywalls"](47.540,7.570,47.575,7.610);node["amenity"="fountain"](47.5525,7.5815,47.5630,7.5965););out geom tags;'
echo "fontes em data/raw/"
