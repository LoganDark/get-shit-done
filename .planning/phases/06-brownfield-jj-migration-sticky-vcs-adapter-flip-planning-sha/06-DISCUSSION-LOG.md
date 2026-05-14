# Phase 6 — Discussion Log

**Session:** 2026-05-14
**Mode:** discuss (default)
**Areas selected:** 4 of 4 presented (all selected via multiSelect)

This log captures the question/answer trail for audit / retrospective purposes. CONTEXT.md is the canonical artifact consumed by downstream agents.

## Prior context loaded
- PROJECT.md (memory rules — squash model, no raw git, parallel-readiness substrate)
- REQUIREMENTS.md (BROWN-01, BROWN-02 rows pending against Phase 6)
- STATE.md (current focus after Phase 5 close)
- Prior CONTEXT.md files: Phase 5 (D-31..D-37), Phase 4, Phase 3.1 — most relevant: Phase 3 03-CONTEXT.md D-17 (sticky vcs.adapter location), D-19 (format-migration tracker = rewriter work backlog)
- Existing wiring grep: `sdk/src/vcs/index.ts:49-57` already reads `vcs.adapter` from `.planning/config.json` — eliminated the "where does vcs.adapter live" gray area before it was asked

## Pre-locked decisions (carried from prior turns in this session)
1. `.jj/` is the greenfield detection signal (NOT jj-installed). Encoded as ROADMAP SC #1.
2. Brownfield (existing `.planning/`) NEVER auto-mutates `vcs.adapter`. SC #2.
3. Empty-dir requires explicit `--git`/`--jj` flag. SC #7. Replaces upstream's silent `git init` at `new-project.md:108-112`.
4. `vcs.adapter` lives at `.planning/config.json` `vcs.adapter` (Phase 3 D-17, already wired).

## Gray areas presented (multiSelect)
1. Orphan-SHA handling in rewriter (4 options)
2. Empty-dir `--jj` flag init style (4 options)
3. Migration command naming (3 options)
4. Backup/rollback strategy (4 options)

**User selected:** All 4.

## Q&A

### Q1. Orphan-SHA handling
**User selected:** Best-effort: resolve to nearest ancestor (Recommended)

**User refinement (post-selection):** Track the ancestor AND its direct children in a post-migration report so a downstream LLM can pick a better child mapping when there's an obvious match. The report becomes the actionable artifact for selective override.

**Locked as D-01.** Walk back through source-VCS ancestry until hitting a resolvable identifier; rewrite to that ancestor inline with `[was sha:abc123]` annotation; emit structured report at `.planning/intel/06-migration-report.md` listing each orphan with file:line, resolved ancestor, AND direct-children change_ids in the migrated DAG. Unresolvable orphans (ancestor walk hits root) fall back to `[orphan:abc123]` placeholder and the report's "unresolvable" section.

### Q2. Empty-dir `--jj` flag init style
**User selected:** Default `--jj` to colocated; accept `--jj=colocated` / `--jj=native` modifier (rephrased as "default --jj without value to colocated; but accept the modifier as well")

**Locked as D-02.** `--jj` or `--jj=colocated` → `jj git init --colocate` (gets A3 hook fix). `--jj=native` → `jj init` (loses A3 hook semantics). Mirroring rule for migration command: `--target jj` also defaults to colocated.

### Q3. Migration command naming
**User selected:** `/gsd-migrate-vcs` (Recommended)

**User refinement (post-selection):** Bidirectional with current-state-aware default. `/gsd-migrate-vcs` without args defaults to target=jj when current adapter is git (or absent). When current adapter is jj, requires explicit `--target git` to migrate back. Round-trips MUST work (e.g., git→jj→rebase→git).

**Locked as D-03.** Command name `/gsd-migrate-vcs --target <jj|git>`. Bidirectional. Round-trip safe via the existing `vcs.jjOnly.commitIdOf` + inverse runtime translators from Phase 3 parse layer.

**Side effect:** ROADMAP SC #4 was patched in this session to flip from "one-way (no auto-rollback)" to "bidirectional, current-state-aware defaults." Committed in the same change set as this CONTEXT.md.

### Q4. Backup/rollback strategy
**User selected:** Single atomic commit + trust VCS

**Locked as D-04.** Rewriter walks all in-scope files in-memory, computes all rewrites, emits a single atomic commit covering rewrites + `vcs.adapter` flip. Mid-walk crash → `git restore .` / `jj abandon` discards uncommitted state; re-run is idempotent on already-migrated files. Post-commit rollback = `/gsd-migrate-vcs --target <previous>` (the bidirectional contract from D-03 IS the rollback path). No backup snapshot, no staging directory.

## Canonical refs accumulated during discussion
- `.planning/ROADMAP.md` Phase 6 entry — updated in lockstep with D-03
- `.planning/phases/03-jj-backend-core-squash-refs-conflict/03-CONTEXT.md` — D-17, D-18, D-19, D-20
- `.planning/phases/05-command-translations-brownfield-validation-ci-hardening/05-CONTEXT.md` — D-31, D-32, D-33
- `sdk/src/vcs/index.ts:49-57` — vcs.adapter read path (eliminated a would-be gray area)
- `sdk/src/vcs/parse/jj-id.ts` — change_id↔commit_id translators (consumed by rewriter, both directions)
- `sdk/src/vcs/backends/jj.ts` — jj-specific verb implementations
- `get-shit-done/workflows/new-project.md:108-112` — upstream silent git init that SC #7 replaces
- Session memory: `~/.claude/projects/-Users-LoganDark-Documents-Projects-get-shit-done/memory/project_migration_boundary.md`

## Scope creep instances
*(None during this session — all 4 selected gray areas stayed within Phase 6's domain. The user added refinements within scope, not new capabilities.)*

## Deferred ideas captured
- Inverse migration idempotency tests beyond the rebase scenario (other round-trip permutations — abandon, fork between flips)
- Migration command `--dry-run` flag (v2 candidate)
- Per-file migration scope override (`--only .planning/STATE.md`) — no use case yet
- Cross-VCS conflict detection at migration time (may already be covered by Phase 3 CONFLICT-01..03 + `vcs.status` refusal)
