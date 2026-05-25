# Phase 17: Drift control + reconciliation - Context

**Gathered:** 2026-05-25
**Status:** Ready for planning (after precondition Q-01 below)

<domain>
## Phase Boundary

Lock prose claims to filesystem state by shipping two `node:test` drift-control tests; fix the underlying ARCHITECTURE.md prose-count drift across en + 3 translations (ja-JP / ko-KR / pt-BR — zh-CN does NOT exist) BEFORE the tests RED (Pitfall 4 strict ordering); resolve the 45 `/gsd:docs-update --verify-only` failures across 7 docs themes (theme 6 = drift tests = folded into 17.02) via per-theme triage with ADR supersession notes (theme 3) and closure-change-id anchoring (theme 5); reconcile PROJECT.md `### Validated` against MILESTONES.md + per-phase SUMMARYs LAST per IP-4 so v1.4's own REQ-IDs land in the truth source.

**Strict wave structure (locked):**

1. **Wave 1 / 17.01 (DOCS-08)** — ARCHITECTURE.md prose-count fixes across all 4 active locales. MUST commit before 17.02 starts (Pitfall 4 same-PR coupling).
2. **Wave 2 / 17.02 (DRIFT-01, DRIFT-02)** — `tests/architecture-counts.test.cjs` + `tests/command-count-sync.test.cjs`. Day-1 GREEN because Wave 1 fixed drift first.
3. **Wave 3 / 17.03 (DOCS-01..07, DOCS-09)** — 7 themes batched per Pitfall 12 per-theme commits; DOCS-09 = close-gate re-run of `/gsd:docs-update --verify-only` confirming ≥99% pass rate.
4. **Wave 4 / 17.04 (PROJECT-01)** — PROJECT.md `### Validated` reconciliation. Runs LAST per IP-4 so v1.4's own REQ-IDs (NAMING-01, VCS-21, VCS-22, PARALLEL-07, LINT-06, CLEANUP-02, DOCS-01..09, DRIFT-01/02, PROJECT-01, CLEANUP-01/03..07, TEST-17) appear in the reconciled truth source.

Requirements (12 total): DOCS-08, DRIFT-01, DRIFT-02, DOCS-01, DOCS-02, DOCS-03, DOCS-04, DOCS-05, DOCS-06, DOCS-07, DOCS-09, PROJECT-01.

</domain>

<decisions>
## Implementation Decisions

### Preconditions (MUST land before plan-phase 17 starts)

- **Q-01:** BLOCKER B1 from `.planning/v1.4-MILESTONE-AUDIT.md` (workflow raw-git regression: `execute-phase.md` 11→12 + `plan-phase.md` 0→1 — both are prose mentions, not real `git ...` invocations) is fixed as a `/gsd-quick` task BEFORE `/gsd:plan-phase 17`. Phase 17 starts from `node scripts/audit-workflow-raw-git.cjs` returning OK. Affected lines verified during discuss:
  - `get-shit-done/workflows/execute-phase.md:558` — comment `# Bookmark-less jj @ and detached-HEAD git working copies pass cleanly.` (added by Phase 14.1 PARALLEL-08)
  - `get-shit-done/workflows/plan-phase.md:1696` — error-message hint `if unrelated WIP: jj abandon @ / git stash before re-running plan-phase`
  Reword each to avoid the literal `git ` substring (or whitelist via per-entry allowlist). Quick task does NOT need a REQ-ID — PARALLEL-08 audit closure is the natural framing in the commit message. Phase 17 CONTEXT.md depends on this being green; if quick task is skipped, plan-phase MUST surface this as a HARD blocker.

### Carried Forward (locked by upstream artifacts — DO NOT re-litigate)

