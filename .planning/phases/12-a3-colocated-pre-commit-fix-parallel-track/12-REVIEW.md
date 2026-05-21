---
phase: 12-a3-colocated-pre-commit-fix-parallel-track
reviewed: 2026-05-20T00:00:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - sdk/src/vcs/__tests__/jj-hooks.test.ts
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-05-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

Phase 12 adds a single regression test (`HOOK-07`) to
`sdk/src/vcs/__tests__/jj-hooks.test.ts` and extends the existing `node:fs`
import with `readFileSync`. The new test asserts an *exact-count* contract
(the colocated adapter fires `.githooks/pre-commit` exactly once per
`vcs.commit`), complementing the sibling D-32 test at `:200` which only
asserts the marker *exists* (a >=1 assertion). The scope is well-contained
and the test logic is sound: it stages distinct `co-hook07*.txt` files so it
does not collide with sibling tests sharing the colocated `dir`, uses an
appending counter hook body (`>>`) so a double-fire would be detectable, and
resets the marker between the two commits.

No correctness or security defects were found. One warning concerns
inter-test ordering coupling introduced by the lack of a per-test marker
cleanup in `afterEach`; two info items concern minor robustness and
consistency improvements.

## Warnings

### WR-01: HOOK-07 leaks `.githooks/pre-commit` into the shared colocated `dir`, coupling it to sibling-test ordering

**File:** `sdk/src/vcs/__tests__/jj-hooks.test.ts:263-267, 287`

**Issue:** Every test inside the `jj-colocated` describe block shares one
`dir` created in `beforeAll`. `writeHook()` writes `.githooks/pre-commit`
into that directory, and no test removes the hook afterward — there is no
`afterEach`. HOOK-07 installs a *counter* hook (`echo fired >> "${markerPath}"`)
that is bound to HOOK-07's own `markerPath`. Because tests in a Vitest file
run sequentially in source order and HOOK-07 is the *last* `it()` that
installs a `.githooks/pre-commit` hook before the observational A3 test at
`:304`, the residual counter hook stays active when the A3 test runs.

Today this is benign: the A3 test asserts only `existsSync` on its *own*
`.git-side-fired` marker and the residual `.githooks/pre-commit` hook appends
to HOOK-07's stale `.hook07-fire-count` marker, which the A3 test never reads.
But the coupling is fragile:

- If a future test is inserted *between* HOOK-07 and the A3 test, or if
  `describe` ordering / `test.concurrent` is ever enabled, HOOK-07's counter
  hook will fire during that test and silently mutate `.hook07-fire-count`
  after HOOK-07's assertions have already passed — no failure, but the
  intent ("exactly once per commit") is no longer what the file actually
  exercises.
- HOOK-07 itself relies on `safeUnlink(markerPath)` at `:259` and `:287` to
  reset state. That works only because each `writeHook` call overwrites the
  *same* `.githooks/pre-commit` path. The test is correct *as written* but
  inherits the block's pre-existing "shared mutable dir, no teardown"
  pattern, and the new exact-count assertion is more sensitive to stray
  fires than the older `existsSync`-only assertions were.

This is a WARNING (not BLOCKER) because the current source order makes the
test pass deterministically; the risk is silent erosion of the assertion's
meaning under future edits.

**Fix:** Make HOOK-07 self-contained instead of relying on block ordering.
Either (a) remove the hook after the test so no residual hook survives:

```ts
it('HOOK-07: colocated vcs.commit fires .githooks/pre-commit exactly once', () => {
	const markerPath = join(dir, '.hook07-fire-count');
	const hookPath = join(dir, '.githooks', 'pre-commit');
	safeUnlink(markerPath);
	try {
		writeHook(dir, 'pre-commit', `#!/bin/bash\necho fired >> "${markerPath}"\nexit 0\n`);
		// ... existing two-commit assertions ...
	} finally {
		safeUnlink(hookPath);
		safeUnlink(markerPath);
	}
});
```

or (b) add a block-level `afterEach(() => safeUnlink(join(dir, '.githooks', 'pre-commit')))`
so no test inherits a previous test's hook. Option (a) keeps the change
local to Phase 12's new code.

## Info

### IN-01: HOOK-07 does not assert `readFileSync` sees a file that exists, so a non-firing hook produces a confusing `ENOENT` instead of a count mismatch

**File:** `sdk/src/vcs/__tests__/jj-hooks.test.ts:279-282, 294-297`

**Issue:** The assertion reads the marker directly with
`readFileSync(markerPath, 'utf8')`. If a regression caused the hook to *not
fire at all* (e.g. a re-introduced D-10 colocated no-op — exactly the
regression class this test guards against), `markerPath` would never be
created and `readFileSync` would throw `ENOENT: no such file or directory`.
The test would still fail (good), but the failure surfaces as an unhandled
filesystem exception rather than the intended, legible
`expected 0 to be 1` count assertion. A reader debugging CI output gets a
stack trace pointing at `readFileSync` instead of a clear "hook fired 0
times" signal.

**Fix:** Guard the read with an explicit existence assertion so the failure
mode is self-describing:

```ts
expect(existsSync(markerPath)).toBe(true); // hook fired at least once
const lines1 = readFileSync(markerPath, 'utf8')
	.split('\n')
	.filter((l) => l !== '');
expect(lines1.length).toBe(1); // ...exactly once
```

This also makes HOOK-07 distinguish a zero-fire regression from a
double-fire regression in the failure message.

### IN-02: Counter hook body is non-deterministic if `pre-commit` is ever invoked concurrently; comment claims "exactly 1 line" without noting the single-writer assumption

**File:** `sdk/src/vcs/__tests__/jj-hooks.test.ts:263-267`

**Issue:** The hook body `echo fired >> "${markerPath}"` relies on a single
serialized invocation per commit. The test comment (`:264-265`) correctly
explains the append-vs-truncate choice but does not state the assumption
that the adapter fires the hook exactly once *synchronously*. If a future
adapter change ever fired `pre-commit` from concurrent code paths, two
`echo >>` invocations could interleave their writes and `split('\n')` might
observe a partial line, making `lines.length` flaky rather than a clean
`2`. This is purely defensive — the current adapter (`sdk/src/vcs/backends/jj.ts:273`)
fires `fireHook` once, synchronously — but the test's robustness claim would
read more honestly with one extra sentence in the comment, e.g. "assumes the
adapter fires pre-commit synchronously and serially; concurrent fires would
require a write-atomic counter."

**Fix:** Optional. Either add the clarifying sentence to the existing
comment block, or make the counter write-atomic (e.g. have the hook body
`echo fired` to stdout and count adapter-captured output instead of a shared
file). Lowest-effort acceptable resolution: extend the comment. No code
change is required for current correctness.

---

_Reviewed: 2026-05-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
