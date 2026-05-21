---
phase: 12-a3-colocated-pre-commit-fix-parallel-track
verified: 2026-05-20T00:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 12: A3 colocated pre-commit fix (parallel track) Verification Report

**Phase Goal:** jj 0.41 colocated `jj squash` reliably fires the pre-commit hook. The gap inherited from v1.0 Phase 4 closes. Independent parallel track joining at CI integration (Phase 13).
**Verified:** 2026-05-20T00:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

> Goal evaluated against the CORRECTED Success Criteria (ROADMAP.md:152-159, SC1-SC5). The ROADMAP Goal line (ROADMAP.md:149) still says `.git/hooks/pre-commit` — a known, intentional doc-staleness artifact. Plan 12-01 was scoped to the SC block only and deliberately did not touch the Goal line. Per the verification instructions this stale wording is noted but is NOT a failure.

## Goal Achievement

### Observable Truths

| #   | Truth (Success Criterion) | Status     | Evidence       |
| --- | ------------------------- | ---------- | -------------- |
| SC1 | CONTEXT-level decision recorded at discuss-phase (Path 1 chosen; Path A/B not chosen; Path C rejected) | ✓ VERIFIED | `12-CONTEXT.md:38-52` D-01 records Path 1 as chosen with rationale ("already shipped and tested for `.githooks/`; env opt-out preserves forward-compat seam"); explicitly states Path A and Path B "are not chosen" and "Path C (version-probe) is rejected per ROADMAP." |
| SC2 | On a colocated jj fixture, a sentinel `.githooks/pre-commit` fires exactly once on `vcs.commit` (or zero with `GSD_HOOK_SKIP_COLOCATED`) | ✓ VERIFIED | `jj-hooks.test.ts:250-298` — HOOK-07 test uses a counter hook body (`echo fired >> markerPath`, append not truncate) and asserts marker line count `=== 1` after `vcs.commit`, twice across two independent commits. Sibling `:221` test asserts zero-fire with `GSD_HOOK_SKIP_COLOCATED=1`. Test passes when run in isolation (verified — see Behavioral Spot-Checks). |
| SC3 | Regression test extends the existing `jj-colocated` describe block at `jj-hooks.test.ts:167` (no new test file), green on the jj-colocated CI lane | ✓ VERIFIED | New `it()` is a sibling inside `describe('jj-colocated: …', …)` at `jj-hooks.test.ts:168`; `grep -c "describe('jj-colocated"` returns 1 (no second block); `mkdtempSync` count is 2 (unchanged — shared fixture reused). No new test file: `key-files.created` in `12-02-SUMMARY.md` is empty. Suite runs green 9/9 in isolation. |
| SC4 | Hook idempotency audit recorded as Phase 12 close-gate evidence | ✓ VERIFIED | `12-HOOK-IDEMPOTENCY-AUDIT.md` exists (97 lines). Standalone artifact with title, `**Generated:**` line, `**Non-idempotent operations found:** 0`, intro citing `jj.ts:264-266`, scope statement, verdict legend, findings table (5 operations across `pre-commit` + `pre-push`), verdict section with explicit empty-finding baseline, and a re-runnable verification block. |
| SC5 | The public `CommitInput`/`CommitResult` adapter surface is unchanged | ✓ VERIFIED | `sdk/src/vcs/types.ts:24-98` — `CommitInput` and `CommitResult` field comments all reference Phase 2.1/3/4 origins; no Phase 12 marker anywhere. `sdk/src/vcs/backends/jj.ts` and `hook-bridge.ts` were not modified by any Phase 12 plan (`files_modified` in 12-02/12-03 PLAN frontmatter excludes them; jj log shows no Phase 12 commit touching them). The Path 1 fix at `jj.ts:249-289` is pre-existing (shipped v1.0 Phase 5 plan 05-01). |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected    | Status | Details |
| -------- | ----------- | ------ | ------- |
| `.planning/ROADMAP.md` | Corrected Phase 12 SC2 + SC3 wording, contains `.githooks/pre-commit` | ✓ VERIFIED | SC2 (ROADMAP.md:155) names `.githooks/pre-commit`; SC3 (ROADMAP.md:156) points at `jj-hooks.test.ts:167`; `grep -c 'jj-colocated-hooks.test.ts'` returns 0. SC1/SC4/SC5 untouched. Five numbered SCs preserved. |
| `.planning/REQUIREMENTS.md` | Corrected HOOK-06 + HOOK-07 wording, contains `.githooks/pre-commit` | ✓ VERIFIED | HOOK-06 (line 52) names `.githooks/pre-commit`, carries the explicit `.git/hooks/<stage>` out-of-scope note (D-02 invariant) and the husky/pre-commit-framework migration callout. HOOK-07 (line 53) affirms `.githooks/pre-commit` sentinel and references `jj-hooks.test.ts:167`. No stale `.git/hooks/pre-commit` on either HOOK bullet line. |
| `sdk/src/vcs/__tests__/jj-hooks.test.ts` | HOOK-07 fires-exactly-once regression coverage, contains "exactly once" | ✓ VERIFIED | HOOK-07 `it()` block at `:250-298`; title literally `'HOOK-07: colocated vcs.commit fires .githooks/pre-commit exactly once'`. Counter-hook-body pattern; line-count `=== 1` assertion. `readFileSync` added to existing `node:fs` import (no new import line). No raw `git ` invocation in the new block (lines 250-298 scanned clean). |
| `.planning/phases/12-…/12-HOOK-IDEMPOTENCY-AUDIT.md` | SC4 close-gate evidence, contains "Hook Idempotency Audit", min 30 lines | ✓ VERIFIED | 97 lines (≥30). Title `# Hook Idempotency Audit — Phase 12 (SC4 / D-05)`. All required sections present. Cites `jj.ts:264-266`. Findings table covers `.githooks/pre-commit` and `.githooks/pre-push`. |

