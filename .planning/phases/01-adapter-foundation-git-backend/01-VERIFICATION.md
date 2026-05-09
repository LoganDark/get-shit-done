---
phase: 01-adapter-foundation-git-backend
verified: 2026-05-09T15:55:00Z
status: human_needed
score: 5/5 success criteria verified
overrides_applied: 0
human_verification:
  - test: "WR-06 sentinel — audit Phase 2/3 callers for prior signal-kill→exitCode:1 collision dependency"
    expected: "No call site relied on the previous `result.status ?? 1` collapsing signal-killed processes to exit code 1; if any did, they should branch on `EXIT_CODE_SIGNAL_KILLED` (-1) explicitly."
    why_human: "Behavior change is semantic, not regex-detectable. All Phase 1 tests pass, but Phase 2 will migrate ~80 git-touching call sites — any one that did `if (result.exitCode === 1)` to mean both 'real exit 1' and 'killed by signal' will now miss the killed case. Flagged by REVIEW-FIX WR-06 as 'Requires human verification'."
---

# Phase 1: Adapter Foundation + Git Backend — Verification Report

**Phase Goal:** Land the `VcsAdapter` seam with a git-only backend and a parameterized test harness — zero behavioral change for existing call sites, zero jj code, but every future migration plugs into a stable contract.

