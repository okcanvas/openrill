import type { ModelAdapterResolver, ModelMessage } from "@openrill/model-adapter";
import type { ConversationService, DelegationService } from "@openrill/conversations";
import type { ToolRegistry } from "@openrill/tool-runtime";

export const AGENT_HOST_SHUTDOWN_ABORT_REASON = "OPENRILL_AGENT_HOST_SHUTDOWN" as const;

export interface AgentKernelBudget {
  readonly maxTurns: number;
  readonly maxModelCalls: number;
  readonly maxToolCalls: number;
  readonly maxOutputTokens: number;
  readonly maxTotalTokens: number;
  readonly maxDurationMs: number;
}

export interface AgentKernelUsage {
  readonly turns: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly modelCalls: number;
  readonly toolCalls: number;
}

export interface AgentKernelProgressEvent {
  readonly runId: string;
  readonly type: string;
  readonly data: unknown;
}

export interface AgentKernelExecutionOptions {
  readonly runId: string;
  readonly conversations: ConversationService;
  readonly modelAdapters: ModelAdapterResolver;
  readonly tools: ToolRegistry;
  readonly delegations?: DelegationService;
  readonly budget?: Partial<AgentKernelBudget>;
  readonly signal?: AbortSignal;
  readonly systemInstructions?: string;
  readonly modelToolNames?: readonly string[];
  readonly onProgress?: (event: AgentKernelProgressEvent) => void;
  readonly now?: () => number;
}

export interface AgentKernelExecutionResult {
  readonly runId: string;
  readonly status: "COMPLETED" | "FAILED" | "CANCELLED" | "WAITING_APPROVAL" | "WAITING_DELEGATION" | "INTERRUPTED";
  readonly terminalReason: string;
  readonly usage: AgentKernelUsage;
  readonly messages: readonly ModelMessage[];
}
