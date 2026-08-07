import type { DatabaseSync } from "node:sqlite";

export type LedgerTaskNotifyPolicy = "DONE_ONLY" | "STATE_CHANGES" | "SILENT";
export type LedgerTaskDeliveryStatus = "PENDING" | "SESSION_QUEUED" | "DELIVERED" | "FAILED" | "NOT_APPLICABLE";
export type LedgerTaskTerminalOutcome = "SUCCEEDED" | "BLOCKED";
export type LedgerTerminalTaskStatus = "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "CANCELLED" | "LOST";

export interface LedgerTaskCompletionDeliveryRow {
  deliveryId: string;
  taskId: string;
  taskEventSequence: number;
  flowId: string | null;
  workspaceId: string;
  ownerConversationId: string;
  controllerId: string | null;
  notifyPolicy: LedgerTaskNotifyPolicy;
  deliveryStatus: LedgerTaskDeliveryStatus;
  taskStatus: LedgerTerminalTaskStatus;
  terminalOutcome: LedgerTaskTerminalOutcome | null;
  idempotencyKey: string;
  payload: unknown;
  attemptCount: number;
  lastError: string | null;
  systemMessageId: string | null;
  wakeRunId: string | null;
  controllerExecutionRevision: number | null;
  controllerStepRevision: number | null;
  controllerFlowRevision: number | null;
  createdAt: number;
  updatedAt: number;
  deliveredAt: number | null;
  revision: number;
}

const SELECT = `
  SELECT delivery_id deliveryId, task_id taskId, task_event_sequence taskEventSequence,
         flow_id flowId, workspace_id workspaceId, owner_conversation_id ownerConversationId,
         controller_id controllerId, notify_policy notifyPolicy, delivery_status deliveryStatus,
         task_status taskStatus, terminal_outcome terminalOutcome, idempotency_key idempotencyKey,
         payload_json payloadJson, attempt_count attemptCount, last_error lastError,
         system_message_id systemMessageId, wake_run_id wakeRunId,
         controller_execution_revision controllerExecutionRevision,
         controller_step_revision controllerStepRevision,
         controller_flow_revision controllerFlowRevision,
         created_at createdAt, updated_at updatedAt, delivered_at deliveredAt, revision
  FROM task_completion_deliveries`;

function mapRow(value: any): LedgerTaskCompletionDeliveryRow {
  return {
    deliveryId: value.deliveryId,
    taskId: value.taskId,
    taskEventSequence: value.taskEventSequence,
    flowId: value.flowId ?? null,
    workspaceId: value.workspaceId,
    ownerConversationId: value.ownerConversationId,
    controllerId: value.controllerId ?? null,
    notifyPolicy: value.notifyPolicy,
    deliveryStatus: value.deliveryStatus,
    taskStatus: value.taskStatus,
    terminalOutcome: value.terminalOutcome ?? null,
    idempotencyKey: value.idempotencyKey,
    payload: JSON.parse(value.payloadJson) as unknown,
    attemptCount: value.attemptCount,
    lastError: value.lastError ?? null,
    systemMessageId: value.systemMessageId ?? null,
    wakeRunId: value.wakeRunId ?? null,
    controllerExecutionRevision: value.controllerExecutionRevision ?? null,
    controllerStepRevision: value.controllerStepRevision ?? null,
    controllerFlowRevision: value.controllerFlowRevision ?? null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    deliveredAt: value.deliveredAt ?? null,
    revision: value.revision,
  };
}

export class StateTaskDeliveryRepository {
  public constructor(private readonly db: DatabaseSync) {}

