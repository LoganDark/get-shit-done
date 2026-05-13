# Phase 5: Command Translations + Brownfield Validation + CI Hardening - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Bring every upstream GSD command to working order on a jj-only repo, rewrite the
workflow markdown and agent prompts to be VCS-agnostic so the same source
propagates to every runtime, close the Phase 4 colocated-pre-commit hand-off,
opportunistically finish MIGR-02, stabilize the jj CI lanes, and graduate them
to required-blocking.

**In Phase 5:**
- CMD-01..11: Every upstream GSD command works end-to-end on the jj backend.
  Verified via integration tests against synthetic jj fixtures (not this repo —
  see D-31). Daily-driver flows (new-project, plan-phase, execute-phase,
  discuss-phase, quick), lifecycle flows (undo, pr-branch, hotfix, ship,
  verify-work, complete-milestone), brownfield flows (resume-work, pause-work,
  import, ingest-docs, map-codebase).
- PROMPT-01..02: Workflow markdown (`get-shit-done/workflows/*.md`) and agent
  definitions (`agents/*.md`) rewritten to be VCS-agnostic prose + SDK-mediated
  mutations (D-33). Hot files: `execute-phase.md` (58 git mentions),
  `quick.md` (46), `gsd-code-fixer.md` (37), `complete-milestone.md` (36),
  `gsd-executor.md` (24), `undo.md` (15), `code-review.md` (11).
- PROMPT-03: Multi-runtime variants — trust the installer to transform
  canonical Claude source for Codex / Gemini / OpenCode / +12 other runtimes
  (D-37); no per-runtime smoke matrix added in Phase 5.
- A3 fix (Phase 4 Open Q1 closure): jj adapter always fires
  `.githooks/pre-commit` after squash, regardless of colocation, with
  `GSD_HOOK_SKIP_COLOCATED` env override as escape hatch (D-32).
- SDK query bridge consumers: `execute-phase.md:682-728` currently calls raw
  `git hook run pre-commit`; swap to `gsd-sdk query hooks.fire pre-commit`
  (the bridge landed in Phase 4 plan 04-06).
- MIGR-02 opportunistic fold-in: 6 outstanding `bin/lib/*.cjs` files
  (`core.cjs`, `verify.cjs`, `commands.cjs`, `init.cjs`, `graphify.cjs`,
  `drift.cjs`) finish their adapter migration in the same plans that rewrite
  prompts referencing them (D-35).
- CI-03: GitHub Actions workflows (`canary`, `release-sdk`, `hotfix`,
  `branch-cleanup`, `auto-branch`, etc.) explicitly flagged in docs as
  "stays on git — GitHub *is* git"; jj-colocated and jj-native CI lanes
  graduate from `continue-on-error: true` to required-blocking after
  identified flakes are fixed and a 10-consecutive-green nightly window
  passes (D-36).

**Not in Phase 5 (owned elsewhere):**
- BROWN-01 / BROWN-02: deferred to Phase 6 (D-31). Dogfooding this repo's
  brownfield workflows on jj requires the persistent `vcs.adapter` flip plus
  the `.planning/` SHA → change_id rewriter — both already scoped to Phase 6.
  Running jj against this repo's planning state before that rewriter exists
  would orphan every commit-id reference in `.planning/`. ROADMAP success
  criterion #3 wording must be amended downstream (see D-31).
- Persistent `vcs.adapter: jj` flip on this repo — Phase 6 owns it.
- `.planning/` SHA → change_id rewriter — Phase 6 owns it.
- `/gsd-migrate-to-jj` command surface — Phase 6.
- HOOK-05 Tier 2 PATH-shim wrapper (`jj-with-hooks` binary) — deferred to v2.
- Cross-workspace coordination primitive (`vcs.acquireRepoLock`) — Phase 4
  D-20 stance unchanged; revisit if a real flow surfaces.
- `MIGR-04` / `UPSTREAM-01` (first post-migration upstream rebase metric +
  jj-native rebase workflow doc) — still parked on the milestone-end
  deferred-tracker per `.planning/phases/02-bulk-call-site-migration-still-git-only/02-12-DEFERRED.md`.

</domain>

<decisions>
## Implementation Decisions

### Phase Decomposition

