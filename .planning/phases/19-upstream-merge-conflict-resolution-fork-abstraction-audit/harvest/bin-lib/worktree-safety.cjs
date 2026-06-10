/**
 * Worktree Safety Policy Module
 *
 * Owns worktree-root resolution and non-destructive prune policy decisions.
 */

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
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

// jj-port: `reapOrphanWorktrees` (#3707) operates on `.git/worktrees/<id>/`
// admin entries — a structural git-only concept (jj has workspaces, not
// linked worktrees). These helpers run raw git for that intrinsically git-only
// path. All other VCS reads/writes in this module continue to route through
// createVcsAdapter (project_no_raw_git).
const DEFAULT_GIT_TIMEOUT_MS = 10000;

function execGitDefault(args, opts = {}) {
  const result = childProcess.spawnSync('git', args, { // vcs-lint:allow-git-here #3707 orphan-worktree reap is intrinsically git-only
    cwd: opts.cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: opts.timeout ?? DEFAULT_GIT_TIMEOUT_MS,
  });
  const timedOut = result.signal === 'SIGTERM' && result.error?.code === 'ETIMEDOUT';
  return {
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    signal: result.signal,
    error: result.error ?? null,
    timedOut,
  };
}

function gitResultOk(result) {
  return result && result.exitCode === 0 && !result.timedOut;
}

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
        // WR-02 fix: incompleteQueued > 0 means retries are queued; callers must not mark ROADMAP complete while queue is non-empty.
        ok: !fanIn.conflicted && (fanIn.failedReaped || []).length === 0 && (fanIn.incompleteQueued || 0) === 0,
      };
    });
    return {
      // WR-02 fix: incompleteQueued > 0 means retries are queued; callers must not mark ROADMAP complete while queue is non-empty.
      ok: fanIn.conflicted === false && (fanIn.failedReaped || []).length === 0 && (fanIn.incompleteQueued || 0) === 0,
      action: plan.action,
      entries: processedFromHandle,
      pending,
    };
  } catch (err) {
    pending.push({ reason: 'unexpected_error', message: err && err.message ? err.message : String(err) });
    return { ok: false, action: plan.action, entries: [], pending };
  }
}

/**
 * Reap orphaned linked worktrees whose lock owner process is dead, whose
 * branch tip is fully merged into the default branch, and whose lock file
 * mtime is older than REAP_MTIME_GUARD_MS (race guard).
 *
 * Invariants (Fail-closed — skip on any doubt):
 *   Pre:  .git/worktrees/<id>/locked exists for a linked worktree
 *   Reap: pid dead (or unparseable) AND branch-tip ancestor of default branch
 *         AND lock mtime > REAP_MTIME_GUARD_MS old
 *   Action: worktree unlock → worktree remove --force → prune
 *   Post: worktree absent from git worktree list; no unmerged work lost
 *
 * @param {string} repoRoot  - Absolute path to the primary worktree root.
 * @param {object} [deps]    - Optional dependency overrides for testing.
 *   deps.execGit            - Replaces execGitDefault for all git calls.
 *   deps.isPidAlive         - Function(pid:number):boolean (default: kill -0).
 *   deps.readDirSafe        - Function(dir:string):string[] (default: fs.readdirSync).
 *   deps.readFileSafe       - Function(file:string):string (default: fs.readFileSync).
 *   deps.mtimeSafe          - Function(file:string):Date (default: fs.statSync).
 *   deps.reapMtimeGuardMs   - Override stale-lock age threshold (default 5 min).
 * @returns {Array<{path:string, status:'reaped'|'skipped', reason:string}>}
 */
const REAP_MTIME_GUARD_MS = 5 * 60 * 1000; // 5 minutes

