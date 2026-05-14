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
 *   - kind='skip'         →  (emit verbatim, no edit — B-07 safety net)
 *
 * Zone-targeting (B-07): the regex is applied ONLY in zones where GSD writes
 * structured commit-hash data. Free-form prose and fenced code blocks are
 * left untouched, even when their content matches the hex pattern.
 *
 * Eligible zones:
 *   - Inline backtick spans whose content matches the SHA/CID pattern AS A
 *     WHOLE (`` `66dbc36a` `` — canonical GSD convention seen in STATE.md,
 *     SUMMARY bodies, CONTEXT.md, etc.)
 *   - YAML frontmatter values on commit-bearing keys (allowlist: see
 *     `COMMIT_KEY_ALLOWLIST` below)
 *
 * Ignored zones:
 *   - Prose paragraphs (even with whitespace-delimited hex-looking words —
 *     e.g. `cceeded` from `succeeded` is non-eligible by construction)
 *   - Fenced code blocks ``` ... ``` and ~~~ ... ~~~ (often illustrative
 *     example output or pasted shell logs; mixed legitimate vs decorative
 *     content makes blanket rewriting unsafe)
 *
 * Idempotency invariant (CONTEXT D-04.2):
 *   When `content` contains no source-shape tokens IN ELIGIBLE ZONES, the
 *   output is byte-identical to input.
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
 * Module-scoped and STATEFUL (the `g` flag means the regex carries
 * `lastIndex` across calls). Callers MUST reset `re.lastIndex = 0` before use.
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
 * YAML frontmatter keys whose values, when shaped like a commit ID, are
 * eligible for rewriting. Conservative starting set — extend as new
 * structured-store keys appear.
 *
 * Matching rule: the key name is whitespace-stripped from the line
 * `<key>: <value>` (no quoting normalization beyond trim).
 */
export const COMMIT_KEY_ALLOWLIST: ReadonlySet<string> = new Set([
  'resolution_commit',
  'commit',
  'commit_hash',
  'commit_id',
  'source_commit',
  'migration_commit',
  'first_commit',
  'last_commit',
  'sha',
  'hash',
  'rev',
  'revision',
]);

/**
 * Result shape from a single `migrateContent` call.
 *
 *   - content: rewritten file body. Equal to input when no eligible matches.
 *   - orphans: list of every eligible match whose ResolveResult was
 *              'ancestor' or 'unresolvable'. 'resolved' and 'skip' matches
 *              are NOT recorded.
 */
export interface MigrateContentResult {
  content: string;
  orphans: Orphan[];
}

/**
 * A character-range zone within the content where the rewriter is allowed
 * to operate. Computed by `findEligibleZones` from a structural pass over
 * the markdown text. Inclusive start, exclusive end.
 */
interface EligibleZone {
  start: number;
  end: number;
  /** Source label for debugging / future tooling. */
  source: 'backtick' | 'frontmatter';
}

/**
 * Pure transformer. Identifies eligible zones (inline backticks +
 * frontmatter allowlisted keys), runs the regex within those zones, and
 * resolves every match via the caller-supplied `resolve` function.
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

  const zones = findEligibleZones(content);
  if (zones.length === 0) {
    return { content, orphans: [] };
  }

  // Reset stateful regex's lastIndex (defensive — prevents skipped matches
  // when this module's regex was used in a prior call).
  re.lastIndex = 0;

  const orphans: Orphan[] = [];
  let out = '';
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const id = m[1];
    const matchStart = m.index;
    const matchEnd = re.lastIndex;

    // Zone gate: only invoke the resolver when the FULL match is contained
    // in at least one eligible zone. Prose / fenced-block matches are
    // emitted verbatim with NO resolver call (and therefore no orphan
    // record, no breadcrumb, no source-side existence lookup).
    if (!isMatchInEligibleZone(matchStart, matchEnd, zones)) {
      continue;
    }

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
      case 'skip': {
        // B-07 safety net: source-side existence check failed. Emit the
        // match verbatim with NO edit and NO orphan record.
        out += id;
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

/**
 * Compute the set of character ranges in `content` where rewriting is
 * permitted. Two source types:
 *
 *   1. Inline backtick spans whose content is wholly an eligible ID. Spans
 *      with mixed content (e.g. `` `66dbc36a (fixed)` ``) are NOT included
 *      — the inner regex match might be valid, but mixed-content backticks
 *      are too ambiguous to safely rewrite without splitting.
 *
 *   2. YAML frontmatter values on commit-keyed lines. Only at the top of
 *      the file (the leading `---`...`---` block).
 *
 * Code fences (``` and ~~~) are explicitly EXCLUDED — even when they
 * contain real commit hashes, they often hold illustrative output or
 * pasted shell logs that should not be touched.
 *
 * Bare prose is implicitly excluded (it generates no eligible zone).
 *
 * Exported for tests and tooling that want to introspect the zone set.
 */
