# Phase 3: jj Backend Core — Squash, Refs, Conflict - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-12
**Phase:** 03-jj-backend-core-squash-refs-conflict
**Areas discussed:** Bookmark advance + gsd/ prefix, WC snapshot policy strictness, Plan structure / sequencing, Test matrix activation, Backend selection stickiness + migration phase scope, Format-migration tracker

**Mode:** advisor (USER-PROFILE.md present; calibration tier = `standard`; non-technical-owner = false)
**Research:** 4 parallel `gsd-advisor-researcher` agents — one per selected gray area; results synthesized into table-first selection.

---

## Bookmark advance on `vcs.commit()`

| Option | Description | Selected |
|--------|-------------|----------|
| A1: Explicit bookmark in CommitInput | Add `CommitInput.bookmark?: string`; adapter advances via `jj bookmark set <name> -r <C> --allow-backwards` | ✓ |
| A2: Auto-detect via tug revset | `heads(::@- & bookmarks())` finds nearest ancestor bookmark; adapter advances it | |
| A4: Hybrid (A1 + single-bookmark fallback) | Optional `bookmark` field; if absent and exactly one bookmark at @-, advance it; else throw | |

**User's choice:** A1 — explicit bookmark in `CommitInput`.
**Notes:** Phase 4's orchestrator will create sibling bookmarks (`gsd/phase-N` + `gsd/phase-N/subagent-M`) that share a revision the moment a subagent starts from phase tip — kills A2/A3 by construction. A1 is minimum-surface lock; A4 can layer on later. Adapter must surface jj's `name??` divergent state as a typed error (`VcsBookmarkDivergentError`).

---

## gsd/ prefix surface contract

| Option | Description | Selected |
|--------|-------------|----------|
| B1: Adapter adds/strips on jj | Caller passes `phase-3`; adapter adds `gsd/` on jj input and strips on jj output; `{raw:true}` escape for non-gsd names | ✓ |
| B2: Caller passes full name verbatim | Caller writes `gsd/phase-3` on jj, `phase-3` on git; no translation | |
| B3: Permissive normalize | Accept either form, canonicalize internally | |

**User's choice:** B1 — adapter owns the prefix bookkeeping.
**Notes:** Matches REFS-04 wording precisely. Strip must be exhaustive across every read path returning bookmark names; pinned by round-trip test.

---

## Working-copy snapshot policy strictness

| Option | Description | Selected |
|--------|-------------|----------|
| (a) Strict everywhere, document the footgun | Adapter never passes `--ignore-working-copy`; document intermediate-snapshot footgun | |
| (b) Strict on writes, allowed internally on pure-reads | Public surface no toggle; backend uses `--ignore-working-copy` internally for reads | |
| (c) Strict everywhere + explicit caller-side escape | Default strict; symbol-gated `vcs.test.readWithoutSnapshot()` escape | |
| (d) Strict everywhere + caller-side pre-probe discipline | Status quo post-2.1 D-06; leverages existing pre-probe pattern; no new API | ✓ |

**User's choice:** (d) — strict everywhere + caller-side discipline.
**Notes:** User reinforced mid-discussion: "never use `--ignore-working-copy` as it can desync the workspace annoyingly." Memory `project_squash_model.md` already locked the BAN; this conversation pinned the *why* (workspace desync, not just freshness). Applies to ALL adapter invocations including reads. Pitfall #2 footgun handled by caller-side pre-probe pattern locked in Phase 2.1 D-06.

---

## Plan structure / sequencing

| Option | Description | Selected |
|--------|-------------|----------|
| (a) Layered by verb group | One verb group per plan, impl+tests paired, trunk-clean throughout (~8-10 plans) | |
| (b) Layered by trust radius | Reads first, writes second (~2-4 coarse plans) | |
| (c) Monolithic backend + tests/CI | One mega-plan lands jj.ts whole | |
| (d) Hybrid: shape commit + verb-group fills | Plan 1 = skeleton + parsers + CI install + matrix activation; subsequent plans fill verbs (~5-7 plans) | ✓ |

**User's choice:** (d) — hybrid shape-commit-first.
**Notes:** Echoes Phase 2.1's proven pattern under D-21's verb-shape-change exception. CI-01 allow-failure on jj-colocated absorbs the stub-throw window — no long-lived branch needed (Phase 3 D-09). Phase 4's orchestrator can compile against the contract from plan 1.

---

## Test matrix activation

| Option | Description | Selected |
|--------|-------------|----------|
| (a) Day-one full matrix, allow-failure | Flip default from plan 1; every test runs both backends; jj failures tolerated | |
| (b) Per-verb activation as it lands | Allowlist per verb-group plan; quiet local until verbs land | |
| (c) End-of-phase flip | Default git-only through impl plans; final plan flips matrix | |
| (d) Two-track: parity always-on, contract opt-in | baseline-parity runs jj-colocated from plan 1; adapter-contract tests per-verb allowlist | ✓ |

**User's choice:** (d) — two-track.
**Notes:** baseline-parity validates CI install + exec wiring at minimal noise from plan 1; adapter-contract tests gate per verb-group via fixture allowlist (throw-not-skip so TEST-06 stays honest). End-of-phase plan flips the allowlist to "all verbs implemented" — natural setup for Phase 5's graduation step.

### Sub-decisions (embedded)

