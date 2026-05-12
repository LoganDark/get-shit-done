/**
 * Phase 3 plan 03-06 Task 1 — integration tests for push() / fetch() on
 * the jj backend. Runs against real jj 0.41 in a tmp colocated repo plus a
 * tmp bare-repo destination so push has an actual remote to talk to.
 *
 * Gating: the suite skips when `jj --version` is unavailable
 * (`describe.skipIf(!jjAvailable)`).
 *
 * Empirical findings (recorded in 03-06-SUMMARY.md):
 *   - `jj git push` has NO `--force-with-lease` flag. jj's default push
 *     behavior IS already force-with-lease semantics ("safety checks"
 *     per `jj git push --help`). `opts.force` is therefore a documented
 *     no-op on jj — accepted on the cross-backend surface for parity,
 *     but adds NO flag to the argv.
 *   - `--bookmark <name>` (short `-b`) IS the correct selectivity flag.
 *   - `--remote <name>` exists on both push and fetch.
 *   - `jj git fetch` has `-b/--branch` (glob filter on bookmark names) but
 *     RESEARCH A6 says treat opts.ref as no-op since it has no per-ref
 *     selectivity in the git-style sense. Verified empirically: opts.ref
 *     adds no argv on jj fetch.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createJjAdapter } from '../backends/jj.js';
import { expr } from '../expr.js';
import { __vcsTestOnly } from '../types.js';

let jjAvailable = false;
try {
  execSync('jj --version', { stdio: 'pipe' });
  jjAvailable = true;
} catch {
  // jj not on PATH; entire suite skips.
}

describe.skipIf(!jjAvailable)(
  'Phase 3 plan 03-06 Task 1 — push() on jj (live)',
  () => {
    let workDir: string;
    let bareDir: string;
    let vcs: ReturnType<typeof createJjAdapter>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let snapshotHandle: any;

    beforeAll(() => {
      workDir = mkdtempSync(join(tmpdir(), 'gsd-vcs-push-work-'));
      bareDir = mkdtempSync(join(tmpdir(), 'gsd-vcs-push-bare-'));
      // Bare destination via raw git is allowed inside test bodies (lint
      // allowlist covers tests/__tools__ and sdk/src/vcs/__tests__/ for
      // bootstrap fixture seeding — same pattern as jj-refs.test.ts:122).
      // Bootstrap is a TEST setup, not adapter code, so JJ-03 invariant
      // ("no raw git in the adapter") is unaffected.
      execSync('git init --bare', { cwd: bareDir, stdio: 'pipe' });
      execSync('jj git init --colocate', { cwd: workDir, stdio: 'pipe' });
      execSync('jj config set --repo user.email "test@test.com"', {
        cwd: workDir,
        stdio: 'pipe',
      });
      execSync('jj config set --repo user.name "Test"', {
        cwd: workDir,
        stdio: 'pipe',
      });
      // Seed a commit + a bookmark so there's something to push.
      writeFileSync(join(workDir, 'seed.txt'), 'seed\n');
      execSync('jj squash -B @ -k -m "seed commit"', {
        cwd: workDir,
        stdio: 'pipe',
      });
      execSync('jj bookmark create gsd/main -r @-', {
        cwd: workDir,
        stdio: 'pipe',
      });
      // Wire the bare repo as a jj-tracked git remote.
      execSync(`jj git remote add origin ${bareDir}`, {
        cwd: workDir,
        stdio: 'pipe',
      });
      vcs = createJjAdapter(workDir);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      snapshotHandle = (vcs as any)[__vcsTestOnly].snapshot();
    });

    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vcs as any)[__vcsTestOnly].restore(snapshotHandle);
    });

    afterAll(() => {
      if (workDir) rmSync(workDir, { recursive: true, force: true });
      if (bareDir) rmSync(bareDir, { recursive: true, force: true });
    });

    it('push() with no opts returns an ExecResult (no throw on adapter)', () => {
      const r = vcs.push();
      // ExecResult shape — we don't care about exitCode here (jj may
      // refuse to push the seed bookmark without explicit selection); we
      // just want to confirm push() returns the typed shape rather than
      // throwing.
      expect(r).toMatchObject({
        exitCode: expect.any(Number),
        stdout: expect.any(String),
        stderr: expect.any(String),
      });
    });

    it('push({remote: "origin"}) returns an ExecResult', () => {
      const r = vcs.push({ remote: 'origin' });
      expect(r).toMatchObject({
        exitCode: expect.any(Number),
        stdout: expect.any(String),
        stderr: expect.any(String),
      });
    });

    it('push({remote, ref: bookmark}) pushes the bookmark and succeeds', () => {
      // The bookmark `gsd/main` exists (seeded in beforeAll). Passing
      // `expr.bookmark('gsd/main')` translates via toJjRev to the literal
      // name `gsd/main`, which is bookmark-like and lands as `--bookmark gsd/main`.
      const ref = expr.bookmark('gsd/main');
      const r = vcs.push({ remote: 'origin', ref });
      expect(r.exitCode).toBe(0);
    });

    it('push({force: true}) does not throw — force is a documented no-op on jj', () => {
      // jj's default push IS already force-with-lease; opts.force adds no
      // flag. Test that the call returns an ExecResult shape regardless.
      const r = vcs.push({ remote: 'origin', force: true });
      expect(r).toMatchObject({
        exitCode: expect.any(Number),
        stdout: expect.any(String),
        stderr: expect.any(String),
      });
    });
  },
);

describe.skipIf(!jjAvailable)(
  'Phase 3 plan 03-06 Task 1 — fetch() on jj (live)',
  () => {
    let workDir: string;
    let bareDir: string;
    let vcs: ReturnType<typeof createJjAdapter>;

    beforeAll(() => {
      workDir = mkdtempSync(join(tmpdir(), 'gsd-vcs-fetch-work-'));
      bareDir = mkdtempSync(join(tmpdir(), 'gsd-vcs-fetch-bare-'));
      execSync('git init --bare', { cwd: bareDir, stdio: 'pipe' });
      execSync('jj git init --colocate', { cwd: workDir, stdio: 'pipe' });
      execSync('jj config set --repo user.email "test@test.com"', {
        cwd: workDir,
        stdio: 'pipe',
      });
      execSync('jj config set --repo user.name "Test"', {
        cwd: workDir,
        stdio: 'pipe',
      });
      execSync(`jj git remote add origin ${bareDir}`, {
        cwd: workDir,
        stdio: 'pipe',
      });
      vcs = createJjAdapter(workDir);
    });

    afterAll(() => {
      if (workDir) rmSync(workDir, { recursive: true, force: true });
      if (bareDir) rmSync(bareDir, { recursive: true, force: true });
    });

    it('fetch() with no opts returns an ExecResult', () => {
      const r = vcs.fetch();
      expect(r).toMatchObject({
        exitCode: expect.any(Number),
        stdout: expect.any(String),
        stderr: expect.any(String),
      });
    });

    it('fetch({remote: "origin"}) returns an ExecResult and succeeds against empty bare', () => {
      const r = vcs.fetch({ remote: 'origin' });
      // jj fetch against an empty bare repo exits 0 (nothing to do).
      expect(r.exitCode).toBe(0);
    });

    it('fetch({ref}) does not throw — opts.ref is a documented no-op on jj', () => {
      // Per RESEARCH A6 + empirical: opts.ref adds no argv to jj fetch.
      const r = vcs.fetch({ remote: 'origin', ref: 'main' });
      expect(r).toMatchObject({
        exitCode: expect.any(Number),
      });
    });
  },
);
