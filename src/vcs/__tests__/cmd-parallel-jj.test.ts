/**
 * sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts — Phase 9 plan 05 (TEST-13 + TEST-14)
 *
 * Behavioral gate for Phase 9: covers `vcs.workspace.parallel.{dispatch,fanIn}`
 * on the jj backend across N ∈ {2, 3, 4} clean fan-in, the in-tree-conflict
 * joint assertion (D-16 / W3 (a) — ALL THREE assertions co-located in ONE `it`
 * block), the crashed-worker queue-entry scenario, and the TEST-14
 * `jj log -r 'divergent()'` topology proof.
 *
 * Structural rules (locked by 09-CONTEXT + 09.05-PLAN):
 *   - Pattern A: `describe.sequential.skipIf(!jjAvailable)` per scenario
 *     (D-15). Tests cannot run when `jj --version` is unavailable.
 *   - Pattern B: random-prefix `mkdtemp` to guard against parallel-test-FILE
 *     collisions under `tmpdir()` (D-15 / Pitfall 9).
 *   - W2 lifecycle lock-in: each value of N ∈ {2, 3, 4} owns its OWN describe
 *     block (top-level for-loop wraps `describe.sequential.skipIf(...)`, NOT
 *     `it(...)`). Each describe has its own `beforeAll` (fresh `mkdtemp`) and
 *     `afterAll` (`rmSync`), so N=2's state cannot leak into N=3 or N=4.
 *   - W3 (a) joint-assertion lock-in (D-16): the in-tree-conflict scenario is
 *     a SINGLE `it` block asserting (i) `conflicted === true`, (ii)
 *     `conflictedPaths` populated, (iii) queue entry with
 *     `reason === 'merge-in-tree-conflict'`. The queue entry is produced by
 *     fanIn itself (per plan 09.03 action §7 W3 (a)), NOT by reap. D-16 is NOT
 *     split across multiple `it` blocks.
 *   - Never use retry config; never use a skip modifier on describe/it/test
 *     (D-15 / Pitfall 9). Flakes are fixed at the fixture level — not papered
 *     over.
 *
 * `handle.phaseRoot` must exist on disk before fanIn enqueues a queue entry
 * (parallel.ts:140 contract: "`appendIncomplete` create the queue file lazily;
 * `mkdir -p` is the caller's responsibility"). The setup helper materializes
 * `.planning/phases/09-test/` so `derivePhaseRoot(repo, 9)` resolves to an
 * existing directory.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createJjAdapter } from '../backends/jj.cjs';
import { readIncomplete } from '../jj/incomplete-work.cjs';

// Phase 19 (19-11): the fork CLI bridge module (sdk/src/query/
// workspace-parallel-dispatch.ts) is retired; the PORT-02 router's
// VCS_VERB_TABLE carries the same (args, projectDir) -> {data} contract.
async function loadWorkspaceParallelDispatchVerb() {
	const ns = (await import('../../vcs-command-router.cjs')) as Record<string, unknown>;
	const mod = ((ns as { default?: unknown }).default ?? ns) as {
		VCS_VERB_TABLE: Record<
			string,
			(args: string[], projectDir: string) => Promise<{ data: unknown }> | { data: unknown }
		>;
	};
	return mod.VCS_VERB_TABLE['workspace.parallel.dispatch'];
}


let jjAvailable = false;
try {
	execSync('jj --version', { stdio: 'pipe' });
	jjAvailable = true;
} catch {
	// jj not on PATH; every describe in this file skips.
}

/**
 * Build a fresh colocated jj repo under a random-prefix mkdtemp. The repo has
 * one seed change with `seed.txt` so `@-` is a non-root parent that
 * `createPhaseStructure(repo, '@-', 9)` can fork from. Also pre-creates the
 * phase-9 phase directory so `derivePhaseRoot` resolves to an existing path
 * for `appendIncomplete`.
 *
 * Pattern B: random suffix on the prefix string guards against the
 * parallel-test-FILE collision mode documented in Phase 4 LEARNINGS /
 * 09-CONTEXT D-15 (Pitfall 9).
 */
function setupJjRepo(): string {
	const dir = mkdtempSync(
		join(
			tmpdir(),
			`gsd-jj-parallel-${Math.random().toString(36).slice(2, 10)}-`,
		),
	);
	execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
	execSync('jj config set --repo user.email "test@test.com"', {
		cwd: dir,
		stdio: 'pipe',
	});
	execSync('jj config set --repo user.name "Test"', {
		cwd: dir,
		stdio: 'pipe',
	});
	writeFileSync(join(dir, 'seed.txt'), 'seed\n');
	execSync('jj squash -B @ -k -m "seed"', { cwd: dir, stdio: 'pipe' });
	// Materialize .planning/phases/09-test/ so derivePhaseRoot(repo, 9) resolves
	// to an existing dir. The `09-` prefix is what derivePhaseRoot scans for at
	// parallel.ts:147 (`d === padded || d.startsWith(`${padded}-`)`).
	mkdirSync(join(dir, '.planning', 'phases', '09-test'), { recursive: true });
	return dir;
}

