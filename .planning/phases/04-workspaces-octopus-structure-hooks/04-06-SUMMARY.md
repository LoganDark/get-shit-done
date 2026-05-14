---
phase: 04
plan: 06
subsystem: vcs-adapter
tags:
  - hooks
  - HOOK-01
  - HOOK-02
  - HOOK-03
  - HOOK-04
  - HOOK-05
  - CI-04
  - D-08
  - D-09
  - D-10
  - jj-pre-push
dependency_graph:
  requires:
    - Phase 4 plan 01 (fireHook exported from sdk/src/vcs/hook-bridge.ts per D-07)
    - Phase 4 plan 04 (commit() phaseMergeFor gate; ensures pre-commit fire lands AFTER squash and BEFORE bookmark advance — the ordering remains valid through the D-14 insertion)
  provides:
    - jj.ts commit() pre-commit fire wired (HOOK-02 ordering verified)
    - jj.ts push() pre-push fire wired via firePrePushHook (HOOK-04)
    - sdk/src/vcs/jj/pre-push.ts inline replication of acarapetis/jj-pre-push (CI-02 — zero new Python deps)
    - sdk/src/query/hooks.ts SDK query bridge (D-08 — gsd-sdk query hooks.fire <stage> [--cwd <path>])
    - jj-hooks.test.ts contract suite (7 tests across non-colocated, colocated, and v1-interface)
    - Empirical OBSERVATION that A3 does NOT hold on jj 0.41 (see Open Questions and Decisions below)
    - Empirical lock on the verified jj 0.41 `jj bookmark list -a -T 'json(self) ++ "\n"'` NDJSON shape
  affects:
    - Phase 5 PROMPT-* workflow markdown rewrites will replace `git hook run pre-commit` with `gsd-sdk query hooks.fire pre-commit`
    - Future Tier-2 PATH-shim wrapper (deferred): layers on top of the now-stable v1 fireHook signature
tech-stack:
  added: []
  patterns:
    - UPSTREAM-02 zero-conflict sidecar (sdk/src/vcs/jj/pre-push.ts — inline jjArgvFlags, no import from backends/jj.ts)
    - Two-pass NDJSON join (local records + remote records keyed by name) for would-push enumeration
    - Cross-backend SDK query handler registered in NON_FAMILY_COMMAND_MANIFEST + FOUNDATION_STATIC_CATALOG
    - QueryHandler shape `(args, projectDir, workstream?) => Promise<QueryResult<{...}>>` honoured (corrects the plan-action sketch which used `(args, opts)` and `{error, code}` — the actual contract uses `{data}` and the SDK-supplied projectDir as default cwd)
key-files:
  created:
    - sdk/src/vcs/jj/pre-push.ts
    - sdk/src/query/hooks.ts
    - sdk/src/vcs/__tests__/jj-hooks.test.ts
  modified:
    - sdk/src/vcs/backends/jj.ts
    - sdk/src/query/command-manifest.non-family.ts
    - sdk/src/query/command-static-catalog-foundation.ts
    - sdk/src/query/command-aliases.generated.ts
    - get-shit-done/bin/lib/command-aliases.generated.cjs
