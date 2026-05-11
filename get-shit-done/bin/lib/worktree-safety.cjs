/**
 * Worktree Safety Policy Module
 *
 * Owns worktree-root resolution and non-destructive prune policy decisions.
 */

const fs = require('fs');
const path = require('path');
// Plan 02-04 Task 1 (D-01 smoke-test): consume Phase 1's already-shipped
// porcelain parser via the dist-cjs bridge from bin/lib/*.cjs.
const { readWorktreeList: readPorcelainFromSdk } = require('../../../sdk/dist-cjs/vcs/parse/worktree-list.js');
// Plan 02-04 Task 2: createVcsAdapter is the canonical entry point for
// workspace.context (lines 122/123 migration) and workspace.prune (line 198
// migration). ADR-0004 worktree seam is preserved via the deps = {} parameter
// on readWorktreeList and resolveWorktreeContext: tests inject a fake vcs via
// deps.vcs the same way they previously injected deps.execGit.
const { createVcsAdapter } = require('../../../sdk/dist-cjs/vcs/index.js');

function parseWorktreePorcelain(porcelain) {
  return parseWorktreeEntries(porcelain).filter((entry) => entry.branch).map((entry) => ({
    path: entry.path,
    branch: entry.branch,
  }));
}

function parseWorktreeEntries(porcelain) {
  const entries = [];
  const blocks = String(porcelain || '').split('\n\n').filter(Boolean);
  for (const block of blocks) {
    const lines = block.split('\n');
    const worktreeLine = lines.find((l) => l.startsWith('worktree '));
    if (!worktreeLine) continue;
    const worktreePath = worktreeLine.slice('worktree '.length).trim();
    if (!worktreePath) continue;
    const branchLine = lines.find((l) => l.startsWith('branch refs/heads/'));
    const branch = branchLine ? branchLine.slice('branch refs/heads/'.length).trim() : null;
    entries.push({ path: worktreePath, branch });
  }
  return entries;
}

function parseWorktreeListPaths(porcelain) {
  return parseWorktreeEntries(porcelain).map((entry) => entry.path);
}

function readWorktreeList(repoRoot, deps = {}) {
  // Plan 02-04 Tasks 1+2: consume Phase 1's already-shipped porcelain parser.
  // ADR-0004 seam preserved (W4): deps = {} signature unchanged; tests can
  // inject a fake adapter via deps.vcs whose workspace.list() returns the
  // structured shape this function expects, OR provide deps.readPorcelain to
  // override the porcelain reader directly (mirrors bug-3281 timeout mocks).
  const readPorcelain = deps.readPorcelain || readPorcelainFromSdk;
  const result = readPorcelain(repoRoot);
  if (!result.ok) {
    return { ok: false, reason: result.reason, porcelain: '', entries: [] };
  }
  return {
    ok: true,
    reason: 'ok',
    porcelain: result.porcelain,
    entries: parseWorktreeEntries(result.porcelain),
  };
}

function resolveWorktreeContext(cwd, deps = {}) {
  // Plan 02-04 Task 2: vcs.workspace.context() returns the same gitDir /
  // gitCommonDir path strings the previous raw `git rev-parse --git-dir` /
  // `--git-common-dir` calls produced (already path.resolve'd to absolute by
  // the adapter per Blocker 4). ADR-0004 seam preserved (W4): deps = {}
  // signature unchanged; deps.vcs supersedes the prior deps.execGit.
  const vcs = deps.vcs || createVcsAdapter(cwd, { kind: 'git' });
  const existsSync = deps.existsSync || fs.existsSync;

  // Local .planning takes precedence over linked-worktree remapping.
  if (existsSync(path.join(cwd, '.planning'))) {
    return {
      effectiveRoot: cwd,
      mode: 'current_directory',
      reason: 'has_local_planning',
    };
  }

  let ctx;
  try {
    ctx = vcs.workspace.context();
  } catch {
    // workspace.context() throws on non-repo cwd or when its underlying
    // rev-parse calls fail (incl. timeout). Mirrors the prior `exitCode !== 0`
    // fallback that returned `not_git_repo`.
    return {
      effectiveRoot: cwd,
      mode: 'current_directory',
      reason: 'not_git_repo',
    };
  }

  if (ctx.gitDir !== ctx.gitCommonDir) {
    return {
      effectiveRoot: path.dirname(ctx.gitCommonDir),
      mode: 'linked_worktree_root',
      reason: 'linked_worktree',
    };
  }

  return {
    effectiveRoot: cwd,
    mode: 'current_directory',
    reason: 'main_worktree',
  };
}

function planWorktreePrune(repoRoot, options = {}, deps = {}) {
  const parsePorcelain = deps.parseWorktreePorcelain || parseWorktreePorcelain;
  const destructiveModeRequested = Boolean(options.allowDestructive);
  const listed = readWorktreeList(repoRoot, deps);
  if (!listed.ok) {
    return {
      repoRoot,
      action: 'skip',
      reason: listed.reason,
      destructiveModeRequested,
    };
  }

  let worktrees = [];
  try {
    worktrees = parsePorcelain(listed.porcelain);
  } catch {
    // Keep historical behavior: still run metadata prune when parsing fails.
    worktrees = [];
  }

  return {
    repoRoot,
    action: 'metadata_prune_only',
    reason: worktrees.length === 0 ? 'no_worktrees' : 'worktrees_present',
    destructiveModeRequested,
  };
}

