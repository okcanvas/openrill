import type { LedgerTaskFlowRow, LedgerTaskRow, OpenRillStateDatabase } from "@openrill/state";
import type { BackgroundTask, TaskStatus } from "@openrill/tasks";
import { TaskFlowError } from "./errors.js";
import type {
  TaskFlowAuditCode,
  TaskFlowAuditFinding,
  TaskFlowAuditReport,
  TaskFlowAuditSummary,
  TaskFlowReconcileDecision,
  TaskFlowReconcileMode,
  TaskFlowReconcileResult,
  TaskFlowRetentionPreview,
  TaskFlowStatus,
} from "./types.js";

const ACTIVE_FLOW = new Set<TaskFlowStatus>(["QUEUED", "RUNNING", "WAITING", "BLOCKED"]);
const TERMINAL_FLOW = new Set<TaskFlowStatus>(["SUCCEEDED", "FAILED", "CANCELLED", "LOST"]);
const TERMINAL_TASK = new Set<TaskStatus>(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED", "LOST"]);
const DEFAULT_STALE_RUNNING_MS = 30 * 60_000;
const DEFAULT_STALE_WAITING_MS = 24 * 60 * 60_000;
const DEFAULT_STALE_BLOCKED_MS = 24 * 60 * 60_000;
const DEFAULT_CANCEL_STUCK_MS = 5 * 60_000;
const DEFAULT_EMPTY_FLOW_MS = 10 * 60_000;
const DEFAULT_FLOW_RETENTION_MS = 30 * 24 * 60 * 60_000;
const DEFAULT_LOST_RETENTION_MS = 7 * 24 * 60 * 60_000;

function boundedWorkspace(value: string): string {
  if (!/^[a-z][a-z0-9._-]{0,63}$/.test(value)) throw new TaskFlowError("TASK_FLOW_INVALID_ARGUMENT", "invalid workspaceId");
  return value;
}

function boundedOwner(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > 256) throw new TaskFlowError("TASK_FLOW_INVALID_ARGUMENT", "invalid ownerKey");
  return normalized;
}

function toTask(row: LedgerTaskRow): BackgroundTask {
  return {
    taskId: row.taskId,
    workspaceId: row.workspaceId,
    conversationId: row.conversationId,
    runId: row.runId,
    parentTaskId: row.parentTaskId,
    runtime: row.runtime,
    taskKind: row.taskKind,
    sourceId: row.sourceId,
    task: row.taskText,
    status: row.status,
    recoveryState: row.recoveryState,
    notifyPolicy: row.notifyPolicy,
    deliveryStatus: row.deliveryStatus,
    terminalOutcome: row.terminalOutcome,
    progressSummary: row.progressSummary,
    terminalSummary: row.terminalSummary,
    errorCode: row.errorCode,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    updatedAt: row.updatedAt,
    cleanupAfter: row.cleanupAfter,
    revision: row.revision,
  };
}

function summary(findings: readonly TaskFlowAuditFinding[]): TaskFlowAuditSummary {
  const byCode: Record<TaskFlowAuditCode, number> = {
    FLOW_STALE_RUNNING: 0,
    FLOW_STALE_WAITING: 0,
    FLOW_STALE_BLOCKED: 0,
    FLOW_CANCEL_STUCK: 0,
    FLOW_CANCEL_FINALIZATION_PENDING: 0,
    FLOW_WITHOUT_TASKS: 0,
    FLOW_BLOCKED_TASK_MISSING: 0,
    FLOW_TERMINAL_WITH_ACTIVE_TASK: 0,
    FLOW_OWNER_SCOPE_MISMATCH: 0,
    FLOW_ALL_CHILDREN_TERMINAL_ACTIVE: 0,
    FLOW_MISSING_CLEANUP: 0,
    FLOW_RETENTION_EXPIRED: 0,
    FLOW_INCONSISTENT_TIMESTAMPS: 0,
  };
  let warnings = 0;
  let errors = 0;
  for (const finding of findings) {
    byCode[finding.code] += 1;
    if (finding.severity === "ERROR") errors += 1;
    else warnings += 1;
  }
  return { total: findings.length, warnings, errors, byCode };
}

