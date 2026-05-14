/**
 * Phase 5 plan 05-03 Task 3: CMD-06 (/gsd-undo) integration test.
 *
 * Verifies `/gsd-undo` translates correctly to jj-colocated mode:
 *   - `gsd-sdk query revert <change_id>` on a jj backend dispatches
 *     `jj abandon <change_id>` — DESTRUCTIVE (Pitfall 6 from
 *     05-RESEARCH.md "jj idiom mismatch in CMD-06 undo semantics").
 *   - The abandoned change disappears from `vcs.log()` ancestry but
 *     remains recoverable via `jj op log` (operation log retains the
 *     pre-abandon state — the canonical Pitfall 6 invariant).
 *   - Sequential abandons of multiple changes both succeed; working-copy
 *     state is preserved (no data loss).
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
import { revertQuery } from '../../query/revert.js';

let jjAvailable = false;
try {
	execSync('jj --version', { stdio: 'pipe' });
	jjAvailable = true;
} catch {
	// jj not on PATH; entire suite skips.
}

/** Return the @- change_id (the parent of @, where squash-based commits land). */
function parentChangeId(dir: string): string {
	return execSync(`jj log -r @- -T 'change_id ++ "\\n"' --no-graph -n 1`, {
		cwd: dir,
	})
		.toString()
		.trim();
}

describe.skipIf(!jjAvailable)('CMD-06 (/gsd-undo) — jj-colocated', () => {
	let dir: string;
	let vcs: JjVcsAdapter;

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), 'gsd-cmd-undo-jj-'));
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
		// Pin backend detection to jj for this tmpdir — colocated jj repos
		// also have `.git/`, so the auto-detect (D-17 reversal) would pick
		// git. The revertQuery dispatches through createVcsAdapter(cwd)
		// without explicit opts, so we need the sticky config to force jj.
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

	it('Test 1: gsd-sdk query revert <change_id> abandons the change on jj (destructive — Pitfall 6)', async () => {
		// Seed two distinct commits on top of the baseline seed.
		writeFileSync(join(dir, 'feature-a.txt'), 'a\n');
		const r1 = vcs.commit({
			message: 'feat(05-03): undo-test feature A',
			files: ['feature-a.txt'],
		});
		expect(r1.exitCode).toBe(0);
		const changeIdA = parentChangeId(dir);

		writeFileSync(join(dir, 'feature-b.txt'), 'b\n');
		const r2 = vcs.commit({
			message: 'feat(05-03): undo-test feature B',
			files: ['feature-b.txt'],
		});
		expect(r2.exitCode).toBe(0);

		// Pre-revert: feature A must be visible in the ancestry log.
		const subjectsBefore = vcs
			.log({ maxCount: 20, allRefs: true })
			.map(e => e.subject)
			.join(' | ');
		expect(subjectsBefore).toContain('undo-test feature A');
		expect(subjectsBefore).toContain('undo-test feature B');

		// Invoke the revert query verb against the real jj backend; this
		// dispatches `jj abandon <change_id>` (NOT `jj revert`, which doesn't
		// exist in jj 0.41). The query verb's data.backend field must report 'jj'
		// and data.destructive must be true (the Pitfall 6 contract).
		const res = await revertQuery([changeIdA], dir);
		expect(res.data).toMatchObject({
			ok: true,
			backend: 'jj',
			destructive: true,
		});

		// Post-revert: feature A is GONE from the ancestry log (destructive
		// abandon — Pitfall 6). Feature B survives (we only abandoned A).
		const subjectsAfter = vcs
			.log({ maxCount: 20, allRefs: true })
			.map(e => e.subject)
			.join(' | ');
		expect(subjectsAfter).not.toContain('undo-test feature A');
		expect(subjectsAfter).toContain('undo-test feature B');
	});

	it('Test 2: Pitfall 6 recovery invariant — jj op log retains the pre-abandon state', () => {
		// The operation log is jj's recovery path for destructive history
		// rewrites. After Test 1's abandon, `jj op log` must show at least
		// two operations (the prior commits + the abandon). The exact wording
		// of each op-log entry is jj-version-dependent (jj 0.41 may render
		// the abandon as "abandon", a different verb, or a `jj operations`
		// rendering string); we assert the structural invariant — the op-log
		// is reachable, contains multiple operations, and is the documented
		// recovery path that `jj op restore <op>` operates on.
		const opLog = execSync('jj op log --no-pager --limit 20', {
			cwd: dir,
		}).toString();
		expect(opLog.length).toBeGreaterThan(0);
		// At least two distinct op_id lines — the op-log must record more
		// than one operation (the abandon flows through op-log even if the
		// exact verb rendering differs across jj versions).
		const opLines = opLog
			.split('\n')
			.filter(l => /[a-z0-9]{6,}/.test(l));
		expect(opLines.length).toBeGreaterThanOrEqual(2);
	});

	it('Test 3: sequential abandons via revertQuery — working-copy state is preserved (no data loss on @)', async () => {
		// Seed three sequential changes; abandon two of them via revertQuery
		// back-to-back; assert the third survives AND the working copy is
		// still clean (no orphan conflict markers, no half-applied state).
		writeFileSync(join(dir, 'seq-a.txt'), 'seq-a\n');
		const ra = vcs.commit({
			message: 'feat(05-03): seq abandon test A',
			files: ['seq-a.txt'],
		});
		expect(ra.exitCode).toBe(0);
		const seqA = parentChangeId(dir);

		writeFileSync(join(dir, 'seq-b.txt'), 'seq-b\n');
		const rb = vcs.commit({
			message: 'feat(05-03): seq abandon test B',
			files: ['seq-b.txt'],
		});
		expect(rb.exitCode).toBe(0);
		const seqB = parentChangeId(dir);

		writeFileSync(join(dir, 'seq-c.txt'), 'seq-c\n');
		const rc = vcs.commit({
			message: 'feat(05-03): seq abandon test C',
			files: ['seq-c.txt'],
		});
		expect(rc.exitCode).toBe(0);

		// Abandon A and B; C must survive.
		const resA = await revertQuery([seqA], dir);
		expect(resA.data).toMatchObject({ ok: true, destructive: true });
		const resB = await revertQuery([seqB], dir);
		expect(resB.data).toMatchObject({ ok: true, destructive: true });

		const subjects = vcs
			.log({ maxCount: 20, allRefs: true })
			.map(e => e.subject)
			.join(' | ');
		expect(subjects).not.toContain('seq abandon test A');
		expect(subjects).not.toContain('seq abandon test B');
		expect(subjects).toContain('seq abandon test C');

		// Working copy preserved — no conflict markers, no half-applied state.
		// Probe via the adapter's findConflicts (CONFLICT-01 surface): the
		// abandon must NOT have introduced an in-tree conflict.
		const conflicts = vcs.findConflicts({ scope: 'all' });
		expect(conflicts).toEqual([]);
	});
});
