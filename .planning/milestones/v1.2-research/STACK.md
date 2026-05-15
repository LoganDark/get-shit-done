# Stack Research — v1.2 audit + surface flip + lint guard

**Domain:** TypeScript SDK + CJS-runtime hybrid (existing); incremental tooling for an
identifier-namespace audit + surface flip + lint-guard parallel
**Researched:** 2026-05-14
**Confidence:** HIGH

> Scope reminder: this is a **subsequent-milestone STACK** for a project with an already-validated
> stack (Node ≥22, pnpm 11+, TypeScript ≥5.7, vitest 3, jj 0.41 pinned in CI). It does NOT
> re-litigate those choices. It only proposes the **net-new tooling** the v1.2 audit + flip + lint
> work actually needs, plus what to deliberately *not* add.
>
> Headline answer: **add zero new npm dependencies.** The audit is a one-shot grep/template-walk
> that fits inside the existing `scripts/*.cjs` ecosystem. The lint guard is a fork of the existing
> `lint-vcs-no-raw-git.cjs`. The surface flip is a TypeScript code change reviewed by hand and the
> existing TS compiler. Heavy AST tooling (ts-morph, jscodeshift, ast-grep) is **explicitly ruled
> out** for reasons listed under "What NOT to Use" — they would add real cost (deps, CI install
> time, learning curve) for negligible audit-quality lift over the regex+template approach the
> codebase already trusts (see `format-migration/rewrite.ts:53,63` for the precedent).

---

## Recommended Stack

### Core Technologies (already locked — confirmed unchanged for v1.2)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | `^5.7.0` (pinned in `sdk/package.json:55`) | Compiler for SDK source; type-system narrowing is the *primary enforcement* for the surface flip — `LogEntry.hash`'s type doesn't change, but call-site usages that assume hex form are caught by `expr.commit(sha)` deprecation + `RevisionExpr` brand check | Already locked. The branded `RevisionExpr` in `sdk/src/vcs/types.ts:20` is the v1.2 enforcement seam — narrowing is what makes a leaked `commit_id` *visible* once `expr.commit` is deprecated to `expr.rev`. No version bump needed. |
| Node.js | `>=22.0.0` (`package.json:47`) | Runtime for SDK + CJS bin/lib + scripts | Already locked. Audit/lint scripts are plain `.cjs` like every other one in `scripts/` — no Node-version surface change. |
| pnpm | `11.0.8` (`package.json:49`) | Workspace + lockfile | Already locked. v1.2 adds zero deps, so the lockfile delta is intentionally empty. |
| vitest | `^3.1.1` (`sdk/package.json:56`) | Test runner with parameterized `GSD_TEST_BACKENDS=git \| jj-colocated` matrix | Already locked. Existing matrix is the surface-flip regression net — every renamed/retyped verb gets a both-backends assertion via the existing parameterization. |
| jj | `0.41` (CI-pinned) | jj-colocated lane backend; provides the templates the audit walks | Already locked. v1.2 needs `change_id` + `change_id.short()` template forms — both first-class in 0.41 (verified per `07-RESEARCH.md` sources cited in `sdk/src/vcs/backends/jj.ts:891`, and confirmed locally: `jj 0.41.0` at `/Users/LoganDark/.local/bin/jj`). No bump. |

### Supporting Libraries (none added)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| *(none)* | — | — | The deliberate v1.2 stance is **zero new runtime or dev deps**. See "What NOT to Use" for what was rejected and why. |

### Development Tools (all already on disk; no installs)

