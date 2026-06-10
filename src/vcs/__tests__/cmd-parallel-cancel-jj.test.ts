/**
 * sdk/src/vcs/__tests__/cmd-parallel-cancel-jj.test.ts — Phase 15.04 Wave 2c
 *
 * Per-backend cancel scenarios for `vcs.workspace.parallel.cancel(handle)` on
 * the jj backend. Mirrors PARALLEL-08 SC5 template (D-15 structural rules):
 *   - Pattern A: `describe.sequential.skipIf(!jjAvailable)` per scenario.
 *   - Pattern B: random-prefix `mkdtemp` via `setupJjRepo()`.
 *   - Per-scenario `beforeAll` (fresh mkdtemp) + `afterAll` (`rmSync`).
 *   - Never use retry config; never use a skip modifier on describe/it/test.
 *
 * 4 scenarios per VALIDATION lines 58-62:
 *   1. cancel-clean-abandon (N=2): dispatch + cancel → 2 abandoned, 0
 *      failedReaped, 2 surplusWorkspaces, dirs gone post-cancel.
 *   2. cancel-idempotent-recall (N=1): second cancel returns all-empty
 *      arrays (D-03 invariant).
 *   3. cancel-partial-state-recovery (N=2): pre-delete one workspace dir
 *      before cancel; failedReaped.length === 0 (D-06 force-true ENOENT
 *      no-op); surplusWorkspaces reflects on-disk count at entry (= 1).
 *   4. cancel returns frozen pure-JSON CancelResult — Object.isFrozen +
 *      JSON round-trip (Phase 9 D-05 invariant).
 *
 * N2 / Pitfall 7 mitigation: scenarios OMIT `mainBookmarks` from dispatch
 * opts entirely. Cancel is bookmark-orthogonal — the verb tests workspace
 * teardown, which has no bookmark coupling. No stale `mainBookmark: 'main'`
 * literal anywhere in this file (Pitfall 7 mitigation built-in to fresh
 * content per the replan).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createJjAdapter } from '../backends/jj.cjs';

let jjAvailable = false;
try {
	execSync('jj --version', { stdio: 'pipe' });
	jjAvailable = true;
} catch {
	// jj not on PATH; every describe in this file skips.
}

/**
 * Build a fresh colocated jj repo. Pattern B: random-prefix mkdtemp.
 * Bookmark-less by construction (no `jj bookmark create main` in the seed)
 * per PARALLEL-08 / CF-02 — cancel does not need bookmark plumbing.
 */
function setupJjRepo(): string {
	const dir = mkdtempSync(
		join(
			tmpdir(),
			`gsd-15-cancel-jj-${Math.random().toString(36).slice(2, 10)}-`,
		),
	);
	execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
	execSync('jj config set --repo user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
	execSync('jj config set --repo user.name "Test"', { cwd: dir, stdio: 'pipe' });
	writeFileSync(join(dir, 'seed.txt'), 'seed\n');
	execSync('jj squash -B @ -k -m "seed"', { cwd: dir, stdio: 'pipe' });
	// Materialize .planning/phases/15-test/ so derivePhaseRoot(repo, 15) resolves
	// to an existing dir.
	mkdirSync(join(dir, '.planning', 'phases', '15-test'), { recursive: true });
	return dir;
}

// Scenario 1: cancel-clean-abandon (N=2).
describe.sequential.skipIf(!jjAvailable)(
	'workspace.parallel.cancel — jj — cancel-clean-abandon (N=2)',
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

		it('cancel tears down both workspaces; abandoned.length === 2; failedReaped empty', { timeout: 30000 }, () => {
			const handle = vcs.workspace.parallel.dispatch({
				plan: [
					{ agentId: 'agent-1', planId: 'plan-1' },
					{ agentId: 'agent-2', planId: 'plan-2' },
				],
				phaseNumber: 15,
			});
			// Pre-cancel: both workspaces exist on disk.
			expect(handle.workspaces.length).toBe(2);
			for (const ws of handle.workspaces) {
				expect(existsSync(ws.path)).toBe(true);
			}

			const result = vcs.workspace.parallel.cancel(handle);

			// CancelResult invariants (D-01 4-field envelope).
			expect(result.abandoned.length).toBe(2);
			expect(result.failedReaped.length).toBe(0);
			// Jj-side surplusBookmarks empty by Phase 11 D-02 construction.
			expect(result.surplusBookmarks.length).toBe(0);
			// surplusWorkspaces counted at entry — both existed pre-cancel.
			expect(result.surplusWorkspaces.length).toBe(2);

			// Helper returns workspace names (per cleanupSubagentWorkspaces:
			// `abandoned.push(ws.name)`). For jj-side the canonical names are
			// `phase-15-subagent-{idx}` — agentId is NOT what the helper
			// returns. The orchestrator-identifier-consistency convention
			// (agentId form) is honored on git-side; jj-side uses workspace
			// name form per the underlying helper's pass-through.
			expect([...result.abandoned].sort()).toEqual([
				'phase-15-subagent-1',
				'phase-15-subagent-2',
			]);

			// Post-cancel: both workspace dirs gone.
			for (const ws of handle.workspaces) {
				expect(existsSync(ws.path)).toBe(false);
			}
		});
	},
);

