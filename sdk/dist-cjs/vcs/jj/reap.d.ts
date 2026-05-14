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
import type { ReapResult } from '../types.js';
interface WorkspaceEntry {
    /** workspace name (jj uses this as the canonical key) */
    name: string;
    /** workspace's @ change_id */
    headChange: string;
    /** on-disk path */
    path: string;
}
export interface PerformJjReapOpts {
    mainRepoRoot: string;
    /** Inclusion filter for workspace names (D-04 / #2774 pattern). E.g. 'phase-04-subagent-'. */
    phaseNamePrefix: string;
    /** Phase dir for incomplete-work.md queue file (D-13). */
    phaseDir: string;
    /**
     * Resolved workspace entries: name, @ change_id, on-disk path.
     * Caller (jj.ts workspace.reap wrapper) builds this from workspace.list()
     * filtered by phaseNamePrefix, then resolves paths from a workspace-name →
     * path map (orchestrator-tier owns this mapping per D-03).
     *
     * Decoupling the entries from the orchestrator-tier path resolution lets
     * the test suite seed entries directly. The jj.ts wrapper uses
     * `workspace.list()` to populate.
     */
    entries: readonly WorkspaceEntry[];
}
export declare function performJjReap(opts: PerformJjReapOpts): ReapResult;
export {};
//# sourceMappingURL=reap.d.ts.map