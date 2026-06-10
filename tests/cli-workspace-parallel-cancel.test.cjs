/**
 * tests/cli-workspace-parallel-cancel.test.cjs — Phase 15.04 (PARALLEL-07)
 *
 * Repo-side CLI smoke for `gsd-tools query workspace.parallel.cancel`. node:test
 * domain (N4 decision per RESEARCH Wave 0 Gaps line 1400 — keeps the SDK
 * per-backend vitest domain and the repo-side CLI domain cleanly separated).
 *
 * 4 tests cover the three-site registration + verb-resolution gate per CF-07
 * + Pitfall 6 mitigation:
 *   1. Canonical dot form `workspace.parallel.cancel` without `--handle` →
 *      structured `{ok: false, reason: 'handle_required'}` envelope. Proves
 *      the canonical verb name resolves to the registered bridge (any
 *      "unknown verb" error would surface differently — see test 4 negative
 *      control).
 *   2. `--handle @-` with invalid JSON on stdin → structured
 *      `{ok: false, reason: 'handle_json_parse_failed'}` envelope. Proves
 *      the parse-failure error path is wired.
 *   3. Space-alias form `'workspace parallel.cancel'` without `--handle` →
 *      same `{ok: false, reason: 'handle_required'}` envelope (NOT an
 *      "unknown verb"-style error). Proves the alias-table site registered
 *      the space form.
 *   4. Bogus verb `workspace.parallel.cancellation-xyz` (negative control)
 *      → non-zero exit with an unknown-verb-style error marker on stdout or
 *      stderr. Proves the verb-resolution layer is the gate that tests 1+3
 *      pass through.
 *
 * NO `--help` flag is exercised — the gsd-sdk CLI bridge does not implement
 * `--help`; out of scope for this plan per N4 / RESEARCH update 2026-05-24.
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

test('CLI smoke: canonical dot form (no --handle) returns {ok: false, reason: handle_required}', () => {
	const r = runQuery(['workspace.parallel.cancel']);
	assert.strictEqual(r.status, 0, `non-zero exit: stdout=${r.stdout} stderr=${r.stderr}`);
	const parsed = JSON.parse(r.stdout);
	assert.strictEqual(parsed.ok, false, `expected ok:false, got: ${JSON.stringify(parsed)}`);
	assert.strictEqual(parsed.reason, 'handle_required', `expected reason:handle_required, got: ${JSON.stringify(parsed)}`);
});

test('CLI smoke: --handle @- with invalid JSON on stdin returns {ok: false, reason: handle_json_parse_failed}', () => {
	const r = runQuery(['workspace.parallel.cancel', '--handle', '@-'], { stdin: 'not-json{\n' });
	assert.strictEqual(r.status, 0, `non-zero exit: stdout=${r.stdout} stderr=${r.stderr}`);
	const parsed = JSON.parse(r.stdout);
	assert.strictEqual(parsed.ok, false, `expected ok:false, got: ${JSON.stringify(parsed)}`);
	assert.strictEqual(parsed.reason, 'handle_json_parse_failed', `expected reason:handle_json_parse_failed, got: ${JSON.stringify(parsed)}`);
});

test('CLI smoke: spaced form resolves identically (proves the dotted→spaced normalization site)', () => {
	// Phase 19 (19-11): the fork dispatcher registered a single-token
	// space-alias ('workspace parallel.cancel'). The gsd-tools bridge's
	// equivalent registration surface is the #3243 dotted→spaced
	// normalization — the multi-token spaced argv form must route to the
	// SAME registered handler (a registration miss would surface as the
	// unknown-verb error the negative control below pins).
	const r = runQuery(['workspace', 'parallel', 'cancel']);
	assert.strictEqual(r.status, 0, `non-zero exit: stdout=${r.stdout} stderr=${r.stderr}`);
	const parsed = JSON.parse(r.stdout);
	assert.strictEqual(parsed.ok, false, `expected ok:false, got: ${JSON.stringify(parsed)}`);
	assert.strictEqual(parsed.reason, 'handle_required', `expected reason:handle_required, got: ${JSON.stringify(parsed)}`);
});

test('CLI smoke: bogus verb returns unknown-verb error (negative control)', () => {
	const r = runQuery(['workspace.parallel.cancellation-xyz']);
	// Negative control: a deliberately-misspelled sibling verb MUST NOT
	// resolve to the registered bridge. Phase 19 (19-11): the gsd-tools
	// bridge surfaces this as a non-zero exit with the vcs router's
	// "Unknown workspace subcommand. Available: …" stderr line (the fork
	// dispatcher's "not in native registry" fallback warning retired with
	// the SDK). Either signature (non-zero exit OR an unknown/error marker
	// in the combined output) suffices to demonstrate the verb-resolution
	// gate fired.
	const combined = (r.stdout || '') + '\n' + (r.stderr || '');
	const unknownMarker = /not in native registry|Unknown (command|workspace subcommand|vcs verb)|unknown\s+verb|fallback failed/i;
	assert.ok(
		r.status !== 0 || unknownMarker.test(combined),
		`expected unknown-verb error (non-zero exit OR unknown marker), got status=${r.status}, output=${combined}`,
	);
	// Stronger assertion: at least one of the unknown markers must surface
	// somewhere so we are NOT silently passing on an unrelated error.
	assert.match(combined, unknownMarker, `expected one of {not in native registry, Unknown command/workspace subcommand/vcs verb, unknown verb, fallback failed} in combined output, got: ${combined}`);
});
