---
phase: 14-default-flip-dogfood-validation
plan: 01
subsystem: config
tags: [config, parallelization, brownfield-flip, install-template, json]

# Dependency graph
requires:
  - phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd
    provides: workspace.parallel.{dispatch,fan-in} SDK verbs that loadConfig(parallelization) gates
  - phase: 13-ci-parallel-path-lane-lint-close-gate
    provides: CI parallel-path lane validates the verbs in real CI before this user-observable flip
provides:
  - Install template (get-shit-done/templates/config.json) declares parallelization=true as a flat boolean
  - This repo's .planning/config.json declares parallelization=true (was false), unblocking CONFIG-02 dispatch
  - In-the-wild "explicit false is preserved" invariant moves to test fixtures (handed to Plan 14-02)
affects: [14-02-CONFIG-02-pre-flight-refusal, 14-03-dogfood-jj-cell, 14-04-dogfood-git-cell, 14-05-dogfood-metrics-recovery]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Install-template flatten matches SDK schema (sdk/src/config.ts:71): boolean, not nested object"
    - "loadConfig defaults-merge as sole greenfield/brownfield boundary mechanism for parallelization (D-05 — no Phase-6-style sticky-config boundary)"

key-files:
  created: []
  modified:
    - get-shit-done/templates/config.json
    - .planning/config.json

key-decisions:
  - "D-04 honored: template parallelization block flattened from nested 6-key object (lines 31-38) to flat boolean true; surrounding keys untouched"
  - "D-03 honored: this repo's .planning/config.json parallelization flipped permanently from false to true; trade-off accepted (in-the-wild invariant fixture moves to Plan 02)"
  - "D-05 honored: NO greenfield/brownfield boundary added — loadConfig defaults-merge is the sole mechanism (config-wins-over-default; missing-key = default true; explicit false in existing repos still wins)"
  - "Template JSON retains its own 2-space indentation (file-local formatting wins over user's global tabs preference, per phase context guidance for JSON files)"

patterns-established:
  - "Install-template flatten before SDK-schema mismatch: when a template inherits a nested-object shape from upstream and the SDK loader declares a flat boolean, flatten the template (don't add SDK-side normalization); the only programmatic consumer (feat-3167 test on template.ship.pr_body_sections) is preserved"
  - "Permanent brownfield flip with test-fixture mitigation: when an in-the-wild config-state invariant fixture needs to be lost to unblock its own dogfood pre-step, move the invariant to a contract test fixture; document the trade-off in the deviating commit"

requirements-completed: [CONFIG-01]

# Metrics
duration: 2min
completed: 2026-05-23
---

# Phase 14 Plan 01: Default flip (template + this-repo) Summary

**Install template parallelization block flattened to flat boolean `true` (was nested 6-key object); this repo's `.planning/config.json` flipped permanently from `false` to `true` so Phase 14's dogfood (Plan 05) can dispatch.**

## Performance

- **Duration:** 2 min (126s)
- **Started:** 2026-05-23T23:32:19Z
- **Completed:** 2026-05-23T23:34:25Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `get-shit-done/templates/config.json` flattened: the 6-key nested `parallelization` block at lines 31-38 (`{enabled, plan_level, task_level, skip_checkpoints, max_concurrent_agents, min_plans_for_parallel}`) collapsed to the flat boolean literal `"parallelization": true,`. Template now matches the SDK schema (`sdk/src/config.ts:71` declares `parallelization: boolean`) and CJS default (`get-shit-done/bin/lib/core.cjs:311`).
- `.planning/config.json` flipped permanently: line 4 changed from `"parallelization": false,` to `"parallelization": true,`. `loadConfig`'s defaults-merge will now return `true` for this repo on every `gsd-sdk query` invocation; the CONFIG-02 pre-flight envelope (Plan 02) will no longer refuse dispatch against this repo.
- `feat-3167` template-parsing test stays green (6/6) — the only programmatic consumer of `get-shit-done/templates/config.json` is preserved across the flatten because the test asserts only on `template.ship.pr_body_sections`, which was untouched.
- Both files remain valid JSON; `node -e "JSON.parse(...)"` exits 0 for both.

## Task Commits

Each task was committed atomically:

1. **Task 1: Flatten template parallelization block (D-04)** — change `xxktruqv` / commit `884d76e0` (feat)
2. **Task 2: Flip this-repo parallelization to true (D-03)** — change `usrlrvnu` / commit `d18d385a` (feat)

