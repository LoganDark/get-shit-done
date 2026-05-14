/**
 * Phase 5 plan 05-03 Task 3: CMD-04 spillover + CMD-11 integration test
 * (/gsd-complete-milestone).
 *
 * Verifies the milestone-close flow's translation surface against the live
 * jj-colocated backend:
 *   - branchListQuery surfaces `gsd/phase-*` bookmarks (the phase-merge
 *     bookmarks the orchestrator advances).
 *   - Milestone archival creates `gsd/milestone/v1.0/...` bookmarks via
 *     `vcs.refs.bookmarks.create` (the jj-side equivalent of git's
 *     annotated tag — REFS-06).
 *   - The final milestone-archive commit (`gsd-sdk query commit "chore:
 *     archive v1.0 milestone files" --files ...`) lands and appears in
 *     `vcs.log`.
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
import { branchListQuery } from '../../query/branch-list.js';

let jjAvailable = false;
try {
	execSync('jj --version', { stdio: 'pipe' });
	jjAvailable = true;
} catch {
	// jj not on PATH; entire suite skips.
}

describe.skipIf(!jjAvailable)(
	'CMD-04 spillover + CMD-11 (/gsd-complete-milestone) — jj-colocated',
	() => {
		let dir: string;
		let vcs: JjVcsAdapter;

		beforeAll(() => {
			dir = mkdtempSync(join(tmpdir(), 'gsd-cmd-complete-milestone-jj-'));
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
			// Pin backend detection to jj — branchListQuery dispatches via
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

		it('Test 1: branchListQuery surfaces gsd/phase-* bookmarks (orchestrator-advanced merge markers)', async () => {
			// Simulate the post-phase-merge state: the orchestrator has
			// advanced `gsd/phase-04` bookmark to the merge change.
			writeFileSync(join(dir, 'phase-04-output.txt'), 'phase 04 work\n');
			expect(
				vcs.commit({
					message: 'feat(04): phase 04 final merge commit',
					files: ['phase-04-output.txt'],
				}).exitCode,
			).toBe(0);
			vcs.refs.bookmarks.create('phase-04', vcs.refs.head);
			expect(vcs.refs.bookmarks.exists('phase-04')).toBe(true);

			// branchListQuery dispatches the SDK adapter's bookmark listing.
			// The handler returns `data.bookmarks: Bookmark[]` (Phase 2.1 D-15
			// shape). We assert the prefix-filtered list contains phase-04.
			const res = await branchListQuery(['--prefix', 'phase-'], dir);
			const bookmarks = (res.data as { bookmarks?: { name: string }[] })
				.bookmarks;
			expect(Array.isArray(bookmarks)).toBe(true);
			const names = (bookmarks ?? []).map(b => b.name);
			expect(names).toContain('phase-04');

			// Cleanup for tidy state across sibling tests.
			vcs.refs.bookmarks.delete('phase-04');
		});

		it('Test 2: gsd/milestone/v1.0/* archive bookmarks via vcs.refs.bookmarks.create (REFS-06 — bookmarks not tags)', () => {
			// On the jj backend, milestone archival creates bookmarks under
			// the `gsd/milestone/v1.0/...` namespace (REFS-06: no annotated
			// tags). Probe by creating, listing, and probing raw jj-side state.
			vcs.refs.bookmarks.create('milestone/v1.0/phase-01', vcs.refs.head);
			vcs.refs.bookmarks.create('milestone/v1.0/phase-02', vcs.refs.head);

			const names = vcs.refs.bookmarks.list().map(b => b.name);
			expect(names).toContain('milestone/v1.0/phase-01');
			expect(names).toContain('milestone/v1.0/phase-02');

			// Raw probe: the `gsd/` prefix is canonical on the jj side.
			const rawList = execSync('jj bookmark list --all-remotes', {
				cwd: dir,
			}).toString();
			expect(rawList).toContain('gsd/milestone/v1.0/phase-01');
			expect(rawList).toContain('gsd/milestone/v1.0/phase-02');

			// Cleanup.
			vcs.refs.bookmarks.delete('milestone/v1.0/phase-01');
			vcs.refs.bookmarks.delete('milestone/v1.0/phase-02');
		});

		it('Test 3: final milestone-archive commit lands via vcs.commit and surfaces in vcs.log', () => {
			mkdirSync(join(dir, '.planning'), { recursive: true });
			writeFileSync(
				join(dir, '.planning', 'MILESTONES.md'),
				'# v1.0 milestone archive\n',
			);
			const r = vcs.commit({
				message: 'chore(05-03): archive v1.0 milestone files',
				files: ['.planning/MILESTONES.md'],
			});
			expect(r.exitCode).toBe(0);

			// Squash-based commit lands the message on @- (Plan 2.1-04 D-02/D-04/D-06);
			// scan the ancestry for the subject string.
			const log = vcs.log({ maxCount: 20, allRefs: true });
			const subjects = log.map(e => e.subject).join(' | ');
			expect(subjects).toContain('archive v1.0 milestone files');
		});
	},
);
