// allow-test-rule: source-text-is-the-product
// The workflow .md file is the installed AI contract — its text IS what the orchestrator
// executes at runtime. Testing structural content of step 5.5 guards against accidental
// deletion of the wave-merge documentation (#3264).

/**
 * Regression tests for #3264 (19-12 re-point): step 5.5 wave-merge documentation
 *
 * The jj fork's Phase 11 rewiring (re-applied 19-08) replaced the git-worktree
 * cleanup-tail snippet with the cross-backend workspace.parallel.fan-in step.
 * The #3264 intent — "step 5.5 documents its skip conditions and its cleanup
 * machinery; neither may be accidentally deleted" — is preserved against the
 * NEW structure: fan-in invocation, fail-closed result guard, the explicit
 * skip-condition list, and the #630/#3384 envelope re-expression note.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const WORKFLOW_PATH = path.join(
  __dirname,
  '..',
  'gsd-core',
  'workflows',
  'execute-phase.md',
);

/**
 * Locate the step 5.5 block in the workflow file.
 * Returns the substring from "5.5." up to (but not including) "5.6.".
 * Throws if the block cannot be found.
 */
function extractStep55Block(content) {
  const start = content.indexOf('\n5.5.');
  assert.ok(start !== -1, 'execute-phase.md must contain a step 5.5 block');

  const end = content.indexOf('\n5.6.', start + 1);
  assert.ok(end !== -1, 'execute-phase.md must contain a step 5.6 block after 5.5');

  return content.slice(start, end);
}

describe('execute-phase step 5.5: cross-wave-deviation cleanup documentation (#3264)', () => {
  function readWorkflow() {
    try {
      return fs.readFileSync(WORKFLOW_PATH, 'utf-8');
    } catch (err) {
      throw new Error(`failed to read workflow fixture at ${WORKFLOW_PATH}: ${err.message}`);
    }
  }

  test('workflow file exists', () => {
    assert.ok(fs.existsSync(WORKFLOW_PATH), 'workflows/execute-phase.md should exist');
  });

  test('step 5.5 block exists and is bounded', () => {
    // extractStep55Block throws on failure — this test validates the helper itself
    const content = readWorkflow();
    const block = extractStep55Block(content);
    assert.ok(block.length > 0, 'step 5.5 block must be non-empty');
  });

  test('step 5.5 documents the standard wave-merge contract (fan-in before next wave)', () => {
    const content = readWorkflow();
    const block = extractStep55Block(content);
    assert.ok(
      block.includes('Workspace fan-in'),
      'step 5.5 must name the workspace fan-in step explicitly (19-12 re-point of the standard wave contract)',
    );
    assert.ok(
      block.includes('workspace.parallel.fan-in') || block.includes('workspace.parallel.fanIn'),
      'step 5.5 must delegate the wave merge to the workspace.parallel fan-in verb',
    );
  });

  test('step 5.5 carries the fail-closed fan-in result guard', () => {
    const content = readWorkflow();
    const block = extractStep55Block(content);
    assert.match(
      block,
      /\[ "\$CONFLICTED" = "true" \] \|\| \[ "\$FAILED_REAPED" -gt 0 \][\s\S]{0,200}?exit 1/,
      'step 5.5 must exit 1 on conflicted/failedReaped fan-in results',
    );
  });

  test('step 5.5 carries the pre-fan-in branch-drift guard (#3174-class)', () => {
    const content = readWorkflow();
    const block = extractStep55Block(content);
    assert.ok(
      block.includes('#3174-class drift'),
      'step 5.5 must FATAL on orchestrator branch drift before fan-in',
    );
  });

  test('skip conditions enumerate the no-isolation case (empty WAVE_WORKTREE_PLANS)', () => {
    const content = readWorkflow();
    const block = extractStep55Block(content);
    assert.ok(
      block.includes('When to skip step 5.5'),
      'step 5.5 must document its skip conditions explicitly',
    );
    assert.ok(
      block.includes('WAVE_WORKTREE_PLANS'),
      'step 5.5 must document the empty-WAVE_WORKTREE_PLANS skip condition',
    );
  });

  test('skip conditions enumerate the empty-handle case', () => {
    const content = readWorkflow();
    const block = extractStep55Block(content);
    assert.ok(
      block.includes('$HANDLE_JSON` is empty'),
      'step 5.5 must document the empty-handle skip condition',
    );
  });

  test('step 5.5 documents the #630/#3384 envelope re-expression instead of manifest machinery', () => {
    const content = readWorkflow();
    const block = extractStep55Block(content);
    assert.ok(
      block.includes('#630') && block.includes('#3384'),
      'step 5.5 must document the upstream-guard re-expression (#630 manifest pinning + #3384 manifest source of truth)',
    );
    assert.ok(
      block.includes('only workspace-set source of truth'),
      'step 5.5 must state the Handle JSON is the only workspace-set source of truth',
    );
  });

  test('step 5.5 does not rediscover global agent worktrees', () => {
    const content = readWorkflow();
    const block = extractStep55Block(content);
    assert.doesNotMatch(
      block,
      /git worktree list --porcelain.*\.claude\/worktrees\/agent-/s,
      'step 5.5 must not parse global git worktree list output for agent worktrees',
    );
  });
});
