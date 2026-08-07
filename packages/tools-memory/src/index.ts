import type { MemoryKind, MemoryService } from "@openrill/memory";
import { MemoryError } from "@openrill/memory";
import type { RegisteredTool, ToolExecutionContext, ToolExecutionResult, ToolRegistry } from "@openrill/tool-runtime";

export const PACKAGE_NAME = "@openrill/tools-memory" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "TOOLS_MEMORY" as const;

const KINDS = new Set<MemoryKind>(["FACT", "PREFERENCE", "DECISION", "CONSTRAINT", "NOTE"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function failure(error: MemoryError): ToolExecutionResult {
  return { output: { error: { code: error.code, message: error.message } }, isError: true };
}

async function execute(action: () => unknown): Promise<ToolExecutionResult> {
  try {
    return { output: await action(), isError: false };
  } catch (error) {
    if (error instanceof MemoryError) return failure(error);
    throw error;
  }
}

function workspace(context: ToolExecutionContext): string {
  return context.workspaceId;
}

export function createMemoryTools(memory: MemoryService): RegisteredTool[] {
  const remember: RegisteredTool = {
    name: "memory.remember",
    description: "Store one durable workspace-scoped fact, preference, decision, constraint, or note. Never store credentials or private keys.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        text: { type: "string", minLength: 1, maxLength: 8000 },
        kind: { type: "string", enum: ["FACT", "PREFERENCE", "DECISION", "CONSTRAINT", "NOTE"] },
      },
      required: ["text"],
    },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isRecord(value)
      && hasOnly(value, ["text", "kind"])
      && typeof value.text === "string"
      && value.text.length > 0
      && (value.kind === undefined || (typeof value.kind === "string" && KINDS.has(value.kind as MemoryKind))),
    execute: (input, context) => execute(() => memory.remember({
      workspaceId: workspace(context),
      text: input.text as string,
      ...((input.kind as MemoryKind | undefined) ? { kind: input.kind as MemoryKind } : {}),
      sourceConversationId: context.conversationId ?? null,
      sourceRunId: context.runId,
    })),
  };

  const search: RegisteredTool = {
    name: "memory.search",
    description: "Mandatory recall step before answering about prior work, decisions, dates, preferences, or remembered constraints. Returns bounded workspace-scoped results with provenance.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", minLength: 1, maxLength: 512 },
        maxResults: { type: "integer", minimum: 1, maximum: 10 },
      },
      required: ["query"],
    },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isRecord(value)
      && hasOnly(value, ["query", "maxResults"])
      && typeof value.query === "string"
      && value.query.length > 0
      && (value.maxResults === undefined || (Number.isInteger(value.maxResults) && (value.maxResults as number) >= 1 && (value.maxResults as number) <= 10)),
    execute: (input, context) => execute(() => memory.search({
      workspaceId: workspace(context),
      query: input.query as string,
      ...(input.maxResults !== undefined ? { maxResults: input.maxResults as number } : {}),
    })),
  };

  const get: RegisteredTool = {
    name: "memory.get",
    description: "Read one exact durable memory record by id after memory.search. The result is bounded and includes provenance.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { memoryId: { type: "string", minLength: 1, maxLength: 128 } },
      required: ["memoryId"],
    },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isRecord(value)
      && hasOnly(value, ["memoryId"])
      && typeof value.memoryId === "string"
      && value.memoryId.length > 0,
    execute: (input, context) => execute(() => memory.get({ workspaceId: workspace(context), memoryId: input.memoryId as string })),
  };

  const forget: RegisteredTool = {
    name: "memory.forget",
    description: "Forget one specific durable memory record by id. Use only when the user explicitly asks to remove that remembered item.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { memoryId: { type: "string", minLength: 1, maxLength: 128 } },
      required: ["memoryId"],
    },
    validateInput: (value): value is Readonly<Record<string, unknown>> => isRecord(value)
      && hasOnly(value, ["memoryId"])
      && typeof value.memoryId === "string"
      && value.memoryId.length > 0,
    execute: (input, context) => execute(() => memory.forget({ workspaceId: workspace(context), memoryId: input.memoryId as string })),
  };

  return [remember, search, get, forget];
}

export function registerMemoryTools(registry: ToolRegistry, memory: MemoryService): void {
  for (const tool of createMemoryTools(memory)) registry.register(tool);
}

export function getPackageIdentity() {
  return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY } as const;
}
