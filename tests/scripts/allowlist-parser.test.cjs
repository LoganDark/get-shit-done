'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAllowlist, REQUIRED_FIELDS, FORBIDDEN_FIELDS } = require('../../scripts/lib/allowlist-parser.cjs');

test('parseAllowlist: missing reason throws', () => {
	assert.throws(
		() => parseAllowlist({ entries: [{ path: 'foo', owner: '@x' }] }, 'test'),
		/missing required "reason"/,
	);
});

test('parseAllowlist: missing owner throws', () => {
	assert.throws(
		() => parseAllowlist({ entries: [{ path: 'foo', reason: 'r' }] }, 'test'),
		/missing required "owner"/,
	);
});

test('parseAllowlist: both path and glob throws', () => {
	assert.throws(
		() => parseAllowlist(
			{ entries: [{ path: 'foo', glob: 'bar', reason: 'r', owner: '@x' }] },
			'test',
		),
		/both "path" and "glob"/,
	);
});

test('parseAllowlist: neither path nor glob throws', () => {
	assert.throws(
		() => parseAllowlist({ entries: [{ reason: 'r', owner: '@x' }] }, 'test'),
		/missing "path" or "glob"/,
	);
});

test('parseAllowlist: expires NOT required (D-04 — solo-dev context)', () => {
	// A valid entry WITHOUT expires must parse without throwing
	// (per D-04 explicit drop of expires).
	const result = parseAllowlist(
		{ entries: [{ path: 'foo.ts', reason: 'r', owner: '@x' }] },
		'test',
	);
	assert.equal(result.files.has('foo.ts'), true);
});

test('parseAllowlist: glob entry compiles to RegExp', () => {
	const result = parseAllowlist(
		{ entries: [{ glob: 'sdk/**', reason: 'r', owner: '@x' }] },
		'test',
	);
	assert.equal(result.globRegexes.length, 1);
	assert.equal(result.globRegexes[0].test('sdk/foo/bar.ts'), true);
});

test('parseAllowlist: missing top-level entries array throws', () => {
	assert.throws(() => parseAllowlist({}, 'test'), /missing top-level "entries" array/);
});

test('parseAllowlist: empty whitespace-only reason throws', () => {
	assert.throws(
		() => parseAllowlist(
			{ entries: [{ path: 'foo', reason: '   ', owner: '@x' }] },
			'test',
		),
		/missing required "reason"/,
	);
});

test('REQUIRED_FIELDS exports as exactly [reason, owner] (D-04)', () => {
	assert.deepEqual(REQUIRED_FIELDS, ['reason', 'owner']);
	assert.equal(REQUIRED_FIELDS.includes('expires'), false);
});

test('parseAllowlist: expires field FORBIDDEN — entry containing expires throws (Phase 16 plan 16.01 / feedback_solo_dev_no_expires)', () => {
	assert.throws(
		() => parseAllowlist(
			{
				entries: [{
					path: 'foo.ts',
					reason: 'r',
					owner: '@x',
					expires: '2026-01-01',
				}],
			},
			'test',
		),
		/forbidden "expires" field/,
	);
});

test('FORBIDDEN_FIELDS exports as exactly [expires] (Phase 16 plan 16.01)', () => {
	assert.deepEqual(FORBIDDEN_FIELDS, ['expires']);
});
