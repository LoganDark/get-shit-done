---
phase: 11-orchestrator-agent-rewire-workspace-assert-dispatched-cwd
reviewed: 2026-05-16T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - get-shit-done/workflows/execute-phase.md
  - agents/gsd-executor.md
  - sdk/src/query/workspace-assert-dispatched-cwd.ts
  - tests/quick-md-parallel-dispatch.test.cjs
  - tests/agent-prompts-no-raw-git.test.cjs
  - sdk/src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
resolved_findings:
  - id: CR-01
    closed_by: tqqqwkmwyysw
    description: execute-phase.md dispatch references undefined $WAVE_WORKTREE_PLANS_JSON
  - id: CR-02
    closed_by: tqqqwkmwyysw
    description: execute-phase.md passes literal "{phase_number}" to --phase
  - id: CR-03
    closed_by: kpxxwtykrtln
    description: gsd-executor.md FATAL recovery uses raw `git rev-parse --show-toplevel`
  - id: WR-03
    closed_by: kpxxwtykrtln
    description: backend-opacity property assertion (now pinned by Scenario 5 in cmd-workspace-assert-dispatched-cwd.test.ts)
status: issues_found
---

# Phase 11: Code Review Report (Run-2 re-review — gap-closure plans 11-10 + 11-11)

**Reviewed:** 2026-05-16
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

This re-review covers only the run-2 delta from gap-closure plans 11-10 (PROMPT-06
— execute-phase dispatch fix) and 11-11 (PROMPT-08 — raw-git retirement in
gsd-executor diagnostic dump). The three prior BLOCKERs (CR-01, CR-02, CR-03)
and one WARNING (WR-03) from the run-1 review are now resolved; their original
narrative is preserved in the *Resolved Findings (run-1 carryover)* section
below, each annotated with the run-2 commit that closed it.

**Run-2 closures (verified):**

- **CR-01 (undefined `$WAVE_WORKTREE_PLANS_JSON`) — RESOLVED in tqqqwkmwyysw.**
  Line 541 of execute-phase.md now constructs the variable via
  `WAVE_WORKTREE_PLANS_JSON=$(printf '%s\n' $WAVE_WORKTREE_PLANS | jq -R . | jq -sc 'map({agentId: ., planId: .})')`
  and the regression test
  `tests/quick-md-parallel-dispatch.test.cjs:71-75` pins both the construction
  presence AND the `{agentId, planId}` field-name contract.
- **CR-02 (literal `"{phase_number}"`) — RESOLVED in tqqqwkmwyysw.**
  Line 544 now uses `--phase "${PHASE_NUMBER}"` (bash variable, expanded at
  runtime); the regression test at
  `tests/quick-md-parallel-dispatch.test.cjs:77-80` both positively pins the
  bash-variable form AND forbids the literal `{phase_number}` placeholder.
- **CR-03 (raw `git rev-parse --show-toplevel`) — RESOLVED in kpxxwtykrtln.**
  Lines 428-435 of `agents/gsd-executor.md` now source `REPO_ROOT` via
  `jq -r '.primaryWorkspacePath // "<unresolvable>"'` from the
  `workspace.assert-dispatched-cwd` envelope. The SDK verb additively emits
  `primaryWorkspacePath` (computed independently of cwd-match outcome) and the
  class-wide regression `tests/agent-prompts-no-raw-git.test.cjs` pins the
  whole-repo default-deny against READ-ONLY raw `git` in agent prompts.
- **WR-03 (backend-opacity not pinned) — RESOLVED in kpxxwtykrtln.**
  Scenario 5 in `sdk/src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts`
  pins the failure-branch `primaryWorkspacePath` surface against an in-repo
  no-match cwd — exactly the FATAL-recovery surface the agent's diagnostic
  dump now consumes.

**New run-2 findings (this review):**

Run-2 introduces no new BLOCKERs. Four WARNINGs and three INFOs surface:

- WR-N01: Empty `WAVE_WORKTREE_PLANS` would dispatch a phantom workspace with
  empty `agentId`/`planId` — the new jq pipeline has no zero-guard.
