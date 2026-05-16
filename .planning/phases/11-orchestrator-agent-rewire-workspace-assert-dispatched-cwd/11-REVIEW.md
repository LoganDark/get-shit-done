---
phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd
reviewed: 2026-05-16T11:32:51Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - agents/gsd-executor.md
  - docs/INVENTORY-MANIFEST.json
  - docs/INVENTORY.md
  - docs/test-triage/jj-bugs.md
  - get-shit-done/bin/gsd-tools.cjs
  - get-shit-done/bin/lib/command-aliases.generated.cjs
  - get-shit-done/bin/lib/worktree-safety.cjs
  - get-shit-done/references/dispatch-cwd-safety.md
  - get-shit-done/workflows/execute-phase.md
  - get-shit-done/workflows/quick.md
  - sdk/src/query/command-aliases.generated.ts
  - sdk/src/query/command-manifest.non-family.ts
  - sdk/src/query/command-static-catalog-domain.ts
  - sdk/src/query/workspace-assert-dispatched-cwd.ts
  - sdk/src/query/workspace-parallel-dispatch.ts
  - sdk/src/query/workspace-parallel-fan-in.ts
  - sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts
  - sdk/src/vcs/jj/parallel.ts
  - tests/bug-3097-3099-executor-worktree-path-safety.test.cjs
  - tests/bug-3384-worktree-cleanup-manifest.test.cjs
  - tests/wave-cleanup-executor.test.cjs
findings:
  critical: 4
  warning: 5
  info: 3
  total: 12
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-05-16T11:32:51Z
**Depth:** standard
**Files Reviewed:** 19 (note: `files_reviewed_list` carries 21 — three extras are sibling files that surfaced cross-reference issues but were not configured)
**Status:** issues_found

## Summary

Phase 11 rewires the orchestrator and gsd-executor agent to consume a single
backend-opaque `workspace.assert-dispatched-cwd` verb plus the new
`workspace.parallel.{dispatch,fan-in}` primitives, replacing four worktree-aware
guards and the on-disk `WAVE_WORKTREE_MANIFEST` sidecar. The headline goal is
worth pursuing, but the assembled implementation has several correctness gaps
that cluster around three areas: (1) the dispatched-cwd verb is silently broken
on the jj backend because the resolver assumes `WorkspaceInfo.path` is an fs
path while jj's parser populates that field with the workspace NAME, (2) the
quick.md dispatch site passes a malformed plan shape AND a non-numeric phase
that the dispatch verb rejects without surfacing the failure, and (3) the
agent prompt's hard-exit recovery instruction is too aggressive for the
single failure mode it now covers, with no escape hatch for transient races.

The migration also retired infrastructure (worktree.cleanup-wave alias,
WAVE_WORKTREE_MANIFEST sidecar) without removing every stale reference, which
will mislead future readers.

The SDK-level pieces (workspace-parallel-dispatch.ts, workspace-parallel-fan-in.ts,
jj/parallel.ts) look sound modulo the cross-cutting `WorkspaceInfo.path`
ambiguity. The tests carry the regression INTENT cleanly across the verb
collapse, but the new shape's `ok:true` semantics with `incompleteQueued > 0`
deserves explicit caller documentation that isn't present.

## Critical Issues

### CR-01: workspace.assert-dispatched-cwd is broken on jj backend (returns ok:false unconditionally)

**File:** `sdk/src/query/workspace-assert-dispatched-cwd.ts:57`
**Issue:** The cwd-match loop calls `safeRealpath(entries[i].path)` and compares
it to `safeRealpath(cwd)`. On the jj backend, `parseJjWorkspaceList` populates
`WorkspaceInfo.path` from `record.name` (see `sdk/src/vcs/parse/jj-workspace-list.ts:50`
— `path: record.name ?? ''`), NOT from an fs path. The Phase 11 test
`cmd-parallel-jj.test.ts:193-197` even acknowledges this asymmetry explicitly:
> "Filter matches the octopus.ts:300 workspace-name shape `phase-${phaseTag}-subagent-{idx}`
> (parseJjWorkspaceList projects jj's `name` field into `WorkspaceInfo.path`, so `path`
> is the workspace NAME not an fs path)."

