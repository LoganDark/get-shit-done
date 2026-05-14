---
phase: 03-jj-backend-core-squash-refs-conflict
plan: 06
subsystem: vcs-adapter
tags: [jj, push, fetch, workspace, workspace-list, workspace-context, test-08, triage, allowlist-flip]

requires:
  - phase: 03-jj-backend-core-squash-refs-conflict
    plan: 01
    provides: jj.ts skeleton + jjArgv helper + per-verb allowlist machinery + notImpl stub + bug-test-triage scaffold (7 TODO rows)
  - phase: 03-jj-backend-core-squash-refs-conflict
    plan: 02
    provides: production parseJjWorkspaceList + __vcsTestOnly snapshot/restore for per-test rewind
  - phase: 03-jj-backend-core-squash-refs-conflict
    plan: 03
    provides: refs.* bodies (sibling parity for cross-backend completeness)
  - phase: 03-jj-backend-core-squash-refs-conflict
    plan: 04
    provides: commit() body + vcsExec env-passthrough substrate
  - phase: 03-jj-backend-core-squash-refs-conflict
    plan: 05
    provides: log/status/diff/findConflicts bodies (final cross-backend verbs before push/fetch)
provides:
  - "vcs.push(opts) body — wraps `jj git push` (--remote / --bookmark mapped; opts.force documented no-op because jj's default IS already force-with-lease)"
  - "vcs.fetch(opts) body — wraps `jj git fetch` (--remote mapped; opts.ref documented no-op per RESEARCH A6 + audit)"
  - "vcs.workspace.list() body — delegates to parseJjWorkspaceList (production from 03-02)"
  - "vcs.workspace.context() body — Phase 3 stub returning the literal cross-backend shape (effectiveRoot:cwd, mode:'main', isLinked:false)"
  - "BACKENDS_AVAILABLE_FOR_VERB flipped for push, fetch, workspace.list, workspace.context (now admit jj-colocated)"
  - "BACKENDS_AVAILABLE_FOR_VERB unchanged for workspace.add/forget/prune (stay ['git'] only — Phase 4 owns WS-*)"
  - "03-06-AUDIT.md confirming zero production callers of vcs.fetch anywhere; opts.ref no-op is safe"
  - "docs/test-triage/jj-bugs.md populated — 7 carries-verbatim verdicts + rationales + Phase 4 WS-13 follow-ups for 5 of 7 rows"
affects: [03-07, phase-4-workspaces, phase-5-brownfield]

tech-stack:
  added: []
  patterns:
    - "Argv assembly: condition-pushed flags + leading subcommand pair (`['git', 'push']` / `['git', 'fetch']`) — the literal pair survives grep gates while the conditional flags follow"
    - "Bookmark-shape regex `/^[A-Za-z][\\w\\-/.]*$/` gates `--bookmark` argv on push (T-03.06-01 mitigation; disallows leading `-` to rule out flag-injection)"
    - "Phase 3 stub pattern for workspace.context: literal frozen object, no jj invocation, matches Object.freeze convention used throughout the adapter"
    - "Documented no-op pattern (opts.force on push, opts.ref on fetch): cross-backend field accepted but adds nothing to argv; JSDoc records the asymmetry; audit step verifies no caller silently relies on the dropped behavior"

key-files:
  created:
    - "sdk/src/vcs/__tests__/jj-push-fetch.test.ts (7 live integration tests against jj 0.41 + tmp bare-repo destination)"
    - "sdk/src/vcs/__tests__/jj-workspace.test.ts (11 tests: list parser delegation, context literal stub, remaining NotImpl throws for add/forget/prune)"
    - ".planning/phases/03-jj-backend-core-squash-refs-conflict/03-06-AUDIT.md (opts.ref-on-fetch caller audit — clean)"
  modified:
    - "sdk/src/vcs/backends/jj.ts (push/fetch/workspace.list/workspace.context stubs → real bodies; workspace.add/forget/prune retain VcsNotImplementedError with Phase 4 attribution)"
    - "sdk/src/vcs/backends.ts (BACKENDS_AVAILABLE_FOR_VERB allowlist flip for 4 verbs)"
    - "sdk/src/vcs/__tests__/jj-skeleton.test.ts (4 throw-expectation tests replaced with not-throw-VcsNotImplementedError shape; workspace.add/forget/prune throw-expectations preserved)"
    - "sdk/src/vcs/__tests__/backends.test.ts (allowlist assertion test updated for the 4-verb flip + explicit add/forget/prune ['git']-only assertions)"
    - "docs/test-triage/jj-bugs.md (7 TODO rows → 7 carries-verbatim verdicts + rationales; footer rewritten to past-tense)"

