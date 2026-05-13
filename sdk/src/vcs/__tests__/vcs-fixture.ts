/**
 * vitest test fixture for the VcsAdapter contract suite.
 * D-13: per-describe tmp repo + snapshot/restore between tests.
 * D-14: snapshot/restore via the __vcsTestOnly symbol-gated namespace.
 * D-15: shares BACKENDS_AVAILABLE / parseBackendsEnv with tests/helpers.cjs via the TS source.
 *
 * Phase 3 plan 03-01 Task 5: jj-colocated lane added — initJjRepo() seeds
 * a colocated tmp repo via `jj git init --colocate`. snapshot/restore on
 * jj-colocated is gated by the BACKENDS_AVAILABLE_FOR_VERB allowlist
 * (per-verb throw-not-skip per D-12), so plan 03-01's stub-throwing
 * adapter does not break the contract suite's describe-block teardown.
 * Plan 03-02 lands the real snapshot/restore body and flips the allowlist.
 */

import { test as base, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createVcsAdapter } from '../index.js';
import {
  BACKENDS_AVAILABLE,
  BACKENDS_AVAILABLE_FOR_VERB,
  parseBackendsEnv,
} from '../backends.js';
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

function initJjRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gsd-vcs-jj-'));
  // Colocated init — creates both .git and .jj. The adapter resolves to
  // jj per D-17's sticky preference, but the test passes kind: 'jj' explicitly
  // so resolveKind takes the opts.kind branch and we don't need a config.
  execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
  execSync('jj config set --repo user.email "test@test.com"', {
    cwd: dir,
    stdio: 'pipe',
  });
  execSync('jj config set --repo user.name "Test"', {
    cwd: dir,
    stdio: 'pipe',
  });
  // No "initial empty commit" needed — jj's `@` is born as an empty working-copy commit
  // on top of the root, equivalent semantically to the git-side initial empty commit.
  return dir;
}

function initJjNativeRepo(): string {
  // Phase 4 plan 01 (D-22): non-colocated jj fixture. Empirically verified
  // against jj 0.41.0: `--colocate` is the default, so `--no-colocate` is
  // required to suppress `.git` creation. Mirrors tests/helpers.cjs's
  // jj-native branch.
  const dir = mkdtempSync(join(tmpdir(), 'gsd-vcs-jj-native-'));
  execSync('jj git init --no-colocate', { cwd: dir, stdio: 'pipe' });
  execSync('jj config set --repo user.email "test@test.com"', {
    cwd: dir,
    stdio: 'pipe',
  });
  execSync('jj config set --repo user.name "Test"', {
    cwd: dir,
    stdio: 'pipe',
  });
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
      if (kind === 'git') {
        sharedDir = initGitRepo();
        sharedAdapter = createVcsAdapter(sharedDir, { kind: 'git' });
      } else if (kind === 'jj-colocated') {
        sharedDir = initJjRepo();
        sharedAdapter = createVcsAdapter(sharedDir, { kind: 'jj' });
      } else if (kind === 'jj-native') {
        sharedDir = initJjNativeRepo();
        sharedAdapter = createVcsAdapter(sharedDir, { kind: 'jj' });
      } else {
        throw new Error(
          `backend '${kind}' not yet implemented (BACKENDS_AVAILABLE=${BACKENDS_AVAILABLE.join(',')})`
        );
      }
      // Plan 03-01: jj-colocated snapshot/restore lands in plan 03-02 (parser
      // plan owns it). Until then, the fixture probes for the verb's presence
      // in the allowlist and skips snapshot for jj-colocated. The per-verb
      // allowlist (BACKENDS_AVAILABLE_FOR_VERB) is the source of truth for
      // what is wired on each backend.
      const snapshotAvailable = (
        BACKENDS_AVAILABLE_FOR_VERB['__vcsTestOnly.snapshot'] ?? []
      ) as readonly string[];
      if (snapshotAvailable.includes(kind)) {
        const testApi = (sharedAdapter as any)[__vcsTestOnly];
        // Snapshot AFTER initial empty commit (W-5).
        snapshotHandle = testApi.snapshot();
      }
    });
    beforeEach(() => {
      if (sharedAdapter && snapshotHandle) {
        const testApi = (sharedAdapter as any)[__vcsTestOnly];
        testApi.restore(snapshotHandle);
      }
      // else: snapshot/restore not wired for this backend yet — tests in this
      // describe block see whatever state the previous test left behind. The
      // BACKENDS_AVAILABLE_FOR_VERB gate ensures no contract test runs verbs
      // unwired on the target backend (throw-not-skip per D-12).
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
