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
| 11 | **Cidade sem gente nem vida**: nenhum bonde, barco, balsa, pessoa ou carro. Um prisma com telhado vermelho flutua no rio, no primeiro plano da `reno` (resolvido em 2026-11-18, tarefa 20: era o sólido 949, a Käppelijoch, afundado 9,35 m pelo `dz` do relevo fino; `marcos.js` o esconde e põe a capela no lugar dele) | `reno`, ruas | não há agentes; o sólido perdido é dado | 19, 17 |
| 12 | **Mobiliário urbano ausente**: sem postes, fontes, bancos, letreiros, toldos (a Marktplatz tem a fonte e o Rathaus tem fachada pintada) | `marktplatz`, `rheinsprung` | não há geometria nem dados (OSM `amenity=fountain` etc.) | 17 |
| 13 | **Rua estreita demais**: no nível de 1,7 m o campo de visão de 42° e o recorte do OrbitControls (mínimo de 25 m do alvo) dão uma visão de túnel; a câmera `rheinsprung` olha para dentro de paredes | `marktplatz`, `rheinsprung` | `PerspectiveCamera(42)` e `minDistance: 25` | 15 |
| 14 | **Ruas e terreno sem declive credível**: o relevo é suave demais; o Rheinsprung, rua em subida forte, aparece quase plano e sem degraus (inclinação não medida) | `rheinsprung` | swissALTI3D reamostrado a 5 m | 15 |
| 15 | **Cor homogênea**: todos os prédios variam pouco de tom (bege, rosado), sem a diversidade de reboco, pedra vermelha e enxaimel de Basel | todas | paleta de poucas cores por época | 12, 11 |

Referência de cor e textura mais direta: a ortofoto da tarefa 11 (swissIMAGE) pode ser aplicada ao chão e aos telhados.

### Rodada estética de 2026-11-18 (`estetica-antes*/` → `estetica-depois*/`)

As 6 câmeras de dia (15:00), ao poente (`hora=21`) e à noite (`noite=1`), mais `ponte.png` (Mittlere Brücke de perto: alvo
[30, 5, −191], dist 70, az 200, polar 70), `alta1.png`/`alta3.png` (vistas altas de 800–900 m) e `cima-marktplatz.png`
(de cima, perto da Marktplatz). O "antes" é o commit `982e29d`.

Corrigido:

