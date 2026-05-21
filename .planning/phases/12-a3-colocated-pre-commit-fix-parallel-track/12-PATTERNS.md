# Phase 12: A3 colocated pre-commit fix (parallel track) - Pattern Map

**Mapped:** 2026-05-20
**Files analyzed:** 4 (1 test extension, 1 new audit doc, 2 doc edits)
**Analogs found:** 4 / 4

## Scope Note — No Production Code Changes

**Phase 12 modifies NO production source files.** The Path 1 fix (D-01) is
already shipped at `sdk/src/vcs/backends/jj.ts:249-289` (landed by Phase 5 plan
05-01). Per CONTEXT.md D-01/D-02/D-05 and the `<code_context>` section:

- `sdk/src/vcs/backends/jj.ts` — **NOT modified.** Lines 249-289 are the locked
  canonical reference body. The unconditional `fireHook` call at :281 and the
  `GSD_HOOK_SKIP_COLOCATED` opt-out at :274-280 are already in place.
- `sdk/src/vcs/hook-bridge.ts` — **NOT modified.** `fireHook` at :19-42 is the
  bound fire surface per D-02; no new sidecar, no new interface method.
- No new `sdk/src/vcs/jj/` sidecar file. No SDK CLI bridge change. No new query
  verb. No allowlist entry.

**The planner MUST NOT create code-modification tasks.** Phase 12's entire
surface is: one test extension, one new audit doc, two documentation edits.
The "analogs" below are templates the new artifacts copy from — not files to
patch.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `sdk/src/vcs/__tests__/jj-hooks.test.ts` (extend `jj-colocated` block at :167) | test | event-driven (hook fire on commit) | same file, sibling `it()` blocks at :199-247 | exact (in-file precedent) |
| `.planning/phases/12-…/12-HOOK-IDEMPOTENCY-AUDIT.md` (new) | doc (audit artifact) | transform (per-hook classification) | `.planning/intel/id-namespace-audit.md` | role-match |
| `.planning/ROADMAP.md` (Phase 12 SC2 + SC3 wording edit) | config (doc) | transform (string replacement) | `.planning/phases/10-…/10-01-PLAN.md` Task 1 | exact (cascade-amendment precedent) |
| `.planning/REQUIREMENTS.md` (HOOK-06 + HOOK-07 wording edit) | config (doc) | transform (string replacement) | `.planning/phases/10-…/10-01-PLAN.md` Task 2 | exact (cascade-amendment precedent) |

## Pattern Assignments

### `sdk/src/vcs/__tests__/jj-hooks.test.ts` — extend `jj-colocated` block (test, event-driven)

**Analog:** Same file. The HOOK-07 regression test is a new `it()` block added
**inside** the existing `describe('jj-colocated: pre-commit always fires from
adapter (D-32 — D-10 retired)', …)` block at line 167. **No new test file**
(D-04). The two sibling `it()` blocks at :199-247 are the direct body-shape
precedent.

**Fixture setup pattern — already in place, do NOT re-create** (`beforeAll` at lines 170-194):
```typescript
// Phase 5 plan 05-05 flake-fix: Pattern B — random-prefix mkdtemp
// to avoid parallel-test-file tmpdir collisions.
dir = mkdtempSync(
  join(
    tmpdir(),
    `gsd-jj-hooks-colocated-${Math.random().toString(36).slice(2, 10)}-`,
  ),
);
execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
execSync('jj config set --repo user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
execSync('jj config set --repo user.name "Test"', { cwd: dir, stdio: 'pipe' });
writeFileSync(join(dir, 'seed.txt'), 'seed\n');
execSync('jj squash -B @ -k -m "seed"', { cwd: dir, stdio: 'pipe' });
vcs = createVcsAdapter(dir, { kind: 'jj' }) as JjVcsAdapter;
```
The new `it()` block reuses this shared `dir`/`vcs` — it does NOT add a new
`mkdtempSync` or `beforeAll`. The CONTEXT `<code_context>` reference to the
`mkdtempSync` pattern at :174-180 describes the fixture the new test inherits,
not a fixture the test re-establishes.

