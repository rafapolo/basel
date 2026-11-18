# Comparação com a cidade real

Tarefa 21. Seis câmeras fixas, as capturas da cidade 3D guardadas por data e, ao lado, referências de licença aberta.
A rodada de **2026-11-18** (`2026-11-18/`) é o "antes" das tarefas 11 a 20.

Ver tudo lado a lado: `bunx serve design` e abrir `http://localhost:3000/comparacao/` (o `index.html` escolhe a rodada num seletor; não abre por `file://`).

## As 6 câmeras

Definidas em [`docs/cameras.js`](../../docs/cameras.js) e abertas por `?cam=<nome>` (ex.: `http://localhost:3021/?cam=marktplatz`).
Cidade em 2026, modo gravura, de dia, sem painel (o script esconde tudo menos o canvas).

| nome | o que é | origem |
|---|---|---|
| `pfalz` | Reno e Mittlere Brücke, da Pfalz | vista de abertura e de fecho do tour (cenas 0 e 5) |
| `munster` | Münster e Münsterplatz, do alto | cena 1 do tour |
| `reno` | Reno e margem de Kleinbasel, voo baixo | fim da cena 3 do tour |
| `rathaus` | Rathaus e Marktplatz, do alto | cena 4 do tour |
| `marktplatz` | nível da rua (1,7 m), lado oeste da praça, olhando o Rathaus | nova |
| `rheinsprung` | nível da rua (1,7 m), embaixo do Rheinsprung, subindo | nova |

Escolha de 6 entre as 8 possíveis (6 cenas do tour + 2 de rua): ficaram de fora a cena 2 (máquina do tempo, que mostra anos
passados e não tem foto equivalente) e a abertura a 1,9 km de altura (vista de satélite, a `pfalz` já cobre o Reno).
Para trocar uma câmera, edite só `docs/cameras.js`; o `?cam=` em `docs/cidade.js` é a única outra mudança (8 linhas).
Câmeras de rua usam `dist: 25` e `polar: 86°`, que é o mínimo/máximo do OrbitControls (`minDistance` 25, `maxPolarAngle` 86°) e dá olho a 1,7 m do chão.

## Como tirar as capturas (de cada tarefa)

```sh
cd <worktree>
bunx serve docs -l <porta>            # em outro terminal ou em segundo plano
uv run --with playwright script/capturas.py http://localhost:<porta> design/comparacao/AAAA-MM-DD
uv run --with playwright playwright install chromium   # só na primeira vez
```

`capturas.py` recebe a URL base e a pasta de saída; grava `<pasta>/{pfalz,munster,reno,rathaus,marktplatz,rheinsprung}.png`
(1280×720) e `medicao.json` (fps e peso), e registra a data em `datas.json`, de onde o `index.html` lê as rodadas.
`--sem-medir` tira só as capturas (mais rápido); `--query 'noite=1'` repassa parâmetros à página.
Usa o Chromium embutido do Playwright, nunca o Chrome instalado.
`docs/data/` (ignorado pelo git) precisa existir na worktree; numa worktree nova, `ln -s ~/Projetos/basel/docs/data docs/data`.

## Medição base (2026-11-18, antes das tarefas 11 a 20)

Máquina: MacBook com Apple M4, Chromium headless 159 com ANGLE/Metal (GPU de verdade, não software), janela 1280×720, DPR 1.

| medida | valor |
|---|---|
| peso de abertura, **transferido** (com gzip do `serve`) | **2,17 MB** (`predios.bin` 1,61 · three.js 0,21 · fontes 0,17 · relevo 0,07 · ruas 0,04 · predios.json 0,04) |
| peso de abertura, descomprimido | 8,03 MB (`predios.bin` 5,89) |
| tempo até a cidade aparecer (localhost, sem cache) | 0,7 a 2,9 s (varia com o CDN do three.js) |
| fps com a câmera parada, Pfalz | 60,2 (teto do vsync; pior quadro 16,8 ms) |
| fps girando a câmera, Pfalz | 60,1 |
| fps sem limite de 60 Hz (`--disable-frame-rate-limit`), por câmera | pfalz 518 · munster 523 · reno 477 · rathaus 573 · marktplatz 532 · rheinsprung 535 |
| escala | 1.892 sólidos (1.739 prédios), 245.349 triângulos |

