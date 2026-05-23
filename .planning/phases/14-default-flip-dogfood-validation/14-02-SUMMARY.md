---
phase: 14-default-flip-dogfood-validation
plan: 02
subsystem: cli-bridge
tags: [cli-bridge, validation-envelope, loadConfig, contract-tests, jq-consumer-shape, parallelization]

# Dependency graph
requires:
  - phase: 14-default-flip-dogfood-validation
    provides: "Plan 01 flipped this repo's .planning/config.json parallelization from false → true; D-03 invariant 'explicit false preserved' moves to test-fixture."
  - phase: 11-orchestrator-agent-rewire
    provides: "{ok: false, reason} envelope idiom established at workspace-parallel-dispatch.ts:64/67/70 (D-01)."
  - phase: 09-jj-side-parallel-verbs
    provides: "workspaceParallelDispatchQuery CLI bridge; sdk/src/query/config-gates.ts loadConfig() async precedent."
provides:
  - "CONFIG-02 fourth validation envelope at sdk/src/query/workspace-parallel-dispatch.ts (parallelization_disabled refusal with guiding message)."
  - "D-03 mitigation contract tests in cmd-parallel-{jj,git}.test.ts (3 it cases each)."
  - "Strict-equal-false brownfield safety net (loose-falsey trap explicitly forbidden in source by grep gate)."
affects: [14-03-DOGFOOD, 14-04-PRE-SNAPSHOT, 14-05-METRICS]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Strict-equal-false config check: `config.parallelization === false` (NOT `!config.parallelization`) — protects against legacy nested-shape brownfield repos that would loose-falsey-trap on the truthy object."
    - "Envelope tolerance pattern in 'does NOT fire' contract tests: try/catch the dispatch call so a downstream adapter throw (no real VCS repo in tmpDir) is treated as proof the envelope did not short-circuit."
    - "CLI-bridge-only CONFIG-02 placement (D-06 UPSTREAM-02 sidecar discipline) — adapter parallel.ts files stay config-agnostic."

key-files:
  created: []
  modified:
    - sdk/src/query/workspace-parallel-dispatch.ts
    - sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts
    - sdk/src/vcs/__tests__/cmd-parallel-git.test.ts

key-decisions:
  - "Used strict-equal-`false` (`config.parallelization === false`), NOT loose-falsey `!config.parallelization` — per RESEARCH §A 'Critical caveat': SDK loadConfig does NOT normalize nested-shape, so the legacy `{enabled: true, ...}` object would loose-falsey-pass-through as truthy; strict-equal-`false` keeps the failure mode unambiguous."
  - "'does NOT fire' contract tests use try/catch envelope tolerance — past the envelope the dispatch crashes because tmpDir is not a real VCS repo; either return-without-envelope-reason OR throw proves the envelope did NOT short-circuit (the envelope is the SOLE surface under test)."
  - "Envelope inserted AFTER `plan_required` (input validation) and BEFORE `JSON.parse(planText)` — input validation is cheap and sync; loadConfig is async I/O; failing fast on disabled-config beats parsing a plan we won't dispatch."
  - "`message` field uses string concatenation to host backtick-quoted literal `parallelization: true` — matches the surrounding envelope style (no template literals) and preserves the load-bearing `parallelization: true` substring for the test regex assertion."

patterns-established:
  - "Fourth-envelope-peer-shape pattern: new validation envelope at workspace-parallel-dispatch.ts joins the existing three at lines 64/67/70 — identical TypeScript shape, one new `message` field for D-08 user guidance."
  - "Adapter-throw tolerance in CLI-bridge contract tests: when the envelope is the sole surface under test, downstream adapter throws are acceptable signal-of-non-fire (matches the cmd-parallel-max-concurrency-cli.test.ts uses-fake-adapter pattern but achieved without vi.mock)."

requirements-completed: [CONFIG-02]

# Metrics
duration: 14min
completed: 2026-05-23
---

# Phase 14 Plan 02: CONFIG-02 envelope + D-03 mitigation tests Summary

**Fourth validation envelope (`parallelization_disabled`) added to the `workspace.parallel.dispatch` CLI bridge with strict-equal-`false` brownfield safety, plus 6 D-03 mitigation contract tests across both backend test files.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-05-23T23:37:47Z
- **Completed:** 2026-05-23T23:52:06Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- CONFIG-02 envelope at `sdk/src/query/workspace-parallel-dispatch.ts:74-86` — peer-shaped to the existing three envelopes (lines 64/67/70) with one new `message` field per D-08.
- Strict-equal-`false` check (`config.parallelization === false`) per RESEARCH finding #1 — protects against legacy nested-shape brownfield repos that would loose-falsey-trap on the truthy `{enabled: true, ...}` object.
- 6 new contract tests (3 per file) in `cmd-parallel-{jj,git}.test.ts` codify the D-03 mitigation: explicit-false fires, missing-key does NOT fire (loadConfig defaults-merge per D-07), explicit-true does NOT fire.
- TSC clean; targeted test runs green; baseline `cmd-parallel-{jj,git}.test.ts` unchanged (21 total tests pass — 15 baseline + 6 new).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add CONFIG-02 envelope to CLI bridge (D-06 + D-07 + D-08)** — `urkoprrp` (feat)
2. **Task 2: Add CONFIG-02 envelope contract tests (D-03 mitigation)** — `zmuonlsp` (test)

