/**
 * sdk/src/query/log.ts — Phase 5 plan 05-01 Task 2 (D-33 batch 1)
 *
 * SDK query bridge for `git log` / `jj log`. Read-only. Returns the
 * structured `LogEntry[]` produced by the adapter; downstream consumers
 * (PROMPT rewrites in plans 05-02..05-04) reconstruct "oneline" form
 * from `hash.slice(0,7) + ' ' + subject` per the Phase 2 CR-02 narrowing.
 *
 * Usage:
 *   gsd-sdk query log --max-count 5
 *   gsd-sdk query log --range HEAD~5..HEAD --all --cwd /path
 */

import { createVcsAdapter } from '../vcs/index.js';
import type { QueryHandler } from './utils.js';
import type { RevisionExpr } from '../vcs/types.js';

export const logQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let maxCount: number | undefined;
  let allRefs = false;
  let range: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    } else if (args[i] === '--max-count' && args[i + 1]) {
      const n = parseInt(args[i + 1], 10);
      if (Number.isFinite(n) && n > 0) maxCount = n;
      i++;
    } else if (args[i] === '--all') {
      allRefs = true;
    } else if (args[i] === '--range' && args[i + 1]) {
      range = args[i + 1];
      i++;
    }
    // --grep / --format / --no-merges parsed-but-unused: LogOpts contract
    // (Phase 2 CR-02 narrowing) doesn't expose them. Callers that need
    // `grep` fall back to client-side filtering on subject strings.
  }

  const vcs = createVcsAdapter(cwd);
  const entries = vcs.log({
    maxCount,
    allRefs,
    rev: range as unknown as RevisionExpr | undefined,
  });

  return {
    data: {
      ok: true,
      entries,
      maxCount,
      allRefs,
      range,
    },
  };
};
