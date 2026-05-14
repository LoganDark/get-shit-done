/**
 * Static type-narrowing assertions for D-07 (gitOnly is branch-typed).
 *
 * This file is type-only. It contains no runtime code. Its sole purpose is to
 * force `tsc --noEmit` to fail if `gitOnly` ever becomes accessible on
 * `JjVcsAdapter` or on an unnarrowed `VcsAdapter`.
 *
 * Mechanism: every `@ts-expect-error` MUST be satisfied by an actual type error
 * on the next line. If the type accidentally becomes permissive (e.g., gitOnly
 * leaks onto JjVcsAdapter), the `@ts-expect-error` itself becomes unsatisfied
 * and tsc reports "Unused '@ts-expect-error' directive" — failing the build.
 *
 * REVISION B-2: this file is the automated verification path for ROADMAP SC-5
 * ("calls into vcs.gitOnly.* are typed such that a future jj backend errors
 *  clearly and statically when invoked"). Verified via `tsc --noEmit`.
 */

import type { VcsAdapter, GitVcsAdapter, JjVcsAdapter } from '../types.js';

// ─── Negative: gitOnly on JjVcsAdapter must be a compile error ──────────────

declare const jjAdapter: JjVcsAdapter;

// @ts-expect-error D-07: JjVcsAdapter has no `gitOnly` property.
jjAdapter.gitOnly;

// @ts-expect-error D-07: JjVcsAdapter has no `gitOnly` property (method form).
jjAdapter.gitOnly.createAnnotatedTag('v1', 'msg', 'head:' as never);

// ─── Negative: gitOnly on unnarrowed VcsAdapter must be a compile error ────

declare const adapter: VcsAdapter;

// @ts-expect-error D-07: cannot access gitOnly without narrowing on `kind`.
adapter.gitOnly;

// ─── Positive: gitOnly on narrowed GitVcsAdapter compiles cleanly ──────────

declare const gitAdapter: GitVcsAdapter;

// No @ts-expect-error — this MUST compile cleanly.
gitAdapter.gitOnly.version();
gitAdapter.gitOnly.createAnnotatedTag('v1', 'msg', 'head:' as never);

// ─── Positive: narrowing via runtime kind discriminator works ──────────────

if (adapter.kind === 'git') {
  // No @ts-expect-error — narrowing makes gitOnly accessible.
  adapter.gitOnly.version();
}

// Touch every binding so unused-variable lints don't strip the declarations.
export type _GitOnlyTypeTest = [typeof jjAdapter, typeof adapter, typeof gitAdapter];
