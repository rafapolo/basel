# 15 · Relevo fino, ruas e calçadas

> Aberta em 2026-11-05.

- Relevo swissALTI3D de 0,5 m (já baixável no STAC, mesmos blocos) no lugar do de 5 m, simplificado por erro (malha
  adaptativa) para não pesar.
- Ruas como **áreas**, não faixas de largura fixa: OSM `area:highway` onde houver, senão swissTLM3D (largura real) ou
  o espaço entre as pegadas dos prédios.
- Calçada com meio-fio, paralelepípedo nas ruas da Altstadt (zonas de pedestres `100251`), asfalto fora; marcas de faixa.
- Trilhos de bonde como dois trilhos de verdade (bitola métrica, 1 m) com o fio aéreo e os postes.
- Conferir prédios flutuando ou afundados onde o relevo de 5 m não bate com a base do swissBUILDINGS3D.
