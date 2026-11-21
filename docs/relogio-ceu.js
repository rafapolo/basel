// Relógio do céu (2026-11-21, à maneira de sky-clock.klet.app): um mostrador de 24 h cuja face é pintada com a cor do
// céu de Basel em cada minuto do dia escolhido (meio-dia em cima, meia-noite embaixo, 6 h à esquerda, 18 h à direita;
// o centro é o horizonte e a borda o céu alto). Em volta, o anel dos dias do ano. Arrastar na face muda a hora; tocar ou
// arrastar no anel muda o dia, e a face se repinta: dá para ver o dia encolher no inverno e crescer no verão.
const TAU = Math.PI * 2;
const MESES = { pt: ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'], en: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], de: ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'] };
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

export function criarRelogioCeu({ ceu, lang = 'pt' }) {
  const caixa = document.createElement('div'); caixa.id = 'relogio-ceu';
  caixa.setAttribute('role', 'group'); caixa.setAttribute('aria-label', lang === 'de' ? 'Himmelsuhr' : lang === 'en' ? 'sky clock' : 'relógio do céu');
  const cv = document.createElement('canvas'); caixa.appendChild(cv); document.body.appendChild(caixa);
  const g = cv.getContext('2d');
  const face = document.createElement('canvas'), gf = face.getContext('2d'); // a face pintada, refeita só quando muda o dia
  let tam = 0, dataFace = '';
  const medir = () => {
    const css = caixa.clientWidth || 150, dpr = Math.min(2, devicePixelRatio || 1);
    if (css * dpr === tam) return; tam = css * dpr; cv.width = cv.height = face.width = face.height = tam; dataFace = '';
  };
  // geometria: anel dos dias (fora) e face (dentro), em frações do raio
  const R_ANEL = 0.5, R_FACE = 0.4;
  const anguloHora = (h) => ((h - 12) / 24) * TAU; // 0 = meio-dia em cima; sentido horário
  const anguloDia = (doy) => (doy / 365) * TAU;     // 1º de janeiro em cima
  function pintarFace(data) {
    const c = tam / 2, r = tam * R_FACE;
    gf.clearRect(0, 0, tam, tam);
    // uma fatia por 4 minutos: gradiente do horizonte (centro) ao céu alto (borda)
    const N = 360;
    for (let i = 0; i < N; i++) {
      const h = 12 + (i / N) * 24, alt = ceu.solEm(data, h % 24).altitudeGraus, [hz, zt] = corCeu(alt);
      const a0 = anguloHora(h) - Math.PI / 2 - 0.006, a1 = a0 + TAU / N + 0.012;
      const gr = gf.createRadialGradient(c, c, 0, c, c, r); gr.addColorStop(0, rgb(hz)); gr.addColorStop(1, rgb(zt));
      gf.fillStyle = gr; gf.beginPath(); gf.moveTo(c, c); gf.arc(c, c, r, a0, a1); gf.closePath(); gf.fill();
    }
    dataFace = data;
  }
  const doyDe = (data) => { const [a, m, d] = data.split('-').map(Number); return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(a, 0, 1)) / 86400000); };
  function desenhar(e) {
    medir(); if (!tam) return;
    if (e.data !== dataFace) pintarFace(e.data);
    const c = tam / 2, rA = tam * R_ANEL, rF = tam * R_FACE, k = tam / 300;
    g.clearRect(0, 0, tam, tam);
    // anel dos dias: fundo escuro, meses, marcas
    g.fillStyle = 'rgba(22,24,30,.92)'; g.beginPath(); g.arc(c, c, rA - 1, 0, TAU); g.fill();
    g.drawImage(face, 0, 0);
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1.2 * k; g.beginPath(); g.arc(c, c, rF, 0, TAU); g.stroke();
    const mes = MESES[lang] ?? MESES.pt;
    g.fillStyle = 'rgba(232,225,208,.55)'; g.font = `600 ${11 * k}px Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let m = 0; m < 12; m++) {
      const a = anguloDia(m * 30.4 + 15) - Math.PI / 2, rr = (rA + rF) / 2;
      g.save(); g.translate(c + Math.cos(a) * rr, c + Math.sin(a) * rr); g.rotate(a + Math.PI / 2); g.fillText(mes[m], 0, 0); g.restore();
      const b = anguloDia(m * 30.4) - Math.PI / 2; g.strokeStyle = 'rgba(232,225,208,.25)'; g.beginPath(); g.moveTo(c + Math.cos(b) * (rF + 4 * k), c + Math.sin(b) * (rF + 4 * k)); g.lineTo(c + Math.cos(b) * (rA - 3 * k), c + Math.sin(b) * (rA - 3 * k)); g.stroke();
    }
    // horas: 12, 18, 24, 6 e marquinhas
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = `500 ${12 * k}px Inter, sans-serif`;
    for (const [h, t] of [[12, '12'], [18, '18'], [0, '24'], [6, '06']]) { const a = anguloHora(h) - Math.PI / 2, rr = rF - 15 * k; g.fillText(t, c + Math.cos(a) * rr, c + Math.sin(a) * rr); }
    g.strokeStyle = 'rgba(255,255,255,.45)';
    for (let h = 0; h < 24; h++) { const a = anguloHora(h) - Math.PI / 2, l = h % 6 ? 4 : 8; g.lineWidth = (h % 6 ? 1 : 2) * k; g.beginPath(); g.moveTo(c + Math.cos(a) * (rF - l * k), c + Math.sin(a) * (rF - l * k)); g.lineTo(c + Math.cos(a) * rF, c + Math.sin(a) * rF); g.stroke(); }
    // o dia no anel: uma etiqueta dourada
    { const a = anguloDia(doyDe(e.data)) - Math.PI / 2, rr = (rA + rF) / 2;
      g.fillStyle = '#e8b04a'; g.beginPath(); g.arc(c + Math.cos(a) * rr, c + Math.sin(a) * rr, 4.5 * k, 0, TAU); g.fill(); }
    // ponteiro da hora e o sol na ponta (no alto se for dia, embaixo se não)
    { const a = anguloHora(e.hora) - Math.PI / 2, rr = rF * 0.86;
      g.strokeStyle = '#fff'; g.lineWidth = 2.6 * k; g.lineCap = 'round'; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr); g.stroke();
      g.fillStyle = e.altitudeGraus > 0 ? '#ffd36a' : '#c9d2e8'; g.beginPath(); g.arc(c + Math.cos(a) * rr, c + Math.sin(a) * rr, 5 * k, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(c, c, 3 * k, 0, TAU); g.fill(); }
  }
  // interação: arrastar na face muda a hora; no anel, o dia
  let modo = null;
  const ler = (ev) => {
    const r = cv.getBoundingClientRect(), x = ev.clientX - r.left - r.width / 2, y = ev.clientY - r.top - r.height / 2;
    let a = Math.atan2(y, x) + Math.PI / 2; if (a < 0) a += TAU;
    return { a, d: Math.hypot(x, y) / r.width };
  };
  const aplicar = (ev) => {
    const { a } = ler(ev), e = ceu.estado();
    if (modo === 'hora') ceu.definirHora(((a / TAU) * 24 + 12) % 24);
    else if (modo === 'dia') { const [ano] = e.data.split('-'), dt = new Date(Date.UTC(+ano, 0, 1 + Math.round((a / TAU) * 365) % 365)); ceu.definirData(dt.toISOString().slice(0, 10)); }
  };
  cv.addEventListener('pointerdown', (ev) => { const { d } = ler(ev); modo = d <= R_FACE ? 'hora' : d <= R_ANEL ? 'dia' : null; if (!modo) return; cv.setPointerCapture(ev.pointerId); aplicar(ev); ev.preventDefault(); });
  cv.addEventListener('pointermove', (ev) => { if (modo) aplicar(ev); });
  for (const t of ['pointerup', 'pointercancel']) cv.addEventListener(t, () => { modo = null; });
  addEventListener('resize', () => { tam = 0; desenhar(ceu.estado()); });
  ceu.aoMudar(desenhar);
  desenhar(ceu.estado());
  return { caixa };
}