**Test body shape — copy from D-32 fire test** (lines 199-218):
```typescript
it('D-32: colocated mode always fires adapter-side .githooks/pre-commit', () => {
  const markerPath = join(dir, '.colocated-adapter-fired');
  safeUnlink(markerPath);
  writeHook(
    dir,
    'pre-commit',
    `#!/bin/bash\ntouch "${markerPath}"\nexit 0\n`,
  );

  writeFileSync(join(dir, 'co-a.txt'), 'a\n');
  const r = vcs.commit({
    message: 'colocated test',
    files: ['co-a.txt'],
  });
  expect(r.exitCode).toBe(0);
  expect(existsSync(markerPath)).toBe(true);
});
```

**Opt-out body shape — copy from escape-hatch test** (lines 220-247):
```typescript
it('GSD_HOOK_SKIP_COLOCATED=1 suppresses the fire in colocated mode (D-32 escape hatch)', () => {
  const markerPath = join(dir, '.colocated-skip-marker');
  safeUnlink(markerPath);
  writeHook(dir, 'pre-commit', `#!/bin/bash\ntouch "${markerPath}"\nexit 0\n`);

  const prev = process.env.GSD_HOOK_SKIP_COLOCATED;
  process.env.GSD_HOOK_SKIP_COLOCATED = '1';
  try {
    writeFileSync(join(dir, 'co-skip.txt'), 'skip\n');
    const r = vcs.commit({ message: 'colocated skip-hook test', files: ['co-skip.txt'] });
    expect(r.exitCode).toBe(0);
    expect(existsSync(markerPath)).toBe(false);
  } finally {
    if (prev === undefined) {
      delete process.env.GSD_HOOK_SKIP_COLOCATED;
    } else {
      process.env.GSD_HOOK_SKIP_COLOCATED = prev;
    }
  }
});
```

**HOOK-07 net-new assertion (what the new `it()` adds):** The SC2-verbatim
"fires exactly once" sentinel. The existing :199 test asserts the marker
*exists* (≥1 fire); HOOK-07 must assert *exactly once*. Two viable patterns,
both within existing helpers — planner picks one:
- **Counter hook body** — replace `touch` with an append-a-line body
  (`echo x >> "${markerPath}"`), then assert the marker file has exactly one
  line after `vcs.commit`. This is the "fires exactly once" verbatim proof.
- **Marker-absence delta** — pair the fire-once assertion with the opt-out
  zero-fire assertion already at :220-247 (the SC2 "or zero times" clause).

The new block keeps the `'co-*.txt'` file-naming convention (unique stem per
`it()` so the shared `dir` does not collide across sibling tests).

**Helpers reused (module-level, lines 43-58) — do NOT redefine:**
```typescript
function writeHook(dir: string, stage: string, body: string): string { … }  // :43
function safeUnlink(p: string): void { … }                                  // :52
```

**Suite-skip guard — already in place** (lines 35-41, 60): `describe.skipIf(!jjAvailable)`
gates the whole suite on `jj --version`. The new `it()` inherits it; no new guard.

---

### `.planning/phases/12-…/12-HOOK-IDEMPOTENCY-AUDIT.md` (doc — audit artifact, transform)

**Analog:** `.planning/intel/id-namespace-audit.md` — v1.2 Phase 8's standalone
audit artifact (CONTEXT cites "v1.2's 08-AUDIT.md"; the live equivalent is this
intel-dir file, the Phase 8 id-namespace audit). It is the structural model: a
standalone `.md`, generated during phase execution, serving as close-gate
evidence — not a chat-log of the audit process.

**Header / summary-block pattern** (id-namespace-audit.md lines 1-7):
```markdown
# Id Namespace Audit — Phase 8 (D-01)

**Generated:** 2026-05-15
**Total findings:** 101
**Verdict counts:** safe=13, flip-clean=30, needs-rename=43, …
**Risk 4 (jj 0.41 NDJSON schema):** see `.planning/intel/jj-041-ndjson-probe.md` — VERIFIED GREEN.
```
12-HOOK-IDEMPOTENCY-AUDIT.md adapts this: title `# Hook Idempotency Audit —
Phase 12 (SC4 / D-05)`, a `**Generated:**` date, and a one-line verdict summary
(e.g. `**Non-idempotent operations found:** 0`).

**Verdict-legend pattern** (id-namespace-audit.md lines 8-16): a closed enum of
verdict labels with one-line definitions. Phase 12's enum is smaller — e.g.
`idempotent` / `non-idempotent` / `n/a (no hook installed)`.

**Findings-table pattern** (id-namespace-audit.md lines 20-22, header row):
```markdown
## Findings

