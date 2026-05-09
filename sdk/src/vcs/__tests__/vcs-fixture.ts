/**
 * vitest test fixture for the VcsAdapter contract suite.
 * D-13: per-describe tmp repo + snapshot/restore between tests.
 * D-14: snapshot/restore via the __vcsTestOnly symbol-gated namespace.
 * D-15: shares BACKENDS_AVAILABLE / parseBackendsEnv with tests/helpers.cjs via the TS source.
 */

import { test as base, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createVcsAdapter } from '../index.js';
import { BACKENDS_AVAILABLE, parseBackendsEnv } from '../backends.js';
import { __vcsTestOnly } from '../types.js';
import type { VcsAdapter, VcsBackendKey, SnapshotHandle } from '../types.js';

export interface VcsFixture { vcs: VcsAdapter; cwd: string; }

function initGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gsd-vcs-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  execSync('git config commit.gpgsign false', { cwd: dir, stdio: 'pipe' });
  execSync('git config tag.gpgsign false', { cwd: dir, stdio: 'pipe' });
  execSync('git commit --allow-empty -m initial', { cwd: dir, stdio: 'pipe' });
  return dir;
}

export function makeBackendFixture(kind: VcsBackendKey) {
  let sharedDir: string | null = null;
  let sharedAdapter: VcsAdapter | null = null;
  let snapshotHandle: SnapshotHandle | null = null;

  const fixture = base.extend<VcsFixture>({
    cwd: async ({}, use) => {
      if (!sharedDir) throw new Error('sharedDir not initialized — setupHooks() not called?');
      await use(sharedDir);
    },
    vcs: async ({}, use) => {
      if (!sharedAdapter) throw new Error('sharedAdapter not initialized — setupHooks() not called?');
      await use(sharedAdapter);
    },
  });

  function setupHooks(): void {
    beforeAll(() => {
      // W-5: initGitRepo() runs `git init` + author config + an initial empty commit.
      // The snapshot is taken AFTER that initial commit, so every test in this describe
      // block starts from a "git init + initial empty commit" baseline. This matches D-13
      // ("snapshots clean state at block start"). beforeEach restores to this same state
      // between tests.
      if (kind !== 'git') {
        throw new Error(`backend '${kind}' not yet implemented in Phase 1 (BACKENDS_AVAILABLE=${BACKENDS_AVAILABLE.join(',')})`);
      }
      sharedDir = initGitRepo();
      sharedAdapter = createVcsAdapter(sharedDir, { kind: 'git' });
      const testApi = (sharedAdapter as any)[__vcsTestOnly];
      // Snapshot AFTER initial empty commit (W-5).
      snapshotHandle = testApi.snapshot();
    });
    beforeEach(() => {
      if (sharedAdapter && snapshotHandle) {
        const testApi = (sharedAdapter as any)[__vcsTestOnly];
        testApi.restore(snapshotHandle);
      }
    });
    afterAll(() => {
      if (sharedDir) rmSync(sharedDir, { recursive: true, force: true });
      sharedDir = null;
      sharedAdapter = null;
      snapshotHandle = null;
    });
  }

  return { test: fixture, setupHooks };
}

export function selectedBackends(): VcsBackendKey[] {
  const result = parseBackendsEnv(process.env.GSD_TEST_BACKENDS);
  // B-4 fix: warn when the user asked for backends none of which are available
  // (the silent-zero-test green run that violated TEST-03/TEST-04).
  if (result.requested.length > 0 && result.available.length === 0) {
    const msg = `[GSD_TEST_BACKENDS] requested ${JSON.stringify(result.requested)} but none are in BACKENDS_AVAILABLE (${JSON.stringify(BACKENDS_AVAILABLE)}); 0 tests will run. Unavailable: ${JSON.stringify(result.unavailable)}.`;
    if (process.env.CI === 'true') {
      // Under CI, an empty resolved set with non-empty requested set is a hard error —
      // CI should never silently green on zero-test runs.
      throw new Error(msg);
    }
    // Locally, just warn so the developer notices.
    process.stderr.write(`WARN ${msg}\n`);
  }
  return result.available;
}

export { __vcsTestOnly };