| Sub-decision | Option | Selected |
|---|---|---|
| jj-native lane | Defer to Phase 4 (Phase 3 only adds jj-colocated; TEST-03 slot stays declared-but-empty) | ✓ |
| jj version pin | Pin CI to 0.41 (matches local dev, current latest stable, renovate-bumpable; single-version axis) | ✓ |
| jj version pin (alternative) | Multi-version matrix (e.g., 0.40 + 0.41) | |
| jj version pin (alternative) | Track "latest" with no pin | |
| TEST-08 timing | Per-test, as it surfaces under jj matrix; verdicts logged inline in `docs/test-triage/jj-bugs.md`; finalized by end-of-phase plan | ✓ |
| TEST-08 timing (alternative) | Upfront triage doc before code work | |
| TEST-08 timing (alternative) | Defer to Phase 4 | |

**Notes:** User clarified during follow-up that local jj is 0.41 (STACK.md research had it as 0.40 — repo upgraded since research date). Pin to 0.41.

---

## Backend selection stickiness + migration phase scope

> **Surfaced mid-discussion** when the user asked Claude to track `.planning/` file format changes for the eventual git → jj artifact migration. The conversation expanded into "we should also let downstream users migrate painlessly — store which adapter is in use, default to git even if jj appears, until migration is performed."

| Option | Description | Selected |
|--------|-------------|----------|
| New phase + sticky default in Phase 3 | Phase 3 adds the sticky `vcs.adapter` config field; new dedicated phase implements `/gsd-migrate-to-jj` + rewriter | ✓ |
| Fold migration into Phase 5 | Phase 3 still adds sticky default; migration command lands inside Phase 5's brownfield validation scope (expanded) | |
| Everything in Phase 3 | Phase 3 adds sticky default AND migration command + format rewriter | |
| Defer the sticky default too | Phase 3 keeps VCS-03 as-is (`.jj` first); sticky default + migration command both in new phase | |

**User's choice:** New phase + sticky default in Phase 3.
**Notes:** Phase 3 ships the gate only (D-17 — sticky `vcs.adapter` config field + default git when both present). The `/gsd-migrate-to-jj` command + `.planning/` SHA → change_id rewriter (D-18) lands in a new dedicated phase, suggested slot Phase 4.5 (decimal-insert post-workspaces) or Phase 6 (post-brownfield). ROADMAP insertion happens via `/gsd-phase` before the new phase is planned. Without D-17, the moment the jj backend ships, anyone with `.jj + .git` (including the dogfood repo) auto-flips before they can migrate.

---

## Format-migration tracker

> **Cross-cutting tracker established this conversation.** User instruction: "I need you to keep track of any changes to file formats so that we can migrate all .planning contents to the jj-native format with change ids rather than commit ids, as part of the process of transitioning to dogfooding."

Captured as:
- **Memory:** `project_planning_id_migration.md` (durable across conversations; pointer in `MEMORY.md`)
- **CONTEXT.md:** `<format_migration_tracker>` section with pre-implementation entries for known SHA-encoding surfaces (`.planning/STATE.md`, per-phase SUMMARY/LEARNINGS/REVIEW*/VERIFICATION/PATTERNS prose, gsd-sdk phase manifests, `query commit` outputs); empty net-new-surfaces subsection that each Phase 3 plan appends to as it lands artifacts encoding revision IDs.
- **Decision IDs:** D-19 (tracker is mandatory and inline in CONTEXT.md), D-20 (surfaces already known to record SHAs).

**User's confirmation:** Not gated through AskUserQuestion — surfaced as a user-stated requirement and locked directly. The future migration phase (D-18) consumes this tracker as its work backlog.

---

## Claude's Discretion

Recorded in CONTEXT.md `<decisions>` → `### Claude's Discretion`:
- Plan boundaries within Phase 3 (planner picks splits within D-10 suggested ordering)
- Parser file layout in `sdk/src/vcs/parse/` (jj-log.ts, jj-op-log.ts, jj-workspace-list.ts, jj-id.ts naming)
- `NotImplementedError` class shape
- Sticky preference storage location (`.planning/config.json` vs top-level `.gsd.json`)
- Bookmark divergence error recovery hints (whether `VcsBookmarkDivergentError` carries actionable strings)
- TEST-08 verdict rubric columns

## Deferred Ideas

(Mirror of CONTEXT.md `<deferred>` — preserved here for audit:)
- `/gsd-migrate-to-jj` command + `.planning/` SHA → change_id rewriter (new dedicated phase per D-18)
- A4 hybrid bookmark-advance fallback (revisit if ad-hoc CLI commits surface pain)
- `vcs.jjOnly.commitIdOf(change)` escape hatch (Phase 2.1 D-14 deferred; Phase 3 implements only if real need surfaces)
- `vcs.test.readWithoutSnapshot()` symbol-gated escape (revisit only if pre-probe discipline insufficient)
- jj-native (non-colocated) matrix lane (Phase 4)
- Multi-version jj matrix axis (revisit only if jj 0.41→0.42+ breakage forces back-version support)
- Upfront worktree-bug-test triage doc (rejected per D-16)
- Long-lived feature branch for Phase 3 (rejected per D-09)
- NDJSON schema validation via zod/io-ts (planner's discretion)
- Pre-existing `config-mutation.test.ts:441` failure (deferred maintenance bucket)
- MIGR-04 + UPSTREAM-01 rebase task (deferred to milestone-end)
- REQUIREMENTS.md footer reconciliation (deferred to next major phase transition)
- ROADMAP insertion for the migration phase via `/gsd-phase` (not a Phase 3 deliverable)