So when this verb runs in a jj-colocated checkout, `safeRealpath(entry.path)`
will be called on values like `"default"` or `"phase-11-subagent-1"`. These
either resolve to `null` (no such file) or — if the workspace name coincidentally
matches a relative path in the agent's cwd — produce a spurious match. The
verb's documented contract ("Backend-opaque: the body uses `vcs.workspace.list()`
only" at line 13) is violated by the implementation's fs-path assumption.

**Net effect:** Every agent commit on the jj backend halts with
`FATAL: cwd is not a dispatched subagent workspace` because `matchedIndex` stays
at `-1` and `ok` is `false`. The whole Phase 11 collapse is non-functional on
the jj backend.

**Fix:** Narrow on `vcs.kind` and dispatch on backend semantics, or have the
adapter expose a separate `WorkspaceInfo.workspacePath` (absolute fs path) that
is guaranteed across backends:
```ts
// Option A — narrow on backend kind:
const vcs = createVcsAdapter(cwd);
const entries = vcs.workspace.list();
if (vcs.kind === 'jj') {
  // jj WorkspaceInfo.path is a NAME. Compare cwd against the workspace's
  // working-copy fs root via `jj workspace root --workspace <name>` (or whatever
  // capability the adapter exposes). Realpath comparison is the wrong primitive.
} else {
  // git: WorkspaceInfo.path is an fs path; current logic is correct.
}
```
Until this fix lands, the verb (and therefore the entire phase) is git-only.

---

### CR-02: quick.md dispatch passes wrong plan shape AND non-numeric phase, but FATAL guard misses both

**File:** `get-shit-done/workflows/quick.md:670-675`
**Issue:** Two compounding defects:

1. **Plan shape mismatch.** Lines 670-672 build:
   ```bash
   QUICK_PLAN_JSON=$(jq -nc --arg pid "${quick_id}" --arg pfile "${QUICK_DIR}/${quick_id}-PLAN.md" \
     '{plans:[{id:$pid,planFile:$pfile}]}')
   ```
   But `workspace-parallel-dispatch.ts:73` declares the plan input as
   `readonly { agentId: string; planId: string; workspacePath?: string }[]` and
   `JSON.parse(planText)` directly. The shipped shape wraps the array in
   `{plans: [...]}` AND uses `id`/`planFile` instead of `agentId`/`planId`. The
   `JSON.parse` succeeds but the adapter's `vcs.workspace.parallel.dispatch`
   downstream will iterate `plan` as an OBJECT (not an array) or treat
   `{plans:[…]}.agentId` as undefined when it indexes by name. Behavior on the
   jj backend, where `performJjParallelDispatch` does `for (const item of plan)`
   (jj/parallel.ts:175) and then calls `validateAgentId(item.agentId)` —
   `validateAgentId(undefined)` throws via the `/^[A-Za-z0-9._/-]+$/` regex on
   a non-string. Behavior on git backend likely diverges similarly.

2. **Non-numeric phase.** Line 674 passes `--phase "quick"`. The verb does
   `phaseNumber = Number(args[++i])` (workspace-parallel-dispatch.ts:53), so
   `Number("quick") === NaN`, and the handler returns
   `{ ok: false, reason: 'phase_number_required' }`. `HANDLE_JSON` is then the
   string `'{"ok":false,"reason":"phase_number_required"}'` — non-empty — so
   the `-z "$HANDLE_JSON"` FATAL check at line 675 passes silently. The
   downstream `jq -r '.workspaces[]'` iteration produces zero entries; the
   executor Agent() never spawns, the fan-in step at line 753-757 finds
   `MERGED_COUNT=0`, and quick mode reports success while having dispatched
   nothing.

