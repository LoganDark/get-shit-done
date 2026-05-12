/**
 * Phase 3 plan 03-01 Task 3: jj.ts skeleton + parser stub tests.
 *
 * Verifies:
 *   - createJjAdapter returns a frozen JjVcsAdapter with kind='jj' + cwd.
 *   - Every contract verb throws VcsNotImplementedError (D-08 stub shape).
 *   - refs.head / refs.parent are pure revexprs (no throw).
 *   - The returned adapter has NO gitOnly property (JjVcsAdapter contract).
 *   - Parser stubs return [] on empty input.
 */

import { describe, it, expect } from 'vitest';
import { createJjAdapter } from '../backends/jj.js';
import { expr } from '../expr.js';
import { __vcsTestOnly, VcsNotImplementedError } from '../types.js';
import { parseJjLog } from '../parse/jj-log.js';
import { parseJjOpLog } from '../parse/jj-op-log.js';
import { parseJjWorkspaceList } from '../parse/jj-workspace-list.js';

describe('Phase 3 plan 03-01: jj.ts skeleton', () => {
  const vcs = createJjAdapter('/tmp/never-exists');

  it('has kind=jj and the requested cwd', () => {
    expect(vcs.kind).toBe('jj');
    expect(vcs.cwd).toBe('/tmp/never-exists');
  });

  it('has no gitOnly property', () => {
    expect('gitOnly' in vcs).toBe(false);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(vcs)).toBe(true);
  });

  it('refs.head and refs.parent are revexprs (no throw)', () => {
    expect(vcs.refs.head).toBe(expr.head());
    expect(vcs.refs.parent).toBe(expr.parent());
  });

  // Top-level verbs
  // Phase 3 plan 03-04 landed the real squash-based commit body. Against a
  // non-existent cwd (`/tmp/never-exists`) it no longer throws
  // VcsNotImplementedError — it spawns jj which returns a non-zero exitCode.
  // The integration suite in jj-commit.test.ts covers the happy path.
  it('commit() does not throw VcsNotImplementedError (wired in plan 03-04)', () => {
    // amend: true still throws VcsNotImplementedError per RESEARCH §Q5; the
    // default (non-amend) path must not.
    expect(() => vcs.commit({ message: 'x' })).not.toThrow(VcsNotImplementedError);
  });
  it('commit({amend:true}) still throws VcsNotImplementedError (deferred per RESEARCH §Q5)', () => {
    expect(() => vcs.commit({ message: 'x', amend: true })).toThrow(
      VcsNotImplementedError,
    );
  });
  // Phase 3 plan 03-05 Task 1 landed log/status/diff bodies — the verbs no
  // longer throw VcsNotImplementedError. They may throw VcsExecError when the
  // spawned `jj` binary fails (e.g., cwd /tmp/never-exists), but that's a
  // different class. Mirrors the not-throw-VcsNotImplementedError pattern
  // from plan 03-04's commit-wired test.
  it('log() does not throw VcsNotImplementedError (wired in plan 03-05)', () => {
    expect(() => {
      try { vcs.log(); } catch (e) {
        if (e instanceof VcsNotImplementedError) throw e;
        // Any other error (e.g. VcsExecError from a missing-jj path) is fine.
      }
    }).not.toThrow(VcsNotImplementedError);
  });
  it('status() does not throw VcsNotImplementedError (wired in plan 03-05)', () => {
    expect(() => {
      try { vcs.status(); } catch (e) {
        if (e instanceof VcsNotImplementedError) throw e;
      }
    }).not.toThrow(VcsNotImplementedError);
  });
  it('diff() does not throw VcsNotImplementedError (wired in plan 03-05)', () => {
    expect(() => {
      try { vcs.diff(); } catch (e) {
        if (e instanceof VcsNotImplementedError) throw e;
      }
    }).not.toThrow(VcsNotImplementedError);
  });
  it('findConflicts() throws VcsNotImplementedError', () => {
    expect(() => vcs.findConflicts({ scope: 'all' })).toThrow(VcsNotImplementedError);
  });
  it('push() throws VcsNotImplementedError', () => {
    expect(() => vcs.push()).toThrow(VcsNotImplementedError);
  });
  it('fetch() throws VcsNotImplementedError', () => {
    expect(() => vcs.fetch()).toThrow(VcsNotImplementedError);
  });

  // refs.bookmarks namespace
  // Phase 3 plan 03-03 landed real bodies for list/create/move/delete/exists.
  // Against a non-existent cwd (`/tmp/never-exists`) they no longer throw
  // VcsNotImplementedError — they either spawn jj (returning a non-zero
  // exitCode) or return falsy (exists is exit-0 + non-empty stdout, both fail
  // here). The integration suite in jj-refs.test.ts covers the happy path.
  // `switch` stays VcsNotImplementedError per the audit (03-03-AUDIT.md).
  it('refs.bookmarks.list() does not throw VcsNotImplementedError (wired in plan 03-03)', () => {
    // Probe lifecycle only — the call may throw VcsExecError, not the stub error.
    expect(() => vcs.refs.bookmarks.list()).not.toThrow(VcsNotImplementedError);
  });
  it('refs.bookmarks.create() does not throw VcsNotImplementedError (wired in plan 03-03)', () => {
    expect(() => vcs.refs.bookmarks.create('x', expr.head())).not.toThrow(VcsNotImplementedError);
  });
  it('refs.bookmarks.move() does not throw VcsNotImplementedError (wired in plan 03-03)', () => {
    expect(() => vcs.refs.bookmarks.move('x', expr.head())).not.toThrow(VcsNotImplementedError);
  });
  it('refs.bookmarks.delete() does not throw VcsNotImplementedError (wired in plan 03-03)', () => {
    expect(() => vcs.refs.bookmarks.delete('x')).not.toThrow(VcsNotImplementedError);
  });
  it('refs.bookmarks.exists() does not throw VcsNotImplementedError (wired in plan 03-03)', () => {
    // exists returns boolean — no throw on non-zero exit. Just confirm no stub throw.
    expect(() => vcs.refs.bookmarks.exists('x')).not.toThrow(VcsNotImplementedError);
  });
  it('refs.bookmarks.switch() still throws VcsNotImplementedError (no jj caller — see 03-03-AUDIT.md)', () => {
    expect(() => vcs.refs.bookmarks.switch('x')).toThrow(VcsNotImplementedError);
  });

  // refs.* other — same lifecycle. switch + isIgnored stay stub-throws.
  it('refs.currentBookmarks() does not throw VcsNotImplementedError (wired in plan 03-03)', () => {
    expect(() => vcs.refs.currentBookmarks()).not.toThrow(VcsNotImplementedError);
  });
  it('refs.resolveShort() does not throw VcsNotImplementedError (wired in plan 03-03)', () => {
    expect(() => vcs.refs.resolveShort(expr.head())).not.toThrow(VcsNotImplementedError);
  });
  it('refs.countCommits() does not throw VcsNotImplementedError (wired in plan 03-03)', () => {
    expect(() => vcs.refs.countCommits({})).not.toThrow(VcsNotImplementedError);
  });
  it('refs.rootCommits() does not throw VcsNotImplementedError (wired in plan 03-03)', () => {
    expect(() => vcs.refs.rootCommits({})).not.toThrow(VcsNotImplementedError);
  });
  it('refs.exists() does not throw VcsNotImplementedError (wired in plan 03-03)', () => {
    expect(() => vcs.refs.exists(expr.head())).not.toThrow(VcsNotImplementedError);
  });
  it('refs.isIgnored() still throws VcsNotImplementedError (no jj caller — see 03-03-AUDIT.md)', () => {
    expect(() => vcs.refs.isIgnored('x')).toThrow(VcsNotImplementedError);
  });
  it('refs.remotes() does not throw VcsNotImplementedError (wired in plan 03-03)', () => {
    expect(() => vcs.refs.remotes()).not.toThrow(VcsNotImplementedError);
  });

  // workspace
  it('workspace.add() throws VcsNotImplementedError', () => {
    expect(() => vcs.workspace.add({ path: '/x' })).toThrow(VcsNotImplementedError);
  });
  it('workspace.forget() throws VcsNotImplementedError', () => {
    expect(() => vcs.workspace.forget('/x')).toThrow(VcsNotImplementedError);
  });
  it('workspace.list() throws VcsNotImplementedError', () => {
    expect(() => vcs.workspace.list()).toThrow(VcsNotImplementedError);
  });
  it('workspace.context() throws VcsNotImplementedError', () => {
    expect(() => vcs.workspace.context()).toThrow(VcsNotImplementedError);
  });
  it('workspace.prune() throws VcsNotImplementedError', () => {
    expect(() => vcs.workspace.prune()).toThrow(VcsNotImplementedError);
  });

  // __vcsTestOnly
  // Phase 3 plan 03-02 landed the real `jj op log`/`jj op restore` body.
  // On a non-existent cwd (`/tmp/never-exists`), snapshot() now throws the
  // typed VcsExecError instead of VcsNotImplementedError. The integration
  // suite in jj-snapshot-restore.test.ts covers the happy-path against
  // real jj 0.41; here we only verify that the verbs ARE wired (no longer
  // stub-throwing) and the kind-mismatch guard on restore() is in place.
  it('__vcsTestOnly.snapshot/restore are wired (no longer VcsNotImplementedError)', () => {
    const t = (vcs as any)[__vcsTestOnly];
    expect(() => t.snapshot()).not.toThrow(VcsNotImplementedError);
    expect(() => t.restore({ id: 'x', kind: 'jj' })).not.toThrow(VcsNotImplementedError);
  });
  it('__vcsTestOnly.restore rejects handle with kind mismatch', () => {
    const t = (vcs as any)[__vcsTestOnly];
    expect(() => t.restore({ id: 'x', kind: 'git' })).toThrow(/handle kind mismatch/);
  });
});

describe('Phase 3 plan 03-01: parser stubs', () => {
  it('parseJjLog returns [] for empty input', () => {
    expect(parseJjLog('')).toEqual([]);
  });
  it('parseJjOpLog returns [] for empty input', () => {
    expect(parseJjOpLog('')).toEqual([]);
  });
  it('parseJjWorkspaceList returns [] for empty input', () => {
    expect(parseJjWorkspaceList('')).toEqual([]);
  });
});
