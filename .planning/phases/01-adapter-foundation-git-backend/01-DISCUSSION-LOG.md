# Phase 1: Adapter Foundation + Git Backend - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 1-Adapter Foundation + Git Backend
**Areas discussed:** Build pipeline & dist-cjs wiring, Adapter contract scope (incl. gitOnly typing), RevisionExpr design + construction API, Test fixture/matrix wiring/snapshot baseline

---

## Build pipeline & dist-cjs wiring

### Q1: How should the dist-cjs/ CJS build for bin/lib consumption be structured?

| Option | Description | Selected |
|--------|-------------|----------|
| Second tsconfig + parallel build | Add `sdk/tsconfig.cjs.json` (extends base, module=commonjs, narrow scope to src/vcs/). pnpm build runs both. Cleanest separation. | |
| Second tsconfig + full SDK rebuild | Same but emits the entire sdk/src/ tree to dist-cjs/. Bigger artifact; future CJS callers covered. | |
| Single tsc with downleveling shim | Postbuild script wraps dist/vcs/*.js with CJS-compatible exports. More moving parts, brittle. | |
| You decide | Pick whatever's most idiomatic. | ✓ |

**User's choice:** You decide.
**Notes:** Claude locked the narrow scope variant in CONTEXT.md D-01 — `tsconfig.cjs.json` includes only `src/vcs/**/*.ts`.

### Q2: When tests run under vitest, what should they import?

| Option | Description | Selected |
|--------|-------------|----------|
| Source TS directly | Vitest resolves TS via loader. No build required for test runs. | |
| Built CJS (dist-cjs/) | Tests require dist-cjs build to be fresh. Catches build pipeline regressions. Slower iteration. | |
| Source for unit, built for integration | Unit tests hit source; integration tests require built dist-cjs/. Vitest projects already separate these. | ✓ |
| You decide | Pick whatever balances iteration speed against catching build-output bugs. | |

**User's choice:** Source for unit, built for integration.
**Notes:** Plugs into existing `test:unit` / `test:integration` vitest project split.

### Q3: Does dist-cjs/ need to be built/watched during development, or only on demand?

| Option | Description | Selected |
|--------|-------------|----------|
| Watch mode in dev (tsc -w on both) | Add a `dev` script running both tsc watchers in parallel. | ✓ |
| On-demand only (build before run) | No watch added. Devs run `pnpm build` when bin/lib needs adapter changes. | |
| Build hook on git operations | pre-commit fires `pnpm -F sdk build` if vcs/ files changed. | |
| You decide | — | |

**User's choice:** Watch mode in dev (tsc -w on both).

### Q4: VCS-07 lint guard — how should it be implemented and gated?

| Option | Description | Selected |
|--------|-------------|----------|
| Node script in scripts/ + CI step | Greps jj backend files for forbidden git verbs. Matches existing `lint-no-source-grep.cjs` pattern. | ✓ |
| ESLint custom rule | Custom rule, runs in editor + CI. Requires ESLint setup (none in sdk/). | |
| Both lint + runtime assertion | Lint script + runtime guard in jj backend's exec wrapper. Belt-and-suspenders. | |
| You decide | — | |

**User's choice:** Node script in scripts/ + CI step.

### Q5 (continuation prompt): Done with Build pipeline area?

**User's choice:** *Free-text response* — "gsd shouldn't just avoid *mutating* git verbs, but ALL git commands. it should NEVER use git. The use of git at all can mess with jj state. Make the vcs layer cover reading as well as writing."

**Notes:** Significant tightening of VCS-07. Read-only git ops can perturb jj state in colocated mode; the lint must forbid all git invocations from jj-reachable code, and the adapter must cover reads as well as writes. Captured as D-17 in CONTEXT.md.

### Q6: Following up — should the 'no git' rule apply just to jj backend files, or to all jj-side code?

| Option | Description | Selected |
|--------|-------------|----------|
| jj backend files only | Lint scans sdk/src/vcs/backends/jj.ts + parse/jj-*.ts. | |
| Anywhere reachable when jj-mode is active | Once `createVcsAdapter` returns the jj backend, no code path under that adapter call may shell out to git. Stronger guarantee, harder to lint statically. | |
| Whole repo, with explicit exempt list | Default-deny for `git` invocations across the codebase; allowlist exempts upstream-tracking docs, GitHub Actions workflows on git side, etc. Most stringent. | ✓ |
| You decide | — | |

**User's choice:** Whole repo, with explicit exempt list.
**Notes:** Locked as D-18. Allowlist file `scripts/lint-vcs-no-raw-git.allow.json` is the new artifact.

---

## Adapter contract scope (incl. gitOnly typing)

### Q1: Given the 'no git anywhere' rule, how complete must the adapter's public surface be by end of Phase 1?

| Option | Description | Selected |
|--------|-------------|----------|
| Forward-complete (covers all Phases 2-5 migrations) | Phase 1 designs the full surface; git backend implements all of it. | ✓ |
| Phase-2-complete only (defer jj-shaped primitives) | Smaller Phase 1; Phase 3 is bigger. | |
| Minimum viable contract + extension points | Core + `extend(name, impl)` hooks. More ceremony. | |
| You decide | — | |

**User's choice:** Forward-complete.
**Notes:** Locked as D-04. Driven by the no-raw-git rule from the prior area: Phase 2's mechanical migration needs the full surface to leave no gaps.

### Q2: Should `vcs.workspace.*` and `vcs.hooks.*` be fully working on git backend in Phase 1?

| Option | Description | Selected |
|--------|-------------|----------|
| Both fully working on git | workspace = wraps `git worktree`; hooks.fire = shells .githooks/<stage>. Phase 4 only adds jj impls. | ✓ |
| Workspace working, hooks stub | Hooks: interface defined, fire() is a no-op pass-through on git. | |
| Both stub-only | Phase 2 cannot migrate worktree call sites until Phase 4. Probably wrong. | |
| You decide | — | |

**User's choice:** Both fully working on git. Locked as D-05.

### Q3: For `vcs.gitOnly.*`, what's the typing/runtime contract?

| Option | Description | Selected |
|--------|-------------|----------|
| Branch-typed: present on git, absent on jj | Discriminated-union pattern. Static type-error on misuse. | ✓ |
| Always present, jj throws at runtime | No TS narrowing required. Runtime-only error surface. | |
| Optional chaining: undefined on jj | Encourages silent skips. | |
| You decide | — | |

**User's choice:** Branch-typed. Locked as D-07.

### Q4: How should the adapter signal which backend it is?

| Option | Description | Selected |
|--------|-------------|----------|
| `vcs.kind: 'git' \| 'jj'` literal field | Public discriminator field. Standard discriminated-union pattern. | ✓ |
| Type-only branding (no runtime field) | Discriminate by presence/absence of `gitOnly`. `in` checks read awkwardly. | |
| Backend-typed factory return | createGitVcsAdapter / createJjVcsAdapter narrow types. | |
| You decide | — | |

**User's choice:** `vcs.kind: 'git' | 'jj'` literal field. Locked as D-06.

### Q5: For the forward-complete surface in Phase 1, what should `vcs.commit()` do on git regarding active-branch advance?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-advance on both backends | git does it natively; adapter is thin wrapper. Symmetric API. | ✓ |
| Caller-controlled on git, auto on jj | Asymmetric. Hard to migrate uniformly. | |
| You decide | — | |

**User's choice:** Auto-advance on both backends. Locked as D-08.

---

## RevisionExpr design + construction API

### Q1: What's the type shape of RevisionExpr?

| Option | Description | Selected |
|--------|-------------|----------|
| Branded string | Just a string at runtime; TS forbids raw strings without explicit cast via factory. | ✓ |
| Structured tagged union | Self-documenting, exhaustive switch. More verbose. | |
| Class instance with helpers | Doesn't serialize cleanly across CJS/ESM. | |
| You decide | — | |

**User's choice:** Branded string. Locked as D-09.

### Q2: How do call sites construct a RevisionExpr?

| Option | Description | Selected |
|--------|-------------|----------|
| Factory functions only: `expr.head()`, `expr.bookmark('main')`, `expr.raw('HEAD~3')` | Single import surface. Encourages structured usage. | ✓ |
| Pre-built constants on `vcs.refs` | Two construction paths. | |
| Both: refs constants for common, expr factory for custom | Combines both. | |
| You decide | — | |

**User's choice:** Factory functions only.
**Notes:** Locked as D-10. `vcs.refs.head` and `vcs.refs.parent` (REFS-01/02) become derived accessors that internally call `expr.head()` / `expr.parent()` — they remain ergonomic, but are not a parallel construction surface.

### Q3: Where does backend translation happen?

| Option | Description | Selected |
|--------|-------------|----------|
| In each backend method, when consuming the expr | Backend owns its dialect inline. | |
| Centralized translator module per backend | `parse/git-rev.ts`, `parse/jj-rev.ts` export translator functions. Easier to test in isolation. | ✓ |
| Polymorphic expr methods (`expr.toGit()`, `expr.toJj()`) | Class-flavored. Doesn't pair with branded string. | |
| You decide | — | |

**User's choice:** Centralized translator module per backend. Locked as D-11.

### Q4: `expr.raw(string)` escape hatch — how should it handle backend-specific syntax?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-backend raw: `expr.raw.git(...)`, `expr.raw.jj(...)` | Tagged with which backend's dialect. | |
| Single raw, runtime backend check on use | Errors surface as VcsExecError from jj. Errors far from cause. | |
| Forbid raw in Phase 1, add later if needed | Tightest contract. Expand factory (e.g. `expr.range`) if Phase 2 uncovers a need. | ✓ |
| You decide | — | |

**User's choice:** Forbid raw in Phase 1. Locked as D-12.

---

## Test fixture, matrix wiring, snapshot baseline

### Q1: How should the per-test repo isolation work?

| Option | Description | Selected |
|--------|-------------|----------|
| Fresh tmp repo per test | Maximum isolation; slower setup. | |
| Per-describe tmp repo, snapshot-restore between tests | Faster than per-test init. Backend-dialect restore. | ✓ |
| Per-test, with shared template repo for fast init | Per-test freshness via cp -R from template. | |
| You decide | — | |

**User's choice:** Per-describe tmp repo, snapshot-restore between tests. Locked as D-13.

### Q2: Where should the BACKENDS constant + GSD_TEST_BACKENDS filter live?

| Option | Description | Selected |
|--------|-------------|----------|
| tests/helpers.cjs (test-side) | All test infra; stays out of SDK source. | |
| sdk/src/vcs/test-helpers.ts (sdk-side) | Travels with the package. Couples to publishable surface. | |
| Split: BACKENDS in sdk, vcsTest fixture in tests/helpers | Constant + types in sdk; fixture wiring in tests. | ✓ |
| You decide | — | |

**User's choice:** Split. Locked as D-15.

### Q3: How should GIT-02's 'byte-identical' be verified?

| Option | Description | Selected |
|--------|-------------|----------|
| Manual baseline file per call site | Capture pre-migration `{exitCode, stdout, stderr}` to checked-in JSON. Tedious but unambiguous. | |
| Existing tests as the de-facto snapshot | If all tests still pass, adapter is byte-identical-enough. Misses gaps in test coverage. | |
| Shadow-execution diff in test mode | Adapter runs both inline + adapter and asserts equal. Catches drift continuously. | |
| You decide | — | |

**User's choice:** Manual baseline file per call site. Locked as D-16(b).

### Q4: For the per-describe tmp repo with snapshot-restore: how should restore semantics work given git vs jj differ?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-backend restore in vcsTest fixture | Backend dialect lives in test infra. | |
| Adapter primitive: `vcs.test.snapshot()` + `vcs.test.restore()` | Adapter exposes test-only namespace; each backend implements its dialect. Generic fixture. | ✓ |
| Recreate from template instead of restore | Simpler; slightly slower. | |
| You decide | — | |

**User's choice:** Adapter primitive. Locked as D-14. Symbol-gated `__testOnly` namespace.

### Q5: For manual baseline files per call site: where do they live and what triggers their creation?

| Option | Description | Selected |
|--------|-------------|----------|
| tests/baselines/git-vcs/<call-site>.snap.json, captured pre-migration | Phase 1 ships harness; Phase 2 populates as it migrates. | |
| Inline `expect.toMatchSnapshot()` (vitest builtin) | Lower ceremony; easy to accidentally re-bless. | |
| Both — vitest snapshots for adapter contract tests, baseline JSON for migration parity tests | Two tools for two purposes. | ✓ |
| You decide | — | |

**User's choice:** Both. Locked as D-16.

---

## Claude's Discretion

- Build structure (D-01) — locked as narrow `tsconfig.cjs.json` scoped to `src/vcs/` only
- Concrete namespace decomposition within forward-complete surface (D-04) — planner refines method signatures during research
- Backend-specific impl of `vcs.test.snapshot()` / `vcs.test.restore()` (D-14) — planner/researcher's call

## Deferred Ideas

- Phase 1 smoke-test migration of a single trivial call site (e.g. `git rev-parse --show-toplevel`) — flagged for planner consideration; not asked
- `vcs.test.*` namespace expansion beyond snapshot/restore (e.g. `vcs.test.dirty()`, `vcs.test.commitFixture()`) — add as needed during Phase 2 test migration
- REQUIREMENTS.md reconciliation at next phase transition: 78-vs-86 requirement count discrepancy + tighten VCS-07 wording to match D-17
- Lint guard's pre-commit integration — keep CI-only during migration; reconsider once allowlist stabilizes (likely post-Phase 2)
