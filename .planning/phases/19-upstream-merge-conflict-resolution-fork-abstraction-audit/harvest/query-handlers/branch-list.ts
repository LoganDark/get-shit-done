/**
 * sdk/src/query/branch-list.ts — Phase 5 plan 05-01 Task 2 (D-33 batch 1)
 *
 * SDK query bridge for `git branch --list` / `jj bookmark list`. Read-only.
 * Returns Bookmark[] (each { name, rev }). VcsBookmarks.list() does not
 * currently accept a prefix filter on its public surface; `--prefix` is
 * applied as client-side post-filter here.
 *
 * Usage:
 *   gsd-sdk query branch-list
 *   gsd-sdk query branch-list --prefix gsd/
 */

import { createVcsAdapter } from '../vcs/index.js';
import { validateRefname } from '../vcs/refs-validator.js';
import type { QueryHandler } from './utils.js';

export const branchListQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let prefix: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    } else if (args[i] === '--prefix' && args[i + 1]) {
      prefix = args[i + 1];
      i++;
    }
  }

  if (prefix !== undefined) {
    // Allow trailing slash (e.g., 'gsd/'): strip it for validation, since
    // `gsd/` itself ends with `/` which validateRefname rejects.
    const probe = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    if (probe.length > 0) {
      try {
        validateRefname(probe);
      } catch (err) {
        return { data: { ok: false, error: (err as Error).message } };
      }
    }
  }

  const vcs = createVcsAdapter(cwd);
  const all = vcs.refs.bookmarks.list();
  const bookmarks = prefix ? all.filter((b) => b.name.startsWith(prefix as string)) : all;

  return {
    data: {
      ok: true,
      bookmarks,
      prefix,
    },
  };
};
