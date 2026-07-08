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
 * future re-introductions of any raw-git invocation in agent prompt files
 * fail at commit time.
 *
 * Pattern choice (WR-N02 / WR-N03 closure; load-bearing):
 *   GIT_INVOCATION_RE covers the FULL read-side surface PLUS mutating verbs
 *   (rev-parse|status|log|ls-files|cat-file|show|describe|rev-list|diff|
 *    branch|worktree|config|for-each-ref|symbolic-ref|merge-base|name-rev|
 *    tag|blame|remote|reflog|grep|ls-tree|fsck|fetch|clean|rm|checkout|
 *    reset|update-ref|push).
 *
 *   Defect class is verb-agnostic: every raw-git read against `.git/index`
 *   perturbs colocated jj state (atime updates, staleness-detection inputs).
 *   The earlier read-only-only narrowing left 16+ common read verbs (diff,
 *   branch, worktree, config, for-each-ref, etc.) silently uncovered, and
 *   coupled the regex's safety to the contents of the prohibition block via
 *   prose alone.
 *
 *   The `<destructive_git_prohibition>` block in agents/gsd-executor.md
 *   (lines ~501-529, preserved verbatim per Phase 11 D-04) intentionally
 *   enumerates MUTATING verbs (clean, rm, checkout, reset, update-ref,
 *   push) as forbidden operations — 11+ such mentions. The widened regex
 *   would false-fire on every one. The fix is a POSITIONAL CARVE-OUT:
 *   strip the prohibition block before grepping, so the regex covers the
 *   complete git surface OUTSIDE that block. This makes the regex/block
 *   coupling explicit (one is a region exclusion, the other is the body
 *   being scanned) rather than relying on read-only/mutating asymmetry.
 *
 *   A separate D-04 meta-assertion (test 5) pins the mutating-verb count
 *   inside the prohibition block at ≥11 so widening the regex AND deleting
 *   the prohibition block both force re-examination of this invariant.
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

// Full read-side + mutating verb surface. See file-level docstring for the
// load-bearing WR-N02 / WR-N03 rationale. The earlier read-only-only
// narrowing (rev-parse|status|log|ls-files|cat-file|show|describe|rev-list)
// silently exempted 16+ common read verbs (diff, branch, worktree, config,
// for-each-ref, symbolic-ref, merge-base, name-rev, tag, blame, remote,
// reflog, grep, ls-tree, fsck, fetch) AND coupled the regex's safety to
// prohibition-block contents via prose alone. The widened pattern + the
// positional carve-out (`stripProhibitionBlock` below) is the robust fix.
const GIT_INVOCATION_RE = /\bgit\s+(rev-parse|status|log|ls-files|cat-file|show|describe|rev-list|diff|branch|worktree|config|for-each-ref|symbolic-ref|merge-base|name-rev|tag|blame|remote|reflog|grep|ls-tree|fsck|fetch|clean|rm|checkout|reset|update-ref|push)\b/;

// Positional carve-out (WR-N03 closure): the <destructive_git_prohibition>
// block in agents/gsd-executor.md intentionally enumerates MUTATING verbs as
// narrative prose. Scope the search to OUTSIDE that block so the regex above
// covers the complete git surface without false-firing on preserved
// documentation. The block boundary is the literal XML-style tag pair; if
// the boundary tags ever move or rename, this carve-out fails closed
// (block-match miss → no replacement → full file scanned → mutating-verb
// mentions in the block surface as test failures, prompting the planner to
// confront the D-04 invariant).
const PROHIBITION_RE = /<destructive_git_prohibition>[\s\S]*?<\/destructive_git_prohibition>/;
// 19-12 next-merge carve-out: upstream's #1297 <worktree_metadata_capture>
// block self-gates on `[ -f .git ]` (git-worktree detection) — it never runs
// on jj workspaces (no .git file), so its git rev-parse trio is legacy-git
// substrate, not a cross-backend read. Same positional carve-out treatment
// as the prohibition block.
const METADATA_CAPTURE_RE = /<worktree_metadata_capture>[\s\S]*?<\/worktree_metadata_capture>/;