// Scenario 2: cancel-idempotent-recall (D-03).
describe.sequential.skipIf(!jjAvailable)(
	'workspace.parallel.cancel — jj — cancel-idempotent-recall (D-03)',
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

		it('second cancel on same handle returns all-empty arrays (no error)', { timeout: 30000 }, () => {
			const handle = vcs.workspace.parallel.dispatch({
				plan: [{ agentId: 'agent-1', planId: 'plan-1' }],
				phaseNumber: 15,
			});
			expect(handle.workspaces.length).toBe(1);

			const r1 = vcs.workspace.parallel.cancel(handle);
			expect(r1.abandoned.length).toBe(1);
			expect(r1.failedReaped.length).toBe(0);
			expect(r1.surplusBookmarks.length).toBe(0);
			expect(r1.surplusWorkspaces.length).toBe(1);

			// D-03 invariant: re-call returns all-empty arrays. Same handle.
			const r2 = vcs.workspace.parallel.cancel(handle);
			expect([...r2.abandoned]).toEqual([]);
			expect([...r2.failedReaped]).toEqual([]);
			expect([...r2.surplusBookmarks]).toEqual([]);
			// surplusWorkspaces reflects on-disk count at entry of the second
			// call — both gone, so 0.
			expect([...r2.surplusWorkspaces]).toEqual([]);
		});
	},
);

// Scenario 3: cancel-partial-state-recovery.
describe.sequential.skipIf(!jjAvailable)(
	'workspace.parallel.cancel — jj — cancel-partial-state-recovery',
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

		it('pre-deleted workspace dir survives cancel — failedReaped empty; surplusWorkspaces reflects pre-cancel count', { timeout: 30000 }, () => {
			const handle = vcs.workspace.parallel.dispatch({
				plan: [
					{ agentId: 'agent-1', planId: 'plan-1' },
					{ agentId: 'agent-2', planId: 'plan-2' },
				],
				phaseNumber: 15,
			});
			expect(handle.workspaces.length).toBe(2);

			// Pre-delete the first workspace's dir BEFORE calling cancel.
			// D-06 force:true makes the rmSync ENOENT a no-op; the already-gone
			// branch should skip silently (NOT push to failedReaped[]).
			const preDeleted = handle.workspaces[0].path;
			rmSync(preDeleted, { recursive: true, force: true });
			expect(existsSync(preDeleted)).toBe(false);
			expect(existsSync(handle.workspaces[1].path)).toBe(true);

			const result = vcs.workspace.parallel.cancel(handle);

			// failedReaped MUST be empty — force:true makes ENOENT a no-op
			// for the pre-deleted dir; the surviving dir tears down cleanly.
			expect(result.failedReaped.length).toBe(0);
			// surplusWorkspaces counted pre-cancel via existsSync filter on
			// `handle.workspaces` — only the still-existing one shows up (1).
			expect(result.surplusWorkspaces.length).toBe(1);
			expect(result.surplusWorkspaces).toContain(handle.workspaces[1].path);
			// abandoned[] gets the second workspace (the only one that needed
			// tearing down). The pre-deleted one is silent skip per D-06.
			expect([...result.abandoned]).toEqual([handle.workspaces[1].name]);
		});
	},
);

// Scenario 4: frozen pure-JSON invariant (Phase 9 D-05).
describe.sequential.skipIf(!jjAvailable)(
	'workspace.parallel.cancel — jj — frozen pure-JSON CancelResult',
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
