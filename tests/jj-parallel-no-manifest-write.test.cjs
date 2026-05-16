'use strict';
/**
 * Phase 11 Plan 11-09 (WR-01 closure): regression test pinning the
 * no-manifest-write invariant against future drift.
 *
 * D-01 architectural invariant: only persistent state is workspaces /
 * bookmarks / HEADs themselves; no orchestrator-managed sidecar files. Plan
 * 11-09 retired the orphaned WAVE_WORKTREE_MANIFEST writer in
 * `sdk/src/vcs/jj/parallel.ts` (the SDK-side mirror of the same retirement
 * that `bin/lib/worktree-safety.cjs::reconstructHandleFromLegacyPlan` shipped
 * for the legacy-plan path).
 *
 * Test strategy: two layers.
 *
 *   1. Source-level guard (always runs) — read `sdk/src/vcs/jj/parallel.ts`
 *      as text and assert that the retired tokens are not present in
 *      executable positions. This catches any future re-introduction of the
 *      manifest write at PR-review time without needing a live jj fixture.
 *
 *   2. Filesystem-level live-fixture guard (annotated `skip: true`) —
 *      opportunistic upgrade hook for whoever next touches jj-fixture
 *      testing in this repo. Would run a live `performJjParallelDispatch`
 *      and assert no `gsd-wave-manifest-*` directory was created under
 *      `os.tmpdir()`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const repoRoot = path.resolve(__dirname, '..');
const PARALLEL_TS = fs.readFileSync(
  path.join(repoRoot, 'sdk/src/vcs/jj/parallel.ts'),
  'utf-8',
);

test.describe('WR-01 source-level guard (always runs)', () => {
  test.test('jj/parallel.ts source contains no manifest-write call tokens', () => {
    assert.doesNotMatch(
      PARALLEL_TS,
      /mkdtempSync\s*\([^)]*gsd-wave-manifest/,
      'WR-01: sdk/src/vcs/jj/parallel.ts must not mkdtempSync a gsd-wave-manifest dir (D-01 invariant: no orchestrator-managed sidecar state)',
    );
    assert.doesNotMatch(
      PARALLEL_TS,
      /writeFileSync\s*\([^)]*wave-worktree-manifest/,
      'WR-01: sdk/src/vcs/jj/parallel.ts must not writeFileSync the wave-worktree-manifest.json sidecar',
    );
  });

  test.test('jj/parallel.ts returns manifest: "" (parity with reconstructHandleFromLegacyPlan)', () => {
    assert.match(
      PARALLEL_TS,
      /manifest:\s*''/,
      'WR-01: handle.manifest must be the empty string (mirrors bin/lib/worktree-safety.cjs:reconstructHandleFromLegacyPlan)',
    );
  });

  test.test('jj/parallel.ts docstring no longer claims the manifest write is part of the contract', () => {
    assert.doesNotMatch(
      PARALLEL_TS,
      /write the WAVE_WORKTREE_MANIFEST/,
      'WR-01: docstring claim that the manifest is written must be removed',
    );
  });
});

test.describe('WR-01 filesystem-level guard (skipped — opportunistic upgrade hook)', { skip: true }, () => {
  // Implementer note: if a jj-fixture helper exists in the test suite (e.g.
  // the pattern used by sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts via
  // createJjRepoFixture / vitest), upgrade this describe block to run a live
  // dispatch + scan os.tmpdir() for new `gsd-wave-manifest-*` dirs. For now
  // the source-level guard above is sufficient to pin the contract — the
  // live test is opportunistic and exists as a documentation hook.
  test.test('live dispatch produces no gsd-wave-manifest-* dir under tmpdir', () => {
    const before = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith('gsd-wave-manifest-'));
    // ... live dispatch via createVcsAdapter(repoRoot).workspace.parallel.dispatch({...}) ...
    const after = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith('gsd-wave-manifest-'));
    assert.deepStrictEqual(after, before, 'WR-01: live jj dispatch must not create a gsd-wave-manifest-* tmpdir');
  });
});
