# Phase 3: jj Backend Core — Squash, Refs, Conflict - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Land `sdk/src/vcs/backends/jj.ts` implementing the full adapter contract against jj — squash-based commit model (`jj squash <files> -B @ -k -m '<msg>'`), NDJSON output parsing (`-T 'json(self) ++ "\n"' --no-graph`), bookmark refs with `gsd/` namespace prefix, in-tree conflict detection (`jj log -r 'conflict()'`), and CI matrix activation for jj-colocated as allow-failure. Working-copy auto-snapshot is allowed by default and `--ignore-working-copy` is **never** passed by adapter code.

**In Phase 3:**
- `sdk/src/vcs/backends/jj.ts` (net-new, target ~600-1000 LOC mirroring `git.ts` 663 LOC)
- NDJSON parsers in `sdk/src/vcs/parse/jj-*.ts` (jj-rev.ts stub already exists from Phase 1; add jj-log.ts, jj-op-log.ts, jj-workspace-list.ts, jj-id.ts for change_id ↔ commit_id translation)
- Sticky-backend default (`vcs.adapter` config field; defaults `git` when `.git` and `.jj` both present)
- CI install of jj via release-tarball; jj-colocated added to test matrix as allow-failure
- Per-test triage of worktree-bug tests as they surface under the jj matrix
- Format-migration tracker logging every `.planning/` file format that records revision IDs

**Not in Phase 3 (owned elsewhere):**
- Workspace orchestrator semantics + octopus structure + auto-abandon empty heads (Phase 4)
- Hook firing wiring (Phase 4 — `fireHook` stays a private helper)
- jj-native (non-colocated) matrix lane (Phase 4)
- Command translations + workflow markdown rewrites + brownfield validation (Phase 5)
- CI graduation from allow-failure to required-blocking (Phase 5)
- `/gsd-migrate-to-jj` command + `.planning/` SHA → change_id rewriter (new dedicated phase, likely 4.5 or 6 — TBD via `/gsd-phase`)

</domain>

<decisions>
## Implementation Decisions

### Bookmark Surface

- **D-01 (Explicit bookmark on `vcs.commit()`):** `CommitInput` gains an optional `bookmark?: string` field. When set, the jj backend advances exactly that bookmark to the new commit via `jj bookmark set <name> -r <C> --allow-backwards` after the squash completes. Caller (Phase 4 orchestrator) owns the bookmark name and passes it explicitly — no auto-detection from the revset. Survives multi-bookmark-at-@- collisions guaranteed by Phase 4's nested `gsd/phase-N` + `gsd/phase-N/subagent-M` hierarchy. The hybrid fallback variant (A4) is deliberately deferred; A1 is the minimum-surface lock — A4 can layer on later without breaking callers.
- **D-02 (Bookmark divergence is a typed error):** jj's `name??` divergent-bookmark state must surface as a typed adapter error rather than being swallowed by `bookmark set`. Without it, concurrent op-log updates in multi-workspace flows become invisible corruption. Error type lives in `sdk/src/vcs/types.ts` (e.g., `VcsBookmarkDivergentError`) and is thrown from any read or write touching bookmarks.
- **D-03 (`gsd/` prefix is adapter-internal):** REFS-04's wording is enforced by the adapter — callers pass unprefixed names (`phase-3`), adapter adds `gsd/` on jj input and strips it on every jj read path (`currentBookmarks()`, `bookmarks.list()`, `LogEntry.parents[]`/`hash` resolution when emitting bookmark names, etc.). The git backend remains pass-through. Strip must be exhaustive — every read site that returns a bookmark name to a caller strips, pinned by a round-trip test (`bookmarks.create('phase-3') → currentBookmarks() returns ['phase-3']`).
- **D-04 (Raw-name escape via `{raw:true}`):** For non-gsd bookmarks (upstream-tracking `main`, `trunk`, etc.), the adapter accepts a `{raw:true}` flag on `bookmarks.create/move/set/delete` and on the new `CommitInput.bookmarkRaw?: string` companion field. When `raw` is set, the adapter does not add/strip the prefix. Explicit opt-in beats heuristic prefix-detection (B3 was rejected for false-positive risk on legitimately-named `gsd-something` bookmarks).

### Working-Copy Snapshot Policy

