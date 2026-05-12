/**
 * Unit tests for git commit and check-commit query handlers.
 *
 * Tests: execGit (via VcsAdapter), sanitizeCommitMessage, commit, checkCommit.
 * Uses real git repos in temp directories.
 *
 * Plan 02-08 paired migration (D-06): the local `execGit` shim in
 * sdk/src/query/commit.ts has been deleted as part of the W5 prescriptive
 * import policy. The previously direct `execGit(...)` test invocations now
 * route through the canonical `execGit` re-export from the VCS module
 * (sdk/src/vcs/exec.ts), which is byte-equivalent in shape (5-field result
 * superset of the 3-field local shim). Test names are preserved verbatim
 * per D-08 to keep the test inventory diff minimal.
 *
 * Fixture setup migrated to the VcsAdapter via gitOnly.init / gitOnly.configSet
 * (gap-fills landed in plan 02-03 — RESEARCH §Forward-Complete Gaps Summary).
 * Test-body git invocations migrated where an adapter verb exists:
 *   - `git log -1 --format=%s`         -> vcs.log({maxCount:1})[0].subject
 *   - `git show --name-only --format=` -> showCommittedFiles helper
 *     (vcs.log({maxCount:1, paths}) approximation isn't byte-identical for
 *     `show`; a dedicated helper builds the file list via `vcs.diff` against
 *     parent/empty-tree)
 *   - `git status --porcelain`         -> vcs.status({porcelain:true}).raw
 *   - `git diff --cached --name-only`  -> vcs.diff({staged:true,
 *                                          nameOnly:true}).nameOnly.join('\\n')
 *
 * The `git rm` semantics required by the #3061 regression tests (pre-stage
 * a deletion against HEAD before invoking the commit handler) are
 * synthesized via `unlink(file)` + `execGit(cwd, ['add', '-A', '--', file])`
 * — git records the deletion in the index when the worktree file is gone.
 * Plan 2.1-04 (D-03): the vcs.stage / vcs.unstage adapter verbs are gone;
 * test-only index-state synthesis routes through `execGit` directly (this
 * file is on the no-raw-git lint allowlist via globs `sdk/src/query/** /
 * *.test.ts`).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createVcsAdapter } from '../vcs/index.js';
import { execGit } from '../vcs/exec.js';

/**
 * Plan 02-08 helper — list the file paths committed at HEAD (equivalent to
 * `git show --name-only --format= HEAD`). The VcsAdapter contract has no
 * first-class "show files of <rev>" verb — `vcs.log` returns LogEntry without
 * file lists, and `vcs.diff` requires a rev pair (HEAD~1..HEAD), which fails
 * for the root commit. Wrap the underlying `git show` invocation behind a
 * single helper so individual test sites no longer carry raw `execSync`
 * strings; a future plan can promote this to a dedicated adapter verb.
 *
 * We intentionally route through `execGit` (the canonical 5-field exec
 * wrapper from sdk/src/vcs/exec.ts) rather than reaching for `child_process`
 * directly — same byte-identity shape as the rest of the adapter, no shell
 * argv parsing involved.
 */
function showCommittedFiles(cwd: string): string[] {
  const r = execGit(cwd, ['show', '--name-only', '--format=', 'HEAD']);
  return r.stdout.split('\n').filter(Boolean);
}

