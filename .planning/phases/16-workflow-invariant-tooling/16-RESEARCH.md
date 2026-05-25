# Phase 16: Workflow + invariant tooling - Research

**Researched:** 2026-05-24
**Domain:** Node.js CI lint scripts (fence-aware markdown scan) + jj-side workspace teardown wiring + bash recovery-script idempotent cleanup. All anchors live in this repo; no external packages installed.
**Confidence:** HIGH

## Summary

Phase 16 ships two file-disjoint invariant-tooling additions that close two narrowly-scoped v1.4 gaps. Both deliverables are pure reuse of patterns the v1.0–v1.3 milestones already shipped:

1. **LINT-06 / Plan 16.01** — `scripts/lint-vcs-parallel-call-presence.cjs`: a new CI lint structurally mirroring `lint-vcs-no-raw-git.cjs` (default-deny + per-entry `{path|glob, reason, owner}` allowlist via `scripts/lib/allowlist-parser.cjs`) that consumes the fence-aware walker shape from `scripts/audit-workflow-raw-git.cjs` (verbatim `FENCE_OPEN` / `FENCE_CLOSE` regex), scans `get-shit-done/workflows/*.md` for FILE-level pairing of the literal substrings `workspace.parallel.dispatch` and `workspace.parallel.fan-in` inside bash/sh/zsh fences, and exits 1 on unpaired files. Wired as a new step in `.github/workflows/parallel-e2e.yml` adjacent to the existing `audit-workflow-raw-git.cjs` CI-06 step (CI-only, NOT `npm pretest`).

2. **CLEANUP-02 / Plan 16.02** — extends the orphan-FS-dir reap to two new code sites, both consuming the locked `cleanupSubagentWorkspaces(mainRepoRoot, phaseNumber, workspaces?)` helper that Phase 15.04 extracted at `sdk/src/vcs/jj/workspace-cleanup.ts:134`: (a) the `performJjParallelFanIn` clean-path branch at `sdk/src/vcs/jj/parallel.ts:411-461` (the `else` after `if (conflicted)` — Anti-Pattern 5 lock: conflicted branch UNCHANGED, preserves workspaces for human inspection); (b) `scripts/dogfood-restore.sh` post-restore step via a new CLI bridge `sdk/src/query/cleanup-subagent-workspaces.ts` (three-site registration following the Phase 15.04 `workspace-parallel-cancel.ts` precedent verbatim).

**Primary recommendation:** Both plans are file-disjoint; the planner can sequence Plan 16.01 → 16.02 (or vice versa) without coupling. Anchor every implementation choice on the existing artifacts cited in `<canonical_refs>` — every shape decision Phase 16 needs is already locked in CONTEXT.md D-01..D-17, ROADMAP SC1..SC5, and Phase 15.04 plan/SUMMARY artifacts. There are no greenfield architectural decisions left for the planner; the work is mechanical wiring of locked contracts.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

(Carried forward from Phase 15 + roadmap creation. Downstream agents MUST NOT re-litigate.)

- **CF-01:** Helper signature LOCKED — `cleanupSubagentWorkspaces(mainRepoRoot: string, phaseNumber: number, workspaces?: readonly { name: string; path: string }[]): CleanupSubagentWorkspacesResult` at `sdk/src/vcs/jj/workspace-cleanup.ts` (Phase 15 CONTEXT D-05, amended 2026-05-24 to 3-arg form per Open Q1 RESOLVED). Return shape `{abandoned: readonly string[], failedReaped: readonly string[]}`. UPSTREAM-02 sidecar discipline — does NOT import from `backends/jj.ts`; uses `vcsExec` from `../exec.js` + `node:fs` `rmSync`. Idempotent by contract per D-03/D-06.
- **CF-02:** CLI bridge `sdk/src/query/cleanup-subagent-workspaces.ts` ships in Phase 16 (NOT 15). Three-site registration: `command-static-catalog-domain.ts` + `command-manifest.non-family.ts` + `command-aliases.generated.ts` (CF-07 precedent). Bridge wraps any wildcard/enumeration logic on its side — helper signature unchanged.
- **CF-03:** Conflicted-branch behavior UNCHANGED per ROADMAP SC4 + Pitfall AP-5. `performJjParallelFanIn` conflicted branch preserves workspaces on disk for human inspection (W3 (a) joint-assertion contract). Only the clean-path branch reaps. Documented inline at the code site.
- **CF-04:** Lint shape locked by ROADMAP SC1: content-driven detection via literal substring match in `bash`/`sh`/`zsh` fences (NOT heading-based tagging per Pitfall 7); per-entry `{path|glob, reason, owner}` allowlist via `scripts/lib/allowlist-parser.cjs` (no `expires` per `feedback_solo_dev_no_expires`); inline escape annotation `vcs-lint:allow-parallel-call-absent-here <reason>` reserved literal; fixture-based unit test under `tests/scripts/`.
- **CF-05:** CI placement per ROADMAP SC2 — new step in `.github/workflows/parallel-e2e.yml` adjacent to the existing `audit-workflow-raw-git.cjs` CI-06 step; required-blocking on jj-colocated; NOT promoted to `npm pretest`.
- **CF-06:** Reuse `scripts/audit-workflow-raw-git.cjs` fence-aware walker shape — same `FENCE_OPEN` / `FENCE_CLOSE` regex constants verbatim. Pitfall 7 "How to avoid" path 3: share the fence detection rather than re-implement it.
- **CF-07:** Plans 16.01 and 16.02 are file-disjoint and ROADMAP-declared parallel-safe within phase. (Wave-parallel execution is moot under `parallelization: false`-then-`true` — execute-phase still runs sequentially since `_auto_chain_active: false`.)

### Lint Pairing Scope (Plan 16.01 / Pitfall 7)

- **D-01:** Pairing scope is **FILE-level** — bidirectional, file-scoped. NOT fence-scoped, NOT section-scoped, NOT proximity-scoped. (Other scopes empirically falsified — see CONTEXT D-01 rationale.)
- **D-02:** Pairing is bidirectional — file with dispatch literal in a fence but NO fan-in literal in any fence → exit 1; file with fan-in literal but NO dispatch literal → exit 1.
- **D-03:** Lint applies to `get-shit-done/workflows/` files only. Non-workflow markdown out of scope by walker root selection.

### CLI Bridge Phase-Resolution (Plan 16.02 / IP-5)

- **D-04:** Bridge supports **both** `--phase <N>` AND `--all-phases` modes (mutually exclusive). dogfood-restore.sh uses `--all-phases`; any future single-phase TS-side consumer uses `--phase N`. Mutual-exclusion check rejects `--phase 16 --all-phases` early.
- **D-05:** `--all-phases` semantics: bridge enumerates `.claude/jj-workspaces/` via `readdirSync`, filters by regex `^phase-(\d+)-subagent-\d+$`, extracts the unique set of phase numbers, calls the helper once per phase.
- **D-06:** Cross-phase merge envelope: bridge returns a **single merged** `{abandoned: readonly string[], failedReaped: readonly string[]}` envelope across all enumerated phases (NOT a per-phase array). Workspace names are phase-prefixed so concatenation introduces no collisions.
- **D-07:** Bridge invocation in the fanIn clean-path branch is the TS-side direct call `cleanupSubagentWorkspaces(mainRepoRoot, phaseNumber, handle.workspaces)` from `sdk/src/vcs/jj/parallel.ts` (NOT via the CLI bridge — bridge is for bash consumers only).

### Allowlist Seeding + IP-2 Edge (Plan 16.01)

- **D-08:** Initial allowlist file `scripts/lint-vcs-parallel-call-presence.allow.json` ships with `entries: []` (empty) plus `$schema_version: 2` and a `$comment_ip2_cancel_exclusion` narrative stub citing PITFALLS.md §IP-2 verbatim.
- **D-09:** IP-2 cancel/fanIn-only edge handling: **defer entirely, NO `vcs-lint:allow-parallel-call-absent-here` annotation reserved**. Pure YAGNI per user pick.
- **D-10:** Lint script docblock documents (a) what fences are scanned (bash/sh/zsh, reusing `audit-workflow-raw-git.cjs:48` `FENCE_OPEN` verbatim); (b) the per-entry allowlist as the only opt-out mechanism in v1.4 (no inline escape today); (c) IP-2 cited via one-line cross-reference to `.planning/research/PITFALLS.md` §IP-2 — not a verbose rationale dump.

### dogfood-restore.sh Integration Ordering (Plan 16.02)

- **D-11:** Cleanup step placement: **LAST step in the script**, after `tar -xf "$TARBALL_PATH" -C .` and after the existing "complete" diagnostic echo. Preserves Pitfall 2 ordering invariant (jj op restore → tar -xf with tar last) by construction.
- **D-12:** Error handling: **trap CLI-bridge call with `… || echo "WARN: orphan cleanup failed" >&2`** and continue with exit 0. Cleanup is recovery hygiene, NOT blocking the restore.
- **D-13:** Second diagnostic echo fires AFTER the cleanup step: `echo "dogfood-restore: orphan-workspace cleanup complete (abandoned=$N, failedReaped=$M)" >&2`. Counts come from the bridge's merged envelope.

### Test Coverage Shape (Plan 16.01 + 16.02)

- **D-14:** LINT-06 fixture-based unit test lives at `tests/scripts/lint-vcs-parallel-call-presence.test.cjs` (mirrors `tests/lint-vcs-no-raw-git-fixture.test.cjs` Pattern B `mkdtemp` isolation; passes `--scan-root <tmpdir>` to the lint script). 5 fixture cases: paired pass, dispatch-only fail, fan-in-only fail, prose-only-mention pass, allowlist entry suppresses.
- **D-15:** CLEANUP-02 cross-backend test lives in `sdk/src/vcs/__tests__/` (alongside other VCS-fixture-driven cross-backend tests) using `vcs-fixture.ts` Pattern B `mkdtemp`. Asserts `existsSync(ws.path) === false` for every workspace in the handle after `performJjParallelFanIn` clean-path returns.
- **D-16:** `scripts/dogfood-restore.sh` integration test: synthetic `jj op restore` + orphan-survival fixture asserts dirs are gone after the script completes. Seeds two phase numbers (e.g., `phase-15-subagent-1` and `phase-16-subagent-2`) to verify `--all-phases` enumeration covers cross-phase orphans correctly.

### Cleanup-Contract Documentation Site

- **D-17:** Plan 16.02 ADDS a one-line cross-reference at the helper docblock pointing to this CONTEXT.md as the "consumer-completion record." No separate `.planning/intel/` doc needed.