// ───────────────────────────────────────────────────────────────────────────
// W2 lifecycle lock-in: for-loop wraps `describe.sequential.skipIf(...)`. Each
// iteration N ∈ {2, 3, 4} produces an INDEPENDENT describe with its own
// beforeAll(setupJjRepo) and afterAll(rmSync). Vitest evaluates describe
// callbacks synchronously during collection — the for-loop runs at module-load
// time, registering three sibling describes. State cannot leak across N values.
// ───────────────────────────────────────────────────────────────────────────

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

			// End-to-end clean-path scenario for this N. Combined into ONE `it`
			// block because each describe owns ONE dispatched octopus structure
			// (re-dispatching into the same dir would collide on the already-
			// created `phase-09-subagent-{idx}` workspace names — jj rejects
			// duplicate workspace adds). The TEST-14 `divergent()` assertion is
			// folded in at the end so it runs against the post-fanIn topology
			// the same scenario just produced.
			//
			// Per-test timeout 30s: each scenario shells out ~N×6 jj subprocesses
			// (dispatch + N squashes + fanIn fan-out + probe + divergent log),
			// and the default 5s budget runs hot for N ∈ {3, 4} on machines
			// under load. No retry config (D-15) — timeout adjustment is the
			// approved knob.
			it(`N=${N}: dispatch creates ${N} distinct change_ids; clean fanIn returns conflicted===false, merged.length===1, workspaces reaped; post-fanIn divergent() is empty`, { timeout: 30000 }, () => {
				const plan = Array.from({ length: N }, (_, i) => ({
					agentId: `agent-${i + 1}`,
					planId: `plan-${i + 1}`,
				}));
				const handle = vcs.workspace.parallel.dispatch({
					plan,
					phaseNumber: 9,
					mainBookmarks: ['main'],
				});
				// Dispatch invariants (TEST-13, first must_have): N workspaces,
				// distinct change_ids, frozen pure-JSON handle (D-05).
				expect(handle.workspaces.length).toBe(N);
				const baseRevs = new Set(handle.workspaces.map((w) => w.baseRev));
				expect(baseRevs.size).toBe(N);
				expect(Object.isFrozen(handle)).toBe(true);
				expect(Object.isFrozen(handle.workspaces)).toBe(true);
				expect(Object.isFrozen(handle.workspaces[0])).toBe(true);
				for (let i = 0; i < N; i++) {
					expect(handle.workspaces[i].agentId).toBe(`agent-${i + 1}`);
				}
				expect(handle.phaseRoot).toContain('09-test');
				// Phase 11 D-01 (Plan 11-09 WR-01): no orchestrator-managed sidecar
				// state; `handle.manifest` is the empty string by contract (mirrors
				// `bin/lib/worktree-safety.cjs::reconstructHandleFromLegacyPlan`).
				expect(handle.manifest).toBe('');

				// Simulate clean work in each workspace: each agent edits a
				// DISTINCT file (`agent-N.txt`) so the octopus merge has nothing
				// to conflict on. Squash into the workspace's `@` so the head
				// carries the diff (parallels `jj-octopus.test.ts:67-68`).
				for (let i = 0; i < N; i++) {
					const ws = handle.workspaces[i];
					writeFileSync(
						join(ws.path, `agent-${i + 1}.txt`),
						`clean work ${i + 1}\n`,
					);
					execSync(`jj squash -B @ -k -m "subagent ${i + 1} clean"`, {
						cwd: ws.path,
						stdio: 'pipe',
					});
				}

				// Clean fanIn (TEST-13, second must_have): merged carries the
				// single N-parent merge change_id; conflicted is false; no
				// queue entries.
				const result = vcs.workspace.parallel.fanIn(
					handle,
					handle.workspaces.map((w) => ({
						agentId: w.agentId,
						exitCode: 0,
					})),
				);
				expect(result.conflicted).toBe(false);
				expect(result.conflictedPaths.length).toBe(0);
				expect(result.merged.length).toBe(1);
				expect(result.incompleteQueued).toBe(0);
				expect(result.failedReaped.length).toBe(0);

				// Phase 11 D-02 (cross-phase amendment): bookmark plumbing is
				// retired on jj — the FanInResult.surplusBookmarks field stays on
				// the type contract but is `[]` by construction on the clean
				// branch. The post-fanIn workspace SET is now the source-of-truth
				// for "the dispatched subagents are accounted for." Filter matches
				// the octopus.ts:300 workspace-name shape `phase-${phaseTag}-subagent-{idx}`
				// (parseJjWorkspaceList projects jj's `name` field into
				// `WorkspaceInfo.path`, so `path` is the workspace NAME not an fs
				// path). On the clean branch fanIn now reaps all dispatched
				// workspaces (cleanup is wired by Phase 16.02 CLEANUP-02 — clean
				// fanIn reaps all dispatched workspaces via the locked helper),
				// so the post-fanIn count is 0.
				const phaseTag = String(9).padStart(2, '0');
				const remainingWorkspaces = vcs.workspace.list().filter((w) =>
					w.path.startsWith(`phase-${phaseTag}-subagent-`),
				);
				expect(remainingWorkspaces.length).toBe(0);

				// CLEANUP-02 D-15: every dispatched workspace dir is gone post-
				// clean-fanIn (mirror cmd-parallel-cancel-jj.test.ts:118-121
				// shape). The clean-path branch in performJjParallelFanIn calls
				// cleanupSubagentWorkspaces(mainRepoRoot, phaseNumber, workspaces)
				// directly per D-07 TS-direct call — bypasses the CLI bridge.
				for (const ws of handle.workspaces) {
					expect(existsSync(ws.path)).toBe(false);
				}

				// TEST-14 topology assertion: post-fanIn `divergent()` is empty.
				// Runs against the same post-fanIn state the scenario just
				// produced — the octopus collapsed cleanly into a single merge
				// change at `@`, so no divergent change_ids exist anywhere.
				const r = execSync(
					`jj --repository ${dir} log -r 'divergent()' --no-graph -T 'change_id ++ "\\n"'`,
					{ encoding: 'utf-8' },
				);
				expect(r.trim()).toBe('');
			});
		},
	);
}

