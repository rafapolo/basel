#!/bin/sh
# Tarefa 19: baixa as fontes novas para data/19-vida/ (não apaga nada). Depois: script/vida.py
set -e
cd "$(dirname "$0")/.."
mkdir -p data/19-vida/gtfs
B="https://data.bs.ch/api/explore/v2.1/catalog/datasets"
# GTFS estático suíço (opentransportdata.swiss, sem chave; o link permanente redireciona para o arquivo da edição atual)
[ -f data/19-vida/gtfs.zip ] || curl -sL -o data/19-vida/gtfs.zip "https://data.opentransportdata.swiss/dataset/timetable-2026-gtfs2020/permalink"
[ -f data/19-vida/gtfs/stop_times.txt ] || unzip -o -q data/19-vida/gtfs.zip -d data/19-vida/gtfs
# zonas de nado no Reno (100270) e contagem de pedestres e bicicletas de 2025 (100013), CC BY 4.0
curl -s "$B/100270/exports/geojson" -o data/19-vida/schwimm.geojson
curl -s -G "$B/100013/exports/csv" --data-urlencode "select=zst_id,sitename,traffictype,hourfrom,weekday,month,total,geo_point_2d" \
  --data-urlencode "where=year='2025'" --data-urlencode "delimiter=;" -o data/19-vida/zaehlung_2025.csv
