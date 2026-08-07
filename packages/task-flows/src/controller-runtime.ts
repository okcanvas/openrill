import { createHash } from "node:crypto";
import type { ConversationService, SendMessageResult } from "@openrill/conversations";
import type { LedgerMessageRow, LedgerRunRow, LedgerTaskFlowRow, LedgerTaskRow, OpenRillStateDatabase, StateRepositories } from "@openrill/state";
import type { BackgroundTask, TaskService } from "@openrill/tasks";
import { TaskFlowError } from "./errors.js";
import { TaskFlowService } from "./service.js";
import type { TaskFlow, TaskFlowStatus, TaskFlowView } from "./types.js";
import type { TaskFlowMutationHook } from "./service.js";

const ACTIVE_ADMISSION = new Set<TaskFlowStatus>(["QUEUED", "RUNNING"]);
const TERMINAL = new Set<TaskFlowStatus>(["SUCCEEDED", "FAILED", "CANCELLED", "LOST"]);

function bounded(value: string, label: string, max: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new TaskFlowError("TASK_FLOW_INVALID_ARGUMENT", `invalid ${label}`);
  }
  return normalized;
}

function optionalBounded(value: string | null | undefined, label: string, max: number): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > max) throw new TaskFlowError("TASK_FLOW_INVALID_ARGUMENT", `invalid ${label}`);
  return normalized;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function deterministicFlowId(input: { workspaceId: string; ownerKey: string; controllerId: string; requestKey: string }): string {
  return `flow:${digest(input)}`;
}

function deterministicSubmissionKey(flowId: string, requestKey: string): string {
  return `flow-task:${digest({ flowId, requestKey })}`;
}

function toFlow(row: LedgerTaskFlowRow): TaskFlow { return { ...row }; }

export interface BoundTaskFlowControllerRuntimeOptions {
  readonly state: OpenRillStateDatabase;
  readonly conversations: ConversationService;
  readonly tasks: TaskService;
  readonly taskFlows: TaskFlowService;
  readonly workspaceId: string;
  readonly ownerKey: string;
  readonly controllerId: string;
  readonly scheduleRun: (runId: string) => boolean;
  readonly cancelTask?: (task: BackgroundTask) => BackgroundTask;
  readonly now?: () => number;
}

export interface ManagedTaskFlowCreateResult {
  readonly flow: TaskFlow;
  readonly replayed: boolean;
}

export interface ManagedTaskFlowCreateHookContext {
  readonly repositories: StateRepositories;
  readonly flow: LedgerTaskFlowRow;
  readonly replayed: boolean;
  readonly now: number;
}
export type ManagedTaskFlowCreateHook = (context: ManagedTaskFlowCreateHookContext) => void;

export interface TaskFlowChildAdmissionHookContext {
  readonly repositories: StateRepositories;
  readonly flow: LedgerTaskFlowRow;
  readonly task: LedgerTaskRow;
  readonly run: LedgerRunRow;
  readonly message: LedgerMessageRow;
  readonly replayed: boolean;
  readonly now: number;
}
export type TaskFlowChildAdmissionHook = (context: TaskFlowChildAdmissionHookContext) => void;

export interface TaskFlowChildAdmissionResult {
  readonly flow: TaskFlowView;
  readonly task: BackgroundTask;
  readonly run: SendMessageResult["run"];
  readonly message: SendMessageResult["message"];
  readonly replayed: boolean;
  readonly scheduled: boolean;
}

