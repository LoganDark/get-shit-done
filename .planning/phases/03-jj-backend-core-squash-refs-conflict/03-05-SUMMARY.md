---
phase: 03-jj-backend-core-squash-refs-conflict
plan: 05
subsystem: vcs-adapter
tags: [jj, log, status, diff, findConflicts, conflicts-revset, ndjson, allowlist-flip]

requires:
  - phase: 03-jj-backend-core-squash-refs-conflict
    plan: 01
    provides: jj.ts skeleton + jjArgv helper + per-verb allowlist machinery + notImpl stub
  - phase: 03-jj-backend-core-squash-refs-conflict
    plan: 02
    provides: production parseJjLog + __vcsTestOnly snapshot/restore for per-test rewind
  - phase: 03-jj-backend-core-squash-refs-conflict
    plan: 03
    provides: addPrefix/stripPrefix helpers (unchanged in this plan); refs.* + bookmarks bodies (sibling parity)
  - phase: 03-jj-backend-core-squash-refs-conflict
    plan: 04
    provides: commit() body + vcsExec env-passthrough substrate
provides:
  - "vcs.log(opts) body — argv assembly + parseJjLog delegation"
  - "vcs.status(opts) body — hand-rolled parser of `jj status` text between `Working copy changes:` and `Working copy  (@)`/`Parent commit` separators; StatusEntry has NO `index` field (D-16)"
  - "vcs.diff(opts) body — `jj diff` + `--name-only` + `--summary` (name-status); opts.staged documented no-op on jj"
  - "vcs.findConflicts({scope}) body using `conflicts()` PLURAL revset (RESEARCH Q1 correction)"
  - "enumerateConflictedPaths() helper — primary `jj resolve --list -r <rev>` + fallback `jj diff --summary` (C/U letters)"
  - "parseJjStatus + parseDiffSummary local helpers"
  - "BACKENDS_AVAILABLE_FOR_VERB flipped for log/status/diff/findConflicts"
  - "03-05-AUDIT.md confirming no jj-reachable caller of vcs.diff({staged:true})"
affects: [03-06, 03-07, phase-4-workspaces, phase-5-brownfield]

tech-stack:
  added: []
  patterns:
    - "Argv assembly mirrors git.ts shape: condition-pushed flags, trailing positional paths (jj has no `--` separator)"
    - "Hand-rolled section-parser for `jj status` human output (Working copy changes: header → A/M/D/R/C lines → Working copy/Parent commit separator)"
    - "conflicts() PLURAL revset baked into the impl from day one — upstream doc-fix deferred to plan 03-07"
    - "Primary-then-fallback path-enumeration with soft-degradation on both-fail (paths empty, revset detection already succeeded)"

key-files:
  created:
    - "sdk/src/vcs/__tests__/jj-status-log-diff.test.ts (13 integration tests)"
    - "sdk/src/vcs/__tests__/jj-findconflicts.test.ts (7 integration tests)"
    - ".planning/phases/03-jj-backend-core-squash-refs-conflict/03-05-AUDIT.md (opts.staged caller audit)"
  modified:
    - "sdk/src/vcs/backends/jj.ts (log/status/diff/findConflicts stubs → real bodies + 4 local helpers)"
    - "sdk/src/vcs/backends.ts (BACKENDS_AVAILABLE_FOR_VERB allowlist flip for 4 verbs)"
    - "sdk/src/vcs/__tests__/jj-skeleton.test.ts (4 throw-expectation tests replaced with not-throw-VcsNotImplementedError)"
    - "sdk/src/vcs/__tests__/backends.test.ts (allowlist assertion updated for the flip)"

