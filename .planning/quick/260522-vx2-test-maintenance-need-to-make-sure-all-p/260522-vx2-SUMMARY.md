---
quick_id: 260522-vx2
subsystem: test-infrastructure
tags: [test-maintenance, triage, probe-only]
status: complete
outcome: probe-only
created: 2026-05-23
---

# Quick Task 260522-vx2 — Test Maintenance (Probe-Only)

**`npm test` triaged: 94 outer-test fails across 9177 tests grouped into 4 buckets. No fix work performed this round — user opted to stop after probe.**

## What ran

- `npm test` → 9083 pass / 94 fail / 0 skipped / 0 todo. Full log captured at `/tmp/npm-test-13-quick.log`.
- All 4 orphan `tests/scripts/*.test.cjs` files invoked individually — all pass (9 + 12 + 7 + 1 = 29 tests, 100% pass).
- `node scripts/check-skip-count.cjs` → exit 1, +4 vs baseline (pre-existing branch debt).
- Workflow-markdown audit: `git worktree` ref count vs `workspace.parallel` / `gsd-sdk query` ref counts to confirm the jj-port migration is complete on the runtime side.
- Failing-test source-code reads for representative samples in each bucket.

## Buckets identified (full detail in `260522-vx2-TRIAGE.md`)

| Bucket | Description | Fail count | Quick-task scope? |
|--------|-------------|-----------|-------------------|
| A | Workflow-markdown drift inherited from upstream — tests grep for raw-git phrases (`worktree_branch_check`, `git reset --hard`, etc.) that the jj-port has correctly removed | ~70 | No — multi-phase strategic decision (delete legacy bug-regression tests vs migrate to typed-IR per upstream #2974) |
| B | Real regressions / drift — `vcs.commit/log` hash-undefined, INVENTORY.md parity, CONFIGURATION.md parity, changeset-renderer, code-review agent, prompt-injection length budget, surface-clusters, description-budget | ~24 | Subset is doc-only (30-60 min); adapter-hash subset is phase-sized |
| C | Orphan-test discoverability — `scripts/run-tests.cjs:12` non-recursive `readdirSync` orphans 4 `tests/scripts/*.test.cjs` files | 0 (all pass when invoked) | Yes — one-line fix; deferred to a separate quick task |
| D | Skip-count +4 vs baseline | pre-existing | No — documented as Phase 10/11 follow-up |

## Decision

User chose **"Stop here — commit triage doc only"**. No source code modified, no
tests modified, no `gsd-planner` / `gsd-executor` spawned. The triage doc
`260522-vx2-TRIAGE.md` is the deliverable — it gives any future quick-task or
phase enough context to pick up a specific bucket without re-running discovery.

## Files Created/Modified

- `.planning/quick/260522-vx2-test-maintenance-need-to-make-sure-all-p/260522-vx2-TRIAGE.md` — the bucketed failure analysis with sequencing recommendation
- `.planning/quick/260522-vx2-test-maintenance-need-to-make-sure-all-p/260522-vx2-SUMMARY.md` — this file
- `.planning/STATE.md` — Quick Tasks Completed row + Last activity line

## Next steps (owner: user, not enqueued)

If picking up later, the natural first step is **Bucket C** — the orphan-test
one-line fix in `scripts/run-tests.cjs` (`readdirSync(testDir, { recursive: true })`).
That closes the previous Phase 13 Manual-Only #2 in one commit. Suggested invocation:

```
/gsd-quick make scripts/run-tests.cjs recursive so tests/scripts/*.test.cjs are discovered by npm test
```

After C, the cheapest Bucket-B slice is doc regen (INVENTORY.md, CONFIGURATION.md,
surface-clusters, description-budget). The adapter-hash investigation is phase-sized
and should not be merged into a quick task.

## Self-Check: PASSED

- `260522-vx2-TRIAGE.md` — FOUND
- `260522-vx2-SUMMARY.md` — FOUND (this file)
- No code commits made this round (probe-only outcome — confirmed)

---
*Probe completed: 2026-05-23*
