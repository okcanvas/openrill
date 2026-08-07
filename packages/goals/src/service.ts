import { createHash, randomUUID } from "node:crypto";
import type {
  LedgerGoalRow,
  LedgerGoalStatus,
  LedgerPlanStepRow,
  LedgerPlanStepStatus,
  OpenRillStateDatabase,
  StateRepositories,
} from "@openrill/state";
import { GoalError } from "./errors.js";
import type { GoalEvent, GoalPlanStep, GoalRecord, GoalStatus, GoalView, PlanStepStatus } from "./types.js";

export const GOAL_SYSTEM_INSTRUCTIONS = `## Durable Goal and Plan
When the user explicitly asks for a multi-turn objective, create one durable goal and a concise ordered plan. On every turn with an active goal, advance the first unfinished step instead of merely restating the plan. Read the injected goal context before acting. Update a step only after evidence exists. Mark the goal complete only after every plan step is complete. Report a blocker honestly; the same blocker must recur three consecutive goal turns before the goal becomes BLOCKED. Pause, resume, or cancel only when the user explicitly requests that control action. Goal updates do not replace the visible final response.`;

const GOAL_TRANSITIONS: Readonly<Record<GoalStatus, ReadonlySet<GoalStatus>>> = {
  ACTIVE: new Set(["PAUSED", "BLOCKED", "COMPLETED", "CANCELLED"]),
  PAUSED: new Set(["ACTIVE", "CANCELLED"]),
  BLOCKED: new Set(["ACTIVE", "CANCELLED"]),
  COMPLETED: new Set(),
  CANCELLED: new Set(),
};

const STEP_TRANSITIONS: Readonly<Record<PlanStepStatus, ReadonlySet<PlanStepStatus>>> = {
  PENDING: new Set(["IN_PROGRESS", "COMPLETED", "CANCELLED"]),
  IN_PROGRESS: new Set(["BLOCKED", "COMPLETED", "CANCELLED"]),
  BLOCKED: new Set(["IN_PROGRESS", "CANCELLED"]),
  COMPLETED: new Set(),
  CANCELLED: new Set(),
};

function bounded(value: string, label: string, max: number): string {
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  if (!normalized || normalized.length > max) {
    throw new GoalError("GOAL_INPUT_INVALID", `${label} must contain 1-${max} characters`);
  }
  return normalized;
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value.normalize("NFKC").toLocaleLowerCase("en-US"), "utf8").digest("hex");
}

function toStep(value: LedgerPlanStepRow): GoalPlanStep {
  return {
    stepId: value.stepId,
    ordinal: value.ordinal,
    title: value.title,
    status: value.status,
    note: value.note,
    provenance: { runId: value.sourceRunId, attemptId: value.sourceAttemptId },
    startedAt: value.startedAt,
    completedAt: value.completedAt,
    updatedAt: value.updatedAt,
    revision: value.revision,
  };
}

function toGoal(value: LedgerGoalRow, steps: readonly LedgerPlanStepRow[]): GoalRecord {
  return {
    goalId: value.goalId,
    workspaceId: value.workspaceId,
    conversationId: value.conversationId,
    objective: value.objective,
    status: value.status,
    lastNote: value.lastNote,
    consecutiveBlockerCount: value.consecutiveBlockerCount,
    continuationCount: value.continuationCount,
    planRevision: value.planRevision,
    provenance: { runId: value.sourceRunId, attemptId: value.sourceAttemptId },
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    terminalAt: value.terminalAt,
    revision: value.revision,
    steps: steps.map(toStep),
  };
}

function provenance(repositories: StateRepositories, input: {
  workspaceId: string;
  conversationId: string;
  sourceRunId?: string | null;
  sourceAttemptId?: string | null;
}): void {
  const conversation = repositories.conversations.getConversation(input.conversationId);
  if (!conversation || conversation.workspaceId !== input.workspaceId) {
    throw new GoalError("GOAL_PROVENANCE_INVALID", "goal conversation does not belong to the workspace");
  }
  if (input.sourceRunId) {
    const run = repositories.conversations.getRun(input.sourceRunId);
    if (!run || run.conversationId !== input.conversationId) {
      throw new GoalError("GOAL_PROVENANCE_INVALID", "goal source Run does not belong to the conversation");
    }
  }
  if (input.sourceAttemptId) {
    const attempt = repositories.conversations.getAttempt(input.sourceAttemptId);
    if (!attempt || attempt.runId !== input.sourceRunId) {
      throw new GoalError("GOAL_PROVENANCE_INVALID", "goal source Attempt does not belong to the source Run");
    }
  }
}


