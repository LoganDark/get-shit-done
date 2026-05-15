# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.2 — jujutsu is change-only — never commit id anywhere

**Shipped:** 2026-05-15
**Phases:** 1 (Phase 8) | **Plans:** 3 | **Tasks:** 18

### What Was Built

- **`scripts/audit-id-namespace.cjs`** — closed-verdict-enum audit script (safe / flip-clean / needs-rename / needs-resolveShort / boundary-io / historical-prose / unclear). 101 commit_id-reachable sites classified across SDK, CJS runtime, scripts, tests, workflows, and `.planning/` prose. Emits both `.md` doc and JSON sidecar (D-01 single-source-of-truth — sidecar is the literal seed for the lint allowlist).
- **`scripts/lint-vcs-no-commit-id.cjs`** — default-deny lint guard parallel to `lint-vcs-no-raw-git.cjs`. Per-entry `{path|glob, reason, owner}` allowlist schema (D-04 dropped `expires` from REQUIREMENTS-LINT-02 — solo-dev process theater). CI-blocking on jj-colocated lane. **1032 files / 0 violations** at close.
- **FLIP-01..04 surface flip** — 7 jj.ts template flips (lines 222-227, 946, 965, 978) + 3 NDJSON parser flips (jj-log, jj-workspace-list, jj-bookmark) + `LogEntry.hash` / `CommitResult.hash` hard-renamed to `.id` with **NO alias** (TypeScript compiler errors as forcing function). PITFALL 1 doc at `jj.ts:327` inverted from negative-contract to positive-contract.
- **`toBeIdOf` vitest custom matcher** at `tests/__tools__/vitest-matchers.ts` (D-02 chose `expect.extend` over free-function `expectIdShape` for composability inside `toEqual(expect.objectContaining({ rev: expect.toBeIdOf('jj') }))`).
- **MIGR-06 close-gate rewriter** (`scripts/migr-06-close-gate.cjs`) — single B-07-style pass over `.planning/phases/08-…/` normalizing commit_id-shape ids to change_id-shape; idempotent; dir-confined; one-time prose hex grep recorded with 10 grandfathered hits.
- **PROMPT-05 invariant verified** — 0 id-reason `vcs.kind === 'jj'` branches remain in workflow code; the 4 KEEP-annotated sites are all `gitOnly.*` capability narrows or jj-not-yet-supported refusal gates.

### What Worked

- **Lint as the architectural enforcer.** Pitfalls.md's "Looks Done But Isn't" anti-pattern was answered by making the lint's first green run BE the FLIP completeness proof — there's no "did the FLIP land?" assertion separate from the lint pass.
- **Audit JSON sidecar as the literal allowlist seed (D-01).** Single-source-of-truth coupling between Plan 1's audit output and Plan 3's lint allowlist — no manual transcription, no drift surface, traceable verdict-to-allowlist row.
- **Hard rename, no aliases (Phase 2.1 pattern).** TypeScript's compiler errors swept the ~14 production + ~25 test consumer sites mechanically. Plan 2's executor reported the sweep was wider than planned because the compiler kept surfacing more sites — the forcing function worked.
- **Same-commit / same-PR sequencing constraints encoded in plan task ordering.** D-05 (FLIP-02 + FLIP-04 in same commit) and research Gap 1 (FLIP-01 + FLIP-03 in same PR) were enforced via commit-message-mentions-both-IDs requirements. Plan-checker verified the contracts at plan-time; executor honored them at commit-time.
- **Three-iteration code-review-fix loop** caught 12 findings (1 critical sweep miss + 5 quality warnings + 4 info + 2 follow-up warnings discovered during user-prompted invariant audit). The CR-01 critical was a CJS-side miss the TS compiler couldn't catch — re-run of `--fix` cleaned it up before milestone close.

### What Was Inefficient

- **Plan 1's audit regex missed `\b[0-9a-f]{N}\b` non-anchored form.** WR-03 (string-quoted form) was fixed in iter-1, but the word-boundary form slipped past both Plan 1 audit AND Plan 3 lint until a user-prompted audit found `verify.ts:514` and `verify.cjs:85` extracting commit_id hex from SUMMARY.md content. The meta-lesson (WR-07): the lint guard that IS the architectural enforcer needs its own regex coverage audited explicitly, not implicitly.
- **`expr.rev` factory is alphabet-permissive by design.** Accepts `[0-9a-fA-F]{4,40}` OR `[k-z]{4,40}` with no backend-awareness check. Deliberate (supports dual backends) but it means the input contract relies entirely on caller discipline + the lint guard catching violations. The hex-regex coverage gap exposed this.
- **Plan 1 audit row count (101) vs final post-fix audit row count (79).** ~22 false-positive hits from pre-FLIP `.hash` field accesses that the audit didn't have full context to classify. Post-Plan-2 hard rename + post-WR-07 regex broadening made the audit naturally tighter; would have been cleaner to re-run audit between Plan 1 and Plan 2 instead of trusting Plan 1's snapshot.
- **Plan 2 executor used `git stash` once during recovery.** Self-flagged in the SUMMARY (project memory: no-raw-git anywhere). Recovered cleanly via `stash pop`. The lint script being built that phase IS the long-term enforcer — but Plan 2 was building it while violating it, a chicken-and-egg gap.

### Patterns Established

