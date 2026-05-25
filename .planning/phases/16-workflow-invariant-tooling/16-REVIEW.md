---
phase: 16-workflow-invariant-tooling
reviewed: 2026-05-24T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - scripts/lint-vcs-parallel-call-presence.cjs
  - scripts/lint-vcs-parallel-call-presence.allow.json
  - scripts/lib/allowlist-parser.cjs
  - scripts/dogfood-restore.sh
  - sdk/src/query/cleanup-subagent-workspaces.ts
  - sdk/src/query/command-static-catalog-domain.ts
  - sdk/src/query/command-manifest.non-family.ts
  - sdk/src/query/command-aliases.generated.ts
  - sdk/src/vcs/jj/parallel.ts
  - sdk/src/vcs/jj/workspace-cleanup.ts
  - sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-parallel-git.test.ts
  - get-shit-done/bin/lib/command-aliases.generated.cjs
  - .github/workflows/parallel-e2e.yml
  - tests/scripts/lint-vcs-parallel-call-presence.test.cjs
  - tests/scripts/allowlist-parser.test.cjs
  - tests/cli-cleanup-subagent-workspaces.test.cjs
  - tests/scripts/dogfood-restore-orphan-cleanup.test.cjs
  - tests/scripts/fixtures/lint-vcs-parallel-call-presence/paired/get-shit-done/workflows/paired.md
  - tests/scripts/fixtures/lint-vcs-parallel-call-presence/dispatch-only/get-shit-done/workflows/dispatch-only.md
  - tests/scripts/fixtures/lint-vcs-parallel-call-presence/fanin-only/get-shit-done/workflows/fanin-only.md
  - tests/scripts/fixtures/lint-vcs-parallel-call-presence/prose-only/get-shit-done/workflows/prose-only.md
  - tests/scripts/fixtures/lint-vcs-parallel-call-presence/allowlist/get-shit-done/workflows/opted-out.md
findings:
  critical: 2
  warning: 5
  info: 3
  total: 10
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-05-24T00:00:00Z
**Depth:** standard
**Files Reviewed:** 24 (incl. 5 lint fixtures)
**Status:** issues_found

## Summary

Phase 16 ships two distinct deliverables that I reviewed together:

- **LINT-06 (16.01)** — a new CI lint enforcing FILE-level pairing of
  `workspace.parallel.dispatch` ⇔ `workspace.parallel.fan-in` literals in
  bash/sh/zsh shell fences under `get-shit-done/workflows/`, plus a parser
  tightening to actively REJECT the `expires` field per
  `feedback_solo_dev_no_expires`. This deliverable is well-scoped, byte-identical
  to the audit-workflow-raw-git fence walker as documented, and the test
  fixtures correctly verify the Pitfall 7 prose-only false-positive guard.
  Only one nit (info) on parser schema-version validation.

- **CLEANUP-02 (16.02)** — wires `cleanupSubagentWorkspaces` to two new
  consumers: (a) the fanIn clean-path branch in `sdk/src/vcs/jj/parallel.ts`,
  and (b) a new CLI bridge `cleanup-subagent-workspaces` registered via
  three-site pattern and consumed by `scripts/dogfood-restore.sh`. The
  three-site registration is intact; the dogfood-restore integration test
  passes via the PATH-shim pattern; but the cleanup call site in fanIn
  clean-path **destroys crashed-agent workspaces before reap classification
  runs**, defeating the forensic-preservation contract the queue's
  `workspacePath` field is designed to surface. That's a BLOCKER. A second
  BLOCKER is in `dogfood-restore.sh` — the `2>&1` stderr-merge into
  `CLEANUP_JSON` corrupts the JSON payload as soon as gsd-sdk emits ANY
  stderr noise (verb-resolution warnings, debug, etc.), feeding garbage to
  `jq` which silently flips both counts to `"?"`. The dogfood-restore test
  is hardened against this by the PATH-shim ensuring a clean SDK, but real
  users get malformed metrics every time.

## Critical Issues

### CR-01: fanIn clean-path cleanup destroys crashed-agent workspaces before reap can record forensic state

**File:** `sdk/src/vcs/jj/parallel.ts:478-483` (cleanup call) + `sdk/src/vcs/jj/parallel.ts:499-523` (reap loop)

**Issue:**

In `performJjParallelFanIn`'s clean-merge branch (the `else { ... }` block
spanning lines 419-484), the code calls
`cleanupSubagentWorkspaces(mainRepoRoot, handle.phaseNumber, handle.workspaces)`
at line 478, passing the FULL `handle.workspaces` array. This tears down
EVERY dispatched workspace on disk — including crashed agents' workspaces.

