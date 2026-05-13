---
phase: 04
plan: 01
subsystem: vcs-adapter
tags:
  - shape-commit
  - workspace
  - jj-native
  - hook-bridge
  - ci-matrix
dependency_graph:
  requires:
    - Phase 3 plans 03-01..03-07 (jj backend skeleton + verb groups complete)
    - sdk/src/vcs/hook-bridge.ts (Phase 1 D-05 — module-private fireHook)
    - sdk/src/vcs/parse/jj-workspace-list.ts (Phase 3 plan 03-02 — NDJSON parser)
  provides:
    - VcsWorkspace.reap signature (real body in plan 04-04)
    - VcsAdapterCommon.acquireWriteLock signature (real body in plan 04-03)
    - VcsIncompleteSubagentsError class (consumer in plan 04-05 / commit() gate)
    - WorkspaceAdd.name optional field (plan 04-05 octopus helper threads it)
    - ReapResult + IncompleteWorkEntry interfaces (plan 04-04 + plan 06 SDK query)
    - exported fireHook (plans 04-05 commit() / push() callers + plan 06 SDK query)
    - jj-native CI matrix axis (continue-on-error per D-22)
    - real `workspace.{add,forget,prune}` bodies on jj backend
    - tests/helpers.cjs + vcs-fixture.ts jj-native init branch
  affects:
    - .github/workflows/test.yml (matrix expanded git → jj-colocated → jj-native)
    - per-verb allowlist (BACKENDS_AVAILABLE_FOR_VERB) for workspace.{add,forget,list,context,prune}
tech-stack:
  added: []
  patterns:
    - verb-shape commit (Phase 2.1 D-21 exception — types + jj + git in one revision)
    - per-verb allowlist flip on body-landing (Phase 3 D-12 / TEST-06 skip-not-throw)
    - mkdir -p before jj workspace add (D-17 / Pitfall 4)
    - `--` end-of-options separator at argv positions with user-influenced positionals (T-04.01-01/02)
    - documented success no-op for cross-backend surface parity (workspace.prune on jj 0.41)
    - sidecar deferral via VcsNotImplementedError stub + per-verb allowlist gate (workspace.reap, acquireWriteLock)
key-files:
  created: []
  modified:
    - sdk/src/vcs/types.ts
    - sdk/src/vcs/backends.ts
    - sdk/src/vcs/backends/jj.ts
    - sdk/src/vcs/backends/git.ts
    - sdk/src/vcs/hook-bridge.ts
    - sdk/src/vcs/__tests__/vcs-fixture.ts
    - sdk/src/vcs/__tests__/backends.test.ts
    - sdk/src/vcs/__tests__/jj-skeleton.test.ts
    - sdk/src/vcs/__tests__/jj-workspace.test.ts
    - sdk/src/vcs/__tests__/adapter-contract.test.ts
    - .github/workflows/test.yml
    - tests/helpers.cjs