_Project rule `project_no_raw_git`: change IDs (jj change_id) are recorded primary; commit IDs included for cross-backend convenience but not load-bearing per Unified Revision Model._

**Plan metadata commit:** to follow (this SUMMARY commit will pick up `xxktruqv`/`usrlrvnu` ancestors plus STATE.md + ROADMAP.md updates).

## Files Created/Modified

- `get-shit-done/templates/config.json` — install template: nested 6-key parallelization block (lines 31-38) collapsed to flat boolean `true`. All surrounding top-level keys (`mode`, `granularity`, `workflow`, `ship`, `planning`, `gates`, `safety`, `hooks`, `project_code`, `agent_skills`, `claude_md_path`) untouched.
- `.planning/config.json` — this repo's runtime: line 4 `"parallelization": false,` → `"parallelization": true,`. All other top-level keys preserved; manual diff confirms only line 4 changed.

## Decisions Made

- **Template indentation:** kept the file's existing 2-space JSON indentation rather than converting to tabs per the user's global preference. JSON file formatting wins over the user's global `code style: always use tabs` rule because the rest of the file already follows 2-space convention; phase context explicitly called this out.
- **No commit IDs in commit messages:** per `project_no_raw_git` memory and `project_unified_revision_model` invariant, jj change IDs are the canonical revision identity for cross-backend surface. Commit messages reference D-04/D-03/D-05 by decision number rather than embedding commit-hashes.
- **STATE.md left for state_updates step:** the `.planning/STATE.md` working-copy delta (pre-existing from the orchestrator's phase 13→14 transition write) was excluded from Task 2's commit. Task 2's commit scoped to `.planning/config.json` only via `gsd-sdk query commit --files`. STATE.md is handled by the plan-level state_updates step (next).

## Deviations from Plan

None — plan executed exactly as written.

Both tasks completed exactly as specified by their `<action>` blocks and met every `<acceptance_criteria>` check.

Three optional source-grep acceptance checks deserve highlighting:

| Check | Expected | Observed |
|-------|----------|----------|
| Task 1: `grep -c '"parallelization": true,' templates/config.json` | 1 | 1 |
| Task 1: `grep -c '"enabled": true,' templates/config.json` | 0 | 0 |
| Task 1: `grep -c 'max_concurrent_agents' templates/config.json` | 0 | 0 |
| Task 1: `grep -c '"pr_body_sections"' templates/config.json` | 1 | 1 |
| Task 1: `node --test tests/feat-3167-ship-pr-body-sections.test.cjs` | exit 0 | exit 0 (6/6 pass) |
| Task 2: `grep -c '"parallelization": true,' .planning/config.json` | 1 | 1 |
| Task 2: `grep -c '"parallelization": false,' .planning/config.json` | 0 | 0 |
| Task 2: `node -e "...parallelization)"` prints | `true` | `true` |

## Issues Encountered

None — both edits were single-token / single-block replacements with deterministic acceptance criteria.

## User Setup Required

None — no external service configuration required. The flip is purely a defaults-level change; existing repos with explicit `parallelization: false` keep `false` via `loadConfig`'s defaults-merge (D-05).

## Self-Check

Verified all claimed artifacts exist and both task commits are reachable from `@-`:

- FOUND: `get-shit-done/templates/config.json` (modified with `parallelization: true` as flat boolean; nested keys absent)
- FOUND: `.planning/config.json` (modified with `parallelization: true` on line 4)
- FOUND: change `xxktruqv` / commit `884d76e0` — feat(14-01): flatten template parallelization to flat boolean
- FOUND: change `usrlrvnu` / commit `d18d385a` — feat(14-01): flip this-repo parallelization to true (D-03)

## Self-Check: PASSED

## Next Phase Readiness

Plan 14-01 unblocks downstream Plan 14-02 (CONFIG-02 pre-flight refusal in `sdk/src/query/workspace-parallel-dispatch.ts`) and the dogfood-execution plans (14-03 jj cell, 14-04 git cell, 14-05 metrics + recovery). The two D-03 mitigation contract-test fixture cases land in Plan 14-02 (`cmd-parallel-{jj,git}.test.ts`) — these are the new home of the "explicit `false` is preserved" CONFIG-01 invariant that this plan retired from in-the-wild.

No blockers, no concerns. Both files remain valid JSON and `feat-3167` stays green. The brownfield flip is permanent (no rollback intent per D-03); the install-template flatten is upstream-rebase-friendly (predictable single-line "take ours" conflict per D-04 rationale).

---
*Phase: 14-default-flip-dogfood-validation*
*Completed: 2026-05-23*
