// The one web page: the events list (public or behind the token) and managing Pages (token).
// Plain HTML + JS, rendered in the browser from /api/events, so the token never sits in a cookie.

function page({ publicList }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Events</title>
<style>
  :root { color-scheme: light dark; --line: color-mix(in srgb, CanvasText 14%, transparent); --dim: color-mix(in srgb, CanvasText 62%, transparent); --accent: #2f6fdb; }
  body { margin: 0; font-family: system-ui, sans-serif; background: Canvas; color: CanvasText; line-height: 1.4; }
  main { max-width: 760px; margin: 0 auto; padding: 16px; }
  header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 4px 0 12px; }
  .stats { color: var(--dim); margin: 0; }
  /* Count and "last collected" on their own lines, so filtering never re-wraps the header. */
  .stats span { display: block; }
  .stats #collected { font-size: .85rem; }
  header { align-items: center; }
  .menu { position: relative; }
  .burger { font-size: 1.4rem; line-height: 1; padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; background: Canvas; cursor: pointer; }
  #menuList { position: absolute; right: 0; top: calc(100% + 4px); z-index: 10; list-style: none; margin: 0; padding: 4px 0;
    min-width: 190px; background: Canvas; border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 6px 20px rgb(0 0 0 / .18); }
  #menuList button { display: block; width: 100%; text-align: left; padding: 10px 14px; border: 0; background: none; cursor: pointer; white-space: nowrap; }
  #menuList button:hover, #menuList button:focus-visible { background: color-mix(in srgb, CanvasText 8%, Canvas); }
  #pagesSearch { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: Canvas; margin: 4px 0 8px; }
  .pg { padding: 8px 0; border-bottom: 1px solid var(--line); }
  .pg .meta { color: var(--dim); font-size: .85rem; }
  .pg.waiting a, .pg.paused a { opacity: .75; }
  dialog textarea { flex: 1 1 100%; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: Canvas; min-height: 4em; font: inherit; color: inherit; }
  dialog label.full { flex: 1 1 100%; color: var(--dim); font-size: .9rem; }
  .trap { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
  .pending { padding: 8px 0; border-bottom: 1px solid var(--line); }
  .pending .meta { font-size: .85rem; }
  .pending .warn { color: #c77700; font-size: .85rem; }
  .pending .row { justify-content: flex-start; gap: 12px; margin-top: 4px; }
  h4 { margin: 16px 0 4px; font-size: .9rem; text-transform: uppercase; letter-spacing: .04em; color: var(--dim); }
  button, input, select { font: inherit; color: inherit; }
  .link { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; }
  .filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 8px; }
  .filters select, .filters input[type=search] { padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: Canvas; min-width: 0; }
  .filters input[type=search] { flex: 1 1 160px; }
  .filters label { white-space: nowrap; color: var(--dim); }
  .toggle { padding: 6px 12px; border: 1px solid var(--line); border-radius: 6px; background: Canvas; cursor: pointer; }
  .toggle[aria-pressed=true] { background: var(--accent); border-color: var(--accent); color: #fff; }
  h2 { font-size: .85rem; text-transform: uppercase; letter-spacing: .04em; color: var(--dim); margin: 20px 0 4px; }
  ul { list-style: none; padding: 0; margin: 0; }
  li.ev { padding: 10px 0; border-bottom: 1px solid var(--line); }
  li.ev a { font-weight: 600; color: var(--accent); text-decoration: none; }
  li.ev a:hover { text-decoration: underline; }
  .meta { color: var(--dim); font-size: .92rem; }
  .tag { display: inline-block; font-size: .75rem; padding: 1px 6px; border-radius: 9px; border: 1px solid var(--line); margin-right: 4px; color: var(--dim); }
  .new { background: var(--accent); border-color: var(--accent); color: #fff; }
  .empty, .msg { color: var(--dim); padding: 16px 0; }
  .err { color: #c0392b; }
  dialog { border: 1px solid var(--line); border-radius: 10px; background: Canvas; color: CanvasText; width: min(560px, calc(100vw - 32px)); padding: 16px; }
  dialog h3 { padding-right: 36px; }
  dialog .x { position: absolute; top: 8px; right: 8px; width: 36px; height: 36px; border: 0; border-radius: 50%;
    background: none; color: var(--dim); font-size: 1.5rem; line-height: 1; cursor: pointer; }
  dialog .x:hover, dialog .x:focus-visible { background: color-mix(in srgb, CanvasText 8%, Canvas); color: CanvasText; }
  dialog h3 { margin: 0 0 12px; }
  dialog form { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
  dialog input[type=url], dialog input[type=text], dialog input[type=password] { flex: 1 1 200px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: Canvas; min-width: 0; }
  dialog button.btn { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--line); background: color-mix(in srgb, CanvasText 6%, Canvas); cursor: pointer; }
  .src { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line); }
  .src .name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .src .name small { display: block; color: var(--dim); }
  .src .name .actions { display: flex; gap: 12px; flex-wrap: wrap; }
  .src.off .name { opacity: .5; }
  .row { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
</style>
</head>
<body>
<main>
  <header><p class="stats"><span id="count"></span><span id="collected"></span></p>
    <nav class="menu">
      <button id="menuBtn" class="burger" type="button" aria-label="Menu" aria-expanded="false" aria-controls="menuList">&#9776;</button>
      <ul id="menuList" hidden>
        <li><button type="button" id="pagesOpen">Pages we check</button></li>
        <li><button type="button" id="suggestOpen">Suggest a Page</button></li>
        <li><button type="button" id="manage">Manage Pages</button></li>
      </ul>
    </nav>
  </header>
  <div class="filters">
    <select id="source" aria-label="Venue"></select>
    <button id="onlyNew" class="toggle" type="button" aria-pressed="false" title="Only events added in the last 3 days">New</button>
    <input id="q" type="search" placeholder="Search name or place" aria-label="Search">
  </div>
  <div id="list"><p class="msg">Loading…</p></div>
</main>

<dialog id="pages">
  <h3>Pages we check</h3>
  <input id="pagesSearch" type="search" placeholder="Search a venue or address" aria-label="Search Pages">
  <p id="pagesCount" class="msg" style="padding:0"></p>
  <div id="pagesList"></div>
  <div class="row"><button class="link" id="pagesSuggest" type="button">Not here? Suggest a Page</button><button class="btn" id="pagesClose" type="button">Close</button></div>
</dialog>

<dialog id="suggest">
  <h3>Suggest a Page</h3>
  <p class="msg" style="padding:0">A Facebook Page with events worth following. It's checked once the admin approves it.
    <button class="link" id="sugSeePages" type="button">See the Pages we already check</button>.</p>
  <form id="suggestForm">
    <input id="sugUrl" type="url" placeholder="https://www.facebook.com/SomeVenue" required>
    <input id="sugName" type="text" placeholder="Name (optional)" maxlength="200">
    <textarea id="sugNote" placeholder="Why this venue? (optional)" maxlength="1000"></textarea>
    <input id="sugBy" type="text" placeholder="Your name (optional)" maxlength="200">
    <label class="trap" aria-hidden="true">Website <input id="sugWebsite" type="text" tabindex="-1" autocomplete="off"></label>
    <button class="btn" type="submit">Suggest</button>
  </form>
  <p id="sugMsg" class="msg"></p>
  <div class="row"><span></span><button class="btn" id="suggestClose" type="button">Close</button></div>
</dialog>

<dialog id="admin">
  <div id="login">
    <h3>Log in</h3>
    <form id="loginForm">
      <input id="token" type="password" placeholder="Token" autocomplete="current-password" required>
      <button class="btn" type="submit">Log in</button>
    </form>
    <p id="loginMsg" class="msg"></p>
  </div>
  <div id="pages" hidden>
    <h3>Facebook Pages to check</h3>
    <form id="addForm">
      <input id="newUrl" type="url" placeholder="https://www.facebook.com/SomeVenue" required>
      <input id="newName" type="text" placeholder="Name (optional)">
      <button class="btn" type="submit">Add</button>
    </form>
    <p id="pagesMsg" class="msg"></p>
    <div id="pendingBox" hidden><h4 id="pendingTitle">Waiting for approval</h4><div id="pending"></div><h4>On the list</h4></div>
    <div id="sources"></div>
    <div class="row"><button class="link" id="logout" type="button">Log out</button></div>
  </div>
  <div class="row"><span></span><button class="btn" id="close" type="button">Close</button></div>
</dialog>

<script>
const PUBLIC_LIST = ${publicList ? 'true' : 'false'};
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids) if (k !== null && k !== undefined && k !== '') e.append(k);
  return e;
};
const getToken = () => { try { return localStorage.getItem('fbedb-token') || ''; } catch { return ''; } };
const setToken = (t) => { try { t ? localStorage.setItem('fbedb-token', t) : localStorage.removeItem('fbedb-token'); } catch {} };

async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (getToken()) headers.Authorization = 'Bearer ' + getToken();
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error((data && data.error) || res.statusText), { status: res.status });
  return data;
}

