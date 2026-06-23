---
name: plan:ui-dark-theme-enhancement
description: "Dark-theme UI polish for apps/web dashboard — electric-blue primary, rose chart bars, hero-number stats cards, uppercase section labels, sharp card borders"
date: 19-06-26
feature: frontend-dashboard
phase: "PLAN"
---

# UI Dark-Theme Enhancement — Implementation Plan

**Date**: 19-06-26
**Complexity**: SIMPLE
**Status**: PLANNED
**Parent plan**: `process/features/frontend-dashboard/active/frontend-dashboard_19-06-26/frontend-dashboard_PLAN_19-06-26.md`

---

## Session Goal

Polish the `apps/web` TanStack Start dashboard to a modern dark financial-dashboard aesthetic: near-black background always on, electric blue for CTAs and progress bars, rose/pink chart bars, large hero-number stats cards, uppercase letter-spaced section labels, and sharp subtle-border cards. No new dependencies. No TypeScript errors.

---

## Overview

The Phase 3 dashboard build is code-complete. The dark-mode CSS variables are already defined but the dark class is never applied to `<html>` and several visual design details need tuning: chart colors are all orange/red instead of rose+blue, stat-card numbers are under-sized, section headers are plain h2s, and the feed/table containers use `bg-muted/30` instead of the card look. This plan targets 8 files only — CSS variables, root layout, main page, three component files — with strictly cosmetic changes.

**Key constraints:**
- Modify only existing files (no new files, no new components)
- No new npm packages
- All color changes through CSS variables — no hardcoded hex in TSX
- Tailwind CSS v4 only — no v3 plugin syntax
- `pnpm --filter web typecheck` must pass

---

## Touchpoints

| File | Change type |
|---|---|
| `packages/ui/src/styles/globals.css` | Update `.dark {}` CSS variables (primary blue, chart-1..5 rose palette) |
| `apps/web/src/routes/__root.tsx` | Add `className="dark"` to `<html>` element in `RootDocument` |
| `apps/web/src/routes/index.tsx` | Nav border-b, header simplification, section header style, feed/table container style |
| `apps/web/src/components/stats/StatsCards.tsx` | Hero number size, font-heading on number, top-border style, progress bar color, icon position |
| `apps/web/src/components/charts/EventsOverTime.tsx` | Verify chartConfig uses `var(--chart-1)` (already does — confirm no hardcoded hex) |
| `apps/web/src/components/charts/SourceSplit.tsx` | Confirm colors use CSS vars |
| `apps/web/src/components/feed/RecentFeed.tsx` | Container uses card look (border border-border) |
| `apps/web/src/components/table/EventsTableFilters.tsx` | No structural change — inherits dark mode from CSS vars |

---

## Public Contracts

No public contracts change. This plan is purely cosmetic:
- No API surface changes
- No TypeScript interface changes
- No new exports
- No schema or data changes
- CSS variable names are unchanged (only their values change inside `.dark {}`)

---

## Blast Radius

| Package/Path | Risk | Notes |
|---|---|---|
| `packages/ui/src/styles/globals.css` | LOW | Value changes inside `.dark {}` block only; `:root` block and `@theme inline` untouched |
| `apps/web/src/routes/__root.tsx` | LOW | One attribute addition `className="dark"` to `<html>` |
| `apps/web/src/routes/index.tsx` | LOW | Tailwind class string changes; no logic changes |
| `apps/web/src/components/stats/StatsCards.tsx` | LOW | Tailwind class changes + progress bar color ref; no logic changes |
| `apps/web/src/components/charts/EventsOverTime.tsx` | LOW | Verify only — no change expected |
| `apps/web/src/components/charts/SourceSplit.tsx` | LOW | Verify only — no change expected |
| `apps/web/src/components/feed/RecentFeed.tsx` | LOW | Container wrapper class change only |
| `apps/web/src/components/table/EventsTableFilters.tsx` | LOW | Inherits dark mode — verify only |

