# Project Research Summary

**Project:** GSD jj-port fork — v1.4 cleanup + deferred-item harvest
**Domain:** Long-running fork cleanup milestone before next upstream pull (NOT new feature work)
**Researched:** 2026-05-23
**Confidence:** HIGH

## Executive Summary

v1.4 is a closed-acceptance cleanup milestone whose entire scope is **fork-internal todos, deferred-item harvest, drift-control, and PROJECT.md reconciliation** — not new product features. Across all four research lenses (STACK, FEATURES, ARCHITECTURE, PITFALLS) the dominant finding is the same: **every v1.4 item is pure reuse of existing patterns**. Zero new npm dependencies, zero version-floor bumps, zero new test frameworks, zero new shared lib modules, zero new exec primitives. The work is consuming surfaces the v1.0–v1.3 milestones already built (existing lint scaffolds, existing `node:test` drift-control idiom in `tests/inventory-counts.test.cjs`, existing `parallel.*` adapter namespace, existing alphabet-aware string handling, existing CLI-bridge three-site registration pattern).

The recommended approach is a **four-phase structure organized by surface-affinity** (adapter surface extensions, workflow/invariant tooling, drift control + reconciliation, tactical v14-* cleanup). Within each phase, plans are sequenced by file-overlap discipline: plans that touch the same files run sequentially, plans on disjoint surfaces run as parallel waves. The single largest risk is **scope creep** — v1.4 has no external user-story to push back against "while we're here" deltas, so the closed acceptance set must be locked at REQUIREMENTS.md write time and enforced at every discuss-phase.

The most consequential design call in the milestone is the **`vcs.workspace.parallel.cancel(handle)` semantics**, where STACK and FEATURES research arrived at OPPOSITE recommendations. STACK says synchronous teardown only (cite: `spawnSync` exec layer cannot accept `AbortSignal`; orchestrator-awaits-Agent invariant makes mid-flight cancel a non-problem in production). FEATURES says mixed SIGTERM-then-SIGKILL with partial-completion enum (cite: GNU parallel `--halt-on-error 1` precedent). PITFALLS adds a third constraint: cancel must NOT signal subagents (Pitfall 5) but MUST publish a non-void result shape with a `leakedPaths`-equivalent field. **The reconciling truth**: the FEATURES recommendation assumes a different exec layer than what ships. Given the current `spawnSync` reality + the Phase 11 D-01 "no orchestrator sidecar state" invariant + the Pitfall 5 cleanup-races analysis, the **STACK lens is correct** and the discuss-phase should adopt it: cancel is synchronous batched teardown of already-materialized workspaces, returns a structured `CancelResult`, does not signal subagents. The FEATURES "interrupt mid-Agent" use case is OUT OF SCOPE for v1.4 and would require a separate `vcsExecAsync` primitive in a future milestone.

## Key Findings

### Recommended Stack

**Net additions: ZERO.** Every v1.4 item reuses existing dependencies, frameworks, and lib modules already in the repo. The only "version verification" worth recording is that `AbortController`/`AbortSignal` are native on Node ≥22 (already required) and that `child_process.spawnSync` does NOT accept `signal` — load-bearing for the cancel design.

**Core technologies (all existing — no changes):**
- **Node ≥22** + **pnpm 11.0.8** + **TypeScript ^5.7** — UNCHANGED; runtime verified `v25.9.0` / `11.0.8`.
- **vitest ^3.1.1** (sdk/) — UNCHANGED; vitest 4.x is out of v1.4 scope (defer past next upstream pull due to breaking config-shape changes).
- **`node:test`** (tests/) — UNCHANGED; this is the framework for both new drift-control tests, matching `tests/inventory-counts.test.cjs` precedent. Bifurcation by directory (`tests/` → `node:test`; `sdk/` → vitest) is the convention.
- **jj 0.41** — UNCHANGED. All deferred items use stable primitives (`abandon`, `workspace forget`, `bookmark delete`).
- **`scripts/lib/allowlist-parser.cjs` + `glob-to-regex.cjs`** — reused verbatim for the new call-presence lint; no new shared lib module.
- **`scripts/lint-vcs-no-raw-git.cjs` + `audit-workflow-raw-git.cjs`** — pattern source for the new call-presence lint (default-deny + per-entry `{path|glob, reason, owner}` allowlist; fence-aware markdown walker).

