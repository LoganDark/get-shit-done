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


// ────────────────────────────────────────────────────────────────────────
// Folded from tests/fix-3722-execute-phase-human-needed-checkpoint.test.cjs — consolidation epic #1969 (B4 #1973)
// ────────────────────────────────────────────────────────────────────────
{
  const { describe: __foldDescribe } = require('node:test');
  __foldDescribe("folded:fix-3722-execute-phase-human-needed-checkpoint (consolidation epic #1969 B4 #1973)", () => {
// allow-test-rule: source-text-is-the-product (see #3722)
// execute-phase.md IS the runtime contract loaded by the orchestrator.
// Asserting that the "ack-and-advance" path is absent is the only way to verify
// the state machine lie (issue #38) cannot regress at runtime.
'use strict';

/**
 * execute-phase.md human_needed branch — issue #38 / fix #3722
 *
 * The old design offered '"approved" → continue' as a shortcut that advanced
 * ROADMAP.md without completing human verification. This is a state machine lie:
 * the phase appears complete in the project record while HUMAN-UAT.md items
 * remain unresolved.
 *
 * The correct design:
 *   - human_needed branch creates a {phase_num}-UAT.md file (not {phase_num}-HUMAN-UAT.md)
 *   - directs the user to /gsd:verify-work to complete verification
 *   - does NOT call update_roadmap directly (phase completion goes through verify-work)
 *   - does NOT offer "approved" → continue as a bypass
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const EXECUTE_PHASE = path.join(
  __dirname,
  '..',
  'gsd-core',
  'workflows',
  'execute-phase.md'
);

describe('execute-phase.md human_needed branch — issue #38', () => {
  let content;

  // Read once; all tests share the string.
  test('workflow file is readable', () => {
    content = fs.readFileSync(EXECUTE_PHASE, 'utf-8');
    assert.ok(content.length > 0, 'execute-phase.md must be non-empty');
  });

  test('human_needed section exists', () => {
    if (!content) content = fs.readFileSync(EXECUTE_PHASE, 'utf-8');
    assert.ok(
      content.includes('human_needed'),
      'execute-phase.md must contain a human_needed branch'
    );
  });

  test('"approved" → continue bypass is absent from human_needed branch', () => {
    if (!content) content = fs.readFileSync(EXECUTE_PHASE, 'utf-8');
    // The old prompt offered '"approved" → continue' as a shortcut that advanced
    // ROADMAP.md without completing verification. That path must not exist.
    assert.ok(
      !content.includes('"approved" → continue'),
      'human_needed branch must not offer "approved" → continue: it marks the phase complete without verification (issue #38)'
    );
  });

  test('human_needed branch does NOT call update_roadmap directly', () => {
    if (!content) content = fs.readFileSync(EXECUTE_PHASE, 'utf-8');
    // Locate the human_needed section and check that update_roadmap does not
    // appear before the gaps_found section (i.e. it is not reachable from human_needed).
    const humanNeededIdx = content.indexOf('**If human_needed:**');
    const gapsFoundIdx = content.indexOf('**If gaps_found:**');
    const updateRoadmapIdx = content.indexOf('update_roadmap', humanNeededIdx);

    assert.ok(humanNeededIdx !== -1, '**If human_needed:** section must exist');
    assert.ok(gapsFoundIdx !== -1, '**If gaps_found:** section must exist');
    assert.ok(
      humanNeededIdx < gapsFoundIdx,
      'human_needed section must appear before gaps_found section'
    );

    // update_roadmap must not appear between human_needed and gaps_found sections
    const updateRoadmapBetween =
      updateRoadmapIdx !== -1 &&
      updateRoadmapIdx > humanNeededIdx &&
      updateRoadmapIdx < gapsFoundIdx;

    assert.ok(
      !updateRoadmapBetween,
      'update_roadmap must not be reachable directly from the human_needed branch — phase completion must go through verify-work (issue #38)'
    );
  });

  test('human_needed branch directs user to /gsd:verify-work', () => {
    if (!content) content = fs.readFileSync(EXECUTE_PHASE, 'utf-8');
    const humanNeededIdx = content.indexOf('**If human_needed:**');
    const gapsFoundIdx = content.indexOf('**If gaps_found:**');
    assert.ok(humanNeededIdx !== -1, '**If human_needed:** section must exist');

    const humanNeededSection = content.slice(
      humanNeededIdx,
      gapsFoundIdx !== -1 ? gapsFoundIdx : undefined
    );
    assert.ok(
      humanNeededSection.includes('verify-work'),
      'human_needed branch must direct the user to /gsd:verify-work to complete verification'
    );
  });

  test('human_needed branch creates {phase_num}-UAT.md (not HUMAN-UAT.md)', () => {
    if (!content) content = fs.readFileSync(EXECUTE_PHASE, 'utf-8');
    const humanNeededIdx = content.indexOf('**If human_needed:**');
    const gapsFoundIdx = content.indexOf('**If gaps_found:**');
    assert.ok(humanNeededIdx !== -1, '**If human_needed:** section must exist');

    const humanNeededSection = content.slice(
      humanNeededIdx,
      gapsFoundIdx !== -1 ? gapsFoundIdx : undefined
    );

    // The file should be named {phase_num}-UAT.md so verify-work's glob picks it up
    assert.ok(
      humanNeededSection.includes('-UAT.md'),
      'human_needed branch must create a {phase_num}-UAT.md file for verify-work to resume'
    );

    // HUMAN-UAT.md causes a naming mismatch with verify-work's create_uat_file step
    assert.ok(
      !humanNeededSection.includes('HUMAN-UAT.md'),
      'human_needed branch must NOT create HUMAN-UAT.md — use {phase_num}-UAT.md to align with verify-work\'s resume path (issue #38 edge case 3)'
    );
  });
});
  });
}
