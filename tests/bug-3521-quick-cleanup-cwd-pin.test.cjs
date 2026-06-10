// allow-test-rule: source-text-is-the-product
// quick.md is the shipped orchestration contract for /gsd-quick; this
// regression test previously locked the CWD-safety guard in the manual shell
// cleanup loop. After #3797, quick.md delegates cleanup entirely to the SDK's
// worktree.cleanup-wave command, which encapsulates CWD-pinning, STATE.md/
// ROADMAP.md backup/restore, and deletion guards internally.
//
// This test file now verifies the delegation contract: quick.md calls
// worktree.cleanup-wave with || exit 1 (fail-closed), which enforces the
// safety semantics that were previously implemented inline in the shell loop.

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const QUICK_MD = path.join(__dirname, '..', 'gsd-core', 'workflows', 'quick.md');

function readQuickMd() {
  return fs.readFileSync(QUICK_MD, 'utf8');
}

describe('bug #3521 — quick.md post-merge cleanup CWD safety (via SDK delegation, #3797)', () => {

  test('quick.md is readable', () => {
    const content = readQuickMd();
    assert.ok(content.length > 0, 'quick.md must not be empty');
  });

  test('quick.md cleanup delegates CWD-safe workspace cleanup to SDK (workspace.parallel.fan-in)', () => {
    const content = readQuickMd();
    // 19-12 re-point: after #3797 quick.md delegated to worktree.cleanup-wave;
    // the jj fork's Phase 11 rewiring (re-applied 19-08) delegates to the
    // cross-backend workspace.parallel.fan-in verb, which owns CWD pinning,
    // merge, deletion guards and per-success workspace cleanup internally.
    assert.ok(
      content.includes('workspace.parallel.fan-in'),
      'quick.md must delegate cleanup to gsd_run query workspace.parallel.fan-in (#3797; 19-12 re-point)',
    );
  });

  test('quick.md fan-in guard enforces fail-closed safety (#3521 contract)', () => {
    const content = readQuickMd();
    // Fail-closed: the fan-in result guard exits 1 on conflicted/failedReaped
    // rather than swallowing SDK refusals (19-12 re-point of `|| exit 1`).
    assert.match(
      content,
      /\[ "\$CONFLICTED" = "true" \] \|\| \[ "\$FAILED_REAPED" -gt 0 \][\s\S]{0,200}?exit 1/,
      'quick.md fan-in must exit 1 on conflicted/failedReaped — fail-closed for safety refusals (#3521/#3797; 19-12 re-point)',
    );
  });

  test('quick.md handle guard still blocks broad cleanup without a dispatch envelope (#3384)', () => {
    const content = readQuickMd();
    // 19-12 re-point: Phase 11 D-01 eliminated the manifest file; the same
    // anti-discovery contract rides the dispatch envelope — $HANDLE_JSON is
    // the only workspace-set source of truth (quick.md documents the #3384
    // re-expression explicitly), and fan-in is skipped when it is empty.
    assert.ok(
      content.includes('HANDLE_JSON'),
      'quick.md must scope cleanup to the $HANDLE_JSON dispatch envelope (#3384; 19-12 re-point)',
    );
    assert.ok(
      content.includes('#3384 manifest source of truth') || content.includes('only workspace-set source of truth'),
      'quick.md must document the #3384 anti-broad-discovery re-expression (19-12 re-point)',
    );
  });

});
