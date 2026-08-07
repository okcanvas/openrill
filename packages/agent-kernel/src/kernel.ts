import { createHash } from "node:crypto";
import {
  ModelAdapterError,
  type ModelAdapter,
  type ModelContentBlock,
  type ModelMessage,
  type ModelRequest,
  type ModelStreamEvent,
  type ModelToolCallBlock,
  type ModelUsage,
} from "@openrill/model-adapter";
import { ConversationError, type ConversationMessage } from "@openrill/conversations";
import { ToolRuntimeError, ToolWaitRequiredError, type ToolExecutionResult } from "@openrill/tool-runtime";
import { ToolApprovalRequiredError } from "@openrill/approval";
import { AgentKernelError } from "./errors.js";
import { AGENT_HOST_SHUTDOWN_ABORT_REASON } from "./types.js";
import type {
  AgentKernelBudget,
  AgentKernelExecutionOptions,
  AgentKernelExecutionResult,
  AgentKernelUsage,
} from "./types.js";

const DEFAULT_BUDGET: AgentKernelBudget = {
  maxTurns: 8,
  maxModelCalls: 10,
  maxToolCalls: 16,
  maxOutputTokens: 4096,
  maxTotalTokens: 65_536,
  maxDurationMs: 15 * 60 * 1000,
};

function assertPositiveInteger(value: number, label: string, allowZero = false): number {
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new TypeError(`${label} must be ${allowZero ? "a non-negative" : "a positive"} integer`);
  }
  return value;
}

function resolveBudget(partial: Partial<AgentKernelBudget> | undefined, maxOutputTokens: number): AgentKernelBudget {
  return {
    maxTurns: assertPositiveInteger(partial?.maxTurns ?? DEFAULT_BUDGET.maxTurns, "maxTurns"),
    maxModelCalls: assertPositiveInteger(partial?.maxModelCalls ?? DEFAULT_BUDGET.maxModelCalls, "maxModelCalls"),
    maxToolCalls: assertPositiveInteger(partial?.maxToolCalls ?? DEFAULT_BUDGET.maxToolCalls, "maxToolCalls", true),
    maxOutputTokens: assertPositiveInteger(partial?.maxOutputTokens ?? maxOutputTokens, "maxOutputTokens"),
    maxTotalTokens: assertPositiveInteger(partial?.maxTotalTokens ?? DEFAULT_BUDGET.maxTotalTokens, "maxTotalTokens"),
    maxDurationMs: assertPositiveInteger(partial?.maxDurationMs ?? DEFAULT_BUDGET.maxDurationMs, "maxDurationMs"),
  };
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function typedToolErrorCode(result: ToolExecutionResult): string | null {
  if (!result.isError || result.output === null || typeof result.output !== "object" || Array.isArray(result.output)) return null;
  const error = (result.output as Record<string, unknown>).error;
  if (error === null || typeof error !== "object" || Array.isArray(error)) return null;
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" && /^[A-Z][A-Z0-9_]{0,127}$/.test(code) ? code : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function conversationMessageToModel(message: ConversationMessage): ModelMessage {
  const content = record(message.content);
  if (content?.type === "text" && typeof content.text === "string") {
    return { role: message.role, content: [{ type: "text", text: content.text }] };
  }
  if (content?.type === "assistant") {
    const blocks: ModelContentBlock[] = [];
    if (typeof content.text === "string" && content.text) blocks.push({ type: "text", text: content.text });
    if (Array.isArray(content.toolCalls)) {
      for (const raw of content.toolCalls) {
        const call = record(raw);
        if (
          typeof call?.toolCallId === "string"
          && typeof call.name === "string"
          && record(call.arguments)
        ) {
          blocks.push({
            type: "tool_call",
            toolCallId: call.toolCallId,
            name: call.name,
            arguments: call.arguments as Readonly<Record<string, unknown>>,
          });
        }
      }
    }
    return { role: "assistant", content: blocks };
  }
  if (
    content?.type === "tool_result"
    && typeof content.toolCallId === "string"
    && typeof content.name === "string"
  ) {
    return {
      role: "tool",
      content: [{
        type: "tool_result",
        toolCallId: content.toolCallId,
        name: content.name,
        output: content.output,
        isError: content.isError === true,
      }],
    };
  }
  return { role: message.role, content: [{ type: "text", text: canonical(message.content) }] };
}

function parseToolArguments(argumentsJson: string): Readonly<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(argumentsJson || "{}");
  } catch (error) {
    throw new AgentKernelError("AGENT_TOOL_ARGUMENTS_INVALID", "model tool arguments are not valid JSON", { cause: error });
  }
  const result = record(parsed);
  if (!result) throw new AgentKernelError("AGENT_TOOL_ARGUMENTS_INVALID", "model tool arguments must be an object");
  return result;
}

