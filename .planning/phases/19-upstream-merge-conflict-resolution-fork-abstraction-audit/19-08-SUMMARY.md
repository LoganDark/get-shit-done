---
phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
plan: 08
subsystem: workflows
tags: [workflows, vcs-rewiring, port-02, audit-01, three-way-merge, jj]

# Dependency graph
requires:
  - phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit
    provides: "19-07: AUDIT-01 src/ surface — adapter-routed commit path with `id` envelope (workflows jq `.id`, never `.hash`); 19-06: 19-verb vcs router live behind `gsd_run query`"
provides:
  - "All 9 fork workflow VCS deltas re-applied at gsd-core/workflows/ counterparts (porting-map chunk 8), re-pathed `gsd-sdk query`→`gsd_run query`, `get-shit-done/`→`gsd-core/`"
  - "execute-phase.md + quick.md dispatch through workspace.parallel.{dispatch,fan-in} (Phase 11 D-01 no-manifest model: HANDLE_JSON + RESULTS_ACCUM; zero-element FATAL; HANDLE_OK guard; --phase 0 sentinel in quick)"
  - "Upstream 1.4.x guards re-expressed, not deleted: #48 worktree_branch_check → assert-dispatched-cwd supersession notes; #630 manifest pinning + #3384 manifest source-of-truth → dispatch-envelope notes; #683 base-ref degrade kept verbatim at init; #3491 never-nest re-expressed inside the new-project VCS-gate matrix; git.create_tag config gate + tag pre-check preserved in complete-milestone"
  - "Zero `gsd-sdk` references under gsd-core/workflows/; zero dead verbs (probe loop + strict router/family membership check); raw fences with no fork verb (checkout/tag/stash/branch-delete/rev-parse-shaped probes, git-only branching blocks) stay raw for the 19-10 baseline"
affects: [19-09 (agents + dispatch-cwd-safety.md creation closes the @-ref forward dependency), 19-10 (raw-fence baseline re-derivation), 19-13 (ledger completeness)]

# Tech tracking
tech-stack:
  added: []
  patterns: ["fork log/diff jq filters adapted to the ported envelopes: `.entries[]?` (not bare array) and `.id[0:7]` (not `.hash`, unified revision model)", "EXPECTED_BRANCH via `current-branch --pick \"bookmarks[0]\"` (handler emits bookmarks[], fork's `--pick branch` picked a never-emitted field — latent quirk not replayed)", "TODO comments for phantom verbs reworded so they never mint a literal `gsd_run query <phantom>` token (probe/lint hygiene)"]

key-files:
  created: []
  modified:
    - gsd-core/workflows/execute-phase.md
    - gsd-core/workflows/quick.md
    - gsd-core/workflows/code-review.md
    - gsd-core/workflows/complete-milestone.md
    - gsd-core/workflows/help/modes/full.md
    - gsd-core/workflows/new-milestone.md
    - gsd-core/workflows/new-project.md
    - gsd-core/workflows/plan-phase.md
    - gsd-core/workflows/undo.md
    - .planning/phases/19-upstream-merge-conflict-resolution-fork-abstraction-audit/19-MERGE-AUDIT.md

key-decisions:
  - "help.md anchorless monolith NOT replayed: the fork's 784-line + body is the pre-mode-split reference text; replaying it would delete upstream's lazy-loaded help architecture for zero VCS value. Fork's durable jj delta isolated by content-diff (undo --force/--ignore-immutable note + /gsd:migrate-vcs bullet) and grafted into help/modes/full.md; the help.md dispatcher is untouched"
  - "Three-way preservation over fork-letter in complete-milestone git_tag: upstream's git.create_tag config-check AND tag-exists retry pre-check kept (fork delta dropped both) alongside the fork's REFS-06 backend-asymmetric release-marker framing + CMD-09 push verb"
  - "new-project parse-JSON hunk not applied: fork removed git_worktree_root/in_nested_subdir from the field list (its init lacked them); upstream provides them and the preserved #3491 guard consumes them inside the fork's 12-row VCS-gate matrix"
  - "Fork envelope adaptations (not blind replay): log jq `.[]`→`.entries[]?`, `.hash`→`.id`, `committedAt`→`date`; current-branch `--pick branch`→`--pick \"bookmarks[0]\"` — all per the ported router's actual envelopes (19-07 unified-revision pointer)"

