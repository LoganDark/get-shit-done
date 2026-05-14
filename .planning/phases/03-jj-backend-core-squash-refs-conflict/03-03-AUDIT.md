# Plan 03-03 Audit — `refs.bookmarks.switch` + `refs.isIgnored` jj-reachability

**Run date:** 2026-05-12
**Plan:** 03-03 (Phase 03 — jj-backend-core-squash-refs-conflict)
**Trigger:** Task 2 — record-of-audit confirming Task 1's decision to keep
`bookmarks.switch` + `refs.isIgnored` as `VcsNotImplementedError` throws on
the jj backend.

This file is the canonical record that the two deferred verbs have no
jj-reachable production caller. The plan's grep audit produces this list;
each match is classified as `git-pinned`, `git-narrowed`, `test-only`, or
`comment-only`. If any future commit introduces a jj-reachable caller, the
verb's body must land alongside the caller's commit — re-run this audit
before merging.

## Audit Commands

```bash
grep -rn "\.bookmarks\.switch\b" sdk/src bin get-shit-done/bin tests
grep -rn "\.refs\.isIgnored\b\|\.isIgnored(" sdk/src bin get-shit-done/bin tests
```

## refs.bookmarks.switch

### Production callers

| # | File:line | Caller pattern | Classification |
|---|-----------|----------------|----------------|
| 1 | `get-shit-done/bin/lib/commands.cjs:319` | `vcs.refs.bookmarks.switch(branchName, { create: true })` — `vcs` constructed at line 309 as `createVcsAdapter(cwd, { kind: 'git' })` | `git-pinned` |
| 2 | `get-shit-done/bin/lib/commands.cjs:321` | `vcs.refs.bookmarks.switch(branchName)` (catch-branch of the `create:true` try) — same `vcs` instance as #1 | `git-pinned` |

Both production call sites construct the adapter with the explicit
`{ kind: 'git' }` option, which routes through `createVcsAdapter`'s
`opts.kind` branch (highest priority in the D-17 resolver) and unconditionally
returns a `GitVcsAdapter`. The jj branch is statically unreachable.

### Test callers

