---
phase: 13
slug: ci-parallel-path-lane-lint-close-gate
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-22
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
| **Full suite command** | `npm test` (covers the audit unit test); `bash scripts/e2e-parallel-phase.sh` (the E2E lane, run by CI) |
| **Estimated runtime** | audit unit test ~sub-second; E2E harness ~minutes per backend cell (CI-only) |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/scripts/audit-workflow-raw-git.test.cjs` (audit unit test — sub-second).
- **After every plan wave:** Run `npm test` (full suite including the new audit test).
- **Before `/gsd:verify-work`:** The `parallel-e2e` lane green on both backends + `parallel-e2e-gate` green. The E2E lane is the load-bearing signal — it is the *only* test layer that exercises the CLI-bridge + `jq`-pipeline surface (TEST-13 cannot; D-01 rationale).
- **Max feedback latency:** sub-second for the audit unit test per task commit; the E2E lane runs in CI per push/PR.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | LINT-04 / CI-06 | T-13-01 | No stale/contradictory success criterion misdirects downstream executors | static (grep) | `grep -nA8 '^### Phase 13:' .planning/ROADMAP.md \| grep -v '^#' \| grep -ci 'zero' \| grep -qx 0` | ✅ existing | ⬜ pending |
| 13-01-02 | 01 | 1 | LINT-04 / CI-06 | T-13-01 / T-13-02 | Re-framed close-commit evidence is accurate; no stale zero-hits claim survives | static (grep) | `grep -rniE 'zero[ -]?hits\|reports zero\|proving zero\|with zero\|zero raw' .planning/ROADMAP.md .planning/REQUIREMENTS.md .planning/phases/13-ci-parallel-path-lane-lint-close-gate/13-CONTEXT.md` (must return nothing) | ✅ existing | ⬜ pending |
| 13-02-01 | 02 | 1 | LINT-04 | T-13-03 / T-13-04 / T-13-06 | Audit is read-only — never `eval`/`exec*`/`spawnSync` on scanned content; symlink-containment posture | unit + static | `node scripts/audit-workflow-raw-git.cjs; test $? -eq 0` and `grep -nE 'writeFile\|appendFile\|createWriteStream\|exec(Sync\|FileSync)\|spawnSync' scripts/audit-workflow-raw-git.cjs` (must return nothing) | ❌ W0 (`audit-workflow-raw-git.cjs`) | ⬜ pending |
| 13-02-02 | 02 | 1 | LINT-04 | T-13-05 / T-13-06 | Per-file baseline detects a regression even if the global total is unchanged; comparison proven against synthetic baselines | unit | `node --test tests/scripts/audit-workflow-raw-git.test.cjs` and `node scripts/check-skip-count.cjs` | ❌ W0 (`audit-workflow-raw-git.test.cjs`) | ⬜ pending |
| 13-03-01 | 03 | 1 | CI-05 | T-13-08 / T-13-09 | `mkdtemp` repo created outside `$GITHUB_WORKSPACE` with EXIT-trap cleanup; no raw `git` in the harness | static (shell-lint + bash -n) | `bash -n scripts/e2e-parallel-phase.sh` and `node scripts/lint-vcs-no-raw-git.cjs 2>&1 \| grep -E 'e2e-parallel-phase'` (must NOT match) | ❌ W0 (`e2e-parallel-phase.sh`) | ⬜ pending |
| 13-03-02 | 03 | 1 | CI-05 | T-13-09 / T-13-10 | Fan-in uses the `mktemp` Handle-file dance (no double-stdin); commit routes through `gsd-sdk query commit`, no `eval` of subprocess output | static (shell-lint + bash -n) | `bash -n scripts/e2e-parallel-phase.sh` and `grep -q 'handle_and_results_cannot_both_be_stdin\|@\$HANDLE_FILE\|@"\$HANDLE_FILE"' scripts/e2e-parallel-phase.sh` | ❌ W0 (`e2e-parallel-phase.sh`) | ⬜ pending |
| 13-04-01 | 04 | 2 | CI-05 / CI-06 | T-13-11 / T-13-12 | No `pull_request_target`, no write `permissions:`; action SHAs pinned verbatim from `test.yml` | static (grep + YAML load) | `grep -qE 'pull_request_target\|permissions:\s*$\|contents:\s*write' .github/workflows/parallel-e2e.yml` (must NOT match) and `grep -q 'actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd' .github/workflows/parallel-e2e.yml` | ❌ W0 (`parallel-e2e.yml`) | ⬜ pending |
| 13-04-02 | 04 | 2 | CI-05 / CI-06 / LINT-05 | T-13-13 / T-13-14 / T-13-15 | `parallel-e2e-gate` blocking job enforces "jj-colocated cell passed"; allowlist byte-unchanged at 24 entries | static (grep + lint + JSON load) | `grep -q 'needs.parallel-e2e.result' .github/workflows/parallel-e2e.yml`, `node scripts/lint-vcs-no-raw-git.cjs`, `node -e 'const a=require("./scripts/lint-vcs-no-raw-git.allow.json");if((a.entries\|\|[]).length!==24)process.exit(1)'` | ❌ W0 (`parallel-e2e.yml`) | ⬜ pending |

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

- [ ] `scripts/audit-workflow-raw-git.cjs` — the LINT-04 raw-git baseline-regression-guard scanner (new file; Open Q1 resolved — baseline-regression guard, not zero-assertion).
- [ ] `tests/scripts/audit-workflow-raw-git.test.cjs` — audit unit test (new file, D-07).
- [ ] `scripts/e2e-parallel-phase.sh` — the E2E parallel-dispatch harness (new file, D-01).
- [ ] `.github/workflows/parallel-e2e.yml` — the CI lane + `parallel-e2e-gate` job (new file, D-03).
- [ ] A sentinel `.githooks/pre-commit` install routine inside the harness (for SC5).
- Framework install: none — `node:test` is built in; no new npm dependency.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `parallel-e2e-gate` registered as a required branch-protection check | CI-05 / D-04 | Branch-protection config lives in GitHub repo settings, outside the repo — Phase 13 cannot set it | At ship time, add the `parallel-e2e-gate` job name to GitHub branch-protection required checks for `main` (flagged in 13-04-SUMMARY). |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 1s for the audit unit test per task commit
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-22
