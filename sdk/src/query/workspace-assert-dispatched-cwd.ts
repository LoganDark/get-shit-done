/**
 * sdk/src/query/workspace-assert-dispatched-cwd.ts — Phase 11 plan 02 Task 1 (VCS-20)
 * Phase 11 plan 07: CR-01 closure — jj backend now resolves workspace-name → fs path.
 *
 * SDK query bridge for "is the current cwd a dispatched (non-primary) workspace?"
 * Returns the flat predicate D-03 contract:
 *   { ok, workspaceName, workspacePath, isPrimary }
 *
 * Backend-opaque to the CONSUMER: the JSON envelope shape is identical on both
 * backends; `workspaceName` is the backend's name-like identifier (git worktree
 * label / jj workspace name) and `workspacePath` is an absolute fs path on
 * BOTH backends. The body internally branches on `vcs.kind` because the jj
 * adapter's `WorkspaceInfo.path` carries a workspace NAME (per
 * `parseJjWorkspaceList` Open Question Q3) — the verb resolves that name to
 * an fs path via `jj workspace root --name <NAME>` before the realpath compare.
 * The git adapter's `WorkspaceInfo.path` is already an fs path, so the git
 * branch keeps the direct safeRealpath compare.
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
import { vcsExec } from '../vcs/exec.js';
import type { WorkspaceInfo } from '../vcs/types.js';
import type { QueryHandler } from './utils.js';

function safeRealpath(p: string): string | null {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

/**
 * Resolve a jj workspace NAME to an absolute fs path via
 * `jj workspace root --name <NAME>`. Returns `null` on non-zero exit so the
 * caller can skip the entry from comparison — same defensive shape as
 * `safeRealpath` on the git side. The `repoCwd` is the main repo root passed
 * via `--repository` so the invocation is location-independent.
 */
function resolveJjWorkspacePath(repoCwd: string, name: string): string | null {
  if (!name) return null;
  const res = vcsExec(repoCwd, 'jj', [
    '--repository',
    repoCwd,
    '--no-pager',
    '--color',
    'never',
    '--quiet',
    'workspace',
    'root',
    '--name',
    name,
  ]);
  if (res.exitCode !== 0) return null;
  const out = res.stdout.trim();
  return out.length > 0 ? out : null;
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
  //
  // Per-entry resolution differs by backend:
  //   - git: WorkspaceInfo.path IS an absolute fs path (per parseWorktreeList).
  //          Direct safeRealpath compare works.
  //   - jj:  WorkspaceInfo.path is the workspace NAME (per parseJjWorkspaceList
  //          Open Question Q3). We shell out to `jj workspace root --name <NAME>`
  //          to resolve each name to an fs path before realpath compare. The
  //          original `vcs.kind === 'git'`-only `safeRealpath(entry.path)`
  //          implementation (pre Plan 11-07) silently returned `ok: false` on
  //          jj because workspace names like `"default"` or
  //          `"phase-11-subagent-1"` are not fs paths — every jj agent commit
  //          halted with FATAL. CR-01 closure.
  let matchedIndex = -1;
  let matchedPath: string | null = null;
  for (let i = 0; i < entries.length; i++) {
    const entry: WorkspaceInfo = entries[i];
    const fsPath =
      vcs.kind === 'jj' ? resolveJjWorkspacePath(cwd, entry.path) : entry.path;
    if (fsPath === null) continue;
    const entryReal = safeRealpath(fsPath);
    if (entryReal !== null && cwdReal !== null && entryReal === cwdReal) {
      matchedIndex = i;
      matchedPath = fsPath;
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

  // Plan 11-07 CR-01: emit the resolved fs path in `workspacePath` (NOT
  // `matched.path`, which on jj is the workspace name). `workspaceName` and
  // `workspacePath` now carry semantically equivalent values on both backends:
  // a name-like identifier and an fs path, respectively. On git the two are
  // equal because git's `WorkspaceInfo.path` doubles as both fields.
  return {
    data: {
      ok: !isPrimary,
      workspaceName: matched.path,
      workspacePath: matchedPath ?? matched.path,
      isPrimary,
    },
  };
};
