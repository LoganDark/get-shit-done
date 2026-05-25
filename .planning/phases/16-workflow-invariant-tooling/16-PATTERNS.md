# Phase 16: Workflow + invariant tooling - Pattern Map

**Mapped:** 2026-05-24
**Files analyzed:** 11 (5 new / 4 modified / 2 augmented)
**Analogs found:** 11 / 11 (exact role+data-flow matches across the board)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scripts/lint-vcs-parallel-call-presence.cjs` (NEW) | lint script / CI tooling | file-walk + regex scan (transform) | `scripts/lint-vcs-no-raw-git.cjs` + `scripts/audit-workflow-raw-git.cjs` | exact (composite — lint shape from one, fence walker from the other; CF-06 byte-identical regex duplication) |
| `scripts/lint-vcs-parallel-call-presence.allow.json` (NEW) | config / allowlist data | static JSON | `scripts/lint-vcs-no-raw-git.allow.json` | exact |
| `tests/scripts/lint-vcs-parallel-call-presence.test.cjs` (NEW) | test (node:test) | spawnSync + mkdtemp fixture | `tests/lint-vcs-no-raw-git-fixture.test.cjs` (Pattern B `mkdtemp` + `--scan-root`) | exact |
| `sdk/src/query/cleanup-subagent-workspaces.ts` (NEW) | CLI bridge / query handler | request-response (argv → envelope) | `sdk/src/query/workspace-parallel-cancel.ts` | exact |
| `tests/cli-cleanup-subagent-workspaces.test.cjs` (NEW) | test (node:test) | spawnSync CLI smoke | `tests/cli-workspace-parallel-cancel.test.cjs` | exact |
| `tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` (NEW) | test (node:test) | bash-driven integration | `tests/scripts/audit-workflow-raw-git.test.cjs` (Pattern B mkdtemp synthesizer) | role-match (synthetic-fixture node:test, but bash-driven) |
| `sdk/src/vcs/jj/parallel.ts` (MODIFIED — clean-path branch only) | adapter sidecar | event-driven (post-merge hook) | `sdk/src/vcs/jj/parallel.ts:557-561` (the cancel-verb direct call site already in the same file) | exact (intra-file self-precedent) |
| `scripts/dogfood-restore.sh` (MODIFIED — append at END, D-11/12/13) | bash recovery script | sequential CLI invocation | `scripts/dogfood-restore.sh:55-61` (the existing tail of the same script) | exact (intra-file self-precedent) |
| `.github/workflows/parallel-e2e.yml` (MODIFIED) | CI config | YAML step injection | `.github/workflows/parallel-e2e.yml:125-127` (the existing audit step) | exact (intra-file self-precedent) |
| `sdk/src/query/command-static-catalog-domain.ts` (MODIFIED — three-site reg site 1) | CLI registry | static table append | `sdk/src/query/command-static-catalog-domain.ts:23,78-79` (cancel verb registration) | exact (intra-file self-precedent) |
| `sdk/src/query/command-manifest.non-family.ts` (MODIFIED — three-site reg site 2) | CLI manifest | static table append | `sdk/src/query/command-manifest.non-family.ts:63` (cancel verb entry) | exact (intra-file self-precedent) |
| `sdk/src/query/command-aliases.generated.ts` (MODIFIED — three-site reg site 3) | CLI alias table | static table append | `sdk/src/query/command-aliases.generated.ts:156` (cancel verb entry) | exact (intra-file self-precedent) |
| `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` (AUGMENTED — new `it` blocks per D-15) | test (vitest) | adapter contract assertion | `sdk/src/vcs/__tests__/cmd-parallel-cancel-jj.test.ts:118-121` (post-cleanup `existsSync` pattern) + same file's existing clean-path scenario at `:126-218` | exact (sibling-file pattern transplant) |
| `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` (AUGMENTED — git-cell regression test per D-15) | test (vitest) | adapter contract assertion | `sdk/src/vcs/__tests__/cmd-parallel-cancel-jj.test.ts:118-121` (assertion shape; git-side already-correct behavior just needs a regression guard) | role-match |

**Note on pattern context naming:** The pattern context mentions `tests/dogfood-restore-cleanup-subagent-workspaces.test.cjs` and `sdk/src/vcs/jj/parallel.test.ts`. Verified disk state: there is no `parallel.test.ts` under `sdk/src/vcs/jj/` — the jj-side parallel adapter tests live at `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` and `cmd-parallel-cancel-jj.test.ts`. RESEARCH §D-15 confirms the cross-backend test "lives in `sdk/src/vcs/__tests__/`". Planner should augment those existing files (Open Q3 recommendation: new `it` blocks inside the existing N=2/3/4 describe). For the dogfood-restore integration test, RESEARCH Wave 0 Gaps line 880 names it `tests/scripts/dogfood-restore-orphan-cleanup.test.cjs`; this PATTERNS.md adopts that canonical name.

## Pattern Assignments

### `scripts/lint-vcs-parallel-call-presence.cjs` (lint script / CI tooling)

**Primary analog:** `scripts/lint-vcs-no-raw-git.cjs` (lint shape, argv, allowlist plumbing, exit-code semantics)
**Secondary analog:** `scripts/audit-workflow-raw-git.cjs` (fence walker, regex constants per CF-06)

**Why these are right:** lint-vcs-no-raw-git.cjs is the canonical "default-deny + per-entry allowlist + `--scan-root` fixture isolation + file:line diagnostic emit" lint shape in `scripts/`. audit-workflow-raw-git.cjs is the canonical fence-aware bash/sh/zsh scanner for `get-shit-done/workflows/` markdown. Phase 16 needs both halves stapled together — per CF-06 the FENCE_OPEN/FENCE_CLOSE constants must be byte-identical to audit-workflow-raw-git.cjs (the v1.2-style "audit + lint regex surface coverage gap" mitigation; REQUIREMENTS.md §Out of Scope L92 forbids shared-lib extraction).

**Shebang + header docblock** (mirror `lint-vcs-no-raw-git.cjs:1-19`):

```javascript
#!/usr/bin/env node
/**
 * lint-vcs-parallel-call-presence.cjs (Phase 16 plan 16.01, LINT-06)
 *
 * Enforces FILE-level pairing of workspace.parallel.dispatch ↔
 * workspace.parallel.fan-in literals inside bash/sh/zsh fences under
 * get-shit-done/workflows/. ...
 * (per CONTEXT D-10: one-line cross-reference to PITFALLS.md §IP-2 for the
 *  cancel/fanIn-only exclusion rationale — not a verbose dump)
 */