function reapOrphanWorktrees(repoRoot, deps = {}) {
  const execGit = deps.execGit || execGitDefault;
  const isPidAlive = deps.isPidAlive || defaultIsPidAlive;
  const readDirSafe = deps.readDirSafe || defaultReadDirSafe;
  const readFileSafe = deps.readFileSafe || defaultReadFileSafe;
  const mtimeSafe = deps.mtimeSafe || defaultMtimeSafe;
  const reapMtimeGuardMs = deps.reapMtimeGuardMs !== undefined ? deps.reapMtimeGuardMs : REAP_MTIME_GUARD_MS;

  const results = [];

  // 1. Discover the .git/worktrees/ admin directory.
  const gitDir = execGit(['rev-parse', '--git-dir'], { cwd: repoRoot });
  if (!gitResultOk(gitDir)) return results;
  const gitDirPath = path.resolve(repoRoot, gitDir.stdout.trim());

  const worktreesAdminDir = path.join(gitDirPath, 'worktrees');
  const entries = readDirSafe(worktreesAdminDir);
  if (!entries) return results;

  // 2. Discover the default branch (main/master/etc) tip.
  // Strategy (fail-closed):
  //   a. Prefer refs/remotes/origin/HEAD — the authoritative integration branch.
  //   b. Only fall back to 'main' / 'master' when origin/HEAD is absent AND the
  //      remote itself doesn't exist (i.e. local-only test fixtures).  In all other
  //      cases, bail out rather than guess: using a wrong branch tip would allow
  //      `merge-base --is-ancestor` to pass against a non-authoritative ref and
  //      reap a worktree whose branch is NOT merged into the real default.
  //
  // Intentionally excludes 'HEAD': using HEAD when detached or on a feature
  // branch would make every branch appear "merged" into it, causing false reaping.
  const defaultBranchResult = execGit(
    ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'],
    { cwd: repoRoot }
  );

  let mainTip;
  if (gitResultOk(defaultBranchResult)) {
    // Remote default branch is known — use it exclusively.
    const branchName = defaultBranchResult.stdout.trim().replace(/^origin\//, '');
    const r = execGit(['rev-parse', `refs/remotes/origin/${branchName}`], { cwd: repoRoot });
    if (!gitResultOk(r)) return results; // remote ref unresolvable — fail closed
    mainTip = r.stdout.trim();
  } else {
    // No remote configured (local-only repo, e.g. test fixtures).
    // Fall back to 'main' then 'master' — only safe because there is no remote
    // integration branch to confuse with.  A remote that exists but lacks
    // origin/HEAD is treated as ambiguous and bails out (fail-closed).
    const hasRemote = execGit(['remote'], { cwd: repoRoot });
    if (gitResultOk(hasRemote) && hasRemote.stdout.trim()) {
      // Remote exists but origin/HEAD not set — ambiguous; fail closed.
      return results;
    }
    // Build candidate list: init.defaultBranch config, HEAD symref, then main, master.
    const candidateBranches = [];
    // Try git config init.defaultBranch first (user-configured default)
    const configResult = execGit(['config', '--get', 'init.defaultBranch'], { cwd: repoRoot });
    if (gitResultOk(configResult) && configResult.stdout.trim()) {
      candidateBranches.push(configResult.stdout.trim());
    }
    // Try HEAD symref (the branch the repo is currently on — valid for local repos
    // without detached HEAD; do not use when detached since it could be a feature branch)
    const headSymref = execGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: repoRoot });
    if (gitResultOk(headSymref) && headSymref.stdout.trim()) {
      const headBranch = headSymref.stdout.trim();
      if (!candidateBranches.includes(headBranch)) {
        candidateBranches.push(headBranch);
      }
    }
    // Always include main and master as universal fallbacks
    for (const b of ['main', 'master']) {
      if (!candidateBranches.includes(b)) candidateBranches.push(b);
    }
    for (const candidate of candidateBranches) {
      const r = execGit(['rev-parse', candidate], { cwd: repoRoot });
      if (gitResultOk(r)) {
        mainTip = r.stdout.trim();
        break;
      }
    }
    if (!mainTip) return results;
  }

  // 3. Build a canonical-path → listed-path index from git worktree list.
  // git worktree list shows paths AS PROVIDED to git worktree add.
  // On macOS, os.tmpdir() may be /var/folders/... (symlink) while git writes
  // /private/var/folders/... (real path) in the gitdir file.  We need the
  // LISTED path for git worktree unlock/remove to find the worktree.
  const listedResult = execGit(['worktree', 'list', '--porcelain'], { cwd: repoRoot });
  const canonicalToListed = new Map();
  if (gitResultOk(listedResult)) {
    // Normalize CRLF → LF before splitting: git on Windows may emit CRLF in
    // porcelain output, which would break block splitting on '\n\n'.
    const normalizedListed = listedResult.stdout.replace(/\r\n/g, '\n');
    for (const block of normalizedListed.split('\n\n').filter(Boolean)) {
      const wtLine = block.split('\n').find((l) => l.startsWith('worktree '));
      if (!wtLine) continue;
      const listed = wtLine.slice('worktree '.length).trim();
      try {
        const canonical = fs.realpathSync.native(listed);
        canonicalToListed.set(canonical, listed);
      } catch {
        // If the path doesn't exist (already removed), skip silently.
      }
    }
  }

  // 4. Process each worktree admin entry that has a 'locked' file.
  for (const entryName of entries) {
    const adminDir = path.join(worktreesAdminDir, entryName);
    const lockedFile = path.join(adminDir, 'locked');
    const lockedContent = readFileSafe(lockedFile);
    if (lockedContent === null) continue; // no lock file — not our concern

    // Resolve the actual worktree path from the gitdir pointer.
    // The gitdir file contains a path like "../../<name>/.git" relative to adminDir.
    // Strip the trailing .git segment (cross-platform: handle both / and \).
    const gitdirFile = path.join(adminDir, 'gitdir');
    const gitdirContent = readFileSafe(gitdirFile);
    if (!gitdirContent) continue;
    const resolvedGitFile = path.resolve(adminDir, gitdirContent.trim());
    const worktreePath = path.basename(resolvedGitFile) === '.git'
      ? path.dirname(resolvedGitFile)
      : resolvedGitFile;

    // Look up the git-list path (the path git knows about) for use in
    // git worktree unlock/remove commands.  Falls back to worktreePath if
    // not found (e.g. already removed, or no symlink ambiguity).
    let gitKnownPath = worktreePath;
    try {
      const canonical = fs.realpathSync.native(worktreePath);
      gitKnownPath = canonicalToListed.get(canonical) || worktreePath;
    } catch {
      // worktreePath may not exist yet (already removed); use as-is.
    }

    // 4a. Stale-lock guard: skip if lock is too fresh (PID recycling / race).
    const lockMtime = mtimeSafe(lockedFile);
    if (!lockMtime || Date.now() - lockMtime.getTime() < reapMtimeGuardMs) {
      results.push({ path: worktreePath, status: 'skipped', reason: 'lock_too_fresh' });
      continue;
    }

    // 4b. PID liveness check.
    // Fail-closed: any lock content that does not parse as a numeric PID (e.g.
    // "Locked by claude-code agent-xxxx") is treated as ALIVE — we cannot
    // confirm the owner is dead, so we must not reap.  This includes the real
    // Claude Code lock format which is non-numeric text.
    const pidStr = lockedContent.trim().match(/^\d+/)?.[0];
    if (!pidStr) {
      results.push({ path: worktreePath, status: 'skipped', reason: 'lock_owner_unknown' });
      continue;
    }
    const pid = parseInt(pidStr, 10);
    // Wrap isPidAlive in try/catch: any error (e.g. EPERM on Windows when the process
    // exists but is owned by another user) must be treated as ALIVE (fail-closed).
    let pidIsAlive;
    try {
      pidIsAlive = Number.isNaN(pid) || isPidAlive(pid);
    } catch {
      pidIsAlive = true; // Cannot determine liveness — treat as alive, do not reap.
    }
    if (pidIsAlive) {
      results.push({ path: worktreePath, status: 'skipped', reason: 'pid_alive' });
      continue;
    }

    // 4c. Ancestry guard: branch-tip must be reachable from main (fail closed).
    // The admin HEAD file contains either "ref: refs/heads/<branch>" or a bare SHA.
    // We read the file directly (no non-standard git ref parsing).
    let branchTip;
    {
      const headContent = readFileSafe(path.join(adminDir, 'HEAD'));
      if (!headContent) {
        results.push({ path: worktreePath, status: 'skipped', reason: 'cannot_resolve_branch_tip' });
        continue;
      }
      const trimmed = headContent.trim();
      if (trimmed.startsWith('ref: refs/heads/')) {
        // Symbolic ref — resolve to commit SHA via git
        const branchName = trimmed.slice('ref: refs/heads/'.length);
        const resolveResult = execGit(['rev-parse', `refs/heads/${branchName}`], { cwd: repoRoot });
        if (!gitResultOk(resolveResult)) {
          results.push({ path: worktreePath, status: 'skipped', reason: 'cannot_resolve_branch_tip' });
          continue;
        }
        branchTip = resolveResult.stdout.trim();
      } else if (/^[0-9a-f]{40}$/i.test(trimmed)) { // vcs-lint:allow-commit-id-here #3707 raw git HEAD-file parse for orphaned-worktree reap
        // Detached HEAD — bare SHA
        branchTip = trimmed;
      } else {
        results.push({ path: worktreePath, status: 'skipped', reason: 'cannot_resolve_branch_tip' });
        continue;
      }
    }

    const ancestorCheck = execGit(
      ['merge-base', '--is-ancestor', branchTip, mainTip],
      { cwd: repoRoot }
    );
    if (!gitResultOk(ancestorCheck)) {
      results.push({ path: worktreePath, status: 'skipped', reason: 'branch_not_merged' });
      continue;
    }

    // 4d. Reap: unlock → remove --force.
    // Use gitKnownPath (from git worktree list) so that git can locate the
    // worktree even when the path in the gitdir file differs due to symlinks
    // (e.g. macOS /var/folders vs /private/var/folders).
    execGit(['worktree', 'unlock', gitKnownPath], { cwd: repoRoot }); // ignore failure (already unlocked)
    const removeResult = execGit(['worktree', 'remove', gitKnownPath, '--force'], { cwd: repoRoot });
    if (!gitResultOk(removeResult)) {
      results.push({ path: worktreePath, status: 'skipped', reason: 'remove_failed' });
      continue;
    }

    // Use the git-listed path so the result is consistent with what callers see
    // from 'git worktree list', avoiding symlink vs real-path mismatches on macOS.
    results.push({ path: gitKnownPath, status: 'reaped', reason: 'pid_dead_and_merged' });
  }

  // 5. Always prune stale metadata (handles missing-on-disk entries).
  execGit(['worktree', 'prune'], { cwd: repoRoot });

  return results;
}

