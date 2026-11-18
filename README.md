# Basel

Basel em 3D, prédio por prédio, com simulação de cidade por cima: zonas, população, caixa,
desastres históricos, festas e uma máquina do tempo pelo ano de construção.
A ideia vem do [View of Delft](https://delft.meuleman.org/) (Wouter Meuleman), mas o código,
o visual e as mecânicas são nossos. Não é uma cópia da interface dele.

## Fontes (sondadas em 05/11/2026)

| Papel | Fonte | Observação |
|---|---|---|
| Prédios 3D | swissBUILDINGS3D 3.0 (swisstopo, OGD) | STAC `data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissbuildings3d_3_0`, blocos `.gdb.zip` / `.dwg.zip` em EPSG:2056 com alturas LN02 (5728). Basel cai em `1047-32/34/41/43`, `1067-12`… |
| Ano de construção | GWR (BFS) | `api3.geo.admin.ch/.../identify` com a camada `ch.bfs.gebaeude_wohnungs_register`: `gbauj` (ano), `gbaup` (código de época), `gastw` (andares), `ganzwhg` (apartamentos). Ex.: Münsterplatz 9 = 1100, Rittergasse 7 = 1871 |
| Estatística | data.bs.ch (Opendatasoft v2.1) | GWR prédios `100230`, moradias `100232`, entradas `100231`, população por bairro `100126`, limites dos bairros `100042`, cenários 2026–2050 `100007`, indicadores dos bairros `100226` |
| Ruas, Reno, bondes | OpenStreetMap | © OpenStreetMap contributors (ODbL) |

## O que já existe

- **Altstadt em 3D** (`docs/`): 1.739 prédios (1.892 sólidos do swissBUILDINGS3D), 94,1% com o ano exato do GWR, relevo, Reno, ruas e bondes.
  Clique num prédio para ver endereço, ano, andares, apartamentos e uso.
- **Máquina do tempo** de 1100 a 2026: cada prédio sobe no seu ano; lotes pálidos onde o prédio de hoje ainda não existia;
  pinos vermelhos para os demolidos que o registro conhece. Cor por época e noite com janelas acesas.
- **Tour de 1 minuto** com música gerada no navegador (pífaro, tambor de Basel e sinos): botão no topo ou `?tour=1`
  (`?tour=en`, `?tour=de`). Roteiro, legendas e som em [design/tour.md](design/tour.md).
- **Três línguas:** PT, EN e DE, pelo seletor do topo ou `?lang=en|de`.

## Como reproduzir

```sh
script/baixa.sh                                                                    # fontes brutas → data/raw/
uv run --with polars --with shapely --with pyproj --with numpy script/predios.py   # → docs/data/
python3 -m http.server -d docs 8000                                                # http://localhost:8000
```

`data/raw/` não é publicado.

## Tarefas

Ver [tasks/README.md](tasks/README.md).