**Risk class**: LOW. No schema, auth, API, or billing surfaces. No logic or data-flow changes. Purely Tailwind class strings and CSS variable values.

**Files outside blast radius (untouched):**
- `apps/web/src/components/table/EventsTable.tsx` — inherits dark mode via CSS vars automatically
- All chart components except EventsOverTime and SourceSplit — verify-only
- All lib/, hooks/, router files

---

## Implementation Checklist

### Step 1 — Enable dark mode globally (`__root.tsx`)

1. Open `apps/web/src/routes/__root.tsx`.
2. In `RootDocument`, change the `<html lang="en">` opening tag to `<html lang="en" className="dark">`.
3. No other change to this file.

### Step 2 — Update CSS variables for dark mode (`globals.css`)

4. Open `packages/ui/src/styles/globals.css`.
5. Inside the `.dark {}` block, update `--primary` from `oklch(0.424 0.199 265.638)` to `oklch(0.55 0.24 264)` (vivid electric blue — more saturated than the existing value).
6. Inside the `.dark {}` block, replace all 5 chart color variables:
   - `--chart-1: oklch(0.65 0.26 10)` (rose-500 equivalent — main bar color)
   - `--chart-2: oklch(0.55 0.24 264)` (blue — matches updated primary; for source-split secondary)
   - `--chart-3: oklch(0.72 0.18 10)` (lighter rose)
   - `--chart-4: oklch(0.45 0.22 10)` (darker rose)
   - `--chart-5: oklch(0.80 0.14 10)` (very light rose)
7. Do NOT touch the `:root {}` block chart values or any other `.dark {}` values.
8. Do NOT touch `@theme inline` — font mappings and radius values are already correct.

### Step 3 — Nav and header polish (`index.tsx`)

9. Open `apps/web/src/routes/index.tsx`.
10. Nav bar: add `border-b border-border` to the `<nav>` className (keeping the existing classes). Current: `bg-foreground text-background sticky top-0 z-50 border-b border-white/10` — change the border to `border-b border-border` (uses the CSS var so it respects dark mode correctly).
11. Header band: replace `bg-foreground text-background border-b border-white/10` header with a simpler card-style band. Change the `<header>` className to `bg-card border-b border-border`. Change the `<h1>` text color and the `<p>` color to use standard foreground classes: h1 keeps `font-heading text-3xl font-bold tracking-tight` (inherits foreground color now from card context). The subtitle `<p>` changes from `text-background/60` to `text-muted-foreground`.
12. The "Updated" pill: change `bg-background/10` to `bg-muted text-muted-foreground`.
13. Section headers: update both `<h2>` elements (Analytics and Recently Collected) from `font-heading text-xl font-semibold` to `text-xs font-semibold uppercase tracking-widest text-muted-foreground`. This gives the "ANALYTICS" / "RECENTLY COLLECTED" all-caps label style from the reference screenshot. The divider line `<div className="bg-border h-px flex-1" />` stays as-is.
14. Section header for "All Events": same treatment — change to `text-xs font-semibold uppercase tracking-widest text-muted-foreground`.
15. Feed container: change `bg-muted/30 rounded-xl p-6` to `bg-card rounded-xl border border-border p-6`.
16. Table section container: same — change `bg-muted/30 rounded-xl p-6` to `bg-card rounded-xl border border-border p-6`.

### Step 4 — Stats cards hero-number style (`StatsCards.tsx`)

