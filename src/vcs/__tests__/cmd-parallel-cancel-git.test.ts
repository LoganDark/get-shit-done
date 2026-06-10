/**
 * sdk/src/vcs/__tests__/cmd-parallel-cancel-git.test.ts — Phase 15.04 Wave 2c
 *
 * Per-backend cancel scenarios for `vcs.workspace.parallel.cancel(handle)` on
 * the git backend. Mirrors PARALLEL-08 SC5 template (D-15 structural rules):
 *   - Pattern A: `describe.sequential.skipIf(!gitAvailable)` per scenario.
 *   - Pattern B: random-prefix `mkdtemp` via `setupGitRepo()`.
 *   - Per-scenario `beforeAll` (fresh mkdtemp) + `afterAll` (`rmSync`).
 *   - Never use retry config; never use a skip modifier on describe/it/test.
 *
 * 4 scenarios per VALIDATION lines 58-62 (mirroring jj-side
 * `cmd-parallel-cancel-jj.test.ts`):
 *   1. cancel-clean-abandon (N=2): dispatch + cancel → 2 abandoned, 0
 *      failedReaped, 2 surplusWorkspaces, worktrees gone post-cancel.
 *   2. cancel-idempotent-recall (N=1): second cancel returns all-empty
 *      arrays (D-03 invariant).
 *   3. cancel-partial-state-recovery (N=2): pre-delete one workspace dir
 *      before cancel; failedReaped.length === 0 (git body existsSync-gates
 *      to skip already-gone paths per the idempotency contract);
 *      surplusWorkspaces reflects on-disk count at entry (= 1).
 *   4. cancel returns frozen pure-JSON CancelResult — Object.isFrozen +
 *      JSON round-trip (Phase 9 D-05 invariant).
 *
 * git-side asymmetry from jj: per `performGitParallelCancel` body,
 * `abandoned[]` carries `ws.agentId` (per orchestrator-identifier
 * consistency); `surplusBookmarks` may carry `worktree-agent-*` entries
 * when the per-workspace `branch -D` returns non-zero (e.g. branch already
 * gone from a prior call). The cancel-clean-abandon scenario asserts
 * `abandoned.length === 2` AND `failedReaped.length === 0` — the
 * surplusBookmarks assertion accepts either outcome since the branch-delete
 * is per-workspace best-effort.
 *
 * N2 / Pitfall 7 mitigation: scenarios OMIT `mainBookmarks` from dispatch
 * opts entirely. Cancel is bookmark-orthogonal. No stale `mainBookmark:
 * 'main'` literal anywhere in this file.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createGitAdapter } from '../backends/git.cjs';

let gitAvailable = false;
try {
	execSync('git --version', { stdio: 'pipe' });
	gitAvailable = true;
} catch {
	// git not on PATH; every describe in this file skips.
}

/**
 * Build a fresh git repo. Pattern B: random-prefix mkdtemp.
 *
 * `commit.gpgsign false` is empirically required: environments with global
 * commit signing enabled would otherwise hang on the seed commit waiting
 * for a key that's not present in the test environment (mirrors
 * cmd-parallel-git.test.ts:setupGitRepo).
 */
function setupGitRepo(): string {
	const dir = mkdtempSync(
		join(
			tmpdir(),
			`gsd-15-cancel-git-${Math.random().toString(36).slice(2, 10)}-`,
		),
	);
	execSync('git init -q -b main', { cwd: dir, stdio: 'pipe' });
	execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
	execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
	execSync('git config commit.gpgsign false', { cwd: dir, stdio: 'pipe' });
	writeFileSync(join(dir, 'seed.txt'), 'seed\n');
	execSync('git add seed.txt', { cwd: dir, stdio: 'pipe' });
	execSync('git commit -qm seed', { cwd: dir, stdio: 'pipe' });
	// Materialize .planning/phases/15-test/ so derivePhaseRoot(repo, 15)
	// resolves to an existing path.
	mkdirSync(join(dir, '.planning', 'phases', '15-test'), { recursive: true });
	return dir;
}

// Scenario 1: cancel-clean-abandon (N=2).
describe.sequential.skipIf(!gitAvailable)(
	'workspace.parallel.cancel — git — cancel-clean-abandon (N=2)',
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

		it('cancel tears down both worktrees; abandoned.length === 2; failedReaped empty', { timeout: 30000 }, () => {
			const handle = vcs.workspace.parallel.dispatch({
				plan: [
					{ agentId: 'agent-1', planId: 'plan-1' },
					{ agentId: 'agent-2', planId: 'plan-2' },
				],
				phaseNumber: 15,
			});
			// Pre-cancel: both worktrees exist on disk.
			expect(handle.workspaces.length).toBe(2);
			for (const ws of handle.workspaces) {
				expect(existsSync(ws.path)).toBe(true);
			}

			const result = vcs.workspace.parallel.cancel(handle);

			// CancelResult invariants (D-01 4-field envelope).
			expect(result.abandoned.length).toBe(2);
			expect(result.failedReaped.length).toBe(0);
			// surplusWorkspaces counted pre-cancel — both existed.
			expect(result.surplusWorkspaces.length).toBe(2);

			// git-side `abandoned[]` uses agentId form (per orchestrator-
			// identifier consistency convention — see
			// `performGitParallelCancel` body comment).
			expect([...result.abandoned].sort()).toEqual([
				'agent-1',
				'agent-2',
			]);

			// Post-cancel: both worktree dirs gone.
			for (const ws of handle.workspaces) {
				expect(existsSync(ws.path)).toBe(false);
			}

			// surplusBookmarks: on clean cancel the per-workspace `branch -D`
			// succeeds for both, so this stays empty. (Asymmetry from jj-side
			// where it is `[]` by construction; git-side may carry entries
			// when branch-delete fails, but in the clean scenario both
			// branches delete cleanly.)
			expect([...result.surplusBookmarks]).toEqual([]);
		});
	},
);

