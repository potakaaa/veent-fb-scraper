---
name: plan:frontend-dashboard
description: "Turbo monorepo frontend dashboard — shadcn/Next.js dashboard consuming existing Express backend, 4-phase build"
date: 19-06-26
feature: frontend-dashboard
phase: "PLAN"
---

# Frontend Dashboard — Implementation Plan

**Date**: 19-06-26
**Complexity**: COMPLEX (Multi-phase, 4 phases)
**Status**: PLANNED

---

## Session Goal

Build a read-only (plus inline edit/delete) Turbo monorepo frontend dashboard for fb-events-tool that fetches events from the existing Express/PostgreSQL backend and displays stats cards, a filterable paginated table, charts, and a recent-events feed. The backend is not changed beyond one CORS line.

---

## Overview

The existing fb-events-tool is a standalone Chrome extension + Express server tool. This plan adds a modern Next.js dashboard as a Turborepo app alongside the existing code, scaffolded via `pnpm dlx shadcn@latest init --preset b4akxp3DUI --template start --monorepo`. The dashboard fetches data from `http://localhost:7842` (the existing Express server) and renders analytics, a filterable table, and charts — all client-side, no SSR needed for backend data.

**Key constraints:**
1. Backend is NOT redesigned — only one CORS origin line added
2. Existing server (`server/`), extension (`extension/`), and review-ui (`review-ui/`) remain untouched except the CORS fix
3. `pnpm` is the monorepo package manager (server currently uses npm — stays npm internally, referenced as a workspace package)
4. No authentication needed (local-only tool)
5. The shadcn preset `b4akxp3DUI` dictates component library and Tailwind config — use whatever it provides
6. **All UI components must use shadcn/ui primitives first** — `<Card>`, `<Table>`, `<Button>`, `<Input>`, `<Select>`, `<Badge>`, `<Skeleton>`, `<Separator>`, `<Dialog>`, etc. Do not write custom div-based components where a shadcn component exists. For charts, use shadcn's `<ChartContainer>` / chart primitives (built on Recharts) rather than raw Recharts JSX where available.

---

## Phase Structure

| Phase | Name | Description | Exit gate |
|---|---|---|---|
| 1 | Monorepo Scaffold | Run shadcn init, wire root package.json / turbo.json / pnpm-workspace.yaml | `pnpm install` succeeds, `pnpm run dev` starts Next.js on port 3000 |
| 2 | CORS Fix | Add `http://localhost:3000` to Express CORS allowlist | `curl -H "Origin: http://localhost:3000" http://localhost:7842/events` returns 200 with CORS headers |
| 3 | Dashboard Build | Layout, stats cards, events table with filter/search, charts, recent feed | Browser smoke test: all 4 widgets render with live data |
| 4 | Integration Smoke Check | End-to-end manual verification with both server and dashboard running | All 4 dashboard sections render live data; edit/delete round-trip works |

---

## Touchpoints

### Phase 1 — Scaffold (new files only)
- `package.json` (new — root monorepo)
- `pnpm-workspace.yaml` (new)
- `turbo.json` (new)
- `apps/dashboard/` (new — entire Next.js app tree from scaffold)
- `packages/` (new — shared packages from scaffold, e.g. `packages/ui`)

### Phase 2 — CORS Fix (single line change)
- `server/server.js` — add `http://localhost:3000` to origin allowlist (line 19)

### Phase 3 — Dashboard Build (all inside `apps/dashboard/`)
- `apps/dashboard/src/app/page.tsx` — root dashboard page
- `apps/dashboard/src/app/layout.tsx` — root layout (if not already from scaffold)
- `apps/dashboard/src/components/stats/StatsCards.tsx` — stats card row
- `apps/dashboard/src/components/table/EventsTable.tsx` — paginated events table
- `apps/dashboard/src/components/table/EventsTableFilters.tsx` — filter bar (source, term, date range)
- `apps/dashboard/src/components/charts/EventsOverTime.tsx` — bar/line chart
- `apps/dashboard/src/components/charts/SourceSplit.tsx` — pie/donut chart
- `apps/dashboard/src/components/charts/TopCities.tsx` — horizontal bar
- `apps/dashboard/src/components/charts/TopOrganizers.tsx` — horizontal bar
- `apps/dashboard/src/components/charts/TopSearchTerms.tsx` — horizontal bar
- `apps/dashboard/src/components/charts/RespondentDistribution.tsx` — histogram
- `apps/dashboard/src/components/feed/RecentFeed.tsx` — card grid of 20 most recent
- `apps/dashboard/src/lib/api.ts` — typed fetch helpers for all backend endpoints
- `apps/dashboard/src/lib/types.ts` — TypeScript type for the `Event` row from backend
- `apps/dashboard/src/hooks/useEvents.ts` — TanStack Query (or SWR) hook

### Phase 4 — No new files; smoke test only

---

## Public Contracts

### Backend API consumed (no changes to contract)
- `GET http://localhost:7842/events?source=&term=&from=&to=&limit=&offset=` → `Event[]`
- `PATCH http://localhost:7842/events/:id` body: `{ notes?, organizer_name?, city_location?, venue_name? }`
- `DELETE http://localhost:7842/events/:id`
- `GET http://localhost:7842/export/csv` → CSV download

### Frontend API module (`apps/dashboard/src/lib/api.ts`)
All functions return typed promises; callers pass these functions to TanStack Query hooks. This is the internal contract between components and the fetch layer.

```
fetchEvents(params: EventsQueryParams): Promise<Event[]>
patchEvent(id: number, fields: PatchEventBody): Promise<{ updated: boolean }>
deleteEvent(id: number): Promise<{ deleted: boolean }>
exportCSV(): string  // returns the URL string for direct anchor click
```

### TypeScript Event type (`apps/dashboard/src/lib/types.ts`)
Maps exactly to the Postgres `events` table columns. All nullable columns typed as `string | null`.

---

## Blast Radius

| Surface | Risk | Notes |
|---|---|---|
| `server/server.js` | LOW | One-line CORS change; no logic change |
| `apps/dashboard/` | MEDIUM | Entire new app; no existing code at risk |
| `turbo.json` | LOW | New file; does not touch server or extension |
| `pnpm-workspace.yaml` | LOW | New file; server stays on npm internally |
| `package.json` (root) | LOW | New file; server's own `server/package.json` unchanged |
| `extension/` | NONE | Untouched |
| `review-ui/` | NONE | Untouched |
| `server/routes/` | NONE | Untouched |

**Risk class**: LOW-MEDIUM. No schema/auth/billing surfaces touched. CORS change is the only production server modification and is additive (no existing origins removed).

---