## Files Created/Modified

- `sdk/src/query/workspace-parallel-dispatch.ts` — added `import { loadConfig } from '../config.js';` to the import block; inserted a new validation envelope at lines 74–86 between the existing `plan_required` envelope (line 71) and the `let plan: readonly...` declaration. The new envelope uses `await loadConfig(cwd)` (NOT `projectDir` — honors the `--cwd` override) and tests `config.parallelization === false` (strict equality, never loose-falsey).
- `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` — added `import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';` to the import block; appended a new top-level `describe('CONFIG-02 — parallelization_disabled', () => {...})` block at the end of the file with 3 `it()` cases. Uses random-suffix mkdtemp prefix `gsd-cfg02-jj-` per TEST-16 Pattern B.
- `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` — same shape as the jj file, with backend label `gsd-cfg02-git-`. Byte-identical test logic (the envelope is backend-agnostic — it returns before `createVcsAdapter` is called).

### Exact envelope insertion (line-range diff)

Before (sdk/src/query/workspace-parallel-dispatch.ts):
```typescript
  if (planRaw === undefined) {                                              // line 69
    return { data: { ok: false, reason: 'plan_required' } };                // line 70
  }                                                                          // line 71

  let plan: readonly { agentId: string; planId: string; ... }[];            // line 73 (was 73)
```

After:
```typescript
  if (planRaw === undefined) {                                              // line 69
    return { data: { ok: false, reason: 'plan_required' } };                // line 70
  }                                                                          // line 71

  const config = await loadConfig(cwd);                                     // line 74 (NEW)
  if (config.parallelization === false) {                                   // line 75 (NEW)
    return {                                                                 // line 76 (NEW)
      data: {                                                                // line 77 (NEW)
        ok: false,                                                           // line 78 (NEW)
        reason: 'parallelization_disabled',                                  // line 79 (NEW)
        message:                                                             // line 80 (NEW)
          'Parallelization is disabled in .planning/config.json. ' +         // line 81 (NEW)
          'Set `parallelization: true`, or remove the explicit `false` ' +   // line 82 (NEW)
          'entry to fall back to the default (true).',                       // line 83 (NEW)
      },                                                                     // line 84 (NEW)
    };                                                                       // line 85 (NEW)
  }                                                                          // line 86 (NEW)

  let plan: readonly { agentId: string; planId: string; ... }[];            // line 88 (was 73)
```

### Exact `message` string shipped

```
Parallelization is disabled in .planning/config.json. Set `parallelization: true`, or remove the explicit `false` entry to fall back to the default (true).
```

(Single-line equivalent of the 3-line string-concat in source. Contains the literal substring `parallelization: true` that the contract test assertion `expect(data.message).toMatch(/parallelization: true/)` checks.)

### Test counts

| File | Block | it() cases | Status |
|------|-------|------------|--------|
| `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` | `CONFIG-02 — parallelization_disabled` | 3 | passing |
| `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` | `CONFIG-02 — parallelization_disabled` | 3 | passing |
| **Total new tests** | | **6** | all passing |

## Decisions Made