- **CF-01:** 4-wave structure is FIXED. Each wave commits before the next starts (strict sequential). ROADMAP "Plans" field + Pitfall 4 + IP-4 + Pitfall 12 jointly dictate this. No `--all` / parallel-wave execution within Phase 17.
- **CF-02:** Test framework = `node:test` (NOT vitest). Anti-Pattern 2 + `project_test_perf_pain_vitest` memory + REQUIREMENTS.md §Drift Control locked this. Live-scan via `readdirSync` + `wc -l`; NOT hardcoded numbers; NOT snapshots. Verbatim copy of `tests/inventory-counts.test.cjs` shape (per ROADMAP SC1).
- **CF-03:** TWO separate test files (`tests/architecture-counts.test.cjs` + `tests/command-count-sync.test.cjs`). Single-responsibility, separate failure messages, INVENTORY.md theme 6 specifically names both, Out-of-Scope clause in REQUIREMENTS.md explicitly forbids merging. Cross-link via comment header.
- **CF-04:** `zh-CN` ARCHITECTURE.md does NOT exist and MUST NOT be created (ROADMAP SC1 explicit). REQUIREMENTS.md DRIFT-01 mentions zh-CN — that REQUIREMENTS.md text is itself a drift point; the test scans en + ja-JP + ko-KR + pt-BR only (4 locales).
- **CF-05:** Pitfall 12 per-theme commits within Plan 17.03. ADRs (theme 3 — 0009 + 0010) get append-only `## Update YYYY-MM-DD` supersession notes; NEVER in-place edits above the line (Integration Gotchas / ADR immutability). Theme 5 (Phase-3 archived planning artifacts in `docs/test-triage/jj-bugs.md`) anchored to closure change_ids (NOT deleted, NOT rehydrated).
- **CF-06:** Pitfall 8 two-pass reconciliation for Plan 17.04. Machine-generated truth source at `.planning/intel/project-validated-truth.md` (one bullet per REQ-ID with status from STATE.md + milestones/v*-REQUIREMENTS.md). HUMAN-edited PROJECT.md narrative cites the truth file and PRESERVES hand-curated parentheticals like "(caveat: A3 colocated pre-commit gap remains open, see Active)". PROJECT.md is NOT regenerate-overwrite output.
- **CF-07:** Per-theme decisions recorded in `.planning/intel/docs-update-fix-triage.md` BEFORE 17.03 execute (Pitfall 12). 7 themes × 1 acceptance criterion each (theme 6 folded into 17.02 = excluded; theme 8 = singletons but counts as 1 theme commit).

### Self-Resolving from Filesystem Inspection (audit-corrected during discuss)

