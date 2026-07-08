#!/usr/bin/env node
/**
 * audit-workflow-raw-git.cjs (Phase 13 plan 13-02, LINT-04)
 *
 * Scans `.md` shell-fence blocks (the bash / sh / zsh labelled fences) under
 * `gsd-core/workflows/`, `gsd-core/references/`, and `agents/` for
 * raw `git <cmd>` invocations. (19-10: scan roots re-pointed from the retired
 * get-shit-done/ layout to the adopted upstream gsd-core/ layout.)
 *
 * This is a BASELINE-REGRESSION GUARD, not a zero-assertion audit. v1.3's
 * PROMPT-06..09 removed raw-git only from the parallel-dispatch path; the
 * adopted post-merge tree carries 230 raw-git invocations across 93
 * workflow-markdown files (most are the 19-09 launcher embed's deliberate
 * git-first leg — 1 hit per embedded file). A zero-assertion audit cannot
 * pass. Instead, the audit carries a FROZEN per-file baseline capturing the
 * 2026-06-10 230-hit state (the BASELINE constant below, machine-derived by
 * THIS script's own counter — transcript in 19-MERGE-AUDIT.md appendix)
 * and exits non-zero ONLY when a scanned file's current raw-git count EXCEEDS
 * its baseline count — i.e. NEW raw-git was added to workflow markdown. On the
 * first green run, current == baseline == pass. (Per RESEARCH.md Open Q1 user
 * resolution; plan 13-01 re-baselined ROADMAP SC2/SC3 + CONTEXT.md D-08 to this
 * same framing; plan 19-10 re-derived the map for the adopted tree.)
 *
 * The audit is the CI-06 gate (plan 13-04 wires it into the parallel-e2e lane).
 * It is NOT in `npm pretest` (D-07 — one-shot / CI-06-only).
 *
 * Stdout-only (CONTEXT.md D-06): this is a colocated-jj repo; any file written
 * into the working tree is auto-snapshotted. The audit writes NOTHING to disk —
 * a human-readable `.md` report to stdout by default, machine-readable JSON to
 * stdout under `--json`. It invokes no VCS — a pure file-walker, so
 * `lint-vcs-no-raw-git.cjs` does not flag it.
 *
 * Modeled structurally on scripts/audit-id-namespace.cjs (shebang, header
 * docblock, `'use strict'`, node:fs/node:path imports, the recursive walker,
 * parseArgv, emitMarkdown/emitJson, escapeMarkdownCell verbatim, the
 * `require.main` guard, the `module.exports` of pure functions). The deliberate
 * divergence flagged by the pattern map: the CLI guard ends with
 * `process.exit(result.ok ? 0 : 1)` — `audit-id-namespace.cjs` never exits.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Reuse the production lint's start-of-statement detection verbatim
// (scripts/lint-vcs-no-raw-git.cjs SHELL_GIT_PATTERNS). Byte-identical on
// purpose — the audit and the lint must agree on what "raw git" means.
// VCS-audit 2026-07-08: widened to also match option-leading invocations
// (`git -C <dir> <cmd>`, `git --git-dir=… <cmd>`, `git -c k=v <cmd>`) — the
// letter-only tail made every `git -C` call invisible to both tools.
const SHELL_GIT_RE = /(?:^|[ \t;&|(])git[ \t]+(?:[a-zA-Z]|-)/;
// Fence open: ```bash / ```sh / ```zsh (three-or-more backticks or tildes,
// case-insensitive). Fence close: a bare fence (no language label).
const FENCE_OPEN = /^\s*(```+|~~~+)\s*(bash|sh|zsh)\b/i;
const FENCE_CLOSE = /^\s*(```+|~~~+)\s*$/;
const SCAN_ROOTS = ['gsd-core/workflows', 'gsd-core/references', 'agents'];

// The frozen per-file raw-git baseline. Re-derived 2026-07-08 (VCS-audit
// remediation pass, same day as — and superseding — the next-merge 257/109
// map) by running THIS script's own fence-aware counter against the
// post-remediation tree: TOTAL = 229 hits across 108 files. Two opposing
// deltas vs the 257 map: (a) DOWN ~38 — the audit migrated operative raw git
// to adapter verbs across 25 files (docs commits → query commit; log/status/
// diff probes → query log/status/diff; `[ -f .git ]` worktree probes →
// workspace.assert-dispatched-cwd; execute_waves #48 guard and executor
// PROJECT_ROOT template → dual git/jj ladder) and gated the rest behind
// substrate/kind checks with TODO(05-05 sweep) ledgers; (b) UP ~10 — the
// SHELL_GIT_RE widening (option-leading `git -C …` forms, previously
// invisible) now counts the ledgered git -C sites in gsd-code-fixer.md,
// pr-branch.md, and reapply-patches.md (config-dir git, HAS_GIT-gated).
// D-09 / phase-scope-decision: a per-file count map, NOT a bare
// total — a removal in one file must never mask an addition in another. An
// embedded `Object.freeze`d constant in committed source does NOT violate
// CONTEXT.md D-06: D-06 forbids the audit WRITING transient output at runtime;
// a static, version-controlled baseline is source, not runtime output (the
// migr-06-close-gate.cjs embedded-constant precedent).
const BASELINE = Object.freeze({
	"agents/gsd-code-fixer.md": 9,
	"agents/gsd-code-reviewer.md": 1,
	"agents/gsd-debug-session-manager.md": 1,
	"agents/gsd-debugger.md": 5,
	"agents/gsd-eval-auditor.md": 1,
	"agents/gsd-executor.md": 4,
	"agents/gsd-intel-updater.md": 1,
	"agents/gsd-phase-researcher.md": 1,
	"agents/gsd-plan-checker.md": 1,
	"agents/gsd-planner.md": 1,
	"agents/gsd-project-researcher.md": 1,
	"agents/gsd-research-synthesizer.md": 1,
	"agents/gsd-ui-researcher.md": 1,
	"agents/gsd-verifier.md": 1,
	"gsd-core/references/git-integration.md": 6,
	"gsd-core/references/gsd-run-resolver.md": 1,
	"gsd-core/references/planner-load-graph-context.md": 1,
	"gsd-core/references/planning-config.md": 3,
	"gsd-core/references/specless-probe-fallback.md": 2,
	"gsd-core/references/worktree-branch-check.md": 3,
	"gsd-core/references/worktree-path-safety.md": 4,
	"gsd-core/workflows/add-backlog.md": 1,
	"gsd-core/workflows/add-phase.md": 1,
	"gsd-core/workflows/add-tests.md": 1,
	"gsd-core/workflows/add-todo.md": 1,
	"gsd-core/workflows/ai-integration-phase.md": 1,
	"gsd-core/workflows/audit-fix.md": 1,
	"gsd-core/workflows/audit-milestone.md": 1,
	"gsd-core/workflows/audit-uat.md": 1,
	"gsd-core/workflows/autonomous.md": 1,
	"gsd-core/workflows/check-todos.md": 1,
	"gsd-core/workflows/cleanup.md": 4,
	"gsd-core/workflows/code-review-fix.md": 3,
	"gsd-core/workflows/code-review.md": 5,
	"gsd-core/workflows/complete-milestone.md": 10,
	"gsd-core/workflows/debug.md": 1,
	"gsd-core/workflows/diagnose-issues.md": 3,
	"gsd-core/workflows/discuss-phase-assumptions.md": 1,
	"gsd-core/workflows/discuss-phase.md": 1,
	"gsd-core/workflows/discuss-phase/modes/advisor.md": 1,
	"gsd-core/workflows/discuss-phase/modes/auto.md": 1,
	"gsd-core/workflows/discuss-phase/modes/chain.md": 1,
	"gsd-core/workflows/do.md": 1,
	"gsd-core/workflows/docs-update.md": 1,
	"gsd-core/workflows/edit-phase.md": 1,
	"gsd-core/workflows/eval-review.md": 1,
	"gsd-core/workflows/execute-phase.md": 15,
	"gsd-core/workflows/execute-phase/steps/codebase-drift-gate.md": 1,
	"gsd-core/workflows/execute-phase/steps/post-merge-gate.md": 1,
	"gsd-core/workflows/execute-phase/steps/regression-gate.md": 1,
	"gsd-core/workflows/execute-plan.md": 1,
	"gsd-core/workflows/explore.md": 1,
	"gsd-core/workflows/extract-learnings.md": 1,
	"gsd-core/workflows/fast.md": 1,
	"gsd-core/workflows/forensics.md": 4,
	"gsd-core/workflows/graduation.md": 1,
	"gsd-core/workflows/health.md": 1,
	"gsd-core/workflows/import.md": 1,
	"gsd-core/workflows/ingest-docs.md": 2,
	"gsd-core/workflows/insert-phase.md": 1,
	"gsd-core/workflows/list-seeds.md": 1,
	"gsd-core/workflows/list-workspaces.md": 1,
	"gsd-core/workflows/manager.md": 1,
	"gsd-core/workflows/map-codebase.md": 1,
	"gsd-core/workflows/migrate-vcs.md": 1,
	"gsd-core/workflows/milestone-summary.md": 6,
	"gsd-core/workflows/mvp-phase.md": 1,
	"gsd-core/workflows/new-milestone.md": 1,
	"gsd-core/workflows/new-project.md": 1,
	"gsd-core/workflows/new-workspace.md": 6,
	"gsd-core/workflows/next.md": 1,
	"gsd-core/workflows/pause-work.md": 1,
	"gsd-core/workflows/plan-milestone-gaps.md": 1,
	"gsd-core/workflows/plan-phase.md": 1,
	"gsd-core/workflows/plan-phase/steps/prd-express-path.md": 1,
	"gsd-core/workflows/plan-review-convergence.md": 1,
	"gsd-core/workflows/plant-seed.md": 1,
	"gsd-core/workflows/pr-branch.md": 19,
	"gsd-core/workflows/profile-user.md": 1,
	"gsd-core/workflows/progress.md": 1,
	"gsd-core/workflows/quick.md": 13,
	"gsd-core/workflows/reapply-patches.md": 6,
	"gsd-core/workflows/remove-phase.md": 1,
	"gsd-core/workflows/remove-workspace.md": 3,
	"gsd-core/workflows/resume-project.md": 1,
	"gsd-core/workflows/review.md": 2,
	"gsd-core/workflows/scan.md": 1,
	"gsd-core/workflows/secure-phase.md": 1,
	"gsd-core/workflows/session-report.md": 1,
	"gsd-core/workflows/settings-advanced.md": 1,
	"gsd-core/workflows/settings-integrations.md": 1,
	"gsd-core/workflows/settings.md": 1,
	"gsd-core/workflows/ship.md": 6,
	"gsd-core/workflows/sketch-wrap-up.md": 1,
	"gsd-core/workflows/sketch.md": 1,
	"gsd-core/workflows/smart-entry.md": 1,
	"gsd-core/workflows/spec-phase.md": 2,
	"gsd-core/workflows/spike-wrap-up.md": 1,
	"gsd-core/workflows/spike.md": 1,
	"gsd-core/workflows/stats.md": 1,
	"gsd-core/workflows/thread.md": 1,
	"gsd-core/workflows/transition.md": 1,
	"gsd-core/workflows/ui-phase.md": 1,
	"gsd-core/workflows/ui-review.md": 1,
	"gsd-core/workflows/ultraplan-phase.md": 1,
	"gsd-core/workflows/undo.md": 1,
	"gsd-core/workflows/validate-phase.md": 3,
	"gsd-core/workflows/verify-phase.md": 1,
	"gsd-core/workflows/verify-work.md": 1
});

// Recursive *.md walker. Tolerates a missing scan-root directory via the
// try/catch returning early (mirrors audit-id-namespace.cjs findFiles).
// T-13-04 defense-in-depth: skip symbolic-link directories so a stray symlink
// inside a SCAN_ROOT cannot make the walk read files outside the repo (the
// migr-06-close-gate.cjs assertInsidePhaseDir containment posture; ASVS V12).
function findMarkdown(dir, out) {
	let entries;
	try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
	for (const entry of entries) {
		if (entry.isSymbolicLink()) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) findMarkdown(full, out);
		else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
	}
}

// Per-file scanner: read the file, track fence state, and count raw-git hits
// inside bash/sh/zsh fences only. Returns the repo-relative path (forward-slash
// separated so it matches the BASELINE keys on every OS), the hit count, and
// the hit-line list for the `.md` report. Shell-comment lines (`#`-prefixed)
// inside a fence are skipped (mirrors lint-vcs-no-raw-git.cjs:133).
function scanFile(absPath, repoRoot) {
	const rel = path.relative(repoRoot, absPath).split(path.sep).join('/');
	const lines = fs.readFileSync(absPath, 'utf8').split('\n');
	const hits = [];
	let inFence = false;
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		if (!inFence && FENCE_OPEN.test(line)) { inFence = true; continue; }
		if (inFence && FENCE_CLOSE.test(line)) { inFence = false; continue; }
		if (!inFence) continue;
		if (/^\s*#/.test(line)) continue; // shell comment — skip
		if (SHELL_GIT_RE.test(line)) {
			hits.push({ line: i + 1, snippet: line.trim().slice(0, 200) });
		}
	}
	return { path: rel, count: hits.length, hits };
}

// Core: walk all scan roots, scanFile each, build the per-file current-count
// map, then apply the per-file REGRESSION RULE (baseline_design): a file is a
// regression iff its current count EXCEEDS its baseline count (a path absent
// from the baseline is treated as baseline 0). `ok` is true iff there are zero
// regressions — raw-git REMOVED is never a regression. The `baseline` argument
// is injectable (defaults to the BASELINE constant) so the unit test can pass a
// synthetic baseline and verify the comparison independent of the frozen map.
function auditWorkflowRawGit({ scanRoots, repoRoot, baseline = BASELINE }) {
	const files = [];
	for (const root of scanRoots) findMarkdown(path.resolve(repoRoot, root), files);

	const currentCounts = {};
	let totalCurrent = 0;
	for (const abs of files) {
		const scanned = scanFile(abs, repoRoot);
		if (scanned.count > 0) {
			currentCounts[scanned.path] = scanned.count;
			totalCurrent += scanned.count;
		}
	}

	const regressions = [];
	for (const [rel, current] of Object.entries(currentCounts)) {
		const base = Object.prototype.hasOwnProperty.call(baseline, rel) ? baseline[rel] : 0;
		if (current > base) regressions.push({ path: rel, baseline: base, current });
	}
	regressions.sort((a, b) => a.path.localeCompare(b.path));

	return {
		ok: regressions.length === 0,
		scannedFiles: files.length,
		totalCurrent,
		currentCounts,
		regressions,
	};
}

function parseArgv(argv) {
	const out = { json: false };
	for (let i = 2; i < argv.length; i += 1) {
		if (argv[i] === '--json') out.json = true;
	}
	return out;
}

// IN-02 (REVIEW.md): full markdown-table cell escaping copied verbatim from
// audit-id-namespace.cjs. Order matters: escape `\` first so subsequently
// inserted backslashes (from the `|` escape) are NOT re-escaped.
function escapeMarkdownCell(s) {
	return String(s)
		.replace(/\\/g, '\\\\')
		.replace(/\|/g, '\\|')
		.replace(/`/g, '\\`')
		.replace(/\r\n|\r|\n/g, '<br>');
}

function emitMarkdown(result) {
	const lines = [
		'# Workflow raw-git audit — Phase 13 (LINT-04)',
		'',
		`**Generated:** ${new Date().toISOString().slice(0, 10)}`,
		'**Mode:** baseline-regression guard (frozen 229-hit baseline, re-derived at the 2026-07-08 VCS-audit remediation pass; fails only on raw-git ADDED beyond baseline)',
		`**Files scanned:** ${result.scannedFiles}`,
		`**Current raw-git hits:** ${result.totalCurrent}`,
		`**Regressions:** ${result.regressions.length}`,
		`**Result:** ${result.ok ? 'PASS — within baseline' : 'FAIL — raw-git regression detected'}`,
		'',
	];
	if (result.regressions.length > 0) {
		lines.push(
			'## Regressions',
			'',
			'A scanned file\'s current raw-git count exceeds its frozen baseline — NEW raw-git was added to workflow markdown.',
			'',
			'| File | Baseline | Current |',
			'|------|----------|---------|',
		);
		for (const r of result.regressions) {
			lines.push(`| \`${escapeMarkdownCell(r.path)}\` | ${r.baseline} | ${r.current} |`);
		}
	} else {
		lines.push('No regressions — every scanned file is within its frozen raw-git baseline.');
	}
	return lines.join('\n') + '\n';
}

function emitJson(result) {
	return JSON.stringify({
		$schema_version: 1,
		scanned_at: new Date().toISOString(),
		ok: result.ok,
		scannedFiles: result.scannedFiles,
		totalCurrent: result.totalCurrent,
		currentCounts: result.currentCounts,
		regressions: result.regressions,
	}, null, 2) + '\n';
}

// Only run when invoked as a script (not when required as a module by tests).
if (require.main === module) {
	const argv = parseArgv(process.argv);
	const repoRoot = path.resolve(__dirname, '..');
	const result = auditWorkflowRawGit({ scanRoots: SCAN_ROOTS, repoRoot, baseline: BASELINE });
	process.stdout.write(argv.json ? emitJson(result) : emitMarkdown(result));
	// CI-06: non-zero exit fails the parallel-e2e lane (the regression-guard
	// exit code — the deliberate divergence from audit-id-namespace.cjs).
	process.exit(result.ok ? 0 : 1);
}

module.exports = {
	auditWorkflowRawGit,
	scanFile,
	findMarkdown,
	emitMarkdown,
	emitJson,
	SHELL_GIT_RE,
	BASELINE,
};
