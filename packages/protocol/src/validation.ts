import type { GoalExecutionStartInput, GoalExecutionGetInput, GoalExecutionResumeInput, GoalExecutionCancelInput, GoalExecutionRevisePlanInput, GoalExecutionAdoptPlanRevisionInput, GoalExecutionRetryInput, GoalExecutionResolveBlockerInput } from "./goal-execution-operations.js";
import type { TaskFlowListInput, TaskFlowGetInput, TaskFlowCancelInput, TaskFlowCreateInput, TaskFlowRunInput, TaskFlowWaitInput, TaskFlowResumeInput, TaskFlowFinishInput, TaskFlowFailInput, TaskFlowAuditInput, TaskFlowReconcileInput, TaskFlowRetentionPreviewInput } from "./task-flow-operations.js";
import type { AcceptedFrame, CallFrame, NoticeFrame, OpenFrame, OpenRillClientKind, RejectedFrame, ResultFrame, ServerProtocolFrame } from "./frames.js";
import type { ConversationCancelInput, ConversationCreateInput, ConversationGetInput, ConversationListInput, ConversationSendInput, ConversationExecuteInput } from "./conversation-operations.js";
import type { ApprovalListInput, ApprovalGetInput, ApprovalResolveInput, ApprovalCancelInput } from "./approval-operations.js";
import type { UiSnapshotInput, WorkspaceListInput, ArtifactListInput, ArtifactGetInput } from "./control-ui-operations.js";
import type { AutomationCreateInput, AutomationListInput, AutomationGetInput, AutomationUpdateInput, AutomationRunNowInput, AutomationHistoryInput } from "./automation-operations.js";
import type { DelegationListInput, DelegationGetInput, DelegationCancelInput } from "./delegation-operations.js";
import type { TaskListInput, TaskGetInput, TaskCancelInput, TaskAuditInput, TaskReconcileInput, TaskRetentionPreviewInput } from "./task-operations.js";
import type { ExtensionListInput, ExtensionGetInput, ExtensionEnableInput, ExtensionDisableInput } from "./extension-operations.js";
import type { ConnectorAccountListInput, ConnectorIngressListInput, ConnectorDeliveryListInput, ConnectorDeadLetterListInput, ConnectorStatusInput, ConnectorDoctorInput } from "./connector-operations.js";
import type { MaintenanceRetentionPreviewInput, MaintenanceRetentionPruneInput, MaintenanceRetentionTombstoneListInput } from "./maintenance-operations.js";

export interface ValidationSuccess<T> { readonly ok: true; readonly value: T; }
export interface ValidationFailure { readonly ok: false; readonly error: string; }
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

function success<T>(value: T): ValidationSuccess<T> { return { ok: true, value }; }
function failure(error: string): ValidationFailure { return { ok: false, error }; }
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasExactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key));
}
function boundedString(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}
function boundedInteger(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
}

function boundedJson(value: unknown, max: number): boolean {
  try {
    const text = JSON.stringify(value);
    return text !== undefined && text.length <= max;
  } catch {
    return false;
  }
}

const CLIENT_KINDS = new Set<OpenRillClientKind>(["cli", "web", "desktop", "test"]);

export function validateOpenFrame(value: unknown): ValidationResult<OpenFrame> {
  if (!isRecord(value) || !hasExactKeys(value, ["type", "minProtocol", "maxProtocol", "client", "credential"], ["cursor"])) {
    return failure("open frame must be a closed object");
  }
  if (value.type !== "open") return failure("first frame type must be open");
  if (!boundedInteger(value.minProtocol, 1, 65535) || !boundedInteger(value.maxProtocol, 1, 65535) || value.minProtocol > value.maxProtocol) {
    return failure("invalid protocol range");
  }
  if (value.cursor !== undefined && !boundedInteger(value.cursor, 0, Number.MAX_SAFE_INTEGER)) return failure("invalid notice cursor");
  if (!isRecord(value.client) || !hasExactKeys(value.client, ["id", "version", "platform", "kind"], ["instanceId"])) {
    return failure("client metadata must be a closed object");
  }
  if (!boundedString(value.client.id, 1, 64) || !boundedString(value.client.version, 1, 64) || !boundedString(value.client.platform, 1, 64)) {
    return failure("invalid client metadata");
  }
  if (!CLIENT_KINDS.has(value.client.kind as OpenRillClientKind)) return failure("invalid client kind");
  if (value.client.instanceId !== undefined && !boundedString(value.client.instanceId, 1, 128)) return failure("invalid client instanceId");
  if (!isRecord(value.credential) || !hasExactKeys(value.credential, ["kind", "token"])) return failure("credential must be a closed object");
  if (value.credential.kind !== "profile-token" || !boundedString(value.credential.token, 24, 512)) return failure("invalid profile credential");
  return success(value as unknown as OpenFrame);
}

export function validateCallFrame(value: unknown): ValidationResult<CallFrame> {
  if (!isRecord(value) || !hasExactKeys(value, ["type", "callId", "idempotencyKey", "operation", "input"])) {
    return failure("call frame must be a closed object");
  }
  if (value.type !== "call") return failure("authenticated client frame type must be call");
  if (!boundedString(value.callId, 1, 128)) return failure("invalid callId");
  if (!boundedString(value.idempotencyKey, 1, 128)) return failure("invalid idempotencyKey");
  if (!boundedString(value.operation, 1, 128)) return failure("invalid operation");
  return success(value as unknown as CallFrame);
}

export function parseJsonFrame(text: string): ValidationResult<unknown> {
  try { return success(JSON.parse(text)); }
  catch { return failure("frame must contain valid JSON"); }
}

export function negotiateProtocol(minProtocol: number, maxProtocol: number, serverMin: number, serverMax: number): number | null {
  const selected = Math.min(maxProtocol, serverMax);
  return selected >= Math.max(minProtocol, serverMin) ? selected : null;
}

export function isClosedEmptyObject(value: unknown): value is Record<string, never> {
  return isRecord(value) && Object.keys(value).length === 0;
}


export function validateExtensionListInput(value: unknown): ValidationResult<ExtensionListInput> {
  return isClosedEmptyObject(value) ? success(value) : failure("extension.list input must be an empty object");
}