**Fix:**
```bash
# Pass a valid plan array (agentId/planId, not id/planFile):
QUICK_PLAN_JSON=$(jq -nc --arg aid "${quick_id}" --arg pid "${quick_id}" \
  '[{agentId:$aid, planId:$pid}]')

# Use a numeric phase. Quick tasks don't have a phase number; pick a sentinel
# (e.g. 0 or 999) and document it in command-manifest, OR change the verb to
# accept non-numeric phase tags. Currently the only safe choice is numeric:
HANDLE_JSON=$(printf '%s' "$QUICK_PLAN_JSON" \
  | gsd-sdk query workspace.parallel.dispatch \
      --phase 0 --main-bookmark "$EXPECTED_BRANCH" --plan @-)

# Defend against silent reason-payload responses, not just empty stdout:
HANDLE_OK=$(echo "$HANDLE_JSON" | jq -r '.ok // "true"')
[ "$HANDLE_OK" = "false" ] && {
  echo "FATAL: workspace.parallel.dispatch failed: $(echo "$HANDLE_JSON" | jq -r '.reason // \"unknown\"')" >&2
  exit 1
}
```

---

### CR-03: `validateMainBookmark` rejects every value `--main-bookmark` ever receives in quick.md

**File:** `sdk/src/vcs/jj/parallel.ts:116-126`, `get-shit-done/workflows/quick.md:668,674`
**Issue:** Quick.md line 668 sets
`EXPECTED_BRANCH=$(gsd-sdk query current-branch --cwd . --pick branch)` and then
passes that as `--main-bookmark "$EXPECTED_BRANCH"`. On a fresh quick-task
branch the value is `quick-<id>-<slug>` (e.g. `quick-260516-abc-foo-bar`).
That passes the regex `/^[A-Za-z0-9._/-]+$/` only because the chosen char class
is generous; however the validator's "must not start with a hyphen" rule (line
121) is the actual exposed surface — and a freshly-detached HEAD returns
`"HEAD"` or sometimes an empty string from `current-branch` depending on
backend. If `EXPECTED_BRANCH` is empty, `validateMainBookmark('')` throws
`main bookmark name "" is not a valid jj bookmark refname` from inside
`performJjParallelDispatch`, surfaced to the user as a stack trace instead of a
clean recovery path.

Worse, the executor never checks for empty/HEAD BEFORE invoking the verb:
```bash
EXPECTED_BRANCH=$(gsd-sdk query current-branch --cwd . --pick branch)
# No empty check, no HEAD check — straight into dispatch.
HANDLE_JSON=$(printf '%s' "$QUICK_PLAN_JSON" \
  | gsd-sdk query workspace.parallel.dispatch \
      --phase "quick" --main-bookmark "$EXPECTED_BRANCH" --plan @-)
```

**Fix:** Guard the orchestrator before invoking dispatch:
```bash
EXPECTED_BRANCH=$(gsd-sdk query current-branch --cwd . --pick branch)
if [ -z "$EXPECTED_BRANCH" ] || [ "$EXPECTED_BRANCH" = "HEAD" ]; then
  echo "FATAL: cannot dispatch parallel workspace from detached HEAD or empty branch (got: '$EXPECTED_BRANCH'). Check out a named branch first." >&2
  exit 1
fi
```
Same guard applies symmetrically in `execute-phase.md:530-534`.

---

### CR-04: Agent prompt's `exit 1` recovery instruction is unrecoverable for transient races

**File:** `agents/gsd-executor.md:417-428`
**Issue:** When the verb returns `ok:false`, the agent runs `exit 1`. There is
no retry, no re-resolve, no diagnostic dump. But the failure mode includes
non-deterministic conditions:

- A late-arriving filesystem event (workspace dir was just created; first call
  hits the race window before `vcs.workspace.list()` sees the new entry).
- Backend-level eventual consistency in jj's `workspace list` output after a
  recent `jj workspace add` (the dispatch+fan-in tests at
  cmd-parallel-jj.test.ts:194 work around this with intentionally-isolated
  describes; the orchestrator hands these workspaces to the agent immediately).
