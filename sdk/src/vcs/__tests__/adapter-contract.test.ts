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
import { BACKENDS_AVAILABLE_FOR_VERB } from '../backends.js';

/**
 * Phase 3 D-12: per-verb allowlist gate for contract tests. When the
 * adapter under test does not yet implement `verb` on this backend, the
 * test is skipped (rather than throwing VcsNotImplementedError, which
 * would surface as a failure). Verb-group plans 03-02..03-06 flip
 * BACKENDS_AVAILABLE_FOR_VERB entries to include `'jj-colocated'` as
 * bodies land; Phase 5 deletes the gate entirely when CI-01 graduates
 * the jj lane.
 */
function verbReady(verb: string, kind: string): boolean {
  const lane = (BACKENDS_AVAILABLE_FOR_VERB[verb] ?? []) as readonly string[];
  return lane.includes(kind);
}

describe.for(selectedBackends())('VcsAdapter contract — backend=%s', (kind) => {
  const { test, setupHooks } = makeBackendFixture(kind);
  setupHooks();
  // Cache the kind-binding of verbReady so test-level skipIf reads tighter.
  const ready = (verb: string): boolean => verbReady(verb, kind);

  test('vcs.kind matches backend kind', ({ vcs }) => {
    if (kind === 'git') expect(vcs.kind).toBe('git');
    else expect(vcs.kind).toBe('jj');
  });

  test.skipIf(!ready('commit'))('vcs.commit({files,message}) produces a hash', ({ vcs, cwd }) => {
    writeFileSync(join(cwd, 'a.txt'), 'a');
    const r = vcs.commit({ files: ['a.txt'], message: 'add a' });
    expect(r.exitCode).toBe(0);
    expect(r.hash).toMatch(/^[0-9a-f]+$/);
  });

  test.skipIf(!ready('log') || !ready('commit'))('vcs.log returns at least one entry after a commit', ({ vcs, cwd }) => {
    writeFileSync(join(cwd, 'b.txt'), 'b');
    vcs.commit({ files: ['b.txt'], message: 'add b' });
    const entries = vcs.log({ maxCount: 5 });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].hash).toMatch(/^[0-9a-f]+$/);
  });

  test.skipIf(!ready('status'))('vcs.status({porcelain:true}) lists untracked files', ({ vcs, cwd }) => {
    writeFileSync(join(cwd, 'untracked.txt'), 'u');
    const s = vcs.status({ porcelain: true });
    expect(s.entries.some((e) => e.path === 'untracked.txt')).toBe(true);
  });

  test.skipIf(!ready('diff') || !ready('commit'))('vcs.diff({rev:parent,nameOnly:true}) returns name-only of last commit', ({ vcs, cwd }) => {
    writeFileSync(join(cwd, 'c.txt'), 'c');
    vcs.commit({ files: ['c.txt'], message: 'add c' });
    const d = vcs.diff({ rev: expr.parent(), nameOnly: true });
    expect(d.nameOnly).toContain('c.txt');
  });

  test('vcs.refs.head and parent translate to git dialect', ({ vcs }) => {
    expect(toGitRev(vcs.refs.head)).toBe('HEAD');
    expect(toGitRev(vcs.refs.parent)).toBe('HEAD~1');
  });

  test.skipIf(
    !ready('refs.bookmarks.list') || !ready('refs.bookmarks.create') || !ready('refs.bookmarks.exists') || !ready('refs.bookmarks.delete')
  )('vcs.refs.bookmarks: create, exists, list, delete', ({ vcs }) => {
    // Phase 3 plan 03-03: this used to be a single-shape test against git's
    // implicit `main` branch, but jj's `initJjRepo` (vcs-fixture.ts) has no
    // implicit bookmark — jj's `@` is anonymous on top of root. To preserve
    // the cross-backend property under test (create → exists → list-membership
    // → delete → not-exists), branch on `vcs.kind`:
    //   - git: read existing `before[0].name` and base `feat-x` off it via
    //     `expr.bookmark(name)`.
    //   - jj: base `feat-x` off `expr.parent()` directly (no need to round-
    //     trip through a bookmark revset; the jj adapter's D-03 `gsd/`
    //     prefix would otherwise force `expr.bookmark('base')` to resolve
    //     to revset `base` which doesn't exist on jj — only `gsd/base` does).
    const baseRev =
      vcs.kind === 'jj'
        ? expr.parent()
        : (() => {
            const before = vcs.refs.bookmarks.list();
            expect(before.length).toBeGreaterThan(0);
            return expr.bookmark(before[0].name);
          })();
    vcs.refs.bookmarks.create('feat-x', baseRev);
    expect(vcs.refs.bookmarks.exists('feat-x')).toBe(true);
    expect(vcs.refs.bookmarks.list().some((b) => b.name === 'feat-x')).toBe(true);
    vcs.refs.bookmarks.delete('feat-x');
    expect(vcs.refs.bookmarks.exists('feat-x')).toBe(false);
  });

  test.skipIf(!ready('findConflicts'))('vcs.findConflicts({scope:"all"}) returns [] on git (Phase 1 documented gap)', ({ vcs }) => {
    expect(vcs.findConflicts({ scope: 'all' })).toEqual([]);
  });

  test.skipIf(!ready('findConflicts'))('vcs.findConflicts({scope:"working-copy"}) is empty on a clean repo', ({ vcs }) => {
    expect(vcs.findConflicts({ scope: 'working-copy' })).toEqual([]);
  });

  // 2.1 D-07 + RESEARCH Open Q1: vcs.hooks public surface removed.
  // The fireHook helper stays private in hook-bridge.ts; Phase 4 (HOOK-01..05)
  // wires the internal invocation from commit() / push(). Re-introduce hook-
  // firing observability tests there via side-effect assertion (e.g., a hook
  // script that touches a file).

  test('vcs.gitOnly.version returns a real git version', ({ vcs }) => {
    if (vcs.kind !== 'git') return;
    expect(vcs.gitOnly.version()).toMatch(/git version/);
  });

  // Plan 02-03 Task 3 — symmetric contract tests for new verbs.
  // These properties hold on every backend (git in Phase 1/2; jj added in Phase 3).

  test.skipIf(!ready('refs.currentBookmarks'))('vcs.refs.currentBookmarks returns a string[] after init', ({ vcs }) => {
    // Phase 3 plan 03-03: git's `initGitRepo` produces an attached `main`/
    // `master` branch so currentBookmarks() returns one entry. jj's
    // `initJjRepo` produces an anonymous @ on top of root with no
    // bookmarks, so currentBookmarks() returns []. Both cases satisfy the
    // cross-backend contract (Array of strings; D-15 explicitly admits the
    // empty-array case for anonymous head). When a bookmark IS attached,
    // the entry is a non-empty string — seed and re-probe to pin that half.
    const cb = vcs.refs.currentBookmarks();
    expect(Array.isArray(cb)).toBe(true);
    if (vcs.kind === 'git') {
      // Git always has an attached branch after init.
      expect(cb.length).toBeGreaterThan(0);
      expect(typeof cb[0]).toBe('string');
      expect(cb[0]!.length).toBeGreaterThan(0);
    } else {
      // jj: fresh init has no bookmarks. Seed one and verify currentBookmarks()
      // surfaces the (stripped) name.
      vcs.refs.bookmarks.create('cb-test', expr.parent());
      const cb2 = vcs.refs.currentBookmarks();
      expect(cb2.length).toBeGreaterThan(0);
      expect(cb2).toContain('cb-test'); // stripped per D-03
    }
  });

  test.skipIf(!ready('refs.countCommits') || !ready('commit'))('vcs.refs.countCommits returns a positive integer after a commit', ({ vcs, cwd }) => {
    writeFileSync(join(cwd, 'cc.txt'), 'cc');
    vcs.commit({ files: ['cc.txt'], message: 'add cc' });
    const n = vcs.refs.countCommits({ rev: vcs.refs.head });
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThan(0);
  });

  test.skipIf(!ready('refs.exists'))('vcs.refs.exists is true for HEAD, false for a nonexistent SHA', ({ vcs }) => {
    expect(vcs.refs.exists(vcs.refs.head)).toBe(true);
    // Phase 3 plan 03-03: the all-zeros SHA used to be the canonical "does
    // not exist" probe on git, but jj uses `0000...0000` as its synthetic
    // root commit id (`root()` revset resolves to it) — so the all-zeros
    // probe returns true on jj backends. Use `ffff...ffff` instead, which
    // is non-existent on both backends.
    expect(vcs.refs.exists(expr.rev('ffffffffffffffffffffffffffffffffffffffff'))).toBe(false);
  });

  test.skipIf(!ready('workspace.context'))('vcs.workspace.context on main workspace: mode=main, gitDir===gitCommonDir', ({ vcs }) => {
    const ctx = vcs.workspace.context();
    expect(ctx.mode).toBe('main');
    expect(ctx.isLinked).toBe(false);
    // 2.1 D-18: WorkspaceContext.{gitDir,gitCommonDir} moved to GitOnlyOps;
    // narrow on vcs.kind === 'git' to access. On jj backend the equivalent
    // semantic check is workspace.context()'s mode/isLinked assertion above —
    // the underlying .git directory layout is not part of the cross-backend
    // contract surface.
    if (vcs.kind === 'git') {
      expect(vcs.gitOnly.gitDir()).toBe(vcs.gitOnly.gitCommonDir());
    }
  });
});

describe('GSD_TEST_BACKENDS filter sanity', () => {
  it('parseBackendsEnv("jj-native") resolves cleanly after Phase 4 plan 01 D-22', async () => {
    const { parseBackendsEnv } = await import('../backends.js');
    // B-4: parseBackendsEnv returns { available, requested, unavailable }.
    // Phase 3 D-13: jj-colocated joined BACKENDS_AVAILABLE; Phase 4 plan 01
    // D-22 lands jj-native, so the lane is now an available intersection
    // (unavailable: []) rather than the empty-intersection guardrail it was
    // during the Phase 3 deferred window.
    expect(parseBackendsEnv('jj-native')).toEqual({
      available: ['jj-native'],
      requested: ['jj-native'],
      unavailable: [],
    });
  });
});
