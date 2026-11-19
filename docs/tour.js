// Tour de 90 s pela Altstadt de hoje, no estilo de cinema (faixas 2.39:1, legenda com kicker e frase), com a música de
// som.js e 40 s em que as estações passam enquanto a câmera gira. Abre pelo botão do tour ou por ?tour=1 (?tour=de muda a
// língua). Esc ou "✕ esc" param e deixam a câmera onde estava; a cidade volta à data, hora e noite de antes.
// Todos os números das legendas são contados dos dados carregados (cidade.estat).
// Roteiro, legendas e música descritos em design/tour.md.
const $ = (id) => document.getElementById(id);
const C = window.cidade;
const { THREE } = C;
const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rad = THREE.MathUtils.degToRad;

let ativo = false, inicio = 0, raf = 0, anim = 0, salvo = null, cenaAtual = 0, TOTAL = 88000, t0Cena = 0;
const pendentes = new Set();
class Parado extends Error {}
const espera = (ms) => new Promise((ok, falha) => {
  const p = { falha };
  p.id = setTimeout(() => { pendentes.delete(p); ok(); }, Math.max(0, ms));
  pendentes.add(p);
});
const em = (ms) => espera(t0Cena + ms - performance.now());

// ---------- câmera ----------
const suave = (t) => 0.5 - Math.cos(Math.PI * t) / 2;
const angulo = (a, b, e) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * e; };
// move a câmera de onde está até o alvo: centro, distância, rumo e inclinação ao mesmo tempo.
// voo (arco): a distância sobe no meio do caminho, como um drone que ganha altura para atravessar.
// giro: graus extras de volta (pode passar de 180°)
function mover(alvo, ms, { arco = 0, giro } = {}) {
  cancelAnimationFrame(anim);
  const a = C.lerCamera();
  const b = { alvo: alvo.alvo ?? a.alvo, dist: alvo.dist ?? a.dist, polar: alvo.polar ?? a.polar };
  const az1 = giro !== undefined ? a.az + rad(giro) : alvo.az ?? a.az;
  if (reduz || ms <= 0) { C.porCamera({ ...b, az: giro !== undefined ? az1 : angulo(a.az, az1, 1) }); return; }
  const t0 = performance.now();
  const passo = (agora) => {
    if (!ativo) return;
    const t = Math.min(1, (agora - t0) / ms), e = suave(t);
    const alto = 1 + arco * Math.sin(Math.PI * e);
    C.porCamera({
      alvo: a.alvo.map((v, i) => v + (b.alvo[i] - v) * e),
      dist: Math.exp(Math.log(a.dist) + (Math.log(b.dist) - Math.log(a.dist)) * e) * alto,
      polar: a.polar + (b.polar - a.polar) * e,
      az: giro !== undefined ? a.az + (az1 - a.az) * e : angulo(a.az, az1, e),
    });
    if (t < 1) anim = requestAnimationFrame(passo);
  };
  anim = requestAnimationFrame(passo);
}

// um ano em ms: a data corre de meados de janeiro ao fim de dezembro (ceu.js muda sol, árvores, roupas e quem está
// na rua), com o mês grande no canto; devolve uma promessa que resolve no fim
function estacoes(ms, ano) {
  const rotulo = $('tour-ano');
  rotulo.classList.add('on');
  const mes = new Intl.DateTimeFormat(document.documentElement.lang, { month: 'long', timeZone: 'UTC' });
  const t0 = performance.now(), d0 = Date.UTC(ano, 0, 15), d1 = Date.UTC(ano, 11, 28);
  let ult = 0;
  return new Promise((ok) => {
    const passo = (agora) => {
      if (!ativo) return ok();
      const t = Math.min(1, (agora - t0) / ms);
      if (agora - ult > 120 || t >= 1) { // ~8 vezes por segundo basta: cada troca de data recalcula sol e árvores
        ult = agora;
        const d = new Date(d0 + (d1 - d0) * t);
        C.ceu.definirData(d.toISOString().slice(0, 10));
        rotulo.textContent = mes.format(d).replace(/^\p{Ll}/u, (c) => c.toUpperCase());
      }
      if (t < 1) requestAnimationFrame(passo);
      else { setTimeout(() => rotulo.classList.remove('on'), 1200); ok(); }
    };
    requestAnimationFrame(passo);
  });
}

async function legenda(kicker, linha) {
  const cap = $('tour-cap');
  cap.classList.remove('on');
  await espera(450);
  $('tour-kicker').textContent = kicker || '';
  $('tour-line').textContent = linha;
  cap.classList.add('on');
  somTour.legenda();
}