// ───────────────────────────────────────────────────────────────────────────
// W3 (a) joint-assertion lock-in (D-16): ONE `it` block asserts ALL THREE of
// (i) conflicted === true, (ii) conflictedPaths populated, (iii) queue entry
// with reason === 'merge-in-tree-conflict'. The queue entry is produced by
// fanIn itself (parallel.ts:359 — `appendIncomplete(handle.phaseRoot, ...)`
// under the `conflicted` branch), NOT by reap.
// ───────────────────────────────────────────────────────────────────────────

describe.sequential.skipIf(!jjAvailable)(
	'workspace.parallel — in-tree conflict joint assertion (D-16, W3 (a))',
	() => {
		let dir: string;
		let vcs: ReturnType<typeof createJjAdapter>;

		beforeAll(() => {
			dir = setupJjRepo();
			// Seed CONFLICT.txt at the root change BEFORE dispatch — every
			// subsequent workspace forks from this state, so all N workspaces
			// see "base content\n" as the file's value at fork time.
			writeFileSync(join(dir, 'CONFLICT.txt'), 'base content\n');
			execSync('jj squash -B @ -k -m "seed conflict file"', {
				cwd: dir,
				stdio: 'pipe',
			});
			vcs = createJjAdapter(dir);
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
				phaseNumber: 9,
				mainBookmarks: ['main'],
			});
			// Workspace 1: CONFLICT.txt = "version A\n"
			writeFileSync(
				join(handle.workspaces[0].path, 'CONFLICT.txt'),
				'version A\n',
			);
			execSync('jj squash -B @ -k -m "subagent 1 work"', {
				cwd: handle.workspaces[0].path,
				stdio: 'pipe',
			});
			// Workspace 2: CONFLICT.txt = "version B\n"
			writeFileSync(
				join(handle.workspaces[1].path, 'CONFLICT.txt'),
				'version B\n',
			);
			execSync('jj squash -B @ -k -m "subagent 2 work"', {
				cwd: handle.workspaces[1].path,
				stdio: 'pipe',
			});
			// Both agents exit cleanly — exitCode 0. The fanIn-side W3 (a)
			// producer (parallel.ts:348-365) is the one expected to enqueue,
			// because both `clean` agents produced an N-parent octopus that
			// itself carries an in-tree conflict on CONFLICT.txt.
			const result = vcs.workspace.parallel.fanIn(handle, [
				{ agentId: 'agent-1', exitCode: 0 },
				{ agentId: 'agent-2', exitCode: 0 },
			]);
			// ── Assertion (i): the conflicted boolean (D-08 surface) is true.
			expect(result.conflicted).toBe(true);
			// ── Assertion (ii): conflictedPaths populated. The
			// `enumerateConflictedPaths` sidecar (jj/conflict-paths.ts) returns
			// either the actual file path or `'<UNRESOLVABLE>'` when the
			// `jj resolve --list` enumeration fails or prints nothing. Both
			// outcomes are acceptable here — the load-bearing invariant is
			// "the array is non-empty".
			expect(result.conflictedPaths.length).toBeGreaterThan(0);
			expect(
				result.conflictedPaths.some(
					(p) => p.includes('CONFLICT.txt') || p === '<UNRESOLVABLE>',
				),
			).toBe(true);
			// ── Assertion (iii): the queue file at handle.phaseRoot now has an
			// IncompleteWorkEntry with reason === 'merge-in-tree-conflict'.
			// readIncomplete is the parser side of the same on-disk format the
			// fanIn producer writes (incomplete-work.ts). It enforces the
			// Phase 9 D-09 closed-union — an unknown reason would throw here.
			const queue = readIncomplete(handle.phaseRoot);
			expect(queue.some((e) => e.reason === 'merge-in-tree-conflict')).toBe(
				true,
			);
			// Bonus: incompleteQueued counter reflects the enqueue.
			expect(result.incompleteQueued).toBeGreaterThanOrEqual(1);
			// On the conflicted path the main bookmark was NOT advanced — so
			// `merged` is empty (no clean merge change_id to report).
			expect(result.merged.length).toBe(0);
			// Phase 11 D-02 (cross-phase amendment): `surplusBookmarks` is `[]`
			// by construction — the bookmark plumbing retired. The dispatched
			// workspace SET is LEFT INTACT on the conflicted path so the user
			// can inspect the conflicted state; the post-fanIn count equals N
			// (number of dispatched subagents). Filter targets `WorkspaceInfo.path`
			// which carries jj's workspace NAME, not an fs path (see
			// parseJjWorkspaceList contract).
			const phaseTag = String(9).padStart(2, '0');
			const remainingWorkspaces = vcs.workspace.list().filter((w) =>
				w.path.startsWith(`phase-${phaseTag}-subagent-`),
			);
			expect(remainingWorkspaces.length).toBe(handle.workspaces.length);

			// CLEANUP-02 D-15 / CF-03 / AP-5 (W3 (a) joint-assertion lock-in):
			// conflicted-branch workspaces MUST persist on disk for human
			// inspection. This is the INVERSE polarity of the clean-path
			// assertion (which expects existsSync === false). If any code in
			// performJjParallelFanIn's `if (conflicted)` block ever starts
			// calling cleanupSubagentWorkspaces (or inlines rmSync), this
			// regression guard will trip — preserving the W3 (a) contract
			// that workspaces must persist on the conflicted branch.
			for (const ws of handle.workspaces) {
				expect(existsSync(ws.path)).toBe(true);
			}
		});
	},
);

