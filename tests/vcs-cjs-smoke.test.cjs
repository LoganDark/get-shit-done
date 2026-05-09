'use strict';
/**
 * vcs-cjs-smoke.test.cjs (Plan 01-03 Task 3 — W-1 fix)
 *
 * Proves SC-1: "consumable from bin/lib/*.cjs via plain require()".
 * Vitest tests load TS via vitest's loader — this test runs CJS via plain Node
 * require() so the actual artifact path that bin/lib/*.cjs uses in production is
 * exercised end-to-end.
 *
 * Picked up automatically by scripts/run-tests.cjs (`tests/*.test.cjs` glob).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

test('plain require() of dist-cjs/vcs/index.js loads createVcsAdapter', () => {
  const mod = require('../sdk/dist-cjs/vcs/index.js');
  assert.equal(typeof mod.createVcsAdapter, 'function');
  assert.ok(
    Array.isArray(require('../sdk/dist-cjs/vcs/backends.js').BACKENDS_AVAILABLE),
  );
});

test('createVcsAdapter against a real tmp git repo returns a git adapter', () => {
  const { createVcsAdapter } = require('../sdk/dist-cjs/vcs/index.js');
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
