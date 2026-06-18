# FB Events Tool - All Context

Last updated: 18-06-26

This file is the root context entrypoint for the repo.

Use it for two things:

1. quick routing to the right context pack or root file
2. broad architecture and repository understanding

Start here before loading deeper context files.

---

## How This File Works (the `all-*.md` Convention)

Every `process/context/` directory has one `all-*.md` entrypoint that acts as an attachable quick router for that domain. This root file (`all-context.md`) is the top-level router. Context groups each have their own `all-{group}.md` entrypoint.

**The pattern:**

```
process/context/
  all-context.md                      <-- THIS FILE: root router
  planning/
    all-planning.md                   <-- group router for planning
  tests/
    all-tests.md                      <-- group router for tests
```

**How agents use it:**

1. Agent reads `all-context.md` first (this file)
2. Finds the relevant context group from the routing tables below
3. Reads that group's `all-{group}.md` entrypoint
4. Only then loads the specific deep doc needed

---

## Quick Start

For most substantial tasks:

1. read this file first
2. choose the smallest relevant root file or context group from the tables below
3. only then load deeper files

---

## Current Root Entry Points

<!-- GENERATED:routing -->
| File | Read when |
|---|---|
| `process/context/all-context.md` | any substantial planning, research, review, or implementation task |
| `process/context/planning/all-planning.md` | plan-shape calibration and planning conventions — the planning group entrypoint/router |
| `process/context/tests/all-tests.md` | test gaps, manual verification procedures, and future test strategy — the tests group entrypoint/router |

## Current Context Groups

| Group | Entry point | Scope |
|---|---|---|
| `planning/` | `process/context/planning/all-planning.md` | plan-shape calibration and planning conventions — the planning group entrypoint/router |
| `tests/` | `process/context/tests/all-tests.md` | test gaps, manual verification procedures, and future test strategy — the tests group entrypoint/router |
<!-- /GENERATED:routing -->

## Task Routing Table

| If the task involves... | Start with |
|---|---|
| architecture or stack questions | this file |
| SQLite schema, dedup logic, or data integrity | this file (see §SQLite Schema section below) |
| content script DOM selectors or extraction logic | this file + read `extension/content/content.js` directly |
| server routes or API changes | this file + read `server/routes/*.js` |
| testing or verification | `process/context/tests/all-tests.md` |
| creating a new plan | `process/context/planning/all-planning.md` |
| sanitization / PII handling | this file (see §Key Patterns) + read `server/lib/sanitize.js` |

## Context Group Lifecycle

Context groups are durable knowledge domains, not feature folders.

Create a group when:

- a topic has 3+ durable docs
- a single doc exceeds roughly 800 lines with separable subtopics
- multiple agents repeatedly need only one slice of a large context file

---

## Repository Structure

```
fb-events-tool/
  extension/            Chrome Extension (MV3, vanilla JS)
    manifest.json       permissions, host_permissions, content_scripts config
    popup/              toolbar popup (popup.html, popup.js, popup.css)
    content/            DOM extraction content script (content.js)
    background/         service worker (service-worker.js — tab check + message relay)
  server/               Node.js/Express local server
    server.js           Express app entry point (port 7842, binds 127.0.0.1)
    routes/
      events.js         POST /events, POST /events/enrich, GET /events, DELETE /:id, PATCH /:id
      export.js         GET /export/csv
    db/
      database.js       better-sqlite3 singleton (lazy-init, WAL mode)
      schema.sql        CREATE TABLE events + 2 indexes
    lib/
      sanitize.js       input validation + PII rejection (SanitizationError class)
      dedup.js          URL normalization to facebook.com/events/{id}
      csvExporter.js    json2csv wrapper
    data/
      events.db         SQLite database (git-ignored, created at runtime)
  review-ui/            Static HTML/CSS/JS served by Express at root (/)
    index.html          review table UI
    app.js              fetch-based JS client
    style.css
  scripts/
    install.sh          macOS: npm install + launchd service registration
    com.veent.fbevents.plist  launchd plist for auto-start on macOS
  process/              agent harness (RIPER-5 methodology)
    context/            this context system
    general-plans/      implementation plans
    features/           feature-scoped storage
    development-protocols/  RIPER-5 protocol docs
```

---

## Technology Stack

- **Runtime:** Node.js ≥ 20 (server); vanilla browser JS (extension, review-ui)
- **Server framework:** Express 4.x
- **Database:** SQLite via better-sqlite3 9.x (synchronous API, WAL mode)
- **Export:** json2csv 6.x (alpha)
- **Dev tool:** nodemon 3.x (hot reload for server development)
- **Extension:** Chrome MV3, no framework, no build step
- **Review UI:** plain HTML/CSS/JS, no framework, no build step
- **Package manager:** npm (server only; root has no package.json)
- **Platform:** macOS (launchd auto-start) + Windows/Linux (manual start: `node server/server.js`)
- **No TypeScript, no bundler, no transpiler** — everything is plain CommonJS (`'use strict'`) on the server and plain ES browser JS in the extension

---

## Key Patterns and Conventions

**Vanilla JS — no frameworks, no build step.** The entire codebase is plain JS. Do not introduce React, Vue, TypeScript, bundlers (webpack/vite/esbuild), or transpilers. The extension and review-ui run directly in Chrome; the server uses CommonJS require().

