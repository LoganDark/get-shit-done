# Phase 5: Command Translations + Brownfield Validation + CI Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-13
**Phase:** 05-command-translations-brownfield-validation-ci-hardening
**Areas discussed:** Phase decomposition, A3 colocated pre-commit fix, PROMPT rewrite vocabulary, Brownfield dogfood mechanism, CMD-10 test depth, MIGR-02 carry-over, CI-03 graduation gate, PROMPT-03 multi-runtime sync

---

## Phase decomposition

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid tiered (~5-6 plans) | P1 foundational infra (A3 fix + hooks.fire consumers + MIGR-02 fold-in); P2 daily-driver; P3 lifecycle; P4 brownfield + BROWN-01 dogfood; P5 CI graduation + PROMPT-03 spot-check + BROWN-02 rebase. Each plan ships a usable slice. | ✓ |
| Vertical per-command (~11 plans) | One plan per CMD-XX, bundles prompt rewrite + integration test + dogfood check. Max cohesion. | |
| Horizontal per-workstream (~4 plans) | P1 all PROMPT rewrites; P2 all CMD tests; P3 brownfield; P4 CI. Parallel but tests can't validate rewrites until commands work — risk of dead prompts. | |
| Other | Different shape. | |

**User's choice:** Hybrid tiered (~5-6 plans)
**Notes:** Recommendation accepted as the starting shape. BROWN-01 / BROWN-02 components later removed from this slicing per the BROWN deferral below; the resulting 5-plan recommendation is locked in CONTEXT.md D-38.

---

## A3 colocated pre-commit fix

| Option | Description | Selected |
|--------|-------------|----------|
| Path 1: always-fire + env override | Adapter fires pre-commit on every commit regardless of colocation. `GSD_HOOK_SKIP_COLOCATED` env var escape hatch. Phase 4's own recommendation. | ✓ |
| Path 2: probe-once cache at adapter init | On createVcsAdapter() write a temp hook, probe whether jj fired it, cache result. More robust to upstream behavior change. | |
| Path 3: defer to upstream v2 (status quo) | Document as v1 known-issue. Risk: brownfield dogfood runs WITHOUT pre-commit. | |
| Other | Different shape. | |

**User's choice:** Path 1 (always-fire + env override)
**Notes:** Phase 4 LEARNINGS' explicit recommendation; rationale (cheapest correctness recovery; hooks must be idempotent) reaffirmed. Captured as CONTEXT D-32; Phase 4 D-10 colocated no-op is retired.

---

## PROMPT rewrite vocabulary

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid: agnostic prose + SDK for mutations | Prose stays VCS-neutral; mutations route through `gsd-sdk query <verb>` / `bin/gsd <subcommand>`. Reads can stay as adapter calls. Lowest upstream-rebase conflict surface. | ✓ |
| Pure SDK-mediated everywhere | ALL execution funnels through SDK queries (reads and writes). Most uniform; needs SDK verbs for status/log/diff. | |
| Backend-aware conditionals | Every git command becomes `if git: … if jj: …`. Doubles prompt length; UPSTREAM-02 sidecar rule violated. | |
| Other | Different shape. | |

**User's choice:** Hybrid (agnostic prose + SDK for mutations)
**Notes:** Captured as CONTEXT D-33. If a needed SDK verb doesn't exist, the plan adds it before rewriting the consumer.

---

## Brownfield dogfood mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Env override + git sibling comparison | `GSD_VCS_ADAPTER=jj <cmd>` per-invocation on this repo + jj-cloned sibling as comparison anchor. | |
| Persistent branch flip | Branch `dogfood/jj`, set `vcs.adapter: jj` in `.planning/config.json`, exercise commands, discard. | |
| Pure sibling jj-only clone | `jj git clone --colocate ../get-shit-done-jj-dogfood`; treat clone as primary dogfood. | |
| Other | Different shape. | ✓ |

**User's choice:** "we must not use the jj backend on this repo until the jj backend is complete. Once the jj backend is complete, we must migrate this repo's planning to use jj change ids rather than git commit ids or else the references will be lost."
**Notes:** Significant pushback. The user surfaced that any of the four offered options that touch THIS repo's jj backend would orphan `.planning/` commit-id references — those references can only survive once the `.planning/` SHA → change_id rewriter (Phase 6) has run. Followed up with a substrate question (next section).

---

## Brownfield substrate (follow-up after pushback)

| Option | Description | Selected |
|--------|-------------|----------|
| Sibling jj-only clone of this repo | Clone via `jj git clone --colocate ../get-shit-done-jj-dogfood`. Closes BROWN-01 without touching this repo's adapter. | |
| Synthetic minimal jj-only fixture | Reproducible jj repo built on the fly. CI-friendly; misses real-history complexity. | |
| Sibling clone + CI synthetic fixture (both) | Highest coverage; more infra. | |
| Defer BROWN-01/02 to Phase 6 | Acknowledge that "this repo's jj backend" brownfield validation literally requires the Phase 6 flip + rewriter. | ✓ |

