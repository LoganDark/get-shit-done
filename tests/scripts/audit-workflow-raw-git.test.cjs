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
 * tree it owns, materializes synthetic .md files, and cleans up in a finally
 * block. No shared fixture state, no retry, no describe.skip.
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

// RED-phase placeholder assertion: confirms the audit module exists and exposes
// auditWorkflowRawGit before the implementation lands. Replaced in Task 2 by the
// 7 enumerated regression-guard cases.
test('audit module exports the pure scan entry point (RED)', () => {
	assert.equal(typeof auditWorkflowRawGit, 'function');
	assert.equal(typeof scanFile, 'function');
	assert.equal(typeof emitJson, 'function');
	assert.equal(typeof emitMarkdown, 'function');

	const root = mkdtempSync(path.join(tmpdir(), 'audit-test-'));
	try {
		mkdirSync(path.join(root, 'get-shit-done', 'workflows'), { recursive: true });
		writeFileSync(
			path.join(root, 'get-shit-done', 'workflows', 'x.md'),
			'# doc\n\n```bash\ngit status\n```\n',
		);
		const result = auditWorkflowRawGit({
			scanRoots: ['get-shit-done/workflows'],
			repoRoot: root,
			baseline: {},
		});
		assert.equal(result.ok, false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
