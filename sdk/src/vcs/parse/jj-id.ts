/**
 * change_id <-> commit_id translator for the jj backend.
 *
 * Phase 3 only needs the forward direction (commit_id <- change_id) because
 * `LogEntry.hash = commit_id` per PITFALL 1 in 03-RESEARCH.md. The reverse
 * (change_id <- commit_id) lands here as a public symbol for any future
 * `vcs.jjOnly.commitIdOf` helper (Phase 2.1 D-14 deferred placement).
 *
 * Mirrors the single-stateless-string-mapper shape of `parse/jj-rev.ts`.
 *
 * Both probes use `jj log -r <input> -T '<field>' --no-graph -n 1`, going
 * through the JJ-02 jjArgv prefix (--repository, --no-pager, --color never,
 * --quiet). D-05: never `--ignore-working-copy`.
 *
 * On non-zero exit, throws `VcsExecError` (typed; callers can
 * `instanceof`-check) — NOT a plain Error.
 */

import { vcsExec, VcsExecError } from '../exec.js';

function jjIdArgv(cwd: string, ...subcommand: string[]): string[] {
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
  const args = jjIdArgv(cwd, 'log', '-r', changeId, '-T', 'commit_id', '--no-graph', '-n', '1');
  const r = vcsExec(cwd, 'jj', args);
  if (r.exitCode !== 0) {
    throw new VcsExecError(
      `jj-id.commitIdOf failed for change ${changeId}: ${r.stderr || r.stdout}`,
      {
        exitCode: r.exitCode,
        stdout: r.stdout,
        stderr: r.stderr,
        timedOut: r.timedOut,
        args,
      }
    );
  }
  return r.stdout.trim();
}

export function changeIdOf(cwd: string, commitId: string): string {
  const args = jjIdArgv(cwd, 'log', '-r', commitId, '-T', 'change_id', '--no-graph', '-n', '1');
  const r = vcsExec(cwd, 'jj', args);
  if (r.exitCode !== 0) {
    throw new VcsExecError(
      `jj-id.changeIdOf failed for commit ${commitId}: ${r.stderr || r.stdout}`,
      {
        exitCode: r.exitCode,
        stdout: r.stdout,
        stderr: r.stderr,
        timedOut: r.timedOut,
        args,
      }
    );
  }
  return r.stdout.trim();
}
