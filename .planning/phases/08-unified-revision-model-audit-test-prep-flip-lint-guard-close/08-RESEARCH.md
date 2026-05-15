# Phase 8: Unified Revision Model — Audit → Test-Prep → Flip → Lint Guard → Close-Gate - Research

**Researched:** 2026-05-14
**Domain:** Dual-backend (git + jj 0.41) VcsAdapter identity-contract refactor on TypeScript SDK + CJS-runtime hybrid; planning-input research for an already-scoped phase with locked decisions
**Confidence:** HIGH

## Summary

Phase 8 is a planning-input research pass — every architectural question has already been answered in the four pre-existing HIGH-confidence research artifacts (`SUMMARY.md`, `ARCHITECTURE.md`, `PITFALLS.md`, `STACK.md`, `FEATURES.md`) and locked in `08-CONTEXT.md` via D-01..D-05. This document is **not** re-litigation; it is the planning-specific synthesis that maps locked decisions onto concrete `file:line` work items, sequencing constraints, and acceptance criteria the planner consumes directly.

The phase splits into **three sequential plans** (CONTEXT.md `<domain>`): **Plan 1** = audit (`scripts/audit-id-namespace.cjs` → `.md` + `.json` sidecar) with parallel lint-script *development*. **Plan 2** = test-prep matcher (`expect.extend({ toBeIdOf })`) **BEFORE** FLIP-02/03 + 7 jj.ts template flips + 3 NDJSON parser flips + 2 type renames (`LogEntry.hash → LogEntry.id`, `CommitResult.hash → CommitResult.id`) + ~10 consumer sweep + JSDoc/PITFALL doc inversion + golden-parity re-record. **Plan 3** = lint guard activation (`scripts/lint-vcs-no-commit-id.cjs` with per-entry `{path|glob, reason, owner}` allowlist; `expires` dropped per D-04) + workflow `vcs.kind`-branch deletions (PROMPT-05) + close-gate `.planning/` rewriter pass (MIGR-06). **Risk 4 (jj 0.41 NDJSON schema probe) verified GREEN at research time** — `json(self)` emits `change_id` on both `jj log` and `jj workspace list` (and remains nested under `target.change_id` on workspace list per fresh probe in `/tmp/gsd-jj-probe` against jj 0.41.0).

**Primary recommendation for the planner:** mirror the three-plan structure exactly. Land the matcher in Plan 2 BEFORE any FLIP-02/03 work. Treat `audit-id-namespace.json` as the literal seed for `lint-vcs-no-commit-id.allow.json` (D-01 fold-in — solves Pitfall 7 by construction). Hard rename, no aliases. Plan 3 is the only place where lint guard CI activates; first green run is the proof Plan 2 closed.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (Plan 1 audit form):** Build `scripts/audit-id-namespace.cjs` emitting BOTH `.planning/intel/id-namespace-audit.md` AND a structured JSON sidecar `.planning/intel/id-namespace-audit.json`. The JSON IS the literal seed for `scripts/lint-vcs-no-commit-id.allow.json` — single source of truth, no transcription drift. Mirror `scripts/audit-workflow-script-paths.cjs` precedent (regex+walker, `Object.freeze` enum, pure function). Verdict assignment remains human; the script enumerates `file:line` rows. Re-runnable for Phase 8 close-gate proof on Success Criterion 6.
- **D-02 (Plan 2 matcher API — TEST-12):** Implement as `expect.extend({ toBeIdOf(received, kind) })`, NOT a literal free function. Vitest custom matcher convention with TypeScript module augmentation. Composability is the deciding factor — needed inside `toEqual(expect.objectContaining({ rev: expect.toBeIdOf('jj') }))`. **Plan 2 acceptance: matcher MUST land BEFORE FLIP-02/03 sweep.**
- **D-02a:** Matcher impl at `tests/__tools__/vitest-matchers.ts`; registered via `setupFiles` entry in `sdk/vitest.config.ts`. Module augmentation in sibling `vitest.d.ts` ambient file picked up by SDK `tsconfig.json` `include`.
- **D-02b:** REQUIREMENTS-12 text in `.planning/REQUIREMENTS.md` updated to reflect `toBeIdOf` API (placeholder name corrected).
- **D-03 (Plan 3 lint allowlist schema unification — LINT-02 + tech-debt fold-in):** Migrate existing `scripts/lint-vcs-no-raw-git.allow.json` to per-entry schema during Phase 8. Both lints share a single allowlist parser. Backfill scope: 14 file entries + 9 globs ≈ 23 entries; `reason` reconstructed from existing `$comment` batch documentation into 4 obvious reason categories (VCS adapter internals, test fixtures, hooks/CI, scan scripts).
- **D-04 (Plan 3 allowlist schema fields):** **`{ path | glob, reason, owner }` — `expires` is DROPPED entirely.** Overrides REQUIREMENTS-LINT-02's third required field. Solo-dev context has no PR-review cadence to drive expires-based re-justification. Pitfall 7 protection now rests on: (a) per-entry `reason` + `owner`; (b) code-review of allowlist diffs; (c) periodic removal sweeps in `$comment_2_1_09` style.
- **D-05 (Plan 2 FLIP-04 doc scope — minimal):** Invert PITFALL 1 doc at `sdk/src/vcs/backends/jj.ts:327` to positive contract AND add JSDoc on renamed `LogEntry.id` / `CommitResult.id` fields. **No new ADR.** REQUIREMENTS-04's plural "ADRs and JSDoc" reduced to JSDoc-only. **Plan 2 acceptance: `jj.ts:327` doc inversion lands in the SAME commit as `LogEntry.hash → LogEntry.id` rename.**

### Claude's Discretion

- JSON sidecar path naming for audit script (`.planning/intel/id-namespace-audit.json` is the obvious choice mirroring the `.md` filename).
- Audit script row precision: `file:line` vs `file:line:column` (planner judgment, grep convention).
- Backfilled `reason` field wording for 14 file entries / 9 globs in existing `lint-vcs-no-raw-git.allow.json` — reconstruct from `$comment` context per 4 categories.
- Whether matcher's `toBeIdOf` accepts `'git'`/`'jj'` literal, the broader `VcsKind` union from `sdk/src/vcs/types.ts`, OR a richer `{ kind, allowShort?: boolean }` options bag — error-message phrasing follows from this.

### Deferred Ideas (OUT OF SCOPE)

