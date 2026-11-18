# 09 · Outros dados ao vivo (data.bs.ch)

> **Arquivada sem ser feita** (2026-11-05): o foco passou a ser deixar a cidade mais real (tarefas 11 em diante). Pode voltar à raiz quando for retomada.

> Aberta em 2026-11-05. Todos abertos, sem chave, API Opendatasoft v2.1.

| Dataset | ID | Uso no jogo | Testado |
|---|---|---|---|
| Ocupação atual dos estacionamentos | `100088` | cor/ícone sobre os 16 Parkhäuser, carros entrando | ✅ atualiza a cada ~5 min (Parkhaus City: 976/1114 livres) |
| Entradas e saídas dos estacionamentos | `100198` | ritmo do trânsito de carros | — |
| Medições contínuas do Reno | `100046` | temperatura da água (gente nadando no verão), cor da água | ✅ 443 mil registros a cada 15 min, mas o último visto era de maio/2026; conferir atraso |
| Previsão do Reno: nível e vazão | `100271` | enchente "real" quando o nível sobe | — |
| Turbidez do Reno | `100323` | cor da água | — |
| Estação meteorológica Rosental | `100294` | chuva, vento, temperatura → clima do jogo | — |
| Qualidade do ar Binningen / Smart Climate | `100051`, `100009` | névoa, camada de poluição | — |
| Poeira fina medida nos bondes | `100113` | bondes "farejando" o ar pela rede | — |

Alternativa para clima: MeteoSwiss OGD (estação Basel-Binningen), se a de Rosental atrasar.