'use strict';
```

**Imports pattern** (mirror `lint-vcs-no-raw-git.cjs:21-23`):

```javascript
const fs = require('fs');
const path = require('path');
const { parseAllowlist } = require('./lib/allowlist-parser.cjs');
```

**Argv + scan-root pattern** (verbatim copy from `lint-vcs-no-raw-git.cjs:32-41`):

```javascript
function parseArgv(argv) {
  const out = { scanRoot: null };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--scan-root' && argv[i + 1]) { out.scanRoot = argv[i + 1]; i += 1; }
  }
  return out;
}
const ARGV = parseArgv(process.argv);
const REPO_ROOT = path.resolve(__dirname, '..');
const SCAN_ROOT = ARGV.scanRoot ? path.resolve(ARGV.scanRoot) : REPO_ROOT;
```

**Allowlist parse pattern** (mirror `lint-vcs-no-raw-git.cjs:45-50`):

```javascript
const ALLOW = parseAllowlist(
  require('./lint-vcs-parallel-call-presence.allow.json'),
  'lint-vcs-parallel-call-presence',
);
const ALLOW_FILES = ALLOW.files;
const ALLOW_GLOB_REGEXES = ALLOW.globRegexes;
```

**Fence walker constants — BYTE-IDENTICAL duplication per CF-06** (verbatim from `audit-workflow-raw-git.cjs:42-50`):

```javascript
// Byte-identical to scripts/audit-workflow-raw-git.cjs:48-49 (CF-06 — audit
// and lint must agree on what counts as a fence; shared-lib extraction
// forbidden per REQUIREMENTS.md §Out of Scope L92).
const FENCE_OPEN = /^\s*(```+|~~~+)\s*(bash|sh|zsh)\b/i;
const FENCE_CLOSE = /^\s*(```+|~~~+)\s*$/;
const SCAN_ROOTS = ['get-shit-done/workflows'];  // D-03 — narrower than audit; workflows only

// Content-driven literal substring detection (CF-04). NO regex anchors —
// the fence walker already scopes to bash content. Hyphenated fan-in per
// the existing literal in execute-phase.md:775.
const PARALLEL_DISPATCH_RE = /workspace\.parallel\.dispatch/;
const PARALLEL_FAN_IN_RE = /workspace\.parallel\.fan-in/;
```

**Per-file scanner (FILE-level pairing) — adapted from `audit-workflow-raw-git.cjs:114-130`**:

The audit accumulates per-line `hits[]`; the new lint accumulates per-file booleans `hasDispatch` / `hasFanIn`. After the walk: `violation = hasDispatch !== hasFanIn` (XOR — exactly one literal present indicates an unpaired file).

```javascript
function scanFile(absPath, scanRoot) {
  const rel = path.relative(scanRoot, absPath).split(path.sep).join('/');
  const lines = fs.readFileSync(absPath, 'utf8').split('\n');
  let inFence = false;
  let hasDispatch = false;
  let hasFanIn = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!inFence && FENCE_OPEN.test(line)) { inFence = true; continue; }
    if (inFence && FENCE_CLOSE.test(line)) { inFence = false; continue; }
    if (!inFence) continue;
    if (/^\s*#/.test(line)) continue; // shell comment — skip (mirror :124)
    if (PARALLEL_DISPATCH_RE.test(line)) hasDispatch = true;
    if (PARALLEL_FAN_IN_RE.test(line)) hasFanIn = true;
  }
  return { path: rel, hasDispatch, hasFanIn };
}
```

**Directory walker pattern — defense-in-depth symlink skip per `audit-workflow-raw-git.cjs:98-107`** (T-13-04 / ASVS V12):

```javascript
function findMarkdown(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;  // T-13-04 defense-in-depth
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findMarkdown(full, out);
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
}
```

**Violation report + exit pattern** (mirror `lint-vcs-no-raw-git.cjs:146-164`):

```javascript
if (violations.length === 0) {
  console.log('ok lint-vcs-parallel-call-presence: ' + files.length + ' files scanned in ' + SCAN_ROOT + ', 0 violations');
  process.exit(0);
}
process.stderr.write('\nERROR lint-vcs-parallel-call-presence: ' + violations.length + ' unpaired file(s)\n\n');
for (const v of violations) {
  // Diagnostic anchored at line 1 since pairing is file-scoped (D-01 per <specifics>)
  process.stderr.write('  ' + v.file + ':1  missing paired call ' +
    '(has ' + (v.hasDispatch ? 'dispatch' : 'fan-in') + ' literal but no ' +
    (v.hasDispatch ? 'fan-in' : 'dispatch') + ' literal in any fence)\n');
}
process.stderr.write('\nFix: add the missing literal in a bash/sh/zsh fence, OR\n');
process.stderr.write('     add the file to scripts/lint-vcs-parallel-call-presence.allow.json with PR rationale.\n');
process.exit(1);
```

**Anti-patterns to AVOID (per RESEARCH §Anti-Patterns to Avoid + Pitfall 7):**
- Do NOT use heading-based or SAME-FENCE pairing scope (empirically falsified on `execute-phase.md`).
- Do NOT extract a shared `scripts/lib/fence-walker.cjs` — REQUIREMENTS.md §Out of Scope L92 mandates duplication-with-comment instead.
- Do NOT promote to `npm pretest` — CI-only per CF-05.
- Do NOT recognize an inline `vcs-lint:allow-parallel-call-absent-here` annotation — deferred entirely per D-09 (pure YAGNI).
- Do NOT scan agents/ or references/ — D-03 limits scope to `get-shit-done/workflows/` only.

---

### `scripts/lint-vcs-parallel-call-presence.allow.json` (config / allowlist)

**Analog:** `scripts/lint-vcs-no-raw-git.allow.json`

**Why it's right:** This is the canonical schema-v2 per-entry allowlist consumed by `parseAllowlist` in `scripts/lib/allowlist-parser.cjs:34`. Identical wire format; planner just authors a different `entries: []` body + narrative comments.

**Initial body** (per CONTEXT D-08 — empty entries + narrative stub; no speculative seeding):

```json
{
  "$schema_version": 2,
  "$migration_note": "Phase 8 Plan 1 D-03 + D-04: per-entry { path|glob, reason, owner }; expires field dropped per solo-dev override.",
  "$comment_ip2_cancel_exclusion": "This lint enforces dispatch <-> fan-in pairing presence; cancel and fanIn-only workflows are NOT in scope today — when a real consumer emerges, the lint scope rule is revisited then. See .planning/research/PITFALLS.md IP-2.",
  "entries": []
}
```

**Schema shape pattern** (mirror `scripts/lint-vcs-no-raw-git.allow.json:1-6`):

```json
{
  "$schema_version": 2,
  "$migration_note": "...",
  "$comment_<id>": "...",
  "entries": [
    { "path": "<file>", "reason": "<text>", "owner": "@<handle>" },
    { "glob": "<pattern>", "reason": "<text>", "owner": "@<handle>" }
  ]
}
```

**Parser-enforced invariants** (per `scripts/lib/allowlist-parser.cjs:32, 42-58`):
- `$schema_version: 2` required (top-level metadata; parser ignores `$*` keys)
- per-entry MUST have exactly one of `{path, glob}`, AND BOTH `reason` and `owner` (non-empty strings)
- NO `expires` field (per `feedback_solo_dev_no_expires`; CONTEXT CF-04)

**Anti-patterns to AVOID:**
- Do NOT seed `.planning/**` or `docs/**` globs as defensive guards — the fence-scope-only scan (D-01) is the structural defense; defending twice violates the per-entry schema's anti-hollowing intent (CONTEXT D-08).
- Do NOT add an `expires` field — `feedback_solo_dev_no_expires` + CF-04.

---

### `tests/scripts/lint-vcs-parallel-call-presence.test.cjs` (test — node:test)

**Analog:** `tests/lint-vcs-no-raw-git-fixture.test.cjs` (Pattern B `mkdtemp` + `spawnSync` + `--scan-root`)

**Why it's right:** Direct sibling pattern. The fixture-test must not pollute the repo root or share state across tests — `mkdtemp` per-test gives full isolation; `--scan-root` lets the lint walk the synthetic tree without picking up the production allowlist. Five scenarios required per CONTEXT D-14.

**Imports + spawn pattern** (verbatim from `tests/lint-vcs-no-raw-git-fixture.test.cjs:15-23`):

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'lint-vcs-parallel-call-presence.cjs');
```

**Pattern B test skeleton** (mirror `tests/lint-vcs-no-raw-git-fixture.test.cjs:35-54`):

```javascript
test('paired dispatch + fan-in literals in separate fences -> exit 0', () => {
  const fixDir = fs.mkdtempSync(path.join(os.tmpdir(), '__lint-fixture-parallel-'));
  const wfDir = path.join(fixDir, 'get-shit-done', 'workflows');
  fs.mkdirSync(wfDir, { recursive: true });
  fs.writeFileSync(path.join(wfDir, 'paired.md'),
    '# Workflow\n\n## Dispatch\n```bash\ngsd-sdk query workspace.parallel.dispatch\n```\n\n' +
    '## Fan-in\n```bash\ngsd-sdk query workspace.parallel.fan-in\n```\n'
  );
  try {
    const r = spawnSync(process.execPath, [SCRIPT, '--scan-root', fixDir], { encoding: 'utf-8' });
    assert.equal(r.status, 0, 'expected exit 0 but got ' + r.status + '\nstderr: ' + r.stderr);
  } finally {
    fs.rmSync(fixDir, { recursive: true, force: true });
  }
});
```

**Five scenarios required (D-14):**
1. Paired dispatch + fan-in in separate fences → exit 0 (positive — D-01 file-scoped pairing).
2. Dispatch-only fence → exit 1 + diagnostic mentions `fan-in` (negative).
3. Fan-in-only fence → exit 1 + diagnostic mentions `dispatch` (negative).
4. Prose-only mention of "wave"/"parallel" / non-fence section → exit 0 (Pitfall 7 false-positive guard — the most load-bearing test).
5. Allowlist entry suppresses a known-opt-out file → exit 0 (D-08 schema verification — entry shape `{path, reason, owner}`).

**Cleanup pattern** (always `finally`-wrapped `rmSync` per `tests/lint-vcs-no-raw-git-fixture.test.cjs:51-53`):

```javascript
} finally {
  fs.rmSync(fixDir, { recursive: true, force: true });
}
```

**Anti-patterns to AVOID:**
- Do NOT invoke the lint without `--scan-root` (would scan the production repo root and pollute the test with whatever exists in `get-shit-done/workflows/` today).
- Do NOT share fixture state across tests.
- Do NOT use a custom matcher / `expect.extend` — `node:assert/strict` is the tests/ convention (per `feedback_vitest_extend_over_free_fn` — note that feedback applies to vitest; this file is `node:test`).

---

### `sdk/src/query/cleanup-subagent-workspaces.ts` (CLI bridge / query handler)

**Analog:** `sdk/src/query/workspace-parallel-cancel.ts` (Phase 15.04 cancel verb)

**Why it's right:** Same role exactly — TypeScript CLI bridge exposing a jj-side adapter helper to bash consumers (here: `scripts/dogfood-restore.sh`). Cancel verb already locks the inline-argv-walk pattern, the `{ data: ... }` envelope shape, the structured `{ok:false, reason:...}` error shape, and the `createVcsAdapter(cwd)` discipline. The new bridge mirrors verbatim; the only divergences are (a) `--phase N` / `--all-phases` mutually-exclusive flags instead of `--handle`, (b) `--all-phases` enumeration of `.claude/jj-workspaces/`, (c) merged-envelope aggregation per D-06.

**Header docblock + three-site reference** (mirror `workspace-parallel-cancel.ts:1-32`):

```typescript
/**
 * sdk/src/query/cleanup-subagent-workspaces.ts — Phase 16 plan 16.02 (CLEANUP-02)
 *
 * CLI bridge for cleanup-subagent-workspaces. Wraps the locked Phase 15.04
 * helper at sdk/src/vcs/jj/workspace-cleanup.ts:134 for bash consumers
 * (scripts/dogfood-restore.sh). The TS-side fanIn clean-path branch calls the
 * helper DIRECTLY (NOT via this bridge — bridge is for bash only).
 *
 * Flags (D-04 — mutually exclusive):
 *   --cwd <path>        optional; defaults to projectDir
 *   --phase <N>         single-phase mode (helper called once)
 *   --all-phases        enumerate .claude/jj-workspaces/ via readdirSync,
 *                       filter by /^phase-(\d+)-subagent-\d+$/, call helper
 *                       once per derived phase, merge envelopes (D-05/D-06)
 *
 * Returns merged {abandoned, failedReaped} via { data: ... } envelope.
 *
 * Three-site registration (CF-02 / Pitfall 6 — missing any one site breaks
 * runtime verb resolution): the export is wired at
 *   sdk/src/query/command-static-catalog-domain.ts,
 *   sdk/src/query/command-manifest.non-family.ts,
 *   sdk/src/query/command-aliases.generated.ts.
 * The smoke at tests/cli-cleanup-subagent-workspaces.test.cjs proves
 * end-to-end resolution.
 */
