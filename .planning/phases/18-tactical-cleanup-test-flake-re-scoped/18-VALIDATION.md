---
phase: 18
slug: tactical-cleanup-test-flake-re-scoped
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-10
approved: 2026-06-10
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.6 (`src/vcs/__tests__`, root `vitest.config.ts`, unit+integration projects) + node:test (`tests/`, via `scripts/run-tests.cjs`) |
| **Config file** | `vitest.config.ts` (LOCKED — must remain untouched per TEST-17) |
| **Quick run command** | `npx vitest run --project unit <file> [-t '<pattern>']` |
| **Full suite command** | `GSD_TEST_BACKENDS=git,jj npx vitest run` (~110s, 612 tests); `pnpm test` (node:test, runs `build:lib` via pretest) |
| **Estimated runtime** | ~110 seconds (vitest full) |

---

## Sampling Rate

- **After every task commit:** Run the targeted vitest file run (or grep/audit checks for the workflow-markdown plan)
- **After every plan wave:** Run `GSD_TEST_BACKENDS=git,jj npx vitest run` + the four lint gates
- **Before `/gsd-verify-work`:** Full vitest suite + `pnpm test` + all four lint gates + `scripts/check-skip-count.cjs` green
- **Max feedback latency:** ~110 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled by planner) | 01 | 1 | CLEANUP-01 | — | N/A | scripted fixture + grep | `grep -c 'gsd_run query status --porcelain' gsd-core/workflows/transition.md` ≥ 1 (supersedes the plan-time `diff --name-only` literal — Phase 18 REVIEW WR-01/WR-02 replaced the probe with fail-closed `status --porcelain`); ephemeral fixture-repo gate script exits 1 dirty / 0 clean (transcripts in 18-01 SUMMARY); `node scripts/audit-workflow-raw-git.cjs` exit 0 | ❌ W0 (ephemeral) | ✅ green |
| (filled by planner) | 02 | 1 | CLEANUP-05 | T-18-01 | non-array plan fails closed with `{ok:false, reason:'plan_not_array'}` | unit (vi.mock) | `npx vitest run --project unit src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts` | ✅ (landed in 18-02) | ✅ green |
| (filled by planner) | 02 | 1 | CLEANUP-06 | T-18-02 | invalid `--max-concurrency` fails closed (REVIEW WR-03 strengthened NaN-only to positive-integer); absent flag stays `undefined` (D-07) | unit (vi.mock) | same file; D-07 test stays green | ✅ (landed in 18-02) | ✅ green |
| (filled by planner) | 02 | 1 | CLEANUP-03 | T-18-03 | wrong-cwd run aborts before any mutation | manual-equivalent + node:test | with `REPO="$PWD"` captured pre-cd: `cd /tmp && bash "$REPO/scripts/dogfood-restore.sh" x y` → exit 1 + `FATAL: dogfood-restore.sh must run from project root` on stderr (label aligned ERROR→FATAL by REVIEW fix b133aa4a; root assertion precedes the tarball check); `node --test tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` green | ✅ | ✅ green |
| (filled by planner) | 02 | 1 | CLEANUP-04 | — | overlay semantics documented or made clean | review + existing test green | same as CLEANUP-03 | ✅ | ✅ green |
| (filled by planner) | 02 | 1 | CLEANUP-07 | — | N/A | targeted run + tmp inspect | run CONFIG-02 describes, then assert zero leaked tmpdirs | ✅ (edits to existing describes) | ✅ green |
| (filled by planner) | 03 | 1 | TEST-17 | — | N/A | 3+ full-suite runs | `GSD_TEST_BACKENDS=git,jj npx vitest run` ×3 — 618/618 ×3 recorded in 18-03 SUMMARY; `node scripts/check-skip-count.cjs` current=22 == documented fork baseline (script exits 1 vs origin/main=18 — pre-existing Phase 13 ledger item, zero skips added by this phase) | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] New contract `it`s in `src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts` — CLEANUP-05/06 envelope pins (written GREEN alongside the guards in the same per-WR commit; guard-addition, not TDD-RED) — scheduled inside plan 18-02 Task 1 (commits 1-2)
- [x] Ephemeral fixture-repo gate script for CLEANUP-01 SC1 verification (run-and-discard, stdout-only — never written into the working tree per `feedback_avoid_jj_auto_tracked_output`) — scheduled inside plan 18-01 Task 2 (step 3)

No standalone pre-execution Wave 0 exists for this phase: both items land inside Wave-1 plan tasks by design, hence `wave_0_complete: true` at plan sign-off.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CLEANUP-04 overlay-decision review (if option (b) documented-asymmetry chosen) | CLEANUP-04 | comment-only change has no behavior to assert | read the added comment block; confirm it states the additive-overlay asymmetry and why it is intended |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-10

---

## Validation Audit 2026-06-10

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All 7 requirements audited COVERED post-execution (fresh runs, this audit): contract-test file 15/15, CONFIG-02 6/6 with 0 leaked `gsd-cfg02-*` dirs, jj-reap 5/5 (inclusion-filter 434ms), dogfood-restore node:test 2/2 + wrong-cwd FATAL exit 1, `audit-workflow-raw-git` PASS (230 hits / 0 regressions), both VCS lints 0 violations. Two stale plan-time command literals in the map were superseded in place (CLEANUP-01 probe → `status --porcelain`; CLEANUP-03 label → `FATAL:`) — both supersessions originate from Phase 18 REVIEW fixes that strengthened the implementation. No test generation needed; no manual-only escalations beyond the pre-existing CLEANUP-04 review row (performed: comment block verified present at scripts/dogfood-restore.sh:83-91 during /gsd-secure-phase).
