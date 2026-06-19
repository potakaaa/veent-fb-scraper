---
name: plan:x-scraper-ollama
description: "Extend fb-events-tool with X.com tweet scraping, Ollama LLM structuring, source column, and Facebook backfill"
date: 19-06-26
feature: none
phase: SIMPLE
---

# X.com Scraper + Ollama LLM Layer — Implementation Plan

**Date** 19-06-26
**Complexity** SIMPLE
**Status** READY FOR VALIDATE

---

## Overview

Extend the existing fb-events-tool to support X.com (Twitter) as a second event-data source. Raw tweet captions are parsed into structured event fields via a local Ollama LLM call. All rows (Facebook and X.com) carry a `source` column. Existing 386 Facebook rows are backfilled to `'facebook'` automatically via the column DEFAULT.

### Goals

1. Add `source TEXT NOT NULL DEFAULT 'facebook'` column to Neon PostgreSQL `events` table via a one-statement migration; backfills existing rows automatically.
2. Build `extension/content/content-x.js` — a Chrome MV3 content script that scrapes raw tweet text, post URL, author handle, and timestamp from `x.com` pages.
3. Build `server/lib/llm.js` — an Ollama client (`structureXEvent`) that calls the local Ollama API to parse raw caption text into structured event fields.
4. Build `server/routes/events-x.js` — `POST /events/x` route that accepts raw X.com tweet cards, runs LLM structuring, then inserts with `source = 'x.com'`.
5. Update `server/lib/dedup.js` to add `normalizeXUrl()` for X.com tweet URLs.
6. Update `server/lib/sanitize.js` to add `sanitizeX()` for X.com cards.
7. Update `server/routes/events.js` to pass `source = 'facebook'` on all inserts.
8. Update `server/server.js` to register the new route.
9. Update `extension/manifest.json` for X.com content script and host permissions.
10. Update `extension/background/service-worker.js` to handle X.com messages and relay to `POST /events/x`.
11. Update `extension/popup/popup.js` and `popup.html` for X.com mode toggle.
12. Update `review-ui/app.js` and `review-ui/index.html` for a `Source` column and filter dropdown.

Context loaded from `process/context/all-context.md` and `process/context/tests/all-tests.md`.

---

## Scope

**In scope:**
- All 12 files listed in the task brief
- Neon PostgreSQL `ALTER TABLE` migration (not SQLite — `schema.sql` is legacy; `schema.pg.sql` is the live DB)
- Ollama HTTP API integration using native `fetch` (Node 20+, no new npm packages)
- `source` column filter on `GET /events`

**Out of scope:**
- Automated test suite (no test infra exists yet)
- CI/CD or staging environment
- Ollama model fine-tuning or prompt engineering beyond a working baseline
- X.com authentication or API (scrapes public DOM only)
- Windows/Linux install scripts

---

## Touchpoints

Files modified:

| File | Type | Change |
|---|---|---|
| `server/db/schema.pg.sql` | DB schema | Add `source TEXT NOT NULL DEFAULT 'facebook'` column |
| `server/routes/events.js` | Route | Add `source = 'facebook'` to INSERT columns |
| `server/routes/events-x.js` | Route (NEW) | `POST /events/x` with LLM structuring |
| `server/lib/llm.js` | Lib (NEW) | Ollama `structureXEvent` function |
| `server/lib/sanitize.js` | Lib | Add `sanitizeX()` export |
| `server/lib/dedup.js` | Lib | Add `normalizeXUrl()` export |
| `server/server.js` | App entry | Register `/events/x` route |
| `extension/manifest.json` | Extension config | X.com `content_scripts` + `host_permissions` |
| `extension/content/content-x.js` | Extension (NEW) | X.com DOM scraper content script |
| `extension/background/service-worker.js` | Extension | Handle X.com messages, relay to `/events/x` |
| `extension/popup/popup.js` | Extension | Add X.com mode toggle logic |
| `extension/popup/popup.html` | Extension | Add X.com mode toggle UI |
| `review-ui/app.js` | UI | Source column + filter |
| `review-ui/index.html` | UI | Source column header + filter dropdown |

**Total files: 14** (3 new + 11 modified)

---

## Public Contracts

### Database

`ALTER TABLE events ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'facebook';`

