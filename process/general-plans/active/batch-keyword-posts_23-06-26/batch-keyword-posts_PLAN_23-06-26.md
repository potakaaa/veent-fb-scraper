---
name: plan:batch-keyword-posts
description: "Batch keyword search for FB Posts — auto-open, filter, scroll, extract, and save per keyword from one popup action"
date: 23-06-26
feature: ""
---

# Batch Keyword Search for FB Posts

Date: 23-06-26
Complexity: SIMPLE
Status: PLANNED

---

## Overview

Users currently must manually navigate to each Facebook search URL, click the "Recent posts" filter, scroll, and then collect. This plan adds a batch mode to the Posts popup that accepts comma-separated keywords and automates the full loop per keyword inside the service worker.

### In Scope

- UI: textarea for comma-separated keywords + "Run Batch" button, visible only in Posts mode
- Progress display in popup: "Keyword 2/5: marketing…"
- Service worker: `BATCH_POSTS_SEARCH` handler — one tab, looped per keyword: navigate → wait → click recent filter → extract with autoScroll → POST to server → report progress
- Content script: new `CLICK_RECENT_FILTER` action that finds and clicks Facebook's "Recent posts" sort button (locale-aware, fail-safe)

### Out of Scope

- Parallel tab processing (deliberate: reuse one tab to reduce noise)
- Server-side changes (none required)
- DB schema changes (none required)
- The existing single-keyword "Collect FB Posts" flow (unchanged)
- Automated test suite (none exists in this repo — manual verification only)

---

## Acceptance Criteria

1. In Posts mode, a textarea and "Run Batch" button appear below the existing collect button; they are hidden in Events and X modes.
2. Clicking "Run Batch" with an empty textarea shows an inline error and does not send any message.
3. A valid comma-separated keyword list triggers the batch: one FB search tab opens and is reused for every keyword (only 1 new tab appears in Chrome).
4. For each keyword the service worker navigates to `https://www.facebook.com/search/posts?q=<keyword>`, waits for load, attempts to click the "Recent posts" filter, auto-scrolls, extracts posts, and POSTs them to `POST /events/posts` tagged with that keyword.
5. If the "Recent posts" filter button is absent, the batch continues without error.
6. The popup status line shows per-keyword progress ("Keyword 2/5: marketing…") during the run.
7. After all keywords complete, the popup shows a final "Batch done!" summary with total inserted and duplicate counts, and the Run Batch button re-enables.
8. The existing "Collect FB Posts" single-collect flow continues to work unchanged after these additions.

---

## Touchpoints

| File | Change summary |
|---|---|
| `extension/popup/popup.html` | Add `<textarea id="batchKeywords">` + `<button id="batchRunBtn">Run Batch</button>` inside a `#batchSection` div shown only when Posts mode is active |
| `extension/popup/popup.js` | Show/hide `#batchSection` on mode change; wire `#batchRunBtn` click → `BATCH_POSTS_SEARCH` message; handle `BATCH_POSTS_PROGRESS` messages for per-keyword status display |
| `extension/background/service-worker.js` | Add `BATCH_POSTS_SEARCH` message handler; inner loop per keyword: update/create tab URL, waitForTabComplete + sleep(RENDER_DELAY), sendToTab CLICK_RECENT_FILTER, sendToTab EXTRACT_POSTS with autoScroll:true, POST results, broadcast BATCH_POSTS_PROGRESS |
| `extension/content/content-posts.js` | Add `CLICK_RECENT_FILTER` message handler: try multiple selectors/text matches to find and humanClick the "Recent posts" button; log warn and resolve if not found |

No changes to: `server/`, `review-ui/`, `manifest.json`, `popup.css` (unless minor styling is needed for the textarea — acceptable inline style is fine).

---

## Public Contracts

No new public API surface. Internal message protocol additions:

| Message | Direction | Shape |
|---|---|---|
| `BATCH_POSTS_SEARCH` | popup.js → service-worker.js | `{ action, keywords: string[] }` |
| `BATCH_POSTS_PROGRESS` | service-worker.js → popup.js (broadcast) | `{ action, keyword, keywordIndex, total, done: false, inserted, duplicates }` (per-keyword) or `{ action, done: true, totalInserted, totalDuplicates, totalKeywords }` (final) |
| `CLICK_RECENT_FILTER` | service-worker.js → content-posts.js | `{ action }` |
| `CLICK_RECENT_FILTER` response | content-posts.js → service-worker.js | `{ clicked: boolean }` |

Existing messages (`RELAY_EXTRACT_POSTS`, `POSTS_PROGRESS`, `CHECK_TAB_POSTS`, `EXTRACT_POSTS`) are unchanged.

---

## Blast Radius

- **Files changed:** 4 (all inside `extension/`)
- **Server:** none
- **Database:** none
- **Risk class:** low — extension-only, additive changes only, existing flows untouched
- **Regression surface:** existing Posts "Collect" button flow (same content script); existing Facebook Events flow (guard `isEventsPage()` already blocks cross-collision)

---

## Implementation Checklist

### Step 1 — popup.html: add batch UI section

1. After the existing `<div class="section">` that contains `#extractBtn`, add a new `<div id="batchSection" class="section" style="display:none">` containing:
   - A `<label for="batchKeywords">Keywords (comma-separated)</label>`
   - A `<textarea id="batchKeywords" rows="3" placeholder="e.g. marketing, startup, tech meetup"></textarea>`
   - A `<button id="batchRunBtn" class="primary">Run Batch</button>`
2. The div is hidden by default (`display:none`) and toggled by popup.js when Posts mode is active.

### Step 2 — popup.js: show/hide batch section + wire button

3. At the top of popup.js, add: `const batchSection = document.getElementById('batchSection');` and `const batchRunBtn = document.getElementById('batchRunBtn');` and `const batchKeywordsEl = document.getElementById('batchKeywords');`
4. In `updateExtractLabel()`, after setting the extract button label, add: `if (batchSection) batchSection.style.display = (mode === 'posts') ? '' : 'none';` — this shows the batch section only in Posts mode.
5. Add a `BATCH_POSTS_PROGRESS` branch in the existing `chrome.runtime.onMessage.addListener` handler (alongside `POSTS_PROGRESS`, `X_PROGRESS`, etc.):
   - If `msg.done === false`: `setStatus('Keyword ' + (msg.keywordIndex + 1) + '/' + msg.total + ': ' + msg.keyword + '…', 'loading')`
   - If `msg.done === true`: build summary string (`Batch done! N inserted, N duplicates across N keywords.`) and call `setStatus(summary, 'success')`, then `batchRunBtn.disabled = false`
6. Add `batchRunBtn.addEventListener('click', () => { ... })` after the DOMContentLoaded block:
   - Read `batchKeywordsEl.value`, split on commas, trim, filter empty → `keywords` array
   - If `keywords.length === 0`: `setStatus('Enter at least one keyword.', 'error'); return;`
   - `batchRunBtn.disabled = true`
   - `setStatus('Starting batch for ' + keywords.length + ' keyword(s)…', 'loading')`
   - `chrome.runtime.sendMessage({ action: 'BATCH_POSTS_SEARCH', keywords }, (resp) => { if (chrome.runtime.lastError || resp?.error) { setStatus('Batch failed: ' + (resp?.error || chrome.runtime.lastError?.message), 'error'); batchRunBtn.disabled = false; } })`

### Step 3 — content-posts.js: add CLICK_RECENT_FILTER handler

7. In the `chrome.runtime.onMessage.addListener` handler in content-posts.js, add a new branch after (or alongside) the `EXTRACT_POSTS` branch:
   - `if (message.action === 'CLICK_RECENT_FILTER') { sendResponse({ clicked: clickRecentFilter() }); return false; }`
8. Add the `clickRecentFilter()` helper function above the message handler:
   - Try selectors in priority order:
     1. `document.querySelector('[aria-label="Recent posts"], [aria-label="Recente berichten"]')`
     2. `[...document.querySelectorAll('div[role="tab"], span[role="button"]')].find(el => /recent/i.test(el.innerText) || /recente/i.test(el.innerText))`
     3. `[...document.querySelectorAll('span, div')].find(el => /^(recent posts|recente berichten)$/i.test((el.innerText || '').trim()))`
   - If a match is found: call `humanClick(el)`, log `[content-posts] CLICK_RECENT_FILTER: clicked`, return `true`
   - If no match: log `[content-posts] CLICK_RECENT_FILTER: not found — continuing`, return `false`
   - `humanClick` is already defined in content-posts.js — reuse it directly, no re-declaration

