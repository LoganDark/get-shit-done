/**
 * sdk/src/query/status.ts — Phase 5 plan 05-01 Task 2 (D-33 batch 1)
 *
 * SDK query bridge for `git status` / `jj status`. Read-only. Returns
 * structured StatusResult ({ entries, raw }). `--porcelain` flag mirrors
 * git semantics; `--short` is parsed as an alias for --porcelain (StatusOpts
 * contract exposes only `porcelain`).
 *
 * Usage:
 *   gsd-sdk query status --porcelain
 *   gsd-sdk query status --cwd /path
 */

import { createVcsAdapter } from '../vcs/index.js';
import type { QueryHandler } from './utils.js';

export const statusQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let porcelain = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    } else if (args[i] === '--porcelain' || args[i] === '--short') {
      // `--short` accepted as an alias; StatusOpts contract exposes only `porcelain`.
      porcelain = true;
    }
  }

  const vcs = createVcsAdapter(cwd);
  const result = vcs.status({ porcelain });

  return {
    data: {
      ok: true,
      entries: result.entries,
      raw: result.raw,
      porcelain,
    },
  };
};
