/**
 * sdk/src/vcs/__tests__/cmd-parallel-git.test.ts — Phase 10 plan 04
 *   (TEST-13 git contract + TEST-15 reframed per D-11 + TEST-16 Pattern B)
 *
 * Behavioral gate for Phase 10: covers `vcs.workspace.parallel.{dispatch,fanIn}`
 * on the git backend across N ∈ {2, 3, 4} clean fan-in (Scenarios 1/2/3 — the
 * D-11-reframed TEST-15 happy-path proof for N successful 2-parent merges
 * producing N entries in `merged[]`), the in-tree-conflict joint assertion
 * (Scenario 4 — D-17 / W3 (a) — ALL THREE assertions co-located in ONE `it`
 * block), the crashed-worker queue-entry scenario (Scenario 5), and the
 * git-side-unique idempotency re-call scenario (Scenario 6 — absorbs TEST-15
 * idempotency proof per D-11; D-03 stateless `merge-base --is-ancestor` skip).
 *
 * Structural mirror of `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts`
 * (430 lines, Phase 9 plan 05). Deliberate divergences vs jj-side analog:
 *   1. `git` substituted for `jj` in fixture setup commands.
 *   2. The TEST-14 jj-revset topology assertion is DROPPED (jj-specific —
 *      git commit graphs do not have an analogous divergence revset; D-11).
 *   3. NEW Scenario 6 (idempotency re-call) absorbs the D-11-reframed TEST-15
 *      proof of D-03's stateless probe semantics. No jj-side equivalent —
 *      jj's single-op N-parent merge cannot half-merge.
 *
 * Structural rules (locked by 10-CONTEXT + 10.04-PLAN):
 *   - Pattern A: `describe.sequential.skipIf(!gitAvailable)` per scenario
 *     (D-15 carry). Tests cannot run when `git --version` is unavailable.
 *   - Pattern B: random-prefix `mkdtemp` to guard against parallel-test-FILE
 *     collisions under `tmpdir()` (D-17 carry / Pitfall 9 / TEST-16).
 *   - W2 lifecycle lock-in: each value of N ∈ {2, 3, 4} owns its OWN describe
 *     block (top-level for-loop wraps `describe.sequential.skipIf(...)`, NOT
 *     `it(...)`). Each describe has its own `beforeAll` (fresh `mkdtemp`) and
 *     `afterAll` (`rmSync`), so N=2's state cannot leak into N=3 or N=4.
 *   - W3 (a) joint-assertion lock-in (Pitfall 7 in 10-RESEARCH; D-17 carry):
 *     the in-tree-conflict scenario is a SINGLE `it` block asserting (i)
 *     `conflicted === true`, (ii) `conflictedPaths` populated, (iii) queue
 *     entry with `reason === 'merge-in-tree-conflict'`. The queue entry is
 *     produced by fanIn itself (parallel.ts:376 — `appendIncomplete` under
 *     the conflicted branch), NOT by reap. NOT split across multiple `it`
 *     blocks (vitest test isolation would rebuild the fixture; the conflict-
 *     fixture state would not survive).
 *   - The idempotency re-call scenario (Scenario 6) is also ONE `it` block —
 *     same Pitfall 7 / D-17 joint-assertion logic. The two-call sequence
 *     (first conflict → user-resolves → second clean) cannot survive a
 *     fixture rebuild between sub-assertions.
 *   - Never use retry config (TEST-16 LOCKED — no `retry: N` anywhere); never
 *     use a skip modifier on describe/it/test. Flakes are fixed at the
 *     fixture level — not papered over.
 *
 * `handle.phaseRoot` materialization: `appendIncomplete` is internally
 * `mkdir -p`-safe per Phase 9 CR-02 fix (`incomplete-work.ts:71-85`), so the
 * fixture does NOT need to pre-create `.planning/phases/10-…/` before
 * dispatch. `derivePhaseRoot` resolves to a padded-numeric fallback if no
 * matching dir exists; the queue file's lazy-create handles the rest.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { createGitAdapter } from '../backends/git.js';
import { readIncomplete } from '../jj/incomplete-work.js';

let gitAvailable = false;
try {
	execSync('git --version', { stdio: 'pipe' });
	gitAvailable = true;
} catch {
	// git not on PATH; every describe in this file skips.
}

/**
 * Build a fresh git repo under a random-prefix mkdtemp. The repo has one seed
 * commit with `seed.txt` so HEAD is a non-root parent that
 * `performGitParallelDispatch` can fork agent worktrees from.
 *
 * Pattern B: random suffix on the prefix string guards against the
 * parallel-test-FILE collision mode documented in 10-RESEARCH §"Common
 * Pitfalls" Pitfall 9 / TEST-16 / D-17.
 *
 * `commit.gpgsign false` is empirically required: environments with global
 * commit signing enabled would otherwise hang on the seed commit waiting for
 * a key that's not present in the test environment.
 */
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
	// Materialize the phase-10 phase dir so `derivePhaseRoot(repo, 10)` resolves
	// to an existing path. Optional per Phase 9 CR-02 (appendIncomplete is
	// mkdir-safe), but pre-creating gives readIncomplete a stable lookup point.
	mkdirSync(join(dir, '.planning', 'phases', '10-test'), { recursive: true });
	return dir;
}

