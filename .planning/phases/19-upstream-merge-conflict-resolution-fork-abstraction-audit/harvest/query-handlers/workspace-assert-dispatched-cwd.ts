/**
 * sdk/src/query/workspace-assert-dispatched-cwd.ts — Phase 11 plan 02 Task 1 (VCS-20)
 * Phase 11 plan 07: CR-01 closure — jj backend now resolves workspace-name → fs path.
 * Phase 11 plan 11: PROMPT-08 BLOCKER closure — envelope additively carries
 *                   `primaryWorkspacePath` so the agent's FATAL recovery
 *                   diagnostic dump can read the resolved primary workspace
 *                   fs path from the SDK verb instead of shelling out to raw
 *                   `git rev-parse --show-toplevel` (per project rule
 *                   `project_no_raw_git`).
 *
 * SDK query bridge for "is the current cwd a dispatched (non-primary) workspace?"
 * Returns the flat predicate D-03 contract:
 *   { ok, workspaceName, workspacePath, isPrimary, primaryWorkspacePath }
 *
 * `primaryWorkspacePath` is the resolved fs path of `entries[0]` (the primary
 * workspace), backend-opaque, always present (null on resolution failure or
 * empty workspace list). Plan 11-11 adds this field to retire the raw-`git
 * rev-parse` probe from `agents/gsd-executor.md` per project rule
 * `project_no_raw_git`. The field is computed independently of the cwd-match
 * outcome so the failure branch (ok:false) STILL carries the primary path —
 * which is exactly when the agent's FATAL recovery needs it.
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

  // Plan 11-11 (PROMPT-08 closure): resolve the primary workspace's fs path
  // independently of the cwd-match outcome. The agent's FATAL recovery
  // diagnostic dump in `agents/gsd-executor.md` reads this value via jq from
  // the verb's envelope, retiring the raw-`git rev-parse --show-toplevel`
  // probe that previously violated the project rule `project_no_raw_git`. The
  // value is computed BEFORE the match loop so the failure branch (ok:false)
  // carries it too — which is exactly when the agent needs it for triage.
  // `null` on resolution failure or empty workspace list — same defensive
  // shape as `safeRealpath` / `resolveJjWorkspacePath`.
  const primaryWorkspacePath: string | null =
    entries.length === 0
      ? null
      : vcs.kind === 'jj'
        ? resolveJjWorkspacePath(cwd, entries[0].path)
        : safeRealpath(entries[0].path);

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
    // stable shape regardless of whether cwd resolved. Plan 11-11:
    // `primaryWorkspacePath` is ALWAYS present (computed above), independent
    // of the cwd-match outcome — exactly the failure-branch consumer surface
    // the agent's FATAL recovery diagnostic dump needs.
    return {
      data: {
        ok: false,
        workspaceName: null,
        workspacePath: null,
        isPrimary: false,
        primaryWorkspacePath,
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
  // Plan 11-11: `primaryWorkspacePath` additively present here too —
  // backend-opaque envelope-shape consistency (same shape on success + failure).
  return {
    data: {
      ok: !isPrimary,
      workspaceName: matched.path,
      workspacePath: matchedPath ?? matched.path,
      isPrimary,
      primaryWorkspacePath,
    },
  };
};
