'use strict';
/**
 * VcsAdapter contract suite — node --test variant (Phase 1 plan 04).
 * Mirrors sdk/src/vcs/__tests__/adapter-contract.test.ts but runs against the dist-cjs/ artifact.
 * D-02: integration tests require() dist-cjs/ — verifies the actual artifact bin/lib will load.
 * RESEARCH Pitfall 1: this file uses the hand-rolled vcsTest from helpers.cjs (NOT vitest API).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { vcsTest } = require('./helpers.cjs');

vcsTest('auto', ({ getVcs, getCwd, getKind }) => {
  test('vcs.kind matches backend selection', () => {
    const vcs = getVcs();
    if (getKind() === 'git') assert.equal(vcs.kind, 'git');
  });

  test('vcs.commit({files,message}) produces a hash', () => {
    const vcs = getVcs();
    const cwd = getCwd();
    fs.writeFileSync(path.join(cwd, 'a.txt'), 'a');
    const r = vcs.commit({ files: ['a.txt'], message: 'add a' });
    assert.equal(r.exitCode, 0);
    assert.match(r.hash, /^[0-9a-f]+$/);
  });

  test('vcs.log returns entries after a commit', () => {
    const vcs = getVcs();
    const cwd = getCwd();
    fs.writeFileSync(path.join(cwd, 'b.txt'), 'b');
    vcs.commit({ files: ['b.txt'], message: 'add b' });
    const entries = vcs.log({ maxCount: 5 });
    assert.ok(entries.length > 0);
    assert.match(entries[0].hash, /^[0-9a-f]+$/);
  });

  test('vcs.status({porcelain:true}) lists untracked files', () => {
    const vcs = getVcs();
    const cwd = getCwd();
    fs.writeFileSync(path.join(cwd, 'untracked.txt'), 'u');
    const s = vcs.status({ porcelain: true });
    assert.ok(s.entries.some((e) => e.path === 'untracked.txt'));
  });

  test('vcs.findConflicts({scope:"all"}) returns [] on git', () => {
    const vcs = getVcs();
    assert.deepEqual(vcs.findConflicts({ scope: 'all' }), []);
  });

  test('vcs.gitOnly.version returns a real git version', () => {
    const vcs = getVcs();
    if (vcs.kind !== 'git') return;
    assert.match(vcs.gitOnly.version(), /git version/);
  });

  test('Object.isFrozen on adapter and nested namespaces', () => {
    const vcs = getVcs();
    assert.ok(Object.isFrozen(vcs));
    assert.ok(Object.isFrozen(vcs.refs));
    assert.ok(Object.isFrozen(vcs.refs.bookmarks));
    assert.ok(Object.isFrozen(vcs.workspace));
    assert.ok(Object.isFrozen(vcs.hooks));
    assert.ok(Object.isFrozen(vcs.gitOnly));
  });
});