function validateExtensionIdentityInput(value: unknown, operation: string): ValidationResult<{ readonly extensionId: string }> {
  if (!isRecord(value) || !hasExactKeys(value, ["extensionId"])) return failure(`${operation} input must be a closed object`);
  if (!boundedString(value.extensionId, 1, 64) || !/^[a-z][a-z0-9.-]{0,63}$/.test(value.extensionId)) return failure("invalid extensionId");
  return success(value as { readonly extensionId: string });
}

export function validateExtensionGetInput(value: unknown): ValidationResult<ExtensionGetInput> {
  return validateExtensionIdentityInput(value, "extension.get");
}
export function validateExtensionEnableInput(value: unknown): ValidationResult<ExtensionEnableInput> {
  return validateExtensionIdentityInput(value, "extension.enable");
}
export function validateExtensionDisableInput(value: unknown): ValidationResult<ExtensionDisableInput> {
  return validateExtensionIdentityInput(value, "extension.disable");
}


const CONNECTOR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
function validateConnectorListBase(
  value: unknown,
  operation: string,
  statuses?: ReadonlySet<string>,
): ValidationResult<Record<string, unknown>> {
  const optional = statuses ? ["connectorId", "accountId", "status", "limit"] : ["connectorId"];
  if (!isRecord(value) || !hasExactKeys(value, [], optional)) return failure(`${operation} input must be a closed object`);
  if (value.connectorId !== undefined && (!boundedString(value.connectorId, 1, 128) || !CONNECTOR_ID_PATTERN.test(value.connectorId))) return failure("invalid connectorId");
  if (value.accountId !== undefined && (!boundedString(value.accountId, 1, 128) || !CONNECTOR_ID_PATTERN.test(value.accountId))) return failure("invalid accountId");
  if (value.status !== undefined && (!statuses || typeof value.status !== "string" || !statuses.has(value.status))) return failure(`invalid ${operation} status`);
  if (value.limit !== undefined && !boundedInteger(value.limit, 1, 1000)) return failure("limit must be 1..1000");
  return success(value);
}

export function validateConnectorAccountListInput(value: unknown): ValidationResult<ConnectorAccountListInput> {
  return validateConnectorListBase(value, "connector.account.list") as ValidationResult<ConnectorAccountListInput>;
}
export function validateConnectorIngressListInput(value: unknown): ValidationResult<ConnectorIngressListInput> {
  return validateConnectorListBase(value, "connector.ingress.list", new Set(["RECEIVED", "CLAIMED", "ADOPTED", "IGNORED", "DEAD"])) as ValidationResult<ConnectorIngressListInput>;
}
export function validateConnectorDeliveryListInput(value: unknown): ValidationResult<ConnectorDeliveryListInput> {
  return validateConnectorListBase(value, "connector.delivery.list", new Set(["PENDING", "DELIVERING", "DELIVERED", "SUPPRESSED", "UNCERTAIN", "DEAD"])) as ValidationResult<ConnectorDeliveryListInput>;
}
export function validateConnectorDeadLetterListInput(value: unknown): ValidationResult<ConnectorDeadLetterListInput> {
  return validateConnectorListBase(value, "connector.deadLetter.list", new Set(["OPEN", "RESOLVED"])) as ValidationResult<ConnectorDeadLetterListInput>;
}

function validateConnectorIdentityInput(value: unknown, operation: string): ValidationResult<{ readonly connectorId: string }> {
  if (!isRecord(value) || !hasExactKeys(value, ["connectorId"])) return failure(`${operation} input must be a closed object`);
  if (!boundedString(value.connectorId, 1, 128) || !CONNECTOR_ID_PATTERN.test(value.connectorId)) return failure("invalid connectorId");
  return success(value as { readonly connectorId: string });
}

export function validateConnectorStatusInput(value: unknown): ValidationResult<ConnectorStatusInput> {
  return validateConnectorIdentityInput(value, "connector.status");
}

export function validateConnectorDoctorInput(value: unknown): ValidationResult<ConnectorDoctorInput> {
  return validateConnectorIdentityInput(value, "connector.doctor");
}

export function validateDiagnosticsPingInput(value: unknown): ValidationResult<{ readonly echo?: string }> {
  if (!isRecord(value) || !hasExactKeys(value, [], ["echo"])) return failure("diagnostics.ping input must be a closed object");
  if (value.echo !== undefined && !boundedString(value.echo, 0, 256)) return failure("diagnostics.ping echo must be at most 256 characters");
  return success(value as { readonly echo?: string });
}


const REJECT_CODES = new Set(["INVALID_HANDSHAKE", "PROTOCOL_MISMATCH", "AUTH_FAILED", "RESYNC_REQUIRED"]);
const RESULT_ERROR_CODES = new Set(["INVALID_FRAME", "OPERATION_NOT_FOUND", "INVALID_INPUT", "IDEMPOTENCY_CONFLICT", "INTERNAL_ERROR", "NOT_FOUND", "ACCESS_DENIED", "CONFLICT", "INVALID_STATE"]);

export function validateAcceptedFrame(value: unknown): ValidationResult<AcceptedFrame> {
  if (!isRecord(value) || !hasExactKeys(value, ["type", "protocol", "connectionId", "server", "capabilities", "snapshot", "cursor", "resyncRequired"])) return failure("accepted frame must be a closed object");
  if (value.type !== "accepted" || !boundedInteger(value.protocol, 1, 65535) || !boundedString(value.connectionId, 1, 128) || !boundedInteger(value.cursor, 0, Number.MAX_SAFE_INTEGER) || typeof value.resyncRequired !== "boolean") return failure("invalid accepted frame");
  if (!isRecord(value.server) || !hasExactKeys(value.server, ["product", "version", "profile", "instanceId"]) || value.server.product !== "OpenRill" || !boundedString(value.server.version, 1, 64) || !boundedString(value.server.profile, 1, 64) || !boundedString(value.server.instanceId, 1, 128)) return failure("invalid accepted server identity");
  if (!isRecord(value.capabilities) || !hasExactKeys(value.capabilities, ["operations", "notices"]) || !Array.isArray(value.capabilities.operations) || !Array.isArray(value.capabilities.notices)) return failure("invalid accepted capabilities");
  for (const operation of value.capabilities.operations) if (!isRecord(operation) || !hasExactKeys(operation, ["name", "permission"]) || !boundedString(operation.name, 1, 128) || !boundedString(operation.permission, 1, 128)) return failure("invalid operation capability");
  if (!value.capabilities.notices.every((item) => boundedString(item, 1, 128))) return failure("invalid notice capability");
  return success(value as unknown as AcceptedFrame);
}

