# Basel

Basel in 3D, building by building, with a time machine driven by each building's year of construction.
The idea comes from [View of Delft](https://delft.meuleman.org/) (Wouter Meuleman), but the code, the look and the
mechanics are our own. It is not a copy of his interface.

**Live:** https://rafapolo.github.io/basel/ (GitHub Pages, served from the `docs/` folder on `main`).

## Sources (surveyed on 2026-11-05)

| Role | Source | Notes |
|---|---|---|
| 3D buildings | swissBUILDINGS3D 3.0 (swisstopo, OGD) | STAC `data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissbuildings3d_3_0`, `.gdb.zip` / `.dwg.zip` tiles in EPSG:2056 with LN02 heights (5728). Basel falls in `1047-32/34/41/43`, `1067-12`… |
| Year of construction | GWR (BFS) | `api3.geo.admin.ch/.../identify` on the `ch.bfs.gebaeude_wohnungs_register` layer: `gbauj` (year), `gbaup` (period code), `gastw` (floors), `ganzwhg` (flats). E.g. Münsterplatz 9 = 1100, Rittergasse 7 = 1871 |
| Statistics | data.bs.ch (Opendatasoft v2.1) | GWR buildings `100230`, dwellings `100232`, entrances `100231`, population by district `100126`, district boundaries `100042`, 2026–2050 scenarios `100007`, district indicators `100226` |
| Aerial photo | swissIMAGE 10 cm, 2024 edition (swisstopo, OGD) | STAC `ch.swisstopo.swissimage-dop10`, resampled to ~27 cm/px on the ground and the roofs |
| Streets, Rhine, trams | OpenStreetMap | © OpenStreetMap contributors (ODbL) |
| Reference photos | Panoramax and Wikimedia Commons | only in `design/comparacao/`, with each photo's author and license in `refs.json` |

## What is there

- **The Altstadt in 3D** (`docs/`): 1,739 buildings (1,892 swissBUILDINGS3D solids), 94.1% with the exact GWR year,
  terrain, the Rhine, streets and trams. Click a building to see its address, year, floors, flats and use.
- **Time machine** from 1100 to 2026: each building rises in its year; pale lots where today's building did not exist
  yet; red pins for the demolished buildings the register knows. Colour by period, and night with lit windows.
- **Procedural façades** (`docs/fachadas.js`): floors from the GWR, windows, doors and shop fronts, render, red
  sandstone or concrete and glass by age and use, plinths, tiled roofs, chimneys and dormers — all in the shader.
- **Aerial photo** on the ground and the roofs (`docs/ortofoto.js`): opens with a 68 KB overview and streams the 16
  tiles in the background, nearest to the camera first.
- **One-minute tour** with music generated in the browser (fife, Basel drum and bells): button at the top or
  `?tour=1` (`?tour=en`, `?tour=de`). Script, captions and sound in [design/tour.md](design/tour.md) (Portuguese).
- **Fixed cameras** to compare with the real city: `?cam=pfalz|munster|reno|rathaus|marktplatz|rheinsprung`.
  The side-by-side comparison with openly licensed photos is in [design/comparacao/](design/comparacao/).
- **Three languages:** PT, EN and DE, from the selector at the top or `?lang=en|de`.

## How to reproduce

```sh
script/baixa.sh                                                                    # raw sources → data/raw/
uv run --with polars --with shapely --with pyproj --with numpy script/predios.py   # → docs/data/
uv run --with rasterio --with numpy --with pillow script/ortofoto.py               # → docs/data/ortofoto/
python3 -m http.server -d docs 8000                                                # http://localhost:8000
uv run --with playwright script/capturas.py http://localhost:8000 design/comparacao/YYYY-MM-DD  # 6 captures + fps and weight
```

`data/` (the raw sources, ~500 MB) goes neither to git nor to the site; `docs/data/` is generated and versioned.

## Data licenses

Buildings, terrain and aerial photo: © swisstopo, open government data (OGD). Building year and use: GWR (BFS) and
data.bs.ch. Streets and river: © OpenStreetMap contributors, ODbL.

## Tasks

See [tasks/README.md](tasks/README.md) (in Portuguese).