- **D-31 (Defer BROWN-01 / BROWN-02 to Phase 6):** Phase 5 will NOT run jj
  against this repo. This repo's `vcs.adapter` stays `git` (Phase 3 D-17) until
  Phase 6 lands the persistent flip alongside the `.planning/` SHA → change_id
  rewriter. The two are inseparable: flipping the adapter without the
  rewriter would orphan every commit-id reference recorded in `.planning/`
  files. BROWN-01 (brownfield commands verified against this repo's jj
  backend) and BROWN-02 (first weekly upstream rebase recorded after
  brownfield validation) therefore move to Phase 6. Phase 5 keeps CMD-01..11,
  PROMPT-01..03, CI-03.
  - **Roadmap amendment required (downstream task):** ROADMAP.md Phase 5
    success criterion #3 currently reads "Brownfield commands … run
    end-to-end against this very repo's jj backend (dogfood)" — this must be
    moved to Phase 6's success criteria. Phase 5 success criterion #3 should
    be replaced (or removed) with synthetic-fixture-based CMD-10 coverage
    language. REQUIREMENTS.md BROWN-01 / BROWN-02 status table entries
    re-bucket from Phase 5 to Phase 6.
  - **Brownfield commands still tested in Phase 5:** synthetic-jj-fixture
    integration tests cover resume-work / pause-work / import / ingest-docs /
    map-codebase under the standard CMD-10 gate (D-34). Real-history dogfood
    happens in Phase 6 by definition (the migrated repo IS the dogfood
    target). Phase 5 explicitly documents the coverage gap so Phase 6 doesn't
    inherit a false sense of completeness.

- **D-38 (Hybrid-tiered plan shape, 5–6 plans):** Plans grouped by command
  family to keep each shippable in isolation. Planner picks exact plan
  boundaries; this is the recommended shape:
  - **P1 — Foundational infra.** A3 fix in `sdk/src/vcs/backends/jj.ts`
    (always-fire pre-commit + env override per D-32); wire
    `execute-phase.md:682-728` and any other workflow callers from raw
    `git hook run` to `gsd-sdk query hooks.fire`; MIGR-02 fold-in for any
    cjs files this plan touches.
  - **P2 — Daily-driver commands.** `/gsd-new-project` (CMD-01),
    `/gsd-plan-phase` (CMD-02), `/gsd-execute-phase` (CMD-03),
    `/gsd-discuss-phase` (CMD-04), `/gsd-quick` (CMD-05). Each gets a jj
    integration test + the workflow / agent prompt rewrite for that command
    (PROMPT-01/02 slice) + MIGR-02 opportunistic fold-in for cjs files
    touched.
  - **P3 — Lifecycle commands.** `/gsd-undo` (CMD-06), `/gsd-pr-branch`
    (CMD-07), `/gsd-hotfix` (CMD-08), `/gsd-ship` (CMD-09),
    `/gsd-verify-work` + `/gsd-complete-milestone` (CMD-04 spillover + CMD-11).
  - **P4 — Brownfield commands.** `/gsd-resume-work`, `/gsd-pause-work`,
    `/gsd-import`, `/gsd-ingest-docs`, `/gsd-map-codebase` (CMD-10) with
    synthetic-jj-fixture integration tests. No dogfood on this repo (D-31).
    Document the coverage gap explicitly (per D-34).
  - **P5 — CI hardening + close.** Land fixes for the Phase 4 LEARNINGS-cited
    flakes (concurrency, fixture-tmpdir contention); run the 10-consecutive-
    green nightly window; flip both jj lanes to required-blocking (D-36).
    Add the CI-03 docs note about GitHub Actions staying on git. PROMPT-03
    closure (trust-installer note, no smoke matrix added per D-37).
  - **Optional P6** if Plan-1 foundational infra grows large enough to
    deserve its own slice separate from MIGR-02; planner's call.

### Closure of Phase 4 Hand-offs

- **D-32 (A3 fix: Path 1 — always-fire + env override):** Closes Phase 4
  LEARNINGS Open Q1. The jj adapter (`sdk/src/vcs/backends/jj.ts` `commit()`)
  fires `.githooks/pre-commit` after every `jj squash` regardless of
  colocation mode. `GSD_HOOK_SKIP_COLOCATED=1` env var as the escape hatch
  for the case where future jj upstream adds auto-fire behavior and produces
  duplicates. Phase 4 D-10's "colocated no-op" branch is retired:
  `fireHook('pre-commit', …)` is now unconditional. Rationale: cheapest
  correctness recovery; hooks are required to be idempotent or guard
  themselves anyway; Phase 5 dogfood flows would otherwise commit without
  pre-commit running in colocated mode (the dominant local-dev
  configuration).

