---
phase: 01-adapter-foundation-git-backend
plan: 02
subsystem: vcs-adapter-contract
tags: [vcs, adapter, types, exec, branded-types, factory, backends]
dependency_graph:
  requires:
    - "Plan 01-01 — sdk/dist-cjs build pipeline"
  provides:
    - "VcsAdapter discriminated union (GitVcsAdapter | JjVcsAdapter) — every consumer in plans 03+ compiles against this"
    - "createVcsAdapter(cwd, opts?) factory with .jj > .git auto-detect + GSD_VCS env override"
    - "vcsExec / execGit 5-field spawn wrapper — the primitive plan 03 wraps for every git verb"
    - "RevisionExpr brand + expr.{head,parent,bookmark,remote} factories (no expr.raw — D-12)"
    - "toGitRev / toJjRev per-dialect translators (jj-rev is a Phase-3 stub with locked mappings)"
    - "BACKENDS_DECLARED / BACKENDS_AVAILABLE / parseBackendsEnv — single TS source for the test matrix"
    - "fireHook(cwd, stage, ctx) hook-bridge primitive (60s timeout, no-op when hook absent)"
  affects:
    - "Plan 01-03 (test fixture + matrix wiring) — tests/helpers.cjs require()s sdk/dist-cjs/vcs/backends.js for parseBackendsEnv"
    - "Plan 01-04 (lint + git backend) — git backend implementation imports vcsExec, types, expr, parse/git-rev"
    - "Phase 3 (jj backend) — implements VcsAdapterCommon for kind:'jj'; toJjRev mappings already locked here"
tech_stack:
  added: []
  patterns:
    - "Discriminated union with literal `kind` field (D-06) — narrowing makes gitOnly accessible only on the git branch"
    - "Branded string brand via `unique symbol` (D-09) — runtime is just a string, type rejects raw-string assignment"
    - "Frozen plain-object factory (each nested namespace `Object.freeze`d independently — shallow freeze leaks)"
    - "Stub-throws-on-method swap-in safety — plan 03 replaces createGitAdapterStub body without changing factory signature"
    - "Static `@ts-expect-error` test-d harness — gate goes red if type narrowing regresses ('Unused @ts-expect-error directive' diagnostic)"
key_files:
  created:
    - sdk/src/vcs/exec.ts
    - sdk/src/vcs/types.ts
    - sdk/src/vcs/expr.ts
    - sdk/src/vcs/parse/git-rev.ts
    - sdk/src/vcs/parse/jj-rev.ts
    - sdk/src/vcs/backends.ts
    - sdk/src/vcs/hook-bridge.ts
    - sdk/src/vcs/index.ts
    - sdk/src/vcs/__tests__/exec.test.ts
    - sdk/src/vcs/__tests__/expr.test.ts
    - sdk/src/vcs/__tests__/parse-git-rev.test.ts
    - sdk/src/vcs/__tests__/backends.test.ts
    - sdk/src/vcs/__tests__/index.test.ts
    - sdk/src/vcs/__tests__/types-gitonly.test-d.ts
  modified:
    - sdk/package.json
  deleted:
    - sdk/src/vcs/_placeholder.ts
decisions:
  - "Plan 01-02: build:cjs script writes dist-cjs/package.json {type:commonjs} shim — without it, sdk's outer type:module made dist-cjs/*.js load as null-prototype ESM under Node 25 require(esm) interop; every consumer of dist-cjs would break (Rule 3 blocking fix)."
  - "Plan 01-02: parseBackendsEnv returns the structured B-4 shape {available, requested, unavailable} rather than a flat array — exposes the silent-zero-test failure mode (user requests jj backend, none available, unavailable.length>0 surfaces it for the caller to warn)."
  - "Plan 01-02: createGitAdapterStub returns a frozen object whose every method throws 'not yet implemented' so plan 03 swaps in createGitAdapter without changing the factory signature; any caller that hits the stub fails loudly."
metrics:
  duration: "~12m"
  completed: "2026-05-09"
---

# Phase 01 Plan 02: VCS Adapter Contract Surface — Summary

