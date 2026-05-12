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

function brand(s: string): RevisionExpr {
  return s as RevisionExpr;
}

// WR-07: validate against git's refname rules (see git-check-ref-format(1)).
// The factory is the right place to enforce this so jj and git share the
// constraint — feeding `expr.bookmark('-D')` to `git branch <name>` would have
// the worst-case interpretation `git branch -D` (deletes branches).
//
// Reject:
//   - empty string
//   - any ASCII control byte (0x00-0x1f, 0x7f), space, or one of `~^:?*[\\`
//   - leading `-` (would be parsed as a flag)
//   - leading `.` (forbidden by refname rules)
//   - `..` or `@{` anywhere
//   - trailing `/` or `.lock`
//   - any path component (`/`-separated) that starts with `.` or ends with `.lock`
const REFNAME_FORBIDDEN_BYTE_OR_SET = /[\x00-\x1f\x7f ~^:?*[\\]/;
function validateBookmarkName(name: string): void {
  if (!name) throw new Error(`expr.bookmark: empty name`);
  if (REFNAME_FORBIDDEN_BYTE_OR_SET.test(name)) {
    throw new Error(`expr.bookmark: invalid name '${name}' (forbidden byte or character)`);
  }
  if (name.startsWith('-')) {
    throw new Error(`expr.bookmark: invalid name '${name}' (leading '-')`);
  }
  if (name.startsWith('.') || name.endsWith('/') || name.endsWith('.lock')) {
    throw new Error(`expr.bookmark: invalid name '${name}' (refname format)`);
  }
  if (name.includes('..') || name.includes('@{')) {
    throw new Error(`expr.bookmark: invalid name '${name}' (forbidden sequence)`);
  }
  // Per-component checks for path-shaped names like 'feature/x'.
  for (const component of name.split('/')) {
    if (!component) {
      throw new Error(`expr.bookmark: invalid name '${name}' (empty path component)`);
    }
    if (component.startsWith('.') || component.endsWith('.lock')) {
      throw new Error(`expr.bookmark: invalid name '${name}' (component '${component}')`);
    }
  }
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
