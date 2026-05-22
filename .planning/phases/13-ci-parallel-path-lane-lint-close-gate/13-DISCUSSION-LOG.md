# Phase 13: CI parallel-path lane + lint close-gate - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-22
**Phase:** 13-ci-parallel-path-lane-lint-close-gate
**Areas discussed:** E2E execution model, CI lane placement, Synthetic phase source, Audit CI home + evidence

Mode: advisor (USER-PROFILE.md present; calibration tier `standard`; non-technical
owner = false). One research agent spawned per selected gray area; comparison
tables synthesized before the table-first selection.

---

## E2E execution model

| Option | Description | Selected |
|--------|-------------|----------|
| Shell harness driving `gsd-sdk` CLI verbs | Shell-script harness runs `gsd-sdk query workspace.parallel.{dispatch,fan-in}` against a throwaway repo; mirrors `execute-phase.md`'s real shell sequence; exercises the untested CLI/JSON-envelope seam + real subprocesses (incl. SC5 hook-fire) | ✓ |
| Dedicated vitest e2e suite | A vitest suite the lane runs in isolation; typed assertions but redundant with TEST-13 unless it shells `gsd-sdk` | |
| Drive real `/gsd:execute-phase` w/ stub agents | Highest fidelity but needs a Claude-agent runtime in CI; validates the orchestrator layer, not the CI-05 verb layer | |

**User's choice:** Shell harness driving `gsd-sdk` CLI verbs.
**Notes:** Decisive factor — TEST-13's `cmd-parallel-{git,jj}.test.ts` already cover
the TS-function surface (adapter-direct, N=2/3/4 + conflict + crash + idempotency).
The shell harness is the only model that adds a new layer (CLI bridges, stdin
resolution, failure envelope, `jq` pipelines) and the only one with real
subprocesses for SC5's colocated hook-fire check. Lane assertion list captured as
D-02.

---

## CI lane placement

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone `parallel-e2e.yml` | New single-concern workflow file; isolates the inverted required-blocking posture; own `concurrency` + `paths:` filter | ✓ |
| New job in `test.yml` | Reuses jj-install step + SHA pins, one file for Renovate — but co-locates two jobs with opposite `continue-on-error` polarity | |

**User's choice:** Standalone workflow file.
**Notes:** The new lane is required-blocking on jj-colocated / optional on git —
the inverse of `test.yml`'s `test` job. Two jobs with opposite blocking semantics
in one file is a misread hazard; a standalone file matches the repo's
single-concern split convention. Cross-cutting caveat recorded as D-04: GitHub
counts `continue-on-error` cells as passing for branch protection, so a non-matrix
required job or an all-green gate job is needed regardless of file placement.

---

## Synthetic phase source

| Option | Description | Selected |
|--------|-------------|----------|
| Runtime-generated in `mkdtemp` repo | Harness builds a fresh repo + writes per-agent files in code; exact Pattern B / TEST-16 match; zero drift; git/jj parity free | ✓ |
| Checked-in fixture directory | Versioned, diff-reviewable plans — but a new convention (no checked-in VCS-seed fixture exists) and still needs a mkdtemp repo to copy into | |
| Hybrid (tiny checked-in templates) | Marginally more reviewable; same drift/convention cost as a full fixture for negligible payoff | |

**User's choice:** Runtime-generated in a `mkdtemp` repo.
**Notes:** The dispatched "plan" is not a GSD `PLAN.md` — `ParallelDispatchOpts.plan`
carries only `{agentId, planId, workspacePath?}`; each synthetic plan only needs to
produce one commit. Matches the Pattern B convention every `cmd-parallel-*` test
already uses. `mkdtemp` lives outside the repo, so no jj working-copy pollution.

---

## Audit CI home + evidence

| Option | Description | Selected |
|--------|-------------|----------|
| Committed artifact | Maintained script; emits to stdout, close-gate plan redirects once into a committed `13-WORKFLOW-RAW-GIT-AUDIT.md` + JSON | |
| CI-uploaded artifacts only | `.md`/JSON emitted as `actions/upload-artifact` build artifacts; nothing committed; novel CI mechanism, artifacts expire | |
| Stdout-only | Maintained script, stdout-only; matches `audit-id-namespace.cjs`/`migr-06`; zero artifact drift | ✓ (via freeform answer) |

**User's choice:** Freeform — *"whatever avoids being auto-tracked by jj."*
**Notes:** Interpreted as the stdout-only shape: in a colocated-jj repo any file
written to the working tree is auto-snapshotted on the next `jj` invocation, so the
audit must write nothing to disk. Script emits `.md` to stdout by default and JSON
via `--json` (the `audit-id-namespace.cjs` D-01 pattern); LINT-04's "JSON sidecar"
is the `--json` stdout mode, not a file. The script stays maintained + unit-tested
(CI-06 runs it forever). Close-gate evidence = the green `parallel-e2e` audit step +
a quoted zero-hits summary in the v1.3 milestone close commit. Reflected back to the
user and confirmed at the "Create context" gate. Captured as D-06/D-07/D-08.

---

## Claude's Discretion

- Harness implementation language (`bash`/`sh` vs Node `.cjs`) — interacts with
  D-09's allowlist-budget constraint; planner picks language + mitigation together.
- Audit-script file naming, `--json` flag spelling, output formatting.
- D-04 blocking guarantee: non-matrix required job vs. `needs:`-gated all-green job.
- Synthetic harness per-agent commit content.
- `parallel-e2e.yml` trigger set and optional `paths:` filter.

## Deferred Ideas

- Promoting `audit-workflow-raw-git.cjs` to a permanent `npm pretest` lint.
- Workflow call-presence lint (`vcs.parallel.*` must be called) — deferred to v1.4.
- Dogfood run + `parallelization` default flip — Phase 14.