### Step 4 — service-worker.js: add BATCH_POSTS_SEARCH handler

9. Above the closing `});` of the existing `chrome.runtime.onMessage.addListener` block (currently at line 329), add the `BATCH_POSTS_SEARCH` handler. Must `return true` (async). Logic:
   - Capture `message.keywords` (array, already validated in popup.js)
   - Declare `let batchTab = null`, `let totalInserted = 0, totalDuplicates = 0`
   - `sendResponse({ started: true })` immediately to release popup's message channel
   - Enter async IIFE (pattern: `(async () => { ... })()`):
     - For each keyword `kw` at index `i`:
       - Build `url = 'https://www.facebook.com/search/posts?q=' + encodeURIComponent(kw)`
       - If `!batchTab`: `batchTab = await chrome.tabs.create({ url, active: false })`; else `await chrome.tabs.update(batchTab.id, { url })`
       - `await waitForTabComplete(batchTab.id)`
       - `await sleep(RENDER_DELAY)`
       - `await sendToTab(batchTab.id, { action: 'CLICK_RECENT_FILTER' })` (result ignored — fail-safe)
       - `await sleep(800)` (allow FB to re-sort after filter click)
       - `const resp = await sendToTab(batchTab.id, { action: 'EXTRACT_POSTS', autoScroll: true })`
       - `const posts = resp?.posts || []`
       - Chunk-POST to `${SERVER}/events/posts` in batches of `POSTS_BATCH`, tagging each post with `search_term: kw`; accumulate `inserted`, `duplicates`
       - `totalInserted += inserted; totalDuplicates += duplicates`
       - Broadcast: `chrome.runtime.sendMessage({ action: 'BATCH_POSTS_PROGRESS', keyword: kw, keywordIndex: i, total: keywords.length, done: false, inserted, duplicates }).catch(() => {})`
     - After loop: `if (batchTab) chrome.tabs.remove(batchTab.id).catch(() => {})`
     - Broadcast final: `chrome.runtime.sendMessage({ action: 'BATCH_POSTS_PROGRESS', done: true, totalInserted, totalDuplicates, totalKeywords: keywords.length }).catch(() => {})`

10. The `sendToTab` utility (lines 27-35 in service-worker.js) already handles retries — use it as-is for both `CLICK_RECENT_FILTER` and `EXTRACT_POSTS` messages.

---

## Key Constraints (must not violate)

- **Vanilla JS only.** No TypeScript, no frameworks, no build step.
- **No `chrome.scripting.executeScript`.** Content scripts are injected via manifest; message them with `chrome.tabs.sendMessage` via the existing `sendToTab` helper.
- **Reuse one tab across keywords.** Use `chrome.tabs.update(tabId, { url })` for keywords 2+.
- **Fail-safe filter click.** If `CLICK_RECENT_FILTER` finds no button, log and continue. Never abort the batch.
- **Chunked POST using existing `POSTS_BATCH = 50` constant.** Do not add a new constant.
- **`waitForTabComplete` + `sleep(RENDER_DELAY)` pattern** already defined in service-worker.js — reuse as-is.
- **`humanClick` already defined in content-posts.js** — `clickRecentFilter()` must reference it directly.
- **`return true`** at the end of the `BATCH_POSTS_SEARCH` handler block (MV3 async message requirement).
- **`sendResponse({ started: true })`** is called immediately; progress arrives via broadcasts.

---

## Phase Completion Rules

This is a SIMPLE (one-session) plan. Implement all checklist steps continuously without stopping for approval between steps. Phases below are logical groupings only — not stop points.