- WR-N02: The `GIT_INVOCATION_RE` read-only verb list in
  `tests/agent-prompts-no-raw-git.test.cjs` is incomplete — common read verbs
  (`diff`, `branch`, `worktree`, `config`, `for-each-ref`, `symbolic-ref`,
  `merge-base`, `name-rev`, `tag`, `blame`) are not caught.
- WR-N03: `GIT_INVOCATION_RE` matches inside fenced code-block prose AND
  inside narrative documentation — but `<destructive_git_prohibition>`
  exemption is not respected; the regex relies on read-only/mutating verb
  asymmetry alone. A future read-only documentation mention (e.g., explaining
  what `git rev-parse` did before retirement) would false-fire.
- WR-N04: `agents/gsd-executor.md:435` reads `primaryWorkspacePath` from
  `$DISPATCH_CHECK` via jq, but the SDK verb returns `null` for that field on
  empty workspace list or jj resolution failure. The fallback string
  `"<unresolvable>"` is emitted in those cases — good — but no behavioral
  pin asserts the agent surfaces this string distinctly from a transient
  resolution failure.

## Structural Findings (fallow)

No `<structural_findings>` block was supplied for this re-review. All findings
below are narrative.

## Narrative Findings (AI reviewer)

## Warnings

### WR-N01: Empty `WAVE_WORKTREE_PLANS` causes phantom workspace dispatch with empty `agentId`/`planId`

**File:** `get-shit-done/workflows/execute-phase.md:541`
**Issue:** The new jq pipeline:

```bash
WAVE_WORKTREE_PLANS_JSON=$(printf '%s\n' $WAVE_WORKTREE_PLANS | jq -R . | jq -sc 'map({agentId: ., planId: .})')
```

assumes `$WAVE_WORKTREE_PLANS` is a non-empty whitespace-separated list of
plan-ids. When it is empty/unset (e.g., the wave entered the worktree-mode
dispatch branch under a refactor that didn't gate the entry on
`[ -n "$WAVE_WORKTREE_PLANS" ]`, or every plan in the wave had
`USE_WORKTREES_FOR_PLAN=false` but the orchestrator still entered this
branch), `printf '%s\n' ""` emits a single newline byte. jq reads that as one
empty string, and the pipeline produces:

```json
[{"agentId":"","planId":""}]
```

— a single phantom workspace dispatch. The SDK verb at
`workspace-parallel-dispatch.ts` would then attempt to create a workspace
keyed on the empty string. Empirically reproduced:

```bash
$ printf '%s\n' $EMPTY | jq -R . | jq -sc 'map({agentId: ., planId: .})'
[{"agentId":"","planId":""}]
```