17. Open `apps/web/src/components/stats/StatsCards.tsx`.
18. Remove the left-border colored classes from all four cards. Currently cards use `border-l-4 border-l-[var(--chart-N)]` or `border-l-primary`. Replace with a top-border accent pattern: `border-t-2 border-t-[var(--chart-1)]` for card 1 (Total Events), `border-t-2 border-t-[var(--chart-2)]` for card 2 (By Source), `border-t-2 border-t-[var(--chart-3)]` for card 3 (Enriched Events), `border-t-2 border-t-primary` for card 4 (High Interest). Keep `relative overflow-hidden` on each.
19. Upgrade the hero number `<CardTitle>` from `text-2xl` to `text-4xl` on cards 1, 3, and 4 (single-number cards). Card 2 (By Source) shows two numbers — keep at `text-3xl` to avoid overflow.
20. Add `font-heading` to each `<CardTitle>` class that shows the primary hero number (cards 1, 3, 4). Card 2 title may keep default since it has inline `<span>` for "Facebook" annotation.
21. Add `ring-1 ring-border` to each card's className for the sharper border look (in addition to existing border from shadcn Card).
22. Progress bar on Enriched card: change `bg-[var(--chart-1)]` to `bg-primary` so it tracks the updated primary blue.
23. Icon positioning: icons are currently in the CardHeader flex row (top-right via `flex items-start justify-between`). This is already correct per reference design. No change needed.

### Step 5 — Chart bar color verification (`EventsOverTime.tsx`, `SourceSplit.tsx`)

24. Open `apps/web/src/components/charts/EventsOverTime.tsx`. Verify the chartConfig uses `color: "var(--chart-1)"`. The `<Bar fill="var(--color-count)">` already uses the CSS var chain: `chartConfig.count.color = var(--chart-1)` → shadcn ChartStyle sets `--color-count = var(--chart-1)` → bar fill resolves. No code change needed — the CSS variable update in Step 2 automatically makes bars rose.
25. Open `apps/web/src/components/charts/SourceSplit.tsx`. Read the file and confirm chart data entries reference `var(--chart-1)` and `var(--chart-2)` (or equivalent CSS var names). If any hardcoded hex colors are present, replace them with `var(--chart-N)` references. If all already use CSS vars, no change needed.

### Step 6 — Feed container card style (`RecentFeed.tsx`)

26. Open `apps/web/src/components/feed/RecentFeed.tsx`. The component itself does not have an outer wrapper — the wrapper is in `index.tsx` (handled in Step 3). Verify individual `<Card>` elements inside use the standard shadcn Card component (they do — no change needed). No change to this file.

### Step 7 — Final typecheck

27. Run `pnpm --filter web typecheck` from the repo root. Must exit 0 with no errors.
28. If type errors occur: investigate. Common causes — `className` type mismatches (not expected since Tailwind classes are strings), or `font-heading` being an unrecognized class. The `font-heading` class is mapped via `@theme inline { --font-heading: 'Merriweather Variable', serif }` and used via the Tailwind v4 `font-heading` utility — it should resolve correctly.

---

## Acceptance Criteria

| # | Criterion | Proven by | Strategy |
|---|---|---|---|
| AC1 | `<html>` element has `dark` class — dark mode active globally | Agent-Probe: read `__root.tsx`, visually confirm dark background in browser | Agent-Probe |
| AC2 | `--primary` is vivid electric blue (`oklch(0.55 0.24 264)`) in `.dark {}` | Agent-Probe: read `globals.css`, verify value | Agent-Probe |
| AC3 | `--chart-1` through `--chart-5` are rose/pink palette in `.dark {}` | Agent-Probe: read `globals.css`, verify values | Agent-Probe |
| AC4 | Stats cards show hero numbers at `text-4xl` with `font-heading` | Agent-Probe: visual browser check or read `StatsCards.tsx` | Agent-Probe |
| AC5 | Section headers use uppercase-label style (xs, uppercase, tracking-widest, muted) | Agent-Probe: read `index.tsx`, verify h2 classes | Agent-Probe |
| AC6 | Chart bars render in rose color (EventsOverTime) | Agent-Probe: visual browser check with server running | Agent-Probe |
| AC7 | Progress bar on Enriched card is blue (primary) not red | Agent-Probe: visual browser check | Agent-Probe |
| AC8 | Feed and table section containers use `bg-card border border-border` card look | Agent-Probe: read `index.tsx`, verify class strings | Agent-Probe |
| AC9 | No TypeScript errors | Hybrid: `pnpm --filter web typecheck` exits 0 | Hybrid |
| AC10 | No new npm packages introduced | Agent-Probe: read `apps/web/package.json` and `packages/ui/package.json` | Agent-Probe |