- The CR-01 jj-backend brokenness above — agents will hard-exit even though
  they are legitimately in the right place.

Combined with CR-01, EVERY jj-backend agent invocation today hits this exit-1
path with no diagnostic surfaced to the user beyond
`isPrimary=false, workspaceName=<unknown>` — which doesn't explain WHY (the cwd
wasn't found at all, vs. landed on the primary, vs. backend type-mismatch).

**Fix:** Make the recovery path informative AND let the agent emit the full
verb payload so the orchestrator can drive recovery:
```bash
DISPATCH_CHECK=$(gsd-sdk query workspace.assert-dispatched-cwd --cwd .)
OK=$(echo "$DISPATCH_CHECK" | jq -r '.ok')
if [ "$OK" != "true" ]; then
  IS_PRIMARY=$(echo "$DISPATCH_CHECK" | jq -r '.isPrimary')
  WS_NAME=$(echo "$DISPATCH_CHECK" | jq -r '.workspaceName // "<no-match>"')
  WS_PATH=$(echo "$DISPATCH_CHECK" | jq -r '.workspacePath // "<no-match>"')
  CUR_CWD=$(pwd)
  echo "FATAL: cwd is not a dispatched subagent workspace." >&2
  echo "  cwd:           $CUR_CWD" >&2
  echo "  isPrimary:     $IS_PRIMARY" >&2
  echo "  workspaceName: $WS_NAME" >&2
  echo "  workspacePath: $WS_PATH" >&2
  echo "  verb payload:  $DISPATCH_CHECK" >&2
  echo "RECOVERY: cd into the workspace path the orchestrator passed to this Agent() invocation." >&2
  exit 1
fi
```
This is the minimum diagnostic surface — without it, CR-01-style backend bugs
are impossible to triage from the field.

## Warnings

### WR-01: `WAVE_WORKTREE_MANIFEST` allegedly retired but `jj/parallel.ts` still writes it (and so does the legacy back-compat path)

**File:** `sdk/src/vcs/jj/parallel.ts:227-245`, `get-shit-done/bin/lib/worktree-safety.cjs:404-421`
**Issue:** Phase 11 D-01 declares
"WAVE_WORKTREE_MANIFEST sidecar is being eliminated; the `ParallelDispatchHandle.workspaces[]`
field is the source of truth" (see jj-bugs.md row for bug-3384 + Plan 03 D-01).
But `performJjParallelDispatch` at jj/parallel.ts:232 still does:
```ts
const manifestDir = mkdtempSync(join(tmpdir(), 'gsd-wave-manifest-'));
const manifestPath = join(manifestDir, 'wave-worktree-manifest.json');
…
writeFileSync(manifestPath, JSON.stringify(manifestBody, null, 2), 'utf-8');
```
and stores `manifest: manifestPath` on the returned handle (line 254). The
on-disk file is now an orphan: no consumer in the new fan-in path reads it
(`worktree-safety.cjs:411` even sets `manifest: ''` on the reconstructed handle
because "legacy callers had no manifest file path on disk"). Every dispatch
leaks one tmpdir on jj backend, and the user's mental model of "D-01 retired
the sidecar" is contradicted by the actual write.

**Fix:** Either (a) remove the write entirely and set
`manifest: ''` in `performJjParallelDispatch` for parity with the legacy adapter,
or (b) explicitly tag the write as "diagnostic-only, not consumed" with a
matching cleanup hook. Pick one and document it in the doc-string above the
function (current docstring at line 23 still says "writes the extended
WAVE_WORKTREE_MANIFEST with `plan_id` + `backend` (VCS-19)" as if it's the
contract).

---

### WR-02: `executeWorktreeWaveCleanupPlan` returns `ok: true` even when `incompleteQueued > 0`

