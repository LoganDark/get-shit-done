# Project Research Summary

**Project:** GSD jj-port — v1.2 unified revision model on cross-backend `VcsAdapter`
**Domain:** Dual-backend VCS adapter (git + jj 0.41) for a TypeScript SDK + CJS-runtime hybrid; subsequent-milestone refactor (audit + surface flip + lint guard) on an already-shipped adapter
**Researched:** 2026-05-14
**Confidence:** HIGH

## Executive Summary

v1.2 is a **subsequent-milestone refactor** — not a new build. v1.0 + v1.1 already shipped both backends and every structural verb. The work that remains is an **identity-contract** change: the cross-backend adapter must expose ONE concept of "a revision" (commit_id on git, change_id on jj), and the jj backend must never volunteer commit_id from any cross-backend verb. PROJECT.md inverts SEED-001's escape-hatch idea: leakage is a defect, not an opt-in. Industry survey confirms the chosen pattern (Pattern 3 — "native to the dominant backend; the other is an internal detail," precedent: jj-fzf, lazyjj, jjui).

The **recommended approach** is a tightly-scoped three-plan phase: (1) **Audit** every commit_id-reachable read site in `sdk/src/vcs/backends/jj.ts` and its consumers, classifying each via a closed verdict enum; (2) **Flip** the 7 jj template sites + rename `LogEntry.hash` → `LogEntry.id` and `CommitResult.hash` → `CommitResult.id` (compiler errors are the forcing function); (3) **Lint guard** — fork (don't extend) `scripts/lint-vcs-no-raw-git.cjs` into a sibling `lint-vcs-no-commit-id.cjs` that defaults-deny `commit_id` template strings, `.commit_id` field accesses, and hex-shape regexes in jj-routed code paths. **Zero new npm dependencies.** The audit is `~150 lines` of `.cjs` mirroring the existing lint script. The boundary-I/O accessor (`__jjCommitIdOf`) is built **only if the audit identifies a real consumer** — current evidence (`github-release-notes.cjs` reads bookmarks/tags, not commit URLs) suggests zero will be found.

The **highest risks** are silent: (a) hex-prefix matching on jj returns `false` with no exception (alphabet `[k-z]` is disjoint from `[0-9a-f]`); (b) callers that stored `LogEntry.hash` as a snapshot identity now hold a rebase-stable change_id whose meaning silently shifts under rewrites; (c) cross-backend `expect(git).toEqual(jj)` assertions fail by id-shape and tend to be relaxed to `toBeTruthy()`, hollowing the test. Prevention is process discipline (audit-before-flip; rename-as-forcing-function; custom `expectIdShape(kind, value)` matcher) plus the lint guard with per-entry `reason`/`expires`/`owner` schema to prevent allowlist hollowing. **One pre-emptive correction surfaced:** SEED-001's "deprecate `expr.commit(sha)`" task is stale — Phase 2.1 already renamed it; the v1.2 scope bullet for that work should be dropped.

## Key Findings

### Recommended Stack

**Net-new dependencies: zero.** All v1.2 tooling is built from in-tree primitives — Node `fs` + regex (the `lint-vcs-no-raw-git.cjs` precedent), `jj log -T` template invocation (already used 7× in `jj.ts`), and the existing `format-migration/rewrite.ts` machinery (`GIT_SHA_RE`, `JJ_CID_RE`, `findEligibleZones()`) which already implements zone-aware markdown scanning with proven idempotency. Rejected alternatives — ts-morph, jscodeshift, ast-grep, `unified`/`remark`, `@typescript-eslint/parser` — all add real cost (50 MB+ dep trees, CI install time, learning curve, splitting the lint stack across pure-Node and Rust binaries) for negligible audit-quality lift over the regex+walker approach the codebase already trusts.

**Core technologies (all already locked):**
- TypeScript `^5.7.0` — branded `RevisionExpr` is the v1.2 enforcement seam; field rename + `tsc` catches every consumer
- Node `>=22.0.0` + pnpm `11.0.8` — runtime + workspace; no version surface change
- vitest `^3.1.1` + `GSD_TEST_BACKENDS=git|jj-colocated` matrix — existing parameterization is the regression net
- jj `0.41` — first-class `change_id`, `change_id.short()`, `commit_id`, `commit_id.short()` templates available
- `scripts/lint-vcs-no-raw-git.cjs` — structural template (~80% copy-paste) for the new `lint-vcs-no-commit-id.cjs`
- `format-migration/rewrite.ts` exports — proven zone-walker for any prose hex-leak audit pass

### Expected Features

Detailed per-surface migration table is in `FEATURES.md` §"Per-Surface Migration Table." Eleven cross-backend surfaces flip from commit_id to change_id on jj (numbered #1–#11); five surfaces stay change_id (already correct from prior milestones).

**Must have (table stakes — v1.2 cannot ship without):**
- Caller audit doc (`.planning/intel/id-namespace-audit.md`) — load-bearing precondition
- All 11 cross-backend surface flips on jj backend (templates + parsers + return types)
- `LogEntry.hash` → `LogEntry.id` rename + `CommitResult.hash` → `CommitResult.id` rename + PITFALL 1 doc inversion at `jj.ts:327`
- Lint guard `lint-vcs-no-commit-id.cjs` with default-deny + audit-derived allowlist
- Workflow `vcs.kind`-branching deletions for id reasons (the deletions are the evidence the abstraction works)
- `.planning/` format pass extending Phase 6 B-07
- Boundary-I/O accessor — **only if audit finds a consumer** (expected: zero)

**Should have (consequences-of-flip; document but no new code):**
- Documented rebase-stability semantic on the new `LogEntry.id`
- Cleaner workflow `.md` (PROMPT-04 deletion pattern continues)
- Verb composition without backend-aware id bridging (Plan 07-02's pain resolved)

**Defer (v1.3+):**
- `vcs.refs.matchPrefix(id, prefix)` — alphabet-aware short-prefix matching (only if v1.2 audit finds callers)
- `rootCommits` → `rootRevisions` rename (cosmetic naming consistency)
- Public `vcs.refs.idAlphabet` introspection (no consumer asks yet)

### Architecture Approach

The change is **identity-contract**, not structural. Three integration points:

**Major components:**
1. **Audit script + doc** (`scripts/audit-id-namespace.cjs` → `.planning/intel/id-namespace-audit.md`) — enumerates every `commit_id` template, `.commit_id` access, `.hash` consumer, hex-shape regex, and `(...).slice(0, 7)` site; classifies each via closed verdict enum (`safe` / `flip-clean` / `needs-rename` / `needs-resolveShort` / `boundary-io` / `historical-prose` / `unclear`).
2. **Flip in jj.ts + parsers + types** — 7 template flips at `jj.ts:222-227, 946, 965, 978` + 3 parser flips (`parse/jj-log.ts:26,56`, `parse/jj-workspace-list.ts:28,46`, `parse/jj-bookmark.ts:19-21`) + 2 type-level renames (`LogEntry.hash`, `CommitResult.hash`) + 27-site mechanical consumer sweep driven by `tsc` errors.
3. **Lint guard + allowlist** (`scripts/lint-vcs-no-commit-id.cjs` + `.allow.json` + fixture test) — fork of `lint-vcs-no-raw-git.cjs` pattern; default-deny `commit_id` literals + `.commit_id` accesses + hex-shape regexes + 40-char hex string literals; per-entry allowlist schema with `reason`/`expires`/`owner` fields to prevent hollowing.

The **boundary-I/O accessor** (`__jjCommitIdOf` in `sdk/src/vcs/backends/jj.ts` or sibling) is conditional: build only if Plan 1 audit identifies a consumer that genuinely needs hex-form. ARCHITECTURE proves the suspected consumer (`scripts/changeset/github-release-notes.cjs`) is a **false alarm** — it uses `expr.bookmark` for refnames and emits `compare/<fromRef>...<toRef>` URLs with tag names, never commit-id-shaped URLs.

### Critical Pitfalls

1. **Hex-prefix matching silently always-misses on jj** (PITFALLS Pitfall 2) — `id.startsWith(hexPrefix)` returns `false` with no exception because change_id alphabet `[k-z]` is disjoint from `[0-9a-f]`. **The most dangerous failure mode** in v1.2: tests that check `not.toMatch` pass deceptively; production code treats "no match" as not-found and silently falls through. **Avoid:** lint guard's hex-shape regex pattern; contract test asserting `LogEntry.id` does NOT match `/^[0-9a-f]/` on jj; audit pass for `.slice(0, 7|8|12)` on id-bearing fields.

2. **Silent stable-identity semantic flip** (PITFALLS Pitfall 1) — `LogEntry.hash` was snapshot-stable (commit_id never moves); post-flip on jj it's rebase-stable (change_id moves with rewrites; can become divergent). Asymmetric: passes on git, manifests on jj only when something rewrites between store and re-use. **Avoid:** rename `LogEntry.hash` → `LogEntry.id` so the compiler forces every site to be re-considered; audit classifies each consumer as `{snapshot-needed | rebase-stable-needed | indifferent}`.

3. **Cross-backend test-equality over-relaxation** (PITFALLS Pitfall 3) — `expect(gitResult).toEqual(jjResult)` fails on id-shape; the v1.1 Plan 02 pattern was to relax to `expect(rev).toBeTruthy()` which catches "field exists" but misses "field is correct." **Avoid:** custom matcher `expectIdShape(kind, value)` written up-front; track every relaxation in a deviation table; close-gate requires every entry resolved or justified.

4. **Boundary-I/O accessor sprawl / escape-hatch contagion** (PITFALLS Pitfall 4) — once the accessor exists, other callers gravitate to it. TypeScript module visibility cannot enforce architectural-layer-scoped privacy. **Avoid:** single-callsite invariant enforced by lint (count importers; CI fails on >1); deep-path imports as code-review red flags; no dynamic-require escape; prefer alternatives that skip the problem (tag/release URLs over commit URLs).

5. **Lint allowlist becomes write-only over time** (PITFALLS Pitfall 7) — entries added "to unblock CI" without justification; nobody removes entries; rule hollows out within months. **Avoid:** per-entry schema with required `reason`, `expires`, `owner` fields; CI rejects entries without them; expired entries fail CI; PRs touching the allowlist trigger an extra review gate.

## Implications for Roadmap

The four researchers converge on a **single phase with three sequential plans + parallelizable lint development**. ARCHITECTURE explicitly recommends keeping it as one phase unless Plan 1 audit explodes scope (>1 day) — fallback: split into Phase 8.1 (audit) + Phase 8.2 (flip + lint).

### Phase 8 — Unified Revision Model — Audit → Flip → Lint Guard (single phase, three plans)

**Plan 1: Caller audit + classification doc**
- **Rationale:** Load-bearing precondition. Plan 07-02's pain proved callers DO depend on commit_id semantics in places. Without the audit, the flip surfaces silent bugs in stored-id consumers (Pitfall 1) and hex-prefix matchers (Pitfall 2). Audit BEFORE flip per all four researchers.
- **Delivers:** `.planning/intel/id-namespace-audit.md` with per-call-site row format `{File:line, Surface, Today, Caller's use, Verdict, Owner phase, Allowlist entry}`; closed verdict enum; jj 0.41 NDJSON `change_id` schema probe (Risk 4 in ARCHITECTURE); JSON sidecar consumed by Plan 3 lint allowlist.
- **Avoids:** Pitfalls 1, 2, 3 (audit identifies the affected sites before they become silent failures).
- **Side task during Plan 1:** Lint script *development* can begin in parallel — patterns and allowlist mechanics don't depend on flip completion. Only the *first green run* gates on Plan 2 close.

**Plan 2: Surface flip + rename + consumer sweep**
- **Rationale:** Apply the audit verdict. Rename is the forcing function — `tsc` errors at every consumer site are the audit pass made executable. Per ARCHITECTURE, ~27 consumer sites for `LogEntry.hash` alone; plus parser flips at three `parse/jj-*.ts` sites; plus 7 template flips in `jj.ts`.
- **Delivers:** All 11 cross-backend surfaces return change_id on jj; `LogEntry.hash` → `LogEntry.id` + `CommitResult.hash` → `CommitResult.id`; PITFALL 1 doc at `jj.ts:327` inverted to a positive contract; golden-parity baselines re-recorded; strict-green on both backend lanes; no skip-count regressions.
- **Uses:** Existing TS compiler as the audit forcing function; existing `tests/__tools__/capture-vcs-baselines.cjs` for golden re-record; `format-migration/rewrite.ts` machinery for any `.planning/` rewrites; existing parameterized `GSD_TEST_BACKENDS` matrix.
- **Avoids:** Pitfalls 1, 5 (close-gate-only `.planning/` rewriter pass), 8 (hard-rename, no alias; verify `dist-cjs/` rebuild).
- **Test architecture change:** Introduce `expectIdShape(kind, value)` matcher; ~10–20 cross-backend equality assertions need migration (e.g., `jj-workspace.test.ts:417` precedent).

**Plan 3: Lint guard activation + workflow refactor**
- **Rationale:** Architectural enforcement. Without the guard, the audit's verdict erodes over time (Pitfall 7). Mirrors the existing `lint-vcs-no-raw-git` whole-repo default-deny precedent that has prevented git-backend leakage. Workflow `vcs.kind`-branching deletions are the *evidence* the abstraction works; PROMPT-04 in v1.1 already deleted 242 LOC of raw-git fallbacks — v1.2 continues that pattern.
- **Delivers:** `scripts/lint-vcs-no-commit-id.cjs` + `.allow.json` (audit-derived; expected ≤2 entries) + fixture test; per-entry schema with `reason`/`expires`/`owner` fields; CI step parallel to existing lint; first run MUST be green (proves Plan 2 flip is complete); workflow `.md` deletions for `vcs.kind`-branching for id reasons; `.planning/` format pass extending Phase 6 B-07.
- **Avoids:** Pitfalls 4, 6, 7 (lint catches regressions; allowlist schema prevents hollowing; prose-aware sweep at close-gate catches markdown drift).

### Phase Ordering Rationale

- **Audit before flip:** load-bearing precondition per all four researchers; mid-flip the test surface is inconsistent and the audit cannot accurately classify "today's shape."
- **Flip before lint:** activating the guard before the flip means everything fails the guard; first green run of the lint is the validation that the flip is complete.
- **Lint before workflow refactor close-gate:** workflow deletions assume the new shape; lint catches any regressions that sneak in during the refactor.
- **`.planning/` format pass at close-gate, not mid-phase:** dogfooding on the v1.2 phase's own `.planning/` directory creates mid-phase mixed-shape risk (Pitfall 5). Phase boundary marker recommended: commit in commit_id shape during the phase; rewriter pass once at close-gate.

### Research Flags

**No phases need fresh research.** All four researchers are HIGH-confidence and the work is grounded in current `file:line` references. The existing `lint-vcs-no-raw-git.cjs` is the structural template; the existing `format-migration/rewrite.ts` is the proven zone-walker; the existing parameterized matrix is the regression net. Net-new code is bounded and has clear precedents.

**Single execute-time verification (Risk 4 in ARCHITECTURE):** confirm that jj 0.41's `json(self)` template emits `change_id` alongside `commit_id` in NDJSON output. One-liner against the colocated repo before Plan 2 lands. Mitigation if absent: explicit two-pass parse or `'json(self.change_id() ++ ...)'` template — bounded.

**Standard patterns (skip research):**
- Plan 1 (audit script): mirrors `scripts/lint-vcs-no-raw-git.cjs` line-for-line
- Plan 3 (lint guard): same; allowlist JSON shape mirrored
- Plan 2 (rename + consumer sweep): mechanical TS-checkable refactor; tsc is the audit

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies already locked through v1.0+v1.1; net-new dependency count is zero; npm version verification was performed for rejected alternatives (ts-morph 28.0.0, ast-grep 0.42.2, jscodeshift 17.3.0); jj 0.41 templates verified locally |
| Features | HIGH (industry patterns + per-surface migration table); MEDIUM on optimal anti-feature disposition | All 11 surface flips backed by file:line; industry survey covers volgo-vcs, Sapling, hg-git, jj-fzf, lazyjj, jjui; one mismatch surfaced and resolved (see Gaps below) |
| Architecture | HIGH | Every claim cites a current `file:line`, read live during research; one pre-emptive correction (SEED-001's `expr.commit` deprecation bullet is stale — Phase 2.1 already shipped it); one surfaced mismatch (FEATURES.md vs `jj.ts:222-227` — see Gaps) |
| Pitfalls | HIGH | Codebase-grounded; ten distinct pitfalls each tied to either a concrete file path, a concrete prior incident in this repo's history, or documented prior-art incident in another VCS-tooling project (jj community + Mercurial Evolve + Sapling + Gerrit prior art consulted) |

**Overall confidence:** HIGH

### Gaps to Address

- **Gap 1 — `vcs.commit() → CommitResult.hash` jj-side shape:** `FEATURES.md` §"Surfaces that stay change_id" claims `vcs.commit()` already returns change_id via `{ changeId }`. `ARCHITECTURE.md` proves this is **incorrect** — the post-squash hash probe at `sdk/src/vcs/backends/jj.ts:222-227` writes a `commit_id` template result into `CommitResult.hash`. **ARCHITECTURE is correct (verified at file:line).** The `WorkspaceMergeResult.changeId` is a separate field that is correctly change_id. Plan 2 must include `CommitResult.hash` → `CommitResult.id` rename AND flip its template at `jj.ts:222-227` from `commit_id` to `change_id`. Surface in Plan 1 audit.
- **Gap 2 — SEED-001's `expr.commit` deprecation bullet is stale:** Phase 2.1 already renamed the factory to `expr.rev` (verified at `sdk/src/vcs/expr.ts:43-94` + `__tests__/expr.test.ts:96-116`). PROJECT.md Active scope's bullet about deprecating `expr.commit(sha)` should be **dropped from v1.2 scope**. Plan 1 audit verifies no reintroduction (cheap grep) but no flip is needed.
- **Gap 3 — Boundary-I/O accessor: build or not?** All four researchers agree the accessor should NOT be built speculatively. ARCHITECTURE's data-flow trace through `github-release-notes.cjs` confirms it is a false alarm (uses `expr.bookmark` for refnames; emits `compare/...` URLs with tag names). Plan 1 audit is the test of whether the no-escape-hatch inversion is sustainable. Build only if a consumer surfaces; ARCHITECTURE provides the "if-built" recipe at `sdk/src/vcs/backends/jj-internal.ts`.
- **Gap 4 — Mid-phase dogfood `.planning/` cutover model:** PITFALLS Pitfall 5 raises this as Medium severity. Decide phase-open: phase boundary marker (commit in commit_id shape until close, rewriter pass once at close-gate) **vs.** frontmatter pin (`id_shape_at_write: commit_id|change_id` per file). Recommended: phase boundary marker (simpler; one rewriter invocation; idempotency-test verifiable).

## Sources

### Primary (HIGH confidence — read live during research)

- `sdk/src/vcs/backends/jj.ts:222-227, 327-339, 887-918, 940-987, 1078-1094, 1144-1230` — every commit_id-emitting template, every change_id-emitting template, PITFALL 1 doc
- `sdk/src/vcs/types.ts:91, 109-116, 167-176, 217-231, 244-249, 311-339` — current type shapes
- `sdk/src/vcs/parse/jj-log.ts:26,56`, `parse/jj-workspace-list.ts:28,46`, `parse/jj-bookmark.ts:19-21`, `parse/jj-id.ts:33-67` — NDJSON parsers + internal `commitIdOf`/`changeIdOf` translators
- `sdk/src/vcs/expr.ts:37-94`, `__tests__/expr.test.ts:96-116` — confirms factory is `expr.rev`; SEED-001 deprecation bullet is stale
- `sdk/src/vcs/format-migration/rewrite.ts:53, 63, 73-86, 240-352` — alphabet-disjointness probe + COMMIT_KEY_ALLOWLIST + `findEligibleZones`
- `scripts/lint-vcs-no-raw-git.cjs:31-203`, `lint-vcs-no-raw-git.allow.json` — structural template + allowlist shape for the new lint
- `scripts/changeset/github-release-notes.cjs:46-155` — debunks the boundary-I/O suspect (uses bookmarks/tags, not commit URLs)
- `get-shit-done/bin/lib/verify.cjs:60-126, 1270-1310`, `commands.cjs:398-507` — current `.hash` consumers + post-commit announcement format
- `.planning/PROJECT.md`, `.planning/seeds/SEED-001-change-id-only-on-jj-adapter-surface.md`, `.planning/MILESTONES.md` v1.1 — milestone scope, predecessor design, Plan 07-02 Deviations §2 cross-namespace pain

### Primary (HIGH confidence — external authoritative sources)

- jj-vcs.dev — [glossary](https://docs.jj-vcs.dev/latest/glossary/) (change_id rebase-stable / commit_id snapshot-stable), [architecture](https://docs.jj-vcs.dev/latest/technical/architecture/) (alphabet design), [templates](https://docs.jj-vcs.dev/latest/templates/) (`change_id.shortest()` semantics), [revsets](https://jj-vcs.github.io/jj/latest/revsets/) (alphabet `^[k-z]*$`), [FAQ](https://jj-vcs.github.io/jj/latest/FAQ/) (rewrite semantics), [github docs](https://docs.jj-vcs.dev/latest/github/), [community tools](https://docs.jj-vcs.dev/latest/community_tools/)
- jj issue [#2476](https://github.com/jj-vcs/jj/issues/2476) — `jj log -r <change id prefix>` divergent-change ambiguity (concrete prior incident for prefix-uniqueness assumption breakage)
- npm version verification 2026-05-14 (rejected for v1.2 scope): `ts-morph@28.0.0`, `@ast-grep/cli@0.42.2`, `jscodeshift@17.3.0`
- Local `command -v` verification: `jj 0.41.0`

### Secondary (MEDIUM confidence — community / industry survey)

- [volgo-vcs Mercurial Compatibility](https://mbarbin.github.io/vcs/docs/explanation/mercurial-compatibility/) — Pattern 1 (shape-overlap; declines full abstraction)
- [Sapling SCM](https://sapling-scm.com/docs/introduction/), [Internal differences from Mercurial](https://sapling-scm.com/docs/dev/internals/internal-difference-hg/), [Visibility and mutation](https://sapling-scm.com/docs/dev/internals/visibility-and-mutation/)
- [hg-git README](https://github.com/schacon/hg-git), [Mercurial wiki HgGit](https://www.mercurial-scm.org/wiki/HgGit), [Mercurial ChangesetEvolution](https://www.mercurial-scm.org/wiki/ChangesetEvolution) — Pattern 2 prior art
- [jj-fzf source](https://github.com/tim-janik/jj-fzf/blob/trunk/jj-fzf), [lazyjj](https://github.com/Cretezy/lazyjj), [jjui](https://github.com/idursun/jjui) — Pattern 3 precedent
- [Why are Jujutsu's ID Prefixes So Short? — Jonathan Frere](https://jonathan-frere.com/posts/jujutsu-shortest-ids/) — independent shortest-unique-prefix per namespace
- [Gerrit ↔ Jujutsu integration design doc](https://www.gerritcodereview.com/design-docs/support-jujutsu-use-cases.html) — concrete prior-art incident for the same class as Pitfall 1

### Tertiary (lint discipline + memory anchors)

- [ESLint custom rules — meta.schema](https://eslint.org/docs/latest/extend/custom-rules) — required-options pattern preventing allowlist write-only rot
- Project memory: `project_no_raw_git`, `project_unified_revision_model`, `project_planning_id_migration`, `project_test_perf_pain_vitest`, `feedback_baseline_is_correctness_not_perf`, `feedback_sdk_commit_jj_safe`

---
*Research completed: 2026-05-14. Ready for roadmap: yes.*
