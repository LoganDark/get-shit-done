/**
 * Git backend implementation of the VcsAdapter contract.
 *
 * GIT-01: every method behaviorally equivalent to the existing execSync('git …') call sites in
 *         bin/lib/*.cjs (commands.cjs:300-415 cmdCommit, init.cjs:1519/1538/1641, etc.).
 * GIT-02: byte-identical { exitCode, stdout, stderr } to pre-migration shape via vcsExec.
 * GIT-03: vcs.gitOnly.createAnnotatedTag and gitOnly.version are reachable on this branch only.
 *
 * RESEARCH Pitfall 5: vcs.workspace.list delegates to worktree-safety.cjs::readWorktreeList,
 *                     does NOT duplicate the porcelain parser. ADR-0004 owns the policy seam.
 * RESEARCH Pitfall 4: ExecResult is the 5-field shape; adapter exposes 3-field projections only
 *                     where the typed result calls for them (commit, push, fetch, hooks).
 * RESEARCH Open Q1:   findConflicts({scope:'all'}) returns [] on git — Phase 3 jj backend
 *                     implements the real `conflict()` revset semantics.
 *
 * D-08:  vcs.commit auto-advances the active branch — native git behavior of `git commit` on
 *        a checked-out branch already does this; adapter is a thin wrapper, no extra logic.
 * D-14:  __vcsTestOnly snapshot/restore implements RESEARCH Pattern 3 (strategy 3).
 */
import type { GitVcsAdapter } from '../types.js';
export declare function parseDiffCheckPath(line: string): string | null;
export declare function createGitAdapter(cwd: string): GitVcsAdapter;
//# sourceMappingURL=git.d.ts.map