- **D-05 (Strict-never on `--ignore-working-copy`):** The jj backend **never** passes `--ignore-working-copy`, including on read-only methods (`log`, `status`, `diff`, `refs.exists`, `refs.resolveShort`, `refs.countCommits`, `findConflicts`). User-confirmed during this discuss: "never use `--ignore-working-copy` as it can desync the workspace annoyingly." Reason: snapshot is part of the natural commit flow under the squash model, and skipping it leaves the WC stale/brittle and desyncs the workspace in annoying-to-recover ways.
- **D-06 (Caller-side pre-probe discipline):** Callers needing safe multi-step state inspection follow the `cmdCommit` pre-probe pattern locked by Phase 2.1 D-06 — `vcs.status()` pre-probe before commit; explicit state capture in the caller. No new adapter API (`vcs.test.readWithoutSnapshot()`, symbol-gated escape) is introduced. If a real multi-step caller emerges in Phase 4 or 5 that the discipline can't serve, revisit then — Phase 3 does not pre-design for it.
- **D-07 (Document the footgun in PITFALLS.md context):** PITFALLS.md #2 (intermediate-snapshot footgun) stays canonical reading for downstream agents. Phase 3's `jj.ts` JSDoc on each read method notes "this command snapshots `@` at start — caller assumes no stray edits between this call and the next write."

### Plan Structure & Sequencing

