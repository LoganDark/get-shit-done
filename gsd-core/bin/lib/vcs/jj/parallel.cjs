"use strict";
/**
 * sdk/src/vcs/jj/parallel.ts — Phase 9 (VCS-17, PARALLEL-01/02 jj-side)
 *
 * Composition layer over octopus.ts + reap.ts + jj-native N-parent merge.
 * UPSTREAM-02 sidecar: does NOT import from backends/jj.ts (that would
 * create a merge conflict on every upstream-rebase cycle).
 *
 * Pure functions; both return frozen JSON (D-05). dispatch composes
 * `octopus.createPhaseStructure` + N× `octopus.createSubagentSlot`. fanIn
 * runs a single N-parent `jj new`, probes conflicts via the UPSTREAM-02
 * conflict-paths sidecar, and on the clean path advances the main bookmark
 * (PARALLEL-02 jj-side).
 *
 * Phase 11 D-01: no manifest sidecar on disk; `handle.manifest` is the empty
 * string. The Handle is the orchestrator's full state — only persistent
 * state is workspaces / bookmarks / HEADs themselves. Mirrors the parity
 * target at `get-shit-done/bin/lib/worktree-safety.cjs::reconstructHandleFromLegacyPlan`
 * which sets `manifest: ''` the same way.
 *
 * Phase 11 D-02 (cross-phase amendment): the eager per-subagent bookmark
 * create loop in dispatch and the matching batched bookmark delete + surplus
 * sweep in fanIn retired. The octopus structure already references each
 * slot's head as a parent of the phase-merge change (N-parent `jj new`
 * below), so the `gsd/phase-{NN}-subagent-{idx}` bookmarks were redundant
 * scaffolding. `FanInResult.surplusBookmarks` stays on the type contract
 * but is trivially `[]` on the clean branch by construction. Git side keeps
 * `worktree-agent-*` branches — load-bearing backend asymmetry; git
 * worktrees can't track anonymous heads ergonomically.
 *
 * On octopus in-tree conflict, fanIn appends an `IncompleteWorkEntry` with
 * `reason='merge-in-tree-conflict'` to the queue file at `handle.phaseRoot`
 * (W3 (a) joint-assertion producer for D-16). This complements reap.ts's
 * orthogonal classifier branch (which fires when a CRASHED agent's own head
 * is conflicted). Both producers emit the same reason literal; both are
 * valid; they queue under different `subagentName` / `changeIdShort` values.
 *
 * D-01/D-02 (carry): no jj write-lock / repo-lock acquisition — the
 * orchestrator awaits all `Agent()` resolutions before fanIn; the single
 * orchestrator process never contends with itself.
 *
 * D-12 (carry): `vcsExec` is the sole subprocess primitive; no raw
 * `child_process` calls are made from this file.
 *
 * D-13 (carry): squash-only commit model; never `--ignore-working-copy`. The
 * probes here are reads and don't need the flag.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.derivePhaseRoot = derivePhaseRoot;
exports.performJjParallelDispatch = performJjParallelDispatch;
exports.performJjParallelFanIn = performJjParallelFanIn;
exports.performJjParallelCancel = performJjParallelCancel;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const exec_cjs_1 = require("../exec.cjs");
const octopus_cjs_1 = require("./octopus.cjs");
const reap_cjs_1 = require("./reap.cjs");
const conflict_paths_cjs_1 = require("./conflict-paths.cjs");
const incomplete_work_cjs_1 = require("./incomplete-work.cjs");
const jj_workspace_list_cjs_1 = require("../parse/jj-workspace-list.cjs");
const workspace_cleanup_cjs_1 = require("./workspace-cleanup.cjs");
/**
 * Inline mandatory jj-flags prefix. UPSTREAM-02 sidecar discipline: this
 * file does NOT import from `backends/jj.ts`. Flag set matches
 * `backends/jj.ts::jjArgv`: --repository, --no-pager, --color never, --quiet.
 * Verbatim copy of `octopus.ts:39-47`.
 */
function jjArgvFlags(repo) {
    return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}
/**
 * Resolve the change_id of the change referenced by a revset, taking
 * exactly one row. Verbatim copy of `octopus.ts:49-66`.
 */