| Tool | Purpose | Notes |
|------|---------|-------|
| Node `fs` + regex (in-tree, in `scripts/lint-vcs-no-raw-git.cjs` style) | Power both the **per-call-site audit script** and the **`commit_id` lint guard** | Mirror the existing 200-line lint script verbatim — same scan-root injection seam (`--scan-root <dir>`), same JSON allowlist file, same `// vcs-lint:allow-…-here <reason>` annotation pattern. ~80 % of the new lint script is copy-paste from `scripts/lint-vcs-no-raw-git.cjs`. |
| `jj log -T '<template>'` (already used 7× in `sdk/src/vcs/backends/jj.ts`) | Templating engine for any audit pass that needs to enumerate revisions, parents, bookmarks, etc. | The audit isn't just static-text scanning — it has to enumerate which jj backend templates currently emit `commit_id`. Walk `jj.ts` for `'-T', '…commit_id…'` literals; this *is* the audit's primary input. |
| `jq` (`/usr/bin/jq` — system-installed, used by existing scan scripts e.g. `scripts/secret-scan.sh`) | Parse `jj log -T 'json(...)'` and `jj bookmark list -T 'json(...)'` outputs in the audit script | Already a system dep; no install. The codebase already parses jj NDJSON via hand-written parsers in `sdk/src/vcs/parse/jj-*.ts`, which the audit script can re-use directly without going through `jq` for the bulk of the work. |
| TypeScript compiler (`tsc`) — already on disk via `@gsd-build/sdk` workspace | Surface-flip enforcement: deprecating `expr.commit(sha)` in favor of `expr.rev(id)` is a TS-level change; the build catches every consumer | Already locked. v1.2 just adds `@deprecated` JSDoc on `expr.commit` (Phase 2.1 D-13 already left it as a thin alias of `expr.rev`, see `sdk/src/vcs/expr.ts:34`). |

### What this means for the six specific questions

**Q1 — TS/CJS code-search tools (ts-morph / jscodeshift / ast-grep) for the audit?** No.
The audit is *enumerative*, not refactor-driving. We need to *find* every `commit_id` /
`.commit_id` / hex-shaped-SHA reference and *classify* it (lint annotation, accept-as-internal,
flip-to-change-id, route-via-private-accessor). That is a `scripts/audit-id-namespace.cjs`
shaped exactly like `scripts/lint-vcs-no-raw-git.cjs` — file walker + per-line regex + JSON
allowlist. Adding ts-morph would be a 10× DX hit (~50 MB dep tree, ~3-5 s startup) for a
~150-line script that runs once and lives in CI.