function assertExecutionNotActive(repositories: StateRepositories, goalId: string): void {
  const execution = repositories.goals.getExecution(goalId);
  if (execution) {
    throw new GoalError(
      "GOAL_EXECUTION_ACTIVE",
      "goal and plan mutations are owned by the durable Goal execution; use goalExecution controls",
    );
  }
}

function snapshotPlan(
  repositories: StateRepositories,
  goalId: string,
  planRevision: number,
  steps: readonly LedgerPlanStepRow[],
  createdAt: number,
): void {
  for (const step of steps) repositories.goals.insertPlanRevisionStep({
    goalId,
    planRevision,
    stepId: step.stepId,
    ordinal: step.ordinal,
    title: step.title,
    required: true,
    retryMode: "MANUAL",
    maxAttempts: 3,
    createdAt,
  });
}

function appendEvent(repositories: StateRepositories, input: {
  goalId: string;
  eventType: string;
  payload: unknown;
  sourceRunId: string | null;
  sourceAttemptId: string | null;
  emittedAt: number;
}): void {
  repositories.goals.appendEvent({
    ...input,
    sequence: repositories.goals.nextEventSequence(input.goalId),
  });
}

function renderContext(row: LedgerGoalRow, steps: readonly LedgerPlanStepRow[]): string {
  const compactSteps = steps.slice(0, 20).map((step) => `${step.ordinal}. [${step.status}] ${step.title}`).join("\n");
  return `\n\n## Active Goal Context\nGoal ID: ${row.goalId}\nGoal revision: ${row.revision}\nObjective: ${row.objective}\nContinuation turn: ${row.continuationCount}\nPlan revision: ${row.planRevision}\n${compactSteps ? `Plan:\n${compactSteps}\n` : "Plan: not set\n"}Advance the first unfinished step. Do not claim completion without durable step evidence.`;
}

export class GoalService {
  readonly #now: () => number;
  readonly #createId: () => string;

  public constructor(private readonly state: OpenRillStateDatabase, options: {
    readonly now?: () => number;
    readonly createId?: () => string;
  } = {}) {
    this.#now = options.now ?? Date.now;
    this.#createId = options.createId ?? randomUUID;
  }

  public create(input: {
    readonly workspaceId: string;
    readonly conversationId: string;
    readonly objective: string;
    readonly steps?: readonly string[];
    readonly sourceRunId?: string | null;
    readonly sourceAttemptId?: string | null;
  }): GoalRecord {
    const objective = bounded(input.objective, "goal objective", 4000);
    const titles = (input.steps ?? []).map((title) => bounded(title, "plan step", 1000));
    if (titles.length > 20) throw new GoalError("GOAL_PLAN_INVALID", "goal plan supports at most 20 steps");
    const normalized = new Set(titles.map((title) => title.normalize("NFKC").toLocaleLowerCase("en-US")));
    if (normalized.size !== titles.length) throw new GoalError("GOAL_PLAN_INVALID", "goal plan steps must be unique");
    return this.state.transaction((repositories) => {
      provenance(repositories, input);
      if (repositories.goals.getOpen(input.conversationId)) {
        throw new GoalError("GOAL_ALREADY_OPEN", "conversation already has an open goal");
      }
      const now = this.#now();
      const row: LedgerGoalRow = {
        goalId: this.#createId(), workspaceId: input.workspaceId, conversationId: input.conversationId,
        objective, status: "ACTIVE", lastNote: null, blockerFingerprint: null,
        consecutiveBlockerCount: 0, continuationCount: 0, planRevision: 1,
        sourceRunId: input.sourceRunId ?? null, sourceAttemptId: input.sourceAttemptId ?? null,
        createdAt: now, updatedAt: now, terminalAt: null, revision: 1,
      };
      repositories.goals.insertGoal(row);
      const steps = titles.map((title, index): LedgerPlanStepRow => ({
        stepId: this.#createId(), goalId: row.goalId, ordinal: index + 1, title,
        status: "PENDING", note: null, sourceRunId: input.sourceRunId ?? null,
        sourceAttemptId: input.sourceAttemptId ?? null, startedAt: null, completedAt: null,
        updatedAt: now, revision: 1,
      }));
      for (const step of steps) repositories.goals.insertStep(step);
      snapshotPlan(repositories, row.goalId, row.planRevision, steps, now);
      appendEvent(repositories, {
        goalId: row.goalId, eventType: "goal.created",
        payload: { objective, planSteps: steps.length },
        sourceRunId: row.sourceRunId, sourceAttemptId: row.sourceAttemptId, emittedAt: now,
      });
      return toGoal(row, steps);
    });
  }

