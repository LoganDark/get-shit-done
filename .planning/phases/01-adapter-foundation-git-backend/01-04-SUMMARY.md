---
phase: 01-adapter-foundation-git-backend
plan: 04
subsystem: vcs-test-harness
tags: [vcs, test-harness, vitest, node-test, parameterized, ci-guard, skip-count, dual-runner]
dependency_graph:
  requires:
    - "Plan 01-01 — sdk/dist-cjs build pipeline"
    - "Plan 01-02 — BACKENDS_AVAILABLE / BACKENDS_DECLARED / parseBackendsEnv (TS source of truth)"
    - "Plan 01-03 — real createGitAdapter + __vcsTestOnly snapshot/restore primitive"
  provides:
    - "sdk/src/vcs/__tests__/vcs-fixture.ts — makeBackendFixture(kind) (vitest test.extend) + selectedBackends() (B-4-aware GSD_TEST_BACKENDS resolver)"
    - "sdk/src/vcs/__tests__/adapter-contract.test.ts — describe.for(selectedBackends()) parameterized contract suite (11 contract assertions + 1 env-filter sanity test)"
    - "tests/helpers.cjs — vcsTest(kindOrKinds, suiteFn) hand-rolled CJS loop + pre-build guard + BACKENDS_* lazy getters re-exported from sdk/dist-cjs"
    - "tests/vcs-adapter-contract.test.cjs — node --test contract suite (7 assertions) against the dist-cjs/ artifact (D-02 path)"
    - "scripts/check-skip-count.cjs — TEST-06 enforcement: skip count must not increase from origin/main; W-3 hard-fails under CI=true on missing baseline"
    - "Single-source-of-truth wiring: both runners pull BACKENDS_AVAILABLE / parseBackendsEnv from sdk/dist-cjs/vcs/backends.js (RESEARCH Pitfall 6 closed)"
  affects:
    - "Plan 01-05 (lint guard) — tests/helpers.cjs and tests/vcs-adapter-contract.test.cjs MUST be on the no-raw-git lint allowlist; helpers.cjs uses execSync('git …') in createTempGitProject and the contract test routes through it via vcsTest"
    - "Phase 3 (jj backend) — describe.for(selectedBackends()) iterates BACKENDS_AVAILABLE; when Phase 3 adds 'jj-colocated' / 'jj-native' the same suite runs against the new backends with zero harness changes"
    - "Phase 2 (call-site migration) — gives migrators a parameterized suite to drop new contract assertions into as Phase 2 surfaces them"
tech_stack:
  added: []
  patterns:
    - "Dual-runner parameterized harness: vitest describe.for + test.extend on the SDK side, node --test + hand-rolled CJS loop on the repo side, both filtered by the same parseBackendsEnv result"
    - "CJS lazy-getter re-export: Object.defineProperty(_exports, 'BACKENDS_AVAILABLE', {get: () => _loadVcs().backends.BACKENDS_AVAILABLE}) — defers dist-cjs load until first access, so a missing build only errors when the harness actually runs"
    - "Snapshot-once / restore-between pattern: beforeAll snapshots after a 'git init + initial empty commit' baseline (W-5), beforeEach restores to that baseline; faster than fresh-init-per-test for ~10 contract tests"
    - "B-4 zero-resolution warning: when GSD_TEST_BACKENDS resolves to 0 available backends with non-empty requested set, warn locally / throw under CI=true (no silent green on zero-test runs)"
    - "W-3 dual-defense missing-baseline: workflow YAML uses fetch-depth: 0 to provide history; check-skip-count.cjs hard-fails under CI=true if origin/main is still missing"
key_files:
  created:
    - sdk/src/vcs/__tests__/vcs-fixture.ts
    - sdk/src/vcs/__tests__/adapter-contract.test.ts
    - tests/vcs-adapter-contract.test.cjs
    - scripts/check-skip-count.cjs
  modified:
    - tests/helpers.cjs
    - .github/workflows/test.yml
  deleted: []
