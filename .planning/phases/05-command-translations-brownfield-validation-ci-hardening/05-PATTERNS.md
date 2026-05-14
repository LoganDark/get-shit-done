# Phase 5: Command Translations + Brownfield Validation + CI Hardening — Pattern Map

**Mapped:** 2026-05-13
**Files analyzed:** ~33 new/modified files (12 SDK verbs + 1 adapter fix + 7 markdown rewrites + 5 CMD-* tests + 1 brownfield fixture + 1 CI workflow + 1 soak metric + 7 flake test fixes + 3 doc edits + 6 cosmetic cjs sweeps)
**Analogs found:** 30 / 33 (3 docs edits need no analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `sdk/src/query/commit.ts` *(modify — verify shape)* | query-handler | request-response | `sdk/src/query/hooks.ts` | exact |
| `sdk/src/query/push.ts` *(new)* | query-handler | request-response | `sdk/src/query/hooks.ts` | exact |
| `sdk/src/query/reset.ts` *(new)* | query-handler | request-response | `sdk/src/query/hooks.ts` | exact |
| `sdk/src/query/revert.ts` *(new)* | query-handler | request-response | `sdk/src/query/hooks.ts` | exact |
| `sdk/src/query/log.ts` *(new)* | query-handler | request-response | `sdk/src/query/hooks.ts` | exact |
| `sdk/src/query/status.ts` *(new)* | query-handler | request-response | `sdk/src/query/hooks.ts` | exact |
| `sdk/src/query/diff.ts` *(new)* | query-handler | request-response | `sdk/src/query/hooks.ts` | exact |
| `sdk/src/query/branch-list.ts` *(new)* | query-handler | request-response | `sdk/src/query/hooks.ts` | exact |
| `sdk/src/query/head-ref.ts` *(new)* | query-handler | request-response | `sdk/src/query/hooks.ts` | exact |
| `sdk/src/query/merge.ts` *(new)* | query-handler | request-response | `sdk/src/query/hooks.ts` | exact |
| `sdk/src/query/restore.ts` *(new)* | query-handler | request-response | `sdk/src/query/hooks.ts` | exact |
| `sdk/src/query/stash.ts` *(new, optional)* | query-handler | request-response (git-only escape) | `sdk/src/query/hooks.ts` | role-match |
| `sdk/src/vcs/backends/jj.ts` *(modify lines 250-264)* | adapter-method | side-effecting | itself (current block) | exact |
| `sdk/src/vcs/__tests__/jj-hooks.test.ts` *(modify + new case)* | integration-test | event-driven | itself | exact |
| `sdk/test/integration/cmd-*-jj.test.ts` *(new, ~11 files)* | integration-test | event-driven | `sdk/src/vcs/__tests__/jj-octopus.test.ts` | role-match |
| `sdk/src/vcs/__tests__/<synth-planning-fixture>.ts` *(new helper)* | test-fixture | factory | `sdk/src/vcs/__tests__/vcs-fixture.ts` | exact |
| `get-shit-done/workflows/execute-phase.md` *(modify ~58 sites)* | workflow-prompt | docs-mutation | `get-shit-done/workflows/autonomous.md:252` / `code-review-fix.md:366` | exact |
| `get-shit-done/workflows/quick.md` *(modify ~46 sites)* | workflow-prompt | docs-mutation | `autonomous.md:252` / `plan-phase.md:257` | exact |
| `get-shit-done/workflows/complete-milestone.md` *(modify ~36 sites)* | workflow-prompt | docs-mutation | `complete-milestone.md:497` (in-file) | exact |
| `get-shit-done/workflows/undo.md` *(modify ~15 sites)* | workflow-prompt | docs-mutation | `autonomous.md:252` | exact |
| `get-shit-done/workflows/code-review.md` *(modify ~11 sites)* | workflow-prompt | docs-mutation | `code-review-fix.md:366` | exact |
| `agents/gsd-code-fixer.md` *(modify ~37 sites)* | agent-prompt | docs-mutation | `agents/*` already using SDK calls (see "No clean analog" below) | partial |
| `agents/gsd-executor.md` *(modify ~24 sites)* | agent-prompt | docs-mutation | (same) | partial |
| `.github/workflows/test.yml` *(modify lines 60-64)* | ci-config | declarative | itself | exact |
| `.planning/intel/ci-jj-soak.md` *(new)* | intel-doc | append-only-log | `.planning/intel/git-touchpoints.md` | role-match |
| `sdk/src/vcs/__tests__/jj-octopus.test.ts` *(modify for flake)* | integration-test | event-driven | itself | exact |
| `sdk/src/vcs/__tests__/jj-lock.test.ts` *(modify for flake)* | integration-test | event-driven | itself | exact |
| `sdk/src/vcs/__tests__/jj-hooks.test.ts` *(modify for flake)* | integration-test | event-driven | itself | exact |
| `sdk/src/vcs/__tests__/jj-workspace.test.ts` *(modify for flake)* | integration-test | event-driven | itself | exact |
| `sdk/src/vcs/__tests__/jj-push-fetch.test.ts` *(modify for flake)* | integration-test | event-driven | itself | exact |
| `sdk/src/vcs/__tests__/jj-commit.test.ts` *(modify for flake)* | integration-test | event-driven | itself | exact |
| `sdk/src/vcs/__tests__/exec-env-passthrough.test.ts` *(modify for flake)* | integration-test | event-driven | itself | exact |
| `.planning/ROADMAP.md` *(modify Phase 5 success criterion #3)* | planning-doc | docs-mutation | n/a — plain prose | n/a |
| `.planning/REQUIREMENTS.md` *(modify BROWN-01/02 phase column)* | planning-doc | docs-mutation | n/a — plain prose | n/a |
| `get-shit-done/bin/lib/{core,verify,commands,init,graphify,drift}.cjs` *(modify error strings + comments only)* | cjs-cli | cosmetic | each other (sibling cjs files) | exact |

---

## Pattern Assignments

### `sdk/src/query/push.ts` (and all 11 sibling new query verbs)

**Analog:** `sdk/src/query/hooks.ts` (80 LOC, Phase 4 plan 04-06 — RESEARCH.md flags this as the canonical pattern).

**Imports pattern** (`sdk/src/query/hooks.ts:24-26`):

```typescript
import { fireHook } from '../vcs/hook-bridge.js';
import type { HookStage } from '../vcs/types.js';
import type { QueryHandler } from './utils.js';
```

For verbs that route through the adapter (most of the new verbs), substitute:

```typescript
import { createVcsAdapter } from '../vcs/index.js';
import type { QueryHandler } from './utils.js';
```

**QueryHandler signature** (`sdk/src/query/utils.ts:40-44`):

```typescript
export type QueryHandler<T = unknown> = (
  args: string[],
  projectDir: string,
  workstream?: string,
) => Promise<QueryResult<T>>;
```

**QueryResult shape** (`sdk/src/query/utils.ts:25-37`):

```typescript
export interface QueryResult<T = unknown> {
  data: T;
  format?: 'json' | 'text';
}
```

**Core handler pattern** (`sdk/src/query/hooks.ts:41-80`):

```typescript
export const fireHookQuery: QueryHandler = async (args, projectDir) => {
  const stage = args[0];
  if (!stage) {
    return { data: { ok: false, error: 'hooks.fire requires a stage argument: pre-commit or pre-push' } };
  }
  if (!isHookStage(stage)) {
    return { data: { ok: false, error: `hooks.fire: invalid stage '${stage}'. Valid: ${VALID_STAGES.join(', ')}` } };
  }
  // --cwd flag handling (Open Q2 / D-08): subsequent positionals scanned for
  // `--cwd <path>`. Defaults to projectDir (the SDK-supplied caller cwd).
  let cwd = projectDir;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[i + 1];
      i++;
    }
  }

  const result = fireHook(cwd, stage);
  return {
    data: {
      stage, cwd,
      exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr,
      ok: result.exitCode === 0,
    },
  };
};
```

**Apply to:** all 12 new verbs. Substitute `fireHook(cwd, stage)` with `vcs.<verb>({...})`. Mirror argv-scan loop verbatim (manual arg parsing, no library). Return `{ data: { ok, exitCode, stdout, stderr, ...verbFields } }`.

**Secondary analog for verbs needing commit-message sanitization** (`sdk/src/query/commit.ts:44-66`):

```typescript
export function sanitizeCommitMessage(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let sanitized = text;
  sanitized = sanitized.replace(/\0/g, '');
  sanitized = sanitized.replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD]/g, '');
  sanitized = sanitized.replace(/<(\/?)?(?:system|assistant|human)>/gi,
    (_match, slash) => `\uFF1C${slash || ''}system-text\uFF1E`);
  sanitized = sanitized.replace(/\[(SYSTEM|INST)\]/gi, '[$1-TEXT]');
  sanitized = sanitized.replace(/<<\s*SYS\s*>>/gi, '\u00ABSYS-TEXT\u00BB');
  return sanitized;
}
```

**Apply to:** `commit.ts` (already there) and the new `revert.ts` / `merge.ts` if they accept user-controlled message strings.

**Argv-flag scanning convention** (already shown above): manual `for (let i = 0; ...)` loop; `args[i] === '--flag' && args[i+1]` for value-flags, `args[i] === '--flag'` for boolean flags. **No argparse / commander / yargs.**

**Multi-positional / `--files` separator convention** (`sdk/src/query/commit.ts:80-94`):

```typescript
const filesIndex = allArgs.indexOf('--files');
const endIndex = filesIndex !== -1 ? filesIndex : allArgs.length;
const knownFlags = new Set(['--force', '--amend', '--no-verify']);
const messageArgs = allArgs.slice(0, endIndex).filter(a => !knownFlags.has(a));
const message = messageArgs.join(' ') || undefined;
const filePaths =
  filesIndex !== -1 ? allArgs.slice(filesIndex + 1).filter(a => !a.startsWith('--')) : [];
```

**Apply to:** any verb taking a free-form message + path list (`commit`, `revert --no-commit <revs>`, `merge --squash <other>`).

---

### `sdk/src/vcs/backends/jj.ts` (A3 fix, lines 250-264)

**Analog:** the current block in the same file — a literal 10-line replacement per D-32.

**Current code to replace** (`sdk/src/vcs/backends/jj.ts:250-264`):

```typescript
    if (!input.noVerify) {
      const isColocated = existsSync(join(cwd, '.git')) && existsSync(join(cwd, '.jj'));
      if (!isColocated) {
        const hookRes = fireHook(cwd, 'pre-commit', { stagedFiles: input.files });
        if (hookRes.exitCode !== 0) {
          // T-03.04-03 mitigation pattern: squash already succeeded; report
          // hook failure via merged stderr, but exitCode reflects squashRes
          // (the squash itself didn't fail). Caller decides whether to treat
          // as error based on stderr presence.
          mergedStderr = `${mergedStderr}\n[pre-commit hook failed]: ${hookRes.stderr || hookRes.stdout}`;
        }
      }
      // colocated: no-op (A3 assumption — git's own hook firing kicks in via
      // post-squash jj git export).
    }
```

**Replacement per D-32** (verbatim from RESEARCH.md Pattern 2 / Code Examples §"Always-fire pre-commit with env override"):

```typescript
    if (!input.noVerify) {
      const skipColocated = process.env.GSD_HOOK_SKIP_COLOCATED === '1';
      const isColocated = existsSync(join(cwd, '.git')) && existsSync(join(cwd, '.jj'));
      // Always fire unless explicitly skipped in colocated mode (escape hatch
      // for a future jj release that adds auto-fire and produces duplicates).
      if (!(skipColocated && isColocated)) {
        const hookRes = fireHook(cwd, 'pre-commit', { stagedFiles: input.files });
        if (hookRes.exitCode !== 0) {
          mergedStderr = `${mergedStderr}\n[pre-commit hook failed]: ${hookRes.stderr || hookRes.stdout}`;
        }
      }
    }
```

**Test fixture coverage update** (`sdk/src/vcs/__tests__/jj-hooks.test.ts:157-179`): the existing `describe('jj-colocated: pre-commit is a no-op from adapter (D-10)', …)` block asserts the inverse of D-32. Test changes:

1. Rename describe-block: `'jj-colocated: pre-commit always fires from adapter (D-32 — D-10 retired)'`.
2. Update the assertion: previously asserted marker file does NOT exist post-squash; now asserts it DOES exist.
3. Add a new `it()` case for the `GSD_HOOK_SKIP_COLOCATED=1` env override (set env var, squash, assert marker does NOT exist).

Test pattern to mirror (`jj-hooks.test.ts:83-96`):

```typescript
it('HOOK-02 + HOOK-03: pre-commit fires after squash in non-colocated jj', () => {
  const markerPath = join(dir, '.pre-commit-fired');
  safeUnlink(markerPath);
  writeHook(dir, 'pre-commit', `#!/bin/bash\ntouch "${markerPath}"\nexit 0\n`);
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  const r = vcs.commit({ message: 'test hook fire', files: ['a.txt'] });
  expect(r.exitCode).toBe(0);
  expect(existsSync(markerPath)).toBe(true);
});
```

---

### `get-shit-done/workflows/execute-phase.md` (and the 4 sibling workflow files)

**Analog 1 (in-file, same workflow already using SDK call for an unrelated mutation):** `execute-phase.md:282` already shows the agnostic-prose-+-SDK-call pattern that PROMPT-01 must propagate to the remaining sites:

```bash
gsd-sdk query state.begin-phase --phase "${PHASE_NUMBER}" --name "${PHASE_NAME}" --plans "${PLAN_COUNT}"
```

**Analog 2 (canonical commit-via-SDK in another workflow):** `get-shit-done/workflows/autonomous.md:251-253` — the cleanest commit-via-SDK example in the codebase:

```bash
Commit the minimal context:

