"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_VCS_TIMEOUT_MS = exports.VcsExecError = exports.execGitVcs = exports.vcsExec = exports.parseBackendsEnv = exports.BACKENDS_DECLARED = exports.BACKENDS_AVAILABLE = exports.expr = void 0;
exports.createVcsAdapter = createVcsAdapter;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const git_cjs_1 = require("./backends/git.cjs");
const jj_cjs_1 = require("./backends/jj.cjs");
function createVcsAdapter(cwd, opts = {}) {
    const kind = resolveKind(cwd, opts);
    if (kind === 'jj') {
        return (0, jj_cjs_1.createJjAdapter)(cwd);
    }
    // Plan 03: createGitAdapter is the real backend (sdk/src/vcs/backends/git.ts).
    return (0, git_cjs_1.createGitAdapter)(cwd);
}
function resolveKind(cwd, opts) {
    // 1. Explicit caller override wins everything (no lock-in side effect).
    if (opts.kind)
        return opts.kind;
    // 2. Env override (Phase 1 VCS-03; ephemeral test runs — no lock-in).
    const envOverride = process.env.GSD_VCS;
    if (envOverride === 'git' || envOverride === 'jj')
        return envOverride;
    // 3. Phase 3 D-17: sticky preference via .planning/config.json `vcs.adapter`.
    const sticky = readVcsAdapterFromConfig(cwd);
    if (sticky === 'git' || sticky === 'jj')
        return sticky;
    // 4. B-09 lock-in: sticky is 'auto' (legacy) or absent. Detect ONCE and
    //    write the concrete value back to config so future reads return it
    //    directly. D-17 reversal of Phase 1 D-04 (git wins ties in colocated
    //    case to prevent surprise-flipping users into jj before they've
    //    opted in via explicit `migrate-vcs --target jj`).
    const hasGit = (0, node_fs_1.existsSync)((0, node_path_1.join)(cwd, '.git'));
    const hasJj = (0, node_fs_1.existsSync)((0, node_path_1.join)(cwd, '.jj'));
    let resolved;
    if (hasGit)
        resolved = 'git'; // git wins ties — D-17
    else if (hasJj)
        resolved = 'jj';
    else
        resolved = 'git'; // greenfield default
    // Persist the decision so future reads return a concrete value. The
    // write is best-effort — if `.planning/` doesn't exist yet, or the
    // process lacks write permissions, the in-memory resolution still
    // succeeds and the caller proceeds normally. The lock-in retries on
    // the next invocation when conditions improve.
    lockInVcsAdapter(cwd, resolved);
    return resolved;
}
/**
 * Phase 3 D-17: read the sticky `vcs.adapter` config field.
 *
 * Storage location: `.planning/config.json` `vcs.adapter` (planner's
 * discretion per 03-CONTEXT.md).
 *
 * Returns `'git'` or `'jj'` when the field carries a concrete value;
 * returns `'auto'` for the legacy auto-detect sentinel (kept tolerant on
 * READ so old configs work; the resolver locks-in to a concrete value
 * on first encounter — see B-09 in the file header); returns `undefined`
 * if the file does not exist, JSON parsing fails, or `vcs.adapter` is
 * absent. The caller treats `'auto'` and `undefined` identically.
 *
 * No new dependency: thin readFileSync + JSON.parse with broad error
 * swallowing (mirrors how the existing config-read sites tolerate
 * missing/malformed config).
 */
function readVcsAdapterFromConfig(cwd) {
    try {
        const text = (0, node_fs_1.readFileSync)((0, node_path_1.join)(cwd, '.planning', 'config.json'), 'utf8');
        const json = JSON.parse(text);
        const value = json?.vcs?.adapter;
        if (value === 'git' || value === 'jj' || value === 'auto')
            return value;
        return undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * B-09: lock-in the resolved adapter to `.planning/config.json` so the
 * resolver never has to detect again. Best-effort and idempotent:
 *
 *   - If `.planning/config.json` does not exist, do nothing (the
 *     greenfield init path will write the full template later).
 *   - If the file exists and `vcs.adapter` is already concrete and
 *     matches `resolved`, do nothing.
 *   - Otherwise, read the file, merge `vcs.adapter: resolved`, and
 *     atomically rename the new contents into place (write-temp +
 *     renameSync — POSIX-atomic on the same filesystem).
 *
 * Errors are swallowed: if the write fails the caller still proceeds
 * with the in-memory resolution; the lock-in retries on the next call.
 * That keeps the resolver from blocking SDK queries on transient FS
 * issues while still converging to a locked-in state during normal use.
 */
function lockInVcsAdapter(cwd, resolved) {
    try {
        const configPath = (0, node_path_1.join)(cwd, '.planning', 'config.json');
        if (!(0, node_fs_1.existsSync)(configPath))
            return;
        const text = (0, node_fs_1.readFileSync)(configPath, 'utf8');
        const json = JSON.parse(text);
        const currentVcs = json.vcs ?? {};
        if (currentVcs.adapter === resolved)
            return;
        const next = {
            ...json,
            vcs: { ...currentVcs, adapter: resolved },
        };
        const tmpPath = `${configPath}.lockin.${process.pid}.tmp`;
        (0, node_fs_1.writeFileSync)(tmpPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
        (0, node_fs_1.renameSync)(tmpPath, configPath);
    }
    catch {
        /* best-effort; in-memory resolution is authoritative for this call */
    }
}
var expr_cjs_1 = require("./expr.cjs");
Object.defineProperty(exports, "expr", { enumerable: true, get: function () { return expr_cjs_1.expr; } });
var backends_cjs_1 = require("./backends.cjs");
Object.defineProperty(exports, "BACKENDS_AVAILABLE", { enumerable: true, get: function () { return backends_cjs_1.BACKENDS_AVAILABLE; } });
Object.defineProperty(exports, "BACKENDS_DECLARED", { enumerable: true, get: function () { return backends_cjs_1.BACKENDS_DECLARED; } });
Object.defineProperty(exports, "parseBackendsEnv", { enumerable: true, get: function () { return backends_cjs_1.parseBackendsEnv; } });
var exec_cjs_1 = require("./exec.cjs");
Object.defineProperty(exports, "vcsExec", { enumerable: true, get: function () { return exec_cjs_1.vcsExec; } });
Object.defineProperty(exports, "execGitVcs", { enumerable: true, get: function () { return exec_cjs_1.execGitVcs; } });
Object.defineProperty(exports, "VcsExecError", { enumerable: true, get: function () { return exec_cjs_1.VcsExecError; } });
Object.defineProperty(exports, "DEFAULT_VCS_TIMEOUT_MS", { enumerable: true, get: function () { return exec_cjs_1.DEFAULT_VCS_TIMEOUT_MS; } });
