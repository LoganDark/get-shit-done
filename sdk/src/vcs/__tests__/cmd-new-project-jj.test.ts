/**
 * Phase 5 plan 05-02 Task 3: CMD-01 integration test.
 *
 * Verifies `/gsd-new-project` translates correctly to jj-colocated mode:
 *   - createVcsAdapter with kind='jj' constructs successfully on a fresh
 *     `jj git init --colocate` tmpdir.
 *   - Backend selection: when both .git and .jj exist (colocated), the
 *     adapter still resolves to jj when opts.kind is set explicitly.
 *   - vcs.commit({ message, files: [] }) succeeds on the freshly-initialized
 *     repo — proves the CMD-01 init → first-commit path lands.
 *
 * Suite skips when `jj --version` is unavailable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	existsSync,
	mkdtempSync,
	rmSync,
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

describe.skipIf(!jjAvailable)('CMD-01 (/gsd-new-project) — jj-colocated', () => {
	let dir: string;
	let vcs: JjVcsAdapter;

	beforeAll(() => {
		// Unique tmpdir prefix per CMD-* file (pre-empts Phase 4 LEARNINGS
		// tmpdir-contention flake category).
		dir = mkdtempSync(join(tmpdir(), 'gsd-cmd-new-project-'));
		execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
		execSync('jj config set --repo user.email "test@test.com"', {
			cwd: dir,
			stdio: 'pipe',
		});
		execSync('jj config set --repo user.name "Test"', {
			cwd: dir,
			stdio: 'pipe',
		});
		vcs = createVcsAdapter(dir, { kind: 'jj' }) as JjVcsAdapter;
	});

	afterAll(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
	});

	it('Test 1: createVcsAdapter constructs in jj mode on a colocated init', () => {
		expect(vcs).toBeDefined();
		expect(typeof vcs.commit).toBe('function');
		expect(vcs.kind).toBe('jj');
	});

	it('Test 2: backend selection — colocated repo with explicit kind=jj resolves to jj', () => {
		// Both .git and .jj exist after `jj git init --colocate`. The
		// adapter's resolveKind picks opts.kind first (D-17 priority order).
		expect(existsSync(join(dir, '.git'))).toBe(true);
		expect(existsSync(join(dir, '.jj'))).toBe(true);
		const explicit = createVcsAdapter(dir, { kind: 'jj' });
		expect(explicit.kind).toBe('jj');
	});

	it('Test 3: vcs.commit({ message, files: ["seed.txt"] }) succeeds (init → first-commit path)', () => {
		// CMD-01 init landing path: write a seed file, vcs.commit it.
		// On jj this routes through `jj squash -B @ -k -m` (see jj.ts:200+).
		writeFileSync(join(dir, 'seed.txt'), 'seed\n');
		const r = vcs.commit({
			message: 'init: seed for CMD-01 test',
			files: ['seed.txt'],
		});
		expect(r.exitCode).toBe(0);
		expect(r.hash).toBeTruthy();
	});
});
