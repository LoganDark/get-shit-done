---
phase: 05-command-translations-brownfield-validation-ci-hardening
plan: 01
subsystem: vcs-adapter + sdk-query-catalog
tags: [foundation, sdk-verbs, jj-adapter, A3-fix, D-31-deferral, D-32, D-33]
dependency-graph:
  requires:
    - Phase 4 plan 06 (HOOK-01..05; fireHook bridge)
    - Phase 4 plan 07 (refname validator lift / cr-01)
    - Phase 3 D-04 (raw-name escape on bookmarks)
  provides:
    - vcs.gitOnly.{revert, reset, merge, restore} on git backend
    - 11 cross-backend SDK query verb shims (push/reset/revert/log/status/diff/branch-list/head-ref/current-branch/merge/restore)
    - jj.commit() unconditional pre-commit fire (D-32; D-10 retired)
    - GSD_HOOK_SKIP_COLOCATED=1 env escape hatch
    - ROADMAP/REQUIREMENTS deferral edits moving BROWN-01/02 to Phase 6
  affects:
    - Plans 05-02..05-04: workflow markdown rewrites dispatch through the 11 new query verbs
    - Phase 6: absorbs BROWN-01/02 brownfield-dogfood scope + first-weekly-rebase retro criterion
tech-stack:
  added: []
  patterns:
    - "QueryHandler shim mirroring hooks.ts (argv-scan loop → adapter dispatch → uniform `{ok, exitCode, stdout, stderr, ...}` data shape)"
    - "validateRefname applied at the SDK boundary before any refname/bookmark arg reaches argv"
    - "Git-only escape hatches (reset, merge) return typed error on jj backend without throwing"
    - "Destructive-semantics annotation on revert.ts (CMD-06 jj abandon → op-log recovery)"
key-files:
  created:
    - "sdk/src/query/push.ts"
    - "sdk/src/query/reset.ts"
    - "sdk/src/query/revert.ts"
    - "sdk/src/query/log.ts"
    - "sdk/src/query/status.ts"
    - "sdk/src/query/diff.ts"
    - "sdk/src/query/branch-list.ts"
    - "sdk/src/query/head-ref.ts"
    - "sdk/src/query/current-branch.ts"
    - "sdk/src/query/merge.ts"
    - "sdk/src/query/restore.ts"
    - "sdk/src/query/{push,reset,revert,log,status,diff,branch-list,head-ref,current-branch,merge,restore}.test.ts (11 paired unit tests)"
    - "sdk/src/vcs/__tests__/git-revert.test.ts (Task 1.5)"
  modified:
    - "sdk/src/vcs/backends/jj.ts (A3 fix in commit() — Task 1)"
    - "sdk/src/vcs/__tests__/jj-hooks.test.ts (colocated assertion inverted + env-override case added — Task 1)"
    - "sdk/src/vcs/backends/git.ts (gitOnly extended with revert, reset, merge, restore)"
    - "sdk/src/vcs/types.ts (GitOnlyOps interface extended)"
    - "sdk/src/query/command-static-catalog-foundation.ts (11 imports + 11 Map entries)"
    - "sdk/src/query/command-manifest.non-family.ts (11 manifest rows)"
    - ".planning/ROADMAP.md (Phase 5 criterion #3 + Phase 6 stub absorption)"
    - ".planning/REQUIREMENTS.md (BROWN re-bucketing + distribution summary)"
decisions:
  - "D-32 applied: jj.commit() always fires .githooks/pre-commit after squash regardless of colocation; GSD_HOOK_SKIP_COLOCATED=1 is the developer escape hatch."
  - "D-33 batch 1 landed: 11 cross-backend SDK query shims supersede raw `git <verb>` shell-outs in downstream PROMPT rewrites."
  - "D-31 applied: literal brownfield dogfood validation re-bucketed from Phase 5 to Phase 6 (depends on Phase 6 SHA→change_id rewriter)."
  - "Rule 3 closure: GitOnlyOps extended with reset/merge/restore (not in plan as Task 1.5 explicitly, but required to make reset.ts/merge.ts/restore.ts compile against the adapter contract)."
  - "Pitfall 6 accepted: revert.ts on jj backend dispatches `jj abandon` (destructive history rewrite); recovery via `jj op restore`. Documented in revert.ts header."
metrics:
  duration_minutes: ~30
  completed_date: 2026-05-13
  tasks_executed: 4
  commits: 4
  files_created: 23
  files_modified: 8
  lines_added: ~1400
---

# Phase 5 Plan 01: Foundational Infrastructure Summary

