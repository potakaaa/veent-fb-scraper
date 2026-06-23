# FB Posts Scraper

**Date**: 19-06-26
**Complexity**: COMPLEX
**Status**: PLAN
**Context files**: process/context/all-context.md, process/context/tests/all-tests.md

---

## Overview

Add a **Facebook Posts** scraper as a third extension mode alongside the existing Facebook Events and X.com scrapers. The scraper extracts raw post text and embedded links from Facebook feed/group pages, sends them to the server, runs them through Ollama for classification and structuring, and detects Google Forms links using a two-tier approach (client-side regex + LLM contextual detection). The detected Google Form URL is stored in a new `google_form_url` column.

The existing Facebook Events mode is relabeled "Facebook Events" in the popup UI to distinguish it from the new "Facebook Posts" mode.

**In scope:**
- Third popup mode "Facebook Posts" with new content script
- Manifest update to allow `facebook.com/*` host permissions
- `google_form_url TEXT` DB column (additive migration, no breaking change)
- New server route `POST /events/posts` + `/reprocess` endpoint
- New LLM function `structureFBPost()` — same Ollama backend as X.com scraper
- Google Form URL detection: `forms.gle`, `docs.google.com/forms/d/`, common short URLs (tinyurl, bit.ly, rb.gy, ow\.ly)
- Dashboard: source filter addition ("Facebook Posts"), `google_form_url` column in table

**Out of scope (v1):**
- Short URL resolution (HTTP HEAD follow-redirect for bit.ly → full URL)
- Storing all `raw_links` beyond the detected Google Form URL
- Facebook post enrichment (opening post detail pages)
- Extension manifest rename from "FB Events Collector"
- Automatic group/page navigation

---

## Context and Goals

The tool currently stores Facebook events and X.com tweet-based events. Many Facebook posts in community groups or pages announce events with registration via Google Forms. This scraper captures those posts so they appear in the same dashboard alongside events, with the Google Form link surfaced for easy access.

Architecture follows the same pattern as X.com:
- Content script → background service worker → `POST /events/posts` → Ollama structuring → PostgreSQL
- `source = 'facebook.posts'` on all inserted rows
- `event_url_normalized` on the post permalink is the dedup key
- Reprocess endpoint for rows where Ollama was offline at insertion time

---

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | Popup shows three modes: "Facebook Events", "Facebook Posts", "X.com" |
| AC-2 | "Facebook Posts" mode only activates on `facebook.com` pages (not events pages exclusively) |
| AC-3 | Content script extracts `post_url`, `author_name`, `raw_caption`, `raw_links[]`, `collected_at` from visible FB feed/group post cards |
| AC-4 | Posts with `raw_caption` under 20 chars are skipped before sending to the server |
| AC-5 | `POST /events/posts` inserts a row with `source = 'facebook.posts'` |
| AC-6 | `google_form_url` is populated when a `forms.gle/` or `docs.google.com/forms/d/` link is in `raw_links` |
| AC-7 | LLM sets `google_form_url` to a short URL (tinyurl, bit.ly, etc.) when post text contains Google Forms keywords alongside that short URL |
| AC-8 | LLM marks `is_relevant = false` for pure reactions, memes, resale posts — those rows are skipped |
| AC-9 | Duplicate post (same `event_url_normalized`) is silently ignored on second scrape |
| AC-10 | `POST /events/posts/reprocess` updates `enriched_at` and structured fields for fallback-title rows |
| AC-11 | Dashboard source filter includes "Facebook Posts"; selecting it returns only `source = 'facebook.posts'` rows |
| AC-12 | `google_form_url` renders as a clickable "Form ↗" link in the events table when non-null |
| AC-13 | Existing Facebook Events scraper (`source = 'facebook'`) works unchanged after all changes |

---

## Phase Completion Rules

A step is **CODE DONE** when the file is written and the server/extension builds without errors.
A step is **VERIFIED** only after the corresponding manual browser test or agent probe passes (see Verification Evidence table).
Do not mark VERIFIED from code inspection alone — run the gate.

---

## Touchpoints

