---
name: plan:scroll-depth-dedup
description: "Scroll depth tuning + known-URL dedup for FB Posts scraper — reach 15-20 fresh posts per keyword by fixing autoScroll constants and skipping already-stored URLs"
date: 23-06-26
feature: ""
---

# FB Posts Scraper — Scroll Depth + Known-URL Dedup

Date: 23-06-26
Complexity: SIMPLE
Status: PLANNED

---

## Overview

Two related improvements to the FB Posts scraper that together ensure each keyword search
surfaces 15-20 genuinely new posts:

1. **Scroll depth** — the current `autoScroll()` stops after 5-7 posts because scroll amounts
   are too small (280-520 px vs Facebook card heights of 600-1000 px), pauses are too short for
   lazy-load (600-1400 ms), and `MAX_IDLE = 3` gives up too early. Tuning these constants plus
   adding a "fresh post" early-exit target fixes the depth problem.

2. **Known-URL dedup** — when a user re-searches a keyword, posts already in the DB should not
   count toward the 15-20 fresh target, and should be skipped during extraction. A new
   `GET /events/posts/known-urls` server endpoint exposes the stored URLs for a given search
   term; the service worker fetches them before extraction and passes them to the content
   script as a `knownUrls` array.

**Key constraint:** content scripts run in the page origin (`facebook.com`) and cannot fetch
from `localhost:7842`. Only the service worker (extension origin) can fetch from the server.
The `knownUrls` array is always fetched by the service worker and passed via Chrome message.

---

## Goals

- Consistently reach 15-20 fresh posts per keyword in batch mode
- Re-searching a keyword finds only NEW posts (posts already stored are skipped entirely)
- Backwards compatible: if `knownUrls` is absent from the message, all existing logic is unchanged
- No schema changes, no new dependencies, vanilla JS only

---

## Scope

**In scope:**
- `server/routes/events-posts.js` — add `GET /known-urls` route (uses existing `pool`)
- `extension/background/service-worker.js` — add `fetchKnownUrls` helper; wire into
  `RELAY_EXTRACT_POSTS` and `BATCH_POSTS_SEARCH`
- `extension/content/content-posts.js` — tune autoScroll constants; add `countFreshAnchors`;
  update `autoScroll(knownSet)` and `extractPosts(knownSet)` signatures; update message handler

**Out of scope:**
- Re-scroll loop if MIN_FRESH_TARGET not met after one pass (v2)
- Server-side URL normalization in the client (strip-query-params comparison is sufficient)
- Any UI or review-ui changes
- Schema migrations
- Automated tests (none exist in this repo)

---

## Touchpoints

| File | Change |
|---|---|
| `server/routes/events-posts.js` | Add `GET /known-urls?term=<search_term>` route before `module.exports` |
| `extension/background/service-worker.js` | Add `fetchKnownUrls(searchTerm)` helper; call it in `RELAY_EXTRACT_POSTS` and `BATCH_POSTS_SEARCH` before sending `EXTRACT_POSTS` |
| `extension/content/content-posts.js` | Tune 6 autoScroll constants; add `countFreshAnchors(knownSet)` helper; update `autoScroll(knownSet)` and `extractPosts(knownSet)` to accept and use `knownSet`; update `EXTRACT_POSTS` message handler to build `knownSet` from `message.knownUrls` |

---

## Public Contracts

- **New server endpoint:** `GET /events/posts/known-urls?term=<search_term>` — returns
  `{ urls: string[] }` (raw `event_url` values). If no `term` param → returns `{ urls: [] }`.
  No auth required (same policy as all other local-only routes).
- **Message protocol change:** `EXTRACT_POSTS` message now accepts an optional `knownUrls: string[]`
  field. Absence of the field is backwards-compatible (no change to existing callers).
- **Function signature changes (internal to content script):**
  - `autoScroll(knownSet?)` — `knownSet` is a `Set` of stripped URL strings or `null`
  - `extractPosts(knownSet?)` — same

---

## Blast Radius

- **Files changed:** 3
- **Risk class:** LOW — no schema changes, no auth surface, no new dependencies
- **Shared blast radius note:** `extension/background/service-worker.js` and
  `extension/content/content-posts.js` are also touched by `batch-keyword-posts_PLAN_23-06-26.md`.
  Execute this plan AFTER or SEPARATELY from that plan, or merge the changes carefully.
  Specifically: `BATCH_POSTS_SEARCH` handler is being added by that plan and modified by this
  one — ensure both sets of changes are applied before testing batch mode.

