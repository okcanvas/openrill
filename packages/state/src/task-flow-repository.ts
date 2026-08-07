import type { DatabaseSync } from "node:sqlite";

export type LedgerTaskFlowStatus = "QUEUED" | "RUNNING" | "WAITING" | "BLOCKED" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "LOST";

export interface LedgerTaskFlowRow {
  flowId: string;
  workspaceId: string;
  ownerKey: string;
  controllerId: string;
  goal: string;
  status: LedgerTaskFlowStatus;
  currentStep: string | null;
  blockedTaskId: string | null;
  blockedSummary: string | null;
  state: unknown;
  wait: unknown;
  cancelRequestedAt: number | null;
  createdAt: number;
  updatedAt: number;
  endedAt: number | null;
  cleanupAfter: number | null;
  revision: number;
}

export interface LedgerTaskFlowEventRow {
  flowId: string;
  sequence: number;
  eventType: string;
  status: LedgerTaskFlowStatus;
  revision: number;
  payload: unknown;
  emittedAt: number;
}

export interface LedgerTaskFlowTaskLinkRow {
  flowId: string;
  taskId: string;
  stepKey: string | null;
  linkedAt: number;
}

const SELECT = `
  SELECT flow_id flowId, workspace_id workspaceId, owner_key ownerKey, controller_id controllerId,
         goal, status, current_step currentStep, blocked_task_id blockedTaskId,
         blocked_summary blockedSummary, state_json stateJson, wait_json waitJson,
         cancel_requested_at cancelRequestedAt, created_at createdAt,
         updated_at updatedAt, ended_at endedAt, cleanup_after cleanupAfter, revision
  FROM task_flows`;

function parseJson(raw: string | null): unknown {
  if (raw === null) return null;
  return JSON.parse(raw) as unknown;
}

function serializeJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new TypeError("task flow state must be JSON serializable");
  return serialized;
}

function flowRow(value: any): LedgerTaskFlowRow {
  return {
    flowId: value.flowId,
    workspaceId: value.workspaceId,
    ownerKey: value.ownerKey,
    controllerId: value.controllerId,
    goal: value.goal,
    status: value.status,
    currentStep: value.currentStep ?? null,
    blockedTaskId: value.blockedTaskId ?? null,
    blockedSummary: value.blockedSummary ?? null,
    state: parseJson(value.stateJson ?? null),
    wait: parseJson(value.waitJson ?? null),
    cancelRequestedAt: value.cancelRequestedAt ?? null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    endedAt: value.endedAt ?? null,
    cleanupAfter: value.cleanupAfter ?? null,
    revision: value.revision,
  };
}

export class StateTaskFlowRepository {
  public constructor(private readonly db: DatabaseSync) {}