export interface TaskFlowControllerRuntime {
  get(flowId: string): TaskFlowView;
  runTask(input: { flowId: string; expectedRevision: number; requestKey: string; stepKey: string; text: string; state?: unknown }): TaskFlowChildAdmissionResult;
  setWaiting(input: { flowId: string; expectedRevision: number; currentStep?: string | null; state?: unknown; wait?: unknown }): TaskFlow;
  setBlocked(input: { flowId: string; expectedRevision: number; currentStep?: string | null; state?: unknown; blockedTaskId: string; blockedSummary?: string | null }): TaskFlow;
  resume(input: { flowId: string; expectedRevision: number; status?: Extract<TaskFlowStatus, "QUEUED" | "RUNNING">; currentStep?: string | null; state?: unknown }): TaskFlow;
  finish(input: { flowId: string; expectedRevision: number; state?: unknown }): TaskFlow;
  fail(input: { flowId: string; expectedRevision: number; state?: unknown; blockedSummary?: string | null }): TaskFlow;
  requestCancel(input: { flowId: string; expectedRevision: number }): TaskFlow;
  cancel(input: { flowId: string; expectedRevision: number }): { flow: TaskFlowView; affectedTasks: number; replayed: boolean };
}

/** Conversation-bound, controller-bound runtime for managed durable Task Flows. */
export class BoundTaskFlowControllerRuntime implements TaskFlowControllerRuntime {
  readonly #state: OpenRillStateDatabase;
  readonly #conversations: ConversationService;
  readonly #tasks: TaskService;
  readonly #taskFlows: TaskFlowService;
  readonly #scheduleRun: (runId: string) => boolean;
  readonly #cancelTask: ((task: BackgroundTask) => BackgroundTask) | undefined;
  readonly #now: () => number;
  public readonly workspaceId: string;
  public readonly ownerKey: string;
  public readonly controllerId: string;

  public constructor(options: BoundTaskFlowControllerRuntimeOptions) {
    this.#state = options.state;
    this.#conversations = options.conversations;
    this.#tasks = options.tasks;
    this.#taskFlows = options.taskFlows;
    this.#scheduleRun = options.scheduleRun;
    this.#cancelTask = options.cancelTask;
    this.#now = options.now ?? Date.now;
    this.workspaceId = bounded(options.workspaceId, "workspaceId", 64);
    this.ownerKey = bounded(options.ownerKey, "ownerKey", 256);
    this.controllerId = bounded(options.controllerId, "controllerId", 128);
    const owner = this.#conversations.get({ workspaceId: this.workspaceId, conversationId: this.ownerKey });
    if (owner.workspaceId !== this.workspaceId) {
      throw new TaskFlowError("TASK_FLOW_ACCESS_DENIED", "task flow owner belongs to a different workspace");
    }
  }

