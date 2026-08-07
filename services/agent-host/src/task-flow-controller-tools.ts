import type { TaskFlowControllerRuntime } from "@openrill/task-flows";
import { TaskFlowError } from "@openrill/task-flows";
import type { RegisteredTool, ToolExecutionContext, ToolExecutionResult, ToolRegistry } from "@openrill/tool-runtime";

export const TASK_FLOW_CONTROLLER_TOOL_NAMES = [
  "task_flow.get",
  "task_flow.run",
  "task_flow.wait",
  "task_flow.block",
  "task_flow.finish",
  "task_flow.fail",
  "task_flow.cancel",
] as const;

export const TASK_FLOW_CONTROLLER_SYSTEM_INSTRUCTIONS = `You are resuming one durable Task Flow after a child Task reached a terminal state.
The system message contains the exact durable child result. Inspect the bound Flow with task_flow.get, then make one explicit controller decision:
- task_flow.run to admit the next concrete child Task,
- task_flow.wait when external input or time is required,
- task_flow.block when a linked Task result proves the Flow is blocked,
- task_flow.finish only when the Flow goal has a valid final outcome,
- task_flow.fail only when the Flow cannot continue,
- task_flow.cancel when cancellation is required.
Do not merely describe what you will do. Use a bound task_flow tool before finishing this wake Run.`;

export interface BoundTaskFlowControllerToolContext { readonly runtime: TaskFlowControllerRuntime; readonly flowId: string; }
type RuntimeResolver = (context: ToolExecutionContext) => BoundTaskFlowControllerToolContext;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function hasOnly(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}
function integer(value: unknown): value is number { return Number.isInteger(value) && (value as number) > 0; }
function nonempty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function optionalString(value: unknown): value is string | null | undefined { return value === undefined || value === null || typeof value === "string"; }
async function execute(action: () => unknown): Promise<ToolExecutionResult> {
  try { return { output: await action(), isError: false }; }
  catch (error) {
    if (error instanceof TaskFlowError) return { output: { error: { code: error.code, message: error.message } }, isError: true };
    throw error;
  }
}