function cenas() {
  const E = C.estat, munster = C.centro('Münster'), rathaus = C.centro('Rathaus');
  const ano = +C.ceu.estado().data.slice(0, 4);
  return [
    // 0 · abertura: do alto, a cidade inteira girando, descendo para a vista da Pfalz sobre o Reno
    { dur: 10000, run: async () => {
      C.definirNoite(false); C.ceu.definirHora(15);
      C.porCamera({ alvo: [0, 0, 0], dist: 1900, az: rad(230), polar: rad(28) });
      mover(C.VISTA_PFALZ, 10000, { giro: -80 });
      await legenda('Basel · Altstadt', t(
        `${fmt(E.total)} prédios, um por um: a forma vem da swisstopo; andares e uso, do registro federal de prédios.`,
        `${fmt(E.total)} buildings, one by one: the shape from swisstopo, floors and use from the federal building register.`,
        `${fmt(E.total)} Häuser, eines nach dem anderen: die Form von swisstopo, Geschosse und Nutzung aus dem eidgenössischen Gebäuderegister.`));
    } },
    // 1 · o Münster e a Pfalz
    { dur: 10000, run: async () => {
      mover({ alvo: munster, dist: 210, polar: rad(64), az: rad(200) }, 3500, { arco: 0.25 });
      await em(3500);
      mover({}, 6500, { giro: 110 });
      await legenda('Münster · Pfalz', t(
        'O Münster de arenito vermelho e o terraço da Pfalz, uns 20 m acima do Reno.',
        'The red sandstone Münster and the Pfalz terrace, some 20 m above the Rhine.',
        'Das Münster aus rotem Sandstein und die Pfalz, rund 20 m über dem Rhein.'));
    } },
    // 2 · voo baixo pelo Reno até a Mittlere Brücke
    { dur: 10000, run: async () => {
      mover({ alvo: [330, 0, -60], dist: 330, polar: rad(70), az: rad(120) }, 2500);
      await legenda('Rhein · Mittlere Brücke', t(
        'A Mittlere Brücke e o Käppelijoch; os bondes verdes e amarelos rodam pelo horário de verdade.',
        'The Mittlere Brücke and the Käppelijoch; the green and yellow trams run on the real timetable.',
        'Die Mittlere Brücke und das Käppelijoch; die grünen und gelben Trams fahren nach dem echten Fahrplan.'));
      await em(2500);
      mover({ alvo: [-80, 0, -150], dist: 260, polar: rad(72), az: rad(150) }, 7500);
    } },
    // 3 · Rathaus e Marktplatz: a gente nas praças
    { dur: 8000, run: async () => {
      mover({ alvo: rathaus, dist: 280, polar: rad(55), az: rad(250) }, 3000, { arco: 0.2 });
      await legenda('Rathaus · Marktplatz', t(
        'Gente onde Basel se encontra: nas praças, na Clarastrasse, no Rheinbord e à espera do bonde.',
        'People where Basel meets: on the squares, along Clarastrasse, on the Rheinbord and waiting for the tram.',
        'Menschen, wo Basel sich trifft: auf den Plätzen, an der Clarastrasse, am Rheinbord und an der Tramhaltestelle.'));
      await em(3000);
      mover({}, 5000, { giro: 70 });
    } },
    // 4 · as estações: um ano em 40 s, câmera em volta do Münster e do Reno, alta e baixa como um drone
    { dur: 40000, run: async () => {
      C.ceu.definirHora(14);
      mover({ alvo: [110, 6, 10], dist: 620, polar: rad(60), az: rad(300) }, 3000, { arco: 0.15 });
      await legenda(t('Um ano em 40 segundos', 'A year in 40 seconds', 'Ein Jahr in 40 Sekunden'), t(
        'O sol, as árvores, as roupas e a gente na rua seguem a data.',
        'The sun, the trees, the clothes and the people out of doors follow the date.',
        'Sonne, Bäume, Kleidung und die Menschen draussen folgen dem Datum.'));
      const ano40 = estacoes(38000, ano);
      await em(3000);
      mover({ dist: 380, polar: rad(66) }, 17000, { giro: 150 });
      await em(9000);
      await legenda(t('Primavera', 'Spring', 'Frühling'), t('As tílias e os castanheiros brotam em abril.', 'The limes and chestnuts come into leaf in April.', 'Linden und Kastanien schlagen im April aus.'));
      await em(16000);
      await legenda(t('Verão', 'Summer', 'Sommer'), t('O Rheinbord enche e há quem desça o Reno nadando.', 'The Rheinbord fills up and swimmers drift down the Rhine.', 'Das Rheinbord füllt sich, und man schwimmt den Rhein hinunter.'));
      await em(20000);
      mover({ dist: 560, polar: rad(58) }, 18000, { giro: 140 });
      await em(26000);
      await legenda(t('Outono', 'Autumn', 'Herbst'), t('As copas ficam amarelas, laranja e marrons, e caem até o fim de novembro.', 'The crowns turn yellow, orange and brown, and fall by the end of November.', 'Die Kronen werden gelb, orange und braun und fallen bis Ende November.'));
      await em(34000);
      await legenda(t('Inverno', 'Winter', 'Winter'), t('Galhos nus, sol baixo e pouca gente na rua.', 'Bare branches, a low sun and few people out.', 'Kahle Äste, tiefe Sonne und wenige Menschen draussen.'));
      await ano40;
    } },
    // 5 · noite: as janelas acendem e a câmera volta à vista da Pfalz
    { dur: 10000, run: async () => {
      C.definirNoite(true);
      mover(C.VISTA_PFALZ, 9000, { arco: 0.2 });
      await legenda(t('Basel · dados abertos', 'Basel · open data', 'Basel · offene Daten'), t(
        'swisstopo, o registro federal de prédios via data.bs.ch e o OpenStreetMap. Clique em qualquer prédio.',
        'swisstopo, the federal building register via data.bs.ch, and OpenStreetMap. Click any building.',
        'swisstopo, das eidgenössische Gebäuderegister via data.bs.ch und OpenStreetMap. Klicken Sie auf ein Haus.'));
    } },
  ];
}

