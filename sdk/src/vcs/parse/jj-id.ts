/**
 * change_id <-> commit_id translator for the jj backend.
 *
 * Phase 3 only needs the forward direction (commit_id <- change_id) because
 * `LogEntry.hash = commit_id` per PITFALL 1 in 03-RESEARCH.md. The reverse
 * (change_id <- commit_id) lands here as a public symbol for any future
 * `vcs.jjOnly.commitIdOf` helper (Phase 2.1 D-14 deferred placement).
 *
 * Mirrors the single-stateless-string-mapper shape of `parse/jj-rev.ts`.
 * Plan 03-01: stub. Plan 03-02: real implementation + tests.
 */

import { vcsExec } from '../exec.js';

function jjArgv(cwd: string, ...subcommand: string[]): string[] {
  return [
    '--repository',
    cwd,
    '--no-pager',
    '--color',
    'never',
    '--quiet',
    ...subcommand,
  ];
}

export function commitIdOf(cwd: string, changeId: string): string {
  const r = vcsExec(
    cwd,
    'jj',
    jjArgv(cwd, 'log', '-r', changeId, '-T', 'commit_id', '--no-graph', '-n', '1')
  );
  if (r.exitCode !== 0) {
    throw new Error(
      `jj-id.commitIdOf failed for change ${changeId}: ${r.stderr || r.stdout}`
    );
  }
  return r.stdout.trim();
}

export function changeIdOf(cwd: string, commitId: string): string {
  const r = vcsExec(
    cwd,
    'jj',
    jjArgv(cwd, 'log', '-r', commitId, '-T', 'change_id', '--no-graph', '-n', '1')
  );
  if (r.exitCode !== 0) {
    throw new Error(
      `jj-id.changeIdOf failed for commit ${commitId}: ${r.stderr || r.stdout}`
    );
  }
  return r.stdout.trim();
}
