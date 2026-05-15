# Phase 8: Unified Revision Model — Audit → Test-Prep → Flip → Lint Guard → Close-Gate - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-14
**Phase:** 8-Unified Revision Model — Audit → Test-Prep → Flip → Lint Guard → Close-Gate
**Areas discussed:** Audit tooling form, expectIdShape matcher API, Lint allowlist schema unification, FLIP-04 doc scope
**Mode:** Advisor (USER-PROFILE.md present); calibration tier `standard` (vendor_philosophy=pragmatic); 4 parallel research agents synthesized into comparison tables before user pick.

---

## Audit tooling form

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated audit script (Recommended) | Build `scripts/audit-id-namespace.cjs` emitting both `.md` doc and JSON sidecar consumed by lint allowlist. Re-runnable regression net for close-gate proof; mirrors `audit-workflow-script-paths.cjs` precedent. | ✓ |
| Ad-hoc grep + manual `.md` | One-shot grep into hand-authored `.planning/intel/id-namespace-audit.md` (mirrors `vcs-adapter-surface-audit.md` precedent). Zero new files in `scripts/`; lint allowlist hand-curated separately. | |

**User's choice:** Dedicated audit script.
**Notes:** Aligns with research SUMMARY §"Architecture Approach" §1, which already commits to the script form. The deciding signal: Phase 8 success criterion 6 needs a re-runnable close-gate proof for the `.planning/` rewriter pass — only the script form satisfies that. Verdict assignment stays human (script enumerates rows; human fills the closed-enum verdict column).

---

## expectIdShape matcher API

| Option | Description | Selected |
|--------|-------------|----------|
| `expect.extend({ toBeIdOf })` (Recommended) | Vitest custom matcher with module augmentation. Composes inside `toEqual(expect.objectContaining({...}))`; `.not` handled natively. 3-file setup (matcher + `vitest.d.ts` + setupFile). First custom matcher in repo. | ✓ |
| Free function `expectIdShape(kind, value)` | Literal REQUIREMENTS-12 spec text. One file, ~5 LOC. Cannot compose inside structures — composite sites must explode into N leaf assertions. | |
| Hybrid: both | `expect.extend` impl + thin `expectIdShape` wrapper preserving literal spec text. Two surfaces = sweep heterogeneity risk. | |

**User's choice:** `expect.extend({ toBeIdOf })`.
**Notes:** Composability dominates at composite-structure assertion sites (`LogEntry[]`, `WorkspaceInfo`, `Bookmark.rev[]`) — exactly where v1.1 Plan 02 over-relaxation to `toBeTruthy()` happened. REQUIREMENTS-12 text gets updated to reflect the actual `toBeIdOf` API.

### Follow-up: Where to register the toBeIdOf matcher?

| Option | Description | Selected |
|--------|-------------|----------|
| `setupFiles` in `sdk/vitest.config.ts` | Add `tests/__tools__/vitest-matchers.ts` to setupFiles — matcher loads once per vitest process, automatic for every test file. Standard vitest convention. | ✓ |
| Direct import in `vcs-fixture.ts` | Import the matcher module from `sdk/src/vcs/__tests__/vcs-fixture.ts` so it loads only when the fixture is used. Lighter-weight but couples matcher availability to fixture import. | |
| Both | Register via setupFiles AND re-export from `vcs-fixture.ts` for explicit type-import convenience. | |

**User's choice:** `setupFiles` in `sdk/vitest.config.ts`.

---

## Lint allowlist schema unification — fold-in scope

| Option | Description | Selected |
|--------|-------------|----------|
| Migrate existing allowlist (Recommended) | Backfill ~23 entries (14 files + 9 globs) in `lint-vcs-no-raw-git.allow.json` with reason/expires/owner. One schema, one parser. Pays for itself if new lint forks the existing one's parser. | ✓ |
| Keep isolated | New lint uses new per-entry schema; existing stays flat-with-`$comment` forever. Zero scope creep; preserves `$comment_2_1_09` batch-removal narrative. | |
| Hybrid coexistence | Extend existing schema with optional per-entry metadata; progressive enrichment. Not recommended for solo-dev (no PR review pressure to drive enrichment forward). | |

