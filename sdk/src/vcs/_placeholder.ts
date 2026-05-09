/**
 * Placeholder for the VCS adapter module.
 *
 * This file exists solely so `tsc -p tsconfig.cjs.json` has at least one
 * input matching `include: ["src/vcs/**\/*.ts"]` and does not fail with
 * TS18003 ("No inputs were found in config file").
 *
 * Plan 01-02 of phase 01-adapter-foundation-git-backend populates this
 * directory with the real adapter modules (index.ts, types.ts, exec.ts,
 * expr.ts, backends.ts, hook-bridge.ts, parse/git-rev.ts, parse/jj-rev.ts).
 * Once those land this file becomes redundant and may be deleted.
 *
 * Tracked as plan 01-01 deviation (Rule 3 — auto-fix blocking issue): the
 * plan's success criterion "pnpm -F sdk build:cjs creates empty dist-cjs/"
 * is impossible under default TypeScript semantics without at least one
 * input file.
 */
export {};
