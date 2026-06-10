"use strict";
/**
 * sdk/src/vcs/git/parallel.ts — Phase 10 (VCS-18, PARALLEL-01/02 git-side)
 *
 * Adapter-internal sidecar housing the git-side bodies of
 * `vcs.workspace.parallel.{dispatch,fanIn}`. Replaces the Phase 9 throwing
 * stub at `backends/git.ts:723-734` (the wire-in itself lives in Plan 10.03).
 *
 * Cross-backend contract: same `ParallelDispatchHandle` and `FanInResult`
 * shapes the jj-side already populates (D-13 LOCKED at Phase 9 D-08 — six
 * fields: merged, conflicted, conflictedPaths, incompleteQueued,
 * failedReaped, surplusBookmarks). The dispatch loop and the `merged: string[]`
 * population pattern are the only visible cross-backend differences:
 *
 *   - **D-01:** `fanIn` is a per-branch 2-parent `git merge --no-ff
 *     <agentBookmark>` LOOP, NOT an N-parent octopus. Lifts the existing
 *     orchestrator-tier merge-loop body at `bin/lib/worktree-safety.cjs:417-516`
 *     into TS without changing its merge shape.
 *   - **D-02:** On the first per-branch merge that conflicts, the loop HALTS
 *     and returns. The primary worktree is left in mid-merge state
 *     (MERGE_HEAD set, conflict markers, unmerged index entries) — matches
 *     the existing 2-parent precedent at `backends/git.ts:660-705`. User
 *     resolves with normal git tooling (`git add` → `git commit` of the
 *     merge, OR `git merge --abort`).
 *   - **D-03:** `fanIn` is idempotent / re-callable. Per-workspace stateless
 *     probe: `git merge-base --is-ancestor <agentBookmark> HEAD` → exit 0
 *     means already merged (skip); exit 128 / "Not a valid object name"
 *     means branch deleted by a prior call (skip). Same handle is passed on
 *     every re-call; no sidecar state file.
 *   - **D-04:** Per-success cleanup INSIDE the loop. Each successful merge
 *     immediately fires `git worktree remove <path>` (non-force per ROADMAP
 *     SC1) + `git branch -D <agentBookmark>` for THAT workspace before the
 *     loop advances.
 *   - **D-05:** `performGitParallelDispatch`'s worktree-create loop is a
 *     plain `for`-loop with sync `vcsExec`. The MANDATORY inline comment at
 *     the loop header cites PITFALLS Pitfall 5 (`.git/config.lock` race) and
 *     names `spawnSync` as the structural protection — any future refactor
 *     to async `vcsExec` MUST revisit this decision rather than silently
 *     regress. See loop comment block below.
 *
 * Reap-classifier extension producers (Phase 9 D-09 widened the reason
 * union from 1→2; this file adds the git-side producers):
 *
 *   - **D-06:** Crashed-agent classifier writes `IncompleteWorkEntry` with
 *     `reason='crashed-with-uncommitted-work'` and
 *     `changeIdShort=<branchTipShortSha>` when an agent's `result.exitCode
 *     !== 0` AND (branch tip != baseRev OR `git status --porcelain`
 *     non-empty). When tip == baseRev AND tree clean, emit no queue write
 *     (abandoned-style).
 *   - **D-07:** Non-force `worktree remove` refusing dirty trees is a
 *     feature, not a bug. The dirty worktree survives on disk; the queued
 *     entry's `workspacePath` is the human-inspection handle. Per Pitfall 3
 *     ("preserve partial work"), the refusal is the structural
 *     implementation.
 *   - **D-08:** The `'merge-in-tree-conflict'` producer fires INSIDE the
 *     fanIn loop body (NOT inside reap), enumerating paths via
 *     `git diff --name-only --diff-filter=U` and writing through
 *     `appendIncomplete` from `../jj/incomplete-work.js`.
 *
 * Carry-forward decisions:
 *
 *   - **D-13 (carry):** `FanInResult` shape locked. `merged: string[]` —
 *     git fills with up to N short SHAs in loop order; jj fills with one
 *     change_id (already shipped). `conflicted: boolean` — true on git when
 *     the loop halts on a merge conflict.
 *   - **D-14 (carry):** `baseRev` JSDoc semantics — commit_id (SHA) on git;
 *     change_id on jj (rebase-stable revision pointer per the unified
 *     v1.2 revision model).
 *   - **D-15 (carry):** `IncompleteWorkEntry.reason` enum is widened to 2
 *     values by Phase 9 in `sdk/src/vcs/jj/reap.ts`. This file adds the
 *     git-side PRODUCER for `'merge-in-tree-conflict'` — does NOT
 *     re-extend the enum.
 *   - **D-16 (carry):** No raw `child_process` here. `vcsExec` is the sole
 *     subprocess primitive. Returns are pure-JSON `Object.freeze`'d
 *     (no closures/methods/Symbols/class instances) — survive
 *     `gsd-sdk query` JSON round-trip.
 *
 * UPSTREAM-02 sidecar discipline (mirrored from `sdk/src/vcs/jj/parallel.ts`):
 * this file does NOT import from `backends/git.ts` or any path under
 * `backends/`. The wire-in at `backends/git.ts` (Plan 10.03) imports the
 * two exports below; never the reverse.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.performGitParallelDispatch = performGitParallelDispatch;
exports.performGitParallelFanIn = performGitParallelFanIn;
exports.performGitParallelCancel = performGitParallelCancel;
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const exec_cjs_1 = require("../exec.cjs");
const incomplete_work_cjs_1 = require("../jj/incomplete-work.cjs");
const parallel_cjs_1 = require("../jj/parallel.cjs");
const refs_validator_cjs_1 = require("../refs-validator.cjs");
/**
 * Inline agentId validator. UPSTREAM-02 sidecar discipline: this file does
 * NOT import `validateRefname` from `backends/git.ts` — the inline regex
 * here is short enough that the import would just exchange one defect surface
 * for another. Mirrors `jj/parallel.ts:92-98` verbatim.
 *
 * The branch literal we emit into the manifest and into raw git verbs is
 * `worktree-agent-${agentId}`, so the agentId itself must satisfy the
 * worktree-safety.cjs:334 character class for the prefixed result to clear
 * the reader regex. agentIds containing whitespace or other characters
 * outside this class would silently drop at the manifest reader, losing
 * track of the workspace.
 */