// ─── Test setup ─────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'gsd-commit-'));
  // Plan 02-08 (D-06 paired migration): bootstrap routes through the
  // VcsAdapter's gitOnly.init / gitOnly.configSet verbs. Phase 2 D-03 fix
  // (commit.gpgsign / tag.gpgsign disablers) preserved — without them, fresh
  // CI / local checkouts that have global signing enabled fail at commit time
  // with "fatal: failed to write commit object".
  const vcs = createVcsAdapter(tmpDir, { kind: 'git' });
  if (vcs.kind === 'git') {
    vcs.gitOnly.init();
    vcs.gitOnly.configSet('user.email', 'test@test.com');
    vcs.gitOnly.configSet('user.name', 'Test User');
    vcs.gitOnly.configSet('commit.gpgsign', 'false');
    vcs.gitOnly.configSet('tag.gpgsign', 'false');
  }
  // Create .planning directory
  await mkdir(join(tmpDir, '.planning'), { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ─── execGit ───────────────────────────────────────────────────────────────
//
// Plan 02-08: the local `execGit` 3-field shim in commit.ts has been deleted.
// These tests previously imported it directly; they now exercise the canonical
// `execGit` re-export from `../vcs/index.js` (5-field shape, byte-equivalent
// for the {exitCode, stdout, stderr} subset these tests assert on). Test names
// are preserved verbatim per D-08; the assertions read the same fields.

describe('execGit', () => {
  it('returns exitCode 0 for successful command', async () => {
    const { execGit } = await import('../vcs/index.js');
    const result = execGit(tmpDir, ['status']);
    expect(result.exitCode).toBe(0);
  });

  it('returns non-zero exitCode for failed command', async () => {
    const { execGit } = await import('../vcs/index.js');
    const result = execGit(tmpDir, ['log', '--oneline']);
    // git log fails in empty repo with no commits
    expect(result.exitCode).not.toBe(0);
  });

  it('captures stdout from git command', async () => {
    const { execGit } = await import('../vcs/index.js');
    const result = execGit(tmpDir, ['rev-parse', '--git-dir']);
    expect(result.stdout).toBe('.git');
  });
});

// ─── sanitizeCommitMessage ─────────────────────────────────────────────────

describe('sanitizeCommitMessage', () => {
  it('strips null bytes and zero-width characters', async () => {
    const { sanitizeCommitMessage } = await import('./commit.js');
    const result = sanitizeCommitMessage('hello\u0000\u200Bworld');
    expect(result).toBe('helloworld');
  });

  it('neutralizes injection markers', async () => {
    const { sanitizeCommitMessage } = await import('./commit.js');
    const result = sanitizeCommitMessage('fix: update <system> prompt [SYSTEM] test');
    expect(result).not.toContain('<system>');
    expect(result).not.toContain('[SYSTEM]');
  });

  it('preserves normal commit messages', async () => {
    const { sanitizeCommitMessage } = await import('./commit.js');
    const result = sanitizeCommitMessage('feat(auth): add login endpoint');
    expect(result).toBe('feat(auth): add login endpoint');
  });

  it('returns input unchanged for non-string', async () => {
    const { sanitizeCommitMessage } = await import('./commit.js');
    expect(sanitizeCommitMessage('')).toBe('');
  });
});

// ─── commit ────────────────────────────────────────────────────────────────

describe('commit', () => {
  it('returns committed:false when commit_docs is false and no --force', async () => {
    const { commit } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ commit_docs: false }),
    );
    const result = await commit(['test commit message'], tmpDir);
    expect((result.data as { committed: boolean }).committed).toBe(false);
    expect((result.data as { reason: string }).reason).toContain('commit_docs');
  });

  it('creates commit with --force even when commit_docs is false', async () => {
    const { commit } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ commit_docs: false }),
    );
    await writeFile(join(tmpDir, '.planning', 'STATE.md'), '# State\n');
    const result = await commit(['test commit', '--force'], tmpDir);
    expect((result.data as { committed: boolean }).committed).toBe(true);
    expect((result.data as { hash: string }).hash).toBeTruthy();
  });

  it('stages files and creates commit with correct message', async () => {
    const { commit } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ commit_docs: true }),
    );
    await writeFile(join(tmpDir, '.planning', 'STATE.md'), '# State\n');
    const result = await commit(['docs: update state'], tmpDir);
    expect((result.data as { committed: boolean }).committed).toBe(true);
    expect((result.data as { hash: string }).hash).toBeTruthy();

    // Verify commit message via VcsAdapter (Plan 02-08 D-06): vcs.log
    // returns LogEntry[] with .subject (subject line of HEAD's commit
    // message). Equivalent to `git log -1 --format=%s`.
    const probeVcs = createVcsAdapter(tmpDir, { kind: 'git' });
    const entries = probeVcs.log({ maxCount: 1 });
    expect(entries[0]?.subject).toBe('docs: update state');
  });

  it('returns nothing to commit when no files match', async () => {
    const { commit } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ commit_docs: true }),
    );
    // Commit config.json so .planning/ has no uncommitted changes. Setup uses
    // the VcsAdapter (Plan 02-08 D-06) so there is no raw `execSync('git
    // add ...')` here. Plan 2.1-04: vcs.commit({files}) captures WC state of
    // the listed paths (`git add -A -- <files>` + `git commit -m`), so the
    // upstream explicit stage is unnecessary.
    const setupVcs = createVcsAdapter(tmpDir, { kind: 'git' });
    setupVcs.commit({ message: 'init', files: ['.planning/config.json'] });
    // Now commit with specific nonexistent file (--files separates message from paths, matching CJS argv)
    // Plan 2.1-04 (D-06): WC-state-capture semantic shift — when the named
    // file is missing AND not tracked, the vcs.status pre-probe surfaces no
    // matching entry and the handler short-circuits with `nothing to commit`.
    // (Prior shape: vcs.stage would have failed with stderr referencing the
    // path; D-02 collapses stage onto WC-state-capture commit, so the
    // diagnostic shifts to the pre-probe's empty-scope reason.)
    const result = await commit(['test msg', '--files', 'nonexistent-file.txt'], tmpDir);
    expect((result.data as { committed: boolean }).committed).toBe(false);
    expect((result.data as { reason: string }).reason).toBe('nothing to commit');
  });

  it('commits specific files when provided', async () => {
    const { commit } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ commit_docs: true }),
    );
    await writeFile(join(tmpDir, '.planning', 'STATE.md'), '# State\n');
    await writeFile(join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap\n');
    const result = await commit(['docs: state only', '--files', '.planning/STATE.md'], tmpDir);
    expect((result.data as { committed: boolean }).committed).toBe(true);

    // Verify only STATE.md was committed via the showCommittedFiles helper
    // (Plan 02-08 D-06).
    const files = showCommittedFiles(tmpDir).join('\n');
    expect(files).toContain('STATE.md');
    expect(files).not.toContain('ROADMAP.md');
  });
});

