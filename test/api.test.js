process.env.TZ = 'Europe/Warsaw'; // as in the image: "today" is a Warsaw day
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../src/app');
const { Store, pageUrl, eventId } = require('../src/store');

const NOW = new Date('2026-10-11T08:00:00Z');
const T = NOW.getTime() / 1000;
const DAY = 86400;

async function startServer(options = {}) {
  const store = new Store(':memory:');
  const app = createApp({ store, token: 'secret', now: () => NOW, ...options });
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (method, path, { body, token = 'secret' } = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(base + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
  };
  return { api, store, close: () => new Promise((r) => server.close(r)) };
}

const venue = 'https://www.facebook.com/TheVenue';
const concert = {
  url: 'https://www.facebook.com/events/111111/', name: 'Concert', start: T + 2 * DAY, place: 'The Venue',
  distance_km: 1.2, sources: [{ kind: 'page', url: venue, name: 'The Venue' }],
};
const fair = {
  url: 'https://www.facebook.com/events/222222/?ref=x', name: 'Fair', start: T + DAY, place: 'Market',
  sources: [{ kind: 'nearby' }],
};

test('fbevents posts events; each is stored once and "new" only the first time', async (t) => {
  const s = await startServer();
  t.after(s.close);
  assert.equal((await s.api('POST', '/api/sources', { body: { url: venue + '/?ref=bookmarks' } })).status, 201);

  let r = await s.api('POST', '/api/events', { body: { events: [concert, fair] } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { new: ['111111', '222222'], updated: [], unknown: [], invalid: 0, checked: 0 });

  // Next day: the same events again (one with another url spelling), plus a touch of an
  // unknown event (e.g. one fbevents skipped as too far away), which must not be created.
  r = await s.api('POST', '/api/events', {
    body: {
      events: [
        { ...fair, url: 'https://m.facebook.com/events/222222/', place: null, city: 'Rybnik' },
        { url: 'https://www.facebook.com/events/111111/', touch: true, sources: [{ kind: 'nearby' }] },
        { url: 'https://www.facebook.com/events/333333/', touch: true },
        { url: 'https://www.facebook.com/SomeVenue', name: 'not an event' },
      ],
    },
  });
  assert.deepEqual(r.json, { new: [], updated: ['222222', '111111'], unknown: ['333333'], invalid: 1, checked: 0 });

  r = await s.api('GET', '/api/events', { token: null });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.events.map((e) => [e.id, e.name, e.place, e.city, e.nearby]), [
    ['222222', 'Fair', 'Market', 'Rybnik', true], // missing fields don't erase stored ones
    ['111111', 'Concert', 'The Venue', null, true],
  ]);
  assert.deepEqual(r.json.events[1].sources, [{ id: 1, name: 'The Venue' }]);
  assert.equal(r.json.last_collected, NOW.toISOString());
  assert.equal(r.json.events[1].url, 'https://www.facebook.com/events/111111/');
});

test('only events from today on, closest first; never past ones', async (t) => {
  const s = await startServer(); // NOW is 10:00 in Warsaw (TZ set at the top)
  t.after(s.close);
  await s.api('POST', '/api/events', {
    body: {
      events: [
        { url: '/events/100001/', name: 'Last week', start: T - 7 * DAY },
        { url: '/events/100002/', name: 'Yesterday 23:00', start: T - 11 * 3600, end: T - 9 * 3600 },
        { url: '/events/100003/', name: 'Today 07:00', start: T - 3 * 3600 },
        { url: '/events/100008/', name: 'Today 00:30', start: T - 9.5 * 3600 }, // still yesterday in UTC
        { url: '/events/100004/', name: 'Next week', start: T + 7 * DAY },
        { url: '/events/100005/', name: 'Tomorrow', start: T + DAY },
        { url: '/events/100006/', name: 'Festival, ends tomorrow', start: T - 2 * DAY, end: T + DAY },
        { url: '/events/100007/', name: 'No date', card: 'SAT · Somewhere' },
      ],
    },
  });
  for (const q of ['', '?past=1']) {
    const r = await s.api('GET', '/api/events' + q, { token: null });
    assert.deepEqual(r.json.events.map((e) => e.name),
      ['Festival, ends tomorrow', 'Today 00:30', 'Today 07:00', 'Tomorrow', 'Next week', 'No date']);
  }
});

test('managing Pages needs the token', async (t) => {
  const s = await startServer();
  t.after(s.close);
  assert.equal((await s.api('GET', '/api/sources', { token: null })).status, 401);
  assert.equal((await s.api('GET', '/api/sources', { token: 'wrong' })).status, 401);
  assert.equal((await s.api('POST', '/api/events', { token: null, body: { events: [] } })).status, 401);
  assert.equal((await s.api('GET', '/api/me', { token: 'wrong' })).status, 401);
  assert.equal((await s.api('GET', '/api/me')).status, 204);

  let r = await s.api('POST', '/api/sources', { body: { url: 'https://www.facebook.com/profile.php?id=10006&ref=x', name: 'Club' } });
  assert.equal(r.status, 201);
  assert.equal(r.json.url, 'https://www.facebook.com/profile.php?id=10006');
  assert.equal((await s.api('POST', '/api/sources', { body: { url: 'https://facebook.com/profile.php?id=10006' } })).status, 409);
  assert.equal((await s.api('POST', '/api/sources', { body: { url: 'https://example.com/x' } })).status, 422);

  r = await s.api('PATCH', `/api/sources/${r.json.id}`, { body: { enabled: false, name: 'Jazz Club' } });
  assert.deepEqual([r.json.name, r.json.enabled], ['Jazz Club', false]);
  r = await s.api('GET', '/api/sources');
  assert.deepEqual(r.json.sources.map((x) => [x.name, x.enabled, x.events]), [['Jazz Club', false, 0]]);
  assert.equal((await s.api('DELETE', `/api/sources/${r.json.sources[0].id}`)).status, 204);
  assert.equal((await s.api('DELETE', '/api/sources/999')).status, 404);
});

test('removing a Page keeps its events', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const { json: src } = await s.api('POST', '/api/sources', { body: { url: venue } });
  await s.api('POST', '/api/events', { body: { events: [concert] } });
  await s.api('DELETE', `/api/sources/${src.id}`);
  const r = await s.api('GET', '/api/events', { token: null });
  assert.deepEqual(r.json.events.map((e) => [e.name, e.sources]), [['Concert', []]]);
});

