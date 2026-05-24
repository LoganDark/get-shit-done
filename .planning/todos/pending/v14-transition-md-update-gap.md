---
title: transition.md HIGH-RISK site — apply assert_clean_wc + commit-adjacency pattern
source: phase-14 quick-task 260523-ovw audit Task 1
created: 2026-05-24
priority: medium
cross_backend: false
resolves_phase: null
target_milestone: v1.4
---

## Summary

The Phase 14 quick-task (`.planning/quick/260523-ovw-investigate-how-that-happened-and-potent/`) audit identified `./get-shit-done/workflows/transition.md:166` as a HIGH-RISK site with the same "mutating verb followed by deferred or conditional commit" pattern that caused the Phase 14 false-clean-claim bug.

The quick-task fixed `execute-phase.md:update_roadmap` and added `assert_clean_wc` final-gates to both `execute-phase.md` and `plan-phase.md`. `transition.md` was deferred because:
1. The Phase 14 bug fired in `execute-phase.md` BEFORE `transition.md` could run (the `--no-transition` flag set during auto-chain)
2. `execute-phase.md`'s new `assert_clean_wc` gate transitively protects `transition.md`'s downstream surface when reached via auto-chain
3. Direct invocations of `transition.md` (outside an auto-chain) would still be exposed

This is a small follow-up to make the protection unconditional.

## Why deferred from Phase 14 quick-task

Quick tasks are intentionally narrow; the structural fix to two workflow files was the minimum-viable. `transition.md` direct invocations are rare in practice (transition is normally invoked via auto-chain), so the gap is low-frequency.

## Acceptance criteria for the fix

- [ ] Read `./get-shit-done/workflows/transition.md`. Locate the `state.*` / `roadmap.*` mutation around line 166 (or wherever it now sits)
- [ ] Apply the same two-pronged fix:
  - Reorder if the mutating verb's commit block is separated by prose
  - Add `assert_clean_wc` step immediately before any "TRANSITION COMPLETE" or similar terminal banner
- [ ] `node scripts/lint-vcs-no-raw-git.cjs` exits 0
- [ ] `grep -c "gsd-sdk query diff --name-only" ./get-shit-done/workflows/transition.md` ≥ 1

## References

- `.planning/quick/260523-ovw-investigate-how-that-happened-and-potent/SUMMARY.md` — audit table with the HIGH-RISK classification
- `./get-shit-done/workflows/execute-phase.md` and `./get-shit-done/workflows/plan-phase.md` — the `assert_clean_wc` pattern to copy from
