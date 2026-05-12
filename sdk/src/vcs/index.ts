/**
 * createVcsAdapter — public factory.
 * VCS-02: returns a frozen plain object typed as the discriminated VcsAdapter union.
 * VCS-03: auto-detects backend; Phase 3 D-17 reverses Phase 1 D-04 priority for the
 * colocated case (git wins ties to prevent surprise-flipping users into jj before
 * they've opted in) and adds a sticky `vcs.adapter` config layer in
 * `.planning/config.json`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGitAdapter } from './backends/git.js';
import { createJjAdapter } from './backends/jj.js';
import type { VcsAdapter, VcsKind } from './types.js';

export interface CreateVcsAdapterOpts {
  kind?: VcsKind;
}

export function createVcsAdapter(cwd: string, opts: CreateVcsAdapterOpts = {}): VcsAdapter {
  const kind = resolveKind(cwd, opts);
  if (kind === 'jj') {
    return createJjAdapter(cwd);
  }
  // Plan 03: createGitAdapter is the real backend (sdk/src/vcs/backends/git.ts).
  return createGitAdapter(cwd);
}

function resolveKind(cwd: string, opts: CreateVcsAdapterOpts): VcsKind {
  // 1. Explicit caller override wins everything.
  if (opts.kind) return opts.kind;
  // 2. Env override (Phase 1 VCS-03; ephemeral test runs).
  const envOverride = process.env.GSD_VCS;
  if (envOverride === 'git' || envOverride === 'jj') return envOverride;
  // 3. Phase 3 D-17: sticky preference via .planning/config.json `vcs.adapter`.
  const sticky = readVcsAdapterFromConfig(cwd);
  if (sticky === 'git' || sticky === 'jj') return sticky;
  // 4. 'auto' or absent: detect with D-17 reversal of Phase 1 D-04
  //    (git wins ties in colocated case to prevent surprise-flipping users
  //    into jj before they've opted in).
  const hasGit = existsSync(join(cwd, '.git'));
  const hasJj = existsSync(join(cwd, '.jj'));
  if (hasGit) return 'git'; // git wins ties — D-17
  if (hasJj) return 'jj';
  return 'git'; // greenfield default
}

/**
 * Phase 3 D-17: read the sticky `vcs.adapter` config field.
 *
 * Storage location: `.planning/config.json` `vcs.adapter` (planner's
 * discretion per 03-CONTEXT.md). Three legal values:
 *   - 'git' | 'jj' — explicit override
 *   - 'auto'        — fall through to detection (default)
 *
 * Returns undefined if the file does not exist, JSON parsing fails, or
 * `vcs.adapter` is absent. The caller treats undefined as 'auto'.
 *
 * No new dependency: thin readFileSync + JSON.parse with broad error
 * swallowing (mirrors how the existing config-read sites tolerate
 * missing/malformed config).
 */
function readVcsAdapterFromConfig(
  cwd: string
): 'git' | 'jj' | 'auto' | undefined {
  try {
    const text = readFileSync(join(cwd, '.planning', 'config.json'), 'utf8');
    const json = JSON.parse(text);
    const value = json?.vcs?.adapter;
    if (value === 'git' || value === 'jj' || value === 'auto') return value;
    return undefined;
  } catch {
    return undefined;
  }
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