**File:** `get-shit-done/bin/lib/worktree-safety.cjs:489`
**Issue:** The `ok` derivation excludes `incompleteQueued`:
```js
ok: fanIn.conflicted === false && (fanIn.failedReaped || []).length === 0,
```
But the new pending taxonomy explicitly carries `incomplete_queued` entries
(line 474-476), and the `tests/wave-cleanup-executor.test.cjs:189-193` test
locks in `ok:true` when `incompleteQueued:3` — i.e. the orchestrator believes
the wave succeeded while three agents are queued for follow-up. The intent may
be "incomplete is a retry hint, not a failure" — but downstream
`execute-phase.md:782` reads `r.ok` to decide whether to commit tracking
updates and advance ROADMAP. Marking a phase ROADMAP-complete with queued
incomplete agents will surface as silent data loss when nobody runs the retry.

**Fix:** Either flip the semantics (incompleteQueued > 0 → ok=false) AND adjust
the test, OR introduce a separate `requiresFollowup: boolean` field on the
result and have orchestrator gate roadmap updates on
`r.ok && !r.requiresFollowup`. Whichever choice, document it on the public API
because the current tests pin contradicting intuitions ("ok=true" + "pending
non-empty").

---

### WR-03: Agent prompt cites a SDK comment as authority for the test path that no longer matches

**File:** `agents/gsd-executor.md:419`
**Issue:** The prompt body claims:
> "The SDK verb resolves cwd against `vcs.workspace.list()` and returns the
> workspace match + `isPrimary` flag in one call — collapsing the former
> HEAD-on-protected-ref / cwd-drift / abs-path / namespace-regex guards into a
> single backend-opaque precondition check."

This is the public-facing rationale users read when they look up the protocol.
But "backend-opaque" is contradicted by CR-01 — the verb is in fact
git-backend-only today. A user troubleshooting a jj-side hard-exit will read
this paragraph, conclude their setup is wrong, and waste time. The
documentation should either name the gap or stop claiming backend-opacity until
CR-01 is fixed.

**Fix:** Tighten the wording to match reality:
```markdown
The SDK verb resolves cwd against `vcs.workspace.list()` and returns the
workspace match + `isPrimary` flag in one call. On git backends this collapses
the former HEAD-on-protected-ref / cwd-drift / abs-path / namespace-regex
guards into a single precondition check. On jj backends the verb's resolver
is currently not implemented (see Phase 12 follow-up) — agents on jj must
fall back to the per-shell-call `jj workspace root` probe.
```
(Once CR-01 lands, this caveat goes away.)

---

### WR-04: gsd-tools.cjs `worktree` dispatch claims retirement but still exists as a dispatcher target

**File:** `get-shit-done/bin/gsd-tools.cjs:985-993`
**Issue:** The `worktree` case fires
`error('worktree cleanup-wave is retired (Phase 11 D-05). Use `gsd-sdk query workspace.parallel.fan-in` instead.')`,
which is correct as a deprecation. But:

1. The default case (line 1201-1218) does NOT route via the same error path,
   so `gsd-tools worktree somethingelse` produces the SAME generic
   "Unknown command" message that any other unknown command would. The
   targeted deprecation is bypassed for any subcommand other than
   `cleanup-wave` (which the case doesn't actually parse — it ignores
   `args[1]` entirely).
2. The `SKIP_ROOT_RESOLUTION` set at line 418-422 includes `'worktree'`,
   meaning the deprecation-error path is reachable WITHOUT a `.planning/`
   directory. That's fine but inconsistent with adjacent retired surfaces.

**Fix:** Either parse `args[1]` and surface a targeted error for any retired
`worktree.*` subcommand, or remove the case entirely so it falls through to
the default and the user sees the unified "Unknown command" suggestion path.

---

### WR-05: `derivePhaseRoot` returns a non-existent path on miss, and callers don't `mkdir -p` it

**File:** `sdk/src/vcs/jj/parallel.ts:139-147`
**Issue:** The docstring says: "Returns an absolute path even when the dir does
not exist (callers `appendIncomplete` create the queue file lazily; `mkdir -p`
is the caller's responsibility if the parent doesn't exist)."

But `appendIncomplete` (per the test fixture at
cmd-parallel-jj.test.ts:84 which materializes the dir before the test) is the
only consumer that writes the queue file. If `appendIncomplete` does NOT do
`mkdir -p` internally (the import is from `./incomplete-work.js` — not in
review scope), then a failure in dispatch followed by a fan-in
conflict-enqueue will throw an ENOENT inside the SDK with no actionable
diagnostic. The test sidesteps this by `mkdirSync(..., { recursive: true })`
in `setupJjRepo` (line 84) but production callers don't.

**Fix:** Make `derivePhaseRoot` either (a) always return an existing path
(creating with `mkdir -p` as a side effect — documented), or (b) guarantee
`appendIncomplete` does `mkdir -p` on its parent before write. Right now the
contract is split between functions and depends on the caller knowing to call
`mkdir -p` before `fanIn`, which the orchestrator does not.

## Info

### IN-01: Manifest mtime / file format inconsistency in `worktree-safety.cjs`

**File:** `get-shit-done/bin/lib/worktree-safety.cjs:404-421`
**Issue:** `reconstructHandleFromLegacyPlan` does `Object.freeze` on the outer
handle and inner workspace array, but does NOT freeze the per-workspace entry
objects (line 413: `workspaces: Object.freeze(entries.map((e, i) => Object.freeze({...})))` —
this DOES freeze the inner — actually re-reading, it does. False alarm on
freeze. The actual issue: each inner workspace gets
`baselineOpId: undefined`. The handle JSON shape consumed by tests expects this
field to be present, but if downstream code does `JSON.stringify(handle)` and
then `JSON.parse`, `undefined` fields drop entirely. If a consumer later
narrows on `'baselineOpId' in handle.workspaces[0]`, the post-roundtrip handle
fails that check. Doesn't fire today (no current consumer narrows), but it's a
forward-compat trap.

**Fix:** Either include `baselineOpId: null` explicitly, or drop the
forward-compat reservation and document that the field is reserved for future use:
```js
baselineOpId: null,  // reserved for Phase 12 (opId pinning); always null on legacy reconstruct
```

---

### IN-02: Top-level `TOP_LEVEL_USAGE` enumeration omits new workspace surface

**File:** `get-shit-done/bin/gsd-tools.cjs:368-376`
**Issue:** The usage string enumerates commands for `--help` output but the
list at lines 369-376 does not include `workspace`, `workspace.parallel.dispatch`,
or `workspace.parallel.fan-in` (these are SDK-side verbs only, but the CJS
shim is still the legacy fallback path documented for shell scripts per the
file's `@deprecated` header). The retirement of `worktree cleanup-wave` is
inconsistent here — users reading `gsd-tools --help` see neither the retired
surface (good) nor the new one (bad).

**Fix:** Append a note pointing readers to the SDK CLI for workspace-parallel
verbs:
```
'\n\nWorkspace-parallel operations (dispatch, fan-in, assert-dispatched-cwd) ' +
'are SDK-only — use `gsd-sdk query workspace.*` directly.'
```

---

### IN-03: `command-aliases.generated.cjs` and `command-aliases.generated.ts` carry inconsistent banner conventions

**File:** `get-shit-done/bin/lib/command-aliases.generated.cjs:1-6`, `sdk/src/query/command-aliases.generated.ts:1-4`
**Issue:** Both files declare `GENERATED FILE — …` but the CJS variant lists
"phase, phases, validate, roadmap" in the banner while the TS variant lists
the same family set. The two are kept in sync today; a future generator change
that updates only one banner will produce drift that is hard to notice because
the file content is otherwise machine-generated. No bug today; flagging for
maintenance hygiene.

**Fix:** Generate the banner from the same source-of-truth list that produces
the export arrays so the banner and content cannot diverge.

---

_Reviewed: 2026-05-16T11:32:51Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