See `.planning/research/STACK.md` for full per-item stack analysis and the consolidated 16-item "NOT adding" anti-pattern fence.

### Expected Features

The 11 v1.4 target items cluster into **four clean categories** (see FEATURES.md §a):

**Must have (in v1.4 scope):**
- 5 tactical cleanup todos: `v14-transition-md-update-gap`, `v14-orphan-jj-workspace-dirs`, `v14-review-followups` (5 WR + 5 IN), `v14-jj-reap-test-flake`, `v14-docs-verify-only-followups` (45 failures, 8 themes).
- 3 deferred API additions: `vcs.refs.idAlphabet`, `vcs.refs.matchPrefix(id, prefix)`, `vcs.workspace.parallel.cancel(handle)`.
- 2 deferred renames/lints: `rootCommits → rootRevisions` hard rename, workflow call-presence lint.
- 3 drift-control + reconciliation: `tests/architecture-counts.test.cjs`, `tests/command-count-sync.test.cjs`, ARCHITECTURE.md prose-count fixes (en + 3 translations) + PROJECT.md `### Validated` reconciliation.

**Should have (within v1.4 scope but lower priority):**
- ADR supersession notes for Theme 3 of docs-verify-only-followups (preserves immutability convention).
- Cleanup-helper extraction (`cleanupSubagentWorkspaces`) consumed by 3 call sites: dispatcher fanIn, recovery script, parallel.cancel — see PITFALLS Pitfall 11.

**Defer (v1.5+ or post-upstream-pull):**
- vitest 4.x upgrade (breaking config changes; defer past upstream pull).
- `vcsExecAsync` async-exec primitive (would enable mid-Agent signal-based cancel; not justified by current use cases).
- `gsd-sdk query refs.match-prefix` CLI bridge for `matchPrefix` (no production caller in v1.4).
- A workflow-callable cancel verb (cancel is adapter-facing only in v1.4; future milestones can adopt).
- Mid-Agent process killing (Pitfall 5 anti-pattern — operator uses Claude Code UI/CLI to kill subagents; cancel only cleans up workspaces post-mortem).
- Broader test-perf rewrite (`project_test_perf_pain_vitest` deferred per PROJECT.md OOS clause; only the specific `jj-reap.test.ts > inclusion-filter` flake is in scope).

See `.planning/research/FEATURES.md` for industry precedents (Tokio JoinSet, GNU parallel, GitHub Actions matrix; Git `core.abbrev`, jj prefix index; actionlint, internal lint precedents).

### Architecture Approach

All items decompose into **three architectural buckets** without crossing the existing v1.3 boundaries (no new layers, no new namespaces, no new sidecar files beyond per-verb CLI bridges). See ARCHITECTURE.md §Per-Item.

**Major components (touched, not created):**
1. **`sdk/src/vcs/types.ts` — VcsAdapter interface** — sites for new `idAlphabet` property, new `matchPrefix` method, new `cancel` method, and the `rootRevisions` rename. Four plans, sequential within one phase (file-overlap → sequential plans, NOT parallel-safe).
2. **`sdk/src/vcs/backends/{git,jj}.ts` + sidecars (`jj/parallel.ts`, `git/parallel.ts`)** — per-backend implementations of the new methods. UPSTREAM-02 invariant holds (sidecars never import from backends).
3. **`sdk/src/query/*` (3-site CLI registration: catalog-domain + manifest.non-family + aliases.generated)** — load-bearing for the new `workspace-parallel-cancel.ts` bridge; missing any one site breaks runtime verb resolution.
4. **`scripts/lint-vcs-parallel-call-presence.cjs` + `.allow.json`** — new but mirrors `lint-vcs-no-raw-git.cjs` shape exactly; CI lane via `.github/workflows/parallel-e2e.yml` (NOT pretest).
5. **`tests/architecture-counts.test.cjs` + `command-count-sync.test.cjs`** — new `node:test` drift-control tests scanning live filesystem vs prose counts; verbatim template copy of `tests/inventory-counts.test.cjs`.
6. **`get-shit-done/workflows/transition.md` (existing) + `scripts/dogfood-restore.sh` (existing)** — extended with `assert_clean_wc` gate and orphan-dir reap respectively.

