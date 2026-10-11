// SQLite storage (Node's built-in node:sqlite, no dependencies).
const { DatabaseSync } = require('node:sqlite');

const EVENT_FIELDS = ['name', 'start', 'end', 'when_text', 'place', 'city', 'lat', 'lon', 'distance_km', 'card'];

/** "https://m.facebook.com/events/123/?ref=x" -> "123" (null if it isn't an event address). */
function eventId(url) {
  const m = /\/events\/(\d{5,})/.exec(String(url || ''));
  return m ? m[1] : null;
}

/**
 * One spelling per Facebook Page, so the same Page added twice is caught:
 * https://www.facebook.com/SomeVenue (or profile.php?id=…), no trailing slash, no tracking.
 */
function pageUrl(input) {
  let u;
  try {
    u = new URL(String(input || '').trim());
  } catch {
    return null;
  }
  if (!/(^|\.)facebook\.com$/i.test(u.hostname) && !/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) return null;
  const host = /facebook\.com$/i.test(u.hostname) ? 'www.facebook.com' : u.host;
  const path = u.pathname.replace(/\/+$/, '');
  if (!path || path === '/') return null;
  if (/\/profile\.php$/i.test(path)) {
    const id = u.searchParams.get('id');
    return id && /^\d+$/.test(id) ? `${u.protocol}//${host}/profile.php?id=${id}` : null;
  }
  return `${u.protocol}//${host}${path}`;
}