// ───────────────────────────────────────────────────────────────────────────
// Crashed-worker scenario: one agent crashes (exitCode 1) with uncommitted
// work in its workspace `@`. fanIn's reap branch (parallel.ts:429-449) routes
// the crashed workspace through `performJjReap`, which classifies the
// non-empty head as `crashed-with-uncommitted-work` and appends to the queue.
// ───────────────────────────────────────────────────────────────────────────

describe.sequential.skipIf(!jjAvailable)(
	'workspace.parallel — crashed worker queue entry',
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

		it('one crashed worker (exitCode: 1, uncommitted work): queue entry reason="crashed-with-uncommitted-work"', { timeout: 30000 }, () => {
			const handle = vcs.workspace.parallel.dispatch({
				plan: [
					{ agentId: 'agent-1', planId: 'plan-1' },
					{ agentId: 'agent-2', planId: 'plan-2' },
				],
				phaseNumber: 9,
				mainBookmarks: ['main'],
			});
			// Workspace 1: clean work that squashes into `@`.
			writeFileSync(join(handle.workspaces[0].path, 'clean.txt'), 'clean\n');
			execSync('jj squash -B @ -k -m "subagent 1 clean"', {
				cwd: handle.workspaces[0].path,
				stdio: 'pipe',
			});
			// Workspace 2: crashed — non-empty `@` (auto-snapshot via `jj st`),
			// no explicit squash. This mirrors the fixture mechanism at
			// jj-reap.test.ts:115-151 — the WC content moves INTO `@` via the
			// auto-snapshot, so reap sees a non-empty head to classify.
			writeFileSync(
				join(handle.workspaces[1].path, 'crashed-work.txt'),
				'partial output\n',
			);
			execSync('jj st', { cwd: handle.workspaces[1].path, stdio: 'pipe' });
			// agent-2 reports exitCode 1 + a stderr. fanIn's reap branch picks
			// up the workspace and routes through performJjReap.
			const result = vcs.workspace.parallel.fanIn(handle, [
				{ agentId: 'agent-1', exitCode: 0 },
				{ agentId: 'agent-2', exitCode: 1, stderr: 'crashed' },
			]);
			// Queue carries the crashed-worker entry.
			expect(result.incompleteQueued).toBeGreaterThanOrEqual(1);
			const queue = readIncomplete(handle.phaseRoot);
			expect(
				queue.some((e) => e.reason === 'crashed-with-uncommitted-work'),
			).toBe(true);

			// Phase 16 REVIEW WR-01 / CR-01 regression guard: forensic-
			// preservation guard (mirrors the conflicted-branch guard at
			// lines 333-343). The IncompleteWorkEntry's `workspacePath` field
			// must point to a LIVE on-disk directory so the human reviewer
			// can recover partial work. The crashed agent (agent-2 → index 1)
			// must be excluded from the clean-path cleanupSubagentWorkspaces
			// call in performJjParallelFanIn — see CR-01 fix at parallel.ts
			// :478-489. The clean agent (agent-1 → index 0) is fanned-in and
			// its workspace IS reaped on the clean path, so we only assert
			// preservation for index 1.
			expect(existsSync(handle.workspaces[1].path)).toBe(true);
		});
	},
);

