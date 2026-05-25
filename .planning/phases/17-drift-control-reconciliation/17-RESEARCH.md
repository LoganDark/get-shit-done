# Phase 17: Drift control + reconciliation — Research

**Researched:** 2026-05-25
**Domain:** Docs drift control / per-locale prose-count locks / docs reconciliation / PROJECT.md truth-source reconciliation
**Confidence:** HIGH (every concrete claim verified against the filesystem at research time; archaeology paths for Theme 5 + Theme 8 D-09 closed)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (CF-01..CF-07 + D-01..D-08, D-10, D-11)

**Carried forward (DO NOT re-litigate):**

- **CF-01:** 4-wave strict-sequential structure. Each wave commits before the next starts. No `--all` / no within-phase parallelism.
- **CF-02:** Test framework = `node:test` (NOT vitest). Live-scan via `readdirSync` + `wc -l`. Verbatim copy of `tests/inventory-counts.test.cjs` shape.
- **CF-03:** TWO separate test files (`tests/architecture-counts.test.cjs` + `tests/command-count-sync.test.cjs`). Single-responsibility, separate failure messages.
- **CF-04:** `zh-CN` ARCHITECTURE.md does NOT exist and MUST NOT be created. Drift test scans 4 locales (en + ja-JP + ko-KR + pt-BR).
- **CF-05:** Pitfall 12 per-theme commits within Plan 17.03. ADRs (theme 3) get append-only `## Update YYYY-MM-DD` supersession notes. Theme 5 anchored to closure change_ids.
- **CF-06:** Pitfall 8 two-pass reconciliation. Machine-generated truth source at `.planning/intel/project-validated-truth.md`. HUMAN-edited PROJECT.md narrative preserves hand-curated parentheticals.
- **CF-07:** Per-theme decisions recorded in `.planning/intel/docs-update-fix-triage.md` BEFORE 17.03 execute.

**Self-resolving from filesystem inspection:**

- **D-01:** Theme 4 `verify-reapply-patches.cjs` — FILE EXISTS at `get-shit-done/bin/verify-reapply-patches.cjs` (verified 2026-05-25). Fix = path-rewrite in `CONTRIBUTING.md:403` + `CHANGELOG.md:346`. NOT a rebuild decision.
- **D-02:** En ARCHITECTURE.md line 599 = `~10,700 lines` STALE (actual: 10,978). Lines 121/143 already defer to INVENTORY.md ✓. Line 181 `**Total agents:** 33` CORRECT.

**En source pattern for installer LOC drift (D-03):** Update inline with rounded approximation (recommended: nearest 1000 → `~11,000 lines`). Drift test asserts the rounded form. Specific rounding mechanism is planner discretion.

**Drift-test locale strictness (D-04):** ALL-STRICT across all 4 active locales. Wave 1 fixes prose in ALL 4 atomically. Translations stay in lockstep with en. (Explicitly rejected en-strict + translations-advisory.)

**Drift-test scope (D-05):** `architecture-counts.test.cjs` asserts all 4 locales × all 5 dimensions (commands, workflows, agents, lib modules, installer LOC). Per-locale describe blocks.

**Prose extraction strategy (D-06):** Per-locale exact-string regex in test fixtures. Each locale gets its own regex set encoded in the test file.

**Theme 8 singletons:**
- **D-07:** `CONTEXT.md:610` `tests/lint-no-source-grep.cjs` → mechanical path-rewrite to `scripts/lint-no-source-grep.cjs`.
- **D-08:** `docs/ja-JP/AGENTS.md:389` `USER-PROFILE.md` reference — researcher confirms qualifier before commit.

**INVENTORY Tests-family decision (D-10):** Deferred to plan-phase. Recommendation: DO NOT add a `## Tests (N shipped)` heading. Auto-resolve path is minimal-surface.

**Wave parallelism (D-11):** Strict sequential 1 → 2 → 3 → 4. NO `--all` / no within-phase parallelism.

### Claude's Discretion

These are planner-level details NOT pinned at discuss-phase:

- Exact rounding mechanism for installer-LOC drift assertion (D-03). **Researcher recommendation:** nearest 1000 with `assert.ok(Math.abs(actualLoc - parsedProseLoc) < 1000, ...)` tolerance form (gentler than strictEqual; tolerates ±499 from the bucket boundary).
- Exact regex form for per-locale prose extraction (D-06). **Researcher recommendation:** `/\*\*{label}:\*\*\s+(~?[\d,]+|\d+)/` with `label` parameterized per locale.
- Whether 17.04's machine-generated truth source ships as a one-shot script (`scripts/reconcile-project-validated.cjs`) OR an inline researcher computation. **Researcher recommendation:** inline computation (one-shot per Pitfall 8 / PROJECT-01 acceptance text "One-shot prose sweep — NOT a recurring SDK verb (YAGNI; no second consumer)"). Script form is over-engineering.
- INVENTORY.md Tests-family decision (D-10) — defer to plan-phase. **Researcher recommendation:** do NOT add Tests family; auto-resolve path.
- Exact archaeology approach for `mutation-subprocess.integration.test.ts` (D-09) — **researcher RESOLVED:** file was never shipped (`sdk/src/golden/golden-mutation-covered.ts:3` says "Empty until those tests land"). See Per-Item table below.
- Whether 17.03 commits all 7 themes in 7 separate commits OR groups closely-related themes. Pitfall 12 prefers per-theme; planner may group.
- Whether DOCS-09 is a separate plan task or a final commit within 17.03.

### Deferred Ideas (OUT OF SCOPE for Phase 17)

- Adding a Tests inventory family to INVENTORY.md + `tests/inventory-counts.test.cjs` FAMILIES list.
- `scripts/reconcile-project-validated.cjs` permanent reconciliation script — v1.5+ candidate.
- Refactoring `docs/INVENTORY.md` to make `## {Family} (N shipped)` headlines auto-generated from a manifest — v1.5+.
- Promoting `tests/architecture-counts.test.cjs` to a project-wide locale-parity guard beyond ARCHITECTURE.md — v1.5+.
- Renaming REQUIREMENTS.md DRIFT-01 to drop the zh-CN reference — REQUIREMENTS.md itself is drift evidence; v1.4 milestone close may amend.
- Re-running the full `/gsd:docs-update --verify-only` audit on all 115 docs after Phase 17 to identify NEW drift introduced during 17.01..17.04 execution.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOCS-08 | Fix ARCHITECTURE.md prose-count drift across en + 4 translations (44→68 commands, 46→89 workflows, 16→33 agents, 17→60 lib modules, ~3000→10,978 install.js LOC) | Per-locale drift line numbers + live filesystem counts enumerated below. EN has 4 additional drift sites beyond CONTEXT.md scope (lines 185, 267, 282, 337). pt-BR has NO numeric prose-counts. |
| DRIFT-01 | `tests/architecture-counts.test.cjs` exists and asserts ARCHITECTURE.md headline counts (commands, workflows, agents, lib modules, install.js LOC) match live filesystem `readdirSync` results across 4 active locales | Verbatim template at `tests/inventory-counts.test.cjs`; headline regex shape determined per dimension; per-locale label table provided below. |
| DRIFT-02 | `tests/command-count-sync.test.cjs` exists and asserts INVENTORY.md `## Commands` table row-count matches live `commands/gsd/*.md` filesystem count | INVENTORY.md `## Commands (67 shipped)` table format identified (row pattern `\| \`/gsd-...\| ...`); rows in groupings. |
| DOCS-01 | 14 author-machine path leaks in `docs/{ja-JP,ko-KR}/superpowers/plans/2026-03-18-materialize-new-project-config.md` | Theme 1 fix: `/Users/diego/Dev/get-shit-done/get-shit-done/bin/gsd-tools.cjs` → `$HOME/.claude/get-shit-done/bin/gsd-tools.cjs`. Single mechanical sweep per file. |
| DOCS-02 | 7 split-workspace-command refs in 3 translation specs | Theme 2 fix: rewrite 3 separate refs (`new-workspace.md`, `list-workspaces.md`, `remove-workspace.md`) to `commands/gsd/workspace.md` with appropriate subcommands. |
| DOCS-03 | ADR 0009 + 0010 drift (7 issues) | Theme 3 fix: append-only `## Update 2026-05-25 (Phase 17, DOCS-03)` to each ADR. Concrete text drafted in Per-Item tables. |
| DOCS-04 | 5 renamed/missing hook/helper references in 5 docs | Theme 4 fix: 5 mechanical edits — `gsd-read-guard.js` rename, remove `gsd-commit-docs` hook claim, fix `doc-conflict-engine.md` path prefix, path-rewrite `verify-reapply-patches.cjs` per D-01, fix `npm run build`. |
| DOCS-05 | 3 archived phase-3 references in `docs/test-triage/jj-bugs.md` | Theme 5 fix: anchor to closure change_ids identified below (`41db442f`, `e190eee3`, `2fbcd590`). |
| DOCS-06 | 3 pt-BR translation date/link mismatches | Theme 7 fix: rename `2026-03-23-` → `2026-03-18-` filename, update L7 link in pt-BR README, fix circular ref in pt-BR specs. |
| DOCS-07 | 3 singleton failures (CHANGELOG L389, CONTEXT L610, ja-JP/AGENTS L389) | Theme 8 fix: D-07 (CONTEXT path-rewrite), D-08 (USER-PROFILE qualifier — researcher confirmed details below), D-09 (mutation-subprocess archaeology — researcher RESOLVED below). |
| DOCS-09 | Close-gate: re-run `/gsd:docs-update --verify-only` after Wave 1+2 land; confirm pass rate ≥ 99% | Local-only re-run per `feedback_fork_local_only_no_ci`. Plan may fold this into final commit of 17.03 OR keep as separate plan task. |
| PROJECT-01 | Reconcile `.planning/PROJECT.md` `### Validated` against MILESTONES.md + per-phase SUMMARYs; includes v1.4's OWN REQ-IDs (per IP-4) | Two-pass approach: machine-generated `.planning/intel/project-validated-truth.md` (one bullet per REQ-ID); human-edited PROJECT.md narrative preserves parentheticals. v1.4 REQ-ID roster enumerated below. |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

