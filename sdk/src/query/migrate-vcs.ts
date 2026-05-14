/**
 * sdk/src/query/migrate-vcs.ts — Phase 6 plan 06-03 Task 1
 *
 * SDK verb handler for `/gsd-migrate-vcs`. Bidirectional VCS migration:
 *   - argv parsing with current-state-aware target defaults (CONTEXT D-03):
 *     vcs.adapter=git or absent → bare command defaults to --target jj
 *     vcs.adapter=jj            → bare command refuses; explicit --target git required
 *   - pre-flight: validate target value (V5); refuse same-direction; refuse
 *     --target jj when `jj --version` fails (RESEARCH §CLI Surface)
 *   - dispatch to `runMigration` from plan 06-02 (sdk/src/vcs/format-migration)
 *
 * Mirrors Phase 5 plan 05-01's 11-shim shape (sdk/src/query/restore.ts).
 *
 * On-the-wire envelope is FLAT (CR-01): the query-dispatch layer
 * JSON.stringify's `result.data` directly, so `ok`/`migrated`/`newAdapter`
 * appear at the top level — no `.data` wrapper.
 *
 * Usage:
 *   gsd-sdk query migrate-vcs --target jj [--native] [--force]
 *   gsd-sdk query migrate-vcs --target git [--force]
 *   gsd-sdk query migrate-vcs                 (bare: derive default from current adapter)
 */

import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { runMigration } from '../vcs/format-migration/index.js';
import type { QueryHandler } from './utils.js';

const VALID_TARGETS = new Set(['git', 'jj']);

export const migrateVcsQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let target: string | undefined;
  let native = false;
  let force = false;
  let workstream: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    } else if (args[i] === '--target' && args[i + 1]) {
      target = args[i + 1];
      i++;
    } else if (args[i] === '--workstream' && args[i + 1]) {
      workstream = args[i + 1];
      i++;
    } else if (args[i] === '--native') {
      native = true;
    } else if (args[i] === '--force') {
      force = true;
    } else if (args[i].startsWith('--')) {
      return { data: { ok: false, error: `migrate-vcs: unknown flag '${args[i]}'` } };
    }
  }

  // Determine current adapter from .planning/config.json (RESEARCH
  // §"Determining the target VCS" — workstream-aware path lookup deferred
  // to a future enhancement; the bare path covers BROWN-01 dogfood).
  let currentAdapter: 'git' | 'jj' | 'auto' | 'absent' = 'absent';
  try {
    const configPath = workstream
      ? join(cwd, '.planning', 'workstreams', workstream, 'config.json')
      : join(cwd, '.planning', 'config.json');
    const raw = await readFile(configPath, 'utf-8');
    const json = JSON.parse(raw);
    currentAdapter = json?.vcs?.adapter ?? 'absent';
  } catch {
    /* leave 'absent' */
  }

  // Current-state-aware target default (CONTEXT D-03).
  if (target === undefined) {
    if (currentAdapter === 'git' || currentAdapter === 'absent' || currentAdapter === 'auto') {
      target = 'jj';
    } else if (currentAdapter === 'jj') {
      return {
        data: {
          ok: false,
          error: 'migrate-vcs: already on jj — pass --target git to migrate back',
        },
      };
    }
  }

  // Validate target (RESEARCH §Security V5).
  if (!VALID_TARGETS.has(target!)) {
    return {
      data: { ok: false, error: `migrate-vcs: invalid --target '${target}' (valid: jj, git)` },
    };
  }

  // Same-direction handling is delegated to runMigration so the marker-probe
  // fast-exit (06-02 idempotency contract) is reachable: when HEAD carries the
  // migration marker, same-direction returns {ok:true, migrated:false}; when
  // not, runMigration throws the explicit "already on ${target}" error.

  // Pre-flight: target=jj requires jj binary available.
  if (target === 'jj') {
    try {
      execSync('jj --version', { stdio: 'pipe' });
    } catch {
      return {
        data: {
          ok: false,
          error: 'migrate-vcs: --target jj requires jj binary in PATH (install jj first)',
        },
      };
    }
  }

  // Dispatch to plan 06-02 library. The QueryHandler wrapper return-shape is
  // { data: ... }, but query-dispatch.ts:formatSuccess() JSON.stringifies
  // result.data directly — so on the wire `ok`/`migrated`/`newAdapter` are
  // top-level (CR-01 flat-envelope invariant).
  try {
    const result = await runMigration(cwd, target as 'git' | 'jj', { force, native, workstream });
    return {
      data: {
        ok: true,
        migrated: result.migrated,
        filesChanged: result.filesChanged,
        filesScanned: result.filesScanned,
        orphans: result.orphans,
        previousAdapter: result.previousAdapter,
        newAdapter: result.newAdapter,
        commitHash: result.commitHash,
      },
    };
  } catch (e) {
    return { data: { ok: false, error: `migrate-vcs: ${(e as Error).message}` } };
  }
};
