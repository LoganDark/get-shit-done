"use strict";
/**
 * format-migration/orphan.ts — ancestor walker.
 *
 * Pattern: RESEARCH §"Pattern 2: Orphan Ancestor Walk".
 *
 * When `commitIdOf` / `changeIdOf` rejects a source ID with `VcsExecError`,
 * the ID has no direct counterpart in the target VCS. This walker steps one
 * parent at a time in the SOURCE VCS via `expr.parents(expr.rev(cursor))`
 * (the symmetric factory landed in plan 06-01 Task 2 — translates to
 * `(<inner>)-` on jj and `<inner>^@` on git, so both backends step depth-1).
 * It probes each step against `commitIdOf` / `changeIdOf`; the first parent
 * that resolves stops the walk. On a resolved ancestor it then captures the
 * ancestor's DIRECT CHILDREN in the target VCS via `expr.children(expr.rev(targetId))`
 * — but `expr.children` translates only on jj (plan 06-01 Task 2 chose to throw
 * on git rather than emit a sentinel), so the jj→git direction returns an
 * empty `childrenInTarget` list.
 *
 * The walker uses the SAME `vcs` adapter for both the source-VCS parent walk
 * and the target-VCS children lookup — this is OK during the pre-flip phase
 * (RESEARCH Pitfall 6: orphan resolution runs BEFORE the adapter flip; only
 * the migration commit needs the post-flip adapter).
 *
 * Empirical anchors (plan 06-01 Task 3 probes, jj 0.41):
 *   - A5: `<id>+` returns direct children only (depth-1)
 *   - A6: `<id>-` returns direct parents only (depth-1)
 *
 * Acceptance grep (Task 2 done criteria):
 *   `expr\.parents\(expr\.rev\(` must appear at least once below.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAncestor = resolveAncestor;
const jj_id_cjs_1 = require("../parse/jj-id.cjs");
const expr_cjs_1 = require("../expr.cjs");
const exec_cjs_1 = require("../exec.cjs");
/**
 * Safety bound. Real `.planning/` SHA references resolve in 0-1 steps; deeper
 * walks indicate either a cherry-picked-out-of-tree commit or a mistaken
 * input. Loop bound = MAX_DEPTH; on overrun returns null (treated as
 * "unresolvable" by resolve.ts).
 */
const MAX_DEPTH = 1000;
/**
 * Walk source-VCS ancestry of `orphan` until a parent resolves in the target
 * VCS, then return the parent's target ID and its direct children in the
 * target VCS. Returns null if the walk hits the source-VCS root without
 * finding a resolvable counterpart.
 *
 * Direction:
 *   git→jj: orphan is a git SHA; we walk parents (still in git context since
 *           adapter has not flipped yet) and try `changeIdOf` until one
 *           succeeds. childrenInTarget is the ancestor's jj-side direct
 *           children via `expr.children`.
 *   jj→git: orphan is a jj change_id; we walk parents in jj context and try
 *           `commitIdOf`. childrenInTarget is empty (expr.children throws
 *           on git per plan 06-01 Task 2).
 */
async function resolveAncestor(vcs, cwd, orphan, direction) {
    let cursor = orphan;
    for (let depth = 0; depth < MAX_DEPTH; depth++) {
        // Step one parent in the source VCS. expr.parents translates to:
        //   jj:  `(<inner>)-`  — depth-1 parents (A6 probe)
        //   git: `<inner>^@`   — same depth-1 semantics
        const parents = vcs.log({
            rev: expr_cjs_1.expr.parents(expr_cjs_1.expr.rev(cursor)),
            maxCount: 1,
        });
        if (parents.length === 0)
            return null; // hit the source-VCS root
        cursor = parents[0].id;
        // Probe whether cursor resolves in the TARGET VCS.
        let targetId;
        try {
            targetId =
                direction === 'git→jj'
                    ? (0, jj_id_cjs_1.changeIdOf)(cwd, cursor)
                    : (0, jj_id_cjs_1.commitIdOf)(cwd, cursor);
        }
        catch (e) {
            if (e instanceof exec_cjs_1.VcsExecError) {
                // Not in target yet — keep walking.
                continue;
            }
            throw e;
        }
        // Resolved! Capture direct children in target VCS.
        let children = [];
        if (direction === 'git→jj') {
            // jj-side target — `expr.children` translates to `<inner>+` (A5 probe).
            try {
                const childEntries = vcs.log({
                    rev: expr_cjs_1.expr.children(expr_cjs_1.expr.rev(targetId)),
                    maxCount: 100,
                });
                children = childEntries.map((c) => c.id);
            }
            catch {
                // Defensive: if the children lookup fails (e.g. transient jj error),
                // record the ancestor without children rather than failing the whole
                // walk. The migration report will simply show an empty children column.
                children = [];
            }
        }
        // jj→git direction: expr.children throws on git per plan 06-01 Task 2;
        // we leave children as an empty list. The report's column is documented
        // as "_(none / target=git)_" in report.ts.
        return { ancestor: targetId, childrenInTarget: children };
    }
    // Walk depth exceeded — treat as unresolvable.
    return null;
}