export function createTaskFlowControllerTools(resolveRuntime: RuntimeResolver): RegisteredTool[] {
  const get: RegisteredTool = {
    name: "task_flow.get",
    description: "Read the single durable Task Flow bound to this controller wake Run.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isRecord(value) && Object.keys(value).length === 0,
    execute: (_input, context) => execute(() => {
      const { runtime, flowId } = resolveRuntime(context);
      return runtime.get(flowId);
    }),
  };
  const run: RegisteredTool = {
    name: "task_flow.run",
    description: "Atomically admit and schedule the next child Task for the bound Flow.",
    inputSchema: { type: "object", additionalProperties: false, properties: { expectedRevision: { type: "integer", minimum: 1 }, requestKey: { type: "string", minLength: 1, maxLength: 128 }, stepKey: { type: "string", minLength: 1, maxLength: 256 }, text: { type: "string", minLength: 1, maxLength: 65536 } }, required: ["expectedRevision", "requestKey", "stepKey", "text"] },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isRecord(value) && hasOnly(value, ["expectedRevision", "requestKey", "stepKey", "text"]) && integer(value.expectedRevision) && nonempty(value.requestKey) && nonempty(value.stepKey) && nonempty(value.text),
    execute: (input, context) => execute(() => {
      const { runtime, flowId } = resolveRuntime(context);
      return runtime.runTask({ flowId, expectedRevision: input.expectedRevision as number, requestKey: input.requestKey as string, stepKey: input.stepKey as string, text: input.text as string });
    }),
  };
  const wait: RegisteredTool = {
    name: "task_flow.wait",
    description: "Put the bound Flow into WAITING with an explicit durable reason.",
    inputSchema: { type: "object", additionalProperties: false, properties: { expectedRevision: { type: "integer", minimum: 1 }, currentStep: { type: ["string", "null"], maxLength: 256 }, wait: {} }, required: ["expectedRevision", "wait"] },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isRecord(value) && hasOnly(value, ["expectedRevision", "currentStep", "wait"]) && integer(value.expectedRevision) && optionalString(value.currentStep) && Object.prototype.hasOwnProperty.call(value, "wait"),
    execute: (input, context) => execute(() => {
      const { runtime, flowId } = resolveRuntime(context);
      return runtime.setWaiting({ flowId, expectedRevision: input.expectedRevision as number, ...(input.currentStep !== undefined ? { currentStep: input.currentStep as string | null } : {}), wait: input.wait });
    }),
  };
  const block: RegisteredTool = {
    name: "task_flow.block",
    description: "Put the bound Flow into BLOCKED using one linked Task as durable evidence.",
    inputSchema: { type: "object", additionalProperties: false, properties: { expectedRevision: { type: "integer", minimum: 1 }, blockedTaskId: { type: "string", minLength: 1, maxLength: 256 }, blockedSummary: { type: "string", minLength: 1, maxLength: 2000 }, currentStep: { type: ["string", "null"], maxLength: 256 } }, required: ["expectedRevision", "blockedTaskId", "blockedSummary"] },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isRecord(value) && hasOnly(value, ["expectedRevision", "blockedTaskId", "blockedSummary", "currentStep"]) && integer(value.expectedRevision) && nonempty(value.blockedTaskId) && nonempty(value.blockedSummary) && optionalString(value.currentStep),
    execute: (input, context) => execute(() => {
      const { runtime, flowId } = resolveRuntime(context);
      return runtime.setBlocked({ flowId, expectedRevision: input.expectedRevision as number, blockedTaskId: input.blockedTaskId as string, blockedSummary: input.blockedSummary as string, ...(input.currentStep !== undefined ? { currentStep: input.currentStep as string | null } : {}) });
    }),
  };
  const finish: RegisteredTool = {
    name: "task_flow.finish",
    description: "Mark the bound Flow SUCCEEDED after validating the final outcome.",
    inputSchema: { type: "object", additionalProperties: false, properties: { expectedRevision: { type: "integer", minimum: 1 }, state: {} }, required: ["expectedRevision"] },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isRecord(value) && hasOnly(value, ["expectedRevision", "state"]) && integer(value.expectedRevision),
    execute: (input, context) => execute(() => { const { runtime, flowId } = resolveRuntime(context); return runtime.finish({ flowId, expectedRevision: input.expectedRevision as number, ...(Object.prototype.hasOwnProperty.call(input, "state") ? { state: input.state } : {}) }); }),
  };
  const fail: RegisteredTool = {
    name: "task_flow.fail",
    description: "Mark the bound Flow FAILED with a durable summary.",
    inputSchema: { type: "object", additionalProperties: false, properties: { expectedRevision: { type: "integer", minimum: 1 }, blockedSummary: { type: "string", minLength: 1, maxLength: 2000 }, state: {} }, required: ["expectedRevision", "blockedSummary"] },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isRecord(value) && hasOnly(value, ["expectedRevision", "blockedSummary", "state"]) && integer(value.expectedRevision) && nonempty(value.blockedSummary),
    execute: (input, context) => execute(() => { const { runtime, flowId } = resolveRuntime(context); return runtime.fail({ flowId, expectedRevision: input.expectedRevision as number, blockedSummary: input.blockedSummary as string, ...(Object.prototype.hasOwnProperty.call(input, "state") ? { state: input.state } : {}) }); }),
  };
  const cancel: RegisteredTool = {
    name: "task_flow.cancel",
    description: "Cancel the bound Flow and cascade cancellation to active child Tasks.",
    inputSchema: { type: "object", additionalProperties: false, properties: { expectedRevision: { type: "integer", minimum: 1 } }, required: ["expectedRevision"] },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isRecord(value) && hasOnly(value, ["expectedRevision"]) && integer(value.expectedRevision),
    execute: (input, context) => execute(() => { const { runtime, flowId } = resolveRuntime(context); return runtime.cancel({ flowId, expectedRevision: input.expectedRevision as number }); }),
  };
  return [get, run, wait, block, finish, fail, cancel];
}

export function registerTaskFlowControllerTools(registry: ToolRegistry, resolveRuntime: RuntimeResolver): void {
  for (const tool of createTaskFlowControllerTools(resolveRuntime)) registry.register(tool);
}