### Critical Pitfalls

The PITFALLS research identifies **6 critical, 6 moderate, 5 integration, plus debt/UX/security/perf surfaces** — see PITFALLS.md for the 21-item "Looks Done But Isn't" checklist. The top 5 to surface to roadmapper:

1. **Scope creep (Pitfall 1)** — Lock the closed acceptance set at REQUIREMENTS.md write time. The 5 v14-* todos' `## Acceptance criteria` sections are the spec; do NOT add bullets at plan-phase. Warning sign: any plan PLAN.md whose `must_haves` count exceeds the source todo's acceptance count.
2. **`rootCommits → rootRevisions` half-rename (Pitfall 3)** — TypeScript compiler protects `.ts` consumers only. The v1.2 retro CR-01 precedent (`commands.cjs:1005` CJS-side miss after `LogEntry.hash → .id` rename) proves the CJS + workflow markdown + `backends.ts:79` capability matrix surfaces are silent failure modes. Mandatory pre-rename grep audit emitted as JSON sidecar; per-extension `grep -c` must exit 0 before commit; treat archived `.planning/` files as historical-prose carve-out.
3. **Phase 14 false-clean-WC pattern re-introduced (Pitfall 2)** — `v14-transition-md-update-gap` is the highest-risk known recurrence site; fix it FIRST in v1.4 before any new workflow surface lands. Operator-facing caveat: the global install at `~/.claude/get-shit-done/workflows/` still has the OLD workflow until reinstall; document in the milestone close.
4. **Drift-control tests added BEFORE drift is fixed (Pitfall 4)** — The codebase ALREADY HAS DRIFT in `docs/ja-JP/ARCHITECTURE.md` (コマンド総数: 44 → 68, ワークフロー総数: 46 → 89, etc.). Tests-first ships day-1 red CI. Strict ordering at roadmap: drift FIX (Wave 1) → drift TEST (Wave 2). Or graduate via audit-as-baseline pattern (LINT-04 reframe).
5. **parallel.cancel partial-state cleanup races (Pitfall 5)** — RESOLVES THE STACK↔FEATURES CONFLICT in this synthesis: cancel does NOT signal subagents; cancel return shape is structured `CancelResult` with backend-opaque `leakedPaths`-equivalent; cancel reuses the shared `cleanupSubagentWorkspaces` helper extracted in Pitfall 11's prevention. The Phase 11 D-01 invariant ("orchestrator awaits all Agent() resolutions before fanIn") + Phase 9 PARALLEL-03 deferral rationale ("orchestrator-awaits-Agent() invariant makes liveness moot in production") combine to make this the architecturally consistent answer.

Honorable mentions: Pitfall 6 (matchPrefix wrong-alphabet should THROW, not silent-false), Pitfall 11 (orphan-dirs ownership: dispatcher fanIn is single owner, shared helper consumed by 3 sites), Pitfall 12 (45 docs-update fixes need per-theme triage, not bulk-edit), Pitfall 9 (`jj-reap.test.ts` flake-fix narrowly scoped — ≤5 LOC, ≤1 file, vitest.config.ts untouched, check-skip-count green).

## Implications for Roadmap