- **GitHub CLI scope:** Always pass `--repo gsd-build/get-shit-done` on `gh` commands. *(Not exercised in this phase — no GH issue/PR interactions.)*
- **Domain docs single-context:** `CONTEXT.md` + `docs/adr/` at the root. *(Theme 3 ADR fixes touch `docs/adr/0009-*` + `docs/adr/0010-*`; Theme 8 D-07 touches root `CONTEXT.md`.)*
- **Triage labels mapping:** `confirmed` = AFK-agent-ready (bugs); `approved-enhancement` / `approved-feature` = human-ready. *(Not exercised in this phase.)*

## Memory directives that apply

- `project_test_perf_pain_vitest` — `node:test` framework (NOT vitest) for both new drift tests. **HONORED by CF-02.**
- `feedback_avoid_jj_auto_tracked_output` — `.planning/intel/` location for `project-validated-truth.md` (NOT in colocated-jj working tree noise). **HONORED by CF-06.**
- `feedback_solo_dev_no_expires` — no `expires` field on any allowlist entry. *(Phase 17 adds no allowlist entries — N/A here.)*
- `project_jj_port`, `feedback_fork_local_only_no_ci` — drift tests + DOCS-09 close-gate are local-only, no CI. **HONORED — tests wired into `npm test`, not CI.**
- `project_planning_id_migration` — IRRELEVANT here (no `.planning/` SHAs being rewritten).

---

## Executive Summary

Phase 17 ships docs-truth-locking via two `node:test` drift-control tests, fixes the underlying prose-count drift FIRST (Pitfall 4 strict ordering), batches 7 docs-update theme fixes with per-theme commits (Pitfall 12 + CF-07), and reconciles PROJECT.md `### Validated` LAST per IP-4 so v1.4's own REQ-IDs land in the truth source.

The phase is a **docs+tests phase**: zero new SDK surface, zero new CLI bridge, zero new lint, zero new agents. Strict-sequential 4-wave structure (D-11). Day-1 GREEN for the drift tests is non-negotiable (Pitfall 4); Wave 1 must commit before Wave 2 starts.

**Key research findings beyond CONTEXT.md scope:**

1. **EN `docs/ARCHITECTURE.md` has 4 additional drift sites** beyond the line-599 installer-LOC that CONTEXT.md D-02 enumerated. Lines 185, 267, 282, 337 all carry stale prose counts ("References (41 shipped)", "Hooks (11 shipped)", "CLI Modules (33 shipped)", "31-agent roster"). Wave 1 must fix all 5 dimensions in en, not just installer LOC. *(See "EN ARCHITECTURE.md complete drift inventory" below.)*

2. **pt-BR `docs/ARCHITECTURE.md` does NOT have numeric prose-counts** — it is a high-level 81-line summary that defers to the English file. The drift test cannot assert the same 5 dimensions on pt-BR. **Recommended planner adjustment:** scope `architecture-counts.test.cjs` to en + ja-JP + ko-KR (3 locales, 5 dimensions each = 15 assertions), or treat pt-BR as a structural-presence-only check. *(See "Per-locale drift dimension matrix" below.)*

3. **Theme 5 closure change_ids identified:**
   - `41db442f` — `docs(03-07): phase-close finalization` (Phase 3 closure 2026-05-12)
   - `e190eee3` — `docs(03-06): TEST-08 triage — populate 7 bug-test verdicts on jj-colocated`
   - `2fbcd590` — `docs(03-06): complete push/fetch + workspace + TEST-08 triage plan`