```bash
gsd-sdk query commit "docs(${PADDED_PHASE}): auto-generated context (discuss skipped)" --files "${phase_dir}/${padded_phase}-CONTEXT.md"
```
```

**Analog 3 (commit with explicit `--files` list across multiple paths):** `complete-milestone.md:497`:

```bash
gsd-sdk query commit "chore: archive v[X.Y] milestone files" --files .planning/milestones/v[X.Y]-ROADMAP.md .planning/milestones/v[X.Y]-REQUIREMENTS.md .planning/milestones/v[X.Y]-MILESTONE-AUDIT.md .planning/MILESTONES.md .planning/PROJECT.md .planning/STATE.md .planning/ROADMAP.md
```

**Analog 4 (multi-line block with heredoc message):** `get-shit-done/workflows/code-review-fix.md:366`:

```bash
      gsd-sdk query commit \
        "fix(${PLAN_ID}): address review feedback" \
        --files ${changed_files}
```

**Mechanical-rewrite pattern (UPSTREAM-03 / D-33):** for the primary A3 target at `execute-phase.md:682-691`:

```bash
# BEFORE (execute-phase.md:686-690):
STASHED=false
if (! git diff --quiet || ! git diff --cached --quiet) && git stash push -u -m "gsd-post-wave-hook-$$" >/dev/null 2>&1; then STASHED=true; fi
git hook run pre-commit 2>&1 || echo "⚠ Pre-commit hooks failed — review before continuing"
[ "$STASHED" = "true" ] && (git stash pop >/dev/null 2>&1 || echo "⚠ Could not pop gsd-post-wave-hook stash — recover manually")

