"use strict";
/**
 * vcs.hooks.fire primitive.
 * D-05: shells out to .githooks/<stage> synchronously and surfaces exit code.
 * Hook scripts themselves are NOT modified in Phase 1.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fireHook = fireHook;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const exec_cjs_1 = require("./exec.cjs");
// IN-03: TODO(D-05/HOOK-05) — when the PATH-shim wrapper lands, ctx.env and
// ctx.stagedFiles will be passed via env. For Phase 1 the hook contract is
// "fire and surface exit code only". Suppress unused-arg lint in the meantime.
// 2.1 D-07: kept module-private through Phase 3. Phase 4 plan 01 exports it; plans 05-06
// wire internal invocations from commit() / push().
function fireHook(cwd, stage, ctx) {
    void ctx;
    const hookPath = (0, node_path_1.join)(cwd, '.githooks', stage);
    if (!(0, node_fs_1.existsSync)(hookPath)) {
        return { exitCode: 0, stdout: '', stderr: '', timedOut: false, error: null };
    }
    // WR-04: on Windows, CreateProcessW does not honour `#!/usr/bin/env bash`
    // shebangs — invoking `spawnSync(hookPath, [])` against a shebang script
    // returns ENOEXEC. Git's own hook runner shells through `sh.exe` for this
    // reason. For Phase 1, route through `bash -c "<hookPath>"` on win32 unless
    // the file is a Windows-native executable (.exe/.cmd/.bat). This keeps the
    // POSIX path unchanged.
    if (process.platform === 'win32') {
        const ext = (0, node_path_1.extname)(hookPath).toLowerCase();
        const isWindowsNative = ext === '.exe' || ext === '.cmd' || ext === '.bat';
        if (!isWindowsNative) {
            // Quote the path with single quotes for bash; replace any embedded
            // single-quote with the standard bash-safe escape.
            const quoted = hookPath.replace(/'/g, `'\\''`);
            return (0, exec_cjs_1.vcsExec)(cwd, 'bash', ['-c', `'${quoted}'`], { timeout: 60_000 });
        }
    }
    return (0, exec_cjs_1.vcsExec)(cwd, hookPath, [], { timeout: 60_000 });
}
