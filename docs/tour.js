// Tour de 1 minuto pela Altstadt, no estilo de cinema (faixas 2.39:1, legenda com kicker e frase),
// com a música de som.js. Abre pelo botão "Tour de 1 min" ou por ?tour=1 (?tour=en|de muda a língua).
// Esc ou "✕ esc" param e deixam a câmera onde estava; a cidade volta ao ano, cor e hora de antes.
// Todos os números das legendas são contados dos dados carregados (cidade.estat).
// Roteiro, legendas e música descritos em design/tour.md.
const $ = (id) => document.getElementById(id);
const C = window.cidade;
const { THREE } = C;
const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rad = THREE.MathUtils.degToRad;

let ativo = false, inicio = 0, raf = 0, anim = 0, salvo = null, cenaAtual = 0, TOTAL = 60000, t0Cena = 0;
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

// varredura da máquina do tempo: de um ano a outro em ms, lisa na régua não linear do painel
// (1100–1500 e 1800–1900 com o mesmo tempo de tela), mostrando o ano grande no canto
function varrer(de, ate, ms) {
  const rotulo = $('tour-ano');
  rotulo.classList.add('on');
  const NOS = [[0, 1100], [0.22, 1500], [0.4, 1800], [0.72, 1900], [1, 2026]];
  const ano = (x) => { for (let i = 1; i < NOS.length; i++) if (x <= NOS[i][0]) { const [a, ya] = NOS[i - 1], [b, yb] = NOS[i]; return ya + ((x - a) / (b - a)) * (yb - ya); } return 2026; };
  const x0 = NOS.findLast(([, y]) => y <= de)[0], x1 = 1;
  const t0 = performance.now();
  let antes = de, tAntes = t0;
  return new Promise((ok) => {
    const passo = (agora) => {
      if (!ativo) return ok();
      const t = Math.min(1, (agora - t0) / ms), y = ano(x0 + (x1 - x0) * suave(t));
      C.definirAno(Math.min(y, ate));
      rotulo.textContent = Math.round(Math.min(y, ate));
      const dt = (agora - tAntes) / 1000;
      if (dt > 0.1) { somTour.varredura(Math.abs(y - antes) / dt); antes = y; tAntes = agora; }
      if (t < 1) requestAnimationFrame(passo);
      else { somTour.varredura(0); setTimeout(() => rotulo.classList.remove('on'), 1600); ok(); }
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
  const antigos = E.maisAntigos;
  const lista = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${t('e', 'and', 'und')} ${xs.at(-1)}`);
  return [
    // 0 · abertura: do alto, a cidade inteira girando, descendo para a vista da Pfalz sobre o Reno
    { dur: 9000, run: async () => {
      C.definirAno(2026); C.definirModo('gravura'); C.definirNoite(false);
      C.porCamera({ alvo: [0, 0, 0], dist: 1900, az: rad(230), polar: rad(28) });
      mover(C.VISTA_PFALZ, 9000, { giro: -80 + 0 });
      await legenda('Basel · Altstadt', t(
        `${fmt(E.total)} prédios, um por um: a forma vem da swisstopo e o ano de cada um, do registro federal de prédios.`,
        `${fmt(E.total)} buildings, one by one: the shape from swisstopo, and each one’s year from the federal building register.`,
        `${fmt(E.total)} Häuser, eines nach dem anderen: die Form von swisstopo, das Baujahr aus dem eidgenössischen Gebäuderegister.`));
    } },
    // 1 · o Münster: o ano mais antigo do registro
    { dur: 10000, run: async () => {
      mover({ alvo: munster, dist: 210, polar: rad(64), az: rad(200) }, 3500, { arco: 0.25 });
      await em(3500);
      mover({}, 6500, { giro: 110 });
      await legenda(`Münster · ${E.minimo}`, t(
        `O ano mais antigo do registro: ${lista(antigos)} constam como de ${E.minimo}.`,
        `The oldest year in the register: ${lista(antigos)} are listed as built in ${E.minimo}.`,
        `Das älteste Jahr im Register: ${lista(antigos)} sind mit ${E.minimo} eingetragen.`));
    } },
    // 2 · a máquina do tempo: 1100 → 2026, cada prédio sobe no seu ano, com o rufo do tambor
    { dur: 15000, run: async () => {
      C.palidos(true);
      C.definirAno(1100);
      mover({ alvo: [20, 0, 20], dist: 900, polar: rad(54), az: rad(170) }, 2500, { arco: 0.15 });
      await legenda('1100 → 2026', t(
        'Cada prédio sobe no ano que o registro lhe dá. Pálidos, os lotes cujo prédio de hoje ainda não existia.',
        'Each building rises in the year the register gives it. Pale: plots whose present building did not exist yet.',
        'Jedes Haus wächst im Jahr, das ihm das Register gibt. Blass: Parzellen, deren heutiges Haus noch nicht stand.'));
      await em(2500);
      mover({ dist: 760 }, 12500, { giro: 50 });
      await em(3000);
      const v = varrer(1100, 2026, 10500);
      await em(8200);
      await legenda(t('Século XIX', '19th century', '19. Jahrhundert'), t(
        `${fmt(E.sec19)} dos ${fmt(E.comAno)} prédios com ano têm data entre 1800 e 1899 no registro.`,
        `${fmt(E.sec19)} of the ${fmt(E.comAno)} dated buildings carry a year between 1800 and 1899 in the register.`,
        `${fmt(E.sec19)} der ${fmt(E.comAno)} Häuser mit Baujahr tragen im Register ein Jahr zwischen 1800 und 1899.`));
      await v;
    } },
    // 3 · cor por época: voo baixo ao longo do Reno até a Mittlere Brücke
    { dur: 10000, run: async () => {
      C.definirModo('epoca');
      C.definirAno(2026);
      mover({ alvo: [330, 0, -60], dist: 330, polar: rad(70), az: rad(120) }, 2500);
      await legenda(t('Cor por época', 'Colour by era', 'Farbe nach Epoche'), t(
        `Do vermelho-escuro dos ${fmt(E.porEpoca[0])} anteriores a 1500 ao azul dos ${fmt(E.porEpoca[5])} deste século.`,
        `From the dark red of the ${fmt(E.porEpoca[0])} built before 1500 to the blue of the ${fmt(E.porEpoca[5])} from this century.`,
        `Vom Dunkelrot der ${fmt(E.porEpoca[0])} Häuser vor 1500 bis zum Blau der ${fmt(E.porEpoca[5])} aus diesem Jahrhundert.`));
      await em(2500);
      mover({ alvo: [-80, 0, -150], dist: 260, polar: rad(72), az: rad(150) }, 7500);
    } },
    // 4 · Rathaus: o ano do registro nem sempre é o da primeira pedra
    { dur: 8000, run: async () => {
      C.definirModo('gravura');
      mover({ alvo: rathaus, dist: 280, polar: rad(55), az: rad(250) }, 3000, { arco: 0.2 });
      await legenda(t('Rathaus · Marktplatz', 'Rathaus · Marktplatz', 'Rathaus · Marktplatz'), t(
        `O registro dá ${E.rathaus?.ano} à prefeitura, construída entre 1504 e 1514: o ano do GWR nem sempre é o da primeira pedra.`,
        `The register gives the town hall ${E.rathaus?.ano}, though it was built in 1504–1514: the GWR year is not always that of the first stone.`,
        `Das Register gibt dem Rathaus ${E.rathaus?.ano}, gebaut wurde es 1504–1514: Das GWR-Jahr ist nicht immer das des Grundsteins.`));
      await em(3000);
      mover({}, 5000, { giro: 70 });
    } },
    // 5 · noite: as janelas acendem e a câmera volta à vista da Pfalz
    { dur: 8000, run: async () => {
      C.definirNoite(true);
      mover(C.VISTA_PFALZ, 7500, { arco: 0.2 });
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
  salvo = { ano: C.ano(), modo: C.modo(), noite: C.noite(), palidos: C.temPalidos() };
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
  somTour.varredura(0);
  somTour.parar(!voltar);
  cancelAnimationFrame(raf); cancelAnimationFrame(anim);
  for (const p of pendentes) { clearTimeout(p.id); p.falha(new Parado()); }
  pendentes.clear();
  $('tour').classList.add('saindo');
  $('tour-ano').classList.remove('on');
  if (voltar) { C.definirAno(salvo.ano); C.definirModo(salvo.modo); C.definirNoite(salvo.noite); C.palidos(salvo.palidos); }
  else C.definirAno(2026);
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
