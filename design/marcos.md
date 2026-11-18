# Marcos em alta definição (tarefa 18)

Código: `docs/marcos.js` (ganchos em `docs/cidade.js`: `criarMarcos`, `esconde`, `atualiza`, `acerta`).

| Marco | EGID / sólidos (predios.json) | Como foi feito |
|---|---|---|
| Münster | 243009807 / 1872 | reconstruído do zero: nave, naves laterais, cruzeiro, coro, abside, Kreuzgang, duas torres de 68,5 m, rosácea; telhado vidrado em losangos (envMap só nele) |
| Rathaus | 440080 / 1734 | triângulos do LOD2 recapeados com parede vermelha pintada e telha; torre nova com relógio |
| St. Martin | 243009202 / 1535, 1536 | LOD2 recapeado em arenito; torre com tambor e flecha |
| St. Peter | 243010854 / 504, 505 | idem |
| St. Leonhard | 243008474 / 807 | idem |
| Mittlere Brücke | sem EGID (OSM way `Mittlere Rheinbrücke`) | 6 arcos de segmento extrudados no eixo da ponte, parapeitos, quebra-mares e Käppelijoch |

Fontes e licenças: nenhum modelo ou textura externa. Plantas e alturas vêm do swissBUILDINGS3D (swisstopo, OGD) e o eixo
da ponte do OSM (© OpenStreetMap contributors, ODbL), ambos já usados no projeto; geometria e texturas (canvas) são procedurais, próprias.

Limites: nº de arcos e posição do Käppelijoch são aproximados; Spalentor fora do recorte; sem janelas acesas à noite nos marcos;
fora do ano de construção o marco some (sem o lote pálido). Münster e Rathaus já caíam em arenito (`mat` = 1): `predios.py` não mudou.
