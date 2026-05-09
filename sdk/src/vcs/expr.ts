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

export const expr = Object.freeze({
  head(): RevisionExpr {
    return brand('head:');
  },
  parent(): RevisionExpr {
    return brand('parent:');
  },
  bookmark(name: string): RevisionExpr {
    if (!name || name.includes(':')) throw new Error(`expr.bookmark: invalid name '${name}'`);
    return brand(`bookmark:${name}`);
  },
  remote(branch: string, remoteName: string): RevisionExpr {
    if (!branch || !remoteName || branch.includes(':') || remoteName.includes(':')) {
      throw new Error(`expr.remote: invalid args branch='${branch}' remote='${remoteName}'`);
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