# AFTER (D-33 — replace `git hook run pre-commit` with the Phase 4 bridge; stash lines stay or become gsd-sdk query stash if planner adds that verb):
gsd-sdk query hooks.fire pre-commit --cwd . 2>&1 \
  || echo "⚠ Pre-commit hooks failed — review before continuing"
```

**Cross-cutting rewrite rule (D-33 anti-pattern guard):** Never introduce `if vcs.adapter == 'jj'; then …; else …; fi`. Shape is always: raw `git <verb>` → `gsd-sdk query <verb> [--cwd .] <args>`. Surrounding bash logic (conditionals, error echoes, exit handling) stays as-is.

**Apply to:** all five workflow markdown files. Per RESEARCH.md "Consumer Call-Site Inventory" tables for `execute-phase.md`, `quick.md`, `complete-milestone.md`, `undo.md`, `code-review.md`.

---

### `agents/gsd-code-fixer.md`, `agents/gsd-executor.md`

**No clean analog** — research did not surface an agent file already using SDK-mediated mutations as its dominant pattern; the workflow markdown set is several phases ahead on this transition. Planner instructions:

1. Apply the same rewrite rule as workflow markdown (Pattern 3 from RESEARCH.md — raw shell → `gsd-sdk query <verb>`).
2. Use `get-shit-done/workflows/autonomous.md:252` and `code-review-fix.md:366` as the prose-shape reference for any inline commits.
3. Workspace cleanup blocks (`gsd-code-fixer.md:223-260`, `297-355`) — the `vcs.workspace.{list, forget, prune}` surface from Phase 4 is ready; mirror the Phase 4 plan 04-04 `performJjReap` consumer pattern rather than writing direct `git worktree …` shell.
4. Keep edits **mechanical** (UPSTREAM-03) — do not refactor the surrounding bash blocks or reorder prose sections.

---

### `sdk/test/integration/cmd-*-jj.test.ts` (11 new files — CMD-01..11)

**Analog:** `sdk/src/vcs/__tests__/jj-octopus.test.ts:1-60` and `jj-hooks.test.ts:60-115` (Phase 4 plan 04-05/04-06 patterns).

**File header pattern** (`jj-octopus.test.ts:1-37`):

```typescript
/**
 * Phase 4 plan 05: lazy octopus structure contract tests.
 * ...
 * Suite skips when `jj --version` is unavailable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createJjAdapter } from '../backends/jj.js';
import { createPhaseStructure, createSubagentHead, createSubagentSlot } from '../jj/octopus.js';

let jjAvailable = false;
try {
  execSync('jj --version', { stdio: 'pipe' });
  jjAvailable = true;
} catch {
  // jj not on PATH; entire suite skips.
}
```

**Setup/teardown pattern** (`jj-octopus.test.ts:39-60`):

```typescript
describe.skipIf(!jjAvailable)(
  'octopus.ts — Phase 4 plan 05 (WS-05..10)',
  () => {
    let dir: string;
    let vcs: ReturnType<typeof createJjAdapter>;

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'gsd-jj-octopus-'));
      execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
      execSync('jj config set --repo user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
      execSync('jj config set --repo user.name "Test"', { cwd: dir, stdio: 'pipe' });
      writeFileSync(join(dir, 'seed.txt'), 'seed\n');
      execSync('jj squash -B @ -k -m "seed"', { cwd: dir, stdio: 'pipe' });
      vcs = createJjAdapter(dir);
    });
```

**Cross-backend matrix pattern** (use `vcsTest(kind)` factory instead — `sdk/src/vcs/__tests__/vcs-fixture.ts:79-115`):

```typescript
import { makeBackendFixture } from './vcs-fixture.js';

const fixture = makeBackendFixture('jj-colocated');
fixture.setupHooks();

fixture('CMD-XX: …', ({ vcs, cwd }) => {
  // test body — adapter and tmpdir are already initialized
});
```

**Apply to:** every CMD-* test. CMD-01..09 + CMD-11 use the matrix shape via `makeBackendFixture`. CMD-10 brownfield tests use the synth fixture below.

---

### `sdk/src/vcs/__tests__/<synth-planning-fixture>.ts` (new helper for CMD-10 brownfield)

**Analog:** `sdk/src/vcs/__tests__/vcs-fixture.ts:31-77` (the `initGitRepo()` / `initJjRepo()` / `initJjNativeRepo()` factories).

**Factory shape to mirror** (`vcs-fixture.ts:42-59`):

```typescript
function initJjRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gsd-vcs-jj-'));
  execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
  execSync('jj config set --repo user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('jj config set --repo user.name "Test"', { cwd: dir, stdio: 'pipe' });
  return dir;
}
```

**Extension pattern (per RESEARCH.md Code Examples §"Synthetic brownfield fixture skeleton"):** wrap `initJjRepo()` then layer `.planning/` skeleton via `fs.writeFileSync`. No jj-side commits in the seed — brownfield commands inspect the working tree.

```typescript
export function synthPlanningFixture(kind: 'jj-colocated' | 'jj-native'): { dir: string; vcs: VcsAdapter } {
  const dir = kind === 'jj-colocated' ? initJjRepo() : initJjNativeRepo();
  const vcs = createVcsAdapter(dir, { kind: 'jj' });
  mkdirSync(join(dir, '.planning/phases/01-foo'), { recursive: true });
  writeFileSync(join(dir, '.planning/STATE.md'),
    '---\nstopped_at: Phase 01-foo plan 02 (in-progress)\n---\n');
  writeFileSync(join(dir, '.planning/phases/01-foo/01-CONTEXT.md'), '# Phase 01: foo\n');
  // ... (per CMD-10 minimum-shape spec in RESEARCH.md §"CMD-10 Brownfield Synthetic-Fixture Strategy")
  return { dir, vcs };
}
```

**Apply to:** P4 (brownfield commands plan). Five CMD-10 sub-tests reuse this single factory.

---

### `.github/workflows/test.yml` (CI graduation — lines 60-64)

**Analog:** the file itself.

**Current matrix block** (`.github/workflows/test.yml:56-71`):

```yaml
  test:
    runs-on: ${{ matrix.os }}
    timeout-minutes: 10

    # Phase 3 plan 03-07 (CI-01): the jj-colocated lane is allowed to fail —
    # CI-01 graduates to required-blocking in Phase 5 (per D-11). Phase 4
    # plan 01 (D-22) adds the jj-native lane with the same allow-failure
    # posture; both graduate together in Phase 5.
    continue-on-error: ${{ matrix.backend == 'jj-colocated' || matrix.backend == 'jj-native' }}

    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest]
        node-version: [22, 24]
        backend: [git, jj-colocated, jj-native]
```

**Graduation diff (D-36 step 2 — after 10-green soak):** Remove the `continue-on-error` line (line 64) entirely, replacing it with an explanatory comment, or set it to `false` explicitly. Update the leading comment block to reflect the graduation event.

---

### `.planning/intel/ci-jj-soak.md` (new soak-metric file)

**Analog:** `.planning/intel/git-touchpoints.md:1-30` (existing append-only intel doc).

**Header / table-frontmatter pattern** (`git-touchpoints.md:1-15`):

```markdown
# Git Touchpoints — Porting Surface Scan

**Generated:** 2026-05-09 during /gsd-new-project setup
**Method:** ripgrep across full repo for git invocations, `.git/` paths, exec patterns, and ref terminology
**Purpose:** Inform scope/roadmap for jj VCS port. Will drift as upstream churns — refresh before major planning.

## Headline Numbers

| Surface                                          | Files | Hits  |
|--------------------------------------------------|------:|------:|
| `git <subcommand>` invocations (any context)     |   198 | 1,234 |
| ...
```

**Soak-file shape (per RESEARCH.md §"CI Soak Metric File Shape"):**

```markdown
# CI jj-Backend Soak Window

**Started:** YYYY-MM-DD
**Target:** 10 consecutive green nightly runs across both `jj-colocated` and `jj-native` lanes
**Status:** N/10 consecutive (last update: YYYY-MM-DD)

## Run Log

| # | Date | Run ID | jj-colocated | jj-native | git | Notes |
|---|------|--------|--------------|-----------|-----|-------|
| 1 | 2026-05-14 | 12345678 | ✓ | ✓ | ✓ | clean |
...

## Reset Events

- YYYY-MM-DD: counter reset from N/10 to 0/10 after run X failure; fix landed in <commit>.

## Final Graduation

Date: TBD
Commit removing `continue-on-error`: TBD
```

---

### Flake-fix sweep across 7 jj-* test files

**Analogs:**

- **`describe.sequential` pattern** — vitest opt-in for in-suite serial execution. Not currently used in `sdk/src/vcs/__tests__/`; the convention will be set by P5.
- **`mkdtempSync(join(tmpdir(), 'gsd-jj-<name>-'))` per-block pattern** is already used by every flake target — see `jj-hooks.test.ts:67`, `jj-octopus.test.ts:46`. The contention happens at the *parallel-test-file* level when the same prefix is reused across describe blocks.
- **`rmSync(dir, { recursive: true, force: true })` cleanup pattern** is already used at `afterAll` (`jj-hooks.test.ts:80`, `jj-octopus.test.ts:after each describe`). The flake-fix may require shifting some of these to `afterEach` per RESEARCH.md fix-sequence step 4.

**Recommended fix patterns** (RESEARCH.md §"CI Flake Analysis" → recommended fix sequence):

1. **Add `describe.sequential`** wrapping the multi-workspace suites (`jj-octopus`, `jj-lock` and any reap-related tests). Vitest API: replace `describe(...)` with `describe.sequential(...)` at the outer level for tests using `vcsMultiWsTest`.
2. **Random-prefix mkdtemp:** keep `mkdtempSync(join(tmpdir(), 'gsd-jj-<name>-'))` but ensure each test invocation produces a new dir; tmpdir prefix collision across parallel files is the failure mode. Current pattern already uses unique prefixes per test file (e.g., `gsd-jj-hooks-native-`, `gsd-jj-octopus-`); enforce a per-test-invocation suffix where multi-workspace tests reuse the same prefix.
3. **`afterEach` cleanup** in suites where `beforeAll` sets up but tests mutate destructively (e.g., bookmark CRUD). Currently `afterAll` only — escalate to `afterEach { rmSync(dir, …); dir = mkdtempSync(…); }` if isolation issues persist.

**Apply to:** the 7 test files listed in RESEARCH.md §"CI Flake Analysis": `jj-octopus.test.ts`, `jj-lock.test.ts`, `jj-hooks.test.ts`, `jj-workspace.test.ts`, `jj-push-fetch.test.ts`, `jj-commit.test.ts`, `exec-env-passthrough.test.ts`.

---

### MIGR-02 cosmetic sweep — 6 cjs files

**Analog:** sibling cjs files in the same directory that have already been cleaned (per Phase 2 plan 02-11). `verify` lint guard already returns zero violations across `bin/lib/*.cjs` per RESEARCH.md §"MIGR-02 File-by-File Remaining Work" (verified 2026-05-13).

**Per-file natural touch surface** (from RESEARCH.md):

| File | Lines | Cleanup type |
|------|-------|--------------|
| `core.cjs` | ~763, ~788 | Error-message strings: "Run: `git worktree prune`" → "Run: `gsd-sdk query worktree-list`" (or equivalent SDK call) |
| `verify.cjs` | ~949-982 | Error-message strings about worktree health |
| `commands.cjs` | ~334-341 | Comments only — reference `vcs.commit` (already does) |
| `init.cjs` | ~1507, ~1536 | Child-repo detection prose |
| `graphify.cjs` | (sweep) | No natural touch — P5 sweep |
| `drift.cjs` | (sweep) | No natural touch — P5 sweep |

**Pattern:** straight string-edit. No structural / call-site changes (lint guard already green). One pass per file, comments + error strings only.

---

### `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` (doc edits, no analog needed)

Plain markdown edits per CONTEXT D-31. No analog pattern needed.

**ROADMAP.md (per CONTEXT D-31 derivative):** Phase 5 success criterion #3 currently reads "Brownfield commands … run end-to-end against this very repo's jj backend (dogfood)". Replace with synthetic-fixture-based CMD-10 coverage wording. Phase 6 success criteria absorb the literal BROWN-01 / BROWN-02 dogfood scope.

**REQUIREMENTS.md:** BROWN-01 / BROWN-02 phase column shift from "Phase 5" to "Phase 6" (lines ~277, ~278, and the Phase 5 / Phase 6 phase summary lines further down).

---

## Shared Patterns

### Cross-Backend SDK Query Verb (D-33 mandated form)

**Source:** `sdk/src/query/hooks.ts` (whole file, 80 LOC)
**Apply to:** all 12 new query verbs (`push.ts`, `reset.ts`, `revert.ts`, `log.ts`, `status.ts`, `diff.ts`, `branch-list.ts`, `head-ref.ts`, `merge.ts`, `restore.ts`, optional `stash.ts`, and the verify pass on `commit.ts`).

```typescript
import { createVcsAdapter } from '../vcs/index.js';
import type { QueryHandler } from './utils.js';

export const <verb>Query: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  // ... manual argv-scan loop (no library)
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) { cwd = args[i + 1]; i++; }
    // ... per-verb flags
  }
  const vcs = createVcsAdapter(cwd);
  const result = await vcs.<verb>({ /* parsed args */ });
  return {
    data: {
      ok: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      /* verb-specific fields */
    },
  };
};
```

### Test Suite Skip-Gate (jj-not-available)

**Source:** `sdk/src/vcs/__tests__/jj-hooks.test.ts:32-39`
**Apply to:** every new CMD-* integration test file.

```typescript
let jjAvailable = false;
try {
  execSync('jj --version', { stdio: 'pipe' });
  jjAvailable = true;
} catch {
  // jj not on PATH; entire suite skips.
}