// ---- events list ----
let events = [];
let lastCollected = null;
const params = new URLSearchParams(location.search);
$('q').value = params.get('q') || '';
$('onlyNew').setAttribute('aria-pressed', String(params.get('new') === '1'));
const onlyNew = () => $('onlyNew').getAttribute('aria-pressed') === 'true';
// "new": first saved here in the last 3 days
const NEW_DAYS = 3;
const isNew = (ev) => Date.parse(ev.first_seen) > Date.now() - NEW_DAYS * 86400000;

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const dayFmtShort = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const shortFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function when(ev) {
  if (!ev.start) return ev.when_text || '';
  const s = new Date(ev.start * 1000);
  let text = timeFmt.format(s);
  if (ev.end) {
    const e = new Date(ev.end * 1000);
    text += '–' + (e.toDateString() === s.toDateString() ? timeFmt.format(e) : shortFmt.format(e));
  }
  return text;
}

function where(ev) {
  let text = [ev.place, ev.city && !(ev.place || '').includes(ev.city) ? ev.city : ''].filter(Boolean).join(', ');
  if (ev.online) text = (text + ' (online)').trim();
  if (ev.distance_km !== null && ev.distance_km !== undefined) text += ' · ' + Math.round(ev.distance_km) + ' km';
  return text;
}

