import type { DatabaseSync } from "node:sqlite";
import { resolveRequiredTaskCompletion } from "./task-completion.js";
import type {
  LedgerTaskDeliveryStatus,
  LedgerTaskNotifyPolicy,
  LedgerTaskTerminalOutcome,
} from "./task-delivery-repository.js";

export type LedgerTaskRuntime = "CONVERSATION" | "DELEGATION" | "AUTOMATION";
export type LedgerTaskStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "CANCELLED" | "LOST";
export type LedgerTaskRecoveryState = "NONE" | "RESUMABLE" | "NON_RESUMABLE";

export interface LedgerTaskRow {
  taskId: string;
  workspaceId: string;
  conversationId: string;
  runId: string;
  parentTaskId: string | null;
  runtime: LedgerTaskRuntime;
  taskKind: string;
  sourceId: string | null;
  taskText: string;
  status: LedgerTaskStatus;
  recoveryState: LedgerTaskRecoveryState;
  notifyPolicy: LedgerTaskNotifyPolicy;
  deliveryStatus: LedgerTaskDeliveryStatus;
  terminalOutcome: LedgerTaskTerminalOutcome | null;
  progressSummary: string | null;
  terminalSummary: string | null;
  errorCode: string | null;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  updatedAt: number;
  cleanupAfter: number | null;
  revision: number;
}

export interface LedgerTaskEventRow {
  taskId: string;
  sequence: number;
  eventType: string;
  status: LedgerTaskStatus;
  recoveryState: LedgerTaskRecoveryState;
  payload: unknown;
  runEventSequence: number | null;
  emittedAt: number;
}

