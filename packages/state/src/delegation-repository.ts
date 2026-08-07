import type { DatabaseSync } from "node:sqlite";
import { StateDatabaseError } from "./errors.js";

export type LedgerDelegationStatus = "CREATED" | "RUNNING" | "WAITING" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT";
export type LedgerDelegationEventType = "CREATED" | "STARTED" | "WAITING" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT" | "WAIT_CLEARED";
export type LedgerDelegationExpectedOutput = "TEXT" | "JSON" | "ARTIFACTS";
export type LedgerDelegationDeliveryStatus = "PENDING" | "DELIVERED";
export type LedgerDelegationReservationStatus = "RESERVED" | "RELEASED";
export type LedgerDelegationReleaseReason = "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT";

export interface LedgerRunBudgetEnvelopeRow {
  runId: string;
  rootRunId: string;
  parentRunId: string | null;
  depth: number;
  maxTurns: number;
  maxModelCalls: number;
  maxToolCalls: number;
  maxOutputTokens: number;
  maxTotalTokens: number;
  maxDurationMs: number;
  deadlineAt: number;
  maxDelegationDepth: number;
  maxActiveChildren: number;
  maxTotalChildren: number;
  allowedWorkspaceIds: readonly string[];
  allowedSkillIds: readonly string[];
  allowedToolNames: readonly string[];
  usedTurns: number;
  usedInputTokens: number;
  usedOutputTokens: number;
  usedModelCalls: number;
  usedToolCalls: number;
  delegatedUsedTurns: number;
  delegatedUsedInputTokens: number;
  delegatedUsedOutputTokens: number;
  delegatedUsedModelCalls: number;
  delegatedUsedToolCalls: number;
  createdAt: number;
  updatedAt: number;
}

export interface LedgerRunDelegationRow {
  delegationId: string;
  idempotencyKey: string;
  rootRunId: string;
  parentRunId: string;
  parentAttemptId: string;
  parentToolCallId: string | null;
  childConversationId: string;
  childRunId: string;
  depth: number;
  status: LedgerDelegationStatus;
  taskSha256: string;
  workspaceScope: readonly string[];
  skillIds: readonly string[];
  toolNames: readonly string[];
  expectedOutput: LedgerDelegationExpectedOutput;
  resultSummarySha256: string | null;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  updatedAt: number;
}

export interface LedgerRunDelegationEventRow {
  delegationId: string;
  sequence: number;
  eventType: LedgerDelegationEventType;
  payload: unknown;
  emittedAt: number;
}

export interface LedgerRunDelegationWaitRow {
  parentRunId: string;
  delegationId: string;
  state: "WAITING_DELEGATION";
  createdAt: number;
  updatedAt: number;
}

export interface LedgerRunDelegationResultDeliveryRow {
  delegationId: string;
  parentRunId: string;
  parentAttemptId: string;
  parentToolCallId: string;
  toolName: "agent.wait";
  status: LedgerDelegationDeliveryStatus;
  resultSha256: string | null;
  createdAt: number;
  deliveredAt: number | null;
  updatedAt: number;
}


export interface LedgerRunDelegationBudgetReservationRow {
  delegationId: string;
  parentRunId: string;
  childRunId: string;
  status: LedgerDelegationReservationStatus;
  reservedTurns: number;
  reservedModelCalls: number;
  reservedToolCalls: number;
  reservedTotalTokens: number;
  chargedTurns: number;
  chargedInputTokens: number;
  chargedOutputTokens: number;
  chargedModelCalls: number;
  chargedToolCalls: number;
  releaseReason: LedgerDelegationReleaseReason | null;
  createdAt: number;
  releasedAt: number | null;
  updatedAt: number;
}

export interface LedgerDelegationChargedUsage {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  modelCalls: number;
  toolCalls: number;
}

export interface LedgerDelegationReservationSummary {
  activeChildren: number;
  totalChildren: number;
  reservedTurns: number;
  reservedModelCalls: number;
  reservedToolCalls: number;
  reservedTotalTokens: number;
}

function parseJsonArray(raw: string, label: string): readonly string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", `${label} contains invalid JSON`);
  }
  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
    throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", `${label} must be a string array`);
  }
  return Object.freeze([...parsed]);
}

function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", `${label} contains invalid JSON`);
  }
}

