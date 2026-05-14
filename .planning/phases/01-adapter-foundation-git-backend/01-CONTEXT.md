# Phase 1: Adapter Foundation + Git Backend - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Land the `VcsAdapter` factory in `sdk/src/vcs/` with a 1:1 git backend behaviorally equivalent to existing inline `execSync('git …')` call sites. Ship the parameterized `vcsTest` fixture + `describe.for([...BACKENDS])` test harness, the snapshot-baseline mechanism for proving git-backend parity, and a whole-repo "no raw git" lint guard. **Zero call-site migration in Phase 1** — Phase 2 owns the bulk migration. **Zero jj code in Phase 1** — Phase 3 lands the jj backend.

The forward-complete contract surface decision (see D-04 below) means Phase 1's adapter must define and git-implement *every* namespace the project will ever need: `commit`, `log`, `refs` (incl. `bookmarks`), `workspace`, `hooks`, `findConflicts`, `gitOnly`. Each one is fully working on git in Phase 1; Phase 3 only needs to add the jj backend implementations of the same contract.

</domain>

<decisions>
## Implementation Decisions

### Build Pipeline & dist-cjs Wiring

- **D-01 (Build structure — Claude's discretion):** Add `sdk/tsconfig.cjs.json` extending `sdk/tsconfig.json` with `module: "commonjs"`, `outDir: "dist-cjs"`, and `include: ["src/vcs/**/*.ts"]` — narrow scope to the adapter only. Keep the existing `sdk/tsconfig.json` (ESM, `dist/`) unchanged for the rest of the SDK. `pnpm -F sdk build` runs both `tsc` invocations in parallel. Future modules can opt into `dist-cjs/` by extending the include list. Rationale: keeps the CJS artifact small, doesn't compile the entire SDK twice, makes the boundary between "ESM-only SDK consumers" and "CJS-from-bin/lib consumers" explicit.
- **D-02 (Test imports):** Vitest unit tests (`*.test.ts`) import TS source from `sdk/src/vcs/` directly (vitest's loader handles TS). Integration tests (`*.integration.test.cjs`) `require()` the built `dist-cjs/` artifact — verifies the actual artifact `bin/lib` will load. Vitest projects already separate these (`test:unit` / `test:integration`).
- **D-03 (Dev loop):** Add a `pnpm -F sdk dev` script that runs `tsc -w` and `tsc -p tsconfig.cjs.json -w` in parallel (e.g., via `npm-run-all -p` or `concurrently`). Both watchers run during local dev so any consumer (test or `bin/lib` smoke run) sees fresh code.

### Adapter Contract Scope

- **D-04 (Forward-complete surface):** Phase 1 designs and git-implements the **full** adapter surface — every namespace any later phase will need. Concrete namespaces: `vcs.commit`, `vcs.log`, `vcs.status`, `vcs.diff`, `vcs.refs.{head,parent}`, `vcs.refs.bookmarks.{list,create,move,delete,exists}`, `vcs.workspace.{add,forget,list}`, `vcs.hooks.fire`, `vcs.findConflicts`, `vcs.push`, `vcs.fetch`, `vcs.gitOnly.*`. Phase 2's migration is then pure mechanical edits — no "this call site can't migrate yet because the adapter doesn't have the verb" stalls.
- **D-05 (Workspace + hooks fully working on git in Phase 1):** `vcs.workspace.{add,forget,list}` wraps `git worktree add/remove/list/lock`. `vcs.hooks.fire(stage, ctx)` shells out to `.githooks/<stage>` synchronously and surfaces exit code. Phase 4 only adds jj implementations of the same contract.
- **D-06 (Discriminator field):** `vcs.kind: 'git' | 'jj'` is a runtime literal field on the frozen adapter object. TS type discriminates the union via this field. Callers narrow with `if (vcs.kind === 'git') { vcs.gitOnly.foo() }`. Pairs with branch-typed `gitOnly` (D-07).
- **D-07 (gitOnly typing — branch-typed):** `vcs.gitOnly.*` is statically present only on the git branch of the discriminated union. TS type is `GitVcsAdapter | JjVcsAdapter`; `JjVcsAdapter` has no `gitOnly` property. Calling `vcs.gitOnly.x()` against an unnarrowed `VcsAdapter` is a compile error — call sites must narrow first. No runtime stub on jj. Static enforcement is the goal: a Phase-3-era call site that forgets to narrow before reaching for `gitOnly` fails at type-check, not runtime.
- **D-08 (commit auto-advances active branch on both backends):** `vcs.commit({...})` advances the active branch (git) / bookmark (jj) on both backends. Git does this natively via `git commit` on a checked-out branch; the adapter's git impl is a thin wrapper. REFS-05 already locks this for jj — D-08 just confirms git matches, so Phase 2 call sites can consume one symmetric API.

### RevisionExpr Design

- **D-09 (Branded string type):** `type RevisionExpr = string & { readonly __brand: unique symbol }`. Runtime is just a string (cheap, debuggable in logs, serializable across CJS/ESM boundary). TS forbids passing raw strings; construction must go through the `expr` factory namespace.
- **D-10 (Construction — factory functions only):** Single `expr` namespace export from `sdk/src/vcs/expr.ts`: `expr.head()`, `expr.parent()`, `expr.bookmark(name)`, `expr.remote(branch, remote)`, etc. The pre-built constants `vcs.refs.head` and `vcs.refs.parent` (REFS-01/02) are derived accessors that internally call `expr.head()` / `expr.parent()` — they are ergonomics, not a parallel construction surface.
- **D-11 (Translation — centralized per-backend modules):** `sdk/src/vcs/parse/git-rev.ts` exports `toGitRev(expr: RevisionExpr): string`; `sdk/src/vcs/parse/jj-rev.ts` exports `toJjRev(expr): string`. Backends import their dialect translator. Easy to unit-test in isolation, keeps backend-specific dialect knowledge co-located with the parser tests.
- **D-12 (No raw escape in Phase 1):** `expr.raw()` is **not** added in Phase 1. Only structured factories. If Phase 2 migration uncovers a real call site that can't be expressed structurally, expand the factory set (e.g., add `expr.range(from, to)`) rather than introduce a string-passthrough escape. Backend-specific syntax stays out of call sites by construction.

### Test Fixture, Matrix Wiring, Snapshot Baseline

- **D-13 (Per-describe tmp repo with snapshot-restore):** `describe.for([...BACKENDS])` opens one tmp repo per describe block. Tests within the block share the repo; the fixture snapshots clean state at block start and restores between tests. Faster than fresh-init-per-test for ~80 tests.
- **D-14 (Snapshot/restore via adapter test primitive):** `vcs.test.snapshot(): SnapshotHandle` and `vcs.test.restore(handle): void` are part of the adapter contract under a `__testOnly` symbol-gated namespace. Each backend implements its dialect (git: `rev-parse HEAD` + `git reset --hard <ref> && git clean -fdx`; jj: `jj op log -n 1 --no-graph` + `jj op restore <opid> && jj abandon <new-changes>`). Generic test fixture stays backend-agnostic.
- **D-15 (BACKENDS constant — split):** `sdk/src/vcs/backends.ts` exports the `BACKENDS` list and backend-kind types (so any consumer can matrix-test). `tests/helpers.cjs` provides the `vcsTest` fixture, tmp-repo lifecycle, and `GSD_TEST_BACKENDS` env filter applied at fixture load. Clean separation: "what is a backend" lives in sdk; "how to test against one" lives in test infra.
- **D-16 (Snapshot strategy — both vitest snapshots and JSON baselines):** Two distinct mechanisms for two distinct purposes: (a) **Adapter contract tests** use vitest's builtin `expect(...).toMatchSnapshot()` — checks "given this input, adapter returns this shape". Baseline lives in `__snapshots__/` next to the test. (b) **Migration parity tests** (introduced in Phase 2 alongside actual migrations) use checked-in JSON baselines under `tests/baselines/git-vcs/<call-site>.snap.json`. Pre-migration: capture inline `execSync('git …')` output for representative inputs. Post-migration: assert adapter output matches baseline. Re-blessing requires explicit baseline edit (no `--update-snapshot` shortcut). Phase 1 ships only the harness; Phase 2 populates baselines as it migrates.

### Lint Guard (VCS-07 — Tightened)

- **D-17 (Lint forbids ALL git invocations from jj-reachable code, not just mutating verbs):** **This tightens VCS-07's wording.** Original VCS-07 said "never shells out to mutating git verbs". Locked tightening: any `git` invocation at all — read or write — is forbidden when reachable under the jj backend. Reason: read-only git commands against a colocated jj repo can still perturb jj state (lock contention, implicit `jj git import` semantics, working-copy snapshot timing). Even `git status` is not safe.
- **D-18 (Lint scope — whole repo, default-deny with explicit exempt list):** Lint script (`scripts/lint-vcs-no-raw-git.cjs`, matches existing `lint-no-source-grep.cjs` pattern) scans the entire repo for `git` invocations (`execSync('git`, `spawnSync('git'`, `execFileSync('git'`, shell-string `git ` in workflow markdown, etc.). Default-deny. Explicit exempt allowlist covers: (a) GitHub Actions workflows (CI side stays on git per CI-03), (b) upstream-tracking docs (`docs/upstream-rebase.md`, `.planning/intel/git-touchpoints.md`), (c) the git backend itself (`sdk/src/vcs/backends/git.ts`, `sdk/src/vcs/parse/git-*.ts`), (d) the adapter's `gitOnly` namespace impl, (e) test baseline-capture harness when running pre-migration capture mode. Allowlist lives in a checked-in JSON file (`scripts/lint-vcs-no-raw-git.allow.json`) so additions are explicit and PR-reviewable. Most stringent option chosen — surfaces latent git uses across the migration.
- **D-19 (Lint runs in CI):** Hooked into the existing CI lint step. Not run pre-commit (would slow every commit during migration phases when the allowlist is still being curated).

### Claude's Discretion

- **Build pipeline structure (D-01):** User said "you decide". Locked above as narrow `tsconfig.cjs.json` scoped to `src/vcs/` only.
- **Concrete namespace decomposition (D-04):** Final namespace listing within the forward-complete surface is the planner's call — the locked decision is that the surface is forward-complete; the planner can refine method signatures during research.
- **Concrete restore-primitive impl (D-14):** Backend-specific implementation detail of `vcs.test.snapshot()` / `vcs.test.restore()` is the planner/researcher's call. Locked decision is "adapter primitive, symbol-gated test namespace."

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project / Phase Scope
- `.planning/PROJECT.md` — Project framing, core value, constraints, key decisions table
- `.planning/REQUIREMENTS.md` — All v1 requirement IDs (VCS-01..07, GIT-01..03, TEST-01..04, TEST-06, TEST-07 are Phase 1 scope)
- `.planning/ROADMAP.md` §"Phase 1: Adapter Foundation + Git Backend" — Phase goal, dependencies, success criteria
- `.planning/STATE.md` — Pre-Phase-1 decisions log

### Architecture & Pitfalls Research (already produced during /gsd-new-project)
- `.planning/research/ARCHITECTURE.md` — Adapter shape (frozen plain-object factory), layering rules, component responsibilities, dist-cjs/ rationale, exec-wrapper design
- `.planning/research/PITFALLS.md` — Anti-patterns to avoid; the highest-risk one called out in ROADMAP.md ("skipping ahead to land jj logic before the seam exists at every call site") applies directly to Phase 1 sequencing
- `.planning/research/STACK.md` — Tech stack constraints (Node ≥22, pnpm 11+, vitest, TS ≥5)
- `.planning/research/SUMMARY.md` — Research synthesis
- `.planning/research/FEATURES.md` — Feature list with phase mapping

### Codebase Intel
- `.planning/intel/git-touchpoints.md` — The 1,234 git mentions / 244 programmatic exec sites the adapter must cover; hotspot file LOC table; this is the porting surface scan that drives the "forward-complete" decision in D-04

### Existing Code (Phase 2 will migrate; Phase 1 reads to design)
- `sdk/tsconfig.json` — Existing TS build config to extend with `tsconfig.cjs.json`
- `sdk/package.json` — Scripts to extend with `dev`, `build:cjs`
- `get-shit-done/bin/lib/core.cjs` — Largest CJS hotspot (2,036 LOC); will become a future `require('@gsd-build/sdk/dist-cjs/vcs')` consumer
- `get-shit-done/bin/lib/verify.cjs` — 1,390 LOC; second-largest CJS hotspot
- `sdk/src/query/commit.ts` — Canonical commit-handler (318 LOC); shape reference for what `vcs.commit({...})` needs to handle
- `tests/helpers.cjs` — Where the new `vcsTest` fixture, tmp-repo lifecycle, and `GSD_TEST_BACKENDS` filter wire up

### Project Conventions
- `CLAUDE.md` — `.envrc` GITHUB_TOKEN rule for any `gh` invocation; agent skills (issue tracker, triage labels, domain docs)
- `CONTEXT.md` — Repo-wide domain glossary, recurring PR mistakes, lint-rule recipes (no-source-grep, escapeRegex, etc.). The `lint-no-source-grep.cjs` pattern referenced in D-18 lives here.

### ADRs
- `docs/adr/0004-worktree-workstream-seam-module.md` — Existing worktree seam (Worktree Safety Policy Module). Phase 1's `vcs.workspace.*` namespace must consume / coexist with this seam, not replace it inline.
- `docs/adr/0006-planning-path-projection-module.md` — Planning path resolution; relevant to where adapter `cwd` resolution lands.
- `docs/adr/0007-sdk-package-seam-module.md` — SDK-to-`get-shit-done-cc` package seam; relevant to how `dist-cjs/` is consumed from `bin/lib`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Existing TS build config (`sdk/tsconfig.json`):** ES2022 / NodeNext / strict / declaration. The new `tsconfig.cjs.json` extends this — only overrides `module`, `moduleResolution`, `outDir`, and `include`.
- **Vitest project split (`vitest.config.ts` + `sdk/package.json` scripts):** `test:unit` and `test:integration` already exist. D-02 (source-for-unit, built-for-integration) plugs directly into this split.
- **`tests/helpers.cjs` lint-no-source-grep pattern:** D-18's lint script follows the same shape as `scripts/lint-no-source-grep.cjs` — node script, scans repo, exits non-zero on violation, runs in CI.
- **Existing `worktree-safety.cjs` seam (ADR-0004):** Already abstracts worktree porcelain parsing. `vcs.workspace.*` (D-05) should delegate to or wrap this seam, not duplicate its policy logic.
- **`escapeRegex` utility in `core.cjs`:** Available for any baseline-capture harness that builds RegExp from variable inputs.

### Established Patterns

- **Pure CJS in `bin/lib`, ESM TS in `sdk/src`:** The boundary already exists. `dist-cjs/` is the new bridge. No async-import shenanigans needed.
- **Frozen plain-object factories:** ARCHITECTURE.md research confirms this is GSD's preferred adapter shape (vs class-based). D-09's branded-string + D-10's `expr` factory namespace match this shape.
- **`{ exitCode, stdout, stderr }` return shape:** Existing inline `execSync` callers parse these fields ad-hoc. The single `exec.ts` wrapper (VCS-04) standardizes this. `VcsExecError` carries the same fields.
- **Symbol-gated test namespaces:** Pattern used elsewhere in the repo for keeping test-only surface out of public API (D-14).

### Integration Points

- **`bin/lib/*.cjs` future consumers:** `core.cjs`, `verify.cjs`, `commands.cjs`, `worktree-safety.cjs`, `init.cjs`, `graphify.cjs`, `drift.cjs`. Phase 1 does not migrate any of them — it produces the artifact they will require in Phase 2.
- **`sdk/src/query/*.ts` future consumers:** `commit.ts`, `init.ts`, `verify.ts`, `progress.ts`, `check-ship-ready.ts`, `check-decision-coverage.ts`, `docs-init.ts`. Same — Phase 2 migration target.
- **Lint integration (D-18):** Hooks into existing CI lint pipeline. Allowlist file `scripts/lint-vcs-no-raw-git.allow.json` is the new artifact reviewers gate on.
- **`.githooks/pre-commit`, `.githooks/pre-push`:** D-05's `vcs.hooks.fire` shells these out on git backend. The hook scripts themselves are not modified in Phase 1.

</code_context>

<specifics>
## Specific Ideas

- **The "no raw git anywhere" rule (D-17/D-18) is the load-bearing tightening of VCS-07.** Implementer must treat this as the binding spec, not VCS-07's literal wording. REQUIREMENTS.md will be updated to reflect this at the next phase transition; for Phase 1 planning/execution, D-17 is canonical.
- **gitOnly is statically discriminated, not runtime-stubbed (D-07).** Resist the temptation to add a runtime-throwing `gitOnly` on `JjVcsAdapter` "for symmetry" — that defeats the whole purpose of forcing call sites to narrow before reaching for git-only ops.
- **`expr.raw()` is forbidden in Phase 1 (D-12).** If a Phase 2 migration uncovers a call site that can't be expressed via structured factories, expand the factory (`expr.range`, `expr.ancestor`, etc.) — do **not** introduce a string-passthrough escape, even temporarily.
- **Migration parity baselines (D-16) are populated in Phase 2, not Phase 1.** Phase 1 ships only the harness (`tests/helpers.cjs` baseline-load + assertion utility, `tests/baselines/git-vcs/` directory). Phase 2's migration commits each pair into the baseline set as the call site migrates.

</specifics>

<deferred>
## Deferred Ideas

- **Phase 1 smoke-test migration of a single call site:** Considered ("migrate exactly one trivial call site as a proof-of-end-to-end-consumption from `bin/lib/*.cjs`"). Deferred — not asked, but worth flagging to the planner. If the planner wants a smoke-test migration to validate the `dist-cjs/` consumption path before Phase 2's bulk, it should be a single trivial call site (e.g., one `git rev-parse --show-toplevel` site) committed atomically. Otherwise strict zero migration in Phase 1 is fine.
- **`vcs.test.*` namespace expansion beyond snapshot/restore:** Other test-only primitives (e.g., `vcs.test.dirty()` to assert clean working copy, `vcs.test.commitFixture(spec)` for declarative test setup) may emerge during Phase 2 test migration. Add as needed; don't over-design in Phase 1.
- **Reconcile REQUIREMENTS.md footer count and VCS-07 wording at next phase transition:** STATE.md already flags the 78-vs-86 requirement-count discrepancy. Add to that: VCS-07 wording needs tightening to match D-17.
- **Lint guard's pre-commit integration:** D-19 keeps it CI-only during the migration phases. Reconsider for pre-commit once allowlist stabilizes (likely post-Phase 2).

</deferred>

---

*Phase: 1-Adapter Foundation + Git Backend*
*Context gathered: 2026-05-09*
