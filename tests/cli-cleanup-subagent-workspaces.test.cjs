/**
 * tests/cli-cleanup-subagent-workspaces.test.cjs — Phase 16.02 (CLEANUP-02)
 *
 * Repo-side CLI smoke for `gsd-tools query cleanup-subagent-workspaces`. Mirrors
 * `tests/cli-workspace-parallel-cancel.test.cjs` shape — `node:test` domain
 * keeps the SDK per-backend vitest domain and the repo-side CLI domain
 * cleanly separated (N4 / RESEARCH Wave 0 Gaps line 1400).
 *
 * 4 tests cover the three-site registration + argv validation gates per
 * CF-02 + Pitfall 6 mitigation:
 *   1. No flags → structured `{ok: false, reason: 'phase_or_all_phases_required'}`.
 *      Proves the canonical verb name resolves to the registered bridge AND
 *      argv validation fires before any side effect.
 *   2. Both `--phase` + `--all-phases` → structured
 *      `{ok: false, reason: 'phase_and_all_phases_mutually_exclusive'}`.
 *      Proves the mutual-exclusion guard (D-04). Notably this fires BEFORE
 *      any filesystem read — no `.claude/jj-workspaces/` seeding required.
 *   3. Non-numeric `--phase abc` → structured
 *      `{ok: false, reason: 'invalid_phase_number'}` (T-16.02-02 / ASVS V5
 *      input-validation gate). Without this guard `Number('abc')` returns
 *      NaN and the helper would silently no-op.
 *   4. Bogus verb `cleanup-subagent-workspaces-XYZ` (negative control) →
 *      non-zero exit OR unknown-verb marker. Proves the verb-resolution
 *      layer is the gate that tests 1-3 pass through. If any of the three
 *      registration sites had been skipped, the LEGITIMATE verb would also
 *      hit this path and tests 1-3 would fail.
 *
 * NO `--help` flag is exercised — the gsd-sdk CLI bridge does not implement
 * `--help`; out of scope per N4 / cancel-test precedent.
 *
 * The bridge is NOT exercised against a real `.claude/jj-workspaces/` tree
 * here — smoke is verb-resolution + argv-validation only. End-to-end behavior
 * (the dogfood-restore.sh integration) is tested by
 * `tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` and the fanIn
 * direct-call wiring by `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts`.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

// Phase 19 (19-11): the fork gsd-sdk CLI retired (ADR-0174); the same verb
// surface dispatches through the PORT-02 bridge in gsd-tools.cjs.
const SDK_BIN = path.resolve(__dirname, '..', 'gsd-core', 'bin', 'gsd-tools.cjs');

function runQuery(argv, { stdin } = {}) {
	const opts = {
		encoding: 'utf-8',
		timeout: 15000,
	};
	if (stdin !== undefined) opts.input = stdin;
	return spawnSync('node', [SDK_BIN, 'query', ...argv], opts);
}

test('CLI smoke: bridge without --phase or --all-phases returns {ok:false, reason:phase_or_all_phases_required}', () => {
	const r = runQuery(['cleanup-subagent-workspaces']);
	assert.strictEqual(r.status, 0, `non-zero exit: stdout=${r.stdout} stderr=${r.stderr}`);
	const parsed = JSON.parse(r.stdout);
	assert.strictEqual(parsed.ok, false, `expected ok:false, got: ${JSON.stringify(parsed)}`);
	assert.strictEqual(
		parsed.reason,
		'phase_or_all_phases_required',
		`expected reason:phase_or_all_phases_required, got: ${JSON.stringify(parsed)}`,
	);
});

test('CLI smoke: --phase + --all-phases together returns {ok:false, reason:phase_and_all_phases_mutually_exclusive}', () => {
	const r = runQuery(['cleanup-subagent-workspaces', '--phase', '16', '--all-phases']);
	assert.strictEqual(r.status, 0, `non-zero exit: stdout=${r.stdout} stderr=${r.stderr}`);
	const parsed = JSON.parse(r.stdout);
	assert.strictEqual(parsed.ok, false, `expected ok:false, got: ${JSON.stringify(parsed)}`);
	assert.strictEqual(
		parsed.reason,
		'phase_and_all_phases_mutually_exclusive',
		`expected reason:phase_and_all_phases_mutually_exclusive, got: ${JSON.stringify(parsed)}`,
	);
});

test('CLI smoke: --phase non-numeric returns {ok:false, reason:invalid_phase_number}', () => {
	const r = runQuery(['cleanup-subagent-workspaces', '--phase', 'abc']);
	assert.strictEqual(r.status, 0, `non-zero exit: stdout=${r.stdout} stderr=${r.stderr}`);
	const parsed = JSON.parse(r.stdout);
	assert.strictEqual(parsed.ok, false, `expected ok:false, got: ${JSON.stringify(parsed)}`);
	assert.strictEqual(
		parsed.reason,
		'invalid_phase_number',
		`expected reason:invalid_phase_number, got: ${JSON.stringify(parsed)}`,
	);
});

test('CLI smoke: bogus verb cleanup-subagent-workspaces-XYZ returns unknown-verb error (negative control)', () => {
	const r = runQuery(['cleanup-subagent-workspaces-XYZ']);
	// Negative control: a deliberately-misspelled sibling verb MUST NOT
	// resolve to the registered bridge. The gsd-sdk dispatcher's "not in
	// native registry; falling back to gsd-tools.cjs" warning is the expected
	// stderr marker; the gsd-tools.cjs fallback then exits non-zero with
	// `Error: Unknown command` since it doesn't know the verb either. Either
	// signature suffices to demonstrate the verb-resolution gate fired.
	const combined = (r.stdout || '') + '\n' + (r.stderr || '');
	const unknownMarker = /not in native registry|Unknown command|unknown\s+verb|fallback failed/i;
	assert.ok(
		r.status !== 0 || unknownMarker.test(combined),
		`expected unknown-verb error (non-zero exit OR unknown marker), got status=${r.status}, output=${combined}`,
	);
	// Stronger assertion: at least one of the unknown markers must surface
	// somewhere so we are NOT silently passing on an unrelated error.
	assert.match(
		combined,
		unknownMarker,
		`expected one of {not in native registry, Unknown command, unknown verb, fallback failed} in combined output, got: ${combined}`,
	);
});
