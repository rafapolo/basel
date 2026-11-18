# Referência de realismo: a simulação do atlas do tocador

Pedido do usuário em 2026-11-18: inspirar cores, luz e realismo dos materiais do Basel na simulação 3D do atlas do
tocador (`~/Projetos/tocador/js/atlas-sim.js`, aberta em `/atlas?sim=1`; vinheta e grão em `assets/atlas.css` ~l. 516).
Ler o código antes de copiar; abaixo, o que vale trazer e onde está.

## Luz (tarefa 13)

- **ACES Filmic** (`r.toneMapping = THREE.ACESFilmicToneMapping`, exposição ~0,95), com cor em sRGB nas texturas
  (`tex.colorSpace = THREE.SRGBColorSpace`). ~l. 721–726.
- **Três luzes com papéis distintos** (~l. 736–756): `HemisphereLight` quente em cima / terra escura embaixo (0,7);
  uma luz principal de lado e alto, sem sombra; uma **contraluz** quente (vinda de trás, 1,8) que é a única com shadow map
  (1024, câmera ortográfica justa, `bias -0.0004`, `normalBias 0.02`, `radius 7`). No Basel: o sol real faz o papel da
  principal com sombra; uma contraluz/céu fraca do lado oposto separa os telhados do fundo.
- **Sombra a cada dois quadros** (`shadowMap.autoUpdate = false`, redesenho a ~30 Hz) para poupar CPU.
- **Céu = esfera por dentro com degradê horizonte → alto** (shader de 2 cores, sem névoa) e **névoa na cor do horizonte**
  (`cena.fog.color.copy(baixo)`), com `near/far` que acompanham a distância da câmera (~l. 1670). Isso casa céu e
  cidade ao longe.
- **Poeira/partículas aditivas** na luz, animadas só no shader (sem custo de CPU). Opcional, só no tour.

## Materiais (tarefa 12 e todas as que criam objetos)

- **`MeshStandardMaterial` com rugosidade alta por padrão** (0,65, metalness 0,05) e um `roughnessMap` de ruído
  procedural (ruído de valor em duas oitavas, 128², repetido, ~l. 110–150): quebra o aspecto de plástico liso.
- **Reflexo de ambiente só no que brilha** (`metalness > 0,5` ou `roughness < 0,35`): um PMREM de 64 px gerado uma
  vez de uma cena de estúdio neutra (`ambienteNeutro()`, ~l. 790). No nível baixo, sem envMap e metal clareado.
  No Basel: vidro, cobre e o telhado vidrado do Münster; reboco e arenito sem envMap.
- **Oclusão falsa pela altura** (`oclusaoPelaAltura`, `onBeforeCompile`): escurece só a luz indireta perto do chão
  (`mix(0.45, 1.0, smoothstep(0, 0.5, altura))`). Barato e sem passe de tela; para ruas estreitas, usar a altura
  acima do relevo local e uma distância maior (alguns metros).
- **Chão gasto procedural** (`texturaChao()`, canvas 512²): manchas, caminho mais claro e liso onde se pisa, riscos e
  grão, mais um mapa de rugosidade separado. Serve de modelo para calçada e paralelepípedo (tarefa 15) por cima da
  ortofoto.
- **Paleta**: cores saturadas só em acentos; base terrosa e quente (`0x8a6444`, `0x2a221a`), luz quente
  (`0xffe0b0`, `0xffc890`) contra sombra fria/escura.

## Acabamento de tela

- **Vinheta e grão de filme por CSS** por cima do canvas (`mix-blend-mode: overlay`, animação em `steps(4)`): custo
  zero na GPU. Bom para o tour e para as capturas.
- Respeitar `prefers-reduced-motion` (câmera parada, sem grão animado).
