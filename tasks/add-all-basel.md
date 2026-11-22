# Basel-Stadt inteira (Basel, Riehen e Bettingen)

Hoje o modelo cobre um recorte de 6,6 km² (`recorte_lv95` 2609600–2613000 × 1266150–1268100). Basel-Stadt tem
37 km². Esta nota reúne o que pesa hoje, o que pesaria o cantão inteiro (estimativa) e a memória medida no tour.

## O que pesa hoje (medido em 2026-11-20)

- Prédios: 8.979 do GWR no recorte (9.407 sólidos do swissBUILDINGS3D, 8.596 EGIDs), 868.971 triângulos.
- `docs/data`: 32 MB. Os maiores arquivos:

| Arquivo | Tamanho |
|---|---|
| `predios.v2.bin` | 8,8 MB |
| `terreno.v2.bin` | 8,2 MB (quadrado de 4,9 km) |
| `predios.json` | 1,6 MB |
| `ruas_b.webp` + `ruas_a.webp` | 1,1 MB |
| `ruas.json` | 0,6 MB |
| `relevo.bin` | 0,5 MB |

- `dist/`: 38 MB.
- Quadro (Chromium headless, Metal, M4, 1600×900, `?cam=pfalz&res=fixa`): ~25 ms parado, ~31,6 ms girando.
- Abertura: ~3–4 s.

## Prédios no GWR (data.bs.ch 100230, status «bestehend»)

| Município | Prédios |
|---|---|
| Basel | 23.971 |
| Riehen | 5.965 |
| Bettingen | 505 |
| **Total** | **30.441** (×3,4 o recorte) |

## Estimativa para o cantão inteiro

Não medido: estimado escalando o recorte de hoje.

| | Hoje (recorte de 6,6 km²) | Basel-Stadt (37 km²) |
|---|---|---|
| Malha dos prédios | 8,8 MB | ~25–30 MB (as casas de Riehen têm telhados mais simples) |
| Terreno | 8,2 MB | ~15 MB (cortado no cantão) a ~30 MB (o retângulo inteiro, 10,5 × 9,1 km) |
| Ruas, árvores e o resto | ~3 MB | ~9 MB |
| **Download dos dados** | **~32 MB** | **~75–85 MB** (menos com gzip) |
| Pico de memória JS (abertura) | ~500 MB (medido) | ~1,5 GB |
| Memória JS em uso normal | ~45–170 MB (medido) | ~150–500 MB |
| GPU, prédios | ~250 MB | ~800 MB |
| Montagem das fachadas | ~230 ms | ~800 ms |
| Abertura num M4 | ~3 s | ~8–10 s |
| Quadro em vista aérea | ~25 ms | ~45–55 ms; de perto quase igual (os blocos de 300 m fora da vista são descartados) |

**No celular não cabe do jeito que está:** o Safari do iPhone derruba a página por volta de 1–1,5 GB, e o pico seria
na abertura. Precisaria de:

- carregar os bairros (blocos) sob demanda, em vez de tudo na abertura;
- versão simplificada (LOD) dos prédios distantes;
- decodificar as malhas por partes, para não juntar ~1,5 GB de uma vez.

## Memória JS durante o tour (medida em 2026-11-20)

Como medi: Chromium headless com `--enable-precise-memory-info`, versão de produção (`dist/`), `JSHeapUsedSize` pelo
CDP, uma amostra por segundo. Script em `scratchpad/memtour.mjs`.

| Momento | Memória JS em uso |
|---|---|
| Abertura (montando a cidade) | sobe até **499 MB** (reservado: 582 MB) |
| Parado, depois de abrir | **45–66 MB** |
| Durante o tour | **43–167 MB** |
| Depois do tour | 52–74 MB |
| Depois de forçar a coleta de lixo | **44 MB** |

Por cena:

| Cena | Mês | Memória |
|---|---|---|
| Abertura do voo | janeiro | 55–78 MB |
| Fasnacht a pé | fevereiro | 76–120 MB |
| Münster e Pfalz | março a maio | 111–140 MB |
| Mittlere Brücke | maio | 123–156 MB |
| Rheinbord | junho | 141–165 MB |
| Reno | julho | 55–167 MB (o pico; aqui o coletor de lixo limpa) |
| Marktplatz | julho e agosto | 43–85 MB |
| Barfüsserplatz e SBB | setembro e outubro | 51–81 MB |
| Final | novembro e dezembro | 52–81 MB |

- **Sem vazamento:** a memória sobe em dente de serra, cerca de 2–3 MB/s de lixo, e o coletor devolve tudo. Depois do
  tour, forçando a coleta, volta a 44 MB, o mesmo do começo.
- **De onde vem o lixo:** o tour muda a data ~8 vezes por segundo (`estacoes()` em `tour.js`), e cada troca recalcula
  sol, árvores e roupas. O auge cai no verão porque, além disso, há gente, bicicletas e os 5.000 nadadores. Dá para
  reduzir se valer a pena: menos trocas de data por segundo, ou recolorir só quando a estação muda.
- **Correção de um número anterior:** o `mem` de 620–700 MB do `perfil.mjs` é `performance.memory` logo depois da
  abertura, ainda com a sobra da montagem. O uso normal é de ~45–170 MB; o pico real é a abertura (~500 MB), quando as
  malhas são decodificadas antes de ir para a GPU.
- A memória da GPU não aparece nessa medida (os ~250 MB dos prédios são estimativa).

## Dados para começar

- Contorno do cantão: `data/23-fronteira/bs.json` (swissBOUNDARIES3D, LV95), baixado por `script/fronteira.py`.
- GWR do cantão inteiro: `data/raw/gwr_100230.parquet` e `gwr_100231.parquet`.
- swissBUILDINGS3D: hoje só os blocos 1047-34 e 1047-43 em `data/raw/sb3d`. Riehen e Bettingen pedem os blocos a leste.
- Relevo: `relevo.bin` (5 m) só cobre o recorte. O cantão pede swissALTI3D de Riehen e Bettingen; fora dele, o
  Copernicus GLO-30 em `data/22-entorno` serve de reserva.
