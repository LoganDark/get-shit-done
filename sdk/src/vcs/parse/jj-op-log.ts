/**
 * SDK-local NDJSON parser for `jj op log -T 'json(self) ++ "\n"' --no-graph`.
 *
 * Phase 3: stub only — no production caller yet (op-log-based undo is
 * JJOP-01, deferred to v2). The parser exists so Phase 4/5 can wire
 * consumers without re-shaping the parse/ directory.
 *
 * Field shapes per 03-RESEARCH.md §"jj op log -T 'json(self) ++ \"\\n\"' --no-graph".
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

export function parseJjOpLog(raw: string): JjOpLogEntry[] {
  if (!raw) return [];
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line): JjOpLogEntry => {
      const r = JSON.parse(line);
      return {
        id: r.id ?? '',
        parents: Array.isArray(r.parents) ? r.parents : [],
        time: {
          start: r.time?.start ?? '',
          end: r.time?.end ?? '',
        },
        description: r.description ?? '',
        hostname: r.hostname ?? '',
        username: r.username ?? '',
        isSnapshot: Boolean(r.is_snapshot),
        workspaceName: r.workspace_name ?? null,
        args: r.attributes?.args ?? '',
      };
    });
}
