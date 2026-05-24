---
title: Doc drift surfaced by /gsd:docs-update --verify-only (45 failures, 18 docs)
source: phase-14 session /gsd:docs-update --verify-only audit
created: 2026-05-24
priority: medium
cross_backend: false
resolves_phase: null
target_milestone: v1.4
---

## Summary

Ran `/gsd:docs-update --verify-only` against all 115 docs in scope (11 root + 104 in `docs/`). Pass rate 97.6% (1,843 of 1,888 claims verified against the live codebase). 45 failures cluster into 8 clear themes — none individually catastrophic but worth a coordinated v1.4 cleanup pass.

Full per-doc result JSON was written to `.planning/tmp/verify-*.json` during the audit and cleaned up at session end. Themes captured below; if more detail is needed, re-running the audit reproduces them.

## Themes (sorted by failure count)

### Theme 1 — Author-machine path leak in superpowers plans (14 failures, 2 docs)

`docs/{ja-JP,ko-KR}/superpowers/plans/2026-03-18-materialize-new-project-config.md`: both contain 7 instances of `node /Users/diego/Dev/get-shit-done/get-shit-done/bin/gsd-tools.cjs ...` in Tasks 2.2 + 4.x bash blocks. These won't execute on any other developer's checkout. The doc itself uses the correct `$HOME/.claude/...` pattern elsewhere (Task 3.1/3.2). The English source doc may have the same leak.

**Fix:** Replace all `/Users/diego/Dev/get-shit-done/get-shit-done/bin/gsd-tools.cjs` with `$HOME/.claude/get-shit-done/bin/gsd-tools.cjs` (or relative `get-shit-done/bin/gsd-tools.cjs`).

### Theme 2 — Split-workspace-command refactor not propagated (7 failures, 3 docs)

`docs/{ja-JP,ko-KR,pt-BR}/superpowers/specs/2026-03-20-multi-project-workspaces-design.md` (L166–168) reference three separate files:
- `commands/gsd/new-workspace.md`
- `commands/gsd/list-workspaces.md`
- `commands/gsd/remove-workspace.md`

None exist. The actual command lives at `commands/gsd/workspace.md` (single multi-subcommand file). Specs predate the merge and weren't updated.

**Fix:** Update specs to reference `commands/gsd/workspace.md` with the appropriate subcommands.

### Theme 3 — ADR drift from current code (7 failures, 2 docs)

- **`docs/adr/0009-shell-command-projection-module.md`** (2 failures):
  - L14: `settings.json` referenced without qualifier — unclear which file
  - L41: `formatHookCommandForShell()` claimed at `bin/install.js:605-608` but function doesn't exist anywhere in repo

- **`docs/adr/0010-file-operation-engine-module.md`** (5 failures):
  - L7: claims Phase 4 removed `normalizeMd` from `core.cjs` — still defined at `core.cjs:637`, exported at `:1958`
  - L36: `isGsdHookCommand` not in `bin/install.js` (only local mirror in `tests/install-hooks-copy.test.cjs`)
  - L37: `STALE_HOOK_BASENAMES` not in `bin/install.js`
  - L50: claims `core.cjs` contains `atomicWriteFileSync` helper — contradicts L7 of same ADR
  - L52: claims `installer-migrations.cjs` defines `writeFileAtomicSync` — actual is `atomicWriteInstallState`

**Fix:** Update ADRs to reflect current code OR add supersession notes. ADRs are by-convention immutable but drift this large warrants either correction or explicit "superseded by ..." notes.

### Theme 4 — Renamed / missing hooks + helpers (5 failures, 5 docs)

- `docs/USER-GUIDE.md` L1091: `gsd-read-before-edit.js` → actual hook is `hooks/gsd-read-guard.js`
- `docs/FEATURES.md` L2002: `gsd-commit-docs.js` as a hook file — doesn't exist; the concept is handled by `tests/bug-2399-commit-docs-plan-phase.test.cjs` + `tests/commit-docs-bypass.test.cjs`, not a hook
- `docs/AGENTS.md` L719: `references/doc-conflict-engine.md` — file exists at `get-shit-done/references/doc-conflict-engine.md` (missing prefix)
- `docs/CONTRIBUTING.md` L403 + `CHANGELOG.md` L346: `scripts/verify-reapply-patches.cjs` — doesn't exist (referenced from two places, same root cause)
- `docs/CONTRIBUTING.md` L571: `npm run build` — no top-level `build` script in `package.json` (only `build:hooks`, `build:sdk`, `build:cjs`)

### Theme 5 — Archived planning artifacts referenced (3 failures, 1 doc)