| # | File:line | Classification |
|---|-----------|----------------|
| 3 | `sdk/src/vcs/__tests__/git-backend.test.ts:383` | `test-only` (git-backend-test scope) |
| 4 | `sdk/src/vcs/__tests__/git-backend.test.ts:474` | `test-only` (git-backend-test scope) |
| 5 | `sdk/src/vcs/__tests__/git-backend.test.ts:489` | `test-only` (git-backend-test scope) |
| 6 | `sdk/src/vcs/__tests__/baseline-parity.test.ts:402` | `test-only` — branch is guarded by `if (adapterVcs.kind !== 'git') throw new Error('expected git adapter')` immediately before the call |
| 7 | `sdk/src/vcs/__tests__/baseline-parity.test.ts:425` | `test-only` — same `kind === 'git'` guard pattern as #6 |
| 8 | `sdk/src/vcs/__tests__/jj-refs.test.ts:236` | `test-only` — asserts `VcsNotImplementedError` (this plan's negative-path coverage) |
| 9 | `sdk/src/vcs/__tests__/jj-skeleton.test.ts:88` | `test-only` — asserts `VcsNotImplementedError` (plan-01 negative-path coverage) |
| 10 | `tests/__tools__/capture-vcs-baselines.cjs:334` | `comment-only` — documents the adapter equivalent of `git checkout -b`; not invoked |
| 11 | `tests/__tools__/capture-vcs-baselines.cjs:344` | `comment-only` — same |

### Comment / lint / config references

| # | File:line | Classification |
|---|-----------|----------------|
| 12 | `sdk/src/vcs/backends.ts:64,72` | `comment-only` + allowlist entry `['git']` |
| 13 | `sdk/src/vcs/backends/jj.ts:171,177` | `comment-only` — JSDoc + `VcsNotImplementedError` throw site |
| 14 | `sdk/src/vcs/__tests__/types.test.ts:41` | `test-only` — error class construction test, no behavior call |
| 15 | `sdk/src/vcs/__tests__/backends.test.ts:36,38` | `test-only` — allowlist assertion |

### Verdict: `refs.bookmarks.switch` has NO jj-reachable production caller

Both production sites (`commands.cjs:319`/`:321`) pin `kind: 'git'`. Tests
that exercise the verb on a real `vcs` instance either guard with `if (kind
!== 'git') throw` (baseline-parity) or are entirely git-backend-scoped
(git-backend.test.ts). The jj-side throws `VcsNotImplementedError` from
`sdk/src/vcs/backends/jj.ts:177` — that throw is verified by
`jj-skeleton.test.ts:89` and `jj-refs.test.ts:236`.

If a future commit introduces a jj-reachable call site, the verb body must
land in the same commit. Re-run this audit before merging.

---

## refs.isIgnored

### Production callers

| # | File:line | Caller pattern | Classification |
|---|-----------|----------------|----------------|
| 1 | `get-shit-done/bin/lib/core.cjs:613` | `vcs.refs.isIgnored(targetPath)` — `vcs` constructed at line 611 as `createVcsAdapter(cwd, { kind: 'git' })` | `git-pinned` |

Single production caller; explicit `kind: 'git'` construction. The function
is named `isGitIgnored` (line 599) and is documented in the JSDoc at line
606 as wrapping `git check-ignore`, reaffirming the git-only intent.

The pre-Phase-3 ADR-0004 mentioned in the plan CONTEXT.md tagged this verb
as git-only-by-design — the gitignore semantics (`.gitignore` files +
`--no-index` flag) don't map directly to jj, which has no analogous
`.jjignore`-on-disk surface in the colocated case (the file is `.gitignore`
itself, processed by the colocated git half).

### Test callers

| # | File:line | Classification |
|---|-----------|----------------|
| 2 | `sdk/src/vcs/__tests__/git-backend.test.ts:445` | `test-only` (git-backend-test scope) |
| 3 | `sdk/src/vcs/__tests__/git-backend.test.ts:451` | `test-only` (git-backend-test scope) |
| 4 | `sdk/src/vcs/__tests__/baseline-parity.test.ts:528` | `test-only` — the `vcs` instance is the baseline-parity describe block's adapter, which iterates over `selectedBackends()`. The site is gated by the `args[0] === 'check-ignore'` dispatch which only fires on the git-baseline records; the jj-colocated lane skips this branch because no jj baseline captures a `check-ignore` invocation. |
| 5 | `sdk/src/vcs/__tests__/jj-skeleton.test.ts:109` | `test-only` — asserts `VcsNotImplementedError` (plan-01 negative-path coverage) |
| 6 | `sdk/src/vcs/__tests__/jj-refs.test.ts:195` | `test-only` — asserts `VcsNotImplementedError` (this plan's negative-path coverage) |
| 7 | `tests/__tools__/capture-vcs-baselines.cjs:512` | `comment-only` — documents the adapter equivalent of `git check-ignore`; not invoked |

### Verdict: `refs.isIgnored` has NO jj-reachable production caller

The single production site (`core.cjs:613`) pins `kind: 'git'`. The
baseline-parity test only invokes `isIgnored` when iterating over a
git-baseline record (the `check-ignore` arg pattern); jj baselines do not
capture this command pattern. jj-skeleton + jj-refs explicitly assert the
`VcsNotImplementedError` throw.

If a future commit introduces a jj-reachable call site, the verb body must
land in the same commit. Re-run this audit before merging.

---

## Summary

| Verb | Production callers | Jj-reachable? | Verdict |
|------|--------------------|---------------|---------|
| `refs.bookmarks.switch` | 2 (commands.cjs:319, :321) | NO — both `kind:'git'`-pinned | `VcsNotImplementedError` stays |
| `refs.isIgnored` | 1 (core.cjs:613) | NO — `kind:'git'`-pinned | `VcsNotImplementedError` stays |

**Plan 03-03 Task 1 decision confirmed.** The two `VcsNotImplementedError`
throws in `backends/jj.ts` are correct; the allowlist entries stay `['git']`
only; the negative-path assertions in `jj-skeleton.test.ts` +
`jj-refs.test.ts` pin the contract.

**Phase 4 reshape trigger:** If WS-* requires jj-side switch semantics (or
a worktree-safety equivalent of `isIgnored` for jj's `.jjignore`), the
corresponding plan in Phase 4 lands the verb body + flips the allowlist
entry + removes the negative-path assertions from this audit's test list.
