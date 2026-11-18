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
- **Luz e céu** (`docs/ceu.js`): sol real de Basel (47,557 N, 7,59 E; fórmulas do SunCalc, horário de verão da Europa) com controle de
  hora e data no painel (`?hora=15.5&data=2026-06-21`, padrão 21/06 às 15h); céu físico (Preetham) com a névoa tirada do mesmo céu,
  ACES com exposição automática suave, sombras em cascata (CSM, 3 cascatas), oclusão de ambiente (GTAO, meia resolução) e bloom só de noite.
  O botão "noite" vai para 22h30 e volta. **Modo leve** (`?leve=1`, automático em celular): sem CSM, GTAO nem bloom.

### API de hora e sol (para Reno, árvores etc.)

```js
import { ceu } from './ceu.js';            // ou window.ceu
ceu.estado()   // { data, hora, altitude (rad), altitudeGraus, azimute (rad, do norte, horário), dir: Vector3 (do chão ao sol; x leste, y cima, z −norte),
               //   noite (0..1), dia (0..1), luz:{cor, intensidade}, nascer, poente (hora local) }
ceu.definirHora(h, { animar })   // hora local 0–24; animar = desliza em 3 s
ceu.definirData('2026-06-21')
ceu.noite(true|false)
ceu.aoMudar((estado) => {...})   // devolve função que desliga; também dispara o evento 'ceu:mudou' na window
ceu.solEm('2026-12-21', 12)      // estado puro, sem mexer na cena
ceu.leve                         // modo leve ligado?
```

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