4. **Theme 8 D-09 (`mutation-subprocess.integration.test.ts`) RESOLVED — file was never shipped.** `sdk/src/golden/golden-mutation-covered.ts:3` says verbatim "*see `mutation-subprocess.integration.test.ts` when present*. Empty until those tests land". The CHANGELOG.md L389 reference (issue #2302) was aspirational. **Fix:** remove the specific filename from the parenthetical OR append a `## Update 2026-05-25 (Phase 17, DOCS-07)` correction note. *(See Per-Item table below.)*

5. **Theme 8 D-08 (`USER-PROFILE.md`) — the en and ja-JP AGENTS.md use IDENTICAL unqualified prose.** The verifier flagged ja-JP only because en wasn't audited at the same line. The qualifier should be applied to BOTH en (`docs/AGENTS.md:404`) and ja-JP (`docs/ja-JP/AGENTS.md:389`) for symmetry, OR the unqualified form should be accepted (since USER-PROFILE.md is a runtime artifact, not a tracked file). **Recommended:** add path qualifier `$HOME/.claude/USER-PROFILE.md` to BOTH; if planner chooses to fix only ja-JP, document the en inconsistency as deferred for v1.5+.

**Primary recommendation:** Plan exactly as CONTEXT.md prescribes, with three planner-level adjustments:
- (a) `architecture-counts.test.cjs` scopes to **3 locales with prose counts (en + ja-JP + ko-KR)**, not 4 — pt-BR is structurally different and shouldn't break the all-strict invariant.
- (b) Wave 1 (DOCS-08) fixes **9 en drift sites + 4 ja-JP sites + 4 ko-KR sites**, not just CONTEXT.md's enumerated 1 en + 4 ja-JP. *(See full inventory below.)*
- (c) PROJECT-01 truth file is **inline researcher computation, not a permanent script** — planner emits the file directly during execute. No `scripts/reconcile-project-validated.cjs`.

---

## Architectural Responsibility Map

This phase is pure docs + tests reconciliation. No runtime tiers are added or shifted.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Prose-count drift assertion | Test runner (`node:test`) | — | Live-scan via `readdirSync` + headline regex; framework-agnostic CommonJS test under `tests/`. |
| Truth-source generation (PROJECT.md `### Validated`) | Static intel artifact (`.planning/intel/*.md`) | Human-edited narrative (`.planning/PROJECT.md`) | Pitfall 8 two-pass: machine emits structured truth; human synthesizes parenthetical narrative citing it. |
| ADR drift correction | ADR markdown (`docs/adr/000{9,10}-*.md`) | — | Append-only `## Update YYYY-MM-DD` section; ADR immutability above the line. |
| Phase-3 archived reference anchoring | Forensic doc (`docs/test-triage/jj-bugs.md`) | — | Replace dangling filename references with stable change_id citations (from `git log`/`jj log`). |
| Author-machine path rewriting | Translated planning docs (`docs/{ja-JP,ko-KR}/superpowers/plans/...`) | — | Mechanical regex sweep; same-file, single-commit per Pitfall 12. |
| Locale parity maintenance | Translation files (`docs/{ja-JP,ko-KR,pt-BR}/...`) | English source (`docs/ARCHITECTURE.md`, `docs/AGENTS.md`, `docs/INVENTORY.md`) | All-strict per D-04 — translations move in lockstep with en. |

---

## Standard Stack

**No new dependencies installed in Phase 17.** The phase uses only what already ships:

### Core (already present)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:test` | Node 18+ built-in | Drift-control test framework | Verbatim copy of `tests/inventory-counts.test.cjs` per CF-02; matches `project_test_perf_pain_vitest` memory; no install step. |
| `node:fs` / `node:path` / `node:assert/strict` | Node 18+ built-in | Filesystem scan + path resolution + assertions | Used in `inventory-counts.test.cjs:21-23`; the existing pattern. |

### Supporting (already present)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `gsd-sdk query commit` | shipped | Per-theme commit during 17.03 execute | Pitfall 12 per-theme commits; `gsd-sdk query commit "docs(17.03): theme N — ..." --files ...` |
| `node scripts/audit-workflow-raw-git.cjs` | shipped | Precondition Q-01 verification (BLOCKER B1 closure) | Phase 17 plan-phase MUST refuse to plan if this script returns FAIL. |

### Package Legitimacy Audit

**Not applicable.** Phase 17 installs no external packages. The audit script ran during research and confirmed all imports are Node built-ins.

---

## Architecture Patterns

### System Architecture (Phase 17 wave flow)

```
Wave 1 (17.01 — DOCS-08)
  Input:  drifted prose counts in 3 ARCHITECTURE.md locales (en, ja-JP, ko-KR)
       :  live filesystem counts (commands=68, workflows=89, agents=33, lib=59, hooks=12, install.js LOC=10978)
  Edit :  en lines 185, 267, 282, 337, 599 + ja-JP lines 116, 127, 137, 427 + ko-KR lines 116, 127, 137, 427
  Output: single commit "docs(17.01): align ARCHITECTURE.md prose-counts across en + 2 translations (DOCS-08)"
  Gate :  Wave 2 cannot start until Wave 1 commit lands.
                                                                            │
                                                                            ▼
Wave 2 (17.02 — DRIFT-01, DRIFT-02)
  Input:  Wave 1 prose now matches filesystem
       :  template at tests/inventory-counts.test.cjs
  Edit :  Write tests/architecture-counts.test.cjs (5 dims × 3 locales = 15 assertions + en INVENTORY-pointer dims)
       :  Write tests/command-count-sync.test.cjs (single ## Commands table-rows assertion)
  Output: two commits — "test(17.02): add architecture-counts drift guard (DRIFT-01)"
                      + "test(17.02): add command-count-sync drift guard (DRIFT-02)"
  Gate :  Day-1 GREEN. node --test tests/architecture-counts.test.cjs tests/command-count-sync.test.cjs exits 0.
                                                                            │
                                                                            ▼
Wave 3 (17.03 — DOCS-01..07, DOCS-09)
  Input:  v14-docs-verify-only-followups.md (7 themes; theme 6 absorbed by 17.02)
       :  .planning/intel/docs-update-fix-triage.md (NEW; planner writes BEFORE execute per CF-07)
  Edit :  Per-theme commits — theme 1 (DOCS-01), theme 2 (DOCS-02), theme 3 (DOCS-03 — ADR supersession notes),
       :  theme 4 (DOCS-04), theme 5 (DOCS-05 — change_id anchoring), theme 7 (DOCS-06), theme 8 (DOCS-07)
  Output: 7 per-theme commits OR fewer grouped commits (planner discretion). Final commit re-runs verify-only (DOCS-09).
  Gate :  /gsd:docs-update --verify-only pass rate ≥ 99%.
                                                                            │
                                                                            ▼
Wave 4 (17.04 — PROJECT-01)
  Input:  .planning/MILESTONES.md + .planning/milestones/v{1.1,1.2,1.3}-REQUIREMENTS.md + .planning/REQUIREMENTS.md
       :  .planning/STATE.md (current REQ-ID status snapshot)
  Edit :  Write .planning/intel/project-validated-truth.md (machine pass — one bullet per REQ-ID)
       :  Edit .planning/PROJECT.md ### Validated section (human pass — narrative cites truth file)
  Output: 2 commits — "docs(17.04): emit project-validated-truth.md machine truth source (PROJECT-01 pass 1/2)"
                    + "docs(17.04): reconcile PROJECT.md ### Validated against truth source (PROJECT-01 pass 2/2)"
  Gate :  Every REQ-ID in REQUIREMENTS.md + milestones/v*-REQUIREMENTS.md appears in PROJECT.md ### Validated
       :  with correct phase + status; hand-curated parentheticals (e.g., A3 caveat) preserved per Pitfall 8.
```

### Recommended Project Structure (additions only)

```
tests/
├── architecture-counts.test.cjs       # NEW (Wave 2, DRIFT-01)
├── command-count-sync.test.cjs        # NEW (Wave 2, DRIFT-02)
└── inventory-counts.test.cjs          # EXISTING (verbatim template — DO NOT MODIFY)

.planning/intel/
├── docs-update-fix-triage.md          # NEW (Wave 3 — planner writes BEFORE execute per CF-07)
└── project-validated-truth.md         # NEW (Wave 4 — machine pass per Pitfall 8)
```

### Pattern 1: Verbatim-copy template skeleton

**What:** Every detail of `tests/inventory-counts.test.cjs` — imports, helpers, describe-shape, regex — copies into the two new tests. Only the table contents and regex labels change per CF-02.

**When to use:** Both new tests. Don't reinvent the structure.

**Example (architecture-counts.test.cjs skeleton):**

```javascript
// Source: tests/inventory-counts.test.cjs (verified verbatim 2026-05-25)
'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const LOCALES = [
  { id: 'en',    file: 'docs/ARCHITECTURE.md',        labels: EN_LABELS },
  { id: 'ja-JP', file: 'docs/ja-JP/ARCHITECTURE.md',  labels: JA_LABELS },
  { id: 'ko-KR', file: 'docs/ko-KR/ARCHITECTURE.md',  labels: KO_LABELS },
  // pt-BR excluded — file has no numeric prose-counts (verified 2026-05-25)
];

const DIMENSIONS = [
  { key: 'commands',   dir: 'commands/gsd',                  filter: (f) => f.endsWith('.md') },
  { key: 'workflows',  dir: 'get-shit-done/workflows',       filter: (f) => f.endsWith('.md') },
  { key: 'agents',     dir: 'agents',                        filter: (f) => /^gsd-.*\.md$/.test(f) },
  { key: 'libModules', dir: 'get-shit-done/bin/lib',         filter: (f) => f.endsWith('.cjs') },
  // installerLoc handled separately — wc -l, not readdirSync
];

function fsCount(relDir, filter) {
  return fs.readdirSync(path.join(ROOT, relDir))
    .filter((name) => fs.statSync(path.join(ROOT, relDir, name)).isFile())
    .filter(filter)
    .length;
}

function installerLoc() {
  return fs.readFileSync(path.join(ROOT, 'bin/install.js'), 'utf8').split('\n').length - 1;
}

for (const locale of LOCALES) {
  describe(`docs/ARCHITECTURE.md (${locale.id}) prose counts match filesystem`, () => {
    const body = fs.readFileSync(path.join(ROOT, locale.file), 'utf8');
    for (const dim of DIMENSIONS) {
      test(`${locale.id}: ${dim.key} count matches ${dim.dir}/`, () => {
        const re = locale.labels[dim.key];
        const m = body.match(re);
        assert.ok(m, `${locale.file} missing prose-count for ${dim.key} (expected pattern: ${re})`);
        const documented = parseInt(m[1], 10);
        const actual = fsCount(dim.dir, dim.filter);
        assert.strictEqual(documented, actual,
          `${locale.file} ${dim.key}=${documented} disagrees with ${dim.dir}/=${actual}`);
      });
    }
    test(`${locale.id}: install.js LOC rounded-bucket match`, () => {
      const re = locale.labels.installerLoc;
      const m = body.match(re);
      assert.ok(m, `${locale.file} missing installer-LOC prose`);
      const documented = parseInt(m[1].replace(/[^\d]/g, ''), 10);  // strip commas / wave squiggle
      const actual = installerLoc();
      const documentedBucket = Math.round(documented / 1000) * 1000;
      const actualBucket     = Math.round(actual / 1000) * 1000;
      assert.strictEqual(documentedBucket, actualBucket,
        `${locale.file} installer LOC bucket ${documentedBucket} disagrees with bin/install.js bucket ${actualBucket} (actual: ${actual})`);
    });
  });
}
```

### Pattern 2: ADR append-only supersession note

**What:** ADRs are immutable above the line. Drift correction appends a `## Update YYYY-MM-DD (Phase 17, DOCS-03)` section.

**When to use:** Theme 3 ADR 0009 + ADR 0010 fixes.

**Example (concrete text for ADR 0009):**

```markdown
## Update — 2026-05-25 (Phase 17, DOCS-03)

This update reconciles ADR 0009 with the post-Phase-1–4 expansion state of `shell-command-projection.cjs` and resolves audit findings from the `/gsd:docs-update --verify-only` Theme 3 sweep.

- **L14 `settings.json` qualifier:** Context refers to `.claude/settings.json` (Claude Code runtime), not a project-level `settings.json`. Runtime-specific config locations are enumerated in `bin/install.js` runtime-detection logic.
- **L41 `formatHookCommandForShell()` rename:** The function listed under `bin/install.js:605-608` was absorbed during the Phase 1–4 expansion. The equivalent surface today is the `projectShellCommand(...)` projection helper exported from `get-shit-done/bin/lib/shell-command-projection.cjs`. The original `formatHookCommandForShell` name no longer exists in `bin/install.js`.

The body of this ADR above this line records the original 2026-05-12 decision and the 2026-05-13 expansion verbatim. Subsequent drift is captured here per ADR-supersession convention.
```

### Pattern 3: Closure change_id anchoring

**What:** Replace dangling references to archived planning artifacts with stable change_id citations.

**When to use:** Theme 5 fix in `docs/test-triage/jj-bugs.md` lines 5, 8, 33.

**Example (concrete anchors):**

| Site | Current text | Replacement |
|------|--------------|-------------|
| `docs/test-triage/jj-bugs.md:5` | `(03-07-PLAN.md)` | `(Phase 3 plan 03-07 closure commit \`41db442f\` — docs(03-07): phase-close finalization, 2026-05-12)` |
| `docs/test-triage/jj-bugs.md:8` | `(03-RESEARCH.md)` | `(Phase 3 research synthesis archived; see closure commit \`41db442f\` 2026-05-12)` |
| `docs/test-triage/jj-bugs.md:33` | `(03-06-PLAN.md)` | `(Phase 3 plan 03-06 closure commit \`2fbcd590\` — docs(03-06): complete push/fetch + workspace + TEST-08 triage plan)` |

### Anti-Patterns to Avoid

- **Bulk-edit single commit for all 7 themes** — Pitfall 12; loses forensic bisect granularity.
- **In-place edit above the `## Status` / `## Decision` line in ADRs** — violates Integration Gotcha ADR immutability.
- **Delete the archived-reference lines in `jj-bugs.md`** instead of anchoring to change_ids — destroys forensic trail (Pitfall 12).
- **Auto-generate PROJECT.md with a script that overwrites** — Pitfall 8; PROJECT.md is human-edited narrative citing the machine truth file, NOT the other way around.
- **Snapshot-based drift tests** (capture the count once, assert against snapshot) — Anti-Pattern; CF-02 mandates live-scan.
- **Hardcoded counts in drift tests** — CF-02 mandates live `readdirSync` / `wc -l`.
- **Merge `architecture-counts.test.cjs` + `command-count-sync.test.cjs` into one file** — CF-03 + REQUIREMENTS Out of Scope explicit prohibition.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Locale-aware label extraction | A YAML/TOML config of locale → label mappings | Per-locale regex set inline in the test file (D-06) | Adds zero dependencies; the 4-locale matrix is small and explicit. |
| Reconciliation script for PROJECT.md | `scripts/reconcile-project-validated.cjs` | Inline researcher computation during 17.04 execute (Pitfall 8 / PROJECT-01 OOS "NOT a recurring SDK verb (YAGNI; no second consumer)") | Single-shot reconciliation; no second consumer; v1.5+ candidate if cadence emerges. |
| Markdown header parser | `remark` / `unified` pipeline | `String.prototype.match(/^##\s+${label}\s+\((\d+)\s+shipped\)/m)` (from `inventory-counts.test.cjs:38`) | Existing pattern, zero deps, regex is sufficient. |
| Locale-aware date formatter | `Intl.DateTimeFormat` | Hardcoded `2026-05-25` in the supersession note | One-shot fix; no recurring need. |
| Diff/conflict detection between PROJECT.md and truth file | A diff-and-merge engine | Human reviewer reads truth file + edits PROJECT.md by hand | Pitfall 8 two-pass; the human IS the merge engine. |

**Key insight:** This phase is bounded mechanical edits + one small test scaffold. Every "let's build a framework for this" instinct violates the milestone's cleanup framing.

---

## Common Pitfalls

### Pitfall 4: Drift-control tests added BEFORE the drift is fixed → first run reds CI

**What goes wrong:** Codebase ALREADY HAS DRIFT (44→68 commands, 46→89 workflows, 16→33 agents, 17→60 lib modules, ~3000→10,978 install.js LOC across en + ja-JP + ko-KR ARCHITECTURE.md). Tests-first ships day-1 red.

**Why it happens:** "Tests first" is default; drift distributed across 3+ files; multi-file fix doesn't fit single commit naturally.

**How to avoid (LOCKED by CF-01 + CONTEXT.md):** **Strict order Wave 1 → Wave 2.** Wave 2's `must_haves` MUST cite "Wave 1 committed before this plan starts" verbatim (same-PR coupling pattern from v1.3 D-09/D-10/D-11).

**Warning signs to watch for during plan-checker:**
- Test plan's `must_haves` doesn't reference a "drift fix landed" gate.
- 17.02 PLAN.md uses Wave 1 / Wave 2 numbering instead of being explicitly placed AFTER 17.01.
- Discussion of "the tests will catch translations as they're updated" without confirming day-1 GREEN.

### Pitfall 8: Doc reconciliation over-automation produces robotic prose

**What goes wrong:** PROJECT.md `### Validated` gets fully regenerated; loses hand-curated narrative like `(caveat: A3 colocated pre-commit gap remains open, see Active)`.

**Why it happens:** "Automate everything" default reflex on a cleanup milestone.

**How to avoid (LOCKED by CF-06):** Two-pass — machine emits `.planning/intel/project-validated-truth.md` (one bullet per REQ-ID); HUMAN edits PROJECT.md narrative citing it. PROJECT.md is NOT regenerate-overwrite output.

**Warning signs to watch for:**
- Reconciliation plan ships a script that overwrites PROJECT.md whole.
- Reconciled PROJECT.md has zero parentheticals or qualifying notes.

### Pitfall 12: 45 docs-update verify-only failures fixed without acknowledging archived/historical-prose carve-outs

**What goes wrong:** Bulk-fix all 45 failures uniformly; ADRs edited in-place (violates immutability); Theme 5 dangling references DELETED instead of anchored.

**How to avoid (LOCKED by CF-05 + CF-07):**
- **Triage-then-fix** — record per-theme decisions in `.planning/intel/docs-update-fix-triage.md` BEFORE execute (CF-07).
- **ADRs immutable; append `## Update YYYY-MM-DD` supersession notes** (Theme 3).
- **Phase 3 archived references: anchor to closure change_ids, do not delete** (Theme 5 — change_ids enumerated in Pattern 3 above).
- **Per-theme commits** (Pitfall 12 — 7 commits within plan 17.03, OR planner-grouped per allowed discretion).

### Integration Pattern IP-3: assert_clean_wc + Theme 1 author-machine-path fix

**What goes wrong:** Theme 1's 14 author-machine path edits in 2 translated files (`docs/{ja-JP,ko-KR}/superpowers/plans/2026-03-18-...`) span ~14 sites. If the workflow's `assert_clean_wc` gate runs BEFORE the commit, the script's intermediate output trips the gate.

**How to avoid:** Theme 1 fix is single mechanical script (single sed/regex pass), single commit, single workflow step. Workflow MUST commit IMMEDIATELY after the script returns; `assert_clean_wc` gate runs LAST.

### Integration Pattern IP-4: Reconciliation + v1.4's OWN REQ-IDs

**What goes wrong:** If 17.04 runs BEFORE 17.01/02/03, the reconciled PROJECT.md misses v1.4 Phase 17's OWN REQ-IDs (DOCS-08, DRIFT-01/02, DOCS-01..09, PROJECT-01).

**How to avoid (LOCKED by D-11 + CONTEXT.md):** Wave 4 runs LAST. The truth source reads from STATE.md's current snapshot at the moment of 17.04 execute, capturing every REQ-ID that landed in the first 3 waves.

---

## Per-Item Tables

### DOCS-08 (Wave 1 / Plan 17.01) — ARCHITECTURE.md prose-count drift

**Live filesystem counts (verified 2026-05-25):**

| Dimension | Live count | Source command |
|-----------|------------|----------------|
| Commands | **68** | `ls commands/gsd/*.md \| wc -l` |
| Workflows | **89** | `ls get-shit-done/workflows/*.md \| wc -l` |
| Agents | **33** | `ls agents/gsd-*.md \| wc -l` |
| References | **60** | `ls get-shit-done/references/*.md \| wc -l` |
| Lib Modules (CLI) | **59** | `ls get-shit-done/bin/lib/*.cjs \| wc -l` |
| Hooks | **12** | `ls hooks/*.{js,sh} \| wc -l` |
| Installer LOC | **10978** | `wc -l bin/install.js` |

**EN `docs/ARCHITECTURE.md` complete drift inventory (9 sites — 4 beyond CONTEXT.md):**

| Site | Current text | Target text | Notes |
|------|--------------|-------------|-------|
| L121 | `**Total commands:** see [INVENTORY.md](#commands) for the authoritative count and full roster.` | KEEP | Already defers to INVENTORY ✓ |
| L143 | `**Total workflows:** see [INVENTORY.md](#workflows) for the authoritative count and full roster.` | KEEP | Already defers to INVENTORY ✓ |
| L181 | `**Total agents:** 33` | KEEP | Correct ✓ |
| **L185** | `(see [INVENTORY.md](INVENTORY.md#references-41-shipped) for the authoritative count...)` | `(see [INVENTORY.md](INVENTORY.md#references-60-shipped)...)` | **NEW finding — CONTEXT.md missed this site.** Anchor + prose carry stale `41`. |
| **L267** | `See [INVENTORY.md](INVENTORY.md#hooks-11-shipped) for the authoritative 11-hook roster.` | `See [INVENTORY.md](INVENTORY.md#hooks-12-shipped) for the authoritative 12-hook roster.` | **NEW finding.** Two sites on the same line: anchor `11-shipped` + prose `11-hook`. |
| **L282** | `(see [INVENTORY.md](INVENTORY.md#cli-modules-33-shipped) for the authoritative roster):` | `(see [INVENTORY.md](INVENTORY.md#cli-modules-59-shipped)...)` | **NEW finding.** |
| **L337** | `Conceptual spawn-pattern taxonomy for the 21 primary agents. For the authoritative 31-agent roster (including the 10 advanced/specialized agents such as ..., gsd-debug-session-manager, gsd-intel-updater), see [INVENTORY.md](INVENTORY.md#agents-31-shipped).` | `... 33-agent roster (including the 12 advanced/specialized agents ...), see [INVENTORY.md](INVENTORY.md#agents-33-shipped).` | **NEW finding.** Three drifts on one line: `31-agent`, `10 advanced`, anchor `agents-31-shipped`. Math: 33 total − 21 primary = 12 advanced. |
| L599 | `The installer (\`bin/install.js\`, ~10,700 lines) handles:` | `The installer (\`bin/install.js\`, ~11,000 lines) handles:` | Per D-03 nearest-1000 rounding (10,978 → ~11,000). |

**ja-JP `docs/ja-JP/ARCHITECTURE.md` drift inventory (4 sites confirmed):**

| Line | Current text | Target text |
|------|--------------|-------------|
| L116 | `**コマンド総数:** 44` | `**コマンド総数:** 68` |
| L127 | `**ワークフロー総数:** 46` | `**ワークフロー総数:** 89` |
| L137 | `**エージェント総数:** 16` | `**エージェント総数:** 33` |
| L427 | `インストーラー（\`bin/install.js\`、約3,000行）は以下を処理します：` | `インストーラー（\`bin/install.js\`、約11,000行）は以下を処理します：` |

**ko-KR `docs/ko-KR/ARCHITECTURE.md` drift inventory (4 sites confirmed):**

| Line | Current text | Target text |
|------|--------------|-------------|
| L116 | `**전체 명령어 수:** 44개` | `**전체 명령어 수:** 68개` |
| L127 | `**전체 워크플로우 수:** 46개` | `**전체 워크플로우 수:** 89개` |
| L137 | `**전체 에이전트 수:** 16개` | `**전체 에이전트 수:** 33개` |
| L427 | `인스톨러(\`bin/install.js\`, ~3,000줄)는 다음을 처리합니다.` | `인스톨러(\`bin/install.js\`, ~11,000줄)는 다음을 처리합니다.` |

**pt-BR `docs/pt-BR/ARCHITECTURE.md` drift inventory: NONE.** Verified 2026-05-25 — pt-BR ARCHITECTURE.md is an 81-line high-level summary with NO numeric prose-counts. **Recommended planner adjustment:** drop pt-BR from `architecture-counts.test.cjs` scope. CONTEXT.md CF-04 + ROADMAP SC1 list pt-BR among the 4 active locales, but the prose simply doesn't carry the dimensions. Treat as structural-presence-only or omit. *(Reflected in test skeleton above.)*

### DRIFT-01 (Wave 2 / Plan 17.02) — `tests/architecture-counts.test.cjs`

**Per-locale regex table for D-06:**

```javascript
const EN_LABELS = {
  // EN defers commands + workflows to INVENTORY.md (line 121, 143)
  // — those are tested by tests/inventory-counts.test.cjs and command-count-sync.test.cjs.
  // EN ARCHITECTURE.md asserts only `Total agents` (line 181) directly.
  agents:       /\*\*Total agents:\*\*\s+(\d+)/,
  installerLoc: /The installer \(`bin\/install\.js`,\s+~([\d,]+)\s+lines\)/,
  // Anchor-form drifts on lines 185/267/282/337 are tested indirectly:
  // their numeric content matches the live count of the relevant dimension.
  // Add anchor checks if planner judges them needed:
  refsAnchor:   /INVENTORY\.md#references-(\d+)-shipped/,
  hooksAnchor:  /INVENTORY\.md#hooks-(\d+)-shipped/,
  libAnchor:    /INVENTORY\.md#cli-modules-(\d+)-shipped/,
  agentsAnchor: /INVENTORY\.md#agents-(\d+)-shipped/,
};

const JA_LABELS = {
  commands:     /\*\*コマンド総数:\*\*\s+(\d+)/,
  workflows:    /\*\*ワークフロー総数:\*\*\s+(\d+)/,
  agents:       /\*\*エージェント総数:\*\*\s+(\d+)/,
  installerLoc: /インストーラー（`bin\/install\.js`、約([\d,]+)行）/,
  // No libModules dimension in ja-JP today.
};

const KO_LABELS = {
  commands:     /\*\*전체 명령어 수:\*\*\s+(\d+)/,
  workflows:    /\*\*전체 워크플로우 수:\*\*\s+(\d+)/,
  agents:       /\*\*전체 에이전트 수:\*\*\s+(\d+)/,
  installerLoc: /인스톨러\(`bin\/install\.js`,\s+~([\d,]+)줄\)/,
};
```

**Per-locale drift dimension matrix:**

| Dimension | en | ja-JP | ko-KR | pt-BR |
|-----------|-----|-------|-------|-------|
| commands  | (deferred to INVENTORY L121) | ✓ L116 | ✓ L116 | — (no prose) |
| workflows | (deferred to INVENTORY L143) | ✓ L127 | ✓ L127 | — (no prose) |
| agents    | ✓ L181 + anchors L337 | ✓ L137 | ✓ L137 | — (no prose) |
| libModules | (deferred to INVENTORY anchor L282) | — | — | — (no prose) |
| hooks | (deferred to INVENTORY anchor L267) | — | — | — (no prose) |
| references | (deferred to INVENTORY anchor L185) | — | — | — (no prose) |
| installerLoc | ✓ L599 (rounded) | ✓ L427 (rounded) | ✓ L427 (rounded) | — (no prose) |

**Concrete test count:** 12 leaf assertions across 3 locales (en: 2 dims + 4 optional anchor checks; ja-JP: 4 dims; ko-KR: 4 dims).

### DRIFT-02 (Wave 2 / Plan 17.02) — `tests/command-count-sync.test.cjs`

**INVENTORY.md `## Commands` section structure (verified 2026-05-25):**

- Heading: `## Commands (67 shipped)` at L57.
- Sub-groupings (`### Namespace Meta-Skills`, `### Core Workflow`, `### Phase & Milestone Management`, etc.).
- Each table row format: `| \`/gsd-<name>\` | <one-liner> | [commands/gsd/<name>.md](../commands/gsd/<name>.md) |`.

**Discrepancy note:** INVENTORY.md headline says `(67 shipped)` but live filesystem has **68** commands. `tests/inventory-counts.test.cjs` will RED on this. **Recommended planner action:** Wave 1 (17.01) should ALSO bump `## Commands (67 shipped)` → `## Commands (68 shipped)` in INVENTORY.md headline to keep `tests/inventory-counts.test.cjs` green. *(This is a pre-existing drift that 17.01's commits should sweep alongside the ARCHITECTURE.md edits.)*

**Test shape (skeleton):**

```javascript
// tests/command-count-sync.test.cjs — DRIFT-02
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const INVENTORY = fs.readFileSync(path.join(ROOT, 'docs/INVENTORY.md'), 'utf8');
const COMMANDS_DIR = path.join(ROOT, 'commands/gsd');

// Cross-link to architecture-counts.test.cjs — both lock prose claims to filesystem.
// Single responsibility: this file asserts INVENTORY.md table-row count vs ls commands/gsd/.

function commandsTableRowCount() {
  // Extract the `## Commands (N shipped)` section through the next `---` or `## ` boundary.
  const start = INVENTORY.indexOf('## Commands ');
  const next  = INVENTORY.indexOf('\n## ', start + 1);
  const section = INVENTORY.slice(start, next === -1 ? INVENTORY.length : next);
  // Count rows matching `| \`/gsd-...\``
  const matches = section.match(/^\|\s+`\/gsd-[^`]+`/gm) || [];
  return matches.length;
}

function filesystemCommandCount() {
  return fs.readdirSync(COMMANDS_DIR)
    .filter((name) => fs.statSync(path.join(COMMANDS_DIR, name)).isFile())
    .filter((name) => name.endsWith('.md'))
    .length;
}

describe('docs/INVENTORY.md ## Commands table row count matches commands/gsd/', () => {
  test('row count equals filesystem command file count', () => {
    const documented = commandsTableRowCount();
    const actual = filesystemCommandCount();
    assert.strictEqual(documented, actual,
      `INVENTORY.md ## Commands table has ${documented} rows but commands/gsd/ has ${actual} .md files`);
  });
});
```

### DOCS-01 (Wave 3 / Plan 17.03 theme 1) — Author-machine path leaks

| Site | Find | Replace | Count |
|------|------|---------|-------|
| `docs/ja-JP/superpowers/plans/2026-03-18-materialize-new-project-config.md` | `/Users/diego/Dev/get-shit-done/get-shit-done/bin/gsd-tools.cjs` | `$HOME/.claude/get-shit-done/bin/gsd-tools.cjs` | 7 |
| `docs/ko-KR/superpowers/plans/2026-03-18-materialize-new-project-config.md` | same | same | 7 |

**Total:** 14 sites, 2 files, single mechanical sed sweep, single commit.

### DOCS-02 (Wave 3 / Plan 17.03 theme 2) — Workspace command split refs

| File | Sites |
|------|-------|
| `docs/ja-JP/superpowers/specs/2026-03-20-multi-project-workspaces-design.md:166-168` | 3 split refs → 1 unified ref |
| `docs/ko-KR/superpowers/specs/2026-03-20-multi-project-workspaces-design.md:166-168` | 3 split refs → 1 unified ref |
| `docs/pt-BR/superpowers/specs/2026-03-20-multi-project-workspaces-design.md:166-168` | 1 ref (different prose structure) — researcher CONFIRM during plan-phase |

**Replacement:** rewrite the 3 separate file refs (`commands/gsd/new-workspace.md`, `commands/gsd/list-workspaces.md`, `commands/gsd/remove-workspace.md`) to one ref to `commands/gsd/workspace.md` with subcommand descriptions (`/gsd-workspace --new`, `--list`, `--remove`).

### DOCS-03 (Wave 3 / Plan 17.03 theme 3) — ADR drift

| ADR | Drift items | Resolution |
|-----|-------------|------------|
| `docs/adr/0009-shell-command-projection-module.md` | L14 `settings.json` unqualified; L41 `formatHookCommandForShell()` no longer exists | Append `## Update — 2026-05-25 (Phase 17, DOCS-03)` per Pattern 2 above |
| `docs/adr/0010-file-operation-engine-module.md` | L7 claims `normalizeMd` removed but it's still defined at `core.cjs:637`; L36 `isGsdHookCommand` not in `bin/install.js`; L37 `STALE_HOOK_BASENAMES` not in `bin/install.js`; L50 internal contradiction with L7; L52 `installer-migrations.cjs` defines different function name | The ADR ALREADY HAS a "Superseded by ADR-0009" header (line 3). The 5 drift findings are pre-supersession-note content. Add a `## Update — 2026-05-25 (Phase 17, DOCS-03)` section BELOW the existing supersession note clarifying which findings the original ADR predicted vs which the supersession resolved. |