The crashed-agent reap loop at lines 499-523 runs UNCONDITIONALLY afterward
(it checks `crashed.length > 0`, not `!conflicted`). When a fan-in
encounters a clean octopus merge BUT one or more agents crashed (a
realistic mixed scenario), the order of operations is:

1. Line 478 destroys every workspace dir, including the crashed agent's.
2. Line 502-512 builds reap entries from `handle.workspaces.filter(...)`
   using `currentHeads.get(ws.name) ?? ws.baseRev` — workspace tracking is
   independent of the on-disk dir, so reap classification still runs.
3. Line 513 invokes `performJjReap` which writes an `IncompleteWorkEntry`
   with `workspacePath: entry.path` (reap.ts:227 / reap.ts:260) pointing
   to the **now-deleted** workspace dir.

The user-facing artifact (the `incomplete-work.md` queue file) tells the
human reviewer "go inspect `${workspacePath}` to recover partial work" —
except that path no longer exists.

This violates the analog of the W3(a) forensic-preservation contract that
the conflicted-branch path explicitly upholds (parallel.ts:394-402 +
cmd-parallel-jj.test.ts:333-343 inverse assertion). The conflicted branch
correctly skips cleanup to preserve workspaces for forensics; the
clean-merge branch fails to apply the SAME rationale when a subset of
agents crashed.

**Severity:** BLOCKER — silent data loss for crash-recovery scenarios. The
queue entry the orchestrator emits is the ONLY signal that an agent's
partial work survived; pointing it at a deleted path destroys the
recovery surface.

**Test gap:** `cmd-parallel-jj.test.ts:355-407` (crashed-worker scenario)
does NOT assert workspace preservation after fanIn — it only checks the
queue carries a `crashed-with-uncommitted-work` entry, not that the
referenced `workspacePath` still exists. The same regression-guard pattern
used at lines 333-343 for the conflicted branch should fire here against
the crashed-but-not-cleaned subset.

**Fix:**

Filter the cleanup list to exclude crashed agents before calling the
helper. Mirror the same `crashedAgentIds` set the reap loop already
builds at line 501:

```typescript
		merged.push(mergeChangeId);

		// CLEANUP-02 / Phase 16.02 (D-07): tear down materialized subagent
		// workspaces on the clean path EXCEPT crashed-agent workspaces —
		// those need on-disk preservation so the IncompleteWorkEntry's
		// workspacePath is a live forensic handle (mirrors the W3(a)
		// conflicted-branch invariant from parallel.ts:394-402).
		const crashedAgentIds = new Set(
			results.filter((r) => r.exitCode !== 0).map((r) => r.agentId),
		);
		const workspacesToReap = handle.workspaces.filter(
			(ws) => !crashedAgentIds.has(ws.agentId),
		);
		const { failedReaped: cleanupFailedReaped } = cleanupSubagentWorkspaces(
			mainRepoRoot,
			handle.phaseNumber,
			workspacesToReap,
		);
		for (const name of cleanupFailedReaped) failedReaped.push(name);
```

Add a regression test in `cmd-parallel-jj.test.ts` for the mixed
clean-merge-with-crashed-agent scenario that asserts (a) clean agents'
workspaces are gone, (b) the crashed agent's workspace is preserved, (c)
the queue entry's `workspacePath` resolves to an existing directory.

### CR-02: dogfood-restore.sh stderr-merge into CLEANUP_JSON corrupts jq parsing on any stderr noise

**File:** `scripts/dogfood-restore.sh:67-70`

**Issue:**

```bash
CLEANUP_JSON=$(gsd-sdk query cleanup-subagent-workspaces --all-phases 2>&1 \
	|| { echo "WARN: orphan cleanup failed" >&2; echo '{"abandoned":[],"failedReaped":[]}'; })
ABANDONED_COUNT=$(echo "$CLEANUP_JSON" | jq -r '.abandoned | length' 2>/dev/null || echo "?")
FAILED_COUNT=$(echo "$CLEANUP_JSON" | jq -r '.failedReaped | length' 2>/dev/null || echo "?")
```

The `2>&1` redirect MERGES gsd-sdk's stderr into stdout, so any startup or
debug noise from gsd-sdk (e.g. the "not in native registry; falling back to
gsd-tools.cjs" warning documented in `tests/cli-cleanup-subagent-workspaces.test.cjs:97-101`,
or future logging additions, or jj subprocess warnings bubbled up by the
helper) ends up CONCATENATED with the JSON inside `CLEANUP_JSON`.