key-decisions:
  - "RESEARCH A4 EMPIRICAL CORRECTION: `jj git push` does NOT have a `--force-with-lease` flag. `jj git push --help` documents that its DEFAULT behavior IS already force-with-lease semantics ('safety checks' — the remote is updated only if its current state matches what jj last fetched). Consequently, `opts.force` is a documented no-op on jj — the cross-backend field is accepted for parity but adds no flag to the argv. JSDoc on push() records this empirical correction so the next reader knows the RESEARCH speculation was wrong."
  - "RESEARCH A6 confirmed: `jj git fetch` has `--branch <glob>` (glob filter on bookmark names) but no per-ref selectivity in the git-style sense. The cross-backend `opts.ref` field is therefore a documented no-op. Audit (03-06-AUDIT.md) confirms zero production callers of vcs.fetch in sdk/src, bin/lib, or get-shit-done/bin/lib — the silent-drop is safe in Phase 3."
  - "T-03.06-01 mitigation gates `--bookmark` argv on a refname-shape regex (`/^[A-Za-z][\\w\\-/.]*$/`) — disallows leading `-` (rules out `--bookmark='--delete'` flag-injection) and non-letter starts (rules out `@`, `@-`, `from..to` ranges, which fall through to jj's default push behavior)."
  - "T-03.06-03 ACCEPTED (Phase 3 boundary): workspace.context returns `mode: 'main'` literal — Phase 4 owns real multi-workspace context detection. JSDoc records the deferral so the next reader knows the literal is intentional, not a stub-throw oversight."
  - "Format-migration tracker (D-19) — no entries appended. Plan 03-06 ships no new .planning/ revision-id-encoding format. workspace.list returns WorkspaceInfo.rev (commit_id) at runtime but does NOT persist any .planning/ file with that field; docs/test-triage/jj-bugs.md lives OUTSIDE .planning/ so D-19 does not apply."
  - "TEST-08 triage: all 7 bug tests are `carries-verbatim` — they parse workflow-markdown files for structural protocols, never shell out to git or jj. None use `vcsTest()` fixture (verified via grep). All 7 pass under `GSD_TEST_BACKENDS=jj-colocated node --test` with 0 fails / 0 skips / 0 unexpected behavior. RESEARCH-time hypothesis confirmed empirically. No ESCALATIONS — no test surfaced an adapter bug."

patterns-established:
  - "Cross-backend `opts.X` documented-no-op pattern: when a field has no clean translation on one backend (e.g., opts.force on jj push has no flag equivalent because the default behavior already provides the semantic), the field is accepted on the cross-backend surface for parity, the adapter adds nothing to the argv, JSDoc records the asymmetry, and an audit step verifies no caller silently relies on the dropped behavior. Cleaner than throwing a typed error for an unused code path."
  - "Phase-3 literal-stub pattern for cross-backend verbs whose semantics Phase 4 owns: rather than throwing VcsNotImplementedError, return a literal frozen object that satisfies the cross-backend contract for the simple case. Use Object.freeze to enforce immutability. JSDoc explicitly attributes the deferral. Example: workspace.context returns {effectiveRoot:cwd, mode:'main', isLinked:false} — sufficient for single-workspace callers; Phase 4 reshapes for multi-workspace."
  - "TEST-08 verdict workflow: run the bug test under `GSD_TEST_BACKENDS=<backend> node --test <file>` (or equivalent runner), capture pass/fail/skip counts, check for `vcsTest` fixture usage via grep. carries-verbatim is the default verdict when the test (a) passes unchanged on the target backend AND (b) does not use vcsTest AND (c) asserts only workflow-markdown structural protocol. Phase 4 WS-13 follow-ups are filed for rows where the markdown text itself documents git-specific recipes (e.g., 'git reset --hard') — those need parallel jj-native tests later, but the current row stays carries-verbatim because the current test correctly pins the current git-targeting markdown."

