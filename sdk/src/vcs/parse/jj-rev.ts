/**
 * RevisionExpr → jj CLI dialect translator (stub; Phase 3 fills in production use).
 * Phase 1 ships the locked mappings per REQUIREMENTS.md VCS-05; Phase 3 wires it
 * into the jj backend.
 */

import type { RevisionExpr } from '../types.js';
import { parseExpr } from '../expr.js';

export function toJjRev(rev: RevisionExpr): string {
  const p = parseExpr(rev);
  switch (p.kind) {
    case 'head':
      return '@';
    case 'parent':
      return '@-';
    case 'bookmark':
      return p.name!;
    case 'remote':
      return `${p.name}@${p.remote}`;
  }
}
