export { StateTaskDeliveryRepository } from "./task-delivery-repository.js";
export type { LedgerTaskNotifyPolicy, LedgerTaskDeliveryStatus, LedgerTaskTerminalOutcome, LedgerTerminalTaskStatus, LedgerTaskCompletionDeliveryRow } from "./task-delivery-repository.js";
export { resolveRequiredTaskCompletion } from "./task-completion.js";
export type { RequiredTaskCompletionResult } from "./task-completion.js";
export { StateTaskFlowRepository } from "./task-flow-repository.js";
export type { LedgerTaskFlowStatus, LedgerTaskFlowRow, LedgerTaskFlowEventRow, LedgerTaskFlowTaskLinkRow } from "./task-flow-repository.js";
export { StateTaskRepository } from "./task-repository.js";
export type { LedgerTaskRuntime, LedgerTaskStatus, LedgerTaskRecoveryState, LedgerTaskRow, LedgerTaskEventRow } from "./task-repository.js";
export { StateGoalRepository } from "./goal-repository.js";
export type { LedgerGoalStatus, LedgerPlanStepStatus, LedgerGoalExecutionStatus, LedgerGoalStepExecutionStatus, LedgerGoalRetryMode, LedgerGoalBlockerType, LedgerGoalBlockerStatus, LedgerGoalRow, LedgerPlanStepRow, LedgerPlanRevisionStepRow, LedgerGoalEventRow, LedgerGoalExecutionRow, LedgerGoalStepExecutionRow, LedgerGoalStepBlockerRow } from "./goal-repository.js";
export { StateMemoryRepository } from "./memory-repository.js";
export type { LedgerMemoryKind, LedgerMemoryRow, LedgerMemorySearchRow } from "./memory-repository.js";
export { StateDelegationRepository } from "./delegation-repository.js";
export type { LedgerDelegationStatus, LedgerDelegationEventType, LedgerDelegationExpectedOutput, LedgerDelegationDeliveryStatus, LedgerDelegationReservationStatus, LedgerDelegationReleaseReason, LedgerRunBudgetEnvelopeRow, LedgerRunDelegationRow, LedgerRunDelegationEventRow, LedgerRunDelegationWaitRow, LedgerRunDelegationResultDeliveryRow, LedgerRunDelegationBudgetReservationRow, LedgerDelegationChargedUsage, LedgerDelegationReservationSummary } from "./delegation-repository.js";
/** OpenRill authoritative profile-scoped SQLite state boundary. */
export const PACKAGE_NAME = "@openrill/state" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "STATE" as const;

export interface PackageIdentity {
  readonly name: typeof PACKAGE_NAME;
  readonly version: typeof PACKAGE_VERSION;
  readonly boundary: typeof PACKAGE_BOUNDARY;
}

export function getPackageIdentity(): PackageIdentity {
  return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY };
}

export { StateDatabaseError, type StateDatabaseErrorCode } from "./errors.js";
export { assertStateIntegrity, inspectStateIntegrity } from "./integrity.js";
export {
  OPENRILL_STATE_SCHEMA_VERSION,
  applyStateMigrations,
  assertStateMigrationSet,
  ensureMigrationLedger,
  loadStateMigrations,
  readAppliedStateMigrations,
  readStateIdentity,
} from "./migrations.js";
export { resolveStatePaths } from "./paths.js";
export { StateRepositories } from "./repository.js";
export { StateConversationRepository } from "./conversation-repository.js";
export { StateWorkspaceRepository } from "./workspace-repository.js";
export { StateApprovalProcessRepository } from "./approval-process-repository.js";
export { StateSkillRepository } from "./skill-repository.js";
export { StateAutomationRepository } from "./automation-repository.js";
export { StateBrowserRepository } from "./browser-repository.js";
export type { LedgerSkillSourceType, LedgerSkillSourceRow, LedgerSkillDiagnosticRow, LedgerSkillRunContextRow, LedgerSkillSnapshotRow } from "./skill-repository.js";
export type { LedgerAutomationScheduleType, LedgerAutomationCatchUpPolicy, LedgerAutomationRunTriggerKind, LedgerAutomationRunStatus, LedgerAutomationJobRow, LedgerAutomationRunRow } from "./automation-repository.js";
export type { LedgerBrowserOperationStatus, LedgerBrowserOperationEventType, LedgerBrowserEvidenceKind, LedgerBrowserOperationRow, LedgerBrowserOperationEventRow, LedgerBrowserEvidenceEventRow } from "./browser-repository.js";
export type { LedgerToolCallStatus, LedgerApprovalStatus, LedgerApprovalDecision, LedgerProcessStatus, LedgerToolCallRow, LedgerApprovalRequestRow, LedgerProcessRecordRow } from "./approval-process-repository.js";
export type { LedgerWorkspaceAccessMode, LedgerWorkspaceTrustState, LedgerWorkspaceArtifactKind, LedgerWorkspaceRegistrationRow, LedgerWorkspaceArtifactRow } from "./workspace-repository.js";
export type { LedgerConversationRow, LedgerMessageRow, LedgerRunRow, LedgerAttemptRow, LedgerEventRow, LedgerSubmissionRow, LedgerProjectionRow, LedgerRunStatus, LedgerAttemptStatus, LedgerRecoveryState, LedgerMessageRole, LedgerModelInvocationRow, LedgerModelInvocationStatus } from "./conversation-repository.js";
export {
  DEFAULT_STATE_BUSY_TIMEOUT_MS,
  STATE_JOURNAL_SIZE_LIMIT_BYTES,
  STATE_WAL_AUTOCHECKPOINT_PAGES,
  openOpenRillStateDatabase,
  type OpenRillStateDatabase,
} from "./database.js";
export type {
  AppliedStateMigration,
  OpenRillStatePaths,
  StateBackupResult,
  StateCheckpointMode,
  StateCheckpointResult,
  StateDatabaseDiagnostics,
  StateHealthCheckRecord,
  StateHealthStatus,
  StateIdentity,
  StateIntegrityResult,
  StateMigration,
} from "./types.js";

export { StateConnectorRepository } from "./connector-repository.js";
export type {
  LedgerConnectorAccountStatus, LedgerConnectorIngressStatus, LedgerConnectorDeliveryStatus,
  LedgerConnectorDeliveryAttemptStatus, LedgerConnectorDeadLetterKind, LedgerConnectorDeadLetterStatus,
  LedgerConnectorAccountRow, LedgerConnectorBindingRow, LedgerConnectorIngressRow,
  LedgerConnectorDeliveryRow, LedgerConnectorDeliveryAttemptRow,
  LedgerConnectorDeliveryReceiptRow, LedgerConnectorDeadLetterRow,
} from "./connector-repository.js";

export { StateRetentionRepository } from "./retention-repository.js";
export type { LedgerRetentionEntityKind, LedgerRetentionProtectionCode, LedgerRetentionCandidateRow, LedgerRetentionCursorRow, LedgerRetentionInspection, LedgerRetentionTombstoneRow, LedgerMaintenanceLeaseRow } from "./retention-repository.js";
