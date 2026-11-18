// Três línguas: português (padrão), inglês e alemão. O idioma vem do endereço (?lang=en|de, ou
// ?tour=en|de, que também abre o convite do tour); o seletor PT/EN/DE recarrega com ?lang=.
(() => {
  const q = new URLSearchParams(location.search);
  const pedido = q.get('lang') || q.get('tour');
  const LANG = ['en', 'de'].includes(pedido) ? pedido : 'pt';
  window.LANG = LANG;
  window.t = (pt, en, de) => (LANG === 'en' ? en : LANG === 'de' ? de : pt);
  const LOC = { pt: 'pt-BR', en: 'en-GB', de: 'de-CH' }[LANG];
  window.fmt = (n) => n.toLocaleString(LOC);
  document.documentElement.lang = LOC;

  // textos fixos da página: chave → [pt, en, de]
  const T = {
    titulo: ['Basel, prédio por prédio', 'Basel, building by building', 'Basel, Haus für Haus'],
    descr: ['A Altstadt de Basel em 3D, prédio por prédio, com o ano de construção do registro federal e uma máquina do tempo de 1100 a 2026.',
      'Basel’s old town in 3D, building by building, with the construction year from the federal register and a time machine from 1100 to 2026.',
      'Die Basler Altstadt in 3D, Haus für Haus, mit dem Baujahr aus dem eidgenössischen Register und einer Zeitmaschine von 1100 bis 2026.'],
    carregando: ['Desenhando a cidade…', 'Drawing the city…', 'Die Stadt wird gezeichnet…'],
    sub: ['A Altstadt prédio por prédio, com o ano de cada um', 'The old town building by building, each with its year', 'Die Altstadt Haus für Haus, jedes mit seinem Baujahr'],
    tour: ['Tour de 1 min', '1-min tour', '1-Min-Tour'],
    'tour-titulo': ['Um passeio de 1 minuto, com som', 'A 1-minute flight, with sound', 'Ein Rundflug von 1 Minute, mit Ton'],
    maquina: ['máquina do tempo', 'time machine', 'Zeitmaschine'],
    epoca: ['cor por época', 'colour by era', 'Farbe nach Epoche'],
    noite: ['noite', 'night', 'Nacht'],
    palidos: ['lotes pálidos', 'pale plots', 'blasse Parzellen'],
    ruas: ['ruas e bondes', 'streets and trams', 'Strassen und Tram'],
    nota: ['Pálido: o prédio de hoje é mais novo que o ano escolhido; ali podia haver outro antes; os sem ano no registro também ficam pálidos antes de 2026. Prédios demolidos não estão no modelo 3D; os {d} que o registro federal lista como demolidos aparecem como pinos vermelhos enquanto existiam. O ano é o do registro (GWR), que às vezes é o de uma reconstrução.',
      'Pale: today’s building is newer than the chosen year; another one may have stood there before; buildings with no year on record are also pale before 2026. Demolished buildings are not in the 3D model; the {d} the federal register lists as demolished show as red pins while they stood. The year is the register’s (GWR), which is sometimes that of a rebuilding.',
      'Blass: Das heutige Haus ist jünger als das gewählte Jahr; vorher kann dort ein anderes gestanden haben; Häuser ohne Baujahr im Register sind vor 2026 ebenfalls blass. Abgebrochene Häuser fehlen im 3D-Modell; die {d}, die das GWR als abgebrochen führt, erscheinen als rote Stecknadeln, solange sie standen. Das Jahr ist jenes des Registers (GWR), manchmal das eines Neubaus.'],
    creditos: ['Prédios e relevo © <a href="https://www.swisstopo.admin.ch">swisstopo</a> · ano, andares e moradias: GWR (BFS) via <a href="https://data.bs.ch">data.bs.ch</a> · ruas © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      'Buildings and terrain © <a href="https://www.swisstopo.admin.ch">swisstopo</a> · year, floors and flats: GWR (FSO) via <a href="https://data.bs.ch">data.bs.ch</a> · streets © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      'Gebäude und Relief © <a href="https://www.swisstopo.admin.ch">swisstopo</a> · Baujahr, Geschosse, Wohnungen: GWR (BFS) via <a href="https://data.bs.ch">data.bs.ch</a> · Strassen © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'],
    convite: ['Começar o tour', 'Start the tour', 'Tour starten'],
    'convite-sub': ['1 minuto, com som', '1 minute, with sound', '1 Minute, mit Ton'],
    'som-titulo': ['Som do tour (liga/desliga)', 'Tour sound (on/off)', 'Ton der Tour (ein/aus)'],
    'aria-ano': ['Ano', 'Year', 'Jahr'],
    'aria-painel': ['Máquina do tempo', 'Time machine', 'Zeitmaschine'],
    fechar: ['Fechar', 'Close', 'Schliessen'],
  };
  window.T = (k) => t(...T[k]);

  function aplicar() {
    document.title = T.titulo[{ pt: 0, en: 1, de: 2 }[LANG]];
    document.querySelector('meta[name=description]').content = window.T('descr');
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = window.T(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = window.T(el.dataset.i18nHtml); });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = window.T(el.dataset.i18nTitle); });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', window.T(el.dataset.i18nAria)); });
    // seletor de idioma
    document.querySelectorAll('#linguas button').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.lang === LANG);
      b.addEventListener('click', () => {
        const p = new URLSearchParams(location.search);
        p.delete('tour');
        if (b.dataset.lang === 'pt') p.delete('lang'); else p.set('lang', b.dataset.lang);
        location.search = p.toString();
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aplicar); else aplicar();
})();
