# MERGE REVIEW — upstream 2026-05-25

**Reviewed change:** `kstktxkq` (merge from upstream)
**Scope:** 17 hand-touched files (conflict resolutions + post-merge cleanup)
**Reviewer:** gsd-code-reviewer (deep depth, adversarial stance)
**Status:** **DO NOT SQUASH until BLOCKER-2 and BLOCKER-3 are addressed.** BLOCKER-1 was confirmed real and is fixed in this working copy. BLOCKER-4 was withdrawn by the reviewer.

---

## Reviewer answers to targeted questions

**Q1 — state-mutation.ts duplicate `computeProgressPercent` import:** Correctly resolved. Single import at line 37, single consumer at line 1564.

**Q2 — roadmap.ts duplicate `mode`:** Correctly resolved. Two `const mode` declarations remain at lines 638 and 799, in *different* function scopes (`roadmapGetPhase` and `roadmapAnalyze`). Object literal at 843–855 has a single `mode:` field.

**Q3 — command-static-catalog-domain.ts (promptBudget + worktreeReapOrphans):**
- `promptBudget`: import resolves, handler exported at `prompt-budget.ts:449`, registered at line 126. ✓
- `worktreeReapOrphans`: still EXPORTED from `sdk/src/query/worktree.ts:82` even though removed from the catalog. Dead export. The implementation `spawnSync`s `gsd-tools worktree reap-orphans` which no longer exists (see BLOCKER-3).

**Q4 — config-schema manifest + vcs.adapter pickup:**
- Manifest read at runtime by both sides; no regeneration needed for the JSON edit alone.
- Verified live: `require('config-schema.cjs').VALID_CONFIG_KEYS.has('vcs.adapter') === true`.
- **Open risk:** `configuration.generated.cjs` carries a "regenerate with `npm run gen:configuration`" header. If the generator emits content beyond the manifest contents (e.g. TS-derived helpers), the CJS file may be stale. Run `pnpm -F sdk run check:configuration-fresh` before squash.
- Parity test set-equality holds. ✓

**Q5 — commit.ts dropped `--respect-staged`:** See BLOCKER-2. Feature gone from implementation but still in changeset, docs, release notes, and 6 tests.

**Q6 — dropped `worktree.reap-orphans` dispatch:** See BLOCKER-3. Failure path is silently swallowed by `2>/dev/null || true` in execute-phase.md:93, but the underlying locked-worktree reaping never happens. Test `bug-3707-locked-worktree-cleanup.test.cjs` will fail.

**Q7 — init.ts / init-complex.ts raw-git probes:**
- Annotations are syntactically and semantically correct — these are intentionally backend-agnostic probes ("is git present here?"), not VCS-routed operations.
- **Real defect:** in a jj-native (non-colocated) install, `gitWorktreeInfo` returns `has_git: false`, and `ingest-docs.md:71` then runs `git init` despite `has_jj: true` being available in the same handler output. Workflow doesn't consult `has_jj`. See WARNING-5.

**Q8 — config-schema-sdk-parity test:** All four assertions hold against the merged files. Test currently passes.

---

## BLOCKERS

### BLOCKER-1 — worktree-safety.cjs syntactically broken — **FIXED**

The conflict-resolution edit removed the markers but left the raw unified-diff body (lines with `+`/`-`/` ` prefixes) sitting in the file as code. `node -c` failed with `SyntaxError: Unexpected token 'const'` at line 532. Entire CJS toolchain (gsd-tools, all CJS commands, every test going through `tests/helpers.cjs`) was broken.

**Fix applied:** Deleted the orphaned diff block (originally lines 457–583) and restored the missing `try {` opener. `node -c` now passes; `gsd-tools.cjs` loads and runs.

**Lesson:** SDK build + lint scripts do NOT validate CJS files for parse correctness. They only scan text. Always run `node -c <file>` on any hand-edited CJS file post-merge.

### BLOCKER-2 — `--respect-staged` silently deleted but publicly advertised — **OPEN**

Feature is gone from `sdk/src/query/commit.ts` and `get-shit-done/bin/lib/commands.cjs` (fork-side was taken whole), but still present in:
- `.changeset/kind-foxes-click.md`
- `docs/CLI-TOOLS.md:427-431`
- `docs/RELEASE-v1.42.1.md:147-148`
- `sdk/src/query/QUERY-HANDLERS.md:301`
- `sdk/src/query/commit.test.ts:455-585` (six tests)

No agent prompt currently passes the flag (grep is empty), so no in-tree caller breaks — but the six tests fail, the next release note lies, and any human operator following the docs gets the bug #3522 silent re-stage behavior the changeset claimed to fix.

