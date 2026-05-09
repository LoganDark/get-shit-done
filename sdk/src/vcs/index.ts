/**
 * createVcsAdapter — public factory.
 * VCS-02: returns a frozen plain object typed as the discriminated VcsAdapter union.
 * VCS-03: auto-detects backend (.jj first, .git fallback, GSD_VCS env override).
 *
 * Phase 1: only the git backend has a real implementation (plan 03 wires it in).
 * jj kind throws GSDError('jj backend not yet implemented') — Phase 3 replaces.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { GSDError, ErrorClassification } from '../errors.js';
import { createGitAdapter } from './backends/git.js';
import type { VcsAdapter, VcsKind } from './types.js';

export interface CreateVcsAdapterOpts {
  kind?: VcsKind;
}

export function createVcsAdapter(cwd: string, opts: CreateVcsAdapterOpts = {}): VcsAdapter {
  const kind = resolveKind(cwd, opts);
  if (kind === 'jj') {
    // ErrorClassification.Blocked = 'blocked' (sdk/src/errors.ts:29) — used directly
    // per planning revision; no fallback or `as`-cast needed.
    throw new GSDError('jj backend not yet implemented (Phase 3)', ErrorClassification.Blocked);
  }
  // Plan 03: createGitAdapter is the real backend (sdk/src/vcs/backends/git.ts).
  return createGitAdapter(cwd);
}

function resolveKind(cwd: string, opts: CreateVcsAdapterOpts): VcsKind {
  if (opts.kind) return opts.kind;
  const envOverride = process.env.GSD_VCS;
  if (envOverride === 'git' || envOverride === 'jj') return envOverride;
  if (existsSync(join(cwd, '.jj'))) return 'jj';
  if (existsSync(join(cwd, '.git'))) return 'git';
  // No VCS detected — default to git per RESEARCH § Auto-detect (allows pre-init flows).
  return 'git';
}

// Re-exports for convenience
export type {
  VcsAdapter,
  GitVcsAdapter,
  JjVcsAdapter,
  VcsKind,
  VcsBackendKey,
  RevisionExpr,
} from './types.js';
export { expr } from './expr.js';
export { BACKENDS_AVAILABLE, BACKENDS_DECLARED, parseBackendsEnv } from './backends.js';
export { vcsExec, execGit, VcsExecError, DEFAULT_VCS_TIMEOUT_MS } from './exec.js';
