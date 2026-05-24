---
phase: 13-ci-parallel-path-lane-lint-close-gate
verified: 2026-05-22T00:00:00Z
re_verified: 2026-05-24T00:00:00Z
status: passed
score: 5/5 must-haves verified (truth 6 resolved 2026-05-24 via scripts/run-tests.cjs recursive discovery)
overrides_applied: 0
gaps:
  - truth: "The LINT-04 audit's unit test is executed by the project's existing test runner (`node scripts/run-tests.cjs` / `npm test`), giving the CI-06 gate an executing regression guard"
    status: resolved
    resolved_at: 2026-05-24
    resolution: "scripts/run-tests.cjs:12 now does readdirSync(testDir, { recursive: true }) so tests/scripts/*.test.cjs files are collected by the runner. Verified: node --test on all 4 tests/scripts/*.test.cjs files passes 29/29 (881ms). The 4 newly-collected tests are audit-workflow-raw-git (Phase 13's), allowlist-parser, audit-id-namespace, and migr-06-close-gate."
    original_reason: "tests/scripts/audit-workflow-raw-git.test.cjs exists and all 7 cases pass when run directly (node --test → exit 0), but scripts/run-tests.cjs does a NON-recursive readdirSync('tests') and only collects tests/*.test.cjs. The new test is one directory deeper (tests/scripts/) so it is collected by no runner — npm test discovers 506 files, none of them this test, and no CI workflow references tests/scripts. The audit is documented as the CI-06 gate but its backing test runs nowhere; a future edit that breaks fence detection or the per-file comparison would ship green. CONTEXT.md D-07 / REQUIREMENTS.md LINT-04 imply the audit gets a working unit test. The test is a substantive, well-written artifact that has zero regression-protection value as wired."
    artifacts:
      - path: "scripts/run-tests.cjs"
        issue: "Line 12: `readdirSync(testDir)` is non-recursive (testDir = tests/), then `.map(f => join('tests', f))` — only tests/*.test.cjs is ever passed to `node --test`. tests/scripts/*.test.cjs is invisible to the runner."
      - path: "tests/scripts/audit-workflow-raw-git.test.cjs"
        issue: "Placed one directory below the runner's flat scan; never collected by `npm test` and referenced by no CI workflow. 7/7 cases pass only when invoked directly."
    missing:
      - "Make scripts/run-tests.cjs discover nested test files: `readdirSync(testDir, { recursive: true })` then `.map(f => join('tests', f))` — this also rescues the 3 other stranded tests/scripts/*.test.cjs files (allowlist-parser, audit-id-namespace, migr-06-close-gate)"
      - "OR relocate the test to tests/audit-workflow-raw-git.test.cjs (flat) and fix its require() path from `../../scripts/` to `../scripts/`"
      - "Additionally wire `node scripts/audit-workflow-raw-git.cjs` and the audit unit test into a CI lane so the CI-06 gate's backing test actually executes on every build"
deferred:
  - truth: "No skip-count regression versus origin/main (check-skip-count.cjs exits 0)"
    addressed_in: "Phase 10/11 follow-up (pre-existing branch debt, not Phase 13)"
    evidence: "deferred-items.md and 13-02-SUMMARY.md document the +4 skip regression (22 vs 18) originates in sdk/src/vcs/__tests__/cmd-parallel-max-concurrency-adapter.test.ts and cmd-workspace-assert-dispatched-cwd.test.ts (Phase 10/11 SDK files); verified present on the branch tip before plan 13-02's RED-gate commit. Phase 13's two new files add zero net skips. Orchestrator context item 4 confirms this is not Phase-13-caused."
---

# Phase 13: CI parallel-path lane + lint close-gate Verification Report

**Phase Goal:** A new CI matrix lane runs synthetic parallel phases end-to-end on both backends and is required-blocking on jj-colocated; the v1.3 "raw-git in workflow markdown collapses to zero" architectural proof is recorded as one-shot audit evidence (not promoted to permanent CI).

**Verified:** 2026-05-22
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

The phase goal decomposes into two halves: (1) a CI matrix lane running synthetic parallel phases E2E on both backends, required-blocking on jj-colocated; (2) the raw-git audit recorded as one-shot evidence, not promoted to permanent CI. Both halves are delivered by the four shipped files. The single gap is not in the lane or the audit itself — it is in the regression-test wiring for the audit: the audit's unit test exists and passes but is collected by no runner.

### Observable Truths

