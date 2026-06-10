'use strict';

/**
 * Fixture-based unit tests for scripts/lint-vcs-parallel-call-presence.cjs
 * (Phase 16 plan 16.01, LINT-06).
 *
 * Covers the 5 D-14 scenarios: paired pass / dispatch-only fail / fan-in-only
 * fail / prose-only pass (Pitfall 7 false-positive guard) / allowlist suppress.
 *
 * Tests 1-4 spawn the lint with `--scan-root <fixture-tree>` (fixtures are
 * checked into git under tests/scripts/fixtures/lint-vcs-parallel-call-presence/,
 * one subdir per scenario per D-14). This mirrors the simpler audit-workflow
 * test pattern that points scan-root at a fixture subdir, rather than the
 * mkdtemp-per-test isolation pattern of tests/lint-vcs-no-raw-git-fixture.test.cjs
 * (which is appropriate for ephemeral content; the D-14 fixtures are durable
 * regression specimens by design).
 *
 * Test 5 (allowlist) invokes parseAllowlist directly with two synthetic JSON
 * objects — one to prove path-suppression works, one to prove the parser
 * rejects entries with an `expires` field (per feedback_solo_dev_no_expires
 * + CF-04).
 *
 * Convention: node:test + node:assert/strict (matches sibling tests under
 * tests/scripts/ — see audit-workflow-raw-git.test.cjs).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'lint-vcs-parallel-call-presence.cjs');
const FIXTURE_ROOT = path.join(__dirname, 'fixtures', 'lint-vcs-parallel-call-presence');

function runLint(fixtureSubdir) {
	return spawnSync(
		process.execPath,
		[SCRIPT, '--scan-root', path.join(FIXTURE_ROOT, fixtureSubdir)],
		{ encoding: 'utf-8', timeout: 15000 },
	);
}

test('LINT-06 D-14 #1: paired dispatch + fan-in literals in separate fences -> exit 0', () => {
	const r = runLint('paired');
	assert.equal(
		r.status, 0,
		'expected exit 0 but got ' + r.status +
		'\nstdout: ' + r.stdout +
		'\nstderr: ' + r.stderr,
	);
	assert.ok(
		r.stdout.startsWith('ok lint-vcs-parallel-call-presence:'),
		'expected stdout to start with "ok lint-vcs-parallel-call-presence:" but got: ' + r.stdout,
	);
});

test('LINT-06 D-14 #2: dispatch-only fence -> exit 1; diagnostic names fan-in as missing', () => {
	const r = runLint('dispatch-only');
	assert.equal(
		r.status, 1,
		'expected exit 1 but got ' + r.status +
		'\nstdout: ' + r.stdout +
		'\nstderr: ' + r.stderr,
	);
	assert.match(
		r.stderr, /dispatch-only\.md:1/,
		'expected stderr to anchor diagnostic at dispatch-only.md:1 but got: ' + r.stderr,
	);
	assert.match(
		r.stderr, /fan-in/,
		'expected stderr to name "fan-in" as missing but got: ' + r.stderr,
	);
});

test('LINT-06 D-14 #3: fan-in-only fence -> exit 1; diagnostic names dispatch as missing', () => {
	const r = runLint('fanin-only');
	assert.equal(
		r.status, 1,
		'expected exit 1 but got ' + r.status +
		'\nstdout: ' + r.stdout +
		'\nstderr: ' + r.stderr,
	);
	assert.match(
		r.stderr, /fanin-only\.md:1/,
		'expected stderr to anchor diagnostic at fanin-only.md:1 but got: ' + r.stderr,
	);
	assert.match(
		r.stderr, /dispatch/,
		'expected stderr to name "dispatch" as missing but got: ' + r.stderr,
	);
});

test('LINT-06 D-14 #4: prose-only mentions of parallel/wave -> exit 0 (Pitfall 7 false-positive guard)', () => {
	const r = runLint('prose-only');
	assert.equal(
		r.status, 0,
		'expected exit 0 (prose mentions are not invocations) but got ' + r.status +
		'\nstdout: ' + r.stdout +
		'\nstderr: ' + r.stderr,
	);
	assert.ok(
		r.stdout.startsWith('ok lint-vcs-parallel-call-presence:'),
		'expected stdout to start with "ok lint-vcs-parallel-call-presence:" but got: ' + r.stdout,
	);
});

test('LINT-06 D-14 #5: allowlist entry suppresses opted-out file; parser rejects expires field', () => {
	const { parseAllowlist } = require(path.join(REPO_ROOT, 'scripts', 'lib', 'allowlist-parser.cjs'));

	// First assertion: path-entry shape {path, reason, owner} is parsed and the
	// `files` Set contains the entry — proves the path-suppression mechanism.
	const result = parseAllowlist(
		{
			$schema_version: 2,
			entries: [
				{
					path: 'gsd-core/workflows/opted-out.md',
					reason: 'test fixture',
					owner: '@LoganDark',
				},
			],
		},
		'lint-vcs-parallel-call-presence',
	);
	assert.ok(result.files instanceof Set, 'expected result.files to be a Set');
	assert.ok(
		result.files.has('gsd-core/workflows/opted-out.md'),
		'expected result.files to contain the opted-out path but got: ' + JSON.stringify([...result.files]),
	);

	// Second assertion: entries with `expires` field MUST throw per
	// `feedback_solo_dev_no_expires` + CF-04. Phase 16 plan 16.01 tightens the
	// parser (scripts/lib/allowlist-parser.cjs) to actively reject the field
	// rather than silently ignoring it (the prior Phase 8 D-04 stance, which
	// was inconsistent with the user-memory directive that FORBIDS the field).
	assert.throws(
		() => parseAllowlist(
			{
				$schema_version: 2,
				entries: [{
					path: 'x',
					expires: '2026-01-01',
					reason: 'y',
					owner: '@z',
				}],
			},
			'test',
		),
		/forbidden "expires" field/,
		'expected parseAllowlist to throw when given an entry with expires field (feedback_solo_dev_no_expires + CF-04)',
	);

	// Defense in depth: also assert the production allowlist file itself does
	// NOT contain the literal "expires" (the static guarantee that complements
	// the runtime parser check).
	const allowJson = require(path.join(REPO_ROOT, 'scripts', 'lint-vcs-parallel-call-presence.allow.json'));
	const stringified = JSON.stringify(allowJson);
	assert.ok(
		!stringified.includes('"expires"'),
		'expected production allowlist to not contain the literal "expires" but found it (CF-04 / feedback_solo_dev_no_expires violation): ' + stringified,
	);
	assert.deepEqual(
		allowJson.entries, [],
		'expected production allowlist entries to be [] (D-08) but got: ' + JSON.stringify(allowJson.entries),
	);
});
