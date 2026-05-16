# Phase 11: Orchestrator + agent rewire + workspace.assert-dispatched-cwd — Pattern Map

**Mapped:** 2026-05-16
**Files analyzed:** 13 new/modified
**Analogs found:** 13 / 13 (every file has a concrete in-repo precedent)

This phase is a consumer-side migration of the Phase 9/10 `vcs.workspace.parallel.*`
verbs into workflow markdown, the executor agent prompt, and the CJS bridge. Only ONE
genuinely new code asset (`workspace-assert-dispatched-cwd.ts`); the other "new" files
are CLI bridges that mirror existing thin-handler shapes. The bulk of the phase is
DELETIONS guided by existing patterns.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `sdk/src/query/workspace-assert-dispatched-cwd.ts` | SDK query handler | request-response (CLI → adapter → JSON) | `sdk/src/query/head-ref.ts` | exact |
| `sdk/src/query/workspace-parallel-dispatch.ts` | SDK query handler / CLI bridge | request-response (CLI → adapter → JSON Handle) | `sdk/src/query/head-ref.ts` (flag plumbing) + `sdk/src/query/worktree.ts` (CLI bridge return shape) | role-match |
| `sdk/src/query/workspace-parallel-fan-in.ts` | SDK query handler / CLI bridge | request-response with stdin input (CLI → adapter → FanInResult JSON) | `sdk/src/query/worktree.ts` + `gsd-sdk query commit --files @-` precedent for stdin | role-match |
| `sdk/src/query/command-static-catalog-domain.ts` (MODIFY) | catalog registration | static config | line 63 `worktree.cleanup-wave` registration | exact precedent |
| `sdk/src/query/command-manifest.non-family.ts` (MODIFY) | manifest registration | static config | line 55 `head-ref` + line 45 `hooks.fire` entries | exact precedent |
| `sdk/src/vcs/jj/parallel.ts` (MODIFY — D-02) | SDK adapter body | event-driven (deletion-only) | self (same file) — lines 224-244 retire; lines 447-465 retire | self-modify |
| `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` (MODIFY — D-02) | unit test | assertion-flip | self (lines 178, 294 `surplusBookmarks` assertions) — flip to `vcs.workspace.list()` | self-modify |
| `get-shit-done/bin/lib/worktree-safety.cjs::executeWorktreeWaveCleanupPlan` (MODIFY — D-05) | CJS bridge / policy owner | request-response (legacy plan → FanInResult → synthetic pending[]) | self (lines 417-516) — body shrink preserving public signature | self-modify |
| `get-shit-done/workflows/execute-phase.md:515-820` (MODIFY) | workflow markdown | orchestration (shell pipeline) | `execute-phase.md:702-709` (existing `gsd-sdk query log \| jq` pattern) | role-match |
| `get-shit-done/workflows/quick.md:660-810` (MODIFY) | workflow markdown | orchestration (shell pipeline) | `execute-phase.md` rewrite (Plan 5 of this phase produces the canonical shape) | exact (same phase) |
| `agents/gsd-executor.md:412-555` (MODIFY) | agent prompt | precondition guard | self (lines 524, 531 — existing `gsd-sdk query ... \| jq -r` pattern) | self-modify |
| `get-shit-done/references/worktree-path-safety.md` → `dispatch-cwd-safety.md` (RENAME+REWRITE) | reference markdown | reference doc | self (existing 3-section structure collapses to 3 paragraphs) | self-modify |
| `tests/wave-cleanup-executor.test.cjs` + `tests/bug-3384-worktree-cleanup-manifest.test.cjs` + `tests/bug-3097-3099-executor-worktree-path-safety.test.cjs` (MODIFY) | regression tests | assertion-flip | self — see per-file pattern below | self-modify |

---

## Pattern Assignments

### `sdk/src/query/workspace-assert-dispatched-cwd.ts` (NEW — SDK query handler)

**Role:** thin SDK query bridge
**Data flow:** request-response (CLI args + cwd → `vcs.workspace.list()` + `vcs.workspace.context()` → JSON)
**Analog:** `sdk/src/query/head-ref.ts` (entire 35-line file is the precedent)

**Imports pattern** (`head-ref.ts:12-13`):
```typescript
import { createVcsAdapter } from '../vcs/index.js';
import type { QueryHandler } from './utils.js';
```

**Flag plumbing pattern** (`head-ref.ts:15-23`):
```typescript
export const headRefQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    }
  }
  // ... adapter call ...
};
```

**Core pattern — adapter call + JSON return** (`head-ref.ts:25-34`):
```typescript
  const vcs = createVcsAdapter(cwd);
  const head = vcs.refs.resolveShort(vcs.refs.head);

  return {
    data: {
      ok: true,
      head,
    },
  };
```

**Adaptation for Phase 11** (per RESEARCH.md Code Examples block + D-03):
- Replace `vcs.refs.resolveShort(vcs.refs.head)` with `vcs.workspace.list()` + `vcs.workspace.context()`.
- Return shape `{ ok, workspaceName, workspacePath, isPrimary }` per D-03.
- Mirror flag-plumbing for `--cwd` exactly; no other flags needed per D-03 (no `--pick` despite the upstream context hint — the return is a flat object, no field to pick).

**Type reference** for `WorkspaceInfo` shape: `sdk/src/vcs/types.ts:185-189` (`{path, rev, locked}`).

---

### `sdk/src/query/workspace-parallel-dispatch.ts` (NEW — CLI bridge)

