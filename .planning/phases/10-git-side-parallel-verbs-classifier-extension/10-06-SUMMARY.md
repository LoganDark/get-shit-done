---
phase: 10-git-side-parallel-verbs-classifier-extension
plan: 06
subsystem: vcs/parallel
tags:
  - gap-closure
  - lint-fix
  - ci-unblock
  - blocker
  - sc5
dependency_graph:
  requires:
    - 10-05
  provides:
    - SC5 closure (lint-vcs-no-commit-id gate now green)
    - cmd-parallel-git.test.ts last hex-shape regex literal removed
  affects:
    - sdk/src/vcs/__tests__/cmd-parallel-git.test.ts
tech_stack:
  added: []
  patterns:
    - vitest expect.extend toBeIdOf matcher swap (project memory feedback_vitest_extend_over_free_fn)
key_files:
  created: []
  modified:
    - sdk/src/vcs/__tests__/cmd-parallel-git.test.ts
decisions:
  - "Path (c) matcher swap chosen over path (a) inline annotation or path (b) allowlist entry — preserves solo-dev lean-allowlist invariant + matches lint script's own diagnostic recommendation at scripts/lint-vcs-no-commit-id.cjs:135"
  - "Used documented options-object form toBeIdOf({ kind: 'git', allowShort: true }) — the plan-spec'd two-arg positional form ('git', { allowShort: true }) does not match the matcher's actual signature in tests/__tools__/vitest-matchers.ts (Rule 1 deviation; same precedent as 10-05)"
metrics:
  duration: "~5min"
  completed: "2026-05-15"
---

# Phase 10 Plan 06: SC5 lint regression closure (matcher swap) Summary

One-liner: Closed Phase 10 SC5 (`lint-vcs-no-commit-id` CI gate red) by swapping the single remaining hex-shape regex literal at `cmd-parallel-git.test.ts:355` for the project's canonical `toBeIdOf` custom matcher — one-line edit, zero allowlist diff, zero new annotations, all four lint/test/build gates now green.

## What landed

### Single one-line edit (`sdk/src/vcs/__tests__/cmd-parallel-git.test.ts:355`)

**Before:**
```ts
expect(crashEntry?.changeIdShort).toMatch(/^[0-9a-f]{12}$/);
```

**After:**
```ts
expect(crashEntry?.changeIdShort).toBeIdOf({ kind: 'git', allowShort: true });
```

Identical pass-acceptance on the 12-char `[0-9a-f]` short SHA — the matcher's `kind: 'git'` + `allowShort: true` branch accepts strings of length 7..40 matching `/^[0-9a-f]+$/`, so the assertion behaves the same on the crashed-worker classifier payload. No import changes — matcher registered globally via `sdk/vitest.config.ts setupFiles` pointing to `tests/__tools__/vitest-matchers.ts`.

The file's two regression scenarios appended by Plan 10-05 (Scenario A at line 602) already used the same matcher form, so this one line was the last hex-shape regex literal in the file.

## Justification (path (c) selection)

Cited from project memory `feedback_vitest_extend_over_free_fn`:

> "Prefer vitest expect.extend matchers over allowlist theatre when feasible. When design spec says 'custom matcher' treat literal API name as placeholder; implement as expect.extend for composability with nested structures."

The lint script's own diagnostic at `scripts/lint-vcs-no-commit-id.cjs:135` explicitly recommends this exact swap as the architecturally-correct fix:

> `/^[0-9a-f]{N}/ regex on id-bearing field     -> expect(value).toBeIdOf(kind) custom matcher`

Path (a) inline annotation and path (b) allowlist-file entry were both REJECTED — they would defer the semantic upgrade ("id of kind" contract) for a one-line escape mechanism and increase Pitfall 7 (allowlist hollowing) risk.

## Confirmations

| Gate | Command | Exit | Notes |
| --- | --- | --- | --- |
| SC5 closure | `node scripts/lint-vcs-no-commit-id.cjs` | 0 | Was 1 before this plan. Output: `ok lint-vcs-no-commit-id: 1038 files scanned, 0 violations` |
| Sibling lint intact | `node scripts/lint-vcs-no-raw-git.cjs` | 0 | `ok lint-vcs-no-raw-git: 1076 files scanned, 0 violations` |
| Skip-count baseline preserved | `node scripts/check-skip-count.cjs` | 0 | `current=18 baseline(origin/main)=18` (exit code is the contract) |
| Vitest still green | `cd sdk && pnpm vitest run src/vcs/__tests__/cmd-parallel-git.test.ts` | 0 | 8 tests passed (1 Test File, 8 Tests, ~4.5s) |
| SDK builds clean | `cd sdk && pnpm build` | 0 | tsc + tsc -p tsconfig.cjs.json both clean |
| Allowlist untouched | `jj diff --stat scripts/lint-vcs-no-commit-id.allow.json` | n/a | `0 files changed, 0 insertions(+), 0 deletions(-)` |
| No annotation added | `grep -q "vcs-lint:allow-commit-id-here" sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` | non-zero | Zero matches |
| Single-file diff | `jj diff --stat` | n/a | `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts \| 2 +-` (1 line changed) |

