"use strict";
/**
 * VCS verb command router — Phase 19 plan 19-06 (PORT-02 CLI bridge).
 *
 * Re-expresses the fork's vcs-facing gsd-sdk query handlers (harvested at
 * revision c7bd6bee, reference copies under
 * .planning/phases/19-…/harvest/query-handlers/) as gsd-tools verbs over the
 * ported adapter at ./vcs/index.cjs. Envelope shapes are byte-for-behavior
 * with the fork handlers — workflows parse these JSON envelopes with jq, so
 * top-level field names, the null-for-absent-optional convention (Phase 11
 * precedent: emit null, never undefined, where the fork handlers did), and
 * exit-code semantics (handler envelopes exit 0, including ok:false typed
 * errors) are all load-bearing (T-19-16).
 *
 * Verb surface (the fork's registered vcs verb set per the harvested
 * command-manifest.non-family.ts, minus `commit` — locked decision: upstream's
 * existing commit command keeps its name and gets its internals migrated to
 * the adapter in 19-07 — and minus `worktree.cleanup-wave`, whose fork handler
 * was a spawnSync back-bridge INTO gsd-tools' own `worktree cleanup-wave`
 * case, i.e. the upstream case IS the implementation):
 *
 *   status, log, diff, head-ref, read-blob, current-branch, branch-list,
 *   push, merge, reset, restore, revert, commit-to-subrepo, hooks.fire, migrate-vcs,
 *   workspace.assert-dispatched-cwd, workspace.parallel.dispatch,
 *   workspace.parallel.fan-in, workspace.parallel.cancel,
 *   cleanup-subagent-workspaces
 *
 * `commit-to-subrepo` has a handler here for envelope parity (the fork's
 * adapter-routed body), but gsd-tools' pre-existing upstream case keeps
 * dispatch ownership until the 19-07 internals migration — same treatment as
 * `commit`.
 *
 * Registration mirrors the routeStateCommand precedent: gsd-tools.cjs
 * requires this module and dispatches the verb families here. The `query`
 * meta-prefix and the dotted→spaced normalization in gsd-tools (#3243) mean
 * `gsd-tools query workspace.parallel.dispatch` arrives as
 * command='workspace', args=['workspace','parallel.dispatch',…].
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const index_cjs_1 = require("./vcs/index.cjs");
const expr_cjs_1 = require("./vcs/expr.cjs");
const exec_cjs_1 = require("./vcs/exec.cjs");
const refs_validator_cjs_1 = require("./vcs/refs-validator.cjs");
const hook_bridge_cjs_1 = require("./vcs/hook-bridge.cjs");
const index_cjs_2 = require("./vcs/format-migration/index.cjs");
const planning_shim_cjs_1 = require("./vcs/format-migration/planning-shim.cjs");
const workspace_cleanup_cjs_1 = require("./vcs/jj/workspace-cleanup.cjs");
// Phase 19 (19-11): interop default import instead of `import = require` so
// the module stays vite-transformable for the revived vitest suite (esbuild
// leaves TS import-equals as a bare `require()` under ESM output). tsc emit
// is equivalent under esModuleInterop.
const planning_workspace_cjs_1 = __importDefault(require("./planning-workspace.cjs"));
const { planningPaths } = planning_workspace_cjs_1.default;
// ─── Shared helpers (fork-handler ports) ─────────────────────────────────────
/**
 * Plan 05-06 Task 2 (CR-02 fix, ported from harvest/query-handlers/log.ts):
 * classify a CLI `--range` argv into an encoded RevisionExpr. D-12 forbids
 * `expr.raw()`, so every raw string must flow through a structured factory.
 */
function parseRangeArg(raw) {
    const rangeIdx = raw.indexOf('..');
    if (rangeIdx >= 0) {
        const fromRaw = raw.slice(0, rangeIdx);
        const toRaw = raw.slice(rangeIdx + 2);
        if (!fromRaw || !toRaw) {
            throw new Error(`parseRangeArg: malformed range '${raw}' (one side empty)`);
        }
        return expr_cjs_1.expr.range(parseSingle(fromRaw), parseSingle(toRaw));
    }
    return parseSingle(raw);
}
function parseSingle(raw) {
    if (raw === 'HEAD' || raw === '@')
        return expr_cjs_1.expr.head();
    const tildeMatch = raw.match(/^(?:HEAD|@)~(\d+)$/);
    if (tildeMatch) {
        const n = parseInt(tildeMatch[1], 10);
        if (n === 0)
            return expr_cjs_1.expr.head();
        // 19-review WR-05: resolve HEAD~N through the backend via the
        // expr.ancestor(n) factory (git: 'HEAD~N'; jj: '@' + n×'-'). The prior
        // vcs.log({maxCount:n+1})[n].id lookup approximated ancestry with
        // reverse-chronological log order, which silently picks the WRONG
        // revision on any history containing merge commits.
        return expr_cjs_1.expr.ancestor(n);
    }
    if (/^[0-9a-fA-F]{4,40}$/.test(raw) || /^[k-z]{4,40}$/.test(raw)) {
        return expr_cjs_1.expr.rev(raw);
    }
    return expr_cjs_1.expr.bookmark(raw);
}
/** Resolve "@-" (stdin) / "@<path>" (file) plan input (dispatch bridge). */
function resolvePlanInput(raw) {
    if (raw === '@-') {
        return (0, node_fs_1.readFileSync)(0, 'utf-8');
    }
    if (raw.startsWith('@')) {
        return (0, node_fs_1.readFileSync)(raw.slice(1), 'utf-8');
    }
    return raw;
}
/** Fan-in/cancel input contract: file-or-stdin ONLY (RESEARCH Open Q2 RESOLVED). */
function resolveFileOrStdin(raw) {
    if (raw === '@-') {
        return (0, node_fs_1.readFileSync)(0, 'utf-8');
    }
    if (raw.startsWith('@')) {
        return (0, node_fs_1.readFileSync)(raw.slice(1), 'utf-8');
    }
    throw new Error(`expected @<path> or @- but got inline string (inline JSON form is not accepted)`);
}
function safeRealpath(p) {
    try {
        return (0, node_fs_1.realpathSync)(p);
    }
    catch {
        return null;
    }
}
/**
 * Resolve a jj workspace NAME to an absolute fs path via
 * `jj workspace root --name <NAME>` (Phase 11 plan 07 CR-01 closure shape).
 */
