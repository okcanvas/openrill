import type { DelegationBudgetEnvelope, DelegationService } from "@openrill/conversations";
import { ConversationError } from "@openrill/conversations";
import { ToolWaitRequiredError, type RegisteredTool, type ToolExecutionContext, type ToolExecutionResult, type ToolRegistry } from "@openrill/tool-runtime";

export const PACKAGE_NAME = "@openrill/tools-delegation" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "TOOLS_DELEGATION" as const;

export interface DelegationToolOptions {
  readonly delegations: DelegationService;
  readonly scheduleChild: (runId: string) => boolean;
  readonly now?: () => number;
}

interface SpawnInput {
  readonly task: string;
  readonly expectedOutput?: "TEXT" | "JSON" | "ARTIFACTS";
  readonly maxTurns?: number;
  readonly maxModelCalls?: number;
  readonly maxToolCalls?: number;
  readonly maxOutputTokens?: number;
  readonly maxTotalTokens?: number;
  readonly maxDurationMs?: number;
  readonly maxNestedDepth?: number;
  readonly maxActiveChildren?: number;
  readonly maxTotalChildren?: number;
  readonly toolNames?: readonly string[];
}
interface WaitInput { readonly delegationId: string; }

const SPAWN_SCHEMA = {
  type: "object", additionalProperties: false, required: ["task"],
  properties: {
    task: { type: "string", minLength: 1, maxLength: 65_536 },
    expectedOutput: { enum: ["TEXT", "JSON", "ARTIFACTS"] },
    maxTurns: { type: "integer", minimum: 1 }, maxModelCalls: { type: "integer", minimum: 1 },
    maxToolCalls: { type: "integer", minimum: 0 }, maxOutputTokens: { type: "integer", minimum: 1 },
    maxTotalTokens: { type: "integer", minimum: 1 }, maxDurationMs: { type: "integer", minimum: 1 },
    maxNestedDepth: { type: "integer", minimum: 0, maximum: 15 },
    maxActiveChildren: { type: "integer", minimum: 0, maximum: 64 },
    maxTotalChildren: { type: "integer", minimum: 0, maximum: 1024 },
    toolNames: { type: "array", maxItems: 256, uniqueItems: true, items: { type: "string", pattern: "^[a-z][a-z0-9._-]{0,127}$" } },
  },
} as const;
const WAIT_SCHEMA = { type: "object", additionalProperties: false, required: ["delegationId"], properties: { delegationId: { type: "string", minLength: 1, maxLength: 128 } } } as const;

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value: Record<string, unknown>, required: readonly string[], optional: readonly string[]): boolean {
  const allowed = new Set([...required, ...optional]); return required.every((key) => key in value) && Object.keys(value).every((key) => allowed.has(key));
}
function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): value is number { return Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum; }
function validToolNames(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length <= 256 && new Set(value).size === value.length && value.every((item) => typeof item === "string" && /^[a-z][a-z0-9._-]{0,127}$/.test(item));
}
function validSpawn(value: unknown): value is Readonly<Record<string, unknown>> {
  if (!record(value) || !exact(value, ["task"], ["expectedOutput","maxTurns","maxModelCalls","maxToolCalls","maxOutputTokens","maxTotalTokens","maxDurationMs","maxNestedDepth","maxActiveChildren","maxTotalChildren","toolNames"])) return false;
  if (typeof value.task !== "string" || value.task.length < 1 || value.task.length > 65_536) return false;
  if (value.expectedOutput !== undefined && value.expectedOutput !== "TEXT" && value.expectedOutput !== "JSON" && value.expectedOutput !== "ARTIFACTS") return false;
  for (const key of ["maxTurns","maxModelCalls","maxOutputTokens","maxTotalTokens","maxDurationMs"] as const) if (value[key] !== undefined && !integer(value[key], 1)) return false;
  if (value.maxToolCalls !== undefined && !integer(value.maxToolCalls, 0)) return false;
  if (value.maxNestedDepth !== undefined && !integer(value.maxNestedDepth, 0, 15)) return false;
  if (value.maxActiveChildren !== undefined && !integer(value.maxActiveChildren, 0, 64)) return false;
  if (value.maxTotalChildren !== undefined && !integer(value.maxTotalChildren, 0, 1024)) return false;
  return value.toolNames === undefined || validToolNames(value.toolNames);
}
function validWait(value: unknown): value is Readonly<Record<string, unknown>> { return record(value) && exact(value, ["delegationId"], []) && typeof value.delegationId === "string" && value.delegationId.length >= 1 && value.delegationId.length <= 128; }
function errorResult(error: ConversationError): ToolExecutionResult { return { output: { error: { code: error.code, message: error.message } }, isError: true }; }
function requiredContext(context: ToolExecutionContext): { attemptId: string; toolCallId: string } {
  if (!context.attemptId || !context.toolCallId) throw new ConversationError("RUN_STATE_INVALID", "delegation Tool requires attemptId and toolCallId");
  return { attemptId: context.attemptId, toolCallId: context.toolCallId };
}