Based on cross-research synthesis, the suggested phase structure is **four phases** organized by file-disjoint surface affinity. Within each phase, plans are sequenced by file-overlap discipline. Across phases, the recommended canonical order is **15 → 16 → 17 → 18** (each phase parallel-safe across categories; canonical order maximizes narrative coherence in the close-gate commit log).

### Phase 15 — Adapter surface extensions + rename (4 plans, SEQUENTIAL within phase)

**Rationale:** All four plans touch `sdk/src/vcs/types.ts` + `backends/git.ts` + `backends/jj.ts`. File-overlap forces sequential plan ordering, NOT parallel waves. Adapter surface is the highest-leverage surface — every other phase consumes the adapter.

**Delivers:** `rootRevisions` rename, `vcs.refs.idAlphabet`, `vcs.refs.matchPrefix`, `vcs.workspace.parallel.cancel`.

- **Plan 15-01 — `rootCommits → rootRevisions` hard rename.** Ships FIRST (smallest diff; clears the namespace; doing it later forces same-file rebase). Addresses Pitfall 3 with mandatory pre-rename grep audit as JSON sidecar (the v1.2 "JSON sidecar as build-pipeline seed" pattern); per-extension `grep -c '\brootCommits\b'` must exit 0 before commit; archived `.planning/` files treated as historical-prose carve-out. No alias (hard rename per v1.2 NAMING-01 precedent).
- **Plan 15-02 — `vcs.refs.idAlphabet`.** Three-line addition to the refs namespace (`'0-9a-f'` git, `'k-z'` jj) + cross-backend contract test. Addresses ambiguity Flag #1 from FEATURES.md (discuss-phase confirms `string` vs structured object — recommend opaque `string` per ARCHITECTURE.md "treat as raw char-class regex body").
- **Plan 15-03 — `vcs.refs.matchPrefix`.** Consumes idAlphabet contract. Pure-string per-backend implementation; backend hard-codes its alphabet regex inline (no closures over adapter state; matches `validateRefname` precedent). Addresses Pitfall 6: **throw** on wrong-alphabet (not silent-false), throw on empty prefix, return false on `prefix.length > id.length`, hex case-insensitive, k-z lowercase-only. Test cross-product mandatory.
- **Plan 15-04 — `vcs.workspace.parallel.cancel`.** Ships LAST (largest, consumes settled types.ts diffs). Resolves the STACK↔FEATURES synthesis conflict via the **synchronous-teardown-only** model (Pitfall 5 + Phase 11 D-01 + Phase 9 PARALLEL-03 invariants). Structured `CancelResult` return shape (NOT void; NOT boolean). Cancel does NOT signal subagents; consumes the shared `cleanupSubagentWorkspaces` helper extracted in Phase 16-02. New CLI bridge at `sdk/src/query/workspace-parallel-cancel.ts` — three-site registration (catalog-domain + manifest.non-family + aliases.generated).

**Avoids:** Pitfalls 3, 5, 6; Anti-Patterns 1 (no alias) and 3 (no mid-Agent process-killing).

### Phase 16 — Workflow + invariant tooling (2 plans, PARALLEL-SAFE)

**Rationale:** File-disjoint plans (16-01 = `scripts/` + `.github/workflows/`; 16-02 = `sdk/src/vcs/jj/parallel.ts` + `scripts/dogfood-restore.sh`). Independent of Phase 15 unless cancel (15-04) reuses the orphan-dir cleanup contract (it does — soft coupling but file-disjoint).

**Delivers:** workflow call-presence lint; orphan FS dir reap.

