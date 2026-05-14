# Requirements: GSD jj-port — Milestone v1.2

**Defined:** 2026-05-14
**Milestone:** v1.2 jujutsu is change-only — never commit id anywhere
**Core Value:** The cross-backend `VcsAdapter` exposes ONE concept of "a revision." Workflows always work with revisions and never know or care what shape the revision has under the hood — on git that's `commit_id`, on jj that's `change_id`. The fact that jj also has `commit_id`s is a backend-internal detail that NEVER crosses the adapter boundary. The jj backend never volunteers a `commit_id` from any cross-backend verb.

> v1.0 + v1.1 requirements are archived under `Validated` in `PROJECT.md` and in `.planning/milestones/v1.1-REQUIREMENTS.md`. This file scopes v1.2 only.

## v1.2 Requirements

### Audit (AUDIT)

Load-bearing precondition for the surface flip. Output: `.planning/intel/id-namespace-audit.md` with per-call-site row format `{File:line, Surface, Today (git/jj), Caller's use, Verdict, Owner phase, Allowlist entry}` and closed verdict enum (`safe` / `flip-clean` / `needs-rename` / `needs-resolveShort` / `boundary-io` / `historical-prose` / `unclear`). Includes a one-shot jj 0.41 NDJSON schema probe verifying `change_id` is emitted by `json(self)` (Risk 4 in research/ARCHITECTURE.md).

- [ ] **AUDIT-01**: Audit every `commit_id` template, `.commit_id` field access, `LogEntry.hash`/`CommitResult.hash` consumer, hex-shape regex, and `(...).slice(0, 7|8|12)` site in `sdk/src/` (production code) — classify each via the verdict enum
- [ ] **AUDIT-02**: Audit `get-shit-done/bin/lib/*.cjs` (CJS runtime) and `scripts/` (build/lint scripts) — same enumeration; tags `boundary-io` candidates that drive the LINT-03 import-pattern decision
- [ ] **AUDIT-03**: Audit `sdk/src/vcs/__tests__/`, `sdk/src/**/__tests__/`, and `tests/__tools__/` — find hex-prefix assertions (`.toMatch(/\^?\[0-9a-f\]/)`), `.slice(0, 7|8|12)` on id fields, cross-backend `expect(gitResult).toEqual(jjResult)` on id-bearing fields. Drives Plan 2 sweep + `expectIdShape` matcher rollout (TEST-12)
- [ ] **AUDIT-04**: Audit `get-shit-done/workflows/*.md`, `commands/*.md`, agent prompt files, and `.planning/` prose for `commit_id` mentions and `vcs.kind === 'jj'` id-branching code blocks. Drives PROMPT-05 deletions and the close-gate prose hex-leak sweep

### Surface Flip (FLIP)

Apply the audit verdict. Compiler errors are the forcing function — hard renames, no aliases.

- [ ] **FLIP-01**: Flip the 7 `commit_id` template sites on the jj backend to `change_id`: `sdk/src/vcs/backends/jj.ts:222-227, 946, 965, 978` (commit hash probe + resolveShort + countCommits + rootCommits) and `sdk/src/vcs/parse/jj-log.ts:26,56`, `parse/jj-workspace-list.ts:28,46`, `parse/jj-bookmark.ts:19-21` (NDJSON parsers)
- [ ] **FLIP-02**: Rename `LogEntry.hash` → `LogEntry.id` (types.ts:109-116). Hard rename, no alias. Sweep all ~27 consumer sites (`query/log.ts`, `query/verify.ts`, `query/progress.ts`, `query-raw-output-projection.ts`, `query/mutation-event-mapper.ts`, `format-migration/orphan.ts`, `format-migration/run.ts`, `verify.cjs`, plus tests)
- [ ] **FLIP-03**: Rename `CommitResult.hash` → `CommitResult.id` (types.ts:91). Hard rename, no alias. Sweep `commands.cjs` post-commit announcements + `mutation-event-mapper.ts` + `format-migration/run.ts` + `worktree-safety.cjs`. Includes flipping the underlying `jj.ts:222-227` template (Gap 1 from research)
- [ ] **FLIP-04**: Invert PITFALL 1 doc at `sdk/src/vcs/backends/jj.ts:327` from negative-contract ("`LogEntry.hash` is `commit_id` NEVER `change_id`") to positive-contract ("`LogEntry.id` is the active backend's canonical revision identifier — `commit_id` on git, `change_id` on jj"). Update related ADRs and JSDoc

