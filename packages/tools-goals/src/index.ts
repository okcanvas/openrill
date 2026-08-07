import { GoalError, type GoalService, type PlanStepStatus } from "@openrill/goals";
import type { RegisteredTool, ToolExecutionContext, ToolExecutionResult, ToolRegistry } from "@openrill/tool-runtime";

export const PACKAGE_NAME = "@openrill/tools-goals" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "TOOLS_GOALS" as const;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function hasOnly(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}
function stringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}
function scope(context: ToolExecutionContext) {
  if (!context.conversationId) throw new GoalError("GOAL_PROVENANCE_INVALID", "goal tool requires a Conversation");
  return {
    workspaceId: context.workspaceId,
    conversationId: context.conversationId,
    sourceRunId: context.runId,
    sourceAttemptId: context.attemptId,
  } as const;
}
async function execute(action: () => unknown): Promise<ToolExecutionResult> {
  try { return { output: await action(), isError: false }; }
  catch (error) {
    if (error instanceof GoalError) return { output: { error: { code: error.code, message: error.message } }, isError: true };
    throw error;
  }
}

export function createGoalTools(goals: GoalService): RegisteredTool[] {
  const create: RegisteredTool = {
    name: "goal.create",
    description: "Create one durable multi-turn goal for the current Conversation only when the user explicitly requests an ongoing objective. Optionally include an ordered plan.",
    inputSchema: { type: "object", additionalProperties: false, properties: { objective: { type: "string", minLength: 1, maxLength: 4000 }, steps: { type: "array", minItems: 1, maxItems: 20, items: { type: "string", minLength: 1, maxLength: 1000 } } }, required: ["objective"] },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isRecord(value) && hasOnly(value, ["objective", "steps"]) && typeof value.objective === "string" && value.objective.trim().length > 0 && (value.steps === undefined || stringArray(value.steps)),
    execute: (input, context) => execute(() => goals.create({ ...scope(context), objective: input.objective as string, ...(input.steps ? { steps: input.steps as readonly string[] } : {}) })),
  };
  const get: RegisteredTool = {
    name: "goal.get",
    description: "Read the current durable goal, revisioned plan, status, blocker count, provenance, and recent progress events for this Conversation.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isRecord(value) && Object.keys(value).length === 0,
    execute: (_input, context) => execute(() => goals.current(scope(context))),
  };
  const setPlan: RegisteredTool = {
    name: "plan.set",
    description: "Set the initial ordered plan for an active goal that does not yet have plan steps. Uses goal revision compare-and-swap.",
    inputSchema: { type: "object", additionalProperties: false, properties: { goalId: { type: "string", minLength: 1, maxLength: 128 }, expectedGoalRevision: { type: "integer", minimum: 1 }, steps: { type: "array", minItems: 1, maxItems: 20, items: { type: "string", minLength: 1, maxLength: 1000 } } }, required: ["goalId", "expectedGoalRevision", "steps"] },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isRecord(value) && hasOnly(value, ["goalId", "expectedGoalRevision", "steps"]) && typeof value.goalId === "string" && Number.isInteger(value.expectedGoalRevision) && stringArray(value.steps),
    execute: (input, context) => execute(() => goals.setPlan({ ...scope(context), goalId: input.goalId as string, expectedGoalRevision: input.expectedGoalRevision as number, steps: input.steps as readonly string[] })),
  };
  const updateStep: RegisteredTool = {
    name: "plan.update",
    description: "Advance one exact plan step using goal and step revision compare-and-swap. Do this only after concrete evidence exists.",
    inputSchema: { type: "object", additionalProperties: false, properties: { goalId: { type: "string", minLength: 1, maxLength: 128 }, stepId: { type: "string", minLength: 1, maxLength: 128 }, expectedGoalRevision: { type: "integer", minimum: 1 }, expectedStepRevision: { type: "integer", minimum: 1 }, status: { type: "string", enum: ["IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"] }, note: { type: "string", minLength: 1, maxLength: 2000 } }, required: ["goalId", "stepId", "expectedGoalRevision", "expectedStepRevision", "status"] },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isRecord(value) && hasOnly(value, ["goalId", "stepId", "expectedGoalRevision", "expectedStepRevision", "status", "note"]) && typeof value.goalId === "string" && typeof value.stepId === "string" && Number.isInteger(value.expectedGoalRevision) && Number.isInteger(value.expectedStepRevision) && typeof value.status === "string" && new Set(["IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"]).has(value.status) && (value.note === undefined || typeof value.note === "string"),
    execute: (input, context) => execute(() => goals.updateStep({ ...scope(context), goalId: input.goalId as string, stepId: input.stepId as string, expectedGoalRevision: input.expectedGoalRevision as number, expectedStepRevision: input.expectedStepRevision as number, status: input.status as PlanStepStatus, ...(input.note ? { note: input.note as string } : {}) })),
  };
  const blocker: RegisteredTool = {
    name: "goal.report_blocker",
    description: "Record one concrete blocker observation. The goal becomes BLOCKED only after the same blocker is reported on three consecutive goal turns.",
    inputSchema: { type: "object", additionalProperties: false, properties: { goalId: { type: "string", minLength: 1, maxLength: 128 }, expectedGoalRevision: { type: "integer", minimum: 1 }, note: { type: "string", minLength: 1, maxLength: 2000 } }, required: ["goalId", "expectedGoalRevision", "note"] },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isRecord(value) && hasOnly(value, ["goalId", "expectedGoalRevision", "note"]) && typeof value.goalId === "string" && Number.isInteger(value.expectedGoalRevision) && typeof value.note === "string" && value.note.trim().length > 0,
    execute: (input, context) => execute(() => goals.reportBlocker({ ...scope(context), goalId: input.goalId as string, expectedGoalRevision: input.expectedGoalRevision as number, note: input.note as string })),
  };
  const control: RegisteredTool = {
    name: "goal.control",
    description: "Pause, resume, or cancel the current goal only when the user explicitly requests that control action.",
    inputSchema: { type: "object", additionalProperties: false, properties: { goalId: { type: "string", minLength: 1, maxLength: 128 }, expectedGoalRevision: { type: "integer", minimum: 1 }, action: { type: "string", enum: ["PAUSE", "RESUME", "CANCEL"] }, note: { type: "string", minLength: 1, maxLength: 2000 } }, required: ["goalId", "expectedGoalRevision", "action"] },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isRecord(value) && hasOnly(value, ["goalId", "expectedGoalRevision", "action", "note"]) && typeof value.goalId === "string" && Number.isInteger(value.expectedGoalRevision) && typeof value.action === "string" && new Set(["PAUSE", "RESUME", "CANCEL"]).has(value.action) && (value.note === undefined || typeof value.note === "string"),
    execute: (input, context) => execute(() => goals.control({ ...scope(context), goalId: input.goalId as string, expectedGoalRevision: input.expectedGoalRevision as number, action: input.action as "PAUSE" | "RESUME" | "CANCEL", ...(input.note ? { note: input.note as string } : {}) })),
  };
  const complete: RegisteredTool = {
    name: "goal.complete",
    description: "Complete the active goal only after every durable plan step is completed. This updates state but does not replace the visible final response.",
    inputSchema: { type: "object", additionalProperties: false, properties: { goalId: { type: "string", minLength: 1, maxLength: 128 }, expectedGoalRevision: { type: "integer", minimum: 1 }, note: { type: "string", minLength: 1, maxLength: 2000 } }, required: ["goalId", "expectedGoalRevision"] },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isRecord(value) && hasOnly(value, ["goalId", "expectedGoalRevision", "note"]) && typeof value.goalId === "string" && Number.isInteger(value.expectedGoalRevision) && (value.note === undefined || typeof value.note === "string"),
    execute: (input, context) => execute(() => goals.complete({ ...scope(context), goalId: input.goalId as string, expectedGoalRevision: input.expectedGoalRevision as number, ...(input.note ? { note: input.note as string } : {}) })),
  };
  return [create, get, setPlan, updateStep, blocker, control, complete];
}

export function registerGoalTools(registry: ToolRegistry, goals: GoalService): void {
  for (const tool of createGoalTools(goals)) registry.register(tool);
}

export function getPackageIdentity() {
  return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY } as const;
}
