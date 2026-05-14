---
id: SEED-001
status: dormant
planted: 2026-05-14
planted_during: v1.1 / Phase 7 close-out
trigger_when: starting v1.2 OR any milestone themed "adapter cleanup" / "jj surface" / "id model" / "change-id migration"
scope: medium
---

# SEED-001: change-id-only on jj adapter surface; commit_id behind `vcs.jjOnly.*` escape hatch

## Why This Matters

Phase 7 surfaced the cross-namespace cost in production. The current `VcsAdapter` on jj exposes both `change_id` and `commit_id` depending on the verb — not by design, but because each verb's implementation chose whichever shape was convenient at the time. Plan 02 of Phase 7 hit this directly: `workspace.merge()` returns `mergedAs: <change_id>` but `bookmarks.list()` returns `rev: <commit_id>`, so the happy-path test had to relax from strict-equivalence to presence-only — there's no `===` comparison across the namespaces.

The architectural intent (per memory `project_planning_id_migration` and CONTEXT D-05 `mergeBase` user override) is that change_id is the canonical mutable-identity shape. `.planning/` files use change_id. Phase 6's B-07 rewriter exists specifically to convert SHAs → change_ids in planning files. Yet the live adapter surface contradicts that intent by leaking commit_id through several verbs. New milestone work should fix this once and for all so callers never have to reason about which namespace a verb returns.

The deeper benefit: with a clean change-id-only adapter surface, callers can safely compose verbs (`mergeBase` → `diff` → `bookmarks.list`) without backend-aware namespace bridging. The `vcs.jjOnly.commitIdOf(rev)` escape hatch handles the legitimate immutable-snapshot use cases (hex-prefix matching, ref-stability-across-rebase guarantees) with explicit `vcs.kind === 'jj'` narrowing per Phase 2.1 D-01 convention.

## When to Surface

**Trigger:** starting v1.2 OR any milestone themed "adapter cleanup" / "jj surface" / "id model" / "change-id migration"

Specifically surface this seed when the new-milestone questioning hits any of:
- "clean up the adapter surface" / "tighten the API"
- "jj surface inconsistencies" / "id namespace issues"
- "make change_id canonical" / "phase out commit_id from the cross-backend surface"
- v1.2 itself, since the user signalled this direction immediately after Phase 7 closed

## Scope Estimate

**Medium** — one phase, plausibly two.

### Surfaces to flip (cross-backend → change_id on jj)

| Verb / field | Current | Target | Reference |
|--------------|---------|--------|-----------|
| `vcs.refs.resolveShort()` | `commit_id.short()` template | `change_id.short()` template (jj-native short-id alphabet) | `sdk/src/vcs/backends/jj.ts:946` |
| `vcs.refs.bookmarks.list()` `entries[].rev` | `commit_id` template | `change_id` template | jj.ts (bookmark list parse) |
| `vcs.workspace.list()` `entries[].rev` | 40-char `commit_id` | 40-char `change_id` | `sdk/src/vcs/backends/jj.ts:1083` |
| `vcs.log()` `LogEntry.hash` | `commit_id` (40-char hex) per PITFALL 1 | `change_id` (call out the rename — `hash` field name carries hash-shape semantic) | `sdk/src/vcs/backends/jj.ts:327` (PITFALL 1 doc) |
| `vcs.refs.parent` / `vcs.refs.head` materialization | `jj log -r @- -T commit_id -n 1` | `jj log -r @- -T change_id -n 1` | `sdk/src/vcs/backends/jj.ts:225` |
| `vcs.refs.exists` / `countCommits` / `rootCommits` template scans | `commit_id` template | `change_id` template | `sdk/src/vcs/backends/jj.ts:965, 978` |

### Surfaces that stay change_id (already correct)

| Verb / field | Source |
|--------------|--------|
| `vcs.commit()` / `vcs.workspace.merge()` return `{ changeId }` | types.ts:220, jj.ts:1180-1226 |
| `vcs.workspace.reap()` `abandoned[].changeId` | types.ts:246 |
| `vcs.refs.mergeBase()` (Phase 7 D-05 user override) | jj.ts:887-900, types.ts:328 |
| `IncompleteWorkEntry.changeIdShort` | types.ts:226-231 (Phase 4 D-06: "change_id native from day 1") |

### New `vcs.jjOnly.*` escape hatch surface

| Verb | Purpose |
|------|---------|
| `vcs.jjOnly.commitIdOf(rev: RevisionExpr): string` | Resolve a rev to its 40-char commit_id (immutable snapshot identity). Use for hex-prefix matching, rebase-stable references. Mirrors the existing `vcs.jjOnly.commitIdOf` used by Phase 6's B-07 rewriter — promote that internal helper to a documented public verb if it isn't already. |
| `vcs.jjOnly.commitIdShort(rev: RevisionExpr): string` | Short-prefix variant for display/diagnostic use. Equivalent to current `resolveShort()` on jj, but explicit about the namespace. |

### Caller audit (this is the load-bearing risk)

Plan 02's pain proves callers DO depend on commit_id semantics in places. Audit needed before the flip:

- **Range-stability across rebases** — anywhere a caller stores a `LogEntry.hash` and later uses it as a stable reference: that semantic breaks on change_id (which moves with rebases). The callers either need to migrate to commit_id-explicit storage (`vcs.jjOnly.commitIdOf`) or accept the new semantic.
- **Hex-prefix matching** — anywhere a caller does `id.startsWith(prefix)` against a known hex prefix: change_id's reverse-base32 alphabet (k/n/o/p/q/r/s/t/u/v/w/x/y/z) won't match hex prefixes. Either prefixes get re-derived in change_id alphabet, or callers route through `vcs.jjOnly.commitIdOf` for the hex form.
- **External integrations** — anything that emits an id into a GitHub URL / API path / human-shown link probably wants commit_id. `scripts/changeset/github-release-notes.cjs` is the obvious example (just migrated in Phase 7 Plan 04 — needs an audit pass for which `rev` calls should be hex-form).
- **Status-table propagation** — places that emit ids into `.planning/STATE.md` / `REQUIREMENTS.md` propagation (per CR-01 sweep in Phase 5 Plan 07) already prefer change_id; confirm no regression.

The audit is best done as the first task of the cleanup phase — produce a per-call-site classification document (`change_id-safe` / `needs commit_id` / `needs both` / `unclear`) before any backend code changes.

### Phase shape sketch

If this becomes v1.2 (one milestone, one phase):
- **Task 1:** Caller audit + classification doc (`.planning/intel/id-namespace-audit.md`).
- **Task 2:** Add `vcs.jjOnly.commitIdOf` + `commitIdShort` to types + jj backend + (no-op on git backend; git uses commit hash natively).
- **Task 3:** Flip the 7 cross-backend surfaces above to change_id on jj. Rename `LogEntry.hash` to something namespace-neutral (`id` with documented dual-semantic, or split into `LogEntry.changeId` / `LogEntry.commitId` with one nullable per backend).
- **Task 4:** Migrate the audit-identified commit_id-needing callers to `vcs.jjOnly.commitIdOf`.
- **Task 5:** Update PITFALL 1 doc + relevant per-domain tests + lint guard pass.

If the audit reveals heavy commit_id dependence, this might expand to two phases (audit + migration as Phase 8.1 / 8.2). Keep that escape hatch documented in the v1.2 discuss-phase.

## Breadcrumbs

### Code references (file:line)
- `sdk/src/vcs/types.ts:206-231` — current `CommitResult` / `IncompleteWorkEntry` type shapes (change_id-native, the model to extend)
- `sdk/src/vcs/types.ts:246` — `abandoned[].changeId` shape (already correct)
- `sdk/src/vcs/types.ts:328-330` — Phase 7 D-05 mergeBase change_id (just landed, the precedent)
- `sdk/src/vcs/backends/jj.ts:222-227` — refs.parent materialization (commit_id template, FLIP)
- `sdk/src/vcs/backends/jj.ts:327-328` — PITFALL 1: "LogEntry.hash is commit_id NEVER change_id" — needs revision
- `sdk/src/vcs/backends/jj.ts:887-900` — mergeBase change_id implementation (just landed, the precedent)
- `sdk/src/vcs/backends/jj.ts:946` — resolveShort commit_id.short() (FLIP)
- `sdk/src/vcs/backends/jj.ts:965, 978` — exists / countCommits / rootCommits commit_id templates (FLIP)
- `sdk/src/vcs/backends/jj.ts:1083` — workspace.list workspace `rev` field shape (40-char commit_id, FLIP)
- `sdk/src/vcs/backends/jj.ts:1172-1226` — workspace.merge change_id return (already correct)

### Related decisions
- `.planning/phases/07-reconcile-fork-capabilities-with-upstream-add-missing-adapte/07-CONTEXT.md` D-05 — mergeBase change_id user override (precedent for the architectural direction)
- `.planning/phases/07-reconcile-fork-capabilities-with-upstream-add-missing-adapte/07-02-SUMMARY.md` Deviations §2 — the cross-namespace pain that surfaced this seed
- `.planning/intel/vcs-adapter-surface-audit.md` (v0 surface audit) — the original "open question" about `resolveShort` returning commit_id_prefix not change_id; never resolved
- `sdk/src/vcs/backends/jj.ts:327` PITFALL 1 comment — documents the current asymmetry but doesn't propose a fix

### Memory references
- `project_planning_id_migration` — the .planning SHA→change_id migration that B-07 / Phase 6 implemented; this seed extends that intent to the live adapter surface, not just persisted files

### Phase 6 prior art to reuse
- The B-07 rewriter at `sdk/src/vcs/format-migration/rewrite.ts` already has a working `commitIdOf` ↔ `changeIdOf` translation pair; the new `vcs.jjOnly.commitIdOf` public verb can lift that internal helper.

## Notes

- This seed is the architectural inverse of D-12 from Phase 7 (which DESCRIBED an ideal that the orchestrator doesn't yet honor — that one is about parallel dispatch). This seed is about an ideal the adapter doesn't yet honor on the read surface. Both are surfacing as "we built half the right system and need a coherent pass to finish it."
- This seed and the parallel-execution-rewrite-orchestrator deferred item (07-CONTEXT.md Deferred Ideas, last entry) are independent — different code paths, different blockers — but both are v1.2-candidate cleanup themes. Worth considering together at v1.2 discuss time to decide whether they share a phase or split.
- DON'T silently expand this if a v1.2 milestone with a different theme picks up first; the surface flip is a meaningful behavior change and deserves its own discuss-phase cycle.
