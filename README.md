# fbedb

The list of Facebook events collected by [fbevents](https://github.com/mwalczak/fbevents),
running at **https://fbedb.walczaki.com**.

- Open the site to browse events from today on, closest first, grouped by day. The top line
  shows how many there are (and how many match the filters) and when the newest one was collected. Past events are
  never shown (except ones still running, like a festival that started yesterday). Filter by
  venue (the Facebook Page an event came from, or "Nearby" for events from the town page) or
  search, or press **New** for only the events first saved in the last 3 days (they carry a "new"
  tag). Filters stay in the address, so a filtered list can be bookmarked.
- **Manage Pages** (log in with the token) lists the Facebook Pages fbevents checks: add,
  rename, pause or remove them. Removing a Page keeps its events.
- **Adaptive schedule:** a Page is checked on every run (twice a day) while it brings new events.
  Each check without a new event moves it one step slower: daily, every 2 days, every 4 days,
  weekly at most. One new event puts it back on every run. New Pages start on every run. Manage
  Pages shows each Page's schedule, with **Check on next run** and **Always check** to override it.
- fbevents posts every event it finds to the API. Events are stored once, by their Facebook
  event id, so the same event posted again only updates it. fbevents emails only the events
  that were new here.

No dependencies: plain Node 22 with its built-in SQLite. The database file lives on a
persistent volume in k3s.

## API

All requests except the event list need `Authorization: Bearer <TOKEN>`.

| Request | What |
| --- | --- |
| `GET /api/events` | Events from today on (Warsaw time), closest first, and `last_collected` (when the newest event was saved). Public unless `PUBLIC_LIST=false` |
| `POST /api/events` | Save events from a fbevents run (below) |
| `GET /api/sources` | Facebook Pages, each with its schedule and `due` (check it on this run) |
| `POST /api/sources` | Add a Page: `{"url": "https://www.facebook.com/SomeVenue", "name": "…"}` |
| `PATCH /api/sources/{id}` | `{"name": "…"}`, `{"enabled": false}`, `{"pinned": true}` (always check), `{"check_now": true}` |
| `DELETE /api/sources/{id}` | Stop checking a Page (its events stay) |
| `GET /api/me` | 204 if the token is right |
| `GET /healthz` | Health check |

Saving events:

```sh
curl -X POST https://fbedb.walczaki.com/api/events -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"events": [
    {"url": "https://www.facebook.com/events/1234567890/", "name": "Concert", "start": 1791900000,
     "end": 1791907200, "place": "The Venue", "city": "Rybnik", "lat": 50.1, "lon": 18.5,
     "distance_km": 1.2, "sources": [{"kind": "page", "url": "https://www.facebook.com/TheVenue"}]},
    {"url": "https://www.facebook.com/events/2345678901/", "touch": true, "sources": [{"kind": "nearby"}]}
  ]}'
```

```json
{"new": ["1234567890"], "updated": [], "unknown": ["2345678901"], "invalid": 0}
```

- The event is matched on the number in its `url`; other fields are optional, and missing ones
  don't erase what is stored. `start`/`end` are Unix seconds.
- `touch: true` only refreshes an event that is already stored ("still listed") and never
  creates one, so fbevents can report events it didn't open again without adding the ones
  it skipped as past or too far away.
- `sources` links the event to Pages on the list (matched by address) and marks `nearby` ones.
- `checked` (optional, next to `events`) lists the Pages fbevents looked at in this run, as
  `{"url": "…", "final_url": "…"}`: their schedules move on (back to every run if one of their
  events was new). `final_url` is where Facebook redirected, e.g. the vanity name of a
  `profile.php?id=…` Page; it's remembered so both addresses count as the same Page.

## Deploy

Every push runs the tests. Pushes to `main` also build the image, push it to GHCR and apply
`k8s.yaml` on the k3s server, the same way as `mobile-scores` and `ip`.

Repository secrets (Settings → Secrets and variables → Actions):

- `VPS_HOST`, `VPS_SSH_KEY`: same as in `mobile-scores`
- `FBEDB_TOKEN`: a long random string (`openssl rand -hex 24`). Put the **same value** in the
  `FBEDB_TOKEN` secret of the fbevents repo. You also log in to Manage Pages with it.

One-time setup:

- DNS: point `fbedb.walczaki.com` at the server (unless there is already a `*.walczaki.com` record).
- After the first run, make the GHCR package public (Packages → fbedb → Package settings →
  Change visibility), then re-run the workflow.

To make the list private too, set `PUBLIC_LIST` to `"false"` in `k8s.yaml`.

## Maintenance

The **Maintenance** workflow (Actions tab) runs one-off database fixes inside the running pod:

- `unlink-overlinked`: events linked to more than `max_pages` Pages lose their Page links (the
  events stay). For events fbevents picked up from Facebook's own menus instead of a Page; the
  next fbevents run links them again to the Pages that really list them. Try a dry run first.

## Local development

```sh
npm test
TOKEN=dev npm start   # http://localhost:8080
```
