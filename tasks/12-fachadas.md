# 12 · Fachadas: janelas, andares, pedra e reboco

> Aberta em 2026-11-05.

O swissBUILDINGS3D é LOD2: paredes lisas. As fachadas podem ser geradas no shader, sem textura baixada.

- UV de parede: comprimento ao longo da parede × altura (calcular no `predios.py` ou no cliente).
- Andares a partir do `gastw` do GWR (altura da parede ÷ andares), janelas em grade com ritmo por prédio, térreo com
  portas e vitrines nas ruas comerciais (OSM `shop=*` no térreo, ou `gklas` de comércio).
- Material por época e uso: reboco claro nas casas, arenito vermelho nas igrejas e prédios públicos antigos
  (Münster, Rathaus: conferir quais), concreto e vidro depois de 1950; persianas verdes/cinzas sorteadas.
- Telhado: telha com normal map procedural, cumeeira, chaminés e trapeiras pequenas nos telhados íngremes.
- Base: soco de pedra nos prédios antigos.
- Noite: reaproveitar a grade de janelas que já existe no shader.
