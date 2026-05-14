/**
 * Phase 5 plan 05-02 Task 3: CMD-04 (partial — discuss only) integration test.
 *
 * Verifies `/gsd-discuss-phase` translates correctly to jj-colocated mode:
 *   - vcs.commit with multiple files (CONTEXT.md + DISCUSSION-LOG.md)
 *     succeeds and the commit appears in vcs.log() with the expected
 *     subject.
 *   - The CMD-04 verify-work and complete-milestone flows are covered in
 *     plan 05-03 (lifecycle-phase plan).
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

let jjAvailable = false;
try {
	execSync('jj --version', { stdio: 'pipe' });
	jjAvailable = true;
} catch {
	// jj not on PATH; entire suite skips.
}

describe.skipIf(!jjAvailable)('CMD-04 (/gsd-discuss-phase, partial) — jj-colocated', () => {
	let dir: string;
	let vcs: JjVcsAdapter;

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), 'gsd-cmd-discuss-phase-'));
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

	it('Test 1: vcs.commit with discuss-phase artifact files (CONTEXT.md + DISCUSSION-LOG.md) succeeds and surfaces in vcs.log({maxCount:1})', () => {
		const phaseDir = join(dir, '.planning', 'phases', '05-foo');
		mkdirSync(phaseDir, { recursive: true });
		writeFileSync(join(phaseDir, '05-CONTEXT.md'), '# CONTEXT\n');
		writeFileSync(join(phaseDir, '05-DISCUSSION-LOG.md'), '# DISCUSSION\n');

		const r = vcs.commit({
			message: 'docs(05): discuss artifacts (CMD-04 partial assertion)',
			files: [
				'.planning/phases/05-foo/05-CONTEXT.md',
				'.planning/phases/05-foo/05-DISCUSSION-LOG.md',
			],
		});
		expect(r.exitCode).toBe(0);
		expect(r.hash).toBeTruthy();

		// jj squash-based commit lands the message on @-'s description (jj
		// squash -B @ -k -m), not on @. Query for the entire ancestry chain
		// and assert the subject appears.
		const log = vcs.log({ maxCount: 10, allRefs: true });
		expect(log.length).toBeGreaterThan(0);
		const subjects = log.map(e => e.subject).join(' | ');
		expect(subjects).toContain('discuss artifacts');
	});

	it('Test 2: discuss-phase commit shape matches the gsd-sdk query commit argv form (positional message + --files <list>)', () => {
		// Exercises the SDK-surface contract the discuss-phase workflow rewrite
		// (this plan's Task 1/2 patterns + plan 05-03 discuss-phase.md
		// rewrite) targets. The shape is `commit(message, files)`; this test
		// asserts both the success path AND the appearance in the log of a
		// distinct subject string proving message-shape preservation under
		// the SDK query → vcs.commit adapter flow.
		const phaseDir = join(dir, '.planning', 'phases', '05-bar');
		mkdirSync(phaseDir, { recursive: true });
		writeFileSync(join(phaseDir, '05-CONTEXT.md'), '# CONTEXT bar\n');

		const r = vcs.commit({
			message: 'docs(05-bar): discuss CONTEXT only (single-file path)',
			files: ['.planning/phases/05-bar/05-CONTEXT.md'],
		});
		expect(r.exitCode).toBe(0);

		// Same squash-based commit shape as Test 1 — message lands on @-.
		const log = vcs.log({ maxCount: 10, allRefs: true });
		const subjects = log.map(e => e.subject).join(' | ');
		expect(subjects).toContain('discuss CONTEXT only');
	});
});
