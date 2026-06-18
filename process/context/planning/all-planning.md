---
name: context:all-planning
description: "plan-shape calibration and planning conventions — the planning group entrypoint/router"
keywords: planning, plan, spec, simple, complex, prd, generate-plan
related: []
date: 18-06-26
---

# Planning Context

This file is the canonical planning context entrypoint for fb-events-tool.

Use it after `process/context/all-context.md` when the task needs plan-shape calibration,
planning conventions, or implementation-plan examples.

## Scope

This group covers:

- example plan shapes (SIMPLE vs COMPLEX calibration)
- durable planning references

It does not cover:

- active implementation plans (those belong in `process/general-plans/active/`)
- feature reports or backlog items

## Read When

Read this entrypoint when:

- creating a new plan with `vc-generate-plan`
- checking whether work should be SIMPLE or COMPLEX
- comparing an active plan against the repo's example plan shapes

## Quick Routing

- use `.claude/skills/vc-generate-plan/references/example-simple-prd.md` to calibrate a one-session plan
- use `.claude/skills/vc-generate-plan/references/example-complex-prd.md` to calibrate a complex or multi-phase plan

## Source Paths

- `.claude/skills/vc-generate-plan/references/example-simple-prd.md`
- `.claude/skills/vc-generate-plan/references/example-complex-prd.md`

## Update Triggers

Update this group when:

- the plan artifact contract changes
- `vc-generate-plan` expects different plan sections or statuses
- the example plan shapes move, split, or become stale

## Project-Specific Planning Notes

**Most work in this repo is SIMPLE plan territory.** The codebase is small (one server, one extension, one static UI) with no build pipeline or type system. A single EXECUTE session can usually cover a full feature.

Use COMPLEX / multi-phase plans when:
- adding cross-platform support (macOS + Windows + Linux install scripts)
- schema migrations that require data backfill
- extracting a new data field that requires changes to both content.js (extension) AND server routes AND review-ui

**No tests = be conservative.** Plans should include explicit manual verification steps (see `process/context/tests/all-tests.md`) since there is no automated test suite to catch regressions.

**Vanilla JS constraint.** Plans must not propose introducing TypeScript, React, Vue, or any bundler. If a plan dependency analysis suggests a framework, flag it for user review before proceeding.
