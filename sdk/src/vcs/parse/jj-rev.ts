/**
 * RevisionExpr → jj CLI dialect translator (stub; Phase 3 fills in production use).
 * Phase 1 ships the locked mappings per REQUIREMENTS.md VCS-05; Phase 3 wires it
 * into the jj backend.
 */

import type { RevisionExpr } from '../types.js';
import { parseExpr } from '../expr.js';

export function toJjRev(rev: RevisionExpr): string {
  // Plan 02-03 Task 2 — same range/rev handling as toGitRev. jj uses '..'
  // for ranges and resolves revisions verbatim, so the per-backend output
  // shape is structurally identical for these two kinds (only the inner
  // head/parent translations differ — '@' vs 'HEAD').
  // Phase 2.1 D-13: `commit:` brand prefix renamed to `rev:`.
  const encoded = rev as unknown as string;
  if (encoded.startsWith('range:')) {
    const inner = encoded.slice('range:'.length);
    const sepIdx = inner.indexOf('..');
    if (sepIdx < 0) throw new Error(`Malformed range RevisionExpr: '${encoded}'`);
    const fromEnc = inner.slice(0, sepIdx) as unknown as RevisionExpr;
    const toEnc = inner.slice(sepIdx + 2) as unknown as RevisionExpr;
    return `${toJjRev(fromEnc)}..${toJjRev(toEnc)}`;
  }
  if (encoded.startsWith('rev:')) {
    return encoded.slice('rev:'.length); // emit change_id (or SHA) prefix verbatim
  }
  // Plan 06-01 Task 2 — 'children:<inner>' translates to jj revset 'x+'
  // (direct children, depth-1 — empirically verified by jj-children-probe.test.ts).
  if (encoded.startsWith('children:')) {
    const innerEncoded = encoded.slice('children:'.length) as unknown as RevisionExpr;
    const innerTranslated = toJjRev(innerEncoded); // recursion
    return `${innerTranslated}+`;
  }
  // Plan 06-01 Task 2 — 'parents:<inner>' translates to jj revset 'x-'.
  // Parenthesise the inner expression so suffix-operator precedence is
  // unambiguous when inner itself is a compound revset.
  if (encoded.startsWith('parents:')) {
    const innerEncoded = encoded.slice('parents:'.length) as unknown as RevisionExpr;
    const innerTranslated = toJjRev(innerEncoded);
    return `(${innerTranslated})-`;
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
    // Plan 06-01 Task 2 — children/parents kinds are handled by the string-prefix
    // branches above (children: → <inner>+; parents: → (<inner>)-). These cases
    // are unreachable but keep the switch exhaustive for TypeScript.
    case 'children':
    case 'parents':
      throw new Error(
        `parse/jj-rev: unreachable — '${p.kind}:' should have been handled by prefix branch`,
      );
  }
}