---

## Dependencies

- Phase 3 of the parent plan must be code-complete (dashboard build done) — confirmed from Phase Loop Progress: Phase 3 Step 5 (EXECUTE) is done.
- No prerequisite server running needed for Steps 1-7 (typecheck is static). Server needed only for visual AC6/AC7 verification.
- No new package installations.

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `font-heading` Tailwind utility not recognized | LOW | It is mapped via `@theme inline { --font-heading }` in globals.css — Tailwind v4 `font-{key}` utilities are auto-generated from `@theme` keys. If it fails: use `font-['Merriweather_Variable',serif]` arbitrary value instead. |
| `oklch()` values render incorrectly in older browsers | LOW | oklch is already used throughout globals.css — this is an existing project choice; no mitigation needed. |
| Top-border on cards conflicts with shadcn Card existing border | LOW | shadcn Card has `border border-border` by default. Adding `border-t-2 border-t-[var(--chart-1)]` overrides just the top-border color via CSS specificity (Tailwind border-t-2 sets border-top-width; the color override applies only to top). Test visually — if the bottom/side borders also turn rose, use `[border-top-color:var(--chart-1)]` arbitrary value instead. |
| `ring-1 ring-border` on cards doubles up with existing Card border | LOW | This is intentional — the ring adds a subtle inset glow distinct from the outer border. If visually distracting, remove `ring-1 ring-border` from the checklist items. |
| Text colors in header band — `bg-card` instead of `bg-foreground` means text no longer inverts automatically | MEDIUM | When the header is changed from `bg-foreground text-background` to `bg-card`, text needs explicit foreground classes. Step 11 addresses this: h1 uses `text-foreground` (from card context), subtitle uses `text-muted-foreground`, pill uses `bg-muted text-muted-foreground`. Verify all text is readable after change. |

---

## Data Flow

No data flow changes. This plan only affects CSS class strings and CSS variable values. All data fetching, mutation, and computation logic is unchanged.

---

## Failure Modes

| Failure | Detection | Recovery |
|---|---|---|
| Dark background not visible after adding `className="dark"` | Visual check: browser still shows white background | Verify `@custom-variant dark (&:is(.dark *))` in globals.css — the variant must be `:is(.dark *)` not `:is(.dark)`. The `dark` class on `<html>` combined with `:is(.dark *)` applies to all descendants. |
| Chart bars remain orange/red (CSS vars not updated) | Visual check in browser | Verify `.dark {}` block — check for typo in `--chart-1` variable name. |
| TypeScript error on `className="dark"` | `pnpm typecheck` fails | `className` on `<html>` is a valid string prop in React — this should not error. If it does, check the TanStack Start `RootDocument` typing for `<html>`. |
| Section header text becomes invisible (muted on dark) | Visual check | `text-muted-foreground` in dark mode is `oklch(0.708 0 0)` — light gray, readable on the dark background. If invisible, use `text-foreground/60` instead. |

---

## Backwards Compatibility

- No backend changes.
- Dark mode is now forced on. If light mode was preferred by any user, this plan removes that option. Acceptable per the task requirements ("dark themed by default").
- The CORS fix and extension remain untouched.
- The parent plan's Phase 2 (CORS Fix) and Phase 4 (Integration Smoke) are unaffected.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm --filter web typecheck` exits 0 | Hybrid (precondition: pnpm installed) | AC9 — no TypeScript errors |
| Read `__root.tsx`: `<html className="dark">` present | Agent-Probe | AC1 — dark class on html |
| Read `globals.css`: `.dark {}` has `--primary: oklch(0.55 0.24 264)` | Agent-Probe | AC2 — electric blue primary |
| Read `globals.css`: `.dark {}` has `--chart-1: oklch(0.65 0.26 10)` | Agent-Probe | AC3 — rose chart palette |
| Read `StatsCards.tsx`: CardTitle has `text-4xl font-heading` | Agent-Probe | AC4 — hero number style |
| Read `index.tsx`: h2 has `uppercase tracking-widest text-muted-foreground` | Agent-Probe | AC5 — uppercase section labels |
| Browser visual: EventsOverTime bars are rose/pink | Agent-Probe (server running) | AC6 — rose chart bars |
| Browser visual: Enriched progress bar is blue | Agent-Probe (server running) | AC7 — blue progress bar |
| Read `index.tsx`: feed/table containers use `bg-card border border-border` | Agent-Probe | AC8 — card container style |
| Read `apps/web/package.json` + `packages/ui/package.json`: no new packages vs git baseline | Agent-Probe | AC10 — no new dependencies |

