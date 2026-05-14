/**
 * sdk/src/query/push.ts — Phase 5 plan 05-01 Task 2 (D-33 batch 1)
 *
 * SDK query bridge for `git push` / `jj git push` invocations. Workflow
 * markdown rewrites in Phase 5 plans 05-02..05-04 replace `git push <remote>
 * <ref>` shell-outs with `gsd-sdk query push --remote <r> --bookmark <b>`.
 *
 * Cross-backend: dispatches through `createVcsAdapter().push()`, which on the
 * git backend issues `git push [--force] [--no-verify] <remote> <ref>` and on
 * the jj backend issues `jj git push --remote <r> --bookmark <b> [--force]`.
 *
 * Usage:
 *   gsd-sdk query push
 *   gsd-sdk query push --remote origin --bookmark feature/x
 *   gsd-sdk query push --remote origin --bookmark feature/x --force
 *   gsd-sdk query push --cwd /path/to/repo
 */

import { createVcsAdapter } from '../vcs/index.js';
import { validateRefname } from '../vcs/refs-validator.js';
import type { QueryHandler } from './utils.js';
import type { RevisionExpr } from '../vcs/types.js';

export const pushQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let remote: string | undefined;
  let bookmark: string | undefined;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    } else if (args[i] === '--remote' && args[i + 1]) {
      remote = args[i + 1];
      i++;
    } else if (args[i] === '--bookmark' && args[i + 1]) {
      bookmark = args[i + 1];
      i++;
    } else if (args[i] === '--force') {
      force = true;
    }
  }

  if (bookmark !== undefined) {
    try {
      validateRefname(bookmark);
    } catch (err) {
      return {
        data: {
          ok: false,
          error: (err as Error).message,
        },
      };
    }
  }

  const vcs = createVcsAdapter(cwd);
  const result = vcs.push({
    remote,
    ref: bookmark as unknown as RevisionExpr | undefined,
    force,
  });

  return {
    data: {
      ok: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      remote,
      bookmark,
      force,
    },
  };
};
