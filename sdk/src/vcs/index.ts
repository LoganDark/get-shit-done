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
  // Plan 03 replaces this body with `return createGitAdapter(cwd)`.
  // For plan 02, return a frozen stub that surfaces `kind` and `cwd` only.
  return createGitAdapterStub(cwd);
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

// Stub — replaced by createGitAdapter in plan 03.
function createGitAdapterStub(cwd: string): VcsAdapter {
  const notImpl = (verb: string) => () => {
    throw new GSDError(
      `vcs.${verb} not yet implemented (plan 03 wires the git backend)`,
      ErrorClassification.Blocked,
    );
  };
  return Object.freeze({
    kind: 'git' as const,
    cwd,
    commit: notImpl('commit') as never,
    log: notImpl('log') as never,
    status: notImpl('status') as never,
    diff: notImpl('diff') as never,
    refs: Object.freeze({
      head: 'head:' as unknown as VcsAdapter['refs']['head'],
      parent: 'parent:' as unknown as VcsAdapter['refs']['parent'],
      bookmarks: Object.freeze({
        list: notImpl('refs.bookmarks.list') as never,
        create: notImpl('refs.bookmarks.create') as never,
        move: notImpl('refs.bookmarks.move') as never,
        delete: notImpl('refs.bookmarks.delete') as never,
        exists: notImpl('refs.bookmarks.exists') as never,
      }),
    }),
    workspace: Object.freeze({
      add: notImpl('workspace.add') as never,
      forget: notImpl('workspace.forget') as never,
      list: notImpl('workspace.list') as never,
    }),
    hooks: Object.freeze({ fire: notImpl('hooks.fire') as never }),
    findConflicts: notImpl('findConflicts') as never,
    push: notImpl('push') as never,
    fetch: notImpl('fetch') as never,
    gitOnly: Object.freeze({
      createAnnotatedTag: notImpl('gitOnly.createAnnotatedTag') as never,
      version: notImpl('gitOnly.version') as never,
    }),
  }) as unknown as VcsAdapter;
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
