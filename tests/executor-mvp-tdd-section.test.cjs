/**
 * gsd-executor agent — MVP+TDD gate section contract
 * Verifies the agent definition contains a section instructing the executor
 * to halt and report when the runtime gate trips.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const AGENT = path.join(__dirname, '..', 'agents', 'gsd-executor.md');
const REF = path.join(__dirname, '..', 'gsd-core', 'references', 'execute-mvp-tdd.md');

describe('gsd-executor — MVP+TDD gate section', () => {
  const content = fs.readFileSync(AGENT, 'utf-8');

  test('agent defines an MVP+TDD Gate section', () => {
    assert.match(content, /MVP\+TDD\s*Gate|MVP[\s-]?TDD[\s-]?gate/i, 'must label the gate');
  });

  test('agent instructs halt-and-report when gate trips', () => {
    assert.match(content, /halt|stop[^\n]*gate|gate[^\n]*halt/i, 'must instruct halt');
    assert.match(content, /report|surface|emit/i, 'must instruct report');
  });

  test('agent references execute-mvp-tdd.md', () => {
    assert.match(content, /execute-mvp-tdd\.md/, 'must reference the gate semantics file');
  });

  test('referenced file exists on disk', () => {
    assert.ok(fs.existsSync(REF), `${REF} must exist`);
  });
});

describe('gsd-executor — state.* calls use the named-only router form (#1863 regression)', () => {
  // The runtime state-command router (gsd-core/bin/lib/state-command-router.cjs)
  // parses record-metric / add-decision / add-blocker / record-session named-only
  // via parseNamedArgs. Positional values are silently dropped, so state.cjs then
  // throws its required-arg error and metrics/decisions/blockers/session continuity
  // are never recorded. Each invocation in the executor agent must therefore pass
  // the named flags the router expects (mirrors gsd-core/workflows/execute-plan.md).
  const content = fs.readFileSync(AGENT, 'utf-8');

  // Capture a `gsd_run query state.<cmd> ...` invocation, including backslash-continued lines.
  function invocation(cmd) {
    const re = new RegExp(String.raw`gsd_run query state\.${cmd}\b(?:[^\r\n]*\\\r?\n)*[^\r\n]*`);
    const m = content.match(re);
    assert.ok(m, `executor must invoke state.${cmd}`);
    return m[0];
  }

  test('record-metric passes --phase/--plan/--duration/--tasks/--files', () => {
    const call = invocation('record-metric');
    for (const flag of ['--phase', '--plan', '--duration', '--tasks', '--files']) {
      assert.ok(call.includes(flag), `record-metric must pass ${flag}, got:\n${call}`);
    }
  });

  test('add-decision passes --summary (or --summary-file)', () => {
    assert.match(invocation('add-decision'), /--summary(?:-file)?\b/);
  });

  test('add-blocker passes --text (or --text-file)', () => {
    assert.match(invocation('add-blocker'), /--text(?:-file)?\b/);
  });

  test('record-session passes --stopped-at and --resume-file', () => {
    const call = invocation('record-session');
    assert.ok(call.includes('--stopped-at'), 'record-session must pass --stopped-at');
    assert.ok(call.includes('--resume-file'), 'record-session must pass --resume-file');
  });

  test('no state.* call leads with a bare positional (quoted) value — the #1863 bug', () => {
    // Buggy multi-line form: `state.<cmd> \` then a line whose first token is a quote.
    const continued = /state\.(?:record-metric|add-decision|add-blocker|record-session)\b[^\r\n]*\\\r?\n\s*"/;
    assert.ok(!continued.test(content),
      'state.* calls must lead with --flags, not a positional quoted value on the next line');
    // Buggy same-line form: `state.<cmd> "..."`
    const inline = /state\.(?:record-metric|add-decision|add-blocker|record-session)\s+"/;
    assert.ok(!inline.test(content),
      'state.* calls must not pass a positional value immediately after the command');
  });

  test('sibling workflow record-session calls also use named flags (#1863 completeness)', () => {
    // The same named-only router backs milestone-summary.md and forensics.md; both
    // previously passed record-session positionally (`"" "stopped-at" "resume-file"`),
    // silently dropping the values. Guard them alongside the executor.
    for (const rel of ['gsd-core/workflows/milestone-summary.md', 'gsd-core/workflows/forensics.md']) {
      const wf = fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');
      const m = wf.match(/gsd_run query state\.record-session\b(?:[^\r\n]*\\\r?\n)*[^\r\n]*/);
      assert.ok(m, `${rel} must invoke state.record-session`);
      assert.ok(m[0].includes('--stopped-at') && m[0].includes('--resume-file'),
        `${rel} record-session must use --stopped-at/--resume-file, got:\n${m[0]}`);
      assert.ok(!/state\.record-session\s+"/.test(wf),
        `${rel} record-session must not lead with a positional value`);
    }
  });
});


// ────────────────────────────────────────────────────────────────────────
// Folded from tests/bug-3097-3099-executor-worktree-path-safety.test.cjs — consolidation epic #1969 (B7 #1976)
// ────────────────────────────────────────────────────────────────────────
{
  const { describe: __foldDescribe } = require('node:test');
  __foldDescribe("folded:bug-3097-3099-executor-worktree-path-safety (consolidation epic #1969 B7 #1976)", () => {
'use strict';
// allow-test-rule: reads markdown product files (gsd-executor.md, dispatch-cwd-safety.md) to verify structural protocol — not source-grep (see #3097)

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
  path.join(ROOT, 'gsd-core', 'workflows', 'execute-phase.md'), 'utf8',
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
      fs.existsSync(path.join(ROOT, 'gsd-core', 'references', 'dispatch-cwd-safety.md')),
      'gsd-core/references/dispatch-cwd-safety.md does not exist',
    );
  });

  test('dispatch-cwd-safety.md documents the workspace.assert-dispatched-cwd verb', () => {
    const safetySrc = fs.readFileSync(
      path.join(ROOT, 'gsd-core', 'references', 'dispatch-cwd-safety.md'), 'utf8',
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
  });
}
