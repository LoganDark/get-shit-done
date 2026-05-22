---
phase: 13-ci-parallel-path-lane-lint-close-gate
plan: 02
subsystem: lint-tooling
tags: [audit-script, lint, baseline-regression-guard, LINT-04]

# Dependency graph
requires:
  - phase: 13-ci-parallel-path-lane-lint-close-gate
    provides: 13-01 re-baselined ROADMAP SC2/SC3 + CONTEXT D-08 + REQUIREMENTS LINT-04/CI-06 to the baseline-regression-guard framing
  - phase: 13-ci-parallel-path-lane-lint-close-gate
    provides: 13-RESEARCH.md §Code Examples (verbatim SHELL_GIT_RE / FENCE_OPEN / FENCE_CLOSE / SCAN_ROOTS skeleton) and the verified 127-hit <verified_baseline> map
provides:
  - scripts/audit-workflow-raw-git.cjs — the LINT-04 markdown-fence raw-git baseline-regression-guard scanner (stdout-only, --json, frozen per-file 127-hit baseline)
  - tests/scripts/audit-workflow-raw-git.test.cjs — node:test unit test proving the fence detection, shell-comment skip, and per-file regression logic
affects: [13-04 (CI parallel-e2e lane — wires `node scripts/audit-workflow-raw-git.cjs` as the CI-06 gate step), v1.3 milestone close commit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Audit-as-baseline-regression-guard: frozen per-file count map embedded as an Object.freeze constant; exit non-zero only when a file's current count EXCEEDS its baseline"
    - "Embedded-constant baseline over a companion JSON file (the migr-06-close-gate.cjs precedent) — single self-contained .cjs, no require of a sidecar"
    - "Markdown shell-fence state machine: FENCE_OPEN (bash/sh/zsh labelled) / FENCE_CLOSE (bare), shell-comment skip inside the fence"

key-files:
  created:
    - scripts/audit-workflow-raw-git.cjs
    - tests/scripts/audit-workflow-raw-git.test.cjs
    - .planning/phases/13-ci-parallel-path-lane-lint-close-gate/13-02-SUMMARY.md
    - .planning/phases/13-ci-parallel-path-lane-lint-close-gate/deferred-items.md
  modified: []

key-decisions:
  - "Baseline storage: embedded Object.freeze const (the plan's recommended option) over a companion baseline.json — single self-contained file, matches migr-06-close-gate.cjs"
  - "scanFile returns { path, count, hits } rather than the RESEARCH skeleton's flat hit array — the per-file count map is what the per-file regression rule (D-09) compares, and the hits list still feeds the .md report"
  - "auditWorkflowRawGit signature is { scanRoots, repoRoot, baseline = BASELINE } — the plan's baseline-regression-guard contract supersedes the RESEARCH skeleton's 2-arg form; baseline is injectable so the unit test passes synthetic baselines"
  - "findMarkdown skips entry.isSymbolicLink() directories (T-13-04 containment) — the plan's optional hardening, taken because it is cheap"

patterns-established:
  - "A CI-gate audit script ends its require.main block with process.exit(result.ok ? 0 : 1) — the deliberate divergence from audit-id-namespace.cjs (which never exits)"

requirements-completed: [LINT-04]

# Metrics
duration: 7min
completed: 2026-05-22
---

# Phase 13 Plan 02: audit-workflow-raw-git baseline-regression scanner Summary

**`scripts/audit-workflow-raw-git.cjs` ships as the LINT-04 deliverable — a stdout-only baseline-regression guard that scans bash/sh/zsh markdown fences under `workflows/`, `references/`, and `agents/`, carries the frozen per-file 127-hit baseline as an `Object.freeze`d constant, and exits non-zero only when a file's raw-git count exceeds its baseline — backed by a 7-case `node:test` unit test.**

## Performance

- Duration: 7 min
- Tasks completed: 2 / 2
- Files created: 2 (audit script + unit test); 2 planning files (this SUMMARY + deferred-items.md)

## What Shipped

### Task 1 — `scripts/audit-workflow-raw-git.cjs` (TDD: RED → GREEN)

The baseline-regression-guard scanner, modeled structurally on `audit-id-namespace.cjs`:

- **RED gate** (`test(13-02): add failing test…`): a placeholder `node:test` that requires the not-yet-existing audit module — failed with `MODULE_NOT_FOUND`, confirming RED.
- **GREEN gate** (`feat(13-02): implement…`): the full script.
  - `SHELL_GIT_RE` is **byte-identical** to `lint-vcs-no-raw-git.cjs`'s `SHELL_GIT_PATTERNS` regex `/(?:^|[ \t;&|(])git[ \t]+[a-zA-Z]/` (verified via `.toString()` equality).
  - `FENCE_OPEN` / `FENCE_CLOSE` copied verbatim from RESEARCH §Code Examples.
  - `BASELINE` is the frozen per-file 127-hit map wrapped in `Object.freeze` — an embedded constant, not a companion JSON file (the `migr-06-close-gate.cjs` precedent).
  - `findMarkdown` recursive `*.md` walker tolerates a missing scan-root via try/catch and skips symlink directories (T-13-04 containment).
  - `scanFile` returns `{ path, count, hits }` — fence-state machine, shell-comment (`/^\s*#/`) skip, repo-relative forward-slash path.
  - `auditWorkflowRawGit({ scanRoots, repoRoot, baseline = BASELINE })` applies the per-file regression rule (D-09): a file is a regression iff `current > baseline` (baseline-absent = 0); returns `{ ok, scannedFiles, totalCurrent, currentCounts, regressions }`.
  - `emitMarkdown` / `emitJson` both return a string and write to stdout; `escapeMarkdownCell` copied verbatim.
  - `require.main` guard ends with `process.exit(result.ok ? 0 : 1)` — the CI-06 regression-guard exit code (the deliberate divergence from `audit-id-namespace.cjs`).
  - **Stdout-only / VCS-free:** no `writeFile`/`appendFile`/`createWriteStream`, no `exec*`/`spawnSync` (D-06; verified by grep). `lint-vcs-no-raw-git.cjs` does not flag it.

### Task 2 — `tests/scripts/audit-workflow-raw-git.test.cjs`

A `node:test` unit test mirroring `migr-06-close-gate.test.cjs`, with all 7 enumerated cases, each in its own `test(...)` with a random-prefix `mkdtemp` tree and `rmSync(... { recursive: true, force: true })` cleanup in a `finally` block (Pattern B — TEST-16):

1. flags a NEW raw git invocation inside a bash fence (baseline-absent → regression `{ baseline: 0, current: 1 }`)
2. no regression when the current count equals the baseline
3. flags a regression when the current count exceeds the baseline (`{ baseline: 2, current: 3 }`)
4. does NOT flag git inside prose or a non-shell (`text`) fence
5. skips a shell-comment line inside a bash fence
6. no regression when raw-git was removed (current below baseline)
7. `emitJson` returns valid JSON with a boolean `ok` and an array `regressions` (also exercises `emitMarkdown` + `scanFile`)

The synthetic-baseline injection proves the per-file regression logic **independent of the embedded 127-hit constant's value** (mitigates T-13-06 — a drifted baseline can't quietly invalidate the comparison).

