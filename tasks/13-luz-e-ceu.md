# 13 · Luz, céu e câmera

> Aberta em 2026-11-05.

- **Sol real:** posição do sol para Basel (47,557 N, 7,59 E) na data e hora escolhidas (fórmula do SunCalc), com controle
  de hora do dia; a noite atual vira o fim do mesmo ciclo.
- **Céu físico:** `Sky` do three.js (Preetham) ou céu pré-calculado, com a cor da névoa vindo do céu.
- **Tone mapping** ACES/AgX, sRGB certo, exposição automática suave.
- **Oclusão de ambiente** (GTAO/SAO) nas ruas estreitas e nos cantos; **bloom** só de noite (janelas, postes).
- **Sombras em cascata** (CSM) para ter sombra nítida de perto e ainda cobrir o recorte inteiro.
- Opcional: profundidade de campo fraca (tilt-shift) só no tour.
- Medir fps antes e depois de cada passo (hoje: 120 fps no terminal-browser) e ter um modo "leve" para celular.