```

**Imports pattern** (mirror `workspace-parallel-cancel.ts:34-37` + add `readdirSync` for `--all-phases`):

```typescript
import { readdirSync } from 'node:fs';
import { createVcsAdapter } from '../vcs/index.js';
import { cleanupSubagentWorkspaces } from '../vcs/jj/workspace-cleanup.js';
import type { QueryHandler } from './utils.js';
```

**Argv walk + mutual-exclusion** (mirror `workspace-parallel-cancel.ts:54-68` inline-loop shape; per RESEARCH §Claude's Discretion VERIFIED no `sdk/src/query/cli/argv.ts` exists, so inline-walk is mandatory):

```typescript
export const cleanupSubagentWorkspacesQuery: QueryHandler = async (args, projectDir) => {
  let cwd = projectDir;
  let phase: number | undefined;
  let allPhases = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      cwd = args[++i];
    } else if (args[i] === '--phase' && args[i + 1]) {
      phase = Number(args[++i]);
    } else if (args[i] === '--all-phases') {
      allPhases = true;
    }
  }

  if (phase !== undefined && allPhases) {
    return { data: { ok: false, reason: 'phase_and_all_phases_mutually_exclusive' } };
  }
  if (phase === undefined && !allPhases) {
    return { data: { ok: false, reason: 'phase_or_all_phases_required' } };
  }
  if (phase !== undefined && (Number.isNaN(phase) || !Number.isInteger(phase) || phase < 0)) {
    return { data: { ok: false, reason: 'invalid_phase_number' } };  // ASVS V5 — RESEARCH §Security Domain
  }

  // ... enumerate / dispatch to helper / merge / return
};
```

**Error envelope pattern** (verbatim shape from `workspace-parallel-cancel.ts:66-68, 74-82`):

```typescript
return { data: { ok: false, reason: '<snake_case_reason>' } };
```

**--all-phases enumeration** (per D-05; canonical workspace name regex matches `octopus.ts:300` — `phase-${phaseTag}-subagent-${idx}`):

```typescript
// D-05: enumerate .claude/jj-workspaces/, filter by canonical name pattern,
// derive unique phase numbers, call helper per phase, merge envelopes.
// Strict regex anchor prevents path-injection via crafted dir names (ASVS V12).
const WORKSPACE_NAME_RE = /^phase-(\d+)-subagent-\d+$/;
// ... use vcsRoot from cwd resolution, readdirSync, filter, map to phase nums,
//     Set-dedupe, call helper per num, merged.abandoned.push(...result.abandoned)
```

**D-06 merged-envelope return** (single flat envelope across all phases — NOT a per-phase array; workspace names are phase-prefixed so concatenation is collision-free):

```typescript
return { data: { abandoned, failedReaped } };  // single merged envelope
```

**Three-site registration call-outs** (CF-02 — verbatim shape from cancel verb):

| Site | File | Line of cancel-verb precedent | New entry shape |
|------|------|-------------------------------|-----------------|
| 1 | `sdk/src/query/command-static-catalog-domain.ts` | `:23` (import), `:78-79` (dot form + space alias) | `import { cleanupSubagentWorkspacesQuery } from './cleanup-subagent-workspaces.js';` + two map entries `['cleanup-subagent-workspaces', cleanupSubagentWorkspacesQuery]` (only one form — no `.`/space alias variation since the verb is single-word; mirror existing single-word verbs like `worktree.cleanup-wave` at `:67-68`) |
| 2 | `sdk/src/query/command-manifest.non-family.ts` | `:63` | `{ canonical: 'cleanup-subagent-workspaces', aliases: [], mutation: true, outputMode: 'json' }` |
| 3 | `sdk/src/query/command-aliases.generated.ts` | `:156` | `{ canonical: 'cleanup-subagent-workspaces', aliases: [], mutation: true }` (the file carries a "GENERATED FILE" header — RESEARCH §Open Q1: planner verifies regeneration command or hand-edits) |

**Anti-patterns to AVOID:**
- Do NOT use `process.exit(1)` for error reporting — return structured `{ok:false, reason:...}` envelope per RESEARCH §Anti-Patterns line 545.
- Do NOT skip any of the three registration sites — Pitfall 6 / Phase 11 plan 02 documented this failure mode for the original parallel verbs.
- Do NOT accept inline JSON like `--handle '{...}'` for any future input — cancel-verb precedent at `workspace-parallel-cancel.ts:46-51` rejects inline form (RESOLVED NO inline).
- Do NOT call the helper inline — always import from `'../vcs/jj/workspace-cleanup.js'`; Pitfall 11 mitigation.

---

### `tests/cli-cleanup-subagent-workspaces.test.cjs` (test — node:test smoke)

**Analog:** `tests/cli-workspace-parallel-cancel.test.cjs`

**Why it's right:** Same role — repo-side CLI smoke that proves three-site verb resolution end-to-end. The cancel test (RESEARCH Open Q4 recommendation) shipped exactly this shape: canonical dot form, space-alias form, and a bogus-verb negative control. The new bridge needs the same three checks plus the mutually-exclusive-flag error path.

**Imports + runQuery helper** (verbatim from `tests/cli-workspace-parallel-cancel.test.cjs:31-47`):

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const SDK_BIN = path.resolve(__dirname, '..', 'sdk', 'bin', 'gsd-sdk.js');

function runQuery(argv, { stdin } = {}) {
  const opts = { encoding: 'utf-8', timeout: 15000 };
  if (stdin !== undefined) opts.input = stdin;
  return spawnSync('node', [SDK_BIN, 'query', ...argv], opts);
}
```