**Concrete supersession-note text for ADR 0009:** *(See Pattern 2 above for full text.)*

**Concrete supersession-note text for ADR 0010** (planner refines):

```markdown
## Update — 2026-05-25 (Phase 17, DOCS-03)

Drift items surfaced by `/gsd:docs-update --verify-only` against current code:

- **L7 normalizeMd:** Still defined at `get-shit-done/bin/lib/core.cjs:637`, exported at `:1958`. The Phase 4 (`#3468`) removal listed in the supersession note above refers to the `core.cjs` `atomicWriteFileSync` + `safeReadFile` wrappers, not `normalizeMd`. `normalizeMd` remains a `core.cjs` export.
- **L36 isGsdHookCommand:** Migrated into `shell-command-projection.cjs::isManagedHookBasename` per the supersession note above; the original ADR proposed location at `bin/install.js` was superseded.
- **L37 STALE_HOOK_BASENAMES:** Same migration path as L36.
- **L50 internal contradiction:** L50 mentioning `core.cjs::atomicWriteFileSync` is correct AT TIME OF ADR; L7's predicted removal is what the supersession actually shipped. Both sentences are accurate as snapshots of different points in time.
- **L52 `writeFileAtomicSync` rename:** Actual function name in `installer-migrations.cjs` is `atomicWriteInstallState`; the original ADR's name was a draft.

