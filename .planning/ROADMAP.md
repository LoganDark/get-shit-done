# Roadmap: GSD jj-port

**Mode:** standard
**Created:** 2026-05-09
**Last milestone opened:** 2026-05-14 (v1.2 — jujutsu is change-only — never commit id anywhere)

## Overview

Port GSD from a git-only toolkit to a dual-backend (git + jj) toolkit while preserving full upstream feature parity. v1.0 + v1.1 shipped both backends and every structural verb. v1.2 closes the remaining identity-contract gap: the cross-backend `VcsAdapter` exposes ONE concept of "a revision" — `commit_id` on git, `change_id` on jj — and the jj backend never volunteers `commit_id` from any cross-backend verb. SEED-001's escape-hatch idea is inverted: `commit_id` leakage from jj is treated as a defect and audited toward zero.

## Milestones

- ✅ **v1.0 MVP** — Phases 1, 2, 2.1, 3, 03.1, 4, 5, 6 (shipped 2026-05-14) — see `.planning/MILESTONES.md`
- ✅ **v1.1 first upstream sync** — Phase 7 (shipped 2026-05-14) — see `.planning/milestones/v1.1-ROADMAP.md`
- 🚧 **v1.2 jujutsu is change-only — never commit id anywhere** — Phase 8 (opened 2026-05-14)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1, 2, 2.1, 3, 03.1, 4, 5, 6) — SHIPPED 2026-05-14</summary>

- [x] **Phase 1: Adapter Foundation + Git Backend** — VcsAdapter interface, git-only 1:1 backend, parameterized test harness, no-raw-git lint guard. (5/5 plans, completed 2026-05-09)
- [x] **Phase 2: Bulk Call-Site Migration (Still Git-Only)** — Every `execSync('git …')` in `sdk/src/query/*.ts` and `bin/lib/*.cjs` migrated to the adapter. (12/12 plans)
- [x] **Phase 2.1 (INSERTED): VCS Abstraction Audit — Drop Git-Only Concepts** — Reshape cross-backend surface; `expr.commit` → `expr.rev`, `currentBranch` → `currentBookmarks`, gitDir/gitCommonDir → `gitOnly` namespace. (9/9 plans)
- [x] **Phase 3: jj Backend Core — Squash, Refs, Conflict** — `sdk/src/vcs/backends/jj.ts` implementing every adapter contract verb (jj-colocated CI lane as allow-failure). (7/7 plans, completed 2026-05-12)
- [x] **Phase 03.1 (INSERTED): make tests run faster** — vitest parallelism baseline + L1/L2 levers + final ratio recorded. (5/4 plans)
- [x] **Phase 4: Workspaces + Octopus Structure + Hooks** — `vcs.workspace.{add,forget,prune,reap}` bodies + `acquireJjWriteLock` RAII + lazy octopus helpers + pre-commit/pre-push hook wiring + SDK `hooks.fire` bridge. (7/7 plans, completed 2026-05-13). Known gap: A3 colocated pre-commit (carries past v1.2).
- [x] **Phase 5: Command Translations + Brownfield Validation + CI Hardening** — Every upstream command verified end-to-end on jj; workflow markdown and agent prompts rewritten; CI matrix graduates jj-backend to required-blocking. (8/5 original + 3 gap-closure plans)
- [x] **Phase 6: Brownfield jj Migration** — Sticky `vcs.adapter` flip + `.planning/` SHA→change_id rewriter + `/gsd-migrate-vcs` command + dogfood validation. (4/4 plans)

</details>

<details>
<summary>✅ v1.1 first upstream sync (Phase 7) — SHIPPED 2026-05-14</summary>

- [x] **Phase 7: Reconcile fork capabilities with upstream** — 8 new VcsAdapter verbs (VCS-08..VCS-15 — currentBookmarksIn, mergeBase, diff{diffFilter}, status{cwd}, workspace.merge with atomic main-advance, workspace.remove, bookmarks.delete{force}, readBlob); wave-cleanup executor wired through them; raw-git workflow .md fallbacks deleted; github-release-notes.cjs migrated to cross-backend; strict-green test triage on both backends. (5/5 plans). Full details: `.planning/milestones/v1.1-ROADMAP.md`.

