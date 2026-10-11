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
  header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  h1 { font-size: 1.6rem; margin: 8px 0 12px; }
  button, input, select { font: inherit; color: inherit; }
  .link { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; }
  .filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 8px; }
  .filters select, .filters input[type=search] { padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: Canvas; min-width: 0; }
  .filters input[type=search] { flex: 1 1 160px; }
  .filters label { white-space: nowrap; color: var(--dim); }
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
  dialog h3 { margin: 0 0 12px; }
  dialog form { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
  dialog input[type=url], dialog input[type=text], dialog input[type=password] { flex: 1 1 200px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: Canvas; min-width: 0; }
  dialog button.btn { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--line); background: color-mix(in srgb, CanvasText 6%, Canvas); cursor: pointer; }
  .src { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line); }
  .src .name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .src .name small { display: block; color: var(--dim); }
  .src.off .name { opacity: .5; }
  .row { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
</style>
</head>
<body>
<main>
  <header><h1>Events</h1><button class="link" id="manage" type="button">Manage Pages</button></header>
  <div class="filters">
    <select id="source" aria-label="Venue"></select>
    <input id="q" type="search" placeholder="Search name or place" aria-label="Search">
  </div>
  <div id="list"><p class="msg">Loading…</p></div>
</main>

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
const params = new URLSearchParams(location.search);
$('q').value = params.get('q') || '';

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
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

function render() {
  const src = $('source').value;
  const q = $('q').value.trim().toLowerCase();
  const newSince = Date.now() - 3 * 86400000;
  const shown = events.filter((ev) =>
    (!src || (src === 'nearby' ? ev.nearby : ev.sources.some((s) => String(s.id) === src)))
    && (!q || [ev.name, ev.place, ev.city, ev.card, ...ev.sources.map((s) => s.name)].join(' ').toLowerCase().includes(q)));
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
    if (Date.parse(ev.first_seen) > newSince) tags.push(el('span', { className: 'tag new', textContent: 'new' }));
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
  for (const [k, v] of [['page', $('source').value], ['q', $('q').value.trim()]]) {
    v ? params.set(k, v) : params.delete(k);
  }
  history.replaceState(null, '', params.toString() ? '?' + params : location.pathname);
}

async function load() {
  if (!PUBLIC_LIST && !getToken()) {
    $('list').replaceChildren(el('p', { className: 'msg', textContent: 'Log in (Manage Pages) to see the events.' }));
    return;
  }
  try {
    events = (await api('GET', '/api/events')).events;
    fillSources();
    render();
  } catch (e) {
    $('list').replaceChildren(el('p', { className: 'msg err', textContent: 'Could not load events: ' + e.message }));
  }
}

$('source').addEventListener('change', () => { saveFilters(); render(); });
$('q').addEventListener('input', () => { saveFilters(); render(); });

// ---- managing Pages ----
const dlg = $('admin');
$('manage').addEventListener('click', () => { dlg.showModal(); showAdmin(); });
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
    const { sources } = await api('GET', '/api/sources');
    $('pagesMsg').textContent = sources.length ? '' : 'No Pages yet. Add the first one above.';
    $('sources').replaceChildren(...sources.map(sourceRow));
  } catch (e) {
    if (e.status === 401) { setToken(''); return showAdmin(); }
    $('pagesMsg').textContent = e.message;
  }
}

function sourceRow(s) {
  const toggle = el('input', { type: 'checkbox', checked: s.enabled, title: 'Check this Page every day' });
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
  return el('div', { className: 'src' + (s.enabled ? '' : ' off') }, toggle,
    el('div', { className: 'name' }, el('a', { href: s.url, target: '_blank', rel: 'noopener', textContent: s.name || s.url }),
      el('small', { textContent: s.events + (s.events === 1 ? ' event' : ' events') + (s.enabled ? '' : ' · paused') })),
    rename, del);
}

function alertErr(e) { alert(e.message); }

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
