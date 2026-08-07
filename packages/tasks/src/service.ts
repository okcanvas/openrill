import type { LedgerTaskRow, OpenRillStateDatabase } from "@openrill/state";
import { TaskError } from "./errors.js";
import type { BackgroundTask, BackgroundTaskDelivery, BackgroundTaskEvent, BackgroundTaskView, TaskNotifyPolicy, TaskRuntime, TaskStatus } from "./types.js";

const TERMINAL = new Set<TaskStatus>(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED", "LOST"]);
const STATUSES = new Set<TaskStatus>(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED", "LOST"]);
const RUNTIMES = new Set<TaskRuntime>(["CONVERSATION", "DELEGATION", "AUTOMATION"]);

function toTask(row: LedgerTaskRow): BackgroundTask {
  return {
    taskId: row.taskId, workspaceId: row.workspaceId, conversationId: row.conversationId,
    runId: row.runId, parentTaskId: row.parentTaskId, runtime: row.runtime,
    taskKind: row.taskKind, sourceId: row.sourceId, task: row.taskText, status: row.status,
    recoveryState: row.recoveryState, notifyPolicy: row.notifyPolicy, deliveryStatus: row.deliveryStatus,
    terminalOutcome: row.terminalOutcome, progressSummary: row.progressSummary,
    terminalSummary: row.terminalSummary, errorCode: row.errorCode, createdAt: row.createdAt,
    startedAt: row.startedAt, endedAt: row.endedAt, updatedAt: row.updatedAt, cleanupAfter: row.cleanupAfter, revision: row.revision,
  };
}

function bounded(value: string, label: string, max = 128): string {
  if (!value || value.length > max) throw new TaskError("TASK_INVALID_ARGUMENT", `invalid ${label}`);
  return value;
}

export class TaskService {
  public constructor(private readonly state: OpenRillStateDatabase, private readonly workspaceIds: readonly string[]) {}

  #authorize(workspaceId: string): void {
    bounded(workspaceId, "workspaceId", 64);
    if (!this.workspaceIds.includes(workspaceId)) throw new TaskError("TASK_ACCESS_DENIED", `workspace access denied: ${workspaceId}`);
  }

  public list(input: { workspaceId: string; status?: TaskStatus; runtime?: TaskRuntime; limit?: number }): readonly BackgroundTask[] {
    this.#authorize(input.workspaceId);
    if (input.status && !STATUSES.has(input.status)) throw new TaskError("TASK_INVALID_ARGUMENT", "invalid task status");
    if (input.runtime && !RUNTIMES.has(input.runtime)) throw new TaskError("TASK_INVALID_ARGUMENT", "invalid task runtime");
    const limit = input.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new TaskError("TASK_INVALID_ARGUMENT", "limit must be 1..200");
    return this.state.transaction((repositories) => repositories.tasks.list({
      workspaceId: input.workspaceId, ...(input.status ? { status: input.status } : {}),
      ...(input.runtime ? { runtime: input.runtime } : {}), limit,
    }).map(toTask));
  }

  public get(input: { workspaceId: string; taskId: string }): BackgroundTaskView {
    this.#authorize(input.workspaceId);
    bounded(input.taskId, "taskId", 256);
    return this.state.transaction((repositories) => {
      const row = repositories.tasks.get(input.taskId);
      if (!row) throw new TaskError("TASK_NOT_FOUND", "task not found");
      if (row.workspaceId !== input.workspaceId) throw new TaskError("TASK_ACCESS_DENIED", "task belongs to a different workspace");
      return {
        task: toTask(row),
        events: repositories.tasks.listEvents(row.taskId, 100).map((event): BackgroundTaskEvent => ({
          sequence: event.sequence, eventType: event.eventType, status: event.status,
          recoveryState: event.recoveryState, payload: event.payload,
          runEventSequence: event.runEventSequence, emittedAt: event.emittedAt,
        })),
        deliveries: repositories.taskDeliveries.listForTask(row.taskId, 100).map((delivery): BackgroundTaskDelivery => ({
          deliveryId: delivery.deliveryId, taskEventSequence: delivery.taskEventSequence,
          flowId: delivery.flowId, ownerConversationId: delivery.ownerConversationId,
          controllerId: delivery.controllerId, notifyPolicy: delivery.notifyPolicy,
          deliveryStatus: delivery.deliveryStatus, taskStatus: delivery.taskStatus,
          terminalOutcome: delivery.terminalOutcome, payload: delivery.payload,
          attemptCount: delivery.attemptCount, lastError: delivery.lastError,
          systemMessageId: delivery.systemMessageId, wakeRunId: delivery.wakeRunId,
          createdAt: delivery.createdAt, updatedAt: delivery.updatedAt,
          deliveredAt: delivery.deliveredAt, revision: delivery.revision,
        })),
      };
    });
  }

  public getByRun(input: { workspaceId: string; runId: string }): BackgroundTask {
    this.#authorize(input.workspaceId);
    bounded(input.runId, "runId", 256);
    return this.state.transaction((repositories) => {
      const row = repositories.tasks.getByRun(input.runId);
      if (!row) throw new TaskError("TASK_NOT_FOUND", "task not found for run");
      if (row.workspaceId !== input.workspaceId) throw new TaskError("TASK_ACCESS_DENIED", "task belongs to a different workspace");
      return toTask(row);
    });
  }

  public classify(input: { runId: string; runtime: TaskRuntime; taskKind: string; sourceId?: string | null; parentRunId?: string | null; notifyPolicy?: TaskNotifyPolicy; updatedAt: number }): BackgroundTask {
    return toTask(this.state.transaction((repositories) => repositories.tasks.classifyRun(input)));
  }

  public cancel(input: { workspaceId: string; taskId: string }, cancelRun: (task: BackgroundTask) => void): BackgroundTask {
    const current = this.get(input).task;
    if (TERMINAL.has(current.status)) return current;
    cancelRun(current);
    const updated = this.get(input).task;
    if (updated.status !== "CANCELLED" && !TERMINAL.has(updated.status)) {
      throw new TaskError("TASK_STATE_INVALID", "task Run did not reach a terminal state after cancellation");
    }
    return updated;
  }
}
