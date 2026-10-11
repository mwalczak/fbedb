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
  assert.deepEqual(r.json, { new: ['111111', '222222'], updated: [], unknown: [], invalid: 0 });

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
  assert.deepEqual(r.json, { new: [], updated: ['222222', '111111'], unknown: ['333333'], invalid: 1 });

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
  assert.match(page.text, /const PUBLIC_LIST = true;/);
  assert.equal((await s.api('GET', '/healthz', { token: null })).text, 'ok\n');
  assert.equal((await s.api('GET', '/api/nope')).status, 404);
});
