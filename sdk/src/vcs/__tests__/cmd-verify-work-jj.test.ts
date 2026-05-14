/**
 * Phase 5 plan 05-03 Task 3: CMD-04 spillover integration test
 * (/gsd-verify-work).
 *
 * Verifies the verify-work flow's translation surface against the live
 * jj-colocated backend:
 *   - `vcs.findConflicts({scope: 'all'})` surfaces in-tree conflict markers
 *     (CONFLICT-01 reaches verify-work; the verify-work workflow uses this
 *     adapter call to detect unresolved jj-side conflicts).
 *   - After resolution, `vcs.findConflicts({scope: 'all'})` returns empty.
 *   - `statusQuery(['--porcelain'], dir)` against a clean tree returns
 *     `{data: {ok: true, stdout: '' (or empty raw)}}` — the verify-work
 *     invariant.
 *
 * Suite skips when `jj --version` is unavailable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createVcsAdapter } from '../index.js';
import type { JjVcsAdapter } from '../types.js';
import { statusQuery } from '../../query/status.js';

let jjAvailable = false;
try {
	execSync('jj --version', { stdio: 'pipe' });
	jjAvailable = true;
} catch {
	// jj not on PATH; entire suite skips.
}

describe.skipIf(!jjAvailable)('CMD-04 spillover (/gsd-verify-work) — jj-colocated', () => {
	let dir: string;
	let vcs: JjVcsAdapter;

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), 'gsd-cmd-verify-work-jj-'));
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
		// Pin backend detection to jj — statusQuery dispatches via
		// createVcsAdapter(cwd) without explicit opts.
		mkdirSync(join(dir, '.planning'), { recursive: true });
		writeFileSync(
			join(dir, '.planning', 'config.json'),
			JSON.stringify({ vcs: { adapter: 'jj' } }),
		);
		vcs = createVcsAdapter(dir, { kind: 'jj' }) as JjVcsAdapter;
	});

	afterAll(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
	});

	it('Test 1: vcs.findConflicts({scope: "all"}) surfaces a synthetic jj conflict (CONFLICT-01 reaches verify-work)', { timeout: 30000 }, () => {
		// Synthesize a conflict by creating two divergent changes that both
		// modify the same file, then merging them. `jj new <revs...>` creates
		// a merge change; on conflicting edits, jj records conflict markers
		// in-tree.
		writeFileSync(join(dir, 'conflict.txt'), 'baseline\n');
		expect(
			vcs.commit({
				message: 'feat(05-03): verify-work baseline for conflict synthesis',
				files: ['conflict.txt'],
			}).exitCode,
		).toBe(0);
		const baseId = execSync(
			`jj log -r @- -T 'change_id ++ "\\n"' --no-graph -n 1`,
			{ cwd: dir },
		)
			.toString()
			.trim();

		// Branch 1: change line to "alpha".
		execSync(`jj new ${baseId}`, { cwd: dir, stdio: 'pipe' });
		writeFileSync(join(dir, 'conflict.txt'), 'alpha\n');
		execSync('jj squash -B @ -k -m "branch alpha"', {
			cwd: dir,
			stdio: 'pipe',
		});
		const alphaId = execSync(
			`jj log -r @- -T 'change_id ++ "\\n"' --no-graph -n 1`,
			{ cwd: dir },
		)
			.toString()
			.trim();

		// Branch 2: change line to "beta" off the same base.
		execSync(`jj new ${baseId}`, { cwd: dir, stdio: 'pipe' });
		writeFileSync(join(dir, 'conflict.txt'), 'beta\n');
		execSync('jj squash -B @ -k -m "branch beta"', { cwd: dir, stdio: 'pipe' });
		const betaId = execSync(
			`jj log -r @- -T 'change_id ++ "\\n"' --no-graph -n 1`,
			{ cwd: dir },
		)
			.toString()
			.trim();

		// Merge alpha + beta → in-tree conflict.
		execSync(`jj new ${alphaId} ${betaId}`, { cwd: dir, stdio: 'pipe' });

		const conflicts = vcs.findConflicts({ scope: 'all' });
		// The merge change carries the conflict; assert at least one
		// conflicted rev with conflict.txt in its paths.
		expect(conflicts.length).toBeGreaterThan(0);
		const allPaths = conflicts.flatMap(c => c.paths);
		expect(allPaths.some(p => p.includes('conflict.txt'))).toBe(true);
	});

	it('Test 2: after `jj squash` resolves the conflict, vcs.findConflicts returns empty', () => {
		// Resolve the conflict by writing clean content and squashing.
		writeFileSync(join(dir, 'conflict.txt'), 'resolved\n');
		execSync('jj squash -B @ -k -m "resolve conflict.txt"', {
			cwd: dir,
			stdio: 'pipe',
		});

		const conflicts = vcs.findConflicts({ scope: 'all' });
		// After resolution, the verify-work invariant is empty conflict set.
		expect(conflicts).toEqual([]);
	});

	it('Test 3: statusQuery against a clean tree returns ok=true with empty raw output', async () => {
		// Working copy is clean (Test 2 resolved everything); the SDK status
		// verb must report ok=true and empty payload.
		const res = await statusQuery(['--porcelain'], dir);
		expect(res.data).toMatchObject({ ok: true });
		// The raw / stdout / entries surface depends on the verb's return
		// shape; both `.raw` and `.entries` must indicate "clean".
		const data = res.data as {
			ok: boolean;
			raw?: string;
			entries?: unknown[];
			stdout?: string;
		};
		// At least one of: raw is empty/whitespace, entries is empty array,
		// or stdout is empty/whitespace.
		const rawTrim = (data.raw ?? '').trim();
		const stdoutTrim = (data.stdout ?? '').trim();
		const entriesLen = Array.isArray(data.entries) ? data.entries.length : 0;
		expect(rawTrim === '' && stdoutTrim === '' && entriesLen === 0).toBe(true);
	});
});