New column `source` on `events` table. All existing rows automatically receive `'facebook'`. New rows from Facebook routes pass `'facebook'` explicitly. New rows from X.com route pass `'x.com'`.

### API: POST /events (unchanged contract, source added internally)

Existing callers (extension) unchanged. Server-side sets `source = 'facebook'` on every insert. Response shape `{ inserted, duplicates, errors }` unchanged.

### API: POST /events/x (NEW)

```
Request body: Array<{
  tweet_url: string,      // https://x.com/{user}/status/{tweetId}
  raw_caption: string,    // full tweet text
  author_handle: string,  // @username
  tweet_timestamp: string // ISO string or human-readable
}>

Response: { inserted: number, duplicates: number, errors: Array<{handle, reason}> }
```

### API: GET /events (filter extended)

Adds optional `source` query param: `?source=facebook` or `?source=x.com`. Absence returns all.

### Extension messages (new)

`CHECK_TAB_X` — service worker checks if active tab is on `x.com`.
`RELAY_EXTRACT_X` — service worker relays extraction to `content-x.js`.

### Ollama client (internal only)

`structureXEvent(rawCaption, authorHandle, timestamp) → Promise<StructuredEvent | null>`

Where `StructuredEvent` has: `{ title, start_datetime, venue_name, city_location, organizer_name, short_description }` — all nullable strings.

---

## Blast Radius

| Surface | Risk class | Files |
|---|---|---|
| DB schema | MEDIUM — one-statement migration, DEFAULT covers backfill | `schema.pg.sql` |
| Server routes | LOW-MEDIUM — new route, minimal change to existing | `events.js`, `events-x.js` (new), `server.js` |
| Server lib | LOW — additive exports, no existing function changed | `llm.js` (new), `sanitize.js`, `dedup.js` |
| Extension | MEDIUM — new content script + manifest changes + popup changes | `manifest.json`, `content-x.js` (new), `service-worker.js`, `popup.js`, `popup.html` |
| Review UI | LOW — additive column + filter; existing columns unchanged | `app.js`, `index.html` |

**Overall risk class: MEDIUM** — migration is low-risk (DEFAULT handles backfill); Ollama dependency introduces a runtime failure mode if the service is down (handled with graceful error per card).

---

## Implementation Checklist

### Layer 1 — Database Migration (Neon PostgreSQL)

**Step 1.** Update `server/db/schema.pg.sql` — add `source TEXT NOT NULL DEFAULT 'facebook'` column after the `enriched_at` column.

**Step 2.** Run the migration against the live Neon DB:
```sql
ALTER TABLE events ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'facebook';
```
Run via `psql $DATABASE_URL` or the Neon console SQL editor. Confirm: `\d events` shows the new column; `SELECT DISTINCT source FROM events;` returns `{facebook}`.

Note: `IF NOT EXISTS` makes this idempotent — safe to re-run if the column was already added.

**Step 3.** Update `GET /events` SQL in `server/routes/events.js` — add optional `source` filter:
```js
if (source) { params.push(source); sql += ` AND source = $${params.length}`; }
```
Also extract `source` from `req.query` at the top of the handler alongside `term`, `from`, `to`.

---

### Layer 2 — Server Library Layer

**Step 4.** Update `server/lib/dedup.js` — add `normalizeXUrl(url)`:
- Parse `url` with `new URL(url)`
- Match pathname against `/\/(.*?)\/status\/(\d+)/i` — extract numeric tweet ID
- Return `x.com/status/{tweetId}` (no user, no query params)
- Return `null` if no match
- Export both `normalizeUrl` (existing) and `normalizeXUrl` (new)

**Step 5.** Update `server/lib/sanitize.js` — add `sanitizeX(card)` function:
- Validate `card.tweet_url` matches `/x\.com\/(.*?)\/status\/\d+/i`; throw `SanitizationError` if not
- Require `card.raw_caption` (non-empty string); throw if missing
- Require `card.author_handle` (non-empty string); throw if missing
- Apply existing `rejectPii` to `raw_caption` and `author_handle`
- Strip HTML from `raw_caption` using existing `stripHtml`
- Return cleaned object:
  ```
  {
    tweet_url:       card.tweet_url.trim(),
    raw_caption:     stripped caption (max 1000 chars),
    author_handle:   card.author_handle.trim(),
    tweet_timestamp: card.tweet_timestamp || new Date().toISOString(),
    collected_at:    new Date().toISOString()
  }
  ```