function fillSources() {
  const seen = new Map();
  for (const ev of events) for (const s of ev.sources) seen.set(String(s.id), s.name);
  const chosen = params.get('page') || '';
  const sel = $('source');
  sel.replaceChildren(el('option', { value: '', textContent: 'All venues' }),
    el('option', { value: 'nearby', textContent: 'Nearby (from the town page)' }),
    ...[...seen].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => el('option', { value: id, textContent: name })));
  if (chosen && !seen.has(chosen) && chosen !== 'nearby') sel.append(el('option', { value: chosen, textContent: '(no events now)' }));
  sel.value = chosen;
}

function showStats(shownCount) {
  const n = events.length;
  $('count').textContent = (shownCount < n ? shownCount + ' of ' : '') + n + (n === 1 ? ' event' : ' events');
  $('collected').textContent = lastCollected ? 'last collected ' + shortFmt.format(new Date(lastCollected)) : '';
}

function render() {
  const src = $('source').value;
  const q = $('q').value.trim().toLowerCase();
  const shown = events.filter((ev) =>
    (!src || (src === 'nearby' ? ev.nearby : ev.sources.some((s) => String(s.id) === src)))
    && (!onlyNew() || isNew(ev))
    && (!q || [ev.name, ev.place, ev.city, ev.card, ...ev.sources.map((s) => s.name)].join(' ').toLowerCase().includes(q)));
  showStats(shown.length);
  const list = $('list');
  if (!shown.length) return list.replaceChildren(el('p', { className: 'empty', textContent: events.length ? 'No events match.' : 'No events yet.' }));
  const out = [];
  let day = null;
  let ul = null;
  for (const ev of shown) {
    const d = ev.start ? dayFmt.format(new Date(ev.start * 1000)) : 'Date unknown';
    if (d !== day) {
      day = d;
      ul = el('ul');
      out.push(el('h2', { textContent: d }), ul);
    }
    const tags = [];
    if (isNew(ev)) tags.push(el('span', { className: 'tag new', textContent: 'new' }));
    for (const s of ev.sources) tags.push(el('span', { className: 'tag', textContent: s.name }));
    if (ev.nearby && !ev.sources.length) tags.push(el('span', { className: 'tag', textContent: 'nearby' }));
    ul.append(el('li', { className: 'ev' },
      el('a', { href: ev.url, target: '_blank', rel: 'noopener', textContent: ev.name || '(no name)' }),
      el('div', { className: 'meta', textContent: [when(ev), where(ev)].filter(Boolean).join(' · ') }),
      !ev.start && !ev.when_text && ev.card ? el('div', { className: 'meta', textContent: ev.card }) : null,
      tags.length ? el('div', {}, ...tags) : null));
  }
  list.replaceChildren(...out);
}