- **D-33 (PROMPT vocabulary: agnostic prose + SDK-mediated mutations):**
  Workflow markdown stays VCS-neutral in prose ("commit your changes",
  "create a workspace at path P") and routes every mutation through
  `gsd-sdk query <verb>` or `bin/gsd <subcommand>`, both of which dispatch
  per backend. Backend-aware conditionals (`if git: … if jj: …`) are
  prohibited — they balloon prompt length and create per-file fork-divergence
  points that fight every upstream rebase (UPSTREAM-02 sidecar rule). Reads
  may stay as adapter calls (`vcs.<read>()`) where they already exist; no
  forced uniformity. Where a needed SDK verb does not yet exist, the plan
  that touches it adds the verb before rewriting the consumer.

- **D-34 (CMD-10 brownfield gap documented):** Phase 5 plans for brownfield
  commands ship integration tests against a synthetic jj fixture (mirroring
  the CMD-* gate for every other command) but NOT real-history dogfood on
  this repo. The phase SUMMARY for the brownfield-commands plan and the
  closing 05-LEARNINGS must explicitly call out: "Brownfield commands
  exercised against synthetic jj fixtures only; full dogfood validation
  occurs in Phase 6 once the sticky-adapter flip + `.planning/` SHA →
  change_id rewriter exist." This prevents Phase 6 inheriting a false sense
  of CMD-10 completeness.

- **D-35 (MIGR-02 opportunistic per-file fold-in):** The 6 outstanding
  `bin/lib/*.cjs` files (`core.cjs`, `verify.cjs`, `commands.cjs`,
  `init.cjs`, `graphify.cjs`, `drift.cjs`) finish their adapter migration in
  the same Phase 5 plan that touches them for PROMPT rewrites or CMD test
  setup. Each plan SUMMARY lists which cjs files it completed. If a cjs file
  is not touched by any Phase 5 plan, planner adds a small dedicated task in
  Plan 5 (CI hardening + close) to sweep the remainder. Phase 5 close
  asserts MIGR-02 is fully checked off in REQUIREMENTS.md.

- **D-36 (CI graduation: fix-specific-flakes + N consecutive greens):** Two
  steps in Plan 5:
  1. **Identify and fix the flake sources** Phase 4 LEARNINGS cited:
     concurrency contention (multiple-workspace tests racing on shared
     state) and fixture-tmpdir contention (parallel test runners colliding
     on `/tmp` paths). Land the fixes in commits within Plan 5.
  2. **Soak window:** require 10 consecutive green nightly runs across BOTH
     `jj-colocated` AND `jj-native` lanes (in addition to the existing `git`
     lane). Soak metric tracked in `.planning/intel/ci-jj-soak.md` (or
     equivalent) — planner picks the file name. Once the window passes,
     remove `continue-on-error: true` from the matrix entries in
     `.github/workflows/test.yml`. This is the CI-01 / CI-04 graduation
     event Phase 3 D-11 and Phase 4 D-22 both deferred to "Phase 5".
  - If flakes resist fixing within the phase window, planner's discretion to
    either extend the window or document specific flakes as known-issues
    gated by env flag, and proceed with required-blocking on the
    non-flaky subset.

- **D-37 (PROMPT-03 trust-installer):** Source-of-truth is canonical Claude
  markdown in `get-shit-done/workflows/*.md` and `agents/*.md`. `bin/install.js`
  transforms paths and tool names per target runtime (15+ runtimes, including
  Codex / Gemini / OpenCode / Copilot / Antigravity / Cursor / Windsurf /
  Augment / Trae / Qwen / Hermes / Cline / CodeBuddy / Kilo). The transform
  pipeline is battle-tested upstream and already covers any new shell-form
  SDK query calls our jj-port introduces (because `gsd-sdk query …` is just a
  shell command — every runtime that can execute bash can invoke it). Phase 5
  does NOT add a per-runtime smoke matrix. Per-runtime smoke testing remains
  an upstream-installer concern.

