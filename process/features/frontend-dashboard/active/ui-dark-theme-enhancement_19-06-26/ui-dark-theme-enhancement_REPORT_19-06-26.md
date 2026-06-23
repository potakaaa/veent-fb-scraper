---
phase: ui-dark-theme-enhancement
date: 2026-06-19
status: COMPLETE
feature: frontend-dashboard
plan: process/features/frontend-dashboard/active/ui-dark-theme-enhancement_19-06-26/ui-dark-theme-enhancement_PLAN_19-06-26.md
---

# UI Dark-Theme Enhancement — Execute Report

**TL;DR:** All 28 checklist steps implemented across 4 edit files. `pnpm --filter web typecheck` exits 0. Zero deviations from the plan checklist. 3 verify-only files needed no edits (already used CSS vars). Plan is ready for UPDATE PROCESS archival.

## What Was Done

| Step | Checklist items | File | Result |
|---|---|---|---|
| 1 | 1-2 | `apps/web/src/routes/__root.tsx` | Added `className="dark"` to `<html>` (AC1) |
| 2 | 3-8 | `packages/ui/src/styles/globals.css` | `.dark {}` `--primary` → `oklch(0.55 0.24 264)` (AC2); 5 chart vars → rose palette (AC3). `:root {}` and `@theme inline` untouched |
| 3 | 7-17 | `apps/web/src/routes/index.tsx` | Nav border → `border-border`, Live pill → `bg-muted text-muted-foreground`; header → `bg-card border-b border-border`, subtitle + Updated pill → muted; 3 section h2s → uppercase label style (AC5); feed + table containers → `bg-card border border-border` (AC8) |
| 4 | 18-26 | `apps/web/src/components/stats/StatsCards.tsx` | All 4 cards `border-l-4` → `border-t-2`; cards 1/3/4 titles → `text-4xl font-heading` (AC4); card 2 → `text-3xl`; progress bar → `bg-primary` (AC7) |
| 5 | 27-28 | charts (verify only) | `EventsOverTime.tsx` confirmed `color: "var(--chart-1)"`; `SourceSplit.tsx` confirmed `SLICE_COLORS` all `var(--chart-N)`. No hardcoded hex. No edits |
| 6 | 29-30 | typecheck gate | `pnpm --filter web typecheck` → EXIT 0 (AC9) |

`RecentFeed.tsx` (plan body Step 6) confirmed no outer wrapper needed — wrapper lives in `index.tsx`. No edit.

## What Was Skipped or Deferred

Nothing skipped. The plan body's Step 4 item 21 (`ring-1 ring-border` on cards) is NOT in the authoritative Task checklist (items 18-26) — Task checklist followed exactly, so `ring-1 ring-border` was not added. This is checklist-faithful, not a deviation. (See Plan Deviations note below.)

## Test Gate Outcomes

| Gate | Tier | Command | Result |
|---|---|---|---|
| TypeScript | Hybrid | `pnpm --filter web typecheck` | EXIT 0 — green, run by agent |

Visual ACs (AC6 rose bars, AC7 blue progress bar live-render) are Agent-Probe tier requiring a running server — file-read evidence confirms the class/CSS-var changes that produce them. No server started (not required by the gate; cosmetic CSS resolves at runtime).

## Plan Deviations

None against the Task-provided checklist (items 1-30). One reconciliation note: the plan *body* (`PLAN.md` Step 4) lists `ring-1 ring-border` as item 21, but the Task handoff's condensed checklist (items 18-26) omits it. Executed per the authoritative Task checklist. If the `ring-1 ring-border` inset look is wanted, it is a one-line follow-up per card.

## Test Infra Gaps Found

No new gaps. Repo has zero automated tests (documented in `process/context/tests/all-tests.md`); typecheck is the only mechanical gate. Backlog stub already in plan: Playwright visual-regression spec at `apps/web/tests/visual-regression.spec.ts` would auto-cover AC1/AC4/AC5/AC6/AC7/AC8 (KG1).

## Closeout Packet

- **Selected plan path:** `process/features/frontend-dashboard/active/ui-dark-theme-enhancement_19-06-26/ui-dark-theme-enhancement_PLAN_19-06-26.md`
- **Finished:** all 28 steps; 4 files edited, 3 verified clean.
- **Verified:** `pnpm --filter web typecheck` EXIT 0 (run by agent). `globals.css` diff confirms `:root {}` untouched. AC1-AC5, AC8, AC9, AC10 confirmed by file read. AC6/AC7 visual-render unverified (no server).
- **Still unverified:** live browser render of rose bars (AC6) and blue progress bar (AC7) — Agent-Probe, server-dependent.
- **Cleanup remaining:** UPDATE PROCESS archival + context capture. No code cleanup needed.
- **Best next state:** Ready for UPDATE PROCESS archival.

## Forward Preview

### Test Infra Found
Zero automated tests; `tsc --noEmit` is the only gate. Playwright visual-regression remains the highest-value future add (backlog).

### Blast Radius Changes
Confined to: `apps/web/src/routes/__root.tsx`, `apps/web/src/routes/index.tsx`, `apps/web/src/components/stats/StatsCards.tsx`, `packages/ui/src/styles/globals.css`. No schema/auth/API/billing surface. `packages/ui` CSS-var value change is consumed by every app importing `@workspace/ui/globals.css` — only `.dark {}` values changed, so light mode (`:root`) is byte-identical.

### Commands to Stay Green
`pnpm --filter web typecheck`

### Dependency Changes
None. `apps/web/package.json` and `packages/ui/package.json` unchanged (AC10).