- **D-08 (Hybrid: shape commit + verb-group fills):** Phase 3 follows Phase 2.1's shape-commit-first idiom (under Phase 2.1 D-21's verb-shape-change exception, which Phase 3 also qualifies for). Plan 1 lands the jj.ts skeleton with every adapter verb present but throwing `NotImplementedError`, plus the parser stubs, plus the CI install step, plus the test-matrix activation for baseline-parity. Subsequent plans fill verb groups with paired tests. CI-01's allow-failure on jj-colocated absorbs the stub-throw window — no long-lived branch needed (unlike Phase 2/2.1 where lint guard was hard-failing).
- **D-09 (No long-lived feature branch):** Phase 3 lands on `main` (or a per-plan PR branch under the user's standard flow). The lint allowlist stays clean throughout (no new raw-git callers added in Phase 3). The "broken-tests on trunk" tension dissolves because the jj-colocated lane is allow-failure for the duration.
- **D-10 (~5-7 plans, suggested ordering):** Planner picks plan boundaries within Phase 3 per Phase 2 D-05 (per-file commit granularity) and D-06 (source+test in same commit). Suggested verb-group sequencing for plans 2..N (planner may adjust): (a) exec wrapper + NDJSON parsers + jj-id translator; (b) refs (head/parent/bookmarks CRUD + currentBookmarks + resolveShort/exists/countCommits) + currentBookmarks `gsd/` strip round-trip test; (c) commit (squash) + bookmark advance per D-01; (d) status/log/diff; (e) findConflicts; (f) push/fetch + workspace stubs (contract-passing, not orchestrator-aware); (g) end-of-phase plan: flip baseline-parity activation, audit skip-count delta, finalize `docs/test-triage/jj-bugs.md`.

### Test Matrix Activation

- **D-11 (Two-track activation):** `baseline-parity.test.ts` runs `jj-colocated` from plan 1 (low noise — one test file producing per-backend snapshot rows); adapter-contract tests gate behind a per-verb allowlist in `backends.ts` that flips as verb groups land. Final plan flips the allowlist to "all verbs implemented," which becomes the natural setup for Phase 5's graduation step (delete the allowlist + remove `continue-on-error` from CI).
- **D-12 (Per-verb allowlist mechanism):** Fixture-level allowlist (`BACKENDS_AVAILABLE_FOR_VERB` map in `sdk/src/vcs/backends.ts` or test helpers) used by `vcsTest(kind)` to throw-not-skip when a verb isn't yet implemented on jj. Skip-not-throw is rejected because TEST-06's skip-count guard would silently mask drift. Each verb-group plan adds its entries to the allowlist as part of the same commit that lands the impl.
- **D-13 (jj-native deferred to Phase 4):** Phase 3 only adds `jj-colocated` to the active matrix. The `jj-native` matrix slot from TEST-03 stays declared-but-empty; Phase 4 (which owns workspace semantics) populates it.
- **D-14 (CI pins jj 0.41):** CI install step pins jj to **0.41** (current latest stable + matches local dev). Single matrix axis — no multi-version. Renovate-bumpable as new stable releases land. Matches JJ-06's "track latest, no floor" — explicit pin gives reproducibility without committing to back-version support.
- **D-15 (CI install via release tarball):** Per CI-02. Composite action or inline `curl | tar` step — planner picks. No `cargo install` (too slow, requires Rust toolchain).
- **D-16 (TEST-08 per-test triage):** Worktree-bug tests (`bug-2924/2774/3097/3099/2075/2431/2015/2388`) are triaged per-test as they surface under the jj-colocated matrix. Each verdict (jj-mapped / git-only with rationale / carries-verbatim) is recorded inline in **`docs/test-triage/jj-bugs.md`** as the test runs against jj. The end-of-phase plan (D-10g) finalizes the doc and asserts every bug-test has a verdict. No upfront speculative triage doc.

### Backend Selection Stickiness

- **D-17 (Sticky `vcs.adapter` config + default git when both present):** `sdk/src/vcs/index.ts` `createVcsAdapter` auto-detect is augmented with an explicit `vcs.adapter: 'git' | 'jj' | 'auto'` config field (location TBD by planner — likely `.planning/config.json` `vcs.adapter` or a top-level `gsd.vcs.adapter`). When unset, defaults to `auto`. When `auto` and both `.git` and `.jj` are present, the adapter resolves to **git** (changes the Phase 1 D-04 "`.jj` first, `.git` fallback" order for the colocated case). When only `.git` is present, git; only `.jj` present, jj. Explicit values (`git` or `jj`) override detection entirely. `GSD_VCS` env var (Phase 1 VCS-03) still overrides everything for ephemeral test runs.
- **D-18 (Migration command lives in a future phase):** The sticky preference is the gate; the actual `/gsd-migrate-to-jj` command + `.planning/` SHA → change_id rewriter is **out of scope for Phase 3** and lands in a new dedicated phase. Suggested slot: **Phase 4.5** (decimal-inserted between Phase 4 and Phase 5, post-workspaces) or **Phase 6** (post-brownfield validation in Phase 5). Roadmap insertion happens via `/gsd-phase` before that phase is planned. Phase 3 only ships the gate — D-17 alone is enough for users (and the dogfood transition on this very repo) to safely install the jj backend without auto-flipping.

### Format Migration Tracker

- **D-19 (Tracker is mandatory and lives inline in this CONTEXT.md):** Every code change during Phase 3 that introduces or modifies a `.planning/` file format encoding a revision identifier — or every existing format discovered as encoding one — is logged in `<format_migration_tracker>` (below). Each entry records: file path / format, field, current encoding (git SHA hex), target encoding (jj change_id alphabet), and migration approach (translator at read-time / one-shot rewrite / dual-write window). The future migration phase consumes this tracker as its work backlog.
- **D-20 (Surfaces already known to record SHAs):** From Phase 1/2 discovery: `.planning/STATE.md` performance/velocity table entries (commit references in prose), per-phase `SUMMARY.md` / `LEARNINGS.md` / `REVIEW*.md` / `VERIFICATION.md` prose mentions, gsd-sdk phase manifests (whatever they encode internally), `gsd-sdk query commit` output paths. Planner audits these during Phase 3 work and adds entries; existing artifacts that won't change in Phase 3 still get tracker entries because the future migration must rewrite them.

### Claude's Discretion

- **Plan boundaries within Phase 3:** Planner picks exact plan splits within the D-10 suggested ordering. Per-file commit granularity per Phase 2 D-05 / D-06 carries forward.
- **Parser layout in `sdk/src/vcs/parse/`:** Planner picks file shape — likely `jj-log.ts`, `jj-op-log.ts`, `jj-workspace-list.ts`, `jj-id.ts` (change_id ↔ commit_id translator per Phase 2.1 D-11 + D-14 deferred placement). NDJSON schema validation rigor (hand-rolled vs zod/io-ts): planner picks; lean toward hand-rolled with explicit field checks for parity with `git.ts` style.
- **`NotImplementedError` shape:** Planner picks the error class. Likely a `VcsNotImplementedError` extending `VcsExecError` semantics so call-site error handling stays uniform.
- **Sticky preference storage:** Planner picks the config location for D-17 — `.planning/config.json` is the obvious home but a top-level `gsd.vcs.adapter` (e.g., `package.json` field or `.gsd.json`) is also defensible. Whichever — must be readable from both SDK and bin/lib.
- **Bookmark divergence error recovery hints:** Whether `VcsBookmarkDivergentError` carries actionable recovery hints (e.g., "run `jj bookmark forget <name>` then re-set") is planner's call.
- **TEST-08 verdict rubric:** Planner picks the exact rubric for "jj-mapped / git-only / carries-verbatim" in `docs/test-triage/jj-bugs.md`. Suggested columns: bug-id, test path, jj behavior observed, verdict, rationale, follow-up phase.

</decisions>

<format_migration_tracker>
## .planning/ format migration tracker (revision IDs)

**Purpose:** Every `.planning/` file format that records a revision ID (git SHA hex on git, jj change_id on jj) is logged here as it's discovered or introduced during Phase 3. The future `/gsd-migrate-to-jj` phase (D-18) consumes this tracker as its work backlog — every entry below needs a documented rewrite path before dogfood transition flips the sticky `vcs.adapter` to `jj`.

**Entry schema:** `path/to/file.md` / `format-name` — field — current encoding → target encoding — migration approach

### Existing surfaces (discovered during Phase 3 scout — pre-implementation)

- `.planning/STATE.md` — performance/velocity table + accumulated context prose — git SHA hex (e.g., `ae56863a`, `1900dfc9`) referenced in `last_activity`, recent-commit notes, plan-completion entries → jj change_id prefixes — **one-shot rewrite** by migration command (read git SHA, resolve to change_id via `vcs.jjOnly.commitIdOf` inverse, replace inline).
- `.planning/phases/*/SUMMARY.md`, `LEARNINGS.md`, `REVIEW.md`, `REVIEW-FIX.md`, `VERIFICATION.md`, `PATTERNS.md` — prose mentions of commit SHAs (Phase 1/2 docs reference merge commits, fix commits, baseline commits) → change_id prefixes — **one-shot rewrite**; prose regex-pluck SHAs, resolve, replace.
- gsd-sdk phase manifests (whatever the SDK writes internally under `.planning/` to track phase state) — planner audits exact format and adds entries — current shape TBD → target TBD — likely **dual-write window** during transition, then read-time translator.
- gsd-sdk `query commit` JSON output / commit-recording paths — fields TBD by planner — git SHA → change_id — **one-shot rewrite** of any persisted output.
- `.planning/ROADMAP.md` — does NOT currently encode SHAs (verified during scout). No entry needed unless a new format encoding is added.
- `.planning/PROJECT.md` / `.planning/REQUIREMENTS.md` — do NOT currently encode SHAs (verified). No entry.
- `.planning/intel/*.md` — prose mentions only where SHAs are referenced as historical context (e.g., `intel/git-touchpoints.md` may cite git's pnpm-migration commit `ae56863a`); regex-pluck during migration.
- `.planning/research/*.md` — prose mentions only (Phase 0 research artifacts); regex-pluck during migration.

### Net-new surfaces introduced in Phase 3 (logged as plans land)

*(Empty at phase start. Each Phase 3 plan that introduces a new artifact encoding a revision ID appends an entry here as part of the plan's commit. Plan-checker / verifier asserts this section is non-empty for any plan that touches `.planning/` write paths.)*

</format_migration_tracker>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project / Phase Scope
- `.planning/PROJECT.md` — Project framing, core value, key decisions; memory rules apply (no parallelization, no raw git, squash model, verify jj conventions)
- `.planning/REQUIREMENTS.md` — JJ-01..07, SQUASH-01..07, REFS-01..06, CONFLICT-01..03, TEST-08, CI-01..02 (Phase 3 owns these); WS-* (Phase 4 owns); CMD-*, PROMPT-*, BROWN-* (Phase 5 owns)
- `.planning/ROADMAP.md` §"Phase 3: jj Backend Core — Squash, Refs, Conflict" — Phase boundary with goal, depends-on, requirements list, success criteria (this CONTEXT.md does NOT supersede ROADMAP — it captures HOW to implement what ROADMAP scopes)
- `.planning/STATE.md` — Phase 2.1 complete (UAT 8/8) + merged; Phase 3 is next

### Pre-Phase Intel
- `.planning/intel/vcs-adapter-surface-audit.md` — Per-verb verdict table (Phase 2.1 input; Phase 3 implements the jj side of the verdicts)
- `.planning/intel/git-touchpoints.md` — Hotspot LOC / git-sub counts; informs CI install + test-fixture scope (less relevant in Phase 3 than Phase 2)

### Prior Phase Context (load decisions, do NOT re-decide)
- `.planning/phases/01-adapter-foundation-git-backend/01-CONTEXT.md` — Phase 1 D-04 (auto-detect `.jj` first, `.git` fallback — **changed by Phase 3 D-17 for the colocated case**), D-07 (gitOnly narrowing), D-09..D-12 (RevisionExpr design), D-13..D-16 (test fixture, baselines), D-17..D-19 (lint guard tightening)
- `.planning/phases/02-bulk-call-site-migration-still-git-only/02-CONTEXT.md` — Phase 2 D-05 (per-file commit granularity — carries to Phase 3 plans), D-06 (source+test in same commit), D-08 (mechanical-only invariant — Phase 3 qualifies for the verb-shape-change exception per Phase 2.1 D-21)
- `.planning/phases/02-bulk-call-site-migration-still-git-only/02-LEARNINGS.md` — Phase 2 surprises (especially #1 — forward-complete adapter gaps now closed in Phase 2.1; Phase 3 implements against the cleaned surface)
- `.planning/phases/02.1-vcs-abstraction-audit-drop-git-only-concepts/02.1-CONTEXT.md` — **PRIMARY UPSTREAM DEPENDENCY.** D-01 (strict surface), D-02 (CommitInput.files semantics), D-03 (stage/unstage hard-removed), D-04 (WC-state capture for deletes), D-05 (amend cross-backend), D-06 (#2014 caller-side pre-probe — pattern referenced by Phase 3 D-06), D-07 (hooks internalized — Phase 4 owns), D-08 (noVerify on call surface), D-11..D-14 (change-first identifier semantics on jj — **Phase 3 implements the translator**), D-15 (`currentBookmarks(): string[]`), D-16 (`StatusEntry` drops `index`), D-17 (`isIgnored` dual-semantic), D-18 (gitDir/gitCommonDir gitOnly), D-21 (mechanical-only + long-lived branch — Phase 3 D-09 diverges: no long-lived branch needed)
- `.planning/phases/02.1-vcs-abstraction-audit-drop-git-only-concepts/02.1-LEARNINGS.md` (if present at planning time) — Phase 2.1 surprises that affect Phase 3 implementation choices

### Architecture, Stack, Pitfalls
- `.planning/research/ARCHITECTURE.md` — Adapter shape, layering rules; Phase 3's jj.ts mirrors git.ts structure
- `.planning/research/STACK.md` — Verified jj flag conventions (`--repository`, `--no-pager`, `--color never`, `--quiet`), NDJSON template (`-T 'json(self) ++ "\n"' --no-graph`), exit-code contract, **STACK's `--ignore-working-copy` recommendation is overridden by Phase 3 D-05** (memory + user rule wins)
- `.planning/research/PITFALLS.md` — Anti-patterns: Pitfall #1 (interleaving git + jj mutations — Phase 3 enforces via lint guard from Phase 1), Pitfall #2 (auto-snapshot footgun — Phase 3 documents per D-07, caller-side discipline per D-06), Pitfall #3 (jj workspace ≠ git worktree — Phase 4 owns the semantic mapping, Phase 3 ships contract-passing stubs only), Pitfall #4 (stale-WC sibling workspaces — N/A in Phase 3 since no multi-workspace flow yet)
- `.planning/research/FEATURES.md` — Per-command translation table (`git rev-parse HEAD` → `jj log -r @ -T 'commit_id'`, etc.) — informs jj.ts verb impls; Phase 5 owns command-level translations but Phase 3 wires the primitives

### Phase 1/2.1 Code Surfaces (Phase 3 IMPLEMENTS against these)
- `sdk/src/vcs/types.ts` — Adapter contract surface (reshaped by Phase 2.1); Phase 3 adds `CommitInput.bookmark?: string` (D-01) and `bookmarkRaw?: string` (D-04), plus `VcsBookmarkDivergentError` type (D-02)
- `sdk/src/vcs/expr.ts` — Revset factory surface; Phase 3 doesn't reshape, just consumes
- `sdk/src/vcs/index.ts` — `createVcsAdapter` factory; **Phase 3 D-17 changes the auto-detect order for colocated `.git + .jj`** + adds sticky `vcs.adapter` config read
- `sdk/src/vcs/backends/git.ts` — Reference impl for the contract (663 LOC); jj.ts mirrors its shape; D-01 + D-04 changes to CommitInput affect git.ts (must accept the new fields, no-op on git)
- `sdk/src/vcs/exec.ts` — Exec wrapper; unchanged in Phase 3 (jj.ts consumes it directly)
- `sdk/src/vcs/hook-bridge.ts` — Private helper; Phase 3 does NOT wire it into jj.ts (Phase 4 owns that)
- `sdk/src/vcs/parse/git-rev.ts` — Per-backend revision translator; unchanged
- `sdk/src/vcs/parse/jj-rev.ts` — Stub from Phase 1 + Phase 2.1 D-13 rename (`expr.rev` semantics); Phase 3 doesn't reshape — production callers consume verbatim
- `sdk/src/vcs/jj/` — Sidecar directory established by Phase 2.1 plan 02 (currently `.gitkeep` only); Phase 3 lands `jj-id.ts` translator here (or in `parse/`, planner picks)

### Test Surfaces
- `tests/helpers.cjs` — `vcsTest(kind)` fixture (Phase 1 D-14); Phase 3 extends with `jj-colocated` row activation per D-11/D-12
- `sdk/src/vcs/__tests__/baseline-parity.test.ts` — Runs per-backend snapshot diff; Phase 3 enables `jj-colocated` axis from plan 1 (D-11)
- `sdk/src/vcs/__tests__/adapter-contract.test.ts` — Functional contract suite; Phase 3 gates jj-colocated rows behind per-verb allowlist (D-12)
- `sdk/src/vcs/__tests__/git-backend.test.ts` — Git-specific tests; unchanged in Phase 3
- `tests/baselines/git-vcs/` — Git baselines; unchanged
- `tests/baselines/jj-vcs/` — TBD path for jj baselines; planner picks layout
- `docs/test-triage/jj-bugs.md` — NEW per D-16; per-test verdict log; finalized by end-of-phase plan
- Worktree-edge-case bug tests (`bug-2924/2774/3097/3099/2075/2431/2015/2388` paths under `tests/`) — re-triaged per D-16

### Lint Surface
- `scripts/lint-vcs-no-raw-git.cjs` — Whole-repo lint guard (per memory rule); unchanged in Phase 3
- `scripts/lint-vcs-no-raw-git.allow.json` — Allowlist; Phase 3 does NOT add new entries (mirrors Phase 2.1 D-22 invariant)

### CI / Build
- `.github/workflows/*.yml` — Phase 3 adds jj install step (CI-02 release tarball) + jj-colocated matrix axis with `continue-on-error: true` per CI-01 / D-11; planner picks the exact workflow file(s)
- `sdk/tsconfig.cjs.json` — CJS build target; unchanged
- `sdk/package.json` — Build scripts + dist-cjs files array; unchanged in Phase 3 unless new parser files require re-listing

### ADRs
- `docs/adr/0004-worktree-workstream-seam-module.md` — Worktree seam (Phase 4 will revisit for jj workspaces; Phase 3 keeps the seam shape intact)
- `docs/adr/0006-planning-path-projection-module.md` — Planning path resolution; affected indirectly by D-17 sticky preference (planner audits whether `.planning/config.json` is the right config home)
- `docs/adr/0007-sdk-package-seam-module.md` — SDK-to-`get-shit-done-cc` seam; jj.ts compiled output ships through this seam

### Project Conventions
- `CLAUDE.md` — `.envrc` GITHUB_TOKEN rule
- `CONTEXT.md` (repo root) — Lint-rule recipes referenced by lint scanner

### Memory Rules (apply to all Phase 3 work)
- "No raw git anywhere in jj-port" — lint guard is whole-repo default-deny; jj.ts MUST shell only `jj`, never `git`
- "Squash model for GSD on jj" — `jj squash` (not `jj commit`); WC snapshots allowed (never `--ignore-working-copy` per D-05); hooks fire after squash (Phase 4 wires)
- "Verify jj conventions with user" — Phase 3 conventions locked in this CONTEXT.md were user-confirmed during discuss-phase; do NOT relock unilaterally if a new convention surfaces during planning/execution — escalate
- "No parallelization yet" — Phase 3 plans execute sequentially; no worktrees, no parallel waves
- "Phase filenames follow SDK padded convention" — `03-*` directory + files
- ".planning/ commit-id → change-id migration" — every revision-id-encoding format change during Phase 3 logged in `<format_migration_tracker>` per D-19

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`createVcsAdapter` factory (`sdk/src/vcs/index.ts`):** Auto-detect signature stays; Phase 3 D-17 changes the order (defaults git when both present) + reads sticky `vcs.adapter` config. Mechanical edit.
- **`createGitAdapter` (`sdk/src/vcs/backends/git.ts`, 663 LOC):** Reference implementation; jj.ts mirrors its file shape, function organization, and `{ exitCode, stdout, stderr, timedOut, error }` exec return shape.
- **`vcsExec` wrapper (`sdk/src/vcs/exec.ts`):** Single spawn site; jj.ts consumes verbatim (no shell-string concatenation per JJ-02 — argv array only).
- **`vcs.gitOnly` namespace pattern (Phase 1 D-07 + Phase 2.1 D-18):** Established narrowing-on-`vcs.kind` access pattern; Phase 3 may add `vcs.jjOnly.commitIdOf(change)` if the change_id → commit_id reverse-translator surfaces a real need (Phase 2.1 D-14 deferred this to Phase 3; flag for planner audit).
- **`expr` namespace (`sdk/src/vcs/expr.ts`):** Phase 3 consumes; no reshape needed.
- **`vcsTest(kind)` fixture (Phase 1 D-14, `tests/helpers.cjs`):** Already supports `describe.for([...BACKENDS])`; Phase 3 just flips `BACKENDS_AVAILABLE` to include `jj-colocated`.
- **`parse/jj-rev.ts` stub (Phase 1):** Already encodes the locked revset mappings (`@`, `@-`, `name@remote`, `from..to` range, bookmark verbatim, `rev:` prefix per Phase 2.1 D-13). Phase 3 production-uses it.
- **`tests/__tools__/capture-vcs-baselines.cjs`:** Phase 1 baseline-capture tool; Phase 3 uses it to seed `tests/baselines/jj-vcs/` (if planner adopts that layout) alongside the existing git baselines.
- **Symbol-gated test namespaces (`vcs.test.snapshot/restore`):** Phase 1 D-14; Phase 3 doesn't need them but they're available if a verb-group plan needs snapshot/restore for hermetic tests.
- **`stagedOrUnstaged` short-circuit pattern (Phase 2 plan 02-09, locked by Phase 2.1 D-06):** Caller-side pre-probe pattern lives in `cmdCommit`; Phase 3 D-06 references this as the canonical pattern for multi-step state inspection.

### Established Patterns

- **Pure CJS in `bin/lib`, ESM TS in `sdk/src`, `dist-cjs/` bridge:** Unchanged. Phase 3 ships jj.ts compiled through the existing build.
- **`{ exitCode, stdout, stderr, timedOut, error }` exec return shape:** Standardized by Phase 1 `exec.ts`. jj.ts conforms.
- **Per-file commit history with explicit per-file commit messages (Phase 2 D-05 + D-06):** Carries to Phase 3 per D-10.
- **Mechanical-only invariant (Phase 2 D-08) + verb-shape exception (Phase 2.1 D-21):** Phase 3 qualifies for the exception — the shape commit (D-08) lands the jj.ts skeleton + parsers + CI install atomically.
- **Branch-by-Abstraction call-site swaps:** N/A in Phase 3 — Phase 2.1 already cleaned the call sites; Phase 3 is net-new backend, not a refactor.
- **NDJSON parsing convention (`-T 'json(self) ++ "\n" --no-graph`):** Locked by JJ-04; jj.ts log/op-log/workspace-list verbs all use it.
- **Argv-array invocation only (JJ-02):** No shell strings; revset/template strings passed as separate args to `vcsExec`.
- **Mandatory jj flags (`--repository`, `--no-pager`, `--color never`, `--quiet`):** Per JJ-02 + STACK.md; jj.ts passes these on every invocation via a thin wrapper helper (planner picks name, e.g., `jjArgv()`).

### Integration Points

- **`sdk/src/vcs/types.ts` is the load-bearing contract:** Adding `CommitInput.bookmark` / `bookmarkRaw` per D-01/D-04 affects every backend (both must accept; git is no-op on these fields). Type adds happen in the Phase 3 shape commit (D-08).
- **`baseline-parity.test.ts` dispatch clauses:** Args-shape-keyed per Phase 2 LEARNINGS Pattern #11; Phase 3 adds `jj-colocated` axis (D-11) but does NOT change the dispatch logic — the test is shape-stable.
- **`bin/lib/*.cjs` consume `dist-cjs/vcs`:** Stable. Phase 3's new `bookmark` / `bookmarkRaw` fields are optional → no caller-side change needed for existing callers. New Phase-4 callers (orchestrator) will pass them.
- **Sticky-preference config read site:** D-17 adds a config read in `createVcsAdapter`. If the config home is `.planning/config.json`, the SDK already has machinery to read it (via `gsd-sdk query config-get`). If it's a new top-level config, planner adds the read path.
- **`scripts/lint-vcs-no-raw-git.cjs`:** Phase 3 must NOT trigger new allowlist entries. If a Phase 3 plan trips the guard, that's a bug in the plan — escalate per Phase 2.1 D-22 invariant.

</code_context>

<specifics>
## Specific Ideas

- **Phase 3 plan numbering:** `03-01-PLAN.md` through `03-NN-PLAN.md` per the padded convention (memory: `[Phase filenames follow SDK padded convention]`). ~5-7 plans per D-10.
- **First plan ("shape commit"):** `03-01-PLAN.md` lands jj.ts skeleton (every verb throws `VcsNotImplementedError`) + parser stubs (jj-log.ts, jj-op-log.ts, jj-workspace-list.ts, jj-id.ts as needed) + CI install step + matrix activation for baseline-parity + sticky `vcs.adapter` config field with default-git-when-both. Comparable in size to Phase 1's 01-02-PLAN.md (atomic types + exec + parse + backends + hook-bridge + index).
- **Second plan:** Exec wrapper helper + NDJSON parsers + jj-id translator (change_id ↔ commit_id). No verb impls yet — just the substrate that subsequent plans build on.
- **Third plan:** Refs (head, parent, bookmarks CRUD + currentBookmarks with `gsd/` strip + resolveShort/exists/countCommits). Round-trip prefix-strip test pinned per D-03.
- **Fourth plan:** Commit (squash semantics + bookmark advance per D-01) + paired commit-* tests on jj-colocated.
- **Fifth plan:** Status / log / diff + paired tests.
- **Sixth plan:** findConflicts + paired tests + verify-gate integration check (per Phase 2 D-04 verify uses `scope: 'all'`).
- **Seventh plan:** Push / fetch + workspace stubs (contract-passing, not Phase-4-orchestrator-aware) + end-of-phase wrap-up (flip baseline-parity allowlist, audit skip-count delta, finalize `docs/test-triage/jj-bugs.md`).
- **End-of-phase deliverable:** Phase 3 SUMMARY.md + LEARNINGS.md + VERIFICATION.md per standard GSD flow. Format-migration tracker (this CONTEXT.md's `<format_migration_tracker>` section) handed off to the future migration phase.
- **`docs/test-triage/jj-bugs.md` shape:** Markdown table with columns `bug-id | test path | jj behavior observed | verdict (jj-mapped / git-only / carries-verbatim) | rationale | follow-up phase`. Finalized by `03-07-PLAN.md` (or whichever plan is the wrap-up).

</specifics>

<deferred>
## Deferred Ideas

- **`/gsd-migrate-to-jj` command + `.planning/` SHA → change_id rewriter:** D-18. New dedicated phase (Phase 4.5 decimal-insert or Phase 6, TBD via `/gsd-phase`). Phase 3 ships the gate (sticky preference) only.
- **A4 hybrid bookmark-advance fallback (auto-detect when exactly one bookmark at @-):** D-01 deferred. Layer on later if ad-hoc CLI commits without explicit bookmark surface as a real pain point.
- **`vcs.jjOnly.commitIdOf(change)` escape hatch:** Phase 2.1 D-14 deferred this; Phase 3 implements only if a real need surfaces (likely from colocated git-object interop or from the future migration phase's rewriter). Planner audits during plan 03-02 (parser/translator plan).
- **`vcs.test.readWithoutSnapshot()` symbol-gated escape:** Phase 3 D-06 explicitly does NOT introduce this. If a multi-step caller in Phase 4 or 5 can't be served by the pre-probe discipline, revisit then.
- **jj-native (non-colocated) matrix lane:** Phase 4 owns. Phase 3 reserves the TEST-03 slot but doesn't populate it.
- **Multi-version jj matrix axis:** Rejected per D-14 (single 0.41 pin, renovate-bumpable). Revisit only if a jj 0.41→0.42+ breakage forces back-version support.
- **Upfront worktree-bug-test triage doc:** Rejected per D-16 (per-test as it surfaces). Revisit only if per-test triage leaves the doc systematically incomplete at end-of-phase.
- **Long-lived feature branch for Phase 3:** Rejected per D-09 (CI allow-failure absorbs the broken-test window; no need for a long-lived branch). Revisit if a Phase 3 plan unexpectedly needs to land cross-file changes that the per-plan PR flow can't absorb.
- **NDJSON schema validation via zod/io-ts:** Planner's discretion per D-Claude's-Discretion. Lean toward hand-rolled with explicit field checks for parity with `git.ts` style. Revisit if hand-rolled parsing accumulates enough boilerplate to justify a runtime validator.
- **Pre-existing failures carried from Phase 2:** `config-mutation.test.ts:441` (Phase 1/2 deferred maintenance) still deferred to maintenance bucket; not Phase 3's call.
- **MIGR-04 + UPSTREAM-01 rebase task:** Carried from Phase 2 D-17 / Phase 2.1. Still deferred to milestone-end (post-Phase-5 — or post-migration phase if it lands after Phase 5).
- **REQUIREMENTS.md footer reconciliation:** Carried from Phase 2 / Phase 2.1 deferred. Still pending at next major phase transition.
- **ROADMAP insertion for the migration phase:** D-18. Run `/gsd-phase` to insert the new phase before that phase is planned. Not a Phase 3 deliverable.

</deferred>

---

*Phase: 03-jj-backend-core-squash-refs-conflict*
*Context gathered: 2026-05-12*
