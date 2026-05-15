# Phase 8: Unified Revision Model — Audit → Test-Prep → Flip → Lint Guard → Close-Gate - Pattern Map

**Mapped:** 2026-05-14
**Files analyzed:** 7 new files + ~36 modified files (7 jj.ts template sites + 3 NDJSON parsers + 2 type renames + ~12 production consumers + ~11 test consumers + 1 rewriter.ts + 2 allowlist files + 1 vitest.config + 1 workflow yml + 1 REQUIREMENTS.md)
**Analogs found:** 7/7 new files have strong in-repo analogs; all modified files are own-codebase rewrites with explicit precedent for the rename + flip pattern

---

## File Classification

### New files (Plan 1 + Plan 2 + Plan 3)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `scripts/audit-id-namespace.cjs` | audit script | read-only walker | `scripts/audit-workflow-script-paths.cjs` | exact role + exact data-flow (regex+walker, `Object.freeze` enum, pure unit-testable function) |
| `.planning/intel/id-namespace-audit.md` | audit output doc | static doc | `.planning/intel/vcs-adapter-surface-audit.md` | exact role (verdict-legend audit doc) |
| `.planning/intel/id-namespace-audit.json` | JSON sidecar | one-shot emission | no precedent in `scripts/audit-workflow-script-paths.cjs` (which only returns findings programmatically) | role-only; planner creates the schema from D-01 spec |
| `scripts/lint-vcs-no-commit-id.cjs` | lint script | read-only scanner + CI fail | `scripts/lint-vcs-no-raw-git.cjs` | exact role + exact data-flow (~80% copy-paste per CONTEXT) |
| `scripts/lint-vcs-no-commit-id.allow.json` | allowlist JSON | static config | `scripts/lint-vcs-no-raw-git.allow.json` (after D-03 migration) | exact role; new schema is the migration target |
| `tests/__tools__/vitest-matchers.ts` | custom matcher impl | runtime registration | no existing `expect.extend` usage in repo (verified via `rg expect.extend`) | role-only; vitest 3 docs are the source — RESEARCH §Pattern 2 has full code |
| `tests/__tools__/vitest.d.ts` | TS ambient module augmentation | compile-time only | no existing ambient `.d.ts` in tests (verified via `find -name "*.d.ts"`) | role-only; vitest 3 docs are the source — RESEARCH §Pattern 2 has full code |

### Modified files (Plan 2 + Plan 3)

| File | Role | Data Flow | Modification Type |
|------|------|-----------|-------------------|
| `sdk/src/vcs/backends/jj.ts` | VCS backend impl | jj process invocation | 7 template-string flips (lines 222-227, 946, 965, 978) + 1 PITFALL 1 doc inversion (line 327) + local var rename (line 228, 236) |
| `sdk/src/vcs/parse/jj-log.ts` | NDJSON parser | jj stdout → typed record | 1 type field flip (line 26: `commit_id?` → `change_id?`) + 1 read flip (line 56: `record.commit_id` → `record.change_id`) |
| `sdk/src/vcs/parse/jj-workspace-list.ts` | NDJSON parser | jj stdout → typed record | 1 nested type flip (line 28: `target?: { commit_id?: string }` → `target?: { change_id?: string }`) + 1 read flip (line 46) |
| `sdk/src/vcs/parse/jj-bookmark.ts` | NDJSON parser | jj stdout → typed record | template emission flip + JSDoc update (lines 19-21 fixture-shape comment) |
| `sdk/src/vcs/types.ts` | type definition | compile-time only | rename `CommitResult.hash` → `.id` (line 91) + rename `LogEntry.hash` → `.id` (lines 109-116) + JSDoc add (D-05) |
| `sdk/src/query/log.ts` | query consumer | type-driven | line 72: `entries[n].hash` → `entries[n].id` (flip-clean rename) |
| `sdk/src/query/verify.ts` | query consumer | type-driven | line 683: `(e.hash \|\| '').slice(0, 7)` → `(e.id \|\| '').slice(0, 7)` (or `vcs.refs.resolveShort`) |
| `sdk/src/query/mutation-event-mapper.ts` | event mapper | type-driven | line 68: `data?.hash` field rename (event-type field — consider in-band fold-in) |
| `sdk/src/query-raw-output-projection.ts` | raw output projector | type-driven | line 23: `d.hash` rename |
| `sdk/src/query/intel.ts` | query consumer | type-driven (verify-in-audit) | line 160: `snapshot.hashes` — NOT `LogEntry.hash` consumer per RESEARCH Consumer Sweep row 12 |
| `sdk/src/vcs/format-migration/run.ts` | migration orchestrator | structured-store writer | lines 152, 335: `commitHash:` field name rename to `commitId:` (RESEARCH `<deferred>` fold-in) |
| `sdk/src/vcs/format-migration/orphan.ts` | migration walker | type-driven | lines 77, 103: `parents[0].hash` / `c.hash` rename |
| `get-shit-done/bin/lib/verify.cjs` | CJS-runtime consumer | type-driven (grep-only — no compiler) | line 1296: `(e.hash \|\| '').slice(0, 7)` rename — grep-only catch |
| `get-shit-done/bin/lib/commands.cjs` | CJS-runtime consumer | type-driven (grep-only) | line 507: `v.hash \|\| 'skip'` rename |
| `sdk/src/vcs/format-migration/rewrite.ts` | rewriter (close-gate) | structured-store rewriter | extend `COMMIT_KEY_ALLOWLIST` if AUDIT-04 finds new commit-bearing frontmatter keys (lines 73-86) |
| `sdk/src/vcs/__tests__/cmd-import-jj.test.ts` | test | parameterized fixture | line 114: rename + upgrade to `toBeIdOf` |
| `sdk/src/vcs/__tests__/cmd-map-codebase-jj.test.ts` | test | parameterized fixture | line 91: rename + upgrade |
| `sdk/src/vcs/__tests__/cmd-pause-work-jj.test.ts` | test | parameterized fixture | line 77: rename + upgrade |
| `sdk/src/vcs/__tests__/cmd-plan-phase-jj.test.ts` | test | parameterized fixture | lines 61, 62: `.parentChange` / `.mergeChange` keep as presence checks |
| `sdk/src/vcs/__tests__/git-backend.test.ts` | test | parameterized fixture | lines 51, 66, 89, 178: rename + upgrade to `toBeIdOf('git')` |
| `sdk/src/vcs/__tests__/jj-hooks.test.ts` | test | parameterized fixture | line 140: rename + upgrade |
| `sdk/src/vcs/__tests__/jj-workspace.test.ts` | test | parameterized fixture | line 417: hex regex → `toBeIdOf('jj')` |
| `sdk/src/query/commit.test.ts` | test | unit | lines 170, 182: rename + upgrade |
| `sdk/vitest.config.ts` | test runner config | compile-time | add `setupFiles: [matchersPath]` to both unit + integration projects (D-02a) |
| `scripts/lint-vcs-no-raw-git.allow.json` | allowlist JSON | static config | full schema migration to per-entry `{path \| glob, reason, owner}` (D-03) |
| `.github/workflows/test.yml` | CI pipeline | one-shot CI step | add lint step parallel to existing `lint-vcs-no-raw-git` (line 68-70) |
| `.planning/REQUIREMENTS.md` | spec doc | static doc | update TEST-12 + LINT-02 text (D-02b + D-04) |

