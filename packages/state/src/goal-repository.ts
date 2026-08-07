import type { DatabaseSync } from "node:sqlite";

export type LedgerGoalStatus = "ACTIVE" | "PAUSED" | "BLOCKED" | "COMPLETED" | "CANCELLED";
export type LedgerPlanStepStatus = "PENDING" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "CANCELLED";
export type LedgerGoalExecutionStatus = "QUEUED" | "RUNNING" | "WAITING" | "BLOCKED" | "SUCCEEDED" | "FAILED" | "CANCELLED";
export type LedgerGoalStepExecutionStatus = "PENDING" | "READY" | "RUNNING" | "WAITING" | "BLOCKED" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "SKIPPED";
export type LedgerGoalRetryMode = "MANUAL";
export type LedgerGoalBlockerType = "TASK_OUTPUT" | "TASK_FAILURE" | "OPERATOR" | "DEPENDENCY" | "RETRY_LIMIT";
export type LedgerGoalBlockerStatus = "OPEN" | "RESOLVED";

export interface LedgerGoalRow {
  goalId: string;
  workspaceId: string;
  conversationId: string;
  objective: string;
  status: LedgerGoalStatus;
  lastNote: string | null;
  blockerFingerprint: string | null;
  consecutiveBlockerCount: number;
  continuationCount: number;
  planRevision: number;
  sourceRunId: string | null;
  sourceAttemptId: string | null;
  createdAt: number;
  updatedAt: number;
  terminalAt: number | null;
  revision: number;
}

export interface LedgerPlanStepRow {
  stepId: string;
  goalId: string;
  ordinal: number;
  title: string;
  status: LedgerPlanStepStatus;
  note: string | null;
  sourceRunId: string | null;
  sourceAttemptId: string | null;
  startedAt: number | null;
  completedAt: number | null;
  updatedAt: number;
  revision: number;
}

export interface LedgerPlanRevisionStepRow {
  goalId: string;
  planRevision: number;
  stepId: string;
  ordinal: number;
  title: string;
  required: boolean;
  retryMode: LedgerGoalRetryMode;
  maxAttempts: number;
  createdAt: number;
}

export interface LedgerGoalEventRow {
  goalId: string;
  sequence: number;
  eventType: string;
  payload: unknown;
  sourceRunId: string | null;
  sourceAttemptId: string | null;
  emittedAt: number;
}

export interface LedgerGoalExecutionRow {
  goalId: string;
  workspaceId: string;
  conversationId: string;
  planRevision: number;
  flowId: string;
  controllerId: string;
  status: LedgerGoalExecutionStatus;
  currentStepId: string | null;
  createdAt: number;
  updatedAt: number;
  endedAt: number | null;
  revision: number;
}

export interface LedgerGoalStepExecutionRow {
  goalId: string;
  stepId: string;
  planRevision: number;
  ordinal: number;
  status: LedgerGoalStepExecutionStatus;
  currentTaskId: string | null;
  attemptCount: number;
  lastTerminalOutcome: "SUCCEEDED" | "BLOCKED" | null;
  lastSummary: string | null;
  startedAt: number | null;
  completedAt: number | null;
  retryMode: LedgerGoalRetryMode;
  maxAttempts: number;
  nextRetryAt: number | null;
  lastRetryReason: string | null;
  updatedAt: number;
  revision: number;
}

export interface LedgerGoalStepBlockerRow {
  blockerId: string;
  goalId: string;
  stepId: string;
  planRevision: number;
  taskId: string | null;
  blockerType: LedgerGoalBlockerType;
  fingerprint: string;
  summary: string;
  evidence: unknown;
  status: LedgerGoalBlockerStatus;
  occurrenceCount: number;
  createdAt: number;
  updatedAt: number;
  resolvedAt: number | null;
  resolvedBy: string | null;
  resolution: string | null;
  revision: number;
}

