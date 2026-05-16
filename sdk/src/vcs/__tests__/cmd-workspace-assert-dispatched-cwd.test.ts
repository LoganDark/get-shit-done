/**
 * sdk/src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts
 *   — Phase 11 plan 07 Task 2 (CR-01 regression coverage)
 *
 * Pins the post-Plan-11-07 behavior of `workspace.assert-dispatched-cwd` on
 * both backends. The legacy (pre Plan 11-07) verb body would have failed
 * Scenario 2 below unconditionally on jj — workspace NAME compared against
 * an fs realpath could never match for a non-primary subagent workspace.
 *
 * Structural rules:
 *   - Pattern A: `describe.sequential.skipIf(!jjAvailable)` and
 *     `.skipIf(!gitAvailable)` per scenario (TEST-13 / TEST-16 convention,
 *     mirroring cmd-parallel-jj.test.ts and cmd-parallel-git.test.ts).
 *   - Pattern B: random-prefix `mkdtemp` to guard against parallel-test-FILE
 *     collisions under `tmpdir()` (Pitfall 9 / TEST-16).
 *   - No `retry:` config anywhere (TEST-16 LOCKED).
 *   - No `describe.skip`/`it.skip` modifiers (TEST-16 LOCKED). Backend
 *     unavailability uses `skipIf` exclusively.
 *
 * Three jj scenarios:
 *   1. Primary jj workspace cwd → ok:false, isPrimary:true, names non-null.
 *   2. Non-primary jj workspace cwd → ok:true, isPrimary:false, workspacePath
 *      resolves to the dispatched workspace's fs path (the CR-01 closure proof).
 *   3. No-match cwd (outside any workspace) → ok:false, names null.
 *
 * Plus a git parity scenario:
 *   4. Dispatched git worktree cwd → ok:true, isPrimary:false (proves the
 *      Task 1 refactor did not regress git).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	mkdtempSync,
	mkdirSync,
	writeFileSync,
	rmSync,
	realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { workspaceAssertDispatchedCwdQuery } from '../../query/workspace-assert-dispatched-cwd.js';
import { createJjAdapter } from '../backends/jj.js';
import { createGitAdapter } from '../backends/git.js';

let jjAvailable = false;
try {
	execSync('jj --version', { stdio: 'pipe' });
	jjAvailable = true;
} catch {
	// jj not on PATH; jj-side describes skip.
}

let gitAvailable = false;
try {
	execSync('git --version', { stdio: 'pipe' });
	gitAvailable = true;
} catch {
	// git not on PATH; git-side describes skip.
}

/**
 * Fresh colocated jj repo under random-prefix mkdtemp; pre-materializes
 * `.planning/phases/11-test/` so `derivePhaseRoot(repo, 11)` resolves to an
 * existing dir for any incidental fanIn-side enqueue.
 */
