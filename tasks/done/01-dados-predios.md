# 01 · Pipeline de dados dos prédios

> Aberta em 2026-11-05. Base de tudo: um arquivo por prédio com geometria 3D e ano de construção.

## Passos

1. Baixar os blocos do swissBUILDINGS3D 3.0 que cobrem Basel-Stadt (Basel, Riehen, Bettingen)
   via STAC (`bbox=7.55,47.54,7.70,47.60`). Preferir o `.gdb.zip` (FileGDB, lê com GDAL/pyogrio).
2. Recortar pelo limite do cantão e simplificar telhados para web (LOD2 → malha leve).
3. Juntar com o GWR (`100230` do data.bs.ch, ou `geodienste`/housing-stat) por `EGID`, ou por
   ponto-no-polígono quando o EGID faltar.
4. Ano: usar `gbauj`; sem ele, sorteio estável dentro da faixa de `gbaup` (códigos 8011 = antes de
   1919, 8012 = 1919–45, …, 8015 = 1971–80; conferir a tabela no catálogo do GWR).
5. Exportar em tiles (3D Tiles ou glTF por quadrante + JSON de atributos) em WGS84/ENU local.

## Atenção

- Tem prédio com várias entradas no GWR (`Rittergasse 7`, `7.1`, `7.2` com anos diferentes); decidir
  regra (mais antigo? de maior área?).
- Polars para o processamento tabular (regra do usuário), GDAL/pyogrio para geometria.
- Medir: nº de prédios, % com `gbauj`, % casados com o 3D.

## Feito (2026-11-05)

`script/baixa.sh` baixa as fontes; `script/predios.py` (rodar com `uv run --with polars --with shapely --with pyproj --with numpy script/predios.py`).
Por enquanto só o recorte da Altstadt (LV95 2610800–2611900 × 1266950–1268100, posicionado pelas entradas do GWR),
dos blocos `1047-34` e `1047-43` da edição 2024; Basel-Stadt inteiro fica para depois.

- Sólidos 3D no recorte: **1.892**, que são **1.739 prédios** (o swissBUILDINGS3D parte prédios em peças com o mesmo EGID: o Museum der Kulturen são 8). Sólidos que saem mais de 60 m do recorte ficam de fora: estouravam o Int16.
- Prédios com ano exato: **1.637 de 1.739 (94,1%)**. Os números abaixo são por sólido.
- Casados com o GWR: **94,5%** por EGID, mais 2 por ponto dentro da pegada; **5,4%** sem GWR (aparecem em cinza, "sem ano").
- Com `gbauj`: **94,6%**; nenhum precisou do sorteio pela época (`gbaup`), que fica no código para o resto do cantão.
  A tabela de épocas daqui estava incompleta: o GWR vai de 8011 (antes de 1919) a 8023 (depois de 2015); o script lê `gbaup_decoded`.
- **Regra para várias entradas do GWR no mesmo sólido: vale o ano mais antigo.** Só entram prédios "bestehend" e "im Bau".
- Os demolidos ("abgebrochen") com `gabbj` no recorte (45) vão para `predios.json` como pinos da máquina do tempo.
- Saída: `docs/data/predios.bin` (5,9 MB: Int16 x,y,z em 1/50 m + Uint16 id), `predios.json` (atributos), `relevo.bin`
  (swissALTI3D 2 m reamostrado a 5 m), `ruas.json` (OSM: ruas, trilhos, muralha, fontanários). Em vez de 3D Tiles, um binário
  só, porque o recorte cabe inteiro.
