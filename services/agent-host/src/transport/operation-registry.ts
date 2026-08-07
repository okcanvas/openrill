import {
  isClosedEmptyObject,
  validateConversationCancelInput,
  validateConversationCreateInput,
  validateConversationGetInput,
  validateConversationListInput,
  validateConversationSendInput,
  validateConversationExecuteInput,
  validateDiagnosticsPingInput,
  validateApprovalListInput,
  validateApprovalGetInput,
  validateApprovalResolveInput,
  validateApprovalCancelInput,
  validateUiSnapshotInput,
  validateWorkspaceListInput,
  validateArtifactListInput,
  validateArtifactGetInput,
  validateAutomationCreateInput,
  validateAutomationListInput,
  validateAutomationGetInput,
  validateAutomationUpdateInput,
  validateAutomationRunNowInput,
  validateAutomationHistoryInput,
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
  type HostStatusPayload,
  type ProtocolOperationCapability,
  type ProtocolOperationError,
  type ResultFrame,
  type ValidationResult,
  type ApprovalListInput,
  type ApprovalGetInput,
  type ApprovalResolveInput,
  type ApprovalCancelInput,
  type UiSnapshotInput,
  type WorkspaceListInput,
  type ArtifactListInput,
  type ArtifactGetInput,
  type AutomationCreateInput,
  type AutomationListInput,
  type AutomationGetInput,
  type AutomationUpdateInput,
  type AutomationRunNowInput,
  type AutomationHistoryInput,
  type DelegationListInput,
  type DelegationGetInput,
  type DelegationCancelInput,
  type ConversationExecuteInput,
  type ConversationExecuteOutput,
  type TaskListInput,
  type TaskGetInput,
  type TaskCancelInput,
  type TaskAuditInput,
  type TaskReconcileInput,
  type TaskRetentionPreviewInput,
  type TaskFlowListInput,
  type TaskFlowGetInput,
  type TaskFlowCancelInput,
  type TaskFlowAuditInput,
  type TaskFlowReconcileInput,
  type TaskFlowRetentionPreviewInput,
  type TaskFlowCreateInput,
  type TaskFlowRunInput,
  type TaskFlowWaitInput,
  type TaskFlowResumeInput,
  type TaskFlowFinishInput,
  type TaskFlowFailInput,
  type GoalExecutionStartInput,
  type GoalExecutionGetInput,
  type GoalExecutionResumeInput,
  type GoalExecutionCancelInput,
  type GoalExecutionRevisePlanInput,
  type GoalExecutionAdoptPlanRevisionInput,
  type GoalExecutionRetryInput,
  type GoalExecutionResolveBlockerInput,
  type ExtensionListInput,
  type ExtensionGetInput,
  type ExtensionEnableInput,
  type ExtensionDisableInput,
  type ConnectorAccountListInput,
  type ConnectorIngressListInput,
  type ConnectorDeliveryListInput,
  type ConnectorDeadLetterListInput,
  type ConnectorStatusInput,
  type ConnectorDoctorInput,
  type MaintenanceRetentionPreviewInput,
  type MaintenanceRetentionPruneInput,
  type MaintenanceRetentionTombstoneListInput,
} from "@openrill/protocol";
import { ConversationError, type ConversationService } from "@openrill/conversations";
import { ApprovalError } from "@openrill/approval";
import { AutomationError } from "@openrill/automation";
import { ControlUiServiceError } from "../control-ui-service.js";
import { TaskError } from "@openrill/tasks";
import { TaskFlowError } from "@openrill/task-flows";
import { GoalExecutorError } from "@openrill/goal-executor";
import { ExtensionRuntimeError } from "../extension-runtime.js";
import { ConnectorError } from "@openrill/connectors";

interface OperationDefinition<I = unknown, O = unknown> {
  readonly name: string;
  readonly permission: string;
  readonly validate: (input: unknown) => ValidationResult<I>;
  readonly invoke: (input: I) => Promise<O> | O;
  readonly validateOutput: (output: unknown) => boolean;
}

export interface ConversationRunHooks {
  readonly schedule: (runId: string) => boolean;
  readonly cancel: (runId: string) => boolean;
  readonly execute: (input: ConversationExecuteInput) => Promise<ConversationExecuteOutput>;
}
export interface ApprovalOperationHooks {
  readonly list: (input: ApprovalListInput) => unknown;
  readonly get: (input: ApprovalGetInput) => unknown;
  readonly resolve: (input: ApprovalResolveInput) => Promise<unknown> | unknown;
  readonly cancel: (input: ApprovalCancelInput) => Promise<unknown> | unknown;
}
export interface AutomationOperationHooks {
  readonly create: (input: AutomationCreateInput) => unknown;
  readonly list: (input: AutomationListInput) => unknown;
  readonly get: (input: AutomationGetInput) => unknown;
  readonly update: (input: AutomationUpdateInput) => unknown;
  readonly runNow: (input: AutomationRunNowInput) => Promise<unknown> | unknown;
  readonly history: (input: AutomationHistoryInput) => unknown;
}