describe.skipIf(!jjAvailable)('CMD-XX: …', () => { /* ... */ });
```

### Tmpdir Lifecycle (per-describe init + teardown)

**Source:** `sdk/src/vcs/__tests__/jj-hooks.test.ts:60-81` and `vcs-fixture.ts:42-59`
**Apply to:** every new integration test + the synth-planning fixture.

```typescript
let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'gsd-jj-<suite-name>-'));
  execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
  execSync('jj config set --repo user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('jj config set --repo user.name "Test"', { cwd: dir, stdio: 'pipe' });
});
afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});
```

For flake-fix in 7 existing tests: consider `afterEach` rather than `afterAll` when destructive mutations leak state.

### VCS-Agnostic Markdown Rewrite (D-33 cross-cutting rule)

**Source:** `get-shit-done/workflows/autonomous.md:252` (cleanest in-repo example)
**Apply to:** all 5 workflow markdown files + 2 agent prompt files.

Rewrite shape: `git <verb> <args>` → `gsd-sdk query <verb> [--cwd .] <args>`. Mechanical, shape-for-shape. No surrounding bash logic reshape. No backend conditionals.

### Argv-Injection Guard for Bookmark Names

**Source:** Phase 4 plan 04-07 D-24 — `sdk/src/vcs/refs-validator.ts` `validateRefname` + `--` end-of-options separator
**Apply to:** any new SDK query verb accepting bookmark/ref args (`branch-list`, `merge`, `restore --from <rev>`, `push --bookmark <name>`, future `/gsd-pr-branch`, `/gsd-hotfix`).

Pattern (cited in RESEARCH.md "Security Domain" table):

```typescript
import { validateRefname } from '../vcs/refs-validator.js';
// ... in handler:
if (bookmark !== undefined) {
  const v = validateRefname(bookmark);
  if (!v.ok) return { data: { ok: false, error: v.error } };
}
// When shelling: ['arg1', '--', userControlledRef] — the `--` separator prevents argv injection.
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `agents/gsd-code-fixer.md` (rewrite) | agent-prompt | docs-mutation | No agent file in `agents/` currently uses SDK-mediated mutations as its dominant pattern; planner uses the workflow-markdown analog (`autonomous.md:252`) instead. |
| `agents/gsd-executor.md` (rewrite) | agent-prompt | docs-mutation | Same as above. |
| `.planning/ROADMAP.md` (Phase 5 criterion #3 amendment) | planning-doc | docs-mutation | Plain prose edit; no programmatic pattern. |
| `.planning/REQUIREMENTS.md` (BROWN-01/02 phase column shift) | planning-doc | docs-mutation | Plain prose edit; no programmatic pattern. |

---

## Metadata

**Analog search scope:**
- `sdk/src/query/` (all 12 existing verbs scanned; `hooks.ts` selected as canonical analog per RESEARCH.md flag)
- `sdk/src/vcs/backends/jj.ts` (commit/hook block at lines 240-275)
- `sdk/src/vcs/__tests__/` (vcs-fixture.ts factory + jj-hooks.test.ts + jj-octopus.test.ts for test patterns)
- `get-shit-done/workflows/` (full directory grep for `gsd-sdk query commit` — 16 hit-files; closest analogs: autonomous.md:252, complete-milestone.md:497, code-review-fix.md:366)
- `.github/workflows/test.yml` (matrix block lines 60-71 in-file)
- `.planning/intel/` (3 files; `git-touchpoints.md` selected as soak-file shape analog)

**Files scanned:** ~30 (sdk/src/query/, sdk/src/vcs/__tests__/, sdk/src/vcs/backends/jj.ts, 5 workflow markdown files, 2 agent prompt files, .github/workflows/test.yml, 3 .planning/intel files, 6 bin/lib/*.cjs)
**Pattern extraction date:** 2026-05-13

## PATTERN MAPPING COMPLETE

**Phase:** 05 - Command Translations + Brownfield Validation + CI Hardening
**Files classified:** 33
**Analogs found:** 30 / 33

### Coverage
- Files with exact analog: 24
- Files with role-match analog: 6
- Files with no analog: 3 (2 agent prompts use workflow analog as fallback; 2 .planning docs are plain prose)

### Key Patterns Identified
- All new SDK query verbs mirror `sdk/src/query/hooks.ts` (80-LOC shape: imports, manual argv scan, `createVcsAdapter` + `vcs.<verb>()`, return `{data:{ok,exitCode,stdout,stderr,…}}`).
- Workflow / agent markdown rewrites follow the in-repo pattern at `autonomous.md:252` / `complete-milestone.md:497`: raw `git <verb>` → `gsd-sdk query <verb> [--cwd .] <args>`, mechanical shape-for-shape (UPSTREAM-03), no backend conditionals (D-33).
- Integration tests mirror `jj-hooks.test.ts` / `jj-octopus.test.ts`: jj-available skip-gate, per-describe mkdtemp + jj init + config, afterAll cleanup; for the matrix shape, reuse the existing `makeBackendFixture` from `vcs-fixture.ts`.
- The A3 fix is a verbatim 10-line replacement at `sdk/src/vcs/backends/jj.ts:250-264` per D-32; test fixture flip at `jj-hooks.test.ts:157-179` (assertion inverts).
