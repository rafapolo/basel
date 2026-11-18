# 08 · Bondes e ônibus ao vivo

> **Arquivada sem ser feita** (2026-11-05): o foco passou a ser deixar a cidade mais real (tarefas 11 em diante). Pode voltar à raiz quando for retomada.

> Aberta em 2026-11-05. Sondado no mesmo dia.

**Não existe feed público de posição GPS dos veículos da BVB/BLT.** O que existe é horário + atraso
em tempo real, então a posição é **interpolada**: cada veículo anda sobre o traçado da linha
entre a parada anterior e a próxima, segundo o horário corrigido pelo atraso. É o que fazem os
mapas de trem ao vivo da Suíça.

## Fontes

| Fonte | Acesso | O que dá |
|---|---|---|
| GTFS estático (opentransportdata.swiss) | download livre | linhas, paradas, viagens, `shapes` de todo o país; filtrar operadores BVB e BLT |
| GTFS-RT `api.opentransportdata.swiss/la/gtfs-rt` | **chave grátis** (respondeu 401 sem chave em 05/11) | TripUpdates: atraso por viagem/parada, cancelamentos |
| `transport.opendata.ch/v1/stationboard` | sem chave | partidas com atraso por parada (testado: Barfüsserplatz, T14 +1 min, T8 +4 min); bom para protótipo, ruim para a rede inteira (rate limit) |
| data.bs.ch `100064` / `100063` / `100065` | livre | liniennetz, paradas e plataformas do cantão (geometria para desenhar trilhos) |
| data.bs.ch `100075` | livre | Fahrgastzahlen BVB: lotação por linha/parada, para dar "gente dentro" do bonde |

## Passos

1. Pedir a chave do GTFS-RT em opentransportdata.swiss (**ação do Rafael**).
2. Script que baixa o GTFS, filtra Basel e gera, por viagem, a sequência de tempos e o traçado.
3. No cliente: a cada frame, posição = interpolação no shape pelo horário + atraso do RT
   (polling a cada 30 s por um proxy pequeno, por causa da chave e do CORS).
4. Modelos: bonde verde BVB (Flexity/Combino), amarelo BLT, ônibus; fora do horário, sem veículo.
5. Modo "seguir bonde" ligado à tarefa 07.