**Q2 — Lint guard extension.** Fork (don't extend) `scripts/lint-vcs-no-raw-git.cjs` into
`scripts/lint-vcs-no-commit-id.cjs` with a sibling `scripts/lint-vcs-no-commit-id.allow.json`.
The two scanners share ~80 % of code — same `parseArgv`, same `findFiles`, same `globToRegExp`,
same `--scan-root` seam, same `// vcs-lint:allow-…-here <reason>` annotation grammar. **Reason
to fork rather than extend:** the existing lint's allowlist is *git-routed* code that's
expected to keep using git (e.g. `scripts/secret-scan.sh`); the new lint's allowlist will be
*jj-internal templates that legitimately read `commit_id`* (e.g. `jj.ts:225` —
`LogEntry.hash` resolution post-squash) PLUS the boundary-I/O private accessor for github.com
URLs. Different policies → different allowlists → different scripts. They both run in CI; both
default-deny.

**Q3 — jj-tooling additions for the audit.** None. jj 0.41 already ships every template
function the audit needs:
- `change_id` — change identifier (the v1.2 canonical surface)
- `change_id.short()` — short form for human display
- `commit_id` — git-shape hash (the thing being audited *out*)
- `commit_id.short()` — what `resolveShort()` currently returns on jj
- `bookmarks` (with `name` / `target` accessors)
- `parents.map(...)` — used by `mergeBase` revset

The audit script invokes `jj log -T '…'` directly via `child_process` (already the call shape
used inside `sdk/src/vcs/backends/jj.ts`); no template-helper layer is needed. **Important:**
the audit must *read* templates only; it must NOT add any `change_id`-emitting templates to
the *adapter implementation* itself — that's the Phase 1 work item, not a stack concern.

**Q4 — Markdown / `.planning/` prose scanning for leaked commit_id hex strings.** Reuse the
*existing*, already-shipped `format-migration/rewrite.ts` regex+zone machinery. The
`GIT_SHA_RE` at `sdk/src/vcs/format-migration/rewrite.ts:53` plus `findEligibleZones()` at
`:240` already implement *exactly* the markdown scan v1.2 needs — backtick spans + YAML
frontmatter allowlist, code-fence exclusion, idempotency invariant. The v1.2 audit/lint just
imports those exports (or, for the lint script which is `.cjs`, mirrors the regex literal
verbatim — the alphabet-disjointness invariant means a 60-char regex is sufficient). **Do not
rebuild this; do not add a new markdown parser.** The same machinery that did the SHA→change_id
*rewrite* in v1.0 Phase 6 powers the v1.2 *detection*.

**Q5 — Versions / pins.** No version changes. All inherited.

**Q6 — Don't add.** Detailed in "What NOT to Use" below.

---

## Installation

```bash
# Nothing to install. v1.2 adds zero deps — the lockfile delta is intentionally empty.
```

If a future *human* reviewer wants ad-hoc AST exploration during the audit (one-shot, throwaway,
not committed), they can run `npx --yes @ast-grep/cli@0.42.2 …` directly — no
package.json entry, no lockfile churn. The recommendation here is that the *committed* audit
script does NOT depend on this.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Regex+walker `.cjs` script (mirroring `lint-vcs-no-raw-git.cjs`) | **ts-morph** (`v28.0.0`, 2026-04-12) | Use ts-morph if the audit ever needs **type-aware** queries — e.g. "every call site whose argument's *resolved type* is `string` and is passed where `RevisionExpr` is expected." For v1.2 we never need that: the brand on `RevisionExpr` (`sdk/src/vcs/types.ts:20`) means TS itself rejects hex-SHA literals at the call site. ts-morph's value is whole-program semantic understanding; the audit only needs syntactic pattern matching. |
| Regex+walker | **jscodeshift** (`v17.3.0`) | Use jscodeshift if the surface flip becomes a **mass automated rewrite** of consumers (e.g. ~200+ call sites of `expr.commit(sha)` → `expr.rev(id)`). Current consumer count is ~5–10 (already mostly migrated in Phase 2.1 D-13); a hand-edit + TS-error sweep is faster than authoring + reviewing a codemod. |
| Regex+walker | **@ast-grep/cli** (`v0.42.2`, 2026-05-10) | Use ast-grep if the team wants a **portable cross-language lint primitive** to reuse for shell + TS + markdown in one pattern grammar. Real benefit, but installs a Rust binary into CI; the bigger downside is that the project's existing lint precedent (`lint-vcs-no-raw-git.cjs`) is pure-Node — adding ast-grep splits the lint stack and forces every contributor to install it locally to run `pnpm test`. |
| Hand-extend `lint-vcs-no-raw-git.allow.json` | Fork the script into a separate `lint-vcs-no-commit-id.cjs` | Forking is the recommendation. Extending would conflate two policies (git-route ban + commit-id-leakage ban) onto one allowlist where the legitimate exemptions are mutually exclusive (`jj.ts:225` legitimately reads `commit_id` from jj but is also legitimately git-free; one allowlist row can't express that). |
| `format-migration/rewrite.ts` regex re-use for prose scan | New markdown AST parser (e.g. `unified` / `remark`) | Use a markdown AST parser only if the audit needs to **rewrite** markdown (Phase 6 already proved a custom zone walker handles GSD's authoring conventions correctly). For *detection-only* — which is all v1.2 needs from the prose scan — the existing zone-walker is overkill, but it's already-shipped overkill that has tests. Free lunch. |
| `jj log -T` direct invocation in script | A dedicated jj template-builder helper module | A helper would make sense for >5 distinct template invocations across the audit; v1.2 has ~3. Inline-string templates inside the audit script (mirroring `jj.ts:225,898,946,965,978,1178`) are clearer in context. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **ts-morph** as a v1.2 dep | (1) ~50 MB dep tree on a project that ships zero non-essential deps (`package.json:50` runtime deps = `@anthropic-ai/claude-agent-sdk` + `ws` only). (2) TypeScript-version-pinning hassle (ts-morph bundles its own TS; risk of drift vs the project's `^5.7.0`). (3) Provides type-system insight the audit doesn't need — the audit is *syntactic* (find `commit_id` literals + `.commit_id` accessor). (4) Project constraint per `PROJECT.md:119`: "Avoid adding heavy npm deps; prefer shelling out to `jj` binary via the adapter." | A `~150-line scripts/audit-id-namespace.cjs` mirroring `lint-vcs-no-raw-git.cjs` (same walker, same allowlist mechanism, same annotation grammar). |
| **jscodeshift** | (1) Primary use case is mass-automated refactoring; v1.2's consumer-call-site count is small enough for hand-edit + tsc sweep. (2) Adds Recast + Babel parser as transitive deps (~30 MB). (3) Codemod authorship/review cost > hand-edit cost at this scale. | TS compiler errors (turn `expr.commit` into `@deprecated` then run `tsc`; every offender lights up). |
| **@ast-grep/cli** as a *committed* dep | (1) Splits the lint-script ecosystem from pure-Node to mixed Rust+Node. (2) Requires per-platform binary install in CI matrix (Linux + macOS lanes both need it). (3) Real value (cross-language pattern grammar) is not exercised in v1.2 — we have one TS surface + one CJS surface + one markdown surface, and the regexes for each are <5 lines. | Pure-Node walker (Q1+Q2 answer above). Note: `npx @ast-grep/cli` is fine for *interactive exploration* by a human reviewer during audit drafting; just don't commit it. |
| **A new markdown AST parser** (`unified`/`remark`/`mdast-util-*`) | (1) Adds 8–15 transitive deps. (2) Detection-only scan doesn't need AST; the existing `findEligibleZones()` machinery (`format-migration/rewrite.ts:240`) already implements the right semantics (backtick spans, YAML frontmatter allowlist, code-fence exclusion) and has unit tests. (3) Reusing it preserves the *idempotency invariant* the v1.0 Phase 6 rewriter established — auditor and rewriter agree on what a "leaked SHA in prose" means. | Import `findEligibleZones` + `GIT_SHA_RE` from `sdk/src/vcs/format-migration/rewrite.ts` (or mirror them in the `.cjs` lint script — they're 60 lines of code). |
| **`@typescript-eslint/parser` + custom ESLint rule** | (1) Project doesn't currently ship ESLint config (verified: no `.eslintrc*` at root, no `eslint` in `package.json`); adopting ESLint as a side-effect of v1.2 is scope creep. (2) The existing lint precedent is pure-Node walker scripts (`scripts/lint-*.cjs`) that run via `pnpm test`'s `pretest`; new lint should join that family for consistency. | Pure-Node walker. |
| **A new JSON-schema validator** for the audit-output file (`.planning/intel/id-namespace-audit.md`) | The audit output is *markdown*, not JSON — humans read it during the v1.2 review pass. JSON would invert the consumer (auditor writes for an automated reader instead of for a developer). | Hand-authored markdown table per the v1.0 Phase 6 audit precedent. |
| **A `vcs.jjOnly.commitIdOf` cross-backend escape hatch** (the SEED-001 design) | v1.2's defining premise (`PROJECT.md:17,135`) inverts SEED-001: leakage is a *defect*, not an *opt-in*. Adding a cross-backend `jjOnly.commitIdOf` would re-create the leak the milestone is closing. | Backend-PRIVATE accessor: `sdk/src/vcs/backends/jj.ts` exposes a non-exported `__internalCommitIdOf(rev)` consumed only by the boundary-I/O code that builds github.com URLs (`scripts/changeset/github-release-notes.cjs` after the audit determines whether it needs commit_id at all — `vcs.refs.readBlob` already replaced its previous `git show` use; tag/release URLs may eliminate the need entirely). |
| **A `change_id`-typed wrapper class** (e.g. `class ChangeId extends String`) | The branded `RevisionExpr` (`sdk/src/vcs/types.ts:20`) is already the right wrapper. Adding a second wrapper bifurcates the type system without adding enforcement — TS structural subtyping makes nominal-string brands ergonomic; runtime classes don't survive JSON round-tripping (which `.planning/` files require). | Stick with `RevisionExpr` brand. The v1.2 surface flip is about *what value flows through `RevisionExpr` on jj*, not about adding a sibling type. |

---

## Stack Patterns by Variant

**If the audit count of `commit_id` references in `sdk/src/vcs/backends/jj.ts` exceeds ~30:**
- Promote the inline regex audit to a small helper module (still pure Node, no deps),
- Because: maintainability of a per-template-string classifier matters once you're past the
  scale at which a single `.cjs` file stays readable. Current count is 7 (verified via grep);
  not at that threshold.

**If a future milestone adds a third backend (e.g. Sapling/sl):**
- Extend the existing `BACKENDS_AVAILABLE_FOR_VERB` allowlist mechanism (`sdk/src/vcs/backends.ts`)
  rather than bifurcating the lint scripts further,
- Because: lint-script sprawl is the failure mode to avoid. The two scripts (`lint-vcs-no-raw-git`
  + `lint-vcs-no-commit-id`) are policies, not backends.

**If the boundary-I/O exception (github.com URL construction) turns out to need commit_id in
more than one place:**
- Add `sdk/src/vcs/internal/commit-id-for-boundary-io.ts` — a single module that calls the
  jj-backend-private accessor, with a top-of-file comment that explains why this module is the
  *only* legitimate cross-backend caller of `commit_id`-shape data,
- Because: concentrating the exception in one auditable file is what makes the lint guard's
  default-deny posture sustainable. The lint guard's allowlist gets one entry: that file path.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `typescript@^5.7.0` | `vitest@^3.1.1` | Already validated through v1.1; no v1.2 change. |
| `node@>=22` | `jj@0.41` | Already validated through v1.0+v1.1 on both Linux (jj) and macOS (git) lanes. |
| `pnpm@11.0.8` (workspace) | `sdk/` workspace per `pnpm-workspace.yaml:1-2` | Already validated. |
| New script `scripts/lint-vcs-no-commit-id.cjs` | Existing `scripts/lint-vcs-no-raw-git.cjs` | Run sequentially in `pretest` (mirroring how `lint:skill-deps` runs today via `package.json:65`). Both use mutually exclusive allowlists; no interaction. |
| `format-migration/rewrite.ts` exports (`GIT_SHA_RE`, `findEligibleZones`) | Audit script (TS) **or** lint script (`.cjs`) | TS audit can `import { GIT_SHA_RE } from '../sdk/src/vcs/format-migration/rewrite.js'` (after `pnpm build:sdk`); `.cjs` lint should mirror the regex literal verbatim (the alphabet-disjointness invariant ensures correctness). |

---

## Integration Points (where the new pieces live)

1. **Audit script.** `scripts/audit-id-namespace.cjs` — invoked manually by the v1.2 phase
   author, output redirected to `.planning/intel/id-namespace-audit.md` (per `PROJECT.md:20`).
   Mirrors the structure of `scripts/lint-vcs-no-raw-git.cjs`: argv parser → file walker →
   per-line classifier → markdown emitter (instead of `process.exit(1)` like the lint).
   Default scan root = repo root; `--scan-root <dir>` seam preserved for fixture testing.

2. **Lint guard.** `scripts/lint-vcs-no-commit-id.cjs` — registered alongside the existing
   `scripts/lint-vcs-no-raw-git.cjs`. Wired into CI by the same `pretest` chain that already
   runs `lint:skill-deps` (`package.json:65`); a new `lint:vcs-no-commit-id` script entry plus
   one `&&` in the `pretest` line. Allowlist: `scripts/lint-vcs-no-commit-id.allow.json`,
   structurally identical to the no-raw-git allowlist (top-level `files: [...]`, `globs: [...]`).

3. **Fixture test.** `tests/lint-vcs-no-commit-id-fixture.test.cjs` — mirrors the existing
   `tests/lint-vcs-no-raw-git-fixture.test.cjs` (fixture file in tmp tree, scan with
   `--scan-root`, assert violation reported). Drop-in copy with the regex swapped.

4. **Deprecation surface.** `sdk/src/vcs/expr.ts` — add `@deprecated` JSDoc to `expr.commit`
   pointing at `expr.rev`. The TS compiler then surfaces every consumer at build time.
   No new tooling.

5. **Boundary-I/O private accessor.** `sdk/src/vcs/backends/jj.ts` — add a non-exported
   `__internalCommitIdOf(rev: RevisionExpr): string` consumed *only* by the (single, audited)
   github.com-URL builder. Lint guard's allowlist explicitly covers the consumer file by exact
   path; no glob.

---

## Sources

- **In-tree primary sources** (HIGH confidence — read directly):
  - `sdk/src/vcs/types.ts` — `RevisionExpr` brand (`:20`), `LogEntry.hash` shape (`:109-116`),
    `VcsRefs` surface (`:310-341`)
  - `sdk/src/vcs/backends/jj.ts` — every `commit_id` template invocation (`:225, 946, 965, 978`),
    every `change_id` template invocation (`:900, 1178`), the `LogEntry.hash` PITFALL
    comment at `:327-328`
  - `sdk/src/vcs/format-migration/rewrite.ts` — `GIT_SHA_RE` (`:53`), `JJ_CID_RE` (`:63`),
    `COMMIT_KEY_ALLOWLIST` (`:73-86`), `findEligibleZones()` (`:240-352`)
  - `sdk/src/vcs/parse/jj-id.ts:33-34` — existing `commitIdOf(cwd, changeId)` translator
    (the symbol the boundary-I/O private accessor will wrap)
  - `scripts/lint-vcs-no-raw-git.cjs` — full template for the new `lint-vcs-no-commit-id.cjs`
    fork (especially the `parseArgv`/`SCAN_ROOT` seam at `:31-40`, the allowlist machinery at
    `:42-48,87-139`, and the violation reporter at `:189-202`)
  - `scripts/lint-vcs-no-raw-git.allow.json` — structural template for the new allowlist file
  - `package.json:60-75` — existing lint-script registration pattern (`pretest` chain)
  - `sdk/package.json:48-57` — current dependency floor (zero new entries proposed)
  - `pnpm-workspace.yaml` — workspace topology (no change)
  - `.planning/PROJECT.md:15-28` — v1.2 milestone goal + target features (canonical scope)
  - `.planning/MILESTONES.md:25-28` — SEED-001's *original* design and v1.2's *inversion* of it
- **External version verification** (HIGH confidence — `npm view` 2026-05-14):
  - `ts-morph@28.0.0` (released 2026-04-12) — verified current; **rejected** for v1.2 scope
  - `@ast-grep/cli@0.42.2` (released 2026-05-10) — verified current; **rejected** for v1.2 scope
  - `jscodeshift@17.3.0` — verified current; **rejected** for v1.2 scope
- **External tool verification** (HIGH confidence — local `command -v`):
  - `jj 0.41.0` available at `/Users/LoganDark/.local/bin/jj`; templates `change_id`,
    `change_id.short()`, `commit_id`, `commit_id.short()` all first-class in this version
    (also verified by their existing use in `sdk/src/vcs/backends/jj.ts`)
  - `jq` at `/usr/bin/jq` — system dep already used by `scripts/secret-scan.sh`; available if
    needed but the in-tree `parse/jj-*.ts` parsers handle the same data without it
- **Memory-anchored constraints** (HIGH confidence):
  - `project_no_raw_git` — whole-repo default-deny lint is the precedent the new lint mirrors
  - `project_unified_revision_model` — premise inversion of SEED-001 (no cross-backend escape
    hatch); informs the boundary-I/O private-accessor recommendation
  - `feedback_sdk_commit_jj_safe` — confirms the surface-flip strategy doesn't break commit
    routing (post-B-08 `gsd-sdk query commit` is jj-safe; v1.2 is consumer-side, not commit-path)

---

*Stack research for: GSD jj-port v1.2 (unified revision model — audit + flip + lint guard)*
*Researched: 2026-05-14*
*Headline: zero new deps; fork the lint, mirror the regex, hand-edit the surface, let `tsc` find the rest.*