key-decisions:
  - "Pre-commit fire ordering pinned in code: squash success -> hash resolution -> pre-commit fire (D-10 colocated branch / non-colocated branch) -> bookmark advance. HOOK-02 ordering verified by reading the line numbers between hash-probe, fireHook, and the bookmark-advance block in the assembled jj.ts body."
  - "D-10 colocated detection uses `existsSync('.git') && existsSync('.jj')` directly at the call site (no helper extracted) — the detection is one line and used in exactly one place; lifting it to a helper would obscure the call-site intent without saving lines."
  - "noVerify gate is at the OUTER conditional (`if (!input.noVerify)`); the colocated/non-colocated branch is INSIDE. This means noVerify=true suppresses the fire on BOTH colocated and non-colocated jj — the colocated branch already no-ops via A3, but noVerify is a HOOK-01 contract that must propagate uniformly regardless of layout. Test `HOOK-01: noVerify skips pre-commit fire` exercises the non-colocated path explicitly."
  - "firePrePushHook NDJSON parser shape was VERIFIED LOCALLY against jj 0.41 on 2026-05-13. Probe output exactly matches the plan's pinned shape: local records and remote records emit as SEPARATE NDJSON lines, `target` is an ARRAY, `tracking_target` is on the remote record, no `remote_targets` nested map. The `acarapetis` reference is cited in the file."
  - "A3 ASSUMPTION REFUTED: empirical observation in the contract test shows that `git .git/hooks/pre-commit` does NOT fire automatically after `jj squash` in colocated mode on jj 0.41. This is a SIGNIFICANT FINDING — the plan banked on A3 holding (D-10 / RESEARCH §A3). See 'Open Questions / Follow-ups' below for the recommended fix path."
  - "SDK query handler return shape uses `{data: {...}}` (matching the actual QueryHandler contract in `sdk/src/query/utils.ts`), not the plan-sketched `{data, error, code}` shape. The plan-action was a sketch — the canonical commit.ts pattern is the real shape; hooks.ts mirrors it. Errors are signalled via `data: {ok: false, error: '...'}` rather than a sibling `error` field, matching the existing handler dialect."
  - "Command registration spans 3 files: command-manifest.non-family.ts (metadata), command-static-catalog-foundation.ts (handler binding), command-aliases.generated.{ts,cjs} (alias generation). The alias files are regenerated via `pnpm exec tsx sdk/scripts/gen-command-aliases.ts` (sorted by canonical; deterministic output). Skipping the regen would leave the CJS routing seam stale — the gsd-sdk CLI consumes the generated CJS file in get-shit-done/bin/lib/."
requirements_completed:
  - HOOK-01
  - HOOK-02
  - HOOK-03
  - HOOK-04
  - HOOK-05
  - CI-04
metrics:
  duration: ~38min
  completed_date: 2026-05-13
  tasks: 4
  files: 8
  commits: 4
---

# Phase 4 Plan 6: Hook Wire-In Summary

Wire `fireHook` (exported in plan 01) into `commit()` on the jj backend with D-10 colocated detection; ship `sdk/src/vcs/jj/pre-push.ts` with inline replication of `acarapetis/jj-pre-push` trigger logic (CI-02 — no Python dep) and wire `firePrePushHook` into `push()`; add the `sdk/src/query/hooks.ts` SDK query bridge (D-08) so Phase 5 workflow markdown can rewrite `git hook run pre-commit` to `gsd-sdk query hooks.fire pre-commit`; land a 7-test contract suite passing on both jj-colocated and jj-native. Closes HOOK-01..05 and CI-04.

## Performance

