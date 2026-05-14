---
phase: 06-brownfield-jj-migration-sticky-vcs-adapter-flip-planning-sha
plan: 04
subsystem: vcs
tags: [vcs, migration, brownfield, dogfood, jj, rewriter-redesign, in-place-flip]

requires:
  - phase: 06-brownfield-jj-migration-sticky-vcs-adapter-flip-planning-sha
    plan: 01
    provides: vcs.adapter config key + expr.children/parents + has_jj + A1/A5/A6 probes
  - phase: 06-brownfield-jj-migration-sticky-vcs-adapter-flip-planning-sha
    plan: 02
    provides: format-migration library (walk + resolve + rewrite + orphan + report + run)
  - phase: 06-brownfield-jj-migration-sticky-vcs-adapter-flip-planning-sha
    plan: 03
    provides: /gsd-migrate-vcs slash command + SDK verb + workflow markdown + greenfield-gate edit
provides:
  - BROWN-01 in-place migration of THIS repo (vcs.adapter flipped from auto→jj; 66 files rewritten; 0 orphans; 0 prose corruption)
  - BROWN-02 retro-journal seed (.planning/intel/rebase-log.md)
  - Memory-rule lift: "use git, not jj" feedback memory removed; STATE.md decisions section records the lift
  - B-07 rewriter redesign (rewrite-by-location + source-side existence safety net) — eliminates 188 prose-substring false positives observed on the first in-place attempt
  - B-04/B-05/B-06 fixes (jj auto-init in migrate-vcs; --force on revert for shared-history overrides; /gsd-migrate-vcs slash command shim)
  - 06-verify-harness.sh — reusable verification harness covering filesystem-path remotes, push/pull cycles, commit/undo on both backends, git baseline-parity (50/50)

affects:
  - All future GSD work in this repo (now jj-colocated; squash-model commits per project_squash_model.md)
  - Phase 7+ (greenfield migration completed — no further git-vs-jj branching needed in workflow docs)

tech-stack:
  added: []
  patterns:
    - "Rewrite-by-location: format-migration/rewrite.ts parses markdown into zones (frontmatter / fenced code / inline-backtick / prose) and only operates on inline-backtick spans + frontmatter values on a commit-keyed allowlist. Prose and fenced blocks are read-only."
    - "Source-side existence safety net: every rewrite candidate goes through vcs.refs.exists(expr.rev(id)) on the SOURCE backend before any target translation or ancestor walk. Non-existent IDs short-circuit to kind:'skip' — no edit, no orphan record, no breadcrumb."
    - "Sibling-clone dogfood pattern: mktemp -d -t gsd-dogfood-XXXX → two clones (git-baseline + jj-target) → migrate the jj target → compare brownfield-command surfaces across backends. Throwaway clones; evidence lives in the working repo's .planning/intel/06-dogfood-log.md."
    - "Migration-time auto-init: migrate-vcs --target jj on a plain git repo (no .jj/ yet) auto-runs `jj git init --colocate` (or --no-colocate under --native). One-shot UX; idempotent when .jj/ already exists."
    - "--force as documented shared-history override: revert verb's --force flag passes --ignore-immutable to jj abandon, giving users an explicit knob to rewrite remote-tracked commits. Default behavior unchanged (jj's native refusal)."

key-files:
  created:
    - .planning/intel/06-dogfood-log.md
    - .planning/intel/06-migration-report.md
    - .planning/intel/rebase-log.md
    - .planning/intel/06-verify-harness.sh
    - .planning/intel/06-verify-harness.log
    - sdk/src/vcs/format-migration/__tests__/resolve.test.ts
    - commands/gsd/migrate-vcs.md
  modified:
    - .planning/STATE.md
    - sdk/src/vcs/format-migration/rewrite.ts
    - sdk/src/vcs/format-migration/resolve.ts
    - sdk/src/vcs/format-migration/types.ts
    - sdk/src/vcs/format-migration/run.ts
    - sdk/src/vcs/format-migration/__tests__/rewrite.test.ts
    - sdk/src/query/revert.ts
    - sdk/src/query/revert.test.ts
    - sdk/src/query/migrate-vcs.ts
    - sdk/src/query/migrate-vcs.test.ts
    - get-shit-done/workflows/help.md

key-decisions:
  - "Rewrite-by-location, not rewrite-by-pattern (B-07): the initial in-place dogfood produced 188 prose-substring false positives like `cceeded` (from `succeeded`). The architectural fix targets the rewriter at structured zones only — backticked spans and frontmatter — and never touches prose. Captured in the redesign commit and codified by 16 new rewrite-test cases."
  - "Source-side existence as safety net (B-07): even in eligible zones, every candidate is validated via vcs.refs.exists() on the source backend. Non-existent IDs (e.g. `deadbeef` placeholders inside backticks) short-circuit to skip. Codified by 9 new resolver tests."
  - "B-02 reverted: migrate-vcs is side-effect-free beyond the format rewrite. Local-bookmark tracking after `jj git init --colocate` is the user/agent's responsibility, not the migration's. Empty-bookmark consumers (e.g. /gsd-pr-branch) should surface actionable errors instead of being papered over."
  - "Memory-rule lift trigger: the `feedback_use_git_until_migration.md` user-memory file was deleted (and removed from MEMORY.md index) the moment the in-place flip landed cleanly. STATE.md decisions section records the lift inline for future archeology."

