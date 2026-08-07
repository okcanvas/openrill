/** OpenRill-owned local protocol. This package has no transport or persistence dependency. */
export const PACKAGE_NAME = "@openrill/protocol" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;

export type OpenRillId = string & { readonly __openRillId: unique symbol };
export type HostLifecycleState = "STARTING" | "LISTENING" | "READY" | "STOPPING" | "STOPPED" | "FAILED";

export interface HostStatusPayload {
  readonly product: "OpenRill";
  readonly version: string;
  readonly profile: string;
  readonly pid: number;
  readonly instanceId: string;
  readonly bind: string;
  readonly port: number;
  readonly startedAt: string;
  readonly state: HostLifecycleState;
  readonly readiness: boolean;
}

export interface HostStopPayload {
  readonly accepted: boolean;
  readonly alreadyStopping: boolean;
  readonly instanceId: string;
}

export {
  OPENRILL_PROTOCOL_FAMILY,
  OPENRILL_PROTOCOL_MIN,
  OPENRILL_PROTOCOL_MAX,
  OPENRILL_WEBSOCKET_PATH,
  OPENRILL_WEBSOCKET_SUBPROTOCOL,
  type AcceptedFrame,
  type CallFrame,
  type ClientProtocolFrame,
  type LocalProtocolFrame,
  type NoticeFrame,
  type OpenFrame,
  type OpenRillClientKind,
  type ProtocolClientMetadata,
  type ProtocolOperationCapability,
  type ProtocolOperationError,
  type ProtocolOperationErrorCode,
  type ProtocolRejectCode,
  type RejectedFrame,
  type ResultFrame,
  type ServerProtocolFrame,
} from "./frames.js";
export {
  isClosedEmptyObject,
  negotiateProtocol,
  parseJsonFrame,
  validateAcceptedFrame,
  validateCallFrame,
  validateDiagnosticsPingInput,
  validateConversationCreateInput,
  validateConversationListInput,
  validateConversationGetInput,
  validateConversationSendInput,
  validateConversationCancelInput,
  validateConversationExecuteInput,
  validateAutomationCreateInput,
  validateAutomationListInput,
  validateAutomationGetInput,
  validateAutomationUpdateInput,
  validateAutomationRunNowInput,
  validateAutomationHistoryInput,
  validateApprovalListInput,
  validateApprovalGetInput,
  validateApprovalResolveInput,
  validateApprovalCancelInput,
  validateUiSnapshotInput,
  validateWorkspaceListInput,
  validateArtifactListInput,
  validateArtifactGetInput,
  validateDelegationListInput,
  validateDelegationGetInput,
  validateDelegationCancelInput,
  validateTaskListInput,
  validateTaskGetInput,
  validateTaskCancelInput,
  validateTaskAuditInput,
  validateTaskReconcileInput,
  validateTaskRetentionPreviewInput,
  validateTaskFlowListInput,
  validateTaskFlowGetInput,
  validateTaskFlowCancelInput,
  validateTaskFlowAuditInput,
  validateTaskFlowReconcileInput,
  validateTaskFlowRetentionPreviewInput,
  validateTaskFlowCreateInput,
  validateTaskFlowRunInput,
  validateTaskFlowWaitInput,
  validateTaskFlowResumeInput,
  validateTaskFlowFinishInput,
  validateTaskFlowFailInput,
  validateGoalExecutionStartInput,
  validateGoalExecutionGetInput,
  validateGoalExecutionResumeInput,
  validateGoalExecutionCancelInput,
  validateGoalExecutionRevisePlanInput,
  validateGoalExecutionAdoptPlanRevisionInput,
  validateGoalExecutionRetryInput,
  validateGoalExecutionResolveBlockerInput,
  validateExtensionListInput,
  validateExtensionGetInput,
  validateExtensionEnableInput,
  validateExtensionDisableInput,
  validateConnectorAccountListInput,
  validateConnectorIngressListInput,
  validateConnectorDeliveryListInput,
  validateConnectorDeadLetterListInput,
  validateConnectorStatusInput,
  validateConnectorDoctorInput,
  validateMaintenanceRetentionPreviewInput,
  validateMaintenanceRetentionPruneInput,
  validateMaintenanceRetentionTombstoneListInput,
  validateNoticeFrame,
  validateOpenFrame,
  validateRejectedFrame,
  validateResultFrame,
  validateServerFrame,
  type ValidationFailure,
  type ValidationResult,
  type ValidationSuccess,
} from "./validation.js";