- **Plan 16-01 — Workflow call-presence lint.** New `scripts/lint-vcs-parallel-call-presence.cjs` + per-entry allowlist (no `expires` per `feedback_solo_dev_no_expires`) + fixture-based unit test + CI step in `parallel-e2e.yml`. Addresses Pitfall 7 by scoping lint to **shell fences only** (reuse `audit-workflow-raw-git.cjs` fence-aware walker) + default-deny + per-file allowlist for legitimate non-dispatchers like `code-review.md`/`audit-fix.md`. NOT pretest (`audit-workflow-raw-git.cjs` D-07 CI-only precedent). Inline escape: `vcs-lint:allow-parallel-call-absent-here <reason>`. Discuss-phase resolves Flag #3/#5: hard-fail (mirrors `lint-vcs-no-raw-git.cjs`); content-driven scope (literal substring match in bash fences), no heading-based tagging.
- **Plan 16-02 — Orphan FS dir reap (`v14-orphan-jj-workspace-dirs`).** Extends `performJjParallelFanIn` clean-path branch with per-workspace `rmSync({recursive: true, force: true})` loop (do NOT extend the conflicted branch — preserves W3 (a) inspection contract). Extends `dogfood-restore.sh` with idempotent post-restore `find … -exec rm -rf` step. Pitfall 11 prevention: extract shared `cleanupSubagentWorkspaces(phaseRoot, phaseNumber)` helper as Wave 1 of this plan (single-owner: dispatcher fanIn; recovery script + cancel verb both consume the same helper). Same code path, no drift.

**Avoids:** Pitfalls 7, 11; Anti-Patterns 4 (no pretest) and 5 (no conflicted-branch reap).

### Phase 17 — Drift control + reconciliation (4 plans, MOSTLY PARALLEL with strict 17-01→17-02 ordering)

**Rationale:** Forces fix-then-test ordering to prevent Pitfall 4 day-1-red-CI. PROJECT.md reconciliation runs LAST (IP-4 prevention) so it captures v1.4's own REQ-IDs.

**Delivers:** drift-control tests; ARCHITECTURE.md prose-count fixes (en + 3 translations); PROJECT.md `### Validated` reconciliation; remaining docs-update themes 1-5+7+8.

- **Plan 17-01 — ARCHITECTURE.md prose-count fixes FIRST (Wave 1).** Per-translation fix: `ja-JP/ARCHITECTURE.md` (4 known drift sites: :116, :127, :137, :427), `ko-KR/ARCHITECTURE.md`, `pt-BR/ARCHITECTURE.md`. En source defers to INVENTORY.md per current pattern (audit confirms :121, :143). zh-CN does NOT exist; do not create.
- **Plan 17-02 — Drift-control tests SECOND (Wave 2, must cite 17-01 completion).** New `tests/architecture-counts.test.cjs` + `tests/command-count-sync.test.cjs`. Verbatim copy of `tests/inventory-counts.test.cjs` shape: `node:test` framework, regex-extract prose claim + `fs.readdirSync().length` actual, `assert.strictEqual`. Both sides computed at runtime — no hardcoded numbers, no snapshots. Discuss-phase resolves Flag #4: keep as TWO files (honor the names INVENTORY.md theme 6 calls out; cross-link via comment). **Tests are GREEN on land** because 17-01 fixed the drift first. Addresses Pitfall 4 + Anti-Pattern 2 (no vitest pollution; `tests/` `node:test` only).
- **Plan 17-03 — v14-docs-verify-only-followups themes 1-5, 7, 8 (batched plan, per-theme commits within).** Pitfall 12 triage: theme 3 (ADR drift) gets append-only "## Update YYYY-MM-DD" supersession notes (NOT in-place edit); theme 5 (phase-3 archived references) anchored to change_ids/commits (NOT deleted); theme 6 (drift-control tests claimed but missing) RESOLVED by 17-02. Per-theme decisions recorded in `.planning/intel/docs-update-fix-triage.md` BEFORE execute.
- **Plan 17-04 — PROJECT.md `### Validated` reconciliation (LAST plan of v1.4, IP-4 ordering).** Two-pass approach: machine-generated truth source at `.planning/intel/project-validated-truth.md` (the SoT); human-edited PROJECT.md narrative cites the truth source and preserves hand-curated parentheticals like "(caveat: A3 colocated pre-commit gap remains open, see Active)". Pitfall 8 prevention: NOT a full regenerate-overwrite. Includes v1.4's OWN REQ-IDs (matchPrefix, idAlphabet, cancel, rename, drift-tests) — that's why this runs LAST.

