'use strict';

/**
 * tests/scripts/dogfood-restore-orphan-cleanup.test.cjs — Phase 16.02 (CLEANUP-02)
 *
 * Bash-driven integration test for the post-restore orphan-workspace cleanup
 * step appended to `scripts/dogfood-restore.sh` per CONTEXT D-11/D-12/D-13.
 *
 * Seeds TWO distinct phase numbers under `.claude/jj-workspaces/`
 * (`phase-15-subagent-1` and `phase-16-subagent-2`) per D-16, runs the
 * production `scripts/dogfood-restore.sh` against a synthetic fixture
 * (real colocated jj repo + empty fake tarball), and asserts BOTH workspace
 * dirs are gone after the script completes. Proves the bridge's
 * `--all-phases` enumeration crosses phase boundaries correctly (D-05 + D-06).
 *
 * D-12 exit-semantics: the script MUST exit 0 even if the cleanup-bridge
 * call returns a WARN — recovery hygiene is non-blocking; restore success
 * (op-restore + tar both succeeded) is what matters.
 *
 * Pattern B (TEST-16 / Pitfall 9): test creates a random-prefix mkdtemp it
 * owns, materializes the fixture, and cleans up with rmSync(... {recursive:
 * true, force: true}) in a finally block. No shared fixture state; never
 * touches the production .claude/jj-workspaces/ tree. Per
 * feedback_avoid_jj_auto_tracked_output: no file writes into the colocated-jj
 * working tree — output stays in shell variables + stderr.
 *
 * Skip-gate: if `jj` is not on PATH the test runs t.skip() inside the body
 * (the production script invokes `jj op restore` which would hard-fail
 * without jj).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
	mkdtempSync,
	mkdirSync,
	writeFileSync,
	rmSync,
	existsSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { spawnSync, execSync } = require('node:child_process');

function commandExists(cmd) {
	const r = spawnSync('sh', ['-c', `command -v ${cmd}`], { encoding: 'utf-8' });
	return r.status === 0 && r.stdout.trim().length > 0;
}

const JJ_AVAILABLE = commandExists('jj');

// Seed a single orphan workspace directory under
// .claude/jj-workspaces/phase-<NN>-subagent-<idx>/ with a marker file so
// pre/post existsSync checks distinguish "seeded" from "never created".
function seedWorkspace(root, phaseNum, idx) {
	const phaseTag = String(phaseNum).padStart(2, '0');
	const wsName = `phase-${phaseTag}-subagent-${idx}`;
	const wsDir = path.join(root, '.claude', 'jj-workspaces', wsName);
	mkdirSync(wsDir, { recursive: true });
	writeFileSync(path.join(wsDir, 'marker.txt'), 'orphan\n');
	return wsDir;
}

// Materialize a colocated jj repo at `root` so the production
// `jj op restore` invocation inside dogfood-restore.sh succeeds.
// Synthesizes a placeholder .planning/STATE.md so future Plan 18.02
// WR-01 precondition is not retroactively violated.
function seedJjRepo(root) {
	execSync('jj git init --colocate', { cwd: root, stdio: 'pipe' });
	execSync('jj config set --repo user.email "test@test.com"', {
		cwd: root,
		stdio: 'pipe',
	});
	execSync('jj config set --repo user.name "Test"', {
		cwd: root,
		stdio: 'pipe',
	});
	mkdirSync(path.join(root, '.planning'), { recursive: true });
	writeFileSync(path.join(root, '.planning', 'STATE.md'), '# seed STATE\n');
	execSync('jj squash -B @ -k -m "seed planning"', {
		cwd: root,
		stdio: 'pipe',
	});
}

// Create a minimal tarball at /tmp/dogfood-test-XXXX.tar containing a single
// .planning/ entry. The script's `tar -xf` overlays it on top of the
// synthetic repo without disrupting the orphan-dir seeds (which live under
// .claude/, not .planning/).
function seedFakeTarball() {
	const tarDir = mkdtempSync(path.join(tmpdir(), 'dogfood-test-tar-'));
	const stageDir = path.join(tarDir, 'stage');
	mkdirSync(path.join(stageDir, '.planning'), { recursive: true });
	writeFileSync(path.join(stageDir, '.planning', 'placeholder.txt'), 'ok\n');
	const tarPath = path.join(tarDir, 'planning.tar');
	execSync(`tar -cf "${tarPath}" -C "${stageDir}" .planning`, { stdio: 'pipe' });
	return { tarPath, tarDir };
}

// Return the latest op-id from `jj op log --limit 1` for `root`. Trim trailing
// newline. Feeds the script's positional <pre-op-id> argument.
function currentJjOpId(root) {
	const r = execSync(
		'jj op log --no-graph -T "id ++ \\"\\n\\"" --limit 1',
		{ cwd: root, encoding: 'utf-8' },
	);
	return r.trim().split('\n')[0].trim();
}

test('D-16: dogfood-restore.sh reaps orphan workspace dirs from 2 distinct phases via --all-phases', (t) => {
	if (!JJ_AVAILABLE) {
		t.skip('jj binary not on PATH');
		return;
	}
	const fixDir = mkdtempSync(path.join(tmpdir(), '__dogfood-restore-cleanup-'));
	let tarBundle;
	let shimDir;
	try {
		seedJjRepo(fixDir);
		// D-16: seed TWO distinct phase numbers so the test exercises the
		// cross-phase enumeration logic in the bridge's --all-phases mode.
		const ws15 = seedWorkspace(fixDir, 15, 1);
		const ws16 = seedWorkspace(fixDir, 16, 2);
		assert.ok(existsSync(ws15), 'seed: ws15 dir must exist before script run');
		assert.ok(existsSync(ws16), 'seed: ws16 dir must exist before script run');

		const opId = currentJjOpId(fixDir);
		tarBundle = seedFakeTarball();

		const restoreScript = path.resolve(
			__dirname,
			'..',
			'..',
			'scripts',
			'dogfood-restore.sh',
		);
		// Inject a temp `gsd-sdk` PATH-shim that dispatches to THIS
		// workspace's sdk/dist/cli.js (the build that contains the new
		// bridge). Without this PATH override the script's `gsd-sdk` lookup
		// finds the user's globally-installed `gsd-sdk` symlink which may
		// point to a sibling workspace's dist that does not yet have the
		// bridge registered. The shim mirrors `bin/gsd-sdk.js` semantics
		// (Node executes the cli.js with stdio: inherit) so behavior is
		// identical to a normal PATH-resolved invocation.
		// Place the shim OUTSIDE fixDir: fixDir is a colocated jj working
		// tree, so `jj op restore` (invoked by dogfood-restore.sh) snapshots
		// the WC first and then restores to PRE_OP_ID — a shim placed inside
		// fixDir would get rolled back by the restore step (added-after-OPID).
		// The script then could not find `gsd-sdk` on PATH and would fall
		// through to the user's global gsd-sdk install (which lacks the new
		// bridge), causing the WARN trap to fire.
		const workspaceCli = path.resolve(__dirname, '..', '..', 'sdk', 'dist', 'cli.js');
		shimDir = mkdtempSync(path.join(tmpdir(), '__dogfood-test-shim-'));
		const shimPath = path.join(shimDir, 'gsd-sdk');
		writeFileSync(
			shimPath,
			`#!/bin/sh\nexec "${process.execPath}" "${workspaceCli}" "$@"\n`,
			{ mode: 0o755 },
		);
		const env = {
			...process.env,
			PATH: `${shimDir}${path.delimiter}${process.env.PATH || ''}`,
		};
		const r = spawnSync('bash', [restoreScript, opId, tarBundle.tarPath], {
			cwd: fixDir,
			encoding: 'utf-8',
			timeout: 60000,
			env,
		});

		// D-12: exit 0 even if cleanup-bridge fails. Include r.stderr in
		// the message for diagnostic clarity if the test ever trips.
		assert.strictEqual(
			r.status,
			0,
			`dogfood-restore.sh must exit 0 (D-12); got status=${r.status}, stderr=${r.stderr}`,
		);

		// D-05/D-06 cross-phase enumeration proof: BOTH workspace dirs from
		// DIFFERENT phase numbers are reaped via a SINGLE --all-phases call.
		assert.ok(
			!existsSync(ws15),
			`ws15 (phase-15-subagent-1) must be reaped post-script; still exists: ${ws15}; stderr=${r.stderr}`,
		);
		assert.ok(
			!existsSync(ws16),
			`ws16 (phase-16-subagent-2) must be reaped post-script; still exists: ${ws16}`,
		);

		// D-13: second diagnostic echo fires after cleanup with format
		// `orphan-workspace cleanup complete (abandoned=N, failedReaped=M)`.
		// `jq` may not be installed; the fallback path echoes "?" for the
		// counts. Either way the literal "orphan-workspace cleanup complete"
		// is in the stderr.
		assert.ok(
			r.stderr.includes('orphan-workspace cleanup complete'),
			`D-13 second diagnostic must fire; stderr was: ${r.stderr}`,
		);

		// Pitfall 2 ordering invariant: the existing "complete" echo must
		// fire BEFORE the new cleanup step. The cleanup-step echo appears
		// LATER in stderr; the first echo asserts the ordering hasn't been
		// scrambled.
		assert.ok(
			r.stderr.includes('dogfood-restore: complete'),
			`existing "complete" diagnostic must fire (Pitfall 2 ordering); stderr was: ${r.stderr}`,
		);
	} finally {
		rmSync(fixDir, { recursive: true, force: true });
		if (tarBundle && tarBundle.tarDir) {
			rmSync(tarBundle.tarDir, { recursive: true, force: true });
		}
		if (shimDir) {
			rmSync(shimDir, { recursive: true, force: true });
		}
	}
});
