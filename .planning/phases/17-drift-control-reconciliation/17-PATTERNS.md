# Phase 17: Drift control + reconciliation - Pattern Map

**Mapped:** 2026-05-25
**Files analyzed:** 4 NEW + ~20 MODIFIED across 4 waves
**Analogs found:** all NEW files matched (4/4); MODIFIED files are prose-edit class — analog is the existing file itself.

## File Classification

### NEW files

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `tests/architecture-counts.test.cjs` | NEW test (drift-control, `node:test`) | request-response (filesystem read → assert) | `tests/inventory-counts.test.cjs` | exact (verbatim-copy template per CF-02 + ROADMAP SC1) |
| `tests/command-count-sync.test.cjs` | NEW test (drift-control, `node:test`) | request-response (filesystem read → assert) | `tests/inventory-counts.test.cjs` | exact (verbatim-copy template per CF-02 + ROADMAP SC1) |
| `.planning/intel/docs-update-fix-triage.md` | NEW intel artifact (per-theme triage table) | static-document | `.planning/intel/id-namespace-audit.md` | role-match (per-finding triage table; same `.planning/intel/` directory) |
| `.planning/intel/project-validated-truth.md` | NEW intel artifact (machine-generated truth source) | static-document | `.planning/intel/vcs-adapter-surface-audit.md` | role-match (verdict-table intel artifact in same directory) |

### MODIFIED files

| Modified File | Role | Data Flow | Edit Class |
|---------------|------|-----------|------------|
| `docs/INVENTORY.md` | EXISTING-prose-edit | static-document | headline bump (`67 shipped` → `68 shipped`) |
| `docs/ARCHITECTURE.md` | EXISTING-prose-edit | static-document | 5 sites (L185, L267, L282, L337, L599) per RESEARCH §Per-Item |
| `docs/ja-JP/ARCHITECTURE.md` | EXISTING-prose-edit | static-document | 4 sites (L116, L127, L137, L427) |
| `docs/ko-KR/ARCHITECTURE.md` | EXISTING-prose-edit | static-document | 4 sites (L116, L127, L137, L427) |
| `docs/pt-BR/ARCHITECTURE.md` | EXISTING-prose-edit | static-document | **no edit** (RESEARCH confirmed: 81-line summary, no numeric prose-counts) |
| `docs/adr/0009-shell-command-projection-module.md` | EXISTING-ADR-supersession | static-document, append-only | Append `## Update — 2026-05-25 (Phase 17, DOCS-03)` |
| `docs/adr/0010-file-operation-engine-module.md` | EXISTING-ADR-supersession | static-document, append-only | Append `## Update — 2026-05-25 (Phase 17, DOCS-03)` BELOW existing supersession header |
| `CHANGELOG.md` (L346 + L389) | EXISTING-CHANGELOG-correction | static-document | L346 path-rewrite (Theme 4 D-01); L389 strip filename or append correction note (Theme 8 D-09) |
| `CONTRIBUTING.md:403` | EXISTING-prose-edit | static-document | path-rewrite `scripts/` → `get-shit-done/bin/` |
| `CONTEXT.md:610` | EXISTING-prose-edit | static-document | path-rewrite `tests/` → `scripts/` (D-07) |
| `docs/AGENTS.md:404` + `docs/ja-JP/AGENTS.md:389` | EXISTING-prose-edit | static-document | add `$HOME/.claude/` qualifier (D-08) |
| `docs/test-triage/jj-bugs.md` (L5, L8, L33) | EXISTING-prose-edit | static-document | closure change_id anchoring (`41db442f`, `2fbcd590`) |
| `docs/{ja-JP,ko-KR}/superpowers/plans/2026-03-18-materialize-new-project-config.md` | EXISTING-prose-edit | static-document | 14 sites mechanical sed sweep (DOCS-01) |
| `docs/{ja-JP,ko-KR,pt-BR}/superpowers/specs/2026-03-20-multi-project-workspaces-design.md` | EXISTING-prose-edit | static-document | 7 sites (DOCS-02) |
| `docs/pt-BR/superpowers/{plans,README,specs}/...` | EXISTING-prose-edit | static-document | 3 date/link fixes (DOCS-06) |
| `.planning/PROJECT.md` `### Validated` | EXISTING-prose-edit | static-document, human-edited | Two-pass narrative; cite truth source, preserve parentheticals |

