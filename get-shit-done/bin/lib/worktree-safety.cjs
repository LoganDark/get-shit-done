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
  // Plan 02-04 Task 2: vcs.workspace.context() previously returned gitDir /
  // gitCommonDir as path strings. Phase 2.1 D-18 moved those to GitOnlyOps:
  // consumers now narrow on `vcs.kind === 'git'` and call
  // vcs.gitOnly.gitDir() / vcs.gitOnly.gitCommonDir(). ADR-0004 seam preserved
  // (W4): deps = {} signature unchanged; deps.vcs supersedes the prior
  // deps.execGit. The narrow always succeeds at runtime because
  // createVcsAdapter is pinned to kind:'git'; it exists for static
  // type-checking against the VcsAdapter discriminated union.
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
  if (!worktreePath || !branch || !expectedBase) return null;
  if (!/^worktree-agent-[A-Za-z0-9._/-]+$/.test(branch)) return null;
  return {
    agent_id: typeof entry.agent_id === 'string' ? entry.agent_id : null,
    worktree_path: worktreePath,
    branch,
    expected_base: expectedBase,
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

// jj-port placeholder: upstream's wave-cleanup executor shells out to seven
// raw-git verbs (rev-parse, merge-base, diff --diff-filter=D, status -C,
// merge --no-ff, worktree remove --force, branch -D). The jj-port rule is
// "no raw git anywhere" (project_no_raw_git), so the executor is stubbed
// until the VcsAdapter grows the needed verbs.
//
// To unblock this hook, the SDK adapter must add (in sdk/src/vcs/types.ts +
// both git and jj backends):
//   - refs.bookmarks.currentIn(cwd)             // -C <wt> rev-parse --abbrev-ref HEAD
//   - refs.mergeBase(a, b)                      // merge-base HEAD <branch>
//   - diff({ rev: <range>, diffFilter: 'D', nameOnly: true })  // deletions in branch
//   - status({ porcelain: true, cwd: <wt> })    // -C <wt> status --porcelain
//   - workspace.merge({ branch, message, ff: false })          // merge --no-ff -m
//   - workspace.remove(path, { force: true })   // worktree remove --force
//   - refs.bookmarks.delete(branch, { force: true })           // branch -D
//
// Once those land, restore the executor body from upstream (see git history
// for the original shape) translated to adapter calls. The plan layer
// (normalizeCleanupManifest / planWorktreeWaveCleanup) is pure logic and
// stays unchanged — it's the executor that needs adapter wiring.
function executeWorktreeWaveCleanupPlan(plan, _deps = {}) {
  const entries = Array.isArray(plan?.entries) ? plan.entries : [];
  return {
    ok: false,
    action: plan ? plan.action : 'skip',
    reason: 'not_implemented_in_jj_port',
    entries: [],
    pending: entries,
  };
}

function cmdWorktreeCleanupWave(cwd, args = []) {
  const manifestFlagIndex = args.indexOf('--manifest');
  const manifestPath = manifestFlagIndex >= 0 ? args[manifestFlagIndex + 1] : '';
  if (!manifestPath) {
    process.stderr.write('Usage: worktree cleanup-wave --manifest <path>\n');
    process.exitCode = 2;
    return;
  }

  let manifest;
  try {
    manifest = fs.readFileSync(path.resolve(cwd, manifestPath), 'utf8');
  } catch (err) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      reason: 'manifest_read_failed',
      error: err.message,
    }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  const plan = planWorktreeWaveCleanup(cwd, manifest);
  const result = executeWorktreeWaveCleanupPlan(plan);
  const response = {
    ok: result.ok,
    plan: {
      action: plan.action,
      discovery: plan.discovery,
      reason: plan.reason,
      entries: plan.entries.length,
    },
    result,
  };
  process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
  if (!result.ok) {
    process.exitCode = 1;
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
  // executeWorktreeWaveCleanupPlan is a jj-port placeholder — it returns
  // {ok:false, reason:'not_implemented_in_jj_port'} until the VcsAdapter
  // grows the seven verbs the upstream executor needs (see comment block
  // above the stub for the required adapter surface).
  executeWorktreeWaveCleanupPlan,
  cmdWorktreeCleanupWave,
  // [Rule 3 — Plan 01-03]: exposed for VcsAdapter.workspace.list (RESEARCH Pitfall 5).
  // ADR-0004 names this module as the canonical owner of `git worktree` porcelain
  // parsing; the VCS adapter consumes via DI rather than duplicating the parser.
  readWorktreeList,
};
