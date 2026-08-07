import { createHash } from "node:crypto";
import type { ConversationService } from "@openrill/conversations";
import type { LedgerTaskCompletionDeliveryRow, OpenRillStateDatabase } from "@openrill/state";
import type { TaskFlowControllerRuntimeFactory } from "./controller-runtime.js";

const RUN_TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const FLOW_TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "LOST"]);
const CONTROLLER_DECISION_TOOLS = new Set([
  "task_flow.run", "task_flow.wait", "task_flow.block", "task_flow.finish", "task_flow.fail", "task_flow.cancel",
]);

function successfulControllerDecision(events: readonly { eventType: string; payload: unknown }[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.eventType !== "tool.completed" || !event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) continue;
    const payload = event.payload as Record<string, unknown>;
    const name = typeof payload.name === "string" ? payload.name : null;
    if (name && CONTROLLER_DECISION_TOOLS.has(name) && payload.isError === false) return name;
  }
  return null;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.length <= 2_000 ? text : `${text.slice(0, 1_997)}...`;
}

function systemText(delivery: LedgerTaskCompletionDeliveryRow): string {
  const payload = delivery.payload && typeof delivery.payload === "object" && !Array.isArray(delivery.payload)
    ? delivery.payload as Record<string, unknown>
    : {};
  const output = typeof payload.output === "string" ? payload.output : "";
  const summary = typeof payload.terminalSummary === "string" ? payload.terminalSummary : null;
  const errorCode = typeof payload.errorCode === "string" ? payload.errorCode : null;
  const lines = [
    "[OpenRill Task Flow completion delivery]",
    `flowId=${delivery.flowId ?? "none"}`,
    `taskId=${delivery.taskId}`,
    `taskStatus=${delivery.taskStatus}`,
    `terminalOutcome=${delivery.terminalOutcome ?? "none"}`,
    summary ? `summary=${summary}` : null,
    errorCode ? `errorCode=${errorCode}` : null,
    output ? "output:" : null,
    output || null,
    "Review this durable child result. Use only the bound task_flow controller tools to run the next child, wait, finish, fail, or cancel the Flow.",
  ].filter((line): line is string => line !== null);
  const text = lines.join("\n");
  return text.length <= 65_536 ? text : `${text.slice(0, 65_533)}...`;
}

export interface TaskCompletionDeliveryBinding {
  readonly delivery: LedgerTaskCompletionDeliveryRow;
  readonly flowId: string;
  readonly workspaceId: string;
  readonly ownerKey: string;
  readonly controllerId: string;
  readonly expectedExecutionRevision: number | null;
  readonly expectedStepRevision: number | null;
  readonly expectedFlowRevision: number | null;
  readonly deliveryId: string;
}

export interface TaskCompletionDeliveryDispatchResult {
  readonly delivery: LedgerTaskCompletionDeliveryRow;
  readonly replayed: boolean;
  readonly scheduled: boolean;
}

export interface TaskCompletionDeliveryDrainResult {
  readonly scanned: number;
  readonly queued: number;
  readonly delivered: number;
  readonly failed: number;
}

export interface TaskCompletionDeliveryServiceOptions {
  readonly state: OpenRillStateDatabase;
  readonly conversations: ConversationService;
  readonly runtimes: TaskFlowControllerRuntimeFactory;
  readonly scheduleRun: (runId: string) => boolean;
  readonly now?: () => number;
}

/** Durable terminal Task handoff into one Conversation-bound controller wake Run. */
export class TaskCompletionDeliveryService {
  readonly #state: OpenRillStateDatabase;
  readonly #conversations: ConversationService;
  readonly #runtimes: TaskFlowControllerRuntimeFactory;
  readonly #scheduleRun: (runId: string) => boolean;
  readonly #now: () => number;

  public constructor(options: TaskCompletionDeliveryServiceOptions) {
    this.#state = options.state;
    this.#conversations = options.conversations;
    this.#runtimes = options.runtimes;
    this.#scheduleRun = options.scheduleRun;
    this.#now = options.now ?? Date.now;
  }