export function validateRejectedFrame(value: unknown): ValidationResult<RejectedFrame> {
  if (!isRecord(value) || !hasExactKeys(value, ["type", "code", "message", "retryable"])) return failure("rejected frame must be a closed object");
  if (value.type !== "rejected" || !REJECT_CODES.has(String(value.code)) || !boundedString(value.message, 1, 512) || typeof value.retryable !== "boolean") return failure("invalid rejected frame");
  return success(value as unknown as RejectedFrame);
}

export function validateResultFrame(value: unknown): ValidationResult<ResultFrame> {
  if (!isRecord(value) || !hasExactKeys(value, ["type", "callId", "ok"], ["output", "error", "replayed"])) return failure("result frame must be a closed object");
  if (value.type !== "result" || !boundedString(value.callId, 1, 128) || typeof value.ok !== "boolean" || (value.replayed !== undefined && typeof value.replayed !== "boolean")) return failure("invalid result frame");
  if (value.ok) { if (value.error !== undefined) return failure("successful result cannot contain error"); }
  else {
    if (!isRecord(value.error) || !hasExactKeys(value.error, ["code", "message", "retryable"]) || !RESULT_ERROR_CODES.has(String(value.error.code)) || !boundedString(value.error.message, 1, 512) || typeof value.error.retryable !== "boolean" || value.output !== undefined) return failure("invalid result error");
  }
  return success(value as unknown as ResultFrame);
}

export function validateNoticeFrame(value: unknown): ValidationResult<NoticeFrame> {
  if (!isRecord(value) || !hasExactKeys(value, ["type", "topic", "sequence", "emittedAt", "data"])) return failure("notice frame must be a closed object");
  if (value.type !== "notice" || !boundedString(value.topic, 1, 128) || !boundedInteger(value.sequence, 1, Number.MAX_SAFE_INTEGER) || !boundedString(value.emittedAt, 20, 64)) return failure("invalid notice frame");
  return success(value as unknown as NoticeFrame);
}

export function validateServerFrame(value: unknown): ValidationResult<ServerProtocolFrame> {
  if (!isRecord(value) || typeof value.type !== "string") return failure("server frame must be an object with a type");
  if (value.type === "accepted") return validateAcceptedFrame(value);
  if (value.type === "rejected") return validateRejectedFrame(value);
  if (value.type === "result") return validateResultFrame(value);
  if (value.type === "notice") return validateNoticeFrame(value);
  return failure("unknown server frame type");
}


const WORKSPACE_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const LEDGER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
function validWorkspaceId(value:unknown):value is string { return typeof value === "string" && WORKSPACE_ID_PATTERN.test(value); }
function validLedgerId(value:unknown):value is string { return typeof value === "string" && LEDGER_ID_PATTERN.test(value); }
export function validateConversationCreateInput(value:unknown):ValidationResult<ConversationCreateInput>{
 if(!isRecord(value)||!hasExactKeys(value,["workspaceId"],["modelProfile","title"]))return failure("conversation.create input must be a closed object");
 if(!validWorkspaceId(value.workspaceId))return failure("invalid workspaceId");
 if(value.modelProfile!==undefined&&!boundedString(value.modelProfile,1,64))return failure("invalid modelProfile");
 if(value.title!==undefined&&!boundedString(value.title,1,256))return failure("invalid title");
 return success(value as unknown as ConversationCreateInput);
}
export function validateConversationListInput(value:unknown):ValidationResult<ConversationListInput>{
 if(!isRecord(value)||!hasExactKeys(value,["workspaceId"],["limit"]))return failure("conversation.list input must be a closed object");
 if(!validWorkspaceId(value.workspaceId))return failure("invalid workspaceId");
 if(value.limit!==undefined&&!boundedInteger(value.limit,1,100))return failure("invalid limit");
 return success(value as unknown as ConversationListInput);
}
export function validateConversationGetInput(value:unknown):ValidationResult<ConversationGetInput>{
 if(!isRecord(value)||!hasExactKeys(value,["workspaceId","conversationId"]))return failure("conversation.get input must be a closed object");
 if(!validWorkspaceId(value.workspaceId)||!validLedgerId(value.conversationId))return failure("invalid conversation identity");
 return success(value as unknown as ConversationGetInput);
}
export function validateConversationSendInput(value:unknown):ValidationResult<ConversationSendInput>{
 if(!isRecord(value)||!hasExactKeys(value,["workspaceId","conversationId","submissionKey","text"]))return failure("conversation.send input must be a closed object");
 if(!validWorkspaceId(value.workspaceId)||!validLedgerId(value.conversationId)||!validLedgerId(value.submissionKey))return failure("invalid conversation send identity");
 if(!boundedString(value.text,1,65536))return failure("message text must be 1..65536 characters");
 return success(value as unknown as ConversationSendInput);
}
export function validateConversationCancelInput(value:unknown):ValidationResult<ConversationCancelInput>{
 if(!isRecord(value)||!hasExactKeys(value,["workspaceId","conversationId","runId"]))return failure("conversation.cancel input must be a closed object");
 if(!validWorkspaceId(value.workspaceId)||!validLedgerId(value.conversationId)||!validLedgerId(value.runId))return failure("invalid conversation cancel identity");
 return success(value as unknown as ConversationCancelInput);
}
export function validateConversationExecuteInput(value:unknown):ValidationResult<ConversationExecuteInput>{
 if(!isRecord(value)||!hasExactKeys(value,["workspaceId","text"],["conversationId","modelProfile","title","submissionKey","timeoutMs"]))return failure("conversation.execute input must be a closed object");
 if(!validWorkspaceId(value.workspaceId)||!boundedString(value.text,1,65536))return failure("invalid conversation execute input");
 if(value.conversationId!==undefined&&!validLedgerId(value.conversationId))return failure("invalid conversationId");
 if(value.modelProfile!==undefined&&!boundedString(value.modelProfile,1,64))return failure("invalid modelProfile");
 if(value.title!==undefined&&!boundedString(value.title,1,256))return failure("invalid title");
 if(value.submissionKey!==undefined&&!validLedgerId(value.submissionKey))return failure("invalid submissionKey");
 if(value.timeoutMs!==undefined&&!boundedInteger(value.timeoutMs,1000,900000))return failure("invalid timeoutMs");
 if(value.conversationId!==undefined&&(value.title!==undefined||value.modelProfile!==undefined))return failure("existing conversation execution cannot replace title or modelProfile");
 return success(value as unknown as ConversationExecuteInput);
}


