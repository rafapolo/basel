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
      // sem canvas (eram 105 MB na memória e, a cada rajada de tiles, a textura inteira subia de novo: ~0,4 s de quadro
      // travado): a foto geral vira a textura de uma vez e cada tile é copiado pela GPU só no seu pedaço, já no tamanho
      // final, reduzido fora da thread principal pelo createImageBitmap
      // tiles decodificados num worker (pixels crus, transferidos): o ImageBitmap ia para a GPU decodificando na hora, e cada
      // envio travava o quadro por 60–230 ms; sem OffscreenCanvas, o caminho antigo
      const tw = typeof OffscreenCanvas === 'function' && typeof Worker === 'function' ? new Worker(URL.createObjectURL(new Blob([`onmessage = async (e) => {
  const { id, url, w } = e.data;
  try {
    const bmp = await createImageBitmap(await (await fetch(url)).blob(), w ? { resizeWidth: w, resizeHeight: w, resizeQuality: 'high' } : {});
    const c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
    const d = x.getImageData(0, 0, bmp.width, bmp.height).data.buffer;
    postMessage({ id, width: bmp.width, height: bmp.height, px: d }, [d]);
  } catch (err) { postMessage({ id, erro: String(err) }); }
};`], { type: 'text/javascript' }))) : null;
      const esperando = new Map(); let nId = 0;
      if (tw) tw.onmessage = (e) => { const f = esperando.get(e.data.id); esperando.delete(e.data.id); e.data.erro ? f.no(e.data.erro) : f.ok(e.data); };
      const pixels = (nome, w) => (tw ? new Promise((ok, no) => { const id = nId++; esperando.set(id, { ok, no }); tw.postMessage({ id, url: new URL(base + nome, location.href).href, w }); }) : img(nome, w));
      const img = (nome, w) => fetch(base + nome).then((r) => r.blob()).then((b) => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none', ...(w ? { resizeWidth: w, resizeHeight: w, resizeQuality: 'high' } : {}) })); // sem conversão no envio
      // a textura grande nasce vazia na GPU (FramebufferTexture: só aloca) e recebe a foto geral de 512 px esticada pela própria
      // GPU; antes eram 105 MB montados num canvas e enviados de uma vez
      const geral = await img('geral.webp');
      const tex = new THREE.FramebufferTexture(tam, tam);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false; // linha 0 = norte = v 0 (z mínimo)
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      renderer.initTexture(tex);
      const gl = renderer.getContext(), glTex = () => renderer.properties.get(tex).__webglTexture;
      // cópia na GPU (blitFramebuffer) de uma textura pequena para um retângulo da grande: entra na fila de comandos, sem a
      // espera que o texSubImage2D direto na textura em uso causava (até 0,2 s por tile no ANGLE/Metal)
      const fl = gl.createFramebuffer(), fd = gl.createFramebuffer();
      const blit = (bmp, x, y, w, h) => {
        const t = bmp.px ? new THREE.DataTexture(new Uint8Array(bmp.px), bmp.width, bmp.height) : new THREE.Texture(bmp); t.magFilter = THREE.LinearFilter; t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
        renderer.initTexture(t);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fl); gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, renderer.properties.get(t).__webglTexture, 0);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fd); gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, glTex(), 0);
        gl.blitFramebuffer(0, 0, bmp.width, bmp.height, x, y, x + w, y + h, gl.COLOR_BUFFER_BIT, gl.LINEAR);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        renderer.resetState();
        t.dispose(); bmp.close?.();
      };
      blit(geral, 0, 0, tam, tam);
      renderer.state.bindTexture(gl.TEXTURE_2D, glTex()); gl.generateMipmap(gl.TEXTURE_2D);
      U.uOrto.value = tex;
      U.uOrtoRet.value.set(meta.x0, meta.z0, 1 / (meta.x1 - meta.x0), 1 / (meta.z1 - meta.z0));
      U.uOrtoChao.value = 1;
      U.uOrtoTelhado.value = 1;
      pronto = true;
      const subir = (bmp, x, y) => { if (glTex()) { blit(bmp, x, y, bmp.width, bmp.height); pendente = true; } };
      // mipmaps refeitos na GPU no máximo a cada 300 ms (não a cada tile)
      let pendente = false;
      const mip = setInterval(() => { if (!pendente) return; pendente = false; const glt = renderer.properties.get(tex).__webglTexture; if (glt) { renderer.state.bindTexture(gl.TEXTURE_2D, glt); gl.generateMipmap(gl.TEXTURE_2D); } }, 300);

      // tiles de 1024 px, do mais perto do alvo da câmera ao mais longe
      const alvo = controls.target;
      const larg = (meta.x1 - meta.x0) / N, prof = (meta.z1 - meta.z0) / N;
      const fila = [];
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const d = Math.hypot(meta.x0 + (i + 0.5) * larg - alvo.x, meta.z0 + (j + 0.5) * prof - alvo.z);
        fila.push({ i, j, d });
      }
      fila.sort((a, b) => a.d - b.d);
      let feitos = 0;
      const um = async ({ i, j }) => {
        const x0 = Math.round(i * LADO * k), y0 = Math.round(j * LADO * k), w = Math.round((i + 1) * LADO * k) - x0;
        const b = await pixels(`t_${i}_${j}.webp`, w === LADO ? 0 : w);
        subir(b, x0, y0);
        feitos++;
      };
      // 3 downloads em paralelo, sem competir com a abertura
      const trabalha = async () => { while (fila.length) await um(fila.shift()); };
      await Promise.all([trabalha(), trabalha(), trabalha()]);
      setTimeout(() => { clearInterval(mip); gl.deleteFramebuffer(fl); gl.deleteFramebuffer(fd); tw?.terminate(); }, 400);
      window.ortofotoTiles = feitos;
    },
  };
}
