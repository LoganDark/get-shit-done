"use strict";
/**
 * sdk/src/vcs/jj/reap.ts — Phase 4 plan 04 (WS-11, WS-12, D-12 corrected)
 *
 * workspace.reap implementation. UPSTREAM-02 sidecar for the zero-conflict
 * upstream-rebase surface.
 *
 * Flow per RESEARCH §"Architecture Patterns > System Architecture Diagram":
 *  1. Inventory: list workspaces, filter by phaseNamePrefix (D-04 / #2774 pattern).
 *  2. Probe: for each, run empty-tree check via
 *       `jj diff --from <parent_change> --to <head_change> -s`
 *     from MAIN repo root (D-15 / Pitfall 1 — never from inside the subagent ws).
 *  3. Empty → abandon + forget + rm-rf (Pitfall 3: forget does NOT rm).
 *  4. Non-empty → crash recovery: squash as 'subagent N: incomplete work' (-k)
 *     and append to incomplete-work.md queue (D-13). Workspace + on-disk dir
 *     LEFT in place for human review.
 *
 * CORRECTED probe form per RESEARCH Pitfall 2:
 *   CONTEXT D-12's original sketch combined `-r <head>` with `--from <parent>`,
 *   which jj 0.41 rejects (mutually exclusive on the diff subcommand). The
 *   correct form is `jj diff --from <parent> --to <head> -s`.
 *
 * D-15 / Pitfall 1: every vcsExec invocation here passes `opts.mainRepoRoot`
 * as cwd; the workspace identifier is encoded into argv via `--repository`
 * (jjArgvFlags). This guarantees the probe NEVER runs from inside a subagent
 * workspace (which would trigger jj's auto-snapshot on the wrong target).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.performJjReap = performJjReap;
const node_fs_1 = require("node:fs");
const exec_cjs_1 = require("../exec.cjs");
const incomplete_work_cjs_1 = require("./incomplete-work.cjs");
const conflict_paths_cjs_1 = require("./conflict-paths.cjs");
/**
 * Inline mandatory-flags prefix. UPSTREAM-02 sidecar discipline: this file does
 * NOT import from `backends/jj.ts` (would cause an upstream-rebase merge
 * conflict every cycle). The flag set matches `backends/jj.ts::jjArgv` —
 * `--repository`, `--no-pager`, `--color never`, `--quiet`.
 */
function jjArgvFlags(repoRoot) {
    return ['--repository', repoRoot, '--no-pager', '--color', 'never', '--quiet'];
}
/**
 * CORRECTED FORM per RESEARCH Pitfall 2.
 *
 * Probe whether `headChange`'s tree differs from its `parentChange` parent.
 * Returns `true` when the diff is empty (the head carries no real work and is
 * safe to abandon). The `-s` flag emits one summary line per changed path;
 * empty stdout = empty diff.
 *
 * Runs from `mainRepoRoot` (D-15 / Pitfall 1). NEVER runs from inside the
 * subagent workspace — auto-snapshot would corrupt the probe target.
 */
function isEmptyHead(mainRepoRoot, parentChange, headChange) {
    const args = [
        ...jjArgvFlags(mainRepoRoot),
        'diff', '--from', parentChange, '--to', headChange, '-s',
    ];
    const r = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'jj', args);
    if (r.exitCode !== 0) {
        throw new Error(`reap: empty-tree probe failed (from=${parentChange} to=${headChange}): ${r.stderr || r.stdout}`);
    }
    return r.stdout.trim().length === 0;
}
/**
 * Phase 9 D-11: in-tree conflict probe. Reuses jj 0.41's `conflicts()` revset
 * (PLURAL — see backends/jj.ts:562-567 for the naming-correction record;
 * upstream docs still say singular `conflict()` but the binary requires the
 * plural form). Returns `true` iff `headChange` carries an in-tree conflict.
 *
 * D-10: this probe is the jj-side producer for the new
 * `IncompleteWorkEntry.reason === 'merge-in-tree-conflict'` classifier
 * branch in `performJjReap`. The git-side producer lands in Phase 10. Both
 * backends feed the same closed-union queue file; the D-14 phase-merge gate
 * at backends/jj.ts:182-194 treats unknown reasons as fail-safe block.
 *
 * Runs from `mainRepoRoot` (D-15 / Pitfall 1) so auto-snapshot can't corrupt
 * the probe target — same discipline as `isEmptyHead` above.
 */
