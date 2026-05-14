---
phase: 07-reconcile-fork-capabilities-with-upstream-add-missing-adapte
plan: 01
subsystem: vcs-adapter
tags:
  - vcs-adapter
  - jj-backend
  - git-backend
  - phase-7
  - wave-1
dependencies:
  requires:
    - "VcsAdapter Phase 4 surface (workspace.add/forget/list, acquireJjWriteLock, findConflicts, expr.range)"
    - "Phase 1 contract-test harness (vcsTest + BACKENDS_AVAILABLE_FOR_VERB)"
  provides:
    - "8 new VcsAdapter verbs (VCS-08..VCS-15) on git + jj backends"
    - "Cross-backend WorkspaceMergeOpts + WorkspaceMergeResult shapes with REQUIRED mainBookmark"
    - "DiffFilter typed enum on cross-backend surface (no git single-letter leak)"
  affects:
    - "Plan 07-02 (wave-cleanup executor wire — _deps.vcs injection seam now has all 8 verbs)"
    - "Plan 07-04 (github-release-notes.cjs migration — readBlob fold-in unblocks the `show <ref>:<file>` call site)"
tech-stack:
  added:
    - "jj 0.41 fork_point(x) revset (mergeBase canonical idiom)"
    - "jj 0.41 file show -r <rev> -- <path> (readBlob)"
  patterns:
    - "Backend translator pattern (Phase 2.1 D-01): typed cross-backend enum, no git/jj terminology leak"
    - "Pitfall 4 forget-then-rm-rf ordering (jj workspace.remove)"
    - "acquireJjWriteLock RAII covering atomic 3-step body (jj workspace.merge)"
key-files:
  created: []
  modified:
    - "sdk/src/vcs/types.ts"
    - "sdk/src/vcs/backends/git.ts"
    - "sdk/src/vcs/backends/jj.ts"
    - "sdk/src/vcs/backends.ts"
    - "sdk/src/vcs/__tests__/jj-refs.test.ts"
    - "sdk/src/vcs/__tests__/jj-workspace.test.ts"
    - "sdk/src/vcs/__tests__/jj-status-log-diff.test.ts"
    - "tests/vcs-adapter-contract.test.cjs"
    - "sdk/src/query/state.ts (Rule 3 fold-in — duplicate import drop)"
decisions:
  - "Plan 07-01: D-03 atomic main-advance encoded as REQUIRED mainBookmark field on WorkspaceMergeOpts (not optional). jj backend asserts via validateRefname before `jj bookmark set <main> -r @` lands; git backend asserts `currentBranch === mainBookmark` (throws VcsExecError on mismatch)."
  - "Plan 07-01: readBlob (VCS-15) folded into Plan 1 as 8th verb per planner judgment (proactive scope, not D-16 escape). github-release-notes.cjs:71 was a known gap surfaced in RESEARCH §Pitfall 7 — cheaper to land in one shape-commit than churn Phase 7.1 INSERTED paperwork."
  - "Plan 07-01: jj diff() must NOT emit `--name-only` and `--summary` together (jj 0.41 rejects the combination with exit-code 2). When diffFilter is set, the backend uses --summary alone and derives nameOnly from the filtered parsed entries. [Rule 1 bug discovered during Task 3 test execution.]"
metrics:
  duration: "~18m"
  tasks: 3
  files: 9
  date: 2026-05-14
---

# Phase 07 Plan 01: VcsAdapter forward-complete surface for Phase 7 — 8 new verbs

## One-Liner

Landed 8 cross-backend VcsAdapter verbs (`refs.currentBookmarksIn`, `refs.mergeBase`, `refs.readBlob`, `diff{diffFilter}`, `status{cwd}`, `workspace.merge`, `workspace.remove`, `bookmarks.delete{force}`) on both git and jj backends with per-domain live tests + cross-backend contract tests, atomic-shape commit per task — Plan 07-02 wave-cleanup executor wire is unblocked.

## What Was Built

Three atomic tasks, one verb-batch each:

### Task 1 — types.ts shape commit (`feat(07-01-T1)`, change `klqkxwrotyvw`)