The body above this line records the original 2026-05-12 decision and the 2026-05-13 supersession verbatim. Subsequent drift is captured here per ADR-supersession convention.
```

### DOCS-04 (Wave 3 / Plan 17.03 theme 4) — Renamed hook + missing helper references

| File:Line | Drift | Fix |
|-----------|-------|-----|
| `docs/USER-GUIDE.md:1091` | `gsd-read-before-edit.js` | Rewrite to `hooks/gsd-read-guard.js` |
| `docs/FEATURES.md:2002` | `gsd-commit-docs.js` claimed as hook | REMOVE the claim — concept lives in `tests/bug-2399-commit-docs-plan-phase.test.cjs` + `tests/commit-docs-bypass.test.cjs`, not a hook file |
| `docs/AGENTS.md:719` | `references/doc-conflict-engine.md` | Rewrite to `get-shit-done/references/doc-conflict-engine.md` (missing prefix) |
| `docs/CONTRIBUTING.md:403` | `scripts/verify-reapply-patches.cjs` | **Per D-01:** rewrite to `get-shit-done/bin/verify-reapply-patches.cjs` (file MOVED per `.changeset/jolly-newts-roam.md` + `happy-jays-greet.md` issue #2994; verified 2026-05-25) |
| `CHANGELOG.md:346` | `scripts/verify-reapply-patches.cjs` | **Per D-01:** rewrite to `get-shit-done/bin/verify-reapply-patches.cjs` OR (recommended for CHANGELOG) keep historical path with `(now at get-shit-done/bin/...)` parenthetical to preserve changelog-as-historical-record convention |
| `docs/CONTRIBUTING.md:571` | `npm run build` (no top-level script) | Rewrite to `npm run build:hooks && npm run build:sdk && npm run build:cjs` OR document the per-target invocation pattern |

### DOCS-05 (Wave 3 / Plan 17.03 theme 5) — Phase-3 archived references

*(See Pattern 3 above for the concrete change_id anchoring table.)*

**Closure change_ids identified via `git log` archaeology (2026-05-25):**

| Phase-3 artifact | Closure commit | Commit message |
|------------------|----------------|----------------|
| `03-07-PLAN.md` | `41db442f` | `docs(03-07): phase-close finalization — REQUIREMENTS / ROADMAP / STATE / triage / tracker / SUMMARY` |
| `03-RESEARCH.md` | `41db442f` (same closure commit) | (Phase 3 research synthesis archived together) |
| `03-06-PLAN.md` | `2fbcd590` | `docs(03-06): complete push/fetch + workspace + TEST-08 triage plan` |

### DOCS-06 (Wave 3 / Plan 17.03 theme 7) — pt-BR translation date/link mismatches

| File:Line | Drift | Fix |
|-----------|-------|-----|
| `docs/pt-BR/superpowers/plans/2026-03-23-materialize-new-project-config.md:4` | Filename uses `2026-03-23-` but links to en `2026-03-18-...` | Two options: (a) rename file to `2026-03-18-...` to match en; (b) update L4 link to a different en target. **Recommended (a):** rename file (en convention is canonical). |
| `docs/pt-BR/superpowers/README.md:7` | `2026-03-18` vs `2026-03-23` mismatch in the link | Update to `2026-03-18` (or whatever target the renamed file in (a) above uses) |
| `docs/pt-BR/superpowers/specs/2026-03-20-multi-project-workspaces-design.md:4` | Circular ref: links to non-existent `docs/superpowers/specs/2026-03-20-multi-project-workspaces-design.md` (the doc IS the spec) | Replace with link to the en source: `docs/superpowers/specs/2026-03-20-multi-project-workspaces-design.md` (if exists) OR remove the circular line |

### DOCS-07 (Wave 3 / Plan 17.03 theme 8) — Singletons

| Site | Drift | Resolution |
|------|-------|------------|
| `CONTEXT.md:610` | `tests/lint-no-source-grep.cjs` (D-07) | Mechanical path-rewrite to `scripts/lint-no-source-grep.cjs`. Single-line edit, verified file exists at the target path. |
| `docs/ja-JP/AGENTS.md:389` | `USER-PROFILE.md` unqualified (D-08) | **Researcher confirmed:** USER-PROFILE.md is a GENERATED artifact (no static file in repo). The en `docs/AGENTS.md:404` uses the IDENTICAL unqualified prose. **Recommended fix:** add `$HOME/.claude/USER-PROFILE.md` path qualifier to BOTH en AND ja-JP for symmetry. If planner judges en should stay unqualified to match runtime documentation convention, then the ja-JP fix becomes "match en exactly" and the verify-only failure is a verifier false-positive (worth filing as a v1.5+ verifier-tuning todo). |
| `CHANGELOG.md:389` | `mutation-subprocess.integration.test.ts` (D-09) | **Researcher RESOLVED:** file was NEVER shipped. `sdk/src/golden/golden-mutation-covered.ts:3` says verbatim "*see `mutation-subprocess.integration.test.ts` when present*. Empty until those tests land". The CHANGELOG.md L389 reference (from #2302) was aspirational. **Recommended fix:** append `## Update — 2026-05-25 (Phase 17, DOCS-07)` to the relevant CHANGELOG section noting that the specific filename never landed; the equivalent coverage lives in `sdk/src/golden/golden-mutation-covered.ts` (parity helper) + `sdk/HANDOVER-GOLDEN-PARITY.md` (documentation). OR (simpler): in-line strip the specific filename from the parenthetical at L389, keeping the surrounding bullet text intact. Planner picks; both are valid per CONTEXT.md D-09 fallback path. |

