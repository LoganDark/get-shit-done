# Phase 03 Plan 05 — `opts.staged` Audit (jj reachability)

**Audit date:** 2026-05-11
**Scope:** every call site invoking `vcs.diff({staged: true, ...})` to confirm
it cannot reach the jj backend (where `opts.staged` is a documented no-op per
RESEARCH §`diff()`).

## Audit query

```bash
grep -rn "\.diff(.*staged" sdk/src bin/lib get-shit-done/bin/lib tests 2>/dev/null \
  | grep -v "\.test\." | grep -v "__tests__"
```

## Findings

| # | File | Line | Code | Adapter kind | jj-reachable? |
|---|------|------|------|--------------|---------------|
| 1 | `sdk/src/query/commit.ts` | 216 | `vcs.diff({ staged: true, nameOnly: true })` | `createVcsAdapter(projectDir, { kind: 'git' })` (line 215, explicit pin) | NO |
| 2 | `get-shit-done/bin/lib/commands.cjs` | 1085 | `checkVcs.diff({ staged: true, nameOnly: true }).nameOnly` | `createVcsAdapter(cwd, { kind: 'git' })` (line 1084, explicit pin) | NO |

## Excluded matches (not production callers)

| File | Line | Reason |
|------|------|--------|
| `sdk/src/query/commit.ts` | 135 | JSDoc comment referencing prior shape, not a call site |
| `get-shit-done/bin/lib/commands.cjs` | 349 | JSDoc comment referencing prior shape |
| `get-shit-done/bin/lib/commands.cjs` | 1078 | Comment referencing plan 02-09 |
| `tests/__tools__/capture-vcs-baselines.cjs` | 264, 289 | Baseline capture comments (git-only fixture pipeline) |

## Conclusion

**No jj-reachable caller invokes `vcs.diff({staged: true, ...})` in Phase 3.**

Both production callers (`sdk/src/query/commit.ts:216` and
`get-shit-done/bin/lib/commands.cjs:1085`) construct the adapter with an
explicit `{ kind: 'git' }` pin, statically routing through the git backend.
The jj backend's documented no-op behavior for `opts.staged` is therefore
unobservable from Phase 3 callers — the JSDoc on `diff()` in
`sdk/src/vcs/backends/jj.ts` is sufficient documentation.

**Future-phase considerations:**

- If Phase 4 or Phase 5 introduces a `vcs.diff({staged: true, ...})` caller
  that does NOT pin `kind: 'git'`, the caller must either:
  1. Narrow on `vcs.kind === 'git'` before passing `staged: true`, or
  2. Accept the documented no-op semantics on jj (i.e., the same WC diff is
     returned regardless of the flag).
- The Phase 5 graduation step (deletion of `BACKENDS_AVAILABLE_FOR_VERB`)
  does NOT affect this audit — the per-verb gate only filters which contract
  tests run, not which production callers can dispatch to which backend.

## ESCALATION TRIGGER

If a future audit surfaces a `vcs.diff({staged: true, ...})` call where the
adapter is constructed via `createVcsAdapter(cwd)` (auto-detect) or
`{ kind: 'auto' }` — ESCALATE. Such a caller is jj-reachable and the
documented no-op behavior may surprise it. Two remediations:

1. Pin `kind: 'git'` at the call site (matching the current pattern), OR
2. Replace `vcs.diff({staged: true})` with `vcs.status()` (the staging
   concept is git-only; status carries the cross-backend semantic).
