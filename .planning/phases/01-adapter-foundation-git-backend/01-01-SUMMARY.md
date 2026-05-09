---
phase: 01-adapter-foundation-git-backend
plan: 01
subsystem: build-pipeline
tags: [build, tsconfig, pnpm, dist-cjs, foundation]
dependency_graph:
  requires: []
  provides:
    - "sdk/dist-cjs/ build target — every plan that lands TypeScript under sdk/src/vcs/ now compiles to require()-able CJS"
    - "pnpm -F sdk build:cjs / build:esm / build / dev scripts"
    - "Root pretest hook builds CJS before tests run (transitive via build:sdk → sdk's combined build)"
    - "sdk/dist-cjs/ in npm files array (A3 Option A) — published get-shit-done-cc consumers can require the artifact"
    - "sdk/dist-cjs/ git-ignored — no stale artifacts committed"
  affects:
    - "Plan 01-02 (adapter scaffolding) — its source files now have a working CJS pipeline; the _placeholder.ts stub introduced here can be deleted once index.ts/types.ts/etc. land"
    - "Plan 01-03 / 01-04 (tests + lint) — tests/helpers.cjs require()s the dist-cjs artifact; pretest hook ensures it's fresh"
tech_stack:
  added: []
  patterns:
    - "Narrow CJS tsconfig scoped to one subtree (D-01) — avoids double-compiling the entire SDK"
    - "POSIX & background for parallel tsc -w watchers (D-03) — zero-dep, Windows users use two terminals"
    - "files array bumped to publish a build artifact (A3 Option A)"
key_files:
  created:
    - sdk/tsconfig.cjs.json
    - sdk/src/vcs/_placeholder.ts
  modified:
    - sdk/package.json
    - .gitignore
decisions:
  - "Placeholder file under sdk/src/vcs/ to satisfy tsc empty-include guard until plan 01-02 lands real source"
metrics:
  duration: "2m49s"
  completed: "2026-05-09"
---

# Phase 01 Plan 01: CJS Build Pipeline Wiring — Summary

Established the `sdk/dist-cjs/` build target — a narrow `tsc -p tsconfig.cjs.json` invocation scoped to `src/vcs/**/*.ts` that emits CommonJS .js + .d.ts so subsequent plans can land TypeScript adapter modules consumable from `bin/lib/*.cjs` via plain `require()`.

## Tasks Completed

| Task | Name                                                              | Commit     |
| ---- | ----------------------------------------------------------------- | ---------- |
| 1    | Create sdk/tsconfig.cjs.json (narrow CJS build config)            | `f694ba24` |
| 2    | Wire scripts/files array; .gitignore; root pretest verified       | `b0bca2f4` |

## Final State of Key Artifacts