export function findEligibleZones(content: string): EligibleZone[] {
  const zones: EligibleZone[] = [];
  const lines = content.split('\n');

  // ─── Pass 1: frontmatter detection ────────────────────────────────────
  // YAML frontmatter is the leading `---` block (only — not embedded
  // mid-document). Skip if the file doesn't start with `---`.
  let frontmatterEndLine = -1;
  if (lines[0] === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---' || lines[i] === '...') {
        frontmatterEndLine = i;
        break;
      }
    }
  }

  // ─── Pass 2: fenced code block ranges (to EXCLUDE later) ──────────────
  // Track open/close of triple-backtick and triple-tilde fences. A fence
  // closes only on a matching delimiter. Indented fences (up to 3 spaces)
  // are accepted to match common authoring styles.
  const fencedLineRanges: Array<[number, number]> = [];
  let fenceOpenLine: number | null = null;
  let fenceMarker: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].replace(/^ {0,3}/, '');
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
    if (fenceMatch !== null) {
      const marker = fenceMatch[1];
      if (fenceOpenLine === null) {
        fenceOpenLine = i;
        fenceMarker = marker[0]; // record the character (` or ~)
      } else if (fenceMarker !== null && marker.startsWith(fenceMarker)) {
        fencedLineRanges.push([fenceOpenLine, i]);
        fenceOpenLine = null;
        fenceMarker = null;
      }
    }
  }
  // Unclosed fence at EOF → treat rest of file as fenced (conservative).
  if (fenceOpenLine !== null) {
    fencedLineRanges.push([fenceOpenLine, lines.length - 1]);
  }
  const isFencedLine = (i: number): boolean =>
    fencedLineRanges.some(([s, e]) => i >= s && i <= e);

  // ─── Pass 3: emit eligible zones ──────────────────────────────────────
  // Walk line by line; for each character position track the absolute
  // offset within `content`.
  let lineStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isInFrontmatter = frontmatterEndLine !== -1 && i > 0 && i < frontmatterEndLine;
    const isFrontmatterDelim = i === 0 && lines[0] === '---' || i === frontmatterEndLine;

    if (isInFrontmatter && !isFrontmatterDelim) {
      // YAML key:value line. Accept the value range when key is allowlisted.
      const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
      if (kv !== null) {
        const key = kv[1];
        const valueOffsetWithinLine = kv[0].length - kv[2].length;
        const value = kv[2];
        if (COMMIT_KEY_ALLOWLIST.has(key) && value.length > 0) {
          // Allow the value span. If the value is wrapped in quotes,
          // include them — the regex will still match cleanly inside.
          const zStart = lineStart + valueOffsetWithinLine;
          const zEnd = zStart + value.length;
          zones.push({ start: zStart, end: zEnd, source: 'frontmatter' });
        }
      }
    } else if (!isFencedLine(i)) {
      // Body line outside fences. Find inline backtick spans whose
      // content is wholly an eligible ID candidate.
      //
      // Strategy: scan for single-backtick pairs (not triple — those are
      // fence delimiters, handled above). The pair's inner text is
      // checked against the broader regex predicate ("could this be a
      // SHA or CID?"); if so, the inner span is added as an eligible
      // zone. Mixed-content backticks are NOT added.
      //
      // The cheap inner-shape predicate: contents match
      // /^[0-9a-fA-F]{7,40}$/ OR /^[k-z]{8,12}$/. We don't pick which
      // depending on direction here — the outer regex (GIT_SHA_RE /
      // JJ_CID_RE) does that disambiguation. We just need to admit any
      // shape that COULD be a SHA or CID.
      let pos = 0;
      while (pos < line.length) {
        const tickIdx = line.indexOf('`', pos);
        if (tickIdx === -1) break;
        // Disallow triple-backtick start (mid-line fence — rare but real).
        if (line.startsWith('```', tickIdx)) {
          pos = tickIdx + 3;
          continue;
        }
        const closeIdx = line.indexOf('`', tickIdx + 1);
        if (closeIdx === -1) break;
        const inner = line.slice(tickIdx + 1, closeIdx);
        if (
          /^[0-9a-fA-F]{7,40}$/.test(inner) ||
          /^[k-z]{8,12}$/.test(inner)
        ) {
          const zStart = lineStart + tickIdx + 1;
          const zEnd = lineStart + closeIdx;
          zones.push({ start: zStart, end: zEnd, source: 'backtick' });
        }
        pos = closeIdx + 1;
      }
    }
    lineStart += line.length + 1; // +1 for the '\n' split removed
  }

  return zones;
}

/**
 * True when [matchStart, matchEnd) is entirely contained within any zone.
 */
function isMatchInEligibleZone(
  matchStart: number,
  matchEnd: number,
  zones: readonly EligibleZone[],
): boolean {
  for (const z of zones) {
    if (matchStart >= z.start && matchEnd <= z.end) return true;
  }
  return false;
}