  public current(input: { readonly workspaceId: string; readonly conversationId: string }): GoalView | null {
    return this.state.transaction((repositories) => {
      provenance(repositories, input);
      const row = repositories.goals.getOpen(input.conversationId) ?? repositories.goals.getLatest(input.conversationId);
      if (!row || row.workspaceId !== input.workspaceId) return null;
      return {
        goal: toGoal(row, repositories.goals.listSteps(row.goalId)),
        recentEvents: repositories.goals.listEvents(row.goalId, 20).map((event): GoalEvent => ({
          sequence: event.sequence, eventType: event.eventType, payload: event.payload,
          provenance: { runId: event.sourceRunId, attemptId: event.sourceAttemptId }, emittedAt: event.emittedAt,
        })),
      };
    });
  }

  public setPlan(input: {
    readonly workspaceId: string;
    readonly conversationId: string;
    readonly goalId: string;
    readonly expectedGoalRevision: number;
    readonly steps: readonly string[];
    readonly sourceRunId?: string | null;
    readonly sourceAttemptId?: string | null;
  }): GoalRecord {
    const titles = input.steps.map((title) => bounded(title, "plan step", 1000));
    if (titles.length < 1 || titles.length > 20) throw new GoalError("GOAL_PLAN_INVALID", "plan must contain 1-20 steps");
    const normalized = new Set(titles.map((title) => title.normalize("NFKC").toLocaleLowerCase("en-US")));
    if (normalized.size !== titles.length) throw new GoalError("GOAL_PLAN_INVALID", "goal plan steps must be unique");
    return this.state.transaction((repositories) => {
      provenance(repositories, input);
      const row = repositories.goals.get(input.goalId);
      if (!row || row.workspaceId !== input.workspaceId || row.conversationId !== input.conversationId) throw new GoalError("GOAL_NOT_FOUND", "goal not found");
      assertExecutionNotActive(repositories, row.goalId);
      if (row.status !== "ACTIVE" || row.revision !== input.expectedGoalRevision) throw new GoalError("GOAL_REVISION_CONFLICT", "goal revision or status changed; read the goal again");
      if (repositories.goals.listSteps(row.goalId).length > 0) throw new GoalError("GOAL_PLAN_INVALID", "goal plan already exists");
      const now = this.#now();
      const steps = titles.map((title, index): LedgerPlanStepRow => ({
        stepId: this.#createId(), goalId: row.goalId, ordinal: index + 1, title,
        status: "PENDING", note: null, sourceRunId: input.sourceRunId ?? null,
        sourceAttemptId: input.sourceAttemptId ?? null, startedAt: null, completedAt: null,
        updatedAt: now, revision: 1,
      }));
      for (const step of steps) repositories.goals.insertStep(step);
      const updated = repositories.goals.updateGoal({
        goalId: row.goalId, expectedRevision: row.revision, status: row.status,
        lastNote: row.lastNote, blockerFingerprint: row.blockerFingerprint,
        consecutiveBlockerCount: row.consecutiveBlockerCount, continuationCount: row.continuationCount,
        planRevision: row.planRevision + 1, sourceRunId: input.sourceRunId ?? null,
        sourceAttemptId: input.sourceAttemptId ?? null, updatedAt: now, terminalAt: null,
      });
      if (!updated) throw new GoalError("GOAL_REVISION_CONFLICT", "goal changed while setting the plan");
      snapshotPlan(repositories, row.goalId, updated.planRevision, steps, now);
      appendEvent(repositories, { goalId: row.goalId, eventType: "plan.created", payload: { steps: steps.length, planRevision: updated.planRevision }, sourceRunId: input.sourceRunId ?? null, sourceAttemptId: input.sourceAttemptId ?? null, emittedAt: now });
      return toGoal(updated, steps);
    });
  }

