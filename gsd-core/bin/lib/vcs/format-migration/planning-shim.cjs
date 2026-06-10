"use strict";
/**
 * format-migration/planning-shim — port-time dependency shim (19-05).
 *
 * The fork's `format-migration/run.ts` imported four helpers from the SDK
 * query layer (`sdk/src/query/{config-mutation,state-mutation,helpers,commit}.ts`
 * at c7bd6bee). The SDK is retired upstream (ADR-0174) and those modules have
 * no `src/` counterpart, so the mechanical port would not compile without
 * this shim. It carries byte-identical copies of the three fork-only helpers:
 *
 *   - `atomicWriteConfig`                  (c7bd6bee sdk/src/query/config-mutation.ts)
 *   - `acquireStateLock`/`releaseStateLock`
 *     + private lock helpers              (c7bd6bee sdk/src/query/state-mutation.ts)
 *   - `sanitizeCommitMessage`             (c7bd6bee sdk/src/query/commit.ts)
 *
 * The fourth import (`planningPaths`) is NOT shimmed — run.cts re-points at
 * upstream's canonical `src/planning-workspace.cts`, which provides the same
 * `(cwd, workstream?) -> PlanningPaths` contract (identical 7-key shape,
 * GSD_WORKSTREAM/GSD_PROJECT env defaulting).
 *
 * Function bodies below are unmodified fork content; only this header and the
 * import lines are new. When 19-06/19-07 grow canonical homes for these
 * helpers in upstream's src/, this shim should be collapsed into them.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports._heldStateLocks = void 0;
exports.acquireStateLock = acquireStateLock;
exports.releaseStateLock = releaseStateLock;
exports.atomicWriteConfig = atomicWriteConfig;
exports.sanitizeCommitMessage = sanitizeCommitMessage;
const promises_1 = require("node:fs/promises");
const node_fs_1 = require("node:fs");
// ─── Process exit lock cleanup (D2 — match CJS state.cjs:16-23) ─────────
/**
 * Module-level set tracking held locks for process.on('exit') cleanup.
 * Exported for test access only.
 */
exports._heldStateLocks = new Set();
process.on('exit', () => {
    for (const lockPath of exports._heldStateLocks) {
        try {
            (0, node_fs_1.unlinkSync)(lockPath);
        }
        catch { /* already gone */ }
    }
});
// ─── Lockfile helpers ─────────────────────────────────────────────────────
/**
 * If the lock file contains a PID, return whether that process is gone (stolen
 * locks after SIGKILL/crash). Null if the file could not be read.
 */
async function isLockProcessDead(lockPath) {
    try {
        const raw = await (0, promises_1.readFile)(lockPath, 'utf-8');
        const pid = parseInt(raw.trim(), 10);
        if (!Number.isFinite(pid) || pid <= 0)
            return true;
        try {
            process.kill(pid, 0);
            return false;
        }
        catch {
            return true;
        }
    }
    catch {
        return null;
    }
}
/**
 * Acquire a lockfile for STATE.md operations.
 *
 * Uses O_CREAT|O_EXCL for atomic creation. Retries up to 10 times with
 * 200ms + jitter delay. Cleans stale locks when the holder PID is dead, or when
 * the lock file is older than 10 seconds (existing heuristic).
 *
 * @param statePath - Path to STATE.md
 * @returns Path to the lockfile
 */
async function acquireStateLock(statePath) {
    const lockPath = statePath + '.lock';
    const maxRetries = 10;
    const retryDelay = 200;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const fd = await (0, promises_1.open)(lockPath, node_fs_1.constants.O_CREAT | node_fs_1.constants.O_EXCL | node_fs_1.constants.O_WRONLY);
            await fd.writeFile(String(process.pid));
            await fd.close();
            exports._heldStateLocks.add(lockPath);
            return lockPath;
        }
        catch (err) {
            if (err instanceof Error && err.code === 'EEXIST') {
                try {
                    const dead = await isLockProcessDead(lockPath);
                    if (dead === true) {
                        await (0, promises_1.unlink)(lockPath);
                        continue;
                    }
                    const s = await (0, promises_1.stat)(lockPath);
                    if (Date.now() - s.mtimeMs > 10000) {
                        await (0, promises_1.unlink)(lockPath);
                        continue;
                    }
                }
                catch { /* lock released between check */ }
                if (i === maxRetries - 1) {
                    try {
                        await (0, promises_1.unlink)(lockPath);
                    }
                    catch { /* ignore */ }
                    return lockPath;
                }
                await new Promise(r => setTimeout(r, retryDelay + Math.floor(Math.random() * 50)));
            }
            else {
                // D3: Graceful degradation on non-EEXIST errors (match CJS state.cjs:889)
                return lockPath;
            }
        }
    }
    return lockPath;
}
/**
 * Release a lockfile.
 *
 * @param lockPath - Path to the lockfile to release
 */
async function releaseStateLock(lockPath) {
    exports._heldStateLocks.delete(lockPath);
    try {
        await (0, promises_1.unlink)(lockPath);
    }
    catch { /* already gone */ }
}
// ─── atomicWriteConfig ────────────────────────────────────────────────────
/**
 * Write config JSON atomically via temp file + rename to prevent
 * partial writes on process interruption.
 *
 * Exported for use by plans 06-02 / 06-03 (vcs.adapter flip + greenfield gate)
 * per Phase 6 RESEARCH §"vcs.adapter Write Semantics" Option A.
 */
async function atomicWriteConfig(configPath, config) {
    const tmpPath = configPath + '.tmp.' + process.pid;
    const content = JSON.stringify(config, null, 2) + '\n';
    try {
        await (0, promises_1.writeFile)(tmpPath, content, 'utf-8');
        await (0, promises_1.rename)(tmpPath, configPath);
    }
    catch {
        // D5: Rename-failure fallback — clean up temp, fall back to direct write
        try {
            await (0, promises_1.unlink)(tmpPath);
        }
        catch { /* already gone */ }
        await (0, promises_1.writeFile)(configPath, content, 'utf-8');
    }
}
// ─── sanitizeCommitMessage ────────────────────────────────────────────────
/**
 * Sanitize a commit message to prevent prompt injection.
 *
 * Ported from security.cjs sanitizeForPrompt.
 * Strips zero-width characters, null bytes, and neutralizes
 * known injection markers that could hijack agent context.
 *
 * @param text - Raw commit message
 * @returns Sanitized message safe for git commit
 */
function sanitizeCommitMessage(text) {
    if (!text || typeof text !== 'string')
        return '';
    let sanitized = text;
    // Strip null bytes
    sanitized = sanitized.replace(/\0/g, '');
    // Strip zero-width characters that could hide instructions
    sanitized = sanitized.replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD]/g, '');
    // Neutralize XML/HTML tags that mimic system boundaries
    sanitized = sanitized.replace(/<(\/?)?(?:system|assistant|human)>/gi, (_match, slash) => `\uFF1C${slash || ''}system-text\uFF1E`);
    // Neutralize [SYSTEM] / [INST] markers
    sanitized = sanitized.replace(/\[(SYSTEM|INST)\]/gi, '[$1-TEXT]');
    // Neutralize <<SYS>> markers
    sanitized = sanitized.replace(/<<\s*SYS\s*>>/gi, '\u00ABSYS-TEXT\u00BB');
    return sanitized;
}