  public insert(value: LedgerTaskFlowRow): void {
    this.db.prepare(`
      INSERT INTO task_flows
        (flow_id, workspace_id, owner_key, controller_id, goal, status, current_step,
         blocked_task_id, blocked_summary, state_json, wait_json,
         cancel_requested_at, created_at, updated_at, ended_at, cleanup_after, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      value.flowId, value.workspaceId, value.ownerKey, value.controllerId, value.goal, value.status,
      value.currentStep, value.blockedTaskId, value.blockedSummary,
      serializeJson(value.state), serializeJson(value.wait), value.cancelRequestedAt,
      value.createdAt, value.updatedAt, value.endedAt, value.cleanupAfter, value.revision,
    );
  }

  public get(flowId: string): LedgerTaskFlowRow | null {
    const value = this.db.prepare(`${SELECT} WHERE flow_id = ?`).get(flowId);
    return value ? flowRow(value) : null;
  }

  public list(input: { workspaceId: string; ownerKey: string; status?: LedgerTaskFlowStatus; controllerId?: string; limit: number }): LedgerTaskFlowRow[] {
    const where = ["workspace_id = ?", "owner_key = ?"];
    const params: Array<string | number> = [input.workspaceId, input.ownerKey];
    if (input.status) { where.push("status = ?"); params.push(input.status); }
    if (input.controllerId) { where.push("controller_id = ?"); params.push(input.controllerId); }
    params.push(input.limit);
    return (this.db.prepare(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY updated_at DESC, flow_id LIMIT ?`).all(...params) as any[]).map(flowRow);
  }

  public listAll(input: { workspaceId: string; ownerKey?: string; limit: number }): LedgerTaskFlowRow[] {
    const where = ["workspace_id = ?"];
    const params: Array<string | number> = [input.workspaceId];
    if (input.ownerKey) { where.push("owner_key = ?"); params.push(input.ownerKey); }
    params.push(input.limit);
    return (this.db.prepare(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY created_at, flow_id LIMIT ?`)
      .all(...params) as any[]).map(flowRow);
  }

  public listRetentionCandidates(input: { workspaceId: string; ownerKey?: string; now: number; limit: number }): LedgerTaskFlowRow[] {
    const where = ["workspace_id = ?", "cleanup_after IS NOT NULL", "cleanup_after <= ?"];
    const params: Array<string | number> = [input.workspaceId, input.now];
    if (input.ownerKey) { where.push("owner_key = ?"); params.push(input.ownerKey); }
    params.push(input.limit);
    return (this.db.prepare(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY cleanup_after, flow_id LIMIT ?`)
      .all(...params) as any[]).map(flowRow);
  }

  public listRetentionSchedulingCandidates(input: { workspaceId: string; ownerKey?: string; limit: number }): LedgerTaskFlowRow[] {
    const where = [
      "workspace_id = ?", "cleanup_after IS NULL", "ended_at IS NOT NULL",
      "status IN ('SUCCEEDED','FAILED','CANCELLED','LOST')",
      "NOT EXISTS (SELECT 1 FROM task_flow_tasks l JOIN background_tasks t ON t.task_id = l.task_id WHERE l.flow_id = task_flows.flow_id AND t.status IN ('QUEUED','RUNNING'))",
    ];
    const params: Array<string | number> = [input.workspaceId];
    if (input.ownerKey) { where.push("owner_key = ?"); params.push(input.ownerKey); }
    params.push(input.limit);
    return (this.db.prepare(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY ended_at, flow_id LIMIT ?`)
      .all(...params) as any[]).map(flowRow);
  }

  public update(input: {
    flowId: string;
    expectedRevision: number;
    status: LedgerTaskFlowStatus;
    currentStep: string | null;
    blockedTaskId: string | null;
    blockedSummary: string | null;
    state: unknown;
    wait: unknown;
    cancelRequestedAt: number | null;
    updatedAt: number;
    endedAt: number | null;
    cleanupAfter?: number | null;
  }): LedgerTaskFlowRow | null {
    const value = this.db.prepare(`
      UPDATE task_flows
      SET status = ?, current_step = ?, blocked_task_id = ?, blocked_summary = ?,
          state_json = ?, wait_json = ?, cancel_requested_at = ?, updated_at = ?,
          ended_at = ?, cleanup_after = CASE WHEN ? = 1 THEN ? ELSE cleanup_after END,
          revision = revision + 1
      WHERE flow_id = ? AND revision = ?
      RETURNING flow_id flowId, workspace_id workspaceId, owner_key ownerKey, controller_id controllerId,
                goal, status, current_step currentStep, blocked_task_id blockedTaskId,
                blocked_summary blockedSummary, state_json stateJson, wait_json waitJson,
                cancel_requested_at cancelRequestedAt, created_at createdAt,
                updated_at updatedAt, ended_at endedAt, cleanup_after cleanupAfter, revision
    `).get(
      input.status, input.currentStep, input.blockedTaskId, input.blockedSummary,
      serializeJson(input.state), serializeJson(input.wait), input.cancelRequestedAt,
      input.updatedAt, input.endedAt,
      Object.prototype.hasOwnProperty.call(input, "cleanupAfter") ? 1 : 0, input.cleanupAfter ?? null,
      input.flowId, input.expectedRevision,
    );
    return value ? flowRow(value) : null;
  }

  public linkTask(input: { flowId: string; taskId: string; stepKey: string | null; linkedAt: number }): "LINKED" | "REPLAY" | "CONFLICT" {
    const existing = this.db.prepare(`SELECT flow_id flowId, step_key stepKey FROM task_flow_tasks WHERE task_id = ?`).get(input.taskId) as { flowId: string; stepKey: string | null } | undefined;
    if (existing) {
      return existing.flowId === input.flowId && existing.stepKey === input.stepKey ? "REPLAY" : "CONFLICT";
    }
    this.db.prepare(`INSERT INTO task_flow_tasks (flow_id, task_id, step_key, linked_at) VALUES (?, ?, ?, ?)`).run(input.flowId, input.taskId, input.stepKey, input.linkedAt);
    return "LINKED";
  }


  public getTaskLink(taskId: string): LedgerTaskFlowTaskLinkRow | null {
    const value = this.db.prepare(`
      SELECT flow_id flowId, task_id taskId, step_key stepKey, linked_at linkedAt
      FROM task_flow_tasks WHERE task_id = ?
    `).get(taskId);
    return value ? value as unknown as LedgerTaskFlowTaskLinkRow : null;
  }

  public listTaskLinks(flowId: string): LedgerTaskFlowTaskLinkRow[] {
    return this.db.prepare(`
      SELECT flow_id flowId, task_id taskId, step_key stepKey, linked_at linkedAt
      FROM task_flow_tasks WHERE flow_id = ? ORDER BY linked_at, task_id
    `).all(flowId) as unknown as LedgerTaskFlowTaskLinkRow[];
  }

  public nextEventSequence(flowId: string): number {
    const value = this.db.prepare(`SELECT COALESCE(MAX(sequence), 0) + 1 sequence FROM task_flow_events WHERE flow_id = ?`).get(flowId) as { sequence: number };
    return value.sequence;
  }

  public appendEvent(value: LedgerTaskFlowEventRow): void {
    const payloadJson = JSON.stringify(value.payload);
    if (payloadJson === undefined) throw new TypeError("task flow event payload must be JSON serializable");
    this.db.prepare(`
      INSERT INTO task_flow_events
        (flow_id, sequence, event_type, status, revision, payload_json, emitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(value.flowId, value.sequence, value.eventType, value.status, value.revision, payloadJson, value.emittedAt);
  }

  public listEvents(flowId: string, limit: number): LedgerTaskFlowEventRow[] {
    return (this.db.prepare(`
      SELECT flow_id flowId, sequence, event_type eventType, status, revision,
             payload_json payloadJson, emitted_at emittedAt
      FROM task_flow_events WHERE flow_id = ? ORDER BY sequence DESC LIMIT ?
    `).all(flowId, limit) as any[]).reverse().map((value) => ({
      flowId: value.flowId,
      sequence: value.sequence,
      eventType: value.eventType,
      status: value.status,
      revision: value.revision,
      payload: parseJson(value.payloadJson),
      emittedAt: value.emittedAt,
    }));
  }
}