function resolveJjWorkspacePath(repoCwd, name) {
    if (!name)
        return null;
    const res = (0, exec_cjs_1.vcsExec)(repoCwd, 'jj', [
        '--repository',
        repoCwd,
        '--no-pager',
        '--color',
        'never',
        '--quiet',
        'workspace',
        'root',
        '--name',
        name,
    ]);
    if (res.exitCode !== 0)
        return null;
    const out = res.stdout.trim();
    return out.length > 0 ? out : null;
}
/**
 * Port of the fork's helpers.ts resolvePathUnderProject (path-escape guard for
 * commit-to-subrepo). Throws a plain Error tagged via `name` so the caller can
 * envelope it (the retired SDK's GSDError taxonomy does not exist here).
 */
async function resolvePathUnderProject(projectDir, userPath) {
    const projectReal = await (0, promises_1.realpath)(projectDir);
    const candidate = (0, node_path_1.isAbsolute)(userPath) ? (0, node_path_1.normalize)(userPath) : (0, node_path_1.resolve)(projectReal, userPath);
    let realCandidate;
    try {
        realCandidate = await (0, promises_1.realpath)(candidate);
    }
    catch {
        realCandidate = candidate;
    }
    const rel = (0, node_path_1.relative)(projectReal, realCandidate);
    if (rel.startsWith('..') || ((0, node_path_1.isAbsolute)(rel) && rel.length > 0)) {
        const err = new Error('path escapes project directory');
        err.name = 'VcsPathValidationError';
        throw err;
    }
    return realCandidate;
}
// ─── Verb handlers (envelope contracts: harvest/query-handlers/*) ───────────
const statusVerb = (args, projectDir) => {
    let cwd = projectDir;
    let porcelain = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--cwd' && args[i + 1]) {
            cwd = args[i + 1];
            i++;
        }
        else if (args[i] === '--porcelain' || args[i] === '--short') {
            // `--short` accepted as an alias; StatusOpts contract exposes only `porcelain`.
            porcelain = true;
        }
    }
    const vcs = (0, index_cjs_1.createVcsAdapter)(cwd);
    const result = vcs.status({ porcelain });
    return {
        data: {
            ok: true,
            entries: result.entries,
            raw: result.raw,
            porcelain,
        },
    };
};
const logVerb = (args, projectDir) => {
    let cwd = projectDir;
    let maxCount;
    let allRefs = false;
    let range;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--cwd' && args[i + 1]) {
            cwd = args[i + 1];
            i++;
        }
        else if (args[i] === '--max-count' && args[i + 1]) {
            const n = parseInt(args[i + 1], 10);
            if (Number.isFinite(n) && n > 0)
                maxCount = n;
            i++;
        }
        else if (args[i] === '--all') {
            allRefs = true;
        }
        else if (args[i] === '--range' && args[i + 1]) {
            range = args[i + 1];
            i++;
        }
        // --grep / --format / --no-merges parsed-but-unused: LogOpts contract
        // (Phase 2 CR-02 narrowing) doesn't expose them.
    }
    const vcs = (0, index_cjs_1.createVcsAdapter)(cwd);
    let rev;
    if (range !== undefined) {
        try {
            rev = parseRangeArg(range);
        }
        catch (err) {
            return {
                data: {
                    ok: false,
                    error: err.message,
                    range,
                },
            };
        }
    }
    let entries;
    try {
        entries = vcs.log({
            maxCount,
            allRefs,
            rev,
        });
    }
    catch (err) {
        return {
            data: {
                ok: false,
                error: err.message,
                range,
            },
        };
    }
    return {
        data: {
            ok: true,
            entries,
            maxCount,
            allRefs,
            range,
        },
    };
};
const diffVerb = (args, projectDir) => {
    let cwd = projectDir;
    let range;
    let nameOnly = false;
    let nameStatus = false;
    let staged = false;
    const paths = [];
    let inPaths = false;
    for (let i = 0; i < args.length; i++) {
        if (inPaths) {
            paths.push(args[i]);
            continue;
        }
        if (args[i] === '--') {
            inPaths = true;
        }
        else if (args[i] === '--cwd' && args[i + 1]) {
            cwd = args[i + 1];
            i++;
        }
        else if (args[i] === '--range' && args[i + 1]) {
            range = args[i + 1];
            i++;
        }
        else if (args[i] === '--name-only') {
            nameOnly = true;
        }
        else if (args[i] === '--name-status') {
            nameStatus = true;
        }
        else if (args[i] === '--cached') {
            staged = true;
        }
        else if (args[i] === '--quiet') {
            // Parsed but unused; DiffOpts contract has no quiet field.
        }
    }
    const vcs = (0, index_cjs_1.createVcsAdapter)(cwd);
    let rev;
    if (range !== undefined) {
        try {
            rev = parseRangeArg(range);
        }
        catch (err) {
            return {
                data: {
                    ok: false,
                    error: err.message,
                    range,
                },
            };
        }
    }
    let result;
    try {
        result = vcs.diff({
            staged,
            nameOnly,
            nameStatus,
            rev,
            paths: paths.length > 0 ? paths : undefined,
        });
    }
    catch (err) {
        return {
            data: {
                ok: false,
                error: err.message,
                range,
            },
        };
    }
    return {
        data: {
            ok: true,
            raw: result.raw,
            nameOnly: result.nameOnly,
            nameStatus: result.nameStatus,
            range,
            staged,
        },
    };
};
const headRefVerb = (args, projectDir) => {
    let cwd = projectDir;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--cwd' && args[i + 1]) {
            cwd = args[i + 1];
            i++;
        }
    }
    const vcs = (0, index_cjs_1.createVcsAdapter)(cwd);
    const head = vcs.refs.resolveShort(vcs.refs.head);
    return {
        data: {
            ok: true,
            head,
        },
    };
};
// 19-12 next-merge port: read a file's content at a revision through the
// adapter (git: `git show <rev>:<path>`; jj: `jj file show -r <rev> <path>`).
// Consumed by quick.md's executor-side PLAN.md materialization (#1265) so the
// workflow never shells raw `git show`. Envelope: {ok, content} — pick
// `content` with --pick to write the exact blob to a file.
const readBlobVerb = (args, projectDir) => {
    let cwd = projectDir;
    let rev;
    let filePath;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--cwd' && args[i + 1]) {
            cwd = args[i + 1];
            i++;
        }
        else if (args[i] === '--rev' && args[i + 1]) {
            rev = args[i + 1];
            i++;
        }
        else if (args[i] === '--path' && args[i + 1]) {
            filePath = args[i + 1];
            i++;
        }
    }
    if (!rev) {
        return { data: { ok: false, error: 'read-blob: --rev <revision> required' } };
    }
    if (!filePath) {
        return { data: { ok: false, error: 'read-blob: --path <repo-relative-path> required' } };
    }
    const vcs = (0, index_cjs_1.createVcsAdapter)(cwd);
    try {
        const content = vcs.refs.readBlob(expr_cjs_1.expr.rev(rev), filePath);
        return { data: { ok: true, content } };
    }
    catch (err) {
        return { data: { ok: false, error: `read-blob failed: ${err.message}` } };
    }
};
const currentBranchVerb = (args, projectDir) => {
    let cwd = projectDir;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--cwd' && args[i + 1]) {
            cwd = args[i + 1];
            i++;
        }
    }
    const vcs = (0, index_cjs_1.createVcsAdapter)(cwd);
    const bookmarks = vcs.refs.currentBookmarks();
    return {
        data: {
            ok: true,
            bookmarks,
        },
    };
};
const branchListVerb = (args, projectDir) => {
    let cwd = projectDir;
    let prefix;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--cwd' && args[i + 1]) {
            cwd = args[i + 1];
            i++;
        }
        else if (args[i] === '--prefix' && args[i + 1]) {
            prefix = args[i + 1];
            i++;
        }
    }
    if (prefix !== undefined) {
        // Allow trailing slash (e.g., 'gsd/'): strip it for validation, since
        // `gsd/` itself ends with `/` which validateRefname rejects.
        const probe = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
        if (probe.length > 0) {
            try {
                (0, refs_validator_cjs_1.validateRefname)(probe);
            }
            catch (err) {
                return { data: { ok: false, error: err.message } };
            }
        }
    }
    const vcs = (0, index_cjs_1.createVcsAdapter)(cwd);
    const all = vcs.refs.bookmarks.list();
    const bookmarks = prefix ? all.filter((b) => b.name.startsWith(prefix)) : all;
    return {
        data: {
            ok: true,
            bookmarks,
            prefix,
        },
    };
};
const pushVerb = (args, projectDir) => {
    let cwd = projectDir;
    let remote;
    let bookmark;
    let force = false;
    let setUpstream = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--cwd' && args[i + 1]) {
            cwd = args[i + 1];
            i++;
        }
        else if (args[i] === '--remote' && args[i + 1]) {
            remote = args[i + 1];
            i++;
        }
        else if (args[i] === '--bookmark' && args[i + 1]) {
            bookmark = args[i + 1];
            i++;
        }
        else if (args[i] === '--force') {
            force = true;
        }
        else if (args[i] === '--set-upstream') {
            // 19-12 PushOpts.setUpstream passthrough (VCS-audit fix): establishes
            // upstream tracking on git; documented no-op on jj (jj git push
            // records the remote-tracking relationship natively).
            setUpstream = true;
        }
    }
    let ref;
    if (bookmark !== undefined) {
        try {
            (0, refs_validator_cjs_1.validateRefname)(bookmark);
            ref = expr_cjs_1.expr.bookmark(bookmark);
        }
        catch (err) {
            return {
                data: {
                    ok: false,
                    error: err.message,
                },
            };
        }
    }
    const vcs = (0, index_cjs_1.createVcsAdapter)(cwd);
    let result;
    try {
        result = vcs.push({
            remote,
            ref,
            force,
            setUpstream,
        });
    }
    catch (err) {
        return {
            data: {
                ok: false,
                error: err.message,
                remote,
                bookmark,
                force,
            },
        };
    }
    return {
        data: {
            ok: result.exitCode === 0,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            remote,
            bookmark,
            force,
        },
    };
};
const mergeVerb = (args, projectDir) => {
    let cwd = projectDir;
    let ref;
    let squash = false;
    let noFf = false;
    let noCommit = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--cwd' && args[i + 1]) {
            cwd = args[i + 1];
            i++;
        }
        else if (args[i] === '--squash') {
            squash = true;
        }
        else if (args[i] === '--no-ff') {
            noFf = true;
        }
        else if (args[i] === '--no-commit') {
            noCommit = true;
        }
        else if (!args[i].startsWith('--') && ref === undefined) {
            ref = args[i];
        }
    }
    if (!ref) {
        return { data: { ok: false, error: 'merge: positional <ref> argument required' } };
    }
    try {
        (0, refs_validator_cjs_1.validateRefname)(ref);
    }
    catch (err) {
        return { data: { ok: false, error: err.message } };
    }
    const vcs = (0, index_cjs_1.createVcsAdapter)(cwd);
    if (vcs.kind !== 'git') {
        return {
            data: {
                ok: false,
                error: 'merge: not yet supported on jj backend; phase merge happens via performJjReap',
            },
        };
    }
    const result = vcs.gitOnly.merge({ ref, squash, noFf, noCommit });
    return {
        data: {
            ok: result.exitCode === 0,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            ref,
            squash,
            noFf,
            noCommit,
        },
    };
};
const VALID_RESET_MODES = ['soft', 'mixed', 'hard'];
function isResetMode(s) {
    return VALID_RESET_MODES.includes(s);
}
const resetVerb = (args, projectDir) => {
    let cwd = projectDir;
    let ref;
    let mode;
    const paths = [];
    let inPaths = false;
    for (let i = 0; i < args.length; i++) {
        if (inPaths) {
            paths.push(args[i]);
            continue;
        }
        if (args[i] === '--') {
            inPaths = true;
        }
        else if (args[i] === '--cwd' && args[i + 1]) {
            cwd = args[i + 1];
            i++;
        }
        else if (args[i] === '--ref' && args[i + 1]) {
            ref = args[i + 1];
            i++;
        }
        else if (args[i] === '--mode' && args[i + 1]) {
            const m = args[i + 1];
            if (!isResetMode(m)) {
                return {
                    data: {
                        ok: false,
                        error: `reset: invalid --mode '${m}'. Valid: ${VALID_RESET_MODES.join(', ')}`,
                    },
                };
            }
            mode = m;
            i++;
        }
    }
    if (!ref) {
        return { data: { ok: false, error: 'reset: --ref <rev> is required' } };
    }
    if (!mode) {
        return { data: { ok: false, error: 'reset: --mode <soft|mixed|hard> is required' } };
    }
    const vcs = (0, index_cjs_1.createVcsAdapter)(cwd);
    if (vcs.kind !== 'git') {
        return {
            data: {
                ok: false,
                error: 'reset: not supported on jj backend; use `gsd-tools query revert` for per-commit destructive undo',
            },
        };
    }
    const result = vcs.gitOnly.reset({
        ref,
        mode,
        paths: paths.length > 0 ? paths : undefined,
    });
    return {
        data: {
            ok: result.exitCode === 0,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            ref,
            mode,
            paths: paths.length > 0 ? paths : undefined,
        },
    };
};
const restoreVerb = (args, projectDir) => {
    let cwd = projectDir;
    let from;
    const files = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--cwd' && args[i + 1]) {
            cwd = args[i + 1];
            i++;
        }
        else if (args[i] === '--from' && args[i + 1]) {
            from = args[i + 1];
            i++;
        }
        else if (!args[i].startsWith('--')) {
            files.push(args[i]);
        }
    }
    if (files.length === 0) {
        return { data: { ok: false, error: 'restore: at least one file argument required' } };
    }
    if (from !== undefined) {
        try {
            (0, refs_validator_cjs_1.validateRefname)(from);
        }
        catch (err) {
            return { data: { ok: false, error: err.message } };
        }
    }
    const vcs = (0, index_cjs_1.createVcsAdapter)(cwd);
    if (vcs.kind === 'git') {
        const result = vcs.gitOnly.restore({ files, from });
        return {
            data: {
                ok: result.exitCode === 0,
                exitCode: result.exitCode,
                stdout: result.stdout,
                stderr: result.stderr,
                files,
                from,
                backend: 'git',
            },
        };
    }
    // jj path: no adapter verb yet — dispatch via vcsExec directly
    // (fork gap-fill carry-over; see src/vcs/backends/jj.cts TODO).
    // Carries the adapter's mandatory jj flag set (--no-pager --color never
    // --quiet) so pager/ANSI noise can't leak into the JSON envelope — same
    // WR-06 discipline as the `revert` jj leg below.
    const jjFrom = from ?? '@-';
    const result = (0, exec_cjs_1.vcsExec)(cwd, 'jj', [
        '--no-pager', '--color', 'never', '--quiet',
        'restore', '--from', jjFrom, '--', ...files,
    ]);
    return {
        data: {
            ok: result.exitCode === 0,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            files,
            from: jjFrom,
            backend: 'jj',
        },
    };
};
const revertVerb = (args, projectDir) => {
    let cwd = projectDir;
    let rev;
    let noCommit = false;
    let abort = false;
    let force = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--cwd' && args[i + 1]) {
            cwd = args[i + 1];
            i++;
        }
        else if (args[i] === '--no-commit') {
            noCommit = true;
        }
        else if (args[i] === '--abort') {
            abort = true;
        }
        else if (args[i] === '--force') {
            force = true;
        }
        else if (!args[i].startsWith('--') && rev === undefined) {
            rev = args[i];
        }
    }
    const vcs = (0, index_cjs_1.createVcsAdapter)(cwd);
    if (abort) {
        if (vcs.kind === 'git') {
            const r = vcs.gitOnly.revertAbort();
            return {
                data: {
                    ok: r.exitCode === 0,
                    exitCode: r.exitCode,
                    stdout: r.stdout,
                    stderr: r.stderr,
                    abort: true,
                    backend: 'git',
                },
            };
        }
        // jj path: no in-progress revert sequence to abort; documented no-op
        // (Pitfall 6 — jj abandon is one-shot).
        return {
            data: {
                ok: true,
                abort: true,
                backend: 'jj',
                note: 'jj has no in-progress revert sequence; abort is a no-op',
            },
        };
    }
    if (!rev) {
        return { data: { ok: false, error: 'revert: positional <rev> argument required' } };
    }
    if (vcs.kind === 'git') {
        const result = vcs.gitOnly.revert({ rev, noCommit });
        return {
            data: {
                ok: result.exitCode === 0,
                exitCode: result.exitCode,
                stdout: result.stdout,
                stderr: result.stderr,
                rev,
                noCommit,
                backend: 'git',
            },
        };
    }
    // jj path: destructive abandon (Pitfall 6 semantic shift — recovery via
    // `jj op restore` while the op-log retains the pre-abandon state).
    // `--force` adds `--ignore-immutable` (B-05 shared-history override).
    //
    // 19-review WR-06: (a) validate the user-supplied rev against the id-shape
    // regex via expr.rev — the argv loop above only filters `--`-prefixed
    // tokens, so a single-dash token like '-r' would otherwise land at the
    // positional and be reinterpreted by jj as a flag; (b) carry the adapter's
    // mandatory jj flag set (--no-pager --color never --quiet) so output can't
    // include ANSI/pager noise the envelope would pass through verbatim; (c)
    // `--` end-of-options separator before the positional (verified working on
    // jj 0.41), mirroring the jjArgv discipline in backends/jj.cts.
    try {
        expr_cjs_1.expr.rev(rev);
    }
    catch (err) {
        return { data: { ok: false, error: err.message, rev, backend: 'jj' } };
    }
    const jjArgs = ['--no-pager', '--color', 'never', '--quiet', 'abandon'];
    if (force)
        jjArgs.push('--ignore-immutable');
    jjArgs.push('--', rev);
    const result = (0, exec_cjs_1.vcsExec)(cwd, 'jj', jjArgs);
    return {
        data: {
            ok: result.exitCode === 0,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            rev,
            noCommit,
            force,
            backend: 'jj',
            destructive: true,
        },
    };
};
const commitToSubrepoVerb = async (args, projectDir) => {
    const filesIdx = args.indexOf('--files');
    const endIdx = filesIdx >= 0 ? filesIdx : args.length;
    const knownFlags = new Set(['--force', '--amend', '--no-verify']);
    const messageArgs = args.slice(0, endIdx).filter((a) => !knownFlags.has(a));
    const message = messageArgs.join(' ') || undefined;
    const files = filesIdx >= 0 ? args.slice(filesIdx + 1).filter((a) => !a.startsWith('--')) : [];
    if (!message) {
        return { data: { committed: false, reason: 'commit message required' } };
    }
    const paths = planningPaths(projectDir);
    let config = {};
    try {
        const raw = await (0, promises_1.readFile)(paths.config, 'utf-8');
        config = JSON.parse(raw);
    }
    catch {
        /* no config */
    }
    const subRepos = config.sub_repos;
    if (!subRepos || subRepos.length === 0) {
        return {
            data: { committed: false, reason: 'no sub_repos configured in .planning/config.json' },
        };
    }
    if (files.length === 0) {
        return { data: { committed: false, reason: '--files required for commit-to-subrepo' } };
    }
    const sanitized = (0, planning_shim_cjs_1.sanitizeCommitMessage)(message);
    if (!sanitized && message) {
        return { data: { committed: false, reason: 'commit message empty after sanitization' } };
    }
    try {
        for (const file of files) {
            try {
                await resolvePathUnderProject(projectDir, file);
            }
            catch (err) {
                if (err instanceof Error && err.name === 'VcsPathValidationError') {
                    return { data: { committed: false, reason: `${err.message}: ${file}` } };
                }
                throw err;
            }
        }
        const fileArgs = files.length > 0 ? files : ['.'];
        // B-08: respect sticky `vcs.adapter` config — no `kind` override here.
        const subVcs = (0, index_cjs_1.createVcsAdapter)(projectDir);
        const commitResult = subVcs.commit({
            message: sanitized,
            files: fileArgs,
        });
        if (commitResult.exitCode !== 0) {
            return { data: { committed: false, reason: commitResult.stderr || 'commit failed' } };
        }
        let id;
        try {
            id = subVcs.refs.resolveShort(subVcs.refs.head);
        }
        catch {
            // Mirror the pre-migration spawnSync shape: empty string on failed
            // resolution — callers treat empty-string id as "set but unknown".
            id = '';
        }
        return { data: { committed: true, id, message: sanitized } };
    }
    catch (err) {
        return { data: { committed: false, reason: String(err) } };
    }
};
const VALID_HOOK_STAGES = ['pre-commit', 'pre-push'];
function isHookStage(s) {
    return VALID_HOOK_STAGES.includes(s);
}
const hooksFireVerb = (args, projectDir) => {
    const stage = args[0];
    if (!stage) {
        return {
            data: {
                ok: false,
                error: 'hooks.fire requires a stage argument: pre-commit or pre-push',
            },
        };
    }
    if (!isHookStage(stage)) {
        return {
            data: {
                ok: false,
                error: `hooks.fire: invalid stage '${stage}'. Valid: ${VALID_HOOK_STAGES.join(', ')}`,
            },
        };
    }
    let cwd = projectDir;
    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--cwd' && args[i + 1]) {
            cwd = args[i + 1];
            i++;
        }
    }
    const result = (0, hook_bridge_cjs_1.fireHook)(cwd, stage);
    return {
        data: {
            stage,
            cwd,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            ok: result.exitCode === 0,
        },
    };
};
const VALID_MIGRATE_TARGETS = new Set(['git', 'jj']);
const migrateVcsVerb = async (args, projectDir) => {
    let cwd = projectDir;
    let target;
    let native = false;
    let force = false;
    let workstream;
    for (let i = 0; i < args.length; i++) {
        // WR-04: distinguish "flag requires value" from "unknown flag".
        if (args[i] === '--cwd') {
            if (!args[i + 1]) {
                return { data: { ok: false, error: `migrate-vcs: --cwd requires a path argument` } };
            }
            cwd = args[i + 1];
            i++;
        }
        else if (args[i] === '--target') {
            if (!args[i + 1]) {
                return { data: { ok: false, error: `migrate-vcs: --target requires a value (git|jj)` } };
            }
            target = args[i + 1];
            i++;
        }
        else if (args[i] === '--workstream') {
            if (!args[i + 1]) {
                return { data: { ok: false, error: `migrate-vcs: --workstream requires a name argument` } };
            }
            workstream = args[i + 1];
            i++;
        }
        else if (args[i] === '--native') {
            native = true;
        }
        else if (args[i] === '--force') {
            force = true;
        }
        else if (args[i].startsWith('--')) {
            return { data: { ok: false, error: `migrate-vcs: unknown flag '${args[i]}'` } };
        }
    }
    // Determine current adapter from .planning/config.json (current-state-aware
    // target defaults, CONTEXT D-03).
    let currentAdapter = 'absent';
    try {
        const configPath = workstream
            ? (0, node_path_1.join)(cwd, '.planning', 'workstreams', workstream, 'config.json')
            : (0, node_path_1.join)(cwd, '.planning', 'config.json');
        const raw = await (0, promises_1.readFile)(configPath, 'utf-8');
        const json = JSON.parse(raw);
        currentAdapter = json?.vcs?.adapter ?? 'absent';
    }
    catch {
        /* leave 'absent' */
    }
    if (target === undefined) {
        if (currentAdapter === 'git' || currentAdapter === 'absent' || currentAdapter === 'auto') {
            target = 'jj';
        }
        else if (currentAdapter === 'jj') {
            return {
                data: {
                    ok: false,
                    error: 'migrate-vcs: already on jj — pass --target git to migrate back',
                },
            };
        }
    }
    if (!VALID_MIGRATE_TARGETS.has(target)) {
        return {
            data: { ok: false, error: `migrate-vcs: invalid --target '${target}' (valid: jj, git)` },
        };
    }
    // Pre-flight: target=jj requires jj binary available.
    // 19-07: routed through the adapter-internal exec seam (vcsExec) instead
    // of raw child_process execSync — same argv-array discipline as every
    // other VCS spawn in this module (project_no_raw_git; Task 2 sweep:
    // zero execSync/execFileSync outside shell-command-projection.cts).
    if (target === 'jj') {
        const probe = (0, exec_cjs_1.vcsExec)(cwd, 'jj', ['--version']);
        if (probe.exitCode !== 0) {
            return {
                data: {
                    ok: false,
                    error: 'migrate-vcs: --target jj requires jj binary in PATH (install jj first)',
                },
            };
        }
    }
    try {
        const result = await (0, index_cjs_2.runMigration)(cwd, target, { force, native, workstream });
        return {
            data: {
                ok: true,
                migrated: result.migrated,
                filesChanged: result.filesChanged,
                filesScanned: result.filesScanned,
                orphans: result.orphans,
                previousAdapter: result.previousAdapter,
                newAdapter: result.newAdapter,
                commitId: result.commitId,
            },
        };
    }
    catch (e) {
        return { data: { ok: false, error: `migrate-vcs: ${e.message}` } };
    }
};
const workspaceAssertDispatchedCwdVerb = (args, projectDir) => {
    let cwd = projectDir;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--cwd' && args[i + 1]) {
            cwd = args[i + 1];
            i++;
        }
    }
    const vcs = (0, index_cjs_1.createVcsAdapter)(cwd);
    const entries = vcs.workspace.list();
    const cwdReal = safeRealpath(cwd);
    // Plan 11-11 (PROMPT-08): primary workspace fs path resolved independently
    // of the cwd-match outcome so the failure branch carries it too.
    const primaryWorkspacePath = entries.length === 0
        ? null
        : vcs.kind === 'jj'
            ? resolveJjWorkspacePath(cwd, entries[0].path)
            : safeRealpath(entries[0].path);
    // Convention (load-bearing on both backends): list()[0] is the primary
    // workspace. On jj, WorkspaceInfo.path carries the workspace NAME and is
    // resolved to an fs path before the realpath compare (Plan 11-07 CR-01).
    let matchedIndex = -1;
    let matchedPath = null;
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const fsPath = vcs.kind === 'jj' ? resolveJjWorkspacePath(cwd, entry.path) : entry.path;
        if (fsPath === null)
            continue;
        const entryReal = safeRealpath(fsPath);
        if (entryReal !== null && cwdReal !== null && entryReal === cwdReal) {
            matchedIndex = i;
            matchedPath = fsPath;
            break;
        }
    }
    if (matchedIndex === -1) {
        // `null` (not `undefined`) so the JSON envelope carries the keys
        // explicitly — consumers see a stable shape regardless of resolution.
        return {
            data: {
                ok: false,
                workspaceName: null,
                workspacePath: null,
                isPrimary: false,
                primaryWorkspacePath,
            },
        };
    }
    const matched = entries[matchedIndex];
    const isPrimary = matchedIndex === 0;
    return {
        data: {
            ok: !isPrimary,
            workspaceName: matched.path,
            workspacePath: matchedPath ?? matched.path,
            isPrimary,
            primaryWorkspacePath,
        },
    };
};
const workspaceParallelDispatchVerb = (args, projectDir) => {
    let cwd = projectDir;
    let phaseNumber;
    // Phase 14.1 (PARALLEL-08, D-02): repeated-singular --main-bookmark
    // accumulator. Preserves argv order; no dedup. Empty list is legal.
    const mainBookmarks = [];
    let planRaw;
    let maxConcurrency;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--cwd' && args[i + 1]) {
            cwd = args[++i];
        }
        else if (args[i] === '--phase' && args[i + 1]) {
            phaseNumber = Number(args[++i]);
        }
        else if (args[i] === '--main-bookmark' && args[i + 1]) {
            mainBookmarks.push(args[++i]);
        }
        else if (args[i] === '--plan' && args[i + 1]) {
            planRaw = args[++i];
        }
        else if (args[i] === '--max-concurrency' && i + 1 < args.length) {
            // Phase 18 REVIEW WR-03: `i + 1 < args.length` (not truthiness, the
            // Phase 16 WR-03 form) so an empty-string value reaches the validator
            // below (`Number('')` is 0 → rejected) instead of silently skipping
            // the flag.
            maxConcurrency = Number(args[++i]);
        }
    }
    if (phaseNumber === undefined || Number.isNaN(phaseNumber)) {
        return { data: { ok: false, reason: 'phase_number_required' } };
    }
    // Phase 18 (CLEANUP-06 / Phase 14 WR-04, strengthened by Phase 18 REVIEW
    // WR-03): reject any --max-concurrency value that is not a positive
    // integer — NaN, fractional, zero, negative, and Infinity are all nonsense
    // scheduling caps. Mirrors the file's numeric-validation precedent at
    // cleanupSubagentWorkspacesVerb (`Number.isInteger` + range check). The
    // `!== undefined` leg is load-bearing — an ABSENT flag must still forward
    // `undefined` (D-07 default-undefined contract, pinned by
    // cmd-parallel-max-concurrency-cli.test.ts).
    if (maxConcurrency !== undefined &&
        (Number.isNaN(maxConcurrency) ||
            !Number.isInteger(maxConcurrency) ||
            maxConcurrency < 1)) {
        return { data: { ok: false, reason: 'max_concurrency_invalid' } };
    }
    if (planRaw === undefined) {
        return { data: { ok: false, reason: 'plan_required' } };
    }
    // Port-time collapse of the retired SDK loadConfig: the only consumed field
    // is `parallelization`, checked strict-equal-false (Phase 14 plan 02
    // RESEARCH §A "Critical caveat" — protects legacy nested-shape configs from
    // the loose-falsey trap). planningPaths carries the GSD_WORKSTREAM env
    // defaulting the SDK loader had.
    let parallelization;
    try {
        const rawConfig = (0, node_fs_1.readFileSync)(planningPaths(cwd).config, 'utf-8');
        parallelization = JSON.parse(rawConfig).parallelization;
    }
    catch {
        /* missing/malformed config — default (true) allows dispatch */
    }
    if (parallelization === false) {
        return {
            data: {
                ok: false,
                reason: 'parallelization_disabled',
                message: 'Parallelization is disabled in .planning/config.json. ' +
                    'Set `parallelization: true`, or remove the explicit `false` ' +
                    'entry to fall back to the default (true).',
            },
        };
    }
    let plan;
    try {
        const planText = resolvePlanInput(planRaw);
        plan = JSON.parse(planText);
    }
    catch (err) {
        return {
            data: {
                ok: false,
                reason: 'plan_json_parse_failed',
                error: err instanceof Error ? err.message : String(err),
            },
        };
    }
    // Phase 18 (CLEANUP-05 / Phase 14 WR-03): `JSON.parse` accepts any JSON
    // value — objects, strings, numbers, null all parse cleanly and would flow
    // unchecked into the adapter's dispatch. Fail closed BEFORE
    // `createVcsAdapter` so the envelope is backend-agnostic (ASVS V5 input
    // validation; peer to `phase_number_required` above).
    if (!Array.isArray(plan)) {
        return { data: { ok: false, reason: 'plan_not_array' } };
    }
    const vcs = (0, index_cjs_1.createVcsAdapter)(cwd);
    const handle = vcs.workspace.parallel.dispatch({
        phaseNumber,
        mainBookmarks,
        plan,
        maxConcurrency,
    });
    return { data: handle };
};
const workspaceParallelFanInVerb = (args, projectDir) => {
    let cwd = projectDir;
    let handleRaw;
    let resultsRaw;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--cwd' && args[i + 1]) {
            cwd = args[++i];
        }
        else if (args[i] === '--handle' && args[i + 1]) {
            handleRaw = args[++i];
        }
        else if (args[i] === '--results' && args[i + 1]) {
            resultsRaw = args[++i];
        }
    }
    if (handleRaw === undefined) {
        return { data: { ok: false, reason: 'handle_required' } };
    }
    // Disambiguation: both inputs cannot default to stdin.
    if (resultsRaw === undefined) {
        if (handleRaw === '@-') {
            return {
                data: {
                    ok: false,
                    reason: 'results_required_when_handle_is_stdin',
                },
            };
        }
        resultsRaw = '@-';
    }
    else if (handleRaw === '@-' && resultsRaw === '@-') {
        return {
            data: { ok: false, reason: 'handle_and_results_cannot_both_be_stdin' },
        };
    }
    let handle;
    try {
        const handleText = resolveFileOrStdin(handleRaw);
        handle = JSON.parse(handleText);
    }
    catch (err) {
        return {
            data: {
                ok: false,
                reason: 'handle_json_parse_failed',
                error: err instanceof Error ? err.message : String(err),
            },
        };
    }
    let results;
    try {
        const resultsText = resolveFileOrStdin(resultsRaw);
        results = JSON.parse(resultsText);
    }
    catch (err) {
        return {
            data: {
                ok: false,
                reason: 'results_json_parse_failed',
                error: err instanceof Error ? err.message : String(err),
            },
        };
    }
    const vcs = (0, index_cjs_1.createVcsAdapter)(cwd);
    const fanInResult = vcs.workspace.parallel.fanIn(handle, results);
    return { data: fanInResult };
};
const workspaceParallelCancelVerb = (args, projectDir) => {
    let cwd = projectDir;
    let handleRaw;
    // Phase 16 REVIEW WR-03: `i + 1 < args.length` (not truthiness) so an
    // empty-string value routes to the downstream validator.
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--cwd' && i + 1 < args.length) {
            cwd = args[++i];
        }
        else if (args[i] === '--handle' && i + 1 < args.length) {
            handleRaw = args[++i];
        }
    }
    if (handleRaw === undefined) {
        return { data: { ok: false, reason: 'handle_required' } };
    }
    let handle;
    try {
        const handleText = resolveFileOrStdin(handleRaw);
        handle = JSON.parse(handleText);
    }
    catch (err) {
        return {
            data: {
                ok: false,
                reason: 'handle_json_parse_failed',
                error: err instanceof Error ? err.message : String(err),
            },
        };
    }
    const vcs = (0, index_cjs_1.createVcsAdapter)(cwd);
    const cancelResult = vcs.workspace.parallel.cancel(handle);
    return { data: cancelResult };
};
const cleanupSubagentWorkspacesVerb = (args, projectDir) => {
    let cwd = projectDir;
    let phase;
    let allPhases = false;
    // Phase 16 REVIEW WR-03: explicit `i + 1 < args.length` guard.
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--cwd' && i + 1 < args.length) {
            cwd = args[++i];
        }
        else if (args[i] === '--phase' && i + 1 < args.length) {
            phase = Number(args[++i]);
        }
        else if (args[i] === '--all-phases') {
            allPhases = true;
        }
    }
    // (a) Mutual-exclusion — checked FIRST (no filesystem read). CONTEXT D-04.
    if (phase !== undefined && allPhases) {
        return { data: { ok: false, reason: 'phase_and_all_phases_mutually_exclusive' } };
    }
    // (b) At least one mode flag required.
    if (phase === undefined && !allPhases) {
        return { data: { ok: false, reason: 'phase_or_all_phases_required' } };
    }
    // (c) Phase-number validation (T-16.02-02 — fail loud, not silent no-op).
    if (phase !== undefined && (Number.isNaN(phase) || !Number.isInteger(phase) || phase < 0)) {
        return { data: { ok: false, reason: 'invalid_phase_number' } };
    }
    if (phase !== undefined) {
        const result = (0, workspace_cleanup_cjs_1.cleanupSubagentWorkspaces)(cwd, phase);
        return { data: result };
    }
    // --all-phases mode (D-05/D-06): enumerate, bucket BY phase via the shared
    // regex (Phase 16 REVIEW WR-05 — authoritative-list branch, no padded-regex
    // fallback divergence), iterate ascending.
    const workspacesDir = (0, node_path_1.join)(cwd, '.claude', 'jj-workspaces');
    if (!(0, node_fs_1.existsSync)(workspacesDir)) {
        return { data: { abandoned: [], failedReaped: [] } };
    }
    const entries = (0, node_fs_1.readdirSync)(workspacesDir);
    const workspacesByPhase = new Map();
    for (const e of entries) {
        const m = workspace_cleanup_cjs_1.WORKSPACE_NAME_RE.exec(e);
        if (!m)
            continue;
        const p = Number(m[1]);
        let bucket = workspacesByPhase.get(p);
        if (!bucket) {
            bucket = [];
            workspacesByPhase.set(p, bucket);
        }
        bucket.push({ name: e, path: (0, node_path_1.join)(workspacesDir, e) });
    }
    const sortedPhases = [...workspacesByPhase.keys()].sort((a, b) => a - b);
    const merged = {
        abandoned: [],
        failedReaped: [],
    };
    for (const p of sortedPhases) {
        const r = (0, workspace_cleanup_cjs_1.cleanupSubagentWorkspaces)(cwd, p, workspacesByPhase.get(p));
        merged.abandoned.push(...r.abandoned);
        merged.failedReaped.push(...r.failedReaped);
    }
    return { data: merged };
};
// ─── Verb table ──────────────────────────────────────────────────────────────
/**
 * Canonical verb → handler. Keys are the fork's registered verb names
 * (command-manifest.non-family.ts at c7bd6bee). `commit-to-subrepo` is present
 * for envelope parity but gsd-tools' upstream case owns its dispatch until
 * 19-07 (see file header).
 */