// ─── reapOrphanWorktrees deps helpers ─────────────────────────────────────────

function defaultIsPidAlive(pid) {
  // process.kill(pid, 0) probes process existence without sending a real signal.
  //   - Returns normally → process is alive.
  //   - Throws ESRCH → process does not exist → dead.
  //   - Throws EPERM → process exists but we lack permission (alive; fail-closed
  //     on Windows where cross-user processes throw EPERM, not ESRCH).
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but we cannot signal it.
    // Treat as alive (fail-closed: do not reap a process we cannot confirm dead).
    if (err && err.code === 'EPERM') return true;
    return false;
  }
}

function defaultReadDirSafe(dir) {
  try { return fs.readdirSync(dir); } catch { return null; }
}

function defaultReadFileSafe(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

function defaultMtimeSafe(file) {
  try { return fs.statSync(file).mtime; } catch { return null; }
}

function cmdWorktreeReapOrphans(cwd) {
  let result;
  try {
    result = reapOrphanWorktrees(cwd);
  } catch (err) {
    // Surface failure as a one-line warning; keep exit-zero so workflows don't break.
    process.stderr.write(`[gsd] worktree.reap-orphans failed: ${err && err.message ? err.message : String(err)}\n`);
    result = [];
  }
  const skippedCount = result.filter((r) => r.status === 'skipped').length;
  if (skippedCount > 0) {
    // Surface skipped entries so operators are aware of unresolved orphans.
    process.stderr.write(`[gsd] worktree.reap-orphans: ${skippedCount} orphan(s) skipped (run with DEBUG=1 for details)\n`);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, reaped: result.filter((r) => r.status === 'reaped').length, entries: result }, null, 2)}\n`);
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
  reapOrphanWorktrees,
  cmdWorktreeReapOrphans,
};
