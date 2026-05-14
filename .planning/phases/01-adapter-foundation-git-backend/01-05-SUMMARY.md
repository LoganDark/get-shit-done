---
phase: 01-adapter-foundation-git-backend
plan: 05
subsystem: vcs-lint-guard
tags: [vcs, lint, default-deny, allowlist, ci-guard, jj-port]
dependency_graph:
  requires:
    - "Plan 01-03 — sdk/src/vcs/backends/git.ts (the canonical place where direct git invocation is permitted)"
    - "Plan 01-04 — tests/helpers.cjs, tests/vcs-adapter-contract.test.cjs, sdk/src/vcs/__tests__/vcs-fixture.ts, scripts/check-skip-count.cjs (must all be on the allowlist)"
  provides:
    - "scripts/lint-vcs-no-raw-git.cjs — whole-repo default-deny scanner; 6 GIT_PATTERNS; --scan-root argv (W-4)"
    - "scripts/lint-vcs-no-raw-git.allow.json — 21 explicit files, 17 globs (D-18 exempt list)"
    - "tests/lint-vcs-no-raw-git-fixture.test.cjs — 3 directional tests (clean repo / violation / annotation)"
    - ".github/workflows/test.yml — new step in lint-tests job invoking the scanner (D-19, CI-only)"
    - "Inline annotation `// vcs-lint:allow-git-here <reason>` line-scoped escape hatch"
    - "Migration progress metric: as Phase 2 migrates each call site, the corresponding allowlist entry can be removed; reaching empty get-shit-done/bin/lib/**/*.cjs glob marks Phase 2 complete"
  affects:
    - "Phase 2 (call-site migration) — each migrated call site is one allowlist entry removed; PRs can be tracked against the allowlist diff"
    - "Phase 3 (jj backend) — guard prevents regression: any new git invocation in jj-reachable code surfaces in CI"
    - "All future PRs — the lint-tests job catches new git invocations before merge"
tech_stack:
  added: []
  patterns:
    - "Whole-repo default-deny scanner with checked-in JSON allowlist (separate files[] vs globs[] arrays for review-friendly diffs)"
    - "Glob-to-regexp translator (** = any path segments, * = non-separator) — zero runtime deps"
    - "Inline per-line annotation escape (`// vcs-lint:allow-git-here <reason>`) with required non-empty `\\S` rationale"
    - "W-4 isolated fixture pattern: `--scan-root <dir>` argv lets fixture tests scan os.tmpdir() trees without polluting the repo root or colliding across parallel runs"
key_files:
  created:
    - scripts/lint-vcs-no-raw-git.cjs
    - scripts/lint-vcs-no-raw-git.allow.json
    - tests/lint-vcs-no-raw-git-fixture.test.cjs
  modified:
    - .github/workflows/test.yml
    - .gitignore
  deleted: []
decisions:
  - "Plan 01-05: scanner walks the whole repo (not just tests/) per D-18 — skip-dirs cover node_modules, .git, .jj, dist, dist-cjs, .pnpm-store; scan extensions cover .cjs/.js/.mjs/.ts/.yml/.yaml only (markdown is excluded — documentation is allowlisted via the docs/** glob anyway)."
  - "Plan 01-05 [Rule 2 — auto-add critical functionality]: added sdk/src/init-runner.ts to the allowlist files[] array. It's a Phase 2 migration target (sibling to sdk/src/query/init.ts) that the planned allowlist forgot to enumerate. Without this, the lint guard would have fired on Phase 1's land state — violating the plan's hard requirement that 'the lint MUST NOT trip on Phase 01's own newly-added files'."
  - "Plan 01-05: extra glob `sdk/src/**/*.integration.test.ts` added to cover integration tests that init tmp git repos (e.g., e2e.integration.test.ts, lifecycle-e2e.integration.test.ts, init-e2e.integration.test.ts, golden/*.integration.test.ts, phase-runner.integration.test.ts, query/sub-repos-root.integration.test.ts). These were not enumerated by the plan but are legitimate fixture-seeding sites; an integration-test glob is the cleanest exemption."
  - "Plan 01-05: tests/__tools__/capture-vcs-baselines.cjs added to the allowlist files[] array. It's the regenerator helper from plan 01-03 that captures pre-migration baselines — calls git directly by design. Plan 04's hand-off list missed it."
  - "Plan 01-05: tests/vcs-cjs-smoke.test.cjs added to the allowlist files[] array. It's the plan-03 CJS smoke test that init's a tmp git repo. Already covered by the tests/**/*.test.cjs glob, but listed explicitly for self-documentation."