- **LINT-04** — markdown / `.planning/` prose-level lint guard (separate tool). Deferred to v1.3+.
- **TEST-13** — `vcs.refs.matchPrefix(id, prefix)` alphabet-aware short-prefix matching. Conditional on Phase 8 audit verdict surfacing real `id.startsWith(prefix)` callers; otherwise drop entirely.
- **NAMING-01** — cosmetic `rootCommits` → `rootRevisions` rename. Deferred (low value, high churn).
- **API-01** — public `vcs.refs.idAlphabet` introspection. Deferred (no consumer asks yet).
- **PARALLEL-01** — orchestrator parallelization rewrite. Carries past v1.2.
- **A3-PRECOMMIT-01** — colocated pre-commit hook gap. Carries past v1.2.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUDIT-01 | Audit every `commit_id` template, `.commit_id` field access, `LogEntry.hash`/`CommitResult.hash` consumer, hex regex, `.slice(0, 7\|8\|12)` in `sdk/src/` — classify via verdict enum | §"Audit script implementation" — concrete regex patterns + walker shape + verdict enum |
| AUDIT-02 | Audit `get-shit-done/bin/lib/*.cjs` + `scripts/` — same enumeration; tags `boundary-io` candidates | §"Audit script implementation" — applies same patterns; CJS consumer surface mapped in §"Consumer sweep inventory" |
| AUDIT-03 | Audit `sdk/src/vcs/__tests__/`, `sdk/src/**/__tests__/`, `tests/__tools__/` — find hex-prefix assertions + cross-backend equalities; drives TEST-12 rollout | §"Audit script implementation" + §"Test sweep inventory" — concrete sites pre-identified |
| AUDIT-04 | Audit workflow `.md` + commands `.md` + agent prompts + `.planning/` prose; drives PROMPT-05 deletions + close-gate prose grep | §"Workflow `vcs.kind`-branch decision pattern" — discriminator rules; §"Close-gate prose grep" |
| FLIP-01 | Flip 7 `commit_id` template sites on jj backend to `change_id` (jj.ts:222-227, 946, 965, 978 + 3 parsers) | §"Surface flip sequencing" — exact order; §"jj 0.41 NDJSON schema probe (Risk 4)" — VERIFIED GREEN |
| FLIP-02 | Rename `LogEntry.hash` → `LogEntry.id` (types.ts:109-116). Hard rename, no alias. ~10 consumer sweep | §"Consumer sweep inventory" — 10 concrete `.hash` sites (5 SDK + 2 format-migration + 1 jj.ts internal + 1 CJS + 1 query/log) |
| FLIP-03 | Rename `CommitResult.hash` → `CommitResult.id` (types.ts:91). Hard rename, no alias. Sweep commands.cjs + mutation-event-mapper.ts + format-migration/run.ts + worktree-safety.cjs. Includes jj.ts:222-227 template flip | §"Surface flip sequencing" — FLIP-01 and FLIP-03 BOTH touch jj.ts:222-227 (Gap 1 confirmed) |
| FLIP-04 | Invert PITFALL 1 doc at jj.ts:327 to positive-contract. Update JSDoc on LogEntry.id and CommitResult.id (D-05: NO new ADR) | §"FLIP-04 doc scope" — D-05 scope-minimal acceptance criteria |
| LINT-01 | Ship `scripts/lint-vcs-no-commit-id.cjs` cloning `lint-vcs-no-raw-git.cjs` structure. Default-deny match patterns. CI required-blocking on jj-colocated lane | §"Lint script structural plan" — concrete diff vs precedent; §"Match patterns" |
| LINT-02 | Per-entry allowlist schema (D-03 unification + D-04 drop `expires`). CI-fails on missing required fields | §"Allowlist schema migration" — backfill plan for 23 existing entries |
| LINT-03 | Conditional: if AUDIT-01/02 identifies a real boundary-I/O consumer, add `jj-internal.ts` lint rule. If ZERO, codify "no boundary-I/O accessor exists" as verified end state | §"LINT-03 conditional decision tree" — expected outcome is ZERO; debunked false-alarm at `github-release-notes.cjs` |
| PROMPT-05 | Delete `vcs.kind === 'jj'` branches in bin/lib/*.cjs + workflows/*.md *for id reasons* (driven by AUDIT-04). Replace with unified `vcs.refs.resolveShort` / `commitResult.id` / `entry.id` | §"Workflow `vcs.kind`-branch decision pattern" — discriminator; current grep at research time returns ZERO id-reason branches |
| TEST-12 | `toBeIdOf` matcher in `tests/__tools__/vitest-matchers.ts` (D-02a). Sweep ~10-20 cross-backend `expect(gitResult).toEqual(jjResult)` sites. Re-record golden-parity baselines | §"Matcher implementation" — API signature + composability; §"Test sweep inventory" — 11+ existing `toBeTruthy` sites on `.hash`/`.rev` |
| MIGR-06 | Phase-boundary-marker dogfood-cutover. Single B-07-style rewriter pass at v1.2 close-gate over `.planning/phases/<v1.2-dir>/`. Extend `COMMIT_KEY_ALLOWLIST` if needed. One-time prose grep | §"MIGR-06 close-gate rewriter" — concrete invocation + `COMMIT_KEY_ALLOWLIST` audit |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Audit enumeration | scripts/ build tools | .planning/intel/ docs | Pure regex+walker; emits both .md and .json sidecar; no SDK runtime dependency [VERIFIED: scripts/audit-workflow-script-paths.cjs precedent] |
| Vitest matcher registration | sdk/ tests | tests/__tools__/ shared | Lives at `tests/__tools__/vitest-matchers.ts` (repo-root tooling layer, not SDK-internal); loaded via `sdk/vitest.config.ts setupFiles` [VERIFIED: D-02a] |
| Cross-backend revision identity | sdk/src/vcs/ adapter | sdk/src/vcs/types.ts | All identity flips happen at the adapter boundary; `LogEntry.id` and `CommitResult.id` are SDK types [VERIFIED: ARCHITECTURE.md Integration Point #2] |
| NDJSON parsing | sdk/src/vcs/parse/ | sdk/src/vcs/backends/jj.ts | Parsers are SDK-internal but consumed by jj.ts; flip parser reads BEFORE flip backend templates [VERIFIED: parse/jj-log.ts:26,56 + parse/jj-workspace-list.ts:28,46 + parse/jj-bookmark.ts:19-21] |
| Lint enforcement | scripts/ build tools | .github/workflows/*.yml | Same tier as existing `lint-vcs-no-raw-git.cjs`; CI step parallel; required-blocking on jj-colocated [VERIFIED: package.json:60-65 pretest chain] |
| Allowlist schema | scripts/*.allow.json | scripts/lint-vcs-*.cjs parser | Shared parser between both lints (D-03); per-entry `{path\|glob, reason, owner}` (D-04) |
| `.planning/` rewriter | sdk/src/vcs/format-migration/ | scripts/ orchestration | Existing `migrateContent()` + `findEligibleZones` + `COMMIT_KEY_ALLOWLIST` already implement the right semantics; close-gate invokes via existing `run.ts` shape [VERIFIED: format-migration/rewrite.ts:53,63,73-86,240-352] |
| Workflow id-branching deletion | get-shit-done/bin/lib/*.cjs | get-shit-done/workflows/*.md | CJS runtime + workflow markdown both within scope; deletions land AFTER FLIP-01..03 so unified API exists [VERIFIED: PROMPT-05 + Plan 3 sequencing] |

## Standard Stack

### Core (all already locked — zero net-new deps per STACK.md)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | `^5.7.0` (pinned in `sdk/package.json:55`) [VERIFIED: package.json] | Compiler-driven consumer sweep on `LogEntry.hash → .id` and `CommitResult.hash → .id` renames; module augmentation for `toBeIdOf` matcher | Already locked v1.0; hard-rename + `tsc` is the forcing function (Pitfall 8) |
| Node.js | `>=22.0.0` [VERIFIED: package.json:47] | Runtime for audit script (`.cjs`), lint script (`.cjs`), CJS consumers | Already locked |
| pnpm | `11.0.8` [VERIFIED: package.json:49] | Workspace manager | Already locked — lockfile delta intentionally empty |
| vitest | `^3.1.1` [VERIFIED: sdk/package.json:56] | Test runner; `expect.extend({ toBeIdOf })` registration via `setupFiles`; `GSD_TEST_BACKENDS=git\|jj-colocated` matrix | Already locked v1.0; `setupFiles` flow is vitest-native |
| jj | `0.41.0` [VERIFIED: command-v at `/Users/LoganDark/.local/bin/jj`; live probe `jj 0.41.0-cfdadb…`] | jj-colocated lane backend; `change_id` + `change_id.short()` templates first-class | Already locked; **Risk 4 NDJSON probe verified GREEN at research time** (see §"jj 0.41 NDJSON schema probe") |

### Supporting Libraries

**None added.** STACK.md mandates zero net-new deps; all tooling reuses in-tree primitives.

### Alternatives Considered (rejected per STACK.md)

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Regex+walker `.cjs` audit | ts-morph `28.0.0` [VERIFIED via STACK.md npm view 2026-05-14] | ~50 MB dep tree; TS-version-pinning hassle; audit is syntactic not semantic — branded `RevisionExpr` already enforces type-level discipline. **Rejected.** |
| Regex+walker `.cjs` audit | jscodeshift `17.3.0` [VERIFIED] | Mass-refactor codemod is overkill for ~10 consumer sites; hand-edit + tsc sweep is faster. **Rejected.** |
| Regex+walker `.cjs` audit | `@ast-grep/cli 0.42.2` [VERIFIED] | Splits lint stack from pure-Node to mixed Rust+Node; CI install cost. **Rejected.** |
| Hand-extend existing lint allow JSON | Fork the script | Forking is the recommendation (D-03 + STACK.md §"Where it lives"). Different default-deny scopes + different match patterns + independent CI signal. |
| `findEligibleZones` re-use for prose audit | New markdown AST parser (`unified`/`remark`) | 8-15 transitive deps; existing zone-walker has tests and idempotency invariant. **Rejected.** |

### Package Legitimacy Audit

**Not applicable.** Phase 8 installs zero external packages (CONTEXT.md D-01..D-05 + STACK.md "Zero net-new deps"). All tooling reuses pre-existing in-tree primitives. The Package Legitimacy Gate protocol does not trigger.

## Architecture Patterns

### System Architecture Diagram (Phase 8 deliverables flow)

```
                    ┌─────────────────────────────────────────────┐
                    │ Plan 1: Audit + parallel lint dev           │
                    └─────────────────────────────────────────────┘
                                       │
                  ┌────────────────────┼────────────────────┐
                  ▼                    ▼                    ▼
        scripts/audit-          .planning/intel/    .planning/intel/
        id-namespace.cjs    →   id-namespace-    +  id-namespace-
        (regex+walker)          audit.md            audit.json
                                (human verdict)     (lint-allowlist
                                                     seed — D-01)
                                       │
                                       │  (gates Plan 2 start)
                                       ▼
                    ┌─────────────────────────────────────────────┐
                    │ Plan 2: Test-prep + Flip + Sweep            │
                    └─────────────────────────────────────────────┘
                                       │
                  ┌────────────────────┼────────────────────┐
                  ▼                    ▼                    ▼
        tests/__tools__/      sdk/src/vcs/         sdk/src/vcs/
        vitest-matchers.ts    backends/jj.ts:      parse/jj-{log,
        (toBeIdOf —              222-227,           workspace-list,
         lands FIRST per          946, 965, 978     bookmark}.ts
         D-02 acceptance)      (FLIP-01: 7         (FLIP-01: 3
                                templates)          parsers)
                                       │
                  ┌────────────────────┼────────────────────┐
                  ▼                    ▼                    ▼
        sdk/src/vcs/          ~10 consumer         sdk/src/vcs/
        types.ts:             sweep sites          format-migration/
        91, 109-116           (.hash → .id;        run.ts:152,335
        (FLIP-02 + FLIP-03    tsc-driven)          (commitHash →
         hard rename)                              commitId fold-in)
                                       │
                                       ▼
                          golden-parity baselines re-recorded
                          via tests/__tools__/capture-vcs-baselines.cjs
                                       │
                                       │  (gates Plan 3 start)
                                       ▼
                    ┌─────────────────────────────────────────────┐
                    │ Plan 3: Lint + PROMPT-05 + MIGR-06          │
                    └─────────────────────────────────────────────┘
                                       │
                  ┌────────────────────┼────────────────────┐
                  ▼                    ▼                    ▼
        scripts/lint-vcs-     get-shit-done/        sdk/src/vcs/format-
        no-commit-id.cjs      bin/lib/*.cjs +       migration/rewrite.ts
        + .allow.json         workflows/*.md        (extend COMMIT_KEY_
        (D-03 schema          (PROMPT-05            ALLOWLIST if
         unified)             id-reason             AUDIT-04 finds new
        + ci .yml step        deletions)            commit-bearing keys)
                                       │                    │
                                       │                    ▼
                                       │           One-shot close-gate
                                       │           rewriter pass over
                                       │           .planning/phases/
                                       │           08-…/ + one-time
                                       │           prose grep
                                       │
                                       ▼
                          v1.2 close-gate green:
                          - first lint run green = FLIP complete
                          - skip-count baseline held
                          - strict-green on both backends
```

### Recommended Project Structure

```
scripts/
├── audit-id-namespace.cjs              # NEW Plan 1 (mirror audit-workflow-script-paths.cjs)
├── audit-workflow-script-paths.cjs     # EXISTING — structural template
├── lint-vcs-no-raw-git.cjs             # EXISTING — structural template (~80% copy-paste)
├── lint-vcs-no-raw-git.allow.json      # EXISTING — schema being migrated D-03/D-04
├── lint-vcs-no-commit-id.cjs           # NEW Plan 3 (clone + new patterns)
└── lint-vcs-no-commit-id.allow.json    # NEW Plan 3 (seeded from audit JSON sidecar)

.planning/intel/
├── id-namespace-audit.md               # NEW Plan 1 (human-readable verdict doc)
└── id-namespace-audit.json             # NEW Plan 1 (literal lint allowlist seed)

tests/__tools__/
├── vitest-matchers.ts                  # NEW Plan 2 (D-02a) — expect.extend({ toBeIdOf })
└── vitest.d.ts                         # NEW Plan 2 (D-02a) — module augmentation

tests/
└── lint-vcs-no-commit-id-fixture.test.cjs  # NEW Plan 3 (mirror existing fixture test)

sdk/
├── vitest.config.ts                    # MOD Plan 2 (D-02a) — add setupFiles entry
└── src/vcs/
    ├── backends/jj.ts                  # MOD Plan 2 — 7 template flips + PITFALL 1 inversion
    ├── parse/jj-log.ts                 # MOD Plan 2 — record.commit_id → record.change_id
    ├── parse/jj-workspace-list.ts      # MOD Plan 2 — record.target?.commit_id → .change_id
    ├── parse/jj-bookmark.ts            # MOD Plan 2 — re-template emission
    ├── types.ts                        # MOD Plan 2 — LogEntry.hash → .id + CommitResult.hash → .id
    └── format-migration/rewrite.ts     # MOD Plan 3 (MIGR-06) — extend COMMIT_KEY_ALLOWLIST if needed
```

### Pattern 1: Audit script structural template (D-01)

**What:** Pure regex+walker `.cjs` mirroring `scripts/audit-workflow-script-paths.cjs` shape — `Object.freeze` enum constants for closed verdict set, pure-function classifier emitting `{ file, line, surface, today, callerUse, verdict }` rows, walker module exporting a unit-testable function.

**When to use:** Plan 1 only. Re-runnable at Plan 3 close-gate to verify Success Criterion 6 (audit re-run produces zero `flip-clean` verdicts post-flip).

**Example:**
```javascript
// Source: mirror scripts/audit-workflow-script-paths.cjs:14-24
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const AUDIT_VERDICT = Object.freeze({
  SAFE: 'safe',
  FLIP_CLEAN: 'flip-clean',
  NEEDS_RENAME: 'needs-rename',
  NEEDS_RESOLVE_SHORT: 'needs-resolveShort',
  BOUNDARY_IO: 'boundary-io',
  HISTORICAL_PROSE: 'historical-prose',
  UNCLEAR: 'unclear',
});

const PATTERNS = Object.freeze([
  { re: /['"`]commit_id['"`]/, kind: 'literal_commit_id' },
  { re: /\.commit_id\b/, kind: 'field_access' },
  { re: /['"]LogEntry\['?["]hash["']?\]?\b/, kind: 'log_entry_hash' },
  { re: /['"]CommitResult\['?["]hash["']?\]?\b/, kind: 'commit_result_hash' },
  { re: /\.hash\b/, kind: 'hash_field_access' },  // requires manual cross-check vs unrelated .hash fields
  { re: /\/\^?\[0-9a-f\]\{[0-9]+(?:,[0-9]+)?\}/, kind: 'hex_regex' },
  { re: /['"][0-9a-f]{40}['"]/, kind: '40_char_hex_literal' },
  { re: /\.slice\(\s*0\s*,\s*(?:7|8|12)\s*\)/, kind: 'short_slice' },
]);

function auditIdNamespace({ scanRoots, repoRoot }) {
  // Walker emits findings — verdict column filled by human in the .md
  // The .json sidecar mirrors the rows for Plan 3 to seed allowlist directly.
}

module.exports = { auditIdNamespace, AUDIT_VERDICT };
```

The JSON sidecar schema MUST be:
```json
{
  "$schema_version": 1,
  "scanned_at": "2026-05-...",
  "verdicts": {
    "safe": [{ "path": "verify.cjs", "line": 90, "surface": "expr.rev(hash)", "audit_row": 1 }],
    "boundary-io": [],
    "needs-rename": [...],
    ...
  }
}
```
— so Plan 3 lint-allowlist seeder can read `verdicts['boundary-io']` directly and emit `{path, reason: 'audit-row-N <text>', owner: '@LoganDark'}` entries.

### Pattern 2: Vitest custom matcher (D-02 / D-02a / D-02b)

**What:** `expect.extend({ toBeIdOf })` registered via `sdk/vitest.config.ts setupFiles` entry. TypeScript module augmentation in a sibling `tests/__tools__/vitest.d.ts` ambient declaration file.

**When to use:** Plan 2 ONLY, lands BEFORE FLIP-02/03 (per D-02 Plan 2 acceptance criterion). Reusable for any future cross-backend identity-shape assertion.

**Example:**
```typescript
// tests/__tools__/vitest-matchers.ts (Source: vitest 3 docs — expect.extend custom matchers)
// [CITED: https://vitest.dev/guide/extending-matchers]
import { expect } from 'vitest';
import type { VcsKind } from '../../sdk/src/vcs/types.js';

interface ToBeIdOfOpts {
  kind: VcsKind;
  allowShort?: boolean;  // accepts 7+ chars on either alphabet
}

expect.extend({
  toBeIdOf(received: unknown, kindOrOpts: VcsKind | ToBeIdOfOpts) {
    const opts: ToBeIdOfOpts = typeof kindOrOpts === 'string'
      ? { kind: kindOrOpts }
      : kindOrOpts;
    const { kind, allowShort = false } = opts;
    const min = allowShort ? 7 : (kind === 'git' ? 40 : 12);
    const max = kind === 'git' ? 40 : 32;
    const alphabet = kind === 'git' ? /^[0-9a-f]+$/ : /^[k-z]+$/;
    const isString = typeof received === 'string';
    const lengthOk = isString && received.length >= min && received.length <= max;
    const shapeOk = isString && alphabet.test(received);
    const pass = isString && lengthOk && shapeOk;
    return {
      pass,
      message: () => pass
        ? `expected ${JSON.stringify(received)} NOT to be a ${kind} id (${kind === 'git' ? '[0-9a-f]' : '[k-z]'} alphabet, ${min}-${max} chars)`
        : `expected ${JSON.stringify(received)} to be a ${kind} id (alphabet ${kind === 'git' ? '[0-9a-f]' : '[k-z]'}, ${min}-${max} chars); got ${isString ? `len=${received.length}, alphabet match=${shapeOk}` : `typeof ${typeof received}`}`,
    };
  },
});
```

```typescript
// tests/__tools__/vitest.d.ts (Module augmentation per vitest 3 convention)
// [CITED: https://vitest.dev/guide/extending-matchers#typescript-extension]
import type { VcsKind } from '../../sdk/src/vcs/types.js';

interface CustomMatchers<R = unknown> {
  toBeIdOf(kind: VcsKind | { kind: VcsKind; allowShort?: boolean }): R;
}

declare module 'vitest' {
  interface Assertion<T = unknown> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
```

```typescript
// sdk/vitest.config.ts (MOD — add setupFiles)
// [VERIFIED: existing config at sdk/vitest.config.ts]
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const matchersPath = fileURLToPath(new URL('../tests/__tools__/vitest-matchers.ts', import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          setupFiles: [matchersPath],   // NEW Plan 2 D-02a
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.integration.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          setupFiles: [matchersPath],   // NEW Plan 2 D-02a
          include: ['src/**/*.integration.test.ts'],
          testTimeout: 120_000,
        },
      },
    ],
  },
});
```

**Composability examples** (the D-02 deciding cases the matcher addresses):

```typescript
// jj-workspace.test.ts:417 (CURRENT)
expect(mainEntry?.rev).toMatch(/^[0-9a-f]{40}$/);  // commit_id form