function saveFilters() {
  for (const [k, v] of [['page', $('source').value], ['new', onlyNew() ? '1' : ''], ['q', $('q').value.trim()]]) {
    v ? params.set(k, v) : params.delete(k);
  }
  history.replaceState(history.state, '', params.toString() ? '?' + params : location.pathname);
}

async function load() {
  if (!PUBLIC_LIST && !getToken()) {
    $('list').replaceChildren(el('p', { className: 'msg', textContent: 'Log in (Manage Pages) to see the events.' }));
    return;
  }
  try {
    ({ events, last_collected: lastCollected } = await api('GET', '/api/events'));
    fillSources();
    render();
  } catch (e) {
    $('list').replaceChildren(el('p', { className: 'msg err', textContent: 'Could not load events: ' + e.message }));
  }
}

$('source').addEventListener('change', () => { saveFilters(); render(); });
$('q').addEventListener('input', () => { saveFilters(); render(); });
$('onlyNew').addEventListener('click', () => {
  $('onlyNew').setAttribute('aria-pressed', String(!onlyNew()));
  saveFilters();
  render();
});

// ---- managing Pages ----
const dlg = $('admin');
$('manage').addEventListener('click', () => {
  openDialog(dlg);
  showAdmin();
});
$('close').addEventListener('click', () => dlg.close());

async function showAdmin() {
  const loggedIn = Boolean(getToken());
  $('login').hidden = loggedIn;
  $('pages').hidden = !loggedIn;
  if (loggedIn) await loadSources();
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  setToken($('token').value.trim());
  try {
    await api('GET', '/api/me');
    $('token').value = '';
    $('loginMsg').textContent = '';
    await showAdmin();
    load();
  } catch (err) {
    setToken('');
    $('loginMsg').textContent = err.status === 401 ? 'Wrong token.' : err.message;
  }
});

$('logout').addEventListener('click', () => { setToken(''); showAdmin(); load(); });

async function loadSources() {
  try {
    const [{ sources }, { sources: pending }] = await Promise.all([
      api('GET', '/api/sources'), api('GET', '/api/sources?status=pending')]);
    $('pagesMsg').textContent = sources.length || pending.length ? '' : 'No Pages yet. Add the first one above.';
    $('pendingBox').hidden = !pending.length;
    $('pendingTitle').textContent = 'Waiting for approval (' + pending.length + ')';
    $('pending').replaceChildren(...pending.map(pendingRow));
    $('sources').replaceChildren(...sources.map(sourceRow));
  } catch (e) {
    if (e.status === 401) { setToken(''); return showAdmin(); }
    $('pagesMsg').textContent = e.message;
  }
}

function pendingRow(s) {
  const when = dayFmtShort.format(new Date(s.created_at));
  const approve = el('button', { className: 'link', type: 'button', textContent: 'Approve' });
  approve.addEventListener('click', async () => {
    const name = prompt('Name for this Page', s.name || '');
    if (name === null) return;
    await api('PATCH', '/api/sources/' + s.id, { status: 'active', name }).catch(alertErr);
    loadSources();
  });
  const reject = el('button', { className: 'link', type: 'button', textContent: 'Reject' });
  reject.addEventListener('click', async () => {
    const reason = prompt('Reject ' + (s.name || s.url) + '? Reason (optional):', '');
    if (reason === null) return;
    await api('PATCH', '/api/sources/' + s.id, { status: 'rejected', reject_reason: reason }).catch(alertErr);
    loadSources();
  });
  return el('div', { className: 'pending' },
    el('a', { href: s.url, target: '_blank', rel: 'noopener', textContent: s.name || s.url }),
    el('div', { className: 'meta', textContent: 'suggested ' + when + (s.suggested_by ? ' by ' + s.suggested_by : '') + (s.name ? ' · ' + s.url : '') }),
    s.note ? el('div', { className: 'meta', textContent: '“' + s.note + '”' }) : null,
    s.similar && s.similar.length ? el('div', { className: 'warn', textContent: 'Similar name: '
      + s.similar.map((o) => o.name + (o.status === 'pending' ? ' (also suggested)' : '')).join(', ') + ' — maybe the same venue?' }) : null,
    el('div', { className: 'row' }, approve, reject));
}

