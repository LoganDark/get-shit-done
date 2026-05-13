/**
 * RevisionExpr factories.
 *
 * D-09: RevisionExpr is a branded string — type-safe, debuggable, serializable.
 * D-10: Construction must go through expr.* factories. No raw-string passthrough (D-12).
 * D-11: Per-backend translators (parse/git-rev.ts, parse/jj-rev.ts) re-parse the encoded
 *       form into the dialect each backend's CLI expects.
 *
 * Encoding: each factory emits a string of the form `<kind>:<arg1>[:<arg2>]`.
 *   expr.head()                   → "head:"
 *   expr.parent()                 → "parent:"
 *   expr.bookmark('main')         → "bookmark:main"
 *   expr.remote('main', 'origin') → "remote:origin:main"
 *
 * Translators MUST switch on the prefix, never on the raw string contents.
 */

import type { RevisionExpr } from './types.js';
// Phase 4 plan 07 D-24 / cr-01 fold-in: the refname validator (formerly
// inlined here as `validateBookmarkName`) is now sourced from the shared
// module so the jj + git backends can reuse the same rules at every
// bookmark/branch write site. The alias preserves the in-file binding name
// `validateBookmarkName` so the existing call sites below (`expr.bookmark`,
// `expr.remote`) need zero changes.
import {
  validateBookmarkName,
  REFNAME_FORBIDDEN_BYTE_OR_SET,
} from './refs-validator.js';

function brand(s: string): RevisionExpr {
  return s as RevisionExpr;
}

// Phase 2.1 D-13: permissive validator. Accepts hex SHA (git) OR change_id
// alphabet (jj k-z reversed-base32, per RESEARCH Assumption A3). 2.1 only
// exercises the hex branch at runtime; Phase 3 lands the jj-side translator.
// Phase 1 D-12 forbids `expr.raw()`. The structured `expr.rev(id)` factory
// (renamed from `expr.commit` in Phase 2.1) replaces the forbidden raw
// passthrough for runtime revision strings; this regex guards against
// invalid input shapes.
const SHA_OR_CHANGE_ID_RE = /^[0-9a-fA-F]{4,40}$|^[k-z]{4,40}$/;

export const expr = Object.freeze({
  head(): RevisionExpr {
    return brand('head:');
  },
  parent(): RevisionExpr {
    return brand('parent:');
  },
  bookmark(name: string): RevisionExpr {
    validateBookmarkName(name);
    return brand(`bookmark:${name}`);
  },
  remote(branch: string, remoteName: string): RevisionExpr {
    // Same refname rules apply to the branch component; remoteName accepts the
    // same constraints minus the path-component rule (remotes don't typically
    // contain `/`, but `:` and friends are still nonsensical).
    validateBookmarkName(branch);
    if (!remoteName || REFNAME_FORBIDDEN_BYTE_OR_SET.test(remoteName) || remoteName.startsWith('-')) {
      throw new Error(`expr.remote: invalid remote '${remoteName}'`);
    }
    return brand(`remote:${remoteName}:${branch}`);
  },
  // Plan 02-03 Task 2 — range factory (RESEARCH §Forward-Complete Gaps Summary).
  // Encoded form embeds two parsed-encoded substrings separated by '..' so the
  // per-backend translators can recursively translate each side.
  range(from: RevisionExpr, to: RevisionExpr): RevisionExpr {
    return brand(`range:${from as unknown as string}..${to as unknown as string}`);
  },
  // Phase 2.1 D-13: structured factory for runtime revision strings. Renamed
  // from `commit(sha)` to `rev(id)`. D-12 forbids expr.raw(), so call sites
  // that hold a revision string (e.g. from a prior log/show output) must
  // wrap via this factory. Permissive validator (SHA_OR_CHANGE_ID_RE) accepts
  // git hex OR jj change_id alphabet; the per-backend translator dispatches.
  rev(id: string): RevisionExpr {
    if (!SHA_OR_CHANGE_ID_RE.test(id)) {
      throw new Error(`expr.rev: not a hex-SHA or change-id shaped string: '${id}'`);
    }
    return brand(`rev:${id}`);
  },
});

// Internal — the parsers in parse/*.ts use this to switch on encoded form.
export interface ParsedExpr {
  kind: 'head' | 'parent' | 'bookmark' | 'remote';
  name?: string;
  remote?: string;
}

export function parseExpr(rev: RevisionExpr): ParsedExpr {
  const s = rev as unknown as string;
  const colon = s.indexOf(':');
  if (colon < 0) throw new Error(`Invalid RevisionExpr: '${s}'`);
  const kind = s.slice(0, colon);
  const rest = s.slice(colon + 1);
  switch (kind) {
    case 'head':
      return { kind: 'head' };
    case 'parent':
      return { kind: 'parent' };
    case 'bookmark':
      return { kind: 'bookmark', name: rest };
    case 'remote': {
      const sep = rest.indexOf(':');
      if (sep < 0) throw new Error(`Invalid remote RevisionExpr: '${s}'`);
      return { kind: 'remote', remote: rest.slice(0, sep), name: rest.slice(sep + 1) };
    }
    default:
      throw new Error(`Unknown RevisionExpr kind: '${kind}'`);
  }
}
