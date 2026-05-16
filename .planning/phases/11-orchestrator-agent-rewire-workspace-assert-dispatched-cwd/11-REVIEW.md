---
phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd
reviewed: 2026-05-16T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - agents/gsd-executor.md
  - get-shit-done/bin/gsd-tools.cjs
  - get-shit-done/bin/lib/worktree-safety.cjs
  - get-shit-done/references/dispatch-cwd-safety.md
  - get-shit-done/workflows/execute-phase.md
  - get-shit-done/workflows/quick.md
  - sdk/src/query/workspace-assert-dispatched-cwd.ts
  - sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts
  - sdk/src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts
  - sdk/src/vcs/jj/parallel.ts
  - tests/jj-parallel-no-manifest-write.test.cjs
  - tests/quick-md-parallel-dispatch.test.cjs
  - tests/wave-cleanup-executor.test.cjs
findings:
  critical: 2
  blocker: 2
  warning: 5
  info: 3
  total: 12
status: issues_found
---

# Phase 11: Code Review Report (Re-review of 11-07/08/09 gap-closure)

**Reviewed:** 2026-05-16
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

This re-review covers the delta from plans 11-07/08/09 — the three gap-closure
plans the verifier surfaced after the first pass. Each prior BLOCKER landed
fixes that are now exercised by new regression tests:

- **CR-01 (jj-side dispatched-cwd resolver)** — closed: workspace-assert-dispatched-cwd.ts
  now branches on `vcs.kind === 'jj'` and resolves workspace name → fs path via
  `jj workspace root --name`. Test cmd-workspace-assert-dispatched-cwd.test.ts
  pins all three jj scenarios plus a git parity check.
- **CR-02 (quick.md dispatch shape)** — closed: quick.md now emits a flat array
  with `{agentId, planId}`, passes a numeric `--phase 0` sentinel, and the
  `HANDLE_OK` guard catches `{ok:false}` payloads. tests/quick-md-parallel-dispatch.test.cjs
  pins all three sub-invariants.
- **CR-03 (EXPECTED_BRANCH empty/HEAD pre-check)** — closed in BOTH quick.md
  and execute-phase.md with byte-identical FATAL message. Drift guard test
  asserts the message-line equality.
- **CR-04 (diagnostic dump)** — closed in gsd-executor.md: payload, `$PWD`, and
  repo-root probe are now dumped on FATAL.
- **WR-01 (no-manifest-write invariant)** — closed: jj/parallel.ts emits
  `manifest: ''` and contains no `mkdtempSync(... 'gsd-wave-manifest' ...)` or
  `writeFileSync(... 'wave-worktree-manifest' ...)` tokens.
- **WR-02 (incompleteQueued > 0 → ok=false)** — closed in worktree-safety.cjs
  `executeWorktreeWaveCleanupPlan`; tests/wave-cleanup-executor.test.cjs pins
  the new gate.

However, the delta introduces TWO new BLOCKERs in execute-phase.md that the
regression suite does NOT catch (the tests assert byte-shape symmetry between
quick.md and execute-phase.md, but not the SHELL VARIABLE definitions inside
each), plus several drift items between the new docstrings and the actual
code path. These need to land before phase 11 is verifiable end-to-end.

## Structural Findings (fallow)

No `<structural_findings>` block was supplied for this re-review. All findings
below are narrative.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: `execute-phase.md` dispatch references undefined `$WAVE_WORKTREE_PLANS_JSON` — every parallel dispatch will fail [BLOCKER]

**File:** `get-shit-done/workflows/execute-phase.md:536-538`
**Issue:** The dispatch block reads:
```bash
HANDLE_JSON=$(printf '%s' "$WAVE_WORKTREE_PLANS_JSON" \
  | gsd-sdk query workspace.parallel.dispatch \
      --phase "{phase_number}" --main-bookmark "$EXPECTED_BRANCH" --plan @-)
```

`$WAVE_WORKTREE_PLANS_JSON` is **never defined** anywhere in
`execute-phase.md` or in `execute-phase/steps/per-plan-worktree-gate.md`. The
per-plan gate (`steps/per-plan-worktree-gate.md:94`) only appends to a
`WAVE_WORKTREE_PLANS` accumulator (plan-id list used as a non-empty check at
:768 and :817). Confirmed by `grep -rn 'WAVE_WORKTREE_PLANS_JSON'` returning
exactly one hit — the use site.