When `jq -r '.abandoned | length'` then parses `"<warning text>\n{...JSON...}"`,
it fails to parse, the `2>/dev/null || echo "?"` fallback fires, and BOTH
counts silently become `"?"`. The user sees:

```
dogfood-restore: orphan-workspace cleanup complete (abandoned=?, failedReaped=?)
```

which is the SAME message the user would see if `jq` weren't installed.
There's no way to distinguish "jq missing" from "gsd-sdk emitted any
stderr at all."

Worse: the integration test at
`tests/scripts/dogfood-restore-orphan-cleanup.test.cjs:137-159` injects a
PATH-shim that points to a known-good `sdk/dist/cli.js`, so the test
NEVER exercises the corrupted-stderr code path. Production usage (via
the global `gsd-sdk` install) is where this regression actually surfaces.

Additionally, the `||` short-circuit `echo '{"abandoned":[],"failedReaped":[]}'`
ONLY fires when the full subshell pipeline exits non-zero. Since
`2>&1` does NOT change the exit status, gsd-sdk returning exit 0 with
mixed stderr+stdout output leaves `CLEANUP_JSON` carrying the garbage —
the WARN trap never fires, even though the JSON is unparseable.

**Severity:** BLOCKER — corrupted operational metrics on every dogfood
restore against a real (not shimmed) SDK. The dogfood-metrics doc has a
process invariant that these counts get persisted into a recovery-anchor
section; persisting `?` instead of real counts breaks the invariant.

**Fix:**

Capture stdout and stderr separately so jq only ever parses JSON:

```bash
# Phase 16.02 (CLEANUP-02 / D-11/D-12/D-13): post-restore orphan-workspace
# cleanup. Idempotent — re-invoking on a clean tree returns
# {abandoned:[], failedReaped:[]}. Trap with WARN so a cleanup-only miss
# does NOT flag "restore failed" (op-restore + tar both succeeded).
CLEANUP_STDERR_FILE=$(mktemp -t dogfood-restore-cleanup-stderr.XXXXXX)
if CLEANUP_JSON=$(gsd-sdk query cleanup-subagent-workspaces --all-phases 2>"$CLEANUP_STDERR_FILE"); then
	:
else
	echo "WARN: orphan cleanup failed (stderr follows):" >&2
	cat "$CLEANUP_STDERR_FILE" >&2
	CLEANUP_JSON='{"abandoned":[],"failedReaped":[]}'
fi
rm -f "$CLEANUP_STDERR_FILE"
ABANDONED_COUNT=$(printf '%s' "$CLEANUP_JSON" | jq -r '.abandoned | length' 2>/dev/null || echo "?")
FAILED_COUNT=$(printf '%s' "$CLEANUP_JSON" | jq -r '.failedReaped | length' 2>/dev/null || echo "?")
```

And add a regression test in
`tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` that wraps the
PATH-shim with a `gsd-sdk` script that EMITS something to stderr before
the JSON to stdout, then asserts `ABANDONED_COUNT` reflects the actual
count rather than `?`.

## Warnings

### WR-01: Test fixture for crashed-worker on jj-side doesn't assert workspace preservation

**File:** `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts:355-407`

**Issue:** The crashed-worker scenario asserts the queue carries a
`crashed-with-uncommitted-work` entry (line 404) but does NOT assert
`existsSync(handle.workspaces[1].path) === true`. The conflicted-branch
scenario does have this guard (lines 333-343) with an explicit comment
naming it as the regression guard. The same guard should exist for the
crashed-worker scenario so CR-01 above gets caught by tests.

**Fix:** Append to line 405:
```typescript
		// Forensic-preservation guard (mirrors the conflicted-branch
		// regression guard at lines 333-343). The IncompleteWorkEntry's
		// workspacePath must point to a live dir so the human reviewer
		// can recover partial work.
		expect(existsSync(handle.workspaces[1].path)).toBe(true);
```

### WR-02: `allowlist-parser.cjs` ignores `$schema_version` field — silent migration regression risk

**File:** `scripts/lib/allowlist-parser.cjs:39-71`

**Issue:** The parser documents `$schema_version: 2` in the schema comment
(line 11) and the production allow.json carries `"$schema_version": 2`
(line 2), but the parser NEVER validates the field. If a future schema
migration ships a `v3` parser that requires entries to carry a `purpose`
field, an old `v2` allow.json file wouldn't be rejected — the v3 parser
would silently treat missing `purpose` as "not present" and behave
unexpectedly.