key-decisions:
  - "Empirical verification of `jj resolve --list -r <rev>` (RESEARCH A3 medium-risk) — PRIMARY form works on jj 0.41 locally; output format is `<path>    <conflict-description>` (multiple spaces). Regex `/^(\\S+)/` extracts the path token. Fallback (`jj diff --summary` filtered for C/U letters) is dormant in practice but kept for resilience against future output drift."
  - "conflicts() PLURAL revset baked in from day one across ALL string sites in findConflicts (2 occurrences: `'conflicts()'` for scope:all, `'conflicts() & @'` for scope:working-copy). The singular `conflict()` does NOT appear anywhere in jj.ts — verified by grep gate."
  - "parseJjStatus extracts only the M-Z section: header line `Working copy changes:` opens the section; either `Working copy  (@)` or `Parent commit` closes it. The body matches `^[AMDRC] (.+)$`. Verified locally against jj 0.41 status output."
  - "parseDiffSummary accepts the full DiffNameStatusEntry letter set `A|M|D|R|C|T|U|X|B` for parity with git's diff-summary parsing (git emits T/U/X/B in obscure cases; jj's actual output is a subset of this letter set on 0.41)."
  - "opts.staged on jj is a documented no-op (no index). The diff() body ignores it — the same WC diff is returned regardless. Audit (03-05-AUDIT.md) confirms BOTH production callers (sdk/src/query/commit.ts:216, get-shit-done/bin/lib/commands.cjs:1085) pin kind:'git' explicitly, so the no-op semantics are unobservable in Phase 3."
  - "Format-migration tracker (D-19) — no entries appended. Plan 03-05 ships no new .planning/ revision-id-encoding format; ConflictResult.rev is in-memory only (returned to caller, never persisted under .planning/ by this plan)."

patterns-established:
  - "parseJjStatus / parseDiffSummary inline-helper pattern: small parsers that consume jj's human output don't need their own parse/*.ts module — they live inside createJjAdapter as local closures alongside the verb they serve. Larger NDJSON parsers (parseJjLog, parseJjBookmarkRecord, parseJjWorkspaceList) stay in parse/*.ts because they are unit-testable in isolation and shared across verbs."
  - "Primary-then-fallback path enumeration with soft-degradation: when a secondary jj invocation may be fragile across versions, attempt the canonical form first, fall through to a structural alternative on failure, return [] if both fail. The primary-detection (here, the revset) is the contract; the secondary (path list) is the diagnostic. Prevents one fragile probe from breaking the whole verb."

requirements-completed: [CONFLICT-01, CONFLICT-02, CONFLICT-03]

duration: ~11min
completed: 2026-05-12
---

# Phase 03 Plan 05: jj log/status/diff/findConflicts Bodies Summary

**Production bodies for the four remaining read-shape verbs on the jj backend: `log()` delegates to `parseJjLog` (plan 03-02); `status()` hand-parses `jj status` text per RESEARCH §status; `diff()` wraps `jj diff` with `--name-only` + `--summary`; `findConflicts()` uses jj's `conflicts()` PLURAL revset (RESEARCH Q1 correction — upstream docs say singular `conflict()`, doc-fix deferred to plan 03-07) with primary `jj resolve --list` path enumeration. BACKENDS_AVAILABLE_FOR_VERB flipped to admit `jj-colocated` for all 4 verbs.**

## Performance

- **Duration:** ~11 min (2 atomic task commits)
- **Tasks:** 2/2
- **Files modified/created:** 6 (3 created, 3 modified)
- **Lint guard (no raw git):** 0 violations / 906 files
- **JJ-03 invariant (`--ignore-working-copy` absent):** 0 occurrences in jj.ts
- **SQUASH-05 invariant (`jj commit` never invoked):** 0 occurrences in jj.ts
- **TypeScript compile:** `tsc -p tsconfig.cjs.json --noEmit` exit 0
- **Skip-count guard:** current=18 baseline=18 (no change)
- **Vitest:** all 19 vcs test files run — 315 passed / 1 skipped (the 1 occasional flaky timeout in exec-env-passthrough.test.ts under load is plan-03-04 territory and passes reliably when run in isolation; not a Plan 05 regression)

## Empirical Verification (RESEARCH A3 — `jj resolve --list -r <rev>`)

**Locally verified against jj 0.41.0 during plan execution. PRIMARY form works.**

Reproduction sequence:
```bash
mkdir /tmp/jj-conflict-probe && cd $_
jj git init --colocate
jj config set --repo user.email "p@p"
jj config set --repo user.name "P"
echo baseline > f.txt
jj describe -m 'baseline'
jj new -m 'branchA'
echo "branchA content" > f.txt
jj new -m 'branchB' '@-'
echo "branchB conflicting content" > f.txt
# Snapshot the two branches' change_ids then merge:
BA=$(jj log -r '@-' -T 'change_id.short()' --no-graph -n 1)
BB=$(jj log -r '@' -T 'change_id.short()' --no-graph -n 1)
jj new $BA $BB -m 'merge'
# Probe:
jj resolve --list -r @
```

