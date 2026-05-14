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
  // Plan 06-01 Task 2 — 'children:<inner>' is not supported on the git backend.
  // git has no single-token direct-children revset operator. Plan 06-02
  // restricts vcs.log({ rev: expr.children(...) }) calls to the JJ adapter.
  // If a future caller needs git-side children, switch to:
  //   git rev-list --ancestry-path <rev>..HEAD --not <rev>
  // at the call site.
  if (encoded.startsWith('children:')) {
    throw new Error(
      `parse/git-rev: 'children:' form is not supported on the git backend. ` +
        `git has no single-token direct-children revset operator. ` +
        `Use 'git rev-list --ancestry-path <rev>..HEAD --not <rev>' at the call site.`,
    );
  }
  // Plan 06-01 Task 2 — 'parents:<inner>' translates to git revision-syntax
  // 'X^@' which expands to "all parents of X" (gitrevisions(7)). Plan 06-02
  // orphan walker uses entries[0] as the first parent. Merge commits return
  // all parents and the walker takes the first.
  if (encoded.startsWith('parents:')) {
    const innerEncoded = encoded.slice('parents:'.length) as unknown as RevisionExpr;
    const innerTranslated = toGitRev(innerEncoded);
    return `${innerTranslated}^@`;
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
    // Plan 06-01 Task 2 — children/parents kinds are handled by the string-prefix
    // branches above (children: throws; parents: translates to <inner>^@). These
    // cases are unreachable but keep the switch exhaustive for TypeScript.
    case 'children':
    case 'parents':
      throw new Error(
        `parse/git-rev: unreachable — '${p.kind}:' should have been handled by prefix branch`,
      );
  }
}
