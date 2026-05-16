'use strict';
// allow-test-rule: reads markdown product files (gsd-executor.md, dispatch-cwd-safety.md) to verify structural protocol — not source-grep

// Regression guards for bug #3097 and #3099.
//
// #3097 (original): gsd-executor's worktree HEAD guard used `if [ -f .git ]`
// to detect worktree mode. After a Bash `cd` out of the worktree into the main
// repo, `.git` is a DIRECTORY (not a file), so the test was false and the entire
// HEAD safety block was silently skipped. Commits then landed on whatever branch
// the main repo had checked out — not the per-agent worktree branch.
//
// #3099 (original): Executor agents constructed absolute paths from `pwd`
// captured in the orchestrator context (main repo root). Edit/Write calls
// using these paths resolved to the main repo, not the worktree.
//
// Phase 11 (2026-05-16) collapsed the four worktree-aware guards into a single
// `gsd-sdk query workspace.assert-dispatched-cwd --cwd .` call. The verb's
// predicate over `vcs.workspace.list()` catches both failure modes by
// construction: cwd-drift → workspace match flips to `isPrimary: true`;
// absolute paths outside the workspace → no match (`workspaceName: null`).
// This test was flipped per Plan 11-04 A5 to assert the new shape.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const executorSrc = fs.readFileSync(
  path.join(ROOT, 'agents', 'gsd-executor.md'), 'utf8',
);
const executePhaseSrc = fs.readFileSync(
  path.join(ROOT, 'get-shit-done', 'workflows', 'execute-phase.md'), 'utf8',
);

describe('bug #3097: dispatched-cwd precondition guard in gsd-executor.md', () => {
  test('task_commit_protocol invokes workspace.assert-dispatched-cwd', () => {
    const protocolIdx = executorSrc.indexOf('<task_commit_protocol>');
    const protocolEnd = executorSrc.indexOf('</task_commit_protocol>');
    assert.ok(protocolIdx !== -1 && protocolEnd !== -1, 'task_commit_protocol block not found');
    const protocol = executorSrc.slice(protocolIdx, protocolEnd);
    assert.ok(
      protocol.includes('workspace.assert-dispatched-cwd'),
      'task_commit_protocol missing workspace.assert-dispatched-cwd verb call — Phase 11 collapse not applied',
    );
  });

  test('assert-dispatched-cwd call branches on .ok', () => {
    const protocolIdx = executorSrc.indexOf('<task_commit_protocol>');
    const protocolEnd = executorSrc.indexOf('</task_commit_protocol>');
    const protocol = executorSrc.slice(protocolIdx, protocolEnd);
    assert.ok(
      protocol.includes("jq -r '.ok'") || protocol.includes('jq -r ".ok"'),
      'precondition guard must branch on the verb\'s .ok field',
    );
  });

  test('precondition guard runs at the start of task_commit_protocol', () => {
    const protocolIdx = executorSrc.indexOf('<task_commit_protocol>');
    const protocolEnd = executorSrc.indexOf('</task_commit_protocol>');
    const protocol = executorSrc.slice(protocolIdx, protocolEnd);
    const dispatchIdx = protocol.indexOf('workspace.assert-dispatched-cwd');
    const commitStepIdx = protocol.indexOf('Check modified files');
    assert.ok(dispatchIdx !== -1, 'assert-dispatched-cwd call not found');
    assert.ok(commitStepIdx !== -1, '"Check modified files" step not found');
    assert.ok(dispatchIdx < commitStepIdx, 'dispatched-cwd assertion must precede the commit-staging steps');
  });
});

describe('bug #3099: dispatch-cwd-safety reference + verb integration', () => {
  test('task_commit_protocol cites the safety reference document', () => {
    const protocolIdx = executorSrc.indexOf('<task_commit_protocol>');
    const protocolEnd = executorSrc.indexOf('</task_commit_protocol>');
    const protocol = executorSrc.slice(protocolIdx, protocolEnd);
    assert.ok(
      protocol.includes('dispatch-cwd-safety.md') ||
        protocol.includes('workspace.assert-dispatched-cwd'),
      'task_commit_protocol must reference dispatch-cwd-safety.md or invoke the verb',
    );
  });

  test('execute-phase.md execution_context references dispatch-cwd-safety.md', () => {
    assert.ok(
      executePhaseSrc.includes('dispatch-cwd-safety.md'),
      'execute-phase.md does not reference dispatch-cwd-safety.md in execution_context',
    );
  });

  test('dispatch-cwd-safety.md reference file exists', () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'get-shit-done', 'references', 'dispatch-cwd-safety.md')),
      'get-shit-done/references/dispatch-cwd-safety.md does not exist',
    );
  });

  test('dispatch-cwd-safety.md documents the workspace.assert-dispatched-cwd verb', () => {
    const safetySrc = fs.readFileSync(
      path.join(ROOT, 'get-shit-done', 'references', 'dispatch-cwd-safety.md'), 'utf8',
    );
    assert.ok(
      safetySrc.includes('workspace.assert-dispatched-cwd'),
      'dispatch-cwd-safety.md must document the workspace.assert-dispatched-cwd verb literally',
    );
    assert.ok(
      safetySrc.includes('isPrimary'),
      'dispatch-cwd-safety.md must document the verb return shape including isPrimary',
    );
  });
});