`docs/test-triage/jj-bugs.md`:
- L5: `03-07-PLAN.md`
- L8: `03-RESEARCH.md`
- L33: `03-06-PLAN.md`

Phase 3 planning dir was archived/cleaned. The doc footer says "Finalized: Phase 3 plan 03-07 close (2026-05-12)" — references are to artifacts that have since been removed.

**Fix:** Either rehydrate the phase-3 docs into an archive subdirectory, or update `jj-bugs.md` to reference the closure commits instead.

### Theme 6 — Drift-control tests claimed but missing (3 failures, 1 doc)

`docs/INVENTORY.md`:
- L9: `tests/architecture-counts.test.cjs` — claimed but doesn't exist
- L9 + L59: `tests/command-count-sync.test.cjs` — claimed but doesn't exist

These tests would have caught the prose-count drift in ARCHITECTURE.md translations (see "Largest informational drift" note below).

**Fix:** Either implement these tests, OR remove the claims from INVENTORY.md. Implementing them would be high-value — they'd lock the prose counts in ARCHITECTURE.md to live filesystem state.

### Theme 7 — Translation date / link mismatches (3 failures, 3 docs)

- `docs/pt-BR/superpowers/plans/2026-03-23-materialize-new-project-config.md` L4: links to `docs/superpowers/plans/2026-03-18-materialize-new-project-config.md` (en-version is 03-18, pt-BR copy is 03-23 — date drift in pt-BR filename)
- `docs/pt-BR/superpowers/README.md` L7: same 03-18 vs 03-23 mismatch
- `docs/pt-BR/superpowers/specs/2026-03-20-multi-project-workspaces-design.md` L4: links to non-existent `docs/superpowers/specs/2026-03-20-multi-project-workspaces-design.md` (the doc itself is the spec — circular ref)

**Fix:** Rename the pt-BR plan file from 03-23 to 03-18 (or update the link target). Fix the circular ref in the specs link.

### Theme 8 — Other singletons (3 failures)

- `CHANGELOG.md` L389: `mutation-subprocess.integration.test.ts` — doesn't exist (may have been renamed/moved during SDK refactor)
- `CONTEXT.md` L610: `tests/lint-no-source-grep.cjs` — actual location is `scripts/lint-no-source-grep.cjs`
- `docs/ja-JP/AGENTS.md` L389: `USER-PROFILE.md` — referenced without path; verifier flagged that the unqualified reference is ambiguous

## Largest informational drift (NOT counted as failures, but worth surfacing)

The verifier's claim-extraction rules deliberately excluded prose count claims. But multiple ARCHITECTURE.md translations claim small counts that have grown dramatically:

| Claim | Actual |
|-------|--------|
| `44` commands | `68` files in `commands/gsd/` |
| `46` workflows | `89` files in `get-shit-done/workflows/` |
| `16` agents | `33` files in `agents/` |
| `17` lib modules | `60` `.cjs` files in `get-shit-done/bin/lib/` |
| `~3,000` lines for `install.js` | `10,978` actual lines |

These appear in `docs/ARCHITECTURE.md` plus its ja-JP / ko-KR / pt-BR / zh-CN translations. Theme 6's missing `tests/architecture-counts.test.cjs` would have caught this.

## Acceptance criteria for the fix plan

- [ ] Theme 1: replace `/Users/diego/Dev/` paths in both translations (14 sites)
- [ ] Theme 2: update workspace specs across 3 translations to reference single `commands/gsd/workspace.md` (7 sites)
- [ ] Theme 3: update ADR 0009 + 0010 OR add supersession notes (7 issues)
- [ ] Theme 4: rename `gsd-read-before-edit` → `gsd-read-guard`, remove `gsd-commit-docs` claim, fix `doc-conflict-engine.md` path, decide on `verify-reapply-patches.cjs`, fix `npm run build` (5 sites)
- [ ] Theme 5: decide whether to rehydrate phase-3 artifacts or update `jj-bugs.md` (3 sites)
- [ ] Theme 6: implement `tests/architecture-counts.test.cjs` + `tests/command-count-sync.test.cjs` (would solve theme 6 AND the "informational drift")
- [ ] Theme 7: rename pt-BR plan file + fix circular spec link (3 sites)
- [ ] Theme 8: 3 singleton fixes
- [ ] Re-run `/gsd:docs-update --verify-only` and confirm pass rate ≥ 99% (allow some legitimate skip-but-flag cases)

## References

- Original audit ran during the Phase 14 close session
- 115 docs in scope: 11 root + 104 in `docs/`
- Total claims: 1,888 (1,843 pass, 45 fail = 97.6%)
- Per-doc result JSON: `.planning/tmp/verify-*.json` (cleaned up after audit)
