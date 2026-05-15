---
phase: 09-jj-side-parallel-verbs
reviewed: 2026-05-15T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - sdk/src/vcs/types.ts
  - sdk/src/vcs/backends/jj.ts
  - sdk/src/vcs/backends/git.ts
  - sdk/src/vcs/jj/parallel.ts
  - sdk/src/vcs/jj/conflict-paths.ts
  - sdk/src/vcs/jj/reap.ts
  - sdk/src/vcs/jj/incomplete-work.ts
  - sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts
  - sdk/src/vcs/__tests__/jj-reap.test.ts
findings:
  critical: 2
  warning: 8
  info: 4
  total: 14
status: issues_found
---

# Phase 9: Code Review Report

**Reviewed:** 2026-05-15
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 9 lands `vcs.workspace.parallel.{dispatch,fanIn}` on the jj backend with a
throwing stub on git. The implementation hits its declared targets — sidecar
discipline (UPSTREAM-02), frozen JSON handle (D-05), closed-union reason
parser (D-09), agent-bookmark eager-creation + batched delete (D-08), and the
in-tree conflict joint-assertion producer (D-16 / W3(a)) — and the listed
auto-fixes from 09.05 (re-resolved `@`, two-stage conflict probe, drop
`--no-graph` on `bookmark list`) are visible in the production code.

Adversarial review surfaces 14 findings. The two BLOCKERs are a round-trip
corruption defect in the `incomplete-work.md` writer/parser pair (writer
accepts paths containing `,`; reader rejects them) and a crash-on-write
ENOENT path in `appendIncomplete` when `derivePhaseRoot`'s fallback returns a
non-existent dir on the in-tree-conflict branch — i.e. the W3(a) producer can
throw mid-fanIn after the merge has already landed. The remaining findings
range from missing input validation (empty `plan`, mainBookmark existence) to
robustness gaps in the surplus-bookmark probe (divergent suffix, remote
tracking variants) and an unbounded tmpdir leak on every `dispatch` call.

The Git-side throwing stub satisfies the interface contract without leaking
partial behavior — clean. The closed-union `reason` validator in
`incomplete-work.ts` is bypassable in two non-trivial ways noted below; the
union itself is intact at type level.

## Critical Issues

### CR-01: `incomplete-work.md` writer/parser round-trip corrupts entries whose `workspacePath` or `subagentName` contains the delimiter byte

**File:** `sdk/src/vcs/jj/incomplete-work.ts:56,78`
**Issue:**
The writer at line 56 emits:
```
- ${subagentName}: head=${changeIdShort}, workspace=${workspacePath}, reason=${reason}\n
```
The reader regex at line 78 is:
```
/^\s*-\s+([^:]+):\s+head=([^,]+),\s+workspace=([^,]+),\s+reason=(.*)$/
```
The `[^:]+` and `[^,]+` character classes mean the writer is strictly more
permissive than the reader for two fields:

1. **`workspacePath` containing a literal `,`**: macOS, Linux, and Windows
   filesystems all permit `,` in path components. `mkdtemp` won't produce
   one, but caller-supplied workspace paths can. A path like
   `/tmp/agent,1/work` writes a line that the reader parses with
   `workspace=/tmp/agent` and `reason=1/work, reason=…` — silent corruption
   if it happens to remain a known reason value, otherwise a misleading
   "unknown reason" throw whose error message points at the wrong substring.

2. **`subagentName` containing `:`**: less likely in current callers
   (`phase-09-merge` / `phase-09-subagent-1` shape), but `parallel.ts:418-423`
   constructs `subagentName: \`phase-${phaseTag}-merge\`` and reap.ts:225
   uses the workspace name directly — no validator gates either path from a
   future caller emitting `:`-containing names.

This is round-trip data loss at the persistence boundary the D-14 phase-merge
gate relies on for fail-safe blocking.

