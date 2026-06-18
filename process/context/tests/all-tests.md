---
name: context:all-tests
description: "test gaps, manual verification procedures, and future test strategy — the tests group entrypoint/router"
keywords: tests, testing, verification, manual, no-tests, quality, regression
related: []
date: 18-06-26
---

# Tests Context

This file is the canonical tests context entrypoint for fb-events-tool.

Use it after `process/context/all-context.md` when the task needs testing, verification, or quality guidance.

---

## Scope

This group covers:

- current testing gaps and known risks
- manual verification procedures for each component
- recommended approach for adding tests in the future
- what to check after any code change

It does not cover:

- feature-specific test plans (those belong in `process/features/` or `process/general-plans/`)
- CI/CD setup (not yet in scope)

---

## Read When

Read this entrypoint when:

- implementing any change and need to know how to verify it
- deciding whether to add automated tests
- debugging a regression or unexpected behavior
- planning a feature that touches extraction, dedup, sanitization, or the DB schema

---

## Quick Routing

No deeper test docs yet. All test context lives in this file.

---

## Source Paths

- `process/context/tests/all-tests.md` (this file)

---

## Update Triggers

Update this group when:

- automated tests are added (update Commands section, remove gap entries)
- manual verification steps change due to refactoring
- new components or routes are added that need coverage guidance

---

## Current Status: No Automated Test Suite

**There are zero automated tests.** This is the primary pain point for safe development.

Implications for agents:
- Any code change can break behavior silently.
- Always manually verify after changes (see procedures below).
- Be conservative with refactors — prefer targeted changes over broad restructuring.
- Avoid changing multiple systems (sanitize + dedup + schema) in a single PR.

---

## Commands

| Component | How to test |
|---|---|
| Server (full stack) | `cd server && node server.js` — then use the extension or curl |
| Server (dev, hot reload) | `cd server && npm run dev` (uses nodemon) |
| Manual curl — POST events | `curl -X POST http://localhost:7842/events -H 'Content-Type: application/json' -d '[{"event_url":"https://www.facebook.com/events/1234567890","title":"Test","source_search_term":"test","collected_at":"2026-06-18T00:00:00Z","respondent_count":15}]'` |
| Manual curl — GET events | `curl http://localhost:7842/events` |
| Manual curl — CSV export | `curl http://localhost:7842/export/csv -o test.csv` |
| Review UI | Open `http://localhost:7842` in browser after server is running |
| Extension | Load unpacked from `extension/` in Chrome DevTools → Extensions |

---

## Manual Verification Procedures

### After changing `server/lib/sanitize.js`

1. Start server: `cd server && node server.js`
2. POST a batch with a valid card — confirm `inserted: 1`
3. POST a card with a missing `title` — confirm `errors` array contains the card
4. POST a card with a non-events URL (e.g. facebook.com/profile/123) — confirm error
5. POST a card with an email in `organizer_name` — confirm PII rejection error
6. POST a duplicate card (same URL) — confirm `duplicates: 1`

### After changing `server/lib/dedup.js`

1. POST a card with URL `https://www.facebook.com/events/1234567890/?ref=foo`
2. POST same card again — confirm `duplicates: 1` (normalization strips query params)
3. POST a card with a slug URL `https://www.facebook.com/events/event-name/1234567890/` — confirm dedup works

### After changing `server/db/schema.sql` or `server/db/database.js`

1. Delete `server/data/events.db` (or rename as backup)
2. Restart server — confirm new DB is created and schema is applied
3. POST a batch — confirm insert works
4. GET `/events` — confirm data is returned correctly
5. Verify indexes exist: `sqlite3 server/data/events.db ".indexes"`

### After changing `extension/content/content.js`

1. Load the extension in Chrome (Developer mode → Load unpacked)
2. Open a Facebook Events search page, scroll, click Extract
3. Check the popup shows the expected count
4. Open `http://localhost:7842` and verify rows appear in the review table
5. Open an individual event page (e.g. `facebook.com/events/1234567890`) and test detail-mode extraction

### After changing `server/routes/events.js`

1. POST /events — verify batch insert and duplicate handling
2. POST /events/enrich — verify enrichment updates correct fields
3. GET /events — verify filtering by `term`, `from`, `to` query params
4. DELETE /events/:id — verify row is removed
5. PATCH /events/:id — verify notes/fields update; verify non-allowed fields are ignored

### After changing `review-ui/`

1. Start server and open `http://localhost:7842`
2. Verify table renders with data
3. Test note editing (inline edit)
4. Test delete button
5. Test Export CSV button — verify download and column names

---

## Known Gaps

- No unit tests for `sanitize.js` or `dedup.js` (the most critical logic)
- No integration tests for any server route
- No test for the content script extraction logic (browser environment makes this harder)
- No regression guard for Facebook DOM selector changes
- No CI/CD pipeline

## Future Test Strategy (when adding tests)

When automated tests are added, recommended approach:

1. **Start with `sanitize.js` and `dedup.js`** — pure functions, easiest to unit test with Node's built-in `assert` or a lightweight runner like `node:test`
2. **Server route integration tests** — use `supertest` + better-sqlite3 in-memory DB (`:memory:`)
3. **Content script** — jsdom-based unit tests for the extraction helpers; full browser tests require Puppeteer/Playwright
4. **Test runner recommendation:** Node's built-in `node:test` (no new deps) or `vitest` if a framework is needed