// ───────────────────────────────────────────────────────────────────────────
// W2 lifecycle lock-in: for-loop wraps `describe.sequential.skipIf(...)`. Each
// iteration N ∈ {2, 3, 4} produces an INDEPENDENT describe with its own
// beforeAll(setupGitRepo) and afterAll(rmSync). Vitest evaluates describe
// callbacks synchronously during collection — the for-loop runs at module-load
// time, registering three sibling describes. State cannot leak across N values.
//
// Scenarios 1-3 are the D-11-reframed TEST-15 happy-path proof: N successful
// 2-parent merges produce N entries in `merged[]` for N ∈ {2, 3, 4}. This is
// the REQ-ID-covering assertion that TEST-15's reframed wording calls out.
// ───────────────────────────────────────────────────────────────────────────

for (const N of [2, 3, 4] as const) {
	describe.sequential.skipIf(!gitAvailable)(
		`workspace.parallel — N=${N} clean dispatch + fanIn`,
		() => {
			let dir: string;
			let vcs: ReturnType<typeof createGitAdapter>;

			beforeAll(() => {
				dir = setupGitRepo();
				vcs = createGitAdapter(dir);
			});

			afterAll(() => {
				if (dir) rmSync(dir, { recursive: true, force: true });
			});

			// End-to-end clean-path scenario for this N. Combined into ONE `it`
			// block because each describe owns ONE dispatched worktree set
			// (re-dispatching into the same dir would collide on the already-
			// created `worktree-agent-<id>` branches — git rejects the duplicate
			// `git worktree add -b <branch>` invocation).
			//
			// Per-test timeout 30s: each scenario shells out ~N×4 git subprocesses
			// (dispatch + N file-edits/commits + fanIn loop iterations + audit).
			// No retry config (TEST-16 LOCKED) — timeout adjustment is the
			// approved knob.
			it(`N=${N}: clean fanIn returns merged.length===${N}, conflicted===false, surplusBookmarks empty`, { timeout: 30000 }, () => {
				const plan = Array.from({ length: N }, (_, i) => ({
					agentId: `agent-${i + 1}`,
					planId: `plan-${i + 1}`,
				}));
				const handle = vcs.workspace.parallel.dispatch({
					plan,
					phaseNumber: 10,
					mainBookmark: 'main',
				});
				// Dispatch invariants (TEST-13, first must_have): N workspaces,
				// frozen pure-JSON handle (D-14 carry / D-13 shape lock).
				expect(handle.workspaces.length).toBe(N);
				expect(Object.isFrozen(handle)).toBe(true);
				expect(Object.isFrozen(handle.workspaces)).toBe(true);
				expect(Object.isFrozen(handle.workspaces[0])).toBe(true);
				for (let i = 0; i < N; i++) {
					expect(handle.workspaces[i].agentId).toBe(`agent-${i + 1}`);
				}
				expect(handle.manifest).toBeTruthy();

				// Simulate clean work in each workspace: each agent edits a
				// DISTINCT file (`agent-N.txt`) so each per-branch 2-parent
				// merge has nothing to conflict on. Commit via raw git in the
				// workspace dir — the test file is allowlisted for raw subprocess
				// per the existing `sdk/src/vcs/__tests__/**` glob entry.
				for (let i = 0; i < N; i++) {
					const ws = handle.workspaces[i];
					writeFileSync(
						join(ws.path, `agent-${i + 1}.txt`),
						`clean work ${i + 1}\n`,
					);
					execSync(`git add agent-${i + 1}.txt`, { cwd: ws.path, stdio: 'pipe' });
					execSync(`git commit -qm "subagent ${i + 1} clean"`, { cwd: ws.path, stdio: 'pipe' });
				}

				// Clean fanIn (TEST-13 + TEST-15 reframed per D-11): merged
				// carries one entry PER successful 2-parent merge — N total.
				// conflicted is false; conflictedPaths empty; surplusBookmarks
				// empty (incremental cleanup successful); no queue entries.
				const result = vcs.workspace.parallel.fanIn(
					handle,
					handle.workspaces.map((w) => ({
						agentId: w.agentId,
						exitCode: 0,
					})),
				);
				expect(result.conflicted).toBe(false);
				expect(result.conflictedPaths.length).toBe(0);
				// D-11 reframed TEST-15 LOAD-BEARING assertion: N successful
				// 2-parent merges produce N entries in merged[].
				expect(result.merged.length).toBe(N);
				expect(result.surplusBookmarks.length).toBe(0);
				expect(result.incompleteQueued).toBe(0);
				expect(result.failedReaped.length).toBe(0);
			});
		},
	);
}