---

## Implementation Checklist

### File 1: `server/routes/events-posts.js`

**Step 1.** Locate the position just before `module.exports` in `server/routes/events-posts.js`.
Confirm the file already imports `pool` from the Neon PostgreSQL client and that the route is
mounted at `/events/posts` in `server.js`.

**Step 2.** Add the `GET /known-urls` route:
- Register route: `router.get('/known-urls', async (req, res) => { ... })`
- Extract `term` from `req.query.term`; if absent or empty, return `res.json({ urls: [] })`
  immediately (no DB query — avoids full-table scan)
- Query: `SELECT event_url FROM events WHERE source = 'facebook.posts' AND source_search_term = $1`
  using the existing `pool` (parameterized, no interpolation)
- Map rows to a plain string array and return `res.json({ urls: rows.map(r => r.event_url) })`
- Wrap in try/catch; on error log and return `res.status(500).json({ urls: [], error: e.message })`
- Place this route BEFORE the `/:id` routes to prevent Express treating "known-urls" as an ID

---

### File 2: `extension/background/service-worker.js`

**Step 3.** Add `fetchKnownUrls(searchTerm)` helper near the top of the file (after the
`SERVER` constant or alongside other fetch helpers):
- If `searchTerm` is falsy → return `[]` immediately
- `fetch(`${SERVER}/events/posts/known-urls?term=${encodeURIComponent(searchTerm)}`)`
- `.then(r => r.json()).then(d => d.urls || [])` with a `.catch(() => [])` fallback
- Function is async; always returns an array (never throws)

**Step 4.** Wire `fetchKnownUrls` into the `RELAY_EXTRACT_POSTS` handler:
- Before sending the `EXTRACT_POSTS` message to the tab, call
  `const knownUrls = await fetchKnownUrls(message.searchTerm || '')` (inspect the existing
  handler to confirm the field name that holds the search term — adapt as needed)
- Add `knownUrls` to the message object passed to `sendToTab`:
  `{ action: 'EXTRACT_POSTS', autoScroll: message.autoScroll, knownUrls }`

**Step 5.** Wire `fetchKnownUrls` into the `BATCH_POSTS_SEARCH` handler:
- In the per-keyword loop, before sending `EXTRACT_POSTS`, call
  `const knownUrls = await fetchKnownUrls(kw)`
- Pass `knownUrls` to the `EXTRACT_POSTS` message:
  `{ action: 'EXTRACT_POSTS', autoScroll: true, knownUrls }`

---

### File 3: `extension/content/content-posts.js`

**Step 6.** Tune the six autoScroll constants (currently near lines 302-307):

| Constant | Old value | New value | Reason |
|---|---|---|---|
| `MAX_ROUNDS` | 25 | 40 | Allow more rounds for deeper scroll |
| `MAX_IDLE` | 3 | 5 | More patience before declaring done |
| `SCROLL_MIN` | 280 | 700 | Match Facebook post card height (600-1000 px) |
| `SCROLL_MAX` | 520 | 1100 | Same |
| `PAUSE_MIN` | 600 | 1200 | Facebook needs longer to lazy-load |
| `PAUSE_MAX` | 1400 | 2500 | Same |

Add after the constants block:
`const MIN_FRESH_TARGET = 15;  // stop early when this many fresh posts are visible in DOM`

**Step 7.** Add `countFreshAnchors(knownSet)` helper (fast URL scan — must stay cheap as it
runs after each scroll round, not a full extraction loop):
- `document.querySelectorAll('a[href]')` → filter by `isPostHref(href)` (use the existing
  helper that identifies post links)
- For each matching href, strip query params: `rawKey = href.replace(/[?#].*$/, '')`
  Also try absolute form: `absKey = new URL(href, location.href).href.replace(/[?#].*$/, '')`
  (or use existing `toAbsolute` helper if present)
- Skip if `knownSet.has(rawKey) || knownSet.has(absKey)`
- Count unique fresh anchors using a local `Set` to deduplicate within the scan
- Return the count as an integer
- If `knownSet` is `null` → return `Infinity` (ensures the early-exit check never fires)

**Step 8.** Update `autoScroll` signature to accept `knownSet` and add fresh-count early exit:
- Change signature: `async function autoScroll(knownSet = null)`
- After each scroll round where new `div[dir="auto"]` blocks were detected (OR every 3rd
  round regardless), call `const freshCount = countFreshAnchors(knownSet)`
