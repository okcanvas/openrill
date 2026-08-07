import { createHash, randomUUID } from "node:crypto";
import type {
  LedgerGoalExecutionRow,
  LedgerGoalRow,
  LedgerGoalStepBlockerRow,
  LedgerGoalStepExecutionRow,
  LedgerPlanRevisionStepRow,
  LedgerPlanStepRow,
  LedgerTaskRow,
  OpenRillStateDatabase,
  StateRepositories,
} from "@openrill/state";
import type { TaskService } from "@openrill/tasks";
import {
  type BoundTaskFlowControllerRuntime,
  type TaskFlowControllerRuntime,
  type TaskFlowControllerRuntimeFactory,
  type TaskFlowChildAdmissionResult,
  type TaskFlowMutationContext,
  type TaskFlowView,
  TaskFlowService,
} from "@openrill/task-flows";
import { GoalExecutorError } from "./errors.js";
import type {
  GoalBlockerResolutionResult,
  GoalExecutionAdvanceResult,
  GoalExecutionRecord,
  GoalExecutionRecoveryResult,
  GoalExecutionStartResult,
  GoalExecutionView,
  GoalPlanAdoptionResult,
  GoalPlanRevisionDraftStep,
  GoalPlanRevisionResult,
  GoalStepBlockerRecord,
  GoalStepRetryResult,
  GoalStepExecutionRecord,
} from "./types.js";

const TASK_TERMINAL = new Set(["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED", "LOST"]);
const EXECUTION_TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);
const CONTROLLER_PREFIX = "goal-plan-executor:";

function bounded(value: string, label: string, max: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new GoalExecutorError("GOAL_EXECUTION_PLAN_INVALID", `invalid ${label}`);
  return normalized;
}

function controllerIdFor(goalId: string): string {
  return `${CONTROLLER_PREFIX}${goalId}`;
}

function toExecution(row: LedgerGoalExecutionRow): GoalExecutionRecord { return { ...row }; }

function toStepExecution(row: LedgerGoalStepExecutionRow, plan: LedgerPlanRevisionStepRow, currentPlan: LedgerPlanStepRow | null): GoalStepExecutionRecord {
  return {
    ...row,
    title: plan.title,
    planStatus: currentPlan?.status ?? (row.status === "SUCCEEDED" ? "COMPLETED" : row.status === "BLOCKED" || row.status === "FAILED" ? "BLOCKED" : "PENDING"),
  };
}

function toBlocker(row: LedgerGoalStepBlockerRow): GoalStepBlockerRecord { return { ...row }; }

function stepMutation(row: LedgerGoalStepExecutionRow, changes: Partial<Omit<LedgerGoalStepExecutionRow, "goalId" | "stepId" | "planRevision" | "ordinal" | "revision">>) {
  return {
    goalId: row.goalId,
    stepId: row.stepId,
    planRevision: row.planRevision,
    expectedRevision: row.revision,
    status: changes.status ?? row.status,
    currentTaskId: changes.currentTaskId === undefined ? row.currentTaskId : changes.currentTaskId,
    attemptCount: changes.attemptCount ?? row.attemptCount,
    lastTerminalOutcome: changes.lastTerminalOutcome === undefined ? row.lastTerminalOutcome : changes.lastTerminalOutcome,
    lastSummary: changes.lastSummary === undefined ? row.lastSummary : changes.lastSummary,
    startedAt: changes.startedAt === undefined ? row.startedAt : changes.startedAt,
    completedAt: changes.completedAt === undefined ? row.completedAt : changes.completedAt,
    retryMode: changes.retryMode ?? row.retryMode,
    maxAttempts: changes.maxAttempts ?? row.maxAttempts,
    nextRetryAt: changes.nextRetryAt === undefined ? row.nextRetryAt : changes.nextRetryAt,
    lastRetryReason: changes.lastRetryReason === undefined ? row.lastRetryReason : changes.lastRetryReason,
    updatedAt: changes.updatedAt ?? row.updatedAt,
  };
}

function appendEvent(repositories: StateRepositories, input: {
  goalId: string;
  eventType: string;
  payload: unknown;
  sourceRunId?: string | null;
  sourceAttemptId?: string | null;
  emittedAt: number;
}): void {
  repositories.goals.appendEvent({
    goalId: input.goalId,
    sequence: repositories.goals.nextEventSequence(input.goalId),
    eventType: input.eventType,
    payload: input.payload,
    sourceRunId: input.sourceRunId ?? null,
    sourceAttemptId: input.sourceAttemptId ?? null,
    emittedAt: input.emittedAt,
  });
}

function taskText(goal: LedgerGoalRow, step: LedgerPlanRevisionStepRow, total: number): string {
  return [
    `Goal: ${goal.objective}`,
    `Plan step ${step.ordinal}/${total}: ${step.title}`,
    "Complete this single step and return a concrete final deliverable. Do not return only a progress promise.",
  ].join("\n");
}

function requestKey(goalId: string, planRevision: number, stepId: string, attempt: number): string {
  return `goal-step:${goalId}:${planRevision}:${stepId}:${attempt}`;
}

function normalizedDraft(steps: readonly GoalPlanRevisionDraftStep[]): GoalPlanRevisionDraftStep[] {
  if (steps.length < 1 || steps.length > 200) throw new GoalExecutorError("GOAL_EXECUTION_PLAN_INVALID", "revised Plan must contain between 1 and 200 Steps");
  const ids = new Set<string>();
  return [...steps].sort((left, right) => left.ordinal - right.ordinal).map((step, index) => {
    const stepId = bounded(step.stepId, "stepId", 256);
    const title = bounded(step.title, "step title", 1_000);
    if (ids.has(stepId)) throw new GoalExecutorError("GOAL_EXECUTION_PLAN_INVALID", `duplicate stepId: ${stepId}`);
    ids.add(stepId);
    if (step.ordinal !== index + 1) throw new GoalExecutorError("GOAL_EXECUTION_PLAN_INVALID", "Plan ordinals must be contiguous from 1");
    if (step.retryMode !== "MANUAL") throw new GoalExecutorError("GOAL_EXECUTION_PLAN_INVALID", "only MANUAL retry mode is supported");
    if (!Number.isInteger(step.maxAttempts) || step.maxAttempts < 1 || step.maxAttempts > 20) {
      throw new GoalExecutorError("GOAL_EXECUTION_PLAN_INVALID", "maxAttempts must be an integer between 1 and 20");
    }
    return { stepId, ordinal: step.ordinal, title, required: Boolean(step.required), retryMode: "MANUAL", maxAttempts: step.maxAttempts };
  });
}

