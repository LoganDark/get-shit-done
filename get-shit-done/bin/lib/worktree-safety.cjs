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
// Phase 7 WAVE-01 (Plan 07-02): `expr` is needed by executeWorktreeWaveCleanupPlan
// to construct RevisionExpr arguments for the new wave-cleanup verbs landed in
// Plan 07-01 (refs.mergeBase, diff{rev:range,diffFilter}, workspace.merge).
const { createVcsAdapter, expr } = require('../../../sdk/dist-cjs/vcs/index.js');

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

// Phase 7 WAVE-01 (Plan 07-02): orchestrates the 7 wave-cleanup verbs landed
// in Plan 07-01. Canonical body shape: 07-RESEARCH.md §"Wave-cleanup executor
// body shape". Order:
//   1. refs.currentBookmarksIn(wt)   — confirm the worktree's branch matches the manifest
//   2. refs.mergeBase(HEAD, branch)  — compute the fork point (change_id on jj, hash on git)
//   3. diff({rev:range, diffFilter:'deleted', nameOnly:true}) — block on file deletions
//   4. status({porcelain, cwd: wt})  — block on dirty worktree state
//   5. workspace.merge({…, mainBookmark, agentBookmark}) — 2-parent merge + atomic
//      main-advance + atomic agent-bookmark delete (D-03 — single verb, no separate
//      bookmarks.delete needed for the agent ref).
//   6. workspace.remove(wt, {force}) — composite forget+rm on jj; worktree remove --force on git
//   7. bookmarks.delete{force} — safety-net delete (D-09). jj's workspace.merge
//      atomically deletes the agent bookmark inside the merge verb, so this
//      step is a no-op there. git's `branch -D` inside merge fails silently
//      while the worktree is still checked out (merge surfaces the issue in
//      stderr but r.ok stays true). After workspace.remove unregisters the
//      worktree, this idempotent delete sweeps up the orphan branch.
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
  const processed = [];
  const pending = [];
  for (const entry of entries) {
    try {
      // Verb 1: confirm branch at worktree matches expectation.
      const branches = vcs.refs.currentBookmarksIn(entry.worktree_path);
      if (!branches.includes(entry.branch)) {
        pending.push({ ...entry, reason: 'branch_drift', detected: branches });
        continue;
      }
      // Verbs 2 + 3: deletion guard. mergeBase returns change_id on jj, hash
      // on git; expr.range translates recursively on both backends.
      const base = vcs.refs.mergeBase(vcs.refs.head, expr.bookmark(entry.branch));
      const dels = vcs.diff({
        rev: expr.range(expr.rev(base), expr.bookmark(entry.branch)),
        diffFilter: 'deleted',
        nameOnly: true,
      });
      if (Array.isArray(dels.nameOnly) && dels.nameOnly.length > 0) {
        pending.push({ ...entry, reason: 'deletions_detected', files: dels.nameOnly });
        continue;
      }
      // Verb 4: dirty-WC guard at the worktree's own cwd.
      const wtStatus = vcs.status({ porcelain: true, cwd: entry.worktree_path });
      if (Array.isArray(wtStatus.entries) && wtStatus.entries.length > 0) {
        pending.push({ ...entry, reason: 'worktree_dirty', entries: wtStatus.entries });
        continue;
      }
      // D-03: workspace.merge REQUIRES a named main bookmark for its atomic
      // main-advance step. Prefer the manifest entry's main_bookmark; fall
      // back to the repo's current bookmark when callers haven't been updated
      // to populate the field. If neither resolves, surface as pending —
      // we cannot safely call workspace.merge without a target.
      const mainBookmarkName = entry.main_bookmark
        ?? (vcs.refs.currentBookmarksIn(plan.repoRoot)[0] ?? null);
      if (!mainBookmarkName) {
        pending.push({ ...entry, reason: 'no_main_bookmark', repoRoot: plan.repoRoot });
        continue;
      }
      // Verb 5: 2-parent merge with atomic main-advance + atomic agent-bookmark
      // cleanup (D-03). agentBookmark threads the agent ref through so the
      // merge verb deletes it inside the same lock window as the main-advance.
      const merge = vcs.workspace.merge({
        branch: expr.bookmark(entry.branch),
        message: `chore: merge executor worktree (${entry.branch})`,
        ff: false,
        mainBookmark: mainBookmarkName,
        agentBookmark: entry.branch,
      });
      if (!merge.ok) {
        pending.push({
          ...entry,
          reason: merge.conflicted ? 'merge_conflict' : 'merge_failed',
          stderr: merge.stderr,
        });
        continue;
      }
      // Verb 6: composite worktree removal (jj: forget + rm -rf; git: worktree
      // remove --force). On unhandled throw the per-entry catch below records
      // the failure as 'unexpected_error'.
      vcs.workspace.remove(entry.worktree_path, { force: true });
      // Verb 7: bookmarks.delete{force} as a safety net. D-03 says
      // workspace.merge deletes the agent bookmark atomically — and on jj it
      // does — but on git, `git branch -D <agent>` inside merge fails silently
      // when the agent worktree is still checked out (merge.stderr surfaces it,
      // r.ok stays true). Now that workspace.remove has unregistered the
      // worktree, branch-delete succeeds. This is exactly the D-09 use case
      // for the standalone delete verb: branches the merge step couldn't
      // reach. Idempotent on jj (bookmark already gone → no-op) and on git
      // (branch already gone → exits with `branch '...' not found`, which
      // we swallow because the desired post-state is "no such bookmark").
      if (vcs.refs.bookmarks.exists(entry.branch, { raw: true })) {
        try {
          vcs.refs.bookmarks.delete(entry.branch, { raw: true, force: true });
        } catch {
          // Best-effort: the desired post-state is "bookmark gone". If the
          // backend errors on a non-existent ref, surface as unexpected_error
          // via the outer catch only when the bookmark genuinely still exists
          // post-attempt — checked below.
        }
      }
      processed.push({ ...entry, mergedAs: merge.changeId });
    } catch (err) {
      pending.push({ ...entry, reason: 'unexpected_error', error: err.message });
    }
  }
  return { ok: pending.length === 0, action: plan.action, entries: processed, pending };
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
  // Phase 7 WAVE-01 (Plan 07-02): executeWorktreeWaveCleanupPlan orchestrates
  // the 7 wave-cleanup verbs from Plan 07-01 (refs.currentBookmarksIn,
  // refs.mergeBase, diff{diffFilter}, status{cwd}, workspace.merge,
  // workspace.remove, refs.bookmarks.delete{force}). See the header comment
  // on the function for the canonical orchestration order.
  executeWorktreeWaveCleanupPlan,
  cmdWorktreeCleanupWave,
  // [Rule 3 — Plan 01-03]: exposed for VcsAdapter.workspace.list (RESEARCH Pitfall 5).
  // ADR-0004 names this module as the canonical owner of `git worktree` porcelain
  // parsing; the VCS adapter consumes via DI rather than duplicating the parser.
  readWorktreeList,
};