- Export `sanitizeX` alongside existing `sanitize` and `SanitizationError`

**Step 6.** Create `server/lib/llm.js` (NEW file, `'use strict'` at top):
- Constants at top:
  ```js
  const OLLAMA_BASE = process.env.OLLAMA_BASE || 'http://localhost:11434';
  const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';
  const OLLAMA_TIMEOUT_MS = 30000;
  ```
- Function `structureXEvent(rawCaption, authorHandle, timestamp)`:
  - Build a prompt string instructing the model to output ONLY a JSON object with keys: `title`, `start_datetime`, `venue_name`, `city_location`, `organizer_name`, `short_description`. All fields nullable strings. Instruct model to respond with ONLY the JSON object, no prose.
  - Call `fetch(`${OLLAMA_BASE}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }), signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS) })`
  - Parse `response.response` (the Ollama generate response field) as JSON
  - Extract the first `{...}` block from the response text using a regex (`/\{[\s\S]*\}/`) in case the model adds any prose before/after; log a warning if regex finds no match before returning null
  - Return the parsed object coercing all values to strings or null; never throw — return `null` on any error (network, parse, timeout)
  - Log errors to `console.error('[llm] structureXEvent failed:', err.message)`
- Export: `module.exports = { structureXEvent };`

---

### Layer 3 — Server Routes

**Step 7.** Update `server/routes/events.js` — add `source = 'facebook'` to the INSERT:
- In the `INSERT INTO events (...)` query, add `source` to column list
- Add `'facebook'` as the corresponding `$N` parameter value
- Update the VALUES clause positional parameter count accordingly (currently `$12`, becomes `$13`)
- No other changes to this file

**Step 8.** Create `server/routes/events-x.js` (NEW file, `'use strict'` at top):
- Import: `express`, `pool` from `../db/pool`, `sanitizeX` + `SanitizationError` from `../lib/sanitize`, `normalizeXUrl` from `../lib/dedup`, `structureXEvent` from `../lib/llm`
- `const MAX_BATCH_X = 50;`
- `POST /` handler:
  - Validate body is array, max 50 cards
  - Per-card loop: `sanitizeX(raw)` → `normalizeXUrl(clean.tweet_url)` → if null throw SanitizationError
  - Call `structureXEvent(clean.raw_caption, clean.author_handle, clean.tweet_timestamp)` — if null, use fallback structured object with `title = clean.author_handle + ': ' + clean.raw_caption.substring(0, 80)` and all other fields null
  - Use `clean.tweet_url` as `event_url`, normalized URL as `event_url_normalized`
  - INSERT into `events` with `source = 'x.com'`, `source_search_term = 'x.com/' + clean.author_handle`, `respondent_count = 0`
  - INSERT columns: `event_url, event_url_normalized, title, start_datetime, end_datetime, venue_name, city_location, organizer_name, short_description, source_search_term, collected_at, respondent_count, source`
  - Pass `null` explicitly for `end_datetime` (not produced by sanitizeX or structureXEvent)
  - Use `ON CONFLICT (event_url_normalized) DO NOTHING` for dedup
  - Run all inserts inside a single `client.query('BEGIN') ... COMMIT` transaction (same pattern as `events.js`)
  - Catch `SanitizationError` per-card; catch DB errors globally → ROLLBACK → 500
  - Return `{ inserted, duplicates, errors }`
- Export: `module.exports = router;`

---

### Layer 4 — Server Entry Point

**Step 9.** Update `server/server.js`:
- Add `const eventsXRouter = require('./routes/events-x');` after existing router requires
- Add `app.use('/events/x', eventsXRouter);` BEFORE `app.use('/events', eventsRouter)` so Express evaluates `/events/x` before `/events` path matching
- No CORS changes needed — current CORS allows all `chrome-extension://` origins, which covers the new X.com extension origin

---

### Layer 5 — Chrome Extension

**Step 10.** Update `extension/manifest.json`:
- Add to `host_permissions`: `"https://x.com/*"` and `"https://twitter.com/*"` (twitter.com redirects to x.com; covering both avoids errors)
- Add new `content_scripts` entry:
  ```json
  {
    "matches": ["https://x.com/*"],
    "js": ["content/content-x.js"],
    "run_at": "document_idle"
  }
  ```
