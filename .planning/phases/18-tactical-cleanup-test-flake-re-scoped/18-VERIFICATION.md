---
phase: 18-tactical-cleanup-test-flake-re-scoped
verified: 2026-06-10T22:45:25Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification: false
---

# Phase 18: Tactical cleanup + test-flake (re-scoped) Verification Report

**Phase Goal:** Close the v14-* todos and Phase 14 code-review WR-01..05 followups that Phase 19's restructure relocated but did not fix: the `gsd-core/workflows/transition.md` false-clean-WC gap, the `dogfood-restore.sh` precondition/overlay hardening, the dispatch-handler input guards in `src/vcs-command-router.cts`, the CONFIG-02 test tmpDir leaks, and the `jj-reap > inclusion-filter` flake (re-verify first).
**Verified:** 2026-06-10T22:45:25Z
**Status:** passed
**Re-verification:** No — initial verification

## Methodology Note: Review-Fix Supersessions

18-REVIEW.md (`status: fixed`, 7 findings fixed post-execution) deliberately strengthened several plan/ROADMAP literals. These are documented intent-preserving supersessions, verified as such — NOT deviations:

| Plan/ROADMAP literal | Shipped (post-review-fix) | Review finding | Verdict |
|---|---|---|---|
| Gate probe `gsd_run query diff --name-only` | Fail-closed two-stage `gsd_run query status --porcelain` + `jq -re` envelope assertion (every probe-failure mode aborts; sees untracked + staged-only on git) | WR-01 + WR-02 (`kkktupwtwwpz`), applied byte-consistently to transition.md / execute-phase.md:1691 / plan-phase.md:1781 mirrors | Strictly stronger; intent (halt on dirty WC) preserved — independently fixture-proven below |
| `Number.isNaN(maxConcurrency)` guard | `Number.isNaN \|\| !Number.isInteger \|\| < 1` + `i + 1 < args.length` argv form (rejects 0/-2/2.5/Infinity/'') | WR-03 (`yykktkqolpzq`), emitted .cjs rebuilt alongside | Strictly stronger; D-07 absent-flag→undefined contract preserved (test green) |
| dogfood-restore wrong-cwd `ERROR:` label | `FATAL:` label (matches adjacent tarball check) | IN-03 (`txqmossnpzvp`) | Cosmetic alignment; exit-1 pre-mutation behavior identical — verified live |
| `${completed_phase}` in line-168 commit message | `${current_phase}` (in scope at that fence; same value by definition) | WR-04 (`nklyoqzxkwmn`) | Bug fix to the graft itself |

## Goal Achievement