Truths merged from ROADMAP.md Phase 13 Success Criteria (SC1-SC5) and PLAN frontmatter must_haves across plans 13-01..13-04.

| #   | Truth (from ROADMAP SC + PLAN must_haves) | Status | Evidence |
| --- | ----------------------------------------- | ------ | -------- |
| 1   | SC1 — New CI matrix lane `parallel-e2e` runs a synthetic 2-plan phase E2E on both backends; required-blocking on jj-colocated, optional on git | ✓ VERIFIED | `.github/workflows/parallel-e2e.yml` defines job `parallel-e2e` with `strategy.matrix.backend: [git, jj-colocated]`, `continue-on-error: ${{ matrix.backend == 'git' }}` (git allow-fail, jj-colocated required — line 62), runs `bash scripts/e2e-parallel-phase.sh` per cell (line 119). `parallel-e2e-gate` job (`needs: [parallel-e2e]`, `if: always()`, lines 136-143) inspects `needs.parallel-e2e.result` and `exit 1`s with `::error::` unless aggregate is `success` — the actual blocking guarantee. 13-03-SUMMARY confirms the harness ran green E2E on both backends. |
| 2   | SC2 — `audit-workflow-raw-git.cjs` ships as a baseline-regression guard carrying a frozen 127-hit baseline, fails only on raw-git ADDED beyond baseline, passes within baseline | ✓ VERIFIED | `scripts/audit-workflow-raw-git.cjs` (250 lines) — `BASELINE` is an `Object.freeze`d per-file map; verified `Object.values(BASELINE).reduce` sums to **127** across **30** keys. `auditWorkflowRawGit` applies the per-file regression rule (`current > baseline`). `node scripts/audit-workflow-raw-git.cjs` exits **0** against the live tree (`totalCurrent=127`, `regressions=0` — current == baseline). Synthetic-baseline probe (baseline-absent, 2 hits) returns `ok=false, regressions=1` — regression behavior fires. `SHELL_GIT_RE` is byte-identical to `lint-vcs-no-raw-git.cjs` `SHELL_GIT_PATTERNS` (line 87). Per orchestrator context item 1, the regression-guard framing (not zero-assertion) is the deliberate Open Q1 re-baseline. |
| 3   | SC3 — `parallel-e2e` lane runs the LINT-04 audit and fails if the baseline / no-regression invariant breaks (milestone-completeness regression guard) | ✓ VERIFIED | `parallel-e2e.yml` line 125-127: step "Audit — raw git in workflow markdown (CI-06)" runs `node scripts/audit-workflow-raw-git.cjs`. The script's `require.main` block ends with `process.exit(result.ok ? 0 : 1)` (line 238) — a non-zero exit (raw-git regression beyond the 127-hit baseline) fails the cell. ROADMAP SC3 and REQUIREMENTS.md CI-06 both carry the re-baselined "baseline / no-regression invariant" wording. |
| 4   | SC4 / LINT-05 — `lint-vcs-no-raw-git.allow.json` net diff is +0 or +1; the 23 production entries untouched; diff recorded | ✓ VERIFIED | Allowlist confirmed at exactly **24** entries; the single non-production entry `sdk/src/vcs/git/parallel.ts` is present with its verbatim reason. `node scripts/lint-vcs-no-raw-git.cjs` exits 0 — the whole repo including the new harness is raw-git-clean, no new entry forced. `13-LINT05-ALLOWLIST-DIFF.md` records the 24-count, the +1 attributed to Phase 10, and the 23-production-entries-unchanged statement. The +1 (not +0) is within the "+0 or +1" budget. |
| 5   | SC5 — A3 fix from Phase 12 is exercised on the jj-colocated `parallel-e2e` lane (hook fires during a parallel-dispatched phase) | ✓ VERIFIED | `scripts/e2e-parallel-phase.sh` installs a sentinel `.githooks/pre-commit` (lines 126-132) before the seed commit, routes per-workspace commits through `$GSD_SDK query commit` in a cwd-pinned subshell (lines 236-240), leaves `GSD_HOOK_SKIP_COLOCATED` unset. Assertion 6 (lines 346-351) asserts the marker line count equals the workspace count. 13-03-SUMMARY documents the harness ran green with the hook firing 2× during the jj-colocated parallel-dispatched run; orchestrator context item 5 corroborates the sentinel fired 2× on the jj-colocated cell during execution. |
| 6   | PLAN 13-02 must_have — the audit's unit test passes via the existing `node scripts/run-tests.cjs` runner (LINT-04 / CONTEXT D-07 implication) | ✗ FAILED | `tests/scripts/audit-workflow-raw-git.test.cjs` exists; `node --test` on it directly → 7/7 pass, exit 0. BUT `scripts/run-tests.cjs:12` does non-recursive `readdirSync('tests')` + `.map(f => join('tests', f))` — collects only `tests/*.test.cjs`. Simulated discovery: 506 files, the audit test NOT among them; recursive discovery would find 510 (the 4 stranded `tests/scripts/*` files). No CI workflow references `tests/scripts`. The CI-06 gate's regression test runs nowhere. See Gaps Summary + CR-01. |

