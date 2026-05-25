# Phase 16: Workflow + invariant tooling - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-24
**Phase:** 16-Workflow + invariant tooling
**Mode:** Advisor (USER-PROFILE.md present; `vendor_philosophy: pragmatic` → calibration tier `standard`; `NON_TECHNICAL_OWNER = false`)
**Areas discussed:** Lint pairing scope, CLI bridge phase-resolution, IP-2 cancel/fanIn-only edge, dogfood-restore.sh integration ordering

---

## Todo Cross-Reference

5 v14-* todos matched the Phase 16 keyword sweep at score 0.6. Per Phase 15 CONTEXT and REQUIREMENTS.md traceability, only `v14-orphan-jj-workspace-dirs.md` is mapped to Phase 16 (CLEANUP-02). User confirmed fold of that single todo.

| Todo | Mapped Phase | Action |
|---|---|---|
| v14-orphan-jj-workspace-dirs | 16 (CLEANUP-02) | ✓ Folded (see CONTEXT §Folded Todos) |
| v14-transition-md-update-gap | 18 (CLEANUP-01) | Reviewed, not folded |
| v14-review-followups | 18 (CLEANUP-03..07) | Reviewed, not folded |
| v14-jj-reap-test-flake | 18 (TEST-17) | Reviewed, not folded |
| v14-docs-verify-only-followups | 17 (DOCS-01..09) | Reviewed, not folded |

---

## Area 1: Lint pairing scope (Pitfall 7)

Question: ROADMAP SC1 says the lint exits 1 when fan-in literal is present but dispatch is missing "within the same fence-block-cluster (or vice versa)." What is a fence-block-cluster?

| Option | Description | Selected |
|--------|-------------|----------|
| (A) FILE-level | Pairing checked at file scope: any fence with dispatch literal → same file must contain a fence with fan-in literal (and vice versa). Per-entry allowlist + (deferred) inline escape handle exceptions. | ✓ |
| (B) SECTION-level | Same `##`/`###` heading section. EMPIRICALLY FALSIFIED: execute-phase.md dispatch under `## 3. Spawn executors`, fan-in under `## 5.5 Workspace fan-in` — would fire on canonical correct workflow. | |
| (C) FENCE-PROXIMITY (N lines) | Both literals within N lines. EMPIRICALLY: N must exceed 215 to pass current workflows, effectively collapsing to FILE-level with an arbitrary tuning knob. | |
| (D) SAME-FENCE | Both literals in one shell fence. EMPIRICALLY FALSIFIED: both workflows put dispatch and fan-in in separate procedural fences; would force inlining the wait-for-Agent() lifecycle into a single bash block, breaking the orchestrator-rule pattern. | |

**User's choice:** FILE-level (Recommended)
**Notes:** Matches empirical structure of the two workflows that contain the literals (`execute-phase.md`, `quick.md`); zero false-positives on 24 prose-only workflows; reuses `audit-workflow-raw-git.cjs` fence walker shape per Pitfall 7 path 3.

---

## Area 2: CLI bridge phase-resolution

Question: How does `sdk/src/query/cleanup-subagent-workspaces.ts` (the new Phase 16 CLI bridge for `scripts/dogfood-restore.sh`) accept the phase argument? Helper signature is locked single-phase per Phase 15 D-05.

| Option | Description | Selected |
|--------|-------------|----------|
| (D) Both `--phase N` AND `--all-phases` (mutually exclusive) | Matches explicit-flag norm of existing parallel bridges (dispatch/fan-in/cancel). dogfood-restore.sh uses `--all-phases` (self-documenting); future single-phase callers use `--phase N`. Returns single merged envelope across phases. | ✓ |
| (B) `--all-phases` only | Bridge only supports cross-phase enumeration. Locks out future single-phase TS-side callers. | |
| (A) `--phase N` required + bash loop | Pushes wildcard logic into bash regex. Violates gray-area constraint "bridge wraps wildcard logic on its side." | |
| (C) Default-to-all when `--phase` omitted | Implicit-mode-switch via flag absence contradicts explicit-flag precedent (foot-gun). | |

**User's choice:** Both `--phase N` and `--all-phases` (Recommended)
**Notes:** Bridge enumerates `.claude/jj-workspaces/` via readdirSync, extracts unique phase numbers via `^phase-(\d+)-subagent-\d+$` regex, calls helper per phase, merges to a single `{abandoned, failedReaped}` envelope. Workspace names are already phase-prefixed so concatenation introduces no collision.

