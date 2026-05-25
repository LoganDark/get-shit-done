# Phase 17: Drift control + reconciliation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-25
**Phase:** 17-drift-control-reconciliation
**Areas discussed:** B1 raw-git regression scope, ARCHITECTURE.md en/translation scope, Test contract surface, Theme 8 + INVENTORY interaction, Wave ordering

---

## Gray Area Selection

Four areas presented; user selected all four for discussion.

| Area | Selected |
|------|----------|
| B1 raw-git regression scope | ✓ |
| ARCHITECTURE.md en/translation scope | ✓ |
| Test contract surface | ✓ |
| Theme 8 + INVENTORY interaction | ✓ |

A fifth area (wave ordering) was surfaced after the four substantive ones resolved, as a confirmation question.

---

## B1 raw-git regression scope

`scripts/audit-workflow-raw-git.cjs` reports FAIL with 2 regressions, both prose mentions:
- `execute-phase.md:558` — comment introduced by Phase 14.1 PARALLEL-08
- `plan-phase.md:1696` — error-message hint

v1.4-MILESTONE-AUDIT.md flagged as BLOCKER B1; no requirement currently owns it.

| Option | Description | Selected |
|--------|-------------|----------|
| Fold into Phase 17 | Add 5th plan reverting prose mentions; PARALLEL-08 closure inside v1.4 | |
| Leave for Phase 18 | Audit's #1 recommendation; insert closure plan into Phase 18 | |
| Quick task NOW, before Phase 17 | `/gsd-quick` to fix both lines; Phase 17 starts from clean audit state | ✓ |
| Bump baseline at `audit-workflow-raw-git.cjs:76` | Audit's #2 (lowest cost); weakens regression guard | |

**User's choice:** Quick task NOW, before Phase 17.
**Notes:** Phase 17 starts from clean audit state. Operator runs `/gsd-quick` (or equivalent atomic commit) to revert the 2 prose mentions before `/gsd-plan-phase 17`. If quick task is skipped, plan-phase MUST surface as HARD blocker (recorded as Q-01 in CONTEXT.md).

---

## ARCHITECTURE.md en/translation scope (en source pattern)

The one remaining live en-source drift point: `docs/ARCHITECTURE.md:599` — `~10,700 lines` stale (actual `bin/install.js` = 10,978).

| Option | Description | Selected |
|--------|-------------|----------|
| Defer to INVENTORY.md (consistent with :121/:143 pattern) | Rewrite to "see INVENTORY.md"; removes drift surface from en source | |
| Update inline + drift test asserts exact count | Update to "~10,978 lines"; test asserts numeric equality | |
| Update inline + drift test asserts rounded bucket | Update to "~11,000 lines"; test asserts rounded form (nearest 1000) | ✓ |

**User's choice:** Update inline + drift test asserts rounded bucket.
**Notes:** Keeps "approximate" prose convention; tolerates incidental installer churn; test catches large drift. Exact rounding mechanism (nearest 100 / 1000 / tolerance range) is planner discretion. Recommended: nearest 1000.

## ARCHITECTURE.md en/translation scope (locale strictness)

| Option | Description | Selected |
|--------|-------------|----------|
| All-strict on all 4 locales (en + ja-JP + ko-KR + pt-BR) | Day-1 GREEN because Wave 1 fixes all 4 atomically; future translator must update all 4 together | ✓ |
| En-strict + translations-advisory | Translations get a separate warn-only test; acknowledges "translations naturally lag" | |
| All-strict but Wave 1 does the full sync (no advisory) | Same as option 1 with explicit policy framing in CONTEXT.md | |

**User's choice:** All-strict on all 4 locales.
**Notes:** Wave 1 (17.01) fixes prose in all 4 locales atomically per Pitfall 4. Translations stay in lockstep with en going forward. Recorded as a deliberate policy choice (D-04) so future contributors don't soften to translation-advisory mode without fresh decision.

---

## Test contract surface (scope)

| Option | Description | Selected |
|--------|-------------|----------|
| Translations only — inventory-counts covers en+INVENTORY | architecture-counts asserts ja-JP/ko-KR/pt-BR; minimal new surface | |
| All 4 locales — architecture-counts is the locale parity guard | Belt-and-suspenders; explicit per-locale describe blocks | ✓ |
| Translations + installer LOC — narrow new surface | Translations across all 5 dimensions + en installer LOC only | |

**User's choice:** All 4 locales — architecture-counts is the locale parity guard.
**Notes:** Per-locale describe blocks in test file. Duplication with `inventory-counts.test.cjs` on en side accepted for explicit per-locale guard.

## Test contract surface (prose extraction)

| Option | Description | Selected |
|--------|-------------|----------|
| Per-locale exact-string match (en pattern + per-translation regex) | Each locale gets hardcoded regex set in test fixtures | ✓ |
| Bilingual label table + single regex shape | Centralized locale→label table; cleaner DRY | |
| Skip line-by-line regex — assert INVENTORY only + en-defers-substring | Strictly weaker; doesn't lock translations to filesystem | |

**User's choice:** Per-locale exact-string match.
**Notes:** Test fixtures grow per locale but are deterministic. Locale labels live in test code as regex constants. New locales added by extending the regex set.

---

## Theme 8 — mutation-subprocess.integration.test.ts

`CHANGELOG.md:389` references a file that doesn't exist anywhere in the repo (verified via `find` during discuss).

