# Phase 10: git-side parallel verbs + classifier extension — Pattern Map

**Mapped:** 2026-05-15
**Files analyzed:** 6 (2 new production / 1 new test / 3 modify)
**Analogs found:** 6 / 6 (every new/modified file has a verbatim or near-verbatim in-tree analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `sdk/src/vcs/git/parallel.ts` | production sidecar (adapter-internal) | sync-subprocess loop + JSON-frozen pure-functional return | `sdk/src/vcs/jj/parallel.ts` (lines 1-543) | **exact (structural mirror, with deliberate fanIn-body divergence per D-01)** |
| `sdk/src/vcs/backends/git.ts` | backend wire-in (replace throwing stub) | namespace assignment inside `workspace = Object.freeze({...})` | `sdk/src/vcs/backends/jj.ts` lines 34 (import) + 1257-1264 (wire) | **exact (one-line import + 8-line replacement; jj-side is the template)** |
| `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` | contract test (Pattern A + Pattern B) | vitest `describe.sequential.skipIf` + per-N `beforeAll`/`afterAll` lifecycle | `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` (lines 1-430) | **exact (verbatim structural template — change `jj` → `git` setup commands)** |
| `scripts/lint-vcs-no-raw-git.allow.json` | lint allowlist (configuration) | JSON config — append one `{path, reason, owner}` entry | Existing entry for `sdk/src/vcs/backends/git.ts` at line 7 | **exact (schema match — drop `expires` per `feedback_solo_dev_no_expires` memory)** |
| `.planning/REQUIREMENTS.md` | planning doc amendment | markdown line edit (D-10 PARALLEL-02; D-11 TEST-15) | n/a — in-place wording change | n/a |
| `.planning/ROADMAP.md` | planning doc amendment | markdown line edit (D-09 Phase 10 SC3) | n/a — in-place wording change | n/a |

## Pattern Assignments

### `sdk/src/vcs/git/parallel.ts` (NEW — production sidecar)

**Analog:** `sdk/src/vcs/jj/parallel.ts` (lines 1-543 — structural mirror; the SAME phase-9-shipped sidecar that this file mirrors)

#### Header / docblock pattern (mirror jj/parallel.ts:1-32)

```typescript
/**
 * sdk/src/vcs/jj/parallel.ts — Phase 9 (VCS-17, PARALLEL-01/02 jj-side)
 *
 * Composition layer over octopus.ts + reap.ts + jj-native N-parent merge.
 * UPSTREAM-02 sidecar: does NOT import from backends/jj.ts (that would
 * create a merge conflict on every upstream-rebase cycle).
 * ...
 * D-12 (carry): `vcsExec` is the sole subprocess primitive; no raw
 * `child_process` calls are made from this file.
 */
```

git-side variant: same shape, swap to "Phase 10 (VCS-18, PARALLEL-01/02 git-side)", reference D-01..D-08 git-specific locked decisions, cite Pitfall 5 (`.git/config.lock`) explicitly per D-05.

#### Imports pattern (mirror jj/parallel.ts:34-52)

```typescript
import { writeFileSync, mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { vcsExec } from '../exec.js';
import { expr } from '../expr.js';
import type {
	RevisionExpr,
	ParallelDispatchOpts,
	ParallelDispatchHandle,
	ParallelAgentResult,
	FanInResult,
	IncompleteWorkEntry,
} from '../types.js';
import { appendIncomplete } from '../jj/incomplete-work.js';
```

Git-side variant: drop `createPhaseStructure, createSubagentSlot` (jj octopus.ts not consumed), drop `performJjReap` (Phase 10 does not extend reap), drop `enumerateConflictedPaths` (replaced by inline `git diff --name-only --diff-filter=U`), drop `parseJjWorkspaceList` (git-side doesn't auto-snapshot). Add `execGit` from `../exec.js` (matches `backends/git.ts:23` import shape).

#### Validator-inline pattern (verbatim from jj/parallel.ts:92-98)

```typescript
function validateAgentId(name: string): void {
	if (!/^[A-Za-z0-9._/-]+$/.test(name)) {
		throw new Error(
			`parallel.dispatch: agentId "${name}" violates worktree-safety manifest character class /^[A-Za-z0-9._/-]+$/ (see get-shit-done/bin/lib/worktree-safety.cjs:334)`,
		);
	}
}
```

Sidecar discipline: inline this validator (do NOT import `validateRefname` from `backends/git.ts` — that would create the back-import the sidecar contract forbids).

#### `performGitParallelDispatch` signature pattern (mirror jj/parallel.ts:164-173)

```typescript
export function performJjParallelDispatch(
	opts: ParallelDispatchOpts & {
		mainRepoRoot: string;
		vcs: {
			workspace: {
				add(input: { path: string; baseRef?: RevisionExpr; name?: string }): unknown;
			};
		};
	},
): ParallelDispatchHandle {
```

Git-side: same exact signature. Body diverges at internal step ordering — git has no `createPhaseStructure` (no parent/merge slot to lazy-create); slot loop directly calls `opts.vcs.workspace.add({ path, baseRef })` per plan item, then a per-slot `git branch worktree-agent-<id> @` (or equivalent through `vcs` DI) eagerly creates the agent branch.

#### Plain-for-loop with sync vcsExec pattern (verbatim from jj/parallel.ts:204-222)

```typescript
for (let i = 0; i < plan.length; i++) {
	const item = plan[i];
	const idx = i + 1;
	const slot = createSubagentSlot(mainRepoRoot, vcs, {
		parentChange,
		mergeChange,
		idx,
		phaseNum: phaseNumber,
		workspacePath: item.workspacePath,
	});
	slots.push({ ...slot stuff... });
}
```

**MANDATORY inline comment** at the loop header citing PITFALLS Pitfall 5 + D-05 (CONTEXT.md decision text is verbatim — "Inline comment at the loop header cites PITFALLS Pitfall 5 (`.git/config.lock` race) and notes that intra-process serialization is `spawnSync`-derived, so any future refactor to async `vcsExec` is forced to revisit the decision rather than silently regress."). The serial behavior IS the protection — invisible without the comment.

#### Manifest write pattern (mirror jj/parallel.ts:252-265 — change backend literal)

```typescript
const manifestDir = mkdtempSync(join(tmpdir(), 'gsd-wave-manifest-'));
const manifestPath = join(manifestDir, 'wave-worktree-manifest.json');
const manifestBody = {
	worktrees: slots.map((slot) => ({
		agent_id: slot.agentId,
		plan_id: slot.planId,
		backend: 'jj' as const,
		worktree_path: slot.workspacePath,
		branch: `worktree-agent-${slot.agentId}`,
		expected_base: slot.headChange,
		main_bookmark: mainBookmark,
	})),
};
writeFileSync(manifestPath, JSON.stringify(manifestBody, null, 2), 'utf-8');
```

Git-side: change `backend: 'jj' as const` to `backend: 'git' as const`; rename `headChange` to `headSha` semantically (still goes into `expected_base`).

#### Frozen pure-JSON handle pattern (verbatim from jj/parallel.ts:270-289)

```typescript
return Object.freeze({
	phaseRoot,
	phaseNumber,
	mainBookmark,
	manifest: manifestPath,
	workspaces: Object.freeze(
		slots.map((s) =>
			Object.freeze({
				name: s.workspaceName,
				path: s.workspacePath,
				baseRev: s.headChange,
				agentId: s.agentId,
				baselineOpId: undefined as string | undefined,
			}),
		),
	),
}) satisfies ParallelDispatchHandle;
```

Git-side: identical — `baseRev` carries the commit_id (SHA) on git; field name unchanged per D-14 unified-revision-model carry.

#### fanIn loop body pattern (**STRUCTURAL DIVERGENCE** — git does NOT mirror jj's single-N-parent shape; see RESEARCH.md §"Pattern 2" for the loop reframe per D-01)

The jj-side fanIn body at `jj/parallel.ts:308-543` does ONE N-parent `jj new -r @ -r <p1>..-r <pN>` (single op). Git-side iterates the workspace list with one 2-parent merge per iteration. **Common framing kept**: validators inline, `vcsExec` only, frozen `FanInResult` return, `appendIncomplete` for queue writes.

The per-iteration body composes existing primitives via the `vcs` DI seam (mirror jj at `octopus.ts:174-198`):

1. **D-03 stateless re-call probe** (per-workspace, replaces jj's `conflicts()` revset probe). Use `merge-base --is-ancestor` exit code; treat ANY non-zero as "not ancestor → process this workspace". Pattern reference: research §"Re-call ancestor probe (D-03)".
2. **D-01 2-parent merge** via `opts.vcs.workspace.merge({ branch: expr.bookmark(agentBookmark), message, ff:false, mainBookmark, agentBookmark })`. Composes the existing primitive at `backends/git.ts:660-705` — DO NOT re-implement merge logic.
3. **D-02 / D-08 halt-on-conflict** when `!mergeResult.ok && mergeResult.conflicted`: enumerate via `git diff --name-only --diff-filter=U`, `appendIncomplete` with `reason='merge-in-tree-conflict'`, `break` the loop (tree left wedged for user).
4. **D-04 per-success cleanup** when `mergeResult.ok`: push `mergeResult.changeId.slice(0, 12)` to `merged[]`, then **try/catch** `opts.vcs.workspace.remove(ws.path)` (non-force). On caught error (D-07: non-force refusing dirty tree IS the feature), push `agentBookmark` to `surplusBookmarks` — DO NOT re-throw. Pattern reference: Pitfall 5 in RESEARCH §"Common Pitfalls".

#### `FanInResult` frozen-JSON return pattern (verbatim from jj/parallel.ts:535-542)

```typescript
return Object.freeze({
	merged: Object.freeze(merged.slice()) as readonly string[],
	conflicted,
	conflictedPaths: Object.freeze(conflictedPaths.slice()) as readonly string[],
	incompleteQueued,
	failedReaped: Object.freeze(failedReaped.slice()) as readonly string[],
	surplusBookmarks: Object.freeze(surplusBookmarks.slice()) as readonly string[],
}) satisfies FanInResult;
```

Identical — D-13 shape lock.

#### Crashed-agent classification pattern (mirror jj/parallel.ts:496-533 with backend swap)

jj uses `performJjReap` + re-resolved current heads from `jj workspace list`. Git swaps to:
- per-result with `exitCode !== 0`: `git rev-parse worktree-agent-<agentId>` for branch tip;
- `git status --porcelain` (from the agent's worktree path) for clean-tree probe;
- emit `IncompleteWorkEntry(reason='crashed-with-uncommitted-work', changeIdShort: <branchTipShortSha>, workspacePath: ws.path, subagentName: ws.name)` per D-06.
- `failedReaped.push(ws.name)` regardless of cleanliness (matches jj at line 530 — name only, not branch/path).

Match: structural — same "classify by exitCode, write to queue, list in failedReaped" shape.

---

### `sdk/src/vcs/backends/git.ts` (MODIFY — wire-in replaces throwing stub)

**Analog:** `sdk/src/vcs/backends/jj.ts:34` (import) + `sdk/src/vcs/backends/jj.ts:1255-1264` (wire-in)

#### Import pattern (mirror backends/jj.ts:34)

```typescript
import { performJjParallelDispatch, performJjParallelFanIn } from '../jj/parallel.js';
```

Git-side: add adjacent to existing imports (around `backends/git.ts:33` where `readIncomplete` from `'../jj/incomplete-work.js'` lives):

```typescript
import { performGitParallelDispatch, performGitParallelFanIn } from '../git/parallel.js';
```

Also verify whether `VcsNotImplementedError` import at `backends/git.ts:31` still has consumers after the stub removal — if not, delete the import (grep before deleting).

#### Wire-in replacement pattern (verbatim shape from backends/jj.ts:1255-1264 — change `Jj` → `Git`)

```typescript
// Phase 9 (VCS-16, PARALLEL-01/02): cross-backend parallel namespace.
// Delegates to UPSTREAM-02 sidecar in sdk/src/vcs/jj/parallel.ts.
parallel: Object.freeze({
	dispatch: (opts: ParallelDispatchOpts): ParallelDispatchHandle =>
		performJjParallelDispatch({ mainRepoRoot: cwd, vcs: { workspace }, ...opts }),
	fanIn: (
		handle: ParallelDispatchHandle,
		results: readonly ParallelAgentResult[],
	): FanInResult => performJjParallelFanIn(cwd, handle, results),
}),
```

Replaces `backends/git.ts:723-734` (the current throwing stub):

```typescript
// CURRENT (delete):
parallel: Object.freeze({
	dispatch(): never {
		throw new VcsNotImplementedError(
			'workspace.parallel.dispatch is not yet implemented on the git backend; Phase 10 ships the body',
		);
	},
	fanIn(): never {
		throw new VcsNotImplementedError(
			'workspace.parallel.fanIn is not yet implemented on the git backend; Phase 10 ships the body',
		);
	},
}),
```

The replacement is ≈8 LOC; the rest of the `workspace = Object.freeze({...})` block stays unchanged. Type imports for `ParallelDispatchOpts`, `ParallelDispatchHandle`, `ParallelAgentResult`, `FanInResult` already exist in the type-imports block (added in Phase 9 for the throwing stub).

---

### `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` (NEW — contract test)

**Analog:** `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` (entire file, 430 lines — verbatim structural template)

#### Header / docblock pattern (mirror cmd-parallel-jj.test.ts:1-34)

```typescript
/**
 * sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts — Phase 9 plan 05 (TEST-13 + TEST-14)
 * ...
 * Structural rules (locked by 09-CONTEXT + 09.05-PLAN):
 *   - Pattern A: `describe.sequential.skipIf(!jjAvailable)` per scenario (D-15).
 *   - Pattern B: random-prefix `mkdtemp` to guard against parallel-test-FILE
 *     collisions under `tmpdir()` (D-15 / Pitfall 9).
 *   - W2 lifecycle lock-in: each value of N ∈ {2, 3, 4} owns its OWN describe
 *     block (top-level for-loop wraps `describe.sequential.skipIf(...)`).
 *   - W3 (a) joint-assertion lock-in (D-16): the in-tree-conflict scenario is
 *     a SINGLE `it` block asserting (i) `conflicted === true`, (ii)
 *     `conflictedPaths` populated, (iii) queue entry with
 *     `reason === 'merge-in-tree-conflict'`. NOT split across `it` blocks.
 *   - Never use retry config; never use a skip modifier on describe/it/test.
 */
```

Git-side: same shape, swap to "Phase 10 plan NN (TEST-13 git contract tests + TEST-15 amended/dropped per D-11)".

#### Skip-if pattern (mirror cmd-parallel-jj.test.ts:44-50)

```typescript
let jjAvailable = false;
try {
	execSync('jj --version', { stdio: 'pipe' });
	jjAvailable = true;
} catch {
	// jj not on PATH; every describe in this file skips.
}
```

Git-side: change `jj` to `git`. Use `gitAvailable`.

#### Repo fixture setup pattern (research §"Test fixture (Pattern B mkdtemp + Pattern A skipIf)")

The git-side fixture replaces the jj-init block. Research already drafted the exact body:

```typescript
function setupGitRepo(): string {
	const dir = mkdtempSync(
		join(
			tmpdir(),
			`gsd-git-parallel-${Math.random().toString(36).slice(2, 10)}-`,
		),
	);
	execSync('git init -q -b main', { cwd: dir, stdio: 'pipe' });
	execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
	execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
	execSync('git config commit.gpgsign false', { cwd: dir, stdio: 'pipe' });
	writeFileSync(join(dir, 'seed.txt'), 'seed\n');
	execSync('git add seed.txt', { cwd: dir, stdio: 'pipe' });
	execSync('git commit -qm seed', { cwd: dir, stdio: 'pipe' });
	mkdirSync(join(dir, '.planning', 'phases', '10-test'), { recursive: true });
	return dir;
}
```

Note the `commit.gpgsign false` line — empirically required during research (no key in CI).

#### W2 lifecycle (for-loop over N) pattern (verbatim from cmd-parallel-jj.test.ts:96-110)

```typescript
for (const N of [2, 3, 4] as const) {
	describe.sequential.skipIf(!jjAvailable)(
		`workspace.parallel — N=${N} clean dispatch + fanIn + divergent() topology`,
		() => {
			let dir: string;
			let vcs: ReturnType<typeof createJjAdapter>;

			beforeAll(() => {
				dir = setupJjRepo();
				vcs = createJjAdapter(dir);
			});

			afterAll(() => {
				if (dir) rmSync(dir, { recursive: true, force: true });
			});
```

Git-side: swap `jjAvailable` → `gitAvailable`, `createJjAdapter` → `createGitAdapter`, `setupJjRepo` → `setupGitRepo`. Skip the TEST-14 `divergent()` topology assertion (jj-specific) — git-side has no equivalent, per D-11.

#### W3 (a) joint-assertion pattern (verbatim from cmd-parallel-jj.test.ts:204-295 — Pitfall 7 in RESEARCH)

ONE `it` block — DO NOT split. Asserts all three of:
- `result.conflicted === true`
- `result.conflictedPaths.length > 0`
- `readIncomplete(...).some(e => e.reason === 'merge-in-tree-conflict')` is true

```typescript
it('N=2 in-tree-conflict: conflicted===true AND conflictedPaths populated AND queue entry reason="merge-in-tree-conflict" — ALL THREE in ONE scenario', { timeout: 30000 }, () => {
	// ...
	// ── Assertion (i): the conflicted boolean (D-08 surface) is true.
	expect(result.conflicted).toBe(true);
	// ── Assertion (ii): conflictedPaths populated.
	expect(result.conflictedPaths.length).toBeGreaterThan(0);
	// ── Assertion (iii): queue file has an entry with reason==='merge-in-tree-conflict'.
	expect(queue.some((e) => e.reason === 'merge-in-tree-conflict')).toBe(true);
});
```

#### Idempotency re-call scenario (NEW — git-side-unique; see RESEARCH Open Q4)

This scenario has no jj-side equivalent (jj's single-op fanIn can't half-merge). Pattern: dispatch N=3, force a conflict on the 2nd merge, first fanIn returns `merged:[<shaA>], conflicted:true`. Resolve manually via `execSync('git add . && git commit -qm "resolve" ...')`. Re-invoke fanIn with the SAME handle → asserts `merged:[<shaC>]` (per-call, NOT cumulative — see Pitfall 3 in RESEARCH).

---

### `scripts/lint-vcs-no-raw-git.allow.json` (MODIFY — net +1 entry)

**Analog:** Existing entry at line 7 — `sdk/src/vcs/backends/git.ts` (same schema, same owner):

```json
{ "path": "sdk/src/vcs/backends/git.ts", "reason": "VCS adapter internals — the git backend implementation; raw `git` is the substrate.", "owner": "@LoganDark" }
```

#### New entry pattern (matches the 23 existing entries — schema `{path, reason, owner}` per `$schema_version: 2`)

```json
{ "path": "sdk/src/vcs/git/parallel.ts", "reason": "VCS adapter internals — git-side parallel-dispatch substrate; raw `git worktree`/`merge`/`branch -D` are the substrate the cross-backend `workspace.parallel.*` surface wraps.", "owner": "@LoganDark" }
```

**Schema constraints (from `feedback_solo_dev_no_expires` memory):**
- NO `expires` field — solo-dev override of REQUIREMENTS-LINT-02 per `$migration_note` at line 3.
- Use `path` (not `glob`) — single-file entry.
- Insert lexicographically NEAR `sdk/src/vcs/backends/git.ts` (line 7) for grouped readability; the lint script reads the array linearly so order is not load-bearing.

Net diff: **+1 entry** (planner action — the only allowlist change this phase).

---

### `.planning/REQUIREMENTS.md` (MODIFY — D-10 + D-11 amendments)

**Analog:** n/a — in-place markdown edits. Edits are content changes, not pattern copies.

#### D-10: PARALLEL-02 git-side wording (line 16)

**Current:**
```
- [x] **PARALLEL-02**: ... git uses N-parent `git merge --no-ff <p1>...<pN>` + batched `git update-ref -d`.
```

**Amended to:**
```
- [x] **PARALLEL-02**: ... git iterates per-branch 2-parent `git merge --no-ff <agentBookmark>` + per-success `git branch -D`; halts on first conflict; idempotent under re-call via `merge-base --is-ancestor` skip.
```

#### D-11: TEST-15 wording (line 68)

Either **delete TEST-15** (TEST-13 git-side happy-path subsumes it) OR reframe:

**Current:**
```
- [ ] **TEST-15**: git N-parent octopus fixture. `git merge --no-ff <p1> <p2> <p3>` octopus form for N≥3 verified cross-version (ARCHITECTURE-researcher's open question).
```

**Reframed alternative:**
```
- [ ] **TEST-15**: git per-branch loop happy-path: N successful 2-parent merges produce N entries in `merged[]` for N ∈ {2, 3, 4} verified cross-version.
```

CONTEXT.md D-11 leaves the choice between delete/reframe to the planner. RESEARCH.md §"State of the Art" leans drop (TEST-13 happy-path subsumes); CONTEXT.md "Recommendation" is silent. Planner picks one.

---

### `.planning/ROADMAP.md` (MODIFY — D-09 amendment)

**Analog:** n/a — in-place markdown edit.

#### D-09: Phase 10 SC3 wording (line 87)

**Current:**
```
3. `git merge --no-ff <p1> <p2> <p3>` octopus form for N≥3 verified on test-fixture across CI git versions; `git worktree remove --force` is forbidden in the cross-backend path (non-force only).
```

**Amended to:**
```
3. Per-branch 2-parent `git merge --no-ff <agentBookmark>` loop verified on test-fixture across CI git versions; halt-on-conflict + re-call via `merge-base --is-ancestor` skip; `git worktree remove --force` is forbidden in the cross-backend path (non-force only).
```

---

## Shared Patterns

### Sidecar discipline (UPSTREAM-02 mirror)

**Source:** `sdk/src/vcs/jj/parallel.ts` (the established Phase 9 sidecar precedent)
**Apply to:** `sdk/src/vcs/git/parallel.ts`

- **One-way dependency:** sidecar does NOT import from `backends/git.ts`. Backend imports sidecar; never the reverse.
- **Validators inline:** never `import { validateRefname } from '../refs-validator.js'` if the equivalent inline regex is short enough. Mirror `jj/parallel.ts:92-114`.
- **`vcsExec` is the sole subprocess primitive:** no `import { spawnSync } from 'node:child_process'`. D-16 carry. CI-blocking lint at `scripts/lint-vcs-no-raw-git.cjs` enforces this; the allowlist entry exists EXPLICITLY because the sidecar IS the substrate (allowed) — but the discipline-internal rule is still "go through `vcsExec`".

### Pure-JSON frozen returns (SDK shape law)

**Source:** `sdk/src/vcs/jj/parallel.ts:270-289` (handle) + `:535-542` (FanInResult)
**Apply to:** Every return statement in `sdk/src/vcs/git/parallel.ts`

```typescript
return Object.freeze({
	// ... all fields are plain JSON: strings, numbers, booleans, frozen arrays ...
	workspaces: Object.freeze(
		slots.map((s) => Object.freeze({ /* plain JSON only */ })),
	),
}) satisfies <Type>;
```

- No closures, no methods, no Symbols, no class instances.
- Inner arrays use `Object.freeze(arr.slice()) as readonly string[]` pattern.
- Survives `gsd-sdk query` JSON round-trip (D-16 carry).

### Cross-backend queue write (`appendIncomplete`)

**Source:** `sdk/src/vcs/jj/incomplete-work.ts:71-85` (cross-backend home despite `jj/` path — see `backends/git.ts:33` already importing `readIncomplete` from this module)
**Apply to:** ALL `IncompleteWorkEntry` writes in `sdk/src/vcs/git/parallel.ts` (both D-06 crash-classification and D-08 in-tree-conflict producers)

```typescript
import { appendIncomplete } from '../jj/incomplete-work.js';

const entry: IncompleteWorkEntry = {
	subagentName: ws.name,
	changeIdShort: tipSha.slice(0, 12),
	workspacePath: ws.path,
	reason: 'merge-in-tree-conflict' /* or 'crashed-with-uncommitted-work' */,
};
appendIncomplete(handle.phaseRoot, entry);
```

- `appendIncomplete` is internally `mkdir -p`-safe per Phase 9 CR-02 fix; callers do NOT need to materialize `phaseRoot` before invocation.
- Reason union is closed; the parse-time validator at `incomplete-work.ts:147-151` rejects unknown reasons. Phase 10 adds a PRODUCER; D-15 LOCKED — does NOT extend the union.

### Plain-for-loop sync-vcsExec serialization (Pitfall 5 protection)

**Source:** `sdk/src/vcs/jj/parallel.ts:204-222` (verbatim shape)
**Apply to:** `performGitParallelDispatch`'s worktree-add loop

- Use `for (let i = 0; i < plan.length; i++)` — NOT `Promise.all`, NOT `await`, NOT async.
- Inline comment at the loop header MUST cite Pitfall 5 verbatim (CONTEXT.md D-05 mandates this).
- `spawnSync` blocking is the structural protection; intra-process serialization is automatic from the runtime.

### W3 (a) joint-assertion in tests (D-16 / Pitfall 7)

**Source:** `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts:227-295` (ONE `it` block covering 3 assertions)
**Apply to:** the in-tree-conflict scenario in `cmd-parallel-git.test.ts`

- ALL THREE assertions in ONE `it` block: `conflicted === true`, `conflictedPaths.length > 0`, queue entry with `reason==='merge-in-tree-conflict'`.
- Never split across multiple `it` blocks (vitest test isolation would rebuild the fixture; the conflict-fixture state wouldn't survive).
- No `retry: N` in `vitest.config.ts` (TEST-16 LOCKED).
- No `describe.skip` / `it.skip` (skip-count baseline mechanism at `scripts/check-skip-count.cjs` is CI-blocking; counts MUST match origin/main post-v1.3).

## No Analog Found

All Phase 10 deliverables have direct in-tree analogs. **There are no "no analog" files.** The git-side sidecar is a structural mirror of the jj-side sidecar (already shipped & green), with one explicit divergence in the fanIn body shape (D-01 loop reframe).

## Metadata

**Analog search scope:**
- `sdk/src/vcs/jj/` — sidecar precedents (parallel.ts, incomplete-work.ts, reap.ts)
- `sdk/src/vcs/backends/` — wire-in precedents (jj.ts:34 import + jj.ts:1255-1264 wire)
- `sdk/src/vcs/__tests__/` — test pattern precedents (cmd-parallel-jj.test.ts)
- `scripts/lint-vcs-no-raw-git.allow.json` — schema precedent (23 existing entries)
- `bin/lib/worktree-safety.cjs` — the existing wave-cleanup body Phase 10 lifts into TS (informational; not directly an analog because the lift target is TS-shaped, not cjs-shaped)

**Files scanned:** 6 production analogs + 1 test analog + 1 config analog = 8

**Pattern extraction date:** 2026-05-15

**Key insight from analog analysis:** Phase 10 is a **structural mirror with one deliberate divergence (D-01 fanIn loop reframe)**. The closest analog (`sdk/src/vcs/jj/parallel.ts`) is verbatim 1:1 at the file-header, import, validator, dispatch-loop, manifest-write, and frozen-JSON-return layers. The fanIn body diverges from jj's single-N-parent shape to a per-branch loop — but the cross-backend `FanInResult` shape (D-13 LOCKED) and the `appendIncomplete` queue-write contract (D-15 LOCKED) are preserved. The planner can treat 80% of `git/parallel.ts` as "structural copy + change `jj` → `git` literals", and the remaining 20% (fanIn loop body) as "compose `vcs.workspace.merge` + `vcs.workspace.remove` in a halt-on-conflict per-iteration loop" per the patterns documented above.