function resolveChangeId(mainRepoRoot, revset) {
    const args = [
        ...jjArgvFlags(mainRepoRoot),
        'log', '-r', revset, '-T', 'change_id ++ "\\n"', '--no-graph', '-n', '1',
    ];
    const r = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'jj', args);
    if (r.exitCode !== 0 || !r.stdout.trim()) {
        throw new Error(`parallel.resolveChangeId(${revset}) failed: ${r.stderr || r.stdout}`);
    }
    return r.stdout.trim();
}
/**
 * W1: validate caller-supplied agentId against the worktree-safety.cjs:334
 * regex `/^worktree-agent-[A-Za-z0-9._/-]+$/`. The `branch` literal we emit
 * into the manifest is `worktree-agent-${agentId}`, so the agentId itself
 * must match `/^[A-Za-z0-9._/-]+$/` for the prefixed result to clear the
 * reader regex. agentIds containing whitespace or other characters outside
 * this class would silently drop at `normalizeCleanupManifestEntry` — losing
 * track of the workspace. Throwing BEFORE the manifest write makes the
 * caller fix their input rather than masking the drop.
 */
function validateAgentId(name) {
    if (!/^[A-Za-z0-9._/-]+$/.test(name)) {
        throw new Error(`parallel.dispatch: agentId "${name}" violates worktree-safety manifest character class /^[A-Za-z0-9._/-]+$/ (see get-shit-done/bin/lib/worktree-safety.cjs:334)`);
    }
}
/**
 * Inline main-bookmark refname validator. Mirrors the safety floor of
 * `backends/jj.ts:validateRefname` callsite at :1184 without importing
 * (UPSTREAM-02 sidecar discipline). The agent-bookmark validator that used
 * to live alongside this one retired in Phase 11 (D-02) along with the
 * eager per-subagent bookmark creation loop in `performJjParallelDispatch`.
 */
function validateMainBookmark(name) {
    // jj bookmark names accept `[A-Za-z0-9._/-]+` (the same character class
    // worktree-safety.cjs uses for the branch field). Refnames must be
    // non-empty and not start with a hyphen (defense against argv injection
    // even with `--` separator on the delete path).
    if (name.length === 0 || name.startsWith('-') || !/^[A-Za-z0-9._/-]+$/.test(name)) {
        throw new Error(`parallel: main bookmark name "${name}" is not a valid jj bookmark refname`);
    }
}
/**
 * Derive the on-disk phase directory under `<mainRepoRoot>/.planning/phases/`
 * for a given phase number. Resolution order:
 *   1. exact-match prefix `{padded}-*` (slug-suffixed dir, the standard
 *      `.planning/phases/{NN}-{slug}/` layout);
 *   2. fallback to the padded-numeric dir name without slug.
 *
 * Returns an absolute path even when the dir does not exist (callers
 * `appendIncomplete` create the queue file lazily; `mkdir -p` is the
 * caller's responsibility if the parent doesn't exist).
 */
function derivePhaseRoot(mainRepoRoot, phaseNumber) {
    const padded = String(phaseNumber).padStart(2, '0');
    const phasesParent = (0, node_path_1.join)(mainRepoRoot, '.planning', 'phases');
    if ((0, node_fs_1.existsSync)(phasesParent)) {
        const match = (0, node_fs_1.readdirSync)(phasesParent).find((d) => d === padded || d.startsWith(`${padded}-`));
        if (match)
            return (0, node_path_1.join)(phasesParent, match);
    }
    return (0, node_path_1.join)(phasesParent, padded);
}
/**
 * Phase 9 (VCS-16, PARALLEL-01 jj-side): dispatch — materialize N subagent
 * slots in the phase octopus structure.
 *
 * Phase 11 D-01/D-02: no manifest sidecar on disk; no per-subagent bookmark
 * creation. The returned Handle is the orchestrator's full state — only
 * persistent state is workspaces / bookmarks / HEADs themselves.
 *
 * The SDK-internal opts extend `ParallelDispatchOpts` with `mainRepoRoot`
 * (the main repo cwd) and `vcs` (a closure over the adapter's `workspace`
 * surface so `createSubagentSlot` can call `workspace.add(...)`). The
 * adapter wire-in at `backends/jj.ts` supplies both.
 */