## Live-tree baseline re-scan

Per the plan's mandatory re-scan-and-confirm step, a fence-aware scan was re-run against the live tree on 2026-05-22 **before freezing the baseline**. It reproduced the `<verified_baseline>` map **exactly**: 127 raw-git hits across 30 files, byte-identical per-file. **No drift** — the frozen `BASELINE` constant equals the live tree, so `node scripts/audit-workflow-raw-git.cjs` exits 0 (current == baseline == pass).

## Baseline-storage form

**Embedded `Object.freeze`d `const`** (the plan's recommended option), not a companion `scripts/audit-workflow-raw-git.baseline.json`. Rationale: a single self-contained `.cjs` matches the `migr-06-close-gate.cjs` embedded-constant precedent and avoids a `require` of a sidecar file. An intentionally version-controlled baseline embedded in committed source is source, not runtime output — it does not violate CONTEXT.md D-06.

## Exit behavior

`process.exit(result.ok ? 0 : 1)` inside the `require.main` block. Exit 0 when every scanned file is within its frozen baseline; exit 1 (non-zero) when any file's current raw-git count exceeds its baseline — the milestone-completeness regression guard ROADMAP SC3 describes. Plan 13-04 wires `node scripts/audit-workflow-raw-git.cjs` as the CI-06 lane step.

## Verification — all green

| Check | Result |
|-------|--------|
| `node scripts/audit-workflow-raw-git.cjs` against live tree | exit 0 (current == frozen 127-hit baseline) |
| `node scripts/audit-workflow-raw-git.cjs --json` | valid JSON to stdout, `ok=true totalCurrent=127`; nothing written to disk |
| `node --test tests/scripts/audit-workflow-raw-git.test.cjs` | 7 tests, 7 pass, 0 fail |
| audit script `writeFile`/`appendFile`/`exec*`/`spawnSync` grep | none — stdout-only, VCS-free (D-06) |
| `SHELL_GIT_RE` vs `lint-vcs-no-raw-git.cjs` `SHELL_GIT_PATTERNS` | byte-identical (`.toString()` equality) |
| audit test file `retry`/`.skip` grep | none (TEST-16) |
| audit test file `finally`-block count vs test count | 8 ≥ 7 (every test cleans up) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `check-skip-count.cjs` false positive on docblock prose**

- **Found during:** Task 2 verification.
- **Issue:** The unit test's docblock comment originally contained the literal token `describe.skip` (in the prose "no retry, no `describe.skip`" describing the TEST-16 constraint). `check-skip-count.cjs` is a naive line-wise regex scanner that does not strip comments, so it counted the prose mention as a real skipped test — and the acceptance criterion `grep -nE 'retry|\.skip'` likewise matched the substring `retry`.
- **Fix:** Reworded the docblock prose to "no flake budget, no suite-level disabling" — no `retry` or `.skip` substring. The test file now contributes **zero** skip-pattern matches and passes the acceptance grep.
- **Files modified:** `tests/scripts/audit-workflow-raw-git.test.cjs` (committed in the Task 2 commit).
- **Commit:** `yylvoqnu` (Task 2).

## Deferred Issues (out of scope)

**Pre-existing skip-count regression** — `node scripts/check-skip-count.cjs` exits 1 on the Phase 13 branch: the working tree carries 22 skipped tests vs. the `origin/main` baseline of 18 (+4). Verified via `jj file show` against the parent of plan 13-02's RED-gate commit — the pre-13-02 branch tip **already had 22 skips**. Plan 13-02's two new files add **zero** net skips. The +4 originates in `cmd-parallel-max-concurrency-adapter.test.ts` and `cmd-workspace-assert-dispatched-cwd.test.ts` (Phase 10/11 SDK test files, not touched by plan 13-02). Logged to `deferred-items.md`; flagged for the Phase 13 verifier / a Phase 10/11 follow-up before the v1.3 close gate (TEST-16 mandates no skip-count regressions post-v1.3). Plan 13-02's `<verify>` block lists `node scripts/check-skip-count.cjs` — that check fails on the inherited branch state, **not** on anything plan 13-02 changed.

## Recovery note

A `git stash push` was inadvertently run during Task 2 verification while probing the pre-13-02 skip-count baseline; it stashed the uncommitted Task 2 test-file edits, reverting the working file to the committed RED-phase placeholder. Recovered immediately: the canonical 7-case content was re-written via the editor (the full content was in working context), the stale stash was dropped (`git stash drop`), and the jj working-copy state was confirmed intact (`gsd-sdk query status`). No commits were affected — the recovery touched only the uncommitted working tree. The final committed Task 2 file is the full 7-case version.

## Notes for Downstream

- **Plan 13-04** wires `node scripts/audit-workflow-raw-git.cjs` (no flags — `.md` to stdout) as a step in the `parallel-e2e` CI lane; its non-zero exit fails the job (CI-06).
- The audit is **NOT** in `npm pretest` (D-07 — one-shot / CI-06-only). `package.json`'s `pretest` script is unchanged.
- If a future plan legitimately adds raw-git to a workflow-markdown file, the `BASELINE` constant in `scripts/audit-workflow-raw-git.cjs` must be re-frozen in the same PR (re-run the audit, lift the per-file count) — otherwise the audit fails the CI-06 lane.

## Self-Check: PASSED

- `scripts/audit-workflow-raw-git.cjs` — FOUND
- `tests/scripts/audit-workflow-raw-git.test.cjs` — FOUND
- `.planning/phases/13-ci-parallel-path-lane-lint-close-gate/deferred-items.md` — FOUND
- Commit `pvpwuymq` (test — RED gate) — in log
- Commit `mpwlutux` (feat — GREEN gate) — in log
- Commit `yylvoqnu` (test — unit test) — in log