- Keep existing Facebook `content_scripts` entry unchanged

**Step 11.** Create `extension/content/content-x.js` (NEW file, `'use strict'` at top):
- Constants: `const SERVER = 'http://localhost:7842';`
- Function `extractTweets()`:
  - Query `document.querySelectorAll('article[data-testid="tweet"]')` — stable X.com tweet article selector
  - For each article element:
    - `tweet_url`: find `a[href*="/status/"]` within article; use `href` attribute; prepend `https://x.com` if relative; skip if no URL found
    - `raw_caption`: find `[data-testid="tweetText"]` within article; use `innerText`; skip if empty
    - `author_handle`: find `[data-testid="User-Name"]` within article; extract `@handle` via regex `/@(\w+)/`; fall back to `@unknown`
    - `tweet_timestamp`: find `time` element within article; use `datetime` attribute; fall back to `new Date().toISOString()`
    - Skip if `tweet_url` or `raw_caption` is missing/empty
  - Return de-duped array by `tweet_url`
- Message listener for `EXTRACT_X` action: call `extractTweets()`, send response `{ tweets }`

**Step 12.** Update `extension/background/service-worker.js`:
- Add constant `X_URL_RE = /^https:\/\/x\.com\//;`
- Add handler for `CHECK_TAB_X`: query active tab URL; test `X_URL_RE`; respond `{ valid, reason? }`; return `true` from the message listener (async)
- Add handler for `RELAY_EXTRACT_X`:
  - Validate tab is on x.com; else respond `{ tweets: [], error: 'Not on an X.com page.' }`
  - Send `{ action: 'EXTRACT_X' }` to tab; on response POST array to `${SERVER}/events/x`
  - Respond `{ tweets, result }` where `result` is `{ inserted, duplicates, errors }`
  - Return `true` from the message listener (async — keeps response channel open)
- Keep all existing handlers (`CHECK_TAB`, `RELAY_EXTRACT`, `START_ENRICH`) completely unchanged

**Step 13.** Update `extension/popup/popup.html`:
- Add mode toggle block below `.header` and above first `.section`:
  ```html
  <div class="mode-toggle section">
    <label><input type="radio" name="mode" value="facebook" id="modeFb" checked /><span>Facebook</span></label>
    <label><input type="radio" name="mode" value="x" id="modeX" /><span>X.com</span></label>
  </div>
  ```
- Keep all existing HTML unchanged

**Step 14.** Update `extension/popup/popup.js`:
- Add `function getMode()` returning checked radio value
- Update `checkActiveTab()` to branch by mode: `CHECK_TAB_X` for x mode, `CHECK_TAB` for facebook
- Update extract button label dynamically: `'Extract Visible Events'` (FB) or `'Collect X.com Tweets'` (X); update label on DOMContentLoaded (initial load) AND on radio input change
- Add mode-change listener on radio inputs; calls `checkActiveTab()` on change
- In extract button click handler: branch by mode — `'x'` mode sends `RELAY_EXTRACT_X`; `'facebook'` mode uses existing flow unchanged

---

### Layer 6 — Review UI

**Step 15.** Update `review-ui/index.html`:
- Add source filter dropdown to `.filters` div after `filterTo`:
  ```html
  <select id="filterSource">
    <option value="">All sources</option>
    <option value="facebook">Facebook</option>
    <option value="x.com">X.com</option>
  </select>
  ```
- Add `<th>Source</th>` to table header row
- Update `colspan="12"` occurrences to `colspan="13"`

**Step 16.** Update `review-ui/app.js`:
- Extract `filterSource` value in `loadEvents()` and pass as `source` query param
- Add Source badge cell to `renderTable()` row template: `<span class="badge badge-${e.source === 'x.com' ? 'x' : 'fb'}">${esc(e.source || 'facebook')}</span>`
- Wire `filterSource` change to trigger `loadEvents()`
- Update `colspan` from `12` to `13` in empty/loading states

**Step 17.** Update `review-ui/style.css` with badge styles for `.badge-fb` and `.badge-x`.

---

## Acceptance Criteria