**Output of `jj resolve --list -r @`:**
```
f.txt    2-sided conflict
```
Exit code: 0.

**Output of `jj log -r 'conflicts()' -T 'commit_id ++ "\n"' --no-graph`:**
```
8bbd85b68ba161252f6683ffb2baa6f12e82cefa
```
(The merge commit, as expected.)

**Conclusion for impl:** The PRIMARY path enumeration form works on jj 0.41 — `enumerateConflictedPaths()` uses it directly. Output is `<path>` followed by multiple spaces and a conflict description; the path is extracted via `/^(\S+)/`. The FALLBACK (`jj diff -r <rev> --summary` filtered for C/U letters) is implemented for resilience but unused in practice on this jj version.

## Accomplishments

- **`log()` body lands** — argv assembly per RESEARCH §log() (`maxCount` → `-n N`; `allRefs` → `-r 'all()'`; `rev` → `-r toJjRev(rev)`; `paths` → trailing positional). Delegates to `parseJjLog(r.stdout)` (plan 03-02 production). PITFALL 1 pinned: `LogEntry.hash` is `commit_id`, never `change_id`.

- **`status()` body lands** — wraps `jj status`; `parseJjStatus` extracts `A/M/D/R/C` letters from between the `Working copy changes:` header and the `Working copy  (@)`/`Parent commit` separator. Per Phase 2.1 D-16, the returned `StatusEntry` has NO `index` field — git-only concept dropped from the cross-backend type. `opts.porcelain === false` returns `{entries: [], raw: stdout}` mirroring the git backend.

- **`diff()` body lands** — `jj diff` + conditional `--name-only` / `--summary`. `nameOnly: true` populates `nameOnly[]` from stdout split-trim-filter; `nameStatus: true` adds the parsed `DiffNameStatusEntry[]` via `parseDiffSummary`. `opts.staged` is a documented no-op (jj has no index) — audit confirms no jj-reachable caller (03-05-AUDIT.md).

- **`findConflicts()` body lands** — uses jj's `conflicts()` PLURAL revset (RESEARCH Q1; CONTEXT/REQUIREMENTS/ROADMAP doc-fix is plan 03-07 work). `scope: 'all'` → `'conflicts()'`; `scope: 'working-copy'` → `'conflicts() & @'`. Each entry from `parseJjLog` is enriched with paths via `enumerateConflictedPaths()` (primary `jj resolve --list -r <rev>`, empirically verified working on jj 0.41). `ConflictResult.rev` is `commit_id` (40-char hex); `scope` is preserved from `opts.scope`.

- **BACKENDS_AVAILABLE_FOR_VERB flipped for all 4 verbs.** Allowlist now admits `jj-colocated` for `log`, `status`, `diff`, `findConflicts`. The contract-test fixture (adapter-contract.test.ts) was already gating verb-invoking tests behind `verbReady(verb, kind)`; the flip transparently activates the verbs on `jj-colocated`.

- **03-05-AUDIT.md classifies all `vcs.diff({staged:true})` callers.** Two production callers (sdk/src/query/commit.ts:216 and get-shit-done/bin/lib/commands.cjs:1085) both pin `kind: 'git'` explicitly. No jj-reachable caller exists; the documented no-op semantics on jj are unobservable from Phase 3. Future audits should escalate if a new caller drops the pin.

## Task Commits

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | log/status/diff bodies + parseJjStatus + parseDiffSummary + staged audit | `ywywkzxnxsllyznmvpzmpttyxqptlvop` | 6 (2 created + 4 modified) |
| 2 | findConflicts body + enumerateConflictedPaths + allowlist flip | `tskllypzrupovztpuutsxmrppokktsnm` | 5 (1 created + 4 modified) |

## Files Created/Modified

### Created (3)