function validAutomationSchedule(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "at") return hasExactKeys(value, ["kind", "at"]) && boundedString(value.at, 20, 64);
  if (value.kind === "interval") return hasExactKeys(value, ["kind", "everyMs", "anchorMs"])
    && boundedInteger(value.everyMs, 1, Number.MAX_SAFE_INTEGER)
    && boundedInteger(value.anchorMs, 0, Number.MAX_SAFE_INTEGER);
  if (value.kind === "cron") return hasExactKeys(value, ["kind", "expression"]) && boundedString(value.expression, 9, 128);
  return false;
}
function validAutomationConversationTemplate(value: unknown): boolean {
  return isRecord(value)
    && hasExactKeys(value, ["workspaceId", "prompt"], ["modelProfile", "title"])
    && validWorkspaceId(value.workspaceId)
    && boundedString(value.prompt, 1, 65_536)
    && (value.modelProfile === undefined || boundedString(value.modelProfile, 1, 64))
    && (value.title === undefined || boundedString(value.title, 1, 256));
}
function validAutomationCatchUp(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "SKIP" || value.kind === "RUN_ONCE") return hasExactKeys(value, ["kind"]);
  return value.kind === "BOUNDED" && hasExactKeys(value, ["kind", "limit"]) && boundedInteger(value.limit, 1, 100);
}
function validAutomationFailurePolicy(value: unknown): boolean {
  return isRecord(value)
    && hasExactKeys(value, ["backoffMs", "maxConsecutiveFailures", "autoDisable"])
    && boundedInteger(value.backoffMs, 0, 30 * 24 * 60 * 60 * 1_000)
    && boundedInteger(value.maxConsecutiveFailures, 1, 100)
    && typeof value.autoDisable === "boolean";
}
function validAutomationPatchField(key: string, value: unknown): boolean {
  if (key === "name") return boundedString(value, 1, 128);
  if (key === "enabled") return typeof value === "boolean";
  if (key === "schedule") return validAutomationSchedule(value);
  if (key === "timezone") return boundedString(value, 1, 128);
  if (key === "conversationTemplate") return validAutomationConversationTemplate(value);
  if (key === "catchUpPolicy") return validAutomationCatchUp(value);
  if (key === "failurePolicy") return validAutomationFailurePolicy(value);
  return false;
}
export function validateAutomationCreateInput(value: unknown): ValidationResult<AutomationCreateInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["name", "enabled", "schedule", "timezone", "conversationTemplate", "catchUpPolicy", "failurePolicy"])) {
    return failure("automation.create input must be a closed object");
  }
  if (!boundedString(value.name, 1, 128) || typeof value.enabled !== "boolean" || !validAutomationSchedule(value.schedule)
    || !boundedString(value.timezone, 1, 128) || !validAutomationConversationTemplate(value.conversationTemplate)
    || !validAutomationCatchUp(value.catchUpPolicy) || !validAutomationFailurePolicy(value.failurePolicy)) {
    return failure("invalid automation.create input");
  }
  return success(value as unknown as AutomationCreateInput);
}
export function validateAutomationListInput(value: unknown): ValidationResult<AutomationListInput> {
  if (!isRecord(value) || !hasExactKeys(value, [], ["includeDisabled", "limit"])) return failure("automation.list input must be a closed object");
  if (value.includeDisabled !== undefined && typeof value.includeDisabled !== "boolean") return failure("invalid includeDisabled");
  if (value.limit !== undefined && !boundedInteger(value.limit, 1, 1000)) return failure("invalid automation list limit");
  return success(value as unknown as AutomationListInput);
}
export function validateAutomationGetInput(value: unknown): ValidationResult<AutomationGetInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["jobId"]) || !validLedgerId(value.jobId)) return failure("invalid automation job identity");
  return success(value as unknown as AutomationGetInput);
}
export function validateAutomationUpdateInput(value: unknown): ValidationResult<AutomationUpdateInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["jobId", "expectedRevision", "patch"])) return failure("automation.update input must be a closed object");
  if (!validLedgerId(value.jobId) || !boundedInteger(value.expectedRevision, 1, Number.MAX_SAFE_INTEGER) || !isRecord(value.patch)) return failure("invalid automation.update identity");
  const patch = value.patch;
  const keys = Object.keys(patch);
  if (keys.length < 1 || keys.some((key) => !validAutomationPatchField(key, patch[key]))) return failure("invalid automation.update patch");
  return success(value as unknown as AutomationUpdateInput);
}
export function validateAutomationRunNowInput(value: unknown): ValidationResult<AutomationRunNowInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["jobId", "requestKey"]) || !validLedgerId(value.jobId) || !validLedgerId(value.requestKey)) return failure("invalid automation.run_now input");
  return success(value as unknown as AutomationRunNowInput);
}
export function validateAutomationHistoryInput(value: unknown): ValidationResult<AutomationHistoryInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["jobId"], ["limit"]) || !validLedgerId(value.jobId)) return failure("invalid automation.history input");
  if (value.limit !== undefined && !boundedInteger(value.limit, 1, 1000)) return failure("invalid automation history limit");
  return success(value as unknown as AutomationHistoryInput);
}


