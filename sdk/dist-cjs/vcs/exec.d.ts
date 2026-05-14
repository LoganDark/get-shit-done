/**
 * vcs/exec — single spawn wrapper backing every VcsAdapter call.
 *
 * Return shape: { exitCode, stdout, stderr, timedOut, error }
 *   - exitCode: process exit status, OR `EXIT_CODE_SIGNAL_KILLED` (-1) when the
 *               child was killed by signal (spawnSync result.status === null).
 *               Distinguishing these cases matters because `git diff` returns
 *               exit 1 to mean "differences found" — a normal outcome — and
 *               callers cannot otherwise distinguish that from "process was
 *               killed". See WR-06.
 *   - timedOut: true when spawnSync reports SIGTERM + ETIMEDOUT — callers must
 *               branch on this to surface a structured warning (PRED.k302).
 *   - error:    spawnSync error object or null
 *
 * Byte-identity reference: get-shit-done/bin/lib/core.cjs:742-758.
 * Adapter contract requires the 5-field shape (RESEARCH Pitfall 4).
 */
export declare const DEFAULT_VCS_TIMEOUT_MS = 10000;
/**
 * Sentinel value for `ExecResult.exitCode` when spawnSync's `result.status` is
 * null (process killed by signal, e.g. SIGTERM from a timeout, or never
 * spawned). Callers that need to distinguish "killed" from "exited 1" should
 * branch on `exitCode === EXIT_CODE_SIGNAL_KILLED` rather than treating the
 * `1` collapse as ambiguous (WR-06). The 5-field shape also exposes `timedOut`
 * and `error` for the specific causes.
 */
export declare const EXIT_CODE_SIGNAL_KILLED = -1;
export interface ExecResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    error: Error | null;
}
export interface ExecOptions {
    timeout?: number;
    /**
     * Phase 3 JJ-07: extra environment variables to pass to the spawned child.
     * Merged on top of `process.env` (caller-supplied keys win). Does NOT mutate
     * the calling process's env. Primary consumer: jj.ts `commit()` passing
     * `JJ_USER` / `JJ_EMAIL` when set.
     */
    env?: Record<string, string>;
}
export declare class VcsExecError extends Error {
    readonly name = "VcsExecError";
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
    readonly timedOut: boolean;
    readonly args: string[];
    constructor(message: string, fields: {
        exitCode: number;
        stdout: string;
        stderr: string;
        timedOut: boolean;
        args: string[];
    });
}
/**
 * Execute a binary with a bounded timeout.
 * Mirrors the byte-identity reference at core.cjs:742-758.
 */
export declare function vcsExec(cwd: string, bin: string, args: string[], options?: ExecOptions): ExecResult;
/**
 * Convenience for the git backend: vcsExec with bin='git' partial-applied.
 * Matches the existing `execGit(cwd, args, options)` signature in core.cjs:742.
 */
export declare function execGit(cwd: string, args: string[], options?: ExecOptions): ExecResult;
//# sourceMappingURL=exec.d.ts.map