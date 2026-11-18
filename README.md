# Basel

Basel em 3D, prédio por prédio, com simulação de cidade por cima: zonas, população, caixa,
desastres históricos, festas e uma máquina do tempo pelo ano de construção.
A ideia vem do [View of Delft](https://delft.meuleman.org/) (Wouter Meuleman), mas o código,
o visual e as mecânicas são nossos. Não é uma cópia da interface dele.

**No ar:** https://rafapolo.github.io/basel/ (GitHub Pages, publicado da pasta `docs/` do `main`).

## Fontes (sondadas em 05/11/2026)

| Papel | Fonte | Observação |
|---|---|---|
| Prédios 3D | swissBUILDINGS3D 3.0 (swisstopo, OGD) | STAC `data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissbuildings3d_3_0`, blocos `.gdb.zip` / `.dwg.zip` em EPSG:2056 com alturas LN02 (5728). Basel cai em `1047-32/34/41/43`, `1067-12`… |
| Ano de construção | GWR (BFS) | `api3.geo.admin.ch/.../identify` com a camada `ch.bfs.gebaeude_wohnungs_register`: `gbauj` (ano), `gbaup` (código de época), `gastw` (andares), `ganzwhg` (apartamentos). Ex.: Münsterplatz 9 = 1100, Rittergasse 7 = 1871 |
| Estatística | data.bs.ch (Opendatasoft v2.1) | GWR prédios `100230`, moradias `100232`, entradas `100231`, população por bairro `100126`, limites dos bairros `100042`, cenários 2026–2050 `100007`, indicadores dos bairros `100226` |
| Foto aérea | swissIMAGE 10 cm, edição 2024 (swisstopo, OGD) | STAC `ch.swisstopo.swissimage-dop10`, reamostrada a ~27 cm/px no chão e nos telhados |
| Ruas, Reno, bondes | OpenStreetMap | © OpenStreetMap contributors (ODbL) |
| Fotos de referência | Panoramax e Wikimedia Commons | só em `design/comparacao/`, com autor e licença de cada uma em `refs.json` |

## O que já existe

- **Altstadt em 3D** (`docs/`): 1.739 prédios (1.892 sólidos do swissBUILDINGS3D), 94,1% com o ano exato do GWR, relevo, Reno, ruas e bondes.
  Clique num prédio para ver endereço, ano, andares, apartamentos e uso.
- **Máquina do tempo** de 1100 a 2026: cada prédio sobe no seu ano; lotes pálidos onde o prédio de hoje ainda não existia;
  pinos vermelhos para os demolidos que o registro conhece. Cor por época e noite com janelas acesas.
- **Tour de 1 minuto** com música gerada no navegador (pífaro, tambor de Basel e sinos): botão no topo ou `?tour=1`
  (`?tour=en`, `?tour=de`). Roteiro, legendas e som em [design/tour.md](design/tour.md).
- **Três línguas:** PT, EN e DE, pelo seletor do topo ou `?lang=en|de`.
- **Foto aérea** no chão e nos telhados (`docs/ortofoto.js`): abre com uma visão geral de 68 KB e baixa os 16 tiles
  em segundo plano, os mais próximos da câmera primeiro.
- **Câmeras fixas** para comparar com a cidade real: `?cam=pfalz|munster|reno|rathaus|marktplatz|rheinsprung`.
  A comparação lado a lado com fotos de licença aberta fica em [design/comparacao/](design/comparacao/).

## Como reproduzir

```sh
script/baixa.sh                                                                    # fontes brutas → data/raw/
uv run --with polars --with shapely --with pyproj --with numpy script/predios.py   # → docs/data/
uv run --with rasterio --with numpy --with pillow script/ortofoto.py               # → docs/data/ortofoto/
python3 -m http.server -d docs 8000                                                # http://localhost:8000
uv run --with playwright script/capturas.py http://localhost:8000 design/comparacao/AAAA-MM-DD  # 6 capturas + fps e peso
```

`data/` (as fontes brutas, ~500 MB) não vai para o git nem para o site; `docs/data/` é gerado e versionado.

## Licença dos dados

Prédios, relevo e foto aérea: © swisstopo, dados abertos (OGD). Ano e uso dos prédios: GWR (BFS) e data.bs.ch.
Ruas e rio: © OpenStreetMap contributors, ODbL.

## Tarefas

Ver [tasks/README.md](tasks/README.md).