function goal(value: any): LedgerGoalRow {
  return {
    goalId: value.goalId,
    workspaceId: value.workspaceId,
    conversationId: value.conversationId,
    objective: value.objective,
    status: value.status,
    lastNote: value.lastNote ?? null,
    blockerFingerprint: value.blockerFingerprint ?? null,
    consecutiveBlockerCount: value.consecutiveBlockerCount,
    continuationCount: value.continuationCount,
    planRevision: value.planRevision,
    sourceRunId: value.sourceRunId ?? null,
    sourceAttemptId: value.sourceAttemptId ?? null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    terminalAt: value.terminalAt ?? null,
    revision: value.revision,
  };
}

function step(value: any): LedgerPlanStepRow {
  return {
    stepId: value.stepId,
    goalId: value.goalId,
    ordinal: value.ordinal,
    title: value.title,
    status: value.status,
    note: value.note ?? null,
    sourceRunId: value.sourceRunId ?? null,
    sourceAttemptId: value.sourceAttemptId ?? null,
    startedAt: value.startedAt ?? null,
    completedAt: value.completedAt ?? null,
    updatedAt: value.updatedAt,
    revision: value.revision,
  };
}

function execution(value: any): LedgerGoalExecutionRow {
  return {
    goalId: value.goalId, workspaceId: value.workspaceId, conversationId: value.conversationId,
    planRevision: value.planRevision, flowId: value.flowId, controllerId: value.controllerId,
    status: value.status, currentStepId: value.currentStepId ?? null, createdAt: value.createdAt,
    updatedAt: value.updatedAt, endedAt: value.endedAt ?? null, revision: value.revision,
  };
}

function stepExecution(value: any): LedgerGoalStepExecutionRow {
  return {
    goalId: value.goalId, stepId: value.stepId, planRevision: value.planRevision,
    ordinal: value.ordinal, status: value.status, currentTaskId: value.currentTaskId ?? null,
    attemptCount: value.attemptCount, lastTerminalOutcome: value.lastTerminalOutcome ?? null,
    lastSummary: value.lastSummary ?? null, startedAt: value.startedAt ?? null,
    completedAt: value.completedAt ?? null,
    retryMode: value.retryMode ?? "MANUAL",
    maxAttempts: value.maxAttempts ?? 3,
    nextRetryAt: value.nextRetryAt ?? null,
    lastRetryReason: value.lastRetryReason ?? null,
    updatedAt: value.updatedAt, revision: value.revision,
  };
}

function planRevisionStep(value: any): LedgerPlanRevisionStepRow {
  return {
    goalId: value.goalId, planRevision: value.planRevision, stepId: value.stepId,
    ordinal: value.ordinal, title: value.title, required: Boolean(value.required),
    retryMode: value.retryMode, maxAttempts: value.maxAttempts, createdAt: value.createdAt,
  };
}

function blocker(value: any): LedgerGoalStepBlockerRow {
  return {
    blockerId: value.blockerId, goalId: value.goalId, stepId: value.stepId,
    planRevision: value.planRevision, taskId: value.taskId ?? null,
    blockerType: value.blockerType, fingerprint: value.fingerprint, summary: value.summary,
    evidence: parsePayload(value.evidenceJson), status: value.status,
    occurrenceCount: value.occurrenceCount, createdAt: value.createdAt,
    updatedAt: value.updatedAt, resolvedAt: value.resolvedAt ?? null,
    resolvedBy: value.resolvedBy ?? null, resolution: value.resolution ?? null,
    revision: value.revision,
  };
}

function parsePayload(value: string): unknown {
  return JSON.parse(value) as unknown;
}

const GOAL_SELECT = `
  SELECT goal_id goalId, workspace_id workspaceId, conversation_id conversationId,
         objective, status, last_note lastNote, blocker_fingerprint blockerFingerprint,
         consecutive_blocker_count consecutiveBlockerCount,
         continuation_count continuationCount, plan_revision planRevision,
         source_run_id sourceRunId, source_attempt_id sourceAttemptId,
         created_at createdAt, updated_at updatedAt, terminal_at terminalAt, revision
  FROM agent_goals`;