test('the list can be private', async (t) => {
  const s = await startServer({ publicList: false });
  t.after(s.close);
  assert.equal((await s.api('GET', '/api/events', { token: null })).status, 401);
  assert.equal((await s.api('GET', '/api/events')).status, 200);
  const page = await s.api('GET', '/', { token: null });
  assert.equal(page.status, 200);
  assert.match(page.text, /const PUBLIC_LIST = false;/);
});

test('without a TOKEN nothing can be written', async (t) => {
  const s = await startServer({ token: undefined });
  t.after(s.close);
  assert.equal((await s.api('POST', '/api/events', { body: { events: [concert] } })).status, 403);
});

test('wrong tokens are slowed down', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const codes = [];
  for (let i = 0; i < 12; i++) codes.push((await s.api('GET', '/api/sources', { token: 'guess' })).status);
  assert.deepEqual(codes.slice(0, 10), Array(10).fill(401));
  assert.equal(codes[11], 429);
});

test('Page and event addresses', () => {
  assert.equal(pageUrl('https://m.facebook.com/SomeVenue/?ref=bookmarks'), 'https://www.facebook.com/SomeVenue');
  assert.equal(pageUrl('https://www.facebook.com/'), null);
  assert.equal(pageUrl('not a url'), null);
  assert.equal(eventId('https://www.facebook.com/events/1234567/?acontext=x'), '1234567');
  assert.equal(eventId('https://www.facebook.com/events/explore/rybnik/1/'), null);
});

test('the page is served and the API 404s politely', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const page = await s.api('GET', '/', { token: null });
  assert.match(page.text, /<title>Events<\/title>/);
  // The script lives in a template string, where a stray backslash breaks it: it must parse.
  const script = page.text.split('<script>')[1].split('</script>')[0];
  assert.doesNotThrow(() => new Function(script));
  assert.match(page.text, /const PUBLIC_LIST = true;/);
  assert.equal((await s.api('GET', '/healthz', { token: null })).text, 'ok\n');
  assert.equal((await s.api('GET', '/api/nope')).status, 404);
});