export interface ProtocolIdentity {
  readonly family: typeof import("./frames.js").OPENRILL_PROTOCOL_FAMILY;
  readonly min: typeof import("./frames.js").OPENRILL_PROTOCOL_MIN;
  readonly max: typeof import("./frames.js").OPENRILL_PROTOCOL_MAX;
}

export function getProtocolIdentity(): ProtocolIdentity {
  return { family: "openrill.local", min: 1, max: 1 };
}

export type { ExtensionListInput, ExtensionGetInput, ExtensionEnableInput, ExtensionDisableInput, ExtensionRuntimeState, PublicExtensionCapability, PublicExtensionIssue, PublicExtensionView } from "./extension-operations.js";
export type { ConnectorAccountListInput, ConnectorIngressListInput, ConnectorDeliveryListInput, ConnectorDeadLetterListInput, ConnectorStatusInput, ConnectorDoctorInput, ConnectorIngressStatus, ConnectorDeliveryStatus, ConnectorDeadLetterStatus, PublicConnectorStatus, PublicConnectorDoctorCheck, PublicConnectorDoctorResult } from "./connector-operations.js";

export type { ConversationCreateInput, ConversationListInput, ConversationGetInput, ConversationSendInput, ConversationCancelInput, ConversationExecuteInput, ConversationExecuteOutput } from "./conversation-operations.js";
export type { ApprovalListInput, ApprovalGetInput, ApprovalResolveInput, ApprovalCancelInput } from "./approval-operations.js";
export type { UiSnapshotInput, WorkspaceListInput, ArtifactListInput, ArtifactGetInput, PublicWorkspaceView, PublicArtifactFileView, PublicArtifactView } from "./control-ui-operations.js";

export type { DelegationListInput, DelegationGetInput, DelegationCancelInput, DelegationListOutput, DelegationCancelOutput, DelegationStatus, DelegationExpectedOutput, PublicDelegationView, PublicDelegationUsageView, PublicDelegationBudgetView, PublicDelegationArtifactView, PublicDelegationEventView } from "./delegation-operations.js";
export type { TaskListInput, TaskGetInput, TaskCancelInput, TaskAuditInput, TaskReconcileInput, TaskRetentionPreviewInput, TaskReconcileMode, TaskStatus, TaskRuntime } from "./task-operations.js";
export type { GoalExecutionOwnerInput, GoalExecutionStartInput, GoalExecutionGetInput, GoalExecutionResumeInput, GoalExecutionCancelInput, GoalExecutionPlanDraftStepInput, GoalExecutionRevisePlanInput, GoalExecutionAdoptPlanRevisionInput, GoalExecutionRetryInput, GoalExecutionResolveBlockerInput } from "./goal-execution-operations.js";
export type { TaskFlowControllerIdentityInput, TaskFlowListInput, TaskFlowGetInput, TaskFlowCancelInput, TaskFlowCreateInput, TaskFlowRunInput, TaskFlowWaitInput, TaskFlowResumeInput, TaskFlowFinishInput, TaskFlowFailInput, TaskFlowAuditInput, TaskFlowReconcileInput, TaskFlowRetentionPreviewInput, TaskFlowReconcileMode, TaskFlowStatus } from "./task-flow-operations.js";

export type { AutomationScheduleInput, AutomationCatchUpPolicyInput, AutomationFailurePolicyInput, AutomationConversationTemplateInput, AutomationCreateInput, AutomationListInput, AutomationGetInput, AutomationUpdateInput, AutomationRunNowInput, AutomationHistoryInput } from "./automation-operations.js";

export type { MaintenanceRetentionEntityKind, MaintenanceRetentionPreviewInput, MaintenanceRetentionPruneInput, MaintenanceRetentionTombstoneListInput } from "./maintenance-operations.js";