// Scenario 2: cancel-idempotent-recall (D-03).
describe.sequential.skipIf(!gitAvailable)(
	'workspace.parallel.cancel — git — cancel-idempotent-recall (D-03)',
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

		it('second cancel on same handle returns all-empty arrays (no error)', { timeout: 30000 }, () => {
			const handle = vcs.workspace.parallel.dispatch({
				plan: [{ agentId: 'agent-1', planId: 'plan-1' }],
				phaseNumber: 15,
			});
			expect(handle.workspaces.length).toBe(1);

			const r1 = vcs.workspace.parallel.cancel(handle);
			expect(r1.abandoned.length).toBe(1);
			expect(r1.failedReaped.length).toBe(0);
			expect(r1.surplusWorkspaces.length).toBe(1);

			// D-03 invariant: re-call returns all-empty arrays. Same handle.
			const r2 = vcs.workspace.parallel.cancel(handle);
			expect([...r2.abandoned]).toEqual([]);
			expect([...r2.failedReaped]).toEqual([]);
			expect([...r2.surplusBookmarks]).toEqual([]);
			expect([...r2.surplusWorkspaces]).toEqual([]);
		});
	},
);

// Scenario 3: cancel-partial-state-recovery.
describe.sequential.skipIf(!gitAvailable)(
	'workspace.parallel.cancel — git — cancel-partial-state-recovery',
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

		it('pre-deleted worktree dir survives cancel — failedReaped empty; surplusWorkspaces reflects pre-cancel count', { timeout: 30000 }, () => {
			const handle = vcs.workspace.parallel.dispatch({
				plan: [
					{ agentId: 'agent-1', planId: 'plan-1' },
					{ agentId: 'agent-2', planId: 'plan-2' },
				],
				phaseNumber: 15,
			});
			expect(handle.workspaces.length).toBe(2);

			// Pre-delete the first worktree's dir BEFORE calling cancel.
			// The git cancel body existsSync-gates: already-gone path SKIPS
			// silently (per the D-03/D-06 contract; does NOT push to
			// failedReaped[]).
			const preDeleted = handle.workspaces[0].path;
			rmSync(preDeleted, { recursive: true, force: true });
			expect(existsSync(preDeleted)).toBe(false);
			expect(existsSync(handle.workspaces[1].path)).toBe(true);

			const result = vcs.workspace.parallel.cancel(handle);

			// failedReaped MUST be empty — existsSync gate covers the
			// pre-deleted case; the surviving worktree tears down cleanly.
			expect(result.failedReaped.length).toBe(0);
			// surplusWorkspaces counted pre-cancel via existsSync filter on
			// `handle.workspaces` — only the still-existing one shows up.
			expect(result.surplusWorkspaces.length).toBe(1);
			expect(result.surplusWorkspaces).toContain(handle.workspaces[1].path);
			// abandoned[] gets the second workspace's agentId (the only one
			// that needed tearing down). The pre-deleted one is silent skip.
			expect([...result.abandoned]).toEqual([handle.workspaces[1].agentId]);
		});
	},
);

// Scenario 4: frozen pure-JSON invariant (Phase 9 D-05).
describe.sequential.skipIf(!gitAvailable)(
	'workspace.parallel.cancel — git — frozen pure-JSON CancelResult',
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

		it('CancelResult is frozen AND survives JSON round-trip without semantic loss', { timeout: 30000 }, () => {
			const handle = vcs.workspace.parallel.dispatch({
				plan: [{ agentId: 'agent-1', planId: 'plan-1' }],
				phaseNumber: 15,
			});
			const result = vcs.workspace.parallel.cancel(handle);

			// Phase 9 D-05 invariant: frozen at the top level + frozen inner
			// arrays.
			expect(Object.isFrozen(result)).toBe(true);
			expect(Object.isFrozen(result.abandoned)).toBe(true);
			expect(Object.isFrozen(result.failedReaped)).toBe(true);
			expect(Object.isFrozen(result.surplusBookmarks)).toBe(true);
			expect(Object.isFrozen(result.surplusWorkspaces)).toBe(true);

			// JSON round-trip is lossless — no closures/methods/Symbols/class
			// instances on the return shape.
			const roundTripped = JSON.parse(JSON.stringify(result));
			expect(roundTripped).toEqual(result);
		});
	},
);
