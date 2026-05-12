/**
 * SDK-local NDJSON parser for `jj log -T 'json(self) ++ "\n"' --no-graph`.
 *
 * Phase 3 JJ-04: every jj backend log read goes through this parser.
 * NDJSON-field shapes verified locally against jj 0.41.0 (see 03-RESEARCH.md
 * §"jj log -T 'json(self) ++ \"\\n\"' --no-graph -r <revset>").
 *
 * PITFALL 2 (03-RESEARCH.md): vcsExec trims trailing whitespace
 * (exec.ts:105). The NDJSON template emits a trailing `\n` on the final
 * record; the trim removes it. Use `.split('\n').filter(Boolean)`
 * (mirrors git.ts:196-198).
 *
 * PITFALL 1 (03-RESEARCH.md): `LogEntry.hash` = `commit_id` (NOT
 * `change_id`). The translator helpers in `parse/jj-id.ts` handle the
 * reverse direction when callers need change_id externally.
 *
 * Plan 03-01: this is the stub. Plan 03-02 lands the body + snapshot tests.
 */

import type { LogEntry } from '../types.js';

export function parseJjLog(raw: string): LogEntry[] {
  if (!raw) return [];
  // Stub: parse JSON line-by-line and map jj fields to LogEntry contract.
  // Plan 03-02 expands this into the full hash/parents/author/date/subject
  // mapping with body-extraction and proper error handling.
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line): LogEntry => {
      const r = JSON.parse(line);
      const desc: string = r.description ?? '';
      const nlIdx = desc.indexOf('\n');
      const subject = nlIdx === -1 ? desc : desc.slice(0, nlIdx);
      const body = nlIdx === -1 ? '' : desc.slice(nlIdx + 1);
      const entry: LogEntry = {
        hash: r.commit_id ?? '',
        parents: Array.isArray(r.parents) ? r.parents : [],
        author: r.author?.name ?? '',
        date: r.author?.timestamp ?? '',
        subject: subject.replace(/\n$/, ''),
      };
      if (body.length > 0) entry.body = body;
      return entry;
    });
}