### Key Link Verification

| From | To  | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| ROADMAP Phase 12 SC2/SC3 | 12-02/12-03 PLAN task text | corrected `.githooks/pre-commit` wording | ✓ WIRED | SC2/SC3 carry `.githooks/pre-commit` and `jj-hooks.test.ts:167`; downstream plans 12-02/12-03 reference the corrected wording. Cascade-amendment ran Wave 1 before Wave 2. |
| new `it()` in jj-hooks.test.ts | `vcs.commit()` → `fireHook()` → `.githooks/pre-commit` | counter hook body asserts single fire per commit | ✓ WIRED | Test calls `vcs.commit(...)` (real adapter, not a mock); `vcs` is a live `JjVcsAdapter` from `createVcsAdapter(dir, { kind: 'jj' })`. `jj.ts:281` calls `fireHook(cwd, 'pre-commit', …)`; `writeHook` installs `.githooks/pre-commit`. Counter body proves exactly-once. Verified by live test run. |
| `12-HOOK-IDEMPOTENCY-AUDIT.md` | `.githooks/pre-commit` + `.githooks/pre-push` | per-hook-stage findings table with verdicts + line citations | ✓ WIRED | Findings table has 5 rows: 2 for `pre-commit` (staged-diff guard `:4`, gated `check:alias-drift` `:5`), 3 for `pre-push` (`GSD_BLOCKED_AUTHOR_REGEX` guard, `git rev-list`/`git show -s` reads, `exit 1` rejection path). Operations cross-checked against the actual scripts. |

### Data-Flow Trace (Level 4)

Not applicable — Phase 12 produces no UI/dynamic-data artifact. The regression test exercises a real `vcs.commit` → `fireHook` → `.githooks/pre-commit` flow (verified live; the marker file is genuinely written by hook execution, not hardcoded). The audit and doc edits are static documentation by nature.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| HOOK-07 regression test passes; full jj-hooks suite green | `npx vitest run src/vcs/__tests__/jj-hooks.test.ts` (from `sdk/`, isolation) | 9 tests passed (9), incl. `HOOK-07: colocated vcs.commit fires .githooks/pre-commit exactly once` (1076ms) | ✓ PASS |
| Stale `jj-colocated-hooks.test.ts` filename removed from ROADMAP | `grep -c 'jj-colocated-hooks.test.ts' .planning/ROADMAP.md` | `0` | ✓ PASS |
| No stale `.git/hooks/pre-commit` on operative SC2/HOOK lines | `grep -nE '\.git/hooks/pre-commit' ROADMAP.md REQUIREMENTS.md` | Only ROADMAP:149 (stale Goal line, accepted), :154 (SC1 describing rejected Path B — correct), :164 (plan-list meta-description of the rewrite — correct). None on SC2/SC3/HOOK-06/HOOK-07 operative lines. | ✓ PASS |
| No new raw `git` invocation in HOOK-07 block | `sed -n '250,298p' jj-hooks.test.ts \| grep -E 'git '` | no matches | ✓ PASS |

> Note: running the full `sdk/src/vcs/__tests__/` directory under default vitest parallelism OOMs on this machine — a pre-existing environmental condition, not a Phase 12 defect. The HOOK-07 file was run in isolation per the verification instructions and is 9/9 green.

### Probe Execution