---

## Pattern Assignments

### `tests/architecture-counts.test.cjs` (NEW test, drift-control)

**Analog:** `tests/inventory-counts.test.cjs` (verbatim-copy template per CF-02; ROADMAP SC1 explicit)

**Imports + setup pattern** (`tests/inventory-counts.test.cjs:1-26`):

```javascript
'use strict';

// allow-test-rule: pending-migration-to-typed-ir [#2974]
// Tracked in #2974 for migration to typed-IR assertions per CONTRIBUTING.md
// "Prohibited: Raw Text Matching on Test Outputs". Per-file review may
// reclassify some entries as source-text-is-the-product during migration.

/**
 * Locks docs/INVENTORY.md's "(N shipped)" headline counts against the
 * filesystem for each of the six families. INVENTORY.md is the
 * authoritative roster — if a surface ships, its row must exist here
 * and the headline count must match ls.
 *
 * Both sides are computed at test runtime — no hardcoded numbers.
 *
 * Related: docs readiness refresh, lane-12 recommendation.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const INVENTORY_MD = path.join(ROOT, 'docs', 'INVENTORY.md');
const INVENTORY = fs.readFileSync(INVENTORY_MD, 'utf8');
```

**`FAMILIES` table pattern** (`tests/inventory-counts.test.cjs:28-35`) — adapt to a `LOCALES` + `DIMENSIONS` cross-product for the new test:

```javascript
const FAMILIES = [
  { label: 'Agents',      dir: 'agents',                      filter: (f) => /^gsd-.*\.md$/.test(f) },
  { label: 'Commands',    dir: 'commands/gsd',                filter: (f) => f.endsWith('.md') },
  { label: 'Workflows',   dir: 'get-shit-done/workflows',     filter: (f) => f.endsWith('.md') },
  { label: 'References',  dir: 'get-shit-done/references',    filter: (f) => f.endsWith('.md') },
  { label: 'CLI Modules', dir: 'get-shit-done/bin/lib',       filter: (f) => f.endsWith('.cjs') },
  { label: 'Hooks',       dir: 'hooks',                       filter: (f) => /\.(js|sh)$/.test(f) },
];
```

**`headlineCount(label)` helper** (`tests/inventory-counts.test.cjs:37-42`) — base for per-locale regex extraction (D-06):

