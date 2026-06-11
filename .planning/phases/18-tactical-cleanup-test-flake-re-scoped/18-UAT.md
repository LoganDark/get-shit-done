---
status: complete
phase: 18-tactical-cleanup-test-flake-re-scoped
source: 18-01-SUMMARY.md, 18-02-SUMMARY.md, 18-03-SUMMARY.md
started: 2026-06-11T04:29:52Z
updated: 2026-06-11T04:48:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Dispatch rejects non-array plan (fail-closed)
expected: Invoking `workspace.parallel.dispatch` with a JSON-object/string/number/null plan (e.g. `--plan '{}'`) returns `{ok:false, reason:"plan_not_array"}` before any adapter is created — no workspaces, no jj/git side effects.
result: pass

### 2. Dispatch rejects invalid --max-concurrency (fail-closed)
expected: Invoking `workspace.parallel.dispatch` with a non-numeric `--max-concurrency` value (e.g. `banana`) returns `{ok:false, reason:"max_concurrency_invalid"}` before any adapter is created. Omitting the flag entirely still works (absent flag forwards undefined per D-07).
result: pass

### 3. dogfood-restore.sh refuses to run outside project root
expected: Running `scripts/dogfood-restore.sh <args>` from a directory without `.planning/STATE.md` (e.g. /tmp) exits 1 with `FATAL: dogfood-restore.sh must run from project root` before touching any files — the root assertion fires, not the later tarball-not-found FATAL. (SUMMARY quoted the prefix as `ERROR:`; shipped code says `FATAL:` — docs imprecision only.)
result: pass

### 4. CONFIG-02 tests leave zero tmp-dir litter
expected: Running the cmd-parallel-jj and cmd-parallel-git test files leaves zero `gsd-cfg02-*` directories in TMPDIR afterward (was 6 leaked per run). All tests in both files still pass (27/27).
result: pass

### 5. Transition gate fails closed on dirty working copy
expected: The assert_clean_wc gate in gsd-core/workflows/transition.md (placed before offer_next_phase) exits 1 with a FATAL "working copy is dirty before transition completion" message listing the dirty files when the WC has uncommitted changes, and passes silently (exit 0) on a clean WC. All 5 mutating transition steps now have adjacent `gsd_run query commit` fences.
result: pass
note: structural greps verified live (5 commit fences, 1 gate step, 2 tolerant config-set commits); behavioral evidence from the 18-01 colocated-jj fixture transcripts (dirty WC exit 1 FATAL, clean WC exit 0).

### 6. jj-reap inclusion-filter flake does not reproduce (TEST-17)
expected: Running the Phase 14 regression-gate shape (jj-reap + cmd-parallel-jj + cmd-parallel-git test files) passes with the inclusion-filter test completing in well under a second (~400-500ms), nowhere near any timeout. No source/test/config files were modified for this — vitest.config.ts is byte-identical.
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