metrics:
  duration: "~25min"
  completed_date: "2026-05-12"
  tasks: 2
  files: 7
  tests_added: 18  # 7 push-fetch + 11 workspace
  tests_modified: 9  # 4 push/fetch + 5 workspace expectation shifts in jj-skeleton + 1 allowlist assertion expansion in backends.test
---

# Phase 3 Plan 06: Push/Fetch + Workspace.list/context + TEST-08 Triage Summary

Final cross-backend verb-group plan in Phase 3 — wires `push`/`fetch` and
the two Phase-3-stubable `workspace.*` verbs (`list`, `context`) to real
jj bodies, leaving `workspace.add`/`forget`/`prune` as
`VcsNotImplementedError` throws for Phase 4 (WS-01..13) to own. Also
executes the TEST-08 bug-test triage (D-16) by running each of the 7
worktree-bug tests under the `jj-colocated` matrix lane and recording the
verdict in `docs/test-triage/jj-bugs.md`.

## Empirical Findings (RESEARCH A4 + A6)

```bash
$ jj --version
jj 0.41.0-...

$ jj git push --help | head -30
# ... documents safety checks (force-with-lease semantics) as DEFAULT
# Flags available: --remote, --bookmark/-b, --all, --tracked, ...
# NOTABLY ABSENT: --force-with-lease (RESEARCH A4 was speculative; the
# flag does not exist on jj 0.41 because the safety check is the default)

$ jj git fetch --help | head -30
# Flags available: --branch/-b (glob filter), --tracked, --remote, --all-remotes
# NOTABLY ABSENT: per-ref selectivity in the git-style sense (RESEARCH A6 confirmed)
```

**A4 correction:** `opts.force` is a documented no-op on jj push. The
JSDoc on `push()` records this so future readers know the absence of a
`--force-with-lease` flag is intentional, not an oversight.

**A6 confirmation:** `opts.ref` is a documented no-op on jj fetch. The
JSDoc on `fetch()` records this; `03-06-AUDIT.md` confirms zero
production callers — the silent-drop is safe in Phase 3.

## Test Counts

**New test files:**

| File | Tests | Result |
|------|-------|--------|
| `sdk/src/vcs/__tests__/jj-push-fetch.test.ts` | 7 | 7 passed / 0 failed |
| `sdk/src/vcs/__tests__/jj-workspace.test.ts` | 11 | 11 passed / 0 failed |

**Modified test files:**

| File | Change | Result |
|------|--------|--------|
| `sdk/src/vcs/__tests__/jj-skeleton.test.ts` | 5 expectation shifts (push, fetch, workspace.list, workspace.context wired; workspace.add/forget/prune still NotImpl) | 35 passed |
| `sdk/src/vcs/__tests__/backends.test.ts` | Allowlist assertion updated for 4-verb flip + explicit ['git']-only pins for add/forget/prune | 12 passed |
| `sdk/src/vcs/__tests__/adapter-contract.test.ts` | Unchanged source; backend matrix automatically picks up the 4 newly-flipped verbs | 29 passed (4 new jj-colocated lanes auto-unlocked) |

**TEST-08 triage execution (one-shot bash loop, 7 files):**

```bash
for f in tests/bug-{2924,2774,3097-3099,2075,2431,2015,2388}-*.test.cjs; do
  GSD_TEST_BACKENDS=jj-colocated node --test "$f" 2>&1 | grep -E "(tests|pass|fail|skipped)"
done
```

| Bug | Tests | Pass | Fail | Skip |
|-----|-------|------|------|------|
| 2924 | 125 | 125 | 0 | 0 |
| 2774 | 7 | 7 | 0 | 0 |
| 3097/3099 | 7 | 7 | 0 | 0 |
| 2075 | 8 | 8 | 0 | 0 |
| 2431 | 10 | 10 | 0 | 0 |
| 2015 | 4 | 4 | 0 | 0 |
| 2388 | 4 | 4 | 0 | 0 |

All 7 tests `carries-verbatim` — markdown-structural assertions only; no
`vcsTest()` fixture usage (grep-verified); no VCS shell-out from
assertion bodies. RESEARCH-time hypothesis confirmed.

## Audit Findings

**`opts.ref` on jj `fetch` — no jj-reachable callers.** See
`03-06-AUDIT.md` for the audit command, findings, and reasoning. Zero
production callers of `vcs.fetch` anywhere in the codebase; the silently-
dropped `opts.ref` is safe because nothing exercises the path.

