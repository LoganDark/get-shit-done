/**
 * GSD Quick Workflow — Commit Boundary Tests (#1503)
 *
 * Validates that the quick workflow correctly separates executor
 * responsibilities (code commits) from orchestrator responsibilities
 * (docs artifact commit), preventing PLAN.md from being left untracked
 * when the executor runs without worktree isolation.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const WORKFLOWS_DIR = path.join(__dirname, '..', 'gsd-core', 'workflows');

describe('quick workflow commit boundary (#1503)', () => {
  const quickPath = path.join(WORKFLOWS_DIR, 'quick.md');
  let content;

  test('quick.md exists', () => {
    assert.ok(fs.existsSync(quickPath), 'workflows/quick.md should exist');
    content = fs.readFileSync(quickPath, 'utf-8');
  });

  test('executor constraints prohibit committing docs artifacts', () => {
    assert.ok(
      content.includes('Do NOT commit docs artifacts'),
      'executor constraints should prohibit committing SUMMARY.md, STATE.md, PLAN.md'
    );
  });

  test('Step 8 explicitly passes the artifact file list to the commit verb', () => {
    // 19-12 re-point: the jj fork's Step 8 commits via the adapter bridge —
    // `gsd_run query commit ... --files ${file_list}` captures WC state for
    // exactly the listed files internally, so no pre-staging `git add` exists.
    assert.ok(
      content.includes('git add ${file_list}')
        || content.includes('--files ${file_list}'),
      'Step 8 should explicitly scope the docs commit to the file list (git add or --files form)'
    );
  });

  test('Step 8 includes PLAN.md in file list', () => {
    assert.ok(
      content.includes('${QUICK_DIR}/${quick_id}-PLAN.md'),
      'Step 8 file list must include PLAN.md'
    );
  });

  test('Step 8 runs unconditionally', () => {
    assert.ok(
      content.includes('MUST always run'),
      'Step 8 should state it must always run regardless of executor commits'
    );
  });
});