function performJjParallelDispatch(opts) {
    const { mainRepoRoot, vcs, plan, phaseNumber, mainBookmarks } = opts;
    // W1: validate every agentId BEFORE any side effect that depends on it.
    // `createPhaseStructure` is idempotent (marker bookmarks) so even if a
    // retry follows a validation failure, the next attempt won't double-create
    // the parent/merge slot.
    for (const item of plan) {
        validateAgentId(item.agentId);
    }
    // Phase 14.1 (PARALLEL-08): the single up-front `validateMainBookmark`
    // call retired here — per-name validation moves to the fan-in
    // all-or-nothing loop (CF-02). `validateMainBookmark` itself is KEPT
    // (called per-name in the loop below).
    const phaseRoot = derivePhaseRoot(mainRepoRoot, phaseNumber);
    // 1. Lazy phase structure (parent + merge slot). Idempotent.
    const { parentChange, mergeChange } = (0, octopus_cjs_1.createPhaseStructure)(mainRepoRoot, '@-', phaseNumber);
    // 2. Dispatch loop: one subagent slot per plan item.
    const slots = [];
    for (let i = 0; i < plan.length; i++) {
        const item = plan[i];
        const idx = i + 1;
        const slot = (0, octopus_cjs_1.createSubagentSlot)(mainRepoRoot, vcs, {
            parentChange,
            mergeChange,
            idx,
            phaseNum: phaseNumber,
            workspacePath: item.workspacePath,
        });
        slots.push({
            workspaceName: slot.workspaceName,
            workspacePath: slot.workspacePath,
            headChange: slot.headChange,
            agentId: item.agentId,
            planId: item.planId,
            idx,
        });
    }
    // Phase 11 D-02 (cross-phase amendment): eager agent-bookmark creation
    // retired. The octopus structure built by `createPhaseStructure` +
    // `createSubagentSlot` already references each slot's head as a parent of
    // the phase-merge change (see N-parent `jj new` in `performJjParallelFanIn`
    // below) — bookmarks were redundant scaffolding. On jj this scaffolding now
    // goes; on git the `worktree-agent-*` branches stay (load-bearing backend
    // asymmetry — git worktrees can't track anonymous heads ergonomically).
    // Phase 11 D-01: no manifest sidecar on disk. The previous VCS-19 manifest
    // writer is retired — only persistent state is workspaces / bookmarks /
    // HEADs themselves. `handle.manifest` is the empty string to mirror
    // `bin/lib/worktree-safety.cjs::reconstructHandleFromLegacyPlan` (which has
    // always set it to the empty string). Fan-in discovers the workspace set
    // from the Handle's frozen workspaces[] array — see `performJjParallelFanIn`
    // below.
    // 5. Frozen pure-JSON handle (D-05). Inner workspaces array + each entry
    // are also frozen. `baselineOpId` is included as `undefined` per D-01/D-06
    // forward-compat reservation (Plan 01 kept the field on the type).
    return Object.freeze({
        phaseRoot,
        phaseNumber,
        // Phase 14.1 (PARALLEL-08, CF-05): frozen mirror of opts.mainBookmarks
        // preserves pure-JSON cross-call immutability. Defensive shallow copy
        // before freeze guards against caller mutation of the input array.
        mainBookmarks: Object.freeze([...(mainBookmarks ?? [])]),
        manifest: '', // D-01: no orchestrator-managed sidecar state (parity with bin/lib/worktree-safety.cjs:reconstructHandleFromLegacyPlan)
        workspaces: Object.freeze(slots.map((s) => Object.freeze({
            name: s.workspaceName,
            path: s.workspacePath,
            baseRev: s.headChange,
            agentId: s.agentId,
            baselineOpId: undefined,
        }))),
        // `parentChange` / `mergeChange` are intentionally NOT on the handle —
        // fanIn re-derives the merge change_id from `@` after the N-parent
        // `jj new`. The type contract at types.ts:493-518 fixes the field set.
    });
}
/**
 * Phase 9 (VCS-16, PARALLEL-02 jj-side): fanIn — single N-parent `jj new`,
 * conflict probe, on-clean main-bookmark advance, on-conflict W3 (a)
 * `merge-in-tree-conflict` queue entry, and crashed-agent reap via
 * `performJjReap`. (Phase 11 D-02: per-subagent bookmark delete retired
 * along with the matching create loop in dispatch.)
 *
 * W3 (a) rationale (D-16 joint-assertion lock-in): when the N-parent
 * octopus produces an in-tree conflict on otherwise CLEAN agents, fanIn
 * itself appends a `merge-in-tree-conflict` queue entry for the MERGE HEAD
 * — so D-16's joint assertion (`conflicted: true` + `conflictedPaths`
 * populated + queue entry with `reason === 'merge-in-tree-conflict'`)
 * fires from a single coherent code path. reap.ts's orthogonal classifier
 * branch handles the CRASHED-agent case where the agent's own head is
 * conflicted; both producers emit the same reason literal but queue under
 * different `subagentName` / `changeIdShort` values.
 */