  public insert(value: LedgerTaskCompletionDeliveryRow): LedgerTaskCompletionDeliveryRow {
    const payloadJson = JSON.stringify(value.payload);
    if (payloadJson === undefined) throw new TypeError("task completion delivery payload must be JSON serializable");
    this.db.prepare(`
      INSERT INTO task_completion_deliveries
        (delivery_id, task_id, task_event_sequence, flow_id, workspace_id, owner_conversation_id,
         controller_id, notify_policy, delivery_status, task_status, terminal_outcome,
         idempotency_key, payload_json, attempt_count, last_error, system_message_id,
         wake_run_id, controller_execution_revision, controller_step_revision,
         controller_flow_revision, created_at, updated_at, delivered_at, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      value.deliveryId, value.taskId, value.taskEventSequence, value.flowId, value.workspaceId,
      value.ownerConversationId, value.controllerId, value.notifyPolicy, value.deliveryStatus,
      value.taskStatus, value.terminalOutcome, value.idempotencyKey, payloadJson, value.attemptCount,
      value.lastError, value.systemMessageId, value.wakeRunId,
      value.controllerExecutionRevision, value.controllerStepRevision, value.controllerFlowRevision,
      value.createdAt, value.updatedAt, value.deliveredAt, value.revision,
    );
    return value;
  }

  public get(deliveryId: string): LedgerTaskCompletionDeliveryRow | null {
    const value = this.db.prepare(`${SELECT} WHERE delivery_id = ?`).get(deliveryId);
    return value ? mapRow(value) : null;
  }

  public getByTaskEvent(taskId: string, taskEventSequence: number): LedgerTaskCompletionDeliveryRow | null {
    const value = this.db.prepare(`${SELECT} WHERE task_id = ? AND task_event_sequence = ?`).get(taskId, taskEventSequence);
    return value ? mapRow(value) : null;
  }

  public getByWakeRun(wakeRunId: string): LedgerTaskCompletionDeliveryRow | null {
    const value = this.db.prepare(`${SELECT} WHERE wake_run_id = ?`).get(wakeRunId);
    return value ? mapRow(value) : null;
  }

  public listForTask(taskId: string, limit = 100): LedgerTaskCompletionDeliveryRow[] {
    return (this.db.prepare(`${SELECT} WHERE task_id = ? ORDER BY task_event_sequence, delivery_id LIMIT ?`)
      .all(taskId, limit) as any[]).map(mapRow);
  }

  public listActionable(limit = 200): LedgerTaskCompletionDeliveryRow[] {
    return (this.db.prepare(`${SELECT} WHERE delivery_status IN ('PENDING','SESSION_QUEUED','FAILED') ORDER BY updated_at, delivery_id LIMIT ?`)
      .all(limit) as any[]).map(mapRow);
  }


  public bindControllerSnapshot(input: {
    deliveryId: string;
    expectedRevision: number;
    controllerExecutionRevision: number | null;
    controllerStepRevision: number | null;
    controllerFlowRevision: number;
    updatedAt: number;
  }): LedgerTaskCompletionDeliveryRow | null {
    const value = this.db.prepare(`
      UPDATE task_completion_deliveries
      SET controller_execution_revision = ?, controller_step_revision = ?,
          controller_flow_revision = ?, updated_at = ?, revision = revision + 1
      WHERE delivery_id = ? AND revision = ?
      RETURNING delivery_id deliveryId, task_id taskId, task_event_sequence taskEventSequence,
                flow_id flowId, workspace_id workspaceId, owner_conversation_id ownerConversationId,
                controller_id controllerId, notify_policy notifyPolicy, delivery_status deliveryStatus,
                task_status taskStatus, terminal_outcome terminalOutcome, idempotency_key idempotencyKey,
                payload_json payloadJson, attempt_count attemptCount, last_error lastError,
                system_message_id systemMessageId, wake_run_id wakeRunId,
                controller_execution_revision controllerExecutionRevision,
                controller_step_revision controllerStepRevision,
                controller_flow_revision controllerFlowRevision,
                created_at createdAt, updated_at updatedAt, delivered_at deliveredAt, revision
    `).get(input.controllerExecutionRevision, input.controllerStepRevision,
      input.controllerFlowRevision, input.updatedAt, input.deliveryId, input.expectedRevision);
    return value ? mapRow(value) : null;
  }

  public update(input: {
    deliveryId: string;
    expectedRevision: number;
    deliveryStatus: LedgerTaskDeliveryStatus;
    attemptCount: number;
    lastError: string | null;
    systemMessageId: string | null;
    wakeRunId: string | null;
    updatedAt: number;
    deliveredAt: number | null;
  }): LedgerTaskCompletionDeliveryRow | null {
    const value = this.db.prepare(`
      UPDATE task_completion_deliveries
      SET delivery_status = ?, attempt_count = ?, last_error = ?, system_message_id = ?,
          wake_run_id = ?, updated_at = ?, delivered_at = ?, revision = revision + 1
      WHERE delivery_id = ? AND revision = ?
      RETURNING delivery_id deliveryId, task_id taskId, task_event_sequence taskEventSequence,
                flow_id flowId, workspace_id workspaceId, owner_conversation_id ownerConversationId,
                controller_id controllerId, notify_policy notifyPolicy, delivery_status deliveryStatus,
                task_status taskStatus, terminal_outcome terminalOutcome, idempotency_key idempotencyKey,
                payload_json payloadJson, attempt_count attemptCount, last_error lastError,
                system_message_id systemMessageId, wake_run_id wakeRunId,
                controller_execution_revision controllerExecutionRevision,
                controller_step_revision controllerStepRevision,
                controller_flow_revision controllerFlowRevision,
                created_at createdAt, updated_at updatedAt, delivered_at deliveredAt, revision
    `).get(
      input.deliveryStatus, input.attemptCount, input.lastError, input.systemMessageId,
      input.wakeRunId, input.updatedAt, input.deliveredAt, input.deliveryId, input.expectedRevision,
    );
    return value ? mapRow(value) : null;
  }
}
