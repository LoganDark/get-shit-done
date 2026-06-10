'use strict';
/**
 * vcs-cjs-smoke.test.cjs (Plan 01-03 Task 3 — W-1 fix)
 *
 * Proves SC-1: "consumable from bin/lib/*.cjs via plain require()".
 * This test runs CJS via plain Node require() so the actual artifact path that
 * bin/lib/*.cjs uses in production is exercised end-to-end.
 *
 * Phase 19 plan 19-06: re-pointed from the retired SDK dist-cjs build to the
 * build-at-publish artifact at ../gsd-core/bin/lib/vcs (emitted by
 * `pnpm run build:lib`). 19-12: citation reworded so the retired-surface
 * detector stays clean.
 *
 * Picked up automatically by scripts/run-tests.cjs (`tests/*.test.cjs` glob).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

test('plain require() of gsd-core/bin/lib/vcs/index.cjs loads createVcsAdapter', () => {
  const mod = require('../gsd-core/bin/lib/vcs/index.cjs');
  assert.equal(typeof mod.createVcsAdapter, 'function');
  assert.ok(
    Array.isArray(require('../gsd-core/bin/lib/vcs/backends.cjs').BACKENDS_AVAILABLE),
  );
});

test('createVcsAdapter against a real tmp git repo returns a git adapter', () => {
  const { createVcsAdapter } = require('../gsd-core/bin/lib/vcs/index.cjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-cjs-smoke-'));
  try {
    execSync('git init', { cwd: tmp, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tmp, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tmp, stdio: 'pipe' });
    execSync('git config commit.gpgsign false', { cwd: tmp, stdio: 'pipe' });
    execSync('git commit --allow-empty -m initial', { cwd: tmp, stdio: 'pipe' });
    const vcs = createVcsAdapter(tmp);
    assert.equal(vcs.kind, 'git');
    const v = vcs.gitOnly.version();
    assert.match(v, /^git version /);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
