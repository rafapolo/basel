# 02 · Protótipo 3D da Altstadt

> Aberta em 2026-11-05. Depende de 01 (pode começar só com a Grossbasel antiga).

- Página web estática com three.js (ou deck.gl), câmera orbital, sombras, dia/noite simples.
- Recorte inicial: Grossbasel entre Münster, Marktplatz, Spalenberg e a margem do Reno, e a
  outra margem em Kleinbasel para ter a vista do rio.
- Câmera inicial na Pfalz, atrás do Münster, olhando o Reno (eco da vista de Merian, 1615).
- Clique num prédio → endereço, ano, andares, apartamentos (GWR).
- Reno, pontes e ruas do OSM como chão.
- Meta de peso: < 10 MB para o recorte, 60 fps num notebook.

## Feito (2026-11-05)

`docs/index.html` + `docs/cidade.js` (three.js 0.170 por importmap). Relevo do swissALTI3D, o Reno onde o relevo fica abaixo
de 246,3 m, ruas/bondes/pontes do OSM como faixas sobre o relevo, sombras, dia e noite (janelas acesas no shader),
clique → ficha (endereço, ano, época, andares, apartamentos, altura, uso, proteção, link do EGID no map.geo.admin.ch).
Interface em português, inglês e alemão (`docs/i18n.js`, seletor PT/EN/DE ou `?lang=`).
A vista inicial (e a do começo e do fim do tour) fica acima e além do Münster, olhando rio abaixo para a Mittlere Brücke, com a
Grossbasel à esquerda; o Münster mesmo fica fora do quadro, então ainda não é a vista de Merian.
Peso: 5,9 MB de prédios + 0,5 MB do resto, sem compressão. Medido no terminal-browser (Chromium) num Mac, girando a câmera: 120 fps.