- **CODE DONE** = all 10 checklist steps complete, files saved, extension reloaded in Chrome.
- **VERIFIED** = CODE DONE + all Manual Verification steps (steps 1–17) pass without errors.
- Do not mark VERIFIED based on code changes alone — manual browser verification is required (no automated test suite exists).
- The Validate Contract section must be written by vc-validate-agent before EXECUTE begins. A placeholder is a blocker.

### Phase Loop Progress

- [x] 1a. Research updated — context and codebase scan complete
- [x] 1b. Plan supplemented — checklist reflects research findings
- [x] 2. Validate contract written — vc-validate-agent gate verdict is green
- [~] 3. Execute complete — CODE DONE (all 10 checklist items implemented, `node --check` passes on 3 JS files); manual verification steps 1–17 pending (Agent-Probe, requires live browser)
- [ ] 4. Update process — plan archived, context docs updated

> Step 2 is never skippable. Do not proceed to step 3 with a placeholder Validate Contract.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Batch section hidden in Events and X modes | Agent-Probe — switch modes in popup, inspect DOM | AC #1: batch controls only in Posts mode |
| Batch section visible in Posts mode | Agent-Probe — switch to Posts mode, confirm textarea + button appear | AC #1 |
| Empty textarea shows error, no message sent | Agent-Probe — click Run Batch with empty textarea | AC #2: input validation |
| Single keyword: FB search tab opens, filter attempted, posts extracted + saved | Agent-Probe — run 1-keyword batch, check `GET /events/posts` or review UI | AC #3 + #4: core automation loop |
| Multi-keyword batch: 3 keywords, only 1 new tab in Chrome | Agent-Probe — run 3-keyword batch, observe Chrome tab bar | AC #3: tab reuse |
| Filter absent: batch continues without error | Agent-Probe — use a FB page with no Recent filter button | AC #5: fail-safe |
| Per-keyword progress updates in popup status | Agent-Probe — watch status line during 2-keyword batch | AC #6: BATCH_POSTS_PROGRESS messages |
| Final "Batch done!" summary with correct counts | Agent-Probe — confirm popup shows totals after last keyword | AC #7: final broadcast |
| Existing "Collect FB Posts" button works after batch additions | Agent-Probe — single-collect flow on a manual FB page | AC #8: no regression |

---

## Test Infra Improvement Notes

No automated tests exist in this repo. All verification is manual (Agent-Probe). Future test improvement:

- A jsdom/Playwright test for `clickRecentFilter()` would be the highest-value addition — verifies selector fallback logic without a live FB page.
- The `BATCH_POSTS_SEARCH` loop logic could be unit-tested by extracting it into a named async function and mocking `chrome.tabs`, `sendToTab`, and `fetch`.

(none blocking this plan)

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/batch-keyword-posts_23-06-26/batch-keyword-posts_PLAN_23-06-26.md`
2. **Last completed phase:** PLAN (this document)
3. **Validate-contract status:** pending — vc-validate-agent writes this section before EXECUTE
4. **Supporting context files loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`, `process/context/planning/all-planning.md`
5. **Next step for a fresh agent picking up mid-execution:**
   - Read this plan in full.
   - Read `extension/background/service-worker.js` lines 1–50 (constants + helpers) and lines 251–329 (existing `RELAY_EXTRACT_POSTS` and `CHECK_TAB_POSTS` patterns — the new `BATCH_POSTS_SEARCH` handler goes just before the closing `});`).
   - Read `extension/content/content-posts.js` lines 251–373 (`humanClick`, `sleep`, and the message handler at bottom).
   - Read `extension/popup/popup.html` and `extension/popup/popup.js` in full (both are short).
   - Follow the Implementation Checklist steps 1–10 in file order: popup.html (steps 1–2) → popup.js (steps 3–6) → content-posts.js (steps 7–8) → service-worker.js (steps 9–10).
   - Run Manual Verification steps 1–17 after all files are saved and extension is reloaded.

---

## Manual Verification Steps

### After popup.html + popup.js changes (steps 1–6)

1. Load unpacked extension in Chrome (Developer mode → Load unpacked → `extension/`).
2. Click the extension icon to open popup.
3. Confirm batch section is hidden in Facebook Events mode and X mode.
4. Switch to Facebook Posts mode — confirm textarea and "Run Batch" button appear.
5. Click "Run Batch" with empty textarea — confirm error: "Enter at least one keyword."

