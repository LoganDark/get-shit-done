---
status: resolved
phase: 01-adapter-foundation-git-backend
source: [01-VERIFICATION.md]
started: 2026-05-09T00:00:00Z
updated: 2026-05-09T00:00:00Z
---

## Current Test

[all resolved]

## Tests

### 1. WR-06 sentinel — audit Phase 2/3 callers for prior signal-kill→exitCode:1 collision dependency
expected: No call site relied on the previous `result.status ?? 1` collapsing signal-killed processes to exit code 1; if any did, they should branch on `EXIT_CODE_SIGNAL_KILLED` (-1) explicitly.
why_human: Behavior change is semantic, not regex-detectable. All Phase 1 tests pass, but Phase 2 will migrate ~80 git-touching call sites — any one that did `if (result.exitCode === 1)` to mean both 'real exit 1' and 'killed by signal' will now miss the killed case. Flagged by REVIEW-FIX WR-06 as 'Requires human verification'.
result: passed
audit_notes: |
  Repo-wide grep confirms every git-spawning caller branches on `exitCode !== 0`, never `=== 1`.
  Sites audited: get-shit-done/bin/lib/{worktree-safety,graphify,verify,commands}.cjs;
  sdk/src/vcs/backends/git.ts (15+ sites); sdk/src/query/commit.ts:149,171;
  sdk/src/vcs/parse/worktree-list.ts:88. The single `exitCode === 1` match is
  tests/bug-3033-sdk-flag-wired.test.cjs:148, asserting process.exit(1) from the SDK CLI
  fail-fast path — unrelated to git result handling. Both old (status ?? 1 → 1) and new
  (EXIT_CODE_SIGNAL_KILLED = -1) paths satisfy `!== 0` for signal-killed processes, so
  branch outcome is identical. The sentinel change is purely additive; Phase 2 migration
  carries no risk from this finding.

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
