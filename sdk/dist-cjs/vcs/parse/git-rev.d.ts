/**
 * RevisionExpr → git CLI dialect translator.
 * D-11: per-backend module; resolution is git's job, this is a string-builder only.
 */
import type { RevisionExpr } from '../types.js';
export declare function toGitRev(rev: RevisionExpr): string;
//# sourceMappingURL=git-rev.d.ts.map