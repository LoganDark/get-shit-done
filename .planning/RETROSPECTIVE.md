# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.3 — jj octopus merge for subagents fully functional

**Shipped:** 2026-05-24
**Phases:** 6 (Phases 9-14) | **Plans:** 34 | **Tasks:** 56 | **Requirements:** 27/27 verified

### What Was Built

- **`vcs.workspace.parallel.{dispatch, fanIn}` cross-backend verb surface.** jj backend via the new `sdk/src/vcs/jj/parallel.ts` composition layer (lifts `octopus.ts` + `reap.ts` + `workspace.merge` primitives into a single seam, preserves UPSTREAM-02 sidecar discipline). Git backend via `sdk/src/vcs/git/parallel.ts` adapter-internal sidecar (raw-git worktree+merge body localized to one file). Cross-backend `FanInResult` shape `{merged, conflicted, conflictedPaths, incompleteQueued, failedReaped, surplusBookmarks}` is identical on both backends.
- **Reap classifier extension.** `IncompleteWorkEntry.reason` widened 1 → 2 values (`'crashed-with-uncommitted-work'` + new `'merge-in-tree-conflict'`); jj-side conflict probe via `vcs.refs.conflicts()` revset; git-side producer via merge-exit-code + `git diff --name-only --diff-filter=U`. Parse-time validation rejects unknown values.
- **Orchestrator + agent rewire.** `execute-phase.md` and `quick.md` raw-git dispatch+cleanup blocks deleted and replaced with the cross-backend SDK verb calls. WAVE_WORKTREE_MANIFEST mktemp variable eliminated (Phase 11 D-01: Handle JSON in shell variable only — no file on disk). `workspace.assert-dispatched-cwd` SDK verb shipped + CLI bridge. `gsd-executor.md` raw-git-free at the read side (`git rev-parse --show-toplevel` retired in favor of `primaryWorkspacePath` from the verb's envelope). `tests/agent-prompts-no-raw-git.test.cjs` pins the agent-prompt-file deny-list with narrow regex that doesn't false-fire on the preserved `<destructive_git_prohibition>` block.
- **A3 colocated pre-commit fix (closed v1.0 carry-forward).** Path 1 selected at Phase 12 discuss-phase by re-reading Phase 4 LEARNINGS Open Q1 (archived `51ee72a3`). jj backend's `commit()` now always fires `.githooks/<stage>` in colocated mode; `GSD_HOOK_SKIP_COLOCATED` env as opt-out. HOOK-07 fires-exactly-once regression test + SC4 hook-idempotency audit shipped.
- **CI parallel-path lane.** `.github/workflows/parallel-e2e.yml` runs `scripts/e2e-parallel-phase.sh` (357-line synthetic 2-plan harness) end-to-end on both backends; `parallel-e2e-gate` job (`needs:`-gated, `if: always()`, aggregate-result inspection) enforces required-blocking on jj-colocated while keeping git allow-failure. CI-06 raw-git-audit step wired alongside.
- **LINT-04 baseline-regression guard.** `scripts/audit-workflow-raw-git.cjs` carries a frozen 127-hit per-file baseline (`Object.freeze`d); exits non-zero only when a file's raw-git count exceeds its baseline; SHELL_GIT_RE byte-identical to `lint-vcs-no-raw-git.cjs`. Reframed from "zero hits" to "no-regression" because zero was unachievable without breaking workflow markdown structure.
- **Dogfood toolkit (Phase 14).** `scripts/dogfood-restore.sh` (recovery primitive: `bash dogfood-restore.sh <pre-op-id> <tarball-path>`), `scripts/dogfood-rehearse.sh` (synthetic-dirty validation: 3/3 assertions green on `cp -a` clone), `scripts/dogfood-phase-14.sh` (real dogfood orchestrator). Ran end-to-end against THIS repo on isolated bookmark `gsd/phase-14-dogfood`: jj-cell dispatch_ms=6209 / fan_in_ms=780 / conflicts=0; git-cell dispatch_ms=390 / fan_in_ms=1276 / conflicts=0. Main bookmark unchanged (Pitfall 10 blast-radius bounded). Recovery anchor durable in two surfaces.
- **CONFIG-02 envelope at the CLI bridge.** `parallelization_disabled` validation envelope ships at the `workspace.parallel.dispatch` CLI bridge with strict-equal-`false` brownfield safety (peer to the three pre-existing validation envelopes). 6 D-03 mitigation contract tests across both backend test files.
- **`parallelization: true` default flip.** Install template's `parallelization` block flattened from nested 6-key object to flat boolean; this repo's `.planning/config.json` permanently flipped `false` → `true` so Phase 14 dogfood could dispatch.

### What Worked

- **Throwing-stub seam for backend-asymmetric ship.** Phase 9 plan 04 shipped a `GitVcsAdapter.workspace.parallel.{dispatch,fanIn}` throwing stub (frozen `Object.freeze({...})` mirroring RESEARCH §Stub pattern) — closed the wave-2 tsc compile gate against the cross-backend `VcsWorkspaceParallel` interface while keeping Phase 10's git implementation a separate, focused deliverable.
- **Same-PR coupling on `FanInResult` shape (v1.1 retro precedent).** D-09/D-10/D-11 cascade amendments encoded the jj-side+git-side contract delivery as a single same-PR landing — no jj-first / git-later gap that would have let the cross-backend shape drift.
- **Discuss-phase decisions deferred from roadmap time.** Phase 12 explicitly did NOT pre-decide the A3 fix path at roadmap. The choice happened at discuss-phase by re-reading Phase 4 LEARNINGS Open Q1 (archived `51ee72a3`). Path C (version-probe) ruled out, Path 1 selected. The roadmap doesn't have to make every decision — discuss-phase is where context catches up with codebase reality.
- **CI parallel-path lane shipped BEFORE default-flip.** CI-05/06 in Phase 13 → CONFIG-01/02 in Phase 14. Real CI validated the new verbs before any user-observable behavioral change. Caught two BLOCKER classes (CR-02/CR-03 in Phase 11, CR-01 in Phase 11 reverify) before they could ship to users.
- **Dogfood phase LAST (Pitfall 10).** Phase 14 ran the destructive op against the real repo on an isolated `gsd/phase-14-dogfood` bookmark with recovery anchor (`pre_op_id` + `tarball_sha256` + sibling mktemp path) durable in two surfaces. `MAIN_BEFORE` ≡ `MAIN_AFTER` invariant proven. Recovery primitive existed BEFORE the destructive op (validated by rehearsal step).
- **Pre-close `audit-open` caught what verifier missed.** Phase 13 verifier marked the LINT-04 unit test as `7/7 passes when invoked directly` — green pass, milestone-wave-completion declared. The pre-close `gsd-sdk query audit-open` caught that `scripts/run-tests.cjs:12` does non-recursive `readdirSync('tests')` so the test was actually never collected by `npm test`. The CI-06 regression guard was orphaned; the fix (recursive `readdirSync`) also rescued 3 other long-stranded `tests/scripts/*` files. Closed inline at v1.3 close.
- **Verifier-found gaps fixed inline as separate plans.** Phase 11 needed plan 11.08 and 11.10 to close VERIFICATION.md CR-01/CR-02/CR-03 BLOCKERs and PROMPT-08 raw-git read-side. Each plan addressed one block of failures with a targeted test that would have caught the original gap. The phase verification process is the integration test for the integration tests.

### What Was Inefficient

- **Phase 11 grew to 11 plans (largest of v1.3).** Five of those were verifier-induced closure plans (CR-01, CR-02, CR-03, PROMPT-08, plus the dispatch-cwd-safety rename). Suggests Phase 11's initial plan-phase under-specified the cross-backend opaque contract; the verifier surfaced gaps faster than the planner anticipated them. Future plan-phase for orchestrator-rewire work should explicitly enumerate every read-side raw-git call site as a plan input.
- **`tests/scripts/` discovery gap was pre-existing.** Phase 13 propagated the dead-test pattern (`tests/scripts/migr-06-close-gate.test.cjs` from v1.2 had also never been collected) rather than catching it. Phase 13 verification observed the local test pass but didn't probe whether `npm test` ran it. The fix at v1.3 close also rescued allowlist-parser + audit-id-namespace tests that had been silently broken across multiple milestones.
- **Several SUMMARY.md files lack a `one_liner:` field.** `gsd-sdk query summary-extract --fields one_liner` returned `"One-liner:"` (empty label) or `"Before:"` (different field) for some plans, polluting the MILESTONES.md accomplishments list during archive. The executor's SUMMARY template isn't enforcing the field. Future: gate phase complete on `one_liner` non-empty (lint or pre-commit hook).
- **Phase 14 latent `jq .ok//"true"` bug.** CR-01 from Phase 14's code review found that the dogfood orchestrator script's envelope guard used `jq .ok // "true"` (defaulting to `"true"` when `.ok` was absent), which would have masked a real `{ok:false}` failure. Didn't fire during the actual dogfood (`parallelization=true` so every dispatch succeeded), but the test pattern broke through code-review's adversarial reading. Lesson: every envelope guard needs an explicit `if-then-else` form, no `//` shortcuts on bool fields.

### Patterns Established

- **Throwing-stub before fill across waves.** When a backend lags behind the cross-backend contract by a phase (jj-first in 9, git-fill in 10), the lagging backend ships a frozen-object throwing stub at the contract boundary. Wave-2 tsc compile gate closes; consumers see a clear `VcsNotImplementedError` until the real verb lands. (Reusable for any future cross-backend interface extension.)
- **Recovery primitive before destructive op.** Pitfall 10 dogfood pattern: `scripts/dogfood-restore.sh` written + rehearsal-validated BEFORE `scripts/dogfood-phase-14.sh` ran. Recovery anchor (`pre_op_id` + `tarball_sha256` + sibling mktemp path) durable in two surfaces. The safety net exists at commit time, not "we'll write it if something goes wrong."
- **Audit-as-baseline reframe.** When a "zero violations" goal is structurally unachievable (workflow markdown legitimately needs `git` references in some shell fences for documentation), reframe as "no regression beyond a frozen baseline" with the baseline captured at audit time as an `Object.freeze`d per-file map. LINT-04 ships this way; future similar audits should default to it.
- **CI lane BEFORE behavioral default-flip.** Validate the new behavior in real CI on real workflows before the user-observable default changes. CI-05/06 → CONFIG-01/02 phase ordering; do not couple the lane addition with the default-flip in a single phase.
- **Same-PR coupling encoded in plan must-haves.** When two backends ship a contract together (D-09/D-10/D-11), the plan's must_haves explicitly mention both backends; verifier blocks if either is missing. Plan-time enforcement, not commit-time hope.

### Key Lessons

1. **Audit-open must include a test-discovery check, not just "tests pass when invoked."** Phase 13's verifier ran `node --test tests/scripts/audit-workflow-raw-git.test.cjs` and observed green — but `npm test` never collected the file. The implementation-detail-of-the-runner mattered. Future verification protocols need an explicit "is this test reachable from `npm test`?" probe alongside "does it pass when run directly?"
2. **Recovery primitives are first-class deliverables for any phase touching live state.** Phase 14 paid the cost of writing the recovery script + rehearsal harness BEFORE the destructive op; the cost paid for itself in zero anxiety during the real dogfood run. Generalizes: any phase that touches `.planning/`, the working copy, or bookmarks on `main` should ship a tested recovery primitive in the same phase.
3. **Cross-backend opacity at the verb surface.** Every `vcs.workspace.parallel.*` consumer (workflows, agents, scripts) treats both backends identically. The `WorkspaceInfo.path` is an fs realpath on git, a workspace name on jj — and the consumer must never know which (CR-01 in Phase 11 was a backend-opaque-contract violation that halted every jj agent). Lesson: cross-backend types must carry no field that the consumer would conditionally branch on; if branching exists, it's a defect.
4. **The verifier IS the integration test for the integration tests.** Phase 11's 5 verifier-induced closure plans (CR-01/02/03 + PROMPT-08 + dispatch-cwd-safety rename) were each closed by a targeted regression test that would have caught the original gap. The verification loop's value isn't "did we verify correctly" — it's "what test should have caught this." Encode the answer.
5. **One config knob, one envelope.** CONFIG-02 (`parallelization_disabled` envelope) sits at the CLI bridge with strict-equal-`false` checks (NOT `!== true`) so the envelope is brownfield-safe when older configs have `parallelization` unset. Strict equality on the rejection path; absent = current default. Generalizes to any feature-flag rollout that distinguishes "explicit opt-out" from "default-off legacy."

### Cost Observations

- **Model mix:** ~100% Opus 4.7 (orchestrator + all subagents) — same tier choice as v1.2.
- **Sessions:** many, spanning 2026-05-15 → 2026-05-23 (~9 days). v1.3 was the first multi-week milestone; v1.2 had been 1 sustained autonomous chain. Phase 11's plan inflation (11 plans, 5 verifier-induced) was the longest single phase.
- **Notable efficiency:** Phase 14's dogfood ran clean on both backends in one shot. The CI parallel-path lane was already green from Phase 13, so no recovery iterations were needed during the real dogfood. The recovery primitive existed but wasn't called.
- **Notable cost:** Phase 11's plan inflation. Verifier rework cost roughly 2x the original phase plan because each verifier-found BLOCKER required a separate closure plan with its own discuss/plan/execute/verify cycle. Net-net the rework was correct (BLOCKERs were real), but plan-phase should have surfaced the cross-backend-opaque contract requirements upfront.

---

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
| v1.3 jj octopus merge for subagents fully functional | many across 9 days | 6 (Phases 9-14) | Cross-backend parallel verb surface (`vcs.workspace.parallel.{dispatch,fanIn}`) on both backends; orchestrator rewired (raw-git in workflow markdown → zero in execute-phase + quick); A3 colocated pre-commit gap closed (inherited from v1.0); CI parallel-path lane validates verbs before default-flip; dogfood phase LAST with recovery anchor (Pitfall 10) |

### Cumulative Quality

| Milestone | Tests (jj lane) | Lint Guards | Skip-Count Baseline |
|-----------|---|-----|---|
| v1.0 | parameterized vitest + node:test on both backends; jj-colocated CI required-blocking from Phase 5 | `lint-vcs-no-raw-git.cjs` (whole-repo default-deny) | tracked from Phase 5 |
| v1.1 | golden-parity strict-green on both backends for new VCS-08..15 verbs | (no new lint) | preserved |
| v1.2 | golden-parity re-recorded; new `toBeIdOf` matcher composable across both backends; 1033 files at 0 violations on no-commit-id lint, 1071 at 0 on no-raw-git | **+ `lint-vcs-no-commit-id.cjs`** (commit_id-leak guard) | preserved (18 = 18 baseline check) |
| v1.3 | new `parallel-e2e` CI lane runs synthetic 2-plan parallel phase end-to-end on both backends, required-blocking on jj-colocated; `tests/scripts/*` now recursively collected by `scripts/run-tests.cjs` (4 previously stranded tests rescued); `tests/agent-prompts-no-raw-git.test.cjs` pins agent-prompt deny-list | **+ `scripts/audit-workflow-raw-git.cjs`** (baseline-regression guard, 127-hit per-file frozen baseline) wired into CI-06 step | +4 carried debt acknowledged (Phase 10/11 SDK files, not Phase-13-caused); LINT-05 allowlist net diff +1 (within budget) |

### Top Lessons (Verified Across Milestones)

1. **Lint guards are durable architecture-enforcement primitives.** v1.0's `no-raw-git` and v1.2's `no-commit-id` both started as Phase-final close-gate proofs and became permanent CI invariants. The pattern: "first green run is the FLIP completeness proof" generalizes.
2. **Hard rename + compiler-as-forcing-function (Phase 2.1) > deprecated-alias migration.** v1.2's `LogEntry.hash → .id` rename with no alias swept ~40 consumer sites mechanically. Aliases would have created indefinite "should I use the new or old name?" debt; the compiler errors made the migration atomic.
3. **Three-layer audit pattern: closed verdict enum + JSON sidecar + lint allowlist.** Verified across `audit-workflow-script-paths.cjs` (v1.0) and `audit-id-namespace.cjs` (v1.2). Future audits should default to this shape.
4. **CJS consumer sweeps need explicit grep-acceptance, not just compiler-trust.** v1.0 Phase 2 and v1.2 Plan 2 both hit late-discovered CJS-side misses after TS hard renames. The fix is mechanical (add a `grep -c "old\.name"` acceptance check on `*.cjs` files) and should be a standard executor step for any hard-rename phase.