1. **Strict-equal-`false` over loose-falsey** — per RESEARCH §A "Critical caveat" (must_haves.truths #4 of the plan). Source-level grep-gate `!config.parallelization` MUST be 0; `config.parallelization === false` MUST be exactly 1. Both gates pass.
2. **`message` via string-concatenation, not template literal** — preserves backtick characters in the literal `parallelization: true` substring without escaping, matches the existing envelope style (the file does not use template literals).
3. **try/catch envelope-tolerance in "does NOT fire" tests** — see Issues Encountered §1 below. The envelope is the SOLE surface under test; adapter throws in `tmpDir` (not a real VCS repo) are accepted as signal-of-non-fire.
4. **No new file created** — extended existing `cmd-parallel-{jj,git}.test.ts` per CONTEXT D-03 literal wording "the vitest contract tests `cmd-parallel-{jj,git}.test.ts` get one new fixture case each."

## Deviations from Plan

None - plan executed exactly as written.

The plan suggested either reuse `mkdtempSync` from `node:fs` or add `mkdtemp/writeFile/mkdir` from `node:fs/promises`. The plan flagged either approach as acceptable (action §1). I chose the promise-flavored variants because the test uses `async` arrows throughout and the existing test file mixes idioms freely. Source-level acceptance criteria are met without ambiguity.

## Issues Encountered

1. **"does NOT fire" tests crashed on adapter dispatch (Rule 1 - resilience fix during Task 2)**
   - **Found during:** Task 2 (first run of CONFIG-02 contract tests)
   - **Issue:** When the envelope correctly does NOT fire (cases 2 & 3: missing-key + explicit-true), the handler proceeds to `createVcsAdapter(cwd).workspace.parallel.dispatch(...)` which throws because the test's mkdtemp directory is not a real VCS repo. The test's `await workspaceParallelDispatchQuery(...)` then propagates the throw, failing the test even though the envelope behavior was correct.
   - **Fix:** Wrapped the dispatch call in try/catch in both "does NOT fire" tests (`it 2` and `it 3` in both files). The catch branch sets `envelopeReason = undefined` (proving the envelope did not short-circuit, since the envelope returns a value rather than throwing). The single assertion `expect(envelopeReason).not.toBe('parallelization_disabled')` holds in both branches.
   - **Verification:** 6/6 CONFIG-02 tests pass; baseline 15 tests still pass (21 total).
   - **Files modified:** `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts`, `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts`
   - **Committed in:** `zmuonlsp` (Task 2 commit — the try/catch was added in the same atomic commit; the test file never landed without it).

This is borderline Rule 1 vs an in-task refinement. The plan's behavior 2/3 said "the call may surface a different envelope or proceed to adapter dispatch — that's fine"; the executor decision was that "fine" includes "throw" since the assertion narrows to envelope reason inequality only. No new behavior was added; the test fixture was simply made resilient to the adapter's predictable crash on a non-repo path. Not classified as a true deviation because it does not change the plan's verification gate (`pnpm vitest run ... -t "parallelization_disabled"` exits 0 with 3 passing tests per file, as specified).

## Verification

- `cd sdk && pnpm tsc --noEmit` — exit 0 (type-check clean)
- `cd sdk && pnpm vitest run src/vcs/__tests__/cmd-parallel-jj.test.ts -t "parallelization_disabled"` — 3 passing
- `cd sdk && pnpm vitest run src/vcs/__tests__/cmd-parallel-git.test.ts -t "parallelization_disabled"` — 3 passing
- `cd sdk && pnpm vitest run src/vcs/__tests__/cmd-parallel-jj.test.ts src/vcs/__tests__/cmd-parallel-git.test.ts` — 21/21 passing (15 baseline + 6 new)
- `node scripts/check-skip-count.cjs` — exit 0 (TEST-16 baseline preserved; the 6 new tests add 0 skips)
- `grep -c "config.parallelization === false" sdk/src/query/workspace-parallel-dispatch.ts` — 1
- `grep -c "!config.parallelization" sdk/src/query/workspace-parallel-dispatch.ts` — 0 (loose-falsey trap explicitly absent)
- `grep -c "reason: 'parallelization_disabled'" sdk/src/query/workspace-parallel-dispatch.ts` — 1
- `grep -c "await loadConfig(cwd)" sdk/src/query/workspace-parallel-dispatch.ts` — 1 (uses `cwd`, NOT `projectDir`)

## Full-suite signal

`pnpm test:unit` reports pre-existing failures (28 files, 32 tests) that are unrelated to this plan — extensively documented in `.planning/quick/260522-vx2-test-maintenance-need-to-make-sure-all-p/260522-vx2-TRIAGE.md` as workflow-markdown drift inherited from upstream regression tests for git-era bugs that no longer apply post-jj-port. My three touched files are all green; `pnpm vitest run src/query/config-mutation.test.ts` etc. failures are out-of-scope test-maintenance debt.

## Next Phase Readiness

- CONFIG-02 envelope is the operative refusal gate for direct-SDK and shell-harness callers of `workspace.parallel.dispatch`. The Plan 14-03 dogfood runner can rely on its pre-flip step (Plan 01 already flipped this repo's config to `true`) to keep the envelope quiescent during the in-repo jj cell.
- D-03 mitigation closed — the in-the-wild "this repo's `parallelization: false` is preserved" invariant has been moved from disk-state to test-fixture form. No further D-03 work in remaining 14-xx plans.
- Adapter sidecars (`sdk/src/vcs/jj/parallel.ts`, `sdk/src/vcs/git/parallel.ts`) remain untouched per D-06 — UPSTREAM-02 sidecar discipline preserved.

## Self-Check: PASSED

- `sdk/src/query/workspace-parallel-dispatch.ts` — FOUND (modified)
- `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` — FOUND (modified)
- `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` — FOUND (modified)
- Task 1 commit `urkoprrp` — FOUND in log
- Task 2 commit `zmuonlsp` — FOUND in log

---
*Phase: 14-default-flip-dogfood-validation*
*Completed: 2026-05-23*
