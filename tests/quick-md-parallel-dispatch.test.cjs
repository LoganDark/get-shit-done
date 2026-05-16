'use strict';
// allow-test-rule: reads markdown product files (quick.md, execute-phase.md) to verify dispatch wiring — not source-grep

// Regression guards for Phase 11 verifier CR-02 + CR-03 (BLOCKERs closed by Plan 11-08).
//
// CR-02 (3 sub-defects in quick.md): the workspace.parallel.dispatch call site at
//   get-shit-done/workflows/quick.md:670-675 was structurally landed by Plan 11-06 but
//   silently broken in three independent ways: (a) plan JSON wrapped as {plans:[...]}
//   instead of a flat array, (b) --phase passed as literal "quick" (verb does Number()
//   and rejects NaN), (c) only [-z "$HANDLE_JSON"] FATAL — the {ok:false,reason} payload
//   is non-empty JSON so the guard never fires and downstream .workspaces[] iteration
//   produced zero entries.
//
// CR-03 (both quick.md and execute-phase.md): EXPECTED_BRANCH was passed straight to
//   --main-bookmark with no empty/HEAD pre-check; validateMainBookmark
//   (sdk/src/vcs/jj/parallel.ts:121-125) throws on empty strings, surfacing a Node stack
//   trace instead of a clean recovery message.
//
// This test pins every invariant Plan 11-08 corrects so future edits cannot silently
// re-open either blocker.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const QUICK = fs.readFileSync(path.join(repoRoot, 'get-shit-done/workflows/quick.md'), 'utf-8');
const EXEC = fs.readFileSync(path.join(repoRoot, 'get-shit-done/workflows/execute-phase.md'), 'utf-8');

test.describe('CR-02 quick.md dispatch shape', () => {
	test.test('plan JSON is a flat array (no {plans:[...]} wrapper)', () => {
		assert.doesNotMatch(QUICK, /\{plans:\[/, 'CR-02: quick.md still wraps plan as {plans:[...]} — dispatch will dispatch zero workspaces');
		assert.match(QUICK, /agentId:\$aid,planId:\$pid/, 'CR-02: quick.md plan-array must contain {agentId,planId} fields matching the SDK contract');
	});

	test.test('--phase is numeric (sentinel 0 for quick mode)', () => {
		assert.doesNotMatch(QUICK, /--phase "quick"/, 'CR-02: literal --phase "quick" triggers {ok:false, reason:"phase_number_required"}');
		assert.match(QUICK, /--phase 0[^0-9]/, 'CR-02: quick.md must pass a numeric --phase sentinel (0)');
	});

	test.test('HANDLE_OK FATAL guard catches {ok:false} payload', () => {
		assert.match(QUICK, /HANDLE_OK=\$\(echo "\$HANDLE_JSON" \| jq -r '\.ok \/\/ "true"'\)/, 'CR-02: quick.md must extract .ok with default "true"');
		assert.match(QUICK, /\[ "\$HANDLE_OK" = "false" \]/, 'CR-02: quick.md must FATAL when HANDLE_OK == false');
	});
});

test.describe('CR-02 execute-phase.md carry-over', () => {
	test.test('HANDLE_OK FATAL guard symmetric on execute-phase.md', () => {
		assert.match(EXEC, /HANDLE_OK=\$\(echo "\$HANDLE_JSON" \| jq -r '\.ok \/\/ "true"'\)/, 'CR-02 carry-over: execute-phase.md must extract .ok with default "true"');
		assert.match(EXEC, /\[ "\$HANDLE_OK" = "false" \]/, 'CR-02 carry-over: execute-phase.md must FATAL when HANDLE_OK == false');
	});
});

test.describe('CR-03 EXPECTED_BRANCH empty/HEAD pre-check', () => {
	test.test('quick.md refuses to dispatch on detached HEAD or empty branch', () => {
		assert.match(QUICK, /\[ -z "\$EXPECTED_BRANCH" \] \|\| \[ "\$EXPECTED_BRANCH" = "HEAD" \]/, 'CR-03: quick.md must pre-check EXPECTED_BRANCH for empty/HEAD before dispatch');
		assert.match(QUICK, /FATAL: orchestrator is on detached HEAD/, 'CR-03: quick.md must surface clean FATAL message (not let validateMainBookmark throw a stack trace)');
	});

	test.test('execute-phase.md refuses to dispatch on detached HEAD or empty branch', () => {
		assert.match(EXEC, /\[ -z "\$EXPECTED_BRANCH" \] \|\| \[ "\$EXPECTED_BRANCH" = "HEAD" \]/, 'CR-03: execute-phase.md must pre-check EXPECTED_BRANCH for empty/HEAD before dispatch');
		assert.match(EXEC, /FATAL: orchestrator is on detached HEAD/, 'CR-03: execute-phase.md must surface clean FATAL message');
	});

	test.test('both files use byte-identical FATAL message (symmetry guard)', () => {
		const re = /FATAL: orchestrator is on detached HEAD[^\n"]*/;
		const qm = QUICK.match(re)?.[0];
		const em = EXEC.match(re)?.[0];
		assert.ok(qm && em, 'CR-03: both files must contain the FATAL message line');
		assert.equal(qm, em, 'CR-03: FATAL message lines must be byte-identical across files (drift guard)');
	});
});