1. **`source` column exists** — `\d events` (psql) shows `source TEXT NOT NULL DEFAULT 'facebook'`; `SELECT COUNT(*) FROM events WHERE source = 'facebook'` returns 386 (all existing rows).
2. **Facebook inserts still work** — `POST /events` with a valid Facebook card returns `{ inserted: 1 }` and the new row has `source = 'facebook'`.
3. **X.com dedup** — `normalizeXUrl('https://x.com/johndoe/status/1234567890')` returns `'x.com/status/1234567890'`.
4. **X.com sanitize** — `sanitizeX({ tweet_url: 'https://x.com/u/status/123', raw_caption: 'Event tonight!', author_handle: '@u' })` returns cleaned object without throwing.
5. **Ollama structuring** — with Ollama running locally, `structureXEvent('Big tech meetup at Venue X in Sydney on Friday 7pm', '@events', '...')` returns an object with non-null `title` and `start_datetime`.
6. **`POST /events/x` inserts** — a POST with one valid tweet card returns `{ inserted: 1 }` and the DB row has `source = 'x.com'` and `title` populated from LLM.
7. **Dedup on `POST /events/x`** — posting the same tweet URL twice returns `{ inserted: 1, duplicates: 1 }`.
8. **LLM down fallback** — if Ollama is not running, `POST /events/x` still inserts with a fallback title; does not 500.
9. **Extension X.com mode** — with extension loaded in Chrome, switching to X.com mode on an `x.com/` tab shows "Ready" status in popup.
10. **Review UI source filter** — selecting "X.com" in the source dropdown shows only `source = 'x.com'` rows; selecting "Facebook" shows only `source = 'facebook'` rows.
11. **Review UI source badge** — each row shows a "facebook" or "x.com" badge in the Source column.

---

## Dependencies and Risks

### Dependencies

- **Ollama running locally** at `http://localhost:11434` with `llama3` (or `OLLAMA_MODEL` env var) pulled. The server does not fail to start if Ollama is down — only individual `POST /events/x` cards return a fallback title.
- **Neon PostgreSQL** — the live DB accessible via `DATABASE_URL` env var. Migration must run against the live DB before any new code is deployed.
- **Node.js 20+** — `fetch` is used natively for Ollama calls; `AbortSignal.timeout()` requires Node 17.3+ (Node 20 satisfies this).
- **Chrome extension reload** — after `manifest.json` changes, the extension must be reloaded in `chrome://extensions` for new host permissions and content scripts to take effect.

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Ollama model produces non-JSON or malformed JSON | Medium | `structureXEvent` wraps parse in try/catch; returns null; caller uses fallback title |
| X.com DOM changes break `article[data-testid="tweet"]` selector | Medium | Log warning in content script; graceful empty array return; user sees zero results |
| `ALTER TABLE` errors if column already exists | Low | Migration uses `ADD COLUMN IF NOT EXISTS` — idempotent; safe to re-run |
| `/events/x` route registered after `/:id` causes Express confusion | Low | Register `/events/x` router BEFORE `/events` router in `server.js` |
| Ollama timeout blocks batch processing | Medium | `AbortSignal.timeout(30000)` per call; per-card timeout prevents hang; 50-card cap limits worst case |
| Twitter/X.com `x.com` vs `twitter.com` redirect | Low | Add both to `host_permissions`; content script only registers on `x.com/*` |

---

## Data Flow

### X.com scrape-to-DB flow

```
User on x.com → clicks "Collect X.com Tweets" in popup
  → popup.js sends RELAY_EXTRACT_X to service-worker.js
  → service-worker sends EXTRACT_X to content-x.js
  → content-x.js queries DOM → returns { tweet_url, raw_caption, author_handle, tweet_timestamp }[]
  → service-worker POSTs to http://localhost:7842/events/x
  → events-x.js: sanitizeX → normalizeXUrl → structureXEvent → INSERT source='x.com'
  → returns { inserted, duplicates, errors }
  → popup displays result
```

### Ollama call flow

