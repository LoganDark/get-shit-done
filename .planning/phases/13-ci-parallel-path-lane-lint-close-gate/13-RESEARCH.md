# Phase 13: CI parallel-path lane + lint close-gate - Research

**Researched:** 2026-05-22
**Domain:** GitHub Actions CI lane authoring + Node CJS audit-script design + shell-script E2E harness driving the `gsd-sdk` CLI
**Confidence:** HIGH (all CONTEXT.md-cited files verified against the live tree; one ROADMAP success-criterion contradiction surfaced and documented)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The `parallel-e2e` lane runs a **shell-script harness** that drives the SDK CLI verbs (`gsd-sdk query workspace.parallel.dispatch`, `gsd-sdk query workspace.parallel.fan-in`) against a throwaway repo. NOT a dedicated vitest suite; NOT the real `/gsd:execute-phase` orchestrator. The harness mirrors the `execute-phase.md` shell sequence 1:1 and reuses the `install-smoke.yml` pattern of `gsd-sdk` on PATH. No new dependency (Node + shell only).
- **D-02:** Lane pass/fail assertions for the synthetic 2-plan phase:
  1. `dispatch` exits with a frozen Handle JSON whose `.workspaces | length` is `2`.
  2. `fan-in` returns `.conflicted == false`; `.merged | length` is `2` on git and `1` on jj (octopus).
  3. On jj: `jj log -r 'divergent()' --no-graph` is empty post-fan-in.
  4. Manifest schema asserted **per-backend** — git's dispatch Handle carries a manifest (VCS-19 fields); jj's `handle.manifest` is empty (`''`) per Phase 11 D-01.
  5. On jj-colocated: a sentinel `.githooks/pre-commit` fired during the synthetic phase's commit calls (ROADMAP SC5).
  6. `node scripts/audit-workflow-raw-git.cjs` exits 0 (CI-06).
- **D-03:** The lane lives in a **new standalone `.github/workflows/parallel-e2e.yml`** — NOT a new job inside `test.yml`. The new file carries its own CI-03-style header comment restating the GitHub-Actions-stays-on-git boundary.
- **D-04 [planner constraint]:** GitHub treats skipped and `continue-on-error: true` matrix cells as **passing** for branch protection. Phase 13 must implement the blocking guarantee one of two ways: (a) a separate non-matrix `parallel-e2e-jj-required` job, or (b) a `needs:`-gated "all-green" summary job. The new required-check string must be registered in GitHub branch-protection settings — flag for the user at ship time.
- **D-05:** The two synthetic plans are **generated at runtime** into a `mkdtemp` throwaway repo by the harness — NOT a checked-in fixture directory. The dispatched "plan" is NOT a GSD `PLAN.md` — `ParallelDispatchOpts.plan` carries only `{agentId, planId, workspacePath?}` and `planId` is an opaque label. Each synthetic plan only needs to produce one commit in its workspace.
- **D-06:** `scripts/audit-workflow-raw-git.cjs` is **stdout-only — it writes nothing to disk.** Human-readable `.md` report to stdout by default; machine-readable JSON form to stdout via a `--json` flag. No `13-WORKFLOW-RAW-GIT-AUDIT.md` and no JSON sidecar file is written or committed.
- **D-07:** The audit is a **maintained, unit-tested script** — not throwaway. "One-shot" means *not added to `npm pretest`*. It gets a unit test mirroring `tests/scripts/migr-06-close-gate.test.cjs` and `module.exports` of its pure scan functions.
- **D-08:** The v1.3 milestone close-gate **evidence** is: (1) the first green `parallel-e2e` audit step, and (2) a quoted zero-hits audit summary in the v1.3 milestone close commit message. No committed audit `.md` artifact.
- **D-09 [planner constraint — load-bearing]:** LINT-05 locks the `lint-vcs-no-raw-git.allow.json` budget at the already-spent +1 (`sdk/src/vcs/git/parallel.ts`). The e2e harness must NOT require a *new* raw-git allowlist entry.

### Claude's Discretion

- **Harness implementation language** — `bash`/`sh` script vs Node `.cjs`. Research leaned shell. Planner picks language together with the D-09 mitigation.
- Exact audit-script file naming, the `--json` flag spelling, and the `.md`/JSON output formatting.
- D-04's blocking guarantee: non-matrix job (a) vs. `needs:`-gated all-green gate job (b).
- The synthetic harness's exact per-agent commit content.
- `parallel-e2e.yml` trigger set (`push` / `pull_request` / `workflow_dispatch`) and whether to add a `paths:` filter.

### Deferred Ideas (OUT OF SCOPE)

- Promoting `audit-workflow-raw-git.cjs` to a permanent `npm pretest` lint.
- Workflow call-presence lint (`vcs.parallel.*` must be called in dispatch sections) — v1.4.
- Dogfood run + `parallelization` default flip — Phase 14.
- Modifying any of the 23 production `lint-vcs-no-raw-git.allow.json` entries, or adding a new entry beyond the Phase-10 `git/parallel.ts` one.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CI-05 | New CI matrix lane `parallel-e2e` runs a synthetic 2-plan phase end-to-end on both backends. Required-blocking on jj-colocated; optional on git-only. | `install-smoke.yml` is the structural model; `test.yml` lines 159-169 give the jj-install block; the D-04 gate-job pattern provides the required-blocking guarantee. Verified `gsd-sdk` resolves via `node sdk/dist/cli.js` after `npm run build:sdk` (no global install needed in CI). |
| CI-06 | `parallel-e2e` lane runs the LINT-04 audit script and fails if zero-hits invariant breaks. | The lane adds one step `node scripts/audit-workflow-raw-git.cjs` whose non-zero exit fails the job. Audit exit-code semantics defined in §"Code Examples". |
| LINT-04 | Ship `scripts/audit-workflow-raw-git.cjs` — scans `*.md` shell-fence blocks for raw `git ` invocations under three dirs; emits `.md` + JSON. | `audit-id-namespace.cjs` is the verified skeleton precedent; `lint-vcs-no-raw-git.cjs` `SHELL_GIT_PATTERNS` is the verified detection regex. **CRITICAL — see §"Open Questions" Q1: the live tree currently has 127 raw-git hits across 30 `.md` files; ROADMAP SC2 demands ZERO on first green run. This is unresolved.** |
| LINT-05 | `lint-vcs-no-raw-git.allow.json` net change is +0 or +1; the single addition is `sdk/src/vcs/git/parallel.ts`. The 23 production entries untouched. Diff recorded in milestone close commit. | Verified: the allowlist already has the `sdk/src/vcs/git/parallel.ts` entry (landed Phase 10 — file currently has 24 entries). LINT-05 is bookkeeping: the diff is already +1 and **must not grow**. The D-09 harness-language choice exists to keep it at +1. |
</phase_requirements>

## Summary

Phase 13 ships three new files plus one allowlist-bookkeeping action: a standalone `.github/workflows/parallel-e2e.yml` CI lane, a `scripts/audit-workflow-raw-git.cjs` markdown-fence scanner, an E2E harness (`scripts/e2e-parallel-phase.{sh|cjs}`) that drives the parallel-dispatch CLI verbs against a throwaway repo, and a unit test for the audit. All major architecture is locked by CONTEXT.md D-01..D-09; this research **verified every cited file against the live tree** and resolved the open Claude's-Discretion items.

Every CONTEXT.md-cited file path was confirmed to exist. The SDK CLI bridges are `sdk/src/query/workspace-parallel-dispatch.ts` and `sdk/src/query/workspace-parallel-fan-in.ts` (exact filenames confirmed); the canonical verb names are `workspace.parallel.dispatch` and `workspace.parallel.fan-in` (note the hyphen in `fan-in`). The `execute-phase.md` shell sequence the harness mirrors lives at lines 527-562 (dispatch) and 763-784 (fan-in). The per-backend fan-in split is verified directly against the Phase 9/10 contract tests: git clean fan-in asserts `merged.length === N`, jj asserts `merged.length === 1`. The git Handle carries a truthy `manifest`; the jj Handle's `manifest` is the empty string `''`.

**One finding overturns a CONTEXT.md/ROADMAP premise and the planner MUST address it.** ROADMAP SC2 and CONTEXT.md D-08 both state the audit "on first green run reports **zero** raw-git hits." A live scan of `.md` shell-fence blocks under the three target directories found **127 raw-git invocations across 30 files**. v1.3's PROMPT-06..09 only ever deleted the *parallel-dispatch* raw-git block from `execute-phase.md` and `quick.md` — dozens of unrelated raw-git invocations (in `ship.md`, `pr-branch.md`, `complete-milestone.md`, `forensics.md`, `gsd-debugger.md`, etc.) were never in v1.3's deletion scope. The audit as specified would report 127 hits and fail on its first run. This is a genuine scope contradiction, not a code bug; see §"Open Questions" Q1 for the three resolution paths the planner must choose among during discuss-phase.