export interface DelegationOperationHooks {
  readonly list: (input: DelegationListInput) => unknown;
  readonly get: (input: DelegationGetInput) => unknown;
  readonly cancel: (input: DelegationCancelInput) => Promise<unknown> | unknown;
}

export interface TaskOperationHooks {
  readonly list: (input: TaskListInput) => unknown;
  readonly get: (input: TaskGetInput) => unknown;
  readonly cancel: (input: TaskCancelInput) => Promise<unknown> | unknown;
  readonly audit: (input: TaskAuditInput) => unknown;
  readonly reconcile: (input: TaskReconcileInput) => Promise<unknown> | unknown;
  readonly retentionPreview: (input: TaskRetentionPreviewInput) => unknown;
}

export interface TaskFlowOperationHooks {
  readonly list: (input: TaskFlowListInput) => unknown;
  readonly get: (input: TaskFlowGetInput) => unknown;
  readonly create: (input: TaskFlowCreateInput) => Promise<unknown> | unknown;
  readonly run: (input: TaskFlowRunInput) => Promise<unknown> | unknown;
  readonly wait: (input: TaskFlowWaitInput) => Promise<unknown> | unknown;
  readonly resume: (input: TaskFlowResumeInput) => Promise<unknown> | unknown;
  readonly finish: (input: TaskFlowFinishInput) => Promise<unknown> | unknown;
  readonly fail: (input: TaskFlowFailInput) => Promise<unknown> | unknown;
  readonly cancel: (input: TaskFlowCancelInput) => Promise<unknown> | unknown;
  readonly audit: (input: TaskFlowAuditInput) => unknown;
  readonly reconcile: (input: TaskFlowReconcileInput) => Promise<unknown> | unknown;
  readonly retentionPreview: (input: TaskFlowRetentionPreviewInput) => unknown;
}

export interface GoalExecutionOperationHooks {
  readonly start: (input: GoalExecutionStartInput) => Promise<unknown> | unknown;
  readonly get: (input: GoalExecutionGetInput) => unknown;
  readonly revisePlan: (input: GoalExecutionRevisePlanInput) => Promise<unknown> | unknown;
  readonly adoptPlanRevision: (input: GoalExecutionAdoptPlanRevisionInput) => Promise<unknown> | unknown;
  readonly retry: (input: GoalExecutionRetryInput) => Promise<unknown> | unknown;
  readonly resolveBlocker: (input: GoalExecutionResolveBlockerInput) => Promise<unknown> | unknown;
  readonly resume: (input: GoalExecutionResumeInput) => Promise<unknown> | unknown;
  readonly cancel: (input: GoalExecutionCancelInput) => Promise<unknown> | unknown;
}

export interface ExtensionOperationHooks {
  readonly list: (input: ExtensionListInput) => unknown;
  readonly get: (input: ExtensionGetInput) => unknown;
  readonly enable: (input: ExtensionEnableInput) => Promise<unknown> | unknown;
  readonly disable: (input: ExtensionDisableInput) => Promise<unknown> | unknown;
}

export interface ConnectorOperationHooks {
  readonly listAccounts: (input: ConnectorAccountListInput) => unknown;
  readonly listIngress: (input: ConnectorIngressListInput) => unknown;
  readonly listDeliveries: (input: ConnectorDeliveryListInput) => unknown;
  readonly listDeadLetters: (input: ConnectorDeadLetterListInput) => unknown;
  readonly status: (input: ConnectorStatusInput) => unknown;
  readonly doctor: (input: ConnectorDoctorInput) => Promise<unknown> | unknown;
}

export interface MaintenanceOperationHooks {
  readonly preview: (input: MaintenanceRetentionPreviewInput) => unknown;
  readonly prune: (input: MaintenanceRetentionPruneInput) => unknown;
  readonly tombstones: (input: MaintenanceRetentionTombstoneListInput) => unknown;
}

export interface ControlUiOperationHooks {
  readonly snapshot: (input: UiSnapshotInput) => unknown;
  readonly listWorkspaces: (input: WorkspaceListInput) => unknown;
  readonly listArtifacts: (input: ArtifactListInput) => unknown;
  readonly getArtifact: (input: ArtifactGetInput) => unknown;
}

