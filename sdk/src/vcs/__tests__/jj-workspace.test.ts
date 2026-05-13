/**
 * Phase 3 plan 03-06 Task 1 — integration tests for workspace.list() and
 * workspace.context() on the jj backend (Phase 3 stubs). The other three
 * workspace verbs (add / forget / prune) still throw VcsNotImplementedError —
 * Phase 4 owns the orchestrator semantics (WS-*).
 *
 * Gating: the suite skips when `jj --version` is unavailable.
 *
 * workspace.list — uses the production parser parseJjWorkspaceList
 *                  (plan 03-02). On a fresh colocated repo it returns
 *                  [{path: 'default', rev: <40-char-hex>, locked: false}].
 *
 * workspace.context — Phase 3 stub returns the literal cross-backend shape
 *                  {effectiveRoot: cwd, mode: 'main', isLinked: false}.
 *                  Phase 4 implements real multi-workspace semantics.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createJjAdapter } from '../backends/jj.js';
import { VcsNotImplementedError } from '../types.js';

let jjAvailable = false;
try {
  execSync('jj --version', { stdio: 'pipe' });
  jjAvailable = true;
} catch {
  // jj not on PATH; entire suite skips.
}

describe.skipIf(!jjAvailable)(
  'Phase 3 plan 03-06 Task 1 — workspace.list() on jj (live)',
  () => {
    let dir: string;
    let vcs: ReturnType<typeof createJjAdapter>;

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'gsd-vcs-ws-list-'));
      execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
      execSync('jj config set --repo user.email "test@test.com"', {
        cwd: dir,
        stdio: 'pipe',
      });
      execSync('jj config set --repo user.name "Test"', {
        cwd: dir,
        stdio: 'pipe',
      });
      writeFileSync(join(dir, 'seed.txt'), 'seed\n');
      execSync('jj squash -B @ -k -m "seed"', { cwd: dir, stdio: 'pipe' });
      vcs = createJjAdapter(dir);
    });

    afterAll(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    it('returns exactly one entry on a fresh single-workspace repo', () => {
      const entries = vcs.workspace.list();
      expect(entries).toHaveLength(1);
    });

    it('the single entry has path === "default"', () => {
      const [entry] = vcs.workspace.list();
      expect(entry.path).toBe('default');
    });

    it('the single entry has a 40-char hex rev', () => {
      const [entry] = vcs.workspace.list();
      expect(entry.rev).toMatch(/^[a-f0-9]{40}$/);
    });

    it('the single entry has locked === false (jj has no lock primitive)', () => {
      const [entry] = vcs.workspace.list();
      expect(entry.locked).toBe(false);
    });
  },
);

describe('Phase 3 plan 03-06 Task 1 — workspace.context() on jj (no jj needed)', () => {
  // workspace.context returns a literal stub — no jj invocation. The test
  // runs unconditionally (no skipIf gate).
  const vcs = createJjAdapter('/tmp/some-jj-workspace');

  it('returns the Phase 3 stub shape literally', () => {
    expect(vcs.workspace.context()).toEqual({
      effectiveRoot: '/tmp/some-jj-workspace',
      mode: 'main',
      isLinked: false,
    });
  });

  it('returns a frozen object (immutable cross-backend contract)', () => {
    expect(Object.isFrozen(vcs.workspace.context())).toBe(true);
  });

  it('effectiveRoot exactly equals the adapter cwd', () => {
    const cwd = '/tmp/another-workspace';
    const v = createJjAdapter(cwd);
    expect(v.workspace.context().effectiveRoot).toBe(cwd);
  });
});

describe('Phase 4 plan 04-01 — workspace.add/forget/prune real bodies + reap/acquireWriteLock stubs', () => {
  const vcs = createJjAdapter('/tmp/some-jj-workspace');

  it('workspace.add does not throw VcsNotImplementedError (wired in plan 04-01)', () => {
    // Plan 04-01 replaced the Phase 3 stub with mkdir -p + jj workspace add.
    // Against a non-existent cwd the call will throw a generic Error from
    // either the mkdirSync (EACCES on /x) or from non-zero jj exitCode —
    // the stub-error class is the one we forbid.
    expect(() => {
      try { vcs.workspace.add({ path: '/x' }); } catch (e) {
        if (e instanceof VcsNotImplementedError) throw e;
      }
    }).not.toThrow(VcsNotImplementedError);
  });

  it('workspace.forget does not throw VcsNotImplementedError (wired in plan 04-01)', () => {
    expect(() => {
      try { vcs.workspace.forget('/x'); } catch (e) {
        if (e instanceof VcsNotImplementedError) throw e;
      }
    }).not.toThrow(VcsNotImplementedError);
  });

  it('workspace.prune is a documented success no-op (plan 04-01 D-29; jj has no `workspace prune`)', () => {
    expect(() => vcs.workspace.prune()).not.toThrow();
    const r = vcs.workspace.prune();
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe('');
  });

  it('workspace.reap still throws VcsNotImplementedError (Phase 4 plan 04 owns the real body)', () => {
    expect(() =>
      vcs.workspace.reap({ phaseNamePrefix: 'phase-04-subagent-', phaseDir: '/x' }),
    ).toThrow(VcsNotImplementedError);
  });

  it('acquireWriteLock still throws VcsNotImplementedError (Phase 4 plan 03 owns the real body)', () => {
    expect(() => vcs.acquireWriteLock('/x')).toThrow(VcsNotImplementedError);
  });
});