**Primary recommendation:** Write the harness as a **shell script** (`scripts/e2e-parallel-phase.sh`) that routes **all** repo setup and VCS operations through `gsd-sdk query` (D-09 mitigation 1) — never raw `git`. Use the **D-04 option (b) `needs:`-gated all-green gate job** for the blocking guarantee. **Before any of this can ship, the planner must reconcile the audit-scope contradiction (Q1) — most likely by narrowing the audit's scan scope to detect only the specific raw-git pattern v1.3 eliminated, OR re-baselining SC2 to an allowlisted hit-count.**

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Parallel-dispatch E2E exercise | CI runner (GitHub Actions) | SDK CLI (`gsd-sdk query`) | The lane is a CI concern; the harness it runs is a shell-orchestration concern that delegates all VCS work to the adapter-mediated CLI. |
| Throwaway-repo construction | E2E harness shell script | SDK CLI / jj+git subprocesses | `mkdtemp` repo creation + seed commit. D-09 forces this through `gsd-sdk query` (no raw `git`). Raw `jj` is permitted (not flagged by the no-raw-*git* lint). |
| Raw-git-in-markdown detection | Node CJS audit script | — | Pure file-walk + regex scan. Owns no VCS state; stdout-only (D-06). |
| Blocking-on-jj-colocated guarantee | GitHub Actions job graph (`needs:` / gate job) | GitHub branch-protection settings | A matrix cell alone cannot enforce blocking (D-04); a dedicated gate job whose name is registered as a required check does. |
| Hook-fire verification (SC5) | jj adapter `commit()` | `.githooks/pre-commit` sentinel | The hook fires only when a commit goes through `vcs.commit()` / `gsd-sdk query commit` — NOT on raw `jj squash`. See §"Common Pitfalls" Pitfall 3. |
| Audit unit test | vitest/`node:test` under `tests/scripts/` | — | Mirrors `tests/scripts/migr-06-close-gate.test.cjs` (uses `node:test`). |

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| GitHub Actions | n/a (hosted) | CI lane runtime | Repo's entire CI surface is Actions; `install-smoke.yml`/`test.yml`/`canary.yml` are the precedents. |
| `gsd-sdk` CLI | repo-local (`sdk/dist/cli.js`) | Drives `workspace.parallel.{dispatch,fan-in}` | The CLI bridge layer D-01 explicitly targets; TEST-13 does NOT cover it. |
| Node.js | 22 + 24 | Audit script runtime + CLI host | `test.yml` matrix uses `node-version: [22, 24]`; CJS scripts in `scripts/` are plain Node. |
| jj | `v0.41.0` | jj-colocated backend under test | Pinned in `test.yml:164` (`JJ_VERSION=v0.41.0`); Renovate-bumpable. |
| `jq` | preinstalled on `ubuntu-latest` | JSON-envelope assertions in the harness | `execute-phase.md`'s real shell sequence uses `jq` pipelines; the harness mirrors them. |
| `bash` | preinstalled | Harness + CI step shell | `test.yml` steps use `shell: bash`; D-01 mandates shell harness. |

### Supporting

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `actions/checkout` @ `de0fac2e4500dabe0009e67214ff5f5447ce83dd` (v6.0.2) | Repo checkout | SHA-pinned exactly as in `test.yml:120` / `install-smoke.yml:84`. Copy the pin verbatim. |
| `actions/setup-node` @ `53b83947a5a98c8d113130e565377fae1a50d02f` (v6.3.0) | Node install | SHA-pinned exactly as in `test.yml:148`. Copy verbatim. |
| `node:test` + `node:assert/strict` | Audit unit-test framework | `tests/scripts/migr-06-close-gate.test.cjs` and `audit-id-namespace.test.cjs` both use `node:test` — match the precedent. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shell harness routing through `gsd-sdk query` | `.cjs` harness `require()`-ing built fixture helpers | The `.cjs` route can import already-allowlisted code, but `vcs-fixture.ts` does **not** export reusable `setupGitRepo`/`setupJjRepo` (see §"Code Insights" — its setup functions are module-private). The `.cjs` route would have to duplicate setup logic anyway. Shell + `gsd-sdk query` keeps D-09 satisfied with zero allowlist risk and mirrors `execute-phase.md` more faithfully. |
| New standalone `parallel-e2e.yml` | New job in `test.yml` | D-03 locks standalone — `test.yml`'s `continue-on-error` polarity (allow-fail on jj) is the *inverse* of `parallel-e2e`'s (block on jj). Co-locating opposite polarities is a misread hazard. |
| `needs:`-gated gate job (D-04 b) | Separate non-matrix `parallel-e2e-jj-required` job (D-04 a) | Both work. (b) recommended — see §"Architecture Patterns" Pattern 3. |

**Installation:** No new npm dependencies. The audit script and harness use only Node built-ins (`fs`, `path`, `child_process`) and shell tools already on the runner.

**Version verification:** No new packages — nothing to verify on a registry. The pinned action SHAs and `jj v0.41.0` are confirmed against the current `test.yml` and `install-smoke.yml` (read 2026-05-22). The harness invokes the SDK via the repo-local `sdk/dist/cli.js` (built by `npm run build:sdk`), so no `gsd-sdk` package install is required in CI.

## Package Legitimacy Audit

> Phase 13 installs **no external packages**. The CI lane uses two GitHub Actions, both already in use elsewhere in the repo and SHA-pinned; the audit script and harness use only Node/shell built-ins.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `actions/checkout@de0fac2e…` (v6.0.2) | GitHub Actions | n/a | n/a | github.com/actions/checkout | n/a — SHA-pinned, already in `test.yml` | Approved (reuse existing pin) |
| `actions/setup-node@53b83947…` (v6.3.0) | GitHub Actions | n/a | n/a | github.com/actions/setup-node | n/a — SHA-pinned, already in `test.yml` | Approved (reuse existing pin) |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

No npm/PyPI/crates install occurs in this phase, so the slopcheck gate is not applicable. The only third-party code is the two GitHub Actions, which must be copied with their **exact existing SHA pins** from `test.yml` — do not re-resolve the tags to a different SHA.

## Architecture Patterns

### System Architecture Diagram

```
                  ┌─────────────────────────────────────────────────┐
   push / PR ───► │  .github/workflows/parallel-e2e.yml             │
                  │                                                 │
                  │  ┌──────────────────────────────────────────┐   │
                  │  │ job: parallel-e2e  (matrix)              │   │
                  │  │   backend ∈ {git, jj-colocated}          │   │
                  │  │   continue-on-error: backend == 'git'    │   │ ◄── git cell may fail
                  │  │                                          │   │     without blocking
                  │  │   step: checkout (SHA-pinned)            │   │
                  │  │   step: setup-node 24                    │   │
                  │  │   step: install jj v0.41.0  [jj cell]    │   │
                  │  │   step: npm ci && npm run build:sdk      │   │
                  │  │   step: run E2E harness ─────────────┐   │   │
                  │  │   step: run audit (CI-06) ──────┐    │   │   │
                  │  └─────────────────────────────────┼────┼───┘   │
                  │                                    │    │       │
                  │  ┌─────────────────────────────────┼────┼───┐   │
                  │  │ job: parallel-e2e-gate          │    │   │   │
                  │  │   needs: [parallel-e2e]         │    │   │   │
                  │  │   inspects per-cell results ────┘    │   │   │ ◄── REGISTERED as the
                  │  │   fails if jj-colocated cell != ok   │   │   │     required branch-
                  │  └──────────────────────────────────────┼───┘   │     protection check
                  └─────────────────────────────────────────┼───────┘
                                                             │
                  ┌──────────────────────────────────────────▼──────┐
                  │  scripts/e2e-parallel-phase.sh  (the harness)   │
                  │                                                 │
                  │  1. mkdtemp throwaway repo (OUTSIDE this repo)   │
                  │  2. init repo + seed commit  via gsd-sdk query  │ ◄── D-09: no raw `git`
                  │     (+ install sentinel .githooks/pre-commit)   │
                  │  3. build 2-plan dispatch JSON                  │
                  │  4. gsd-sdk query workspace.parallel.dispatch ──┼──► ParallelDispatchHandle
                  │  5. per-workspace: write file + commit          │     (frozen JSON)
                  │     [jj cell: commit via gsd-sdk → hook fires]  │
                  │  6. gsd-sdk query workspace.parallel.fan-in ────┼──► FanInResult
                  │  7. jq-assert: workspaces==2, conflicted==false,│
                  │     merged==(2 git / 1 jj), manifest per-backend│
                  │  8. [jj cell] assert sentinel hook marker exists│
                  └─────────────────────────────────────────────────┘

                  ┌─────────────────────────────────────────────────┐
                  │  scripts/audit-workflow-raw-git.cjs             │
                  │                                                 │
                  │  walk *.md under: get-shit-done/workflows/       │
                  │                   get-shit-done/references/      │
                  │                   agents/                        │
                  │  for each file: track ```bash|sh|zsh fences      │
                  │    inside fence, skip #-comment lines             │
                  │    test each line vs SHELL_GIT_PATTERN            │
                  │  default → emit .md table to stdout               │
                  │  --json  → emit JSON to stdout                    │
                  │  exit 0 if zero hits, exit 1 otherwise            │
                  └─────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