- `sdk/src/vcs/__tests__/jj-status-log-diff.test.ts` — 13 integration tests covering log (5: default, maxCount, allRefs, rev, paths-non-throw), status (4: A letter, M letter, porcelain:false parity, raw field), diff (4: defaults, nameOnly, nameStatus, staged-noop). `describe.skipIf(!jjAvailable)` gates the suite on `jj --version` availability; per-test rewind via `__vcsTestOnly.snapshot/restore` (plan 03-02).
- `sdk/src/vcs/__tests__/jj-findconflicts.test.ts` — 7 integration tests covering clean-repo cases (scope:all + scope:working-copy both return `[]`) and a conflict scenario (octopus `jj new <branchA> <branchB>` with diverging `f.txt` content). Asserts `c.rev` matches `/^[a-f0-9]{40}$/` (commit_id, not change_id), `c.paths` contains `f.txt`, `c.scope` preserved.
- `.planning/phases/03-jj-backend-core-squash-refs-conflict/03-05-AUDIT.md` — per-caller classification confirming no jj-reachable `vcs.diff({staged:true})` caller in Phase 3.

### Modified (4)

- `sdk/src/vcs/backends/jj.ts` — log/status/diff/findConflicts stubs replaced with real bodies; added local helpers `parseJjStatus`, `parseDiffSummary`, `enumerateConflictedPaths`; added `StatusEntry`, `DiffNameStatusEntry` type imports; dropped the `void parseJjLog` shim (now actively used by `log()`). `notImpl` call sites in jj.ts drop from 11 → 7 (push/fetch + 5 workspace.*).
- `sdk/src/vcs/backends.ts` — `BACKENDS_AVAILABLE_FOR_VERB` flipped for `log`, `status`, `diff`, `findConflicts`; comment blocks explain the plan 03-05 flip and document the `conflicts()` plural revset convention.
- `sdk/src/vcs/__tests__/jj-skeleton.test.ts` — 4 throw-VcsNotImplementedError tests replaced with not-throw-VcsNotImplementedError (mirrors plan 03-04 / plan 03-03 pattern for was-stub-now-wired verbs). The `e instanceof VcsNotImplementedError` guard re-throws unexpected NotImpl while swallowing legitimate `VcsExecError` (e.g. when invoked against a non-existent cwd in unit-test mode).
- `sdk/src/vcs/__tests__/backends.test.ts` — allowlist assertion updated for the flip; added explicit assertions for `log`, `status`, `diff`, `findConflicts` all expecting `['git', 'jj-colocated']`; test description renamed to reflect plan 03-05 reality.

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 03-05-D-A | `parseJjStatus` + `parseDiffSummary` live as local closures inside `createJjAdapter` (not extracted to `parse/jj-status.ts`) | Both are small (<20 LOC), serve a single verb each, and don't need to be shared across modules. Unit testability is covered by the integration suite (jj-status-log-diff.test.ts) since the human-readable output format is the contract — synthetic-fixture parsing wouldn't catch jj-version drift. The NDJSON parsers (jj-log, jj-bookmark, jj-workspace-list, jj-op-log) live in `parse/` because they're larger, share field schemas, and are reused across verbs. Local-closure vs extracted-module is a size+sharing question, not a style preference. |
| 03-05-D-B | `conflicts()` PLURAL revset baked in from day one | RESEARCH Q1 verified plurality empirically on jj 0.41. The doc-fix in CONTEXT.md, REQUIREMENTS.md, ROADMAP.md is deferred to plan 03-07 wrap-up to keep this plan code-focused. All 2 string occurrences in jj.ts use the plural form; grep gate `grep -c "'conflict()'" sdk/src/vcs/backends/jj.ts` returns 0 (no singular leakage). |
| 03-05-D-C | Primary `jj resolve --list -r <rev>` for path enumeration; fallback dormant on jj 0.41 | Empirical verification (above) confirmed PRIMARY works. Output format is `<path>` + multiple spaces + `<conflict-description>`; the regex `/^(\S+)/` extracts the path. The fallback (`jj diff -r <rev> --summary` filtered for `C/U` letters) is implemented per RESEARCH A3's risk-mitigation but is unused in practice on this version — leaves a resilience layer against future jj output reshaping. Soft-degradation (`paths: []` if both forms fail) is the chosen failure mode because the conflict-detection via `conflicts()` revset already succeeded — paths-empty is a diagnostic deficiency, not a wrong-answer. |
| 03-05-D-D | `parseDiffSummary` accepts the full `DiffNameStatusEntry` letter set (`A|M|D|R|C|T|U|X|B`) | Parity with git's diff-summary parser. Git emits `T` (type change), `U` (unmerged), `X` (unknown), `B` (broken pair) in obscure cases; jj 0.41's actual output is a subset (`A/M/D/R/C/C` for renames-with-content-change), but accepting the wider set future-proofs against jj template changes without breaking the entry shape. |
| 03-05-D-E | `opts.staged` documented no-op on jj — no implementation, no warning, no error | RESEARCH §diff() flagged this as the locked cross-backend asymmetry. Audit (03-05-AUDIT.md) confirms zero jj-reachable callers — both production sites pin `kind: 'git'`. Adding a runtime warning would log spam on the impossible-to-reach path; throwing would break the cross-backend type contract. JSDoc-only documentation is the correct surface for an unobservable invariant. |
| 03-05-D-F | Format-migration tracker (D-19) — no entries appended | Plan 03-05 ships no new `.planning/` revision-id-encoding format. `LogEntry.hash`, `ConflictResult.rev` are in-memory return fields; the `.planning/` artifacts that record these (e.g., STATE.md commit references) are not written by this plan. No entries appended to the `<format_migration_tracker>` section of `03-CONTEXT.md`. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `jj-skeleton.test.ts` throw expectations outdated by Task 1's body wiring**

