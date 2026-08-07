import { randomUUID } from "node:crypto";
import type { LedgerTaskFlowRow, OpenRillStateDatabase, StateRepositories } from "@openrill/state";
import type { BackgroundTask, TaskService, TaskStatus } from "@openrill/tasks";
import { TaskFlowError } from "./errors.js";
import type { TaskFlow, TaskFlowEvent, TaskFlowStatus, TaskFlowTaskLink, TaskFlowView } from "./types.js";

const TERMINAL = new Set<TaskFlowStatus>(["SUCCEEDED", "FAILED", "CANCELLED", "LOST"]);
const TASK_TERMINAL = new Set<TaskStatus>(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED", "LOST"]);
const STATUSES = new Set<TaskFlowStatus>(["QUEUED", "RUNNING", "WAITING", "BLOCKED", "SUCCEEDED", "FAILED", "CANCELLED", "LOST"]);

type ActiveTaskFlowStatus = Exclude<TaskFlowStatus, "SUCCEEDED" | "FAILED" | "CANCELLED" | "LOST">;
function isActiveTaskFlowStatus(status: TaskFlowStatus): status is ActiveTaskFlowStatus { return !TERMINAL.has(status); }

const ALLOWED: Readonly<Record<ActiveTaskFlowStatus, ReadonlySet<TaskFlowStatus>>> = {
  QUEUED: new Set(["RUNNING", "WAITING", "BLOCKED", "FAILED", "CANCELLED", "LOST"]),
  RUNNING: new Set(["WAITING", "BLOCKED", "SUCCEEDED", "FAILED", "CANCELLED", "LOST"]),
  WAITING: new Set(["QUEUED", "RUNNING", "FAILED", "CANCELLED", "LOST"]),
  BLOCKED: new Set(["QUEUED", "RUNNING", "FAILED", "CANCELLED", "LOST"]),
};

function toFlow(row: LedgerTaskFlowRow): TaskFlow {
  return { ...row };
}

function bounded(value: string, label: string, max: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new TaskFlowError("TASK_FLOW_INVALID_ARGUMENT", `invalid ${label}`);
  return normalized;
}

function optionalBounded(value: string | null | undefined, label: string, max: number): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > max) throw new TaskFlowError("TASK_FLOW_INVALID_ARGUMENT", `invalid ${label}`);
  return normalized;
}

export interface TaskFlowMutationContext {
  readonly repositories: StateRepositories;
  readonly before: LedgerTaskFlowRow;
  readonly after: LedgerTaskFlowRow;
  readonly now: number;
}

export type TaskFlowMutationHook = (context: TaskFlowMutationContext) => void;

function assertJson(value: unknown, label: string): unknown {
  if (value === undefined) return null;
  try {
    const text = JSON.stringify(value);
    if (text === undefined || text.length > 262_144) throw new Error("invalid");
    return value;
  } catch {
    throw new TaskFlowError("TASK_FLOW_INVALID_ARGUMENT", `${label} must be bounded JSON`);
  }
}

export class TaskFlowService {
  public constructor(
    private readonly stateDatabase: OpenRillStateDatabase,
    private readonly tasks: TaskService,
    private readonly workspaceIds: readonly string[],
    private readonly now: () => number = Date.now,
  ) {}