.github/workflows/
└── parallel-e2e.yml          # NEW — the CI lane (D-03); own concurrency group + CI-03 header
scripts/
├── e2e-parallel-phase.sh     # NEW — the harness (D-01); shell, routes VCS via gsd-sdk query
└── audit-workflow-raw-git.cjs # NEW — the markdown-fence scanner (D-06); stdout-only
tests/scripts/
└── audit-workflow-raw-git.test.cjs  # NEW — audit unit test (D-07); mirrors migr-06-close-gate.test.cjs
```

### Pattern 1: Single-concern standalone workflow file

**What:** A new `.yml` under `.github/workflows/` owning exactly one CI concern, with its own `concurrency` group, `paths:` filter, and header comment.
**When to use:** Always for `parallel-e2e.yml` (D-03).
**Example:**
```yaml
# Source: .github/workflows/install-smoke.yml (verified 2026-05-22), structural model
name: Parallel E2E
# ─────────────────────────────────────────────────────────────────────────────
# CI-03 BOUNDARY (carried from test.yml lines 3-17): GitHub Actions workflows
# themselves stay on git — GitHub *is* git. The jj port covers the GSD CLI/SDK
# that USERS run; it does NOT extend to the workflow runtime. The raw `git`
# invocations in this file's own steps (checkout internals, etc.) are idiomatic
# and NOT routed through the VCS adapter. The harness this lane runs, however,
# routes ALL its VCS operations through `gsd-sdk query` (D-09).
# ─────────────────────────────────────────────────────────────────────────────
on:
  push:
    branches: [main, 'release/**', 'hotfix/**']
  pull_request:
    branches: [main]
    paths:
      - 'sdk/src/vcs/**'
      - 'sdk/src/query/workspace-parallel-*.ts'
      - 'get-shit-done/workflows/**'
      - 'scripts/audit-workflow-raw-git.cjs'
      - 'scripts/e2e-parallel-phase.sh'
      - '.github/workflows/parallel-e2e.yml'
  workflow_dispatch:
concurrency:
  group: parallel-e2e-${{ github.workflow }}-${{ github.head_ref || github.run_id }}
  cancel-in-progress: true
```

### Pattern 2: Matrix with inverted-polarity `continue-on-error`

**What:** A 2-cell backend matrix where the git cell is allow-fail and the jj-colocated cell is NOT.
**When to use:** The `parallel-e2e` job (CI-05 — "required-blocking on jj-colocated, optional on git").
**Example:**
```yaml
# Source: derived from test.yml:91-109 (continue-on-error pattern), polarity INVERTED
jobs:
  parallel-e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    # INVERSE of test.yml: there git is required and jj allow-fail; here jj-colocated
    # is required and git allow-fail. This is exactly why D-03 mandates a separate file.
    continue-on-error: ${{ matrix.backend == 'git' }}
    strategy:
      fail-fast: false
      matrix:
        backend: [git, jj-colocated]
```
**Caveat:** `continue-on-error` does NOT make the job a *required check* — it only stops a failed cell from failing the whole workflow. The blocking guarantee comes from Pattern 3.

### Pattern 3: `needs:`-gated all-green summary job (D-04 option b — RECOMMENDED)

**What:** A second job that `needs:` the matrix job and fails unless the jj-colocated cell succeeded. Its job name is what gets registered as the required branch-protection check.
**When to use:** D-04 blocking guarantee. Recommended over option (a).
**Why (b) over (a):** Option (a) (a separate non-matrix `parallel-e2e-jj-required` job) duplicates the entire harness-invocation step set — checkout, setup-node, jj-install, `npm ci`, `build:sdk`, harness run — a second time, doubling CI minutes and creating drift risk between the two copies. Option (b) reuses the single matrix run and adds only a tiny inspector job. The matrix job already produces per-cell results; the gate job consumes them.
**Example:**
```yaml
# Source: GitHub Actions docs — needs + matrix result inspection
  parallel-e2e-gate:
    runs-on: ubuntu-latest
    needs: [parallel-e2e]
    if: always()   # run even when the matrix job's overall conclusion is failure
    steps:
      - name: Require the jj-colocated cell to have passed
        shell: bash
        env:
          MATRIX_RESULT: ${{ needs.parallel-e2e.result }}
        run: |
          set -euo pipefail
          # `needs.parallel-e2e.result` is the AGGREGATE of all matrix cells.
          # Because the git cell carries continue-on-error:true, a failed git
          # cell does NOT flip this aggregate to 'failure' — but a failed
          # jj-colocated cell (no continue-on-error) DOES. So requiring the
          # aggregate == 'success' is exactly "jj-colocated cell passed".
          if [ "$MATRIX_RESULT" != "success" ]; then
            echo "::error::parallel-e2e jj-colocated cell did not pass (aggregate result: $MATRIX_RESULT). This is a required check."
            exit 1
          fi
          echo "✓ parallel-e2e jj-colocated cell passed."
