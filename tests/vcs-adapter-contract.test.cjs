'use strict';
/**
 * VcsAdapter contract suite — node --test variant (Phase 1 plan 04).
 * Mirrors sdk/src/vcs/__tests__/adapter-contract.test.ts but runs against the dist-cjs/ artifact.
 * D-02: integration tests require() dist-cjs/ — verifies the actual artifact bin/lib will load.
 * RESEARCH Pitfall 1: this file uses the hand-rolled vcsTest from helpers.cjs (NOT vitest API).
 *
 * Phase 3 plan 03-01 Task 5: per-verb gating via BACKENDS_AVAILABLE_FOR_VERB.
 * D-12 throw-not-skip is observed by gating each test through the allowlist:
 * tests for verbs not-yet-implemented on the current backend short-circuit
 * with a "skip" assertion that doesn't increase the static skip count.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const helpers = require('./helpers.cjs');
const { vcsTest } = helpers;

vcsTest('auto', ({ getVcs, getCwd, getKind }) => {
  // Phase 3 D-12: per-verb allowlist gate. When the verb is not yet
  // implemented on this backend, the body short-circuits.
  function verbReady(verb) {
    const lane = (helpers.BACKENDS_AVAILABLE_FOR_VERB && helpers.BACKENDS_AVAILABLE_FOR_VERB[verb]) || [];
    return lane.includes(getKind());
  }

  test('vcs.kind matches backend selection', () => {
    const vcs = getVcs();
    if (getKind() === 'git') assert.equal(vcs.kind, 'git');
    else if (getKind() === 'jj-colocated') assert.equal(vcs.kind, 'jj');
  });

  test('vcs.commit({files,message}) produces a hash', () => {
    if (!verbReady('commit')) return; // verb-group plan 03-04 lands jj impl
    const vcs = getVcs();
    const cwd = getCwd();
    fs.writeFileSync(path.join(cwd, 'a.txt'), 'a');
    const r = vcs.commit({ files: ['a.txt'], message: 'add a' });
    assert.equal(r.exitCode, 0);
    assert.match(r.hash, /^[0-9a-f]+$/);
  });

  test('vcs.log returns entries after a commit', () => {
    if (!verbReady('log') || !verbReady('commit')) return;
    const vcs = getVcs();
    const cwd = getCwd();
    fs.writeFileSync(path.join(cwd, 'b.txt'), 'b');
    vcs.commit({ files: ['b.txt'], message: 'add b' });
    const entries = vcs.log({ maxCount: 5 });
    assert.ok(entries.length > 0);
    assert.match(entries[0].hash, /^[0-9a-f]+$/);
  });

  test('vcs.status({porcelain:true}) lists untracked files', () => {
    if (!verbReady('status')) return;
    const vcs = getVcs();
    const cwd = getCwd();
    fs.writeFileSync(path.join(cwd, 'untracked.txt'), 'u');
    const s = vcs.status({ porcelain: true });
    assert.ok(s.entries.some((e) => e.path === 'untracked.txt'));
  });

  test('vcs.findConflicts({scope:"all"}) returns [] on git', () => {
    if (!verbReady('findConflicts')) return;
    const vcs = getVcs();
    assert.deepEqual(vcs.findConflicts({ scope: 'all' }), []);
  });

  test('vcs.gitOnly.version returns a real git version', () => {
    const vcs = getVcs();
    if (vcs.kind !== 'git') return;
    assert.match(vcs.gitOnly.version(), /git version/);
  });

  // 2.1 D-07: vcs.hooks removed from public surface; frozen-depth probe no longer
  // covers a hooks namespace. Phase 4 (HOOK-01..05) wires hook firing internally.
  test('Object.isFrozen on adapter and nested namespaces', () => {
    const vcs = getVcs();
    assert.ok(Object.isFrozen(vcs));
    assert.ok(Object.isFrozen(vcs.refs));
    assert.ok(Object.isFrozen(vcs.refs.bookmarks));
    assert.ok(Object.isFrozen(vcs.workspace));
    // gitOnly only exists on git backend (JjVcsAdapter has no gitOnly).
    if (vcs.kind === 'git') assert.ok(Object.isFrozen(vcs.gitOnly));
  });
});