decisions:
  - "Plan 01-04: vcs-fixture.ts seeds an initial empty commit (`git commit --allow-empty -m initial`) BEFORE the snapshot is taken (W-5 revision). Every test in the describe block thus starts from a `git init + initial empty commit` baseline, so HEAD~1 / vcs.refs.parent resolves cleanly without the zero-commit edge case."
  - "Plan 01-04: bookmark contract test resolves the default branch dynamically (`vcs.refs.bookmarks.list()[0].name`) rather than hardcoding `master` or `main`. Avoids host-config sensitivity (init.defaultBranch differs between environments)."
  - "Plan 01-04: tests/helpers.cjs uses `Object.defineProperty(..., {get: ...})` for BACKENDS_* re-exports rather than eager destructuring at module load. Defers the require('../sdk/dist-cjs/vcs/backends.js') call until a consumer actually accesses BACKENDS_AVAILABLE — keeps the pre-build guard friendly for tests that import helpers.cjs but don't use the VCS harness."
  - "Plan 01-04: vcsTest('auto') is the contract for the CJS-side runner — it resolves to parseBackendsEnv(process.env.GSD_TEST_BACKENDS).available. Calling vcsTest('git', ...) directly is supported but discouraged in suite files; tests/vcs-adapter-contract.test.cjs uses 'auto' so both runners honor the SAME env-filter contract (RESEARCH Pitfall 6)."
  - "Plan 01-04: skip-pattern set is `(it|test|describe)\\.(skip|todo)`, `xit/xdescribe/xtest`, with `// allow-skip:<reason>` per-line exemption annotation. Mirrors lint-no-source-grep.cjs's `// allow-test-rule:` convention. Allowlist annotation is line-scoped (not file-scoped) so a single intentional `.skip` doesn't blanket-exempt the rest of the file."
metrics:
  duration: "~10m"
  completed: "2026-05-09"
  task_count: 3
  file_count: 6
---

# Phase 01 Plan 04: Parameterized Test Harness + Skip-Count CI Guard — Summary

Built the dual-runner parameterized contract harness — vitest `describe.for(selectedBackends())` + `test.extend({vcs, cwd})` on the SDK side, hand-rolled `vcsTest(kindOrKinds, suiteFn)` loop wrapping `node:test` on the repo side — both filtered by the same `parseBackendsEnv()` from `sdk/src/vcs/backends.ts`. Landed the TEST-06 CI guard (`scripts/check-skip-count.cjs`) that fails CI when the test-skip count grows past `origin/main`'s baseline, with a W-3 dual-defense (workflow YAML uses `fetch-depth: 0`, script hard-fails under `CI=true` if baseline is still missing).

## Tasks Completed

| Task | Name                                                                                                       | Commit     |
| ---- | ---------------------------------------------------------------------------------------------------------- | ---------- |
| 1    | vitest fixture (vcs-fixture.ts) + parameterized contract suite (adapter-contract.test.ts)                  | `ef6872aa` |
| 2    | tests/helpers.cjs vcsTest harness + tests/vcs-adapter-contract.test.cjs (node --test variant)              | `e20b468e` |
| 3    | scripts/check-skip-count.cjs (TEST-06) + .github/workflows/test.yml integration                            | `746e27cc` |

## File Tree (this plan)

```
sdk/src/vcs/__tests__/
├── vcs-fixture.ts                    (104 lines) — makeBackendFixture + selectedBackends
└── adapter-contract.test.ts          ( 84 lines) — describe.for, 11 contract tests + 1 sanity

tests/
├── helpers.cjs                       (modified — +101 lines: vcsTest, _loadVcs, lazy-getter exports)
└── vcs-adapter-contract.test.cjs     ( 64 lines, 7 tests) — node --test against dist-cjs

scripts/
└── check-skip-count.cjs              (122 lines) — TEST-06 enforcement, executable

.github/workflows/
└── test.yml                          (modified — fetch-depth: 0 on lint-tests checkout + new step)
```

Total: 3 new test/harness files (252 lines), 1 new CI script (122 lines), 2 modified files.

## Test Counts

**Vitest (`sdk/src/vcs/__tests__/adapter-contract.test.ts`)**

| Metric                          | Count |
| ------------------------------- | ----- |
| `describe.for([...])` blocks    | 1 (parameterized over `selectedBackends()`)  |
| Contract `test(...)` per kind   | 11    |
| Standalone `describe` blocks    | 1 (env-filter sanity) |
| Standalone `it(...)`            | 1     |
| **Total tests run (Phase 1, kind=git)** | **12** |

Phase 3 lifts BACKENDS_AVAILABLE = `['git', 'jj-colocated', 'jj-native']`, which auto-multiplies the parameterized count to 33 + 1 sanity = 34 tests with no harness change.