```
**Branch-protection registration:** `parallel-e2e-gate` is the string the user must add to GitHub branch-protection required checks. Flag this for the user at ship time (D-04). It is config **outside the repo** — Phase 13 cannot set it.

> **Verify during planning:** the exact aggregation semantics of `needs.<job>.result` when one matrix cell has `continue-on-error: true` and another does not. The behavior above (git allow-fail does not flip the aggregate; jj-colocated fail does) is the documented GitHub model, but the planner should add a deliberate red-cell test (intentionally break the git harness once) to confirm before relying on it for branch protection. If the aggregate proves unreliable, fall back to a per-cell job output (`outputs:` + `fromJSON`) that the gate job reads explicitly.

### Pattern 4: `gsd-sdk` from a repo checkout (no global install)

**What:** In CI, `gsd-sdk` need not be globally installed — `node sdk/dist/cli.js` is the exact equivalent after `npm run build:sdk`.
**When to use:** The harness's CLI invocations.
**Example:**
```bash
# Source: bin/gsd-sdk.js (verified 2026-05-22) — the shim is literally
#   spawnSync(node, [<pkgDir>/sdk/dist/cli.js, ...args])
# So in CI, after `npm ci && npm run build:sdk`, define:
GSD_SDK="node $GITHUB_WORKSPACE/sdk/dist/cli.js"
$GSD_SDK query workspace.parallel.dispatch --phase 13 --main-bookmark main --plan @- < plan.json
```
This avoids `npm install -g` overhead and the `install-smoke.yml` PATH dance. The harness can accept the `gsd-sdk` invocation as a parameter/env var so it works both in CI (checkout) and in a globally-installed context.

### Anti-Patterns to Avoid

- **Raw `git` in the harness file:** If `scripts/e2e-parallel-phase.sh` contains a start-of-statement `git <cmd>`, `lint-vcs-no-raw-git.cjs` (which scans `.sh`/`.bash`) flags it and forces an allowlist entry — breaking LINT-05's locked +1 budget (D-09). Route all VCS setup through `gsd-sdk query`. Raw `jj` is fine (not flagged by the no-raw-*git* lint).
- **Writing the audit report to disk:** D-06 forbids it — this is a colocated-jj repo; any file written into the working tree is auto-snapshotted by the next `jj` invocation. Audit is stdout-only.
- **Promoting the audit into `npm pretest`:** D-07 / LINT-04 forbid it. The `pretest` hook is `build:sdk + lint:skill-deps + lint-vcs-no-commit-id.cjs` — the audit stays out.
- **Co-locating the lane in `test.yml`:** D-03 forbids it (opposite `continue-on-error` polarity).
- **Relying on a matrix cell for blocking:** D-04 — skipped and `continue-on-error:true` cells count as *passing* for branch protection. A gate job is mandatory.
- **Asserting hook-fire on raw `jj squash`:** The `.githooks/pre-commit` fire happens inside the adapter's `commit()` only. A raw `jj squash` in the harness will NOT fire it. See Pitfall 3.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detecting `git <cmd>` in a shell line | A fresh regex | `lint-vcs-no-raw-git.cjs`'s `SHELL_GIT_PATTERNS` regex `/(?:^|[ \t;&|(])git[ \t]+[a-zA-Z]/` | Already calibrated against start-of-statement forms; reusing it keeps the audit consistent with the production lint. Copy the literal, do not reinvent. |
| Audit `.md`/`--json` dual output | A bespoke reporter | The `audit-id-namespace.cjs` shape: `parseArgv` → `emitMarkdown` / `emitJson`, both to stdout, `module.exports` of pure functions | Verified precedent (D-06 cites it). Includes `escapeMarkdownCell` for table-cell safety. |
| Throwaway-repo construction | Raw `git init` in the harness | `gsd-sdk query` init/commit verbs (+ raw `jj` where needed) | D-09 — raw `git` in the harness breaks the LINT-05 budget. |
| Dispatch/fan-in JSON envelope handling | Hand-parsing handle fields | The `execute-phase.md` `jq` pipelines (lines 556-561, 775-783) verbatim | The harness's stated job (D-01, "fidelity not smoke test") is to mirror `execute-phase.md` 1:1. |
| Driving the parallel verbs | A new TS test calling `createGitAdapter` directly | `gsd-sdk query workspace.parallel.{dispatch,fan-in}` | TEST-13's `cmd-parallel-*.test.ts` already cover the adapter-direct path. The whole point of D-01 is the CLI-bridge layer that TEST-13 cannot see. |
| jj install in CI | A `cargo install` step | The `test.yml:159-169` tarball-curl block | `cargo install` needs a Rust toolchain and is slow; the musl tarball is the established pattern. Copy verbatim. |

**Key insight:** Every piece of this phase has a verified in-repo precedent. The audit script copies `audit-id-namespace.cjs`; the workflow copies `install-smoke.yml` + `test.yml`; the unit test copies `migr-06-close-gate.test.cjs`; the harness copies the `execute-phase.md` shell sequence. The phase is assembly of known-good patterns, not invention — *except* for the audit-scope contradiction (Q1), which is a genuine open design question.

## Verified Verb Surface

> Resolves CONTEXT.md research areas 1, 2, 3. All confirmed against the live tree 2026-05-22.

### CLI bridge filenames (CONTEXT.md said "verify exact filenames")

| CONTEXT.md cited | Actual (verified) | Status |
|------------------|-------------------|--------|
| `sdk/src/query/workspace-parallel-dispatch.ts` | `sdk/src/query/workspace-parallel-dispatch.ts` | ✓ exact |
| `sdk/src/query/workspace-parallel-fan-in.ts` | `sdk/src/query/workspace-parallel-fan-in.ts` | ✓ exact |

### Verb names (canonical)

Registered in `sdk/src/query/command-static-catalog-domain.ts:71-74`:
- `workspace.parallel.dispatch` (alias `workspace parallel.dispatch`) → `workspaceParallelDispatchQuery`
- `workspace.parallel.fan-in` (alias `workspace parallel.fan-in`) → `workspaceParallelFanInQuery`

**Note the hyphen:** the CLI verb is `fan-in` (hyphenated). The TypeScript method is `vcs.workspace.parallel.fanIn` (camelCase). `execute-phase.md:772` uses `workspace.parallel.fan-in` — the harness must match.

### `dispatch` CLI contract (`workspace-parallel-dispatch.ts`, verified)

Flags: `--cwd <path>` (default projectDir), `--phase <number>` (**required**), `--main-bookmark <name>` (**required**), `--plan <input>` (**required**), `--max-concurrency <n>` (optional — workflow sites omit it).

`--plan` input resolution (`resolvePlanInput`):
- `@-` → read from stdin
- `@<path>` → read from file
- otherwise → treat the literal string as inline JSON

`--plan` JSON shape: `Array<{ agentId: string; planId: string; workspacePath?: string }>` — matches `ParallelDispatchOpts.plan` in `types.ts:465`.

Failure envelope: returns `{ data: { ok: false, reason: '<code>' } }` for `phase_number_required`, `main_bookmark_required`, `plan_required`, `plan_json_parse_failed`. Success returns `{ data: handle }` — a **flat envelope**, so the shell consumer accesses `.workspaces[]` directly (no wrapper). On failure the JSON has `.ok == false`; on success `.ok` is absent (`execute-phase.md:560` reads `.ok // "true"`).

### `fan-in` CLI contract (`workspace-parallel-fan-in.ts`, verified)

Flags: `--cwd <path>`, `--handle <input>` (**required**), `--results <input>`.

Both `--handle` and `--results` accept `@-` (stdin) or `@<path>` (file). **Inline JSON is rejected** for both — `resolveFileOrStdin` throws on a non-`@` string.

**Critical disambiguation rule** (`workspace-parallel-fan-in.ts:79-93`): both inputs cannot simultaneously be stdin. The CLI rejects `--handle @- --results @-` with `reason: 'handle_and_results_cannot_both_be_stdin'`, and rejects `--handle @-` with `--results` omitted (`reason: 'results_required_when_handle_is_stdin'`). **This is exactly why `execute-phase.md:768-773` writes the Handle to a `mktemp` file** and passes `--handle "@$HANDLE_FILE" --results @-`. The harness must do the same.

`--results` JSON shape: `Array<{ agentId, exitCode, lastChangeId?, stderr? }>` — matches `ParallelAgentResult` in `types.ts:479`.

### `ParallelDispatchHandle` shape (`types.ts:493-518`, verified)

```
{
  phaseRoot: string,
  phaseNumber: number,
  mainBookmark: string,
  manifest: string,                    // git: truthy abs path | jj: '' (empty string)
  workspaces: ReadonlyArray<Readonly<{
    name: string,
    path: string,                      // per-agent cwd
    baseRev: string,                   // change_id (jj) / commit_id (git); rebase-stable
    agentId: string,
    baselineOpId?: string              // always undefined (PARALLEL-03 dropped)
  }>>
}
```
The Handle is `Object.freeze`d at the adapter (verified in both contract tests: `Object.isFrozen(handle)`, `Object.isFrozen(handle.workspaces)`, `Object.isFrozen(handle.workspaces[0])` all `true`). It is pure JSON — survives `gsd-sdk query` serialization cleanly.

### `FanInResult` shape (`types.ts:533-541`, verified)

```
{
  merged: ReadonlyArray<string>,       // change_ids (jj) / commit_ids (git) of cleanly-landed heads
  conflicted: boolean,
  conflictedPaths: ReadonlyArray<string>,
  incompleteQueued: number,
  failedReaped: ReadonlyArray<string>,
  surplusBookmarks: ReadonlyArray<string>
}
```

### Per-backend fan-in split (D-02 assertion 2 — VERIFIED against contract tests)

| Backend | Clean fan-in `merged.length` for N | `handle.manifest` | Source of truth |
|---------|-----------------------------------|-------------------|-----------------|
| git | `=== N` (one entry per 2-parent merge) → **2** for the synthetic 2-plan phase | **truthy** (`expect(handle.manifest).toBeTruthy()`) | `cmd-parallel-git.test.ts:162` + `:194` |
| jj | `=== 1` (one N-parent octopus merge) → **1** | **`''`** (`expect(handle.manifest).toBe('')`) | `cmd-parallel-jj.test.ts:150` + `:180` |

jj post-fan-in topology: `jj log -r 'divergent()' --no-graph` is empty (`cmd-parallel-jj.test.ts:206-210`). The harness can run the same `jj log -r 'divergent()'` invocation against the throwaway repo (raw `jj` is allowed by D-09).

### `execute-phase.md` shell sequence the harness mirrors (lines verified)

**Dispatch (lines 527-562):**
```bash
EXPECTED_BRANCH=$(gsd-sdk query current-branch --cwd . --pick branch)
# guard: refuse on empty or "HEAD"
WAVE_WORKTREE_PLANS_JSON=$(printf '%s\n' $WAVE_WORKTREE_PLANS | jq -R . | jq -sc 'map({agentId: ., planId: .})')
HANDLE_JSON=$(printf '%s' "$WAVE_WORKTREE_PLANS_JSON" \
  | gsd-sdk query workspace.parallel.dispatch \
      --phase "${PHASE_NUMBER}" --main-bookmark "$EXPECTED_BRANCH" --plan @-)
[ -z "$HANDLE_JSON" ] && { echo "FATAL: ... empty Handle JSON" >&2; exit 1; }
HANDLE_OK=$(echo "$HANDLE_JSON" | jq -r '.ok // "true"')
[ "$HANDLE_OK" = "false" ] && { echo "FATAL: ... failed: $HANDLE_JSON" >&2; exit 1; }
```

**Fan-in (lines 763-784):**
```bash
HANDLE_FILE=$(mktemp "${TMPDIR:-/tmp}/gsd-handle-XXXXXX.json")
printf '%s' "$HANDLE_JSON" > "$HANDLE_FILE"
FAN_RESULT=$(printf '%s' "$RESULTS_ACCUM" \
  | gsd-sdk query workspace.parallel.fan-in --handle "@$HANDLE_FILE" --results @-)
rm -f "$HANDLE_FILE"
CONFLICTED=$(echo "$FAN_RESULT" | jq -r '.conflicted // false')
FAILED_REAPED=$(echo "$FAN_RESULT" | jq -r '.failedReaped // [] | length')
MERGED_COUNT=$(echo "$FAN_RESULT" | jq -r '.merged // [] | length')
```
The harness mirrors this 1:1. Per-agent commits are accumulated into `RESULTS_ACCUM` (a `ParallelAgentResult[]`) between dispatch and fan-in.

## Runtime State Inventory

> Phase 13 is **greenfield** for its three new files. There is no rename, refactor, or migration of existing runtime state. The one near-miss category — GitHub branch-protection — is config *outside* the repo and is explicitly flagged below, not silently assumed.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — the harness's `mkdtemp` repo is created fresh per run and `rm -rf`'d after. No persistent datastore. | none |
| Live service config | **GitHub branch-protection settings** — the new `parallel-e2e-gate` job name must be registered as a required check. This config lives in GitHub repo settings, NOT in any committed file. | Manual — flag for the user at ship time (D-04). Phase 13 cannot do this from the repo. |
| OS-registered state | None — no OS-level task/service registration. | none |
| Secrets/env vars | None new. The harness uses `GSD_HOOK_SKIP_COLOCATED` only as an *opt-out it must NOT set* (it wants the hook to fire for SC5). | none — verified the harness should leave `GSD_HOOK_SKIP_COLOCATED` unset. |
| Build artifacts | The harness depends on `sdk/dist/cli.js` existing — produced by `npm run build:sdk`. The CI lane must run `build:sdk` before the harness step (same as `test.yml:175`). | CI step ordering — `npm ci` → `npm run build:sdk` → harness. |

## Common Pitfalls

### Pitfall 1: The audit reports 127 hits, not zero — ROADMAP SC2 contradiction

**What goes wrong:** ROADMAP SC2 and CONTEXT.md D-08 both state the audit "on first green run reports **zero** raw-git hits." A live scan (2026-05-22) of `.md` shell-fence blocks under `get-shit-done/workflows/`, `get-shit-done/references/`, and `agents/` found **127 raw-git invocations across 30 files**.
**Why it happens:** v1.3's PROMPT-06..09 deleted only the *parallel-dispatch* raw-git block from `execute-phase.md` (and `quick.md`). They never touched the dozens of unrelated raw-git invocations elsewhere — `ship.md` (push/diff), `pr-branch.md` (cherry-pick/branch), `complete-milestone.md` (tag/branch), `forensics.md` (log/status), `gsd-debugger.md` (bisect), `code-review.md` (rev-parse/diff), etc. Even `execute-phase.md` itself still has 11 raw-git hits (submodule config, branch creation, post-wave stash) at lines 102/165/278-297/748-750 — the parallel-dispatch block being deleted does not make the file raw-git-free.
**How to avoid:** The planner MUST resolve this in discuss-phase before writing the audit. See §"Open Questions" Q1 for the three resolution paths. The audit as literally specified (scan all `.md`, all of `git `, exit non-zero on any hit) cannot pass on first run.
**Warning signs:** A plan task that says "run the audit, confirm zero hits" with no prior cleanup task and no scope-narrowing — that task will fail.

### Pitfall 2: `--handle @-` and `--results @-` together — CLI hard-rejects

**What goes wrong:** Piping both the Handle and the results to the fan-in CLI on stdin returns `{ ok: false, reason: 'handle_and_results_cannot_both_be_stdin' }` — the harness then asserts on a failure envelope and the lane fails confusingly.
**Why it happens:** `workspace-parallel-fan-in.ts:89-93` explicitly rejects the double-stdin case; only one of the two inputs can come from stdin.
**How to avoid:** Mirror `execute-phase.md:768-773` exactly — write the Handle JSON to a `mktemp` file, pass `--handle "@$HANDLE_FILE" --results @-`, then `rm -f` the file. Do not invent a different invocation.
**Warning signs:** Harness output contains `reason: handle_and_results_cannot_both_be_stdin`.

### Pitfall 3: The pre-commit hook fires inside `vcs.commit()`, not on raw `jj squash`

**What goes wrong:** SC5 requires proof that the Phase 12 A3 fix fires `.githooks/pre-commit` during the parallel-dispatched run. If the harness creates per-workspace commits with a **raw `jj squash`** (as the *contract tests* do — `cmd-parallel-jj.test.ts:162` uses `execSync('jj squash …')`), the sentinel hook will **never fire**, because `fireHook` is invoked from the jj adapter's `commit()` method (`backends/jj.ts:280-281`), not by jj itself.
**Why it happens:** `jj.ts:249-290` (verified) fires `.githooks/pre-commit` after a successful squash *inside the adapter's `commit()`*. jj 0.41 colocated does NOT auto-fire `.git/hooks/` — that is the entire A3 bug Phase 12 closed. Raw `jj squash` bypasses the adapter.
**How to avoid:** For the **jj-colocated cell**, the per-workspace commit in step 5 of the harness must go through `gsd-sdk query commit` (which routes to `vcs.commit()` → fires the hook), NOT raw `jj squash`. The sentinel `.githooks/pre-commit` (a tiny script that appends a marker line to a file) is installed at repo-init time; the SC5 assertion checks the marker exists after the run. Confirm during planning whether `gsd-sdk query commit` is the right verb and whether it works inside a dispatched jj workspace cwd.
**Warning signs:** SC5 assertion finds no marker file; the harness used `jj squash` directly for commits.

### Pitfall 4: Raw `git` in `e2e-parallel-phase.sh` breaks the LINT-05 budget

**What goes wrong:** A `.sh` harness doing `git init` / `git commit` / `git log` is scanned by `lint-vcs-no-raw-git.cjs` (its `SCAN_EXT` includes `.sh`, and `SHELL_GIT_PATTERNS` flags start-of-statement `git <cmd>`). The lint fails CI, and the only fixes are an allowlist entry or an inline `# vcs-lint:allow-git-here` annotation — both of which violate D-09's locked +1 budget.
**Why it happens:** D-09 locks the allowlist at exactly the Phase-10 `sdk/src/vcs/git/parallel.ts` entry. Any new entry breaks LINT-05's "+0 or +1" framing.
**How to avoid:** Route ALL repo setup through `gsd-sdk query` (D-09 mitigation 1). Raw `jj` is fine — the no-raw-*git* lint does not flag `jj`. So jj-side assertions like `jj log -r 'divergent()'` are clean, but git-side setup must use the adapter CLI. The `#`-comment skip in the lint means commented-out `git` references are OK, but real invocations are not.
**Warning signs:** `lint-tests` job fails with `lint-vcs-no-raw-git: N violation(s)` pointing at the harness file.

### Pitfall 5: A failed git cell silently passes branch protection

**What goes wrong:** With `continue-on-error: ${{ matrix.backend == 'git' }}`, a *failed* git cell reports the job green. If someone registers the matrix job `parallel-e2e` itself as the required check, a broken git path passes and a broken jj path *also* passes (skipped/allow-fail cells count as passing for branch protection — D-04).
**Why it happens:** GitHub branch protection treats `continue-on-error:true` and skipped cells as passing. A matrix job's required-check status does not distinguish "jj cell failed" from "git cell failed."
**How to avoid:** Register the **`parallel-e2e-gate` job** (Pattern 3) as the required check — never the matrix job. The gate job's `if: always()` + aggregate-result inspection is what actually enforces "jj-colocated must pass."
**Warning signs:** Branch-protection settings list `parallel-e2e` (the matrix job) instead of `parallel-e2e-gate`.

### Pitfall 6: The throwaway repo created inside the colocated repo pollutes jj state

**What goes wrong:** If the harness creates its test repo *inside* `$GITHUB_WORKSPACE` (the checked-out GSD repo), and that repo is colocated jj, the nested repo's files get auto-snapshotted into the outer working-copy commit on the next `jj` invocation.
**Why it happens:** Colocated jj auto-tracks everything in the working tree (the same principle behind D-06's stdout-only audit rule).
**How to avoid:** `mkdtemp` under `$RUNNER_TEMP` / `${TMPDIR:-/tmp}` — **outside** the repo (D-05 explicitly notes "`mkdtemp` lives outside the colocated repo"). CI runners are ephemeral so the practical blast radius is low, but local harness runs would pollute. The contract tests already do this (`tmpdir()` prefix).
**Warning signs:** `jj st` in the GSD repo shows untracked test-repo files.

## Code Examples

> Verified patterns. Sources cited inline. The audit example is a *design sketch* the planner should refine — the `--json` spelling and `.md` formatting are Claude's Discretion.

### Audit script skeleton (mirrors `audit-id-namespace.cjs`)

```javascript
// Source: structural mirror of scripts/audit-id-namespace.cjs (verified 2026-05-22)
//         + SHELL_GIT_PATTERN from scripts/lint-vcs-no-raw-git.cjs:87
'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Reuse the production lint's start-of-statement detection verbatim.
const SHELL_GIT_RE = /(?:^|[ \t;&|(])git[ \t]+[a-zA-Z]/;
// Fence open: ```bash / ```sh / ```zsh (also ~~~). Fence close: bare fence.
const FENCE_OPEN = /^\s*(```+|~~~+)\s*(bash|sh|zsh)\b/i;
const FENCE_CLOSE = /^\s*(```+|~~~+)\s*$/;
const SCAN_ROOTS = [
  'get-shit-done/workflows',
  'get-shit-done/references',
  'agents',
];

function findMarkdown(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) findMarkdown(full, out);
    else if (e.isFile() && e.name.endsWith('.md')) out.push(full);
  }
}

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
    if (/^\s*#/.test(line)) continue;          // shell comment — skip (mirror lint:133)
    if (SHELL_GIT_RE.test(line)) {
      hits.push({ path: rel, line: i + 1, snippet: line.trim().slice(0, 200) });
    }
  }
  return hits;
}

