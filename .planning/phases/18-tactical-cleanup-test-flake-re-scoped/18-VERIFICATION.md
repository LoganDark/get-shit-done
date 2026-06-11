---
phase: 18-tactical-cleanup-test-flake-re-scoped
verified: 2026-06-11T09:34:49Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 0
re_verification: true
re_verification_context:
  previous_status: passed # 18-VERIFICATION.md 2026-06-10 — superseded by 18-UAT.md test 5 blocker (status: diagnosed)
  previous_score: 5/5
  gaps_closed:
    - "assert_clean_wc gate passes silently (exit 0) on a clean working copy on BOTH backends (18-UAT.md test 5 blocker — closed by gap plan 18-04)"
  gaps_remaining: []
  regressions: []
---

# Phase 18: Tactical cleanup + test-flake (re-scoped) Verification Report

**Phase Goal:** Execute the 7 REQ-IDs deferred at v1.4 close against the post-Phase-19 tree (CLEANUP-01, CLEANUP-03..07, TEST-17).
**Verified:** 2026-06-11T09:34:49Z
**Status:** passed
**Re-verification:** Yes — after gap-closure plan 18-04 (UAT test 5 blocker: assert_clean_wc false-positive on clean jj WC)

## Re-verification Scope

The 2026-06-10 verification passed 5/5 ROADMAP SCs, then the UAT cycle live-reproduced a blocker (test 5): the assert_clean_wc gate keyed DIRTY on `.raw`, which on the jj backend is human-readable `jj st` text that is never empty — every clean-WC gate check on a jj repo FATALed, blocking all transitions and phase completions. Gap plan 18-04 (gap_closure: true, requirement CLEANUP-01) re-keyed all fences on the structured `entries[]` array. This re-verification gives the 18-04 must-haves full 3-level + behavioral verification and runs regression checks on the previously-passed SC1–SC5 items.

## Goal Achievement

### Observable Truths (18-04 gap-closure truths — full verification)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| G1 | assert_clean_wc gate exits 0 silently on a CLEAN working copy under the jj backend (UAT test 5 false-positive closed) | ✓ VERIFIED | **Three independent proofs by this verifier, not SUMMARY citation:** (1) extracted the live transition.md fence body and ran it on THIS repo (vcs.adapter jj, clean WC) → exit 0, zero output — the exact UAT test 5 reproduction; (2) independent ephemeral colocated-jj fixture (mktemp, `jj git init --colocate`, config pinned `{"vcs":{"adapter":"jj"}}`, GSD_VCS unset, backend meta-asserted: raw contains "Working copy") → clean run exit 0 silent; (3) jq predicate fed a synthetic clean envelope `{"ok":true,"entries":[],"raw":"The working copy has no changes."}` → exit 0, empty output (the per-entry `//` pipe keeps an empty stream clean-silent) |
| G2 | Gate exits 1 with FATAL banner + categorized dirty-file listing on a DIRTY working copy under BOTH backends | ✓ VERIFIED | jj: verifier's own fixture, `touch dirty-synthetic.txt` → exit 1, stderr contains `FATAL: working copy is dirty before transition completion` (1 hit) and `dirty-synthetic.txt` (1 hit). git: predicate is backend-agnostic (synthetic dirty envelope → emits path → FATAL branch); the git polarity was additionally live-verified in the initial verification's fixture and in the 18-04 SUMMARY 12-run matrix (runs 7–12) |
| G3 | Every probe-failure mode aborts — never resolves to clean (sole documented residual: swallowed backend exec failure, deferred as REQ-18-04-A) | ✓ VERIFIED | Verifier ran the exact fence jq predicate against 8 synthetic envelopes: clean → exit 0 empty; dirty → exit 0 path; pathless entry → exit 5 `entry missing path`; MIXED pathed+pathless → exit 5 (never silently dropped); `ok:false` → exit 5; entries missing → exit 5; entries non-array → exit 5; unparseable JSON → exit 5. The `STATUS_JSON=$(...) \|\| FATAL` line catches non-zero query exit. Residual REQ-18-04-A (jj.cts status() swallows non-zero `jj st` into `{entries:[],raw:stderr}` + statusVerb unconditional ok:true) is documented in deferred-items.md §3(c) with explicit why-not-here rationale |
| G4 | /gsd-undo dirty-tree guard no longer unconditionally aborts on a clean jj working copy | ✓ VERIFIED | undo.md:215 now runs the identical entries-keyed jq predicate (old `jq -r '.raw // ""'` — zero grep hits); on this clean jj repo the predicate emits empty output exit 0 (proven via G1 live runs of the same predicate); abort-on-probe-failure sentence + ".raw is human-readable jj st text" warning present; HARD CONSTRAINT line and backend-semantic-shift callout untouched (read and confirmed) |

