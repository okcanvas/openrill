import { createHash } from "node:crypto";

import {
  ModelAdapterError,
  classifyHttpModelError,
  type ModelAdapter,
  type ModelContentBlock,
  type ModelMessage,
  type ModelRequest,
  type ModelStreamEvent,
  type ModelToolDefinition,
  type ModelUsage,
} from "@openrill/model-adapter";

export const PACKAGE_NAME = "@openrill/model-openai-responses" as const;
export const PACKAGE_VERSION = "0.25.0-step023a" as const;
export const PACKAGE_BOUNDARY = "MODEL_PROVIDER_OPENAI_RESPONSES" as const;

export interface OpenAIResponsesAdapterOptions {
  readonly endpoint: string;
  readonly apiKey: string;
  readonly defaultHeaders?: Readonly<Record<string, string>>;
  readonly fetchImpl?: typeof fetch;
}

interface ToolAccumulator {
  toolCallId: string;
  name: string;
  argumentsJson: string;
  emitted: boolean;
}

interface ToolAccumulatorState {
  readonly accumulators: Set<ToolAccumulator>;
  readonly byIdentity: Map<string, ToolAccumulator>;
}

interface ToolNameAliases {
  readonly canonicalToProvider: ReadonlyMap<string, string>;
  readonly providerToCanonical: ReadonlyMap<string, string>;
}

const OPENAI_FUNCTION_NAME = /^[A-Za-z0-9_-]{1,64}$/;

function shortSha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

function readableAlias(canonicalName: string): string {
  const sanitized = canonicalName.replace(/[^A-Za-z0-9_-]/g, "_");
  return sanitized.slice(0, 64);
}

function hashedAlias(canonicalName: string): string {
  const digest = shortSha256(canonicalName);
  const sanitized = readableAlias(canonicalName) || "tool";
  const prefix = sanitized.slice(0, 64 - digest.length - 1);
  return `${prefix}_${digest}`;
}

function buildToolNameAliases(request: ModelRequest): ToolNameAliases {
  const canonicalNames = new Set<string>();
  for (const tool of request.tools) canonicalNames.add(tool.name);
  for (const message of request.messages) {
    for (const block of message.content) {
      if (block.type === "tool_call") canonicalNames.add(block.name);
    }
  }

  const canonicalToProvider = new Map<string, string>();
  const providerToCanonical = new Map<string, string>();
  const validNames = [...canonicalNames].filter((name) => OPENAI_FUNCTION_NAME.test(name)).sort();
  const encodedNames = [...canonicalNames].filter((name) => !OPENAI_FUNCTION_NAME.test(name)).sort();

  for (const canonicalName of validNames) {
    canonicalToProvider.set(canonicalName, canonicalName);
    providerToCanonical.set(canonicalName, canonicalName);
  }
  for (const canonicalName of encodedNames) {
    const providerName = hashedAlias(canonicalName);
    if (!OPENAI_FUNCTION_NAME.test(providerName) || providerToCanonical.has(providerName)) {
      throw new ModelAdapterError(
        "MODEL_PROFILE_INVALID",
        `OpenAI function alias collision for canonical Tool name: ${canonicalName}`,
        false,
      );
    }
    canonicalToProvider.set(canonicalName, providerName);
    providerToCanonical.set(providerName, canonicalName);
  }
  return { canonicalToProvider, providerToCanonical };
}

function providerToolName(aliases: ToolNameAliases, canonicalName: string): string {
  const providerName = aliases.canonicalToProvider.get(canonicalName);
  if (!providerName) {
    throw new ModelAdapterError(
      "MODEL_PROFILE_INVALID",
      `OpenAI function alias is missing for canonical Tool name: ${canonicalName}`,
      false,
    );
  }
  return providerName;
}

function canonicalToolName(aliases: ToolNameAliases, providerName: string): string {
  const canonicalName = aliases.providerToCanonical.get(providerName);
  if (!canonicalName) {
    throw new ModelAdapterError(
      "MODEL_STREAM_INVALID",
      `provider returned an unknown function name: ${providerName}`,
      false,
    );
  }
  return canonicalName;
}