function auditWorkflowRawGit({ scanRoots, repoRoot }) {
  const files = [];
  for (const r of scanRoots) findMarkdown(path.resolve(repoRoot, r), files);
  const findings = [];
  for (const f of files) findings.push(...scanFile(f, repoRoot));
  return { ok: findings.length === 0, scannedFiles: files.length, findings };
}

// ... emitMarkdown(result) / emitJson(result) — both return a string, both go to stdout ...

if (require.main === module) {
  const json = process.argv.includes('--json');
  const repoRoot = path.resolve(__dirname, '..');
  const result = auditWorkflowRawGit({ scanRoots: SCAN_ROOTS, repoRoot });
  process.stdout.write(json ? emitJson(result) : emitMarkdown(result));
  process.exit(result.ok ? 0 : 1);   // CI-06: non-zero exit fails the lane
}

module.exports = { auditWorkflowRawGit, scanFile, findMarkdown, SHELL_GIT_RE };
```

### Audit unit test skeleton (mirrors `migr-06-close-gate.test.cjs`)

```javascript
// Source: structural mirror of tests/scripts/migr-06-close-gate.test.cjs (verified 2026-05-22)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { auditWorkflowRawGit } = require('../../scripts/audit-workflow-raw-git.cjs');

test('flags a raw git invocation inside a ```bash fence', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'audit-test-'));
  mkdirSync(path.join(root, 'get-shit-done', 'workflows'), { recursive: true });
  writeFileSync(
    path.join(root, 'get-shit-done', 'workflows', 'x.md'),
    '# doc\n\n```bash\ngit status\n```\n',
  );
  const r = auditWorkflowRawGit({ scanRoots: ['get-shit-done/workflows'], repoRoot: root });
  assert.equal(r.ok, false);
  assert.equal(r.findings.length, 1);
  rmSync(root, { recursive: true, force: true });
});