// ───────────────────────────────────────────────────────────────────────────
// W3 (a) joint-assertion lock-in (Pitfall 7 in 10-RESEARCH; D-17 carry): ONE
// `it` block asserts ALL THREE of (i) conflicted === true, (ii)
// conflictedPaths populated, (iii) queue entry with
// reason === 'merge-in-tree-conflict'. The queue entry is produced by fanIn
// itself (parallel.ts:376 — `appendIncomplete(handle.phaseRoot, ...)` under
// the conflicted branch), NOT by reap.
// ───────────────────────────────────────────────────────────────────────────

describe.sequential.skipIf(!gitAvailable)(
	'workspace.parallel — in-tree conflict joint assertion (D-17 carry, W3 (a))',
	() => {
		let dir: string;
		let vcs: ReturnType<typeof createGitAdapter>;

		beforeAll(() => {
			dir = setupGitRepo();
			vcs = createGitAdapter(dir);
		});

		afterAll(() => {
			if (dir) rmSync(dir, { recursive: true, force: true });
		});

		it('N=2 in-tree-conflict: conflicted===true AND conflictedPaths populated AND queue entry reason="merge-in-tree-conflict" — ALL THREE in ONE scenario', { timeout: 30000 }, () => {
			const handle = vcs.workspace.parallel.dispatch({
				plan: [
					{ agentId: 'agent-1', planId: 'plan-1' },
					{ agentId: 'agent-2', planId: 'plan-2' },
				],
				phaseNumber: 10,
				mainBookmark: 'main',
			});
			// Both agents modify the SAME line of seed.txt differently. The
			// FIRST per-branch merge (agent-1) succeeds against main (no
			// competing change yet); the SECOND (agent-2) conflicts because
			// main now has agent-1's change on the same line.
			writeFileSync(
				join(handle.workspaces[0].path, 'seed.txt'),
				'agent-1 override\n',
			);
			execSync('git add seed.txt', { cwd: handle.workspaces[0].path, stdio: 'pipe' });
			execSync('git commit -qm "subagent 1 work"', { cwd: handle.workspaces[0].path, stdio: 'pipe' });
			writeFileSync(
				join(handle.workspaces[1].path, 'seed.txt'),
				'agent-2 override\n',
			);
			execSync('git add seed.txt', { cwd: handle.workspaces[1].path, stdio: 'pipe' });
			execSync('git commit -qm "subagent 2 work"', { cwd: handle.workspaces[1].path, stdio: 'pipe' });
			// Both agents exit cleanly — exitCode 0. Agent crashes are NOT the
			// scenario being tested here; the agents finished, but their
			// per-branch merges into main collide on the second iteration.
			const result = vcs.workspace.parallel.fanIn(handle, [
				{ agentId: 'agent-1', exitCode: 0 },
				{ agentId: 'agent-2', exitCode: 0 },
			]);
			// First merge (agent-1) succeeded on main; merged.length === 1.
			expect(result.merged.length).toBe(1);
			// ── Assertion (i): the conflicted boolean (D-08 surface) is true.
			expect(result.conflicted).toBe(true);
			// ── Assertion (ii): conflictedPaths populated. The git-side
			// enumerator (`git diff --name-only --diff-filter=U` — see
			// parallel.ts:361) returns the unmerged file paths from the index.
			expect(result.conflictedPaths.length).toBeGreaterThan(0);
			expect(
				result.conflictedPaths.some((p) => p.includes('seed.txt')),
			).toBe(true);
			// ── Assertion (iii): the queue file at handle.phaseRoot now has an
			// IncompleteWorkEntry with reason === 'merge-in-tree-conflict'.
			// readIncomplete is the parser side of the same on-disk format the
			// fanIn producer writes (incomplete-work.ts). It enforces the
			// Phase 9 D-09 closed-union — an unknown reason would throw here.
			const queue = readIncomplete(handle.phaseRoot);
			expect(queue.some((e) => e.reason === 'merge-in-tree-conflict')).toBe(true);
			const conflictEntry = queue.find((e) => e.reason === 'merge-in-tree-conflict');
			expect(conflictEntry).toBeDefined();
			expect(conflictEntry?.workspacePath).toBeTruthy();
			// Bonus: incompleteQueued counter reflects the enqueue.
			expect(result.incompleteQueued).toBeGreaterThanOrEqual(1);
		});
	},
);