const APPROVAL_STATUSES = new Set(["PENDING","APPROVED","DENIED","EXPIRED","CONSUMED","CANCELLED"]);
const APPROVAL_DECISIONS = new Set(["allow_once","allow_for_conversation","deny"]);
export function validateApprovalListInput(value: unknown): ValidationResult<ApprovalListInput> {
  if (!isRecord(value) || !hasExactKeys(value, [], ["status"])) return failure("approval.list input must be a closed object");
  if (value.status !== undefined && !APPROVAL_STATUSES.has(String(value.status))) return failure("invalid approval status");
  return success(value as unknown as ApprovalListInput);
}
export function validateApprovalGetInput(value: unknown): ValidationResult<ApprovalGetInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["requestId"]) || !validLedgerId(value.requestId)) return failure("invalid approval request identity");
  return success(value as unknown as ApprovalGetInput);
}
export function validateApprovalResolveInput(value: unknown): ValidationResult<ApprovalResolveInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["requestId","expectedVersion","decision"])) return failure("approval.resolve input must be a closed object");
  if (!validLedgerId(value.requestId) || !boundedInteger(value.expectedVersion, 1, Number.MAX_SAFE_INTEGER) || !APPROVAL_DECISIONS.has(String(value.decision))) return failure("invalid approval resolve input");
  return success(value as unknown as ApprovalResolveInput);
}
export function validateApprovalCancelInput(value: unknown): ValidationResult<ApprovalCancelInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["requestId"]) || !validLedgerId(value.requestId)) return failure("invalid approval cancel input");
  return success(value as unknown as ApprovalCancelInput);
}



const DELEGATION_STATUSES = new Set(["CREATED","RUNNING","WAITING","COMPLETED","FAILED","CANCELLED","TIMED_OUT"]);
export function validateDelegationListInput(value: unknown): ValidationResult<DelegationListInput> {
  if (!isRecord(value) || !hasExactKeys(value, [], ["rootRunId", "parentRunId", "status", "limit"])) return failure("delegation.list input must be a closed object");
  if (value.rootRunId !== undefined && !validLedgerId(value.rootRunId)) return failure("invalid delegation root Run identity");
  if (value.parentRunId !== undefined && !validLedgerId(value.parentRunId)) return failure("invalid delegation parent Run identity");
  if (value.rootRunId !== undefined && value.parentRunId !== undefined) return failure("delegation.list accepts rootRunId or parentRunId, not both");
  if (value.status !== undefined && !DELEGATION_STATUSES.has(String(value.status))) return failure("invalid delegation status");
  if (value.limit !== undefined && !boundedInteger(value.limit, 1, 200)) return failure("delegation limit must be 1..200");
  return success(value as unknown as DelegationListInput);
}
export function validateDelegationGetInput(value: unknown): ValidationResult<DelegationGetInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["delegationId"]) || !validLedgerId(value.delegationId)) return failure("invalid delegation identity");
  return success(value as unknown as DelegationGetInput);
}
export function validateDelegationCancelInput(value: unknown): ValidationResult<DelegationCancelInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["delegationId"]) || !validLedgerId(value.delegationId)) return failure("invalid delegation cancel input");
  return success(value as unknown as DelegationCancelInput);
}

export function validateUiSnapshotInput(value: unknown): ValidationResult<UiSnapshotInput> {
  return isClosedEmptyObject(value) ? success(value) : failure("ui.snapshot input must be an empty object");
}
export function validateWorkspaceListInput(value: unknown): ValidationResult<WorkspaceListInput> {
  return isClosedEmptyObject(value) ? success(value) : failure("workspace.list input must be an empty object");
}
export function validateArtifactListInput(value: unknown): ValidationResult<ArtifactListInput> {
  if (!isRecord(value) || !hasExactKeys(value, [], ["runId", "limit"])) return failure("artifact.list input must be a closed object");
  if (value.runId !== undefined && !validLedgerId(value.runId)) return failure("invalid artifact run identity");
  if (value.limit !== undefined && !boundedInteger(value.limit, 1, 100)) return failure("artifact limit must be 1..100");
  return success(value as unknown as ArtifactListInput);
}
export function validateArtifactGetInput(value: unknown): ValidationResult<ArtifactGetInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["artifactId"]) || !validLedgerId(value.artifactId)) return failure("invalid artifact identity");
  return success(value as unknown as ArtifactGetInput);
}


const TASK_STATUSES = new Set(["QUEUED","RUNNING","SUCCEEDED","FAILED","TIMED_OUT","CANCELLED","LOST"]);
const TASK_RUNTIMES = new Set(["CONVERSATION","DELEGATION","AUTOMATION"]);
export function validateTaskListInput(value: unknown): ValidationResult<TaskListInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId"], ["status", "runtime", "limit"])) return failure("task.list input must be a closed object");
  if (!validWorkspaceId(value.workspaceId)) return failure("invalid task workspace identity");
  if (value.status !== undefined && !TASK_STATUSES.has(String(value.status))) return failure("invalid task status");
  if (value.runtime !== undefined && !TASK_RUNTIMES.has(String(value.runtime))) return failure("invalid task runtime");
  if (value.limit !== undefined && !boundedInteger(value.limit, 1, 200)) return failure("task limit must be 1..200");
  return success(value as unknown as TaskListInput);
}
export function validateTaskGetInput(value: unknown): ValidationResult<TaskGetInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "taskId"]) || !validWorkspaceId(value.workspaceId) || !validLedgerId(value.taskId)) return failure("invalid task identity");
  return success(value as unknown as TaskGetInput);
}
export function validateTaskCancelInput(value: unknown): ValidationResult<TaskCancelInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "taskId"]) || !validWorkspaceId(value.workspaceId) || !validLedgerId(value.taskId)) return failure("invalid task cancel input");
  return success(value as unknown as TaskCancelInput);
}
export function validateTaskAuditInput(value: unknown): ValidationResult<TaskAuditInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId"], ["limit"]) || !validWorkspaceId(value.workspaceId)) return failure("invalid task audit input");
  if (value.limit !== undefined && !boundedInteger(value.limit, 1, 200)) return failure("task audit limit must be 1..200");
  return success(value as unknown as TaskAuditInput);
}
export function validateTaskReconcileInput(value: unknown): ValidationResult<TaskReconcileInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "mode"], ["limit"]) || !validWorkspaceId(value.workspaceId) || (value.mode !== "PREVIEW" && value.mode !== "APPLY")) return failure("invalid task reconcile input");
  if (value.limit !== undefined && !boundedInteger(value.limit, 1, 200)) return failure("task reconcile limit must be 1..200");
  return success(value as unknown as TaskReconcileInput);
}
export function validateTaskRetentionPreviewInput(value: unknown): ValidationResult<TaskRetentionPreviewInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId"], ["limit"]) || !validWorkspaceId(value.workspaceId)) return failure("invalid task retention preview input");
  if (value.limit !== undefined && !boundedInteger(value.limit, 1, 200)) return failure("task retention preview limit must be 1..200");
  return success(value as unknown as TaskRetentionPreviewInput);
}


