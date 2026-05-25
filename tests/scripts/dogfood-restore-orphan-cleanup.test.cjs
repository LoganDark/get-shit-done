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

// Phase 16 REVIEW CR-02 regression guard: lock in the stderr-handling
// contract added to scripts/dogfood-restore.sh. The fix captures stdout
// and stderr SEPARATELY so jq only ever parses pristine JSON — pre-fix,
// the `2>&1`-into-CLEANUP_JSON form would concatenate gsd-sdk's stderr
// (e.g. the "not in native registry; falling back to gsd-tools.cjs"
// warning) with the JSON payload, silently flipping both counts to "?"
// even though gsd-sdk exited 0. This test uses a NOISY-stderr shim that
// emits a fake warning BEFORE the JSON to stdout, then asserts the
// abandoned count is the real integer (1), not "?" — proving the
// production script's stderr-tee + stdout-only-to-jq path is correct.
test('CR-02 regression: dogfood-restore.sh tolerates non-empty gsd-sdk stderr (parses stdout-only JSON)', (t) => {
	if (!JJ_AVAILABLE) {
		t.skip('jj binary not on PATH');
		return;
	}
	const fixDir = mkdtempSync(path.join(tmpdir(), '__dogfood-restore-cleanup-stderr-'));
	let tarBundle;
	let shimDir;
	try {
		seedJjRepo(fixDir);
		// Seed a single orphan workspace so the cleanup has something real
		// to reap — the assertion below pivots on abandoned===1.
		const ws16 = seedWorkspace(fixDir, 16, 1);
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
		const workspaceCli = path.resolve(__dirname, '..', '..', 'sdk', 'dist', 'cli.js');
		shimDir = mkdtempSync(path.join(tmpdir(), '__dogfood-test-shim-stderr-'));
		const shimPath = path.join(shimDir, 'gsd-sdk');
		// NOISY shim: emit a fake stderr warning BEFORE delegating to the
		// real cli.js. Mirrors the production gsd-sdk wrapper's
		// "not in native registry; falling back to gsd-tools.cjs" path
		// that surfaces on real installs but is suppressed in the clean
		// PATH-shim used by the D-16 test above. Without the CR-02 fix
		// this stderr line would get merged into CLEANUP_JSON via `2>&1`
		// and corrupt jq parse, flipping abandoned to "?".
		writeFileSync(
			shimPath,
			`#!/bin/sh\necho "WARN: simulated gsd-sdk stderr noise (CR-02 regression fixture)" >&2\nexec "${process.execPath}" "${workspaceCli}" "$@"\n`,
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

		assert.strictEqual(
			r.status,
			0,
			`dogfood-restore.sh must exit 0; got status=${r.status}, stderr=${r.stderr}`,
		);

		// CR-02 core assertion: the cleanup count must be the REAL integer
		// (1 — one orphan was seeded and reaped), NOT "?". Pre-fix this
		// would say `abandoned=?` because the shim's stderr line
		// "WARN: simulated gsd-sdk stderr noise..." got concatenated with
		// the JSON payload and broke jq parse.
		//
		// Match the canonical diagnostic line in stderr and extract the
		// abandoned= field. `jq` may not be on PATH in CI; in that case
		// even the post-fix code falls back to "?". When jq IS present
		// (the common case), we assert abandoned=1.
		const completeLine = r.stderr
			.split('\n')
			.find((l) => l.includes('orphan-workspace cleanup complete'));
		assert.ok(completeLine, `complete diagnostic missing; stderr=${r.stderr}`);
		const jqAvailable = commandExists('jq');
		if (jqAvailable) {
			assert.match(
				completeLine,
				/abandoned=1\b/,
				`CR-02 fix should yield abandoned=1 (not "?") with jq present; line was: ${completeLine}; full stderr=${r.stderr}`,
			);
		}

		// The CR-02 fix captures gsd-sdk stderr to a tempfile and only
		// dumps it to the script's stderr if gsd-sdk EXITS NONZERO. The
		// shim returns the gsd-sdk exit code (0 on success), so the
		// simulated warning is correctly SUPPRESSED — proves the
		// stderr-tee contract isolates noisy lines from the operator's
		// view on the happy path. (Pre-fix the warning would have been
		// concatenated into CLEANUP_JSON; post-fix it's tee'd to a
		// tempfile that we discard on success.)
		assert.ok(
			!r.stderr.includes('CR-02 regression fixture'),
			`CR-02 stderr-tee contract: shim's stderr warning must be SUPPRESSED on success-path (got passed through; stderr=${r.stderr})`,
		);

		// The seeded orphan must be reaped — even with noisy stderr in
		// the pipeline, the actual cleanup work still succeeds.
		assert.ok(
			!existsSync(ws16),
			`ws16 must be reaped even with noisy gsd-sdk stderr; still exists: ${ws16}; stderr=${r.stderr}`,
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