// jj-workspace.test.ts:417 (POST-FLIP)
expect(mainEntry?.rev).toBeIdOf('jj');             // change_id form

// baseline-parity.test.ts:141 (CURRENT — composite hex regex)
expect(result.porcelain).toMatch(/^worktree [^\n]+\nHEAD [0-9a-f]{40}\nbranch refs\/heads\/[^\n]+$/);
// (this is a git-only baseline; stays as-is — composite regex is correct for git fixture)

// Cross-backend equality sweep target (~10 sites — see Test Sweep Inventory)
expect(workspaceList[0]).toEqual(expect.objectContaining({ rev: expect.toBeIdOf('jj') }));
```

**Discretion area (D-02 last bullet):** Recommended signature accepts EITHER literal `'git'` / `'jj'` OR the `{ kind, allowShort? }` options bag (overloaded). Reasoning: (1) most call-sites use literal kind from `describe.for(selectedBackends())` closure — keeps tests terse; (2) options bag covers `verify.cjs:1296` `.slice(0,7)` post-flip cosmetic case (7-char prefix vs 12-char default). Avoid the broader `VcsKind` union as the first parameter — `'jj-native'` and `'jj-colocated'` are both kind `'jj'` for id-shape purposes, so collapsing to `'git' | 'jj'` is correct.

### Pattern 3: Hard rename via TypeScript compiler (FLIP-02 + FLIP-03)

**What:** Rename `LogEntry.hash` → `LogEntry.id` and `CommitResult.hash` → `CommitResult.id` in `sdk/src/vcs/types.ts`. No alias. Run `tsc` to surface every consumer.

**When to use:** Plan 2 after matcher lands. **MUST be hard-rename, no alias** — established Phase 2.1 pattern (`expr.commit` → `expr.rev` hard rename); confirmed by `08-CONTEXT.md` `<deferred>` Out of Scope row + PITFALLS.md Pitfall 8.

**Example:** [VERIFIED via grep — full consumer site list]
```typescript
// sdk/src/vcs/types.ts:87-92 (BEFORE)
export interface CommitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  hash: string | null;       // ← rename to `id`
}

// sdk/src/vcs/types.ts:109-116 (BEFORE)
export interface LogEntry {
  hash: string;              // ← rename to `id`
  parents: string[];
  author: string;
  date: string;
  subject: string;
  body?: string;
}
```

**Documented JSDoc post-rename** (FLIP-04 D-05):
```typescript
export interface LogEntry {
  /**
   * The active backend's canonical revision identifier.
   * - On git: `commit_id` (40-char hex). Snapshot-stable.
   * - On jj: `change_id` (12-char [k-z] reverse-base32). Rebase-stable.
   * Do NOT assume hex form. For short display, use `vcs.refs.resolveShort(expr.rev(id))`
   * (backend-aware short-prefix); never `.slice(0, 7)`.
   */
  id: string;
  parents: string[];
  // ... rest unchanged
}
```

### Pattern 4: Per-entry allowlist schema (D-03 + D-04)

**What:** Replace existing top-level `$comment` batch documentation with per-entry `{ path | glob, reason, owner }` records. Drop `expires` entirely (D-04 overrides REQUIREMENTS-LINT-02).

**When to use:** Plan 3 — both `lint-vcs-no-raw-git.allow.json` (migration) and `lint-vcs-no-commit-id.allow.json` (new).

**Example:**
```json
{
  "$schema_version": 2,
  "$migration_note": "Phase 8 D-03 + D-04: per-entry schema; expires field dropped (solo-dev context).",
  "entries": [
    {
      "path": "sdk/src/vcs/exec.ts",
      "reason": "VCS adapter internals — the exec wrapper that all `git` invocations route through; this IS the adapter implementation.",
      "owner": "@LoganDark"
    },
    {
      "glob": "sdk/src/vcs/__tests__/**",
      "reason": "Test fixtures — parameterized contract suite requires raw `git`/`jj` setup commands to construct test repos.",
      "owner": "@LoganDark"
    },
    {
      "glob": ".githooks/**",
      "reason": "Hooks/CI — pre-commit/pre-push shell hooks predate the adapter and serve as the substrate the adapter wraps.",
      "owner": "@LoganDark"
    },
    {
      "path": "scripts/secret-scan.sh",
      "reason": "Scan scripts — shell-only pre-commit-style filter; cannot use the JS-side adapter without circularity.",
      "owner": "@LoganDark"
    }
  ]
}
```

**Shared parser** (D-03 — one parser, both lints):
```javascript
// scripts/lib/allowlist-parser.cjs (NEW Plan 3 shared module)
const REQUIRED_FIELDS = ['reason', 'owner'];