Extended `sdk/src/vcs/types.ts` with:

- `DiffFilter` type union (`'added' | 'modified' | 'deleted' | 'renamed' | 'typechange'`).
- `DiffOpts.diffFilter?: DiffFilter` (D-06, VCS-10).
- `StatusOpts.cwd?: string` (D-07, VCS-11).
- `VcsRefs.currentBookmarksIn(cwd: string): string[]` (D-04, VCS-08).
- `VcsRefs.mergeBase(a: RevisionExpr, b: RevisionExpr): string` (D-05, VCS-09).
- `VcsRefs.readBlob(rev: RevisionExpr, path: string): string` (planner fold-in, VCS-15).
- `VcsBookmarks.delete` opts widened to `{ raw?: boolean; force?: boolean }` (D-09, VCS-14).
- `WorkspaceMergeOpts` with **REQUIRED** `mainBookmark: string` (D-03 atomic main-advance — not optional).
- `WorkspaceMergeResult` with `{ ok, conflicted, changeId, stderr }` (D-02 conflict-return semantics).
- `VcsWorkspace.merge(opts): WorkspaceMergeResult` (D-01..D-03, VCS-12).
- `VcsWorkspace.remove(path, opts?: { force }): void` (D-08, VCS-13).

### Task 2 — git.ts + jj.ts bodies (`feat(07-01-T2)`, change `nzpmmqyvwkkl`)

Both backends implement all 8 verb bodies following the analog excerpts in `07-PATTERNS.md`.

| Verb | git | jj |
|------|-----|-----|
| `bookmarks.delete{force}` | toggle `-D` (force) vs `-d` (safe) | `bookmark delete` (documented no-op `force` per D-09; Pitfall 5 doc) |
| `currentBookmarksIn(cwd)` | `git -C <cwd> rev-parse --abbrev-ref HEAD` | `vcsExec(targetCwd, jjArgv('log','-r','@-','-T','bookmarks.join("\n")',…))` — spawned-cwd selects workspace, `--repository` stays pinned to adapter root |
| `mergeBase(a, b)` | `git merge-base <a> <b>` → commit hash | `fork_point(<aJj> \| <bJj>)` template → change_id |
| `readBlob(rev, path)` | `git show <rev>:<path>` | `jj file show -r <rev> -- <path>` |
| `diff{diffFilter}` | append `--diff-filter=<letter>` (single letter) | force `--summary`, parse via existing `parseDiffSummary`, post-filter by letter |
| `status{cwd}` | route `cwd: targetCwd` into both -z and porcelain spawns | `vcsExec(targetCwd, jjArgv('status'))` |
| `workspace.merge` | `git merge --no-ff -m <msg> <branch>` + assert `currentBranch === mainBookmark` + `branch -D <agent>` | under `acquireJjWriteLock(cwd)`: `jj new -r @ -r <branch> -m <msg>` → resolve `change_id` of `@` → `findConflicts({scope:'working-copy'})` ok-probe → `jj bookmark set <main> -r @` → `jj bookmark delete -- <agent>` |
| `workspace.remove` | `git worktree remove --force <path>` | `jj workspace forget -- <name>` THEN `rmSync(path, {recursive,force})` (Pitfall 4 ordering) |

Notable invariants preserved:

- **D-03 atomic main-advance** on jj merge runs under `acquireJjWriteLock` RAII covering all three jj invocations (new + bookmark-set + bookmark-delete) — a concurrent merge cannot observe a half-applied state.
- **D-02 SQUASH-06 conflict-return** on jj merge: `findConflicts({scope:'working-copy'})` probes after `jj new` and returns `{ ok: false, conflicted: true, changeId, stderr: '' }` with NO auto-abandon if the merge change is in-tree conflicted.
- **Pitfall 4** on jj `workspace.remove`: forget MUST run before rmSync — deleting the on-disk dir first leaves stale metadata in `.jj/op_log` that breaks subsequent `workspace.list()`. Order is encoded inline.
- **validateRefname** gates every user-influenced refname positional (T-07.01-01/02 mitigation).

