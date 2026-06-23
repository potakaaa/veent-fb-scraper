---
phase: fb-posts-scraper
date: 2026-06-19
status: COMPLETE_WITH_GAPS
feature: general-plans
plan: process/general-plans/active/fb-posts-scraper_19-06-26/fb-posts-scraper_PLAN_19-06-26.md
---

# FB Posts Scraper — EXECUTE Report

## TL;DR

12 of 13 checklist items implemented, syntax-checked, and unit-verified (server libs + extension wiring + dashboard typecheck all green). The ONE remaining item — **A1, the Neon `ALTER TABLE` migration** — is intentionally NOT run: it is a production schema mutation (hard-stop class) and the `.env` read is privacy-gated. A ready-to-run idempotent migration script is written. All 5 validated corrections from VALIDATE were honored exactly. No silent deviations.

## What Was Done

### Phase A — DB + Server (code DONE; A1 deferred)
- **A2** `server/db/schema.pg.sql` — added `google_form_url TEXT` to CREATE TABLE + an idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` fallback for existing DBs.
- **A3** `server/lib/llm.js` — added `structureFBPost(rawCaption, authorName, timestamp, rawLinks)` returning exactly the 9 plan fields (`is_relevant`, `title`, `start_datetime`, `venue_name`, `city_location`, `organizer_name`, `short_description`, `google_form_detected`, `google_form_url`). rawLinks rendered as a numbered list in the prompt. Additive — `structureXEvent` untouched.
- **A4** `server/lib/sanitize.js` — added `sanitizeFBPost(raw)`. Required `post_url` (new `FB_POST_URL_RE`, accepts any facebook.com host) + non-empty `raw_caption`. **PII rejection (EMAIL_RE, PHONE_RE) on raw_caption AND author_name** (validated correction #4). raw_links deduped/trimmed/capped at 20.
- **A5** `server/lib/dedup.js` — added `normalizeFBPostUrl(rawUrl)`. Handles group path, group permalink, group query `post_id`/`story_fbid`/`fbid`, bare permalink, user `/posts/`, pfbid permalinks, and `story.php`. Returns null on unrecognized formats.
- **A6** `server/routes/events-posts.js` (NEW) — `POST /` + `POST /reprocess`. Pipeline: sanitize → normalize → keyword pre-filter (RESALE_RE/SLOP_RE/MIN_CAPTION_LEN=20) → LLM → content dedup → URL dedup → INSERT with `google_form_url`. **Deterministic Tier-1 Google Form fallback** (`detectDirectGoogleForm`) so `forms.gle`/`docs.google.com/forms` links populate `google_form_url` even when Ollama is offline (makes gate C5 pass without the LLM). Reprocess reconstructs caption from `short_description`.
- **A7** `server/server.js` — registered `eventsPostsRouter` at `/events/posts` BEFORE `/events` (and before `/events/x`).

### Phase B — Extension (code DONE)
- **B1** `extension/manifest.json` — host_permissions → `https://www.facebook.com/*`; added `content-posts.js` content script matching `https://www.facebook.com/*`. Existing events + x content scripts preserved.
- **B2** `extension/popup/popup.html` — relabeled first radio "Facebook Events"; added "Facebook Posts" (`value="posts"`) + kept "X.com". Three modes total.
- **B3** `extension/popup/popup.js` — `posts` branch in `updateExtractLabel()` ("Collect FB Posts"), `checkActiveTab()` (CHECK_TAB_POSTS + "Navigate to a Facebook page or group first."), `extractBtn` (RELAY_EXTRACT_POSTS + POSTS_PROGRESS listener), `openSearchBtn` (opens generic facebook.com for posts mode).
- **B4** `extension/content/content-posts.js` (NEW) — responds to `EXTRACT_POSTS`; **guards against facebook.com/events/* via `isEventsPage()`** (validated correction #5). DOM targets `div[data-pagelet^="FeedUnit"]` → fallback `div[role="article"]`. Extracts post_url, author_name, raw_caption, Tier-1 Google-Form links (unwraps `l.facebook.com/l.php?u=`). Skips captions <20 chars.
- **B5** `extension/background/service-worker.js` — `CHECK_TAB_POSTS` (valid on any facebook.com URL) + `RELAY_EXTRACT_POSTS` using **`chrome.tabs.sendMessage(tab.id, {action:'EXTRACT_POSTS'})`, NOT executeScript** (validated correction #1), following the RELAY_EXTRACT pattern. Batch-POSTs to /events/posts (50/batch) with POSTS_PROGRESS updates.

### Phase C — Dashboard (code DONE; typecheck green)
- **C1** `apps/web/src/lib/types.ts` — added `google_form_url?: string | null` to `Event` (validated correction #2: types.ts, NOT api.ts).
- **C2** `apps/web/src/components/table/EventsTableFilters.tsx` — added `<SelectItem value="facebook.posts">Facebook Posts</SelectItem>` after x.com (validated correction #3: filters file, NOT index.tsx).
- **C3** `apps/web/src/components/table/EventsTable.tsx` — added display-only "Form" column rendering `Form ↗` link when `google_form_url` non-null, `—` otherwise. NOT added to SortKey. Updated skeleton column count (10→11) and empty-state colSpan (10→11).

## What Was Skipped or Deferred

- **A1 — Neon `ALTER TABLE events ADD COLUMN IF NOT EXISTS google_form_url TEXT;`** — NOT run. Reasons: (1) production schema mutation = hard-stop class per EXECUTE deviation protocol; (2) the plan's own hard-stop forbids running ALTER against Neon without env confirmation; (3) the `.env` read is privacy-hook-gated and needs user approval. **Ready-to-run migration written:** `server/db/migrate-google-form-url.js` (idempotent, prints target host for confirmation, verifies column after). Run with `node db/migrate-google-form-url.js` from `server/` once approved.

## Test Gate Outcomes

Deterministic (Mode A) gates run this session — all green:
- `node --check` on all 5 modified/new server files + 3 extension JS files → all OK.
- 20/20 unit assertions for `normalizeFBPostUrl` + `sanitizeFBPost` (incl. PII rejection, URL edge cases, regression that `normalizeUrl`/`normalizeXUrl` unchanged).
- 13 extension assertions: manifest wiring (3 content scripts, facebook.com/* perms), Tier-1 GFORM regex behavior, B5 uses sendMessage with NO executeScript call in the posts handler.
- 5 server export-integrity assertions: existing signatures intact, new exports present, router mountable.
- events-posts router exposes `POST /` + `POST /reprocess` (verified via route stack).
- `pnpm typecheck` (apps/web) → exit 0, 0 TS errors.
- Regression: `content.js`, `content-x.js`, `events-x.js`, `routes/events.js` all UNCHANGED.

Validate-contract gates requiring the live migrated DB + restarted server (deferred behind A1):
- **C1-db-col** (hybrid `psql \d events`) — blocked on A1.
- **C4-insert / C5-forms / C7-skip / C8-dedup** (agent-probe curl to /events/posts) — blocked on A1 + server restart. Server (7842) and Ollama (11434) are both running, but the live server runs pre-change code; it needs a restart to mount /events/posts.
- **C2-dom / C3-popup / C12-regression** — manual browser tests (load unpacked extension); not automatable here.

## Plan Deviations

None silent. One gated deferral (A1, above). All 5 validated corrections honored:
1. B5 sendMessage (not executeScript) ✓
2. C1 → types.ts (not api.ts) ✓
3. C2 → EventsTableFilters.tsx (not index.tsx) ✓
4. A4 sanitizeFBPost PII rejection ✓
5. content-posts.js events-page guard ✓

## Test Infra Gaps Found

- Zero automated test harness in this codebase (known baseline). I added throwaway `node -e` assertion blocks for the pure functions this session; they are not persisted as a suite. Recommend a future `server/test/` with the `normalizeFBPostUrl`/`sanitizeFBPost` assertions captured as a real runner — see `process/context/tests/all-tests.md`.
- LLM-dependent gates (C6/C7 short-URL + relevance) cannot be fully automated without an Ollama mock. The deterministic Tier-1 form fallback closes the C5 gap without the LLM.
- Facebook DOM selectors in content-posts.js are best-effort and will need live-browser tuning (the plan flags C2 manual test as the gate).

## Closeout Packet

- **Selected plan:** `process/general-plans/active/fb-posts-scraper_19-06-26/fb-posts-scraper_PLAN_19-06-26.md`
- **Finished:** 12/13 checklist items (all code), unit/typecheck/wiring verified, regression-safe.
- **Verified vs unverified:** Verified = all static + pure-function + typecheck + route-wiring gates. Unverified = live DB column (C1), curl agent-probes (C4/C5/C7/C8), manual browser tests (C2/C3/C12) — all blocked behind the A1 migration + a server restart.
- **Cleanup remaining:** Run A1 migration (user-gated), restart server, then run the agent-probe curls and manual browser flow.
- **Best next state:** `Keep in active/testing` — code-complete but the migration + live verification gates are pending. NOT yet ready for UPDATE PROCESS archival.
- **Closeout classification:** Keep in active/testing.

## Forward Preview

### Test Infra Found
No runner exists; deterministic assertions were run inline (not persisted). A `server/test/` runner for the two pure functions is the highest-value follow-up.

### Blast Radius Changes
Server: 3 lib files (additive exports), 1 new route, server.js (one mount line). Extension: 3 files + 1 new content script + broadened host permission (facebook.com/*). DB: additive column (pending). Dashboard: 3 files (interface + filter + display column).

### Commands to Stay Green
- Server static: `cd server && node --check routes/events-posts.js lib/llm.js lib/sanitize.js lib/dedup.js server.js`
- Dashboard: `cd apps/web && pnpm typecheck`
- Migration (user-gated): `cd server && node db/migrate-google-form-url.js`
- Post-migration restart, then agent-probe: `curl -X POST http://localhost:7842/events/posts -H 'Content-Type: application/json' -d '[{"post_url":"https://www.facebook.com/groups/123/posts/456","author_name":"Test User","raw_caption":"Community meetup this Saturday, register via Google Form please fill out the form","raw_links":["https://forms.gle/abc123"],"collected_at":"2026-06-19T00:00:00Z"}]'`

### Dependency Changes
None. No new npm packages. `pg` already present for the migration script.

## Unresolved Questions / Gate for User

1. **A1 migration approval** — may I run `node db/migrate-google-form-url.js` against the live Neon DB? It is additive (`ADD COLUMN IF NOT EXISTS`), but it is a production schema change. This requires approving the `.env` read so `DATABASE_URL` loads.
2. **Server restart** — the live server (port 7842) runs pre-change code. Restarting it (so /events/posts mounts) is needed before the curl agent-probes. Is the server launchd/nodemon-managed, or should I restart it directly?
