'use strict';

/**
 * allowlist-parser.cjs (Phase 8 Plan 1, D-03 + D-04; tightened Phase 16 plan 16.01)
 *
 * Shared per-entry allowlist parser. Both lint-vcs-no-raw-git.cjs and
 * lint-vcs-no-commit-id.cjs consume this module.
 *
 * Schema (Phase 8 D-03 + D-04 + Phase 16 plan 16.01 no-expires guard):
 *   {
 *     "$schema_version": 2,
 *     "entries": [
 *       { "path": "<file>", "reason": "<text>", "owner": "@<handle>" },
 *       { "glob": "<pattern>", "reason": "<text>", "owner": "@<handle>" }
 *     ]
 *   }
 *
 * Required fields per entry: { path | glob, reason, owner }. Per D-04 (solo-dev
 * context override of REQUIREMENTS-LINT-02 third required field) the `expires`
 * field is FORBIDDEN — no PR-review cadence to drive re-justification means
 * the field becomes process theater without a forcing function. Phase 16 plan
 * 16.01 tightens this from "intentionally NOT validated" to "actively rejected
 * with a throw" per `feedback_solo_dev_no_expires` memory directive, which
 * forbids the field at the schema layer (not just at the convention layer).
 *
 * Pitfall 7 (allowlist hollowing) protection rests on:
 *   (a) per-entry `reason` + `owner` (required, enforced by this parser)
 *   (b) per-entry NO `expires` field (forbidden, enforced by this parser
 *       since Phase 16 plan 16.01 per `feedback_solo_dev_no_expires`)
 *   (c) code-review of allowlist diffs (process)
 *   (d) periodic removal sweeps in the `$comment_2_1_09` style
 */

const { globToRegExp } = require('./glob-to-regex.cjs');

const REQUIRED_FIELDS = ['reason', 'owner'];
const FORBIDDEN_FIELDS = ['expires'];

function parseAllowlist(json, scriptName) {
	if (!json || typeof json !== 'object') {
		throw new Error(`${scriptName}: allow.json must be a JSON object`);
	}
	if (!Array.isArray(json.entries)) {
		throw new Error(`${scriptName}: allow.json missing top-level "entries" array (per Phase 8 D-03 per-entry schema)`);
	}
	const files = new Set();
	const globRegexes = [];
	for (const e of json.entries) {
		const hasPath = typeof e.path === 'string';
		const hasGlob = typeof e.glob === 'string';
		if (!hasPath && !hasGlob) {
			throw new Error(`${scriptName}: entry missing "path" or "glob": ${JSON.stringify(e)}`);
		}
		if (hasPath && hasGlob) {
			throw new Error(`${scriptName}: entry has both "path" and "glob" (pick one): ${JSON.stringify(e)}`);
		}
		for (const f of REQUIRED_FIELDS) {
			if (typeof e[f] !== 'string' || !e[f].trim()) {
				throw new Error(`${scriptName}: entry missing required "${f}" field (per Phase 8 D-04 — required fields are { path|glob, reason, owner }): ${JSON.stringify(e)}`);
			}
		}
		for (const f of FORBIDDEN_FIELDS) {
			if (f in e) {
				throw new Error(`${scriptName}: entry contains forbidden "${f}" field (per Phase 16 plan 16.01 + feedback_solo_dev_no_expires — no PR-review cadence to drive re-justification means the field becomes process theater): ${JSON.stringify(e)}`);
			}
		}
		if (hasPath) files.add(e.path);
		if (hasGlob) globRegexes.push(globToRegExp(e.glob));
	}
	return { files, globRegexes };
}

module.exports = { parseAllowlist, REQUIRED_FIELDS, FORBIDDEN_FIELDS };