### Task 3 — tests + verb allowlist (`feat(07-01-T3)`, change `okzkxvwpzklz`)

| Surface | Coverage |
|---------|----------|
| `tests/vcs-adapter-contract.test.cjs` | 8 new happy-path tests gated via `verbReady(verb)` — all 30 (15 git + 15 jj-colocated) tests pass. `workspace.merge` test runs the REAL happy-path body (no typeof-stubs) including agent-bookmark cleanup assertion per D-03. `workspace.remove` test exercises full add → remove → list roundtrip. |
| `__tests__/jj-refs.test.ts` | Phase 7 describe block: 6 live tests covering `currentBookmarksIn` (with/without bookmarks), `mergeBase` (head, parent), `bookmarks.delete{force}` (happy + already-deleted idempotency). |
| `__tests__/jj-workspace.test.ts` | Phase 7 describe block: 5 live tests covering `workspace.merge` happy-path with D-03 main-advance assertion via `vcs.refs.bookmarks.list()`, `workspace.merge` missing-bookmark failure mode, `workspace.remove` happy-path with on-disk dir gone assertion, `workspace.remove` path-missing-with-force idempotency, and the `expr.range(rev(mergeBase-result), bookmark(branch))` round-trip smoke (closes RESEARCH Open Q3). |
| `__tests__/jj-status-log-diff.test.ts` | Phase 7 describe block: 5 live tests covering `diff{diffFilter:'deleted'}` filters to D-status only, `diff{diffFilter:'added'}` filters to A-status, `status{cwd}`, `readBlob` happy + missing-rev-throws. |
| `sdk/src/vcs/backends.ts` | `BACKENDS_AVAILABLE_FOR_VERB` extended with 8 new keys on `['git', 'jj-colocated']`. |

All 70 per-domain tests pass. All 30 cross-backend contract tests pass on both git and jj-colocated lanes.

## RESEARCH Open Questions — Resolution Record

| Q | Resolution |
|---|------------|
| **Q1** — `workspace.merge` conflicted-message shape | Set description via `-m` on `jj new` (Pattern 3 default). Mirrors Phase 3 `commit()` conflict-path behavior. |
| **Q2** — Per-verb contract-test depth | Adopted RESEARCH recommendation: 2–3 tests for multi-branch verbs (merge, remove, mergeBase, diff{diffFilter}, bookmarks.delete{force}); 1 test for low-branch verbs (currentBookmarksIn, status{cwd}, readBlob). |
| **Q3** — `expr.range(mergeBase-result, branch)` round-trip on jj | **Confirmed by smoke test** in `__tests__/jj-workspace.test.ts`. Feeds `mergeBase` output (change_id) into `expr.range(expr.rev(base), expr.bookmark(branch))` and asserts `vcs.diff({ rev: range, nameOnly: true })` is well-formed. Plan 07-02 can depend on this round-trip without further verification. |
| **Q4** — `readBlob` as proactive 8th verb | **Folded into Plan 1 as VCS-15** per planner judgment. RESEARCH §Pitfall 7 already surfaced the gap (github-release-notes.cjs:71 needs `show <ref>:<file>`). D-16's escape hatch is for triage-surfaced gaps, not pre-known needs. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Pre-existing `sdk/src/query/state.ts` TS2440 duplicate-declaration error blocked dist ESM build, which broke `gsd-sdk` mid-execution.**

- **Found during:** Task 2 commit attempt (after `pnpm install` from a Task 1 build script side-effect regenerated `sdk/dist/query/state.js` with the bug).
- **Issue:** `sdk/src/query/state.ts` both imported `computeProgressPercent` from `./state-document.js` and locally declared+exported a same-named function. TS reports TS2440; Node's ESM loader rejects the compiled output with `SyntaxError: Identifier 'computeProgressPercent' has already been declared`. The pnpm-driven `gsd-sdk` shim spawns Node against the broken `dist/query/state.js`, so every per-task commit attempt failed.
- **Fix:** Drop the unused `computeProgressPercent` import from `state.ts` (the local export is canonical — consumed by `state-mutation.ts:36`). Source compiles, dist regenerates clean, `gsd-sdk` works.
- **Files modified:** `sdk/src/query/state.ts` (drop one import line).
- **Commit:** `feat(07-01-T2)` (folded into Task 2 commit as `[Rule 3 fold-in]`).
- **Scope justification:** Out-of-plan but blocking — without this fix the per-task commit flow stops working. Scope-boundary appropriate per execute-plan Rule 3.