This is a forward-compat hazard, not a current-state bug.

**Fix:** Either drop the `$schema_version` field from the production
allow.json (and the schema docs) since the parser ignores it, OR validate
it at parse time:

```javascript
const CURRENT_SCHEMA_VERSION = 2;
function parseAllowlist(json, scriptName) {
	if (!json || typeof json !== 'object') {
		throw new Error(`${scriptName}: allow.json must be a JSON object`);
	}
	if (json.$schema_version !== undefined && json.$schema_version !== CURRENT_SCHEMA_VERSION) {
		throw new Error(`${scriptName}: allow.json $schema_version is ${json.$schema_version}, parser supports ${CURRENT_SCHEMA_VERSION}`);
	}
	// ...
```

### WR-03: `--phase` argv parser accepts empty-string value silently

**File:** `sdk/src/query/cleanup-subagent-workspaces.ts:69-77`

**Issue:** The argv loop guards with `args[i + 1]` truthy-check:
```typescript
} else if (args[i] === '--phase' && args[i + 1]) {
	phase = Number(args[++i]);
}
```

The empty string `''` is falsy, so `gsd-sdk query cleanup-subagent-workspaces --phase ''`
silently treats `--phase` as if it were absent and falls through to the
`phase_or_all_phases_required` envelope. The user expects to see
`invalid_phase_number` here (the more specific reason). Same hazard for
`--cwd ''`.

This shape is copied verbatim from `workspace-parallel-cancel.ts:59-62`,
so the same critique applies to the cancel verb — not a new defect
introduced in Phase 16, but the new bridge inherits the pattern.

**Fix:** Use explicit `args.length` guard rather than truthy check:
```typescript
} else if (args[i] === '--phase' && i + 1 < args.length) {
	phase = Number(args[++i]);
}
```
This treats `--phase ''` as `Number('')` → 0, which then trips the
`Number.isInteger(0) && 0 < 0` guard … wait, `0 < 0` is false, so phase=0
is accepted. But that's actually CORRECT behavior — phase 0 is a legal
sentinel (the quick.md workflow uses it per
`workspace-parallel-dispatch.ts:63-65`). The fix is fine; empty string
becomes 0, which is a valid phase number, OR you can additionally check
`args[i + 1] === ''` and route to `invalid_phase_number` if stricter
behavior is desired.

### WR-04: dogfood-restore.sh `WARN` trap echoes warning unconditionally on bare `jq` parse failure

**File:** `scripts/dogfood-restore.sh:69-70`

**Issue:** The diagnostic echo on line 71 always says "complete (abandoned=X,
failedReaped=Y)" even when one or both counts fell back to `?`. There's no
"WARN" emitted in this case — the user only sees "complete (abandoned=?,
failedReaped=?)" which sounds like a clean run. Compare to line 68's
explicit `WARN: orphan cleanup failed` for the gsd-sdk exit-nonzero case.

After CR-02 is fixed, the only path where the counts become `?` is:
(a) jq not installed, OR (b) `jq` saw invalid input despite the cleaned
stdin. Both deserve an explicit WARN, not silent `?` substitution.

**Fix:** Promote the parse-failure path to also emit a WARN:
```bash
if ! ABANDONED_COUNT=$(printf '%s' "$CLEANUP_JSON" | jq -r '.abandoned | length' 2>/dev/null); then
	echo "WARN: jq failed to parse cleanup JSON; abandoned count unknown" >&2
	ABANDONED_COUNT="?"
fi
```
Repeat for FAILED_COUNT.

### WR-05: `cleanupSubagentWorkspaces` fallback regex hardcodes phase tag width — fragile cross-helper coupling

**File:** `sdk/src/vcs/jj/workspace-cleanup.ts:159`

**Issue:** The `readdirSync` fallback uses
`new RegExp(\`^phase-${phaseTag}-subagent-\\d+$\`)`, where `phaseTag` is
`String(phaseNumber).padStart(2, '0')`. This produces a regex like
`^phase-15-subagent-\d+$`. The cross-phase enumeration in
`sdk/src/query/cleanup-subagent-workspaces.ts:62` uses a DIFFERENT regex
shape `^phase-(\d+)-subagent-\d+$` to extract the phase number, then
calls `cleanupSubagentWorkspaces(cwd, phase)` per discovered phase. The
two regexes have subtly different semantics:

- Cross-phase enumeration accepts any digit-count phase number
  (`phase-1-...`, `phase-99-...`, `phase-123-...`).
- The per-phase helper's regex requires the padded form derived from the
  caller's `phaseNumber`.

If a phase number ≥ 100 ever ships, `phaseTag` becomes `'100'` (padStart
no-op since width already 3), and the regex correctly accepts `phase-100-subagent-N`.
But if anyone ever materializes a workspace dir as `phase-1-subagent-1`
(unpadded) for a single-digit phase, the cross-phase enumerator would
discover phase=1 (via `(\d+)` capture), then call
`cleanupSubagentWorkspaces(cwd, 1)`, which would build the regex
`^phase-01-subagent-\d+$` and NOT match the unpadded `phase-1-subagent-1`
dir on disk. Result: silent skip; the orphan is not reaped.

This is defensive — `octopus.ts:300` is documented to always pad to 2
digits, so the unpadded form shouldn't appear in production. But the
two-regex divergence is a long-term hazard.

**Fix:** Hoist the regex pattern to a shared constant and use it in
both files, or pass the workspace `name` from the cross-phase enumerator
DIRECTLY to the helper (skip the per-phase readdirSync re-enumeration
in the helper when the cross-phase enumerator already discovered the
matching name). The latter is cleaner:

```typescript
// in cleanup-subagent-workspaces.ts (CLI bridge):
const matches = readdirSync(workspacesDir).filter((d) => WORKSPACE_NAME_RE.test(d));
const workspacesFromDisk = matches.map((d) => ({ name: d, path: join(workspacesDir, d) }));
// Then call helper with explicit list — bypassing the helper's readdirSync fallback entirely.
```

## Info

### IN-01: Dogfood-restore.sh `set -euo pipefail` interacts with `$(...) || ...` subshell exit

**File:** `scripts/dogfood-restore.sh:29, 67`

**Issue:** The script sets `set -euo pipefail` at line 29. Inside the
`CLEANUP_JSON=$(...)` command substitution at line 67, the `pipefail`
flag affects only the FINAL exit status of the subshell — which is
`gsd-sdk's` exit code OR the `||` fallback's exit (`echo` returns 0).
Since the fallback's `echo` always succeeds, the subshell always exits 0,
so `set -e` never fires here. Behavior is correct; documenting the
non-obvious interaction would help future maintainers.

**Fix:** Add a comment near line 67 noting that `set -e` + `||` short-circuit
keeps the script alive for the cleanup-failure case (D-12 invariant).

### IN-02: `workspace-cleanup.ts` already-gone-skip comment lacks code-flow location reference

**File:** `sdk/src/vcs/jj/workspace-cleanup.ts:199-203`

**Issue:** The else-branch comment refers to "D-03 empty-arrays-on-re-call
invariant — see 15-04-PLAN.md L52, L255, L299." But the comment lives in
THIS file's source; readers without the plan checked out can't follow
the reference. The contract paragraph in the file header at lines 43-48
already documents the invariant — the inline comment should reference
the file header section, not an external doc.

**Fix:**
```typescript
} else {
	// Dir already gone — D-06 idempotent skip; do NOT push to
	// abandoned[] (would violate the empty-arrays-on-re-call
	// invariant — see this file's header §Idempotent re-call).
}
```

### IN-03: Lint script `findMarkdown` skips symlinked DIRECTORIES but not symlinked FILES

**File:** `scripts/lint-vcs-parallel-call-presence.cjs:80-89`

**Issue:**
```javascript
function findMarkdown(dir, out) {
	let entries;
	try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
	for (const entry of entries) {
		if (entry.isSymbolicLink()) continue;
		// ...
	}
}
```

The early `continue` on `isSymbolicLink()` skips BOTH symlinked
directories AND symlinked files. The threat-model justification in the
comment (lines 78-81) only covers the directory case — a symlinked .md
file pointing at a workflow markdown file outside the scan root would be
incorrectly excluded.

This is defense-in-depth and the conservative choice is fine; the
comment should note that file-symlinks are also excluded by design (not
just dir-symlinks).

**Fix:** Update the comment block to reflect actual behavior:
```javascript
// T-13-04 defense-in-depth: skip ALL symbolic links (both directory
// and file) so a stray symlink inside a SCAN_ROOT cannot make the walk
// read files outside the repo (ASVS V12; threat_model T-16.01-01).
```

---

_Reviewed: 2026-05-24T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