The inline comment at lines 537-540 acknowledges the word-splitting is
intentional ("attack surface for shell-meta injection is empty by
construction") but does NOT call out the zero-element edge case. The
companion regression test
(`tests/quick-md-parallel-dispatch.test.cjs:82-84`) pins the construction
form but never exercises the empty-accumulator case.

The control flow probably prevents this today (worktree-mode is presumably
gated on at least one plan needing isolation), but the dispatch block has no
explicit `[ -z "$WAVE_WORKTREE_PLANS" ]` guard, and the structural prose at
lines 521-525 doesn't articulate the wave-entry condition crisply. A future
refactor that flips the entry guard from per-plan to "always run dispatch in
worktree mode" would silently expose this defect.

**Fix:** Add an explicit guard before the jq pipeline:

```bash
if [ -z "$WAVE_WORKTREE_PLANS" ]; then
  echo "FATAL: worktree-mode dispatch entered with empty WAVE_WORKTREE_PLANS — refusing to dispatch a phantom wave." >&2
  echo "RECOVERY: this indicates a per-plan-worktree-gate.md state-machine drift — every plan in this wave was gated to sequential mode but the orchestrator entered the worktree-mode dispatch branch anyway." >&2
  exit 1
fi
WAVE_WORKTREE_PLANS_JSON=$(printf '%s\n' $WAVE_WORKTREE_PLANS | jq -R . | jq -sc 'map({agentId: ., planId: .})')
```

Add a regression to `tests/quick-md-parallel-dispatch.test.cjs` asserting the
empty-accumulator guard exists. Either way the existing `HANDLE_OK` guard at
line 547 catches the downstream dispatch failure with a non-fatal message,
but the failure mode is opaque ("workspace.parallel.dispatch failed" with no
hint of the root cause).

---

### WR-N02: `GIT_INVOCATION_RE` read-only verb list is incomplete — 10+ common read verbs not caught

**File:** `tests/agent-prompts-no-raw-git.test.cjs:76`
**Issue:** The pattern:

```js
const GIT_INVOCATION_RE = /\bgit\s+(rev-parse|status|log|ls-files|cat-file|show|describe|rev-list)\b/;
```

omits commonly-used READ-ONLY git verbs that would silently bypass the
"no raw git" rule if re-introduced into an agent prompt:

- `git diff` (read-only by default)
- `git branch` (without `-d`/`-D`/`-m`/`-M`)
- `git worktree list` (read-only)
- `git config --get` / `git config --list` (read-only)
- `git for-each-ref` (read-only)
- `git symbolic-ref` (without `--delete`)
- `git merge-base` (read-only)
- `git name-rev` (read-only)
- `git tag` (without `-d`)
- `git blame` (read-only)
- `git remote -v` / `git remote show` (read-only)
- `git reflog` (read-only)
- `git grep` (read-only)
- `git ls-tree` (read-only)
- `git fsck` (read-only)
- `git fetch` (read-only — modifies refs but doesn't write to working tree)

The class-wide regression's stated rationale ("READ-ONLY verb subset only…
read-only verbs have no narrative analog in the prohibition prose") only
holds for the specific subset enumerated. The defect class — "raw git in
agent prompts perturbs colocated jj state" — is verb-agnostic: every git
read against `.git/index` updates atime, and several read-only verbs
(notably `git status` and `git diff` with `--no-pager` defaults disabled)
mutate index timestamps that jj observes for staleness detection.

**Fix:** Expand the regex to cover the full read-only verb surface:

```js
const GIT_INVOCATION_RE = /\bgit\s+(rev-parse|status|log|ls-files|cat-file|show|describe|rev-list|diff|branch|worktree|config|for-each-ref|symbolic-ref|merge-base|name-rev|tag|blame|remote|reflog|grep|ls-tree|fsck|fetch)\b/;
```

Then re-run the test against `agents/gsd-executor.md` and verify it still
passes (the file should contain no instances of any of these verbs after
Plan 11-11's retirement). Document any unavoidable mentions inside
`<destructive_git_prohibition>` and explicitly exempt that block via
positional carve-out:

```js
// Scope the search to OUTSIDE the destructive_git_prohibition block.
const PROHIBITION_RE = /<destructive_git_prohibition>[\s\S]*?<\/destructive_git_prohibition>/;
const scoped = content.replace(PROHIBITION_RE, '');
const match = scoped.match(GIT_INVOCATION_RE);
```

This carve-out is what the test docstring at lines 35-49 already promises ("a
broader pattern that included mutating verbs would false-fire on 11+
narrative mentions inside that block") but the implementation doesn't deliver
— the test instead narrows the regex to a verb subset. Carving out the
prohibition block by position is more robust and lets the regex catch the
full read-side surface.

---

### WR-N03: `<destructive_git_prohibition>` block exemption is implicit, not enforced — regex drift hazard

**File:** `tests/agent-prompts-no-raw-git.test.cjs:34-49,76`
**Issue:** The docstring at lines 34-49 articulates the load-bearing
rationale: the regex is narrowed to read-only verbs *specifically* because
the `<destructive_git_prohibition>` block contains MUTATING-verb narrative
mentions that would false-fire a broader pattern. This is preserved as Phase
11 D-04 invariant.

But the relationship between "regex narrowness" and "prohibition block
existence" is only documented in prose. There is no test that asserts:

> "If a future regex change widens `GIT_INVOCATION_RE` to include mutating
> verbs, OR a future edit deletes the `<destructive_git_prohibition>`
> block, the existing test must fail."

Test (3) at lines 108-124 partially pins this — it asserts the prohibition
block must be preserved verbatim — but does NOT pin the inverse: if the
prohibition block is deleted, the regex CAN safely be widened. The two
invariants are coupled by prose alone.

Concretely: a planner who reads test (3) and wants to widen the regex to
include `clean|rm|checkout|reset|update-ref|push` would have no automated
signal telling them to first delete the prohibition block — they'd have to
read the rationale prose carefully. The promise the docstring makes
("co-evolution of the block + the regex is explicitly forced") is enforced
only by reviewer attention.

**Fix:** Add a meta-assertion that ties the two: count
mutating-verb mentions inside the prohibition block and document the count
as an explicit threshold:

```js
test.test('prohibition block mutating-verb count matches docstring claim (D-04 co-evolution pin)', () => {
  const content = readAgentFile('agents/gsd-executor.md');
  const block = content.match(/<destructive_git_prohibition>[\s\S]*?<\/destructive_git_prohibition>/)?.[0] ?? '';
  const mutatingVerbs = /\bgit\s+(clean|rm|checkout|reset|update-ref|push)\b/g;
  const count = (block.match(mutatingVerbs) || []).length;
  assert.ok(count >= 11, `D-04: prohibition block must contain ≥11 mutating-verb mentions (docstring lines 38-42 claim "11+"). Found ${count}. If the count drops below the docstring claim, either restore the deleted mentions or widen GIT_INVOCATION_RE and update both this assertion AND the docstring.`);
});
```

Now widening the regex AND deleting the prohibition block both force the
meta-assertion to be re-examined.

---

### WR-N04: Behavioral surface of `"<unresolvable>"` REPO_ROOT not pinned

**File:** `agents/gsd-executor.md:435`
**Issue:** The new diagnostic dump construction:

```bash
REPO_ROOT=$(echo "$DISPATCH_CHECK" | jq -r '.primaryWorkspacePath // "<unresolvable>"')
echo "REPO_ROOT: $REPO_ROOT" >&2
```

emits the literal string `"<unresolvable>"` when:
1. `vcs.workspace.list()` returns empty (no repo present),
2. `resolveJjWorkspacePath` returns null (jj subprocess non-zero exit), or
3. The SDK verb fails before reaching the failure-branch return.

Cases (1) and (2) are real diagnostic states that an operator should be able
to distinguish — a `null` `primaryWorkspacePath` on an empty workspace list
means "this cwd is outside any VCS repo entirely" (orchestrator-cwd-drift
scenario), whereas a `null` from `resolveJjWorkspacePath` failure means
"this is a jj repo but the workspace-name → fs-path lookup failed"
(transient jj process failure, lockfile contention, etc.). Both currently
print `REPO_ROOT: <unresolvable>` with no further detail.

The test `cmd-workspace-assert-dispatched-cwd.test.ts` Scenario 3 pins the
empty-workspace-list case (cwd outside any repo) — but does NOT assert that
`primaryWorkspacePath` is `null` in that scenario (it only asserts `ok:
false`, `workspaceName: null`, `workspacePath: null` for that branch). A
silent regression that emits `""` or `undefined` for primaryWorkspacePath
in the no-repo case would pass the existing assertions but degrade the
FATAL diagnostic.

**Fix:** Either (a) add a Scenario 3 pin that asserts
`d.primaryWorkspacePath` is explicitly `null` (not `undefined`, not `""`)
for the no-repo case, so the agent's `// "<unresolvable>"` jq fallback fires
deterministically; or (b) extend the agent's diagnostic dump to distinguish
the two failure modes by inspecting `$DISPATCH_CHECK | jq -r '.workspaceName'`
alongside `primaryWorkspacePath`.

Option (a) is the minimal fix and pins the contract Plan 11-11 actually
delivered.

## Info

### IN-N01: Inline comment at execute-phase.md:537-540 documents the word-splitting decision but not the zero-element edge case

**File:** `get-shit-done/workflows/execute-phase.md:537-540`
**Issue:** The comment block reads:

```text
# WAVE_WORKTREE_PLANS_JSON: build the dispatch plan-array from the per-plan-worktree-gate.md:94
# accumulator. Plan IDs are filename-derived (matches glob 11-NN) — `$WAVE_WORKTREE_PLANS` is
# intentionally unquoted here so word-splitting feeds each plan-id as a separate jq -R . input.
# Adding quotes would put the entire space-joined list into a single jq line. The attack surface
# for shell-meta injection is empty by construction; see Plan 11-10 D-04 / T-11-10-04.
```

The decision rationale (unquoted = intentional word-splitting) is clear and
correct. But the zero-element edge case (see WR-N01) is not mentioned. A
future maintainer reading this comment will not learn that the construction
is unsafe when the accumulator is empty.

**Fix:** Add one sentence:

```text
# Note: this construction is only correct when WAVE_WORKTREE_PLANS is
# non-empty. Empty input produces [{"agentId":"","planId":""}] (a phantom
# workspace). The entry into this dispatch block must therefore guarantee
# WAVE_WORKTREE_PLANS is non-empty (currently enforced by per-plan-worktree-gate.md
# appending plan_ids when USE_WORKTREES_FOR_PLAN != false, combined with the
# worktree-mode branch entry condition).
```

---

### IN-N02: SDK file-level docstring duplicates rationale already in Plan 11-11 LEARNINGS

**File:** `sdk/src/query/workspace-assert-dispatched-cwd.ts:1-42`
**Issue:** The file-level docstring restates the Plan 11-11 rationale
("envelope additively carries primaryWorkspacePath so the agent's FATAL
recovery diagnostic dump can read the resolved primary workspace fs path
from the SDK verb instead of shelling out to raw `git rev-parse
--show-toplevel`") across multiple paragraph blocks (lines 1-13, 99-107,
166-172). The same content appears in inline comments at line 99-107 and at
lines 165-172.

Three near-identical restatements of the same closure rationale in one file.
A future edit that updates only one block creates drift.

**Fix:** Keep the file-level docstring (lines 1-42) as the canonical
rationale, and reduce the inline comments at 99-107 and 165-172 to
single-sentence pointers:

```ts
// Plan 11-11 (PROMPT-08 closure) — see file-level docstring for rationale.
const primaryWorkspacePath: string | null = ...
```

Low priority; documentation hygiene only.

---

### IN-N03: `AGENT_FILES` array has one entry — class-wide framing oversells the scope

**File:** `tests/agent-prompts-no-raw-git.test.cjs:66-68`
**Issue:** The docstring at line 9-10 claims:

> "Class-wide regression net pinning the project rule `project_no_raw_git`
> at file level for agent prompt markdown files."

But `AGENT_FILES` contains exactly one file:

```js
const AGENT_FILES = [
  'agents/gsd-executor.md',
];
```

Test (4) iterates the array, so adding more agent files is a one-line
change, but the current scope is "one file" not "class-wide". The
codebase contains additional agent prompts (`agents/gsd-verifier.md`,
`agents/gsd-checker.md`, `agents/gsd-research-phase.md`, etc.) that the
"class-wide" framing implies are covered but are NOT.

If those files are intentionally out of scope for Plan 11-11 (because they
don't contain raw-git invocations today), say so explicitly. Otherwise add
them.

**Fix:** Either:
1. Enumerate every agent prompt in `agents/*.md` and add each to
   `AGENT_FILES`, OR
2. Replace the static list with a dynamic glob:

```js
const AGENT_FILES = fs.readdirSync(path.join(repoRoot, 'agents'))
  .filter(f => f.endsWith('.md'))
  .map(f => `agents/${f}`);
```

Option 2 is the better "class-wide" enforcement — any new agent prompt
landing in the future automatically inherits the no-raw-git invariant
without a test update.

---

## Resolved Findings (run-1 carryover)

The four findings below were surfaced by the run-1 review (REVIEW.md at
HEAD~6, pre-plans-11-10/11-11) and are now closed by run-2 commits. Each
is preserved here with status, closing commit short hash, and a
one-sentence verification note. Original narrative is in the git history.

### CR-01: `execute-phase.md` dispatch references undefined `$WAVE_WORKTREE_PLANS_JSON` — status: RESOLVED (tqqqwkmwyysw)

**Original finding:** Plan 11-08 closed the same defect class in quick.md but
left execute-phase.md referencing an undefined shell variable
`$WAVE_WORKTREE_PLANS_JSON`. At runtime, bash expanded the variable to the
empty string and the SDK verb returned `{ok:false,
reason:'plan_json_parse_failed'}`, breaking every parallel dispatch.

**Closure verification (run-2):**
- `get-shit-done/workflows/execute-phase.md:541` now constructs the variable
  via the jq pipeline before the dispatch invocation.
- `tests/quick-md-parallel-dispatch.test.cjs:71-75` pins the construction
  presence AND the `{agentId, planId}` field-name contract matching
  workspace-parallel-dispatch.ts.
- `tests/quick-md-parallel-dispatch.test.cjs:82-84` pins the
  accumulator-source (`printf '%s\n' $WAVE_WORKTREE_PLANS | …`).

See WR-N01 above for the residual zero-element edge-case concern.

---

### CR-02: `execute-phase.md` passes literal `"{phase_number}"` to `--phase` — status: RESOLVED (tqqqwkmwyysw)

**Original finding:** The dispatch invocation passed `--phase "{phase_number}"`
(the workflow's template-placeholder syntax) inside a bash code block where
the placeholder is NOT expanded. Bash saw the literal 12-character string,
the verb did `Number("{phase_number}") === NaN`, and rejected with
`{ok:false, reason:'phase_number_required'}`.

**Closure verification (run-2):**
- `get-shit-done/workflows/execute-phase.md:544` now passes
  `--phase "${PHASE_NUMBER}"` (bash variable, expanded at runtime).
- `tests/quick-md-parallel-dispatch.test.cjs:77-80` positively pins the
  bash-variable form AND negatively pins absence of the literal
  `{phase_number}` placeholder.

---

### CR-03: `gsd-executor.md` FATAL recovery uses raw `git rev-parse --show-toplevel` — status: RESOLVED (kpxxwtykrtln)

**Original finding:** The FATAL diagnostic dump introduced by Plan 11-07
CR-04 closure ran a raw `git rev-parse --show-toplevel` even on a jj-adapter
project, violating the project rule `project_no_raw_git`. On colocated
git+jj checkouts the git branch ALWAYS fired first and could report a
misleading toplevel when the agent was in a non-default jj workspace.

**Closure verification (run-2):**
- `sdk/src/query/workspace-assert-dispatched-cwd.ts` extended the envelope
  with `primaryWorkspacePath: string | null` (lines 99-114, 153-161,
  174-183), computed independently of cwd-match outcome.
- `agents/gsd-executor.md:435` now sources REPO_ROOT via
  `jq -r '.primaryWorkspacePath // "<unresolvable>"'` from `$DISPATCH_CHECK`
  — no raw git invocation.
- `tests/agent-prompts-no-raw-git.test.cjs` adds a class-wide regression
  (with the read-only verb-list caveats called out in WR-N02 / WR-N03).
- `sdk/src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts`
  Scenarios 1-2 + 5 pin the `primaryWorkspacePath` envelope field on jj;
  Scenario 4 pins git parity.

See WR-N02 / WR-N03 / WR-N04 above for residual regression-net coverage
concerns.

---

### WR-03: backend-opacity claim not pinned by end-to-end test — status: RESOLVED (kpxxwtykrtln)

**Original finding:** The docstring claim "The SDK verb… returns the
workspace match + isPrimary flag in one call — collapsing the former HEAD-
on-protected-ref / cwd-drift / abs-path / namespace-regex guards into a
single backend-opaque precondition check" was accurate post-Plan-11-07 but
no test pinned the backend-opacity property end-to-end.

**Closure verification (run-2):**
- `sdk/src/vcs/__tests__/cmd-workspace-assert-dispatched-cwd.test.ts`
  Scenario 5 (jj) and Scenario 4 (git) now BOTH assert
  `primaryWorkspacePath` resolves to the main repo's realpath. The
  envelope-field contract is identical across backends (same key, same
  value semantics: realpath of `entries[0]`).
- The verb body branches on `vcs.kind === 'jj'` internally but consumers
  see identical envelope shape on both backends — pinned by parity.

---

_Reviewed: 2026-05-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Scope: run-2 gap-closure plans 11-10 (PROMPT-06) + 11-11 (PROMPT-08)_
