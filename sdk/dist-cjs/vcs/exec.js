"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.VcsExecError = exports.EXIT_CODE_SIGNAL_KILLED = exports.DEFAULT_VCS_TIMEOUT_MS = void 0;
exports.vcsExec = vcsExec;
exports.execGit = execGit;
const node_child_process_1 = require("node:child_process");
// ─── Constants ───────────────────────────────────────────────────────────────
exports.DEFAULT_VCS_TIMEOUT_MS = 10000;
/**
 * Sentinel value for `ExecResult.exitCode` when spawnSync's `result.status` is
 * null (process killed by signal, e.g. SIGTERM from a timeout, or never
 * spawned). Callers that need to distinguish "killed" from "exited 1" should
 * branch on `exitCode === EXIT_CODE_SIGNAL_KILLED` rather than treating the
 * `1` collapse as ambiguous (WR-06). The 5-field shape also exposes `timedOut`
 * and `error` for the specific causes.
 */
exports.EXIT_CODE_SIGNAL_KILLED = -1;
// ─── Errors ──────────────────────────────────────────────────────────────────
class VcsExecError extends Error {
    name = 'VcsExecError';
    exitCode;
    stdout;
    stderr;
    timedOut;
    args;
    constructor(message, fields) {
        super(message);
        this.exitCode = fields.exitCode;
        this.stdout = fields.stdout;
        this.stderr = fields.stderr;
        this.timedOut = fields.timedOut;
        this.args = fields.args;
    }
}
exports.VcsExecError = VcsExecError;
// ─── Spawn wrapper ───────────────────────────────────────────────────────────
/**
 * Execute a binary with a bounded timeout.
 * Mirrors the byte-identity reference at core.cjs:742-758.
 */
function vcsExec(cwd, bin, args, options = {}) {
    const timeout = options.timeout ?? exports.DEFAULT_VCS_TIMEOUT_MS;
    // Phase 3 JJ-07: merge opts.env onto process.env for the spawned child.
    // Does NOT mutate the calling process env — spawnSync receives a fresh
    // object. Omitting the `env` spawn option entirely would let Node inherit
    // process.env automatically; passing { ...process.env } produces the same
    // observable effect plus the caller-merge layer.
    const childEnv = options.env
        ? { ...process.env, ...options.env }
        : undefined;
    const result = (0, node_child_process_1.spawnSync)(bin, args, {
        cwd,
        stdio: 'pipe',
        encoding: 'utf-8',
        timeout,
        ...(childEnv ? { env: childEnv } : {}),
    });
    const timedOut = result.signal === 'SIGTERM' &&
        result.error?.code === 'ETIMEDOUT';
    return {
        // WR-06: result.status is null when killed by signal. Surface that as
        // EXIT_CODE_SIGNAL_KILLED (-1) so callers can disambiguate from a real
        // exit-1 (e.g. `git diff` reporting differences).
        exitCode: result.status ?? exports.EXIT_CODE_SIGNAL_KILLED,
        stdout: (result.stdout ?? '').toString().trim(),
        stderr: (result.stderr ?? '').toString().trim(),
        timedOut,
        error: result.error ?? null,
    };
}
/**
 * Convenience for the git backend: vcsExec with bin='git' partial-applied.
 * Matches the existing `execGit(cwd, args, options)` signature in core.cjs:742.
 */
function execGit(cwd, args, options = {}) {
    return vcsExec(cwd, 'git', args, options);
}
//# sourceMappingURL=exec.js.map