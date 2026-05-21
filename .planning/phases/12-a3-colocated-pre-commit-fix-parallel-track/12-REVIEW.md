---
phase: 12-a3-colocated-pre-commit-fix-parallel-track
reviewed: 2026-05-20T00:00:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - sdk/src/vcs/__tests__/jj-hooks.test.ts
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-05-20T00:00:00Z
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

Phase 12 added one `it()` block — `HOOK-07: colocated vcs.commit fires .githooks/pre-commit exactly once` (lines 250-298) — to the existing `jj-colocated` describe block, plus `readFileSync` to the `node:fs` import (line 24). This is a fresh re-review; it supersedes any prior REVIEW.md content.

The change is small and well-scoped. The import is correctly used at lines 279 and 294. The core exact-fire-count logic is sound: the counter hook body appends a constant line per invocation (`>>`, not truncate), and `split('\n').filter((l) => l !== '')` correctly drops the trailing-newline empty string. The reset-and-recommit pattern (lines 287-296) genuinely proves per-commit firing rather than cumulative drift, and the distinct `co-hook07*.txt` file stems avoid colliding with sibling tests that share the colocated `dir`.

Two warnings. First, the new test reads the marker with `readFileSync` instead of a graceful existence check, so a zero-fire regression — the exact failure HOOK-07 exists to catch — surfaces as a confusing `ENOENT` rather than a clear count assertion. Second, HOOK-07 installs a `.githooks/pre-commit` hook into the shared `dir` and never removes it, so the new exact-count guard inherits the block's "shared mutable dir, no teardown" pattern and is more sensitive to stray fires than the older `existsSync`-only siblings. One info item flags a stale line-number citation in the block comment.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: `readFileSync` on a missing marker throws `ENOENT` instead of producing a legible assertion failure

**File:** `sdk/src/vcs/__tests__/jj-hooks.test.ts:279`, also `:294`

**Issue:** HOOK-07 exists specifically to catch a regression where the colocated pre-commit hook fails to fire — a re-introduced D-10 colocated no-op, per the block comment at lines 251-258. But in exactly that regression, `markerPath` is never created, and `readFileSync(markerPath, 'utf8')` throws `ENOENT: no such file or directory` before any `expect()` runs.

The test still fails (correct outcome), but the failure surfaces as an unhandled filesystem exception with a stack trace pointing at `readFileSync` — not the intended, legible "fired 0 times, expected 1" signal. The sibling D-32 test at line 218 deliberately uses `existsSync(markerPath)`, so the same zero-fire regression degrades cleanly to `expect(false).toBe(true)`. HOOK-07 loses that diagnostic property precisely for the failure class it was written to guard. It also cannot distinguish a zero-fire regression from a double-fire regression in the failure message — the ENOENT masks which one occurred.

**Fix:** Assert the marker exists before reading it, at both read sites:

```ts
// First commit
expect(r1.exitCode).toBe(0);
expect(existsSync(markerPath)).toBe(true); // clean failure if hook never fired
const lines1 = readFileSync(markerPath, 'utf8')
	.split('\n')
	.filter((l) => l !== '');
expect(lines1.length).toBe(1);
```

Apply the same `existsSync` guard before the second `readFileSync` at line 294. Alternatively, read defensively (`existsSync(markerPath) ? readFileSync(markerPath, 'utf8') : ''`) so the count assertion itself reports `0 !== 1`.

### WR-02: HOOK-07 leaves a residual `.githooks/pre-commit` hook in the shared colocated `dir` with no teardown

**File:** `sdk/src/vcs/__tests__/jj-hooks.test.ts:263-267`

**Issue:** Every `it()` in the `jj-colocated` describe block shares one `dir` created in `beforeAll`. `writeHook()` writes `.githooks/pre-commit` into that directory, and HOOK-07 — the last test in the block that installs a `pre-commit` hook before the observational A3 test at line 304 — installs a *counter* hook (`echo fired >> "${markerPath}"`) and never removes it. There is no `afterEach`.

Today this is benign: HOOK-07's own `safeUnlink(markerPath)` calls (lines 260, 287) reset state correctly because each `writeHook` overwrites the same `.githooks/pre-commit` path, and the A3 test reads only its own `.git-side-fired` marker. But the new exact-count assertion is structurally more fragile than the `existsSync`-only siblings: if a future test is inserted between HOOK-07 and the A3 test, the residual counter hook fires during that test and silently mutates `.hook07-fire-count` after HOOK-07's assertions have already passed — no failure, but the file no longer exercises "exactly once per commit". This is a WARNING, not a BLOCKER, because current source order makes the test deterministic; the risk is silent erosion of the assertion's meaning under future edits.

**Fix:** Make HOOK-07 self-contained — remove the hook in a `finally` so nothing residual survives:

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

Or add a block-level `afterEach(() => safeUnlink(join(dir, '.githooks', 'pre-commit')))` so no test inherits a previous test's hook. The `finally` option keeps the change local to Phase 12's new code.

## Info

### IN-01: Block comment cites line numbers that will silently rot

**File:** `sdk/src/vcs/__tests__/jj-hooks.test.ts:251-258`

**Issue:** The block comment pins two precise locations: "the sibling D-32 test at :199" and "The unconditional fireHook lives at sdk/src/vcs/backends/jj.ts:249-289". The D-32 `it()` actually begins at line 200 in the current file — the `:199` reference is already off by one. Hardcoded line numbers in comments drift on every edit to the surrounding file and become misleading; a symbol/test-name reference is durable.

**Fix:** Replace line-number citations with symbol references, e.g. "the sibling `D-32` test above" and "the unconditional `fireHook` call in `sdk/src/vcs/backends/jj.ts` (Path 1)". Non-blocking maintainability nit on a comment; no behavioral change.

---

_Reviewed: 2026-05-20T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