decisions:
  - id: D-17
    where: jj.ts workspace.add
    summary: mkdirSync(dirname(input.path), {recursive:true}) lands BEFORE the jj invocation — Pitfall 4 directly addressed.
  - id: D-04
    where: jj.ts workspace.add + WorkspaceAdd.name type
    summary: input.name threads through as `--name <NAME>`; defaults to basename when omitted (mirrors jj's own default).
  - id: D-07
    where: hook-bridge.ts
    summary: fireHook visibility flipped from module-private to exported. Body unchanged. Plans 05-06 wire callers.
  - id: D-19
    where: types.ts + jj.ts + git.ts acquireWriteLock
    summary: Per-workspace flock primitive declared on VcsAdapterCommon. Jj stub throws (plan 03 sidecar). Git is documented no-op (kernel-enforces via .git/index.lock).
  - id: D-22
    where: .github/workflows/test.yml
    summary: Third backend matrix axis `jj-native` added with continue-on-error. Same jj 0.41.0 binary install as jj-colocated; lane difference is fixture init.
  - id: D-29
    where: jj.ts workspace.prune
    summary: jj 0.41 has no `jj workspace prune` subcommand. Adapter returns documented success no-op for cross-backend surface parity; callers wanting reap semantics call workspace.reap() (plan 04-04 owns body).
metrics:
  duration: 13m26s
  completed_date: 2026-05-13
  tasks: 3
  files: 12
  commits: 5
---

# Phase 4 Plan 1: Workspaces Shape Commit Summary

Land the Phase 4 verb-shape revision: extend `VcsAdapter` types for workspaces + concurrency primitives + crash-recovery error class, replace Phase 3's `workspace.{add,forget,prune}` VcsNotImplementedError stubs with real jj-side bodies, mirror the surface on git, flip the per-verb allowlist to admit both jj backends for the five workspace verbs, add `jj-native` to `BACKENDS_AVAILABLE` and to the CI matrix (continue-on-error per D-22), and flip `fireHook` from module-private to exported. Plans 02-07 fill the bodies of the new sidecar verbs (`workspace.reap`, `acquireWriteLock`) and wire orchestrator/hook callers without re-touching the shape.

## What Landed

1. **Type surface** (`sdk/src/vcs/types.ts`):
   - `WorkspaceAdd.name?: string` — `--name <NAME>` thread-through for the jj backend (D-04).
   - `VcsWorkspace.reap(opts: { phaseNamePrefix; phaseDir }): ReapResult` — batch-reap signature (D-29: returns ReapResult, never throws; phase-merge gate moves to `commit({phaseMergeFor})` per D-14).
   - `VcsAdapterCommon.acquireWriteLock(workspace, opts?)` — RAII per-workspace flock primitive (D-19; jj sentinel at `.jj/working_copy/gsd-lock` per Pitfall 6, git no-op).
   - `ReapResult` + `IncompleteWorkEntry` interfaces — change_id native (D-06: no commit_id encoding in `.planning/`).
   - `VcsIncompleteSubagentsError` class — Phase-4-D-14 typed error class mirrors `VcsBookmarkDivergentError` shape; carries `entries: readonly IncompleteWorkEntry[]`, `phaseDir`, optional `hint`.

2. **jj backend** (`sdk/src/vcs/backends/jj.ts`):
   - `workspace.add` real body — `mkdirSync(dirname(input.path), {recursive:true})` (D-17), `jj workspace add` with optional `-r <baseRef>` and `--name <NAME>`, security `--` separator before the user-influenced path positional (T-04.01-01).
   - `workspace.forget` real body — resolves path → name via `list()` (jj forgets by name, not path), invokes `jj workspace forget --` with security separator (T-04.01-02). Pitfall 3 comment records that `forget` does NOT remove the on-disk dir — that's reap's job.
   - `workspace.prune` documented success no-op returning the zero-shape ExecResult; jj 0.41 has no `jj workspace prune` subcommand.
   - `workspace.reap` Phase 4 stub throwing `VcsNotImplementedError` (plan 04-04 owns real body in `sdk/src/vcs/jj/reap.ts`).
   - Top-level `acquireWriteLock` Phase 4 stub throwing `VcsNotImplementedError` (plan 04-03 owns real body in `sdk/src/vcs/jj/lock.ts`); wired into the returned adapter alongside `commit/push/fetch/...`.
   - Imports: `mkdirSync` from `node:fs`; `basename`, `dirname` from `node:path`; `ReapResult` type from `../types.js`.

3. **git backend** (`sdk/src/vcs/backends/git.ts`):
   - `workspace.reap` matching Phase 4 stub throwing `VcsNotImplementedError` (plan 04-04 owns body on both backends).
   - Top-level `acquireWriteLock` documented no-op returning `{ release: () => {} }` per D-19 (kernel-enforces via `.git/index.lock`); wired into the returned adapter.
   - Imports: `VcsNotImplementedError` (newly used), `ReapResult` type.

4. **backends.ts allowlist**:
   - `BACKENDS_AVAILABLE` extended `['git','jj-colocated']` → `['git','jj-colocated','jj-native']`.
   - `workspace.{add,forget,list,context,prune}` allowlist entries flipped to `['git','jj-colocated','jj-native']`.
   - New entries: `workspace.reap` and `acquireWriteLock` gated to `['git']` until plans 04-04 and 04-03 land their real bodies.

5. **hook-bridge.ts**:
   - `function fireHook` → `export function fireHook`. Body unchanged.
   - Comment updated to reflect the Phase-4 visibility flip; "Phase 4 will wire" → "Phase 4 plan 01 exports it; plans 05-06 wire callers".

6. **CI matrix** (`.github/workflows/test.yml`):
   - `backend: [git, jj-colocated]` → `backend: [git, jj-colocated, jj-native]`.
   - `continue-on-error` now fires on both `jj-colocated` and `jj-native` matrix cells (allow-failure window through Phase 4; both graduate to required-blocking in Phase 5 per D-11).
   - `Install jj` step `if:` condition expanded to fire on `jj-native` too (same jj 0.41.0 binary; lane difference is fixture init).

7. **Test fixtures**:
   - `tests/helpers.cjs` vcsTest gains `jj-native` dispatch branch using `jj git init --no-colocate` (NOT `--no-git` as the plan-action speculated — see Open Questions below).
   - `sdk/src/vcs/__tests__/vcs-fixture.ts` mirrors the same dispatch with a new `initJjNativeRepo()` helper.

8. **Boundary-marker tests flipped** (Rule 3 — see Deviations):
   - `jj-skeleton.test.ts`: workspace.add/forget assertions flipped from `.toThrow(VcsNotImplementedError)` to `.not.toThrow(VcsNotImplementedError)`; workspace.prune flipped to `.not.toThrow()`; new assertions for workspace.reap + acquireWriteLock stubs.
   - `jj-workspace.test.ts`: parallel flip; the prune assertion now checks the documented zero-shape ExecResult.
   - `backends.test.ts`: BACKENDS_AVAILABLE assertion + workspace verb allowlist assertions + parseBackendsEnv defaults all updated for the Phase-4 active state.
   - `adapter-contract.test.ts`: `parseBackendsEnv('jj-native')` assertion flipped from `unavailable=['jj-native']` to `available=['jj-native']`.

## Pitfalls Confirmed

| Pitfall | Source | Confirmation |
|---------|--------|--------------|
| **D-17 / Pitfall 4** | `jj workspace add` does NOT auto-create intermediate dirs | Runtime smoke-tested: `vcs.workspace.add({path:'$TMP/ws-a/nested/deep', name:'ws-a'})` succeeded with the mkdirSync prelude; without it, jj would error "Cannot access … No such file or directory" — confirmed at the lower jj layer when the prelude is removed. |
| **Pitfall 3** | `jj workspace forget` does NOT `rm -rf` the on-disk dir | Doc comment installed inside `workspace.forget` body; reap (plan 04-04) absorbs the on-disk cleanup concern. |
| **Pitfall 5** | `jj workspace list` does NOT take `--no-graph` | Confirmed: `workspace.list()` body (unchanged from plan 03-06) uses `-T 'json(self) ++ "\\n"'` only — NO `--no-graph`. NDJSON parse path validated end-to-end in the runtime smoke test (default + ws-a both surfaced). |
| **D-04 (jj workspace add `--name`)** | NAME-flag positional thread-through | Runtime smoke-tested: `--name ws-a` correctly created the workspace at the requested path and `list()` surfaced `path: 'ws-a'`; `forget('ws-a')` resolved through `list()` and forgot the right workspace. |

## Threats Mitigated

- **T-04.01-01 (Tampering on jj.ts workspace.add argv):** `--` end-of-options separator inserted immediately before `input.path` positional. Verified via grep: `args.push('--', input.path)` appears exactly once.
- **T-04.01-02 (Tampering on jj.ts workspace.forget argv):** `--` separator inserted before `name` positional. Verified via grep: `jjArgv('workspace', 'forget', '--', name)` appears exactly once.
- **T-04.01-05 (DoS via missing mkdir -p):** `mkdirSync(dirname(input.path), {recursive:true})` installed at the head of `workspace.add` body.
- **T-04.01-SC (Package legitimacy):** Zero new runtime deps. No new entries in package.json on either workspace.

Deferred per plan:
- **T-04.01-03 (workspace name flag argv):** Validator integration scheduled for plan 07 (cr-01 fold-in). Plan 04-01 ships only the `--` end-of-options separator (which protects the trailing path positional, NOT the `--name <NAME>` flag positional).
- **T-04.01-06 (acquireWriteLock workspace path):** Plan 03 mitigates inside `sdk/src/vcs/jj/lock.ts`. Plan 04-01 stub throws `VcsNotImplementedError` — no surface exposed yet.

## Verification Gate Outcomes

| Gate | Result |
|------|--------|
| `cd sdk && pnpm tsc --noEmit` | **PASS** (exit 0) |
| `node scripts/lint-vcs-no-raw-git.cjs` | **PASS** (909 files scanned, 0 violations) |
| `cd sdk && pnpm build:cjs` | **PASS** (dist-cjs/ tree produced; `BACKENDS_AVAILABLE` includes `'jj-native'` at runtime) |
| Runtime smoke test (`jj git init --no-colocate` + `vcs.workspace.add({nested path, name})` + `list()` + `forget()`) | **PASS** on jj 0.41.0 |
| `GSD_TEST_BACKENDS=git pnpm vitest run src/vcs/` | **PASS** (excluding a single GPG-environmental flake — see Pre-existing Issues below) |
| `GSD_TEST_BACKENDS=git pnpm vitest run -t workspace` | **PASS** (43 tests pass, 0 failures) |
| `GSD_TEST_BACKENDS=jj-colocated pnpm vitest run -t workspace` | **PASS** (43 tests pass, 0 failures) |
| `actionlint .github/workflows/test.yml` | **SKIPPED** (not installed locally; planner permitted skip with documentation) |

## Deviations from Plan

### Rule 3 (auto-fix blocking issues) — necessary to complete the verb-shape commit

**1. [Rule 3 - Blocking] Flipped Phase 3 boundary-marker tests to Phase 4 active state**
- **Found during:** Task 3 verification (`GSD_TEST_BACKENDS=git pnpm vitest run`)
- **Issue:** Five test bodies in `backends.test.ts`, `jj-skeleton.test.ts`, `jj-workspace.test.ts`, and `adapter-contract.test.ts` explicitly pinned the Phase 3 deferred state ("workspace.add still throws VcsNotImplementedError (Phase 4 owns)", "BACKENDS_AVAILABLE is [git, jj-colocated] in Phase 3", "parseBackendsEnv('jj-native') yields empty intersection in Phase 3"). These were the explicit gates Phase-3 planners installed for Phase 4 to flip; without flipping them, the verb-shape commit is incomplete and CI is red.
- **Fix:** Mirrored the wired-in-plan-03-03/03-05/03-06 probe pattern: `.not.toThrow(VcsNotImplementedError)` for the newly-active verbs; `.not.toThrow()` for workspace.prune (documented no-op); new `.toThrow(VcsNotImplementedError)` assertions for workspace.reap and acquireWriteLock to maintain the deferred-stub invariant for the new verbs. backends.test.ts expanded to include the new verb keys.
- **Files modified:** `sdk/src/vcs/__tests__/backends.test.ts`, `sdk/src/vcs/__tests__/jj-skeleton.test.ts`, `sdk/src/vcs/__tests__/jj-workspace.test.ts`, `sdk/src/vcs/__tests__/adapter-contract.test.ts`
- **Commits:** `bdca4b6c`, `1d708dec`

**2. [Rule 3 - Blocking] Empirically corrected the jj-native init flag from `--no-git` to `--no-colocate`**
- **Found during:** Task 3 (writing the jj-native dispatch branch in tests/helpers.cjs)
- **Issue:** The plan action speculated `jj git init --no-git` as the non-colocated init form. Empirically verified against jj 0.41.0: `--no-git` is not a valid flag; the actual non-colocated flag is `--no-colocate` (and `--colocate` IS THE DEFAULT on 0.41, so it MUST be explicitly disabled). The bare form `jj init` is also unsupported (yields "unrecognized subcommand 'init'").
- **Fix:** Used `jj git init --no-colocate` in both `tests/helpers.cjs` and `sdk/src/vcs/__tests__/vcs-fixture.ts`. Comment in helpers.cjs records the empirical verification for future readers.
- **Files modified:** `tests/helpers.cjs`, `sdk/src/vcs/__tests__/vcs-fixture.ts`
- **Commit:** `c5d3038d`

### Rule 2 (auto-add missing critical functionality) — none in this plan

### Rule 4 (architectural ask) — none

## Stubs Acknowledged (Per-verb Allowlist Gates Access)

The following stubs are intentional per the plan; they throw `VcsNotImplementedError` and are gated by the per-verb allowlist (`BACKENDS_AVAILABLE_FOR_VERB`) to `['git']` only. Contract tests skip them on jj backends via TEST-06 skip-not-throw discipline.

1. **`workspace.reap`** (`sdk/src/vcs/backends/jj.ts:889`, `sdk/src/vcs/backends/git.ts`) — plan 04-04 owns the real body in `sdk/src/vcs/jj/reap.ts` (jj side) plus the git `git worktree remove` loop mirror.
2. **`acquireWriteLock`** (`sdk/src/vcs/backends/jj.ts:903`) — plan 04-03 owns the real body in `sdk/src/vcs/jj/lock.ts`. Git side is a documented no-op (not a stub).

These are tracked here per the executor SUMMARY discipline so the verifier can confirm plan 04-03/04-04 close them.

## Open Questions

1. **`jj git init --no-colocate` is the canonical non-colocated form on 0.41.0** — confirmed empirically during this plan; the plan-action's `--no-git` hypothesis is invalid. This finding propagates to plan 04-04 (reap) which the planner suggested may set up its own multi-workspace fixtures.
2. **The `--name <NAME>` flag argument is NOT protected by the `--` end-of-options separator.** The separator only guards the trailing path positional in `workspace.add`. Plan 07 cr-01 fold-in is scheduled to add `validateRefname` to flow workspace names through the validator alongside bookmark names — this is documented in the threat register row T-04.01-03 and is NOT in scope for plan 04-01.
3. **Workspace name slug convention (`phase-{N}-subagent-{idx}`)**: D-04 leaves it to the planner whether `{N}` is zero-padded. Plan 04-01 does NOT exercise the slug shape directly — `WorkspaceAdd.name` is a free-form string at the type level. Plan 04-05 octopus helper picks the slug.

## Pre-existing Issues (Not Caused by Plan 04-01)

When running the full SDK vitest suite (`GSD_TEST_BACKENDS=git pnpm vitest run`) under parallel execution, several non-VCS test files (gsd-tools, phase-runner-types, query-subprocess-adapter, query-dispatch, skills, state, validate, exec-env-passthrough) reported transient failures. Each of these tests **passes in isolation** when invoked with a single test-file argv. This is a parallel-execution / test-pollution issue surfaced by vitest's concurrency, unrelated to plan 04-01. STATE.md already records pre-existing failures of similar shape (`commit.test.ts:304`, `config-mutation.test.ts:441`). Logged here for the maintenance bucket; out-of-scope per the executor scope boundary rule.

Additionally, `jj-parsers.test.ts` reported one GPG-environmental flake during a parallel run (`GPG failed with exit status: 2: gpg: signing failed: Cannot allocate memory`). The test passes both stashed and unstashed when run in isolation — confirmed via `git stash && vitest run …` toggling.

## Files

**Modified (12):**
- `sdk/src/vcs/types.ts` — +77 / -0 (full Phase 4 type surface)
- `sdk/src/vcs/backends/jj.ts` — +89 / -8 (real workspace.{add,forget,prune} + stubs for reap + acquireWriteLock)
- `sdk/src/vcs/backends/git.ts` — +20 / -1 (reap stub + acquireWriteLock no-op + adapter wiring)
- `sdk/src/vcs/backends.ts` — +14 / -5 (BACKENDS_AVAILABLE + allowlist flip + new verb entries)
- `sdk/src/vcs/hook-bridge.ts` — +1 / -1 (export keyword + comment refresh)
- `sdk/src/vcs/__tests__/vcs-fixture.ts` — +20 / -2 (initJjNativeRepo helper + dispatch branch)
- `sdk/src/vcs/__tests__/backends.test.ts` — +24 / -14 (Phase 4 active-state assertions)
- `sdk/src/vcs/__tests__/jj-skeleton.test.ts` — +29 / -10 (workspace verb flips + new stub assertions)
- `sdk/src/vcs/__tests__/jj-workspace.test.ts` — +33 / -13 (parallel flips for the contract test)
- `sdk/src/vcs/__tests__/adapter-contract.test.ts` — +10 / -4 (parseBackendsEnv jj-native boundary flip)
- `.github/workflows/test.yml` — +9 / -5 (matrix axis + install gate + continue-on-error)
- `tests/helpers.cjs` — +13 / -2 (jj-native vcsTest dispatch via `jj git init --no-colocate`)

**Commits:**
- `ae38f396` feat(04-01): extend VcsAdapter type surface for Phase 4 workspaces
- `dddd7b11` feat(04-01): replace jj workspace stubs with real bodies + extend git mirror
- `c5d3038d` feat(04-01): flip allowlist, export fireHook, add jj-native CI lane + fixtures
- `bdca4b6c` test(04-01): flip Phase 3 boundary-marker tests to Phase 4 active state
- `1d708dec` test(04-01): flip adapter-contract parseBackendsEnv(jj-native) boundary

## Self-Check: PASSED

All 12 files-modified and the SUMMARY.md exist on disk; all 5 commits exist in `git log`. Verified via `[ -f <path> ]` on each `key-files.modified` entry and `git log --oneline | grep <hash>` on each commit hash.