Leitura: o orçamento da tarefa 20 (abrir em menos de 3 MB) hoje cabe com folga (2,17 MB) **só porque a Altstadt é pequena e o servidor comprime**;
sem compressão são 8 MB. Os fps sem vsync são de um M4 e medem a taxa de quadros do navegador, não o tempo da GPU, então mostram só que a cena é leve
para esta máquina; num celular médio (meta de 30 fps) o número será muito menor, e é preciso repetir lá. Cada tarefa deve repetir `script/capturas.py`
e comparar com este `medicao.json`. Fontes do Google Fonts (IM Fell English, Inter) e o three.js vêm de CDN e entram na conta.

## O que ainda denuncia o "falso" (nas capturas de 2026-11-18)

| # | o que se vê | onde aparece | de onde vem | tarefa |
|---|---|---|---|---|
| 1 | **Paredes lisas**: só uma cor por prédio, sem janela, porta, andar, reboco ou arenito. É o que mais pesa nas câmeras de rua (`marktplatz`, `rheinsprung`: um paredão liso). | todas, sobretudo as de rua | swissBUILDINGS3D é LOD2 (só volumes) e `cidade.js` pinta por época/uso | 12 |
| 2 | **Telhados** como placas marrons chapadas, sem telha, cumeeira, chaminé ou trapeira; as empenas e águas aparecem como planos de cor | `pfalz`, `munster`, `reno`, `rathaus` | idem LOD2; a mesma cor de telhado em toda a cidade | 12 |
| 3 | **Margem serrilhada e "derretida"**: no pé do cais o relevo escorre em listras verticais e a linha d'água vira dente de serra | `munster` (esquerda), `reno` (toda a margem) | o rio é "relevo abaixo de 246,3 m" numa grade de 5 m (`relevo.bin`, 220×230); não há contorno de água nem muro de cais | 14, 15 |
| 4 | **Rio como plano fosco** de uma cor, sem reflexo, ondas ou espuma, com um **clarão branco** circular (brilho especular do sol) que estoura a cor | `pfalz`, `reno` | material de água simples + luz direcional sem reflexo de ambiente | 14, 13 |
| 5 | **Chão liso**: praças, ruas e Münsterplatz são uma cor só, sem paralelepípedo, calçada, trilho ou faixa; a Marktplatz real é de paralelepípedo e bonde | `munster`, `marktplatz`, `rheinsprung` | o relevo é pintado com uma cor; ruas e bondes são só linhas finas (verdes) | 15, 11 |
| 6 | **Pontes** como fitas planas cor de areia, sem arcos, pilares, guarda-corpo nem a faixa do bonde | `reno` | a ponte é uma faixa que liga as duas margens (variável `ponte` em `cidade.js`) | 14, 17 |
| 7 | **Céu chapado**: um bege liso (cor de papel) igual à neblina, sem gradiente, sol, nuvens nem horizonte | `reno`, `pfalz` | `cena.background` é uma cor só; `Fog` de 900 a 2600 m da mesma cor | 13 |
| 8 | **Sem vegetação**: nenhuma árvore, nem as da Pfalz ou do Rheinweg, nem a grama; as margens e o Münsterplatz ficam nus | `pfalz`, `munster`, `reno` | OSM tem `natural=tree`, mas não é carregado; o swissBUILDINGS3D não traz vegetação | 16 |
| 9 | **Sombras e luz** de uma só luz direcional com sombra de borda dura/baixa resolução; sem oclusão de ambiente nos vãos entre casas | todas | `DirectionalLight` + `HemisphereLight`, sem AO | 13 |
| 10 | **Marcos genéricos**: o Münster e a torre de Sankt Martin são caixas e prismas; o Rathaus é um bloco bege (o real é de arenito vermelho) | `munster`, `rathaus` | LOD2 sem detalhe; cor por época, não por material | 18, 12 |
| 11 | **Cidade sem gente nem vida**: nenhum bonde, barco, balsa, pessoa ou carro. Um prisma com telhado vermelho flutua no rio, no primeiro plano da `reno` (origem não verificada: provavelmente um sólido do swissBUILDINGS3D sobre a água, como o barco-restaurante ou um pilar) | `reno`, ruas | não há agentes; o sólido perdido é dado | 19, 17 |
| 12 | **Mobiliário urbano ausente**: sem postes, fontes, bancos, letreiros, toldos (a Marktplatz tem a fonte e o Rathaus tem fachada pintada) | `marktplatz`, `rheinsprung` | não há geometria nem dados (OSM `amenity=fountain` etc.) | 17 |
| 13 | **Rua estreita demais**: no nível de 1,7 m o campo de visão de 42° e o recorte do OrbitControls (mínimo de 25 m do alvo) dão uma visão de túnel; a câmera `rheinsprung` olha para dentro de paredes | `marktplatz`, `rheinsprung` | `PerspectiveCamera(42)` e `minDistance: 25` | 15 |
| 14 | **Ruas e terreno sem declive credível**: o relevo é suave demais; o Rheinsprung, rua em subida forte, aparece quase plano e sem degraus (inclinação não medida) | `rheinsprung` | swissALTI3D reamostrado a 5 m | 15 |
| 15 | **Cor homogênea**: todos os prédios variam pouco de tom (bege, rosado), sem a diversidade de reboco, pedra vermelha e enxaimel de Basel | todas | paleta de poucas cores por época | 12, 11 |