function budget(row: any): LedgerRunBudgetEnvelopeRow {
  return {
    runId: row.runId,
    rootRunId: row.rootRunId,
    parentRunId: row.parentRunId,
    depth: row.depth,
    maxTurns: row.maxTurns,
    maxModelCalls: row.maxModelCalls,
    maxToolCalls: row.maxToolCalls,
    maxOutputTokens: row.maxOutputTokens,
    maxTotalTokens: row.maxTotalTokens,
    maxDurationMs: row.maxDurationMs,
    deadlineAt: row.deadlineAt,
    maxDelegationDepth: row.maxDelegationDepth,
    maxActiveChildren: row.maxActiveChildren,
    maxTotalChildren: row.maxTotalChildren,
    allowedWorkspaceIds: parseJsonArray(row.allowedWorkspaceIdsJson, "run_budget_envelopes.allowed_workspace_ids_json"),
    allowedSkillIds: parseJsonArray(row.allowedSkillIdsJson, "run_budget_envelopes.allowed_skill_ids_json"),
    allowedToolNames: parseJsonArray(row.allowedToolNamesJson, "run_budget_envelopes.allowed_tool_names_json"),
    usedTurns: row.usedTurns,
    usedInputTokens: row.usedInputTokens,
    usedOutputTokens: row.usedOutputTokens,
    usedModelCalls: row.usedModelCalls,
    usedToolCalls: row.usedToolCalls,
    delegatedUsedTurns: row.delegatedUsedTurns,
    delegatedUsedInputTokens: row.delegatedUsedInputTokens,
    delegatedUsedOutputTokens: row.delegatedUsedOutputTokens,
    delegatedUsedModelCalls: row.delegatedUsedModelCalls,
    delegatedUsedToolCalls: row.delegatedUsedToolCalls,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function delegation(row: any): LedgerRunDelegationRow {
  return {
    delegationId: row.delegationId,
    idempotencyKey: row.idempotencyKey,
    rootRunId: row.rootRunId,
    parentRunId: row.parentRunId,
    parentAttemptId: row.parentAttemptId,
    parentToolCallId: row.parentToolCallId,
    childConversationId: row.childConversationId,
    childRunId: row.childRunId,
    depth: row.depth,
    status: row.status,
    taskSha256: row.taskSha256,
    workspaceScope: parseJsonArray(row.workspaceScopeJson, "run_delegations.workspace_scope_json"),
    skillIds: parseJsonArray(row.skillIdsJson, "run_delegations.skill_ids_json"),
    toolNames: parseJsonArray(row.toolNamesJson, "run_delegations.tool_names_json"),
    expectedOutput: row.expectedOutput,
    resultSummarySha256: row.resultSummarySha256,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    updatedAt: row.updatedAt,
  };
}

const BUDGET_SELECT = `
  SELECT run_id runId, root_run_id rootRunId, parent_run_id parentRunId, depth,
         max_turns maxTurns, max_model_calls maxModelCalls, max_tool_calls maxToolCalls,
         max_output_tokens maxOutputTokens, max_total_tokens maxTotalTokens,
         max_duration_ms maxDurationMs, deadline_at deadlineAt,
         max_delegation_depth maxDelegationDepth, max_active_children maxActiveChildren,
         max_total_children maxTotalChildren,
         allowed_workspace_ids_json allowedWorkspaceIdsJson,
         allowed_skill_ids_json allowedSkillIdsJson,
         allowed_tool_names_json allowedToolNamesJson,
         used_turns usedTurns, used_input_tokens usedInputTokens,
         used_output_tokens usedOutputTokens, used_model_calls usedModelCalls,
         used_tool_calls usedToolCalls, delegated_used_turns delegatedUsedTurns,
         delegated_used_input_tokens delegatedUsedInputTokens,
         delegated_used_output_tokens delegatedUsedOutputTokens,
         delegated_used_model_calls delegatedUsedModelCalls,
         delegated_used_tool_calls delegatedUsedToolCalls,
         created_at createdAt, updated_at updatedAt
  FROM run_budget_envelopes
`;

const DELEGATION_SELECT = `
  SELECT delegation_id delegationId, idempotency_key idempotencyKey,
         root_run_id rootRunId, parent_run_id parentRunId,
         parent_attempt_id parentAttemptId, parent_tool_call_id parentToolCallId,
         child_conversation_id childConversationId, child_run_id childRunId,
         depth, status, task_sha256 taskSha256,
         workspace_scope_json workspaceScopeJson, skill_ids_json skillIdsJson,
         tool_names_json toolNamesJson, expected_output expectedOutput,
         result_summary_sha256 resultSummarySha256,
         created_at createdAt, started_at startedAt, ended_at endedAt, updated_at updatedAt
  FROM run_delegations
`;


const DELEGATION_JOIN_SELECT = `
  SELECT d.delegation_id delegationId, d.idempotency_key idempotencyKey,
         d.root_run_id rootRunId, d.parent_run_id parentRunId,
         d.parent_attempt_id parentAttemptId, d.parent_tool_call_id parentToolCallId,
         d.child_conversation_id childConversationId, d.child_run_id childRunId,
         d.depth depth, d.status status, d.task_sha256 taskSha256,
         d.workspace_scope_json workspaceScopeJson, d.skill_ids_json skillIdsJson,
         d.tool_names_json toolNamesJson, d.expected_output expectedOutput,
         d.result_summary_sha256 resultSummarySha256,
         d.created_at createdAt, d.started_at startedAt, d.ended_at endedAt, d.updated_at updatedAt
  FROM run_delegations d
`;

const RESERVATION_SELECT = `
  SELECT delegation_id delegationId, parent_run_id parentRunId, child_run_id childRunId,
         status, reserved_turns reservedTurns, reserved_model_calls reservedModelCalls,
         reserved_tool_calls reservedToolCalls, reserved_total_tokens reservedTotalTokens,
         charged_turns chargedTurns, charged_input_tokens chargedInputTokens,
         charged_output_tokens chargedOutputTokens, charged_model_calls chargedModelCalls,
         charged_tool_calls chargedToolCalls, release_reason releaseReason,
         created_at createdAt, released_at releasedAt, updated_at updatedAt
  FROM run_delegation_budget_reservations
`;

const DELIVERY_SELECT = `
  SELECT delegation_id delegationId, parent_run_id parentRunId,
         parent_attempt_id parentAttemptId, parent_tool_call_id parentToolCallId,
         tool_name toolName, status, result_sha256 resultSha256,
         created_at createdAt, delivered_at deliveredAt, updated_at updatedAt
  FROM run_delegation_result_deliveries
`;

export class StateDelegationRepository {
  public constructor(private readonly db: DatabaseSync) {}

  public getBudgetEnvelope(runId: string): LedgerRunBudgetEnvelopeRow | null {
    const row = this.db.prepare(`${BUDGET_SELECT} WHERE run_id=?`).get(runId) as any;
    return row ? budget(row) : null;
  }

  public insertBudgetEnvelope(row: LedgerRunBudgetEnvelopeRow): void {
    this.db.prepare(`
      INSERT INTO run_budget_envelopes (
        run_id,root_run_id,parent_run_id,depth,max_turns,max_model_calls,max_tool_calls,
        max_output_tokens,max_total_tokens,max_duration_ms,deadline_at,
        max_delegation_depth,max_active_children,max_total_children,
        allowed_workspace_ids_json,allowed_skill_ids_json,allowed_tool_names_json,
        used_turns,used_input_tokens,used_output_tokens,used_model_calls,used_tool_calls,
        delegated_used_turns,delegated_used_input_tokens,delegated_used_output_tokens,
        delegated_used_model_calls,delegated_used_tool_calls,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      row.runId, row.rootRunId, row.parentRunId, row.depth,
      row.maxTurns, row.maxModelCalls, row.maxToolCalls, row.maxOutputTokens,
      row.maxTotalTokens, row.maxDurationMs, row.deadlineAt,
      row.maxDelegationDepth, row.maxActiveChildren, row.maxTotalChildren,
      JSON.stringify(row.allowedWorkspaceIds), JSON.stringify(row.allowedSkillIds), JSON.stringify(row.allowedToolNames),
      row.usedTurns, row.usedInputTokens, row.usedOutputTokens, row.usedModelCalls, row.usedToolCalls,
      row.delegatedUsedTurns, row.delegatedUsedInputTokens, row.delegatedUsedOutputTokens,
      row.delegatedUsedModelCalls, row.delegatedUsedToolCalls, row.createdAt, row.updatedAt,
    );
  }

  public updateBudgetUsage(input: {
    runId: string;
    usedTurns: number;
    usedInputTokens: number;
    usedOutputTokens: number;
    usedModelCalls: number;
    usedToolCalls: number;
    updatedAt: number;
  }): void {
    const result = this.db.prepare(`
      UPDATE run_budget_envelopes
      SET used_turns=?,used_input_tokens=?,used_output_tokens=?,used_model_calls=?,used_tool_calls=?,updated_at=?
      WHERE run_id=?
    `).run(
      input.usedTurns, input.usedInputTokens, input.usedOutputTokens,
      input.usedModelCalls, input.usedToolCalls, input.updatedAt, input.runId,
    );
    if (result.changes !== 1) {
      throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "run budget usage target missing");
    }
  }

  public getDelegation(delegationId: string): LedgerRunDelegationRow | null {
    const row = this.db.prepare(`${DELEGATION_SELECT} WHERE delegation_id=?`).get(delegationId) as any;
    return row ? delegation(row) : null;
  }

  public getDelegationByChildRun(childRunId: string): LedgerRunDelegationRow | null {
    const row = this.db.prepare(`${DELEGATION_SELECT} WHERE child_run_id=?`).get(childRunId) as any;
    return row ? delegation(row) : null;
  }

  public getDelegationByIdempotency(parentRunId: string, idempotencyKey: string): LedgerRunDelegationRow | null {
    const row = this.db.prepare(`${DELEGATION_SELECT} WHERE parent_run_id=? AND idempotency_key=?`).get(parentRunId, idempotencyKey) as any;
    return row ? delegation(row) : null;
  }

  public insertDelegation(row: LedgerRunDelegationRow): void {
    this.db.prepare(`
      INSERT INTO run_delegations (
        delegation_id,idempotency_key,root_run_id,parent_run_id,parent_attempt_id,parent_tool_call_id,
        child_conversation_id,child_run_id,depth,status,task_sha256,
        workspace_scope_json,skill_ids_json,tool_names_json,expected_output,result_summary_sha256,
        created_at,started_at,ended_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      row.delegationId, row.idempotencyKey, row.rootRunId, row.parentRunId,
      row.parentAttemptId, row.parentToolCallId, row.childConversationId, row.childRunId,
      row.depth, row.status, row.taskSha256, JSON.stringify(row.workspaceScope),
      JSON.stringify(row.skillIds), JSON.stringify(row.toolNames), row.expectedOutput,
      row.resultSummarySha256, row.createdAt, row.startedAt, row.endedAt, row.updatedAt,
    );
  }

  public listDirectChildren(parentRunId: string): LedgerRunDelegationRow[] {
    return (this.db.prepare(`${DELEGATION_SELECT} WHERE parent_run_id=? ORDER BY created_at,delegation_id`).all(parentRunId) as any[]).map(delegation);
  }

  public listDelegations(input: { rootRunId?: string; parentRunId?: string; status?: LedgerDelegationStatus; limit: number }): LedgerRunDelegationRow[] {
    const clauses: string[] = [];
    const params: (string | number)[] = [];
    if (input.rootRunId !== undefined) { clauses.push("root_run_id=?"); params.push(input.rootRunId); }
    if (input.parentRunId !== undefined) { clauses.push("parent_run_id=?"); params.push(input.parentRunId); }
    if (input.status !== undefined) { clauses.push("status=?"); params.push(input.status); }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.prepare(`${DELEGATION_SELECT}${where} ORDER BY created_at DESC,delegation_id LIMIT ?`).all(...params, input.limit) as any[];
    return rows.map(delegation);
  }

  public listDescendants(rootRunId: string): LedgerRunDelegationRow[] {
    return (this.db.prepare(`${DELEGATION_SELECT} WHERE root_run_id=? ORDER BY depth,created_at,delegation_id`).all(rootRunId) as any[]).map(delegation);
  }

  public listDescendantsOfRun(parentRunId: string): LedgerRunDelegationRow[] {
    const rows = this.db.prepare(`
      WITH RECURSIVE subtree(delegation_id) AS (
        SELECT delegation_id FROM run_delegations WHERE parent_run_id=?
        UNION ALL
        SELECT child.delegation_id
        FROM run_delegations child
        JOIN subtree parent ON child.parent_run_id=(SELECT child_run_id FROM run_delegations WHERE delegation_id=parent.delegation_id)
      )
      ${DELEGATION_SELECT} WHERE delegation_id IN (SELECT delegation_id FROM subtree)
      ORDER BY depth,created_at,delegation_id
    `).all(parentRunId) as any[];
    return rows.map(delegation);
  }

  public listSubtreeByChildRun(childRunId: string): LedgerRunDelegationRow[] {
    const root = this.getDelegationByChildRun(childRunId);
    if (!root) return [];
    return [root, ...this.listDescendantsOfRun(childRunId)];
  }

  public listExpiredActiveDelegations(now: number): LedgerRunDelegationRow[] {
    return (this.db.prepare(`
      ${DELEGATION_JOIN_SELECT}
      JOIN run_budget_envelopes b ON b.run_id=d.child_run_id
      WHERE d.status IN ('CREATED','RUNNING','WAITING') AND b.deadline_at<=?
      ORDER BY d.depth DESC,d.created_at,d.delegation_id
    `).all(now) as any[]).map(delegation);
  }

  public listTerminalChildDelegations(): LedgerRunDelegationRow[] {
    return (this.db.prepare(`
      ${DELEGATION_JOIN_SELECT}
      JOIN agent_runs child ON child.run_id=d.child_run_id
      LEFT JOIN run_delegation_result_deliveries delivery ON delivery.delegation_id=d.delegation_id
      WHERE child.status IN ('COMPLETED','FAILED','CANCELLED')
        AND (d.status IN ('CREATED','RUNNING','WAITING') OR delivery.status='PENDING')
      ORDER BY d.depth DESC,d.created_at,d.delegation_id
    `).all() as any[]).map(delegation);
  }

  public listRunnableChildRunIds(): string[] {
    const rows = this.db.prepare(`
      SELECT d.child_run_id childRunId
      FROM run_delegations d
      JOIN agent_runs child ON child.run_id=d.child_run_id
      WHERE d.status IN ('CREATED','RUNNING','WAITING')
        AND child.status='CREATED'
        AND NOT EXISTS (SELECT 1 FROM run_delegation_waits w WHERE w.parent_run_id=child.run_id)
      ORDER BY d.depth,d.created_at,d.delegation_id
    `).all() as any[];
    return rows.map((row) => String(row.childRunId));
  }

  public reservationSummary(parentRunId: string): LedgerDelegationReservationSummary {
    const row = this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM run_delegation_budget_reservations r WHERE r.parent_run_id=? AND r.status='RESERVED') activeChildren,
        (SELECT COUNT(*) FROM run_delegations d WHERE d.parent_run_id=?) totalChildren,
        COALESCE(SUM(CASE WHEN r.status='RESERVED' THEN r.reserved_turns ELSE 0 END),0) reservedTurns,
        COALESCE(SUM(CASE WHEN r.status='RESERVED' THEN r.reserved_model_calls ELSE 0 END),0) reservedModelCalls,
        COALESCE(SUM(CASE WHEN r.status='RESERVED' THEN r.reserved_tool_calls ELSE 0 END),0) reservedToolCalls,
        COALESCE(SUM(CASE WHEN r.status='RESERVED' THEN r.reserved_total_tokens ELSE 0 END),0) reservedTotalTokens
      FROM run_delegation_budget_reservations r
      WHERE r.parent_run_id=?
    `).get(parentRunId,parentRunId,parentRunId) as any;
    return {
      activeChildren: Number(row?.activeChildren ?? 0),
      totalChildren: Number(row?.totalChildren ?? 0),
      reservedTurns: Number(row?.reservedTurns ?? 0),
      reservedModelCalls: Number(row?.reservedModelCalls ?? 0),
      reservedToolCalls: Number(row?.reservedToolCalls ?? 0),
      reservedTotalTokens: Number(row?.reservedTotalTokens ?? 0),
    };
  }

  public getBudgetReservation(delegationId: string): LedgerRunDelegationBudgetReservationRow | null {
    const row = this.db.prepare(`${RESERVATION_SELECT} WHERE delegation_id=?`).get(delegationId) as any;
    return row ? { ...row } : null;
  }

  public insertBudgetReservation(row: LedgerRunDelegationBudgetReservationRow): void {
    this.db.prepare(`
      INSERT INTO run_delegation_budget_reservations (
        delegation_id,parent_run_id,child_run_id,status,
        reserved_turns,reserved_model_calls,reserved_tool_calls,reserved_total_tokens,
        charged_turns,charged_input_tokens,charged_output_tokens,charged_model_calls,charged_tool_calls,
        release_reason,created_at,released_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      row.delegationId,row.parentRunId,row.childRunId,row.status,
      row.reservedTurns,row.reservedModelCalls,row.reservedToolCalls,row.reservedTotalTokens,
      row.chargedTurns,row.chargedInputTokens,row.chargedOutputTokens,row.chargedModelCalls,row.chargedToolCalls,
      row.releaseReason,row.createdAt,row.releasedAt,row.updatedAt,
    );
  }

  public releaseBudgetReservation(input: {
    delegationId: string;
    reason: LedgerDelegationReleaseReason;
    usage: LedgerDelegationChargedUsage;
    releasedAt: number;
  }): { released: boolean; reservation: LedgerRunDelegationBudgetReservationRow } {
    const current = this.getBudgetReservation(input.delegationId);
    if (!current) throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "delegation budget reservation is missing");
    if (current.status === "RELEASED") {
      const same = current.releaseReason === input.reason
        && current.chargedTurns === input.usage.turns
        && current.chargedInputTokens === input.usage.inputTokens
        && current.chargedOutputTokens === input.usage.outputTokens
        && current.chargedModelCalls === input.usage.modelCalls
        && current.chargedToolCalls === input.usage.toolCalls;
      if (!same) throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "delegation budget release conflicts with durable charge");
      return { released: false, reservation: current };
    }
    const updated = this.db.prepare(`
      UPDATE run_delegation_budget_reservations
      SET status='RELEASED',charged_turns=?,charged_input_tokens=?,charged_output_tokens=?,
          charged_model_calls=?,charged_tool_calls=?,release_reason=?,released_at=?,updated_at=?
      WHERE delegation_id=? AND status='RESERVED'
    `).run(
      input.usage.turns,input.usage.inputTokens,input.usage.outputTokens,input.usage.modelCalls,input.usage.toolCalls,
      input.reason,input.releasedAt,input.releasedAt,input.delegationId,
    );
    if (updated.changes !== 1) throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "delegation budget reservation release failed");
    const charged = this.db.prepare(`
      UPDATE run_budget_envelopes
      SET delegated_used_turns=delegated_used_turns+?,
          delegated_used_input_tokens=delegated_used_input_tokens+?,
          delegated_used_output_tokens=delegated_used_output_tokens+?,
          delegated_used_model_calls=delegated_used_model_calls+?,
          delegated_used_tool_calls=delegated_used_tool_calls+?,updated_at=?
      WHERE run_id=?
    `).run(
      input.usage.turns,input.usage.inputTokens,input.usage.outputTokens,input.usage.modelCalls,input.usage.toolCalls,
      input.releasedAt,current.parentRunId,
    );
    if (charged.changes !== 1) throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "delegation parent budget charge target is missing");
    const reservation = this.getBudgetReservation(input.delegationId);
    if (!reservation) throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "released delegation budget reservation disappeared");
    return { released: true, reservation };
  }

  public updateDelegationStatus(input: {
    delegationId: string;
    status: LedgerDelegationStatus;
    startedAt: number | null;
    endedAt: number | null;
    resultSummarySha256?: string | null;
    updatedAt: number;
  }): void {
    const result = this.db.prepare(`
      UPDATE run_delegations
      SET status=?,started_at=COALESCE(started_at,?),ended_at=?,result_summary_sha256=COALESCE(?,result_summary_sha256),updated_at=?
      WHERE delegation_id=?
    `).run(
      input.status, input.startedAt, input.endedAt,
      input.resultSummarySha256 ?? null, input.updatedAt, input.delegationId,
    );
    if (result.changes !== 1) throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "delegation update target missing");
  }

  public nextEventSequence(delegationId: string): number {
    const row = this.db.prepare(`SELECT COALESCE(MAX(sequence),0)+1 nextSequence FROM run_delegation_events WHERE delegation_id=?`).get(delegationId) as any;
    return Number(row?.nextSequence ?? 1);
  }

  public insertEvent(row: LedgerRunDelegationEventRow): void {
    const payloadJson = JSON.stringify(row.payload);
    if (payloadJson === undefined) throw new TypeError("delegation event payload must be JSON serializable");
    this.db.prepare(`
      INSERT INTO run_delegation_events (delegation_id,sequence,event_type,payload_json,emitted_at)
      VALUES (?,?,?,?,?)
    `).run(row.delegationId, row.sequence, row.eventType, payloadJson, row.emittedAt);
  }

  public listEvents(delegationId: string): LedgerRunDelegationEventRow[] {
    return (this.db.prepare(`
      SELECT delegation_id delegationId, sequence, event_type eventType, payload_json payloadJson, emitted_at emittedAt
      FROM run_delegation_events WHERE delegation_id=? ORDER BY sequence
    `).all(delegationId) as any[]).map((row) => ({
      delegationId: row.delegationId,
      sequence: row.sequence,
      eventType: row.eventType,
      payload: parseJson(row.payloadJson, "run_delegation_events.payload_json"),
      emittedAt: row.emittedAt,
    }));
  }

  public insertWait(row: LedgerRunDelegationWaitRow): void {
    this.db.prepare(`
      INSERT INTO run_delegation_waits (parent_run_id,delegation_id,state,created_at,updated_at)
      VALUES (?,?,?,?,?)
      ON CONFLICT(parent_run_id,delegation_id) DO UPDATE SET updated_at=excluded.updated_at
    `).run(row.parentRunId, row.delegationId, row.state, row.createdAt, row.updatedAt);
  }

  public deleteWait(parentRunId: string, delegationId: string): boolean {
    return this.db.prepare(`DELETE FROM run_delegation_waits WHERE parent_run_id=? AND delegation_id=?`).run(parentRunId, delegationId).changes === 1;
  }

  public listWaits(parentRunId: string): LedgerRunDelegationWaitRow[] {
    return (this.db.prepare(`
      SELECT parent_run_id parentRunId,delegation_id delegationId,state,created_at createdAt,updated_at updatedAt
      FROM run_delegation_waits WHERE parent_run_id=? ORDER BY created_at,delegation_id
    `).all(parentRunId) as any[]).map((row) => ({ ...row }));
  }

  public hasActiveWait(parentRunId: string): boolean {
    return Boolean(this.db.prepare(`SELECT 1 FROM run_delegation_waits WHERE parent_run_id=? LIMIT 1`).get(parentRunId));
  }

  public getResultDelivery(delegationId: string): LedgerRunDelegationResultDeliveryRow | null {
    const row = this.db.prepare(`${DELIVERY_SELECT} WHERE delegation_id=?`).get(delegationId) as any;
    return row ? { ...row } : null;
  }

  public getResultDeliveryByToolCall(parentRunId: string, parentToolCallId: string): LedgerRunDelegationResultDeliveryRow | null {
    const row = this.db.prepare(`${DELIVERY_SELECT} WHERE parent_run_id=? AND parent_tool_call_id=?`).get(parentRunId, parentToolCallId) as any;
    return row ? { ...row } : null;
  }

  public insertResultDelivery(row: LedgerRunDelegationResultDeliveryRow): void {
    this.db.prepare(`
      INSERT INTO run_delegation_result_deliveries (
        delegation_id,parent_run_id,parent_attempt_id,parent_tool_call_id,tool_name,status,
        result_sha256,created_at,delivered_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      row.delegationId, row.parentRunId, row.parentAttemptId, row.parentToolCallId,
      row.toolName, row.status, row.resultSha256, row.createdAt, row.deliveredAt, row.updatedAt,
    );
  }

  public markResultDelivered(input: { delegationId: string; resultSha256: string; deliveredAt: number; updatedAt: number }): void {
    const result = this.db.prepare(`
      UPDATE run_delegation_result_deliveries
      SET status='DELIVERED',result_sha256=?,delivered_at=?,updated_at=?
      WHERE delegation_id=? AND status='PENDING'
    `).run(input.resultSha256, input.deliveredAt, input.updatedAt, input.delegationId);
    if (result.changes !== 1) {
      throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "delegation result delivery target missing or not pending");
    }
  }
}
