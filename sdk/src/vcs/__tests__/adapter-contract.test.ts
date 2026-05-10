/**
 * Adapter contract suite — runs once per backend in BACKENDS_AVAILABLE (filtered by GSD_TEST_BACKENDS).
 * TEST-01 / TEST-04. Phase 3 adds jj-* keys to BACKENDS_AVAILABLE; this file requires no changes.
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeBackendFixture, selectedBackends } from './vcs-fixture.js';
import { expr } from '../expr.js';
import { toGitRev } from '../parse/git-rev.js';

describe.for(selectedBackends())('VcsAdapter contract — backend=%s', (kind) => {
  const { test, setupHooks } = makeBackendFixture(kind);
  setupHooks();

  test('vcs.kind matches backend kind', ({ vcs }) => {
    if (kind === 'git') expect(vcs.kind).toBe('git');
    else expect(vcs.kind).toBe('jj');
  });

  test('vcs.commit({files,message}) produces a hash', ({ vcs, cwd }) => {
    writeFileSync(join(cwd, 'a.txt'), 'a');
    const r = vcs.commit({ files: ['a.txt'], message: 'add a' });
    expect(r.exitCode).toBe(0);
    expect(r.hash).toMatch(/^[0-9a-f]+$/);
  });

  test('vcs.log returns at least one entry after a commit', ({ vcs, cwd }) => {
    writeFileSync(join(cwd, 'b.txt'), 'b');
    vcs.commit({ files: ['b.txt'], message: 'add b' });
    const entries = vcs.log({ maxCount: 5 });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].hash).toMatch(/^[0-9a-f]+$/);
  });

  test('vcs.status({porcelain:true}) lists untracked files', ({ vcs, cwd }) => {
    writeFileSync(join(cwd, 'untracked.txt'), 'u');
    const s = vcs.status({ porcelain: true });
    expect(s.entries.some((e) => e.path === 'untracked.txt')).toBe(true);
  });

  test('vcs.diff({rev:parent,nameOnly:true}) returns name-only of last commit', ({ vcs, cwd }) => {
    writeFileSync(join(cwd, 'c.txt'), 'c');
    vcs.commit({ files: ['c.txt'], message: 'add c' });
    const d = vcs.diff({ rev: expr.parent(), nameOnly: true });
    expect(d.nameOnly).toContain('c.txt');
  });

  test('vcs.refs.head and parent translate to git dialect', ({ vcs }) => {
    expect(toGitRev(vcs.refs.head)).toBe('HEAD');
    expect(toGitRev(vcs.refs.parent)).toBe('HEAD~1');
  });

  test('vcs.refs.bookmarks: create, exists, list, delete', ({ vcs }) => {
    const before = vcs.refs.bookmarks.list();
    expect(before.length).toBeGreaterThan(0);
    const baseBranch = before[0].name;
    vcs.refs.bookmarks.create('feat-x', expr.bookmark(baseBranch));
    expect(vcs.refs.bookmarks.exists('feat-x')).toBe(true);
    expect(vcs.refs.bookmarks.list().some((b) => b.name === 'feat-x')).toBe(true);
    vcs.refs.bookmarks.delete('feat-x');
    expect(vcs.refs.bookmarks.exists('feat-x')).toBe(false);
  });

  test('vcs.findConflicts({scope:"all"}) returns [] on git (Phase 1 documented gap)', ({ vcs }) => {
    expect(vcs.findConflicts({ scope: 'all' })).toEqual([]);
  });

  test('vcs.findConflicts({scope:"working-copy"}) is empty on a clean repo', ({ vcs }) => {
    expect(vcs.findConflicts({ scope: 'working-copy' })).toEqual([]);
  });

  test('vcs.hooks.fire(no hook installed) is a no-op', ({ vcs }) => {
    const r = vcs.hooks.fire('pre-commit');
    expect(r.exitCode).toBe(0);
  });

  test('vcs.gitOnly.version returns a real git version', ({ vcs }) => {
    if (vcs.kind !== 'git') return;
    expect(vcs.gitOnly.version()).toMatch(/git version/);
  });

  // Plan 02-03 Task 3 — symmetric contract tests for new verbs.
  // These properties hold on every backend (git in Phase 1/2; jj added in Phase 3).

  test('vcs.refs.currentBranch returns a non-null string after init', ({ vcs }) => {
    const cb = vcs.refs.currentBranch();
    expect(typeof cb).toBe('string');
    expect(cb && cb.length > 0).toBe(true);
  });

  test('vcs.refs.countCommits returns a positive integer after a commit', ({ vcs, cwd }) => {
    writeFileSync(join(cwd, 'cc.txt'), 'cc');
    vcs.commit({ files: ['cc.txt'], message: 'add cc' });
    const n = vcs.refs.countCommits({ rev: vcs.refs.head });
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThan(0);
  });

  test('vcs.refs.exists is true for HEAD, false for an all-zeros SHA', ({ vcs }) => {
    expect(vcs.refs.exists(vcs.refs.head)).toBe(true);
    expect(vcs.refs.exists(expr.commit('0000000000000000000000000000000000000000'))).toBe(false);
  });

  test('vcs.workspace.context on main workspace: mode=main, gitDir===gitCommonDir', ({ vcs }) => {
    const ctx = vcs.workspace.context();
    expect(ctx.mode).toBe('main');
    expect(ctx.isLinked).toBe(false);
    expect(ctx.gitDir).toBe(ctx.gitCommonDir);
  });
});

describe('GSD_TEST_BACKENDS filter sanity', () => {
  it('parseBackendsEnv("jj-colocated") yields empty intersection in Phase 1', async () => {
    const { parseBackendsEnv } = await import('../backends.js');
    // B-4: parseBackendsEnv returns { available, requested, unavailable }.
    expect(parseBackendsEnv('jj-colocated')).toEqual({ available: [], requested: ['jj-colocated'], unavailable: ['jj-colocated'] });
  });
});
