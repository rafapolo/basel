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
- **Monte no Marktplatz**: é a encosta real do Münsterhügel atrás da Rathaus (o relevo sobe de 9 para 25 m), com a
  ortofoto dos telhados por cima; aparecia pelas arcadas da Rathaus do LOD2. A Rathaus da tarefa 18 a cobre; conferido
  do alto e do nível da rua.

Pendente: Basel-Stadt inteiro em tiles, KTX2, service worker, metas de fps.