const TASK_FLOW_STATUSES = new Set(["QUEUED","RUNNING","WAITING","BLOCKED","SUCCEEDED","FAILED","CANCELLED","LOST"]);
export function validateTaskFlowListInput(value: unknown): ValidationResult<TaskFlowListInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "ownerKey"], ["status", "controllerId", "limit"])) return failure("taskFlow.list input must be a closed object");
  if (!validWorkspaceId(value.workspaceId)) return failure("invalid task flow workspace identity");
  if (!validLedgerId(value.ownerKey)) return failure("invalid task flow owner identity");
  if (value.status !== undefined && !TASK_FLOW_STATUSES.has(String(value.status))) return failure("invalid task flow status");
  if (value.controllerId !== undefined && (typeof value.controllerId !== "string" || value.controllerId.trim().length < 1 || value.controllerId.trim().length > 128)) return failure("invalid task flow controller identity");
  if (value.limit !== undefined && !boundedInteger(value.limit, 1, 200)) return failure("task flow limit must be 1..200");
  return success(value as unknown as TaskFlowListInput);
}
export function validateTaskFlowGetInput(value: unknown): ValidationResult<TaskFlowGetInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "ownerKey", "flowId"]) || !validWorkspaceId(value.workspaceId) || !validLedgerId(value.ownerKey) || !validLedgerId(value.flowId)) return failure("invalid task flow identity");
  return success(value as unknown as TaskFlowGetInput);
}
export function validateTaskFlowCancelInput(value: unknown): ValidationResult<TaskFlowCancelInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "ownerKey", "flowId", "expectedRevision"]) || !validWorkspaceId(value.workspaceId) || !validLedgerId(value.ownerKey) || !validLedgerId(value.flowId) || !boundedInteger(value.expectedRevision, 1, Number.MAX_SAFE_INTEGER)) return failure("invalid task flow cancel input");
  return success(value as unknown as TaskFlowCancelInput);
}
export function validateTaskFlowAuditInput(value: unknown): ValidationResult<TaskFlowAuditInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "ownerKey"], ["limit"]) || !validWorkspaceId(value.workspaceId) || !validLedgerId(value.ownerKey)) return failure("invalid task flow audit input");
  if (value.limit !== undefined && !boundedInteger(value.limit, 1, 200)) return failure("task flow audit limit must be 1..200");
  return success(value as unknown as TaskFlowAuditInput);
}
export function validateTaskFlowReconcileInput(value: unknown): ValidationResult<TaskFlowReconcileInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "ownerKey", "mode"], ["limit"]) || !validWorkspaceId(value.workspaceId) || !validLedgerId(value.ownerKey) || (value.mode !== "PREVIEW" && value.mode !== "APPLY")) return failure("invalid task flow reconcile input");
  if (value.limit !== undefined && !boundedInteger(value.limit, 1, 200)) return failure("task flow reconcile limit must be 1..200");
  return success(value as unknown as TaskFlowReconcileInput);
}
export function validateTaskFlowRetentionPreviewInput(value: unknown): ValidationResult<TaskFlowRetentionPreviewInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "ownerKey"], ["limit"]) || !validWorkspaceId(value.workspaceId) || !validLedgerId(value.ownerKey)) return failure("invalid task flow retention preview input");
  if (value.limit !== undefined && !boundedInteger(value.limit, 1, 200)) return failure("task flow retention preview limit must be 1..200");
  return success(value as unknown as TaskFlowRetentionPreviewInput);
}


function validTaskFlowControllerIdentity(value: Record<string, unknown>): boolean {
  return validWorkspaceId(value.workspaceId)
    && validLedgerId(value.ownerKey)
    && boundedString(value.controllerId, 1, 128);
}

export function validateTaskFlowCreateInput(value: unknown): ValidationResult<TaskFlowCreateInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "ownerKey", "controllerId", "requestKey", "goal"], ["currentStep", "state", "status"])) return failure("taskFlow.create input must be a closed object");
  if (!validTaskFlowControllerIdentity(value) || !boundedString(value.requestKey, 1, 128) || !boundedString(value.goal, 1, 65_536)) return failure("invalid task flow create identity");
  if (value.currentStep !== undefined && value.currentStep !== null && !boundedString(value.currentStep, 1, 256)) return failure("invalid task flow current step");
  if (value.state !== undefined && !boundedJson(value.state, 262_144)) return failure("invalid task flow state");
  if (value.status !== undefined && value.status !== "QUEUED" && value.status !== "RUNNING") return failure("invalid initial task flow status");
  return success(value as unknown as TaskFlowCreateInput);
}

export function validateTaskFlowRunInput(value: unknown): ValidationResult<TaskFlowRunInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "ownerKey", "controllerId", "flowId", "expectedRevision", "requestKey", "stepKey", "text"])) return failure("taskFlow.run input must be a closed object");
  if (!validTaskFlowControllerIdentity(value) || !validLedgerId(value.flowId) || !boundedInteger(value.expectedRevision, 1, Number.MAX_SAFE_INTEGER)) return failure("invalid task flow run identity");
  if (!boundedString(value.requestKey, 1, 128) || !boundedString(value.stepKey, 1, 256) || !boundedString(value.text, 1, 65_536)) return failure("invalid task flow child input");
  return success(value as unknown as TaskFlowRunInput);
}