### DOCS-09 (Wave 3 / Plan 17.03 close-gate) — Verify-only re-run

| Step | Command | Acceptance |
|------|---------|------------|
| 1 | `/gsd:docs-update --verify-only` (or equivalent local invocation) | Pass rate ≥ 99% (allowing legitimate skip-but-flag cases) |
| 2 | Compare against pre-Phase-17 baseline (45 failures, 97.6% pass) | Failures dropped to ≤ ~2 (legitimate flags only) |
| 3 | (Optional) Re-run `node --test tests/architecture-counts.test.cjs tests/command-count-sync.test.cjs` | Exit 0 |

**Planner choice:** DOCS-09 either lives as a separate final task in plan 17.03, OR as the final commit's verification step (workflow's `<verify>` block). Recommended: separate task for clear close-gate auditability.

### PROJECT-01 (Wave 4 / Plan 17.04) — PROJECT.md reconciliation

**Reconciliation truth-file shape (`/planning/intel/project-validated-truth.md`):**

```markdown
# PROJECT-VALIDATED-TRUTH

**Generated:** 2026-05-25
**Generator:** Phase 17.04 inline computation (NOT a recurring script)
**Source:**
- .planning/REQUIREMENTS.md (v1.4 active milestone)
- .planning/milestones/v1.1-REQUIREMENTS.md
- .planning/milestones/v1.2-REQUIREMENTS.md
- .planning/milestones/v1.3-REQUIREMENTS.md
- .planning/STATE.md (status snapshot)
- .planning/MILESTONES.md (shipped-milestone summaries)

## v1.0 — Dual-backend foundation (REQ-IDs: VCS-01..07, GIT-01..03, MIGR-01..04, JJ-01..07, SQUASH-01..07, REFS-01..06, CONFLICT-01..03, WS-01..13, HOOK-01..05, CMD-01..11, PROMPT-01..03, BROWN-01..02, GREEN-01..03, TEST-01..08, UPSTREAM-01..03, CI-01..04)

- ✓ VCS-01..07 — Adapter foundation
- ✓ GIT-01..03 — Git backend (1:1 baseline)
- ... [one bullet per REQ-ID]

## v1.1 — first upstream sync (VCS-08..15, WAVE-01, PROMPT-04, MIGR-05, TEST-09..11)

- ✓ VCS-08 — refs.bookmarks.currentIn
- ... [enumerate]

## v1.2 — unified revision model (AUDIT-01..04, FLIP-01..04, LINT-01..03, PROMPT-05, TEST-12, MIGR-06)
... [enumerate]

## v1.3 — jj octopus merge for subagents (PARALLEL-01..06, VCS-16..20, TEST-13..16, HOOK-06..07, CI-05..06, LINT-04..05, CONFIG-01..02, PROMPT-06..09, DOGFOOD-01..02)
... [enumerate]

## v1.4 — Clean, consistent state for next upstream pull (CURRENT MILESTONE)

### Shipped (as of 2026-05-25)
- ✓ PARALLEL-08 — Phase 14.1 (2026-05-24)
- ✓ NAMING-01 — Phase 15 plan 15.01 (2026-05-25)
- ✓ VCS-21 — Phase 15 plan 15.02
- ✓ VCS-22 — Phase 15 plan 15.03
- ✓ PARALLEL-07 — Phase 15 plan 15.04
- ✓ LINT-06 — Phase 16 plan 16.01
- ✓ CLEANUP-02 — Phase 16 plan 16.02
- ✓ DOCS-08 — Phase 17 plan 17.01 (THIS PHASE — Wave 1)
- ✓ DRIFT-01 — Phase 17 plan 17.02 (THIS PHASE — Wave 2)
- ✓ DRIFT-02 — Phase 17 plan 17.02 (THIS PHASE — Wave 2)
- ✓ DOCS-01..07 + DOCS-09 — Phase 17 plan 17.03 (THIS PHASE — Wave 3)
- ✓ PROJECT-01 — Phase 17 plan 17.04 (THIS PHASE — Wave 4 — self-reference: this truth file IS the artifact)

### Pending (Phase 18)
- ⏳ CLEANUP-01 — Phase 18 plan 18.01
- ⏳ CLEANUP-03..07 — Phase 18 plan 18.02
- ⏳ TEST-17 — Phase 18 plan 18.03

### Deferred-by-design (v1.5+)
- ⏳ MERGE-08 — paired with PARALLEL-08; zero non-test production callers
```

**Complete v1.4 REQ-ID roster (per `.planning/REQUIREMENTS.md` Traceability table):**

PARALLEL-08, MERGE-08, NAMING-01, VCS-21, VCS-22, PARALLEL-07, LINT-06, CLEANUP-02, DOCS-08, DRIFT-01, DRIFT-02, DOCS-01, DOCS-02, DOCS-03, DOCS-04, DOCS-05, DOCS-06, DOCS-07, DOCS-09, PROJECT-01, CLEANUP-01, CLEANUP-03, CLEANUP-04, CLEANUP-05, CLEANUP-06, CLEANUP-07, TEST-17 — **27 REQ-IDs total** (MERGE-08 deferred-by-design, 7 from Phase 18 still pending at Wave 4 execute time).

**Reconciliation diff size estimate:** PROJECT.md `### Validated` currently runs L47-114 (67 lines). After reconciliation: roughly 90-110 lines (adds Phase 15/16 REQ-IDs + Phase 17 self-refs; preserves all parentheticals). Diff: ~25-45 net-additional lines, ~0 lines deleted.

**Reusability analysis (script vs inline):**

| Factor | Inline computation (recommended) | Permanent script |
|--------|----------------------------------|------------------|
| Effort | ~30 min researcher write | ~2 hr write + tests |
| Future cadence | One-shot; v1.5+ may re-run if needed | Required cadence at every milestone close |
| YAGNI fit | ✓ (REQUIREMENTS.md PROJECT-01: "NOT a recurring SDK verb") | ✗ (premature abstraction) |
| Architectural fit at v1.5 | If v1.5 introduces continuous reconciliation, file as new REQ then | Already-built script becomes the second consumer signal |

**Recommendation:** inline. Defer permanent-script question to v1.5+ if a second consumer emerges.

---

## Runtime State Inventory

> Phase 17 is docs+tests; no rename/refactor. Runtime State Inventory is N/A for this phase.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — phase touches docs + tests only | — |
| Live service config | None | — |
| OS-registered state | None | — |
| Secrets/env vars | None | — |
| Build artifacts | None — `tests/` does not require rebuilding `dist-cjs/` | — |

---

## Environment Availability

> Phase 17 has no external dependencies (pure docs/test/markdown edits + node:test execution).

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `node:test` runner | ✓ | (existing repo Node 18+ baseline) | — |
| `gsd-sdk query commit` | Per-theme commits during 17.03 | ✓ | shipped | — |
| `node scripts/audit-workflow-raw-git.cjs` | Precondition Q-01 verification | ✓ | shipped | — |
| `/gsd:docs-update --verify-only` | DOCS-09 close-gate re-run | ✓ | shipped | Local-only re-run (no CI per `feedback_fork_local_only_no_ci`) |
| `jj` / `git` | Theme 5 closure-id archaeology (already done during research) | ✓ | jj 0.41 colocated | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

---

## Validation Architecture

> `workflow.nyquist_validation` is not explicitly disabled in `.planning/config.json` — treat as ENABLED.

**The drift tests ARE the validation strategy for this phase.** Wave 2's two `node:test` files (`tests/architecture-counts.test.cjs` + `tests/command-count-sync.test.cjs`) lock prose claims to filesystem state going forward.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (Node 18+ built-in) |
| Config file | None — `node:test` reads `tests/*.test.cjs` directly |
| Quick run command | `node --test tests/architecture-counts.test.cjs tests/command-count-sync.test.cjs` |
| Full suite command | `npm test` (or whatever the repo currently uses; verified `tests/inventory-counts.test.cjs` runs under `node --test` per the existing pattern) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOCS-08 | ARCHITECTURE.md prose-counts match filesystem (9 en sites + 4 ja-JP + 4 ko-KR) | unit (live-scan) | `node --test tests/architecture-counts.test.cjs` | ❌ Wave 2 must ship |
| DRIFT-01 | `tests/architecture-counts.test.cjs` exists and is green | unit (existence + green) | `node --test tests/architecture-counts.test.cjs` | ❌ Wave 2 must ship |
| DRIFT-02 | INVENTORY.md `## Commands` table rows == `commands/gsd/*.md` count | unit (live-scan) | `node --test tests/command-count-sync.test.cjs` | ❌ Wave 2 must ship |
| DOCS-01..07 | per-theme prose fixes | manual + `/gsd:docs-update --verify-only` | `/gsd:docs-update --verify-only` | re-run |
| DOCS-09 | pass-rate ≥ 99% | manual close-gate | `/gsd:docs-update --verify-only` | re-run |
| PROJECT-01 | PROJECT.md `### Validated` covers every REQ-ID with correct phase + status | manual-only (no automated test) | grep-cross-check during plan-checker | — |