patterns-established:
  - "Pattern 1: Sibling-clone safety net — never run the format-migration's first dogfood against the working repo. Use mktemp -d sibling clones for the first pass; gate the in-place flip on a human go/no-go after dogfood evidence lands."
  - "Pattern 2: Zone-based markdown rewriting — when a rewriter operates on a corpus of human-authored markdown, target the rewriter at structurally-tagged zones (frontmatter, code spans) not free-form prose. Prose pattern-matching produces an arbitrarily large false-positive surface that no regex tuning can fix."
  - "Pattern 3: Verification harness as commit-quality gate — checked-in shell harness (06-verify-harness.sh) covers the cross-backend invariants the unit tests cannot reach (real binary, real fs, real jj process). Re-runnable as a regression check for the rewriter and the migrate-vcs verb."

requirements-completed:
  - BROWN-01
  - BROWN-02
  - PHASE6-MEMORY-RULE-LIFT

duration: ~3.5h
completed: 2026-05-14
---

# Phase 6 Plan 04: BROWN-01/BROWN-02 dogfood + in-place migration of THIS repo

**Migrated this repo to jj-colocated in a single atomic commit (`4bb2b3c9` / change `pxyoqosl`). 66 files rewritten, 0 orphans, 0 prose corruption — after a redesign that closed the 188-substring false-positive surface uncovered by the first dogfood attempt.**

## Performance

- **Duration:** ~3.5h (multi-cycle: first dogfood pass → revert → B-07 redesign → harness re-verification → in-place flip → tasks 4-5 + close-out)
- **Tasks:** 5 of 5 (sibling-clone validation, human go/no-go, in-place flip, memory-rule lift, BROWN-02 seed)
- **Files modified or created:** 18 source/planning files + 4 evidence artifacts

## Accomplishments

### BROWN-01 — sibling-clone dogfood validation

Two passes against a `mktemp -d -t gsd-dogfood-XXXX` sibling clone:

1. **First pass** surfaced four implementation issues:
   - B-01 — `migrate-vcs --target jj` (no `--force`) tripped on its own `.planning/config.json.lock` file because the lock was acquired BEFORE the dirty-tree pre-flight. Fixed by reordering Steps 1-2 outside the lock.
   - B-02 — migrate-vcs auto-tracked local bookmarks post-flip, a hidden side effect. Reverted — left to user/agent.
   - B-03 — verb's same-direction refusal short-circuited before `runMigration`'s marker-probe fast-exit, making 06-02's idempotency invariant dead code. Fixed by deferring same-direction to runMigration.
   - B-04 — `migrate-vcs --target jj` on a plain git repo failed because `.jj/` wasn't auto-initialised. Fixed by auto-running `jj git init --colocate` (or `--no-colocate` under `--native`) when `.jj/` is absent.

2. **Second pass** verified all four fixes empirically against a sibling clone with the source-side branch deliberately set to `worktree-agent-*` (NOT `main`) — proving any dynamic branch detection in the path works for non-default branch names.

### BROWN-01 — in-place flip

First in-place attempt produced 188 prose-substring false positives like `cceeded` (the substring of `succeeded`) and `feedbac` (the substring of `feedback`). All became `[orphan:<id>]` breadcrumbs corrupting the prose. User reverted.

**Architectural fix (B-07 — rewriter redesign):**

The rewriter previously scanned all `.planning/*.md` text with `/(?<![0-9a-fA-F])[0-9a-f]{7,40}(?![0-9a-fA-F])/g` — a regex that matches any lowercase-hex 7-40 char sequence bounded by non-hex. The boundary condition treats EVERY non-hex character (including ALL letters `g-z`) as a separator, so any English word with a hex-only middle substring gets matched.

Redesign:
- **`findEligibleZones(content)`** parses each `.md` file into zones (YAML frontmatter / fenced code blocks / inline-backtick spans / prose) and returns ONLY the rewrite-eligible zones (inline-backtick spans containing wholly-hex content + frontmatter values on a commit-keyed allowlist).
- Regex matches outside any zone are emitted verbatim — the resolver is never even called.
- Frontmatter allowlist: `resolution_commit`, `commit`, `commit_hash`, `commit_id`, `source_commit`, `migration_commit`, `first_commit`, `last_commit`, `sha`, `hash`, `rev`, `revision`.

**Safety net (B-07 — source-side existence validation):**

