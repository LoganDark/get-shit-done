---
phase: 13
slug: ci-parallel-path-lane-lint-close-gate
status: approved
nyquist_compliant: partial
wave_0_complete: true
created: 2026-05-22
audited: 2026-05-22
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (audit unit test)** | `node:test` + `node:assert/strict` (matches `tests/scripts/migr-06-close-gate.test.cjs`) |
| **Framework (E2E lane)** | Shell harness `scripts/e2e-parallel-phase.sh` — assertions are `jq`-on-JSON + exit codes (NOT vitest, per CONTEXT.md D-01) |
| **Config file** | None new — `tests/scripts/*.test.cjs` runs via the existing `node scripts/run-tests.cjs` runner |
| **Quick run command** | `node --test tests/scripts/audit-workflow-raw-git.test.cjs` |
| **Full suite command** | `npm test` ⚠️ does NOT discover `tests/scripts/*.test.cjs` — `scripts/run-tests.cjs:12` does non-recursive `readdirSync('tests')`; the audit unit test (and 3 pre-existing tests) are orphaned. See **Manual-Only #2**. Until fixed, the audit test must be run directly via `node --test tests/scripts/audit-workflow-raw-git.test.cjs`. The E2E harness `bash scripts/e2e-parallel-phase.sh` is run by CI. |
| **Estimated runtime** | audit unit test ~sub-second (direct invocation); E2E harness ~minutes per backend cell (CI-only) |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/scripts/audit-workflow-raw-git.test.cjs` (audit unit test — sub-second). ⚠️ Must be invoked directly; `npm test` does NOT pick it up — see Manual-Only #2.
- **After every plan wave:** Run **both** `npm test` AND `node --test tests/scripts/audit-workflow-raw-git.test.cjs`. The audit test is NOT in `npm test`'s discovery set; the audit must be exercised by an explicit second command until the runner is made recursive.
- **Before `/gsd:verify-work`:** The `parallel-e2e` lane green on both backends + `parallel-e2e-gate` green. The E2E lane is the load-bearing signal — it is the *only* test layer that exercises the CLI-bridge + `jq`-pipeline surface (TEST-13 cannot; D-01 rationale).
- **Max feedback latency:** sub-second for the audit unit test per task commit (when invoked directly); the E2E lane runs in CI per push/PR.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | LINT-04 / CI-06 | T-13-01 | No stale/contradictory success criterion misdirects downstream executors | static (awk + grep) | `awk '/^### Phase 13:/,/^### Phase 14:/' .planning/ROADMAP.md \| sed -n '/Success Criteria/,$p' \| grep -ci 'zero' \| grep -qx 0` (narrowed to the Success Criteria block; the previous `-A8` form caught the Goal line's intentionally-retained "collapses to zero" milestone framing — see 13-01-SUMMARY §Deviations #1) | ✅ existing | ⚠️ flaky |
| 13-01-02 | 01 | 1 | LINT-04 / CI-06 | T-13-01 / T-13-02 | Re-framed close-commit evidence is accurate; no stale zero-hits claim survives | static (grep) | `grep -rniE 'zero[ -]?hits\|reports zero\|proving zero\|with zero\|zero raw' .planning/ROADMAP.md .planning/REQUIREMENTS.md .planning/phases/13-ci-parallel-path-lane-lint-close-gate/13-CONTEXT.md` (must return nothing) | ✅ existing | ✅ green |
| 13-02-01 | 02 | 1 | LINT-04 | T-13-03 / T-13-04 / T-13-06 | Audit is read-only — never `eval`/`exec*`/`spawnSync` on scanned content; symlink-containment posture | unit + static | `node scripts/audit-workflow-raw-git.cjs; test $? -eq 0` and `grep -nE 'writeFile\|appendFile\|createWriteStream\|exec(Sync\|FileSync)\|spawnSync' scripts/audit-workflow-raw-git.cjs` (must return nothing) | ✅ shipped (`audit-workflow-raw-git.cjs`) | ✅ green |
| 13-02-02 | 02 | 1 | LINT-04 | T-13-05 / T-13-06 | Per-file baseline detects a regression even if the global total is unchanged; comparison proven against synthetic baselines | unit | `node --test tests/scripts/audit-workflow-raw-git.test.cjs` (7/7 pass) — `node scripts/check-skip-count.cjs` is DEFERRED (+4 pre-existing skip debt from Phase 10/11 SDK files, not Phase 13; see `deferred-items.md` and 13-02-SUMMARY §Deferred Issues) | ✅ shipped (`audit-workflow-raw-git.test.cjs`) | ⚠️ flaky |
| 13-03-01 | 03 | 1 | CI-05 | T-13-08 / T-13-09 | `mkdtemp` repo created outside `$GITHUB_WORKSPACE` with EXIT-trap cleanup; no raw `git` in the harness | static (shell-lint + bash -n) | `bash -n scripts/e2e-parallel-phase.sh` and `node scripts/lint-vcs-no-raw-git.cjs 2>&1 \| grep -E 'e2e-parallel-phase'` (must NOT match) | ✅ shipped (`e2e-parallel-phase.sh`) | ✅ green |
| 13-03-02 | 03 | 1 | CI-05 | T-13-09 / T-13-10 | Fan-in uses the `mktemp` Handle-file dance (no double-stdin); commit routes through `gsd-sdk query commit`, no `eval` of subprocess output | static (shell-lint + bash -n) | `bash -n scripts/e2e-parallel-phase.sh` and `grep -q 'handle_and_results_cannot_both_be_stdin\|@\$HANDLE_FILE\|@"\$HANDLE_FILE"' scripts/e2e-parallel-phase.sh` | ✅ shipped (`e2e-parallel-phase.sh`) | ✅ green |
| 13-04-01 | 04 | 2 | CI-05 / CI-06 | T-13-11 / T-13-12 | No `pull_request_target`, no write `permissions:`; action SHAs pinned verbatim from `test.yml` | static (grep + YAML load) | `grep -qE 'pull_request_target\|permissions:\s*$\|contents:\s*write' .github/workflows/parallel-e2e.yml` (must NOT match) and `grep -q 'actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd' .github/workflows/parallel-e2e.yml` | ✅ shipped (`parallel-e2e.yml`) | ✅ green |
| 13-04-02 | 04 | 2 | CI-05 / CI-06 / LINT-05 | T-13-13 / T-13-14 / T-13-15 | `parallel-e2e-gate` blocking job enforces "jj-colocated cell passed"; allowlist byte-unchanged at 24 entries | static (grep + lint + JSON load) | `grep -q 'needs.parallel-e2e.result' .github/workflows/parallel-e2e.yml`, `node scripts/lint-vcs-no-raw-git.cjs`, `node -e 'const a=require("./scripts/lint-vcs-no-raw-git.allow.json");if((a.entries\|\|[]).length!==24)process.exit(1)'` | ✅ shipped (`parallel-e2e.yml`) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Wave 0 file → automated command trace

The four new Wave-0 files (RESEARCH.md §"Validation Architecture" → "Wave 0 Gaps") each trace to an automated verification command:

| Wave 0 File | Created By | Automated Command |
|-------------|------------|-------------------|
| `scripts/audit-workflow-raw-git.cjs` | Task 13-02-01 | `node scripts/audit-workflow-raw-git.cjs; test $? -eq 0` |
| `tests/scripts/audit-workflow-raw-git.test.cjs` | Task 13-02-02 | `node --test tests/scripts/audit-workflow-raw-git.test.cjs` |
| `scripts/e2e-parallel-phase.sh` | Task 13-03-01 / 13-03-02 | `bash -n scripts/e2e-parallel-phase.sh` + `node scripts/lint-vcs-no-raw-git.cjs` (must not flag the harness) |
| `.github/workflows/parallel-e2e.yml` | Task 13-04-01 / 13-04-02 | `grep -q 'parallel-e2e-gate:' .github/workflows/parallel-e2e.yml` + `grep -q 'needs.parallel-e2e.result' .github/workflows/parallel-e2e.yml` |

The sentinel `.githooks/pre-commit` install routine (SC5) is created inside `scripts/e2e-parallel-phase.sh` during Task 13-03-01 and verified by `grep -n 'githooks/pre-commit' scripts/e2e-parallel-phase.sh`; its end-to-end fire is asserted by the harness itself when run on the jj-colocated cell.

---

## Wave 0 Requirements

- [x] `scripts/audit-workflow-raw-git.cjs` — the LINT-04 raw-git baseline-regression-guard scanner (shipped; exits 0 against live tree, 127/30 frozen).
- [x] `tests/scripts/audit-workflow-raw-git.test.cjs` — audit unit test (shipped; 7/7 pass via direct `node --test`). ⚠️ Orphaned from `npm test` discovery — see Manual-Only #2.
- [x] `scripts/e2e-parallel-phase.sh` — the E2E parallel-dispatch harness (shipped; 357 lines; verified green on both backends per 13-03-SUMMARY).
- [x] `.github/workflows/parallel-e2e.yml` — the CI lane + `parallel-e2e-gate` job (shipped; SHA pins verbatim from `test.yml`).
- [x] A sentinel `.githooks/pre-commit` install routine inside the harness (lines 126-132; fired 2× during the jj-colocated parallel-dispatched run).
- Framework install: none — `node:test` is built in; no new npm dependency.

---

## Manual-Only Verifications

| # | Behavior | Requirement | Why Manual | Test Instructions |
|---|----------|-------------|------------|-------------------|
| 1 | `parallel-e2e-gate` registered as a required branch-protection check | CI-05 / D-04 | Branch-protection config lives in GitHub repo settings, outside the repo — Phase 13 cannot set it | At ship time, add the `parallel-e2e-gate` job name to GitHub branch-protection required checks for `main` (flagged in 13-04-SUMMARY). |
| 2 | `tests/scripts/audit-workflow-raw-git.test.cjs` exercised by `npm test` / CI on every change | LINT-04 / CI-06 (backing test) | The test file exists and passes 7/7 when invoked directly, but `scripts/run-tests.cjs:12` does non-recursive `readdirSync('tests')` so the file (along with 3 pre-existing `tests/scripts/*.test.cjs`) is not collected. No CI workflow currently invokes `tests/scripts/`. Fixing this is a `scripts/run-tests.cjs` impl change outside the validate-phase auditor's "never modify impl files" charter. **Until fixed, a future edit that breaks fence detection ships green via `npm test`.** | Manual command per task commit (sub-second): `node --test tests/scripts/audit-workflow-raw-git.test.cjs`. **Recommended one-line fix (deferred):** change `readdirSync(testDir)` to `readdirSync(testDir, { recursive: true })` in `scripts/run-tests.cjs:12` — rescues all 4 orphaned tests at once. Alternative: relocate to `tests/audit-workflow-raw-git.test.cjs` (flat) and fix the in-file `require()` from `../../scripts/` to `../scripts/`. Tracking: `13-VERIFICATION.md` Truth 6 (CR-01 blocker, gaps_found). |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 files all shipped (4/4 — see status above)
- [x] No watch-mode flags
- [x] Feedback latency < 1s for the audit unit test per task commit *(when invoked directly; the `npm test` wrapper does not pick it up — see Manual-Only #2)*
- [x] `nyquist_compliant: partial` set in frontmatter (audit-test orphaning recorded as Manual-Only #2)

**Approval:** approved 2026-05-22 · re-audited 2026-05-22

---

## Validation Audit 2026-05-22

| Metric | Count |
|--------|-------|
| Gaps found | 1 |
| Resolved | 0 |
| Escalated to Manual-Only | 1 |

**Gap detail:** `tests/scripts/audit-workflow-raw-git.test.cjs` (the LINT-04 / CI-06 backing test) exists and passes 7/7 when invoked directly via `node --test`, but is NOT collected by the project's `npm test` runner because `scripts/run-tests.cjs:12` uses non-recursive `readdirSync('tests')`. The audit's regression-guard test runs nowhere automatically — a future edit breaking fence detection or the per-file comparison would ship green via `npm test`. Three pre-existing `tests/scripts/*.test.cjs` files (`allowlist-parser`, `audit-id-namespace`, `migr-06-close-gate`) are orphaned the same way.

**Why escalated, not resolved:** the fix is a one-line change to `scripts/run-tests.cjs` (an impl/script file). The `gsd-nyquist-auditor` agent's charter forbids modifying impl files — its role is to generate missing tests, not to fix runner wiring. The test itself already exists and is correct; nothing for the auditor to generate. Recorded in **Manual-Only #2** with the recommended one-line fix that rescues all 4 orphans at once.

**Per-task verification reruns (2026-05-22):**
- 13-01-01: ⚠️ flaky — original `grep -A8` window caught the Phase 13 Goal line's intentionally-retained "collapses to zero" milestone framing (13-01-SUMMARY §Deviations #1). Verify command narrowed to the Success Criteria block (per-line SC2/SC3 are clean).
- 13-01-02: ✅ green
- 13-02-01: ✅ green (audit exits 0; no writes/exec)
- 13-02-02: ⚠️ flaky — `node --test` passes 7/7; `check-skip-count.cjs` exits 1 due to +4 pre-existing skip debt from Phase 10/11 SDK files (formally deferred in `deferred-items.md` and 13-02-SUMMARY)
- 13-03-01, 13-03-02: ✅ green (bash -n clean; lint not flagged; handle-file dance present)
- 13-04-01, 13-04-02: ✅ green (no elevated trigger/perms; SHA pins verbatim; gate job present; full-repo lint clean; allowlist 24 entries)

**Cross-reference:** This audit's findings agree with `13-VERIFICATION.md` (Truth 6 / CR-01) and `13-REVIEW.md` (CR-01 Critical). No new gaps surfaced.