  public bindingForWakeRun(wakeRunId: string): TaskCompletionDeliveryBinding | null {
    return this.#state.transaction((repositories) => {
      const delivery = repositories.taskDeliveries.getByWakeRun(wakeRunId);
      if (!delivery || !delivery.flowId || !delivery.controllerId) return null;
      const flow = repositories.taskFlows.get(delivery.flowId);
      if (!flow) return null;
      if (flow.workspaceId !== delivery.workspaceId || flow.ownerKey !== delivery.ownerConversationId || flow.controllerId !== delivery.controllerId) {
        return null;
      }
      return {
        delivery,
        flowId: flow.flowId,
        workspaceId: flow.workspaceId,
        ownerKey: flow.ownerKey,
        controllerId: flow.controllerId,
        expectedExecutionRevision: delivery.controllerExecutionRevision,
        expectedStepRevision: delivery.controllerStepRevision,
        expectedFlowRevision: delivery.controllerFlowRevision,
        deliveryId: delivery.deliveryId,
      };
    });
  }

  public runtimeForWakeRun(wakeRunId: string) {
    const binding = this.bindingForWakeRun(wakeRunId);
    if (!binding) return null;
    return this.#runtimes.bind({
      workspaceId: binding.workspaceId,
      ownerKey: binding.ownerKey,
      controllerId: binding.controllerId,
    });
  }

  public dispatch(deliveryId: string): TaskCompletionDeliveryDispatchResult {
    const current = this.#state.transaction((repositories) => repositories.taskDeliveries.get(deliveryId));
    if (!current) throw new Error(`task completion delivery not found: ${deliveryId}`);
    if (current.deliveryStatus === "DELIVERED" || current.deliveryStatus === "NOT_APPLICABLE") {
      return { delivery: current, replayed: true, scheduled: false };
    }

    if (current.deliveryStatus === "SESSION_QUEUED" && current.wakeRunId) {
      const wake = this.#state.transaction((repositories) => repositories.conversations.getRun(current.wakeRunId!));
      if (wake && RUN_TERMINAL.has(wake.status)) {
        const delivered = this.completeWakeRun(current.wakeRunId);
        return { delivery: delivered ?? current, replayed: true, scheduled: false };
      }
      const scheduled = wake && (wake.status === "CREATED" || wake.status === "RUNNING")
        ? this.#scheduleRun(wake.runId)
        : false;
      return { delivery: current, replayed: true, scheduled };
    }

    const now = this.#now();
    try {
      const queued = this.#state.transaction((repositories) => {
        const fresh = repositories.taskDeliveries.get(deliveryId);
        if (!fresh) throw new Error(`task completion delivery not found: ${deliveryId}`);
        if (fresh.deliveryStatus === "DELIVERED" || fresh.deliveryStatus === "NOT_APPLICABLE") {
          return { delivery: fresh, replayed: true, wakeStatus: null as string | null };
        }
        if (fresh.deliveryStatus === "SESSION_QUEUED" && fresh.wakeRunId) {
          const wake = repositories.conversations.getRun(fresh.wakeRunId);
          return { delivery: fresh, replayed: true, wakeStatus: wake?.status ?? null };
        }
        if (!fresh.flowId || !fresh.controllerId) throw new Error("task completion delivery has no managed Flow binding");
        const flow = repositories.taskFlows.get(fresh.flowId);
        if (!flow) throw new Error("task completion delivery Flow is missing");
        if (flow.workspaceId !== fresh.workspaceId || flow.ownerKey !== fresh.ownerConversationId || flow.controllerId !== fresh.controllerId) {
          throw new Error("task completion delivery owner binding changed");
        }
        if (FLOW_TERMINAL.has(flow.status) || flow.cancelRequestedAt !== null) {
          const suppressed = repositories.taskDeliveries.update({
            deliveryId: fresh.deliveryId,
            expectedRevision: fresh.revision,
            deliveryStatus: "NOT_APPLICABLE",
            attemptCount: fresh.attemptCount,
            lastError: null,
            systemMessageId: fresh.systemMessageId,
            wakeRunId: fresh.wakeRunId,
            updatedAt: now,
            deliveredAt: null,
          });
          if (!suppressed) throw new Error("task completion delivery changed while suppressing terminal Flow wake");
          repositories.tasks.updateDeliveryState({ taskId: fresh.taskId, deliveryStatus: "NOT_APPLICABLE", updatedAt: now });
          return { delivery: suppressed, replayed: false, wakeStatus: null as string | null };
        }
        const goalExecution = repositories.goals.getExecutionByFlow(flow.flowId);
        const goalStep = goalExecution?.currentStepId
          ? repositories.goals.getStepExecution(goalExecution.goalId, goalExecution.currentStepId, goalExecution.planRevision)
          : null;
        const bound = repositories.taskDeliveries.bindControllerSnapshot({
          deliveryId: fresh.deliveryId,
          expectedRevision: fresh.revision,
          controllerExecutionRevision: goalExecution?.revision ?? null,
          controllerStepRevision: goalStep?.revision ?? null,
          controllerFlowRevision: flow.revision,
          updatedAt: now,
        });
        if (!bound) throw new Error("task completion delivery changed during controller snapshot binding");
        const submissionKey = `delivery-wake:${digest(`${bound.idempotencyKey}:${bound.attemptCount + 1}`).slice(0, 48)}`;
        const sent = this.#conversations.sendSystemInTransaction(repositories, {
          workspaceId: bound.workspaceId,
          conversationId: bound.ownerConversationId,
          submissionKey,
          text: systemText(bound),
        });
        const wakeTask = repositories.tasks.classifyRun({
          runId: sent.run.runId,
          runtime: "CONVERSATION",
          taskKind: "task_flow.controller_wake",
          sourceId: bound.flowId,
          notifyPolicy: "SILENT",
          updatedAt: now,
        });
        const updated = repositories.taskDeliveries.update({
          deliveryId: bound.deliveryId,
          expectedRevision: bound.revision,
          deliveryStatus: "SESSION_QUEUED",
          attemptCount: bound.attemptCount + 1,
          lastError: null,
          systemMessageId: sent.message.messageId,
          wakeRunId: sent.run.runId,
          updatedAt: now,
          deliveredAt: null,
        });
        if (!updated) throw new Error("task completion delivery changed during queue admission");
        repositories.tasks.updateDeliveryState({ taskId: bound.taskId, deliveryStatus: "SESSION_QUEUED", updatedAt: now });
        const sourceTask = repositories.tasks.get(bound.taskId);
        if (sourceTask) {
          repositories.tasks.appendEvent({
            taskId: sourceTask.taskId,
            sequence: repositories.tasks.nextEventSequence(sourceTask.taskId),
            eventType: "task.delivery.session_queued",
            status: sourceTask.status,
            recoveryState: sourceTask.recoveryState,
            payload: { deliveryId: bound.deliveryId, wakeRunId: sent.run.runId, systemMessageId: sent.message.messageId },
            runEventSequence: null,
            emittedAt: now,
          });
        }
        repositories.taskFlows.appendEvent({
          flowId: flow.flowId,
          sequence: repositories.taskFlows.nextEventSequence(flow.flowId),
          eventType: "taskFlow.controller.wake.queued",
          status: flow.status,
          revision: flow.revision,
          payload: { deliveryId: bound.deliveryId, taskId: bound.taskId, wakeRunId: sent.run.runId, wakeTaskId: wakeTask.taskId },
          emittedAt: now,
        });
        return { delivery: updated, replayed: sent.replayed, wakeStatus: sent.run.status };
      });
      const scheduled = queued.delivery.wakeRunId && (queued.wakeStatus === "CREATED" || queued.wakeStatus === "RUNNING")
        ? this.#scheduleRun(queued.delivery.wakeRunId)
        : false;
      return { delivery: queued.delivery, replayed: queued.replayed, scheduled };
    } catch (error) {
      const failed = this.#state.transaction((repositories) => {
        const fresh = repositories.taskDeliveries.get(deliveryId);
        if (!fresh || fresh.deliveryStatus === "DELIVERED") return fresh;
        const updated = repositories.taskDeliveries.update({
          deliveryId: fresh.deliveryId,
          expectedRevision: fresh.revision,
          deliveryStatus: "FAILED",
          attemptCount: fresh.attemptCount + 1,
          lastError: errorMessage(error),
          systemMessageId: fresh.systemMessageId,
          wakeRunId: fresh.wakeRunId,
          updatedAt: now,
          deliveredAt: null,
        });
        if (updated) repositories.tasks.updateDeliveryState({ taskId: fresh.taskId, deliveryStatus: "FAILED", updatedAt: now });
        return updated;
      });
      if (!failed) throw error;
      return { delivery: failed, replayed: false, scheduled: false };
    }
  }

  public deliverRun(runId: string): readonly TaskCompletionDeliveryDispatchResult[] {
    const deliveryIds = this.#state.transaction((repositories) => {
      const task = repositories.tasks.getByRun(runId);
      if (!task) return [] as string[];
      return repositories.taskDeliveries.listForTask(task.taskId, 100)
        .filter((delivery) => delivery.deliveryStatus !== "DELIVERED" && delivery.deliveryStatus !== "NOT_APPLICABLE")
        .map((delivery) => delivery.deliveryId);
    });
    return deliveryIds.map((deliveryId) => this.dispatch(deliveryId));
  }

  public completeWakeRun(wakeRunId: string): LedgerTaskCompletionDeliveryRow | null {
    const now = this.#now();
    return this.#state.transaction((repositories) => {
      const delivery = repositories.taskDeliveries.getByWakeRun(wakeRunId);
      if (!delivery) return null;
      if (delivery.deliveryStatus === "DELIVERED") return delivery;
      const wake = repositories.conversations.getRun(wakeRunId);
      if (!wake || !RUN_TERMINAL.has(wake.status)) return delivery;

      const decisionTool = successfulControllerDecision(repositories.conversations.listEvents(wakeRunId));
      const delivered = decisionTool !== null;
      const lastError = delivered
        ? null
        : wake.status === "COMPLETED"
          ? "CONTROLLER_DECISION_REQUIRED: wake Run completed without a successful bound Task Flow decision"
          : `CONTROLLER_WAKE_${wake.status}: wake Run ended before a successful bound Task Flow decision`;
      const nextStatus = delivered ? "DELIVERED" : "FAILED";
      const updated = repositories.taskDeliveries.update({
        deliveryId: delivery.deliveryId,
        expectedRevision: delivery.revision,
        deliveryStatus: nextStatus,
        attemptCount: delivery.attemptCount,
        lastError,
        systemMessageId: delivery.systemMessageId,
        wakeRunId,
        updatedAt: now,
        deliveredAt: delivered ? now : null,
      });
      if (!updated) return repositories.taskDeliveries.get(delivery.deliveryId);
      repositories.tasks.updateDeliveryState({ taskId: delivery.taskId, deliveryStatus: nextStatus, updatedAt: now });
      const sourceTask = repositories.tasks.get(delivery.taskId);
      if (sourceTask) {
        repositories.tasks.appendEvent({
          taskId: sourceTask.taskId,
          sequence: repositories.tasks.nextEventSequence(sourceTask.taskId),
          eventType: delivered ? "task.delivery.delivered" : "task.delivery.failed",
          status: sourceTask.status,
          recoveryState: sourceTask.recoveryState,
          payload: { deliveryId: delivery.deliveryId, wakeRunId, wakeStatus: wake.status, decisionTool, lastError },
          runEventSequence: null,
          emittedAt: now,
        });
      }
      if (delivery.flowId) {
        const flow = repositories.taskFlows.get(delivery.flowId);
        if (flow) repositories.taskFlows.appendEvent({
          flowId: flow.flowId,
          sequence: repositories.taskFlows.nextEventSequence(flow.flowId),
          eventType: delivered ? "taskFlow.controller.wake.delivered" : "taskFlow.controller.wake.failed",
          status: flow.status,
          revision: flow.revision,
          payload: { deliveryId: delivery.deliveryId, taskId: delivery.taskId, wakeRunId, wakeStatus: wake.status, decisionTool, lastError },
          emittedAt: now,
        });
      }
      return updated;
    });
  }

  public drain(limit = 200): TaskCompletionDeliveryDrainResult {
    const actionable = this.#state.transaction((repositories) => repositories.taskDeliveries.listActionable(limit));
    let queued = 0;
    let delivered = 0;
    let failed = 0;
    for (const delivery of actionable) {
      const result = this.dispatch(delivery.deliveryId);
      if (result.delivery.deliveryStatus === "SESSION_QUEUED") queued += 1;
      else if (result.delivery.deliveryStatus === "DELIVERED") delivered += 1;
      else if (result.delivery.deliveryStatus === "FAILED") failed += 1;
    }
    return { scanned: actionable.length, queued, delivered, failed };
  }
}
