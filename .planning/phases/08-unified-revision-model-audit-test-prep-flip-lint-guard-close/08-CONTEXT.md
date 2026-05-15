# Phase 8: Unified Revision Model — Audit → Test-Prep → Flip → Lint Guard → Close-Gate - Context

**Gathered:** 2026-05-14
**Status:** Ready for planning

<domain>
## Phase Boundary

The cross-backend `VcsAdapter` exposes ONE concept of "a revision." Workflows always work with revisions and never know or care what shape the revision has under the hood — `commit_id` on git, `change_id` on jj. The jj backend never volunteers `commit_id` from any cross-backend verb; `commit_id` leakage from jj is treated as a defect and architecturally enforced via lint guard.

This phase delivers all 14 v1.2 requirements (`AUDIT-01..04`, `FLIP-01..04`, `LINT-01..03`, `PROMPT-05`, `TEST-12`, `MIGR-06`) as a single phase with ~3 sequential plans (research recommendation): Plan 1 audit + parallel lint script development → Plan 2 test-prep + flip + consumer sweep → Plan 3 lint guard activation + workflow `vcs.kind`-branch deletions + close-gate `.planning/` rewriter pass.

</domain>

<decisions>
## Implementation Decisions

### Audit tooling form (Plan 1)
- **D-01:** Build `scripts/audit-id-namespace.cjs` as a dedicated audit script that walks the codebase via regex and emits BOTH `.planning/intel/id-namespace-audit.md` AND a structured JSON sidecar (e.g., `.planning/intel/id-namespace-audit.json`). The JSON IS the literal seed for `scripts/lint-vcs-no-commit-id.allow.json` — single source of truth, no transcription drift between Plan 1 and Plan 3. Mirrors the existing `scripts/audit-workflow-script-paths.cjs` precedent (regex+walker stack, `Object.freeze` enum constants, pure function unit-testable). Verdict ASSIGNMENT remains human (the script enumerates `file:line` rows; the human fills the verdict column from the closed enum). Re-runnable for the Phase 8 close-gate proof on Success Criterion 6.

### Test-prep matcher API (Plan 2 — TEST-12)
- **D-02:** Implement the matcher as `expect.extend({ toBeIdOf(received, kind) })` (vitest custom matcher convention) with TypeScript module augmentation, NOT as the literal free-function `expectIdShape(kind, value)` from REQUIREMENTS-12 spec text. The REQUIREMENTS line treats "custom matcher" generically — vitest vocabulary makes `expect.extend` the unambiguous form. Composability is the deciding factor: post-flip cross-backend assertions on `LogEntry[]`, `WorkspaceInfo`, and `Bookmark.rev[]` need composition inside `toEqual(expect.objectContaining({ rev: expect.toBeIdOf('jj') }))` — a free function forces explosion into N leaf calls per structure (precisely the friction that drove v1.1 Plan 02 to relax to `toBeTruthy()`, per Pitfall 3). `.not.toBeIdOf('git')` handles Pitfall 2 negative-shape assertions in one chain via vitest's auto `isNot` plumbing. **Plan 2 acceptance:** the matcher must land before the FLIP-02/03 sweep so cross-backend assertions migrate atomically.
- **D-02a:** Matcher impl lives at `tests/__tools__/vitest-matchers.ts`. Registered via `setupFiles` entry in `sdk/vitest.config.ts` — loads once per vitest process, automatic for every test file. Module augmentation declared in a sibling `vitest.d.ts` ambient file picked up by the SDK's `tsconfig.json` `include`.
- **D-02b:** REQUIREMENTS-12 text in `.planning/REQUIREMENTS.md` is updated to reflect the `toBeIdOf` API (free-function name was a placeholder — actual API is the vitest custom matcher).

### Lint allowlist schema unification (Plan 3 — LINT-02 + tech-debt fold-in)
- **D-03:** Migrate the existing `scripts/lint-vcs-no-raw-git.allow.json` to per-entry schema during Phase 8 (NOT defer; NOT keep both shapes). The new `lint-vcs-no-commit-id.allow.json` ships with the per-entry schema from day one. Both lints share a single allowlist parser. Justification: research SUMMARY mandates "fork (don't extend)" the existing lint — forking copies the allowlist parser, so without unification we'd be cloning a parser we immediately want to extend. Backfill scope: 14 file entries + 9 globs = ~23 entries; `reason` reconstructed from existing `$comment`/`$comment_2_1_09`/`$comment_wr_11` batch documentation (lossy split into 4 obvious reason categories: VCS adapter internals, test fixtures, hooks/CI, scan scripts).
- **D-04:** **Allowlist schema fields are `{ path | glob, reason, owner }` — `expires` is DROPPED from the schema entirely.** This overrides REQUIREMENTS-LINT-02's third required field. Rationale: in solo-dev context there is no PR-review cadence to drive expires-based re-justification; the field becomes process theater that adds CI failure surface without providing forcing function. Pitfall 7 (allowlist hollowing) protection now rests on (a) per-entry `reason` + `owner` (required); (b) code-review of allowlist diffs (process); (c) periodic removal sweeps in the `$comment_2_1_09` style (already proven in this codebase). REQUIREMENTS-LINT-02 text in `.planning/REQUIREMENTS.md` is updated to drop `expires` from the required-fields list and to remove the "CI fails on expired entries" language. The lint script's CI-fail-on-missing-required-fields check stays for `reason` + `owner`.

