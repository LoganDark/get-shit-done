# Phase 12: A3 colocated pre-commit fix (parallel track) - Context

**Gathered:** 2026-05-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the v1.0 Phase 4 A3 gap by **formalizing the already-shipped Path 1 fix**
(retired D-10 no-op + `GSD_HOOK_SKIP_COLOCATED=1` opt-out, landed by Phase 5
plan 05-01 at `sdk/src/vcs/backends/jj.ts:249-289`) and binding the jj
adapter's pre-commit fire surface to `.githooks/<stage>` only. Phase 12
delivers:

1. CONTEXT-level lock (this file) recording Path 1 as the chosen path per
   ROADMAP SC1.
2. Doc cascade-amendment correcting ROADMAP SC2 + REQUIREMENTS HOOK-06
   wording from `.git/hooks/pre-commit` to `.githooks/pre-commit`.
3. HOOK-07 regression test on a colocated jj fixture, extending the existing
   `jj-colocated` describe block in `sdk/src/vcs/__tests__/jj-hooks.test.ts`.
4. SC4 hook-idempotency audit as a standalone artifact at
   `.planning/phases/12-…/12-HOOK-IDEMPOTENCY-AUDIT.md`.

**Out of scope (explicit):** Firing `.git/hooks/<stage>` under jj operations.
`.git/hooks/` is git's namespace and is not covered by the jj adapter. Users
with husky-style installs at `.git/hooks/` must migrate to `.githooks/` to
get hook execution under jj-driven commits in colocated mode. This is a
deliberate v1.3 invariant, not a bug.

Joins at Phase 13 CI integration where the `parallel-e2e` lane validates the
regression on a colocated fixture.

</domain>

<decisions>
## Implementation Decisions

### Fix-path commitment (SC1)