| o que se via | causa | correção |
|---|---|---|
| **Prédios "de papel"**: vistos de cima, só paredes com janelas, sem telhado; chaminés e trapeiras boiando sobre a ortofoto do chão | 1.889 dos 1.892 sólidos do swissBUILDINGS3D chegam do avesso (volume assinado negativo: z = −norte espelha o LV95). Com FrontSide o three cortava as faces de fora; de cima o telhado sumia e se viam as paredes internas do lado oposto | `cidade.js` desvira cada sólido do avesso ao decodificar (troca o 2º e o 3º vértice). Afetava 1.738 dos 1.739 prédios (EGID únicos). O raio do clique agora acerta a face de fora |
| Ponte: **piso de tábuas** sob os arcos | o pé do bloco extrudado da Mittlere Brücke ficava em 0,8 m, exatamente no nível do Reno (0,8 m): a laje de 10 cm sob os furos boiava rente à água com a textura de pedra | `marcos.js`: pé a −2,2 m, enterrado no leito; quebra-mares descem até lá |
| Ponte: **faixa creme na altura da água** | a calçada de montante do OSM tem as pontas na beira do cais, onde o relevo já caiu para 2,2 e 3,6 m; a faixa reta entre as pontas corria rente à água (e a gente andava nela) | `chao.js` exporta `cotaPonta()`: a ponta vale o maior entre ela e o chão 2 m para fora. Usada nas faixas (`cidade.js`), trilhos (`chao.js`), gente e bondes (`vida.js`), tabuleiro (`marcos.js`) e pilares genéricos (`agua.js`) |
| Ponte: **bolha branca no tabuleiro** | os pilares genéricos de `reno.json` (um a cada ~32 m, octógonos de `agua.js`) caíam no meio dos vãos da Mittlere Brücke e o topo deles furava a pista | na Mittlere, `agua.js` troca esses pilares pelos de `marcos.js` (só para a espuma, sem geometria); a espuma agora envolve os pilares de verdade |
| Postes da ponte em pé dentro do rio | os postes do OSM ficam a ±10 m do eixo (no parapeito) e pegavam a altura do leito; a ponte tinha 12 m de largura e as calçadas (±7 m) ficavam fora dela | ponte com 20 m, topo do bloco no nível do tabuleiro; `detalhes.js` põe os postes no parapeito (`MARC.cotaPonte`) |
| Pista da ponte em faixas creme cor de papel | cores `#c6b48c`/`#d2c39f` | asfalto `#57534e` e calçada de granito `#9a948a` (MeshStandard) |
| Muros de cais: grade creme clara, perfeitamente regular, ao longo do rio inteiro | textura de 2 blocos com `Math.random` em tons 185–210 | arenito vermelho-acinzentado com tom por bloco e blocos trocados, sorteio com semente, e faixa molhada escura junto à linha d'água (shader pela altura no mundo) |
| Telhados com a ortofoto em sombra azul-arroxeada e verde de copa vizinha | a swissIMAGE não é ortho verdadeira: o telhado inclinado pega a sombra e o pátio ao lado | `ortofoto.js`: sombra da foto sem o azul, verde de árvore vira cinza quente, águas inclinadas puxadas 50% para a cor de telha (com a luz da foto); telhado plano fica com a foto |
| Reno com anéis e moiré regulares | as ondas curtas só sumiam pela distância; rasante o pixel se estica | as ondas somem pelo tamanho do pixel em tela (`fwidth`) |
| Manchas cinzentas chapadas boiando no horizonte (pfalz, munster) | gramados do OSM fora do recorte do relevo, onde `altura()` devolve 0 | `arvores.js` descarta os triângulos fora do relevo (`CH.dentro`) |
| Vista alta lavada em branco: a cidade do outro lado do recorte leitosa, fundo cinza chapado (#e8e8ea), rastro de sol na água | névoa fixa de 900–2600 m; Preetham abaixo do horizonte quase branco; brilho do sol (disco ×28 + halo) sem teto | névoa que cresce com a distância da câmera; céu abaixo do horizonte escurecido para uma bruma verde-acinzentada; brilho do sol menor e limitado, horizonte refletido a 80% |
| Fachadas quase brancas (#f6efe0, #faf4e8…) que o ACES estourava | paleta de reboco clara demais | ocres, rosados, cinzas e areias, alguns tons mais fortes |

Medição (MacBook M4, Chromium 159 headless, ANGLE/Metal, 1280×720, `http.server` sem gzip):
- **fps**: os dois `medicao.json` desta rodada saíram em momentos diferentes da máquina (44 → 31 fps em todas as câmeras), e
  isso é carga/temperatura, não o código: em A/B intercalado no mesmo navegador e minuto (sem vsync), antigo → novo:
  pfalz 28,2 → 30,6; munster 29,2 → 32,0; marktplatz 27,9 → 32,0; reno 27,0 → 30,2; pfalz `leve=1` 132 → 140.
  O novo é ~10% mais rápido (com o giro certo, o corte de faces de trás funciona). Diferença de ±3 fps é ruído.
- **peso**: `docs/data` não mudou; os JS alterados somam +4,2 KB em gzip (79,3 → 83,6 KB). A abertura continua ~2,69 MB.

Ainda denuncia o "falso" (aberto):
- **Céu acima do horizonte quase branco**: o Preetham perto do horizonte sai neutro (234, 235, 236) e o ACES o estoura; baixar
  turbidez ou ganho mudou pouco e mexe no poente e na noite (testado e revertido). Precisa de um céu com degradê próprio ou nuvens.
- 363 triângulos de parede em 172 sólidos ainda têm o giro trocado em relação aos vizinhos (nenhum de telhado); o conserto por
  propagação (BFS de arestas) custa ~80 ms na abertura e ficou de fora.
- 15 sólidos sem tampa (cascas de parede, ex.: Kornhausgasse 18, Greifengasse 9, Webergasse 3); todos têm irmãos do mesmo
  EGID e, vistos de cima, não abrem buraco.
- A ortofoto continua deitada nos telhados (o vizinho e o pátio aparecem no telhado); só a cor foi corrigida.
- Muro de cais de perto ainda parece tijolo (blocos de 2,5 × 0,5 m com junta escura); falta o coroamento de pedra.
- Paredes de reboco ainda lisas de perto (`rheinsprung`); telha em relevo ainda risca em listras na média distância.
- A largura e o número de arcos da Mittlere Brücke (20 m, 6 arcos) são estimativa pelo OSM; não conferi na planta.


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
