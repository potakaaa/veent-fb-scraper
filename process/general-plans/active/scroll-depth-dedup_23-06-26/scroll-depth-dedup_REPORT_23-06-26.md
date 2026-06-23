---
phase: scroll-depth-dedup
date: 2026-06-23
status: COMPLETE_WITH_GAPS
feature: ""
plan: process/general-plans/active/scroll-depth-dedup_23-06-26/scroll-depth-dedup_PLAN_23-06-26.md
---

# EXECUTE Report — Scroll Depth + Known-URL Dedup

**TL;DR:** All 10 checklist steps implemented across 3 files. Code is CODE DONE (syntax-clean,
logic-verified). Status is COMPLETE_WITH_GAPS because verification is 100% Agent-Probe (manual
browser/curl) — this repo has zero automated tests, so VERIFIED requires manual steps 1–16 that
need a live server + Chrome + Facebook session (cannot run headless here).

## What Was Done

**File 1 — `server/routes/events-posts.js` (Steps 1–2):**
- Added `GET /known-urls` route before `module.exports`. Extracts `req.query.term`, trims it,
  returns `{urls:[]}` immediately on empty/absent term (no DB query). Otherwise runs a
  parameterized query `SELECT event_url FROM events WHERE source = 'facebook.posts' AND
  source_search_term = $1`, maps rows to a string array, returns `{urls:[...]}`. try/catch →
  `500 {urls:[], error}`. Uses the existing `pool` (line 5) — no new DB connection.

**File 2 — `extension/background/service-worker.js` (Steps 3–5):**
- Added `fetchKnownUrls(searchTerm)` async helper after the `sleep` helper: falsy term → `[]`;
  fetches `/events/posts/known-urls?term=<enc>`; `.then(d => d.urls || [])`; `.catch(() => [])`.
  Always returns an array, never throws.
- `RELAY_EXTRACT_POSTS`: declared the `chrome.tabs.query` callback `async (tabs) =>` (per E1),
  fetched `knownUrls` before messaging the tab, added `knownUrls` to the `EXTRACT_POSTS` message.
- `BATCH_POSTS_SEARCH`: fetched `const knownUrls = await fetchKnownUrls(kw)` per-keyword before
  the `EXTRACT_POSTS` send; passed `knownUrls` in the message. No existing batch logic altered.

**File 3 — `extension/content/content-posts.js` (Steps 6–10):**
- Step 6: tuned all 6 autoScroll constants (MAX_ROUNDS 25→40, MAX_IDLE 3→5, SCROLL_MIN 280→700,
  SCROLL_MAX 520→1100, PAUSE_MIN 600→1200, PAUSE_MAX 1400→2500); added module-level
  `MIN_FRESH_TARGET = 15`.
- Step 7: added `countFreshAnchors(knownSet)` — cheap anchor-only scan, `isPostHref` filter,
  strips query/hash for both raw and `toAbsolute` keys, dedups within scan via a local Set,
  returns `Infinity` when `knownSet` is null.
- Step 8: `autoScroll(knownSet = null)` signature + fresh-count early exit (fires on new-blocks
  OR every 3rd round; `break` when `freshCount >= MIN_FRESH_TARGET`).
- Step 9: `extractPosts(knownSet = null)` signature + knownSet skip check (raw + abs key) placed
  before the existing within-page `seen` check (which is unchanged).
- Step 10: message handler builds `knownSet` from `message.knownUrls` (strip query) or `null`;
  threads `knownSet` into `autoScroll` and `extractPosts` in both branches; returns `true` unchanged.

## What Was Skipped or Deferred

- Nothing in the plan scope was skipped. All 10 steps complete.
- Out-of-scope items (per plan) untouched: re-scroll loop v2, server-side URL normalization in
  client, UI/review-ui changes, schema migrations, automated tests.

## Test Gate Outcomes

All 8 gates (C1–C8) are **Agent-Probe** per the validate-contract (zero Fully-Automated gates —
repo has no test suite). Mode B (advisory) applies. Outcomes recorded:

| Gate | Behavior | Outcome (this session) |
|---|---|---|
| C1 | GET /known-urls returns stored URLs for matching term | Route logic verified; needs live DB+curl (manual step 4) |
| C2 | Empty/absent term → `{urls:[]}` no DB query | **VERIFIED** via node logic repro (absent/blank → `{urls:[]}`, dbQueried:false) |
| C3 | fetchKnownUrls returns [] when server down | Code path verified (`.catch(()=>[])`); needs SW console (manual step 9) |
| C4 | Batch run → 15-20 posts | Constants tuned per spec; needs live browser (manual step 12) |
| C5 | Re-run same keyword → 0 new, duplicates:N | Dedup-key matching verified algebraically; needs live browser (steps 13-14) |
| C6 | Single-collect still works | RELAY_EXTRACT_POSTS backwards-compatible (knownUrls absent → null); needs browser (step 16) |
| C7 | Events scraper (content.js) not broken | content.js untouched; content-posts.js EXTRACT_POSTS-only guard intact; needs browser (step 15) |
| C8 | No JS errors in SW/content console | 3-file syntax sweep clean; needs runtime console (manual) |

**Syntax sweep:** `node --check` passed for all 3 files.
**URL-matching repro:** Cases A (relative+query), B (varying query params), C (synthetic permalink)
all dedup correctly. Case D (path-slug differs) is the documented E4 residual — does NOT match,
exactly as the accepted CONCERN states; manual steps 13-14 cover it.

## Plan Deviations

None material. Two within-blast-radius implementation choices, both plan-sanctioned:
1. Absolute-form key uses `toAbsolute(href)` (Step 7 says "or use existing `toAbsolute` helper if
   present" — it is present; keeps keys consistent with stored URLs).
2. `MIN_FRESH_TARGET` placed at module level (line 15) so both the constants block and `autoScroll`
   can reference it — the only scope satisfying Steps 6 and 8 together. No behavior impact.

## Test Infra Gaps Found

- Repo-wide known gap (pre-existing): zero automated tests. All 8 gates are Agent-Probe.
- `fetchKnownUrls` has no browser dependency → good `node:test` candidate (test: server-down → []).
- `countFreshAnchors` / `extractPosts` knownSet logic → jsdom unit-test candidates.
- Backlog stub (carried from plan): add `node:test` unit test for `fetchKnownUrls` error-handling
  when a test suite is introduced. C3 in the contract is the named D-tier backlog residual.

## Closeout Packet

- **Selected plan path:** process/general-plans/active/scroll-depth-dedup_23-06-26/scroll-depth-dedup_PLAN_23-06-26.md
- **What was finished:** All 10 checklist steps; 3 files edited; syntax-clean; C2 verified;
  URL-matching logic verified for common cases.
- **Verified vs unverified:** C2 verified now. C1/C3/C4/C5/C6/C7/C8 require live server + Chrome +
  Facebook session (manual steps 1–16) — not runnable in this environment.
- **Cleanup/context remaining:** Manual browser verification (steps 1–16); then UPDATE PROCESS
  (archive plan, update context if dedup pattern is worth recording).
- **Single best next state:** **Keep in active/testing** — code-complete but manual verification
  still pending. Do NOT archive until steps 1–16 pass in a live browser.

## Forward Preview

### Test Infra Found
No new test infra. Repo remains test-suite-free; Agent-Probe is the only available tier.

### Blast Radius Changes
3 files changed: `server/routes/events-posts.js` (+1 route), `service-worker.js` (+1 helper, 2
handlers wired), `content-posts.js` (constants + 1 helper + 2 signatures + handler). Shared blast
radius with `batch-keyword-posts` plan honored — BATCH_POSTS_SEARCH handler left intact, only the
knownUrls fetch line added inside its loop.

### Commands to Stay Green
- `node --check server/routes/events-posts.js`
- `node --check extension/background/service-worker.js`
- `node --check extension/content/content-posts.js`
- Manual: `cd server && node server.js` then `curl "http://localhost:7842/events/posts/known-urls?term=test"`

### Dependency Changes
None. No npm packages added. Vanilla JS only. `batch-keyword-posts` plan remains the
prerequisite-already-satisfied dependency (BATCH_POSTS_SEARCH confirmed present).

## Follow-up plan stubs created
None this session (the one backlog item — `node:test` for `fetchKnownUrls` — is already recorded
in the plan's Test Infra Improvement Notes and as contract gate C3 D-tier residual).

## CONTEXT_PARTIAL items
None. All required context (plan, schema source values, mount point, dependency presence) was
available and confirmed.