metrics:
  duration: "~6m"
  completed: "2026-05-09"
  task_count: 3
  file_count: 5
---

# Phase 01 Plan 05: No-Raw-Git Lint Guard — Summary

Landed the load-bearing "no raw git anywhere" lint guard (VCS-07 / D-17 / D-18 / D-19): whole-repo default-deny scanner (`scripts/lint-vcs-no-raw-git.cjs`, 880 files scanned, exit 0 on Phase 1 land state) with checked-in JSON allowlist (`scripts/lint-vcs-no-raw-git.allow.json`, 22 file entries + 17 glob entries), inline `// vcs-lint:allow-git-here <reason>` annotation escape, and CI-only integration in the existing `lint-tests` workflow job. Three directional fixture tests verify the scanner exits 0 on the real repo, exit 1 on a violation, and exit 0 when the violation carries the annotation.

## Tasks Completed

| Task | Name                                                                           | Commit     |
| ---- | ------------------------------------------------------------------------------ | ---------- |
| 1    | Create scripts/lint-vcs-no-raw-git.allow.json (initial allowlist)              | `nnquxytmlsmkxklzpwulsvtnoquqpttu` |
| 2    | Create scripts/lint-vcs-no-raw-git.cjs + tests/lint-vcs-no-raw-git-fixture     | `rqpokornstvytxrwvxuysprrnnwrymqn` (GREEN), `ypwvturxtklnvmuxnzqwpvtmkvqzmwqv` (RED) |
| 3    | Wire the lint guard into .github/workflows/test.yml lint-tests job             | `zyqvxpynsyysouoylsymxsoszmmvwvnm` |

## Allowlist Final Size

| Category   | Count |
| ---------- | ----- |
| `files[]`  | 22    |
| `globs[]`  | 17    |
| **Total exemption surface** | **39 entries** |

(Plan-stated initial sizes were 18 files / 16 globs; the +4 files / +1 glob delta is documented in the Deviations section below.)

## Verification Results

```text
$ node scripts/lint-vcs-no-raw-git.cjs
ok lint-vcs-no-raw-git: 880 files scanned in /Users/LoganDark/Documents/Projects/get-shit-done, 0 violations
exit 0

$ node --test tests/lint-vcs-no-raw-git-fixture.test.cjs
✔ lint-vcs-no-raw-git exits 0 on the current repo (Phase 1 land state) (53.954ms)
✔ lint-vcs-no-raw-git exits 1 on a fixture containing execSync("git status") (31.166ms)
✔ inline annotation `// vcs-lint:allow-git-here` exempts a single line (29.598ms)
ℹ pass 3 / fail 0

$ grep -F 'Lint — no raw git in jj-reachable code' .github/workflows/test.yml
      - name: Lint — no raw git in jj-reachable code
$ grep -c 'lint-vcs-no-raw-git\.cjs' .github/workflows/test.yml
1

$ grep -E '^__lint-fixture-vcs-\*?$' .gitignore
__lint-fixture-vcs-*
```

All three directions of the lint guard are validated:

1. **Production-mode** (real repo, no `--scan-root`): exit 0, 880 files scanned, 0 violations. Phase 1's own newly-added files are correctly exempted.
2. **Violation detection** (isolated fixture, `--scan-root <tmp>`): exit 1, structured `file:line` diagnostic, includes the matched `GIT_PATTERN` label.
3. **Inline annotation escape** (isolated fixture with `// vcs-lint:allow-git-here intentional probe`): exit 0, the annotated line is skipped during scan.

## bin/lib/*.cjs Files in Allowlist (Phase 2 Migration Backlog)

The `get-shit-done/bin/lib/**/*.cjs` glob currently covers ALL `.cjs` files under `bin/lib/`. The four files actually containing git invocations (verified via grep at land time) — i.e., the genuine Phase 2 migration targets — are:

| File | Why allowlisted | Phase 2 action |
| ---- | --------------- | -------------- |
| `get-shit-done/bin/lib/core.cjs` | execGit (lines 725-758) — the byte-identity reference per GIT-02 | Migrate each `execGit` call site to `vcs.<verb>(...)`; the function itself stays as the worktree-safety adapter shim |
| `get-shit-done/bin/lib/commands.cjs` | 30+ execGit calls in cmdCommit pipeline (lines 300-415, 994, 917-924) | Migrate to `vcs.commit({...})`, `vcs.diff({...})`, `vcs.log({...})` |
| `get-shit-done/bin/lib/init.cjs` | `execSync('git status --porcelain')` (1519, 1641), `execSync('git --version')` (1538) | Migrate to `vcs.status({porcelain:true})` and `vcs.gitOnly.version()` |
| `get-shit-done/bin/lib/worktree-safety.cjs` | execGitDefault (lines 11-49) — the local exec primitive | Phase 2 routes the internal exec through the adapter; ADR-0004 policy seam stays |

## sdk/src/query/*.ts Files in Allowlist (Phase 2 Migration Backlog)

The plan enumerates 7 explicit globs:

| File | Status |
| ---- | ------ |
| `sdk/src/query/commit.ts` | listed; has 3-field execGit + execSync('git') call sites; Phase 2 migration target |
| `sdk/src/query/init.ts` | listed; has execSync('git status --porcelain') call sites; Phase 2 migration target |
| `sdk/src/query/verify.ts` | listed; verified no current git invocations (forward-defensive listing) |
| `sdk/src/query/progress.ts` | listed; verified no current git invocations (forward-defensive listing) |
| `sdk/src/query/check-ship-ready.ts` | listed; verified no current git invocations (forward-defensive listing) |
| `sdk/src/query/check-decision-coverage.ts` | listed; verified no current git invocations (forward-defensive listing) |
| `sdk/src/query/docs-init.ts` | listed; verified no current git invocations (forward-defensive listing) |
| `sdk/src/init-runner.ts` | **added at execution time (Rule 2)**; has execFile('git', …) at line 675; Phase 2 migration target |

## Globs to Tighten Post-Phase-2

When Phase 2 completes, the following allowlist entries should be removed:

| Entry | Removal Trigger |
| ----- | --------------- |
| `get-shit-done/bin/lib/**/*.cjs` (glob) | All four `bin/lib/*.cjs` files migrated to adapter; per-file allowlist no longer needed |
| `sdk/src/query/commit.ts` (file) | All execGit/execSync calls in commit.ts migrated to adapter |
| `sdk/src/query/init.ts` (file) | All execSync calls in init.ts migrated to adapter |
| `sdk/src/query/verify.ts` (file) | If verify.ts adds no git invocations during Phase 2, remove (forward-defensive entry) |
| `sdk/src/query/progress.ts` (file) | If progress.ts adds no git invocations during Phase 2, remove |
| `sdk/src/query/check-ship-ready.ts` (file) | If check-ship-ready.ts adds no git invocations during Phase 2, remove |
| `sdk/src/query/check-decision-coverage.ts` (file) | If check-decision-coverage.ts adds no git invocations during Phase 2, remove |
| `sdk/src/query/docs-init.ts` (file) | If docs-init.ts adds no git invocations during Phase 2, remove |
| `sdk/src/init-runner.ts` (file) | When the execFile('git', …) call at line 675 migrates to `vcs.commit({...})` |

The test infrastructure entries (`tests/helpers.cjs`, `tests/__tools__/capture-vcs-baselines.cjs`, the `tests/**/*.test.cjs` glob, `sdk/src/vcs/__tests__/**` glob, `sdk/src/**/*.integration.test.ts` glob) remain permanent — they legitimately seed tmp git repos for fixture setup. The `sdk/src/vcs/exec.ts` and `sdk/src/vcs/backends/git.ts` entries also remain permanent — these are the adapter's git boundary by design (D-18 explicitly exempts).

## CI Integration

The new step in `.github/workflows/test.yml` lint-tests job is the 6th step in order:

1. checkout (`fetch-depth: 0`)
2. setup-node (Node 24)
3. Lint — no source-grep tests (`scripts/lint-no-source-grep.cjs`)
4. Lint — command contract (ADR-0002) (`scripts/lint-command-contract.cjs`)
5. Check — skip count must not increase from main (`scripts/check-skip-count.cjs`, plan 01-04)
6. **Lint — no raw git in jj-reachable code** (`scripts/lint-vcs-no-raw-git.cjs`, plan 01-05) ← NEW

D-19 is honored: CI-only integration; not run pre-commit. The conventions (`shell: bash`, no env vars, single-line `run:`) match the surrounding steps.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Critical correctness] Allowlist missed `sdk/src/init-runner.ts`**

