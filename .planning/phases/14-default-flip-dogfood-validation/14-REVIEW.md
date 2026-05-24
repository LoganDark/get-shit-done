---
phase: 14-default-flip-dogfood-validation
reviewed: 2026-05-23T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - get-shit-done/templates/config.json
  - scripts/dogfood-phase-14.sh
  - scripts/dogfood-rehearse.sh
  - scripts/dogfood-restore.sh
  - sdk/src/query/workspace-parallel-dispatch.ts
  - sdk/src/vcs/__tests__/cmd-parallel-git.test.ts
  - sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts
findings:
  critical: 1
  warning: 5
  info: 5
  total: 11
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-05-23T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

The TypeScript surface (`workspace-parallel-dispatch.ts`) is solid: the
strict-equal-`false` check at line 75 is exactly right given `loadConfig`'s
defaults-merge behavior (`CONFIG_DEFAULTS.parallelization === true`; a parsed
`false` overrides; no normalization that would let a `'false'` string sneak in).
The error message at lines 80-84 contains the literal `parallelization: true`
substring asserted by both test files at line 760 / 505.

The new CONFIG-02 contract tests (`cmd-parallel-{jj,git}.test.ts` lines 731+ /
476+) are structurally clean — three `it` blocks each, no `retry:`, no
`describe.skip`/`it.skip`, joint assertions kept in single blocks per W3 (a).
The "does NOT fire" cases correctly use try/catch envelope-narrowing
(`envelopeReason !== 'parallelization_disabled'`) rather than asserting
exception absence, which would over-constrain the post-envelope adapter path.

The shell scripts implement the right ordering primitives (op-restore then
tar-extract; pre-snapshot before bookmark create; main-bookmark untouched
guard pre/post). However, **one Critical defect** in `dogfood-phase-14.sh`
makes the error-envelope guards effectively no-ops on every dispatch and fan-in
invocation — the very envelope this phase ships (`parallelization_disabled`)
would slip through undetected and cascade into a broken-state run. Several
Warnings cover missing input validation, a missing project-root precondition in
`dogfood-restore.sh`, and a tarball overlay/cleanup gap in the restore
semantics.

## Critical Issues

### CR-01: `jq -r '.ok // "true"'` guard never fires on error envelopes (broken dispatch/fan-in error path)

**File:** `scripts/dogfood-phase-14.sh:205`, `:259`, `:351`, `:403`

**Issue:** The dispatch/fan-in error guards parse the result envelope as

```bash
HANDLE_OK_JJ=$(printf '%s' "$HANDLE_JSON_JJ" | jq -r '.ok // "true"')
[ "$HANDLE_OK_JJ" = "false" ] && {
    echo "FATAL: jj cell dispatch failed: $HANDLE_JSON_JJ" >&2
    exit 1
}
```

jq's `//` operator is "alternative", not "default-when-missing": it returns
the RHS when the LHS evaluates to `null` **or `false`**. So when the SDK
returns `{ok: false, reason: "parallelization_disabled", message: "…"}` —
exactly the envelope this phase introduces — `.ok // "true"` evaluates to
the literal string `"true"`, the bash test `[ "true" = "false" ]` fails,
and the script proceeds past the guard, silently treating the error
envelope as a successful Handle JSON.

Empirically confirmed:

```
$ printf '%s' '{"ok":false}' | jq -r '.ok // "true"'
true
```

Downstream consequences when this fires (e.g., if a future operator runs
the dogfood with the repo's `parallelization` flipped back to `false`, or
when any CLI-bridge validation envelope is returned):

- `WORKSPACE_COUNT_JJ=$(jq -r '.workspaces | length')` returns `0`
  (`null | length` is `0` in jq) — the per-workspace loop is empty.
- `RESULTS_ACCUM_JJ` becomes `[]`, fan-in receives an empty results array.
- `CONFLICT_COUNT_*` and `MERGED_LEN_*` resolve to `0` via the same
  `null`-coercion path, so the final summary block reports success with
  `dispatch_ms=…  fan_in_ms=…  conflict_count=0` while no work actually
  ran.
- The script exits 0 and writes a metrics file claiming green.

This is load-bearing for the very envelope this phase ships
(`parallelization_disabled` at `workspace-parallel-dispatch.ts:75-86`).
Any future regression that re-enables CONFIG-02 in dogfood territory would
go undetected by the orchestrator.