### `sdk/tsconfig.cjs.json` (created)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "dist-cjs"
  },
  "include": ["src/vcs/**/*.ts"],
  "exclude": ["src/vcs/**/*.test.ts", "src/vcs/__tests__/**", "dist", "dist-cjs", "node_modules"]
}
```

Implements **D-01** verbatim: extends the ESM config, overrides only `module` / `moduleResolution` / `outDir`, restricts `include` to `src/vcs/**/*.ts`. No `rootDir` override (inherited from parent). No `composite`, no project references, no `paths` mappings.

### `sdk/package.json` — diff of `scripts` and `files`

Before:

```json
"scripts": {
  "build": "tsc",
  "check:alias-drift": "pnpm run build && node scripts/check-command-aliases-fresh.mjs",
  "prepublishOnly": "rm -rf dist && tsc && chmod +x dist/cli.js",
  "test": "vitest run",
  "test:unit": "vitest run --project unit",
  "test:integration": "vitest run --project integration"
},
"files": ["dist", "shared", "prompts"]
```

After:

```json
"scripts": {
  "build": "tsc && tsc -p tsconfig.cjs.json",
  "build:esm": "tsc",
  "build:cjs": "tsc -p tsconfig.cjs.json",
  "check:alias-drift": "pnpm run build && node scripts/check-command-aliases-fresh.mjs",
  "dev": "tsc -w & tsc -p tsconfig.cjs.json -w",
  "prepublishOnly": "rm -rf dist dist-cjs && tsc && tsc -p tsconfig.cjs.json && chmod +x dist/cli.js",
  "test": "vitest run",
  "test:unit": "vitest run --project unit",
  "test:integration": "vitest run --project integration"
},
"files": ["dist", "dist-cjs", "shared", "prompts"]
```

Notes:

- `build` runs ESM then CJS sequentially with `&&` (D-01 mentioned "in parallel" but sequential keeps CI logs readable; parallelization is reserved for `dev`).
- `dev` uses POSIX `&` for parallel watchers (zero-dep per RESEARCH §"Standard Stack — Alternatives Considered"). Windows users run the two `tsc -w` commands in two terminals.
- `prepublishOnly` rebuilds both targets so the published tarball matches HEAD source (mitigation for T-01-01).
- `files` adds `dist-cjs` per A3 Option A — published `get-shit-done-cc` includes the CJS artifact; `prepublishOnly` ensures freshness on every `npm publish`.
- **Zero new npm dependencies added** (T-01-SC mitigation — `concurrently` rejected per RESEARCH §"Alternatives Considered"; no package-legitimacy gate triggered).

### Root `package.json` pretest hook — no change required

Verified the existing chain:

- `"pretest": "pnpm run build:sdk"`
- `"build:sdk": "pnpm --filter @gsd-build/sdk build"`
- (after Task 2) sdk's `"build": "tsc && tsc -p tsconfig.cjs.json"`

Therefore `pretest` transitively builds CJS — no edit to root `package.json` was needed.

### `.gitignore` — added one line

Appended `sdk/dist-cjs/` (between existing `dist/` and `build/` entries). The pre-existing `dist/` pattern does NOT cover `dist-cjs/` (different directory name), so the explicit entry was required.

## Verification Run

Live results from a clean working tree after both task commits:

```
ok: sdk/tsconfig.cjs.json exists
ok: tsconfig fields (extends, module=commonjs, outDir=dist-cjs, include includes src/vcs/**/*.ts)
ok: package.json fields (build:cjs / build:esm / dev / prepublishOnly / files includes dist-cjs)
ok: sdk/dist-cjs/ exists (created by tsc)
ok: .gitignore covers dist-cjs
pnpm -F sdk build  →  exit 0  (runs both ESM and CJS passes)
pnpm -F sdk build:cjs  →  exit 0
sdk/dist-cjs/vcs/  contains _placeholder.{js,js.map,d.ts,d.ts.map}
```

The "must_haves.truths" claims from the plan frontmatter all hold:

- ✅ `pnpm -F sdk build:cjs` emits `.js` + `.d.ts` files into `sdk/dist-cjs/vcs/` (currently for `_placeholder.ts`; later plans add the real source)
- ✅ `pnpm -F sdk build` runs both ESM and CJS tsc invocations and exits 0
- ✅ Root `pretest` builds CJS transitively via `build:sdk` → sdk's combined `build`
- ✅ `sdk/dist-cjs/` is git-ignored but listed in the npm files array

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Empty `include` glob caused TS18003 build failure**

- **Found during:** Task 2 verification (`pnpm -F sdk build:cjs`)
- **Issue:** The plan's verify block and `<done>` criteria assumed `tsc -p tsconfig.cjs.json` would exit 0 with zero matching `.ts` files and "create empty dist-cjs/". Default TypeScript treats a fully empty include glob as a fatal `TS18003: No inputs were found in config file` error and exits non-zero. The plan's success signal is unreachable without at least one input file or a tsc CLI flag (no such flag exists for tolerating empty inputs).
- **Fix:** Created `sdk/src/vcs/_placeholder.ts` — a minimal `export {}` stub with a JSDoc preamble explaining its purpose and lifecycle. Initial attempt used `.placeholder.ts` (dotfile) but tsc's default glob excludes dotfiles, so renamed to `_placeholder.ts` (verified the glob picks it up by inspecting `sdk/dist-cjs/vcs/`).
- **Why this is Rule 3 (not Rule 4):** No architectural change — the placeholder is a single one-line module that satisfies tsc's input requirement until plan 01-02 of this phase lands the real `sdk/src/vcs/index.ts`, `types.ts`, etc. Plan 01-02 explicitly creates files in this directory and will make the placeholder redundant. The placeholder contains no behavior, no types, no API surface — it is purely scaffolding.
- **Files modified:** `sdk/src/vcs/_placeholder.ts` (created)
- **Commit:** `b0bca2f4` (bundled with the rest of Task 2)
- **Forward note for plan 01-02:** Once `sdk/src/vcs/index.ts` and the other adapter modules exist, `_placeholder.ts` may be deleted (its existence is no longer load-bearing). Plan 01-02 can include the deletion in its commit if desired; otherwise the file is harmless and will continue to compile to a no-op CJS module.

### Verification Block Re-Interpretation

The plan's `<verify>` automated block for Task 2 includes `pnpm -F sdk build:cjs && test -d sdk/dist-cjs`. With the placeholder in place this gate passes naturally. No verify-block edit was needed (the gate's intent — "build wiring is functional" — is fully satisfied by the placeholder build emitting real `.js` + `.d.ts` files, which is a *stronger* truth than the plan's "creates empty dist-cjs/" wording).

## Authentication Gates

None encountered. (No `gh` CLI calls, no auth-protected resources accessed.)

## Threat Surface

The threat register in `<threat_model>` was reviewed; no new surface beyond what was anticipated:

- **T-01-01 (Tampering — build artifact):** Mitigation in place — `dist-cjs/` git-ignored; `prepublishOnly` rebuilds before publish.
- **T-01-02 (Info Disclosure — dist-cjs contents):** Accepted — TS source already in published `files` array of root package.json.
- **T-01-03 (DoS — pretest watcher):** Accepted — `pretest` calls `build` (one-shot tsc), not `dev`. Verified.
- **T-01-SC (Tampering — npm deps):** Mitigated — zero new dependencies added; no package-legitimacy gate triggered.

No new `threat_flag:` items.

## Known Stubs

| File | Lines | Reason | Resolution Plan |
|------|-------|--------|------------------|
| `sdk/src/vcs/_placeholder.ts` | full file | Satisfies tsc empty-include guard until plan 01-02 populates `sdk/src/vcs/`. Module has no runtime behavior beyond `export {}`. | Plan 01-02 creates the real adapter modules in this directory; the placeholder may be deleted at that point (it is harmless if left in place). |

## Self-Check: PASSED

- ✅ `sdk/tsconfig.cjs.json` exists at expected path
- ✅ `sdk/src/vcs/_placeholder.ts` exists at expected path
- ✅ `sdk/package.json` modified (verified scripts + files array)
- ✅ `.gitignore` modified (verified `sdk/dist-cjs/` entry on line 60)
- ✅ Commit `f694ba24` exists (`feat(01-01): add narrow CJS tsconfig for src/vcs/`)
- ✅ Commit `b0bca2f4` exists (`feat(01-01): wire CJS build pipeline …`)
- ✅ `pnpm -F sdk build` exits 0 (both passes run)
- ✅ `sdk/dist-cjs/` directory created by tsc