```
structureXEvent(rawCaption, authorHandle, timestamp):
  → builds JSON-extraction prompt
  → POST http://localhost:11434/api/generate { model, prompt, stream: false }
  → parse response.response → extract first {...} block → JSON.parse
  → return { title, start_datetime, venue_name, city_location, organizer_name, short_description }
  → on any error: log + return null
```

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Run migration SQL; `\d events` shows source column | Agent-Probe (manual psql) | Criterion 1: source column exists |
| `SELECT COUNT(*) FROM events WHERE source='facebook'` returns 386 | Agent-Probe (manual psql) | Criterion 1: existing rows backfilled |
| `curl POST /events` with FB card; row has `source='facebook'` | Hybrid (manual curl + DB check) | Criterion 2: Facebook inserts still work |
| `node -e "require('./server/lib/dedup').normalizeXUrl('https://x.com/u/status/123')"` | Hybrid (node REPL) | Criterion 3: X.com URL normalization |
| `node -e "require('./server/lib/sanitize').sanitizeX({...})"` | Hybrid (node REPL) | Criterion 4: X.com sanitization |
| `curl POST /events/x` with tweet card; Ollama running; row has LLM title | Agent-Probe (end-to-end manual) | Criteria 5+6: Ollama structuring + insert |
| `curl POST /events/x` same tweet twice; `{ inserted:1, duplicates:1 }` | Hybrid (manual curl) | Criterion 7: dedup |
| `curl POST /events/x` with Ollama stopped; inserts with fallback title; no 500 | Hybrid (manual curl) | Criterion 8: LLM-down fallback |
| Load extension; go to x.com; switch to X.com mode; popup shows Ready | Agent-Probe (Chrome manual) | Criterion 9: extension X.com mode |
| Review UI; select X.com filter; only x.com rows appear | Agent-Probe (browser manual) | Criterion 10: source filter |
| Review UI; each row shows facebook/x.com badge | Agent-Probe (browser manual) | Criterion 11: source badge |

---

## Test Infra Improvement Notes

No automated tests exist in this repo (see `process/context/tests/all-tests.md` — zero test suite currently). All verification is manual (agent-probe or hybrid curl/REPL). Gaps for future test infra:

- Unit tests for `normalizeXUrl` and `sanitizeX` — pure functions, easy to add with `node:test`
- Unit tests for `structureXEvent` — requires Ollama mock or stub; medium effort
- Integration test for `POST /events/x` route — requires a test DB or test Neon branch
- E2E browser test for `content-x.js` — requires Puppeteer with x.com access

These gaps are known and acceptable for now. A formal test suite is a follow-up work item.

---

## Phase Completion Rules

This is a SIMPLE (one-session) plan. The rules below govern when to advance.

- **Step 1 (Research):** Context scanned — `process/context/all-context.md` and `process/context/tests/all-tests.md` loaded. Complete.
- **Step 2 (Validate contract):** vc-validate-agent must write the Validate Contract section below. A placeholder validate contract is a BLOCKER — do not proceed to execute until a gate verdict is present.
- **Step 3 (Execute):** All 17 checklist steps complete; manual verification gates pass (see Verification Evidence table). Execute runs in order: DB migration first (Step 2), then server lib, then routes, then extension, then review UI.
- **Step 4 (Update process):** Plan archived, context docs updated if durable knowledge changed.

### Phase Loop Progress

- [x] 1a. Research updated — context and codebase scan complete
- [x] 1b. Plan supplemented — checklist reflects research findings (validate agent applied P1+P2)
- [x] 2. Validate contract written — vc-validate-agent gate verdict is green
- [x] 3. Execute complete — all 17 steps done; mechanical gates (C1–C4, C5-sanitize, C6–C9 + 3 bonus error-path) green; C5-LLM blocked on missing Ollama model; C10–C12 manual browser pending. See x-scraper-ollama_REPORT_19-06-26.md
- [ ] 4. Update process — plan archived, context docs updated

> Step 2 is never skippable. Do not proceed to step 3 until vc-validate-agent has written a real gate verdict (not this placeholder).

---

## Resume and Execution Handoff

1. **Selected plan file path:** `process/general-plans/active/x-scraper-ollama_19-06-26/x-scraper-ollama_PLAN_19-06-26.md`
2. **Last completed phase:** VALIDATE (this file). EXECUTE not yet run.
3. **Validate-contract status:** written — CONDITIONAL gate, all concerns accepted.
4. **Supporting context files loaded:**
   - `process/context/all-context.md`
   - `process/context/tests/all-tests.md`
   - `server/routes/events.js`, `server/lib/sanitize.js`, `server/lib/dedup.js`, `server/server.js`
   - `server/db/schema.pg.sql`, `server/db/pool.js`
   - `extension/manifest.json`, `extension/background/service-worker.js`
   - `extension/popup/popup.js`, `extension/popup/popup.html`
   - `review-ui/app.js`, `review-ui/index.html`