Not applicable — Phase 12 declares no probes (no `scripts/*/tests/probe-*.sh` in PLAN/SUMMARY; not a migration/tooling phase). The regression test (run above) is the runnable verification surface and was executed directly.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| HOOK-06 | 12-01, 12-03 | A3 colocated pre-commit fix landed — jj 0.41 colocated `jj squash` reliably fires `.githooks/pre-commit`; lives in `jj.ts::commit` (not an interface change); `.git/hooks/` firing explicitly out of scope; husky/pre-commit-framework migration callout | ✓ SATISFIED | Path 1 fix shipped at `jj.ts:249-289` (unconditional `fireHook` with `GSD_HOOK_SKIP_COLOCATED` opt-out — verified present). REQUIREMENTS HOOK-06 reworded to `.githooks/pre-commit` with the out-of-scope note and migration callout. Traceability row (line 126) = `Complete`. |
| HOOK-07 | 12-01, 12-02, 12-03 | Regression test for HOOK-06 on a colocated jj fixture; sentinel at `.githooks/pre-commit`; fires exactly once; lives in extended `jj-hooks.test.ts:167` block; idempotency audit recorded | ✓ SATISFIED | HOOK-07 `it()` block at `jj-hooks.test.ts:250-298` (in the `:167` block, no new file); 9/9 green in isolation. Idempotency audit `12-HOOK-IDEMPOTENCY-AUDIT.md` recorded. REQUIREMENTS HOOK-07 reworded. Traceability row (line 127) = `Complete`. |

Both phase requirement IDs (HOOK-06, HOOK-07) are declared in the PLAN frontmatter and accounted for. No orphaned requirements: `grep -E 'Phase 12' REQUIREMENTS.md` maps only HOOK-06 + HOOK-07 to this phase (REQUIREMENTS.md:150), both of which appear in plan `requirements` fields.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | — | — | No `TBD`/`FIXME`/`XXX` debt markers in `jj-hooks.test.ts` or `12-HOOK-IDEMPOTENCY-AUDIT.md`. No stubs, no empty implementations, no hardcoded-empty render data. The regression test exercises a real adapter call path. |

Code review (`12-REVIEW.md`, standard depth) recorded 0 critical, 1 warning (WR-01), 2 info — none are blockers. WR-01 notes that HOOK-07 leaves a residual `.githooks/pre-commit` in the shared `dir` (no `afterEach` teardown), coupling it to sibling-test source order; the review explicitly states the test "passes deterministically" as written and the concern is future-fragility under later edits, not a current defect. IN-01/IN-02 are optional robustness/comment improvements. These do not block Phase 12 goal achievement.

### Minor Observations (non-blocking)

- **Stale ROADMAP Goal line (ROADMAP.md:149):** still reads `.git/hooks/pre-commit`. Known and intentional — plan 12-01 was scoped to the SC block only. Per verification instructions, noted but not a failure. A future doc pass could align it for tidiness.
- **Audit line-citation imprecision (12-HOOK-IDEMPOTENCY-AUDIT.md):** the `pre-push` env-guard row cites `:5-11` (env read is line 5, early-exit block 9-11) and the `exit 1` rejection row cites `:38-48` (the script's last line is 48/EOF; the rejection block is 38-47). The cited ranges are slightly wider than the exact operation spans but each enclosing range does contain the operation, and the idempotency classification of all 5 operations is factually correct (all are read-only inspections — independently confirmed against the script source). Cosmetic, not a correctness defect.

### Human Verification Required

None. All five Success Criteria are programmatically verifiable and were verified: the regression test was run live (9/9 green including HOOK-07), the doc amendments and the audit artifact were inspected directly, and the `CommitInput`/`CommitResult` surface was confirmed unchanged by source inspection. No visual, real-time, or external-service behavior is involved.

### Gaps Summary

No gaps. The Phase 12 goal — closing the v1.0 Phase 4 A3 gap so jj 0.41 colocated `jj squash` reliably fires the pre-commit hook — is achieved against the corrected Success Criteria:

- The fix-path decision (Path 1) is recorded in CONTEXT (SC1).
- The Path 1 fix is live at `jj.ts:249-289` and is now locked by a regression test that proves exactly-once firing on a colocated fixture (SC2), green on the suite (SC3).
- The hook-idempotency audit that Path 1's always-fire design depends on is recorded as standalone close-gate evidence (SC4).
- The public adapter surface (`CommitInput`/`CommitResult`) is unchanged — the fix is confined to the jj backend body (SC5).

The ROADMAP + REQUIREMENTS doc cascade-amendment correctly renamed the operative hook fire surface from git's `.git/hooks/` namespace to the GSD-managed `.githooks/` convention. Phase 12 is ready to join Phase 13 (CI integration).

---

_Verified: 2026-05-20T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
