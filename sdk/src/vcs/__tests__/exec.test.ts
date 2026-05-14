/**
 * vcs/exec unit tests.
 * Asserts the 5-field ExecResult shape, default-timeout binding, execGit convenience,
 * and VcsExecError field preservation. Tests use a tmp dir so byte-identity smoke tests
 * (`git --version`) do not depend on the project repo state.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { vcsExec, execGit, VcsExecError, DEFAULT_VCS_TIMEOUT_MS } from '../exec.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'gsd-vcs-exec-'));
  // git init so `git --version` (and any other git invocations) have a real repo to run against.
  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('vcsExec', () => {
  it('returns the 5-field shape on success (`true` exits 0 cleanly)', () => {
    const result = vcsExec(tmpDir, 'true', []);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(result.timedOut).toBe(false);
    expect(result.error).toBeNull();
  });

  it('returns non-zero exitCode and null error for `false`', () => {
    const result = vcsExec(tmpDir, 'false', []);
    expect(result.exitCode).not.toBe(0);
    expect(result.error).toBeNull();
    expect(result.timedOut).toBe(false);
  });

  it('exposes DEFAULT_VCS_TIMEOUT_MS as the canonical 10s default', () => {
    expect(DEFAULT_VCS_TIMEOUT_MS).toBe(10000);
  });
});

describe('execGit', () => {
  it('runs `git --version` against a tmp git repo and returns exitCode 0 + stdout containing "git version"', () => {
    const result = execGit(tmpDir, ['--version']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('git version');
    expect(result.timedOut).toBe(false);
    expect(result.error).toBeNull();
    // 5-field shape is intact.
    for (const f of ['exitCode', 'stdout', 'stderr', 'timedOut', 'error'] as const) {
      expect(f in result).toBe(true);
    }
  });
});

describe('VcsExecError', () => {
  it('preserves all 6 fields (message + 5) as readonly properties', () => {
    const err = new VcsExecError('git rev-parse failed', {
      exitCode: 128,
      stdout: '',
      stderr: 'fatal: not a git repository',
      timedOut: false,
      args: ['rev-parse', 'HEAD'],
    });
    expect(err.message).toBe('git rev-parse failed');
    expect(err.name).toBe('VcsExecError');
    expect(err.exitCode).toBe(128);
    expect(err.stdout).toBe('');
    expect(err.stderr).toBe('fatal: not a git repository');
    expect(err.timedOut).toBe(false);
    expect(err.args).toEqual(['rev-parse', 'HEAD']);
    expect(err).toBeInstanceOf(Error);
  });
});