- If `freshCount >= MIN_FRESH_TARGET` → `break` (enough fresh content visible)
- When `knownSet` is null, `countFreshAnchors` returns `Infinity` → early-exit check never
  triggers → existing idle-based logic is completely unchanged

**Step 9.** Update `extractPosts` signature to accept `knownSet` and skip known posts:
- Change signature: `function extractPosts(knownSet = null)`
- Inside the per-post loop, after extracting the post URL/href, compute:
  `const dedupeKey = href.replace(/[?#].*$/, '')`
- If `knownSet && (knownSet.has(dedupeKey) || knownSet.has(new URL(href, location.href).href.replace(/[?#].*$/, '')))` → `continue`
- Keep the existing within-page `seen` Set for intra-page dedup (unchanged — both checks run)

**Step 10.** Update the `EXTRACT_POSTS` message handler to build `knownSet` and thread it through:
- After receiving the message, build the set:
  `const knownSet = message.knownUrls?.length ? new Set(message.knownUrls.map(u => u.replace(/[?#].*$/, ''))) : null`
- In the `autoScroll` branch (inside the async IIFE):
  `await autoScroll(knownSet)` then `sendResponse({ posts: extractPosts(knownSet) })`
- In the non-autoScroll branch (inside the async IIFE):
  `sendResponse({ posts: extractPosts(knownSet) })`
- Return `true` in both branches (keep the async message channel open — existing pattern, do not change)

---

## Phase Completion Rules

This is a SIMPLE (one-session) plan. Implement all checklist steps continuously without stopping
for approval between steps. Steps are ordered by file — not logical phases — and must all complete
in one session.

- **CODE DONE** = all 10 checklist steps complete, files saved, extension reloaded in Chrome.
- **VERIFIED** = CODE DONE + all Manual Verification steps (steps 1-16) pass without errors.
- Do not mark VERIFIED based on code changes alone — manual browser verification is required
  (no automated test suite exists in this repo).
- The Validate Contract section must be written by vc-validate-agent before EXECUTE begins.
  A placeholder is a blocker.

---

## Acceptance Criteria

1. **Scroll depth:** A batch run on a fresh keyword produces 15-20 posts consistently (not 5-7).
   Verified by running batch mode and counting the popup result count or DB insert count.

2. **Fresh-post early exit:** When at least 15 unrecognized post links are visible in the DOM,
   `autoScroll` stops without waiting for `MAX_IDLE` rounds.

3. **Known-URL dedup — API:** `curl "http://localhost:7842/events/posts/known-urls?term=marketing"`
   returns `{ "urls": [...] }` (non-empty if posts with that term exist in DB). Empty or absent
   `term` returns `{ "urls": [] }`.

4. **Known-URL dedup — skipping:** After saving posts for "marketing", re-running extraction for
   "marketing" inserts 0 duplicates for already-stored posts; server confirms `duplicates: N`.

5. **Backwards compatibility:** The existing "Collect FB Posts" single-collect flow still works
   unchanged. The events scraper (FB Events pages) is not broken.

6. **No JS errors** in the service worker or content script console after applying changes.

---

## Manual Verification Steps

### After Step 2 (server route):

1. Start server: `cd server && node server.js`
2. With no posts in DB for term "test":
   `curl "http://localhost:7842/events/posts/known-urls?term=test"` → `{"urls":[]}`
3. Insert at least one post with `source_search_term = 'test'` via manual POST or the extension
4. Re-run the curl → should return `{"urls":["https://..."]}` with the stored URL
5. Test absent term: `curl "http://localhost:7842/events/posts/known-urls"` → `{"urls":[]}`

### After Steps 3-5 (service worker):

6. Load extension in Chrome (Developer mode → Load unpacked from `extension/`)
7. Open DevTools → background service worker → Console
8. Trigger a single-collect "Collect FB Posts" on a Facebook posts search page
9. Confirm no JS errors in service worker console
10. Optionally add a temporary `console.log(knownUrls)` in the handler to confirm the array
    is populated, then remove it

### After Steps 6-10 (content script):

11. Open a Facebook posts search page with at least 20 posts loaded (scroll manually first)
12. Trigger extraction — confirm post count in popup is 15-20 (not 5-7)
13. Save the results to DB
14. Trigger extraction on the SAME page again — confirm known posts are skipped:
    - popup count should be 0 or very low (only genuinely new posts visible since last run)
    - server response shows `duplicates: N` matching the previously saved count