## ESCALATIONS

**None.** No bug test surfaced an adapter bug, no architectural change
needed. The two empirical research-time speculations that were partially
wrong (A4 — `--force-with-lease` doesn't exist on jj push; A6 confirmed
as expected) are documented as no-ops with JSDoc + audit coverage.

## Verification

**Acceptance criteria — all satisfied:**

- [x] `grep -E "'git', 'push'" sdk/src/vcs/backends/jj.ts` returns the
      `args` literal (push body present)
- [x] `grep -E "'git', 'fetch'" sdk/src/vcs/backends/jj.ts` returns the
      `args` literal (fetch body present)
- [x] `grep -E "parseJjWorkspaceList\(r\.stdout\)" sdk/src/vcs/backends/jj.ts`
      returns a match (workspace.list delegates to production parser)
- [x] workspace.add/forget/prune throw `VcsNotImplementedError` (3 throws
      verified via `grep -B 2 -A 5 "workspace\.\(add\|forget\|prune\): Phase 4"
      | grep -c VcsNotImplementedError` outputs `3`)
- [x] BACKENDS_AVAILABLE_FOR_VERB flips verified: push/fetch/workspace.list/
      workspace.context now `['git', 'jj-colocated']`; workspace.add/forget/
      prune stay `['git']` only
- [x] JJ-03 invariant: zero `--ignore-working-copy` occurrences outside
      comments in jj.ts (`grep -v '^\s*\(\*\|//\)' | grep -c "--ignore-working-copy"`
      outputs `0`)
- [x] `03-06-AUDIT.md` exists and confirms zero production callers of
      `vcs.fetch`
- [x] `docs/test-triage/jj-bugs.md`: 0 TODO rows, 7 verdict cells, 7
      rationale cells, footer rewritten to past-tense
- [x] Lint guard: `node scripts/lint-vcs-no-raw-git.cjs` outputs
      `0 violations`
- [x] All plan-relevant vitest test files pass (65 tests across 4 files
      in fast lane; 94 tests across 5 files including adapter-contract
      under singleFork)

## Deviations from Plan

**None.** Plan executed exactly as written, with two minor empirical
corrections that the plan ALREADY anticipated in its "Pre-implementation
empirical verification" step (Task 1 Action A):

1. **A4 correction (anticipated):** Plan explicitly said "verify locally
   first; if jj 0.41 uses a different flag spelling, adjust." We adjusted
   — `opts.force` is a documented no-op rather than mapping to
   `--force-with-lease`. JSDoc records the empirical finding.
2. **A6 confirmed (anticipated):** Plan said "RESEARCH A6 — verify."
   Empirical confirmation: jj has no per-ref selectivity, `opts.ref` is a
   documented no-op on jj fetch.

Both corrections are factored into the JSDoc + the audit doc, so future
readers see the empirical verdict alongside the original RESEARCH
speculation.

## Self-Check: PASSED

**Files (cwd-relative):**

- `sdk/src/vcs/backends/jj.ts` — present, contains push/fetch/workspace.list/
  workspace.context bodies (verified via grep)
- `sdk/src/vcs/backends.ts` — present, allowlist flipped (verified via grep
  + test assertion)
- `sdk/src/vcs/__tests__/jj-push-fetch.test.ts` — present, 7 tests pass
- `sdk/src/vcs/__tests__/jj-workspace.test.ts` — present, 11 tests pass
- `sdk/src/vcs/__tests__/jj-skeleton.test.ts` — present, 35 tests pass
- `sdk/src/vcs/__tests__/backends.test.ts` — present, 12 tests pass
- `docs/test-triage/jj-bugs.md` — present, 7 rows populated
- `.planning/phases/03-jj-backend-core-squash-refs-conflict/03-06-AUDIT.md` — present

**Commits:**

- `vxltuwukqlqzpqxyslunlkprvzlvzxxy` — `feat(03-06): jj backend push/fetch + workspace.list/context bodies`
- `rluttsmnspkuontvlxpztrpoxouwrosv` — `docs(03-06): TEST-08 triage — populate 7 bug-test verdicts on jj-colocated`

Both commits verified present via `git log --oneline -5`.

---

*Phase: 03-jj-backend-core-squash-refs-conflict*
*Plan: 06*
*Completed: 2026-05-12*