test('does NOT flag git inside a non-shell fence or prose', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'audit-test-'));
  mkdirSync(path.join(root, 'agents'), { recursive: true });
  writeFileSync(
    path.join(root, 'agents', 'y.md'),
    'Run git status in your terminal.\n\n```text\ngit status\n```\n',
  );
  const r = auditWorkflowRawGit({ scanRoots: ['agents'], repoRoot: root });
  assert.equal(r.ok, true);
  rmSync(root, { recursive: true, force: true });
});
```

### CI lane skeleton (assembled from verified precedents)

```yaml
# Source: install-smoke.yml structure + test.yml jj-install (lines 159-169)
# verified 2026-05-22. SHA pins copied verbatim — do not re-resolve.
jobs:
  parallel-e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    continue-on-error: ${{ matrix.backend == 'git' }}
    strategy:
      fail-fast: false
      matrix:
        backend: [git, jj-colocated]
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd  # v6.0.2
        with:
          fetch-depth: 0
      - name: Set up Node.js
        uses: actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f  # v6.3.0
        with:
          node-version: 24
          cache: 'npm'
      - name: Install jj
        if: matrix.backend == 'jj-colocated'
        shell: bash
        run: |
          set -euo pipefail
          JJ_VERSION=v0.41.0
          JJ_ARCH=$(uname -m)
          curl -fsSL "https://github.com/jj-vcs/jj/releases/download/${JJ_VERSION}/jj-${JJ_VERSION#v}-${JJ_ARCH}-unknown-linux-musl.tar.gz" \
            | tar xz -C "$RUNNER_TEMP"
          echo "$RUNNER_TEMP" >> "$GITHUB_PATH"
          "$RUNNER_TEMP/jj" --version
      - name: Install dependencies
        run: npm ci
      - name: Build SDK dist
        run: npm run build:sdk
      - name: Run parallel-dispatch E2E harness
        shell: bash
        env:
          GSD_E2E_BACKEND: ${{ matrix.backend }}
        run: bash scripts/e2e-parallel-phase.sh
      - name: Audit — raw git in workflow markdown (CI-06)
        shell: bash
        run: node scripts/audit-workflow-raw-git.cjs

  parallel-e2e-gate:
    runs-on: ubuntu-latest
    needs: [parallel-e2e]
    if: always()
    steps:
      - name: Require jj-colocated cell to pass
        shell: bash
        env:
          MATRIX_RESULT: ${{ needs.parallel-e2e.result }}
        run: |
          set -euo pipefail
          if [ "$MATRIX_RESULT" != "success" ]; then
            echo "::error::parallel-e2e jj-colocated cell did not pass ($MATRIX_RESULT)"
            exit 1
          fi
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw-git worktree dispatch loop inline in `execute-phase.md` (~290 LOC) | One `gsd-sdk query workspace.parallel.dispatch` + one `…fan-in` call | v1.3 Phase 11 (PROMPT-06) | The harness mirrors the *new* single-verb sequence — there is no longer a raw-git dispatch block to mirror. Verified: `execute-phase.md` now has the verb calls at lines 557 + 772. |
| jj-side `WAVE_WORKTREE_MANIFEST` file written to disk | jj `handle.manifest` is `''`; orchestrator holds the Handle JSON in a shell var | v1.3 Phase 11 D-01 | jj-side manifest assertion checks for empty string, not a file. git side still writes a manifest (VCS-19). |
| jj 0.41 colocated relies on auto-fired `.git/hooks/pre-commit` | jj adapter `commit()` explicitly fires `.githooks/pre-commit` (Path 1, `GSD_HOOK_SKIP_COLOCATED` opt-out) | v1.3 Phase 12 (HOOK-06) | SC5's hook-fire test depends on commits going through `vcs.commit()` — see Pitfall 3. |
| `lint-vcs-no-raw-git.allow.json` with top-level `files`/`globs` arrays | Per-entry `{path|glob, reason, owner}` objects under `entries` | v1.2 Phase 8 D-03 | LINT-05's diff is measured against the per-entry schema. The file currently has 24 entries. |

**Deprecated/outdated:**
- The `WAVE_WORKTREE_MANIFEST` *file* on the jj side: retired in Phase 11. Do not assert a manifest file exists on jj.
- `vcs-fixture.ts` `setupGitRepo`/`setupJjRepo` as a *public reusable export*: **never existed.** CONTEXT.md repeatedly cites "`setupGitRepo`/`setupJjRepo` helper" — see §"Code Insights." The fixture's setup functions are module-private; the *parallel contract tests* each define their own local copy.

## Code Insights (live-tree verification of CONTEXT.md claims)

### `vcs-fixture.ts` does NOT export `setupGitRepo`/`setupJjRepo`

CONTEXT.md (D-05, D-09, Reusable Assets) repeatedly refers to "the already-allowlisted `sdk/src/vcs/__tests__/vcs-fixture.ts` `setupGitRepo`/`setupJjRepo`" as a reusable helper for the harness. **Verified false.** `vcs-fixture.ts` exports only `makeBackendFixture`, `selectedBackends`, `__vcsTestOnly`, and the `VcsFixture` interface. Its repo-construction functions are named `initGitRepo` / `initJjRepo` / `initJjNativeRepo` and are **module-private** (not exported). They are also vitest-fixture-shaped (call `beforeAll`/`beforeEach`), not standalone callables.

The functions actually named `setupJjRepo` / `setupGitRepo` are **local, private functions defined inside each contract test** (`cmd-parallel-jj.test.ts:63`, `cmd-parallel-git.test.ts:84`) — not shared, not exported, not importable.

**Consequence for D-09:** The "reuse the allowlisted fixture helpers" mitigation is **not viable as stated** — there is nothing exported to reuse. This strengthens the recommendation: a **shell harness routing through `gsd-sdk query`** (D-09 mitigation 1) is the correct path. A `.cjs` harness would have to re-implement repo setup anyway (the `.cjs`-can-`require()`-allowlisted-code argument in CONTEXT.md's Claude's Discretion section rests on a helper that does not exist).

### `gsd-sdk` resolution (`bin/gsd-sdk.js` verified)

`bin/gsd-sdk.js` is a thin shim: `spawnSync(node, [<pkgDir>/sdk/dist/cli.js, ...args])`. In CI, after `npm run build:sdk`, `node $GITHUB_WORKSPACE/sdk/dist/cli.js <args>` is the exact equivalent — no global install or PATH symlink needed. The harness should parameterize the SDK invocation so it works in both contexts.

### `package.json pretest` hook (verified)

`pretest` = `pnpm run build:sdk && pnpm run lint:skill-deps && node scripts/lint-vcs-no-commit-id.cjs`. D-07 / LINT-04 require the audit to stay OUT of this hook. The audit runs only in the `parallel-e2e` lane (CI-06).

### Allowlist current state (verified)

`scripts/lint-vcs-no-raw-git.allow.json` has **24 entries** under `entries`: 16 `path` entries + 8 `glob` entries. The Phase-10 `sdk/src/vcs/git/parallel.ts` entry IS present (reason: "VCS adapter internals — git-side parallel-dispatch substrate…"). LINT-05's "+0 or +1" is therefore **already satisfied at +1**. Phase 13's LINT-05 work is purely (a) confirm the file is unchanged from this state and (b) quote the diff in the milestone close commit. The relevant globs `.github/workflows/**` and `.githooks/**` already exist — meaning `parallel-e2e.yml`'s own raw-git (checkout internals) is pre-covered, but the harness `scripts/e2e-parallel-phase.sh` is **not** under any allowlisted glob (D-09 / Pitfall 4 applies).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `jq` is preinstalled on `ubuntu-latest` GitHub runners. | Standard Stack | LOW — `jq` is a long-standing default on GitHub-hosted Ubuntu images; if absent, add an install step. Verify by checking the runner image manifest or adding a defensive `command -v jq`. |
| A2 | `needs.<job>.result` aggregates matrix cells such that a `continue-on-error:true` git cell failing does NOT flip the aggregate to `failure`, but a non-`continue-on-error` jj-colocated cell failing DOES. | Architecture Patterns Pattern 3 / Pitfall 5 | MEDIUM — this is the documented GitHub model but the exact interaction of per-cell `continue-on-error` with the job-level aggregate `result` should be confirmed with a deliberate red-cell test before relying on it for branch protection. If wrong, use explicit per-cell `outputs:` + `fromJSON`. |
| A3 | `gsd-sdk query commit` is the correct verb to create a per-workspace commit that routes through `vcs.commit()` and therefore fires `.githooks/pre-commit` on the jj-colocated cell. | Pitfall 3 / SC5 | MEDIUM — the *mechanism* (adapter `commit()` fires the hook) is verified in `jj.ts:280`; that `gsd-sdk query commit` reaches it, and works inside a dispatched workspace cwd, should be confirmed during planning by inspecting the `commit` query handler. |
| A4 | The audit's intended scan scope is genuinely all of `git ` (every subcommand) inside every `.md` shell-fence under the three dirs, exactly as ROADMAP SC2 reads literally. | Open Questions Q1 | HIGH — if the *intent* was always "only the parallel-dispatch raw-git pattern," the 127-hit problem largely dissolves. The literal SC2 wording and CONTEXT.md D-08 both say "raw-git hits" unqualified. The planner must get the user to confirm scope intent in discuss-phase. |
| A5 | Phase 12's A3 fix shipped a usable `.githooks/pre-commit`-fire path, and a sentinel hook can be installed in the throwaway repo's `.githooks/` to observe it. | SC5 | LOW — Phase 12 is recorded complete (STATE.md, 3/3 plans, 5/5 must-haves); HOOK-07 regression test exists at `jj-hooks.test.ts:167`. The sentinel-install mechanism mirrors that test's counter-hook. |