### Claude's Discretion

These planner-level details NOT pinned at discuss-phase:

- Exact bridge argv parser style (manual `process.argv` walk vs. helper from `sdk/src/query/cli/argv.ts` if it exists — **VERIFIED via Bash: no `sdk/src/query/cli/` subdirectory exists**, so the bridge must use the inline `for (let i = 0; i < args.length; i++)` walk pattern from `workspace-parallel-cancel.ts:58-64`). Three-site registration shape is locked (CF-02).
- Exact lint script variable naming (`PARALLEL_DISPATCH_RE`, `PARALLEL_FAN_IN_RE`, etc. — follow `lint-vcs-no-raw-git.cjs` `SHELL_GIT_RE` precedent).
- Whether the bridge's `--all-phases` enumeration ignores or reports phases with zero matched workspaces (recommendation: skip silently — idempotent no-op semantics).
- Exact wording of the lint docblock IP-2 cross-reference line (D-10).
- Whether `dogfood-restore.sh` invokes the bridge via `gsd-sdk query cleanup-subagent-workspaces --all-phases` or via a fully-qualified path; matches the existing script's tooling conventions.

### Deferred Ideas (OUT OF SCOPE)

- **`vcs-lint:allow-parallel-call-absent-here <reason>` inline escape annotation** — D-09 deferred per user pick (pure YAGNI). When a real cancel-only or fanIn-only workflow emerges, add the regex constant + docblock entry + an allowlist entry simultaneously.
- **Extending the lint to recognize `dispatch ⇔ cancel` as a valid pairing** — speculative per D-09; wait for a real consumer.
- **Promoting `cleanupSubagentWorkspaces` to a cross-backend helper** — defer until git-side orphan-dirs become a problem.
- **A separate `.planning/intel/cleanup-contract.md` doc** — sufficient documentation surface already exists.
- **Capability-matrix entry for `cleanup-subagent-workspaces`** — flagged for planner confirmation; likely NOT required (matrix tracks `VcsAdapter` methods, not internal sidecar bridges).
- **Promoting the lint to `npm pretest`** — CF-05 explicitly keeps it CI-only.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LINT-06 | `scripts/lint-vcs-parallel-call-presence.cjs` ships as new CI scanner — content-driven detection in bash/sh/zsh fences under `get-shit-done/workflows/`; per-entry `{path|glob, reason, owner}` JSON allowlist via `scripts/lib/allowlist-parser.cjs`; slots into `.github/workflows/parallel-e2e.yml` adjacent to `audit-workflow-raw-git.cjs` CI-06; NOT promoted to `npm pretest`. | (a) reference shape `scripts/lint-vcs-no-raw-git.cjs` (Standard Stack entry 1); (b) fence walker shape `scripts/audit-workflow-raw-git.cjs` (Standard Stack entry 2); (c) allowlist parser `scripts/lib/allowlist-parser.cjs` (Standard Stack entry 3); (d) fixture test shape `tests/lint-vcs-no-raw-git-fixture.test.cjs` (Pattern 4); (e) CI step site `.github/workflows/parallel-e2e.yml:125-127` (Pattern 5) |
| CLEANUP-02 | Orphan `.claude/jj-workspaces/phase-*-subagent-*` FS directories reaped on `vcs.workspace.parallel.fan-in` success branch AND via `scripts/dogfood-restore.sh` post-restore cleanup; cross-backend test via `vcs-fixture.ts` Pattern B mkdtemp covers both jj-cell and git-cell paths. | (a) locked helper at `sdk/src/vcs/jj/workspace-cleanup.ts:134` (Standard Stack entry 4); (b) clean-path insertion site `sdk/src/vcs/jj/parallel.ts:411-461` (Architecture Pattern 2); (c) CLI bridge precedent `sdk/src/query/workspace-parallel-cancel.ts` (Architecture Pattern 3); (d) three-site registration at `command-static-catalog-domain.ts:23,78-79` + `command-manifest.non-family.ts:63` + `command-aliases.generated.ts:156` (Architecture Pattern 3); (e) dogfood-restore.sh insertion site (Pattern 6); (f) git-side already-correct teardown via `git worktree remove` (no change needed; D-15 regression test confirms) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Workflow markdown lint (fence-aware scan) | CI / Build tooling | — | Pure Node.js script with no runtime dependencies; runs in CI as a guard against workflow drift. Mirrors the `lint-vcs-no-raw-git.cjs` and `audit-workflow-raw-git.cjs` precedents — these all live in `scripts/` as standalone .cjs invokers. |
| Allowlist parsing | Build tooling library | — | `scripts/lib/allowlist-parser.cjs` is the shared parser module; the new lint imports it. The library is `.cjs` (not TypeScript) because the lints are stand-alone executables not part of the SDK build pipeline. |
| Workspace teardown (TS direct call) | SDK / VCS adapter | — | `performJjParallelFanIn` is jj-side adapter sidecar code at `sdk/src/vcs/jj/parallel.ts`. The fanIn function calls the locked helper at `sdk/src/vcs/jj/workspace-cleanup.ts` directly (no CLI hop). UPSTREAM-02 invariant: sidecar imports from `../exec.js`, NEVER from `backends/jj.ts`. |
| CLI bridge (bash consumer hop) | SDK query layer | — | `sdk/src/query/cleanup-subagent-workspaces.ts` mirrors the existing `workspace-parallel-cancel.ts` bridge shape. Three-site registration in the query catalog/manifest/aliases triplet is load-bearing for runtime verb resolution. |
| Recovery script integration | Bash / Operator tooling | CLI bridge (D-07/D-12 boundary) | `scripts/dogfood-restore.sh` is bash; it invokes the SDK CLI bridge at the END of the script (D-11 placement) with a trap-and-WARN error path (D-12). Bash never imports TypeScript; the CLI bridge is the language seam. |
| Integration / fixture tests | Test fixture (per-test mkdtemp) | — | Two test surfaces: (a) `tests/scripts/lint-vcs-parallel-call-presence.test.cjs` for the lint (Pattern B mkdtemp + `--scan-root`); (b) `sdk/src/vcs/__tests__/` for the cross-backend fanIn assertion (Pattern B mkdtemp via `vcs-fixture.ts`). |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | v25.9.0 (in repo; `node --version` verified 2026-05-24) | Runtime for the new lint script + CLI bridge + tests | Lint scripts run as `node scripts/*.cjs`; matches `lint-vcs-no-raw-git.cjs:1` shebang convention. [VERIFIED: bash `node --version`] |
| `node:fs` + `node:path` (built-in) | bundled | File walking + path resolution in the lint and bridge | All scripts in `scripts/` use these built-ins; no shelljs / globby / micromatch dependencies are introduced. [VERIFIED: `audit-workflow-raw-git.cjs:39-40`] |
| `node:test` + `node:assert/strict` | bundled | Test framework for `tests/scripts/lint-vcs-parallel-call-presence.test.cjs` | The `tests/` directory uses `node:test`, not vitest (per `tests/inventory-counts.test.cjs`, `tests/lint-vcs-no-raw-git-fixture.test.cjs`, `tests/scripts/allowlist-parser.test.cjs`, `tests/scripts/audit-workflow-raw-git.test.cjs`). Bifurcation convention: `tests/` → `node:test`; `sdk/src/__tests__/` → vitest. [VERIFIED: `tests/scripts/audit-workflow-raw-git.test.cjs:21-22`] |
| vitest | ^3.1.1 | Test framework for `sdk/src/vcs/__tests__/` cross-backend test | The CLEANUP-02 cross-backend test lives under `sdk/` per D-15 — vitest required by the directory convention. [VERIFIED: existing `cmd-parallel-cancel-jj.test.ts:29`] |