### Observable Truths (merged: ROADMAP SC1–SC5 + plan must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | transition.md mutating steps each gain an immediate `gsd_run query commit`; `assert_clean_wc` gate lands before terminal banners; synthetic uncommitted file halts the flow; global-install caveat documented | ✓ VERIFIED | 5 commit fences counted (non-comment `gsd_run query commit` = 5: L168 phase.complete, L269 PROJECT.md, L404 STATE.md sweep, L628+L685 tolerant config-set commits ×2); `<step name="assert_clean_wc">` at L416, before `offer_next_phase` at L474; **live fixture run by verifier**: throwaway colocated jj repo, dirty WC → exit 1 + `FATAL: working copy is dirty before transition completion.` with PLANNING_DIRTY/OTHER_DIRTY categorization, clean WC → exit 0; global-install caveat in 18-01-SUMMARY (`node bin/install.js --claude --global`, never upstream npx) |
| SC2 | dogfood-restore.sh asserts project root before `jj op restore` + `tar -xf`; tar-overlay ambiguity resolved (documented asymmetry, option b) | ✓ VERIFIED | `[ -f .planning/STATE.md ] \|\| { ... exit 1; }` at L56 — after positional parse (L50-51), before tarball check (L73), `jj op restore` (L79), `tar -xf` (L92); **live wrong-cwd run**: `cd /tmp && bash .../dogfood-restore.sh x y` → exit 1, `FATAL: dogfood-restore.sh must run from project root` (root assertion fires, not tarball FATAL); overlay-asymmetry comment block L81-90 adjacent to `tar -xf` states additive top-up is intended, `jj op restore` is the actual rollback, destructive clean-overlay rejected, Phase 14 P05 cited; `node --test tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` → 2/2 pass |
| SC3 | Router returns `{ok:false, reason:'plan_not_array'}` for non-array plans and rejects invalid `--max-concurrency`, both with contract tests pinning envelope shape | ✓ VERIFIED | `plan_not_array` guard at vcs-command-router.cts:1216-1218, `max_concurrency_invalid` guard at :1160-1167, both BEFORE `createVcsAdapter(cwd)` at :1220; emitted `gsd-core/bin/lib/vcs-command-router.cjs` parity (guards at :1101, :1150); **live run**: `npx vitest run --project unit .../cmd-parallel-max-concurrency-cli.test.ts` → 15/15 pass incl. `describe('CLEANUP-05/06 — dispatch input guards')` (4 non-array shapes + NaN/banana/0/-2/2.5/Infinity/'' rejections + accepts 1/4 + D-07 absent→undefined), `recordedDispatchOpts.length === 0` proves adapter never reached |
| SC4 | CONFIG-02 describes include `afterEach` rm cleanup; leaked dirs eliminated (test-run-then-inspect-tmp) | ✓ VERIFIED | Both files: `let tmpDir: string` describe-scoped (jj:782, git:1011), `afterEach` with `if (tmpDir) await rm(tmpDir, { recursive: true, force: true })` (jj:784-788, git:1013-1017), all 6 mkdtemp sites converted to assignment; **live run under private TMPDIR**: 6 CONFIG-02 tests pass, `ls -d $TMPDIR/gsd-cfg02-*` → 0 dirs (was 6 leaks/run) |
| SC5 | TEST-17 resolved by one verdict: (a) narrow fix or (b) not reproducible in 3+ full-suite runs → resolved-by-restructure with evidence | ✓ VERIFIED | Verdict (b) recorded in 18-03-SUMMARY with 5-run evidence table: 3 consecutive full-suite runs 618/618 passing, inclusion-filter PASS 435/464/442ms (~65x under the 30s budget), plus regression-gate 3-file shape (PASS 473ms) and isolation control (PASS 419ms); **verifier re-ran isolation control**: PASS 428ms, exit 0; `jj-reap.test.ts` untouched (no timeout/retry/skip edits — only pre-existing exempt `describe.skipIf`); `vitest.config.ts` retains locked 19-11 values (maxWorkers: 2 at :44, unit testTimeout: 30_000 at :58) |