  public updateStep(input: {
    readonly workspaceId: string;
    readonly conversationId: string;
    readonly goalId: string;
    readonly stepId: string;
    readonly expectedGoalRevision: number;
    readonly expectedStepRevision: number;
    readonly status: PlanStepStatus;
    readonly note?: string | null;
    readonly sourceRunId?: string | null;
    readonly sourceAttemptId?: string | null;
  }): GoalRecord {
    const note = input.note ? bounded(input.note, "step note", 2000) : null;
    return this.state.transaction((repositories) => {
      provenance(repositories, input);
      const row = repositories.goals.get(input.goalId);
      if (!row || row.workspaceId !== input.workspaceId || row.conversationId !== input.conversationId) throw new GoalError("GOAL_NOT_FOUND", "goal not found");
      assertExecutionNotActive(repositories, row.goalId);
      if (row.status !== "ACTIVE" || row.revision !== input.expectedGoalRevision) throw new GoalError("GOAL_REVISION_CONFLICT", "goal revision or status changed; read the goal again");
      const steps = repositories.goals.listSteps(row.goalId);
      const target = steps.find((step) => step.stepId === input.stepId);
      if (!target) throw new GoalError("GOAL_PLAN_INVALID", "plan step not found");
      if (target.revision !== input.expectedStepRevision) throw new GoalError("GOAL_REVISION_CONFLICT", "plan step changed; read the goal again");
      if (!STEP_TRANSITIONS[target.status].has(input.status)) throw new GoalError("GOAL_TRANSITION_INVALID", `plan step cannot transition from ${target.status} to ${input.status}`);
      if ((input.status === "IN_PROGRESS" || input.status === "COMPLETED") && steps.some((step) => step.ordinal < target.ordinal && step.status !== "COMPLETED" && step.status !== "CANCELLED")) {
        throw new GoalError("GOAL_PLAN_INVALID", "earlier plan steps must be completed before advancing this step");
      }
      const now = this.#now();
      const updatedStep = repositories.goals.updateStep({
        goalId: row.goalId, stepId: target.stepId, expectedRevision: target.revision,
        status: input.status, note, sourceRunId: input.sourceRunId ?? null,
        sourceAttemptId: input.sourceAttemptId ?? null,
        startedAt: target.startedAt ?? ((input.status === "IN_PROGRESS" || input.status === "COMPLETED") ? now : null),
        completedAt: input.status === "COMPLETED" ? now : target.completedAt,
        updatedAt: now,
      });
      if (!updatedStep) throw new GoalError("GOAL_REVISION_CONFLICT", "plan step changed during update");
      const updatedGoal = repositories.goals.updateGoal({
        goalId: row.goalId, expectedRevision: row.revision, status: row.status,
        lastNote: note ?? row.lastNote, blockerFingerprint: null, consecutiveBlockerCount: 0,
        continuationCount: row.continuationCount, planRevision: row.planRevision + 1,
        sourceRunId: input.sourceRunId ?? null, sourceAttemptId: input.sourceAttemptId ?? null,
        updatedAt: now, terminalAt: null,
      });
      if (!updatedGoal) throw new GoalError("GOAL_REVISION_CONFLICT", "goal changed during plan update");
      const revisedSteps = repositories.goals.listSteps(row.goalId);
      snapshotPlan(repositories, row.goalId, updatedGoal.planRevision, revisedSteps, now);
      appendEvent(repositories, { goalId: row.goalId, eventType: "plan.step.updated", payload: { stepId: target.stepId, from: target.status, to: input.status, note, planRevision: updatedGoal.planRevision }, sourceRunId: input.sourceRunId ?? null, sourceAttemptId: input.sourceAttemptId ?? null, emittedAt: now });
      return toGoal(updatedGoal, revisedSteps);
    });
  }