A3 fix landed in jj.commit() (D-32, retiring Phase 4 D-10); 11 cross-backend SDK query verb shims created, tested, and registered in the static catalog + non-family manifest; D-31 deferral edits moved BROWN-01/02 from Phase 5 to Phase 6 in ROADMAP and REQUIREMENTS.

## Task-by-task

### Task 1 — A3 fix (commit `37a5b054`)

Already in tree from prior executor invocation. The 10-line block at `sdk/src/vcs/backends/jj.ts:250-264` was replaced verbatim per 05-PATTERNS.md: the colocated no-op branch was retired; `fireHook(cwd, 'pre-commit', { stagedFiles: input.files })` now fires unconditionally after every `jj squash`, modulo the `GSD_HOOK_SKIP_COLOCATED=1` env escape hatch.

`sdk/src/vcs/__tests__/jj-hooks.test.ts:157-179` had its colocated-mode describe block renamed and the marker-file assertion inverted from `toBe(false)` → `toBe(true)`; a new `it()` case added for the env-override path. The full file passes under jj 0.41 colocated mode locally and in CI.

### Task 1.5 — `vcs.gitOnly.revert` (commit `822c9322`)

Already in tree from prior executor invocation. Added the `revert(opts: { rev: string; noCommit: boolean }): ExecResult` method signature to `GitOnlyOps` in `sdk/src/vcs/types.ts`, an implementation in the git backend's `gitOnly` Object.freeze block, and a paired test file `sdk/src/vcs/__tests__/git-revert.test.ts` with two test cases (default inverse-commit, `--no-commit` staged-only). This is the foundational primitive that Task 2's `revert.ts` SDK query shim wraps on the git path.

### Task 2 — 11 SDK query verb shims + paired tests (commit `e5b5c932`)

11 new files in `sdk/src/query/`, each mirroring the canonical `hooks.ts` shape (manual argv-scan loop, `createVcsAdapter()` dispatch, uniform `{ ok, exitCode, stdout, stderr, ... }` data shape). 11 paired vitest files use `vi.mock('../vcs/index.js', ...)` to assert argv parsing + adapter delegation in isolation.

One-line per verb:

| File              | Adapter call                            | Mutation | Key flags                                                  |
| ----------------- | --------------------------------------- | -------- | ---------------------------------------------------------- |
| `push.ts`         | `vcs.push({ remote, ref, force })`      | yes      | `--remote`, `--bookmark` (validateRefname), `--force`      |
| `reset.ts`        | `vcs.gitOnly.reset({ ref, mode })`      | yes      | `--ref`, `--mode <soft\|mixed\|hard>`; jj → typed error    |
| `revert.ts`       | `vcs.gitOnly.revert` / `jj abandon`     | yes      | positional `<rev>`, `--no-commit`; **destructive on jj**   |
| `log.ts`          | `vcs.log({ maxCount, allRefs, rev })`   | no       | `--max-count`, `--all`, `--range`                          |
| `status.ts`       | `vcs.status({ porcelain })`             | no       | `--porcelain`, `--short` (alias)                           |
| `diff.ts`         | `vcs.diff({ staged, nameOnly, ... })`   | no       | `--range`, `--cached`, `--name-only`, `--name-status`, `--` paths |
| `branch-list.ts`  | `vcs.refs.bookmarks.list()`             | no       | `--prefix` (validateRefname, client-side filter)           |
| `head-ref.ts`     | `vcs.refs.resolveShort(vcs.refs.head)`  | no       | `--cwd` only                                               |
| `current-branch.ts` | `vcs.refs.currentBookmarks()`         | no       | `--cwd` only                                               |
| `merge.ts`        | `vcs.gitOnly.merge({ ref, ... })`       | yes      | positional `<ref>` (validateRefname), `--squash`, `--no-ff`, `--no-commit`; jj → typed error |
| `restore.ts`      | `vcs.gitOnly.restore` / `jj restore`    | yes      | trailing positionals = files, `--from` (validateRefname)   |

50 unit tests added across 11 test files; all pass under vitest. TypeScript clean. `lint-vcs-no-raw-git` 0 violations.

### Task 3 — Catalog + manifest registration + D-31 deferral edits (commit `5936b841`)

Registered all 11 new verbs in:
- `sdk/src/query/command-static-catalog-foundation.ts`: 11 new imports near the top, 11 new entries in the `MUTATION_SURFACES_STATIC_CATALOG` Map (kebab-case canonical names).
- `sdk/src/query/command-manifest.non-family.ts`: 11 new rows with appropriate `mutation` / `outputMode` flags.