const STEP_SELECT = `
  SELECT step_id stepId, goal_id goalId, ordinal, title, status, note,
         source_run_id sourceRunId, source_attempt_id sourceAttemptId,
         started_at startedAt, completed_at completedAt, updated_at updatedAt, revision
  FROM agent_goal_plan_steps`;

const EXECUTION_SELECT = `
  SELECT goal_id goalId, workspace_id workspaceId, conversation_id conversationId,
         plan_revision planRevision, flow_id flowId, controller_id controllerId,
         status, current_step_id currentStepId, created_at createdAt, updated_at updatedAt,
         ended_at endedAt, revision
  FROM agent_goal_executions`;

const STEP_EXECUTION_SELECT = `
  SELECT goal_id goalId, step_id stepId, plan_revision planRevision, ordinal, status,
         current_task_id currentTaskId, attempt_count attemptCount,
         last_terminal_outcome lastTerminalOutcome, last_summary lastSummary,
         started_at startedAt, completed_at completedAt, retry_mode retryMode,
         max_attempts maxAttempts, next_retry_at nextRetryAt,
         last_retry_reason lastRetryReason, updated_at updatedAt, revision
  FROM agent_goal_step_executions`;

const PLAN_REVISION_STEP_SELECT = `
  SELECT goal_id goalId, plan_revision planRevision, step_id stepId, ordinal, title,
         required, retry_mode retryMode, max_attempts maxAttempts, created_at createdAt
  FROM agent_goal_plan_revision_steps`;

const BLOCKER_SELECT = `
  SELECT blocker_id blockerId, goal_id goalId, step_id stepId, plan_revision planRevision,
         task_id taskId, blocker_type blockerType, fingerprint, summary,
         evidence_json evidenceJson, status, occurrence_count occurrenceCount,
         created_at createdAt, updated_at updatedAt, resolved_at resolvedAt,
         resolved_by resolvedBy, resolution, revision
  FROM agent_goal_step_blockers`;

export class StateGoalRepository {
  public constructor(private readonly db: DatabaseSync) {}