const TERMINAL = new Set<LedgerTaskStatus>(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED", "LOST"]);
const SELECT = `
  SELECT task_id taskId, workspace_id workspaceId, conversation_id conversationId,
         run_id runId, parent_task_id parentTaskId, runtime, task_kind taskKind,
         source_id sourceId, task_text taskText, status, recovery_state recoveryState,
         notify_policy notifyPolicy, delivery_status deliveryStatus, terminal_outcome terminalOutcome,
         progress_summary progressSummary, terminal_summary terminalSummary,
         error_code errorCode, created_at createdAt, started_at startedAt,
         ended_at endedAt, updated_at updatedAt, cleanup_after cleanupAfter, revision
  FROM background_tasks`;

function row(value: any): LedgerTaskRow {
  return {
    taskId: value.taskId,
    workspaceId: value.workspaceId,
    conversationId: value.conversationId,
    runId: value.runId,
    parentTaskId: value.parentTaskId ?? null,
    runtime: value.runtime,
    taskKind: value.taskKind,
    sourceId: value.sourceId ?? null,
    taskText: value.taskText,
    status: value.status,
    recoveryState: value.recoveryState,
    notifyPolicy: value.notifyPolicy,
    deliveryStatus: value.deliveryStatus,
    terminalOutcome: value.terminalOutcome ?? null,
    progressSummary: value.progressSummary ?? null,
    terminalSummary: value.terminalSummary ?? null,
    errorCode: value.errorCode ?? null,
    createdAt: value.createdAt,
    startedAt: value.startedAt ?? null,
    endedAt: value.endedAt ?? null,
    updatedAt: value.updatedAt,
    cleanupAfter: value.cleanupAfter ?? null,
    revision: value.revision,
  };
}

function parsePayload(raw: string): unknown { return JSON.parse(raw) as unknown; }
function boundedOutput(value: string | null | undefined): string {
  const output = (value ?? "").trim();
  return output.length <= 16_384 ? output : `${output.slice(0, 16_381)}...`;
}

export class StateTaskRepository {
  public constructor(private readonly db: DatabaseSync) {}

  public insert(value: LedgerTaskRow): void {
    this.db.prepare(`
      INSERT INTO background_tasks
        (task_id, workspace_id, conversation_id, run_id, parent_task_id, runtime,
         task_kind, source_id, task_text, status, recovery_state, notify_policy,
         delivery_status, terminal_outcome, progress_summary, terminal_summary,
         error_code, created_at, started_at, ended_at, updated_at, cleanup_after, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      value.taskId, value.workspaceId, value.conversationId, value.runId, value.parentTaskId,
      value.runtime, value.taskKind, value.sourceId, value.taskText, value.status,
      value.recoveryState, value.notifyPolicy, value.deliveryStatus, value.terminalOutcome,
      value.progressSummary, value.terminalSummary, value.errorCode, value.createdAt,
      value.startedAt, value.endedAt, value.updatedAt, value.cleanupAfter, value.revision,
    );
  }

  public createForRun(input: {
    taskId: string;
    workspaceId: string;
    conversationId: string;
    runId: string;
    taskText: string;
    createdAt: number;
  }): LedgerTaskRow {
    const value: LedgerTaskRow = {
      taskId: input.taskId,
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      runId: input.runId,
      parentTaskId: null,
      runtime: "CONVERSATION",
      taskKind: "agent.run",
      sourceId: null,
      taskText: input.taskText,
      status: "QUEUED",
      recoveryState: "NONE",
      notifyPolicy: "SILENT",
      deliveryStatus: "NOT_APPLICABLE",
      terminalOutcome: null,
      progressSummary: "Queued",
      terminalSummary: null,
      errorCode: null,
      createdAt: input.createdAt,
      startedAt: null,
      endedAt: null,
      updatedAt: input.createdAt,
      cleanupAfter: null,
      revision: 1,
    };
    this.insert(value);
    this.appendEvent({
      taskId: value.taskId,
      sequence: 1,
      eventType: "task.queued",
      status: value.status,
      recoveryState: value.recoveryState,
      payload: { runId: value.runId, runtime: value.runtime },
      runEventSequence: null,
      emittedAt: value.createdAt,
    });
    return value;
  }

  public classifyRun(input: {
    runId: string;
    runtime: LedgerTaskRuntime;
    taskKind: string;
    sourceId?: string | null;
    parentRunId?: string | null;
    notifyPolicy?: LedgerTaskNotifyPolicy;
    updatedAt: number;
  }): LedgerTaskRow {
    const current = this.getByRun(input.runId);
    if (!current) throw new Error(`background task missing for run ${input.runId}`);
    const parentTaskId = input.parentRunId ? this.getByRun(input.parentRunId)?.taskId ?? null : current.parentTaskId;
    const notifyPolicy = input.notifyPolicy ?? (input.taskKind === "task_flow.child" ? "DONE_ONLY" : current.notifyPolicy);
    if (
      current.runtime === input.runtime && current.taskKind === input.taskKind
      && current.sourceId === (input.sourceId ?? null) && current.parentTaskId === parentTaskId
      && current.notifyPolicy === notifyPolicy
    ) return current;
    const updated = this.update({
      taskId: current.taskId,
      expectedRevision: current.revision,
      parentTaskId,
      runtime: input.runtime,
      taskKind: input.taskKind,
      sourceId: input.sourceId ?? null,
      status: current.status,
      recoveryState: current.recoveryState,
      notifyPolicy,
      deliveryStatus: current.deliveryStatus,
      terminalOutcome: current.terminalOutcome,
      progressSummary: current.progressSummary,
      terminalSummary: current.terminalSummary,
      errorCode: current.errorCode,
      startedAt: current.startedAt,
      endedAt: current.endedAt,
      updatedAt: input.updatedAt,
      cleanupAfter: current.cleanupAfter,
    });
    if (!updated) throw new Error(`background task changed while classifying run ${input.runId}`);
    this.appendEvent({
      taskId: updated.taskId,
      sequence: this.nextEventSequence(updated.taskId),
      eventType: "task.classified",
      status: updated.status,
      recoveryState: updated.recoveryState,
      payload: {
        runtime: updated.runtime,
        taskKind: updated.taskKind,
        sourceId: updated.sourceId,
        parentTaskId: updated.parentTaskId,
        notifyPolicy: updated.notifyPolicy,
      },
      runEventSequence: null,
      emittedAt: input.updatedAt,
    });
    return updated;
  }

  public syncRunLifecycle(input: {
    runId: string;
    runStatus: "CREATED" | "RUNNING" | "WAITING_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELLED";
    recoveryState: LedgerTaskRecoveryState;
    startedAt: number | null;
    endedAt: number | null;
    updatedAt: number;
    currentAttemptId: string | null;
    completionText?: string | null;
    projectionStatus?: "LOST";
    projectionErrorCode?: string;
  }): LedgerTaskRow {
    const current = this.getByRun(input.runId);
    if (!current) throw new Error(`background task missing for run ${input.runId}`);
    if (TERMINAL.has(current.status)) return current;

    let status: LedgerTaskStatus;
    if (input.projectionStatus === "LOST") status = "LOST";
    else if (input.runStatus === "CREATED") status = input.recoveryState === "RESUMABLE" && (current.startedAt !== null || input.startedAt !== null) ? "RUNNING" : "QUEUED";
    else if (input.runStatus === "RUNNING" || input.runStatus === "WAITING_APPROVAL") status = "RUNNING";
    else if (input.runStatus === "COMPLETED") status = "SUCCEEDED";
    else if (input.runStatus === "CANCELLED") status = "CANCELLED";
    else {
      const attempt = input.currentAttemptId
        ? this.db.prepare(`SELECT terminal_reason terminalReason FROM run_attempts WHERE attempt_id = ?`).get(input.currentAttemptId) as { terminalReason?: string | null } | undefined
        : undefined;
      status = attempt?.terminalReason === "AGENT_TIME_BUDGET_EXCEEDED" ? "TIMED_OUT" : "FAILED";
    }

    const errorCode = status === "LOST" ? (input.projectionErrorCode ?? "RUNTIME_AUTHORITY_LOST")
      : status === "FAILED" || status === "TIMED_OUT"
        ? ((input.currentAttemptId
          ? this.db.prepare(`SELECT terminal_reason terminalReason FROM run_attempts WHERE attempt_id = ?`).get(input.currentAttemptId) as { terminalReason?: string | null } | undefined
          : undefined)?.terminalReason ?? "RUN_FAILED")
        : status === "CANCELLED" ? "OPERATOR_CANCELLED" : null;

    const completion = status === "SUCCEEDED" && current.taskKind === "task_flow.child"
      ? resolveRequiredTaskCompletion(input.completionText)
      : null;
    const terminalOutcome: LedgerTaskTerminalOutcome | null = completion?.terminalOutcome ?? null;
    const progressSummary = input.runStatus === "WAITING_APPROVAL" ? "Waiting for approval"
      : input.runStatus === "CREATED" && input.recoveryState === "RESUMABLE" ? "Waiting for host resume"
      : status === "QUEUED" ? "Queued" : status === "RUNNING" ? "Running" : current.progressSummary;
    const terminalSummary = completion?.terminalSummary
      ?? (status === "SUCCEEDED" ? "Completed"
        : status === "CANCELLED" ? "Cancelled"
          : status === "TIMED_OUT" ? "Timed out"
            : status === "FAILED" ? "Failed"
              : status === "LOST" ? "Lost" : null);
    const willDeliver = TERMINAL.has(status) && current.notifyPolicy !== "SILENT";
    const deliveryStatus: LedgerTaskDeliveryStatus = willDeliver ? "PENDING" : current.deliveryStatus;

    if (
      current.status === status && current.recoveryState === input.recoveryState
      && current.progressSummary === progressSummary && current.errorCode === errorCode
      && current.terminalOutcome === terminalOutcome && current.terminalSummary === terminalSummary
      && current.deliveryStatus === deliveryStatus
    ) return current;

    const updated = this.update({
      taskId: current.taskId,
      expectedRevision: current.revision,
      parentTaskId: current.parentTaskId,
      runtime: current.runtime,
      taskKind: current.taskKind,
      sourceId: current.sourceId,
      status,
      recoveryState: input.recoveryState,
      notifyPolicy: current.notifyPolicy,
      deliveryStatus,
      terminalOutcome,
      progressSummary,
      terminalSummary,
      errorCode,
      startedAt: current.startedAt ?? input.startedAt ?? (status === "RUNNING" ? input.updatedAt : null),
      endedAt: TERMINAL.has(status) ? (input.endedAt ?? input.updatedAt) : null,
      updatedAt: input.updatedAt,
      cleanupAfter: current.cleanupAfter,
    });
    if (!updated) throw new Error(`background task changed while syncing run ${input.runId}`);

    const eventSequence = this.nextEventSequence(updated.taskId);
    this.appendEvent({
      taskId: updated.taskId,
      sequence: eventSequence,
      eventType: `task.${updated.status.toLowerCase()}`,
      status: updated.status,
      recoveryState: updated.recoveryState,
      payload: {
        runId: input.runId,
        runStatus: input.runStatus,
        errorCode: updated.errorCode,
        terminalOutcome: updated.terminalOutcome,
      },
      runEventSequence: null,
      emittedAt: input.updatedAt,
    });

    if (willDeliver) {
      const link = this.db.prepare(`
        SELECT l.flow_id flowId, f.workspace_id workspaceId, f.owner_key ownerConversationId,
               f.controller_id controllerId
        FROM task_flow_tasks l JOIN task_flows f ON f.flow_id = l.flow_id
        WHERE l.task_id = ?
      `).get(updated.taskId) as {
        flowId: string;
        workspaceId: string;
        ownerConversationId: string;
        controllerId: string;
      } | undefined;
      if (link) {
        const deliveryId = `delivery:${updated.taskId}:${eventSequence}`;
        const payload = {
          taskId: updated.taskId,
          runId: updated.runId,
          flowId: link.flowId,
          taskStatus: updated.status,
          terminalOutcome: updated.terminalOutcome,
          terminalSummary: updated.terminalSummary,
          errorCode: updated.errorCode,
          output: boundedOutput(input.completionText),
        };
        const payloadJson = JSON.stringify(payload);
        this.db.prepare(`
          INSERT INTO task_completion_deliveries
            (delivery_id, task_id, task_event_sequence, flow_id, workspace_id,
             owner_conversation_id, controller_id, notify_policy, delivery_status,
             task_status, terminal_outcome, idempotency_key, payload_json,
             attempt_count, last_error, system_message_id, wake_run_id,
             created_at, updated_at, delivered_at, revision)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, 0, NULL, NULL, NULL, ?, ?, NULL, 1)
        `).run(
          deliveryId, updated.taskId, eventSequence, link.flowId, link.workspaceId,
          link.ownerConversationId, link.controllerId, updated.notifyPolicy, updated.status,
          updated.terminalOutcome, deliveryId, payloadJson, input.updatedAt, input.updatedAt,
        );
      } else {
        throw new Error(`deliverable background task is not linked to a managed Task Flow: ${updated.taskId}`);
      }
    }
    return updated;
  }

  public get(taskId: string): LedgerTaskRow | null {
    const value = this.db.prepare(`${SELECT} WHERE task_id = ?`).get(taskId);
    return value ? row(value) : null;
  }

  public getByRun(runId: string): LedgerTaskRow | null {
    const value = this.db.prepare(`${SELECT} WHERE run_id = ?`).get(runId);
    return value ? row(value) : null;
  }

  public list(input: { workspaceId: string; status?: LedgerTaskStatus; runtime?: LedgerTaskRuntime; limit: number }): LedgerTaskRow[] {
    const where = ["workspace_id = ?"];
    const params: Array<string | number> = [input.workspaceId];
    if (input.status) { where.push("status = ?"); params.push(input.status); }
    if (input.runtime) { where.push("runtime = ?"); params.push(input.runtime); }
    params.push(input.limit);
    return (this.db.prepare(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY updated_at DESC, task_id LIMIT ?`).all(...params) as any[]).map(row);
  }

  public listAll(input: { workspaceId: string; limit: number }): LedgerTaskRow[] {
    return (this.db.prepare(`${SELECT} WHERE workspace_id = ? ORDER BY created_at, task_id LIMIT ?`)
      .all(input.workspaceId, input.limit) as any[]).map(row);
  }

  public listRetentionCandidates(input: { workspaceId: string; now: number; limit: number }): LedgerTaskRow[] {
    return (this.db.prepare(`${SELECT} WHERE workspace_id = ? AND cleanup_after IS NOT NULL AND cleanup_after <= ? ORDER BY cleanup_after, task_id LIMIT ?`)
      .all(input.workspaceId, input.now, input.limit) as any[]).map(row);
  }

  public listRetentionSchedulingCandidates(input: { workspaceId: string; limit: number }): LedgerTaskRow[] {
    return (this.db.prepare(`${SELECT} WHERE workspace_id = ?
      AND cleanup_after IS NULL AND ended_at IS NOT NULL
      AND status IN ('SUCCEEDED','FAILED','TIMED_OUT','CANCELLED','LOST')
      AND EXISTS (SELECT 1 FROM agent_runs r WHERE r.run_id = background_tasks.run_id AND r.status IN ('COMPLETED','FAILED','CANCELLED'))
      ORDER BY ended_at, task_id LIMIT ?`).all(input.workspaceId, input.limit) as any[]).map(row);
  }

  public update(input: {
    taskId: string;
    expectedRevision: number;
    parentTaskId: string | null;
    runtime: LedgerTaskRuntime;
    taskKind: string;
    sourceId: string | null;
    status: LedgerTaskStatus;
    recoveryState: LedgerTaskRecoveryState;
    notifyPolicy?: LedgerTaskNotifyPolicy;
    deliveryStatus?: LedgerTaskDeliveryStatus;
    terminalOutcome?: LedgerTaskTerminalOutcome | null;
    progressSummary: string | null;
    terminalSummary: string | null;
    errorCode: string | null;
    startedAt: number | null;
    endedAt: number | null;
    updatedAt: number;
    cleanupAfter?: number | null;
  }): LedgerTaskRow | null {
    const existing = this.get(input.taskId);
    if (!existing) return null;
    const notifyPolicy = input.notifyPolicy ?? existing.notifyPolicy;
    const deliveryStatus = input.deliveryStatus ?? existing.deliveryStatus;
    const terminalOutcome = Object.prototype.hasOwnProperty.call(input, "terminalOutcome")
      ? input.terminalOutcome ?? null
      : existing.terminalOutcome;
    const value = this.db.prepare(`
      UPDATE background_tasks
      SET parent_task_id = ?, runtime = ?, task_kind = ?, source_id = ?, status = ?,
          recovery_state = ?, notify_policy = ?, delivery_status = ?, terminal_outcome = ?,
          progress_summary = ?, terminal_summary = ?, error_code = ?,
          started_at = ?, ended_at = ?, updated_at = ?,
          cleanup_after = CASE WHEN ? = 1 THEN ? ELSE cleanup_after END,
          revision = revision + 1
      WHERE task_id = ? AND revision = ?
      RETURNING task_id taskId, workspace_id workspaceId, conversation_id conversationId,
                run_id runId, parent_task_id parentTaskId, runtime, task_kind taskKind,
                source_id sourceId, task_text taskText, status, recovery_state recoveryState,
                notify_policy notifyPolicy, delivery_status deliveryStatus, terminal_outcome terminalOutcome,
                progress_summary progressSummary, terminal_summary terminalSummary,
                error_code errorCode, created_at createdAt, started_at startedAt,
                ended_at endedAt, updated_at updatedAt, cleanup_after cleanupAfter, revision
    `).get(
      input.parentTaskId, input.runtime, input.taskKind, input.sourceId, input.status,
      input.recoveryState, notifyPolicy, deliveryStatus, terminalOutcome,
      input.progressSummary, input.terminalSummary, input.errorCode, input.startedAt,
      input.endedAt, input.updatedAt,
      Object.prototype.hasOwnProperty.call(input, "cleanupAfter") ? 1 : 0, input.cleanupAfter ?? null,
      input.taskId, input.expectedRevision,
    );
    return value ? row(value) : null;
  }

  public updateDeliveryState(input: {
    taskId: string;
    deliveryStatus: LedgerTaskDeliveryStatus;
    terminalOutcome?: LedgerTaskTerminalOutcome | null;
    updatedAt: number;
  }): LedgerTaskRow {
    const current = this.get(input.taskId);
    if (!current) throw new Error(`background task missing: ${input.taskId}`);
    if (current.deliveryStatus === input.deliveryStatus
      && (input.terminalOutcome === undefined || current.terminalOutcome === input.terminalOutcome)) return current;
    const updated = this.update({
      taskId: current.taskId,
      expectedRevision: current.revision,
      parentTaskId: current.parentTaskId,
      runtime: current.runtime,
      taskKind: current.taskKind,
      sourceId: current.sourceId,
      status: current.status,
      recoveryState: current.recoveryState,
      notifyPolicy: current.notifyPolicy,
      deliveryStatus: input.deliveryStatus,
      terminalOutcome: input.terminalOutcome === undefined ? current.terminalOutcome : input.terminalOutcome,
      progressSummary: current.progressSummary,
      terminalSummary: current.terminalSummary,
      errorCode: current.errorCode,
      startedAt: current.startedAt,
      endedAt: current.endedAt,
      updatedAt: input.updatedAt,
      cleanupAfter: current.cleanupAfter,
    });
    if (!updated) throw new Error(`background task changed while updating delivery state: ${input.taskId}`);
    return updated;
  }

  public nextEventSequence(taskId: string): number {
    const value = this.db.prepare(`SELECT COALESCE(MAX(sequence), 0) + 1 sequence FROM background_task_events WHERE task_id = ?`).get(taskId) as { sequence: number };
    return value.sequence;
  }

  public appendEvent(value: LedgerTaskEventRow): void {
    const payloadJson = JSON.stringify(value.payload);
    if (payloadJson === undefined) throw new TypeError("task event payload must be JSON serializable");
    this.db.prepare(`
      INSERT INTO background_task_events
        (task_id, sequence, event_type, status, recovery_state, payload_json, run_event_sequence, emitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(value.taskId, value.sequence, value.eventType, value.status, value.recoveryState, payloadJson, value.runEventSequence, value.emittedAt);
  }

  public listEvents(taskId: string, limit: number): LedgerTaskEventRow[] {
    return (this.db.prepare(`
      SELECT task_id taskId, sequence, event_type eventType, status,
             recovery_state recoveryState, payload_json payloadJson,
             run_event_sequence runEventSequence, emitted_at emittedAt
      FROM background_task_events WHERE task_id = ? ORDER BY sequence DESC LIMIT ?
    `).all(taskId, limit) as any[]).reverse().map((value) => ({
      taskId: value.taskId,
      sequence: value.sequence,
      eventType: value.eventType,
      status: value.status,
      recoveryState: value.recoveryState,
      payload: parsePayload(value.payloadJson),
      runEventSequence: value.runEventSequence ?? null,
      emittedAt: value.emittedAt,
    }));
  }
}
