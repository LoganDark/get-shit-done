# Phase 13 — Deferred Items

Out-of-scope discoveries logged during execution. Per the executor scope
boundary, issues not directly caused by the current plan's changes are recorded
here, not fixed.

## Pre-existing skip-count regression (discovered during plan 13-02)

`node scripts/check-skip-count.cjs` exits 1 on the Phase 13 branch: the current
working tree carries **22** skipped tests vs. the `origin/main` baseline of
**18** — a +4 regression.

This regression predates plan 13-02. Verified via `jj file show` against the
parent of plan 13-02's first commit (the RED-gate commit): the pre-13-02 branch
tip already had a skip count of 22. Plan 13-02's two new files
(`scripts/audit-workflow-raw-git.cjs`, `tests/scripts/audit-workflow-raw-git.test.cjs`)
add **zero** net skips — the audit test file is skip-free.

The +4 originates in files outside plan 13-02's scope:

| File | Skip count | Origin |
|------|------------|--------|
| `sdk/src/vcs/__tests__/cmd-parallel-max-concurrency-adapter.test.ts` | 2 | Phase 10/11 SDK work |
| `sdk/src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts` | 2 | Phase 10/11 SDK work |
| `tests/codex-config.test.cjs` | 2 | pre-existing (tracked at origin/main) |
| `tests/verify-test-quality.test.cjs` | 16 | pre-existing (tracked at origin/main) |

(`codex-config.test.cjs` and `verify-test-quality.test.cjs` are tracked at
origin/main — their skip counts are part of the baseline-18 and are not the
regression source. The two `cmd-*.test.ts` files are new on the branch and
account for the +4.)

**Disposition:** not fixed by plan 13-02 (scope boundary — the new `cmd-*`
skips belong to the Phase 10/11 plans that introduced those files). Flagged for
the Phase 13 verifier / a Phase 10/11 follow-up to resolve the +4 before the
v1.3 close gate, since TEST-16 mandates no skip-count regressions post-v1.3.