---

## Pattern Assignments

### `scripts/audit-id-namespace.cjs` (audit script, read-only walker)

**Analog:** `scripts/audit-workflow-script-paths.cjs` (73 LOC, cited by CONTEXT canonical refs and RESEARCH §Pattern 1)

**Imports pattern** (lines 1-2, 16-17):
```javascript
'use strict';

const fs = require('node:fs');
const path = require('node:path');
```

**Closed verdict enum pattern** (lines 19-22):
```javascript
const AUDIT_FINDING = Object.freeze({
  MISSING_FROM_REPO: 'missing_from_repo',
  NOT_INSTALLED: 'not_installed',
});
```

**Adapt to** (per RESEARCH §Pattern 1, the 7-value verdict enum):
```javascript
const AUDIT_VERDICT = Object.freeze({
  SAFE: 'safe',
  FLIP_CLEAN: 'flip-clean',
  NEEDS_RENAME: 'needs-rename',
  NEEDS_RESOLVE_SHORT: 'needs-resolveShort',
  BOUNDARY_IO: 'boundary-io',
  HISTORICAL_PROSE: 'historical-prose',
  UNCLEAR: 'unclear',
});
```

**Stateful module-scoped regex pattern** (line 27, with `/g` reset idiom at line 41):
```javascript
const REF_RE = /\$\{GSD_HOME(?::-[^}]*)?\}\/([A-Za-z0-9_./-]+\.(?:cjs|js|sh))/g;
// ...
function extractReferences(content) {
  const out = [];
  let m;
  // RegExp objects with /g state must be reset per call.
  const re = new RegExp(REF_RE.source, 'g');
  while ((m = re.exec(content)) !== null) {
    out.push(m[1]);
  }
  return out;
}
```

**Pure-function classifier pattern** (lines 48-71):
```javascript
function auditWorkflowScriptPaths({ workflowsDir, repoRoot, installedPrefixes }) {
  const findings = [];
  const installedSet = new Set(installedPrefixes);
  for (const file of listWorkflowFiles(workflowsDir)) {
    const content = fs.readFileSync(file, 'utf8');
    const workflow = path.basename(file);
    for (const ref of extractReferences(content)) {
      // ... emit findings ...
    }
  }
  return { ok: findings.length === 0, findings };
}

module.exports = { auditWorkflowScriptPaths, AUDIT_FINDING, extractReferences };
```

**Walker pattern** (lines 29-35 — adapt for recursive directory walk):
```javascript
function listWorkflowFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => path.join(dir, e.name));
}
```

**Planner adaptations needed:**
- Adapt the flat-directory walker to a **recursive** walker (mirror `findFiles` from `scripts/lint-vcs-no-raw-git.cjs:141-150` — already cited in RESEARCH "Don't Hand-Roll" table). Same `SKIP_DIRS` set (`node_modules`, `.git`, `.jj`, `dist`, `dist-cjs`, `.pnpm-store`).
- Replace the single `REF_RE` with the `PATTERNS` array from RESEARCH §Pattern 1 (8 regex/kind pairs covering `'commit_id'` literal, `.commit_id` field, `LogEntry.hash`, `CommitResult.hash`, `.hash`, hex regex, 40-char hex literal, `.slice(0, 7|8|12)`).
- Add `--json` flag handling (CLI invocation per RESEARCH §"Audit script invocation"). Default emit: human-readable `.md`. With `--json`: structured JSON sidecar per the schema RESEARCH §Pattern 1 shows.
- Scope: walk `sdk/src/`, `get-shit-done/bin/lib/`, `scripts/`, `sdk/src/vcs/__tests__/`, `tests/__tools__/`, workflow `.md`, agent prompts (per AUDIT-01..04 scopes).

---

### `.planning/intel/id-namespace-audit.md` (audit output doc, static doc)

**Analog:** `.planning/intel/vcs-adapter-surface-audit.md` (172 LOC, cited by CONTEXT canonical refs + `code_context.Reusable Assets`)

**Frontmatter pattern** (lines 1-4):
```markdown
# VcsAdapter Surface Audit — Drop Git-Only Concepts

**Authored:** 2026-05-11
**Purpose:** Pre-discuss-phase intel for the proposed Phase 2.5 (VCS Abstraction Audit). Catalogues every verb / field / factory currently on the cross-backend surface, evaluates against the architectural rule, and lists call-site impact.
```

**Verdict-legend pattern** (lines 17-21):
```markdown
Legend:
- KEEP — direct jj equivalent exists
- KEEP (reshape) — concept exists in both but current shape leaks git terminology / git-only fields
- REMOVE — no jj equivalent; fold callers into a cross-backend verb
- MOVE → gitOnly — concept is git-flavored; preserve via `vcs.gitOnly.*` narrowing
```

**Verdict table pattern** (lines 23-35):
```markdown
| Verb | Verdict | Notes | Call sites |
|------|---------|-------|------------|
| `commit(input: CommitInput)` | KEEP (reshape) | Collapse `files` / `pathspec` into single `files: string[]` per D-02 | many |
| `log(opts?: LogOpts)` | KEEP | `jj log` exists; `allRefs` maps to jj `all()` revset | many |
```

**Call-site impact summary pattern** (lines 126-148):
```markdown
## Call-site impact summary

Refactor scope by verb:

| Verb to remove/move | Callers | Refactor target |
|---------------------|---------|-----------------|
| `vcs.stage` | 34 | Fold into `vcs.commit({files})` |
| ... |
```

**Planner adaptations needed:**
- Replace the verdict legend with the 7-value `AUDIT_VERDICT` enum (SAFE / FLIP_CLEAN / NEEDS_RENAME / NEEDS_RESOLVE_SHORT / BOUNDARY_IO / HISTORICAL_PROSE / UNCLEAR — RESEARCH §Pattern 1).
- Replace verdict-by-verb table with verdict-by-`file:line` row table (one row per audit hit from the script, verdict column filled by human).
- Per-row columns: `# | File:line | Pattern (regex kind) | Today (current code) | Caller use | Verdict | Notes`.
- Keep the "Call-site impact summary" section at the bottom (aggregates verdicts into refactor scope).

---

### `.planning/intel/id-namespace-audit.json` (JSON sidecar)

**Analog:** No exact precedent — `scripts/audit-workflow-script-paths.cjs` returns findings programmatically but does not serialize them to a JSON sidecar. The schema is specified directly by RESEARCH §Pattern 1.

**Schema specified by RESEARCH §Pattern 1**:
```json
{
  "$schema_version": 1,
  "scanned_at": "2026-05-...",
  "verdicts": {
    "safe": [{ "path": "verify.cjs", "line": 90, "surface": "expr.rev(hash)", "audit_row": 1 }],
    "boundary-io": [],
    "needs-rename": [...],
    ...
  }
}
```

