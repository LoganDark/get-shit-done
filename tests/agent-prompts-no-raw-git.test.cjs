'use strict';
// allow-test-rule: reads markdown product files (agents/*.md) to enforce the
// project-wide no-raw-git rule at the AGENT PROMPT layer — not a source-grep
// on SDK or executable code.

/**
 * Phase 11 Plan 11-11 (PROMPT-08 BLOCKER closure): class-wide regression net
 * pinning the project rule `project_no_raw_git` at file level for agent
 * prompt markdown files.
 *
 * Rationale (CLAUDE.md + MEMORY: project_no_raw_git):
 *   "No raw git anywhere in jj-port. VCS adapter must cover read AND write;
 *    lint guard is whole-repo default-deny on `git`, not just mutating
 *    verbs; even `git status` perturbs colocated jj state."
 *
 * Plan 11-07 CR-04 closure added a FATAL recovery diagnostic dump to
 * `agents/gsd-executor.md` that probed the repo root via
 * `git rev-parse --show-toplevel || jj workspace root || echo "<unresolvable>"`.
 * On the project's own colocated git+jj checkout (`vcs.adapter: jj`), the git
 * branch ALWAYS fires first and may report a misleading toplevel when the
 * agent is in a non-default jj workspace whose fs path sits outside the git
 * toplevel — the jj fallback is dead code on every colocated invocation.
 *
 * Plan 11-11 Task 1 added `primaryWorkspacePath` to the
 * `workspace.assert-dispatched-cwd` envelope; Task 2 rewired
 * `agents/gsd-executor.md:431` to read it from the existing $DISPATCH_CHECK
 * payload via jq. This test (Task 3) pins the negative state class-wide so
 * future re-introductions of any READ-ONLY raw-git invocation in agent prompt
 * files fail at commit time.
 *
 * Pattern choice (revision-1 BLOCKER 1 closure; load-bearing):
 *   GIT_INVOCATION_RE is intentionally NARROWED to READ-ONLY verbs only —
 *   (rev-parse|status|log|ls-files|cat-file|show|describe|rev-list).
 *
 *   The `<destructive_git_prohibition>` block in agents/gsd-executor.md
 *   (lines ~497-529, preserved as-is per Phase 11 D-04) lists MUTATING verbs
 *   (clean, rm, checkout, reset, update-ref, push) by design — it forbids
 *   those operations. A broader pattern that included mutating verbs would
 *   false-fire on 11+ narrative mentions inside that block.
 *
 *   Read-only verbs have NO narrative analog in the prohibition prose, so
 *   this narrow pattern catches the actual defect class (line 431 was
 *   `git rev-parse`, a READ verb) without exempting legitimate documentation.
 *   Empirically verified: pre-Task-2 this pattern matches exactly line 431;
 *   post-Task-2 it matches nothing.
 *
 *   If a future agent-prompt regression introduces a MUTATING raw-git
 *   invocation, the existing project-wide lint catches it; this file-scoped
 *   test focuses on the read-side where defenses are thinnest.
 *
 * Extending to additional agent files: push the file's repo-relative path
 * into AGENT_FILES below. Test (4) iterates the array, so each addition is a
 * one-line change.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

// Add additional agent prompt markdown files here as they gain raw-git
// surface (e.g. 'agents/gsd-verifier.md', 'agents/gsd-checker.md'). Each
// entry is grep'd against GIT_INVOCATION_RE by test (4).
const AGENT_FILES = [
	'agents/gsd-executor.md',
];

// READ-ONLY verb subset only. See file-level docstring for the load-bearing
// rationale: MUTATING-verb mentions inside <destructive_git_prohibition>
// (lines ~497-529 of gsd-executor.md) are intentional documentation per
// Phase 11 D-04; widening the pattern to include them would false-fire on
// preserved prose. Read-only verbs have no narrative analog and are
// precisely the defect class Plan 11-11 closes.
const GIT_INVOCATION_RE = /\bgit\s+(rev-parse|status|log|ls-files|cat-file|show|describe|rev-list)\b/;

function readAgentFile(rel) {
	return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

test.describe('Plan 11-11 / project_no_raw_git: agent prompts contain no read-only raw-git invocations', () => {
	test.test('agents/gsd-executor.md contains no read-only raw git invocations', () => {
		const content = readAgentFile('agents/gsd-executor.md');
		const match = content.match(GIT_INVOCATION_RE);
		assert.ok(
			!match,
			`project_no_raw_git violation in agents/gsd-executor.md: found raw "${match?.[0]}" invocation. ` +
			'Per CLAUDE.md / MEMORY entry project_no_raw_git, all VCS reads in agent prompts must go through ' +
			'gsd-sdk query verbs (the SDK adapter covers read AND write). Plan 11-11 retired the previous ' +
			'`git rev-parse --show-toplevel` probe at line 431 by reading primaryWorkspacePath from the ' +
			'workspace.assert-dispatched-cwd envelope; do not re-introduce raw-git read-side probes.',
		);
	});

	test.test('agents/gsd-executor.md still uses the SDK verb for repo-root resolution (positive pin)', () => {
		const content = readAgentFile('agents/gsd-executor.md');
		assert.match(
			content,
			/primaryWorkspacePath \/\/ "<unresolvable>"/,
			'Plan 11-11 fix must be present: REPO_ROOT in the FATAL recovery diagnostic dump must be sourced ' +
			'via `jq -r \'.primaryWorkspacePath // "<unresolvable>"\'` from $DISPATCH_CHECK. A future edit that ' +
			'removes BOTH the raw `git rev-parse` AND the jq read would pass test (1) but leave REPO_ROOT ' +
			'undefined — this positive pin co-evolves with the negative pin above.',
		);
	});

	test.test('destructive_git_prohibition block is preserved (Phase 11 D-04 invariant)', () => {
		const content = readAgentFile('agents/gsd-executor.md');
		assert.match(
			content,
			/<destructive_git_prohibition>/,
			'Phase 11 D-04: the <destructive_git_prohibition> block must remain in agents/gsd-executor.md ' +
			'verbatim — its narrative MUTATING-verb mentions (clean, rm, checkout, reset, update-ref, push) ' +
			'are intentional documentation, NOT project-rule violations. If a future edit deletes this block, ' +
			'the next planner who wants to widen GIT_INVOCATION_RE to include mutating verbs must confront ' +
			'the D-04 implications first — co-evolution of the block + the regex is explicitly forced.',
		);
		assert.match(
			content,
			/<\/destructive_git_prohibition>/,
			'Phase 11 D-04: the <destructive_git_prohibition> block must be properly closed.',
		);
	});

	test.test('all AGENT_FILES pass the read-only-git check (class-wide extension hook)', () => {
		for (const rel of AGENT_FILES) {
			const content = readAgentFile(rel);
			const match = content.match(GIT_INVOCATION_RE);
			assert.ok(
				!match,
				`project_no_raw_git violation in ${rel}: found raw "${match?.[0]}" invocation. ` +
				'See test (1) failure message for the full rationale and remediation guidance.',
			);
		}
	});
});