function compareFindings(left: TaskFlowAuditFinding, right: TaskFlowAuditFinding): number {
  const severity = (left.severity === "ERROR" ? 0 : 1) - (right.severity === "ERROR" ? 0 : 1);
  if (severity !== 0) return severity;
  const age = (right.ageMs ?? -1) - (left.ageMs ?? -1);
  if (age !== 0) return age;
  const flow = left.flowId.localeCompare(right.flowId);
  return flow !== 0 ? flow : (left.taskId ?? "").localeCompare(right.taskId ?? "");
}

interface FlowSnapshot {
  readonly flow: LedgerTaskFlowRow;
  readonly tasks: readonly LedgerTaskRow[];
  readonly missingTaskIds: readonly string[];
}

export interface TaskFlowMaintenanceServiceOptions {
  readonly state: OpenRillStateDatabase;
  readonly workspaceIds: readonly string[];
  readonly now?: () => number;
  readonly staleRunningMs?: number;
  readonly staleWaitingMs?: number;
  readonly staleBlockedMs?: number;
  readonly cancelStuckMs?: number;
  readonly emptyFlowMs?: number;
  readonly flowRetentionMs?: number;
  readonly lostRetentionMs?: number;
  readonly cancelFlow?: (input: { workspaceId: string; ownerKey: string; flowId: string; expectedRevision: number }) => {
    readonly affectedTasks: number;
    readonly replayed: boolean;
    readonly flow: { readonly flow: { readonly status: TaskFlowStatus; readonly revision: number } };
  };
}

export class TaskFlowMaintenanceService {
  readonly #allowed: Set<string>;
  readonly #now: () => number;
  readonly #staleRunningMs: number;
  readonly #staleWaitingMs: number;
  readonly #staleBlockedMs: number;
  readonly #cancelStuckMs: number;
  readonly #emptyFlowMs: number;
  readonly #flowRetentionMs: number;
  readonly #lostRetentionMs: number;
  readonly #cancelFlow: TaskFlowMaintenanceServiceOptions["cancelFlow"] | null;

  public constructor(private readonly options: TaskFlowMaintenanceServiceOptions) {
    this.#allowed = new Set(options.workspaceIds);
    this.#now = options.now ?? Date.now;
    this.#staleRunningMs = options.staleRunningMs ?? DEFAULT_STALE_RUNNING_MS;
    this.#staleWaitingMs = options.staleWaitingMs ?? DEFAULT_STALE_WAITING_MS;
    this.#staleBlockedMs = options.staleBlockedMs ?? DEFAULT_STALE_BLOCKED_MS;
    this.#cancelStuckMs = options.cancelStuckMs ?? DEFAULT_CANCEL_STUCK_MS;
    this.#emptyFlowMs = options.emptyFlowMs ?? DEFAULT_EMPTY_FLOW_MS;
    this.#flowRetentionMs = options.flowRetentionMs ?? DEFAULT_FLOW_RETENTION_MS;
    this.#lostRetentionMs = options.lostRetentionMs ?? DEFAULT_LOST_RETENTION_MS;
    this.#cancelFlow = options.cancelFlow ?? null;
  }

  #authorize(workspaceId: string): string {
    const normalized = boundedWorkspace(workspaceId);
    if (!this.#allowed.has(normalized)) throw new TaskFlowError("TASK_FLOW_ACCESS_DENIED", `workspace access denied: ${normalized}`);
    return normalized;
  }