function setupJjRepo(): string {
	const dir = mkdtempSync(
		join(
			tmpdir(),
			`gsd-cwd-assert-jj-${Math.random().toString(36).slice(2, 10)}-`,
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
	mkdirSync(join(dir, '.planning', 'phases', '11-test'), { recursive: true });
	return dir;
}

function setupGitRepo(): string {
	const dir = mkdtempSync(
		join(
			tmpdir(),
			`gsd-cwd-assert-git-${Math.random().toString(36).slice(2, 10)}-`,
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

// ───────────────────────────────────────────────────────────────────────────
// JJ side: three scenarios (primary / non-primary / no-match)
// ───────────────────────────────────────────────────────────────────────────

describe.sequential.skipIf(!jjAvailable)(
	'workspace.assert-dispatched-cwd — jj backend (CR-01 closure)',
	() => {
		let dir: string;
		let vcs: ReturnType<typeof createJjAdapter>;
		let nonPrimaryWsPath: string;
		let outsideTmp: string;

		beforeAll(() => {
			dir = setupJjRepo();
			vcs = createJjAdapter(dir);
			// Dispatch N=2 subagent workspaces so we have a non-primary entry
			// to assert against. The dispatch handle's workspaces[i].path is
			// an absolute fs path (per parallel.ts:performJjParallelDispatch).
			const handle = vcs.workspace.parallel.dispatch({
				plan: [
					{ agentId: 'agent-1', planId: 'plan-1' },
					{ agentId: 'agent-2', planId: 'plan-2' },
				],
				phaseNumber: 11,
				mainBookmark: 'main',
			});
			nonPrimaryWsPath = handle.workspaces[0].path;
			// A no-match cwd: a fresh mkdtemp outside any repo.
			outsideTmp = mkdtempSync(
				join(
					tmpdir(),
					`gsd-cwd-assert-outside-${Math.random().toString(36).slice(2, 10)}-`,
				),
			);
		});

		afterAll(() => {
			if (dir) rmSync(dir, { recursive: true, force: true });
			if (outsideTmp) rmSync(outsideTmp, { recursive: true, force: true });
		});

		it('Scenario 1: primary jj workspace cwd → ok:false, isPrimary:true, names non-null', { timeout: 30000 }, async () => {
			const res = await workspaceAssertDispatchedCwdQuery([
				'--cwd',
				dir,
			], dir);
			const d = res.data as {
				ok: boolean;
				workspaceName: string | null;
				workspacePath: string | null;
				isPrimary: boolean;
			};
			expect(d.isPrimary).toBe(true);
			expect(d.ok).toBe(false);
			expect(d.workspaceName).not.toBeNull();
			expect(d.workspacePath).not.toBeNull();
			// workspacePath on the primary branch must resolve to the main repo
			// root fs path (NOT the workspace name "default") — the CR-01 fix
			// guarantees `jj workspace root --name <NAME>` resolution.
			expect(realpathSync(d.workspacePath as string)).toBe(realpathSync(dir));
		});

		it('Scenario 2: non-primary jj workspace cwd → ok:true, isPrimary:false, workspacePath is an fs path (CR-01 BLOCKER closure proof)', { timeout: 30000 }, async () => {
			const res = await workspaceAssertDispatchedCwdQuery([
				'--cwd',
				nonPrimaryWsPath,
			], dir);
			const d = res.data as {
				ok: boolean;
				workspaceName: string | null;
				workspacePath: string | null;
				isPrimary: boolean;
			};
			expect(d.ok).toBe(true);
			expect(d.isPrimary).toBe(false);
			expect(d.workspaceName).not.toBeNull();
			expect(d.workspacePath).not.toBeNull();
			// The load-bearing proof: workspacePath is an fs path equivalent
			// to the dispatched workspace's path. Pre Plan 11-07 the verb
			// returned `ok: false, workspaceName: null` for this exact input.
			expect(realpathSync(d.workspacePath as string)).toBe(
				realpathSync(nonPrimaryWsPath),
			);
		});

		it('Scenario 3: no-match cwd outside any workspace → ok:false, workspaceName: null, workspacePath: null', { timeout: 30000 }, async () => {
			const res = await workspaceAssertDispatchedCwdQuery([
				'--cwd',
				outsideTmp,
			], outsideTmp);
			const d = res.data as {
				ok: boolean;
				workspaceName: string | null;
				workspacePath: string | null;
				isPrimary: boolean;
			};
			expect(d.ok).toBe(false);
			expect(d.isPrimary).toBe(false);
			expect(d.workspaceName).toBeNull();
			expect(d.workspacePath).toBeNull();
		});
	},
);

// ───────────────────────────────────────────────────────────────────────────
// Git side: one parity scenario (Task 1 must not regress git behavior)
// ───────────────────────────────────────────────────────────────────────────

describe.sequential.skipIf(!gitAvailable)(
	'workspace.assert-dispatched-cwd — git parity check',
	() => {
		let dir: string;
		let vcs: ReturnType<typeof createGitAdapter>;
		let nonPrimaryWsPath: string;

		beforeAll(() => {
			dir = setupGitRepo();
			vcs = createGitAdapter(dir);
			const handle = vcs.workspace.parallel.dispatch({
				plan: [
					{ agentId: 'agent-1', planId: 'plan-1' },
					{ agentId: 'agent-2', planId: 'plan-2' },
				],
				phaseNumber: 11,
				mainBookmark: 'main',
			});
			nonPrimaryWsPath = handle.workspaces[0].path;
		});

		afterAll(() => {
			if (dir) rmSync(dir, { recursive: true, force: true });
		});

		it('Scenario 4: dispatched git worktree cwd → ok:true, isPrimary:false', { timeout: 30000 }, async () => {
			const res = await workspaceAssertDispatchedCwdQuery([
				'--cwd',
				nonPrimaryWsPath,
			], dir);
			const d = res.data as {
				ok: boolean;
				workspaceName: string | null;
				workspacePath: string | null;
				isPrimary: boolean;
			};
			expect(d.ok).toBe(true);
			expect(d.isPrimary).toBe(false);
			expect(d.workspaceName).not.toBeNull();
			expect(d.workspacePath).not.toBeNull();
			expect(realpathSync(d.workspacePath as string)).toBe(
				realpathSync(nonPrimaryWsPath),
			);
		});
	},
);