  public reportBlocker(input: {
    readonly workspaceId: string;
    readonly conversationId: string;
    readonly goalId: string;
    readonly expectedGoalRevision: number;
    readonly note: string;
    readonly sourceRunId?: string | null;
    readonly sourceAttemptId?: string | null;
  }): GoalRecord {
    const note = bounded(input.note, "blocker note", 2000);
    const blockFingerprint = fingerprint(note);
    return this.state.transaction((repositories) => {
      provenance(repositories, input);
      const row = repositories.goals.get(input.goalId);
      if (!row || row.workspaceId !== input.workspaceId || row.conversationId !== input.conversationId) throw new GoalError("GOAL_NOT_FOUND", "goal not found");
      assertExecutionNotActive(repositories, row.goalId);
      if (row.status !== "ACTIVE" || row.revision !== input.expectedGoalRevision) throw new GoalError("GOAL_REVISION_CONFLICT", "goal revision or status changed; read the goal again");
      const count = row.blockerFingerprint === blockFingerprint ? row.consecutiveBlockerCount + 1 : 1;
      const status: GoalStatus = count >= 3 ? "BLOCKED" : "ACTIVE";
      const now = this.#now();
      const updated = repositories.goals.updateGoal({
        goalId: row.goalId, expectedRevision: row.revision, status,
        lastNote: note, blockerFingerprint: blockFingerprint, consecutiveBlockerCount: count,
        continuationCount: row.continuationCount, planRevision: row.planRevision,
        sourceRunId: input.sourceRunId ?? null, sourceAttemptId: input.sourceAttemptId ?? null,
        updatedAt: now, terminalAt: null,
      });
      if (!updated) throw new GoalError("GOAL_REVISION_CONFLICT", "goal changed while recording blocker");
      appendEvent(repositories, { goalId: row.goalId, eventType: status === "BLOCKED" ? "goal.blocked" : "goal.blocker.observed", payload: { note, consecutiveCount: count }, sourceRunId: input.sourceRunId ?? null, sourceAttemptId: input.sourceAttemptId ?? null, emittedAt: now });
      return toGoal(updated, repositories.goals.listSteps(row.goalId));
    });
  }

  public control(input: {
    readonly workspaceId: string;
    readonly conversationId: string;
    readonly goalId: string;
    readonly expectedGoalRevision: number;
    readonly action: "PAUSE" | "RESUME" | "CANCEL";
    readonly note?: string | null;
    readonly sourceRunId?: string | null;
    readonly sourceAttemptId?: string | null;
  }): GoalRecord {
    const note = input.note ? bounded(input.note, "goal note", 2000) : null;
    return this.state.transaction((repositories) => {
      provenance(repositories, input);
      const row = repositories.goals.get(input.goalId);
      if (!row || row.workspaceId !== input.workspaceId || row.conversationId !== input.conversationId) throw new GoalError("GOAL_NOT_FOUND", "goal not found");
      assertExecutionNotActive(repositories, row.goalId);
      if (row.revision !== input.expectedGoalRevision) throw new GoalError("GOAL_REVISION_CONFLICT", "goal changed; read the goal again");
      const status: GoalStatus = input.action === "PAUSE" ? "PAUSED" : input.action === "RESUME" ? "ACTIVE" : "CANCELLED";
      if (!GOAL_TRANSITIONS[row.status].has(status)) throw new GoalError("GOAL_TRANSITION_INVALID", `goal cannot transition from ${row.status} to ${status}`);
      const now = this.#now();
      const updated = repositories.goals.updateGoal({
        goalId: row.goalId, expectedRevision: row.revision, status, lastNote: note ?? row.lastNote,
        blockerFingerprint: status === "ACTIVE" ? null : row.blockerFingerprint,
        consecutiveBlockerCount: status === "ACTIVE" ? 0 : row.consecutiveBlockerCount,
        continuationCount: row.continuationCount, planRevision: row.planRevision,
        sourceRunId: input.sourceRunId ?? null, sourceAttemptId: input.sourceAttemptId ?? null,
        updatedAt: now, terminalAt: status === "CANCELLED" ? now : null,
      });
      if (!updated) throw new GoalError("GOAL_REVISION_CONFLICT", "goal changed during control action");
      appendEvent(repositories, { goalId: row.goalId, eventType: `goal.${input.action.toLocaleLowerCase("en-US")}`, payload: { note }, sourceRunId: input.sourceRunId ?? null, sourceAttemptId: input.sourceAttemptId ?? null, emittedAt: now });
      return toGoal(updated, repositories.goals.listSteps(row.goalId));
    });
  }

