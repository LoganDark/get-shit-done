'use strict';
/**
 * Phase 7 WAVE-01 — wave-cleanup executor integration tests.
 *
 * Three scenarios per backend:
 *   1. Empty manifest → ok:true, reason:'empty_plan'.
 *   2. Branch-drift → pending[] with reason:'branch_drift'.
 *   3. Happy-path full chain → ok:true, mergedAs non-empty, main bookmark
 *      advanced (jj-side; git's bookmarks.list().rev is empty per Phase 1
 *      D-04), agent bookmark deleted atomically (D-03).
 *
 * Backends are switched via the `vcsTest('auto', ...)` fixture from
 * tests/helpers.cjs which honors GSD_TEST_BACKENDS. The tests use the real
 * adapter from the fixture — no stub injection — because branch-drift and
 * happy-path both exercise `vcs.refs.currentBookmarksIn(cwd)` which needs
 * a real backend behind it.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const wsafety = require('../get-shit-done/bin/lib/worktree-safety.cjs');
const { vcsTest } = require('./helpers.cjs');

vcsTest('auto', ({ getVcs, getCwd, getKind }) => {
	test('Phase 7 WAVE-01: empty-plan returns ok:true with reason:empty_plan', () => {
		const cwd = getCwd();
		const r = wsafety.executeWorktreeWaveCleanupPlan(
			{ entries: [], action: 'skip', repoRoot: cwd },
			{ vcs: getVcs() },
		);
		assert.equal(r.ok, true);
		assert.equal(r.reason, 'empty_plan');
		assert.deepEqual(r.entries, []);
		assert.deepEqual(r.pending, []);
	});

	test('Phase 7 WAVE-01: branch-drift — manifest claims wrong branch → pending[branch_drift]', () => {
		const vcs = getVcs();
		const cwd = getCwd();
		// Seed a commit so HEAD exists.
		fs.writeFileSync(path.join(cwd, 'bd-a.txt'), 'a');
		vcs.commit({ files: ['bd-a.txt'], message: 'bd: seed' });
		// Create a real agent bookmark at HEAD.
		const ts = Date.now();
		const realBranch = `worktree-agent-A-${ts}`;
		vcs.refs.bookmarks.create(realBranch, vcs.refs.head, { raw: true });
		// Feed a manifest entry claiming a DIFFERENT branch — this is the drift.
		const claimedBranch = `worktree-agent-B-${ts}`;
		// Resolve the current main bookmark so the manifest entry is well-formed
		// even though the drift check fires before the merge step.
		const mainNames = vcs.refs.currentBookmarksIn(cwd);
		const mainName = mainNames[0] || 'main';
		const plan = {
			entries: [{
				worktree_path: cwd,
				branch: claimedBranch,
				expected_base: 'HEAD',
				main_bookmark: mainName,
			}],
			action: 'cleanup_wave',
			repoRoot: cwd,
		};
		const r = wsafety.executeWorktreeWaveCleanupPlan(plan, { vcs });
		assert.equal(r.ok, false);
		assert.equal(r.entries.length, 0);
		assert.equal(r.pending.length, 1);
		assert.equal(r.pending[0].reason, 'branch_drift');
		assert.ok(Array.isArray(r.pending[0].detected), 'pending[0].detected must be an array');
		// Cleanup so subsequent tests see a clean state if snapshot/restore isn't active.
		try { vcs.refs.bookmarks.delete(realBranch, { raw: true, force: true }); } catch { /* ignore */ }
	});

	test('Phase 7 WAVE-01: happy-path — full chain advances main bookmark and returns mergedAs', () => {
		const vcs = getVcs();
		const cwd = getCwd();
		// 1. Seed a base commit on main so HEAD is real.
		fs.writeFileSync(path.join(cwd, 'hp-main.txt'), 'hp-main\n');
		vcs.commit({ files: ['hp-main.txt'], message: 'hp: add main.txt' });
		// 2. Resolve the actual current main bookmark name.
		const mainNames = vcs.refs.currentBookmarksIn(cwd);
		assert.ok(mainNames.length > 0, 'expected a current main bookmark before merge');
		const mainName = mainNames[0];
		// 3. Advance HEAD with a second commit, then create/repoint the agent
		//    bookmark at the new HEAD so it actually carries divergent work.
		fs.writeFileSync(path.join(cwd, 'hp-agent.txt'), 'hp-agent\n');
		vcs.commit({ files: ['hp-agent.txt'], message: 'hp: agent commit' });
		const agentBranch = `worktree-agent-hp-${Date.now()}`;
		vcs.refs.bookmarks.create(agentBranch, vcs.refs.head, { raw: true });
		// 4. Construct the manifest entry threading main_bookmark through.
		const plan = {
			entries: [{
				worktree_path: cwd,
				branch: agentBranch,
				expected_base: 'HEAD',
				main_bookmark: mainName,
			}],
			action: 'cleanup_wave',
			repoRoot: cwd,
		};
		// 5. Run the executor.
		const r = wsafety.executeWorktreeWaveCleanupPlan(plan, { vcs });
		// 6. Assert: ok=true, no pending entries, mergedAs is a non-empty backend identifier.
		assert.equal(r.ok, true, `executor failed: ${JSON.stringify(r.pending)}`);
		assert.equal(r.pending.length, 0);
		assert.equal(r.entries.length, 1);
		assert.equal(typeof r.entries[0].mergedAs, 'string');
		assert.ok(r.entries[0].mergedAs.length > 0, 'mergedAs must be a non-empty identifier');
		// 7. D-03 atomic agent-bookmark delete: the agent bookmark must be gone
		//    on both backends regardless of how list().rev reports.
		assert.equal(
			vcs.refs.bookmarks.exists(agentBranch, { raw: true }),
			false,
			'agent bookmark must be deleted atomically post-merge (D-03)',
		);
		// 8. D-03 main-advance: the main bookmark must still exist. On jj
		//    backends, bookmarks.list() returns a non-empty `rev` field and we
		//    can assert it matches mergedAs. On git, bookmarks.list() returns
		//    `rev: ''` per Phase 1 D-04 — assert presence only.
		if (typeof vcs.refs.bookmarks.list === 'function') {
			const after = vcs.refs.bookmarks.list();
			const mainEntry = after.find((b) => b.name === mainName);
			assert.ok(mainEntry, `main bookmark '${mainName}' must still exist after merge`);
			if (mainEntry.rev && mainEntry.rev.length > 0) {
				assert.equal(
					mainEntry.rev,
					r.entries[0].mergedAs,
					'main bookmark must advance to mergedAs (D-03 atomic main-advance)',
				);
			}
		}
	});
});