## Dependencies

### External (new, installed via pnpm in `apps/dashboard/`)
After scaffold, verify these are present (shadcn preset may include some):
- `next` (from scaffold)
- `react`, `react-dom` (from scaffold)
- `tailwindcss`, `postcss`, `autoprefixer` (from scaffold)
- `@tanstack/react-query` — client-side data fetching (add if not in preset)
- `recharts` — charts (shadcn charts are built on recharts; likely already in preset)
- `lucide-react` — icons (likely in shadcn preset)

### Internal dependencies
- Phase 1 must complete before Phase 2 is exercised (CORS fix only needed once dashboard is running)
- Phase 2 must be done before Phase 3 integration verification (API calls will fail without CORS)
- Phase 3 must complete before Phase 4

### Prerequisite environment
- `node server/server.js` must be running at `http://localhost:7842` for Phase 3 browser testing
- PostgreSQL must be accessible (server/.env with DATABASE_URL must exist)
- `pnpm` must be installed globally (`npm install -g pnpm` or `brew install pnpm`)

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| shadcn preset `b4akxp3DUI` doesn't exist or fails | LOW | If preset fails, run `pnpm dlx shadcn@latest init` without preset and manually configure; document deviation |
| `--monorepo` flag behavior differs from expected | MEDIUM | After scaffold, verify `turbo.json` and `pnpm-workspace.yaml` exist; if not auto-created, create them manually per Phase 1 checklist fallback |
| TanStack Query not in preset | LOW | Add `@tanstack/react-query` explicitly: `pnpm add @tanstack/react-query` inside `apps/dashboard/` |
| Recharts not in preset | LOW | Add `recharts` explicitly |
| Next.js SSR trying to call server-side | LOW | All API calls must be client-side (use `'use client'` directive); no `getServerSideProps` or server actions needed |
| pnpm workspace version conflicts | LOW | Lock versions in root `package.json` `peerDependencies`; use `pnpm install --frozen-lockfile` for verification |
| Server uses `npm` internally, pnpm at root | LOW | pnpm workspaces only manage workspace packages; `server/` is NOT a workspace package (it stays as a standalone npm package). `pnpm-workspace.yaml` includes `apps/*` and `packages/*` only. |

---

## Implementation Checklist

### Phase 1: Monorepo Scaffold

**Pre-conditions:**
- `pnpm` installed globally
- At repo root: no existing `turbo.json`, no existing root `package.json`, no existing `pnpm-workspace.yaml`

1. From the repo root (`fb-events-tool/`), run the shadcn scaffold:
   ```
   pnpm dlx shadcn@latest init --preset b4akxp3DUI --template start --monorepo
   ```
   Expected: creates `apps/dashboard/`, `packages/ui/` (or similar), `turbo.json`, `pnpm-workspace.yaml`, root `package.json`.

2. Inspect the generated `pnpm-workspace.yaml`. Verify it includes `apps/*` and `packages/*`. If `server` or `extension` appear as workspace members, remove them (they are NOT workspace packages).

3. Inspect the generated root `package.json`. Verify it has `"private": true`, a `workspaces` field matching `pnpm-workspace.yaml`, and `turbo` as a devDependency (or peer). Add if missing:
   ```json
   {
     "private": true,
     "scripts": {
       "dev": "turbo run dev",
       "build": "turbo run build",
       "lint": "turbo run lint"
     },
     "devDependencies": {
       "turbo": "latest"
     }
   }
   ```

4. Inspect `turbo.json`. Verify it has at minimum:
   ```json
   {
     "$schema": "https://turbo.build/schema.json",
     "tasks": {
       "build": { "dependsOn": ["^build"], "outputs": [".next/**", "!.next/cache/**"] },
       "dev": { "persistent": true },
       "lint": {}
     }
   }
   ```
   Add missing tasks if necessary.

5. Run `pnpm install` from repo root. Must succeed with no errors. Note: if it fails due to workspace resolution of `server/`, confirm `server/` is excluded from `pnpm-workspace.yaml`.

6. Run `pnpm run dev` (or `turbo run dev`). Verify Next.js starts and `http://localhost:3000` shows the default shadcn starter page. Kill after confirmation.

7. Inspect `apps/dashboard/package.json` to identify what shadcn preset included. List: chart library (recharts?), data-fetching library (SWR/TanStack Query?), any relevant components already scaffolded.

8. If `@tanstack/react-query` is NOT in `apps/dashboard/package.json`, add it:
   ```
   cd apps/dashboard && pnpm add @tanstack/react-query
   ```
   Add the QueryClientProvider wrapper to `apps/dashboard/src/app/layout.tsx` (or `providers.tsx` if the scaffold already has one).

9. If `recharts` is NOT in `apps/dashboard/package.json`, add it:
   ```
   cd apps/dashboard && pnpm add recharts
   ```

10. Create `apps/dashboard/src/lib/types.ts` with the `Event` TypeScript interface matching the backend Postgres schema:
    ```typescript
    export interface Event {
      id: number
      event_url: string
      event_url_normalized: string
      title: string
      start_datetime: string | null
      end_datetime: string | null
      venue_name: string | null
      city_location: string | null
      organizer_name: string | null
      short_description: string | null
      source_search_term: string
      collected_at: string
      exported_at: string | null
      respondent_count: number
      notes: string | null
      enriched_at: string | null
      source: 'facebook' | 'x.com'
    }
    ```

11. Create `apps/dashboard/src/lib/api.ts` with typed fetch helpers pointing to `http://localhost:7842`:
    - `fetchEvents(params)` — GET /events with query params
    - `patchEvent(id, fields)` — PATCH /events/:id
    - `deleteEvent(id)` — DELETE /events/:id
    - `exportCSVUrl()` — returns `"http://localhost:7842/export/csv"` string
    All fetch calls must use `{ cache: 'no-store' }` or `next: { revalidate: 0 }` to prevent stale caching. Base URL should be a constant at top of file: `const BASE = "http://localhost:7842"`.

**Phase 1 exit gate:** `pnpm run dev` starts without error and `http://localhost:3000` renders the shadcn starter. `apps/dashboard/src/lib/types.ts` and `apps/dashboard/src/lib/api.ts` exist.

---

### Phase 2: CORS Fix