**Privacy-first.** All data stays on the user's machine. No external API calls from the server. No analytics or telemetry. The extension only operates on `facebook.com/events/*`.

**Minimal dependencies.** Only add npm packages with strong justification. The server intentionally has a tiny dep tree (express, cors, better-sqlite3, json2csv, nodemon).

**Synchronous SQLite.** better-sqlite3 is fully synchronous — no async/await for database calls. All DB operations use the singleton from `db/database.js` via `getDb()`. The database opens in WAL mode for better concurrency.

**Dedup by normalized URL.** `dedup.js` normalizes all event URLs to `facebook.com/events/{numericId}` (strips query params, slugs, protocol). The `event_url_normalized` column has a UNIQUE constraint — `INSERT OR IGNORE` silently drops duplicates.

**Sanitization before insert.** Every inbound card goes through `sanitize.js` before insert. This rejects: missing event URL, non-events URLs, missing title, profile links in organizer field, PII (email/phone regex) in any text field. `SanitizationError` is caught per-card in the batch transaction — one bad card doesn't fail the whole batch.

**Batch transaction pattern.** `POST /events` accepts up to 100 cards. All inserts run inside a single `db.transaction()`. Returns `{ inserted, duplicates, errors }`.

**Content script extraction modes.** `content.js` has two modes dispatched by `isEventDetailPage()`:
- **Search mode** (`extractFromSearchResults`): walks all `<a href>` matching event URL pattern in the DOM, finds card roots by walking up the DOM tree, extracts text lines heuristically. No viewport filter — extracts everything loaded in the DOM at the time of the button click (user scrolls first, then extracts).
- **Detail mode** (`extractFromEventDetailPage`): targets the `<h1>`, full-month date strings, "Event by" organizer pattern, and `City, Region` location chips.

**Respondent count filter.** Search mode skips events with fewer than 10 total interested+going counts (`MIN_RESPONDENTS = 10`). Detail mode does not apply this filter.

**CORS policy.** Server allows only `chrome-extension://` origins and `http://localhost:7842`. All other origins are rejected.

**Error handling.** Server uses a global error handler middleware (last middleware in `server.js`). Routes use try/catch and return `{ error: string }` JSON with appropriate status codes. No custom error classes on the server side (only `SanitizationError` in the lib).

**Allowed PATCH fields.** `PATCH /events/:id` only accepts `notes`, `organizer_name`, `city_location`, `venue_name`. Other fields are silently ignored.

**`/events/enrich` route ordering.** This route is registered BEFORE `/:id` routes in Express to prevent Express from treating the string "enrich" as an ID parameter.

---

## SQLite Schema

Single table: `events`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `event_url` | TEXT NOT NULL | raw URL from extraction |
| `event_url_normalized` | TEXT NOT NULL UNIQUE | `facebook.com/events/{id}` — dedup key |
| `title` | TEXT NOT NULL | |
| `start_datetime` | TEXT | ISO string or human-readable date string from DOM |
| `end_datetime` | TEXT | nullable, rarely populated |
| `venue_name` | TEXT | nullable |
| `city_location` | TEXT | nullable |
| `organizer_name` | TEXT | nullable, profile links stripped |
| `short_description` | TEXT | nullable, max 500 chars |
| `source_search_term` | TEXT NOT NULL | the search term used when the user extracted |
| `collected_at` | TEXT NOT NULL | ISO timestamp |
| `exported_at` | TEXT | nullable, set on CSV export |
| `respondent_count` | INTEGER NOT NULL DEFAULT 0 | total interested + going count |
| `notes` | TEXT | nullable, user-editable via review UI |

Indexes: `idx_collected_at` on `collected_at`, `idx_source_term` on `source_search_term`.

**Schema change warning:** changing the schema requires a migration — better-sqlite3 does not auto-migrate. There are no automated tests. Test manually after any schema change.

---

## Environment and Configuration

**No `.env` file.** Configuration is hardcoded:
- Server port: `7842` (hardcoded in `server.js`)
- Server bind: `127.0.0.1` (localhost only, not exposed to network)
- DB path: `data/events.db` (relative to `server/`)
- Max batch size: `100` (in `routes/events.js`, constant `MAX_BATCH`)
- Min respondent count filter: `10` (in `extension/content/content.js`, constant `MIN_RESPONDENTS`)

**macOS auto-start:** `scripts/install.sh` installs `com.veent.fbevents.plist` to `~/Library/LaunchAgents/`. Log files: `/tmp/fbevents.log` (stdout) and `/tmp/fbevents.err` (stderr).

**Windows/Linux:** Start manually with `node server/server.js` from the `server/` directory. No auto-start scripts exist yet for these platforms (in-progress feature area).

---

## Active Feature Areas

**Planned / in-progress features:**
- Better event filtering and search (review UI side + server query enhancements)
- Richer data extraction (more fields from Facebook DOM — attendee counts, categories, recurring events)
- Cross-platform support (Windows + Linux install/auto-start scripts)

---

## Scan Metadata

- Generated: 18-06-26
- HEAD: no commits yet
- Mode: vc-setup Flow A (new project)
- Package manager: npm (server only)