function isHostShutdownAbort(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true && signal.reason === AGENT_HOST_SHUTDOWN_ABORT_REASON;
}

function abortIfNeeded(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  if (isHostShutdownAbort(signal)) throw new AgentKernelError("AGENT_HOST_SHUTDOWN", "agent execution was interrupted by Host shutdown");
  throw new AgentKernelError("AGENT_CANCELLED", "agent execution was cancelled");
}

interface ModelTurnResult {
  readonly text: string;
  readonly reasoning: string;
  readonly toolCalls: readonly ModelToolCallBlock[];
  readonly usage: ModelUsage;
  readonly stopReason: string;
  readonly providerResponseId: string | null;
}

async function runModelTurn(params: {
  adapter: ModelAdapter;
  request: ModelRequest;
  turn: number;
  maxRetries: number;
  requestNumber: () => number;
  conversations: AgentKernelExecutionOptions["conversations"];
  runId: string;
  attemptId: string;
  onProgress?: AgentKernelExecutionOptions["onProgress"];
  beforeRequest: () => void;
}): Promise<ModelTurnResult> {
  for (let retry = 0; retry <= params.maxRetries; retry += 1) {
    abortIfNeeded(params.request.signal);
    params.beforeRequest();
    const requestNumber = params.requestNumber();
    const invocation = params.conversations.startModelInvocation({
      runId: params.runId,
      attemptId: params.attemptId,
      turnNumber: params.turn,
      requestNumber,
      providerId: params.request.provider,
      modelId: params.request.model,
      requestHash: sha256({
        provider: params.request.provider,
        model: params.request.model,
        messages: params.request.messages,
        tools: params.request.tools,
        maxOutputTokens: params.request.maxOutputTokens,
      }),
    });
    params.conversations.appendEvent({
      runId: params.runId,
      attemptId: params.attemptId,
      eventType: "model.requested",
      payload: { turn: params.turn, requestNumber, retry },
      idempotencyKey: `model-request:${requestNumber}`,
    });

    let text = "";
    let reasoning = "";
    let usage: ModelUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let stopReason = "";
    let providerResponseId: string | null = null;
    const toolCalls: ModelToolCallBlock[] = [];
    let durableOutput = false;
    let completed = false;
    let deltaIndex = 0;
    try {
      for await (const event of params.adapter.stream(params.request)) {
        abortIfNeeded(params.request.signal);
        if (event.type === "started") {
          providerResponseId = event.providerResponseId ?? providerResponseId;
        } else if (event.type === "text_delta") {
          durableOutput = true;
          text += event.delta;
          deltaIndex += 1;
          params.conversations.appendEvent({
            runId: params.runId,
            attemptId: params.attemptId,
            eventType: "model.text_delta",
            payload: { turn: params.turn, delta: event.delta },
            idempotencyKey: `model:${requestNumber}:text:${deltaIndex}`,
          });
          params.onProgress?.({ runId: params.runId, type: "model.text_delta", data: { delta: event.delta } });
        } else if (event.type === "reasoning_delta") {
          durableOutput = true;
          reasoning += event.delta;
          deltaIndex += 1;
          params.conversations.appendEvent({
            runId: params.runId,
            attemptId: params.attemptId,
            eventType: "model.reasoning_delta",
            payload: { turn: params.turn, delta: event.delta },
            idempotencyKey: `model:${requestNumber}:reasoning:${deltaIndex}`,
          });
        } else if (event.type === "tool_call") {
          durableOutput = true;
          const argumentsObject = parseToolArguments(event.argumentsJson);
          toolCalls.push({
            type: "tool_call",
            toolCallId: event.toolCallId,
            name: event.name,
            arguments: argumentsObject,
          });
          params.conversations.appendEvent({
            runId: params.runId,
            attemptId: params.attemptId,
            eventType: "model.tool_call",
            payload: { turn: params.turn, toolCallId: event.toolCallId, name: event.name, arguments: argumentsObject },
            idempotencyKey: `model:${requestNumber}:tool:${event.toolCallId}`,
          });
        } else if (event.type === "usage") {
          usage = event.usage;
        } else if (event.type === "completed") {
          completed = true;
          stopReason = event.stopReason;
          providerResponseId = event.providerResponseId ?? providerResponseId;
        }
      }
      if (!completed) throw new AgentKernelError("AGENT_MODEL_STREAM_INVALID", "model stream ended without completed event");
      params.conversations.finishModelInvocation({
        invocationId: invocation.invocationId,
        status: "COMPLETED",
        providerResponseId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });
      params.conversations.appendEvent({
        runId: params.runId,
        attemptId: params.attemptId,
        eventType: "model.completed",
        payload: { turn: params.turn, requestNumber, stopReason, usage, providerResponseId },
        idempotencyKey: `model-complete:${requestNumber}`,
      });
      return { text, reasoning, toolCalls, usage, stopReason, providerResponseId };
    } catch (error) {
      const aborted = params.request.signal?.aborted || (error instanceof AgentKernelError && (error.code === "AGENT_CANCELLED" || error.code === "AGENT_HOST_SHUTDOWN")) || (error instanceof ModelAdapterError && error.code === "MODEL_ABORTED");
      const hostShutdown = isHostShutdownAbort(params.request.signal) || (error instanceof AgentKernelError && error.code === "AGENT_HOST_SHUTDOWN");
      const modelError = error instanceof ModelAdapterError ? error : null;
      params.conversations.finishModelInvocation({
        invocationId: invocation.invocationId,
        status: aborted ? "CANCELLED" : "FAILED",
        providerResponseId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        errorCode: hostShutdown ? "AGENT_HOST_SHUTDOWN" : modelError?.code ?? (error instanceof AgentKernelError ? error.code : "AGENT_MODEL_FAILED"),
      });
      if (aborted) {
        if (hostShutdown) throw new AgentKernelError("AGENT_HOST_SHUTDOWN", "agent execution was interrupted by Host shutdown", { cause: error });
        throw new AgentKernelError("AGENT_CANCELLED", "agent execution was cancelled", { cause: error });
      }
      if (modelError?.retryable && !durableOutput && retry < params.maxRetries) {
        params.conversations.appendEvent({
          runId: params.runId,
          attemptId: params.attemptId,
          eventType: "model.retry",
          payload: { turn: params.turn, requestNumber, nextRetry: retry + 1, code: modelError.code },
          idempotencyKey: `model-retry:${requestNumber}`,
        });
        continue;
      }
      if (modelError) throw new AgentKernelError("AGENT_MODEL_FAILED", modelError.message, { cause: modelError });
      if (error instanceof AgentKernelError) throw error;
      throw new AgentKernelError("AGENT_MODEL_FAILED", "model execution failed", { cause: error });
    }
  }
  throw new AgentKernelError("AGENT_MODEL_FAILED", "model retry loop exhausted");
}