### Observable Truths (ROADMAP SC1–SC5 — regression checks on previously-verified items)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | transition.md mutating steps each gain immediate `gsd_run query commit`; assert_clean_wc gate before terminal banners; synthetic uncommitted file halts flow; global-install caveat documented | ✓ VERIFIED (regression + strengthened) | `<step name="assert_clean_wc">` count = 1; non-comment `gsd_run query commit` count = 5; gate behaviorally re-proven both polarities on jj (G1/G2 — strictly stronger than the original git-only fixture); global-install caveat re-documented in 18-04-SUMMARY (`node bin/install.js --claude --global`, never upstream npx) |
| SC2 | dogfood-restore.sh asserts project root before `jj op restore` + `tar -xf`; overlay ambiguity documented | ✓ VERIFIED (regression) | Assertion intact at scripts/dogfood-restore.sh:56 (`[ -f .planning/STATE.md ] \|\| { echo "FATAL: ... must run from project root" ...exit 1; }`); `node --test tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` → 2/2 pass live this session |
| SC3 | Router returns `{ok:false, reason:'plan_not_array'}` for non-array plans and rejects invalid `--max-concurrency`, contract tests pin envelopes | ✓ VERIFIED (regression) | Guards intact: vcs-command-router.cts:1166 (`max_concurrency_invalid`), :1217 (`plan_not_array`); emitted gsd-core/bin/lib/vcs-command-router.cjs carries both reason strings; live run this session: `npx vitest run --project unit cmd-parallel-max-concurrency-cli.test.ts` → 15/15 pass |
| SC4 | CONFIG-02 describes include afterEach rm cleanup; leaked dirs eliminated | ✓ VERIFIED (regression) | Guarded `if (tmpDir)` afterEach present in both cmd-parallel-{jj,git}.test.ts (1 hit each); zero-leak behavior live-verified in initial verification (6/6 pass, 0 `gsd-cfg02-*` dirs) |
| SC5 | TEST-17 resolved by one verdict — (b) not reproducible in 3+ full-suite runs, resolved-by-restructure with evidence | ✓ VERIFIED (regression) | jj-reap.test.ts still untouched: zero hits for `15_000\|15000\|retry\|concurrent: false`; verdict (b) + 5-run evidence table stands in 18-03-SUMMARY (618/618 ×3, inclusion-filter ~440ms); isolation control re-run live in initial verification (PASS 428ms) |

**Score:** 9/9 must-haves verified (4 gap-closure truths + 5 ROADMAP SCs)

### Required Artifacts (18-04)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `gsd-core/workflows/transition.md` | entries-keyed assert_clean_wc fence; contains `[.entries[] \| (.path // error(` | ✓ VERIFIED | Pattern at L441; full fence read (L416–475): fail-closed two-stage probe, categorized PLANNING_DIRTY/OTHER_DIRTY diagnostics, "Why unconditional" + "Do not bypass" prose intact; behaviorally exercised live |
| `gsd-core/workflows/execute-phase.md` | identical predicate, phase-completion wording | ✓ VERIFIED | Pattern at L1698; STATUS_JSON/DIRTY_PATHS lines byte-identical to transition.md (extracted + diffed: zero difference) |
| `gsd-core/workflows/plan-phase.md` | identical predicate, phase-planned wording | ✓ VERIFIED | Pattern at L1788; probe lines byte-identical (diff-verified); banner "before phase planning declaration" + shorter categorize-comment variant preserved. See CR-01 warning below re: §16 reachability |
| `gsd-core/workflows/undo.md` | entries-keyed dirty-tree guard before execute_revert | ✓ VERIFIED | Pattern at L215; old `.raw // ""` form gone; abort-on-failure + .raw warning sentences present; HARD CONSTRAINT untouched |
| `deferred-items.md` §3 | raw-asymmetry decision, dormant .raw checks, REQ-18-04-A | ✓ VERIFIED | Section 3 present with (a) asymmetry decision + pinning consumers, (b) dormant checks at execute-phase.md:307 / quick.md:208 — both confirmed by verifier to sit inside git-mode-only raw-git branching blocks (`branching_strategy != "none"` blocks, dormant on jj), (c) REQ-18-04-A with explicit follow-up REQ line and why-deferred rationale |

