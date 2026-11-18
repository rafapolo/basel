# 14 · O Reno de verdade

> Aberta em 2026-11-05.

Hoje a água é "relevo abaixo de 246,3 m": a margem sai serrilhada (grade de 5 m) e o rio é um plano fosco.

- **Contorno:** polígono de água do swissTLM3D (swisstopo, OGD) ou do OSM (`natural=water` + `water=river`, relação do
  Reno recortada); nível da água do relevo ou da estação de Basel-Rheinhalle.
- **Superfície:** shader de água com reflexo dos prédios (`Water` do three.js ou reflexo em espaço de tela), ondinhas
  andando rio abaixo (para noroeste), espuma nos pilares das pontes e nas margens.
- **Cor e temperatura reais** dos dados abertos (data.bs.ch `100046`, turbidez `100323`), ligando com a antiga tarefa 09.
- Muros de cais e escadas da margem (Rheinweg, Pfalz) como geometria.