## Open Questions

1. **The audit cannot report zero hits on first run — ROADMAP SC2 vs. the live codebase.** *(HIGH priority — blocks the audit-script plan.)*
   - **What we know:** A live scan (2026-05-22) of `.md` shell-fence blocks under the three target dirs found **127 raw-git invocations across 30 files** — including `execute-phase.md` itself (11 hits: submodule config, branch creation, post-wave stash), `ship.md` (8), `pr-branch.md` (12), `complete-milestone.md` (9), `forensics.md` (9), `quick.md` (11), `gsd-debugger.md`, `gsd-code-fixer.md`, etc. ROADMAP SC2 and CONTEXT.md D-08 both say the audit reports **zero** on first green run.
   - **What's unclear:** Whether v1.3's intent was (a) literally "no raw `git` anywhere in workflow markdown" — which would require deleting/migrating 127 invocations across 30 files, a scope far beyond Phase 13's four REQ-IDs and never planned by PROMPT-06..09 — or (b) "no raw-git in the *parallel-dispatch* path specifically" — the only raw-git that v1.3 actually eliminated. PROJECT.md's "collapse to zero" language is explicitly tied to "the single remaining acknowledged raw-git exception" (the orchestrator worktree-dispatch block), which argues strongly for interpretation (b).
   - **Recommendation:** Surface this to the user in discuss-phase as the **first** order of business. Three resolution paths, in recommended order:
     1. **Narrow the audit's detection scope** to the specific raw-git pattern v1.3 eliminated — e.g., scan only for `git worktree` / `git merge --no-ff` / `git branch -D` (the dispatch+cleanup verbs), or scan only the *parallel-dispatch sections* of `execute-phase.md`/`quick.md`. This makes SC2's "zero" true and honest, and matches the v1.3 deliverable. **Recommended.**
     2. **Re-baseline SC2** to "no *new* raw-git hits beyond a recorded baseline of 127" — the audit becomes a regression guard against *adding* raw-git to markdown, not a zero-assertion. Requires amending ROADMAP SC2 and CONTEXT.md D-08 (a cascade-amendment task, precedent: Phase 10 plan 10-01, Phase 12 plan 12-01).
     3. **Add a cleanup task** to migrate all 127 invocations to `gsd-sdk query` calls — this is a large scope expansion (30 files, many in workflows unrelated to parallel dispatch) and almost certainly belongs in a separate milestone, not Phase 13. **Not recommended for Phase 13.**
   - Whichever path is chosen, the audit-script plan and the `parallel-e2e` CI-06 step depend on it. The planner cannot write a "confirm zero hits" task until this is resolved.

2. **Harness commit verb for the jj-colocated SC5 hook-fire.** *(MEDIUM — affects the harness plan.)*
   - **What we know:** The `.githooks/pre-commit` fire happens in the jj adapter's `commit()` (`jj.ts:280`). Raw `jj squash` bypasses it.
   - **What's unclear:** Whether `gsd-sdk query commit` is the verb that reaches `vcs.commit()`, and whether it functions correctly when invoked with cwd set to a dispatched jj workspace path.
   - **Recommendation:** During planning, read the `commit` query handler (`sdk/src/query/`) to confirm it routes to `vcs.commit()` and accepts a `--cwd`. If it does, the jj-cell harness uses `gsd-sdk query commit` for the per-workspace commits; the git cell can use raw `jj`-free setup or `gsd-sdk query commit` too (uniform is simpler).