Removal checks: `then .raw else` → zero hits across all of gsd-core/workflows/; raw fallback `|| DIRTY_PATHS="$DIRTY"` → zero hits in the three fence files.

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| {transition,execute-phase,plan-phase}.md assert_clean_wc fences | src/vcs/backends/jj.cts status() structured entries[] | `gsd_run query status --porcelain` envelope (`.entries`, NOT `.raw`) | ✓ WIRED | Exercised end-to-end live: extracted fence → gsd_run shim → gsd-tools.cjs → jj backend on this repo (clean, exit 0) and on the ephemeral fixture (both polarities); jq pattern `[.entries[] \| (.path // error(` present at all four sites |
| undo.md dirty guard | same status verb | same entries predicate (pipeline form) | ✓ WIRED | Same predicate, same verb; review IN-03 notes the one-liner pipeline form is safe today only via jq `-e` semantics (info-level, see Anti-Patterns) |

### Behavioral Spot-Checks (run this session by the verifier)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Live-repo clean probe (UAT test 5 reproduction) | `gsd-tools.cjs query status --porcelain \| jq -e '.ok and (.entries\|length==0)'` on this jj repo | true, exit 0 | ✓ PASS |
| Full transition fence on clean jj WC (live repo) | extracted fence body + gsd_run shim | exit 0, zero output | ✓ PASS |
| Fence on independent jj fixture, clean | colocated-jj mktemp fixture, adapter pinned jj, backend meta-asserted | exit 0, silent | ✓ PASS |
| Fence on jj fixture, dirty | `touch dirty-synthetic.txt` then fence | exit 1, FATAL banner + file listed | ✓ PASS |
| jq predicate 8-mode envelope matrix | synthetic clean/dirty/pathless/mixed/non-ok/missing/non-array/garbage | clean+dirty correct; all 6 failure modes exit non-zero | ✓ PASS |
| Probe-line byte-identity across 3 fences | extract STATUS_JSON/DIRTY_PATHS lines, diff | zero difference | ✓ PASS |
| Frozen raw-git audit | `node scripts/audit-workflow-raw-git.cjs` | 230 hits / 0 regressions, exit 0 | ✓ PASS |
| Lint: no-raw-git | `node scripts/lint-vcs-no-raw-git.cjs` | 1073 files, 0 violations | ✓ PASS |
| Lint: parallel-call-presence | `node scripts/lint-vcs-parallel-call-presence.cjs` | 107 files, 0 violations | ✓ PASS |
| CLEANUP-05/06 contract tests | `npx vitest run --project unit cmd-parallel-max-concurrency-cli.test.ts` | 15/15 pass | ✓ PASS |
| dogfood-restore orphan-cleanup tests | `node --test tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` | 2/2 pass | ✓ PASS |