### After content-posts.js changes (steps 7–8)

6. Open a Facebook search posts page (e.g. `https://www.facebook.com/search/posts?q=test`).
7. Open DevTools console on that tab.
8. From that console: `chrome.runtime.sendMessage({action:'CLICK_RECENT_FILTER'}, r => console.log(r))` — confirm `{clicked: true}` or `{clicked: false}` (no error thrown).

### After service-worker.js changes (steps 9–10)

9. Start the server: `cd server && node server.js`.
10. Open popup, switch to Posts mode, enter 2–3 keywords separated by commas.
11. Click "Run Batch".
12. Observe: popup status updates per keyword ("Keyword 1/3: …", "Keyword 2/3: …").
13. Observe: only ONE new tab opens in Chrome (reused for subsequent keywords).
14. After completion: popup shows "Batch done!" summary with inserted/duplicate counts.
15. Open `http://localhost:7842` — confirm rows tagged with each keyword appear in the review table.
16. Run the existing "Collect FB Posts" single-collect flow on a manual Facebook page — confirm it still works.
17. Confirm extension console has no uncaught errors during the batch run.

---

## Validate Contract

Status: CONDITIONAL
Date: 23-06-26
date: 2026-06-23
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 0/7 signals — single extension, no cross-package coordination needed. 1 agent.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| C1 | Batch section hidden in Events/X modes | Agent-Probe | Manual step 3: load extension, switch to Events/X mode, confirm #batchSection display:none | A |
| C2 | Batch section visible in Posts mode | Agent-Probe | Manual step 4: switch to Posts mode, confirm textarea + Run Batch button appear | A |
| C3 | Empty textarea shows error, no message sent | Agent-Probe | Manual step 5: click Run Batch with empty textarea, confirm error status | A |
| C4 | CLICK_RECENT_FILTER round-trip response | Agent-Probe | Manual step 8: DevTools console `chrome.runtime.sendMessage({action:'CLICK_RECENT_FILTER'}, r => console.log(r))` — confirm {clicked:true} or {clicked:false} | A |
| C5 | Core batch loop: 1 keyword navigates, extracts, saves | Agent-Probe | Manual steps 9-15: run 1-keyword batch, confirm rows in review UI tagged with keyword | A |
| C6 | Tab reuse: 3 keywords, only 1 new tab | Agent-Probe | Manual step 13: run 3-keyword batch, observe Chrome tab bar shows 1 new tab | A |
| C7 | Per-keyword progress updates in popup | Agent-Probe | Manual step 12: watch status line during 2-keyword batch for "Keyword N/N: ..." text | A |
| C8 | Final "Batch done!" summary shown | Agent-Probe | Manual step 14: confirm popup shows totals after last keyword completes | A |
| C9 | Existing "Collect FB Posts" single-collect regression | Agent-Probe | Manual step 16: run single-collect flow on a FB page after batch additions | A |
| C10 | clickRecentFilter() selector fallback logic | Known-Gap | — no automated test without jsdom | D |
| C11 | BATCH_POSTS_SEARCH loop unit coverage | Known-Gap | — no automated test without chrome.tabs mock | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle via manual verification)
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: Known-Gap rows (C10, C11) are named residuals carried via gap-resolution D — they are NOT strategies proving a behavior.

Legacy line form:
- popup UI visibility: agent-probe: manual verification steps 1-5
- batch automation loop: agent-probe: manual verification steps 9-17
- CLICK_RECENT_FILTER: agent-probe: manual verification step 8
- clickRecentFilter selectors: known-gap: documented
- BATCH_POSTS_SEARCH unit test: known-gap: documented