  #authorize(workspaceId: string): string {
    const normalized = bounded(workspaceId, "workspaceId", 64);
    if (!this.workspaceIds.includes(normalized)) throw new TaskFlowError("TASK_FLOW_ACCESS_DENIED", `workspace access denied: ${normalized}`);
    return normalized;
  }

  #owned(workspaceId: string, ownerKey: string, flowId: string): TaskFlow {
    this.#authorize(workspaceId);
    const normalizedOwnerKey = bounded(ownerKey, "ownerKey", 256);
    const normalizedFlowId = bounded(flowId, "flowId", 256);
    const row = this.stateDatabase.transaction((repositories) => repositories.taskFlows.get(normalizedFlowId));
    if (!row) throw new TaskFlowError("TASK_FLOW_NOT_FOUND", "task flow not found");
    if (row.workspaceId !== workspaceId) throw new TaskFlowError("TASK_FLOW_ACCESS_DENIED", "task flow belongs to a different workspace");
    if (row.ownerKey !== normalizedOwnerKey) throw new TaskFlowError("TASK_FLOW_ACCESS_DENIED", "task flow belongs to a different owner");
    return toFlow(row);
  }

  public create(input: {
    workspaceId: string;
    ownerKey: string;
    controllerId: string;
    goal: string;
    currentStep?: string | null;
    state?: unknown;
    status?: Extract<TaskFlowStatus, "QUEUED" | "RUNNING">;
  }): TaskFlow {
    const workspaceId = this.#authorize(input.workspaceId);
    const ownerKey = bounded(input.ownerKey, "ownerKey", 256);
    const controllerId = bounded(input.controllerId, "controllerId", 128);
    const goal = bounded(input.goal, "goal", 65_536);
    const currentStep = optionalBounded(input.currentStep, "currentStep", 256);
    const state = assertJson(input.state, "state");
    const now = this.now();
    const flow: LedgerTaskFlowRow = {
      flowId: randomUUID(), workspaceId, ownerKey, controllerId, goal, status: input.status ?? "QUEUED",
      currentStep, blockedTaskId: null, blockedSummary: null, state, wait: null,
      cancelRequestedAt: null, createdAt: now, updatedAt: now, endedAt: null, cleanupAfter: null, revision: 1,
    };
    this.stateDatabase.transaction((repositories) => {
      const owner = repositories.conversations.getConversation(ownerKey);
      if (!owner) throw new TaskFlowError("TASK_FLOW_NOT_FOUND", "task flow owner conversation not found");
      if (owner.workspaceId !== workspaceId) throw new TaskFlowError("TASK_FLOW_ACCESS_DENIED", "task flow owner belongs to a different workspace");
      repositories.taskFlows.insert(flow);
      repositories.taskFlows.appendEvent({
        flowId: flow.flowId, sequence: 1, eventType: "taskFlow.created", status: flow.status,
        revision: flow.revision, payload: { ownerKey, controllerId, goal, currentStep }, emittedAt: now,
      });
    });
    return toFlow(flow);
  }

  public list(input: { workspaceId: string; ownerKey: string; status?: TaskFlowStatus; controllerId?: string; limit?: number }): readonly TaskFlow[] {
    const workspaceId = this.#authorize(input.workspaceId);
    const ownerKey = bounded(input.ownerKey, "ownerKey", 256);
    if (input.status && !STATUSES.has(input.status)) throw new TaskFlowError("TASK_FLOW_INVALID_ARGUMENT", "invalid task flow status");
    const controllerId = input.controllerId === undefined ? undefined : bounded(input.controllerId, "controllerId", 128);
    const limit = input.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new TaskFlowError("TASK_FLOW_INVALID_ARGUMENT", "limit must be 1..200");
    return this.stateDatabase.transaction((repositories) => repositories.taskFlows.list({
      workspaceId, ownerKey, ...(input.status ? { status: input.status } : {}), ...(controllerId ? { controllerId } : {}), limit,
    }).map(toFlow));
  }

  public get(input: { workspaceId: string; ownerKey: string; flowId: string }): TaskFlowView {
    const flow = this.#owned(input.workspaceId, input.ownerKey, input.flowId);
    const snapshot = this.stateDatabase.transaction((repositories) => ({
      links: repositories.taskFlows.listTaskLinks(flow.flowId),
      events: repositories.taskFlows.listEvents(flow.flowId, 200),
    }));
    const tasks: TaskFlowTaskLink[] = snapshot.links.map((link) => ({
      taskId: link.taskId,
      stepKey: link.stepKey,
      linkedAt: link.linkedAt,
      task: this.tasks.get({ workspaceId: flow.workspaceId, taskId: link.taskId }).task,
    }));
    const events: TaskFlowEvent[] = snapshot.events.map((event) => ({
      sequence: event.sequence, eventType: event.eventType, status: event.status,
      revision: event.revision, payload: event.payload, emittedAt: event.emittedAt,
    }));
    return { flow, tasks, events };
  }

  public linkTask(input: { workspaceId: string; ownerKey: string; flowId: string; taskId: string; expectedRevision: number; stepKey?: string | null }): TaskFlowView {
    const current = this.#owned(input.workspaceId, input.ownerKey, input.flowId);
    const taskId = bounded(input.taskId, "taskId", 256);
    const stepKey = optionalBounded(input.stepKey, "stepKey", 256);
    const now = this.now();
    this.stateDatabase.transaction((repositories) => {
      const fresh = repositories.taskFlows.get(current.flowId);
      if (!fresh) throw new TaskFlowError("TASK_FLOW_NOT_FOUND", "task flow not found");
      if (fresh.revision !== input.expectedRevision) throw new TaskFlowError("TASK_FLOW_REVISION_CONFLICT", `expected revision ${input.expectedRevision}, current ${fresh.revision}`);
      const existing = repositories.taskFlows.getTaskLink(taskId);
      if (existing) {
        if (existing.flowId === fresh.flowId && existing.stepKey === stepKey) return;
        throw new TaskFlowError("TASK_FLOW_TASK_CONFLICT", "task is already linked to another flow or step");
      }
      if (TERMINAL.has(fresh.status)) throw new TaskFlowError("TASK_FLOW_STATE_INVALID", "terminal task flow cannot accept child tasks");
      if (fresh.cancelRequestedAt !== null) throw new TaskFlowError("TASK_FLOW_STATE_INVALID", "task flow cancellation has already been requested");
      const task = repositories.tasks.get(taskId);
      if (!task) throw new TaskFlowError("TASK_FLOW_NOT_FOUND", "background task not found");
      if (task.workspaceId !== fresh.workspaceId) throw new TaskFlowError("TASK_FLOW_ACCESS_DENIED", "task belongs to a different workspace");
      if (task.conversationId !== fresh.ownerKey) throw new TaskFlowError("TASK_FLOW_ACCESS_DENIED", "task belongs to a different task flow owner");
      const linked = repositories.taskFlows.linkTask({ flowId: fresh.flowId, taskId, stepKey, linkedAt: now });
      if (linked === "CONFLICT") throw new TaskFlowError("TASK_FLOW_TASK_CONFLICT", "task is already linked to another flow or step");
      if (linked === "REPLAY") return;
      const updated = repositories.taskFlows.update({
        flowId: fresh.flowId, expectedRevision: fresh.revision, status: fresh.status,
        currentStep: fresh.currentStep, blockedTaskId: fresh.blockedTaskId,
        blockedSummary: fresh.blockedSummary, state: fresh.state, wait: fresh.wait,
        cancelRequestedAt: fresh.cancelRequestedAt, updatedAt: now, endedAt: fresh.endedAt,
      });
      if (!updated) throw new TaskFlowError("TASK_FLOW_REVISION_CONFLICT", "task flow changed while linking child task");
      repositories.taskFlows.appendEvent({
        flowId: updated.flowId, sequence: repositories.taskFlows.nextEventSequence(updated.flowId),
        eventType: "taskFlow.task.linked", status: updated.status, revision: updated.revision,
        payload: { taskId, stepKey }, emittedAt: now,
      });
    });
    return this.get({ workspaceId: input.workspaceId, ownerKey: input.ownerKey, flowId: input.flowId });
  }

  public getByTask(input: { workspaceId: string; ownerKey: string; taskId: string }): TaskFlowView | null {
    this.#authorize(input.workspaceId);
    const ownerKey = bounded(input.ownerKey, "ownerKey", 256);
    const taskId = bounded(input.taskId, "taskId", 256);
    const link = this.stateDatabase.transaction((repositories) => repositories.taskFlows.getTaskLink(taskId));
    if (!link) return null;
    return this.get({ workspaceId: input.workspaceId, ownerKey, flowId: link.flowId });
  }

  #mutate(input: {
    workspaceId: string;
    ownerKey: string;
    flowId: string;
    expectedRevision: number;
    targetStatus: TaskFlowStatus;
    eventType: string;
    currentStep?: string | null;
    blockedTaskId?: string | null;
    blockedSummary?: string | null;
    state?: unknown;
    wait?: unknown;
    cancelRequestedAt?: number | null;
    endedAt?: number | null;
  }, hook?: TaskFlowMutationHook): TaskFlow {
    const owned = this.#owned(input.workspaceId, input.ownerKey, input.flowId);
    const now = this.now();
    return this.stateDatabase.transaction((repositories) => {
      const current = repositories.taskFlows.get(owned.flowId);
      if (!current) throw new TaskFlowError("TASK_FLOW_NOT_FOUND", "task flow not found");
      if (current.revision !== input.expectedRevision) throw new TaskFlowError("TASK_FLOW_REVISION_CONFLICT", `expected revision ${input.expectedRevision}, current ${current.revision}`);
      if (!isActiveTaskFlowStatus(current.status)) throw new TaskFlowError("TASK_FLOW_STATE_INVALID", `terminal task flow cannot transition from ${current.status}`);
      if (current.status !== input.targetStatus && !ALLOWED[current.status].has(input.targetStatus)) {
        throw new TaskFlowError("TASK_FLOW_STATE_INVALID", `invalid task flow transition ${current.status} -> ${input.targetStatus}`);
      }
      const blockedTaskId = input.blockedTaskId === undefined ? current.blockedTaskId : optionalBounded(input.blockedTaskId, "blockedTaskId", 256);
      if (input.targetStatus === "BLOCKED") {
        if (!blockedTaskId) throw new TaskFlowError("TASK_FLOW_INVALID_ARGUMENT", "blocked task flow requires blockedTaskId");
        const link = repositories.taskFlows.listTaskLinks(current.flowId).find((entry) => entry.taskId === blockedTaskId);
        if (!link) throw new TaskFlowError("TASK_FLOW_STATE_INVALID", "blockedTaskId must be linked to the task flow");
      }
      const updated = repositories.taskFlows.update({
        flowId: current.flowId,
        expectedRevision: current.revision,
        status: input.targetStatus,
        currentStep: input.currentStep === undefined ? current.currentStep : optionalBounded(input.currentStep, "currentStep", 256),
        blockedTaskId: input.targetStatus === "BLOCKED" ? blockedTaskId : null,
        blockedSummary: input.targetStatus === "BLOCKED" ? optionalBounded(input.blockedSummary, "blockedSummary", 4096) : null,
        state: input.state === undefined ? current.state : assertJson(input.state, "state"),
        wait: input.targetStatus === "WAITING" ? assertJson(input.wait, "wait") : null,
        cancelRequestedAt: input.cancelRequestedAt === undefined ? current.cancelRequestedAt : input.cancelRequestedAt,
        updatedAt: now,
        endedAt: TERMINAL.has(input.targetStatus) ? (input.endedAt ?? now) : null,
      });
      if (!updated) throw new TaskFlowError("TASK_FLOW_REVISION_CONFLICT", "task flow changed during transition");
      repositories.taskFlows.appendEvent({
        flowId: updated.flowId, sequence: repositories.taskFlows.nextEventSequence(updated.flowId),
        eventType: input.eventType, status: updated.status, revision: updated.revision,
        payload: { from: current.status, to: updated.status, currentStep: updated.currentStep, blockedTaskId: updated.blockedTaskId },
        emittedAt: now,
      });
      hook?.({ repositories, before: current, after: updated, now });
      return toFlow(updated);
    });
  }

  public start(input: { workspaceId: string; ownerKey: string; flowId: string; expectedRevision: number; currentStep?: string | null; state?: unknown }, hook?: TaskFlowMutationHook): TaskFlow {
    return this.#mutate({ ...input, targetStatus: "RUNNING", eventType: "taskFlow.running" }, hook);
  }

  public setWaiting(input: { workspaceId: string; ownerKey: string; flowId: string; expectedRevision: number; currentStep?: string | null; state?: unknown; wait?: unknown }, hook?: TaskFlowMutationHook): TaskFlow {
    return this.#mutate({ ...input, targetStatus: "WAITING", eventType: "taskFlow.waiting" }, hook);
  }

  public setBlocked(input: { workspaceId: string; ownerKey: string; flowId: string; expectedRevision: number; currentStep?: string | null; state?: unknown; blockedTaskId: string; blockedSummary?: string | null }, hook?: TaskFlowMutationHook): TaskFlow {
    return this.#mutate({ ...input, targetStatus: "BLOCKED", eventType: "taskFlow.blocked" }, hook);
  }

  public resume(input: { workspaceId: string; ownerKey: string; flowId: string; expectedRevision: number; status?: Extract<TaskFlowStatus, "QUEUED" | "RUNNING">; currentStep?: string | null; state?: unknown }, hook?: TaskFlowMutationHook): TaskFlow {
    return this.#mutate({ ...input, targetStatus: input.status ?? "QUEUED", eventType: "taskFlow.resumed" }, hook);
  }

  public finish(input: { workspaceId: string; ownerKey: string; flowId: string; expectedRevision: number; currentStep?: string | null; state?: unknown }, hook?: TaskFlowMutationHook): TaskFlow {
    return this.#mutate({ ...input, targetStatus: "SUCCEEDED", eventType: "taskFlow.succeeded" }, hook);
  }

  public fail(input: { workspaceId: string; ownerKey: string; flowId: string; expectedRevision: number; currentStep?: string | null; state?: unknown; blockedTaskId?: string | null; blockedSummary?: string | null }, hook?: TaskFlowMutationHook): TaskFlow {
    return this.#mutate({ ...input, targetStatus: "FAILED", eventType: "taskFlow.failed" }, hook);
  }

  public requestCancel(input: { workspaceId: string; ownerKey: string; flowId: string; expectedRevision: number }): TaskFlow {
    const current = this.#owned(input.workspaceId, input.ownerKey, input.flowId);
    if (TERMINAL.has(current.status)) return current;
    if (current.cancelRequestedAt !== null) return current;
    return this.#mutate({
      ...input, targetStatus: current.status, eventType: "taskFlow.cancel.requested",
      cancelRequestedAt: this.now(),
    });
  }

  public cancel(
    input: { workspaceId: string; ownerKey: string; flowId: string; expectedRevision: number },
    cancelTask: (task: BackgroundTask) => BackgroundTask,
  ): { flow: TaskFlowView; affectedTasks: number; replayed: boolean } {
    const before = this.#owned(input.workspaceId, input.ownerKey, input.flowId);
    if (TERMINAL.has(before.status)) return { flow: this.get(input), affectedTasks: 0, replayed: true };
    let current = this.requestCancel(input);
    let affectedTasks = 0;
    const linked = this.get(input).tasks;
    for (const entry of linked) {
      if (TASK_TERMINAL.has(entry.task.status)) continue;
      const updated = cancelTask(entry.task);
      if (updated.status !== entry.task.status || TASK_TERMINAL.has(updated.status)) affectedTasks += 1;
    }
    const afterTasks = this.get(input).tasks;
    if (afterTasks.every((entry) => TASK_TERMINAL.has(entry.task.status))) {
      current = this.#mutate({
        workspaceId: input.workspaceId, ownerKey: input.ownerKey, flowId: input.flowId, expectedRevision: current.revision,
        targetStatus: "CANCELLED", eventType: "taskFlow.cancelled", cancelRequestedAt: current.cancelRequestedAt,
      });
    }
    return { flow: this.get({ workspaceId: input.workspaceId, ownerKey: input.ownerKey, flowId: current.flowId }), affectedTasks, replayed: false };
  }
}
