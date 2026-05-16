/**
 * sdk/src/query/workspace-assert-dispatched-cwd.ts — Phase 11 plan 02 Task 1 (VCS-20)
 *
 * SDK query bridge for "is the current cwd a dispatched (non-primary) workspace?"
 * Returns the flat predicate D-03 contract:
 *   { ok, workspaceName, workspacePath, isPrimary }
 *
 * Backend-opaque: the body uses `vcs.workspace.list()` only. On both git and jj
 * the first entry from `list()` is the primary workspace (git: main worktree
 * first; jj: `default` workspace first). The verb resolves cwd against the
 * workspace set via realpath equivalence on the `WorkspaceInfo.path` field.
 *
 * Per D-03 (CONTEXT.md): this is the MINIMAL predicate — no HEAD-namespace
 * regex, no protected-ref deny-list, no abs-path predicate, no base-stability
 * assertion. The four guards' INTENT lives implicitly: if cwd resolves to a
 * non-primary dispatched workspace, the agent is in the right place by
 * construction.
 *
 * Usage:
 *   gsd-sdk query workspace.assert-dispatched-cwd
 *   gsd-sdk query workspace.assert-dispatched-cwd --cwd /path/to/check
 */

import { realpathSync } from 'node:fs';
import { createVcsAdapter } from '../vcs/index.js';
import type { QueryHandler } from './utils.js';

function safeRealpath(p: string): string | null {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

export const workspaceAssertDispatchedCwdQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    }
  }

  const vcs = createVcsAdapter(cwd);
  const entries = vcs.workspace.list();

  const cwdReal = safeRealpath(cwd);

  // Convention (load-bearing across both backends): the first entry in
  // `vcs.workspace.list()` is the primary workspace.
  //   - git: `git worktree list --porcelain` lists the main worktree first.
  //   - jj: `jj workspace list -T json(self)` lists the `default` workspace first.
  let matchedIndex = -1;
  for (let i = 0; i < entries.length; i++) {
    const entryReal = safeRealpath(entries[i].path);
    if (entryReal !== null && cwdReal !== null && entryReal === cwdReal) {
      matchedIndex = i;
      break;
    }
  }

  if (matchedIndex === -1) {
    // Use `null` (not `undefined`) so the JSON envelope carries the keys
    // explicitly — consumers that branch on `.workspaceName !== null` see a
    // stable shape regardless of whether cwd resolved.
    return {
      data: {
        ok: false,
        workspaceName: null,
        workspacePath: null,
        isPrimary: false,
      },
    };
  }

  const matched = entries[matchedIndex];
  const isPrimary = matchedIndex === 0;

  return {
    data: {
      ok: !isPrimary,
      workspaceName: matched.path,
      workspacePath: matched.path,
      isPrimary,
    },
  };
};
