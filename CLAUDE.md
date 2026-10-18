# Notes for Claude

Web list of Facebook events for mwalczak/fbevents (which scrapes Facebook and POSTs here).
See README.md for the API and deploy.

- Same shape as mwalczak/mobile-scores: Node 22, no dependencies, `node:sqlite`, one page
  rendered in the browser from the JSON API (`src/page.js`). Keep it dependency-free and small;
  it runs with a 128Mi memory limit.
- Events are unique by Facebook event id (`events.fb_id`, parsed from the url). Upserts use
  COALESCE so a partial post never erases stored fields; `touch` entries never create events.
- The API contract (`POST /api/events`, `GET /api/sources`) is used by `fbevents/fbedb.py`;
  change both together.
- Adaptive schedule per Page (`INTERVAL_DAYS` levels in `src/store.js`): fbevents reads `due` from
  `GET /api/sources` and reports `checked` Pages with `POST /api/events`.
- Schema changes go in `Store.migrate()` (ALTER TABLE ADD COLUMN), never by recreating tables:
  the live database is on a volume.
- Pages have a `status`: active (on the list, enabled or paused), pending (a visitor's suggestion),
  rejected, removed. Deleting is soft (status removed) so repeats are caught; only active Pages are
  given to fbevents or linked to events.
- Tests: `npm test`.
