---
phase: 16-workflow-invariant-tooling
fixed_at: 2026-05-24T23:30:00Z
review_path: .planning/phases/16-workflow-invariant-tooling/16-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 16: Code Review Fix Report

**Fixed at:** 2026-05-24T23:30:00Z
**Source review:** .planning/phases/16-workflow-invariant-tooling/16-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (2 Critical + 5 Warning; Info findings excluded per fix_scope=critical+warning)
- Fixed: 7
- Skipped: 0

## Fixed Issues

### CR-01 + WR-01: Preserve crashed-agent workspaces in fanIn clean-merge path

**Files modified:** `sdk/src/vcs/jj/parallel.ts`, `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts`
**Commit:** `rrw` (`fix(16-02-CR-01,WR-01): preserve crashed-agent workspaces in fanIn clean-merge path`)
**Applied fix:**

In `performJjParallelFanIn`'s clean-merge branch (`parallel.ts:478-489`),
inserted a `crashedAgentIds` filter before calling
`cleanupSubagentWorkspaces`. The cleanup now passes only the SUBSET of
`handle.workspaces` corresponding to agents that exited cleanly (`exitCode === 0`);
crashed agents' workspaces are excluded so the reap loop's
`IncompleteWorkEntry.workspacePath` field points at a LIVE on-disk
directory the human reviewer can inspect to recover partial work. The
fix mirrors the W3(a) forensic-preservation contract that the
conflicted-branch path already upholds at `parallel.ts:394-402`.

In `cmd-parallel-jj.test.ts:407` (the crashed-worker scenario),
appended the WR-01 regression guard: `expect(existsSync(handle.workspaces[1].path)).toBe(true)`.
This is the inverse-polarity analog of the conflicted-branch guard at
lines 333-343. The test passed before the production fix (the
conflicted branch was never invoked) and continues to pass after the
production fix proves the crashed-agent workspace at `handle.workspaces[1]`
(agent-2 with exitCode=1) survives fanIn. The clean agent (agent-1, index 0)
is correctly reaped because it is NOT in `crashedAgentIds`.

**Verification:** `npx vitest run src/vcs/__tests__/cmd-parallel-jj.test.ts` —
all 13 tests pass including the new assertion at line 419.

### CR-02 + WR-04: Separate stdout/stderr in dogfood-restore cleanup parse

**Files modified:** `scripts/dogfood-restore.sh`, `tests/scripts/dogfood-restore-orphan-cleanup.test.cjs`
**Commit:** `quw` (`fix(16-02-CR-02,WR-04): separate stdout/stderr in dogfood-restore cleanup parse`)
**Applied fix:**

In `dogfood-restore.sh:67-88`, replaced the `2>&1` stderr-merge form with
an `if/else` block that captures gsd-sdk's stderr to a `mktemp -t`
tempfile. CLEANUP_JSON receives ONLY pristine stdout (JSON); captured
stderr is dumped to the operator's view ONLY if gsd-sdk exits nonzero.
The `if cmd >tempfile; then :; else …` form is `set -e`-safe and
correctly observes the gsd-sdk exit code (the previous `2>&1` form
couldn't surface gsd-sdk's exit because the `||` short-circuit was
gated by the outer subshell's exit, not gsd-sdk's).

For WR-04, promoted the `2>/dev/null || echo "?"` parse-failure path to
two distinct `if !` blocks that emit explicit `WARN:` lines naming
which count failed to parse and the most likely cause (`jq missing or
invalid JSON?`). The user can now distinguish a clean run (real
integers in the diagnostic) from a parse-failure run (`?` substitutions
preceded by WARN lines) — pre-fix, both paths emitted identical
"complete (abandoned=N, failedReaped=M)" lines.

Added CR-02 regression test in
`tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` using a
NOISY-stderr PATH-shim that emits a fake "WARN: simulated gsd-sdk
stderr noise (CR-02 regression fixture)" line BEFORE delegating to the
real `cli.js`. Asserts (a) `abandoned=1` — the real integer, not `?` —
proving jq parsed pristine JSON despite stderr noise; (b) the shim's
warning is SUPPRESSED on the success path (negative assertion),
proving the stderr-tee correctly isolates noise from the operator's
view when gsd-sdk exits 0; (c) the seeded orphan workspace dir IS
reaped, proving the cleanup work succeeded end-to-end.

**Verification:** `node --test tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` —
both tests pass (the existing D-16 test + the new CR-02 regression test).

### WR-02: Validate `$schema_version` in allowlist-parser

**Files modified:** `scripts/lib/allowlist-parser.cjs`, `tests/scripts/allowlist-parser.test.cjs`
**Commit:** `wmv` (`fix(16-01-WR-02): validate $schema_version in allowlist-parser`)
**Applied fix:**

Added `CURRENT_SCHEMA_VERSION = 2` constant near the existing
`REQUIRED_FIELDS`/`FORBIDDEN_FIELDS` declarations. Added explicit
validation: if `json.$schema_version` is present-but-not-undefined,
it must equal `CURRENT_SCHEMA_VERSION`, else throw with a clear
message naming both the file's reported version and the parser's
supported version. `undefined` is intentionally permitted for
back-compat with legacy allow.json files that predate the
`$schema_version` annotation. Exported the new constant from
`module.exports` for downstream consumers and tests.