**Canonical-form resolution test** (mirror `tests/cli-workspace-parallel-cancel.test.cjs:49-55`):

```javascript
test('CLI smoke: bridge without --phase or --all-phases returns {ok: false, reason: phase_or_all_phases_required}', () => {
  const r = runQuery(['cleanup-subagent-workspaces']);
  assert.strictEqual(r.status, 0, `non-zero exit: stdout=${r.stdout} stderr=${r.stderr}`);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.ok, false);
  assert.strictEqual(parsed.reason, 'phase_or_all_phases_required');
});
```

**Mutually-exclusive-flags test** (new — per D-04):

```javascript
test('CLI smoke: --phase + --all-phases together returns {ok: false, reason: phase_and_all_phases_mutually_exclusive}', () => {
  const r = runQuery(['cleanup-subagent-workspaces', '--phase', '16', '--all-phases']);
  // parse and assert reason mirrors the cancel test envelope-check shape
});
```

**Bogus-verb negative control** (mirror `tests/cli-workspace-parallel-cancel.test.cjs:73-...`):

```javascript
test('CLI smoke: bogus verb returns unknown-verb error (negative control)', () => {
  const r = runQuery(['cleanup-subagent-workspaces-xyz']);
  // assert non-zero exit OR unknown-verb marker on stderr
});
```

**Anti-patterns to AVOID:**
- Do NOT exercise the bridge against a real .claude/jj-workspaces/ tree from this test — the smoke is for verb resolution only, not behavior. Behavior is tested by D-15 (cross-backend, vitest) and D-16 (bash integration).
- Do NOT add a `--help` test — cancel test omits per RESEARCH N4 (gsd-sdk does not implement `--help`).

---

### `tests/scripts/dogfood-restore-orphan-cleanup.test.cjs` (test — bash integration via node:test)

**Analog:** `tests/scripts/audit-workflow-raw-git.test.cjs` (Pattern B mkdtemp + synthetic fixture; node:test convention for `tests/scripts/`)

**Why it's right:** RESEARCH §Phase Requirements → Test Map line 864 names this file. It exercises `scripts/dogfood-restore.sh` end-to-end against a synthetic fixture seeding two phase-prefixed workspace dirs (D-16: e.g. `phase-15-subagent-1`, `phase-16-subagent-2`) and asserts both dirs are gone after the script completes. The audit-workflow test is the closest existing precedent for "node:test invoking a script-under-test against a synthetic mkdtemp tree."

**Imports + writeMd-style helper** (mirror `tests/scripts/audit-workflow-raw-git.test.cjs:21-41` — adapted for workspace-dir seeding instead of .md):

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');