### Sampling Rate

- **Per task commit (17.01..17.03):** `git status` clean + relevant test green (after Wave 2 lands)
- **Per wave merge:** Re-run both new tests + `/gsd:docs-update --verify-only` cross-check
- **Phase gate:** All 12 REQ-IDs satisfied; full test suite green; PROJECT.md reconciliation reviewed

### Wave 0 Gaps

- [ ] `tests/architecture-counts.test.cjs` — covers DRIFT-01 + DOCS-08 (Wave 2 ships)
- [ ] `tests/command-count-sync.test.cjs` — covers DRIFT-02 (Wave 2 ships)
- [ ] `.planning/intel/docs-update-fix-triage.md` — CF-07 prerequisite for 17.03 execute (Wave 3 planner writes BEFORE execute)
- [ ] `.planning/intel/project-validated-truth.md` — Wave 4 first commit (machine pass)

**Framework install:** None needed. `node:test` is built-in.

---

## Risk Assessment + Pitfall Coverage Matrix

### Pitfall coverage matrix

| Pitfall / IP | Mitigation Lives In | Plan Owner |
|--------------|---------------------|------------|
| Pitfall 4 (drift-fix-before-test ordering) | Strict Wave 1 → Wave 2 sequencing; Wave 2 must_haves cite "17.01 committed before this plan starts" | 17.01 + 17.02 (jointly) |
| Pitfall 8 (PROJECT.md reconciliation over-automation) | Two-pass: machine emits `.planning/intel/project-validated-truth.md`; human edits PROJECT.md narrative | 17.04 |
| Pitfall 12 (per-theme commits) | Plan 17.03 commits per-theme (7 commits or planner-grouped); `.planning/intel/docs-update-fix-triage.md` written BEFORE execute per CF-07 | 17.03 |
| IP-3 (assert_clean_wc + Theme 1 author-machine path fix) | Theme 1 = single mechanical sed, single commit, single workflow step | 17.03 theme 1 |
| IP-4 (Reconciliation + new REQ-IDs) | Wave 4 LAST; truth source reads STATE.md current snapshot at execute time | 17.04 |

### Additional risks (Phase 17-specific)

| Risk | Severity | Mitigation |
|------|----------|------------|
| EN ARCHITECTURE.md has 4 ADDITIONAL drift sites beyond CONTEXT.md scope | MEDIUM | Researcher enumerated all 9 en sites (lines 121, 143, 181, 185, 267, 282, 337, 599); plan 17.01 must cover all 9 |
| pt-BR ARCHITECTURE.md has NO prose-counts | MEDIUM | Scope `architecture-counts.test.cjs` to en + ja-JP + ko-KR (3 locales); update CONTEXT.md CF-04 / ROADMAP SC1 narrative to clarify |
| INVENTORY.md `## Commands (67 shipped)` is itself drifted (live 68) | LOW | Wave 1 (17.01) must ALSO bump INVENTORY.md headline so `tests/inventory-counts.test.cjs` stays green |
| Wave 1 commits before all en sites enumerated → red Wave 2 | HIGH | This research enumerates the complete en site list; planner copies into 17.01 must_haves |
| 17.04 reconciliation references REQ-IDs from Phase 18 that haven't shipped | LOW | Wave 4 lists Phase 18 REQ-IDs as `⏳ Pending` not `✓ Validated`; per IP-4 they don't claim shipped state |
| ADR supersession-note text inadvertently violates ADR-immutability above the line | MEDIUM | Pattern 2 above prescribes append-only format; planner must verify no in-place edits to original ADR body |
| Theme 5 closure change_ids identified via `git log` may rotate when jj/git history is re-walked | LOW | Verified 2026-05-25 against `git log --all --oneline` and `jj log`; change_ids are stable. |

---

## Code Examples

### Live-scan headline regex (from `tests/inventory-counts.test.cjs:38`)

```javascript
// Source: tests/inventory-counts.test.cjs (verified verbatim 2026-05-25)
function headlineCount(label) {
  const re = new RegExp(`^##\\s+${label}\\s+\\((\\d+)\\s+shipped\\)`, 'm');
  const m = INVENTORY.match(re);
  assert.ok(m, `docs/INVENTORY.md is missing the "## ${label} (N shipped)" header`);
  return parseInt(m[1], 10);
}
```

**Applicability to ARCHITECTURE.md:** ARCHITECTURE.md does NOT use the `## {Label} (N shipped)` heading shape (those headlines live in INVENTORY.md). ARCHITECTURE.md uses `**Total {label}:** N` inline bold-prefix prose. Per-dimension regex per locale is the right shape (D-06 + Pattern 1 skeleton above).

### Filesystem count helper (from `tests/inventory-counts.test.cjs:44`)

```javascript
// Source: tests/inventory-counts.test.cjs (verified verbatim 2026-05-25)
function fsCount(relDir, filter) {
  return fs
    .readdirSync(path.join(ROOT, relDir))
    .filter((name) => fs.statSync(path.join(ROOT, relDir, name)).isFile())
    .filter(filter)
    .length;
}
```

### LOC counting (NEW for installer LOC)

```javascript
function installerLoc() {
  return fs.readFileSync(path.join(ROOT, 'bin/install.js'), 'utf8').split('\n').length - 1;
}
// Verified: matches `wc -l bin/install.js` = 10978 on 2026-05-25.
// The `-1` accounts for the trailing newline; if a file lacks trailing newline, this returns the
// `wc -l` value too because String.split returns N+1 entries for N newlines minus the empty tail.
```

### Per-theme commit message stems (Pitfall 12)

```bash
# Theme 1 — DOCS-01
gsd-sdk query commit "docs(17.03): theme 1 — replace author-machine path leaks in ja-JP/ko-KR superpowers plans (DOCS-01, 14 sites)" --files "docs/ja-JP/superpowers/plans/2026-03-18-materialize-new-project-config.md,docs/ko-KR/superpowers/plans/2026-03-18-materialize-new-project-config.md"

# Theme 2 — DOCS-02
gsd-sdk query commit "docs(17.03): theme 2 — update 3 translation specs to reference unified workspace command (DOCS-02, 7 sites)" --files "docs/ja-JP/superpowers/specs/2026-03-20-multi-project-workspaces-design.md,docs/ko-KR/superpowers/specs/2026-03-20-multi-project-workspaces-design.md,docs/pt-BR/superpowers/specs/2026-03-20-multi-project-workspaces-design.md"

# Theme 3 — DOCS-03
gsd-sdk query commit "docs(17.03): theme 3 — append supersession notes to ADR 0009 + 0010 (DOCS-03, 7 issues)" --files "docs/adr/0009-shell-command-projection-module.md,docs/adr/0010-file-operation-engine-module.md"

# Theme 4 — DOCS-04
gsd-sdk query commit "docs(17.03): theme 4 — fix renamed-hook + missing-helper references (DOCS-04, 5 sites)" --files "docs/USER-GUIDE.md,docs/FEATURES.md,docs/AGENTS.md,docs/CONTRIBUTING.md,CHANGELOG.md"

# Theme 5 — DOCS-05
gsd-sdk query commit "docs(17.03): theme 5 — anchor phase-3 archived references to closure change_ids (DOCS-05, 3 sites)" --files "docs/test-triage/jj-bugs.md"

# Theme 7 — DOCS-06
gsd-sdk query commit "docs(17.03): theme 7 — fix pt-BR translation date/link mismatches (DOCS-06, 3 sites)" --files "docs/pt-BR/superpowers/README.md,docs/pt-BR/superpowers/specs/2026-03-20-multi-project-workspaces-design.md,docs/pt-BR/superpowers/plans/2026-03-18-materialize-new-project-config.md"

# Theme 8 — DOCS-07
gsd-sdk query commit "docs(17.03): theme 8 — singleton path-rewrites: lint-no-source-grep, USER-PROFILE qualifier, mutation-subprocess note (DOCS-07, 3 sites)" --files "CONTEXT.md,docs/ja-JP/AGENTS.md,CHANGELOG.md,docs/AGENTS.md"

# DOCS-09 close-gate (optional separate task)
gsd-sdk query commit "docs(17.03): docs-update verify-only close-gate (DOCS-09) — pass rate ≥ 99%" --files ".planning/intel/docs-update-verify-only-2026-05-25-postfix-pass-rate.md"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual prose-count maintenance across en + 3 translations | Live-scan drift tests locking prose to filesystem | This phase (17.02) | Future drift fails CI/local test, not at human-spot-check time |
| Bulk-edit doc fixes | Per-theme commits with per-theme acceptance criteria | This phase (17.03 per Pitfall 12) | Forensic bisect granularity preserved |
| PROJECT.md as hand-written narrative drifting per milestone | Two-pass machine truth + human narrative reconciliation | This phase (17.04 per Pitfall 8) | Reconciliation cadence becomes proportional to milestone close |
| ADRs occasionally edited in-place | Append-only `## Update YYYY-MM-DD` supersession notes (already convention; reinforced here) | Already convention; this phase reinforces | ADR audit trail preserved |

