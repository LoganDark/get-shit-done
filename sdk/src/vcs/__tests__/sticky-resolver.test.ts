/**
 * Phase 3 plan 03-01 Task 4: D-17 sticky vcs.adapter resolver tests.
 *
 * Verifies the 4-level resolution priority for `createVcsAdapter`:
 *   1. opts.kind explicit (caller override)
 *   2. GSD_VCS env override (Phase 1 VCS-03)
 *   3. .planning/config.json `vcs.adapter` ('git' | 'jj' | 'auto')
 *   4. Filesystem detect — D-17 reverses Phase 1 D-04 so git wins ties in
 *      the colocated case (.git + .jj both present).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createVcsAdapter } from '../index.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'gsd-vcs-resolver-'));
}

function writeConfig(dir: string, adapter: 'git' | 'jj' | 'auto'): void {
  mkdirSync(join(dir, '.planning'), { recursive: true });
  writeFileSync(
    join(dir, '.planning', 'config.json'),
    JSON.stringify({ vcs: { adapter } }, null, 2)
  );
}

describe('Phase 3 D-17: sticky vcs.adapter resolver', () => {
  let dir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    dir = tempDir();
    originalEnv = process.env.GSD_VCS;
    delete process.env.GSD_VCS;
  });

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env.GSD_VCS;
    else process.env.GSD_VCS = originalEnv;
  });

  it('opts.kind explicit overrides everything', () => {
    process.env.GSD_VCS = 'git';
    writeConfig(dir, 'git');
    const vcs = createVcsAdapter(dir, { kind: 'jj' });
    expect(vcs.kind).toBe('jj');
  });

  it('GSD_VCS env override beats sticky config', () => {
    process.env.GSD_VCS = 'git';
    writeConfig(dir, 'jj');
    const vcs = createVcsAdapter(dir);
    expect(vcs.kind).toBe('git');
  });

  it('GSD_VCS=jj env returns jj backend', () => {
    process.env.GSD_VCS = 'jj';
    const vcs = createVcsAdapter(dir);
    expect(vcs.kind).toBe('jj');
  });

  it('sticky config value "jj" resolves to jj backend', () => {
    writeConfig(dir, 'jj');
    const vcs = createVcsAdapter(dir);
    expect(vcs.kind).toBe('jj');
  });

  it('sticky config "auto" + colocated (.git + .jj) defaults to git (D-17)', () => {
    writeConfig(dir, 'auto');
    execSync('git init', { cwd: dir, stdio: 'pipe' });
    mkdirSync(join(dir, '.jj'), { recursive: true });
    const vcs = createVcsAdapter(dir);
    expect(vcs.kind).toBe('git');
  });

  it('sticky config "auto" + only .jj returns jj backend', () => {
    writeConfig(dir, 'auto');
    mkdirSync(join(dir, '.jj'), { recursive: true });
    const vcs = createVcsAdapter(dir);
    expect(vcs.kind).toBe('jj');
  });

  it('sticky config "auto" + only .git returns git backend', () => {
    writeConfig(dir, 'auto');
    execSync('git init', { cwd: dir, stdio: 'pipe' });
    const vcs = createVcsAdapter(dir);
    expect(vcs.kind).toBe('git');
  });

  it('absent config + nothing detected defaults to git (greenfield)', () => {
    const vcs = createVcsAdapter(dir);
    expect(vcs.kind).toBe('git');
  });

  it('malformed config.json swallows error and falls through to detection', () => {
    mkdirSync(join(dir, '.planning'), { recursive: true });
    writeFileSync(join(dir, '.planning', 'config.json'), 'not valid json');
    mkdirSync(join(dir, '.jj'), { recursive: true });
    const vcs = createVcsAdapter(dir);
    // No git, only .jj, no valid sticky → detection says jj
    expect(vcs.kind).toBe('jj');
  });
});