### Lint Guard (LINT)

Architectural enforcement. Fork the existing `lint-vcs-no-raw-git.cjs` pattern; first green run is the validation that the FLIP is complete.

- [ ] **LINT-01**: Ship `scripts/lint-vcs-no-commit-id.cjs` cloning the structure of `scripts/lint-vcs-no-raw-git.cjs`. Default-deny match patterns: `'commit_id'` literals, `.commit_id` field accesses, hex-shape regexes (`/\^?\[0-9a-f\]\{[0-9]+\}/`), and 40-char hex string literals. Whole-repo scan with annotated allowlist. CI step parallel to existing lint, required-blocking on jj-colocated lane
- [ ] **LINT-02**: Per-entry allowlist schema (`scripts/lint-vcs-no-commit-id.allow.json`) requires `reason`, `expires` (date), and `owner` fields per entry. Lint script CI-fails on missing required fields and on expired entries. Prevents Pitfall 7 (allowlist hollowing). Update existing `lint-vcs-no-raw-git.allow.json` schema to match for consistency (out-of-band tech-debt fold-in if cheap)
- [ ] **LINT-03**: If AUDIT-01 or AUDIT-02 identifies a real boundary-I/O consumer requiring a backend-private `commit_id` accessor (`sdk/src/vcs/backends/jj-internal.ts` per ARCHITECTURE.md §New Component), add a lint rule that whole-repo default-denies imports of that file with an allowlist limited to the audit-identified consumer(s). CI fails on >1 importer. If the audit identifies ZERO such consumers, this requirement closes by codifying "no boundary-I/O accessor exists" as the verified end state (the inversion of SEED-001 holds)

### Workflow refactor (PROMPT)

Continues v1.1's PROMPT-04 deletion pattern (-242 LOC raw-git fallbacks). The deletions are the *evidence* the unified abstraction works.

- [ ] **PROMPT-05**: Delete every `if (vcs.kind === 'jj') { /* reach for change_id */ } else { /* commit_id */ }` branch in `get-shit-done/bin/lib/*.cjs` and `get-shit-done/workflows/*.md` for id reasons (driven by AUDIT-04). Replace with the unified `vcs.refs.resolveShort(expr.rev(...))` / `commitResult.id` / `entry.id` access. Per the unified-revision-model memory: branching on `vcs.kind` for id reasons is itself a bug

### Test infrastructure (TEST)

Continues from v1.1's TEST-09..11 strict-green close gate. Custom matcher written up-front; cross-backend equality assertions migrated; goldens re-recorded.

- [ ] **TEST-12**: Introduce `expectIdShape(kind, value)` custom matcher in `tests/__tools__/` (or equivalent vitest helper module). Sweep ~10-20 cross-backend `expect(gitResult).toEqual(jjResult)` and `.toMatch(/^[0-9a-f]/)` sites identified by AUDIT-03 to use the new matcher. Re-record golden-parity baselines via `tests/__tools__/capture-vcs-baselines.cjs` after FLIP-01..03 lands. Strict-green on both backend lanes; no skip-count regressions

### `.planning/` format pass (MIGR)

Continues from v1.1's MIGR-05. Single rewriter pass at close-gate; explicit dogfood-cutover model.

- [ ] **MIGR-06**: Adopt phase-boundary-marker dogfood-cutover model: commits made BEFORE the FLIP plan lands carry `commit_id`-shape ids in `.planning/` (still resolvable on jj); commits AFTER FLIP carry `change_id`-shape ids. At v1.2 close-gate, run a single B-07-style rewriter pass over `.planning/phases/<v1.2-dir>/` to normalize. Extend `format-migration/rewrite.ts` `COMMIT_KEY_ALLOWLIST` with any new commit-bearing keys discovered by AUDIT-04 in `.planning/` formats added during v1.0+v1.1. One-time grep at close-gate confirms prose hex tokens are historical-only

## v1.3+ Requirements (deferred)

Acknowledged but explicitly deferred past v1.2.

### LINT (further)

- **LINT-04**: Workflow `.md` and `.planning/` prose-level lint (separate tool from `lint-vcs-no-commit-id.cjs`). Markdown-only `commit_id`-leak class. Lower priority because `LINT-01` blocks code-level reintroduction; prose drift has secondary impact (only affects docs surface)

### Niceties from research