```javascript
function headlineCount(label) {
  const re = new RegExp(`^##\\s+${label}\\s+\\((\\d+)\\s+shipped\\)`, 'm');
  const m = INVENTORY.match(re);
  assert.ok(m, `docs/INVENTORY.md is missing the "## ${label} (N shipped)" header`);
  return parseInt(m[1], 10);
}
```

**`fsCount(relDir, filter)` helper** (`tests/inventory-counts.test.cjs:44-50`) — copy verbatim:

```javascript
function fsCount(relDir, filter) {
  return fs
    .readdirSync(path.join(ROOT, relDir))
    .filter((name) => fs.statSync(path.join(ROOT, relDir, name)).isFile())
    .filter(filter)
    .length;
}
```

**`describe(...) { for {...test(...)} }` skeleton** (`tests/inventory-counts.test.cjs:52-64`) — repeat per locale:

```javascript
describe('docs/INVENTORY.md headline counts match the filesystem', () => {
  for (const { label, dir, filter } of FAMILIES) {
    test(`"${label} (N shipped)" matches ${dir}/`, () => {
      const documented = headlineCount(label);
      const actual = fsCount(dir, filter);
      assert.strictEqual(
        documented,
        actual,
        `docs/INVENTORY.md "${label} (${documented} shipped)" disagrees with ${dir}/ file count (${actual}) — update the headline and the row list`,
      );
    });
  }
});
```

**Phase 17 customizations on top of the template (per RESEARCH §DRIFT-01):**

1. Replace the single `INVENTORY_MD` read with a `LOCALES` array (en + ja-JP + ko-KR; pt-BR excluded — RESEARCH key finding #2).
2. Replace `FAMILIES` with per-locale `labels` regex sets (D-06 per-locale strategy).
3. Add `installerLoc()` helper (counts `bin/install.js` lines via `readFileSync(...).split('\n').length - 1`).
4. Replace `assert.strictEqual(documented, actual)` for installer-LOC dimension with the rounded-bucket assertion (D-03):
   ```javascript
   const documentedBucket = Math.round(documented / 1000) * 1000;
   const actualBucket     = Math.round(actual / 1000) * 1000;
   assert.strictEqual(documentedBucket, actualBucket, ...);
   ```
5. Wrap each locale in its own `describe(...)` block per D-05 (`describe('en source', ...)`, `describe('ja-JP translation', ...)`, etc.).
6. Cross-link header comment to `tests/command-count-sync.test.cjs` and `tests/inventory-counts.test.cjs` per CF-03.

**Full assembled skeleton** is in `17-RESEARCH.md` §Pattern 1 (`<Pattern 1: Verbatim-copy template skeleton>`, lines 237-301). Planner copies that block verbatim with the per-locale regex tables from §DRIFT-01 (`EN_LABELS`, `JA_LABELS`, `KO_LABELS` constants — RESEARCH lines 467-495).

---

### `tests/command-count-sync.test.cjs` (NEW test, drift-control)

**Analog:** `tests/inventory-counts.test.cjs` (same verbatim-copy template; CF-03 mandates separate file)

**Imports pattern:** identical to `architecture-counts.test.cjs` (see above).

**Section-extraction pattern** (`tests/inventory-counts.test.cjs:37-42` adapted) — extract the `## Commands (N shipped)` section to the next `## ` heading, then count `| \`/gsd-...\`` table rows:

```javascript
// Per RESEARCH §DRIFT-02 (research lines 538-546):
function commandsTableRowCount() {
  const start = INVENTORY.indexOf('## Commands ');
  const next  = INVENTORY.indexOf('\n## ', start + 1);
  const section = INVENTORY.slice(start, next === -1 ? INVENTORY.length : next);
  const matches = section.match(/^\|\s+`\/gsd-[^`]+`/gm) || [];
  return matches.length;
}
```

**Filesystem count pattern** (`tests/inventory-counts.test.cjs:44-50` copied verbatim):

```javascript
function filesystemCommandCount() {
  return fs.readdirSync(COMMANDS_DIR)
    .filter((name) => fs.statSync(path.join(COMMANDS_DIR, name)).isFile())
    .filter((name) => name.endsWith('.md'))
    .length;
}
```

**`describe(...) + test(...)` block** (single check; copy the inventory-counts skeleton at lines 52-64):

```javascript
describe('docs/INVENTORY.md ## Commands table row count matches commands/gsd/', () => {
  test('row count equals filesystem command file count', () => {
    const documented = commandsTableRowCount();
    const actual = filesystemCommandCount();
    assert.strictEqual(documented, actual,
      `INVENTORY.md ## Commands table has ${documented} rows but commands/gsd/ has ${actual} .md files`);
  });
});
```

**Cross-link header comment** to `tests/architecture-counts.test.cjs` per CF-03 (single-responsibility separation, separate failure message).

**Full skeleton** is in `17-RESEARCH.md` §DRIFT-02 (lines 524-562). Planner copies verbatim.

---

### `.planning/intel/docs-update-fix-triage.md` (NEW intel artifact)

**Analog:** `.planning/intel/id-namespace-audit.md` (per-finding triage table in same directory)

**Header pattern** (`.planning/intel/id-namespace-audit.md:1-6`):

```markdown
# Id Namespace Audit — Phase 8 (D-01)