// ───────────────────────────────────────────────────────────────────────────
// Parse-time reason validation (covers plan 09.02 task 3): readIncomplete
// must throw on an unknown `reason` value in the queue file. This is the
// Phase 9 D-09 closed-union invariant — the parser is the load-bearing gate
// that the D-14 phase-merge gate (backends/jj.ts:182-194) relies on for
// fail-safe blocking.
// ───────────────────────────────────────────────────────────────────────────

describe.sequential.skipIf(!jjAvailable)(
	'readIncomplete parse-time validation (Phase 9 D-09 closed-union)',
	() => {
		let phaseDir: string;

		beforeAll(() => {
			phaseDir = mkdtempSync(
				join(
					tmpdir(),
					`gsd-jj-parse-${Math.random().toString(36).slice(2, 10)}-`,
				),
			);
		});

		afterAll(() => {
			if (phaseDir) rmSync(phaseDir, { recursive: true, force: true });
		});

		it('throws on unknown reason value', () => {
			// Phase 9 CR-01: queue format is now JSONL.
			writeFileSync(
				join(phaseDir, 'incomplete-work.md'),
				JSON.stringify({
					subagentName: 'subagent-1',
					changeIdShort: 'abc123def456',
					workspacePath: '/tmp/x',
					reason: 'garbage-value',
				}) + '\n',
			);
			expect(() => readIncomplete(phaseDir)).toThrow(/unknown reason/);
		});

		it('accepts both known reason values without throwing', () => {
			// Overwrite with two entries — one of each known reason. Parser
			// must accept both and return them in order. Phase 9 CR-01: queue
			// format is now JSONL.
			writeFileSync(
				join(phaseDir, 'incomplete-work.md'),
				[
					JSON.stringify({
						subagentName: 'subagent-1',
						changeIdShort: 'abc123def456',
						workspacePath: '/tmp/x',
						reason: 'crashed-with-uncommitted-work',
					}),
					JSON.stringify({
						subagentName: 'phase-09-merge',
						changeIdShort: 'def456abc123',
						workspacePath: '/tmp/y',
						reason: 'merge-in-tree-conflict',
					}),
					'',
				].join('\n'),
			);
			const entries = readIncomplete(phaseDir);
			expect(entries.length).toBe(2);
			expect(entries[0].reason).toBe('crashed-with-uncommitted-work');
			expect(entries[1].reason).toBe('merge-in-tree-conflict');
		});
	},
);

// ───────────────────────────────────────────────────────────────────────────
// PARALLEL-08 (Phase 14.1 SC5) scenarios: 3 new describes covering the
// bookmark-less / empty-mainBookmarks / all-or-nothing-validation surface
// the type rename + CF-02 fan-in loop landed in this same plan.
//
// Pattern reuse:
//   - setupJjRepo IS bookmark-less by construction (no `jj bookmark create main`
//     in setup per RESEARCH Pitfall 5) — REUSE AS-IS for scenario 1.
//   - Pattern A (`describe.sequential.skipIf(!jjAvailable)`) + Pattern B
//     (`mkdtemp` random suffix) preserved per W2 lifecycle lock-in.
//   - User preference (per CONTEXT Discretion item): new describes get grep
//     affordance via `'workspace.parallel — ... (PARALLEL-08 SC5 scenario N)'`
//     in the describe title.
// ───────────────────────────────────────────────────────────────────────────

