# 11 · Ortofoto no chão e nos telhados

> Aberta em 2026-11-05. Sondado no mesmo dia.

Hoje o chão é cor lisa e os telhados são sorteados. A foto aérea dá a cor real das duas coisas.

- **Fonte:** swissIMAGE 10 cm (swisstopo, OGD), STAC `ch.swisstopo.swissimage-dop10`; edição 2024 existe para os
  blocos do recorte (`swissimage-dop10_2024_2611-1267_0.1_2056.tif`, também 2610/2611 × 1266/1267/1268; há versão de 2 m).
- Recortar no mesmo retângulo LV95 do `script/predios.py` e reamostrar: 10 cm dá 11.000 × 11.500 px, pesado demais;
  começar com 25 cm (~4.400 × 4.600) em tiles WebP/KTX2 de 1.024 px.
- **Chão:** textura no relevo (UV = x, z do recorte).
- **Telhados:** projetar a mesma foto de cima (UV planar) nos triângulos com normal para cima; as paredes ficam de fora (a foto
  não vê fachada). Cuidado com o deslocamento de telhados altos na ortofoto (ela é "true ortho"? conferir na doc da swisstopo).
- Sombra: a foto já tem sombra pintada; escolher um horário de sol parecido com o do voo ou clarear as sombras da foto.
- Medir o peso e o tempo de abertura antes e depois.