const DELEGATION_TOOL_NAMES = new Set(["agent.spawn", "agent.wait"]);

function fairShare(limit: number, lanes: number, cap: number): number {
  return Math.max(1, Math.min(cap, Math.floor(limit / Math.max(1, lanes))));
}

function childBudget(parent: NonNullable<ReturnType<DelegationService["budget"]>>, input: SpawnInput, now: number): DelegationBudgetEnvelope {
  const remainingDuration = Math.max(1, parent.deadlineAt - now);
  const childDepth = parent.depth + 1;
  const maxNestedDepth = input.maxNestedDepth ?? 0;
  const maxDelegationDepth = Math.min(parent.maxDelegationDepth, childDepth + maxNestedDepth);
  const canDelegate = maxDelegationDepth > childDepth;
  const maxActiveChildren = canDelegate ? (input.maxActiveChildren ?? Math.min(2, parent.maxActiveChildren)) : 0;
  const maxTotalChildren = canDelegate ? (input.maxTotalChildren ?? Math.max(maxActiveChildren, Math.min(4, parent.maxTotalChildren))) : 0;

  // Default reservations must leave room for sibling fan-out and the parent's own resume turn.
  // Explicit caller budgets remain authoritative and are still checked transactionally by DelegationService.
  const lanes = Math.max(1, Math.min(4, parent.maxActiveChildren));
  const laneTurns = fairShare(parent.maxTurns, lanes, 4);
  const laneModelCalls = fairShare(parent.maxModelCalls, lanes, 6);
  const laneToolCalls = fairShare(parent.maxToolCalls, lanes, 8);
  const laneTotalTokens = fairShare(parent.maxTotalTokens, lanes, 8_192);
  const defaultTurns = canDelegate ? Math.min(parent.maxTurns, Math.max(4, laneTurns)) : laneTurns;
  const defaultModelCalls = canDelegate ? Math.min(parent.maxModelCalls, Math.max(5, laneModelCalls)) : laneModelCalls;
  const defaultToolCalls = canDelegate ? Math.min(parent.maxToolCalls, Math.max(8, laneToolCalls)) : laneToolCalls;
  const defaultTotalTokens = canDelegate ? Math.min(parent.maxTotalTokens, Math.max(8_192, laneTotalTokens)) : laneTotalTokens;

  return {
    maxTurns: input.maxTurns ?? defaultTurns,
    maxModelCalls: input.maxModelCalls ?? defaultModelCalls,
    maxToolCalls: input.maxToolCalls ?? defaultToolCalls,
    maxOutputTokens: input.maxOutputTokens ?? Math.min(2_048, parent.maxOutputTokens),
    maxTotalTokens: input.maxTotalTokens ?? defaultTotalTokens,
    maxDurationMs: input.maxDurationMs ?? Math.min(300_000, remainingDuration),
    maxDelegationDepth,
    maxActiveChildren,
    maxTotalChildren,
  };
}