function invalid<T>(error: string): ValidationResult<T> {
  return { ok: false, error };
}
function valid<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nullableSafeTimestamp(value: unknown): boolean {
  return value === null || (Number.isSafeInteger(value) && Number(value) >= 0);
}
function isPublicConnectorStatus(output: unknown): boolean {
  if (!isObject(output) || Object.keys(output).length !== 10) return false;
  return typeof output.connectorId === "string" && typeof output.accountId === "string"
    && typeof output.state === "string" && typeof output.healthy === "boolean"
    && Number.isSafeInteger(output.reconnectAttempt) && Number(output.reconnectAttempt) >= 0
    && nullableSafeTimestamp(output.lastConnectedAt) && nullableSafeTimestamp(output.lastEventAt)
    && nullableSafeTimestamp(output.lastIngressAt) && nullableSafeTimestamp(output.lastDeliveryAt)
    && (output.lastErrorCode === null || typeof output.lastErrorCode === "string");
}
function isPublicConnectorDoctor(output: unknown): boolean {
  if (!isObject(output) || Object.keys(output).length !== 4 || typeof output.connectorId !== "string" || typeof output.accountId !== "string" || typeof output.ok !== "boolean" || !Array.isArray(output.checks)) return false;
  return output.checks.every((check) => isObject(check) && Object.keys(check).length === 3
    && typeof check.name === "string"
    && (check.state === "PASSED" || check.state === "FAILED" || check.state === "NOT_RUN")
    && (check.code === null || typeof check.code === "string"));
}
function protocolFailure(error: unknown): ProtocolOperationError | null {
  if (error instanceof ConnectorError) {
    const map: Record<string, ProtocolOperationError["code"]> = {
      CONNECTOR_INVALID_ARGUMENT: "INVALID_INPUT",
      CONNECTOR_ACCOUNT_NOT_FOUND: "NOT_FOUND",
      CONNECTOR_INGRESS_NOT_FOUND: "NOT_FOUND",
      CONNECTOR_DELIVERY_NOT_FOUND: "NOT_FOUND",
      CONNECTOR_ALREADY_REGISTERED: "CONFLICT",
      CONNECTOR_BINDING_CONFLICT: "CONFLICT",
      CONNECTOR_INGRESS_CONFLICT: "CONFLICT",
      CONNECTOR_DELIVERY_CONFLICT: "CONFLICT",
      CONNECTOR_WORKSPACE_ACCESS_DENIED: "ACCESS_DENIED",
    };
    return { code: map[error.code] ?? "INVALID_STATE", message: error.message, retryable: false };
  }
  if (error instanceof ExtensionRuntimeError) {
    const map: Record<string, ProtocolOperationError["code"]> = {
      EXTENSION_NOT_FOUND: "NOT_FOUND",
      EXTENSION_STATE_INVALID: "INVALID_STATE",
      EXTENSION_ACTIVATION_FAILED: "INVALID_STATE",
      EXTENSION_CAPABILITY_CONFLICT: "CONFLICT",
    };
    return { code: map[error.code] ?? "INTERNAL_ERROR", message: error.message, retryable: false };
  }
  if (error instanceof GoalExecutorError) {
    const map: Record<string, ProtocolOperationError["code"]> = {
      GOAL_EXECUTION_NOT_FOUND: "NOT_FOUND", GOAL_EXECUTION_ACCESS_DENIED: "ACCESS_DENIED",
      GOAL_EXECUTION_REVISION_CONFLICT: "CONFLICT", GOAL_EXECUTION_REQUEST_CONFLICT: "CONFLICT",
      GOAL_EXECUTION_ALREADY_EXISTS: "CONFLICT", GOAL_EXECUTION_STATE_INVALID: "INVALID_STATE",
      GOAL_EXECUTION_PLAN_INVALID: "INVALID_INPUT",
    };
    return { code: map[error.code] ?? "INTERNAL_ERROR", message: error.message, retryable: false };
  }
  if (error instanceof TaskFlowError) {
    const map: Record<string, ProtocolOperationError["code"]> = {
      TASK_FLOW_NOT_FOUND: "NOT_FOUND", TASK_FLOW_ACCESS_DENIED: "ACCESS_DENIED",
      TASK_FLOW_REVISION_CONFLICT: "CONFLICT", TASK_FLOW_STATE_INVALID: "INVALID_STATE",
      TASK_FLOW_TASK_CONFLICT: "CONFLICT", TASK_FLOW_REQUEST_CONFLICT: "CONFLICT",
      TASK_FLOW_EXECUTOR_UNAVAILABLE: "INVALID_STATE", TASK_FLOW_INVALID_ARGUMENT: "INVALID_INPUT",
    };
    return { code: map[error.code] ?? "INTERNAL_ERROR", message: error.message, retryable: false };
  }
  if (error instanceof TaskError) {
    const map: Record<string, ProtocolOperationError["code"]> = {
      TASK_NOT_FOUND: "NOT_FOUND", TASK_ACCESS_DENIED: "ACCESS_DENIED",
      TASK_STATE_INVALID: "INVALID_STATE", TASK_INVALID_ARGUMENT: "INVALID_INPUT",
    };
    return { code: map[error.code] ?? "INTERNAL_ERROR", message: error.message, retryable: false };
  }
  if (error instanceof ControlUiServiceError) return { code: "NOT_FOUND", message: error.message, retryable: false };
  if (error instanceof ApprovalError) {
    const map: Record<string, ProtocolOperationError["code"]> = {
      APPROVAL_NOT_FOUND: "NOT_FOUND",
      APPROVAL_VERSION_CONFLICT: "CONFLICT",
      APPROVAL_STATE_INVALID: "INVALID_STATE",
      APPROVAL_BINDING_MISMATCH: "CONFLICT",
      APPROVAL_TOOL_CALL_CONFLICT: "CONFLICT",
    };
    return { code: map[error.code] ?? "INTERNAL_ERROR", message: error.message, retryable: false };
  }
  if (error instanceof AutomationError) {
    const map: Record<string, ProtocolOperationError["code"]> = {
      AUTOMATION_JOB_NOT_FOUND: "NOT_FOUND",
      AUTOMATION_REVISION_CONFLICT: "CONFLICT",
      AUTOMATION_REQUEST_CONFLICT: "CONFLICT",
      AUTOMATION_SCHEDULE_IN_PAST: "INVALID_STATE",
      AUTOMATION_SCHEDULER_NOT_STARTED: "INVALID_STATE",
      AUTOMATION_SCHEDULER_CLOSED: "INVALID_STATE",
      AUTOMATION_LEASE_LOST: "CONFLICT",
      AUTOMATION_INVALID_ARGUMENT: "INVALID_INPUT",
      AUTOMATION_INVALID_SCHEDULE: "INVALID_INPUT",
      AUTOMATION_INVALID_TIMEZONE: "INVALID_INPUT",
    };
    return { code: map[error.code] ?? "INTERNAL_ERROR", message: error.message, retryable: false };
  }
  if (!(error instanceof ConversationError)) return null;
  const map: Record<string, ProtocolOperationError["code"]> = {
    CONVERSATION_NOT_FOUND: "NOT_FOUND",
    RUN_NOT_FOUND: "NOT_FOUND",
    WORKSPACE_ACCESS_DENIED: "ACCESS_DENIED",
    SUBMISSION_CONFLICT: "CONFLICT",
    EVENT_SEQUENCE_CONFLICT: "CONFLICT",
    EVENT_IDEMPOTENCY_CONFLICT: "CONFLICT",
    RUN_STATE_INVALID: "INVALID_STATE",
    INVALID_ARGUMENT: "INVALID_INPUT",
  };
  return { code: map[error.code] ?? "INTERNAL_ERROR", message: error.message, retryable: false };
}
function failure(
  callId: string,
  code: ProtocolOperationError["code"],
  message: string,
  retryable: boolean,
): ResultFrame {
  return { type: "result", callId, ok: false, error: { code, message, retryable } };
}

