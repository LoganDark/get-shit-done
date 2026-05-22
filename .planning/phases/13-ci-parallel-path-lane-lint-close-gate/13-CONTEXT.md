# Phase 13: CI parallel-path lane + lint close-gate - Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 13 delivers the CI safety net for v1.3's parallel-dispatch verbs and the
architectural proof that raw-git is gone from workflow markdown. Four things
ship:

1. A new standalone `.github/workflows/parallel-e2e.yml` CI lane that runs a
   synthetic 2-plan parallel phase end-to-end on both backends —
   required-blocking on jj-colocated, optional on git (CI-05).
2. `scripts/audit-workflow-raw-git.cjs` — a stdout-only scanner proving zero raw
   `git ` invocations inside `.md` shell-fence blocks (` ```bash`/` ```sh`/
   ` ```zsh`) under `get-shit-done/workflows/`, `get-shit-done/references/`,
   and `agents/` (LINT-04).
3. CI-06 wiring: the `parallel-e2e` lane runs the audit and fails if the
   zero-hits invariant breaks (milestone-completeness regression guard).
4. LINT-05 bookkeeping: the `lint-vcs-no-raw-git.allow.json` +1 diff (already
   landed in Phase 10 for `sdk/src/vcs/git/parallel.ts`) is recorded in the
   v1.3 milestone close commit; the 23 production entries stay untouched.

**Out of scope (explicit):**
- Flipping the `parallelization` config default — Phase 14 (CONFIG-01).
- The dogfood run on this repo — Phase 14 (DOGFOOD-01/02).
- Modifying any of the 23 production `lint-vcs-no-raw-git.allow.json` entries,
  or adding a *new* entry beyond the Phase-10 `git/parallel.ts` one (LINT-05).
- Promoting `audit-workflow-raw-git.cjs` into `npm pretest` as a permanent
  per-test-run lint (LINT-04: "NOT added to CI pretest").

</domain>

<decisions>
## Implementation Decisions

### E2E lane execution model

- **D-01:** The `parallel-e2e` lane runs a **shell-script harness** that drives
  the SDK CLI verbs (`gsd-sdk query workspace.parallel.dispatch`,
  `gsd-sdk query workspace.parallel.fan-in`) against a throwaway repo. NOT a
  dedicated vitest suite; NOT the real `/gsd:execute-phase` orchestrator.
  Rationale: TEST-13's `cmd-parallel-{git,jj}.test.ts` already cover the
  TypeScript-function surface — they call `createJjAdapter`/`createGitAdapter`
  directly and assert on typed `ParallelDispatchHandle`/`FanInResult` objects
  (N=2/3/4 dispatch, clean fan-in, conflict, crashed-worker, idempotent
  re-call). The shell harness is the only model that adds a *new* layer rather
  than re-running an existing one: the `gsd-sdk query workspace.parallel.*`
  CLI bridges, `@-`/`@file` stdin resolution, the `{ok:false,reason}` failure
  envelope, and the `jq` pipelines `execute-phase.md` actually runs. It is also
  the only model that exercises real `jj`/`git` subprocesses — required for
  SC5's colocated `.githooks/pre-commit` hook-fire check, which in-process
  adapter calls cannot trigger. The harness mirrors the `execute-phase.md`
  shell sequence 1:1 and reuses the `install-smoke.yml` pattern of `gsd-sdk`
  on PATH. No new dependency (Node + shell only).

- **D-02:** Lane pass/fail assertions for the synthetic 2-plan phase:
  1. `dispatch` exits with a frozen Handle JSON whose `.workspaces | length`
     is `2`.
  2. `fan-in` returns `.conflicted == false`; `.merged | length` is `2` on git
     (one entry per 2-parent merge) and `1` on jj (one N-parent octopus merge)
     — the per-backend split locked by Phase 10 D-13.
  3. On jj: `jj log -r 'divergent()' --no-graph` is empty post-fan-in (TEST-14
     parity, asserted at the CLI layer).
  4. Manifest schema asserted **per-backend** — git's dispatch Handle carries a
     manifest (VCS-19 fields: `plan_id`, `agent_id`, `backend`); jj's
     `handle.manifest` is empty (`''`) per Phase 11 D-01 which retired the
     jj-side manifest. Planner confirms exact shape against `sdk/src/vcs/types.ts`
     and the Phase 9/10 contract tests.
  5. On jj-colocated: a sentinel `.githooks/pre-commit` fired during the
     synthetic phase's `jj squash` calls (ROADMAP SC5 — exercises the Phase 12
     A3 fix in a real parallel-dispatched run).
  6. `node scripts/audit-workflow-raw-git.cjs` exits 0 (CI-06 — zero raw-git
     hits; a non-zero exit fails the lane).

### CI lane placement

- **D-03:** The lane lives in a **new standalone `.github/workflows/parallel-e2e.yml`**
  — NOT a new job inside `test.yml`. Rationale: the new lane's blocking posture
  is the *inverse* of `test.yml`'s `test` job. `test` is required-blocking on
  git and allow-failure on jj (`continue-on-error: ${{ matrix.backend ==
  'jj-colocated' || matrix.backend == 'jj-native' }}`, line 91); `parallel-e2e`
  must be required-blocking on jj-colocated and optional on git — the exact
  opposite. Co-locating two jobs with opposite `continue-on-error` polarity in
  one file is a standing misread hazard. A standalone file matches the repo's
  single-concern split convention (`install-smoke.yml`, `canary.yml`,
  `security-scan.yml` are each single-concern), gets its own `concurrency`
  group and `paths:` filter, and is a clean home for the CI-06 audit step.
  Accepted cost: ~10 duplicated jj-install lines (the `v0.41.0` tarball curl)
  plus checkout/setup-node SHA pins — Renovate keeps the version pins current.
  The new file carries its own CI-03-style header comment restating the
  GitHub-Actions-stays-on-git boundary.

- **D-04 [planner constraint — not a discussion choice]:** GitHub treats
  skipped and `continue-on-error: true` matrix cells as **passing** for branch
  protection. "Required-blocking on jj-colocated" therefore cannot be enforced
  by a matrix cell alone — `continue-on-error: true` on the git cell means a
  *failed* git cell still reports the job green. Phase 13 must implement the
  blocking guarantee one of two ways: (a) a separate non-matrix
  `parallel-e2e-jj-required` job, or (b) a `needs:`-gated "all-green" summary
  job that inspects per-cell results. The new required-check string (the gate
  job's name) must be registered in GitHub branch-protection settings — that
  registration is config outside the repo; flag it for the user at ship time.
  Researcher/planner picks (a) vs (b).

### Synthetic phase source

- **D-05:** The two synthetic plans are **generated at runtime** into a
  `mkdtemp` throwaway repo by the harness — NOT a checked-in fixture directory,
  NOT hybrid checked-in templates. Rationale: matches the established Pattern B
  convention (random-prefix `mkdtemp`, REQUIREMENTS TEST-16, PITFALLS Pitfall 9)
  used by every existing `cmd-parallel-*` test; zero fixture-vs-verb drift
  (synthetic content lives beside the assertions that consume it); git/jj
  parity is free via the existing `setupGitRepo`/`setupJjRepo` helper shape.
  The dispatched "plan" is *not* a GSD `PLAN.md` — `ParallelDispatchOpts.plan`
  carries only `{agentId, planId, workspacePath?}` and `planId` is an opaque
  label the verbs never open; each synthetic plan only needs to produce one
  commit in its workspace (`writeFileSync` + a backend commit). A checked-in
  fixture would invent a new convention — all three existing `tests/fixtures/`
  entries (`fallow`, `jj-ndjson`, `live-command-registry`) are static
  parser-input data, never live-VCS seeds — and would not escape Pattern B
  anyway (a `mkdtemp` repo is still needed to copy into). `mkdtemp` lives
  outside the colocated repo, so the synthetic repo never pollutes the real jj
  working copy (consistent with D-06's intent).

### Audit script lifecycle + evidence

- **D-06:** `scripts/audit-workflow-raw-git.cjs` is **stdout-only — it writes
  nothing to disk.** It emits the human-readable `.md` report to stdout by
  default and the machine-readable JSON form to stdout via a `--json` flag
  (the `scripts/audit-id-namespace.cjs` D-01 single-source-of-truth pattern).
  LINT-04's phrase "emits both `.md` + JSON sidecar" is satisfied by the
  default-`.md` / `--json` stdout modes — "sidecar" means the JSON output
  *mode*, not a file written to disk (this matches the cited
  `audit-id-namespace.cjs` precedent, which calls its `--json` stdout output
  the single-source seed). No `13-WORKFLOW-RAW-GIT-AUDIT.md` and no JSON
  sidecar file is written or committed. Rationale: explicit user constraint —
  *"whatever avoids being auto-tracked by jj."* This repo is colocated jj; any
  file the audit writes into the working tree is auto-snapshotted into the
  working-copy commit on the next `jj` invocation. Stdout-only writes nothing,
  so there is nothing for jj to auto-track. This also matches both existing
  audit-script precedents in `scripts/` exactly (`audit-id-namespace.cjs` and
  `migr-06-close-gate.cjs` are both stdout-only).

- **D-07:** The audit is a **maintained, unit-tested script** — not throwaway.
  LINT-04's "one-shot" wording means *not added to `npm pretest`* — it does not
  mean throwaway quality. CI-06 runs the audit in the `parallel-e2e` lane on
  every build as a milestone-completeness regression guard, so it is permanent
  CI-exercised code. It gets a unit test (mirroring
  `tests/scripts/migr-06-close-gate.test.cjs`) and `module.exports` of its pure
  scan functions for testability (mirroring `audit-id-namespace.cjs`). It stays
  out of the `npm pretest` hook (`build:sdk` + `lint:skill-deps` +
  `lint-vcs-no-commit-id.cjs`) — not a per-test-run gate.

- **D-08:** The v1.3 milestone close-gate **evidence** is: (1) the first green
  `parallel-e2e` audit step — zero raw-git hits in `.md` shell-fence blocks =
  milestone-completeness proof — and (2) a quoted zero-hits audit summary in
  the v1.3 milestone close commit message. There is no committed audit `.md`
  artifact (consequence of D-06). The close commit message is the durable,
  VCS-permanent record; the CI run log is the corroborating run evidence. This
  deliberately departs from the `12-HOOK-IDEMPOTENCY-AUDIT.md` committed-artifact
  pattern — that pattern is rejected here precisely because a committed/written
  file re-enters jj's auto-snapshot path on every regeneration.

### Lint allowlist budget

- **D-09 [planner constraint — load-bearing]:** LINT-05 locks the
  `lint-vcs-no-raw-git.allow.json` budget at the already-spent +1
  (`sdk/src/vcs/git/parallel.ts`, landed Phase 10 — the file now has 24
  entries: 23 production + that one). The e2e harness (D-01) must therefore NOT
  require a *new* raw-git allowlist entry. The harness sets up throwaway repos
  and runs assertions; if written as a raw `.sh`/`.cjs` doing `git init` /
  raw `git` assertions, `scripts/lint-vcs-no-raw-git.cjs` (which scans
  `.sh`/`.bash` and all JS/TS, and whose `SHELL_GIT_PATTERNS` flags
  start-of-statement `git <cmd>`) would report it and force an allowlist entry
  that breaks LINT-05's locked framing. Mitigations the planner must choose
  among: route all VCS operations through `gsd-sdk query` (no raw `git`);
  reuse the already-allowlisted `sdk/src/vcs/__tests__/**` fixture helpers
  (`setupGitRepo`/`setupJjRepo`) for repo setup so raw-git stays in
  already-allowlisted files; or place the harness file under an existing
  allowlisted glob. Raw `jj` is NOT flagged by the no-raw-*git* lint, so
  jj-side assertions (`jj log -r 'divergent()'`) are fine — the constraint is
  specifically raw `git`.

### Claude's Discretion

- **Harness implementation language** — a `bash`/`sh` script (e.g.
  `scripts/e2e-parallel-phase.sh`) versus a Node `.cjs` script. Research leaned
  shell (CI-shell-shaped, `jq`-on-JSON assertions, mirrors `execute-phase.md`);
  `test.yml` steps already use `shell: bash`. Note the interaction with D-09: a
  `.cjs` harness can `require()` the already-allowlisted built fixture helpers
  for repo setup, whereas a pure `.sh` harness must do setup via `gsd-sdk query`
  only. Planner picks language together with the D-09 mitigation.
- Exact audit-script file naming details, the `--json` flag spelling, and the
  `.md`/JSON output formatting.
- D-04's blocking guarantee: non-matrix job (a) vs. `needs:`-gated all-green
  gate job (b).
- The synthetic harness's exact per-agent commit content (any minimal file
  write that yields one commit per workspace).
- `parallel-e2e.yml` trigger set (`push` / `pull_request` / `workflow_dispatch`)
  and whether to add a `paths:` filter scoping it to `sdk/src/vcs/**` +
  `get-shit-done/workflows/**` (as `install-smoke.yml` does).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 13 scope anchors

- `.planning/ROADMAP.md` §"Phase 13: CI parallel-path lane + lint close-gate" —
  goal, dependencies (Phase 11 + Phase 12), the 5 success criteria SC1-SC5.
- `.planning/REQUIREMENTS.md` §"Lint close-gate (LINT)" — LINT-04 (audit script),
  LINT-05 (allowlist diff). §"CI parallel-path lane (CI)" — CI-05 (the lane),
  CI-06 (lane runs the audit).
- `.planning/PROJECT.md` — v1.3 milestone framing; the "CI parallel-path lane"
  and "One-shot audit script" target-feature bullets; the "+0 or +1" allowlist
  framing.
- `.planning/STATE.md` §"Decisions" — lint allowlist framing locked at +0/+1;
  CI parallel-path lane ships BEFORE the default flip; dogfood is LAST.

### CI infrastructure

- `.github/workflows/test.yml` — existing CI matrix (`backend: [git,
  jj-colocated, jj-native]` × `node-version: [22, 24]`); `continue-on-error`
  posture (line 91); jj `v0.41.0` install step (lines 159-169); CI-03 header
  boundary comment (lines 3-17); `concurrency` group (lines 30-32); the
  `lint-tests` job (where `lint-vcs-no-raw-git.cjs` runs).
- `.github/workflows/install-smoke.yml` — single-concern workflow precedent:
  `paths:` filter, namespaced `concurrency` group, `gsd-sdk`-on-PATH harness
  pattern. The structural model for `parallel-e2e.yml`.

### Parallel-dispatch verb surface (what the lane exercises)

- `sdk/src/query/workspace-parallel-dispatch.ts` + `workspace-parallel-fan-in.ts`
  — the `gsd-sdk query workspace.parallel.{dispatch,fan-in}` CLI bridges the
  harness drives. This is the layer TEST-13 does NOT cover (verify exact
  filenames during research).
- `sdk/src/vcs/types.ts` — `ParallelDispatchOpts` (the `plan` item shape
  `{agentId, planId, workspacePath?}`), `ParallelDispatchHandle` (frozen pure
  JSON; `manifest` field), `FanInResult` (`{merged, conflicted,
  conflictedPaths, incompleteQueued, failedReaped, surplusBookmarks}`).
- `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` + `cmd-parallel-jj.test.ts` —
  TEST-13 contract tests: what is ALREADY covered (adapter-direct, N=2/3/4 +
  conflict + crash + idempotency) and the Pattern B `mkdtemp`
  `setupGitRepo`/`setupJjRepo` construction the harness mirrors.
- `get-shit-done/workflows/execute-phase.md` — the orchestrator shell sequence
  the harness mirrors 1:1 (the `workspace.parallel.dispatch`/`fan-in` calls and
  their `jq` pipelines; research cited approx. lines 527-562 and 763-784).

### Lint / audit

- `scripts/lint-vcs-no-raw-git.cjs` — the existing whole-repo no-raw-git
  scanner. Its `SCAN_EXT` (`.cjs|.js|.mjs|.ts|.yml|.yaml|.sh|.bash`)
  **excludes `.md`** — that gap is exactly what LINT-04's audit fills. Its
  `SHELL_GIT_PATTERNS` (`/(?:^|[ \t;&|(])git[ \t]+[a-zA-Z]/`) is the
  shell-`git <cmd>` detection the `.md`-fence audit parallels.
- `scripts/lint-vcs-no-raw-git.allow.json` — 24 entries (23 production + the
  Phase-10 `sdk/src/vcs/git/parallel.ts` entry). LINT-05 records this diff in
  the close commit; D-09 says it must NOT grow.
- `scripts/audit-id-namespace.cjs` — the v1.2 D-01 audit-script precedent:
  stdout-only, `.md` default / `--json` for JSON, `module.exports` of pure
  functions for testing. The shape `audit-workflow-raw-git.cjs` follows (D-06).
- `scripts/migr-06-close-gate.cjs` — v1.2 one-shot close-gate script; stdout-only.
  Its `tests/scripts/migr-06-close-gate.test.cjs` is the unit-test precedent
  (D-07).
- `package.json` — the `pretest` hook (`build:sdk` + `lint:skill-deps` +
  `lint-vcs-no-commit-id.cjs`). D-07 keeps the audit OUT of `pretest`.
- `.planning/phases/12-a3-colocated-pre-commit-fix-parallel-track/12-HOOK-IDEMPOTENCY-AUDIT.md`
  — Phase 12's committed close-gate audit artifact. Noted as the pattern D-06/
  D-08 deliberately do NOT follow (the user's no-jj-auto-track constraint), so
  the planner does not default to a committed artifact.

### A3 fix (exercised by the lane, ROADMAP SC5)

- `.planning/phases/12-a3-colocated-pre-commit-fix-parallel-track/12-CONTEXT.md`
  — Path 1 A3 fix (D-01/D-02): the jj adapter fires `.githooks/<stage>` from
  `commit()`; `GSD_HOOK_SKIP_COLOCATED=1` is the opt-out.
- `sdk/src/vcs/backends/jj.ts:249-289` (`commit()` fires the hook post-squash)
  and `sdk/src/vcs/hook-bridge.ts:20-43` (`fireHook` shells `.githooks/<stage>`).

### Test conventions

- `.planning/REQUIREMENTS.md` TEST-16 — Pattern B random-prefix `mkdtemp`;
  never `retry: N`; never `describe.skip`; no skip-count regressions.
- `.planning/research/PITFALLS.md` §"Pitfall 9" — test isolation / no shared
  fixture state (drives D-05).
- `scripts/check-skip-count.cjs` — the skip-count baseline guard the harness
  and lane must not regress.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `sdk/src/vcs/__tests__/vcs-fixture.ts` — `setupGitRepo`/`setupJjRepo` Pattern B
  helpers; the model (and a possible direct `require()` dependency for a `.cjs`
  harness) for throwaway-repo construction. Already allowlisted via the
  `sdk/src/vcs/__tests__/**` glob, so the raw-git setup inside it is lint-clean
  (relevant to the D-09 mitigation).
- `.github/workflows/install-smoke.yml` — `gsd-sdk`-on-PATH harness pattern +
  single-concern workflow shape to copy for `parallel-e2e.yml`.
- `.github/workflows/test.yml` jj-install step (lines 159-169) — the `v0.41.0`
  tarball-curl block `parallel-e2e.yml` duplicates.
- `scripts/audit-id-namespace.cjs` — stdout-only `.md`/`--json` audit-script
  skeleton for `audit-workflow-raw-git.cjs`.
- `scripts/lint-vcs-no-raw-git.cjs` `SHELL_GIT_PATTERNS` — the shell-`git <cmd>`
  regex the audit reuses to scan inside ` ```bash`/`sh`/`zsh` fences.

### Established Patterns

- **Pattern B `mkdtemp` fixture isolation** (TEST-16 / Pitfall 9) — every
  `cmd-parallel-*` test; the harness's synthetic repo follows it.
- **Single-source-of-truth audit output** (v1.2 D-01, `audit-id-namespace.cjs`)
  — `.md` human form + JSON machine form, both emitted to stdout, never a file.
- **Single-concern workflow files** — `install-smoke.yml`, `canary.yml`,
  `security-scan.yml` each own one concern; `parallel-e2e.yml` joins them.

### Integration Points

- `.github/workflows/parallel-e2e.yml` (NEW FILE) — the lane: a 2-backend
  matrix (git, jj-colocated), the jj-install step, the harness invocation, the
  CI-06 audit step, and the D-04 blocking-guarantee job.
- `scripts/audit-workflow-raw-git.cjs` (NEW FILE) — the stdout-only `.md`-fence
  raw-git scanner.
- The e2e harness (NEW FILE — `scripts/e2e-parallel-phase.{sh,cjs}`, name and
  language are planner's call per D-09 + Claude's Discretion) — drives
  `gsd-sdk query workspace.parallel.{dispatch,fan-in}`.
- `tests/scripts/audit-workflow-raw-git.test.cjs` (NEW FILE, per D-07) — unit
  test for the audit; mirrors `tests/scripts/migr-06-close-gate.test.cjs`.
- GitHub branch protection — a new required-check string registered for the
  D-04 blocking job. Config outside the repo; flag for the user at ship time.

</code_context>

<specifics>
## Specific Ideas

- **User constraint (Area 4):** *"whatever avoids being auto-tracked by jj"* —
  drove D-06. In this colocated-jj repo any file written into the working tree
  is auto-snapshotted into the working-copy commit on the next `jj` invocation.
  The audit must therefore be stdout-only. The principle generalizes: GSD
  tooling in this repo should not write transient or output files into the
  working tree.
- **Fidelity, not smoke test:** the shell harness must mirror `execute-phase.md`'s
  real shell sequence. The lane's value is catching CLI / JSON-envelope
  regressions the TS-level TEST-13 contract tests structurally cannot see —
  it is not a duplicate-coverage smoke test.

</specifics>

<deferred>
## Deferred Ideas

- **Promoting `audit-workflow-raw-git.cjs` to a permanent `npm pretest` lint** —
  out of scope (LINT-04: "NOT added to CI pretest"; D-07). If raw-git-in-markdown
  becomes a recurring regression post-v1.3, a future phase could promote it.
- **Workflow call-presence lint** (`vcs.parallel.*` must be called in dispatch
  sections) — already in STATE.md Deferred Items / REQUIREMENTS Out of Scope;
  deferred to v1.4.
- **Dogfood run + `parallelization` default flip** — Phase 14 (CONFIG-01/02,
  DOGFOOD-01/02), not Phase 13.

</deferred>

---

*Phase: 13-ci-parallel-path-lane-lint-close-gate*
*Context gathered: 2026-05-22*