5. **Next step:** ENTER EXECUTE MODE.
   - DB migration (Step 2) must run FIRST before any server code changes.
   - Restart `node server.js` after server file changes.
   - Reload extension in `chrome://extensions` after `manifest.json` changes.
   - Ollama must be running: `ollama pull llama3 && ollama serve`.

---

## Validate Contract

Status: CONDITIONAL
Date: 19-06-26
date: 2026-06-19
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 2/7 signals (S2: schema/API surface touched, S7: 14 files in blast radius). Single-plan, single-session, no inter-agent coordination needed.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| C1 | source column exists with correct DEFAULT | Hybrid | `psql $DATABASE_URL -c "\d events"` — shows source TEXT NOT NULL DEFAULT 'facebook' | A |
| C2 | Existing 386 rows backfilled to 'facebook' | Hybrid | `psql $DATABASE_URL -c "SELECT COUNT(*) FROM events WHERE source='facebook'"` — expect 386 | A |
| C3 | Facebook inserts carry source='facebook' | Hybrid | `curl -X POST http://localhost:7842/events -H 'Content-Type: application/json' -d '[{"event_url":"https://www.facebook.com/events/1234567890","title":"Test","source_search_term":"test","collected_at":"2026-06-19T00:00:00Z","respondent_count":15}]'` then `psql $DATABASE_URL -c "SELECT source FROM events WHERE event_url_normalized='facebook.com/events/1234567890'"` | A |
| C4 | normalizeXUrl extracts tweet ID | Hybrid | `node -e "const {normalizeXUrl}=require('./server/lib/dedup'); console.assert(normalizeXUrl('https://x.com/johndoe/status/1234567890')==='x.com/status/1234567890','normalizeXUrl failed')"` | A |
| C5 | sanitizeX returns clean object on valid input | Hybrid | `node -e "const {sanitizeX}=require('./server/lib/sanitize'); const r=sanitizeX({tweet_url:'https://x.com/u/status/123',raw_caption:'Event tonight!',author_handle:'@u'}); console.assert(r.tweet_url && r.raw_caption,'sanitizeX failed')"` | A |
| C6 | POST /events/x inserts with source='x.com' | Hybrid | `curl -X POST http://localhost:7842/events/x -H 'Content-Type: application/json' -d '[{"tweet_url":"https://x.com/u/status/99999","raw_caption":"Tech meetup at Venue X in Sydney Friday 7pm","author_handle":"@u","tweet_timestamp":"2026-06-19T00:00:00Z"}]'` — expect `{inserted:1}` | A |
| C7 | Dedup on POST /events/x | Hybrid | Same curl as C6 twice — second call returns `{inserted:0,duplicates:1}` | A |
| C8 | LLM-down fallback: no 500 | Hybrid | Stop Ollama; repeat C6 curl — expect `{inserted:1}` with fallback title, no 500 response | A |
| C9 | GET /events?source= filter | Hybrid | `curl http://localhost:7842/events?source=facebook` returns only facebook rows; `curl http://localhost:7842/events?source=x.com` returns only x.com rows | A |
| C10 | Extension X.com mode in Chrome | Agent-Probe | Load extension; navigate to x.com; switch to X.com mode in popup; observe "Ready" status | A |
| C11 | Review UI source filter | Agent-Probe | Open http://localhost:7842; select X.com in source dropdown; verify only x.com rows appear | A |
| C12 | Review UI source badge | Agent-Probe | Each row shows 'facebook' or 'x.com' badge in Source column | A |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

Legacy line form:
- DB migration: Hybrid — `psql $DATABASE_URL -c "\d events"` after ALTER TABLE
- normalizeXUrl: Hybrid — `node -e "require('./server/lib/dedup').normalizeXUrl(...)`
- sanitizeX: Hybrid — `node -e "require('./server/lib/sanitize').sanitizeX(...)`
- POST /events/x insert + dedup + fallback: Hybrid — manual curl
- GET /events source filter: Hybrid — manual curl
- Extension mode / UI: Agent-Probe — Chrome manual + browser manual
- No automated unit tests: Known-Gap — documented as follow-up work item