requirements-completed: []  # PORT-02/AUDIT-01 are phase-scoped (no v1.4 REQUIREMENTS.md rows — 19-01..19-07 precedent); ROADMAP plan-line checkbox updated instead

# Metrics
duration: ~25min
completed: 2026-06-10
---

# Phase 19 Plan 08: Workflow VCS re-wiring (chunk 8) Summary

**All 9 fork workflow deltas live on upstream's 1.4.x text as a minimal `gsd_run query` delta — execute-phase/quick dispatch through workspace.parallel.{dispatch,fan-in} with upstream's #48/#630/#683/#3384/#3491 guards re-expressed through fork verbs instead of deleted, and every referenced verb dispatches through the 19-06 router.**

## Performance

- **Duration:** ~25 min (2026-06-10 12:32–12:57 UTC)
- **Tasks:** 2
- **Files:** 10 modified (0 created)

## Accomplishments

- **Task 1 (the hard pair):** execute-phase.md and quick.md rewired hunk-by-hunk. Dispatch sections replace the manifest machinery (WAVE_WORKTREE_MANIFEST/QUICK_WORKTREE_MANIFEST, worktree.cleanup-wave loops, cleanup-tail) with the fork's dispatch/fan-in blocks carrying Phase 11/14.1 semantics: plan-array JSON via `jq -R . | jq -sc`, numeric `--phase` (0 sentinel in quick), HANDLE_OK guard, RESULTS_ACCUM ParallelAgentResult accumulation, tmpfile handle for fan-in, #3174 branch-drift guard, sequential-Agent() pattern preserved. MVP-gate RED probe, spot-checks, stall probe, hooks.fire, tracking-diff, assert_clean_wc, and phase.complete commit relocation all landed.
- **Task 2 (remaining 7):** code-review (CR-06 path hardening + query log/diff scoping), complete-milestone (stats/branch-list/merge/reset/push/commit verbs; REFS-06 release-marker framing), undo (full verb rewiring + CMD-06 destructive-jj-abandon semantics callout), new-milestone + new-project (synthesizer SUMMARY.md pre-seed for the blocked-Write guarantee; greenfield VCS-gate 12-row matrix), plan-phase (§16 assert-clean-WC gate), help (re-expressed into modes/full.md).
- **Verification:** zero `gsd-sdk` under gsd-core/workflows/ (recursive); `/tmp/19-08-task1-deadverbs.txt` + `/tmp/19-08-deadverbs.txt` both empty; supplementary strict check proves every `gsd_run query` verb in the 9 files is either a router verb (19-06 table) or a live upstream family (`summary-extract` confirmed as an unlisted-but-live gsd-tools case); `rg 'gsd_run query (checkout|tag|stash|rev-parse|rm) '` → zero invented verbs.

## Task Commits

Each task committed on top of the stack above merge change `vpzlrrlv` (untouched):

1. **Task 1: execute-phase.md + quick.md three-way re-wiring** — `44fe9a87` / change `qspqrswz` (feat)
2. **Task 2: remaining 7 workflow deltas** — `08ced477` / change `plwvymok` (feat)

## Deviations from Plan

### Adaptations and anchorless-hunk re-expressions (all ledgered)

**1. [Envelope adaptation] Fork jq filters rewritten for the ported envelopes**
- **Found during:** Task 1 read_first (src/vcs-command-router.cts handlers)
- **Issue:** fork deltas assume the retired SDK shapes — bare LogEntry array (`.[]`), `.hash`, `.committedAt`, current-branch `.branch`
- **Fix:** `.entries[]?` / `.id[0:7]` / `.date` / `--pick "bookmarks[0]"` per the actual router envelopes; the 19-07 SUMMARY's `hash`→`id` pointer applied throughout
- **Files:** execute-phase.md, quick.md, code-review.md, complete-milestone.md, undo.md
- **Commits:** 44fe9a87, 08ced477

