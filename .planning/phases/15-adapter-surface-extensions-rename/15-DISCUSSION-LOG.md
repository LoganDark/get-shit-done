# Phase 15: Adapter surface extensions + rename - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-23
**Phase:** 15-Adapter surface extensions + rename
**Areas discussed:** CancelResult envelope shape, cleanupSubagentWorkspaces helper location, rootCommits rename audit JSON schema

---

## CancelResult envelope shape

| Option | Description | Selected |
|--------|-------------|----------|
| A: 3-field minimal | `{abandoned, surplusBookmarks, surplusWorkspaces}` — ROADMAP literal proposal; smallest surface; trusts cleanup always succeeds. | |
| B: 4-field add `failedReaped` | `{abandoned, failedReaped, surplusBookmarks, surplusWorkspaces}` — mirrors FanInResult.failedReaped naming; cleanup-error visibility; symmetric teardown/fanIn parity. | ✓ |
| C: 5-field full Pitfall-5 coverage | `{abandoned, failedReaped, leakedPaths, surplusBookmarks, surplusWorkspaces}` — explicit cleanup-error vs FS-leak split; risks field-overlap ambiguity. | |

**User's choice:** B: 4-field add failedReaped (Recommended)
**Notes:** Architecturally consistent with v1.3 surface. `FanInResult.failedReaped` already exists at `sdk/src/vcs/types.ts:539`; cancel is the symmetric teardown verb so re-using the field name keeps the surface coherent. Pitfall 5's "leakedPaths-equivalent field" guidance satisfied by `failedReaped` populated with workspace paths/names that resisted teardown — same data, single field. Option A would silently leak partial failures; Option C bifurcates a distinction that doesn't exist in practice (failed `rm -rf` IS the leak source).

---

## cleanupSubagentWorkspaces helper location

| Option | Description | Selected |
|--------|-------------|----------|
| A: New `sdk/src/vcs/jj/workspace-cleanup.ts` | Clean single-responsibility sidecar; ROADMAP-recommended; matches v1.3 sidecar pattern (`conflict-paths.ts`, `incomplete-work.ts`); isolates from reap's W3 (a) inspection-contract. | ✓ |
| B: Extend `sdk/src/vcs/jj/reap.ts` | Perfect semantic overlap with existing abandon+forget+rm-rf code; no net-new file. Risk: reap's W3 (a) "leave conflicted for inspection" contract diverges from cancel's "tear down everything" contract. | |
| C: Extend `sdk/src/vcs/jj/parallel.ts` | Co-locates with cancel call site (15.04 Wave 2). Risk: file already > 200 LOC; conflates wave-orchestration with arbitrary-phaseRoot teardown. | |

**User's choice:** A: New `sdk/src/vcs/jj/workspace-cleanup.ts` (Recommended)
**Notes:** The helper's contract is pure-input → side-effect-isolated: `(phaseRoot, phaseNumber) → enumerate matching dirs → workspace.forget + rm -rf each → return partial-CancelResult shape`. No classification (reap's job), no orchestration (parallel.ts's job). Three consumers (15.04 cancel verb body, 16.02 fanIn clean-path branch, 16.02 dogfood-restore.sh via Phase 16 CLI bridge) each import cleanly from one home. Reap's W3 (a) contract requires preserving conflicted workspaces for human inspection; cancel explicitly violates that — file boundary makes the divergence enforceable.

---

## rootCommits rename audit JSON schema

| Option | Description | Selected |
|--------|-------------|----------|
| A: Flat array | `[{file, line, contextSnippet, kind: "code"\|"prose"}]` — simplest schema; easy to grep verify; loses per-extension grouping that ROADMAP gate needs. | |
| B: Grouped by extension + carveOuts + idempotencyHash | `{generatedAt, totalCount, byExtension, specialCases, carveOuts, idempotencyHash}` — matches ROADMAP SC1 per-extension grep gate; follows v1.2 `id-namespace-audit.json` precedent; explicit archive carve-out provenance. | ✓ |
| C: Pre/post diff | `{before, after, deltas}` — full audit trail with post-rename verification. Risk: conflates pre-rename gate (before commit) with post-rename verification (different command); two-pass generation. | |

**User's choice:** B: Grouped by extension + carveOuts + idempotencyHash (Recommended)
**Notes:** Aligns with ROADMAP Phase 15 SC1 literal requirement ("per-extension `grep -c '\brootCommits\b'` must exit 0 before commit"). The `byExtension` grouping makes the gate trivial — walk each extension's list, confirm 0 remaining. `specialCases` field surfaces the `backends.ts:79` capability matrix string literal explicitly so reviewers cannot miss it (Pitfall 3 / v1.2 retro CR-01 prevention). `idempotencyHash` (MD5 over sorted `{file, line}` tuples + per-extension counts) catches "someone added new `rootCommits` between audit and rename" failure mode. Follows v1.2 `.planning/intel/id-namespace-audit.json` grouped-by-verdict precedent.

---

## Claude's Discretion

The user did not say "you decide" on any area. However, these planner-level details remain at planner judgment (CONTEXT.md §"Claude's Discretion"):
- Exact JSDoc wording on new methods
- Whether `CancelResult.abandoned` carries agentId, workspace name, or workspace path (recommendation: agentId)
- Test fixture choice (Pattern B `mkdtemp` is v1.3 default)
- Helper internal enumeration (`readdirSync` + suffix filter vs. `jj workspace list --quiet` + name-prefix filter; recommendation: filesystem-first)
- Exact JSON serialization order in the audit sidecar (recommendation: sorted-keys)

## Deferred Ideas

Ideas mentioned during synthesis that belong in OTHER phases or future milestones:

- `vcsExecAsync` async-exec primitive — would enable mid-Agent signal-based cancellation; not justified by current callers. Future milestone if ever justified. OOS per PROJECT.md.
- Workflow-callable cancel verb — cancel is adapter-facing only in v1.4. Future adoption possible. OOS per PROJECT.md.
- `gsd-sdk query refs.match-prefix` CLI bridge — no production caller in v1.4. Defer until needed. OOS per PROJECT.md.
- Refactor `expr.ts:41` + `format-migration/rewrite.ts:53,63` to consume new `idAlphabet` — cosmetic cleanup; Phase 17 docs-drift batch or later.
- CLI bridge `sdk/src/query/cleanup-subagent-workspaces.ts` for bash consumption — ships in Phase 16, NOT Phase 15.
- Widen `idAlphabet` to structured `{kind, chars, minLen, maxLen}` — YAGNI; defer until a real consumer needs length bounds.
- Promote `cleanupSubagentWorkspaces` to cross-backend — currently jj-only because orphan-dirs are only a jj problem; defer until git-side orphan-dirs surface.

5 pending todos reviewed but NOT folded into Phase 15 (all are already mapped via REQUIREMENTS.md traceability to Phases 16/17/18):
- `v14-transition-md-update-gap.md` → CLEANUP-01 → Phase 18
- `v14-orphan-jj-workspace-dirs.md` → CLEANUP-02 → Phase 16
- `v14-review-followups.md` → CLEANUP-03..07 → Phase 18
- `v14-jj-reap-test-flake.md` → TEST-17 → Phase 18
- `v14-docs-verify-only-followups.md` → DOCS-01..09 → Phase 17