  public complete(input: {
    readonly workspaceId: string;
    readonly conversationId: string;
    readonly goalId: string;
    readonly expectedGoalRevision: number;
    readonly note?: string | null;
    readonly sourceRunId?: string | null;
    readonly sourceAttemptId?: string | null;
  }): GoalRecord {
    const note = input.note ? bounded(input.note, "completion note", 2000) : null;
    return this.state.transaction((repositories) => {
      provenance(repositories, input);
      const row = repositories.goals.get(input.goalId);
      if (!row || row.workspaceId !== input.workspaceId || row.conversationId !== input.conversationId) throw new GoalError("GOAL_NOT_FOUND", "goal not found");
      assertExecutionNotActive(repositories, row.goalId);
      if (row.status !== "ACTIVE" || row.revision !== input.expectedGoalRevision) throw new GoalError("GOAL_REVISION_CONFLICT", "goal revision or status changed; read the goal again");
      const steps = repositories.goals.listSteps(row.goalId);
      if (steps.some((step) => step.status !== "COMPLETED")) {
        throw new GoalError("GOAL_COMPLETION_UNPROVEN", "every plan step must be completed before the goal can complete");
      }
      const now = this.#now();
      const updated = repositories.goals.updateGoal({
        goalId: row.goalId, expectedRevision: row.revision, status: "COMPLETED",
        lastNote: note ?? row.lastNote, blockerFingerprint: null, consecutiveBlockerCount: 0,
        continuationCount: row.continuationCount, planRevision: row.planRevision,
        sourceRunId: input.sourceRunId ?? null, sourceAttemptId: input.sourceAttemptId ?? null,
        updatedAt: now, terminalAt: now,
      });
      if (!updated) throw new GoalError("GOAL_REVISION_CONFLICT", "goal changed during completion");
      appendEvent(repositories, { goalId: row.goalId, eventType: "goal.completed", payload: { note, completedSteps: steps.length }, sourceRunId: input.sourceRunId ?? null, sourceAttemptId: input.sourceAttemptId ?? null, emittedAt: now });
      return toGoal(updated, steps);
    });
  }

  public prepareContext(input: {
    readonly workspaceId: string;
    readonly conversationId: string;
    readonly sourceRunId: string;
    readonly sourceAttemptId: string;
  }): string | null {
    return this.state.transaction((repositories) => {
      provenance(repositories, input);
      const row = repositories.goals.getOpen(input.conversationId);
      if (!row || row.workspaceId !== input.workspaceId || row.status !== "ACTIVE") return null;
      const now = this.#now();
      const updated = repositories.goals.updateGoal({
        goalId: row.goalId, expectedRevision: row.revision, status: row.status,
        lastNote: row.lastNote, blockerFingerprint: row.blockerFingerprint,
        consecutiveBlockerCount: row.consecutiveBlockerCount,
        continuationCount: row.continuationCount + 1, planRevision: row.planRevision,
        sourceRunId: input.sourceRunId, sourceAttemptId: input.sourceAttemptId,
        updatedAt: now, terminalAt: null,
      });
      if (!updated) throw new GoalError("GOAL_REVISION_CONFLICT", "goal changed while preparing continuation context");
      const steps = repositories.goals.listSteps(row.goalId);
      appendEvent(repositories, { goalId: row.goalId, eventType: "goal.continued", payload: { continuationCount: updated.continuationCount, runId: input.sourceRunId }, sourceRunId: input.sourceRunId, sourceAttemptId: input.sourceAttemptId, emittedAt: now });
      return renderContext(updated, steps);
    });
  }

  public readContext(input: {
    readonly workspaceId: string;
    readonly conversationId: string;
  }): string | null {
    return this.state.transaction((repositories) => {
      provenance(repositories, input);
      const row = repositories.goals.getOpen(input.conversationId);
      if (!row || row.workspaceId !== input.workspaceId || row.status !== "ACTIVE") return null;
      return renderContext(row, repositories.goals.listSteps(row.goalId));
    });
  }
}