**User's choice:** Defer BROWN-01 / BROWN-02 to Phase 6
**Notes:** Phase 6 absorbs the literal "brownfield commands verified against this repo's jj backend" + "first weekly upstream rebase recorded after brownfield validation" scope alongside the sticky-adapter flip + `.planning/` SHA → change_id rewriter it already owns. Phase 5 retains CMD-01..11, PROMPT-01..03, CI-03. Captured as CONTEXT D-31. ROADMAP.md success criterion #3 and REQUIREMENTS.md BROWN row buckets need amendment downstream (deliberately tasked to the planner in Plan 0 or Plan 1; not done in this discuss step).

---

## CMD-10 brownfield test depth

| Option | Description | Selected |
|--------|-------------|----------|
| Standard CMD-10 gate + document gap | Synthetic-fixture integration tests per command; explicit note in CONTEXT/LEARNINGS that real-history dogfood is Phase 6. | ✓ |
| Deep gate: multi-phase fixture | Synthetic fixture mimicking this repo's planning-state complexity. Tighter coverage; more fixture infra. | |
| Standard gate, no special note | Treat brownfield CMD-10 like every other CMD-* test gate. | |
| Other | Different approach. | |

**User's choice:** Standard CMD-10 gate + document gap
**Notes:** Captured as CONTEXT D-34. Phase 5 LEARNINGS must explicitly call out the coverage gap so Phase 6 doesn't inherit a false sense of CMD-10 completeness.

---

## MIGR-02 carry-over (6 cjs files)

| Option | Description | Selected |
|--------|-------------|----------|
| Opportunistic per-file fold-in | Each Phase 5 plan that touches a cjs file completes that file's adapter migration in the same commit set. | ✓ |
| Dedicated MIGR-02 sweep in Plan 1 | Plan 1 batch-migrates all 6 cjs files. Cleaner closure; parallel-touches = rebase risk. | |
| Defer to Phase 6 migration | Move MIGR-02 closure into Phase 6. | |
| Other | Different approach. | |

**User's choice:** Opportunistic per-file fold-in
**Notes:** Captured as CONTEXT D-35. Each plan SUMMARY lists which cjs files it completed. Phase 5 close asserts MIGR-02 fully checked off; planner sweeps any untouched files in Plan 5.

---

## CI-03 graduation gate

| Option | Description | Selected |
|--------|-------------|----------|
| Fix-specific-flakes then N consecutive greens | Land fixes for the Phase 4 LEARNINGS-cited flakes; require 10 consecutive green nightly runs across both lanes; flip. | ✓ |
| Calendar/Phase-close gate | Hand-flip at Phase 5 close after 2-week stabilization window. | |
| N consecutive greens only | Pure quantitative — 10 consecutive greens, flip. | |
| Other | Different approach. | |

**User's choice:** Fix-specific-flakes then N consecutive greens
**Notes:** Captured as CONTEXT D-36. Soak metric tracked under `.planning/intel/` (planner picks filename). Identified flake sources: concurrency contention + fixture-tmpdir contention (Phase 4 LEARNINGS).

---

## PROMPT-03 multi-runtime sync

| Option | Description | Selected |
|--------|-------------|----------|
| Trust installer | Write canonical Claude markdown VCS-agnostic; rely on `bin/install.js` transform pipeline (15+ runtimes). No per-runtime test infra added in Phase 5. | ✓ |
| Spot-check 2-3 runtimes | Install for OpenCode + Codex + Gemini at phase close, smoke-test. | |
| Full per-runtime matrix in CI | Per-runtime smoke jobs in CI for common runtimes. | |
| Other | Different approach. | |

**User's choice:** Trust installer
**Notes:** Captured as CONTEXT D-37. The installer is battle-tested upstream and `gsd-sdk query <verb>` shell commands work across every runtime that can invoke bash. Per-runtime smoke testing remains an upstream-installer concern.

---

## Claude's Discretion

Planner / executor judgment items captured in CONTEXT.md `### Claude's Discretion`:
- Exact plan boundaries inside the hybrid-tiered shape (D-38 is a starting recommendation, not a contract).
- Where ROADMAP / REQUIREMENTS amendments land (Plan 0 vs Plan 1).
- MIGR-02 ordering inside each plan that touches a cjs file.
- Synthetic-fixture shape for brownfield CMD-10 tests.
- SDK verb additions needed mid-rewrite (naming + placement).
- Flake-fix mechanism for D-36 step 1 (serialize tests, dedicated tmpdir factory, etc.).
- Soak-window bookkeeping file location and shape.
- `/gsd-pr-branch` revset expression for `.planning/`-only filtering.
- `/gsd-hotfix` `<id>` format inside the locked `gsd/hotfix/<id>` bookmark shape.
- Whether to extend the no-raw-git lint guard to cover `*.md` files in Phase 5 or defer.
- Whether to spot-check one runtime install at phase close (not a gate).

## Deferred Ideas

- BROWN-01 / BROWN-02 — re-bucketed to Phase 6 per D-31 (this is the headline deferral).
- Cross-workspace `vcs.acquireRepoLock` primitive — Phase 4 D-20 stance held.
- HOOK-05 Tier 2 PATH-shim wrapper — v2.
- Per-runtime smoke matrix beyond trust-installer — revisit on regression.
- Full doc-only no-raw-git lint sweep for `*.md` — planner's discretion this phase or next.
- Crash queue YAML frontmatter (Phase 4 D-13) — v2.
- 30s lock-acquisition timeout tuning (Phase 4 D-28) — revisit with dogfood metrics in Phase 5/6.