function bindToolAccumulatorIdentity(state: ToolAccumulatorState, identity: string | undefined, current: ToolAccumulator): void {
  if (!identity) return;
  const existing = state.byIdentity.get(identity);
  if (existing && existing !== current) {
    throw new ModelAdapterError("MODEL_STREAM_INVALID", `provider reused a function-call identity: ${identity}`, false);
  }
  state.byIdentity.set(identity, current);
}

function resolveToolAccumulator(
  state: ToolAccumulatorState,
  input: { readonly callId?: string; readonly itemId?: string },
): ToolAccumulator {
  const byCall = input.callId ? state.byIdentity.get(input.callId) : undefined;
  const byItem = input.itemId ? state.byIdentity.get(input.itemId) : undefined;
  if (byCall && byItem && byCall !== byItem) {
    throw new ModelAdapterError("MODEL_STREAM_INVALID", "provider function-call identities resolve to different calls", false);
  }
  const existing = byCall ?? byItem;
  const current = existing ?? {
    toolCallId: input.callId ?? input.itemId ?? "",
    name: "",
    argumentsJson: "",
    emitted: false,
  };
  if (!current.toolCallId && input.callId) current.toolCallId = input.callId;
  if (input.callId) current.toolCallId = input.callId;
  if (!current.toolCallId) {
    throw new ModelAdapterError("MODEL_STREAM_INVALID", "function call has no identity", false);
  }
  if (!existing) state.accumulators.add(current);
  bindToolAccumulatorIdentity(state, input.callId, current);
  bindToolAccumulatorIdentity(state, input.itemId, current);
  return current;
}

function applyProviderToolName(current: ToolAccumulator, aliases: ToolNameAliases, providerName: string | undefined): void {
  if (!providerName) return;
  const canonicalName = canonicalToolName(aliases, providerName);
  if (current.name && current.name !== canonicalName) {
    throw new ModelAdapterError("MODEL_STREAM_INVALID", "provider changed a function name within one call", false);
  }
  current.name = canonicalName;
}

function toolCallEvent(current: ToolAccumulator): ModelStreamEvent {
  if (!current.toolCallId) throw new ModelAdapterError("MODEL_STREAM_INVALID", "completed function call has no identity", false);
  if (!current.name) throw new ModelAdapterError("MODEL_STREAM_INVALID", "completed function call has no name", false);
  current.emitted = true;
  return {
    type: "tool_call",
    toolCallId: current.toolCallId,
    name: current.name,
    argumentsJson: current.argumentsJson || "{}",
  };
}

function endpointUrl(endpoint: string): string {
  const trimmed = endpoint.replace(/\/+$/, "");
  return trimmed.endsWith("/responses") ? trimmed : `${trimmed}/responses`;
}

function projectBlock(block: ModelContentBlock, aliases: ToolNameAliases): unknown {
  if (block.type === "text") return { type: "input_text", text: block.text };
  if (block.type === "tool_call") {
    return {
      type: "function_call",
      call_id: block.toolCallId,
      name: providerToolName(aliases, block.name),
      arguments: JSON.stringify(block.arguments),
    };
  }
  return {
    type: "function_call_output",
    call_id: block.toolCallId,
    output: JSON.stringify({ name: block.name, output: block.output, isError: block.isError }),
  };
}

