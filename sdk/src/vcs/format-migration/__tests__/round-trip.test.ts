/**
 * format-migration/__tests__/round-trip.test.ts — real jj 0.41 binary
 * integration test against the synth-planning-fixture (jj-colocated tmpdir).
 *
 * Two `it(...)` cases per Task 2 done criteria:
 *   1. git → jj → git round-trip; final content matches baseline modulo
 *      breadcrumbs.
 *   2. Migration commit subject contains `[gsd-migrate-vcs v1]` marker AND
 *      marker-probe fast-exit yields `migrated:false` on re-run.
 *
 * Test prerequisites:
 *   - jj binary on PATH (skipped via describe.skipIf when absent)
 *   - synth-planning-fixture writes config.json with vcs.adapter='jj' by
 *     default — each `it` overwrites to 'git' first so the round-trip starts
 *     from a git-sourced state.
 *   - All synth files are uncommitted, so `runMigration` is called with
 *     `force: true` to bypass the dirty-WC pre-flight refusal.
 *
 * Why this lives under unit project (not integration):
 *   The plan named the file `round-trip.test.ts` (not `.integration.test.ts`).
 *   Real jj invocations against a tiny tmp fixture complete in well under 1s
 *   per call, so the 120s integration timeout isn't needed. Unit project's
 *   default 5s timeout is plenty.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { synthPlanningFixture } from '../../__tests__/synth-planning-fixture.js';
import { runMigration } from '../index.js';
import { MIGRATION_COMMIT_MARKER } from '../types.js';

/**
 * Detect jj binary availability at module load. Mirrors the pattern in the
 * existing probe tests (jj-children-probe.test.ts etc.) so CI lanes without
 * jj installed simply skip rather than fail.
 */
function jjAvailable(): boolean {
  try {
    execSync('jj --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
const JJ_AVAILABLE = jjAvailable();

/**
 * Overwrite the synth-fixture's seeded config.json so the round-trip starts
 * on the git side. The seed value is `{ "vcs": { "adapter": "jj" } }`; we
 * flip it to `'git'` so the first migration goes git → jj.
 */
function seedGitAdapter(dir: string): void {
  writeFileSync(
    join(dir, '.planning', 'config.json'),
    JSON.stringify({ vcs: { adapter: 'git' } }, null, 2) + '\n',
    'utf-8',
  );
}

describe.skipIf(!JJ_AVAILABLE)('Phase 6 round-trip: git → jj → git on synth-planning-fixture', () => {
  it('git → jj flips vcs.adapter, emits report, lands commit; jj → git reverses', async () => {
    const f = synthPlanningFixture('jj-colocated');
    try {
      seedGitAdapter(f.dir);

      // Snapshot baseline STATE.md content for the round-trip comparison.
      const statePath = join(f.dir, '.planning', 'STATE.md');
      const baselineState = readFileSync(statePath, 'utf-8');

      // 1st flip: git → jj.
      const r1 = await runMigration(f.dir, 'jj', { force: true });
      expect(r1.ok).toBe(true);
      expect(r1.newAdapter).toBe('jj');
      expect(r1.migrated).toBe(true);
      expect(r1.previousAdapter).toBe('git');

      // config.json now reads adapter='jj'.
      const cfg1 = JSON.parse(readFileSync(join(f.dir, '.planning', 'config.json'), 'utf-8')) as {
        vcs?: { adapter?: string };
      };
      expect(cfg1.vcs?.adapter).toBe('jj');

      // Report file exists.
      expect(
        existsSync(join(f.dir, '.planning', 'intel', '06-migration-report.md')),
      ).toBe(true);

      // Idempotency probe (no marker handling — direct double-flip): the
      // marker-probe fast-exit fires when target matches current adapter AND
      // HEAD subject carries the marker. The first migration's commit DID
      // land the marker, so calling `runMigration(dir, 'jj', ...)` again
      // (current=jj, target=jj) must fast-exit with migrated:false rather
      // than throwing "already on jj".
      const rIdem = await runMigration(f.dir, 'jj', { force: true });
      expect(rIdem.ok).toBe(true);
      expect(rIdem.migrated).toBe(false);
      expect(rIdem.filesChanged).toBe(0);

      // 2nd flip: jj → git.
      const r2 = await runMigration(f.dir, 'git', { force: true });
      expect(r2.ok).toBe(true);
      expect(r2.newAdapter).toBe('git');
      expect(r2.previousAdapter).toBe('jj');
      const cfg2 = JSON.parse(readFileSync(join(f.dir, '.planning', 'config.json'), 'utf-8')) as {
        vcs?: { adapter?: string };
      };
      expect(cfg2.vcs?.adapter).toBe('git');

      // Round-trip content invariant: STATE.md returns to baseline EXCEPT for
      // breadcrumbs `[was sha:...]` / `[was cid:...]` left by any orphan
      // ancestor walks. The synth fixture is a fresh tmpdir with a clean
      // linear history and no SHA-shaped tokens in STATE.md content, so the
      // breadcrumb count should be 0.
      const finalState = readFileSync(statePath, 'utf-8');
      const stripped = finalState.replace(/`\[was (sha|cid):[^\]]+\]`/g, '');
      expect(stripped).toBe(baselineState);
    } finally {
      f.cleanup();
    }
  });

  it('migration commit subject contains [gsd-migrate-vcs v1] marker; marker-probe yields migrated:false', async () => {
    const f = synthPlanningFixture('jj-colocated');
    try {
      seedGitAdapter(f.dir);

      // First flip: git → jj. The migration commit's description on the jj
      // side MUST carry the marker.
      const r1 = await runMigration(f.dir, 'jj', { force: true });
      expect(r1.ok).toBe(true);
      expect(r1.migrated).toBe(true);

      // jj log -r '@-' returns the immediate parent of the working copy (the
      // migration commit). Description template emits the full subject.
      const desc = execSync(
        `jj log -r '@-' -T description --no-graph -n 1 --no-pager --color never --quiet`,
        { cwd: f.dir, encoding: 'utf-8' },
      );
      expect(desc).toContain(MIGRATION_COMMIT_MARKER);
      expect(desc).toContain('chore(vcs): migrate git -> jj');

      // Marker-probe fast-exit: re-run migrate to jj while already on jj.
      // run.ts probes HEAD subject for the marker — if present AND target
      // matches current adapter, returns migrated:false without doing work.
      const r2 = await runMigration(f.dir, 'jj', { force: true });
      expect(r2.ok).toBe(true);
      expect(r2.migrated).toBe(false);
      expect(r2.filesChanged).toBe(0);
    } finally {
      f.cleanup();
    }
  });
});