D-31 deferral edits:
- `.planning/ROADMAP.md` Phase 5 criterion #3 amended: dogfood-this-repo language removed, replaced with "synthetic jj fixtures" wording; full dogfood validation re-bucketed to Phase 6.
- `.planning/ROADMAP.md` Phase 6 stub absorbs BROWN-01/02 success scope + first-weekly-rebase retro criterion.
- `.planning/REQUIREMENTS.md` BROWN-01/02 status table rows: Phase 5 → Phase 6 with traceable note.
- `.planning/REQUIREMENTS.md` per-phase distribution summary: Phase 5 count 17 → 15; new Phase 6 line for the 2 re-bucketed reqs; total preserved at 86.
- `.planning/REQUIREMENTS.md` footer last-updated line added per existing convention.

Catalog/resolution/topology tests pass (3 test files, 10 assertions).

## Deviations from Plan

### Rule 3 — Blocking Issue Closure

**1. Extended `GitOnlyOps` with `reset`, `merge`, `restore`**
- **Found during:** Task 2 (shim implementation)
- **Issue:** The plan called for `reset.ts` / `merge.ts` / `restore.ts` to dispatch through `vcs.gitOnly.reset(...)`, `vcs.gitOnly.merge(...)`, and `vcs.gitOnly.restore(...)`, but these methods did not exist on the `GitOnlyOps` interface (only `revert` was added in Task 1.5 explicitly). Without them, the three new shims would not compile against the typed adapter contract, and the alternative of shelling out via `child_process` is prohibited by Pitfall 5.
- **Fix:** Added three new method signatures to `GitOnlyOps` in `sdk/src/vcs/types.ts` (mirroring the `revert` extension shape from Task 1.5) and implementations in the git backend's `gitOnly` Object.freeze block, alphabetically grouped with the existing entries. No new shell-string concatenation in any path; args always built via array.
- **Files modified:** `sdk/src/vcs/types.ts`, `sdk/src/vcs/backends/git.ts`
- **Commit:** `e5b5c932` (folded into Task 2 because the methods are inseparable from the SDK shims that consume them)

**2. `--from` revspec on `restore` accepts only refname-shape values**
- **Found during:** Task 2 test authoring
- **Issue:** The plan said "Validate `--from` refname", but `--from` semantically accepts a revspec (which can include `~`, `^`, `..`). `validateRefname` rejects those characters. The plan's intent is anti-argv-injection (reject leading `-`), but the validator is stricter.
- **Fix:** Kept `validateRefname` as written (it satisfies the threat-model T-05.01-02 mitigation cited in the plan), and adjusted the test to use a refname-shape value (`main`) rather than a revspec. Callers wanting `HEAD~1` semantics will need to first resolve the revspec to a bookmark; this matches the spirit of CR-01's defense-in-depth pair (validator + `--` separator).
- **Files modified:** `sdk/src/query/restore.test.ts`

## Hand-off to Plans 05-02..05-04

The 11 new verbs are now reachable via `gsd-sdk query <verb>` for downstream PROMPT rewrites:

- **CMD-01..05 (Plan 05-02):** `push`, `log`, `status`, `diff`, `current-branch`, `head-ref` are the workhorses for `execute-phase.md` and `quick.md` rewrites.
- **CMD-06..09, CMD-11 (Plan 05-03):** `revert` (with its destructive-jj annotation), `reset`, `merge`, `branch-list`, `restore` are the lifecycle primitives for `undo.md` / `complete-milestone.md` / `code-review.md` / agent prompt rewrites.
- **CMD-10 (Plan 05-04):** Brownfield commands lean on `status`, `log`, `current-branch`, `branch-list` for repo introspection inside synth-jj-fixture integration tests.

All shims accept `--cwd` as a universal override; mutation verbs return `{ ok, exitCode, stdout, stderr, ... }`; read-only verbs include `ok: true` for shape uniformity.

## Self-Check: PASSED

Verified all 4 commits present:
- `37a5b054` Task 1 (A3 fix)
- `822c9322` Task 1.5 (vcs.gitOnly.revert)
- `e5b5c932` Task 2 (11 verb shims + tests)
- `5936b841` Task 3 (registration + D-31 edits)

Verified key files exist (sampled):
- `sdk/src/query/push.ts` FOUND
- `sdk/src/query/restore.test.ts` FOUND
- `sdk/src/vcs/__tests__/git-revert.test.ts` FOUND (Task 1.5)
- `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md` MODIFIED

Verification commands:
- `pnpm tsc --noEmit` → exit 0
- 11 paired tests + 3 catalog/resolution/topology tests → 60 passing
- `node scripts/lint-vcs-no-raw-git.cjs` → 0 violations