| File | Change Type |
|---|---|
| `extension/manifest.json` | Modify: expand host_permissions, add new content script entry |
| `extension/popup/popup.html` | Modify: add third radio, relabel first radio |
| `extension/popup/popup.js` | Modify: add `posts` mode branch, new message handlers |
| `extension/content/content-posts.js` | **NEW** |
| `extension/background/service-worker.js` | Modify: add `CHECK_TAB_POSTS`, `RELAY_EXTRACT_POSTS` handlers |
| `server/db/schema.pg.sql` | Modify: add `google_form_url TEXT` to CREATE TABLE |
| `server/lib/llm.js` | Modify: add `structureFBPost()` export |
| `server/lib/sanitize.js` | Modify: add `sanitizeFBPost()` export |
| `server/lib/dedup.js` | Modify: add `normalizeFBPostUrl()` export |
| `server/routes/events-posts.js` | **NEW** |
| `server/server.js` | Modify: register `eventsPostsRouter` before `/events` |
| `apps/web/src/lib/types.ts` | Modify: add `google_form_url` to Event interface (NOTE: types.ts, not api.ts) |
| `apps/web/src/components/table/EventsTable.tsx` | Modify: add `google_form_url` column |
| `apps/web/src/components/table/EventsTableFilters.tsx` | Modify: add "Facebook Posts" SelectItem (NOTE: filter is here, not in index.tsx) |

---

## Public Contracts

### DB column (additive only)
```sql
ALTER TABLE events ADD COLUMN IF NOT EXISTS google_form_url TEXT;
```
All existing rows default to `NULL`. No existing queries break. `GET /events` returns this column automatically.

### New API routes
```
POST /events/posts         — batch insert FB post cards (max 50/request)
                             Body: array of { post_url, author_name, raw_caption, raw_links[], collected_at, search_term? }
                             Returns: { inserted, duplicates, skipped, errors }

POST /events/posts/reprocess — re-run LLM on rows where source='facebook.posts' AND enriched_at IS NULL (max 200)
                               Returns: { total, updated, skipped, failed }
```

### New source value
`source = 'facebook.posts'`

### New extension message actions
- `CHECK_TAB_POSTS` → `{ valid: boolean, reason?: string }`
- `RELAY_EXTRACT_POSTS` → `{ started: boolean, total: number, error?: string }`
- `POSTS_PROGRESS` → `{ done: boolean, current, total, inserted, duplicates, skipped, errors }`

---

## Blast Radius

- **Extension:** 3 files modified + 1 new content script. Broader host permission (`facebook.com/*`).
- **Server:** 3 lib files modified (additive exports only) + 1 new route + `server.js` routing change.
- **DB:** Additive ALTER TABLE. UNIQUE constraint on `event_url_normalized` unchanged.
- **Dashboard:** 3 files modified (types.ts for Event interface, EventsTable.tsx for column, EventsTableFilters.tsx for filter option).
- **Risk class:** Medium. All new code paths are isolated behind `source = 'facebook.posts'`. Existing Facebook Events and X.com paths are unchanged. The only shared-file risk is `server/server.js` (one `app.use()` line) and the three lib files (new exports, no existing function changes).

---

## Implementation Checklist

### Phase A — DB + Server Foundation

- [~] A1: Run `ALTER TABLE events ADD COLUMN IF NOT EXISTS google_form_url TEXT;` against Neon DB — DEFERRED (user-gated: prod schema change + privacy `.env` gate). Idempotent runner written: `server/db/migrate-google-form-url.js`
- [x] A2: Update `server/db/schema.pg.sql` to include `google_form_url TEXT` in CREATE TABLE — DONE (CREATE TABLE + ALTER fallback)
- [x] A3: Add `structureFBPost(rawCaption, authorName, timestamp, rawLinks[])` to `server/lib/llm.js` — DONE (9 fields, numbered rawLinks; structureXEvent untouched)
  - Fields returned by LLM: `is_relevant` (bool), `title`, `start_datetime`, `venue_name`, `city_location`, `organizer_name`, `short_description`, `google_form_detected` (bool), `google_form_url` (string|null)
  - Prompt instructs LLM to: classify relevance, extract fields, identify Google Form URL from `rawLinks` or text keywords
  - Format `rawLinks` as a numbered list in the prompt so Ollama can reference individual URLs
- [x] A4: Add `sanitizeFBPost(raw)` to `server/lib/sanitize.js` — DONE (PII rejection on raw_caption + author_name verified)
  - Required: `post_url` (facebook.com URL), `raw_caption` (non-empty string)
  - Optional: `author_name`, `raw_links` (array), `collected_at`
  - Must run PII rejection (EMAIL_RE, PHONE_RE) on `raw_caption` and `author_name` — same pattern as `sanitizeX`
