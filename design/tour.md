# Tour: o roteiro

O tour é um passeio de câmera de 1 minuto pela Altstadt de Basel, no estilo de cinema. Abre pelo botão **Tour de 1 min** no topo ou por `?tour=1`, que mostra um convite (**Começar o tour**) sobre a cidade: o clique começa o tour e libera o som, que o navegador não toca sem um gesto. `?tour=en` e `?tour=de` fazem o mesmo em inglês e em alemão. **Esc** ou **✕ esc** param o tour no meio: a câmera fica onde estava e a cidade volta ao ano, à cor e à hora de antes. Visto até o fim, o tour termina de noite, na vista do Reno.

A estrutura (faixas, legenda, câmera que toca a música) vem do tour do [geoglifos-amazonia](../../geoglifos-amazonia/design/tour.md); o som e o roteiro são de Basel. As cenas ficam em `cenas()`, em `docs/tour.js`; a música em `docs/som.js`.

## Regras gerais

- **Quadro.** Faixas pretas 2.39:1 (até 16% da tela cada), linha fina de progresso na borda de baixo, tempo restante acima dela, à direita. Painel, botões e ficha somem.
- **Texto.** Rótulo pequeno (*kicker*) em cima e a frase, sobre um degradê escuro para ler em cima da cidade clara.
- **Idiomas.** Português, inglês e alemão (`t('pt', 'en', 'de')`); o idioma vem do endereço (`?lang=en|de`, `?tour=en|de`) ou do seletor PT/EN/DE no topo. Números no formato de cada língua (`1.790`, `1,790`, `1'790`).
- **Números.** Todos contados no navegador a partir dos dados (`cidade.estat`), por prédio (EGID), não por sólido 3D: o swissBUILDINGS3D parte um prédio em várias peças. O único fato que não vem dos dados é a construção do Rathaus entre 1504 e 1514 (conferido em 2026-11-05 na página do cantão, [bs.ch/rathaus](https://www.bs.ch/rathaus), e na [Wikipedia](https://en.wikipedia.org/wiki/Basel_Town_Hall)).
- **Câmera.** Alvo, distância, rumo e inclinação mudam juntos com aceleração suave (`mover`); `arco` faz a câmera ganhar altura no meio de um voo; `giro` dá voltas de mais de 180°.
- **Movimento reduzido.** Com `prefers-reduced-motion`, a câmera corta de plano em plano.

## As cenas

| # | cena | duração | cidade | câmera |
|---|---|---|---|---|
| 0 | Abertura | 9 s | 2026, gravura, dia | do alto (1,9 km, quase a pino) girando −80° até a vista do Reno com a Mittlere Brücke |
| 1 | Münster | 10 s | — | voa até o Münster (210 m, 64°) e dá 110° de volta |
| 2 | Máquina do tempo | 15 s | 1100 → 2026, lotes pálidos | recua a 900 m (54°) e gira 50°; aos 3 s os anos correm por 10,5 s, rápido nos séculos vazios e devagar no XIX; o ano aparece grande no canto |
| 3 | Cor por época | 10 s | cores por época | desce até o Reno (330 m, 70°) e corre rio abaixo até a ponte |
| 4 | Rathaus | 8 s | gravura | voa até a Marktplatz (280 m, 55°) e gira 70° |
| 5 | Noite | 8 s | a noite cai, janelas acendem | volta à vista do Reno |

## As legendas

| # | português | inglês | alemão |
|---|---|---|---|
| 0 | Basel · Altstadt — {1.739} prédios, um por um: a forma vem da swisstopo e o ano de cada um, do registro federal de prédios. | {1,739} buildings, one by one: the shape from swisstopo, and each one’s year from the federal building register. | {1'739} Häuser, eines nach dem anderen: die Form von swisstopo, das Baujahr aus dem eidgenössischen Gebäuderegister. |
| 1 | Münster · {1100} — O ano mais antigo do registro: {Münster, Niklauskapelle e Bischofshof} constam como de {1100}. | The oldest year in the register: … are listed as built in {1100}. | Das älteste Jahr im Register: … sind mit {1100} eingetragen. |
| 2 | 1100 → 2026 — Cada prédio sobe no ano que o registro lhe dá. Pálidos, os lotes cujo prédio de hoje ainda não existia. | Each building rises in the year the register gives it. Pale: plots whose present building did not exist yet. | Jedes Haus wächst im Jahr, das ihm das Register gibt. Blass: Parzellen, deren heutiges Haus noch nicht stand. |
| 2 | Século XIX — {882} dos {1.637} prédios com ano têm data entre 1800 e 1899 no registro. | {882} of the {1,637} dated buildings carry a year between 1800 and 1899 in the register. | {882} der {1'637} Häuser mit Baujahr tragen im Register ein Jahr zwischen 1800 und 1899. |
| 3 | Cor por época — Do vermelho-escuro dos {91} anteriores a 1500 ao azul dos {27} deste século. | From the dark red of the {91} built before 1500 to the blue of the {27} from this century. | Vom Dunkelrot der {91} Häuser vor 1500 bis zum Blau der {27} aus diesem Jahrhundert. |
| 4 | Rathaus · Marktplatz — O registro dá {1871} à prefeitura, construída entre 1504 e 1514: o ano do GWR nem sempre é o da primeira pedra. | The register gives the town hall {1871}, though it was built in 1504–1514: the GWR year is not always that of the first stone. | Das Register gibt dem Rathaus {1871}, gebaut wurde es 1504–1514: Das GWR-Jahr ist nicht immer das des Grundsteins. |
| 5 | Basel · dados abertos — swisstopo, o registro federal de prédios via data.bs.ch e o OpenStreetMap. Clique em qualquer prédio. | swisstopo, the federal building register via data.bs.ch, and OpenStreetMap. Click any building. | swisstopo, das eidgenössische Gebäuderegister via data.bs.ch und OpenStreetMap. Klicken Sie auf ein Haus. |

## Som

Música feita no navegador com Web Audio, sem arquivo, só durante o tour. Inspira-se na Fasnacht de Basel: **pífaro** (Piccolo) em frases de marcha, **tambor de Basel** com rufos, apojaturas e o "Ruf" que abre as marchas, e **sinos** de igreja como bordão. Pentatônica de sol maior (sol, lá, si, ré, mi), marcha em 2/4 a 104 bpm. As frases e os golpes são sorteados a cada execução. O botão **♪** liga e desliga (`localStorage` `basel-som`). Com `?som=debug`, `window.som` expõe o motor: `som.pico()` mede a saída, `som.sino()` e `som.ruf()` tocam um sino e um chamado.

### A câmera toca a música

| câmera | som | valores |
|---|---|---|
| distância | brilho do bordão (passa-baixas) | 250 + perto × 1.800 Hz; perto = 0 a 2 km, 1 a 40 m (escala logarítmica) |
| distância | pífaro mais agudo, mais notas e mais apojaturas de perto | 4 a 9 notas; apojatura 20% → 55% |
| distância | sino grave a cada quatro compassos, só de longe | perto < 0,35 |
| inclinação | quanto vai para o eco da sala | 0,18 + polar / 90° × 0,4 |
| rumo | posição esquerda/direita do bordão e do pífaro | sen(rumo) × 0,5 (pífaro × 0,45) |
| velocidade | densidade do tambor: parado marca o 1 e o 2, rápido enche as semicolcheias, com rufos curtos no fim do compasso | chance 0,55 + vel nos tempos, vel × 1,3 nas colcheias, vel² × 1,4 nas semicolcheias |
| giro | golpes do tambor abertos para os lados | 0,1 + giro (graus/s) / 50, até 0,7 |
| anos por segundo (cena 2) | rufo contínuo que acompanha a varredura; ao parar, um golpe arrastado | força = anos/s ÷ 120; 10 → 28 golpes/s |

### As camadas

| camada | o que é |
|---|---|
| Bordão | o zumbido de um sino: triângulo duas oitavas abaixo, seno uma oitava abaixo, quinta e uma terça menor fraca, com batimento lento de 0,9 Hz |
| Sino | 8 parciais inarmônicas (0,5, 1, 1,19, 1,5, 2, 2,52, 3,01, 4,1 × a nota), cada uma com sua cauda (0,6 a 6 s), e o golpe do badalo |
| Pífaro | triângulo filtrado, ataque com "língua" (2,5% abaixo), vibrato de 6,2 Hz, sopro agudo; apojaturas de cima (Vorschlag) |
| Tambor | esteira (ruído em banda de 3,2 a 4,4 kHz) + corpo (seno de 240 → 170 Hz); arrastado = golpe fraco 30 ms antes do forte; rufo = mãos alternadas a 22–28 golpes/s |
| Sala | 4 s de cauda, como uma nave de pedra |
| Mestre | passa-altas → compressor → limitador → teto suave (tanh), como no geoglifos |

### Os momentos

| momento | som |
|---|---|
| Tour abre | o bordão entra em ~1 s; o tambor marca os tempos |
| Cada cena nova | o bordão desliza para a nota da cena, um sino bate e, da cena 1 em diante, o tambor chama (Ruf) |
| Cada legenda nova | uma frase do pífaro, se ele não estiver no meio de outra |
| Câmera calma | o pífaro volta sozinho a cada 6 a 10 s |
| Varredura dos anos | o pífaro cala e o rufo segue a velocidade dos anos |
| Tour até o fim | cadência do pífaro descendo ao sol, rufo, golpe arrastado e o sino grave; o som se apaga em ~3,5 s |
| Tour parado no meio | o som some em 0,8 s |

| cena | nota do bordão |
|---|---|
| 0 · Abertura | sol |
| 1 · Münster | ré (abaixo) |
| 2 · Máquina do tempo | lá |
| 3 · Cor por época | ré |
| 4 · Rathaus | dó |
| 5 · Noite | sol |