### Inherited / Sticky from Earlier Phases

- **Phase 3 D-17 (sticky `vcs.adapter`):** This repo's `vcs.adapter` config
  remains the auto-detected `git` default. Phase 5 does not flip it (D-31).
- **Phase 4 D-08 (SDK query bridge):** `gsd-sdk query hooks.fire <stage>`
  already exists (Phase 4 plan 04-06). Phase 5 consumers consume it; no shape
  change needed.
- **Phase 4 D-10 retirement:** The "colocated no-op" hook branch from
  Phase 4's design is explicitly retired by D-32 above. Adapter `commit()`
  becomes unconditional in firing pre-commit.
- **Phase 2.1 D-07 (no public `vcs.hooks.*`):** Still deleted. SDK query
  bridge is the only public-surface way to fire a hook explicitly.

### Phase 5 Test-Fixture Strategy

- **Synthetic jj fixtures only.** Every CMD-* integration test runs against
  ephemeral `jj git init`-or-`jj init` repos in tmpdirs, populated to the
  minimum needed shape for the command under test. No real-repo dogfood.
- **Where existing fixtures cover both backends (Phase 1 `vcsTest(kind)`,
  Phase 4 `vcsMultiWsTest(kind, n)`),** Phase 5 reuses them. New fixtures
  are added only where the existing matrix can't reach the surface (e.g.,
  `/gsd-pr-branch` filtering a fixture with `.planning/`-only commits;
  `/gsd-hotfix` rooting work at a historical change-id).

### Roadmap / Requirements Amendment (Phase 5 Plan 1 or 0)

- **D-31 derivative — file edits Phase 5 must land:**
  - `.planning/ROADMAP.md`: Phase 5 success criterion #3 amended to drop the
    "against this very repo's jj backend (dogfood)" clause; Phase 6 success
    criteria updated to absorb the literal BROWN-01 / BROWN-02 scope.
  - `.planning/REQUIREMENTS.md`: BROWN-01 / BROWN-02 phase column updated
    from "Phase 5" to "Phase 6" (lines ~277, ~278, and the Phase 5/6 phase
    summary lines further down).
  - `.planning/STATE.md`: nothing to edit at phase-start; closure
    bookkeeping at phase-end.
  - Planner's call whether these edits land in a dedicated Plan 0 / Plan 1
    or are folded into the foundational-infra plan.

### Claude's Discretion

- **Exact plan boundaries within the hybrid-tiered shape** — D-38
  recommends 5 plans grouped by command family, but the planner can split
  P2 / P3 finer or fold P5's CI work into the brownfield plan if dependency
  shape favors it. The recommendation is a starting point, not a contract.
- **Where the roadmap-amendment lives (Plan 0 vs Plan 1):** Planner picks.
- **Order of MIGR-02 fold-in within each plan:** Planner picks. Suggested:
  do the MIGR-02 swap first (mechanical), then the PROMPT rewrite on top,
  then the CMD integration test against the now-clean adapter.
- **Exact synthetic-fixture shape for brownfield commands (P4):** Planner
  picks. Minimum: enough `.planning/` directory structure (e.g., 1 phase
  with 2 plans, a STATE.md, a ROADMAP.md) for each command's flow to
  exercise its decision tree.
- **SDK verb additions needed mid-rewrite (D-33):** If a PROMPT rewrite
  needs a verb that doesn't exist (e.g., `gsd-sdk query commit` for
  workflows that currently shell `git commit`), planner adds the verb in
  the same plan before rewriting the consumer. Verb naming is the
  planner's discretion subject to the existing `gsd-sdk query` conventions.
- **Flake-fix mechanism (D-36 step 1):** Planner identifies the specific
  flake sources from Phase 4 LEARNINGS' citation and picks the fix
  (serializing tests, dedicated tmpdir factory, fixture pre-flight
  cleanup, etc.).
- **Soak-window bookkeeping file (D-36 step 2):** Planner picks file name
  and shape under `.planning/intel/`.
- **`/gsd-pr-branch` revset for `.planning/`-only filtering (CMD-07):**
  Planner picks the exact revset expression. ROADMAP locks the strategy
  (filter via revset, materialize via `jj duplicate` onto a new bookmark)
  — the wording of the filter is planner's call.