export function validateTaskFlowWaitInput(value: unknown): ValidationResult<TaskFlowWaitInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "ownerKey", "controllerId", "flowId", "expectedRevision"], ["currentStep", "state", "wait"])) return failure("taskFlow.wait input must be a closed object");
  if (!validTaskFlowControllerIdentity(value) || !validLedgerId(value.flowId) || !boundedInteger(value.expectedRevision, 1, Number.MAX_SAFE_INTEGER)) return failure("invalid task flow wait identity");
  if (value.currentStep !== undefined && value.currentStep !== null && !boundedString(value.currentStep, 1, 256)) return failure("invalid task flow current step");
  if (value.state !== undefined && !boundedJson(value.state, 262_144)) return failure("invalid task flow state");
  if (value.wait !== undefined && !boundedJson(value.wait, 262_144)) return failure("invalid task flow wait state");
  return success(value as unknown as TaskFlowWaitInput);
}

export function validateTaskFlowResumeInput(value: unknown): ValidationResult<TaskFlowResumeInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "ownerKey", "controllerId", "flowId", "expectedRevision"], ["status", "currentStep", "state"])) return failure("taskFlow.resume input must be a closed object");
  if (!validTaskFlowControllerIdentity(value) || !validLedgerId(value.flowId) || !boundedInteger(value.expectedRevision, 1, Number.MAX_SAFE_INTEGER)) return failure("invalid task flow resume identity");
  if (value.status !== undefined && value.status !== "QUEUED" && value.status !== "RUNNING") return failure("invalid resumed task flow status");
  if (value.currentStep !== undefined && value.currentStep !== null && !boundedString(value.currentStep, 1, 256)) return failure("invalid task flow current step");
  if (value.state !== undefined && !boundedJson(value.state, 262_144)) return failure("invalid task flow state");
  return success(value as unknown as TaskFlowResumeInput);
}

export function validateTaskFlowFinishInput(value: unknown): ValidationResult<TaskFlowFinishInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "ownerKey", "controllerId", "flowId", "expectedRevision"], ["state"])) return failure("taskFlow.finish input must be a closed object");
  if (!validTaskFlowControllerIdentity(value) || !validLedgerId(value.flowId) || !boundedInteger(value.expectedRevision, 1, Number.MAX_SAFE_INTEGER)) return failure("invalid task flow finish identity");
  if (value.state !== undefined && !boundedJson(value.state, 262_144)) return failure("invalid task flow state");
  return success(value as unknown as TaskFlowFinishInput);
}

export function validateTaskFlowFailInput(value: unknown): ValidationResult<TaskFlowFailInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "ownerKey", "controllerId", "flowId", "expectedRevision"], ["state", "blockedSummary"])) return failure("taskFlow.fail input must be a closed object");
  if (!validTaskFlowControllerIdentity(value) || !validLedgerId(value.flowId) || !boundedInteger(value.expectedRevision, 1, Number.MAX_SAFE_INTEGER)) return failure("invalid task flow fail identity");
  if (value.state !== undefined && !boundedJson(value.state, 262_144)) return failure("invalid task flow state");
  if (value.blockedSummary !== undefined && value.blockedSummary !== null && !boundedString(value.blockedSummary, 1, 4096)) return failure("invalid task flow failure summary");
  return success(value as unknown as TaskFlowFailInput);
}


function validGoalExecutionOwner(value: Record<string, unknown>): boolean {
  return boundedString(value.workspaceId, 1, 64)
    && validLedgerId(value.conversationId)
    && validLedgerId(value.goalId);
}

export function validateGoalExecutionStartInput(value: unknown): ValidationResult<GoalExecutionStartInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "conversationId", "goalId", "expectedGoalRevision"])) return failure("goalExecution.start input must be a closed object");
  if (!validGoalExecutionOwner(value) || !boundedInteger(value.expectedGoalRevision, 1, Number.MAX_SAFE_INTEGER)) return failure("invalid goal execution start input");
  return success(value as unknown as GoalExecutionStartInput);
}

export function validateGoalExecutionGetInput(value: unknown): ValidationResult<GoalExecutionGetInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "conversationId", "goalId"])) return failure("goalExecution.get input must be a closed object");
  if (!validGoalExecutionOwner(value)) return failure("invalid goal execution get input");
  return success(value as unknown as GoalExecutionGetInput);
}

export function validateGoalExecutionResumeInput(value: unknown): ValidationResult<GoalExecutionResumeInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "conversationId", "goalId", "expectedExecutionRevision", "expectedFlowRevision"])) return failure("goalExecution.resume input must be a closed object");
  if (!validGoalExecutionOwner(value)
    || !boundedInteger(value.expectedExecutionRevision, 1, Number.MAX_SAFE_INTEGER)
    || !boundedInteger(value.expectedFlowRevision, 1, Number.MAX_SAFE_INTEGER)) return failure("invalid goal execution resume input");
  return success(value as unknown as GoalExecutionResumeInput);
}

export function validateGoalExecutionCancelInput(value: unknown): ValidationResult<GoalExecutionCancelInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "conversationId", "goalId", "expectedExecutionRevision", "expectedFlowRevision"])) return failure("goalExecution.cancel input must be a closed object");
  if (!validGoalExecutionOwner(value)
    || !boundedInteger(value.expectedExecutionRevision, 1, Number.MAX_SAFE_INTEGER)
    || !boundedInteger(value.expectedFlowRevision, 1, Number.MAX_SAFE_INTEGER)) return failure("invalid goal execution cancel input");
  return success(value as unknown as GoalExecutionCancelInput);
}


export function validateGoalExecutionRevisePlanInput(value: unknown): ValidationResult<GoalExecutionRevisePlanInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "conversationId", "goalId", "expectedGoalRevision", "expectedExecutionRevision", "expectedPlanRevision", "steps"])) return failure("goalExecution.revisePlan input must be a closed object");
  if (!validGoalExecutionOwner(value)
    || !boundedInteger(value.expectedGoalRevision, 1, Number.MAX_SAFE_INTEGER)
    || !boundedInteger(value.expectedExecutionRevision, 1, Number.MAX_SAFE_INTEGER)
    || !boundedInteger(value.expectedPlanRevision, 1, Number.MAX_SAFE_INTEGER)
    || !Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 200) return failure("invalid goal execution Plan revision input");
  for (const step of value.steps) {
    if (!isRecord(step) || !hasExactKeys(step, ["stepId", "ordinal", "title", "required", "retryMode", "maxAttempts"])) return failure("goalExecution revised Plan Step must be a closed object");
    if (!validLedgerId(step.stepId) || !boundedInteger(step.ordinal, 1, 200) || !boundedString(step.title, 1, 1000)
      || typeof step.required !== "boolean" || step.retryMode !== "MANUAL" || !boundedInteger(step.maxAttempts, 1, 20)) return failure("invalid goal execution revised Plan Step");
  }
  return success(value as unknown as GoalExecutionRevisePlanInput);
}