function projectMessage(message: ModelMessage, aliases: ToolNameAliases): unknown[] {
  const directItems = message.content
    .filter((block) => block.type === "tool_call" || block.type === "tool_result")
    .map((block) => projectBlock(block, aliases));
  const text = message.content
    .filter((block): block is Extract<ModelContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("");
  const messageItems = text
    ? [{ type: "message", role: message.role === "tool" ? "user" : message.role, content: text }]
    : [];
  return [...messageItems, ...directItems];
}

function projectTool(tool: ModelToolDefinition, aliases: ToolNameAliases): unknown {
  const name = providerToolName(aliases, tool.name);
  return {
    type: "function",
    name,
    description: name === tool.name ? tool.description : `OpenRill canonical Tool name: ${tool.name}. ${tool.description}`,
    parameters: tool.inputSchema,
    strict: false,
  };
}

function buildBody(request: ModelRequest, aliases: ToolNameAliases): unknown {
  return {
    model: request.model,
    stream: true,
    store: false,
    max_output_tokens: request.maxOutputTokens,
    instructions: request.systemInstructions,
    input: request.messages.flatMap((message) => projectMessage(message, aliases)),
    tools: request.tools.map((tool) => projectTool(tool, aliases)),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(record: Record<string, unknown> | null, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function usageFromResponse(response: Record<string, unknown> | null): ModelUsage | null {
  const usage = asRecord(response?.usage);
  if (!usage) return null;
  const inputTokens = Number(usage.input_tokens ?? 0);
  const outputTokens = Number(usage.output_tokens ?? 0);
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return null;
  return {
    inputTokens,
    outputTokens,
    totalTokens: Number(usage.total_tokens ?? inputTokens + outputTokens),
  };
}

async function* parseSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncIterable<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) throw new ModelAdapterError("MODEL_ABORTED", "model request was aborted", false);
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data && data !== "[DONE]") {
          try {
            yield JSON.parse(data);
          } catch (error) {
            throw new ModelAdapterError("MODEL_STREAM_INVALID", "provider SSE data is not valid JSON", false, undefined, { cause: error });
          }
        }
        boundary = buffer.indexOf("\n\n");
      }
      if (done) break;
    }
    if (buffer.trim()) throw new ModelAdapterError("MODEL_STREAM_INVALID", "provider SSE ended with an incomplete frame", false);
  } finally {
    reader.releaseLock();
  }
}

function normalizeFailure(event: Record<string, unknown>): ModelAdapterError {
  const response = asRecord(event.response);
  const error = asRecord(event.error) ?? asRecord(response?.error);
  const message = readString(error, "message") ?? readString(event, "message") ?? "provider stream failed";
  const code = readString(error, "code") ?? readString(event, "code") ?? "";
  const retryable = /rate|timeout|server|temporar|overload/i.test(`${code} ${message}`);
  return new ModelAdapterError(retryable ? "MODEL_TRANSPORT_FAILED" : "MODEL_PROVIDER_FAILED", message, retryable);
}

