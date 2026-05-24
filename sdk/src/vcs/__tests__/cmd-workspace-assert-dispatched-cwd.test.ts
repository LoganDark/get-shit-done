/**
 * sdk/src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts
 *   — Phase 11 plan 07 Task 2 (CR-01 regression coverage)
 *   — Phase 11 plan 11 Task 1 extension (PROMPT-08 BLOCKER closure —
 *     `primaryWorkspacePath` envelope field parity across backends)
 *
 * Pins the post-Plan-11-07 behavior of `workspace.assert-dispatched-cwd` on
 * both backends. The legacy (pre Plan 11-07) verb body would have failed
 * Scenario 2 below unconditionally on jj — workspace NAME compared against
 * an fs realpath could never match for a non-primary subagent workspace.
 *
 * Plan 11-11 extension: the verb's envelope additively carries
 * `primaryWorkspacePath` (the resolved fs path of `entries[0]`, always present
 * regardless of cwd-match outcome). Each scenario below pins the new field's
 * value alongside the existing `{ok, workspaceName, workspacePath, isPrimary}`
 * tuple. Scenario 5 (new) pins the load-bearing failure-branch case: cwd is
 * outside any workspace but `primaryWorkspacePath` STILL resolves to the
 * primary workspace's fs path — that is exactly the surface the agent's FATAL
 * recovery diagnostic dump in `agents/gsd-executor.md` consumes after Plan
 * 11-11's retirement of raw `git rev-parse --show-toplevel`.
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
 * Three jj scenarios + new failure-branch primary-path pin:
 *   1. Primary jj workspace cwd → ok:false, isPrimary:true, names non-null,
 *      primaryWorkspacePath resolves to the main repo root.
 *   2. Non-primary jj workspace cwd → ok:true, isPrimary:false, workspacePath
 *      resolves to the dispatched workspace's fs path (the CR-01 closure
 *      proof). primaryWorkspacePath STILL resolves to the main repo root.
 *   3. No-match cwd (outside any workspace) → ok:false, names null,
 *      primaryWorkspacePath STILL non-null when entries[0] resolves —
 *      Plan 11-11 load-bearing assertion for FATAL recovery diagnostics.
 *
 * Plus a git parity scenario:
 *   4. Dispatched git worktree cwd → ok:true, isPrimary:false (proves the
 *      Task 1 refactor did not regress git). primaryWorkspacePath equals
 *      realpath(entries[0].path) on git too — backend-opaque envelope shape.
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
				mainBookmarks: ['main'],
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

		it('Scenario 1: primary jj workspace cwd → ok:false, isPrimary:true, names non-null, primaryWorkspacePath resolves to main repo', { timeout: 30000 }, async () => {
			const res = await workspaceAssertDispatchedCwdQuery([
				'--cwd',
				dir,
			], dir);
			const d = res.data as {
				ok: boolean;
				workspaceName: string | null;
				workspacePath: string | null;
				isPrimary: boolean;
				primaryWorkspacePath: string | null;
			};
			expect(d.isPrimary).toBe(true);
			expect(d.ok).toBe(false);
			expect(d.workspaceName).not.toBeNull();
			expect(d.workspacePath).not.toBeNull();
			// workspacePath on the primary branch must resolve to the main repo
			// root fs path (NOT the workspace name "default") — the CR-01 fix
			// guarantees `jj workspace root --name <NAME>` resolution.
			expect(realpathSync(d.workspacePath as string)).toBe(realpathSync(dir));
			// Plan 11-11: primaryWorkspacePath additively present; on the
			// primary-match scenario it equals workspacePath semantically.
			expect(d.primaryWorkspacePath).not.toBeNull();
			expect(realpathSync(d.primaryWorkspacePath as string)).toBe(
				realpathSync(dir),
			);
		});

		it('Scenario 2: non-primary jj workspace cwd → ok:true, isPrimary:false, workspacePath is an fs path (CR-01 BLOCKER closure proof); primaryWorkspacePath STILL resolves to main repo', { timeout: 30000 }, async () => {
			const res = await workspaceAssertDispatchedCwdQuery([
				'--cwd',
				nonPrimaryWsPath,
			], dir);
			const d = res.data as {
				ok: boolean;
				workspaceName: string | null;
				workspacePath: string | null;
				isPrimary: boolean;
				primaryWorkspacePath: string | null;
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
			// Plan 11-11: primaryWorkspacePath is the resolved fs path of
			// entries[0] (the primary), independent of cwd-match. Even though
			// the cwd matches a NON-primary workspace, the field MUST still
			// equal the main repo root — pinning the additive contract.
			expect(d.primaryWorkspacePath).not.toBeNull();
			expect(realpathSync(d.primaryWorkspacePath as string)).toBe(
				realpathSync(dir),
			);
		});

		it('Scenario 3: no-match cwd outside any workspace → ok:false, workspaceName: null, workspacePath: null, primaryWorkspacePath: null (legacy CR-01 pin + WR-N04 closure)', { timeout: 30000 }, async () => {
			// cwd is a fresh tmp outside any repo, so vcs.workspace.list() runs
			// against a non-repo path and returns empty / no match. Pre Plan
			// 11-11 this was the only failure-branch scenario; Scenario 5
			// (below) extends coverage to the in-repo failure-branch where the
			// new primaryWorkspacePath field is load-bearing.
			const res = await workspaceAssertDispatchedCwdQuery([
				'--cwd',
				outsideTmp,
			], outsideTmp);
			const d = res.data as {
				ok: boolean;
				workspaceName: string | null;
				workspacePath: string | null;
				isPrimary: boolean;
				primaryWorkspacePath: string | null;
			};
			expect(d.ok).toBe(false);
			expect(d.isPrimary).toBe(false);
			expect(d.workspaceName).toBeNull();
			expect(d.workspacePath).toBeNull();
			// WR-N04 closure: when the cwd is outside any VCS repo entirely
			// (vcs.workspace.list() returns empty), primaryWorkspacePath MUST
			// be exactly `null` — not `undefined`, not the empty string, not a
			// fallback path. The agent's FATAL recovery diagnostic dump uses
			// `jq -r '.primaryWorkspacePath // "<unresolvable>"'` which fires
			// the fallback only on JSON null. A silent regression that emits
			// `""` or `undefined` would degrade the operator-facing diagnostic
			// ("REPO_ROOT:" vs "REPO_ROOT: <unresolvable>") without tripping
			// any other assertion in this file.
			expect(d.primaryWorkspacePath).toBeNull();
		});

		it('Scenario 5 (Plan 11-11 FATAL-recovery surface): in-repo cwd that does NOT match any workspace → ok:false, names null, primaryWorkspacePath STILL resolves to main repo', { timeout: 30000 }, async () => {
			// cwd is `<dir>/.planning/phases/11-test/` — a real subdirectory of
			// the jj repo but not itself a registered workspace. The verb's
			// vcs.workspace.list() returns the real workspace set (default +
			// dispatched), the cwd-match loop yields matchedIndex === -1, and
			// the failure-branch return MUST still carry
			// primaryWorkspacePath = realpath(<dir>) — exactly the surface the
			// agent's FATAL recovery diagnostic dump consumes after Plan 11-11
			// retired the raw `git rev-parse --show-toplevel` probe. This is
			// the load-bearing assertion for PROMPT-08 BLOCKER closure.
			const subDir = join(dir, '.planning', 'phases', '11-test');
			const res = await workspaceAssertDispatchedCwdQuery([
				'--cwd',
				subDir,
			], dir);
			const d = res.data as {
				ok: boolean;
				workspaceName: string | null;
				workspacePath: string | null;
				isPrimary: boolean;
				primaryWorkspacePath: string | null;
			};
			expect(d.ok).toBe(false);
			expect(d.isPrimary).toBe(false);
			expect(d.workspaceName).toBeNull();
			expect(d.workspacePath).toBeNull();
			// Plan 11-11 load-bearing failure-branch pin: even when cwd does
			// not match any workspace, the primary workspace fs path is STILL
			// resolved — exactly the surface the agent's FATAL recovery
			// diagnostic dump consumes in place of raw `git rev-parse`.
			expect(d.primaryWorkspacePath).not.toBeNull();
			expect(realpathSync(d.primaryWorkspacePath as string)).toBe(
				realpathSync(dir),
			);
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
				mainBookmarks: ['main'],
			});
			nonPrimaryWsPath = handle.workspaces[0].path;
		});

		afterAll(() => {
			if (dir) rmSync(dir, { recursive: true, force: true });
		});

		it('Scenario 4: dispatched git worktree cwd → ok:true, isPrimary:false; primaryWorkspacePath resolves to main repo (parity with jj)', { timeout: 30000 }, async () => {
			const res = await workspaceAssertDispatchedCwdQuery([
				'--cwd',
				nonPrimaryWsPath,
			], dir);
			const d = res.data as {
				ok: boolean;
				workspaceName: string | null;
				workspacePath: string | null;
				isPrimary: boolean;
				primaryWorkspacePath: string | null;
			};
			expect(d.ok).toBe(true);
			expect(d.isPrimary).toBe(false);
			expect(d.workspaceName).not.toBeNull();
			expect(d.workspacePath).not.toBeNull();
			expect(realpathSync(d.workspacePath as string)).toBe(
				realpathSync(nonPrimaryWsPath),
			);
			// Plan 11-11 backend-opacity pin: git emits primaryWorkspacePath in
			// the exact same envelope position with the same semantic (resolved
			// fs path of entries[0]) as jj. The verb's body uses safeRealpath
			// for the git branch and resolveJjWorkspacePath for jj, but the
			// CONSUMER-visible shape is identical — backend-opaque.
			expect(d.primaryWorkspacePath).not.toBeNull();
			expect(realpathSync(d.primaryWorkspacePath as string)).toBe(
				realpathSync(dir),
			);
		});
	},
);