function performJjParallelFanIn(mainRepoRoot, handle, results) {
    const phaseTag = String(handle.phaseNumber).padStart(2, '0');
    // Pre-step: re-resolve each workspace's CURRENT head from `jj workspace
    // list -T 'json(self) ++ "\n"'`. The handle's `ws.baseRev` is the
    // dispatch-time SLOT head — empty by construction. Agents land their
    // work AFTER dispatch (typical `jj squash -B @ -k -m "..."` moves the WC
    // diff into a NEW change between `@-` and `@`); the slot head never
    // advances. Feeding `baseRev` raw to the N-parent `jj new` would merge
    // empty slot heads, silently dropping every agent's work and making the
    // merge change indistinguishable from the dispatch-time scaffold.
    //
    // Bug-fix rationale (plan 09.05 Rule 1): the production-code merge target
    // must be the workspace's current `@` (which is the agent's working-copy
    // head; for `-B @` flows this is the empty WC placeholder above the
    // work change, but the work change itself is still reachable from this
    // `@` via `@-` and therefore included in the merge tree). Mirrors the
    // same `workspace.list()` re-resolution that `backends/jj.ts:1115-1135`
    // (`workspace.reap`) performs for the same reason.
    // Subagents commit work from inside their workspaces, which bumps the
    // shared op log; the main repo's WC pointer doesn't auto-advance, so
    // `jj workspace list` from mainRepoRoot here will fail with "stale WC"
    // (D-13 forbids --ignore-working-copy as the read-side escape). Refresh
    // proactively — update-stale is a no-op when the WC is fresh. Mirrors the
    // pattern in backends/jj.ts workspace.add baseRef remediation.
    const updateStaleArgs = [
        ...jjArgvFlags(mainRepoRoot),
        'workspace', 'update-stale',
    ];
    (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'jj', updateStaleArgs);
    const wsListArgs = [
        ...jjArgvFlags(mainRepoRoot),
        'workspace', 'list', '-T', 'json(self) ++ "\\n"',
    ];
    const wsListRes = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'jj', wsListArgs);
    if (wsListRes.exitCode !== 0) {
        throw new Error(`parallel.fanIn: workspace list (pre-merge head re-resolution) failed: ${wsListRes.stderr || wsListRes.stdout}`);
    }
    const currentHeads = new Map();
    for (const entry of (0, jj_workspace_list_cjs_1.parseJjWorkspaceList)(wsListRes.stdout)) {
        currentHeads.set(entry.path, entry.rev);
    }
    const mergeParents = [];
    for (const ws of handle.workspaces) {
        // Re-resolved current `@` of the workspace; fall back to the stale
        // `baseRev` if the workspace dropped out of `jj workspace list`
        // (defensive — keeps the argv list well-formed). For a clean
        // `-B @` flow the agent's work change is `@-` and therefore
        // transitively reachable from `@`.
        const currentHead = currentHeads.get(ws.name) ?? ws.baseRev;
        mergeParents.push(currentHead);
    }
    // 1. N-parent jj new at @: `-r @ -r <p1> -r <p2> ...`. Lift the 2-parent
    // precedent at backends/jj.ts:1180-1188 to N parents.
    const newArgs = [...jjArgvFlags(mainRepoRoot), 'new', '-r', '@'];
    for (const p of mergeParents) {
        newArgs.push('-r', p);
    }
    newArgs.push('-m', `phase ${phaseTag} merge: ${handle.workspaces.length} parents`);
    const newRes = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'jj', newArgs);
    if (newRes.exitCode !== 0) {
        throw new Error(`parallel.fanIn: N-parent jj new failed (N=${handle.workspaces.length}): ${newRes.stderr || newRes.stdout}`);
    }
    // 2. Resolve the new merge change_id at `@`.
    const mergeChangeId = resolveChangeId(mainRepoRoot, '@');
    // 3. Probe conflicts. Two-stage to avoid `enumerateConflictedPaths`'s
    // `<UNRESOLVABLE>` fallback firing on non-conflicted merges:
    //   stage 1: `conflicts() & <mergeChangeId>` revset — boolean gate, mirrors
    //            reap.ts's `hasInTreeConflict` probe at reap.ts:88-101.
    //   stage 2: only if stage 1 said yes, enumerate paths via the sidecar.
    //
    // Bug-fix rationale (plan 09.05 Rule 1): the original parallel.ts called
    // `enumerateConflictedPaths` unconditionally and derived `conflicted` from
    // its return length. But the sidecar's WR-04 contract is "return
    // `['<UNRESOLVABLE>']` when `conflicts()` flagged the rev but enumeration
    // drew a blank" — it assumes the caller already gated on `conflicts()`.
    // On a clean merge the sidecar still returned `['<UNRESOLVABLE>']`
    // (`jj resolve --list` prints nothing on a conflict-free rev → WR-04
    // sentinel), making `conflicted` always true. Gate explicitly here so
    // the sidecar's behavior matches its contract.
    const conflictsProbeArgs = [
        ...jjArgvFlags(mainRepoRoot),
        'log', '-r', `conflicts() & ${mergeChangeId}`,
        '-T', 'change_id ++ "\\n"', '--no-graph',
    ];
    const conflictsProbe = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'jj', conflictsProbeArgs);
    if (conflictsProbe.exitCode !== 0) {
        throw new Error(`parallel.fanIn: conflicts() probe at ${mergeChangeId} failed: ${conflictsProbe.stderr || conflictsProbe.stdout}`);
    }
    const conflicted = conflictsProbe.stdout.trim().length > 0;
    const conflictedPaths = conflicted
        ? (0, conflict_paths_cjs_1.enumerateConflictedPaths)(mainRepoRoot, mergeChangeId)
        : [];
    let incompleteQueued = 0;
    const merged = [];
    let surplusBookmarks = [];
    const failedReaped = [];
    if (conflicted) {
        // W3 (a) / CF-03 / AP-5 (Phase 16.02 lock-in): workspaces are PRESERVED
        // on disk here for human inspection of the conflicted state. NO call to
        // cleanupSubagentWorkspaces — the joint-assertion contract (ROADMAP SC4)
        // makes this divergence from the clean-path branch load-bearing. DO NOT
        // add reap here; the cleanup-omission is intentional and tested by the
        // inverse assertion in cmd-parallel-jj.test.ts conflicted describe.
        // See .planning/phases/16-workflow-invariant-tooling/16-CONTEXT.md
        // CF-03 + Success Criterion 4.
        // W3 (a): enqueue a merge-in-tree-conflict entry for the merge HEAD.
        // The on-disk dir + workspace tracking for each agent are LEFT intact
        // (no main-bookmark advance) so the user can inspect the conflicted
        // state before resolving or discarding.
        const mergeEntry = {
            subagentName: `phase-${phaseTag}-merge`,
            changeIdShort: mergeChangeId.slice(0, 12),
            workspacePath: handle.phaseRoot,
            reason: 'merge-in-tree-conflict',
        };
        (0, incomplete_work_cjs_1.appendIncomplete)(handle.phaseRoot, mergeEntry);
        incompleteQueued += 1;
        // Phase 11 D-02: surplusBookmarks stays at its `[]` initialization on
        // the conflicted branch too — no bookmark plumbing fires either way.
        surplusBookmarks = [];
    }
    else {
        // Clean path: advance each named main bookmark to the merge head if
        // the dispatch-time list was non-empty.
        //
        // Phase 14.1 (PARALLEL-08, CF-02): empty/omitted `mainBookmarks` ↔
        // SKIP the advance step entirely — bookmark-less jj `@` is a first-
        // class working state for parallel dispatch. Non-empty list ↔
        // all-or-nothing pre-validation in pass 1 (mirrors the W1 idiom at
        // :178-188), then sequential `jj bookmark set <name> -r @` per name
        // in pass 2.
        //
        // Partial-state caveat: pass 2 advances names in argv order; on a
        // vcsExec failure at name K, names 1..K-1 already advanced. Atomic
        // rollback via `jj op restore` is deferred (no atomic primitive
        // available at this layer; surface noted in PARALLEL-08 CONTEXT.md
        // "Mid-iteration jj bookmark set failure semantics").
        //
        // Per Phase 11 D-02 there are no per-subagent agent-bookmarks to
        // delete here — see comment block below.
        const mainBookmarks = handle.mainBookmarks ?? [];
        if (mainBookmarks.length > 0) {
            // Pass 1: validate every name. Throws on first invalid; no side
            // effects yet.
            for (const name of mainBookmarks) {
                validateMainBookmark(name);
            }
            // Pass 2: advance each. Partial-state on mid-iteration failure
            // is documented above; no atomic rollback at this layer.
            for (const name of mainBookmarks) {
                const setArgs = [
                    ...jjArgvFlags(mainRepoRoot),
                    'bookmark', 'set', name, '-r', '@',
                ];
                const setRes = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'jj', setArgs);
                if (setRes.exitCode !== 0) {
                    throw new Error(`parallel.fanIn: main-bookmark advance (${name}) failed: ${setRes.stderr || setRes.stdout}`);
                }
            }
        }
        // Phase 11 D-02 (cross-phase amendment): batched bookmark-delete and
        // post-delete surplus sweep retired. The dispatch loop no longer
        // creates `gsd/phase-{NN}-subagent-{idx}` bookmarks, so there is
        // nothing to delete here and the post-merge `surplusBookmarks` field
        // is `[]` by construction. The type-contract field stays on
        // `FanInResult` (default-initialized above) for cross-backend symmetry.
        merged.push(mergeChangeId);
        // CLEANUP-02 / Phase 16.02 (D-07): tear down materialized subagent
        // workspaces on the clean path. Handle.workspaces is the authoritative
        // source-of-truth (Pitfall 4 mitigation per Phase 15 N1 — custom
        // workspacePath overrides MUST be honored). Direct TS-side call (NOT via
        // the CLI bridge — bridge is for bash consumers only per D-07). The
        // helper returns {abandoned, failedReaped}; only failedReaped is merged
        // into FanInResult (no `abandoned` field on FanInResult — that's
        // CancelResult-only shape per parallel.ts:557-561 self-precedent).
        //
        // Phase 16 REVIEW CR-01 fix: EXCLUDE crashed-agent workspaces from the
        // cleanup list. The reap loop below (lines 499-523) writes an
        // IncompleteWorkEntry whose `workspacePath` field points to the
        // crashed agent's on-disk workspace dir — that path must remain LIVE
        // so the human reviewer can recover partial work. This mirrors the
        // W3(a) forensic-preservation contract that the conflicted-branch
        // path explicitly upholds (parallel.ts:394-402 + cmd-parallel-jj.test.ts
        // :333-343 inverse assertion). Without this filter, a mixed
        // clean-merge-with-crashed-agent scenario would tear down the crashed
        // agent's dir before the queue entry surfaces — pointing the recovery
        // surface at a deleted path.
        const crashedAgentIds = new Set(results.filter((r) => r.exitCode !== 0).map((r) => r.agentId));
        const workspacesToReap = handle.workspaces.filter((ws) => !crashedAgentIds.has(ws.agentId));
        const { failedReaped: cleanupFailedReaped } = (0, workspace_cleanup_cjs_1.cleanupSubagentWorkspaces)(mainRepoRoot, handle.phaseNumber, workspacesToReap);
        for (const name of cleanupFailedReaped)
            failedReaped.push(name);
    }
    // 4. Reap crashed agents — those with exitCode !== 0 in the results array.
    // Reuses the `currentHeads` map built at the top of this function (the
    // same re-resolved-current-head map the N-parent merge consumed).
    //
    // Bug-fix rationale (plan 09.05 Rule 1): `ws.baseRev` is the EMPTY slot
    // head materialized at dispatch time. A crashed agent's uncommitted work
    // landed in a NEW change via auto-snapshot, so its workspace `@` no longer
    // equals `ws.baseRev`. Feeding `ws.baseRev` as the `headChange` to
    // `performJjReap` makes `isEmptyHead` probe the wrong revision (the
    // already-empty slot head) and reap classifies the workspace as empty
    // rather than crashed — silently dropping the queue entry the orchestrator
    // expects. Re-resolving via `workspace.list()` matches the production path
    // `backends/jj.ts:1115-1135` (`workspace.reap`) takes for the same reason.
    const crashed = results.filter((r) => r.exitCode !== 0);
    if (crashed.length > 0) {
        const crashedAgentIds = new Set(crashed.map((r) => r.agentId));
        const reapEntries = handle.workspaces
            .filter((ws) => crashedAgentIds.has(ws.agentId))
            .map((ws) => ({
            name: ws.name,
            // Re-resolved current `@` from `jj workspace list`; fall back to
            // the stale `ws.baseRev` only if the workspace dropped out of
            // `jj workspace list` (e.g., already forgotten) — that case
            // still hands a defined string to reap rather than `undefined`.
            headChange: currentHeads.get(ws.name) ?? ws.baseRev,
            path: ws.path,
        }));
        const reapResult = (0, reap_cjs_1.performJjReap)({
            mainRepoRoot,
            phaseNamePrefix: `phase-${phaseTag}`,
            phaseDir: handle.phaseRoot,
            entries: reapEntries,
        });
        for (const a of reapResult.abandoned) {
            failedReaped.push(a.name);
        }
        incompleteQueued += reapResult.incomplete.length;
    }
    return Object.freeze({
        merged: Object.freeze(merged.slice()),
        conflicted,
        conflictedPaths: Object.freeze(conflictedPaths.slice()),
        incompleteQueued,
        failedReaped: Object.freeze(failedReaped.slice()),
        surplusBookmarks: Object.freeze(surplusBookmarks.slice()),
    });
}
/**
 * Phase 15.04 (PARALLEL-07 / Wave 2b): synchronous teardown of materialized
 * subagent workspaces. Delegates per-workspace cleanup to the
 * `cleanupSubagentWorkspaces` helper (Wave 1 sidecar at
 * `./workspace-cleanup.js`) and wraps the partial result into the full
 * 4-field `CancelResult` envelope (D-01).
 *
 * CF-05 STACK-lens (synchronous teardown only): `spawnSync` at
 * `sdk/src/vcs/exec.ts:19` cannot accept `AbortSignal`. Does NOT signal
 * subagent processes. Phase 9 D-01 orchestrator-awaits-`Agent()` invariant +
 * Phase 11 D-01 no-orchestrator-sidecar-state make mid-flight cancel a
 * non-problem in production.
 *
 * D-04 file-boundary helper extraction: the per-workspace
 * `jj workspace forget + rmSync` body lives in `./workspace-cleanup.js`, NOT
 * in `./reap.js`. `reap.ts` preserves W3(a) "leave conflicted workspaces for
 * inspection"; this verb tears down everything explicitly requested. The
 * file split makes the contract divergence enforceable.
 *
 * D-03 idempotency: re-call returns `CancelResult` with all-empty arrays —
 * the helper's existsSync gate + already-gone-skip closes the second call.
 *
 * Pattern S3 frozen pure-JSON: return value is `Object.freeze(...)`'d with
 * frozen inner arrays. Survives JSON round-trip without semantic loss (Phase
 * 9 D-05 invariant).
 *
 * Phase 11 D-02: jj-side `surplusBookmarks` is `[]` by construction — the
 * per-subagent `gsd/phase-{NN}-subagent-{idx}` bookmarks retired with the
 * dispatcher's eager-bookmark-create loop. The type-contract field stays for
 * cross-backend symmetry (git keeps `worktree-agent-*` branches).
 */