export function createOpenAIResponsesAdapter(options: OpenAIResponsesAdapterOptions): ModelAdapter {
  if (!options.apiKey) throw new ModelAdapterError("MODEL_AUTH_FAILED", "OpenAI Responses API key is empty", false);
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    providerId: "openai-responses",
    async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
      const aliases = buildToolNameAliases(request);
      let response: Response;
      try {
        response = await fetchImpl(endpointUrl(options.endpoint), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "text/event-stream",
            authorization: `Bearer ${options.apiKey}`,
            ...options.defaultHeaders,
          },
          body: JSON.stringify(buildBody(request, aliases)),
          ...(request.signal ? { signal: request.signal } : {}),
        });
      } catch (error) {
        if (request.signal?.aborted) throw new ModelAdapterError("MODEL_ABORTED", "model request was aborted", false, undefined, { cause: error });
        throw new ModelAdapterError("MODEL_TRANSPORT_FAILED", "model HTTP request failed", true, undefined, { cause: error });
      }
      if (!response.ok) {
        const text = (await response.text()).slice(0, 4096);
        throw classifyHttpModelError(response.status, `model HTTP ${response.status}: ${text || response.statusText}`);
      }
      if (!response.body) throw new ModelAdapterError("MODEL_STREAM_INVALID", "model response has no body", true);

      const tools: ToolAccumulatorState = { accumulators: new Set<ToolAccumulator>(), byIdentity: new Map<string, ToolAccumulator>() };
      let terminal = false;
      for await (const raw of parseSse(response.body, request.signal)) {
        const event = asRecord(raw);
        const type = readString(event, "type");
        if (!event || !type) throw new ModelAdapterError("MODEL_STREAM_INVALID", "provider stream event is not a typed object", false);
        if (type === "response.created") {
          {
            const providerResponseId = readString(asRecord(event.response), "id");
            yield { type: "started", ...(providerResponseId ? { providerResponseId } : {}) };
          }
        } else if (type === "response.output_text.delta") {
          const delta = readString(event, "delta");
          if (delta) yield { type: "text_delta", delta };
        } else if (type === "response.reasoning_summary_text.delta" || type === "response.reasoning_text.delta") {
          const delta = readString(event, "delta");
          if (delta) yield { type: "reasoning_delta", delta };
        } else if (type === "response.output_item.added") {
          const item = asRecord(event.item);
          if (item?.type === "function_call") {
            const current = resolveToolAccumulator(tools, {
              ...(readString(item, "call_id") ? { callId: readString(item, "call_id")! } : {}),
              ...(readString(item, "id") ? { itemId: readString(item, "id")! } : {}),
            });
            applyProviderToolName(current, aliases, readString(item, "name"));
            current.argumentsJson = readString(item, "arguments") ?? current.argumentsJson;
          }
        } else if (type === "response.function_call_arguments.delta") {
          const callId = readString(event, "call_id");
          const itemId = readString(event, "item_id");
          if (callId || itemId) {
            const current = resolveToolAccumulator(tools, { ...(callId ? { callId } : {}), ...(itemId ? { itemId } : {}) });
            applyProviderToolName(current, aliases, readString(event, "name"));
            current.argumentsJson += readString(event, "delta") ?? "";
          }
        } else if (type === "response.function_call_arguments.done") {
          const callId = readString(event, "call_id");
          const itemId = readString(event, "item_id");
          if (callId || itemId) {
            const current = resolveToolAccumulator(tools, { ...(callId ? { callId } : {}), ...(itemId ? { itemId } : {}) });
            applyProviderToolName(current, aliases, readString(event, "name"));
            current.argumentsJson = readString(event, "arguments") ?? (current.argumentsJson || "{}");
          }
        } else if (type === "response.output_item.done") {
          const item = asRecord(event.item);
          if (item?.type === "function_call") {
            const callId = readString(item, "call_id");
            const itemId = readString(item, "id");
            const current = resolveToolAccumulator(tools, { ...(callId ? { callId } : {}), ...(itemId ? { itemId } : {}) });
            applyProviderToolName(current, aliases, readString(item, "name"));
            current.argumentsJson = readString(item, "arguments") ?? (current.argumentsJson || "{}");
            if (!current.emitted) yield toolCallEvent(current);
          }
        } else if (type === "response.completed" || type === "response.incomplete") {
          const responseRecord = asRecord(event.response);
          const usage = usageFromResponse(responseRecord);
          if (usage) yield { type: "usage", usage };
          for (const current of tools.accumulators) {
            if (!current.emitted) yield toolCallEvent(current);
          }
          terminal = true;
          {
            const providerResponseId = readString(responseRecord, "id");
            yield {
              type: "completed",
              stopReason: tools.accumulators.size > 0 ? "tool_calls" : type === "response.incomplete" ? "length" : "stop",
              ...(providerResponseId ? { providerResponseId } : {}),
            };
          }
          break;
        } else if (type === "error" || type === "response.failed") {
          throw normalizeFailure(event);
        }
      }
      if (!terminal) throw new ModelAdapterError("MODEL_STREAM_INVALID", "provider stream ended without a terminal event", true);
    },
  };
}

export function getPackageIdentity() {
  return { name: PACKAGE_NAME, version: PACKAGE_VERSION, boundary: PACKAGE_BOUNDARY } as const;
}