**Score:** 4/5 ROADMAP Success Criteria verified. Truth 6 (a PLAN-frontmatter must_have, not a ROADMAP SC) FAILED — this is the single blocker.

### Deferred Items

Items not yet met but explicitly addressed in (or attributed to) work outside Phase 13's scope.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | No skip-count regression vs origin/main (`check-skip-count.cjs` exits 0; +4: 22 vs 18) | Phase 10/11 follow-up | `deferred-items.md` + `13-02-SUMMARY.md`: the +4 originates in `cmd-parallel-max-concurrency-adapter.test.ts` and `cmd-workspace-assert-dispatched-cwd.test.ts` (Phase 10/11 SDK files), verified present on the branch tip before plan 13-02's RED-gate commit. Phase 13's two new files add zero net skips. Orchestrator context item 4 confirms not Phase-13-caused. |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `scripts/audit-workflow-raw-git.cjs` | LINT-04 baseline-regression-guard scanner | ✓ VERIFIED | 250 lines; `module.exports` of 5 pure functions + `BASELINE`; `BASELINE` sums to 127/30 keys; exits 0 live, non-zero on synthetic regression; stdout-only (no `writeFile`/`exec*`/`spawnSync`); WIRED into `parallel-e2e.yml` line 127. |
| `tests/scripts/audit-workflow-raw-git.test.cjs` | node:test unit test, 7 cases | ⚠️ ORPHANED | Exists; 7/7 cases pass under `node --test` directly; substantive (mkdtemp fixtures, synthetic-baseline injection, `finally` cleanup). NOT wired — collected by no runner (`run-tests.cjs` non-recursive scan; no CI reference). Exists + substantive but unwired → ORPHANED. |
| `scripts/e2e-parallel-phase.sh` | CI-05 E2E parallel-dispatch harness | ✓ VERIFIED | 357 lines, `0755`; `bash -n` clean; drives `workspace.parallel.{dispatch,fan-in}`; mirrors `execute-phase.md` dispatch (557-561) + fan-in (768-773) 1:1; 6 per-backend assertions; `lint-vcs-no-raw-git.cjs` does not flag it; WIRED into `parallel-e2e.yml` line 119. |
| `.github/workflows/parallel-e2e.yml` | CI-05 lane + CI-06 audit step + D-04 gate job | ✓ VERIFIED | 162 lines; valid structure; `parallel-e2e` matrix job (`[git, jj-colocated]`, inverted polarity); `parallel-e2e-gate` (`needs:`, `if: always()`, aggregate inspection); CI-06 audit step; SHA pins byte-identical to test.yml (`de0fac2e…`, `53b83947…`); CI-03 header; namespaced concurrency; no `pull_request_target` / write `permissions:`. |
| `.planning/phases/13-…/13-LINT05-ALLOWLIST-DIFF.md` | LINT-05 bookkeeping doc | ✓ VERIFIED | Records 24-entry count, `sdk/src/vcs/git/parallel.ts` entry with verbatim reason, +1 net diff attributed to Phase 10, 23-production-entries-unchanged statement. Matches the live allowlist. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `parallel-e2e.yml parallel-e2e job` | `scripts/e2e-parallel-phase.sh` | `run: bash scripts/e2e-parallel-phase.sh` with `GSD_E2E_BACKEND` per cell | ✓ WIRED | Line 119; `env.GSD_E2E_BACKEND: ${{ matrix.backend }}`, `env.GSD_SDK: node $GITHUB_WORKSPACE/sdk/dist/cli.js`. |
| `parallel-e2e.yml parallel-e2e-gate job` | `needs.parallel-e2e.result` | `if: always()` + aggregate-result inspection | ✓ WIRED | Lines 138/143/148/157 — `MATRIX_RESULT` env from `needs.parallel-e2e.result`, `exit 1` when `!= success`. |
| `parallel-e2e.yml parallel-e2e job` | `scripts/audit-workflow-raw-git.cjs` | CI-06 `run: node scripts/audit-workflow-raw-git.cjs` | ✓ WIRED | Line 127, step "Audit — raw git in workflow markdown (CI-06)". |
| `e2e-parallel-phase.sh` | `workspace.parallel.{dispatch,fan-in}` CLI bridges | `$GSD_SDK query workspace.parallel.*` | ✓ WIRED | Lines 181, 270; verbs registered in SDK command manifest/catalog; harness ran green E2E both backends per 13-03-SUMMARY. |
| `e2e-parallel-phase.sh` | `.githooks/pre-commit` sentinel | `gsd-sdk query commit` → `vcs.commit()` fires the hook | ✓ WIRED | Sentinel installed lines 126-132; commit via `$GSD_SDK query commit` lines 236-240; SC5 assertion lines 346-351. |
| `scripts/audit-workflow-raw-git.cjs` | `tests/scripts/audit-workflow-raw-git.test.cjs` | required by the project test runner | ✗ NOT_WIRED | `run-tests.cjs` non-recursive `readdirSync('tests')` never reaches `tests/scripts/`; no CI workflow references it. This is the failed link behind Truth 6. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `audit-workflow-raw-git.cjs` | `result` (`ok`, `totalCurrent`, `regressions`) | `auditWorkflowRawGit` — real `fs.readdirSync`/`readFileSync` walk of 198 `.md` files under the 3 scan roots | Yes — live run yields `totalCurrent=127`, `scannedFiles=198`, real per-file counts | ✓ FLOWING |
| `e2e-parallel-phase.sh` | `HANDLE_JSON`, `FAN_RESULT` | live `gsd-sdk query workspace.parallel.{dispatch,fan-in}` subprocesses against a real throwaway repo | Yes — 13-03-SUMMARY records real Handle (`workspaces=2`), real FanInResult (git `merged=2`, jj `merged=1`) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Audit exits 0 against live tree (within baseline) | `node scripts/audit-workflow-raw-git.cjs` | exit 0 | ✓ PASS |
| Audit `--json` emits valid JSON with `ok`/`regressions` | `node …cjs --json \| parse` | `ok=true totalCurrent=127 regressions=0 scannedFiles=198` | ✓ PASS |
| Audit fires non-zero on a real regression | synthetic baseline-absent tree, 2 hits | `ok=false regressions=1` | ✓ PASS |
| Audit exports 5 pure functions + BASELINE | `require()` + typeof checks | all present; BASELINE sums 127/30 keys | ✓ PASS |
| Audit unit test passes (run directly) | `node --test tests/scripts/audit-workflow-raw-git.test.cjs` | `tests 7 / pass 7 / fail 0`, exit 0 | ✓ PASS |
| Audit unit test runs via the project runner | simulate `run-tests.cjs` discovery | 506 files, audit test NOT among them | ✗ FAIL |
| Harness syntax valid | `bash -n scripts/e2e-parallel-phase.sh` | clean | ✓ PASS |
| Harness is raw-git-clean | `node scripts/lint-vcs-no-raw-git.cjs` + grep `e2e-parallel-phase` | exit 0; 0 matches | ✓ PASS |
| `SHELL_GIT_RE` byte-identical to production lint | regex compare vs `lint-vcs-no-raw-git.cjs:87` | identical (`/(?:^|[ \t;&\|(])git[ \t]+[a-zA-Z]/`) | ✓ PASS |
| Allowlist at 24 entries, git/parallel.ts present | `require()` of allow.json | 24 entries; entry present | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| (none) | — | No `scripts/*/tests/probe-*.sh` exist; no probe declared in any 13-* PLAN/SUMMARY | SKIPPED — no probes in scope |

