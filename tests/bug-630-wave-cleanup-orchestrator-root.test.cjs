// allow-test-rule: source-text-is-the-product
// execute-phase.md is the shipped orchestration contract for wave execution and
// cleanup. Bug #630: the two wave-cleanup guards resolved PRIMARY_WT from
// `git worktree list --porcelain`'s first entry — always the main checkout —
// so an orchestrator running from a non-primary (per-phase lane) worktree was
// cd'd off its own lane and tripped the #3174 branch-drift assertion at cleanup,
// refusing merge-back.
//
// 19-12 re-point (jj fork): Phase 11 D-01 retired WAVE_WORKTREE_MANIFEST —
// the dispatch path now rides the `workspace.parallel.{dispatch,fan-in}`
// envelope ($HANDLE_JSON). The #630 invariant ("cleanup never re-discovers a
// root via worktree-list first-entry; the orchestrator stays pinned to its own
// root") is re-expressed at the envelope layer: execute-phase.md documents the
// re-expression explicitly, carries the #3174-class EXPECTED_BRANCH drift
// FATAL before fan-in, and contains NO first-entry worktree-list resolution at
// all (the bug's root cause is structurally gone). The retired manifest-reader
// behavioral proofs were dropped with the machinery.

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const EXECUTE_PHASE_MD = path.join(__dirname, '..', 'gsd-core', 'workflows', 'execute-phase.md');

function readMd() {
  return fs.readFileSync(EXECUTE_PHASE_MD, 'utf8');
}

describe('bug #630 — wave-cleanup pins to the orchestrator root, not git-worktree-list first entry', () => {
  test('execute-phase.md is readable', () => {
    assert.ok(readMd().length > 0, 'execute-phase.md must not be empty');
  });

  // ── Source contract (the .md is the product) ──────────────────────────────

  test('dispatch envelope documents the #630 re-expression (orchestrator-root pinning rides the Handle)', () => {
    const content = readMd();
    assert.match(
      content,
      /orchestrator_root[^\n]*\(#630\)/,
      'execute-phase.md must document that the #630 orchestrator_root pin is re-expressed on the dispatch envelope',
    );
    assert.ok(
      content.includes('$HANDLE_JSON'),
      'the dispatch envelope ($HANDLE_JSON) must be the workspace-set source of truth replacing the manifest',
    );
  });

  test('pre-fan-in drift FATAL pins the orchestrator to its expected branch (#3174-class)', () => {
    const content = readMd();
    assert.match(
      content,
      /EXPECTED_BRANCH[^\n]*\{ echo "FATAL: orchestrator on[^\n]*#3174-class drift[^\n]*exit 1; \}/,
      'execute-phase.md must FATAL before fan-in when the orchestrator drifted off EXPECTED_BRANCH (#3174/#630 class)',
    );
  });

  test('no first-entry worktree-list resolution survives anywhere (#630 root cause gone)', () => {
    const content = readMd();
    const firstEntryLines = content.match(/^.*git worktree list --porcelain \| awk '\/\^worktree \/.*$/gm) || [];
    assert.equal(
      firstEntryLines.length,
      0,
      `no PRIMARY_WT first-entry resolution may exist; found: ${firstEntryLines.map(l => l.trim()).join(' | ')}`,
    );
  });
});