class Store {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS sources (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        url        TEXT    NOT NULL UNIQUE,
        name       TEXT,
        enabled    INTEGER NOT NULL DEFAULT 1,
        created_at TEXT    NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        fb_id       TEXT    NOT NULL UNIQUE,
        name        TEXT,
        start       INTEGER,
        end         INTEGER,
        when_text   TEXT,
        place       TEXT,
        city        TEXT,
        lat         REAL,
        lon         REAL,
        distance_km REAL,
        card        TEXT,
        online      INTEGER NOT NULL DEFAULT 0,
        nearby      INTEGER NOT NULL DEFAULT 0,
        first_seen  TEXT    NOT NULL,
        last_seen   TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_by_start ON events (start);
      CREATE TABLE IF NOT EXISTS event_sources (
        event_id  INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
        source_id INTEGER NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
        PRIMARY KEY (event_id, source_id)
      );
    `);
    const set = EVENT_FIELDS.map((f) => `${f} = COALESCE(:${f}, ${f})`).join(', ');
    this.q = {
      lastCollected: this.db.prepare('SELECT MAX(first_seen) AS t FROM events'),
      sources: this.db.prepare(`
        SELECT s.id, s.url, s.name, s.enabled, s.created_at, COUNT(es.event_id) AS events
        FROM sources s LEFT JOIN event_sources es ON es.source_id = s.id
        GROUP BY s.id ORDER BY COALESCE(s.name, s.url) COLLATE NOCASE`),
      sourceByUrl: this.db.prepare('SELECT id, name FROM sources WHERE url = ?'),
      addSource: this.db.prepare('INSERT INTO sources (url, name, enabled, created_at) VALUES (?, ?, 1, ?)'),
      updateSource: this.db.prepare(
        'UPDATE sources SET name = COALESCE(:name, name), enabled = COALESCE(:enabled, enabled) WHERE id = :id'),
      nameSourceIfEmpty: this.db.prepare("UPDATE sources SET name = ? WHERE id = ? AND COALESCE(name, '') = ''"),
      deleteSource: this.db.prepare('DELETE FROM sources WHERE id = ?'),
      eventByFbId: this.db.prepare('SELECT id FROM events WHERE fb_id = ?'),
      insertEvent: this.db.prepare(`
        INSERT INTO events (fb_id, ${EVENT_FIELDS.join(', ')}, online, nearby, first_seen, last_seen)
        VALUES (:fb_id, ${EVENT_FIELDS.map((f) => `:${f}`).join(', ')}, :online, :nearby, :now, :now)`),
      updateEvent: this.db.prepare(`
        UPDATE events SET ${set}, online = MAX(online, :online), nearby = MAX(nearby, :nearby),
          last_seen = :now WHERE id = :id`),
      touchEvent: this.db.prepare(
        'UPDATE events SET nearby = MAX(nearby, :nearby), last_seen = :now WHERE id = :id'),
      link: this.db.prepare('INSERT OR IGNORE INTO event_sources (event_id, source_id) VALUES (?, ?)'),
      events: this.db.prepare(`
        SELECT e.*, json_group_array(json_object('id', s.id, 'name', COALESCE(s.name, s.url)))
                      FILTER (WHERE s.id IS NOT NULL) AS sources
        FROM events e
        LEFT JOIN event_sources es ON es.event_id = e.id
        LEFT JOIN sources s ON s.id = es.source_id
        WHERE e.start >= :today
           OR e.end >= :now
           OR (e.start IS NULL AND e.last_seen >= :recent)
        GROUP BY e.id
        ORDER BY e.start IS NULL, e.start, e.id
        LIMIT :limit`),
    };
  }

  // ---- sources (Facebook Pages fbevents should check) ----

  sources() {
    return this.q.sources.all().map((s) => ({ ...s, enabled: Boolean(s.enabled) }));
  }

  /** Adds a Page; returns {source} or {error, status}. */
  addSource(url, name, now = new Date()) {
    const clean = pageUrl(url);
    if (!clean) return { status: 422, error: 'not a Facebook Page address' };
    if (this.q.sourceByUrl.get(clean)) return { status: 409, error: 'this Page is already on the list' };
    const { lastInsertRowid } = this.q.addSource.run(clean, name || null, now.toISOString());
    return { source: this.sources().find((s) => s.id === Number(lastInsertRowid)) };
  }

  updateSource(id, { name, enabled }) {
    const changes = this.q.updateSource.run({
      id,
      name: typeof name === 'string' ? name.trim() || null : null,
      enabled: typeof enabled === 'boolean' ? Number(enabled) : null,
    }).changes;
    return changes ? this.sources().find((s) => s.id === id) : null;
  }

  deleteSource(id) {
    return this.q.deleteSource.run(id).changes > 0;
  }

  // ---- events ----

  /**
   * Saves events from one fbevents run. Each event is matched on its Facebook event id
   * (taken from its url), so the same event is stored once however often it is posted.
   * `touch: true` entries only refresh events already stored and are never created.
   * Returns the fb ids that were new, updated, and touched-but-unknown.
   */
  saveEvents(events, now = new Date()) {
    const result = { new: [], updated: [], unknown: [], invalid: 0 };
    const stamp = now.toISOString();
    this.db.exec('BEGIN');
    try {
      for (const ev of events) {
        const fbId = eventId(ev && ev.url);
        if (!fbId) {
          result.invalid += 1;
          continue;
        }
        const sources = Array.isArray(ev.sources) ? ev.sources : [];
        const nearby = Number(sources.some((s) => s && s.kind === 'nearby'));
        let row = this.q.eventByFbId.get(fbId);
        if (ev.touch) {
          if (!row) {
            result.unknown.push(fbId);
            continue;
          }
          this.q.touchEvent.run({ id: row.id, nearby, now: stamp });
          result.updated.push(fbId);
        } else {
          const values = { online: Number(Boolean(ev.online)), nearby, now: stamp };
          for (const f of EVENT_FIELDS) values[f] = clean(f, ev[f]);
          if (row) {
            this.q.updateEvent.run({ ...values, id: row.id });
            result.updated.push(fbId);
          } else {
            row = { id: Number(this.q.insertEvent.run({ ...values, fb_id: fbId }).lastInsertRowid) };
            result.new.push(fbId);
          }
        }
        for (const s of sources) {
          if (!s || s.kind !== 'page') continue;
          const source = this.q.sourceByUrl.get(pageUrl(s.url));
          if (!source) continue; // a Page no longer on the list
          this.q.link.run(row.id, source.id);
          if (s.name) this.q.nameSourceIfEmpty.run(String(s.name).slice(0, 200), source.id);
        }
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return result;
  }

  /**
   * Events from today on (local time, TZ=Europe/Warsaw in the image), closest first, with the
   * Pages they came from. Never past ones, except events still running (a festival that
   * started yesterday). Events without a date show while Facebook still lists them.
   */
  events({ now = new Date(), limit = 1000 } = {}) {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    return this.q.events.all({
      today: Math.floor(today.getTime() / 1000),
      now: Math.floor(now.getTime() / 1000),
      recent: new Date(now.getTime() - 14 * 86400_000).toISOString(),
      limit,
    }).map((r) => ({
      id: r.fb_id,
      url: `https://www.facebook.com/events/${r.fb_id}/`,
      name: r.name,
      start: r.start,
      end: r.end,
      when_text: r.when_text,
      place: r.place,
      city: r.city,
      distance_km: r.distance_km,
      card: r.card,
      online: Boolean(r.online),
      nearby: Boolean(r.nearby),
      sources: JSON.parse(r.sources || '[]'),
      first_seen: r.first_seen,
      last_seen: r.last_seen,
    }));
  }

  /** When the newest event was first saved (ISO time), or null. */
  lastCollected() {
    return this.q.lastCollected.get().t ?? null;
  }

  close() {
    this.db.close();
  }
}

function clean(field, v) {
  if (v === undefined || v === null || v === '') return null;
  if (['start', 'end'].includes(field)) return Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null;
  if (['lat', 'lon', 'distance_km'].includes(field)) return Number.isFinite(Number(v)) ? Number(v) : null;
  return String(v).slice(0, field === 'card' ? 1000 : 500);
}

module.exports = { Store, eventId, pageUrl };
