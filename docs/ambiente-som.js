// Som ambiente da cidade (tarefa 19), fora do tour: gerado na hora com Web Audio, sem arquivo de som (como som.js).
// Discreto e desligável (interruptor "som ambiente" no painel; a escolha fica em localStorage). Só começa depois do
// primeiro gesto da pessoa (o navegador não toca antes) e fica mudo durante o tour, que tem a própria música.
//   água       → ruído marrom filtrado + cintilância, mais alto perto do Reno (vida.js mede a água em volta do alvo da câmera)
//   cidade     → zumbido grave distante de trânsito, que cai de madrugada
//   gente      → murmúrio (duas bandas de voz com modulação lenta), pelo número de pessoas perto do alvo e pela hora
//   bonde      → rumor + chiado de roda pelo bonde em movimento mais perto; "ding-ding" quando um bonde sai da parada
//   sinos      → batidas das horas em tom de sino de igreja (partes inarmônicas), tantas quantas a hora (relógio do bonde)
//   gaivotas   → gritos ocasionais de dia, se há aves
// vida.js chama window.ambiente.contexto(...) a cada ~0,4 s e .evento('bonde', força, pan). ?som=debug expõe window.ambienteDebug.
(() => {
  const CHAVE = 'basel-ambiente';
  const lim = (v, a, b) => Math.max(a, Math.min(b, v));
  let ctx = null, mestre, comp, ligado = true, ativo = false, noTour = false, suspenso = false, ultimaHora = null, tRuf = 0, tGaiv = 0, ultimoSimT = null;
  const bus = {}, alvo = { agua: 0, gente: 0, bonde: 1e9, bondeVel: 0, gaivotas: 0, noite: 0, dia: 1, hora: 15, ano: 2026, carros: 0, nadadores: 0 };
  try { ligado = localStorage.getItem(CHAVE) !== 'off'; } catch {}

  function ruido(tipo) {
    const n = ctx.sampleRate * 6, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let a = 0, p0 = 0, p1 = 0, p2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (tipo === 'marrom') { a = (a + 0.02 * w) / 1.02; d[i] = a * 3.5; }
      else if (tipo === 'rosa') { p0 = 0.99765 * p0 + w * 0.099046; p1 = 0.963 * p1 + w * 0.2965164; p2 = 0.57 * p2 + w * 1.0526913; d[i] = (p0 + p1 + p2 + w * 0.1848) * 0.2; }
      else d[i] = w;
    }
    // costura o fim no começo (sem estalo no laço)
    const f = 2000; for (let i = 0; i < f; i++) { const k = i / f; d[n - f + i] = d[n - f + i] * (1 - k) + d[i] * k; }
    return b;
  }
  const fonte = (tipo) => { const s = ctx.createBufferSource(); s.buffer = ruido(tipo); s.loop = true; s.loopStart = 0; s.loopEnd = 5.9; s.start(0, Math.random() * 5); return s; };
  const filtro = (tipo, f, q = 0.7) => { const x = ctx.createBiquadFilter(); x.type = tipo; x.frequency.value = f; x.Q.value = q; return x; };
  const ganho = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const lfo = (freq, prof, alvoParam, centro) => { // modulação lenta: o = osc * prof, somado ao parâmetro
    const o = ctx.createOscillator(); o.frequency.value = freq; const g = ctx.createGain(); g.gain.value = prof;
    o.connect(g).connect(alvoParam); o.start(); alvoParam.value = centro;
  };

  function montar() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (navigator.audioSession) navigator.audioSession.type = 'ambient';
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3;
    mestre = ganho(0); mestre.connect(comp).connect(ctx.destination);
    // eco curto para os sinos (feedback com passa-baixa)
    const eco = ctx.createDelay(1), fb = ganho(0.38), lp = filtro('lowpass', 2600);
    eco.delayTime.value = 0.23; eco.connect(lp).connect(fb).connect(eco);
    bus.sinos = ganho(0.8); bus.sinos.connect(mestre); bus.sinos.connect(eco); eco.connect(mestre);
    // água
    bus.agua = ganho(0);
    const a1 = fonte('marrom'), f1 = filtro('bandpass', 380, 0.5), a2 = fonte('rosa'), f2 = filtro('highpass', 2200), g2 = ganho(0.05);
    a1.connect(f1).connect(bus.agua); a2.connect(f2).connect(g2).connect(bus.agua);
    lfo(0.13, 0.12, g2.gain, 0.06); lfo(0.07, 40, f1.frequency, 380);
    bus.agua.connect(mestre);
    // cidade distante
    bus.cidade = ganho(0);
    fonte('marrom').connect(filtro('lowpass', 170)).connect(bus.cidade); bus.cidade.connect(mestre);
    // gente
    bus.gente = ganho(0);
    const v = fonte('rosa'), b1 = filtro('bandpass', 520, 1.1), b2 = filtro('bandpass', 1650, 1.6), g1 = ganho(0.8), gb = ganho(0.4);
    v.connect(b1).connect(g1).connect(bus.gente); v.connect(b2).connect(gb).connect(bus.gente);
    lfo(0.31, 0.25, g1.gain, 0.7); lfo(0.23, 0.2, gb.gain, 0.35); lfo(0.4, 120, b1.frequency, 520);
    bus.gente.connect(mestre);
    // bonde em movimento
    bus.bonde = ganho(0);
    fonte('marrom').connect(filtro('lowpass', 240)).connect(bus.bonde);
    const chiado = fonte('rosa'), fc = filtro('bandpass', 2700, 6), gc = ganho(0.0); chiado.connect(fc).connect(gc).connect(bus.bonde);
    lfo(0.5, 0.05, gc.gain, 0.06); bus.chiado = gc;
    bus.bonde.connect(mestre);
  }

  function sinoNota(f, t, g, dur = 5, pan = 0) {
    const sai = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (sai) { sai.pan.value = pan; sai.connect(bus.sinos); }
    const destino = sai || bus.sinos;
    // sino de igreja: parciais inarmônicas (mínima, fundamental, terça menor, quinta, oitava, 2,66…) com decaimentos diferentes
    for (const [r, a, d] of [[0.5, 0.5, 1.0], [1, 1, 1], [1.2, 0.45, 0.8], [1.5, 0.28, 0.6], [2, 0.5, 0.5], [2.66, 0.18, 0.35], [4.07, 0.1, 0.2]]) {
      const o = ctx.createOscillator(), e = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f * r * (1 + (Math.random() - 0.5) * 0.002);
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g * a, t + 0.006); e.gain.exponentialRampToValueAtTime(0.0001, t + dur * d);
      o.connect(e).connect(destino); o.start(t); o.stop(t + dur * d + 0.1);
    }
  }
  // batidas das horas: dois sinos do Münster (sol e ré), cada hora bate N vezes (0 h e 12 h = 12)
  function sinos(n = 3) {
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.4;
    for (let i = 0; i < n; i++) sinoNota(i % 2 ? 196 : 146.8, t0 + i * 2.5, 0.42, 6, i % 2 ? 0.25 : -0.25);
  }
  function dingDing(forca, pan) {
    if (!ctx || !ativo) return;
    const t = ctx.currentTime + 0.02;
    const sai = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (sai) { sai.pan.value = lim(pan, -1, 1); sai.connect(mestre); }
    for (let k = 0; k < 2; k++) {
      const tt = t + k * 0.21;
      for (const [f, a] of [[1580, 1], [2370, 0.5], [3920, 0.25]]) {
        const o = ctx.createOscillator(), e = ctx.createGain(); o.type = 'sine'; o.frequency.value = f;
        e.gain.setValueAtTime(0, tt); e.gain.linearRampToValueAtTime(0.16 * a * forca, tt + 0.003); e.gain.exponentialRampToValueAtTime(0.0001, tt + 0.28);
        o.connect(e).connect(sai || mestre); o.start(tt); o.stop(tt + 0.32);
      }
    }
  }
  function gaivota() {
    const t = ctx.currentTime + 0.05, n = 2 + Math.floor(Math.random() * 3), f0 = 900 + Math.random() * 500, pan = Math.random() * 1.6 - 0.8;
    const sai = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (sai) { sai.pan.value = pan; sai.connect(mestre); }
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.34, o = ctx.createOscillator(), e = ctx.createGain(), f = filtro('bandpass', 1900, 2);
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f0 * 1.25, tt); o.frequency.exponentialRampToValueAtTime(f0 * 0.8, tt + 0.28);
      e.gain.setValueAtTime(0, tt); e.gain.linearRampToValueAtTime(0.05, tt + 0.04); e.gain.exponentialRampToValueAtTime(0.0001, tt + 0.3);
      o.connect(f).connect(e).connect(sai || mestre); o.start(tt); o.stop(tt + 0.35);
    }
  }

  function suavizar(param, v, tau = 0.8) { param.setTargetAtTime(v, ctx.currentTime, tau); }
  function aplicar() {
    if (!ctx) return;
    const quer = ligado && ativo && !noTour;
    suavizar(mestre.gain, quer ? 0.9 : 0, quer ? 0.6 : 0.4);
    if (!quer) return;
    const dia = alvo.dia, noite = alvo.noite;
    suavizar(bus.agua.gain, 0.03 + 0.55 * alvo.agua + 0.04 * alvo.nadadores / 30, 1.2);
    // zumbido de trânsito: cai de madrugada (3 h) e sobe nas horas de pico
    const h = alvo.hora, transito = 0.25 + 0.75 * Math.max(0, Math.sin(((h - 4) / 20) * Math.PI)) ** 0.6;
    suavizar(bus.cidade.gain, 0.16 * transito * (alvo.ano >= 1925 ? 1 : 0.2), 1.5);
    suavizar(bus.gente.gain, 0.2 * alvo.gente * (alvo.ano >= 1500 ? 1 : 0.5), 1);
    const d = alvo.bonde, vel = lim(alvo.bondeVel / 8, 0, 1);
    suavizar(bus.bonde.gain, d < 1e8 ? 0.55 * Math.exp(-d / 70) * (0.3 + 0.7 * vel) * (alvo.ano >= 1895 ? 1 : 0) : 0, 0.4);
    suavizar(bus.chiado.gain, 0.04 + 0.1 * vel, 0.5);
  }

  function contexto(c) {
    Object.assign(alvo, c);
    if (!ctx || !ativo || !ligado || noTour) return;
    aplicar();
    // sinos da hora: quando o relógio da cidade cruza uma hora cheia em andamento (não quando a pessoa muda a hora no painel)
    if (typeof c.simT === 'number') {
      const hh = Math.floor(c.simT / 3600), dsimT = ultimoSimT == null ? 0 : c.simT - ultimoSimT;
      if (ultimaHora != null && hh !== ultimaHora && dsimT > 0 && dsimT < 5) sinos(((hh % 12) || 12));
      ultimaHora = hh; ultimoSimT = c.simT;
    }
    const agora = ctx.currentTime;
    if (alvo.gaivotas > 0.2 && alvo.dia > 0.2 && agora > tGaiv) { tGaiv = agora + 7 + Math.random() * 14; if (alvo.agua > 0.04 || Math.random() < 0.4) gaivota(); }
  }
  function evento(tipo, forca, pan = 0) { if (tipo === 'bonde' && ligado && !noTour) dingDing(forca, pan); }

  function iniciar() {
    if (ativo) return;
    if (!ctx) montar();
    ativo = true;
    if (ctx.state === 'suspended') ctx.resume();
    aplicar();
  }
  function ligar(on) {
    ligado = on;
    try { localStorage.setItem(CHAVE, on ? 'on' : 'off'); } catch {}
    const cb = document.getElementById('c-ambiente'); if (cb) cb.checked = on;
    if (on) iniciar(); else if (ctx) aplicar();
  }
  // primeiro gesto libera o áudio
  const gesto = () => { if (ligado) iniciar(); };
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, gesto, { once: false, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) { suspenso = true; ctx.suspend(); } else if (suspenso) { suspenso = false; if (ativo && ligado) ctx.resume(); }
  });
  // mudo durante o tour (som.js toca a música dele)
  setInterval(() => { const t = !!window.tour?.ativo?.(); if (t !== noTour) { noTour = t; aplicar(); } }, 400);
  document.addEventListener('DOMContentLoaded', () => {
    const cb = document.getElementById('c-ambiente');
    if (cb) { cb.checked = ligado; cb.addEventListener('change', () => ligar(cb.checked)); }
  });
  window.ambiente = { contexto, evento, ligar, ligado: () => ligado, sinos, ctx: () => ctx };
  if (new URLSearchParams(location.search).get('som') === 'debug') window.ambienteDebug = { alvo, gaivota, dingDing, sinos, iniciar };
})();
