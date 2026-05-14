---
phase: 05-command-translations-brownfield-validation-ci-hardening
plan: 02
subsystem: workflows + sdk-tests
tags: [vcs-agnostic, d-33, cmd-01, cmd-02, cmd-03, cmd-04, cmd-05, prompt-01, hooks-fire-bridge, a3-fix]
requires:
  - 05-01 (SDK verb shims: hooks.fire, push, log, status, diff, reset, head-ref, current-branch, +A3 fix in jj.commit())
provides:
  - VCS-agnostic execute-phase.md (headline A3 hand-off lands)
  - VCS-agnostic quick.md (CMD-05 single-squash commit cycle routes via SDK)
  - 5 jj-colocated CMD-01..05 integration tests proving end-to-end translation
affects:
  - get-shit-done/workflows/execute-phase.md (24 line delta)
  - get-shit-done/workflows/quick.md (~70 line delta)
  - 5 new test files in sdk/src/vcs/__tests__/
tech-stack-added:
  - none (uses verbs already registered in 05-01)
patterns:
  - mechanical shape-for-shape rewrite (UPSTREAM-03 / D-33)
  - jq-piped JSON unwrap for SDK query outputs (`.raw`, `.nameOnly`, `.subject`)
  - `# TODO(05-05 sweep): ...` comment tag for verb-gap deferrals
  - test suite skip-gate via `try { execSync('jj --version'); } catch`
  - per-file unique tmpdir prefix `gsd-cmd-<name>-` (Phase 4 LEARNINGS tmpdir-contention guard)
key-files-created:
  - sdk/src/vcs/__tests__/cmd-new-project-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-plan-phase-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-execute-phase-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-discuss-phase-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-quick-jj.test.ts
key-files-modified:
  - get-shit-done/workflows/execute-phase.md
  - get-shit-done/workflows/quick.md
decisions:
  - "jj squash-based commit lands message on @-, not @; tests use {allRefs:true} to scan ancestry for subject assertions"
  - "raw-git sites that have no SDK substitute (branching block, worktree-cleanup block, HEAD-attachment assertion, merge-base) are TODO-tagged for plan 05-05 sweep — preserving D-33 anti-pattern guard (no `if vcs.adapter == 'jj'` conditionals)"
  - "`.gitmodules` parsing via `git config --file .gitmodules` stays raw — read-only INI parsing on a git-specific config file; no VCS state mutation; no D-33 cost"
  - "Pre-staging `git add` before `gsd-sdk query commit` is redundant — SDK handler runs `git add -A -- <files>` internally (Plan 2.1-04 D-02/D-04/D-06)"
metrics:
  duration: ~30m
  tasks: 3
  files: 7 (2 workflow rewrites + 5 new tests)
  start_time: 2026-05-14T20:30:00Z
  completed_date: 2026-05-14
---

# Phase 5 Plan 02: Command Translations (Daily-Driver Workflows + 5 CMD Tests) Summary

VCS-agnostic rewrites of `execute-phase.md` (CMD-01/02/03 surface) and `quick.md` (CMD-05 surface) per D-33, lifting daily-driver workflow markdown off raw `git <verb>` shells onto the 11 `gsd-sdk query` verbs landed in plan 05-01, plus 5 new integration tests gating CMD-01..05 against jj-colocated fixtures.

## What Was Built

### Task 1: execute-phase.md rewrite (commit 5227ca6e)

Replaced raw git invocations with SDK query forms across the daily-driver execute-phase workflow:

| Site | Before | After |
|---|---|---|
| Post-wave hook (line 689 — A3 hand-off headline) | `git hook run pre-commit` | `gsd-sdk query hooks.fire pre-commit --cwd .` |
| MVP+TDD RED-commit detector (line 154) | `git log --oneline --grep="..."` | `gsd-sdk query log --max-count 200` + jq filter |
| Heartbeat fallback (line 668) | `git log --oneline --all --grep="..."` | `gsd-sdk query log --all --max-count 50` + jq |
| Cross-AI dirty-tree check (line 352) | `git diff --quiet HEAD` | `gsd-sdk query diff --range HEAD` + jq `.raw` |
| Branching uncommitted-changes check (line 259) | `git status --porcelain` | `gsd-sdk query status --porcelain` + jq `.raw` |
| Worktree EXPECTED_BASE capture (line 496) | `git rev-parse HEAD` | `gsd-sdk query head-ref --pick head` |
| Worktree base-recovery (line 551) | `git reset --hard <ref>` | `gsd-sdk query reset --ref <ref> --mode hard` |
| Worktree base-recovery verify (line 552) | `git rev-parse HEAD` | `gsd-sdk query head-ref --pick head` |
| Post-wave tracking-files amend (line 800-806) | `git diff --quiet ...` + `git add` + `git commit --amend` | `gsd-sdk query diff --name-only --` + jq + `gsd-sdk query commit --amend --files ...` |
| Spot-check prose (line 963) | `git log --oneline --all --grep="..."` | `gsd-sdk query log --all --max-count 50` + jq |
| Run-activity prose (line 675) | `git log --oneline -5` | `gsd-sdk query log --max-count 5` |

