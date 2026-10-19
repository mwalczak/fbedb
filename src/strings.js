// The page's texts in English and Polish. The server picks the language from the browser's
// Accept-Language (see pickLang); the page gets the chosen set as T. {name} parts are filled in
// with fmt(), and counts use plural forms chosen by Intl.PluralRules (Polish has one/few/many).

const STRINGS = {
  en: {
    title: 'Events',
    description: "Upcoming concerts, theatre, club nights and other events around Rybnik and Silesia, gathered from venues' Facebook pages into one list. No Facebook account needed.",
    ogTitle: 'Events around Rybnik',
    menu: 'Menu',
    pagesOpen: 'Pages we check',
    suggestOpen: 'Suggest a Page',
    manage: 'Manage Pages',
    about: 'About',
    venue: 'Venue',
    newBtn: 'New',
    newTitle: 'Only events added in the last 3 days',
    search: 'Search name or place',
    searchLabel: 'Search',
    loading: 'Loading…',
    close: 'Close',
    aboutHtml: `<p>Upcoming events around Rybnik and Silesia in one list: concerts, theatre, club nights,
    festivals and more. They're gathered from the Facebook pages of local venues and from
    Facebook's events in Rybnik, so you can see what's on without scrolling Facebook,
    and without a Facebook account.</p>
  <p>The list is updated twice a day and shows only what's still ahead, nearest first.
    Tap an event to open it on Facebook for details and tickets.</p>
  <ul class="about">
    <li>Pick a venue, or tap <b>New</b> for events added in the last few days.</li>
    <li><b>Pages we check</b> lists the venues we follow. Missing one? <b>Suggest a Page</b>.</li>
  </ul>`,
    pagesSearch: 'Search a venue or address',
    pagesSearchLabel: 'Search Pages',
    pagesSuggest: 'Not here? Suggest a Page',
    suggestIntro: "A Facebook Page with events worth following. It's checked once the admin approves it.",
    sugSeePages: 'See the Pages we already check',
    namePh: 'Name (optional)',
    notePh: 'Why this venue? (optional)',
    byPh: 'Your name (optional)',
    suggestBtn: 'Suggest',
    login: 'Log in',
    tokenPh: 'Token',
    adminTitle: 'Facebook Pages to check',
    add: 'Add',
    pendingTitle: 'Waiting for approval',
    onList: 'On the list',
    logout: 'Log out',

    allVenues: 'All venues',
    nearby: 'Nearby (from the town page)',
    noEventsNow: '(no events now)',
    events: { one: '{n} event', other: '{n} events' },
    countOf: '{n} of ',
    lastCollected: 'last collected {when}',
    noMatch: 'No events match.',
    noEvents: 'No events yet.',
    dateUnknown: 'Date unknown',
    tagNew: 'new',
    tagNearby: 'nearby',
    noName: '(no name)',
    online: ' (online)',
    loginToSee: 'Log in (Manage Pages) to see the events.',
    loadFailed: 'Could not load events: ',
    wrongToken: 'Wrong token.',
    tooManyAttempts: 'Too many attempts, wait a minute.',
    noPagesAdmin: 'No Pages yet. Add the first one above.',
    pendingCount: 'Waiting for approval ({n})',
    approve: 'Approve',
    namePrompt: 'Name for this Page',
    reject: 'Reject',
    rejectPrompt: 'Reject {name}? Reason (optional):',
    suggested: 'suggested {when}',
    suggestedBy: 'suggested {when} by {name}',
    similar: 'Similar name: {names} — maybe the same venue?',
    alsoSuggested: ' (also suggested)',
    checkToggle: 'Check this Page (untick to pause)',
    rename: 'Rename',
    remove: 'Remove',
    removeConfirm: 'Stop checking {name}? Its events stay on the list.',
    checkNext: 'Check on next run',
    backAdaptive: 'Back to adaptive',
    alwaysCheck: 'Always check',
    paused: 'paused',
    always: 'checked on every run (always)',
    everyRun: 'every run',
    daily: 'daily',
    weekly: 'weekly',
    everyDays: 'every {n} days',
    notChecked: 'not checked yet',
    checked: 'checked {every}',
    dueNext: ', due on next run',
    nextOn: ', next {when}',
    pagesLoadFailed: 'Could not load the Pages: ',
    pagesMatch: '{shown} of {total} match',
    pages: { one: '{n} Page', other: '{n} Pages' },
    waitingN: ', {n} waiting for approval',
    noPageMatch: 'No Page matches “{q}”. You can suggest it.',
    noPages: 'No Pages yet.',
    waiting: 'waiting for approval',
    showOnList: 'show on the list',
    thanks: 'Thanks! The Page is checked once the admin approves it.',
    added: 'Added. Its events show up after the next daily run.',
    notPageUrl: 'This is not a Facebook Page address.',
    known: {
      active: 'This Page is already on the list.',
      pending: 'This Page was already suggested and is waiting for approval.',
      rejected: 'This Page was suggested before and not taken on.',
      removed: 'This Page was on the list before and was taken off.',
    },
    tooManySuggestions: 'Too many suggestions from here, try again in an hour.',
  },

  pl: {
    title: 'Wydarzenia',
    description: 'Nadchodzące koncerty, spektakle, imprezy klubowe i inne wydarzenia w Rybniku i na Śląsku, zebrane ze stron lokali na Facebooku w jedną listę. Bez konta na Facebooku.',
    ogTitle: 'Wydarzenia w Rybniku i okolicy',
    menu: 'Menu',
    pagesOpen: 'Sprawdzane strony',
    suggestOpen: 'Zaproponuj stronę',
    manage: 'Zarządzaj stronami',
    about: 'O stronie',
    venue: 'Miejsce',
    newBtn: 'Nowe',
    newTitle: 'Tylko wydarzenia dodane w ostatnich 3 dniach',
    search: 'Szukaj nazwy lub miejsca',
    searchLabel: 'Szukaj',
    loading: 'Wczytywanie…',
    close: 'Zamknij',
    aboutHtml: `<p>Nadchodzące wydarzenia w Rybniku i na Śląsku na jednej liście: koncerty, teatr, imprezy
    klubowe, festiwale i nie tylko. Zbieramy je ze stron lokalnych miejsc na Facebooku i z wydarzeń
    w Rybniku na Facebooku, więc widać, co się dzieje, bez przewijania Facebooka
    i bez konta na Facebooku.</p>
  <p>Lista jest aktualizowana dwa razy dziennie i pokazuje tylko to, co jeszcze przed nami,
    od najbliższych. Kliknij wydarzenie, żeby otworzyć je na Facebooku – tam są szczegóły i bilety.</p>
  <ul class="about">
    <li>Wybierz miejsce albo kliknij <b>Nowe</b>, żeby zobaczyć wydarzenia dodane w ostatnich dniach.</li>
    <li><b>Sprawdzane strony</b> to miejsca, które obserwujemy. Brakuje jakiegoś? <b>Zaproponuj stronę</b>.</li>
  </ul>`,
    pagesSearch: 'Szukaj miejsca lub adresu',
    pagesSearchLabel: 'Szukaj stron',
    pagesSuggest: 'Nie ma jej tu? Zaproponuj stronę',
    suggestIntro: 'Strona na Facebooku z wydarzeniami wartymi uwagi. Zaczniemy ją sprawdzać, gdy administrator ją zatwierdzi.',
    sugSeePages: 'Zobacz strony, które już sprawdzamy',
    namePh: 'Nazwa (opcjonalnie)',
    notePh: 'Dlaczego to miejsce? (opcjonalnie)',
    byPh: 'Twoje imię (opcjonalnie)',
    suggestBtn: 'Zaproponuj',
    login: 'Zaloguj się',
    tokenPh: 'Token',
    adminTitle: 'Strony na Facebooku do sprawdzania',
    add: 'Dodaj',
    pendingTitle: 'Czekają na zatwierdzenie',
    onList: 'Na liście',
    logout: 'Wyloguj się',

    allVenues: 'Wszystkie miejsca',
    nearby: 'W okolicy (ze strony miasta)',
    noEventsNow: '(teraz bez wydarzeń)',
    events: { one: '{n} wydarzenie', few: '{n} wydarzenia', many: '{n} wydarzeń', other: '{n} wydarzenia' },
    countOf: '{n} z ',
    lastCollected: 'ostatnia aktualizacja {when}',
    noMatch: 'Brak pasujących wydarzeń.',
    noEvents: 'Na razie brak wydarzeń.',
    dateUnknown: 'Data nieznana',
    tagNew: 'nowe',
    tagNearby: 'w okolicy',
    noName: '(bez nazwy)',
    online: ' (online)',
    loginToSee: 'Zaloguj się (Zarządzaj stronami), żeby zobaczyć wydarzenia.',
    loadFailed: 'Nie udało się wczytać wydarzeń: ',
    wrongToken: 'Nieprawidłowy token.',
    tooManyAttempts: 'Zbyt wiele prób, odczekaj minutę.',
    noPagesAdmin: 'Nie ma jeszcze stron. Dodaj pierwszą powyżej.',
    pendingCount: 'Czekają na zatwierdzenie ({n})',
    approve: 'Zatwierdź',
    namePrompt: 'Nazwa tej strony',
    reject: 'Odrzuć',
    rejectPrompt: 'Odrzucić {name}? Powód (opcjonalnie):',
    suggested: 'zaproponowano {when}',
    suggestedBy: 'zaproponowano {when}, zgłasza: {name}',
    similar: 'Podobna nazwa: {names} — może to samo miejsce?',
    alsoSuggested: ' (też zaproponowana)',
    checkToggle: 'Sprawdzaj tę stronę (odznacz, żeby wstrzymać)',
    rename: 'Zmień nazwę',
    remove: 'Usuń',
    removeConfirm: 'Przestać sprawdzać {name}? Jej wydarzenia zostaną na liście.',
    checkNext: 'Sprawdź przy następnym przebiegu',
    backAdaptive: 'Wróć do trybu adaptacyjnego',
    alwaysCheck: 'Sprawdzaj zawsze',
    paused: 'wstrzymana',
    always: 'sprawdzana przy każdym przebiegu (zawsze)',
    everyRun: 'przy każdym przebiegu',
    daily: 'codziennie',
    weekly: 'co tydzień',
    everyDays: 'co {n} dni',
    notChecked: 'jeszcze nie sprawdzana',
    checked: 'sprawdzana {every}',
    dueNext: ', następnym razem przy najbliższym przebiegu',
    nextOn: ', następnym razem {when}',
    pagesLoadFailed: 'Nie udało się wczytać stron: ',
    pagesMatch: 'pasujące: {shown} z {total}',
    pages: { one: '{n} strona', few: '{n} strony', many: '{n} stron', other: '{n} strony' },
    waitingN: ', czeka na zatwierdzenie: {n}',
    noPageMatch: 'Żadna strona nie pasuje do „{q}”. Możesz ją zaproponować.',
    noPages: 'Nie ma jeszcze stron.',
    waiting: 'czeka na zatwierdzenie',
    showOnList: 'pokaż na liście',
    thanks: 'Dzięki! Zaczniemy sprawdzać stronę, gdy administrator ją zatwierdzi.',
    added: 'Dodano. Jej wydarzenia pojawią się po najbliższym przebiegu.',
    notPageUrl: 'To nie jest adres strony na Facebooku.',
    known: {
      active: 'Ta strona już jest na liście.',
      pending: 'Ta strona została już zaproponowana i czeka na zatwierdzenie.',
      rejected: 'Ta strona była już proponowana i nie została przyjęta.',
      removed: 'Ta strona była już na liście i została z niej usunięta.',
    },
    tooManySuggestions: 'Zbyt wiele propozycji stąd, spróbuj ponownie za godzinę.',
  },
};

/**
 * 'pl' or 'en' from an Accept-Language header: whichever of the two the browser ranks higher.
 * A browser asking for neither (German, say) gets English; no header at all (link previews,
 * bots) gets Polish, the language of the town the events are in.
 */
function pickLang(header) {
  if (!header) return 'pl';
  const ranked = header.split(',')
    .map((part, i) => {
      const [tag, ...params] = part.trim().toLowerCase().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return { lang: tag.split('-')[0], q: q ? Number(q.slice(2)) : 1, i };
    })
    .filter((x) => (x.lang === 'pl' || x.lang === 'en') && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  return ranked.length ? ranked[0].lang : 'en';
}

module.exports = { STRINGS, pickLang };