**Avoids:** Pitfalls 4, 8, 12; Anti-Pattern 2; IP-1 (rename ships in Phase 15, before drift-tests in Phase 17 — auto-resolves); IP-4 (reconciliation LAST).

### Phase 18 — Tactical cleanup (3 plans, PARALLEL-SAFE; the cleanup-helper extraction is Wave 1)

**Rationale:** All v14-* todos that didn't fold into earlier phases. Each touches different files; parallel-safe. The `cleanupSubagentWorkspaces` helper extraction (Pitfall 11) happened in Phase 16-02 — Phase 18 plans consume it.

**Delivers:** transition.md gate, WR-NN review-followups, jj-reap flake fix.

- **Plan 18-01 — `v14-transition-md-update-gap` (HIGHEST PRIORITY; Pitfall 2 prevention).** Apply the Phase 14 quick-task pattern (`assert_clean_wc` + reorder mutation/commit pair) to `transition.md:166`. Should land FIRST in any v1.4 wave that touches workflows — otherwise other v1.4 workflow changes risk re-triggering the false-clean pattern.
- **Plan 18-02 — `v14-review-followups` (WR-01..05 + 5 info items).** Pitfall 10 prevention: **per-WR commits** (or per-WR delimited sections of one commit), each with its own verification test. Order: prod-code fixes (WR-03 `Array.isArray`, WR-04 `Number.isNaN`) FIRST, then script fixes (WR-01 project-root assertion in `dogfood-restore.sh`, WR-02 tar overlay decision), then test fixes (WR-05 `afterEach` rm). Info findings addressed opportunistically when adjacent files are touched (NOT forced into milestone if no adjacent fix lands).
- **Plan 18-03 — `v14-jj-reap-test-flake`.** Narrow scope per Pitfall 9: per-test fix only (`it.timeout(15_000)` as first try; `concurrent: false` at describe-block only if (a) is verified insufficient via bisection). Diff ≤5 LOC, ≤1 file, vitest.config.ts UNTOUCHED, check-skip-count.cjs green. Out-of-scope reaffirmation in plan CONTEXT.md citing PROJECT.md OOS clause verbatim. No `retry: N`, no broader vitest reorg.

**Avoids:** Pitfalls 2, 9, 10; the `project_test_perf_pain_vitest` scope-creep temptation.

### Phase Ordering Rationale

- **Phase 15 first** because the adapter surface is consumed by every other phase, and Plan 15-01 (rename) auto-resolves IP-1 (rename + drift-test interaction) by landing before Phase 17's drift-control tests.
- **Phase 16 second** because Plan 16-02 (cleanup-helper extraction) is a soft prerequisite for Plan 15-04 (cancel) — if Phase 15 ships first, cancel inlines the cleanup (refactored out in Phase 16-02); if Phase 16 ships first, cancel consumes the helper directly. Order is flexibility-preserving.
- **Phase 17 third** because Plan 17-04 (PROJECT.md reconciliation) is IP-4 — must run AFTER all deferred-item-harvest plans complete to capture v1.4's own REQ-IDs.
- **Phase 18 fourth** because the v14-* todos are file-disjoint and lowest-priority; they can drop into any wave. Phase 18 is the natural "everything else" bucket.

The dependency graph collapses to: **Plan 15-01 (rename) → Plan 15-02 (idAlphabet) → Plan 15-03 (matchPrefix) → Plan 15-04 (cancel) | Plan 17-01 (drift-fix) → Plan 17-02 (drift-tests) | Plan 17-04 (reconciliation) LAST**. Everything else is parallel-safe.

### Research Flags

Phases that likely need deeper research during planning:

- **Phase 15 (especially Plan 15-04 `parallel.cancel`):** The STACK↔FEATURES conflict on cancellation semantics has been synthesized to a recommendation (synchronous-teardown-only), but discuss-phase MUST explicitly adopt this resolution. Specifically: confirm the `CancelResult` shape (`{abandoned: readonly string[], surplusBookmarks: readonly string[], surplusWorkspaces: readonly string[]}`-style, mirroring `FanInResult`), confirm cancel does NOT signal subagents, confirm cancel reuses the shared cleanup helper. PITFALLS Pitfall 5 is the deciding analysis.
- **Phase 16 (Plan 16-01 lint scope decision):** Discuss-phase must enumerate the closed dispatch-relevant-workflows set (currently only `execute-phase.md` + `quick.md`) and the false-positive-risk workflows (`code-review.md`, `audit-fix.md`). Pitfall 7's "scope by SHELL FENCE not by prose mention" is the architectural recommendation; confirm content-driven detection over heading-based tagging.
- **Phase 17 (Plan 17-02 drift-test framework + Flag #4 file-count decision):** Discuss-phase resolves whether `command-count-sync.test.cjs` is distinct from `architecture-counts.test.cjs` or should merge. Recommendation: keep TWO files (honor INVENTORY.md theme 6 names; cross-link via comment).

Phases with standard patterns (lighter research needed):

- **Phase 15 Plans 15-01 (rename), 15-02 (idAlphabet)**: mechanical sweeps with HIGH-confidence precedent (v1.2 `LogEntry.hash → .id` rename + existing alphabet probe at `jj-id-alphabet-probe.test.ts`).
- **Phase 18 all plans:** narrow-scope tactical fixes; each todo's `## Acceptance criteria` is the verbatim spec.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Every cited file:line verified via Read/Bash; AbortController/spawnSync claims verified via runtime probe + Node.js official docs. Zero net-new dependencies eliminates most stack risk. |
| Features | HIGH | Direct prior art exists for every item (`tests/inventory-counts.test.cjs` is verbatim template for drift-control tests; `lint-vcs-no-raw-git.cjs` is verbatim template for call-presence lint; v1.2 `LogEntry.hash → .id` is verbatim precedent for rename). 3 independent industry precedents per ambiguous item (Tokio/GNU parallel/GitHub Actions for cancel; Git/jj/internal-regex for matchPrefix; actionlint/lint-vcs-no-raw-git/audit-workflow-raw-git for lint). |
| Architecture | HIGH | Every claim grounded in existing repo state or v1.3 precedent. File counts and call-site enumeration verified via grep. Three-site CLI registration pattern documented at exact file paths. |
| Pitfalls | HIGH | Every pitfall cites per-incident artifacts in `.planning/` (v1.2 retro CR-01, Phase 14 quick-task audit table, etc.). PITFALLS research's 21-item "Looks Done But Isn't" checklist provides direct milestone-close gating. |

**Overall confidence:** HIGH. This is a closed-acceptance cleanup milestone with verified prior art for every category of work.

### Gaps to Address

The synthesis surfaces three genuine open questions that require discuss-phase decisions (not research gaps — design choices):

- **Cancel semantics (Flag #2, FEATURES.md):** STACK and FEATURES research arrived at OPPOSITE recommendations. **Recommendation: adopt STACK lens (synchronous teardown only)** per Pitfall 5 analysis. Discuss-phase must explicitly affirm this and reject the "mixed SIGTERM/SIGKILL with partial-completion enum" alternative as out-of-scope. The "interrupt mid-Agent" use case requires a separate `vcsExecAsync` primitive — defer to a future milestone if ever justified.
- **`idAlphabet` return shape (Flag #1, FEATURES.md vs ARCHITECTURE.md):** FEATURES recommends structured `{kind, chars, minLen, maxLen}`; ARCHITECTURE recommends opaque `string`. **Recommendation: opaque `string`** per ARCHITECTURE.md ("matches the JSDoc framing as a `RegExp` character-class body; typed enum would force callers to switch on backend kind, defeating the unified-revision-model invariant"). YAGNI applies: ship the bare alphabet; consumers compose `^[${alphabet}]+$` themselves; widen to structured later if a real consumer needs it.
- **Drift-test file-count (Flag #4, FEATURES.md):** Whether `architecture-counts.test.cjs` and `command-count-sync.test.cjs` ship as 2 files (honor INVENTORY.md theme 6 names) or 1 merged. **Recommendation: 2 files** (theme 6 specifically names both; single-responsibility; separate failure messages). Cross-link via comment.

Operator-facing caveat to document at milestone close: the global install at `~/.claude/get-shit-done/workflows/` still has the OLD workflow until the operator runs `node bin/install.js --claude --global`. The v1.4 workflow gate fixes only protect FUTURE installs unless the operator reinstalls. Per Pitfall 2 prevention guidance and the `feedback_workflow_assert_clean_wc` memory.

## Sources

### Primary (HIGH confidence — verified at research time)

- `.planning/research/STACK.md` — 6-item stack analysis with file:line citations; consolidated 16-item "NOT adding" anti-pattern fence; composite version-floor matrix.
- `.planning/research/FEATURES.md` — 4-category feature breakdown; 3 industry precedents per ambiguous item; 5 ambiguity flags; recommended phase ordering.
- `.planning/research/ARCHITECTURE.md` — 8-item architecture analysis with file:line file-change tables; 5 anti-patterns; 4-phase recommended build order; per-item data flow diagrams.
- `.planning/research/PITFALLS.md` — 12 pitfalls (6 critical + 6 moderate) + 5 integration pitfalls + tech-debt table + 21-item "Looks Done But Isn't" checklist + per-pitfall recovery strategies.
- `.planning/PROJECT.md` (v1.4 scope authority)
- `.planning/MILESTONES.md` (v1.0–v1.3 closed milestones)
- `.planning/RETROSPECTIVE.md` (v1.2 + v1.3 retros — direct precedents for Pitfalls 3, 5, 7, 11)
- `.planning/todos/pending/v14-*.md` (5 todos — the verbatim spec for tactical-cleanup phase)
- `sdk/src/vcs/types.ts:336-518` (insertion points for all new methods + rename target)
- `sdk/src/vcs/exec.ts:1-54` (`spawnSync`-only exec surface — load-bearing constraint for cancel)
- `sdk/src/vcs/__tests__/jj-id-alphabet-probe.test.ts:49-75` (alphabet disjointness empirical probe)
- `tests/inventory-counts.test.cjs:1-64` (verbatim template for drift-control tests)
- `scripts/lint-vcs-no-raw-git.cjs:1-165` (verbatim shape source for call-presence lint)
- `scripts/audit-workflow-raw-git.cjs:39-50,98-130` (fence-aware markdown walker reuse target)

### Secondary (MEDIUM confidence — community/industry precedents)

- Tokio `JoinSet::abort_all`/`shutdown` docs — cancel API shape precedent
- GNU `parallel --halt-on-error` tutorial — cancel partial-completion shape (RECOMMENDED AGAINST per Pitfall 5 reconciliation)
- GitHub Actions matrix `fail-fast` + `cancel-in-progress` — cancel two-stage precedent
- Git `core.abbrev` + `rev-parse --short` docs — auto-lengthening prefix precedent
- Jujutsu ID prefix index (Frere blog + jj glossary) — `k-z` reverse-hex alphabet documentation
- actionlint — "section declares X but never calls Y" lint shape precedent
- Jest/Vitest snapshot testing docs — drift-control INVERTED shape (RECOMMENDED AGAINST per FEATURES §2.4)

### Tertiary (LOW confidence — none in this milestone)

No tertiary sources required; every recommendation traces to a HIGH or MEDIUM source. The closed-acceptance cleanup nature of v1.4 means every item has either a verbatim precedent in the repo or a direct industry standard.

---
*Research completed: 2026-05-23*
*Ready for roadmap: yes*
