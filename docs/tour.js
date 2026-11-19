// Tour de 2 min pela Altstadt de hoje, no estilo de cinema (faixas 2.39:1, legenda com kicker e frase), com a música de
// som.js: um passeio pelos lugares conhecidos e pelo Reno enquanto o ano corre de janeiro a dezembro. Abre pelo botão do tour ou por ?tour=1 (?tour=de muda a
// língua). Esc ou "✕ esc" param e deixam a câmera onde estava; a cidade volta à data, hora e noite de antes.
// Todos os números das legendas são contados dos dados carregados (cidade.estat).
// Roteiro, legendas e música descritos em design/tour.md.
const $ = (id) => document.getElementById(id);
const C = window.cidade;
const { THREE } = C;
const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rad = THREE.MathUtils.degToRad;

let ativo = false, inicio = 0, raf = 0, anim = 0, salvo = null, cenaAtual = 0, TOTAL = 120000, t0Cena = 0, anoInteiro = null;
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
  const E = C.estat, ano = +C.ceu.estado().data.slice(0, 4);
  // centro de um prédio pelo nome, com reserva (se o nome não estiver nos dados, o tour segue)
  const lugar = (nome, reserva) => { const c = C.centro(nome); return c[0] === 0 && c[2] === 0 ? reserva : c; };
  const munster = lugar('Münster', [213, 20, 211]), rathaus = lugar('Rathaus', [-81, 15, 10]);
  const martin = lugar('Martinskirche', [-73, 18, -57]), kulturen = lugar('Museum der Kulturen', [40, 18, 120]);
  const barfi = lugar('Barfüsserkirche (Historisches Museum)', [-10, 15, 420]), leonhard = lugar('St. Leonhardskirche', [-100, 25, 365]);
  return [
    // 0 · abertura: do alto, a cidade inteira girando; o ano começa a correr (janeiro → dezembro em 2 min)
    { dur: 12000, run: async () => {
      C.definirNoite(false); C.ceu.definirHora(14);
      anoInteiro = estacoes(TOTAL - 8000, ano);
      C.porCamera({ alvo: [0, 0, 0], dist: 1900, az: rad(230), polar: rad(28) });
      mover({ alvo: [60, 0, -40], dist: 760, polar: rad(58), az: rad(160) }, 12000, { giro: -70 });
      await legenda(t('Basel · um ano em 2 minutos', 'Basel · a year in two minutes', 'Basel · ein Jahr in zwei Minuten'), t(
        `${fmt(E.total)} prédios, um por um; enquanto o passeio anda, o ano corre de janeiro a dezembro.`,
        `${fmt(E.total)} buildings, one by one; while we fly, the year runs from January to December.`,
        `${fmt(E.total)} Häuser, eines nach dem anderen; während wir fliegen, läuft das Jahr von Januar bis Dezember.`));
    } },
    // 1 · Münster e Pfalz: volta baixa em torno da catedral
    { dur: 14000, run: async () => {
      mover({ alvo: munster, dist: 190, polar: rad(70), az: rad(200) }, 4000, { arco: 0.25 });
      await legenda('Münster · Pfalz', t(
        'O Münster de arenito vermelho e o terraço da Pfalz, uns 20 m acima do Reno.',
        'The red sandstone Münster and the Pfalz terrace, some 20 m above the Rhine.',
        'Das Münster aus rotem Sandstein und die Pfalz, rund 20 m über dem Rhein.'));
      await em(4000);
      mover({ dist: 150 }, 10000, { giro: 140 });
    } },
    // 2 · pelas vielas acima do Reno: Museum der Kulturen → Martinskirche (Rheinsprung)
    { dur: 13000, run: async () => {
      mover({ alvo: kulturen, dist: 120, polar: rad(74), az: rad(250) }, 4000);
      await legenda('Rheinsprung · Martinskirche', t(
        'Ruas estreitas na colina entre o Münster e a Martinskirche, a mais antiga paróquia da cidade.',
        'Narrow lanes on the hill between the Münster and the Martinskirche, the city’s oldest parish church.',
        'Enge Gassen auf dem Hügel zwischen Münster und Martinskirche, der ältesten Pfarrkirche der Stadt.'));
      await em(4000);
      mover({ alvo: martin, dist: 110, polar: rad(72), az: rad(300) }, 9000);
    } },
    // 3 · Mittlere Brücke e Käppelijoch, atravessando para Kleinbasel
    { dur: 14000, run: async () => {
      mover({ alvo: [25, 10, -204], dist: 140, polar: rad(68), az: rad(120) }, 4500, { arco: 0.2 });
      await legenda('Mittlere Brücke · Käppelijoch', t(
        'A ponte de pedra e a capelinha no meio dela; os bondes verdes e amarelos rodam pelo horário de verdade.',
        'The stone bridge and the little chapel at its middle; the green and yellow trams run on the real timetable.',
        'Die Steinbrücke mit dem Kapellchen in der Mitte; die grünen und gelben Trams fahren nach dem echten Fahrplan.'));
      await em(4500);
      mover({ alvo: [80, 6, -250], dist: 120, polar: rad(74) }, 9500, { giro: 90 });
    } },
    // 4 · Kleinbasel: Rheinbord e Clarastrasse
    { dur: 12000, run: async () => {
      mover({ alvo: [192, 4, -172], dist: 160, polar: rad(70), az: rad(20) }, 4000);
      await legenda('Kleinbasel · Rheinbord', t(
        'Gente sentada nos degraus do Reno; a Clarastrasse sobe da margem até a Claraplatz.',
        'People sitting on the Rhine steps; the Clarastrasse runs up from the bank to the Claraplatz.',
        'Menschen auf den Rheinstufen; die Clarastrasse führt vom Ufer hinauf zum Claraplatz.'));
      await em(4000);
      mover({ alvo: [355, 6, -367], dist: 170, polar: rad(66) }, 8000, { giro: 60 });
    } },
    // 5 · o Reno: voo baixo rio abaixo, da Wettsteinbrücke até depois da Mittlere
    { dur: 14000, run: async () => {
      mover({ alvo: [420, 0, 120], dist: 220, polar: rad(76), az: rad(60) }, 4000, { arco: 0.3 });
      await legenda('Rhein', t(
        'No verão, a gente desce o rio nadando; as balsas cruzam presas a um cabo, levadas só pela corrente.',
        'In summer people swim downstream; the ferries cross on a cable, pushed by the current alone.',
        'Im Sommer schwimmt man den Rhein hinunter; die Fähren hängen an einem Seil und fahren nur mit der Strömung.'));
      await em(4000);
      mover({ alvo: [-260, 0, -430], dist: 240, polar: rad(74), az: rad(140) }, 10000);
    } },
    // 6 · Marktplatz e Rathaus
    { dur: 14000, run: async () => {
      mover({ alvo: rathaus, dist: 200, polar: rad(62), az: rad(250) }, 4500, { arco: 0.25 });
      await legenda('Marktplatz · Rathaus', t(
        'A prefeitura vermelha e a praça do mercado, com as rodinhas de gente.',
        'The red town hall and the market square, with people standing around.',
        'Das rote Rathaus und der Marktplatz, mit Leuten, die zusammenstehen.'));
      await em(4500);
      mover({ dist: 160 }, 9500, { giro: 100 });
    } },
    // 7 · Barfüsserplatz e St. Leonhard
    { dur: 13000, run: async () => {
      mover({ alvo: barfi, dist: 190, polar: rad(64), az: rad(200) }, 4000);
      await legenda('Barfüsserplatz · St. Leonhard', t(
        'No Barfi os bondes se cruzam; acima, na colina, a igreja de St. Leonhard.',
        'Trams cross at the Barfi; up on the hill above it, St. Leonhard’s church.',
        'Am Barfi kreuzen sich die Trams; oben auf dem Hügel die Leonhardskirche.'));
      await em(4000);
      mover({ alvo: leonhard, dist: 170, polar: rad(66) }, 9000, { giro: 70 });
    } },
    // 8 · final: sobe e dá a volta na cidade enquanto anoitece; termina na vista da Pfalz
    { dur: 14000, run: async () => {
      mover({ alvo: [40, 0, -20], dist: 900, polar: rad(55) }, 7000, { giro: 160 });
      await legenda(t('Basel · dados abertos', 'Basel · open data', 'Basel · offene Daten'), t(
        'swisstopo, o registro federal de prédios via data.bs.ch, o OpenStreetMap e o tempo de agora. Clique em qualquer prédio.',
        'swisstopo, the federal building register via data.bs.ch, OpenStreetMap and today’s weather. Click any building.',
        'swisstopo, das eidgenössische Gebäuderegister via data.bs.ch, OpenStreetMap und das Wetter von heute. Klicken Sie auf ein Haus.'));
      await em(6000);
      C.definirNoite(true);
      mover(C.VISTA_PFALZ, 7500, { arco: 0.15 });
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
