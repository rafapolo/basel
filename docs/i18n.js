// Duas línguas no site: inglês (padrão) e alemão. O idioma vem do endereço (?lang=de, ou ?tour=de,
// que também abre o convite do tour); o seletor EN/DE recarrega com ?lang=. Os textos em português
// continuam nas tabelas (primeiro elemento) mas não são mais oferecidos.
(() => {
  const q = new URLSearchParams(location.search);
  const pedido = q.get('lang') || q.get('tour');
  const LANG = pedido === 'de' ? 'de' : 'en';
  window.LANG = LANG;
  window.t = (pt, en, de) => (LANG === 'en' ? en : LANG === 'de' ? de : pt);
  const LOC = { pt: 'pt-BR', en: 'en-GB', de: 'de-CH' }[LANG];
  window.fmt = (n) => n.toLocaleString(LOC);
  document.documentElement.lang = LOC;

  // textos fixos da página: chave → [pt, en, de]
  const T = {
    titulo: ['Basel, prédio por prédio', 'Basel, building by building', 'Basel, Haus für Haus'],
    descr: ['A Altstadt de Basel em 3D, prédio por prédio, na hora, na data e na estação de agora, com gente, bondes e o Reno.',
      'Basel’s old town in 3D, building by building, at the current time, date and season, with people, trams and the Rhine.',
      'Die Basler Altstadt in 3D, Haus für Haus, zur aktuellen Uhrzeit, Jahreszeit und Stunde, mit Menschen, Trams und dem Rhein.'],
    carregando: ['Desenhando a cidade…', 'Drawing the city…', 'Die Stadt wird gezeichnet…'],
    sub: ['A Altstadt prédio por prédio, agora', 'The old town building by building, right now', 'Die Altstadt Haus für Haus, jetzt'],
    tour: ['Tour de 1min30', '90-second tour', '90-Sekunden-Tour'],
    'tour-titulo': ['Um passeio de 90 segundos pela cidade e pelas estações, com som', 'A 90-second flight through the city and the seasons, with sound', 'Ein Rundflug von 90 Sekunden durch Stadt und Jahreszeiten, mit Ton'],
    noite: ['noite', 'night', 'Nacht'],
    ruas: ['ruas e bondes', 'streets and trams', 'Strassen und Tram'],
    nota: ['A cidade abre na hora e na data de Basel e acompanha o relógio; mudar a hora, a data ou a noite congela o relógio. A estação muda as árvores, as roupas, a luz e quem está no Rheinbord. Clique num prédio para ver ano, andares e uso no registro federal (GWR).',
      'The city opens at Basel’s current time and date and follows the clock; changing the hour, the date or night freezes it. The season changes the trees, the clothes, the light and who is out on the Rheinbord. Click a building for its year, floors and use in the federal register (GWR).',
      'Die Stadt öffnet zur aktuellen Basler Uhrzeit und geht mit der Uhr; wer Stunde, Datum oder Nacht ändert, hält sie an. Die Jahreszeit ändert Bäume, Kleidung, Licht und wer am Rheinbord sitzt. Klicken Sie auf ein Haus für Baujahr, Geschosse und Nutzung im eidgenössischen Register (GWR).'],
    creditos: ['Prédios e relevo © <a href="https://www.swisstopo.admin.ch">swisstopo</a> · ano, andares e moradias: GWR (BFS) via <a href="https://data.bs.ch">data.bs.ch</a> · ruas © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · horários dos bondes: <a href="https://opentransportdata.swiss">opentransportdata.swiss</a> · contagens e zonas de nado: <a href="https://data.bs.ch">data.bs.ch</a>',
      'Buildings and terrain © <a href="https://www.swisstopo.admin.ch">swisstopo</a> · year, floors and flats: GWR (FSO) via <a href="https://data.bs.ch">data.bs.ch</a> · streets © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · tram timetables: <a href="https://opentransportdata.swiss">opentransportdata.swiss</a> · counts and swimming zones: <a href="https://data.bs.ch">data.bs.ch</a>',
      'Gebäude und Relief © <a href="https://www.swisstopo.admin.ch">swisstopo</a> · Baujahr, Geschosse, Wohnungen: GWR (BFS) via <a href="https://data.bs.ch">data.bs.ch</a> · Strassen © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Tramfahrplan: <a href="https://opentransportdata.swiss">opentransportdata.swiss</a> · Zählungen und Schwimmzonen: <a href="https://data.bs.ch">data.bs.ch</a>'],
    convite: ['Começar o tour', 'Start the tour', 'Tour starten'],
    'convite-sub': ['90 segundos, com som', '90 seconds, with sound', '90 Sekunden, mit Ton'],
    'som-titulo': ['Som do tour (liga/desliga)', 'Tour sound (on/off)', 'Ton der Tour (ein/aus)'],
    'aria-painel': ['Basel agora', 'Basel now', 'Basel jetzt'],
    hora: ['hora do dia', 'time of day', 'Tageszeit'],
    vida: ['gente e bondes', 'people and trams', 'Leben und Tram'],
    ambiente: ['som ambiente', 'ambient sound', 'Umgebungsgeräusche'],
    leve: ['modo leve', 'light mode', 'Leichtmodus'],
    'aria-hora': ['Hora do dia', 'Time of day', 'Tageszeit'],
    'aria-data': ['Data', 'Date', 'Datum'],
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
        if (b.dataset.lang === 'en') p.delete('lang'); else p.set('lang', b.dataset.lang);
        location.search = p.toString();
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aplicar); else aplicar();
})();