</details>

### 🚧 v1.2 jujutsu is change-only — never commit id anywhere (In Progress)

**Milestone Goal:** The cross-backend `VcsAdapter` exposes ONE concept of "a revision." Workflows always work with revisions and never know or care what shape the revision has under the hood — `commit_id` on git, `change_id` on jj. The fact that jj also has `commit_id`s is a backend-internal detail that NEVER crosses the adapter boundary. The jj backend never volunteers a `commit_id` from any cross-backend verb. **Phase-level invariant:** the cross-backend `vcs.*` namespace exposes ONE revision concept; `commit_id` leakage from jj is a defect (inversion of SEED-001).

- [x] **Phase 8: Unified Revision Model — Audit → Test-Prep → Flip → Lint Guard → Close-Gate** — Audit every `commit_id`-reachable site in production + tests + workflow prose; introduce `expectIdShape` matcher up-front; flip the 7 jj template sites + rename `LogEntry.hash`/`CommitResult.hash` → `.id`; ship `lint-vcs-no-commit-id.cjs` parallel to existing raw-git guard; delete `vcs.kind`-branching for id reasons; close-gate `.planning/` rewriter pass extending Phase 6 B-07. (completed 2026-05-15)

## Phase Details

### Phase 8: Unified Revision Model — Audit → Test-Prep → Flip → Lint Guard → Close-Gate
**Goal**: The cross-backend `VcsAdapter` exposes ONE revision concept; `commit_id` leakage from jj is treated as a defect, audited to zero, and architecturally enforced. The jj backend never volunteers `commit_id` from any cross-backend verb.
**Depends on**: Phase 7 (v1.1 close-gate posture — VCS-08..15 verbs landed; strict-green on both backend lanes; PROMPT-04 raw-git deletion pattern established for PROMPT-05 to continue)
**Requirements**: AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04, FLIP-01, FLIP-02, FLIP-03, FLIP-04, LINT-01, LINT-02, LINT-03, PROMPT-05, TEST-12, MIGR-06
**Success Criteria** (what must be TRUE):
  1. `.planning/intel/id-namespace-audit.md` exists with every `commit_id` template, `.commit_id` field access, `LogEntry.hash`/`CommitResult.hash` consumer, hex-shape regex, and `(...).slice(0, 7|8|12)` site in `sdk/src/`, `get-shit-done/bin/lib/*.cjs`, `scripts/`, `sdk/src/vcs/__tests__/`, `tests/__tools__/`, workflow `.md` files, and `.planning/` prose classified via the closed verdict enum (`safe` / `flip-clean` / `needs-rename` / `needs-resolveShort` / `boundary-io` / `historical-prose` / `unclear`); the jj 0.41 NDJSON `change_id` schema probe (Risk 4) is recorded green. (AUDIT-01..04)
  2. Every cross-backend verb on the jj backend returns `change_id`, never `commit_id` — verified by: the 7 template flips in `sdk/src/vcs/backends/jj.ts` (lines 222-227, 946, 965, 978) + 3 NDJSON parser flips (`parse/jj-log.ts`, `parse/jj-workspace-list.ts`, `parse/jj-bookmark.ts`); `LogEntry.hash` hard-renamed to `LogEntry.id` (no alias) with all ~27 consumers swept; `CommitResult.hash` hard-renamed to `CommitResult.id` (no alias) with the underlying `jj.ts:222-227` post-squash hash probe template flipped from `commit_id` to `change_id` (resolves research Gap 1: SEED-001's claim that `vcs.commit() → CommitResult.hash` was already-correct is incorrect — this phase fixes it); PITFALL 1 doc at `jj.ts:327` inverted from negative-contract to positive-contract; ADRs and JSDoc updated. (FLIP-01..04)
  3. `expectIdShape(kind, value)` custom matcher exists in `tests/__tools__/` and is in use BEFORE FLIP-02/03 land; the cross-backend `expect(gitResult).toEqual(jjResult)` assertions identified by AUDIT-03 (~10-20 sites) all use the new matcher or per-backend fixtures; golden-parity baselines re-recorded via `tests/__tools__/capture-vcs-baselines.cjs`; strict-green on both backend lanes (no skip-count regressions vs v1.1 baseline). (TEST-12)
  4. `scripts/lint-vcs-no-commit-id.cjs` ships parallel to `scripts/lint-vcs-no-raw-git.cjs` with default-deny patterns (`'commit_id'` literals, `.commit_id` field accesses, hex-shape regexes, 40-char hex string literals); per-entry allowlist schema enforces `reason` + `expires` + `owner` fields and CI-fails on missing fields or expired entries; first green run of the lint is the validation that the FLIP is complete (achievable only AFTER FLIP-01..03 land); CI step required-blocking on jj-colocated lane. **LINT-03 conditional:** if AUDIT-01/02 identify a real boundary-I/O consumer, `sdk/src/vcs/backends/jj-internal.ts` exists with a lint rule whole-repo default-denying its imports except an audit-identified allowlist (CI fails on >1 importer); if AUDIT identifies ZERO consumers, the requirement closes by codifying "no boundary-I/O accessor exists" as the verified end state — the inversion of SEED-001 holds. (LINT-01..03)
  5. Every `if (vcs.kind === 'jj') { /* commit_id branch */ } else { /* commit_id branch */ }` block in `get-shit-done/bin/lib/*.cjs` and `get-shit-done/workflows/*.md` that exists *for id reasons* (driven by AUDIT-04) is deleted and replaced with the unified `vcs.refs.resolveShort(expr.rev(...))` / `commitResult.id` / `entry.id` access; the deletions land AFTER FLIP-01..03 (so the unified API exists to delete toward) and AFTER AUDIT-04 surfaces the candidate sites; `vcs.kind` branching for non-id reasons (capability gaps, allowlist resolution) remains unaffected. (PROMPT-05)
  6. Phase-boundary-marker dogfood-cutover model holds: commits made BEFORE the FLIP plan lands carry `commit_id`-shape ids in `.planning/` (still resolvable on jj); commits AFTER FLIP carry `change_id`-shape ids; at v1.2 close-gate, a SINGLE B-07-style rewriter pass over `.planning/phases/<v1.2-dir>/` normalizes the directory to change_id; `format-migration/rewrite.ts` `COMMIT_KEY_ALLOWLIST` extended with any new commit-bearing keys discovered by AUDIT-04 in `.planning/` formats added during v1.0+v1.1; one-time grep at close-gate confirms prose hex tokens are historical-only. (MIGR-06)
**Plans**: 3 plans
- [x] 08-01-PLAN.md — Audit + lint script development (wave 1; Plan 1)
- [x] 08-02-PLAN.md — Test-prep matcher + FLIP-01..04 + consumer sweep + golden re-record (wave 2; Plan 2 depends on Plan 1)
- [x] 08-03-PLAN.md — Lint activation + PROMPT-05 + LINT-03 conditional + MIGR-06 close-gate rewriter pass (wave 3; Plan 3 depends on Plan 1 + Plan 2)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 2.1 → 3 → 03.1 → 4 → 5 → 6 → 7 → 8

| Milestone | Phases | Plans | Status      | Shipped     |
|-----------|--------|-------|-------------|-------------|
| v1.0 MVP  | 8      | 53/56 | Complete    | 2026-05-14  |
| v1.1 first upstream sync | 1 | 5/5 | Complete | 2026-05-14 |
| v1.2 jujutsu is change-only — never commit id anywhere | 1 | 0/3 | Planning | — |

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 8. Unified Revision Model | v1.2 | 3/3 | Complete   | 2026-05-15 |

## Next

`/gsd-execute-phase 8` to execute Phase 8's 3 plans in wave order (Plan 1 → Plan 2 → Plan 3).

---
*Last updated: 2026-05-15 — v1.2 Phase 8 decomposed into 3 sequential plans per RESEARCH.md recommendation. Plan 1 (wave 1): Audit + lint script development. Plan 2 (wave 2): Test-prep matcher + FLIP-01..04 + ~12 production / ~11 test consumer sweep + golden re-record. Plan 3 (wave 3): Lint CI activation + PROMPT-05 invariant verification + LINT-03 conditional close + MIGR-06 close-gate rewriter pass. All 14 v1.2 requirements covered across plans; all 5 D-IDs referenced.*
