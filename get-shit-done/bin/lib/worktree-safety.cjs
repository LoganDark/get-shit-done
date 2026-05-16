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
// Phase 11 Plan 03 (D-05): `expr` no longer needed — the wave-cleanup body
// retired its inline RevisionExpr construction (mergeBase / diff / workspace.merge
// guards moved into vcs.workspace.parallel.fanIn). createVcsAdapter remains
// the canonical adapter entry point for workspace.context / workspace.prune.
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
  // Plan 02-04 Task 2: vcs.workspace.context() previously returned gitDir /
  // gitCommonDir as path strings. Phase 2.1 D-18 moved those to GitOnlyOps:
  // consumers now narrow on `vcs.kind === 'git'` and call
  // vcs.gitOnly.gitDir() / vcs.gitOnly.gitCommonDir(). ADR-0004 seam preserved
  // (W4): deps = {} signature unchanged; deps.vcs supersedes the prior
  // deps.execGit. The narrow always succeeds at runtime because
  // createVcsAdapter is pinned to kind:'git'; it exists for static
  // type-checking against the VcsAdapter discriminated union.
  // PROMPT-05 KEEP: this whole narrow is gitOnly.* capability access — NOT
  // an id-shape decision; per Phase 8 CONTEXT <out-of-scope>.
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

  try {
    // 2.1 D-18: workspace.context() is called to surface the not-a-repo error
    // path (formerly via gitDir/gitCommonDir rev-parse failure). The returned
    // ctx is no longer needed for gitDir/gitCommonDir; only its throw behavior
    // gates the not_git_repo short-circuit below.
    vcs.workspace.context();
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

  // 2.1 D-18: WorkspaceContext.{gitDir,gitCommonDir} moved to GitOnlyOps;
  // narrow on vcs.kind === 'git' to access. The narrow is statically required
  // and always succeeds at runtime (createVcsAdapter pinned to kind:'git').
  // PROMPT-05 KEEP: gitOnly.* capability narrowing (not an id-shape branch);
  // per Phase 8 CONTEXT <out-of-scope> "vcs.kind branching for non-id reasons
  // remains valid".
  if (vcs.kind === 'git') {
    const gitDir = vcs.gitOnly.gitDir();
    const gitCommonDir = vcs.gitOnly.gitCommonDir();
    if (gitDir !== gitCommonDir) {
      return {
        effectiveRoot: path.dirname(gitCommonDir),
        mode: 'linked_worktree_root',
        reason: 'linked_worktree',
      };
    }
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

function normalizeCleanupManifestEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const worktreePath = typeof entry.worktree_path === 'string'
    ? entry.worktree_path
    : (typeof entry.path === 'string' ? entry.path : '');
  const branch = typeof entry.branch === 'string' ? entry.branch : '';
  const expectedBase = typeof entry.expected_base === 'string' ? entry.expected_base : '';
  // Phase 7 D-03 (Plan 07-02): main_bookmark is OPTIONAL on the wire — the
  // parser stays pure (no vcs dependency). When absent, the executor resolves
  // it via `vcs.refs.currentBookmarksIn(repoRoot)[0]` at execute-time. The
  // parser validates shape only.
  const mainBookmark = typeof entry.main_bookmark === 'string' && entry.main_bookmark.length > 0
    ? entry.main_bookmark
    : null;
  if (!worktreePath || !branch || !expectedBase) return null;
  if (!/^worktree-agent-[A-Za-z0-9._/-]+$/.test(branch)) return null;
  return {
    agent_id: typeof entry.agent_id === 'string' ? entry.agent_id : null,
    worktree_path: worktreePath,
    branch,
    expected_base: expectedBase,
    main_bookmark: mainBookmark,
  };
}

function normalizeCleanupManifest(manifest) {
  let parsed = manifest;
  if (typeof manifest === 'string') {
    try {
      parsed = JSON.parse(manifest);
    } catch {
      return { ok: false, reason: 'invalid_manifest_json', entries: [] };
    }
  }

  const rawEntries = Array.isArray(parsed)
    ? parsed
    : (Array.isArray(parsed?.worktrees) ? parsed.worktrees : []);
  const seen = new Set();
  const entries = [];
  for (const raw of rawEntries) {
    const entry = normalizeCleanupManifestEntry(raw);
    if (!entry) continue;
    const key = `${entry.worktree_path}\0${entry.branch}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }

  if (entries.length === 0) {
    return { ok: false, reason: 'empty_manifest', entries: [] };
  }

  return { ok: true, reason: 'ok', entries };
}

function planWorktreeWaveCleanup(repoRoot, manifest) {
  const normalized = normalizeCleanupManifest(manifest);
  if (!normalized.ok) {
    return {
      ok: false,
      repoRoot,
      action: 'skip',
      discovery: 'manifest',
      reason: normalized.reason,
      entries: [],
    };
  }

  return {
    ok: true,
    repoRoot,
    action: 'cleanup_wave',
    discovery: 'manifest',
    reason: 'manifest_entries_present',
    entries: normalized.entries,
  };
}

// Phase 11 Plan 03 (D-05): private helper — adapts a legacy plan-shape
// (entries with worktree_path / branch / expected_base / main_bookmark) into
// a frozen pure-JSON `ParallelDispatchHandle` per Phase 9 D-05 conventions.
// `Object.freeze` on outer + inner mirrors `sdk/src/vcs/jj/parallel.ts:270-289`.
// Not exported — internal to this module.
function reconstructHandleFromLegacyPlan(plan) {
  const entries = Array.isArray(plan?.entries) ? plan.entries : [];
  return Object.freeze({
    phaseRoot: plan.repoRoot,
    phaseNumber: plan.phaseNumber ?? 0,
    mainBookmark: entries[0]?.main_bookmark ?? '',
    // Legacy callers had no manifest file path on disk; the fan-in body
    // discovers workspaces from `handle.workspaces[]` directly.
    manifest: '',
    workspaces: Object.freeze(entries.map((e, i) => Object.freeze({
      name: `legacy-${i + 1}`,
      path: e.worktree_path,
      baseRev: e.expected_base,
      agentId: (e.branch || '').replace(/^worktree-agent-/, ''),
      baselineOpId: undefined,
    }))),
  });
}

// Phase 11 Plan 03 (D-05): Body shrunk to a single `vcs.workspace.parallel.fanIn`
// delegation. The seven pre-merge guards that previously lived in the per-entry
// loop are retired — their work is now done inside the cross-backend
// `parallel.fanIn` adapter primitive shipped in Phases 9/10/11.1. Legacy
// callers (tests + back-compat code) keep the same public signature; their
// plan shape is adapted into a frozen pure-JSON `ParallelDispatchHandle` via
// `reconstructHandleFromLegacyPlan`.
//
// Reason taxonomy on the returned `pending[]` is now:
//   - 'merge_conflict'      — fanIn surfaced in-tree conflicts (FanInResult.conflictedPaths)
//   - 'crashed_agent'       — fanIn could not reap an agent workspace (FanInResult.failedReaped)
//   - 'incomplete_queued'   — fanIn classified one or more agents as incomplete
//   - 'unexpected_error'    — adapter threw (caught at the outer boundary)
//
// D-06 (load-bearing tradeoff): the orchestrator-side destructive-merge
// pre-check that caught #3091-class issues is DROPPED here. The defense moves
// to the agent's `<task_commit_protocol>` step 6 in `agents/gsd-executor.md`
// (post-commit `gsd-sdk query diff --diff-filter D`).
//
// The _deps={} injection seam (ADR-0004) is preserved for test stubbing — tests
// pass {vcs: …} to override the auto-detected adapter.
function executeWorktreeWaveCleanupPlan(plan, _deps = {}) {
  const entries = Array.isArray(plan?.entries) ? plan.entries : [];
  if (entries.length === 0) {
    return {
      ok: true,
      action: plan?.action ?? 'skip',
      reason: 'empty_plan',
      entries: [],
      pending: [],
    };
  }
  const vcs = _deps.vcs ?? createVcsAdapter(plan.repoRoot, {});
  const pending = [];
  try {
    const handle = reconstructHandleFromLegacyPlan(plan);
    // Legacy callers don't carry per-agent exit codes; treat every entry as a
    // successful exit so the only failure modes that surface are
    // 'merge-in-tree-conflict' (fanIn.conflicted/conflictedPaths) and
    // 'unexpected_error' (outer catch). Per Plan 11.03 Assumption A3.
    const results = plan.entries.map((e) => ({
      agentId: (e.branch || '').replace(/^worktree-agent-/, ''),
      exitCode: 0,
    }));
    const fanIn = vcs.workspace.parallel.fanIn(handle, results);
    for (const file of fanIn.conflictedPaths || []) {
      pending.push({ reason: 'merge_conflict', file });
    }
    for (const subagentName of fanIn.failedReaped || []) {
      pending.push({ reason: 'crashed_agent', subagentName });
    }
    if ((fanIn.incompleteQueued || 0) > 0) {
      pending.push({ reason: 'incomplete_queued', count: fanIn.incompleteQueued });
    }
    const processedFromHandle = handle.workspaces.map((ws, i) => {
      const src = plan.entries[i] || {};
      return {
        ...src,
        worktree_path: ws.path,
        branch: src.branch,
        expected_base: ws.baseRev,
        main_bookmark: src.main_bookmark ?? handle.mainBookmark,
        ok: !fanIn.conflicted && (fanIn.failedReaped || []).length === 0,
      };
    });
    return {
      ok: fanIn.conflicted === false && (fanIn.failedReaped || []).length === 0,
      action: plan.action,
      entries: processedFromHandle,
      pending,
    };
  } catch (err) {
    pending.push({ reason: 'unexpected_error', message: err && err.message ? err.message : String(err) });
    return { ok: false, action: plan.action, entries: [], pending };
  }
}

module.exports = {
  resolveWorktreeContext,
  parseWorktreePorcelain,
  planWorktreePrune,
  executeWorktreePrunePlan,
  listLinkedWorktreePaths,
  inspectWorktreeHealth,
  snapshotWorktreeInventory,
  normalizeCleanupManifest,
  planWorktreeWaveCleanup,
  // Phase 11 Plan 03 (D-05): executeWorktreeWaveCleanupPlan delegates to
  // `vcs.workspace.parallel.fanIn`. The CJS alias for the cleanup-wave CLI
  // handler is retired (RESEARCH Open Question 1) — workflow markdown call
  // sites are deleted by Plans 11.5/11.6, and the SDK-side
  // `worktree.cleanup-wave` catalog entry (sdk/src/query/worktree.ts) remains
  // the routing front door until the same plans rewrite to
  // `workspace.parallel.fan-in`.
  executeWorktreeWaveCleanupPlan,
  // [Rule 3 — Plan 01-03]: exposed for VcsAdapter.workspace.list (RESEARCH Pitfall 5).
  // ADR-0004 names this module as the canonical owner of `git worktree` porcelain
  // parsing; the VCS adapter consumes via DI rather than duplicating the parser.
  readWorktreeList,
};
