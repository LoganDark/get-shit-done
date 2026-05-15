#!/usr/bin/env node
/**
 * seed-lint-allowlist.cjs (Phase 8 Plan 3, D-01)
 *
 * One-shot seeder. Reads .planning/intel/id-namespace-audit.json, projects
 * legitimate verdict buckets into per-entry allowlist entries, writes
 * scripts/lint-vcs-no-commit-id.allow.json. Idempotent: re-running with the
 * same audit JSON produces byte-identical output.
 *
 * Verdict bucket → allowlist treatment:
 *   - boundary-io        → ALLOWLIST (jj-internal accessor; per LINT-03 conditional)
 *   - safe               → ALLOWLIST (40-char hex test literals, EMPTY_TREE, audit-script
 *                          self-references, rewriter's `'commit_id'` allowlist literal —
 *                          all legitimate per-row rationale carried in `reason`)
 *   - historical-prose   → ALLOWLIST (JSDoc comments documenting the unified contract;
 *                          legitimate post-FLIP doc references that name `commit_id` /
 *                          `change_id` to explain the contract — per Open Q2 grandfather)
 *   - flip-clean         → NOT seeded (Plan 2 swept these; remaining references after
 *                          FLIP indicate either an incomplete sweep or a fixture
 *                          tracking the old format intentionally)
 *   - needs-rename       → NOT seeded (same — Plan 2 should have swept all)
 *   - needs-resolveShort → NOT seeded (cosmetic .slice followups; v1.3 work)
 *   - unclear            → NOT seeded (would mask incomplete classification)
 *
 * Audit script + lint script self-references are appended manually below
 * (the seeder cannot derive these from the audit JSON — they exist by virtue
 * of the lint pattern's recursive nature; per RESEARCH Pitfall 7 the reason
 * field is explicit).
 *
 * Additional allowlist entries for paths the audit doesn't scan (tests/*.cjs
 * outside tests/__tools__/, sdk/src/types.ts, sdk/src/query/commit.ts,
 * sdk/src/vcs/format-migration/types.ts) are appended manually with explicit
 * reason + owner — these surfaced during Plan 3 lint smoke-run.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const AUDIT_PATH = path.join(REPO_ROOT, '.planning/intel/id-namespace-audit.json');
const ALLOW_PATH = path.join(REPO_ROOT, 'scripts/lint-vcs-no-commit-id.allow.json');

if (!fs.existsSync(AUDIT_PATH)) {
	console.error(`seed-lint-allowlist: audit JSON not found at ${AUDIT_PATH}. Run Plan 1 first.`);
	process.exit(1);
}

const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, 'utf8'));

// Verdict-bucket → reason-category mapping (per RESEARCH Pitfall 7: each entry
// carries audit-row traceability so periodic sweeps can re-classify).
const VERDICT_CATEGORIES = {
	'boundary-io': 'boundary-io — backend-private accessor (LINT-03 conditional driver)',
	'safe': 'safe — legitimate hex/commit_id usage (test fixtures, EMPTY_TREE constant, allowlist literals)',
	'historical-prose': 'historical-prose — JSDoc/prose reference to commit_id naming the unified contract',
};

// Per-path dedupe: collapse multiple audit rows on the same file into one entry,
// concatenating their audit_row numbers and reasons.
const byPath = new Map();
for (const [verdict, category] of Object.entries(VERDICT_CATEGORIES)) {
	const rows = (audit.verdicts && audit.verdicts[verdict]) || [];
	for (const row of rows) {
		if (!byPath.has(row.path)) {
			byPath.set(row.path, { verdict, category, rows: [] });
		}
		byPath.get(row.path).rows.push(row.audit_row);
	}
}

const seededEntries = [];
for (const [filepath, info] of byPath.entries()) {
	const rows = info.rows.sort((a, b) => a - b).join(',');
	seededEntries.push({
		path: filepath,
		reason: `audit-rows-${rows} ${info.category}.`,
		owner: '@LoganDark',
	});
}

seededEntries.sort((a, b) => a.path.localeCompare(b.path));

// Manual appends for the two script self-references (seeder cannot derive
// these — the audit script + lint script must contain the literal patterns
// they detect, by construction).
const SELF_REFERENCES = [
	{
		path: 'scripts/audit-id-namespace.cjs',
		reason: 'Scan scripts — audit script literally must contain the literal commit_id strings + .commit_id regex patterns to detect them at consumer sites.',
		owner: '@LoganDark',
	},
	{
		path: 'scripts/lint-vcs-no-commit-id.cjs',
		reason: 'Scan scripts — lint script literally must contain the COMMIT_ID_PATTERNS regex/string fragments to denylist them.',
		owner: '@LoganDark',
	},
	{
		path: 'scripts/seed-lint-allowlist.cjs',
		reason: 'Scan scripts — seeder JSDoc + manual-append reasons literally mention `commit_id` / `.commit_id` / `commit_id.short()` etc. to document which audit verdicts the seeder consumes and the per-row rationale categories.',
		owner: '@LoganDark',
	},
	{
		path: 'scripts/migr-06-close-gate.cjs',
		reason: 'Scan scripts — close-gate rewriter (one-shot MIGR-06) literally contains `commit_id` strings + GIT_SHA_RE-style hex-shape regex (mirroring the canonical sdk/src/vcs/format-migration/rewrite.ts shape) to migrate commit_id-shape backticks to change_id-shape.',
		owner: '@LoganDark',
	},
];

// Manual appends for paths the audit does NOT scan (audit scan roots are
// sdk/src, get-shit-done/bin/lib, scripts, tests/__tools__, get-shit-done/workflows).
// These paths surfaced during Plan 3 lint smoke-run.
const POST_AUDIT_DISCOVERIES = [
	{
		path: 'sdk/src/types.ts',
		reason: 'Post-FLIP JSDoc reference — GSDGitCommitEvent.id JSDoc names `commit_id` / `change_id` to document the unified revision contract (D-05 multi-anchor; mirrors LogEntry/CommitResult JSDoc).',
		owner: '@LoganDark',
	},
	{
		path: 'sdk/src/vcs/types.ts',
		reason: 'Post-FLIP JSDoc reference — LogEntry.id + CommitResult.id JSDoc names `commit_id` / `change_id` to document the unified revision contract (D-05 multi-anchor; this is the canonical JSDoc the lint guard message points to as the architectural invariant).',
		owner: '@LoganDark',
	},
	{
		path: 'sdk/src/query/commit.ts',
		reason: 'Post-FLIP JSDoc reference — commit handler JSDoc names `commit_id.short()` / `change_id.shortest()` to document the backend-aware short-id form returned by resolveShort.',
		owner: '@LoganDark',
	},
	{
		path: 'sdk/src/vcs/format-migration/types.ts',
		reason: 'Post-FLIP JSDoc reference — MigrateRunResult.commitId JSDoc names `commit_id` / `change_id` to document the active-backend revision identifier mirroring CommitResult.id.',
		owner: '@LoganDark',
	},
	{
		path: 'sdk/src/vcs/__tests__/jj-refs.test.ts',
		reason: 'NDJSON parser test fixtures — bookmark.rev test asserts exact-string passthrough through `parseJjBookmarkRecord` over both [0-9a-f] and [k-z] alphabets (parser is intentionally alphabet-transparent; fixtures preserve the original NDJSON shape for replay testing).',
		owner: '@LoganDark',
	},
	{
		path: 'tests/drift-detection.test.cjs',
		reason: 'Test fixtures — writeMappedCommit() helper accepts 40-char hex strings as commit-hash inputs for drift-detection mapping-file testing (test fixture, not a runtime consumer).',
		owner: '@LoganDark',
	},
	{
		path: 'tests/enh-3170-graphify-commit-staleness.test.cjs',
		reason: 'Test fixtures — graphify commit-hash regex/value fixtures (`COMMIT_HASH_RE` mirror tests + ghost-hash placeholder); test fixture, not a runtime consumer.',
		owner: '@LoganDark',
	},
	{
		path: 'tests/installer-migrations.test.cjs',
		reason: 'Test fixtures — installer migrations test asserts on a [0-9a-f]{64} content-hash regex (NOT a commit_id; SHA-256 file-content hashing); the regex shape happens to overlap our pattern.',
		owner: '@LoganDark',
	},
	{
		path: 'tests/scripts/audit-id-namespace.test.cjs',
		reason: 'Scan-script test — audit-id-namespace test fixtures literally embed `"commit_id"` strings in temp files to verify the audit pattern detection (test fixture mirroring scan-script behavior).',
		owner: '@LoganDark',
	},
];

// Manual appends override seeded entries on path collision (more specific reason wins).
const manualPaths = new Set([...SELF_REFERENCES, ...POST_AUDIT_DISCOVERIES].map((e) => e.path));
const dedupedSeeded = seededEntries.filter((e) => !manualPaths.has(e.path));
const allEntries = [...dedupedSeeded, ...SELF_REFERENCES, ...POST_AUDIT_DISCOVERIES];
allEntries.sort((a, b) => a.path.localeCompare(b.path));

const allow = {
	$schema_version: 2,
	$migration_note: 'Phase 8 Plan 3 D-01: seeded from .planning/intel/id-namespace-audit.json verdicts[boundary-io|safe|historical-prose]. Per-entry schema (D-03 + D-04 — expires NOT required, solo-dev context).',
	$generated_by: 'scripts/seed-lint-allowlist.cjs',
	$post_audit_note: 'Entries also include script self-references (audit + lint scripts) and post-audit discoveries (paths outside the audit scan roots that surfaced during Plan 3 lint smoke-run). Each carries an explicit reason + owner per Phase 8 D-03.',
	entries: allEntries,
};

fs.writeFileSync(ALLOW_PATH, JSON.stringify(allow, null, 2) + '\n');
console.log(`seed-lint-allowlist: wrote ${allEntries.length} entries to ${path.relative(REPO_ROOT, ALLOW_PATH)}`);

const boundaryIoCount = (audit.verdicts && audit.verdicts['boundary-io'] || []).length;
if (boundaryIoCount === 0) {
	console.log('seed-lint-allowlist: ZERO boundary-io consumers (the inversion of SEED-001 holds; LINT-03 closes as verified end state).');
} else {
	console.log(`seed-lint-allowlist: ${boundaryIoCount} boundary-io consumer(s) recorded (LINT-03 driver count).`);
}