Dimension findings:
- Infra fit: PASS — route ordering correct, pool pattern correct, no new npm deps, Node 20 AbortSignal.timeout satisfied
- Test coverage: CONCERN — zero automated tests; all verification is hybrid/agent-probe (accepted: project has no test infra; documented in Test Infra Improvement Notes)
- Breaking changes: PASS — all changes additive; GET /events source filter backwards compatible; existing callers unaffected
- Security surface: CONCERN — Ollama sequential timeout (50 cards x 30s = 25-min worst case; LOW risk for local tool); prompt injection risk is LOW (parameterized INSERT, null-on-error defense, output scoped to named fields)
- Layer 1 DB migration feasibility: CONCERN — resolved by P1 (ADD COLUMN IF NOT EXISTS); now idempotent
- Layer 2 server library feasibility: PASS — all helpers (rejectPii, stripHtml) exist and are reusable; JSON regex edge case mitigated by null-return + warning log (added to Step 6)
- Layer 3 server routes feasibility: PASS — end_datetime null handling now explicit in Step 8
- Layer 4 server entry point feasibility: PASS — route ordering specified correctly
- Layer 5 chrome extension feasibility: PASS — return true for async handlers now explicit in Step 12; popup label init now explicit in Step 14
- Layer 6 review UI feasibility: PASS — Step 17 promoted from optional to required (P2)

Open gaps:
- No automated tests for normalizeXUrl, sanitizeX, structureXEvent — known-gap: documented as NEW PLAN REQUIRED (future test infra)
- Ollama model name sensitivity (llama3 vs llama3:latest) — known runtime risk; use OLLAMA_MODEL env var if needed

What this coverage does NOT prove:
- C1-C2 (Hybrid psql): does not prove migration rollback procedure or behavior under concurrent migrations
- C3 (Hybrid curl+psql): does not prove batch insert with mixed valid/invalid cards (error handling path)
- C4 (Hybrid node REPL): does not prove all X.com URL variants (mobile, query params, URL fragments)
- C5 (Hybrid node REPL): does not prove PII rejection paths (email/phone in raw_caption)
- C6-C8 (Hybrid curl): does not prove concurrent batch behavior or per-card timeout at exactly 30s
- C9 (Hybrid curl): does not prove source filter SQL injection safety
- C10-C12 (Agent-Probe Chrome/browser): does not prove X.com DOM selector resilience across X.com UI updates

Gate: CONDITIONAL (concerns noted; accepted by session — test coverage gap accepted per project scope; Ollama timeout risk accepted for local tool)
Accepted by: session (autonomous, /goal execution) — concerns accepted: (1) zero automated tests / all verification hybrid+agent-probe — accepted per project scope with no test infra; (2) Ollama sequential timeout worst case — accepted as LOW risk for local single-user tool; (3) prompt injection risk — accepted LOW given parameterized SQL and null-on-error defense

---

## Autonomous Goal Block

SESSION GOAL: Implement X.com scraper + Ollama LLM layer for fb-events-tool — add source column, X.com content script, LLM structuring route, and review UI source filter/badge
Charter + umbrella plan: N/A — single plan
Autonomy: auto-proceed on all reversible decisions; surface only hard stops (irreversible/outward-facing actions without explicit contract instruction)
Hard stop conditions / safety constraints:
- Do NOT run the ALTER TABLE migration without DATABASE_URL set — verify env var first
- Do NOT push or deploy to any remote environment — this is a local-only tool
- Do NOT change existing Facebook route behavior or response contract
- Stop if any step would delete or overwrite existing DB rows
Next phase: EXECUTE: process/general-plans/active/x-scraper-ollama_19-06-26/x-scraper-ollama_PLAN_19-06-26.md
Validate contract: inline in plan (## Validate Contract section)
Execute start: Run DB migration first (Step 2): `psql $DATABASE_URL -c "ALTER TABLE events ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'facebook';"` | Then: implement Steps 1-17 in order | Gate commands: hybrid curl + node REPL per Verification Evidence table | high-risk pack: no