- **Started:** 2026-05-13T~11:24 (HEAD reset + reads)
- **Completed:** 2026-05-13T~11:37 (SUMMARY commit)
- **Duration:** ~13 minutes wall clock (within the agent's spawn-time budget; actual planning + research was zero — pure execution against the locked plan)
- **Tasks:** 4
- **Files created:** 3 (`sdk/src/vcs/jj/pre-push.ts`, `sdk/src/query/hooks.ts`, `sdk/src/vcs/__tests__/jj-hooks.test.ts`)
- **Files modified:** 5 (`sdk/src/vcs/backends/jj.ts`, `sdk/src/query/command-manifest.non-family.ts`, `sdk/src/query/command-static-catalog-foundation.ts`, `sdk/src/query/command-aliases.generated.ts`, `get-shit-done/bin/lib/command-aliases.generated.cjs`)
- **Commits:** 4

## What Landed

1. **`sdk/src/vcs/backends/jj.ts` commit() pre-commit fire (Task 1)**
   - New imports: `existsSync` from `node:fs`; `fireHook` from `../hook-bridge.js`.
   - Insertion at line ~237 (between hash resolution and bookmark advance): `if (!input.noVerify) { isColocated check; non-colocated: fireHook(cwd, 'pre-commit', {stagedFiles: input.files}); colocated: no-op }`.
   - Hook failure surfaces via merged stderr (T-03.04-03 mitigation pattern); the squash already succeeded so `exitCode` reflects `squashRes`, not the hook result.
   - HOOK-02 ordering verified by line-number ordering check: `hash-probe failed` (line 235) → `fireHook(cwd, 'pre-commit'` (line 252) → `if (input.bookmark !== undefined || input.bookmarkRaw` (line 268). The fire sits between them.

2. **`sdk/src/vcs/jj/pre-push.ts` (Task 2)**
   - 154-line sidecar inline-replicating `acarapetis/jj-pre-push` trigger logic. CI-02: zero new Python runtime deps. The upstream Python tool is reference-only.
   - `firePrePushHook(cwd, {remote?}): ExecResult` enumerates bookmarks via `jj bookmark list -a -T 'json(self) ++ "\n"'`, parses NDJSON two-pass (locals + remotes joined by name), counts would-push candidates (locals whose `target` differs from any matching remote `target`, plus locals without a matching remote line = new bookmarks). When count is 0 → returns `{exitCode:0, ...}` without firing. When count > 0 → calls `fireHook(cwd, 'pre-push', {stagedFiles:[]})`.
   - `jjArgvFlags(repo)` inline (UPSTREAM-02 — does NOT import the jj.ts helper).
   - Bookmark enumeration failure → returns non-zero with stderr; caller (`push()`) bails on the non-zero exit.

3. **`sdk/src/vcs/backends/jj.ts` push() pre-push fire (Task 2)**
   - New import: `firePrePushHook` from `../jj/pre-push.js`.
   - Insertion before the final `return vcsExec(cwd, 'jj', jjArgv(...args))`: `if (!opts.noVerify) { firePrePushHook(cwd, {remote: opts.remote}); non-zero exit → return failure-shaped ExecResult }`.
   - Honours HOOK-01 contract (`opts.noVerify === true` skips the fire) and CI-02 (only the inline sidecar — zero new deps).

4. **`sdk/src/query/hooks.ts` SDK query bridge (Task 3)**
   - `fireHookQuery: QueryHandler` validates the stage arg (`pre-commit` | `pre-push`), scans subsequent args for `--cwd <path>`, defaults to `projectDir` (the SDK-supplied caller cwd), delegates to `fireHook(cwd, stage)`.
   - Returns `{data: {stage, cwd, exitCode, stdout, stderr, ok}}`. `ok === true` when `exitCode === 0` (or the hook file is absent — `hook-bridge.ts:23` treats absence as success).
   - HOOK-05 v1 stability: the bridge does NOT pass `HookContext`. A future Tier-2 PATH-shim wrapper layers ctx population on top without breaking the v1 fireHook signature.
   - Manifest registration: `hooks.fire` (alias `hooks fire`), `mutation: true`, `outputMode: 'json'`.
   - Wired in `FOUNDATION_STATIC_CATALOG` mutation surfaces alongside `commit` / `check-commit`.
   - Generated alias files (`sdk/src/query/command-aliases.generated.ts` and `get-shit-done/bin/lib/command-aliases.generated.cjs`) regenerated via `pnpm exec tsx sdk/scripts/gen-command-aliases.ts` to keep CJS routing in sync.

5. **`sdk/src/vcs/__tests__/jj-hooks.test.ts` (Task 4) — 7 tests, all passing on both backends**
   - **HOOK-02 + HOOK-03 (non-colocated jj):** pre-commit fires after squash; marker file appears in `.githooks/pre-commit` body.
   - **HOOK-01 (non-colocated jj):** `noVerify: true` skips the fire; marker absent.
   - **T-03.04-03 (non-colocated jj):** non-zero hook exit → `r.exitCode === 0` (squash succeeded), `r.hash` truthy, `r.stderr` matches `/pre-commit hook failed/`.
   - **HOOK-04 (non-colocated jj):** with no bookmarks and no remote, `firePrePushHook` enumerates 0 candidates and skips the fire; marker absent. (The downstream `jj git push` itself fails — no remote — but the gate predicate is what's under test.)
   - **D-10 (colocated jj):** adapter-side `.githooks/pre-commit` MUST NOT fire when both `.git` and `.jj` exist; marker absent.
   - **A3 observational (colocated jj):** writes a probe to `.git/hooks/pre-commit`, runs `vcs.commit(...)`, observes whether the probe fired. **OBSERVED: A3 DOES NOT HOLD on jj 0.41** — see Open Questions below.
   - **HOOK-05 v1 interface stability:** dynamic-import `fireHook`, assert `typeof === 'function'` and `.length <= 3` (i.e. signature is `(cwd, stage, ctx?)`). A future Tier-2 wrapper can layer without breaking.

## Pitfalls Confirmed / Empirically Locked

| Pitfall | Source | Confirmation |
|---------|--------|--------------|
| **Pitfall 7 (RESEARCH §"Don't Hand-Roll > jj git push pre-hook trigger")** | acarapetis/jj-pre-push is the reference impl; CI-02 forbids the Python dep | Inline replication landed in 154 LOC. The two-pass NDJSON join handles the local/remote separation and length-1 / divergent `target` array cases. `acarapetis` is cited in the file header per the gate. |
| **jj 0.41 NDJSON bookmark shape (Task 2 pre-impl probe)** | Plan's pinned shape (local + remote on separate lines, target is array) | Re-probed against `/tmp/gsd-ndjson-probe` (fresh colocated repo with one bookmark created via `jj bookmark create -r @-`). Output matches the plan's expected shape exactly: `{"name":"bm1","target":["<40hex>"]}` and `{"name":"bm1","remote":"git","target":["<40hex>"],"tracking_target":["<40hex>"]}`. No `remote_targets` nested map. |
| **HOOK-02 ordering (RESEARCH constraint)** | pre-commit fires AFTER squash success, BEFORE bookmark advance | Line ordering verified: hash-probe (line 235) → pre-commit fire (line 252) → bookmark advance (line 268). The fire sits between them. |
| **D-10 colocated no-op** | Both `.git` and `.jj` exist → adapter-side fire is a no-op | Test `D-10: colocated mode skips adapter-side fireHook for pre-commit` passes (marker absent). |

## Empirical Confirmations (per plan `<output>` requests)

1. **A3 assumption status — DID NOT HOLD on jj 0.41.** The observational test wrote `.git/hooks/pre-commit` in the colocated fixture, ran `vcs.commit({...})`, and observed that the marker file was NOT created. The stderr line `A3 assumption did NOT hold - git .git/hooks/pre-commit did not fire after jj squash on this jj version. See plan 04-06 SUMMARY.` surfaces via the test's `console.warn`. **This is significant** — see Open Questions / Follow-ups.

2. **Exact NDJSON shape on jj 0.41 for `jj bookmark list -a -T 'json(self) ++ "\n"'`:**
   ```
   {"name":"bm1","target":["bae15ddeee32297cd54deab40eec317d8f961f86"]}
   {"name":"bm1","remote":"git","target":["bae15ddeee32297cd54deab40eec317d8f961f86"],"tracking_target":["bae15ddeee32297cd54deab40eec317d8f961f86"]}
   ```
   Pinned in the file as a `VERIFIED SHAPE (jj 0.41, ... probed 2026-05-13)` comment block. The parser intentionally does NOT reference any `remote_targets` nested map (the earlier draft's hypothesis was refuted by the probe).

3. **A4 assumption — acarapetis/jj-pre-push trigger logic = "enumerate would-push, fire once".** The inline replication takes this simple semantic and adds the `opts.remote` filter (when callers want per-remote selectivity) and the brand-new-bookmark-without-remote-record path (counts a local with no matching remote line as a would-push candidate — matches `jj git push` default behaviour of pushing new bookmarks). No subtler behaviour observed; the trigger predicate is intentionally coarse (fire-or-skip is binary, the hook script itself does fine-grained inspection).

4. **SDK query bridge `--cwd` flag passes correctly.** The smoke test `fireHookQuery(['pre-push', '--cwd', '/tmp'], process.cwd())` returned `{data: {stage: 'pre-push', cwd: '/tmp', exitCode: 0, ok: true, ...}}`. The `cwd` field in the response confirms the flag override won over the projectDir default.

## Threats Mitigated

| Threat ID | Disposition | Mitigation Applied |
|-----------|-------------|---------------------|
| T-04.06-01 (hook script tampering via commit message) | mitigate | Phase 1 D-05 + fireHook contract: HookContext is structured (env, stagedFiles); no consumer-content origin info is passed. `hooks.ts` (Task 3) intentionally passes `undefined` for ctx. |
| T-04.06-02 (hook scripts access .envrc) | accept | Pre-existing Phase 1 posture — unchanged. |
| T-04.06-03 (NDJSON enumeration trusts shape) | mitigate | `firePrePushHook` parses NDJSON line-by-line with try/catch; malformed lines are silently skipped. The two-pass join tolerates missing `tracking_target`. Worst case: a malformed bookmark line skips a legitimate push candidate (fail-open in the gate direction; the actual hook fire is still rejected by an external trip-wire). |
| T-04.06-04 (--cwd flag injection in hooks.fire) | mitigate | Documented as caller responsibility: workflow markdown in Phase 5 passes `--cwd .` from the orchestrator's main workspace. `fireHook` joins the cwd with `.githooks/<stage>` and existsSync-gates before invoking; a malicious cwd pointing at an unrelated directory still requires that directory to have a `.githooks/<stage>` executable. |
| T-04.06-05 (pre-push hook hang) | mitigate | `fireHook` uses `vcsExec` with `timeout: 60_000` (`hook-bridge.ts:38`). 60s cap limits hang. |
| T-04.06-SC (no new deps) | accept | Plan 06 introduces zero new runtime deps. `acarapetis/jj-pre-push` is reference-only; inline replication per CI-02. |

## Verification Gate Outcomes

| Gate | Result |
|------|--------|
| `cd sdk && pnpm tsc --noEmit` | **PASS** (exit 0) |
| `cd sdk && pnpm build:cjs` | **PASS** (dist-cjs produced; hooks.ts is in `src/query/` and not in the CJS build's `include`, by design — the SDK query dispatcher is ESM-only) |
| `cd sdk && pnpm build:esm` | **PASS** (`dist/query/hooks.js` exists) |
| `node scripts/lint-vcs-no-raw-git.cjs` | **PASS** (919 files scanned, 0 violations) |
| `node scripts/check-skip-count.cjs` | **PASS** (current=18, baseline=18 — no increase) |
| Task 1 grep acceptance (6 assertions) | **ALL PASS** |
| Task 2 grep acceptance (15 assertions; includes the `remote_targets`-must-be-0 and 60-160 LOC bound) | **ALL PASS** (final pre-push.ts: 154 lines) |
| Task 3 grep acceptance (6 assertions) + smoke test (4 fireHookQuery shapes) | **ALL PASS** |
| Task 4 grep acceptance (5 assertions) | **ALL PASS** |
| `GSD_TEST_BACKENDS=jj-colocated pnpm vitest run src/vcs/__tests__/jj-hooks.test.ts` | **PASS** (7/7 tests, 6.06s) |
| `GSD_TEST_BACKENDS=jj-native pnpm vitest run src/vcs/__tests__/jj-hooks.test.ts` | **PASS** (7/7 tests, 3.12s) |

## Deviations from Plan

### Rule 3 (auto-fix blocking issues) — minor shape correction in hooks.ts return type

**1. [Rule 3 — Blocking] QueryHandler return shape correction**
- **Found during:** Task 3 (writing hooks.ts; reading `sdk/src/query/utils.ts` for the canonical contract)
- **Issue:** The plan-action sketched a return shape `{error: '...', code: 'INVALID_ARGS'}` for hooks.ts. The canonical `QueryHandler` signature in `sdk/src/query/utils.ts` returns `Promise<QueryResult<T>>` where `QueryResult = {data: T, format?: 'json' | 'text'}` — there is no sibling `error` or `code` field. Following the plan-sketch would have produced a type error (`error` not assignable to `QueryResult`) and a runtime drift from every other handler.
- **Fix:** Mirrored the existing handler dialect (see `commit.ts`, `check-commit.ts`): errors are returned as `{data: {ok: false, error: '...'}}`. The smoke test exercises the missing-stage and invalid-stage paths and confirms the shape.
- **Files modified:** `sdk/src/query/hooks.ts`
- **Commit:** `splyuxlqqlykuzwmporszsuquvxvssxm`

**2. [Rule 3 — Blocking] Command registration spans 3 files, not 1**
- **Found during:** Task 3 (reading `command-manifest.ts` — discovered it's an aggregator of family-specific manifests; the non-family commands live in `command-manifest.non-family.ts` and handlers are bound in `command-static-catalog-foundation.ts` / `-domain.ts`)
- **Issue:** The plan-action said "register the handler in `sdk/src/query/command-manifest.ts`". That file is a family-aggregator and doesn't accept non-family entries directly. The correct registration surface is the trio: (a) `command-manifest.non-family.ts` for metadata, (b) `command-static-catalog-foundation.ts` for handler binding, (c) regen of `command-aliases.generated.{ts,cjs}` to propagate to CJS routing.
- **Fix:** Added entries to all three files; ran the generator script (`pnpm exec tsx sdk/scripts/gen-command-aliases.ts`) to keep CJS in sync. The plan's spirit (a single registration site mirroring `commit`) is honoured — there really is one logical registration, just split across three derived artefacts by the repo's existing manifest architecture.
- **Files modified:** `sdk/src/query/command-manifest.non-family.ts`, `sdk/src/query/command-static-catalog-foundation.ts`, `sdk/src/query/command-aliases.generated.ts`, `get-shit-done/bin/lib/command-aliases.generated.cjs`
- **Commit:** `splyuxlqqlykuzwmporszsuquvxvssxm`

**3. [Rule 3 — Blocking] `jj git init --no-git` → `--no-colocate`**
- **Found during:** Task 4 (writing the non-colocated fixture in `jj-hooks.test.ts`)
- **Issue:** The plan-action sketch in Task 4 used `jj git init --no-git` for the non-colocated fixture. Plan 04-01's SUMMARY already documented that this flag does not exist on jj 0.41; the correct form is `jj git init --no-colocate`. Following the plan-sketch verbatim would have failed at test setup.
- **Fix:** Used `jj git init --no-colocate` in the test fixture. Comment cites plan 04-01's empirical lock.
- **Files:** `sdk/src/vcs/__tests__/jj-hooks.test.ts`
- **Commit:** `rutnvwoswqppzzrrwxqlztwxrowntuzk`

### Rule 1 / Rule 2 / Rule 4 — none in this plan

---

**Total deviations:** 3 (all Rule-3 blocking corrections to plan-sketch details; substantive plan invariants — HOOK ordering, D-10 semantics, CI-02 inline-replication, --cwd default — all honoured verbatim).

## Open Questions / Follow-ups

1. **A3 ASSUMPTION REFUTED — colocated jj does NOT trigger `.git/hooks/pre-commit` automatically.** Empirical observation: the contract test wrote a probe to `.git/hooks/pre-commit` in a colocated fixture, executed `vcs.commit({...})` (which runs `jj squash` and triggers jj's natural post-squash `jj git export` to update `.git`), and confirmed that the probe was NOT executed. This contradicts the A3 assumption in RESEARCH and the rationale for the D-10 colocated no-op branch in jj.ts.

   **Implication:** with the current D-10 no-op, colocated jj users have NO `.githooks/pre-commit` execution path at all — neither the adapter-side fire (skipped by D-10) nor the git-side hook (which does not fire automatically). This is a regression vs the implicit Phase 3 assumption that "users with `.git/hooks/pre-commit` already configured will still have hooks fire under jj-colocated."

   **Recommended fix path (for a follow-up plan, deferred):**
   - **Option A (simplest, safest):** Remove the D-10 colocated no-op. Fire `fireHook(cwd, 'pre-commit', ...)` in BOTH colocated and non-colocated modes. The adapter shells `.githooks/<stage>` (note: `.githooks/`, not `.git/hooks/`), so a colocated repo with BOTH `.git/hooks/pre-commit` (git-native) AND `.githooks/pre-commit` (gsd adapter-side) would have only the latter fire — caller responsibility to align the two paths.
   - **Option B (preserves D-10 partial intent):** In colocated mode, additionally shell `.git/hooks/pre-commit` explicitly (mirroring what git would do natively). This converges colocated/non-colocated behaviour while keeping the `.githooks/` adapter convention.
   - **Option C (rolling-jj-version probe):** Add a one-shot startup probe that detects whether the current jj version honours hook-export-on-squash; if it does, keep D-10; if not, fall through to Option A.

   None of these are in scope for plan 04-06 — the plan locked in D-10 with the A3 assumption, and the contract test was designed to OBSERVE the assumption rather than enforce it. The observational result is captured here for a Phase 4 wrap-up or Phase 5 / future-phase decision.

2. **HOOK-04 contract test is the WEAK form ("no bookmarks → no-op").** The non-colocated suite verifies the would-push predicate's no-op path but does NOT exercise the predicate-fires path (i.e. seeding a tracked remote bookmark and verifying the hook DOES fire). Seeding a real remote in a test fixture is non-trivial (would require setting up a bare git remote and pointing jj at it). The empirical NDJSON shape is locked, and the predicate's logic is exercised by the parser's two-pass join (which is verified by the shape gate). A real-remote integration test could land in a follow-up plan if a production caller demands tighter verification.

3. **HOOK-05 v1 interface gate uses arity (`.length <= 3`).** This is a thin probe — it verifies the signature can accept up to 3 args but does not pin the EXACT shape (e.g. types of args, return contract). A stronger gate would be a TypeScript-level test that imports `HookStage` and `HookContext` from `'../types.js'` and asserts the signature at compile time. The current arity probe is good enough for the v1 stability claim (Tier-2 wrapper layering); a stronger gate is deferred.

## Pre-existing Issues (Not Caused by Plan 04-06)

No new pre-existing issues surfaced during this plan's execution. The pre-existing parallel-pollution issues documented in plan 04-01 / 04-04 SUMMARYs are still present in the broader SDK suite but the new `jj-hooks.test.ts` runs cleanly in isolation and in `--reporter=verbose` mode.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-network-endpoint | sdk/src/query/hooks.ts | The SDK query `hooks.fire` exposes a new CLI-callable surface that shells out to `.githooks/<stage>`. Adding it to `NON_FAMILY_COMMAND_MANIFEST` with `mutation: true` flags it for the verifier's catalog audit. The threat model row T-04.06-04 (--cwd injection) mitigates the obvious risk; the verifier should additionally confirm that no workflow markdown is rewriting `--cwd` to a caller-controlled value without an allow-list check. |

## Files

**Created (3):**
- `sdk/src/vcs/jj/pre-push.ts` — 154 lines (inline acarapetis/jj-pre-push replication)
- `sdk/src/query/hooks.ts` — 81 lines (SDK query bridge)
- `sdk/src/vcs/__tests__/jj-hooks.test.ts` — 246 lines (7-test contract suite)

**Modified (5):**
- `sdk/src/vcs/backends/jj.ts` — +47 lines: imports + commit() pre-commit fire + push() pre-push fire
- `sdk/src/query/command-manifest.non-family.ts` — +4 lines: hooks.fire manifest entry
- `sdk/src/query/command-static-catalog-foundation.ts` — +6 lines: fireHookQuery import + handler bindings
- `sdk/src/query/command-aliases.generated.ts` — regenerated (adds hooks.fire row)
- `get-shit-done/bin/lib/command-aliases.generated.cjs` — regenerated (CJS mirror)

**Commits:**
- `kpyrlqurlnwtvryowqqrxqpyxxnzkmmu` feat(04-06): wire fireHook pre-commit into jj.ts commit() with D-10 colocated no-op
- `nzkmotoukusvmmorqntqmxpllvulnwnn` feat(04-06): add firePrePushHook sidecar + wire pre-push into jj.ts push()
- `splyuxlqqlykuzwmporszsuquvxvssxm` feat(04-06): add gsd-sdk query hooks.fire bridge for Phase 5 PROMPT-* rewrites
- `rutnvwoswqppzzrrwxqlztwxrowntuzk` test(04-06): contract suite for hook firing — HOOK-01..05, D-10, CI-04

## Next Phase Readiness

- **Phase 5 PROMPT-* workflow markdown rewrites unblocked.** `gsd-sdk query hooks.fire <stage> [--cwd <path>]` is reachable through the SDK CLI; workflow markdown can replace `git hook run pre-commit` invocations directly.
- **HOOK-05 v1 interface locked.** `fireHook(cwd, stage, ctx?)` signature pinned by arity gate + interface stability test. Tier-2 PATH-shim wrapper (deferred) can layer on top without breaking the v1 surface.
- **A3 assumption refutation requires follow-up.** This is the most significant unblockable finding — see Open Questions §1 above. Either a wrap-up plan or a Phase 5 fix-up should remove the D-10 colocated no-op so colocated users have a working `.githooks/<stage>` execution path. The plan-locked behaviour is preserved here (we did not auto-fix this — that would be Rule 4 architectural territory, requiring planner sign-off on which Option (A/B/C above) to take).

## Self-Check: PASSED

All 8 files (3 created + 5 modified) exist on disk; all 4 commits exist in `git log 2c71383b..HEAD`. Verified:

```
$ [ -f sdk/src/vcs/jj/pre-push.ts ] && echo FOUND   # FOUND
$ [ -f sdk/src/query/hooks.ts ] && echo FOUND       # FOUND
$ [ -f sdk/src/vcs/__tests__/jj-hooks.test.ts ] && echo FOUND   # FOUND
$ [ -f sdk/src/vcs/backends/jj.ts ] && echo FOUND   # FOUND
$ [ -f sdk/src/query/command-manifest.non-family.ts ] && echo FOUND   # FOUND
$ [ -f sdk/src/query/command-static-catalog-foundation.ts ] && echo FOUND   # FOUND
$ [ -f sdk/src/query/command-aliases.generated.ts ] && echo FOUND   # FOUND
$ [ -f get-shit-done/bin/lib/command-aliases.generated.cjs ] && echo FOUND   # FOUND
$ git log --oneline 2c71383b..HEAD   # 4 hashes: 001019b3, e85430e2, f79b3e7a, c9f2627c
```

Requirements have direct evidence anchors:
- HOOK-01 (noVerify): jj.ts commit() outer `if (!input.noVerify)` + push() outer `if (!opts.noVerify)` + test `HOOK-01: noVerify skips pre-commit fire`.
- HOOK-02 (post-squash, pre-bookmark ordering): line-ordering check in jj.ts commit() body + test `HOOK-02 + HOOK-03: pre-commit fires after squash in non-colocated jj`.
- HOOK-03 (D-10 colocated): `isColocated` branch in jj.ts + test `D-10: colocated mode skips adapter-side fireHook for pre-commit`.
- HOOK-04 (pre-push gate): jj.ts push() `firePrePushHook` call + pre-push.ts trigger predicate + test `HOOK-04: pre-push no-op when no bookmarks would push`.
- HOOK-05 (v1 interface stability): hooks.ts intentional ctx-omission + interface gate test `fireHook signature is (cwd, stage, ctx?) - Tier 2 wrapper can layer without breaking`.
- CI-04 (no Python dep): pre-push.ts inline replication; `acarapetis` cited as reference-only; lint guard PASS.

---

*Phase: 04-workspaces-octopus-structure-hooks*
*Completed: 2026-05-13*
