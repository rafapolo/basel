# 20 · Cidade inteira e peso

> Aberta em 2026-11-05.

O realismo das tarefas 11–19 só cabe se o carregamento for por partes.

- Basel-Stadt inteiro (Basel, Riehen, Bettingen) em tiles com nível de detalhe: 3D Tiles 1.1 / glTF com meshopt ou Draco,
  texturas KTX2.
- Alternativa a testar: o tileset da própria swisstopo (`https://3d.geo.admin.ch/ch.swisstopo.swissbuildings3d.3d/v1/tileset.json`
  responde 200; conferir licença, se tem textura e se dá para juntar com o ano do GWR).
- Compressão no servidor (brotli), service worker como no geoglifos.
- Orçamento: abrir em < 3 MB, 60 fps num notebook, 30 fps num celular médio.