**Generated:** 2026-05-15
**Total findings:** 101
**Verdict counts:** safe=13, flip-clean=30, needs-rename=43, needs-resolveShort=7, boundary-io=2, historical-prose=6, unclear=0
**Risk 4 (jj 0.41 NDJSON schema):** see `.planning/intel/jj-041-ndjson-probe.md` — VERIFIED GREEN.
```

Phase 17 adaptation — first line should be `# Docs-Update Verify-Only Fix Triage — Phase 17 (CF-07)`; counts row = `**Total themes:** 7` plus per-theme acceptance summaries.

**Verdict legend pattern** (`.planning/intel/id-namespace-audit.md:8-16`):

```markdown
## Verdict legend

- `safe` — no flip needed; already correct (git-only fixtures, git-side data constants, allowlist data values)
- `flip-clean` — straightforward rename or template flip (jj backend templates, parser reads, type-driven consumer renames)
- `needs-rename` — type-level rename ...
```

Phase 17 adaptation — legend should enumerate the resolution-class taxonomy for the 7 themes: `path-rewrite`, `adr-supersession-append`, `change-id-anchor`, `qualifier-add`, `filename-strip`, `rename-file`, `link-rewrite`.

**Per-finding table pattern** (`.planning/intel/id-namespace-audit.md:20-23`):

```markdown
## Findings

| # | File:line | Pattern | Caller use | Verdict | Notes |
|---|-----------|---------|------------|---------|-------|
| 1 | `sdk/src/query/commit.test.ts:170` | `hash_field_access` | `expect(...)...` | needs-rename | Plan 2 FLIP-03: ... |
```

Phase 17 adaptation — columns become `| Theme | REQ-ID | File:line | Drift | Verdict | Acceptance criterion |`. One row per theme (with sub-rows allowed for Theme 8 singletons since D-07, D-08, D-09 each have distinct resolutions).

**Why this analog:** both files (a) live under `.planning/intel/`, (b) record per-finding decisions BEFORE execute, (c) cite a verdict legend, (d) cite REQ-IDs / phase plan IDs in the Notes column. Same shape, different domain.

---

### `.planning/intel/project-validated-truth.md` (NEW intel artifact)

**Analog:** `.planning/intel/vcs-adapter-surface-audit.md` (verdict-table intel artifact in same directory; pre-discuss-phase computation that downstream prose consumes)

**Header pattern** (`.planning/intel/vcs-adapter-surface-audit.md:1-4`):

```markdown
# VcsAdapter Surface Audit — Drop Git-Only Concepts

**Authored:** 2026-05-11
**Purpose:** Pre-discuss-phase intel for the proposed Phase 2.5 (VCS Abstraction Audit). Catalogues every verb / field / factory currently on the cross-backend surface, evaluates against the architectural rule, and lists call-site impact.
```

Phase 17 adaptation — first line `# PROJECT.md ### Validated — Machine Truth Source (Phase 17, PROJECT-01 pass 1/2)`; Purpose line cites Pitfall 8 + IP-4 + REQUIREMENTS.md PROJECT-01.

**Verdict-legend pattern** (`.planning/intel/vcs-adapter-surface-audit.md:17-22`):

```markdown
Legend:
- ✅ **KEEP** — direct jj equivalent exists
- 🔧 **KEEP (reshape)** — concept exists in both but current shape leaks git terminology / git-only fields
- 🚫 **REMOVE** — no jj equivalent; fold callers into a cross-backend verb
- ➡️ **MOVE → gitOnly** — concept is git-flavored; preserve via `vcs.gitOnly.*` narrowing
```