function validateAgentId(name) {
    if (!/^[A-Za-z0-9._/-]+$/.test(name)) {
        throw new Error(`parallel.dispatch: agentId "${name}" violates worktree-safety manifest character class /^[A-Za-z0-9._/-]+$/ (see get-shit-done/bin/lib/worktree-safety.cjs:334)`);
    }
}
/**
 * Phase 10 (VCS-18, PARALLEL-01 git-side): dispatch — materialize N
 * worktree slots, eagerly create per-agent branches via the workspace.add
 * DI seam, and write the WAVE_WORKTREE_MANIFEST with `backend: 'git'`.
 *
 * The SDK-internal opts extend `ParallelDispatchOpts` with `mainRepoRoot`
 * (the main repo cwd) and `vcs` (a closure over the adapter's `workspace`
 * surface so the dispatch loop can call `workspace.add(...)`). The adapter
 * wire-in at `backends/git.ts` (Plan 10.03) supplies both.
 *
 * Mirrors `performJjParallelDispatch` at `jj/parallel.ts:164-289`
 * structurally — see that function for the cross-backend reference. The
 * git-side body diverges only at:
 *   - no `createPhaseStructure` / `createSubagentSlot` call (no octopus
 *     parent/merge change to lazy-create on git);
 *   - capture of `headSha` via `git rev-parse <agentBookmark>` rather than
 *     re-using the slot.headChange returned by `createSubagentSlot`;
 *   - manifest body literal `backend: 'git' as const`.
 */