// ─── checkCommit ───────────────────────────────────────────────────────────

describe('checkCommit', () => {
  it('returns can_commit:true when commit_docs is enabled', async () => {
    const { checkCommit } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ commit_docs: true }),
    );
    const result = await checkCommit([], tmpDir);
    expect((result.data as { can_commit: boolean }).can_commit).toBe(true);
  });

  it('returns can_commit:true when commit_docs is not set', async () => {
    const { checkCommit } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({}),
    );
    const result = await checkCommit([], tmpDir);
    expect((result.data as { can_commit: boolean }).can_commit).toBe(true);
  });

  it('returns can_commit:false when commit_docs is false and planning files staged', async () => {
    const { checkCommit } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ commit_docs: false }),
    );
    await writeFile(join(tmpDir, '.planning', 'STATE.md'), '# State\n');
    // Plan 2.1-04 (D-03): vcs.stage is gone; stage via execGit (lint-allowed
    // in *.test.ts globs) to set up the staged-state checkCommit probes.
    execGit(tmpDir, ['add', '--', '.planning/STATE.md']);
    const result = await checkCommit([], tmpDir);
    expect((result.data as { can_commit: boolean }).can_commit).toBe(false);
  });

  it('returns can_commit:true when commit_docs is false but no planning files staged', async () => {
    const { checkCommit } = await import('./commit.js');
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ commit_docs: false }),
    );
    const result = await checkCommit([], tmpDir);
    expect((result.data as { can_commit: boolean }).can_commit).toBe(true);
  });
});

// ─── named-files scope regression (#3061) ─────────────────────────────────
//
// The handler must commit only the paths the caller named, even when the
// caller's git index already had unrelated entries staged before the call.
// Before the fix, `git commit` ran without a path scope and swept those
// pre-staged entries into the commit alongside the requested files. Plan
// 2.1-04 enforces this via vcs.commit({files}) WC-state-capture: only the
// listed files are added (-A) and committed, so pre-staged unrelated index
// entries do not leak in.

