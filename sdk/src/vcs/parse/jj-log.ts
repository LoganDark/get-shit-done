/**
 * SDK-local NDJSON parser for `jj log -T 'json(self) ++ "\n"' --no-graph`.
 *
 * Phase 3 JJ-04: every jj backend log read goes through this parser.
 * NDJSON-field shapes verified locally against jj 0.41.0 and pinned via
 * fixture snapshot tests in tests/fixtures/jj-ndjson/.
 *
 * PITFALL 2 (03-RESEARCH.md): vcsExec trims trailing whitespace
 * (exec.ts:105). The NDJSON template emits a trailing `\n` on the final
 * record; the trim removes it. Use `.split('\n').filter(Boolean)`
 * (mirrors git.ts:196-198).
 *
 * PITFALL 1 (03-RESEARCH.md): `LogEntry.hash` = `commit_id` (NEVER
 * `change_id`). Change-ID alphabet is `k-z` reversed-base32 — easy to
 * detect mis-mapping. The translator helpers in `parse/jj-id.ts` handle
 * the reverse direction when callers need change_id externally.
 *
 * Tampering threat (T-03.02-01): malformed NDJSON lines must NOT be
 * silently skipped — drift from jj 0.41 contract surfaces as a typed
 * error with a line preview.
 */

import type { LogEntry } from '../types.js';

interface RawJjLogRecord {
  commit_id?: string;
  parents?: unknown;
  change_id?: string;
  description?: string;
  author?: { name?: string; email?: string; timestamp?: string };
  committer?: { name?: string; email?: string; timestamp?: string };
}

export function parseJjLog(raw: string): LogEntry[] {
  if (!raw) return [];
  const lines = raw.split('\n').filter(Boolean);
  const entries: LogEntry[] = [];
  for (const line of lines) {
    let record: RawJjLogRecord;
    try {
      record = JSON.parse(line) as RawJjLogRecord;
    } catch {
      throw new Error(
        `parseJjLog: malformed NDJSON line (jj 0.41 contract drift?): ${line.slice(0, 80)}`
      );
    }
    const description: string = record.description ?? '';
    const nlIdx = description.indexOf('\n');
    // IN-01: `.slice(0, nlIdx)` already excludes the newline at position
    // `nlIdx`, and the `nlIdx === -1` branch returns the full description
    // (which by definition contains no `\n` at all). The previous
    // `.replace(/\n$/, '')` was unreachable in both branches; removed.
    const subject = nlIdx === -1 ? description : description.slice(0, nlIdx);
    const bodyRaw = nlIdx === -1 ? '' : description.slice(nlIdx + 1);
    const entry: LogEntry = {
      hash: record.commit_id ?? '',
      parents: Array.isArray(record.parents) ? (record.parents as string[]) : [],
      author: record.author?.name ?? '',
      date: record.author?.timestamp ?? '',
      subject,
    };
    if (bodyRaw.length > 0) entry.body = bodyRaw;
    entries.push(entry);
  }
  return entries;
}