- **Found during:** Task 2 verify (`node scripts/lint-vcs-no-raw-git.cjs` returned exit 1 with one violation: `sdk/src/init-runner.ts:675  execFile('git', …)`)
- **Issue:** The plan's allowlist enumerated `sdk/src/query/{commit,init,verify,progress,check-ship-ready,check-decision-coverage,docs-init}.ts` as Phase 2 migration targets but missed `sdk/src/init-runner.ts`, which also calls git directly (`execFile('git', args, …)` at line 675). Without exempting it, the lint guard would fire on Phase 1's land state — violating the plan's hard requirement that "the lint MUST NOT trip on Phase 01's own newly-added files" (RESEARCH Pitfall 2).
- **Fix:** Added `sdk/src/init-runner.ts` to the allowlist `files[]` array.
- **Files modified:** `scripts/lint-vcs-no-raw-git.allow.json`.
- **Why this is Rule 2, not Rule 4:** No architectural change — this is the same migration-target category as `sdk/src/query/init.ts` (its sibling); the allowlist was simply missing one Phase 2 target.
- **Commit:** `rqpokornstvytxrwvxuysprrnnwrymqn` (bundled with Task 2's GREEN — the task that surfaced the violation).

**2. [Rule 2 — Critical correctness] Allowlist missed integration-test files**

- **Found during:** Allowlist inventory pass before running the scanner (preventive)
- **Issue:** The plan's globs covered `tests/**/*.test.cjs`, `tests/**/*.test.ts`, `sdk/src/query/**/*.test.ts`, and `sdk/src/vcs/__tests__/**`, but missed `sdk/src/*.integration.test.ts` and `sdk/src/golden/*.integration.test.ts`. Six integration tests live there, three of which seed tmp git repos via `execSync('git init', …)` (lifecycle-e2e, init-e2e, golden/read-only-parity). Without exempting them, the lint guard would have fired on land state.
- **Fix:** Added `sdk/src/**/*.integration.test.ts` glob to the allowlist `globs[]` array. The wildcard form covers all current and future integration tests under `sdk/src/`.
- **Files modified:** `scripts/lint-vcs-no-raw-git.allow.json`.
- **Why this is Rule 2:** Same as #1 — the allowlist was missing legitimate fixture-seeding sites that the planner did not enumerate.
- **Commit:** `nnquxytmlsmkxklzpwulsvtnoquqpttu` (Task 1 — included from inception).

**3. [Rule 2 — Critical correctness] Allowlist missed `tests/__tools__/capture-vcs-baselines.cjs`**

- **Found during:** Cross-reference of plan-03 hand-off ("`tests/__tools__/capture-vcs-baselines.cjs` — Phase-2 regenerator helper") against plan-04 hand-off table (which mentioned `tests/helpers.cjs`, `tests/vcs-adapter-contract.test.cjs`, `sdk/src/vcs/__tests__/vcs-fixture.ts`, `scripts/check-skip-count.cjs` but NOT capture-vcs-baselines).
- **Issue:** Plan-03 created the regenerator helper as a `.cjs` (not `.test.cjs`) file under `tests/__tools__/`. The plan's `tests/**/*.test.cjs` glob does NOT match it (wrong extension). The file directly invokes `execSync('git init')`, `execSync('git config …')`, `spawnSync('git', args, …)` to capture baselines — this is by design (regenerates the byte-identity corpus for Phase 2 migrations).
- **Fix:** Added `tests/__tools__/capture-vcs-baselines.cjs` explicitly to the allowlist `files[]` array.
- **Files modified:** `scripts/lint-vcs-no-raw-git.allow.json`.
- **Why this is Rule 2:** Same as #1/#2 — legitimate fixture site missing from the enumerated allowlist.
- **Commit:** `nnquxytmlsmkxklzpwulsvtnoquqpttu` (Task 1 — included from inception).

**4. [Rule 2 — Self-documentation] Listed `tests/vcs-cjs-smoke.test.cjs` explicitly**

- **Found during:** Allowlist inventory pass (preventive)
- **Issue:** Already covered by the `tests/**/*.test.cjs` glob, but worth listing explicitly for self-documentation alongside `tests/vcs-adapter-contract.test.cjs` (plan 04) — both are CJS-side smoke tests that init tmp git repos.
- **Fix:** Added explicit entry to `files[]`.
- **Why this is Rule 2 (not stylistic):** Reviewers reading the allowlist diff for future PRs benefit from the explicit entry; no glob coverage change.
- **Commit:** `nnquxytmlsmkxklzpwulsvtnoquqpttu` (Task 1).

### Verification Block Re-Interpretation

- The plan's verify regex for Task 3 (`grep -c 'lint-vcs-no-raw-git\.cjs' .github/workflows/test.yml | grep -q '^1$'`) requires exactly 1 occurrence of the pattern. Verified directly: `grep -c 'lint-vcs-no-raw-git\.cjs' .github/workflows/test.yml` reports `1`. Pass.

## Authentication Gates

None encountered.

## Threat Surface

Plan's `<threat_model>` covers:
- T-01-05-01 (allow.json bypass) — mitigated: every entry is checked into git, visible in PR diff; the separate `files[]` vs `globs[]` arrays make it easy to spot overly-broad globs at review.
- T-01-05-02 (inline annotation bypass) — mitigated: per-line annotation appears next to the offending invocation in the same diff; required `\S` after the annotation forces a non-empty rationale string.
- T-01-05-03 (scanner output info disclosure) — accepted: file paths and snippets are not sensitive (same exposure as `git grep`).
- T-01-05-04 (DoS via huge repo traversal) — accepted: skip-list excludes node_modules/.git/.jj/dist/dist-cjs which dominate file count; remaining tree is bounded.
- T-01-05-05 (path traversal in fixture test) — mitigated: `mkdtempSync` under `os.tmpdir()` with `__lint-fixture-vcs-` prefix; cleanup via `fs.rmSync(..., {recursive:true, force:true})` in finally block; W-4 isolated tree means no risk of fixture files ever appearing in the repo root, with `.gitignore` belt-and-suspenders for defense-in-depth.
- T-01-05-SC (npm/pip/cargo install slopsquat) — mitigated: this plan adds ZERO new dependencies. Only Node 22+ built-ins.

No new threat surface beyond the model. No threat-flag items.

## Known Stubs

None — the lint guard is fully implemented. The allowlist intentionally lists files that *will* exist post-Phase-2 migration as no-ops once those files no longer contain git invocations; that is not a stub but a forward-defensive entry pattern.

## Threat Flags

None.

## Self-Check: PASSED

Files created (verified via `[ -f path ]`):
- `scripts/lint-vcs-no-raw-git.cjs`
- `scripts/lint-vcs-no-raw-git.allow.json`
- `tests/lint-vcs-no-raw-git-fixture.test.cjs`

Files modified (verified via `git diff` and `git log`):
- `.github/workflows/test.yml` — new lint-tests step added
- `.gitignore` — `__lint-fixture-vcs-*` belt-and-suspenders entry added

Commits:
- `nnquxytmlsmkxklzpwulsvtnoquqpttu` (Task 1) — allowlist JSON
- `ypwvturxtklnvmuxnzqwpvtmkvqzmwqv` (Task 2 RED) — failing fixture test
- `rqpokornstvytxrwvxuysprrnnwrymqn` (Task 2 GREEN) — scanner implementation + allowlist refinement
- `zyqvxpynsyysouoylsymxsoszmmvwvnm` (Task 3) — CI workflow integration

Test results:
- `node scripts/lint-vcs-no-raw-git.cjs`: exit 0, 880 files scanned, 0 violations on Phase 1 land state.
- `node --test tests/lint-vcs-no-raw-git-fixture.test.cjs`: **3 tests passed** (clean repo / violation / annotation).
- CI workflow: 1 occurrence of `lint-vcs-no-raw-git.cjs` reference in `.github/workflows/test.yml`, in the existing `lint-tests` job.

## TDD Gate Compliance

Task 2 followed RED → GREEN sequence:
1. RED commit `ypwvturxtklnvmuxnzqwpvtmkvqzmwqv` (test only) — fixture test fails because `scripts/lint-vcs-no-raw-git.cjs` does not exist (`MODULE_NOT_FOUND`).
2. GREEN commit `rqpokornstvytxrwvxuysprrnnwrymqn` — scanner implementation; all 3 fixture tests pass; production scan exits 0.

No REFACTOR commit needed — the GREEN implementation matches the locked pattern from `scripts/lint-no-source-grep.cjs` and the plan's verbatim spec.