test('cleaning up events linked to too many Pages', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const urls = [];
  for (let i = 1; i <= 7; i++) {
    urls.push(`https://www.facebook.com/Venue${i}`);
    await s.api('POST', '/api/sources', { body: { url: urls.at(-1) } });
  }
  await s.api('POST', '/api/events', {
    body: {
      events: [
        { ...concert, sources: urls.map((url) => ({ kind: 'page', url })) }, // from Facebook's sidebar
        { ...fair, sources: [{ kind: 'page', url: urls[0] }, { kind: 'nearby' }] },
      ],
    },
  });
  assert.deepEqual(s.store.unlinkOverlinked(5, { dryRun: true }), [{ fb_id: '111111', name: 'Concert', pages: 7 }]);
  assert.equal(s.store.unlinkOverlinked(5).length, 1);
  assert.deepEqual(s.store.unlinkOverlinked(5), []);
  const r = await s.api('GET', '/api/events', { token: null });
  assert.deepEqual(r.json.events.map((e) => [e.name, e.sources.length]), [['Fair', 1], ['Concert', 0]]);
});

test('each Page is checked as often as it brings new events', async (t) => {
  let now = NOW;
  const s = await startServer({ now: () => now });
  t.after(s.close);
  const later = (hours) => { now = new Date(now.getTime() + hours * 3600_000); };
  const venue2 = 'https://www.facebook.com/QuietPub';
  await s.api('POST', '/api/sources', { body: { url: venue } });
  await s.api('POST', '/api/sources', { body: { url: venue2 } });
  const schedule = async () => (await s.api('GET', '/api/sources')).json.sources
    .map((x) => [x.url.split('/').pop(), x.due, x.interval_days]);
  const check = (events, checked) => s.api('POST', '/api/events', { body: { events, checked } });
  const ev = (id) => ({ url: `https://www.facebook.com/events/${id}/`, name: `E${id}`, start: T + 9 * DAY,
    sources: [{ kind: 'page', url: venue }] });

  // New Pages are due right away.
  assert.deepEqual(await schedule(), [['QuietPub', true, 0.5], ['TheVenue', true, 0.5]]);

  // The Venue brings a new event: stays on every run. The pub brings nothing: daily.
  let r = await check([ev(500001)], [{ url: venue }, { url: venue2 + '/upcoming_hosted_events' }]);
  assert.equal(r.json.checked, 2);
  assert.deepEqual(await schedule(), [['QuietPub', false, 1], ['TheVenue', false, 0.5]]);

  later(10); // the evening run: the Venue is due again, the pub isn't
  assert.deepEqual(await schedule(), [['QuietPub', false, 1], ['TheVenue', true, 0.5]]);

  // Quiet checks slow a Page down step by step, to once a week at most.
  for (const step of [1, 2, 4, 7, 7]) {
    later(24 * 7);
    await check([], [venue2]);
    assert.deepEqual((await schedule())[0], ['QuietPub', false, step === 1 ? 2 : step === 2 ? 4 : 7]);
  }

  // A touched (already known) event is no news; a new event puts the Page back on every run.
  later(24 * 7);
  await check([{ url: ev(500001).url, touch: true, sources: [{ kind: 'page', url: venue2 }] }], [venue2]);
  assert.deepEqual((await schedule())[0], ['QuietPub', false, 7]);
  later(24 * 7);
  await check([{ ...ev(500002), sources: [{ kind: 'page', url: venue2 }] }], [venue2]);
  assert.deepEqual((await schedule())[0], ['QuietPub', false, 0.5]);

  // "Always check" and "check on the next run" overrides.
  const pub = (await s.api('GET', '/api/sources')).json.sources[0];
  r = await s.api('PATCH', `/api/sources/${pub.id}`, { body: { pinned: true } });
  assert.deepEqual([r.json.pinned, r.json.due], [true, true]);
  await s.api('PATCH', `/api/sources/${pub.id}`, { body: { pinned: false } });
  await check([], [venue2]);
  assert.equal((await schedule())[0][1], false);
  r = await s.api('PATCH', `/api/sources/${pub.id}`, { body: { check_now: true } });
  assert.equal(r.json.due, true);

  // A paused Page is never due.
  r = await s.api('PATCH', `/api/sources/${pub.id}`, { body: { enabled: false } });
  assert.equal(r.json.due, false);
});

