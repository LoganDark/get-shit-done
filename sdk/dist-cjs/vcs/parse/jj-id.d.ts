/**
 * change_id <-> commit_id translator for the jj backend.
 *
 * Phase 3 only needs the forward direction (commit_id <- change_id) because
 * `LogEntry.hash = commit_id` per PITFALL 1 in 03-RESEARCH.md. The reverse
 * (change_id <- commit_id) lands here as a public symbol for any future
 * `vcs.jjOnly.commitIdOf` helper (Phase 2.1 D-14 deferred placement).
 *
 * Mirrors the single-stateless-string-mapper shape of `parse/jj-rev.ts`.
 *
 * Both probes use `jj log -r <input> -T '<field>' --no-graph -n 1`, going
 * through the JJ-02 jjArgv prefix (--repository, --no-pager, --color never,
 * --quiet). D-05: never `--ignore-working-copy`.
 *
 * On non-zero exit, throws `VcsExecError` (typed; callers can
 * `instanceof`-check) — NOT a plain Error.
 */
export declare function commitIdOf(cwd: string, changeId: string): string;
export declare function changeIdOf(cwd: string, commitId: string): string;
//# sourceMappingURL=jj-id.d.ts.map