- **`/gsd-hotfix` bookmark naming pattern (CMD-08):** ROADMAP locks
  `gsd/hotfix/<id>` shape. Planner picks `<id>` format (timestamp,
  change-id-short, etc.).
- **PROMPT-03 verification depth (D-37):** Planner can spot-check one
  runtime install at phase close if desired, but it's not a gate.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project / Phase Scope
- `.planning/PROJECT.md` — Core value: "every upstream GSD command works
  correctly on a jj-only repo without git." This is the Phase 5 deliverable
  surface.
- `.planning/REQUIREMENTS.md` — CMD-01..11, PROMPT-01..03, CI-03 (Phase 5
  owns); BROWN-01 / BROWN-02 (re-bucket to Phase 6 per D-31); MIGR-02
  (opportunistic fold-in target per D-35).
- `.planning/ROADMAP.md` §"Phase 5: Command Translations + Brownfield
  Validation + CI Hardening" — phase boundary; success criterion #3 needs
  amendment per D-31 (BROWN clause moves to Phase 6).
- `.planning/ROADMAP.md` §"Phase 6: Brownfield jj Migration — sticky
  vcs.adapter flip + .planning SHA→change_id rewriter" — destination for
  BROWN-01 / BROWN-02 per D-31.
- `.planning/STATE.md` — Phase 4 closed `COMPLETE-WITH-CAVEAT`; Phase 5 is
  next in execution order.

### Phase 4 Hand-off (PRIMARY UPSTREAM CONTEXT)
- `.planning/phases/04-workspaces-octopus-structure-hooks/04-LEARNINGS.md`
  — **Open Question §1** (A3 colocated pre-commit refutation) closed by
  D-32 above (Path 1). "Hand-off to Phase 5" section lists the replacement
  targets in workflows / agent prompts (`execute-phase.md:682-728` raw
  `git hook run pre-commit`, `git worktree add`, `git branch <name>`
  references) and the cross-backend primitives now ready for Phase 5
  consumption.
- `.planning/phases/04-workspaces-octopus-structure-hooks/04-CONTEXT.md` —
  D-08 SDK query bridge `gsd-sdk query hooks.fire`; D-10 colocated hook
  semantics retired by D-32 above; D-22 jj-native CI lane added with
  `continue-on-error: true`, graduates per D-36 above.
- `.planning/phases/04-workspaces-octopus-structure-hooks/04-VERIFICATION.md`
  — `COMPLETE-WITH-CAVEAT` evidence; the caveat is the A3 gap closed by
  D-32.

### Prior-Phase Context (Decisions to inherit, not re-decide)
- `.planning/phases/03-jj-backend-core-squash-refs-conflict/03-CONTEXT.md`
  — D-17 sticky `vcs.adapter` (still git in this repo per D-31); D-05
  strict-never `--ignore-working-copy`; bookmark-namespace `gsd/` prefix
  conventions.
- `.planning/phases/02.1-vcs-abstraction-audit-drop-git-only-concepts/02.1-CONTEXT.md`
  — D-07 public `vcs.hooks.*` namespace deleted; D-13 `expr.commit` → `expr.rev`
  rename; D-15 `currentBookmarks(): string[]` shape locked.
- `.planning/phases/02-bulk-call-site-migration-still-git-only/02-12-DEFERRED.md`
  — MIGR-04 / UPSTREAM-01 deferred-tracker entries that Phase 5 does NOT
  pick up (they remain milestone-end).

### Pre-Phase Intel
- `.planning/intel/git-touchpoints.md` — Source counts driving PROMPT-*
  scope: `execute-phase.md` 58 mentions, `quick.md` 46, `gsd-code-fixer.md`
  37, `complete-milestone.md` 36, `gsd-executor.md` 24, `undo.md` 15,
  `code-review.md` 11. Also the i18n note: doc files have `zh-CN`,
  `ja-JP`, `ko-KR`, `pt-BR` mirrors — Phase 5 PROMPT scope is the
  source-of-truth English files; localized mirrors are installer-handled.
- `.planning/intel/vcs-adapter-surface-audit.md` — `VcsWorkspace` /
  `VcsHooks` rows from Phase 4 inheritance.

### Research, Architecture, Pitfalls
- `.planning/research/ARCHITECTURE.md` — Adapter layering rules; the
  no-raw-git lint guard and SDK-mediated execution path that D-33 codifies
  at the workflow-prompt level.