- [x] A5: Add `normalizeFBPostUrl(rawUrl)` to `server/lib/dedup.js` — DONE (10 unit cases: path + query + pfbid + story.php; null on unrecognized)
  - Normalize to `facebook.com/posts/{id}` or `facebook.com/groups/{groupId}/posts/{postId}`
  - Strip query params and fragments; return null on failure
  - Note: Facebook group permalinks may use `?post_id=` query format — handle both path-based and query-based IDs; return null for unrecognized formats
- [x] A6: Create `server/routes/events-posts.js` with `POST /` and `POST /reprocess` — DONE (deterministic Tier-1 form fallback added so C5 passes without Ollama)
  - Pipeline: sanitize → normalize → pre-filter → LLM → content dedup → URL dedup → insert with `google_form_url`
  - Same RESALE_RE, SLOP_RE, MIN_CAPTION_LEN pre-filter as X route
  - Fallback title format: `"author_name: first 80 chars"` when LLM returns null
  - INSERT must include `google_form_url` column; model on events-x.js INSERT (lines 134-149) adding the new column
  - Reprocess: reconstruct raw_caption from `short_description` field (same pattern as X reprocess)
- [x] A7: Register router in `server/server.js` before `/events` route: — DONE (mounted before /events/x and /events)
  ```js
  const eventsPostsRouter = require('./routes/events-posts');
  app.use('/events/posts', eventsPostsRouter);
  ```

### Phase B — Extension

