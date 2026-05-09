/**
 * vcs.hooks.fire primitive.
 * D-05: shells out to .githooks/<stage> synchronously and surfaces exit code.
 * Hook scripts themselves are NOT modified in Phase 1.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { vcsExec } from './exec.js';
import type { ExecResult } from './exec.js';
import type { HookStage, HookContext } from './types.js';

export function fireHook(cwd: string, stage: HookStage, ctx?: HookContext): ExecResult {
  const hookPath = join(cwd, '.githooks', stage);
  if (!existsSync(hookPath)) {
    return { exitCode: 0, stdout: '', stderr: '', timedOut: false, error: null };
  }
  // Execute the hook directly. Pass staged files via env for Phase 4 parity
  // with git's hook contract (jj non-colocated will rely on this env channel).
  const _env = { ...process.env, ...(ctx?.env ?? {}) };
  void _env;
  const _stagedFiles = ctx?.stagedFiles ?? [];
  void _stagedFiles;
  // Placeholder for v2 PATH-shim wrapper (D-05 + HOOK-05); the env stash above
  // is wired through when the wrapper lands.
  return vcsExec(cwd, hookPath, [], { timeout: 60_000 });
}