function seedWorkspace(root, phaseNum, idx) {
  const tag = String(phaseNum).padStart(2, '0');
  const wsDir = path.join(root, '.claude', 'jj-workspaces', `phase-${tag}-subagent-${idx}`);
  mkdirSync(wsDir, { recursive: true });
  writeFileSync(path.join(wsDir, 'marker.txt'), 'orphan\n');
  return wsDir;
}
```

**Synthetic `jj op restore` + tar fixture pattern** (per CONTEXT D-16 — seeds two phases to verify --all-phases enumeration crosses phase boundaries):

The fixture must: (a) seed a synthetic colocated jj repo, (b) materialize two orphan workspace dirs under `.claude/jj-workspaces/` with different phase prefixes, (c) invoke the production `scripts/dogfood-restore.sh` with synthetic op-id + tarball, (d) assert `!existsSync` for both workspace dirs after the script completes, (e) clean up the tmpdir in `finally`.

**Anti-patterns to AVOID:**
- Do NOT skip the second phase seeding — single-phase seeds would not exercise the cross-phase enumeration code path (D-05/D-06).
- Do NOT write the test under `sdk/src/__tests__/` — bash-driven integration belongs under `tests/scripts/` (the `tests/` → `node:test` bifurcation per RESEARCH Standard Stack line 114).
- Do NOT skip on `set -euo pipefail` failures — the test must assert the script's exit semantics (D-12: trap+WARN means exit 0 even on cleanup-fail).

---

### `sdk/src/vcs/jj/parallel.ts` (MODIFIED — clean-path branch only per CF-03/AP-5)

**Analog:** the SAME file's existing `performJjParallelCancel` site at `sdk/src/vcs/jj/parallel.ts:557-561` (intra-file self-precedent for the direct helper call shape)

**Why it's right:** The locked Phase 15.04 helper is already imported at `parallel.ts:67`. The cancel verb already establishes the exact 3-arg call shape (`mainRepoRoot, handle.phaseNumber, handle.workspaces`) for the helper. Phase 16 just adds a second call site on the clean-path `else` branch.

**Import already in place** (no change needed — verified at `parallel.ts:67`):

```typescript
import { cleanupSubagentWorkspaces } from './workspace-cleanup.js';
```

**Direct call pattern — exact mirror of `parallel.ts:557-561`**:

```typescript
const { abandoned, failedReaped } = cleanupSubagentWorkspaces(
  mainRepoRoot,
  handle.phaseNumber,
  handle.workspaces,
);
```

**Insertion site — D-07 places this call inside the clean-path `else` branch** (after `merged.push(mergeChangeId)` at `parallel.ts:460`, before the `4. Reap crashed agents` block at `:463`):

```typescript
} else {
  // ... existing bookmark-advance pass (lines 412-451)
  merged.push(mergeChangeId);

  // CLEANUP-02 / Phase 16.02 (D-07): tear down materialized subagent
  // workspaces on the clean path. Handle.workspaces is the authoritative
  // source-of-truth (Pitfall 4 mitigation per N1 — custom workspacePath
  // overrides MUST be honored). Direct TS-side call (NOT via the CLI
  // bridge — bridge is for bash consumers only).
  const { failedReaped: cleanupFailedReaped } = cleanupSubagentWorkspaces(
    mainRepoRoot,
    handle.phaseNumber,
    handle.workspaces,
  );
  for (const name of cleanupFailedReaped) failedReaped.push(name);
}
```

Note: the cancel-site destructures `{ abandoned, failedReaped }`; the fanIn-site here ignores `abandoned` (the merged result envelope has no field for it) and merges only `failedReaped` into the existing `failedReaped: string[]` declared at `parallel.ts:392`. The variable rename `cleanupFailedReaped` avoids shadowing.

**Conflicted-branch comment addition — CF-03 / AP-5 / W3(a) lock-in**:

Per CONTEXT D-07 + Pitfall 2 (AP-5): add an inline comment INSIDE the `if (conflicted) { ... }` block (currently `parallel.ts:394-410`) documenting the cleanup-omission as intentional. Reference CF-03 + ROADMAP SC4 + AP-5. Example:

```typescript
if (conflicted) {
  // W3 (a) / CF-03 / AP-5: workspaces are PRESERVED on disk here for human
  // inspection of the conflicted state. NO cleanupSubagentWorkspaces call —
  // the joint-assertion contract (ROADMAP SC4) makes this divergence from
  // the clean-path branch load-bearing. DO NOT add reap here.
  // ... existing W3 (a) body
}
```

**Anti-patterns to AVOID (CRITICAL — AP-5):**
- Do NOT add ANY `rmSync` or `cleanupSubagentWorkspaces` call inside `if (conflicted) { ... }`. This violates the W3 (a) joint-assertion contract — workspaces must persist on disk for human inspection.
- Do NOT inline a raw `rmSync` / `jj workspace forget` body — always call the helper (Pitfall 11 — single owner).
- Do NOT call the helper via the CLI bridge from TypeScript — the bridge is for bash; direct call here is cheaper and avoids the language hop (D-07).

---

### `scripts/dogfood-restore.sh` (MODIFIED — append at END)

**Analog:** the SAME file's existing structure at `scripts/dogfood-restore.sh:29, 55-61` (intra-file precedent for `set -euo pipefail` + stderr-only diagnostics)

**Why it's right:** D-11 mandates "LAST step in the script, AFTER the existing complete diagnostic echo." The file's existing 61-line shape — set-euo-pipefail, positional arg validation, two-step op-restore + tar-xf, single stderr diagnostic per phase — defines the conventions for the new step. The append-at-END placement preserves Pitfall 2's ordering invariant by construction (cleanup is downstream of tar-xf so it cannot perturb the op-restore → tar ordering that makes tar's content the authoritative final state).

**Existing tail pattern** (verbatim from `dogfood-restore.sh:55-61`):

```bash
echo "dogfood-restore: restoring op-id ${PRE_OP_ID}" >&2
jj op restore "$PRE_OP_ID"

echo "dogfood-restore: extracting ${TARBALL_PATH}" >&2
tar -xf "$TARBALL_PATH" -C .

echo "dogfood-restore: complete. Verify with: jj diff --summary && jj log -r '@-..@' --no-graph" >&2
```

**New cleanup step — appended AFTER line 61 per D-11** (with D-12 trap-and-WARN and D-13 second diagnostic — verbatim from RESEARCH §Pattern 6):

```bash
# Phase 16.02 (CLEANUP-02 / D-11/D-12/D-13): post-restore orphan-workspace
# cleanup. Idempotent — re-invoking on a clean tree returns
# {abandoned:[], failedReaped:[]}. Trap with WARN so a cleanup-only miss
# does NOT flag "restore failed" (op-restore + tar both succeeded).
CLEANUP_JSON=$(gsd-sdk query cleanup-subagent-workspaces --all-phases 2>&1 \
  || { echo "WARN: orphan cleanup failed" >&2; echo '{"abandoned":[],"failedReaped":[]}'; })
ABANDONED_COUNT=$(echo "$CLEANUP_JSON" | jq -r '.abandoned | length' 2>/dev/null || echo "?")
FAILED_COUNT=$(echo "$CLEANUP_JSON" | jq -r '.failedReaped | length' 2>/dev/null || echo "?")
echo "dogfood-restore: orphan-workspace cleanup complete (abandoned=${ABANDONED_COUNT}, failedReaped=${FAILED_COUNT})" >&2
```

**Existing conventions preserved:**
- `set -euo pipefail` at `:29` — the `|| {...}` trap on the cleanup invocation is what allows continuation past a non-zero exit without breaking the `-e` discipline (D-12).
- stderr-only diagnostics (`>&2`) — matches every existing `echo` in the script.
- No file writes into the WC (`feedback_avoid_jj_auto_tracked_output`) — output goes only to stderr; jq parses an in-memory variable.

**Anti-patterns to AVOID:**
- Do NOT insert the cleanup BETWEEN `jj op restore` and `tar -xf` — violates Pitfall 2 ordering invariant (RESEARCH §Pitfall 5).
- Do NOT remove the `|| {...}` trap — `set -euo pipefail` would halt the script on a non-zero exit from the bridge, misleadingly signaling "restore failed" (D-12 / RESEARCH §Pitfall 5).
- Do NOT use `git` anywhere in this script — `feedback_avoid_jj_auto_tracked_output` + `project_no_raw_git`.
- Do NOT write a JSON file under `.planning/` or `.claude/` — output stays in-process per `feedback_avoid_jj_auto_tracked_output`.

---

### `.github/workflows/parallel-e2e.yml` (MODIFIED — new step + paths-filter)

**Analog:** the SAME file's existing audit step at `.github/workflows/parallel-e2e.yml:125-127` (intra-file precedent)

**Why it's right:** CF-05 mandates "adjacent to the existing `audit-workflow-raw-git.cjs` CI-06 step." The audit step's shape (5-line `shell: bash` + `run: node scripts/...`) is the exact template; the new step swaps the script path.

**Existing audit step** (verbatim from `.github/workflows/parallel-e2e.yml:121-127`):

```yaml
# CI-06: the milestone-completeness regression guard. The audit carries a
# frozen 127-hit baseline of raw-git in workflow markdown and exits
# non-zero only when a scanned file's count EXCEEDS its baseline — i.e.
# NEW raw-git was added. A non-zero exit fails this cell.
- name: Audit — raw git in workflow markdown (CI-06)
  shell: bash
  run: node scripts/audit-workflow-raw-git.cjs
