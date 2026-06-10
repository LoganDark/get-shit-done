/**
 * sdk/src/query/current-branch.ts — Phase 5 plan 05-01 Task 2 (D-33 batch 1)
 *
 * SDK query bridge for "which bookmarks point at HEAD?". Returns the
 * `string[]` produced by `vcs.refs.currentBookmarks()` (Phase 2.1 D-15;
 * both backends — empty array == detached/anonymous head).
 *
 * Usage:
 *   gsd-sdk query current-branch
 *   gsd-sdk query current-branch --cwd /path
 */

import { createVcsAdapter } from '../vcs/index.js';
import type { QueryHandler } from './utils.js';

export const currentBranchQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    }
  }

  const vcs = createVcsAdapter(cwd);
  const bookmarks = vcs.refs.currentBookmarks();

  return {
    data: {
      ok: true,
      bookmarks,
    },
  };
};