  #assertControlled(flow: TaskFlow): TaskFlow {
    if (flow.controllerId !== this.controllerId) {
      throw new TaskFlowError("TASK_FLOW_ACCESS_DENIED", "task flow belongs to a different controller");
    }
    return flow;
  }

  public createManaged(input: {
    requestKey: string;
    goal: string;
    currentStep?: string | null;
    state?: unknown;
    status?: Extract<TaskFlowStatus, "QUEUED" | "RUNNING">;
  }, hook?: ManagedTaskFlowCreateHook): ManagedTaskFlowCreateResult {
    const requestKey = bounded(input.requestKey, "requestKey", 128);
    const goal = bounded(input.goal, "goal", 65_536);
    const currentStep = optionalBounded(input.currentStep, "currentStep", 256);
    const state = input.state === undefined ? null : input.state;
    const stateText = canonical(state);
    if (stateText.length > 262_144) throw new TaskFlowError("TASK_FLOW_INVALID_ARGUMENT", "state must be bounded JSON");
    const status = input.status ?? "QUEUED";
    const flowId = deterministicFlowId({
      workspaceId: this.workspaceId,
      ownerKey: this.ownerKey,
      controllerId: this.controllerId,
      requestKey,
    });
    const fingerprint = digest({ goal, currentStep, state, status });
    const now = this.#now();
    const result = this.#state.transaction((repositories) => {
      const owner = repositories.conversations.getConversation(this.ownerKey);
      if (!owner) throw new TaskFlowError("TASK_FLOW_NOT_FOUND", "task flow owner conversation not found");
      if (owner.workspaceId !== this.workspaceId) throw new TaskFlowError("TASK_FLOW_ACCESS_DENIED", "task flow owner belongs to a different workspace");
      const existing = repositories.taskFlows.get(flowId);
      if (existing) {
        const created = repositories.taskFlows.listEvents(flowId, 200).find((event) => event.eventType === "taskFlow.created");
        const payload = created?.payload && typeof created.payload === "object" && !Array.isArray(created.payload)
          ? created.payload as Record<string, unknown>
          : null;
        if (existing.workspaceId !== this.workspaceId || existing.ownerKey !== this.ownerKey || existing.controllerId !== this.controllerId || payload?.inputHash !== fingerprint) {
          throw new TaskFlowError("TASK_FLOW_REQUEST_CONFLICT", "task flow request key replayed with different input");
        }
        hook?.({ repositories, flow: existing, replayed: true, now });
        return { row: existing, replayed: true };
      }
      const row: LedgerTaskFlowRow = {
        flowId,
        workspaceId: this.workspaceId,
        ownerKey: this.ownerKey,
        controllerId: this.controllerId,
        goal,
        status,
        currentStep,
        blockedTaskId: null,
        blockedSummary: null,
        state,
        wait: null,
        cancelRequestedAt: null,
        createdAt: now,
        updatedAt: now,
        endedAt: null,
        cleanupAfter: null,
        revision: 1,
      };
      repositories.taskFlows.insert(row);
      repositories.taskFlows.appendEvent({
        flowId,
        sequence: 1,
        eventType: "taskFlow.created",
        status,
        revision: 1,
        payload: { controllerId: this.controllerId, requestHash: digest(requestKey), inputHash: fingerprint, currentStep },
        emittedAt: now,
      });
      hook?.({ repositories, flow: row, replayed: false, now });
      return { row, replayed: false };
    });
    return { flow: toFlow(result.row), replayed: result.replayed };
  }

  public get(flowId: string): TaskFlowView {
    const normalizedFlowId = bounded(flowId, "flowId", 256);
    const view = this.#taskFlows.get({ workspaceId: this.workspaceId, ownerKey: this.ownerKey, flowId: normalizedFlowId });
    return { ...view, flow: this.#assertControlled(view.flow) };
  }

  public list(input: { status?: TaskFlowStatus; limit?: number } = {}): readonly TaskFlow[] {
    return this.#taskFlows.list({
      workspaceId: this.workspaceId,
      ownerKey: this.ownerKey,
      controllerId: this.controllerId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.limit ? { limit: input.limit } : {}),
    });
  }

  public runTask(input: {
    flowId: string;
    expectedRevision: number;
    requestKey: string;
    stepKey: string;
    text: string;
    state?: unknown;
  }, hook?: TaskFlowChildAdmissionHook): TaskFlowChildAdmissionResult {
    const flowId = bounded(input.flowId, "flowId", 256);
    const requestKey = bounded(input.requestKey, "requestKey", 128);
    const stepKey = bounded(input.stepKey, "stepKey", 256);
    const text = bounded(input.text, "text", 65_536);
    const nextState = input.state === undefined ? undefined : input.state;
    if (nextState !== undefined && canonical(nextState).length > 262_144) throw new TaskFlowError("TASK_FLOW_INVALID_ARGUMENT", "state must be bounded JSON");
    const submissionKey = deterministicSubmissionKey(flowId, requestKey);
    const now = this.#now();
    const admitted = this.#state.transaction((repositories) => {
      const flow = repositories.taskFlows.get(flowId);
      if (!flow) throw new TaskFlowError("TASK_FLOW_NOT_FOUND", "task flow not found");
      if (flow.workspaceId !== this.workspaceId || flow.ownerKey !== this.ownerKey) throw new TaskFlowError("TASK_FLOW_ACCESS_DENIED", "task flow belongs to a different owner");
      if (flow.controllerId !== this.controllerId) throw new TaskFlowError("TASK_FLOW_ACCESS_DENIED", "task flow belongs to a different controller");

      const existingSubmission = repositories.conversations.getSubmission(this.ownerKey, submissionKey);
      if (existingSubmission) {
        const sent = this.#conversations.sendInTransaction(repositories, {
          workspaceId: this.workspaceId,
          conversationId: this.ownerKey,
          submissionKey,
          text,
        });
        const existingTask = repositories.tasks.getByRun(sent.run.runId);
        const existingLink = existingTask ? repositories.taskFlows.getTaskLink(existingTask.taskId) : null;
        if (!existingTask || !existingLink || existingLink.flowId !== flowId || existingLink.stepKey !== stepKey) {
          throw new TaskFlowError("TASK_FLOW_REQUEST_CONFLICT", "task flow child request replay conflicts with durable linkage");
        }
        hook?.({ repositories, flow, task: existingTask, run: sent.run, message: sent.message, replayed: true, now });
        return { taskId: existingTask.taskId, run: sent.run, message: sent.message, replayed: true };
      }

      if (flow.revision !== input.expectedRevision) {
        throw new TaskFlowError("TASK_FLOW_REVISION_CONFLICT", `expected revision ${input.expectedRevision}, current ${flow.revision}`);
      }
      if (TERMINAL.has(flow.status)) throw new TaskFlowError("TASK_FLOW_STATE_INVALID", "terminal task flow cannot admit child tasks");
      if (flow.cancelRequestedAt !== null) throw new TaskFlowError("TASK_FLOW_STATE_INVALID", "task flow cancellation has already been requested");
      if (!ACTIVE_ADMISSION.has(flow.status)) throw new TaskFlowError("TASK_FLOW_STATE_INVALID", `task flow must resume before child admission: ${flow.status}`);

      const sent = this.#conversations.sendInTransaction(repositories, {
        workspaceId: this.workspaceId,
        conversationId: this.ownerKey,
        submissionKey,
        text,
      });
      const task = repositories.tasks.classifyRun({
        runId: sent.run.runId,
        runtime: "CONVERSATION",
        taskKind: "task_flow.child",
        sourceId: flowId,
        notifyPolicy: "DONE_ONLY",
        updatedAt: now,
      });
      const linked = repositories.taskFlows.linkTask({ flowId, taskId: task.taskId, stepKey, linkedAt: now });
      if (linked !== "LINKED") throw new TaskFlowError("TASK_FLOW_TASK_CONFLICT", "newly admitted task could not be linked to its task flow");
      const updated = repositories.taskFlows.update({
        flowId,
        expectedRevision: flow.revision,
        status: "RUNNING",
        currentStep: stepKey,
        blockedTaskId: null,
        blockedSummary: null,
        state: nextState === undefined ? flow.state : nextState,
        wait: null,
        cancelRequestedAt: null,
        updatedAt: now,
        endedAt: null,
      });
      if (!updated) throw new TaskFlowError("TASK_FLOW_REVISION_CONFLICT", "task flow changed during child admission");
      repositories.taskFlows.appendEvent({
        flowId,
        sequence: repositories.taskFlows.nextEventSequence(flowId),
        eventType: "taskFlow.task.admitted",
        status: updated.status,
        revision: updated.revision,
        payload: { taskId: task.taskId, runId: sent.run.runId, stepKey, requestHash: digest(requestKey) },
        emittedAt: now,
      });
      hook?.({ repositories, flow: updated, task, run: sent.run, message: sent.message, replayed: false, now });
      return { taskId: task.taskId, run: sent.run, message: sent.message, replayed: false };
    });

    const schedulable = admitted.run.status === "CREATED" || admitted.run.status === "RUNNING";
    const scheduled = schedulable ? this.#scheduleRun(admitted.run.runId) : false;
    const task = this.#tasks.get({ workspaceId: this.workspaceId, taskId: admitted.taskId }).task;
    return {
      flow: this.get(flowId),
      task,
      run: admitted.run,
      message: admitted.message,
      replayed: admitted.replayed,
      scheduled,
    };
  }

  public setWaiting(input: { flowId: string; expectedRevision: number; currentStep?: string | null; state?: unknown; wait?: unknown }, hook?: TaskFlowMutationHook): TaskFlow {
    this.#assertControlled(this.#taskFlows.get({ workspaceId: this.workspaceId, ownerKey: this.ownerKey, flowId: input.flowId }).flow);
    return this.#taskFlows.setWaiting({ workspaceId: this.workspaceId, ownerKey: this.ownerKey, ...input }, hook);
  }

  public setBlocked(input: { flowId: string; expectedRevision: number; currentStep?: string | null; state?: unknown; blockedTaskId: string; blockedSummary?: string | null }, hook?: TaskFlowMutationHook): TaskFlow {
    this.#assertControlled(this.#taskFlows.get({ workspaceId: this.workspaceId, ownerKey: this.ownerKey, flowId: input.flowId }).flow);
    return this.#taskFlows.setBlocked({ workspaceId: this.workspaceId, ownerKey: this.ownerKey, ...input }, hook);
  }

  public resume(input: { flowId: string; expectedRevision: number; status?: Extract<TaskFlowStatus, "QUEUED" | "RUNNING">; currentStep?: string | null; state?: unknown }, hook?: TaskFlowMutationHook): TaskFlow {
    this.#assertControlled(this.#taskFlows.get({ workspaceId: this.workspaceId, ownerKey: this.ownerKey, flowId: input.flowId }).flow);
    return this.#taskFlows.resume({ workspaceId: this.workspaceId, ownerKey: this.ownerKey, ...input }, hook);
  }

  public finish(input: { flowId: string; expectedRevision: number; state?: unknown }, hook?: TaskFlowMutationHook): TaskFlow {
    this.#assertControlled(this.#taskFlows.get({ workspaceId: this.workspaceId, ownerKey: this.ownerKey, flowId: input.flowId }).flow);
    return this.#taskFlows.finish({ workspaceId: this.workspaceId, ownerKey: this.ownerKey, ...input }, hook);
  }

  public fail(input: { flowId: string; expectedRevision: number; state?: unknown; blockedSummary?: string | null }, hook?: TaskFlowMutationHook): TaskFlow {
    this.#assertControlled(this.#taskFlows.get({ workspaceId: this.workspaceId, ownerKey: this.ownerKey, flowId: input.flowId }).flow);
    return this.#taskFlows.fail({ workspaceId: this.workspaceId, ownerKey: this.ownerKey, ...input }, hook);
  }

  public requestCancel(input: { flowId: string; expectedRevision: number }): TaskFlow {
    this.#assertControlled(this.#taskFlows.get({ workspaceId: this.workspaceId, ownerKey: this.ownerKey, flowId: input.flowId }).flow);
    return this.#taskFlows.requestCancel({ workspaceId: this.workspaceId, ownerKey: this.ownerKey, ...input });
  }

  public cancel(input: { flowId: string; expectedRevision: number }): { flow: TaskFlowView; affectedTasks: number; replayed: boolean } {
    if (!this.#cancelTask) throw new TaskFlowError("TASK_FLOW_EXECUTOR_UNAVAILABLE", "task flow cancellation runtime is unavailable");
    this.#assertControlled(this.#taskFlows.get({ workspaceId: this.workspaceId, ownerKey: this.ownerKey, flowId: input.flowId }).flow);
    return this.#taskFlows.cancel({ workspaceId: this.workspaceId, ownerKey: this.ownerKey, ...input }, this.#cancelTask);
  }
}

export interface TaskFlowControllerRuntimeFactoryOptions {
  readonly state: OpenRillStateDatabase;
  readonly conversations: ConversationService;
  readonly tasks: TaskService;
  readonly taskFlows: TaskFlowService;
  readonly scheduleRun: (runId: string) => boolean;
  readonly cancelTask?: (task: BackgroundTask) => BackgroundTask;
  readonly now?: () => number;
}

export class TaskFlowControllerRuntimeFactory {
  public constructor(private readonly options: TaskFlowControllerRuntimeFactoryOptions) {}

  public bind(input: { workspaceId: string; ownerKey: string; controllerId: string }): BoundTaskFlowControllerRuntime {
    return new BoundTaskFlowControllerRuntime({
      ...this.options,
      workspaceId: input.workspaceId,
      ownerKey: input.ownerKey,
      controllerId: input.controllerId,
    });
  }
}