describe.sequential.skipIf(!jjAvailable)(
	'workspace.parallel — bookmark-less / empty mainBookmarks (PARALLEL-08 SC5 scenario 1)',
	() => {
		let dir: string;
		let vcs: ReturnType<typeof createJjAdapter>;

		beforeAll(() => {
			// setupJjRepo() is bookmark-less by construction — no `jj bookmark
			// create main` in the seed (Pitfall 5).
			dir = setupJjRepo();
			vcs = createJjAdapter(dir);
		});

		afterAll(() => {
			if (dir) rmSync(dir, { recursive: true, force: true });
		});

		it('empty mainBookmarks: fan-in skips bookmark set, merge lands at @', { timeout: 30000 }, () => {
			const handle = vcs.workspace.parallel.dispatch({
				plan: [
					{ agentId: 'agent-1', planId: 'plan-1' },
					{ agentId: 'agent-2', planId: 'plan-2' },
				],
				phaseNumber: 9,
				// mainBookmarks intentionally OMITTED — tests the undefined
				// → frozen([]) default path.
			});
			// Pre-fan-in probe: `main` does not exist as a bookmark in this repo.
			const preProbe = execSync(
				`jj log -r 'present(main)' --no-graph -T 'change_id ++ "\\n"' --repository ${dir}`,
				{ encoding: 'utf-8' },
			).trim();
			expect(preProbe).toBe('');

			// Simulate clean work in each workspace (mirrors the existing
			// N=2/3/4 scenarios at lines 153-167 — agent-i edits agent-i.txt).
			for (let i = 0; i < handle.workspaces.length; i++) {
				const ws = handle.workspaces[i];
				writeFileSync(
					join(ws.path, `agent-${i + 1}.txt`),
					`clean work ${i + 1}\n`,
				);
				execSync(`jj squash -B @ -k -m "subagent ${i + 1} clean"`, {
					cwd: ws.path,
					stdio: 'pipe',
				});
			}

			// Fan-in with empty mainBookmarks: must succeed and skip the
			// bookmark advance step entirely.
			const result = vcs.workspace.parallel.fanIn(
				handle,
				handle.workspaces.map((w) => ({
					agentId: w.agentId,
					exitCode: 0,
				})),
			);
			expect(result.conflicted).toBe(false);
			expect(result.merged.length).toBe(1);

			// Post-fan-in probe: `main` STILL does not exist as a bookmark.
			// The merge landed at @ via the N-parent `jj new`; no `jj bookmark
			// set main` ever ran. CF-02 contract: "skip the advance entirely
			// when mainBookmarks is empty/omitted."
			const postProbe = execSync(
				`jj log -r 'present(main)' --no-graph -T 'change_id ++ "\\n"' --repository ${dir}`,
				{ encoding: 'utf-8' },
			).trim();
			expect(postProbe).toBe('');
		});
	},
);

describe.sequential.skipIf(!jjAvailable)(
	'workspace.parallel — non-empty mainBookmarks advance (PARALLEL-08 SC5 scenario 2)',
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

		it('mainBookmarks: [name1, name2] advances each name to merge head', { timeout: 30000 }, () => {
			const handle = vcs.workspace.parallel.dispatch({
				plan: [
					{ agentId: 'agent-1', planId: 'plan-1' },
					{ agentId: 'agent-2', planId: 'plan-2' },
				],
				phaseNumber: 9,
				// TWO names — jj `bookmark set` is CREATE-or-UPDATE, so neither
				// needs to pre-exist. Both advance to the merge head at @
				// post-fan-in.
				mainBookmarks: ['release', 'integration'],
			});

			// Simulate clean work.
			for (let i = 0; i < handle.workspaces.length; i++) {
				const ws = handle.workspaces[i];
				writeFileSync(
					join(ws.path, `agent-${i + 1}.txt`),
					`clean work ${i + 1}\n`,
				);
				execSync(`jj squash -B @ -k -m "subagent ${i + 1} clean"`, {
					cwd: ws.path,
					stdio: 'pipe',
				});
			}

			const result = vcs.workspace.parallel.fanIn(
				handle,
				handle.workspaces.map((w) => ({
					agentId: w.agentId,
					exitCode: 0,
				})),
			);
			expect(result.conflicted).toBe(false);
			expect(result.merged.length).toBe(1);
			const mergeChangeId = result.merged[0];

			// Both names resolve to the merge head change_id.
			const releaseChange = execSync(
				`jj log -r 'release' --no-graph -T 'change_id ++ "\\n"' --repository ${dir}`,
				{ encoding: 'utf-8' },
			).trim();
			const integrationChange = execSync(
				`jj log -r 'integration' --no-graph -T 'change_id ++ "\\n"' --repository ${dir}`,
				{ encoding: 'utf-8' },
			).trim();
			expect(releaseChange).toBe(mergeChangeId);
			expect(integrationChange).toBe(mergeChangeId);
		});
	},
);

