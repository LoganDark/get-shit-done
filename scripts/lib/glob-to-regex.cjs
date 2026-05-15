'use strict';

/**
 * glob-to-regex.cjs (Phase 8 Plan 1, D-03)
 *
 * Extracted from scripts/lint-vcs-no-raw-git.cjs:87-132 during Phase 8 Plan 1
 * (D-03) — shared between lint-vcs-no-raw-git.cjs and lint-vcs-no-commit-id.cjs.
 *
 * Translate a simple glob (* and **) to a RegExp anchored at start and end.
 *
 * WR-10 semantics:
 *   - `**\/` (intermediate)  → `(?:[^/]+/)*` — zero or more full path components.
 *     This matches the gitignore(5) semantic: `**\/foo` matches `foo`,
 *     `a/foo`, and `a/b/foo`.
 *   - `**` at end-of-pattern → `.+` (require at least one char). Without
 *     the `+`, the allowlist entry `sdk/**` would also match a top-level
 *     file literally named `sdk` (since the trailing `**` would match the
 *     empty suffix and consume the trailing `/` as well — but with our
 *     handling the prefix already includes the literal `/`, so the body
 *     would still need to match SOMETHING after that slash).
 *   - Defensively escape `-`. The escape set already covers `[]`, so an
 *     embedded glob char class like `[a-z]` survives as literal `\[a\-z\]`
 *     in the regex output (a no-op match for the literal bracket text).
 */

function globToRegExp(glob) {
	let re = '';
	let i = 0;
	while (i < glob.length) {
		const c = glob[i];
		if (c === '*') {
			if (glob[i + 1] === '*') {
				if (glob[i + 2] === '/') {
					// `**/` — zero or more full path components followed by `/`.
					re += '(?:[^/]+/)*';
					i += 3;
				} else {
					// Trailing `**` — require at least one character so that
					// `prefix/**` does not match `prefix` (zero suffix).
					re += '.+';
					i += 2;
				}
			} else {
				re += '[^/]*';
				i += 1;
			}
		} else if ('.+?^${}()|[]\\-'.includes(c)) {
			re += '\\' + c;
			i += 1;
		} else {
			re += c;
			i += 1;
		}
	}
	return new RegExp('^' + re + '$');
}

module.exports = { globToRegExp };