**2. [Rule 1 — Bug] jj backend `diff({ diffFilter, nameOnly: true })` emitted both `--name-only` and `--summary` to `jj diff`; jj 0.41 rejects the combination with exit-code 2.**

- **Found during:** Task 3 per-domain test execution (`diff({ diffFilter: 'added', nameOnly: true })` returned empty `nameOnly` because the underlying `jj diff` call failed).
- **Issue:** My first cut of jj backend `diff()` pushed `--name-only` when `opts.nameOnly` was set and `--summary` when `diffFilter` was set. jj 0.41 rejects both flags together; the call exited non-zero and the typed result silently returned `{ nameOnly: [] }`.
- **Fix:** When `diffFilter` is set (which forces `--summary`), don't emit `--name-only`. Derive `nameOnly` from the parsed/filtered `nameStatus` entries instead. Encoded as a single `useSummary` / `useNameOnly` predicate at the top of the function so the mutual exclusion is structural, not a sequence of `if` branches.
- **Files modified:** `sdk/src/vcs/backends/jj.ts` (diff body restructured).
- **Commit:** `feat(07-01-T3)` (folded into the test commit because the test discovered the bug).
- **Scope justification:** In-plan correctness — Task 2's diff body was wrong, Task 3's tests caught it.

**3. [RESEARCH A2 / Pitfall 5 empirical update] jj 0.41 `bookmark delete` on an already-deleted bookmark is IDEMPOTENT (exits 0), not throw-on-second.**

- **Found during:** Initial per-domain test run for `bookmarks.delete{force}` on the second-delete path.
- **Issue:** RESEARCH §Pitfall 5 hypothesized that second-delete throws, justifying a contract test that probed for the throw. jj 0.41 empirically returns exit 0 on the second delete — the bookmark was already gone, jj treats this as a no-op (the `force` flag is documented to be a no-op on jj anyway). The test now asserts no-throw with a comment documenting the empirical resolution.
- **Files modified:** `sdk/src/vcs/__tests__/jj-refs.test.ts` (test assertion flipped to `not.toThrow` with rationale).
- **Commit:** `feat(07-01-T3)`.
- **Scope justification:** Test-fixture correctness — RESEARCH was a hypothesis; live jj 0.41 is canonical.

### No-fix deferred items

None. Plan 07-01 lands fully green.

## Cross-Backend Test Results

| Lane | Tests | Pass | Fail | Duration |
|------|-------|------|------|----------|
| git | 15 | 15 | 0 | ~1.6s |
| jj-colocated | 15 | 15 | 0 | ~4.5s |
| **Total contract** | **30** | **30** | **0** | **~6.1s** |

Per-domain (jj backend only — git side covered by the contract suite via byte-identity baselines from Phase 1):

| File | Tests | Pass |
|------|-------|------|
| `jj-refs.test.ts` | 28 | 28 |
| `jj-workspace.test.ts` | 24 | 24 |
| `jj-status-log-diff.test.ts` | 18 | 18 |
| **Total per-domain** | **70** | **70** |

## Threat Surface Scan

No new threat-relevant surfaces beyond the `<threat_model>` declared in 07-01-PLAN.md:

- T-07.01-01/02 (argv injection via refname): mitigated by `validateRefname` before every user-influenced positional + `--` end-of-options separator on jj.
- T-07.01-03 (path traversal via `rmSync` in `workspace.remove`): mitigated by resolve-via-`workspace.list()` + path constrained to `join(cwd, '.claude/jj-workspaces', name)` (D-16 layout).
- T-07.01-04 (cwd injection in `currentBookmarksIn`): standard Node spawn semantics; cwd flows to spawnSync as the spawned-process cwd ONLY, never embedded in argv.
- T-07.01-05 (race on atomic main-advance): mitigated by `acquireJjWriteLock(cwd)` RAII over the 3-step body.
- T-07.01-SC (npm/pnpm legitimacy): Zero new packages installed. The pnpm install side-effect that fired was a `[ERR_PNPM_IGNORED_BUILDS]` informational warning about pre-existing `fallow@2.73.0` build scripts (no new dep, no new build script).

## Hand-off to Plan 07-02

Plan 07-02 wires `executeWorktreeWaveCleanupPlan` at `get-shit-done/bin/lib/worktree-safety.cjs:402` through `_deps.vcs ?? createVcsAdapter(plan.repoRoot, {})`. After this plan, every verb that the wave-cleanup executor needs is available on both backends:

- `vcs.refs.currentBookmarksIn(wt)` ✓
- `vcs.refs.mergeBase(HEAD, branch)` ✓
- `vcs.diff({ rev: range, diffFilter: 'deleted', nameOnly: true })` ✓
- `vcs.status({ porcelain: true, cwd: wt })` ✓
- `vcs.workspace.merge({ branch, message, ff: false, mainBookmark, agentBookmark })` ✓ (D-03 atomic main-advance baked in)
- `vcs.workspace.remove(wt, { force: true })` ✓
- `vcs.refs.bookmarks.delete(name, { force: true })` ✓ (for branches the merge step doesn't touch)

Plan 07-04 (`github-release-notes.cjs` migration) consumes `vcs.refs.readBlob(rev, path)` for the `show <ref>:<file>` call site at line 71.

## Verification Snapshot

```
$ pnpm -C sdk build:cjs    # tsc -p tsconfig.cjs.json  exit 0
$ pnpm -C sdk build         # tsc                       exit 0 (after [Rule 3] fix)
$ node scripts/lint-vcs-no-raw-git.cjs                   exit 0; 0 violations / 1059 files
$ node scripts/check-skip-count.cjs                      exit 0; current=18 baseline(origin/main)=18
$ GSD_TEST_BACKENDS=git,jj-colocated node --test tests/vcs-adapter-contract.test.cjs   30/30 pass
$ pnpm test sdk/src/vcs/__tests__/{jj-refs,jj-workspace,jj-status-log-diff}.test.ts   70/70 pass
```

## Self-Check: PASSED

- [x] `sdk/src/vcs/types.ts` — extended (FOUND; 8 new shapes; mainBookmark REQUIRED).
- [x] `sdk/src/vcs/backends/git.ts` — 8 verb bodies (FOUND; merge: WorkspaceMergeOpts; remove with --force; diff diffFilter wired).
- [x] `sdk/src/vcs/backends/jj.ts` — 8 verb bodies (FOUND; fork_point; jj file show; bookmark set under acquireJjWriteLock; forget-then-rmSync ordering).
- [x] `sdk/src/vcs/backends.ts` — BACKENDS_AVAILABLE_FOR_VERB extended (FOUND; 8 new keys).
- [x] `sdk/src/vcs/__tests__/jj-refs.test.ts` — Phase 7 describe block (FOUND; 6 tests).
- [x] `sdk/src/vcs/__tests__/jj-workspace.test.ts` — Phase 7 describe block (FOUND; 5 tests incl. D-03 + expr.range smoke).
- [x] `sdk/src/vcs/__tests__/jj-status-log-diff.test.ts` — Phase 7 describe block (FOUND; 5 tests).
- [x] `tests/vcs-adapter-contract.test.cjs` — 8 cross-backend tests (FOUND; real bodies, no typeof-stubs).
- [x] Commit `klqkxwrotyvw` (T1 — types) FOUND.
- [x] Commit `nzpmmqyvwkkl` (T2 — bodies + Rule 3 fold-in) FOUND.
- [x] Commit `okzkxvwpzklz` (T3 — tests + Rule 1 fold-in) FOUND.