function sourceRow(s) {
  const toggle = el('input', { type: 'checkbox', checked: s.enabled, title: 'Check this Page (untick to pause)' });
  toggle.addEventListener('change', async () => { await api('PATCH', '/api/sources/' + s.id, { enabled: toggle.checked }).catch(alertErr); loadSources(); });
  const rename = el('button', { className: 'link', type: 'button', textContent: 'Rename' });
  rename.addEventListener('click', async () => {
    const name = prompt('Name for this Page', s.name || '');
    if (name !== null) { await api('PATCH', '/api/sources/' + s.id, { name }).catch(alertErr); loadSources(); load(); }
  });
  const del = el('button', { className: 'link', type: 'button', textContent: 'Remove' });
  del.addEventListener('click', async () => {
    if (confirm('Stop checking ' + (s.name || s.url) + '? Its events stay on the list.')) {
      await api('DELETE', '/api/sources/' + s.id).catch(alertErr);
      loadSources();
      load();
    }
  });
  const patch = (body) => async () => { await api('PATCH', '/api/sources/' + s.id, body).catch(alertErr); loadSources(); };
  const actions = [];
  if (s.enabled && !s.due) {
    const now = el('button', { className: 'link', type: 'button', textContent: 'Check on next run' });
    now.addEventListener('click', patch({ check_now: true }));
    actions.push(now);
  }
  if (s.enabled) {
    const pin = el('button', { className: 'link', type: 'button', textContent: s.pinned ? 'Back to adaptive' : 'Always check' });
    pin.addEventListener('click', patch({ pinned: !s.pinned }));
    actions.push(pin);
  }
  return el('div', { className: 'src' + (s.enabled ? '' : ' off') }, toggle,
    el('div', { className: 'name' }, el('a', { href: s.url, target: '_blank', rel: 'noopener', textContent: s.name || s.url }),
      el('small', { textContent: s.events + (s.events === 1 ? ' event' : ' events') + ' · ' + schedule(s) }),
      actions.length ? el('small', { className: 'actions' }, ...actions) : null),
    rename, del);
}

// How often fbevents checks a Page: every run while it brings new events, then less often.
function schedule(s) {
  if (!s.enabled) return 'paused';
  if (s.pinned) return 'checked on every run (always)';
  const every = s.interval_days < 1 ? 'every run' : s.interval_days === 1 ? 'daily'
    : s.interval_days === 7 ? 'weekly' : 'every ' + s.interval_days + ' days';
  if (!s.last_checked_at) return 'not checked yet';
  return 'checked ' + every + (s.due ? ', due on next run' : ', next ' + dayFmtShort.format(new Date(s.next_check_at)));
}

function alertErr(e) { alert(e.message); }

// ---- popups: a close button (✕) on each, and the browser's Back closes the popup ----
// Opening a popup adds one history entry; Back (popstate) closes it instead of leaving the site.
// Closing it any other way (✕, Close, Esc) takes that entry off again.
function openDialog(d) {
  for (const other of document.querySelectorAll('dialog[open]')) if (other !== d) other.close();
  if (!(history.state && history.state.popup)) history.pushState({ popup: true }, '', location.href);
  if (!d.open) d.showModal();
}
for (const d of document.querySelectorAll('dialog')) {
  const x = el('button', { className: 'x', type: 'button', textContent: '\u00d7', title: 'Close' });
  x.setAttribute('aria-label', 'Close');
  x.addEventListener('click', () => d.close());
  d.prepend(x);
  d.addEventListener('close', () => {
    // 'close' fires a moment later: if another popup was opened meanwhile, keep the entry.
    if (!document.querySelector('dialog[open]') && history.state && history.state.popup) history.back();
  });
}
window.addEventListener('popstate', () => {
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  saveFilters(); // a filter set from a popup ("show on the list") stays in the address
});

