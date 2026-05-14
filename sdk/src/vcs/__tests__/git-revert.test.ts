/**
 * git-revert.test.ts (Plan 05-01 Task 1.5)
 *
 * Coverage for vcs.gitOnly.revert({ rev, noCommit }) — the git-side revert
 * primitive consumed by sdk/src/query/revert.ts (the new SDK query shim).
 *
 * The jj backend dispatches `jj abandon` directly inside the SDK query verb
 * (destructive-semantics shift per 05-RESEARCH.md Pitfall 6) — there is no
 * parallel method to test on jj here. The gitOnly branch is reachable only
 * after `vcs.kind === 'git'` narrowing.
 *
 * Tmp-repo lifecycle pattern mirrors git-backend.test.ts:24-43.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVcsAdapter } from '../index.js';

describe('git backend: vcs.gitOnly.revert (Plan 05-01 Task 1.5)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(
      join(tmpdir(), `gsd-git-revert-${Math.random().toString(36).slice(2, 10)}-`),
    );
    execSync('git init', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
    // Disable signing — local user gitconfig may enable globally, which would
    // fail in CI / fresh checkouts without secret keys.
    execSync('git config commit.gpgsign false', { cwd: dir, stdio: 'pipe' });
    execSync('git config tag.gpgsign false', { cwd: dir, stdio: 'pipe' });
    writeFileSync(join(dir, 'a.txt'), 'hello\n');
    execSync('git add a.txt', { cwd: dir, stdio: 'pipe' });
    execSync('git commit -m "first"', { cwd: dir, stdio: 'pipe' });
    writeFileSync(join(dir, 'a.txt'), 'world\n');
    execSync('git add a.txt', { cwd: dir, stdio: 'pipe' });
    execSync('git commit -m "second"', { cwd: dir, stdio: 'pipe' });
  });

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('reverts the HEAD commit and writes an inverse-content commit', () => {
    const vcs = createVcsAdapter(dir, { kind: 'git' });
    if (vcs.kind !== 'git') throw new Error('adapter narrowing failed');
    const result = vcs.gitOnly.revert({ rev: 'HEAD', noCommit: false });
    expect(result.exitCode).toBe(0);
    const log = vcs.log({ maxCount: 3 });
    expect(log.length).toBe(3);
    expect(log[0].subject).toMatch(/^Revert /);
  });

  it('honours --no-commit (stages the revert without committing)', () => {
    const vcs = createVcsAdapter(dir, { kind: 'git' });
    if (vcs.kind !== 'git') throw new Error('adapter narrowing failed');
    const result = vcs.gitOnly.revert({ rev: 'HEAD', noCommit: true });
    expect(result.exitCode).toBe(0);
    const log = vcs.log({ maxCount: 3 });
    // No new commit — log length unchanged.
    expect(log.length).toBe(2);
    // Status shows staged changes from the revert.
    const status = vcs.status({ porcelain: true });
    expect(status.entries.length).toBeGreaterThan(0);
  });
});
