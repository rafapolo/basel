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
- **The Rhine** (`docs/agua.js`, data from `script/reno.py` -> `docs/data/reno.json`): OSM river polygon (way 1467859273, ODbL) instead of a height threshold, planar reflection of the buildings plus Preetham sky colours (off in light mode), waves travelling north-west (downstream), foam along the banks and around the bridge piers, water colour from the live data.bs.ch temperature (100046, CC BY 4.0) and turbidity (100323, CC0) with an offline snapshot, sandstone quay walls, bridge piers and bank stairs as geometry.
- **Light and sky** (`docs/ceu.js`): the real sun for Basel (47.557 N, 7.59 E; SunCalc formulas, EU daylight saving) with time and date
  controls in the panel (`?hora=15.5&data=2026-06-21`, default 21 June 15:00); physical sky (Preetham) with the fog taken from the same
  sky, ACES tone mapping with slow auto-exposure, cascaded shadow maps (3 cascades), ambient occlusion (GTAO, half resolution) and bloom
  at night only. The "night" switch slides to 22:30 and back. **Light mode** (`?leve=1`, automatic on phones): no CSM, GTAO or bloom.
- **Trees and green** (`docs/arvores.js`, data from `script/arvores.py`): 1,195 trees of the Basel tree register (data.bs.ch 100052, CC BY 4.0) plus 193 OSM-only trees, instanced per genus class with 3 LODs, wind sway, autumn colours and leaf fall driven by `ceu.estado().data`, bare branches in winter; OSM lawns and gardens draped on the terrain. Height comes from age and genus (the register has no height); crowns are calibrated against the 2024 canopy cover (100357). `?arvores=0` turns it off.
- **Street details** (`docs/detalhes.js`, positions in `docs/data/detalhes.json` from `script/detalhes.py`): fountains with water and jets,
  street lamps that light up at night (glow in the bloom plus a light pool on the ground), benches, bins, bike racks, café awnings,
  tables with parasols (20 April to 10 October, from the date of `ceu.estado()`), generic shop signs, Basel flags on public buildings,
  the Rhine cable ferries and ships. All instanced, hidden by the time machine according to era or the building's year; `?detalhes=0` turns it off.
  Sources: OpenStreetMap (ODbL), data.bs.ch 100008 (fountains, IWB, free use with attribution) and 100241 (bike racks, CC BY 4.0).
- **People and motion** (`docs/vida.js`, `docs/ambiente-som.js`, data by `script/vida.py` → `docs/data/vida.json`): BVB (green) and BLT (yellow) trams run on the OSM rails by the Swiss static GTFS timetable (opentransportdata.swiss; weekday/Saturday/Sunday reference days), instanced pedestrians (leg and arm swing in the shader) on streets and squares, denser near the data.bs.ch 100013 counters and following their hourly/weekly/monthly profile, bicycles, a few cars outside the pedestrian zone, gulls over the Rhine, and Wickelfisch swimmers in summer (zones 100270). Density follows `ceu.estado()` and the time-machine year (no trams before 1895, bikes 1890, cars 1910). Ambient sound (water, crowd, trams, hourly church bells, gulls; Web Audio, no files) has its own switch; `?vida=0` hides everything. Respects `ceu.leve` and `prefers-reduced-motion`.
- **Three languages:** PT, EN and DE, from the selector at the top or `?lang=en|de`.

### Time and sun API (for the Rhine, trees, etc.)

```js
import { ceu } from './ceu.js';            // or window.ceu
ceu.estado()   // { data, hora, altitude (rad), altitudeGraus, azimute (rad, from north, clockwise), dir: Vector3 (ground to sun; x east, y up, z -north),
               //   noite (0..1), dia (0..1), luz:{cor, intensidade}, nascer, poente (local hour) }
ceu.definirHora(h, { animar })   // local hour 0-24; animar = slides over 3 s
ceu.definirData('2026-06-21')
ceu.noite(true|false)
ceu.aoMudar((estado) => {...})   // returns an unsubscribe fn; also fires the 'ceu:mudou' event on window
ceu.solEm('2026-12-21', 12)      // pure state, does not touch the scene
ceu.leve                         // is light mode on?
```

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