// ───────────────────────────────────────────────────────────────────────────
// Crashed-worker scenario (D-06 producer): one agent crashes (exitCode 1)
// with uncommitted work in its workspace. fanIn's reap branch
// (parallel.ts:408-454) classifies the crashed workspace via the
// `tipSha != baseRev || !cleanTree` predicate and appends a
// 'crashed-with-uncommitted-work' entry to the queue.
//
// D-07 invariant: non-force `worktree remove` refusing the dirty tree means
// the worktree survives on disk for human inspection — assertion checks
// `existsSync(workspacePath) === true` after fanIn returns.
// ───────────────────────────────────────────────────────────────────────────

describe.sequential.skipIf(!gitAvailable)(
	'workspace.parallel — crashed worker queue entry (D-06 + D-07)',
	() => {
		let dir: string;
		let vcs: ReturnType<typeof createGitAdapter>;

		beforeAll(() => {
			dir = setupGitRepo();
			vcs = createGitAdapter(dir);
		});

		afterAll(() => {
			if (dir) rmSync(dir, { recursive: true, force: true });
		});

		it('one crashed worker (exitCode: 1, uncommitted work): queue entry reason="crashed-with-uncommitted-work" + workspace survives on disk (D-07)', { timeout: 30000 }, () => {
			const handle = vcs.workspace.parallel.dispatch({
				plan: [
					{ agentId: 'agent-1', planId: 'plan-1' },
					{ agentId: 'agent-2', planId: 'plan-2' },
				],
				phaseNumber: 10,
				mainBookmark: 'main',
			});
			// Workspace 1: clean work that commits cleanly.
			writeFileSync(join(handle.workspaces[0].path, 'clean.txt'), 'clean\n');
			execSync('git add clean.txt', { cwd: handle.workspaces[0].path, stdio: 'pipe' });
			execSync('git commit -qm "subagent 1 clean"', { cwd: handle.workspaces[0].path, stdio: 'pipe' });
			// Workspace 2: crashed — write uncommitted dirty content but DO NOT
			// commit. The non-force `git worktree remove` will refuse to clean
			// up this worktree (D-07), and its branch tip == baseRev with a
			// dirty tree → D-06 classifier writes a crashed-with-uncommitted-work
			// queue entry.
			writeFileSync(
				join(handle.workspaces[1].path, 'dirty.txt'),
				'uncommitted partial output\n',
			);
			// agent-2 reports exitCode 1 + a stderr. fanIn's reap branch picks
			// up the workspace and routes through the D-06 classifier.
			const agent2WorkspaceName = handle.workspaces[1].name;
			const agent2WorkspacePath = handle.workspaces[1].path;
			const result = vcs.workspace.parallel.fanIn(handle, [
				{ agentId: 'agent-1', exitCode: 0 },
				{ agentId: 'agent-2', exitCode: 1, stderr: 'simulated crash' },
			]);
			// agent-1 merged successfully (one entry in merged[]).
			expect(result.merged.length).toBe(1);
			// failedReaped contains the agent-2 workspace name (NOT agentId,
			// NOT branch — matches jj-side at parallel.ts:530 / D-07 carry).
			expect(result.failedReaped).toContain(agent2WorkspaceName);
			// Queue carries the crashed-worker entry with the full classifier
			// payload.
			expect(result.incompleteQueued).toBeGreaterThanOrEqual(1);
			const queue = readIncomplete(handle.phaseRoot);
			const crashEntry = queue.find((e) => e.reason === 'crashed-with-uncommitted-work');
			expect(crashEntry).toBeDefined();
			expect(crashEntry?.subagentName).toBe(agent2WorkspaceName);
			expect(crashEntry?.changeIdShort).toMatch(/^[0-9a-f]{12}$/);
			expect(crashEntry?.workspacePath).toBeTruthy();
			// D-07: non-force worktree remove refused the dirty tree → the
			// workspace survives on disk for human inspection. The queued
			// entry's `workspacePath` IS the inspection handle (Pitfall 3
			// "preserve partial work").
			expect(existsSync(agent2WorkspacePath)).toBe(true);
		});
	},
);