- **TEST-13**: `vcs.refs.matchPrefix(id, prefix)` alphabet-aware short-prefix matching. Build only if a v1.2 audit verdict surfaces real `id.startsWith(prefix)` callers; otherwise drop the API entirely
- **NAMING-01**: Cosmetic rename `rootCommits` → `rootRevisions` for naming-consistency sweep (low value; high churn)
- **API-01**: Public `vcs.refs.idAlphabet` introspection (no consumer asks yet)

### Carried follow-ups (NOT v1.2 scope)

- **PARALLEL-01**: Orchestrator parallelization rewrite (`get-shit-done/workflows/execute-phase.md` raw-git `worktree add`/`merge --no-ff`/`worktree remove` → jj octopus + reap). Independent code path; tracked in `project_no_parallelization_yet` memory
- **A3-PRECOMMIT-01**: Colocated pre-commit hook gap (jj 0.41 doesn't auto-fire `.git/hooks/pre-commit` after `jj squash` colocated). Three fix paths in Phase 4 LEARNINGS Open Q1; tracked in `project_a3_colocated_pre_commit_gap` memory

## Out of Scope

Explicit exclusions for v1.2. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Building `vcs.jjOnly.commitIdOf` (or any cross-backend escape hatch) speculatively | Inverts the milestone premise. Build only if AUDIT identifies a genuine boundary-I/O consumer; expected verdict is ZERO consumers (`github-release-notes.cjs` debunked as false-alarm in research/ARCHITECTURE.md). If a consumer surfaces, it lives at `sdk/src/vcs/backends/jj-internal.ts` (backend-private), never on the cross-backend `vcs.*` namespace |
| Backwards-compat alias `LogEntry.hash = LogEntry.id` (or `CommitResult.hash`) | Defeats the audit; tech debt accretes. Hard rename — compiler errors are the forcing function. Per PITFALLS Pitfall 8 |
| Renaming `expr.commit(sha)` → `expr.rev(id)` | **Already done** in Phase 2.1 (verified `sdk/src/vcs/expr.ts:43-94`). SEED-001's bullet describing this work is stale; v1.2 audit verifies no reintroduction (cheap grep) but no flip is needed |
| Markdown / `.planning/` prose lint as a CI-blocking step | Defer to v1.3 (LINT-04). v1.2 LINT-01 blocks code-level reintroduction, which is the higher-leverage prevention; prose drift has secondary impact and can be cleaned up at any future phase boundary |
| Removing the `git` backend or `gitOnly.*` namespace | Out of scope across all milestones (per PROJECT.md Out of Scope). Adapter keeps git first-class — removing breaks upstream rebase ergonomics + dual-backend tests |
| `vcs.kind === 'jj'` branching for non-id reasons (e.g., feature parity, allowlist resolution) | NOT in scope. Only branches that exist *for id reasons* are deletion targets per PROMPT-05. Other legitimate `vcs.kind` checks (e.g., `gitOnly.*` accessor narrowing) remain valid |
| Performance optimization of the new lint guard or audit script | Functionality first. CI delta verified <30 s in close-gate; deeper perf work deferred unless CI delta exceeds budget |

## Traceability

All 14 v1.2 requirements map to Phase 8 (Unified Revision Model — Audit → Test-Prep → Flip → Lint Guard → Close-Gate). Single-phase shape per research recommendation (SUMMARY.md + ARCHITECTURE.md): audit is a hard precondition for the flip; test-prep matcher introduced before flip; flip before lint guard's first green run; PROMPT-05 deletions after flip + after AUDIT-04; MIGR-06 close-gate rewriter pass.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUDIT-01 | Phase 8 | Pending |
| AUDIT-02 | Phase 8 | Pending |
| AUDIT-03 | Phase 8 | Pending |
| AUDIT-04 | Phase 8 | Pending |
| FLIP-01 | Phase 8 | Pending |
| FLIP-02 | Phase 8 | Pending |
| FLIP-03 | Phase 8 | Pending |
| FLIP-04 | Phase 8 | Pending |
| LINT-01 | Phase 8 | Pending |
| LINT-02 | Phase 8 | Pending |
| LINT-03 | Phase 8 | Pending |
| PROMPT-05 | Phase 8 | Pending |
| TEST-12 | Phase 8 | Pending |
| MIGR-06 | Phase 8 | Pending |

**Coverage:**
- v1.2 requirements: 14 total
- Mapped to phases: 14 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-14*
*Roadmap mapped: 2026-05-14 (Phase 8)*
*Milestone: v1.2 jujutsu is change-only — never commit id anywhere*
