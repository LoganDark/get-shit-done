/**
 * createVcsAdapter factory tests.
 * Auto-detect, env override, frozen stub, jj-not-yet-implemented gate.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { createVcsAdapter } from '../index.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'gsd-vcs-index-'));
  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  // Don't leak GSD_VCS to neighbouring tests in the same process.
  delete process.env.GSD_VCS;
});

describe('createVcsAdapter — git backend (real, plan 03)', () => {
  it('auto-detects git and returns kind=git, cwd=tmpDir', () => {
    const vcs = createVcsAdapter(tmpDir);
    expect(vcs.kind).toBe('git');
    expect(vcs.cwd).toBe(tmpDir);
  });

  // 2.1 D-07: vcs.hooks removed from public surface; frozen-depth probe no longer
  // covers a hooks namespace. Phase 4 (HOOK-01..05) wires hook firing internally.
  it('the returned adapter is deeply frozen (refs/refs.bookmarks/workspace/gitOnly)', () => {
    const vcs = createVcsAdapter(tmpDir);
    expect(Object.isFrozen(vcs)).toBe(true);
    expect(Object.isFrozen(vcs.refs)).toBe(true);
    expect(Object.isFrozen(vcs.refs.bookmarks)).toBe(true);
    expect(Object.isFrozen(vcs.workspace)).toBe(true);
    if (vcs.kind === 'git') {
      expect(Object.isFrozen(vcs.gitOnly)).toBe(true);
    }
  });

  it('plan 03: real backend wired — gitOnly.version() returns a real `git version …` string', () => {
    const vcs = createVcsAdapter(tmpDir);
    if (vcs.kind !== 'git') throw new Error('expected git adapter');
    expect(vcs.gitOnly.version()).toMatch(/^git version /);
  });
});

describe('createVcsAdapter — jj path', () => {
  it('throws GSDError "jj backend not yet implemented" when kind=jj is forced', () => {
    expect(() => createVcsAdapter(tmpDir, { kind: 'jj' })).toThrow(
      /jj backend not yet implemented/,
    );
  });

  it('GSD_VCS=jj env override beats git auto-detect', () => {
    process.env.GSD_VCS = 'jj';
    expect(() => createVcsAdapter(tmpDir)).toThrow(/jj backend not yet implemented/);
  });
});
