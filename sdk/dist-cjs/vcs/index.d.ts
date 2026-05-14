/**
 * createVcsAdapter — public factory.
 * VCS-02: returns a frozen plain object typed as the discriminated VcsAdapter union.
 * VCS-03: auto-detects backend; Phase 3 D-17 reverses Phase 1 D-04 priority for the
 * colocated case (git wins ties to prevent surprise-flipping users into jj before
 * they've opted in) and adds a sticky `vcs.adapter` config layer in
 * `.planning/config.json`.
 *
 * Phase 6 B-09: `'auto'` is no longer a tolerated WRITE value. The decision is
 * locked-in at all times. The only time the SDK auto-detects is when the
 * config is missing the field or carries a legacy `'auto'` value — at which
 * point the resolver detects ONCE and writes the concrete value back. After
 * that, every read of `vcs.adapter` returns `'git'` or `'jj'` directly.
 * Changing the value requires `migrate-vcs` (explicit user intent).
 */
import type { VcsAdapter, VcsKind } from './types.js';
export interface CreateVcsAdapterOpts {
    kind?: VcsKind;
}
export declare function createVcsAdapter(cwd: string, opts?: CreateVcsAdapterOpts): VcsAdapter;
export type { VcsAdapter, GitVcsAdapter, JjVcsAdapter, VcsKind, VcsBackendKey, RevisionExpr, } from './types.js';
export { expr } from './expr.js';
export { BACKENDS_AVAILABLE, BACKENDS_DECLARED, parseBackendsEnv } from './backends.js';
export { vcsExec, execGit, VcsExecError, DEFAULT_VCS_TIMEOUT_MS } from './exec.js';
//# sourceMappingURL=index.d.ts.map