// ---- menu ----
const menuBtn = $('menuBtn');
const menuList = $('menuList');
function menu(open) {
  menuList.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
}
menuBtn.addEventListener('click', (e) => { e.stopPropagation(); menu(menuList.hidden); });
document.addEventListener('click', (e) => { if (!menuList.hidden && !menuList.contains(e.target)) menu(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') menu(false); });
menuList.addEventListener('click', () => menu(false));

// ---- the Pages we check (anyone): look before suggesting ----
const pagesDlg = $('pages');
let pages = [];
async function openPages() {
  $('pagesSearch').value = '';
  $('pagesList').replaceChildren(el('p', { className: 'msg', textContent: 'Loading…' }));
  openDialog(pagesDlg);
  try {
    pages = (await api('GET', '/api/pages')).pages;
    renderPages();
  } catch (e) {
    $('pagesList').replaceChildren(el('p', { className: 'msg err', textContent: 'Could not load the Pages: ' + e.message }));
  }
}
function renderPages() {
  const q = $('pagesSearch').value.trim().toLowerCase();
  const shown = pages.filter((p) => !q || ((p.name || '') + ' ' + p.url).toLowerCase().includes(q));
  const on = pages.filter((p) => p.status !== 'pending').length;
  const waiting = pages.length - on;
  $('pagesCount').textContent = q ? shown.length + ' of ' + pages.length + ' match'
    : on + ' Pages' + (waiting ? ', ' + waiting + ' waiting for approval' : '');
  if (!shown.length) {
    return $('pagesList').replaceChildren(el('p', { className: 'msg', textContent: q
      ? 'No Page matches “' + $('pagesSearch').value.trim() + '”. You can suggest it.' : 'No Pages yet.' }));
  }
  $('pagesList').replaceChildren(...shown.map((p) => {
    const status = p.status === 'pending' ? 'waiting for approval' : p.status === 'paused' ? 'paused'
      : p.events + (p.events === 1 ? ' event' : ' events');
    const meta = el('div', { className: 'meta' }, status);
    if (p.status === 'active' && p.events) {
      const show = el('button', { className: 'link', type: 'button', textContent: 'show on the list' });
      show.addEventListener('click', () => {
        pagesDlg.close();
        if (![...$('source').options].some((o) => o.value === String(p.id))) {
          $('source').append(el('option', { value: String(p.id), textContent: p.name || p.url }));
        }
        $('source').value = String(p.id);
        saveFilters();
        render();
      });
      meta.append(' · ', show);
    }
    return el('div', { className: 'pg' + (p.status === 'pending' ? ' waiting' : p.status === 'paused' ? ' paused' : '') },
      el('a', { href: p.url, target: '_blank', rel: 'noopener', textContent: p.name || p.url }), meta);
  }));
}
$('pagesOpen').addEventListener('click', openPages);
$('pagesSearch').addEventListener('input', renderPages);
$('pagesClose').addEventListener('click', () => pagesDlg.close());
$('pagesSuggest').addEventListener('click', () => {
  const q = $('pagesSearch').value.trim();
  pagesDlg.close();
  openSuggest();
  if (q.startsWith('http')) $('sugUrl').value = q; else if (q) $('sugName').value = q;
});

// ---- suggesting a Page (anyone) ----
const sugDlg = $('suggest');
function openSuggest() {
  $('sugMsg').textContent = '';
  openDialog(sugDlg);
}
$('suggestOpen').addEventListener('click', openSuggest);
$('sugSeePages').addEventListener('click', openPages);
$('suggestClose').addEventListener('click', () => sugDlg.close());
$('suggestForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('sugMsg').classList.remove('err');
  try {
    await api('POST', '/api/suggestions', {
      url: $('sugUrl').value.trim(), name: $('sugName').value.trim(), note: $('sugNote').value.trim(),
      by: $('sugBy').value.trim(), website: $('sugWebsite').value,
    });
    for (const id of ['sugUrl', 'sugName', 'sugNote']) $(id).value = '';
    $('sugMsg').textContent = 'Thanks! The Page is checked once the admin approves it.';
  } catch (err) {
    $('sugMsg').classList.add('err');
    $('sugMsg').textContent = err.message;
  }
});

$('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('POST', '/api/sources', { url: $('newUrl').value.trim(), name: $('newName').value.trim() });
    $('newUrl').value = '';
    $('newName').value = '';
    $('pagesMsg').textContent = 'Added. Its events show up after the next daily run.';
    const msg = $('pagesMsg').textContent;
    await loadSources();
    $('pagesMsg').textContent = msg;
  } catch (err) {
    $('pagesMsg').textContent = err.message;
  }
});

load();
</script>
</body>
</html>
`;
}

module.exports = { page };