export async function executeAgentRun(options: AgentKernelExecutionOptions): Promise<AgentKernelExecutionResult> {
  const initial = options.conversations.executionContext(options.runId);
  const resolution = await options.modelAdapters.resolve(initial.conversation.modelProfile);
  const resuming = initial.run.status === "WAITING_APPROVAL";
  const configuredBudget = initial.budgetEnvelope
    ? {
        maxTurns: initial.budgetEnvelope.maxTurns,
        maxModelCalls: initial.budgetEnvelope.maxModelCalls,
        maxToolCalls: initial.budgetEnvelope.maxToolCalls,
        maxOutputTokens: initial.budgetEnvelope.maxOutputTokens,
        maxTotalTokens: initial.budgetEnvelope.maxTotalTokens,
        maxDurationMs: initial.budgetEnvelope.maxDurationMs,
      }
    : initial.attempt.maxTurns
      && initial.attempt.maxModelCalls
      && initial.attempt.maxToolCalls !== null
      && initial.attempt.maxOutputTokens
      && initial.attempt.maxTotalTokens
      && initial.attempt.maxDurationMs
      ? {
          maxTurns: initial.attempt.maxTurns,
          maxModelCalls: initial.attempt.maxModelCalls,
          maxToolCalls: initial.attempt.maxToolCalls,
          maxOutputTokens: initial.attempt.maxOutputTokens,
          maxTotalTokens: initial.attempt.maxTotalTokens,
          maxDurationMs: initial.attempt.maxDurationMs,
        }
      : undefined;
  const budget = resolveBudget(options.budget ?? configuredBudget, resolution.maxOutputTokens);
  const allowedToolNames = initial.budgetEnvelope ? new Set(initial.budgetEnvelope.allowedToolNames) : null;
  const configuredModelToolNames = options.modelToolNames ? new Set(options.modelToolNames) : null;
  const modelToolDefinitions = allowedToolNames
    ? options.tools.definitions().filter((definition) => allowedToolNames.has(definition.name))
    : configuredModelToolNames
      ? options.tools.definitions().filter((definition) => configuredModelToolNames.has(definition.name))
      : options.tools.definitions();
  if (options.delegations && !initial.budgetEnvelope) {
    options.delegations.configureRootBudget({
      runId: options.runId,
      budget: {
        ...budget,
        maxDelegationDepth: 2,
        maxActiveChildren: 4,
        maxTotalChildren: 8,
      },
      scope: {
        workspaceIds: [initial.conversation.workspaceId],
        skillIds: [],
        toolNames: modelToolDefinitions.map((definition) => definition.name),
      },
    });
  }
  const started = resuming
    ? options.conversations.resumeExecution(options.runId)
    : options.conversations.startExecution({ runId: options.runId, providerId: resolution.provider, modelId: resolution.model, budget });
  const signal = options.signal;
  const messages = started.messages.map(conversationMessageToModel);
  const priorInvocations = options.conversations.modelInvocations(options.runId);
  const usage = {
    turns: priorInvocations.reduce((max, item) => Math.max(max, item.turnNumber), 0),
    inputTokens: priorInvocations.reduce((sum, item) => sum + item.inputTokens, 0),
    outputTokens: priorInvocations.reduce((sum, item) => sum + item.outputTokens, 0),
    modelCalls: priorInvocations.length,
    toolCalls: 0,
  };
  let requestCounter = priorInvocations.reduce((max, item) => Math.max(max, item.requestNumber), 0);
  const firstTurn = priorInvocations.reduce((max, item) => Math.max(max, item.turnNumber), 0) + 1;
  const completedTools = new Map<string, { signature: string; result: ToolExecutionResult }>();
  const toolArguments = new Map<string, { name: string; arguments: Readonly<Record<string, unknown>> }>();
  for (const message of started.messages) {
    const content = record(message.content);
    if (content?.type === "assistant" && Array.isArray(content.toolCalls)) {
      for (const raw of content.toolCalls) { const call = record(raw); if (typeof call?.toolCallId === "string" && typeof call.name === "string" && record(call.arguments)) toolArguments.set(call.toolCallId, { name: call.name, arguments: call.arguments as Readonly<Record<string, unknown>> }); }
    } else if (content?.type === "tool_result" && typeof content.toolCallId === "string" && typeof content.name === "string") {
      const args = toolArguments.get(content.toolCallId);
      if (args) completedTools.set(content.toolCallId, { signature: sha256({ name: args.name, arguments: args.arguments }), result: { output: content.output, isError: content.isError === true } });
    }
  }

  usage.toolCalls = completedTools.size;
  const now = options.now ?? (() => options.conversations.currentTime());
  const deadlineAt = started.budgetEnvelope?.deadlineAt
    ?? ((started.run.startedAt ?? now()) + budget.maxDurationMs);
  const assertTimeBudget = () => {
    if (now() >= deadlineAt) {
      throw new AgentKernelError("AGENT_TIME_BUDGET_EXCEEDED", "agent execution time budget exceeded");
    }
  };
  const delegatedUsage = () => {
    const current = options.delegations?.budget(options.runId) ?? started.budgetEnvelope;
    return {
      turns: current?.delegatedUsedTurns ?? 0,
      inputTokens: current?.delegatedUsedInputTokens ?? 0,
      outputTokens: current?.delegatedUsedOutputTokens ?? 0,
      modelCalls: current?.delegatedUsedModelCalls ?? 0,
      toolCalls: current?.delegatedUsedToolCalls ?? 0,
    };
  };
  const assertCompositeBudget = () => {
    const delegated = delegatedUsage();
    if (usage.turns + delegated.turns > budget.maxTurns) {
      throw new AgentKernelError("AGENT_TURN_BUDGET_EXCEEDED", "agent plus delegated turn budget exceeded");
    }
    if (usage.modelCalls + delegated.modelCalls > budget.maxModelCalls) {
      throw new AgentKernelError("AGENT_MODEL_CALL_BUDGET_EXCEEDED", "agent plus delegated model call budget exceeded");
    }
    if (usage.toolCalls + delegated.toolCalls > budget.maxToolCalls) {
      throw new AgentKernelError("AGENT_TOOL_CALL_BUDGET_EXCEEDED", "agent plus delegated tool call budget exceeded");
    }
    if (usage.inputTokens + usage.outputTokens + delegated.inputTokens + delegated.outputTokens > budget.maxTotalTokens) {
      throw new AgentKernelError("AGENT_TOTAL_TOKEN_BUDGET_EXCEEDED", "agent plus delegated total token budget exceeded");
    }
  };
  const finishUsage = () => ({ ...usage });
  try {
    for (let turn = firstTurn; turn <= budget.maxTurns; turn += 1) {
      abortIfNeeded(signal);
      assertTimeBudget();
      assertCompositeBudget();
      const request: ModelRequest = {
        requestId: `${options.runId}:${turn}:${requestCounter + 1}`,
        provider: resolution.provider,
        model: resolution.model,
        systemInstructions: options.systemInstructions ?? "You are OpenRill, a local autonomous agent. Use only declared tools and return concise, accurate results.",
        messages,
        tools: modelToolDefinitions,
        maxOutputTokens: budget.maxOutputTokens,
        ...(signal ? { signal } : {}),
      };
      const result = await runModelTurn({
        adapter: resolution.adapter,
        request,
        turn,
        maxRetries: resolution.maxRetries,
        requestNumber: () => ++requestCounter,
        conversations: options.conversations,
        runId: options.runId,
        attemptId: started.attempt.attemptId,
        beforeRequest: () => {
          const delegated = delegatedUsage();
          if (usage.modelCalls + delegated.modelCalls >= budget.maxModelCalls) {
            throw new AgentKernelError("AGENT_MODEL_CALL_BUDGET_EXCEEDED", "model call budget exceeded including delegated usage");
          }
          usage.modelCalls += 1;
        },
        ...(options.onProgress ? { onProgress: options.onProgress } : {}),
      });
      assertTimeBudget();
      usage.turns = Math.max(usage.turns, turn);
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
      if (usage.inputTokens + usage.outputTokens + delegatedUsage().inputTokens + delegatedUsage().outputTokens > budget.maxTotalTokens) {
        throw new AgentKernelError("AGENT_TOTAL_TOKEN_BUDGET_EXCEEDED", "agent total token budget exceeded including delegated usage");
      }
      options.conversations.updateExecutionUsage(options.runId, finishUsage());

      const assistantContent = {
        type: "assistant",
        text: result.text,
        reasoningSummary: result.reasoning || null,
        toolCalls: result.toolCalls.map((call) => ({
          toolCallId: call.toolCallId,
          name: call.name,
          arguments: call.arguments,
        })),
      };
      if (result.text || result.toolCalls.length > 0) {
        options.conversations.appendExecutionMessage({ runId: options.runId, role: "assistant", content: assistantContent });
        messages.push({
          role: "assistant",
          content: [
            ...(result.text ? [{ type: "text" as const, text: result.text }] : []),
            ...result.toolCalls,
          ],
        });
      }

      if (result.toolCalls.length === 0) {
        options.conversations.completeExecution(options.runId, finishUsage(), result.stopReason || "stop", result.text);
        return { runId: options.runId, status: "COMPLETED", terminalReason: result.stopReason || "stop", usage: finishUsage(), messages };
      }

      for (const toolCall of result.toolCalls) {
        abortIfNeeded(signal);
        assertTimeBudget();
        const signature = sha256({ name: toolCall.name, arguments: toolCall.arguments });
        const existing = completedTools.get(toolCall.toolCallId);
        if (existing && existing.signature !== signature) {
          throw new AgentKernelError("AGENT_TOOL_CALL_CONFLICT", `tool call id reused with different payload: ${toolCall.toolCallId}`);
        }
        if (existing) {
          options.conversations.appendEvent({
            runId: options.runId,
            attemptId: started.attempt.attemptId,
            eventType: "tool.replayed",
            payload: { toolCallId: toolCall.toolCallId, name: toolCall.name },
            idempotencyKey: `tool-replay:${toolCall.toolCallId}`,
          });
          options.conversations.appendEvent({
            runId: options.runId,
            attemptId: started.attempt.attemptId,
            eventType: "run.checkpoint",
            payload: { kind: "tool.replayed", toolCallId: toolCall.toolCallId, name: toolCall.name },
            idempotencyKey: `checkpoint:tool:${toolCall.toolCallId}`,
          });
          messages.push({
            role: "tool",
            content: [{
              type: "tool_result",
              toolCallId: toolCall.toolCallId,
              name: toolCall.name,
              output: existing.result.output,
              isError: existing.result.isError,
            }],
          });
          continue;
        }
        if (allowedToolNames && !allowedToolNames.has(toolCall.name)) {
          throw new AgentKernelError("AGENT_TOOL_NOT_ALLOWED", `tool is outside the durable Run scope: ${toolCall.name}`);
        }
        if (usage.toolCalls + delegatedUsage().toolCalls >= budget.maxToolCalls) {
          throw new AgentKernelError("AGENT_TOOL_CALL_BUDGET_EXCEEDED", "tool call budget exceeded including delegated usage");
        }
        usage.toolCalls += 1;
        options.conversations.updateExecutionUsage(options.runId, finishUsage());
        options.conversations.appendEvent({
          runId: options.runId,
          attemptId: started.attempt.attemptId,
          eventType: "tool.started",
          payload: { toolCallId: toolCall.toolCallId, name: toolCall.name, execution: "SEQUENTIAL" },
          idempotencyKey: `tool-start:${toolCall.toolCallId}`,
        });
        let toolResult: ToolExecutionResult;
        try {
          toolResult = await options.tools.execute(toolCall.name, toolCall.arguments, {
            runId: options.runId,
            attemptId: started.attempt.attemptId,
            workspaceId: started.conversation.workspaceId,
            conversationId: started.conversation.conversationId,
            toolCallId: toolCall.toolCallId,
            ...(allowedToolNames ? { allowedToolNames: [...allowedToolNames] } : {}),
            ...(signal ? { signal } : {}),
          });
        } catch (error) {
          if (error instanceof ToolApprovalRequiredError) {
            options.conversations.waitForApproval(options.runId, finishUsage(), error.request.requestId);
            options.onProgress?.({ runId: options.runId, type: "approval.requested", data: error.request });
            return { runId: options.runId, status: "WAITING_APPROVAL", terminalReason: "APPROVAL_REQUIRED", usage: finishUsage(), messages };
          }
          if (error instanceof ToolWaitRequiredError && error.reason === "DELEGATION") {
            const delegationId = typeof error.data.delegationId === "string" ? error.data.delegationId : null;
            if (!delegationId) throw new AgentKernelError("AGENT_TOOL_FAILED", "delegation wait identity is missing", { cause: error });
            options.conversations.waitForDelegation(options.runId, finishUsage(), { delegationId, toolCallId: toolCall.toolCallId });
            options.onProgress?.({ runId: options.runId, type: "delegation.waiting", data: { delegationId, toolCallId: toolCall.toolCallId } });
            return { runId: options.runId, status: "WAITING_DELEGATION", terminalReason: "DELEGATION_WAIT", usage: finishUsage(), messages };
          }
          if (error instanceof ToolRuntimeError && error.code === "TOOL_ABORTED") {
            if (isHostShutdownAbort(signal)) throw new AgentKernelError("AGENT_HOST_SHUTDOWN", error.message, { cause: error });
            throw new AgentKernelError("AGENT_CANCELLED", error.message, { cause: error });
          }
          throw new AgentKernelError("AGENT_TOOL_FAILED", error instanceof Error ? error.message : "tool failed", { cause: error });
        }
        completedTools.set(toolCall.toolCallId, { signature, result: toolResult });
        options.conversations.appendExecutionMessage({
          runId: options.runId,
          role: "tool",
          content: {
            type: "tool_result",
            toolCallId: toolCall.toolCallId,
            name: toolCall.name,
            output: toolResult.output,
            isError: toolResult.isError,
          },
        });
        const toolErrorCode = typedToolErrorCode(toolResult);
        options.conversations.appendEvent({
          runId: options.runId,
          attemptId: started.attempt.attemptId,
          eventType: "tool.completed",
          payload: { toolCallId: toolCall.toolCallId, name: toolCall.name, isError: toolResult.isError, errorCode: toolErrorCode },
          idempotencyKey: `tool-complete:${toolCall.toolCallId}`,
        });
        options.conversations.appendEvent({
          runId: options.runId,
          attemptId: started.attempt.attemptId,
          eventType: "run.checkpoint",
          payload: { kind: "tool.completed", toolCallId: toolCall.toolCallId, name: toolCall.name, isError: toolResult.isError, errorCode: toolErrorCode },
          idempotencyKey: `checkpoint:tool:${toolCall.toolCallId}`,
        });
        messages.push({
          role: "tool",
          content: [{
            type: "tool_result",
            toolCallId: toolCall.toolCallId,
            name: toolCall.name,
            output: toolResult.output,
            isError: toolResult.isError,
          }],
        });
      }
    }
    throw new AgentKernelError("AGENT_TURN_BUDGET_EXCEEDED", "agent turn budget exceeded");
  } catch (error) {
    const current = options.conversations.executionContext(options.runId).run;
    if (error instanceof AgentKernelError && error.code === "AGENT_HOST_SHUTDOWN") {
      const interrupted = options.conversations.interruptExecution(options.runId, "HOST_SHUTDOWN");
      if (interrupted.status === "CREATED" && interrupted.recoveryState === "RESUMABLE") {
        return { runId: options.runId, status: "INTERRUPTED", terminalReason: "HOST_SHUTDOWN_RESUMABLE", usage: finishUsage(), messages };
      }
      return { runId: options.runId, status: "FAILED", terminalReason: "HOST_SHUTDOWN_NON_RESUMABLE", usage: finishUsage(), messages };
    }
    if (error instanceof AgentKernelError && error.code === "AGENT_CANCELLED") {
      options.conversations.updateExecutionUsage(options.runId, finishUsage(), "CANCELLED");
      if (current.status === "RUNNING" || current.status === "WAITING_APPROVAL") {
        options.conversations.transitionRun({
          runId: options.runId,
          status: "CANCELLED",
          eventType: "run.cancelled",
          payload: { reason: "abort-signal" },
        });
      }
      return { runId: options.runId, status: "CANCELLED", terminalReason: "CANCELLED", usage: finishUsage(), messages };
    }
    const modelCause = error instanceof AgentKernelError && error.cause instanceof ModelAdapterError ? error.cause : null;
    const code = modelCause?.code ?? (error instanceof AgentKernelError ? error.code : "AGENT_MODEL_FAILED");
    const message = error instanceof Error ? error.message : String(error);
    if (!TERMINAL_RUN_STATES.has(current.status)) {
      options.conversations.failExecution(options.runId, finishUsage(), code, message);
    }
    return { runId: options.runId, status: "FAILED", terminalReason: code, usage: finishUsage(), messages };
  }
}

const TERMINAL_RUN_STATES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