function performGitParallelDispatch(opts) {
    const { mainRepoRoot, vcs, plan, phaseNumber, mainBookmarks } = opts;
    const phaseTag = String(phaseNumber).padStart(2, '0');
    const phaseRoot = (0, parallel_cjs_1.derivePhaseRoot)(mainRepoRoot, phaseNumber);
    const slots = [];
    // PITFALLS Pitfall 5 — `.git/config.lock` race protection (D-05).
    //
    // This loop uses a plain synchronous `for` with `vcsExec` (which wraps
    // `spawnSync`). `spawnSync` BLOCKS the event loop for the full duration
    // of each child git invocation, so intra-process serialization comes
    // from the runtime — there is NO explicit semaphore, flock sentinel, or
    // `proper-lockfile` dep. This serialization IS the structural protection
    // against the `.git/config.lock` race that two concurrent `git worktree
    // add` invocations would trigger inside a single repo. Vitest per-file
    // process parallelism cannot race because each test file gets its own
    // `mkdtemp` repo (Pattern B); the production orchestrator is
    // single-process-per-wave by construction.
    //
    // **ANY future refactor to async `vcsExec` (or `Promise.all` over this
    // loop) MUST revisit this decision rather than silently regress** — the
    // serial behavior IS the protection, and it is invisible without this
    // comment.
    for (let i = 0; i < plan.length; i++) {
        const item = plan[i];
        const idx = i + 1;
        validateAgentId(item.agentId);
        const workspaceName = `phase-${phaseTag}-subagent-${idx}`;
        const agentBookmark = `worktree-agent-${item.agentId}`;
        // Default workspace path mirrors the jj-side workspaces[].path
        // semantics: per-agent dir under `<mainRepoRoot>/.gsd-workspaces/`.
        const wsPath = item.workspacePath
            ?? (0, node_path_1.join)(mainRepoRoot, '.gsd-workspaces', workspaceName);
        // Compose the existing workspace.add primitive (backends/git.ts:570-582)
        // via the DI seam. The `name` field becomes the new branch on git
        // (`git worktree add <path> -b <name>` — base defaults to HEAD when
        // `baseRef` is omitted, matching jj-side dispatch which also does
        // not thread baseRef through ParallelDispatchOpts.plan items per
        // the locked Phase 9 type at types.ts:464-469).
        vcs.workspace.add({
            path: wsPath,
            name: agentBookmark,
        });
        // Capture the agent branch's tip commit_id for the handle's baseRev
        // (D-14 carry: commit_id on git; change_id on jj). Read via the
        // `mainRepoRoot` cwd — the agent-branch ref is reachable from the
        // shared object DB regardless of which worktree currently checks it
        // out.
        const headRes = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'git', ['rev-parse', agentBookmark]);
        if (headRes.exitCode !== 0) {
            throw new Error(`parallel.dispatch: rev-parse ${agentBookmark} failed: ${headRes.stderr || headRes.stdout}`);
        }
        const headSha = headRes.stdout.trim();
        slots.push({
            workspaceName,
            workspacePath: wsPath,
            headSha,
            agentId: item.agentId,
            planId: item.planId,
            idx,
        });
    }
    // WAVE_WORKTREE_MANIFEST writer (VCS-19). Mirror jj/parallel.ts:252-265
    // — change `backend: 'jj' as const` to `backend: 'git' as const`.
    // Allocated under a fresh `mkdtemp` to avoid collisions with concurrent
    // orchestrator processes (and with the workflow-markdown writer that
    // collapses in Phase 11).
    const manifestDir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'gsd-wave-manifest-'));
    const manifestPath = (0, node_path_1.join)(manifestDir, 'wave-worktree-manifest.json');
    // Phase 14.1 (PARALLEL-08 / "Manifest writer cleanup"): the `main_bookmark`
    // row is DROPPED from this manifest writer. No live reader on either
    // backend (jj-side already emits `manifest: ''` per Phase 11 D-01; the
    // workflow-side reader was retired in Phase 11 P05). Other rows stay for
    // parity with jj-side state introspection.
    const manifestBody = {
        worktrees: slots.map((slot) => ({
            agent_id: slot.agentId,
            plan_id: slot.planId,
            backend: 'git',
            worktree_path: slot.workspacePath,
            branch: `worktree-agent-${slot.agentId}`,
            expected_base: slot.headSha,
        })),
    };
    (0, node_fs_1.writeFileSync)(manifestPath, JSON.stringify(manifestBody, null, 2), 'utf-8');
    // Frozen pure-JSON handle (D-13/D-16). Inner workspaces array + each
    // entry are also frozen. `baselineOpId` is included as `undefined` per
    // D-01/D-06 forward-compat reservation (Plan 9.01 kept the field on the
    // type).
    return Object.freeze({
        phaseRoot,
        phaseNumber,
        // Phase 14.1 (PARALLEL-08, CF-05): frozen mirror of opts.mainBookmarks
        // preserves pure-JSON cross-call immutability. Defensive shallow copy
        // before freeze guards against caller mutation of the input array.
        mainBookmarks: Object.freeze([...(mainBookmarks ?? [])]),
        manifest: manifestPath,
        workspaces: Object.freeze(slots.map((s) => Object.freeze({
            name: s.workspaceName,
            path: s.workspacePath,
            baseRev: s.headSha,
            agentId: s.agentId,
            baselineOpId: undefined,
        }))),
    });
}
/**
 * Phase 10 (VCS-18, PARALLEL-02 git-side): fanIn — per-branch 2-parent
 * `git merge --no-ff` LOOP, halt on first conflict, idempotent under
 * re-call via stateless `git merge-base --is-ancestor` skip, per-success
 * cleanup, crashed-agent classifier, surplus-bookmark audit.
 *
 * NORMATIVE: signature mirrors `performJjParallelFanIn` at
 * `jj/parallel.ts:308-315` verbatim — `(mainRepoRoot, handle, results):
 * FanInResult`. NO `vcs` DI arg. All raw git verbs (`merge --no-ff`,
 * `worktree remove`, `branch -D`, `merge-base --is-ancestor`,
 * `diff --name-only --diff-filter=U`, `rev-parse`, `status --porcelain`,
 * `for-each-ref`) are invoked via direct `vcsExec(mainRepoRoot, 'git',
 * [...])` calls — exactly mirroring jj-side fanIn at `jj/parallel.ts:366`
 * which calls `vcsExec(mainRepoRoot, 'jj', ['new', '-r', ...])` directly
 * without composing `workspace.merge` or `workspace.remove`. This is
 * required because the wire-in template at `backends/jj.ts:1255-1264`
 * passes ONLY `(cwd, handle, results)` to fanIn; the git-side wire-in
 * (Plan 10.03) MUST mirror that exact shape.
 *
 * Re-call walk-through (D-03):
 *   dispatch N=3 (agents A, B, C). First fanIn call: A merges clean (per-
 *   success cleanup removes its worktree + branch), B conflicts → halt.
 *   Returns `{merged: [<shaA>], conflicted: true, conflictedPaths: [...],
 *   incompleteQueued: 1, ...}`. User resolves B's conflict, commits the
 *   merge manually. Second fanIn call with the SAME handle:
 *   `merge-base --is-ancestor` skips A (branch deleted: exit 128) and
 *   skips B (now merged via user's manual commit: exit 0); merges C clean.
 *   Returns `{merged: [<shaC>], conflicted: false, ...}`. C's worktree +
 *   branch cleaned up.
 *
 * `merged: string[]` is per-call, NOT cumulative across re-calls. The
 * orchestrator/caller is responsible for accumulating across re-calls if
 * it needs a total count.
 */
