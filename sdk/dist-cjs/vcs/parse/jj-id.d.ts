/**
 * change_id <-> commit_id translator for the jj backend.
 *
 * Phase 3 needed the forward direction (commit_id <- change_id) because
 * pre-Phase-8 `LogEntry.hash = commit_id`. After Phase 8 D-05 (FLIP-02),
 * `LogEntry.id` is the active backend's canonical revision identifier
 * (`change_id` on jj); this helper survives as the legitimate boundary-io
 * reverse-resolve (audit verdict: `boundary-io`). The reverse
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