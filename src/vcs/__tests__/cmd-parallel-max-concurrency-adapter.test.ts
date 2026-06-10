/**
 * sdk/src/vcs/__tests__/cmd-parallel-max-concurrency-adapter.test.ts
 *   — Phase 11 PARALLEL-06 behavioral coverage (Nyquist gap-fill, part 2/2)
 *
 * PARALLEL-06 (REQUIREMENTS.md:18): `dispatch({ plan, maxConcurrency })` input
 * field honored — numeric cap on concurrent agent workspaces. Default
 * `undefined`.
 *
 * This file covers the requirement's LITERAL "input field honored" surface at
 * the adapter level, exactly as 11-RESEARCH.md §"Validation Architecture"
 * planned ("extend cmd-parallel-jj.test.ts with a maxConcurrency: 2
 * scenario"): a real-backend `dispatch({ plan, maxConcurrency })` must
 *
 *   (a) ACCEPT the field without throwing — the field is on the locked
 *       `ParallelDispatchOpts` type (types.ts:464-469);
 *   (b) NOT corrupt the dispatched workspace set — `maxConcurrency` is
 *       advisory (types.ts:458-468: "advisory — backends MAY ignore (jj
 *       currently always serializes octopus structure creation in a single
 *       orchestrator process)"), so the dispatched handle's workspace
 *       projection is byte-for-byte the same whether the cap is set or omitted.
 *
 * The CLI-bridge plumbing half of PARALLEL-06 (the `--max-concurrency` flag is
 * parsed and threaded into the adapter call) lives in the sibling file
 * `cmd-parallel-max-concurrency-cli.test.ts`. This file carries NO `vi.mock`
 * so the real `createGitAdapter` dispatch body is exercised.
 *
 * Structural rules (mirror cmd-parallel-git.test.ts / TEST-16):
 *   - Pattern A: `describe.sequential.skipIf(!gitAvailable)`.
 *   - Pattern B: random-prefix `mkdtemp` against parallel-test-FILE collisions.
 *   - No `retry:` config; no `describe.skip`/`it.skip` modifiers.
 *   - Git backend chosen for the live fixture: it dispatches via plain
 *     `git worktree add` (no octopus structure), so it is lightweight and
 *     does not contend for the jj-fixture OOM budget. The advisory semantics
 *     of `maxConcurrency` are identical on both backends (neither reads the
 *     field — see jj/parallel.ts:166-176 and git/parallel.ts:139-149).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createGitAdapter } from '../backends/git.cjs';

let gitAvailable = false;
try {
	execSync('git --version', { stdio: 'pipe' });
	gitAvailable = true;
} catch {
	// git not on PATH; the live-fixture describe skips.
}

/**
 * Fresh git repo under a random-prefix mkdtemp with one seed commit, so HEAD
 * is a non-root parent that `performGitParallelDispatch` can fork agent
 * worktrees from. `commit.gpgsign false` is required so environments with
 * global commit signing do not hang the seed commit on a missing key.
 */
function setupGitRepo(): string {
	const dir = mkdtempSync(
		join(
			tmpdir(),
			`gsd-git-maxconc-${Math.random().toString(36).slice(2, 10)}-`,
		),
	);
	execSync('git init -q -b main', { cwd: dir, stdio: 'pipe' });
	execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
	execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
	execSync('git config commit.gpgsign false', { cwd: dir, stdio: 'pipe' });
	writeFileSync(join(dir, 'seed.txt'), 'seed\n');
	execSync('git add seed.txt', { cwd: dir, stdio: 'pipe' });
	execSync('git commit -qm seed', { cwd: dir, stdio: 'pipe' });
	mkdirSync(join(dir, '.planning', 'phases', '11-test'), { recursive: true });
	return dir;
}

