// Barras do painel (2026-11-22, no lugar do relógio do céu): em cima do slider da hora, a cor do céu de Basel em cada
// minuto do dia escolhido (noite, crepúsculos, hora dourada, dia), da meia-noite à meia-noite, alinhada com o slider; embaixo
// do slider do dia, a cor das copas ao longo do ano (peladas, brotando, verdes, amarelando, peladas). Sem interação: o
// slider de cima de cada uma é que manda.
const lerp = (a, b, t) => a + (b - a) * t, sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
// cor do céu pela altura do sol (graus): [horizonte, alto]; noite, crepúsculos (astronômico, náutico, civil), hora dourada, dia
function corCeu(alt) {
  const NOITE = [[16, 20, 34], [10, 13, 24]], AZUL = [[30, 40, 78], [14, 20, 44]], ROXO = [[150, 86, 112], [40, 52, 98]];
  const OURO = [[244, 150, 70], [92, 120, 170]], DOURADO = [[250, 206, 150], [96, 146, 200]], DIA = [[176, 206, 228], [74, 128, 186]];
  let c;
  if (alt < -18) c = NOITE;
  else if (alt < -12) c = [mix(NOITE[0], AZUL[0], sm(-18, -12, alt)), mix(NOITE[1], AZUL[1], sm(-18, -12, alt))];
  else if (alt < -6) c = [mix(AZUL[0], ROXO[0], sm(-12, -6, alt)), mix(AZUL[1], ROXO[1], sm(-12, -6, alt))];
  else if (alt < 0) c = [mix(ROXO[0], OURO[0], sm(-6, 0, alt)), mix(ROXO[1], OURO[1], sm(-6, 0, alt))];
  else if (alt < 6) c = [mix(OURO[0], DOURADO[0], sm(0, 6, alt)), mix(OURO[1], DOURADO[1], sm(0, 6, alt))];
  else c = [mix(DOURADO[0], DIA[0], sm(6, 20, alt)), mix(DOURADO[1], DIA[1], sm(6, 20, alt))];
  return c;
}
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;


// copa das folhosas pelo dia do ano (a média das espécies de arvores.js): pelada, verde-limão ao brotar, verde, outono
const ss = (a, b, x) => sm(a, b, x);
function corCopa(doy) {
  const folha = ss(96, 122, doy) * (1 - ss(292, 335, doy)), tinta = doy > 200 ? ss(262, 318, doy) : 0, brota = doy < 200 ? ss(96, 110, doy) * (1 - ss(110, 150, doy)) : 0;
  const flor = ss(78, 88, doy) * (1 - ss(104, 116, doy));
  let c = mix([66, 110, 44], [176, 196, 70], brota);               // verde de verão ou verde-limão das folhas novas
  c = mix(c, mix([226, 168, 48], [170, 88, 40], ss(290, 320, doy)), tinta); // amarelo de outubro, marrom no fim
  c = mix([142, 126, 108], c, folha);                               // pelada: galhos cinza-marrom
  return mix(c, [236, 190, 206], flor * 0.6 * (1 - folha));         // flor das cerejeiras antes da folha
}
export function criarBarras({ ceu }) {
  const hora = document.getElementById('c-hora'), dia = document.getElementById('c-data');
  if (!hora || !dia) return;
  const faz = (antes, id) => { const c = document.createElement('canvas'); c.id = id; c.className = 'barra-cor'; c.height = 20; antes.parentNode.insertBefore(c, antes); return c; };
  const ceuCv = faz(hora, 'barra-ceu'), copaCv = faz(dia.nextSibling, 'barra-copa');
  let dataAnt = '', larg = 0;
  function pintar(e) {
    const w = Math.round(ceuCv.clientWidth * Math.min(2, devicePixelRatio || 1)) || 300;
    if (e.data === dataAnt && w === larg) return; dataAnt = e.data; larg = w;
    for (const cv of [ceuCv, copaCv]) { cv.width = w; cv.height = 20 * Math.min(2, devicePixelRatio || 1); }
    const g = ceuCv.getContext('2d'), h = ceuCv.height;
    for (let x = 0; x < w; x++) { const hr = (x / (w - 1)) * 24, [hz, zt] = corCeu(ceu.solEm(e.data, hr % 24).altitudeGraus); const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, rgb(zt)); gr.addColorStop(1, rgb(hz)); g.fillStyle = gr; g.fillRect(x, 0, 1, h); }
    const k = copaCv.getContext('2d');
    for (let x = 0; x < w; x++) { k.fillStyle = rgb(corCopa(1 + (x / (w - 1)) * 364)); k.fillRect(x, 0, 1, copaCv.height); }
  }
  ceu.aoMudar(pintar); addEventListener('resize', () => { larg = 0; pintar(ceu.estado()); });
  pintar(ceu.estado()); requestAnimationFrame(() => { larg = 0; pintar(ceu.estado()); });
}