### Supporting (all already in repo — zero new packages)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `scripts/lib/allowlist-parser.cjs::parseAllowlist` | shared | Per-entry `{path\|glob, reason, owner}` schema-v2 parser | Lint 16.01 imports verbatim: `const { parseAllowlist } = require('./lib/allowlist-parser.cjs')` (cf. `lint-vcs-no-raw-git.cjs:23`). Throws on schema violations; returns `{files: Set<string>, globRegexes: RegExp[]}`. [VERIFIED: file read] |
| `scripts/audit-workflow-raw-git.cjs` regex constants | shared (require + reuse) | `FENCE_OPEN = /^\s*(```+\|~~~+)\s*(bash\|sh\|zsh)\b/i` + `FENCE_CLOSE = /^\s*(```+\|~~~+)\s*$/` | Lint 16.01 reuses these constants — either by `require()`-importing the audit module (it exports `SHELL_GIT_RE`, `BASELINE`, `scanFile`, `findMarkdown` per `audit-workflow-raw-git.cjs:241-249`) and rebuilding a sibling fence-aware walker, OR by duplicating the constants verbatim with a comment cross-reference. CF-06 mandates ONE source of truth. Recommend: duplicate the constants verbatim with comment `// Byte-identical to scripts/audit-workflow-raw-git.cjs:48` (mirrors `audit-workflow-raw-git.cjs:42-44` self-precedent: "Reuse the production lint's start-of-statement detection verbatim … Byte-identical on purpose"). [VERIFIED: `audit-workflow-raw-git.cjs:42-49`] |
| `sdk/src/vcs/jj/workspace-cleanup.ts::cleanupSubagentWorkspaces` | locked Phase 15.04 | Per-workspace `jj workspace forget` + `rmSync` body | CLEANUP-02 imports + calls this from two new consumer sites. Signature locked: `(mainRepoRoot: string, phaseNumber: number, workspaces?: readonly { name: string; path: string }[]): CleanupSubagentWorkspacesResult`. Idempotent by D-03/D-06 contract. [VERIFIED: file read at `:134`] |
| `sdk/src/query/workspace-parallel-cancel.ts` (precedent only) | shipped Phase 15.04 | Three-site registration template for the new bridge | The new `cleanup-subagent-workspaces.ts` bridge mirrors this file's argv-parsing shape and three-site registration pattern verbatim. [VERIFIED: file read] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:fs`/`node:path` built-ins | shelljs / globby / micromatch | Adds an npm dependency for trivial walking. Rejected by `feedback_solo_dev_no_expires` posture + existing `audit-workflow-raw-git.cjs:39-40` precedent. |
| Duplicating `FENCE_OPEN` / `FENCE_CLOSE` constants | Extracting to `scripts/lib/fence-walker.cjs` | Premature shared-lib extraction; v1.4 OOS clause: "Do NOT extract a shared 'fence-aware walker' — premature abstraction; two consumers do not justify a third file." [CITED: REQUIREMENTS.md §Out of Scope L92] |
| Heading-based pairing detection | Fence-content substring scan | Empirically falsified — section-scoped pairing fires on canonical `execute-phase.md` (dispatch under `## 3. Spawn executors`, fan-in under `## 5.5 Workspace fan-in`). [CITED: CONTEXT.md D-01 rationale] |
| Helper extraction to `scripts/lib/` shared module | Inline regex constants | Per v1.4 §Out of Scope ("Do NOT extract a shared 'fence-aware walker'"); CF-06 mandates duplication-with-comment instead. [CITED: REQUIREMENTS.md §Out of Scope L92] |
| Sharing CI step with `audit-workflow-raw-git.cjs` in one combined step | Separate adjacent CI step | The two scripts have different exit semantics (audit is baseline-regression; lint is default-deny); separate steps give clearer failure attribution. CF-05 mandates "adjacent" not "combined." |
| Promoting the lint to `npm pretest` | CI-only via `parallel-e2e.yml` | OOS per CF-05; matches `audit-workflow-raw-git.cjs` D-07 CI-only precedent. |

**Installation:**

```bash
# No installs. All dependencies already in repo:
# - node:fs, node:path, node:test, node:assert (built-in)
# - vitest (already in sdk/ package.json)
# - scripts/lib/allowlist-parser.cjs (already exists)
# - scripts/audit-workflow-raw-git.cjs (already exists; CF-06 reuse)
# - sdk/src/vcs/jj/workspace-cleanup.ts (already exists; Phase 15.04)
# - sdk/src/query/workspace-parallel-cancel.ts (already exists; bridge precedent)
```

**Version verification:**

| Package | Version | Verified via | Date |
|---------|---------|--------------|------|
| Node.js | v25.9.0 | `node --version` | 2026-05-24 |
| vitest | ^3.1.1 | `sdk/package.json` (carried from Phase 15) | 2026-05-24 |
| `scripts/lib/allowlist-parser.cjs` | schema v2 | Read directly | 2026-05-24 |
| `cleanupSubagentWorkspaces` | locked 3-arg form | Read at `sdk/src/vcs/jj/workspace-cleanup.ts:134` | 2026-05-24 |

## Package Legitimacy Audit

**N/A — Phase 16 installs ZERO external packages.** All dependencies are repo-internal modules and Node.js built-ins. The Package Legitimacy Gate protocol does not apply.

For completeness:

| Package | Registry | Disposition |
|---------|----------|-------------|
| (none) | — | Phase 16 ships pure-Node code using already-installed deps + repo-internal modules |

## Architecture Patterns

### System Architecture Diagram

```
                        ┌────────────────────────────────────────────────┐
                        │              Phase 16 Deliverables             │
                        └────────────────────────────────────────────────┘
                                          │
              ┌───────────────────────────┴───────────────────────────┐
              ▼                                                       ▼
    ┌─────────────────────┐                              ┌──────────────────────┐
    │  Plan 16.01 (LINT-06)│                              │ Plan 16.02 (CLEANUP-02)│
    │  Workflow CI lint    │                              │  Orphan-dir reap      │
    └─────────────────────┘                              └──────────────────────┘
              │                                                       │
              ▼                                                       ▼
    ┌─────────────────────┐                              ┌─────────────────────┐
    │ scripts/lint-vcs-   │                              │ Two NEW consumer     │
    │ parallel-call-      │                              │ sites for the locked │
    │ presence.cjs (NEW)  │                              │ helper:              │
    └─────────────────────┘                              └─────────────────────┘
              │                                                       │
    ┌─────────┴──────────┐                                ┌───────────┴────────┐
    ▼                    ▼                                ▼                    ▼
┌──────────┐    ┌────────────────┐               ┌──────────────────┐  ┌──────────────────┐
│ Per-entry│    │ Fence-aware    │               │ TS-direct call:  │  │ CLI bridge hop:  │
│ allowlist│    │ markdown walker│               │ performJjParallel│  │ scripts/dogfood- │
│ via      │    │ (FENCE_OPEN /  │               │ FanIn clean-path │  │ restore.sh (END  │
│ lib/     │    │ FENCE_CLOSE    │               │ (else branch     │  │ of script, D-11) │
│ allowlist│    │ regex shared   │               │ after if-        │  │                  │
│ -parser  │    │ with audit-    │               │ conflicted)      │  │ Trap with WARN   │
│ .cjs)    │    │ workflow-raw-  │               │                  │  │ continue exit 0  │
│          │    │ git.cjs)       │               │ Direct: handle.  │  │ (D-12)           │
│          │    │                │               │ workspaces []    │  │                  │
│          │    │ FILE-level     │               │ → helper         │  │ Bridge: NEW      │
│          │    │ pairing scope  │               │                  │  │ sdk/src/query/   │
│          │    │ (D-01)         │               │ NOT via CLI      │  │ cleanup-         │
│          │    │                │               │ bridge (TS only) │  │ subagent-        │
│          │    │                │               │                  │  │ workspaces.ts    │
│          │    │                │               │                  │  │ (NEW, --phase N  │
│          │    │                │               │                  │  │ + --all-phases   │
│          │    │                │               │                  │  │ mutually excl)   │
└──────────┘    └────────────────┘               └──────────────────┘  └──────────────────┘
        │              │                                  │                      │
        └──────┬───────┘                                  └───────────┬──────────┘
               ▼                                                      ▼
    ┌─────────────────────────────┐               ┌─────────────────────────────────┐
    │ Lint exits 0 (paired) or    │               │  sdk/src/vcs/jj/workspace-      │
    │ exits 1 (unpaired) →        │               │  cleanup.ts::cleanup            │
    │ CI step in parallel-e2e.yml │               │  SubagentWorkspaces             │
    │ adjacent to audit-workflow- │               │  (LOCKED Phase 15.04, idem-     │
    │ raw-git.cjs CI-06           │               │  potent per D-03/D-06)          │
    └─────────────────────────────┘               └─────────────────────────────────┘
                                                                   │
                                          ┌────────────────────────┴────────────────┐
                                          ▼                                         ▼
                                ┌──────────────────┐                     ┌───────────────────┐
                                │ jj workspace     │                     │ rmSync(ws.path,   │
                                │ forget --        │                     │ {recursive: true, │
                                │ <name>           │                     │ force: true})     │
                                │ (best-effort     │                     │ (gated on         │
                                │ soft-fail)       │                     │ existsSync)       │
                                └──────────────────┘                     └───────────────────┘

CONFLICTED branch (LEFT UNCHANGED per CF-03 / AP-5):
   ┌─────────────────────────────────────────────────────────┐
   │ performJjParallelFanIn / if (conflicted) {…}            │
   │ ─────────────────────────────────────────────────────── │
   │ Workspaces PRESERVED on disk for human inspection.      │
   │ W3 (a) joint-assertion contract — DO NOT TOUCH.         │
   │ Documented inline at the code site per ROADMAP SC4.     │
   └─────────────────────────────────────────────────────────┘
```

**Reader walk-through:** A CI run hits the new lint step → walks `get-shit-done/workflows/*.md` → detects per-file pairing of `workspace.parallel.dispatch` ↔ `workspace.parallel.fan-in` in bash/sh/zsh fences → exits 0 (paired) or 1 (unpaired). Independently, an `Agent()` wave executes → fanIn merges N parents → clean-path branch calls `cleanupSubagentWorkspaces` directly with `handle.workspaces` → helper forgets each workspace + rm's the dir. If a `jj op restore` ever rolls things back, `dogfood-restore.sh` calls the new CLI bridge in `--all-phases` mode at the END of restoration → bridge enumerates `.claude/jj-workspaces/`, derives phase numbers, calls the same helper per phase, returns a merged envelope for the operator-facing diagnostic.

### Recommended Project Structure

```
scripts/
├── lint-vcs-parallel-call-presence.cjs        # NEW (Plan 16.01) — mirrors lint-vcs-no-raw-git.cjs shape
├── lint-vcs-parallel-call-presence.allow.json # NEW (Plan 16.01) — schema-v2, entries: []
├── lint-vcs-no-raw-git.cjs                    # EXISTING — reference shape
├── audit-workflow-raw-git.cjs                 # EXISTING — fence walker source (CF-06 reuse via constant duplication)
├── lib/
│   ├── allowlist-parser.cjs                   # EXISTING — consumed verbatim
│   └── glob-to-regex.cjs                      # EXISTING — transitively consumed via parser
└── dogfood-restore.sh                         # EXISTING — gains D-11/D-12/D-13 cleanup step at END

sdk/src/
├── vcs/jj/
│   ├── parallel.ts                            # EXISTING — clean-path branch gains direct cleanupSubagentWorkspaces call
│   ├── workspace-cleanup.ts                   # EXISTING (Phase 15.04, locked) — D-17 adds 1-line CONTEXT cross-reference
│   └── octopus.ts                             # EXISTING — workspace path canonical reference
├── query/
│   ├── cleanup-subagent-workspaces.ts         # NEW (Plan 16.02) — CLI bridge for bash consumer
│   ├── workspace-parallel-cancel.ts           # EXISTING — bridge precedent (mirror verbatim)
│   ├── command-static-catalog-domain.ts       # EXISTING — registration site 1
│   ├── command-manifest.non-family.ts         # EXISTING — registration site 2
│   └── command-aliases.generated.ts           # EXISTING — registration site 3 (regenerable)
└── vcs/__tests__/
    └── (cross-backend fanIn-no-orphan test)   # NEW (Plan 16.02, D-15)

tests/
├── scripts/
│   ├── lint-vcs-parallel-call-presence.test.cjs   # NEW (Plan 16.01, D-14)
│   ├── allowlist-parser.test.cjs                  # EXISTING — node:test shape precedent
│   └── audit-workflow-raw-git.test.cjs            # EXISTING — node:test + mkdtemp Pattern B precedent
└── lint-vcs-no-raw-git-fixture.test.cjs           # EXISTING — Pattern B + --scan-root precedent

.github/workflows/
└── parallel-e2e.yml                           # EXISTING — gains new step adjacent to CI-06 audit (line 125-127)
```

### Pattern 1: Default-deny lint with per-entry allowlist (mirrors `lint-vcs-no-raw-git.cjs`)

**What:** A Node.js script under `scripts/` that walks markdown files, applies a fence-aware scanner, checks a per-file `{path|glob, reason, owner}` allowlist (parsed via `scripts/lib/allowlist-parser.cjs`), and exits 1 on violation with file:line diagnostics on stderr.

**When to use:** Whenever you need a CI gate over workflow markdown or source files. Always default-deny with an explicit allowlist (NEVER warn-only mode per Pitfall 4 / Pitfall 12 / `feedback_solo_dev_no_expires`).

**Example:**

```javascript
// Source: scripts/lint-vcs-no-raw-git.cjs (cited file:line references below)
#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseAllowlist } = require('./lib/allowlist-parser.cjs');

// (Reuse audit-workflow-raw-git.cjs constants verbatim — CF-06.)
// Byte-identical to scripts/audit-workflow-raw-git.cjs:48-49.
const FENCE_OPEN = /^\s*(```+|~~~+)\s*(bash|sh|zsh)\b/i;
const FENCE_CLOSE = /^\s*(```+|~~~+)\s*$/;
const SCAN_ROOTS = ['get-shit-done/workflows'];  // narrower than audit — D-03

// Content-driven literal substring detection (CF-04). NO regex anchors needed
// because the fence walker scopes to bash content.
const PARALLEL_DISPATCH_RE = /workspace\.parallel\.dispatch/;
const PARALLEL_FAN_IN_RE = /workspace\.parallel\.fan-in/;  // hyphenated per execute-phase.md:775 literal

function parseArgv(argv) {
  const out = { scanRoot: null };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--scan-root' && argv[i + 1]) { out.scanRoot = argv[i + 1]; i += 1; }
  }
  return out;
}

const ARGV = parseArgv(process.argv);
const REPO_ROOT = path.resolve(__dirname, '..');
const SCAN_ROOT = ARGV.scanRoot ? path.resolve(ARGV.scanRoot) : REPO_ROOT;

const ALLOW = parseAllowlist(
  require('./lint-vcs-parallel-call-presence.allow.json'),
  'lint-vcs-parallel-call-presence',
);

// Walk markdown, scan fences, track per-file dispatch/fan-in literal presence.
// FILE-level pairing per D-01: file with dispatch literal in any fence MUST
// also have fan-in literal in some fence (and vice versa).
function scanFile(absPath, scanRoot) {
  const rel = path.relative(scanRoot, absPath).split(path.sep).join('/');
  const lines = fs.readFileSync(absPath, 'utf8').split('\n');
  let inFence = false;
  let hasDispatch = false;
  let hasFanIn = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!inFence && FENCE_OPEN.test(line)) { inFence = true; continue; }
    if (inFence && FENCE_CLOSE.test(line)) { inFence = false; continue; }
    if (!inFence) continue;
    if (/^\s*#/.test(line)) continue;  // shell comment
    if (PARALLEL_DISPATCH_RE.test(line)) hasDispatch = true;
    if (PARALLEL_FAN_IN_RE.test(line)) hasFanIn = true;
  }
  return { path: rel, hasDispatch, hasFanIn };
}

// Per-file violation report — diagnostic anchored at line 1 (file-scoped).
// ... (full body would emit stderr per lint-vcs-no-raw-git.cjs:151-164 pattern)
```

[CITED: `scripts/lint-vcs-no-raw-git.cjs:32-50, 142-164`]

### Pattern 2: Sidecar TS-direct call from `performJjParallelFanIn` clean-path

**What:** Inside `sdk/src/vcs/jj/parallel.ts`, the existing clean-path branch (the `else` after `if (conflicted)`, currently at lines 411-461) gains a direct synchronous call to `cleanupSubagentWorkspaces(mainRepoRoot, handle.phaseNumber, handle.workspaces)`. Result envelope is destructured into `failedReaped[]` for the FanInResult.

**When to use:** Any time fanIn clean-path completes successfully. NEVER on the conflicted branch (CF-03 / AP-5 / W3 (a) joint-assertion contract — workspaces preserved for inspection).

**Example:**

```typescript
// Source: sdk/src/vcs/jj/parallel.ts clean-path branch (lines 411-461)
// New addition would go AFTER the existing merged.push(mergeChangeId) at L460.

import { cleanupSubagentWorkspaces } from './workspace-cleanup.js';  // already imported at L67

// ... existing clean-path body — bookmark advance, merge, etc.

if (conflicted) {
  // CF-03 / AP-5 / W3 (a): UNCHANGED. Workspaces preserved on disk.
  // Inline comment cross-reference per ROADMAP SC4.
  // ...
} else {
  // ... existing clean-path body (bookmark advance + merged.push)
  merged.push(mergeChangeId);

  // CLEANUP-02 / D-07: tear down materialized subagent workspaces on the
  // clean path. Handle.workspaces is the authoritative source-of-truth
  // (Pitfall 4 mitigation). Direct TS-side call (NOT via CLI bridge —
  // bridge is for bash consumers only).
  const { failedReaped: cleanupFailedReaped } = cleanupSubagentWorkspaces(
    mainRepoRoot,
    handle.phaseNumber,
    handle.workspaces,
  );
  for (const name of cleanupFailedReaped) failedReaped.push(name);
}
```

[CITED: `sdk/src/vcs/jj/parallel.ts:67, 289-510`; `workspace-cleanup.ts:134`]

### Pattern 3: Three-site CLI bridge registration (mirrors `workspace-parallel-cancel.ts`)

**What:** A new CLI bridge module at `sdk/src/query/cleanup-subagent-workspaces.ts` exposes the helper to bash consumers. Three-site registration is load-bearing for runtime verb resolution (missing any one site breaks the verb at runtime per Phase 11 plan 02 audit; CF-02 cites this precedent).

**When to use:** Every new SDK CLI verb. The cancel bridge ships in Phase 15.04; this pattern is exactly the same.

**Example:**

```typescript
// Source: sdk/src/query/workspace-parallel-cancel.ts (mirror verbatim)
// New file: sdk/src/query/cleanup-subagent-workspaces.ts

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createVcsAdapter } from '../vcs/index.js';
import type { QueryHandler } from './utils.js';

// D-04: explicit --phase N AND --all-phases (mutually exclusive). Mutual-
// exclusion check rejects --phase 16 --all-phases early. Inline argv walk —
// VERIFIED: sdk/src/query/cli/ does NOT exist, so no shared argv parser is
// available; mirror workspace-parallel-cancel.ts:58-64 inline loop.
export const cleanupSubagentWorkspacesQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let phase: number | undefined;
  let allPhases = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) { cwd = args[++i]; }
    else if (args[i] === '--phase' && args[i + 1]) { phase = Number(args[++i]); }
    else if (args[i] === '--all-phases') { allPhases = true; }
  }
  if (phase !== undefined && allPhases) {
    return { data: { ok: false, reason: 'phase_and_all_phases_mutually_exclusive' } };
  }
  if (phase === undefined && !allPhases) {
    return { data: { ok: false, reason: 'phase_or_all_phases_required' } };
  }

  const vcs = createVcsAdapter(cwd);
  // ... call helper directly OR (if --all-phases) enumerate phases first.
  // D-05: --all-phases enumerates .claude/jj-workspaces/ via readdirSync,
  // filters via /^phase-(\d+)-subagent-\d+$/, merges per-phase results to
  // a single {abandoned, failedReaped} envelope (D-06).
};
```

**Three-site registration** (cf. `workspace-parallel-cancel.ts:23` self-documentation):
1. `sdk/src/query/command-static-catalog-domain.ts` — add `import { cleanupSubagentWorkspacesQuery } from './cleanup-subagent-workspaces.js';` + two map entries (dot form + space-alias form).
2. `sdk/src/query/command-manifest.non-family.ts` — add an entry `{ canonical: 'cleanup-subagent-workspaces', aliases: [], mutation: true, outputMode: 'json' }` (verb is a mutation; envelope shape is JSON).
3. `sdk/src/query/command-aliases.generated.ts` — add `{ canonical: 'cleanup-subagent-workspaces', aliases: [], mutation: true }` (this file is generated; regeneration step lives in the build pipeline — confirm during planning whether manual edit or regeneration is expected; the cancel verb is present at line 156 so generated content is in sync today).

[CITED: `sdk/src/query/workspace-parallel-cancel.ts:1-89, 20-27`; `command-static-catalog-domain.ts:23,78-79`; `command-manifest.non-family.ts:63`; `command-aliases.generated.ts:156`]

### Pattern 4: Fixture-based unit test with `mkdtemp` + `--scan-root` (Pattern B)

**What:** Each test creates its own random-prefix `mkdtempSync` tree, materializes synthetic markdown files, invokes the lint script via `spawnSync` with `--scan-root <tmpdir>`, asserts the exit code + stderr output, and cleans up via `rmSync` in `finally`. No shared fixture state, no flake budget, no suite-level disabling. This pattern is shipped + canonical at `tests/lint-vcs-no-raw-git-fixture.test.cjs` and `tests/scripts/audit-workflow-raw-git.test.cjs`.

**When to use:** All `node:test` lint fixture tests under `tests/scripts/` (the Phase 13 plan 02 "Pattern B / TEST-16 / Pitfall 9" convention).

**Example:**

```javascript
// Source: tests/lint-vcs-no-raw-git-fixture.test.cjs:36-54 (mirror exactly)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'lint-vcs-parallel-call-presence.cjs');

test('paired dispatch + fan-in literals in separate fences → exit 0', () => {
  const fixDir = fs.mkdtempSync(path.join(os.tmpdir(), '__lint-fixture-parallel-'));
  const wfDir = path.join(fixDir, 'get-shit-done', 'workflows');
  fs.mkdirSync(wfDir, { recursive: true });
  fs.writeFileSync(path.join(wfDir, 'paired.md'),
    '# Workflow\n\n## Dispatch step\n```bash\ngsd-sdk query workspace.parallel.dispatch\n```\n\n' +
    '## Fan-in step\n```bash\ngsd-sdk query workspace.parallel.fan-in\n```\n'
  );
  try {
    const r = spawnSync(process.execPath, [SCRIPT, '--scan-root', fixDir], { encoding: 'utf-8' });
    assert.equal(r.status, 0, 'expected exit 0 but got ' + r.status + '\nstderr: ' + r.stderr);
  } finally {
    fs.rmSync(fixDir, { recursive: true, force: true });
  }
});
```

D-14 mandates 5 scenarios:
1. paired-fan-in-and-dispatch passes (positive, separate fences per D-01)
2. dispatch-only fence fails (negative)
3. fan-in-only fence fails (negative)
4. prose-only mention of "wave"/"parallel" in non-fence section passes (Pitfall 7 false-positive guard)
5. allowlist entry suppresses a known-opt-out file (D-08 schema verification — entry is `{path, reason, owner}`)

[CITED: `tests/lint-vcs-no-raw-git-fixture.test.cjs:36-54`; CONTEXT.md D-14]

### Pattern 5: New CI step adjacent to existing audit step

**What:** A new `.github/workflows/parallel-e2e.yml` step lands adjacent to the existing `audit-workflow-raw-git.cjs` step (line 125-127). Both are blocking on the jj-colocated cell via `parallel-e2e-gate` (no separate gate needed per CF-05). The `paths:` filter at line 36-42 may need an additional entry — confirm during planning whether `scripts/lint-vcs-parallel-call-presence.cjs` needs explicit path-filter coverage to gate the workflow on lint-only changes (recommendation: yes, mirror the `scripts/audit-workflow-raw-git.cjs` path entry at line 40).

**When to use:** Phase 16 plan 16.01 only.

**Example:**

```yaml
# Source: .github/workflows/parallel-e2e.yml (insert after line 127 audit step)
      # NEW: Lint — workflow call-presence (LINT-06 / Plan 16.01)
      - name: Lint — workflow call-presence (LINT-06)
        shell: bash
        run: node scripts/lint-vcs-parallel-call-presence.cjs

# paths-filter addition at line 40 (insert alongside audit entry):
#       - 'scripts/audit-workflow-raw-git.cjs'
#       - 'scripts/lint-vcs-parallel-call-presence.cjs'  # NEW
```

[CITED: `.github/workflows/parallel-e2e.yml:125-127, 36-42`]

### Pattern 6: dogfood-restore.sh post-restore CLI-bridge invocation

**What:** Bash script appends a final cleanup step AFTER the existing `tar -xf` + diagnostic echo (D-11). Bridge invocation trapped with `|| echo "WARN: orphan cleanup failed" >&2` and continues with exit 0 (D-12). A second diagnostic echo fires AFTER, with the merged envelope's counts (D-13).

**When to use:** Plan 16.02 only.

**Example:**

```bash
# Source: scripts/dogfood-restore.sh:55-61 (current state — append at END)

echo "dogfood-restore: extracting ${TARBALL_PATH}" >&2
tar -xf "$TARBALL_PATH" -C .

echo "dogfood-restore: complete. Verify with: jj diff --summary && jj log -r '@-..@' --no-graph" >&2

# NEW (Plan 16.02 / D-11/D-12/D-13): post-restore orphan-workspace cleanup.
# Idempotent — re-invoking on a clean tree returns {abandoned:[], failedReaped:[]}.
# Trap with WARN so a cleanup-only miss does not flag "restore failed"
# (op-restore + tar both succeeded).
CLEANUP_JSON=$(gsd-sdk query cleanup-subagent-workspaces --all-phases 2>&1 \
  || { echo "WARN: orphan cleanup failed" >&2; echo '{"abandoned":[],"failedReaped":[]}'; })
ABANDONED_COUNT=$(echo "$CLEANUP_JSON" | jq -r '.abandoned | length' 2>/dev/null || echo "?")
FAILED_COUNT=$(echo "$CLEANUP_JSON" | jq -r '.failedReaped | length' 2>/dev/null || echo "?")
echo "dogfood-restore: orphan-workspace cleanup complete (abandoned=${ABANDONED_COUNT}, failedReaped=${FAILED_COUNT})" >&2
```

[CITED: `scripts/dogfood-restore.sh:55-61`; CONTEXT.md D-11/D-12/D-13]

### Anti-Patterns to Avoid

- **Heading-based pairing scope (Anti-Pattern; Pitfall 7 path 2):** Pairing dispatch ↔ fan-in within the same `##`/`###` section. Empirically falsified on `execute-phase.md` — would fire on the canonical correct workflow. Use FILE-level scope per D-01.
- **SAME-FENCE pairing (Anti-Pattern; Pitfall 7 path D):** Require both literals in one shell fence. Empirically falsified — would force inlining the wait-for-`Agent()` lifecycle into a single bash block, breaking the orchestrator-rule pattern.
- **Touching the conflicted branch in `performJjParallelFanIn` (CRITICAL ANTI-PATTERN; AP-5 / CF-03):** The conflicted branch preserves workspaces on disk for human inspection per W3 (a) joint-assertion contract. ANY edit on the conflicted branch violates the locked contract. Add an inline comment at the conflicted-branch site documenting the cleanup-omission as intentional.
- **Pushing `phase_or_all_phases_required` errors to stdout instead of envelope (Anti-Pattern):** CLI bridges return structured envelopes (`{ok: false, reason: '...'}`) not bare process.exit(1). Mirror `workspace-parallel-cancel.ts:66-68` precedent.
- **`npm install`-ing a fence walker library (Anti-Pattern):** Don't introduce remark, micromark, mdast-util-from-markdown, or similar. The regex pair shipped in `audit-workflow-raw-git.cjs:48-49` is sufficient for the 103 in-repo workflow .md files. Per `feedback_solo_dev_no_expires` posture + REQUIREMENTS.md §Out of Scope L92.
- **Promoting the lint to `npm pretest` (Anti-Pattern; CF-05):** Forces every test run to scan workflow markdown. Lint stays in `parallel-e2e.yml` only per audit-workflow-raw-git.cjs D-07 precedent.
- **Inline duplication of cleanup body across 3 consumers (Anti-Pattern; Pitfall 11):** Single owner = `cleanupSubagentWorkspaces` helper. The fanIn clean-path branch (D-07) calls the helper DIRECTLY (not inline rm/forget); the dogfood-restore.sh consumer calls via the CLI bridge. NO drift between three sites.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-entry allowlist with `{path\|glob, reason, owner}` schema | A new parser | `scripts/lib/allowlist-parser.cjs::parseAllowlist` (verbatim import) | Schema validation already handles missing-fields throw, path+glob exclusion throw, owner+reason required-field enforcement. [VERIFIED: file read] |
| Fence-aware markdown walker | A new regex | `audit-workflow-raw-git.cjs:48-49` `FENCE_OPEN` + `FENCE_CLOSE` constants (duplicate verbatim with comment cross-reference per CF-06) | Both the audit and the lint must agree on what counts as a fence; v1.2-style "audit + lint regex surface" coverage gap is prevented by shared source. [VERIFIED: file read; per CONTEXT CF-06] |
| Glob → RegExp compiler | A new glob library | `scripts/lib/glob-to-regex.cjs` (transitively consumed via `allowlist-parser.cjs`) | Already extracted in Phase 8 plan 03. [VERIFIED: `allowlist-parser.cjs:30`] |
| Per-workspace `jj workspace forget + rmSync` body | A new sidecar | `sdk/src/vcs/jj/workspace-cleanup.ts::cleanupSubagentWorkspaces` (LOCKED Phase 15.04, 3-arg signature) | Single owner per IP-5; idempotent per D-03/D-06. Inline duplication = three-way drift surface. [VERIFIED: file read] |
| `.claude/jj-workspaces/` workspace name regex | A new regex | `^phase-(\d+)-subagent-\d+$` (already canonical per `octopus.ts:300`) | The canonical workspace name format is set at dispatch by `createSubagentSlot`. Any other regex would silently miss or over-match. [VERIFIED: `octopus.ts:300`] |
| Custom argv parser for the new CLI bridge | A new helper | Inline `for (let i = 0; i < args.length; i++)` walk (mirrors `workspace-parallel-cancel.ts:58-64` precedent) | `sdk/src/query/cli/argv.ts` does NOT exist — verified via `find` returning empty. No shared argv parser is available in the SDK today; bridges all use inline argv walks. [VERIFIED via Bash find] |
| `--all-phases` enumeration logic | A library | `readdirSync(.claude/jj-workspaces) → filter by regex` (D-05) | 6 lines of `node:fs` + `RegExp.test`. No library needed. |
| Per-phase results merging | A helper | Inline arrays concat (D-06: single merged envelope) | Two `.concat()` calls. No library needed. |
| Custom commit hook to trigger the lint | A `.githooks/` entry | CI-only via `parallel-e2e.yml` (CF-05) | Pretest hook adds latency without value; audit-workflow-raw-git.cjs D-07 is the precedent. |

**Key insight:** Phase 16 is pure wiring of locked contracts. There is no algorithmic design space left — every regex, every helper signature, every test pattern, every script placement is already canonical somewhere in the repo. The planner's job is to identify the exact files to modify and the exact byte-level inserts to add; the executor's job is to mirror existing precedents verbatim. ZERO new shared lib modules; ZERO new npm dependencies.

## Runtime State Inventory

> Phase 16 is NOT a rename/refactor phase, but CLEANUP-02 explicitly addresses *runtime state* — the orphan FS directories that live OUTSIDE jj's content-addressed view. The Inventory table below documents the in-scope and out-of-scope state surfaces.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `.claude/jj-workspaces/phase-{NN}-subagent-{idx}/` directories — created by `createSubagentSlot` (`octopus.ts:302`) per dispatch; persist on disk across fanIn unless explicitly reaped. | CLEANUP-02 plan 16.02 reaps via `cleanupSubagentWorkspaces` helper on the fanIn clean-path branch AND via the dogfood-restore.sh CLI-bridge invocation. **Data migration:** none — these are ephemeral by contract per `project_ephemeral_subagent_workspaces` memory. **Code edit:** YES — two new consumer sites for the locked helper. |
| Live service config | None — no external services. | None. |
| OS-registered state | None — no Task Scheduler / launchd / systemd entries. | None. |
| Secrets and env vars | `GSD_VCS`, `GSD_SDK`, `GSD_E2E_BACKEND` referenced by CI workflow — unchanged. | None. |
| Build artifacts / installed packages | `sdk/dist/` after `pnpm run build:sdk` — the new CLI bridge `cleanup-subagent-workspaces.ts` will compile into `sdk/dist/`; downstream consumers (dogfood-restore.sh via `gsd-sdk query`) read from the dist path. | Reinstall + rebuild after CLI bridge ships (`pnpm run build:sdk` already runs in `pretest` per `package.json:65`). |

**Nothing found in category:** Live service config, OS-registered state, and secrets are not in scope for Phase 16 — verified by reading `.planning/PROJECT.md` and `.planning/STATE.md` (no v1.4 entries mention these surfaces).

## Common Pitfalls

(From `.planning/research/PITFALLS.md` — every pitfall flagged for Phase 16 is reproduced here in summary form; the planner consumes both this section and the source PITFALLS.md for verification step authoring.)

### Pitfall 1: Pitfall 7 — Workflow call-presence lint false-positives on prose-only workflows

**What goes wrong:** A naive grep-based lint would fire on 26 workflow .md files that mention "wave"/"parallel"/"Task(" only in prose. Empirically: 28 workflows mention these terms in prose, but only 2 (`execute-phase.md`, `quick.md`) contain the literal substrings `workspace.parallel.dispatch` / `workspace.parallel.fan-in` in shell fences. [VERIFIED via `grep -lr ... | wc -l` returning 28 vs `grep -nc ...` returning only 2 files with the literals.]

**Why it happens:** Workflow markdown is mixed prose + executable bash fences; "parallel" appears in both. A heuristic-based scope rule cannot distinguish.

**How to avoid:**
- **Define lint scope by SHELL FENCE, not by prose mention** (CF-04 / CF-06 — reuse `audit-workflow-raw-git.cjs:48-49` `FENCE_OPEN` regex; share by constant duplication per Out of Scope L92 forbidding shared-lib extraction).
- **FILE-level pairing** (D-01) — bidirectional; file with dispatch literal in any fence MUST have fan-in literal in some fence (and vice versa).
- **Per-entry allowlist** as escape hatch for legitimate edge cases (D-08 ships empty `entries: []` initially; no speculative seeding).

**Warning signs:**
- Lint fires on `code-review.md`, `audit-fix.md`, or similar prose-only workflows.
- Lint regex is at top-level (not fence-aware).
- Lint scope is "all workflows" rather than "workflows that dispatch."

### Pitfall 2: AP-5 — Touching the `performJjParallelFanIn` conflicted branch

**What goes wrong:** The conflicted branch preserves workspaces on disk for human inspection per W3 (a) joint-assertion contract. Reaping on the conflicted branch would force operators to re-materialize the conflict state from `jj op restore` before they can inspect it — defeating the joint-assertion contract.

**Why it happens:** Symmetry temptation — "if the clean path reaps, the conflicted path should too." But the contracts diverge by design.

**How to avoid:**
- **Add the cleanup call ONLY in the `else` branch after `if (conflicted)` at `parallel.ts:411-461`.**
- **Add an inline comment at the conflicted branch site at `parallel.ts:394-410`** documenting the cleanup-omission as intentional (cite CF-03 + ROADMAP SC4).
- **Test coverage:** D-15 includes a conflicted-fanIn scenario that asserts `existsSync(ws.path) === true` post-fanIn on the conflicted branch (mirror `cmd-parallel-jj.test.ts:225-329` "conflicted scenario" describe block).

**Warning signs:**
- Code review shows `rmSync` or `cleanupSubagentWorkspaces` call anywhere inside the `if (conflicted)` block.
- Test fixture asserts dir-gone post-conflicted-fanIn.

### Pitfall 3: Pitfall 11 — Inline duplication of cleanup body across the 3 consumers

**What goes wrong:** If the cleanup body (jj workspace forget + rmSync) is inlined into (a) the fanIn clean-path branch, (b) the cancel verb body, and (c) the dogfood-restore.sh consumer, a bug fix needs three commits and easily drifts. v1.2 retro precedent: the lint regex tightening had to touch 3 sites; one site missed for 2 commits.

**Why it happens:** Each consumer "just inlines the 5-line body" because the helper feels heavy.

**How to avoid:**
- **Single owner per IP-5:** `cleanupSubagentWorkspaces(mainRepoRoot, phaseNumber, workspaces?)` at `sdk/src/vcs/jj/workspace-cleanup.ts` (LOCKED Phase 15.04). All three consumers call the helper, NEVER inline.
- **D-07 fanIn clean-path = direct TS call** (handle.workspaces available; cheapest).
- **D-04 dogfood-restore.sh consumer = via CLI bridge** (bash language seam; bridge wraps the `--all-phases` enumeration so the helper signature stays single-phase).

**Warning signs:**
- Any `rmSync(...path...phase-*-subagent-*...)` literal in `parallel.ts`, `dogfood-restore.sh`, or the bridge body (outside the helper).
- Three commits touching the same teardown logic in three files.

### Pitfall 4: Pitfall 1 — Scope creep at plan-phase

**What goes wrong:** Phase 16 has a closed acceptance set: LINT-06 + CLEANUP-02. The lint can be extended into "while we're here" territory: e.g., add a `--auto-fix` mode, or scan `agents/*.md` too, or also enforce that `workspace.parallel.cancel` is paired with `workspace.parallel.dispatch`. CLEANUP-02 can creep: e.g., reap conflicted-branch workspaces too "for completeness."

**Why it happens:** Cleanup milestone has no user-story pushback.

**How to avoid:**
- **Lock the acceptance set at REQUIREMENTS.md L46 (LINT-06) + L17 (CLEANUP-02) — the `## Acceptance criteria` sections are the spec.** Do NOT add bullets at plan-phase.
- **Plan-check rule:** any plan PLAN.md whose `must_haves` count exceeds REQUIREMENTS L17 / L46 acceptance count is in scope-creep territory.

**Warning signs:**
- A 16.01 plan with `must_haves` exceeding 5 ROADMAP SC1 bullets.
- A 16.02 plan that addresses git-side `worktree remove --force` issues (out of scope per `Deferred Ideas`).

### Pitfall 5: Pitfall 2 — `dogfood-restore.sh` ordering invariant violation

**What goes wrong:** D-11 mandates the cleanup step lands LAST in `dogfood-restore.sh` — after `jj op restore` and after `tar -xf`. Inserting the cleanup step BETWEEN `jj op restore` and `tar -xf` would: (a) put the cleanup call into the critical path of recovery (a bridge hang blocks tar extraction); (b) crowd Plan 18.02's future `[ -f .planning/STATE.md ]` precondition; (c) corrupt the Pitfall 2 invariant that tar's content is the authoritative final state.

**Why it happens:** "Post-restore" is ambiguous; some readers parse it as "between" steps.

**How to avoid:**
- **Cleanup step strictly AFTER the existing `tar -xf` + diagnostic echo at `dogfood-restore.sh:58-61`** (D-11).
- **Trap with WARN, exit 0** (D-12) — cleanup is recovery hygiene, NOT blocking.

**Warning signs:**
- Cleanup invocation between lines 56 (`jj op restore`) and 59 (`tar -xf`).
- Cleanup invocation NOT trapped (`set -euo pipefail` halts on non-zero exit, misleadingly signaling "restore failed").

### Pitfall 6: Three-site bridge registration miss

**What goes wrong:** If the new bridge is registered at only 2 of the 3 sites (static-catalog + manifest + aliases.generated), runtime resolution fails with a confusing "verb not found" error. Phase 11 plan 02 documented this exact failure mode for the original parallel dispatch/fanIn verbs.

**Why it happens:** `command-aliases.generated.ts` carries the "GENERATED FILE" comment at line 2, tempting authors to skip manual edits and rely on regeneration. But the regeneration step may not be wired into the new-verb workflow.

**How to avoid:**
- **Add the verb at all 3 sites manually first**, mirror the cancel verb's land state (catalog L78-79; manifest L63; aliases L156).
- **Confirm regeneration step exists before relying on it** — recommendation: planner reads `command-aliases.generated.ts:1-3` "Source:" comment and verifies the generator can be re-run; if not, treat aliases.generated.ts as a manually-maintained file.
- **Smoke test the verb resolution end-to-end** — a small `tests/cli-cleanup-subagent-workspaces.test.cjs` test invokes `gsd-sdk query cleanup-subagent-workspaces --all-phases` against an empty fixture and asserts non-error exit (mirrors `tests/cli-workspace-parallel-cancel.test.cjs` precedent cited at `workspace-parallel-cancel.ts:25-27`).

**Warning signs:**
- `gsd-sdk query cleanup-subagent-workspaces` returns "verb not found" at runtime despite the TS file existing.
- The smoke test is omitted.

## Code Examples

Verified patterns from authoritative sources (all in-repo; no external citation needed since all targets are repo artifacts read directly):

### LINT-06 — Fence walker structure (mirror)

```javascript
// Source: scripts/audit-workflow-raw-git.cjs:114-130 (the per-file fence scanner)
function scanFile(absPath, repoRoot) {
  const rel = path.relative(repoRoot, absPath).split(path.sep).join('/');
  const lines = fs.readFileSync(absPath, 'utf8').split('\n');
  const hits = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!inFence && FENCE_OPEN.test(line)) { inFence = true; continue; }
    if (inFence && FENCE_CLOSE.test(line)) { inFence = false; continue; }
    if (!inFence) continue;
    if (/^\s*#/.test(line)) continue; // shell comment — skip
    if (SHELL_GIT_RE.test(line)) {
      hits.push({ line: i + 1, snippet: line.trim().slice(0, 200) });
    }
  }
  return { path: rel, count: hits.length, hits };
}
```

For Plan 16.01, replace `SHELL_GIT_RE.test(line)` with the PARALLEL pair (set per-file booleans `hasDispatch` / `hasFanIn`); after the walk, compute violation = `hasDispatch ^ hasFanIn` (XOR — exactly one literal present indicates an unpaired file).

### CLEANUP-02 — Direct TS call into the helper

```typescript
// Source: sdk/src/vcs/jj/parallel.ts:557-561 (the cancel-verb-side direct call)
const { abandoned, failedReaped } = cleanupSubagentWorkspaces(
  mainRepoRoot,
  handle.phaseNumber,
  handle.workspaces,
);
```

For Plan 16.02's clean-path insertion, mirror this exactly inside the `else` branch at `parallel.ts:411-461` after `merged.push(mergeChangeId)`.

### CLEANUP-02 — CLI bridge skeleton (mirror cancel bridge)

```typescript
// Source: sdk/src/query/workspace-parallel-cancel.ts:54-88 (full handler)
export const workspaceParallelCancelQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let handleRaw: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[++i];
    } else if (args[i] === '--handle' && args[i + 1]) {
      handleRaw = args[++i];
    }
  }

  if (handleRaw === undefined) {
    return { data: { ok: false, reason: 'handle_required' } };
  }

  // ... parse handle, call vcs.workspace.parallel.cancel(handle), return data
};
```

For Plan 16.02's new bridge `cleanup-subagent-workspaces.ts`, swap `--handle` for `--phase N` + `--all-phases` (mutually exclusive per D-04); enumerate `.claude/jj-workspaces/` directly inside the bridge for `--all-phases`; call helper per enumerated phase; merge envelopes per D-06.

### Test — Pattern B mkdtemp + spawnSync + --scan-root

```javascript
// Source: tests/lint-vcs-no-raw-git-fixture.test.cjs:35-54 (the canonical Pattern B test)
test('lint-vcs-no-raw-git exits 1 on a fixture containing execSync("git status")', () => {
  const fixDir = fs.mkdtempSync(path.join(os.tmpdir(), '__lint-fixture-vcs-'));
  const fixFile = path.join(fixDir, 'bad.cjs');
  try {
    fs.writeFileSync(fixFile,
      "const { execSync } = require('child_process');\n" +
      "execSync('git status', { cwd: '.' });\n"
    );
    const r = spawnSync(process.execPath, [SCRIPT, '--scan-root', fixDir], { encoding: 'utf-8' });
    assert.equal(r.status, 1, 'expected exit 1 (violation) but got ' + r.status + '\nstderr: ' + r.stderr);
    assert.match(r.stderr, /lint-vcs-no-raw-git/);
  } finally {
    fs.rmSync(fixDir, { recursive: true, force: true });
  }
});
```

For Plan 16.01 fixture tests (D-14, 5 scenarios), follow this shape verbatim — different fixture content per scenario, same `--scan-root <tmpdir>` invocation pattern.

### Test — Cross-backend fanIn-no-orphan assertion

```typescript
// Source: sdk/src/vcs/__tests__/cmd-parallel-cancel-jj.test.ts:118-121 (post-cleanup existsSync check)
// Post-cancel: both workspace dirs gone.
for (const ws of handle.workspaces) {
  expect(existsSync(ws.path)).toBe(false);
}
```

For Plan 16.02's D-15 test, mirror this assertion AFTER a clean fanIn (NOT cancel) in a new scenario added to `cmd-parallel-jj.test.ts` or a sibling file. The pre-condition check at `cmd-parallel-cancel-jj.test.ts:92-95` (assert `existsSync` true pre-cancel) is the symmetric check for "before fanIn, dirs exist; after clean fanIn, dirs gone."

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual cleanup of `.claude/jj-workspaces/` after dogfood/test cycles | Automatic reap on fanIn clean-path + dogfood-restore.sh post-restore step | Phase 16 (this phase) | Eliminates "disk fills over many dogfood/test cycles" failure mode (Pitfall 11 motivation). |
| Workflow-markdown lint via prose-grep heuristic | Fence-aware scanner with FILE-level pairing | Phase 16 (this phase; mirror of v1.3 `audit-workflow-raw-git.cjs` precedent) | Zero false positives on the 26 prose-only workflow .md files. |
| Inline cleanup body duplicated across consumer sites | Shared `cleanupSubagentWorkspaces` helper (LOCKED Phase 15.04) | Phase 15.04 + Phase 16 consumption | Eliminates the three-way drift surface that v1.2 retro CR-01 identified. |
| Three CLI bridges with custom argv-handling each | Inline argv walk mirroring `workspace-parallel-cancel.ts:58-64` | Phase 15.04 (precedent established) → Phase 16 (mirror) | Pattern is canonical; sigil consistency for `--cwd`, `--phase`, `--all-phases`, etc. |
| `audit-workflow-raw-git.cjs` baseline-regression model | Same model; new lint is DEFAULT-DENY (not baseline-regression) | LINT-06 vs LINT-04 distinction | The audit tracks "no NEW raw-git ADDED"; the new lint tracks "every dispatch-shaped workflow CALLS the adapter verb" — orthogonal invariants per ARCHITECTURE.md L283-289. |

**Deprecated/outdated:**
- `mainBookmark` (singular) on `ParallelDispatchOpts`/`ParallelDispatchHandle` — already renamed to `mainBookmarks?: readonly string[]` (Phase 14.1 PARALLEL-08). Phase 16 doesn't touch this.
- `bookmarks.delete({force:true})` per-subagent cleanup — Phase 11 D-02 retired; jj-side `surplusBookmarks` is `[]` by construction.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `command-aliases.generated.ts` is regenerable from `command-manifest.non-family.ts` by a build step | Pattern 3 (three-site registration) | If regeneration is broken/missing, the file must be hand-edited; missing the manual edit silently breaks runtime verb resolution. Mitigation: planner verifies regeneration command before relying on it; smoke test catches the runtime miss either way. |
| A2 | `gsd-sdk query` is the canonical CLI invocation form in `dogfood-restore.sh` | Pattern 6 (bridge invocation) | If a different invocation form (e.g., fully-qualified `node $PATH/cli.js query …`) is expected by the script's tooling conventions, the literal `gsd-sdk query` may not resolve. Mitigation: per CONTEXT.md §Claude's Discretion, planner picks the form matching the script's existing tooling. |
| A3 | `jq` is available in the dogfood-restore.sh runtime environment | Pattern 6 (count extraction) | If `jq` isn't installed, the diagnostic counts fall back to "?" via the `|| echo "?"` guard. The cleanup itself still works. Risk: low. |
| A4 | The new CLI verb does NOT need a capability-matrix entry at `sdk/src/vcs/backends.ts:75-95` | Standard Stack alternatives | If verb resolution paths require a matrix entry, the verb fails at runtime. Mitigation: planner confirms during planning — the matrix tracks `VcsAdapter` methods, not internal sidecar bridges, so the bridge likely sits outside the matrix; but worth one verification grep. |

## Open Questions

1. **`command-aliases.generated.ts` regeneration mechanism**
   - What we know: the file's line 2 says "GENERATED FILE" with "Source: sdk/src/query/command-manifest.{state,verify,init,phase,phases,validate,roadmap,non-family}.ts"; the cancel verb is present at line 156 (so the generator was run at Phase 15.04 close).
   - What's unclear: the exact regeneration command; whether `pnpm run build:sdk` re-runs it; whether manual hand-edits drift from the generated state.
   - Recommendation: planner runs `grep -r "command-aliases.generated"` in scripts/, `package.json`, and `sdk/vitest.config.ts` to find the regenerator; if found, document the regeneration step in the plan; if NOT found, treat the file as a manually-maintained source-of-truth and edit all 3 sites by hand.

2. **CI `paths-filter` addition for the new lint script**
   - What we know: `.github/workflows/parallel-e2e.yml:36-42` `paths:` filter scopes PR runs to surfaces that can affect parallel-dispatch behavior; `scripts/audit-workflow-raw-git.cjs` is explicitly listed at line 40.
   - What's unclear: whether the new `scripts/lint-vcs-parallel-call-presence.cjs` and `scripts/lint-vcs-parallel-call-presence.allow.json` should be added to the filter (to gate the workflow on lint-only changes).
   - Recommendation: add both files to the `paths:` filter for symmetry with the audit script. The cost is zero (one CI run per lint change); the benefit is the lint actually runs on PRs that touch it.

3. **Whether the cross-backend test for D-15 lives in `cmd-parallel-jj.test.ts` or a new sibling file**
   - What we know: D-15 says "lives in `sdk/src/vcs/__tests__/` (alongside other VCS-fixture-driven cross-backend tests) using `vcs-fixture.ts` Pattern B `mkdtemp`."
   - What's unclear: whether the assertion lands as a new `it` inside the existing `cmd-parallel-jj.test.ts` clean-path scenario (line 126-218), or as a separate scenario file.
   - Recommendation: planner picks based on test isolation requirements. Recommendation: add as a new `it` block inside the existing N=2/3/4 describe block at `cmd-parallel-jj.test.ts:98-219` to reuse the fixture setup; OR introduce a sibling file `cmd-parallel-fanin-no-orphan-jj.test.ts` if you want a dedicated scenario name surface for blame attribution. Either is acceptable.

4. **Smoke test for end-to-end CLI bridge resolution**
   - What we know: `tests/cli-workspace-parallel-cancel.test.cjs` exists per `workspace-parallel-cancel.ts:25-27` cross-reference.
   - What's unclear: whether the parallel-cancel test follows a specific shape that should be mirrored for the new bridge.
   - Recommendation: planner reads the cancel test file and decides whether to add a sibling `tests/cli-cleanup-subagent-workspaces.test.cjs` for symmetry. Risk if omitted: a three-site registration miss goes undetected until first dogfood-restore.sh run.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Lint script + CLI bridge + tests | ✓ | v25.9.0 | — |
| pnpm | `pnpm run build:sdk` for the new CLI bridge | ✓ | (managed in repo) | npm fallback per package.json |
| jj 0.41 | Cross-backend test + fanIn integration | ✓ | 0.41.0 (CI-pinned at parallel-e2e.yml:96) | jj-colocated cell skipped if jj not on PATH |
| vitest | sdk/ test suite | ✓ | ^3.1.1 | — |
| `node:test` | tests/ suite | ✓ | bundled | — |
| `jq` | dogfood-restore.sh count extraction (D-13) | likely ✓ on dev machines; uncertain in CI | — | `|| echo "?"` guard handles missing jq gracefully |
| jj on macOS (this dev environment) | Local test runs | not verified in this research session | — | Test would skip via `try { execSync('jj --version') } catch { jjAvailable = false }` pattern at `cmd-parallel-cancel-jj.test.ts:36-42` |

**Missing dependencies with no fallback:** None blocking.

**Missing dependencies with fallback:** `jq` in CI may need verification; the `|| echo "?"` guard at D-13 handles graceful degradation.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework (LINT-06 unit test) | `node:test` + `node:assert/strict` |
| Framework (CLEANUP-02 cross-backend test) | vitest ^3.1.1 |
| Config file (unit) | `tests/scripts/` — no config; auto-discovered by `scripts/run-tests.cjs` post-Phase 13 CI-06 fix |
| Config file (vitest) | `sdk/vitest.config.ts` |
| Quick run command (unit) | `node --test tests/scripts/lint-vcs-parallel-call-presence.test.cjs` |
| Quick run command (vitest) | `pnpm --filter sdk test -- --run sdk/src/vcs/__tests__/<file>.test.ts` |
| Full suite command | `npm test` (runs lint:skill-deps + lint-vcs-no-commit-id + build:sdk + the suites) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LINT-06 | Lint exits 0 on a fixture with paired dispatch + fan-in literals (D-14 case 1) | unit | `node --test tests/scripts/lint-vcs-parallel-call-presence.test.cjs` | ❌ Wave 0 (NEW file) |
| LINT-06 | Lint exits 1 on dispatch-only fixture (D-14 case 2) | unit | (same as above) | ❌ Wave 0 |
| LINT-06 | Lint exits 1 on fan-in-only fixture (D-14 case 3) | unit | (same as above) | ❌ Wave 0 |
| LINT-06 | Lint exits 0 on prose-only mentions outside fences (D-14 case 4 — Pitfall 7 guard) | unit | (same as above) | ❌ Wave 0 |
| LINT-06 | Lint exits 0 when an allowlist entry suppresses an opt-out file (D-14 case 5) | unit | (same as above) | ❌ Wave 0 |
| LINT-06 | Lint runs in CI as a blocking step (jj-colocated cell required) | integration / CI | `.github/workflows/parallel-e2e.yml` CI step | ❌ Wave 0 (NEW step) |
| CLEANUP-02 | Post-clean-fanIn, `existsSync(ws.path) === false` for every workspace (jj-cell, D-15) | integration (vitest) | `pnpm --filter sdk test -- --run sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` | partial — augment existing file at `:126-218` |
| CLEANUP-02 | Post-clean-fanIn on git-side: same assertion holds (D-15 git-cell coverage) | integration (vitest) | `pnpm --filter sdk test -- --run sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` | partial — augment existing file |
| CLEANUP-02 | Post-conflicted-fanIn: `existsSync(ws.path) === true` (CF-03 / AP-5 inverse assertion) | integration (vitest) | (same as above) | partial — augment existing conflicted scenario at `cmd-parallel-jj.test.ts:225-329` |
| CLEANUP-02 | `dogfood-restore.sh` removes orphan dirs across two seeded phases (D-16) | integration (bash + node:test) | bash-driven from a `tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` or equivalent | ❌ Wave 0 (NEW file) |
| CLEANUP-02 | CLI bridge `cleanup-subagent-workspaces --all-phases` resolves end-to-end | smoke (node:test) | `node --test tests/cli-cleanup-subagent-workspaces.test.cjs` | ❌ Wave 0 (NEW file; recommended per Open Q4) |

### Sampling Rate

- **Per task commit:** `node --test tests/scripts/lint-vcs-parallel-call-presence.test.cjs` (≤2s) — verifies the lint behaves on synthetic fixtures.
- **Per wave merge:** `pnpm --filter sdk test -- --run "cmd-parallel-*.test.ts"` (~30s) — verifies fanIn no-orphan invariants on jj + git cells.
- **Phase gate:** `npm test` full suite green before `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `tests/scripts/lint-vcs-parallel-call-presence.test.cjs` — covers LINT-06 (5 scenarios per D-14)
- [ ] `scripts/lint-vcs-parallel-call-presence.cjs` — the lint script itself
- [ ] `scripts/lint-vcs-parallel-call-presence.allow.json` — schema-v2 allowlist with `entries: []` and the `$comment_ip2_cancel_exclusion` narrative stub
- [ ] `sdk/src/query/cleanup-subagent-workspaces.ts` — CLI bridge
- [ ] `tests/cli-cleanup-subagent-workspaces.test.cjs` — bridge smoke test (per Open Q4)
- [ ] `tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` (or equivalent) — D-16 integration test
- [ ] `.github/workflows/parallel-e2e.yml` — new step
- [ ] No framework install needed — `node:test` is built-in, vitest already in sdk/
- [ ] Augment existing `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` (clean + conflicted scenarios) for D-15
- [ ] Augment existing `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` (clean scenario) for D-15 git-cell coverage

## Security Domain

> `security_enforcement` is not explicitly set to false in `.planning/config.json` (key absent — treat as enabled).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 16 ships CI lint + sidecar cleanup; no auth surface. |
| V3 Session Management | no | Same. |
| V4 Access Control | no | Same. |
| V5 Input Validation | yes | CLI bridge `cleanup-subagent-workspaces.ts` accepts `--phase N` (validate via `Number()` + `Number.isNaN` guard mirroring CLEANUP-06 pattern); `--all-phases` is a bare boolean flag; mutual-exclusion check rejects `--phase N --all-phases` early. Lint accepts `--scan-root <path>` — path-canonicalize via `path.resolve` (already done at `lint-vcs-no-raw-git.cjs:35,41`). |
| V6 Cryptography | no | No crypto surface. |
| V12 File Operations / Containment | yes | The lint's directory walker (mirror of `audit-workflow-raw-git.cjs:98-107`) MUST skip symbolic-link directories per `audit-workflow-raw-git.cjs:102` defense-in-depth (T-13-04 — a stray symlink inside SCAN_ROOTS cannot escape the repo). The CLI bridge's `--all-phases` enumeration MUST sanitize the phase regex (`^phase-(\d+)-subagent-\d+$`) to prevent path injection through crafted directory names. |

### Known Threat Patterns for `scripts/` + `sdk/src/query/`

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Symlink-escape from SCAN_ROOTS in the lint walker | Tampering | `if (entry.isSymbolicLink()) continue;` (verbatim copy of `audit-workflow-raw-git.cjs:102` defense-in-depth — ASVS V12). |
| Path traversal in `--scan-root` flag | Tampering | `path.resolve(ARGV.scanRoot)` (verbatim copy of `lint-vcs-no-raw-git.cjs:41` posture). |
| NaN/Infinity injection via `--phase` flag | Input Validation | `Number(args[++i])` + `Number.isNaN` guard (mirror CLEANUP-06 pattern from `--max-concurrency`). |
| Path injection via `.claude/jj-workspaces/` directory name (D-05 enumeration) | Tampering | Strict regex anchor `^phase-(\d+)-subagent-\d+$` — exact-match on both ends; `\d+` cannot include path separators or `..`. |
| Stdout/stderr smuggling (lint writes to a file in the colocated jj WC) | Tampering | Per `feedback_avoid_jj_auto_tracked_output` memory + `audit-workflow-raw-git.cjs:23-27` precedent: ALL output via stdout/stderr; NEVER write a report file into the WC. |

## Sources

### Primary (HIGH confidence — all repo files read directly)
- `.planning/phases/16-workflow-invariant-tooling/16-CONTEXT.md` — locked decisions, deferred ideas, claude's discretion
- `.planning/phases/16-workflow-invariant-tooling/16-DISCUSSION-LOG.md` — discuss-phase audit trail
- `.planning/REQUIREMENTS.md` — LINT-06 + CLEANUP-02 acceptance criteria
- `.planning/ROADMAP.md` — Phase 16 §SC1..SC5 + plan list
- `.planning/STATE.md` — v1.4 decisions, Phase 16 inheritance, pitfalls
- `.planning/research/PITFALLS.md` — Pitfall 7 (workflow lint false positives), Pitfall 11 (cleanup ownership), AP-5 (conflicted-branch preservation), IP-2 (cancel/fanIn-only edge), IP-5 (three-consumer cleanup helper)
- `.planning/research/ARCHITECTURE.md` — per-item file-change tables for LINT-06 + CLEANUP-02
- `.planning/research/SUMMARY.md` — Phase 16 framing + Research Flags 3 + 5
- `scripts/lint-vcs-no-raw-git.cjs` — full lint shape (default-deny + allowlist)
- `scripts/lint-vcs-no-raw-git.allow.json` — schema-v2 per-entry shape
- `scripts/audit-workflow-raw-git.cjs` — fence walker shape (`FENCE_OPEN`/`FENCE_CLOSE`/`SCAN_ROOTS`)
- `scripts/lib/allowlist-parser.cjs` — schema-v2 parser
- `scripts/dogfood-restore.sh` — current 61-line state; D-11 appends step at END
- `scripts/dogfood-rehearse.sh` — rehearsal harness using `set -e` (D-12 motivation)
- `sdk/src/vcs/jj/workspace-cleanup.ts` — LOCKED helper signature + body
- `sdk/src/vcs/jj/parallel.ts:289-510` — `performJjParallelFanIn` body
- `sdk/src/vcs/jj/parallel.ts:543-574` — `performJjParallelCancel` body (precedent for direct-call use of helper)
- `sdk/src/vcs/jj/octopus.ts:300-302` — workspace path canonical form
- `sdk/src/query/workspace-parallel-cancel.ts` — bridge precedent (full file)
- `sdk/src/query/command-static-catalog-domain.ts:23,78-79` — registration site 1
- `sdk/src/query/command-manifest.non-family.ts:63` — registration site 2
- `sdk/src/query/command-aliases.generated.ts:156` — registration site 3
- `sdk/src/vcs/__tests__/vcs-fixture.ts` — Pattern B `mkdtemp` fixture (init + cleanup template)
- `sdk/src/vcs/__tests__/cmd-parallel-cancel-jj.test.ts:30-122` — `existsSync(ws.path)` assertion pattern
- `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts:98-219` — clean-path test shape to augment
- `tests/lint-vcs-no-raw-git-fixture.test.cjs` — Pattern B mkdtemp + `--scan-root` test pattern
- `tests/scripts/audit-workflow-raw-git.test.cjs` — `node:test` + mkdtemp Pattern B precedent for tests/scripts/
- `tests/scripts/allowlist-parser.test.cjs` — `node:test` shape for tests/scripts/
- `.github/workflows/parallel-e2e.yml` — full file; insertion site at L125-127
- `get-shit-done/workflows/execute-phase.md` (verified line 560, 562, 564, 775 contain the dispatch/fan-in literals)
- `get-shit-done/workflows/quick.md` (verified line 677, 682, 684, 686, 775 contain the literals)
- `.planning/config.json` — workflow.nyquist_validation = true (validation architecture section included)
- `package.json:65-70` — lint/pretest script conventions

### Secondary (MEDIUM confidence)
- None — every claim in this research is anchored to a directly-read repo artifact.

### Tertiary (LOW confidence)
- A1, A2, A3, A4 assumptions in the Assumptions Log table — flagged for planner confirmation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages/dependencies/regex constants verified via file read; zero external installs.
- Architecture: HIGH — all patterns are direct mirrors of Phase 15.04 or v1.3-shipped precedents (cancel bridge, lint-vcs-no-raw-git, audit-workflow-raw-git, fence walker).
- Pitfalls: HIGH — all pitfalls are sourced from `.planning/research/PITFALLS.md` and validated against empirical file-read evidence (e.g., 28 vs 2 file counts for the false-positive risk).
- Test patterns: HIGH — fixture-test Pattern B + `--scan-root` flag + `mkdtemp` cleanup all verified via direct test-file reads.
- CLI bridge registration: MEDIUM — A1 assumption about `command-aliases.generated.ts` regeneration mechanism unverified; planner needs to confirm.
- Validation architecture: HIGH — `nyquist_validation: true` confirmed; framework split (`tests/` → node:test, `sdk/` → vitest) verified directly.

**Research date:** 2026-05-24
**Valid until:** 2026-06-23 (30 days; the relevant codebase surfaces are stable Phase 15.04 outputs)