function parseAllowlist(json, scriptName) {
  if (!Array.isArray(json.entries)) {
    throw new Error(`${scriptName}: allow.json missing top-level "entries" array`);
  }
  for (const e of json.entries) {
    const hasPath = typeof e.path === 'string';
    const hasGlob = typeof e.glob === 'string';
    if (!hasPath && !hasGlob) {
      throw new Error(`${scriptName}: entry missing "path" or "glob"`);
    }
    if (hasPath && hasGlob) {
      throw new Error(`${scriptName}: entry has both "path" and "glob" (pick one)`);
    }
    for (const f of REQUIRED_FIELDS) {
      if (typeof e[f] !== 'string' || !e[f].trim()) {
        throw new Error(`${scriptName}: entry missing required "${f}" field: ${JSON.stringify(e)}`);
      }
    }
  }
  return { ... };
}

module.exports = { parseAllowlist };
```

### Pattern 5: Phase-boundary-marker cutover (MIGR-06)

**What:** No mid-phase `.planning/` rewriter invocation. Commits during Phase 8 write `commit_id`-shape ids (jj's stable identity is preserved — still resolvable on jj because `expr.rev` accepts both alphabets). At v1.2 close-gate, one invocation of the existing `format-migration/run.ts`-style rewriter over `.planning/phases/08-…/` normalizes to `change_id`.

**When to use:** Plan 3 close-gate ONLY. Prevents Pitfall 5 (mid-phase mixed-shape `.planning/` corruption).

**Anti-Patterns to Avoid**

- **Aliasing instead of hard rename:** `LogEntry.hash = LogEntry.id` (or vice versa). Defeats the audit, tech debt accretes. PITFALLS Pitfall 8 — established Phase 2.1 pattern. **Hard rename only.**
- **Mid-phase `.planning/` rewriter invocation:** `commit_id`-shape ids written by Plan 1+2 commits would tangle with `change_id`-shape ids written by Plan 3 commits. PITFALLS Pitfall 5. **Single close-gate pass.**
- **Cross-backend `expect(gitResult).toEqual(jjResult)` on id-bearing fields:** ID alphabets disjoint; fails or gets relaxed to `toBeTruthy()` (PITFALLS Pitfall 3). **Use `expect.objectContaining({ id: expect.toBeIdOf(kind) })`.**
- **Free-function `expectIdShape(kind, value)`:** Would force per-leaf inline calls instead of composing inside `toEqual(expect.objectContaining(...))`. CONTEXT D-02 explicitly chooses `expect.extend` over free function.
- **`vcs.kind === 'jj'` branching for id reasons:** Per PROJECT.md Key Decisions row 9. Branching for non-id reasons (capability gaps, allowlist resolution) is unaffected per CONTEXT.md `<out-of-scope>`.
- **`expires` field in lint allowlist:** D-04 overrides REQUIREMENTS-LINT-02. Solo-dev context; process theater without team review cadence.
- **Lint guard activation before FLIP-01..03 land:** Would block every file as a violation. Plan 3 first-green-run is the proof Plan 2 closed.
- **Speculative `vcs.jjOnly.commitIdOf` cross-backend escape hatch:** Inverts SEED-001 (PROJECT.md). Build only if AUDIT identifies a real consumer — expected verdict is ZERO (LINT-03 conditional close as verified end state).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TS code-search for audit | ts-morph wrapper | `node:fs` + per-line regex in `.cjs` | Audit is syntactic enumeration; `branded RevisionExpr` already enforces type-level discipline at compile time; mirrors existing `lint-vcs-no-raw-git.cjs` precedent |
| Custom file walker | Build new walker | Reuse `findFiles` from `scripts/lint-vcs-no-raw-git.cjs:141-150` | ~9-line walker already validated across 5+ scripts in this repo |
| Per-line annotation parser | Author new regex | Reuse `ALLOW_LINE_ANNOTATION` shape from `lint-vcs-no-raw-git.cjs:48` | Pattern `/(?:\/\/|#)\s*vcs-lint:allow-…-here\s*\S/` is the established convention |
| Glob-to-regex translator | Author new function | Reuse `globToRegExp` from `lint-vcs-no-raw-git.cjs:87-132` | 45-line implementation handles `**/`, `**`, `*`, `.`+`-` escape edge cases; tested |
| `.planning/` markdown rewriter | Author new parser | Reuse `findEligibleZones` + `GIT_SHA_RE` + `JJ_CID_RE` from `sdk/src/vcs/format-migration/rewrite.ts:53,63,240-352` | Idempotency invariant test passes; zone-walker handles backtick spans + frontmatter; alphabet-disjointness proven |
| jj 0.41 NDJSON parsing | Author new parser | Reuse `parseJjLog` / `parseJjWorkspaceList` / `parseJjBookmarkRecord` in `sdk/src/vcs/parse/` | Already production-hardened; just flip the field read from `record.commit_id` → `record.change_id` |
| Cross-backend id-shape assertion | Author new matcher | `expect.extend({ toBeIdOf })` per D-02 | Vitest 3 native API; composable in `expect.objectContaining`; no custom test infra to maintain |
| Allowlist parsing (two lints) | Two parsers | One shared `scripts/lib/allowlist-parser.cjs` (D-03) | Forking + duplication is Pitfall 7 surface; one parser → one schema → one validation |

**Key insight:** Every Phase 8 deliverable has a structural precedent within this repo. Plan 1 audit script mirrors `audit-workflow-script-paths.cjs`. Plan 3 lint script mirrors `lint-vcs-no-raw-git.cjs`. Plan 3 rewriter pass reuses `format-migration/rewrite.ts`. Plan 2 matcher uses vitest-native `expect.extend`. Zero new abstractions; zero new dependencies.

## Runtime State Inventory

> Included because Phase 8 includes a string-rename refactor (`.hash → .id` on TypeScript types) and a workflow markdown deletion sweep. Most categories N/A because the rename is purely code-level — but the `.planning/` close-gate rewriter category needs explicit treatment.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `.planning/phases/<...>/STATE.md` + SUMMARY.md commit-id-bearing keys (the existing `COMMIT_KEY_ALLOWLIST` set at `format-migration/rewrite.ts:73-86`); commits made during Phases 1+2 of v1.2 will write `commit_id`-shape values on jj into these structured stores. | Phase-boundary-marker dogfood cutover (D-05 / MIGR-06): NO mid-phase rewrites; single close-gate `format-migration` rewriter pass over `.planning/phases/08-…/` at v1.2 close. |
| Live service config | None — no external services store id-shape data dependent on the rename. | None. |
| OS-registered state | None — no OS-level registrations embed `commit_id` strings. | None. |
| Secrets/env vars | None — env var keys (`GSD_TEST_BACKENDS`, `GSD_HOOK_SKIP_COLOCATED`) are unaffected by the rename. | None. |
| Build artifacts / installed packages | `sdk/dist/` + `sdk/dist-cjs/` (compiled `.js` + `.d.ts` + `.d.ts.map`) carry the old `LogEntry.hash` / `CommitResult.hash` symbol names. The CJS runtime imports from `sdk/dist-cjs/` (see `get-shit-done/bin/lib/verify.cjs:20`). Stale `dist-cjs/` after rename leaves old symbol-name `.d.ts` files alive — Pitfall 8 warning sign. | Plan 2: `pnpm run build:sdk` (per `package.json:60 pretest` chain) after rename; explicit `grep -r '\.hash' sdk/dist-cjs/` returns zero after build (verification step in Plan 2 close-gate). |

**Nothing found in category:** Live service config, OS-registered state, Secrets/env vars (verified by grep on cwd).

## Common Pitfalls

These are pre-identified in `.planning/research/PITFALLS.md` (10 codebase-grounded pitfalls). Below: Phase 8 plan-specific mitigations the planner must encode in task acceptance criteria.

### Pitfall 1: Silent stable-identity semantic flip (PITFALLS Pitfall 1)
**What goes wrong:** Caller stores `LogEntry.hash` (snapshot-stable on git, snapshot-stable on jj today via commit_id) and re-uses it later as "pointer to this exact tree state." Post-flip on jj it returns change_id which is rebase-stable — moves with rewrites.
**Why it happens:** TS string-typed; no compiler distinction between snapshot-stable and rebase-stable semantics.
**How to avoid:** Hard rename (`LogEntry.hash` → `LogEntry.id`) — every site touched and verdict-classified in audit doc. Plan 1 audit verdict column adds `{snapshot-needed, rebase-stable-needed, indifferent}` annotation. Matcher catches shape mismatches in test surface.
**Warning signs:** Test passes on git, flakes on jj after rebase; `jj log -r <stored-id>` returns different tree than original store.

### Pitfall 2: Hex-prefix matching silently misses on jj (PITFALLS Pitfall 2)
**What goes wrong:** `id.startsWith(hex_prefix)` returns `false` on jj — `[k-z]` alphabet is disjoint from `[0-9a-f]`. No exception thrown; silent.
**Why it happens:** Hex and change_id prefixes look syntactically similar; tests using literal hex prefixes from baseline runs pass compile and run but match nothing.
**How to avoid:** Plan 1 audit pass for `.slice(0, 7|8|12)` on id fields + `[0-9a-f]` regex patterns — verdict each. Plan 3 lint pattern `\/\^?\[0-9a-f\]\{[0-9]+/` denies hex-shape regexes in jj-routed code paths. Matcher's `.not.toBeIdOf('git')` composes negative-shape assertions for parameterized tests.
**Warning signs:** New jj failures clustered in code that previously passed git; `if (id.startsWith(prefix))` branches never enter true arm on jj.

### Pitfall 3: Cross-backend test over-relaxation hides regressions (PITFALLS Pitfall 3)
**What goes wrong:** `expect(gitResult).toEqual(jjResult)` fails by id-shape; the v1.1 Plan 02 pattern was to relax to `expect(rev).toBeTruthy()` — catches existence but misses correctness. **Current state: 11 existing `toBeTruthy()` on `.hash`/`.rev`/`.changeId`/`.parentChange` sites already exist** [VERIFIED via grep — see Test Sweep Inventory below].
**Why it happens:** Path of least resistance during parameterized-test triage; the relaxation is correct *in isolation* but the pattern propagates.
**How to avoid:** Plan 2 introduces matcher BEFORE FLIP (D-02 acceptance). Plan 2 AUDIT-03 sweep migrates the 11+ existing `toBeTruthy` sites to `.toBeIdOf(kind)` where applicable. Future regressions blocked by enforcing `.toBeIdOf` as the only id-equality matcher in `__tests__/*.ts`.
**Warning signs:** Count of `.toBeTruthy()` on id-bearing fields increasing; tests pass on both backends but assert nothing meaningful.

### Pitfall 4: Boundary-I/O accessor sprawl (PITFALLS Pitfall 4)
**What goes wrong:** If `jj-internal.ts` accessor is built speculatively (or for the wrong reason), other callers gravitate to it. Once exposed, a "single curated emission" becomes "two curated emissions" becomes a parallel namespace.
**Why it happens:** TS module visibility is module-scoped, not architecture-layer-scoped. No built-in "this export is only consumable by sibling modules" mechanism.
**How to avoid:** LINT-03 is **conditional** — build only if AUDIT identifies a real consumer. Expected outcome ZERO (research debunked the suspected `github-release-notes.cjs` case at ARCHITECTURE.md Integration Point #3). If ZERO, "no boundary-I/O accessor exists" is codified as verified end state. If non-zero, lint counts importers and CI fails on >1.
**Warning signs:** Second PR proposing accessor use; new `vcs/util/` helper that imports accessor; discussion in PR review with "we already have an escape for X."

### Pitfall 5: Mid-phase `.planning/` mixed-shape corruption (PITFALLS Pitfall 5)
**What goes wrong:** Phase 8 dogfoods on this repo's own `.planning/` directory. Mid-phase rewriter invocation would touch files actively being edited by Phase 8 workflows.
**Why it happens:** Dogfooded migration lacks quiescent target.
**How to avoid:** Phase boundary marker (D-05 + MIGR-06): commits during Plan 1+2 write `commit_id`-shape (still resolvable on jj — `expr.rev` accepts both alphabets per `sdk/src/vcs/expr.ts:92`). Plan 3 close-gate runs the rewriter pass EXACTLY ONCE over `.planning/phases/08-…/`. Idempotency invariant test verifies second invocation is byte-identical.
**Warning signs:** Mid-phase `git diff` showing mixed-shape ids in single `.planning/` file; orphan output from rewriter; agent re-saves clobbering rewriter annotations.

### Pitfall 6: Prose hex leaks survive lint (PITFALLS Pitfall 6)
**What goes wrong:** Markdown prose embeds example ids ("e.g. commit `abc1234`") in code-block-prose-mixed contexts. The `format-migration/rewrite.ts:30-33` zone-walker explicitly excludes prose by design. Post-flip, agent prompts and runbooks with hex examples mislead the agent into expecting hex.
**Why it happens:** Markdown linting is high-false-positive; B-07 rewriter conservatively scopes to backtick spans + frontmatter only.
**How to avoid:** Plan 3 close-gate one-time prose grep: `grep -E '\b[0-9a-f]{7,40}\b' get-shit-done/workflows/*.md commands/*.md agents/*.md`. Per-hit decision: justified-historical (allowlist with audit-row reference) OR migrated to non-hex example. LINT-04 (prose lint) deferred to v1.3.
**Warning signs:** Agent runs producing hex-prefix-matching code on jj when production code is clean.

### Pitfall 7: Lint allowlist becomes write-only (PITFALLS Pitfall 7)
**What goes wrong:** Entries added "to unblock CI" without justification; rule hollows out within months.
**Why it happens:** Allowlist growth is dependency-direction reversed — expanding the allowlist weakens the rule but lint output looks identical (still 0 violations).
**How to avoid:** D-04 schema requires `reason` + `owner`; D-01 audit JSON IS the literal seed (every entry traceable to audit row N). Plan 3 CI fails on missing required fields. Removal-pressure mechanism: `$comment_2_1_09`-style entries documenting removal sweeps.
**Warning signs:** Allowlist file growing month-over-month; new entries added in the same PR that triggers them.

### Pitfall 8: `expr.commit` rename rot (PITFALLS Pitfall 8 — generalized for `.hash → .id`)
**What goes wrong:** Aliasing instead of hard-rename leaves symbol alive in `dist-cjs/`, autocomplete keeps offering it, callers re-introduce silently.
**Why it happens:** Deprecation aliases are path of least resistance; preserve backwards compat at cost of architectural clarity.
**How to avoid:** Hard-rename, no alias (CONTEXT.md `<deferred>` Out of Scope row). After rename: `pnpm run build:sdk && grep -r '\.hash' sdk/dist-cjs/` returns zero hits for the renamed fields (CJS-runtime consumes from `dist-cjs/`). Plan 2 acceptance: include this grep as a verification step.
**Warning signs:** Stack traces mentioning `.hash` post-rename; `dist-cjs/` containing the old field after build.

### Pitfall 10: Perf traps (PITFALLS Pitfall 10)
**What goes wrong:** AST audit in CI per-PR adds 30-60s; inline `if (vcs.kind === ...)` per-test branches duplicate logic.
**Why it happens:** Performance regressions in CI are death-by-1000-cuts.
**How to avoid:** Audit is one-shot phase-only (NOT pre-commit). Lint stays regex-based (<2s). Matcher centralizes id-shape handling in one place. Plan 3 close-gate checks CI delta vs v1.1 baseline.
**Warning signs:** CI time creeping post-v1.2 lint addition; new tests with inline backend branches; audit script wired to pre-commit.

## Code Examples

### Audit script invocation (Plan 1)

```bash
# Source: D-01 + audit-workflow-script-paths.cjs precedent
node scripts/audit-id-namespace.cjs > .planning/intel/id-namespace-audit.md
# JSON sidecar emitted alongside at .planning/intel/id-namespace-audit.json
node scripts/audit-id-namespace.cjs --json > .planning/intel/id-namespace-audit.json
# Re-runnable at Plan 3 close-gate to verify zero `flip-clean` verdicts remain
```

### jj 0.41 NDJSON schema probe verification command (Plan 1 Risk 4 mitigation)

```bash
# [VERIFIED green at research time 2026-05-14 against jj 0.41.0]
# Run inside a colocated test repo BEFORE Plan 2 parser flip lands.
cd /tmp && rm -rf gsd-jj-probe && mkdir gsd-jj-probe && cd gsd-jj-probe
jj git init --colocate
echo "test" > a.txt && jj describe -m "probe"
jj log -r '@' -T 'json(self) ++ "\n"' --no-graph -n 1 | grep -o 'change_id":"[k-z]*"'
# Expected output: change_id":"<12-char k-z string>"
jj workspace list -T 'json(self) ++ "\n"' | grep -o 'change_id'
# Expected: at least one `change_id` token in the nested target object
```

### CI integration (Plan 3)

```yaml
# .github/workflows/ci.yml (NEW STEP — Plan 3 D-01-derived)
# Source: mirror existing lint-vcs-no-raw-git step
- name: Lint — no commit_id leak from jj backend
  run: node scripts/lint-vcs-no-commit-id.cjs
  # Required-blocking on jj-colocated lane per LINT-01.

# package.json pretest (UPDATE — chain new lint in)
# Source: existing pretest at package.json:60
"pretest": "pnpm run build:sdk && pnpm run lint:skill-deps && node scripts/lint-vcs-no-commit-id.cjs"
```

### Close-gate `.planning/` rewriter pass (Plan 3 MIGR-06)

The existing `format-migration/run.ts` orchestrator is the precedent. MIGR-06 invokes its content-rewriter primitive (`migrateContent`) over Phase 8's own `.planning/phases/08-…/` directory only — NOT a full `.planning/` migration (that already happened in v1.0 Phase 6 B-07).

```bash
# Conceptual — wire into Plan 3 close-gate task
node -e "
const { migrateContent } = require('./sdk/dist-cjs/vcs/format-migration/rewrite.js');
const fs = require('fs'); const path = require('path');
const phaseDir = '.planning/phases/08-unified-revision-model-audit-test-prep-flip-lint-guard-close';
// Walk phaseDir; for each .md file, migrate git→jj; write only if changed.
// (Reuse the run.ts pre-flight + atomic write pattern — do NOT bypass the lock.)
"

# Idempotency verification (Plan 3 close-gate acceptance):
# Second invocation must be byte-identical to first (no orphans, no diffs).
```

### Workflow `vcs.kind`-branch deletion (Plan 3 PROMPT-05)

[VERIFIED: at research time, grep returns ZERO `vcs.kind === 'jj'` branches in `get-shit-done/bin/lib/` and `get-shit-done/workflows/`. AUDIT-04 must confirm this or surface new sites.]

```javascript
// EXAMPLE PATTERN — only delete branches whose conditional is "for id reasons."
// "For id reasons" discriminator (the rule):
//   if (vcs.kind === 'jj') {
//     // accesses .changeId, .commit_id, or reaches change_id-specific behavior
//   } else {
//     // accesses .hash, .commit_id, or reaches commit_id-specific behavior
//   }
// → DELETE; replace with unified `result.id` / `entry.id` access.

// "NOT for id reasons" (KEEP):
//   if (vcs.kind === 'git') {
//     vcs.gitOnly.someGitOnlyVerb();  // capability gap — gitOnly.* narrowing
//   }
// → KEEP; per PROJECT.md "vcs.kind branching for non-id reasons remains valid"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `LogEntry.hash` carries `commit_id` (snapshot-stable) on both backends | `LogEntry.id` carries backend-canonical id: `commit_id` on git (snapshot-stable), `change_id` on jj (rebase-stable) | v1.2 Phase 8 | Plan 2 ships; hard rename; tsc-driven sweep; ~10 consumer sites |
| `CommitResult.hash` is hex on jj via `commit_id` template at `jj.ts:222-227` | `CommitResult.id` is `change_id` on jj | v1.2 Phase 8 (resolves research Gap 1) | Plan 2 ships; underlying template flip + field rename both required |
| `expect(gitResult).toEqual(jjResult)` relaxed to `.toBeTruthy()` on id fields | `expect(result).toEqual(expect.objectContaining({ id: expect.toBeIdOf(kind) }))` | v1.2 Phase 8 (TEST-12) | Plan 2 ships matcher before FLIP-02/03; ~10-20 site sweep |
| `if (vcs.kind === 'jj') { /* id branch */ } else { /* id branch */ }` | Unified `commitResult.id` / `entry.id` / `vcs.refs.resolveShort(expr.rev(...))` | v1.2 Phase 8 (PROMPT-05) | Plan 3 ships; current grep returns ZERO id-reason branches but AUDIT-04 must confirm |
| Lint allowlist with top-level `$comment` batch documentation | Per-entry `{ path \| glob, reason, owner }` schema | v1.2 Phase 8 (D-03 + D-04) | Plan 3 ships; backfill ~23 entries in existing `lint-vcs-no-raw-git.allow.json` |
| `vcs.refs.resolveShort()` returns hex-prefix on jj via `commit_id.short()` | Returns change_id-prefix via `change_id.shortest()` | v1.2 Phase 8 (FLIP-01) | Plan 2 ships; backend-aware short form; consumers must NOT assume hex |

**Deprecated/outdated:**

- **PITFALL 1 doc at `sdk/src/vcs/backends/jj.ts:327`** ("`LogEntry.hash` is `commit_id`, NEVER `change_id`") — inverted to positive contract in FLIP-04 (D-05). New doc lands in same commit as FLIP-02 rename.
- **`format-migration/run.ts` internal `commitHash` field at lines 152, 335** — folded into Plan 2's consumer sweep (CONTEXT `<deferred>` Optional in-Phase-8 fold-ins). Rename to `commitId` for naming consistency with the renamed `CommitResult.id` field that feeds it.
- **`scripts/lint-vcs-no-raw-git.allow.json` top-level `$comment*` batch documentation** — migrated to per-entry `reason` field during Plan 3 (D-03 tech-debt fold-in).
- **REQUIREMENTS-12 free-function `expectIdShape(kind, value)` placeholder** — updated to `toBeIdOf` vitest custom matcher API (D-02b).
- **REQUIREMENTS-LINT-02 `expires` field requirement** — dropped (D-04).
- **REQUIREMENTS-04 plural "ADRs and JSDoc"** — reduced to JSDoc-only (D-05).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `format-migration/run.ts` internal `commitHash` field rename to `commitId` is a single-PR mechanical fold-in (CONTEXT.md `<deferred>` lists it as included) | §"Surface flip sequencing" | LOW — if the rename has hidden consumers (e.g., serialized into report files), audit catches it; otherwise hand-edit |
| A2 | Existing 11 `.toBeTruthy()` on `.hash`/`.rev`/`.changeId` sites in `cmd-*-jj.test.ts` are all id-shape relaxations from prior Pitfall-3 incidents (i.e., were originally meant to be `.toEqual(specific-value)`) | §"Test sweep inventory" | LOW — Plan 2 audit reclassifies each as keep-as-is (presence-only intentional) OR upgrade-to-`.toBeIdOf` |
| A3 | All Plan 3 `vcs.kind === 'jj'` branch deletions are AUDIT-04-driven; current grep returning zero is a snapshot (AUDIT-04 must re-grep at Plan 1 time to confirm) | §"Workflow `vcs.kind`-branch decision pattern" | LOW — if AUDIT-04 finds new branches, plan task list grows but pattern is the same |
| A4 | `tests/__tools__/vitest-matchers.ts` is the canonical location (mirroring `tests/__tools__/capture-vcs-baselines.cjs` precedent) | §"Matcher implementation" | LOW — alternative `sdk/src/test-utils/` is rejected because matcher serves both SDK and CJS-runtime tests; repo-root tooling layer is correct |
| A5 | The `expr.commit` deprecation alias is fully removed at runtime (Phase 2.1 already shipped this); Plan 1 audit's verification is a cheap grep | §"State of the Art" | LOW — grep on cwd at research time: `expr.rev` is the only factory; no `expr.commit` references in source |

**If this table is empty:** All other claims in this research were verified against current source files or are directly copied from CONTEXT.md locked decisions.

## Open Questions (RESOLVED)

1. **Matcher signature: literal kind vs options bag** (D-02 last bullet — Claude's Discretion)
   - What we know: vitest 3 supports both signatures (`expect.toBeIdOf('jj')` and `expect.toBeIdOf({ kind: 'jj', allowShort: true })`); module augmentation supports overloads.
   - What's unclear: whether the `allowShort` option (for `verify.cjs:1296` `.slice(0,7)` cosmetic case) is needed in Plan 2 or is a future addition.
   - Recommendation: Ship overload from day one — literal kind for the common case + `{ kind, allowShort? }` for the prefix case. Cost is one extra type union; benefit is single matcher across all cross-backend assertions.

2. **AUDIT-04 prose grep date-windowing** (PITFALLS Pitfall 6 mitigation)
   - What we know: post-v1.2-flip-date hex examples in workflow `.md` are stale; pre-flip hex examples are historically-correct.
   - What's unclear: whether the close-gate prose grep takes a `--since=<v1.2-open-date>` window or grandfathers all pre-Plan-2 prose.
   - Recommendation: Grandfather all pre-Plan-2 prose for v1.2 close (avoids scope explosion); LINT-04 in v1.3 ships the proper prose-aware lint. Document this choice in Plan 3 MIGR-06 task description.

3. **Audit script verdict completeness for `unclear` rows**
   - What we know: D-01 verdict assignment is human; closed enum includes `unclear`.
   - What's unclear: whether `unclear` verdicts block Plan 2 start or are deferred to mid-Plan-2 investigation.
   - Recommendation: Plan 1 close-gate requires `< 5` total `unclear` verdicts (judgment threshold). If > 5, Plan 1 explodes scope per CONTEXT recommendation — planner may split into Phase 8.1 (audit) + Phase 8.2 (flip + lint).

4. **Plan splitting threshold (CONTEXT.md `<domain>` "planner may split further")**
   - What we know: Research recommends 3 plans; CONTEXT notes "planner may split further if Plan 1 audit explodes scope."
   - What's unclear: what numerically constitutes "exploded scope."
   - Recommendation: Quantitative threshold for split: (a) > 50 audit rows total, OR (b) > 5 `boundary-io` verdicts, OR (c) > 10 `unclear` verdicts. Below all three thresholds, single phase holds. Above any: split Plan 1 into its own phase. (See §"Plan splitting threshold" below for justification.)

## jj 0.41 NDJSON Schema Probe (Risk 4 — VERIFIED GREEN)

**Probed live at research time (2026-05-14) against `jj 0.41.0` (binary at `/Users/LoganDark/.local/bin/jj`).**

### `jj log -T 'json(self) ++ "\n"' --no-graph -n 1`

```json
{"commit_id":"756d383b003a69d741309d2faa2c4424a9153f14",
 "parents":["0000000000000000000000000000000000000000"],
 "change_id":"mkskqumxpqzxznuoxopltvqzmnpmypmm",
 "description":"test\n",
 "author":{"name":"...","email":"...","timestamp":"..."},
 "committer":{"name":"...","email":"...","timestamp":"..."}}
```

**Both `commit_id` AND `change_id` emitted at the top level.** The Plan 2 FLIP-01 `parse/jj-log.ts` parser change is mechanical: `record.commit_id` → `record.change_id` on line 26 (type) and line 56 (read). No two-pass parse needed; no `'json(self.change_id() ++ ...)'` custom template needed.

### `jj workspace list -T 'json(self) ++ "\n"'`

```json
{"name":"default",
 "target":{"commit_id":"756d383b003a69d741309d2faa2c4424a9153f14",
           "parents":["0000…"],
           "change_id":"mkskqumxpqzxznuoxopltvqzmnpmypmm",
           "description":"test\n",
           "author":{...},
           "committer":{...}}}
```

**`change_id` is nested under `target`** (not flat). The Plan 2 FLIP-01 `parse/jj-workspace-list.ts` parser change at line 28 (type) reads `target?.commit_id` today; flip to `target?.change_id` on line 46. Type literal at line 28: change `target?: { commit_id?: string }` → `target?: { change_id?: string }`.

### `jj bookmark list -T 'json(self) ++ "\n"'`

Empty output on probe repo (no bookmarks). The existing parser at `parse/jj-bookmark.ts:19-21` expects `target` to be an array of strings (commit_id values today). The full template emission shape for jj 0.41 was not re-probed because: (a) the existing fixture at `tests/fixtures/jj-ndjson/jj-bookmark-list-divergent.ndjson` already documents the steady-state shape; (b) the FLIP work is at the **template emission** end (re-template to emit change_id) rather than the parser end (which already accepts string ids regardless of shape). Plan 2 sub-task: probe the new template shape live during implementation, confirm parser accepts.

### Schema risk status

**Risk 4 (jj 0.41 NDJSON `change_id` schema) — VERIFIED GREEN.** No two-pass parse needed; the parser change is a single-line read flip. Recorded green at `Phase 8 research, 2026-05-14, jj 0.41.0 binary cfdadb38…`. Plan 1 audit MAY include a CI-runnable probe assertion as a defensive verification (1-line jq match against `jj log -T 'json(self) ++ "\n"' --no-graph -n 1` output).

## Consumer Sweep Inventory (FLIP-02 + FLIP-03 — verified via grep)

### `LogEntry.hash` consumer sites (~10 — research ARCHITECTURE.md cited "27"; actual count via grep is ~10 production + ~5 test)

**Production code consumers** (must update on FLIP-02):

| # | File:line | Pattern | Verdict (audit-pre-assignment) |
|---|-----------|---------|--------------------------------|
| 1 | `sdk/src/query/log.ts:72` | `return expr.rev(entries[n].hash);` | flip-clean (rename `.hash` → `.id`) |
| 2 | `sdk/src/query/verify.ts:683` | `.map((e) => `${(e.hash \|\| '').slice(0, 7)} ${e.subject \|\| ''}`)` | needs-resolveShort (or rename + keep slice as cosmetic; planner decides) |
| 3 | `sdk/src/query/mutation-event-mapper.ts:68` | `hash: (data?.hash as string) ?? null,` (output field shape) | flip-clean + needs-rename (event type field rename — out-of-band fold-in?) |
| 4 | `sdk/src/query-raw-output-projection.ts:23` | `return d.hash != null ? String(d.hash) : 'committed';` | flip-clean (rename) |
| 5 | `sdk/src/vcs/backends/jj.ts:597` | `const paths = enumerateConflictedPaths(entry.hash);` | flip-clean (rename — internal jj.ts use) |
| 6 | `sdk/src/vcs/backends/jj.ts:598` | `results.push({ rev: entry.hash, paths, scope: opts.scope });` | flip-clean (rename) |
| 7 | `sdk/src/vcs/format-migration/orphan.ts:77` | `cursor = parents[0].hash;` | flip-clean (rename) |
| 8 | `sdk/src/vcs/format-migration/orphan.ts:103` | `children = childEntries.map((c) => c.hash);` | flip-clean (rename) |
| 9 | `sdk/src/vcs/format-migration/run.ts:152` | `commitHash: markerHit.hash ?? '',` | needs-rename (internal field `commitHash` → `commitId` per ARCH §Caveat) |
| 10 | `sdk/src/vcs/format-migration/run.ts:335` | `commitHash: commitResult.hash ?? '',` | needs-rename (same as #9) |
| 11 | `get-shit-done/bin/lib/verify.cjs:1296` | `.map((e) => `${(e.hash \|\| '').slice(0, 7)} ${e.subject \|\| ''}`)` | needs-resolveShort cosmetic (CJS runtime — no compiler help; grep-only catch) |
| 12 | `sdk/src/query/intel.ts:160` | `const prevHashes = (snapshot.hashes as Record<string, string>) \|\| {};` | NOT a LogEntry consumer — `intel.ts:160` reads a different `hashes` snapshot field; verify in audit |

**Test code consumers** (must update on FLIP-02 — may use new matcher):

11 existing `.toBeTruthy()` calls on `r.hash` / `r.rev` / `r.changeId` / `r.parentChange` / `r.mergeChange` [VERIFIED via grep — see Test Sweep Inventory]. AUDIT-03 should re-classify these (relax-vs-upgrade-to-matcher decision per site).

### `CommitResult.hash` consumer sites (FLIP-03)

| # | File:line | Pattern | Verdict |
|---|-----------|---------|---------|
| 1 | `get-shit-done/bin/lib/commands.cjs:507` | `${r}:${v.hash \|\| 'skip'}` (post-commit announcement) | flip-clean (rename — CJS grep) |
| 2 | `get-shit-done/bin/lib/worktree-safety.cjs:505` | `processed.push({ ...entry, mergedAs: merge.changeId });` | already correct — uses VCS-12's `changeId` (per ARCH §Integration Point #2); flip-clean |
| 3 | `sdk/src/vcs/format-migration/run.ts:152` | (see #9 above — same site, both `LogEntry.hash` and `CommitResult.hash` reach this) | needs-rename |
| 4 | `sdk/src/vcs/format-migration/run.ts:335` | (see #10 above) | needs-rename |
| 5 | `sdk/src/query/mutation-event-mapper.ts:68` | (see LogEntry #3 — same site routes both) | flip-clean + needs-rename (consider event-type field rename in same PR) |
| 6 | `sdk/src/query/commit.test.ts:170,182` | `(result.data as { hash: string }).hash).toBeTruthy();` | Test relaxation site — keep or upgrade to matcher |
| 7 | `sdk/src/vcs/backends/jj.ts:236` | `hash = hashRes.stdout.trim();` (local var inside commit() — the post-squash probe at lines 222-227 is the FLIP-01 template flip, this line just assigns) | flip-clean (rename local var to `id`) |

**Underlying jj.ts:222-227 post-squash hash probe template** = the FLIP-01 + FLIP-03 intersection (Gap 1 from research). Both flips must land in the same PR or Plan 2 leaves the codebase in an inconsistent state (template emits change_id but field is named `.hash`).

## Test Sweep Inventory (AUDIT-03 input)

**Existing `.toBeTruthy()` on id-bearing fields** [VERIFIED via grep at research time]:

| File:line | Pattern | Plan 2 Action |
|-----------|---------|---------------|
| `sdk/src/vcs/__tests__/cmd-import-jj.test.ts:114` | `expect(r.hash).toBeTruthy();` | Audit — upgrade to `expect(r.id).toBeIdOf('jj')` or keep as presence check |
| `sdk/src/vcs/__tests__/cmd-map-codebase-jj.test.ts:91` | `expect(r.hash).toBeTruthy();` | (same as above) |
| `sdk/src/vcs/__tests__/cmd-pause-work-jj.test.ts:77` | `expect(r.hash).toBeTruthy();` | (same as above) |
| `sdk/src/vcs/__tests__/cmd-plan-phase-jj.test.ts:61` | `expect(result.parentChange).toBeTruthy();` | Audit — already on a `change`-named field; keep as presence check |
| `sdk/src/vcs/__tests__/cmd-plan-phase-jj.test.ts:62` | `expect(result.mergeChange).toBeTruthy();` | (same) |
| `sdk/src/vcs/__tests__/git-backend.test.ts:51` | `expect(r.hash).toBeTruthy();` | Plan 2 rename → `expect(r.id).toBeIdOf('git')` |
| `sdk/src/vcs/__tests__/git-backend.test.ts:66` | `expect(r.hash).toBeTruthy();` | (same) |
| `sdk/src/vcs/__tests__/git-backend.test.ts:89` | `expect(r.hash).toBeTruthy();` | (same) |
| `sdk/src/vcs/__tests__/git-backend.test.ts:178` | `expect(info.rev).toBeTruthy();` | Cross-backend `WorkspaceInfo.rev` — upgrade to `.toBeIdOf(kind)` parameterized |
| `sdk/src/vcs/__tests__/jj-hooks.test.ts:140` | `expect(r.hash).toBeTruthy();` | rename + upgrade |
| `sdk/src/query/commit.test.ts:170,182` | `(result.data as { hash: string }).hash).toBeTruthy();` | rename + upgrade |

**Cited assertion** (CONTEXT canonical refs):
- `sdk/src/vcs/__tests__/jj-workspace.test.ts:417` — `expect(mainEntry?.rev).toMatch(/^[0-9a-f]{40}$/);` (commit_id form assertion that breaks post-flip; replace with `.toBeIdOf('jj')`)
- `sdk/src/vcs/__tests__/baseline-parity.test.ts:141` — `expect(result.porcelain).toMatch(/^worktree [^\n]+\nHEAD [0-9a-f]{40}\nbranch refs\/heads\/[^\n]+$/);` (composite hex regex; this is the GIT-only `read-worktree-porcelain` test — keep as-is, the hex baseline is correct for the git fixture)

**Golden-parity baselines** (`tests/baselines/git-vcs/*.snap.json` via `tests/__tools__/capture-vcs-baselines.cjs`):
- All current baselines are git-side; capture for git ONLY (post-squash hash probe etc.).
- POST-FLIP: re-record produces same git baselines (git side is unchanged). Plan 2 step.

**Strict-green skip-count baseline:** `scripts/check-skip-count.cjs` (existing) enforces `current count ≤ origin/main count`. Plan 2 acceptance: `node scripts/check-skip-count.cjs` returns exit 0 (no new skips introduced by sweep). v1.1 baseline = current count on `origin/main`.

## Plan Splitting Threshold (Open Question 4 quantification)

CONTEXT.md `<domain>`: "planner may split further if Plan 1 audit explodes scope." Recommended numeric threshold:

| Signal | Threshold | If exceeded |
|--------|-----------|-------------|
| Total audit rows | > 50 | Split Plan 1 into Phase 8.1 (audit-only) |
| `boundary-io` verdicts | > 5 | Split + commit to building `jj-internal.ts` accessor in Phase 8.2 (LINT-03 conditional fires) |
| `unclear` verdicts | > 10 | Investigate before Plan 2 start; Plan 1 close-gate adds investigation tasks |
| Workflow `.md` id-branch sites | > 8 | Plan 3 PROMPT-05 grows; consider splitting Plan 3 into 3a (lint) + 3b (PROMPT-05 + MIGR-06) |

**Justification:**
- 50 rows: based on STACK.md sizing — "current count is 7 (verified via grep); not at that threshold" for template flips; "20 SDK call sites + ~10 workflow `vcs.kind` branch sites — bounded enough to stay one phase." 50 is the comfortable upper bound for a single human review pass.
- 5 boundary-io: each one drives a separate `jj-internal.ts` allowlist entry; 5+ is sprawl territory (Pitfall 4).
- 10 unclear: more than 10 deferred-classification items suggests Plan 1 actually needs another pass.
- 8 workflow sites: corresponds to one workflow `.md` per phase (PROMPT-04 in v1.1 hit ~10 across 2 files); 8+ is multi-PR territory.

**Current at research time:** 7 template flips + ~10 consumer sites + 0 `vcs.kind === 'jj'` id-branches in cwd grep + 0 confirmed `boundary-io` consumers = WELL BELOW all thresholds. **Stay single-phase.**

## Workflow `vcs.kind`-branch decision pattern (PROMPT-05 + AUDIT-04)

[VERIFIED at research time: `grep -rn "vcs\.kind === 'jj'" get-shit-done/bin/lib/ get-shit-done/workflows/` returns ZERO matches.]

PROMPT-04 in v1.1 already deleted -242 LOC of raw-git fallbacks (see MILESTONES.md). PROMPT-05 is the continuation pattern, but the candidate set may be empty or near-empty.

**Discriminator rule for AUDIT-04 + PROMPT-05:**

A `vcs.kind === 'jj'` branch is *for id reasons* (DELETE candidate) when:
- The conditional body accesses or constructs a `commit_id`-shape string for use as a revision identifier
- The conditional body uses `.short()` / hex prefix matching / `.slice(0, 7|8|12)` on an id field
- The conditional body is fundamentally about which id alphabet to expect/emit
- The conditional could be replaced by `commitResult.id` / `entry.id` / `vcs.refs.resolveShort(expr.rev(value))` with no semantic loss

A `vcs.kind === 'jj'` branch is *NOT for id reasons* (KEEP per CONTEXT.md `<out-of-scope>`) when:
- The conditional accesses `gitOnly.*` namespace (capability-gap narrowing — Phase 2.1 D-18)
- The conditional handles backend-specific allowlist resolution (e.g., `BACKENDS_AVAILABLE_FOR_VERB` per-verb gating)
- The conditional handles a genuine semantic difference unrelated to id shape (e.g., jj squash vs git commit semantics; jj has no index)
- The conditional accesses `jjOnly.*` or backend-private internals (none today by CONTEXT.md decision)

AUDIT-04 surfaces candidates by grepping for `vcs.kind === 'jj'`, `vcs.kind === 'git'`, `if (kind === 'jj')`, etc. across `get-shit-done/bin/lib/*.cjs` + `get-shit-done/workflows/*.md` + `commands/*.md` + `agents/*.md`. Each hit gets a per-discriminator verdict in the audit doc.

## Lint Script Structural Plan (LINT-01 + LINT-02 + LINT-03)

### Diff vs `scripts/lint-vcs-no-raw-git.cjs` (~202 LOC)

**Keep (~80% copy-paste):**
- `parseArgv` + `--scan-root` seam (lines 31-40)
- `SCAN_ROOT` resolution (lines 38-40)
- `findFiles` walker (lines 141-150)
- `globToRegExp` translator (lines 87-132) — consider extracting to shared `scripts/lib/glob-to-regex.cjs` (D-03 shared parser refactor)
- `isAllowed` predicate (lines 135-139) — refactor to use new per-entry schema
- `ALLOW_LINE_ANNOTATION` regex shape (line 48) — adapt to `vcs-lint:allow-commit-id-here`
- `checkFile` + violation collector (lines 152-178)
- Violation reporter (lines 189-202)

**Replace:**
- `GIT_PATTERNS` array (lines 59-69) → `COMMIT_ID_PATTERNS` array (new):
  ```javascript
  const COMMIT_ID_PATTERNS = [
    { re: /['"`]commit_id['"`]/, label: "literal 'commit_id' string" },
    { re: /['"`]commit_id\.short(?:est)?\(\)['"`]/, label: "literal 'commit_id.short()' / '.shortest()' template" },
    { re: /\.commit_id\b/, label: ".commit_id field access" },
    { re: /\/\^?\[0-9a-f\]\{[0-9]+(?:,[0-9]+)?\}/, label: "hex-shape regex literal" },
    { re: /['"][0-9a-f]{40}['"]/, label: "40-char hex string literal" },
  ];
  ```
- `SHELL_GIT_PATTERNS` (lines 79-84) → drop (not applicable to commit_id leak)
- Drop shell extension scan (only TS/JS/CJS files contain commit_id template strings)
- `SCAN_EXT` regex (line 57) → narrow to `/\.(cjs|js|mjs|ts)$/` (drop yml/yaml/sh/bash; markdown excluded per LINT-04 deferred)

**Add:**
- LINT-03 conditional pattern (only if AUDIT identifies `jj-internal.ts` consumer): `re: /from\s+['"][^'"]*backends\/jj-internal['"]/, label: "jj-internal import"` — fail on >1 importer.
- New per-entry allowlist parser via `scripts/lib/allowlist-parser.cjs` (shared with `lint-vcs-no-raw-git.cjs`).

### Allowlist seeding from audit JSON (Plan 3 pipeline)

```javascript
// scripts/seed-lint-allowlist.cjs (NEW Plan 3 step — runs once during Plan 3 setup)
const audit = require('../.planning/intel/id-namespace-audit.json');
const entries = audit.verdicts['boundary-io'].map(row => ({
  path: row.path,
  reason: `audit-row-${row.audit_row} — ${row.surface}: ${row.callerUse}`,
  owner: '@LoganDark',
}));
require('fs').writeFileSync(
  'scripts/lint-vcs-no-commit-id.allow.json',
  JSON.stringify({ $schema_version: 2, entries }, null, 2),
);
```

Expected output (if AUDIT verdict is ZERO boundary-io consumers): `{ $schema_version: 2, entries: [] }` — empty allowlist; the inversion of SEED-001 holds; LINT-03 closes as "no boundary-I/O accessor exists" verified end state.

### CI integration

```yaml
# .github/workflows/ci.yml (NEW step parallel to lint-vcs-no-raw-git)
- name: Lint — no commit_id leak from jj
  run: node scripts/lint-vcs-no-commit-id.cjs
```

Required-blocking on jj-colocated lane per LINT-01.

### Allowlist schema migration (D-03 backfill)

Existing `scripts/lint-vcs-no-raw-git.allow.json` (14 files + 9 globs = 23 entries) backfill into 4 reason categories:

| Category | Entries | Reason template |
|----------|---------|-----------------|
| VCS adapter internals | `sdk/src/vcs/exec.ts`, `sdk/src/vcs/backends/git.ts` | "VCS adapter internals — this IS the adapter implementation; raw `git` invocation is the substrate the cross-backend surface wraps." |
| Test fixtures | `sdk/src/vcs/__tests__/vcs-fixture.ts`, `sdk/src/vcs/__tests__/git-backend.test.ts`, `sdk/src/vcs/__tests__/exec.test.ts`, `sdk/src/vcs/__tests__/index.test.ts`, `sdk/src/vcs/__tests__/baseline-parity.test.ts`, `tests/vcs-cjs-smoke.test.cjs`, `tests/__tools__/capture-vcs-baselines.cjs` + globs `sdk/src/vcs/__tests__/**`, `sdk/src/query/**/*.test.ts`, `sdk/src/**/*.integration.test.ts`, `tests/**/*.test.cjs`, `tests/**/*.test.ts` | "Test fixtures — parameterized contract suite requires raw `git`/`jj` setup commands to construct deterministic test repos." |
| Hooks/CI | `.githooks/**`, `.github/workflows/**` | "Hooks/CI — pre-commit/pre-push shell hooks predate the adapter; CI workflows orchestrate the adapter, not consume it." |
| Scan scripts | `scripts/lint-vcs-no-raw-git.cjs`, `scripts/check-skip-count.cjs`, `scripts/base64-scan.sh`, `scripts/prompt-injection-scan.sh`, `scripts/secret-scan.sh` | "Scan scripts — shell-only or scan-self lint logic; cannot use the JS-side adapter without circularity." |
| Other | `docs/**`, `.planning/**` (globs) | "Documentation — markdown content references `git` as English text; never executed." |

## Sources

### Primary (HIGH confidence)

- `.planning/research/SUMMARY.md` — executive summary, 3-plan recommendation, Pattern 3 industry precedent
- `.planning/research/ARCHITECTURE.md` — every claim cites current `file:line`; 7 templates + 3 parsers + 2 type renames + ~27 consumer sweep; Risk 4 schema probe call-out; SEED-001 Gap 1 + Gap 2 corrections
- `.planning/research/PITFALLS.md` — 10 codebase-grounded pitfalls; "Looks Done But Isn't" close-gate checklist
- `.planning/research/STACK.md` — zero net-new deps stance; `lint-vcs-no-raw-git.cjs` as structural template
- `.planning/research/FEATURES.md` — per-surface migration table (#1-#11)
- `.planning/REQUIREMENTS.md` — 14 v1.2 requirements with per-requirement file:line targets
- `.planning/PROJECT.md` — v1.2 milestone scope; SEED-001 inversion; Key Decisions row 9
- `.planning/ROADMAP.md` §Phase 8 — 6 success criteria + 14-requirement traceability
- `.planning/STATE.md` — Phase 8 entry-state; v1.0 + v1.1 archived blockers
- `.planning/MILESTONES.md` v1.1 §Phase 7 Plan 02 deviations §2 — cross-namespace pain that motivates D-02
- `.planning/phases/08-…/08-CONTEXT.md` — D-01..D-05 locked decisions

### Primary code (read live during research)

- `scripts/lint-vcs-no-raw-git.cjs:31-203` — full structural template
- `scripts/lint-vcs-no-raw-git.allow.json` — schema being migrated D-03
- `scripts/audit-workflow-script-paths.cjs:14-73` — audit script structural template (regex+walker, `Object.freeze` enum)
- `sdk/src/vcs/backends/jj.ts:200-360, 920-1024, 1080-1095, 1175-1185` — every commit_id-emitting template, PITFALL 1 doc, workspace.list parser invocation, workspace.merge change_id template
- `sdk/src/vcs/parse/jj-log.ts:25-65` — NDJSON parser FLIP-01 site
- `sdk/src/vcs/parse/jj-workspace-list.ts:26-51` — NDJSON parser FLIP-01 site
- `sdk/src/vcs/parse/jj-bookmark.ts:25-77` — NDJSON parser FLIP-01 site
- `sdk/src/vcs/types.ts:87-92, 109-116` — `CommitResult.hash` + `LogEntry.hash` rename targets
- `sdk/src/vcs/format-migration/rewrite.ts:1-100, 230-352` — `GIT_SHA_RE`, `JJ_CID_RE`, `COMMIT_KEY_ALLOWLIST`, `findEligibleZones`
- `sdk/src/vcs/format-migration/run.ts:140-170, 320-350` — `commitHash` field assignments (CONTEXT `<deferred>` fold-in target)
- `sdk/src/vcs/format-migration/orphan.ts:70-110` — `entries[].hash` consumers
- `sdk/src/vcs/expr.ts:30-95` — `expr.rev` permissive validator (SHA_OR_CHANGE_ID_RE accepts both alphabets)
- `sdk/src/vcs/__tests__/jj-workspace.test.ts:400-450` — cited assertion at line 417
- `sdk/src/vcs/__tests__/baseline-parity.test.ts:130-160` — composite hex regex at line 141 (git-only baseline; stays as-is)
- `sdk/src/vcs/__tests__/vcs-fixture.ts` — parameterized backend fixture
- `sdk/vitest.config.ts` — existing config (D-02a `setupFiles` add target)
- `tests/__tools__/capture-vcs-baselines.cjs:1-100` — golden-parity re-record harness
- `get-shit-done/bin/lib/verify.cjs:1290-1310` — `.slice(0, 7)` on `e.hash` cosmetic site
- `get-shit-done/bin/lib/commands.cjs:486-510` — post-commit announcement `v.hash` site
- `get-shit-done/bin/lib/worktree-safety.cjs:500-510` — `merge.changeId` already correct
- `sdk/src/query/log.ts:72`, `verify.ts:683`, `mutation-event-mapper.ts:50-95`, `query-raw-output-projection.ts:23`, `intel.ts:160` — query/ consumer sites
- `.planning/config.json` — `workflow.nyquist_validation: false` confirmed; Validation Architecture section skipped
- `.planning/intel/vcs-adapter-surface-audit.md:1-50` — verdict-legend layout precedent
- `package.json:60-75` — pretest chain; sdk/package.json:48-57 — current deps

### Primary external (HIGH confidence — vitest 3 / jj 0.41 docs)

- [vitest extending matchers](https://vitest.dev/guide/extending-matchers) — `expect.extend` API + module augmentation
- [vitest setupFiles config](https://vitest.dev/config/#setupfiles) — global test setup
- [jj 0.41 templates docs](https://docs.jj-vcs.dev/latest/templates/) — `change_id.shortest()`, `commit_id.shortest()` semantics; already cited by SUMMARY/ARCHITECTURE
- [jj 0.41 architecture docs](https://docs.jj-vcs.dev/latest/technical/architecture/) — `[k-z]` alphabet design

### Secondary (MEDIUM confidence)

- Live jj 0.41.0 NDJSON schema probe (2026-05-14, this session) — `change_id` emitted at top level on `jj log` and nested under `target` on `jj workspace list` — Risk 4 verified GREEN

### Tertiary (LOW confidence)

None. Every claim in this research is either VERIFIED against a current `file:line` or CITED from a HIGH-confidence pre-existing research artifact under `.planning/research/`.

## Project Constraints (from CLAUDE.md)

- **GitHub access:** Always use `--repo gsd-build/get-shit-done` on `gh` commands.
- **Issue tracker:** Issues in GitHub Issues (`gsd-build/get-shit-done`).
- **VCS:** jj (project memory `user_vcs_jj` + `project_squash_model`); never raw git anywhere outside allowlisted files (project memory `project_no_raw_git`).
- **Commit model:** Squash via `jj squash` (NOT `jj commit`); allow WC snapshots (never `--ignore-working-copy`); hooks fire after squash.
- **SDK commit safety:** `gsd-sdk query commit` is jj-safe post-B-08 — agent prompts should NOT include explicit `jj describe`/`jj commit -m` instructions (project memory `feedback_sdk_commit_jj_safe`).
- **Phase filenames:** Padded leading integer (`08-…`); per project memory `feedback_phase_filename_padding`.
- **Lint guard scope:** `no-raw-git` lint is whole-repo default-deny on `git` (not just mutating verbs); applies to read AND write (project memory `project_no_raw_git`).
- **Solo-dev allowlist conventions:** Per-entry schemas use `{path, reason, owner}` — `expires` is process theater (project memory `feedback_solo_dev_no_expires`; aligns with D-04).
- **Vitest matcher convention:** Treat "custom matcher" spec text as placeholder — implement as `expect.extend` for composability (project memory `feedback_vitest_extend_over_free_fn`; locked in D-02).
- **Parallelization gated OFF:** Phase 8 plans must NOT use the `parallelization` knob; orchestrator uses raw-git worktree dispatch which is itself the carried-past-v1.2 follow-up (project memory `project_no_parallelization_yet`).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tooling already in tree; jj 0.41 verified locally; zero net-new deps
- Architecture: HIGH — every flip site cited at `file:line`; Risk 4 verified GREEN at research time
- Pitfalls: HIGH — 10 codebase-grounded pitfalls in PITFALLS.md; mitigations directly map to plan acceptance criteria
- Consumer sweep: HIGH for production code (~12 sites grep-verified); MEDIUM for tests (11+ sites identified, full set requires Plan 1 AUDIT-03 enumeration)
- Workflow `vcs.kind`-branch sites: HIGH for current state (grep returns zero); requires AUDIT-04 re-confirmation at Plan 1 time
- jj 0.41 NDJSON schema: HIGH (probed live at research time)
- Plan splitting threshold: MEDIUM — judgment-based numeric thresholds; planner may adjust

**Research date:** 2026-05-14
**Valid until:** Phase 8 close-gate (estimated ~7-14 days; jj fast-moving on `change_id` template surfaces but Risk 4 verified for current 0.41 pin)
