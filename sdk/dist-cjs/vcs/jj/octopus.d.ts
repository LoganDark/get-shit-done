/**
 * sdk/src/vcs/jj/octopus.ts — Phase 4 plan 05 (WS-05..10)
 *
 * Lazy octopus structure helpers. Orchestrator-tier coordination layer
 * composed on top of existing adapter primitives (workspace.add,
 * refs.bookmarks.create) + raw `jj new -A -B --no-edit` invocations.
 *
 * Lifecycle (RESEARCH §"System Architecture Diagram"):
 *   1. Orchestrator picks "first subagent dispatch in phase" (any wave, any
 *      count — per Open Q1 / D-25 recommendation: "any subagent in any wave"
 *      triggers structure creation; single-subagent dispatch still gets a
 *      one-child octopus for forward-compat — the cost is one extra change,
 *      which is cheap).
 *   2. createPhaseStructure(parent, phaseNum) creates the parent+merge slot.
 *      Idempotent: re-invocation returns the existing change_ids and
 *      `created: false`. Detection is via a marker bookmark
 *      `gsd/phase-{NN}-merge-marker`.
 *   3. createSubagentSlot inserts a subagent head between parent and merge
 *      via `jj new -A <parent> -B <merge> -m 'subagent N' --no-edit`, then
 *      `vcs.workspace.add({path, baseRef: expr.rev(head), name: 'phase-{NN}-subagent-{idx}'})`.
 *   4. WS-09 phase-bookmark advance (gsd/phase-{N} → merge) uses standard
 *      `vcs.commit({bookmarkRaw, phaseMergeFor})` from plan 04-04 — NOT a
 *      new verb here.
 *
 * WS-10 invariant: every `jj new` invocation uses `--no-edit` so the
 * orchestrator's `@` remains one beyond the merge change. The orchestrator
 * itself never moves during structure creation.
 *
 * D-04 invariant: workspace names + bookmark markers use zero-padded phase
 * numbers (`phase-04-subagent-1`, `gsd/phase-04-merge-marker`) for
 * consistency with the directory naming convention.
 */
import type { RevisionExpr } from '../types.js';
export interface PhaseStructureResult {
    /** change_id of the parent slot (predecessor of all subagent heads) */
    parentChange: string;
    /** change_id of the merge slot (descendant of all subagent heads) */
    mergeChange: string;
    /**
     * True iff this call created the structure; false if it was already
     * present (idempotent re-entry — e.g. plan 02 re-uses phase 01's
     * structure).
     */
    created: boolean;
}
/**
 * WS-05: lazy creation of the phase-level parent+merge slot.
 *
 * Trigger predicate (per Open Q1 / D-25 recommendation): "any subagent in
 * any wave". Caller (orchestrator) invokes this on the FIRST subagent
 * dispatch; single-subagent phases get a one-child octopus for forward
 * compatibility (cheap).
 *
 * Idempotency: detection via marker bookmarks. We create TWO marker
 * bookmarks tracking parent and merge so that subsequent calls do NOT need
 * to walk the ancestry chain (which can be wrong after subagents are
 * inserted — `<merge>-` resolves to the most recent subagent, not the
 * original parent slot). If the merge marker exists, both markers are
 * trusted and re-used.
 *
 * @param mainRepoRoot adapter cwd (main repo root)
 * @param parentRevset revset for the "before" parent (e.g. `@-` for "before
 *   orchestrator's @")
 * @param phaseNum integer; padded to 2 digits for bookmark/workspace
 *   naming (D-04)
 */
export declare function createPhaseStructure(mainRepoRoot: string, parentRevset: string, phaseNum: number): PhaseStructureResult;
/**
 * WS-06: create a single subagent head inserted between parent and merge.
 *
 * Uses the verified `jj new -A <parent> -B <merge> --no-edit` primitive
 * (RESEARCH §"WS-06"). The combined -A/-B form was empirically verified on
 * jj 0.41 to create a new change inserted into the parent → merge linear
 * chain (or making the merge an octopus-merge when multiple subagents are
 * inserted on subsequent invocations).
 *
 * --no-edit (WS-10): orchestrator's `@` stays at one-beyond-merge — `jj
 * new` may rebase @ to keep it a descendant of the new merge state, but
 * does NOT edit @ directly.
 *
 * @returns change_id of the newly-created subagent head
 */
export declare function createSubagentHead(mainRepoRoot: string, opts: {
    parentChange: string;
    mergeChange: string;
    idx: number;
}): string;
/**
 * WS-06 + WS-07: create a subagent head AND its workspace as one
 * atomic-looking helper. If workspace creation fails after the head is
 * created, the head is left in place — caller (orchestrator) can retry
 * workspace.add or abandon the head. Idempotency on the workspace side is
 * governed by jj's own "workspace name already exists" error from
 * workspace.add().
 *
 * @param vcs adapter (for workspace.add) — passed in so this helper stays
 *   a pure function (no createVcsAdapter call here; caller wires the
 *   dependency).
 */
export declare function createSubagentSlot(mainRepoRoot: string, vcs: {
    workspace: {
        add(input: {
            path: string;
            baseRef?: RevisionExpr;
            name?: string;
        }): unknown;
    };
}, opts: {
    parentChange: string;
    mergeChange: string;
    idx: number;
    phaseNum: number;
    /**
     * Optional override for the workspace path. Default per D-16:
     * `{mainRepoRoot}/.claude/jj-workspaces/phase-{NN}-subagent-{idx}`.
     */
    workspacePath?: string;
}): {
    headChange: string;
    workspaceName: string;
    workspacePath: string;
};
//# sourceMappingURL=octopus.d.ts.map