function hasInTreeConflict(mainRepoRoot, headChange) {
    const args = [
        ...jjArgvFlags(mainRepoRoot),
        'log', '-r', `conflicts() & ${headChange}`,
        '-T', 'change_id ++ "\\n"', '--no-graph',
    ];
    const r = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'jj', args);
    if (r.exitCode !== 0) {
        throw new Error(`reap: conflict probe failed (head=${headChange}): ${r.stderr || r.stdout}`);
    }
    return r.stdout.trim().length > 0;
}
/**
 * Resolve a workspace head's parent change_id (the `@-` relative to the
 * supplied head). Runs `jj log -r '<head>-' -T change_id --no-graph -n 1`
 * from the main repo root.
 */
function parentOf(mainRepoRoot, headChange) {
    const args = [
        ...jjArgvFlags(mainRepoRoot),
        'log', '-r', `${headChange}-`, '-T', 'change_id', '--no-graph', '-n', '1',
    ];
    const r = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'jj', args);
    if (r.exitCode !== 0 || !r.stdout.trim()) {
        throw new Error(`reap: parentOf(${headChange}) failed: ${r.stderr || r.stdout}`);
    }
    return r.stdout.trim();
}
function performJjReap(opts) {
    const abandoned = [];
    const incomplete = [];
    for (const entry of opts.entries) {
        if (!entry.name.startsWith(opts.phaseNamePrefix)) {
            // inclusion-filter (D-04 / #2774): workspaces NOT matching the
            // prefix are ignored. Note this is INCLUSION (skip if no match),
            // not exclusion (skip if matches a blocklist).
            continue;
        }
        const parent = parentOf(opts.mainRepoRoot, entry.headChange);
        const empty = isEmptyHead(opts.mainRepoRoot, parent, entry.headChange);
        if (empty) {
            // Abandon path: empty head → abandon + forget + rm.
            const abandonArgs = [
                ...jjArgvFlags(opts.mainRepoRoot),
                'abandon', entry.headChange,
            ];
            const abandonRes = (0, exec_cjs_1.vcsExec)(opts.mainRepoRoot, 'jj', abandonArgs);
            if (abandonRes.exitCode !== 0) {
                throw new Error(`reap: jj abandon ${entry.headChange} failed: ${abandonRes.stderr || abandonRes.stdout}`);
            }
            const forgetArgs = [
                ...jjArgvFlags(opts.mainRepoRoot),
                'workspace', 'forget', '--', entry.name,
            ];
            const forgetRes = (0, exec_cjs_1.vcsExec)(opts.mainRepoRoot, 'jj', forgetArgs);
            if (forgetRes.exitCode !== 0) {
                throw new Error(`reap: jj workspace forget ${entry.name} failed: ${forgetRes.stderr || forgetRes.stdout}`);
            }
            // Pitfall 3: jj workspace forget does NOT remove the on-disk dir.
            // reap rm's it here for the empty-head case so the orchestrator
            // observes a clean tree.
            if ((0, node_fs_1.existsSync)(entry.path)) {
                (0, node_fs_1.rmSync)(entry.path, { recursive: true, force: true });
            }
            abandoned.push({ name: entry.name, changeId: entry.headChange, path: entry.path });
        }
        else if (hasInTreeConflict(opts.mainRepoRoot, entry.headChange)) {
            // Phase 9 D-09/D-10/D-11: in-tree conflict on the subagent's head
            // (typically produced by the N-parent octopus merge in fanIn).
            // Mirrors the crash-recovery branch below but swaps the reason
            // literal to 'merge-in-tree-conflict'. The on-disk dir + workspace
            // tracking are LEFT intact (same as crashed-work branch) so the
            // human reviewer can inspect the conflicted state before deciding
            // to resolve or discard.
            //
            // Probe the conflicted paths via the UPSTREAM-02 sidecar. WR-04:
            // the sentinel `['<UNRESOLVABLE>']` is recorded verbatim — the
            // downstream D-14 phase-merge gate treats unknown/empty conflict
            // info as fail-safe block (09-CONTEXT A1), so surfacing the
            // sentinel beats silently dropping it.
            const conflictedPaths = (0, conflict_paths_cjs_1.enumerateConflictedPaths)(opts.mainRepoRoot, entry.headChange);
            const idxMatch = /-subagent-(\d+)/.exec(entry.name);
            const idx = idxMatch ? idxMatch[1] : '?';
            const message = `subagent ${idx}: incomplete work`;
            const squashArgs = [
                ...jjArgvFlags(opts.mainRepoRoot),
                'squash', '-r', entry.headChange, '-k', '-m', message,
            ];
            const squashRes = (0, exec_cjs_1.vcsExec)(opts.mainRepoRoot, 'jj', squashArgs);
            if (squashRes.exitCode !== 0) {
                throw new Error(`reap: in-tree-conflict squash for ${entry.name} failed `
                    + `(conflictedPaths=${conflictedPaths.join(',')}): `
                    + `${squashRes.stderr || squashRes.stdout}`);
            }
            const queueEntry = {
                subagentName: entry.name,
                changeIdShort: entry.headChange.slice(0, 8),
                workspacePath: entry.path,
                reason: 'merge-in-tree-conflict',
            };
            (0, incomplete_work_cjs_1.appendIncomplete)(opts.phaseDir, queueEntry);
            incomplete.push(queueEntry);
            // Mirror the crashed-work branch's pitfall-3-inverse: LEAVE the
            // on-disk dir + workspace tracking intact for human review.
        }
        else {
            // Crash-recovery path (D-12): head has real work. Squash as
            // 'subagent N: incomplete work' preserving change_id (-k) so the
            // queue entry's reachability survives. Subagent index extracted
            // from the workspace name (`phase-{N}-subagent-{idx}`).
            const idxMatch = /-subagent-(\d+)/.exec(entry.name);
            const idx = idxMatch ? idxMatch[1] : '?';
            const message = `subagent ${idx}: incomplete work`;
            // Mirror SQUASH-01's argv shape from backends/jj.ts but with `-r`
            // instead of `-B` since we are squashing a specific revision, not
            // inserting before @. Verified on jj 0.41 during plan execution:
            // `jj squash -r <change> -k -m '<msg>'` lands a new change with
            // the supplied message and preserves <change>'s change_id.
            const squashArgs = [
                ...jjArgvFlags(opts.mainRepoRoot),
                'squash', '-r', entry.headChange, '-k', '-m', message,
            ];
            const squashRes = (0, exec_cjs_1.vcsExec)(opts.mainRepoRoot, 'jj', squashArgs);
            if (squashRes.exitCode !== 0) {
                throw new Error(`reap: crash-recovery squash for ${entry.name} failed: ${squashRes.stderr || squashRes.stdout}`);
            }
            const queueEntry = {
                subagentName: entry.name,
                changeIdShort: entry.headChange.slice(0, 8),
                workspacePath: entry.path,
                reason: 'crashed-with-uncommitted-work',
            };
            (0, incomplete_work_cjs_1.appendIncomplete)(opts.phaseDir, queueEntry);
            incomplete.push(queueEntry);
            // Pitfall 3 inverse: for crash recovery we LEAVE the dir + workspace
            // tracking intact (D-13) so the human reviewer can inspect the
            // preserved subagent state before deleting the queue entry.
        }
    }
    return { abandoned, incomplete };
}