---

## Area 3: Allowlist seeding + IP-2 cancel/fanIn-only edge

Allowlist initial entries: agreed to ship `entries: []` with `$comment_ip2_cancel_exclusion` narrative stub (no contested options).

Question: How should the lint handle a hypothetical cancel-only or fanIn-only workflow that legitimately doesn't pair dispatch + fan-in?

| Option | Description | Selected |
|--------|-------------|----------|
| (b+d) Defer + reserve `vcs-lint:allow-parallel-call-absent-here` annotation | Lint docblock documents IP-2; reserves the inline escape regex even if no caller uses it yet. Mirrors `vcs-lint:allow-git-here` / `…allow-commit-id-here` precedents. Cheap insurance (~5 LOC regex constant). | |
| (d only) Defer entirely, no annotation reserved | Pure YAGNI. When a real cancel-only workflow lands, both the lint regex and the annotation syntax get added together. | ✓ |
| (c) Extend lint NOW to accept dispatch ⇔ cancel as valid pairing | Speculative; conflates two distinct semantic patterns. No consumer exists. | |

**User's choice:** Defer entirely, no annotation reserved
**Notes:** User pick diverged from the agent's `defer + reserve annotation` recommendation. Rationale: pure dead-code avoidance + matching the precedent that `vcs-lint:allow-git-here` was added when `lint-vcs-no-raw-git.cjs` actually needed an escape hatch, not preemptively. Lint docblock still documents IP-2 via cross-reference per D-10.

---

## Area 4: dogfood-restore.sh integration ordering

Question: Where in the bash script does the orphan-cleanup step go? ROADMAP SC5 says "idempotent post-restore step" — "post-restore" is ambiguous.

| Option | Description | Selected |
|--------|-------------|----------|
| (A) LAST step + trap with WARN, exit 0 | Cleanup after `tar -xf` + diagnostic echo. CLI-bridge call traps non-zero with `… || echo 'WARN: orphan cleanup failed' >&2`. Cleanup is recovery hygiene, not blocking. | ✓ |
| (A) LAST step + strict halt on failure | Same position but no trap — `set -e` halts on cleanup failure. Stricter signal but misleading on cleanup-only miss. | |
| (B) Between `jj op restore` and `tar -xf` | Inserts CLI-bridge into critical path; bridge hang/fail would prevent tar; crowds Plan 18.02 future precondition. | |

**User's choice:** LAST step + trap with WARN, exit 0 (Recommended)
**Notes:** Preserves Pitfall 2 invariant (op-restore→tar with tar last) by construction. Coexists with Plan 18.02 WR-01 precondition (`[ -f .planning/STATE.md ]` before tar) — cleanup is well downstream. `dogfood-rehearse.sh:131` invokes restore under `set -e`; the WARN trap keeps the rehearsal harness green when the SDK is mid-rebuild and the bridge is temporarily flaky.

---

## Claude's Discretion

These planner-level details were deliberately NOT pinned at discuss-phase (see CONTEXT §Claude's Discretion):

- Exact bridge argv parser style (manual `process.argv` walk vs. helper from `sdk/src/query/cli/argv.ts` if it exists).
- Lint script variable naming (follow `lint-vcs-no-raw-git.cjs` `SHELL_GIT_RE` precedent).
- Whether `--all-phases` enumeration skips silently or reports empty phases (recommendation: skip silently per idempotent no-op contract).
- Exact wording of lint docblock IP-2 cross-reference line.
- Whether `dogfood-restore.sh` uses `gsd-sdk query` or a fully-qualified path (match existing script tooling).

## Deferred Ideas

See CONTEXT §Deferred Ideas for the full list. Highlights:

- The `vcs-lint:allow-parallel-call-absent-here` inline escape annotation — reserved in name (ROADMAP SC1) but NOT implemented in v1.4 per D-09.
- Cross-backend promotion of `cleanupSubagentWorkspaces` — defer until git-side orphan-dirs become a problem (Phase 15 deferred-ideas inheritance).
- Separate `.planning/intel/cleanup-contract.md` doc — sufficient documentation surface already exists via helper JSDoc + this CONTEXT + ROADMAP SC.
- Capability-matrix entry for the new bridge — flagged for planner confirmation; likely NOT required (matrix tracks `VcsAdapter` methods only).