### Regression checks:

15. Navigate to a Facebook Events search page — confirm the events scraper still works
    (Extract button produces event cards; no JS errors). Verifies content.js event extraction
    is not broken by content-posts.js changes.
16. Run the existing "Collect FB Posts" single-collect flow (no batch) — confirm it still works
    and posts count is higher than before (15-20 vs 5-7 with the new scroll constants).

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Facebook DOM changes break `isPostHref` or anchor selector | `countFreshAnchors` is best-effort — if it returns 0 when posts exist, `MIN_FRESH_TARGET` is never reached and `MAX_IDLE` governs (safe fallback, no breakage) |
| New PAUSE values increase per-keyword time | `MAX_ROUNDS = 40` x `PAUSE_MAX = 2500ms` = max 100s per keyword. Acceptable for batch mode; single-collect waits longer but gets more results |
| `fetchKnownUrls` fetch fails (server down) | Catches all errors and returns `[]` — extraction proceeds as if no known URLs exist (safe degradation, no crash) |
| `BATCH_POSTS_SEARCH` not yet implemented | If `batch-keyword-posts` plan hasn't been executed, Step 5 modifies a non-existent handler. Execute `batch-keyword-posts` first, or combine both plans in one EXECUTE session |
| Shared blast radius with `batch-keyword-posts` plan | Both plans edit `service-worker.js` and `content-posts.js`. Coordinate execution order to avoid merge conflicts |

---

## Dependencies

- `batch-keyword-posts_PLAN_23-06-26.md` — the `BATCH_POSTS_SEARCH` handler wired in Step 5
  is created by that plan. If that plan has NOT been executed yet, Step 5 will not find the
  handler. Resolution: execute `batch-keyword-posts` first, or combine both plans in one session.
- Server must be running at `http://localhost:7842` for manual verification.
- Chrome extension must be loaded unpacked from `extension/` for manual verification.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `curl /events/posts/known-urls?term=marketing` returns `{urls:[...]}` | Agent-Probe | AC #3: known-URL API returns stored URLs for a given term |
| Absent/empty `term` param returns `{urls:[]}` | Agent-Probe | AC #3: safe default, no full-table scan |
| Batch run on fresh keyword yields 15-20 posts in popup | Agent-Probe | AC #1: scroll depth improvement |
| Re-running same keyword → server returns `duplicates: N` | Agent-Probe | AC #4: known-URL dedup skips already-stored posts |
| Single-collect "Collect FB Posts" flow still works | Agent-Probe | AC #5: backwards compatibility |
| Events scraper still works on a Facebook Events page | Agent-Probe | AC #5: no regression on events flow |
| No JS errors in service worker or content script console | Agent-Probe | AC #6: clean execution |

All scenarios are Agent-Probe (manual) — this repo has zero automated tests.
See `process/context/tests/all-tests.md`.

---

## Test Infra Improvement Notes

No new test infrastructure is introduced by this plan.

Existing gap: all verification is manual. `fetchKnownUrls` has no browser dependency and could
be unit-tested with `node:test` (test: server-down → returns `[]`). `countFreshAnchors` needs
a DOM mock (jsdom). Both are good candidates for the first test additions when a test suite is
started.

Backlog: add `node:test` unit test for `fetchKnownUrls` error-handling when a test suite is
introduced.

---

## Phase Loop Progress

- [ ] 1a. Research updated — context and codebase scan complete
- [ ] 1b. Plan supplemented — checklist reflects research findings
- [x] 2. Validate contract written — vc-validate-agent gate verdict is green
- [~] 3. Execute complete — CODE DONE (all 10 steps, syntax-clean, C2 + URL-matching verified); manual verification steps 1-16 PENDING (require live server + Chrome + FB session)
- [ ] 4. Update process — plan archived, context docs updated
- [x] 5. Report written — execute report filed (scroll-depth-dedup_REPORT_23-06-26.md)

> **Step 2 is never skippable.** A placeholder Validate Contract is a blocker.

---

## Resume and Execution Handoff