// ───────────────────────────────────────────────────────────────────────────
// Idempotency re-call scenario (Scenario 6 — git-side-unique; absorbs TEST-15
// idempotency proof per D-11 reframing). N=3, agent-b conflicts mid-loop on
// the first call; user resolves via raw `git add` + `git commit`; second
// fanIn call with the SAME handle returns cleanly with merged === [agent-c
// merge-commit] only (per-call, NOT cumulative — Pitfall 3 in 10-RESEARCH).
//
// D-03 stateless probe: `git merge-base --is-ancestor <agentBranch> HEAD`
// exit 0 → already merged (skip); exit 128 / "Not a valid object name" →
// branch deleted by prior call (skip); other → process this workspace.
//
// W-2 deterministic processing order: handle.workspaces is materialized in
// plan-array order by performGitParallelDispatch, so performGitParallelFanIn
// iterates `agent-a → agent-b → agent-c`. agent-a's clean merge succeeds;
// agent-b conflicts → halt; agent-c never processed on first call.
//
// Single `it` block per the same Pitfall 7 / D-17 joint-assertion logic.
// ───────────────────────────────────────────────────────────────────────────

describe.sequential.skipIf(!gitAvailable)(
	'workspace.parallel — idempotency re-call (D-03; absorbs TEST-15 per D-11)',
	() => {
		let dir: string;
		let vcs: ReturnType<typeof createGitAdapter>;

		beforeAll(() => {
			dir = setupGitRepo();
			vcs = createGitAdapter(dir);
		});

		afterAll(() => {
			if (dir) rmSync(dir, { recursive: true, force: true });
		});

		it('N=3 fanIn re-call after manual conflict resolution: first call halts at agent-b, second call merges only agent-c (per-call, NOT cumulative)', { timeout: 60000 }, () => {
			const handle = vcs.workspace.parallel.dispatch({
				plan: [
					{ agentId: 'agent-a', planId: 'plan-a' },
					{ agentId: 'agent-b', planId: 'plan-b' },
					{ agentId: 'agent-c', planId: 'plan-c' },
				],
				phaseNumber: 10,
				mainBookmark: 'main',
			});

			// agent-a: clean non-conflicting change.
			writeFileSync(join(handle.workspaces[0].path, 'a.txt'), 'a\n');
			execSync('git add a.txt', { cwd: handle.workspaces[0].path, stdio: 'pipe' });
			execSync('git commit -qm "agent-a clean"', { cwd: handle.workspaces[0].path, stdio: 'pipe' });
			const aSha = execSync('git rev-parse HEAD', { cwd: handle.workspaces[0].path }).toString().trim();

			// agent-b: edit line 1 of seed.txt — will conflict with main's
			// post-resolution edit below.
			writeFileSync(join(handle.workspaces[1].path, 'seed.txt'), 'agent-b override\n');
			execSync('git add seed.txt', { cwd: handle.workspaces[1].path, stdio: 'pipe' });
			execSync('git commit -qm "agent-b conflicting"', { cwd: handle.workspaces[1].path, stdio: 'pipe' });
			const bSha = execSync('git rev-parse HEAD', { cwd: handle.workspaces[1].path }).toString().trim();

			// agent-c: clean non-conflicting change.
			writeFileSync(join(handle.workspaces[2].path, 'c.txt'), 'c\n');
			execSync('git add c.txt', { cwd: handle.workspaces[2].path, stdio: 'pipe' });
			execSync('git commit -qm "agent-c clean"', { cwd: handle.workspaces[2].path, stdio: 'pipe' });
			const cSha = execSync('git rev-parse HEAD', { cwd: handle.workspaces[2].path }).toString().trim();

			// Advance main with a competing edit on seed.txt line 1 — this is
			// what forces agent-b's merge to conflict (agent-b's branch tip
			// and main's HEAD both modified line 1 differently).
			writeFileSync(join(dir, 'seed.txt'), 'main override\n');
			execSync('git add seed.txt', { cwd: dir, stdio: 'pipe' });
			execSync('git commit -qm "main override"', { cwd: dir, stdio: 'pipe' });

			// First fanIn call. Per-iteration order:
			//   1. agent-a → clean merge → merged[]+=<merge-commit-sha>
			//   2. agent-b → conflicts → halt (queue entry, conflicted=true)
			//   3. agent-c → never processed (loop already broke)
			const firstResult = vcs.workspace.parallel.fanIn(handle, [
				{ agentId: 'agent-a', exitCode: 0 },
				{ agentId: 'agent-b', exitCode: 0 },
				{ agentId: 'agent-c', exitCode: 0 },
			]);
			expect(firstResult.merged.length).toBe(1); // agent-a's merge commit ONLY
			expect(firstResult.conflicted).toBe(true);
			expect(firstResult.conflictedPaths.length).toBeGreaterThan(0);
			expect(firstResult.incompleteQueued).toBe(1);
			// Ancestor-probe proof (W-2): a IS ancestor (merged), b/c are NOT.
			// `spawnSync` is the safe form for non-zero exits — `execSync`
			// throws on non-zero, which would mask the assertion.
			expect(spawnSync('git', ['merge-base', '--is-ancestor', aSha, 'HEAD'], { cwd: dir }).status).toBe(0);
			expect(spawnSync('git', ['merge-base', '--is-ancestor', bSha, 'HEAD'], { cwd: dir }).status).not.toBe(0);
			expect(spawnSync('git', ['merge-base', '--is-ancestor', cSha, 'HEAD'], { cwd: dir }).status).not.toBe(0);
			const q1 = readIncomplete(handle.phaseRoot);
			expect(q1.filter((e) => e.reason === 'merge-in-tree-conflict').length).toBe(1);

			// User-resolution simulation (raw git in `dir`, NOT a workspace):
			// resolve the wedged merge by accepting agent-b's content and
			// committing the merge. The resolution moves HEAD past agent-b's
			// branch tip — making agent-b an ancestor of HEAD on the second
			// fanIn call's D-03 probe.
			writeFileSync(join(dir, 'seed.txt'), 'agent-b override\n');
			execSync('git add seed.txt', { cwd: dir, stdio: 'pipe' });
			execSync('git commit -qm "user resolves agent-b conflict"', { cwd: dir, stdio: 'pipe' });

			// Second fanIn call with the SAME handle and the same results
			// array (D-03 stateless probe ignores `results` for the ancestor
			// decision — the probe is purely on the branch ref vs HEAD).
			//
			// Per-iteration order on the second call:
			//   1. agent-a → probe exit 128 (branch deleted in 1st call cleanup)
			//      OR exit 0 (still ancestor) → skip either way
			//   2. agent-b → probe exit 0 (now ancestor via user's commit) → skip
			//   3. agent-c → probe non-zero → process → clean merge succeeds
			const secondResult = vcs.workspace.parallel.fanIn(handle, [
				{ agentId: 'agent-a', exitCode: 0 },
				{ agentId: 'agent-b', exitCode: 0 },
				{ agentId: 'agent-c', exitCode: 0 },
			]);
			// CRITICAL (Pitfall 3 in 10-RESEARCH "per-call not cumulative"):
			// secondResult.merged contains ONLY agent-c's merge-commit SHA.
			// agent-a is NOT here (already-ancestor / branch-deleted skip).
			// agent-b is NOT here (now ancestor via user's manual commit).
			expect(secondResult.merged.length).toBe(1);
			expect(secondResult.conflicted).toBe(false);
			expect(secondResult.conflictedPaths.length).toBe(0);
			// surplusBookmarks: the user resolved agent-b's conflict by
			// finalizing the merge but did NOT delete the agent-b branch
			// (and could not, while its worktree still exists with
			// MERGE_HEAD set). The STEP-3 audit's `for-each-ref
			// refs/heads/worktree-agent-*` sweep at parallel.ts:461 picks
			// it up — that IS the audit's purpose. agent-c was just
			// cleaned by the second-call loop, agent-a was cleaned on the
			// first call, so the audit only flags agent-b. NOT a defect:
			// the audit is the surfacing surface for "branches that
			// outlived a fan-in cleanup", and agent-b qualifies.
			expect(secondResult.surplusBookmarks).toContain('worktree-agent-agent-b');
			expect(secondResult.surplusBookmarks.length).toBe(1);
			// After the second call: a/b/c are ALL ancestors of HEAD.
			expect(spawnSync('git', ['merge-base', '--is-ancestor', aSha, 'HEAD'], { cwd: dir }).status).toBe(0);
			expect(spawnSync('git', ['merge-base', '--is-ancestor', bSha, 'HEAD'], { cwd: dir }).status).toBe(0);
			expect(spawnSync('git', ['merge-base', '--is-ancestor', cSha, 'HEAD'], { cwd: dir }).status).toBe(0);
		});
	},
);