```

**New step — inserted after line 127 per CF-05** (mirror shape):

```yaml
# LINT-06 / Phase 16.01: enforce dispatch <-> fan-in pairing presence in
# bash/sh/zsh fences under get-shit-done/workflows/. FILE-level scope per
# D-01; default-deny + per-entry allowlist via scripts/lib/allowlist-parser.cjs.
# CI-only (NOT promoted to npm pretest per CF-05).
- name: Lint — workflow call-presence (LINT-06)
  shell: bash
  run: node scripts/lint-vcs-parallel-call-presence.cjs
```

**paths-filter addition — per RESEARCH Open Q2 recommendation** (mirror line 40 audit entry):

Existing block at `.github/workflows/parallel-e2e.yml:36-42`:

```yaml
paths:
  - 'sdk/src/vcs/**'
  - 'sdk/src/query/workspace-parallel-*.ts'
  - 'get-shit-done/workflows/**'
  - 'scripts/audit-workflow-raw-git.cjs'
  - 'scripts/e2e-parallel-phase.sh'
  - '.github/workflows/parallel-e2e.yml'
```

Add (between the audit entry and e2e-parallel-phase entry):

```yaml
  - 'scripts/lint-vcs-parallel-call-presence.cjs'
  - 'scripts/lint-vcs-parallel-call-presence.allow.json'
```

**Blocking-guarantee remains via existing `parallel-e2e-gate`** (`.github/workflows/parallel-e2e.yml:136-161`) — no change needed; the new step runs inside the existing `parallel-e2e` matrix job and inherits the jj-colocated blocking discipline automatically (CF-05).

**Anti-patterns to AVOID:**
- Do NOT combine the new step with the existing audit step into one `run:` block — CF-05 mandates "adjacent" (separate steps give clearer failure attribution per RESEARCH §Alternatives Considered line 132).
- Do NOT add a separate `parallel-e2e-gate-lint` job — the existing gate already covers it.
- Do NOT add the new step outside the `parallel-e2e` job — it must run on the jj-colocated cell for the blocking guarantee to apply.

---

### `sdk/src/query/command-static-catalog-domain.ts` (MODIFIED — three-site reg site 1)

**Analog:** the SAME file's cancel verb registration at `:23, 78-79`

**Pattern** (mirror lines 23 + 78-79):

```typescript
// At line 23 (import block):
import { cleanupSubagentWorkspacesQuery } from './cleanup-subagent-workspaces.js';

// In DOMAIN_STATIC_CATALOG array (insert after the cancel entries at :78-79):
// Phase 16.02 (CLEANUP-02): cleanup verb — orphan jj-workspace dir reap.
['cleanup-subagent-workspaces', cleanupSubagentWorkspacesQuery],
```

Note: cancel has both dot and space-alias forms (`'workspace.parallel.cancel'` + `'workspace parallel.cancel'`) because the verb is multi-word with a dot/space convention. `cleanup-subagent-workspaces` is single-word-with-hyphens (like `worktree.cleanup-wave` at `:67-68`), so it gets ONE entry. The planner should mirror the hyphen-vs-dot precedent already in the file.

---

### `sdk/src/query/command-manifest.non-family.ts` (MODIFIED — three-site reg site 2)

**Analog:** cancel verb at `:63`

**Pattern** (mirror line 63):

```typescript
// Insert in the same block (after the cancel entry at :63):
{ canonical: 'cleanup-subagent-workspaces', aliases: [], mutation: true,  outputMode: 'json' },
```

`mutation: true` because the verb mutates filesystem state (rmSync the workspace dirs). `outputMode: 'json'` because the envelope is structured `{abandoned, failedReaped}`.

---

### `sdk/src/query/command-aliases.generated.ts` (MODIFIED — three-site reg site 3)

**Analog:** cancel verb at `:156`

**Pattern** (mirror line 156):

```typescript
{ canonical: 'cleanup-subagent-workspaces', aliases: [], mutation: true },
```

This file's header says "GENERATED FILE" — RESEARCH Open Q1 recommendation: planner runs `grep -r "command-aliases.generated"` to find the regenerator; if regeneration is wired into `pnpm run build:sdk`, use that; if not, hand-edit. Either way, the entry MUST land or runtime verb resolution fails (Pitfall 6).

**Anti-patterns to AVOID at all 3 sites:**
- Do NOT skip any site — Pitfall 6 / Phase 11 plan 02 documented the failure mode.
- Do NOT register under `workspace.parallel.*` namespace — the verb is NOT a `VcsAdapter` method; it's a phase-level cleanup helper bridged for bash. Mirror the `worktree.cleanup-wave` precedent (single-word with hyphens, no dot-namespace).

---

### `sdk/src/vcs/__tests__/cmd-parallel-jj.test.ts` (AUGMENTED — D-15 new `it` block)

**Analog:** the SAME file's existing N=2/3/4 clean-path describe at `:97-215` (intra-file augment) + the assertion shape from sibling `cmd-parallel-cancel-jj.test.ts:118-121`

**Why it's right:** RESEARCH Open Q3 recommends adding new `it` block(s) inside the existing N=2/3/4 describe to reuse the fixture setup. The post-clean-fanIn assertion is mechanically identical to the cancel test's post-cancel assertion — same `existsSync(ws.path) === false` shape; different lead-in operation (clean fanIn vs cancel).

**Imports already in place** (verified at `cmd-parallel-jj.test.ts:30-34`):

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createJjAdapter } from '../backends/jj.js';
```

**New `it` block — append inside the existing N=2/3/4 describe** (mirror existing `it` shape at `:126-212`, then add the no-orphan assertion AFTER the existing `divergent()` check at `:211`):

```typescript
it(`N=${N}: clean fanIn reaps all subagent workspace dirs (CLEANUP-02 D-15)`, { timeout: 30000 }, () => {
  // ... mirror dispatch + clean-work setup from :131-167 (the existing scenario already does this)
  const result = vcs.workspace.parallel.fanIn(handle, handle.workspaces.map(w => ({ agentId: w.agentId, exitCode: 0 })));
  expect(result.conflicted).toBe(false);

  // CLEANUP-02 D-15: post-clean-fanIn assertion (mirror cmd-parallel-cancel-jj.test.ts:118-121)
  for (const ws of handle.workspaces) {
    expect(existsSync(ws.path)).toBe(false);
  }
});
```

