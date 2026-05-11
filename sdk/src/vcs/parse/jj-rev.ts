/**
 * RevisionExpr → jj CLI dialect translator (stub; Phase 3 fills in production use).
 * Phase 1 ships the locked mappings per REQUIREMENTS.md VCS-05; Phase 3 wires it
 * into the jj backend.
 */

import type { RevisionExpr } from '../types.js';
import { parseExpr } from '../expr.js';

export function toJjRev(rev: RevisionExpr): string {
  // Plan 02-03 Task 2 — same range/commit handling as toGitRev. jj uses '..'
  // for ranges and resolves SHAs verbatim, so the per-backend output shape is
  // structurally identical for these two new kinds (only the inner head/parent
  // translations differ — '@' vs 'HEAD').
  const encoded = rev as unknown as string;
  if (encoded.startsWith('range:')) {
    const inner = encoded.slice('range:'.length);
    const sepIdx = inner.indexOf('..');
    if (sepIdx < 0) throw new Error(`Malformed range RevisionExpr: '${encoded}'`);
    const fromEnc = inner.slice(0, sepIdx) as unknown as RevisionExpr;
    const toEnc = inner.slice(sepIdx + 2) as unknown as RevisionExpr;
    return `${toJjRev(fromEnc)}..${toJjRev(toEnc)}`;
  }
  if (encoded.startsWith('commit:')) {
    return encoded.slice('commit:'.length); // emit SHA verbatim
  }
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