**2. [Rule 2 - probe/lint hygiene] Re-pathed TODO comments would mint phantom-verb tokens**
- **Found during:** Task 1 verify (verb extraction caught `rev-parse` and `stash` from comment text)
- **Issue:** mechanically re-pathing fork comments like "add \`gsd-sdk query stash {push,pop}\` verbs" creates literal `gsd_run query stash` strings — false probe hits and a direct violation of Task 2's no-invented-verbs acceptance
- **Fix:** reworded all phantom-verb TODOs ("stash-push/stash-pop verbs", "no rev-parse-shaped query verb", "no checkout-shaped query verb", "no rm-shaped query verb", "no branch-delete-shaped query verb") — raw fences themselves unchanged
- **Commits:** 44fe9a87, 08ced477

**3. [Anchorless hunk] help.md monolith re-expressed in upstream's modes architecture**
- **Found during:** Task 2 read_first (805-line delta vs upstream's 24-line mode dispatcher)
- **Fix:** fork's two jj-facing bullets grafted into `gsd-core/workflows/help/modes/full.md`; dispatcher untouched (see key-decisions)
- **Commit:** 08ced477

**4. [Three-way preservation] complete-milestone git_tag gate + new-project #3491 + fork markdown bug**
- **Found during:** Task 2 hunk application
- **Issue:** fork delta dropped upstream's `git.create_tag` config-check, the tag-exists retry pre-check, the #3491 never-nest guard fields, and one closing code fence (markdown syntax bug in the fork's own text)
- **Fix:** all four upstream/correctness artifacts preserved; fork content layered around them; #3491 re-expressed inside the VCS-gate matrix's two init-running cells
- **Commit:** 08ced477

**5. [Forward dependency, documented] `dispatch-cwd-safety.md` @-ref and `has_jj` init field land in 19-09**
- The executor-prompt @-reference to `gsd-core/references/dispatch-cwd-safety.md` (fork delta) dangles until 19-09 creates it (19-09 files list includes it — same bridge-before-consumer wave ordering the phase already uses); `has_jj` is asserted by the new-project matrix but `init.new-project` does not emit it yet (src/init.cts only emits `has_git`) — ledgered as 19-09+ follow-up.

## Authentication Gates

None.

## Known Stubs / Forward Pointers

- `gsd-core/references/dispatch-cwd-safety.md` + agents/gsd-executor.md assert-dispatched-cwd guard: created/rewired by 19-09 (next wave). Until then the @-ref in the two dispatch prompts is a forward pointer.
- `has_jj` field in `init.new-project` payload: matrix text is the spec; init extension deferred (ledger row).
- Raw fences entering the 19-10 baseline: branching blocks (symbolic-ref/show-ref/switch/fetch/checkout), #48 execute_waves-entry guard, stash dance, `git rm`/`git tag`/`git branch -d`, rev-parse parent probes, `.gitmodules` INI reads — each carries an inline disposition comment.
- The plan's verb-probe loop is vacuously green (gsd-tools exits 0 on `--help` for ANY token); the strict router/family membership check in this plan's verification is the real dead-verb evidence. Worth folding into the 19-12 lint/test pass.

## Verification Results

- `rg -c 'gsd-sdk' gsd-core/workflows/` (recursive) → zero hits
- `workspace.parallel.dispatch` present in execute-phase.md (3) and quick.md (3); fan-in in both
- `/tmp/19-08-task1-deadverbs.txt` and `/tmp/19-08-deadverbs.txt` both empty; strict membership check: every verb in the 9 files dispatches (router verb or live gsd-tools family; `verification.status` and `summary-extract` empirically probed exit-0)
- Guard presence: `worktree_branch_check` token retained (4 in execute-phase, 3 in quick); `#630`/`#3384`/`#683`/`base-check` language present (13 hits in execute-phase); `#3491` retained in new-project; `git.create_tag` gate retained in complete-milestone
- No invented verbs: `gsd_run query (checkout|tag|stash|rev-parse|rm) ` → zero hits
- 9 `re-applied-at … DONE 19-08` ledger rows, all intact 4-column table lines
- `vpzlrrlv` untouched; two task commits stack above 19-07; no bookmark moves, no op restore

## Self-Check: PASSED

- Files exist: all 9 workflow targets + modes/full.md + 19-MERGE-AUDIT.md + this SUMMARY
- Commits present in `jj log`: 44fe9a87 (qspqrswz), 08ced477 (plwvymok)
- Verifies re-run clean post-commit

---
*Phase: 19-upstream-merge-conflict-resolution-fork-abstraction-audit*
*Completed: 2026-06-10*
