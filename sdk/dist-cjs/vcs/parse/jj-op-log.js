"use strict";
/**
 * SDK-local NDJSON parser for `jj op log -T 'json(self) ++ "\n"' --no-graph`.
 *
 * Phase 3: no production caller yet — op-log-based undo is JJOP-01,
 * deferred to v2. The parser exists so Phase 4/5 can wire consumers
 * (and so the `__vcsTestOnly.snapshot`/`restore` body in `backends/jj.ts`
 * can rely on `jj op log` for snapshot handles) without re-shaping the
 * parse/ directory.
 *
 * Field shapes per 03-RESEARCH.md §"jj op log -T 'json(self) ++ \"\\n\"' --no-graph".
 * Pinned by tests/fixtures/jj-ndjson/jj-op-log-2-ops.ndjson + snapshot test.
 *
 * Tampering threat (T-03.02-01): malformed NDJSON lines throw a typed
 * error with line preview instead of silently dropping records.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseJjOpLog = parseJjOpLog;
function parseJjOpLog(raw) {
    if (!raw)
        return [];
    const lines = raw.split('\n').filter(Boolean);
    const entries = [];
    for (const line of lines) {
        let record;
        try {
            record = JSON.parse(line);
        }
        catch {
            throw new Error(`parseJjOpLog: malformed NDJSON line (jj 0.41 contract drift?): ${line.slice(0, 80)}`);
        }
        entries.push({
            id: record.id ?? '',
            parents: Array.isArray(record.parents) ? record.parents : [],
            time: {
                start: record.time?.start ?? '',
                end: record.time?.end ?? '',
            },
            description: record.description ?? '',
            hostname: record.hostname ?? '',
            username: record.username ?? '',
            isSnapshot: Boolean(record.is_snapshot),
            workspaceName: record.workspace_name ?? null,
            args: record.attributes?.args ?? '',
        });
    }
    return entries;
}
//# sourceMappingURL=jj-op-log.js.map