Phase 17 adaptation — status legend becomes `✅ Validated`, `🟡 Active (in-progress)`, `⏸️ Deferred`, `❌ Rejected`, mirroring STATE.md's status taxonomy.

**Per-row table pattern** (`.planning/intel/vcs-adapter-surface-audit.md:25-36` — one row per surface element):

```markdown
| Verb | Verdict | Notes | Call sites |
|------|---------|-------|------------|
| `commit(input: CommitInput)` | 🔧 KEEP (reshape) | Collapse `files` / `pathspec` ... | many |
| `log(opts?: LogOpts)` | ✅ KEEP | `jj log` exists; `allRefs` maps to jj `all()` revset | many |
```

Phase 17 adaptation — one bullet (or row) per REQ-ID across `.planning/REQUIREMENTS.md` + `.planning/milestones/v{1.1,1.2,1.3}-REQUIREMENTS.md`. Columns: `| REQ-ID | Milestone | Phase | Status | Closure commit/note |`. Sourcing rules (per CF-06 + Pitfall 8):

- REQ-ID list: read from each `*REQUIREMENTS.md` table.
- Status: cross-reference with `.planning/STATE.md`.
- Closure note: pull from `.planning/phases/*/SUMMARY.md` files (one-liner per REQ-ID).

**Why this analog:** both files (a) live in `.planning/intel/`, (b) are machine-computed truth sources that downstream prose (PROJECT.md `### Validated` here; CONTEXT.md / phase design here) consumes, (c) preserve forensic traceability (call sites / closure commits), (d) use a structured table + status legend.

**One-shot vs script:** per RESEARCH recommendation, this file is inline researcher computation during 17.04 execute. NO `scripts/reconcile-project-validated.cjs` (Pitfall 8 / OOS / YAGNI per RESEARCH lines 51, 130).

---

### `docs/adr/0010-file-operation-engine-module.md` (EXISTING-ADR-supersession, Theme 3)

**Analog:** `docs/adr/0009-shell-command-projection-module.md:113-131` (the existing `## Update — 2026-05-13` block — already in the repo as a precedent for the append-only pattern)

**Update-section header pattern** (`docs/adr/0009-shell-command-projection-module.md:113`):

```markdown
## Update — 2026-05-13 (Phases 1–4 expansion, `#3465`–`#3468`)
```

Phase 17 form: `## Update — 2026-05-25 (Phase 17, DOCS-03)` per CF-05 + Pattern 2 in RESEARCH.

**Body shape pattern** (`docs/adr/0009-shell-command-projection-module.md:115-131`) — one-paragraph opener explaining the scope of the update, then a bullet list of concrete drift items each citing the line being superseded, ending with a closing line that defers narrative-level explanation to CONTEXT.md or the supersession ADR:

```markdown
The seam grew beyond the original "rendering only" scope. The "does not become a generic command runner" and "does not replace safe internal subprocess APIs" constraints (Decision §17, Initial Scope §33) were intentionally superseded.

**Scope now owned by `shell-command-projection.cjs`:**

- runtime-aware command-text rendering (original ADR scope)
- subprocess dispatch — `execGit`, `execNpm`, `execTool`, `probeTty` (Phase 2, `#3466`)
- platform file I/O — `platformWriteSync`, `platformReadSync`, `platformEnsureDir`, `normalizeContent` (Phase 3, `#3467`)
- legacy wrappers `atomicWriteFileSync` / `safeReadFile` / `normalizeMd` removed from `core.cjs` (Phase 4, `#3468`)

...

