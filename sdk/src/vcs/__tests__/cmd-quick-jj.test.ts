/**
 * Phase 5 plan 05-02 Task 3: CMD-05 integration test.
 *
 * Verifies `/gsd-quick` translates correctly to jj-colocated mode:
 *   - vcs.commit({ message, files: [PLAN.md] }) on the colocated jj repo
 *     advances @'s parent exactly once (proves "single squash on
 *     orchestrator @" — no phase setup, no workspace, no octopus).
 *   - No `gsd/phase-*` octopus structure is created (quick.md skips
 *     createPhaseStructure entirely per CMD-05 spec).
 *   - Pre-commit hook fires exactly once per the commit (single fire — no
 *     double-fire from a non-existent octopus merge).
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
import { createVcsAdapter } from '../index.js';
import type { JjVcsAdapter } from '../types.js';

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

function countLines(s: string): number {
	if (!s) return 0;
	return s.split('\n').filter(l => l.length > 0).length;
}

describe.skipIf(!jjAvailable)('CMD-05 (/gsd-quick) — jj-colocated', () => {
	let dir: string;
	let vcs: JjVcsAdapter;

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), 'gsd-cmd-quick-'));
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
		vcs = createVcsAdapter(dir, { kind: 'jj' }) as JjVcsAdapter;
	});

	afterAll(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
	});

	it('Test 1: vcs.commit on the orchestrator @ produces a single squash (no extra merge change)', () => {
		// Capture the change_id of @ before the commit.
		const before = execSync(
			`jj log -r @ -T 'change_id ++ "\\n"' --no-graph -n 1`,
			{ cwd: dir },
		)
			.toString()
			.trim();

		const quickDir = join(dir, '.planning', 'quick');
		mkdirSync(quickDir, { recursive: true });
		writeFileSync(join(quickDir, 'quick-foo-PLAN.md'), '# quick-foo PLAN\n');

		const r = vcs.commit({
			message: 'docs(quick-foo): pre-dispatch plan for CMD-05 single-squash assertion',
			files: ['.planning/quick/quick-foo-PLAN.md'],
		});
		expect(r.exitCode).toBe(0);

		// After a single squash, @ should advance by exactly one new ancestor
		// (the squashed change). The parent of @ is now the change that
		// holds the commit; @ itself was rebased forward. We assert that
		// the change_id of @ has moved.
		const after = execSync(
			`jj log -r @ -T 'change_id ++ "\\n"' --no-graph -n 1`,
			{ cwd: dir },
		)
			.toString()
			.trim();
		// @-stable invariant (WS-10 spirit; the squash inserts before @
		// without editing @ itself). The squash-based commit model
		// preserves @'s change_id (jj squash -B @ -k -m).
		expect(after).toBe(before);
		// The parent of @ now contains the squashed work.
		const parentSubject = execSync(
			`jj log -r @- -T 'description.first_line() ++ "\\n"' --no-graph -n 1`,
			{ cwd: dir },
		)
			.toString()
			.trim();
		expect(parentSubject).toContain('pre-dispatch plan for CMD-05');
	});

	it('Test 2: NO gsd/phase-* octopus structure is created (single squash on orchestrator @ — no phase setup)', () => {
		// quick.md (per CMD-05 spec) does NOT call createPhaseStructure;
		// the bookmark namespace `gsd/phase-*` should be empty after a
		// single quick commit. Probe via the adapter's bookmark listing.
		const all = vcs.refs.bookmarks.list();
		const phaseBookmarks = all.filter(b => b.name.startsWith('gsd/phase-'));
		expect(phaseBookmarks.length).toBe(0);
	});

	it('Test 3: pre-commit hook fires exactly once per commit (single fire — no double-fire from a non-existent octopus merge)', () => {
		const markerPath = join(dir, '.cmd-05-hook-fired-count');
		safeUnlink(markerPath);
		// Append a marker line per fire so we can count by line count after
		// the single commit completes.
		writeHook(
			dir,
			'pre-commit',
			`#!/bin/bash\necho fired >> "${markerPath}"\nexit 0\n`,
		);

		writeFileSync(join(dir, 'cmd-05-trigger.txt'), 'trigger\n');
		const r = vcs.commit({
			message: 'docs(quick-bar): single-fire hook assertion',
			files: ['cmd-05-trigger.txt'],
		});
		expect(r.exitCode).toBe(0);
		expect(existsSync(markerPath)).toBe(true);
		// EXACTLY ONE fire; if the orchestrator path tried to also fire a
		// post-octopus-merge hook, the line count would be ≥2.
		const body = execSync(`cat "${markerPath}"`).toString();
		expect(countLines(body)).toBe(1);
	});
});