- [x] B1: Update `extension/manifest.json` — DONE (host_permissions → facebook.com/*; content-posts.js content script added; existing scripts preserved)
  - Change host_permissions: replace or supplement `facebook.com/events/*` with `https://www.facebook.com/*`
  - Add second content script: `{ "js": ["content/content-posts.js"], "matches": ["https://www.facebook.com/*"], "run_at": "document_idle" }`
- [x] B2: Update `extension/popup/popup.html` — DONE (relabeled "Facebook Events"; added "Facebook Posts" radio)
  - Change existing `facebook` radio label to **"Facebook Events"**
  - Add new radio `value="posts"` labeled **"Facebook Posts"**
- [x] B3: Update `extension/popup/popup.js` — DONE (posts branch in label/checkTab/extract/openSearch + POSTS_PROGRESS listener)
  - `updateExtractLabel()`: add `posts` branch → `'Collect FB Posts'`
  - `checkActiveTab()`: add `posts` branch → sends `CHECK_TAB_POSTS`; fallback status: `'Navigate to a Facebook page or group first.'`
  - `extractBtn` handler: add `posts` branch → sends `RELAY_EXTRACT_POSTS`, listens for `POSTS_PROGRESS`
  - `openSearchBtn`: add mode check — for `posts` mode, open `https://www.facebook.com/` (generic); existing behavior unchanged for other modes
- [x] B4: Create `extension/content/content-posts.js` — DONE (isEventsPage() guard added per correction; Tier-1 GFORM links + l.php unwrap)
  - Responds to `EXTRACT_POSTS` message
  - DOM targets: `div[data-pagelet^="FeedUnit"]` or `div[role="article"]` for post containers
  - Extracts: post permalink URL (from timestamp `<a>`), author name (`h2 a`), raw caption text, all link hrefs from post body matching Google Form patterns
  - Google Form regex: `forms\.gle/`, `docs\.google\.com/forms/d/`, tinyurl, bit.ly, rb.gy, ow.ly, cutt.ly
  - Skip posts with `raw_caption` under 20 chars
  - Returns `{ posts: [{ post_url, author_name, raw_caption, raw_links, collected_at }] }`
  - Note: Facebook DOM selectors are fragile and may need adjustment after initial testing (manual browser test C2 is required)
- [x] B5: Update `extension/background/service-worker.js` — DONE (sendMessage EXTRACT_POSTS, NOT executeScript — verified; CHECK_TAB_POSTS + 50/batch POST + POSTS_PROGRESS)
  - Add `CHECK_TAB_POSTS` case: valid if `tab.url.includes('facebook.com')`
  - Add `RELAY_EXTRACT_POSTS` case: use `chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT_POSTS' })` to invoke the already-injected `content-posts.js` content script — do NOT use `chrome.scripting.executeScript` (content-posts.js is auto-injected via manifest, same as content.js for FB Events). Follow the `RELAY_EXTRACT` pattern at lines 79-93 of service-worker.js, not the `RELAY_EXTRACT_X` pattern.
  - After receiving posts from content script, batch-POST to `/events/posts` (50/batch), send `POSTS_PROGRESS` messages after each batch

### Phase C — Dashboard

- [x] C1: Add `google_form_url?: string | null` to `Event` interface in `apps/web/src/lib/types.ts` (NOT api.ts — the Event interface lives in types.ts) — DONE (typecheck green)
- [x] C2: Add "Facebook Posts" source option to `apps/web/src/components/table/EventsTableFilters.tsx` — add `<SelectItem value="facebook.posts">Facebook Posts</SelectItem>` after the existing x.com SelectItem (the source filter is in EventsTableFilters.tsx, not index.tsx) — DONE
- [x] C3: Add `google_form_url` column to `apps/web/src/components/table/EventsTable.tsx` — DONE (display-only Form ↗; colSpan/skeleton 10→11; not in SortKey)
  - Render as `<a href={row.google_form_url} target="_blank">Form ↗</a>` when non-null
  - Empty cell otherwise
  - Do not add to SortKey type — this column is display-only, not sortable

---

## Google Form URL Detection — Design Detail

### Tier 1: Client-side regex (before LLM, in content script)
```js
const GFORM_PATTERNS = [
  /https?:\/\/forms\.gle\/[A-Za-z0-9_-]+/,
  /https?:\/\/docs\.google\.com\/forms\/d\/[A-Za-z0-9_-]+/,
  /https?:\/\/(tinyurl\.com|bit\.ly|rb\.gy|ow\.ly|cutt\.ly)\/[A-Za-z0-9_-]+/,
];
```
All matching links from both `href` attributes and raw text are collected into `raw_links[]` and passed to the server.

### Tier 2: LLM contextual detection (in `structureFBPost`)
The LLM receives the full `raw_links[]` array and the raw caption. It identifies `google_form_url` based on:
- Direct match: `forms.gle/` or `docs.google.com/forms/d/` in the links list → use that URL
- Short URL + form keywords in text: "google form", "fill out the form", "fill up the form", "register here", "sign up via form", "form link", "application form", "registration form" → output the short URL as `google_form_url`
- Form keywords but no URL → `google_form_detected: true`, `google_form_url: null`
- No signals → both `false`/`null`

### No URL resolution in v1
Resolving short URLs (HTTP HEAD follow-redirect) is deferred. The stored `google_form_url` may be a shortened link.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| C1: DB column exists after migration | Hybrid (run SQL + `\d events`) | AC-6 (google_form_url storable) |
| C2: content-posts.js extracts post_url, raw_caption, raw_links from live FB feed | Manual browser test (Post-Phase Testing) | AC-3, AC-4 |
| C3: Three popup modes visible; mode labels correct | Manual browser test | AC-1, AC-2 |
| C4: `POST /events/posts` inserts row with `source='facebook.posts'` | Agent probe (curl) | AC-5 |
| C5: `google_form_url` populated for `forms.gle` in raw_links (no LLM needed) | Agent probe with crafted payload | AC-6 |
| C6: LLM sets `google_form_url` to tinyurl when text says "fill out google form" | Agent probe (requires Ollama running locally) | AC-7 |
| C7: `is_relevant=false` post is skipped | Agent probe | AC-8 |
| C8: Second insert of same post returns duplicate | Agent probe | AC-9 |
| C9: `/events/posts/reprocess` updates fallback-title rows | Agent probe | AC-10 |
| C10: Dashboard source filter "Facebook Posts" returns only posts source rows | Manual browser test | AC-11 |
| C11: `google_form_url` renders as clickable link in table | Manual browser test | AC-12 |
| C12: Facebook Events scraper still works | Manual browser test (existing flow) | AC-13 |

---

## Test Infra Improvement Notes

(none identified yet — will be updated after EVL)

See `process/context/tests/all-tests.md` for existing manual verification procedures.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/fb-posts-scraper_19-06-26/fb-posts-scraper_PLAN_19-06-26.md`
2. **Last completed phase/step:** PLAN validated — ready for EXECUTE
3. **Validate-contract status:** written (see ## Validate Contract below)
4. **Supporting context files loaded:**
   - `process/context/all-context.md`
   - `server/routes/events-x.js` — reference implementation for route pattern
   - `server/lib/llm.js` — reference for Ollama integration pattern
   - `extension/popup/popup.js` — reference for popup mode pattern
   - `server/db/schema.pg.sql` — live schema
5. **Next step for a fresh agent picking up mid-execution:** Confirm the DB migration (Step A1) ran successfully by checking `google_form_url` column exists. Then proceed in order: A2 → A3 → A4 → A5 → A6 → A7 (server), then B1 → B2 → B3 → B4 → B5 (extension), then C1 → C2 → C3 (dashboard). Each step is independent; the server must be restarted after A7 before probing the new route.

**Key execute-agent instructions:**
- B5: Use `chrome.tabs.sendMessage` (not `executeScript`) for RELAY_EXTRACT_POSTS — content-posts.js is auto-injected
- C1: Edit `apps/web/src/lib/types.ts` (Event interface), NOT api.ts
- C2: Edit `apps/web/src/components/table/EventsTableFilters.tsx` (not index.tsx)
- A4: Include PII rejection in sanitizeFBPost (EMAIL_RE, PHONE_RE on raw_caption and author_name)

**Next RIPER-5 step:** `ENTER EXECUTE MODE`

---

## Validate Contract

Status: CONDITIONAL
Date: 19-06-26
date: 2026-06-19
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 2/7 signals (S2: DB schema surface; S7: 14 files in blast radius). No cross-agent coordination needed. Sequential inline analysis.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| C1-db-col | google_form_url column exists in events table after migration | Hybrid | `psql $DATABASE_URL -c "\d events"` — confirm google_form_url TEXT column present | A |
| C4-insert | POST /events/posts inserts row with source='facebook.posts' | Hybrid | `curl -X POST http://localhost:7842/events/posts -H 'Content-Type: application/json' -d '[{"post_url":"https://www.facebook.com/groups/123/posts/456","author_name":"Test User","raw_caption":"Test event announcement with Google Form link please fill out the form","raw_links":[],"collected_at":"2026-06-19T00:00:00Z"}]'` returns `{"inserted":1,...}` | A |
| C5-forms | google_form_url populated for forms.gle link in raw_links | Agent-probe | curl with `raw_links: ["https://forms.gle/abc123"]` in payload; verify DB row has google_form_url set | A |
| C7-skip | is_relevant=false post is skipped (skipped counter increments) | Agent-probe | curl with a meme/reaction post caption; Ollama must be running; verify skipped:1 in response | A |
| C8-dedup | Duplicate post silently ignored on second POST | Agent-probe | POST same payload twice; second response returns duplicates:1 | A |
| C2-dom | content-posts.js extracts from live FB feed | Agent-probe | Load extension in Chrome; navigate to a Facebook group page; click Collect FB Posts; verify posts received | A |
| C3-popup | Three modes visible in popup with correct labels | Agent-probe | Load extension; open popup; verify three radios: "Facebook Events", "Facebook Posts", "X.com" | A |
| C12-regression | Existing Facebook Events scraper works unchanged | Agent-probe | Navigate to facebook.com/events/ search page; extract; verify rows inserted with source='facebook' | A |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

Legacy line form (retained for consumers):
- DB column: hybrid: `psql $DATABASE_URL -c "\d events"` after ALTER TABLE
- Route insert: hybrid: curl POST /events/posts with valid payload
- google_form_url: agent-probe: curl with forms.gle in raw_links
- dedup: agent-probe: POST same payload twice
- popup modes: agent-probe: manual browser check
- regression: agent-probe: existing Facebook Events flow

Dimension findings:
- Infra fit: CONCERN — plan originally had wrong file target for C1 (api.ts → fixed to types.ts in plan update P2); route registration pattern confirmed correct via server.js inspection
- Test coverage: CONCERN — zero automated tests (known baseline of this codebase); LLM stubbing for C6 changed from "stubbed LLM" to "requires Ollama running" (no mock mechanism specified); no unit tests for pure functions sanitizeFBPost/normalizeFBPostUrl
- Breaking changes: CONCERN — both facebook.com/events/* and facebook.com/* content scripts will be injected on events pages (benign: content-posts.js only responds to EXTRACT_POSTS messages, not EXTRACT); Chrome extension permission re-prompt expected on reload (expected behavior)
- Security surface: CONCERN — PII rejection not originally specified for sanitizeFBPost; added to A4 checklist in plan update

Section findings:
- Section A — DB + Server Foundation: CONCERN — Facebook group URL normalization is best-effort (some Facebook group post URLs use query params instead of path IDs); reprocess raw_caption reconstruction path added to A6 note; A3 LLM prompt note added for numbered rawLinks list
- Section B — Extension: FAIL (resolved by plan update P1) — original B5 specified executeScript but content-posts.js is auto-injected via manifest; corrected to chrome.tabs.sendMessage following RELAY_EXTRACT pattern
- Section C — Dashboard: CONCERN (resolved by plan updates P2, P3) — C1 referenced wrong file (api.ts → types.ts); C2 filter location clarified (EventsTableFilters.tsx); C3 note added to not include in SortKey

Open gaps:
- No unit tests for sanitizeFBPost, normalizeFBPostUrl (known-gap: documented — consistent with zero-test codebase baseline; see process/context/tests/all-tests.md)
- Facebook DOM selector fragility for content-posts.js (known-gap: manual browser test C2 is the gate; selectors may need adjustment after initial testing)
- Short URL resolution deferred to v2 (out of scope per plan)
- LLM tinyurl detection (C6) requires Ollama running locally — cannot be fully automated without a mock server

What this coverage does NOT prove:
- C1-db-col (hybrid psql check): does not prove the INSERT actually writes to the column correctly; does not prove NULL default on existing rows
- C4-insert (curl): does not prove LLM integration works; does not prove google_form_url is populated correctly; does not prove dedup across concurrent inserts
- C5-forms (agent-probe): does not prove short-URL detection path (LLM required); does not prove edge case of multiple forms.gle links in raw_links
- C7-skip (agent-probe): does not prove behavior when Ollama is offline (fallback path); does not prove all resale/meme keyword patterns trigger skip
- C8-dedup (agent-probe): does not prove content-level dedup (title match); does not prove URL normalization edge cases for group post URLs
- C2-dom (agent-probe): does not prove extraction on all Facebook page types (groups vs personal pages vs pages); does not prove behavior with Facebook DOM changes
- C3-popup (agent-probe): does not prove mode persistence across extension reload; does not prove POSTS_PROGRESS message handling
- C12-regression (agent-probe): does not prove enrichment flow still works; does not prove X.com scraper is unaffected

Gate: CONDITIONAL (Section B FAIL resolved by plan update; all CONCERNs accepted)
Accepted by: session — concerns accepted:
1. Infra fit CONCERN: wrong file target corrected in plan update P2 (api.ts → types.ts)
2. Test coverage CONCERN: zero-test baseline is a known codebase gap; LLM gate clarified to require Ollama running
3. Breaking changes CONCERN: dual content script injection on events pages is benign (content-posts.js message-scoped); permission re-prompt is expected Chrome behavior
4. Security surface CONCERN: PII rejection added to A4 checklist
5. Section A CONCERN: URL normalization best-effort noted; reprocess clarified; LLM prompt note added
6. Section B FAIL converted: B5 corrected to use sendMessage per plan update P1
7. Section C CONCERN: file targets corrected per plan updates P2, P3

## Autonomous Goal Block

SESSION GOAL: Implement Facebook Posts scraper — third extension mode that extracts FB post text and Google Form links, stores via new /events/posts route, and shows in dashboard with google_form_url column
Charter + umbrella plan: N/A — single plan
Autonomy: proceed on all reversible decisions; hard stop on irreversible/outward-facing actions not in this contract
Hard stop conditions / safety constraints:
- Do not run ALTER TABLE against Neon DB without confirming VITE_API_BASE_URL / DATABASE_URL env vars point to the correct Neon instance
- Do not modify any existing function signatures in sanitize.js, dedup.js, or llm.js — additive exports only
- Do not change existing content script match patterns (facebook.com/events/*, x.com/*) — only add new ones
- B5 must use chrome.tabs.sendMessage not chrome.scripting.executeScript
- C1 edit goes to types.ts not api.ts; C2 edit goes to EventsTableFilters.tsx not index.tsx
Next phase: EXECUTE: process/general-plans/active/fb-posts-scraper_19-06-26/fb-posts-scraper_PLAN_19-06-26.md
Validate contract: inline in plan (## Validate Contract section)
Execute start: hybrid: psql $DATABASE_URL -c "\d events" (after A1 migration) | hybrid: curl POST /events/posts | agent-probe: browser extension test | high-risk pack: no
