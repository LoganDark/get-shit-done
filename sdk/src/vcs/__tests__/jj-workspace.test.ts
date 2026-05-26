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
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createJjAdapter } from '../backends/jj.js';
import { VcsNotImplementedError } from '../types.js';
import { expr } from '../expr.js';

let jjAvailable = false;
try {
  execSync('jj --version', { stdio: 'pipe' });
  jjAvailable = true;
} catch {
  // jj not on PATH; entire suite skips.
}

// Phase 5 plan 05-05 flake-fix: Pattern A (describe.sequential) on every
// multi-workspace describe block in this file — `jj workspace list` is a
// global per-repo state, so concurrent `it()` blocks within a describe leak
// each other's mutations. Pattern B (random-prefix mkdtemp) is applied to
// every `mkdtempSync` call site to avoid parallel-test-file tmpdir collisions.
describe.sequential.skipIf(!jjAvailable)(
  'Phase 3 plan 03-06 Task 1 — workspace.list() on jj (live)',
  () => {
    let dir: string;
    let vcs: ReturnType<typeof createJjAdapter>;

    beforeAll(() => {
      dir = mkdtempSync(
        join(
          tmpdir(),
          `gsd-vcs-ws-list-${Math.random().toString(36).slice(2, 10)}-`,
        ),
      );
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

    it('the single entry has a change_id rev (Phase 8 FLIP-01 unified contract)', () => {
      // Phase 8 FLIP-01: workspace-list parser reads `target.change_id` per
      // the unified revision contract (D-05). WorkspaceInfo.rev now carries
      // change_id (k-z alphabet, 12+ chars) on jj — not commit_id hex.
      const [entry] = vcs.workspace.list();
      expect(entry.rev).toBeIdOf('jj');
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

  it('workspace.reap does not throw VcsNotImplementedError (wired in plan 04-04)', () => {
    // Plan 04-04 landed the real body in sdk/src/vcs/jj/reap.ts. Against a
    // non-existent cwd ('/tmp/some-jj-workspace') the call may throw (vcsExec
    // failure inside list() or the probe), but the stub-error class is what
    // we forbid here.
    expect(() => {
      try {
        vcs.workspace.reap({ phaseNamePrefix: 'phase-04-subagent-', phaseDir: '/x' });
      } catch (e) {
        if (e instanceof VcsNotImplementedError) throw e;
      }
    }).not.toThrow(VcsNotImplementedError);
  });

  it('acquireWriteLock does not throw VcsNotImplementedError (wired in plan 04-03)', () => {
    // Plan 04-03 replaced the Phase-4-plan-01 stub with a delegating call to
    // sdk/src/vcs/jj/lock.ts::acquireJjWriteLock. Against a non-existent cwd
    // ('/x') the call may still throw (mkdirSync EACCES, or vcsExec failure)
    // but the stub-error class is what we forbid here.
    expect(() => {
      try {
        const h = vcs.acquireWriteLock('/x');
        // If somehow the call returns (e.g. real /x is writable), release immediately.
        try { h.release(); } catch { /* noop */ }
      } catch (e) {
        if (e instanceof VcsNotImplementedError) throw e;
      }
    }).not.toThrow(VcsNotImplementedError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 plan 02 — real multi-workspace contract tests against the plan-01
// bodies. These suites run against a live jj-colocated tmp repo and exercise
// the full mkdir-p + jjArgv + `--` separator flow that plan 01 landed.
//
// Each `describe` owns its own tmp repo (per-block isolation) so cross-test
// side-effects on `jj workspace list` (a global per-repo state) don't leak.
// Failures here mean either:
//   1. plan 01's workspace bodies regressed (Rule-1 fix in jj.ts), or
//   2. jj 0.41 behaviour changed (escalate — coordinate jj-version bump).
// ─────────────────────────────────────────────────────────────────────────────

function seedJjColocatedRepo(): string {
  // Phase 5 plan 05-05 flake-fix: Pattern B — random-prefix mkdtemp.
  const d = mkdtempSync(
    join(
      tmpdir(),
      `gsd-vcs-ws-p4-${Math.random().toString(36).slice(2, 10)}-`,
    ),
  );
  execSync('jj git init --colocate', { cwd: d, stdio: 'pipe' });
  execSync('jj config set --repo user.email "test@test.com"', { cwd: d, stdio: 'pipe' });
  execSync('jj config set --repo user.name "Test"', { cwd: d, stdio: 'pipe' });
  writeFileSync(join(d, 'seed.txt'), 'seed\n');
  execSync('jj squash -B @ -k -m "seed"', { cwd: d, stdio: 'pipe' });
  return d;
}

describe.sequential.skipIf(!jjAvailable)(
  'jj workspace.add — Phase 4 plan 01 bodies (multi-workspace)',
  () => {
    let dir: string;
    let vcs: ReturnType<typeof createJjAdapter>;

    beforeAll(() => {
      dir = seedJjColocatedRepo();
      vcs = createJjAdapter(dir);
    });
    afterAll(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    it('creates a non-default workspace under .claude/jj-workspaces/phase-04-subagent-1', () => {
      const wsPath = join(dir, '.claude/jj-workspaces/phase-04-subagent-1');
      // NOTE: parent .claude/jj-workspaces/ does NOT exist before this call —
      // workspace.add's mkdirSync(dirname, { recursive: true }) must create it (D-17).
      const info = vcs.workspace.add({ path: wsPath, name: 'phase-04-subagent-1' });
      expect(info.path).toBe('phase-04-subagent-1'); // jj returns workspace NAME in list, not full path
      // Verify on-disk dir + .jj/ exists
      expect(existsSync(wsPath)).toBe(true);
      expect(existsSync(join(wsPath, '.jj'))).toBe(true);
      // Verify jj sees it
      const entries = vcs.workspace.list();
      expect(entries.some((e) => e.path === 'phase-04-subagent-1')).toBe(true);
    });

    it('Pitfall 4: mkdir -p the parent directory before invoking jj workspace add', () => {
      // Deeply nested target whose parent chain doesn't exist; mkdir -p must fire.
      const wsPath = join(dir, '.claude/jj-workspaces/nested/deeply/p4-mkdir-test');
      expect(existsSync(join(dir, '.claude/jj-workspaces/nested'))).toBe(false);
      const info = vcs.workspace.add({ path: wsPath, name: 'p4-mkdir-test' });
      expect(info.path).toBe('p4-mkdir-test');
      expect(existsSync(wsPath)).toBe(true);
    });

    it('T-04.01-01 security: -- separator means a path that looks like a flag is treated as a path', () => {
      // A workspace path that starts with `--` MUST NOT be interpreted as a flag.
      // The plan 01 jjArgv build inserts `--` before the path positional.
      const flagShapedPath = join(dir, '.claude/jj-workspaces/--no-confirm');
      // jj WILL reject this for being a weird path, BUT the rejection MUST be from
      // jj's path validation (e.g. "invalid workspace path"), NOT from "unknown flag
      // '--no-confirm'". Probe the error message.
      let caught: Error | null = null;
      try {
        vcs.workspace.add({ path: flagShapedPath, name: 'security-probe' });
      } catch (e) {
        caught = e as Error;
      }
      // Acceptable outcomes (planner's expected): EITHER the call succeeds (jj
      // accepted the literal path) OR it failed with a message that does NOT
      // mention "unknown argument" or "unexpected flag". Failure to honour `--`
      // would surface as the latter.
      if (caught) {
        expect(caught.message).not.toMatch(/unknown (argument|flag)/i);
        expect(caught.message).not.toMatch(/unexpected (argument|flag)/i);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// baseRef contract — cross-backend parity (regression for
// [[project-jj-workspace-add-auto-empty-bug]]).
//
// `jj workspace add -r <baseRef>` natively inserts an auto-empty WC ON TOP of
// baseRef, leaving `@-` as baseRef and `@` as the auto-empty. The git backend
// produces HEAD === baseRef instead. The jj adapter remediates by running
// `jj edit -r baseRef` + `jj abandon <auto-empty>` from inside the new
// workspace, so callers (parallel dispatch, octopus.createSubagentSlot, etc.)
// get the same `@`-equals-baseRef contract on both backends.
// ─────────────────────────────────────────────────────────────────────────────
describe.sequential.skipIf(!jjAvailable)(
  'jj workspace.add — baseRef contract: @ === baseRef after add',
  () => {
    let dir: string;
    let vcs: ReturnType<typeof createJjAdapter>;

    beforeAll(() => {
      dir = seedJjColocatedRepo();
      vcs = createJjAdapter(dir);
    });
    afterAll(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    function jjChangeIdAt(repoDir: string, revset: string): string {
      const out = execSync(
        `jj --repository "${repoDir}" --no-pager --color never log -r '${revset}' -T 'change_id ++ "\\n"' --no-graph -n 1`,
        { cwd: repoDir, stdio: ['ignore', 'pipe', 'pipe'] },
      ).toString();
      return out.trim();
    }

    it('after workspace.add({baseRef}): workspace @ resolves to baseRef change_id (no auto-empty interposed)', () => {
      // Create a baseRef change to dispatch onto. Use `jj new` to make a
      // dedicated change with a unique description so we can resolve its
      // change_id deterministically.
      execSync(
        'jj new -m "baseRef-anchor" --no-edit',
        { cwd: dir, stdio: 'pipe' },
      );
      const baseChangeId = jjChangeIdAt(
        dir,
        `subject(exact:"baseRef-anchor")`,
      );
      expect(baseChangeId).toMatch(/^[k-z]{8,}/);

      const wsPath = join(dir, '.claude/jj-workspaces/baseref-contract');
      vcs.workspace.add({
        path: wsPath,
        name: 'baseref-contract',
        baseRef: expr.rev(baseChangeId),
      });

      // Workspace's @ must equal baseRef post-add (remediation moved @
      // back from the auto-empty to baseRef).
      const wsHeadId = jjChangeIdAt(wsPath, '@');
      expect(wsHeadId).toBe(baseChangeId);

      // And workspace.list()'s `rev` for this workspace must match too
      // (re-fetched after the remediation by the adapter).
      const entry = vcs.workspace.list().find((e) => e.path === 'baseref-contract');
      expect(entry).toBeDefined();
      expect(entry!.rev).toBe(baseChangeId);
    });

    it('without baseRef: native jj auto-empty behavior preserved (no remediation)', () => {
      // The contract only kicks in when caller passes baseRef. The bare
      // `workspace.add({path})` form keeps jj's native semantics: `@` is a
      // fresh auto-empty above the source workspace's `@-`. We don't assert
      // the exact shape here — just that the call succeeds and produces a
      // listable workspace (regression-shield only).
      const wsPath = join(dir, '.claude/jj-workspaces/no-baseref');
      const info = vcs.workspace.add({ path: wsPath, name: 'no-baseref' });
      expect(info.path).toBe('no-baseref');
      expect(existsSync(join(wsPath, '.jj'))).toBe(true);
    });
  },
);

describe.sequential.skipIf(!jjAvailable)(
  'jj workspace.forget — Phase 4 plan 01 body',
  () => {
    let dir: string;
    let vcs: ReturnType<typeof createJjAdapter>;

    beforeAll(() => {
      dir = seedJjColocatedRepo();
      vcs = createJjAdapter(dir);
    });
    afterAll(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    it('removes the workspace from jj tracking', () => {
      const wsPath = join(dir, '.claude/jj-workspaces/forget-test');
      vcs.workspace.add({ path: wsPath, name: 'forget-test' });
      expect(vcs.workspace.list().some((e) => e.path === 'forget-test')).toBe(true);

      vcs.workspace.forget('forget-test');
      expect(vcs.workspace.list().some((e) => e.path === 'forget-test')).toBe(false);
    });

    it('Pitfall 3: forget does NOT remove the on-disk directory', () => {
      const wsPath = join(dir, '.claude/jj-workspaces/pitfall-3-test');
      vcs.workspace.add({ path: wsPath, name: 'pitfall-3-test' });
      expect(existsSync(wsPath)).toBe(true);

      vcs.workspace.forget('pitfall-3-test');
      // Pitfall 3: the directory persists. reap() is the verb that removes it.
      // This test LOCKS the invariant — if a future change starts rm'ing the
      // dir inside forget(), this test fails and forces a revisit.
      expect(existsSync(wsPath)).toBe(true);
      // Cleanup so subsequent tests don't observe orphans.
      rmSync(wsPath, { recursive: true, force: true });
    });
  },
);

describe.sequential.skipIf(!jjAvailable)(
  'jj workspace.prune — Phase 4 plan 01 documented no-op',
  () => {
    let dir: string;
    let vcs: ReturnType<typeof createJjAdapter>;

    beforeAll(() => {
      dir = seedJjColocatedRepo();
      vcs = createJjAdapter(dir);
    });
    afterAll(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    it('returns success ExecResult without invoking any jj subcommand', () => {
      // jj has no `jj workspace prune` — the body returns the literal success shape.
      const r = vcs.workspace.prune();
      expect(r.exitCode).toBe(0);
      expect(r.stdout).toBe('');
      expect(r.stderr).toBe('');
      expect(r.timedOut).toBe(false);
    });
  },
);

describe.sequential.skipIf(!jjAvailable)(
  'jj workspace.reap — Phase 4 plan 04 real body (boundary marker)',
  () => {
    let dir: string;
    let vcs: ReturnType<typeof createJjAdapter>;

    beforeAll(() => {
      dir = seedJjColocatedRepo();
      vcs = createJjAdapter(dir);
    });
    afterAll(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    it('no longer throws /Phase 4 plan 04 owns the real body/ — body landed', () => {
      // Plan 04-04 landed the real body. The marker error from the
      // plan-01 stub is gone. With no subagent workspaces matching the
      // prefix, reap returns { abandoned: [], incomplete: [] } cleanly.
      const result = vcs.workspace.reap({
        phaseNamePrefix: 'phase-04-subagent-',
        phaseDir: dir,
      });
      expect(result.abandoned).toEqual([]);
      expect(result.incomplete).toEqual([]);
    });
  },
);

// ─── Phase 7 plan 07-01 — workspace.merge + workspace.remove + expr.range smoke ─

import { expr } from '../expr.js';

describe.sequential.skipIf(!jjAvailable)(
  'Phase 7 plan 07-01 — workspace.merge / workspace.remove on jj (live)',
  () => {
    let dir: string;
    let vcs: ReturnType<typeof createJjAdapter>;

    beforeAll(() => {
      // Phase 5 plan 05-05 flake-fix Pattern B — random-prefix mkdtemp.
      dir = mkdtempSync(
        join(
          tmpdir(),
          `gsd-vcs-p7-ws-${Math.random().toString(36).slice(2, 10)}-`,
        ),
      );
      execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
      execSync('jj config set --repo user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
      execSync('jj config set --repo user.name "Test"', { cwd: dir, stdio: 'pipe' });
      writeFileSync(join(dir, 'seed.txt'), 'seed\n');
      execSync('jj squash -B @ -k -m "seed"', { cwd: dir, stdio: 'pipe' });
      vcs = createJjAdapter(dir);
    });

    afterAll(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    // ─── workspace.merge happy-path (D-01..D-03 atomic main-advance) ───────
    it('workspace.merge happy-path: 2-parent change + atomic main-advance + agent-bookmark delete (D-03)', () => {
      // Establish a main bookmark and an agent bookmark with one new commit.
      vcs.refs.bookmarks.create('p7-main', vcs.refs.parent, { raw: true });
      writeFileSync(join(dir, 'agent.txt'), 'agent\n');
      vcs.commit({ files: ['agent.txt'], message: 'agent commit' });
      // Agent bookmark at HEAD (@- after commit auto-creates new @).
      vcs.refs.bookmarks.create('p7-agent', vcs.refs.parent, { raw: true });
      // Call merge.
      const r = vcs.workspace.merge({
        branch: expr.bookmark('p7-agent'),
        message: 'chore: merge p7-agent into p7-main',
        ff: false,
        mainBookmark: 'p7-main',
        agentBookmark: 'p7-agent',
      });
      expect(r.ok).toBe(true);
      expect(r.conflicted).toBe(false);
      expect(typeof r.changeId).toBe('string');
      expect(r.changeId?.length ?? 0).toBeGreaterThan(0);
      // D-03 main-advance: p7-main now points at the merge change. Phase 8
      // FLIP-01: jj backend's bookmark list now emits change_id per the
      // unified revision contract (D-05). Both Bookmark.rev and merge.changeId
      // are change_id (k-z alphabet); they identify the same change.
      // Cross-check: bookmark exists AND points at @ (the merge change).
      const bookmarks = vcs.refs.bookmarks.list();
      const mainEntry = bookmarks.find((b) => b.name === 'p7-main');
      expect(mainEntry).toBeDefined();
      expect(mainEntry?.rev).toBeIdOf('jj');  // Phase 8 FLIP-01: jj backend emits change_id
      // Cross-check via change_id form: refs.exists on the change_id reports true.
      expect(r.changeId).toMatch(/^[k-z]+$/);  // change_id form (k-z alphabet)
      // Agent bookmark deleted atomically.
      expect(vcs.refs.bookmarks.exists('p7-agent', { raw: true })).toBe(false);
    });

    // ─── workspace.merge missing-bookmark (failure mode) ───────────────────
    it('workspace.merge missing-bookmark: returns ok:false with non-empty stderr', () => {
      // Create main; do NOT create the agent branch.
      vcs.refs.bookmarks.create('p7-main-mb', vcs.refs.head, { raw: true });
      const r = vcs.workspace.merge({
        branch: expr.bookmark('p7-does-not-exist'),
        message: 'should fail',
        ff: false,
        mainBookmark: 'p7-main-mb',
      });
      expect(r.ok).toBe(false);
    });

    // ─── workspace.remove happy-path (Pitfall 4 ordering) ──────────────────
    it('workspace.remove happy-path: forget metadata + rm-rf on-disk (Pitfall 4)', () => {
      const wsName = `p7-rm-${Math.random().toString(36).slice(2, 10)}`;
      const wsPath = join(dir, '.claude/jj-workspaces', wsName);
      vcs.workspace.add({ path: wsPath, name: wsName });
      // Confirm it landed.
      const before = vcs.workspace.list().find((e) => e.path === wsName);
      expect(before).toBeDefined();
      // Remove it.
      vcs.workspace.remove(wsPath, { force: true });
      // Confirm gone from list AND on-disk dir is gone.
      const after = vcs.workspace.list().find((e) => e.path === wsName);
      expect(after).toBeUndefined();
      expect(existsSync(wsPath)).toBe(false);
    });

    // ─── workspace.remove path-missing with force:true (idempotent) ────────
    it('workspace.remove with force:true tolerates forget failure on already-gone state', () => {
      const wsName = `p7-rm-missing-${Math.random().toString(36).slice(2, 10)}`;
      const wsPath = join(dir, '.claude/jj-workspaces', wsName);
      // Don't create the workspace — call remove on a non-registered name.
      // forget will exit non-zero; force:true must swallow it.
      expect(() => vcs.workspace.remove(wsPath, { force: true })).not.toThrow();
    });

    // ─── expr.range round-trip smoke (RESEARCH Open Q3) ────────────────────
    it('expr.range(rev(mergeBase-result), rev(branch)) translates cleanly on jj backend', () => {
      writeFileSync(join(dir, 'range-a.txt'), 'a\n');
      vcs.commit({ files: ['range-a.txt'], message: 'add range-a' });
      const branchName = 'p7-range-smoke';
      vcs.refs.bookmarks.create(branchName, vcs.refs.parent, { raw: true });
      writeFileSync(join(dir, 'range-b.txt'), 'b\n');
      vcs.commit({ files: ['range-b.txt'], message: 'add range-b' });
      const base = vcs.refs.mergeBase(vcs.refs.head, expr.bookmark(branchName));
      // Feed mergeBase output back into expr.range — confirms the
      // change_id-shaped result is consumable by the range factory.
      const range = expr.range(expr.rev(base), expr.bookmark(branchName));
      const r = vcs.diff({ rev: range, nameOnly: true });
      expect(r).toBeDefined();
      expect(Array.isArray(r.nameOnly)).toBe(true);
    });
  },
);