### Requirements Coverage

All four phase requirement IDs cross-referenced against `.planning/REQUIREMENTS.md`. No orphaned requirements — REQUIREMENTS.md maps exactly CI-05, CI-06, LINT-04, LINT-05 to Phase 13 (line 151), and all four appear in PLAN frontmatter.

| Requirement | Source Plan(s) | Description | Status | Evidence |
| ----------- | -------------- | ----------- | ------ | -------- |
| CI-05 | 13-03, 13-04 | New `parallel-e2e` CI matrix lane runs a synthetic 2-plan phase E2E on both backends; required-blocking on jj-colocated | ✓ SATISFIED | Truths 1 + 5; `parallel-e2e.yml` matrix job + gate job; `e2e-parallel-phase.sh` harness ran green both backends. |
| CI-06 | 13-01, 13-04 | `parallel-e2e` lane runs the LINT-04 audit and fails if the baseline / no-regression invariant breaks | ✓ SATISFIED | Truths 2 + 3; CI-06 audit step at `parallel-e2e.yml:127`; audit `process.exit(result.ok ? 0 : 1)`. |
| LINT-04 | 13-01, 13-02 | Ship `scripts/audit-workflow-raw-git.cjs` scanning `.md` shell fences for raw git; one-shot, not in CI pretest | ⚠️ PARTIALLY SATISFIED | Audit script itself fully delivered and correct (Truth 2); NOT in `npm pretest` (confirmed — pretest unchanged). BUT its backing unit test is collected by no runner (Truth 6 FAILED) — the regression guard for the LINT-04 deliverable does not execute. |
| LINT-05 | 13-04 | `lint-vcs-no-raw-git.allow.json` net change +0 or +1; 23 production entries untouched; diff recorded | ✓ SATISFIED | Truth 4; allowlist at 24 entries (+1, Phase 10); `13-LINT05-ALLOWLIST-DIFF.md` records the diff. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `tests/scripts/audit-workflow-raw-git.test.cjs` | 1 (root cause `scripts/run-tests.cjs:12`) | Dead verification artifact — test collected by no runner | 🛑 Blocker | The CI-06 gate's regression test never executes; a future edit breaking fence detection ships green. This is REVIEW.md CR-01 (Critical), confirmed by direct discovery simulation. Drives the Truth 6 / LINT-04 gap. |
| `scripts/e2e-parallel-phase.sh` | 219 | Dead code — `WORKSPACE_PATHS` assigned, never referenced | ℹ️ Info | Harmless; the per-workspace loop re-derives path/agentId from `$HANDLE_JSON`. REVIEW.md WR-02. Misread hazard only; no functional impact. |
| `scripts/e2e-parallel-phase.sh` | 144-145 | `jj config set … \|\| true` swallows non-zero exit | ℹ️ Info | REVIEW.md WR-03. Robustness gap; on the jj cell a missing identity would surface as a misleading "seed squash failed" later. Not goal-blocking — harness ran green. |
| `scripts/audit-workflow-raw-git.cjs` | 169-175 | `parseArgv` silently ignores unknown flags | ℹ️ Info | REVIEW.md WR-04. A `--jsno` typo silently yields markdown output. Not goal-blocking — CI invokes the audit with no flags (`parallel-e2e.yml:127`). |
| `scripts/audit-workflow-raw-git.cjs` | 48-49,119-128 | Single-boolean `inFence` mis-parses a `bash` fence nested in a non-shell fence; delimiter type not matched | ℹ️ Info | REVIEW.md WR-01. Latent — baseline matches 127/127 exactly today; a future docs edit adding a nested fence example could produce a spurious CI-06 fail or mask one. Not goal-blocking now; recommend fix when CR-01 is addressed. |

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` debt markers in any Phase 13 file (the apparent `mktemp XXXXXX` and `check-todos.md` grep hits are false positives — a template literal and a baseline filename).

### Human Verification Required

None. The phase produces a CI workflow and runnable scripts; the harness was exercised green E2E on both backends during execution (13-03-SUMMARY), the audit and its test are runnable and were verified here, and the gate-job aggregate semantics were confirmed by reasoned analysis (13-04-SUMMARY A2). The one ship-time follow-up — registering `parallel-e2e-gate` as a required branch-protection check — is GitHub config outside the repo, correctly flagged for the user in 13-04-SUMMARY's "User Setup Required"; it is not a code-verification item and does not block phase completion.

### Gaps Summary

**The phase goal is substantially achieved but one blocker prevents a clean pass.**

Both halves of the goal are delivered: (1) `parallel-e2e.yml` is a complete, well-formed CI lane running the synthetic 2-plan parallel phase E2E on both backends, with a `parallel-e2e-gate` job that correctly enforces required-blocking on jj-colocated; (2) `audit-workflow-raw-git.cjs` is a correct one-shot baseline-regression guard, wired as a CI-06 step and explicitly kept out of `npm pretest`. SC1-SC5 all verify, all four requirement IDs are accounted for, and the orchestrator's mis-attribution warnings (the regression-guard re-baseline, the 94 pre-existing test failures, the +4 skip regression) hold up — none of those are Phase-13 defects.

**The blocker (CR-01, confirmed):** The LINT-04 audit's unit test — `tests/scripts/audit-workflow-raw-git.test.cjs` — is a substantive, correct 7-case test that passes when run directly (`node --test` → exit 0), but it is collected by no test runner. `scripts/run-tests.cjs` line 12 does a non-recursive `readdirSync('tests')` followed by `.map(f => join('tests', f))`, so it only ever passes `tests/*.test.cjs` to `node --test`. The new test lives one directory deeper in `tests/scripts/`. Direct simulation confirms: `npm test` discovers 506 files, none of them this test; a recursive scan would find 510 (the 4 stranded `tests/scripts/*` files). No GitHub Actions workflow references `tests/scripts` either.

The consequence is concrete: the audit is documented and shipped as the CI-06 milestone-completeness regression guard, but its own regression test runs nowhere. A future edit that breaks the fence parser or the per-file comparison would ship green. CONTEXT.md D-07 and REQUIREMENTS.md LINT-04 both frame the audit as getting a working unit test "via the existing `node scripts/run-tests.cjs` runner" — the test exists and is well-written, but as wired it provides zero regression protection. This is a one-line-fix gap (`{ recursive: true }` on the `readdirSync`, or relocate the file), not a redesign — and the fix also rescues 3 other pre-existing stranded test files.

This is not pre-existing branch debt that Phase 13 inherited innocently: Phase 13 *created* `tests/scripts/audit-workflow-raw-git.test.cjs` and chose to place it where the runner cannot see it. That the phase faithfully copied a pre-existing dead-test location pattern (`tests/scripts/migr-06-close-gate.test.cjs`, also never run) does not make the new test live — it propagates a broken pattern as the phase's own verification artifact.

**Recommended closure (one of):**
- Make `scripts/run-tests.cjs` recurse: `readdirSync(testDir, { recursive: true })` then `.map(f => join('tests', f))` — rescues all 4 stranded `tests/scripts/*` files at once.
- Or relocate to `tests/audit-workflow-raw-git.test.cjs` (flat) and fix the in-file `require()` from `../../scripts/` to `../scripts/`.
- Plus: wire the audit and its test into a CI lane so the CI-06 gate's backing test executes on every build.

The four `ℹ️ Info` anti-patterns (WR-01..WR-04 from REVIEW.md) are robustness/hygiene gaps, not goal blockers — none of them prevents the lane, the harness, or the audit from functioning, and the harness was verified green E2E on both backends. They are worth addressing alongside the CR-01 fix but do not, by themselves, fail the phase.

---

## Gap Closure — 2026-05-24

Truth 6 (the single failing must-have) was closed inline during v1.3 pre-milestone-close hygiene by applying the first recommended path above.

**Fix:** `scripts/run-tests.cjs:12` now does `readdirSync(testDir, { recursive: true })` so the runner collects nested `tests/<subdir>/*.test.cjs` files.

**Effect:** `npm test` discovery jumped from 506 → 510 files. The 4 newly-collected tests are:

- `tests/scripts/audit-workflow-raw-git.test.cjs` — Phase 13's CI-06 regression guard (7 cases, all pass)
- `tests/scripts/allowlist-parser.test.cjs` — pre-existing stranded test
- `tests/scripts/audit-id-namespace.test.cjs` — pre-existing stranded test
- `tests/scripts/migr-06-close-gate.test.cjs` — pre-existing stranded test from v1.2's MIGR-06 close-gate (the dead-test pattern Phase 13 propagated)

**Verification of fix:** `node --test tests/scripts/*.test.cjs` → 29/29 pass, 881ms. The 4 tests now run on every `npm test` invocation and on the GitHub Actions test matrix.

**Frontmatter updated:** `status: gaps_found` → `status: passed`, `score: 4/5` → `score: 5/5`, the gap's `status: failed` → `status: resolved` (with `resolution:` and `original_reason:` fields preserved for audit trail). The body sections above are kept verbatim as the historical record of how the gap was discovered.

The four `ℹ️ Info` anti-patterns from REVIEW.md (WR-01..WR-04) remain as documented and are not in scope for this closure — they were not goal blockers and are listed for separate triage as v1.4 work if warranted.

---

_Verified: 2026-05-22_
_Re-verified: 2026-05-24 (gap closure)_
_Verifier: Claude (gsd-verifier)_