12. Open `server/server.js`. Locate the CORS origin callback (lines 18-25):
    ```javascript
    origin: (origin, callback) => {
      if (!origin || origin.startsWith('chrome-extension://') || origin === `http://localhost:${PORT}`) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin "${origin}" not allowed`));
      }
    },
    ```

13. Add `|| origin === 'http://localhost:3000'` to the allowlist condition:
    ```javascript
    if (!origin
      || origin.startsWith('chrome-extension://')
      || origin === `http://localhost:${PORT}`
      || origin === 'http://localhost:3000') {
      callback(null, true);
    }
    ```
    This is the ONLY change to `server/`. Do not touch routes, DB, or any other file.

14. Restart the server: `cd server && node server.js` (or kill+restart nodemon if running).

15. Verify CORS fix with curl:
    ```
    curl -v -H "Origin: http://localhost:3000" http://localhost:7842/events 2>&1 | grep -i "access-control"
    ```
    Expected: `Access-Control-Allow-Origin: http://localhost:3000` in response headers.

**Phase 2 exit gate:** curl test shows CORS header for `http://localhost:3000`. Existing extension and review-ui origins still work (chrome-extension:// and http://localhost:7842).

---

### Phase 3: Dashboard Build

All work inside `apps/dashboard/src/`.

#### 3A: QueryClient Provider

16. If the scaffold does not already have a providers file, create `apps/dashboard/src/components/providers.tsx`:
    ```tsx
    'use client'
    import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
    import { useState } from 'react'

    export function Providers({ children }: { children: React.ReactNode }) {
      const [queryClient] = useState(() => new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000 } }
      }))
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    ```

17. Wrap root layout with Providers in `apps/dashboard/src/app/layout.tsx`. Import `{ Providers }` and wrap `{children}` inside `<Providers>`. This must be inside `<body>` and outside any `Suspense` boundary.

#### 3B: Data Hook

18. Create `apps/dashboard/src/hooks/useEvents.ts`:
    - `useEvents(params)` — `useQuery(['events', params], () => fetchEvents(params))` returning `{ data: Event[], isLoading, error }`
    - `usePatchEvent()` — `useMutation` calling `patchEvent`, on success invalidates `['events']`
    - `useDeleteEvent()` — `useMutation` calling `deleteEvent`, on success invalidates `['events']`
    All exports as named exports.

#### 3C: Stats Cards

19. Create `apps/dashboard/src/components/stats/StatsCards.tsx`:
    - Accepts `events: Event[]` as prop (derived from the full unfiltered event list)
    - Computes locally:
      - `totalEvents = events.length`
      - `facebookCount = events.filter(e => e.source === 'facebook').length`
      - `xCount = events.filter(e => e.source === 'x.com').length`
      - `enrichedCount = events.filter(e => e.enriched_at !== null).length`
      - `highRespondentCount = events.filter(e => e.respondent_count > 100).length`
    - Renders 4 cards using shadcn `<Card>` components (or equivalent from preset):
      1. "Total Events" — `totalEvents`
      2. "By Source" — `{facebookCount} Facebook / {xCount} X.com`
      3. "Enriched" — `enrichedCount`
      4. "High Interest (>100)" — `highRespondentCount`
    - Cards must be in a responsive CSS grid: `grid-cols-2 lg:grid-cols-4`

#### 3D: Events Table

20. Create `apps/dashboard/src/components/table/EventsTableFilters.tsx`:
    - Props: `filters: EventFilters`, `onFiltersChange: (f: EventFilters) => void`
    - `EventFilters` type: `{ source: '' | 'facebook' | 'x.com', term: string, from: string, to: string }`
    - Renders:
      - Source select dropdown (options: All / Facebook / X.com)
      - Search term text input (debounced 300ms — use local state + `useEffect` + timeout)
      - Date range: two `<input type="date">` for from/to
      - "Clear Filters" button that resets all to defaults
    - On any change, calls `onFiltersChange` with the new filter object

21. Create `apps/dashboard/src/components/table/EventsTable.tsx`:
    - Props: `events: Event[]`, `isLoading: boolean`, `onEdit: (id, fields) => void`, `onDelete: (id) => void`
    - Uses shadcn `<Table>` (or equivalent) with columns:
      - Title (clickable link to `event.event_url`, opens in new tab)
      - Source (badge: blue for facebook, purple for x.com)
      - City/Location (`city_location`)
      - Venue (`venue_name`)
      - Organizer (`organizer_name`)
      - Date (`start_datetime`, formatted as "Jun 19" or similar)
      - Respondents (`respondent_count`)
      - Collected (`collected_at`, formatted as "Jun 19, 2026")
      - Notes (inline editable: click to show `<input>`, blur saves via `onEdit`)
      - Actions (Delete button with confirmation: `window.confirm('Delete this event?')`)
    - Pagination: show 50 rows per page, client-side pagination using local state `page` (do not paginate via API — fetch up to 500 at a time and paginate in-component)
    - Loading state: show shadcn `<Skeleton>` rows (5 rows) while `isLoading` is true
    - Empty state: show "No events found" message

22. Create the CSV export button inside `EventsTable` or as a sibling component:
    - Renders an `<a href="http://localhost:7842/export/csv" download>` styled as a button
    - Label: "Export CSV"

#### 3E: Charts

23. Create `apps/dashboard/src/components/charts/EventsOverTime.tsx`:
    - Accepts `events: Event[]`
    - Groups events by `collected_at` date (YYYY-MM-DD prefix, `event.collected_at.slice(0,10)`)
    - Renders a Recharts `<BarChart>` or `<LineChart>` with date on X axis, count on Y axis
    - Must include `<ResponsiveContainer width="100%" height={300}>`

24. Create `apps/dashboard/src/components/charts/SourceSplit.tsx`:
    - Accepts `events: Event[]`
    - Computes `[{ name: 'Facebook', value: N }, { name: 'X.com', value: N }]`
    - Renders Recharts `<PieChart>` with `<Pie>` (donut: `innerRadius={60} outerRadius={100}`)

25. Create `apps/dashboard/src/components/charts/TopCities.tsx`:
    - Accepts `events: Event[]`
    - Groups by `city_location`, top 10, ignores nulls
    - Renders Recharts `<BarChart layout="vertical">` with city on Y axis, count on X axis

26. Create `apps/dashboard/src/components/charts/TopOrganizers.tsx`:
    - Same pattern as TopCities but for `organizer_name`, top 10

27. Create `apps/dashboard/src/components/charts/TopSearchTerms.tsx`:
    - Same pattern but for `source_search_term`, top 10

28. Create `apps/dashboard/src/components/charts/RespondentDistribution.tsx`:
    - Accepts `events: Event[]`
    - Buckets into: 0-9, 10-49, 50-99, 100-499, 500+
    - Renders Recharts `<BarChart>` with bucket label on X, count on Y

#### 3F: Recent Events Feed

29. Create `apps/dashboard/src/components/feed/RecentFeed.tsx`:
    - Accepts `events: Event[]` (already sorted by `collected_at DESC` from API)
    - Takes first 20 items
    - Renders a CSS grid `grid-cols-2 lg:grid-cols-4` of cards:
      - Title (clickable link)
      - Source badge (Facebook / X.com)
      - `start_datetime` formatted as "Jun 19, 2026"
      - `city_location` or `venue_name`
    - Uses shadcn `<Card>` component

#### 3G: Root Dashboard Page

30. Open (or create) `apps/dashboard/src/app/page.tsx`:
    - Mark as `'use client'`
    - Import: `StatsCards`, `EventsTable`, `EventsTableFilters`, all chart components, `RecentFeed`, `useEvents`, `usePatchEvent`, `useDeleteEvent`
    - State:
      ```typescript
      const [filters, setFilters] = useState<EventFilters>({ source: '', term: '', from: '', to: '' })
      ```
    - Data fetching:
      ```typescript
      // Fetch all events for stats/charts (no filter, high limit)
      const { data: allEvents = [], isLoading: allLoading } = useEvents({ limit: 500 })
      // Fetch filtered events for the table
      const { data: filteredEvents = [], isLoading: tableLoading } = useEvents({ ...filters, limit: 500 })
      ```
    - Mutations:
      ```typescript
      const patchMutation = usePatchEvent()
      const deleteMutation = useDeleteEvent()
      ```
    - Layout (top to bottom):
      1. Page header: `<h1>FB Events Dashboard</h1>` + CSV export button
      2. `<StatsCards events={allEvents} />`
      3. Charts section: 2-column grid for `EventsOverTime` + `SourceSplit`, then 3-column grid for `TopCities`, `TopOrganizers`, `TopSearchTerms`, then `RespondentDistribution`
      4. `<EventsTableFilters filters={filters} onFiltersChange={setFilters} />`
      5. `<EventsTable events={filteredEvents} isLoading={tableLoading} onEdit={...} onDelete={...} />`
      6. `<RecentFeed events={allEvents} />`
    - Wrap entire content in `<main className="container mx-auto p-6 space-y-8">`

31. If `apps/dashboard/src/app/layout.tsx` does not already set a page title and dark/light mode, add:
    ```tsx
    export const metadata = { title: 'FB Events Dashboard' }
    ```

**Phase 3 exit gate:** `pnpm run dev` in `apps/dashboard/` (or `turbo run dev`) starts cleanly with no TypeScript or build errors. Browser at `http://localhost:3000` renders the page structure (stats cards, table, charts, feed) even if data shows loading states (server may not be running for build-time check).

---

### Phase 4: Integration Smoke Check

32. Start the server: `cd server && node server.js` — confirm listening on port 7842.

33. In a separate terminal, start the dashboard: `cd apps/dashboard && pnpm run dev` — confirm port 3000.

34. Open `http://localhost:3000` in browser.

35. Verify stats cards:
    - Total Events shows a number > 0 (assuming DB has data)
    - Source split shows correct Facebook/X.com breakdown
    - Enriched count is visible
    - High Interest count is visible

36. Verify charts:
    - Events over time: bars/line render
    - Source split pie renders
    - Top Cities renders (empty is OK if no data)
    - Top Organizers renders
    - Top Search Terms renders
    - Respondent distribution renders

37. Verify events table:
    - Events load (not just skeleton indefinitely)
    - Filter by source works (change dropdown, table updates)
    - Search term filter works
    - Pagination works (page 2 shows next 50 rows)

38. Verify inline edit (notes):
    - Click a notes field, type something, click away
    - Refresh page — note persists (PATCH /events/:id round-trip worked)

39. Verify delete:
    - Click delete on one event, confirm dialog, row disappears
    - Refresh page — row is gone (DELETE /events/:id worked)

40. Verify CSV export:
    - Click "Export CSV" button
    - CSV file downloads with correct content

41. Verify no console errors in browser DevTools (warnings from React are acceptable, but no network CORS errors, no unhandled promise rejections).

42. Check that `review-ui` at `http://localhost:7842` still works (visit it — the static review table should still render). This confirms no regression from the CORS change.

**Phase 4 exit gate:** All 8 verification points above pass. `review-ui` still works.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm install` exits 0 at repo root | Hybrid (requires pnpm installed) | Phase 1: monorepo scaffold works |
| `pnpm run dev` / Next.js starts on port 3000 | Hybrid (requires Node.js + pnpm) | Phase 1: dashboard app boots |
| `apps/dashboard/src/lib/types.ts` exists with correct Event interface | Agent-Probe (read file, verify fields match DB schema) | Phase 1: type layer aligned with backend |
| `apps/dashboard/src/lib/api.ts` exists with all 4 helpers | Agent-Probe (read file, check exports) | Phase 1: API fetch layer complete |
| `curl -H "Origin: http://localhost:3000" http://localhost:7842/events` returns `Access-Control-Allow-Origin: http://localhost:3000` | Hybrid (server must be running) | Phase 2: CORS fix works |
| Existing origins (`chrome-extension://`, `http://localhost:7842`) still pass CORS | Hybrid (server must be running) | Phase 2: no CORS regression |
| TypeScript build (`pnpm build`) exits 0 in `apps/dashboard/` | Hybrid (requires Node.js + dependencies) | Phase 3: no type errors in dashboard code |
| Browser: stats cards render 4 cards with data | Agent-Probe (visual + devtools network) | Phase 3: StatsCards component works |
| Browser: events table loads, shows rows, pagination works | Agent-Probe (visual + interaction) | Phase 3: EventsTable component works |
| Browser: all 6 chart components render without blank boxes | Agent-Probe (visual) | Phase 3: chart components work |
| Browser: filter by source updates table | Agent-Probe (interaction) | Phase 3: EventsTableFilters wired |
| Browser: PATCH round-trip (edit notes, refresh, notes persist) | Agent-Probe (interaction + verification) | Phase 4: write path works end-to-end |
| Browser: DELETE round-trip (delete row, refresh, gone) | Agent-Probe (interaction + verification) | Phase 4: delete path works end-to-end |
| Browser: CSV export downloads file | Agent-Probe (interaction) | Phase 4: CSV export works |
| `http://localhost:7842` (review-ui) still renders correctly | Agent-Probe (visit URL) | Phase 4: no regression on existing UI |
| No CORS errors in browser DevTools console | Agent-Probe (inspect devtools) | Phase 4: CORS fix complete |

---

## Test Infra Improvement Notes

The repo has zero automated tests. All verification is agent-probe (manual browser smoke) or hybrid (curl + server running). This is consistent with the project's current approach.

Future improvements (out of scope for this plan):
- Add Playwright E2E tests for the dashboard once the app is stable
- Add a `pnpm test` script in `apps/dashboard/` using Vitest for unit tests on utility functions (`lib/api.ts`, computed stats logic in `StatsCards.tsx`)
- Chart rendering is hard to automate without a headless browser; keep as agent-probe

**Vacuous-green note:** No developed behavior in this plan is assigned `Known-Gap` as a terminal proving strategy. All 4 phases have at least Hybrid or Agent-Probe coverage. The lack of Fully-Automated tests is a known infrastructure gap recorded here — not silently dropped.

---

## Data Flow

```
Browser (localhost:3000)
  │
  ├── useEvents({ limit: 500 }) — allEvents
  │     └── fetchEvents() in api.ts
  │           └── GET http://localhost:7842/events?limit=500
  │                 └── Express routes/events.js → PostgreSQL
  │
  ├── useEvents({ ...filters, limit: 500 }) — filteredEvents
  │     └── same path, with source/term/from/to query params
  │
  ├── patchMutation → PATCH http://localhost:7842/events/:id
  │     └── Express routes/events.js UPDATE query
  │
  └── deleteMutation → DELETE http://localhost:7842/events/:id
        └── Express routes/events.js DELETE query

Local computation (no additional API calls):
  allEvents → StatsCards (computed aggregates)
  allEvents → all 6 chart components (computed grouped/bucketed data)
  allEvents.slice(0, 20) → RecentFeed
  filteredEvents → EventsTable (client-side pagination)
```

---

## Failure Modes

| Failure | Detection | Recovery |
|---|---|---|
| shadcn preset `b4akxp3DUI` not found | Scaffold command errors | Run without `--preset`, configure Tailwind + shadcn manually |
| pnpm workspace picks up `server/` | `pnpm install` errors | Remove `server` from `pnpm-workspace.yaml`; add `!server` glob |
| Next.js tries SSR fetch to localhost:7842 (hydration mismatch) | Browser error in devtools | Add `'use client'` to all components using hooks; avoid `getServerSideProps` |
| TanStack Query not in preset | Build error on import | `cd apps/dashboard && pnpm add @tanstack/react-query` |
| Recharts not in preset | Build error on import | `cd apps/dashboard && pnpm add recharts` |
| CORS not working after fix | Network error in browser devtools | Verify server was restarted; check for typo in origin string |
| Charts render as blank white boxes | Visual check | Add `<ResponsiveContainer width="100%" height={300}>` wrapper around all charts |
| `respondent_count` is undefined/null in some rows | Stats wrong | Guard with `?? 0` in all aggregation code |

---

## Backwards Compatibility

- The CORS change is additive — it adds one allowed origin without removing any existing ones.
- The `review-ui` continues to work (served from Express at `http://localhost:7842`).
- The Chrome extension is unaffected — uses `chrome-extension://` origin which is still allowed.
- The `server/package.json` and all server dependencies are unchanged.
- The `pnpm-workspace.yaml` does NOT include `server/` — server stays on its own `npm` lifecycle.

---

## Monorepo Integration Notes

### What the scaffold command creates
`pnpm dlx shadcn@latest init --preset b4akxp3DUI --template start --monorepo` should produce:
- Root `package.json` with `"private": true` and turbo as devDep
- `pnpm-workspace.yaml` with `packages: [apps/*, packages/*]`
- `turbo.json` with `tasks.dev`, `tasks.build`, `tasks.lint`
- `apps/dashboard/` — Next.js app with shadcn components pre-installed
- `packages/ui/` — optional shared component library

### If the scaffold command fails
If the `--preset b4akxp3DUI` or `--monorepo` flags are unsupported in the installed shadcn version, fall back:
1. Create root `package.json`, `pnpm-workspace.yaml`, `turbo.json` manually (see Step 3-4 in checklist)
2. Run `pnpm create next-app@latest apps/dashboard --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"`
3. Run `cd apps/dashboard && pnpm dlx shadcn@latest init` interactively
4. Document the deviation in the phase report

### Next.js version expectation
The scaffold will install the latest Next.js (likely 15.x as of June 2026). If it installs Next.js 14.x, the App Router (`app/` directory) still applies — no changes needed.

---

## Deviations

### D1 (Phase 1) — shadcn `start` template produced TanStack Start, not Next.js → used plan's documented Next.js fallback
- **What deviated:** Running `pnpm dlx shadcn@latest init --template start --monorepo` (preset `b4akxp3DUI`) produced a **TanStack Start + TanStack Router + Vite** monorepo nested under a `dashboard/` folder, with the app at `dashboard/apps/web` (`.output/` build, `vite dev`, file-based TanStack routing). The plan requires **Next.js App Router** at `apps/dashboard` (`apps/dashboard/src/app/page.tsx`, `'use client'`, `.next/`), and validate-contract gate C2 specifies "Next.js dev server starts on port 3000".
- **Why:** The shadcn `start` template defaults to TanStack Start, which is fundamentally incompatible with the plan's entire Phase 3 build (App Router pages, Next.js layout, `'use client'` directives) and the C2/C3 validate gates. The pre-existing nested `dashboard/` scaffold was untracked in the main repo (its own throwaway `.git`, single "initial commit").
- **Resolution:** Followed the plan's own documented fallback (`## Monorepo Integration Notes` → "If the scaffold command fails"): removed the incompatible nested TanStack scaffold and stood up a Next.js app at `apps/dashboard` from the repo root via `pnpm create next-app@latest apps/dashboard` + `shadcn init`, with root `package.json` / `pnpm-workspace.yaml` / `turbo.json` created per Step 3-4.
- **Impact assessment:** WITHIN blast-radius. Final structure matches the plan's canonical target (`apps/dashboard`, Next.js App Router). No schema/auth/API/billing surface touched. Phase 3 file paths in the plan (`apps/dashboard/src/app/page.tsx`, etc.) are now correct. The `--preset b4akxp3DUI` styling/components from the preset are NOT carried over; shadcn components are added via `shadcn add` per E6. This is the exact contingency the plan's fallback and the Autonomous Goal Block hard-stop carve-out ("incompatible with the plan's fallback procedure") anticipated — the fallback IS compatible, so this is not a hard stop.

### D2 (Phase 1) — CSV export helper named `exportCsvUrl` (not `exportCSVUrl`)
- **What deviated:** The plan checklist (line 246) and validate-contract C6 (line 725) name the helper `exportCSVUrl()`; the execute task handoff Step 11 names it `exportCsvUrl()`. I used `exportCsvUrl()`.
- **Why:** Two plan surfaces disagree on casing. The execute handoff (the authoritative instruction passed to this agent) used `exportCsvUrl`; lowercase-`Csv` is also more idiomatic TS.
- **Impact assessment:** WITHIN blast-radius. Trivial naming. **Phase 3 action required:** import `exportCsvUrl` (not `exportCSVUrl`) from `@/lib/api`. The CSV export button in Phase 3 (Step 22) must use the `exportCsvUrl` name.

### D3 (Phase 3) — base-nova shadcn preset ships Base UI (`@base-ui/react`), not Radix
- **What deviated:** The task examples assume Radix-style shadcn primitives (`asChild`, Radix Select). The installed shadcn CLI's default preset (`base-nova`, selected via `init -d`) generates **Base UI** primitives.
- **Why:** `shadcn init --base-color slate` (task Step 0) is not a valid flag in the installed CLI version; `-d` (defaults) was used, which pins the base-nova/Base UI preset.
- **Resolution:** Adapted at call sites — Button CSV link uses the `render` prop (not `asChild`); Select uses Base UI `value`/`onValueChange` + `<SelectValue placeholder>` (verified valid via a throwaway `tsc` type probe before writing). All primitives remain shadcn-generated under `components/ui/`.
- **Impact:** WITHIN blast-radius. No schema/auth/API/billing/container surface. Green build + clean lint confirm correctness.

### D4 (Phase 3) — chart color tokens are `oklch()` raw values, not HSL channels
- **What deviated:** Task Step 22 example uses `color: 'hsl(var(--chart-1))'`. The generated theme defines `--chart-1..5` as full `oklch(...)` colors, so `hsl(var(--chart-1))` would be invalid.
- **Resolution:** Used `var(--chart-N)` directly in each chart's `chartConfig`; shadcn `ChartStyle` exposes `--color-{key}`, consumed via `fill="var(--color-count)"`.
- **Impact:** WITHIN blast-radius. Confirmed by green build.

### Added files (Phase 3, within blast-radius)
- `apps/dashboard/src/lib/aggregate.ts` — `topCountsByField` DRY helper shared by TopCities/TopOrganizers/TopSearchTerms.
- `EventFilters` type added to `apps/dashboard/src/lib/types.ts` — shared between EventsTableFilters and page.tsx.

### Phase 1 versions/structure notes (for Phase 3)
- **Framework:** Next.js **16.2.9** (App Router, Turbopack dev), React **19.2.4**, Tailwind **v4** (`@tailwindcss/postcss`).
- **`@tanstack/react-query` = 5.101.0 (v5)** → per E1, Phase 3 hooks MUST use object-style: `useQuery({ queryKey: ['events', params], queryFn: () => fetchEvents(params) })` and `useMutation({ mutationFn, onSuccess })`.
- **`recharts` = 3.8.1 (v3)**.
- **Root page path (E2):** `apps/dashboard/src/app/page.tsx` (exists — currently the create-next-app default; Phase 3 Step 30 replaces it).
- **Root layout path:** `apps/dashboard/src/app/layout.tsx` (exists; Phase 3 Step 17 wraps `{children}` with `<Providers>`; Step 31 updates `metadata.title` — currently "Create Next App").
- **`src/lib/` created:** `types.ts` (Event + EventsQueryParams + PatchEventBody) and `api.ts` (fetchEvents, patchEvent, deleteEvent, exportCsvUrl).
- **No `packages/` dir created** — single-app monorepo; `pnpm-workspace.yaml` globs `packages/*` (matches nothing, valid). shadcn components will live in `apps/dashboard/src/components/ui/` (added via `shadcn add` in Phase 3 per E6). **Phase 3 must run `pnpm dlx shadcn@latest init` inside `apps/dashboard` first** (the fallback path did not run shadcn init — only create-next-app); no `components.json` exists yet.

---

## Phase Loop Progress

- [~] Phase 1 — Monorepo Scaffold (EXECUTE done — CODE DONE + GATE PASSED; awaiting EVL for VERIFIED)
  - [x] Step 1: RESEARCH (re-read plan, check codebase drift — found stale TanStack scaffold)
  - [x] Step 2: INNOVATE (n/a for mechanical scaffold — skip)
  - [x] Step 3: PLAN-SUPPLEMENT (n/a — plan already had Next.js fallback procedure)
  - [x] Step 4: PVL (validate-contract written, Gate: CONDITIONAL)
  - [x] Step 5: EXECUTE (Next.js fallback scaffold; gates C1/C2/C3/C6 PASS; deviations D1/D2 documented)
  - [ ] Step 6: EVL (confirmation run — orchestrator spawns vc-tester)
  - [ ] Step 7: UPDATE-PROCESS
- [ ] Phase 2 — CORS Fix
  - [ ] Step 1: RESEARCH
  - [ ] Step 2: INNOVATE (n/a — single obvious fix)
  - [ ] Step 3: PLAN-SUPPLEMENT
  - [ ] Step 4: PVL
  - [ ] Step 5: EXECUTE
  - [ ] Step 6: EVL
  - [ ] Step 7: UPDATE-PROCESS
- [~] Phase 3 — Dashboard Build (EXECUTE done — CODE DONE + GATE PASSED; awaiting EVL for VERIFIED)
  - [x] Step 1: RESEARCH (re-read plan + Phase 1 report; inspected scaffold state, shadcn/Base UI APIs, theme tokens)
  - [x] Step 2: INNOVATE (confirmed react-query v5 + recharts v3 from scaffold; sequential strategy)
  - [x] Step 3: PLAN-SUPPLEMENT (n/a — plan already carried E1-E6 execute instructions)
  - [x] Step 4: PVL (outer-pvl contract already written, Gate: CONDITIONAL — C3 is the Phase 3 automated gate)
  - [x] Step 5: EXECUTE (16 source files + 10 shadcn primitives; `pnpm run build` exit 0 app + monorepo; lint clean; deviations D3/D4 documented)
  - [ ] Step 6: EVL (confirmation run — orchestrator spawns vc-tester to re-run C3 `pnpm run build`)
  - [ ] Step 7: UPDATE-PROCESS
- [ ] Phase 4 — Integration Smoke Check
  - [ ] Step 1: RESEARCH
  - [ ] Step 2: INNOVATE (n/a)
  - [ ] Step 3: PLAN-SUPPLEMENT
  - [ ] Step 4: PVL
  - [ ] Step 5: EXECUTE
  - [ ] Step 6: EVL
  - [ ] Step 7: UPDATE-PROCESS

---

## Acceptance Criteria

1. `pnpm install` succeeds at repo root with no errors
   - proven by: Phase 1 hybrid gate (run `pnpm install`)
   - strategy: Hybrid
2. `http://localhost:3000` renders the dashboard with live data from the Express server
   - proven by: Phase 4 agent-probe (browser smoke test, all sections visible)
   - strategy: Agent-Probe
3. Stats cards show correct totals (total, facebook/x.com split, enriched, high-respondent)
   - proven by: Phase 4 agent-probe (visual + network tab)
   - strategy: Agent-Probe
4. Events table is filterable by source, term, and date range
   - proven by: Phase 4 agent-probe (interact with filters, observe table changes)
   - strategy: Agent-Probe
5. All 6 chart types render without blank boxes
   - proven by: Phase 4 agent-probe (visual inspection)
   - strategy: Agent-Probe
6. Inline notes edit persists after page refresh (PATCH round-trip)
   - proven by: Phase 4 agent-probe (edit → refresh → verify)
   - strategy: Agent-Probe
7. Delete removes the row permanently (DELETE round-trip)
   - proven by: Phase 4 agent-probe (delete → refresh → verify gone)
   - strategy: Agent-Probe
8. CSV export downloads a valid file
   - proven by: Phase 4 agent-probe (click, file downloads)
   - strategy: Agent-Probe
9. CORS allows `http://localhost:3000`, no browser CORS errors
   - proven by: Phase 2 hybrid gate (curl CORS check) + Phase 4 agent-probe (devtools)
   - strategy: Hybrid / Agent-Probe
10. Existing review-ui at `http://localhost:7842` still works after CORS change
    - proven by: Phase 4 agent-probe (visit URL)
    - strategy: Agent-Probe

---

## Resume and Execution Handoff

1. **Selected plan file path**: `process/features/frontend-dashboard/active/frontend-dashboard_19-06-26/frontend-dashboard_PLAN_19-06-26.md`

2. **Last completed phase or step**: None — plan just written; no phases complete.

3. **Validate-contract status**: Pending — vc-validate-agent writes this section before EXECUTE begins.

4. **Supporting context files loaded**:
   - `process/context/all-context.md` (repo structure, stack, CORS pattern)
   - `process/context/tests/all-tests.md` (no automated tests; agent-probe is the primary verification strategy)
   - `process/context/planning/all-planning.md` (COMPLEX plan calibration)
   - `server/server.js` (current CORS config — confirmed line 19 is the change target)
   - `server/routes/events.js` (GET /events query params, PATCH fields, DELETE path — confirmed all are available for frontend to consume)
   - `server/db/pool.js` (confirmed PostgreSQL, not SQLite — no schema.sql migration needed)

5. **Next step for a fresh agent picking up mid-execution**:
   - Confirm which phase is current from Phase Loop Progress checkboxes above
   - For Phase 1: run the scaffold command from repo root; document what the preset actually created (it may differ from expectations — record deviations)
   - For Phase 2: make the one-line CORS change to `server/server.js` line 19; restart server; run the curl CORS check
   - For Phase 3: implement components in order 3A → 3B → 3C → 3D → 3E → 3F → 3G; run TypeScript build check after each section
   - For Phase 4: both server (port 7842) and dashboard (port 3000) must be running; go through all 8 smoke-check steps in the checklist
   - If scaffold fails (preset not found): use the fallback procedure in §Monorepo Integration Notes

---

## Validate Contract

Status: CONDITIONAL
Date: 19-06-26
date: 2026-06-19
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 2/7 signals (S3 multi-phase, S7 15+ files); dominant signal is sequential phase dependency — scaffold must precede build which must precede smoke test.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| C1 | pnpm install exits 0 at repo root | Hybrid | `pnpm install` from repo root (precondition: pnpm installed globally) | A |
| C2 | Next.js dev server starts on port 3000 | Hybrid | `pnpm run dev` starts cleanly; http://localhost:3000 responds | A |
| C3 | TypeScript build exits 0 in apps/dashboard/ | Hybrid | `cd apps/dashboard && pnpm build` exits 0 | A |
| C4 | CORS header returned for localhost:3000 | Hybrid | `curl -v -H "Origin: http://localhost:3000" http://localhost:7842/events 2>&1` grep for `Access-Control-Allow-Origin: http://localhost:3000` (precondition: server running) | A |
| C5 | Existing CORS origins preserved (no regression) | Hybrid | `curl -v -H "Origin: http://localhost:7842" http://localhost:7842/events 2>&1` grep for allow header (precondition: server running) | A |
| C6 | types.ts and api.ts exist with correct content | Agent-Probe | Agent reads apps/dashboard/src/lib/types.ts (verify 17 Event fields including source and enriched_at) and apps/dashboard/src/lib/api.ts (verify fetchEvents, patchEvent, deleteEvent, exportCSVUrl are exported) | A |
| C7 | All 4 dashboard sections render with live data | Agent-Probe | Browser: open http://localhost:3000 with server running; verify stats cards, events table, all 6 charts, and recent feed all render with data (not infinite loading state) | A |
| C8 | PATCH and DELETE round-trips work end-to-end | Agent-Probe | Edit a notes field, blur, refresh page — note persists; delete a row, refresh — row is gone | A |
| C9 | review-ui regression check | Agent-Probe | Visit http://localhost:7842 after CORS change — static review table renders correctly | A |
| KG1 | Browser automation / Playwright E2E | Known-Gap | — | D |
| KG2 | Concurrent edit conflict handling | Known-Gap | — | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: Known-Gap rows (KG1, KG2) are named residuals via gap-resolution D, not a proving strategy.

Legacy line form (retained for compatibility):
- CORS fix: hybrid: curl CORS check for localhost:3000 origin
- scaffold/build: hybrid: pnpm install && pnpm run dev && pnpm build in apps/dashboard
- types.ts/api.ts content: agent-probe: read files and verify fields/exports
- browser smoke: agent-probe: open http://localhost:3000, verify all 4 sections render with live data
- PATCH/DELETE round-trips: agent-probe: edit + delete + refresh verification
- review-ui regression: agent-probe: visit http://localhost:7842
- browser E2E / Playwright: known-gap: documented as NEW PLAN REQUIRED

Dimension findings:
- Infra fit: CONCERN — CORS edit target confirmed present; line number reference in checklist is 1 off (line 18 not 19, advisory only); pnpm global prereq not auto-verifiable
- Test coverage: PASS — all behaviors have Hybrid or Agent-Probe coverage; vacuous-green ban satisfied; no behavior rests silently on Known-Gap
- Breaking changes: CONCERN — all-context.md incorrectly documents DB as SQLite; actual DB is PostgreSQL (pool.js, schema.pg.sql); Event type in plan is correct; CORS change is additive
- Security surface: PASS — CORS addition is localhost-only; no auth/billing/secrets/trust-boundary surfaces touched

Section feasibility findings:
- Phase 1 (Monorepo Scaffold): CONCERN — shadcn preset b4akxp3DUI is unknown/unverifiable; cascade risk if generated structure differs; fallback documented in plan
- Phase 2 (CORS Fix): PASS — edit target confirmed in server.js lines 18-24; curl check catches typos immediately
- Phase 3 (Dashboard Build): CONCERN — TanStack Query v4 vs v5 API syntax risk; chart components need explicit 'use client' directives; all paths depend on Phase 1 scaffold structure
- Phase 4 (Integration Smoke Check): PASS — all steps are agent-probe; no edit targets; note DB may have only facebook-source data

Open gaps:
- TanStack Query v4 vs v5 syntax: after Phase 1, check installed version and adapt hook syntax if v5
- shadcn preset b4akxp3DUI unknown: document actual generated structure post-scaffold; use fallback if preset fails
- chart components missing explicit 'use client' directive in plan text: execute-agent must add to all Recharts files
- all-context.md stale SQLite reference: flag for UPDATE PROCESS update
- KG1: browser automation / Playwright E2E — known-gap: documented as NEW PLAN REQUIRED
- KG2: concurrent edit conflicts — known-gap: out of scope for this plan

Execute-agent instructions (accepted concerns):
- E1: After Phase 1 scaffold, check apps/dashboard/package.json for @tanstack/react-query version. If v5+: use object-style useQuery({queryKey: ['events', params], queryFn: () => fetchEvents(params)}). If v4: use array-style useQuery(['events', params], () => fetchEvents(params)). Apply consistently to all hook definitions.
- E2: After Phase 1 scaffold, document actual generated directory structure. Verify apps/dashboard/src/app/page.tsx path exists. If structure differs, update all Phase 3 file paths before writing code.
- E3: Add 'use client' directive to the top of every chart component file (EventsOverTime.tsx, SourceSplit.tsx, TopCities.tsx, TopOrganizers.tsx, TopSearchTerms.tsx, RespondentDistribution.tsx) and RecentFeed.tsx.
- E4: When editing server/server.js (Phase 2), use text match for the CORS condition string, NOT line 19 (actual CORS callback starts at line 18).
- E5: After UPDATE PROCESS: update all-context.md to replace SQLite/better-sqlite3 references with PostgreSQL/pg — confirmed context drift.
- E6: All UI components must use shadcn/ui primitives. Before writing any component, run `npx shadcn@latest add <component>` for each needed primitive (Card, Table, Button, Input, Select, Badge, Skeleton, Separator, Dialog, etc.). For charts, use shadcn chart primitives (`npx shadcn@latest add chart`) which wrap Recharts — prefer `<ChartContainer>` + `<ChartTooltip>` over raw Recharts JSX. Never write a plain `<div>` layout where a shadcn component exists.

What this coverage does NOT prove:
- C1 (pnpm install): does not prove dashboard renders or all shadcn components are available
- C2 (Next.js dev): does not prove data fetching works or CORS is configured
- C3 (TypeScript build): does not prove runtime behavior or API shape correctness
- C4 (CORS localhost:3000): does not prove chrome-extension:// origin still works
- C5 (CORS localhost:7842): does not prove chrome-extension:// CORS still works
- C6 (types.ts/api.ts): does not prove functions work at runtime or types are used correctly in components
- C7 (browser smoke): does not prove computed stats values are mathematically correct or filter sends correct query params
- C8 (PATCH/DELETE): does not prove concurrent edit conflict handling
- C9 (review-ui): does not prove all review-ui functions — only page loads
- KG1/KG2: not verified — known gaps, backlog

Gate: CONDITIONAL (concerns noted, accepted by session — all are execute-time detectable with documented mitigations; 0 unresolved FAILs)
Accepted by: session (autonomous — 0 FAILs; 4 CONCERNs + 1 user requirement with documented execute-agent instructions E1-E6; CONDITIONAL is appropriate terminal state)

---

## Autonomous Goal Block

SESSION GOAL: Build Turbo monorepo frontend dashboard for fb-events-tool — Next.js/shadcn dashboard consuming existing Express/PostgreSQL backend, rendering stats cards, filterable paginated table, charts, and recent feed
Charter + umbrella plan: N/A — single plan
Autonomy: proceed without pausing on reversible decisions; surface only hard stops
Hard stop conditions / safety constraints:
- Stop if CORS change requires removing any existing allowed origin (must be additive only)
- Stop if shadcn preset b4akxp3DUI failure produces architecture incompatible with the plan's fallback procedure
- Stop if TanStack Query version mismatch cannot be resolved by API syntax swap (E1 instruction)
- Stop before any schema migration or destructive DB mutation (none in this plan)
Next phase: EXECUTE — spawn vc-execute-agent (opus) with plan path process/features/frontend-dashboard/active/frontend-dashboard_19-06-26/frontend-dashboard_PLAN_19-06-26.md; run phases 1 then 2 then 3 then 4 sequentially
Validate contract: inline in plan (## Validate Contract section)
Execute start: Phase 1 hybrid: `pnpm install` from repo root | Phase 2 hybrid: curl CORS check for localhost:3000 | Phase 3 hybrid: `cd apps/dashboard && pnpm build` | Phase 3-4 agent-probe: browser smoke at http://localhost:3000 | high-risk pack: no

## Phase Completion Rules

A phase is complete (checkmark ✅) only when ALL of the following are true:

1. **CODE DONE** — all checklist items for that phase are implemented
2. **GATE PASSED** — the phase exit gate (as stated in the Phase Structure table) passes:
   - Phase 1: `pnpm install` exits 0 AND `pnpm run dev` starts Next.js on port 3000
   - Phase 2: curl CORS check returns `Access-Control-Allow-Origin: http://localhost:3000`
   - Phase 3: TypeScript build (`pnpm build`) exits 0 in `apps/dashboard/` AND browser renders all 4 sections
   - Phase 4: all 8 smoke-check steps (35-42) pass in a live browser session
3. **VERIFIED** — the gate was confirmed by an agent-probe or hybrid run (not just self-reported by execute-agent); the phase report records the evidence

**Status vocabulary:**
- `CODE DONE` — code is written but gates have not been run
- `GATE PASSED` — exit gate ran and passed; no VERIFIED yet (no independent confirmation)
- `VERIFIED` — phase gate was independently confirmed; phase is genuinely complete
- `BLOCKED` — phase cannot proceed; blocker documented in phase report

A phase MUST NOT be marked VERIFIED based solely on execute-agent self-report. The EVL step (Step 6 of the inner loop) provides the independent confirmation required for VERIFIED status.
