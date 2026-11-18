// Som do tour: música gerada na hora com Web Audio, sem arquivo de som, inspirada na Fasnacht de Basel:
// pífaro (Piccolo) em sol maior com apojaturas, tambor de Basel (Basler Trommel) com rufos e
// "Ruf", e sinos de igreja como bordão. Tudo segue a câmera (window.camSom, de cidade.js):
//   distância  → brilho do bordão e registro do pífaro (perto: mais agudo e ornado)
//   inclinação → quanto vai para o eco da sala (olhando de lado, mais sala)
//   rumo       → posição esquerda/direita do bordão e do pífaro
//   velocidade → densidade do tambor: parado marca o tempo; rápido, semicolcheias e rufos
//   giro       → os golpes do tambor se abrem para os lados
// A varredura de anos do tour (som.varredura(anos/s)) vira um rufo contínuo que acompanha a velocidade.
// Detalhes em design/tour.md. ?som=debug expõe window.som.
(() => {
  const ESCALA = [0, 2, 4, 7, 9];           // pentatônica maior sobre sol (sol lá si ré mi)
  const SOL = 196.0;                        // sol 3
  const BPM = 104, PASSO = 60 / BPM / 4;    // marcha em 2/4, semicolcheia
  const RAIZ_CENA = [0, -5, 2, 7, 5, 0];    // sol, ré (abaixo), lá, ré, dó, sol
  const CHAVE = 'basel-som';

  let ctx = null, saida, bus, sala, bordao, ruido, salaG;
  let tocando = false, ligado = true, raf = 0, timer = 0;
  let prox = 0, passo = 0, raiz = 0, cenaN = 0;
  let ultimaFrase = 0, rufo = 0;
  const cam = { dist: 400, polar: 1, az: 0, vel: 0, giro: 0 };

  try { ligado = localStorage.getItem(CHAVE) !== 'off'; } catch {}

  const hz = (semi, oit = 0) => SOL * 2 ** ((semi + 12 * oit) / 12);
  const lim = (v, a, b) => Math.max(a, Math.min(b, v));
  const sorte = (a) => a[Math.floor(Math.random() * a.length)];
  // 0 longe (2 km) → 1 perto (40 m)
  const perto = () => lim(1 - Math.log(cam.dist / 40) / Math.log(50), 0, 1);

  function montar() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (navigator.audioSession) navigator.audioSession.type = 'ambient';
    const pa = ctx.createBiquadFilter(); pa.type = 'highpass'; pa.frequency.value = 35;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -3; limit.ratio.value = 20; limit.attack.value = 0.002; limit.release.value = 0.1;
    const teto = ctx.createWaveShaper();
    const curva = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) curva[i] = Math.tanh((i / 511.5 - 1) * 1.2) / Math.tanh(1.2);
    teto.curve = curva;
    saida = ctx.createGain(); saida.gain.value = 0;
    bus = ctx.createGain(); bus.gain.value = 0.8;
    bus.connect(pa); pa.connect(comp); comp.connect(limit); limit.connect(teto); teto.connect(saida); saida.connect(ctx.destination);

    // sala: nave de pedra, 4 s de cauda, os agudos morrem antes
    const n = ctx.sampleRate * 4, ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c); let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n, k = 0.1 + 0.85 * t;
        lp += (Math.random() * 2 - 1 - lp) * (1 - k);
        d[i] = lp * (1 - t) ** 2.8 * 0.5;
      }
    }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    const pre = ctx.createDelay(); pre.delayTime.value = 0.025;
    sala = ctx.createGain(); salaG = sala.gain; sala.gain.value = 0.3;
    sala.connect(pre); pre.connect(conv); conv.connect(bus);

    ruido = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const r = ruido.getChannelData(0);
    for (let i = 0; i < r.length; i++) r[i] = Math.random() * 2 - 1;

    // bordão: o "zumbido" que fica depois dos sinos — fundamental e quinta em seno, oitava de baixo em
    // triângulo, e uma terça menor fraca (a terça dos sinos de bronze)
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.6; f.frequency.value = 400;
    const pan = ctx.createStereoPanner();
    const g = ctx.createGain(); g.gain.value = 0;
    const osc = [[0, -2, 'triangle', 1], [0, -1, 'sine', 0.6], [7, -1, 'sine', 0.3], [3, -1, 'sine', 0.08]].map(([s, o, tipo, v]) => {
      const x = ctx.createOscillator(); x.type = tipo;
      const xg = ctx.createGain(); xg.gain.value = v; x.connect(xg); xg.connect(g); x.start();
      return { x, s, o };
    });
    // tremor lento, como o batimento de dois sinos quase afinados
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.9;
    const lg = ctx.createGain(); lg.gain.value = 0.25; lfo.connect(lg);
    const trem = ctx.createGain(); trem.gain.value = 0.75; lg.connect(trem.gain); lfo.start();
    g.connect(trem); trem.connect(f); f.connect(pan); pan.connect(bus);
    const env = ctx.createGain(); env.gain.value = 0.4; f.connect(env); env.connect(sala);
    bordao = { g, f, pan, osc };
    afinarBordao(0, 0);
  }

  function afinarBordao(semi, deslize) {
    const t = ctx.currentTime;
    for (const { x, s, o } of bordao.osc) x.frequency.setTargetAtTime(hz(semi + s, o), t, deslize || 0.001);
  }

  // ---------- instrumentos ----------

  // sino de bronze: parciais inarmônicas (hum, prima, terça menor, quinta, oitava, ...), cada uma com sua cauda
  const PARCIAIS = [[0.5, 1, 6], [1, 0.7, 4], [1.19, 0.45, 3], [1.5, 0.3, 2.5], [2, 0.35, 2], [2.52, 0.18, 1.2], [3.01, 0.12, 0.9], [4.1, 0.08, 0.6]];
  function sino(freq, t, v = 0.6, pan = 0) {
    const p = ctx.createStereoPanner(); p.pan.value = lim(pan, -1, 1);
    const g = ctx.createGain(); g.gain.value = 0.11 * v;
    g.connect(p); p.connect(bus);
    const e = ctx.createGain(); e.gain.value = 0.7; p.connect(e); e.connect(sala);
    for (const [r, a, dec] of PARCIAIS) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.value = freq * r * (1 + (Math.random() - 0.5) * 0.002);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(a, t + 0.004);
      og.gain.exponentialRampToValueAtTime(0.0005, t + dec * (1 + v));
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + dec * (1 + v) + 0.1);
    }
    // o golpe do badalo
    golpe(t, v * 0.25, pan, 2500, 0.03);
  }

  // pífaro (Piccolo): triângulo filtrado, ataque rápido com "língua", vibrato curto e sopro agudo
  function pifaro(freq, t, dur, v = 0.6, pan = 0) {
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(freq * 0.985, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.025);
    const vib = ctx.createOscillator(); vib.frequency.value = 6.2;
    const vg = ctx.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(freq * 0.007, t + Math.min(dur, 0.3));
    vib.connect(vg); vg.connect(o.frequency);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = freq * 3.2;
    const s = ctx.createBufferSource(); s.buffer = ruido; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = freq * 2; sf.Q.value = 4;
    const sg = ctx.createGain(); sg.gain.value = 0.18; s.connect(sf); sf.connect(sg);
    const g = ctx.createGain(), p = ctx.createStereoPanner(); p.pan.value = lim(pan, -1, 1);
    const pico = 0.07 * v;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(pico, t + 0.012);
    g.gain.setTargetAtTime(pico * 0.7, t + 0.012, 0.12);
    g.gain.setTargetAtTime(0, t + dur, 0.04);
    o.connect(lp); lp.connect(g); sg.connect(g); g.connect(p); p.connect(bus);
    const e = ctx.createGain(); e.gain.value = 0.6; p.connect(e); e.connect(sala);
    const fim = t + dur + 0.4;
    [o, vib, s].forEach((x) => { x.start(t); x.stop(fim); });
  }

  // golpe de baqueta na pele: ruído em banda com decaimento curto
  function golpe(t, v, pan, freq, dec) {
    const s = ctx.createBufferSource(); s.buffer = ruido;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.9;
    const g = ctx.createGain(), p = ctx.createStereoPanner(); p.pan.value = lim(pan, -1, 1);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3 * v, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dec);
    s.connect(f); f.connect(g); g.connect(p); p.connect(bus);
    const e = ctx.createGain(); e.gain.value = 0.3; p.connect(e); e.connect(sala);
    s.start(t, Math.random() * 1.5); s.stop(t + dec + 0.02);
  }

  // tambor de Basel: esteira (ruído agudo) + corpo (seno caindo de 240 para 170 Hz)
  function tambor(t, v, pan = 0) {
    golpe(t, v, pan, 3200 + Math.random() * 1200, 0.09 + v * 0.06);
    golpe(t, v * 0.6, pan, 1200, 0.05);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(170, t + 0.05);
    const g = ctx.createGain(), p = ctx.createStereoPanner(); p.pan.value = lim(pan, -1, 1);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22 * v, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(p); p.connect(bus);
    o.start(t); o.stop(t + 0.2);
  }
  // apojatura de tambor (Schleppstreich): um golpe fraco 30 ms antes do forte
  const arrastado = (t, v, pan) => { tambor(t - 0.03, v * 0.35, -pan); tambor(t, v, pan); };
  // rufo: golpes alternados rápidos (mão direita e esquerda), crescendo de a para b
  function rufar(t, dur, a, b, taxa = 22) {
    const n = Math.floor(dur * taxa);
    for (let i = 0; i < n; i++) tambor(t + i / taxa + (Math.random() - 0.5) * 0.004, a + ((b - a) * i) / n, i % 2 ? -0.25 : 0.25);
  }
  // "Ruf": o chamado que abre as marchas — rufo em crescendo que termina num golpe forte
  function ruf(t, v = 0.8) { rufar(t, 0.42, 0.15 * v, 0.7 * v, 26); arrastado(t + 0.46, v, 0); }

  // ---------- composição ----------

  // frase do pífaro em ritmo de marcha (pontuadas e semicolcheias) na pentatônica maior
  function frase(t0 = ctx.currentTime + 0.05) {
    const pr = perto();
    const pan = Math.sin(cam.az) * 0.45;
    const n = 4 + Math.floor(Math.random() * 3 + pr * 3);
    let grau = 5 + Math.floor(pr * 3), t = t0;
    const sc = PASSO;
    const ritmos = pr > 0.5 ? [[3, 1], [2, 2], [1, 1, 2], [4]] : [[3, 1], [4], [2, 2], [6, 2]];
    const notas = [];
    while (notas.length < n) for (const d of sorte(ritmos)) notas.push(d);
    notas.length = n;
    notas[n - 1] = 6;
    for (let i = 0; i < n; i++) {
      grau = lim(grau + sorte([-2, -1, -1, 1, 1, 2, 0]), 3, 12);
      const semi = ESCALA[grau % 5] + 12 * Math.floor(grau / 5) + raiz;
      const d = notas[i] * sc;
      // Vorschlag: apojatura de cima, típica do pífaro de Basel; mais comum de perto
      if (i < n - 1 && Math.random() < 0.2 + pr * 0.35) pifaro(hz(semi + 2, 1), t - 0.045, 0.045, 0.45, pan);
      pifaro(hz(semi, 1), t, d * 0.9, 0.6 + Math.random() * 0.25, pan);
      t += d;
    }
    ultimaFrase = performance.now() + (t - t0) * 1000;
  }

  // agendador: semicolcheias à frente do relógio do áudio
  function agendar() {
    if (!ctx) return;
    const vel = cam.vel;
    while (prox < ctx.currentTime + 0.12) {
      const s = passo % 8, t = prox; // compasso 2/4 = 8 semicolcheias
      const forca = s === 0 ? 1 : s === 4 ? 0.75 : s % 2 === 0 ? 0.5 : 0.3;
      const lado = (s % 2 ? -1 : 1) * (0.1 + Math.min(0.6, Math.abs(cam.giro) / 50));
      // tambor: parado só marca os tempos; em movimento enche até as semicolcheias
      const chance = s % 4 === 0 ? 0.55 + vel : s % 2 === 0 ? vel * 1.3 : vel * vel * 1.4;
      if (rufo < 0.05 && Math.random() < chance) {
        const v = forca * (0.3 + 0.6 * vel);
        if (s === 0 && Math.random() < 0.5) arrastado(t, v, lado); else tambor(t, v, lado);
      }
      // nos voos rápidos, um rufo curto no fim do compasso puxa o próximo
      if (rufo < 0.05 && s === 6 && vel > 0.55 && Math.random() < vel) rufar(t, PASSO * 2, 0.2, 0.5 * vel);
      // varredura de anos: rufo contínuo, mais denso e mais forte quanto mais rápido passam os anos
      if (rufo >= 0.05) {
        const taxa = 10 + rufo * 18, n = Math.round(taxa * PASSO);
        for (let i = 0; i < n; i++) tambor(t + (i * PASSO) / n, (0.12 + rufo * 0.45) * (s % 4 === 0 && i === 0 ? 1.6 : 1), i % 2 ? -0.3 : 0.3);
      }
      // sino grave no começo de cada quatro compassos, só de longe
      if (passo % 32 === 0 && perto() < 0.35) sino(hz(raiz, -1), t, 0.35, -0.3);
      passo++; prox += PASSO;
    }
    if (vel < 0.3 && rufo < 0.05 && performance.now() - ultimaFrase > 6000 + Math.random() * 4000) frase();
  }

  // câmera → som, a cada quadro
  function seguir() {
    if (!tocando) return;
    raf = requestAnimationFrame(seguir);
    if (!ctx || !window.camSom) return;
    Object.assign(cam, window.camSom);
    const t = ctx.currentTime, pr = perto();
    bordao.f.frequency.setTargetAtTime(250 + pr * 1800, t, 0.2);
    bordao.pan.pan.setTargetAtTime(Math.sin(cam.az) * 0.5, t, 0.2);
    salaG.setTargetAtTime(0.18 + (cam.polar / (Math.PI / 2)) * 0.4, t, 0.3);
  }

  // ---------- API usada pelo tour ----------

  function iniciar() {
    if (!ligado) return;
    if (!ctx) montar();
    ctx.resume();
    tocando = true;
    const t = ctx.currentTime;
    saida.gain.cancelScheduledValues(t);
    saida.gain.setValueAtTime(saida.gain.value, t);
    saida.gain.linearRampToValueAtTime(1, t + 0.4);
    bordao.g.gain.setTargetAtTime(0.1, t, 1);
    prox = t + 0.1; passo = 0; rufo = 0; ultimaFrase = performance.now();
    clearInterval(timer); timer = setInterval(agendar, 25);
    cancelAnimationFrame(raf); seguir();
  }

  // cena nova: o bordão desliza para a nota da cena, um sino bate e o tambor chama (Ruf)
  function cena(i) {
    if (!tocando) return;
    cenaN = i;
    raiz = RAIZ_CENA[i % RAIZ_CENA.length];
    afinarBordao(raiz, 0.9);
    const t = ctx.currentTime + 0.02;
    sino(hz(raiz, 0), t, 0.7, -0.2);
    if (i > 0) ruf(t + 0.05, 0.7);
  }

  function legenda() {
    if (!tocando || rufo >= 0.05) return;
    if (performance.now() > ultimaFrase - 300) frase(ctx.currentTime + 0.6);
  }

  // anos por segundo da máquina do tempo → força do rufo (0 encerra, com um golpe forte)
  function varredura(anosPorSeg) {
    if (!tocando) return;
    const novo = lim(anosPorSeg / 120, 0, 1);
    if (rufo >= 0.05 && novo < 0.05) arrastado(ctx.currentTime + 0.05, 0.9, 0);
    rufo = novo;
  }

  // fim: cadência do pífaro descendo ao sol, rufo, dois golpes e o sino grande
  function parar(cadencia = false) {
    if (!tocando) return;
    tocando = false;
    cancelAnimationFrame(raf);
    clearInterval(timer);
    const t = ctx.currentTime;
    let fade = 0.8;
    if (cadencia) {
      raiz = 0; afinarBordao(0, 0.5);
      [[7, 3], [4, 1], [2, 2], [0, 8]].reduce((tt, [s, d]) => { pifaro(hz(s, 1), tt, d * PASSO * 0.95, 0.75); return tt + d * PASSO; }, t);
      rufar(t + 0.2, 0.9, 0.15, 0.6, 24);
      arrastado(t + 1.15, 1, 0); tambor(t + 1.45, 0.9, 0);
      sino(hz(0, -1), t + 1.45, 1, 0);
      fade = 3.5;
    }
    saida.gain.cancelScheduledValues(t);
    saida.gain.setValueAtTime(saida.gain.value, t + (cadencia ? 1.6 : 0));
    saida.gain.linearRampToValueAtTime(0, t + (cadencia ? 1.6 : 0) + fade);
    bordao.g.gain.setTargetAtTime(0, t + (cadencia ? 1.6 : 0), fade / 3);
    setTimeout(() => { if (!tocando) ctx.suspend(); }, ((cadencia ? 1.6 : 0) + fade + 0.5) * 1000);
  }

  function alternar() {
    ligado = !ligado;
    try { localStorage.setItem(CHAVE, ligado ? 'on' : 'off'); } catch {}
    if (window.tour?.ativo()) {
      if (ligado) { iniciar(); cena(window.tour.cena?.() ?? 0); } else parar(false);
    }
    return ligado;
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx || !tocando) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });
  addEventListener('pointerdown', () => { if (ctx && tocando && ctx.state !== 'running') ctx.resume(); }, true);
  addEventListener('keydown', () => { if (ctx && tocando && ctx.state !== 'running') ctx.resume(); }, true);

  const api = { iniciar, cena, legenda, varredura, parar, alternar, ligado: () => ligado };
  window.somTour = api;
  if (new URLSearchParams(location.search).get('som') === 'debug') {
    let an = null;
    const pico = () => {
      if (!ctx) return null;
      if (!an) { an = ctx.createAnalyser(); an.fftSize = 4096; saida.connect(an); }
      const d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d);
      let m = 0, q = 0; for (const x of d) { m = Math.max(m, Math.abs(x)); q += x * x; }
      return { pico: +m.toFixed(3), rms: +Math.sqrt(q / d.length).toFixed(3) };
    };
    window.som = { ...api, ctx: () => ctx, cam, frase, pico, sino: (s = 0) => sino(hz(s, 0), ctx.currentTime + 0.05), ruf: () => ruf(ctx.currentTime + 0.05) };
  }
})();