describe.sequential.skipIf(!jjAvailable)(
	'workspace.parallel — all-or-nothing pre-validation (PARALLEL-08 SC5 scenario 3)',
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

		it('non-empty mainBookmarks with one invalid name throws BEFORE any bookmark set; no partial advance', { timeout: 30000 }, () => {
			const handle = vcs.workspace.parallel.dispatch({
				plan: [
					{ agentId: 'agent-1', planId: 'plan-1' },
					{ agentId: 'agent-2', planId: 'plan-2' },
				],
				phaseNumber: 9,
				// `bad ref` trips validateMainBookmark's
				// /^[A-Za-z0-9._/-]+$/ rejection — SPACE is not in the
				// character class. (Consecutive dots, e.g. `bad..ref`, would
				// ACTUALLY pass the jj-side validator's class because `.` IS
				// in the class — the cross-backend git-side `validateRefname`
				// is the stricter validator that rejects `..`. Use the
				// jj-rejected `bad ref` here so the throw fires deterministically
				// on the jj validator.)
				mainBookmarks: ['valid-name', 'bad ref', 'another-valid'],
			});

			// Simulate clean work.
			for (let i = 0; i < handle.workspaces.length; i++) {
				const ws = handle.workspaces[i];
				writeFileSync(
					join(ws.path, `agent-${i + 1}.txt`),
					`clean work ${i + 1}\n`,
				);
				execSync(`jj squash -B @ -k -m "subagent ${i + 1} clean"`, {
					cwd: ws.path,
					stdio: 'pipe',
				});
			}

			// This test does raw `jj log --repository <main>` (bypassing
			// the adapter) for state probes. In production the adapter
			// handles staleness inside fanIn; here we update-stale manually
			// because we read main's view before calling fanIn. D-13
			// forbids --ignore-working-copy on read probes, so update-stale
			// is the canonical refresh (no-op when already fresh).
			execSync(`jj workspace update-stale --repository ${dir}`, {
				cwd: dir,
				stdio: 'pipe',
			});

			// Snapshot pre-state: neither valid-name nor another-valid exists
			// as a bookmark.
			const preValid = execSync(
				`jj log -r 'present(valid-name)' --no-graph -T 'change_id ++ "\\n"' --repository ${dir}`,
				{ encoding: 'utf-8' },
			).trim();
			const preAnotherValid = execSync(
				`jj log -r 'present(another-valid)' --no-graph -T 'change_id ++ "\\n"' --repository ${dir}`,
				{ encoding: 'utf-8' },
			).trim();
			expect(preValid).toBe('');
			expect(preAnotherValid).toBe('');

			// Fan-in throws on validateMainBookmark('bad ref') BEFORE any
			// `jj bookmark set` runs. CF-02 all-or-nothing contract.
			expect(() =>
				vcs.workspace.parallel.fanIn(
					handle,
					handle.workspaces.map((w) => ({
						agentId: w.agentId,
						exitCode: 0,
					})),
				),
			).toThrow(/parallel: main bookmark name "bad ref"/);

			// Snapshot post-throw: neither valid name was advanced.
			// All-or-nothing pre-validation rejected the whole batch before
			// any side effect.
			const postValid = execSync(
				`jj log -r 'present(valid-name)' --no-graph -T 'change_id ++ "\\n"' --repository ${dir}`,
				{ encoding: 'utf-8' },
			).trim();
			const postAnotherValid = execSync(
				`jj log -r 'present(another-valid)' --no-graph -T 'change_id ++ "\\n"' --repository ${dir}`,
				{ encoding: 'utf-8' },
			).trim();
			expect(postValid).toBe('');
			expect(postAnotherValid).toBe('');
		});
	},
);


// ───────────────────────────────────────────────────────────────────────────
// CONFIG-02 (Phase 14 plan 02 — D-03 mitigation):
// Contract tests for the `parallelization_disabled` envelope at the CLI
// bridge (`sdk/src/query/workspace-parallel-dispatch.ts`). The envelope
// returns BEFORE `createVcsAdapter` is called, so this describe block does
// NOT need `jj git init --colocate` — a plain `mkdtemp` with a
// `.planning/config.json` file is sufficient. No `jjAvailable` / `gitAvailable`
// gate either: the code path under test is backend-agnostic.
//
// Replaces the in-the-wild "this repo's `parallelization: false` is
// preserved" invariant fixture that was retired by Phase 14 Plan 01's
// permanent flip of this repo's `.planning/config.json` to `true`.
// See `.planning/phases/14-default-flip-dogfood-validation/14-CONTEXT.md`
// §D-03 mitigation.
// ───────────────────────────────────────────────────────────────────────────