- `.planning/research/PITFALLS.md` — Pitfall 1 (no interleaving git+jj —
  still binding); Pitfall 5 (hook implementation strategy — D-32 commits
  Phase 5 to Tier 1 always-fire, Tier 2 wrapper still v2).
- `.planning/research/STACK.md` — jj flag conventions; `--ignore-working-copy`
  prohibition (Phase 3 D-05 still binding for any new jj invocations Phase 5
  adds).
- `.planning/research/FEATURES.md` — Per-command translation table
  (worktree → workspace, branch → bookmark mappings) informing CMD-* design.

### Phase 5 Code Surfaces (IMPLEMENT against these)
- `sdk/src/vcs/backends/jj.ts` — A3 fix lands here. `commit()` /
  `fireHook('pre-commit', …)` becomes unconditional per D-32.
- `sdk/src/vcs/hook-bridge.ts` — Phase 1's private `fireHook` helper; no
  shape change, just consumer-side rewiring.
- `sdk/src/query/hooks.ts` — `gsd-sdk query hooks.fire` bridge (Phase 4
  plan 04-06); workflow consumers route through this.
- `get-shit-done/workflows/execute-phase.md`,
  `get-shit-done/workflows/quick.md`,
  `get-shit-done/workflows/complete-milestone.md`,
  `get-shit-done/workflows/undo.md`,
  `get-shit-done/workflows/code-review.md` — PROMPT-01 primary targets.
- `agents/gsd-code-fixer.md`, `agents/gsd-executor.md` — PROMPT-02 primary
  targets.
- `get-shit-done/bin/lib/core.cjs`, `verify.cjs`, `commands.cjs`,
  `init.cjs`, `graphify.cjs`, `drift.cjs` — MIGR-02 opportunistic fold-in
  targets (D-35). Each plan SUMMARY lists which it completed.
- `.github/workflows/test.yml` — CI graduation per D-36. Remove
  `continue-on-error: true` from `jj-colocated` and `jj-native` matrix
  entries after soak.
- `bin/install.js` — Installer transform pipeline (D-37 trust-installer
  rationale); not edited in Phase 5, just relied upon.

### Reference Targets for `gsd-sdk query` Verb Additions (planner discretion)
- Existing `sdk/src/query/*.ts` files (`commit.ts`, `init.ts`, `verify.ts`,
  `progress.ts`, etc.) — patterns to mirror when adding any new verbs
  D-33 requires.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `gsd-sdk query hooks.fire <stage>` bridge — Phase 4 plan 04-06 landed it;
  consumed by Phase 5 PROMPT rewrites. Replaces raw `git hook run pre-commit`
  in workflow markdown.
- `vcs.workspace.{add, forget, prune, list, reap}` — Full suite on both
  backends from Phase 4. `/gsd-execute-phase` translation (CMD-03) consumes
  the lazy-octopus path through these primitives.
- `acquireJjWriteLock(repoCwd, opts)` — Phase 4 D-19 RAII lock; consumed by
  any Phase 5 flow that performs jj-side mutations under concurrency.
- `vcs.refs.bookmarks.{create, move, delete, exists}` with
  `validateRefname` + `--` separator (Phase 4 D-24 cr-01 fold-in) — used
  by `/gsd-pr-branch` (CMD-07), `/gsd-hotfix` (CMD-08), and bookmark
  advancement in `/gsd-ship` (CMD-09).
- `vcsTest(kind)` + `vcsMultiWsTest(kind, n)` fixtures — already cover the
  `git` / `jj-colocated` matrix; Phase 5 CMD-* tests reuse them. New
  per-CMD fixtures only when an existing one can't reach the surface.

### Established Patterns
- **VCS-agnostic prose + SDK-mediated mutations (D-33)** is the existing
  pattern for any cross-backend execution path in this codebase since
  Phase 1: SDK queries dispatch by backend; workflow prompts never branch
  on `git` vs `jj`. Phase 5 is the mechanical application of this pattern
  to the workflow-prompt surface.