**Planner adaptations needed:**
- All seven verdict buckets present even when empty (lint seeder reads `verdicts['boundary-io']` regardless of population).
- `audit_row` field provides traceability back to the `.md` doc row N (Pitfall 7 mitigation — every lint allowlist entry traceable).
- Each row's `surface` is the matched regex `kind` from the `PATTERNS` array (e.g., `literal_commit_id`, `hash_field_access`, `40_char_hex_literal`).
- Each row's `callerUse` is the trimmed line content (preview ≤ 200 chars — mirrors `lint-vcs-no-raw-git.cjs:173` snippet shape).

---

### `scripts/lint-vcs-no-commit-id.cjs` (lint script, read-only scanner)

**Analog:** `scripts/lint-vcs-no-raw-git.cjs` (202 LOC; CONTEXT canonical refs identifies as "~80% copy-paste"; RESEARCH §Lint Script Structural Plan lists exact keep/replace/add lines)

**File header pattern** (lines 1-17):
```javascript
#!/usr/bin/env node
/**
 * lint-vcs-no-raw-git.cjs (Phase 1 plan 05, VCS-07 / D-17 / D-18)
 *
 * Enforces "no raw git anywhere" — default-deny scanner across the whole repo.
 * ...
 * Inline escape: add `// vcs-lint:allow-git-here <reason>` on the offending line.
 *
 * Exit 0 = clean. Exit 1 = violations (with file:line diagnostics).
 */