Full suite NOT re-run (once-per-verification rule; 618/618 ×3 evidence stands in 18-03-SUMMARY, cited in initial verification).

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes exist in this repository; none declared by any Phase 18 PLAN/SUMMARY. Section not applicable.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CLEANUP-01 | 18-01 + 18-04 | transition.md commit-adjacency + assert_clean_wc gate (now entries-keyed, cross-backend) | ✓ SATISFIED | SC1 + G1–G3; gap-closure commits `uxpxzztx` (fix) and `poommzxw` (docs) both present in the log with matching descriptions |
| CLEANUP-03 | 18-02 | dogfood-restore project-root precondition pre-mutation | ✓ SATISFIED | SC2 regression check |
| CLEANUP-04 | 18-02 | tar-overlay ambiguity resolved (documented asymmetry) | ✓ SATISFIED | Verified in initial verification (comment block L81-90 read, substantive); file unchanged since |
| CLEANUP-05 | 18-02 | `plan_not_array` Array.isArray guard + contract test | ✓ SATISFIED | SC3; note review WR-01 requests entry-shape validation BEYOND the requirement's explicit Array.isArray scope — enhancement, not a gap (see Anti-Patterns) |
| CLEANUP-06 | 18-02 | `--max-concurrency` NaN rejection + contract test | ✓ SATISFIED | SC3 (review-strengthened positive-integer form) |
| CLEANUP-07 | 18-02 | CONFIG-02 tmpDir leaks eliminated | ✓ SATISFIED | SC4 regression check |
| TEST-17 | 18-03 | jj-reap inclusion-filter flake verdict | ✓ SATISFIED | SC5; verdict (b) resolved-by-restructure, evidence intact |

No orphaned requirements: REQUIREMENTS.md traceability (L47-53) maps exactly these 7 IDs to Phase 18; all are claimed by plans and all 7 checkboxes are marked `[x]`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `gsd-core/workflows/plan-phase.md` | 1698, 1762 vs 1764 | **CR-01 (18-REVIEW.md, Critical): §16 assert_clean_wc gate routed-past** — §14 "Route to `<offer_next>` OR `auto_advance`" and §15's manual branch "Route to `<offer_next>`" both transfer control before §16 is encountered; §16's own prose (L1816) says it protects the manual route, which is exactly the route that jumps. Under literal instruction-following the plan-phase gate is dead code on both paths | ⚠️ WARNING (not a phase-goal blocker — see weighing below) | Gate's protective value at ONE of three sites is structurally bypassed; predicate itself is correct |
| `gsd-core/workflows/undo.md` | 215 | IN-03 (18-REVIEW.md): one-liner pipeline instead of two-stage probe — probe failure caught only via jq `-e` accident, diverges from sibling-gate pattern | ℹ️ INFO | Fail-closed today; pattern divergence only |
| `src/vcs-command-router.cts` | 1216-1218 | WR-01 (18-REVIEW.md): plan_not_array validates container, not entries — `[null]`/`[42]` reach the adapter and throw raw TypeErrors | ⚠️ WARNING | Beyond CLEANUP-05's explicit Array.isArray scope; tracked by the review loop |
| — | — | Debt markers (TBD/FIXME/XXX) in phase-modified files | — | None. plan-phase.md's "TBD" hits (L1501/1662-1663) are functional `phase_req_ids` null/TBD sentinel vocabulary, not debt comments. execute-phase.md's `TODO(05-05 sweep)` at ~L296 is pre-existing, references formal sweep scope, and sits in a git-mode-only block untouched by this phase |

**CR-01 weighed against the 18-04 must_have (the explicit re-verification question):** CR-01 does NOT defeat "assert_clean_wc gate exits 0 silently on a CLEAN working copy under the jj backend." Reasoning:

1. The must_have describes the gate's *predicate behavior when executed* — the UAT test 5 failure mode was the gate FIRING wrongly (false-positive FATAL on clean), which blocked every transition. Unreachability cannot produce a false positive; the predicate, behaviorally proven at all three sites (byte-identical lines), is correct.
2. The UAT gap's named artifacts were transition.md and execute-phase.md — both are ordinary fall-through gates with no intervening jump (confirmed by this verifier and by 18-REVIEW.md itself: "Gate ordering in execute-phase.md and transition.md is sound"). The blocker — transitions and phase completions aborting on this repo — is closed, live-proven.
3. The §16 placement after the §14/§15 routing prose is **pre-existing**: 18-01-PLAN (authored before any Phase 18 execution) cites plan-phase.md's assert_clean_wc step at ~L1764-1804 as the precedent pattern source. Phase 18 (WR-01/WR-02 review fix + 18-04) modified predicate bytes inside the existing fence; it did not move the section or author the routing instructions. CR-01 is a latent pre-existing control-flow defect surfaced by the fresh review, not a Phase 18 regression.
4. Phase-goal scope: CLEANUP-01 targets transition.md. plan-phase.md §16 reachability is outside all 7 REQ-IDs.
5. The 18-04 declared artifact check for plan-phase.md (`contains` pattern) and key_link (fence → status verb via the jq pattern) are both satisfied.