export function validateGoalExecutionAdoptPlanRevisionInput(value: unknown): ValidationResult<GoalExecutionAdoptPlanRevisionInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "conversationId", "goalId", "targetPlanRevision", "expectedExecutionRevision", "expectedFlowRevision"])) return failure("goalExecution.adoptPlanRevision input must be a closed object");
  if (!validGoalExecutionOwner(value)
    || !boundedInteger(value.targetPlanRevision, 1, Number.MAX_SAFE_INTEGER)
    || !boundedInteger(value.expectedExecutionRevision, 1, Number.MAX_SAFE_INTEGER)
    || !boundedInteger(value.expectedFlowRevision, 1, Number.MAX_SAFE_INTEGER)) return failure("invalid goal execution Plan adoption input");
  return success(value as unknown as GoalExecutionAdoptPlanRevisionInput);
}

export function validateGoalExecutionRetryInput(value: unknown): ValidationResult<GoalExecutionRetryInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "conversationId", "goalId", "blockerId", "expectedBlockerRevision", "expectedExecutionRevision", "expectedFlowRevision", "requestedBy", "reason"])) return failure("goalExecution.retry input must be a closed object");
  if (!validGoalExecutionOwner(value) || !validLedgerId(value.blockerId)
    || !boundedInteger(value.expectedBlockerRevision, 1, Number.MAX_SAFE_INTEGER)
    || !boundedInteger(value.expectedExecutionRevision, 1, Number.MAX_SAFE_INTEGER)
    || !boundedInteger(value.expectedFlowRevision, 1, Number.MAX_SAFE_INTEGER)
    || !boundedString(value.requestedBy, 1, 256) || !boundedString(value.reason, 1, 2000)) return failure("invalid goal execution retry input");
  return success(value as unknown as GoalExecutionRetryInput);
}

export function validateGoalExecutionResolveBlockerInput(value: unknown): ValidationResult<GoalExecutionResolveBlockerInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId", "conversationId", "goalId", "blockerId", "expectedBlockerRevision", "expectedExecutionRevision", "expectedFlowRevision", "resolvedBy", "resolution"])) return failure("goalExecution.resolveBlocker input must be a closed object");
  if (!validGoalExecutionOwner(value) || !validLedgerId(value.blockerId)
    || !boundedInteger(value.expectedBlockerRevision, 1, Number.MAX_SAFE_INTEGER)
    || !boundedInteger(value.expectedExecutionRevision, 1, Number.MAX_SAFE_INTEGER)
    || !boundedInteger(value.expectedFlowRevision, 1, Number.MAX_SAFE_INTEGER)
    || !boundedString(value.resolvedBy, 1, 256) || !boundedString(value.resolution, 1, 2000)) return failure("invalid goal execution blocker resolution input");
  return success(value as unknown as GoalExecutionResolveBlockerInput);
}

const MAINTENANCE_RETENTION_KINDS = new Set(["TASK", "TASK_FLOW", "CONNECTOR_DELIVERY"]);
function validMaintenanceWorkspaceId(value: unknown): value is string {
  return boundedString(value, 1, 64) && /^[a-z][a-z0-9._-]{0,63}$/.test(value);
}
function validMaintenanceCursor(value: unknown): value is string {
  return boundedString(value, 1, 2048) && /^[A-Za-z0-9_-]+$/.test(value);
}
export function validateMaintenanceRetentionPreviewInput(value: unknown): ValidationResult<MaintenanceRetentionPreviewInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId"], ["limit", "cursor"])) return failure("maintenance.retention.preview input must be a closed object");
  if (!validMaintenanceWorkspaceId(value.workspaceId)) return failure("invalid maintenance workspaceId");
  if (value.limit !== undefined && !boundedInteger(value.limit, 1, 1000)) return failure("maintenance retention limit must be 1..1000");
  if (value.cursor !== undefined && !validMaintenanceCursor(value.cursor)) return failure("invalid maintenance retention cursor");
  return success(value as unknown as MaintenanceRetentionPreviewInput);
}
export function validateMaintenanceRetentionPruneInput(value: unknown): ValidationResult<MaintenanceRetentionPruneInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId"], ["limit", "cursor"])) return failure("maintenance.retention.prune input must be a closed object");
  if (!validMaintenanceWorkspaceId(value.workspaceId)) return failure("invalid maintenance workspaceId");
  if (value.limit !== undefined && !boundedInteger(value.limit, 1, 1000)) return failure("maintenance retention limit must be 1..1000");
  if (value.cursor !== undefined && !validMaintenanceCursor(value.cursor)) return failure("invalid maintenance retention cursor");
  return success(value as unknown as MaintenanceRetentionPruneInput);
}
export function validateMaintenanceRetentionTombstoneListInput(value: unknown): ValidationResult<MaintenanceRetentionTombstoneListInput> {
  if (!isRecord(value) || !hasExactKeys(value, ["workspaceId"], ["entityKind", "limit"])) return failure("maintenance.retention.tombstones input must be a closed object");
  if (!validMaintenanceWorkspaceId(value.workspaceId)) return failure("invalid maintenance workspaceId");
  if (value.entityKind !== undefined && (typeof value.entityKind !== "string" || !MAINTENANCE_RETENTION_KINDS.has(value.entityKind))) return failure("invalid maintenance retention entityKind");
  if (value.limit !== undefined && !boundedInteger(value.limit, 1, 1000)) return failure("maintenance tombstone limit must be 1..1000");
  return success(value as unknown as MaintenanceRetentionTombstoneListInput);
}