**Two options:**
- (a) Port the flag into both files (gate the `vcs.commit({files})` re-stage so when `respectStaged: true`, the existing index is used directly).
- (b) Delete the changeset, the four doc references, and the six tests. Document the deferral in the merge commit body.

### BLOCKER-3 — Worktree dispatch chain severed — **OPEN**

- `sdk/src/query/worktree.ts:43` `worktreeCleanupWave` → `spawnSync('gsd-tools', ['worktree', 'cleanup-wave', ...])`
- `sdk/src/query/worktree.ts:82` `worktreeReapOrphans` → `spawnSync('gsd-tools', ['worktree', 'reap-orphans', ...])`
- `get-shit-done/bin/gsd-tools.cjs` no longer has `case 'worktree':` — falls through to "Unknown command" stderr + non-zero exit.

Result: both SDK handlers are dead. `worktree.reap-orphans` is called from `workflows/execute-phase.md:93` with `2>/dev/null || true` so the failure is invisible, but locked-worktree reaping (issue #3707) silently regresses. `tests/bug-3707-locked-worktree-cleanup.test.cjs` end-to-end assertions become meaningless.

**Two options:**
- (a) Restore `case 'worktree':` in gsd-tools.cjs dispatching to `worktree-safety.cjs` functions.
- (b) Refactor the SDK handlers (`worktree.ts:41-84`) to call `worktree-safety.cjs` in-process via the existing `dist-cjs` bridge pattern.

---

## WARNINGS

1. **`tests/helpers.cjs:479` `Object.assign(_exports, …)` pattern is fragile** — works today (hoisting + non-conflicting names), but a future upstream rename could silently shadow a `BACKENDS_*` getter. Prefer extending the original literal at line 397.

2. **`check-ship-ready.ts` lost upstream's `runArgvSafe`/`boolArgvSafe` shell-safety refactor (#3587)** — current `boolSyncSafe('which gh', cwd)` won't run on Windows (`which` is POSIX-only). Either port the argv refactor or document the deferral.

3. **`--respect-staged` may be invoked indirectly via doc-ingested LLM context** — docs/CLI-TOOLS.md flows into skill manifests; an LLM may helpfully use the flag even though no in-tree caller does. Combined with BLOCKER-2 this is silent-wrong-commit territory.

4. **`worktree-safety.cjs:909-924` `cmdWorktreeReapOrphans` is dead code** — exported but unreachable via the CLI. Remove or wire up (depends on BLOCKER-3 resolution).

5. **`ingest-docs.md:71` will `git init` on jj-native installs** — workflow doesn't consult `has_jj` even though `initIngestDocs` emits it. Add a `has_jj === true → skip git init` branch.

6. **`sdk/package.json:60` `dev` script** — `"tsc -w & tsc -p tsconfig.cjs.json -w"` orphans the first `tsc` on Ctrl-C on macOS. Use `concurrently` or `npm-run-all -p`. Inherited from upstream but you touched the script.

7. **`scripts/run-tests.cjs` default suite runs ALL tests** — including any future `slow`/`integration` files unless CI explicitly passes `--suite unit`. Verify CI config matches the suite intent.

8. **`configuration.generated.cjs` freshness check (`pnpm -F sdk run check:configuration-fresh`) may flag drift** — generator could emit content beyond the manifest. Run before squash.

9. **`sdk/src/query/worktree.ts` SDK handlers unconditionally `spawnSync` a possibly-missing binary** — in a pure-SDK install (no surrounding `get-shit-done/bin/` tree), `resolveGsdToolsPath` may return a non-existent path. Combined with BLOCKER-3, both handlers are functionally broken regardless of install topology.

---

## INFO

1. **worktree-safety.cjs:838 `vcs-lint:allow-commit-id-here` annotation is correctly scoped** — local-disk `.git/worktrees/<id>/HEAD` parse, not a VCS query consumer.
2. **config-mutation.ts:312-320 `vcs.adapter` write-guard correctly placed** — within proper validator chain.
3. **state-mutation.ts import resolution clean** — verified via grep.
4. **TypeScript compile clean** — `pnpm -F sdk exec tsc --noEmit` produces no output across all 17 hand-touched TS/JS files.

---

## Required actions before squash

1. ~~Fix BLOCKER-1 (worktree-safety.cjs parse)~~ — **DONE.**
2. **Decide BLOCKER-2** (`--respect-staged`) — port or delete.
3. **Fix BLOCKER-3** (worktree dispatch) — restore case OR refactor SDK handlers.
4. **Run** `pnpm -F sdk run check:configuration-fresh` (WARNING-8).
5. **Run** `node scripts/run-tests.cjs --suite unit` end-to-end now that worktree-safety.cjs parses.