```

**`parseArgv` + `--scan-root` seam** (lines 31-40):
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

**Allowlist loader pattern** (lines 42-48):
```javascript
const ALLOW = require('./lint-vcs-no-raw-git.allow.json');
const ALLOW_FILES = new Set(ALLOW.files || []);
const ALLOW_GLOBS = ALLOW.globs || [];
// WR-11: support both JS-style (`//`) and shell-style (`#`) line annotations
const ALLOW_LINE_ANNOTATION = /(?:\/\/|#)\s*vcs-lint:allow-git-here\s*\S/;
```

**Adapt to** (D-03 + D-04 per-entry schema; ALLOW_LINE_ANNOTATION verb change):
```javascript
const { parseAllowlist } = require('./lib/allowlist-parser');  // NEW shared module (D-03)
const ALLOW = parseAllowlist(require('./lint-vcs-no-commit-id.allow.json'), 'lint-vcs-no-commit-id');
const ALLOW_LINE_ANNOTATION = /(?:\/\/|#)\s*vcs-lint:allow-commit-id-here\s*\S/;
```

**Pattern table** (lines 59-69 — replace with COMMIT_ID_PATTERNS per RESEARCH §"Replace"):
```javascript
const GIT_PATTERNS = [
  { re: /spawnSync\s*\(\s*['"]git['"]/, label: "spawnSync('git', …)" },
  // ...
];
```

**Adapt to** (per RESEARCH §"Replace"):
```javascript
const COMMIT_ID_PATTERNS = [
  { re: /['"`]commit_id['"`]/, label: "literal 'commit_id' string" },
  { re: /['"`]commit_id\.short(?:est)?\(\)['"`]/, label: "literal 'commit_id.short()' / '.shortest()' template" },
  { re: /\.commit_id\b/, label: ".commit_id field access" },
  { re: /\/\^?\[0-9a-f\]\{[0-9]+(?:,[0-9]+)?\}/, label: "hex-shape regex literal" },
  { re: /['"][0-9a-f]{40}['"]/, label: "40-char hex string literal" },
];
```

**`globToRegExp` translator** (lines 87-132):
```javascript
function globToRegExp(glob) {
  // WR-10:
  //   - `**/` (intermediate)  → `(?:[^/]+/)*` — zero or more full path components.
  //   - `**` at end-of-pattern → `.+` (require at least one char).
  //   - Defensively escape `-`.
  let re = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      // ... full impl (45 LOC)
    }
    // ...
  }
  return new RegExp('^' + re + '$');
}
```

**Extract to** `scripts/lib/glob-to-regex.cjs` (D-03 — shared between both lints, per RESEARCH §"Keep (~80% copy-paste)" final bullet).

**Walker pattern** (lines 141-150):
```javascript
function findFiles(dir, results) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findFiles(full, results);
    else if (entry.isFile() && SCAN_EXT.test(entry.name)) results.push(full);
  }
}
```

**SKIP_DIRS + SCAN_EXT** (lines 50-57 — note RESEARCH §"Replace" narrows SCAN_EXT):
```javascript
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.jj', 'dist', 'dist-cjs', '.pnpm-store',
]);
const SCAN_EXT = /\.(cjs|js|mjs|ts|yml|yaml|sh|bash)$/;
```

**Adapt to** (RESEARCH §"Replace" narrowing — drop yml/yaml/sh/bash; markdown excluded per LINT-04 deferred):
```javascript
const SCAN_EXT = /\.(cjs|js|mjs|ts)$/;
```

**`isAllowed` predicate** (lines 135-139 — refactor to per-entry schema):
```javascript
function isAllowed(rel) {
  if (ALLOW_FILES.has(rel)) return true;
  for (const re of ALLOW_GLOB_REGEXES) if (re.test(rel)) return true;
  return false;
}
```

**Adapt to** (per-entry schema returns `{files: Set, globRegexes: RegExp[]}` from shared parser).

**`checkFile` violation collector** (lines 152-178):
```javascript
function checkFile(filepath) {
  const rel = path.relative(SCAN_ROOT, filepath).split(path.sep).join('/');
  if (isAllowed(rel)) return null;
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');
  const hits = [];
  // ... scan per line, push hits
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (ALLOW_LINE_ANNOTATION.test(line)) continue;
    for (const { re, label } of patterns) {
      if (re.test(line)) hits.push({ line: i + 1, label, snippet: line.trim().slice(0, 200) });
    }
  }
  if (hits.length === 0) return null;
  return { file: rel, hits };
}
```

**Reporter pattern** (lines 184-202 — entrypoint + exit codes):
```javascript
const files = [];
findFiles(SCAN_ROOT, files);
const violations = files.map(checkFile).filter(Boolean);

if (violations.length === 0) {
  console.log('ok lint-vcs-no-raw-git: ' + files.length + ' files scanned in ' + SCAN_ROOT + ', 0 violations');
  process.exit(0);
}

const totalHits = violations.reduce((n, v) => n + v.hits.length, 0);
process.stderr.write('\nERROR lint-vcs-no-raw-git: ' + totalHits + ' violation(s) across ' + violations.length + ' file(s)\n\n');
// ... per-violation detail ...
process.stderr.write('Fix: route through the VcsAdapter (createVcsAdapter(cwd).…), or\n');
process.stderr.write('     add a "// vcs-lint:allow-git-here <reason>" annotation on the offending line, or\n');
process.stderr.write('     add the file/glob to scripts/lint-vcs-no-raw-git.allow.json with PR rationale.\n');
process.exit(1);
```

**Planner adaptations needed:**
- Drop the `SHELL_GIT_PATTERNS` block (lines 79-84) and shell-extension scan (lines 85, 162-171) — not applicable to commit_id leak per RESEARCH §"Replace".
- Update the reporter's failure-message tail to point at the new lint name + new allowlist filename.
- Failure message becomes a permanent doc-anchor for the unified revision contract (D-05 multi-anchor strategy — the message is CI-blocking, so it doubles as a discoverable contract statement).

---

### `scripts/lint-vcs-no-commit-id.allow.json` (allowlist JSON, static config)

**Analog:** `scripts/lint-vcs-no-raw-git.allow.json` — POST-D-03 migration form (the schema migration happens in the same plan)

**Per-entry schema** (specified by RESEARCH §Pattern 4):
```json
{
  "$schema_version": 2,
  "$migration_note": "Phase 8 D-03 + D-04: per-entry schema; expires field dropped (solo-dev context).",
  "entries": [
    {
      "path": "sdk/src/vcs/exec.ts",
      "reason": "VCS adapter internals — the exec wrapper that all `git` invocations route through; this IS the adapter implementation.",
      "owner": "@LoganDark"
    },
    {
      "glob": "sdk/src/vcs/__tests__/**",
      "reason": "Test fixtures — parameterized contract suite requires raw `git`/`jj` setup commands to construct test repos.",
      "owner": "@LoganDark"
    }
  ]
}
```

**Planner adaptations needed:**
- Initial population: read `.planning/intel/id-namespace-audit.json`, project `verdicts['boundary-io']` rows into entries (`audit-row-N <surface>: <callerUse>` reason). Expected verdict at research time is **ZERO boundary-io consumers** — initial `entries: []` is the expected end state.
- Owner field standardized to `@LoganDark` (single-dev repo per memory `feedback_solo_dev_no_expires`).
- Path-vs-glob mutual exclusivity enforced by the shared parser (one or the other, not both).

---

### `scripts/lib/allowlist-parser.cjs` (NEW shared module — Plan 3)

**Analog:** Inlined parsing inside `scripts/lint-vcs-no-raw-git.cjs:42-48, 135-139` (extracting to shared module per D-03)

**Specified directly by RESEARCH §Pattern 4** ("Shared parser"):
```javascript
const REQUIRED_FIELDS = ['reason', 'owner'];

function parseAllowlist(json, scriptName) {
  if (!Array.isArray(json.entries)) {
    throw new Error(`${scriptName}: allow.json missing top-level "entries" array`);
  }
  for (const e of json.entries) {
    const hasPath = typeof e.path === 'string';
    const hasGlob = typeof e.glob === 'string';
    if (!hasPath && !hasGlob) {
      throw new Error(`${scriptName}: entry missing "path" or "glob"`);
    }
    if (hasPath && hasGlob) {
      throw new Error(`${scriptName}: entry has both "path" and "glob" (pick one)`);
    }
    for (const f of REQUIRED_FIELDS) {
      if (typeof e[f] !== 'string' || !e[f].trim()) {
        throw new Error(`${scriptName}: entry missing required "${f}" field: ${JSON.stringify(e)}`);
      }
    }
  }
  return { /* compiled {files: Set, globRegexes: RegExp[]} per planner's choice */ };
}

module.exports = { parseAllowlist };
```

**Planner adaptations needed:**
- Decide compiled output shape (e.g., `{ files: Set<string>, globRegexes: RegExp[] }`) — call sites in both lints consume this.
- Import `globToRegExp` from the extracted `scripts/lib/glob-to-regex.cjs` (cross-module dependency).
- CI fail-on-missing-required-fields covered by the throw paths (`reason`, `owner` both required).
- `expires` field is **NOT** in `REQUIRED_FIELDS` (D-04).

---

### `tests/__tools__/vitest-matchers.ts` (custom matcher impl)

**Analog:** No existing `expect.extend` usage in the repo (verified). RESEARCH §Pattern 2 + D-02 / D-02a specify the implementation directly.

**Imports pattern** (specified by RESEARCH §Pattern 2):
```typescript
import { expect } from 'vitest';
import type { VcsKind } from '../../sdk/src/vcs/types.js';
```

**Matcher impl pattern** (full impl from RESEARCH §Pattern 2 lines 277-307):
```typescript
interface ToBeIdOfOpts {
  kind: VcsKind;
  allowShort?: boolean;  // accepts 7+ chars on either alphabet
}

expect.extend({
  toBeIdOf(received: unknown, kindOrOpts: VcsKind | ToBeIdOfOpts) {
    const opts: ToBeIdOfOpts = typeof kindOrOpts === 'string'
      ? { kind: kindOrOpts }
      : kindOrOpts;
    const { kind, allowShort = false } = opts;
    const min = allowShort ? 7 : (kind === 'git' ? 40 : 12);
    const max = kind === 'git' ? 40 : 32;
    const alphabet = kind === 'git' ? /^[0-9a-f]+$/ : /^[k-z]+$/;
    const isString = typeof received === 'string';
    const lengthOk = isString && received.length >= min && received.length <= max;
    const shapeOk = isString && alphabet.test(received);
    const pass = isString && lengthOk && shapeOk;
    return {
      pass,
      message: () => pass
        ? `expected ${JSON.stringify(received)} NOT to be a ${kind} id (${kind === 'git' ? '[0-9a-f]' : '[k-z]'} alphabet, ${min}-${max} chars)`
        : `expected ${JSON.stringify(received)} to be a ${kind} id (alphabet ${kind === 'git' ? '[0-9a-f]' : '[k-z]'}, ${min}-${max} chars); got ${isString ? `len=${received.length}, alphabet match=${shapeOk}` : `typeof ${typeof received}`}`,
    };
  },
});
```

**Planner adaptations needed:**
- `VcsKind` import path is `'../../sdk/src/vcs/types.js'` from `tests/__tools__/` (RESEARCH cites `.js` extension — matches the SDK's ESM-emit convention).
- `VcsKind` collapses `'jj-native'` and `'jj-colocated'` to `'jj'` for id-shape purposes (D-02 last bullet); the matcher accepts the union literal `'git' | 'jj'` directly. Open Question 1 recommendation: ship overload from day one (literal kind + options bag).
- Alphabet maxes: jj `change_id` is 12-char canonical but can extend to 32 per RESEARCH; git `commit_id` is fixed 40.

---

### `tests/__tools__/vitest.d.ts` (ambient TS module augmentation)

**Analog:** No existing ambient `.d.ts` in tests. RESEARCH §Pattern 2 specifies the impl directly.

**Module augmentation pattern** (specified by RESEARCH §Pattern 2 lines 311-322):
```typescript
// Module augmentation per vitest 3 convention
// [CITED: https://vitest.dev/guide/extending-matchers#typescript-extension]
import type { VcsKind } from '../../sdk/src/vcs/types.js';

interface CustomMatchers<R = unknown> {
  toBeIdOf(kind: VcsKind | { kind: VcsKind; allowShort?: boolean }): R;
}

declare module 'vitest' {
  interface Assertion<T = unknown> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
```

**Planner adaptations needed:**
- Verify SDK `tsconfig.json` `include` picks up this `.d.ts` ambient file (per D-02a — "picked up by the SDK's `tsconfig.json` `include`"). Plan acceptance check: `tsc --noEmit` passes from SDK root with the new matcher's calls in `*.test.ts` files.
- Both `Assertion` and `AsymmetricMatchersContaining` augmented — the latter is required for `expect.toBeIdOf(...)` use inside `expect.objectContaining({})` (the D-02 composability case).

---

### `sdk/vitest.config.ts` (MOD — add setupFiles)

**Current shape** (full file at sdk/vitest.config.ts:1-22):
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.integration.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['src/**/*.integration.test.ts'],
          testTimeout: 120_000,
        },
      },
    ],
  },
});
```

**Adapt to** (D-02a — both projects get `setupFiles`; RESEARCH §Pattern 2 lines 326-355):
```typescript
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const matchersPath = fileURLToPath(new URL('../tests/__tools__/vitest-matchers.ts', import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          setupFiles: [matchersPath],
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.integration.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          setupFiles: [matchersPath],
          include: ['src/**/*.integration.test.ts'],
          testTimeout: 120_000,
        },
      },
    ],
  },
});
```

---

### `sdk/src/vcs/types.ts` (MOD — type renames)

**Current shape** (lines 87-92, 109-116):
```typescript
export interface CommitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  hash: string | null;
}

export interface LogEntry {
  hash: string;
  parents: string[];
  author: string;
  date: string;
  subject: string;
  body?: string;
}
```

**Adapt to** (FLIP-02 + FLIP-03 hard-rename + FLIP-04 D-05 JSDoc):
```typescript
export interface CommitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /**
   * The active backend's canonical revision identifier for the newly-created commit.
   * - On git: `commit_id` (40-char hex). Snapshot-stable.
   * - On jj: `change_id` (12-char [k-z] reverse-base32). Rebase-stable.
   * Null when the commit failed.
   */
  id: string | null;
}

export interface LogEntry {
  /**
   * The active backend's canonical revision identifier.
   * - On git: `commit_id` (40-char hex). Snapshot-stable.
   * - On jj: `change_id` (12-char [k-z] reverse-base32). Rebase-stable.
   * Do NOT assume hex form. For short display, use `vcs.refs.resolveShort(expr.rev(id))`
   * (backend-aware short-prefix); never `.slice(0, 7)`.
   */
  id: string;
  parents: string[];
  author: string;
  date: string;
  subject: string;
  body?: string;
}
```

**JSDoc text source:** RESEARCH §Pattern 3 lines 405-417 — verbatim copy except the field name `id`.

---

### `sdk/src/vcs/backends/jj.ts` (MOD — 7 template flips + 1 PITFALL doc inversion)

**Analog:** This file is being modified; the "analog" is its own current state with mechanical flips.

**Current PITFALL 1 doc** (line 327):
```typescript
   * PITFALL 1: `LogEntry.hash` is `commit_id` (40-char hex), NEVER
   * `change_id` — pinned by `parseJjLog`.
```

**Adapt to** (FLIP-04 D-05 — positive contract inversion in same commit as `LogEntry.hash` → `LogEntry.id` rename):
```typescript
   * `LogEntry.id` is the active backend's canonical revision identifier —
   * `commit_id` on git, `change_id` on jj. Pinned by `parseJjLog`.
```

**Current commit() hash probe** (lines 222-227):
```typescript
    const hashArgs = jjArgv(
      'log', '-r', '@-', '-T', 'commit_id', '--no-graph', '-n', '1',
    );
```

**Adapt to** (FLIP-01 + FLIP-03):
```typescript
    const idArgs = jjArgv(
      'log', '-r', '@-', '-T', 'change_id', '--no-graph', '-n', '1',
    );
```

**Current local var** (line 228, 236):
```typescript
    let hash: string | null = null;
    // ...
    if (hashRes.exitCode === 0) {
      hash = hashRes.stdout.trim();
```

**Adapt to** (FLIP-03 — rename local var to match the renamed field):
```typescript
    let id: string | null = null;
    // ...
    if (idRes.exitCode === 0) {
      id = idRes.stdout.trim();
```

**Current resolveShort()** (lines 940-955):
```typescript
    resolveShort: (rev: RevisionExpr): string => {
      const args = jjArgv(
        'log',
        '-r',
        toJjRev(rev),
        '-T',
        'commit_id.short()',
        '--no-graph',
        '-n',
        '1',
      );
      ...
```

**Adapt to** (FLIP-01 — note: research RESEARCH "State of the Art" row 6 says `change_id.shortest()`, but `change_id.short()` is also a valid jj 0.41 template; planner picks per jj docs cited in §Sources):
```typescript
    resolveShort: (rev: RevisionExpr): string => {
      const args = jjArgv(
        'log',
        '-r',
        toJjRev(rev),
        '-T',
        'change_id.shortest()',
        '--no-graph',
        '-n',
        '1',
      );
      ...
```

**Current countCommits() + rootCommits()** (lines 965, 978 — `commit_id ++ "\\n"`):
```typescript
const args = jjArgv('log', '-r', target, '-T', 'commit_id ++ "\\n"', '--no-graph');
// ...
const args = jjArgv(
  'log',
  '-r',
  `root() & ::${target}`,
  '-T',
  'commit_id ++ "\\n"',
  '--no-graph',
);
```

**Adapt to** (FLIP-01):
```typescript
const args = jjArgv('log', '-r', target, '-T', 'change_id ++ "\\n"', '--no-graph');
// ...
const args = jjArgv(
  'log',
  '-r',
  `root() & ::${target}`,
  '-T',
  'change_id ++ "\\n"',
  '--no-graph',
);
```

---

### `sdk/src/vcs/parse/jj-log.ts` (MOD — NDJSON field flip)

**Current shape** (lines 13-16, 25-26, 55-56):
```typescript
 * PITFALL 1 (03-RESEARCH.md): `LogEntry.hash` = `commit_id` (NEVER
 * `change_id`). ...
// ...
interface RawJjLogRecord {
  commit_id?: string;
// ...
    const entry: LogEntry = {
      hash: record.commit_id ?? '',
```

**Adapt to** (FLIP-01 + FLIP-02 hard rename; risk 4 verified GREEN per RESEARCH §"jj 0.41 NDJSON Schema Probe"):
```typescript
 * `LogEntry.id` is `change_id` (k-z alphabet) on jj. Backend-canonical
 * revision identifier. ...
// ...
interface RawJjLogRecord {
  change_id?: string;
// ...
    const entry: LogEntry = {
      id: record.change_id ?? '',
```

**Note:** The existing `change_id?: string` field at line 28 is *already* declared (used elsewhere or future-proofed); the `commit_id?` at line 26 is the field being flipped. The planner's task is a swap, not a new field add.

---

### `sdk/src/vcs/parse/jj-workspace-list.ts` (MOD — NDJSON nested field flip)

**Current shape** (lines 26-29, 44-47):
```typescript
interface RawJjWorkspaceListRecord {
  name?: string;
  target?: { commit_id?: string };
}
// ...
    entries.push({
      path: record.name ?? '',
      rev: record.target?.commit_id ?? '',
      locked: false,
    });
```

**Adapt to** (FLIP-01 — note the nested type literal flips alongside the read; risk 4 verified GREEN — `target.change_id` confirmed in probe):
```typescript
interface RawJjWorkspaceListRecord {
  name?: string;
  target?: { change_id?: string };
}
// ...
    entries.push({
      path: record.name ?? '',
      rev: record.target?.change_id ?? '',
      locked: false,
    });
```

**Note:** `WorkspaceInfo.rev` is the field name (NOT `WorkspaceInfo.id`) — `.rev` is a field on a different type (`WorkspaceInfo`), unrelated to `LogEntry.hash`/`CommitResult.hash`. No type-rename on `WorkspaceInfo.rev`; only the parser's read source changes.

---

### `sdk/src/vcs/parse/jj-bookmark.ts` (MOD — fixture-shape JSDoc + downstream template emission)

**Current shape** (lines 18-21):
```typescript
 * Pinned NDJSON shape (jj 0.41.0, per `tests/fixtures/jj-ndjson/jj-bookmark-list-divergent.ndjson`):
 *   {"name":"gsd/phase-3","target":["<commit_id>"]}
 *   {"name":"gsd/divergent","target":["<a>","<b>"]}   // divergent
 *   {"name":"main","target":["<commit_id>"]}         // raw / no-prefix bookmark
```

**Adapt to** (FLIP-01 — JSDoc shape comment update; the parser itself accepts the array contents transparently per RESEARCH §"jj bookmark list" — the FLIP work is at the **template emission** end, not the parser end):
```typescript
 * Pinned NDJSON shape (jj 0.41.0):
 *   {"name":"gsd/phase-3","target":["<change_id>"]}
 *   {"name":"gsd/divergent","target":["<a>","<b>"]}   // divergent
 *   {"name":"main","target":["<change_id>"]}         // raw / no-prefix bookmark
```

**Planner note:** Per RESEARCH §"jj bookmark list" — `parseJjBookmarkRecord` accepts string ids regardless of alphabet; the FLIP work is in the `vcs.refs.bookmarks.list()` caller (search jj.ts for `jj bookmark list` template invocation) which must emit the new template that pulls `change_id` arrays. A sub-task probes the new template shape live during implementation.

---

### Consumer sweep (production code — FLIP-02 + FLIP-03 hard rename `.hash` → `.id`)

These are mechanical TS-driven renames; the pattern is identical across all sites. RESEARCH §Consumer Sweep Inventory enumerates all 12.

**Pattern (every site):**
```diff
- entries[n].hash
+ entries[n].id

- entry.hash
+ entry.id

- (e.hash || '').slice(0, 7)
+ (e.id || '').slice(0, 7)
```

**Per-file specifics:**

| Site | Current | Verdict | Adapt to |
|------|---------|---------|----------|
| `sdk/src/query/log.ts:72` | `return expr.rev(entries[n].hash);` | flip-clean | `return expr.rev(entries[n].id);` |
| `sdk/src/query/verify.ts:683` | `(e.hash \|\| '').slice(0, 7)` | needs-resolveShort (or rename + keep slice as cosmetic — planner decides) | `(e.id \|\| '').slice(0, 7)` cosmetic; OR `vcs.refs.resolveShort(expr.rev(e.id))` semantic |
| `sdk/src/query/mutation-event-mapper.ts:68` | `hash: (data?.hash as string) ?? null,` (event-type output field) | flip-clean + needs-rename — event-type field rename is out-of-band fold-in | rename event-type field `hash` → `id` in same commit (consistent with CommitResult.id rename) |
| `sdk/src/query-raw-output-projection.ts:23` | `return d.hash != null ? String(d.hash) : 'committed';` | flip-clean | `return d.id != null ? String(d.id) : 'committed';` |
| `sdk/src/vcs/backends/jj.ts:597-598` | `entry.hash` internal use | flip-clean | `entry.id` (after parseJjLog now returns `LogEntry.id`) |
| `sdk/src/vcs/format-migration/orphan.ts:77` | `cursor = parents[0].hash;` | flip-clean | `cursor = parents[0].id;` |
| `sdk/src/vcs/format-migration/orphan.ts:103` | `children = childEntries.map((c) => c.hash);` | flip-clean | `children = childEntries.map((c) => c.id);` |
| `sdk/src/vcs/format-migration/run.ts:152` | `commitHash: markerHit.hash ?? '',` | needs-rename (RESEARCH `<deferred>` fold-in) | `commitId: markerHit.id ?? '',` |
| `sdk/src/vcs/format-migration/run.ts:335` | `commitHash: commitResult.hash ?? '',` | needs-rename (same fold-in) | `commitId: commitResult.id ?? '',` |
| `get-shit-done/bin/lib/verify.cjs:1296` | `(e.hash \|\| '').slice(0, 7)` | needs-resolveShort (CJS — no compiler help) | `(e.id \|\| '').slice(0, 7)` cosmetic (grep-only catch) |
| `get-shit-done/bin/lib/commands.cjs:507` | `${r}:${v.hash \|\| 'skip'}` | flip-clean (CJS grep) | `${r}:${v.id \|\| 'skip'}` |
| `sdk/src/query/intel.ts:160` | `snapshot.hashes as Record<string, string>` | NOT a LogEntry consumer — different snapshot field per RESEARCH | verify during audit; likely no change |

**Verification gate per RESEARCH Pitfall 8** (mandatory acceptance step):
```bash
pnpm run build:sdk && grep -r '\.hash' sdk/dist-cjs/ | grep -v '\.d\.ts\.map' | grep -E '(LogEntry|CommitResult)'
# Expected: zero matches. If non-zero, dist-cjs/ stale → rebuild missed; FAIL the plan.
```

---

### Test consumer sweep (FLIP-02 + TEST-12 matcher rollout)

Per RESEARCH §Test Sweep Inventory — 11+ existing `.toBeTruthy()` on id-bearing fields. Sweep migrates to `expect(x).toBeIdOf(kind)` where applicable, keeps as presence-check where the field is `.parentChange` / `.mergeChange` / `.changeId` (already on change-named field; intentional presence check).

**Pattern: rename + upgrade**:
```diff
- expect(r.hash).toBeTruthy();
+ expect(r.id).toBeIdOf('jj');   // or 'git' depending on test fixture
```

**Pattern: hex-regex → matcher** (cited at `jj-workspace.test.ts:417`):
```diff
- expect(mainEntry?.rev).toMatch(/^[0-9a-f]{40}$/);
+ expect(mainEntry?.rev).toBeIdOf('jj');
```

**Pattern: keep-as-is** (cited at `cmd-plan-phase-jj.test.ts:61-62`):
```typescript
expect(result.parentChange).toBeTruthy();  // KEEP — field already on change-named property, intentional presence check
expect(result.mergeChange).toBeTruthy();
```

**Pattern: cross-backend equality via objectContaining composability** (the D-02 deciding case — RESEARCH §Pattern 2):
```typescript
expect(workspaceList[0]).toEqual(expect.objectContaining({ rev: expect.toBeIdOf('jj') }));
```

**Cited keep-as-is** (`baseline-parity.test.ts:141`): the composite hex regex `/^worktree [^\n]+\nHEAD [0-9a-f]{40}\nbranch refs\/heads\/[^\n]+$/` is the git-only `read-worktree-porcelain` baseline. Stays as-is — git fixture is hex-correct.

---

### `sdk/src/vcs/format-migration/rewrite.ts` (MOD — COMMIT_KEY_ALLOWLIST extension)

**Current shape** (lines 73-86):
```typescript
export const COMMIT_KEY_ALLOWLIST: ReadonlySet<string> = new Set([
  'resolution_commit',
  'commit',
  'commit_hash',
  'commit_id',
  'source_commit',
  'migration_commit',
  'first_commit',
  'last_commit',
  'sha',
  'hash',
  'rev',
  'revision',
]);
```

**Adapt to** (MIGR-06 conditional — only extend IF AUDIT-04 finds new commit-bearing frontmatter keys; planner's audit-driven decision):
```typescript
export const COMMIT_KEY_ALLOWLIST: ReadonlySet<string> = new Set([
  // ... existing entries ...
  'commit',
  'commit_hash',
  'commit_id',
  'commitId',       // NEW — pairs with `commitHash` rename in run.ts:152, 335 (per RESEARCH `<deferred>` fold-in)
  // ... rest unchanged ...
  'hash',
  'id',             // NEW — pairs with LogEntry.id / CommitResult.id rename
]);
```

**Planner adaptations needed:**
- Only add keys that AUDIT-04 confirms appear in `.planning/phases/08-…/` frontmatter or other structured stores. Adding speculatively bloats the allowlist (Pitfall 7).
- Idempotency invariant test (lines 35-37 doc) must pass post-extension: a second invocation of `migrateContent` is byte-identical.

---

### `scripts/lint-vcs-no-raw-git.allow.json` (MOD — schema migration to per-entry)

**Current shape** (full file at 32 lines — top-level `$comment*` + `files: []` + `globs: []`):
```json
{
  "$comment": "Phase 1 plan 05 (D-18). Default-deny on git invocations; this file enumerates the exemption set...",
  "$comment_wr_11": "WR-11 widened the scanner...",
  "$comment_2_1_09": "Phase 2.1 plan 09 (D-22 closing). Removed 9 entries...",
  "files": [
    "sdk/src/vcs/exec.ts",
    "sdk/src/vcs/backends/git.ts",
    ...
  ],
  "globs": [
    "sdk/src/vcs/__tests__/**",
    ...
  ]
}
```

**Adapt to** (D-03 per-entry schema + D-04 drop `expires`):
```json
{
  "$schema_version": 2,
  "$migration_note": "Phase 8 D-03 + D-04: per-entry schema; expires field dropped (solo-dev context).",
  "$comment_2_1_09": "Phase 2.1 plan 09 (D-22 closing) — removal-pressure precedent retained as documentation; expanded into per-entry reasons below.",
  "entries": [
    { "path": "sdk/src/vcs/exec.ts", "reason": "VCS adapter internals — the exec wrapper that all `git` invocations route through; this IS the adapter implementation.", "owner": "@LoganDark" },
    { "path": "sdk/src/vcs/backends/git.ts", "reason": "VCS adapter internals — the git backend implementation; raw `git` is the substrate.", "owner": "@LoganDark" },
    { "glob": "sdk/src/vcs/__tests__/**", "reason": "Test fixtures — parameterized contract suite requires raw `git`/`jj` setup commands to construct deterministic test repos.", "owner": "@LoganDark" },
    { "glob": ".githooks/**", "reason": "Hooks/CI — pre-commit/pre-push shell hooks predate the adapter and serve as the substrate.", "owner": "@LoganDark" },
    { "path": "scripts/secret-scan.sh", "reason": "Scan scripts — shell-only pre-commit-style filter; cannot use the JS-side adapter without circularity.", "owner": "@LoganDark" }
  ]
}
```

**Planner adaptations needed:**
- All 14 file entries + 9 glob entries must be migrated. RESEARCH §"Allowlist schema migration (D-03 backfill)" provides the 4-category reason templates.
- Optional: preserve `$comment_2_1_09` removal-pressure documentation (cited as "proven pattern" in D-04 rationale).

---

### `.github/workflows/test.yml` (MOD — add lint step parallel to existing)

**Current shape** (lines 68-70):
```yaml
      - name: Lint — no raw git in jj-reachable code
        shell: bash
        run: node scripts/lint-vcs-no-raw-git.cjs
```

**Adapt to** (LINT-01 — new step parallel; required-blocking on jj-colocated per CONTEXT canonical refs):
```yaml
      - name: Lint — no raw git in jj-reachable code
        shell: bash
        run: node scripts/lint-vcs-no-raw-git.cjs
      - name: Lint — no commit_id leak from jj backend
        shell: bash
        run: node scripts/lint-vcs-no-commit-id.cjs
```

**Pretest chain update** (`package.json:65`):

**Current:**
```json
"pretest": "pnpm run build:sdk && pnpm run lint:skill-deps",
```

**Adapt to** (per RESEARCH §"CI integration"):
```json
"pretest": "pnpm run build:sdk && pnpm run lint:skill-deps && node scripts/lint-vcs-no-commit-id.cjs",
```

---

### `.planning/REQUIREMENTS.md` (MOD — D-02b + D-04 spec text updates)

**Per CONTEXT.md D-02b + D-04:**
- TEST-12 placeholder name `expectIdShape(kind, value)` → `expect.extend({ toBeIdOf(received, kind) })` (vitest custom matcher convention).
- LINT-02 required-fields list drops `expires`; required-fields are `{ path | glob, reason, owner }`; remove "CI fails on expired entries" language.
- FLIP-04 D-05: REQUIREMENTS-04 "ADRs and JSDoc" plural reduced to JSDoc-only (no new ADR).

**Planner action:** Find these requirement entries in REQUIREMENTS.md and edit per the above. No code pattern needed — text-only edits.

---

## Shared Patterns

### Pattern A: Hard rename, no aliases (Pitfall 8)

**Source:** Established Phase 2.1 (`expr.commit` → `expr.rev`); CONTEXT `<deferred>` Out of Scope row explicitly mandates no alias.

**Apply to:** Every consumer site of `LogEntry.hash` / `CommitResult.hash`.

**Pattern:**
```diff
- export interface LogEntry { hash: string; ... }
+ export interface LogEntry { id: string; ... }
```

**Forcing function:** `pnpm run build:sdk` followed by `tsc --noEmit` — every consumer surfaces as a compile error. CJS sites use `grep -r '\.hash' sdk/dist-cjs/` as the post-build verification (Pitfall 8 acceptance step).

---

### Pattern B: Default-deny lint + per-entry allowlist (D-03 + D-04)

**Source:** `scripts/lint-vcs-no-raw-git.cjs` (lint structure) + RESEARCH §Pattern 4 (per-entry schema).

**Apply to:** Both lint scripts (existing `lint-vcs-no-raw-git.cjs` after D-03 migration, and new `lint-vcs-no-commit-id.cjs`).

**Pattern:**
```javascript
const ALLOW_LINE_ANNOTATION = /(?:\/\/|#)\s*vcs-lint:allow-<verb>-here\s*\S/;
// ... regex-based per-line scan ...
// allowlist read via shared scripts/lib/allowlist-parser.cjs
```

**Required fields per allowlist entry:** `{ path | glob, reason, owner }` (`expires` dropped per D-04).

---

### Pattern C: Closed verdict enum + `Object.freeze` (audit script)

**Source:** `scripts/audit-workflow-script-paths.cjs:19-22`.

**Apply to:** `scripts/audit-id-namespace.cjs` (the new audit script).

**Pattern:**
```javascript
const AUDIT_VERDICT = Object.freeze({
  SAFE: 'safe',
  FLIP_CLEAN: 'flip-clean',
  // ... closed enum ...
});

function auditIdNamespace({ scanRoots, repoRoot }) {
  // pure function — emits rows; verdict column filled by human in the .md
  return { ok: ..., findings: [...] };
}

module.exports = { auditIdNamespace, AUDIT_VERDICT };
```

---

### Pattern D: Vitest custom matcher + module augmentation (D-02 / D-02a)

**Source:** No existing in-repo precedent; vitest 3 docs + RESEARCH §Pattern 2.

**Apply to:** Cross-backend id-shape assertions in all `__tests__/*.ts` files.

**Pattern (3-file unit):**
1. `tests/__tools__/vitest-matchers.ts` — `expect.extend({ toBeIdOf(received, kindOrOpts) })`
2. `tests/__tools__/vitest.d.ts` — `declare module 'vitest' { interface Assertion ... }` + `interface AsymmetricMatchersContaining ...`
3. `sdk/vitest.config.ts` — `setupFiles: [matchersPath]` on both unit + integration projects

**Composability case** (the D-02 deciding case):
```typescript
expect(workspaceList[0]).toEqual(expect.objectContaining({ rev: expect.toBeIdOf('jj') }));
```

---

### Pattern E: Phase-boundary-marker cutover (D-05 / MIGR-06)

**Source:** Existing `sdk/src/vcs/format-migration/run.ts` orchestrator + `migrateContent` primitive at `rewrite.ts`.

**Apply to:** Plan 3 close-gate only — single rewriter pass over `.planning/phases/08-…/`.

**Pattern:**
```bash
# Plan 3 close-gate (NOT mid-phase):
node -e "
const { migrateContent } = require('./sdk/dist-cjs/vcs/format-migration/rewrite.js');
// Walk phaseDir; for each .md file, migrate git→jj; write only if changed.
// Reuse the run.ts pre-flight + atomic write pattern.
"

# Idempotency verification (acceptance criterion):
# Second invocation must be byte-identical to first.
```

**Anti-pattern avoided:** Mid-phase rewriter invocation (Pitfall 5) — `commit_id`-shape ids written by Plan 1+2 commits would tangle with `change_id`-shape ids written by Plan 3 commits.

---

## Files With No In-Repo Analog (Vitest 3 Docs Are The Source)

| File | Role | Reason |
|------|------|--------|
| `tests/__tools__/vitest-matchers.ts` | custom matcher impl | First `expect.extend` use in repo — vitest 3 docs + RESEARCH §Pattern 2 are the source (full code provided) |
| `tests/__tools__/vitest.d.ts` | TS ambient module augmentation | First ambient `.d.ts` in tests — vitest 3 docs + RESEARCH §Pattern 2 are the source (full code provided) |
| `scripts/lib/allowlist-parser.cjs` (NEW shared module) | shared allowlist parser | First `scripts/lib/` shared module — RESEARCH §Pattern 4 specifies the impl directly |
| `.planning/intel/id-namespace-audit.json` | JSON sidecar | The audit-workflow-script-paths analog does not serialize findings; RESEARCH §Pattern 1 specifies the schema |

**Planner should cite:** RESEARCH.md §Pattern 1 / §Pattern 2 / §Pattern 4 directly for these files (the full code is in RESEARCH.md).

---

## Metadata

**Analog search scope:**
- `scripts/` (audit + lint precedents)
- `sdk/src/vcs/` (backend + parsers + types — the FLIP target surface)
- `sdk/src/query/` + `sdk/src/vcs/format-migration/` (consumer sweep sites)
- `get-shit-done/bin/lib/` (CJS-runtime consumer sites)
- `tests/__tools__/` (existing test tooling precedent)
- `sdk/src/vcs/__tests__/` (test consumer sites)
- `.github/workflows/` (CI step integration)
- `.planning/intel/` (audit doc precedent)

**Files scanned (direct Read tool):**
- `scripts/audit-workflow-script-paths.cjs` (73 LOC, full read)
- `scripts/lint-vcs-no-raw-git.cjs` (202 LOC, full read)
- `scripts/lint-vcs-no-raw-git.allow.json` (32 LOC, full read)
- `.planning/intel/vcs-adapter-surface-audit.md` (172 LOC, full read)
- `sdk/src/vcs/types.ts:80-130` (interface block read)
- `sdk/src/vcs/backends/jj.ts:200-370, 920-1024` (template flip sites + PITFALL doc)
- `sdk/src/vcs/parse/jj-log.ts` (full read, 66 LOC)
- `sdk/src/vcs/parse/jj-workspace-list.ts` (full read, 51 LOC)
- `sdk/src/vcs/parse/jj-bookmark.ts` (full read, 78 LOC)
- `sdk/src/vcs/format-migration/rewrite.ts:1-110` (COMMIT_KEY_ALLOWLIST + JSDoc block)
- `sdk/vitest.config.ts` (full read, 22 LOC)
- `tests/__tools__/capture-vcs-baselines.cjs:1-80` (CJS tools precedent)
- `sdk/src/vcs/__tests__/git-backend.test.ts:45-90, 170-185` (sample test patterns)
- `sdk/src/vcs/__tests__/jj-workspace.test.ts:410-440` (cited assertion site)
- `sdk/src/query/log.ts:60-80`, `verify.ts:680-690`, `mutation-event-mapper.ts:55-75`, `query-raw-output-projection.ts:18-28`
- `sdk/src/vcs/format-migration/run.ts:140-170`, `orphan.ts:70-115`
- `get-shit-done/bin/lib/verify.cjs:1290-1305`, `commands.cjs:498-515`
- `.github/workflows/test.yml:60-90` (CI integration point)

**Pattern extraction date:** 2026-05-14

**Verified via `rg` / `find`:**
- `expect.extend` usage in repo: zero matches (new pattern, vitest 3 docs are source).
- Ambient `.d.ts` in tests: zero matches (new pattern).
- `lint-vcs-no-raw-git` CI integration: confirmed at `.github/workflows/test.yml:70`.
- `pretest` chain: `package.json:65` confirms `pnpm run build:sdk && pnpm run lint:skill-deps`.
