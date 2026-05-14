"use strict";
/**
 * sdk/src/vcs/jj/pre-push.ts — Phase 4 plan 06 (HOOK-04 / CI-04)
 *
 * Inline replication of acarapetis/jj-pre-push trigger logic (~30 LOC core).
 * CI-02 forbids Python runtime dependency, so the upstream tool is
 * reference-only (RESEARCH §"Pitfall 7" + §"Don't Hand-Roll").
 *
 * Trigger semantics (A4 assumption — RESEARCH):
 *   1. Enumerate bookmarks that would push (bookmarks with a tracked remote
 *      whose local target != remote tracking target, OR locals without any
 *      matching remote record = brand-new bookmarks).
 *   2. If 0 bookmarks to push: skip the hook fire (nothing being pushed).
 *   3. Else: fireHook(cwd, 'pre-push', { stagedFiles: [] }).
 *   4. Return the hook's ExecResult — caller bails on non-zero before
 *      invoking jj git push.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.firePrePushHook = firePrePushHook;
const exec_js_1 = require("../exec.js");
const hook_bridge_js_1 = require("../hook-bridge.js");
function jjArgvFlags(repo) {
    return ['--repository', repo, '--no-pager', '--color', 'never', '--quiet'];
}
/**
 * Fire pre-push hook iff there are bookmarks that would push.
 *
 * Returns ExecResult — exitCode 0 means "ok to proceed with jj git push"
 * (either no bookmarks to push so no fire happened, OR the fire passed).
 * Non-zero exitCode means the hook rejected the push.
 */
function firePrePushHook(cwd, opts = {}) {
    // Enumerate bookmarks via the same NDJSON template the backend uses
    // (jj.ts bookmarks.list pattern, sans the gsd/ prefix-strip).
    const args = [
        ...jjArgvFlags(cwd),
        'bookmark', 'list',
        '-a',
        '-T', 'json(self) ++ "\\n"',
    ];
    const listRes = (0, exec_js_1.vcsExec)(cwd, 'jj', args);
    if (listRes.exitCode !== 0) {
        // Bookmark enumeration failure shouldn't block the push entirely — surface
        // via stderr; caller (push()) sees a non-zero exit and bails.
        return {
            exitCode: listRes.exitCode,
            stdout: '',
            stderr: `firePrePushHook: bookmark list failed: ${listRes.stderr || listRes.stdout}`,
            timedOut: false,
            error: null,
        };
    }
    // Parse NDJSON line-by-line. VERIFIED SHAPE (jj 0.41, empirically probed
    // 2026-05-13 against `jj bookmark list -a -T 'json(self) ++ "\n"'`):
    //   Local line : {"name":"<n>","target":["<commit_id>"]}
    //   Remote line: {"name":"<n>","remote":"<r>","target":["<id>"],"tracking_target":["<id>"]}
    //
    // Pinned by the probe: `target` is an ARRAY of commit_id strings (handles
    // divergent/conflicted bookmarks; length 1 in the steady case). Remote
    // bookmarks are SEPARATE NDJSON records with a `remote` field, one per
    // local-remote pair. (An older draft sketched a nested
    // `remote_`+`targets` map inside the local record — refuted by the probe;
    // the parser intentionally does NOT reference such a field.) To enumerate
    // would-push bookmarks: join across lines by `name` and compare
    // `local.target` vs `remote.target` per (name, remote) pair. Two-pass
    // parse: collect local-only and remote-only records, then join.
    const lines = listRes.stdout.split('\n').filter((l) => l.trim());
    const locals = new Map(); // name -> local
    const remotes = [];
    for (const line of lines) {
        let rec;
        try {
            rec = JSON.parse(line);
        }
        catch {
            continue; // tolerate malformed lines silently
        }
        const name = rec.name;
        const target = rec.target;
        if (!name || !Array.isArray(target))
            continue;
        if (typeof rec.remote === 'string') {
            remotes.push({
                name,
                remote: rec.remote,
                target,
                tracking_target: rec.tracking_target,
            });
        }
        else {
            locals.set(name, { name, target });
        }
    }
    let wouldPushCount = 0;
    const counted = new Set(); // name — count each bookmark at most once
    for (const remoteRec of remotes) {
        if (opts.remote && remoteRec.remote !== opts.remote)
            continue;
        const local = locals.get(remoteRec.name);
        if (!local) {
            // local missing (e.g. deleted locally) — would push deletion. Count it.
            if (!counted.has(remoteRec.name)) {
                wouldPushCount++;
                counted.add(remoteRec.name);
            }
            continue;
        }
        // Compare target arrays element-wise (sorted) to handle the unconflicted
        // length-1 case AND the conflicted case where lengths/contents differ.
        const localSorted = [...local.target].sort().join(',');
        const remoteSorted = [...remoteRec.target].sort().join(',');
        if (localSorted !== remoteSorted) {
            if (!counted.has(local.name)) {
                wouldPushCount++;
                counted.add(local.name);
            }
        }
    }
    // Locals without ANY matching remote line in the same (name, opts.remote)
    // tuple = brand-new bookmarks the user has not yet tracked; they would push
    // as new refs.
    for (const [name] of locals) {
        if (counted.has(name))
            continue;
        const hasRemote = remotes.some((r) => r.name === name && (!opts.remote || r.remote === opts.remote));
        if (!hasRemote) {
            wouldPushCount++;
            counted.add(name);
        }
    }
    if (wouldPushCount === 0) {
        // No bookmarks to push — skip hook fire (matches acarapetis/jj-pre-push
        // behaviour of "only fire when there's actually something to push").
        return { exitCode: 0, stdout: '', stderr: '', timedOut: false, error: null };
    }
    return (0, hook_bridge_js_1.fireHook)(cwd, 'pre-push', { stagedFiles: [] });
}
//# sourceMappingURL=pre-push.js.map