Execute-agent instructions:
- E1: Place `if (batchSection) batchSection.style.display = (mode === 'posts') ? '' : 'none';` as the FIRST statement in `updateExtractLabel()` in popup.js, before the `if (mode === 'x')` line (currently line 23). Do NOT place it after any early return — the function has early returns for 'x' and 'posts' modes that would prevent the line from running for those modes.
- E2: Wrap the async IIFE keyword loop in `try { ... } catch (err) { console.error('[batch]', err); } finally { ... }`. Move the post-loop tab cleanup (`if (batchTab) chrome.tabs.remove(...)`) and the final broadcast (`chrome.runtime.sendMessage({ action: 'BATCH_POSTS_PROGRESS', done: true, ... })`) into the `finally` block. This ensures the button re-enables and the final broadcast fires even if an exception occurs mid-batch.
- E3: For the chunked POST inside the keyword loop: if `posts.length <= POSTS_BATCH`, POST all posts as one array call to `${SERVER}/events/posts`. If `posts.length > POSTS_BATCH`, slice into chunks of `POSTS_BATCH` and POST each chunk sequentially, accumulating inserted/duplicates across chunks.

Dimension findings:
- Infra fit: PASS — MV3 return-true + sendResponse pattern correct; all helpers (waitForTabComplete, sleep, RENDER_DELAY, POSTS_BATCH, sendToTab, humanClick) confirmed in source; content script injection on facebook.com/* confirmed
- Test coverage: PASS — all behaviors covered by Agent-Probe (matches zero-test repo baseline); known gaps documented; no high-risk class requires hybrid minimum
- Breaking changes: PASS — all 4 new messages additive only; existing RELAY_EXTRACT_POSTS, POSTS_PROGRESS, CHECK_TAB_POSTS flows untouched; isEventsPage() guard prevents cross-collision
- Security surface: PASS — STRIDE clean; no auth/billing/secrets/trust-boundary surface; no new permissions; server sanitization untouched

Open gaps:
- updateExtractLabel early-return placement (CONCERN → resolved via E1 execute-agent instruction)
- async IIFE missing try/catch/finally (CONCERN → resolved via E2 execute-agent instruction)
- clickRecentFilter() selector coverage: known-gap: documented as backlog (jsdom test needed)
- BATCH_POSTS_SEARCH loop unit test: known-gap: documented as backlog (chrome.tabs mock needed)

What this coverage does NOT prove:
- C1/C2: does not prove behavior in non-English locales or all screen sizes
- C3: does not prove whitespace-only input is caught (trim + filter handles it, but not explicitly exercised)
- C4: does not prove all Facebook page layouts where Recent filter button uses different DOM structure
- C5: does not prove correct count accumulation when server returns partial errors
- C6: does not prove tab reuse under slow network conditions or SW crash mid-batch
- C7: does not prove broadcast received correctly when popup is closed mid-batch
- C8: does not prove count accuracy when mixed inserted/duplicate/error responses occur
- C9: does not prove regression in all existing Events and X mode flows (only Posts single-collect)
- C10/C11: not proven by any automated gate (known-gap)

Gate: CONDITIONAL (concerns noted, accepted autonomously — E1 and E2 converted to execute-agent instructions)
Accepted by: session (autonomous, /goal execution) — Concern 1: updateExtractLabel early-return placement resolved via E1 instruction; Concern 2: async IIFE missing try/finally resolved via E2 instruction

## Autonomous Goal Block

SESSION GOAL: Implement batch keyword search for FB Posts — add a textarea + "Run Batch" button to the popup that auto-opens, filters to Recent, scrolls, extracts, and saves posts for each keyword via the service worker.
Charter + umbrella plan: N/A — single plan
Autonomy: standard autonomous execution — proceed on all reversible decisions; hard-stop only on irreversible outward-facing actions not in the validate contract
Hard stop conditions / safety constraints:
- Do not modify server/, review-ui/, or manifest.json (out of scope per plan)
- Do not add new npm dependencies or build tooling
- Do not use chrome.scripting.executeScript (banned by Key Constraints)
- Do not modify popup.css beyond inline styles on the new batchSection element
Next phase: EXECUTE: process/general-plans/active/batch-keyword-posts_23-06-26/batch-keyword-posts_PLAN_23-06-26.md
Validate contract: inline in plan (## Validate Contract section)
Execute start: Agent-Probe (manual verification steps 1-17 after all code complete) | high-risk pack: no
Execute-agent instructions: E1 (updateExtractLabel placement), E2 (try/catch/finally in async IIFE), E3 (chunked POST logic)
