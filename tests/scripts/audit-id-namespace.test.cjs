'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
	auditIdNamespace,
	AUDIT_VERDICT,
	PATTERNS,
	emitJson,
} = require('../../scripts/audit-id-namespace.cjs');

test('AUDIT_VERDICT enum: exactly 7 closed values', () => {
	assert.equal(Object.keys(AUDIT_VERDICT).length, 7);
	assert.deepEqual(
		new Set(Object.values(AUDIT_VERDICT)),
		new Set([
			'safe',
			'flip-clean',
			'needs-rename',
			'needs-resolveShort',
			'boundary-io',
			'historical-prose',
			'unclear',
		]),
	);
});

test('AUDIT_VERDICT is frozen', () => {
	assert.equal(Object.isFrozen(AUDIT_VERDICT), true);
});

test('PATTERNS array: 8 patterns', () => {
	assert.equal(PATTERNS.length, 8);
});

test('classifier emits row for literal commit_id', () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
	try {
		fs.mkdirSync(path.join(tmp, 'sdk/src'), { recursive: true });
		fs.writeFileSync(path.join(tmp, 'sdk/src/x.ts'), `const t = "commit_id";\n`);
		const result = auditIdNamespace({ scanRoots: ['sdk/src'], repoRoot: tmp });
		assert.ok(result.findings.length >= 1);
		assert.equal(result.findings[0].surface, 'literal_commit_id');
		assert.equal(result.findings[0].line, 1);
	} finally {
		fs.rmSync(tmp, { recursive: true });
	}
});

test('classifier skips node_modules / .git / .jj / dist / dist-cjs / .pnpm-store', () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
	try {
		for (const skip of ['node_modules', '.git', '.jj', 'dist', 'dist-cjs', '.pnpm-store']) {
			fs.mkdirSync(path.join(tmp, 'sdk/src', skip), { recursive: true });
			fs.writeFileSync(path.join(tmp, 'sdk/src', skip, 'x.ts'), `"commit_id"\n`);
		}
		const result = auditIdNamespace({ scanRoots: ['sdk/src'], repoRoot: tmp });
		assert.equal(result.findings.length, 0, 'No findings expected — all hits are in skipped dirs');
	} finally {
		fs.rmSync(tmp, { recursive: true });
	}
});

test('--json output: all 7 verdict buckets present even when empty', () => {
	const result = { ok: true, findings: [] };
	const json = JSON.parse(emitJson(result));
	assert.equal(json.$schema_version, 1);
	for (const v of [
		'safe',
		'flip-clean',
		'needs-rename',
		'needs-resolveShort',
		'boundary-io',
		'historical-prose',
		'unclear',
	]) {
		assert.ok(Array.isArray(json.verdicts[v]), `verdicts['${v}'] must be an array`);
		assert.equal(json.verdicts[v].length, 0);
	}
});

test('--json output: findings without verdict bucketed under unclear', () => {
	const result = {
		ok: false,
		findings: [{
			audit_row: 1,
			path: 'x.ts',
			line: 1,
			surface: 'literal_commit_id',
			callerUse: 'foo',
			verdict: null,
		}],
	};
	const json = JSON.parse(emitJson(result));
	assert.equal(json.verdicts.unclear.length, 1);
	assert.equal(json.verdicts.unclear[0].path, 'x.ts');
});

// WR-03: hex_regex pattern matches BOTH JS regex literal form (/[0-9a-f]{N}/)
// AND string form passed to new RegExp(...) or .test() ('[0-9a-f]{N}').
test('classifier emits row for hex_regex in JS regex-literal form', () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-hex-re-'));
	try {
		fs.mkdirSync(path.join(tmp, 'sdk/src'), { recursive: true });
		fs.writeFileSync(path.join(tmp, 'sdk/src/x.ts'), `const re = /^[0-9a-f]{40}$/;\n`);
		const result = auditIdNamespace({ scanRoots: ['sdk/src'], repoRoot: tmp });
		assert.ok(result.findings.some(f => f.surface === 'hex_regex'));
	} finally {
		fs.rmSync(tmp, { recursive: true });
	}
});

test('classifier emits row for hex_regex in single-quoted string form', () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-hex-str-'));
	try {
		fs.mkdirSync(path.join(tmp, 'sdk/src'), { recursive: true });
		fs.writeFileSync(path.join(tmp, 'sdk/src/x.ts'), `const re = new RegExp('^[0-9a-f]{12}$');\n`);
		const result = auditIdNamespace({ scanRoots: ['sdk/src'], repoRoot: tmp });
		assert.ok(
			result.findings.some(f => f.surface === 'hex_regex'),
			'string-form [0-9a-f]{N} must be matched by hex_regex pattern',
		);
	} finally {
		fs.rmSync(tmp, { recursive: true });
	}
});

test('classifier emits row for hex_regex in double-quoted string form', () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-hex-dstr-'));
	try {
		fs.mkdirSync(path.join(tmp, 'sdk/src'), { recursive: true });
		fs.writeFileSync(path.join(tmp, 'sdk/src/x.ts'), `const ok = "[0-9a-f]{8}".match(s);\n`);
		const result = auditIdNamespace({ scanRoots: ['sdk/src'], repoRoot: tmp });
		assert.ok(
			result.findings.some(f => f.surface === 'hex_regex'),
			'double-quoted [0-9a-f]{N} must be matched by hex_regex pattern',
		);
	} finally {
		fs.rmSync(tmp, { recursive: true });
	}
});