describe('CONFIG-02 — parallelization_disabled', () => {
	// Phase 18 (CLEANUP-07 / Phase 14 WR-05): describe-scoped tmpDir + per-test
	// cleanup — these 3 tests previously leaked one mkdtemp dir each per run.
	// Safe as a shared `let`: vitest runs same-file `it`s serially.
	let tmpDir: string;

	afterEach(async () => {
		// Phase 18 REVIEW IN-02: guard like every sibling afterAll — if a
		// test's mkdtemp rejected, tmpDir is undefined and rm(undefined) would
		// layer ERR_INVALID_ARG_TYPE over the real failure.
		if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
	});

	it('returns {ok:false, reason:parallelization_disabled} when .planning/config.json has explicit false', async () => {
		tmpDir = await mkdtemp(
			join(tmpdir(), `gsd-cfg02-jj-${Math.random().toString(36).slice(2, 10)}-`),
		);
		await mkdir(join(tmpDir, '.planning'), { recursive: true });
		await writeFile(
			join(tmpDir, '.planning', 'config.json'),
			JSON.stringify({ parallelization: false }),
		);

		const workspaceParallelDispatchQuery = await loadWorkspaceParallelDispatchVerb();
		const plan = JSON.stringify([{ agentId: 'a', planId: 'p' }]);
		const res = await workspaceParallelDispatchQuery(
			['--phase', '14', '--main-bookmark', 'main', '--plan', plan],
			tmpDir,
		);
		const data = res.data as {
			ok?: boolean;
			reason?: string;
			message?: string;
		};
		expect(data.ok).toBe(false);
		expect(data.reason).toBe('parallelization_disabled');
		expect(typeof data.message).toBe('string');
		// D-08: message must guide the user to the canonical unblock path
		// (set `parallelization: true` explicitly).
		expect(data.message).toMatch(/parallelization: true/);
	});

	it('does NOT fire envelope when .planning/config.json omits parallelization key', async () => {
		tmpDir = await mkdtemp(
			join(tmpdir(), `gsd-cfg02-jj-${Math.random().toString(36).slice(2, 10)}-`),
		);
		await mkdir(join(tmpDir, '.planning'), { recursive: true });
		// D-07: missing-key resolves via loadConfig's defaults-merge to
		// CONFIG_DEFAULTS.parallelization = true; envelope must NOT fire.
		await writeFile(
			join(tmpDir, '.planning', 'config.json'),
			JSON.stringify({ workflow: {} }),
		);

		const workspaceParallelDispatchQuery = await loadWorkspaceParallelDispatchVerb();
		const plan = JSON.stringify([{ agentId: 'a', planId: 'p' }]);
		// The envelope is the ONLY surface under test. Past the envelope,
		// the handler proceeds to adapter dispatch — which throws because
		// tmpDir is not a real VCS repo. Either outcome (return without the
		// envelope reason, or throw) proves the envelope did not fire.
		let envelopeReason: string | undefined;
		try {
			const res = await workspaceParallelDispatchQuery(
				['--phase', '14', '--main-bookmark', 'main', '--plan', plan],
				tmpDir,
			);
			const data = res.data as { reason?: string };
			envelopeReason = data.reason;
		} catch {
			// adapter-dispatch crash proves the envelope did NOT short-circuit.
			envelopeReason = undefined;
		}
		expect(envelopeReason).not.toBe('parallelization_disabled');
	});

	it('does NOT fire envelope when .planning/config.json has explicit true', async () => {
		tmpDir = await mkdtemp(
			join(tmpdir(), `gsd-cfg02-jj-${Math.random().toString(36).slice(2, 10)}-`),
		);
		await mkdir(join(tmpDir, '.planning'), { recursive: true });
		await writeFile(
			join(tmpDir, '.planning', 'config.json'),
			JSON.stringify({ parallelization: true }),
		);

		const workspaceParallelDispatchQuery = await loadWorkspaceParallelDispatchVerb();
		const plan = JSON.stringify([{ agentId: 'a', planId: 'p' }]);
		let envelopeReason: string | undefined;
		try {
			const res = await workspaceParallelDispatchQuery(
				['--phase', '14', '--main-bookmark', 'main', '--plan', plan],
				tmpDir,
			);
			const data = res.data as { reason?: string };
			envelopeReason = data.reason;
		} catch {
			envelopeReason = undefined;
		}
		expect(envelopeReason).not.toBe('parallelization_disabled');
	});
});
