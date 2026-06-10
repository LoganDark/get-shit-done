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

export interface JjOpLogEntry {
  id: string;
  parents: string[];
  time: { start: string; end: string };
  description: string;
  hostname: string;
  username: string;
  isSnapshot: boolean;
  workspaceName: string | null;
  args: string;
}

interface RawJjOpLogRecord {
  id?: string;
  parents?: unknown;
  time?: { start?: string; end?: string };
  description?: string;
  hostname?: string;
  username?: string;
  is_snapshot?: unknown;
  workspace_name?: string | null;
  attributes?: { args?: string };
}

export function parseJjOpLog(raw: string): JjOpLogEntry[] {
  if (!raw) return [];
  const lines = raw.split('\n').filter(Boolean);
  const entries: JjOpLogEntry[] = [];
  for (const line of lines) {
    let record: RawJjOpLogRecord;
    try {
      record = JSON.parse(line) as RawJjOpLogRecord;
    } catch {
      throw new Error(
        `parseJjOpLog: malformed NDJSON line (jj 0.41 contract drift?): ${line.slice(0, 80)}`
      );
    }
    entries.push({
      id: record.id ?? '',
      parents: Array.isArray(record.parents) ? (record.parents as string[]) : [],
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