export class OperationRegistry {
  readonly #operations = new Map<string, OperationDefinition>();

  public register<I, O>(definition: OperationDefinition<I, O>): void {
    if (this.#operations.has(definition.name)) throw new Error(`duplicate operation: ${definition.name}`);
    this.#operations.set(definition.name, definition as OperationDefinition);
  }

  public capabilities(): ProtocolOperationCapability[] {
    return [...this.#operations.values()]
      .map(({ name, permission }) => ({ name, permission }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  public async invoke(callId: string, operation: string, input: unknown): Promise<ResultFrame> {
    const definition = this.#operations.get(operation);
    if (!definition) return failure(callId, "OPERATION_NOT_FOUND", `unknown operation: ${operation}`, false);
    const validation = definition.validate(input);
    if (!validation.ok) return failure(callId, "INVALID_INPUT", validation.error, false);
    try {
      const output = await definition.invoke(validation.value);
      if (!definition.validateOutput(output)) {
        return failure(callId, "INTERNAL_ERROR", "operation returned invalid output", false);
      }
      return { type: "result", callId, ok: true, output };
    } catch (error) {
      const mapped = protocolFailure(error);
      return mapped
        ? { type: "result", callId, ok: false, error: mapped }
        : failure(callId, "INTERNAL_ERROR", "operation failed", false);
    }
  }
}

export function createDefaultOperationRegistry(
  getStatus: () => HostStatusPayload,
  conversations?: ConversationService,
  publishNotice?: (topic: string, data: unknown) => void,
  runHooks?: ConversationRunHooks,
  approvalHooks?: ApprovalOperationHooks,
  controlUiHooks?: ControlUiOperationHooks,
  automationHooks?: AutomationOperationHooks,
  delegationHooks?: DelegationOperationHooks,
  taskHooks?: TaskOperationHooks,
  taskFlowHooks?: TaskFlowOperationHooks,
  goalExecutionHooks?: GoalExecutionOperationHooks,
  extensionHooks?: ExtensionOperationHooks,
  connectorHooks?: ConnectorOperationHooks,
  maintenanceHooks?: MaintenanceOperationHooks,
): OperationRegistry {
  const registry = new OperationRegistry();
  registry.register<Record<string, never>, HostStatusPayload>({
    name: "host.status",
    permission: "host.read",
    validate: (input) => isClosedEmptyObject(input) ? valid(input) : invalid("host.status input must be an empty object"),
    invoke: () => getStatus(),
    validateOutput: (output) => isObject(output) && output.product === "OpenRill" && typeof output.instanceId === "string",
  });
  registry.register<{ echo?: string }, { echo: string | null }>({
    name: "diagnostics.ping",
    permission: "diagnostics.read",
    validate: validateDiagnosticsPingInput,
    invoke: (input) => ({ echo: input.echo ?? null }),
    validateOutput: (output) => isObject(output)
      && Object.keys(output).length === 1
      && (output.echo === null || typeof output.echo === "string"),
  });
  if (extensionHooks) {
    registry.register({
      name: "extension.list",
      permission: "extension.read",
      validate: validateExtensionListInput,
      invoke: extensionHooks.list,
      validateOutput: (output) => isObject(output) && Object.keys(output).length === 1 && Array.isArray(output.items),
    });
    registry.register({
      name: "extension.get",
      permission: "extension.read",
      validate: validateExtensionGetInput,
      invoke: extensionHooks.get,
      validateOutput: (output) => isObject(output) && typeof output.extensionId === "string" && typeof output.state === "string",
    });
    registry.register({
      name: "extension.enable",
      permission: "extension.write",
      validate: validateExtensionEnableInput,
      invoke: extensionHooks.enable,
      validateOutput: (output) => isObject(output) && typeof output.extensionId === "string" && typeof output.state === "string",
    });
    registry.register({
      name: "extension.disable",
      permission: "extension.write",
      validate: validateExtensionDisableInput,
      invoke: extensionHooks.disable,
      validateOutput: (output) => isObject(output) && typeof output.extensionId === "string" && typeof output.state === "string",
    });
  }
  if (connectorHooks) {
    registry.register({ name: "connector.account.list", permission: "connector.read", validate: validateConnectorAccountListInput, invoke: connectorHooks.listAccounts, validateOutput: (output) => isObject(output) && Object.keys(output).length === 1 && Array.isArray(output.items) });
    registry.register({ name: "connector.ingress.list", permission: "connector.read", validate: validateConnectorIngressListInput, invoke: connectorHooks.listIngress, validateOutput: (output) => isObject(output) && Object.keys(output).length === 1 && Array.isArray(output.items) });
    registry.register({ name: "connector.delivery.list", permission: "connector.read", validate: validateConnectorDeliveryListInput, invoke: connectorHooks.listDeliveries, validateOutput: (output) => isObject(output) && Object.keys(output).length === 1 && Array.isArray(output.items) });
    registry.register({ name: "connector.deadLetter.list", permission: "connector.read", validate: validateConnectorDeadLetterListInput, invoke: connectorHooks.listDeadLetters, validateOutput: (output) => isObject(output) && Object.keys(output).length === 1 && Array.isArray(output.items) });
    registry.register({ name: "connector.status", permission: "connector.read", validate: validateConnectorStatusInput, invoke: connectorHooks.status, validateOutput: isPublicConnectorStatus });
    registry.register({ name: "connector.doctor", permission: "connector.read", validate: validateConnectorDoctorInput, invoke: connectorHooks.doctor, validateOutput: isPublicConnectorDoctor });
  }
  if (!conversations) return registry;

  registry.register({
    name: "conversation.create",
    permission: "conversation.write",
    validate: validateConversationCreateInput,
    invoke: (input) => {
      const output = conversations.create(input);
      publishNotice?.("conversation.updated", {
        conversationId: output.conversationId,
        workspaceId: output.workspaceId,
        status: output.status,
      });
      return output;
    },
    validateOutput: (output) => isObject(output)
      && typeof output.conversationId === "string"
      && isObject(output.projection),
  });
  registry.register({
    name: "conversation.list",
    permission: "conversation.read",
    validate: validateConversationListInput,
    invoke: (input) => ({ items: conversations.list(input) }),
    validateOutput: (output) => isObject(output) && Array.isArray(output.items),
  });
  registry.register({
    name: "conversation.get",
    permission: "conversation.read",
    validate: validateConversationGetInput,
    invoke: (input) => conversations.get(input),
    validateOutput: (output) => isObject(output)
      && typeof output.conversationId === "string"
      && Array.isArray(output.messages)
      && Array.isArray(output.runs),
  });
  registry.register({
    name: "conversation.send",
    permission: "conversation.write",
    validate: validateConversationSendInput,
    invoke: (input) => {
      const output = conversations.send(input);
      publishNotice?.("conversation.updated", {
        conversationId: output.conversation.conversationId,
        messageSequence: output.message.sequence,
        runId: output.run.runId,
        replayed: output.replayed,
      });
      publishNotice?.("run.updated", { runId: output.run.runId, status: output.run.status });
      if (!output.replayed) runHooks?.schedule(output.run.runId);
      return output;
    },
    validateOutput: (output) => isObject(output)
      && isObject(output.conversation)
      && isObject(output.message)
      && isObject(output.run)
      && typeof output.replayed === "boolean",
  });
  registry.register({
    name: "conversation.execute",
    permission: "conversation.write",
    validate: validateConversationExecuteInput,
    invoke: (input) => runHooks?.execute(input) ?? Promise.reject(new Error("conversation execution is unavailable")),
    validateOutput: (output) => isObject(output)
      && typeof output.conversationId === "string"
      && typeof output.runId === "string"
      && (output.status === "COMPLETED" || output.status === "FAILED" || output.status === "CANCELLED")
      && typeof output.assistantText === "string"
      && isObject(output.usage),
  });
  registry.register({
    name: "conversation.cancel",
    permission: "conversation.write",
    validate: validateConversationCancelInput,
    invoke: (input) => {
      const output = conversations.cancel(input);
      runHooks?.cancel(output.run.runId);
      publishNotice?.("run.updated", {
        runId: output.run.runId,
        status: output.run.status,
        alreadyTerminal: output.alreadyTerminal,
      });
      return output;
    },
    validateOutput: (output) => isObject(output)
      && isObject(output.run)
      && typeof output.alreadyTerminal === "boolean",
  });

  if (maintenanceHooks) {
    registry.register({
      name: "maintenance.retention.preview", permission: "maintenance.read", validate: validateMaintenanceRetentionPreviewInput,
      invoke: maintenanceHooks.preview,
      validateOutput: (output) => isObject(output) && output.mode === "PREVIEW" && output.state === "COMPLETED"
        && typeof output.workspaceId === "string" && typeof output.generatedAt === "number"
        && typeof output.scanned === "number" && typeof output.eligible === "number" && typeof output.protected === "number"
        && output.pruned === 0 && Array.isArray(output.candidates) && (output.nextCursor === null || typeof output.nextCursor === "string"),
    });
    registry.register({
      name: "maintenance.retention.prune", permission: "maintenance.write", validate: validateMaintenanceRetentionPruneInput,
      invoke: maintenanceHooks.prune,
      validateOutput: (output) => isObject(output) && output.mode === "APPLY" && (output.state === "COMPLETED" || output.state === "LEASE_BUSY" || output.state === "LEASE_LOST")
        && typeof output.workspaceId === "string" && typeof output.pruned === "number" && Array.isArray(output.candidates)
        && (output.nextCursor === null || typeof output.nextCursor === "string"),
    });
    registry.register({
      name: "maintenance.retention.tombstones", permission: "maintenance.read", validate: validateMaintenanceRetentionTombstoneListInput,
      invoke: maintenanceHooks.tombstones,
      validateOutput: (output) => isObject(output) && Array.isArray(output.items),
    });
  }

  if (taskHooks) {
    registry.register({
      name: "task.list", permission: "task.read", validate: validateTaskListInput,
      invoke: (input) => taskHooks.list(input),
      validateOutput: (output) => isObject(output) && Array.isArray(output.items),
    });
    registry.register({
      name: "task.get", permission: "task.read", validate: validateTaskGetInput,
      invoke: (input) => taskHooks.get(input),
      validateOutput: (output) => isObject(output) && isObject(output.task) && Array.isArray(output.events),
    });
    registry.register({
      name: "task.cancel", permission: "task.write", validate: validateTaskCancelInput,
      invoke: (input) => taskHooks.cancel(input),
      validateOutput: (output) => isObject(output) && typeof output.taskId === "string" && typeof output.status === "string",
    });
    registry.register({
      name: "task.audit", permission: "task.read", validate: validateTaskAuditInput,
      invoke: (input) => taskHooks.audit(input),
      validateOutput: (output) => isObject(output) && typeof output.generatedAt === "number" && Array.isArray(output.findings) && isObject(output.summary),
    });
    registry.register({
      name: "task.reconcile", permission: "task.write", validate: validateTaskReconcileInput,
      invoke: (input) => taskHooks.reconcile(input),
      validateOutput: (output) => isObject(output) && (output.mode === "PREVIEW" || output.mode === "APPLY") && Array.isArray(output.decisions) && typeof output.reconciled === "number" && typeof output.lost === "number" && typeof output.retentionScheduled === "number",
    });
    registry.register({
      name: "task.retention.preview", permission: "task.read", validate: validateTaskRetentionPreviewInput,
      invoke: (input) => taskHooks.retentionPreview(input),
      validateOutput: (output) => isObject(output) && typeof output.generatedAt === "number" && Array.isArray(output.candidates) && typeof output.protectedActive === "number",
    });
  }

  if (taskFlowHooks) {
    registry.register({
      name: "taskFlow.list", permission: "taskFlow.read", validate: validateTaskFlowListInput,
      invoke: (input) => taskFlowHooks.list(input),
      validateOutput: (output) => isObject(output) && Array.isArray(output.items),
    });
    registry.register({
      name: "taskFlow.get", permission: "taskFlow.read", validate: validateTaskFlowGetInput,
      invoke: (input) => taskFlowHooks.get(input),
      validateOutput: (output) => isObject(output) && isObject(output.flow) && Array.isArray(output.tasks) && Array.isArray(output.events),
    });
    registry.register({
      name: "taskFlow.create", permission: "taskFlow.write", validate: validateTaskFlowCreateInput,
      invoke: (input) => taskFlowHooks.create(input),
      validateOutput: (output) => isObject(output) && isObject(output.flow) && typeof output.replayed === "boolean",
    });
    registry.register({
      name: "taskFlow.run", permission: "taskFlow.execute", validate: validateTaskFlowRunInput,
      invoke: (input) => taskFlowHooks.run(input),
      validateOutput: (output) => isObject(output) && isObject(output.flow) && isObject(output.task) && isObject(output.run) && typeof output.replayed === "boolean" && typeof output.scheduled === "boolean",
    });
    registry.register({
      name: "taskFlow.wait", permission: "taskFlow.write", validate: validateTaskFlowWaitInput,
      invoke: (input) => taskFlowHooks.wait(input),
      validateOutput: (output) => isObject(output) && typeof output.flowId === "string" && output.status === "WAITING",
    });
    registry.register({
      name: "taskFlow.resume", permission: "taskFlow.write", validate: validateTaskFlowResumeInput,
      invoke: (input) => taskFlowHooks.resume(input),
      validateOutput: (output) => isObject(output) && typeof output.flowId === "string" && (output.status === "QUEUED" || output.status === "RUNNING"),
    });
    registry.register({
      name: "taskFlow.finish", permission: "taskFlow.write", validate: validateTaskFlowFinishInput,
      invoke: (input) => taskFlowHooks.finish(input),
      validateOutput: (output) => isObject(output) && typeof output.flowId === "string" && output.status === "SUCCEEDED",
    });
    registry.register({
      name: "taskFlow.fail", permission: "taskFlow.write", validate: validateTaskFlowFailInput,
      invoke: (input) => taskFlowHooks.fail(input),
      validateOutput: (output) => isObject(output) && typeof output.flowId === "string" && output.status === "FAILED",
    });
    registry.register({
      name: "taskFlow.cancel", permission: "taskFlow.write", validate: validateTaskFlowCancelInput,
      invoke: (input) => taskFlowHooks.cancel(input),
      validateOutput: (output) => isObject(output) && isObject(output.flow) && typeof output.affectedTasks === "number" && typeof output.replayed === "boolean",
    });
    registry.register({
      name: "taskFlow.audit", permission: "taskFlow.read", validate: validateTaskFlowAuditInput,
      invoke: (input) => taskFlowHooks.audit(input),
      validateOutput: (output) => isObject(output) && typeof output.generatedAt === "number" && Array.isArray(output.findings) && isObject(output.summary),
    });
    registry.register({
      name: "taskFlow.reconcile", permission: "taskFlow.write", validate: validateTaskFlowReconcileInput,
      invoke: (input) => taskFlowHooks.reconcile(input),
      validateOutput: (output) => isObject(output) && (output.mode === "PREVIEW" || output.mode === "APPLY") && Array.isArray(output.decisions) && typeof output.cancellationReplayed === "number" && typeof output.cancelled === "number" && typeof output.retentionScheduled === "number",
    });
    registry.register({
      name: "taskFlow.retention.preview", permission: "taskFlow.read", validate: validateTaskFlowRetentionPreviewInput,
      invoke: (input) => taskFlowHooks.retentionPreview(input),
      validateOutput: (output) => isObject(output) && typeof output.generatedAt === "number" && Array.isArray(output.candidates) && typeof output.protectedActive === "number",
    });
  }

  if (goalExecutionHooks) {
    registry.register({
      name: "goalExecution.start", permission: "goalExecution.execute", validate: validateGoalExecutionStartInput,
      invoke: (input) => goalExecutionHooks.start(input),
      validateOutput: (output) => isObject(output) && isObject(output.view) && typeof output.replayed === "boolean" && typeof output.admitted === "boolean" && typeof output.scheduled === "boolean",
    });
    registry.register({
      name: "goalExecution.get", permission: "goalExecution.read", validate: validateGoalExecutionGetInput,
      invoke: (input) => goalExecutionHooks.get(input),
      validateOutput: (output) => isObject(output) && isObject(output.goal) && isObject(output.execution) && Array.isArray(output.steps) && isObject(output.flow),
    });
    registry.register({
      name: "goalExecution.revisePlan", permission: "goalExecution.write", validate: validateGoalExecutionRevisePlanInput,
      invoke: (input) => goalExecutionHooks.revisePlan(input),
      validateOutput: (output) => isObject(output) && typeof output.goalId === "string" && typeof output.previousPlanRevision === "number" && typeof output.planRevision === "number" && Array.isArray(output.steps) && typeof output.replayed === "boolean",
    });
    registry.register({
      name: "goalExecution.adoptPlanRevision", permission: "goalExecution.execute", validate: validateGoalExecutionAdoptPlanRevisionInput,
      invoke: (input) => goalExecutionHooks.adoptPlanRevision(input),
      validateOutput: (output) => isObject(output) && isObject(output.view) && typeof output.previousPlanRevision === "number" && typeof output.planRevision === "number" && typeof output.replayed === "boolean" && typeof output.action === "string" && typeof output.scheduled === "boolean",
    });
    registry.register({
      name: "goalExecution.retry", permission: "goalExecution.execute", validate: validateGoalExecutionRetryInput,
      invoke: (input) => goalExecutionHooks.retry(input),
      validateOutput: (output) => isObject(output) && isObject(output.view) && (output.blocker === null || isObject(output.blocker)) && typeof output.action === "string" && typeof output.scheduled === "boolean",
    });
    registry.register({
      name: "goalExecution.resolveBlocker", permission: "goalExecution.execute", validate: validateGoalExecutionResolveBlockerInput,
      invoke: (input) => goalExecutionHooks.resolveBlocker(input),
      validateOutput: (output) => isObject(output) && isObject(output.view) && isObject(output.blocker) && typeof output.action === "string" && typeof output.scheduled === "boolean",
    });
    registry.register({
      name: "goalExecution.resume", permission: "goalExecution.execute", validate: validateGoalExecutionResumeInput,
      invoke: (input) => goalExecutionHooks.resume(input),
      validateOutput: (output) => isObject(output) && isObject(output.view) && typeof output.action === "string" && typeof output.scheduled === "boolean",
    });
    registry.register({
      name: "goalExecution.cancel", permission: "goalExecution.write", validate: validateGoalExecutionCancelInput,
      invoke: (input) => goalExecutionHooks.cancel(input),
      validateOutput: (output) => isObject(output) && isObject(output.goal) && isObject(output.execution) && Array.isArray(output.steps) && isObject(output.flow),
    });
  }

  if (automationHooks) {
    registry.register({
      name: "automation.create", permission: "automation.write", validate: validateAutomationCreateInput,
      invoke: (input) => automationHooks.create(input),
      validateOutput: (output) => isObject(output) && typeof output.jobId === "string" && typeof output.revision === "number",
    });
    registry.register({
      name: "automation.list", permission: "automation.read", validate: validateAutomationListInput,
      invoke: (input) => automationHooks.list(input),
      validateOutput: (output) => isObject(output) && Array.isArray(output.items),
    });
    registry.register({
      name: "automation.get", permission: "automation.read", validate: validateAutomationGetInput,
      invoke: (input) => automationHooks.get(input),
      validateOutput: (output) => isObject(output) && typeof output.jobId === "string",
    });
    registry.register({
      name: "automation.update", permission: "automation.write", validate: validateAutomationUpdateInput,
      invoke: (input) => automationHooks.update(input),
      validateOutput: (output) => isObject(output) && typeof output.jobId === "string" && typeof output.revision === "number",
    });
    registry.register({
      name: "automation.run_now", permission: "automation.execute", validate: validateAutomationRunNowInput,
      invoke: (input) => automationHooks.runNow(input),
      validateOutput: (output) => isObject(output) && isObject(output.run) && typeof output.created === "boolean",
    });
    registry.register({
      name: "automation.history", permission: "automation.read", validate: validateAutomationHistoryInput,
      invoke: (input) => automationHooks.history(input),
      validateOutput: (output) => isObject(output) && Array.isArray(output.items),
    });
  }

  if (controlUiHooks) {
    registry.register({
      name: "ui.snapshot", permission: "ui.read", validate: validateUiSnapshotInput,
      invoke: (input) => controlUiHooks.snapshot(input),
      validateOutput: (output) => isObject(output) && typeof output.cursor === "number",
    });
    registry.register({
      name: "workspace.list", permission: "workspace.read", validate: validateWorkspaceListInput,
      invoke: (input) => controlUiHooks.listWorkspaces(input),
      validateOutput: (output) => isObject(output) && Array.isArray(output.items),
    });
    registry.register({
      name: "artifact.list", permission: "artifact.read", validate: validateArtifactListInput,
      invoke: (input) => controlUiHooks.listArtifacts(input),
      validateOutput: (output) => isObject(output) && Array.isArray(output.items),
    });
    registry.register({
      name: "artifact.get", permission: "artifact.read", validate: validateArtifactGetInput,
      invoke: (input) => controlUiHooks.getArtifact(input),
      validateOutput: (output) => isObject(output) && typeof output.artifactId === "string" && Array.isArray(output.files),
    });
  }

  if (delegationHooks) {
    registry.register({
      name: "delegation.list", permission: "delegation.read", validate: validateDelegationListInput,
      invoke: (input) => delegationHooks.list(input),
      validateOutput: (output) => isObject(output) && Array.isArray(output.items),
    });
    registry.register({
      name: "delegation.get", permission: "delegation.read", validate: validateDelegationGetInput,
      invoke: (input) => delegationHooks.get(input),
      validateOutput: (output) => isObject(output) && typeof output.delegationId === "string" && Array.isArray(output.events),
    });
    registry.register({
      name: "delegation.cancel", permission: "delegation.write", validate: validateDelegationCancelInput,
      invoke: (input) => delegationHooks.cancel(input),
      validateOutput: (output) => isObject(output) && isObject(output.delegation) && typeof output.affectedRuns === "number" && typeof output.replayed === "boolean",
    });
  }

  if (approvalHooks) {
    registry.register({
      name: "approval.list", permission: "approval.read", validate: validateApprovalListInput,
      invoke: (input) => approvalHooks.list(input),
      validateOutput: (output) => isObject(output) && Array.isArray(output.items),
    });
    registry.register({
      name: "approval.get", permission: "approval.read", validate: validateApprovalGetInput,
      invoke: (input) => approvalHooks.get(input),
      validateOutput: (output) => isObject(output) && typeof output.requestId === "string",
    });
    registry.register({
      name: "approval.resolve", permission: "approval.write", validate: validateApprovalResolveInput,
      invoke: (input) => approvalHooks.resolve(input),
      validateOutput: (output) => isObject(output) && isObject(output.request) && typeof output.replayed === "boolean",
    });
    registry.register({
      name: "approval.cancel", permission: "approval.write", validate: validateApprovalCancelInput,
      invoke: (input) => approvalHooks.cancel(input),
      validateOutput: (output) => isObject(output) && isObject(output.request),
    });
  }
  return registry;
}
