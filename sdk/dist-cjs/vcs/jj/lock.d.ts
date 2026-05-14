/**
 * sdk/src/vcs/jj/lock.ts — Phase 4 plan 03
 *
 * Per-workspace advisory flock primitive (D-19). RAII release-handle pattern.
 *
 * Pitfall 6 (RESEARCH): do NOT lock jj's internal `checkout` pointer file
 * directly — perms 0600, owned by jj's snapshot serialisation. Sidecar
 * sentinel at .jj/working_copy/gsd-lock instead.
 *
 * D-21: stale-WC handling (jj #7538) folded into acquisition path. After lock
 * is acquired, run `jj workspace update-stale` from inside the locked workspace
 * UNCONDITIONALLY (it's a no-op when the WC is fresh — verified locally).
 *
 * Pitfall 9 (RESEARCH): jj 0.41's `json(self)` template does NOT expose a
 * `stale` boolean, so there is no probe call from the lock-acquisition path
 * that could trigger an auto-snapshot on the wrong workspace. The
 * `mainRepoRoot` option is accepted on the API for forward-compat if a future
 * jj version surfaces a probe-able stale field. For now we touch only
 * `workspacePath` via update-stale, which honours Pitfall 9's "stale-recovery
 * targets the specific workspace" prescription.
 *
 * A2 assumption (RESEARCH): the sentinel under .jj/working_copy/gsd-lock does
 * not interfere with jj's internal snapshot serialisation. Plan 03 Task 3's
 * "jj operations still work in the locked workspace" test empirically validates
 * this. If a future regression reveals interference, fall back per RESEARCH A2
 * to `.jj/gsd-locks/<basename(workspacePath)>.lock` (a path OUTSIDE
 * `.jj/working_copy/`).
 */
export interface JjLockHandle {
    release(): void;
}
export interface AcquireJjWriteLockOpts {
    /** Total acquisition timeout in ms. Default 30_000 (D-19). */
    timeout?: number;
    /** Poll interval in ms while waiting for the sentinel to become creatable. Default 25. */
    pollInterval?: number;
    /**
     * Main repo root for the stale-WC probe (Pitfall 9). If omitted, defaults to
     * `workspacePath` itself (the orchestrator-side caller is expected to pass
     * the main repo root for D-21 to work correctly; tests can omit when
     * stale-recovery is not under exercise).
     */
    mainRepoRoot?: string;
}
/**
 * Acquire an advisory write lock on a jj workspace.
 *
 * Mechanism: O_EXCL open on `.jj/working_copy/gsd-lock` sentinel sidecar.
 * Polls on EEXIST until the lock becomes available or the timeout fires.
 *
 * @param workspacePath Absolute path to the workspace root (NOT the .jj dir).
 * @param opts Acquisition options (timeout, poll interval, main repo root for stale probe).
 * @returns A handle whose `release()` removes the sentinel.
 * @throws If the timeout fires before the sentinel becomes creatable.
 */
export declare function acquireJjWriteLock(workspacePath: string, opts?: AcquireJjWriteLockOpts): JjLockHandle;
//# sourceMappingURL=lock.d.ts.map