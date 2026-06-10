---
phase: 18-tactical-cleanup-test-flake-re-scoped
plan: 01
subsystem: workflow
tags: [jj, gsd-tools, transition, assert-clean-wc, commit-adjacency, workflow-markdown]

# Dependency graph
requires:
  - phase: 19-upstream-merge
    provides: gsd-core/ layout, gsd_run launcher embed convention, audit-workflow-raw-git 230-hit frozen baseline, jj-safe gsd-tools commit verb
provides:
  - commit-adjacency fence after every mutating transition.md step (phase.complete, PROJECT.md evolution, STATE.md cluster sweep, 2x config-set)
  - assert_clean_wc final gate in transition.md before offer_next_phase (FATAL + exit 1 on dirty WC)
  - closure of todo v14-transition-md-update-gap (CLEANUP-01)
affects: [complete-milestone, execute-phase auto-advance, any future transition.md edits]

# Tech tracking
tech-stack:
  added: []
  patterns: [commit-adjacency after mutating workflow verbs, tolerant (|| true) commit for possibly-no-op config-set rewrites, single unconditional assert_clean_wc gate + committed post-gate writes instead of per-banner gate duplication]

key-files:
  created: []
  modified: [gsd-core/workflows/transition.md]

key-decisions:
  - "Single STATE.md sweep commit covers the 4-step STATE.md cluster + graduation backlog (RESEARCH A1: one logical mutating step)"
  - "Gate placed as one step before offer_next_phase; Route B1/B config-sets carry their own tolerant commits (RESEARCH Open Q2 resolution) instead of 5 duplicated per-route gates"
  - "Stale todo grep criterion (gsd-sdk form) superseded by ROADMAP SC1 gsd_run form"

patterns-established:
  - "Transition gate fence: byte-style copy of execute-phase.md assert_clean_wc with exactly 3 reworded strings"
  - "config-set commit gap closure: gsd_run query commit ... --files .planning/config.json || true immediately after each config-set call site"

requirements-completed: [CLEANUP-01]

# Metrics
duration: 4min
completed: 2026-06-10
---

# Phase 18 Plan 01: transition.md commit-adjacency + assert_clean_wc gate Summary

**Grafted 5 `gsd_run query commit` fences after every mutating transition.md step plus an unconditional `assert_clean_wc` FATAL gate before `offer_next_phase` — a transition can no longer declare "Phase {X} marked complete" over an uncommitted working copy (Phase 14 false-clean-WC recurrence site closed).**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-10T21:50:46Z
- **Completed:** 2026-06-10T21:54:44Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- All 5 mutation surfaces in `gsd-core/workflows/transition.md` now have immediate adjacent commits:
  1. `phase.complete` (update_roadmap_and_state) → `docs(phase-${completed_phase}): complete phase via transition` --files ROADMAP/STATE/REQUIREMENTS, with load-bearing-order prose
  2. End of `evolve_project` → `docs(phase-${completed_phase}): evolve PROJECT.md after transition` --files PROJECT.md
  3. End of `update_session_continuity_after_transition` → one sweep commit `docs(phase-${completed_phase}): update STATE.md after transition` covering the 4 consecutive STATE.md-only steps + graduation backlog
  4. Route B1 (workstream collision) config-set → tolerant `chore: clear auto-advance chain flag` --files config.json `|| true`
  5. Route B (milestone complete) config-set → same tolerant commit
- New `<step name="assert_clean_wc">` between `update_session_continuity_after_transition` and `offer_next_phase` (line 416, before `offer_next_phase` at 464): gate fence copied byte-style from execute-phase.md:1686-1708 with exactly 3 reworded strings; preamble enumerates this workflow's mutating steps and their now-present commits and documents the single-gate-plus-committed-config-sets placement deviation; "Why unconditional" + "Do not bypass" prose carried over reworded.
- All four lint/audit gates green at baseline; closed todo `v14-transition-md-update-gap`.

## Task Commits

Each task was committed atomically (jj change ids):

1. **Task 1: Graft commit-adjacency after every mutating step** - `urkvvkowqnpv` (feat)
2. **Task 2: Insert assert_clean_wc final gate + fixture-verify** - `nuqmvomqksoz` (feat)

## Files Created/Modified

- `gsd-core/workflows/transition.md` - 5 commit fences (bare `gsd_run`, no second launcher embed) + `assert_clean_wc` gate step + supporting prose and step-checklist items

## Verification Results