**Fix:** Replace the four guards with a presence-aware check that
distinguishes `.ok` being literally `false` from `.ok` being absent. Two
viable forms:

```bash
# Form A: explicit presence check
HANDLE_OK_JJ=$(printf '%s' "$HANDLE_JSON_JJ" | jq -r 'if has("ok") then .ok else "true" end')
[ "$HANDLE_OK_JJ" = "false" ] && {
    echo "FATAL: jj cell dispatch failed: $HANDLE_JSON_JJ" >&2
    exit 1
}

# Form B: invert the polarity — assert the envelope is NOT an error
HANDLE_ERR=$(printf '%s' "$HANDLE_JSON_JJ" | jq -r 'select(.ok == false) | .reason // "unknown"')
if [ -n "$HANDLE_ERR" ]; then
    echo "FATAL: jj cell dispatch failed (reason=${HANDLE_ERR}): $HANDLE_JSON_JJ" >&2
    exit 1
fi
```

Apply the same fix to lines 259 (jj fan-in), 351 (git dispatch), and 403
(git fan-in).

## Warnings

### WR-01: `dogfood-restore.sh` claims project-root precondition but never enforces it (path-traversal exposure to tar extract)

**File:** `scripts/dogfood-restore.sh:25-26`, `:59`

**Issue:** The header docstring states "Pre-condition: must be run from
the project root" but the script does NOT validate this — unlike its two
companions (`dogfood-phase-14.sh:41` and `dogfood-rehearse.sh:39` both
check `[ -f "$PWD/.planning/config.json" ]` and fail fast). The `tar -xf
"$TARBALL_PATH" -C .` at line 59 extracts to the current working
directory unconditionally. If the script is invoked from any other dir
(e.g., the operator's HOME, a sibling dir, `/tmp`), `.planning/` gets
splattered into the wrong place. Additionally, the tarball contents are
not validated — a tarball with absolute paths or `../` entries could
write outside the cwd on macOS BSD tar (behavior varies by version).

The trust model is internal (operator-provided tarball from a known
mktemp dir) so the security impact is low, but the precondition gap
means a typo in invocation silently corrupts an unrelated directory.

**Fix:** Add the project-root precondition before the restore steps, and
narrow the tar invocation:

```bash
if [ ! -f "$PWD/.planning/config.json" ]; then
    echo "FATAL: must be run from the project root (no .planning/config.json at $PWD)" >&2
    exit 1
fi

# Validate the tarball's top-level entries are all inside .planning/
if ! tar -tf "$TARBALL_PATH" | awk '!/^\.planning\//{exit 1}'; then
    echo "FATAL: tarball contains entries outside .planning/: ${TARBALL_PATH}" >&2
    exit 1
fi
```

### WR-02: `dogfood-restore.sh` tar overlay leaves post-snapshot files in `.planning/` undeleted (incomplete restore)

**File:** `scripts/dogfood-restore.sh:56-59`

**Issue:** The restore sequence is `jj op restore "$PRE_OP_ID"` then
`tar -xf "$TARBALL_PATH" -C .`. `tar -xf` is purely additive — it
overwrites files that exist in both the tarball and the cwd, but it does
NOT delete files that exist in the cwd but were not in the tarball at
snapshot time.

In practice, `jj op restore` reverts the WC to the pre-op-id state which
should already drop new files (jj's auto-snapshot tracks WC content). So
the metrics file written at `.planning/intel/v1.3-dogfood-metrics.md`
during the dogfood run would be removed by `jj op restore`. **But the
script's documented contract is "the tarball extract runs LAST so the
tarball's content is the authoritative final state"** (lines 14-17) —
which only holds when "final state" is defined as the union of pre-snapshot
content. New planning files created post-snapshot but inside `.planning/`
would survive the restore if jj's auto-snapshot misses them (e.g., files
matching a `.gitignore`/`.jjignore` pattern, or files added via tools that
bypass jj tracking).

The rehearsal at `dogfood-rehearse.sh` validates the happy path (synthetic
dirty → restore → invariant matches baseline) but does NOT test the
post-snapshot-new-file case. The asymmetry between op-restore (deletes via
WC revert) and tar-extract (additive overlay) is a latent inconsistency.

**Fix:** Either (a) clear `.planning/` before extracting:

```bash
rm -rf .planning/
tar -xf "$TARBALL_PATH" -C .
```

or (b) document the asymmetry explicitly and add a rehearsal case that
exercises a post-snapshot new file to verify jj's auto-snapshot covers
it. Option (a) is the safer behavior; option (b) is cheaper if the
empirical evidence already covers the cases that matter.

### WR-03: `workspace-parallel-dispatch.ts` does not validate the parsed plan is an array

**File:** `sdk/src/query/workspace-parallel-dispatch.ts:88-100`

**Issue:** After `JSON.parse(planText)`, `plan` is typed as
`readonly { agentId: string; planId: string; workspacePath?: string }[]`
but the value is whatever the JSON parses to. A caller passing
`{"foo":"bar"}` (object), `"plan-1"` (string), `42` (number), or `null`
all pass `JSON.parse` without throwing and bypass the try/catch's
`plan_json_parse_failed` envelope.

The non-array values are then handed to
`vcs.workspace.parallel.dispatch({plan, ...})` where downstream
`plan.length`, `plan.map(...)`, or similar would either throw an
unstructured error (`TypeError: plan is not iterable`) or — worse —
silently return a degenerate Handle (e.g., `[].map(...)` returns `[]`).

The contract tests assume well-formed input (line 745: `JSON.stringify([…])`),
so this gap is invisible to the test surface.

**Fix:** Add an array-shape check after `JSON.parse`:

```typescript
let plan: readonly { agentId: string; planId: string; workspacePath?: string }[];
try {
    const planText = resolvePlanInput(planRaw);
    const parsed = JSON.parse(planText);
    if (!Array.isArray(parsed)) {
        return {
            data: {
                ok: false,
                reason: 'plan_must_be_array',
                error: `Expected JSON array, got ${parsed === null ? 'null' : typeof parsed}`,
            },
        };
    }
    plan = parsed;
} catch (err) {
    return {
        data: {
            ok: false,
            reason: 'plan_json_parse_failed',
            error: err instanceof Error ? err.message : String(err),
        },
    };
}
```

### WR-04: `--max-concurrency` accepts NaN silently

**File:** `sdk/src/query/workspace-parallel-dispatch.ts:59-61`

**Issue:** `maxConcurrency = Number(args[++i])` produces NaN for any
non-numeric input (`--max-concurrency abc`, `--max-concurrency ''`).
Unlike `phaseNumber` which has a NaN check at line 64, `maxConcurrency`
is passed through unchecked to
`vcs.workspace.parallel.dispatch({maxConcurrency: NaN, ...})`. Downstream
arithmetic with NaN produces NaN; comparisons against NaN are always
false; control-flow that depends on `maxConcurrency` becomes
non-deterministic relative to the operator's intent.

Per the file header line 17, "workflow sites pass undefined" — so the
production path is unaffected — but a typo in a future operator
invocation would silently miscompare.

**Fix:** Mirror the `phaseNumber` validation:

```typescript
} else if (args[i] === '--max-concurrency' && args[i + 1]) {
    const v = Number(args[++i]);
    if (Number.isNaN(v)) {
        return { data: { ok: false, reason: 'max_concurrency_invalid', value: args[i] } };
    }
    maxConcurrency = v;
}
```

### WR-05: CONFIG-02 test tmpDirs leak (no afterAll/finally cleanup)

**File:** `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts:731-825`, `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts:476-570`

**Issue:** Every other `describe.sequential` block in both test files
sets up a `beforeAll`/`afterAll` pair where `afterAll` does
`rmSync(dir, { recursive: true, force: true })` (e.g.,
`cmd-parallel-git.test.ts:130-132`). The CONFIG-02 `describe` blocks are
plain `describe(...)` (no `.sequential`, no `beforeAll`/`afterAll`), and
each `it` creates a NEW tmpDir via `await mkdtemp(...)` — but never
cleans it up. With 3 it-blocks per file × 2 files = 6 leaked tmpDirs per
test run, each under `/tmp/gsd-cfg02-{jj,git}-XXXXXXXX-`.

Combined with the random-prefix Pattern B suffix, the leaks don't
collide, but they DO accumulate across test runs. Not a correctness
issue, but a quality drift compared to the rest of the file.

**Fix:** Either lift the tmpDir into a shared `beforeAll`/`afterAll`
pair (one tmpDir per test, reused across the three cases by writing the
`config.json` in each `it`) or add a `try/finally` per test:

```typescript
it('returns {ok:false…} when …', async () => {
    const tmpDir = await mkdtemp(/* … */);
    try {
        // existing test body
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
});
```

The first form is structurally consistent with the rest of the file.

## Info

### IN-01: `--phase 0` accepted as valid phase number

**File:** `sdk/src/query/workspace-parallel-dispatch.ts:64-66`

**Issue:** The validation `if (phaseNumber === undefined || Number.isNaN(phaseNumber))` 
treats `Number("0") === 0` as valid. Phase 0 is not a real phase in this
codebase (phases start at 01). Equally, negative numbers (`Number("-1")
=== -1`) pass. Not a security or correctness defect — the downstream
adapter likely fails on invalid phase numbers — but the envelope
short-circuit would be a better error surface.

**Fix:** `if (phaseNumber === undefined || !Number.isFinite(phaseNumber) || phaseNumber < 1)`.

### IN-02: Args parser silently ignores empty-string values and unknown flags

**File:** `sdk/src/query/workspace-parallel-dispatch.ts:50-62`

**Issue:** `args[i] === '--cwd' && args[i + 1]` — if `args[i+1]` is the
empty string (e.g., `--cwd ''`), JS coerces `""` to falsy and the flag is
silently ignored. Same for `--phase ''`, etc. The loop also has no
`default:` branch, so unknown flags (`--cwt`, `--phse`) are silently
skipped. A typo would never error.

**Fix:** Switch to argv length checks (`i + 1 < args.length`) and add an
unknown-flag default that returns an `{ok: false, reason: 'unknown_flag', flag}` envelope.

### IN-03: `dogfood-phase-14.sh` `|| true` swallows `jj config set` failures

**File:** `scripts/dogfood-phase-14.sh:308-309`

**Issue:**

```bash
(cd "$GIT_REPO" && jj config set --repo user.email "dogfood@gsd.test" >/dev/null 2>&1) || true
(cd "$GIT_REPO" && jj config set --repo user.name "GSD Dogfood" >/dev/null 2>&1) || true
```

If these fail (e.g., jj version mismatch, `--repo` flag deprecated), the
script continues silently. Subsequent commits may fail without context.
The `|| true` masking is defensive but loses the diagnostic.

**Fix:** Drop the `|| true` and let `set -e` propagate, OR capture the
output and emit a warning on failure:

```bash
(cd "$GIT_REPO" && jj config set --repo user.email "dogfood@gsd.test") \
    || { echo "WARN: jj config set user.email failed (continuing)" >&2; }
```

### IN-04: `dogfood-phase-14.sh` HANDLE_FILE_* temp files not trap-cleaned

**File:** `scripts/dogfood-phase-14.sh:245-253`, `:389-397`

**Issue:** `HANDLE_FILE_JJ` and `HANDLE_FILE_GIT` are created via
`mktemp` and removed via explicit `rm -f` after the fan-in call. If any
command between creation and removal fails (e.g., the fan-in invocation
throws), the file leaks. The `trap cleanup_git EXIT` only removes
`$GIT_REPO`, not the handle files.

**Fix:** Either extend the trap to remove handle files, or use a
heredoc-fed approach that doesn't require an on-disk handle file:

```bash
trap 'rm -rf "$GIT_REPO" "$HANDLE_FILE_JJ" "$HANDLE_FILE_GIT"' EXIT
```

(Initialize the vars to empty string at the top so the trap is safe.)

### IN-05: `dogfood-rehearse.sh` assertion 3 grep pattern is too narrow

**File:** `scripts/dogfood-rehearse.sh:161`

**Issue:** `if grep -q '^rehearsal-dirty$' .planning/STATE.md` only
matches the marker on a line of its own. The marker was appended at line
118 via `echo "rehearsal-dirty" >> .planning/STATE.md`, which writes
`rehearsal-dirty\n`. If `.planning/STATE.md` did NOT end in a newline
before the append, the marker line would be the concatenation of the
last line's contents + `rehearsal-dirty` (e.g., `prev-line-textrehearsal-dirty`),
NOT a standalone line — and the post-restore grep would falsely "pass"
even if restore was a no-op.

In practice `.planning/STATE.md` is markdown and ends in a newline. The
assertion's fragility is real but unlikely to fire.

**Fix:** Use a substring match (`grep -qF 'rehearsal-dirty'`) so the
assertion is robust to the host file's trailing-newline shape.

---

_Reviewed: 2026-05-23T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