test('the address Facebook redirects to counts as the same Page', async (t) => {
  const s = await startServer();
  t.after(s.close);
  await s.api('POST', '/api/sources', { body: { url: 'https://www.facebook.com/profile.php?id=10006' } });
  await s.api('POST', '/api/events', {
    body: { events: [], checked: [{ url: 'https://www.facebook.com/profile.php?id=10006',
      final_url: 'https://www.facebook.com/klub.jazz/upcoming_hosted_events' }] },
  });
  const r = await s.api('POST', '/api/sources', { body: { url: 'https://m.facebook.com/klub.jazz/events' } });
  assert.equal(r.status, 409);
  await s.api('POST', '/api/events', {
    body: { events: [{ ...concert, sources: [{ kind: 'page', url: 'https://www.facebook.com/klub.jazz' }] }] },
  });
  const src = (await s.api('GET', '/api/sources')).json.sources[0];
  assert.equal(src.events, 1);
  assert.equal(src.alias_url, 'https://www.facebook.com/klub.jazz');
});

test('visitors suggest Pages; the admin approves or rejects them', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const suggest = (body) => s.api('POST', '/api/suggestions', { token: null, body });

  let r = await suggest({ url: 'https://m.facebook.com/KlubJazz/?ref=share', name: 'Klub Jazz', note: 'great gigs', by: 'Ania' });
  assert.equal(r.status, 201);
  assert.deepEqual(r.json, { status: 'pending', url: 'https://www.facebook.com/KlubJazz' });
  assert.equal((await suggest({ url: 'not a page' })).status, 422);

  // Waiting for approval: not given to fbevents, shown to the admin.
  assert.deepEqual((await s.api('GET', '/api/sources')).json.sources, []);
  assert.equal((await s.api('GET', '/api/sources?status=pending', { token: null })).status, 401);
  const [p] = (await s.api('GET', '/api/sources?status=pending')).json.sources;
  assert.deepEqual([p.name, p.note, p.suggested_by, p.due], ['Klub Jazz', 'great gigs', 'Ania', false]);

  // Events from a Page that isn't approved aren't linked to it.
  await s.api('POST', '/api/events', { body: { events: [{ ...concert, sources: [{ kind: 'page', url: 'https://www.facebook.com/KlubJazz' }] }] } });
  r = await s.api('PATCH', `/api/sources/${p.id}`, { body: { status: 'active', name: 'Klub Jazz Rybnik' } });
  assert.deepEqual([r.json.status, r.json.name, r.json.due, r.json.events], ['active', 'Klub Jazz Rybnik', true, 0]);
  assert.deepEqual((await s.api('GET', '/api/sources?status=pending')).json.sources, []);

  // Rejecting, with a reason; approving or rejecting twice is a 404.
  await suggest({ url: 'https://www.facebook.com/SomeShop' });
  const [q] = (await s.api('GET', '/api/sources?status=pending')).json.sources;
  r = await s.api('PATCH', `/api/sources/${q.id}`, { body: { status: 'rejected', reject_reason: 'a shop, no events' } });
  assert.equal(r.json.status, 'rejected');
  assert.equal((await s.api('PATCH', `/api/sources/${q.id}`, { body: { status: 'active' } })).status, 404);
});