Disposition: WARNING. CR-01 is correctly filed in 18-REVIEW.md (status: issues_found) with a concrete small fix (run §16 before routing, or renumber); it should be remediated through the review-fix loop before or alongside milestone close. It does not reopen the 18-04 gap and does not block phase-goal achievement.

### Commit Audit

Gap-closure commits verified present via `gsd-tools.cjs query log` (jj change ids): `uxpxzztxzqunoxzxnuwtpmptslznonsk` — "fix(18-04): key assert_clean_wc + undo dirty guard on status entries, not .raw"; `poommzxwlxuoklnyvmskloqrqpltvwuw` — "docs(18-04): record raw-asymmetry, dormant .raw checks + swallowed-exec-failure REQ; gate verified on jj+git fixtures"; plus plan-completion `oklyomusksnwsozyusoquxknsnolsnwv` and the XL size-budget re-baseline `sryorztslpzprmttlnroqrozxpnkyqwz`. Initial-verification commit audit (18-01/02/03 + review-fix ids) stands unchanged.

### Known Conditions (NOT Phase 18 gaps)

1. **CR-01 plan-phase.md §16 reachability** — pre-existing, Critical in 18-REVIEW.md (status: issues_found); route through the review-fix loop (see weighing above).
2. **REQ-18-04-A** — swallowed backend exec failure presents as a clean envelope (jj.cts status() catch + statusVerb unconditional ok:true); explicitly deferred with rationale in deferred-items.md §3(c); the gate's non-ok FATAL branch is ready to catch it once the verb propagates failure.
3. **Dormant `.raw` checks** at execute-phase.md:307 and quick.md:208 — verifier confirmed both sit inside raw-git, git-mode-only branching blocks (`branching_strategy != "none"`); cannot fire on jj today; documented in deferred-items.md §3(b).
4. **Global-install staleness** — `~/.claude/gsd-core/workflows/` carries pre-fix `.raw`-keyed fences until the operator reinstalls from this clone (`node bin/install.js --claude --global`); operator action, documented in 18-04-SUMMARY.
5. **Intermittent vitest birpc `onTaskUpdate` exit-1-with-all-green** — deferred-items.md §1, distinct from TEST-17.
6. **18-UAT.md still shows test 5 `result: issue` / `status: diagnosed`** — the gap it records is now closed (this report, G1–G3); the UAT record update is owned by the UAT/orchestrator flow downstream of this verification.

### Human Verification Required

None. The gap-closure fix was verified programmatically and behaviorally by this verifier: the exact UAT test 5 reproduction (clean jj WC → gate exit 0 silent) was run live on this repo, plus an independent adapter-pinned jj fixture in both polarities and an 8-mode synthetic-envelope predicate matrix. No `<human-check>` blocks exist in any Phase 18 plan.

### Gaps Summary

No gaps. The single UAT blocker (test 5) is closed: all three assert_clean_wc fences and the undo.md dirty guard key on the structured `entries[]` array (byte-identical probe lines, all fail-closed branches proven), and the clean-jj false-positive that blocked every transition on this repo no longer reproduces — proven live by this verifier, not cited from the SUMMARY. All 5 ROADMAP Success Criteria pass regression checks; all 7 REQ-IDs remain satisfied; frozen baselines and all lints green. One pre-existing Critical review finding (CR-01: plan-phase.md §16 routed-past) is flagged as a WARNING for the review-fix loop — it does not negate any must-have and is outside the 7-REQ-ID phase contract.

---

_Verified: 2026-06-11T09:34:49Z_
_Verifier: Claude (gsd-verifier)_
