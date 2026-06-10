"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.OUT_OF_SCOPE = exports.IN_SCOPE_DIR_GLOBS = exports.IN_SCOPE_FILES = void 0;
exports.walkInScope = walkInScope;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/** Files matched literally (no directory walk). */
exports.IN_SCOPE_FILES = ['.planning/STATE.md'];
exports.IN_SCOPE_DIR_GLOBS = [
    { root: '.planning/phases', pattern: /\.md$/ },
    { root: '.planning/intel', pattern: /\.md$/ },
    { root: '.planning/research', pattern: /\.md$/ },
    { root: '.planning/debug', pattern: /\.md$/ },
    { root: '.planning/todos', pattern: /\.md$/ },
];
/** Files we never touch, even if a future glob pattern would otherwise match. */
exports.OUT_OF_SCOPE = new Set([
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
function walkInScope(cwd) {
    // Canonicalize cwd so symlink containment checks compare apples-to-apples.
    let canonicalCwd;
    try {
        canonicalCwd = (0, node_fs_1.realpathSync)((0, node_path_1.resolve)(cwd));
    }
    catch {
        canonicalCwd = (0, node_path_1.resolve)(cwd);
    }
    const results = [];
    // Literal in-scope files.
    for (const rel of exports.IN_SCOPE_FILES) {
        const abs = (0, node_path_1.join)(canonicalCwd, rel);
        if (exports.OUT_OF_SCOPE.has(rel))
            continue;
        if (!isSafeRegularFile(abs, canonicalCwd))
            continue;
        results.push(abs);
    }
    // Recursive directory globs.
    for (const glob of exports.IN_SCOPE_DIR_GLOBS) {
        const rootAbs = (0, node_path_1.join)(canonicalCwd, glob.root);
        let entries;
        try {
            entries = (0, node_fs_1.readdirSync)(rootAbs, { recursive: true, withFileTypes: true });
        }
        catch {
            continue; // root absent → silently skip
        }
        for (const entry of entries) {
            if (!entry.isFile())
                continue;
            // parentPath was added in Node 20.12; fall back to `path` for older
            // shapes. Both fields point at the absolute directory containing the
            // entry when readdirSync is called with `recursive: true`.
            const parent = entry.parentPath ?? entry.path;
            const abs = (0, node_path_1.join)(parent, entry.name);
            // Out-of-scope shortcut: produce the rel form against canonicalCwd.
            const rel = toPlanningRel(abs, canonicalCwd);
            if (rel === null)
                continue; // outside cwd — defensive
            if (exports.OUT_OF_SCOPE.has(rel))
                continue;
            if (!glob.pattern.test(entry.name))
                continue;
            if (!isSafeRegularFile(abs, canonicalCwd))
                continue;
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
function isSafeRegularFile(abs, canonicalCwd) {
    let lst;
    try {
        lst = (0, node_fs_1.lstatSync)(abs);
    }
    catch {
        return false;
    }
    if (lst.isSymbolicLink()) {
        let real;
        try {
            real = (0, node_fs_1.realpathSync)(abs);
        }
        catch {
            return false;
        }
        // Containment check: real must equal canonicalCwd or live underneath it.
        if (real !== canonicalCwd && !real.startsWith(canonicalCwd + node_path_1.sep)) {
            return false;
        }
        // Re-stat through the symlink to verify it points at a regular file.
        try {
            const real2 = (0, node_fs_1.lstatSync)(real);
            return real2.isFile();
        }
        catch {
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
function toPlanningRel(abs, canonicalCwd) {
    if (abs === canonicalCwd)
        return '';
    if (!abs.startsWith(canonicalCwd + node_path_1.sep))
        return null;
    return abs.slice(canonicalCwd.length + 1).split(node_path_1.sep).join('/');
}
