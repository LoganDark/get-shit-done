/**
 * SDK-local worktree-list porcelain parser (CR-04).
 *
 * Phase 1 originally `require()`d the policy module at
 * get-shit-done/bin/lib/worktree-safety.cjs from inside the published
 * `@gsd-build/sdk` package. That works for in-repo execution (4 levels up
 * from sdk/dist-cjs/vcs/backends/git.js lands at the repo root) but fails
 * for any downstream consumer who installed the package from npm — the
 * `files` field in sdk/package.json does NOT bundle bin/lib/, and 4
 * levels up from node_modules/@gsd-build/sdk/dist-cjs/vcs/backends/ is
 * node_modules/@gsd-build/.
 *
 * This module re-implements the small porcelain parser the adapter
 * needs. It is intentionally a NEAR-DUPLICATE of
 * worktree-safety.cjs::parseWorktreeEntries, but expanded to also
 * capture `HEAD <sha>` and `locked` lines (WR-03) so the adapter can
 * populate `WorkspaceInfo.rev` and `WorkspaceInfo.locked` non-trivially.
 *
 * ADR-0004 still names worktree-safety.cjs as the canonical policy
 * owner of CLI-side worktree decisions (prune, health, inventory). The
 * adapter's `workspace.list` is a read-only view of the same porcelain
 * output, so this duplication is bounded and Phase 2/3 can fold the
 * two parsers together once the CLI has migrated onto the adapter.
 */
export interface WorktreeListEntry {
    path: string;
    /** HEAD sha if reported by `git worktree list --porcelain`, else `''`. */
    head: string;
    /** Branch ref short name (e.g. `main`) if reported, else `null`. */
    branch: string | null;
    /** True when the porcelain block contains a `locked` line. */
    locked: boolean;
}
export interface WorktreeListResult {
    ok: boolean;
    reason: 'ok' | 'git_timed_out' | 'git_list_failed';
    porcelain: string;
    entries: WorktreeListEntry[];
}
/**
 * Parse the porcelain output of `git worktree list --porcelain`.
 *
 * Format (per `git-worktree(1)`): each worktree is a block of `key value`
 * lines separated by a blank line. The first line of each block is
 * `worktree <path>`. Subsequent lines may include `HEAD <sha>`,
 * `branch refs/heads/<name>`, `bare`, `detached`, `locked` (with optional
 * reason), `prunable` (with optional reason).
 */
export declare function parseWorktreePorcelainEntries(porcelain: string): WorktreeListEntry[];
/**
 * Run `git worktree list --porcelain` and parse the output.
 *
 * Mirrors `worktree-safety.cjs::readWorktreeList` for the read-only view
 * the SDK adapter needs. Returns a structured failure shape (`ok: false`)
 * for timeout and list-failure cases so callers can distinguish them.
 */
export declare function readWorktreeList(cwd: string): WorktreeListResult;
//# sourceMappingURL=worktree-list.d.ts.map