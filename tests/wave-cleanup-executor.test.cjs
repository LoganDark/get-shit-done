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
		const kind = getKind();
		// 1. Seed a base commit on main so HEAD is real.
		fs.writeFileSync(path.join(cwd, 'hp-main.txt'), 'hp-main\n');
		vcs.commit({ files: ['hp-main.txt'], message: 'hp: add main.txt' });
		// 2. Resolve the current main bookmark name BEFORE branching off so the
		//    name is stable (jj's `@-` parent moves as commits land). On a
		//    fresh jj-colocated fixture there is no default bookmark — create
		//    one explicitly at @- (where currentBookmarksIn looks) so the
		//    merge step has a named target to advance.
		let mainNames = vcs.refs.currentBookmarksIn(cwd);
		if (mainNames.length === 0) {
			const exprMod = require('../sdk/dist-cjs/vcs/index.js').expr;
			// On jj, currentBookmarksIn reads bookmarks at @- (the committed
			// parent). vcs.refs.head ("@") would put the bookmark on the empty
			// working-copy draft. Place at @-/parent so the check sees it.
			const baseRev = kind === 'jj-colocated' ? exprMod.parent() : vcs.refs.head;
			vcs.refs.bookmarks.create('main', baseRev, { raw: true });
			mainNames = vcs.refs.currentBookmarksIn(cwd);
		}
		assert.ok(mainNames.length > 0, 'expected a current main bookmark before merge');
		const mainName = mainNames[0];
		// 3. Create the agent bookmark at HEAD. The drift check at executor
		//    runtime needs `currentBookmarksIn(<wt>)` to include the agent
		//    branch — that requires a real second worktree on git (where
		//    `currentBookmarksIn` reports HEAD's own branch only) and a
		//    real second workspace on jj (where it reports the workspace's
		//    `@-` bookmarks). `workspace.add` handles both.
		const ts = Date.now();
		const agentBranch = `worktree-agent-hp-${ts}`;
		// jj: bookmark at @- (the committed parent) so currentBookmarksIn sees it.
		// git: bookmark at HEAD.
		const exprMod = require('../sdk/dist-cjs/vcs/index.js').expr;
		const agentBaseRev = kind === 'jj-colocated' ? exprMod.parent() : vcs.refs.head;
		vcs.refs.bookmarks.create(agentBranch, agentBaseRev, { raw: true });
		// 4. Add a second worktree/workspace checked out to the agent branch.
		//    The path layout for jj uses the D-16 convention so workspace.list()
		//    can resolve the path back to a name in workspace.remove() (Pitfall
		//    in Plan 01 RESEARCH §Pattern 4).
		const wsName = `worktree-agent-hp-${ts}`;
		const wtPath = kind === 'jj-colocated'
			? path.join(cwd, '.claude', 'jj-workspaces', wsName)
			: path.join(cwd, `wt-${wsName}`);
		const expr = require('../sdk/dist-cjs/vcs/index.js').expr;
		vcs.workspace.add({
			path: wtPath,
			baseRef: expr.bookmark(agentBranch),
			...(kind === 'jj-colocated' ? { name: wsName } : {}),
		});
		// 5. In the agent's worktree/workspace, add a divergent commit so the
		//    merge has work to integrate. We use a child adapter scoped to the
		//    wt path to ensure commits land at the wt's `@`/HEAD, not the
		//    orchestrator's.
		const vcsLib = require('../sdk/dist-cjs/vcs/index.js');
		const wtVcs = vcsLib.createVcsAdapter(wtPath, kind === 'jj-colocated' ? { kind: 'jj' } : { kind: 'git' });
		fs.writeFileSync(path.join(wtPath, 'hp-agent.txt'), 'hp-agent\n');
		wtVcs.commit({ files: ['hp-agent.txt'], message: 'hp: agent commit' });
		// 6. Construct the manifest entry threading main_bookmark through.
		const plan = {
			entries: [{
				worktree_path: wtPath,
				branch: agentBranch,
				expected_base: 'HEAD',
				main_bookmark: mainName,
			}],
			action: 'cleanup_wave',
			repoRoot: cwd,
		};
		// 7. Run the executor.
		const r = wsafety.executeWorktreeWaveCleanupPlan(plan, { vcs });
		// 8. Assert: ok=true, no pending entries, mergedAs is a non-empty backend identifier.
		assert.equal(r.ok, true, `executor failed: ${JSON.stringify(r.pending)}`);
		assert.equal(r.pending.length, 0);
		assert.equal(r.entries.length, 1);
		assert.equal(typeof r.entries[0].mergedAs, 'string');
		assert.ok(r.entries[0].mergedAs.length > 0, 'mergedAs must be a non-empty identifier');
		// 9. D-03 atomic agent-bookmark delete: the agent bookmark must be gone
		//    on both backends regardless of how list().rev reports.
		assert.equal(
			vcs.refs.bookmarks.exists(agentBranch, { raw: true }),
			false,
			'agent bookmark must be deleted atomically post-merge (D-03)',
		);
		// 10. D-03 main-advance: the main bookmark must still exist. Cross-ID
		//     equivalence is intentionally NOT asserted because the two IDs
		//     live in different namespaces (D-05): `mergedAs` is the merge
		//     result returned by workspace.merge — change_id on jj, commit
		//     hash on git — while `bookmark.list().rev` is commit_id (non-empty
		//     on jj, empty on git per Phase 1 D-04). Presence is the
		//     load-bearing assertion: D-03 guarantees the bookmark survives
		//     atomically; the contract test in Plan 01 directly verifies the
		//     bookmark-advance side effect on each backend in its own ID space.
		if (typeof vcs.refs.bookmarks.list === 'function') {
			const after = vcs.refs.bookmarks.list();
			const mainEntry = after.find((b) => b.name === mainName);
			assert.ok(mainEntry, `main bookmark '${mainName}' must still exist after merge`);
		}
	});
});