At runtime, bash expands `$WAVE_WORKTREE_PLANS_JSON` to the empty string; the
SDK verb tries `JSON.parse('')` → throws → returns
`{ok:false, reason:'plan_json_parse_failed', error:'Unexpected end of JSON…'}`.
The HANDLE_OK guard at :540-541 catches this and prints `FATAL: workspace.parallel.dispatch
failed: {ok:false, reason:'plan_json_parse_failed', …}` — so users see a clean
error, but the workflow's parallel-execution path is unconditionally broken.

This is the SDK-equivalent of the quick.md CR-02 sub-defect 1 that Plan 11-08
closed. Plan 11-08's scope was quick.md; the same defect lives in
execute-phase.md and was not addressed.

**Fix:** Construct the plan JSON array before the dispatch:
```bash
# Build the plan input from WAVE_WORKTREE_PLANS (the plan-id list step 2.5 produced).
# Each entry needs {agentId, planId}; quick mode uses identical agentId/planId
# but execute-phase wants distinct values per plan in the wave.
WAVE_WORKTREE_PLANS_JSON=$(printf '%s\n' $WAVE_WORKTREE_PLANS \
  | jq -R . | jq -sc 'map({agentId: ., planId: .})')

HANDLE_JSON=$(printf '%s' "$WAVE_WORKTREE_PLANS_JSON" \
  | gsd-sdk query workspace.parallel.dispatch \
      --phase "${PHASE_NUMBER}" --main-bookmark "$EXPECTED_BRANCH" --plan @-)
```

A regression test parallel to `tests/quick-md-parallel-dispatch.test.cjs`
should assert `execute-phase.md` contains a construction of
`WAVE_WORKTREE_PLANS_JSON` AND that the construction emits a flat array shape.

---

### CR-02: `execute-phase.md` passes literal `"{phase_number}"` to `--phase` — dispatch verb rejects every call [BLOCKER]

**File:** `get-shit-done/workflows/execute-phase.md:538`
**Issue:** The dispatch invocation is:
```bash
gsd-sdk query workspace.parallel.dispatch \
    --phase "{phase_number}" --main-bookmark "$EXPECTED_BRANCH" --plan @-
```

`{phase_number}` is the workflow's **template placeholder** syntax (used
elsewhere in agent prompt literals where the orchestrator substitutes before
spawn — e.g., :565 `description="Execute plan {plan_number} of phase {phase_number}"`).
But this invocation is inside a `bash` code block, where `{phase_number}` is
NOT expanded. Bash sees the literal 12-character string `{phase_number}`.

The dispatch verb does `phaseNumber = Number(args[++i])`
(workspace-parallel-dispatch.ts:53) and `Number("{phase_number}") === NaN`,
so the verb returns `{ok:false, reason:'phase_number_required'}`. As with
CR-01, the HANDLE_OK guard catches this, but the parallel-dispatch path is
non-functional.

Compare against the correctly-formed sibling at quick.md:680
(`--phase 0 --main-bookmark "$EXPECTED_BRANCH"`) and the regression test
tests/quick-md-parallel-dispatch.test.cjs:38 which asserts
`--phase 0[^0-9]` — exactly what's missing on the execute-phase.md side.
tests/quick-md-parallel-dispatch.test.cjs only checks `QUICK` for the
phase-numeric invariant; it does NOT carry over to `EXEC` (the carry-over at
:48-52 only checks the `HANDLE_OK` guard symmetry — not the `--phase` shape).

**Fix:** Use the shell variable directly:
```bash
gsd-sdk query workspace.parallel.dispatch \
    --phase "${PHASE_NUMBER}" --main-bookmark "$EXPECTED_BRANCH" --plan @-
```

Add a regression test that asserts `EXEC` matches `--phase "\$\{PHASE_NUMBER\}"`
(or the equivalent bash-variable form) — the existing tests/quick-md-parallel-dispatch.test.cjs
CR-02 carry-over describe block is the natural place to add it.

---

### CR-03: gsd-executor.md FATAL recovery uses raw `git rev-parse --show-toplevel` — violates "no raw git anywhere in jj-port" project rule

**File:** `agents/gsd-executor.md:431`
**Issue:**
```bash
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || jj workspace root 2>/dev/null || echo "<unresolvable>")
```

Per `CLAUDE.md` and MEMORY entry `project_no_raw_git`: "VCS adapter must cover
read AND write; lint guard is whole-repo default-deny on `git`, not just
mutating verbs; even `git status` perturbs colocated jj state." The diagnostic
dump introduced by Plan 11-07 CR-04 closure runs a raw `git rev-parse` even
when the agent is on a jj backend — `git rev-parse --show-toplevel` will
succeed on a colocated jj checkout (`.git/` exists) and may report a different
"top level" than `jj workspace root` if the agent is inside a non-default jj
workspace whose fs path is NOT under the git toplevel (jj workspaces can be
sibling dirs to the colocated `.git`).