**Conflicted-branch inverse assertion — D-15 / Pitfall 2 (AP-5) — append to the existing conflicted describe at `:225+`** (mirror conflicted-scenario shape):

```typescript
// CF-03 / AP-5: conflicted-branch workspaces are PRESERVED for human inspection.
for (const ws of handle.workspaces) {
  expect(existsSync(ws.path)).toBe(true);  // OPPOSITE of clean-path assertion
}
```

**Assertion shape pattern** (verbatim from `cmd-parallel-cancel-jj.test.ts:118-121`):

```typescript
// Post-{op}: all workspace dirs gone (clean) or preserved (conflicted).
for (const ws of handle.workspaces) {
  expect(existsSync(ws.path)).toBe(false);  // or .toBe(true) on conflicted branch
}
```

**Pattern A (`describe.sequential.skipIf(!jjAvailable)`)** already in place; nothing to change. Pattern B (`mkdtemp`-per-describe) already in place via `setupJjRepo()` at `:49-65`.

**Anti-patterns to AVOID (per `cmd-parallel-cancel-jj.test.ts:5-10` D-15 structural rules):**
- Do NOT add retry config — D-15.
- Do NOT use skip modifier on describe/it/test — D-15.
- Do NOT create a separate per-test mkdtemp (the describe already owns one via `beforeAll`).
- Do NOT add the no-orphan assertion to the conflicted scenario without inverting the polarity — Pitfall 2 (AP-5) means conflicted workspaces MUST persist on disk.

---

### `sdk/src/vcs/__tests__/cmd-parallel-git.test.ts` (AUGMENTED — D-15 git-cell regression test)

**Analog:** same shape as the jj-side augmentation above; git-cell already-correct behavior just needs a regression guard

**Why it's right:** Per CONTEXT D-15: "Git-cell coverage is included per ROADMAP SC3 wording 'cross-backend test ... covers both jj-cell and git-cell paths' — git's existing `worktree remove --force` already handles teardown so the assertion just confirms no regression on git side."

**Pattern:** copy the assertion shape from the jj-side augmentation above into the existing git-side clean-path describe. The pre-condition `existsSync === true` pre-fanIn + post-condition `existsSync === false` post-clean-fanIn pair holds on git-side by virtue of `git worktree remove --force` already running in the git-side fanIn path.

**Anti-patterns to AVOID:**
- Do NOT add a `cleanupSubagentWorkspaces` call on the git side — the helper is jj-specific (`sdk/src/vcs/jj/workspace-cleanup.ts`). Git's existing `worktree remove --force` is the equivalent (Phase 15 deferred-ideas: "Promote `cleanupSubagentWorkspaces` to a cross-backend helper — defer until git-side orphan-dirs become a problem").
- Do NOT skip git-cell coverage entirely — ROADMAP SC3 mandates cross-backend.

---

## Shared Patterns

### Default-deny lint shape (Plan 16.01)

**Source:** `scripts/lint-vcs-no-raw-git.cjs`
**Apply to:** the new lint at `scripts/lint-vcs-parallel-call-presence.cjs`

Default-deny posture: walk all candidate files; check allowlist; on miss, scan; on violation, exit 1 with file:line stderr diagnostics. NEVER warn-only mode (Pitfall 4 / Pitfall 12 / `feedback_solo_dev_no_expires`).

```javascript
const files = [];
findFiles(SCAN_ROOT, files);
const violations = files.map(checkFile).filter(Boolean);
if (violations.length === 0) {
  console.log('ok ' + SCRIPT_NAME + ': ' + files.length + ' files scanned, 0 violations');
  process.exit(0);
}
// ... per-violation stderr emit
process.exit(1);
```

### Per-entry allowlist (Plan 16.01)

**Source:** `scripts/lib/allowlist-parser.cjs::parseAllowlist` (lines 34-61)
**Apply to:** the new allowlist at `scripts/lint-vcs-parallel-call-presence.allow.json` AND consumed by the new lint script

Every allowlist entry MUST satisfy: exactly one of `{path, glob}`, AND BOTH `reason` and `owner` as non-empty strings. NO `expires` field (`feedback_solo_dev_no_expires`).

```javascript
const ALLOW = parseAllowlist(
  require('./<lint-name>.allow.json'),
  '<lint-name>',
);
const ALLOW_FILES = ALLOW.files;
const ALLOW_GLOB_REGEXES = ALLOW.globRegexes;
function isAllowed(rel) {
  if (ALLOW_FILES.has(rel)) return true;
  for (const re of ALLOW_GLOB_REGEXES) if (re.test(rel)) return true;
  return false;
}
```

### Pattern B `mkdtemp` test isolation (Plans 16.01 + 16.02)

**Source:** `tests/lint-vcs-no-raw-git-fixture.test.cjs:36-54` (lint fixture) + `sdk/src/vcs/__tests__/cmd-parallel-cancel-jj.test.ts:49-65` (jj fixture)
**Apply to:** all new test files (D-14, D-15, D-16)

Random-prefix `mkdtempSync`, per-test (or per-describe) fixture creation, always `rmSync` cleanup in `finally` (node:test) or `afterAll` (vitest). No shared state; no flake budget; no suite-level disabling.

```javascript
// node:test pattern (tests/scripts/, tests/cli-*.test.cjs)
const fixDir = fs.mkdtempSync(path.join(os.tmpdir(), '__<scope>-fixture-'));
try {
  // ... fixture setup + assertions
} finally {
  fs.rmSync(fixDir, { recursive: true, force: true });
}

// vitest pattern (sdk/src/vcs/__tests__/) — Pattern A + B together
describe.sequential.skipIf(!jjAvailable)('...', () => {
  let dir: string;
  beforeAll(() => { dir = setupJjRepo(); });
  afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });
  // ... it blocks
});
```

### Inline argv walk for CLI bridges (Plan 16.02)

**Source:** `sdk/src/query/workspace-parallel-cancel.ts:54-64` (cancel bridge)
**Apply to:** the new `sdk/src/query/cleanup-subagent-workspaces.ts` bridge