describe('commit named-files scope (#3061)', () => {
  // Each test needs an existing HEAD so we can pre-stage a deletion against it.
  beforeEach(async () => {
    await writeFile(join(tmpDir, 'README.md'), 'init\n');
    // Setup via VcsAdapter (Plan 02-08 D-06).
    const setupVcs = createVcsAdapter(tmpDir, { kind: 'git' });
    setupVcs.commit({ message: 'init', files: ['README.md'] });
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ commit_docs: true }),
    );
  });

  it('--files commits only the named paths when an unrelated change is pre-staged', async () => {
    const { commit } = await import('./commit.js');
    await writeFile(join(tmpDir, '.planning', 'STATE.md'), '# State\n');

    // Operator scenario from the issue: a `git rm` is already in the index
    // before the workflow's commit step runs. The adapter has no first-class
    // `rm` verb; this is git's pre-existing-state setup, NOT SDK code under
    // test, so the raw invocation stays per D-08 (test-file allowlist covers).
    // `git rm` synthesis (Plan 2.1-04 D-03): unlink the file and then route
    // through execGit to stage the deletion — git records the deletion in
    // the index when the worktree file is gone. Equivalent to `git rm <file>`
    // (remove from both worktree and index). Routed through execGit because
    // the vcs.stage adapter verb is removed; this file is on the no-raw-git
    // lint allowlist via the `sdk/src/query/** / *.test.ts` glob.
    await unlink(join(tmpDir, 'README.md'));
    execGit(tmpDir, ['add', '-A', '--', 'README.md']);

    const result = await commit(['docs: state only', '--files', '.planning/STATE.md'], tmpDir);
    expect((result.data as { committed: boolean }).committed).toBe(true);

    const committed = showCommittedFiles(tmpDir);
    expect(committed).toContain('.planning/STATE.md');
    expect(committed).not.toContain('README.md');

    // The pre-staged deletion must remain staged-but-uncommitted.
    // Status probe via VcsAdapter (Plan 02-08 D-06): vcs.status({porcelain:
    // true}).raw is byte-equivalent to `git status --porcelain` stdout.
    const status = createVcsAdapter(tmpDir, { kind: 'git' }).status({ porcelain: true }).raw;
    expect(status).toMatch(/^D {2}README\.md/m);
  });

  it('.planning/ fallback commits only planning paths when an unrelated change is pre-staged', async () => {
    const { commit } = await import('./commit.js');
    await writeFile(join(tmpDir, '.planning', 'STATE.md'), '# State\n');

    // `git rm` synthesis (Plan 2.1-04 D-03): unlink the file and then route
    // through execGit to stage the deletion — git records the deletion in
    // the index when the worktree file is gone. Equivalent to `git rm <file>`
    // (remove from both worktree and index). Routed through execGit because
    // the vcs.stage adapter verb is removed; this file is on the no-raw-git
    // lint allowlist via the `sdk/src/query/** / *.test.ts` glob.
    await unlink(join(tmpDir, 'README.md'));
    execGit(tmpDir, ['add', '-A', '--', 'README.md']);

    const result = await commit(['docs: planning'], tmpDir);
    expect((result.data as { committed: boolean }).committed).toBe(true);

    const committed = showCommittedFiles(tmpDir);
    expect(committed).not.toContain('README.md');
    expect(committed.some(f => f.startsWith('.planning/'))).toBe(true);

    // Status probe via VcsAdapter (Plan 02-08 D-06): vcs.status({porcelain:
    // true}).raw is byte-equivalent to `git status --porcelain` stdout.
    const status = createVcsAdapter(tmpDir, { kind: 'git' }).status({ porcelain: true }).raw;
    expect(status).toMatch(/^D {2}README\.md/m);
  });

  it('--amend with --files keeps the amend within the named-file scope', async () => {
    const { commit } = await import('./commit.js');

    // Land an initial planning commit to amend, and assert the setup landed.
    // If it silently failed the amend would target the wrong HEAD and the
    // assertions below would still pass for the wrong reason.
    await writeFile(join(tmpDir, '.planning', 'STATE.md'), '# State v1\n');
    const setup = await commit(['docs: initial state', '--files', '.planning/STATE.md'], tmpDir);
    expect((setup.data as { committed: boolean }).committed).toBe(true);

    // Modify STATE.md, then pre-stage an unrelated change before amending.
    await writeFile(join(tmpDir, '.planning', 'STATE.md'), '# State v2\n');
    // `git rm` synthesis (Plan 2.1-04 D-03): unlink the file and then route
    // through execGit to stage the deletion — git records the deletion in
    // the index when the worktree file is gone. Equivalent to `git rm <file>`
    // (remove from both worktree and index). Routed through execGit because
    // the vcs.stage adapter verb is removed; this file is on the no-raw-git
    // lint allowlist via the `sdk/src/query/** / *.test.ts` glob.
    await unlink(join(tmpDir, 'README.md'));
    execGit(tmpDir, ['add', '-A', '--', 'README.md']);

    const result = await commit(['docs: amended', '--amend', '--files', '.planning/STATE.md'], tmpDir);
    expect((result.data as { committed: boolean }).committed).toBe(true);

    const committed = showCommittedFiles(tmpDir);
    expect(committed).toContain('.planning/STATE.md');
    expect(committed).not.toContain('README.md');

    // Status probe via VcsAdapter (Plan 02-08 D-06): vcs.status({porcelain:
    // true}).raw is byte-equivalent to `git status --porcelain` stdout.
    const status = createVcsAdapter(tmpDir, { kind: 'git' }).status({ porcelain: true }).raw;
    expect(status).toMatch(/^D {2}README\.md/m);
  });
});