**Node --test (`tests/vcs-adapter-contract.test.cjs`)**

| Metric            | Count |
| ----------------- | ----- |
| `vcsTest('auto')` blocks | 1 (yields `describe('vcs[git]')` per resolved kind) |
| `test(...)` per kind     | 7    |
| **Total tests run (Phase 1, kind=git)** | **7** |

## Verification Results

```text
$ pnpm -F sdk build:cjs
exit 0

$ cd sdk && pnpm exec vitest run --project unit src/vcs/__tests__/adapter-contract.test.ts
✓ src/vcs/__tests__/adapter-contract.test.ts (12 tests)
Test Files  1 passed (1)
     Tests  12 passed (12)

$ node --test tests/vcs-adapter-contract.test.cjs
▶ vcs[git]
  ✔ vcs.kind matches backend selection
  ✔ vcs.commit({files,message}) produces a hash
  ✔ vcs.log returns entries after a commit
  ✔ vcs.status({porcelain:true}) lists untracked files
  ✔ vcs.findConflicts({scope:"all"}) returns [] on git
  ✔ vcs.gitOnly.version returns a real git version
  ✔ Object.isFrozen on adapter and nested namespaces
ℹ pass 7 / fail 0

$ GSD_TEST_BACKENDS=jj-colocated cd sdk && pnpm exec vitest run --project unit src/vcs/__tests__/adapter-contract.test.ts
WARN [GSD_TEST_BACKENDS] requested ["jj-colocated"] but none are in BACKENDS_AVAILABLE (["git"]); 0 tests will run. Unavailable: ["jj-colocated"].
✓ adapter-contract.test.ts (1 test) — only the env-filter sanity test runs
exit 0

$ CI=true GSD_TEST_BACKENDS=jj-colocated cd sdk && pnpm exec vitest run --project unit src/vcs/__tests__/adapter-contract.test.ts
FAIL src/vcs/__tests__/adapter-contract.test.ts
Error: [GSD_TEST_BACKENDS] requested ["jj-colocated"] but none are in BACKENDS_AVAILABLE (["git"]); 0 tests will run.
exit 1   (B-4 contract honored)

$ node scripts/check-skip-count.cjs
ok check-skip-count: current=18 baseline(origin/main)=18

$ grep -F 'check-skip-count.cjs' .github/workflows/test.yml
(found, 3 occurrences in the lint-tests job)

$ node -e "const h=require('./tests/helpers.cjs'); console.log(typeof h.vcsTest, h.BACKENDS_AVAILABLE, typeof h.parseBackendsEnv);"
function [ 'git' ] function
```

## Single Source of Truth — BACKENDS Wiring

Verification that `BACKENDS_AVAILABLE` and `parseBackendsEnv` come from ONE place (`sdk/src/vcs/backends.ts`) and are NOT re-implemented in CJS:

**Vitest side** (`sdk/src/vcs/__tests__/vcs-fixture.ts:14`):
```typescript
import { BACKENDS_AVAILABLE, parseBackendsEnv } from '../backends.js';
```

**Node --test side** (`tests/helpers.cjs`, lazy-getter pattern):
```javascript
function _loadVcs() {
  // …
  _backendsModule = require('../sdk/dist-cjs/vcs/backends.js');
  // …
}
Object.defineProperty(_exports, 'BACKENDS_AVAILABLE', { enumerable: true, get: () => _loadVcs().backends.BACKENDS_AVAILABLE });
Object.defineProperty(_exports, 'parseBackendsEnv', { enumerable: true, get: () => _loadVcs().backends.parseBackendsEnv });
```

There is NO `BACKENDS_AVAILABLE = ['git']` literal anywhere in `tests/`, `scripts/`, or `bin/`. The TS source compiles to `sdk/dist-cjs/vcs/backends.js` and both runners pull from there. RESEARCH Pitfall 6 ("BACKENDS list and GSD_TEST_BACKENDS parsing diverge between CJS and TS") is structurally closed.

## Skip-Count Baseline at PR Open

| Metric                                    | Count |
| ----------------------------------------- | ----- |
| Current skip count (this branch)          | 18    |
| Baseline (`origin/main` at PR open)       | 18    |
| New skips introduced by Plan 01-04        | 0     |

