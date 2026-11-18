# Tarefas do Basel

Rodada 2: deixar a cidade mais real. As tarefas 01–10 estão em [`done/`](done/): 01–03 feitas, 04–10 arquivadas sem fazer.

| # | Tarefa | Depende de | Estado |
|---|---|---|---|
| 11 | [Ortofoto no chão e nos telhados](done/11-ortofoto.md) | — | feita em 2026-11-18 (`script/ortofoto.py`, `docs/ortofoto.js`) |
| 12 | [Fachadas: janelas, andares, pedra e reboco](done/12-fachadas.md) | — | feita em 2026-11-18 (`docs/fachadas.js`) |
| 13 | [Luz, céu e câmera](done/13-luz-e-ceu.md) | — | feita em 2026-11-18 (`docs/ceu.js`, `?hora=`, `?leve=1`) |
| 14 | [O Reno de verdade](14-reno.md) | 13 | aberta |
| 15 | [Relevo fino, ruas e calçadas](done/15-chao-e-ruas.md) | 11 | feita em 2026-11-18 (`docs/chao.js`, `script/chao.py`; sem `area:highway` nem swissTLM3D, Overpass fora do ar) |
| 16 | [Árvores e verde](16-arvores.md) | 13 | aberta |
| 17 | [Detalhes de rua](17-detalhes-urbanos.md) | 15 | aberta |
| 18 | [Marcos em alta definição](18-marcos.md) | 12 | aberta |
| 19 | [Gente e movimento](19-vida.md) | 15 | aberta |
| 20 | [Cidade inteira e peso](20-escala-e-peso.md) | 11, 12 | aberta |
| 21 | [Comparar com a cidade real](done/21-referencia-visual.md) | — | feita em 2026-11-18 (`?cam=`, `script/capturas.py`, `design/comparacao/`) |

Sugestão de ordem: 21 (capturas do "antes") → 13 → 11 → 12 → 14 → 15 → 16 → 18 → 17 → 19 → 20.

Arquivos na raiz = abertas; ao terminar, mover para `done/`.

## Arquivo

| # | Tarefa | Estado |
|---|---|---|
| 01 | [Pipeline de dados dos prédios](done/01-dados-predios.md) | feita (só a Altstadt) |
| 02 | [Protótipo 3D da Altstadt](done/02-prototipo-altstadt.md) | feita |
| 03 | [Máquina do tempo](done/03-maquina-do-tempo.md) | feita |
| 04 | [Simulação de cidade](done/04-simulacao.md) | arquivada |
| 05 | [Desastres históricos](done/05-desastres.md) | arquivada |
| 06 | [Temas e festas de Basel](done/06-temas-festas.md) | arquivada (idiomas PT/EN/DE feitos; música da Fasnacht só no tour) |
| 07 | [Primeira pessoa: bicicleta, bonde e balsa](done/07-primeira-pessoa.md) | arquivada |
| 08 | [Bondes e ônibus ao vivo](done/08-transporte-ao-vivo.md) | arquivada (precisa de chave do GTFS-RT) |
| 09 | [Outros dados ao vivo](done/09-dados-ao-vivo.md) | arquivada |
| 10 | [Outros datasets estáticos](done/10-outros-datasets.md) | arquivada |