**Fix:**
Use a structurally unambiguous format — JSONL is the cleanest swap and
matches the `parseJjLog` / `parseJjWorkspaceList` convention already used
elsewhere in the codebase. Failing that, percent-encode or quote the
delimiter-sensitive fields, and update the regex to match. Minimum viable
fix:
```ts
// writer
const line = JSON.stringify({
  subagentName: entry.subagentName,
  changeIdShort: entry.changeIdShort,
  workspacePath: entry.workspacePath,
  reason: entry.reason,
}) + '\n';

// reader: JSON.parse each non-blank, non-`#` line; validate `reason`
// against KNOWN_REASONS the same way.
```
Migration: any pre-existing on-disk queue file from Phase 4 will need to be
emptied or one-shot converted; the file is human-emptied per design, so a
fresh write after this fix is acceptable.

---

### CR-02: `appendIncomplete` throws ENOENT when `derivePhaseRoot` falls back to the non-existent padded-numeric directory — and `fanIn`'s W3(a) producer hits this path AFTER the N-parent merge has already landed

**File:** `sdk/src/vcs/jj/parallel.ts:144-152,424` (and `incomplete-work.ts:55-58`)
**Issue:**
`derivePhaseRoot` returns `join(phasesParent, padded)` (e.g.
`.planning/phases/09`) when no slug-suffixed match is found at lines 144-152.
The JSDoc comment at parallel.ts:140-142 acknowledges this:

> Returns an absolute path even when the dir does not exist (callers
> `appendIncomplete` create the queue file lazily; `mkdir -p` is the
> caller's responsibility if the parent doesn't exist).

But `appendIncomplete` calls `appendFileSync(queuePath(phaseDir), line)` with
NO `mkdir -p` (incomplete-work.ts:55-58). When `phaseDir` does not exist,
`appendFileSync` throws `ENOENT: no such file or directory`.

The exposure window: `performJjParallelFanIn` lines 358-371 land the
N-parent merge BEFORE line 424's `appendIncomplete(handle.phaseRoot,
mergeEntry)` runs. If the orchestrator dispatches against a fresh phase
number with no `.planning/phases/09-*` directory pre-materialized (the
contract test setup at cmd-parallel-jj.test.ts:84 only does this because the
test fixture creates `09-test/` explicitly), the merge change is in the
op_log but the queue entry never lands and the caller gets an opaque
ENOENT — neither D-16 joint-assertion nor the D-14 phase-merge gate has a
record of the conflict.

reap.ts:230 (`appendIncomplete(opts.phaseDir, queueEntry)`) has the same
exposure but is called from `workspace.reap()` where the caller (and the
existing test fixture at jj-reap.test.ts:66-67) materializes `phaseDir` up
front. The new fanIn callsite breaks this informal contract.

**Fix:**
Either:
1. **In `appendIncomplete`** — fail closed by `mkdirSync(dirname(p),
   { recursive: true })` before `appendFileSync`. Cheap, idempotent, fixes
   every callsite at once:
   ```ts
   import { mkdirSync } from 'node:fs';
   import { dirname } from 'node:path';
   export function appendIncomplete(...) {
     const p = queuePath(phaseDir);
     mkdirSync(dirname(p), { recursive: true });
     appendFileSync(p, line);
   }
   ```
2. **In `performJjParallelDispatch`** — materialize `phaseRoot` at dispatch
   time so the handle's `phaseRoot` is always a directory. Symmetric with
   the contract test setup. Doesn't help reap-side callers.

(1) is the safer fix and matches the JSDoc's intent.

## Warnings

### WR-01: `performJjParallelDispatch` accepts `plan: []` (zero subagents); fanIn then issues `jj bookmark delete --` with no positional names, which jj 0.41 rejects

**File:** `sdk/src/vcs/jj/parallel.ts:174-222,452-467`
**Issue:**
`performJjParallelDispatch` does not validate `plan.length > 0`. An empty
plan still calls `createPhaseStructure`, no slots are created, no bookmarks
are emitted, and an empty manifest body is written. A subsequent fanIn
then:
- Issues `jj new -r @ -m "phase 09 merge: 0 parents"` (a no-op duplicate
  change — harmless on its own).
- Builds `agentBookmarkNames = []` and runs `jj bookmark delete --` with no
  trailing positionals (parallel.ts:458-462), which jj 0.41 rejects as
  "error: a value is required for '[NAMES]...'".

The user gets an opaque error from the batched-delete path after the merge
change has already landed.

**Fix:**
Validate `plan.length > 0` at the top of `performJjParallelDispatch`:
```ts
if (plan.length === 0) {
  throw new Error('parallel.dispatch: plan must contain at least one subagent');
}
```
Mirror the WR-01 `commit({files:[]})` rejection pattern at git.ts:115-120 /
jj.ts:165-170.

---

### WR-02: `mainBookmark` is validated for argv shape but not for existence; the clean-path advance creates the bookmark silently if it doesn't exist

**File:** `sdk/src/vcs/jj/parallel.ts:121-131,435-445`
**Issue:**
`validateMainBookmark` only enforces the refname character class. On the
clean path, `jj bookmark set <mainBookmark> -r @` will CREATE the bookmark
when it doesn't exist (jj 0.41 behavior — `bookmark set` is unconditional
create-or-move). A caller that misspells `mainBookmark` (`mian` instead of
`main`) silently creates a new bookmark named `mian` at the merge change,
leaving the actual `main` bookmark behind at its old position. The phase
merge appears successful from fanIn's return shape but the repo's main
pointer never moves.

Pre-existing pattern in `backends/jj.ts:1189-1194` (Phase 7 merge) has the
same shape, so this is partly inherited risk. But parallel-dispatch raises
the stakes (multi-subagent waves through a single fanIn).

**Fix:**
Probe existence first:
```ts
const probeArgs = [...jjArgvFlags(mainRepoRoot), 'bookmark', 'list', '-T', 'name ++ "\n"'];
const probe = vcsExec(mainRepoRoot, 'jj', probeArgs);
if (probe.exitCode !== 0 || !probe.stdout.split('\n').map(s => s.trim()).includes(handle.mainBookmark)) {
  throw new Error(`parallel.fanIn: main bookmark "${handle.mainBookmark}" does not exist`);
}
```
Or pass an explicit "create-or-fail" flag through `dispatch` opts so the
caller opts into create-on-advance behavior knowingly.

---

### WR-03: tmpdir manifest is never cleaned up — every `dispatch` call leaks a directory under `$TMPDIR/gsd-wave-manifest-*`

**File:** `sdk/src/vcs/jj/parallel.ts:252-265`
**Issue:**
`mkdtempSync(join(tmpdir(), 'gsd-wave-manifest-'))` creates a fresh
directory per dispatch call. There is no cleanup hook on fanIn completion,
no registration with a process-level temp tracker, and no integration with
the workspace.reap path. Over time (long-running orchestrator, many phases)
this accumulates one dir per dispatch.

Confidentiality: the manifest body contains agentId, planId, workspace
paths, and the merge-point change_id — non-secret in this codebase, but a
predictable disclosure surface to other processes with `$TMPDIR` read
access.

**Fix:**
Either:
1. Move the manifest into a phase-scoped location that the existing
   reap/cleanup path already manages, e.g.
   `${handle.phaseRoot}/.gsd-wave-manifest.json` (and add to .gitignore /
   the phase-merge-time cleanup).
2. Add an explicit `fanIn`-time `rmSync(dirname(handle.manifest), {
   recursive: true, force: true })` after the merge change lands cleanly.
   Skip on the conflicted path so the user can still inspect the manifest.

(1) is the architecturally cleaner answer and aligns the manifest's
lifetime with the phase's lifetime.

---

### WR-04: `surplusBookmarks` invariant probe misses divergent (`name?`/`name??`) and remote-tracking suffix variants

**File:** `sdk/src/vcs/jj/parallel.ts:479-493`
**Issue:**
The post-delete probe uses `jj bookmark list -T 'name ++ "\n"'` and then
filters with `s.startsWith(prefix)`. On jj 0.41:

- A divergent bookmark renders with a `?` / `??` suffix in the default
  `name` template emission depending on jj version.
- Remote-tracking bookmarks emit their own records when `jj bookmark list`
  is called without filtering (no `-r` / no `--all-remotes` flag, but the
  default includes local tracking branches that were ever pushed).

Either case can leak past the prefix filter, OR can silently HIDE a real
leftover (`gsd/phase-09-subagent-1??` does not start with the literal
prefix the test asserts on — fails to flag the surplus). The D-08 invariant
is supposed to be the cross-backend contract handed to plan 05; a probe
this brittle won't survive a Renovate bump.

**Fix:**
Filter via revset rather than template-text matching:
```ts
const listArgs = [
  ...jjArgvFlags(mainRepoRoot),
  'bookmark', 'list', '-r', `bookmarks(glob:"gsd/phase-${phaseTag}-subagent-*")`,
  '-T', 'name ++ "\n"',
];
```
Confirm the exact revset spelling against jj 0.41 before locking. Strip
trailing `?` / `??` from each line before the prefix check as a defense
layer. Document the remote-tracking exclusion explicitly.

---

### WR-05: `parseJjStatus` (and similar parsers) treat `appendFileSync` ENOENT (CR-02 root cause) as an opaque throw — no path-traversal guard on `phaseDir`

**File:** `sdk/src/vcs/jj/incomplete-work.ts:55-58,71-110`
**Issue:**
`phaseDir` is plumbed through from orchestrator-level callers without
validation. `queuePath` concatenates blindly via `join(phaseDir,
QUEUE_FILENAME)`. A caller (test-fixture, orchestrator misconfiguration,
or a future SDK consumer) passing `phaseDir = '../../etc'` writes
`../../etc/incomplete-work.md` outside the intended phase tree. The reader
likewise reads from there. Combined with CR-01's writer permissiveness,
this is an info-disclosure / write-anywhere primitive when `phaseDir`
crosses a trust boundary.

The fan-in callsite at parallel.ts:424 passes `handle.phaseRoot` which is
derived from `mainRepoRoot` + numeric phase; the value is mostly
internally-derived. But the public API for `appendIncomplete` /
`readIncomplete` takes raw `phaseDir`.

**Fix:**
Either:
1. Constrain at the type level — accept `mainRepoRoot` + `phaseNumber` and
   compute the path internally; refuse to accept a free-form `phaseDir`.
2. Validate that the resolved `queuePath(phaseDir)` stays under a known root
   (`mainRepoRoot/.planning/phases/`) before reading or writing.

(1) is the safer refactor and aligns with the dispatch/fanIn shape that
already carries `phaseNumber`.

---

### WR-06: `appendIncomplete` does not enforce uniqueness, so a duplicate fanIn-after-failure run double-enqueues the same `merge-in-tree-conflict` entry

**File:** `sdk/src/vcs/jj/parallel.ts:413-424` + `incomplete-work.ts:55-58`
**Issue:**
On the in-tree-conflict branch, fanIn appends an `IncompleteWorkEntry`
unconditionally. If the user re-runs `fanIn` after observing the conflict
(without first emptying the queue), the file accumulates duplicate
entries. The D-14 phase-merge gate doesn't care about duplicates (it only
checks length), so this is a UX defect rather than a correctness defect —
but the human reviewer reading `incomplete-work.md` now sees N identical
entries and has no signal which one is "current".

Mitigation by the contract test: each scenario is fresh-tmpdir, so the
duplicate path is invisible in CI. Production callers (and the iterative
"resolve conflicts then re-attempt" workflow the queue is designed for) hit
it routinely.

**Fix:**
In `appendIncomplete`, read the file first, drop any entry whose
`(subagentName, changeIdShort)` tuple matches the new one, then write the
deduplicated tail. Or document the dedup responsibility as the caller's and
move it into `performJjParallelFanIn`.

---

### WR-07: `performJjParallelFanIn` reads `currentHeads` from `workspace list` but does not detect when the SAME workspace name returns multiple records (divergent op_log state)

**File:** `sdk/src/vcs/jj/parallel.ts:341-344`
**Issue:**
```ts
const currentHeads = new Map<string, string>();
for (const entry of parseJjWorkspaceList(wsListRes.stdout)) {
  currentHeads.set(entry.path, entry.rev);
}
```
`parseJjWorkspaceList` may emit multiple records for the same `path`
(workspace name) — concurrent op_log updates, stale workspace records, or
the divergent-bookmark adjacent case. The current loop silently last-wins,
which feeds whatever the parser saw last into the merge target. The reaped
path at lines 510-522 inherits the same map.

The N-parent merge then merges the "wrong" head for that workspace — a
latent correctness gap if the underlying jj state has any drift.

**Fix:**
Detect duplicates and surface them:
```ts
for (const entry of parseJjWorkspaceList(wsListRes.stdout)) {
  if (currentHeads.has(entry.path)) {
    throw new Error(`parallel.fanIn: workspace "${entry.path}" appears multiple times in jj workspace list`);
  }
  currentHeads.set(entry.path, entry.rev);
}
```

---

### WR-08: in-tree-conflict path leaves agent bookmarks alive; subsequent fanIn re-run on the same handle (after the user resolves) re-attempts the batched delete on already-current names — fine for the names, but the merge change_id has changed

**File:** `sdk/src/vcs/jj/parallel.ts:413-494`
**Issue:**
On the conflicted path the function returns without advancing main and
without deleting agent bookmarks (correct per design). But the function
also offers no resumption protocol — there's no way to ask "given this
handle and the agents you already reaped, retry the clean-path advance
against the *current* `@`". A caller who resolves the conflicts manually
and re-runs `fanIn(handle, results)` ends up rebuilding the N-parent merge
on top of an already-merged tree.

Not a security defect; a workflow correctness defect. The crashed-agent
reap path (lines 509-533) has the same shape — `performJjReap` is called
fresh each fanIn invocation and will re-classify workspaces whose state
has changed since last call.

**Fix:**
Document the "fanIn is once-per-dispatch" contract loudly in the JSDoc and
either:
1. Add a `state` field on `FanInResult` that includes a resumption hint
   (`'conflicted-await-resolution' | 'crashed-await-reap' | 'clean'`).
2. Have fanIn early-return when the merge change_id already exists at a
   detectable state (e.g. main bookmark already at `@`).

Either path lets the caller distinguish "first call" from "retry".

---

## Info

### IN-01: dead-code import — `enumerateConflictedPaths` imported into `backends/jj.ts` as `_enumerateConflictedPaths` is not referenced after the sidecar lift

**File:** `sdk/src/vcs/backends/jj.ts:36`
**Issue:**
```ts
import { enumerateConflictedPaths as _enumerateConflictedPaths } from '../jj/conflict-paths.js';
```
The leading underscore signals an intentionally-unused binding (TypeScript
convention to silence the noUnusedLocals check). After UPSTREAM-02 lifted
the helper out, `backends/jj.ts` no longer consumes it directly — the only
consumers are `jj/reap.ts` and `jj/parallel.ts`. The import is dead weight
on the module graph.

**Fix:** Remove the import.

---

### IN-02: `parallel.ts::resolveChangeId` and `octopus.ts::resolveChangeId` are byte-identical duplicates; the inline `jjArgvFlags` is triply duplicated across `octopus.ts`, `reap.ts`, `conflict-paths.ts`, and `parallel.ts`

**File:** `sdk/src/vcs/jj/parallel.ts:60-80`, `octopus.ts:45-66`, `reap.ts:40-42`, `conflict-paths.ts:28-30`
**Issue:**
UPSTREAM-02 sidecar discipline forbids importing from `backends/jj.ts`,
which justifies inlining the flag prefix once. It does NOT justify
inlining it FOUR times — a shared `sdk/src/vcs/jj/_shared.ts` (or
`sdk/src/vcs/jj-flags.ts` outside the sidecar boundary) would satisfy
UPSTREAM-02 (no `from '../backends/jj'`) while collapsing the duplication.

`resolveChangeId` is in the same boat — same body, two copies.

**Fix:** Extract `jjArgvFlags` and `resolveChangeId` into a sidecar-internal
module (`sdk/src/vcs/jj/_shared.ts`). Re-import from all four files.

---

### IN-03: `validateAgentBookmarkName` is dead-code on the cold path — the bookmark name is constructed from validated `phaseTag` + `idx` literals, so the regex can never fail at the callsite

**File:** `sdk/src/vcs/jj/parallel.ts:108-114,228-236,452-457`
**Issue:**
The bookmark name shape `gsd/phase-${phaseTag}-subagent-${idx}` is built
in-place from two integers (already padded / iteration-bounded). The
validator at line 109 can only fail if someone modifies the construction
expression itself. The JSDoc at lines 105-107 acknowledges this:

> caller-supplied strings never reach this regex without first being
> constructed from validated phase + idx pairs

This is fine as defense-in-depth, but the cost is two extra exec-style
checks per dispatch + N fanIn. Document as `// defense-in-depth` or move
behind a debug-only assertion macro.

**Fix:** Add a `// defense-in-depth — name is constructed from typed
literals; this only catches future drift in the construction expression`
comment at each callsite. No behavior change.

---

### IN-04: error messages for "octopus had a conflict" include the FULL `conflictedPaths` joined into the error string, which can be unbounded

**File:** `sdk/src/vcs/jj/reap.ts:217-223`
**Issue:**
```ts
throw new Error(
  `reap: in-tree-conflict squash for ${entry.name} failed `
    + `(conflictedPaths=${conflictedPaths.join(',')}): `
    + `${squashRes.stderr || squashRes.stdout}`,
);
```
For a phase-merge with hundreds of conflicted paths (large rebase across a
significant phase), this error message is megabytes long. Stack-trace
collectors / log aggregators don't love that.

**Fix:** Cap the joined list at 10 entries with a `+N more` suffix:
```ts
const pathSummary = conflictedPaths.length > 10
  ? conflictedPaths.slice(0, 10).join(',') + `,+${conflictedPaths.length - 10} more`
  : conflictedPaths.join(',');
```

---

_Reviewed: 2026-05-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