function performGitParallelFanIn(mainRepoRoot, handle, results) {
    // W-1: bind phaseTag at the top so the merge-message template literal
    // `phase ${phaseTag} merge: ${ws.agentId}` is well-formed.
    const phaseTag = String(handle.phaseNumber).padStart(2, '0');
    // WR-03 pre-flight: refuse to run with a wedged in-progress merge. If
    // MERGE_HEAD is set (a prior fanIn halted on conflict and the user has
    // not yet `git commit`/`git merge --abort`'d), the next `git merge
    // --no-ff` exits non-zero with "You have not concluded your merge". The
    // loop body's conflict regex (line 367) does NOT match that stderr, so
    // the fallthrough at line 369 would queue another
    // `merge-in-tree-conflict` entry with `conflictedPaths` derived from
    // the PREVIOUS wedged merge's unmerged index — i.e. wrong data in the
    // cross-backend queue. Halting up-front with a clear error directs the
    // caller to resolve the prior wedge before re-call.
    const mergeHeadProbe = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'git', ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD']);
    if (mergeHeadProbe.exitCode === 0) {
        throw new Error(`parallel.fanIn: refusing to run with mid-merge state (MERGE_HEAD set); resolve via 'git commit' or 'git merge --abort' first`);
    }
    const merged = [];
    let conflicted = false;
    let conflictedPaths = [];
    let incompleteQueued = 0;
    const failedReaped = [];
    const surplusBookmarks = [];
    // ── STEP 1: fan-in loop (D-01..D-04, D-08). ──────────────────────────
    // Each iteration issues raw git verbs DIRECTLY via vcsExec — NO
    // workspace.merge / workspace.remove composition (mirrors jj-side
    // fanIn's direct `vcsExec(... 'jj', ['new', '-r', ...])` at
    // jj/parallel.ts:366; here the verb is `git merge --no-ff` instead).
    //
    // CR-01 / SC2 gate (Phase 10 plan 05 — closes VERIFICATION.md gap):
    // crashed agents (`result.exitCode !== 0`) are filtered OUT of this
    // loop before the `merge-base --is-ancestor` probe. Without this gate,
    // an agent that committed N partial commits before crashing has its
    // branch tip != baseRev, so the probe at line 335 does NOT skip it,
    // and `git merge --no-ff` at line 347 silently merges the partial
    // work into main — the orchestrator gets `conflicted: false` and
    // never learns the crash happened. With this gate, crashed agents are
    // routed EXCLUSIVELY through STEP 2's crashed-agent classifier so the
    // `crashed-with-uncommitted-work` queue entry is the only side
    // effect. The Set is local-scoped (never returned); no late-binding
    // mutation possible (T-10-05-01 in threat register).
    const crashedAgentIds = new Set(results.filter((r) => r.exitCode !== 0).map((r) => r.agentId));
    for (const ws of handle.workspaces) {
        if (crashedAgentIds.has(ws.agentId))
            continue;
        const agentBookmark = `worktree-agent-${ws.agentId}`;
        // D-03 stateless re-call probe. Pass branch NAME (not SHA). Per
        // Plan-research Open Q3 / Pitfall 3:
        //   exit 0      → ancestor; already merged on prior call → skip
        //                 (do NOT push to merged[] — `merged` is per-call)
        //   exit 128 OR
        //   stderr ~ "Not a valid object name"
        //               → branch deleted by prior call → definitively skip
        //   exit 1 (or
        //   any other) → not ancestor → process this workspace
        const probe = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'git', ['merge-base', '--is-ancestor', agentBookmark, 'HEAD']);
        if (probe.exitCode === 0) {
            continue;
        }
        if (probe.exitCode === 128 || /Not a valid object name/.test(probe.stderr)) {
            continue;
        }
        // D-01 + D-02 + D-08: 2-parent merge via direct `git merge --no-ff`
        // call. Run from the MAIN repo root cwd (the worktree-checked-out
        // main is the merge target). Inspect mergeRes.exitCode and the
        // stderr+stdout regex inline (precedent regex at backends/git.ts:683).
        const mergeRes = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'git', ['merge', '--no-ff', '-m', `phase ${phaseTag} merge: ${ws.agentId}`, agentBookmark]);
        const mergeConflicted = mergeRes.exitCode !== 0
            && /CONFLICT|Automatic merge failed/i.test(mergeRes.stderr + mergeRes.stdout);
        if (mergeConflicted || mergeRes.exitCode !== 0) {
            // D-02 halt + D-08 producer.
            //
            // Edge case: mergeRes.exitCode !== 0 but the regex didn't match
            // (e.g., I/O error, ref-resolution failure). Treat the same way
            // — we still cannot make progress on this workspace; queue an
            // entry with the same shape so the human sees the wedged state
            // and the orchestrator's gate blocks. mergeRes.stderr is
            // reachable verbatim through the executor's transcript for
            // diagnosis.
            const diff = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'git', ['diff', '--name-only', '--diff-filter=U']);
            conflictedPaths = diff.exitCode === 0
                ? diff.stdout.split('\n').map((s) => s.trim()).filter((s) => s.length > 0)
                : [];
            conflicted = true;
            const tipRes = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'git', ['rev-parse', agentBookmark]);
            const tipSha = tipRes.exitCode === 0 ? tipRes.stdout.trim() : '';
            const entry = {
                subagentName: ws.name,
                changeIdShort: tipSha.slice(0, 12),
                workspacePath: ws.path,
                reason: 'merge-in-tree-conflict',
            };
            (0, incomplete_work_cjs_1.appendIncomplete)(handle.phaseRoot, entry);
            incompleteQueued += 1;
            break; // D-02: halt the loop, tree left wedged with MERGE_HEAD set
        }
        // Successful merge. Capture the post-merge HEAD SHA for merged[].
        const headRes = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'git', ['rev-parse', 'HEAD']);
        if (headRes.exitCode === 0) {
            merged.push(headRes.stdout.trim().slice(0, 12));
        }
        // D-04 per-success cleanup. Issue `git worktree remove` directly
        // (non-force per D-07 / ROADMAP SC1). On non-zero exit (D-07
        // dirty-tree refusal), do NOT throw — record agentBookmark as
        // surplus and continue.
        //
        // WR-04: `surplusBookmarks` is `readonly string[]` (locked at Phase 9
        // D-08), so we cannot widen the contract field to carry per-entry
        // cleanup-failure context. To preserve diagnosability of fs-error
        // failures (vs. the expected D-07 dirty-tree refusal), emit the first
        // line of `removeRes.stderr` to process.stderr — this surfaces in the
        // same transcript the orchestrator already captures around vcsExec,
        // without changing the pure-JSON return shape (D-13/D-16 carry).
        const removeRes = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'git', ['worktree', 'remove', ws.path]);
        if (removeRes.exitCode !== 0) {
            const stderrFirstLine = (removeRes.stderr || '').split('\n')[0].trim();
            if (stderrFirstLine.length > 0) {
                process.stderr.write(`parallel.fanIn: worktree remove failed for ${agentBookmark} (exit ${removeRes.exitCode}): ${stderrFirstLine}\n`);
            }
            surplusBookmarks.push(agentBookmark);
        }
        else {
            // Worktree gone — try to delete the agent's branch. Failure
            // (e.g. branch still checked out elsewhere) just means surplus;
            // do NOT throw. `--` end-of-options separator is defense-in-depth
            // against a future loosening of `validateAgentId`'s character
            // class (matches `backends/git.ts:712` precedent).
            const delRes = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'git', ['branch', '-D', '--', agentBookmark]);
            if (delRes.exitCode !== 0) {
                surplusBookmarks.push(agentBookmark);
            }
        }
    }
    // ── STEP 1.5: optional per-name branch advance (PARALLEL-08 / CF-03). ─
    // Phase 14.1 (PARALLEL-08): when `handle.mainBookmarks` is non-empty AND
    // the per-branch merge loop above did NOT conflict, advance each name via
    // `git update-ref refs/heads/<name> HEAD`. Empty/omitted list → SKIP
    // (detached-HEAD git is a first-class dispatch state — the merge already
    // landed into HEAD itself via `merge --no-ff`).
    //
    // All-or-nothing pre-validation mirrors the jj-side CF-02 idiom:
    //   Pass 1: validateRefname every name (stricter than the jj-side
    //   validateMainBookmark — rejects `..`, `@{`, `.lock` per
    //   git-check-ref-format(1)). Throws on first invalid; zero side effects.
    //   Pass 2: spawn `git update-ref refs/heads/<name> HEAD` per name.
    //
    // Conflict gate: skip when `conflicted === true` (the merge loop halted
    // with MERGE_HEAD set; HEAD has not advanced past the conflicted state,
    // so advancing branches would point them at a pre-merge revision —
    // semantically wrong). The skip matches the jj-side body which also
    // only runs the bookmark-set loop under the `!conflicted` branch.
    //
    // Partial-state on a mid-iteration `update-ref` failure: same caveat
    // as the jj-side. `update-ref` is per-ref-atomic, so no torn single-ref
    // state, but names 1..K-1 already advanced. Atomic rollback deferred.
    const mainBookmarks = handle.mainBookmarks ?? [];
    if (mainBookmarks.length > 0 && !conflicted) {
        for (const name of mainBookmarks) {
            (0, refs_validator_cjs_1.validateRefname)(name);
        }
        for (const name of mainBookmarks) {
            const refRes = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'git', [
                'update-ref', `refs/heads/${name}`, 'HEAD',
            ]);
            if (refRes.exitCode !== 0) {
                throw new Error(`parallel.fanIn: update-ref refs/heads/${name} failed: ${refRes.stderr || refRes.stdout}`);
            }
        }
    }
    // ── STEP 2: crashed-agent classifier (D-06 + D-07). ──────────────────
    // Only runs on results whose exitCode !== 0. Skips workspaces that
    // already merged successfully above.
    for (const result of results) {
        if (result.exitCode === 0)
            continue;
        const ws = handle.workspaces.find((w) => w.agentId === result.agentId);
        if (!ws)
            continue; // unknown agentId — defensive skip
        const agentBookmark = `worktree-agent-${ws.agentId}`;
        const tipResult = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'git', ['rev-parse', agentBookmark]);
        if (tipResult.exitCode !== 0) {
            // Branch missing — bookmark already cleaned up (e.g., agent
            // crashed AFTER successful merge in STEP 1).
            failedReaped.push(ws.name);
            continue;
        }
        const tipSha = tipResult.stdout.trim();
        // Probe the worktree directory's WC dirtiness with `git status
        // --porcelain`. Note the cwd is the WORKSPACE dir, not mainRepoRoot.
        const statusResult = (0, exec_cjs_1.vcsExec)(ws.path, 'git', ['status', '--porcelain']);
        const cleanTree = statusResult.exitCode === 0 && statusResult.stdout.trim() === '';
        // D-06: branch tip == baseRev AND clean tree → no queue write
        // (abandoned-style; the agent crashed before doing any work).
        if (tipSha === ws.baseRev && cleanTree) {
            failedReaped.push(ws.name);
            continue;
        }
        // Otherwise (committed work OR dirty tree OR both) → queue entry.
        const entry = {
            subagentName: ws.name,
            changeIdShort: tipSha.slice(0, 12),
            workspacePath: ws.path,
            reason: 'crashed-with-uncommitted-work',
        };
        (0, incomplete_work_cjs_1.appendIncomplete)(handle.phaseRoot, entry);
        incompleteQueued += 1;
        // D-07: try non-force cleanup via direct vcsExec. On dirty-tree
        // refusal (expected) the worktree survives on disk for human
        // inspection — the workspacePath in the queue entry IS the
        // inspection handle (PITFALLS Pitfall 3). Do NOT throw and do NOT
        // push to surplusBookmarks here — the queue entry already tracks
        // the survivor; surplusBookmarks is for branches that outlived a
        // SUCCESSFUL fan-in cleanup, not for crashed-and-preserved trees.
        //
        // WR-06: capture the ExecResult (was previously a statement-
        // expression discarding both exit code AND stderr). On non-zero exit
        // (the expected D-07 dirty-tree case AND any unexpected fs error),
        // surface the first stderr line to process.stderr so the orchestrator
        // transcript records WHY cleanup did not happen — distinguishing
        // "worktree preserved on disk for inspection" from "fs error
        // (worktree may also have survived)". Same approach as WR-04;
        // failedReaped's `readonly string[]` contract stays unchanged.
        const removeResStep2 = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'git', ['worktree', 'remove', ws.path]);
        if (removeResStep2.exitCode !== 0) {
            const stderrFirstLine = (removeResStep2.stderr || '').split('\n')[0].trim();
            if (stderrFirstLine.length > 0) {
                process.stderr.write(`parallel.fanIn: STEP 2 worktree remove failed for ${agentBookmark} (exit ${removeResStep2.exitCode}): ${stderrFirstLine}\n`);
            }
        }
        else {
            // WR-05: when STEP 2's worktree remove SUCCEEDS (clean-WC crashed
            // agent — the agent committed its partial work before crashing,
            // so the worktree is clean and non-force `worktree remove` does
            // not refuse), the agent's branch must be deleted explicitly.
            // STEP 3's audit (line 491-502) otherwise enumerates the
            // orphaned `worktree-agent-<id>` ref against `expectedNames` and
            // double-counts it into `surplusBookmarks` — the same crashed
            // agent would end up in BOTH the incomplete-work queue
            // (intentional, the inspection handle per Pitfall 3) AND
            // `surplusBookmarks` (unintentional double-count). `--` matches
            // the WR-01 fix in STEP 1; `-D` force-deletes because the branch
            // is not merged into main (the work is preserved in the queue
            // file's reference to its tip SHA).
            (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'git', ['branch', '-D', '--', agentBookmark]);
        }
        failedReaped.push(ws.name);
    }
    // ── STEP 3: surplus-bookmark audit. ──────────────────────────────────
    // Incremental population inside the loop above is augmented here with a
    // final `for-each-ref` sweep. CONTEXT recommendation: incremental +
    // final dedup so a re-call that finishes cleanly returns the full audit
    // in one place.
    //
    // CR-02 / SC3 handle-scoped gate (Phase 10 plan 05 — closes
    // VERIFICATION.md gap): `surplusBookmarks` is BY DEFINITION a subset of
    // this handle's expected agent bookmarks ("branches that outlived THIS
    // fan-in's cleanup"), NOT a repo-wide alive-branch enumeration. Without
    // this gate, the `for-each-ref refs/heads/worktree-agent-*` glob
    // enumerates EVERY agent-shaped branch in the repo — including
    // pre-existing unrelated `worktree-agent-foo` branches AND in-flight
    // conflict branches from sibling handles. Both cross-handle pollute the
    // contract field. We narrow client-side via the `expectedNames` Set so
    // the for-each-ref argv stays unchanged (broad glob is fine; the
    // client-side filter is what enforces the contract semantics).
    const listResult = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads/worktree-agent-*']);
    if (listResult.exitCode === 0) {
        const expectedNames = new Set(handle.workspaces.map((ws) => `worktree-agent-${ws.agentId}`));
        const alive = listResult.stdout.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
        for (const bm of alive) {
            if (!expectedNames.has(bm))
                continue;
            if (!surplusBookmarks.includes(bm)) {
                surplusBookmarks.push(bm);
            }
        }
    }
    // Frozen pure-JSON return — verbatim mirror of jj/parallel.ts:535-542.
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
 * subagent worktrees on the git backend. INLINE teardown — no shared helper
 * (git's `worktree remove --force` already handles tree cleanup, and
 * orphan-dirs are a jj-only problem per PROJECT.md OOS for cross-backend
 * cleanup helper).
 *
 * CF-05 STACK-lens: synchronous teardown only. Does NOT signal subagent
 * processes (mid-Agent process-kill cancellation is OUT-OF-SCOPE per
 * PROJECT.md; operator handles process termination via Claude Code UI/CLI).
 *
 * Per-workspace teardown order (D-06 idempotency contract):
 *   1. `git worktree remove --force <path>` — non-zero exit → push `ws.name`
 *      to `failedReaped[]` (the visible state-leak surface) and continue to
 *      the next workspace.
 *   2. `git branch -D -- worktree-agent-<agentId>` — non-zero exit → push
 *      the branch name to `surplusBookmarks[]` (branch may legitimately
 *      already be gone from a prior call; surplus, NOT failed).
 *   3. push `ws.agentId` to `abandoned[]` (per orchestrator-identifier
 *      consistency convention).
 *
 * Phase 9 D-05 frozen pure-JSON: return value is `Object.freeze`'d with
 * frozen inner arrays. Survives JSON round-trip without semantic loss.
 *
 * D-03 idempotency: re-call returns `CancelResult` with all-empty arrays —
 * `worktree remove --force` on a missing path returns non-zero (recorded as
 * failedReaped on first miss; on subsequent calls the prior call's removal
 * is what guarantees the empty result, given `--force` skips no-such-tree
 * scenarios cleanly when the worktree metadata was already pruned).
 */
