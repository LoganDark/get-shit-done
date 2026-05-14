# Phase 6: Brownfield jj Migration — Context

**Gathered:** 2026-05-14
**Status:** Ready for research/planning
**Source:** /gsd-discuss-phase 6 (4 gray areas discussed, locked)

<domain>
## Phase Boundary

Phase 6 delivers the migration mechanism that lets greenfield projects auto-select jj when the directory is already a jj repo, brownfield projects opt into jj via an explicit bidirectional migration command, and the `.planning/` SHA↔change_id rewriter that makes brownfield migration (in either direction) safe by reconciling all the planning-file prose that records VCS identifiers.

**Locked outside this discussion** (carried forward from ROADMAP / earlier phases / this session's prior turns):

- Greenfield gate: `.jj/` presence is the detection signal (NOT jj-installed). If `.jj/` exists and no `.planning/` exists, `/gsd-new-project` writes `vcs.adapter: "jj"` into the new `config.json`.
- Brownfield invariant: existing `.planning/` → NO GSD command auto-mutates `vcs.adapter`. Only the explicit migration command in SC #4 flips it.
- Empty-dir behavior: `/gsd-new-project` in a literal empty dir refuses to auto-init either VCS — user must pass explicit `--git` or `--jj` flag, or init the VCS themselves first. This REPLACES upstream's silent `git init` at `get-shit-done/workflows/new-project.md:108-112`.
- Storage location: `vcs.adapter` lives at `.planning/config.json` `vcs.adapter` (Phase 3 D-17, already wired in `sdk/src/vcs/index.ts:49-57`). Rewriter library path: likely `sdk/src/vcs/format-migration/` (Phase 6 confirms).
- Format-migration tracker (Phase 3 D-19) inventoried the rewriter's work backlog: `.planning/STATE.md` prose, per-phase `SUMMARY.md` / `LEARNINGS.md` / `REVIEW.md` / `REVIEW-FIX.md` / `VERIFICATION.md` / `PATTERNS.md` prose, gsd-sdk phase manifests (internal format TBD by audit), gsd-sdk `query commit` JSON output, `.planning/intel/*.md` prose, `.planning/research/*.md` prose. ROADMAP.md / PROJECT.md / REQUIREMENTS.md verified SHA-free — no entries.

</domain>

<decisions>
## Implementation Decisions

### D-01 (Orphan-SHA handling — best-effort ancestor + structured report)

When the rewriter encounters a git SHA (in either direction's prose scan) that doesn't resolve to a known counterpart identifier (e.g., git SHA that has been squashed away in jj's op-log and has no direct change_id mapping), the strategy is **best-effort resolve to nearest ancestor**:

1. Walk back through the source-VCS ancestry from the orphan identifier until hitting one that DOES map to a known counterpart.
2. Rewrite to that ancestor's identifier inline, with a `[was sha:abc123]` (or `[was cid:xyz]` for the reverse direction) annotation so the breadcrumb is preserved.
3. Emit a structured migration report at `.planning/intel/06-migration-report.md` (or equivalent path; planner confirms). For each orphan handled this way, the report records: original identifier, file:line where it appeared, resolved-ancestor identifier, AND the direct-children identifiers of that ancestor in the migrated DAG.
4. The report is post-migration, advisory — a downstream LLM (or human reviewer) can scan it and pick a better child mapping when there's an obvious match, then apply the correction inline. The default (ancestor mapping) stays in place unless overridden.

**Why ancestor + children:** Bare-ancestor mapping is the safest automated choice, but the direct-children list captures the candidates that the SHA-being-rewritten was likely "near" before squashing — surfacing them in the report makes the override pass actionable instead of guesswork.

**Failure mode if ancestor walk hits the root with no resolution:** Replace with a literal `[orphan:abc123]` placeholder and add to the report's "unresolvable" section.

### D-02 (Empty-dir `--jj` defaults to colocated; modifier accepted)

`/gsd-new-project --jj` invoked in a literal empty directory runs `jj git init --colocate` by default (creates both `.git/` and `.jj/`). This gets the A3 pre-commit hook fire that Phase 5 just landed (only works in colocated mode per Phase 4 LEARNINGS).

The `--jj` flag accepts a modifier for explicit opt-out:
- `--jj` or `--jj=colocated` → `jj git init --colocate`
- `--jj=native` → `jj init` (no `.git/`; loses A3 hook semantics; user must opt in)

**Why colocated by default:** Phase 5 invested in the A3 hook fix; making colocated the default ensures greenfield users get it for free. Power users who want pure jj can opt out explicitly.

**Mirroring on migration command:** `/gsd-migrate-vcs --target jj` defaults to colocated when the project isn't already a jj repo (it runs `jj git init --colocate` as part of the migration). Native opt-in via `--target jj --native` (or similar; planner confirms exact flag shape).

### D-03 (Migration command name: `/gsd-migrate-vcs` with bidirectional `--target`)

The brownfield migration command is **`/gsd-migrate-vcs`**. It takes a `--target` flag specifying the destination VCS.

**Current-state-aware defaults:**
- If `.planning/config.json` `vcs.adapter` is `git` or absent → default `--target jj` (colocated). User can invoke `/gsd-migrate-vcs` with no args; it's unambiguous in this state.
- If `.planning/config.json` `vcs.adapter` is `jj` → require explicit `--target git`. The bare command refuses with a clear error stating the current adapter and the required flag.

**Bidirectional, round-trip safe:** The migration is NOT one-way. A user can migrate git→jj, run `jj rebase` against upstream, then `/gsd-migrate-vcs --target git` to flip back. The rewriter uses both directions of the jj backend's runtime translators (`vcs.jjOnly.commitIdOf` and its inverse — both already exist per Phase 3 parse layer). Round-trips work because at every flip the rewriter resolves identifiers using the CURRENT backend state, not a frozen pre-migration mapping.

**This overrides ROADMAP SC #4's prior "one-way (no auto-rollback)" framing.** The ROADMAP entry has been updated in lockstep with this discussion.

**Future extensibility:** The `/gsd-migrate-vcs` surface accommodates a hypothetical future third VCS (hg, sapling, etc.) by extending the `--target` value set rather than spawning a new command.

### D-04 (Failure recovery: single atomic commit + trust VCS)

The rewriter walks all in-scope `.planning/` files in-memory, computes all rewrites, then writes all changes to disk and emits a **single atomic commit** that captures both the rewrites AND the `vcs.adapter` flip in `config.json`.

**Partial-failure recovery:**
- Mid-walk crash (before commit): working tree has uncommitted changes. User runs `git restore .` (on git) or `jj abandon` (on jj — though this case implies migrating FROM jj, where the working copy auto-snapshots) to discard. Re-run `/gsd-migrate-vcs` — the rewriter is **idempotent on already-migrated files** (no-op when the source-direction identifier already matches the target VCS's shape).
- Post-commit unexpected failure: covered by the bidirectional contract from D-03 — user runs `/gsd-migrate-vcs --target <previous>` to flip back. No explicit backup snapshot needed; VCS history IS the rollback.

**No `.planning/.migration-backup/` snapshot, no two-phase staging directory.** Both would be redundant given VCS-history-as-rollback and would add cross-platform fragility (Windows rename semantics, gitignore management for backup dirs).

**Idempotency requirements for the rewriter:**
1. A file with no identifiers matching the source-VCS shape is left untouched.
2. A file already migrated (all in-scope identifiers match the target VCS's shape) is left untouched.
3. A file with a mix (some migrated, some not) is rewritten so all in-scope identifiers reach the target shape; mixed state happens only if a prior partial run was discarded and re-run.

### D-05 (Follow-on / Claude's Discretion for the planner)

The following implementation choices are NOT pre-decided by this discussion — the planner picks from research:

- **Rewriter algorithm shape:** regex-pluck-and-resolve per file vs. parse-driven walker. The Phase 3 D-19 tracker lists prose-heavy files where regex-pluck is fine; phase manifests and `gsd-sdk query commit` output may need parser awareness. Planner confirms during research.
- **Migration report file path / format:** Likely `.planning/intel/06-migration-report.md` (markdown table) or `.planning/intel/06-migration-report.json` (machine-readable). Planner picks.
- **Native-mode migration command flag shape:** `--target jj --native`, `--target jj-native`, or `--mode native` — planner confirms after looking at adjacent CLI shapes.
- **Banner verbosity:** Whether `/gsd-new-project` prints `Detected jj repo — using jj backend` on greenfield auto-select stays planner's call (cosmetic; low risk).
- **Plan splits within Phase 6:** likely 3-4 plans (greenfield gate edits to new-project workflow; rewriter library + tests; migration command + integration tests; BROWN-01 dogfood + BROWN-02 rebase retro). Planner picks exact splits.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before researching or planning.**

### Project / Phase Scope
- `.planning/PROJECT.md` — Project framing, core value, key decisions
- `.planning/ROADMAP.md` Phase 6 entry (lines 175-200ish) — 7 locked success criteria + 3 remaining open questions (colocated A3 requirement; banner verbosity; rewriter resilience under unrelated VCS errors)
- `.planning/REQUIREMENTS.md` — BROWN-01, BROWN-02 rows for Phase 6

### Phase 3 D-17 / D-18 / D-19 / D-20 (sticky adapter, migration command, format tracker, surface inventory)
- `.planning/phases/03-jj-backend-core-squash-refs-conflict/03-CONTEXT.md` — D-17 sticky `vcs.adapter` decision; D-18 future migration phase planning; D-19 format-migration tracker spec; D-20 surfaces inventory
- D-19's `<format_migration_tracker>` block in 03-CONTEXT.md is the **work backlog** for SC #3's rewriter (all listed surfaces need rewrite paths)

### Phase 5 D-31 (BROWN deferral rationale)
- `.planning/phases/05-command-translations-brownfield-validation-ci-hardening/05-CONTEXT.md` — D-31 (defer BROWN-01/02 to Phase 6 because rewriter + adapter flip are inseparable), D-32 (A3 colocated hook fix that Phase 6's greenfield jj-default depends on), D-33 (no `vcs.adapter == 'jj'` runtime conditionals — anti-pattern guard Phase 6 must preserve)

### Existing wiring (read before touching)
- `sdk/src/vcs/index.ts:49-57` — current `vcs.adapter` read path from `.planning/config.json`; Phase 6 writers MUST go through this surface, not raw fs reads, so unset/absent semantics stay consistent
- `sdk/src/vcs/parse/jj-id.ts` — change_id ↔ commit_id runtime translators (Phase 3 parse layer); the rewriter consumes these for both directions of D-01's resolution
- `sdk/src/vcs/backends/jj.ts` — jj-specific verb implementations; SC #5's dogfood validation exercises these end-to-end
- `get-shit-done/workflows/new-project.md:108-112` — upstream's silent `git init` fallback that SC #7 explicitly replaces

### Session memory (encoded prior turns)
- `~/.claude/projects/-Users-LoganDark-Documents-Projects-get-shit-done/memory/project_migration_boundary.md` — user-locked rule: `.jj/` is the detection signal not jj-installed; brownfield never auto-mutates; empty-dir requires explicit flag

</canonical_refs>

<specifics>
## Specific Ideas

- The rewriter's "best-effort ancestor" walk should use the source-VCS's ancestry graph, not a heuristic. On git→jj: `git rev-list <orphan-sha>..HEAD` (or equivalent first-parent walk) to find an ancestor that maps. On jj→git: `jj log -r '<orphan-cid>::'` to find ancestors with git_commit_id set.
- "Direct children" in the migration report = immediate descendants of the resolved-ancestor in the target VCS's DAG (e.g., for git→jj rewrite, list the jj change_ids whose first parent is the ancestor's change_id). For merge-y graphs this is multi-valued; the report shows all direct children.
- Sample report row shape (placeholder; planner finalizes):
  ```
  | file:line | original | resolved-ancestor | direct-children of ancestor |
  |---|---|---|---|
  | .planning/STATE.md:142 | abc123def | jjxyz (was 5 commits ahead) | jja1, jjb2, jjc3 |
  ```
- `vcs.adapter` absent in `config.json` is interpreted as `git` per Phase 3 D-17 (already wired). Phase 6 does NOT need to add a default-fill migration — the absence semantics already work.
- BROWN-02 first weekly rebase retro: short markdown file at `.planning/intel/rebase-log.md` capturing date, conflict count, brief retro notes. Single entry to start; format becomes a per-week journal if useful long-term.

</specifics>

<deferred>
## Deferred Ideas

*(Items raised during discuss-phase that are out of scope or belong to later phases.)*

- **Inverse migration (jj→git→jj) idempotency tests beyond the rebase scenario** — the canonical "rebase between flips" case is in scope per BROWN-02. Other round-trip permutations (abandon between flips, fork between flips, etc.) are nice-to-have but not v1; planner can include or defer based on time budget.
- **Migration command --dry-run flag** — would show the planned rewrites without applying. Useful for safety, but adds surface area. Defer to v2 unless planner sees an easy implementation.
- **Per-file migration scope override** — e.g., `/gsd-migrate-vcs --target jj --only .planning/STATE.md` for partial migrations. No real use case yet; defer.
- **Cross-VCS conflict detection at migration time** — e.g., warn if migrating to jj when the user has unresolved git merge conflicts. Probably handled by the existing adapter-level conflict detection (Phase 3 CONFLICT-01..03); the rewriter just refuses to run if `vcs.status()` reports conflicts. Planner confirms.

</deferred>

---

*Phase: 06-brownfield-jj-migration-sticky-vcs-adapter-flip-planning-sha*
*Context gathered: 2026-05-14 via /gsd-discuss-phase 6 (4 gray areas locked: D-01..D-04; D-05 = follow-on)*
