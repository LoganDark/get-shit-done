/**
 * Phase 4 plan 04: workspace.reap contract tests.
 *
 * Verifies:
 *  - inclusion-filter (D-04 / #2774 pattern): workspaces NOT matching the
 *    phaseNamePrefix are ignored
 *  - empty head: jj abandon + workspace forget + rm-rf the on-disk dir
 *    (Pitfall 3 inverse — forget keeps the dir, reap removes it)
 *  - non-empty head: crash-recovery squash + queue append (D-12 / D-13);
 *    workspace + on-disk dir LEFT in place for human review
 *  - phase-merge gate (D-14): vcs.commit({phaseMergeFor}) throws
 *    VcsIncompleteSubagentsError when incomplete-work.md is non-empty
 *  - phase-merge gate (D-14) empty-queue narrow: the gate does NOT throw
 *    VcsIncompleteSubagentsError when the queue file is empty / absent
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
	mkdtempSync,
	mkdirSync,
	writeFileSync,
	readFileSync,
	existsSync,
	rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createVcsAdapter } from '../index.js';
import type { JjVcsAdapter } from '../types.js';
import { VcsIncompleteSubagentsError } from '../types.js';
import {
	__testOnlyClearIncomplete,
	appendIncomplete,
	readIncomplete,
} from '../jj/incomplete-work.js';

let jjAvailable = false;
try {
	execSync('jj --version', { stdio: 'pipe' });
	jjAvailable = true;
} catch {
	// jj not on PATH; entire suite skips.
}

describe.skipIf(!jjAvailable)(
	'workspace.reap — Phase 4 plan 04 (WS-11/WS-12/D-14)',
	() => {
		let dir: string;
		let phaseDir: string;
		let vcs: JjVcsAdapter;

		beforeAll(() => {
			dir = mkdtempSync(join(tmpdir(), 'gsd-jj-reap-'));
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
			phaseDir = join(dir, '.planning/phases/04-test');
			mkdirSync(phaseDir, { recursive: true });
			vcs = createVcsAdapter(dir, { kind: 'jj' }) as JjVcsAdapter;
		});

		afterAll(() => {
			if (dir) rmSync(dir, { recursive: true, force: true });
		});

		beforeEach(() => {
			__testOnlyClearIncomplete(phaseDir);
		});

		it('inclusion-filter: ignores workspaces NOT matching phaseNamePrefix', () => {
			const wsPath = join(dir, '.claude/jj-workspaces/unrelated-name');
			vcs.workspace.add({ path: wsPath, name: 'unrelated-name' });
			const result = vcs.workspace.reap({
				phaseNamePrefix: 'phase-04-subagent-',
				phaseDir,
			});
			expect(result.abandoned).toHaveLength(0);
			expect(result.incomplete).toHaveLength(0);
			// Untouched: still exists on disk + in workspace list
			expect(existsSync(wsPath)).toBe(true);
			expect(vcs.workspace.list().some((e) => e.path === 'unrelated-name')).toBe(true);
			// Cleanup so the next test sees a clean repo
			vcs.workspace.forget('unrelated-name');
			rmSync(wsPath, { recursive: true, force: true });
		});

		it('empty head: abandons, forgets, and rm-rfs the on-disk dir', () => {
			const wsName = 'phase-04-subagent-1';
			const wsPath = join(dir, '.claude/jj-workspaces', wsName);
			vcs.workspace.add({ path: wsPath, name: wsName });
			expect(existsSync(wsPath)).toBe(true);

			const result = vcs.workspace.reap({
				phaseNamePrefix: 'phase-04-subagent-',
				phaseDir,
			});
			expect(result.abandoned).toHaveLength(1);
			expect(result.abandoned[0]?.name).toBe(wsName);
			expect(result.incomplete).toHaveLength(0);
			// Workspace gone from jj tracking
			expect(vcs.workspace.list().some((e) => e.path === wsName)).toBe(false);
			// On-disk dir gone (Pitfall 3 inverse — reap rm's, not forget)
			expect(existsSync(wsPath)).toBe(false);
		});

		it('non-empty head: squashes as incomplete + appends to queue + leaves dir intact', () => {
			const wsName = 'phase-04-subagent-2';
			const wsPath = join(dir, '.claude/jj-workspaces', wsName);
			vcs.workspace.add({ path: wsPath, name: wsName });
			// Seed real content in the subagent workspace (simulates crashed
			// work that never got squashed below `@`). To make the workspace's
			// `@` itself carry the diff (vs `@-`), we trigger jj's auto-snapshot
			// by running `jj st` from inside the subagent — that moves the WC
			// content INTO `@`. `jj squash -B @ -k` would instead place the
			// content BEFORE `@`, leaving `@` empty, which doesn't model the
			// "crashed agent with uncommitted work in its @" scenario reap is
			// meant to catch.
			writeFileSync(join(wsPath, 'crashed-work.txt'), 'partial output\n');
			execSync('jj st', { cwd: wsPath, stdio: 'pipe' });

			const result = vcs.workspace.reap({
				phaseNamePrefix: 'phase-04-subagent-',
				phaseDir,
			});
			expect(result.abandoned).toHaveLength(0);
			expect(result.incomplete).toHaveLength(1);
			expect(result.incomplete[0]?.subagentName).toBe(wsName);
			expect(result.incomplete[0]?.reason).toBe('crashed-with-uncommitted-work');

			// Queue file appended
			const queue = readFileSync(join(phaseDir, 'incomplete-work.md'), 'utf-8');
			expect(queue).toMatch(/phase-04-subagent-2/);
			expect(queue).toMatch(/crashed-with-uncommitted-work/);

			// Workspace + dir intact for human review
			expect(existsSync(wsPath)).toBe(true);
			expect(vcs.workspace.list().some((e) => e.path === wsName)).toBe(true);

			// Cleanup for subsequent tests
			vcs.workspace.forget(wsName);
			rmSync(wsPath, { recursive: true, force: true });
		});

		it('D-14: vcs.commit({phaseMergeFor}) throws VcsIncompleteSubagentsError when queue non-empty', () => {
			// Seed the queue with a synthetic entry — the gate must trip BEFORE
			// any squash is attempted.
			appendIncomplete(phaseDir, {
				subagentName: 'phase-04-subagent-99',
				changeIdShort: 'abcd1234',
				workspacePath: '/tmp/fake',
				reason: 'test-d-14-gate',
			});
			expect(() =>
				vcs.commit({
					message: 'phase 04 merge attempt',
					phaseMergeFor: { phaseDir },
				}),
			).toThrow(VcsIncompleteSubagentsError);
		});

		it('D-14: gate test — empty queue does NOT throw VcsIncompleteSubagentsError', () => {
			// Rationale (option (a) per the plan revision request): the Phase 3
			// commit() contract requires `files` to be either undefined
			// (all-changes form) or a non-empty array (specific paths). A bare
			// commit({message, phaseMergeFor}) with no bookmark and no files is
			// a valid invocation of the all-changes path, but the test outcome
			// would depend on jj's @ state at the moment, which makes the
			// assertion fragile. The narrower invariant under test here is ONLY
			// the D-14 gate: an empty queue must NOT throw
			// VcsIncompleteSubagentsError. Other failures (squash exit code,
			// hash probe) are unrelated to the gate.
			expect(readIncomplete(phaseDir)).toEqual([]);

			let gateThrew = false;
			try {
				vcs.commit({
					message: 'phase 04 merge (empty queue) — gate test',
					phaseMergeFor: { phaseDir },
				});
			} catch (e) {
				if (e instanceof VcsIncompleteSubagentsError) {
					gateThrew = true;
				}
				// Any other error is allowed; we only assert the gate did not trip.
			}
			expect(gateThrew).toBe(false);
		});
	},
);