Two concrete problems:
1. The dump may print a misleading REPO_ROOT (the git toplevel) when the
   correct answer for the dispatched workspace is the jj workspace root.
2. The raw `git` invocation is exactly what the project-wide deny-rule
   intends to catch.

**Fix:** Use the SDK as the resolver. Either add a `gsd-sdk query repo-root`
verb if one doesn't exist, or use the existing `workspace.context()` /
`vcs.workspace.list()` data the orchestrator already passes:
```bash
REPO_ROOT=$(gsd-sdk query workspace.list --pick 'workspaces[0].path' 2>/dev/null || echo "<unresolvable>")
```
If no suitable verb exists, the right move is to add one — not to call raw
`git rev-parse` from agent prompts.

This is a CRITICAL (not WARNING) finding because:
- It fires on EVERY FATAL recovery path, which is exactly the surface the
  project rule is most concerned with (debugging confusion + state drift).
- The fix is mechanical; there's no good reason this exists outside the
  pattern the project explicitly forbids.

---

### CR-04: `tests/jj-parallel-no-manifest-write.test.cjs` source-level guard does NOT catch the manifest assignment line — regex too narrow

**File:** `tests/jj-parallel-no-manifest-write.test.cjs:42-50`
**Issue:** The regex `/mkdtempSync\s*\([^)]*gsd-wave-manifest/` requires the
literal substring `gsd-wave-manifest` INSIDE the `mkdtempSync(...)` call. A
future re-introduction that uses a different prefix (e.g.,
`mkdtempSync(join(tmpdir(), 'gsd-handle-'))`) writing a manifest file with
similar content would slip past the guard. Same for the `writeFileSync\s*\([^)]*wave-worktree-manifest`
check — it pins the FILE NAME, not the BEHAVIOR ("don't write sidecar state
to disk").

The stronger invariant Phase 11 D-01 wants is "no orchestrator-managed
sidecar state on disk" — which is *behavioral*, not name-based. The current
test will be silently bypassed by anyone who picks a different filename, and
the docstring claim of "WR-01 closure pinned against future drift" overstates
the test's coverage.

**Fix:** Strengthen the guard to assert no `writeFileSync` AT ALL inside
`performJjParallelDispatch`'s body, or assert that `manifest:` is set to
`''` literal AND `mkdtempSync`/`writeFileSync` are absent from the file
entirely (the file as shipped has zero such calls, so the test would still
pass while catching a broader class of regressions):
```js
assert.doesNotMatch(PARALLEL_TS, /\bmkdtempSync\b/, 'WR-01: no tmpdir creation allowed in jj/parallel.ts');
assert.doesNotMatch(PARALLEL_TS, /\bwriteFileSync\b/, 'WR-01: no disk writes allowed in jj/parallel.ts');
```

## Warnings

### WR-01: dispatch-cwd-safety.md docstring claim "subsumes #2924 protected-ref deny-list" is overstated

**File:** `get-shit-done/references/dispatch-cwd-safety.md:55-61`
**Issue:** The doc claims:
> "Being in a non-primary dispatched workspace means the agent is on the
> per-agent branch the orchestrator created. The workspace-locating predicate
> excludes the primary by construction, and the orchestrator only attaches
> dispatched workspaces to per-agent refs — so the protected-ref deny-list and
> the worktree-agent-* namespace allow-list are both implied."

But the verb (workspace-assert-dispatched-cwd.ts) does NOT inspect the
workspace's HEAD ref or the bookmark/branch attached to the workspace — it
only checks that cwd resolves to a non-primary workspace from
`vcs.workspace.list()`. The "implied" guarantee depends entirely on the
orchestrator never attaching a dispatched workspace to a protected ref. If the
orchestrator (or a future plan extension) ever attaches a dispatched workspace
to `main`/`master`/`develop` (e.g., by accident in a refactor), the verb will
happily return `ok:true` and the agent will commit to the protected ref.

The retired `<worktree_branch_check>` provided this defense IN-DEPTH; the new
verb replaces it with defense by ASSUMPTION. The doc should be honest about
this:
> "The HEAD-on-protected-ref guard is no longer enforced at the agent layer.
> The orchestrator's `workspace.parallel.dispatch` primitive is the single
> entry point that creates dispatched workspaces and is responsible for
> attaching them to per-agent refs only. Any future code path that creates
> a non-primary workspace attached to a protected ref will bypass this guard."

**Fix:** Either tighten the verb to inspect the workspace's attached ref
(narrow on `vcs.kind` and use git's `worktree list --porcelain` `branch`
field / jj's bookmark-on-workspace data) and reject protected refs, OR weaken
the docstring claim to match reality.

---

### WR-02: workspace-assert-dispatched-cwd.ts performs N+1 jj subprocess calls — quadratic in worst case

**File:** `sdk/src/query/workspace-assert-dispatched-cwd.ts:101-114`
**Issue:** The cwd-match loop calls `resolveJjWorkspacePath(cwd, entry.path)`
inside the `for` loop. Each call shells out to `jj workspace root --name <NAME>`.
For N workspaces in `vcs.workspace.list()`, this is N+1 subprocesses (1 for
the list + N for the resolution).

The docstring (`dispatch-cwd-safety.md:80`) annotates this as a Phase 14
watch item. But there's a cheaper construction: `jj workspace list -T 'name
++ "\t" ++ workspace_root ++ "\n"'` could return all paths in ONE call. The
adapter's `parseJjWorkspaceList` already consumes a json template; extending
it (or adding a sibling parser) would collapse N+1 into 1 and make this
verb's latency O(1) in the number of subagents.

Not a correctness bug, but a known-cost issue introduced by the CR-01 closure
that's worth eliminating before high-N waves land.

**Fix:** Extend the jj adapter's `WorkspaceInfo` to carry the fs root as a
distinct field populated at parse-time, then drop the per-entry shell-out.
See `sdk/src/vcs/parse/jj-workspace-list.ts:50` — adding
`fsRoot: record.workspace_root` (or whatever the template field is called)
is a one-line change.

---

### WR-03: gsd-executor.md docstring at line 417 still claims "single backend-opaque precondition check" — now true, but the prior code-review prediction was wrong

**File:** `agents/gsd-executor.md:417`
**Issue:** Minor consistency note. The text says:
> "The SDK verb resolves cwd against `vcs.workspace.list()` and returns the
> workspace match + `isPrimary` flag in one call — collapsing the former
> HEAD-on-protected-ref / cwd-drift / abs-path / namespace-regex guards into
> a single backend-opaque precondition check."

This claim is now ACCURATE after Plan 11-07 CR-01 closure (the verb resolves
names → fs paths on jj). But the prior REVIEW.md WR-03 finding flagged this
exact paragraph as a future trap if CR-01 was ever reopened. Since the verb
is now genuinely backend-opaque, the docstring is correct — but no test pins
the "backend-opaque" property end-to-end. cmd-workspace-assert-dispatched-cwd.test.ts
covers ok/isPrimary for both backends, but doesn't assert symmetry — a future
refactor that reintroduces a `kind === 'git'` early-return would silently
pass both backends' scenarios independently.

**Fix:** Add a property-style assertion in cmd-workspace-assert-dispatched-cwd.test.ts:
"for a non-primary dispatched workspace, the verb's `ok`, `isPrimary`,
`workspacePath` shape is independent of `vcs.kind`." Two fixtures, identical
inputs (a dispatched workspace whose path is the same string), identical
output shape. Pins the backend-opacity invariant the docstring claims.

---

### WR-04: `executeWorktreeWaveCleanupPlan` `ok` gate uses repeated boolean expression — drift risk

**File:** `get-shit-done/bin/lib/worktree-safety.cjs:485-491`
**Issue:** The same compound boolean
`fanIn.conflicted === false && (fanIn.failedReaped || []).length === 0 && (fanIn.incompleteQueued || 0) === 0`
appears twice in close proximity:
1. Line 485-486: per-entry `ok` field (inside `processedFromHandle.map`).
2. Line 490-491: outer return-level `ok` field.

Both are derived from the same `fanIn` object and therefore must stay
identical, but they're duplicated literal code. A future change to one (e.g.,
introducing a 4th failure mode like `surplusBookmarks.length > 0`) will
easily miss the other and produce inconsistent shape (`r.ok === true` while
`r.entries.every(e => e.ok === false)`).

**Fix:** Extract the predicate into a local:
```js
const cleanFanIn = fanIn.conflicted === false
  && (fanIn.failedReaped || []).length === 0
  && (fanIn.incompleteQueued || 0) === 0;
// then both sites use `ok: cleanFanIn`.
```

---

### WR-05: `tests/wave-cleanup-executor.test.cjs` does not cover combined `conflicted: true` AND `failedReaped.length > 0` scenario

**File:** `tests/wave-cleanup-executor.test.cjs:60-220`
**Issue:** The test fixtures cover each FanInResult failure mode in isolation:
- clean fanIn (line 60)
- merge-conflict only (line 101)
- failed-reap only (line 138)
- incomplete-queued only (line 168)
- adapter throw (line 199)

But not the combined cases — `conflicted: true` AND `failedReaped: ['a1']` (a
realistic outcome when one agent crashed with uncommitted work AND the
remaining clean agents' octopus also has an in-tree conflict). The executor
body iterates each surface independently into `pending[]`, so it SHOULD work,
but there's no regression pin. A future refactor that short-circuits (e.g.,
"if conflicted, skip the reap-classification loop") would silently drop the
`crashed_agent` pending entries.

**Fix:** Add a combined-failure test:
```js
test('combined conflicted + failedReaped surfaces BOTH reasons in pending[]', () => {
  const vcs = makeMockVcs(() => ({
    merged: [],
    conflicted: true,
    conflictedPaths: ['src/foo.ts'],
    incompleteQueued: 0,
    failedReaped: ['a1'],
    surplusBookmarks: [],
  }));
  // ... assert pending has BOTH 'merge_conflict' AND 'crashed_agent' entries.
});
```

## Info

### IN-01: `tests/quick-md-parallel-dispatch.test.cjs` carry-over test is asymmetric

**File:** `tests/quick-md-parallel-dispatch.test.cjs:48-53`
**Issue:** The "CR-02 execute-phase.md carry-over" describe block only checks
the `HANDLE_OK` FATAL guard. It does NOT carry over:
- The plan-shape check (`/\{plans:\[/` doesNotMatch / `agentId:\$aid,planId:\$pid` match)
- The numeric-phase check (`--phase 0[^0-9]` match)

This is precisely why CR-01 and CR-02 above slipped through Plan 11-08's
test net. If those checks had been added to `EXEC` symmetrically with `QUICK`,
the failing assertions would have caught the gaps before they shipped.

**Fix:** Mirror all three CR-02 sub-assertions onto `EXEC`. The execute-phase
shape need not be byte-identical (the plan input is constructed from
WAVE_WORKTREE_PLANS, not from quick_id), but the SHAPE invariants are:
- Plan JSON is an array, not a `{plans:[...]}` wrapper.
- `--phase` argument is numeric (or a bash variable referencing one).
- `HANDLE_OK` guard catches `{ok:false}` payloads.

---

### IN-02: dispatch-cwd-safety.md "Recovery" section says "agents do NOT attempt to self-recover by cd'ing" — but the doc doesn't define what "self-recovery" looks like at the orchestrator level either

**File:** `get-shit-done/references/dispatch-cwd-safety.md:86-92`
**Issue:** The Recovery section tells agents what NOT to do
(`cd`, force-rewind) but doesn't tell the ORCHESTRATOR what to do when an
agent exits 1 with the FATAL message. The README-style reader is left to
infer "re-dispatch with the correct workspace cwd," but execute-phase.md and
quick.md don't actually have a retry loop wired in — the agent exits, the
orchestrator's `Agent()` call returns failure, and the wave fails.

For the targeted use case (Phase 11 dispatched-cwd safety), this is probably
fine — a hard failure here usually indicates an orchestrator bug, not a
transient. But the doc claims recovery is the orchestrator's responsibility
and that claim doesn't match the codebase.

**Fix:** Either add a retry-loop sketch to the doc (with a note that none of
the current orchestrators implement it), or weaken the claim to: "The agent
returns FATAL; the orchestrator that invoked Agent() should treat this as a
non-retriable orchestrator bug and surface the failure to the operator
unchanged."

---

### IN-03: jj/parallel.ts comment block at lines 233-239 documents the retirement of `WAVE_WORKTREE_MANIFEST` in load-bearing free text — single-source-of-truth concern

**File:** `sdk/src/vcs/jj/parallel.ts:233-239`
**Issue:** The retirement rationale is split across:
- jj/parallel.ts:15-19 (file-level docstring)
- jj/parallel.ts:233-239 (inline retirement comment)
- worktree-safety.cjs:411-412 (comment on legacy reconstructor)
- tests/jj-parallel-no-manifest-write.test.cjs:8-13 (test docstring)

All four restate "Phase 11 D-01 retired the manifest." Future readers will
have to grep four sites to find the canonical rationale, and a future edit
that updates only some sites creates drift.

**Fix:** Pick one canonical location (probably the 11-CONTEXT.md or
LEARNINGS file the phase already maintains) and have each code-side comment
reference it by short link rather than restating the rationale. Low priority;
documentation hygiene rather than a bug.

---

_Reviewed: 2026-05-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