  public insertGoal(value: LedgerGoalRow): void {
    this.db.prepare(`
      INSERT INTO agent_goals
        (goal_id, workspace_id, conversation_id, objective, status, last_note,
         blocker_fingerprint, consecutive_blocker_count, continuation_count,
         plan_revision, source_run_id, source_attempt_id, created_at, updated_at,
         terminal_at, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      value.goalId, value.workspaceId, value.conversationId, value.objective, value.status,
      value.lastNote, value.blockerFingerprint, value.consecutiveBlockerCount,
      value.continuationCount, value.planRevision, value.sourceRunId, value.sourceAttemptId,
      value.createdAt, value.updatedAt, value.terminalAt, value.revision,
    );
  }

  public insertStep(value: LedgerPlanStepRow): void {
    this.db.prepare(`
      INSERT INTO agent_goal_plan_steps
        (step_id, goal_id, ordinal, title, status, note, source_run_id,
         source_attempt_id, started_at, completed_at, updated_at, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      value.stepId, value.goalId, value.ordinal, value.title, value.status, value.note,
      value.sourceRunId, value.sourceAttemptId, value.startedAt, value.completedAt,
      value.updatedAt, value.revision,
    );
  }

  public getOpen(conversationId: string): LedgerGoalRow | null {
    const value = this.db.prepare(`${GOAL_SELECT} WHERE conversation_id = ? AND status IN ('ACTIVE','PAUSED','BLOCKED') ORDER BY created_at DESC LIMIT 1`).get(conversationId);
    return value ? goal(value) : null;
  }

  public getLatest(conversationId: string): LedgerGoalRow | null {
    const value = this.db.prepare(`${GOAL_SELECT} WHERE conversation_id = ? ORDER BY created_at DESC, goal_id DESC LIMIT 1`).get(conversationId);
    return value ? goal(value) : null;
  }

  public get(goalId: string): LedgerGoalRow | null {
    const value = this.db.prepare(`${GOAL_SELECT} WHERE goal_id = ?`).get(goalId);
    return value ? goal(value) : null;
  }

  public listSteps(goalId: string): LedgerPlanStepRow[] {
    const rows = this.db.prepare(`
      SELECT s.step_id stepId, s.goal_id goalId,
             COALESCE(r.ordinal, s.ordinal) ordinal,
             COALESCE(r.title, s.title) title,
             s.status, s.note, s.source_run_id sourceRunId,
             s.source_attempt_id sourceAttemptId, s.started_at startedAt,
             s.completed_at completedAt, s.updated_at updatedAt, s.revision
      FROM agent_goal_plan_steps s
      JOIN agent_goals g ON g.goal_id = s.goal_id
      LEFT JOIN agent_goal_plan_revision_steps r
        ON r.goal_id = s.goal_id AND r.plan_revision = g.plan_revision AND r.step_id = s.step_id
      WHERE s.goal_id = ?
        AND (r.step_id IS NOT NULL OR NOT EXISTS (
          SELECT 1 FROM agent_goal_plan_revision_steps x
          WHERE x.goal_id = s.goal_id AND x.plan_revision = g.plan_revision
        ))
      ORDER BY COALESCE(r.ordinal, s.ordinal)
    `).all(goalId) as any[];
    return rows.map(step);
  }

  public getStep(goalId: string, stepId: string): LedgerPlanStepRow | null {
    const value = this.db.prepare(`${STEP_SELECT} WHERE goal_id = ? AND step_id = ?`).get(goalId, stepId);
    return value ? step(value) : null;
  }

  public getStepById(stepId: string): LedgerPlanStepRow | null {
    const value = this.db.prepare(`${STEP_SELECT} WHERE step_id = ?`).get(stepId);
    return value ? step(value) : null;
  }

  public updateGoal(input: {
    goalId: string;
    expectedRevision: number;
    status: LedgerGoalStatus;
    lastNote: string | null;
    blockerFingerprint: string | null;
    consecutiveBlockerCount: number;
    continuationCount: number;
    planRevision: number;
    sourceRunId: string | null;
    sourceAttemptId: string | null;
    updatedAt: number;
    terminalAt: number | null;
  }): LedgerGoalRow | null {
    const value = this.db.prepare(`
      UPDATE agent_goals
      SET status = ?, last_note = ?, blocker_fingerprint = ?,
          consecutive_blocker_count = ?, continuation_count = ?, plan_revision = ?,
          source_run_id = ?, source_attempt_id = ?, updated_at = ?, terminal_at = ?,
          revision = revision + 1
      WHERE goal_id = ? AND revision = ?
      RETURNING goal_id goalId, workspace_id workspaceId, conversation_id conversationId,
                objective, status, last_note lastNote, blocker_fingerprint blockerFingerprint,
                consecutive_blocker_count consecutiveBlockerCount,
                continuation_count continuationCount, plan_revision planRevision,
                source_run_id sourceRunId, source_attempt_id sourceAttemptId,
                created_at createdAt, updated_at updatedAt, terminal_at terminalAt, revision
    `).get(
      input.status, input.lastNote, input.blockerFingerprint, input.consecutiveBlockerCount,
      input.continuationCount, input.planRevision, input.sourceRunId, input.sourceAttemptId,
      input.updatedAt, input.terminalAt, input.goalId, input.expectedRevision,
    );
    return value ? goal(value) : null;
  }

  public updateStep(input: {
    goalId: string;
    stepId: string;
    expectedRevision: number;
    status: LedgerPlanStepStatus;
    note: string | null;
    sourceRunId: string | null;
    sourceAttemptId: string | null;
    startedAt: number | null;
    completedAt: number | null;
    updatedAt: number;
  }): LedgerPlanStepRow | null {
    const value = this.db.prepare(`
      UPDATE agent_goal_plan_steps
      SET status = ?, note = ?, source_run_id = ?, source_attempt_id = ?,
          started_at = ?, completed_at = ?, updated_at = ?, revision = revision + 1
      WHERE goal_id = ? AND step_id = ? AND revision = ?
      RETURNING step_id stepId, goal_id goalId, ordinal, title, status, note,
                source_run_id sourceRunId, source_attempt_id sourceAttemptId,
                started_at startedAt, completed_at completedAt, updated_at updatedAt, revision
    `).get(
      input.status, input.note, input.sourceRunId, input.sourceAttemptId,
      input.startedAt, input.completedAt, input.updatedAt,
      input.goalId, input.stepId, input.expectedRevision,
    );
    return value ? step(value) : null;
  }

  public insertExecution(value: LedgerGoalExecutionRow): void {
    this.db.prepare(`
      INSERT INTO agent_goal_executions
        (goal_id, workspace_id, conversation_id, plan_revision, flow_id, controller_id,
         status, current_step_id, created_at, updated_at, ended_at, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(value.goalId, value.workspaceId, value.conversationId, value.planRevision,
      value.flowId, value.controllerId, value.status, value.currentStepId, value.createdAt,
      value.updatedAt, value.endedAt, value.revision);
  }

  public getExecution(goalId: string): LedgerGoalExecutionRow | null {
    const value = this.db.prepare(`${EXECUTION_SELECT} WHERE goal_id = ?`).get(goalId);
    return value ? execution(value) : null;
  }

  public getExecutionByFlow(flowId: string): LedgerGoalExecutionRow | null {
    const value = this.db.prepare(`${EXECUTION_SELECT} WHERE flow_id = ?`).get(flowId);
    return value ? execution(value) : null;
  }

  public listActiveExecutions(limit: number): LedgerGoalExecutionRow[] {
    return (this.db.prepare(`${EXECUTION_SELECT} WHERE status IN ('QUEUED','RUNNING','WAITING','BLOCKED') ORDER BY updated_at, goal_id LIMIT ?`).all(limit) as any[]).map(execution);
  }

  public updateExecution(input: {
    goalId: string; expectedRevision: number; status: LedgerGoalExecutionStatus;
    currentStepId: string | null; updatedAt: number; endedAt: number | null;
  }): LedgerGoalExecutionRow | null {
    const value = this.db.prepare(`
      UPDATE agent_goal_executions
      SET status = ?, current_step_id = ?, updated_at = ?, ended_at = ?, revision = revision + 1
      WHERE goal_id = ? AND revision = ?
      RETURNING goal_id goalId, workspace_id workspaceId, conversation_id conversationId,
                plan_revision planRevision, flow_id flowId, controller_id controllerId,
                status, current_step_id currentStepId, created_at createdAt, updated_at updatedAt,
                ended_at endedAt, revision
    `).get(input.status, input.currentStepId, input.updatedAt, input.endedAt, input.goalId, input.expectedRevision);
    return value ? execution(value) : null;
  }

  public insertStepExecution(value: LedgerGoalStepExecutionRow): void {
    this.db.prepare(`
      INSERT INTO agent_goal_step_executions
        (goal_id, step_id, plan_revision, ordinal, status, current_task_id, attempt_count,
         last_terminal_outcome, last_summary, started_at, completed_at, retry_mode,
         max_attempts, next_retry_at, last_retry_reason, updated_at, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(value.goalId, value.stepId, value.planRevision, value.ordinal, value.status,
      value.currentTaskId, value.attemptCount, value.lastTerminalOutcome, value.lastSummary,
      value.startedAt, value.completedAt, value.retryMode, value.maxAttempts,
      value.nextRetryAt, value.lastRetryReason, value.updatedAt, value.revision);
  }

  public listStepExecutions(goalId: string, planRevision: number): LedgerGoalStepExecutionRow[] {
    return (this.db.prepare(`${STEP_EXECUTION_SELECT} WHERE goal_id = ? AND plan_revision = ? ORDER BY ordinal`).all(goalId, planRevision) as any[]).map(stepExecution);
  }

  public getStepExecution(goalId: string, stepId: string, planRevision: number): LedgerGoalStepExecutionRow | null {
    const value = this.db.prepare(`${STEP_EXECUTION_SELECT} WHERE goal_id = ? AND step_id = ? AND plan_revision = ?`).get(goalId, stepId, planRevision);
    return value ? stepExecution(value) : null;
  }

  public getStepExecutionByTask(taskId: string): LedgerGoalStepExecutionRow | null {
    const value = this.db.prepare(`${STEP_EXECUTION_SELECT} WHERE current_task_id = ?`).get(taskId);
    return value ? stepExecution(value) : null;
  }

  public updateStepExecution(input: {
    goalId: string; stepId: string; planRevision: number; expectedRevision: number;
    status: LedgerGoalStepExecutionStatus; currentTaskId: string | null; attemptCount: number;
    lastTerminalOutcome: "SUCCEEDED" | "BLOCKED" | null; lastSummary: string | null;
    startedAt: number | null; completedAt: number | null; retryMode: LedgerGoalRetryMode;
    maxAttempts: number; nextRetryAt: number | null; lastRetryReason: string | null;
    updatedAt: number;
  }): LedgerGoalStepExecutionRow | null {
    const value = this.db.prepare(`
      UPDATE agent_goal_step_executions
      SET status = ?, current_task_id = ?, attempt_count = ?,
          last_terminal_outcome = ?, last_summary = ?, started_at = ?, completed_at = ?,
          retry_mode = ?, max_attempts = ?, next_retry_at = ?, last_retry_reason = ?,
          updated_at = ?, revision = revision + 1
      WHERE goal_id = ? AND step_id = ? AND plan_revision = ? AND revision = ?
      RETURNING goal_id goalId, step_id stepId, plan_revision planRevision, ordinal, status,
                current_task_id currentTaskId, attempt_count attemptCount,
                last_terminal_outcome lastTerminalOutcome, last_summary lastSummary,
                started_at startedAt, completed_at completedAt, retry_mode retryMode,
                max_attempts maxAttempts, next_retry_at nextRetryAt,
                last_retry_reason lastRetryReason, updated_at updatedAt, revision
    `).get(input.status, input.currentTaskId, input.attemptCount, input.lastTerminalOutcome,
      input.lastSummary, input.startedAt, input.completedAt, input.retryMode,
      input.maxAttempts, input.nextRetryAt, input.lastRetryReason, input.updatedAt,
      input.goalId, input.stepId, input.planRevision, input.expectedRevision);
    return value ? stepExecution(value) : null;
  }

  public insertPlanRevisionStep(value: LedgerPlanRevisionStepRow): void {
    this.db.prepare(`
      INSERT INTO agent_goal_plan_revision_steps
        (goal_id, plan_revision, step_id, ordinal, title, required, retry_mode, max_attempts, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(value.goalId, value.planRevision, value.stepId, value.ordinal, value.title,
      value.required ? 1 : 0, value.retryMode, value.maxAttempts, value.createdAt);
  }

  public listPlanRevisionSteps(goalId: string, planRevision: number): LedgerPlanRevisionStepRow[] {
    return (this.db.prepare(`${PLAN_REVISION_STEP_SELECT} WHERE goal_id = ? AND plan_revision = ? ORDER BY ordinal`)
      .all(goalId, planRevision) as any[]).map(planRevisionStep);
  }

  public getPlanRevisionStep(goalId: string, planRevision: number, stepId: string): LedgerPlanRevisionStepRow | null {
    const value = this.db.prepare(`${PLAN_REVISION_STEP_SELECT} WHERE goal_id = ? AND plan_revision = ? AND step_id = ?`)
      .get(goalId, planRevision, stepId);
    return value ? planRevisionStep(value) : null;
  }

  public resequencePlanDefinitions(goalId: string, offset = 10_000): void {
    this.db.prepare(`UPDATE agent_goal_plan_steps SET ordinal = ordinal + ? WHERE goal_id = ?`).run(offset, goalId);
  }

  public updatePlanDefinition(input: { goalId: string; stepId: string; ordinal: number; title: string; updatedAt: number }): LedgerPlanStepRow | null {
    const value = this.db.prepare(`
      UPDATE agent_goal_plan_steps
      SET ordinal = ?, title = ?, updated_at = ?, revision = revision + 1
      WHERE goal_id = ? AND step_id = ?
      RETURNING step_id stepId, goal_id goalId, ordinal, title, status, note,
                source_run_id sourceRunId, source_attempt_id sourceAttemptId,
                started_at startedAt, completed_at completedAt, updated_at updatedAt, revision
    `).get(input.ordinal, input.title, input.updatedAt, input.goalId, input.stepId);
    return value ? step(value) : null;
  }

  public updateExecutionPlanRevision(input: {
    goalId: string; expectedRevision: number; planRevision: number;
    status: LedgerGoalExecutionStatus; currentStepId: string | null;
    updatedAt: number; endedAt: number | null;
  }): LedgerGoalExecutionRow | null {
    const value = this.db.prepare(`
      UPDATE agent_goal_executions
      SET plan_revision = ?, status = ?, current_step_id = ?, updated_at = ?, ended_at = ?, revision = revision + 1
      WHERE goal_id = ? AND revision = ?
      RETURNING goal_id goalId, workspace_id workspaceId, conversation_id conversationId,
                plan_revision planRevision, flow_id flowId, controller_id controllerId,
                status, current_step_id currentStepId, created_at createdAt, updated_at updatedAt,
                ended_at endedAt, revision
    `).get(input.planRevision, input.status, input.currentStepId, input.updatedAt,
      input.endedAt, input.goalId, input.expectedRevision);
    return value ? execution(value) : null;
  }

  public insertBlocker(value: LedgerGoalStepBlockerRow): void {
    const evidenceJson = JSON.stringify(value.evidence);
    if (evidenceJson === undefined) throw new TypeError("goal blocker evidence must be JSON serializable");
    this.db.prepare(`
      INSERT INTO agent_goal_step_blockers
        (blocker_id, goal_id, step_id, plan_revision, task_id, blocker_type, fingerprint,
         summary, evidence_json, status, occurrence_count, created_at, updated_at,
         resolved_at, resolved_by, resolution, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(value.blockerId, value.goalId, value.stepId, value.planRevision, value.taskId,
      value.blockerType, value.fingerprint, value.summary, evidenceJson, value.status,
      value.occurrenceCount, value.createdAt, value.updatedAt, value.resolvedAt,
      value.resolvedBy, value.resolution, value.revision);
  }

  public getBlocker(blockerId: string): LedgerGoalStepBlockerRow | null {
    const value = this.db.prepare(`${BLOCKER_SELECT} WHERE blocker_id = ?`).get(blockerId);
    return value ? blocker(value) : null;
  }

  public getBlockerByFingerprint(goalId: string, stepId: string, planRevision: number, fingerprint: string): LedgerGoalStepBlockerRow | null {
    const value = this.db.prepare(`${BLOCKER_SELECT} WHERE goal_id = ? AND step_id = ? AND plan_revision = ? AND fingerprint = ?`)
      .get(goalId, stepId, planRevision, fingerprint);
    return value ? blocker(value) : null;
  }

  public getOpenBlocker(goalId: string, stepId: string, planRevision: number): LedgerGoalStepBlockerRow | null {
    const value = this.db.prepare(`${BLOCKER_SELECT} WHERE goal_id = ? AND step_id = ? AND plan_revision = ? AND status = 'OPEN' ORDER BY updated_at DESC LIMIT 1`)
      .get(goalId, stepId, planRevision);
    return value ? blocker(value) : null;
  }

  public getAnyOpenBlocker(goalId: string, planRevision: number): LedgerGoalStepBlockerRow | null {
    const value = this.db.prepare(`${BLOCKER_SELECT} WHERE goal_id = ? AND plan_revision = ? AND status = 'OPEN' ORDER BY created_at, blocker_id LIMIT 1`)
      .get(goalId, planRevision);
    return value ? blocker(value) : null;
  }

  public listBlockers(goalId: string, planRevision: number, limit = 100): LedgerGoalStepBlockerRow[] {
    return (this.db.prepare(`${BLOCKER_SELECT} WHERE goal_id = ? AND plan_revision = ? ORDER BY created_at, blocker_id LIMIT ?`)
      .all(goalId, planRevision, limit) as any[]).map(blocker);
  }

  public incrementBlocker(input: {
    blockerId: string; expectedRevision: number; taskId: string | null; summary: string;
    evidence: unknown; updatedAt: number;
  }): LedgerGoalStepBlockerRow | null {
    const evidenceJson = JSON.stringify(input.evidence);
    if (evidenceJson === undefined) throw new TypeError("goal blocker evidence must be JSON serializable");
    const value = this.db.prepare(`
      UPDATE agent_goal_step_blockers
      SET task_id = ?, summary = ?, evidence_json = ?, status = 'OPEN',
          occurrence_count = occurrence_count + 1, updated_at = ?,
          resolved_at = NULL, resolved_by = NULL, resolution = NULL, revision = revision + 1
      WHERE blocker_id = ? AND revision = ?
      RETURNING blocker_id blockerId, goal_id goalId, step_id stepId, plan_revision planRevision,
                task_id taskId, blocker_type blockerType, fingerprint, summary,
                evidence_json evidenceJson, status, occurrence_count occurrenceCount,
                created_at createdAt, updated_at updatedAt, resolved_at resolvedAt,
                resolved_by resolvedBy, resolution, revision
    `).get(input.taskId, input.summary, evidenceJson, input.updatedAt, input.blockerId, input.expectedRevision);
    return value ? blocker(value) : null;
  }

  public resolveBlocker(input: {
    blockerId: string; expectedRevision: number; resolvedBy: string; resolution: string;
    updatedAt: number;
  }): LedgerGoalStepBlockerRow | null {
    const value = this.db.prepare(`
      UPDATE agent_goal_step_blockers
      SET status = 'RESOLVED', resolved_at = ?, resolved_by = ?, resolution = ?,
          updated_at = ?, revision = revision + 1
      WHERE blocker_id = ? AND revision = ? AND status = 'OPEN'
      RETURNING blocker_id blockerId, goal_id goalId, step_id stepId, plan_revision planRevision,
                task_id taskId, blocker_type blockerType, fingerprint, summary,
                evidence_json evidenceJson, status, occurrence_count occurrenceCount,
                created_at createdAt, updated_at updatedAt, resolved_at resolvedAt,
                resolved_by resolvedBy, resolution, revision
    `).get(input.updatedAt, input.resolvedBy, input.resolution, input.updatedAt,
      input.blockerId, input.expectedRevision);
    return value ? blocker(value) : null;
  }

  public nextEventSequence(goalId: string): number {
    const value = this.db.prepare(`SELECT COALESCE(MAX(sequence), 0) + 1 sequence FROM agent_goal_events WHERE goal_id = ?`).get(goalId) as { sequence: number };
    return value.sequence;
  }

  public appendEvent(value: LedgerGoalEventRow): void {
    const payloadJson = JSON.stringify(value.payload);
    if (payloadJson === undefined) throw new TypeError("goal event payload must be JSON serializable");
    this.db.prepare(`
      INSERT INTO agent_goal_events
        (goal_id, sequence, event_type, payload_json, source_run_id, source_attempt_id, emitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(value.goalId, value.sequence, value.eventType, payloadJson, value.sourceRunId, value.sourceAttemptId, value.emittedAt);
  }

  public listEvents(goalId: string, limit: number): LedgerGoalEventRow[] {
    return (this.db.prepare(`
      SELECT goal_id goalId, sequence, event_type eventType, payload_json payloadJson,
             source_run_id sourceRunId, source_attempt_id sourceAttemptId, emitted_at emittedAt
      FROM agent_goal_events WHERE goal_id = ? ORDER BY sequence DESC LIMIT ?
    `).all(goalId, limit) as any[]).reverse().map((value) => ({
      goalId: value.goalId,
      sequence: value.sequence,
      eventType: value.eventType,
      payload: parsePayload(value.payloadJson),
      sourceRunId: value.sourceRunId ?? null,
      sourceAttemptId: value.sourceAttemptId ?? null,
      emittedAt: value.emittedAt,
    }));
  }
}