function performGitParallelCancel(mainRepoRoot, handle) {
    // Count surplus workspaces at entry (D-02 — counted pre-cleanup regardless
    // of teardown outcome).
    const surplusWorkspaces = handle.workspaces
        .filter((ws) => (0, node_fs_1.existsSync)(ws.path))
        .map((ws) => ws.path);
    const abandoned = [];
    const failedReaped = [];
    const surplusBookmarks = [];
    for (const ws of handle.workspaces) {
        // Step 1: `git worktree remove --force <path>`. On non-zero exit the
        // worktree resisted teardown (e.g., fs permission error) — push
        // ws.name to failedReaped[] and skip this workspace's branch delete
        // (the branch is harmless without the worktree; will get swept by
        // the next cancel-clean call).
        //
        // Idempotent-recall note: when `ws.path` is already gone (prior
        // cancel call), git's `worktree remove --force` emits "fatal: ...
        // is not a working tree" and returns non-zero. To honor D-03's
        // empty-arrays-on-re-call invariant we existsSync-gate up front —
        // missing path means "nothing to do for this workspace" (do NOT
        // push to failedReaped[] in that case; idempotent skip).
        if (!(0, node_fs_1.existsSync)(ws.path)) {
            // Already gone — D-03/D-06 idempotent skip. Do NOT push to any
            // bucket; the second cancel call must observe an all-empty
            // CancelResult per the contract.
            continue;
        }
        const wtRes = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'git', ['worktree', 'remove', '--force', ws.path]);
        if (wtRes.exitCode !== 0) {
            failedReaped.push(ws.name);
            continue;
        }
        // Step 2: `git branch -D -- worktree-agent-<agentId>`. `--`
        // end-of-options separator is defense-in-depth against future
        // loosening of the `validateAgentId` character class (matches
        // the WR-01 precedent at backends/git.ts:712 + the equivalent in
        // `performGitParallelFanIn` STEP 1 cleanup at git/parallel.ts:457).
        // Non-zero exit means the branch may already be gone (e.g., prior
        // reap, or a sibling `branch -D` from an unrelated command) — push
        // to surplusBookmarks[], NOT failedReaped[]. The teardown of the
        // workspace itself succeeded.
        const branchName = `worktree-agent-${ws.agentId}`;
        const brRes = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'git', ['branch', '-D', '--', branchName]);
        if (brRes.exitCode !== 0) {
            surplusBookmarks.push(branchName);
        }
        // Per orchestrator-identifier consistency convention: abandoned[]
        // uses agentId form (mirrors `merged[]` in `performGitParallelFanIn`
        // which uses short-SHA form, and `failedReaped[]` which uses ws.name
        // form — three identifier forms for three orthogonal axes).
        abandoned.push(ws.agentId);
    }
    return Object.freeze({
        abandoned: Object.freeze(abandoned.slice()),
        failedReaped: Object.freeze(failedReaped.slice()),
        surplusBookmarks: Object.freeze(surplusBookmarks.slice()),
        surplusWorkspaces: Object.freeze(surplusWorkspaces.slice()),
    });
}
