'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
	parseAllowlist,
	REQUIRED_FIELDS,
	FORBIDDEN_FIELDS,
	CURRENT_SCHEMA_VERSION,
} = require('../../scripts/lib/allowlist-parser.cjs');

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

// Phase 16 REVIEW WR-02: $schema_version validation (forward-compat guard).
// Pre-fix the field was silently ignored.

test('parseAllowlist: $schema_version matching CURRENT_SCHEMA_VERSION parses (Phase 16 REVIEW WR-02)', () => {
	const result = parseAllowlist(
		{
			$schema_version: CURRENT_SCHEMA_VERSION,
			entries: [{ path: 'foo.ts', reason: 'r', owner: '@x' }],
		},
		'test',
	);
	assert.equal(result.files.has('foo.ts'), true);
});

test('parseAllowlist: $schema_version omitted parses (back-compat for legacy files)', () => {
	const result = parseAllowlist(
		{ entries: [{ path: 'foo.ts', reason: 'r', owner: '@x' }] },
		'test',
	);
	assert.equal(result.files.has('foo.ts'), true);
});

test('parseAllowlist: $schema_version newer than CURRENT throws (Phase 16 REVIEW WR-02)', () => {
	assert.throws(
		() => parseAllowlist(
			{
				$schema_version: 99,
				entries: [{ path: 'foo.ts', reason: 'r', owner: '@x' }],
			},
			'test',
		),
		/\$schema_version is 99, parser supports 2/,
	);
});

test('parseAllowlist: $schema_version older than CURRENT throws (Phase 16 REVIEW WR-02)', () => {
	assert.throws(
		() => parseAllowlist(
			{
				$schema_version: 1,
				entries: [{ path: 'foo.ts', reason: 'r', owner: '@x' }],
			},
			'test',
		),
		/\$schema_version is 1, parser supports 2/,
	);
});

test('CURRENT_SCHEMA_VERSION exports as 2 (Phase 16 REVIEW WR-02)', () => {
	assert.equal(CURRENT_SCHEMA_VERSION, 2);
});