**User's choice:** Migrate existing allowlist.
**Notes:** Research SUMMARY mandates "fork (don't extend)" the existing lint — forking copies the allowlist parser, so unification on day-one is the only end-state that doesn't immediately want extending again.

### Follow-up: Default `expires` policy for backfilled allowlist entries?

| Option | Description | Selected |
|--------|-------------|----------|
| Year-out (2027-05-14) | All 23 backfilled entries get expires=2027-05-14. Forces annual re-justification sweep. Predictable cadence. | |
| Milestone-tied | Entries tagged with a milestone marker like 'v2.0' or 'orchestrator-parallelization-rewrite'. | |
| Per-entry judgment | Each entry gets an expires date based on its specific context. | |
| Far-future + `$comment` narrative | expires=2099-01-01 + free-text reason carrying the `$comment` context. | |

**User's choice (free-form):** "let's actually not have expires for anything"
**Notes:** Drops `expires` from the schema entirely. Rationale: in solo-dev context there is no PR-review cadence to drive expires-based re-justification; the field becomes process theater. Pitfall 7 (allowlist hollowing) protection rests on per-entry `reason` + `owner` + manual hygiene sweeps. **REQUIREMENTS-LINT-02 is overridden** — the third required field is dropped; CI fail-on-expired check is removed; lint script's required-fields are now `{ path|glob, reason, owner }`.

---

## FLIP-04 doc scope

| Option | Description | Selected |
|--------|-------------|----------|
| Add new ADR (Recommended) | Open a GitHub issue + create `docs/adr/<issue#>-unified-revision-model.md` codifying the contract. Durable anchor that survives PITFALLS.md archival and PROJECT.md row compression. Matches existing Module-seam ADR voice. | |
| Scope-minimal: JSDoc only | Invert PITFALL 1 doc at `jj.ts:327` + JSDoc on renamed `.id` fields in `types.ts`. No ADR. PROJECT.md row + lint guard message carry the contract. | ✓ |

**User's choice:** Scope-minimal (diverged from agent recommendation).
**Notes:** User accepts the multi-anchor durability story (PROJECT.md Key Decisions row + REQUIREMENTS.md core-value statement + lint guard's CI-blocking failure message + JSDoc) over a new dedicated ADR. PITFALLS.md archival concern noted but accepted. Avoids ADR-system churn (would be the first VCS-adapter-internal contract ADR).

---

## Claude's Discretion

- JSON sidecar path naming for the audit script — default `.planning/intel/id-namespace-audit.json` mirroring the `.md` filename.
- Audit script enumerator row granularity (per `file:line` vs `file:line:column`) — planner judgment.
- Backfilled `reason` field wording for the 14 files / 9 globs in `lint-vcs-no-raw-git.allow.json` — reconstruct from existing `$comment*` context across 4 obvious categories (VCS adapter internals, test fixtures, hooks/CI, scan scripts).
- `toBeIdOf` matcher type signature — `'git'`/`'jj'` literal vs broader `VcsKind` union vs `{ kind, allowShort? }` options bag.

## Deferred Ideas

Discussion stayed strictly within phase scope. The pre-existing v1.3+ deferrals from REQUIREMENTS.md (LINT-04 prose lint, TEST-13 matchPrefix, NAMING-01 cosmetic rename, API-01 idAlphabet introspection) plus carried follow-ups (PARALLEL-01, A3-PRECOMMIT-01) all continue to apply unchanged. Two optional in-Phase-8 fold-ins were surfaced and explicitly INCLUDED (not deferred): existing-allowlist schema migration (D-03) and `format-migration/run.ts` internal `commitHash` → `commitId` rename (research `needs-rename` verdict, folded into Plan 2 sweep naturally).