**Score:** 5/5 ROADMAP Success Criteria verified (all 12 plan-level must_have truths fold into these and are individually accounted for above or in supersessions)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `gsd-core/workflows/transition.md` | commit-adjacency + assert_clean_wc gate; contains `<step name="assert_clean_wc">` | ✓ VERIFIED | Step at L416 (count exactly 1); substantive 57-line gate step with fail-closed probe, categorized diagnostics, "Why unconditional" + "Do not bypass" prose; launcher embed count stays 1 (`git rev-parse --show-toplevel` = 1, frozen baseline intact) |
| `src/vcs-command-router.cts` | Array.isArray + numeric fail-closed guards; contains `plan_not_array` | ✓ VERIFIED | Both guards present, both return before adapter creation; review-strengthened positive-integer form |
| `src/vcs/__tests__/cmd-parallel-max-concurrency-cli.test.ts` | contract tests; contains `max_concurrency_invalid` | ✓ VERIFIED | New describe with table-driven its; 15/15 green live |
| `scripts/dogfood-restore.sh` | project-root assertion + overlay-asymmetry block; contains `.planning/STATE.md` | ✓ VERIFIED | Assertion L56, comment block L81-90; behaviorally verified live |
| `src/vcs/__tests__/cmd-parallel-{jj,git}.test.ts` | CONFIG-02 afterEach cleanup | ✓ VERIFIED | Hoist + guarded afterEach in both; zero leaks live |
| `gsd-core/bin/lib/vcs-command-router.cjs` | emitted artifact in sync with .cts source | ✓ VERIFIED | Both guard reason strings present (:1101, :1150); rebuilt in `oxymxwvs` and again with WR-03 fix |
| `src/vcs/__tests__/jj-reap.test.ts` | untouched (verdict b) | ✓ VERIFIED | No timeout/retry/skip modifications; inclusion-filter passes live |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| transition.md assert_clean_wc | gsd-tools status verb | `gsd_run query status --porcelain` fail-closed probe (supersedes plan's `diff --name-only`) | ✓ WIRED | Live fixture run exercised the real verb end-to-end both polarities |
| transition.md update_roadmap_and_state | gsd-tools commit verb | commit fence immediately after `phase.complete` | ✓ WIRED | L167-168 adjacency confirmed; message uses in-scope `${current_phase}` (WR-04 fix) |
| contract tests | vcs-command-router dispatch handler | `VCS_VERB_TABLE['workspace.parallel.dispatch']` dynamic import | ✓ WIRED | 15/15 tests exercise the real handler through the existing vi.mock recorder |
| router guards | createVcsAdapter | early return BEFORE adapter creation | ✓ WIRED | Code order verified (:1166/:1217 < :1220); `recordedDispatchOpts.length === 0` assertions pass |
| jj-reap.test.ts | vitest.config.ts unit project | inherited 30_000ms testTimeout + maxWorkers 2 | ✓ WIRED | Config values confirmed at :44/:58; test passes under them |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Gate halts on dirty WC | ephemeral jj fixture + extracted fence body, dirty file | exit 1, FATAL + categorized paths | ✓ PASS |
| Gate passes on clean WC | same fixture, all committed | exit 0, no output | ✓ PASS |
| Wrong-cwd restore aborts pre-mutation | `cd /tmp && bash .../dogfood-restore.sh x y` | exit 1, `FATAL: ... must run from project root` | ✓ PASS |
| Restore orphan-cleanup tests | `node --test tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` | 2/2 pass | ✓ PASS |
| Dispatch guard envelopes | `npx vitest run --project unit cmd-parallel-max-concurrency-cli.test.ts` | 15/15 pass | ✓ PASS |
| CONFIG-02 zero-leak | targeted run under private TMPDIR + inspect | 6/6 pass, 0 `gsd-cfg02-*` dirs | ✓ PASS |
| inclusion-filter isolation control | `npx vitest run --project unit jj-reap.test.ts -t 'inclusion-filter'` | PASS 428ms, exit 0 | ✓ PASS |
| Lint gate: no-raw-git | `node scripts/lint-vcs-no-raw-git.cjs` | 1073 files, 0 violations, exit 0 | ✓ PASS |
| Lint gate: no-commit-id | `node scripts/lint-vcs-no-commit-id.cjs` | 1026 files, 0 violations, exit 0 | ✓ PASS |
| Lint gate: parallel-call-presence | `node scripts/lint-vcs-parallel-call-presence.cjs` | 107 files, 0 violations, exit 0 | ✓ PASS |
| Audit: workflow raw-git frozen baseline | `node scripts/audit-workflow-raw-git.cjs` | 230 hits / 0 regressions, PASS, exit 0 | ✓ PASS |
| Full suite (NOT re-run — cited per instruction) | `TMPDIR=$(mktemp -d) GSD_TEST_BACKENDS=git,jj npx vitest run` ×3 | 618/618 ×3, inclusion-filter PASS each (18-03-SUMMARY evidence table) | ✓ PASS (cited) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes exist in this repository; no probes declared by any Phase 18 PLAN/SUMMARY. Section not applicable.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CLEANUP-01 | 18-01 | transition.md assert_clean_wc + commit-adjacency | ✓ SATISFIED | SC1 row above |
| CLEANUP-03 | 18-02 | dogfood-restore project-root precondition pre-mutation | ✓ SATISFIED | SC2 row; live wrong-cwd run |
| CLEANUP-04 | 18-02 | tar-overlay ambiguity resolved (documented asymmetry, option b) | ✓ SATISFIED | Comment block L81-90 read and confirmed substantive (states asymmetry, intent, actual-rollback rationale) — the VALIDATION.md manual-review item, performed by verifier |
| CLEANUP-05 | 18-02 | `plan_not_array` Array.isArray guard + contract test | ✓ SATISFIED | SC3 row |
| CLEANUP-06 | 18-02 | `--max-concurrency` NaN rejection + contract test | ✓ SATISFIED | SC3 row (review-strengthened to positive-integer) |
| CLEANUP-07 | 18-02 | CONFIG-02 tmpDir leaks eliminated | ✓ SATISFIED | SC4 row |
| TEST-17 | 18-03 | jj-reap inclusion-filter flake verdict | ✓ SATISFIED | SC5 row; verdict (b) resolved-by-restructure with 5-run evidence |

No orphaned requirements: REQUIREMENTS.md maps exactly these 7 IDs to Phase 18 (traceability table L47-53); every ID is claimed by a plan and verified.

### Commit Audit

All claimed jj change IDs exist with matching descriptions: plan commits `urkvvkowqnpv`, `nuqmvomqksoz` (18-01); `nrzowuxruxop`, `mvprqrmpnwoy`, `oxrpsqmrnnvo`, `tnqskvnwwppu`, `zltrqouyotmu`, `oxymxwvs` (18-02, per-WR locked order 05→06→03→04→07 + artifact rebuild); `xwxoywywsulu`, `onnttkzlnqyu` (18-03); review fixes `kkktupwtwwpz`, `yykktkqolpzq`, `nklyoqzxkwmn`, `vkqwonkvsnvv`, `uppnmvszoyxo`, `txqmossnpzvp`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | None found. Scanned all 6 phase-modified files for TBD/FIXME/XXX/HACK/PLACEHOLDER/stub patterns; the only grep hit is a `gsd-dogfood-pre-XXXX` mktemp-template example in a pre-existing comment (not a debt marker). |

### Known Pre-Existing Conditions (NOT Phase 18 gaps)

1. **`scripts/check-skip-count.cjs` exits 1** (current=22 vs origin/main baseline=18). The +4 delta dates to Phase 13-era files (none touched by Phase 18); current count exactly equals the documented 19-13 fork baseline of 22. Phase 18 added zero net skip patterns (verified: none of the 4 flagged files are in this phase's modified set). The ROADMAP SC5 skip-count-green clause attaches to the verdict-(a) fix path, which never fired. Documented in 18-02/18-03 SUMMARYs.
2. **Intermittent `[vitest-worker] onTaskUpdate` birpc error** flips full-suite exit codes to 1 with zero test failures (2 of 3 evidence runs). Distinct defect class from TEST-17 (worker→main RPC starvation, not a test timeout); logged to phase `deferred-items.md` per Pitfall 9 scope fence with a triage rule for future gate runs.
3. **Pending todos `v14-*.md` still in `.planning/todos/pending/`** at verification time — expected: all three carry `resolves_phase: 18` and the `close_phase_todos` workflow step (execute-phase.md:1622) runs AFTER `verify_phase_goal` (:1426). Auto-close fires at phase completion, downstream of this report.
4. **Global-install staleness**: `~/.claude/gsd-core/workflows/` carries pre-fix transition.md until the operator runs `node bin/install.js --claude --global` from this clone (documented in all three SUMMARYs; operator action, not a code gap).

### Human Verification Required

None. No `<human-check>` blocks exist in any Phase 18 plan; the one VALIDATION.md manual-only item (CLEANUP-04 comment review) was a read-the-comment check performed by the verifier (block confirmed substantive). All behaviors were verified programmatically, including a live independent fixture reproduction of the SC1 gate.

### Gaps Summary

No gaps. All 5 ROADMAP Success Criteria are observably true in the codebase, verified by direct file inspection, live behavioral spot-checks (including an independent fixture re-run of the assert_clean_wc gate in both polarities), all four lint/audit gates green, and full-suite evidence cited from 18-03-SUMMARY (618/618 ×3). The review-fix deltas (status-porcelain probe, positive-integer concurrency guard, FATAL label, current_phase variable) are documented intent-preserving supersessions that strengthen, not weaken, the phase deliverables.

---

_Verified: 2026-06-10T22:45:25Z_
_Verifier: Claude (gsd-verifier)_