| # | File:line | Pattern | Caller use | Verdict | Notes |
|---|-----------|---------|------------|---------|-------|
```
Phase 12's table is per-hook-stage, not per-line: columns like
`| Hook stage | Script path | Operation | Idempotent? | Notes |`. Per D-05 the
audit covers `.githooks/pre-commit`, `.githooks/pre-push`, and any other
`.githooks/<stage>` the adapter could fire in future stages.

**Empty-finding discipline (D-05 explicit requirement):** if zero non-idempotent
operations are found, record the empty result explicitly (mirroring
id-namespace-audit.md's "Post-pass audit" section at lines 201-238, which states
counts even when 0). A future contributor adding a non-idempotent op must see
the prior baseline. Pattern: a "Verdict" section stating
`No non-idempotent operations found. Baseline recorded for v1.3+ regression.`

**Re-runnable verification block** (id-namespace-audit.md lines 162-168):
```markdown
Verification commands (re-runnable):

```bash
…
```
```
12-HOOK-IDEMPOTENCY-AUDIT.md should include a re-runnable check (e.g. listing
`.githooks/` contents + a re-fire idempotency probe) so the close-gate has a
stable target.

**Note on the adapter's own idempotency framing:** the audit's rationale anchor
is already documented in `sdk/src/vcs/backends/jj.ts:264-266` — "Idempotent hook
bodies make this [the `GSD_HOOK_SKIP_COLOCATED` opt-out] moot in practice." The
audit verifies that this stated assumption holds for the actual installed hook
scripts. Cite this comment range in the audit's intro.

---

### `.planning/ROADMAP.md` — Phase 12 SC2 + SC3 wording edit (config/doc, transform)

**Analog:** `.planning/phases/10-…/10-01-PLAN.md` Task 1 (lines 123-158) — the
Phase 10 cascade-amendment precedent (CONTEXT D-03 cites "Phase 10 plan 10-01").
Pattern: ROADMAP + REQUIREMENTS edits land in a **single docs-only plan, before
any test/audit plan**, so downstream plan task descriptions reference corrected
wording.

**Verbatim-replacement task pattern** (10-01-PLAN.md lines 76-88, the `<amendments>` block):
The plan embeds CURRENT text and AMENDED-TO text verbatim, and the executor
performs a straight string replacement with "No interpretation."

**Exact edit targets (verified against live ROADMAP.md):**
- **SC2** — `.planning/ROADMAP.md:155`. Current:
  > "On a colocated jj fixture, installing a sentinel `.git/hooks/pre-commit`
  > and running `vcs.commit` (or direct `jj squash`) fires the hook exactly
  > once …"

  Per D-03: rewrite `.git/hooks/pre-commit` → `.githooks/pre-commit`.
- **SC3** — `.planning/ROADMAP.md:156`. Current:
  > "Regression test at `sdk/src/vcs/__tests__/jj-colocated-hooks.test.ts` (or
  > extension of existing `jj-hooks.test.ts`) is green on jj-colocated CI lane."

  Per D-04: rewrite to point at the extended `jj-hooks.test.ts:167`
  `jj-colocated` describe block (drop the `jj-colocated-hooks.test.ts`
  alternative-filename wording).

**Per-task verify pattern** (10-01-PLAN.md lines 147-150): each amendment task
gets a `grep -c` assertion that the stale string is gone (returns 0) and a
`grep -q` that the new string is present. Apply the same to the Phase 12 SC2/SC3
edits.

**Hygiene:** preserve SC numbering, the `**Success Criteria**` structure, and
SC1/SC4/SC5. Do not modify any other phase section (10-01-PLAN.md Task 1
`<action>`, lines 140-144).

---

### `.planning/REQUIREMENTS.md` — HOOK-06 + HOOK-07 wording edit (config/doc, transform)

**Analog:** `.planning/phases/10-…/10-01-PLAN.md` Task 2 (lines 160-205) — same
cascade-amendment precedent: two string replacements in REQUIREMENTS.md,
checkbox state and REQ-ID prefix preserved.

**Exact edit targets (verified against live REQUIREMENTS.md):**
- **HOOK-06** — `.planning/REQUIREMENTS.md:52`. Current:
  > "- [ ] **HOOK-06**: A3 colocated pre-commit fix landed. jj 0.41 colocated
  > `jj squash` reliably fires `.git/hooks/pre-commit` (whichever path; …).
  > Lives in `sdk/src/vcs/backends/jj.ts::commit` or new
  > `sdk/src/vcs/jj/pre-commit-bridge.ts` sidecar …"

  Per D-03: rewrite `.git/hooks/pre-commit` → `.githooks/pre-commit`; add the
  explicit out-of-scope note for `.git/hooks/` (D-02 invariant) plus the
  one-line husky / pre-commit-framework migration callout (CONTEXT
  `<specifics>`: point those users at `.githooks/` via symlink, framework
  reconfiguration, or manual copy).
- **HOOK-07** — `.planning/REQUIREMENTS.md:53`. Current:
  > "- [ ] **HOOK-07**: Regression test for HOOK-06 on a colocated jj fixture.
  > Pre-commit hook fires exactly once …"

  Per D-03: affirm the sentinel location is `.githooks/pre-commit` (same
  `.git/hooks/` → `.githooks/` rewrite); confirm the test lives in the extended
  `jj-hooks.test.ts:167` block.

**Checkbox-preservation pattern** (10-01-PLAN.md lines 181-187, 201-203): the
edit MUST keep `- [ ] **HOOK-06**:` / `- [ ] **HOOK-07**:` prefixes intact and
leave the Traceability table (REQUIREMENTS.md lines 126-127, `| HOOK-06 |
Phase 12 | Pending |` / `| HOOK-07 | Phase 12 | Pending |`) unchanged.

**Per-task verify pattern** (10-01-PLAN.md lines 189-193): `grep -c` for the
stale `.git/hooks/pre-commit` substring on the HOOK-06/HOOK-07 lines returns 0;
`grep -q` for `.githooks/pre-commit` exits 0.

## Shared Patterns

### Cascade-amendment in its own docs-only plan
**Source:** `.planning/phases/10-…/10-01-PLAN.md` (whole file)
**Apply to:** Both `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md` edits.
The ROADMAP + REQUIREMENTS rewrites land in **one docs-only plan that runs
before** the regression-test plan and the audit plan, so those later plans'
task descriptions reference the corrected `.githooks/` wording. This is CONTEXT
D-03's explicit "cascade-amendment hygiene" requirement.

### Verbatim string-replacement with grep gates
**Source:** `.planning/phases/10-…/10-01-PLAN.md` lines 76-118 (`<amendments>`),
147-150, 189-193 (per-task `<verify>`).
**Apply to:** Every doc-edit task. Embed CURRENT and AMENDED-TO text verbatim in
the plan; executor does straight replacement, no interpretation; verify with
`grep -c <stale> … = 0` + `grep -q <new>`.

### In-file test extension, not new file
**Source:** `sdk/src/vcs/__tests__/jj-hooks.test.ts` lines 167-283 (the
`jj-colocated` describe block with three existing sibling `it()` blocks).
**Apply to:** The HOOK-07 regression test. New `it()` added inside the existing
block; reuses the shared `beforeAll` fixture, the `writeHook`/`safeUnlink`
module helpers, and the `describe.skipIf(!jjAvailable)` guard. No new file, no
new fixture, no new helper (CONTEXT D-04).

### Standalone audit artifact as close-gate evidence
**Source:** `.planning/intel/id-namespace-audit.md` (v1.2 Phase 8 audit).
**Apply to:** `12-HOOK-IDEMPOTENCY-AUDIT.md`. Generated during phase execution
(not at phase-close), header with `**Generated:**` date + verdict summary,
findings table, closed verdict enum, explicit empty-finding record, re-runnable
verification block.

### No-raw-git guard compliance
**Source:** Project memory `project_no_raw_git`; CONTEXT `<specifics>`.
**Apply to:** The test extension. The new `it()` MUST NOT introduce raw `git `
invocations. The existing colocated fixture's `execSync('jj git init
--colocate …')` is a jj subcommand (allowed); the `jj config set` lines are jj.
The new `it()` reuses the shared `dir` and uses only `vcs.commit(...)` +
`writeHook` + `writeFileSync` — no `git` shell-out. Confirm no new `git` token
appears.

## No Analog Found

None. All four Phase 12 artifacts have a direct in-repo precedent (the test
extends a block in its own file; both doc edits follow the Phase 10 10-01
cascade-amendment; the audit doc follows the v1.2 Phase 8 id-namespace audit).

## Metadata

**Analog search scope:** `sdk/src/vcs/__tests__/`, `sdk/src/vcs/backends/`,
`sdk/src/vcs/` (hook-bridge), `.planning/` (ROADMAP, REQUIREMENTS, intel/,
phases/10-…).
**Files scanned:** 6 (jj-hooks.test.ts, hook-bridge.ts, jj.ts:240-294,
ROADMAP.md Phase 12 section, REQUIREMENTS.md HOOK section, 10-01-PLAN.md,
id-namespace-audit.md).
**Pattern extraction date:** 2026-05-20
</content>
</invoke>
