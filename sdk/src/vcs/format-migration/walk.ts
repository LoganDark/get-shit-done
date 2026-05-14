/**
 * format-migration/walk.ts — enumerate the in-scope .planning/ file set.
 *
 * Pattern: RESEARCH §"Don't Hand-Roll Glob Walking" — use Node 20+
 * `fs.readdirSync(root, { recursive: true, withFileTypes: true })` rather
 * than adding a glob dependency.
 *
 * Scope tables locked by RESEARCH §"`.planning/` Surface Inventory" (lines
 * 692-708):
 *
 *   IN scope:
 *     - .planning/STATE.md (top-level; YAML frontmatter is OUT but the
 *       rewriter scans the whole file body — the frontmatter section has
 *       no SHA-shaped tokens, so this is safe).
 *     - .planning/phases/**\/*.md (all phase markdown — SUMMARY/LEARNINGS/
 *       REVIEW/VERIFICATION/PATTERNS/CONTEXT/DISCUSSION/RESEARCH/PLAN).
 *     - .planning/intel/**\/*.md
 *     - .planning/research/**\/*.md
 *     - .planning/debug/**\/*.md
 *     - .planning/todos/**\/*.md
 *
 *   OUT of scope (RESEARCH explicitly):
 *     - .planning/config.json (handled separately as the adapter-flip write)
 *     - .planning/ROADMAP.md (verified zero SHAs in Phase 3 D-20)
 *     - .planning/PROJECT.md (verified zero SHAs)
 *     - .planning/REQUIREMENTS.md (verified zero SHAs)
 *     - tests/baselines/git-vcs/ etc. (OUT per Open Q #2 — non-.planning anyway)
 *     - .git/ / .jj/ commit messages (OUT per Open Q #1)
 *
 * Security V4 (RESEARCH §Security): symlinks pointing OUTSIDE `cwd` are
 * silently skipped via `lstatSync` + `realpathSync` containment check.
 */

import { readdirSync, lstatSync, realpathSync, type Dirent } from 'node:fs';
import { join, resolve, sep as pathSep } from 'node:path';

/** Files matched literally (no directory walk). */
export const IN_SCOPE_FILES: readonly string[] = ['.planning/STATE.md'];

/** Roots walked recursively; pattern is the per-entry filename test. */
export interface InScopeDirGlob {
  root: string;
  pattern: RegExp;
}
export const IN_SCOPE_DIR_GLOBS: readonly InScopeDirGlob[] = [
  { root: '.planning/phases', pattern: /\.md$/ },
  { root: '.planning/intel', pattern: /\.md$/ },
  { root: '.planning/research', pattern: /\.md$/ },
  { root: '.planning/debug', pattern: /\.md$/ },
  { root: '.planning/todos', pattern: /\.md$/ },
];

/** Files we never touch, even if a future glob pattern would otherwise match. */
export const OUT_OF_SCOPE: ReadonlySet<string> = new Set([
  '.planning/config.json',
  '.planning/ROADMAP.md',
  '.planning/PROJECT.md',
  '.planning/REQUIREMENTS.md',
]);

/**
 * Enumerate all in-scope files under `cwd`. Returns absolute paths sorted
 * lexicographically (deterministic — important because the migration commit's
 * `files` array must be stable across idempotent re-runs).
 *
 * Files that don't exist on disk are silently skipped. Symlinks are skipped
 * if their `realpath` resolves outside the canonical `cwd` (Security V4).
 *
 * @param cwd - Project root (absolute or relative; resolved via realpathSync
 *              with a fallback to `resolve(cwd)` if the dir itself isn't a
 *              symlink target).
 */
export function walkInScope(cwd: string): string[] {
  // Canonicalize cwd so symlink containment checks compare apples-to-apples.
  let canonicalCwd: string;
  try {
    canonicalCwd = realpathSync(resolve(cwd));
  } catch {
    canonicalCwd = resolve(cwd);
  }

  const results: string[] = [];

  // Literal in-scope files.
  for (const rel of IN_SCOPE_FILES) {
    const abs = join(canonicalCwd, rel);
    if (OUT_OF_SCOPE.has(rel)) continue;
    if (!isSafeRegularFile(abs, canonicalCwd)) continue;
    results.push(abs);
  }

  // Recursive directory globs.
  for (const glob of IN_SCOPE_DIR_GLOBS) {
    const rootAbs = join(canonicalCwd, glob.root);
    let entries: Dirent[];
    try {
      entries = readdirSync(rootAbs, { recursive: true, withFileTypes: true });
    } catch {
      continue; // root absent → silently skip
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      // parentPath was added in Node 20.12; fall back to `path` for older
      // shapes. Both fields point at the absolute directory containing the
      // entry when readdirSync is called with `recursive: true`.
      const parent =
        (entry as Dirent & { parentPath?: string }).parentPath ?? entry.path;
      const abs = join(parent, entry.name);
      // Out-of-scope shortcut: produce the rel form against canonicalCwd.
      const rel = toPlanningRel(abs, canonicalCwd);
      if (rel === null) continue; // outside cwd — defensive
      if (OUT_OF_SCOPE.has(rel)) continue;
      if (!glob.pattern.test(entry.name)) continue;
      if (!isSafeRegularFile(abs, canonicalCwd)) continue;
      results.push(abs);
    }
  }

  // Deduplicate then sort.
  const dedup = Array.from(new Set(results));
  dedup.sort();
  return dedup;
}

/**
 * Verify `abs` is a regular file (not a symlink-to-outside) under `canonicalCwd`.
 * Returns false on stat errors (file doesn't exist, no-permission, etc.).
 */
function isSafeRegularFile(abs: string, canonicalCwd: string): boolean {
  let lst;
  try {
    lst = lstatSync(abs);
  } catch {
    return false;
  }
  if (lst.isSymbolicLink()) {
    let real: string;
    try {
      real = realpathSync(abs);
    } catch {
      return false;
    }
    // Containment check: real must equal canonicalCwd or live underneath it.
    if (real !== canonicalCwd && !real.startsWith(canonicalCwd + pathSep)) {
      return false;
    }
    // Re-stat through the symlink to verify it points at a regular file.
    try {
      const real2 = lstatSync(real);
      return real2.isFile();
    } catch {
      return false;
    }
  }
  return lst.isFile();
}

/**
 * Compute the path of `abs` relative to `canonicalCwd`, in POSIX form (forward
 * slashes), or null if `abs` is outside `canonicalCwd`. Used for OUT_OF_SCOPE
 * key lookups (the set keys are POSIX relative paths).
 */
function toPlanningRel(abs: string, canonicalCwd: string): string | null {
  if (abs === canonicalCwd) return '';
  if (!abs.startsWith(canonicalCwd + pathSep)) return null;
  return abs.slice(canonicalCwd.length + 1).split(pathSep).join('/');
}