The 18 pre-existing skips are inherited from `origin/main`; Plan 01-04 adds zero. Subsequent commits will be enforced by `node scripts/check-skip-count.cjs` as part of the `lint-tests` CI job — any commit that pushes `current > baseline` fails CI with a per-file diagnostic.

## Plan 05 Hand-off — Lint Allowlist

The plan-05 `no raw git in jj-reachable code` lint guard MUST allowlist these files (each one intentionally invokes git directly):

| File                                          | Why allowlisted                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `tests/helpers.cjs`                           | `createTempGitProject` calls `execSync('git init')` etc. to seed test fixtures (pre-adapter)     |
| `tests/vcs-adapter-contract.test.cjs`         | `require('./helpers.cjs')` transitively pulls in the above; allowlisted as a no-op precaution    |
| `sdk/src/vcs/__tests__/vcs-fixture.ts`        | `initGitRepo()` calls `execSync('git init')` etc. for the same fixture-seeding reason            |
| `scripts/check-skip-count.cjs`                | `execSync('git ls-tree -r ...')` and `execSync('git show <ref>:<file>')` — git is the data source |

The plan-05 author can either:
1. Add each to the JSON allowlist (`scripts/lint-vcs-no-raw-git.allow.json`), OR
2. Annotate each with the inline `// vcs-lint:allow-git-here` comment per RESEARCH Pitfall 2.

Option 1 is preferred for the test fixtures (centralized review surface); option 2 is preferred for `scripts/check-skip-count.cjs` (one-off, self-documenting).

## Deviations from Plan

None — plan executed exactly as written. The W-3 and W-5 fixes were already incorporated into the plan body (`<action>` blocks) as planning-phase revisions; no execution-time deviations were needed.

## Authentication Gates

None encountered.

## Threat Surface

Plan's `<threat_model>` covers:
- T-01-04-01 (tmp git repo init tampering) — `mkdtempSync` produces random-named dirs with default 0700 POSIX perms; no user-controlled path components.
- T-01-04-02 (skip-count diagnostic info disclosure) — accepted; file paths + counts are non-sensitive metadata.
- T-01-04-03 (DoS via hung tests) — vitest default 5s test timeout applies to all 12 contract tests; node --test default also bounded.
- T-01-04-SC (npm/pip/cargo install slopsquat) — mitigated by adding ZERO new dependencies. Uses only Node 22+ built-ins (`node:test`, `node:fs`, `node:child_process`, `node:os`, `node:path`).

No new threat surface beyond the model. No threat-flag items.

## Known Stubs

None — all harness code is fully wired. The `kind !== 'git'` guard in both `makeBackendFixture` and the CJS `vcsTest` loop is a forward-typed throw, not a stub: it's the path Phase 3 exercises when it lifts BACKENDS_AVAILABLE to include `jj-colocated` / `jj-native` and the harness must dispatch to a not-yet-implemented backend. Throws loudly with the BACKENDS_AVAILABLE list in the message — no silent fallback.

## Threat Flags

None.

## Self-Check: PASSED

Files created (verified via `[ -f path ]`):
- `sdk/src/vcs/__tests__/vcs-fixture.ts`
- `sdk/src/vcs/__tests__/adapter-contract.test.ts`
- `tests/vcs-adapter-contract.test.cjs`
- `scripts/check-skip-count.cjs`

Files modified (verified via git log):
- `tests/helpers.cjs` — vcsTest function + BACKENDS_* lazy getters added
- `.github/workflows/test.yml` — fetch-depth: 0 on checkout + new check-skip-count step

Commits:
- `ef6872aa` (Task 1) — vitest fixture + parameterized contract suite
- `e20b468e` (Task 2) — CJS vcsTest harness + node --test contract suite
- `746e27cc` (Task 3) — check-skip-count.cjs + workflow integration

Test results:
- `pnpm exec vitest run --project unit src/vcs/__tests__/adapter-contract.test.ts`: **12 tests passed**.
- `node --test tests/vcs-adapter-contract.test.cjs`: **7 tests passed**.
- `node scripts/check-skip-count.cjs`: exit 0; `current=18 baseline=18`.
- B-4 contract: GSD_TEST_BACKENDS=jj-colocated locally exits 0 with WARN; under CI=true exits non-zero with the structured error message.
- Single-source-of-truth check: `tests/helpers.cjs` re-exports BACKENDS_* via lazy getters from `sdk/dist-cjs/vcs/backends.js`; no CJS-side parsing duplicated.
