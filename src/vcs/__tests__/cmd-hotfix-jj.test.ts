/**
 * Phase 5 plan 05-03 Task 3: CMD-08 (/gsd-hotfix) integration test.
 *
 * Verifies the CMD-08 idiom from 05-RESEARCH.md "jj Idioms for New Command
 * Translations":
 *   - Root the hotfix at a historical change via `jj new <past-change-id>`
 *     where `<past-change-id>` is resolved from the `gsd/release/<version>`
 *     bookmark.
 *   - Advance a `gsd/hotfix/<id>` bookmark, where `<id>` follows the
 *     `YYYYMMDD-HHMM` convention recommended by the planner.
 *   - Explicit push surface (CMD-08 / CMD-09 share the explicit-push pattern):
 *     `pushQuery` returns a structured `{ ok, exitCode, stdout, stderr, ... }`
 *     shape; we exercise the call signature without requiring a live remote.
 *
 * Suite skips when `jj --version` is unavailable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createVcsAdapter } from '../index.cjs';
import type { JjVcsAdapter } from '../types.cjs';
// Phase 19 (19-11): fork SDK query handler re-pointed at the PORT-02 CLI
// bridge — VCS_VERB_TABLE['push'] carries the same
// (args, projectDir) -> {data} contract the retired sdk/src/query handler had.
import * as vcsCommandRouterNs from '../../vcs-command-router.cjs';
const vcsCommandRouter =
	((vcsCommandRouterNs as any).default ?? vcsCommandRouterNs) as {
		VCS_VERB_TABLE: Record<
			string,
			(args: string[], projectDir: string) => Promise<{ data: unknown }> | { data: unknown }
		>;
	};
const pushQuery = vcsCommandRouter.VCS_VERB_TABLE['push'];

let jjAvailable = false;
try {
	execSync('jj --version', { stdio: 'pipe' });
	jjAvailable = true;
} catch {
	// jj not on PATH; entire suite skips.
}

/** Return the @- change_id. */
function parentChangeId(dir: string): string {
	return execSync(`jj log -r @- -T 'change_id ++ "\\n"' --no-graph -n 1`, {
		cwd: dir,
	})
		.toString()
		.trim();
}

describe.skipIf(!jjAvailable)('CMD-08 (/gsd-hotfix) — jj-colocated', () => {
	let dir: string;
	let vcs: JjVcsAdapter;
	let releaseChangeId: string;

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), 'gsd-cmd-hotfix-jj-'));
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
		// git. pushQuery dispatches through createVcsAdapter(cwd) without
		// explicit opts, so we need the sticky config to force jj.
		mkdirSync(join(dir, '.planning'), { recursive: true });
		writeFileSync(
			join(dir, '.planning', 'config.json'),
			JSON.stringify({ vcs: { adapter: 'jj' } }),
		);
		vcs = createVcsAdapter(dir, { kind: 'jj' }) as JjVcsAdapter;

		// Seed a release baseline: one commit + a `release/v1.0` bookmark at @-.
		writeFileSync(join(dir, 'release.txt'), 'v1.0\n');
		expect(
			vcs.commit({
				message: 'feat(05-03): hotfix-test release v1.0 baseline',
				files: ['release.txt'],
			}).exitCode,
		).toBe(0);
		releaseChangeId = parentChangeId(dir);
		// Bookmark name: pass `release/v1.0` — the adapter adds the `gsd/`
		// prefix internally (D-03), so the underlying jj bookmark is
		// `gsd/release/v1.0`.
		vcs.refs.bookmarks.create('release/v1.0', vcs.refs.head);
	});

	afterAll(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
	});

	it('Test 1: `jj new <release-change-id>` roots a hotfix descended from the gsd/release bookmark', () => {
		// `jj new <past-change-id>` creates a new change off the historical rev.
		execSync(`jj new ${releaseChangeId}`, { cwd: dir, stdio: 'pipe' });
		// After `jj new`, @ is the freshly created change; assert its parent
		// is the release change_id we just rooted off.
		const parent = parentChangeId(dir);
		expect(parent).toBe(releaseChangeId);
	});

	it('Test 2: gsd/hotfix/<YYYYMMDD-HHMM> bookmark CRUD round-trip', () => {
		// Squash a hotfix commit into @.
		writeFileSync(join(dir, 'hotfix.txt'), 'hotfix payload\n');
		const r = vcs.commit({
			message: 'fix(05-03): hotfix-test patch on top of release',
			files: ['hotfix.txt'],
		});
		expect(r.exitCode).toBe(0);

		// Bookmark <id> follows YYYYMMDD-HHMM per the planner's recommendation.
		const hotfixId = '20260514-0349';
		const bookmarkName = `hotfix/${hotfixId}`;
		vcs.refs.bookmarks.create(bookmarkName, vcs.refs.head);
		expect(vcs.refs.bookmarks.exists(bookmarkName)).toBe(true);

		// list() returns the unprefixed form (D-03 round-trip). The
		// underlying jj-side bookmark is `gsd/hotfix/<id>` — confirm by
		// probing the raw jj output too (no `gsd/` prefix in the listed names
		// because list() strips it).
		const names = vcs.refs.bookmarks.list().map(b => b.name);
		expect(names).toContain(bookmarkName);
		// Raw probe: the gsd/ prefix MUST exist on the jj side.
		const rawList = execSync('jj bookmark list --all-remotes', {
			cwd: dir,
		}).toString();
		expect(rawList).toContain(`gsd/${bookmarkName}`);

		// Cleanup for tidy state.
		vcs.refs.bookmarks.delete(bookmarkName);
	});

	it('Test 3: pushQuery argv shape — --remote origin --bookmark gsd/hotfix/<id>', async () => {
		// The fixture has no remote. We exercise the pushQuery call signature
		// against the gsd/hotfix/<YYYYMMDD-HHMM> namespace.
		//
		// Phase 19 (19-11): the original assertion here pinned the PRE-WR-03
		// behavior (raw refname passthrough → adapter-side Invalid
		// RevisionExpr throw). Plan 05-06 Task 2 closed WR-03: pushQuery
		// wraps --bookmark via expr.bookmark() and returns a structured
		// envelope instead of throwing — exactly what the sibling
		// cmd-ship-jj Test 2 pins. This test now asserts the same contract
		// for the gsd/hotfix/ namespace: the argv parsing reaches the
		// adapter, the bookmark round-trips into the envelope, and no
		// Invalid RevisionExpr leaks (the push itself fails for
		// remote-not-configured reasons only).
		const hotfixId = '20260514-0349';
		const bookmarkName = `hotfix/${hotfixId}`;
		// Re-create the bookmark for this test (Test 2 deletes it).
		vcs.refs.bookmarks.create(bookmarkName, vcs.refs.head);

		const res = await pushQuery(
			['--remote', 'origin', '--bookmark', bookmarkName],
			dir,
		);
		expect(res.data).toBeDefined();
		expect(typeof (res.data as { ok: boolean }).ok).toBe('boolean');
		// The bookmark argv round-trips into the envelope per pushQuery contract.
		expect((res.data as { bookmark?: string }).bookmark).toBe(bookmarkName);
		// No Invalid RevisionExpr leakage — WR-03 stays closed in the ported verb.
		const errText =
			((res.data as { stderr?: string }).stderr ?? '') +
			((res.data as { error?: string }).error ?? '');
		expect(errText).not.toMatch(/Invalid RevisionExpr/);

		// Cleanup.
		vcs.refs.bookmarks.delete(bookmarkName);
	});
});