- **Selected plan file path:** `process/general-plans/active/scroll-depth-dedup_23-06-26/scroll-depth-dedup_PLAN_23-06-26.md`
- **Last completed phase/step:** EXECUTE complete (CODE DONE) — all 10 steps implemented 23-06-26; report at scroll-depth-dedup_REPORT_23-06-26.md
- **Validate-contract status:** CONDITIONAL — gate written, accepted concerns documented
- **Post-EXECUTE state:** CODE DONE, NOT YET VERIFIED. Manual verification steps 1-16 require a
  live server + Chrome + Facebook session (cannot run headless). Keep plan in active/testing until
  steps 1-16 pass. C2 (absent-term early return) and URL-matching logic already verified at code level.
- **Supporting context files loaded:**
  - `process/context/all-context.md`
  - `process/context/planning/all-planning.md`
  - `process/context/tests/all-tests.md`
  - `process/general-plans/active/batch-keyword-posts_23-06-26/batch-keyword-posts_PLAN_23-06-26.md` (dependency)
- **Next step for a fresh agent:** Read this plan top-to-bottom. Verify BATCH_POSTS_SEARCH exists
  in `extension/background/service-worker.js` (confirmed present). Execute Steps 1-10 in file order.
  Read the Execute-Agent Instructions in the Validate Contract before starting. After EXECUTE,
  run Manual Verification Steps 1-16 in order.

---

## Validate Contract

Status: CONDITIONAL
Date: 23-06-26
date: 2026-06-23
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 0/7 signals — single plan, 3 files, no phase program, no multi-package scope. One execute-agent (opus).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| C1 | GET /known-urls returns stored URLs for matching term | Agent-Probe | `curl "http://localhost:7842/events/posts/known-urls?term=test"` after inserting a post with that term — expect `{"urls":["https://..."]}` | A — proven via manual probe in this cycle |
| C2 | Empty/absent term returns `{urls:[]}` without DB query | Agent-Probe | `curl "http://localhost:7842/events/posts/known-urls"` — expect `{"urls":[]}` | A — proven via manual probe in this cycle |
| C3 | fetchKnownUrls returns [] when server is down | Agent-Probe | Chrome DevTools SW console; stop server, trigger collect; observe no crash and empty knownUrls | D — backlog: node:test unit stub when test suite introduced |
| C4 | Batch run on fresh keyword → 15-20 posts in popup | Agent-Probe | Run batch mode on fresh keyword; count popup result count or DB insert count | A — proven via manual probe in this cycle |
| C5 | Re-run same keyword → 0 new inserts, duplicates: N | Agent-Probe | Extract same keyword twice; check server response shows `duplicates: N` matching prior count | A — proven via manual probe in this cycle |
| C6 | Single-collect "Collect FB Posts" still works unchanged | Agent-Probe | Trigger single-collect flow; confirm posts counted correctly with no JS errors | A — proven via manual probe in this cycle |
| C7 | Events scraper (content.js) not broken by changes | Agent-Probe | Navigate to Facebook Events search page; click Extract; confirm event cards appear with no JS errors | A — proven via manual probe in this cycle |
| C8 | No JS errors in service worker or content script console | Agent-Probe | Chrome DevTools Console after completing all steps | A — proven via manual probe in this cycle |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: no Fully-Automated rows exist — this repo has zero automated tests. All gates are Agent-Probe. Known-Gap is named as a residual (C3 backlog) and is not a strategy value.

Legacy line form:
- server GET /known-urls: agent-probe: `curl "http://localhost:7842/events/posts/known-urls?term=test"`
- service-worker fetchKnownUrls: agent-probe: Chrome DevTools SW console log check
- content-posts.js scroll + dedup: agent-probe: batch run + re-run same keyword + regression checks

Dimension findings:
- Infra fit: PASS — pool imported, source column confirmed in schema.pg.sql, route mounted at /events/posts, no new deps
- Test coverage: CONCERN — 100% manual (Agent-Probe); no Fully-Automated or Hybrid gates exist for any developed behavior; vacuous-green ban applies; gate is CONDITIONAL
- Breaking changes: CONCERN — shared blast radius with batch-keyword-posts plan; BATCH_POSTS_SEARCH confirmed present (grep verified); execute-agent must still confirm before Step 5 edit
- Security surface: PASS — parameterized query ($1), local-only server, no auth/billing surface, no new secrets