function childToolNames(parent: NonNullable<ReturnType<DelegationService["budget"]>>, input: SpawnInput, budget: DelegationBudgetEnvelope): readonly string[] {
  const parentAllowed = new Set(parent.allowedToolNames);
  if (input.toolNames?.some((name) => DELEGATION_TOOL_NAMES.has(name))) {
    throw new ConversationError("INVALID_ARGUMENT", "agent.spawn and agent.wait are controlled by maxNestedDepth, not toolNames");
  }
  const requested = input.toolNames ?? parent.allowedToolNames.filter((name) => !DELEGATION_TOOL_NAMES.has(name));
  if (requested.some((name) => !parentAllowed.has(name))) {
    throw new ConversationError("DELEGATION_SCOPE_ESCALATION", "child Tool scope is outside the parent scope");
  }
  const childDepth = parent.depth + 1;
  const canDelegate = budget.maxDelegationDepth > childDepth;
  if (!canDelegate) return Object.freeze([...requested]);
  if (!parentAllowed.has("agent.spawn") || !parentAllowed.has("agent.wait")) {
    throw new ConversationError("DELEGATION_SCOPE_ESCALATION", "parent scope does not permit nested delegation");
  }
  return Object.freeze([...new Set([...requested, "agent.spawn", "agent.wait"])].sort());
}

function spawnTool(options: DelegationToolOptions): RegisteredTool {
  return {
    name: "agent.spawn",
    description: "Start a bounded child Agent Run without waiting. Optional nested depth and child fan-out remain inside the parent durable scope.",
    inputSchema: SPAWN_SCHEMA,
    validateInput: validSpawn,
    execute(input, context) {
      try {
        const typed = input as unknown as SpawnInput;
        const identity = requiredContext(context);
        const parent = options.delegations.budget(context.runId);
        if (!parent) throw new ConversationError("DELEGATION_BUDGET_NOT_CONFIGURED", "parent run has no delegation budget envelope");
        const budget = childBudget(parent, typed, options.now?.() ?? Date.now());
        const requestedTools = childToolNames(parent, typed, budget);
        const created = options.delegations.createDelegatedRun({
          parentRunId: context.runId, parentAttemptId: identity.attemptId, parentToolCallId: identity.toolCallId,
          idempotencyKey: `agent.spawn:${identity.toolCallId}`, task: typed.task, workspaceId: context.workspaceId,
          budget, scope: { workspaceIds: [context.workspaceId], skillIds: [], toolNames: requestedTools },
          expectedOutput: typed.expectedOutput ?? "TEXT",
        });
        let delegation = created.delegation;
        if (delegation.status === "CREATED") delegation = options.delegations.transitionDelegation({ delegationId: delegation.delegationId, status: "RUNNING" });
        const terminal = delegation.status === "COMPLETED" || delegation.status === "FAILED" || delegation.status === "CANCELLED" || delegation.status === "TIMED_OUT";
        const scheduled = terminal ? true : options.scheduleChild(delegation.childRunId);
        if (!scheduled) delegation = options.delegations.failChildBeforeStart(delegation.delegationId, "DELEGATION_SCHEDULER_UNAVAILABLE");
        return { output: { delegationId: delegation.delegationId, childRunId: delegation.childRunId, childConversationId: delegation.childConversationId, status: delegation.status, depth: delegation.depth, replayed: created.replayed }, isError: !scheduled };
      } catch (error) { if (error instanceof ConversationError) return errorResult(error); throw error; }
    },
  };
}
function waitTool(options: DelegationToolOptions): RegisteredTool {
  return {
    name: "agent.wait", description: "Wait durably for one child Agent Run and receive its bounded terminal result.", inputSchema: WAIT_SCHEMA,
    validateInput: validWait,
    execute(input, context) {
      try {
        const typed = input as unknown as WaitInput; const identity = requiredContext(context);
        const terminal = options.delegations.terminalResult(context.runId, typed.delegationId);
        if (terminal) return { output: terminal, isError: false };
        try {
          options.delegations.markWaiting(context.runId, typed.delegationId, { parentAttemptId: identity.attemptId, parentToolCallId: identity.toolCallId, toolName: "agent.wait" });
        } catch (error) {
          if (error instanceof ConversationError && error.code === "RUN_STATE_INVALID") {
            const racedTerminal = options.delegations.terminalResult(context.runId, typed.delegationId);
            if (racedTerminal) return { output: racedTerminal, isError: false };
          }
          throw error;
        }
        throw new ToolWaitRequiredError("DELEGATION", { delegationId: typed.delegationId });
      } catch (error) { if (error instanceof ConversationError) return errorResult(error); throw error; }
    },
  };
}
export function registerDelegationTools(registry: ToolRegistry, options: DelegationToolOptions): void { registry.register(spawnTool(options)); registry.register(waitTool(options)); }
export function getPackageIdentity() { return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY } as const; }