function readAgentFile(rel) {
	return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function stripProhibitionBlock(content) {
	// 19-12 next-merge carve-out: upstream now stamps the runtime-launcher
	// preamble into agent files (sync-runtime-launcher.cjs). Its git-first
	// RUNTIME_ROOT leg (`git rev-parse --show-toplevel || jj workspace root ||
	// pwd`) is the audited launcher-embed baseline class, not an agent-authored
	// VCS read — strip the one-liner before scanning.
	return content
		.replace(PROHIBITION_RE, '')
		.replace(METADATA_CAPTURE_RE, '')
		.replace(/^_GSD_SHIM_NAME=.*$/gm, '');
}

test.describe('Plan 11-11 / project_no_raw_git: agent prompts contain no raw-git invocations (full surface, prohibition-block-carved-out)', () => {
	test.test('agents/gsd-executor.md contains no raw git invocations outside <destructive_git_prohibition>', () => {
		const content = readAgentFile('agents/gsd-executor.md');
		const scoped = stripProhibitionBlock(content);
		const match = scoped.match(GIT_INVOCATION_RE);
		assert.ok(
			!match,
			`project_no_raw_git violation in agents/gsd-executor.md: found raw "${match?.[0]}" invocation. ` +
			'Per CLAUDE.md / MEMORY entry project_no_raw_git, all VCS reads in agent prompts must go through ' +
			'gsd-sdk query verbs (the SDK adapter covers read AND write). Plan 11-11 retired the previous ' +
			'`git rev-parse --show-toplevel` probe at line 431 by reading primaryWorkspacePath from the ' +
			'workspace.assert-dispatched-cwd envelope; do not re-introduce raw-git read-side probes. ' +
			'The <destructive_git_prohibition> block is carved out by stripProhibitionBlock(); narrative ' +
			'MUTATING-verb mentions inside that block are intentional documentation (Phase 11 D-04).',
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
			'are intentional documentation, NOT project-rule violations. The carve-out in test (1) depends ' +
			'on this block existing; deleting it would change the scoped-content semantics.',
		);
		assert.match(
			content,
			/<\/destructive_git_prohibition>/,
			'Phase 11 D-04: the <destructive_git_prohibition> block must be properly closed.',
		);
	});

	test.test('all AGENT_FILES pass the no-raw-git check with prohibition-block carve-out (class-wide extension hook)', () => {
		for (const rel of AGENT_FILES) {
			const content = readAgentFile(rel);
			const scoped = stripProhibitionBlock(content);
			const match = scoped.match(GIT_INVOCATION_RE);
			assert.ok(
				!match,
				`project_no_raw_git violation in ${rel}: found raw "${match?.[0]}" invocation. ` +
				'See test (1) failure message for the full rationale and remediation guidance.',
			);
		}
	});

	test.test('WR-N03 D-04 co-evolution pin: prohibition block mutating-verb count matches docstring claim', () => {
		// The file-level docstring (and the legacy narrowed regex's safety
		// argument) claims the <destructive_git_prohibition> block contains
		// "11+" mutating-verb mentions (clean, rm, checkout, reset,
		// update-ref, push). This meta-assertion pins that count so the
		// regex/block co-evolution is enforced by an automated signal, not
		// reviewer attention alone:
		//
		//   - Widening GIT_INVOCATION_RE further (or narrowing it back) AND
		//     deleting prohibition-block mentions must both fail this test,
		//     forcing the planner to re-examine the invariant.
		//   - If the docstring claim of "11+" is updated, update the
		//     threshold below in lockstep.
		const content = readAgentFile('agents/gsd-executor.md');
		const block = content.match(PROHIBITION_RE)?.[0] ?? '';
		assert.ok(
			block.length > 0,
			'WR-N03: <destructive_git_prohibition> block not found — cannot enforce D-04 co-evolution invariant.',
		);
		const mutatingVerbs = /\bgit\s+(clean|rm|checkout|reset|update-ref|push)\b/g;
		const count = (block.match(mutatingVerbs) || []).length;
		assert.ok(
			count >= 11,
			`WR-N03 / Phase 11 D-04: <destructive_git_prohibition> block must contain ≥11 mutating-verb ` +
			`mentions (file-level docstring claims "11+"). Found ${count}. If the count drops below the ` +
			`docstring claim, EITHER restore the deleted mentions OR explicitly update both this assertion ` +
			`AND the docstring rationale in lockstep — the regex's carve-out semantics depend on the ` +
			`prohibition block remaining the canonical home for mutating-verb prose.`,
		);
	});
});
