---
phase: 06-brownfield-jj-migration-sticky-vcs-adapter-flip-planning-sha
plan: 02
subsystem: vcs
tags: [vcs, migration, rewriter, format-migration, sha, change-id, jj, idempotency, orphan-walk]

requires:
  - phase: 06-brownfield-jj-migration-sticky-vcs-adapter-flip-planning-sha
    plan: 01
    provides: expr.children + expr.parents factories; atomicWriteConfig export; A1/A5/A6 empirical probes
  - phase: 03-jj-backend-core-squash-refs-conflict
    provides: commitIdOf/changeIdOf (parse/jj-id.ts); VcsExecError contract; jj squash commit model
  - phase: 02-vcs-abstraction-audit
    provides: planningPaths, acquireStateLock/releaseStateLock, sanitizeCommitMessage, fireHook
provides:
  - sdk/src/vcs/format-migration/ — self-contained ESM package: runMigration orchestrator + walk + rewrite + resolve + orphan + report + types + barrel
  - 4 paired tests (rewrite/idempotency/orphan/round-trip) — 28 cases, all green
  - MIGRATION_COMMIT_MARKER ('[gsd-migrate-vcs v1]') — stable idempotency probe constant
  - Marker-probe fast-exit semantics (RESEARCH Open Q #4 Option A) — verified live on jj 0.41
  - Repo-relative POSIX path conversion in vcs.commit({files:[...]}) — applicable beyond migration
affects:
  - 06-03-PLAN.md (SDK verb handler imports runMigration from the barrel only)
  - 06-04-PLAN.md (BROWN-01 dogfood consumes the integrated stack)

tech-stack:
  added: []
  patterns:
    - "Two-phase async-pre-pass → sync-rewrite pattern: async resolver populates Map<id, ResolveResult> cache; syncResolveFromCache wraps cache for the pure-sync transformer (rewrite.ts can be pure and stateless)"
    - "Stateful module-scoped regex with cloned RegExp for per-pass lastIndex isolation (run.ts pre-pass uses `new RegExp(GIT_SHA_RE.source, flags)` to avoid sharing lastIndex with rewrite.ts's main loop)"
    - "Symmetric ancestor walk via expr.parents — single revset factory works on both backends, replaces the earlier 'log({maxCount:n+1}) and take entries[n]' git-only trick (per plan 06-01 Task 2 design)"
    - "Repo-relative path conversion at the vcs.commit boundary — jj's fileset parser rejects absolute paths under the repo's symlink-canonical realpath if the realpath differs from the input; relativize via path.relative + POSIX normalization"
    - "Marker-probe idempotency: stable commit-message marker (MIGRATION_COMMIT_MARKER) + maxCount-aware backend-asymmetric HEAD probe (git: 1 from HEAD; jj: 2 to catch both @ and @-)"
    - "CJS-exclude for ESM-only modules: when a src/vcs/* file imports from src/query/* (which transitively pulls import.meta-using modules), exclude the new module from tsconfig.cjs.json rather than rewriting the dependency chain"

key-files:
  created:
    - sdk/src/vcs/format-migration/types.ts
    - sdk/src/vcs/format-migration/walk.ts
    - sdk/src/vcs/format-migration/rewrite.ts
    - sdk/src/vcs/format-migration/resolve.ts
    - sdk/src/vcs/format-migration/orphan.ts
    - sdk/src/vcs/format-migration/report.ts
    - sdk/src/vcs/format-migration/run.ts
    - sdk/src/vcs/format-migration/index.ts
    - sdk/src/vcs/format-migration/__tests__/rewrite.test.ts
    - sdk/src/vcs/format-migration/__tests__/idempotency.test.ts
    - sdk/src/vcs/format-migration/__tests__/orphan.test.ts
    - sdk/src/vcs/format-migration/__tests__/round-trip.test.ts
  modified:
    - sdk/tsconfig.cjs.json (excluded format-migration from CJS build — Rule 3)

key-decisions:
  - "ESM-only build for format-migration: run.ts imports from src/query/* which transitively pulls model-catalog.ts + sdk-package-compatibility.ts (both use import.meta — TS1343 on module='commonjs'). The CJS consumer surface for the rewriter is empty (bin/lib/*.cjs does NOT call format-migration directly; only the ESM SDK verb handler in plan 06-03 does), so excluding the directory from tsconfig.cjs.json's include is the right boundary. Documented inline in tsconfig.cjs.json as $phase6_comment."
  - "Marker probe is maxCount-aware backend-asymmetric. jj's `log({maxCount:1})` with no revset returns `@` (working-copy commit), which is EMPTY after a `jj squash -m` (the migration commit lives at `@-`). Git's `HEAD` is the most recent commit by default. Probe uses maxCount:2 on jj (to catch both @ and @-) and maxCount:1 on git. Simpler than synthesizing an explicit expr.parent() probe, and aligns with the actual recent-commits intent of the marker."
  - "Repo-relative path conversion lives in run.ts (toRepoRelative helper), not at the vcs.commit boundary. The migration is the first known caller that combines walkInScope's realpathSynced absolute paths with vcs.commit's fileset-strict arg shape; future callers that share this pattern can crib the helper. Hoisting to a shared utility is premature."
  - "Canonical-cwd discipline inside run.ts: realpathSync(resolve(cwd)) once at the top, then reuse `canonicalCwd` for every downstream call (createVcsAdapter, walkInScope, planningPaths, emitReport, fireHook). Without this, macOS's /var/folders → /private/var/folders symlink resolution mismatched walk.ts (which realpaths) and planningPaths (which join-concatenates), producing relative paths with leading `..` that jj rejects."
  - "Permissive expr.rev validator forces shape-valid synthetic IDs in orphan.test.ts. The walker calls expr.parents(expr.rev(cursor)) every iteration; expr.rev's regex (/^[0-9a-fA-F]{4,40}$|^[k-z]{4,40}$/) rejects placeholder strings like 'orphan' or 'parent1'. Tests use SHA-shaped hex strings ('abcd1234', 'deadbeef') and change_id-shaped [k-z] strings ('kxnzlnrntwou') throughout."

requirements-completed:
  - PHASE6-REWRITER
  - PHASE6-IDEMPOTENCY
  - PHASE6-ORPHAN-WALK
  - PHASE6-MIGRATION-REPORT

duration: ~40m
completed: 2026-05-14
---

# Phase 06 Plan 02: `.planning/` SHA↔change_id Rewriter Library Summary

**Self-contained `sdk/src/vcs/format-migration/` ESM package: 8 source modules (types/walk/rewrite/resolve/orphan/report/run/index) + 4 paired test files (28 cases, all green) implementing the .planning/ regex-pluck rewriter with cached id-resolution, ancestor-walk via expr.parents, atomic multi-file commit, marker-probe idempotency fast-exit, and live jj 0.41 round-trip verification. Plan 06-03 wires runMigration into the SDK verb + workflow markdown; plan 06-04 consumes the integrated stack for BROWN-01 dogfood.**

## Performance

- **Duration:** ~40 min
- **Tasks:** 2 (foundation layer + orchestration layer)
- **Files modified:** 13 (12 created + 1 modified: tsconfig.cjs.json exclude rule)
- **Tests added:** 28 (rewrite=13, idempotency=7, orphan=6, round-trip=2)
- **Net new code:** ~1100 lines (~700 source + ~400 test)

## Accomplishments

- `runMigration(cwd, target, opts)` orchestrates the 9-phase migration pipeline: lock → read+infer-direction → pre-flight refuse-on-dirty/conflicts → walk+async-pre-pass → sync-rewrite → write-dirty → flip-config → emit-report → reconstruct-adapter+fire-pre-commit → atomic-commit. Lock held for entire duration via try/finally.
- Marker-probe fast-exit (RESEARCH Open Q #4 Option A) verified live on jj 0.41 — second `runMigration(dir, 'jj', ...)` while already on jj returns `{ok:true, migrated:false, filesChanged:0}` rather than throwing.
- Migration commit message carries `[gsd-migrate-vcs v1]` (asserted via real `jj log -r '@-' -T description` in the round-trip test).
- Orphan ancestor walker uses the symmetric `expr.parents(expr.rev(cursor))` factory from plan 06-01 Task 2 — works on both backends with depth-1 semantics (A5+A6 probe-confirmed).
- Pure-function rewriter (migrateContent) is idempotent on no-match input — D-04.1/.2/.3 invariants mechanically verified by `idempotency.test.ts`.
- A1 alphabet disjointness (plan 06-01 probe) propagated into the rewriter tests — `migrateContent` with the wrong direction never matches the wrong alphabet, so cross-direction calls are no-ops without resolver invocation.
- `.planning/intel/06-migration-report.md` emitter renders two markdown tables (ancestor-resolved + unresolvable) with explicit `_(none)_` rows on empty tables and direction-aware empty-children labels (`_(none / target=git)_` on jj→git).
- `lint-vcs-no-raw-git.cjs` exits 0 on 978 files — no new raw-git invocations.

## Task Commits

1. **Task 1: Foundation layer (types + walk + rewrite + resolve + pure-function tests)** — `b2c968a5` (feat)
2. **Task 2: Orchestration layer (orphan + report + run + index + integration tests)** — `26ebc9d4` (feat)

## Files Created/Modified

**Created (12):**
- `sdk/src/vcs/format-migration/types.ts` — `MigrationDirection`, `ResolveResult`, `Orphan`, `MigrationResult`, `RunMigrationOpts`, `MIGRATION_COMMIT_MARKER`
- `sdk/src/vcs/format-migration/walk.ts` — `walkInScope(cwd)`; stdlib `readdirSync({recursive:true, withFileTypes:true})` over 5 in-scope dir-globs + STATE.md; symlink containment guard via lstatSync + realpathSync (Security V4); deterministic sorted absolute paths
- `sdk/src/vcs/format-migration/rewrite.ts` — pure `migrateContent(content, direction, resolve, filePath) → {content, orphans}`; two module-scoped regexes (`GIT_SHA_RE`, `JJ_CID_RE`); replacement vocabulary per CONTEXT D-01 (resolved/ancestor/unresolvable); idempotent on no-match
- `sdk/src/vcs/format-migration/resolve.ts` — `createIdResolver(deps)` async resolver wrapping `commitIdOf`/`changeIdOf` with `Map<id, ResolveResult>` cache; on `VcsExecError` delegates to `deps.ancestor`; `syncResolveFromCache(cache)` wraps populated cache as sync reader
- `sdk/src/vcs/format-migration/orphan.ts` — `resolveAncestor(vcs, cwd, orphan, direction)`; walks via `expr.parents(expr.rev(cursor))`; captures children via `expr.children(expr.rev(targetId))` on jj target; `MAX_DEPTH=1000`; null on root-hit; non-`VcsExecError` errors propagate
- `sdk/src/vcs/format-migration/report.ts` — `emitReport({cwd, direction, orphans, ...})` writes `.planning/intel/06-migration-report.md`; mkdir -p ensures intel/ exists
- `sdk/src/vcs/format-migration/run.ts` — `runMigration(cwd, target, opts)`; 9-phase pipeline; canonical-cwd via realpathSync; marker-probe fast-exit; repo-relative POSIX conversion at commit boundary; fireHook('pre-commit') before jj-target commit (RESEARCH Open Q #5 workaround)
- `sdk/src/vcs/format-migration/index.ts` — public barrel: `runMigration` + types + `MIGRATION_COMMIT_MARKER`
- `sdk/src/vcs/format-migration/__tests__/rewrite.test.ts` — 13 pure-function vitest cases
- `sdk/src/vcs/format-migration/__tests__/idempotency.test.ts` — 7 cases for D-04.1/.2/.3 + double-application invariant
- `sdk/src/vcs/format-migration/__tests__/orphan.test.ts` — 6 mocked-adapter vitest cases via `vi.mock('../../parse/jj-id.js', ...)` pattern (analog: restore.test.ts)
- `sdk/src/vcs/format-migration/__tests__/round-trip.test.ts` — 2 real-jj 0.41 integration cases against `synthPlanningFixture('jj-colocated')`

**Modified (1):**
- `sdk/tsconfig.cjs.json` — added `src/vcs/format-migration/**` to `exclude` (ESM-only by design; documented inline via `$phase6_comment` field)

## Round-Trip Result Against Real jj 0.41

**jj version (from `jj --version` at execution time):**
```
jj 0.41.0-cfdadb380babf004a3c0f1f0177335756011b3a1-b3506b213cbf53c2298f710d32cb8eb358f1592a-76bbc6fca7d4a30646004c9179e367ec220c5194-a83b55d79bfad0dd003ac92d9df6f41ff888e2a8
```

Both `round-trip.test.ts` cases passed on first verified run:
- **Case 1: git → jj flips vcs.adapter, emits report, lands commit; jj → git reverses** — 781ms. Verified `config.json` flipped to `'jj'`, `.planning/intel/06-migration-report.md` exists, idempotent re-run returned `{migrated:false, filesChanged:0}`, second flip restored `'git'`, STATE.md round-trip is byte-identical to baseline modulo `[was sha:...]` / `[was cid:...]` breadcrumbs (zero such breadcrumbs on the synth fixture's clean linear history).
- **Case 2: migration commit subject contains `[gsd-migrate-vcs v1]` marker; marker-probe yields migrated:false** — 696ms. Verified `jj log -r '@-' -T description` returns `chore(vcs): migrate git -> jj [gsd-migrate-vcs v1]\n`; re-running `runMigration(dir, 'jj', ...)` while already on jj returns `{ok:true, migrated:false, filesChanged:0}`.

## Decisions Made

(See frontmatter `key-decisions` for the load-bearing decisions. Below are inline expansions for the most consequential ones.)

- **ESM-only build for format-migration**: `run.ts` imports `atomicWriteConfig`/`acquireStateLock`/`planningPaths`/`sanitizeCommitMessage` from `src/query/*`, which transitively pulls `model-catalog.ts` and `sdk-package-compatibility.ts`. Both use `import.meta.url` — TS1343 error when `tsc -p tsconfig.cjs.json` (module='commonjs'). Three options considered:
  1. **Inline/duplicate the helpers into `src/vcs/`** — invasive; would create two copies of `atomicWriteConfig` across the SDK.
  2. **Widen tsconfig.cjs.json includes to cover `src/query/*` + exclude the import.meta files** — risks breakage; the existing CJS shape is hermetic by design.
  3. **Exclude `src/vcs/format-migration/**` from CJS build** — minimal-diff; the rewriter's only consumer (plan 06-03 SDK verb handler) is ESM-only; bin/lib/*.cjs does NOT call the rewriter directly. **Chosen.** Inline `$phase6_comment` field in `tsconfig.cjs.json` documents the rationale for the next reader.

- **Marker-probe asymmetry**: jj's `log({maxCount:1})` with no revset returns `@` (working-copy commit) which is empty after `jj squash -m`; the migration commit lives at `@-`. Git's HEAD probe returns the most recent commit directly. Solution: probe with `maxCount: 2` on jj (catches both `@` and `@-`); keep `maxCount: 1` on git. `.find(e => e.subject.includes(MARKER))` over the small result set is simpler than synthesizing per-backend revsets via `expr.parent()`/`expr.head()`.

- **Repo-relative POSIX conversion at the commit boundary**: jj's fileset parser produces errors like `Invalid component ".." in repo-relative path "../../../../../../../var/folders/.../config.json"` when given absolute paths whose realpath escapes the repo root via symlinks. Git's pathspec is more permissive and accepts absolute paths. To keep both backends symmetric, `run.ts` calls a local `toRepoRelative(abs, cwd)` helper on every commit-file before passing to `vcs.commit({files:[...]})`. The helper hard-anchors to `canonicalCwd` (realpathSynced once at the top of `runMigration`) so all inputs share the same canonical-path prefix.

- **Canonical-cwd discipline**: walk.ts realpaths its inputs (Security V4 — symlink containment); planningPaths joins-concatenates without realpathing. Without the top-of-run.ts `canonicalCwd = realpathSync(resolve(cwd))` synchronization, macOS's `/var/folders → /private/var/folders` symlink resolution mismatches walk-output paths (which are realpath-canonical) against config-path constructions (which are not), producing `path.relative` output with leading `../../private/...` that jj rejects.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan API `vcs.hooks.fire(...)` does not exist on the adapter**
- **Found during:** Task 2 (run.ts initial draft)
- **Issue:** The plan's pseudo-code in `<action>` says `await newVcs.hooks.fire('pre-commit', ctx)`. But Phase 2.1 D-07 explicitly REMOVED the public `hooks` namespace from the adapter — see `sdk/src/vcs/types.ts:332-336` ("the public hooks namespace interface has been DELETED"). The actual API surface for explicit-fire is the standalone `fireHook(cwd, stage, ctx?)` helper in `sdk/src/vcs/hook-bridge.ts`, exported per Phase 4 plan 06 D-07.
- **Fix:** `import { fireHook } from '../hook-bridge.js'` and call `fireHook(canonicalCwd, 'pre-commit')` before the jj-target commit.
- **Verification:** Real jj round-trip commits succeed; no hook present on the synth fixture so the call returns exit-0 (per hook-bridge.ts:22-24 — "if (!existsSync(hookPath)) return {exitCode:0,...}").
- **Committed in:** `26ebc9d4`

**2. [Rule 1 - Bug] Plan API `vcs.status({scope:'working-copy'})` does not exist**
- **Found during:** Task 2 (run.ts initial draft)
- **Issue:** Plan pseudo-code calls `vcs.status({scope:'working-copy'})`. But `StatusOpts` has only `porcelain?: boolean` — no `scope` field. (`findConflicts` is the method that takes `{scope: 'all'|'working-copy'}`.)
- **Fix:** Use `vcs.status()` (default returns WC entries on both backends) and check `entries.length > 0`.
- **Verification:** Pre-flight refusal still tests for dirty WC; both backends honor it.
- **Committed in:** `26ebc9d4`

**3. [Rule 1 - Bug] Plan pseudo-code treats sync methods as Promise-returning**
- **Found during:** Task 2 (run.ts compilation)
- **Issue:** Plan uses `await vcs.log(...)`, `await vcs.status(...)`, `await vcs.commit(...)`. But the VcsAdapter contract makes all these methods synchronous (see `sdk/src/vcs/types.ts:234-242` — return types are bare `LogEntry[]`, `StatusResult`, `CommitResult`, `ConflictResult[]`, not `Promise<...>`).
- **Fix:** Removed the `await` keywords; treats the return values as immediate. Awaiting a non-Promise is a no-op in JS, so the plan's pseudo-code would also have worked at runtime — but type-stripping it makes the intent clearer for the next reader.
- **Verification:** `pnpm build` succeeds; tests pass.
- **Committed in:** `26ebc9d4`

**4. [Rule 1 - Bug] Plan probes `head[0]?.message ?? head[0]?.subject` — only `subject` exists on LogEntry**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** `LogEntry` shape (sdk/src/vcs/types.ts:109-116) has fields `hash`, `parents`, `author`, `date`, `subject`, optional `body` — no `message`. The plan's marker-probe pseudo-code references both `.message` and `.subject` as a fallback chain.
- **Fix:** Use `entry.subject` directly. The migration commit message is a single-line subject (no body), so `subject` carries the full marker text.
- **Verification:** Round-trip test confirms `subject.includes(MIGRATION_COMMIT_MARKER)` is true after first migration.
- **Committed in:** `26ebc9d4`

### Rule 3 — Blocking Issues

**5. [Rule 3 - Blocking] CJS build trips on `import.meta` in transitively-pulled `model-catalog.ts`**
- **Found during:** Task 2 (`pnpm build` after creating run.ts)
- **Issue:** `tsc -p tsconfig.cjs.json` failed with 6 × TS1343 errors in `src/model-catalog.ts` and `src/sdk-package-compatibility.ts`. Root cause: run.ts imports from `src/query/*` (atomicWriteConfig, acquireStateLock, planningPaths, sanitizeCommitMessage); helpers.ts transitively imports `model-catalog.ts`. The CJS build's `module: "commonjs"` setting rejects `import.meta.url`. The original CJS include `["src/vcs/**/*.ts", "src/errors.ts"]` plus the transitive pull was incompatible.
- **Fix:** Excluded `src/vcs/format-migration/**` from the CJS include list in `sdk/tsconfig.cjs.json`. The exclusion is documented inline with a `$phase6_comment` field explaining the rationale (no CJS consumer for the rewriter; plan 06-03 verb handler is ESM-only).
- **Verification:** `pnpm build` exits 0 on a clean `rm -rf dist dist-cjs && pnpm build`. `dist/vcs/format-migration/` exists (ESM), `dist-cjs/vcs/format-migration/` does NOT exist (intentional).
- **Note on plan-stated invariant:** The plan's verification block included `node -e "const m=require('./sdk/dist-cjs/vcs/format-migration/index.js'); console.log(Object.keys(m))"` and expected `['runMigration','MIGRATION_COMMIT_MARKER']`. This invariant is **not satisfied** post-fix — the dist-cjs path does not exist. The plan-author's CJS-consumer assumption was incorrect. The ESM-side equivalent is satisfied: `node --input-type=module -e "import('./sdk/dist/vcs/format-migration/index.js').then(m => console.log(Object.keys(m)))"` prints `['MIGRATION_COMMIT_MARKER','runMigration']`.
- **Committed in:** `26ebc9d4` (alongside the run.ts source that triggered the build break)

**6. [Rule 3 - Blocking] jj fileset parser rejects absolute paths whose realpath escapes the repo root**
- **Found during:** Task 2 (round-trip test first run)
- **Issue:** `vcs.commit({files: [absolute_path, ...]})` on the jj backend failed with `Invalid component ".." in repo-relative path "../../../../../../../var/folders/.../planning/config.json"`. Root cause: on macOS, the fixture tmpdir is `/var/folders/...` but its realpath is `/private/var/folders/...`. `walkInScope` returns realpath-canonical absolute paths (`/private/var/...`); `planningPaths(cwd)` returns join-concatenated paths without realpathing (`/var/...`). When `vcs.commit` passes both to `jj squash <files>`, jj's fileset parser tries to express them relative to the repo root and produces `../private/...` for the realpath form.
- **Fix:** Two-part:
  1. `runMigration` realpathSyncs `cwd` once at the top (`canonicalCwd = realpathSync(resolve(cwd))`) and uses `canonicalCwd` for ALL downstream calls (createVcsAdapter, walkInScope, planningPaths, emitReport, fireHook). This guarantees walk and planningPaths share the same canonical-path prefix.
  2. Added `toRepoRelative(abs, cwd)` helper that converts every commit-file path to repo-relative POSIX form before passing to `vcs.commit({files:[...]})`. Defensive — falls back to absolute on `..` leak.
- **Verification:** Round-trip test passes (1.5s total for 2 cases). jj-side commits land cleanly.
- **Committed in:** `26ebc9d4`

**7. [Rule 3 - Blocking] Marker-probe reads empty `@` on jj after `jj squash -m`**
- **Found during:** Task 2 (round-trip test second-flip case)
- **Issue:** First call to `runMigration(dir, 'jj', {force:true})` succeeded (config flipped, commit landed). Second call (idempotency probe) FAILED with `migrate-vcs: already on jj (previousAdapter=jj)` — the marker probe couldn't find the marker. Root cause: `vcs.log({maxCount:1})` on jj with no revset returns the working-copy commit `@`, which is EMPTY after a `jj squash -m` operation (squash lands the message on `@-`, leaves `@` empty for further work).
- **Fix:** Marker probe is now backend-asymmetric — `maxCount:2` on jj (catches both `@` and `@-`), `maxCount:1` on git. `.find(e => e.subject.includes(MARKER))` selects the entry carrying the marker.
- **Verification:** Round-trip idempotency probe yields `{ok:true, migrated:false, filesChanged:0}`.
- **Committed in:** `26ebc9d4`

**8. [Rule 1 - Test-correctness] Synthetic test IDs must be shape-valid for `expr.rev`**
- **Found during:** Task 2 (`orphan.test.ts` initial run)
- **Issue:** Initial test IDs (`'orphanShaXYZ'`, `'parent1'`, `'p1'`, `'orphan'`) violate `expr.rev`'s permissive validator regex `/^[0-9a-fA-F]{4,40}$|^[k-z]{4,40}$/`. The walker calls `expr.parents(expr.rev(cursor))` on every iteration, so synthetic IDs in tests have to look like real SHAs or change_ids.
- **Fix:** Replaced placeholder IDs with shape-valid hex strings (`'abcd1234'`, `'deadbeef'`, `'abcd0001'`...`'abcd0004'`) and `[k-z]` change_id strings (`'kxnzlnrntwou'`, `'mnopqrstuvwx'`, `'lmnopqrstuvw'`). MAX_DEPTH test generates fresh shape-valid hex via `stepCount.toString(16).padStart(8, '0')`.
- **Verification:** All 6 orphan.test.ts cases green.
- **Committed in:** `26ebc9d4`

### Plan-author Documentation Drift (no auto-fix applied)

**9. [Plan-error documented] Verify regex assumes `vcs.hooks.fire` exists**
- **Issue:** The plan's `<verify>` block for Task 2 includes `grep -E "MIGRATION_COMMIT_MARKER" src/vcs/format-migration/run.ts` (which succeeds — 3 hits including comments and imports) but the plan's success-criteria prose still references "vcs.hooks.fire" semantics for the A3 colocated workaround.
- **Assessment:** No code fix needed — the workaround now uses `fireHook(canonicalCwd, 'pre-commit')` which is the SDK's actual primitive (`sdk/src/query/hooks.ts` re-exports the same primitive via the SDK verb). The semantic intent of RESEARCH Open Q #5 is preserved.
- **Forwarded to plan 06-03:** if the SDK verb handler chooses to share the hook-fire step rather than re-fire it, the verb handler should NOT call `fireHook` redundantly. (Currently `runMigration` fires the hook itself; the verb handler should NOT re-fire.)

---

**Total deviations:** 4 auto-fixed plan-API bugs (Rule 1) + 3 Rule 3 blocking-issue fixes + 1 test-correctness fix + 1 documented plan-author drift (no fix applied).

**Impact on plan:** All auto-fixes necessary for correctness/build. No scope creep. The "CJS export from dist-cjs" stated invariant is the only success-criterion item that does NOT hold post-fix — but that invariant was based on an incorrect plan-author assumption about CJS consumers; the equivalent ESM invariant holds.

## Issues Encountered

None beyond the deviations documented above. All 28 tests pass on first verified run; `lint-vcs-no-raw-git.cjs` reports 0 violations on 978 files.

## User Setup Required

None — no external service configuration introduced by this plan.

## Format-Migration Tracker (CONTEXT D-19)

**Net-new-surfaces line:** this plan introduces ONE NEW runtime-emitted surface — `.planning/intel/06-migration-report.md`. The report describes WHAT was migrated (ancestor-resolved + unresolvable orphan tables); it is itself an intel/advisory surface, NOT user state. **Subsequent migrations MUST NOT include 06-migration-report.md in their rewriter scope** — that would cause:
1. Self-referential growth (the report mentions every orphan's `original` SHA in markdown code blocks, which the regex would match)
2. Stale-report rewriting (the previous migration's report is a historical record; rewriting it would falsify the audit trail)

The existing `walk.ts` glob set already excludes the report path indirectly: `IN_SCOPE_DIR_GLOBS` includes `.planning/intel` with pattern `/\.md$/`, which WOULD match the report — but the migration always overwrites the report at commit time. So:
- If a previous migration produced `.planning/intel/06-migration-report.md`, the next migration will scan it (matching SHAs inside) → resolve them via cache → rewrite them → and then OVERWRITE the file again with a new report. The rewrites are no-ops because the marker-probe fast-exit fires first.
- Cross-direction migrations (git → jj where a prior jj → git report exists) WILL rewrite the old report's contents to the new direction. This is acceptable behavior — the new migration's report is the authoritative one.

**No action required for this plan** — the self-overwrite semantics are correct. Documenting here so 06-03/06-04 don't accidentally extend `IN_SCOPE_DIR_GLOBS` in a way that breaks this property.

## Plan 06-03 Interface Dependency

The SDK verb handler at `sdk/src/query/migrate-vcs.ts` (plan 06-03 deliverable) imports from the barrel ONLY:

```typescript
import { runMigration, MIGRATION_COMMIT_MARKER } from '../vcs/format-migration/index.js';
import type { MigrationResult, RunMigrationOpts } from '../vcs/format-migration/index.js';
```

Internal modules (walk/rewrite/resolve/orphan/report/run) are NOT re-exported from the barrel — they are implementation details. If plan 06-03 needs to inject a test-only seam, it should mock the barrel via `vi.mock('../vcs/format-migration/index.js', ...)`, NOT reach into the internal modules.

The `RunMigrationOpts` type includes a `native?: boolean` field that is **opaque to the rewriter** — plan 06-03 forwards `--native` from CLI argv to `runMigration` but the rewriter does NOT branch on it (the field is reserved for the verb handler's init-handler dispatch, which selects `jj git init --colocate` vs `--no-colocate` BEFORE `runMigration` is called).

## Next Phase Readiness

- **Plan 06-03:** All interface deliverables met. `runMigration` is importable from the barrel; `MIGRATION_COMMIT_MARKER` exported; types stable.
- **Plan 06-04:** BROWN-01 dogfood can consume the integrated stack once plan 06-03 lands the verb. No direct dependency surface added by 06-02 — the rewriter library does not touch this repo's `.planning/` state, only synthetic fixtures.
- **No blockers introduced.**

## Self-Check: PASSED

Verified all claims:

**Created files exist:**
- `sdk/src/vcs/format-migration/types.ts` ✓
- `sdk/src/vcs/format-migration/walk.ts` ✓
- `sdk/src/vcs/format-migration/rewrite.ts` ✓
- `sdk/src/vcs/format-migration/resolve.ts` ✓
- `sdk/src/vcs/format-migration/orphan.ts` ✓
- `sdk/src/vcs/format-migration/report.ts` ✓
- `sdk/src/vcs/format-migration/run.ts` ✓
- `sdk/src/vcs/format-migration/index.ts` ✓
- `sdk/src/vcs/format-migration/__tests__/rewrite.test.ts` ✓
- `sdk/src/vcs/format-migration/__tests__/idempotency.test.ts` ✓
- `sdk/src/vcs/format-migration/__tests__/orphan.test.ts` ✓
- `sdk/src/vcs/format-migration/__tests__/round-trip.test.ts` ✓

**Commits exist:**
- `b2c968a5` (Task 1 foundation layer) ✓
- `26ebc9d4` (Task 2 orchestration layer + integration tests) ✓

**Verification gates from plan Task 2:**
- `grep -E "expr\.parents\(expr\.rev\(" sdk/src/vcs/format-migration/orphan.ts` returns 2 hits (1 prose + 1 code) ✓
- `grep -F "[gsd-migrate-vcs v1]" sdk/src/vcs/format-migration/__tests__/round-trip.test.ts` returns 2 hits ✓
- `grep -E "MIGRATION_COMMIT_MARKER" sdk/src/vcs/format-migration/run.ts` returns 3 hits ✓
- `cd sdk && pnpm build` succeeds (clean build after `rm -rf dist dist-cjs`) ✓
- `node scripts/lint-vcs-no-raw-git.cjs` exits 0 (978 files, 0 violations) ✓
- All 28 tests across 4 files pass via `pnpm test src/vcs/format-migration/__tests__/` ✓
- ESM-side smoke probe: `import('./dist/vcs/format-migration/index.js')` prints `['MIGRATION_COMMIT_MARKER','runMigration']`; `typeof runMigration === 'function'` ✓

**Plan-stated CJS smoke probe (NOT satisfied — intentional per Deviation 5):**
- ✗ `node -e "const m=require('./sdk/dist-cjs/vcs/format-migration/index.js'); console.log(Object.keys(m))"` — dist-cjs path does not exist (ESM-only build).

---

*Phase: 06-brownfield-jj-migration-sticky-vcs-adapter-flip-planning-sha*
*Completed: 2026-05-14*