VERIFIED via Bash: `sdk/src/query/cli/argv.ts` does NOT exist (RESEARCH §Don't Hand-Roll). No shared argv parser is available; bridges all use inline argv walks.

```typescript
let cwd = projectDir;
let <flag1>: <type> | undefined;
let <flag2> = false;  // bare boolean
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--cwd' && args[i + 1]) { cwd = args[++i]; }
  else if (args[i] === '--<flag1>' && args[i + 1]) { <flag1> = <parse>(args[++i]); }
  else if (args[i] === '--<flag2>') { <flag2> = true; }
}
```

### Structured error envelopes for CLI bridges (Plan 16.02)

**Source:** `sdk/src/query/workspace-parallel-cancel.ts:66-68, 74-82`
**Apply to:** the new bridge's error paths

NEVER `process.exit(1)` with a bare string. ALWAYS return `{ data: { ok: false, reason: '<snake_case>' } }`. Optional `error: <message>` for parse-failure surfaces.

```typescript
return { data: { ok: false, reason: 'phase_or_all_phases_required' } };
return { data: { ok: false, reason: 'phase_and_all_phases_mutually_exclusive' } };
return { data: { ok: false, reason: 'invalid_phase_number' } };
```

### Three-site bridge registration (Plan 16.02)

**Source:** `sdk/src/query/workspace-parallel-cancel.ts:20-27` (self-documentation block) + cancel verb's three-site presence at the catalog/manifest/aliases triplet
**Apply to:** the new bridge's registration

Every new CLI bridge MUST land at all three of:
1. `sdk/src/query/command-static-catalog-domain.ts` — handler map (Phase 15 cancel: `:23, 78-79`)
2. `sdk/src/query/command-manifest.non-family.ts` — manifest descriptor (Phase 15 cancel: `:63`)
3. `sdk/src/query/command-aliases.generated.ts` — alias table (Phase 15 cancel: `:156`)

Missing any one site → runtime "verb not found" error (Pitfall 6 / Phase 11 plan 02 audit).

### Single-owner cleanup helper (Plan 16.02)

**Source:** `sdk/src/vcs/jj/workspace-cleanup.ts::cleanupSubagentWorkspaces` (LOCKED Phase 15.04 at `:134`)
**Apply to:** BOTH the fanIn clean-path call site at `sdk/src/vcs/jj/parallel.ts` (clean-path `else` branch around `:411-461`) AND the new CLI bridge `sdk/src/query/cleanup-subagent-workspaces.ts`

Pitfall 11 / IP-5 single-owner mitigation: NEVER inline the `jj workspace forget + rmSync` body. ALWAYS import and call the helper. Three consumers, one owner. The fanIn clean-path uses the TS-direct form (handle.workspaces in scope, cheaper); the CLI bridge wraps `--all-phases` enumeration around the helper for bash consumers.

```typescript
import { cleanupSubagentWorkspaces } from './workspace-cleanup.js';  // (or '../vcs/jj/workspace-cleanup.js' from query/)

const { abandoned, failedReaped } = cleanupSubagentWorkspaces(
  mainRepoRoot,
  phaseNumber,                      // or handle.phaseNumber from fanIn
  handle?.workspaces,               // Handle-authoritative when available; undefined → helper falls back to readdirSync
);
```

### Conflicted-branch preservation (Plan 16.02 — CRITICAL)

**Source:** CONTEXT CF-03 + ROADMAP SC4 + PITFALLS.md AP-5 + W3 (a) joint-assertion contract
**Apply to:** ONLY the clean-path `else` branch in `performJjParallelFanIn`

The conflicted branch in `parallel.ts:394-410` MUST NOT call `cleanupSubagentWorkspaces` and MUST NOT `rmSync` any workspace dir. Workspaces persist on disk for human inspection. Inline comment cross-reference per ROADMAP SC4 is the documentation surface.

### `set -euo pipefail` + stderr-only diagnostics (Plan 16.02)

**Source:** `scripts/dogfood-restore.sh:29` (set discipline) + every `echo` in the file (all `>&2`)
**Apply to:** the new D-11/D-12/D-13 cleanup step inside the same script

```bash
set -euo pipefail     # already at :29 — do not change
# Bridge invocation MUST be trap-wrapped (|| {...}) so non-zero exit does NOT
# halt the script. Cleanup is recovery hygiene, not blocking.
COMMAND_OUTPUT=$(some-command 2>&1 || { echo "WARN: ..." >&2; echo '<fallback>'; })
echo "diagnostic" >&2
```

NEVER write output files into the colocated jj working tree (`feedback_avoid_jj_auto_tracked_output`). All output stays in-process variables + stderr.

### Security defenses for file walkers + CLI input (both plans)

**Source:** `scripts/audit-workflow-raw-git.cjs:102` (symlink skip) + `scripts/lint-vcs-no-raw-git.cjs:35, 41` (path-resolve) + ASVS V12 / V5 per RESEARCH §Security Domain
**Apply to:** the new lint walker + the new bridge's input validation

```javascript
// Lint walker — T-13-04 defense-in-depth (verbatim from audit-workflow-raw-git.cjs:102)
if (entry.isSymbolicLink()) continue;

// Lint argv — path-canonicalize (verbatim from lint-vcs-no-raw-git.cjs:35, 41)
if (argv[i] === '--scan-root' && argv[i + 1]) { out.scanRoot = argv[i + 1]; i += 1; }
const SCAN_ROOT = ARGV.scanRoot ? path.resolve(ARGV.scanRoot) : REPO_ROOT;

// Bridge --phase — NaN/Infinity/negative guard (ASVS V5)
phase = Number(args[++i]);
if (phase !== undefined && (Number.isNaN(phase) || !Number.isInteger(phase) || phase < 0)) {
  return { data: { ok: false, reason: 'invalid_phase_number' } };
}

// Bridge --all-phases regex — strict anchor prevents path injection (ASVS V12)
const WORKSPACE_NAME_RE = /^phase-(\d+)-subagent-\d+$/;
```

## No Analog Found

None. Every Phase 16 file has a strong, repo-local analog. The phase is "pure wiring of locked contracts" per RESEARCH §Don't Hand-Roll line 564 — no greenfield architectural design left.

## Metadata

**Analog search scope:**
- `/Users/LoganDark/Documents/Projects/get-shit-done/scripts/` (lints, fence walkers, allowlists, dogfood scripts, allowlist parser)
- `/Users/LoganDark/Documents/Projects/get-shit-done/sdk/src/query/` (CLI bridges, three-site registration files)
- `/Users/LoganDark/Documents/Projects/get-shit-done/sdk/src/vcs/jj/` (workspace-cleanup helper, parallel.ts fanIn + cancel sites, octopus name canonical)
- `/Users/LoganDark/Documents/Projects/get-shit-done/sdk/src/vcs/__tests__/` (cross-backend test files, vcs-fixture)
- `/Users/LoganDark/Documents/Projects/get-shit-done/tests/` + `/Users/LoganDark/Documents/Projects/get-shit-done/tests/scripts/` (node:test fixture patterns)
- `/Users/LoganDark/Documents/Projects/get-shit-done/.github/workflows/parallel-e2e.yml` (CI step site)
- `/Users/LoganDark/Documents/Projects/get-shit-done/.planning/phases/16-workflow-invariant-tooling/` (CONTEXT + RESEARCH for locked decisions)

**Files scanned:** 14 (read in full or targeted offset/limit)
**Pattern extraction date:** 2026-05-24
**Source-of-truth locks reinforced:**
- CF-01 (helper signature): `sdk/src/vcs/jj/workspace-cleanup.ts:134` — 3-arg form with `workspaces?` override
- CF-02 (three-site bridge): `command-static-catalog-domain.ts:23,78-79`; `command-manifest.non-family.ts:63`; `command-aliases.generated.ts:156`
- CF-03 (conflicted-branch UNCHANGED): `sdk/src/vcs/jj/parallel.ts:394-410`
- CF-04 (lint shape + allowlist schema): `scripts/lint-vcs-no-raw-git.cjs` + `scripts/lib/allowlist-parser.cjs`
- CF-05 (CI placement): `.github/workflows/parallel-e2e.yml:125-127`
- CF-06 (fence regex byte-identical): `scripts/audit-workflow-raw-git.cjs:48-49`
- D-11/12/13 (dogfood-restore.sh ordering): `scripts/dogfood-restore.sh:29, 55-61`
- D-15 (cross-backend test): `sdk/src/vcs/__tests__/cmd-parallel-cancel-jj.test.ts:118-121` (assertion shape)
