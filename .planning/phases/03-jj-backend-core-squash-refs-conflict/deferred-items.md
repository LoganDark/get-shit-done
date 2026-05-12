# Phase 3 Deferred Items

Out-of-scope failures observed during Phase 3 execution. None are caused by
Phase 3 work; all are pre-existing or env-specific. Captured per executor
SCOPE BOUNDARY rule.

## Pre-existing test failures (12)

Baseline counted before any Task 5 changes:
`tests 8646 / pass 8624 / fail 12 / todo 3`.

After all 5 Task 5 edits:
`tests 8646 / pass 8631 / fail 12 / todo 3` (+7 passing from the
new jj-colocated lane in `tests/vcs-adapter-contract.test.cjs`; same 12
failing).

### Symptoms

1. `gpg failed to sign the data: No secret key` — multiple tests bootstrap
   git repos that inherit a global `commit.gpgsign true` from the user's
   `~/.gitconfig`. Fixture commits fail before Phase 3 work runs.
   - `bug-2838: SUMMARY rescue handles gitignored .planning/`
   - `execute-phase.md rescue block recovers SUMMARY when .planning/ is gitignored`
   - `quick.md rescue block recovers SUMMARY when .planning/ is gitignored`
   - `rescue is idempotent when SUMMARY already present in main repo`

2. `worktree-safety-policy.test.cjs` lane — unrelated assertion failures
   in `resolveWorktreeContext`, `planWorktreePrune`, `executeWorktreePrunePlan`,
   `listLinkedWorktreePaths`, `inspectWorktreeHealth`,
   `snapshotWorktreeInventory`. These appear to be upstream-imported
   tests whose fixtures haven't been adapted to the local environment
   yet. Last-touched commit on the file: 8bc255c2 (`fix(workstream):
   normalize migration workstream names (#3269)`), well before Phase 3.

## Disposition

- **Not Phase 3's call.** Executor SCOPE BOUNDARY: "Only auto-fix issues
  DIRECTLY caused by the current task's changes. Pre-existing warnings,
  linting errors, or failures in unrelated files are out of scope."
- These were also listed in `.planning/STATE.md` under "Known Pre-Existing
  Test Failures (Non-Blocking)" prior to Phase 3 start.
- Re-triage in a future maintenance phase (post-milestone). Phase 3 verify
  gate should compare against the pre-Phase-3 12-fail baseline, not
  expect 0 failures.

*Created: 2026-05-11 during Phase 3 plan 03-01 Task 5.*
