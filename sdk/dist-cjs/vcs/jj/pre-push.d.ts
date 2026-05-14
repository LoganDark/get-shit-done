/**
 * sdk/src/vcs/jj/pre-push.ts — Phase 4 plan 06 (HOOK-04 / CI-04)
 *
 * Inline replication of acarapetis/jj-pre-push trigger logic (~30 LOC core).
 * CI-02 forbids Python runtime dependency, so the upstream tool is
 * reference-only (RESEARCH §"Pitfall 7" + §"Don't Hand-Roll").
 *
 * Trigger semantics (A4 assumption — RESEARCH):
 *   1. Enumerate bookmarks that would push (bookmarks with a tracked remote
 *      whose local target != remote tracking target, OR locals without any
 *      matching remote record = brand-new bookmarks).
 *   2. If 0 bookmarks to push: skip the hook fire (nothing being pushed).
 *   3. Else: fireHook(cwd, 'pre-push', { stagedFiles: [] }).
 *   4. Return the hook's ExecResult — caller bails on non-zero before
 *      invoking jj git push.
 */
import type { ExecResult } from '../exec.js';
/**
 * Fire pre-push hook iff there are bookmarks that would push.
 *
 * Returns ExecResult — exitCode 0 means "ok to proceed with jj git push"
 * (either no bookmarks to push so no fire happened, OR the fire passed).
 * Non-zero exitCode means the hook rejected the push.
 */
export declare function firePrePushHook(cwd: string, opts?: {
    remote?: string;
}): ExecResult;
//# sourceMappingURL=pre-push.d.ts.map