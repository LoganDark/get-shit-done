/**
 * vcs.hooks.fire primitive.
 * D-05: shells out to .githooks/<stage> synchronously and surfaces exit code.
 * Hook scripts themselves are NOT modified in Phase 1.
 */
import type { ExecResult } from './exec.js';
import type { HookStage, HookContext } from './types.js';
export declare function fireHook(cwd: string, stage: HookStage, ctx?: HookContext): ExecResult;
//# sourceMappingURL=hook-bridge.d.ts.map