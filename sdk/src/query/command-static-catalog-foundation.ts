import type { QueryHandler } from './utils.js';
import { generateSlug, currentTimestamp } from './utils.js';
import { frontmatterGet } from './frontmatter.js';
import { configGet, configPath, resolveModel } from './config-query.js';
import { stateSnapshot } from './state.js';
import { findPhase, phasePlanIndex } from './phase.js';
import { planTaskStructure } from './plan-task-structure.js';
import { requirementsExtractFromPlans } from './requirements-extract-from-plans.js';
import { progressJson } from './progress.js';
import { frontmatterSet, frontmatterMerge, frontmatterValidate } from './frontmatter-mutation.js';
import { configSet, configSetModelProfile, configNewProject, configEnsureSection } from './config-mutation.js';
import { commit, checkCommit } from './commit.js';
import { fireHookQuery } from './hooks.js';
// Phase 5 plan 05-01 Task 3 (D-33 batch 1): 11 new query verb shims.
import { pushQuery } from './push.js';
import { resetQuery } from './reset.js';
import { revertQuery } from './revert.js';
import { logQuery } from './log.js';
import { statusQuery } from './status.js';
import { diffQuery } from './diff.js';
import { branchListQuery } from './branch-list.js';
import { headRefQuery } from './head-ref.js';
import { currentBranchQuery } from './current-branch.js';
import { mergeQuery } from './merge.js';
import { restoreQuery } from './restore.js';
// Phase 6 plan 06-03: bidirectional VCS migration command.
import { migrateVcsQuery } from './migrate-vcs.js';
import { templateFill, templateSelect } from './template.js';
import { verifySummary, verifyPathExists } from './verify.js';
import { decisionsParse } from './decisions.js';
import { checkDecisionCoveragePlan, checkDecisionCoverageVerify } from './check-decision-coverage.js';
import { commandsList } from './commands-list.js';
import { checkConfigGates } from './config-gates.js';
import { checkAutoMode } from './check-auto-mode.js';
import { checkPhaseReady } from './phase-ready.js';
import { routeNextAction } from './route-next-action.js';
import { detectPhaseType } from './detect-phase-type.js';
import { checkCompletion } from './check-completion.js';
import { checkGates } from './check-gates.js';
import { checkVerificationStatus } from './check-verification-status.js';
import { checkShipReady } from './check-ship-ready.js';

export const FOUNDATION_STATIC_CATALOG: ReadonlyArray<readonly [string, QueryHandler]> = [
  ['generate-slug', generateSlug],
  ['current-timestamp', currentTimestamp],
  ['frontmatter.get', frontmatterGet],
  ['config-get', configGet],
  ['config-path', configPath],
  ['resolve-model', resolveModel],
] as const;

export const STATE_SUPPORT_STATIC_CATALOG: ReadonlyArray<readonly [string, QueryHandler]> = [
  ['state-snapshot', stateSnapshot],
  ['find-phase', findPhase],
  ['phase-plan-index', phasePlanIndex],
  ['plan.task-structure', planTaskStructure],
  ['plan task-structure', planTaskStructure],
  ['requirements.extract-from-plans', requirementsExtractFromPlans],
  ['requirements extract-from-plans', requirementsExtractFromPlans],
] as const;

export const MUTATION_SURFACES_STATIC_CATALOG: ReadonlyArray<readonly [string, QueryHandler]> = [
  ['progress', progressJson],
  ['progress.json', progressJson],
  ['frontmatter.set', frontmatterSet],
  ['frontmatter.merge', frontmatterMerge],
  ['frontmatter.validate', frontmatterValidate],
  ['frontmatter validate', frontmatterValidate],
  ['config-set', configSet],
  ['config-set-model-profile', configSetModelProfile],
  ['config-new-project', configNewProject],
  ['config-ensure-section', configEnsureSection],
  ['commit', commit],
  ['check-commit', checkCommit],
  // Phase 4 plan 06 D-08: SDK query bridge for fireHook (workflow markdown
  // rewrites in Phase 5 replace `git hook run pre-commit` with this).
  ['hooks.fire', fireHookQuery],
  ['hooks fire', fireHookQuery],
  // Phase 5 plan 05-01 Task 3 (D-33 batch 1): 11 new query verb registrations.
  // Workflow markdown rewrites in plans 05-02..05-04 dispatch through these
  // instead of raw `git <verb>` shell-outs.
  ['push', pushQuery],
  ['reset', resetQuery],
  ['revert', revertQuery],
  ['log', logQuery],
  ['status', statusQuery],
  ['diff', diffQuery],
  ['branch-list', branchListQuery],
  ['head-ref', headRefQuery],
  ['current-branch', currentBranchQuery],
  ['merge', mergeQuery],
  ['restore', restoreQuery],
  // Phase 6 plan 06-03: bidirectional VCS migration command.
  ['migrate-vcs', migrateVcsQuery],
  ['template.fill', templateFill],
  ['template.select', templateSelect],
  ['template select', templateSelect],
] as const;

export const VERIFY_DECISION_STATIC_CATALOG: ReadonlyArray<readonly [string, QueryHandler]> = [
  ['verify-summary', verifySummary],
  ['verify.summary', verifySummary],
  ['verify summary', verifySummary],
  ['verify-path-exists', verifyPathExists],
  ['verify.path-exists', verifyPathExists],
  ['verify path-exists', verifyPathExists],
  ['decisions.parse', decisionsParse],
  ['decisions parse', decisionsParse],
  ['check.decision-coverage-plan', checkDecisionCoveragePlan],
  ['check decision-coverage-plan', checkDecisionCoveragePlan],
  ['check.decision-coverage-verify', checkDecisionCoverageVerify],
  ['check decision-coverage-verify', checkDecisionCoverageVerify],
] as const;

export const DECISION_ROUTING_STATIC_CATALOG: ReadonlyArray<readonly [string, QueryHandler]> = [
  ['check.config-gates', checkConfigGates],
  ['check config-gates', checkConfigGates],
  ['check.auto-mode', checkAutoMode],
  ['check auto-mode', checkAutoMode],
  ['check.phase-ready', checkPhaseReady],
  ['check phase-ready', checkPhaseReady],
  ['route.next-action', routeNextAction],
  ['route next-action', routeNextAction],
  ['detect.phase-type', detectPhaseType],
  ['detect phase-type', detectPhaseType],
  ['check.completion', checkCompletion],
  ['check completion', checkCompletion],
  ['check.gates', checkGates],
  ['check gates', checkGates],
  ['check.verification-status', checkVerificationStatus],
  ['check verification-status', checkVerificationStatus],
  ['check.ship-ready', checkShipReady],
  ['check ship-ready', checkShipReady],
  ['commands', commandsList],
] as const;
