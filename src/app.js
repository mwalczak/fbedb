// HTTP API and the events page.
const crypto = require('node:crypto');
const { page } = require('./page');

const MAX_BODY = 2 * 1024 * 1024; // a run posts a few hundred events at most
const MAX_EVENTS = 2000;

function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Allows `limit` requests per window from one address (wrong tokens, suggestions). */
class RateLimiter {
  constructor(limit, windowMs = 60000, now = () => Date.now()) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.buckets = new Map();
  }

  allow(key) {
    const t = this.now();
    let b = this.buckets.get(key);
    if (!b) b = { tokens: this.limit, at: t };
    b.tokens = Math.min(this.limit, b.tokens + ((t - b.at) / this.windowMs) * this.limit);
    b.at = t;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.buckets.set(key, b);
    if (this.buckets.size > 10000) this.buckets.clear(); // don't grow forever
    return ok;
  }
}

function clientIp(req) {
  const realIp = req.headers['x-real-ip'];
  if (realIp) return realIp.trim();
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('body too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJson(req) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    throw Object.assign(new Error(e.status ? e.message : 'body must be JSON'), { status: e.status || 400 });
  }
  if (!body || typeof body !== 'object') throw Object.assign(new Error('body must be a JSON object'), { status: 400 });
  return body;
}

function createApp({ store, token, publicList = true, suggestionsPerHour = 5, now = () => new Date() }) {
  const wrongTokens = new RateLimiter(10);
  const suggestions = new RateLimiter(suggestionsPerHour, 3600_000);

  function send(res, status, body) {
    if (status === 204) {
      res.writeHead(204);
      return res.end();
    }
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body) + '\n');
  }

  const fail = (res, status, message) => send(res, status, { error: message });

  /** true if the request carries the token; otherwise answers 401/403/429 and returns false. */
  function authorized(req, res) {
    if (!token) {
      fail(res, 403, 'TOKEN is not set on the server');
      return false;
    }
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    if (m && sameSecret(m[1].trim(), token)) return true;
    if (!wrongTokens.allow(clientIp(req))) fail(res, 429, 'too many attempts, wait a minute');
    else fail(res, 401, 'token required');
    return false;
  }

  async function postEvents(req, res) {
    const body = await readJson(req);
    if (!Array.isArray(body.events)) return fail(res, 422, 'events must be a list');
    if (body.events.length > MAX_EVENTS) return fail(res, 413, `at most ${MAX_EVENTS} events at a time`);
    if (body.checked !== undefined && !Array.isArray(body.checked)) return fail(res, 422, 'checked must be a list');
    const result = store.saveEvents(body.events, now(), body.checked);
    console.log(`saved events: ${result.new.length} new, ${result.updated.length} updated,`
      + ` ${result.unknown.length} unknown, ${result.invalid} invalid; ${result.checked} Pages checked`);
    return send(res, 200, result);
  }

  /** Anyone may suggest a Page; it waits for the admin's approval. */
  async function suggest(req, res) {
    if (!suggestions.allow(clientIp(req))) return fail(res, 429, 'Too many suggestions from here, try again in an hour.');
    const body = await readJson(req);
    // A field people don't see: bots fill it in. Answer as if it worked.
    if (body.website) return send(res, 201, { status: 'pending' });
    const result = store.suggestSource(body, now());
    if (result.error) return send(res, result.status, { error: result.error, existing: result.existing });
    console.log(`suggested: ${result.source.url}`);
    return send(res, 201, { status: 'pending', url: result.source.url });
  }

  async function addSource(req, res) {
    const body = await readJson(req);
    const result = store.addSource(body.url, typeof body.name === 'string' ? body.name.trim() : null, now());
    return result.error ? fail(res, result.status, result.error) : send(res, 201, result.source);
  }

  async function updateSource(req, res, id) {
    const body = await readJson(req);
    const source = store.updateSource(id, body, now());
    return source ? send(res, 200, source) : fail(res, 404, 'no such Page');
  }

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (path === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('ok\n');
      }
      if (path === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(page({ publicList }));
      }

      if (path === '/api/events' && req.method === 'GET') {
        if (!publicList && !authorized(req, res)) return undefined;
        return send(res, 200, { events: store.events({ now: now() }), last_collected: store.lastCollected() });
      }
      if (path === '/api/suggestions' && req.method === 'POST') return await suggest(req, res);
      if (path === '/api/pages' && req.method === 'GET') {
        if (!publicList && !authorized(req, res)) return undefined;
        return send(res, 200, { pages: store.publicPages() });
      }
      if (!path.startsWith('/api/')) return fail(res, 404, 'not found');

      // Everything else needs the token.
      if (!authorized(req, res)) return undefined;
      if (path === '/api/me' && req.method === 'GET') return send(res, 204);
      if (path === '/api/events' && req.method === 'POST') return await postEvents(req, res);
      if (path === '/api/sources' && req.method === 'GET') {
        const status = url.searchParams.get('status') === 'pending' ? 'pending' : 'active';
        return send(res, 200, { sources: store.sources(now(), status) });
      }
      if (path === '/api/sources' && req.method === 'POST') return await addSource(req, res);
      const m = path.match(/^\/api\/sources\/(\d+)$/);
      if (m && req.method === 'PATCH') return await updateSource(req, res, Number(m[1]));
      if (m && req.method === 'DELETE') {
        return store.deleteSource(Number(m[1])) ? send(res, 204) : fail(res, 404, 'no such Page');
      }
      return fail(res, 404, 'not found');
    } catch (e) {
      if (e.status) return fail(res, e.status, e.message);
      console.error(e);
      if (!res.headersSent) fail(res, 500, 'server error');
      else res.end();
      return undefined;
    }
  };
}

module.exports = { createApp, RateLimiter };
