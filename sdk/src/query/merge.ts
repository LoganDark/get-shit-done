/**
 * sdk/src/query/merge.ts — Phase 5 plan 05-01 Task 2 (D-33 batch 1)
 *
 * SDK query bridge for `git merge`. Git-only — the jj backend returns a
 * typed error ("not yet supported on jj backend; phase merge happens via
 * performJjReap"). Phase 6 may add a jj-symmetric verb if needed.
 *
 * Usage:
 *   gsd-sdk query merge feature/x
 *   gsd-sdk query merge feature/x --squash --no-ff
 *   gsd-sdk query merge feature/x --no-commit --cwd /path
 */

import { createVcsAdapter } from '../vcs/index.js';
import { validateRefname } from '../vcs/refs-validator.js';
import type { QueryHandler } from './utils.js';

export const mergeQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let ref: string | undefined;
  let squash = false;
  let noFf = false;
  let noCommit = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    } else if (args[i] === '--squash') {
      squash = true;
    } else if (args[i] === '--no-ff') {
      noFf = true;
    } else if (args[i] === '--no-commit') {
      noCommit = true;
    } else if (!args[i].startsWith('--') && ref === undefined) {
      ref = args[i];
    }
  }

  if (!ref) {
    return { data: { ok: false, error: 'merge: positional <ref> argument required' } };
  }

  try {
    validateRefname(ref);
  } catch (err) {
    return { data: { ok: false, error: (err as Error).message } };
  }

  const vcs = createVcsAdapter(cwd);
  if (vcs.kind !== 'git') {
    return {
      data: {
        ok: false,
        error: 'merge: not yet supported on jj backend; phase merge happens via performJjReap',
      },
    };
  }

  const result = vcs.gitOnly.merge({ ref, squash, noFf, noCommit });
  return {
    data: {
      ok: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      ref,
      squash,
      noFf,
      noCommit,
    },
  };
};