| Option | Description | Selected |
|--------|-------------|----------|
| Plan-phase / researcher searches for renamed file; rewrite or remove based on finding | Decision deferred to research/execution | ✓ |
| Remove the claim from CHANGELOG.md | Strip the file name from the parenthetical | |
| Append-only correction note (mirror Theme 3 ADR pattern) | "## Update YYYY-MM-DD" note with closure change_id | |

**User's choice:** Plan-phase / researcher searches for renamed file; rewrite or remove based on finding.
**Notes:** Researcher performs archaeology via `git log -S 'mutation-subprocess'` + filename-rename search. If renamed file found → path rewrite in CHANGELOG. If truly deleted → remove the specific file name from the parenthetical (keeping surrounding bullet intact, per CHANGELOG-as-historical-record convention). Append-only correction note reserved as fallback if rename found but can't be cleanly back-patched.

## Theme 8 — INVENTORY.md edit when 17.02 lands

INVENTORY.md L9/L59 self-reference the new drift tests. When 17.02 ships, the claims become true.

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-resolves — no separate edit | L9/L59 claims become true at 17.02 land; Theme 6 closes by 17.02 alone | |
| Add new rows to INVENTORY.md tests section | If a "Tests (N shipped)" family exists, add rows + increment headline | |
| Defer to plan-phase to inspect INVENTORY.md structure | Don't pre-decide; let plan-phase examine and pick | ✓ |

**User's choice:** Defer to plan-phase to inspect INVENTORY.md structure.
**Notes:** Plan-phase inspects whether INVENTORY.md has a Tests inventory family today. inventory-counts.test.cjs FAMILIES = Agents, Commands, Workflows, References, CLI Modules, Hooks — Tests is NOT currently tracked. CONTEXT.md flags this question; plan-checker enforces. CONTEXT.md notes the auto-resolve path as the minimal-surface recommendation, but binding decision is plan-phase's.

---

## Wave Ordering (confirmation)

After 17.01 lands, do 17.02 + 17.03 need to be sequential or can they run in parallel?

| Option | Description | Selected |
|--------|-------------|----------|
| Strict sequential 1 → 2 → 3 → 4 | Per ROADMAP "Plans" field; each wave commits before next | ✓ |
| 1 → (2 || 3) → 4 | 17.02 + 17.03 parallel after 17.01; 17.04 LAST per IP-4 | |
| Defer to plan-phase | Plan-checker decides based on plan internals | |

**User's choice:** Strict sequential 1 → 2 → 3 → 4.
**Notes:** parallelization is OFF on this repo. Pitfall 4 same-PR coupling between 17.01 + 17.02 satisfied. Predictable commit order helps milestone-close audit traceability.

---

## Audit-corrected during discuss (not formal gray areas, but recorded)

- **Theme 4 `verify-reapply-patches.cjs`** — todo says "rebuild or remove claim"; verified during discuss that file EXISTS at `get-shit-done/bin/verify-reapply-patches.cjs` (moved per `.changeset/jolly-newts-roam.md` issue #2994). Fix is path-rewrite in `CONTRIBUTING.md:403` + `CHANGELOG.md:346`. NOT a gray area; recorded as D-01 self-resolved.
- **English ARCHITECTURE.md:181** — Pitfall 4 listed `Total agents: 33` as drift; verified during discuss that en says 33 and actual is 33 (filesystem `agents/gsd-*.md` = 33). NOT a drift point in en source; translations are still drifted. Recorded as D-02.
- **zh-CN ARCHITECTURE.md** — REQUIREMENTS.md DRIFT-01 lists zh-CN; ROADMAP SC1 says zh-CN does NOT exist; filesystem confirms ROADMAP. REQUIREMENTS.md DRIFT-01 text is itself drift, candidate for amendment at v1.4 close (post Phase 18). Test scans 4 locales only (en + ja-JP + ko-KR + pt-BR). Recorded as CF-04.
- **`bin/install.js` canonical path** — REQUIREMENTS.md mentions `bin/install.js` and `get-shit-done/bin/install.js` inconsistently. Filesystem truth: `bin/install.js` (10,978 lines). Recorded in canonical_refs.

---

## Claude's Discretion

Planner-level details NOT pinned at discuss-phase:

- Exact rounding mechanism for installer-LOC drift assertion (nearest 1000 recommended)
- Exact regex form for per-locale prose extraction (parameterized label per locale recommended)
- Whether 17.04's machine truth-source is a permanent script vs inline researcher computation
- INVENTORY.md Tests-family decision (deferred to plan-phase per user pick)
- Theme 8 mutation-subprocess archaeology approach (researcher discretion)
- Whether 17.03 commits all 7 themes separately or groups closely-related ones
- Whether DOCS-09 close-gate is a separate plan task or final commit within 17.03

---

## Deferred Ideas

Captured in CONTEXT.md `<deferred>` block — not lost:

- Adding a Tests inventory family to INVENTORY.md + `inventory-counts.test.cjs` FAMILIES list (v1.5+ candidate)
- `scripts/reconcile-project-validated.cjs` as a permanent reconciliation script (Plan 17.04 may ship as one-shot inline; permanent script form is v1.5+ candidate)
- Refactoring INVENTORY.md to auto-generate headlines from a manifest (v1.5+)
- Promoting `architecture-counts.test.cjs` to assert AGENTS.md / FEATURES.md / other doc locale-parity (v1.5+)
- Renaming REQUIREMENTS.md DRIFT-01 to drop zh-CN reference (v1.4 close)
- Second `/gsd:docs-update --verify-only` pass after 17.04 PROJECT.md edits to catch reconciliation-introduced drift (Plan-phase may fold into DOCS-09 or call out)
