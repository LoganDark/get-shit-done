/**
 * RevisionExpr → git CLI dialect translator.
 * D-11: per-backend module; resolution is git's job, this is a string-builder only.
 */

import type { RevisionExpr } from '../types.js';
import { parseExpr } from '../expr.js';

export function toGitRev(rev: RevisionExpr): string {
  // Plan 02-03 Task 2 — handle range/rev prefixes BEFORE parseExpr, since
  // parseExpr only recognizes the Phase 1 head/parent/bookmark/remote kinds.
  // The range form embeds two encoded RevisionExpr strings separated by '..'.
  // Phase 2.1 D-13: `commit:` brand prefix renamed to `rev:`.
  const encoded = rev as unknown as string;
  if (encoded.startsWith('range:')) {
    const inner = encoded.slice('range:'.length);
    const sepIdx = inner.indexOf('..');
    if (sepIdx < 0) throw new Error(`Malformed range RevisionExpr: '${encoded}'`);
    const fromEnc = inner.slice(0, sepIdx) as unknown as RevisionExpr;
    const toEnc = inner.slice(sepIdx + 2) as unknown as RevisionExpr;
    return `${toGitRev(fromEnc)}..${toGitRev(toEnc)}`;
  }
  if (encoded.startsWith('rev:')) {
    return encoded.slice('rev:'.length); // emit SHA / change_id prefix verbatim
  }
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