const VCS_VERB_TABLE = {
    'status': statusVerb,
    'log': logVerb,
    'diff': diffVerb,
    'head-ref': headRefVerb,
    'read-blob': readBlobVerb,
    'current-branch': currentBranchVerb,
    'branch-list': branchListVerb,
    'push': pushVerb,
    'merge': mergeVerb,
    'reset': resetVerb,
    'restore': restoreVerb,
    'revert': revertVerb,
    'commit-to-subrepo': commitToSubrepoVerb,
    'hooks.fire': hooksFireVerb,
    'migrate-vcs': migrateVcsVerb,
    'workspace.assert-dispatched-cwd': workspaceAssertDispatchedCwdVerb,
    'workspace.parallel.dispatch': workspaceParallelDispatchVerb,
    'workspace.parallel.fan-in': workspaceParallelFanInVerb,
    'workspace.parallel.cancel': workspaceParallelCancelVerb,
    'cleanup-subagent-workspaces': cleanupSubagentWorkspacesVerb,
};
/**
 * Resolve the canonical verb + the verb's own argv from gsd-tools' normalized
 * (command, args) pair. Returns null when the family/subcommand combination
 * does not name a known verb.
 */
function resolveVerb(command, args) {
    if (command === 'hooks') {
        if (args[1] === 'fire') {
            return { verb: 'hooks.fire', verbArgs: args.slice(2) };
        }
        return null;
    }
    if (command === 'workspace') {
        const sub = args[1];
        if (sub === 'assert-dispatched-cwd') {
            return { verb: 'workspace.assert-dispatched-cwd', verbArgs: args.slice(2) };
        }
        // Dotted canonical (`workspace.parallel.dispatch`) arrives as
        // args[1]='parallel.dispatch' after gsd-tools' first-dot split; the fully
        // spaced form arrives as args[1]='parallel', args[2]='dispatch'.
        if (sub === 'parallel.dispatch' || (sub === 'parallel' && args[2] === 'dispatch')) {
            return { verb: 'workspace.parallel.dispatch', verbArgs: args.slice(sub === 'parallel' ? 3 : 2) };
        }
        if (sub === 'parallel.fan-in' || (sub === 'parallel' && args[2] === 'fan-in')) {
            return { verb: 'workspace.parallel.fan-in', verbArgs: args.slice(sub === 'parallel' ? 3 : 2) };
        }
        if (sub === 'parallel.cancel' || (sub === 'parallel' && args[2] === 'cancel')) {
            return { verb: 'workspace.parallel.cancel', verbArgs: args.slice(sub === 'parallel' ? 3 : 2) };
        }
        return null;
    }
    if (Object.prototype.hasOwnProperty.call(VCS_VERB_TABLE, command)) {
        return { verb: command, verbArgs: args.slice(1) };
    }
    return null;
}
/**
 * Route a vcs verb to its handler and emit the fork-shaped JSON envelope.
 *
 * Exit-code semantics mirror the fork's gsd-sdk query dispatch: a handler
 * that RETURNS an envelope (including typed `ok:false` error envelopes)
 * exits 0; only thrown errors propagate to gsd-tools' runMain failure path.
 */
async function routeVcsCommand({ command, args, cwd, raw, error, output }) {
    const resolved = resolveVerb(command, args);
    if (resolved === null) {
        if (command === 'hooks') {
            error('Unknown hooks subcommand. Available: fire');
            return;
        }
        if (command === 'workspace') {
            error('Unknown workspace subcommand. Available: assert-dispatched-cwd, ' +
                'parallel.dispatch, parallel.fan-in, parallel.cancel');
            return;
        }
        error(`Unknown vcs verb: ${command}. Available: ${Object.keys(VCS_VERB_TABLE).join(', ')}`);
        return;
    }
    const handler = VCS_VERB_TABLE[resolved.verb];
    const result = await handler(resolved.verbArgs, cwd);
    output(result.data, raw);
}
module.exports = {
    routeVcsCommand,
    VCS_VERB_TABLE,
};
