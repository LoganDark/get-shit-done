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
 * UNIFIED REVISION CONTRACT (Phase 8 D-05): `LogEntry.id` is the active
 * backend's canonical revision identifier — on the jj backend, this is
 * `change_id` (k-z reversed-base32 alphabet). The parser reads
 * `record.change_id` from the `json(self)` template emission (verified
 * green in .planning/intel/jj-041-ndjson-probe.md). The translator helpers
 * in `parse/jj-id.ts` handle the reverse direction when callers need
 * commit_id externally.
 *
 * Tampering threat (T-03.02-01): malformed NDJSON lines must NOT be
 * silently skipped — drift from jj 0.41 contract surfaces as a typed
 * error with a line preview.
 */
import type { LogEntry } from '../types.js';
export declare function parseJjLog(raw: string): LogEntry[];
//# sourceMappingURL=jj-log.d.ts.map