test('suggestions of known Pages are refused, whatever their state', async (t) => {
  const s = await startServer({ suggestionsPerHour: 100 });
  t.after(s.close);
  const suggest = (url) => s.api('POST', '/api/suggestions', { token: null, body: { url } });
  const add = (url) => s.api('POST', '/api/sources', { body: { url } });

  const { json: on } = await add('https://www.facebook.com/OnTheList');
  const { json: paused } = await add('https://www.facebook.com/Paused');
  await s.api('PATCH', `/api/sources/${paused.id}`, { body: { enabled: false } });
  const { json: gone } = await add('https://www.facebook.com/profile.php?id=4242');
  await s.api('POST', '/api/events', { body: { events: [], checked: [{ url: gone.url, final_url: 'https://www.facebook.com/TakenOff' }] } });
  await s.api('DELETE', `/api/sources/${gone.id}`);
  await suggest('https://www.facebook.com/Waiting');

  for (const [url, words] of [
    ['https://facebook.com/ontheList/', /already on the list/], // the address is not case-folded: different Page
    ['https://www.facebook.com/OnTheList/events', /already on the list/],
    ['https://www.facebook.com/Paused', /already on the list/],
    ['https://www.facebook.com/Waiting?ref=x', /waiting for approval/],
    ['https://www.facebook.com/profile.php?id=4242', /taken off/],
    ['https://www.facebook.com/TakenOff', /taken off/], // the address Facebook redirected to
  ]) {
    const r = await suggest(url);
    if (url.includes('ontheList')) { assert.equal(r.status, 201); continue; }
    assert.equal(r.status, 409, url);
    assert.match(r.json.error, words, url);
  }

  // A removed Page isn't given to fbevents, and the admin can put it back.
  assert.deepEqual((await s.api('GET', '/api/sources')).json.sources.map((x) => x.url.split('/').pop()), ['OnTheList', 'Paused']);
  const r = await add('https://www.facebook.com/TakenOff');
  assert.equal(r.status, 201);
  assert.equal(r.json.id, gone.id);
});

test('suggestions with a name like a known Page are flagged', async (t) => {
  const s = await startServer();
  t.after(s.close);
  await s.api('POST', '/api/sources', { body: { url: 'https://www.facebook.com/KlubOdysejaKultura', name: 'Klub Odyseja - Wydarzenia' } });
  await s.api('POST', '/api/suggestions', { token: null, body: { url: 'https://www.facebook.com/odyseja.rybnik', name: 'Klub Odyseja' } });
  await s.api('POST', '/api/suggestions', { token: null, body: { url: 'https://www.facebook.com/Other', name: 'Królestwo' } });
  const pending = (await s.api('GET', '/api/sources?status=pending')).json.sources;
  const byName = Object.fromEntries(pending.map((p) => [p.name, p.similar.map((x) => x.name)]));
  assert.deepEqual(byName, { 'Klub Odyseja': ['Klub Odyseja - Wydarzenia'], 'Królestwo': [] });
});

test('suggestions are limited per address, and bots get nowhere', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const codes = [];
  for (let i = 0; i < 7; i++) {
    codes.push((await s.api('POST', '/api/suggestions', { token: null, body: { url: `https://www.facebook.com/Venue${i}` } })).status);
  }
  assert.deepEqual(codes, [201, 201, 201, 201, 201, 429, 429]);

  const s2 = await startServer();
  t.after(s2.close);
  const r = await s2.api('POST', '/api/suggestions', { token: null, body: { url: 'https://www.facebook.com/Spam', website: 'http://spam' } });
  assert.equal(r.status, 201);
  assert.deepEqual((await s2.api('GET', '/api/sources?status=pending')).json.sources, []);
});

test('everyone can see which Pages are checked or waiting, without private details', async (t) => {
  const s = await startServer();
  t.after(s.close);
  await s.api('POST', '/api/sources', { body: { url: 'https://www.facebook.com/Zebra', name: 'Zebra Club' } });
  const { json: paused } = await s.api('POST', '/api/sources', { body: { url: 'https://www.facebook.com/Aula', name: 'Aula' } });
  await s.api('PATCH', `/api/sources/${paused.id}`, { body: { enabled: false } });
  await s.api('POST', '/api/suggestions', { token: null, body: { url: 'https://www.facebook.com/Mlyn', name: 'Młyn', note: 'secret note', by: 'Ania' } });
  const { json: gone } = await s.api('POST', '/api/sources', { body: { url: 'https://www.facebook.com/Gone' } });
  await s.api('DELETE', `/api/sources/${gone.id}`);

  const r = await s.api('GET', '/api/pages', { token: null });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.pages.map((p) => [p.name, p.status]), [['Aula', 'paused'], ['Młyn', 'pending'], ['Zebra Club', 'active']]);
  assert.deepEqual(Object.keys(r.json.pages[1]).sort(), ['events', 'id', 'name', 'status', 'url']);

  const priv = await startServer({ publicList: false });
  t.after(priv.close);
  assert.equal((await priv.api('GET', '/api/pages', { token: null })).status, 401);
});