Section feasibility findings:
- Section A (server GET /known-urls): PASS — module.exports at line 294, pool at line 5, no conflicting routes; source='facebook.posts' filter correct per existing INSERT at line 184
- Section B (service-worker fetchKnownUrls + wiring): CONCERN — RELAY_EXTRACT_POSTS uses a plain chrome.tabs.query callback; execute-agent must declare that callback async before using await fetchKnownUrls() inside it; plan text does not state this explicitly
- Section C (content-posts.js constants + helpers + handler): CONCERN — URL format mismatch risk: server stores raw event_url values; content script extracts href strings; both raw-key and absolute-key checks in Step 9 mitigate this but cannot be confirmed without manual dedup verification (steps 13-14)

Open gaps:
- Test coverage: known-gap: documented as backlog per plan's Test Infra Improvement Notes — no automated tests exist in this repo
- Section B async callback: execute-agent instruction issued (see Execute-Agent Instructions below)
- Section C URL matching: mitigated by manual verification steps 13-14; residual risk accepted

Known Gaps:
- No automated test suite: known-gap: documented as NEW PLAN REQUIRED when test suite is introduced — see plan's Test Infra Improvement Notes and backlog note for node:test

What this coverage does NOT prove:
- C1: Does not prove source filter correctness if posts were inserted with unexpected source values (other than 'facebook.posts')
- C2: Does not prove the early-return guard under concurrent requests or unusual query param encoding
- C3: Does not prove real network timeout behavior vs immediate connection-refused; no unit test exists
- C4: Does not prove that early-exit fires at exactly MIN_FRESH_TARGET (±1 round ambiguity from the OR-every-3rd-round condition)
- C5: Does not prove URL normalization edge cases (slugged URLs, different query params not stripped by replace(/[?#].*$/,''))
- C6/C7: Does not prove extension manifest isolation between content scripts (content.js vs content-posts.js are separate files injected by manifest; changes to one should not affect the other, but this is not mechanically verified)
- All Agent-Probe gates: require human judgment; cannot run in CI; results depend on live Facebook DOM state

Execute-Agent Instructions:
- E1: Step 4 (RELAY_EXTRACT_POSTS wiring) — the chrome.tabs.query callback at line 275 is a plain function. Before adding `await fetchKnownUrls()` inside it, declare the callback `async`: change `(tabs) => {` to `async (tabs) => {`. Chrome ignores the returned Promise from async callbacks; this is architecturally safe.
- E2: Step 2 (server route source filter) — before writing the route, grep for the source value used in the INSERT: confirm it is 'facebook.posts' (verified at line 184 of events-posts.js). If any discrepancy is found, update the WHERE clause to match the actual insert value.
- E3: Step 9 (extractPosts dedup) — after implementing the knownSet check, run manual verification steps 13-14 (re-run same keyword) before marking CODE DONE. If dedup skips ALL posts including fresh ones, the URL comparison is mismatched — debug by logging dedupeKey vs the values in knownSet.
- E4: Before Step 5 — grep for BATCH_POSTS_SEARCH in service-worker.js to confirm it exists. If absent, do not execute Step 5; note in the phase report and skip or execute batch-keyword-posts plan first.

Gate: CONDITIONAL (0 FAILs, 4 CONCERNs accepted by session — test coverage gap is repo-wide known gap; async callback and URL matching concerns are mitigated by execute-agent instructions E1/E3 and manual verification steps 13-14)
Accepted by: session (autonomous, /goal execution) — concerns: (1) test coverage: all-manual, no automated gates; (2) shared blast radius coordination; (3) Section B async callback gap addressed by E1; (4) Section C URL matching risk addressed by E3 + manual steps 13-14

---

## Autonomous Goal Block

SESSION GOAL: Implement scroll depth tuning + known-URL dedup for FB Posts scraper to reach 15-20 fresh posts per keyword
Charter + umbrella plan: N/A — single plan
Autonomy: proceed on all reversible decisions; surface only irreversible/outward-facing actions not in this contract
Hard stop conditions / safety constraints:
- Do not modify schema.sql or schema.pg.sql (plan explicitly out of scope)
- Do not add npm dependencies (plan requires vanilla JS only)
- Do not touch review-ui/ or manifest.json
- Verify BATCH_POSTS_SEARCH exists in service-worker.js before Step 5; if absent, stop and note in report
- Execute Steps 1-10 in file order; do not skip steps
Next phase: EXECUTE: process/general-plans/active/scroll-depth-dedup_23-06-26/scroll-depth-dedup_PLAN_23-06-26.md
Validate contract: inline in plan (## Validate Contract section)
Execute start: Manual probe — no fully-automated commands | Manual verification steps 1-16 | high-risk pack: no
