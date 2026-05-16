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
			expect(crashEntry?.changeIdShort).toBeIdOf({ kind: 'git', allowShort: true });
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

// ───────────────────────────────────────────────────────────────────────────
// CR-01 regression scenario (Phase 10 plan 05 — closes SC2 gap from
// 10-VERIFICATION.md): unlike the existing crashed-worker scenario at line
// 313 which exercises an UNCOMMITTED dirty tree (branch tip == baseRev → the
// `merge-base --is-ancestor` probe shortcut hides the defect), this scenario
// COMMITS partial work in agent-2's workspace BEFORE the simulated crash.
// agent-2's branch tip moves PAST baseRev, so the ancestor probe at
// parallel.ts:335 would NOT skip it; without the crashedAgentIds gate
// (parallel.ts STEP 1, line ~323), `git merge --no-ff worktree-agent-agent-2`
// would silently merge the partial work into main. The new gate routes the
// crashed agent exclusively through STEP 2's classifier — proven here by
// asserting (a) merged.length === 1 (agent-1 only), (b) the queue carries a
// 'crashed-with-uncommitted-work' entry for agent-2, (c) agent-2's branch
// tip is NOT in main's ancestry.
//
// Joint-assertion lock-in (W3 (a) / Pitfall 7) — single `it` block.
// changeIdShort assertion uses the `toBeIdOf` matcher (project preference per
// `feedback_vitest_extend_over_free_fn` memory; also avoids deepening the
// pre-existing lint-vcs-no-commit-id failure at line 355 that plan 10-06
// closes).
// ───────────────────────────────────────────────────────────────────────────

describe.sequential.skipIf(!gitAvailable)(
	'workspace.parallel — committed-then-crashed agent (CR-01 regression)',
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

		it('routes committed-then-crashed agent through STEP 2 classifier, not STEP 1 merge', { timeout: 30000 }, () => {
			const handle = vcs.workspace.parallel.dispatch({
				plan: [
					{ agentId: 'agent-1', planId: 'plan-1' },
					{ agentId: 'agent-2', planId: 'plan-2' },
				],
				phaseNumber: 10,
				mainBookmark: 'main',
			});

			// agent-1: clean non-conflicting commit. The fan-in loop will merge
			// this cleanly under the crashedAgentIds gate (exitCode 0 → not in
			// the crashed set → loop processes normally).
			writeFileSync(join(handle.workspaces[0].path, 'clean-a.txt'), 'clean a\n');
			execSync('git add clean-a.txt', { cwd: handle.workspaces[0].path, stdio: 'pipe' });
			execSync('git commit -qm "agent-1 clean"', { cwd: handle.workspaces[0].path, stdio: 'pipe' });

			// agent-2: CRITICAL distinction vs the existing Scenario 5 at line
			// 313 — we COMMIT the partial work before the simulated crash. This
			// moves agent-2's branch tip PAST baseRev. Without the
			// crashedAgentIds gate, `git merge-base --is-ancestor
			// worktree-agent-agent-2 HEAD` would return non-zero (tip is NOT an
			// ancestor of pre-merge HEAD), the probe would fall through, and
			// `git merge --no-ff worktree-agent-agent-2` would silently absorb
			// the partial work into main. The gate prevents this by skipping
			// agent-2 in STEP 1 entirely.
			writeFileSync(join(handle.workspaces[1].path, 'partial.txt'), 'partial work before crash\n');
			execSync('git add partial.txt', { cwd: handle.workspaces[1].path, stdio: 'pipe' });
			execSync('git commit -qm "agent-2 partial work before crash"', { cwd: handle.workspaces[1].path, stdio: 'pipe' });

			// Capture agent-2's branch tip SHA for the ancestry assertion below.
			// Run rev-parse from the MAIN repo root (the ref is reachable from
			// the shared object DB regardless of which worktree checked it out).
			const agent2Tip = execSync('git rev-parse worktree-agent-agent-2', { cwd: dir }).toString().trim();
			const agent2WorkspaceName = handle.workspaces[1].name;

			// fanIn with agent-2 reporting exitCode 1. The crashedAgentIds gate
			// at STEP 1 (parallel.ts ~line 323) filters agent-2 out before the
			// merge-base probe; STEP 2's classifier picks it up via the
			// `result.exitCode !== 0` branch and writes the queue entry.
			const result = vcs.workspace.parallel.fanIn(handle, [
				{ agentId: 'agent-1', exitCode: 0 },
				{ agentId: 'agent-2', exitCode: 1, stderr: 'simulated crash after partial commit' },
			]);

			// agent-1 merged cleanly; agent-2's partial commit was NOT absorbed.
			expect(result.merged.length).toBe(1);
			expect(result.incompleteQueued).toBeGreaterThanOrEqual(1);
			expect(result.failedReaped).toContain(agent2WorkspaceName);

			// STEP 2 classifier wrote a `crashed-with-uncommitted-work` entry
			// for agent-2 (with the branch tip's short-SHA in changeIdShort).
			const queue = readIncomplete(handle.phaseRoot);
			const crashEntry = queue.find((e) => e.reason === 'crashed-with-uncommitted-work' && e.subagentName === agent2WorkspaceName);
			expect(crashEntry).toBeDefined();
			expect(crashEntry?.subagentName).toBe(agent2WorkspaceName);
			expect(crashEntry?.changeIdShort).toBeIdOf({ kind: 'git', allowShort: true });
			expect(crashEntry?.workspacePath).toBeTruthy();

			// Branch-ancestry proof: agent-2's tip SHA must NOT be an ancestor
			// of HEAD. This is what falsifies CR-01's pre-fix behavior — the
			// gate bypasses STEP 1 for agent-2, so no merge commit was created
			// absorbing its partial work. Use spawnSync (non-throwing) because
			// non-zero exit is the EXPECTED success signal here.
			expect(spawnSync('git', ['merge-base', '--is-ancestor', agent2Tip, 'HEAD'], { cwd: dir }).status).not.toBe(0);
		});
	},
);

