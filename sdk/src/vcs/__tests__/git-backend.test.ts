/**
 * git-backend.test.ts (Plan 01-03 Task 1)
 *
 * Happy-path coverage for every method on GitVcsAdapter — one test per verb.
 * Plan 04 produces the parameterized contract suite that runs across both backends.
 *
 * Tmp-repo lifecycle pattern lifted from sdk/src/query/commit.test.ts:14-30
 * (PATTERNS.md "Tmp-git-repo lifecycle (sdk-side)").
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

import { createGitAdapter, parseDiffCheckPath } from '../backends/git.js';
import { expr } from '../expr.js';
import { toGitRev } from '../parse/git-rev.js';
import { __vcsTestOnly } from '../types.js';
import type { GitVcsAdapter, VcsTestOnly } from '../types.js';

let tmpDir: string;

function initRepo(dir: string): void {
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  // Disable both commit and tag signing — local user gitconfig may enable them
  // globally, which would fail in CI / fresh checkouts without secret keys.
  execSync('git config commit.gpgsign false', { cwd: dir, stdio: 'pipe' });
  execSync('git config tag.gpgsign false', { cwd: dir, stdio: 'pipe' });
  execSync('git commit --allow-empty -m initial', { cwd: dir, stdio: 'pipe' });
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'gsd-git-backend-'));
  initRepo(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('createGitAdapter — commit', () => {
  it('commit({files, message}) stages, commits, returns hash', () => {
    const vcs = createGitAdapter(tmpDir);
    writeFileSync(join(tmpDir, 'a.txt'), 'hello\n');
    const r = vcs.commit({ files: ['a.txt'], message: 'add a' });
    expect(r.exitCode).toBe(0);
    expect(r.hash).toBeTruthy();
    const headHash = execSync('git rev-parse HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();
    expect(r.hash).toBe(headHash);
  });

  it('commit({message}) (no files) runs git commit -am', () => {
    const vcs = createGitAdapter(tmpDir);
    // Stage and commit a tracked file first
    writeFileSync(join(tmpDir, 'tracked.txt'), 'first\n');
    execSync('git add tracked.txt', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m initial-tracked', { cwd: tmpDir, stdio: 'pipe' });
    // Modify it; expect commit({message}) (no files) to commit it via -a
    writeFileSync(join(tmpDir, 'tracked.txt'), 'second\n');
    const r = vcs.commit({ message: 'update tracked' });
    expect(r.exitCode).toBe(0);
    expect(r.hash).toBeTruthy();
  });

  it('commit({files: []}) is rejected as ambiguous (WR-01)', () => {
    const vcs = createGitAdapter(tmpDir);
    expect(() => vcs.commit({ files: [], message: 'oops' })).toThrow(/ambiguous/);
  });

  it('commit({files: [dashName]}) stages a `-`-prefixed filename via `--` separator (CR-01)', () => {
    // Mirrors the #3061 option-injection fence in commit.test.ts:419-431 but
    // routes through `vcs.commit({files: [...]})` directly. A filename like
    // `-A.md` is the canonical option-injection trap: without the `--`
    // separator, `git add -A.md` would be parsed as the `-A`/`--all` flag.
    const vcs = createGitAdapter(tmpDir);
    const dashName = '-A.md';
    writeFileSync(join(tmpDir, dashName), 'dash content\n');
    // Also drop a second unrelated tracked-but-unmodified file to detect the
    // pre-fix behavior: if `git add -A.md` had silently triggered `-A`, then
    // any other modified worktree file would get staged. With the `--`
    // separator, ONLY the dashName file is staged.
    writeFileSync(join(tmpDir, 'sibling.txt'), 'sibling\n');
    const r = vcs.commit({ files: [dashName], message: 'add dash file' });
    expect(r.exitCode).toBe(0);
    expect(r.hash).toBeTruthy();
    // Confirm dashName was committed.
    const showRes = execSync(`git show --name-only --format= HEAD`, {
      cwd: tmpDir,
      encoding: 'utf-8',
    });
    expect(showRes.split('\n').filter(Boolean)).toContain(dashName);
    // And `sibling.txt` was NOT committed (would have been if `-A` had been
    // misparsed as the all-flag, sweeping the whole worktree).
    expect(showRes.split('\n').filter(Boolean)).not.toContain('sibling.txt');
  });
});

describe('createGitAdapter — log', () => {
  it('log({maxCount: 1}) returns one LogEntry with HEAD hash', () => {
    const vcs = createGitAdapter(tmpDir);
    const entries = vcs.log({ maxCount: 1 });
    expect(entries.length).toBe(1);
    const headHash = execSync('git rev-parse HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();
    expect(entries[0].hash).toBe(headHash);
    expect(entries[0].subject).toBe('initial');
  });
});

describe('createGitAdapter — status', () => {
  it('status({porcelain: true}) returns entries for untracked file', () => {
    const vcs = createGitAdapter(tmpDir);
    writeFileSync(join(tmpDir, 'untracked.txt'), 'x\n');
    const r = vcs.status({ porcelain: true });
    const paths = r.entries.map((e) => e.path);
    expect(paths).toContain('untracked.txt');
  });

  it('status({porcelain: true}) returns paths with spaces verbatim (CR-02)', () => {
    // Porcelain v1 (newline mode) C-style-quotes paths containing whitespace
    // unless `-z` is used. The adapter must round-trip the literal filename.
    const vcs = createGitAdapter(tmpDir);
    writeFileSync(join(tmpDir, 'a b.txt'), 'x\n');
    const r = vcs.status({ porcelain: true });
    const paths = r.entries.map((e) => e.path);
    expect(paths).toContain('a b.txt');
    // No literal quote characters should leak through.
    for (const p of paths) {
      expect(p.startsWith('"')).toBe(false);
      expect(p.endsWith('"')).toBe(false);
    }
  });
});

describe('createGitAdapter — diff', () => {
  it('diff({staged: true, nameOnly: true}) returns staged file paths', () => {
    const vcs = createGitAdapter(tmpDir);
    writeFileSync(join(tmpDir, 'staged.txt'), 'x\n');
    execSync('git add staged.txt', { cwd: tmpDir, stdio: 'pipe' });
    const r = vcs.diff({ staged: true, nameOnly: true });
    expect(r.nameOnly).toContain('staged.txt');
  });
});

describe('createGitAdapter — refs', () => {
  it('refs.head and refs.parent are RevisionExpr; toGitRev(refs.head) === HEAD', () => {
    const vcs = createGitAdapter(tmpDir);
    expect(toGitRev(vcs.refs.head)).toBe('HEAD');
    expect(toGitRev(vcs.refs.parent)).toBe('HEAD~1');
  });

  it('refs.bookmarks lifecycle: create → exists → list → delete → exists=false', () => {
    const vcs = createGitAdapter(tmpDir);
    // determine current branch name (could be main or master)
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: tmpDir,
      encoding: 'utf-8',
    }).trim();
    vcs.refs.bookmarks.create('feat', expr.bookmark(currentBranch));
    expect(vcs.refs.bookmarks.exists('feat')).toBe(true);
    const list = vcs.refs.bookmarks.list();
    expect(list.map((b) => b.name)).toContain('feat');
    vcs.refs.bookmarks.delete('feat');
    expect(vcs.refs.bookmarks.exists('feat')).toBe(false);
  });
});

describe('createGitAdapter — workspace', () => {
  it('workspace.add → list → forget round-trip', () => {
    const vcs = createGitAdapter(tmpDir);
    const wtPath = join(tmpDir, '..', `wt-${Date.now()}`);
    try {
      const info = vcs.workspace.add({ path: wtPath });
      expect(info.path).toBe(wtPath);
      expect(info.rev).toBeTruthy();
      // workspace.list delegates to worktree-safety.cjs::readWorktreeList.
      // If that import failed (downstream consumer), surface it as a clear skip.
      let list;
      try {
        list = vcs.workspace.list();
      } catch (err) {
        // RESEARCH Pitfall 5 / W-2: if worktree-safety.cjs is unreachable in this env,
        // the adapter throws with a clear "unreachable" message. Treat as conditional skip.
        if (err instanceof Error && /worktree-safety\.cjs unreachable/.test(err.message)) {
          console.warn('[skip] worktree-safety.cjs unreachable in test env:', err.message);
          return;
        }
        throw err;
      }
      // git canonicalizes the worktree path (e.g. macOS /var → /private/var); compare
      // via realpath on both sides to avoid spurious symlink mismatches in CI/macOS.
      const expected = realpathSync(wtPath);
      const paths = list.map((w) => realpathSync(w.path));
      expect(paths).toContain(expected);
    } finally {
      try {
        vcs.workspace.forget(wtPath);
      } catch {
        // best-effort cleanup
      }
      rmSync(wtPath, { recursive: true, force: true });
    }
  });
});

describe('createGitAdapter — hooks', () => {
  it('hooks.fire returns ExecResult with exitCode 0 when no hook installed', () => {
    const vcs = createGitAdapter(tmpDir);
    const r = vcs.hooks.fire('pre-commit');
    expect(r.exitCode).toBe(0);
  });
});

describe('parseDiffCheckPath (CR-03 / WR-02)', () => {
  it('extracts POSIX path with no embedded colon (pre-2.31 line:line form)', () => {
    expect(parseDiffCheckPath('foo/bar.txt:42: leftover conflict marker')).toBe('foo/bar.txt');
  });
  it('preserves Windows drive-letter path (does not truncate at C:)', () => {
    expect(parseDiffCheckPath('C:\\foo\\bar.txt:42: leftover conflict marker')).toBe(
      'C:\\foo\\bar.txt',
    );
  });
  it('preserves POSIX path containing a literal colon', () => {
    expect(parseDiffCheckPath('weird:name.txt:7: leftover conflict marker')).toBe(
      'weird:name.txt',
    );
  });
  it('returns null on lines without `:line:` pattern', () => {
    expect(parseDiffCheckPath('')).toBe(null);
    expect(parseDiffCheckPath('not-a-diagnostic-line')).toBe(null);
  });
  // WR-02: git ≥ 2.31 emits `path:line:col: description` (extra column slot).
  // The pre-fix greedy regex captured `<path>:<line>` instead of `<path>`,
  // because `.*` consumed `:col:` into the path group.
  it('extracts POSIX path from git ≥ 2.31 `path:line:col: …` form (WR-02)', () => {
    expect(parseDiffCheckPath('foo/bar.txt:42:5: leftover conflict marker')).toBe('foo/bar.txt');
  });
  it('extracts Windows path from git ≥ 2.31 `path:line:col: …` form (WR-02)', () => {
    expect(parseDiffCheckPath('C:\\foo\\bar.txt:42:5: leftover conflict marker')).toBe(
      'C:\\foo\\bar.txt',
    );
  });
  it('extracts POSIX path containing literal colon from `path:line:col: …` form (WR-02)', () => {
    expect(parseDiffCheckPath('weird:name.txt:7:3: leftover conflict marker')).toBe(
      'weird:name.txt',
    );
  });
});

describe('createGitAdapter — findConflicts', () => {
  it('findConflicts({scope: "all"}) returns [] on a clean repo (WR-05)', () => {
    const vcs = createGitAdapter(tmpDir);
    expect(vcs.findConflicts({ scope: 'all' })).toEqual([]);
  });

  it('findConflicts({scope: "all"}) returns INDEX entry when git ls-files --unmerged reports conflicts (WR-05)', () => {
    // Drive a real two-branch merge that conflicts on a single path. The
    // failed `git merge` leaves the index with stage 1/2/3 entries for the
    // conflicted file, which is exactly what `ls-files --unmerged` reports.
    const vcs = createGitAdapter(tmpDir);
    const conflictPath = 'merge-me.txt';
    // Set the initial branch name deterministically (older git defaults to
    // `master`, newer to `main` depending on init.defaultBranch — pick one).
    execSync('git checkout -b main', { cwd: tmpDir, stdio: 'pipe' });
    writeFileSync(join(tmpDir, conflictPath), 'base line\n');
    execSync(`git add ${conflictPath}`, { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m base', { cwd: tmpDir, stdio: 'pipe' });
    // Branch B: our side
    execSync('git checkout -b ours', { cwd: tmpDir, stdio: 'pipe' });
    writeFileSync(join(tmpDir, conflictPath), 'ours line\n');
    execSync(`git add ${conflictPath}`, { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m ours', { cwd: tmpDir, stdio: 'pipe' });
    // Branch C: their side (from base again)
    execSync('git checkout main', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git checkout -b theirs', { cwd: tmpDir, stdio: 'pipe' });
    writeFileSync(join(tmpDir, conflictPath), 'theirs line\n');
    execSync(`git add ${conflictPath}`, { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m theirs', { cwd: tmpDir, stdio: 'pipe' });
    // Now merge ours into theirs — conflicts on conflictPath.
    try {
      execSync('git merge ours --no-edit', { cwd: tmpDir, stdio: 'pipe' });
    } catch {
      // expected — non-zero exit because of conflict
    }

    const r = vcs.findConflicts({ scope: 'all' });
    expect(r.length).toBe(1);
    expect(r[0].rev).toBe('INDEX');
    expect(r[0].scope).toBe('all');
    expect(r[0].paths).toContain(conflictPath);
    // Each path appears once, even though ls-files --unmerged emits three
    // stage entries (1/2/3) per path.
    expect(r[0].paths.filter((p) => p === conflictPath).length).toBe(1);
  });

  it('findConflicts({scope: "working-copy"}) detects conflict markers in working tree', () => {
    const vcs = createGitAdapter(tmpDir);
    // Track a file first; git diff --check requires the file be in the index.
    writeFileSync(join(tmpDir, 'conflict.txt'), 'normal\n');
    execSync('git add conflict.txt', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m add', { cwd: tmpDir, stdio: 'pipe' });
    // Now insert conflict markers in the working tree (do NOT stage — `git diff --check`
    // operates on unstaged working-tree changes against the index).
    writeFileSync(
      join(tmpDir, 'conflict.txt'),
      'a\n<<<<<<< HEAD\nb\n=======\nc\n>>>>>>> branch\n',
    );
    const r = vcs.findConflicts({ scope: 'working-copy' });
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0].paths).toContain('conflict.txt');
  });
});

describe('createGitAdapter — push / fetch', () => {
  it('push({remote, ref}) against tmp bare remote succeeds', () => {
    const vcs = createGitAdapter(tmpDir);
    const remoteDir = mkdtempSync(join(tmpdir(), 'gsd-bare-remote-'));
    try {
      execSync(`git init --bare`, { cwd: remoteDir, stdio: 'pipe' });
      execSync(`git remote add origin "${remoteDir}"`, { cwd: tmpDir, stdio: 'pipe' });
      // Determine current branch
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: tmpDir,
        encoding: 'utf-8',
      }).trim();
      const r = vcs.push({ remote: 'origin', ref: expr.bookmark(branch) });
      expect(r.exitCode).toBe(0);
      // Verify the bare repo got the commit
      const refsListing = execSync('git show-ref', { cwd: remoteDir, encoding: 'utf-8' });
      expect(refsListing).toContain(branch);
    } finally {
      rmSync(remoteDir, { recursive: true, force: true });
    }
  });
});

describe('createGitAdapter — gitOnly', () => {
  it('createAnnotatedTag creates an annotated tag', () => {
    const vcs = createGitAdapter(tmpDir);
    vcs.gitOnly.createAnnotatedTag('v1', 'first', expr.head());
    const refs = execSync('git show-ref refs/tags/v1', { cwd: tmpDir, encoding: 'utf-8' });
    expect(refs).toMatch(/refs\/tags\/v1/);
  });

  it('version() returns a string containing "git version"', () => {
    const vcs = createGitAdapter(tmpDir);
    expect(vcs.gitOnly.version()).toMatch(/git version/);
  });
});

describe('createGitAdapter — __vcsTestOnly snapshot/restore (D-14, strategy 3)', () => {
  it('snapshot returns {id, kind:"git"} and restore reverts working tree', () => {
    const vcs = createGitAdapter(tmpDir);
    const testOnly = (vcs as unknown as Record<symbol, VcsTestOnly>)[__vcsTestOnly];
    const handle = testOnly.snapshot();
    expect(handle.kind).toBe('git');
    expect(handle.id).toBeTruthy();
    // Modify working tree and commit
    writeFileSync(join(tmpDir, 'extra.txt'), 'extra\n');
    execSync('git add extra.txt', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m extra', { cwd: tmpDir, stdio: 'pipe' });
    // Restore should reset HEAD and clean working tree
    testOnly.restore(handle);
    expect(existsSync(join(tmpDir, 'extra.txt'))).toBe(false);
    const headHash = execSync('git rev-parse HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();
    expect(headHash).toBe(handle.id);
  });
});

describe('createGitAdapter — refs.currentBookmarks (2.1-03)', () => {
  it('returns the current bookmark name on a freshly-initialized repo', () => {
    const vcs = createGitAdapter(tmpDir);
    const expected = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: tmpDir,
      encoding: 'utf-8',
    }).trim();
    expect(vcs.refs.currentBookmarks()).toEqual([expected]);
  });

  it('returns the new bookmark name after switching with bookmarks.switch({create:true})', () => {
    const vcs = createGitAdapter(tmpDir);
    vcs.refs.bookmarks.switch('feat-cb', { create: true });
    expect(vcs.refs.currentBookmarks()).toEqual(['feat-cb']);
  });

  it('returns [] when HEAD is detached', () => {
    const vcs = createGitAdapter(tmpDir);
    const sha = execSync('git rev-parse HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();
    execSync(`git checkout ${sha}`, { cwd: tmpDir, stdio: 'pipe' });
    expect(vcs.refs.currentBookmarks()).toEqual([]);
  });
});

describe('createGitAdapter — refs.resolveShort (02-03 Task 1)', () => {
  it('returns a 7-char hex SHA for refs.head after initial commit', () => {
    const vcs = createGitAdapter(tmpDir);
    const short = vcs.refs.resolveShort(vcs.refs.head);
    expect(short).toMatch(/^[0-9a-f]{7,}$/);
  });
});

describe('createGitAdapter — refs.countCommits (02-03 Task 1)', () => {
  it('returns 3 in a repo with 3 commits', () => {
    const vcs = createGitAdapter(tmpDir);
    writeFileSync(join(tmpDir, 'a.txt'), 'a\n');
    vcs.commit({ files: ['a.txt'], message: 'add a' });
    writeFileSync(join(tmpDir, 'b.txt'), 'b\n');
    vcs.commit({ files: ['b.txt'], message: 'add b' });
    expect(vcs.refs.countCommits({ rev: vcs.refs.head })).toBe(3);
  });
});

describe('createGitAdapter — refs.rootCommits (02-03 Task 1)', () => {
  it('returns exactly one SHA in a linear-history repo', () => {
    const vcs = createGitAdapter(tmpDir);
    writeFileSync(join(tmpDir, 'a.txt'), 'a\n');
    vcs.commit({ files: ['a.txt'], message: 'add a' });
    const roots = vcs.refs.rootCommits({ rev: vcs.refs.head });
    expect(roots.length).toBe(1);
    expect(roots[0]).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('createGitAdapter — refs.exists (02-03 Task 1)', () => {
  it('returns true for a known-valid bookmark ref', () => {
    const vcs = createGitAdapter(tmpDir);
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: tmpDir,
      encoding: 'utf-8',
    }).trim();
    expect(vcs.refs.exists(expr.bookmark(branch))).toBe(true);
  });

  it('returns false for a nonexistent bookmark ref', () => {
    const vcs = createGitAdapter(tmpDir);
    expect(vcs.refs.exists(expr.bookmark('definitely-not-a-real-branch-xyz'))).toBe(false);
  });
});

describe('createGitAdapter — refs.isIgnored (02-03 Task 1)', () => {
  it('returns true for a path under a .gitignore-listed directory', () => {
    const vcs = createGitAdapter(tmpDir);
    writeFileSync(join(tmpDir, '.gitignore'), 'node_modules/\n');
    expect(vcs.refs.isIgnored('node_modules/foo')).toBe(true);
  });

  it('returns false for a tracked path', () => {
    const vcs = createGitAdapter(tmpDir);
    writeFileSync(join(tmpDir, 'README.md'), '# readme\n');
    expect(vcs.refs.isIgnored('README.md')).toBe(false);
  });
});

describe('createGitAdapter — refs.remotes (02-03 Task 1)', () => {
  it('returns [] on a repo with no remotes', () => {
    const vcs = createGitAdapter(tmpDir);
    expect(vcs.refs.remotes()).toEqual([]);
  });

  it('returns ["origin"] after git remote add origin', () => {
    const vcs = createGitAdapter(tmpDir);
    execSync('git remote add origin https://example.invalid/repo.git', {
      cwd: tmpDir,
      stdio: 'pipe',
    });
    expect(vcs.refs.remotes()).toEqual(['origin']);
  });
});

describe('createGitAdapter — bookmarks.switch (02-03 Task 1)', () => {
  it('switch({create:true}) creates and switches to the new branch', () => {
    const vcs = createGitAdapter(tmpDir);
    vcs.refs.bookmarks.switch('feature-x', { create: true });
    const cb = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: tmpDir,
      encoding: 'utf-8',
    }).trim();
    expect(cb).toBe('feature-x');
  });

  it('switch(name) without create switches to an existing branch', () => {
    const vcs = createGitAdapter(tmpDir);
    const original = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: tmpDir,
      encoding: 'utf-8',
    }).trim();
    execSync('git checkout -b temp-branch', { cwd: tmpDir, stdio: 'pipe' });
    vcs.refs.bookmarks.switch(original);
    const cb = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: tmpDir,
      encoding: 'utf-8',
    }).trim();
    expect(cb).toBe(original);
  });
});

describe('createGitAdapter — stage / unstage (02-03 Task 1)', () => {
  it('stage([file]) makes file appear in diff({staged:true,nameOnly:true})', () => {
    const vcs = createGitAdapter(tmpDir);
    writeFileSync(join(tmpDir, 'foo.txt'), 'x\n');
    const r = vcs.stage(['foo.txt']);
    expect(r.exitCode).toBe(0);
    const d = vcs.diff({ staged: true, nameOnly: true });
    expect(d.nameOnly).toContain('foo.txt');
  });

  it('unstage([file]) reverts a previously staged add (rm --cached)', () => {
    const vcs = createGitAdapter(tmpDir);
    writeFileSync(join(tmpDir, 'foo.txt'), 'x\n');
    vcs.stage(['foo.txt']);
    const r = vcs.unstage(['foo.txt']);
    expect(r.exitCode).toBe(0);
    const d = vcs.diff({ staged: true, nameOnly: true });
    expect(d.nameOnly).not.toContain('foo.txt');
  });
});

describe('createGitAdapter — log.allRefs (02-03 Task 2)', () => {
  it('log({allRefs:true}) returns commits from non-HEAD refs', () => {
    const vcs = createGitAdapter(tmpDir);
    // Original branch initial commit already exists; create a separate branch
    // with a commit, then move HEAD back. log() default sees only HEAD reach;
    // log({allRefs:true}) sees both.
    const original = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: tmpDir,
      encoding: 'utf-8',
    }).trim();
    execSync('git checkout -b side-branch', { cwd: tmpDir, stdio: 'pipe' });
    writeFileSync(join(tmpDir, 'side.txt'), 'side\n');
    vcs.commit({ files: ['side.txt'], message: 'side branch only' });
    execSync(`git checkout ${original}`, { cwd: tmpDir, stdio: 'pipe' });

    const subjectsHead = vcs.log({ maxCount: 50 }).map((e) => e.subject);
    expect(subjectsHead).not.toContain('side branch only');

    const subjectsAll = vcs.log({ allRefs: true, maxCount: 50 }).map((e) => e.subject);
    expect(subjectsAll).toContain('side branch only');
  });
});

describe('createGitAdapter — diff.nameStatus (02-03 Task 2)', () => {
  it('diff({staged:true,nameStatus:true}) returns nameStatus entries with status letters', () => {
    const vcs = createGitAdapter(tmpDir);
    writeFileSync(join(tmpDir, 'newfile.txt'), 'x\n');
    vcs.stage(['newfile.txt']);
    const d = vcs.diff({ staged: true, nameStatus: true });
    expect(d.nameStatus).toBeTruthy();
    const entry = d.nameStatus!.find((e) => e.path === 'newfile.txt');
    expect(entry).toBeTruthy();
    expect(entry!.status).toBe('A');
  });
});

describe('createGitAdapter — workspace.context (02-03 Task 2 — Blocker 4)', () => {
  it('on main repo, returns mode=main, isLinked=false, gitDir===gitCommonDir', () => {
    // 2.1 D-18: WorkspaceContext.{gitDir,gitCommonDir} moved to GitOnlyOps;
    // narrow on vcs.kind === 'git' to access. createGitAdapter returns
    // GitVcsAdapter directly, so vcs.gitOnly is accessible without narrowing.
    const vcs = createGitAdapter(tmpDir);
    const ctx = vcs.workspace.context();
    expect(ctx.mode).toBe('main');
    expect(ctx.isLinked).toBe(false);
    expect(vcs.gitOnly.gitDir()).toBe(vcs.gitOnly.gitCommonDir());
    // effectiveRoot resolves to the repo root (realpath-equivalent on macOS).
    expect(realpathSync(ctx.effectiveRoot)).toBe(realpathSync(tmpDir));
  });

  it('on linked worktree, gitDir !== gitCommonDir, isLinked=true, mode=linked', () => {
    const vcs = createGitAdapter(tmpDir);
    const wtPath = join(tmpDir, '..', `wt-ctx-${Date.now()}`);
    try {
      execSync(`git worktree add ${wtPath}`, { cwd: tmpDir, stdio: 'pipe' });
      // Build a separate adapter rooted at the linked worktree path.
      const wtVcs = createGitAdapter(wtPath);
      const ctx = wtVcs.workspace.context();
      expect(ctx.isLinked).toBe(true);
      expect(ctx.mode).toBe('linked');
      // 2.1 D-18: linked-worktree predicate now via vcs.gitOnly methods.
      expect(wtVcs.gitOnly.gitDir()).not.toBe(wtVcs.gitOnly.gitCommonDir());
    } finally {
      try {
        execSync(`git worktree remove ${wtPath} --force`, { cwd: tmpDir, stdio: 'pipe' });
      } catch {
        // best-effort cleanup
      }
      rmSync(wtPath, { recursive: true, force: true });
    }
  });
});

describe('createGitAdapter — workspace.prune (02-03 Task 2)', () => {
  it('returns ExecResult with exitCode 0 on a repo with no stale worktrees', () => {
    const vcs = createGitAdapter(tmpDir);
    const r = vcs.workspace.prune();
    expect(r.exitCode).toBe(0);
  });
});

describe('createGitAdapter — gitOnly.init / configGet / configSet (02-03 Task 2)', () => {
  it('init() makes .git/HEAD exist in a fresh empty dir', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'gsd-fresh-'));
    try {
      // createGitAdapter accepts any dir — no check that .git already exists.
      const vcs = createGitAdapter(fresh);
      vcs.gitOnly.init();
      expect(existsSync(join(fresh, '.git', 'HEAD'))).toBe(true);
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  it('configGet returns null for an unknown key, value for a known key', () => {
    const vcs = createGitAdapter(tmpDir);
    expect(vcs.gitOnly.configGet('this.key.does.not.exist')).toBe(null);
    execSync('git config foo.bar baz', { cwd: tmpDir, stdio: 'pipe' });
    expect(vcs.gitOnly.configGet('foo.bar')).toBe('baz');
  });

  it('configSet round-trips with configGet (W2)', () => {
    const vcs = createGitAdapter(tmpDir);
    vcs.gitOnly.configSet('plan0203.test', 'roundtrip');
    expect(vcs.gitOnly.configGet('plan0203.test')).toBe('roundtrip');
  });
});

describe('createGitAdapter — frozen depth', () => {
  it('every nested namespace is frozen', () => {
    const vcs: GitVcsAdapter = createGitAdapter(tmpDir);
    expect(Object.isFrozen(vcs)).toBe(true);
    expect(Object.isFrozen(vcs.refs)).toBe(true);
    expect(Object.isFrozen(vcs.refs.bookmarks)).toBe(true);
    expect(Object.isFrozen(vcs.workspace)).toBe(true);
    expect(Object.isFrozen(vcs.hooks)).toBe(true);
    expect(Object.isFrozen(vcs.gitOnly)).toBe(true);
  });
});

// Sanity: prove the test file actually exercises the readFileSync import (used elsewhere).
void readFileSync;