**Known-Gap residuals (not proving strategies):**
- KG1: Full visual regression via Playwright — backlog stub. No E2E test infra exists. Keep as backlog.
- KG2: Cross-browser rendering of oklch() colors — no automated cross-browser test. Acceptable given project's current test posture.

---

## Test Infra Improvement Notes

No new test infrastructure is identified as needed for this plan specifically. The repo has zero automated tests (documented in `process/context/tests/all-tests.md`). The only mechanical gate is the TypeScript checker.

Future improvement (backlog, not blocking this plan):
- Add a Playwright visual regression test for the dashboard landing page that captures a screenshot and compares against a baseline — would cover AC1, AC4, AC5, AC6, AC7, AC8 automatically. File would live at `apps/web/tests/visual-regression.spec.ts`.

---

## Resume and Execution Handoff

1. **Selected plan file path**: `process/features/frontend-dashboard/active/ui-dark-theme-enhancement_19-06-26/ui-dark-theme-enhancement_PLAN_19-06-26.md`

2. **Last completed phase or step**: None — plan written; no steps complete.

3. **Validate-contract status**: Pending — vc-validate-agent writes this section before EXECUTE.

4. **Supporting context files loaded**:
   - `process/context/all-context.md` (repo structure, stack)
   - `process/context/tests/all-tests.md` (zero automated tests; typecheck is the only mechanical gate)
   - `packages/ui/src/styles/globals.css` (current CSS variables — read in full)
   - `apps/web/src/routes/__root.tsx` (current RootDocument — dark class target)
   - `apps/web/src/routes/index.tsx` (current page layout — nav, header, sections)
   - `apps/web/src/components/stats/StatsCards.tsx` (current stats cards — hero number targets)
   - `apps/web/src/components/charts/EventsOverTime.tsx` (verify only)
   - `apps/web/src/components/feed/RecentFeed.tsx` (container verify only)

5. **Next step for a fresh agent picking up mid-execution**:
   - Work through steps 1-28 in the Implementation Checklist in order.
   - Steps 24-26 are verify-only — read the files and confirm CSS var usage; skip edits if already correct.
   - Step 27 (typecheck) is the mechanical gate — must pass before declaring done.
   - Step 28 is only triggered if typecheck fails — investigate per the failure mode guidance.
   - After typecheck passes, all AC criteria should be agent-probe-verifiable by reading the modified files (no server needed for file-read verification of AC1-AC5, AC8, AC10).

---


## Phase Completion Rules

This is a SIMPLE single-session plan. A step is complete when:

1. **CODE DONE** — the edit described in the checklist item is applied to the file
2. **GATE PASSED** — 
> web@0.0.1 typecheck /Volumes/Extreme_SSD/Work/Veent/FB Scraper/fb-events-tool/apps/web
> tsc --noEmit exits 0 (Step 27 is the mechanical gate)
3. **VERIFIED** — the gate was confirmed by the agent running the command, not self-reported

**Status vocabulary:**
-  — edits applied but typecheck not yet run
-  — typecheck exits 0; visual checks still pending
-  — typecheck green AND agent-probe acceptance criteria confirmed

The plan is complete (VERIFIED) when all 28 checklist steps are done AND typecheck passes AND AC1-AC10 are confirmed via agent-probe read of modified files.

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