// ───────────────────────────────────────────────────────────────────────────
// CR-02 regression scenario (Phase 10 plan 05 — closes SC3 gap from
// 10-VERIFICATION.md): pre-seed an unrelated `worktree-agent-foo` branch in
// the test repo BEFORE creating the adapter or dispatching. Without the
// expectedNames gate at STEP 3 (parallel.ts ~line 461), the repo-scoped
// `for-each-ref refs/heads/worktree-agent-*` glob would enumerate the
// pre-seeded branch and report it as surplus — polluting the cross-handle
// contract field. The gate scopes the audit to handle.workspaces; the
// pre-seeded branch is NOT in this handle's expected set and is correctly
// skipped.
//
// Joint-assertion lock-in (W3 (a) / Pitfall 7) — single `it` block. We also
// defensively assert the pre-seeded branch is STILL ALIVE in the repo after
// fanIn returns (we never touched it; the audit just doesn't flag it).
// ───────────────────────────────────────────────────────────────────────────

describe.sequential.skipIf(!gitAvailable)(
	'workspace.parallel — handle-scoped surplus audit (CR-02 regression)',
	() => {
		let dir: string;
		let vcs: ReturnType<typeof createGitAdapter>;

		beforeAll(() => {
			dir = setupGitRepo();
			// Pre-seed an unrelated `worktree-agent-foo` branch at HEAD BEFORE
			// creating the adapter or dispatching. This simulates the
			// real-world scenario where the repo already has other
			// `worktree-agent-*` branches in flight (e.g., from a sibling
			// handle that has not yet been cleaned up). The expectedNames gate
			// at STEP 3 must skip this branch — it is not in THIS handle's
			// workspace set.
			execSync('git branch worktree-agent-foo HEAD', { cwd: dir, stdio: 'pipe' });
			vcs = createGitAdapter(dir);
		});

		afterAll(() => {
			if (dir) rmSync(dir, { recursive: true, force: true });
		});

		it('pre-seeded unrelated worktree-agent-foo branch is not flagged as surplus', { timeout: 30000 }, () => {
			const handle = vcs.workspace.parallel.dispatch({
				plan: [
					{ agentId: 'agent-1', planId: 'plan-1' },
					{ agentId: 'agent-2', planId: 'plan-2' },
				],
				phaseNumber: 10,
				mainBookmark: 'main',
			});

			// Clean non-conflicting commits in each workspace — both agents
			// will merge cleanly and per-success cleanup will remove their
			// branches.
			writeFileSync(join(handle.workspaces[0].path, 'agent-1.txt'), 'agent-1\n');
			execSync('git add agent-1.txt', { cwd: handle.workspaces[0].path, stdio: 'pipe' });
			execSync('git commit -qm "agent-1 clean"', { cwd: handle.workspaces[0].path, stdio: 'pipe' });

			writeFileSync(join(handle.workspaces[1].path, 'agent-2.txt'), 'agent-2\n');
			execSync('git add agent-2.txt', { cwd: handle.workspaces[1].path, stdio: 'pipe' });
			execSync('git commit -qm "agent-2 clean"', { cwd: handle.workspaces[1].path, stdio: 'pipe' });

			const result = vcs.workspace.parallel.fanIn(handle, [
				{ agentId: 'agent-1', exitCode: 0 },
				{ agentId: 'agent-2', exitCode: 0 },
			]);

			// Primary assertion: the pre-seeded foo branch is NOT in
			// surplusBookmarks. With the expectedNames gate, STEP 3's audit
			// only considers branches that match handle.workspaces' expected
			// names.
			expect(result.surplusBookmarks).not.toContain('worktree-agent-foo');

			// Defensive sanity check: the pre-seeded branch is STILL ALIVE in
			// the repo (we never touched it; the audit simply doesn't flag
			// it).
			// Use spawnSync with an argv array — `execSync` would route through
			// `/bin/sh -c` which interprets `%(refname:short)`'s parens as a
			// subshell, and the bare `*` as a glob. Argv form sidesteps both.
			const aliveBranches = spawnSync('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads/worktree-agent-*'], { cwd: dir }).stdout.toString().trim().split('\n').filter((s) => s.length > 0);
			expect(aliveBranches).toContain('worktree-agent-foo');

			// Clean fan-in invariant: handle.workspaces' agent branches were
			// cleaned up by per-success cleanup; pre-seeded foo is excluded by
			// the expectedNames filter; total surplus is 0.
			expect(result.surplusBookmarks.length).toBe(0);
		});
	},
);
