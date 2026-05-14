/**
 * format-migration/rewrite.ts — pure (content, direction, resolveFn) → result
 * transformer. NO I/O. NO side effects.
 *
 * Pattern: RESEARCH §"Pattern 1: Regex-Pluck" — two direction-specific module-
 * scoped regexes; lookbehind/lookahead boundaries prevent partial-match within
 * longer hex strings; alphabet disjointness (jj change_ids are [k-z], git SHAs
 * are [0-9a-f]) was empirically confirmed by plan 06-01 Assumption A1 probe.
 *
 * Replacement vocabulary:
 *   - kind='resolved'     →  `<targetId>`          (direct counterpart)
 *   - kind='ancestor'     →  `<targetId>` + `` `[was sha:<orig>]` ``    (git→jj)
 *                           `<targetId>` + `` `[was cid:<orig>]` ``    (jj→git)
 *   - kind='unresolvable' →  `` `[orphan:<orig>]` ``                   (placeholder)
 *
 * Idempotency invariant (CONTEXT D-04.2):
 *   When `content` contains no source-shape tokens, regex matches yield zero
 *   replacements and the output is byte-identical to input. This is enforced
 *   structurally: the function only mutates `content` inside the match-replace
 *   loop, so no-match ⇒ no mutation.
 */

import type {
  MigrationDirection,
  Orphan,
  ResolveResult,
} from './types.js';

/**
 * Git SHA regex — 7+ hex chars, bounded by non-hex on both sides so we don't
 * match partial prefixes inside longer SHAs. Phase 6 RESEARCH §Pattern 1.
 *
 * NOTE: this regex is module-scoped and STATEFUL (the `g` flag means the
 * regex carries `lastIndex` across calls). `migrateContent` resets
 * `re.lastIndex = 0` before iterating, but callers that import this regex
 * directly MUST also reset before use.
 */
export const GIT_SHA_RE = /(?<![0-9a-fA-F])([0-9a-f]{7,40})(?![0-9a-fA-F])/g;

/**
 * jj change_id regex — 8+ chars from the [k-z] reversed-base32 alphabet (jj
 * 0.41 emits 12-char default; reverse-base32 uses 16 letters from k-z). The
 * length floor of 8 matches jj's short-form display; 12 is the canonical
 * width. Plan 06-01 Task 3 / A1 probe empirically confirmed the alphabet is
 * disjoint from [0-9a-f] — there is zero risk of jj_CID matching a hex SHA
 * (or vice versa).
 */
export const JJ_CID_RE = /(?<![k-z])([k-z]{8,12})(?![k-z])/g;

/**
 * Result shape from a single `migrateContent` call.
 *
 *   - content: rewritten file body. Equal to input when no matches.
 *   - orphans: list of every match whose ResolveResult was 'ancestor' or
 *              'unresolvable'. 'resolved' matches are NOT recorded — they
 *              are silent successes.
 */
export interface MigrateContentResult {
  content: string;
  orphans: Orphan[];
}

/**
 * Pure transformer. Resolves every match via the caller-supplied `resolve`
 * function and replaces inline per the replacement vocabulary at the top of
 * this file.
 *
 * The `resolve` callback is intentionally SYNCHRONOUS — this enables a
 * `replaceAll`-style match loop without async-iteration complexity. Callers
 * that need async resolution (e.g. `commitIdOf` / `changeIdOf` over `vcsExec`)
 * pre-populate a cache via `resolve.ts:createIdResolver` then pass the
 * cache-backed sync reader produced by `syncResolveFromCache`.
 *
 * @param content   — raw file body
 * @param direction — selects GIT_SHA_RE (git→jj) or JJ_CID_RE (jj→git)
 * @param resolve   — synchronous ID lookup; cache miss MAY throw at caller's discretion
 * @param filePath  — recorded in Orphan.filePath for the report
 */
export function migrateContent(
  content: string,
  direction: MigrationDirection,
  resolve: (id: string) => ResolveResult,
  filePath: string,
): MigrateContentResult {
  const re = direction === 'git→jj' ? GIT_SHA_RE : JJ_CID_RE;
  const breadcrumbLabel = direction === 'git→jj' ? 'sha' : 'cid';

  // Reset stateful regex's lastIndex (defensive — prevents skipped matches
  // when this module's regex was used in a prior call).
  re.lastIndex = 0;

  const orphans: Orphan[] = [];
  // Build output incrementally; preserve content between matches verbatim.
  let out = '';
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const id = m[1];
    const matchStart = m.index;
    const matchEnd = re.lastIndex;

    // Copy verbatim slice before this match.
    out += content.slice(cursor, matchStart);

    const r = resolve(id);
    switch (r.kind) {
      case 'resolved': {
        // Direct replacement — no orphan record.
        out += r.targetId as string;
        break;
      }
      case 'ancestor': {
        // Inline ancestor ID + breadcrumb pointing at the original.
        out += `${r.targetId as string}\`[was ${breadcrumbLabel}:${id}]\``;
        orphans.push({
          original: id,
          resolved: r.targetId,
          childrenInTarget: r.childrenInTarget,
          offset: matchStart,
          filePath,
          kind: 'ancestor',
        });
        break;
      }
      case 'unresolvable': {
        // Placeholder; no resolved ID to splice in.
        out += `\`[orphan:${id}]\``;
        orphans.push({
          original: id,
          offset: matchStart,
          filePath,
          kind: 'unresolvable',
        });
        break;
      }
      default: {
        // Exhaustiveness — should never reach.
        const _exhaustive: never = r.kind;
        throw new Error(`migrateContent: unknown resolve.kind '${String(_exhaustive)}'`);
      }
    }

    cursor = matchEnd;
  }

  // Tail slice after last match.
  out += content.slice(cursor);

  return { content: out, orphans };
}
