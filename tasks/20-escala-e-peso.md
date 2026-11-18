# 20 · Cidade inteira e peso

> Aberta em 2026-11-05.

O realismo das tarefas 11–19 só cabe se o carregamento for por partes.

- Basel-Stadt inteiro (Basel, Riehen, Bettingen) em tiles com nível de detalhe: 3D Tiles 1.1 / glTF com meshopt ou Draco,
  texturas KTX2.
- Alternativa a testar: o tileset da própria swisstopo (`https://3d.geo.admin.ch/ch.swisstopo.swissbuildings3d.3d/v1/tileset.json`
  responde 200; conferir licença, se tem textura e se dá para juntar com o ano do GWR).
- Compressão no servidor (brotli), service worker como no geoglifos.
- Orçamento: abrir em < 3 MB, 60 fps num notebook, 30 fps num celular médio.

## Feito em 2026-11-18 (bugs e peso; a cidade inteira continua aberta)

- **Malhas compactas** (`script/compacta.py`, decodificador `docs/compacta.js`): `predios.v2.bin` (vértices únicos +
  índice "marca d'água", deltas em zigzag em planos de bytes) e `terreno.v2.bin` no mesmo formato. Com o gzip do Pages:
  prédios 1,46 → 1,0 MB, terreno 1,31 → 0,73 MB. A sopa de triângulos dos prédios volta idêntica byte a byte (conferido
  em Python e no navegador); o terreno tem os mesmos triângulos, em outra ordem de vértices. Decodificar: ~10 ms cada.
- **Máscaras das ruas em WebP sem perdas** (`ruas_a.webp`, `ruas_b.webp`): 784 → 403 KB, pixels idênticos.
- Os geradores (`predios.py`, `chao.py`, `detalhes.py`) já leem e gravam o formato novo.
- **Prisma no Reno**: era o sólido 949 do swissBUILDINGS3D, a Käppelijoch (sem registro no GWR); o pé `dz` do relevo
  fino o afundava 9,35 m, porque o chão sob a ponte é o leito do rio. Agora `marcos.js` o esconde e a capela própria
  dele fica na posição do sólido (meio da ponte, s = 89,5 m).
- **Monte no Marktplatz**: não é bug do relevo. Ali o relevo real sobe de 9 para 25 m (encosta do Münsterhügel atrás da
  Rathaus), com a ortofoto dos telhados por cima. Hipótese, não verificada: aparecia pelas arcadas da Rathaus do LOD2.
  Hoje a Rathaus da tarefa 18 o cobre; conferido do alto e do nível da rua.
- **Peso medido no Pages ao vivo** (2026-11-18, carga fria): abertura 2,69 MB (antes ~3,9 MB), mais 1,97 MB das 16 tiles
  da ortofoto em segundo plano; total 4,67 MB (antes 6,01 MB). Sem erros nem 404.

Achados na ponte (vistos de perto) — **corrigidos em 2026-11-18** (rodada estética, detalhes em
`design/comparacao/README.md`):
- piso de tábuas sob os arcos: o pé do bloco da Mittlere Brücke (`marcos.js`) estava a 0,8 m, no nível do Reno; agora a −2,2 m;
- faixa creme na altura da água: a calçada de montante do OSM começava na beira do cais (2,2 m); `cotaPonta()` em `chao.js`
  sobe as pontas de toda ponte ao nível da rua (faixas, trilhos, gente, bondes, tabuleiro, pilares);
- bolha branca no tabuleiro: topo dos pilares genéricos de `reno.json` (`agua.js`) no meio dos vãos; na Mittlere eles dão
  lugar aos pilares de `marcos.js` (só espuma). Também: ponte com 20 m (as calçadas e os postes do OSM ficavam fora dela)
  e postes no parapeito em vez de dentro do rio.

Também na mesma rodada: 1.889 dos 1.892 sólidos (1.738 prédios) chegavam do avesso e perdiam o telhado vistos de cima
(`cidade.js` os desvira); névoa que acompanha a câmera e céu abaixo do horizonte menos branco (vista alta lavada).
Peso: `docs/data` igual, JS +4,2 KB em gzip. fps: em A/B intercalado, ~10% mais rápido que antes (pfalz 28,2 → 30,6 sem vsync).
Abertos: 363 triângulos de parede (172 sólidos) com giro trocado em relação aos vizinhos; 15 sólidos-casca sem tampa
(cobertos pelos irmãos do mesmo EGID).

Pendente: Basel-Stadt inteiro em tiles, KTX2, service worker, metas de fps.
