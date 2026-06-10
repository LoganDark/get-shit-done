"use strict";
/**
 * VcsAdapter type contract.
 * Authoritative TypeScript interface; both backends and all consumers compile against it.
 *
 * Phase 1 designs the forward-complete surface (D-04): every namespace any later phase needs.
 * Git backend implements all of it; jj backend (Phase 3) implements everything except gitOnly.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VcsNotImplementedError = exports.VcsIncompleteSubagentsError = exports.VcsBookmarkDivergentError = exports.__vcsTestOnly = void 0;
// ─── Test-only namespace (D-14, symbol-gated) ────────────────────────────────
exports.__vcsTestOnly = Symbol.for('gsd.vcs.testOnly');
// ─── Error classes (Phase 3 D-02 + planner's-discretion) ────────────────────
/**
 * Phase 3 D-02: jj's `name??` divergent-bookmark state surfaces as this typed
 * error rather than being swallowed by `bookmark set`. Thrown from any read
 * or write touching bookmarks when `jj bookmark list` reports a multi-element
 * `target` array. Without this, concurrent op-log updates in multi-workspace
 * flows become invisible corruption.
 */
class VcsBookmarkDivergentError extends Error {
    name = 'VcsBookmarkDivergentError';
    bookmarkName;
    divergentTargets;
    hint;
    constructor(fields) {
        super(`bookmark '${fields.bookmarkName}' is divergent across ${fields.divergentTargets.length} targets`);
        this.bookmarkName = fields.bookmarkName;
        this.divergentTargets = fields.divergentTargets;
        this.hint = fields.hint;
    }
}
exports.VcsBookmarkDivergentError = VcsBookmarkDivergentError;
/**
 * Phase 4 D-14: thrown by `vcs.commit()` when a phase-merge squash is attempted
 * while `.planning/phases/{N}/incomplete-work.md` is non-empty. Caller must
 * empty the queue file (delete entries they've reviewed) before re-running.
 */
class VcsIncompleteSubagentsError extends Error {
    name = 'VcsIncompleteSubagentsError';
    entries;
    phaseDir;
    hint;
    constructor(fields) {
        super(`phase merge blocked: ${fields.entries.length} incomplete subagent ${fields.entries.length === 1 ? 'entry' : 'entries'} queued at ${fields.phaseDir}/incomplete-work.md`);
        this.entries = fields.entries;
        this.phaseDir = fields.phaseDir;
        this.hint = fields.hint;
    }
}
exports.VcsIncompleteSubagentsError = VcsIncompleteSubagentsError;
/**
 * Phase 3 D-08 + D-12: thrown by a JjVcsAdapter verb whose body has not yet
 * landed (per the D-10 verb-group ordering). The per-verb allowlist
 * (`BACKENDS_AVAILABLE_FOR_VERB` in backends.ts) gates fixture access
 * throw-not-skip, so a verb absent from the allowlist throws this typed
 * error rather than silently skipping (TEST-06 skip-count guard).
 *
 * Distinct from VcsExecError (which is for non-zero exit-code shell-outs).
 */
class VcsNotImplementedError extends Error {
    name = 'VcsNotImplementedError';
    constructor(message) {
        super(message);
    }
}
exports.VcsNotImplementedError = VcsNotImplementedError;
