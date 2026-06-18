# FB Events Collector

> **Repository root:** `fb-events-tool/` — all paths in this README are relative to this directory.

A local, human-assisted tool for collecting public Facebook Events metadata on macOS.

## Architecture

```
Chrome Extension (MV3)
  └─ content script reads DOM of the page you're already viewing
  └─ popup sends extracted cards to local server
Local Node.js Server (localhost:7842)
  └─ sanitize → deduplicate → SQLite
Review UI (http://localhost:7842)
  └─ table view, notes, CSV export
```

## Prerequisites

- macOS
- Node.js ≥ 20 (`brew install node`)
- Google Chrome

## Setup

```bash
bash scripts/install.sh
```

The installer:
1. Runs `npm install` in `server/`
2. Registers a launchd service (starts on login, restarts on crash)
3. Prints Chrome extension load instructions

### Chrome Extension

1. Open Chrome → Settings → Extensions → enable **Developer mode**
2. Click **Load unpacked** → select the `extension/` folder
3. Pin the extension to your toolbar

## Usage

1. Click the extension icon → type a search term → click **Search**
2. Facebook Events search opens in your normal browser
3. Browse and scroll to find events you want
4. Click **Extract Visible Events** — only what's currently on screen is captured
5. Repeat as you scroll
6. Open **http://localhost:7842** to review, add notes, delete unwanted rows
7. Click **Export CSV** to download

## File Structure

```
extension/          Chrome Extension (MV3, vanilla JS)
  manifest.json
  popup/            Toolbar popup UI
  content/          DOM extraction (runs on facebook.com/events/*)
  background/       Service worker (tab check + message relay)
server/             Node.js local server
  server.js         Express app
  routes/           events.js, export.js
  db/               schema.sql, database.js (better-sqlite3)
  lib/              sanitize.js, dedup.js, csvExporter.js
  data/             events.db (created at runtime)
review-ui/          Static HTML/JS/CSS served by Express
scripts/            install.sh, launchd plist
```

## SQLite Schema

```sql
events (
  id, event_url, event_url_normalized UNIQUE,
  title, start_datetime, end_datetime,
  venue_name, city_location, organizer_name,
  short_description, source_search_term,
  collected_at, exported_at, notes
)
```

## CSV Columns

```
title, event_url, start_datetime, end_datetime, venue_name,
city_location, organizer_name, short_description,
source_search_term, collected_at, notes
```

## Server Commands

```bash
# Start manually
node server/server.js

# Stop launchd service
launchctl unload ~/Library/LaunchAgents/com.veent.fbevents.plist

# View logs
tail -f /tmp/fbevents.log
tail -f /tmp/fbevents.err
```

## Guardrails

| Layer | What it prevents |
|---|---|
| `host_permissions` | Extension cannot run on profile pages, groups, or DMs |
| `content.js` viewport filter | Only extracts what the user has scrolled to |
| URL validation | Drops any card without a valid `/events/\d+` URL |
| `sanitize.js` | Strips profile links from organizer field; rejects PII |
| 50-event POST limit | Prevents bulk-scrape patterns |
| No navigation API | Server cannot direct the browser to any page |

## Limitations

- Facebook's DOM changes. Selectors in `content/content.js` may need updates.
- Only extracts what is rendered and visible — no hidden or off-screen cards.
- This tool reads only what your account can already see in your normal browser.
- No data leaves your Mac.

## Compliance Note

This tool is human-paced and human-triggered. It does not automate navigation or bypass any access controls. Use it for legitimate market research only and be aware of Facebook's Terms of Service regarding data collection.