### FLIP-04 doc scope
- **D-05:** Scope-minimal — invert the negative-contract PITFALL 1 doc at `sdk/src/vcs/backends/jj.ts:327` to a positive-contract statement ("`LogEntry.id` is the active backend's canonical revision identifier — `commit_id` on git, `change_id` on jj") AND add JSDoc on the renamed `LogEntry.id` and `CommitResult.id` fields in `sdk/src/vcs/types.ts`. **No new ADR.** REQUIREMENTS-04's "ADRs and JSDoc" plural is reduced to JSDoc-only (no existing ADR matches; new ADR scope deferred). The unified revision contract continues to live in `.planning/PROJECT.md` Key Decisions row + `.planning/REQUIREMENTS.md` core-value statement + the lint guard's failure message. **Plan 2 acceptance:** the `jj.ts:327` doc inversion lands in the same commit as `LogEntry.hash` → `LogEntry.id` rename so the doc and the field name are never out of sync.

### Claude's Discretion
- JSON sidecar path naming for the audit script (`.planning/intel/id-namespace-audit.json` mirroring the `.md` filename is the obvious choice; planner may pick another canonical location).
- Whether the audit script's enumerator emits one row per `file:line` hit or one row per `file:line:column` (column-precision is a planner judgment based on grep convention).
- Backfilled `reason` field wording for each of the 14 file entries / 9 globs in `lint-vcs-no-raw-git.allow.json` — reconstruct from $comment context per the 4 obvious categories (VCS adapter internals, test fixtures, hooks/CI, scan scripts).
- Whether the matcher's `toBeIdOf` accepts a `'git'`/`'jj'` literal, the broader `VcsKind` union from `sdk/src/vcs/types.ts`, OR a richer `{ kind, allowShort?: boolean }` options bag — error-message phrasing falls out of this.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope and contract
- `.planning/PROJECT.md` — v1.2 milestone scope; "unified revision model" Key Decisions row; "no escape hatch on cross-backend surface" inversion of SEED-001
- `.planning/REQUIREMENTS.md` — all 14 v1.2 requirements (`AUDIT-01..04`, `FLIP-01..04`, `LINT-01..03`, `PROMPT-05`, `TEST-12`, `MIGR-06`); per-requirement file:line targets; out-of-scope guardrails. **Spec changes from this discussion: TEST-12 matcher API → `expect.extend({ toBeIdOf })`; LINT-02 required-fields → `{ path|glob, reason, owner }` (drop `expires`).**
- `.planning/ROADMAP.md` §"Phase 8" — 6 success criteria + 14-requirement traceability table

