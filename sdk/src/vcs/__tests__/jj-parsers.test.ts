/**
 * Phase 3 plan 03-02 Task 2: production parsers + snapshot tests.
 *
 * Pins every jj NDJSON parser's output against fixture files captured from
 * jj 0.41.0. Future jj-version bumps that rename/remove fields trip these
 * snapshot tests loudly (D-14 Renovate-bump gate).
 *
 * Suite layout:
 *   - parseJjLog: 5 unit assertions + 2 toMatchSnapshot
 *   - parseJjOpLog: 3 unit assertions + 1 toMatchSnapshot
 *   - parseJjWorkspaceList: 2 unit assertions + 1 toMatchSnapshot
 *   - jj-id integration: gated by `jj --version` availability; round-trip
 *     and error-shape tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseJjLog } from '../parse/jj-log.js';
import { parseJjOpLog } from '../parse/jj-op-log.js';
import { parseJjWorkspaceList } from '../parse/jj-workspace-list.js';
import { commitIdOf, changeIdOf } from '../parse/jj-id.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
// HERE = sdk/src/vcs/__tests__/  → repo root is 4 levels up.
const FIXTURES_DIR = join(HERE, '..', '..', '..', '..', 'tests', 'fixtures', 'jj-ndjson');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf8');
}

// ─── parseJjLog ──────────────────────────────────────────────────────────────

describe('parseJjLog (Phase 3 plan 03-02 — production parser)', () => {
  it('returns [] on empty input', () => {
    expect(parseJjLog('')).toEqual([]);
  });

  it('maps every field for jj-log-3-commits fixture (3 entries)', () => {
    const fixture = loadFixture('jj-log-3-commits.ndjson');
    const entries = parseJjLog(fixture);
    expect(entries).toHaveLength(3);

    const first = entries[0]!;
    expect(first.hash).toBe('2f5d3b9b1c0d4e5f6a7b8c9d0e1f2a3b4c5d6e7f');
    expect(first.subject).toBe('third commit');
    expect(first.author).toBe('Test');
    expect(first.date).toBe('2026-05-12T10:00:00+00:00');
    expect(first.parents).toEqual(['1111111111111111111111111111111111111111']);
    expect(first.body).toBeUndefined();
  });

  it('extracts body when description has multiple lines (second entry)', () => {
    const fixture = loadFixture('jj-log-3-commits.ndjson');
    const entries = parseJjLog(fixture);
    const second = entries[1]!;
    expect(second.subject).toBe('second commit');
    expect(second.body).toBe('with body line\n');
  });

  it('handles root commit with no parents (third entry)', () => {
    const fixture = loadFixture('jj-log-3-commits.ndjson');
    const entries = parseJjLog(fixture);
    const third = entries[2]!;
    expect(third.parents).toEqual([]);
    expect(third.subject).toBe('first commit');
  });

  it('handles a 2-parent merge entry (jj-log-conflict fixture)', () => {
    const fixture = loadFixture('jj-log-conflict.ndjson');
    const entries = parseJjLog(fixture);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.parents).toHaveLength(2);
    expect(entries[0]!.hash).toBe('deadbeef00000000000000000000000000000000');
  });

  it('throws a typed error on malformed NDJSON (T-03.02-01)', () => {
    expect(() => parseJjLog('{"commit_id":"abc",not-valid-json')).toThrow(
      /parseJjLog: malformed NDJSON line/
    );
  });

  it('matches inline snapshot for jj-log-3-commits.ndjson', () => {
    const fixture = loadFixture('jj-log-3-commits.ndjson');
    expect(parseJjLog(fixture)).toMatchInlineSnapshot(`
      [
        {
          "author": "Test",
          "date": "2026-05-12T10:00:00+00:00",
          "hash": "2f5d3b9b1c0d4e5f6a7b8c9d0e1f2a3b4c5d6e7f",
          "parents": [
            "1111111111111111111111111111111111111111",
          ],
          "subject": "third commit",
        },
        {
          "author": "Test",
          "body": "with body line
      ",
          "date": "2026-05-12T09:00:00+00:00",
          "hash": "1111111111111111111111111111111111111111",
          "parents": [
            "2222222222222222222222222222222222222222",
          ],
          "subject": "second commit",
        },
        {
          "author": "Test",
          "date": "2026-05-12T08:00:00+00:00",
          "hash": "2222222222222222222222222222222222222222",
          "parents": [],
          "subject": "first commit",
        },
      ]
    `);
  });

  it('matches inline snapshot for jj-log-conflict.ndjson', () => {
    const fixture = loadFixture('jj-log-conflict.ndjson');
    expect(parseJjLog(fixture)).toMatchInlineSnapshot(`
      [
        {
          "author": "Test",
          "date": "2026-05-12T11:00:00+00:00",
          "hash": "deadbeef00000000000000000000000000000000",
          "parents": [
            "1234567890123456789012345678901234567890",
            "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
          ],
          "subject": "merge with conflict",
        },
      ]
    `);
  });
});

// ─── parseJjOpLog ────────────────────────────────────────────────────────────

describe('parseJjOpLog (Phase 3 plan 03-02 — production parser)', () => {
  it('returns [] on empty input', () => {
    expect(parseJjOpLog('')).toEqual([]);
  });

  it('maps every field for jj-op-log-2-ops fixture (snapshot + squash)', () => {
    const fixture = loadFixture('jj-op-log-2-ops.ndjson');
    const entries = parseJjOpLog(fixture);
    expect(entries).toHaveLength(2);

    const snap = entries[0]!;
    expect(snap.isSnapshot).toBe(true);
    expect(snap.workspaceName).toBe('default');
    expect(snap.args).toBe('jj log');
    expect(snap.description).toBe('snapshot working copy');
    expect(snap.hostname).toBe('localhost');
    expect(snap.username).toBe('test');
    expect(snap.time.start).toBe('2026-05-12T10:00:00+00:00');
    expect(snap.time.end).toBe('2026-05-12T10:00:01+00:00');

    const squash = entries[1]!;
    expect(squash.isSnapshot).toBe(false);
    expect(squash.workspaceName).toBeNull();
    expect(squash.args).toBe("jj squash -B @ -k -m 'first commit'");
    expect(squash.parents).toEqual([]);
  });

  it('throws a typed error on malformed NDJSON', () => {
    expect(() => parseJjOpLog('{"id":"abc",not-valid')).toThrow(
      /parseJjOpLog: malformed NDJSON line/
    );
  });

  it('matches inline snapshot for jj-op-log-2-ops.ndjson', () => {
    const fixture = loadFixture('jj-op-log-2-ops.ndjson');
    expect(parseJjOpLog(fixture)).toMatchInlineSnapshot(`
      [
        {
          "args": "jj log",
          "description": "snapshot working copy",
          "hostname": "localhost",
          "id": "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
          "isSnapshot": true,
          "parents": [
            "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
          ],
          "time": {
            "end": "2026-05-12T10:00:01+00:00",
            "start": "2026-05-12T10:00:00+00:00",
          },
          "username": "test",
          "workspaceName": "default",
        },
        {
          "args": "jj squash -B @ -k -m 'first commit'",
          "description": "squash commit into parent",
          "hostname": "localhost",
          "id": "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
          "isSnapshot": false,
          "parents": [],
          "time": {
            "end": "2026-05-12T10:00:00+00:00",
            "start": "2026-05-12T09:59:59+00:00",
          },
          "username": "test",
          "workspaceName": null,
        },
      ]
    `);
  });
});

// ─── parseJjWorkspaceList ────────────────────────────────────────────────────

describe('parseJjWorkspaceList (Phase 3 plan 03-02 — production parser)', () => {
  it('returns [] on empty input', () => {
    expect(parseJjWorkspaceList('')).toEqual([]);
  });

  it('maps {name, target.commit_id} → WorkspaceInfo for default workspace', () => {
    const fixture = loadFixture('jj-workspace-list-default.ndjson');
    const entries = parseJjWorkspaceList(fixture);
    expect(entries).toEqual([
      {
        path: 'default',
        rev: '2f5d3b9b1c0d4e5f6a7b8c9d0e1f2a3b4c5d6e7f',
        locked: false, // PITFALL 4: jj has no lock primitive
      },
    ]);
  });

  it('throws a typed error on malformed NDJSON', () => {
    expect(() => parseJjWorkspaceList('{"name":"x",broken')).toThrow(
      /parseJjWorkspaceList: malformed NDJSON line/
    );
  });

  it('matches inline snapshot for jj-workspace-list-default.ndjson', () => {
    const fixture = loadFixture('jj-workspace-list-default.ndjson');
    expect(parseJjWorkspaceList(fixture)).toMatchInlineSnapshot(`
      [
        {
          "locked": false,
          "path": "default",
          "rev": "2f5d3b9b1c0d4e5f6a7b8c9d0e1f2a3b4c5d6e7f",
        },
      ]
    `);
  });
});

// ─── jj-id (integration; gated on jj binary availability) ────────────────────

let jjAvailable = false;
try {
  execSync('jj --version', { stdio: 'pipe' });
  jjAvailable = true;
} catch {
  /* jj not installed — suite below skips */
}

