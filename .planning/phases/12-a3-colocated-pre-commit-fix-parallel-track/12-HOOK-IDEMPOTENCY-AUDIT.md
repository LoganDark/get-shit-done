# Hook Idempotency Audit — Phase 12 (SC4 / D-05)

**Generated:** 2026-05-21
**Non-idempotent operations found:** 0

This audit is the SC4 close-gate evidence for Phase 12. The A3 fix (Path 1, D-01)
is an **always-fire variant**: the jj backend's `commit()` shells `.githooks/<stage>`
unconditionally after each squash (modulo the `GSD_HOOK_SKIP_COLOCATED=1` opt-out).
Path 1 rests on the assumption stated in the `commit()` body comment at
`sdk/src/vcs/backends/jj.ts:264-266` — "Idempotent hook bodies make this [the
`GSD_HOOK_SKIP_COLOCATED` opt-out] moot in practice." This audit verifies that
assumption against the actual installed `.githooks/<stage>` scripts. If the
assumption holds, the opt-out is a developer-convenience override only; if it does
not, the opt-out becomes a correctness mitigation. The result is recorded here so a
future contributor who adds a non-idempotent hook operation has a dated prior
baseline to reconcile against.

## Scope

The fire surface is `fireHook` (`sdk/src/vcs/hook-bridge.ts:19-42`), which shells
out to `.githooks/<stage>` synchronously and surfaces the exit code (it no-ops if
the stage script is absent). The set of `.githooks/<stage>` scripts the jj adapter
could fire is therefore exactly the set of executable scripts present under
`.githooks/`. At audit time that set is:

- `.githooks/pre-commit`
- `.githooks/pre-push`

No other `.githooks/<stage>` script is installed. Any future `.githooks/<stage>`
script the adapter could fire (e.g. `commit-msg`, `post-commit`) is in scope for a
re-audit against this baseline before it ships.

## Verdict legend

- `idempotent` — the operation produces the same observable repository state when
  the hook fires N times as when it fires once. Re-firing changes nothing observable.
- `non-idempotent` — repeated firing diverges observable state (each fire leaves a
  different repo/filesystem result than the previous one).
- `n/a` — no such `.githooks/<stage>` script is installed; nothing to classify.

## Findings

Per hook STAGE, one row per distinct operation in the script. Both scripts are
read-only checks — they inspect staged/pushed content and accept or reject, but
never mutate the working tree, index, or refs. Repeated firing yields the same
accept/reject decision, so every operation is `idempotent`.

| Hook stage | Script path | Operation | Idempotent? | Notes |
|------------|-------------|-----------|-------------|-------|
| pre-commit | `.githooks/pre-commit` | `git diff --cached --name-only \| grep -Eq …` staged-change guard | idempotent | `.githooks/pre-commit:4` — read-only inspection of the staged file set; gates whether the alias-drift check runs. Reads `git diff --cached`, mutates nothing. Same staged set → same guard result on every fire. |
| pre-commit | `.githooks/pre-commit` | gated `npm run check:alias-drift` invocation | idempotent | `.githooks/pre-commit:5` — runs only when the guard above matches. The alias-drift check verifies the generated command-alias files match their source and exits non-zero on drift; it is a verification, not a generator — it does not regenerate or write the working tree. Repeated runs against the same tree produce the same pass/fail. |
| pre-push   | `.githooks/pre-push`   | `GSD_BLOCKED_AUTHOR_REGEX` env guard (early `exit 0` when unset) | idempotent | `.githooks/pre-push:5-11` — reads an environment variable; if unset, the hook exits 0 immediately. Reading an env var has no repo-state effect; the early-exit decision is identical on every fire. |
| pre-push   | `.githooks/pre-push`   | `git rev-list` / `git show -s` commit-inspection reads | idempotent | `.githooks/pre-push:15-35` — enumerates pushed commits via `git rev-list` and reads each commit's author email via `git show -s --format='%ae'`. Both are pure history reads; no commit, ref, or working-tree mutation. The same range of commits yields the same author list on every fire. |
| pre-push   | `.githooks/pre-push`   | violation-collection + `exit 1` rejection path | idempotent | `.githooks/pre-push:38-48` — collects commits whose author email matched the blocked regex, prints them to stderr, and exits 1. The rejection is a decision plus diagnostic output; it writes nothing to the repo. The same matched set produces the same `exit 1` (or, when empty, the same implicit `exit 0`) on every fire. |

## Verdict

No non-idempotent operations found across `.githooks/pre-commit` and
`.githooks/pre-push`. Every operation in both scripts is a read-only inspection
(staged-diff read, env-var read, commit-history read) feeding an accept/reject
decision; none mutate the index, working tree, refs, or any other observable
repository state. Re-firing either hook leaves identical observable state.

Baseline recorded for v1.3+ regression — a future contributor adding a
non-idempotent hook operation must reconcile against this baseline. The
`sdk/src/vcs/backends/jj.ts:264-266` assumption that "idempotent hook bodies make
[the `GSD_HOOK_SKIP_COLOCATED` opt-out] moot in practice" holds for the currently
installed hook scripts: with zero non-idempotent operations, an accidental double
fire under colocated mode would produce no observable divergence, so the opt-out is
a developer-convenience override rather than a correctness control.

Should a future change introduce a non-idempotent operation to any `.githooks/<stage>`
script, the `GSD_HOOK_SKIP_COLOCATED` opt-out is the mitigation available to
affected users, and this audit must be re-run and this verdict revised.

## Re-runnable verification

A future maintainer can re-validate this audit with the following copy-pasteable
commands (run from the repository root). These are read-only inspections only — no
raw `git` mutation is performed.

```bash
# 1. Enumerate the .githooks/<stage> scripts the jj adapter could fire.
#    Re-audit any script that appears here and is not yet in the findings table.
ls -la .githooks/

# 2. Re-read each hook script and re-classify every operation it contains.
cat .githooks/pre-commit
cat .githooks/pre-push

# 3. Re-fire idempotency probe (manual): in a throwaway scratch repository,
#    run each hook script twice in succession and confirm the second run leaves
#    observable repo state (index, working tree, refs) byte-identical to the
#    first. Because every operation classified above is a read-only inspection,
#    the expected result is: no observable difference between one fire and N
#    fires. Any divergence is a regression against this baseline.
```
