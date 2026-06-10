"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPhaseStructure = createPhaseStructure;
exports.createSubagentHead = createSubagentHead;
exports.createSubagentSlot = createSubagentSlot;
const exec_cjs_1 = require("../exec.cjs");
const expr_cjs_1 = require("../expr.cjs");
const node_path_1 = require("node:path");
/**
 * Inline mandatory jj-flags prefix. UPSTREAM-02 sidecar discipline: this
 * file does NOT import from `backends/jj.ts` (that would create a merge
 * conflict on every upstream-rebase cycle). Flag set matches
 * `backends/jj.ts::jjArgv`: --repository, --no-pager, --color never, --quiet.
 */
function jjArgvFlags(repo) {
    return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}
/**
 * Resolve the change_id of the change referenced by a revset, taking
 * exactly one row. Runs `jj log -r <revset> -T 'change_id ++ "\n"'
 * --no-graph -n 1` from the main repo root.
 */
function resolveChangeId(mainRepoRoot, revset) {
    const args = [
        ...jjArgvFlags(mainRepoRoot),
        'log', '-r', revset, '-T', 'change_id ++ "\\n"', '--no-graph', '-n', '1',
    ];
    const r = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'jj', args);
    if (r.exitCode !== 0 || !r.stdout.trim()) {
        throw new Error(`octopus.resolveChangeId(${revset}) failed: ${r.stderr || r.stdout}`);
    }
    return r.stdout.trim();
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
function createPhaseStructure(mainRepoRoot, parentRevset, phaseNum) {
    const phaseTag = String(phaseNum).padStart(2, '0');
    const mergeMarkerBookmark = `gsd/phase-${phaseTag}-merge-marker`;
    const parentMarkerBookmark = `gsd/phase-${phaseTag}-parent-marker`;
    // Probe: does the merge marker bookmark already point at a change? If
    // yes, idempotent — resolve both markers and return.
    const probeMergeArgs = [
        ...jjArgvFlags(mainRepoRoot),
        'log', '-r', mergeMarkerBookmark, '-T', 'change_id ++ "\\n"', '--no-graph', '-n', '1',
    ];
    const probeMerge = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'jj', probeMergeArgs);
    if (probeMerge.exitCode === 0 && probeMerge.stdout.trim()) {
        const mergeChange = probeMerge.stdout.trim();
        // Resolve parent via its OWN marker bookmark, NOT via `<merge>-`.
        // Rationale: once subagents are inserted between parent and merge,
        // `<merge>-` resolves to the most recent subagent head, not the
        // parent slot. The parent marker is the safe source of truth.
        const parentChange = resolveChangeId(mainRepoRoot, parentMarkerBookmark);
        return { parentChange, mergeChange, created: false };
    }
    // Not present — create. Resolve the parent revset to a concrete
    // change_id (snapshot the moment we create).
    const parentChange = resolveChangeId(mainRepoRoot, parentRevset);
    // Create the merge change as a child of parent (no -A/-B trickery;
    // single parent). --no-edit keeps orchestrator's @ from being edited
    // directly (WS-10); jj may still rebase @ to remain a descendant.
    const newMergeArgs = [
        ...jjArgvFlags(mainRepoRoot),
        'new', '-A', parentChange, '-m', `phase ${phaseTag} merge`, '--no-edit',
    ];
    const newMergeRes = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'jj', newMergeArgs);
    if (newMergeRes.exitCode !== 0) {
        throw new Error(`octopus.createPhaseStructure: jj new (merge) failed: ${newMergeRes.stderr || newMergeRes.stdout}`);
    }
    // Resolve the new merge change. We CANNOT use `<parent>+` alone here
    // because the parent revset may resolve to a change that already has
    // other children (e.g. orchestrator's `@` when parentRevset === '@-').
    // Instead we match by SUBJECT — the merge change we just created has
    // the unique first-line description `phase {NN} merge`.
    //
    // VERIFIED REVSET FUNCTION (jj 0.41, empirically probed 2026-05-13):
    //   `subject(exact:"<text>")` matches changes whose subject (first
    //   line of description) exactly equals "<text>". The bare
    //   `description("<text>")` form requires the trailing `\n` and
    //   doesn't match jj's `-m`-style descriptions reliably; `subject`
    //   strips the trailing newline by definition (jj revset help).
    const mergeChange = resolveChangeId(mainRepoRoot, `subject(exact:"phase ${phaseTag} merge") & ${parentChange}+`);
    // Tag both parent and merge with marker bookmarks for idempotent
    // re-entry. The `-r <rev>` form is the verified shape on jj 0.41;
    // `bookmark create` accepts `--` after `-r <rev>` to separate the name
    // positional from any flag-shaped name (defense-in-depth per plan 07
    // cr-01 fold-in).
    const bmMergeArgs = [
        ...jjArgvFlags(mainRepoRoot),
        'bookmark', 'create', '-r', mergeChange, '--', mergeMarkerBookmark,
    ];
    const bmMergeRes = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'jj', bmMergeArgs);
    if (bmMergeRes.exitCode !== 0) {
        throw new Error(`octopus.createPhaseStructure: bookmark create (merge marker) failed: ${bmMergeRes.stderr || bmMergeRes.stdout}`);
    }
    const bmParentArgs = [
        ...jjArgvFlags(mainRepoRoot),
        'bookmark', 'create', '-r', parentChange, '--', parentMarkerBookmark,
    ];
    const bmParentRes = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'jj', bmParentArgs);
    if (bmParentRes.exitCode !== 0) {
        throw new Error(`octopus.createPhaseStructure: bookmark create (parent marker) failed: ${bmParentRes.stderr || bmParentRes.stdout}`);
    }
    return { parentChange, mergeChange, created: true };
}
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
function createSubagentHead(mainRepoRoot, opts) {
    const args = [
        ...jjArgvFlags(mainRepoRoot),
        'new',
        '-A', opts.parentChange,
        '-B', opts.mergeChange,
        '-m', `subagent ${opts.idx}`,
        '--no-edit',
    ];
    const r = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'jj', args);
    if (r.exitCode !== 0) {
        throw new Error(`octopus.createSubagentHead failed: ${r.stderr || r.stdout}`);
    }
    // Resolve the new head: it's the most recent direct child of parent
    // that's NOT mergeChange.
    //
    // VERIFIED REVSET (jj 0.41, empirically probed 2026-05-13):
    //   `<parent>+ ~ <mergeChange>`  (children of <parent>, MINUS <mergeChange>)
    // The `~` operator is jj's difference operator. The alternative form
    // `<parent>+ - <mergeChange>` is REJECTED by jj 0.41's revset parser:
    //   "Error: Failed to parse revset: `-` is not an infix operator
    //    Hint: Did you mean `~` for difference?"
    // Source: this session's empirical probe against a fresh colocated
    // fixture (Plan 04-05 execution).
    // Do NOT switch to the `-` form on a Renovate bump without re-verifying.
    //
    // We further restrict to subagent-shaped subjects
    // (`subject(glob:"subagent *")`) so that this resolver remains
    // correct even if non-subagent helper changes are interleaved between
    // parent and merge by some future caller. The `subject(...)` revset
    // function is the verified form on jj 0.41 — bare
    // `description("subagent *")` requires the trailing `\n` and
    // doesn't reliably match. jj log default order is
    // reverse-chronological (newest first), so the head we just created
    // appears as the FIRST line.
    const probeArgs = [
        ...jjArgvFlags(mainRepoRoot),
        'log', '-r',
        `(${opts.parentChange}+ ~ ${opts.mergeChange}) & subject(glob:"subagent *")`,
        '-T', 'change_id ++ "\\n"', '--no-graph',
    ];
    const probe = (0, exec_cjs_1.vcsExec)(mainRepoRoot, 'jj', probeArgs);
    if (probe.exitCode !== 0 || !probe.stdout.trim()) {
        throw new Error(`octopus.createSubagentHead: head resolution failed: ${probe.stderr || probe.stdout}`);
    }
    const lines = probe.stdout.trim().split('\n').filter(Boolean);
    if (lines.length === 0) {
        throw new Error(`octopus.createSubagentHead: no head produced by jj new (parent=${opts.parentChange} merge=${opts.mergeChange})`);
    }
    // Newest first per jj log default order — take lines[0].
    return lines[0];
}
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
function createSubagentSlot(mainRepoRoot, vcs, opts) {
    const phaseTag = String(opts.phaseNum).padStart(2, '0');
    const workspaceName = `phase-${phaseTag}-subagent-${opts.idx}`;
    const workspacePath = opts.workspacePath ?? (0, node_path_1.join)(mainRepoRoot, '.claude/jj-workspaces', workspaceName);
    const headChange = createSubagentHead(mainRepoRoot, {
        parentChange: opts.parentChange,
        mergeChange: opts.mergeChange,
        idx: opts.idx,
    });
    // baseRef: use the canonical structured factory `expr.rev(id)` from
    // `sdk/src/vcs/expr.ts:104-109`. The factory permits hex SHA or jj
    // change_id (k-z alphabet) shapes and brands the string as a
    // `RevisionExpr`. The per-backend translator at parse/jj-rev.ts
    // dispatches on the `rev:` prefix and emits the change_id verbatim.
    // D-12 forbids `expr.raw`, so this is the only legitimate way to wrap
    // a runtime change_id string into a RevisionExpr.
    vcs.workspace.add({
        path: workspacePath,
        baseRef: expr_cjs_1.expr.rev(headChange),
        name: workspaceName,
    });
    return { headChange, workspaceName, workspacePath };
}
