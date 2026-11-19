// Ortofoto swissIMAGE (tarefa 11): foto aérea no chão e nos telhados. Os tiles de script/ortofoto.py
// chegam aos poucos: primeiro a visão geral (~70 KB, 512 px), depois os 16 tiles de 1024 px, dos mais
// próximos da câmera aos mais distantes, todos desenhados num único canvas de 4096 px que vira textura.
// O chão e as faces de telhado (normal para cima) amostram essa textura por x, z do mundo; as paredes
// ficam de fora (a foto não vê fachada).
export function criaOrtofoto(THREE, renderer, controls, base = 'data/ortofoto/') {
  const vazio = new THREE.DataTexture(new Uint8Array([200, 190, 170, 255]), 1, 1);
  vazio.needsUpdate = true;
  const U = {
    uOrto: { value: vazio },
    uOrtoRet: { value: new THREE.Vector4(0, 0, 1, 1) }, // x0, z0, 1/largura, 1/profundidade
    uOrtoChao: { value: 0 }, uOrtoTelhado: { value: 0 }, uOrtoK: { value: 0.78 },
  };
  let pronto = false;
  const DECL = 'uniform sampler2D uOrto; uniform vec4 uOrtoRet; uniform float uOrtoChao; uniform float uOrtoTelhado; uniform float uOrtoK;';
  const amostra = (p) => `texture2D(uOrto, (${p} - uOrtoRet.xy) * uOrtoRet.zw).rgb * uOrtoK`;

  function encadeia(mat, fn, nome) {
    const ant = mat.onBeforeCompile;
    const chave = mat.customProgramCacheKey?.bind(mat);
    // os closures abaixo têm o mesmo texto: sem chave própria o three reaproveitaria um programa pelo outro
    mat.customProgramCacheKey = () => `orto-${nome}-${chave?.() ?? ant?.toString() ?? ''}`;
    mat.onBeforeCompile = (s, r) => { ant?.(s, r); Object.assign(s.uniforms, U); fn(s); };
    mat.needsUpdate = true;
  }

  return {
    // chão: a malha do relevo tem os vértices em coordenadas de mundo
    chao(malha) {
      encadeia(malha.material, (s) => {
        s.vertexShader = s.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vOrtoP;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOrtoP = position.xz;');
        s.fragmentShader = s.fragmentShader
          .replace('#include <common>', `#include <common>\nvarying vec2 vOrtoP; ${DECL}`)
          .replace('#include <color_fragment>', `#include <color_fragment>
  diffuseColor.rgb = mix(diffuseColor.rgb, ${amostra('vOrtoP')}, uOrtoChao);`);
      }, 'chao');
    },
    // prédios: só as faces com normal para cima (telhados), no ramo "de pé" (não nos lotes pálidos)
    telhados(mat) {
      encadeia(mat, (s) => {
        s.fragmentShader = s.fragmentShader
          .replace('#include <common>', `#include <common>\n${DECL}`)
          .replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec3 nO = normalize(cross(dFdx(vMundo), dFdy(vMundo)));
    float teto = step(0.4, abs(nO.y)) * uOrtoTelhado;
    if (teto > 0.0) {
      // a foto não é ortho verdadeira: no telhado inclinado entram a sombra azulada do vizinho e o pátio ao lado.
      // Sombra da foto sem o azul; água inclinada puxada para a cor de telha do vértice (mantendo a luz da foto);
      // telhado plano fica com a foto (cascalho, claraboias, painéis)
      vec3 foto = ${amostra('vMundo.xz')};
      float lum = dot(foto, vec3(0.299, 0.587, 0.114));
      foto = mix(foto, vec3(lum) * vec3(1.06, 0.98, 0.9), (1.0 - smoothstep(0.08, 0.3, lum)) * 0.7);
      // copa de árvore vizinha que a foto deita sobre o telhado: verde vira cinza quente
      foto = mix(foto, vec3(lum) * vec3(1.04, 1.0, 0.94), smoothstep(0.015, 0.08, foto.g - max(foto.r, foto.b)) * 0.8);
      float inclinado = 1.0 - smoothstep(0.93, 0.98, abs(nO.y));
      // água inclinada: a cor é da telha do prédio (vértice); da foto fica só a luz e a sombra (o pátio e o vizinho
      // que a foto deita no telhado somem). Manchas de idade e musgo nas águas viradas para o norte
      vec3 nC = nO.y < 0.0 ? -nO : nO;
      vec2 pT = vMundo.xz;
      float hT = fract(sin(dot(floor(pT * 0.35), vec2(127.1, 311.7))) * 43758.5453);
      float idade = 0.88 + 0.24 * hT;
      vec3 telha = diffuseColor.rgb * idade * clamp(0.78 + 0.55 * (lum - 0.35), 0.7, 1.15);
      float musgo = smoothstep(0.15, 0.55, -nC.z) * smoothstep(0.45, 0.8, fract(sin(dot(floor(pT * 1.3), vec2(12.9898, 78.233))) * 43758.5453));
      telha = mix(telha, vec3(0.30, 0.31, 0.21), musgo * 0.35);
      foto = mix(foto, telha, inclinado * 0.85);
      diffuseColor.rgb = mix(diffuseColor.rgb, foto, teto);
    }
  }`);
      }, 'telhado');
    },
    async carrega() {
      const meta = await fetch(base + 'ortofoto.json').then((r) => r.json());
      const N = meta.grade, LADO = meta.lado;
      // 5120 px fora do modo leve (o recorte de 3,4 km a 4096 px ficava com 0,83 m/px); celular e modo leve seguem em 4096
      const leve = new URLSearchParams(location.search).get('leve') === '1' || matchMedia('(pointer:coarse)').matches;
      const tam = Math.min(N * LADO, renderer.capabilities.maxTextureSize, leve ? 4096 : 5120);
      const k = tam / (N * LADO);
      const cv = document.createElement('canvas');
      cv.width = cv.height = tam;
      const cx = cv.getContext('2d');
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false; // linha 0 do canvas = norte = v 0 (z mínimo)
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      const img = (nome) => fetch(base + nome).then((r) => r.blob()).then((b) => createImageBitmap(b));

      cx.drawImage(await img('geral.webp'), 0, 0, tam, tam);
      tex.needsUpdate = true;
      U.uOrto.value = tex;
      U.uOrtoRet.value.set(meta.x0, meta.z0, 1 / (meta.x1 - meta.x0), 1 / (meta.z1 - meta.z0));
      U.uOrtoChao.value = 1;
      U.uOrtoTelhado.value = 1;
      pronto = true;

      // tiles de 1024 px, do mais perto do alvo da câmera ao mais longe; um upload por rajada
      const alvo = controls.target;
      const larg = (meta.x1 - meta.x0) / N, prof = (meta.z1 - meta.z0) / N;
      const fila = [];
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const d = Math.hypot(meta.x0 + (i + 0.5) * larg - alvo.x, meta.z0 + (j + 0.5) * prof - alvo.z);
        fila.push({ i, j, d });
      }
      fila.sort((a, b) => a.d - b.d);
      let pendente = false;
      const sobe = () => {
        if (pendente) return;
        pendente = true;
        setTimeout(() => { pendente = false; tex.needsUpdate = true; }, 350);
      };
      let feitos = 0;
      const um = async ({ i, j }) => {
        const b = await img(`t_${i}_${j}.webp`);
        cx.clearRect(i * LADO * k, j * LADO * k, LADO * k, LADO * k);
        cx.drawImage(b, i * LADO * k, j * LADO * k, LADO * k, LADO * k);
        b.close?.();
        feitos++;
        sobe();
      };
      // 3 downloads em paralelo, sem competir com a abertura
      const trabalha = async () => { while (fila.length) await um(fila.shift()); };
      await Promise.all([trabalha(), trabalha(), trabalha()]);
      window.ortofotoTiles = feitos;
    },
  };
}