**Inventory shrink:** raw-git inventory was 58 mentions per 05-RESEARCH.md; after rewrite the leading-whitespace non-comment residual count is 12 — all explicitly TODO-tagged for plan 05-05 sweep (under the spec's at-most-12 ceiling).

### Task 2: quick.md rewrite (commit 7a6c0b28)

| Site | Before | After |
|---|---|---|
| CMD-05 commit cycle (lines 639-651 — headline rewrite) | `git add` + `git diff --cached --quiet` + `git commit [--no-verify] -m "docs(...)" -- file` | `gsd-sdk query commit "docs(...)" --files <PLAN.md> [--no-verify]` |
| Pre-spawn HEAD capture (line 665) | `git rev-parse HEAD` | `gsd-sdk query head-ref --pick head` |
| Spawned-executor base-recovery (lines 697-699) | `git reset --hard ${EXPECTED_BASE}` + `git rev-parse HEAD` verify | `gsd-sdk query reset --ref ${EXPECTED_BASE} --mode hard` + `gsd-sdk query head-ref --pick head` |
| Submodule commit guard (line 725) | `git diff --cached --name-only` | `gsd-sdk query diff --cached --name-only` + jq `.nameOnly[]` |
| Branching uncommitted-changes check | `git status --porcelain` | `gsd-sdk query status --porcelain` + jq `.raw` |
| Code-review scope discovery (lines 896-907) | `git log --oneline --format=%H --grep` + `git diff --name-only A..HEAD` | `gsd-sdk query log` + jq filter on `.subject` + `gsd-sdk query diff --name-only --range A..HEAD` + jq `.nameOnly[]` |
| Post-merge tracking-files amend (lines 827-833) | `git diff --quiet` + `git add` + `git commit --amend --no-edit` | `gsd-sdk query diff --name-only --` + jq + `gsd-sdk query commit --amend --files ...` |
| Final commit hash (line 1068) | `git rev-parse --short HEAD` | `gsd-sdk query head-ref --pick head | cut -c1-7` |

**Inventory shrink:** raw-git inventory was 46 mentions per 05-RESEARCH.md; after rewrite the leading-whitespace non-comment residual count is 8 — under the spec's at-most-10 ceiling for the narrower `(add|push|reset|revert|stash|hook|worktree|symbolic-ref|fetch)` criterion (which lands at 1).

**`gsd-sdk query commit ...` invocations:** 6 in quick.md (criterion ≥1).

### Task 3: 5 CMD integration tests (commit ca807db8)

| Test File | CMD | Tests | What it Asserts |
|---|---|---|---|
| `cmd-new-project-jj.test.ts` | CMD-01 | 3 | adapter constructs in jj mode on `jj git init --colocate`; backend selection picks jj with explicit `kind=jj` on a colocated repo; `vcs.commit({files: ['seed.txt']})` succeeds (init → first-commit path) |
| `cmd-plan-phase-jj.test.ts` | CMD-02 | 3 | `createPhaseStructure` returns valid change IDs for parent+merge slot; re-entry is idempotent (`created=false`, same change IDs) per WS-05; phase merge-marker bookmark `gsd/phase-05-merge-marker` exists |
| `cmd-execute-phase-jj.test.ts` | CMD-03 | 2 | three sequential `createSubagentSlot` calls produce unique change IDs + unique workspace paths under `.claude/jj-workspaces/`; **A3-fix assertion** — pre-commit hook fires (marker file `existsSync == true`) after a colocated squash, proving the D-32 retired-D-10 contract reaches the orchestrator path |
| `cmd-discuss-phase-jj.test.ts` | CMD-04 partial | 2 | `vcs.commit` with multiple discuss artifacts + single-file path; commit subject appears in `vcs.log({allRefs:true})` ancestry (squash-based commit puts message on `@-`) |
| `cmd-quick-jj.test.ts` | CMD-05 | 3 | single squash on orchestrator @ leaves @-stable invariant intact; **NO** `gsd/phase-*` bookmarks created (no octopus); pre-commit hook fires exactly once (no double-fire) |

**Total:** 5 test files, 13 tests, all passing locally under jj 0.41.0.

## Empirical Confirmation: A3 Fix Reaches Orchestrator Path

The `cmd-execute-phase-jj.test.ts > Test 2` exercises the same fireHook code path that `execute-phase.md`'s line-689 rewrite invokes via `gsd-sdk query hooks.fire pre-commit --cwd .`. The marker-file presence assertion (`expect(existsSync(markerPath)).toBe(true)`) confirms that the D-32-retired-D-10 contract — adapter ALWAYS fires `.githooks/pre-commit` in colocated mode unless `GSD_HOOK_SKIP_COLOCATED=1` is set — is reachable from the daily-driver orchestrator path. Together with `jj-hooks.test.ts > "D-32: colocated mode always fires"`, the contract is now exercised at two layers: the underlying adapter contract and the orchestrator's exact call site.

## Deferred to Plan 05-05 Sweep

The following sites stayed raw `git` and are tagged `# TODO(05-05 sweep): ...`. Plan 05-05's Task 4 (catalog completion sweep) will route them through the adapter once the matching verbs land. None of these introduce backend conditionals (D-33 anti-pattern guard preserved); they are explicitly noted as git-mode-only by construction.

| File:Line | Site | Missing Verb / Reason |
|---|---|---|
| `execute-phase.md:~250-272` | `handle_branching` block: `git symbolic-ref --short refs/remotes/origin/HEAD`, `git show-ref --verify --quiet`, `git switch`, `git fetch --quiet`, `git merge --ff-only`, `git checkout -b <new> <base>` | WS-01/WS-02 territory — workspace/ref-management verbs (`workspace.switch`, `workspace.create`, `fetch --quiet`, etc.) not yet exposed via `gsd-sdk query` |
| `execute-phase.md:~545-561` | Worktree-agent HEAD-assertion block (in spawned-executor prompt body): `git symbolic-ref --quiet HEAD`, `git rev-parse --abbrev-ref HEAD`, `git merge-base HEAD <ref>` | git-mode-only by construction (`worktree-agent-*` namespace, `.git/config.lock`); `gsd-sdk query current-branch` returns `bookmarks: string[]` (Phase 2.1 D-15), not the single-branch-name shape this block needs |
| `execute-phase.md:~712-874` | Worktree-cleanup block (~150 LOC): `git worktree list/remove/unlock/prune`, `git -C "$WT" rev-parse`, `git merge --no-ff`, `git branch -D`, `git diff --diff-filter=D`, `git rm`, `git log --follow` | WS-01/WS-02 — `vcs.workspace.list/add/forget/prune` is wired in the adapter but PROMPT-01 has not yet routed this block through it; the merge-back semantics are git-specific |
| `execute-phase.md:~688-690` | Post-wave stash dance: `git diff --quiet`, `git stash push -u -m`, `git stash pop` | No `gsd-sdk query stash` verb yet |
| `quick.md:~191-228` | Quick-task branching block (same shape as `execute-phase.md handle_branching`) | WS-01/WS-02 territory |
| `quick.md:~681-693` | HEAD-attachment assertion in spawned-executor prompt (same shape as execute-phase block) | git-mode-only by construction |
| `quick.md:~698-699` | merge-base check: `git merge-base HEAD ${EXPECTED_BASE}` | No `gsd-sdk query merge-base` verb yet |
| `quick.md:~780-866` | Worktree-cleanup block (same shape as execute-phase) | WS-01/WS-02 territory |
| `quick.md:~901` | `git rev-parse "${DIFF_BASE}"` parent-existence probe in code-review scope discovery | No `gsd-sdk query rev-parse` verb yet |

**Read-only `.gitmodules` parsing** (both files): `git config --file .gitmodules --get-regexp` stays raw — it is read-only INI parsing on a git-specific config file, not a VCS state mutation, and `.gitmodules` is a git-specific concept (jj has no submodule analog). No D-33 cost; no sweep item.

## Verification

- `cd sdk && npx tsc --noEmit` → 0 errors (clean type-check)
- `cd sdk && npx vitest run src/vcs/__tests__/cmd-*-jj.test.ts` → 5 files, 13 tests, all pass under jj 0.41.0 in 5.43s
- `node scripts/lint-vcs-no-raw-git.cjs` → 0 violations across 949 files (rewrite did not sneak any raw-git source-side call site into the SDK or tests)
- `grep -P "gsd-sdk query hooks\\.fire pre-commit --cwd \\." execute-phase.md | wc -l` → 1 (≥1 required)
- `grep -P "^[^#]*\\bgit hook run pre-commit" execute-phase.md | wc -l` → 0 (must be 0)
- `grep -P "gsd-sdk query commit " quick.md | wc -l` → 6 (≥1 required)
- `grep -v '^\\s*#' quick.md | grep -cP "^\\s*git\\s+commit\\b"` → 0 (must be 0)
- `grep -v '^\\s*#' quick.md | grep -cP "^\\s*git\\s+(add|push|reset|revert|stash|hook|worktree|symbolic-ref|fetch)\\b"` → 1 (≤10)
- `grep -v '^\\s*#' execute-phase.md | grep -cP "^\\s*git\\s+(commit|push|reset|revert|stash|hook|worktree|symbolic-ref|fetch)\\b"` → 5 (≤12)
- `grep -cP "if vcs.adapter == 'jj'" execute-phase.md quick.md` → 0 each (D-33 anti-pattern guard preserved)
- `grep -cP "if .* jj.*then" execute-phase.md quick.md` → 0 each (no shell-form backend conditionals)

## Deviations from Plan

**None — plan executed mechanically per UPSTREAM-03 / D-33.**

Only minor refinements during execution:

1. **CMD-04 (discuss) test — squash-based commit log assertion shape:** Initial `vcs.log({ maxCount: 1 })` returned `@` (no description). Adjusted to `vcs.log({ maxCount: 10, allRefs: true })` and asserted on the joined-subjects string. This is a property of the jj squash-based commit model (message lands on `@-`, not `@`) — same pattern jj-octopus.test.ts uses for `@-` probes. Not a deviation from the plan's assertion intent (CMD-04 commit shape works end-to-end); only a refinement of the log-query shape.

2. **CMD-03 (execute-phase) Test 1 timeout:** Three sequential `createSubagentSlot` calls take longer than vitest's default 5s. Bumped per-test timeout to 30s using vitest's options-object form (`it('...', { timeout: 30000 }, () => {...})`). Same pattern as existing slow jj-octopus tests use.

3. **Quick.md pre-staging `git add` removed (mechanical refinement):** The original CMD-05 path ran `git add ${PLAN}` before `git commit`. The SDK `commit.ts` handler runs `git add -A -- <files>` internally (Plan 2.1-04 D-02/D-04/D-06 — WC IS the source of truth, adapter captures on commit). The pre-staging `git add` is now redundant and was removed in both the CMD-05 commit cycle and the final commit at line 1054-1063. The same applies to the `--amend` rewrites in both files.

## Hand-off to Plan 05-03

Plan 05-03 (lifecycle plan) inherits the same rewrite patterns for the remaining workflow markdown:

- `get-shit-done/workflows/complete-milestone.md` — same `gsd-sdk query commit` / `gsd-sdk query log` / `gsd-sdk query head-ref` shapes
- `get-shit-done/workflows/undo.md` — `gsd-sdk query revert` (git-only escape, jj surfaces typed error per 05-01)
- `get-shit-done/workflows/code-review.md` — same `gsd-sdk query diff --range A..HEAD --name-only` + jq form
- CMD-04 verify-work + CMD-06 complete-milestone integration tests will follow the `cmd-discuss-phase-jj.test.ts` pattern

The four TODO(05-05 sweep) categories enumerated above are unchanged for plan 05-03; they remain plan 05-05's responsibility once the matching verbs land.

## Self-Check: PASSED

- ✓ Task 1 commit `5227ca6e` present: `feat(05-02): rewrite execute-phase.md to be VCS-agnostic (D-33, Task 1)`
- ✓ Task 2 commit `7a6c0b28` present: `feat(05-02): rewrite quick.md to be VCS-agnostic (D-33, Task 2) + finish execute-phase amend`
- ✓ Task 3 commit `ca807db8` present: `test(05-02): add CMD-01..05 integration tests against jj-colocated fixtures (Task 3)`
- ✓ All 5 new test files exist on disk under `sdk/src/vcs/__tests__/cmd-*-jj.test.ts`
- ✓ All 13 tests pass under jj 0.41.0 (vitest exit 0)
- ✓ Type-check clean (`npx tsc --noEmit` exit 0)
- ✓ No-raw-git lint clean (0 violations across 949 files)
- ✓ Headline acceptance criteria met (see Verification section)
