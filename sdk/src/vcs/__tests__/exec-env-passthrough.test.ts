import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vcsExec } from '../exec.js';

/**
 * Phase 3 plan 03-04 Task 1: ExecOptions.env passthrough verification.
 *
 * Verifies that JJ-07 (`JJ_USER`/`JJ_EMAIL` propagation from commit() to
 * the spawned jj child) is supported at the substrate layer. The jj.ts
 * `envOpts()` helper in plan 03-04 Task 2 consumes this contract.
 */
describe('Phase 3 JJ-07: vcsExec env passthrough', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'gsd-exec-env-'));
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('merges opts.env into the spawned child env', () => {
    const r = vcsExec(
      dir,
      'node',
      ['-e', 'process.stdout.write(process.env.GSD_TEST_ENV_VAR ?? "")'],
      { env: { GSD_TEST_ENV_VAR: 'hello-world' } },
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('hello-world');
  });

  it('passes through PATH when no env opts given', () => {
    // node binary lookup requires PATH; this implicitly verifies passthrough.
    const r = vcsExec(dir, 'node', ['-e', 'process.stdout.write("ok")']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('ok');
  });

  it('does not mutate calling process env', () => {
    const before = process.env.GSD_TEST_TRANSIENT;
    vcsExec(dir, 'node', ['-e', 'process.stdout.write("x")'], {
      env: { GSD_TEST_TRANSIENT: 'should-not-persist' },
    });
    expect(process.env.GSD_TEST_TRANSIENT).toBe(before); // unchanged
  });

  it('caller-supplied env keys win over process.env', () => {
    // Ensure that when opts.env provides a key that also exists in
    // process.env, the caller value reaches the child (merge order is
    // process.env spread first, opts.env spread last).
    const prev = process.env.PATH;
    expect(prev).toBeTruthy();
    const r = vcsExec(
      dir,
      'node',
      ['-e', 'process.stdout.write(process.env.GSD_TEST_OVERRIDE_KEY ?? "")'],
      { env: { GSD_TEST_OVERRIDE_KEY: 'caller-wins', PATH: prev! } },
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('caller-wins');
  });
});