Referência de cor e textura mais direta: a ortofoto da tarefa 11 (swissIMAGE) pode ser aplicada ao chão e aos telhados.

## Referências usadas

Licenças abertas, com autor e link em [`refs.json`](refs.json); cópias reduzidas (≤ 1280 px) em `ref/` e originais baixados em `data/21-referencia/` (fora do git).

| câmera | referência | autor | licença |
|---|---|---|---|
| pfalz | Basel, vista de pássaro de Merian, 1642 (planta de 1615) | Matthäus Merian | domínio público |
| munster | Münster e ponte, aérea de 1931 | Walter Mittelholzer, ETH-Bibliothek | domínio público |
| reno | Panorama do Münsterturm, 2015 | Taxiarchos228 | Free Art License 1.3 |
| rathaus | Aérea de 1933; Rathaus, 2019 | Mittelholzer; GabrielleMerk | domínio público; CC BY-SA 4.0 |
| marktplatz | Duas fotos da Marktplatz, 2021-10-17 (Panoramax) | KaiPankrath, via MapComplete | CC BY-SA 4.0 |
| rheinsprung | Rheinsprung com o Hus zur Waltpurg, 2023 | JoachimKohler-HB | CC BY-SA 4.0 |

Notas honestas sobre as referências:

- Só a `marktplatz` tem foto georreferenciada do Panoramax (ponto a 8 m da câmera, azimute 101°); são fotos de fontes com a praça ao fundo, verticais.
  Para o Rheinsprung o Panoramax só tem duas fotos de fonte, sem a rua; usei uma foto da Wikimedia Commons, que não é do mesmo ponto.
- **Mapillary** não foi usado: exige token de API e a licença CC BY-SA vale por foto; Panoramax e Commons deram o que era preciso sem cadastro.
- A gravura de Merian é de cima (vista de pássaro de Kleinbasel para o sul), a `pfalz` olha para o outro lado; compara-se malha e escala, não o enquadramento.
- As aéreas de Mittelholzer são de 1931 e 1933: o Münster, o Rathaus e o traçado são os mesmos, mas a cidade em volta mudou.
- A fotografia do Rathaus (GabrielleMerk) e as de Rheinsprung/Marktplatz não têm o mesmo ângulo das câmeras 3D; servem para ver textura, cor e proporção de fachada.
