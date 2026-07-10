"use strict";
/**
 * sdk/src/vcs/jj/conflict-paths.ts — Phase 9 (VCS-17, UPSTREAM-02)
 *
 * Extracted from `backends/jj.ts:524-557` (Phase 9 plan 02 task 1). The
 * original closure form lived inside the JjVcsAdapter factory; lifting it to
 * a pure sidecar function lets both `jj/reap.ts` (D-09/D-10/D-11 conflict
 * classifier branch) and the upcoming `jj/parallel.ts` (plan 03) consume the
 * helper without violating UPSTREAM-02 (no `from '../backends/jj'` imports
 * inside `sdk/src/vcs/jj/*`).
 *
 * Enumeration: `jj file list -r <rev> -T 'if(conflict, json(path) ++ "\n")'`
 * — the machine-readable template channel (TreeEntry `conflict` boolean +
 * JSON-encoded path; empirically verified on jj 0.42). One strict-JSON
 * string per line; extraction is JSON.parse, no scraping.
 *
 * WR-04: returns `['<UNRESOLVABLE>']` when the command fails or prints
 * nothing — callers gate on the `conflicts()` revset FIRST (see parallel.ts
 * fan-in stage 1), so the sentinel only surfaces for revs the revset already
 * flagged as conflicted.
 *
 * History (VCS-audit follow-up 2026-07-08): the `jj diff --summary` fallback
 * was deleted (dormant since 0.41; its `C`-line filter meant *copied*, not
 * conflicted), and the `jj resolve --list` scrape was replaced by this
 * template — resolve --list prints spaced paths unquoted with a column-
 * aligned description, which had to be regex-stripped.
 *
 * UPSTREAM-02 sidecar discipline: this file does NOT import from
 * `backends/jj.ts`. The mandatory-flags prefix is inlined verbatim per the
 * `octopus.ts:39-47` / `reap.ts:33-41` template.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.enumerateConflictedPaths = enumerateConflictedPaths;
const exec_cjs_1 = require("../exec.cjs");
/**
 * Inline mandatory-flags prefix — copy of `backends/jj.ts::jjArgv`'s flag
 * portion. UPSTREAM-02: avoids the backends import.
 */
function jjArgvFlags(repo) {
    return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}
/**
 * Template: for every tree entry at the rev, emit the JSON-encoded path on
 * its own line IFF the entry is conflicted. `json(path)` handles spaces and
 * every other pathological byte exactly (paths with spaces broke the old
 * resolve --list scrape).
 */
const CONFLICT_PATHS_TEMPLATE = 'if(conflict, json(path) ++ "\\n")';
/**
 * Enumerate the conflicted-path list at a revision.
 *
 * WR-04: returns `['<UNRESOLVABLE>']` when the command fails or prints
 * nothing — callers gate on the `conflicts()` revset first, so an empty
 * enumeration on a revset-flagged rev surfaces drift rather than silently
 * passing `[]` to the verify gate. A non-JSON stdout line is template-
 * contract drift and throws loudly (no-fallback discipline).
 *
 * Cost note: `jj file list` walks the whole tree at the rev and filters in
 * the template (resolve --list enumerated only conflicts). This runs only
 * on revs already flagged conflicted — a rare, human-escalation event — so
 * the tree walk is immaterial next to exactness.
 */
function enumerateConflictedPaths(cwd, rev) {
    const args = [...jjArgvFlags(cwd), 'file', 'list', '-r', rev, '-T', CONFLICT_PATHS_TEMPLATE];
    const r = (0, exec_cjs_1.vcsExec)(cwd, 'jj', args);
    if (r.exitCode !== 0)
        return ['<UNRESOLVABLE>'];
    const paths = [];
    for (const line of r.stdout.split('\n')) {
        if (!line.trim())
            continue;
        try {
            paths.push(JSON.parse(line));
        }
        catch {
            throw new Error(`enumerateConflictedPaths: non-JSON line from jj file list -T: '${line}'`);
        }
    }
    return paths.length > 0 ? paths : ['<UNRESOLVABLE>'];
}
