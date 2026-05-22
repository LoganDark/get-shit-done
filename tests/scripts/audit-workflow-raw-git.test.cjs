'use strict';

/**
 * Unit test for scripts/audit-workflow-raw-git.cjs (Phase 13 plan 13-02, LINT-04).
 *
 * Structural mirror of tests/scripts/migr-06-close-gate.test.cjs (the D-07-cited
 * unit-test precedent): node:test + node:assert/strict, require() of the script
 * under test, exercising the exported pure functions.
 *
 * The audit is a BASELINE-REGRESSION GUARD. These tests prove the fence
 * detection, the shell-comment skip, and the per-file regression logic against
 * SYNTHETIC baselines so the comparison is verified independent of the embedded
 * 127-hit constant's value (threat T-13-06).
 *
 * Pattern B (TEST-16 / Pitfall 9): every test creates a random-prefix mkdtemp
 * tree it owns, materializes synthetic .md files, and cleans up with
 * rmSync(... { recursive: true, force: true }) in a finally block. No shared
 * fixture state, no flake budget, no suite-level disabling.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const {
	auditWorkflowRawGit,
	scanFile,
	emitJson,
	emitMarkdown,
} = require('../../scripts/audit-workflow-raw-git.cjs');

// Materialize a `.md` file under a scan-root path inside a throwaway tree and
// return the new tree root. The repo-relative form of the written file is the
// caller-supplied `relPath` (forward-slash separated) — the same key shape the
// audit's scanFile produces, so a synthetic baseline can key on it directly.
function writeMd(root, relPath, body) {
	const abs = path.join(root, ...relPath.split('/'));
	mkdirSync(path.dirname(abs), { recursive: true });
	writeFileSync(abs, body);
}

// (1) A NEW raw git invocation inside a bash fence, file baseline-absent →
// regression. ok is false; one regression entry with baseline 0 / current 1.
test('flags a NEW raw git invocation inside a bash fence', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'audit-test-'));
	try {
		const rel = 'get-shit-done/workflows/x.md';
		writeMd(root, rel, '# doc\n\n```bash\ngit status\n```\n');
		const result = auditWorkflowRawGit({
			scanRoots: ['get-shit-done/workflows'],
			repoRoot: root,
			baseline: {},
		});
		assert.equal(result.ok, false);
		assert.equal(result.regressions.length, 1);
		assert.deepEqual(result.regressions[0], { path: rel, baseline: 0, current: 1 });
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// (2) Current count equals the baseline → no regression. ok stays true.
test('no regression when the current count equals the baseline', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'audit-test-'));
	try {
		const rel = 'get-shit-done/workflows/two.md';
		writeMd(root, rel, '# doc\n\n```bash\ngit add .\ngit commit -m wip\n```\n');
		const result = auditWorkflowRawGit({
			scanRoots: ['get-shit-done/workflows'],
			repoRoot: root,
			baseline: { [rel]: 2 },
		});
		assert.equal(result.ok, true);
		assert.equal(result.regressions.length, 0);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// (3) Current count exceeds the baseline → regression { baseline: 2, current: 3 }.
test('flags a regression when the current count exceeds the baseline', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'audit-test-'));
	try {
		const rel = 'get-shit-done/workflows/three.md';
		writeMd(root, rel, '# doc\n\n```bash\ngit add .\ngit commit -m wip\ngit push\n```\n');
		const result = auditWorkflowRawGit({
			scanRoots: ['get-shit-done/workflows'],
			repoRoot: root,
			baseline: { [rel]: 2 },
		});
		assert.equal(result.ok, false);
		assert.equal(result.regressions.length, 1);
		assert.deepEqual(result.regressions[0], { path: rel, baseline: 2, current: 3 });
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// (4) git inside prose or a non-shell (`text`) fence → never counted.
test('does NOT flag git inside prose or a non-shell fence', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'audit-test-'));
	try {
		const rel = 'agents/y.md';
		writeMd(
			root,
			rel,
			'Run git status in your terminal.\n\n```text\ngit status\n```\n',
		);
		const result = auditWorkflowRawGit({
			scanRoots: ['agents'],
			repoRoot: root,
			baseline: {},
		});
		assert.equal(result.ok, true);
		assert.equal(result.regressions.length, 0);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// (5) A shell-comment line inside a bash fence → skipped, not counted.
test('skips a shell-comment line inside a bash fence', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'audit-test-'));
	try {
		const rel = 'get-shit-done/references/comment.md';
		writeMd(root, rel, '# doc\n\n```bash\n# git status\n```\n');
		const result = auditWorkflowRawGit({
			scanRoots: ['get-shit-done/references'],
			repoRoot: root,
			baseline: {},
		});
		assert.equal(result.ok, true);
		assert.equal(result.regressions.length, 0);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// (6) raw-git REMOVED (current count below baseline) → never a regression.
test('no regression when raw-git was removed (current below baseline)', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'audit-test-'));
	try {
		const rel = 'get-shit-done/workflows/shrank.md';
		writeMd(root, rel, '# doc\n\n```bash\ngit status\n```\n');
		const result = auditWorkflowRawGit({
			scanRoots: ['get-shit-done/workflows'],
			repoRoot: root,
			baseline: { [rel]: 5 },
		});
		assert.equal(result.ok, true);
		assert.equal(result.regressions.length, 0);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// (7) emitJson returns valid JSON carrying a boolean `ok` and an array
// `regressions`. Also exercises scanFile + emitMarkdown for coverage.
test('emitJson returns valid JSON with the expected top-level keys', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'audit-test-'));
	try {
		const rel = 'get-shit-done/workflows/json.md';
		writeMd(root, rel, '# doc\n\n```bash\ngit status\n```\n');
		const result = auditWorkflowRawGit({
			scanRoots: ['get-shit-done/workflows'],
			repoRoot: root,
			baseline: {},
		});

		const json = emitJson(result);
		assert.equal(typeof json, 'string');
		const parsed = JSON.parse(json);
		assert.equal(typeof parsed.ok, 'boolean');
		assert.ok(Array.isArray(parsed.regressions));

		// emitMarkdown returns a non-empty string for the same result.
		const md = emitMarkdown(result);
		assert.equal(typeof md, 'string');
		assert.ok(md.length > 0);

		// scanFile yields the per-file count + repo-relative forward-slash path.
		const scanned = scanFile(path.join(root, ...rel.split('/')), root);
		assert.equal(scanned.path, rel);
		assert.equal(scanned.count, 1);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