See CONTEXT.md "Shell Command Projection Module" entry for the canonical current-state description.
```

Phase 17 customization (per RESEARCH §DOCS-03 lines 596-606):

- Lead with a one-line purpose stating "drift items surfaced by `/gsd:docs-update --verify-only`".
- Bullet each drift line (L7, L36, L37, L50, L52) with the corrected fact.
- For ADR 0010, INSERT BELOW the existing "Superseded by ADR-0009" header (line 3) — NOT above it; ADR immutability per Integration Gotchas.
- Close with the standard "The body above this line records the original ... verbatim. Subsequent drift is captured here per ADR-supersession convention." footer.

**Concrete text** for both ADRs is drafted in RESEARCH §Pattern 2 (lines 311-320 for ADR 0009) and §DOCS-03 (lines 596-606 for ADR 0010). Planner copies directly.

---

### `docs/test-triage/jj-bugs.md` (EXISTING-prose-edit, Theme 5)

**Analog:** the file itself (existing in-line references). The pattern is closure-change_id anchoring, not a code import.

**Closure change_ids** (verified by RESEARCH §DOCS-05 lines 626-630 via `git log` archaeology):

| Phase-3 artifact | Closure commit (change_id) | Commit message |
|------------------|----------------------------|----------------|
| `03-07-PLAN.md` | `41db442f` | `docs(03-07): phase-close finalization — REQUIREMENTS / ROADMAP / STATE / triage / tracker / SUMMARY` |
| `03-RESEARCH.md` | `41db442f` (same closure commit) | (Phase 3 research synthesis archived together) |
| `03-06-PLAN.md` | `2fbcd590` | `docs(03-06): complete push/fetch + workspace + TEST-08 triage plan` |

**Rewrite pattern** (per RESEARCH §Pattern 3 lines 330-334):

| Site | Current text | Replacement |
|------|--------------|-------------|
| `docs/test-triage/jj-bugs.md:5` | `(03-07-PLAN.md)` | `(Phase 3 plan 03-07 closure commit \`41db442f\` — docs(03-07): phase-close finalization, 2026-05-12)` |
| `docs/test-triage/jj-bugs.md:8` | `(03-RESEARCH.md)` | `(Phase 3 research synthesis archived; see closure commit \`41db442f\` 2026-05-12)` |
| `docs/test-triage/jj-bugs.md:33` | `(03-06-PLAN.md)` | `(Phase 3 plan 03-06 closure commit \`2fbcd590\` — docs(03-06): complete push/fetch + workspace + TEST-08 triage plan)` |

**Do NOT:** delete the lines (destroys forensic trail per Pitfall 12).

---

### `docs/ARCHITECTURE.md` (en) + 3 translations (EXISTING-prose-edit, DOCS-08)

**Analog:** none needed — the edits are concrete site-by-site rewrites enumerated in RESEARCH §Per-Item.

**Per-locale exact edits** are pinned in RESEARCH lines 431-458:

- en (9 sites — RESEARCH lines 431-440): L121/L143/L181 KEEP; L185 (`references-41-shipped` → `references-60-shipped`); L267 (`hooks-11-shipped` + `11-hook` → `hooks-12-shipped` + `12-hook`); L282 (`cli-modules-33-shipped` → `cli-modules-59-shipped`); L337 (`21 primary` / `10 advanced` / `agents-31-shipped` / `31-agent` → `21 primary` / `12 advanced` / `agents-33-shipped` / `33-agent`); L599 (`~10,700 lines` → `~11,000 lines`, D-03 rounded-bucket).
- ja-JP (4 sites — RESEARCH lines 446-449): L116/L127/L137 (44→68, 46→89, 16→33); L427 (約3,000行 → 約11,000行).
- ko-KR (4 sites — RESEARCH lines 454-457): L116/L127/L137 (44→68, 46→89, 16→33); L427 (~3,000줄 → ~11,000줄).
- pt-BR: **no edit** — RESEARCH §DOCS-08 line 460 confirms file has no numeric prose-counts.

**Pattern:** EXISTING-prose-edit; no code analog required. Wave 1 commits all locales atomically per Pitfall 4 + D-04.

**Same-commit additional fix** (RESEARCH §DRIFT-02 line 520 notes a pre-existing INVENTORY drift): Wave 1 should ALSO bump `docs/INVENTORY.md` `## Commands (67 shipped)` → `## Commands (68 shipped)` to keep `tests/inventory-counts.test.cjs` green when Wave 2 lands.

---

### Theme 4 path-rewrites: `CONTRIBUTING.md:403`, `CHANGELOG.md:346`, + theme 8 D-07 `CONTEXT.md:610` (EXISTING-prose-edit)

**Analog:** none needed — mechanical path-rewrites.

| Site | Find | Replace |
|------|------|---------|
| `CONTRIBUTING.md:403` | `scripts/verify-reapply-patches.cjs` | `get-shit-done/bin/verify-reapply-patches.cjs` |
| `CHANGELOG.md:346` | `scripts/verify-reapply-patches.cjs` | `get-shit-done/bin/verify-reapply-patches.cjs` OR keep historical path with `(now at get-shit-done/bin/...)` parenthetical |
| `CONTEXT.md:610` | `tests/lint-no-source-grep.cjs` | `scripts/lint-no-source-grep.cjs` |

Evidence trail: `.changeset/jolly-newts-roam.md` + `.changeset/happy-jays-greet.md` (D-01, issue #2994) — verified during discuss + RESEARCH.

---

### Theme 1 + Theme 2 + Theme 7 mechanical sweeps (EXISTING-prose-edit)

**Analog:** none needed.

- **Theme 1 (DOCS-01):** 14 sites × 2 files (`docs/{ja-JP,ko-KR}/superpowers/plans/2026-03-18-...`). Find `/Users/diego/Dev/get-shit-done/get-shit-done/bin/gsd-tools.cjs`; replace with `$HOME/.claude/get-shit-done/bin/gsd-tools.cjs`. Single sed sweep + single commit per file (or single combined commit). Per IP-3, commit IMMEDIATELY after the script returns.
- **Theme 2 (DOCS-02):** 7 sites in 3 translation specs (`docs/{ja-JP,ko-KR,pt-BR}/superpowers/specs/2026-03-20-...`). Rewrite the 3 separate workspace-command file refs to the unified `commands/gsd/workspace.md` form (see RESEARCH lines 576-582).
- **Theme 7 (DOCS-06):** 3 pt-BR date/link fixes (see RESEARCH lines 634-638). Recommended fix (a): rename `2026-03-23-` → `2026-03-18-` to match en convention.

---

### `.planning/PROJECT.md` `### Validated` (EXISTING-prose-edit, Wave 4)

**Analog:** the existing PROJECT.md `### Validated` block (preserve its existing voice + parentheticals — per CF-06 Pitfall 8).

**Pattern:** Two-pass per Pitfall 8 (RESEARCH §Architecture Patterns, Wave 4 flow lines 204-213):

1. **Pass 1 (machine):** Write `.planning/intel/project-validated-truth.md` (analog above) with one row/bullet per REQ-ID.
2. **Pass 2 (human):** Edit `### Validated` in PROJECT.md. The narrative CITES the truth file, NOT replaces it. PRESERVE hand-curated parentheticals (RESEARCH §Pitfall 8 example: `(caveat: A3 colocated pre-commit gap remains open, see Active)`).

**Anti-pattern to avoid** (RESEARCH §Anti-Patterns + §Pitfall 8): a regeneration script that overwrites the section wholesale. PROJECT.md is human-edited narrative; the truth file is the structured source it cites.

---

## Shared Patterns

### `node:test` framework conventions

**Source:** `tests/inventory-counts.test.cjs` (lines 19-23 + 52-64)
**Apply to:** both new drift-test files (DRIFT-01, DRIFT-02)

```javascript
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// pattern: describe per surface family; test per leaf assertion.
describe('<surface> matches the filesystem', () => {
  test('<dimension>', () => {
    assert.strictEqual(documented, actual, '<concrete message>');
  });
});
```

**Conventions to copy verbatim:**

- `'use strict';` at file top.
- `ROOT = path.resolve(__dirname, '..')` — anchor every filesystem op to repo root, not test file location.
- `assert.strictEqual(documented, actual, ...)` with a message that names BOTH sides numerically (e.g., `INVENTORY "67 shipped" disagrees with commands/gsd/ (68 files)`).
- Header doc-comment explaining intent (drift control, live-scan, no hardcoded numbers).
- Top-of-file `// allow-test-rule: ...` comment IF the test does raw text matching on doc-source (both new drift tests qualify — they regex headlines).

### ADR append-only supersession-note convention

**Source:** `docs/adr/0009-shell-command-projection-module.md:113-131` (existing precedent in this repo)
**Apply to:** Theme 3 ADRs (0009 + 0010)

```markdown
## Update — YYYY-MM-DD (Phase N, REQ-ID)

[one-paragraph purpose statement]

**[Optional sub-heading:]**

- **L<N> <claim>:** [corrected fact, citing the surface that now owns the concept]
- **L<N> <claim>:** [corrected fact]

[Optional closing line referencing CONTEXT.md or supersession ADR for canonical current-state description.]
```

**MUST:** append BELOW all existing content. NEVER edit above the existing `## Status` / `## Decision` / prior `## Update` lines (Integration Gotchas, ADR immutability).

### Closure change_id anchoring

**Source:** Phase 3 closure commits (researcher-identified via `git log` archaeology)
**Apply to:** Theme 5 (`docs/test-triage/jj-bugs.md`)

```markdown
[dangling reference] → (Phase N plan NN-NN closure commit `<change_id>` — <commit message>, <date>)
```

**MUST:** anchor by change_id (not delete); preserve the forensic trail.

### Per-theme commit message style (Pitfall 12 + CF-05)

Used across all 7 themes in Plan 17.03:

```
docs(17.03): theme N — <one-line summary> (<REQ-ID>)

<body if needed>
```

Example: `docs(17.03): theme 4 — rewrite verify-reapply-patches.cjs path references (DOCS-04)`.

### Pitfall 4 same-PR coupling

**Source:** RESEARCH §Pitfall 4 (lines 364-376)
**Apply to:** Plan 17.02 `must_haves`

Every `must_haves` entry for Wave 2 (17.02) MUST cite verbatim: `"Wave 1 committed before this plan starts"`. plan-checker MUST flag any 17.02 plan whose must_haves does NOT reference a "drift fix landed" gate.

### `.planning/intel/` location for machine truth files

**Source:** `feedback_avoid_jj_auto_tracked_output` memory directive
**Apply to:** `.planning/intel/docs-update-fix-triage.md`, `.planning/intel/project-validated-truth.md`

Both NEW intel artifacts live under `.planning/intel/`, NOT in the colocated-jj working tree noise (audit/scanner output convention).

---

## No Analog Found

None. Every NEW file has a close analog (inventory-counts.test.cjs for both tests; existing `.planning/intel/*.md` artifacts for both intel files; existing ADR 0009 `## Update` block for the supersession note pattern).

---

## Metadata

**Analog search scope:** `tests/`, `.planning/intel/`, `docs/adr/`
**Files scanned:** `tests/inventory-counts.test.cjs` (full read, 65 lines), `docs/adr/0009-shell-command-projection-module.md` (lines 113-131 read), `.planning/intel/id-namespace-audit.md` (first 60 lines read), `.planning/intel/vcs-adapter-surface-audit.md` (first 50 lines read), directory listings of `docs/adr/` and `.planning/intel/`.
**Pattern extraction date:** 2026-05-25
**Memory directives honored:** `project_test_perf_pain_vitest` (node:test, not vitest); `feedback_avoid_jj_auto_tracked_output` (intel files under `.planning/intel/`); `feedback_solo_dev_no_expires` (no allowlist entries added by Phase 17 anyway); `project_jj_port` + `feedback_fork_local_only_no_ci` (drift tests local-only, no CI).

## PATTERN MAPPING COMPLETE
