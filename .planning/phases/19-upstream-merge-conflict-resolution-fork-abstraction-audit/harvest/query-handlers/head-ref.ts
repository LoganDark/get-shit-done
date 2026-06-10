/**
 * sdk/src/query/head-ref.ts — Phase 5 plan 05-01 Task 2 (D-33 batch 1)
 *
 * SDK query bridge for "what is HEAD?" — returns the short-form resolved
 * revision of `vcs.refs.head` via `vcs.refs.resolveShort()`.
 *
 * Usage:
 *   gsd-sdk query head-ref
 *   gsd-sdk query head-ref --cwd /path
 */

import { createVcsAdapter } from '../vcs/index.js';
import type { QueryHandler } from './utils.js';

export const headRefQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    }
  }

  const vcs = createVcsAdapter(cwd);
  const head = vcs.refs.resolveShort(vcs.refs.head);

  return {
    data: {
      ok: true,
      head,
    },
  };
};