function executeWorktreePrunePlan(plan, deps = {}) {
  if (!plan || plan.action === 'skip') {
    return {
      ok: false,
      action: plan ? plan.action : 'skip',
      reason: plan ? plan.reason : 'missing_plan',
      pruned: [],
    };
  }

  if (plan.action !== 'metadata_prune_only') {
    return {
      ok: false,
      action: plan.action,
      reason: 'unsupported_action',
      pruned: [],
    };
  }

  // Plan 02-04 Task 2: vcs.workspace.prune() runs `git worktree prune`. The
  // returned ExecResult preserves timedOut as a first-class field for the
  // bug-3281 AC4 contract (caller must distinguish timeout from generic fail).
  const vcs = deps.vcs || createVcsAdapter(plan.repoRoot, { kind: 'git' });
  const result = vcs.workspace.prune();
  if (result.timedOut) {
    // AC4: surface timedOut as a first-class field so callers (e.g.
    // pruneOrphanedWorktrees in core.cjs) can log a structured WARNING rather
    // than silently ignoring it (PRED.k302 — error-swallowing-empty-sentinel).
    return {
      ok: false,
      action: plan.action,
      reason: 'git_timed_out',
      timedOut: true,
      pruned: [],
    };
  }
  return {
    ok: result.exitCode === 0,
    action: plan.action,
    reason: plan.reason,
    timedOut: false,
    pruned: [],
  };
}

function listLinkedWorktreePaths(repoRoot, deps = {}) {
  const listed = readWorktreeList(repoRoot, deps);
  if (!listed.ok) {
    return {
      ok: false,
      reason: listed.reason,
      paths: [],
    };
  }

  const allPaths = listed.entries.map((entry) => entry.path);
  // git worktree list always includes the current/main worktree first.
  return {
    ok: true,
    reason: 'ok',
    paths: allPaths.slice(1),
  };
}

function inspectWorktreeHealth(repoRoot, options = {}, deps = {}) {
  const inventory = snapshotWorktreeInventory(repoRoot, options, deps);
  if (!inventory.ok) {
    return {
      ok: false,
      reason: inventory.reason,
      findings: [],
    };
  }

  const findings = [];
  for (const entry of inventory.entries) {
    if (!entry.exists) {
      findings.push({
        kind: 'orphan',
        path: entry.path,
      });
      continue;
    }
    if (entry.isStale) {
      findings.push({
        kind: 'stale',
        path: entry.path,
        ageMinutes: entry.ageMinutes,
      });
    }
  }

  return {
    ok: true,
    reason: 'ok',
    findings,
  };
}

function snapshotWorktreeInventory(repoRoot, options = {}, deps = {}) {
  const existsSync = deps.existsSync || fs.existsSync;
  const statSync = deps.statSync || fs.statSync;
  const staleAfterMs = options.staleAfterMs ?? (60 * 60 * 1000);
  const nowMs = options.nowMs ?? Date.now();
  // Plan 02-04 Task 2: pass deps through verbatim so deps.vcs / deps.readPorcelain
  // injection reaches the underlying readWorktreeList.
  const listed = listLinkedWorktreePaths(repoRoot, deps);
  if (!listed.ok) {
    return {
      ok: false,
      reason: listed.reason,
      entries: [],
    };
  }

  const entries = [];
  for (const worktreePath of listed.paths) {
    let exists = false;
    let isStale = false;
    let ageMinutes = null;

    if (!existsSync(worktreePath)) {
      entries.push({
        path: worktreePath,
        exists,
        isStale,
        ageMinutes,
      });
      continue;
    }

    exists = true;
    try {
      const stat = statSync(worktreePath);
      const ageMs = nowMs - stat.mtimeMs;
      ageMinutes = Math.round(ageMs / 60000);
      if (ageMs > staleAfterMs) {
        isStale = true;
      }
    } catch {
      // Keep historical behavior: stat failures are ignored.
    }
    entries.push({
      path: worktreePath,
      exists,
      isStale,
      ageMinutes,
    });
  }

  return {
    ok: true,
    reason: 'ok',
    entries,
  };
}

module.exports = {
  resolveWorktreeContext,
  parseWorktreePorcelain,
  planWorktreePrune,
  executeWorktreePrunePlan,
  listLinkedWorktreePaths,
  inspectWorktreeHealth,
  snapshotWorktreeInventory,
  // [Rule 3 — Plan 01-03]: exposed for VcsAdapter.workspace.list (RESEARCH Pitfall 5).
  // ADR-0004 names this module as the canonical owner of `git worktree` porcelain
  // parsing; the VCS adapter consumes via DI rather than duplicating the parser.
  readWorktreeList,
};