### Research artifacts (all HIGH confidence; written 2026-05-14)
- `.planning/research/SUMMARY.md` — executive summary; Pattern 3 industry precedent (jj-fzf, lazyjj, jjui); zero-net-new-deps stance; 3-plan recommendation; close-gate cutover model
- `.planning/research/ARCHITECTURE.md` — every claim cites current `file:line`; per-surface migration table (7 templates + 3 parsers + 2 type-renames + ~27 consumer sweep); pre-emptive correction on stale `expr.commit` deprecation bullet (SEED-001 Gap 2); boundary-I/O accessor false-alarm debunk for `github-release-notes.cjs`
- `.planning/research/PITFALLS.md` — 10 codebase-grounded pitfalls (Pitfall 1 silent stable-identity flip, 2 hex-prefix silent miss, 3 cross-backend test over-relaxation, 4 boundary-I/O sprawl, 5 mid-phase `.planning/` mixed-shape, 6 markdown prose hex leaks, 7 allowlist hollowing, 8 `expr.commit` rename rot, 10 perf traps); "Looks Done But Isn't" close-gate checklist
- `.planning/research/STACK.md` — confirms zero net-new dependencies; existing `lint-vcs-no-raw-git.cjs` as structural template
- `.planning/research/FEATURES.md` — per-surface migration table (numbered #1–#11 cross-backend surfaces flipping; 5 staying change_id); has Gap 1 `vcs.commit() → CommitResult.hash` mistake corrected by ARCHITECTURE.md (FLIP-01 + FLIP-03 both must touch this)

### Surface-flip target sites (Plan 2 — driven by AUDIT-01..04)
- `sdk/src/vcs/backends/jj.ts:222-227` — `commit()` post-squash hash probe (FLIP-01 + FLIP-03)
- `sdk/src/vcs/backends/jj.ts:327` — PITFALL 1 negative-contract doc to invert (FLIP-04)
- `sdk/src/vcs/backends/jj.ts:946` — `refs.resolveShort()` template (FLIP-01)
- `sdk/src/vcs/backends/jj.ts:965` — `refs.countCommits()` template (FLIP-01)
- `sdk/src/vcs/backends/jj.ts:978` — `refs.rootCommits()` template (FLIP-01)
- `sdk/src/vcs/parse/jj-log.ts:26,56` — NDJSON `LogEntry.hash` parse (FLIP-01)
- `sdk/src/vcs/parse/jj-workspace-list.ts:28,46` — NDJSON `WorkspaceInfo.rev` parse (FLIP-01)
- `sdk/src/vcs/parse/jj-bookmark.ts:19-21` — NDJSON `Bookmark.rev` parse (FLIP-01)
- `sdk/src/vcs/types.ts:91` — `CommitResult.hash` rename target (FLIP-03)
- `sdk/src/vcs/types.ts:109-116` — `LogEntry.hash` rename target + JSDoc (FLIP-02 + FLIP-04 D-05)

### Existing precedents this phase mirrors
- `scripts/lint-vcs-no-raw-git.cjs` (202 LOC) — structural template for new `scripts/lint-vcs-no-commit-id.cjs` (~80% copy-paste)
- `scripts/lint-vcs-no-raw-git.allow.json` — schema being migrated to per-entry shape (D-03 + D-04)
- `scripts/audit-workflow-script-paths.cjs` — precedent for the audit script's shape (regex+walker, `Object.freeze` enum, pure function)
- `tests/__tools__/capture-vcs-baselines.cjs` — golden-parity re-record harness for Plan 2 close
- `sdk/src/vcs/format-migration/rewrite.ts:73-86, 240-352` — `COMMIT_KEY_ALLOWLIST` + `findEligibleZones` for MIGR-06 close-gate `.planning/` rewriter pass
- `sdk/src/vcs/__tests__/jj-workspace.test.ts:417` — cited precedent assertion (`expect(mainEntry?.rev).toMatch(/^[0-9a-f]{40}$/)`) needing post-flip update via `toBeIdOf`
- `sdk/src/vcs/__tests__/baseline-parity.test.ts:141` — composite hex regex needing matcher composability (D-02 deciding case)
- `sdk/src/vcs/__tests__/vcs-fixture.ts` — existing parameterized fixture; matcher does NOT need new fixture entry (`kind` stays as explicit param from `describe.for(selectedBackends())` closure)
- `sdk/vitest.config.ts` — adds `setupFiles: ['<repo>/tests/__tools__/vitest-matchers.ts']` (D-02a)

### Historical context (do not edit; reference only)
- `.planning/seeds/SEED-001-change-id-only-on-jj-adapter-surface.md` — the seed v1.2 inverts; explicitly subsumed/dormant
- `.planning/MILESTONES.md` — v1.0 + v1.1 phase outcomes; Phase 7 Plan 02 deviations §2 (cross-namespace pain that motivated the matcher requirement)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/lint-vcs-no-raw-git.cjs` (202 LOC, regex-based whole-repo default-deny + JSON allowlist) — structural template; ~80% copy-paste into `scripts/lint-vcs-no-commit-id.cjs`
- `scripts/audit-workflow-script-paths.cjs` (73 LOC, `Object.freeze({ AUDIT_FINDING })` enum, pure function) — structural template for `scripts/audit-id-namespace.cjs`
- `tests/__tools__/capture-vcs-baselines.cjs` — golden-parity re-record harness; one-shot invocation after FLIP-01..03
- `sdk/src/vcs/format-migration/rewrite.ts` — proven zone-walker (backtick spans + frontmatter); `COMMIT_KEY_ALLOWLIST` extension surface for MIGR-06; idempotency invariant test pattern
- `sdk/src/vcs/expr.ts` — `expr.rev` already accepts both hex/change_id alphabets (Phase 2.1); no flip needed
- `.planning/intel/vcs-adapter-surface-audit.md` (172 LOC hand-authored) — precedent for the audit `.md` doc's verdict-legend layout

### Established Patterns
- Default-deny lint with `files: []` + `globs: []` allowlist JSON (existing `lint-vcs-no-raw-git`)
- Top-level `$comment*` batch documentation (existing) — being migrated to per-entry `reason` (D-03)
- Hard rename, no aliases — established Phase 2.1 (`expr.commit` → `expr.rev`); compiler errors as forcing function
- `vcs.refs.resolveShort()` is the unified short-id verb (replaces `.slice(0, 7)` antipatterns)
- `describe.for(selectedBackends())` closure pattern in `__tests__` — `kind` available without fixture-context coupling
- `[0-9a-f]` and `[k-z]` alphabet disjointness — proven safe by `format-migration/rewrite.ts:53,63` probe (no risk of cross-shape false positives)

### Integration Points
- 7 jj backend template sites (FLIP-01) — listed in canonical refs
- 3 NDJSON parser sites (FLIP-01) — listed in canonical refs
- 2 type-level rename sites + ~27 consumer sweep sites (FLIP-02 + FLIP-03)
- `get-shit-done/bin/lib/verify.cjs` + `commands.cjs` + `format-migration/run.ts` + `worktree-safety.cjs` — major CJS-runtime consumers of `.hash` field
- `sdk/vitest.config.ts` — `setupFiles` entry for matcher registration (D-02a)
- `.github/workflows/*.yml` — new lint CI step parallel to existing `lint-vcs-no-raw-git`; required-blocking on jj-colocated lane (LINT-01)

</code_context>

<specifics>
## Specific Ideas

- The audit JSON sidecar (D-01) is the literal seed for `scripts/lint-vcs-no-commit-id.allow.json`. Plan 3 reads that JSON directly to seed the allowlist; no manual transcription. This collapses the audit→lint coupling into one source of truth — directly addresses Pitfall 7 (allowlist hollowing) by making allowlist entries traceable to audit row N.
- The matcher API choice (D-02) explicitly inherits from the v1.1 Plan 02 over-relaxation incident: the cross-namespace pain that drove `toEqual` → `toBeTruthy()` relaxation is the exact ergonomics gap a free function reproduces. The vitest custom matcher fixes the ergonomics so the sweep doesn't reintroduce the same gap.
- The expires-field drop (D-04) is a deliberate REQUIREMENTS override for solo-dev context. The user's stance: expires-based re-justification is process theater without team review pressure. Per-entry `reason` + `owner` + manual hygiene sweeps (proven in `$comment_2_1_09` style) are the durable hollowing-prevention.
- FLIP-04 scope-minimal (D-05): the user weighed durability of the architectural invariant against ADR-system churn and chose to trust the multi-anchor (PROJECT.md + REQUIREMENTS.md + lint message + JSDoc) over a new dedicated ADR. PITFALLS.md's archival concern is acknowledged but accepted; the lint guard's failure message becomes a permanent doc-anchor by virtue of being CI-blocking.

</specifics>

<deferred>
## Deferred Ideas

The discussion stayed strictly within the v1.2 phase domain. The four user-confirmed scope-creep redirections from PROJECT.md / REQUIREMENTS.md continue to apply:

- **LINT-04** — markdown / `.planning/` prose-level lint guard (separate tool from `lint-vcs-no-commit-id.cjs`). Deferred to v1.3+.
- **TEST-13** — `vcs.refs.matchPrefix(id, prefix)` alphabet-aware short-prefix matching. Conditional on Phase 8 audit verdict surfacing real `id.startsWith(prefix)` callers; otherwise drop entirely.
- **NAMING-01** — cosmetic `rootCommits` → `rootRevisions` rename. Deferred (low value, high churn).
- **API-01** — public `vcs.refs.idAlphabet` introspection. Deferred (no consumer asks yet).

Plus carried follow-ups (NOT v1.2 scope):
- **PARALLEL-01** — orchestrator parallelization rewrite (raw-git worktree dispatch → jj octopus + reap). Carries past v1.2; tracked in `project_no_parallelization_yet` memory.
- **A3-PRECOMMIT-01** — colocated pre-commit hook gap (jj 0.41 doesn't auto-fire `.git/hooks/pre-commit` after `jj squash` colocated). Carries past v1.2; tracked in `project_a3_colocated_pre_commit_gap` memory.

Optional in-Phase-8 fold-ins surfaced and explicitly INCLUDED (not deferred):
- Existing `lint-vcs-no-raw-git.allow.json` schema migration to per-entry shape — folded into Plan 3 per D-03.
- `format-migration/run.ts` internal `commitHash` → `commitId` field rename (research `needs-rename` verdict) — folded into Plan 2's consumer sweep naturally.

</deferred>

---

*Phase: 8-Unified Revision Model — Audit → Test-Prep → Flip → Lint Guard → Close-Gate*
*Context gathered: 2026-05-14*
