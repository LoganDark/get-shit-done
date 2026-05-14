/**
 * Phase 5 plan 05-02 Task 3: CMD-03 integration test.
 *
 * Verifies `/gsd-execute-phase` translates correctly to jj:
 *   - createSubagentSlot creates unique change IDs + unique workspace paths
 *     for sequential slots (sibling to main repo per WS-04 / D-16).
 *   - Pre-commit hook fires after squash on the orchestrator path (proves
 *     the A3 fix from plan 05-01 reaches the execute-phase orchestrator —
 *     D-32 — D-10 retired). Uses the same marker-file pattern as
 *     jj-hooks.test.ts:83-96.
 *
 * Suite skips when `jj --version` is unavailable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createJjAdapter } from '../backends/jj.js';
import {
	createPhaseStructure,
	createSubagentSlot,
} from '../jj/octopus.js';

let jjAvailable = false;
try {
	execSync('jj --version', { stdio: 'pipe' });
	jjAvailable = true;
} catch {
	// jj not on PATH; entire suite skips.
}

function writeHook(dir: string, stage: string, body: string): string {
	const hookDir = join(dir, '.githooks');
	mkdirSync(hookDir, { recursive: true });
	const hookPath = join(hookDir, stage);
	writeFileSync(hookPath, body);
	chmodSync(hookPath, 0o755);
	return hookPath;
}

function safeUnlink(p: string): void {
	try {
		unlinkSync(p);
	} catch {
		/* ignore */
	}
}

describe.skipIf(!jjAvailable)('CMD-03 (/gsd-execute-phase) — jj-colocated', () => {
	let dir: string;
	let vcs: ReturnType<typeof createJjAdapter>;

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), 'gsd-cmd-execute-phase-'));
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
		vcs = createJjAdapter(dir);
	});

	afterAll(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
	});

	it('Test 1: three subagent slots get unique change IDs + unique workspace paths (WS-04 / D-16)', { timeout: 30000 }, () => {
		const struct = createPhaseStructure(dir, '@-', 6);
		const slot1 = createSubagentSlot(dir, vcs, {
			parentChange: struct.parentChange,
			mergeChange: struct.mergeChange,
			idx: 1,
			phaseNum: 6,
		});
		const slot2 = createSubagentSlot(dir, vcs, {
			parentChange: struct.parentChange,
			mergeChange: struct.mergeChange,
			idx: 2,
			phaseNum: 6,
		});
		const slot3 = createSubagentSlot(dir, vcs, {
			parentChange: struct.parentChange,
			mergeChange: struct.mergeChange,
			idx: 3,
			phaseNum: 6,
		});

		// Unique change IDs
		const heads = new Set([slot1.headChange, slot2.headChange, slot3.headChange]);
		expect(heads.size).toBe(3);

		// Unique workspace paths (canonical D-16 form:
		// {repoRoot}/.claude/jj-workspaces/phase-{NN}-subagent-{idx})
		const paths = new Set([slot1.workspacePath, slot2.workspacePath, slot3.workspacePath]);
		expect(paths.size).toBe(3);
		expect(slot1.workspaceName).toBe('phase-06-subagent-1');
		expect(slot2.workspaceName).toBe('phase-06-subagent-2');
		expect(slot3.workspaceName).toBe('phase-06-subagent-3');

		// Sibling-to-main: each path contains `.claude/jj-workspaces/`
		// (anchored under mainRepoRoot per WS-04).
		expect(slot1.workspacePath).toContain('.claude/jj-workspaces/');
		expect(slot2.workspacePath).toContain('.claude/jj-workspaces/');
		expect(slot3.workspacePath).toContain('.claude/jj-workspaces/');

		// Cleanup so this test leaves no orphan workspaces for sibling tests.
		vcs.workspace.forget('phase-06-subagent-1');
		vcs.workspace.forget('phase-06-subagent-2');
		vcs.workspace.forget('phase-06-subagent-3');
		rmSync(slot1.workspacePath, { recursive: true, force: true });
		rmSync(slot2.workspacePath, { recursive: true, force: true });
		rmSync(slot3.workspacePath, { recursive: true, force: true });
	});

	it('Test 2: A3-fix assertion — pre-commit hook fires after squash on the orchestrator path (D-32, markerPath observed)', () => {
		// This is the canonical CMD-03 A3 hand-off proof: D-32 retired D-10
		// (the prior colocated-no-op), so the adapter ALWAYS fires
		// .githooks/pre-commit on `vcs.commit` in colocated mode. The
		// orchestrator's execute-phase pre-commit hook flows through the
		// SAME fireHook call (now reachable via `gsd-sdk query hooks.fire
		// pre-commit --cwd .` from execute-phase.md after this plan's
		// Task 1 rewrite). We exercise the underlying contract here.
		const markerPath = join(dir, '.cmd-03-pre-commit-fired');
		safeUnlink(markerPath);
		writeHook(dir, 'pre-commit', `#!/bin/bash\ntouch "${markerPath}"\nexit 0\n`);

		writeFileSync(join(dir, 'cmd-03-a.txt'), 'a\n');
		const r = vcs.commit({
			message: 'CMD-03 hook-fire assertion',
			files: ['cmd-03-a.txt'],
		});
		expect(r.exitCode).toBe(0);
		// A3 fix: adapter-side pre-commit MUST have fired in colocated mode
		// (D-32; refutes D-10 retired). markerPath presence is the
		// observable proof.
		expect(existsSync(markerPath)).toBe(true);
	});
});