- **D-01 (Theme 4 `verify-reapply-patches.cjs`):** File EXISTS at `get-shit-done/bin/verify-reapply-patches.cjs` (moved from `scripts/` per `.changeset/jolly-newts-roam.md` + `happy-jays-greet.md`, issue #2994). Theme 4 acceptance criterion "rebuild or remove claim" is incorrect — fix is **path-rewrite** in `CONTRIBUTING.md:403` (`scripts/verify-reapply-patches.cjs` → `get-shit-done/bin/verify-reapply-patches.cjs`) + same in `CHANGELOG.md:346` (or omit path qualifier since CHANGELOG describes the original location at time of authorship). NOT a rebuild decision. Plan 17.03 theme 4 must encode this.
- **D-02 (English ARCHITECTURE.md drift surface area):** Audit cross-check during discuss:
  - Line 121 (commands) — already defers to `INVENTORY.md` ✓
  - Line 143 (workflows) — already defers to `INVENTORY.md` ✓
  - Line 181 — `**Total agents:** 33` — **CORRECT** (filesystem agents/gsd-*.md = 33). NOT a drift point; Pitfall 4 listed this incorrectly. Translations are drifted (ja-JP says 16) but en is right.
  - Line 599 — `~10,700 lines` — **STALE**. Actual `wc -l bin/install.js` = `10,978`. This IS a real en-source drift point.
  - **Critically:** the installer lives at `bin/install.js`, NOT `get-shit-done/bin/install.js`. REQUIREMENTS.md DRIFT-01 + the audit narrative both reference both paths inconsistently — `bin/install.js` is the truth (already confirmed by `find` during discuss).

### En Source Pattern for Remaining Drift (D-03 — user pick)

- **D-03:** Line 599 (and any future en-source drift points outside lines 121/143 that already defer) — **update inline with a rounded approximation** (e.g., `~11,000 lines`) AND the drift test asserts the rounded form (nearest 1000, or asserts a tolerance range like `wc-l within [10000, 12000]`). Keeps the "approximate" prose convention; tolerates incidental installer churn from non-Phase-17 commits; test still catches large drift. **Specific rounding mechanism is planner discretion** — recommended: nearest 1000 (so 10,978 → "~11,000"; tolerates ±499). If installer LOC drifts past a 1000-boundary, the en prose AND the translations all need a coordinated update, which is acceptable.
- **Rejected alternative (defer-to-INVENTORY.md pattern):** Would have moved line 599 to "see INVENTORY.md" — consistent with the en lines 121/143 pattern, but adds an INVENTORY.md row that doesn't exist yet and isn't tracked by inventory-counts.test.cjs FAMILIES list. User explicitly picked the inline+rounded-bucket approach.
- **Rejected alternative (exact count):** Would have asserted `==10978` literal — would produce noisy CI churn from any installer LOC change.

### Drift-Test Locale Strictness (D-04 — user pick)

- **D-04:** `tests/architecture-counts.test.cjs` is **all-strict across all 4 active locales** (en + ja-JP + ko-KR + pt-BR). Wave 1 (17.01) fixes prose in ALL 4 atomically — day-1 GREEN per Pitfall 4. Translations stay in lockstep with en going forward; future translator must update all 4 locales together or break CI. This is a deliberate policy choice (NOT a default) explicitly recorded here so future contributors don't soften to translation-advisory mode without a fresh decision.
- **Rejected alternative (en-strict + translations-advisory):** Pitfall 4's "translations naturally lag" framing was offered but rejected. Cleanup-milestone framing wants drift driven to zero, not deferred.

### Drift-Test Scope (D-05 — user pick)

- **D-05:** `architecture-counts.test.cjs` asserts **all 4 locales across all 5 dimensions** (commands, workflows, agents, lib modules, installer LOC). Belt-and-suspenders with `inventory-counts.test.cjs` on en side (inventory-counts already covers en deferral target via INVENTORY.md), but the duplication is acceptable for explicit per-locale guard. **Per-locale describe blocks** in the test file (`describe('en source', …)`, `describe('ja-JP translation', …)`, etc.).
- **command-count-sync.test.cjs** scope is locked by ROADMAP SC1: asserts `docs/INVENTORY.md ## Commands` table row count == `commands/gsd/*.md` filesystem count. No additional choice surface here.

### Prose Extraction Strategy (D-06 — user pick)

- **D-06:** **Per-locale exact-string regex** in test fixtures. Each locale gets its own regex set encoded in the test file (e.g., en: `/\*\*Total agents:\*\*\s+(\d+)/`; ja-JP: `/\*\*エージェント総数:\*\*\s+(\d+)/`; ko-KR: equivalent Korean label; pt-BR: equivalent Portuguese label). Lockstep prose for each locale must match its specific regex. Test fixtures grow if a new locale is added (zh-CN — not in scope today) but each addition is a deterministic per-locale entry.
- **Rejected alternative (bilingual label table + shared regex):** Less code but harder to audit per-locale at a glance; locale label strings still must live somewhere.
- **Rejected alternative (skip line-by-line — assert INVENTORY only + en-defers-substring):** Strictly weaker; doesn't lock translations to filesystem; violates D-04 all-strict choice.

### Theme 8 Singletons (D-07/D-08)

- **D-07:** `tests/lint-no-source-grep.cjs` reference in `CONTEXT.md:610` → mechanical path-rewrite to `scripts/lint-no-source-grep.cjs` (verified during discuss). Single-line edit.
- **D-08:** `USER-PROFILE.md` reference in `docs/ja-JP/AGENTS.md:389` → add path qualifier (e.g., `$HOME/.claude/get-shit-done/USER-PROFILE.md` or `references/USER-PROFILE.md` per the actual location at time of doc authorship). Researcher confirms qualifier before commit.

### Theme 8 — `mutation-subprocess.integration.test.ts` (D-09 — punted)

- **D-09:** Reference at `CHANGELOG.md:389` (alongside `verifyGoldenPolicyComplete()` + `read-only-golden-rows`) — file does NOT exist anywhere in the repo (verified during discuss via `find . -name 'mutation-subprocess*'`). Resolution **deferred to researcher / plan-phase**: researcher performs `git log -S 'mutation-subprocess'`-style archaeology + filename-rename search; if a renamed file is found, plan 17.03 rewrites the path; if truly deleted/refactored away, plan 17.03 removes the specific file name from the parenthetical (keeping the surrounding bullet intact, per CHANGELOG-as-historical-record convention). Decision NOT pre-locked here — depends on researcher finding.
- **Rejected alternative (append-only correction note mirroring Theme 3 ADR pattern):** Reserved as fallback IF researcher finds the renamed file but the rename can't be cleanly back-patched in CHANGELOG prose. ADR-supersession-style "## Update YYYY-MM-DD" CHANGELOG note acceptable in that case.

### INVENTORY.md Interaction When 17.02 Lands (D-10 — punted)

- **D-10:** Whether 17.02 needs an explicit `docs/INVENTORY.md` edit (e.g., adding `tests/architecture-counts.test.cjs` + `tests/command-count-sync.test.cjs` rows to a Tests inventory family, or incrementing a `## Tests (N shipped)` headline) is **deferred to plan-phase**. Plan-phase reads INVENTORY.md, decides whether tests are a tracked inventory family (the existing FAMILIES list in `tests/inventory-counts.test.cjs` is: Agents, Commands, Workflows, References, CLI Modules, Hooks — Tests is NOT currently tracked), and adjusts 17.02's must_haves accordingly. CONTEXT.md flags this question; plan-checker enforces.
- **If Tests is added as a family:** inventory-counts.test.cjs FAMILIES list grows; both new tests appear as INVENTORY rows; INVENTORY headline count for Tests is asserted by inventory-counts going forward. Coordination cost: any subsequent test add/remove requires INVENTORY edit.
- **If Tests is NOT added:** L9/L59 self-references in INVENTORY.md (claiming the drift tests exist) auto-resolve when 17.02 lands. No additional INVENTORY edit needed. Theme 6 closes by 17.02 alone.
- **Recommendation (planner-discretion):** check current INVENTORY structure — if there's no `## Tests (N shipped)` heading today, do NOT add one in Phase 17 (out of scope; would expand surface beyond DOCS-08 + DRIFT-01/02 + DOCS-01..09). Resolution via the auto-resolve path is the minimal-surface choice.

### Wave Parallelism (D-11)

- **D-11:** Strict sequential 1 → 2 → 3 → 4 (NO `--all` / no within-phase parallelism). User explicitly picked this over `1 → (2 || 3) → 4` and "defer to plan-phase". Rationale: `parallelization` is OFF on this repo per `project_no_parallelization_yet`; the Pitfall 4 same-PR coupling between 17.01 + 17.02 is naturally satisfied; predictable commit order helps milestone-close audit traceability.

### Claude's Discretion

These are planner-level details NOT pinned at discuss-phase:

- Exact rounding mechanism for installer-LOC drift assertion (D-03). Recommended: nearest 1000.
- Exact regex form for per-locale prose extraction (D-06). Recommended: `/\*\*{label}:\*\*\s+(~?[\d,]+|\d+)/` with `label` parameterized per locale.
- Whether 17.04's machine-generated truth source `project-validated-truth.md` ships as a one-shot script (`scripts/reconcile-project-validated.cjs`) OR an inline researcher computation. Pitfall 8 lightly recommends the script form for "future drift prevention" but doesn't mandate it.
- INVENTORY.md Tests-family decision (D-10) — defer to plan-phase.
- Exact archaeology approach for `mutation-subprocess.integration.test.ts` (D-09) — researcher discretion.
- Whether 17.03 commits all 7 themes in 7 separate commits OR groups closely-related themes (e.g., theme 4 + theme 8 both path-rewrite singletons). Pitfall 12 prefers per-theme; planner may group within a single plan.
- Whether DOCS-09 (close-gate `/gsd:docs-update --verify-only` re-run) is a separate plan task or a final commit within 17.03.

### Folded Todos

- **`v14-docs-verify-only-followups.md`** (matches per `todo.match-phase 17` score 0.6, locked by REQUIREMENTS.md traceability to Phase 17 plans 17.01/17.02/17.03). 8 themes; theme 6 = drift tests = 17.02 scope; themes 1–5 + 7 + 8 = 17.03 scope. Acceptance criteria fully covered by D-01..D-08 + plan-phase research for D-09/D-10.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Authoritative scope (locked requirements + roadmap + milestone framing)

- `.planning/REQUIREMENTS.md` §"Drift Control", §"Docs Drift Cleanup", §"PROJECT.md Reconciliation", §"Out of Scope" — verbatim acceptance criteria for DOCS-08, DRIFT-01, DRIFT-02, DOCS-01..09, PROJECT-01.
- `.planning/ROADMAP.md` §"Phase 17: Drift control + reconciliation" — Success Criteria 1-5 + Plans 17.01..17.04 narrative.
- `.planning/PROJECT.md` §"Current Milestone: v1.4" — milestone framing ("drive every outstanding fork-internal todo, deferred item, and known drift to zero so the next upstream rebase lands on a clean baseline") + Out of Scope clauses.
- `.planning/v1.4-MILESTONE-AUDIT.md` — sets the precondition Q-01 context (BLOCKER B1); cleared by `/gsd-quick` before Phase 17 plan-phase.

### Research (v1.4-specific synthesis)

- `.planning/research/PITFALLS.md` §"Pitfall 4" (drift FIX → drift TEST ordering — directly governs CF-01 / Wave 1→2 coupling), §"Pitfall 8" (PROJECT.md reconciliation over-automation — directly governs CF-06 / D-04 / D-09), §"Pitfall 12" (45 docs-update verify-only failures per-theme triage — directly governs CF-05 / CF-07), §"IP-3" (assert_clean_wc + Theme-1-author-machine-path single-commit invariant), §"IP-4" (PROJECT.md reconciliation LAST so v1.4's own REQ-IDs land in truth source — directly governs Wave 4 ordering).
- `.planning/research/ARCHITECTURE.md` §"Per-Item" — file-change tables for DOCS-08 / DRIFT-01 / DRIFT-02 / DOCS-01..09 / PROJECT-01.
- `.planning/research/FEATURES.md` — industry precedent for drift-control tests (the `inventory-counts.test.cjs` shape is the local exemplar).
- `.planning/research/SUMMARY.md` §"Phase 17 — Drift control + reconciliation" + §"Research Flags" — strict-order flag resolution.

### Test framework + drift target

- `tests/inventory-counts.test.cjs` — **TEMPLATE: verbatim copy this shape** for both new drift tests. `node:test` + `node:fs.readdirSync` + per-family describe/test blocks + headline regex extraction (`/^##\s+${label}\s+\((\d+)\s+shipped\)/m`).
- `docs/INVENTORY.md` — drift target for command-count-sync.test.cjs (`## Commands` table); auto-resolves L9/L59 self-references when 17.02 lands per D-10.
- `docs/ARCHITECTURE.md` — en source. Lines 121 / 143 (already defer to INVENTORY.md — KEEP this pattern); line 181 (already correct at 33); line 599 (D-03 update target — "~11,000 lines" with rounded-bucket assertion).
- `docs/ja-JP/ARCHITECTURE.md` lines 116 / 127 / 137 / 427 — drift sites per Pitfall 4 enumeration.
- `docs/ko-KR/ARCHITECTURE.md` — parallel drifts (researcher enumerates exact line numbers during plan-phase research).
- `docs/pt-BR/ARCHITECTURE.md` — parallel drifts (same).
- `bin/install.js` — source for installer LOC drift (10,978 lines verified during discuss; the canonical path is `bin/install.js`, NOT `get-shit-done/bin/install.js` — REQUIREMENTS.md mentions both; `bin/install.js` is the truth).

### Per-theme docs-update sources (Plan 17.03)

- `.planning/todos/pending/v14-docs-verify-only-followups.md` — 8 themes with per-theme acceptance criteria. Theme 4 verify-reapply-patches.cjs acceptance is **out-of-date** per D-01; researcher reads `.changeset/jolly-newts-roam.md` (issue #2994) for the move target.
- `docs/{ja-JP,ko-KR}/superpowers/plans/2026-03-18-materialize-new-project-config.md` — Theme 1 author-machine path leak target (14 sites).
- `docs/{ja-JP,ko-KR,pt-BR}/superpowers/specs/2026-03-20-multi-project-workspaces-design.md` — Theme 2 split-workspace-command references (7 sites).
- `docs/adr/0009-shell-command-projection-module.md`, `docs/adr/0010-file-operation-engine-module.md` — Theme 3 supersession-note targets (append-only "## Update YYYY-MM-DD"; NEVER in-place edit per Integration Gotchas).
- `docs/test-triage/jj-bugs.md` — Theme 5 archived-phase-3-references; anchor to closure change_ids per Pitfall 12.
- `docs/pt-BR/superpowers/plans/2026-03-23-materialize-new-project-config.md`, `docs/pt-BR/superpowers/README.md`, `docs/pt-BR/superpowers/specs/2026-03-20-multi-project-workspaces-design.md` — Theme 7 date/link mismatch targets.
- `CHANGELOG.md:389`, `CONTEXT.md:610`, `docs/ja-JP/AGENTS.md:389` — Theme 8 singletons (D-07, D-08, D-09).

### Path-rewrite source for Theme 4 verify-reapply-patches.cjs (D-01)

- `.changeset/jolly-newts-roam.md` + `.changeset/happy-jays-greet.md` — both record the move `scripts/verify-reapply-patches.cjs` → `get-shit-done/bin/verify-reapply-patches.cjs` (issue #2994).
- `get-shit-done/bin/verify-reapply-patches.cjs` — actual current file location (verified during discuss).
- `CONTRIBUTING.md:403` + `CHANGELOG.md:346` — path-rewrite targets.

### PROJECT.md reconciliation (Plan 17.04 / CF-06 / Pitfall 8)

- `.planning/PROJECT.md` §"Validated" — reconciliation target (HUMAN-edited; preserve parentheticals).
- `.planning/MILESTONES.md` — primary source for the machine-generated truth file.
- `.planning/milestones/v1.1-REQUIREMENTS.md`, `v1.2-REQUIREMENTS.md`, `v1.3-REQUIREMENTS.md`, plus this milestone's `.planning/REQUIREMENTS.md` — per-milestone REQ-ID rosters.
- `.planning/STATE.md` — current REQ-ID status snapshot used by the machine truth pass.
- `.planning/intel/project-validated-truth.md` — machine-generated output target (NEW; created by 17.04).

### Phase 15 + 16 precedent (decision-pattern continuity)

- `.planning/phases/15-adapter-surface-extensions-rename/15-CONTEXT.md` — precedent for CF-style locked-decision blocks + pre-rename JSON sidecar audit pattern (cited if Phase 17 grows a sidecar — currently NOT planned).
- `.planning/phases/16-workflow-invariant-tooling/16-CONTEXT.md` — recent decision-style template; CONTEXT structure follows the same shape.
- `.planning/phases/14.1-drop-mandatory-bookmark-on-parallel-dispatch-fan-in-emergenc/14.1-01-SUMMARY.md` — provenance of the BLOCKER B1 lines (introduced by PARALLEL-08 refactor — context for Q-01 quick task).

### Memory directives that apply here

- `project_test_perf_pain_vitest` — `node:test` framework selection (NOT vitest) for both new drift tests per CF-02.
- `feedback_avoid_jj_auto_tracked_output` — reconciliation truth file `project-validated-truth.md` lives under `.planning/intel/` (not in the colocated-jj working tree noise).
- `feedback_solo_dev_no_expires` — if 17.03 adds any allowlist entries, no `expires` field.
- `project_jj_port` — drift tests are local-only (fork has no GitHub CI per `feedback_fork_local_only_no_ci`); test enforcement runs via local `npm test` and developer hygiene, not CI.
- `feedback_fork_local_only_no_ci` — `/gsd:docs-update --verify-only` close-gate (DOCS-09) is a local re-run, not a CI gate.
- `project_planning_id_migration` — irrelevant to this phase (no `.planning/` SHAs being rewritten).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`tests/inventory-counts.test.cjs`** — the verbatim template. 60-line `node:test` shape; `FAMILIES` table; per-family `describe(...)` + `test(...)`; headline regex `/^##\s+${label}\s+\((\d+)\s+shipped\)/m`; `fsCount(relDir, filter)` helper. Both new tests follow this skeleton; the only customization is the per-locale regex set (D-06) and the rounded-bucket assertion for installer LOC (D-03).
- **`scripts/audit-workflow-raw-git.cjs`** — fence-aware walker shape; cited as precedent for any new drift-related script (Phase 17 likely doesn't add scripts beyond `reconcile-project-validated.cjs` per Pitfall 8 if planner picks that option).
- **`.changeset/jolly-newts-roam.md` / `happy-jays-greet.md`** — primary evidence trail for D-01 (verify-reapply-patches move); researcher reads these before writing the Theme 4 commit message.

### Established Patterns

- **`describe()` per family + `test()` per check** — `node:test` convention from `inventory-counts.test.cjs`; both new tests follow.
- **Headline regex + filesystem count comparison** — `parseInt(m[1], 10)` + `readdirSync(dir).filter(...).length`; no intermediate JSON.
- **Pitfall 4 same-PR coupling** — Wave 2 must-haves cite "Wave 1 committed before this plan starts" verbatim.
- **Pitfall 12 per-theme commits** — each theme = one commit, with the theme number in the commit message (e.g., `docs(17.03): theme 4 — rewrite verify-reapply-patches.cjs path references`).
- **ADR supersession notes** (Theme 3) — `## Update YYYY-MM-DD` appended sections, NEVER in-place edit above the line. Pattern is repo-wide; ADRs 0009 + 0010 follow the existing ADR convention.
- **Closure change_id anchoring** (Theme 5) — link to the change_id of the commit that closed the original phase-3 artifact (researcher finds via `jj log` or git equivalent).
- **Two-pass reconciliation** (Plan 17.04) — machine-emitted JSON or markdown truth file at `.planning/intel/` + human-edited narrative consuming it. Mirrors v1.2 audit-id-namespace's machine-truth + human-prose split.

### Integration Points

- **New tests under `tests/`** — `tests/architecture-counts.test.cjs` + `tests/command-count-sync.test.cjs`. Both wired into existing `npm test` lane.
- **`docs/INVENTORY.md`** — L9 + L59 self-references auto-resolve when tests land (per D-10 auto-resolve path).
- **`docs/ARCHITECTURE.md`** + 3 translations — 4 locale files edited in Wave 1 (17.01) atomically.
- **`.planning/intel/docs-update-fix-triage.md`** — NEW file written during 17.03 plan-phase BEFORE execute (CF-07).
- **`.planning/intel/project-validated-truth.md`** — NEW file written during 17.04 (machine pass).
- **`.planning/PROJECT.md`** §Validated — human-edited in 17.04 (citing truth file).
- **No new SDK surface, no new CLI bridge, no new lint, no new agents** — pure docs + tests + reconciliation phase.

</code_context>

<specifics>
## Specific Ideas

- **Locale label table for D-06.** Sketch (planner refines):
  - en: `**Total agents:** N`, `(bin/install.js, ~Nk lines)` (or analog per dimension)
  - ja-JP: `**エージェント総数:** N`, `インストーラー（bin/install.js、約N行）`
  - ko-KR: equivalent Korean labels (researcher confirms during plan-phase)
  - pt-BR: equivalent Portuguese labels (researcher confirms during plan-phase)
- **Rounded-bucket assertion shape for D-03.** Sketch: `assert.ok(Math.abs(actualLoc - parsedProseLoc) < 1000, ...)` OR `assert.strictEqual(Math.round(actualLoc / 1000) * 1000, parsedProseLoc)`. Planner picks; both are valid.
- **Theme 5 anchoring example.** `docs/test-triage/jj-bugs.md:5` currently references `03-07-PLAN.md`. After anchoring: `(see commit jj change_id <xxxxxxxx> / git hash <yyyyyyy>, archived in Phase 3 closure 2026-05-12)`. Researcher finds the exact change_id from `jj log` archaeology.
- **Theme 3 ADR supersession note example.** Append to `docs/adr/0009-shell-command-projection-module.md`:
  ```markdown
  ## Update 2026-05-25 (Phase 17, DOCS-03)

  - L14: `settings.json` should be qualified — context refers to `.claude/settings.json`.
  - L41: `formatHookCommandForShell()` no longer exists; the equivalent surface is `<actual function name researcher finds>`.
  ```
  This preserves the ADR-at-time-of-decision text while flagging the drift.
- **Q-01 quick task commit message hint.** `chore(audit): revert PARALLEL-08 raw-git prose mentions in execute-phase.md + plan-phase.md` (one commit, two-file diff). The body references the v1.4-MILESTONE-AUDIT.md B1 finding.
- **Q-01 is a hard precondition.** If `node scripts/audit-workflow-raw-git.cjs` returns FAIL at the start of `/gsd:plan-phase 17`, the planner agent must surface this as a BLOCKER and refuse to plan until cleared.

</specifics>

<deferred>
## Deferred Ideas

These came up during synthesis and belong in OTHER phases or future milestones. Do not lose them; do not act on them in Phase 17.

- **Adding a Tests inventory family to INVENTORY.md + `tests/inventory-counts.test.cjs` FAMILIES list** — D-10 explicitly defers to plan-phase. If plan-phase picks "add", that's a strictly larger surface than DRIFT-01 demands and may grow Phase 17 scope. Recommended path is auto-resolve (NOT add) per minimal-surface principle; if the family addition is genuinely valuable, file as a v1.5+ deferred item.
- **`scripts/reconcile-project-validated.cjs` permanent reconciliation script** — Pitfall 8 floats this for "future drift prevention." Plan 17.04 may ship as a one-shot inline computation (researcher writes truth file directly) OR as a permanent script. If script form is picked, follow up at v1.5+ to wire to CI / milestone-close cadence. Out of scope for Phase 17's REQ list either way.
- **Refactoring `docs/INVENTORY.md` to make `## {Family} (N shipped)` headlines auto-generated from a manifest** — would prevent the L9/L59 self-reference class of bug entirely. Out of Phase 17 scope; v1.5+ candidate.
- **Promoting `tests/architecture-counts.test.cjs` to a project-wide locale-parity guard** beyond ARCHITECTURE.md (e.g., also asserting AGENTS.md / FEATURES.md prose-locale parity) — out of scope; v1.5+ candidate.
- **Renaming REQUIREMENTS.md DRIFT-01 to drop the zh-CN reference** — REQUIREMENTS.md itself is drift evidence; the v1.4 milestone close (post-Phase-18) might amend it. Out of scope for Phase 17.
- **Re-running the full `/gsd:docs-update --verify-only` audit on all 115 docs after Phase 17 to identify NEW drift introduced during 17.01..17.04 execution** — DOCS-09 is the close-gate that re-runs after Wave 3 lands; a SECOND audit pass after Wave 4 PROJECT.md edits would catch any reconciliation-introduced drift. Plan-phase may choose to fold this into DOCS-09 (re-run twice) or call it out as deferred. Out of scope unless planner explicitly adds.

### Reviewed Todos (not folded)

The 4 v14-* todos surfaced by `todo.match-phase 17` at score 0.6 — only `v14-docs-verify-only-followups.md` is mapped to Phase 17 by REQUIREMENTS.md traceability. The others belong to Phase 18:

- `v14-transition-md-update-gap.md` → CLEANUP-01 → Phase 18 (workflow gate)
- `v14-review-followups.md` → CLEANUP-03..07 → Phase 18 (Phase 14 code-review WR-01..05 hardening)
- `v14-jj-reap-test-flake.md` → TEST-17 → Phase 18 (narrow-scope test flake)

These were considered during `cross_reference_todos` but not folded — kept here so Phase 18 confirms the same mapping holds.

</deferred>

---

*Phase: 17-Drift control + reconciliation*
*Context gathered: 2026-05-25*
