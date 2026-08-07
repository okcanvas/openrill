import { ToolApprovalRequiredError } from "@openrill/approval";
/** OpenRill tool registration and execution contract. */
export const PACKAGE_NAME = "@openrill/tool-runtime" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "TOOL_RUNTIME" as const;

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface ToolExecutionContext {
  readonly runId: string;
  readonly attemptId: string;
  readonly workspaceId: string;
  readonly conversationId?: string;
  readonly toolCallId?: string;
  readonly signal?: AbortSignal;
  readonly allowedToolNames?: readonly string[];
}

export interface ToolExecutionResult {
  readonly output: unknown;
  readonly isError: boolean;
}

export interface RegisteredTool extends ToolDefinition {
  validateInput(input: unknown): input is Readonly<Record<string, unknown>>;
  execute(input: Readonly<Record<string, unknown>>, context: ToolExecutionContext): Promise<ToolExecutionResult> | ToolExecutionResult;
}

export type ToolRuntimeErrorCode = "TOOL_NOT_FOUND" | "TOOL_INPUT_INVALID" | "TOOL_ABORTED" | "TOOL_EXECUTION_FAILED";
export type ToolWaitReason = "DELEGATION";

export class ToolWaitRequiredError extends Error {
  public constructor(
    public readonly reason: ToolWaitReason,
    public readonly data: Readonly<Record<string, unknown>>,
  ) {
    super(`tool execution suspended: ${reason}`);
    this.name = "ToolWaitRequiredError";
  }
}

export class ToolRuntimeError extends Error {
  public constructor(public readonly code: ToolRuntimeErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ToolRuntimeError";
  }
}

const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_.-]{0,127}$/;

export class ToolRegistry {
  readonly #tools = new Map<string, RegisteredTool>();

  public register(tool: RegisteredTool): void {
    if (!TOOL_NAME_PATTERN.test(tool.name)) throw new TypeError(`invalid tool name: ${tool.name}`);
    if (this.#tools.has(tool.name)) throw new TypeError(`duplicate tool: ${tool.name}`);
    this.#tools.set(tool.name, tool);
  }

  public definitions(): ToolDefinition[] {
    return [...this.#tools.values()]
      .map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  public async execute(
    name: string,
    input: unknown,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    if (context.signal?.aborted) throw new ToolRuntimeError("TOOL_ABORTED", `tool aborted before execution: ${name}`);
    const tool = this.#tools.get(name);
    if (!tool) throw new ToolRuntimeError("TOOL_NOT_FOUND", `tool not found: ${name}`);
    if (!tool.validateInput(input)) throw new ToolRuntimeError("TOOL_INPUT_INVALID", `tool input is invalid: ${name}`);
    try {
      const result = await tool.execute(input, context);
      if (context.signal?.aborted) throw new ToolRuntimeError("TOOL_ABORTED", `tool aborted during execution: ${name}`);
      return result;
    } catch (error) {
      if (error instanceof ToolRuntimeError || error instanceof ToolApprovalRequiredError || error instanceof ToolWaitRequiredError) throw error;
      throw new ToolRuntimeError("TOOL_EXECUTION_FAILED", `tool execution failed: ${name}`, { cause: error });
    }
  }
}

export function getPackageIdentity() {
  return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY } as const;
}
