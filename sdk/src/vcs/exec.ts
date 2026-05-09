/**
 * vcs/exec — single spawn wrapper backing every VcsAdapter call.
 *
 * Return shape: { exitCode, stdout, stderr, timedOut, error }
 *   - timedOut: true when spawnSync reports SIGTERM + ETIMEDOUT — callers must
 *               branch on this to surface a structured warning (PRED.k302).
 *   - error:    spawnSync error object or null
 *
 * Byte-identity reference: get-shit-done/bin/lib/core.cjs:742-758.
 * Adapter contract requires the 5-field shape (RESEARCH Pitfall 4).
 */

import { spawnSync } from 'node:child_process';

// ─── Constants ───────────────────────────────────────────────────────────────

export const DEFAULT_VCS_TIMEOUT_MS = 10000;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  error: Error | null;
}

export interface ExecOptions {
  timeout?: number;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class VcsExecError extends Error {
  readonly name = 'VcsExecError';
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly args: string[];

  constructor(
    message: string,
    fields: {
      exitCode: number;
      stdout: string;
      stderr: string;
      timedOut: boolean;
      args: string[];
    },
  ) {
    super(message);
    this.exitCode = fields.exitCode;
    this.stdout = fields.stdout;
    this.stderr = fields.stderr;
    this.timedOut = fields.timedOut;
    this.args = fields.args;
  }
}

// ─── Spawn wrapper ───────────────────────────────────────────────────────────

/**
 * Execute a binary with a bounded timeout.
 * Mirrors the byte-identity reference at core.cjs:742-758.
 */
export function vcsExec(
  cwd: string,
  bin: string,
  args: string[],
  options: ExecOptions = {},
): ExecResult {
  const timeout = options.timeout ?? DEFAULT_VCS_TIMEOUT_MS;
  const result = spawnSync(bin, args, {
    cwd,
    stdio: 'pipe',
    encoding: 'utf-8',
    timeout,
  });
  const timedOut =
    result.signal === 'SIGTERM' &&
    (result.error as NodeJS.ErrnoException | null | undefined)?.code === 'ETIMEDOUT';
  return {
    exitCode: result.status ?? 1,
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
export function execGit(cwd: string, args: string[], options: ExecOptions = {}): ExecResult {
  return vcsExec(cwd, 'git', args, options);
}
