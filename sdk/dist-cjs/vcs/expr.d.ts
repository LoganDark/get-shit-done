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
export declare const expr: Readonly<{
    head(): RevisionExpr;
    parent(): RevisionExpr;
    bookmark(name: string): RevisionExpr;
    remote(branch: string, remoteName: string): RevisionExpr;
    range(from: RevisionExpr, to: RevisionExpr): RevisionExpr;
    children(rev: RevisionExpr): RevisionExpr;
    parents(rev: RevisionExpr): RevisionExpr;
    rev(id: string): RevisionExpr;
}>;
export interface ParsedExpr {
    kind: 'head' | 'parent' | 'bookmark' | 'remote' | 'children' | 'parents';
    name?: string;
    remote?: string;
    inner?: ParsedExpr;
}
export declare function parseExpr(rev: RevisionExpr): ParsedExpr;
//# sourceMappingURL=expr.d.ts.map