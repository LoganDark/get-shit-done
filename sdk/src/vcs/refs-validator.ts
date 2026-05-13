/**
 * sdk/src/vcs/refs-validator.ts — Phase 4 plan 07 D-24 / cr-01 fold-in
 *
 * Shared refname validator. Lifted from sdk/src/vcs/expr.ts where it
 * was a module-private helper to expr.bookmark. Now consumed by:
 *   - expr.bookmark (unchanged behaviour; just imports from here)
 *   - refs.bookmarks.{create,move,delete,exists} on BOTH backends, with
 *     opts.raw === true (defense-in-depth: also applied to non-raw paths
 *     since the gsd/ prefix is incidental protection, not contract).
 *
 * cr-01 source: .planning/phases/03-jj-backend-core-squash-refs-conflict/03-REVIEW.md
 * CR-01 (raw-bookmark-argv-injection). The fix prevents an attacker-controlled
 * name like '-D' or '--force-delete' from being interpreted as a flag at the
 * jj/git argv position.
 *
 * Defense-in-depth pair: callers also insert `--` end-of-options separator
 * before the user-influenced positional. The validator catches the name shape
 * upfront; the separator is the second layer.
 *
 * Rules carried verbatim from the original expr.ts:38-61 body, with the
 * outer error prefix retained as `expr.bookmark:` so existing test regexes
 * (sdk/src/vcs/__tests__/expr.test.ts) keep matching unchanged.
 */

// WR-07: validate against git's refname rules (see git-check-ref-format(1)).
// The factory is the right place to enforce this so jj and git share the
// constraint — feeding `expr.bookmark('-D')` to `git branch <name>` would have
// the worst-case interpretation `git branch -D` (deletes branches).
//
// Reject:
//   - empty string
//   - any ASCII control byte (0x00-0x1f, 0x7f), space, or one of `~^:?*[\\`
//   - leading `-` (would be parsed as a flag)
//   - leading `.` (forbidden by refname rules)
//   - `..` or `@{` anywhere
//   - trailing `/` or `.lock`
//   - any path component (`/`-separated) that starts with `.` or ends with `.lock`
const REFNAME_FORBIDDEN_BYTE_OR_SET = /[\x00-\x1f\x7f ~^:?*[\\]/;

/**
 * Validate a refname (bookmark name or git branch name) for argv safety
 * and refname-format conformance.
 *
 * Rules (carried verbatim from the original expr.ts:38-61):
 *   - Non-empty
 *   - No forbidden control bytes (\x00..\x1f, \x7f), space, or `~^:?*[\`
 *   - No leading `-` (would be confused with a flag at argv position)
 *   - No leading `.`, trailing `/`, trailing `.lock`
 *   - No `..` or `@{` anywhere
 *   - Each `/`-separated component: non-empty, no leading `.`, no trailing `.lock`
 *
 * Error messages retain the `expr.bookmark:` prefix for backward compat
 * with the test regex patterns in __tests__/expr.test.ts.
 *
 * @throws Error with descriptive message on rejection
 */
export function validateRefname(name: string): void {
  if (!name) throw new Error(`expr.bookmark: empty name`);
  if (REFNAME_FORBIDDEN_BYTE_OR_SET.test(name)) {
    throw new Error(`expr.bookmark: invalid name '${name}' (forbidden byte or character)`);
  }
  if (name.startsWith('-')) {
    throw new Error(`expr.bookmark: invalid name '${name}' (leading '-')`);
  }
  if (name.startsWith('.') || name.endsWith('/') || name.endsWith('.lock')) {
    throw new Error(`expr.bookmark: invalid name '${name}' (refname format)`);
  }
  if (name.includes('..') || name.includes('@{')) {
    throw new Error(`expr.bookmark: invalid name '${name}' (forbidden sequence)`);
  }
  // Per-component checks for path-shaped names like 'feature/x'.
  for (const component of name.split('/')) {
    if (!component) {
      throw new Error(`expr.bookmark: invalid name '${name}' (empty path component)`);
    }
    if (component.startsWith('.') || component.endsWith('.lock')) {
      throw new Error(`expr.bookmark: invalid name '${name}' (component '${component}')`);
    }
  }
}

/**
 * Phase 4 plan 07 backward-compat alias. expr.ts:38 originally named the
 * helper `validateBookmarkName`; the shared module renames it `validateRefname`
 * (more accurate — works for both jj bookmarks and git branches). The alias
 * keeps any external imports of the old name working without churn.
 */
export const validateBookmarkName = validateRefname;

/**
 * Re-export the forbidden-byte regex so expr.ts (which uses it inline in
 * `expr.remote` for the remote-name validation) can import a single source
 * of truth rather than duplicating the character class.
 */
export { REFNAME_FORBIDDEN_BYTE_OR_SET };