3. **`parallel-e2e.yml` trigger set and `paths:` filter** *(LOW — Claude's Discretion, planner decides.)*
   - **What we know:** `install-smoke.yml` uses `pull_request` + `paths:` + `push` to release branches + `workflow_dispatch`. `test.yml` uses `push` to main/release/hotfix + `pull_request` + `workflow_dispatch` with no `paths:` filter.
   - **Recommendation:** Use a `paths:` filter (the E2E lane is expensive — 15 min, two backends, jj install) scoped to `sdk/src/vcs/**`, `sdk/src/query/workspace-parallel-*.ts`, `get-shit-done/workflows/**`, and the three new files. Include `workflow_dispatch` for manual runs. This matches `install-smoke.yml`'s cost-conscious model. A `paths:` filter has a known interaction with required checks (a required check that is skipped by a `paths:` filter still counts as passing) — acceptable here since the gate job is what's required and it runs whenever the matrix job runs.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Audit script, harness, SDK CLI | ✓ (CI matrix) | 22 + 24 | — |
| `jj` | jj-colocated `parallel-e2e` cell | ✓ (installed in-lane) | v0.41.0 (tarball) | — (cell-gated by `if:`) |
| `git` | Both cells (subprocess substrate of the adapter), git cell directly | ✓ (preinstalled on `ubuntu-latest`) | runner default | — |
| `jq` | Harness JSON-envelope assertions | ✓ assumed (see Assumption A1) | runner default | Add a `jq` install step if a `command -v jq` probe fails |
| `bash` | Harness + CI step shell | ✓ (preinstalled) | runner default | — |
| `gsd-sdk` CLI | Harness verb invocations | ✓ via `node sdk/dist/cli.js` after `npm run build:sdk` | repo-local | — |

**Missing dependencies with no fallback:** none — every dependency is either preinstalled on `ubuntu-latest` or installed within the lane.
**Missing dependencies with fallback:** `jq` (Assumption A1) — if the runner image ever drops it, add `sudo apt-get install -y jq` as a defensive step.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json`. This section identifies the observable signals that prove SC1-SC5.

### Test Framework

| Property | Value |
|----------|-------|
| Framework (audit unit test) | `node:test` + `node:assert/strict` (matches `tests/scripts/migr-06-close-gate.test.cjs`) |
| Framework (E2E lane) | Shell harness `scripts/e2e-parallel-phase.sh` — assertions are `jq`-on-JSON + exit codes (NOT vitest, per D-01) |
| Config file | None new — `tests/scripts/*.test.cjs` runs via the existing `node scripts/run-tests.cjs` runner |
| Quick run command | `node --test tests/scripts/audit-workflow-raw-git.test.cjs` |
| Full suite command | `npm test` (covers the audit unit test); `bash scripts/e2e-parallel-phase.sh` (the E2E lane, run by CI) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command / Signal | Exists? |
|--------|----------|-----------|----------------------------|---------|
| CI-05 | `parallel-e2e` lane runs synthetic 2-plan phase on both backends; jj-colocated required-blocking | E2E + CI job graph | The lane runs `scripts/e2e-parallel-phase.sh`; the `parallel-e2e-gate` job fails unless `needs.parallel-e2e.result == 'success'`. Observable: a green `parallel-e2e-gate` check. | ❌ Wave 0 (`parallel-e2e.yml` + harness new) |
| CI-06 | Lane runs the audit; fails if zero-hits invariant breaks | E2E (CI step) | The `Audit — raw git in workflow markdown` step runs `node scripts/audit-workflow-raw-git.cjs`; non-zero exit fails the cell. Observable: step exit code. | ❌ Wave 0 (audit script new) |
| LINT-04 | Audit script ships, scans `.md` shell-fences, emits `.md` + JSON | unit | `node --test tests/scripts/audit-workflow-raw-git.test.cjs` — asserts flag-inside-`bash`-fence, no-flag-in-prose, `--json` output shape | ❌ Wave 0 (audit + test new) |
| LINT-05 | Allowlist net diff is +0/+1; 23 production entries untouched | static check | `git diff` of `scripts/lint-vcs-no-raw-git.allow.json` against the milestone-open baseline shows the file unchanged (already at +1). Quoted in the close commit. | ✅ — file already at the locked +1 state; verification is a diff inspection |
| SC1 | dispatch Handle `.workspaces \| length == 2` | E2E assertion | Harness: `[ "$(echo "$HANDLE_JSON" \| jq '.workspaces \| length')" = 2 ]` | ❌ Wave 0 |
| SC2 | fan-in `conflicted==false`, `merged` per-backend (git 2 / jj 1), manifest per-backend | E2E assertion | Harness: `jq '.conflicted'` → false; `jq '.merged \| length'` → 2 (git) / 1 (jj); `jq '.manifest'` on the Handle → truthy (git) / `""` (jj) | ❌ Wave 0 |
| SC2 (audit) | audit reports zero hits on first green run | E2E (CI step) | `node scripts/audit-workflow-raw-git.cjs; echo $?` → 0 — **BLOCKED by Open Q1; currently reports 127 hits** | ❌ Wave 0 + Q1 unresolved |
| SC3 (jj) | post-fan-in `divergent()` empty | E2E assertion (jj cell) | Harness: `[ -z "$(jj log -r 'divergent()' --no-graph -T 'change_id')" ]` | ❌ Wave 0 |
| SC5 | `.githooks/pre-commit` fired during the jj-colocated parallel run | E2E assertion (jj cell) | Sentinel hook appends a marker line; harness asserts the marker file exists + has the expected content after the run | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `node --test tests/scripts/audit-workflow-raw-git.test.cjs` (audit unit test — sub-second).
- **Per wave merge:** `npm test` (full suite including the new audit test).
- **Phase gate:** the `parallel-e2e` lane green on both backends + `parallel-e2e-gate` green, before `/gsd:verify-work`. The E2E lane is the load-bearing signal — it is the *only* test layer that exercises the CLI-bridge + `jq`-pipeline surface (TEST-13 cannot; D-01 rationale).

### Wave 0 Gaps

- [ ] `scripts/audit-workflow-raw-git.cjs` — the LINT-04 scanner (new file). **Blocked on Open Q1 scope decision.**
- [ ] `tests/scripts/audit-workflow-raw-git.test.cjs` — audit unit test (new file, D-07).
- [ ] `scripts/e2e-parallel-phase.sh` — the E2E harness (new file, D-01).
- [ ] `.github/workflows/parallel-e2e.yml` — the CI lane + gate job (new file, D-03).
- [ ] A sentinel `.githooks/pre-commit` install routine inside the harness (for SC5).
- Framework install: none — `node:test` is built in; no new npm dependency.

## Security Domain

> `security_enforcement` is not set in `.planning/config.json` (`features: {}`, no explicit key) — treated as enabled. Phase 13 is CI infrastructure + a read-only audit script; the security surface is narrow but real (CI runs untrusted-PR code; the audit reads repo files).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth surface — CI lane + local scripts. |
| V3 Session Management | no | No sessions. |
| V4 Access Control | yes (CI) | The `parallel-e2e-gate` job name is a *required check* — branch protection is the access control. Phase 13 must NOT grant the lane write permissions; default `GITHUB_TOKEN` permissions are read-only for the harness's purposes. Do not add `permissions: write` blocks. |
| V5 Input Validation | yes | The audit reads `.md` files and the harness parses `gsd-sdk query` JSON output. The audit must not `eval` file content — it only regex-scans (the skeleton above does). The harness must treat `gsd-sdk` output as data (`jq` parses it; no `eval`). |
| V6 Cryptography | no | No crypto. The jj/git install steps fetch over HTTPS (`curl -fsSL`) — the `-f` flag fails on HTTP errors; the tarball is from the official `github.com/jj-vcs/jj` releases. |
| V12 Files & Resources | yes | `mkdtemp` repo creation. `migr-06-close-gate.cjs` has an `assertInsidePhaseDir` containment guard precedent; the audit's `findMarkdown` walk is rooted at fixed `SCAN_ROOTS` constants and joins `readdirSync` names (no symlink-follow for entry classification) — but a symlinked directory inside a scan root would be recursed into. LOW risk for an in-repo audit, but worth a containment note. |

### Known Threat Patterns for {GitHub Actions CI + Node audit script}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Untrusted PR code runs in the `parallel-e2e` lane and exfiltrates secrets | Information disclosure | The lane needs no secrets — do not add `secrets:` or elevated `permissions:`. `pull_request` (not `pull_request_target`) runs in the fork's context without secret access by default. Keep the trigger as `pull_request`. |
| A malicious action version is pulled in via a moved tag | Tampering | Both actions are **SHA-pinned** (copied verbatim from `test.yml`). Never use a floating `@v6` tag. |
| Audit script `eval`s or executes scanned markdown content | Elevation of privilege / RCE | The audit only reads and regex-scans; it must never `eval`, `require`, or shell-execute file content. The skeleton above is read-only. |
| `curl | tar` of the jj tarball over a compromised channel | Tampering | `curl -fsSL` over HTTPS from the official jj-vcs releases; `-f` fails on HTTP error. Acceptable — same as `test.yml`. (A checksum verification would be stronger but is out of scope — match the existing `test.yml` pattern.) |
| Symlink escape from inside a `SCAN_ROOT` causes the audit to read outside the repo | Information disclosure | LOW risk (in-repo audit, output is just a hit list). Optional hardening: skip `entry.isSymbolicLink()` directories in `findMarkdown`, mirroring `migr-06-close-gate.cjs`'s `assertInsidePhaseDir` defense-in-depth posture. |
| Harness's `mkdtemp` repo created inside the colocated GSD repo, polluting jj state | Tampering (of the dev's working copy) | `mkdtemp` under `$RUNNER_TEMP` / `${TMPDIR:-/tmp}`, outside the repo (Pitfall 6 / D-05). |

## Sources

### Primary (HIGH confidence — verified against the live tree 2026-05-22)

- `sdk/src/query/workspace-parallel-dispatch.ts` — dispatch CLI bridge: flags, `@-`/`@file` resolution, plan shape, failure envelope.
- `sdk/src/query/workspace-parallel-fan-in.ts` — fan-in CLI bridge: the double-stdin rejection rule, file-or-stdin resolution.
- `sdk/src/vcs/types.ts:442-541` — `VcsWorkspaceParallel`, `ParallelDispatchOpts`, `ParallelAgentResult`, `ParallelDispatchHandle`, `FanInResult` shapes.
- `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` — jj clean fan-in `merged.length===1`, `handle.manifest===''`, `divergent()` empty; local private `setupJjRepo`.
- `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` — git clean fan-in `merged.length===N`, `handle.manifest` truthy; local private `setupGitRepo`.
- `sdk/src/vcs/__tests__/vcs-fixture.ts` — confirmed it does NOT export `setupGitRepo`/`setupJjRepo`; exports `makeBackendFixture`/`selectedBackends`.
- `get-shit-done/workflows/execute-phase.md:500-562, 700-784` — the dispatch + fan-in shell sequence the harness mirrors 1:1.
- `sdk/src/vcs/backends/jj.ts:240-294` — `commit()` fires `.githooks/pre-commit` post-squash; `GSD_HOOK_SKIP_COLOCATED` opt-out.
- `sdk/src/vcs/hook-bridge.ts` — `fireHook` shells `.githooks/<stage>`.
- `scripts/audit-id-namespace.cjs` — the `.md`/`--json` stdout-only audit skeleton (D-06 precedent).
- `scripts/lint-vcs-no-raw-git.cjs` — `SHELL_GIT_PATTERNS`, `SCAN_EXT`, the `#`-comment skip; the no-`.md` scan gap LINT-04 fills.
- `scripts/lint-vcs-no-raw-git.allow.json` — 24 entries; the `sdk/src/vcs/git/parallel.ts` entry confirmed present.
- `scripts/migr-06-close-gate.cjs` + `tests/scripts/migr-06-close-gate.test.cjs` — one-shot script + `node:test` unit-test precedents (D-07).
- `.github/workflows/test.yml` — matrix, `continue-on-error:91`, jj-install `159-169`, CI-03 header `3-17`, `concurrency` `30-32`, SHA pins.
- `.github/workflows/install-smoke.yml` — single-concern workflow structure, `paths:` filter, namespaced `concurrency`.
- `bin/gsd-sdk.js` — the `node sdk/dist/cli.js` shim mechanism.
- `package.json` — `pretest` hook, `bin` map.
- `sdk/src/query/command-static-catalog-domain.ts:71-74` — verb-name registration (`workspace.parallel.fan-in` hyphenated).
- Live `.md` shell-fence scan (custom Node walker, run 2026-05-22) — **127 raw-git hits across 30 files** under the three target dirs.
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/PROJECT.md` — phase scope, SC1-SC5, v1.3 framing.

### Secondary (MEDIUM confidence)

- GitHub Actions `needs.<job>.result` aggregation semantics with mixed `continue-on-error` (Assumption A2) — documented model, recommend a deliberate red-cell confirmation test before relying on it for branch protection.

### Tertiary (LOW confidence)

- `jq` preinstalled on `ubuntu-latest` (Assumption A1) — standard but not verified against a runner image manifest in this session.

## Metadata

**Confidence breakdown:**
- Verb surface / CLI contract: HIGH — every file read and cross-checked against the contract tests.
- Per-backend fan-in split: HIGH — verified directly in `cmd-parallel-{git,jj}.test.ts`.
- CI scaffolding: HIGH — `test.yml` + `install-smoke.yml` read in full; SHA pins copied.
- Audit-script design: HIGH for the skeleton (precedent verified); the scan-scope is BLOCKED by Open Q1.
- D-04 blocking guarantee: MEDIUM — Pattern 3 is the documented model; Assumption A2 flags the one detail to confirm.
- SC5 hook-fire: MEDIUM — mechanism verified; the exact harness commit verb (A3) needs a planning-time confirmation.
- **The 127-hit audit-scope contradiction (Open Q1): HIGH-confidence finding, HIGH-priority unresolved design question.**

**Research date:** 2026-05-22
**Valid until:** 2026-06-21 (30 days — stable; the SDK verb surface and CI files are settled. Re-verify if Phase 12's A3 fix or the parallel verbs change before Phase 13 executes.)
