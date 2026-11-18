# 03 · Máquina do tempo

> Aberta em 2026-11-05.

- Controle de ano (1100 → 2026): esconde prédios com ano > selecionado.
- Lotes dentro da antiga muralha onde o prédio de hoje é mais novo aparecem pálidos (já havia
  construção lá). Precisa do traçado da muralha (OSM `historic=citywalls` ou mapa histórico).
- Cor por época como camada alternativa.
- Deixar claro na interface: prédios demolidos não estão nos dados.

## Feito (2026-11-05)

Régua 1100 → 2026 não linear (1100–1500, 1500–1800, 1800–1900 e 1900–2026 com espaço parecido), `?ano=` no endereço.
No shader: cada prédio cresce nos 12 anos antes do ano de construção; antes disso vira **lote pálido** de 1,5 m (chave
"lotes pálidos"). Em vez de só os lotes dentro da muralha, todos os lotes cujo prédio é mais novo ficam pálidos: o recorte
é quase todo intramuros, e o OSM só tem dois trechos de `historic=citywalls` aqui (desenhados como muro de 5 m).
Cor por época (6 faixas + sem ano) como chave. A nota do painel diz que os demolidos não estão no 3D; os 45 que o GWR lista
como demolidos aparecem como pinos vermelhos entre o ano de construção e o de demolição.