  #limit(value: number | undefined): number {
    const limit = value ?? 200;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) throw new TaskFlowError("TASK_FLOW_INVALID_ARGUMENT", "limit must be 1..1000");
    return limit;
  }

  #snapshot(workspaceId: string, ownerKey: string | undefined, limit: number): readonly FlowSnapshot[] {
    return this.options.state.transaction((repositories) => repositories.taskFlows.listAll({
      workspaceId,
      ...(ownerKey === undefined ? {} : { ownerKey }),
      limit,
    }).map((flow) => {
      const links = repositories.taskFlows.listTaskLinks(flow.flowId);
      const tasks: LedgerTaskRow[] = [];
      const missingTaskIds: string[] = [];
      for (const link of links) {
        const task = repositories.tasks.get(link.taskId);
        if (task) tasks.push(task);
        else missingTaskIds.push(link.taskId);
      }
      return { flow, tasks, missingTaskIds };
    }));
  }

  public audit(input: { workspaceId: string; ownerKey?: string; limit?: number }): TaskFlowAuditReport {
    const workspaceId = this.#authorize(input.workspaceId);
    const ownerKey = boundedOwner(input.ownerKey);
    const now = this.#now();
    const findings: TaskFlowAuditFinding[] = [];
    for (const { flow, tasks, missingTaskIds } of this.#snapshot(workspaceId, ownerKey, this.#limit(input.limit))) {
      const ageMs = Math.max(0, now - flow.updatedAt);
      const activeTasks = tasks.filter((task) => !TERMINAL_TASK.has(task.status));
      const allTerminal = tasks.length > 0 && activeTasks.length === 0;
      if (flow.status === "RUNNING" && ageMs >= this.#staleRunningMs) findings.push({ severity: "ERROR", code: "FLOW_STALE_RUNNING", repairPolicy: "REPORT_ONLY", flowId: flow.flowId, detail: "running Task Flow has not advanced recently", ageMs, taskId: null });
      if (flow.status === "WAITING" && ageMs >= this.#staleWaitingMs) findings.push({ severity: "WARN", code: "FLOW_STALE_WAITING", repairPolicy: "REPORT_ONLY", flowId: flow.flowId, detail: "waiting Task Flow has not advanced recently", ageMs, taskId: null });
      if (flow.status === "BLOCKED" && ageMs >= this.#staleBlockedMs) findings.push({ severity: "WARN", code: "FLOW_STALE_BLOCKED", repairPolicy: "REPORT_ONLY", flowId: flow.flowId, detail: "blocked Task Flow has not advanced recently", ageMs, taskId: flow.blockedTaskId });
      if (ACTIVE_FLOW.has(flow.status) && tasks.length === 0 && ageMs >= this.#emptyFlowMs) findings.push({ severity: "WARN", code: "FLOW_WITHOUT_TASKS", repairPolicy: "REPORT_ONLY", flowId: flow.flowId, detail: "active Task Flow has no linked Tasks", ageMs, taskId: null });
      for (const missingTaskId of missingTaskIds) findings.push({ severity: "ERROR", code: "FLOW_OWNER_SCOPE_MISMATCH", repairPolicy: "REPORT_ONLY", flowId: flow.flowId, detail: "Task Flow link references a missing Task", ageMs, taskId: missingTaskId });
      for (const task of tasks) {
        if (task.workspaceId !== flow.workspaceId || task.conversationId !== flow.ownerKey) findings.push({ severity: "ERROR", code: "FLOW_OWNER_SCOPE_MISMATCH", repairPolicy: "REPORT_ONLY", flowId: flow.flowId, detail: "linked Task does not share Flow workspace/owner", ageMs, taskId: task.taskId });
      }
      if (flow.status === "BLOCKED" && (flow.blockedTaskId === null || !tasks.some((task) => task.taskId === flow.blockedTaskId))) findings.push({ severity: "ERROR", code: "FLOW_BLOCKED_TASK_MISSING", repairPolicy: "REPORT_ONLY", flowId: flow.flowId, detail: "blocked Task Flow does not reference a linked Task", ageMs, taskId: flow.blockedTaskId });
      if (TERMINAL_FLOW.has(flow.status) && activeTasks.length > 0) findings.push({ severity: "ERROR", code: "FLOW_TERMINAL_WITH_ACTIVE_TASK", repairPolicy: "REPORT_ONLY", flowId: flow.flowId, detail: "terminal Task Flow still has active child Tasks", ageMs, taskId: activeTasks[0]?.taskId ?? null });
      if (ACTIVE_FLOW.has(flow.status) && flow.cancelRequestedAt === null && allTerminal) findings.push({ severity: "WARN", code: "FLOW_ALL_CHILDREN_TERMINAL_ACTIVE", repairPolicy: "REPORT_ONLY", flowId: flow.flowId, detail: "all child Tasks are terminal but controller has not completed the Flow", ageMs, taskId: null });
      if (ACTIVE_FLOW.has(flow.status) && flow.cancelRequestedAt !== null) {
        const cancelAgeMs = Math.max(0, now - flow.cancelRequestedAt);
        if (activeTasks.length === 0) findings.push({ severity: "WARN", code: "FLOW_CANCEL_FINALIZATION_PENDING", repairPolicy: "SAFE_REPAIR", flowId: flow.flowId, detail: "cancellation is requested and all linked Tasks are terminal", ageMs: cancelAgeMs, taskId: null });
        else if (cancelAgeMs >= this.#cancelStuckMs) findings.push({ severity: "ERROR", code: "FLOW_CANCEL_STUCK", repairPolicy: "SAFE_REPAIR", flowId: flow.flowId, detail: "cancellation request still has active child Tasks after grace", ageMs: cancelAgeMs, taskId: activeTasks[0]?.taskId ?? null });
      }
      if (TERMINAL_FLOW.has(flow.status) && activeTasks.length === 0 && flow.cleanupAfter === null) findings.push({ severity: "WARN", code: "FLOW_MISSING_CLEANUP", repairPolicy: "SAFE_REPAIR", flowId: flow.flowId, detail: "terminal Task Flow is missing cleanupAfter", ageMs, taskId: null });
      if (TERMINAL_FLOW.has(flow.status) && flow.cleanupAfter !== null && flow.cleanupAfter <= now) findings.push({ severity: "WARN", code: "FLOW_RETENTION_EXPIRED", repairPolicy: "REPORT_ONLY", flowId: flow.flowId, detail: "Task Flow retention window is expired", ageMs, taskId: null });
      if ((flow.endedAt !== null && flow.endedAt < flow.createdAt) || (ACTIVE_FLOW.has(flow.status) && flow.endedAt !== null) || (TERMINAL_FLOW.has(flow.status) && flow.endedAt === null)) findings.push({ severity: "ERROR", code: "FLOW_INCONSISTENT_TIMESTAMPS", repairPolicy: "REPORT_ONLY", flowId: flow.flowId, detail: "Task Flow lifecycle timestamps are inconsistent", ageMs, taskId: null });
    }
    findings.sort(compareFindings);
    return { generatedAt: now, findings, summary: summary(findings) };
  }

  #scheduleCleanup(flowId: string, now: number): boolean {
    return this.options.state.transaction((repositories) => {
      const current = repositories.taskFlows.get(flowId);
      if (!current || !TERMINAL_FLOW.has(current.status) || current.cleanupAfter !== null || current.endedAt === null) return false;
      const activeChild = repositories.taskFlows.listTaskLinks(current.flowId).some((link) => {
        const task = repositories.tasks.get(link.taskId);
        return !task || !TERMINAL_TASK.has(task.status);
      });
      if (activeChild) return false;
      const retentionMs = current.status === "LOST" ? this.#lostRetentionMs : this.#flowRetentionMs;
      const cleanupAfter = current.endedAt + retentionMs;
      const updated = repositories.taskFlows.update({
        flowId: current.flowId,
        expectedRevision: current.revision,
        status: current.status,
        currentStep: current.currentStep,
        blockedTaskId: current.blockedTaskId,
        blockedSummary: current.blockedSummary,
        state: current.state,
        wait: current.wait,
        cancelRequestedAt: current.cancelRequestedAt,
        updatedAt: now,
        endedAt: current.endedAt,
        cleanupAfter,
      });
      if (!updated) return false;
      repositories.taskFlows.appendEvent({
        flowId: updated.flowId,
        sequence: repositories.taskFlows.nextEventSequence(updated.flowId),
        eventType: "taskFlow.retention.scheduled",
        status: updated.status,
        revision: updated.revision,
        payload: { cleanupAfter, retentionMs },
        emittedAt: now,
      });
      return true;
    });
  }

  public scheduleRetention(input: { workspaceId: string; ownerKey?: string; limit?: number }): number {
    const workspaceId = this.#authorize(input.workspaceId);
    const ownerKey = boundedOwner(input.ownerKey);
    const limit = this.#limit(input.limit);
    const now = this.#now();
    let scheduled = 0;
    const candidates = this.options.state.transaction((repositories) => repositories.taskFlows.listRetentionSchedulingCandidates({ workspaceId, ...(ownerKey === undefined ? {} : { ownerKey }), limit }));
    for (const flow of candidates) {
      if (this.#scheduleCleanup(flow.flowId, now)) scheduled += 1;
    }
    return scheduled;
  }

  public reconcile(input: { workspaceId: string; ownerKey?: string; mode: TaskFlowReconcileMode; limit?: number; includeRetention?: boolean }): TaskFlowReconcileResult {
    const workspaceId = this.#authorize(input.workspaceId);
    const ownerKey = boundedOwner(input.ownerKey);
    if (input.mode !== "PREVIEW" && input.mode !== "APPLY") throw new TaskFlowError("TASK_FLOW_INVALID_ARGUMENT", "invalid reconcile mode");
    const now = this.#now();
    const decisions: TaskFlowReconcileDecision[] = [];
    let cancellationReplayed = 0;
    let cancelled = 0;
    let retentionScheduled = 0;
    for (const snapshot of this.#snapshot(workspaceId, ownerKey, this.#limit(input.limit))) {
      let flow = snapshot.flow;
      let activeTasks = snapshot.tasks.filter((task) => !TERMINAL_TASK.has(task.status));
      if (ACTIVE_FLOW.has(flow.status) && flow.cancelRequestedAt !== null && (activeTasks.length === 0 || now - flow.cancelRequestedAt >= this.#cancelStuckMs)) {
        const action = activeTasks.length === 0 ? "FINALIZE_CANCELLED" : "REPLAY_CANCELLATION";
        let applied = false;
        if (input.mode === "APPLY") {
          if (!this.#cancelFlow) throw new TaskFlowError("TASK_FLOW_STATE_INVALID", "task flow cancellation repair is unavailable");
          const result = this.#cancelFlow({ workspaceId: flow.workspaceId, ownerKey: flow.ownerKey, flowId: flow.flowId, expectedRevision: flow.revision });
          applied = true;
          if (action === "REPLAY_CANCELLATION") cancellationReplayed += 1;
          if (result.flow.flow.status === "CANCELLED") cancelled += 1;
          const refreshed = this.options.state.transaction((repositories) => {
            const currentFlow = repositories.taskFlows.get(flow.flowId);
            const currentTasks = repositories.taskFlows.listTaskLinks(flow.flowId).flatMap((link) => {
              const task = repositories.tasks.get(link.taskId);
              return task ? [task] : [];
            });
            return { currentFlow, currentTasks };
          });
          if (refreshed.currentFlow) flow = refreshed.currentFlow;
          activeTasks = refreshed.currentTasks.filter((task) => !TERMINAL_TASK.has(task.status));
        }
        decisions.push({ flowId: flow.flowId, action, applied, detail: action === "FINALIZE_CANCELLED" ? "finalize cancel-requested Flow after all child Tasks became terminal" : "replay cancellation cascade for active child Tasks" });
      }
      if (input.includeRetention !== false && TERMINAL_FLOW.has(flow.status) && activeTasks.length === 0 && flow.cleanupAfter === null && flow.endedAt !== null) {
        const applied = input.mode === "APPLY" ? this.#scheduleCleanup(flow.flowId, now) : false;
        if (applied) retentionScheduled += 1;
        decisions.push({ flowId: flow.flowId, action: "SCHEDULE_RETENTION", applied, detail: `schedule ${flow.status === "LOST" ? this.#lostRetentionMs : this.#flowRetentionMs}ms retention window` });
      }
    }
    return { mode: input.mode, generatedAt: now, decisions, cancellationReplayed, cancelled, retentionScheduled };
  }

  public retentionPreview(input: { workspaceId: string; ownerKey?: string; limit?: number }): TaskFlowRetentionPreview {
    const workspaceId = this.#authorize(input.workspaceId);
    const ownerKey = boundedOwner(input.ownerKey);
    const now = this.#now();
    const limit = this.#limit(input.limit);
    const snapshot = this.options.state.transaction((repositories) => {
      const flows = repositories.taskFlows.listAll({ workspaceId, ...(ownerKey === undefined ? {} : { ownerKey }), limit: 1_000 });
      const hasActiveChild = (flowId: string): boolean => repositories.taskFlows.listTaskLinks(flowId).some((link) => {
        const task = repositories.tasks.get(link.taskId);
        return !task || !TERMINAL_TASK.has(task.status);
      });
      const candidates = repositories.taskFlows.listRetentionCandidates({ workspaceId, ...(ownerKey === undefined ? {} : { ownerKey }), now, limit })
        .filter((flow) => !hasActiveChild(flow.flowId));
      const protectedActive = flows.filter((flow) => ACTIVE_FLOW.has(flow.status) || hasActiveChild(flow.flowId)).length;
      return { candidates, protectedActive };
    });
    return {
      generatedAt: now,
      candidates: snapshot.candidates.flatMap((flow) => flow.endedAt === null || flow.cleanupAfter === null ? [] : [{ flowId: flow.flowId, ownerKey: flow.ownerKey, status: flow.status, endedAt: flow.endedAt, cleanupAfter: flow.cleanupAfter }]),
      protectedActive: snapshot.protectedActive,
    };
  }
}
