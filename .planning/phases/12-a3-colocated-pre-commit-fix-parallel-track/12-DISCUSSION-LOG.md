# Phase 12: A3 colocated pre-commit fix (parallel track) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-17
**Phase:** 12-a3-colocated-pre-commit-fix-parallel-track
**Areas discussed:** Hook lookup semantics, Fix-path commitment, Sidecar vs inline, Test + idempotency audit

---

## Premise re-framing (before fix-path table)

Before locking the fix path, user surfaced a meta-question — "why do we need
git hooks again?" Claude presented three premise framings:

| Framing | Description | Selected |
|---------|-------------|----------|
| (1) Real interop gap | Colocated mode sells "git + jj coexist"; if `git commit` would fire `.git/hooks/<stage>` but `jj squash` silently doesn't, that's a behavior asymmetry that bites users (husky / pre-commit-framework / existing git-repo migrations). Phase 12 = add `.git/hooks/<stage>` fire with idempotency caveat. | |
| (2) GSD owns its hook path | `.githooks/` is the GSD convention; `.git/hooks/` is git's namespace and not the jj adapter's concern. Phase 12 collapses to "Path 1 already shipped — lock it + add regression test + audit; document `.git/hooks/` as out-of-scope". | ✓ |
| (3) Minimal `.git/hooks/` fallback | Fire `.git/hooks/<stage>` only when `.githooks/<stage>` is absent — treat `.git/hooks/` as a fallback for users without GSD-managed hooks. | |

**User's choice:** "hm 2" — locks framing 2; husky/pre-commit-framework users
explicitly fall outside Phase 12 scope.

**Notes:** This re-frame trims Phase 12 to a doc + test + audit phase with no
new code in `sdk/src/`. ROADMAP SC2 and REQUIREMENTS HOOK-06 need wording
corrections to match.

---

## Fix-path commitment (post-reframe)

The original AskUserQuestion was withdrawn after framing 2 locked, since
framing 2 implies Path 1 is already shipped and Path B is rejected. Decision
recorded directly:

| Option | Description | Selected |
|--------|-------------|----------|
| Path 1 widened | Extend already-shipped "always-fire" to also cover `.git/hooks/<stage>`; SC4 audit required. | |
| Path B | Adapter explicitly shells `.git/hooks/<stage>` as separate, non-idempotency-reliant fire; no env opt-out for new arm; no SC4 audit. | |
| Hybrid | Land Path B mechanically but keep env opt-out semantics over combined surface; both arms; opt-out applies to both. | |
| **Path 1 (already shipped, no widening)** | D-10 retired + `GSD_HOOK_SKIP_COLOCATED=1` opt-out; fires `.githooks/<stage>` only; `.git/hooks/` deliberately not covered. | ✓ |

**User's choice:** Path 1 unchanged (locked via framing 2 selection).
**Notes:** Phase 12 work shifts from "implement a new fix path" to "lock the
existing fix in CONTEXT.md + amend the docs that reference `.git/hooks/` +
add HOOK-07 regression + SC4 audit".

---

## Test fixture location for HOOK-07

| Option | Description | Selected |
|--------|-------------|----------|
| Extend `jj-hooks.test.ts` | Add new tests inside existing `jj-colocated` describe block at `sdk/src/vcs/__tests__/jj-hooks.test.ts:167`. Matches existing structure; one less file. | ✓ |
| New `jj-colocated-hooks.test.ts` | Separate file as named in ROADMAP SC3. Cleaner phase artifact. Cost: split colocated coverage across two files. | |
| Move existing + new | Lift existing :167 describe block out to new file AND add new tests. Cleanest topology. Cost: extra cascade-amendment LOC; touches green tests. | |

**User's choice:** Extend `jj-hooks.test.ts` (Recommended).
**Notes:** Carries a doc-amendment side-effect — ROADMAP SC3 references
`jj-colocated-hooks.test.ts`; the doc-cascade plan rewrites SC3 to point at
the extended `jj-hooks.test.ts:167` block.

---

## Idempotency audit (SC4) scope and evidence format

| Option | Description | Selected |
|--------|-------------|----------|
| Manifest in CONTEXT.md | Enumerate every script in `.githooks/`, call out non-idempotent ops per script, record evidence inline in 12-CONTEXT.md. No new doc artifact. | |
| **Standalone audit doc** | New `.planning/phases/12-…/12-HOOK-IDEMPOTENCY-AUDIT.md` with per-hook analysis + line citations. Heavier; reusable as artifact. | ✓ |
| Inline in 12-LEARNINGS.md | Defer audit to phase-close; record in LEARNINGS rather than CONTEXT. Risks SC4 close-gate failing late. | |

**User's choice:** Standalone audit doc.
**Notes:** Standalone doc is the close-gate evidence anchor; v1.2's
`08-AUDIT.md` is the structural precedent. Audit happens during Phase 12
execution, not at phase-close.

---

## Sidecar vs inline (resolved by framing 2)

| Option | Description | Selected |
|--------|-------------|----------|
| Extend `jj.ts::commit` inline (Phase 5 plan 05-01 status quo) | No new file; current implementation at `sdk/src/vcs/backends/jj.ts:249-289` is canonical. | ✓ (moot) |
| New `sdk/src/vcs/jj/pre-commit-bridge.ts` sidecar | Match octopus.ts/reap.ts/parallel.ts discipline; refactor existing :249-289 body into sidecar. | |

**User's choice:** Not asked explicitly — framing 2 + Path 1 (no widening)
made this moot. No new code in `sdk/src/vcs/jj/`.

**Notes:** If a future widening of Path 1 happens (e.g., post-v1.3 work to
restore the `.git/hooks/` interop), the sidecar discipline option re-opens.

---

## Hook lookup semantics (resolved by framing 2)

| Option | Description | Selected |
|--------|-------------|----------|
| Also fire `.git/hooks/<stage>` in colocated mode | Cover husky-style installs and existing git-repo migrations. | |
| Fire `.git/hooks/<stage>` only (remove `.githooks/`) | Match git's canonical location; break GSD convention. | |
| **Bind to `.githooks/<stage>` only (current)** | GSD owns the hook path; `.git/hooks/` deliberately out-of-scope; users migrate. | ✓ |
| Respect `core.hooksPath` git config | Adapter reads git config and shells whatever path it points to. | |

**User's choice:** Bind to `.githooks/<stage>` only (implied by framing 2).
**Notes:** Recorded in CONTEXT.md D-02 as a v1.3 invariant. Husky migration
guidance lands as a documentation callout in REQUIREMENTS HOOK-06, not a
feature.

---

## Claude's Discretion

- **Plan count** — planner may merge the SC4 audit plan and the HOOK-07
  test plan into a single plan if the audit surfaces zero non-idempotent
  operations and the test fixture is small.
- **Husky migration guidance wording** — exact phrasing of the migration
  one-liner in REQUIREMENTS HOOK-06 is left to the doc-cascade plan
  author; Claude recommends a single sentence pointing at
  `.githooks/` + a symlink/copy/`--hooks-path` reconfiguration hint.

## Deferred Ideas

- **husky / pre-commit framework first-class support** — out of scope;
  belongs in a hypothetical post-v1.3 phase.
- **`gsd-sdk query hooks.audit` SDK verb** — SC4 audit automation;
  deferred to v1.4+ if priority ever arises.
- **Hook fire under non-commit jj operations** (`jj rebase`,
  `jj describe -m` post-checkpoint scenarios) — out of scope; squash is
  the only commit-equivalent event.