describe.skipIf(!jjAvailable)('jj-id integration (Phase 3 plan 03-02 — real jj 0.41)', () => {
  let dir: string;
  let commitId: string;
  let changeId: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'gsd-jj-id-'));
    execSync('jj git init --colocate', { cwd: dir, stdio: 'pipe' });
    execSync('jj config set --repo user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
    execSync('jj config set --repo user.name "Test"', { cwd: dir, stdio: 'pipe' });
    // Seed a real commit so we have a (changeId, commitId) pair to round-trip.
    writeFileSync(join(dir, 'seed.txt'), 'hello\n');
    execSync("jj squash -B @ -k -m 'test seed commit'", { cwd: dir, stdio: 'pipe' });
    // Capture both IDs directly via jj log templates.
    commitId = execSync(
      "jj --repository . --no-pager --color never --quiet log -r @- -T 'commit_id' --no-graph -n 1",
      { cwd: dir, encoding: 'utf8' }
    ).trim();
    changeId = execSync(
      "jj --repository . --no-pager --color never --quiet log -r @- -T 'change_id' --no-graph -n 1",
      { cwd: dir, encoding: 'utf8' }
    ).trim();
    expect(commitId.length).toBeGreaterThan(10);
    expect(changeId.length).toBeGreaterThan(5);
  });

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('commitIdOf(changeId) returns the matching commit_id (round-trip)', () => {
    const got = commitIdOf(dir, changeId);
    expect(got).toBe(commitId);
  });

  it('changeIdOf(commitId) returns the matching change_id (round-trip)', () => {
    const got = changeIdOf(dir, commitId);
    expect(got).toBe(changeId);
  });

  it('commitIdOf throws VcsExecError-shaped Error on unknown changeId', () => {
    expect(() => commitIdOf(dir, 'nosuchchangeexists')).toThrow(/jj-id\.commitIdOf failed/);
  });
});