function sameRevisionDraft(left: readonly LedgerPlanRevisionStepRow[], right: readonly GoalPlanRevisionDraftStep[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((step, index) => {
    const candidate = right[index];
    return candidate !== undefined && step.stepId === candidate.stepId && step.ordinal === candidate.ordinal
      && step.title === candidate.title && step.required === candidate.required
      && step.retryMode === candidate.retryMode && step.maxAttempts === candidate.maxAttempts;
  });
}

function sameStableStepDefinition(
  left: Pick<LedgerPlanRevisionStepRow, "stepId" | "title" | "required" | "retryMode" | "maxAttempts">,
  right: Pick<LedgerPlanRevisionStepRow, "stepId" | "title" | "required" | "retryMode" | "maxAttempts">,
): boolean {
  return left.stepId === right.stepId
    && left.title === right.title
    && left.required === right.required
    && left.retryMode === right.retryMode
    && left.maxAttempts === right.maxAttempts;
}

function blockerFingerprint(input: { goalId: string; planRevision: number; stepId: string; blockerType: string; summary: string }): string {
  return createHash("sha256").update(JSON.stringify({
    goalId: input.goalId,
    planRevision: input.planRevision,
    stepId: input.stepId,
    blockerType: input.blockerType,
    summary: input.summary.trim().replace(/\s+/g, " ").toLowerCase(),
  })).digest("hex");
}

function projectedState(input: {
  goal: LedgerGoalRow;
  execution: LedgerGoalExecutionRow;
  planSteps: readonly LedgerPlanRevisionStepRow[];
  stepExecutions: readonly LedgerGoalStepExecutionRow[];
}): unknown {
  const byId = new Map(input.planSteps.map((step) => [step.stepId, step]));
  const next = input.stepExecutions.find((step) => step.status === "READY");
  const nextPlan = next ? byId.get(next.stepId) : undefined;
  const nextAttempt = next ? next.attemptCount + 1 : null;
  return {
    kind: "goal-plan-executor",
    mode: "SINGLE_ACTIVE_STEP",
    goalId: input.goal.goalId,
    planRevision: input.execution.planRevision,
    executionStatus: input.execution.status,
    currentStepId: input.execution.currentStepId,
    nextStep: next && nextPlan ? {
      stepId: next.stepId,
      ordinal: next.ordinal,
      title: nextPlan.title,
      requestKey: requestKey(input.goal.goalId, input.execution.planRevision, next.stepId, nextAttempt!),
      stepKey: next.stepId,
      text: taskText(input.goal, nextPlan, input.planSteps.length),
      attempt: nextAttempt,
    } : null,
    steps: input.stepExecutions.map((step) => ({
      stepId: step.stepId,
      ordinal: step.ordinal,
      status: step.status,
      currentTaskId: step.currentTaskId,
      attemptCount: step.attemptCount,
      terminalOutcome: step.lastTerminalOutcome,
      summary: step.lastSummary,
    })),
  };
}

function assertOwned(goal: LedgerGoalRow | null, input: { workspaceId: string; conversationId: string; goalId: string }): LedgerGoalRow {
  if (!goal) throw new GoalExecutorError("GOAL_EXECUTION_NOT_FOUND", "goal not found");
  if (goal.workspaceId !== input.workspaceId || goal.conversationId !== input.conversationId) {
    throw new GoalExecutorError("GOAL_EXECUTION_ACCESS_DENIED", "goal belongs to a different owner");
  }
  return goal;
}

interface ExecutorRows {
  readonly goal: LedgerGoalRow;
  readonly execution: LedgerGoalExecutionRow;
  readonly planSteps: LedgerPlanRevisionStepRow[];
  readonly stepExecutions: LedgerGoalStepExecutionRow[];
}

interface AdmissionOutcome {
  readonly advance: GoalExecutionAdvanceResult;
  readonly admission: TaskFlowChildAdmissionResult;
}

export interface GoalPlanExecutorServiceOptions {
  readonly state: OpenRillStateDatabase;
  readonly tasks: TaskService;
  readonly taskFlows: TaskFlowService;
  readonly runtimes: TaskFlowControllerRuntimeFactory;
  readonly now?: () => number;
  readonly createId?: () => string;
}

/** Durable ordered Plan executor with at most one active Step and one active child Task. */
export class GoalPlanExecutorService {
  readonly #state: OpenRillStateDatabase;
  readonly #tasks: TaskService;
  readonly #taskFlows: TaskFlowService;
  readonly #runtimes: TaskFlowControllerRuntimeFactory;
  readonly #now: () => number;
  readonly #createId: () => string;

  public constructor(options: GoalPlanExecutorServiceOptions) {
    this.#state = options.state;
    this.#tasks = options.tasks;
    this.#taskFlows = options.taskFlows;
    this.#runtimes = options.runtimes;
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? randomUUID;
  }

  #base(execution: LedgerGoalExecutionRow): BoundTaskFlowControllerRuntime {
    return this.#runtimes.bind({
      workspaceId: execution.workspaceId,
      ownerKey: execution.conversationId,
      controllerId: execution.controllerId,
    });
  }

  #rows(goalId: string): ExecutorRows {
    return this.#state.transaction((repositories) => {
      const goal = repositories.goals.get(goalId);
      const execution = repositories.goals.getExecution(goalId);
      if (!goal || !execution) throw new GoalExecutorError("GOAL_EXECUTION_NOT_FOUND", "goal execution not found");
      const planSteps = repositories.goals.listPlanRevisionSteps(goalId, execution.planRevision);
      const stepExecutions = repositories.goals.listStepExecutions(goalId, execution.planRevision);
      if (planSteps.length !== stepExecutions.length) throw new GoalExecutorError("GOAL_EXECUTION_PLAN_INVALID", "goal execution revision snapshot is incomplete");
      return { goal, execution, planSteps, stepExecutions };
    });
  }

  #recordBlocker(repositories: StateRepositories, input: {
    goal: LedgerGoalRow;
    execution: LedgerGoalExecutionRow;
    step: LedgerGoalStepExecutionRow;
    taskId: string | null;
    blockerType: LedgerGoalStepBlockerRow["blockerType"];
    summary: string;
    evidence: unknown;
    now: number;
  }): LedgerGoalStepBlockerRow {
    const fingerprint = blockerFingerprint({
      goalId: input.goal.goalId,
      planRevision: input.execution.planRevision,
      stepId: input.step.stepId,
      blockerType: input.blockerType,
      summary: input.summary,
    });
    const existing = repositories.goals.getBlockerByFingerprint(
      input.goal.goalId,
      input.step.stepId,
      input.execution.planRevision,
      fingerprint,
    );
    if (existing) {
      const updated = repositories.goals.incrementBlocker({
        blockerId: existing.blockerId,
        expectedRevision: existing.revision,
        taskId: input.taskId,
        summary: input.summary,
        evidence: input.evidence,
        updatedAt: input.now,
      });
      if (!updated) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal Step blocker changed during recurrence projection");
      return updated;
    }
    const created: LedgerGoalStepBlockerRow = {
      blockerId: `blocker:${this.#createId()}`,
      goalId: input.goal.goalId,
      stepId: input.step.stepId,
      planRevision: input.execution.planRevision,
      taskId: input.taskId,
      blockerType: input.blockerType,
      fingerprint,
      summary: input.summary,
      evidence: input.evidence,
      status: "OPEN",
      occurrenceCount: 1,
      createdAt: input.now,
      updatedAt: input.now,
      resolvedAt: null,
      resolvedBy: null,
      resolution: null,
      revision: 1,
    };
    repositories.goals.insertBlocker(created);
    return created;
  }

  #canProjectMutablePlanStep(
    repositories: StateRepositories,
    goal: LedgerGoalRow,
    execution: LedgerGoalExecutionRow,
    stepId: string,
  ): boolean {
    if (execution.planRevision === goal.planRevision) return true;
    const pinned = repositories.goals.getPlanRevisionStep(goal.goalId, execution.planRevision, stepId);
    const current = repositories.goals.getPlanRevisionStep(goal.goalId, goal.planRevision, stepId);
    return pinned !== null && current !== null && sameStableStepDefinition(pinned, current);
  }

  #assertNoActiveTask(rows: ExecutorRows): void {
    const active = rows.stepExecutions.filter((step) => step.currentTaskId !== null && (step.status === "RUNNING" || step.status === "WAITING"));
    if (active.length > 0) throw new GoalExecutorError("GOAL_EXECUTION_STATE_INVALID", "Goal execution has an active child Task");
  }

  #assertControllerSnapshot(rows: ExecutorRows, expected?: {
    executionRevision?: number | null;
    stepRevision?: number | null;
    flowRevision?: number | null;
  }): void {
    if (!expected) return;
    const currentStep = rows.execution.currentStepId
      ? rows.stepExecutions.find((step) => step.stepId === rows.execution.currentStepId) ?? null
      : null;
    const flow = this.#base(rows.execution).get(rows.execution.flowId).flow;
    const stale = (expected.executionRevision != null && expected.executionRevision !== rows.execution.revision)
      || (expected.stepRevision != null && expected.stepRevision !== (currentStep?.revision ?? null))
      || (expected.flowRevision != null && expected.flowRevision !== flow.revision);
    if (stale) throw new GoalExecutorError("GOAL_EXECUTION_STALE_DECISION", "controller decision was produced from an older Goal execution snapshot");
  }

  public get(input: { workspaceId: string; conversationId: string; goalId: string }): GoalExecutionView {
    const rows = this.#rows(bounded(input.goalId, "goalId", 256));
    assertOwned(rows.goal, input);
    if (rows.execution.workspaceId !== input.workspaceId || rows.execution.conversationId !== input.conversationId) {
      throw new GoalExecutorError("GOAL_EXECUTION_ACCESS_DENIED", "goal execution belongs to a different owner");
    }
    const byId = new Map(rows.planSteps.map((step) => [step.stepId, step]));
    const currentById = new Map(this.#state.transaction((repositories) => {
      if (rows.execution.planRevision === rows.goal.planRevision) {
        return repositories.goals.listSteps(rows.goal.goalId).map((step) => [step.stepId, step] as const);
      }
      const currentPlan = repositories.goals.listPlanRevisionSteps(rows.goal.goalId, rows.goal.planRevision);
      const currentDefinitions = new Map(currentPlan.map((step) => [step.stepId, step]));
      return repositories.goals.listSteps(rows.goal.goalId)
        .filter((step) => {
          const pinned = byId.get(step.stepId);
          const current = currentDefinitions.get(step.stepId);
          return pinned !== undefined && current !== undefined && sameStableStepDefinition(pinned, current);
        })
        .map((step) => [step.stepId, step] as const);
    }));
    const blockers = this.#state.transaction((repositories) => repositories.goals.listBlockers(rows.goal.goalId, rows.execution.planRevision, 200));
    return {
      goal: {
        goalId: rows.goal.goalId,
        objective: rows.goal.objective,
        status: rows.goal.status,
        revision: rows.goal.revision,
        planRevision: rows.goal.planRevision,
      },
      execution: toExecution(rows.execution),
      steps: rows.stepExecutions.map((step) => toStepExecution(step, byId.get(step.stepId)!, currentById.get(step.stepId) ?? null)),
      blockers: blockers.map(toBlocker),
      flow: this.#taskFlows.get({
        workspaceId: rows.execution.workspaceId,
        ownerKey: rows.execution.conversationId,
        flowId: rows.execution.flowId,
      }),
    };
  }

  public getByFlow(flowId: string): GoalExecutionView | null {
    const execution = this.#state.transaction((repositories) => repositories.goals.getExecutionByFlow(bounded(flowId, "flowId", 256)));
    if (!execution) return null;
    return this.get({ workspaceId: execution.workspaceId, conversationId: execution.conversationId, goalId: execution.goalId });
  }

  public start(input: {
    workspaceId: string;
    conversationId: string;
    goalId: string;
    expectedGoalRevision: number;
  }): GoalExecutionStartResult {
    const goalId = bounded(input.goalId, "goalId", 256);
    const replay = this.#state.transaction((repositories) => {
      const goal = assertOwned(repositories.goals.get(goalId), input);
      const execution = repositories.goals.getExecution(goalId);
      if (!execution) return null;
      if (execution.workspaceId !== input.workspaceId || execution.conversationId !== input.conversationId
        || execution.controllerId !== controllerIdFor(goalId)) {
        throw new GoalExecutorError("GOAL_EXECUTION_REQUEST_CONFLICT", "existing Goal execution conflicts with the current Goal owner or controller binding");
      }
      return execution;
    });
    if (replay) {
      const advanced = this.advance({ workspaceId: input.workspaceId, conversationId: input.conversationId, goalId });
      return { view: advanced.view, replayed: true, admitted: advanced.action === "ADMITTED", scheduled: advanced.scheduled };
    }
    const snapshot = this.#state.transaction((repositories) => {
      const goal = assertOwned(repositories.goals.get(goalId), input);
      if (goal.revision !== input.expectedGoalRevision) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "goal changed; read it again");
      if (goal.status !== "ACTIVE") throw new GoalExecutorError("GOAL_EXECUTION_STATE_INVALID", `goal must be ACTIVE, found ${goal.status}`);
      const planSteps = repositories.goals.listPlanRevisionSteps(goalId, goal.planRevision);
      const currentSteps = repositories.goals.listSteps(goalId);
      if (planSteps.length < 1 || currentSteps.length !== planSteps.length) throw new GoalExecutorError("GOAL_EXECUTION_PLAN_INVALID", "goal plan revision snapshot is incomplete");
      if (currentSteps.some((step) => step.status !== "PENDING")) throw new GoalExecutorError("GOAL_EXECUTION_PLAN_INVALID", "new execution requires untouched PENDING plan steps");
      return { goal, planSteps };
    });
    const controllerId = controllerIdFor(goalId);
    const runtime = this.#runtimes.bind({ workspaceId: input.workspaceId, ownerKey: input.conversationId, controllerId });
    const initialExecution: LedgerGoalExecutionRow = {
      goalId,
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      planRevision: snapshot.goal.planRevision,
      flowId: "pending",
      controllerId,
      status: "QUEUED",
      currentStepId: snapshot.planSteps[0]!.stepId,
      createdAt: this.#now(),
      updatedAt: this.#now(),
      endedAt: null,
      revision: 1,
    };
    const initialSteps: LedgerGoalStepExecutionRow[] = snapshot.planSteps.map((step, index) => ({
      goalId,
      stepId: step.stepId,
      planRevision: snapshot.goal.planRevision,
      ordinal: step.ordinal,
      status: index === 0 ? "READY" : "PENDING",
      currentTaskId: null,
      attemptCount: 0,
      lastTerminalOutcome: null,
      lastSummary: null,
      startedAt: null,
      completedAt: null,
      retryMode: step.retryMode,
      maxAttempts: step.maxAttempts,
      nextRetryAt: null,
      lastRetryReason: null,
      updatedAt: initialExecution.updatedAt,
      revision: 1,
    }));
    const created = runtime.createManaged({
      requestKey: `goal-execution:${goalId}:plan:${snapshot.goal.planRevision}`,
      goal: snapshot.goal.objective,
      currentStep: snapshot.planSteps[0]!.stepId,
      state: projectedState({ ...snapshot, execution: { ...initialExecution, flowId: "deterministic" }, stepExecutions: initialSteps }),
      status: "QUEUED",
    }, ({ repositories, flow, replayed, now }) => {
      const goal = assertOwned(repositories.goals.get(goalId), input);
      if (goal.planRevision !== snapshot.goal.planRevision) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "goal plan changed during execution creation");
      const existing = repositories.goals.getExecution(goalId);
      if (existing) {
        // A running execution remains pinned to its original immutable Plan revision even when
        // the mutable Goal receives a newer revision. Replaying start must return that durable
        // binding rather than treating the newer Goal revision as a conflicting request.
        if (existing.flowId !== flow.flowId || existing.controllerId !== controllerId
          || existing.workspaceId !== input.workspaceId || existing.conversationId !== input.conversationId) {
          throw new GoalExecutorError("GOAL_EXECUTION_REQUEST_CONFLICT", "goal execution replay conflicts with durable binding");
        }
        return;
      }
      if (replayed) throw new GoalExecutorError("GOAL_EXECUTION_REQUEST_CONFLICT", "managed Flow exists without its Goal execution binding");
      const execution: LedgerGoalExecutionRow = { ...initialExecution, flowId: flow.flowId, createdAt: now, updatedAt: now };
      repositories.goals.insertExecution(execution);
      for (const step of initialSteps) repositories.goals.insertStepExecution({ ...step, updatedAt: now });
      appendEvent(repositories, {
        goalId,
        eventType: "goal.execution.started",
        payload: { flowId: flow.flowId, controllerId, planRevision: goal.planRevision, mode: "SINGLE_ACTIVE_STEP" },
        emittedAt: now,
      });
    });
    const advanced = this.advance({ workspaceId: input.workspaceId, conversationId: input.conversationId, goalId });
    return {
      view: advanced.view,
      replayed: created.replayed,
      admitted: advanced.action === "ADMITTED",
      scheduled: advanced.scheduled,
    };
  }

  public revisePlan(input: {
    workspaceId: string;
    conversationId: string;
    goalId: string;
    expectedGoalRevision: number;
    expectedExecutionRevision: number;
    expectedPlanRevision: number;
    steps: readonly GoalPlanRevisionDraftStep[];
  }): GoalPlanRevisionResult {
    const goalId = bounded(input.goalId, "goalId", 256);
    const steps = normalizedDraft(input.steps);
    return this.#state.transaction((repositories) => {
      const goal = assertOwned(repositories.goals.get(goalId), input);
      const execution = repositories.goals.getExecution(goalId);
      if (!execution) throw new GoalExecutorError("GOAL_EXECUTION_NOT_FOUND", "Goal execution not found");
      if (execution.revision !== input.expectedExecutionRevision) {
        throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed; read it again");
      }
      if (goal.planRevision === input.expectedPlanRevision + 1) {
        const replay = repositories.goals.listPlanRevisionSteps(goalId, goal.planRevision);
        if (sameRevisionDraft(replay, steps)) {
          return { goalId, previousPlanRevision: input.expectedPlanRevision, planRevision: goal.planRevision, steps, replayed: true };
        }
        throw new GoalExecutorError("GOAL_EXECUTION_REQUEST_CONFLICT", "Plan revision replay conflicts with the durable revision");
      }
      if (goal.revision !== input.expectedGoalRevision || goal.planRevision !== input.expectedPlanRevision) {
        throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal or Plan revision changed; read it again");
      }
      if (goal.status === "COMPLETED" || goal.status === "CANCELLED" || EXECUTION_TERMINAL.has(execution.status)) {
        throw new GoalExecutorError("GOAL_EXECUTION_STATE_INVALID", "terminal Goal execution cannot be revised");
      }
      const previousPlan = new Map(repositories.goals.listPlanRevisionSteps(goalId, goal.planRevision).map((step) => [step.stepId, step]));
      const nextRevision = goal.planRevision + 1;
      const now = this.#now();
      repositories.goals.resequencePlanDefinitions(goalId);
      for (const draft of steps) {
        const existing = repositories.goals.getStepById(draft.stepId);
        if (existing && existing.goalId !== goalId) {
          throw new GoalExecutorError("GOAL_EXECUTION_PLAN_INVALID", `stepId belongs to a different Goal: ${draft.stepId}`);
        }
        if (existing) {
          const updated = repositories.goals.updatePlanDefinition({
            goalId,
            stepId: draft.stepId,
            ordinal: draft.ordinal,
            title: draft.title,
            updatedAt: now,
          });
          if (!updated) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Plan definition changed during revision creation");
          const previous = previousPlan.get(draft.stepId);
          if (!previous || !sameStableStepDefinition(previous, draft)) {
            const reset = repositories.goals.updateStep({
              goalId: updated.goalId,
              stepId: updated.stepId,
              expectedRevision: updated.revision,
              status: "PENDING",
              note: null,
              sourceRunId: null,
              sourceAttemptId: null,
              startedAt: null,
              completedAt: null,
              updatedAt: now,
            });
            if (!reset) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "changed Plan Step history was not reset during revision creation");
          }
        } else {
          repositories.goals.insertStep({
            stepId: draft.stepId,
            goalId,
            ordinal: draft.ordinal,
            title: draft.title,
            status: "PENDING",
            note: null,
            sourceRunId: null,
            sourceAttemptId: null,
            startedAt: null,
            completedAt: null,
            updatedAt: now,
            revision: 1,
          });
        }
        repositories.goals.insertPlanRevisionStep({
          goalId,
          planRevision: nextRevision,
          stepId: draft.stepId,
          ordinal: draft.ordinal,
          title: draft.title,
          required: draft.required,
          retryMode: draft.retryMode,
          maxAttempts: draft.maxAttempts,
          createdAt: now,
        });
      }
      const updatedGoal = repositories.goals.updateGoal({
        goalId,
        expectedRevision: goal.revision,
        status: goal.status,
        lastNote: goal.lastNote,
        blockerFingerprint: goal.blockerFingerprint,
        consecutiveBlockerCount: goal.consecutiveBlockerCount,
        continuationCount: goal.continuationCount,
        planRevision: nextRevision,
        sourceRunId: goal.sourceRunId,
        sourceAttemptId: goal.sourceAttemptId,
        updatedAt: now,
        terminalAt: goal.terminalAt,
      });
      if (!updatedGoal) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal changed during Plan revision creation");
      appendEvent(repositories, {
        goalId,
        eventType: "goal.plan.revised",
        payload: {
          previousPlanRevision: input.expectedPlanRevision,
          planRevision: nextRevision,
          executionPlanRevision: execution.planRevision,
          steps,
        },
        emittedAt: now,
      });
      return { goalId, previousPlanRevision: input.expectedPlanRevision, planRevision: nextRevision, steps, replayed: false };
    });
  }

  public adoptPlanRevision(input: {
    workspaceId: string;
    conversationId: string;
    goalId: string;
    targetPlanRevision: number;
    expectedExecutionRevision: number;
    expectedFlowRevision: number;
  }): GoalPlanAdoptionResult {
    const rows = this.#rows(bounded(input.goalId, "goalId", 256));
    assertOwned(rows.goal, input);
    if (rows.execution.planRevision === input.targetPlanRevision) {
      const advanced = this.advance({ workspaceId: input.workspaceId, conversationId: input.conversationId, goalId: input.goalId });
      return {
        view: advanced.view,
        previousPlanRevision: rows.execution.planRevision,
        planRevision: rows.execution.planRevision,
        replayed: true,
        action: advanced.action,
        scheduled: advanced.scheduled,
      };
    }
    if (rows.execution.revision !== input.expectedExecutionRevision) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed; read it again");
    if (input.targetPlanRevision !== rows.goal.planRevision || input.targetPlanRevision <= rows.execution.planRevision) {
      throw new GoalExecutorError("GOAL_EXECUTION_PLAN_INVALID", "target Plan revision must be the current newer Goal Plan revision");
    }
    if (rows.execution.status !== "BLOCKED" && rows.execution.status !== "WAITING") {
      throw new GoalExecutorError("GOAL_EXECUTION_STATE_INVALID", "Plan revision adoption requires a BLOCKED or WAITING execution");
    }
    this.#assertNoActiveTask(rows);
    const openBlocker = this.#state.transaction((repositories) => repositories.goals.getAnyOpenBlocker(rows.goal.goalId, rows.execution.planRevision));
    if (openBlocker) throw new GoalExecutorError("GOAL_EXECUTION_BLOCKER_REQUIRED", "resolve the current blocker before adopting a new Plan revision");
    const targetPlan = this.#state.transaction((repositories) => repositories.goals.listPlanRevisionSteps(rows.goal.goalId, input.targetPlanRevision));
    if (targetPlan.length < 1) throw new GoalExecutorError("GOAL_EXECUTION_PLAN_INVALID", "target Plan revision snapshot is empty");
    const targetIds = new Set(targetPlan.map((step) => step.stepId));
    const oldById = new Map(rows.stepExecutions.map((step) => [step.stepId, step]));
    const oldPlanById = new Map(rows.planSteps.map((step) => [step.stepId, step]));
    const removedIncomplete = rows.stepExecutions.filter((step) => {
      const definition = oldPlanById.get(step.stepId);
      return definition?.required && !targetIds.has(step.stepId) && step.status !== "SUCCEEDED" && step.status !== "SKIPPED";
    });
    if (removedIncomplete.length > 0) {
      throw new GoalExecutorError("GOAL_EXECUTION_PLAN_INVALID", `new Plan removes incomplete required Steps: ${removedIncomplete.map((step) => step.stepId).join(", ")}`);
    }
    const now = this.#now();
    const projected: LedgerGoalStepExecutionRow[] = targetPlan.map((definition) => {
      const previous = oldById.get(definition.stepId);
      const oldDefinition = oldPlanById.get(definition.stepId);
      const stable = previous !== undefined && oldDefinition !== undefined && sameStableStepDefinition(oldDefinition, definition);
      const preserved = stable && (previous.status === "SUCCEEDED" || previous.status === "SKIPPED");
      return {
        goalId: rows.goal.goalId,
        stepId: definition.stepId,
        planRevision: input.targetPlanRevision,
        ordinal: definition.ordinal,
        status: preserved ? previous.status : "PENDING",
        currentTaskId: null,
        attemptCount: stable ? previous.attemptCount : 0,
        lastTerminalOutcome: preserved ? previous.lastTerminalOutcome : null,
        lastSummary: preserved ? previous.lastSummary : null,
        startedAt: preserved ? previous.startedAt : null,
        completedAt: preserved ? previous.completedAt : null,
        retryMode: definition.retryMode,
        maxAttempts: definition.maxAttempts,
        nextRetryAt: null,
        lastRetryReason: null,
        updatedAt: now,
        revision: 1,
      };
    });
    const next = projected.find((step) => step.status === "PENDING") ?? null;
    if (next) next.status = "READY";
    const projectedExecution: LedgerGoalExecutionRow = {
      ...rows.execution,
      planRevision: input.targetPlanRevision,
      status: next ? "QUEUED" : "RUNNING",
      currentStepId: next?.stepId ?? null,
      updatedAt: now,
      endedAt: null,
    };
    const base = this.#base(rows.execution);
    base.resume({
      flowId: rows.execution.flowId,
      expectedRevision: input.expectedFlowRevision,
      status: next ? "QUEUED" : "RUNNING",
      currentStep: next?.stepId ?? null,
      state: projectedState({ goal: rows.goal, execution: projectedExecution, planSteps: targetPlan, stepExecutions: projected }),
    }, ({ repositories, now: transitionNow }) => {
      const execution = repositories.goals.getExecution(rows.goal.goalId);
      const goal = repositories.goals.get(rows.goal.goalId);
      if (!execution || !goal || execution.revision !== input.expectedExecutionRevision) {
        throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed during Plan revision adoption");
      }
      if (repositories.goals.listStepExecutions(goal.goalId, input.targetPlanRevision).length > 0) {
        throw new GoalExecutorError("GOAL_EXECUTION_REQUEST_CONFLICT", "target Plan revision execution projection already exists");
      }
      for (const step of projected) repositories.goals.insertStepExecution({ ...step, updatedAt: transitionNow });
      const updatedExecution = repositories.goals.updateExecutionPlanRevision({
        goalId: execution.goalId,
        expectedRevision: execution.revision,
        planRevision: input.targetPlanRevision,
        status: next ? "QUEUED" : "RUNNING",
        currentStepId: next?.stepId ?? null,
        updatedAt: transitionNow,
        endedAt: null,
      });
      if (!updatedExecution) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed during Plan revision adoption");
      if (goal.status === "BLOCKED" || goal.status === "PAUSED") {
        const updatedGoal = repositories.goals.updateGoal({
          goalId: goal.goalId,
          expectedRevision: goal.revision,
          status: "ACTIVE",
          lastNote: goal.lastNote,
          blockerFingerprint: null,
          consecutiveBlockerCount: 0,
          continuationCount: goal.continuationCount,
          planRevision: goal.planRevision,
          sourceRunId: goal.sourceRunId,
          sourceAttemptId: goal.sourceAttemptId,
          updatedAt: transitionNow,
          terminalAt: null,
        });
        if (!updatedGoal) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal changed during Plan revision adoption");
      }
      for (const definition of targetPlan) {
        const mutable = repositories.goals.getStep(goal.goalId, definition.stepId);
        const executionStep = projected.find((step) => step.stepId === definition.stepId)!;
        if (!mutable) throw new GoalExecutorError("GOAL_EXECUTION_PLAN_INVALID", "mutable Plan definition is missing during adoption");
        const status = executionStep.status === "SUCCEEDED" || executionStep.status === "SKIPPED"
          ? "COMPLETED"
          : executionStep.status === "BLOCKED" || executionStep.status === "FAILED"
            ? "BLOCKED"
            : "PENDING";
        if (!repositories.goals.updateStep({
          goalId: mutable.goalId,
          stepId: mutable.stepId,
          expectedRevision: mutable.revision,
          status,
          note: executionStep.lastSummary,
          sourceRunId: mutable.sourceRunId,
          sourceAttemptId: mutable.sourceAttemptId,
          startedAt: executionStep.startedAt,
          completedAt: executionStep.completedAt,
          updatedAt: transitionNow,
        })) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "mutable Plan Step changed during adoption");
      }
      appendEvent(repositories, {
        goalId: goal.goalId,
        eventType: "goal.execution.plan_revision.adopted",
        payload: {
          previousPlanRevision: rows.execution.planRevision,
          planRevision: input.targetPlanRevision,
          preservedSteps: projected.filter((step) => step.status === "SUCCEEDED" || step.status === "SKIPPED").map((step) => step.stepId),
          nextStepId: next?.stepId ?? null,
        },
        emittedAt: transitionNow,
      });
    });
    const advanced = next
      ? this.advance({ workspaceId: input.workspaceId, conversationId: input.conversationId, goalId: input.goalId })
      : { view: this.get(input), action: "OBSERVING" as const, replayed: true, scheduled: false };
    return {
      view: advanced.view,
      previousPlanRevision: rows.execution.planRevision,
      planRevision: input.targetPlanRevision,
      replayed: false,
      action: advanced.action,
      scheduled: advanced.scheduled,
    };
  }

  #resumeBlockedStep(input: {
    workspaceId: string;
    conversationId: string;
    goalId: string;
    blockerId: string;
    expectedBlockerRevision: number;
    expectedExecutionRevision: number;
    expectedFlowRevision: number;
    resolvedBy: string;
    resolution: string;
    requireFailed: boolean;
  }): { blocker: LedgerGoalStepBlockerRow; advance: GoalExecutionAdvanceResult } {
    const rows = this.#rows(bounded(input.goalId, "goalId", 256));
    assertOwned(rows.goal, input);
    if (rows.execution.revision !== input.expectedExecutionRevision) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed; read it again");
    if (rows.execution.status !== "BLOCKED") throw new GoalExecutorError("GOAL_EXECUTION_STATE_INVALID", "Goal execution is not BLOCKED");
    this.#assertNoActiveTask(rows);
    const blocker = this.#state.transaction((repositories) => repositories.goals.getBlocker(bounded(input.blockerId, "blockerId", 256)));
    if (!blocker || blocker.goalId !== rows.goal.goalId || blocker.planRevision !== rows.execution.planRevision || blocker.status !== "OPEN") {
      throw new GoalExecutorError("GOAL_EXECUTION_BLOCKER_REQUIRED", "open Goal Step blocker not found");
    }
    const target = rows.stepExecutions.find((step) => step.stepId === blocker.stepId);
    if (!target || (input.requireFailed ? target.status !== "FAILED" : target.status !== "BLOCKED" && target.status !== "FAILED")) {
      throw new GoalExecutorError("GOAL_EXECUTION_STATE_INVALID", "blocker does not match a resumable Goal Step");
    }
    if (target.attemptCount >= target.maxAttempts) {
      throw new GoalExecutorError("GOAL_EXECUTION_RETRY_LIMIT", `Step retry limit reached: ${target.attemptCount}/${target.maxAttempts}`);
    }
    const resolution = bounded(input.resolution, "blocker resolution", 2_000);
    const resolvedBy = bounded(input.resolvedBy, "resolvedBy", 256);
    const projectedSteps = rows.stepExecutions.map((step) => step.stepId === target.stepId
      ? { ...step, status: "READY" as const, currentTaskId: null, nextRetryAt: null, lastRetryReason: resolution, completedAt: null }
      : step);
    const base = this.#base(rows.execution);
    const resolved = base.resume({
      flowId: rows.execution.flowId,
      expectedRevision: input.expectedFlowRevision,
      status: "QUEUED",
      currentStep: target.stepId,
      state: projectedState({ ...rows, execution: { ...rows.execution, status: "QUEUED", currentStepId: target.stepId }, stepExecutions: projectedSteps }),
    }, ({ repositories, now }) => {
      const execution = repositories.goals.getExecution(rows.goal.goalId);
      const step = repositories.goals.getStepExecution(rows.goal.goalId, target.stepId, rows.execution.planRevision);
      const goal = repositories.goals.get(rows.goal.goalId);
      const durableBlocker = repositories.goals.getBlocker(blocker.blockerId);
      if (!execution || !step || !goal || !durableBlocker || execution.revision !== input.expectedExecutionRevision
        || durableBlocker.revision !== input.expectedBlockerRevision) {
        throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution or blocker changed during resolution");
      }
      const resolvedBlocker = repositories.goals.resolveBlocker({
        blockerId: durableBlocker.blockerId,
        expectedRevision: durableBlocker.revision,
        resolvedBy,
        resolution,
        updatedAt: now,
      });
      if (!resolvedBlocker) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal blocker changed during resolution");
      const updatedStep = repositories.goals.updateStepExecution(stepMutation(step, {
        status: "READY",
        currentTaskId: null,
        completedAt: null,
        nextRetryAt: null,
        lastRetryReason: resolution,
        updatedAt: now,
      }));
      if (!updatedStep) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal Step changed during blocker resolution");
      const mutable = repositories.goals.getStep(goal.goalId, step.stepId);
      if (mutable && this.#canProjectMutablePlanStep(repositories, goal, execution, step.stepId)
        && mutable.status === "BLOCKED" && !repositories.goals.updateStep({
        goalId: mutable.goalId,
        stepId: mutable.stepId,
        expectedRevision: mutable.revision,
        status: "IN_PROGRESS",
        note: resolution,
        sourceRunId: mutable.sourceRunId,
        sourceAttemptId: mutable.sourceAttemptId,
        startedAt: mutable.startedAt ?? now,
        completedAt: null,
        updatedAt: now,
      })) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "mutable Plan Step changed during blocker resolution");
      if (!repositories.goals.updateExecution({
        goalId: execution.goalId,
        expectedRevision: execution.revision,
        status: "QUEUED",
        currentStepId: step.stepId,
        updatedAt: now,
        endedAt: null,
      })) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed during blocker resolution");
      if (goal.status === "BLOCKED" && !repositories.goals.updateGoal({
        goalId: goal.goalId,
        expectedRevision: goal.revision,
        status: "ACTIVE",
        lastNote: resolution,
        blockerFingerprint: null,
        consecutiveBlockerCount: 0,
        continuationCount: goal.continuationCount,
        planRevision: goal.planRevision,
        sourceRunId: goal.sourceRunId,
        sourceAttemptId: goal.sourceAttemptId,
        updatedAt: now,
        terminalAt: null,
      })) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal changed during blocker resolution");
      appendEvent(repositories, {
        goalId: goal.goalId,
        eventType: input.requireFailed ? "plan.step.retry.requested" : "plan.step.blocker.resolved",
        payload: {
          blockerId: resolvedBlocker.blockerId,
          stepId: step.stepId,
          resolvedBy,
          resolution,
          nextAttempt: step.attemptCount + 1,
        },
        emittedAt: now,
      });
    });
    const advance = this.advance({ workspaceId: input.workspaceId, conversationId: input.conversationId, goalId: input.goalId });
    return { blocker: this.#state.transaction((repositories) => repositories.goals.getBlocker(blocker.blockerId)) ?? blocker, advance };
  }

  public retry(input: {
    workspaceId: string;
    conversationId: string;
    goalId: string;
    blockerId: string;
    expectedBlockerRevision: number;
    expectedExecutionRevision: number;
    expectedFlowRevision: number;
    requestedBy: string;
    reason: string;
  }): GoalStepRetryResult {
    const result = this.#resumeBlockedStep({
      ...input,
      resolvedBy: input.requestedBy,
      resolution: input.reason,
      requireFailed: true,
    });
    return { view: result.advance.view, blocker: toBlocker(result.blocker), action: result.advance.action, scheduled: result.advance.scheduled };
  }

  public resolveBlocker(input: {
    workspaceId: string;
    conversationId: string;
    goalId: string;
    blockerId: string;
    expectedBlockerRevision: number;
    expectedExecutionRevision: number;
    expectedFlowRevision: number;
    resolvedBy: string;
    resolution: string;
  }): GoalBlockerResolutionResult {
    const result = this.#resumeBlockedStep({ ...input, requireFailed: false });
    return { view: result.advance.view, blocker: toBlocker(result.blocker), action: result.advance.action, scheduled: result.advance.scheduled };
  }

  #admitReady(rows: ExecutorRows, requested?: {
    expectedRevision: number;
    requestKey: string;
    stepKey: string;
    text: string;
  }): AdmissionOutcome {
    const ready = rows.stepExecutions.find((step) => step.status === "READY");
    if (!ready) throw new GoalExecutorError("GOAL_EXECUTION_STATE_INVALID", "goal execution has no READY step");
    if (rows.stepExecutions.some((step) => step.status === "RUNNING" || step.status === "WAITING" || step.status === "BLOCKED")) {
      throw new GoalExecutorError("GOAL_EXECUTION_STATE_INVALID", "goal execution already has an active step");
    }
    const plan = rows.planSteps.find((step) => step.stepId === ready.stepId)!;
    const expectedRequestKey = requestKey(rows.goal.goalId, rows.execution.planRevision, ready.stepId, ready.attemptCount + 1);
    const expectedText = taskText(rows.goal, plan, rows.planSteps.length);
    if (requested) {
      if (requested.expectedRevision !== this.#base(rows.execution).get(rows.execution.flowId).flow.revision
        || requested.requestKey !== expectedRequestKey || requested.stepKey !== ready.stepId || requested.text !== expectedText) {
        throw new GoalExecutorError("GOAL_EXECUTION_REQUEST_CONFLICT", "controller child admission does not match the next durable Plan step");
      }
    }
    const projectedSteps = rows.stepExecutions.map((step) => step.stepId === ready.stepId
      ? { ...step, status: "RUNNING" as const, attemptCount: step.attemptCount + 1, startedAt: step.startedAt ?? this.#now() }
      : step);
    const projectedExecution = { ...rows.execution, status: "RUNNING" as const, currentStepId: ready.stepId };
    const base = this.#base(rows.execution);
    const flow = base.get(rows.execution.flowId).flow;
    const admitted = base.runTask({
      flowId: rows.execution.flowId,
      expectedRevision: requested?.expectedRevision ?? flow.revision,
      requestKey: expectedRequestKey,
      stepKey: ready.stepId,
      text: expectedText,
      state: projectedState({ ...rows, execution: projectedExecution, stepExecutions: projectedSteps }),
    }, ({ repositories, task, run, replayed, now }) => {
      const execution = repositories.goals.getExecution(rows.goal.goalId);
      const step = repositories.goals.getStepExecution(rows.goal.goalId, ready.stepId, rows.execution.planRevision);
      const goal = repositories.goals.get(rows.goal.goalId);
      if (!execution || !step || !goal) throw new GoalExecutorError("GOAL_EXECUTION_NOT_FOUND", "goal execution changed during child admission");
      if (replayed) {
        if (step.currentTaskId !== task.taskId || step.status !== "RUNNING") throw new GoalExecutorError("GOAL_EXECUTION_REQUEST_CONFLICT", "child replay conflicts with Plan step execution");
        return;
      }
      if (execution.revision !== rows.execution.revision || step.revision !== ready.revision || step.status !== "READY") {
        throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "goal execution changed during child admission");
      }
      const active = repositories.goals.listStepExecutions(rows.goal.goalId, execution.planRevision)
        .filter((entry) => entry.status === "RUNNING" || entry.status === "WAITING" || entry.status === "BLOCKED");
      if (active.length !== 0) throw new GoalExecutorError("GOAL_EXECUTION_STATE_INVALID", "another Plan step became active during admission");
      const updatedStep = repositories.goals.updateStepExecution(stepMutation(step, {
        status: "RUNNING", currentTaskId: task.taskId, attemptCount: step.attemptCount + 1,
        lastTerminalOutcome: null, lastSummary: null, startedAt: step.startedAt ?? now,
        completedAt: null, nextRetryAt: null, lastRetryReason: null, updatedAt: now,
      }));
      if (!updatedStep) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Plan step execution changed during admission");
      const planStep = repositories.goals.getStep(step.goalId, step.stepId);
      if (!planStep) throw new GoalExecutorError("GOAL_EXECUTION_PLAN_INVALID", "Plan step disappeared during admission");
      if (this.#canProjectMutablePlanStep(repositories, goal, execution, step.stepId)
        && (planStep.status === "PENDING" || planStep.status === "BLOCKED")) {
        const updatedPlan = repositories.goals.updateStep({
          goalId: step.goalId, stepId: step.stepId, expectedRevision: planStep.revision,
          status: "IN_PROGRESS", note: planStep.note, sourceRunId: run.runId,
          sourceAttemptId: run.currentAttemptId, startedAt: planStep.startedAt ?? now,
          completedAt: null, updatedAt: now,
        });
        if (!updatedPlan) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Plan step changed during admission");
      }
      const updatedExecution = repositories.goals.updateExecution({
        goalId: execution.goalId, expectedRevision: execution.revision, status: "RUNNING",
        currentStepId: step.stepId, updatedAt: now, endedAt: null,
      });
      if (!updatedExecution) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed during admission");
      appendEvent(repositories, {
        goalId: execution.goalId,
        eventType: "plan.step.task.admitted",
        payload: { stepId: step.stepId, ordinal: step.ordinal, taskId: task.taskId, runId: run.runId, attempt: updatedStep.attemptCount },
        sourceRunId: run.runId,
        sourceAttemptId: run.currentAttemptId,
        emittedAt: now,
      });
    });
    return {
      advance: {
        view: this.get({ workspaceId: rows.execution.workspaceId, conversationId: rows.execution.conversationId, goalId: rows.goal.goalId }),
        action: "ADMITTED",
        replayed: admitted.replayed,
        scheduled: admitted.scheduled,
      },
      admission: admitted,
    };
  }

  public advance(input: { workspaceId: string; conversationId: string; goalId: string }): GoalExecutionAdvanceResult {
    let rows = this.#rows(bounded(input.goalId, "goalId", 256));
    assertOwned(rows.goal, input);
    if (EXECUTION_TERMINAL.has(rows.execution.status)) {
      return { view: this.get(input), action: "TERMINAL", replayed: true, scheduled: false };
    }
    const current = rows.execution.currentStepId
      ? rows.stepExecutions.find((step) => step.stepId === rows.execution.currentStepId)
      : undefined;
    if (current?.currentTaskId) {
      const task = this.#tasks.get({ workspaceId: input.workspaceId, taskId: current.currentTaskId }).task;
      if (!TASK_TERMINAL.has(task.status)) return { view: this.get(input), action: "OBSERVING", replayed: true, scheduled: false };
      this.reconcileTask(task.taskId);
      rows = this.#rows(input.goalId);
    }
    if (rows.execution.status === "WAITING") return { view: this.get(input), action: "WAITING", replayed: true, scheduled: false };
    if (rows.execution.status === "BLOCKED" || rows.execution.status === "FAILED") return { view: this.get(input), action: "BLOCKED", replayed: true, scheduled: false };
    if (rows.stepExecutions.some((step) => step.status === "READY")) {
      if (rows.execution.status === "QUEUED") return this.#admitReady(rows).advance;
      return { view: this.get(input), action: "OBSERVING", replayed: true, scheduled: false };
    }
    if (rows.stepExecutions.every((step) => step.status === "SUCCEEDED" || step.status === "SKIPPED")) {
      return { view: this.get(input), action: "COMPLETED", replayed: true, scheduled: false };
    }
    return { view: this.get(input), action: "OBSERVING", replayed: true, scheduled: false };
  }

  public reconcileRun(runId: string): GoalExecutionView | null {
    const task = this.#state.transaction((repositories) => repositories.tasks.getByRun(bounded(runId, "runId", 256)));
    return task ? this.reconcileTask(task.taskId) : null;
  }

  public reconcileTask(taskId: string): GoalExecutionView | null {
    const snapshot = this.#state.transaction((repositories) => {
      const stepExecution = repositories.goals.getStepExecutionByTask(bounded(taskId, "taskId", 256));
      if (!stepExecution) return null;
      const execution = repositories.goals.getExecution(stepExecution.goalId);
      const goal = repositories.goals.get(stepExecution.goalId);
      const task = repositories.tasks.get(taskId);
      if (!execution || !goal || !task) throw new GoalExecutorError("GOAL_EXECUTION_NOT_FOUND", "Goal execution terminal projection is incomplete");
      const planSteps = repositories.goals.listPlanRevisionSteps(goal.goalId, execution.planRevision);
      const stepExecutions = repositories.goals.listStepExecutions(goal.goalId, execution.planRevision);
      return { goal, execution, task, stepExecution, planSteps, stepExecutions };
    });
    if (!snapshot) return null;
    if (!TASK_TERMINAL.has(snapshot.task.status) || snapshot.stepExecution.status !== "RUNNING") {
      return this.get({ workspaceId: snapshot.execution.workspaceId, conversationId: snapshot.execution.conversationId, goalId: snapshot.goal.goalId });
    }
    const base = this.#base(snapshot.execution);
    const flow = base.get(snapshot.execution.flowId).flow;
    const now = this.#now();
    const terminalSummary = snapshot.task.terminalSummary ?? snapshot.task.errorCode ?? snapshot.task.status;
    if (snapshot.task.status === "SUCCEEDED" && snapshot.task.terminalOutcome === "SUCCEEDED") {
      const nextSteps = snapshot.stepExecutions.map((step) => {
        if (step.stepId === snapshot.stepExecution.stepId) return { ...step, status: "SUCCEEDED" as const, lastTerminalOutcome: "SUCCEEDED" as const, lastSummary: terminalSummary, completedAt: now };
        if (step.status === "PENDING" && step.ordinal === snapshot.stepExecution.ordinal + 1) return { ...step, status: "READY" as const };
        return step;
      });
      const next = nextSteps.find((step) => step.status === "READY");
      const projectedExecution = { ...snapshot.execution, status: "RUNNING" as const, currentStepId: next?.stepId ?? null };
      base.resume({
        flowId: flow.flowId, expectedRevision: flow.revision, status: "RUNNING",
        currentStep: next?.stepId ?? null,
        state: projectedState({ ...snapshot, execution: projectedExecution, stepExecutions: nextSteps }),
      }, ({ repositories, now: transitionNow }) => {
        this.#applySucceededStep(repositories, snapshot, next?.stepId ?? null, terminalSummary, transitionNow);
      });
    } else if (snapshot.task.status === "SUCCEEDED" && snapshot.task.terminalOutcome === "BLOCKED") {
      const blockedSteps = snapshot.stepExecutions.map((step) => step.stepId === snapshot.stepExecution.stepId
        ? { ...step, status: "BLOCKED" as const, lastTerminalOutcome: "BLOCKED" as const, lastSummary: terminalSummary }
        : step);
      const projectedExecution = { ...snapshot.execution, status: "BLOCKED" as const, currentStepId: snapshot.stepExecution.stepId };
      base.setBlocked({
        flowId: flow.flowId, expectedRevision: flow.revision, currentStep: snapshot.stepExecution.stepId,
        blockedTaskId: snapshot.task.taskId, blockedSummary: terminalSummary,
        state: projectedState({ ...snapshot, execution: projectedExecution, stepExecutions: blockedSteps }),
      }, ({ repositories, now: transitionNow }) => {
        this.#applyBlockedStep(repositories, snapshot, terminalSummary, transitionNow);
      });
    } else if (snapshot.task.status === "CANCELLED") {
      this.cancel({ workspaceId: snapshot.execution.workspaceId, conversationId: snapshot.execution.conversationId, goalId: snapshot.goal.goalId, expectedExecutionRevision: snapshot.execution.revision, expectedFlowRevision: flow.revision });
    } else {
      const failedSteps = snapshot.stepExecutions.map((step) => step.stepId === snapshot.stepExecution.stepId
        ? { ...step, status: "FAILED" as const, lastTerminalOutcome: snapshot.task.terminalOutcome, lastSummary: terminalSummary, completedAt: now }
        : step);
      const projectedExecution = { ...snapshot.execution, status: "BLOCKED" as const, currentStepId: snapshot.stepExecution.stepId, endedAt: null };
      base.setBlocked({
        flowId: flow.flowId, expectedRevision: flow.revision, currentStep: snapshot.stepExecution.stepId,
        blockedTaskId: snapshot.task.taskId, blockedSummary: terminalSummary,
        state: projectedState({ ...snapshot, execution: projectedExecution, stepExecutions: failedSteps }),
      }, ({ repositories, now: transitionNow }) => {
        this.#applyFailedStep(repositories, snapshot, terminalSummary, transitionNow);
      });
    }
    return this.get({ workspaceId: snapshot.execution.workspaceId, conversationId: snapshot.execution.conversationId, goalId: snapshot.goal.goalId });
  }

  #applySucceededStep(repositories: StateRepositories, snapshot: {
    goal: LedgerGoalRow; execution: LedgerGoalExecutionRow; task: LedgerTaskRow;
    stepExecution: LedgerGoalStepExecutionRow; planSteps: LedgerPlanRevisionStepRow[]; stepExecutions: LedgerGoalStepExecutionRow[];
  }, nextStepId: string | null, summary: string, now: number): void {
    const current = repositories.goals.getStepExecution(snapshot.goal.goalId, snapshot.stepExecution.stepId, snapshot.execution.planRevision);
    const execution = repositories.goals.getExecution(snapshot.goal.goalId);
    const plan = repositories.goals.getStep(snapshot.goal.goalId, snapshot.stepExecution.stepId);
    const goal = repositories.goals.get(snapshot.goal.goalId);
    if (!current || !execution || !goal || current.currentTaskId !== snapshot.task.taskId) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed before success projection");
    if (!repositories.goals.updateStepExecution(stepMutation(current, {
      status: "SUCCEEDED", lastTerminalOutcome: "SUCCEEDED", lastSummary: summary,
      completedAt: now, nextRetryAt: null, updatedAt: now,
    }))) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Plan Step success projection changed");
    if (this.#canProjectMutablePlanStep(repositories, goal, execution, current.stepId)) {
      if (!plan) throw new GoalExecutorError("GOAL_EXECUTION_PLAN_INVALID", "current mutable Plan Step is missing during success projection");
      if (!repositories.goals.updateStep({
        goalId: plan.goalId, stepId: plan.stepId, expectedRevision: plan.revision,
        status: "COMPLETED", note: summary, sourceRunId: snapshot.task.runId,
        sourceAttemptId: repositories.conversations.getRun(snapshot.task.runId)?.currentAttemptId ?? null,
        startedAt: plan.startedAt ?? current.startedAt ?? now, completedAt: now, updatedAt: now,
      })) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Plan Step changed during success projection");
    }
    if (nextStepId) {
      const next = repositories.goals.getStepExecution(snapshot.goal.goalId, nextStepId, snapshot.execution.planRevision);
      if (!next || next.status !== "PENDING") throw new GoalExecutorError("GOAL_EXECUTION_STATE_INVALID", "next Plan Step is not PENDING");
      if (!repositories.goals.updateStepExecution(stepMutation(next, {
        status: "READY", currentTaskId: null, nextRetryAt: null, updatedAt: now,
      }))) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "next Plan Step changed during readiness projection");
    }
    if (!repositories.goals.updateExecution({
      goalId: execution.goalId, expectedRevision: execution.revision, status: "RUNNING",
      currentStepId: nextStepId, updatedAt: now, endedAt: null,
    })) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed during success projection");
    appendEvent(repositories, {
      goalId: snapshot.goal.goalId,
      eventType: "plan.step.task.succeeded",
      payload: { stepId: current.stepId, taskId: snapshot.task.taskId, summary, nextStepId },
      sourceRunId: snapshot.task.runId,
      sourceAttemptId: repositories.conversations.getRun(snapshot.task.runId)?.currentAttemptId ?? null,
      emittedAt: now,
    });
  }

  #applyBlockedStep(repositories: StateRepositories, snapshot: {
    goal: LedgerGoalRow; execution: LedgerGoalExecutionRow; task: LedgerTaskRow;
    stepExecution: LedgerGoalStepExecutionRow; planSteps: LedgerPlanRevisionStepRow[]; stepExecutions: LedgerGoalStepExecutionRow[];
  }, summary: string, now: number): void {
    const current = repositories.goals.getStepExecution(snapshot.goal.goalId, snapshot.stepExecution.stepId, snapshot.execution.planRevision);
    const execution = repositories.goals.getExecution(snapshot.goal.goalId);
    const plan = repositories.goals.getStep(snapshot.goal.goalId, snapshot.stepExecution.stepId);
    const goal = repositories.goals.get(snapshot.goal.goalId);
    if (!current || !execution || !plan || !goal) throw new GoalExecutorError("GOAL_EXECUTION_NOT_FOUND", "Goal execution changed before blocker projection");
    if (!repositories.goals.updateStepExecution(stepMutation(current, {
      status: "BLOCKED", lastTerminalOutcome: "BLOCKED", lastSummary: summary,
      completedAt: null, updatedAt: now,
    }))) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Plan Step blocker projection changed");
    if (this.#canProjectMutablePlanStep(repositories, goal, execution, current.stepId)
      && plan.status === "IN_PROGRESS" && !repositories.goals.updateStep({
      goalId: plan.goalId, stepId: plan.stepId, expectedRevision: plan.revision,
      status: "BLOCKED", note: summary, sourceRunId: snapshot.task.runId,
      sourceAttemptId: repositories.conversations.getRun(snapshot.task.runId)?.currentAttemptId ?? null,
      startedAt: plan.startedAt ?? current.startedAt ?? now, completedAt: null, updatedAt: now,
    })) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Plan Step changed during blocker projection");
    if (!repositories.goals.updateExecution({
      goalId: execution.goalId, expectedRevision: execution.revision, status: "BLOCKED",
      currentStepId: current.stepId, updatedAt: now, endedAt: null,
    })) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed during blocker projection");
    const blocker = this.#recordBlocker(repositories, {
      goal,
      execution,
      step: current,
      taskId: snapshot.task.taskId,
      blockerType: "TASK_OUTPUT",
      summary,
      evidence: { taskId: snapshot.task.taskId, taskStatus: snapshot.task.status, terminalOutcome: snapshot.task.terminalOutcome },
      now,
    });
    if (goal.status === "ACTIVE" && !repositories.goals.updateGoal({
      goalId: goal.goalId, expectedRevision: goal.revision, status: "BLOCKED", lastNote: summary,
      blockerFingerprint: blocker.fingerprint, consecutiveBlockerCount: blocker.occurrenceCount,
      continuationCount: goal.continuationCount, planRevision: goal.planRevision,
      sourceRunId: snapshot.task.runId, sourceAttemptId: repositories.conversations.getRun(snapshot.task.runId)?.currentAttemptId ?? null,
      updatedAt: now, terminalAt: null,
    })) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal changed during blocker projection");
    appendEvent(repositories, {
      goalId: snapshot.goal.goalId,
      eventType: "plan.step.task.blocked",
      payload: { stepId: current.stepId, taskId: snapshot.task.taskId, summary, blockerId: blocker.blockerId, fingerprint: blocker.fingerprint, occurrenceCount: blocker.occurrenceCount },
      sourceRunId: snapshot.task.runId,
      sourceAttemptId: repositories.conversations.getRun(snapshot.task.runId)?.currentAttemptId ?? null,
      emittedAt: now,
    });
  }

  #applyFailedStep(repositories: StateRepositories, snapshot: {
    goal: LedgerGoalRow; execution: LedgerGoalExecutionRow; task: LedgerTaskRow;
    stepExecution: LedgerGoalStepExecutionRow; planSteps: LedgerPlanRevisionStepRow[]; stepExecutions: LedgerGoalStepExecutionRow[];
  }, summary: string, now: number): void {
    const current = repositories.goals.getStepExecution(snapshot.goal.goalId, snapshot.stepExecution.stepId, snapshot.execution.planRevision);
    const execution = repositories.goals.getExecution(snapshot.goal.goalId);
    const plan = repositories.goals.getStep(snapshot.goal.goalId, snapshot.stepExecution.stepId);
    const goal = repositories.goals.get(snapshot.goal.goalId);
    if (!current || !execution || !plan || !goal) throw new GoalExecutorError("GOAL_EXECUTION_NOT_FOUND", "Goal execution changed before failure projection");
    if (!repositories.goals.updateStepExecution(stepMutation(current, {
      status: "FAILED", lastTerminalOutcome: snapshot.task.terminalOutcome, lastSummary: summary,
      completedAt: now, updatedAt: now,
    }))) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Plan Step failure projection changed");
    if (this.#canProjectMutablePlanStep(repositories, goal, execution, current.stepId)
      && (plan.status === "IN_PROGRESS" || plan.status === "BLOCKED") && !repositories.goals.updateStep({
      goalId: plan.goalId, stepId: plan.stepId, expectedRevision: plan.revision,
      status: "BLOCKED", note: summary, sourceRunId: snapshot.task.runId,
      sourceAttemptId: repositories.conversations.getRun(snapshot.task.runId)?.currentAttemptId ?? null,
      startedAt: plan.startedAt ?? current.startedAt ?? now, completedAt: null, updatedAt: now,
    })) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Plan Step changed during failure projection");
    if (!repositories.goals.updateExecution({
      goalId: execution.goalId, expectedRevision: execution.revision, status: "BLOCKED",
      currentStepId: current.stepId, updatedAt: now, endedAt: null,
    })) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed during failure projection");
    const blockerType = current.attemptCount >= current.maxAttempts ? "RETRY_LIMIT" as const : "TASK_FAILURE" as const;
    const blocker = this.#recordBlocker(repositories, {
      goal,
      execution,
      step: current,
      taskId: snapshot.task.taskId,
      blockerType,
      summary,
      evidence: { taskId: snapshot.task.taskId, taskStatus: snapshot.task.status, errorCode: snapshot.task.errorCode, attemptCount: current.attemptCount, maxAttempts: current.maxAttempts },
      now,
    });
    if (goal.status === "ACTIVE" && !repositories.goals.updateGoal({
      goalId: goal.goalId, expectedRevision: goal.revision, status: "BLOCKED", lastNote: summary,
      blockerFingerprint: blocker.fingerprint, consecutiveBlockerCount: blocker.occurrenceCount,
      continuationCount: goal.continuationCount, planRevision: goal.planRevision,
      sourceRunId: snapshot.task.runId, sourceAttemptId: repositories.conversations.getRun(snapshot.task.runId)?.currentAttemptId ?? null,
      updatedAt: now, terminalAt: null,
    })) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal changed during failure projection");
    appendEvent(repositories, {
      goalId: snapshot.goal.goalId,
      eventType: "plan.step.task.failed",
      payload: { stepId: current.stepId, taskId: snapshot.task.taskId, taskStatus: snapshot.task.status, summary, blockerId: blocker.blockerId, blockerType, occurrenceCount: blocker.occurrenceCount },
      sourceRunId: snapshot.task.runId,
      sourceAttemptId: repositories.conversations.getRun(snapshot.task.runId)?.currentAttemptId ?? null,
      emittedAt: now,
    });
  }

  public finish(input: { workspaceId: string; conversationId: string; goalId: string; expectedExecutionRevision: number; expectedFlowRevision: number }): GoalExecutionView {
    const rows = this.#rows(input.goalId);
    assertOwned(rows.goal, input);
    if (rows.execution.revision !== input.expectedExecutionRevision) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed; read it again");
    if (!rows.stepExecutions.every((step) => step.status === "SUCCEEDED" || step.status === "SKIPPED")) {
      throw new GoalExecutorError("GOAL_EXECUTION_STATE_INVALID", "all required Plan steps must succeed before completion");
    }
    this.#base(rows.execution).finish({
      flowId: rows.execution.flowId,
      expectedRevision: input.expectedFlowRevision,
      state: projectedState({ ...rows, execution: { ...rows.execution, status: "SUCCEEDED", currentStepId: null, endedAt: this.#now() } }),
    }, ({ repositories, now }) => {
      const execution = repositories.goals.getExecution(rows.goal.goalId);
      const goal = repositories.goals.get(rows.goal.goalId);
      if (!execution || !goal || execution.revision !== input.expectedExecutionRevision) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed during completion");
      if (!repositories.goals.updateExecution({ goalId: execution.goalId, expectedRevision: execution.revision, status: "SUCCEEDED", currentStepId: null, updatedAt: now, endedAt: now })) {
        throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed during completion");
      }
      if (goal.status !== "ACTIVE") throw new GoalExecutorError("GOAL_EXECUTION_STATE_INVALID", `Goal cannot complete from ${goal.status}`);
      const updatedGoal = repositories.goals.updateGoal({
        goalId: goal.goalId, expectedRevision: goal.revision, status: "COMPLETED",
        lastNote: goal.lastNote, blockerFingerprint: null, consecutiveBlockerCount: 0,
        continuationCount: goal.continuationCount, planRevision: goal.planRevision,
        sourceRunId: goal.sourceRunId, sourceAttemptId: goal.sourceAttemptId,
        updatedAt: now, terminalAt: now,
      });
      if (!updatedGoal) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal changed during completion");
      appendEvent(repositories, { goalId: goal.goalId, eventType: "goal.execution.succeeded", payload: { flowId: execution.flowId, completedSteps: rows.stepExecutions.length }, emittedAt: now });
      appendEvent(repositories, { goalId: goal.goalId, eventType: "goal.completed", payload: { executor: true, completedSteps: rows.stepExecutions.length }, emittedAt: now });
    });
    return this.get(input);
  }

  public wait(input: { workspaceId: string; conversationId: string; goalId: string; expectedExecutionRevision: number; expectedFlowRevision: number; wait: unknown }): GoalExecutionView {
    const rows = this.#rows(input.goalId);
    assertOwned(rows.goal, input);
    if (rows.execution.revision !== input.expectedExecutionRevision) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed; read it again");
    const target = rows.stepExecutions.find((step) => step.status === "READY");
    if (!target) throw new GoalExecutorError("GOAL_EXECUTION_STATE_INVALID", "Goal execution has no READY step to wait");
    const projectedSteps = rows.stepExecutions.map((step) => step.stepId === target.stepId ? { ...step, status: "WAITING" as const } : step);
    this.#base(rows.execution).setWaiting({
      flowId: rows.execution.flowId, expectedRevision: input.expectedFlowRevision,
      currentStep: target.stepId, wait: input.wait,
      state: projectedState({ ...rows, execution: { ...rows.execution, status: "WAITING", currentStepId: target.stepId }, stepExecutions: projectedSteps }),
    }, ({ repositories, now }) => {
      const execution = repositories.goals.getExecution(rows.goal.goalId);
      const step = repositories.goals.getStepExecution(rows.goal.goalId, target.stepId, rows.execution.planRevision);
      if (!execution || !step || execution.revision !== input.expectedExecutionRevision || step.status !== "READY") throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed while waiting");
      if (!repositories.goals.updateStepExecution(stepMutation(step, {
        status: "WAITING", currentTaskId: null, updatedAt: now,
      }))) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Plan Step changed while waiting");
      if (!repositories.goals.updateExecution({ goalId: execution.goalId, expectedRevision: execution.revision, status: "WAITING", currentStepId: step.stepId, updatedAt: now, endedAt: null })) {
        throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed while waiting");
      }
      appendEvent(repositories, { goalId: execution.goalId, eventType: "goal.execution.waiting", payload: { stepId: step.stepId, wait: input.wait }, emittedAt: now });
    });
    return this.get(input);
  }

  public resume(input: { workspaceId: string; conversationId: string; goalId: string; expectedExecutionRevision: number; expectedFlowRevision: number }): GoalExecutionAdvanceResult {
    const rows = this.#rows(input.goalId);
    assertOwned(rows.goal, input);
    if (rows.execution.revision !== input.expectedExecutionRevision) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed; read it again");
    const target = rows.stepExecutions.find((step) => step.status === "WAITING");
    if (!target) {
      if (rows.stepExecutions.some((step) => step.status === "BLOCKED" || step.status === "FAILED")) {
        throw new GoalExecutorError("GOAL_EXECUTION_BLOCKER_REQUIRED", "BLOCKED or FAILED Steps require explicit blocker resolution or retry");
      }
      throw new GoalExecutorError("GOAL_EXECUTION_STATE_INVALID", "Goal execution has no WAITING Step");
    }
    const projectedSteps = rows.stepExecutions.map((step) => step.stepId === target.stepId ? { ...step, status: "READY" as const, currentTaskId: null } : step);
    this.#base(rows.execution).resume({
      flowId: rows.execution.flowId, expectedRevision: input.expectedFlowRevision, status: "QUEUED",
      currentStep: target.stepId,
      state: projectedState({ ...rows, execution: { ...rows.execution, status: "QUEUED", currentStepId: target.stepId }, stepExecutions: projectedSteps }),
    }, ({ repositories, now }) => {
      const execution = repositories.goals.getExecution(rows.goal.goalId);
      const step = repositories.goals.getStepExecution(rows.goal.goalId, target.stepId, rows.execution.planRevision);
      const plan = repositories.goals.getStep(rows.goal.goalId, target.stepId);
      const goal = repositories.goals.get(rows.goal.goalId);
      if (!execution || !step || !plan || !goal || execution.revision !== input.expectedExecutionRevision) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed during resume");
      if (!repositories.goals.updateStepExecution(stepMutation(step, {
        status: "READY", currentTaskId: null, completedAt: null, nextRetryAt: null, updatedAt: now,
      }))) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Plan Step changed during resume");
      if (this.#canProjectMutablePlanStep(repositories, goal, execution, step.stepId)
        && plan.status === "BLOCKED" && !repositories.goals.updateStep({
        goalId: plan.goalId, stepId: plan.stepId, expectedRevision: plan.revision,
        status: "IN_PROGRESS", note: plan.note, sourceRunId: plan.sourceRunId,
        sourceAttemptId: plan.sourceAttemptId, startedAt: plan.startedAt ?? now,
        completedAt: null, updatedAt: now,
      })) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Plan Step changed during resume");
      if (!repositories.goals.updateExecution({ goalId: execution.goalId, expectedRevision: execution.revision, status: "QUEUED", currentStepId: step.stepId, updatedAt: now, endedAt: null })) {
        throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed during resume");
      }
      if (goal.status === "BLOCKED") repositories.goals.updateGoal({
        goalId: goal.goalId, expectedRevision: goal.revision, status: "ACTIVE", lastNote: goal.lastNote,
        blockerFingerprint: null, consecutiveBlockerCount: 0, continuationCount: goal.continuationCount,
        planRevision: goal.planRevision, sourceRunId: goal.sourceRunId, sourceAttemptId: goal.sourceAttemptId,
        updatedAt: now, terminalAt: null,
      });
      appendEvent(repositories, { goalId: execution.goalId, eventType: "goal.execution.resumed", payload: { stepId: step.stepId, nextAttempt: step.attemptCount + 1 }, emittedAt: now });
    });
    return this.advance({ workspaceId: input.workspaceId, conversationId: input.conversationId, goalId: input.goalId });
  }

  #projectCancelled(goalId: string): boolean {
    return this.#state.transaction((repositories) => {
      const execution = repositories.goals.getExecution(goalId);
      const goal = repositories.goals.get(goalId);
      if (!execution || !goal) throw new GoalExecutorError("GOAL_EXECUTION_NOT_FOUND", "Goal execution not found during cancellation projection");
      const now = this.#now();
      let changed = false;
      if (!EXECUTION_TERMINAL.has(execution.status)) {
        if (!repositories.goals.updateExecution({
          goalId: execution.goalId, expectedRevision: execution.revision, status: "CANCELLED",
          currentStepId: execution.currentStepId, updatedAt: now, endedAt: now,
        })) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed during cancellation projection");
        changed = true;
      }
      for (const step of repositories.goals.listStepExecutions(goalId, execution.planRevision)) {
        if (["SUCCEEDED", "FAILED", "CANCELLED", "SKIPPED"].includes(step.status)) continue;
        if (!repositories.goals.updateStepExecution(stepMutation(step, {
          status: "CANCELLED", completedAt: now, nextRetryAt: null, updatedAt: now,
        }))) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Plan Step execution changed during cancellation projection");
        changed = true;
        const plan = repositories.goals.getStep(step.goalId, step.stepId);
        if (plan && plan.status !== "COMPLETED" && plan.status !== "CANCELLED") {
          if (!repositories.goals.updateStep({
            goalId: plan.goalId, stepId: plan.stepId, expectedRevision: plan.revision,
            status: "CANCELLED", note: plan.note, sourceRunId: plan.sourceRunId,
            sourceAttemptId: plan.sourceAttemptId, startedAt: plan.startedAt,
            completedAt: now, updatedAt: now,
          })) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Plan Step changed during cancellation projection");
        }
      }
      if (goal.status !== "COMPLETED" && goal.status !== "CANCELLED") {
        if (!repositories.goals.updateGoal({
          goalId: goal.goalId, expectedRevision: goal.revision, status: "CANCELLED", lastNote: goal.lastNote,
          blockerFingerprint: goal.blockerFingerprint, consecutiveBlockerCount: goal.consecutiveBlockerCount,
          continuationCount: goal.continuationCount, planRevision: goal.planRevision,
          sourceRunId: goal.sourceRunId, sourceAttemptId: goal.sourceAttemptId,
          updatedAt: now, terminalAt: now,
        })) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal changed during cancellation projection");
        changed = true;
      }
      if (changed) appendEvent(repositories, {
        goalId: goal.goalId, eventType: "goal.execution.cancelled", payload: { flowId: execution.flowId }, emittedAt: now,
      });
      return changed;
    });
  }

  public cancel(input: { workspaceId: string; conversationId: string; goalId: string; expectedExecutionRevision: number; expectedFlowRevision: number }): GoalExecutionView {
    const rows = this.#rows(input.goalId);
    assertOwned(rows.goal, input);
    if (rows.execution.revision !== input.expectedExecutionRevision) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed; read it again");
    this.#base(rows.execution).cancel({ flowId: rows.execution.flowId, expectedRevision: input.expectedFlowRevision });
    this.#projectCancelled(rows.goal.goalId);
    return this.get(input);
  }

  public fail(input: { workspaceId: string; conversationId: string; goalId: string; expectedExecutionRevision: number; expectedFlowRevision: number; summary: string }): GoalExecutionView {
    const rows = this.#rows(input.goalId);
    assertOwned(rows.goal, input);
    const summary = bounded(input.summary, "failure summary", 2_000);
    this.#base(rows.execution).fail({ flowId: rows.execution.flowId, expectedRevision: input.expectedFlowRevision, blockedSummary: summary }, ({ repositories, now }) => {
      const execution = repositories.goals.getExecution(rows.goal.goalId);
      const goal = repositories.goals.get(rows.goal.goalId);
      if (!execution || !goal || execution.revision !== input.expectedExecutionRevision) throw new GoalExecutorError("GOAL_EXECUTION_REVISION_CONFLICT", "Goal execution changed during failure");
      repositories.goals.updateExecution({ goalId: execution.goalId, expectedRevision: execution.revision, status: "FAILED", currentStepId: execution.currentStepId, updatedAt: now, endedAt: now });
      if (goal.status === "ACTIVE") repositories.goals.updateGoal({
        goalId: goal.goalId, expectedRevision: goal.revision, status: "BLOCKED", lastNote: summary,
        blockerFingerprint: goal.blockerFingerprint, consecutiveBlockerCount: goal.consecutiveBlockerCount,
        continuationCount: goal.continuationCount, planRevision: goal.planRevision,
        sourceRunId: goal.sourceRunId, sourceAttemptId: goal.sourceAttemptId,
        updatedAt: now, terminalAt: null,
      });
      appendEvent(repositories, { goalId: goal.goalId, eventType: "goal.execution.failed", payload: { flowId: execution.flowId, summary }, emittedAt: now });
    });
    return this.get(input);
  }

  public validateControllerDecision(goalId: string, expected?: {
    executionRevision?: number | null;
    stepRevision?: number | null;
    flowRevision?: number | null;
  }): void {
    this.#assertControllerSnapshot(this.#rows(goalId), expected);
  }

  public controllerForFlow(flowId: string, expected?: {
    workspaceId: string;
    ownerKey: string;
    controllerId: string;
    expectedExecutionRevision?: number | null;
    expectedStepRevision?: number | null;
    expectedFlowRevision?: number | null;
    deliveryId?: string;
  }): TaskFlowControllerRuntime | null {
    const view = this.getByFlow(flowId);
    if (!view) return null;
    if (expected && (view.execution.workspaceId !== expected.workspaceId
      || view.execution.conversationId !== expected.ownerKey
      || view.execution.controllerId !== expected.controllerId)) {
      throw new GoalExecutorError("GOAL_EXECUTION_ACCESS_DENIED", "Goal execution Flow belongs to a different controller identity");
    }
    const rows = this.#rows(view.goal.goalId);
    const snapshot = expected ? {
      executionRevision: expected.expectedExecutionRevision ?? null,
      stepRevision: expected.expectedStepRevision ?? null,
      flowRevision: expected.expectedFlowRevision ?? null,
    } : undefined;
    const base = this.#base(rows.execution);
    return new GoalPlanControllerRuntime(this, base, view.goal.goalId, snapshot);
  }

  public recover(): GoalExecutionRecoveryResult {
    const executions = this.#state.transaction((repositories) => repositories.goals.listActiveExecutions(1_000));
    let reconciled = 0, admitted = 0, scheduled = 0, blocked = 0, failed = 0;
    for (const execution of executions) {
      try {
        const before = this.get({ workspaceId: execution.workspaceId, conversationId: execution.conversationId, goalId: execution.goalId });
        if (before.flow.flow.status === "CANCELLED") {
          if (this.#projectCancelled(execution.goalId)) reconciled += 1;
          continue;
        }
        const current = before.execution.currentStepId ? before.steps.find((step) => step.stepId === before.execution.currentStepId) : undefined;
        if (current?.currentTaskId) {
          const task = this.#tasks.get({ workspaceId: execution.workspaceId, taskId: current.currentTaskId }).task;
          if (TASK_TERMINAL.has(task.status)) { this.reconcileTask(task.taskId); reconciled += 1; }
        }
        const result = this.advance({ workspaceId: execution.workspaceId, conversationId: execution.conversationId, goalId: execution.goalId });
        if (result.action === "ADMITTED") admitted += 1;
        if (result.scheduled) scheduled += 1;
        if (result.action === "BLOCKED") blocked += 1;
      } catch {
        failed += 1;
      }
    }
    return { scanned: executions.length, reconciled, admitted, scheduled, blocked, failed };
  }

  public runNextFromController(input: { flowId: string; expectedRevision: number; requestKey: string; stepKey: string; text: string }): TaskFlowChildAdmissionResult {
    const view = this.getByFlow(input.flowId);
    if (!view) throw new GoalExecutorError("GOAL_EXECUTION_NOT_FOUND", "Goal execution not found for Flow");
    const rows = this.#rows(view.goal.goalId);
    if (rows.stepExecutions.some((step) => step.status === "READY")) {
      return this.#admitReady(rows, input).admission;
    }
    const running = rows.stepExecutions.find((step) => step.status === "RUNNING" && step.currentTaskId !== null);
    const plan = running ? rows.planSteps.find((step) => step.stepId === running.stepId) : null;
    if (!running || !plan) throw new GoalExecutorError("GOAL_EXECUTION_STATE_INVALID", "goal execution has no READY or replayable RUNNING step");
    const expectedRequestKey = requestKey(rows.goal.goalId, rows.execution.planRevision, running.stepId, running.attemptCount);
    const expectedText = taskText(rows.goal, plan, rows.planSteps.length);
    if (input.requestKey !== expectedRequestKey || input.stepKey !== running.stepId || input.text !== expectedText) {
      throw new GoalExecutorError("GOAL_EXECUTION_REQUEST_CONFLICT", "controller child replay does not match the active durable Plan step");
    }
    return this.#base(rows.execution).runTask(input);
  }
}