function progresso() {
  const t = Math.min(1, (performance.now() - inicio) / TOTAL);
  $('tour-progress').firstElementChild.style.transform = `scaleX(${t})`;
  const s = Math.max(0, Math.ceil((TOTAL - (performance.now() - inicio)) / 1000));
  $('tour-left').textContent = s >= 60 ? `0${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} s`;
  raf = requestAnimationFrame(progresso);
}

async function iniciar() {
  if (ativo) return;
  ativo = true;
  const e0 = C.ceu.estado();
  salvo = { noite: C.noite(), data: e0.data, hora: e0.hora, vivo: C.ceu.aoVivo };
  C.fecharFicha();
  C.controls.enabled = false;
  document.body.classList.add('touring');
  const tour = $('tour');
  tour.hidden = false; tour.classList.remove('saindo');
  requestAnimationFrame(() => tour.classList.add('on'));
  somTour.iniciar();
  inicio = performance.now();
  progresso();
  try {
    let fim = 0;
    const roteiro = cenas();
    TOTAL = roteiro.reduce((s, c) => s + c.dur, 0);
    for (const [i, cena] of roteiro.entries()) {
      t0Cena = inicio + fim;
      fim += cena.dur;
      cenaAtual = i;
      somTour.cena(i);
      await cena.run();
      await espera(inicio + fim - performance.now());
    }
    cancelAnimationFrame(raf);
    $('tour').classList.add('saindo');
    await espera(600);
    parar(false);
  } catch (e) {
    if (!(e instanceof Parado)) { console.error(e); parar(true); }
  }
}

// voltar = parado no meio (som some rápido, a cidade volta ao estado de antes);
// fim natural = cadência e a cidade fica como o tour terminou (de noite, na vista da Pfalz)
function parar(voltar = true) {
  if (!ativo) return;
  ativo = false;
  somTour.parar(!voltar);
  cancelAnimationFrame(raf); cancelAnimationFrame(anim);
  for (const p of pendentes) { clearTimeout(p.id); p.falha(new Parado()); }
  pendentes.clear();
  $('tour').classList.add('saindo');
  $('tour-ano').classList.remove('on');
  // a data e a hora voltam às de antes (e o relógio ao vivo, se estava); no fim natural fica a noite do tour
  C.ceu.definirData(salvo.data); C.ceu.definirHora(salvo.hora);
  if (voltar) C.definirNoite(salvo.noite);
  C.ceu.aoVivo = salvo.vivo;
  C.controls.enabled = true;
  C.controls.update();
  $('tour').classList.remove('on');
  $('tour-cap').classList.remove('on');
  document.body.classList.remove('touring');
  setTimeout(() => { if (!ativo) $('tour').hidden = true; }, 900);
}

$('tour-abrir').addEventListener('click', () => iniciar());
$('tour-parar').addEventListener('click', () => parar(true));
const botaoSom = $('tour-som');
const marcarSom = () => { botaoSom.classList.toggle('mudo', !somTour.ligado()); botaoSom.setAttribute('aria-pressed', somTour.ligado()); };
botaoSom.addEventListener('click', () => { somTour.alternar(); marcarSom(); });
marcarSom();
addEventListener('keydown', (e) => { if (e.key === 'Escape' && ativo) parar(true); });

// ?tour=1 (ou ?tour=en|de): convite que pede o clique que libera o som; o parâmetro sai do endereço
const q = new URLSearchParams(location.search);
if (['1', 'pt', 'en', 'de'].includes(q.get('tour'))) {
  const lingua = q.get('tour');
  q.delete('tour');
  if (lingua === 'en' || lingua === 'de') q.set('lang', lingua);
  history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : '') + location.hash);
  const convite = $('tour-convite');
  convite.hidden = false;
  const fechar = () => { convite.hidden = true; removeEventListener('keydown', tecla); };
  const tecla = (e) => { if (e.key === 'Escape') fechar(); };
  addEventListener('keydown', tecla);
  convite.addEventListener('click', (e) => { fechar(); if (e.target.closest('button')) iniciar(); });
  convite.querySelector('button').focus();
}
window.tour = { iniciar, parar, ativo: () => ativo, cena: () => cenaAtual };