Even within an eligible zone, every candidate is validated against `vcs.refs.exists(expr.rev(id))` on the SOURCE backend BEFORE any target translation or ancestor walk. Non-existent IDs (e.g. illustrative `deadbeef` placeholders that happen to be wholly hex) short-circuit to a new `kind:'skip'` ResolveResult — the match is emitted verbatim with no edit, no orphan record, no breadcrumb. Cached per-ID.

After B-07 landed, the in-place flip ran clean: 66 files rewritten (was 101), 0 orphans (was 160), 0 prose corruptions (was 188).

### BROWN-02 — retro file seed

`.planning/intel/rebase-log.md` lands as a 3-column table (Date / Conflicts / Notes) with a placeholder row. The first weekly upstream rebase will be the first real entry. Format and logging conventions documented inline.

### Memory-rule lift

The `feedback_use_git_until_migration.md` user-memory file (and its `MEMORY.md` index entry) is deleted. STATE.md's decisions section gains a new entry naming the lift commit. jj is now the canonical write backend for this repo; squash-model commits per `project_squash_model.md` (with `jj commit -m` as the atomic shortcut) are the going-forward idiom.

## Bugs surfaced + filed inline

| ID | Severity | Disposition |
|----|----------|-------------|
| B-01 | Medium | FIXED — `commit ccf8613c` (lock-before-dirty reorder) |
| B-02 | Low | REVERTED — `commit 4880a9ab` (auto-track removed; user/agent owns bookmark tracking) |
| B-03 | Low | FIXED — `commit 77c6b853` (verb defers same-direction to runMigration) |
| B-04 | Medium | FIXED — `commit b47c7630` (auto-init jj backend when .jj/ absent) |
| B-05 | Low | FIXED — `commit dc444ec8` (revert verb gains --force flag for jj --ignore-immutable) |
| B-06 | Medium | FIXED — `commit bd50c445` (slash command shim added; install discovery satisfied) |
| B-07 | High | FIXED — `commit 23291a07` (rewriter redesigned: rewrite-by-location + source-side existence; 188 false positives eliminated) |

## Verification gates passed

- **B-07 unit tests:** 29 rewrite-test cases (was 13; +16 for zone-targeting + skip + findEligibleZones) + 9 new resolver tests (B-07 source-side existence) = 38 added. All format-migration + migrate-vcs tests green: 62/62.
- **B-07 round-trip test (synth-planning-fixture):** git → jj → git completes with the marker probe yielding `migrated:false` on idempotent re-run; orphans=0 on both directions.
- **06-verify-harness.sh** (re-run against final B-07 code): 20+ checks PASS end-to-end:
  - Filesystem-path bare upstream serves push/pull cycles on both backends.
  - SDK commit + git push + jj git push round-trip via filesystem remote.
  - git revert preserves the original commit (CMD-06 git inverse-commit semantics).
  - jj abandon default refuses immutable commits with the documented error (CMD-06 + jj shared-history protection).
  - jj abandon --force succeeds with --ignore-immutable; visible history advances; op-log retains abandon for recovery.
  - SDK ↔ raw-git baseline-parity: 50/50 captured snapshots byte-identical.
- **In-place migration outcome:**
  - `filesChanged`: 66 / `filesScanned`: 183
  - `orphans.count`: 0 (was 160 pre-B-07)
  - `previousAdapter`: absent → `newAdapter`: jj
  - Migration commit subject: `chore(vcs): migrate git -> jj [gsd-migrate-vcs v1]`
  - Spot-check: `succeeded` in `.planning/research/PITFALLS.md` line 321 is intact (the canonical corruption probe).

## Deviations from plan

1. **Two dogfood passes** instead of one. The plan's Task 1 expected a single sibling-clone run feeding directly into the Task 2 checkpoint. In practice the first pass surfaced four bugs requiring fixes (B-01..B-04); the second pass re-verified those fixes before the user approved the in-place flip. Then a third surface (B-07) was discovered during the in-place attempt itself and required a full rewriter redesign. Net effect: the plan's "validate then flip" became "validate → fix → re-validate → flip (corrupted) → revert → redesign → re-validate → re-flip".

2. **STATE.md memory-rule edit was an addition, not a replacement.** The plan's Task 4 prescribed replacing `- **Pre-Phase-6:** Use git (not jj) until migration lands.` in STATE.md. That literal annotation didn't exist in STATE.md — the rule lived only in the user-memory file. Adapted: ADDED a new "Post-BROWN-01" decision row inline (commit `39f8e456`); the user-memory file was deleted directly.

3. **B-02 reverted, not refined.** Plan implicitly assumed all bug fixes would stick. B-02 (auto-bookmark-tracking) turned out to be the wrong shape of fix and got reverted entirely after user feedback (`feedback_verify_jj_conventions.md`: don't lock jj idioms unilaterally). The disposition is documented in the B-02 revert commit.

4. **Verification harness added beyond plan scope.** `06-verify-harness.sh` (343 lines) wasn't in the plan but emerged when the user asked for filesystem-upstream + commit/undo + git-parity verification before the second flip attempt. Committed as a regression check; reusable on future migrate-vcs work.

## Self-Check: PASSED
