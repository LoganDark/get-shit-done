/**
 * sdk/src/query/revert.ts — Phase 5 plan 05-01 Task 2 (D-33 batch 1)
 *
 * SDK query bridge for "undo a commit". Cross-backend with a CRUCIAL semantic
 * shift on the jj path:
 *
 *   - git: `git revert <rev>` writes a NEW inverse-content commit on top of
 *     HEAD. Non-destructive — the original commit is still reachable, the
 *     working tree has an additional commit applying the inverse diff.
 *
 *   - jj: `jj abandon <change_id>` REMOVES the commit from the visible
 *     history (DESTRUCTIVE). Recovery path is `jj op restore <op>` against
 *     the operation log — there is NO inverse-content primitive in jj 0.41.
 *
 * See 05-RESEARCH.md "Pitfall 6: jj idiom mismatch in CMD-06 undo semantics"
 * for the rationale. CMD-06 in PROMPT rewrites accepts this destructive
 * semantics shift; an inverse-content primitive on jj is deferred to
 * JJOP-01 v2 (post-Phase 6).
 *
 * Callers must be aware: `gsd-sdk query revert <rev>` on a jj backend
 * REWRITES HISTORY. Recovery via `jj op restore` only succeeds while the
 * op-log retains the pre-abandon state.
 *
 * Usage:
 *   gsd-sdk query revert HEAD
 *   gsd-sdk query revert HEAD --no-commit          (git only — staged inverse)
 *   gsd-sdk query revert <change_id> --cwd /path
 */

import { createVcsAdapter } from '../vcs/index.js';
import { vcsExec } from '../vcs/exec.js';
import type { QueryHandler } from './utils.js';

export const revertQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let rev: string | undefined;
  let noCommit = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    } else if (args[i] === '--no-commit') {
      noCommit = true;
    } else if (!args[i].startsWith('--') && rev === undefined) {
      rev = args[i];
    }
  }

  if (!rev) {
    return { data: { ok: false, error: 'revert: positional <rev> argument required' } };
  }

  const vcs = createVcsAdapter(cwd);
  if (vcs.kind === 'git') {
    const result = vcs.gitOnly.revert({ rev, noCommit });
    return {
      data: {
        ok: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        rev,
        noCommit,
        backend: 'git',
      },
    };
  }

  // jj path: destructive abandon (Pitfall 6 semantic shift, see header).
  // `--no-commit` is meaningless here — jj abandon is one-shot history rewrite.
  const result = vcsExec(cwd, 'jj', ['abandon', rev]);
  return {
    data: {
      ok: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      rev,
      noCommit,
      backend: 'jj',
      // Recovery hint for destructive-semantics callers (Pitfall 6):
      // `jj op restore <op>` rolls back this abandon while the op-log
      // retains the pre-abandon state.
      destructive: true,
    },
  };
};