**Role:** SDK CLI bridge handler that invokes `vcs.workspace.parallel.dispatch` and prints Handle JSON.
**Data flow:** request-response — accepts `--phase`, `--main-bookmark`, `--plan` (inline JSON or `@file`/`@-`), optional `--max-concurrency`; prints frozen `ParallelDispatchHandle` JSON.
**Analog (flag plumbing + return):** `sdk/src/query/head-ref.ts` (for `--cwd` + JSON return shape)
**Analog (multi-flag + adapter invocation):** `sdk/src/query/worktree.ts` (worktree-cleanup-wave's CLI-bridge pattern — flag parsing + adapter call + JSON-or-error return)

**Imports pattern** (mirror `head-ref.ts:12-13` + the adapter import):
```typescript
import { createVcsAdapter } from '../vcs/index.js';
import type { QueryHandler } from './utils.js';
```

**Flag plumbing pattern** (extend `head-ref.ts:18-23` loop with additional cases):
```typescript
  let cwd = projectDir;
  let phaseNumber: number | undefined;
  let mainBookmark = '';
  let planRaw: string | undefined;
  let maxConcurrency: number | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) { cwd = args[++i]; }
    else if (args[i] === '--phase' && args[i + 1]) { phaseNumber = Number(args[++i]); }
    else if (args[i] === '--main-bookmark' && args[i + 1]) { mainBookmark = args[++i]; }
    else if (args[i] === '--plan' && args[i + 1]) { planRaw = args[++i]; }
    else if (args[i] === '--max-concurrency' && args[i + 1]) { maxConcurrency = Number(args[++i]); }
  }
```

**Stdin input pattern** (per RESEARCH §"Don't Hand-Roll" and Open Question 2 — use `@-`/`@<path>` precedent from `gsd-sdk query commit --files @-`):
- `--plan @-` → read stdin (`await readStdinUtf8()` if helper exists; else `fs.readFileSync(0,'utf-8')`).
- `--plan @<path>` → `fs.readFileSync(path, 'utf-8')`.
- `--plan <inline-json>` → use raw.

**Core pattern — adapter call + JSON return** (mirror `worktree.ts:32-38` for the JSON-vs-error branch):
```typescript
  const vcs = createVcsAdapter(cwd);
  const plan = JSON.parse(planRaw ?? '[]');
  const handle = vcs.workspace.parallel.dispatch({ phaseNumber, mainBookmark, plan, maxConcurrency });
  return { data: handle };  // Handle is already a frozen pure-JSON object per jj/parallel.ts:270-289
```

**Output convention** (per Open Question 5 — mirror `head-ref` flat, NOT `worktree.cleanup-wave` wrapper):
- Return `{ data: handle }` so the CLI prints the Handle as top-level JSON.
- The orchestrator shell then accesses `.workspaces[]` directly via `jq` (no `.data.handle.workspaces[]` access path).

---

### `sdk/src/query/workspace-parallel-fan-in.ts` (NEW — CLI bridge with stdin)

**Role:** SDK CLI bridge accepting Handle JSON + `ParallelAgentResult[]` JSON via flags / stdin; invokes `vcs.workspace.parallel.fanIn`; prints `FanInResult` JSON.
**Data flow:** request-response with stdin input.
**Analog:** Same as `workspace-parallel-dispatch.ts` (flag plumbing from `head-ref.ts`; CLI-bridge structure from `worktree.ts`). Additionally mirror the **`--handle @-` / `--handle @<path>`** convention from the `gsd-sdk query commit --files @-` precedent (per RESEARCH Open Question 2).

**Flag plumbing pattern**:
```typescript
  let cwd = projectDir;
  let handleRaw: string | undefined;
  let resultsRaw: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) { cwd = args[++i]; }
    else if (args[i] === '--handle' && args[i + 1]) { handleRaw = args[++i]; }
    else if (args[i] === '--results' && args[i + 1]) { resultsRaw = args[++i]; }
  }
  // Resolve @- / @<path> for each input. If --results is absent, read from stdin per RESEARCH §"Don't Hand-Roll".
```

**Workspace-discovery pattern** (per D-01 + RESEARCH Pitfall 5 — discover from VCS, not from the Handle's `manifest` field):
- Filter `vcs.workspace.list()` by `gsd/phase-{phaseTag}-subagent-` prefix using the Handle's `phaseNumber` field.
- Existing prefix logic precedent: `sdk/src/vcs/jj/parallel.ts:489-493` (surplus-bookmark sweep).

```typescript
// Precedent from jj/parallel.ts:489-493 — same prefix shape, applied to workspace.list():
const phaseTag = String(handle.phaseNumber).padStart(2, '0');
const prefix = `gsd/phase-${phaseTag}-subagent-`;
// Filter workspaces matching prefix; pass filtered set to fanIn.
```

**Adapter call + JSON return**:
```typescript
  const vcs = createVcsAdapter(cwd);
  const handle = JSON.parse(handleRaw);
  const results = JSON.parse(resultsRaw);
  const fanInResult = vcs.workspace.parallel.fanIn(handle, results);
  return { data: fanInResult };  // FanInResult per types.ts; flat per head-ref convention
```

**Error handling pattern** (mirror `worktree.ts:20-22` + `worktree.ts:30`):
```typescript
  // Defensive: invalid JSON → ok:false response (not throw).
  try { handle = JSON.parse(handleRaw); }
  catch (err) { return { data: { ok: false, reason: 'handle_json_parse_failed', error: err.message } }; }
```

---

### `sdk/src/query/command-static-catalog-domain.ts` (MODIFY — add 3 entries)

**Role:** static catalog registration for QueryHandler dispatch.
**Analog:** existing line 63 entry for `worktree.cleanup-wave`.

**Existing pattern** (`command-static-catalog-domain.ts:19, 63-64`):
```typescript
import { worktreeCleanupWave } from './worktree.js';
// ...
  ['worktree.cleanup-wave', worktreeCleanupWave],
  ['worktree cleanup-wave', worktreeCleanupWave],
```

**Apply for Phase 11:**
- Add `import { workspaceAssertDispatchedCwdQuery } from './workspace-assert-dispatched-cwd.js';` near line 19.
- Add `import { workspaceParallelDispatchQuery } from './workspace-parallel-dispatch.js';` near line 19.
- Add `import { workspaceParallelFanInQuery } from './workspace-parallel-fan-in.js';` near line 19.
- Add 6 entries (each verb gets both `.` and space form per existing convention) alongside line 63:
  ```typescript
  ['workspace.assert-dispatched-cwd', workspaceAssertDispatchedCwdQuery],
  ['workspace assert-dispatched-cwd', workspaceAssertDispatchedCwdQuery],
  ['workspace.parallel.dispatch', workspaceParallelDispatchQuery],
  ['workspace parallel.dispatch', workspaceParallelDispatchQuery],
  ['workspace.parallel.fan-in', workspaceParallelFanInQuery],
  ['workspace parallel.fan-in', workspaceParallelFanInQuery],
  ```

---

### `sdk/src/query/command-manifest.non-family.ts` (MODIFY — add 3 entries)

**Role:** manifest registration (mutation flag + output mode for routing).
**Analog:** existing `head-ref` entry at line 55 and `hooks.fire` at line 45.

**Existing patterns**:
```typescript
// command-manifest.non-family.ts:55
{ canonical: 'head-ref',       aliases: [], mutation: false, outputMode: 'json' },

// command-manifest.non-family.ts:45 (mutation: true precedent with comment)
{ canonical: 'hooks.fire', aliases: ['hooks fire'], mutation: true, outputMode: 'json' },
```

**Apply for Phase 11** (place alongside line 55 ish; convention: `outputMode: 'json'`):
```typescript
// Phase 11 (VCS-20 + PROMPT-06..09): workspace verbs for parallel orchestration.
{ canonical: 'workspace.assert-dispatched-cwd', aliases: ['workspace assert-dispatched-cwd'], mutation: false, outputMode: 'json' },
{ canonical: 'workspace.parallel.dispatch',     aliases: ['workspace parallel.dispatch'],     mutation: true,  outputMode: 'json' },
{ canonical: 'workspace.parallel.fan-in',       aliases: ['workspace parallel.fan-in'],       mutation: true,  outputMode: 'json' },
```

Rationale per `hooks.fire` precedent comment: `dispatch` and `fan-in` are `mutation: true` because they create/merge/delete workspaces and bookmarks. `assert-dispatched-cwd` is read-only.

---

### `sdk/src/vcs/jj/parallel.ts` (MODIFY — D-02 cross-phase amendment)

**Role:** SDK adapter body — drop dead bookmark-create + bookmark-delete code.
**Data flow:** deletion-only modification (no behavior change beyond removing the bookmark side-effects).
**Analog:** self (the same file). The shape of what stays vs. what goes is the precedent.

**Block to retire — eager bookmark create** (`jj/parallel.ts:224-244`):
```typescript
// 3. Eager agent-bookmark creation (RESEARCH §"What's missing for Phase 9" (a)).
// One bookmark per subagent head, named `gsd/phase-{NN}-subagent-{idx}`.
// The fanIn batched delete relies on these names being present so the
// post-fanIn `surplusBookmarks` invariant (D-08) holds.
for (const slot of slots) {
  const bookmarkName = `gsd/phase-${phaseTag}-subagent-${slot.idx}`;
  validateAgentBookmarkName(bookmarkName);
  const bmArgs = [
    ...jjArgvFlags(mainRepoRoot),
    'bookmark', 'create', '-r', slot.headChange, '--', bookmarkName,
  ];
  const bmRes = vcsExec(mainRepoRoot, 'jj', bmArgs);
  if (bmRes.exitCode !== 0) {
    throw new Error(
      `parallel.dispatch: bookmark create ${bookmarkName} failed: ${bmRes.stderr || bmRes.stdout}`,
    );
  }
}
```
→ DELETE entire block per D-02. Comment block at lines 224-227 also goes.

**Block to retire — batched delete in fanIn clean branch** (`jj/parallel.ts:447-467`):
```typescript
const agentBookmarkNames: string[] = [];
for (let i = 0; i < handle.workspaces.length; i++) {
  const name = `gsd/phase-${phaseTag}-subagent-${i + 1}`;
  validateAgentBookmarkName(name);
  agentBookmarkNames.push(name);
}
const delArgs = [
  ...jjArgvFlags(mainRepoRoot),
  'bookmark', 'delete', '--', ...agentBookmarkNames,
];
const delRes = vcsExec(mainRepoRoot, 'jj', delArgs);
if (delRes.exitCode !== 0) {
  throw new Error(
    `parallel.fanIn: batched bookmark delete failed (N=${agentBookmarkNames.length}): ${delRes.stderr || delRes.stdout}`,
  );
}
```
→ DELETE entire block per D-02.

**Block to retire — post-delete surplus sweep** (`jj/parallel.ts:471-494`):
- The `jj bookmark list` sweep at lines 479-493 becomes vestigial — `surplusBookmarks` stays `[]` on the clean branch by construction. Per RESEARCH §"State of the Art" and D-08 note: leave the `surplusBookmarks = []` initial value, drop the sweep code; the type contract field stays on `FanInResult`.

**MUST PRESERVE (do not touch):**
- `octopus.createPhaseStructure` invocation and the `createSubagentSlot` loop at lines 200-222 — the merge structure already references subagent heads as parents.
- The manifest writer at lines 246-265 — SDK-internal observability per RESEARCH Assumption A6.
- The pre-merge `currentHeads` re-resolution at lines 311-344 — load-bearing for the "merge parent is `@` not `baseRev`" fix (plan 09.05 Rule 1).
- The N-parent `jj new` at lines 356-371 — referencing parents directly is the entire reason D-02 makes bookmarks vestigial.

---

### `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` (MODIFY — D-02 flip)

**Role:** unit/contract test — flip bookmark-presence assertions to workspace-listing.
**Analog:** self.

**Existing assertion to flip** (`cmd-parallel-jj.test.ts:178, 294`):
```typescript
// Line 125 (test title — KEEP semantic intent, change "surplusBookmarks empty" → workspace cleanup):
it(`N=${N}: dispatch creates ${N} distinct change_ids; clean fanIn returns conflicted===false, merged.length===1, surplusBookmarks empty; post-fanIn divergent() is empty`, ...

// Line 178 (clean-path assertion):
expect(result.surplusBookmarks.length).toBe(0);   // stays trivially true post-D-02 — but unhelpful

// Line 294 (conflict-path assertion):
expect(result.surplusBookmarks.length).toBe(0);   // same — was per-D-08 invariant; trivially true now
```

**Apply for Phase 11 — flip per Pitfall 1:**
Replace each `surplusBookmarks` assertion with a `vcs.workspace.list()` filter assertion that proves the workspace SET was properly reaped:
```typescript
// New assertion shape (precedent: use the same prefix logic as jj/parallel.ts:489-493):
const remainingWorkspaces = vcs.workspace.list()
  .filter((w) => w.path.includes(`/phase-${phaseTag}-subagent-`));
expect(remainingWorkspaces.length).toBe(0);   // workspaces reaped, not bookmarks tracked
```

**MUST PRESERVE:** TEST-14 `divergent()` assertion (per CONTEXT D-02 + Claude's Discretion item 5). Octopus topology is unchanged; only the bookmark side retires.

---

### `get-shit-done/bin/lib/worktree-safety.cjs::executeWorktreeWaveCleanupPlan` (MODIFY — D-05)

**Role:** CJS bridge / ADR-0004 policy owner — body shrinks to a single `vcs.workspace.parallel.fanIn` delegation.
**Data flow:** legacy plan input → synthetic Handle → fanIn → synthetic `pending[]` rebuild.
**Analog:** self. The public signature and the `pending[]` return shape are the load-bearing invariants.

**MUST PRESERVE — public signature** (`worktree-safety.cjs:417`):
```javascript
function executeWorktreeWaveCleanupPlan(plan, _deps = {}) {
```
ADR-0004 `_deps={}` seam — tests pass `{vcs: …}` to override the auto-detected adapter. Do not change.

**MUST PRESERVE — empty-plan guard** (`worktree-safety.cjs:418-427`):
```javascript
const entries = Array.isArray(plan?.entries) ? plan.entries : [];
if (entries.length === 0) {
  return { ok: true, action: plan?.action ?? 'skip', reason: 'empty_plan', entries: [], pending: [] };
}
```
Test `wave-cleanup-executor.test.cjs:28-37` asserts exactly `ok:true, reason:'empty_plan', pending:[]`.

**MUST PRESERVE — adapter resolution** (`worktree-safety.cjs:428`):
```javascript
const vcs = _deps.vcs ?? createVcsAdapter(plan.repoRoot, {});
```

**Pattern to RETIRE — the 7-guard per-entry loop** (`worktree-safety.cjs:429-515`):
The entire `for (const entry of entries) { try { ... 7 verbs ... } catch ... }` block goes per D-05:
- Verb 1: `currentBookmarksIn` / `branch_drift` push → drops (workspace.list discovery replaces).
- Verbs 2+3: `mergeBase` + `diff diffFilter:'deleted'` / `deletions_detected` push → drops per D-06 (agent-side per-commit defense replaces).
- Verb 4: `status({porcelain, cwd})` / `worktree_dirty` push → drops (fanIn body handles via per-success cleanup per Phase 10).
- Verb 5: `workspace.merge` (2-parent) → replaced by adapter's N-parent merge inside `parallel.fanIn`.
- Verb 6: `workspace.remove` → handled by fanIn per-success cleanup (Phase 10 D-XX).
- Verb 7: standalone `bookmarks.delete` net → handled by fanIn (jj: atomic in merge; git: per-success cleanup).

**Synthetic Handle reconstruction pattern** (NEW helper — naming per Claude's Discretion item 3 — `reconstructHandleFromLegacyPlan(plan)`):
Source guide: RESEARCH.md Pattern 3 (lines 297-317). Use exact field shape:
```javascript
function reconstructHandleFromLegacyPlan(plan) {
  const phaseTag = String(plan.phaseNumber ?? 0).padStart(2, '0');
  return Object.freeze({
    phaseRoot: plan.repoRoot,
    phaseNumber: plan.phaseNumber ?? 0,
    mainBookmark: plan.entries[0]?.main_bookmark ?? '',
    manifest: '',  // legacy callers had no manifest path
    workspaces: Object.freeze(plan.entries.map((e, i) => Object.freeze({
      name: `legacy-${i + 1}`,
      path: e.worktree_path,
      baseRev: e.expected_base,
      agentId: e.branch.replace(/^worktree-agent-/, ''),
      baselineOpId: undefined,
    }))),
  });
}
```

**Synthetic `pending[]` rebuild pattern** (NEW — must preserve the reason taxonomy tests assert):
Existing test contract (`wave-cleanup-executor.test.cjs:69-71`):
```javascript
assert.equal(r.pending[0].reason, 'branch_drift');
assert.ok(Array.isArray(r.pending[0].detected), 'pending[0].detected must be an array');
```
Per Assumption A3: only `merge_conflict` and `unexpected_error` are PRODUCIBLE from the new path. Reason taxonomy mapping from `FanInResult` fields:
- `fanIn.conflictedPaths[*]` → `{reason:'merge_conflict', file:<path>}`
- `fanIn.failedReaped[*]` → `{reason:'crashed_agent', subagentName:<name>}` (NEW reason — A3 calls out that tests may need adjustment OR new reason added)
- `fanIn.incompleteQueued > 0` → either roll into `merge_conflict` pending entries or surface as separate `{reason:'incomplete_queued', count:N}`

**Final return shape** (per `worktree-safety.cjs:515`):
```javascript
return { ok: fanIn.conflicted === false && fanIn.failedReaped.length === 0,
         action: plan.action, entries: processedFromHandle, pending };
```

---

### `get-shit-done/bin/lib/worktree-safety.cjs::cmdWorktreeCleanupWave` (DECISION POINT — per Pitfall 4)

**Role:** CLI handler for `gsd-sdk query worktree.cleanup-wave`.
**Per Open Question 1 recommendation:** REMOVE the alias after grep audit confirms no external callers.

**Analog if keeping as thin shim** (current body at `worktree-safety.cjs:518-556`):
- Body becomes a ~10 LOC adapter that reads manifest, constructs Handle via `reconstructHandleFromLegacyPlan`, calls `executeWorktreeWaveCleanupPlan` (which now delegates to fanIn).

**Analog if removing:** delete both the function AND its catalog entry at `command-static-catalog-domain.ts:63-64` AND its manifest entry (if one exists in `command-manifest.non-family.ts`).

---

### `get-shit-done/workflows/execute-phase.md:515-820` (MODIFY — PROMPT-06)

**Role:** workflow markdown — orchestrator shell + Agent() dispatch.
**Data flow:** orchestration shell pipeline.
**Analog (in-file precedent for `gsd-sdk query | jq` pattern):** `execute-phase.md:702-709` — existing log/jq idiom:
```bash
COMMITS_FOUND=$(gsd-sdk query log --all --max-count 50 --cwd . 2>/dev/null \
  | jq -r --arg sub "{phase_number}-{plan_padded}" '.[] | select(.subject | contains($sub)) | (.hash[0:7] + " " + .subject)' \
  | head -1)
```
Shell-block conventions: pipe to `jq -r`, capture in `$VAR`, branch on emptiness. New blocks follow the same idiom.

**Replacement block source** (per RESEARCH §"Pattern 2"): use the ~30 LOC `HANDLE_JSON=$(gsd-sdk query workspace.parallel.dispatch …)` + sequential Agent loop + `FAN_RESULT=$(echo "$RESULTS_JSON" | gsd-sdk query workspace.parallel.fan-in …)` shape verbatim from RESEARCH.md lines 252-289 and 480-503.

**MUST PRESERVE — sequential one-Agent-per-message dispatch** (`execute-phase.md:535-544`):
```text
**Sequential dispatch for parallel execution (waves with 2+ agents):**
Dispatch each `Agent()` call **one at a time with `run_in_background: true`**. Do NOT
send all Agent calls in a single message: simultaneous `git worktree add` calls race
on `.git/config.lock`. Agents still run in parallel once their worktrees are created.

```text
# CORRECT: one Agent() per message with run_in_background: true
# WRONG: multiple Agent() calls in one message -> .git/config.lock contention
```
```
This is load-bearing per RESEARCH PITFALLS Pitfall 5 + D-07. The replacement block's shell loop encloses the Agent() calls but the Agent() invocation pattern (one per message, `run_in_background: true`) does NOT change.

**MUST PRESERVE — orchestrator rule** (`execute-phase.md:653`):
> **ORCHESTRATOR RULE — CODEX RUNTIME**: After calling Agent() above to spawn executor agent(s), stop working on this task immediately. …

**MUST PRESERVE — stall surveillance probes** (`execute-phase.md:693-728`, gated by `#3212`):
The fallback completion-signal logic and `EXECUTOR_STALL_INTERVAL_MINUTES` block survive intact. Only the dispatch + cleanup blocks change.

**MUST DELETE per PROMPT-06:**
- The `WAVE_WORKTREE_MANIFEST=$(mktemp …)` lines at `execute-phase.md:528-532`.
- The `<worktree_branch_check>` block at `execute-phase.md:561-587` (the four guards collapsed in `gsd-executor.md` per D-04 — orchestrator-side templating goes too).
- The `gsd-sdk query worktree.cleanup-wave --manifest "$WAVE_WORKTREE_MANIFEST"` call at `execute-phase.md:774`.
- The "Cleanup-tail snippet" `[ -n "${WAVE_WORKTREE_MANIFEST:-}" ] && …` raw-git block at `execute-phase.md:781-808`.
- The `<execution_context>` line referencing `worktree-path-safety.md` at `execute-phase.md:613` → REPLACE with `dispatch-cwd-safety.md`.

---

### `get-shit-done/workflows/quick.md:660-810` (MODIFY — PROMPT-07)

**Role:** workflow markdown (single-task variant).
**Analog:** Phase 11's own `execute-phase.md` rewrite (Plan 5 produces the canonical shape; Plan 6 applies it to quick.md per D-09).

**Adaptation per Pitfall 3:** quick.md uses `$USE_WORKTREES` (project-level) NOT `$USE_WORKTREES_FOR_PLAN` (per-plan). Copy the shape from execute-phase.md's rewritten block but flip the gating variable:
```bash
# Wrong (would land if planner copies execute-phase.md verbatim):
if [ "${USE_WORKTREES_FOR_PLAN:-true}" != "false" ]; then …

# Right (quick.md is single-plan, project-level only):
if [ "${USE_WORKTREES:-true}" != "false" ]; then …
```

**MUST DELETE per PROMPT-07:**
- `QUICK_WORKTREE_MANIFEST=$(mktemp …)` at `quick.md:667-669`.
- The entire `<worktree_branch_check>` block at `quick.md:681-709`.
- The `gsd-sdk query worktree.cleanup-wave --manifest "$QUICK_WORKTREE_MANIFEST"` block at `quick.md:776-789`.

**N=1 invariant** (per D-09): quick mode dispatches a single executor → parallel verbs still work at N=1 trivially. The `workspace.parallel.dispatch` call inside `[ "$USE_WORKTREES" != "false" ]` returns a 1-workspace Handle.

---

### `agents/gsd-executor.md:412-555` (MODIFY — PROMPT-08, D-04 collapse)

**Role:** agent prompt — collapse 4 worktree-aware guard blocks to a single SDK verb call.
**Data flow:** precondition guard.
**Analog (in-file precedent for `gsd-sdk query | jq -r` + branch pattern):** `gsd-executor.md:524, 531-532`:
```bash
TASK_COMMIT=$(gsd-sdk query head-ref | jq -r '.head // empty' | cut -c1-7)
# ... and ...
DELETIONS=$(gsd-sdk query diff --name-status --range "HEAD~1..HEAD" \
  | jq -r '.nameStatus[]? | select(.status == "D") | .path' 2>/dev/null || true)
```
Same JSON-to-shell-var-via-jq idiom; same single `gsd-sdk query` invocation.

**Replacement block source** (per RESEARCH §"Agent-side collapse" lines 462-476): use verbatim:
```bash
DISPATCH_CHECK=$(gsd-sdk query workspace.assert-dispatched-cwd --cwd .)
OK=$(echo "$DISPATCH_CHECK" | jq -r '.ok')
if [ "$OK" != "true" ]; then
  IS_PRIMARY=$(echo "$DISPATCH_CHECK" | jq -r '.isPrimary')
  WS_NAME=$(echo "$DISPATCH_CHECK" | jq -r '.workspaceName // "<unknown>"')
  echo "FATAL: cwd is not a dispatched subagent workspace (isPrimary=$IS_PRIMARY, workspaceName=$WS_NAME)." >&2
  echo "RECOVERY: cd into the workspace path the orchestrator passed to this Agent() invocation." >&2
  exit 1
fi
```
Placed at the start of `<task_commit_protocol>` (before existing step "1. Check modified files" at `gsd-executor.md:484`).

**MUST DELETE per PROMPT-08:**
- Step 0a block (`gsd-executor.md:412-440`) — cwd-drift sentinel, #3097.
- Step 0b block (`gsd-executor.md:442-458`) — absolute-path safety, #3099.
- Step 0 block (`gsd-executor.md:460-482`) — HEAD-attachment / protected-ref deny-list, #2924.

**MUST PRESERVE per D-04 + D-06:**
- `<destructive_git_prohibition>` block at `gsd-executor.md:542-574` — STAYS as-is (about ambient `git clean`/`git rm`, not workspace-locating; cross-backend extension deferred).
- Step 6 post-commit deletion check at `gsd-executor.md:527-537` — STAYS unchanged. This is the load-bearing #3091 defense per D-06:
```bash
DELETIONS=$(gsd-sdk query diff --name-status --range "HEAD~1..HEAD" \
  | jq -r '.nameStatus[]? | select(.status == "D") | .path' 2>/dev/null || true)
if [ -n "$DELETIONS" ]; then
  echo "WARNING: Commit includes file deletions: $DELETIONS"
fi
```
Per Pitfall 2: this defense is invisible-by-diff (it's an existing block; the PR shows zero changes in gsd-executor.md around it). Plan validation step MUST explicitly assert this block is unchanged.

---

### `get-shit-done/references/worktree-path-safety.md` → `dispatch-cwd-safety.md` (RENAME + REWRITE — PROMPT-09)

**Role:** reference markdown loaded via `@~/.claude/get-shit-done/references/...`.
**Analog:** self. Existing 3-section structure (89 lines) collapses to one paragraph per section per D-08.

**Existing sections to collapse** (`worktree-path-safety.md`):
- §"Worktree branch check" (lines 8-35) → one paragraph: "The verb catches HEAD-on-protected-ref and HEAD-outside-agent-namespace by construction — being in a non-primary dispatched workspace means the worktree-agent-* branch attachment is intact."
- §"cwd-drift sentinel — step 0a (#3097)" (lines 39-65) → one paragraph: "The verb catches cwd drift by construction — `vcs.workspace.list()` resolves cwd's effectiveRoot against the workspace set; a drifted cwd resolves to `isPrimary:true` or no match."
- §"Absolute-path guard — step 0b (#3099)" (lines 69-89) → one paragraph: "The verb catches abs-path misrouting by construction — writes outside the matched workspace path fail the workspace-locating predicate; relative paths inside the matched workspace path are guaranteed valid."

**New body structure** (per D-08):
1. One-line intro describing the verb and its return shape `{ ok, workspaceName, workspacePath, isPrimary }`.
2. One paragraph per former section explaining "the verb catches X by construction."
3. Failure-mode summary: cwd drifted to primary workspace (returns `isPrimary:true`) OR cwd outside any dispatched workspace (returns `match:undefined`).

**Referrer updates required** (per RESEARCH PROMPT-09 row):
- `execute-phase.md:586` (text reference in `<worktree_branch_check>`) → update name OR delete reference if `<worktree_branch_check>` block is removed per PROMPT-06.
- `execute-phase.md:590` (text in `<parallel_execution>`) → update name.
- `execute-phase.md:613` (`@~/.claude/get-shit-done/references/worktree-path-safety.md` load) → rename to `dispatch-cwd-safety.md`.
- `docs/INVENTORY.md:302` — update name.
- `docs/test-triage/jj-bugs.md:21,73` — update name.
- `.changeset/fix-3097-3099-executor-worktree-path.md:11` — update name (or leave per changeset-immutability convention; planner decides).

---

### `tests/bug-3097-3099-executor-worktree-path-safety.test.cjs` (MODIFY — A5)

**Role:** structural test that pivots in Phase 11.
**Analog:** self.

**Existing assertion pattern (PER RESEARCH ASSUMPTION A5):**
- (a) `execute-phase.md` references `worktree-path-safety.md` in `<execution_context>`.
- (b) the file exists at `references/worktree-path-safety.md`.
- (c) the file contains specific sentinel patterns (cwd-drift sentinel + abs-path guard text).

**Flip pattern per Phase 11:**
- (a) flips to: `execute-phase.md` references `dispatch-cwd-safety.md`.
- (b) flips to: file exists at `references/dispatch-cwd-safety.md`.
- (c) flips to: file references the `workspace.assert-dispatched-cwd` verb literal.

The INTENT survives (defense against #3097/#3099); the SHAPE changes (verb call instead of inline shell sentinels).

---

### `tests/wave-cleanup-executor.test.cjs` (MODIFY — A3 contract preservation)

**Role:** regression test on `executeWorktreeWaveCleanupPlan` return shape.
**Analog:** self.

**Existing assertion shape to preserve** (`wave-cleanup-executor.test.cjs:28-37, 69-71, 149-150`):
```javascript
// Empty-plan contract:
assert.equal(r.reason, 'empty_plan');
assert.deepEqual(r.pending, []);

// Branch-drift contract (THIS REASON IS NO LONGER PRODUCIBLE — see A3):
assert.equal(r.pending[0].reason, 'branch_drift');
assert.ok(Array.isArray(r.pending[0].detected), 'pending[0].detected must be an array');

// Clean-merge contract:
assert.equal(r.ok, true, `executor failed: ${JSON.stringify(r.pending)}`);
assert.equal(r.pending.length, 0);
```

**Per A3:** Only `merge_conflict` and `unexpected_error` reasons survive the new code path. Branch-drift test EITHER (a) flips to assert the new reason that fanIn surfaces for the same input class, OR (b) constructs a Handle that produces a synthetic branch-drift in the legacy adapter (mock-path). Planner picks per which preserves the regression INTENT.

---

### `tests/bug-3384-worktree-cleanup-manifest.test.cjs` (MODIFY — manifest-source-of-truth pivot)

**Role:** regression test for #3384 (don't broad-discover worktrees).
**Analog:** self.

**Existing assertion shape** (`bug-3384-worktree-cleanup-manifest.test.cjs:215-232`):
```javascript
assert.match(content, /WAVE_WORKTREE_MANIFEST/);
assert.match(content, /try\{if\(!p\)throw new Error\("WAVE_WORKTREE_MANIFEST is unset"\)/);
assert.doesNotMatch(content, /done < <\(node -e 'const fs=require\("fs"\);const p=process\.env\.WAVE_WORKTREE_MANIFEST/);
assert.match(content, /WAVE_WORKTREE_MANIFEST|QUICK_WORKTREE_MANIFEST/);
```

**Per D-01 + Pitfall 5:** WAVE_WORKTREE_MANIFEST is eliminated from workflow markdown. The regression INTENT (don't broad-discover worktrees) is preserved by the phase-scope filter on `vcs.workspace.list()` inside the fan-in handler. Assertions flip to: "the new dispatch verb is called" + "the Handle JSON shell variable shape matches" + "fan-in filters by `gsd/phase-{NN}-subagent-` prefix" (verifiable via reading the fan-in handler source or by structural assertion on the new shell block).

---

## Shared Patterns

### Pattern S1: Thin SDK query handler with `--cwd` flag plumbing

**Source:** `sdk/src/query/head-ref.ts` (entire file).
**Apply to:** `workspace-assert-dispatched-cwd.ts` (exact mirror); `workspace-parallel-dispatch.ts` and `workspace-parallel-fan-in.ts` (extended flag set).

```typescript
import { createVcsAdapter } from '../vcs/index.js';
import type { QueryHandler } from './utils.js';

export const fooQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    }
  }
  const vcs = createVcsAdapter(cwd);
  // ... call adapter, return { data: <flat JSON> } ...
};
```

### Pattern S2: Catalog + manifest dual registration

**Source:** `command-static-catalog-domain.ts:63-64` paired with `command-manifest.non-family.ts:55`.
**Apply to:** all three new SDK verbs.

Every new canonical name needs:
- One row in `DOMAIN_STATIC_CATALOG` mapping `'canonical.name'` → handler (and a duplicate row with the space-form alias `'canonical name'` → same handler).
- One entry in `NON_FAMILY_COMMAND_MANIFEST` with `{canonical, aliases:['canonical name'], mutation, outputMode:'json'}`.

### Pattern S3: `gsd-sdk query | jq -r '...'` in shell

**Source:** Multiple — `execute-phase.md:702-709`, `gsd-executor.md:524`, `gsd-executor.md:531-532`.
**Apply to:** all workflow + agent shell blocks consuming new verb output.

```bash
RESULT=$(gsd-sdk query <verb> --cwd . 2>/dev/null)
FIELD=$(echo "$RESULT" | jq -r '.field // empty')
if [ -z "$FIELD" ]; then echo "FATAL: ..." >&2; exit 1; fi
```

### Pattern S4: ADR-0004 `_deps={}` injection seam preservation

**Source:** `worktree-safety.cjs:417` signature `executeWorktreeWaveCleanupPlan(plan, _deps = {})` + `:428` resolution `_deps.vcs ?? createVcsAdapter(...)`.
**Apply to:** D-05 body shrink — DO NOT change either line.

```javascript
function executeWorktreeWaveCleanupPlan(plan, _deps = {}) {
  // ... empty-plan guard ...
  const vcs = _deps.vcs ?? createVcsAdapter(plan.repoRoot, {});
  // ... new body delegating to vcs.workspace.parallel.fanIn ...
}
```

### Pattern S5: Sequential `run_in_background:true` Agent() loop (Pitfall 5 mitigation)

**Source:** `execute-phase.md:535-544`.
**Apply to:** new dispatch loop in `execute-phase.md` AND `quick.md` rewrite.

The structural rule "one Agent() per message with `run_in_background:true`" is the load-bearing `.git/config.lock` race mitigation AND the structural justification for D-07. Preserve the rule's TEXT in the workflow markdown (the warning comment at lines 540-543) and the implementation (one Agent invocation per chat-message round).

### Pattern S6: Frozen pure-JSON Handle / FanInResult flow

**Source:** `sdk/src/vcs/jj/parallel.ts:270-289` — `Object.freeze({...})` wrap with `Object.freeze(workspaces.map(...))` inner.
**Apply to:** `reconstructHandleFromLegacyPlan` in `worktree-safety.cjs` (Pattern 3 in RESEARCH; explicit `Object.freeze` on outer and inner).

---

## No Analog Found

(None — every file has at least a role-match analog in the existing tree.)

---

## Metadata

**Analog search scope:**
- `/Users/LoganDark/Documents/Projects/get-shit-done/sdk/src/query/` (all `.ts`)
- `/Users/LoganDark/Documents/Projects/get-shit-done/sdk/src/vcs/jj/parallel.ts`
- `/Users/LoganDark/Documents/Projects/get-shit-done/sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts`
- `/Users/LoganDark/Documents/Projects/get-shit-done/sdk/src/vcs/types.ts`
- `/Users/LoganDark/Documents/Projects/get-shit-done/get-shit-done/bin/lib/worktree-safety.cjs`
- `/Users/LoganDark/Documents/Projects/get-shit-done/get-shit-done/workflows/execute-phase.md`
- `/Users/LoganDark/Documents/Projects/get-shit-done/get-shit-done/workflows/quick.md`
- `/Users/LoganDark/Documents/Projects/get-shit-done/agents/gsd-executor.md`
- `/Users/LoganDark/Documents/Projects/get-shit-done/get-shit-done/references/worktree-path-safety.md`
- `/Users/LoganDark/Documents/Projects/get-shit-done/tests/wave-cleanup-executor.test.cjs`
- `/Users/LoganDark/Documents/Projects/get-shit-done/tests/bug-3384-worktree-cleanup-manifest.test.cjs`

**Files scanned:** 11 (each opened with `Read`; no re-reads).
**Pattern extraction date:** 2026-05-16

**Cross-reference to RESEARCH.md:**
- Patterns 1, 2, 3 in `11-RESEARCH.md` (lines 212-343) are the source of truth for full code shapes; this PATTERNS.md cites them by reference where re-quoting would duplicate.
- Pitfall 1-6 in `11-RESEARCH.md` (lines 382-422) inform the test-flip + scope-filter notes per file.
- Assumption A1-A7 in `11-RESEARCH.md` (lines 526-535) inform the "Must preserve" caveats per file.