## Deviations from Plan

### Rule 1 — Bug: plan-mandated two-arg positional matcher form does not match the actual signature

**Found during:** Pre-edit signature verification (read of `tests/__tools__/vitest-matchers.ts:38-59`).

**Issue:** Plan 10-06's `<interfaces>` block and Task 1 `<action>` mandate the literal syntax:

```ts
expect(crashEntry?.changeIdShort).toBeIdOf('git', { allowShort: true });
```

This is a TWO-ARG positional call. The matcher's actual signature in `tests/__tools__/vitest-matchers.ts:38-39` is a SINGLE union-typed `kindOrOpts` parameter:

```ts
toBeIdOf(received: unknown, kindOrOpts: ToBeIdOfKind | ToBeIdOfOpts) { ... }
```

A two-arg call `toBeIdOf('git', { allowShort: true })` passes `'git'` as `kindOrOpts` (typed as string → wraps in `{ kind: 'git' }`), then silently discards the trailing `{ allowShort: true }` object. Result: `allowShort` defaults to `false`, `min` becomes 40, and the matcher rejects the 12-char short SHA with `expected "..." to be a git id (alphabet [0-9a-f], 40-40 chars); got len=12`.

Plan 10-05's executor hit this same defect in Wave 4 and applied a documented Rule-1 deviation (see 10-05-SUMMARY.md "Rule 1 — Bug: plan-mandated literal matcher syntax does not match the matcher's actual signature"). Plan 10-05's two regression scenarios at lines 602 of the same test file already use the corrected options-object form.

**Fix:** Used the documented options-object form `expect(crashEntry?.changeIdShort).toBeIdOf({ kind: 'git', allowShort: true })` — the only call shape that actually applies `allowShort=true`. Matches the form used at line 602 of the same file (Plan 10-05's regression scenario A).

**Files modified:** `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` line 355.

**Commit:** `ktw` (fix(10-06): swap hex-shape regex for toBeIdOf matcher).

**Verify-gate impact:** Plan 10-06's verify-gate `grep -q "expect(crashEntry?.changeIdShort).toBeIdOf('git', { allowShort: true })"` (single-quoted string-kind form) will NOT match my options-object form. But the SEMANTIC intent is satisfied — there is no hex regex; the matcher is in use; lint exits 0; vitest exits 0. The verifier should treat `toBeIdOf({ kind: 'git'` as semantically equivalent for SC5 re-verification (same accommodation already in 10-05-SUMMARY.md).

## Re-verification readiness

- **SC2 (CR-01):** GREEN after 10-05. Crashed-agent gate in STEP 1 plus Scenario A regression.
- **SC3 (CR-02):** GREEN after 10-05. expectedNames filter in STEP 3 plus Scenario B regression.
- **SC5 (lint-vcs-no-commit-id):** **GREEN after this plan.** Single hex-shape regex literal removed; `scripts/lint-vcs-no-commit-id.cjs` exits 0.

`gsd verify-phase 10` is expected to yield `status: verified` with 5/5 must-haves (was 2/5 at verification time). All three closure plans 10-04 + 10-05 + 10-06 have landed.

## Threat surface scan

No new network endpoints, auth paths, file access patterns, or schema changes. Pure assertion-form swap inside an existing test scenario. The matcher swap is more semantically correct than the regex (asserts "git revision id" contract instead of "12 lowercase hex chars" textual shape) — net reduction in surface, not addition.

## Self-Check: PASSED

Verified post-write:
- `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts:355` contains the new `toBeIdOf({ kind: 'git', allowShort: true })` call (verified by `grep -n "toBeIdOf" sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` showing line 355 + line 602 — both matchers in scope).
- `grep -c "0-9a-f" sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` returns 0 (no hex regex anywhere in the file).
- `node scripts/lint-vcs-no-commit-id.cjs` exit 0 (was 1).
- `node scripts/lint-vcs-no-raw-git.cjs` exit 0 (unchanged baseline).
- `node scripts/check-skip-count.cjs` exit 0 (current == baseline).
- `pnpm vitest run src/vcs/__tests__/cmd-parallel-git.test.ts` from `sdk/`: 8 passed (8).
- `pnpm build` from `sdk/`: tsc + tsc -p tsconfig.cjs.json both clean.
- `jj diff --stat scripts/lint-vcs-no-commit-id.allow.json`: 0 files changed (allowlist untouched).
- `grep -q "vcs-lint:allow-commit-id-here" sdk/src/vcs/__tests__/cmd-parallel-git.test.ts`: no match (no annotation added).
- Task 1 commit recorded (jj change id `ktw`).