Added 5 new tests covering: matching version, omitted version
(back-compat), newer version (forward-compat failure), older version
(downgrade failure), and the exported constant's value.

**Verification:** `node --test tests/scripts/allowlist-parser.test.cjs` —
all 16 tests pass (11 prior + 5 new). Cross-verified all three
production lint consumers still parse their respective allow.json
files: `lint-vcs-no-raw-git.cjs`, `lint-vcs-no-commit-id.cjs`,
`lint-vcs-parallel-call-presence.cjs` — all three pass.

### WR-03: Tighten argv truthy-check to length-guard

**Files modified:** `sdk/src/query/cleanup-subagent-workspaces.ts`, `sdk/src/query/workspace-parallel-cancel.ts`
**Commit:** `uvtt` (`fix(16-02-WR-03): tighten argv truthy-check to length-guard`)
**Applied fix:**

Replaced `args[i + 1]` truthy-check with explicit `i + 1 < args.length`
guard in two argv parsing loops:

- `cleanup-subagent-workspaces.ts:81`: `--cwd`, `--phase` arms
- `workspace-parallel-cancel.ts:65`: `--cwd`, `--handle` arms

Pre-fix, an empty-string flag value (e.g. `--phase ''`) was treated as
missing because `''` is falsy. The argv loop silently consumed the
flag and moved on, leaving `phase` undefined — the caller saw
`phase_or_all_phases_required` rather than a more specific
`invalid_phase_number` reason. After the fix, the empty-string value
flows through to the downstream validator, which produces a precise
diagnostic. For `--phase ''`, `Number('') === 0` and phase 0 is legal
per the `workspace-parallel-dispatch.ts:63-65` precedent (quick.md
uses phase 0), so the bridge accepts it; the caller's incorrect input
surfaces in their tooling rather than this parser.

The user prompt scoped the fix to the new bridge AND the analog
`workspace-parallel-cancel.ts`. Other workspace-parallel bridges
(`dispatch`, `fan-in`) carry the same pattern but were NOT modified
because they were not called out in the REVIEW.md WR-03 finding and
are pre-existing (not new in Phase 16).

**Verification:** `npx tsc --noEmit` clean across the sdk/.

### WR-05: Single-source workspace-name regex; bypass helper fallback

**Files modified:** `sdk/src/vcs/jj/workspace-cleanup.ts`, `sdk/src/query/cleanup-subagent-workspaces.ts`
**Commit:** `rlr` (`fix(16-02-WR-05): single-source workspace-name regex; bypass helper fallback`)
**Applied fix:**

Hoisted the workspace-name regex into `workspace-cleanup.ts` as a new
exported constant `WORKSPACE_NAME_RE = /^phase-(\d+)-subagent-\d+$/`.
Documented the divergence narrative + ASVS V12 / T-16.02-01 threat
model anchoring (both `^` and `$` mandatory — prevents path-injection
via crafted dir names).

Removed the duplicate inline regex in `cleanup-subagent-workspaces.ts`
and switched the import to consume the shared constant. Refactored
the `--all-phases` branch to BUCKET discovered workspaces by phase
into a `Map<number, {name, path}[]>`, then pass each bucket DIRECTLY
to the helper via the optional `workspaces` parameter. This trips the
helper's authoritative-list branch (`workspace-cleanup.ts:150-151`)
and bypasses the helper's per-phase `readdirSync` fallback entirely.

Net effect: the cross-phase enumerator's discovery regex and the
helper's tear-down logic share a single source of truth for "what
counts as a subagent workspace dir," eliminating the WR-05 divergence
where the enumerator could discover an unpadded `phase-1-subagent-1`
dir that the helper's `^phase-01-subagent-\d+$` regex would silently
skip. The per-phase helper retains its padded regex on the
direct-call path (no `workspaces` parameter) — that's the per-phase
scoping mechanism, not a divergence.

**Verification:** `npx vitest run src/vcs/__tests__/jj-workspace-cleanup.test.ts src/vcs/__tests__/cmd-parallel-jj.test.ts src/vcs/__tests__/cmd-parallel-cancel-jj.test.ts` —
all 21 tests pass (4 + 13 + 4). `node --test tests/scripts/dogfood-restore-orphan-cleanup.test.cjs tests/cli-cleanup-subagent-workspaces.test.cjs` —
all 6 tests pass. SDK rebuilt via `pnpm run build`; sdk/dist/cli.js
carries the new code, exercised end-to-end by the bash-driven
integration test.

## Skipped Issues

None — all in-scope findings were fixed.

## Out-of-Scope Issues (Info)

Three Info-severity findings (IN-01, IN-02, IN-03) were not addressed
because `fix_scope=critical+warning`. They remain as documented in
REVIEW.md for future iteration. Note: a tangential comment about the
`set -e` interaction (IN-01) was included inside the CR-02 commentary
block in `dogfood-restore.sh` as contextual documentation, but the
IN-01 finding itself (adding a code comment) was not separately
applied.

---

_Fixed: 2026-05-24T23:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
