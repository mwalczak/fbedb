// SQLite storage (Node's built-in node:sqlite, no dependencies).
const { DatabaseSync } = require('node:sqlite');

const EVENT_FIELDS = ['name', 'start', 'end', 'when_text', 'place', 'city', 'lat', 'lon', 'distance_km', 'card'];

/**
 * How often a Page is checked, by level: a check that brings a new event puts the Page back
 * on level 0 (every run, i.e. twice a day), each quiet check moves it one level slower.
 */
const INTERVAL_DAYS = [0.5, 1, 2, 4, 7];
// Runs start at a random time within half an hour, and morning and evening runs are 10 and
// 14 hours apart, so a Page counts as due a few hours early rather than missing a run.
const SLACK_MS = 3 * 3600_000;

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
  // The Page itself, also when its events tab was pasted (…/SomeVenue/upcoming_hosted_events).
  const path = u.pathname.replace(/\/+$/, '').replace(/\/(upcoming_hosted_events|past_hosted_events|events)$/i, '');
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
    this.migrate();
    const set = EVENT_FIELDS.map((f) => `${f} = COALESCE(:${f}, ${f})`).join(', ');
    this.q = {
      lastCollected: this.db.prepare('SELECT MAX(first_seen) AS t FROM events'),
      sources: this.db.prepare(`
        SELECT s.id, s.url, s.alias_url, s.name, s.enabled, s.pinned, s.level, s.last_checked_at,
               s.last_change_at, s.next_check_at, s.created_at, s.status, s.note, s.suggested_by,
               COUNT(es.event_id) AS events
        FROM sources s LEFT JOIN event_sources es ON es.source_id = s.id
        WHERE s.status = :status
        GROUP BY s.id ORDER BY COALESCE(s.name, s.url) COLLATE NOCASE`),
      // Any status: for duplicate checks.
      anyByUrl: this.db.prepare(
        'SELECT id, name, status FROM sources WHERE url = :url OR alias_url = :url ORDER BY url = :url DESC LIMIT 1'),
      // Only Pages on the list: what fbevents' events and checks are matched to.
      sourceByUrl: this.db.prepare(`
        SELECT id, name, level FROM sources WHERE status = 'active' AND (url = :url OR alias_url = :url)
        ORDER BY url = :url DESC LIMIT 1`),
      namesForDuplicates: this.db.prepare(
        "SELECT id, url, name, status FROM sources WHERE status IN ('active', 'pending') AND name IS NOT NULL"),
      suggest: this.db.prepare(`
        INSERT INTO sources (url, name, enabled, created_at, status, note, suggested_by)
        VALUES (:url, :name, 1, :now, 'pending', :note, :by)`),
      reactivate: this.db.prepare(`
        UPDATE sources SET status = 'active', enabled = 1, name = COALESCE(:name, name), level = 0,
          next_check_at = NULL, reviewed_at = :now, reject_reason = NULL WHERE id = :id`),
      approve: this.db.prepare(`
        UPDATE sources SET status = 'active', enabled = 1, name = COALESCE(:name, name), level = 0,
          next_check_at = NULL, reviewed_at = :now WHERE id = :id AND status = 'pending'`),
      review: this.db.prepare(`
        UPDATE sources SET status = :status, reviewed_at = :now, reject_reason = :reason
        WHERE id = :id AND status = 'pending'`),
      remove: this.db.prepare("UPDATE sources SET status = 'removed', enabled = 0 WHERE id = ? AND status <> 'removed'"),
      unlinkSource: this.db.prepare('DELETE FROM event_sources WHERE source_id = ?'),
      checked: this.db.prepare(`
        UPDATE sources SET last_checked_at = :now, level = :level, next_check_at = :next,
          last_change_at = CASE WHEN :changed THEN :now ELSE last_change_at END,
          alias_url = COALESCE(:alias, alias_url)
        WHERE id = :id`),
      checkNow: this.db.prepare('UPDATE sources SET next_check_at = NULL WHERE id = ?'),
      pin: this.db.prepare('UPDATE sources SET pinned = ? WHERE id = ?'),
      addSource: this.db.prepare('INSERT INTO sources (url, name, enabled, created_at) VALUES (?, ?, 1, ?)'),
      updateSource: this.db.prepare(
        'UPDATE sources SET name = COALESCE(:name, name), enabled = COALESCE(:enabled, enabled) WHERE id = :id'),
      nameSourceIfEmpty: this.db.prepare("UPDATE sources SET name = ? WHERE id = ? AND COALESCE(name, '') = ''"),
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

  /** Brings an older database file up to date. */
  migrate() {
    const have = new Set(this.db.prepare('PRAGMA table_info(sources)').all().map((c) => c.name));
    const add = {
      alias_url: 'TEXT', // the address Facebook redirected to, e.g. the vanity name of profile.php?id=…
      pinned: 'INTEGER NOT NULL DEFAULT 0', // checked on every run whatever the schedule says
      level: 'INTEGER NOT NULL DEFAULT 0', // index into INTERVAL_DAYS
      last_checked_at: 'TEXT',
      last_change_at: 'TEXT', // last check that brought a new event
      next_check_at: 'TEXT', // NULL: due on the next run
      // active: on the list (enabled or paused); pending: suggested, waiting for approval;
      // rejected: suggestion turned down; removed: taken off the list. Kept to catch repeats.
      status: "TEXT NOT NULL DEFAULT 'active'",
      note: 'TEXT', // the suggester's "why this venue"
      suggested_by: 'TEXT',
      reject_reason: 'TEXT',
      reviewed_at: 'TEXT',
    };
    for (const [col, type] of Object.entries(add)) {
      if (!have.has(col)) this.db.exec(`ALTER TABLE sources ADD COLUMN ${col} ${type}`);
    }
    // Addresses saved before pageUrl() also dropped a pasted events tab.
    const rows = this.db.prepare('SELECT id, url FROM sources').all();
    const urls = new Set(rows.map((r) => r.url));
    const fix = this.db.prepare('UPDATE sources SET url = ? WHERE id = ?');
    for (const r of rows) {
      const clean = pageUrl(r.url);
      if (clean && clean !== r.url && !urls.has(clean)) {
        fix.run(clean, r.id);
        urls.add(clean);
      }
    }
  }

  // ---- sources (Facebook Pages fbevents should check) ----

  /**
   * The Pages on the list (status "active", enabled or paused) with their check schedule;
   * `due` = to be checked on the next run. With status "pending": suggestions to review.
   */
  sources(now = new Date(), status = 'active') {
    return this.q.sources.all({ status }).map((s) => ({
      ...s,
      enabled: Boolean(s.enabled),
      pinned: Boolean(s.pinned),
      interval_days: INTERVAL_DAYS[s.level] ?? INTERVAL_DAYS.at(-1),
      due: s.status === 'active' && Boolean(s.enabled)
        && (Boolean(s.pinned) || !s.next_check_at || Date.parse(s.next_check_at) <= now.getTime()),
      ...(status === 'pending' ? { similar: this.similarNames(s) } : {}),
    }));
  }

  /** Other Pages (on the list or suggested) whose name looks like this one's: maybe the same venue. */
  similarNames(source) {
    const key = nameKey(source.name);
    if (key.length < 4) return [];
    return this.q.namesForDuplicates.all()
      .filter((o) => o.id !== source.id)
      .filter((o) => {
        const k = nameKey(o.name);
        return k.length >= 4 && (k === key || k.includes(key) || key.includes(k));
      })
      .map(({ id, url, name, status }) => ({ id, url, name, status }));
  }

  /**
   * A visitor's suggestion: saved as "pending" until the admin approves it. Refused when the
   * Page (or the address Facebook redirects it to) is already known, in whatever state.
   */
  suggestSource({ url, name, note, by }, now = new Date()) {
    const clean = pageUrl(url);
    if (!clean) return { status: 422, error: 'This is not a Facebook Page address.' };
    const known = this.q.anyByUrl.get({ url: clean });
    if (known) {
      const why = {
        active: 'This Page is already on the list.',
        pending: 'This Page was already suggested and is waiting for approval.',
        rejected: 'This Page was suggested before and not taken on.',
        removed: 'This Page was on the list before and was taken off.',
      }[known.status];
      return { status: 409, error: why, existing: { name: known.name, status: known.status } };
    }
    const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
    const { lastInsertRowid } = this.q.suggest.run({
      url: clean, name: text(name, 200), note: text(note, 1000), by: text(by, 200), now: now.toISOString(),
    });
    return { source: this.sources(now, 'pending').find((s) => s.id === Number(lastInsertRowid)) };
  }

  /** Adds a Page; returns {source} or {error, status}. */
  addSource(url, name, now = new Date()) {
    const clean = pageUrl(url);
    if (!clean) return { status: 422, error: 'not a Facebook Page address' };
    const known = this.q.anyByUrl.get({ url: clean });
    if (known && known.status === 'active') return { status: 409, error: 'this Page is already on the list' };
    if (known) { // a suggestion, or a Page rejected or removed earlier: (back) on the list
      this.q.reactivate.run({ id: known.id, name: name || null, now: now.toISOString() });
      return { source: this.sources(now).find((s) => s.id === known.id) };
    }
    const { lastInsertRowid } = this.q.addSource.run(clean, name || null, now.toISOString());
    return { source: this.sources().find((s) => s.id === Number(lastInsertRowid)) };
  }

  /**
   * name, enabled, pinned ("always check"), check_now (due on the next run); for a suggestion
   * also status "active" (approve) or "rejected" with reject_reason.
   */
  updateSource(id, { name, enabled, pinned, check_now: checkNow, status, reject_reason: reason }, now = new Date()) {
    if (status === 'active' || status === 'rejected') {
      const done = status === 'active'
        ? this.q.approve.run({ id, name: typeof name === 'string' ? name.trim() || null : null, now: now.toISOString() })
        : this.q.review.run({ id, status, now: now.toISOString(),
          reason: typeof reason === 'string' ? reason.trim().slice(0, 500) || null : null });
      if (!done.changes) return null;
      return this.sources(now, status).find((s) => s.id === id) || { id, status };
    }
    const changes = this.q.updateSource.run({
      id,
      name: typeof name === 'string' ? name.trim() || null : null,
      enabled: typeof enabled === 'boolean' ? Number(enabled) : null,
    }).changes;
    if (!changes) return null;
    if (typeof pinned === 'boolean') this.q.pin.run(Number(pinned), id);
    if (checkNow === true) this.q.checkNow.run(id);
    return this.sources(now).find((s) => s.id === id)
      || this.sources(now, 'pending').find((s) => s.id === id) || null;
  }

  /** Takes a Page off the list. Its events stay; it's remembered so it isn't suggested again. */
  deleteSource(id) {
    if (!this.q.remove.run(id).changes) return false;
    this.q.unlinkSource.run(id);
    return true;
  }

  /**
   * Events linked to more than `maxPages` Pages were picked up from Facebook's own menus, not
   * from the Pages (fixed in fbevents). Removes those events' Page links; the events stay, and
   * the next fbevents run links them again to the Pages that really list them.
   * Returns the affected events; with dryRun nothing is changed.
   */
  unlinkOverlinked(maxPages, { dryRun = false } = {}) {
    const rows = this.db.prepare(`
      SELECT e.id, e.fb_id, e.name, COUNT(*) AS pages FROM event_sources es
      JOIN events e ON e.id = es.event_id
      GROUP BY e.id HAVING COUNT(*) > ? ORDER BY pages DESC`).all(maxPages);
    if (!dryRun) {
      const del = this.db.prepare('DELETE FROM event_sources WHERE event_id = ?');
      for (const r of rows) del.run(r.id);
    }
    return rows.map(({ fb_id, name, pages }) => ({ fb_id, name, pages }));
  }

  // ---- events ----

  /**
   * Saves events from one fbevents run. Each event is matched on its Facebook event id
   * (taken from its url), so the same event is stored once however often it is posted.
   * `touch: true` entries only refresh events already stored and are never created.
   * `checked` lists the Pages fbevents looked at in this run ({url, final_url} or a url): each
   * one's schedule moves on, faster if one of its events was new, slower if not.
   * Returns the fb ids that were new, updated, and touched-but-unknown.
   */
  saveEvents(events, now = new Date(), checked = []) {
    const result = { new: [], updated: [], unknown: [], invalid: 0, checked: 0 };
    const stamp = now.toISOString();
    const changedSources = new Set();
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
            row = { id: Number(this.q.insertEvent.run({ ...values, fb_id: fbId }).lastInsertRowid), isNew: true };
            result.new.push(fbId);
          }
        }
        for (const s of sources) {
          if (!s || s.kind !== 'page') continue;
          const source = this.q.sourceByUrl.get({ url: pageUrl(s.url) });
          if (!source) continue; // a Page no longer on the list
          this.q.link.run(row.id, source.id);
          if (row.isNew) changedSources.add(source.id);
          if (s.name) this.q.nameSourceIfEmpty.run(String(s.name).slice(0, 200), source.id);
        }
      }
      for (const c of Array.isArray(checked) ? checked : []) {
        const url = pageUrl(typeof c === 'string' ? c : c && c.url);
        const source = url && this.q.sourceByUrl.get({ url });
        if (!source) continue;
        const changed = changedSources.has(source.id);
        const level = changed ? 0 : Math.min((source.level ?? 0) + 1, INTERVAL_DAYS.length - 1);
        const finalUrl = c && typeof c === 'object' ? pageUrl(c.final_url) : null;
        this.q.checked.run({
          id: source.id,
          now: stamp,
          level,
          changed: Number(changed),
          next: new Date(now.getTime() + INTERVAL_DAYS[level] * 86400_000 - SLACK_MS).toISOString(),
          alias: finalUrl && finalUrl !== url ? finalUrl : null,
        });
        result.checked += 1;
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

/** "Klub Odyseja – Wydarzenia" -> "klubodysejawydarzenia": for spotting the same venue twice. */
function nameKey(name) {
  return String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ł/gi, 'l')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

function clean(field, v) {
  if (v === undefined || v === null || v === '') return null;
  if (['start', 'end'].includes(field)) return Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null;
  if (['lat', 'lon', 'distance_km'].includes(field)) return Number.isFinite(Number(v)) ? Number(v) : null;
  return String(v).slice(0, field === 'card' ? 1000 : 500);
}

module.exports = { Store, eventId, pageUrl, INTERVAL_DAYS };
