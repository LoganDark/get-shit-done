/**
 * sdk/src/query/log.ts — Phase 5 plan 05-01 Task 2 (D-33 batch 1)
 *
 * SDK query bridge for `git log` / `jj log`. Read-only. Returns the
 * structured `LogEntry[]` produced by the adapter; downstream consumers
 * (PROMPT rewrites in plans 05-02..05-04) reconstruct "oneline" form
 * from `hash.slice(0,7) + ' ' + subject` per the Phase 2 CR-02 narrowing.
 *
 * Usage:
 *   gsd-sdk query log --max-count 5
 *   gsd-sdk query log --range HEAD~5..HEAD --all --cwd /path
 *
 * Phase 5 plan 05-06 Task 2 (CR-02 fix): the raw `--range` argv is no longer
 * cast-and-prayed as a RevisionExpr. It now flows through `parseRangeArg`,
 * which classifies the input into one of the structured `expr.*` factories
 * (D-12 forbids `expr.raw()`). Malformed input surfaces as a typed error
 * envelope (`{data: {ok: false, error: ...}}`) rather than throwing through
 * the dispatch boundary.
 */

import { createVcsAdapter } from '../vcs/index.js';
import { expr } from '../vcs/expr.js';
import type { QueryHandler } from './utils.js';
import type { RevisionExpr, VcsAdapter } from '../vcs/types.js';

/**
 * Plan 05-06 Task 2 (CR-02 fix): classify a CLI `--range` argv into an
 * encoded RevisionExpr. D-12 forbids `expr.raw()`, so every raw string
 * must flow through one of the structured factories.
 *
 * Accepted shapes (workflows in 05-03 outputs use exactly these):
 *   - 'HEAD' | '@'              → expr.head()
 *   - 'HEAD~N' (N >= 1)         → resolve via vcs.log() to a SHA, wrap via expr.rev()
 *   - hex SHA (4-40 chars)      → expr.rev(<sha>)
 *   - change_id [k-z]{4,40}     → expr.rev(<change_id>)
 *   - bookmark-shaped name      → expr.bookmark(<name>)
 *   - '<A>..<B>' (split on '..')→ expr.range(parseSingle(A), parseSingle(B))
 *
 * Anything else surfaces the underlying factory's typed throw — the caller
 * wraps the call site in try/catch and emits an `{ok: false, error: …}`
 * envelope (consistent with push.ts's `validateRefname` pattern).
 */
export function parseRangeArg(raw: string, vcs: VcsAdapter): RevisionExpr {
  // Range form: split on first '..' and recurse.
  const rangeIdx = raw.indexOf('..');
  if (rangeIdx >= 0) {
    const fromRaw = raw.slice(0, rangeIdx);
    const toRaw = raw.slice(rangeIdx + 2);
    if (!fromRaw || !toRaw) {
      throw new Error(`parseRangeArg: malformed range '${raw}' (one side empty)`);
    }
    return expr.range(parseSingle(fromRaw, vcs), parseSingle(toRaw, vcs));
  }
  return parseSingle(raw, vcs);
}

function parseSingle(raw: string, vcs: VcsAdapter): RevisionExpr {
  if (raw === 'HEAD' || raw === '@') return expr.head();
  // HEAD~N → resolve to SHA via the adapter's log surface, then wrap.
  const tildeMatch = raw.match(/^(?:HEAD|@)~(\d+)$/);
  if (tildeMatch) {
    const n = parseInt(tildeMatch[1], 10);
    if (n === 0) return expr.head();
    // Pull n+1 log entries; the last one is HEAD~n. Adapter throws if depth
    // exceeds repo history, which surfaces as a typed envelope error.
    const entries = vcs.log({ maxCount: n + 1 });
    if (entries.length <= n) {
      throw new Error(
        `parseRangeArg: ${raw} exceeds repo depth (${entries.length} commits available)`,
      );
    }
    return expr.rev(entries[n].hash);
  }
  // Hex SHA or change_id alphabet → expr.rev validates internally.
  if (/^[0-9a-fA-F]{4,40}$/.test(raw) || /^[k-z]{4,40}$/.test(raw)) {
    return expr.rev(raw);
  }
  // Fallback: treat as bookmark name. expr.bookmark validates the refname.
  return expr.bookmark(raw);
}

export const logQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let maxCount: number | undefined;
  let allRefs = false;
  let range: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    } else if (args[i] === '--max-count' && args[i + 1]) {
      const n = parseInt(args[i + 1], 10);
      if (Number.isFinite(n) && n > 0) maxCount = n;
      i++;
    } else if (args[i] === '--all') {
      allRefs = true;
    } else if (args[i] === '--range' && args[i + 1]) {
      range = args[i + 1];
      i++;
    }
    // --grep / --format / --no-merges parsed-but-unused: LogOpts contract
    // (Phase 2 CR-02 narrowing) doesn't expose them. Callers that need
    // `grep` fall back to client-side filtering on subject strings.
  }

  const vcs = createVcsAdapter(cwd);

  let rev: RevisionExpr | undefined;
  if (range !== undefined) {
    try {
      rev = parseRangeArg(range, vcs);
    } catch (err) {
      return {
        data: {
          ok: false,
          error: (err as Error).message,
          range,
        },
      };
    }
  }

  let entries;
  try {
    entries = vcs.log({
      maxCount,
      allRefs,
      rev,
    });
  } catch (err) {
    return {
      data: {
        ok: false,
        error: (err as Error).message,
        range,
      },
    };
  }

  return {
    data: {
      ok: true,
      entries,
      maxCount,
      allRefs,
      range,
    },
  };
};
