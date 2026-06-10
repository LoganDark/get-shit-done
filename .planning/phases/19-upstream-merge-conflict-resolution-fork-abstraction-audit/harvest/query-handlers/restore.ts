/**
 * sdk/src/query/restore.ts — Phase 5 plan 05-01 Task 2 (D-33 batch 1)
 *
 * SDK query bridge for `git restore` / `jj restore`. Cross-backend:
 *   - git: `git restore [--source <from>] -- <files...>` via vcs.gitOnly.restore.
 *   - jj:  `jj restore <files...> [--from <rev>]` via vcsExec (jj 0.41 has no
 *          jj-symmetric adapter verb yet; gap-fill candidate for Phase 5/6).
 *
 * Files are trailing positionals (no separator required since the verb
 * accepts no other positional). `--from <rev>` is optional (defaults to
 * HEAD on git, @- on jj — jj's parent commit alias).
 *
 * Usage:
 *   gsd-sdk query restore src/a.ts src/b.ts
 *   gsd-sdk query restore --from HEAD~1 src/a.ts
 */

import { createVcsAdapter } from '../vcs/index.js';
import { vcsExec } from '../vcs/exec.js';
import { validateRefname } from '../vcs/refs-validator.js';
import type { QueryHandler } from './utils.js';

export const restoreQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let from: string | undefined;
  const files: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    } else if (args[i] === '--from' && args[i + 1]) {
      from = args[i + 1];
      i++;
    } else if (!args[i].startsWith('--')) {
      files.push(args[i]);
    }
  }

  if (files.length === 0) {
    return { data: { ok: false, error: 'restore: at least one file argument required' } };
  }

  if (from !== undefined) {
    try {
      validateRefname(from);
    } catch (err) {
      return { data: { ok: false, error: (err as Error).message } };
    }
  }

  const vcs = createVcsAdapter(cwd);
  if (vcs.kind === 'git') {
    const result = vcs.gitOnly.restore({ files, from });
    return {
      data: {
        ok: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        files,
        from,
        backend: 'git',
      },
    };
  }

  // jj path: no adapter verb yet — dispatch via vcsExec directly.
  // gap-fill candidate (see sdk/src/vcs/backends/jj.ts TODO).
  const jjFrom = from ?? '@-';
  const result = vcsExec(cwd, 'jj', ['restore', '--from', jjFrom, '--', ...files]);
  return {
    data: {
      ok: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      files,
      from: jjFrom,
      backend: 'jj',
    },
  };
};