Landed the TypeScript adapter contract and exec/expr/factory primitives — `VcsAdapter` discriminated union (with branch-typed `gitOnly` per D-07), 5-field `vcsExec` byte-identical to `core.cjs:742-758`, branded `RevisionExpr` with `expr.{head,parent,bookmark,remote}` factories and per-dialect translators (git real, jj stub), `BACKENDS_DECLARED/AVAILABLE` constants with the structured `parseBackendsEnv` (B-4 shape), and a deeply-frozen stub `createVcsAdapter` factory that plan 03 will swap a real git backend into without changing the signature.

## Tasks Completed

| Task | Name                                                                    | Commit     |
| ---- | ----------------------------------------------------------------------- | ---------- |
| 1    | Create exec.ts (vcsExec + VcsExecError) + types.ts (full surface)       | `rorltztvzpzmvmwuvrxlvsztnxzklyvx` |
| 2    | Create expr.ts + parse/{git-rev,jj-rev}.ts (factories + translators)    | `vroosrlwkryoookookzsqsvzknnkvwtv` |
| 3    | Create backends.ts + hook-bridge.ts + index.ts (createVcsAdapter)       | `wqonnmwpovzyoupskkuwkrxpuykurltw` |
| 4    | Add types-gitonly.test-d.ts (static D-07 narrowing assertions)          | `zoxqntmltqxynpmkxtxvznvxqmkyxzkn` |

## Final File Tree

```
sdk/src/vcs/
├── backends.ts            (51 lines) — BACKENDS_DECLARED/AVAILABLE + parseBackendsEnv
├── exec.ts                (99 lines) — vcsExec, execGit, VcsExecError, DEFAULT_VCS_TIMEOUT_MS
├── expr.ts                (71 lines) — expr factory namespace + parseExpr (internal)
├── hook-bridge.ts         (27 lines) — fireHook primitive (.githooks/<stage>)
├── index.ts               (94 lines) — createVcsAdapter factory + re-exports
├── types.ts              (187 lines) — VcsAdapter union + ExecResult + RevisionExpr brand + all I/O types
├── parse/
│   ├── git-rev.ts         (21 lines) — toGitRev: RevisionExpr → git CLI dialect
│   └── jj-rev.ts          (22 lines) — toJjRev: stub with locked Phase-3 mappings
└── __tests__/
    ├── exec.test.ts                (81 lines, 5 tests)
    ├── expr.test.ts                (37 lines, 6 tests)
    ├── parse-git-rev.test.ts       (39 lines, 8 tests)
    ├── backends.test.ts            (69 lines, 8 tests)
    ├── index.test.ts               (62 lines, 5 tests)
    └── types-gitonly.test-d.ts     (53 lines, 0 runtime — type-only B-2 gate)
```

Total: 8 production files (572 lines), 5 vitest spec files (288 lines, 32 tests), 1 type-only test-d (53 lines).

## VcsAdapter Union Shape (excerpt from types.ts)

```typescript
export type VcsKind = 'git' | 'jj';

declare const __vcsRevisionBrand: unique symbol;
export type RevisionExpr = string & { readonly [__vcsRevisionBrand]: 'RevisionExpr' };

export interface VcsAdapterCommon {
  readonly cwd: string;
  commit(input: CommitInput): CommitResult;
  log(opts?: LogOpts): LogEntry[];
  status(opts?: StatusOpts): StatusResult;
  diff(opts?: DiffOpts): DiffResult;
  refs: VcsRefs;
  workspace: VcsWorkspace;
  hooks: VcsHooks;
  findConflicts(opts: { scope: 'all' | 'working-copy' }): ConflictResult[];
  push(opts?: PushOpts): ExecResult;
  fetch(opts?: FetchOpts): ExecResult;
}

export interface GitOnlyOps {
  createAnnotatedTag(name: string, message: string, rev: RevisionExpr): void;
  version(): string;
  // D-12: NO `raw` escape hatch.
}

export interface GitVcsAdapter extends VcsAdapterCommon {
  readonly kind: 'git';
  readonly gitOnly: GitOnlyOps;
}

export interface JjVcsAdapter extends VcsAdapterCommon {
  readonly kind: 'jj';
  // NO gitOnly — accessing vcs.gitOnly on an unnarrowed VcsAdapter is a TS error.
}

export type VcsAdapter = GitVcsAdapter | JjVcsAdapter;
```

The `unique symbol` brand means `'HEAD'` (raw string) is NOT assignable to a `RevisionExpr` parameter — callers must construct via `expr.head()` etc. (D-10).