**Verified:** 2026-05-09T15:55:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | `createVcsAdapter(cwd, opts)` constructs a frozen plain-object adapter from `sdk/src/vcs/index.ts` with namespaced sub-objects (`vcs.commit`, `vcs.workspace.*`, `vcs.refs.*`, `vcs.hooks.*`, `vcs.gitOnly.*`), and the TS source compiles to `dist-cjs/` consumable from `bin/lib/*.cjs` via plain `require()`. | VERIFIED | `sdk/src/vcs/index.ts:20` `createVcsAdapter`; `sdk/dist-cjs/vcs/index.js` exists and exports `createVcsAdapter`, `BACKENDS_AVAILABLE`, `BACKENDS_DECLARED`, `expr`, `vcsExec`, `execGit`, etc. via plain `require()`. Frozen object verified at runtime: `Object.isFrozen(adapter) === true` for adapter, `gitOnly`, `refs`, `refs.bookmarks`, `workspace`, `hooks`. CJS smoke test `tests/vcs-cjs-smoke.test.cjs` passes (2/2). |
| SC-2 | The git backend at `sdk/src/vcs/backends/git.ts` answers every adapter contract method with byte-identical `{ exitCode, stdout, stderr }` to the corresponding pre-migration inline `execSync('git …')` call (snapshot diff against pre-migration behavior is empty). | VERIFIED | 5 baselines under `tests/baselines/git-vcs/` (commands-cjs-994-diff-cached, init-cjs-1519/1538/1641, commit-ts-execGit-3field). `baseline-parity.test.ts` passes 5/5 — adapter output is byte-equivalent to captured baselines. Note: `sdk/src/vcs/exec.ts` introduces `EXIT_CODE_SIGNAL_KILLED = -1` (WR-06) — diverges from `core.cjs:752` `result.status ?? 1` only for signal-killed processes; no captured baseline exercises that path, so byte-identity holds for the 5 baseline call sites. |
| SC-3 | The `vcsTest(kind)` fixture + `describe.for([...BACKENDS])` harness exists in test helpers and runs the adapter contract suite against the `git` backend; `GSD_TEST_BACKENDS` env var selects backend subsets; CI rule "skipped-test count must not increase from main" is enforced. | VERIFIED | `sdk/src/vcs/__tests__/vcs-fixture.ts:31` `makeBackendFixture` (calls `base.extend<VcsFixture>` — vitest's test.extend); `adapter-contract.test.ts:13` `describe.for(selectedBackends())`; `tests/helpers.cjs:201` `function vcsTest(kindOrKinds, suiteFn)`; `parseBackendsEnv` sourced from `sdk/dist-cjs/vcs/backends.js` via lazy getter (single source of truth); `scripts/check-skip-count.cjs` exits 0 (`current=18 baseline=18`) and is wired into `.github/workflows/test.yml:51`. 12 vitest contract tests + 7 node:test contract tests pass. |
| SC-4 | The lint guard "jj-backend never shells out to mutating git verbs" ships with the adapter package and fails CI on violation, even though no jj backend exists yet. | VERIFIED | `scripts/lint-vcs-no-raw-git.cjs` (whole-repo default-deny) + `scripts/lint-vcs-no-raw-git.allow.json` (24 files + 18 globs); wired into `.github/workflows/test.yml:54`. Production scan: 890 files scanned, 0 violations. Fixture tests: 7/7 pass (clean repo / violation / annotation / shell-mode / bare-quote / no-space variants). Note: D-17/D-18 tightened the guard to ALL git invocations, not just mutating verbs (broader than ROADMAP wording — strictly more conservative). |
| SC-5 | `vcs.gitOnly.createAnnotatedTag()` (and other git-specific escape hatches) are reachable on the git backend; calls into `vcs.gitOnly.*` are typed such that a future jj backend errors clearly and statically when invoked. | VERIFIED | `GitVcsAdapter.gitOnly: { createAnnotatedTag, version }` in `sdk/src/vcs/types.ts:174`; `JjVcsAdapter` has NO `gitOnly` property (line 177-180). Static narrowing enforced by `sdk/src/vcs/__tests__/types-gitonly.test-d.ts` with 3 `@ts-expect-error` directives that fail tsc if narrowing regresses. Runtime: `createVcsAdapter('/tmp', {kind:'jj'})` throws `GSDError('jj backend not yet implemented (Phase 3)', Blocked)`. `gitAdapter.gitOnly.version()` returned `'git version 2.50.1 (Apple Git-155)'` in spot-check. |

**Score:** 5/5 ROADMAP success criteria verified.

### PLAN Frontmatter Truths (additional must-haves)

All 5 plans declared additional must_haves; each was verified during the per-plan SUMMARY review. Notable:

| Plan | Truth | Status |
|------|-------|--------|
| 01-01 | `pnpm -F sdk build:cjs` emits `.js` + `.d.ts` into `sdk/dist-cjs/vcs/` | VERIFIED — `sdk/dist-cjs/vcs/{index,types,exec,expr,backends,hook-bridge,parse/git-rev,parse/jj-rev,backends/git,parse/worktree-list}.{js,d.ts}` all present |
| 01-01 | `pnpm -F sdk build` runs ESM + CJS tsc and exits 0 | VERIFIED — confirmed at runtime |
| 01-01 | Root `pretest` builds CJS before tests via the pretest hook | VERIFIED — `package.json:62` `"pretest": "pnpm run build:sdk"` → `build:sdk` → `pnpm --filter @gsd-build/sdk build` → `tsc && tsc -p tsconfig.cjs.json` |
| 01-01 | `sdk/dist-cjs/` is git-ignored but listed in npm files array | VERIFIED — `.gitignore` contains `sdk/dist-cjs/`; `sdk/package.json` files array includes `dist-cjs` |
| 01-02 | TS source defines forward-complete adapter surface | VERIFIED — `types.ts:126-182` — VcsAdapterCommon, VcsRefs, VcsBookmarks, VcsWorkspace, VcsHooks, GitOnlyOps, GitVcsAdapter, JjVcsAdapter |
| 01-02 | `createVcsAdapter` auto-detects backend (.jj > .git, GSD_VCS env override) | VERIFIED — `index.ts:31-39` `resolveKind`; runtime: `.jj` exists in this repo, so `createVcsAdapter(cwd)` (no opts) throws "jj not yet implemented" |
| 01-02 | `vcs.gitOnly.x()` against unnarrowed `VcsAdapter` is a TS compile error | VERIFIED — `types-gitonly.test-d.ts` enforces this via `@ts-expect-error`; `tsc --noEmit -p tsconfig.json` exits 0 |
| 01-02 | `RevisionExpr` is branded; `expr.raw` does not exist | VERIFIED — `types.ts:19-20` brand definition; `expr.ts:63-84` only exposes head/parent/bookmark/remote |
| 01-02 | `ExecResult` has 5 fields | VERIFIED — `exec.ts:37-43` `{exitCode, stdout, stderr, timedOut, error}` |
| 01-03 | Real `createGitAdapter` replaces stub; all verbs implemented | VERIFIED — `backends/git.ts` (384 lines); `index.ts:13` imports `createGitAdapter`; runtime smoke: `gitOnly.version()` returns real git version |
| 01-03 | `vcs.workspace.list` consumes worktree porcelain parser without duplication | VERIFIED (with deviation) — CR-04 fix moved parser INTO SDK at `sdk/src/vcs/parse/worktree-list.ts` (instead of DI-importing from `bin/lib/worktree-safety.cjs`). Reason: cross-package require fails for downstream npm consumers. ADR-0004 still names worktree-safety.cjs as the policy owner; only the read-only view was re-housed. |
| 01-03 | 5 byte-identity baselines + parity test | VERIFIED — 5 JSON snapshots + `baseline-parity.test.ts` passes 5/5 |
| 01-03 | CJS smoke test proves SC-1 end-to-end | VERIFIED — `tests/vcs-cjs-smoke.test.cjs` passes 2/2 |
| 01-04 | Vitest fixture + parameterized contract suite | VERIFIED — 12 contract tests pass |
| 01-04 | `tests/helpers.cjs` `vcsTest` (hand-rolled CJS loop, NOT vitest API) | VERIFIED — `helpers.cjs:201` `function vcsTest(kindOrKinds, suiteFn)` with explicit loop |
| 01-04 | `node --test` variant against dist-cjs | VERIFIED — `tests/vcs-adapter-contract.test.cjs` passes 7/7 |
| 01-04 | Single-source-of-truth: both runners pull `BACKENDS_AVAILABLE`/`parseBackendsEnv` from `sdk/dist-cjs/vcs/backends.js` | VERIFIED — `helpers.cjs:188-189` lazy-getter requires `dist-cjs/vcs/backends.js`; vitest fixture imports from `../backends.js` (TS source). No CJS-side reimplementation. |
| 01-04 | B-4 zero-resolution warning under CI | VERIFIED — `selectedBackends()` throws under `CI=true` when requested>0 && available=0 |
| 01-04 | Skip-count guard | VERIFIED — `node scripts/check-skip-count.cjs` exits 0; current=18 baseline=18 |
| 01-05 | Default-deny scanner detects all git invocation patterns | VERIFIED — 6+ regex patterns; 7 fixture tests pass; production scan exits 0 |
| 01-05 | Allowlist exempts Phase-1-added files | VERIFIED — production scan: 890 files, 0 violations on land state |
| 01-05 | Inline annotation `// vcs-lint:allow-git-here` exempts a line | VERIFIED — fixture test passes |
| 01-05 | CI integration | VERIFIED — `.github/workflows/test.yml:54` invokes scanner |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `sdk/tsconfig.cjs.json` | CJS TS config scoped to src/vcs/ | VERIFIED | extends `./tsconfig.json`, `module: commonjs`, `outDir: dist-cjs`, `include: ['src/vcs/**/*.ts', 'src/errors.ts']` (WR-12 added errors.ts for self-documentation) |
| `sdk/src/vcs/types.ts` | VcsAdapter union + ExecResult + brands | VERIFIED | 196 lines |
| `sdk/src/vcs/exec.ts` | vcsExec/execGit + VcsExecError + EXIT_CODE_SIGNAL_KILLED | VERIFIED | 118 lines |
| `sdk/src/vcs/expr.ts` | RevisionExpr brand + factories | VERIFIED | 114 lines (WR-07 hardened bookmark validation) |
| `sdk/src/vcs/parse/git-rev.ts` | toGitRev translator | VERIFIED | 21 lines |
| `sdk/src/vcs/parse/jj-rev.ts` | toJjRev translator (Phase 3 stub, locked mappings) | VERIFIED | 22 lines, mappings: head→@, parent→@-, bookmark→name, remote→name@remote |
| `sdk/src/vcs/parse/worktree-list.ts` | SDK-local porcelain parser (CR-04 added) | VERIFIED | DI-replacement of cross-package require |
| `sdk/src/vcs/backends.ts` | BACKENDS_AVAILABLE/DECLARED + parseBackendsEnv | VERIFIED | 51 lines, B-4 structured shape |
| `sdk/src/vcs/hook-bridge.ts` | fireHook primitive | VERIFIED | 40 lines (WR-04 Windows fix applied) |
| `sdk/src/vcs/index.ts` | createVcsAdapter factory | VERIFIED | 53 lines |
| `sdk/src/vcs/backends/git.ts` | Full GitVcsAdapter implementation | VERIFIED | 384 lines, 30+ execGit call sites |
| `sdk/src/vcs/__tests__/types-gitonly.test-d.ts` | Static type-narrowing assertions | VERIFIED | 3 @ts-expect-error directives, tsc gate fires on regression |
| `sdk/src/vcs/__tests__/vcs-fixture.ts` | Vitest fixture + selectedBackends | VERIFIED | base.extend<VcsFixture> wiring, snapshot/restore |
| `sdk/src/vcs/__tests__/adapter-contract.test.ts` | describe.for parameterized suite | VERIFIED | 12 tests pass |
| `sdk/src/vcs/__tests__/baseline-parity.test.ts` | Byte-identity assertions | VERIFIED | 5 baselines, 5 tests pass |
| `sdk/src/vcs/__tests__/git-backend.test.ts` | Per-verb happy-path coverage | VERIFIED | 22 tests pass |
| `sdk/src/vcs/__tests__/parse-worktree-list.test.ts` | New per CR-04 | VERIFIED | 6 tests pass |
| `tests/baselines/git-vcs/*.snap.json` | 5 byte-identity baselines | VERIFIED | All 5 present |
| `tests/__tools__/capture-vcs-baselines.cjs` | Phase-2 regenerator helper | VERIFIED | Present |
| `tests/helpers.cjs` | vcsTest + lazy-getter exports | VERIFIED | function vcsTest at L201, lazy-getter dist-cjs requires at L188-189 |
| `tests/vcs-adapter-contract.test.cjs` | node --test contract suite | VERIFIED | 7 tests pass |
| `tests/vcs-cjs-smoke.test.cjs` | Plain require() smoke | VERIFIED | 2 tests pass |
| `tests/lint-vcs-no-raw-git-fixture.test.cjs` | Lint scanner fixture tests | VERIFIED | 7 tests pass |
| `scripts/check-skip-count.cjs` | TEST-06 enforcement | VERIFIED | exits 0; current=baseline=18 |
| `scripts/lint-vcs-no-raw-git.cjs` | Default-deny scanner | VERIFIED | 890 files scanned, 0 violations |
| `scripts/lint-vcs-no-raw-git.allow.json` | Checked-in allowlist | VERIFIED | 24 files + 18 globs |
| `.github/workflows/test.yml` | CI integration for both guards | VERIFIED | check-skip-count step + lint-vcs-no-raw-git step + fetch-depth: 0 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `sdk/src/vcs/index.ts` | `sdk/src/vcs/types.ts` | import type | WIRED | `index.ts:14 import type { VcsAdapter, VcsKind } from './types.js'` |
| `sdk/src/vcs/index.ts` | `sdk/src/vcs/backends.ts` | re-export | WIRED | `index.ts:51 export { BACKENDS_AVAILABLE, BACKENDS_DECLARED, parseBackendsEnv } from './backends.js'` |
| `sdk/src/vcs/index.ts` | `sdk/src/vcs/backends/git.ts` | createGitAdapter import | WIRED | `index.ts:13 import { createGitAdapter } from './backends/git.js'` |
| `sdk/src/vcs/backends/git.ts` | `sdk/src/vcs/exec.ts` | execGit import | WIRED | `backends/git.ts:21 import { execGit } from '../exec.js'` |
| `sdk/src/vcs/backends/git.ts` | `sdk/src/vcs/parse/worktree-list.ts` | readWorktreeList import (CR-04 deviation from plan) | WIRED | `backends/git.ts:26 import { readWorktreeList } from '../parse/worktree-list.js'` (replaces cross-package require) |
| `tests/helpers.cjs` | `sdk/dist-cjs/vcs/backends.js` | lazy require | WIRED | `helpers.cjs:189 _backendsModule = require('../sdk/dist-cjs/vcs/backends.js')` |
| `sdk/src/vcs/__tests__/adapter-contract.test.ts` | `sdk/src/vcs/__tests__/vcs-fixture.ts` | makeBackendFixture import | WIRED | `adapter-contract.test.ts:9 import { makeBackendFixture, selectedBackends } from './vcs-fixture.js'`; `:13 describe.for(selectedBackends())` |
| `.github/workflows/test.yml` | `scripts/check-skip-count.cjs` | lint-tests job step | WIRED | `test.yml:51 node scripts/check-skip-count.cjs` |
| `.github/workflows/test.yml` | `scripts/lint-vcs-no-raw-git.cjs` | lint-tests job step | WIRED | `test.yml:54 run: node scripts/lint-vcs-no-raw-git.cjs` |
| `scripts/lint-vcs-no-raw-git.cjs` | `scripts/lint-vcs-no-raw-git.allow.json` | require | WIRED | `lint-vcs-no-raw-git.cjs:42 const ALLOW = require('./lint-vcs-no-raw-git.allow.json')` |

All key links wired (verified by direct grep — `gsd-sdk query verify.key-links` reported false negatives due to YAML-frontmatter regex escaping; the actual code wiring is correct).

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `createVcsAdapter` | adapter object | `createGitAdapter(cwd)` (line 28) which returns frozen object with 30+ `execGit(cwd, [...])` callsites | YES — runtime spot-check returned real `git version 2.50.1` for `gitOnly.version()` | FLOWING |
| `BACKENDS_AVAILABLE` (CJS side) | `_backendsModule.BACKENDS_AVAILABLE` | lazy-getter requires `sdk/dist-cjs/vcs/backends.js` which exports the const `['git']` | YES — `helpers.cjs` getter resolves through real require()'d module, value matches TS source | FLOWING |
| Baseline parity test | `recorded` (snap file) vs `actual` (live execGit) | Live execGit call vs JSON-loaded baseline | YES — 5/5 tests pass; if execGit drifted from `core.cjs:752` shape, all 5 would fail | FLOWING |
| Lint scanner | violations array | recursive walk of repo files matching GIT_PATTERNS regex | YES — fixture tests prove violations are detected; production scan correctly returns 0 | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `pnpm -F sdk build:cjs` exits 0 | `pnpm -F sdk build:cjs` | exit 0; dist-cjs populated | PASS |
| Plain `require()` of dist-cjs adapter loads `createVcsAdapter` | `node -e "console.log(typeof require('./sdk/dist-cjs/vcs/index.js').createVcsAdapter)"` | `function` | PASS |
| Adapter is deeply frozen | runtime introspection | adapter, gitOnly, refs, refs.bookmarks all `Object.isFrozen === true` | PASS |
| `vcs.gitOnly.version()` returns real git version | adapter call | `git version 2.50.1 (Apple Git-155)` | PASS |
| jj backend throws clear error | `createVcsAdapter('/tmp', {kind:'jj'})` | throws `GSDError('jj backend not yet implemented (Phase 3)')` | PASS |
| Vitest unit suite | `pnpm exec vitest run --project unit src/vcs/__tests__/` | 86 tests pass (9 files) | PASS |
| Node --test suites | `node --test tests/vcs-cjs-smoke.test.cjs tests/vcs-adapter-contract.test.cjs tests/lint-vcs-no-raw-git-fixture.test.cjs` | 16 tests pass | PASS |
| `tsc --noEmit -p tsconfig.json` (gates `types-gitonly.test-d.ts`) | tsc | exit 0 | PASS |
| Lint scanner on real repo | `node scripts/lint-vcs-no-raw-git.cjs` | exit 0; 890 files scanned, 0 violations | PASS |
| Skip-count guard | `node scripts/check-skip-count.cjs` | exit 0; current=18 baseline=18 | PASS |
| Baseline parity (GIT-02 enforcement) | vitest baseline-parity.test.ts | 5/5 pass | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| VCS-01 | 01-02 | VcsAdapter interface defined in `sdk/src/vcs/types.ts` with full contract | SATISFIED | types.ts:126-182 — full surface |
| VCS-02 | 01-02 | `createVcsAdapter(cwd, opts)` factory returning frozen plain object | SATISFIED | index.ts:20; runtime frozen=true verified |
| VCS-03 | 01-02 | Backend auto-detection (.jj first, .git fallback, GSD_VCS env override) | SATISFIED | index.ts:31-39 resolveKind |
| VCS-04 | 01-02 | Single spawn wrapper in `sdk/src/vcs/exec.ts` | SATISFIED | exec.ts:84 vcsExec, 5-field shape |
| VCS-05 | 01-02 | RevisionExpr type as canonical revset/ref primitive | SATISFIED | types.ts:19-20 brand; expr.ts factories; toGitRev/toJjRev locked mappings |
| VCS-06 | 01-01 | TypeScript-first with CJS build target → dist-cjs/ | SATISFIED | tsconfig.cjs.json + sdk/dist-cjs/ populated |
| VCS-07 | 01-05 | Lint guard ships with adapter package | SATISFIED | scripts/lint-vcs-no-raw-git.cjs + allowlist + CI integration; D-17/D-18 broadened to ALL git invocations |
| GIT-01 | 01-03 | Git backend implements every adapter operation | SATISFIED | backends/git.ts 384 LOC, all verbs in plan-03 verb-coverage table implemented |
| GIT-02 | 01-03 | Byte-identical {exitCode,stdout,stderr} | SATISFIED (with caveat) | 5 byte-identity baselines pass via baseline-parity.test.ts. WR-06 introduces EXIT_CODE_SIGNAL_KILLED=-1 sentinel — a deliberate divergence from `core.cjs:752` for signal-killed processes only; no captured baseline exercises this path. Phase 2 callers must be audited (see human verification). |
| GIT-03 | 01-03 | `vcs.gitOnly.createAnnotatedTag()` reachable on git, errors on jj | SATISFIED | types.ts:166-170 GitOnlyOps; types.ts:177-180 JjVcsAdapter has no gitOnly; types-gitonly.test-d.ts gate; runtime version() works |
| TEST-01 | 01-04 | `vcsTest(kind)` fixture parameterized over backends | SATISFIED | helpers.cjs:201 vcsTest; vcs-fixture.ts makeBackendFixture |
| TEST-02 | 01-04 | `test.extend({vcs, cwd})` per-test backend instance + isolated tmp dir | SATISFIED | vcs-fixture.ts:36 `base.extend<VcsFixture>` (test renamed `as base` for clarity) |
| TEST-03 | 01-04 | Backend matrix axis includes git, jj-colocated, jj-native | SATISFIED | backends.ts:13-17 BACKENDS_DECLARED has all three; jj-* gated as unavailable in Phase 1 |
| TEST-04 | 01-04 | `GSD_TEST_BACKENDS` env var selects subset | SATISFIED | parseBackendsEnv structured shape; B-4 zero-resolution warning; CI=true hard-fail |
| TEST-06 | 01-04 | CI rule "skip count must not increase from main" | SATISFIED | scripts/check-skip-count.cjs + .github/workflows/test.yml step; current=18 baseline=18 |
| TEST-07 | 01-04 | Test fixtures support both git and jj initial states | SATISFIED | vcs-fixture.ts initGitRepo() git path; jj path is forward-typed throw (`backend not yet implemented`) ready for Phase 3 |

**All 16 phase-1 requirements SATISFIED.** No orphaned requirements (cross-checked REQUIREMENTS.md Phase 1 list against plan frontmatters: VCS-01..07 [01-02, 01-01, 01-05], GIT-01..03 [01-03], TEST-01..04, TEST-06, TEST-07 [01-04] — all 16 enumerated in plan `requirements:` fields).

### Anti-Patterns Found

Anti-pattern scan run on Phase-1-added files (sdk/src/vcs/**, scripts/lint-vcs-no-raw-git.cjs, scripts/check-skip-count.cjs, tests/helpers.cjs, tests/vcs-*.test.cjs, tests/baselines/git-vcs/, tests/__tools__/, tests/lint-vcs-no-raw-git-fixture.test.cjs).

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | All 21 Critical+Warning code-review findings already fixed in REVIEW-FIX (commit 704898ac); 5 Info-level findings (IN-01..05) remain out-of-scope per `--fix default` and are documentation/cosmetic, not goal-blocking. |
| `sdk/src/vcs/index.ts` | 35-37 | jj→stub-throw, .git fallback, default-to-git | Info | Documented behavior (resolveKind comment). Throws clear error on jj kind; not a stub. |
| `sdk/src/vcs/parse/jj-rev.ts` | full file | Phase-3 stub (mappings locked, no consumer in Phase 1) | Info | Plan 01-02 known-stub list documents this; jj-rev mappings are production-final per VCS-05; only consumer (jj backend) arrives Phase 3. |
| `sdk/src/vcs/backends/git.ts` (`findConflicts` `'all'` scope) | — | returns `[]` | Info | Documented: Phase 3 jj backend implements real `conflict()` revset; verify gate (CONFLICT-03) consumes 'all' scope and exercises jj-side logic in Phase 3. RESEARCH Open Q1. |

No blockers, no warnings beyond what's already documented.

### Pre-existing Out-of-Scope Failures (carry-forward known issues)

Per the verifier prompt's project memory:
- `sdk/src/query/commit.test.ts:304` "fatal: failed to write commit object" — pre-existing, unrelated to Phase 1
- `sdk/src/query/config-mutation.test.ts:441` `commit_docs` toBe(true) — pre-existing, unrelated to Phase 1

Both are inherited from origin/main and out-of-scope for this phase.

### Human Verification Required

#### 1. WR-06 EXIT_CODE_SIGNAL_KILLED sentinel — Phase 2/3 caller audit

**Test:** When Phase 2 begins migrating `execSync('git …')` call sites in `sdk/src/query/*.ts` and `get-shit-done/bin/lib/*.cjs`, audit each migration target for code that branches on `result.exitCode === 1` to mean BOTH "git command failed with exit 1" (e.g. merge conflict, no diff) AND "process killed by signal" (the prior `result.status ?? 1` collapsed both into `1`). After the migration, killed-by-signal returns `-1` (`EXIT_CODE_SIGNAL_KILLED`), so any caller relying on the collision will now miss the killed case.

**Expected:** No call site relies on the collision. If any does, branch explicitly on `EXIT_CODE_SIGNAL_KILLED` (-1) imported from `sdk/src/vcs/exec.ts`.

**Why human:** Behavior change is semantic, not regex-detectable. All Phase 1 tests pass (no test asserted the exact `1` collapse), and the GIT-02 baselines don't exercise this path. The risk surfaces only when Phase 2 migrates the ~80 git-touching call sites and runs them under timeout/signal-kill conditions. REVIEW-FIX explicitly flagged this as "Requires human verification".

### Gaps Summary

No blocker gaps. The phase goal is achieved:
- `VcsAdapter` seam exists with full forward-complete surface (VCS-01..07).
- Git-only backend implements every contract method byte-equivalently for the 5 captured baselines (GIT-01..03).
- Parameterized test harness runs against the git backend in both vitest and node:test (TEST-01..04, TEST-06..07).
- Lint guard ships and exits 0 on Phase-1 land state, fails CI on violations (VCS-07).
- jj kind statically and dynamically errors; no jj code exists yet.

The single human-verification item (WR-06) is a forward-looking mitigation that doesn't block Phase 1 closure but must inform Phase 2 migration audits.

### Notable Deviations from PLAN (all auto-resolved during execution)

1. **Plan 01-03 → CR-04 fix**: `vcs.workspace.list` originally specified DI-importing `readWorktreeList` from `get-shit-done/bin/lib/worktree-safety.cjs`. Code review found this fails for downstream npm consumers (CLI's bin/lib/ tree is not bundled into SDK package files). Resolution: porcelain parser moved INTO SDK at `sdk/src/vcs/parse/worktree-list.ts`. ADR-0004 still names worktree-safety.cjs as policy owner; only the read-only view was duplicated. New `parse-worktree-list.test.ts` added (6 tests). **Goal-equivalent** — workspace.list is wired and produces real WorkspaceInfo objects (now with non-empty rev and locked fields).
2. **Plan 01-01 → empty-include fix**: Initial `tsconfig.cjs.json` with `include: ['src/vcs/**/*.ts']` and zero matching files emitted `TS18003`. Resolution: created `sdk/src/vcs/_placeholder.ts`, then plan 01-02 deleted it once real source landed. Documented in 01-01-SUMMARY.
3. **Plan 01-01 → CJS package.json shim**: SDK's outer `"type":"module"` caused dist-cjs/*.js to load as ESM under Node 25. Resolution: build:cjs script writes `dist-cjs/package.json` with `{"type":"commonjs"}`. Documented in 01-02-SUMMARY.
4. **WR-06 sentinel** (see human verification above) — divergence from `core.cjs:752` byte-identity for signal-killed processes only. Strictly more conservative; no Phase-1 test path exercises the divergence; flagged for Phase 2/3 audit.

---

_Verified: 2026-05-09T15:55:00Z_
_Verifier: Claude (gsd-verifier)_