- **D-01:** Lock **Path 1** as the chosen fix path. Path 1 retires the D-10
  colocated no-op and unconditionally fires `.githooks/<stage>` from the jj
  backend's `commit()`, with `GSD_HOOK_SKIP_COLOCATED=1` as the escape
  hatch. Path 1's implementation was landed by Phase 5 plan 05-01 — Phase 12
  formalizes the choice in CONTEXT.md, amends downstream docs to match, and
  adds the regression + audit artifacts. **Path A** (mechanical "remove
  D-10 no-op" without the env opt-out) and **Path B** ("explicit shell of
  `.git/hooks/<stage>` in colocated mode") are not chosen. **Path C**
  (version-probe) is rejected per ROADMAP. Rationale: Path 1 is already
  shipped and tested for `.githooks/`; the env opt-out preserves a clean
  forward-compat seam if a future jj release adds auto-fire; cheapest
  correctness landing.

### Hook fire surface (D-02)

- **D-02:** The jj adapter's pre-commit fire surface is bound to
  `.githooks/<stage>` (the path `fireHook` shells in `sdk/src/vcs/hook-bridge.ts`).
  `.git/hooks/<stage>` is **explicitly out of scope** for jj adapter firing
  in colocated mode. Rationale: `.githooks/` is the GSD-managed hook
  convention; firing both surfaces would double the dup-fire risk if a
  future jj release adds auto-fire to `.git/hooks/`. Users running
  husky / `pre-commit` framework / other tooling that writes to
  `.git/hooks/` must migrate to `.githooks/` (or symlink, or invoke their
  framework's installer with a custom `--hooks-path`). This is a v1.3
  invariant documented in REQUIREMENTS HOOK-06.

### Doc cascade-amendment (D-03)

- **D-03:** Phase 12 amends three docs to match D-01/D-02:
  - `.planning/ROADMAP.md` Phase 12 SC2 — rewrite "installing a sentinel
    `.git/hooks/pre-commit`" → "installing a sentinel `.githooks/pre-commit`".
  - `.planning/REQUIREMENTS.md` HOOK-06 — rewrite "fires
    `.git/hooks/pre-commit`" → "fires `.githooks/pre-commit`"; add explicit
    out-of-scope note for `.git/hooks/`.
  - `.planning/REQUIREMENTS.md` HOOK-07 — same rewrite; affirm sentinel
    location is `.githooks/pre-commit`.
  - **Cascade-amendment hygiene** matches Phase 10 plan 10-01 precedent
    (ROADMAP+REQUIREMENTS edits committed in a single docs-only plan before
    code work begins, so subsequent plan task descriptions reference
    corrected wording).

### Regression test placement (D-04)

- **D-04:** HOOK-07 regression test extends the existing `'jj-colocated:
  pre-commit always fires from adapter (D-32 — D-10 retired)'` describe
  block at `sdk/src/vcs/__tests__/jj-hooks.test.ts:167`. **No new test
  file.** Rationale: precedent already lives there (current tests at :199
  and :220 cover the GSD-managed `.githooks/` fire and the
  `GSD_HOOK_SKIP_COLOCATED` opt-out); adding the SC2-verbatim sentinel
  assertion alongside keeps colocated coverage discoverable in one place.
  ROADMAP SC3 mentions `jj-colocated-hooks.test.ts` as the alternative
  filename — that wording is the second doc-amendment target in D-03's
  scope (rewrite SC3 to point at the extended `jj-hooks.test.ts:167`
  block).

### Idempotency audit (SC4) artifact (D-05)

- **D-05:** SC4 audit lives in a standalone artifact at
  `.planning/phases/12-a3-colocated-pre-commit-fix-parallel-track/12-HOOK-IDEMPOTENCY-AUDIT.md`,
  not inline in 12-CONTEXT.md or 12-LEARNINGS.md. Rationale: standalone doc
  is reusable as a v1.3+ regression artifact and as the close-gate
  evidence anchor; auditing happens during Phase 12 execution (not at
  phase-close), so close-gate verification has a stable target. Per-hook
  analysis with line citations: `.githooks/pre-commit`,
  `.githooks/pre-push`, plus any additional `.githooks/<stage>` scripts
  the adapter could fire in future stages. Flag non-idempotent operations
  per script; if none found, record the empty-finding explicitly so a
  future contributor adding non-idempotent ops sees the prior baseline.

### Claude's Discretion

- **Plan count** — three plans expected (doc-cascade, regression test,
  audit), but planner may merge audit + test into one plan if the audit
  surfaces zero non-idempotent operations and the test fixture is small.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 12 scope anchors

- `.planning/ROADMAP.md` Phase 12 entry — goal, dependencies, success
  criteria (SC1-SC5); note: SC2 wording will be amended per D-03.
- `.planning/REQUIREMENTS.md` HOOK-06 + HOOK-07 — current requirement text;
  note: both will be amended per D-03.

### Phase 4 A3 history (the gap being closed)

- `.planning/phases/04-workspaces-octopus-structure-hooks/04-LEARNINGS.md`
  Open Q1 — the three documented fix paths (recovered from commit
  `51ee72a3` if archived). Path C rejected by ROADMAP; A and B not
  chosen; Path 1 locked here.
- Project memory: `project_a3_colocated_pre_commit_gap` — captures the
  empirical A3 refutation context and the 3-path enumeration.

### Current implementation (Path 1 already shipped)

- `sdk/src/vcs/backends/jj.ts:249-289` — unconditional `fireHook` call in
  `commit()` body after squash; `GSD_HOOK_SKIP_COLOCATED=1` opt-out
  branch at :274; D-32 / A3 fix comment block at :249-272. Phase 12 does
  NOT modify this body — it locks the design decision and amends the
  surrounding doc surface.
- `sdk/src/vcs/hook-bridge.ts:20-43` — `fireHook` implementation; shells
  `.githooks/<stage>` if present, no-ops if absent; 60s timeout; Windows
  shebang accommodation.

### Existing test surface

- `sdk/src/vcs/__tests__/jj-hooks.test.ts:167-…` — existing `'jj-colocated:
  pre-commit always fires from adapter (D-32 — D-10 retired)'` describe
  block. HOOK-07 regression test extends this block per D-04.

### Cross-backend hook interface (referenced by planner)

- `sdk/src/vcs/types.ts` — `HookStage` / `HookContext` types.
- `sdk/src/vcs/__tests__/adapter-contract.test.ts` — backend-agnostic hook
  contract assertions (Phase 4 plan 04-06 origin).

### v1.0 Phase 4 origin docs (deep history)

- `.planning/phases/04-workspaces-octopus-structure-hooks/04-CONTEXT.md`
  D-10 (retired in Phase 5 plan 05-01) and D-32 (A3 fix landing).
- `.planning/phases/04-workspaces-octopus-structure-hooks/04-RESEARCH.md`
  A3 assumption (refuted).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `fireHook(cwd, stage, ctx)` at `sdk/src/vcs/hook-bridge.ts:20` — the only
  call path the adapter uses to invoke `.githooks/<stage>`. Phase 12 does
  NOT modify this surface (D-02 binds the fire to it; no new sidecar
  needed).
- Existing `jj-colocated` describe block at `jj-hooks.test.ts:167` — model
  for the new HOOK-07 sentinel test (`vcs.commit` → assert marker file
  exists exactly once → assert opt-out skips).
- `vcs.commit` invocation pattern in current colocated tests at
  `jj-hooks.test.ts:199-243` — direct precedent for the regression test
  body shape.

### Established Patterns

- **Sidecar discipline (UPSTREAM-02)** — does NOT apply here. Per D-01/D-05,
  no new code lives in `sdk/src/vcs/jj/`. The audit doc + test extension +
  ROADMAP/REQUIREMENTS edits are the entire Phase 12 surface.
- **Doc cascade-amendment in own plan (Phase 10 plan 10-01 precedent)** —
  ROADMAP + REQUIREMENTS rewrites land in a single docs-only plan before
  any code/test plan starts, so corrected wording is what subsequent plan
  task descriptions reference.
- **Standalone audit doc per phase** — pattern matches v1.2's
  `08-AUDIT.md` (commit_id site classification); the `.md` artifact is
  the close-gate evidence anchor, not a chat-log of the audit process.
- **Test fixture randomized prefix** — matches `mkdtempSync` pattern
  already used at `jj-hooks.test.ts:174-180` (`gsd-jj-hooks-colocated-…`).

### Integration Points

- No SDK CLI bridge change. No new query verb. No new adapter interface
  method. No allowlist entry. Phase 12 is doc + test + audit only — the
  smallest plausible scope for closing the v1.0 gap.

</code_context>

<specifics>
## Specific Ideas

- **The current code is canonical** — `sdk/src/vcs/backends/jj.ts:249-289`
  is the locked reference body. Any future regression that re-introduces
  D-10 or removes the env opt-out branch must reopen this CONTEXT.md
  decision, not just edit the file.
- **`.git/hooks/` migration guidance** — REQUIREMENTS HOOK-06 should
  include a one-liner pointing husky/pre-commit-framework users at the
  `.githooks/` migration path (symlink, framework reconfiguration, or
  manual copy). Out-of-scope as a feature; in-scope as a documentation
  callout in REQUIREMENTS.
- **No-raw-git guard relevance** — confirm Phase 12 test additions do not
  introduce any raw `git ` invocations beyond what the existing colocated
  fixture already uses (`execSync('jj git init --colocate …')` is jj;
  fixture-setup `execSync('git config …')` lines are pre-existing and
  allowlisted via fixture-helper paths if present).

</specifics>

<deferred>
## Deferred Ideas

- **husky / pre-commit framework first-class support** — not closing in
  Phase 12. If demand surfaces post-v1.3, a future phase could either ship
  a `.git/hooks/` shim or a `gsd hooks install --from .git/hooks/` migration
  command. Out of scope for v1.3 milestone (D-02 invariant).
- **`gsd-sdk query hooks.audit` SDK verb** — automating SC4 idempotency
  detection at audit time was raised mentally during the SC4 discussion;
  deferred. The standalone `12-HOOK-IDEMPOTENCY-AUDIT.md` is a one-shot
  manual artifact for v1.3 close-gate; automation belongs in v1.4+ if it
  ever earns priority.
- **Hook fire under non-commit jj operations** — e.g., `jj rebase` /
  `jj describe -m` post-checkpoint scenarios. Out of scope; jj's commit
  model (squash-driven) means the post-squash fire point is the only
  semantically-equivalent-to-`git commit` event.

</deferred>

---

*Phase: 12-a3-colocated-pre-commit-fix-parallel-track*
*Context gathered: 2026-05-17*
