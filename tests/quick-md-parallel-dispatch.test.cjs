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
// CR-03 (Phase 14.1 PARALLEL-08 polarity flip): the `current-branch` FATAL preflight
//   was removed from BOTH quick.md and execute-phase.md per Phase 14.1 D-01
//   (symmetric workflow scope). Bookmark-less jj `@` and detached-HEAD git working
//   copies are now first-class dispatch states — the dispatch verb no longer requires
//   a non-empty bookmark name. validateMainBookmark fires only when callers explicitly
//   pass a `mainBookmarks` entry. The Phase 11-08 polarity was "preflight PRESENT in
//   both files"; the Phase 14.1 polarity is "preflight ABSENT in both files". The
//   tests below now guard against accidental REINTRODUCTION of the preflight (regression
//   net) rather than its removal. The byte-identical FATAL-message symmetry guard is
//   DROPPED entirely — no message string survives to compare.
//
// This test pins every invariant Plan 11-08 corrects so future edits cannot silently
// re-open either blocker.
//
// Run-2 (Plan 11-10): the run-1 closure (Plan 11-08) hardened the GUARDS in
//   execute-phase.md but left the dispatch line itself referencing an undefined
//   $WAVE_WORKTREE_PLANS_JSON shell variable AND passing the literal template
//   placeholder "{phase_number}" to --phase (which bash does NOT expand inside a
//   fenced bash block). Both BLOCKERs fired simultaneously on every wave dispatch.
//   Plan 11-10 lands the two one-line fixes (jq pipeline construction +
//   ${PHASE_NUMBER} bash variable) AND extends the EXEC carry-over describe-block
//   below with three new assertions so neither BLOCKER can silently regress:
//     (1) plan-shape carry-over — pins WAVE_WORKTREE_PLANS_JSON construction +
//         {agentId,planId} field names matching the SDK verb contract.
//     (2) numeric --phase carry-over — pins bash-variable form ${PHASE_NUMBER}
//         and forbids the literal {phase_number} placeholder in execute-phase.md.
//     (3) accumulator-source pin — pins that WAVE_WORKTREE_PLANS_JSON is built
//         from $WAVE_WORKTREE_PLANS (the per-plan-worktree-gate.md:94 accumulator).
//   The regression net is now symmetric across QUICK and EXEC for all three
//   CR-02 sub-invariants (plan-shape, numeric --phase, HANDLE_OK guard).

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

	test.test('plan-shape: WAVE_WORKTREE_PLANS_JSON is constructed with {agentId,planId} fields (Plan 11-10 run-2 carry-over)', () => {
		assert.match(EXEC, /WAVE_WORKTREE_PLANS_JSON=\$\(/, 'CR-02 carry-over: execute-phase.md must CONSTRUCT WAVE_WORKTREE_PLANS_JSON, not just reference it (Plan 11-10 / PROMPT-06)');
		assert.match(EXEC, /jq -sc '\s*map\(\{agentId:.*planId:.*\}\)/, 'CR-02 carry-over: execute-phase.md plan array must contain {agentId,planId} fields matching workspace-parallel-dispatch.ts:73 contract');
		assert.doesNotMatch(EXEC, /\{plans:\[/, 'CR-02 carry-over: execute-phase.md must NOT wrap plan as {plans:[...]} (dispatch verb expects flat array)');
	});

	test.test('numeric --phase: bash variable ${PHASE_NUMBER}, never the literal {phase_number} placeholder (Plan 11-10 run-2 carry-over)', () => {
		assert.match(EXEC, /--phase "\$\{PHASE_NUMBER\}"/, 'CR-02 carry-over: execute-phase.md must pass --phase via bash variable ${PHASE_NUMBER} (numeric at runtime)');
		assert.doesNotMatch(EXEC, /--phase "\{phase_number\}"/, 'CR-02 carry-over: literal --phase "{phase_number}" is the workflow placeholder, NOT expanded in bash blocks (verb returns phase_number_required)');
	});

	test.test('accumulator-source: WAVE_WORKTREE_PLANS_JSON is built from the WAVE_WORKTREE_PLANS plan-id accumulator (Plan 11-10 run-2 carry-over)', () => {
		assert.match(EXEC, /WAVE_WORKTREE_PLANS_JSON=\$\(printf '%s\\n' \$WAVE_WORKTREE_PLANS \|/, 'CR-02 carry-over: WAVE_WORKTREE_PLANS_JSON must be built from the WAVE_WORKTREE_PLANS plan-id accumulator (per-plan-worktree-gate.md:94)');
	});
});

test.describe('CR-03 EXPECTED_BRANCH preflight ABSENT (PARALLEL-08 polarity flip)', () => {
	test.test('quick.md does NOT pre-check EXPECTED_BRANCH (preflight removed per PARALLEL-08)', () => {
		assert.doesNotMatch(QUICK, /\[ -z "\$EXPECTED_BRANCH" \] \|\| \[ "\$EXPECTED_BRANCH" = "HEAD" \]/, 'CR-03 (Phase 14.1): quick.md must NOT pre-check EXPECTED_BRANCH — bookmark-less / detached working copies are first-class per PARALLEL-08');
		assert.doesNotMatch(QUICK, /FATAL: orchestrator is on detached HEAD/, 'CR-03 (Phase 14.1): quick.md must NOT carry the FATAL message — the preflight has been removed');
	});

	test.test('execute-phase.md does NOT pre-check EXPECTED_BRANCH (preflight removed per PARALLEL-08)', () => {
		assert.doesNotMatch(EXEC, /\[ -z "\$EXPECTED_BRANCH" \] \|\| \[ "\$EXPECTED_BRANCH" = "HEAD" \]/, 'CR-03 (Phase 14.1): execute-phase.md must NOT pre-check EXPECTED_BRANCH — bookmark-less / detached working copies are first-class per PARALLEL-08');
		assert.doesNotMatch(EXEC, /FATAL: orchestrator is on detached HEAD/, 'CR-03 (Phase 14.1): execute-phase.md must NOT carry the FATAL message — the preflight has been removed');
	});
});