// ─── input validation and option-injection safety (#3061 follow-ups) ──────
//
// Two guards that travel with the named-files scope rewrite:
//   1. --files with no usable paths fails fast instead of falling back to
//      .planning/, which would silently swap the caller's intended scope.
//   2. Every git add invocation uses the `--` separator so a path that
//      starts with `-` is treated as a path argument rather than an option.

describe('commit input validation and option safety (#3061)', () => {
  beforeEach(async () => {
    await writeFile(join(tmpDir, 'README.md'), 'init\n');
    // Setup via VcsAdapter (Plan 02-08 D-06).
    const setupVcs = createVcsAdapter(tmpDir, { kind: 'git' });
    setupVcs.commit({ message: 'init', files: ['README.md'] });
    await writeFile(
      join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ commit_docs: true }),
    );
  });

  it('--files with no usable paths is rejected instead of silently using .planning/', async () => {
    const { commit } = await import('./commit.js');
    // Drop a planning change that the .planning/ fallback would otherwise pick up.
    await writeFile(join(tmpDir, '.planning', 'STATE.md'), '# State\n');

    const result = await commit(['msg', '--files', '--no-verify'], tmpDir);
    expect((result.data as { committed: boolean }).committed).toBe(false);
    expect((result.data as { reason: string }).reason).toContain('--files requires at least one path');

    // The handler must not have staged anything: if it had silently fallen
    // back to .planning/, STATE.md would now show up in the staged list.
    // Staged-list probe via VcsAdapter (Plan 02-08 D-06).
    const stagedAfter = createVcsAdapter(tmpDir, { kind: 'git' })
      .diff({ staged: true, nameOnly: true })
      .nameOnly.join('\n');
    expect(stagedAfter).toBe('');
  });

  it('stages a file whose name starts with "-" instead of misparsing it as a git option', async () => {
    const { commit } = await import('./commit.js');
    // A filename like `-A.md` is the canonical option-injection trap:
    // without the `--` separator, `git add -A.md` would be parsed as a flag.
    const dashName = '-A.md';
    await writeFile(join(tmpDir, dashName), 'dash content\n');

    const result = await commit(['feat: add dash file', '--files', dashName], tmpDir);
    expect((result.data as { committed: boolean }).committed).toBe(true);

    const committed = showCommittedFiles(tmpDir);
    expect(committed).toContain(dashName);
  });
});
