'use strict';

/**
 * tests/scripts/audit-root-commits-rename.test.cjs (Phase 15 Plan 01)
 *
 * node:test cases for `scripts/audit-root-commits-rename.cjs` shape invariants.
 * Runs as `node --test tests/scripts/audit-root-commits-rename.test.cjs`.
 *
 * These tests cover the audit envelope contract (D-09 schema), the carve-out
 * surfacing rules (D-11), and the idempotency-hash invariant (D-12). They do
 * NOT assert the live tree's exact hit count — that drift is expected per
 * PATTERNS.md N3 and CONTEXT.md `<deviations>` block.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const path = require('node:path');

const {
	PATTERN,
	EXTENSIONS,
	EXCLUDE_DIRS,
	EXCLUDE_FILES,
	CARVE_OUT_RECORDS,
	HISTORICAL_PROSE_FILES,
	groupByExtension,
	buildSpecialCases,
	computeIdempotencyHash,
	buildAuditEnvelope,
} = require('../../scripts/audit-root-commits-rename.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.resolve(REPO_ROOT, 'scripts/audit-root-commits-rename.cjs');

// Run the audit once and reuse the parsed envelope across tests. The script
// reads the live repo, so the totalCount and hashes vary between executions,
// but the structural assertions are stable.
function runAudit() {
	const stdout = execSync(`node ${SCRIPT_PATH}`, {
		cwd: REPO_ROOT,
		encoding: 'utf8',
	});
	return JSON.parse(stdout);
}

test('PATTERN is word-boundary anchored rootCommits', () => {
	assert.equal(PATTERN, '\\brootCommits\\b');
});

test('EXTENSIONS lists exactly 5 extensions per D-09', () => {
	assert.deepEqual([...EXTENSIONS].sort(), ['cjs', 'js', 'json', 'md', 'ts']);
});

test('EXCLUDE_DIRS covers D-13 carve-outs', () => {
	const required = [
		'node_modules', '.git', '.jj',
		'dist-cjs', '.archive-pre-v1.4', 'v1.2-research',
		'research', 'intel', 'milestones', 'seeds',
		'15-adapter-surface-extensions-rename',
	];
	for (const dir of required) {
		assert.ok(EXCLUDE_DIRS.includes(dir), `EXCLUDE_DIRS missing ${dir}`);
	}
});

test('EXCLUDE_FILES covers the audit self-references', () => {
	assert.ok(EXCLUDE_FILES.includes('audit-root-commits-rename.cjs'));
	assert.ok(EXCLUDE_FILES.includes('audit-root-commits-rename.test.cjs'));
});

test('CARVE_OUT_RECORDS surfaces the two ROADMAP-required paths', () => {
	const paths = CARVE_OUT_RECORDS.map((r) => r.path);
	assert.ok(paths.includes('.planning/research/.archive-pre-v1.4/'));
	assert.ok(paths.includes('.planning/milestones/v1.2-research/'));
});

test('HISTORICAL_PROSE_FILES covers the 5 plan-truths #15-19 files', () => {
	const required = [
		'./.planning/PROJECT.md',
		'./.planning/STATE.md',
		'./.planning/ROADMAP.md',
		'./.planning/REQUIREMENTS.md',
		'./.planning/phases/14.1-drop-mandatory-bookmark-on-parallel-dispatch-fan-in-emergenc/14.1-01-SUMMARY.md',
	];
	for (const f of required) {
		assert.ok(HISTORICAL_PROSE_FILES[f], `HISTORICAL_PROSE_FILES missing ${f}`);
		assert.ok(
			typeof HISTORICAL_PROSE_FILES[f] === 'string'
				&& HISTORICAL_PROSE_FILES[f].length > 0,
			`HISTORICAL_PROSE_FILES[${f}] must be a non-empty reason string`,
		);
	}
});

test('groupByExtension drops unknown extensions and sorts deterministically', () => {
	const hits = [
		{ file: './b.ts', line: 5, snippet: 'rootCommits' },
		{ file: './a.ts', line: 10, snippet: 'rootCommits' },
		{ file: './a.ts', line: 2, snippet: 'rootCommits' },
		{ file: './foo.xyz', line: 1, snippet: 'rootCommits' },
	];
	const buckets = groupByExtension(hits);
	assert.equal(buckets.ts.length, 3);
	assert.equal(buckets.xyz, undefined);
	// Sorted by (file, line)
	assert.equal(buckets.ts[0].file, './a.ts');
	assert.equal(buckets.ts[0].line, 2);
	assert.equal(buckets.ts[1].file, './a.ts');
	assert.equal(buckets.ts[1].line, 10);
	assert.equal(buckets.ts[2].file, './b.ts');
});

test('buildSpecialCases surfaces backends.ts:79 capability-matrix-string-literal', () => {
	const hits = [
		{
			file: './sdk/src/vcs/backends.ts',
			line: 79,
			snippet: "'refs.rootCommits': Object.freeze(...)",
		},
	];
	const cases = buildSpecialCases(hits);
	const matrix = cases.find((c) => c.kind === 'capability-matrix-string-literal');
	assert.ok(matrix, 'specialCases must include capability-matrix-string-literal');
	assert.equal(matrix.line, 79);
	assert.ok(matrix.file.endsWith('backends.ts'));
});

test('buildSpecialCases tags historical-prose carve-outs once per file', () => {
	const hits = [
		{ file: './.planning/PROJECT.md', line: 22, snippet: 'foo' },
		{ file: './.planning/PROJECT.md', line: 110, snippet: 'bar' },
		{ file: './.planning/REQUIREMENTS.md', line: 43, snippet: 'baz' },
	];
	const cases = buildSpecialCases(hits);
	const histCases = cases.filter((c) => c.kind === 'historical-prose-carve-out');
	assert.equal(histCases.length, 2, 'one entry per unique file');
	assert.ok(histCases.find((c) => c.file === './.planning/PROJECT.md'));
	assert.ok(histCases.find((c) => c.file === './.planning/REQUIREMENTS.md'));
});

test('computeIdempotencyHash is deterministic and order-insensitive', () => {
	const hits1 = [
		{ file: './a.ts', line: 1, snippet: 'x' },
		{ file: './b.ts', line: 2, snippet: 'y' },
	];
	const hits2 = [
		{ file: './b.ts', line: 2, snippet: 'y' },
		{ file: './a.ts', line: 1, snippet: 'x' },
	];
	const buckets1 = groupByExtension(hits1);
	const buckets2 = groupByExtension(hits2);
	const h1 = computeIdempotencyHash(hits1, buckets1);
	const h2 = computeIdempotencyHash(hits2, buckets2);
	assert.equal(h1, h2);
});

test('computeIdempotencyHash changes when a new hit is added', () => {
	const baseHits = [{ file: './a.ts', line: 1, snippet: 'x' }];
	const augmented = [
		{ file: './a.ts', line: 1, snippet: 'x' },
		{ file: './a.ts', line: 5, snippet: 'y' },
	];
	const h1 = computeIdempotencyHash(baseHits, groupByExtension(baseHits));
	const h2 = computeIdempotencyHash(augmented, groupByExtension(augmented));
	assert.notEqual(h1, h2);
});

test('computeIdempotencyHash is 32-char lowercase hex MD5', () => {
	const hits = [{ file: './a.ts', line: 1, snippet: 'x' }];
	const hash = computeIdempotencyHash(hits, groupByExtension(hits));
	assert.match(hash, /^[0-9a-f]{32}$/);
});

test('buildAuditEnvelope produces all 6 D-09 schema fields', () => {
	const hits = [
		{
			file: './sdk/src/vcs/backends.ts',
			line: 79,
			snippet: "'refs.rootCommits': ...",
		},
	];
	const envelope = buildAuditEnvelope(hits, '2026-05-24T00:00:00Z');
	for (const k of [
		'generatedAt', 'totalCount', 'byExtension',
		'specialCases', 'carveOuts', 'idempotencyHash',
	]) {
		assert.ok(k in envelope, `envelope missing ${k}`);
	}
	assert.equal(envelope.generatedAt, '2026-05-24T00:00:00Z');
	assert.equal(envelope.totalCount, 1);
});

test('script run: stdout is valid JSON with all D-09 fields populated', () => {
	const envelope = runAudit();
	for (const k of [
		'generatedAt', 'totalCount', 'byExtension',
		'specialCases', 'carveOuts', 'idempotencyHash',
	]) {
		assert.ok(k in envelope, `envelope missing ${k}`);
	}
	assert.ok(envelope.totalCount > 0, 'pre-rename totalCount must be > 0');
	assert.match(envelope.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
	assert.match(envelope.idempotencyHash, /^[0-9a-f]{32}$/);
});

test('script run: byExtension has all 5 extension keys', () => {
	const envelope = runAudit();
	for (const ext of ['ts', 'cjs', 'js', 'md', 'json']) {
		assert.ok(ext in envelope.byExtension, `byExtension missing ${ext}`);
		assert.ok(Array.isArray(envelope.byExtension[ext]));
	}
});

test('script run: specialCases capability-matrix entry reflects live state', () => {
	// This test is INTENTIONALLY tolerant of pre- vs post-rename state. The
	// audit script is a one-shot pre-rename gate, but we want the test suite
	// to stay green AFTER the rename lands too (the audit script is still
	// useful for re-verification of the post-rename namespace cleanliness).
	//
	// Pre-rename: capability matrix hit at backends.ts:79 MUST surface as a
	// specialCase entry (D-11 enforcement).
	// Post-rename: backends.ts no longer has a `rootCommits` hit at line 79,
	// so the specialCase entry SHOULD NOT appear (no false-positive).
	//
	// The pure-function test 'buildSpecialCases surfaces backends.ts:79
	// capability-matrix-string-literal' covers the synthetic-input contract;
	// this test asserts the live-state contract is consistent.
	const envelope = runAudit();
	const matrix = envelope.specialCases.find(
		(c) => c.kind === 'capability-matrix-string-literal',
	);
	const liveHasMatrixHit = envelope.byExtension.ts.some(
		(h) => h.file.endsWith('sdk/src/vcs/backends.ts') && h.line === 79,
	);
	if (liveHasMatrixHit) {
		assert.ok(matrix, 'specialCases must include capability-matrix-string-literal entry when backends.ts:79 still has a hit');
		assert.equal(matrix.line, 79);
		assert.ok(matrix.file.endsWith('backends.ts'));
	} else {
		assert.equal(matrix, undefined, 'specialCases must NOT include capability-matrix-string-literal entry when backends.ts:79 has no hit (post-rename)');
	}
});

test('script run: carveOuts include both ROADMAP carve-out paths', () => {
	const envelope = runAudit();
	const paths = envelope.carveOuts.map((c) => c.path);
	assert.ok(paths.includes('.planning/research/.archive-pre-v1.4/'));
	assert.ok(paths.includes('.planning/milestones/v1.2-research/'));
});

test('script run: JSON round-trips losslessly', () => {
	const envelope = runAudit();
	const round = JSON.parse(JSON.stringify(envelope));
	assert.deepEqual(round, envelope);
});

test('script run: per-extension counts sum to totalCount', () => {
	const envelope = runAudit();
	const sum = Object.values(envelope.byExtension).reduce(
		(acc, arr) => acc + arr.length,
		0,
	);
	assert.equal(sum, envelope.totalCount);
});