**Deprecated/outdated:**
- The aspirational `mutation-subprocess.integration.test.ts` file (referenced in CHANGELOG.md:389 since #2302) — never shipped, drifted into "documented but absent" state.

---

## Assumptions Log

All assumptions tagged `[ASSUMED]` in this research:

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Planner picks "nearest 1000" rounding for D-03 installer LOC drift assertion | Pattern 1 skeleton, DRIFT-01 | If planner picks tolerance-window form, the test skeleton above needs `assert.ok(Math.abs(...))` instead of `strictEqual(bucket, bucket)`. Both shapes work. |
| A2 | Planner picks "inline computation" over "permanent script" for PROJECT-01 truth file | PROJECT-01 reusability analysis | If planner picks permanent script, that's a v1.5+ deferred deliverable; out of phase scope per REQUIREMENTS.md OOS. |
| A3 | DOCS-09 lives as separate task in plan 17.03 (not folded into final commit) | DOCS-09 entry | Either choice is valid per CONTEXT.md Claude's Discretion. |
| A4 | pt-BR ARCHITECTURE.md stays out of `architecture-counts.test.cjs` scope | EN/translation drift inventory, DRIFT-01 dim matrix | If planner chooses to add a structural-presence-only check for pt-BR, additional 1 leaf assertion added; no day-1 red. |
| A5 | D-08 USER-PROFILE.md qualifier applied to BOTH en + ja-JP | DOCS-07 table | If planner fixes only ja-JP, en stays inconsistent — file as v1.5+ verifier-tuning todo. |
| A6 | D-09 fix is in-line strip of `mutation-subprocess.integration.test.ts` from CHANGELOG L389 parenthetical | DOCS-07 table | Either strip OR append-only correction note are valid per CONTEXT.md D-09 fallback path. |
| A7 | INVENTORY.md `## Commands (67 shipped)` headline gets fixed in Wave 1 alongside ARCHITECTURE.md drift | DRIFT-02 entry, risk #3 | If not fixed in Wave 1, `tests/inventory-counts.test.cjs` will RED. Planner should treat as part of 17.01 scope. |
| A8 | INVENTORY.md L9 (test-name self-reference) auto-resolves when 17.02 lands (per D-10 auto-resolve path) | INVENTORY interactions | Verified: L9 lists `tests/architecture-counts.test.cjs` and `tests/command-count-sync.test.cjs` already; verifier flags them as "claimed but missing" today. Once Wave 2 ships, those claims become true and the failure auto-clears. |

**Assumptions that need user/planner confirmation before execution:**
- A1, A2, A3, A4, A5, A6 — all are Claude's Discretion areas per CONTEXT.md; planner picks during plan-phase.

---

## Open Questions

Two narrow items the discuss-phase punted that the researcher could not fully resolve:

### 1. pt-BR scope decision finality

**What we know:** pt-BR ARCHITECTURE.md has no numeric prose-counts (verified 2026-05-25). CONTEXT.md CF-04 + ROADMAP SC1 list all 4 active locales as in-scope. The all-strict D-04 framing assumes all 4 locales carry the dimensions.

**What's unclear:** Should plan-phase amend CONTEXT.md to drop pt-BR, OR scope the test to 3 locales silently? OR add a structural-presence-only check for pt-BR (e.g., assert `docs/pt-BR/ARCHITECTURE.md` exists + is non-empty)?

**Recommendation:** Plan 17.02 scopes to 3 locales; planner adds a one-line note in 17.02 PLAN.md narrative explaining pt-BR exclusion + cites this research. If pt-BR ever grows prose-counts (e.g., a translator does a deeper pass), file as v1.5+ to extend the test.

### 2. en `docs/AGENTS.md:404` USER-PROFILE.md symmetry

**What we know:** The en docs use the IDENTICAL unqualified `USER-PROFILE.md` prose at L404. The verify-only audit flagged only ja-JP at L389 (the audit was per-doc, no cross-locale symmetry check).

**What's unclear:** Whether the en line should be left unqualified (preserving current en convention as canonical) OR also qualified (preferring qualified-path-everywhere). Pure D-08 framing says ja-JP only; symmetry says both.

**Recommendation:** Planner picks. If "ja-JP only" (mirror CONTEXT.md D-08), file the en inconsistency as a v1.5+ verifier-tuning todo. If "both" (preferred for clean future audits), DOCS-04's commit also touches `docs/AGENTS.md:404`.

---

## Sources

### Primary (HIGH confidence)

- `tests/inventory-counts.test.cjs` (read full file, verified verbatim) — verbatim template per CF-02.
- `docs/INVENTORY.md` (read full file, line numbers verified) — drift target for DRIFT-02 + headline count source.
- `docs/ARCHITECTURE.md` (read lines 115-205, 593-607, full grep for `INVENTORY.md` refs) — en drift inventory (lines 121, 143, 181, 185, 267, 282, 337, 599 enumerated).
- `docs/ja-JP/ARCHITECTURE.md` (read lines 110-145, 420-435) — ja-JP drift inventory confirmed (lines 116, 127, 137, 427).
- `docs/ko-KR/ARCHITECTURE.md` (grep-and-read lines 116, 127, 137, 427) — ko-KR drift inventory confirmed.
- `docs/pt-BR/ARCHITECTURE.md` (read full file — 81 lines) — confirmed no prose-counts.
- `bin/install.js` (`wc -l`) — verified 10,978 lines.
- `.planning/REQUIREMENTS.md` — read full file; v1.4 REQ-ID roster + Out of Scope clauses verified.
- `.planning/STATE.md` (lines 1-298) — current REQ-ID status snapshot for 17.04 reconciliation.
- `.planning/ROADMAP.md` (lines 1-374) — Phase 17 SC1-5 narrative + plan structure.
- `.planning/phases/17-drift-control-reconciliation/17-CONTEXT.md` — locked discussion decisions D-01..D-11 + CF-01..CF-07.
- `.planning/v1.4-MILESTONE-AUDIT.md` — BLOCKER B1 closure context.
- `.planning/research/PITFALLS.md` (lines 1-535) — Pitfall 4, 8, 12, IP-3, IP-4 verbatim.
- `.planning/todos/pending/v14-docs-verify-only-followups.md` — 8 themes + per-theme drift counts + acceptance criteria.
- `docs/adr/0009-shell-command-projection-module.md` — full read; supersession-note format verified.
- `docs/adr/0010-file-operation-engine-module.md` — header + drift sites verified.
- `docs/test-triage/jj-bugs.md` (lines 1-50) — Theme 5 dangling references at L5, L8, L33 confirmed.
- `git log --all --oneline` (filtered for Phase 3 closure) — change_ids `41db442f`, `e190eee3`, `2fbcd590` extracted.
- `git log -S 'mutation-subprocess.integration'` + `find . -name '*mutation-subprocess*'` — confirmed file never existed; aspirational reference only.
- `sdk/src/golden/golden-mutation-covered.ts` — header docstring "*see `mutation-subprocess.integration.test.ts` when present*. Empty until those tests land".

### Secondary (MEDIUM confidence)

- `sdk/HANDOVER-GOLDEN-PARITY.md` (grep + read context) — corroborates D-09 archaeology (file referenced as planned-not-shipped in multiple handover docs).
- `.planning/MILESTONES.md` (top 50 lines) — v1.3 shipped accomplishments cite-able from for PROJECT-01 reconciliation.

### Tertiary (LOW confidence)

- None — every claim in this research is verified against the live filesystem or against committed `.planning/` artifacts at research time.

---

## Metadata

**Confidence breakdown:**
- Per-locale drift enumeration: **HIGH** — every line number and current text verified by direct read.
- Live filesystem counts: **HIGH** — verified via shell commands at research time.
- Drift-test architecture: **HIGH** — template file read verbatim; pattern is mechanical.
- Theme 3 ADR supersession-note text: **HIGH** — drafted text grounded in current ADR content + current code-surface verification.
- Theme 5 closure change_ids: **HIGH** — extracted from `git log` against the verified commit-message strings cited in `docs/test-triage/jj-bugs.md:50` footer.
- Theme 8 D-09 archaeology: **HIGH** — file's never-shipped status confirmed via multi-source grep + `sdk/src/golden/golden-mutation-covered.ts` docstring.
- PROJECT-01 truth-file shape: **MEDIUM** — shape inferred from PROJECT.md current `### Validated` structure; planner refines during execute.
- pt-BR scope recommendation: **MEDIUM** — pt-BR file structural reality verified; the policy decision (drop / structural-only / extend) is planner's call.

**Research date:** 2026-05-25
**Valid until:** Wave 1 commit lands (which changes all the line numbers cited here). Pre-execute, planner should re-grep the line numbers in case unrelated edits shifted them.

---

## RESEARCH COMPLETE

**Phase:** 17 — drift-control-reconciliation
**Confidence:** HIGH

### Key Findings

1. **EN ARCHITECTURE.md has 9 drift sites** (4 BEYOND CONTEXT.md D-02 scope: lines 185, 267, 282, 337) — Wave 1 (17.01) must cover ALL 9, not just line 599.
2. **pt-BR ARCHITECTURE.md has NO numeric prose-counts** — drift test scopes to 3 locales (en + ja-JP + ko-KR), 12 leaf assertions total.
3. **Theme 5 closure change_ids identified:** `41db442f` (03-07 closure), `e190eee3`/`2fbcd590` (03-06 closure).
4. **Theme 8 D-09 RESOLVED:** `mutation-subprocess.integration.test.ts` was never shipped — fix is in-line strip OR append-only correction note (planner picks per CONTEXT.md D-09 fallback).
5. **INVENTORY.md `## Commands (67 shipped)` is itself drifted** (live 68) — 17.01 should bump headline alongside ARCHITECTURE.md to keep `tests/inventory-counts.test.cjs` green.
6. **PROJECT-01 reusability:** inline computation, NOT permanent script. REQUIREMENTS.md PROJECT-01 explicitly OOS for "recurring SDK verb."

### File Created

`.planning/phases/17-drift-control-reconciliation/17-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Per-locale drift line numbers | HIGH | Direct read of all 3 locale files |
| Live filesystem counts | HIGH | Shell-verified 2026-05-25 |
| Test template shape | HIGH | Verbatim copy of existing `inventory-counts.test.cjs` |
| Theme 5 / 8 archaeology | HIGH | `git log -S` + filesystem search produced clear resolutions |
| PROJECT.md reconciliation shape | MEDIUM | Truth-file shape is researcher-recommended; planner refines |
| pt-BR scope policy | MEDIUM | Filesystem reality verified; policy decision is planner's |

### Open Questions

1. pt-BR test scope finality (recommendation: 3-locale scope, document carve-out).
2. en `docs/AGENTS.md:404` USER-PROFILE.md symmetry (recommendation: also qualify en; planner picks).

### Ready for Planning

Research complete. Planner has every line number, label, regex, change_id, and supersession-note text needed to draft 17.01..17.04 PLAN.md files without additional codebase archaeology.
