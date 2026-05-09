/**
 * RevisionExpr → git CLI dialect translator.
 * D-11: per-backend module; resolution is git's job, this is a string-builder only.
 */

import type { RevisionExpr } from '../types.js';
import { parseExpr } from '../expr.js';

export function toGitRev(rev: RevisionExpr): string {
  const p = parseExpr(rev);
  switch (p.kind) {
    case 'head':
      return 'HEAD';
    case 'parent':
      return 'HEAD~1';
    case 'bookmark':
      return p.name!;
    case 'remote':
      return `${p.remote}/${p.name}`;
  }
}