## Stub `createVcsAdapter` Behavior (Plan 03 Swap-In Contract)

`createVcsAdapter(cwd, opts?)` returns a deeply-frozen object whose `kind === 'git'` and whose `cwd` is preserved, but every method (`commit`, `log`, `status`, `diff`, `refs.bookmarks.*`, `workspace.*`, `hooks.fire`, `findConflicts`, `push`, `fetch`, `gitOnly.*`) throws `GSDError('vcs.<verb> not yet implemented (plan 03 wires the git backend)', ErrorClassification.Blocked)`.

**Plan 03 contract:** replace the body of `createGitAdapterStub` (or rename to `createGitAdapter`) so each method shells through `vcsExec(cwd, 'git', [...])` and parses the output. The factory signature `createVcsAdapter(cwd, opts) → VcsAdapter` does not change. No caller in plans 04+ that gets the stub today can silently accept it: hitting any method fails loudly with a `Blocked` GSDError.

The freeze depth is verified in `index.test.ts`:
- `Object.isFrozen(vcs)` → true
- `Object.isFrozen(vcs.refs)` → true
- `Object.isFrozen(vcs.refs.bookmarks)` → true
- `Object.isFrozen(vcs.workspace)` → true
- `Object.isFrozen(vcs.hooks)` → true
- `Object.isFrozen(vcs.gitOnly)` → true (when narrowed to GitVcsAdapter)

## Test Results

`pnpm exec vitest run --project unit src/vcs/__tests__/{exec,expr,parse-git-rev,backends,index}.test.ts`:

```
✓ src/vcs/__tests__/expr.test.ts (6 tests) 2ms
✓ src/vcs/__tests__/backends.test.ts (8 tests) 2ms
✓ src/vcs/__tests__/parse-git-rev.test.ts (8 tests) 1ms
✓ src/vcs/__tests__/index.test.ts (5 tests) 132ms
✓ src/vcs/__tests__/exec.test.ts (5 tests) 155ms

Test Files  5 passed (5)
     Tests  32 passed (32)
  Duration  342ms
```

`pnpm exec tsc --noEmit -p tsconfig.json`:

```
exit 0
```

The type-only `types-gitonly.test-d.ts` was negative-tested by mutating `JjVcsAdapter` to accept `gitOnly` — tsc reported all 3 `@ts-expect-error` directives as "Unused", confirming the gate fires when narrowing regresses (B-2 verification).

## Plan-03 Hand-off Notes

The following stubs in `sdk/src/vcs/index.ts` are designed to be replaced by plan 03's git backend implementation:

| Stub | Replacement target | Notes |
| --- | --- | --- |
| `createGitAdapterStub` | `createGitAdapter(cwd: string): GitVcsAdapter` | Rename and wire each verb to `vcsExec(cwd, 'git', [...])`. |
| `vcs.commit({...})` | Real impl: stage files via `git add`, run `git commit`, parse hash via `git rev-parse --short HEAD` | Mirror commands.cjs:300-415 commit pipeline. |
| `vcs.log(opts)` | `git log --pretty=format:...` parser | LogEntry shape locked in types.ts. |
| `vcs.status({porcelain})` | `git status --porcelain` parser | Use existing porcelain-parse helpers from worktree-safety.cjs where applicable. |
| `vcs.diff({staged, nameOnly, rev, paths})` | `git diff [--cached] [--name-only] [<rev>] [-- <paths>]` | rev parameter goes through `toGitRev(rev)`. |
| `vcs.refs.head/parent` | Pre-built `expr.head()` / `expr.parent()` constants (RevisionExpr) | Currently the stub uses raw strings cast as RevisionExpr — replace with proper expr-derived constants. |
| `vcs.refs.bookmarks.{list,create,move,delete,exists}` | `git branch --format=...`, `git branch <name> <rev>`, `git branch -m`, `git branch -d`, `git show-ref --verify` | Per RESEARCH Q2 — list returns local branches only (no remotes). |
| `vcs.workspace.{add,forget,list}` | Wrap `git worktree add/remove/list --porcelain` | Delegate parse to existing `readWorktreeList` in worktree-safety.cjs (DI hook already present). |
| `vcs.hooks.fire(stage, ctx)` | Delegate to `fireHook(cwd, stage, ctx)` from `hook-bridge.ts` (already implemented in this plan). |
| `vcs.findConflicts({scope})` | `git diff --name-only --diff-filter=U` for working-copy; `git log --merges --pretty=...` for all | Phase 1 git semantics; jj has its own conflict semantics in Phase 3. |
| `vcs.push({remote, ref, force})` | `git push [--force] <remote> <ref>` | `ref` goes through `toGitRev`. |
| `vcs.fetch({remote, ref})` | `git fetch <remote> [<ref>]` | `ref` is a raw refspec string here (FetchOpts.ref is `string`, not `RevisionExpr` — refspecs are git-specific syntax). |
| `vcs.gitOnly.createAnnotatedTag(name, msg, rev)` | `git tag -a <name> -m <msg> <toGitRev(rev)>` | gitOnly. |
| `vcs.gitOnly.version()` | `git --version` parser | gitOnly. |