- **Sidecar files for jj-specific code (UPSTREAM-02):**
  `sdk/src/vcs/jj/*.ts` and `sdk/src/vcs/parse/jj-*.ts` carry zero
  upstream-rebase conflict surface. Any new jj-only logic Phase 5 adds
  (e.g., for `/gsd-pr-branch` filter, `/gsd-hotfix` rooting) lives in these
  sidecar paths, not inside upstream files.
- **Mechanical edits in upstream files (UPSTREAM-03):** PROMPT rewrites in
  `execute-phase.md` / `quick.md` / etc. are mechanical-shape swaps (git
  shell → SDK query). They shouldn't reshape surrounding logic, exactly
  for the same reason MIGR-02 / 02.1 stayed mechanical: the next upstream
  rebase needs to land cleanly on top.
- **No-raw-git lint guard** — Already enforced for source. Phase 5 needs to
  decide whether the guard's allowlist covers `*.md` files too, or
  whether a doc-only sweep is sufficient. Planner's discretion (low-risk
  either way).

### Integration Points
- **Workflow-prompt → SDK query plane:** Phase 5 PROMPT rewrites are the
  hand-off boundary. Above the line (markdown): VCS-agnostic prose. Below
  the line (`gsd-sdk query` + `vcs.<verb>`): backend dispatch.
- **A3 fix → hook semantics:** D-32 retires Phase 4 D-10's "colocated
  no-op" branch entirely. The `fireHook` call inside `jj.ts commit()`
  becomes unconditional. Anything that previously relied on the no-op
  (probably nothing — Phase 4 LEARNINGS documents zero real consumers
  given the gap) re-validates after the change.
- **CI matrix → required-blocking flip:** D-36 step 2 is the only place
  `.github/workflows/test.yml` changes — remove `continue-on-error: true`
  on the two jj matrix rows. The rest of CI stays git-side per CI-03.

</code_context>

<specifics>
## Specific Ideas

- **Phase 4 LEARNINGS Q1 Recommendation Path 1 is adopted verbatim (D-32).**
  User reaffirmed the "cheapest correctness recovery, hooks must be
  idempotent" rationale.
- **PROMPT-03 multi-runtime sync trusts `bin/install.js` (D-37):** the
  installer transform pipeline is canonical upstream work — we don't
  replicate or smoke-test it inside this fork.
- **The BROWN deferral (D-31) is not a Phase 5 scope reduction; it's a
  scope correction.** "Brownfield commands dogfood-validated on this
  repo's jj backend" is structurally impossible before the SHA → change_id
  rewriter exists, and that rewriter is Phase 6's signature deliverable.
  Phase 5 finishes the substrate (commands run on jj); Phase 6 flips the
  repo onto that substrate.

</specifics>

<deferred>
## Deferred Ideas

- **BROWN-01 / BROWN-02 → Phase 6.** Per D-31. Phase 6 absorbs the literal
  "brownfield commands verified against this repo's jj backend" and "first
  weekly upstream rebase recorded after brownfield validation" scope along
  with the sticky-adapter flip and the `.planning/` SHA → change_id
  rewriter it already owns.
- **Cross-workspace coordination primitive (`vcs.acquireRepoLock`):**
  Phase 4 D-20's "revisit when a real flow needs it" stance held —
  Phase 5 doesn't need it; revisit when post-migration parallel-fan-out
  surfaces a real shared-ancestor coordination need.
- **HOOK-05 Tier 2 PATH-shim wrapper (`jj-with-hooks` binary):** v2
  per REQUIREMENTS; v1 hook interface shaped to accommodate without
  breaking change.
- **Per-runtime smoke matrix for PROMPT-03:** D-37 trusts the installer.
  Revisit if a regression surfaces from a specific runtime install.
- **Full doc-only lint sweep for raw-git in markdown:** No-raw-git lint
  guard currently scans source. Whether to extend to `*.md` is open;
  Phase 5 may leave it to the next phase if planner deems the doc-only
  sweep sufficient.
- **Crash queue YAML frontmatter (Phase 4 Open Q3 D-12/D-13 deferral):**
  unchanged — still v2 unless a real consumer needs richer metadata.
- **30s lock-acquisition timeout tuning (Phase 4 D-19 / D-28):** revisit
  with Phase 5 / Phase 6 dogfood metrics, not Phase 5 a priori.

</deferred>

---

*Phase: 05-command-translations-brownfield-validation-ci-hardening*
*Context gathered: 2026-05-13*
