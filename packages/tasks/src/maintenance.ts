import type { LedgerAttemptRow, LedgerRunRow, LedgerTaskRow, OpenRillStateDatabase } from "@openrill/state";
import { TaskError } from "./errors.js";
import type {
  BackgroundTask,
  TaskAuditCode,
  TaskAuditFinding,
  TaskAuditReport,
  TaskAuditSummary,
  TaskReconcileDecision,
  TaskReconcileMode,
  TaskReconcileResult,
  TaskRetentionPreview,
  TaskStatus,
} from "./types.js";

const ACTIVE_TASK = new Set<TaskStatus>(["QUEUED", "RUNNING"]);
const TERMINAL_TASK = new Set<TaskStatus>(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED", "LOST"]);
const TERMINAL_RUN = new Set<LedgerRunRow["status"]>(["COMPLETED", "FAILED", "CANCELLED"]);
const DEFAULT_AUTHORITY_GRACE_MS = 5 * 60_000;
const DEFAULT_STALE_QUEUED_MS = 10 * 60_000;
const DEFAULT_STALE_RUNNING_MS = 30 * 60_000;
const DEFAULT_TASK_RETENTION_MS = 30 * 24 * 60 * 60_000;
const DEFAULT_LOST_RETENTION_MS = 7 * 24 * 60 * 60_000;

function boundedWorkspace(value: string): string {
  if (!/^[a-z][a-z0-9._-]{0,63}$/.test(value)) throw new TaskError("TASK_INVALID_ARGUMENT", "invalid workspaceId");
  return value;
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

function expectedTaskStatus(run: LedgerRunRow, attempt: LedgerAttemptRow | null): TaskStatus {
  if (run.status === "CREATED") return run.recoveryState === "RESUMABLE" && run.startedAt !== null ? "RUNNING" : "QUEUED";
  if (run.status === "RUNNING" || run.status === "WAITING_APPROVAL") return "RUNNING";
  if (run.status === "COMPLETED") return "SUCCEEDED";
  if (run.status === "CANCELLED") return "CANCELLED";
  if (attempt?.terminalReason === "RUNTIME_AUTHORITY_LOST") return "LOST";
  if (attempt?.terminalReason === "AGENT_TIME_BUDGET_EXCEEDED") return "TIMED_OUT";
  return "FAILED";
}

function createSummary(findings: readonly TaskAuditFinding[]): TaskAuditSummary {
  const byCode: Record<TaskAuditCode, number> = {
    TASK_RUN_STATUS_DRIFT: 0,
    TASK_TERMINAL_RUN_ACTIVE: 0,
    RUNTIME_AUTHORITY_MISSING: 0,
    STALE_QUEUED: 0,
    STALE_RUNNING: 0,
    MISSING_CLEANUP: 0,
    LOST_RETAINED: 0,
    LOST_RETENTION_EXPIRED: 0,
    OWNER_SCOPE_MISMATCH: 0,
    INCONSISTENT_TIMESTAMPS: 0,
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

function compareFindings(left: TaskAuditFinding, right: TaskAuditFinding): number {
  const severity = (left.severity === "ERROR" ? 0 : 1) - (right.severity === "ERROR" ? 0 : 1);
  if (severity !== 0) return severity;
  const age = (right.ageMs ?? -1) - (left.ageMs ?? -1);
  if (age !== 0) return age;
  return left.taskId.localeCompare(right.taskId);
}

export interface TaskMaintenanceServiceOptions {
  readonly state: OpenRillStateDatabase;
  readonly workspaceIds: readonly string[];
  readonly now?: () => number;
  readonly hostStartedAt?: number;
  readonly authorityGraceMs?: number;
  readonly staleQueuedMs?: number;
  readonly staleRunningMs?: number;
  readonly taskRetentionMs?: number;
  readonly lostRetentionMs?: number;
  readonly runtimeAuthorityAvailable?: () => boolean;
  readonly isRunActive?: (runId: string) => boolean;
  readonly isRunExpectedIdle?: (runId: string) => boolean;
  readonly markRunLost?: (runId: string) => void;
}

export class TaskMaintenanceService {
  readonly #allowed: Set<string>;
  readonly #now: () => number;
  readonly #hostStartedAt: number;
  readonly #authorityGraceMs: number;
  readonly #staleQueuedMs: number;
  readonly #staleRunningMs: number;
  readonly #taskRetentionMs: number;
  readonly #lostRetentionMs: number;
  readonly #runtimeAuthorityAvailable: () => boolean;
  readonly #isRunActive: (runId: string) => boolean;
  readonly #isRunExpectedIdle: (runId: string) => boolean;
  readonly #markRunLost: ((runId: string) => void) | null;

  public constructor(private readonly options: TaskMaintenanceServiceOptions) {
    this.#allowed = new Set(options.workspaceIds);
    this.#now = options.now ?? Date.now;
    this.#hostStartedAt = options.hostStartedAt ?? this.#now();
    this.#authorityGraceMs = options.authorityGraceMs ?? DEFAULT_AUTHORITY_GRACE_MS;
    this.#staleQueuedMs = options.staleQueuedMs ?? DEFAULT_STALE_QUEUED_MS;
    this.#staleRunningMs = options.staleRunningMs ?? DEFAULT_STALE_RUNNING_MS;
    this.#taskRetentionMs = options.taskRetentionMs ?? DEFAULT_TASK_RETENTION_MS;
    this.#lostRetentionMs = options.lostRetentionMs ?? DEFAULT_LOST_RETENTION_MS;
    this.#runtimeAuthorityAvailable = options.runtimeAuthorityAvailable ?? (() => false);
    this.#isRunActive = options.isRunActive ?? (() => false);
    this.#isRunExpectedIdle = options.isRunExpectedIdle ?? (() => false);
    this.#markRunLost = options.markRunLost ?? null;
  }

  #authorize(workspaceId: string): string {
    const normalized = boundedWorkspace(workspaceId);
    if (!this.#allowed.has(normalized)) throw new TaskError("TASK_ACCESS_DENIED", `workspace access denied: ${normalized}`);
    return normalized;
  }

  #limit(value: number | undefined): number {
    const limit = value ?? 200;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) throw new TaskError("TASK_INVALID_ARGUMENT", "limit must be 1..1000");
    return limit;
  }

  #snapshot(workspaceId: string, limit: number): readonly {
    task: LedgerTaskRow;
    run: LedgerRunRow;
    attempt: LedgerAttemptRow | null;
    ownerWorkspaceId: string;
  }[] {
    return this.options.state.transaction((repositories) => repositories.tasks.listAll({ workspaceId, limit }).flatMap((task) => {
      const run = repositories.conversations.getRun(task.runId);
      if (!run) return [];
      const owner = repositories.conversations.getConversation(task.conversationId);
      if (!owner) return [];
      const attempt = run.currentAttemptId ? repositories.conversations.getAttempt(run.currentAttemptId) : null;
      return [{ task, run, attempt, ownerWorkspaceId: owner.workspaceId }];
    }));
  }

  #authorityMissing(task: LedgerTaskRow, run: LedgerRunRow, now: number): boolean {
    if (!ACTIVE_TASK.has(task.status)) return false;
    if (run.status !== "CREATED" && run.status !== "RUNNING") return false;
    if (!this.#runtimeAuthorityAvailable()) return false;
    if (this.#isRunActive(run.runId) || this.#isRunExpectedIdle(run.runId)) return false;
    const referenceAt = Math.max(this.#hostStartedAt, run.updatedAt, task.updatedAt);
    return now - referenceAt >= this.#authorityGraceMs;
  }

  public audit(input: { workspaceId: string; limit?: number }): TaskAuditReport {
    const workspaceId = this.#authorize(input.workspaceId);
    const now = this.#now();
    const findings: TaskAuditFinding[] = [];
    for (const { task, run, attempt, ownerWorkspaceId } of this.#snapshot(workspaceId, this.#limit(input.limit))) {
      const ageMs = Math.max(0, now - task.updatedAt);
      const expected = expectedTaskStatus(run, attempt);
      if (TERMINAL_TASK.has(task.status) && !TERMINAL_RUN.has(run.status)) {
        findings.push({ severity: "ERROR", code: "TASK_TERMINAL_RUN_ACTIVE", repairPolicy: "REPORT_ONLY", taskId: task.taskId, runId: task.runId, detail: `terminal Task ${task.status} conflicts with active Run ${run.status}`, ageMs });
      } else if (task.status !== expected) {
        findings.push({ severity: TERMINAL_TASK.has(task.status) ? "ERROR" : "WARN", code: "TASK_RUN_STATUS_DRIFT", repairPolicy: TERMINAL_TASK.has(task.status) ? "REPORT_ONLY" : "SAFE_REPAIR", taskId: task.taskId, runId: task.runId, detail: `Task ${task.status} differs from Run projection ${expected}`, ageMs });
      }
      if (this.#authorityMissing(task, run, now)) {
        findings.push({ severity: "ERROR", code: "RUNTIME_AUTHORITY_MISSING", repairPolicy: "SAFE_REPAIR", taskId: task.taskId, runId: task.runId, detail: "active Run did not regain Host runtime authority after recovery grace", ageMs: Math.max(0, now - Math.max(this.#hostStartedAt, run.updatedAt, task.updatedAt)) });
      }
      if (task.status === "QUEUED" && ageMs >= this.#staleQueuedMs) findings.push({ severity: "WARN", code: "STALE_QUEUED", repairPolicy: "REPORT_ONLY", taskId: task.taskId, runId: task.runId, detail: "queued Task has not advanced recently", ageMs });
      if (task.status === "RUNNING" && ageMs >= this.#staleRunningMs) findings.push({ severity: "ERROR", code: "STALE_RUNNING", repairPolicy: "REPORT_ONLY", taskId: task.taskId, runId: task.runId, detail: "running Task has not advanced recently", ageMs });
      if (TERMINAL_TASK.has(task.status) && TERMINAL_RUN.has(run.status) && task.cleanupAfter === null) findings.push({ severity: "WARN", code: "MISSING_CLEANUP", repairPolicy: "SAFE_REPAIR", taskId: task.taskId, runId: task.runId, detail: "terminal Task is missing cleanupAfter", ageMs });
      if (task.status === "LOST" && task.cleanupAfter !== null) findings.push({ severity: task.cleanupAfter <= now ? "ERROR" : "WARN", code: task.cleanupAfter <= now ? "LOST_RETENTION_EXPIRED" : "LOST_RETAINED", repairPolicy: "REPORT_ONLY", taskId: task.taskId, runId: task.runId, detail: task.cleanupAfter <= now ? "LOST Task retention is expired" : "LOST Task is retained until cleanupAfter", ageMs });
      if (task.conversationId !== run.conversationId || ownerWorkspaceId !== task.workspaceId) findings.push({ severity: "ERROR", code: "OWNER_SCOPE_MISMATCH", repairPolicy: "REPORT_ONLY", taskId: task.taskId, runId: task.runId, detail: "Task Conversation/Workspace ownership differs from owning Run", ageMs });
      if ((task.startedAt !== null && task.startedAt < task.createdAt) || (task.endedAt !== null && task.startedAt !== null && task.endedAt < task.startedAt) || (ACTIVE_TASK.has(task.status) && task.endedAt !== null)) findings.push({ severity: "WARN", code: "INCONSISTENT_TIMESTAMPS", repairPolicy: "REPORT_ONLY", taskId: task.taskId, runId: task.runId, detail: "Task lifecycle timestamps are inconsistent", ageMs });
    }
    findings.sort(compareFindings);
    return { generatedAt: now, findings, summary: createSummary(findings) };
  }

  #scheduleCleanup(taskId: string, now: number): boolean {
    return this.options.state.transaction((repositories) => {
      const current = repositories.tasks.get(taskId);
      if (!current || !TERMINAL_TASK.has(current.status) || current.cleanupAfter !== null || current.endedAt === null) return false;
      const run = repositories.conversations.getRun(current.runId);
      if (!run || !TERMINAL_RUN.has(run.status)) return false;
      const retentionMs = current.status === "LOST" ? this.#lostRetentionMs : this.#taskRetentionMs;
      const cleanupAfter = current.endedAt + retentionMs;
      const updated = repositories.tasks.update({
        taskId: current.taskId,
        expectedRevision: current.revision,
        parentTaskId: current.parentTaskId,
        runtime: current.runtime,
        taskKind: current.taskKind,
        sourceId: current.sourceId,
        status: current.status,
        recoveryState: current.recoveryState,
        progressSummary: current.progressSummary,
        terminalSummary: current.terminalSummary,
        errorCode: current.errorCode,
        startedAt: current.startedAt,
        endedAt: current.endedAt,
        updatedAt: now,
        cleanupAfter,
      });
      if (!updated) return false;
      repositories.tasks.appendEvent({
        taskId: updated.taskId,
        sequence: repositories.tasks.nextEventSequence(updated.taskId),
        eventType: "task.retention.scheduled",
        status: updated.status,
        recoveryState: updated.recoveryState,
        payload: { cleanupAfter, retentionMs },
        runEventSequence: null,
        emittedAt: now,
      });
      return true;
    });
  }

  public scheduleRetention(input: { workspaceId: string; limit?: number }): number {
    const workspaceId = this.#authorize(input.workspaceId);
    const now = this.#now();
    let scheduled = 0;
    const candidates = this.options.state.transaction((repositories) => repositories.tasks.listRetentionSchedulingCandidates({ workspaceId, limit: this.#limit(input.limit) }));
    for (const task of candidates) {
      if (this.#scheduleCleanup(task.taskId, now)) scheduled += 1;
    }
    return scheduled;
  }

  public reconcile(input: { workspaceId: string; mode: TaskReconcileMode; limit?: number; includeRetention?: boolean }): TaskReconcileResult {
    const workspaceId = this.#authorize(input.workspaceId);
    if (input.mode !== "PREVIEW" && input.mode !== "APPLY") throw new TaskError("TASK_INVALID_ARGUMENT", "invalid reconcile mode");
    const now = this.#now();
    const decisions: TaskReconcileDecision[] = [];
    let reconciled = 0;
    let lost = 0;
    let retentionScheduled = 0;
    for (const snapshot of this.#snapshot(workspaceId, this.#limit(input.limit))) {
      let task = snapshot.task;
      let run = snapshot.run;
      const expected = expectedTaskStatus(run, snapshot.attempt);
      if (ACTIVE_TASK.has(task.status) && task.status !== expected && !this.#authorityMissing(task, run, now)) {
        let applied = false;
        if (input.mode === "APPLY") {
          const updated = this.options.state.transaction((repositories) => repositories.tasks.syncRunLifecycle({
            runId: run.runId,
            runStatus: run.status,
            recoveryState: run.recoveryState,
            startedAt: run.startedAt,
            endedAt: run.endedAt,
            updatedAt: now,
            currentAttemptId: run.currentAttemptId,
          }));
          task = updated;
          applied = updated.status === expected;
          if (applied) reconciled += 1;
        }
        decisions.push({ taskId: task.taskId, runId: task.runId, action: "SYNC_RUN_STATUS", applied, detail: `project Task to ${expected} from Run ${run.status}` });
      }
      if (this.#authorityMissing(task, run, now)) {
        let applied = false;
        if (input.mode === "APPLY") {
          if (!this.#markRunLost) throw new TaskError("TASK_STATE_INVALID", "runtime authority lost repair is unavailable");
          this.#markRunLost(task.runId);
          applied = true;
          lost += 1;
          const refreshed = this.options.state.transaction((repositories) => ({
            task: repositories.tasks.get(task.taskId),
            run: repositories.conversations.getRun(run.runId),
          }));
          if (refreshed.task) task = refreshed.task;
          if (refreshed.run) run = refreshed.run;
        }
        decisions.push({ taskId: task.taskId, runId: task.runId, action: "MARK_RUNTIME_LOST", applied, detail: "fail owning Run as non-resumable and project Task LOST" });
      }
      if (input.includeRetention !== false && TERMINAL_TASK.has(task.status) && TERMINAL_RUN.has(run.status) && task.cleanupAfter === null && task.endedAt !== null) {
        const applied = input.mode === "APPLY" ? this.#scheduleCleanup(task.taskId, now) : false;
        if (applied) retentionScheduled += 1;
        decisions.push({ taskId: task.taskId, runId: task.runId, action: "SCHEDULE_RETENTION", applied, detail: `schedule ${task.status === "LOST" ? this.#lostRetentionMs : this.#taskRetentionMs}ms retention window` });
      }
    }
    return { mode: input.mode, generatedAt: now, decisions, reconciled, lost, retentionScheduled };
  }

  public retentionPreview(input: { workspaceId: string; limit?: number }): TaskRetentionPreview {
    const workspaceId = this.#authorize(input.workspaceId);
    const now = this.#now();
    const limit = this.#limit(input.limit);
    const snapshot = this.options.state.transaction((repositories) => {
      const tasks = repositories.tasks.listAll({ workspaceId, limit: 1_000 });
      const candidates = repositories.tasks.listRetentionCandidates({ workspaceId, now, limit }).flatMap((task) => {
        const run = repositories.conversations.getRun(task.runId);
        return run && TERMINAL_RUN.has(run.status) ? [task] : [];
      });
      const protectedInconsistent = tasks.filter((task) => {
        if (ACTIVE_TASK.has(task.status)) return true;
        const run = repositories.conversations.getRun(task.runId);
        return !run || !TERMINAL_RUN.has(run.status);
      }).length;
      return { candidates, protectedInconsistent };
    });
    return {
      generatedAt: now,
      candidates: snapshot.candidates.flatMap((task) => task.endedAt === null || task.cleanupAfter === null ? [] : [{ taskId: task.taskId, runId: task.runId, status: task.status, endedAt: task.endedAt, cleanupAfter: task.cleanupAfter }]),
      protectedActive: snapshot.protectedInconsistent,
    };
  }
}