class GoalPlanControllerRuntime implements TaskFlowControllerRuntime {
  public constructor(
    private readonly service: GoalPlanExecutorService,
    private readonly base: BoundTaskFlowControllerRuntime,
    private readonly goalId: string,
    private readonly expected?: { executionRevision?: number | null; stepRevision?: number | null; flowRevision?: number | null },
  ) {}

  private guard(): void { this.service.validateControllerDecision(this.goalId, this.expected); }

  get(flowId: string) { return this.base.get(flowId); }
  runTask(input: { flowId: string; expectedRevision: number; requestKey: string; stepKey: string; text: string; state?: unknown }): TaskFlowChildAdmissionResult {
    this.guard();
    return this.service.runNextFromController(input);
  }
  setWaiting(input: { flowId: string; expectedRevision: number; currentStep?: string | null; state?: unknown; wait?: unknown }) {
    this.guard();
    const view = this.service.getByFlow(input.flowId)!;
    return this.service.wait({ workspaceId: view.execution.workspaceId, conversationId: view.execution.conversationId, goalId: this.goalId, expectedExecutionRevision: view.execution.revision, expectedFlowRevision: input.expectedRevision, wait: input.wait }).flow.flow;
  }
  setBlocked(input: { flowId: string; expectedRevision: number; currentStep?: string | null; state?: unknown; blockedTaskId: string; blockedSummary?: string | null }) {
    this.guard();
    const view = this.service.getByFlow(input.flowId)!;
    if (view.execution.status !== "BLOCKED") throw new GoalExecutorError("GOAL_EXECUTION_STATE_INVALID", "Goal execution is not BLOCKED");
    return this.base.setBlocked(input);
  }
  resume(input: { flowId: string; expectedRevision: number; status?: "QUEUED" | "RUNNING"; currentStep?: string | null; state?: unknown }) {
    this.guard();
    const view = this.service.getByFlow(input.flowId)!;
    return this.service.resume({ workspaceId: view.execution.workspaceId, conversationId: view.execution.conversationId, goalId: this.goalId, expectedExecutionRevision: view.execution.revision, expectedFlowRevision: input.expectedRevision }).view.flow.flow;
  }
  finish(input: { flowId: string; expectedRevision: number; state?: unknown }) {
    this.guard();
    const view = this.service.getByFlow(input.flowId)!;
    return this.service.finish({ workspaceId: view.execution.workspaceId, conversationId: view.execution.conversationId, goalId: this.goalId, expectedExecutionRevision: view.execution.revision, expectedFlowRevision: input.expectedRevision }).flow.flow;
  }
  fail(input: { flowId: string; expectedRevision: number; state?: unknown; blockedSummary?: string | null }) {
    this.guard();
    const view = this.service.getByFlow(input.flowId)!;
    return this.service.fail({ workspaceId: view.execution.workspaceId, conversationId: view.execution.conversationId, goalId: this.goalId, expectedExecutionRevision: view.execution.revision, expectedFlowRevision: input.expectedRevision, summary: input.blockedSummary ?? "Goal Plan executor failed" }).flow.flow;
  }
  requestCancel(input: { flowId: string; expectedRevision: number }) { this.guard(); return this.base.requestCancel(input); }
  cancel(input: { flowId: string; expectedRevision: number }) {
    this.guard();
    const view = this.service.getByFlow(input.flowId)!;
    const before = view.flow.tasks.filter((entry) => !TASK_TERMINAL.has(entry.task.status)).length;
    const cancelled = this.service.cancel({ workspaceId: view.execution.workspaceId, conversationId: view.execution.conversationId, goalId: this.goalId, expectedExecutionRevision: view.execution.revision, expectedFlowRevision: input.expectedRevision });
    return { flow: cancelled.flow, affectedTasks: before, replayed: false };
  }
}