function performJjParallelCancel(mainRepoRoot, handle) {
    // Count surplus workspaces at entry (D-02 — counted pre-cleanup regardless
    // of teardown outcome). Filter Handle's workspaces by existsSync so the
    // metric reflects on-disk reality at call time.
    const surplusWorkspaces = handle.workspaces
        .filter((ws) => (0, node_fs_1.existsSync)(ws.path))
        .map((ws) => ws.path);
    // Delegate per-workspace teardown to the helper. Pass `handle.workspaces`
    // as the authoritative list (Pitfall 4 mitigation per N1 — custom
    // `workspacePath` overrides MUST be honored).
    const { abandoned, failedReaped } = (0, workspace_cleanup_cjs_1.cleanupSubagentWorkspaces)(mainRepoRoot, handle.phaseNumber, handle.workspaces);
    // jj-side surplus-bookmark sweep is a no-op: Phase 11 D-02 retired the
    // per-subagent agent-bookmark creation loop in `performJjParallelDispatch`,
    // so there are no `gsd/phase-{NN}-subagent-*` bookmarks to force-delete.
    const surplusBookmarks = [];
    return Object.freeze({
        abandoned: Object.freeze(abandoned.slice()),
        failedReaped: Object.freeze(failedReaped.slice()),
        surplusBookmarks: Object.freeze(surplusBookmarks.slice()),
        surplusWorkspaces: Object.freeze(surplusWorkspaces.slice()),
    });
}