- **Found during:** Task 1 verify (vitest run after replacing log/status/diff `notImpl` stubs)
- **Issue:** Plan 03-01's `jj-skeleton.test.ts` lines 56-67 asserted every verb throws `VcsNotImplementedError`. Plan 03-05 Task 1 replaces 3 of those stubs with real bodies (log/status/diff). Task 2 replaces a 4th (findConflicts). The throw-assertion-against-stub becomes false once the body lands.
- **Fix:** Replaced each affected `toThrow(VcsNotImplementedError)` test with a `not.toThrow(VcsNotImplementedError)` form wrapped in a try/catch that re-throws only if the exception is a `VcsNotImplementedError` instance (mirrors plan 03-04 / 03-03's was-stub-now-wired pattern). The try/catch swallows any legitimate `VcsExecError` from invoking against a non-existent cwd in unit-test mode.
- **Files modified:** `sdk/src/vcs/__tests__/jj-skeleton.test.ts` (4 tests)
- **Verification:** All jj-skeleton.test.ts tests pass.
- **Committed in:** `ywywkzxnxsllyznmvpzmpttyxqptlvop` (Task 1) for log/status/diff; `tskllypzrupovztpuutsxmrppokktsnm` (Task 2) for findConflicts.

**2. [Rule 1 — Bug] `backends.test.ts` allowlist assertion outdated**

- **Found during:** Task 1 verify
- **Issue:** Plan 03-04 seeded an assertion that log/status/diff stay `['git']`-only with a description "log/status/diff still pending in plan 03-05". Task 1's flip invalidates the per-verb assertions; Task 2's flip extends to findConflicts.
- **Fix:** Replaced the assertions with explicit per-verb `expect(...).toEqual(['git', 'jj-colocated'])` for each of log/status/diff/findConflicts; added `push`/`fetch` assertions pinning the deliberately-not-yet-flipped verbs at `['git']`; renamed the test description to reflect plan 03-05 reality.
- **Files modified:** `sdk/src/vcs/__tests__/backends.test.ts`
- **Verification:** All 12 backends.test.ts tests pass.
- **Committed in:** `ywywkzxnxsllyznmvpzmpttyxqptlvop` (Task 1) + `tskllypzrupovztpuutsxmrppokktsnm` (Task 2) — split because the description string was updated in both commits.

### Environmental Constraints

None this plan — environment was stable. Note: an occasional flaky timeout in `exec-env-passthrough.test.ts` (the plan-03-04 test for vcsExec env passthrough) appeared during full-suite runs but always passes when isolated. Not a Plan 05 regression; not blocking. Carried forward to the verifier's attention.

## Authentication Gates

None.

## opts.staged Audit Findings (Task 1 action B)

Per the plan's Task 1 action B requirement, `03-05-AUDIT.md` was created with the full per-caller classification. Summary:

| File | Line | Adapter kind | jj-reachable? |
|------|------|--------------|---------------|
| `sdk/src/query/commit.ts` | 216 | `kind: 'git'` (line 215, explicit pin) | NO |
| `get-shit-done/bin/lib/commands.cjs` | 1085 | `kind: 'git'` (line 1084, explicit pin) | NO |

**No jj-reachable caller exists.** The documented no-op semantics for `opts.staged` on jj are unobservable from Phase 3 production code. No escalation triggered.

## Verification That `conflict()` (Singular) Does Not Leak Into jj.ts

```bash
$ grep -c "'conflict()'" sdk/src/vcs/backends/jj.ts
0
```

The 2 string occurrences of the revset in `findConflicts()` are both `'conflicts()'` (scope:all) and `'conflicts() & @'` (scope:working-copy). The doc-fix to align CONTEXT/REQUIREMENTS/ROADMAP wording is scheduled for plan 03-07; meanwhile the implementation is correct from day one.

## Invariant Verification

| Invariant | Source | Check | Result |
|-----------|--------|-------|--------|
| JJ-03 / D-05: `--ignore-working-copy` absent | T-03-02 | `grep -v '^\s*\(\*\|//\)' sdk/src/vcs/backends/jj.ts \| grep -c -- "--ignore-working-copy"` | 0 ✓ |
| SQUASH-05: `jj commit` never invoked | T-03-03 | `grep -cE "vcsExec\(cwd, 'jj', jjArgv\('commit'" sdk/src/vcs/backends/jj.ts` | 0 ✓ |
| parseJjLog delegation in log() | T-03.05-1 | `grep -E "parseJjLog\(r\.stdout\)" sdk/src/vcs/backends/jj.ts` | match ✓ |
| parseJjStatus declaration + call | T-03.05-1 | `grep -cE "parseJjStatus\b" sdk/src/vcs/backends/jj.ts` | 2 ✓ |
| parseDiffSummary declaration + call | T-03.05-1 | `grep -cE "parseDiffSummary\b" sdk/src/vcs/backends/jj.ts` | 2 ✓ |
| enumerateConflictedPaths declaration + call | T-03.05-2 | `grep -cE "enumerateConflictedPaths" sdk/src/vcs/backends/jj.ts` | 3 ✓ |
| conflicts() PLURAL revset present | T-03.05-2 | `grep -E "conflicts\(\)" sdk/src/vcs/backends/jj.ts` | 4 matches (2 in JSDoc + 2 in code) ✓ |
| singular conflict() NOT present | T-03.05-2 | `grep -c "'conflict()'" sdk/src/vcs/backends/jj.ts` | 0 ✓ |
| scope preserved on ConflictResult | T-03.05-2 | `grep -E "scope: opts\.scope" sdk/src/vcs/backends/jj.ts` | match ✓ |
| BACKENDS_AVAILABLE_FOR_VERB.log flipped | T-03.05 | `grep -A 0 "^  log:" sdk/src/vcs/backends.ts \| grep -c jj-colocated` | 1 ✓ |
| BACKENDS_AVAILABLE_FOR_VERB.status flipped | T-03.05 | `grep -A 0 "^  status:" sdk/src/vcs/backends.ts \| grep -c jj-colocated` | 1 ✓ |
| BACKENDS_AVAILABLE_FOR_VERB.diff flipped | T-03.05 | `grep -A 0 "^  diff:" sdk/src/vcs/backends.ts \| grep -c jj-colocated` | 1 ✓ |
| BACKENDS_AVAILABLE_FOR_VERB.findConflicts flipped | T-03.05 | `grep -A 0 "^  findConflicts:" sdk/src/vcs/backends.ts \| grep -c jj-colocated` | 1 ✓ |
| Lint guard (no raw git) | UPSTREAM-02 | `node scripts/lint-vcs-no-raw-git.cjs` | 0 violations / 906 files ✓ |
| TypeScript compiles | T-03-01 | `pnpm exec tsc -p tsconfig.cjs.json --noEmit` | exit 0 ✓ |
| Skip-count guard | TEST-06 | `node scripts/check-skip-count.cjs` | current=18 baseline=18 ✓ |
| Vitest jj-status-log-diff.test.ts | T-03.05-1 | `pnpm exec vitest run src/vcs/__tests__/jj-status-log-diff.test.ts` | 13 passed / 0 failed ✓ |
| Vitest jj-findconflicts.test.ts | T-03.05-2 | `pnpm exec vitest run src/vcs/__tests__/jj-findconflicts.test.ts` | 7 passed / 0 failed ✓ |
| Vitest full vcs suite | T-03.05 | `pnpm exec vitest run src/vcs/__tests__/` | 315 passed / 1 skipped (1 flaky timeout in plan-03-04 test under full-suite load — isolated re-run passes; not a Plan 05 regression) ✓ |

## Known Stubs

The following verbs still throw `VcsNotImplementedError` on the jj backend — by design, owned by later plans:

| Verb | Owning plan | Stub form |
|------|-------------|-----------|
| `push` | 03-06 | `notImpl('push')` |
| `fetch` | 03-06 | `notImpl('fetch')` |
| `workspace.{add, forget, list, context, prune}` | 03-06 | `notImpl('workspace.*')` |
| `refs.bookmarks.switch` | Phase 4 (if WS-* needs it) | direct `throw new VcsNotImplementedError(...)` with 03-03-AUDIT.md reference |
| `refs.isIgnored` | Phase 4 (if a jj-side caller surfaces) | direct `throw new VcsNotImplementedError(...)` with 03-03-AUDIT.md reference |
| `commit({amend: true})` | Phase 4/5 (if a real caller surfaces) | direct `throw new VcsNotImplementedError(...)` per RESEARCH §Q5 |

## Format-Migration Tracker (D-19)

Plan 03-05 ships **no new `.planning/` revision-id-encoding format**. `LogEntry.hash` (commit_id) and `ConflictResult.rev` (commit_id) are in-memory return fields; no artifact under `.planning/` persists a SHA produced by this plan. No entries appended to the `<format_migration_tracker>` section of `03-CONTEXT.md`.

## Threat Flags

None. Plan 05's surface is read-shape and operates entirely within the existing `vcsExec` substrate. The `parseJjStatus` regex is anchored on `^[AMDRC] ` (whitespace + letter prefix), and `parseDiffSummary` on the wider `^[AMDRCTUXB] ` letter set — both are bounded grammars, no injection vector. `enumerateConflictedPaths` regex `/^(\S+)/` extracts a non-whitespace token from controlled jj output. Threat T-03.05-01 (parser drift on jj version bump) is mitigated by the integration test suite running against real jj 0.41 — bumps will fail loudly. T-03.05-02 (stale results due to WC desync) is mitigated by D-05's never-pass-`--ignore-working-copy` invariant. T-03.05-03 (path enumeration tampering) is mitigated by the regex anchoring + soft-degradation contract.

## Next Plan Readiness

Plan 03-06 (`push`/`fetch` + workspace contract stubs) is unblocked:

- `parseJjWorkspaceList` from plan 03-02 is ready; the remaining `void parseJjWorkspaceList` shim at the bottom of `jj.ts` marks the pending consumer for plan 03-06's `workspace.list()` body.
- `enumerateConflictedPaths` + `parseJjStatus` + `parseDiffSummary` (this plan's local helpers) serve as reference patterns for plan 03-06's `workspace.context()` parser if it needs to consume similar text-shape jj output.
- The 4 read-shape verbs (log/status/diff/findConflicts) now reachable via `jj-colocated` from any production caller — the verify-gate consumer (CONFLICT-03) flows through findConflicts on jj backends now.

Plan 03-07 (end-of-phase wrap-up):

- Doc-fix for `conflict()` (singular) → `conflicts()` (plural) in CONTEXT.md / REQUIREMENTS.md / ROADMAP.md is now the only outstanding correction for this revset spelling. The implementation in `backends/jj.ts` is canonical PLURAL from day one.

## Self-Check: PASSED

- All 3 created files exist:
  - `sdk/src/vcs/__tests__/jj-status-log-diff.test.ts` ✓
  - `sdk/src/vcs/__tests__/jj-findconflicts.test.ts` ✓
  - `.planning/phases/03-jj-backend-core-squash-refs-conflict/03-05-AUDIT.md` ✓
- All 2 task commits exist in `git log --oneline`:
  - `ywywkzxnxsllyznmvpzmpttyxqptlvop` (Task 1) ✓
  - `tskllypzrupovztpuutsxmrppokktsnm` (Task 2) ✓

---
*Phase: 03-jj-backend-core-squash-refs-conflict*
*Completed: 2026-05-12*
