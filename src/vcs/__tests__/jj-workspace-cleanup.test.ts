/**
 * sdk/src/vcs/__tests__/jj-workspace-cleanup.test.ts — Phase 15.04 Wave 1
 *
 * Unit tests for `cleanupSubagentWorkspaces` helper (UPSTREAM-02 sidecar at
 * `sdk/src/vcs/jj/workspace-cleanup.ts`). Mirrors the single-purpose
 * jj-skipIf shape of `jj-id-alphabet-probe.test.ts`.
 *
 * Coverage (4 scenarios per VALIDATION lines 56-57 + PATTERNS):
 *   1. Idempotency (D-06/D-03): missing dirs not errors; second call returns
 *      all-empty arrays.
 *   2. UPSTREAM-02 import discipline (D-07): file-read grep gate against
 *      `from '../backends/jj'` imports.
 *   3. Handle-authoritative enumeration (Pitfall 4): custom workspacePath
 *      overrides are honored (NOT discovered via readdirSync).
 *   4. readdirSync fallback (dual-mode signature per N1): when `workspaces`
 *      parameter omitted, helper enumerates `phase-{NN}-subagent-*` correctly
 *      and ignores other phase numbers.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	mkdtempSync,
	rmSync,
	mkdirSync,
	writeFileSync,
	readFileSync,
	existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { cleanupSubagentWorkspaces } from '../jj/workspace-cleanup.cjs';

let jjAvailable = false;
try {
	execSync('jj --version', { stdio: 'pipe' });
	jjAvailable = true;
} catch {
	jjAvailable = false;
}

/**
 * Build a fresh colocated jj repo under a random-prefix mkdtemp. Pattern B
 * mirrors `cmd-parallel-jj.test.ts::setupJjRepo` — random suffix avoids the
 * parallel-test-FILE collision mode (Pitfall 9).
 */
function setupJjRepo(): string {
	const dir = mkdtempSync(
		join(
			tmpdir(),
			`gsd-15-workspace-cleanup-${Math.random().toString(36).slice(2, 10)}-`,
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
	return dir;
}

describe.skipIf(!jjAvailable)('cleanupSubagentWorkspaces helper', () => {
	let dir: string;

	beforeAll(() => {
		dir = setupJjRepo();
	});

	afterAll(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
	});

	it('idempotency: missing dirs are not errors; second call returns empty arrays', () => {
		// Phase 1: nonexistent `.claude/jj-workspaces/` returns all-empty arrays
		// without throwing (D-06 contract — missing parent dir is not an error).
		const r0 = cleanupSubagentWorkspaces(dir, 15);
		expect(r0.abandoned).toEqual([]);
		expect(r0.failedReaped).toEqual([]);

		// Phase 2: materialize a fake workspace dir; call with Handle-form.
		// Assert that the dir is gone post-call AND that abandoned[] contains
		// the name.
		const wsDir = join(dir, '.claude', 'jj-workspaces', 'phase-15-subagent-0');
		mkdirSync(wsDir, { recursive: true });
		writeFileSync(join(wsDir, 'sentinel.txt'), 'sentinel\n');
		expect(existsSync(wsDir)).toBe(true);

		const r1 = cleanupSubagentWorkspaces(dir, 15, [
			{ name: 'phase-15-subagent-0', path: wsDir },
		]);
		expect(existsSync(wsDir)).toBe(false);
		expect([...r1.abandoned]).toEqual(['phase-15-subagent-0']);
		expect([...r1.failedReaped]).toEqual([]);

		// Phase 3: re-call with the same Handle-form list. The dir is already
		// gone — D-03 invariant: returns all-empty arrays. The already-gone
		// branch must NOT push to abandoned[] (would break the
		// empty-arrays-on-re-call contract that cancel-idempotent-recall
		// scenarios depend on).
		const r2 = cleanupSubagentWorkspaces(dir, 15, [
			{ name: 'phase-15-subagent-0', path: wsDir },
		]);
		expect([...r2.abandoned]).toEqual([]);
		expect([...r2.failedReaped]).toEqual([]);
	});

	it('UPSTREAM-02 (D-07): helper source has zero imports from backends/jj', () => {
		// File-read grep gate per T-15.04-04 threat mitigation. The helper
		// MUST NOT import from `'../backends/jj'` — would force a merge
		// conflict on every upstream-rebase cycle.
		//
		// Path resolved relative to this test file: vitest's cwd is the
		// repo root, so `src/vcs/jj/workspace-cleanup.cts` is
		// the right relative path.
		const contents = readFileSync(
			'src/vcs/jj/workspace-cleanup.cts',
			'utf-8',
		);
		expect(contents).not.toMatch(/from\s+['"]\.\.\/backends\/jj/);
	});

	it('Handle-authoritative enumeration: covers non-standard workspacePath overrides (Pitfall 4)', () => {
		// Custom workspacePath OUTSIDE the canonical
		// `.claude/jj-workspaces/<name>` layout — the readdirSync fallback
		// would miss it; only Handle-supplied iteration finds it.
		const customDir = mkdtempSync(
			join(tmpdir(), `gsd-15-custom-ws-${Math.random().toString(36).slice(2, 10)}-`),
		);
		const customWs = join(customDir, 'override-ws-foo');
		mkdirSync(customWs, { recursive: true });
		writeFileSync(join(customWs, 'override-sentinel.txt'), 'x\n');
		expect(existsSync(customWs)).toBe(true);

		try {
			const r = cleanupSubagentWorkspaces(dir, 15, [
				{ name: 'override-ws-foo', path: customWs },
			]);
			expect(existsSync(customWs)).toBe(false);
			expect([...r.abandoned]).toEqual(['override-ws-foo']);
			expect([...r.failedReaped]).toEqual([]);
		} finally {
			rmSync(customDir, { recursive: true, force: true });
		}
	});

	it('readdirSync fallback: enumerates phase-NN-subagent-* when workspaces omitted; ignores other phase numbers', () => {
		// Materialize 3 phase-15 dirs + 1 phase-16 dir under the canonical
		// `.claude/jj-workspaces/` layout. Call helper WITHOUT the
		// `workspaces` param — only the phase-15 dirs should be enumerated
		// and cleaned (phase-16 must survive).
		const wsBase = join(dir, '.claude', 'jj-workspaces');
		mkdirSync(wsBase, { recursive: true });
		const phase15Dirs = ['phase-15-subagent-0', 'phase-15-subagent-1', 'phase-15-subagent-2'];
		const phase16Dir = 'phase-16-subagent-0';
		for (const d of [...phase15Dirs, phase16Dir]) {
			const p = join(wsBase, d);
			mkdirSync(p, { recursive: true });
			writeFileSync(join(p, 'fb.txt'), 'fb\n');
		}
		// Sanity: all 4 exist pre-call.
		for (const d of [...phase15Dirs, phase16Dir]) {
			expect(existsSync(join(wsBase, d))).toBe(true);
		}

		try {
			const r = cleanupSubagentWorkspaces(dir, 15);
			expect([...r.abandoned].sort()).toEqual([...phase15Dirs].sort());
			expect([...r.failedReaped]).toEqual([]);
			// phase-15 dirs gone.
			for (const d of phase15Dirs) {
				expect(existsSync(join(wsBase, d))).toBe(false);
			}
			// phase-16 dir UNTOUCHED — phaseNumber=15 must not affect other
			// phases.
			expect(existsSync(join(wsBase, phase16Dir))).toBe(true);
		} finally {
			// Cleanup phase-16 artifact for hygiene.
			rmSync(join(wsBase, phase16Dir), { recursive: true, force: true });
		}
	});
});