- `grep -v '^#' gsd-core/workflows/transition.md | grep -c 'gsd_run query commit'` = **5**
- `grep -c 'chore: clear auto-advance chain flag'` = **2** (both config-set sites covered)
- `grep -c '<step name="assert_clean_wc">'` = **1**, located before `<step name="offer_next_phase">` (416 < 464)
- `grep -c 'gsd_run query diff --name-only'` = **1** (ROADMAP SC1 grep satisfied)
- `grep -c 'git rev-parse --show-toplevel'` = **1** (no second launcher embed)
- `node scripts/audit-workflow-raw-git.cjs` → exit 0, 230 hits / 0 regressions, transition.md frozen at 1
- `node scripts/lint-vcs-no-raw-git.cjs` → exit 0 (1073 files, 0 violations)
- `node scripts/lint-vcs-parallel-call-presence.cjs` → exit 0 (107 files, 0 violations; no `workspace.parallel.*` literals added)

## Fixture Verification Transcripts (SC1)

Ephemeral mktemp colocated jj fixture at `/var/folders/.../T/gsd-18-01-gate-fixture-C9XBLO` (`jj git init --colocate` + repo-scoped user.email/user.name + seeded committed `.planning/config.json`; gate fence body extracted to `gate.sh` with `gsd_run() { node <repo>/gsd-core/bin/gsd-tools.cjs "$@"; }`); fixture deleted after the runs — nothing written into this repo's working tree.

**Run (a) — dirty WC (synthetic uncommitted `dirty-synthetic.txt`):** exit code **1**, stderr:

```
FATAL: working copy is dirty before transition completion.

Source / scripts / tests (executor commit protocol may have leaked, OR unrelated WIP was present):
  dirty-synthetic.txt
  gate.sh

Transition completion requires a clean working copy. Resolve via one of:
  - commit the listed files with a descriptive message
  - if planning artifacts: identify the workflow step that produced them and add its missing commit (do not just paper over here)
  - if unrelated WIP: jj abandon @ (or stash via git, then re-run the transition)
```

(The gate also caught the uncommitted `gate.sh` itself — correct unconditional behavior.)

**Run (b) — clean WC (file committed via `jj commit` in the throwaway fixture):** exit code **0**, no output.

## Stale-Criterion Supersession Note

The source todo's grep criterion `grep -c "gsd-sdk query diff --name-only" ./get-shit-done/workflows/transition.md` predates the Phase 19 restructure (gsd-sdk retired per ADR-0174; `get-shit-done/` → `gsd-core/`). It is superseded by the ROADMAP SC1 form: `grep -c "gsd_run query diff --name-only" gsd-core/workflows/transition.md` ≥ 1 — satisfied (count = 1).

## Global-Install Caveat (operator action required)

`~/.claude/gsd-core/workflows/transition.md` carries the **pre-fix** text until the operator runs, from this clone:

```
node bin/install.js --claude --global
```

NEVER the upstream npx installer (fork rule `feedback_fork_install_path` — upstream lacks the fork's jj fixes).

## Decisions Made

- **A1 (sweep commit):** one STATE.md commit after `update_session_continuity_after_transition` covers steps 4-7 + graduation backlog — the requirement's "STATE.md update" is one logical mutating step; documented inline in the workflow prose.
- **Open Q2 (gate placement):** single `assert_clean_wc` step before `offer_next_phase` plus tolerant commits on the two post-gate config-set sites, instead of duplicating the gate across the 5 banner variants; deviation documented in the step preamble (everything else between gate and banners is read-only: `roadmap.analyze`, `workstream.list`).
- Commit messages use `${completed_phase}` per the plan's locked artifact spec (the orchestrator-agent substitutes the value when executing the workflow template).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Pre-verified that the gate fence's remediation string "stash via git," does not match `SHELL_GIT_RE` (`git` followed by comma, not whitespace+letter), so copying it adds zero audit hits — transition.md stays at its frozen baseline of 1.

## User Setup Required

None beyond the global-install caveat above (operator reinstall to propagate the fixed workflow to the installed copy).

## Next Phase Readiness

- CLEANUP-01 closed; plans 18-02 (CLEANUP-03..07) and 18-03 (TEST-17) are independent (wave 1, no deps) and ready to execute.
- Todo `v14-transition-md-update-gap` resolvable at phase close.

## Self-Check: PASSED

- FOUND: gsd-core/workflows/transition.md (all grafts present per greps above)
- FOUND: commit urkvvkowqnpv (Task 1)
- FOUND: commit nuqmvomqksoz (Task 2)

---
*Phase: 18-tactical-cleanup-test-flake-re-scoped*
*Completed: 2026-06-10*