- **JSON sidecar as build-pipeline seed.** When two artifacts (e.g., audit output + lint allowlist) have a "X seeds Y" relationship, ship the JSON sidecar as the literal seed file, not a manual-transcription target.
- **Closed verdict enum + JSON sidecar + lint allowlist.** Three-layer pattern: audit classifies sites into a fixed enum; JSON sidecar emits per-row machine-readable verdicts; lint allowlist consumes JSON directly. Future audits (e.g., LINT-04 prose lint in v1.3) should mirror this structure.
- **`Object.freeze` enum constants** for the verdict set — `scripts/audit-workflow-script-paths.cjs` precedent reused; locks the verdict alphabet at module load so consumer code can switch-exhaust.
- **Commit-message-mentions-both-IDs** as the in-band signal for same-commit/same-PR coupling. Plan-checker greps for the multi-ID mention; verifier cross-references against the plan's `must_haves.truths`.
- **Boundary-io as audit verdict.** When an architecturally-disallowed pattern survives as a controlled escape valve (e.g., `commitIdOf` for GitHub release-notes URLs), classify it as `boundary-io` and gate it via per-import default-deny. Avoids the "delete vs allowlist" false dichotomy.

### Key Lessons

1. **Make the lint guard's first green run the architectural proof.** Don't ship a separate "FLIP complete?" assertion — let the lint be the proof. Side benefit: regressions are caught at the moment they're introduced, not at the next milestone audit.
2. **Audit + lint must cover the same regex surface.** A coverage gap in either lets violations slip past CI. When extending the lint, add a parallel audit-script test fixture; when extending the audit, run the lint against the new regex form.
3. **CJS code paths can't rely on TypeScript compiler enforcement.** The hard-rename sweep (Plan 2) caught all TS consumer sites mechanically. The `commands.cjs` sweep miss (CR-01) was caught only by the code-review agent. Lesson: explicit grep-sweep over `.cjs` consumers AFTER TS rename, as part of the executor's acceptance steps.
4. **Solo-dev allowlist schemas need different fields than team allowlists.** D-04 dropped `expires` from REQUIREMENTS-LINT-02 because there's no PR-review cadence to drive expires-based re-justification — `expires` would have been process theater. `{path|glob, reason, owner}` + manual hygiene sweeps + per-entry rationale do the same hollowing-prevention work without the CI failure surface.
5. **`vcs.kind` branching for capability narrows is healthy; for id reasons is a defect.** The PROMPT-05 invariant is fine-grained: 9 remaining `vcs.kind` branches in non-test code, all of them gating on `gitOnly.*` access or jj-not-yet-supported refusals. The audit's "delete `vcs.kind === 'jj'`" framing was correct for id-reason branches but would have wrongly deleted the capability narrows.

### Cost Observations

- **Model mix:** ~100% Opus 4.7 (orchestrator + all subagents) — the user's tier choice for this milestone.
- **Sessions:** 1 sustained autonomous chain from `/gsd-plan-phase 8 --research --auto` through `/gsd-complete-milestone`, with one reboot interrupt during Wave 2 execution that the executor's resumption logic handled cleanly.
- **Notable efficiency:** the `--auto` flag's plan-phase → execute-phase → verify chain stayed flat (no nested Task spawning thanks to `--no-transition`). The 3-iteration code-review-fix loop ran in ~3 min total agent time (small per-finding fixes are fast).
- **Notable cost:** the verifier re-read the audit JSON + all 3 PLAN.md + all 3 SUMMARY.md + REVIEW.md to verify must_haves against actual codebase — ~120k tokens for the verify pass. Worth it for the goal-backward verification.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 MVP | many | 8 (Phases 1–6 + 2.1, 03.1 inserted) | Original GSD adoption; established the phase-research-plan-execute cadence + dual-backend test harness from day one |
| v1.1 first upstream sync | few | 1 (Phase 7) | First successful weekly upstream rebase; introduced 8 new VcsAdapter verbs in a single phase; PROMPT-04 raw-git deletion pattern |
| v1.2 unified revision model | 1 sustained autonomous chain | 1 (Phase 8) | Architectural-enforcement-as-lint pattern; audit JSON sidecar as literal allowlist seed; 3-iteration code-review-fix loop closed 12 findings before milestone close |

### Cumulative Quality

| Milestone | Tests (jj lane) | Lint Guards | Skip-Count Baseline |
|-----------|---|-----|---|
| v1.0 | parameterized vitest + node:test on both backends; jj-colocated CI required-blocking from Phase 5 | `lint-vcs-no-raw-git.cjs` (whole-repo default-deny) | tracked from Phase 5 |
| v1.1 | golden-parity strict-green on both backends for new VCS-08..15 verbs | (no new lint) | preserved |
| v1.2 | golden-parity re-recorded; new `toBeIdOf` matcher composable across both backends; 1033 files at 0 violations on no-commit-id lint, 1071 at 0 on no-raw-git | **+ `lint-vcs-no-commit-id.cjs`** (commit_id-leak guard) | preserved (18 = 18 baseline check) |

### Top Lessons (Verified Across Milestones)

1. **Lint guards are durable architecture-enforcement primitives.** v1.0's `no-raw-git` and v1.2's `no-commit-id` both started as Phase-final close-gate proofs and became permanent CI invariants. The pattern: "first green run is the FLIP completeness proof" generalizes.
2. **Hard rename + compiler-as-forcing-function (Phase 2.1) > deprecated-alias migration.** v1.2's `LogEntry.hash → .id` rename with no alias swept ~40 consumer sites mechanically. Aliases would have created indefinite "should I use the new or old name?" debt; the compiler errors made the migration atomic.
3. **Three-layer audit pattern: closed verdict enum + JSON sidecar + lint allowlist.** Verified across `audit-workflow-script-paths.cjs` (v1.0) and `audit-id-namespace.cjs` (v1.2). Future audits should default to this shape.
4. **CJS consumer sweeps need explicit grep-acceptance, not just compiler-trust.** v1.0 Phase 2 and v1.2 Plan 2 both hit late-discovered CJS-side misses after TS hard renames. The fix is mechanical (add a `grep -c "old\.name"` acceptance check on `*.cjs` files) and should be a standard executor step for any hard-rename phase.
