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
