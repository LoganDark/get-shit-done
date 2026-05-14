/**
 * Ship preflight checks (`check.ship-ready`).
 *
 * Consolidates git/gh checks from `ship.md` into a single structured query.
 * All subprocess calls are wrapped in try/catch — never throws on git/gh failures.
 * See `.planning/research/decision-routing-audit.md` §3.9.
 */

import { execSync } from 'node:child_process';
import { GSDError, ErrorClassification } from '../errors.js';
import { createVcsAdapter } from '../vcs/index.js';
import { normalizePhaseName } from './helpers.js';
import { checkVerificationStatus } from './check-verification-status.js';
import type { QueryHandler } from './utils.js';

function boolSyncSafe(cmd: string, cwd: string): boolean {
  try {
    execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

export const checkShipReady: QueryHandler = async (args, projectDir) => {
  const raw = args[0];
  if (!raw) {
    throw new GSDError('phase number required for check ship-ready', ErrorClassification.Validation);
  }

  normalizePhaseName(raw); // validate format

  const blockers: string[] = [];

  // git checks — all wrapped in try/catch (route through VcsAdapter; preserve
  // null-on-no-git semantics by treating any thrown error as "git unavailable").
  let clean_tree = false;
  let current_branch: string | null = null;
  let base_branch: string | null = null;
  let remote_configured = false;
  try {
    // B-08: no `kind` override — respect sticky `vcs.adapter` so
    // ship-readiness probes read from the configured backend.
    const vcs = createVcsAdapter(projectDir);
    try {
      const porcelain = vcs.status({ porcelain: true });
      clean_tree = porcelain.raw === '';
    } catch { /* non-git or status failure → leave clean_tree false */ }

    try {
      const bookmarks = vcs.refs.currentBookmarks();
      current_branch = bookmarks[0] ?? null;
    } catch { /* leave null */ }

    if (current_branch && vcs.kind === 'git') {
      try {
        const mergeRef = vcs.gitOnly.configGet(`branch.${current_branch}.merge`);
        if (mergeRef) {
          base_branch = mergeRef.replace('refs/heads/', '');
        } else {
          // Fallback: check if 'main' branch exists, else 'master'
          const mainExists = vcs.refs.bookmarks.exists('main');
          base_branch = mainExists ? 'main' : 'master';
        }
      } catch { /* leave null */ }
    }

    try {
      const remoteList = vcs.refs.remotes();
      remote_configured = remoteList.length > 0;
    } catch { /* leave false */ }
  } catch { /* createVcsAdapter failure (non-git dir, etc.) — all defaults stand */ }

  const on_feature_branch =
    current_branch !== null &&
    current_branch !== 'main' &&
    current_branch !== 'master';

  // gh availability
  const gh_available =
    boolSyncSafe('gh --version', projectDir) ||
    boolSyncSafe('which gh', projectDir);

  // gh_authenticated: advisory — skip actual auth check to avoid slow network call
  const gh_authenticated = false;

  // Verification status
  let verification_passed = false;
  try {
    const verRes = await checkVerificationStatus([raw], projectDir);
    const vdata = verRes.data as Record<string, unknown>;
    verification_passed = vdata.status !== 'fail';
  } catch {
    verification_passed = false;
  }

  // Collect blockers
  if (!verification_passed) blockers.push('verification status is fail or missing');
  if (!clean_tree) blockers.push('working tree is not clean (uncommitted changes)');
  if (!on_feature_branch) blockers.push('not on a feature branch (currently on main/master or unknown)');
  if (!remote_configured) blockers.push('no git remote configured');

  const ready = verification_passed && clean_tree && on_feature_branch && remote_configured;

  return {
    data: {
      ready,
      verification_passed,
      clean_tree,
      on_feature_branch,
      current_branch,
      base_branch,
      remote_configured,
      gh_available,
      gh_authenticated,
      blockers,
    },
  };
};