`vcsExec`, `execGit`, `expr`, `parseExpr`, `toGitRev`, `parseBackendsEnv`, `fireHook`, all type definitions, and the test-d harness are **production-final** in this plan — plan 03 should not modify them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] dist-cjs missing `package.json` shim → Node 25 loaded compiled CJS as null-prototype ESM modules**

- **Found during:** Task 1 verify (`node -e "require('.../exec.js')"` returned an empty-keys module)
- **Issue:** Plan 01-01's build:cjs script invokes `tsc -p tsconfig.cjs.json` which emits `module.exports = ...` style CommonJS into `sdk/dist-cjs/vcs/*.js`. But sdk's outer `package.json` declares `"type": "module"`, so Node 25 + its default-on `require(esm)` interop treats every `.js` under `dist-cjs/` as ESM and produces `[Module: null prototype] {}` for any `require()`. The whole purpose of `dist-cjs/` is to be `require()`-able from `bin/lib/*.cjs` — without the shim, every consumer breaks silently.
- **Fix:** Updated `sdk/package.json`'s `build:cjs` script to chain a one-line `node -e ...` that writes `dist-cjs/package.json` containing `{"type": "commonjs"}`. Also updated `prepublishOnly` to invoke `pnpm run build:cjs` (so the shim is regenerated on publish, not just on local dev). Verified before/after: post-fix, `Object.keys(require('.../exec.js'))` → `['DEFAULT_VCS_TIMEOUT_MS', 'VcsExecError', 'vcsExec', 'execGit']`.
- **Why this is Rule 3 (not Rule 4):** No architectural change. The shim is a 2-line static JSON file that closes a gap between the existing tsconfig override (`module: commonjs`) and the published artifact's runtime resolution. Any reader of plan 01-01's SUMMARY would expect dist-cjs to be require-able; that expectation was unmet without the shim, and the verify command in the plan implicitly relies on it.
- **Files modified:** `sdk/package.json` (build:cjs + prepublishOnly scripts).
- **Commit:** `rorltztvzpzmvmwuvrxlvsztnxzklyvx` (bundled with Task 1 since Task 1's verify command was the first to surface the issue).

**2. [Cleanup] Deleted `sdk/src/vcs/_placeholder.ts`**

- **Found during:** Task 3 (real adapter modules now populate `sdk/src/vcs/`).
- **Issue:** Plan 01-01 introduced `_placeholder.ts` solely to satisfy tsc's `TS18003: No inputs were found` guard when `tsconfig.cjs.json` was scoped to an empty `src/vcs/`. Once Tasks 1–3 of this plan populate the directory with real modules, the placeholder is dead weight.
- **Fix:** `git rm sdk/src/vcs/_placeholder.ts`. Verified clean rebuild from a wiped `dist-cjs/` produces only the real artifacts (no `_placeholder.{js,d.ts}` remnants).
- **Files removed:** `sdk/src/vcs/_placeholder.ts`.
- **Commit:** `wqonnmwpovzyoupskkuwkrxpuykurltw` (bundled with Task 3 — the task that landed the last set of real source files justifying the deletion).
- **Note:** Plan 01-01's SUMMARY explicitly forecast this deletion ("Plan 01-02 may delete it once real adapter modules land"). No surprise here.

### Verification Block Re-Interpretation

The plan's automated verify blocks for Tasks 1 and 3 piped a `pnpm -F sdk test:unit -- src/vcs/__tests__/<file>.test.ts` invocation. In this workspace, `pnpm -F sdk test:unit` does NOT forward positional `--` args to vitest as a file filter; it runs the entire vitest unit project. Confirmed two pre-existing failures in unrelated suites (`src/query/commit.test.ts` and `src/query/config-mutation.test.ts`) are out of scope for this plan (per the executor's SCOPE BOUNDARY: only auto-fix issues directly caused by the current task's changes).

To gate this plan, used `cd sdk && pnpm exec vitest run --project unit src/vcs/__tests__/<files>` directly — vitest 3.x accepts file globs as positional CLI args. All 5 vcs test files pass cleanly (32 tests).

The two pre-existing failures (`commit.test.ts:304` "fatal: failed to write commit object" and `config-mutation.test.ts:441` `commit_docs` toBe(true)) are logged for the next plan or a future maintenance pass; they are not regressions introduced by 01-02.

## Authentication Gates

None encountered.

## Threat Surface

The plan's `<threat_model>` covers:
- T-01-02-01 (tampering on vcsExec args) — mitigated by argv-array spawnSync.
- T-01-02-02 (expr factory injection) — mitigated by `:` rejection in bookmark/remote.
- T-01-02-03 (stderr disclosure) — accepted; same surface as existing core.cjs:execGit.
- T-01-02-04 (hook path tampering) — mitigated by typed-literal stage + trusted cwd + existsSync gate.
- T-01-02-DOS (hook hang) — mitigated by 60s timeout in fireHook.
- T-01-02-SC (npm install slopsquat) — mitigated by adding ZERO new dependencies.

No new threat surface beyond the model. No threat-flag items.

## Known Stubs

| File | Stub | Resolution Plan |
|------|------|------------------|
| `sdk/src/vcs/index.ts` | `createGitAdapterStub` and every method it exposes throws `GSDError('not yet implemented')` | Plan 03 replaces stub body with a real `createGitAdapter(cwd)` consuming `vcsExec` for each verb. The factory signature does not change; the stub is intentional and load-bearing for swap-in safety. |
| `sdk/src/vcs/parse/jj-rev.ts` | `toJjRev` returns the locked Phase-3 dialect mappings but no jj backend consumes it yet | Phase 3 (jj backend plan) wires `toJjRev` into `createJjAdapter`. The mappings are production-final per VCS-05; only the consumer is missing. |
| `sdk/src/vcs/hook-bridge.ts` | `_env` and `_stagedFiles` are computed but unused (placeholder for Phase 4 PATH-shim wrapper per HOOK-05) | Phase 4 (jj-native hooks) wires the env channel through; for now `existsSync` gate + direct exec is the colocated-jj contract. |

These stubs are intentional and tracked. Each one fails loudly at runtime (or has its consumer arrive in a later plan). None hides incomplete behavior behind silent passes.

## Self-Check: PASSED

- `sdk/src/vcs/exec.ts` exists
- `sdk/src/vcs/types.ts` exists
- `sdk/src/vcs/expr.ts` exists
- `sdk/src/vcs/parse/git-rev.ts` exists
- `sdk/src/vcs/parse/jj-rev.ts` exists
- `sdk/src/vcs/backends.ts` exists
- `sdk/src/vcs/hook-bridge.ts` exists
- `sdk/src/vcs/index.ts` exists
- `sdk/src/vcs/__tests__/exec.test.ts` exists
- `sdk/src/vcs/__tests__/expr.test.ts` exists
- `sdk/src/vcs/__tests__/parse-git-rev.test.ts` exists
- `sdk/src/vcs/__tests__/backends.test.ts` exists
- `sdk/src/vcs/__tests__/index.test.ts` exists
- `sdk/src/vcs/__tests__/types-gitonly.test-d.ts` exists
- `sdk/src/vcs/_placeholder.ts` removed (verified absent)
- All 8 dist-cjs artifacts compile and load via require()
- Commit `rorltztvzpzmvmwuvrxlvsztnxzklyvx` exists (Task 1)
- Commit `vroosrlwkryoookookzsqsvzknnkvwtv` exists (Task 2)
- Commit `wqonnmwpovzyoupskkuwkrxpuykurltw` exists (Task 3)
- Commit `zoxqntmltqxynpmkxtxvznvxqmkyxzkn` exists (Task 4)
- 32 vitest unit tests pass
- `tsc --noEmit -p tsconfig.json` exits 0