describe.sequential.skipIf(!gitAvailable)(
	'PARALLEL-06 — adapter honors maxConcurrency advisory (git backend, live fixture)',
	() => {
		let capDir: string;
		let plainDirA: string;
		let plainDirB: string;

		beforeAll(() => {
			capDir = setupGitRepo();
			plainDirA = setupGitRepo();
			plainDirB = setupGitRepo();
		});

		afterAll(() => {
			for (const d of [capDir, plainDirA, plainDirB]) {
				if (d) rmSync(d, { recursive: true, force: true });
			}
		});

		it('dispatch({ plan, maxConcurrency: 2 }) over a 3-agent plan produces a correct, unchanged 3-workspace handle', { timeout: 30000 }, () => {
			const vcs = createGitAdapter(capDir);
			const plan = [
				{ agentId: 'agent-1', planId: 'plan-1' },
				{ agentId: 'agent-2', planId: 'plan-2' },
				{ agentId: 'agent-3', planId: 'plan-3' },
			];
			// The requirement's literal surface: pass maxConcurrency on the
			// input. The cap (2) is intentionally LOWER than plan.length (3) so
			// a backend that mis-implemented the field as a hard truncation
			// would drop a workspace — this test would then fail.
			const handle = vcs.workspace.parallel.dispatch({
				plan,
				phaseNumber: 11,
				mainBookmarks: ['main'],
				maxConcurrency: 2,
			});
			// Honored == accepted without regression: one workspace per plan
			// entry regardless of the cap value.
			expect(handle.workspaces.length).toBe(3);
			for (let i = 0; i < 3; i++) {
				expect(handle.workspaces[i].agentId).toBe(`agent-${i + 1}`);
			}
			// Distinct workspace names + paths — the dispatch materialized
			// three separate worktrees. (On git, `baseRev` is the fork point,
			// which is the SAME seed commit for all three agent branches until
			// each agent commits its own work — so workspace identity is
			// asserted via name/path, not baseRev. The jj side asserts distinct
			// baseRev because jj's createSubagentSlot makes a fresh change per
			// slot — a deliberate backend difference, not a defect.)
			const names = new Set(handle.workspaces.map((w) => w.name));
			expect(names.size).toBe(3);
			const paths = new Set(handle.workspaces.map((w) => w.path));
			expect(paths.size).toBe(3);
			// Each workspace carries a resolved fork-point revision (non-empty).
			for (const w of handle.workspaces) {
				expect(typeof w.baseRev).toBe('string');
				expect(w.baseRev.length).toBeGreaterThan(0);
			}
			expect(Object.isFrozen(handle)).toBe(true);
		});

		it('dispatch with maxConcurrency omitted yields the same workspace-set projection as dispatch with it set (advisory: no observable behavior change)', { timeout: 30000 }, () => {
			const plan = [
				{ agentId: 'agent-1', planId: 'plan-1' },
				{ agentId: 'agent-2', planId: 'plan-2' },
			];
			// Two fresh repos so the two dispatches cannot collide on worktree
			// names. The advisory contract: `maxConcurrency` does not change
			// the dispatched workspace SET — only (potentially) runtime
			// scheduling, which jj/git both ignore entirely.
			const withCap = createGitAdapter(plainDirA).workspace.parallel.dispatch({
				plan,
				phaseNumber: 11,
				mainBookmarks: ['main'],
				maxConcurrency: 1,
			});
			const withoutCap = createGitAdapter(plainDirB).workspace.parallel.dispatch({
				plan,
				phaseNumber: 11,
				mainBookmarks: ['main'],
			});
			// Same count, same agentIds, same workspace names — the cap is
			// advisory and produces no observable difference in the handle's
			// workspace projection.
			expect(withCap.workspaces.length).toBe(withoutCap.workspaces.length);
			expect(withCap.workspaces.map((w) => w.agentId)).toEqual(
				withoutCap.workspaces.map((w) => w.agentId),
			);
			expect(withCap.workspaces.map((w) => w.name)).toEqual(
				withoutCap.workspaces.map((w) => w.name),
			);
		});
	},
);
