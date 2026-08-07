export type ModelMessageRole = "system" | "user" | "assistant" | "tool";

export interface ModelTextBlock {
  readonly type: "text";
  readonly text: string;
}

export interface ModelToolCallBlock {
  readonly type: "tool_call";
  readonly toolCallId: string;
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}

export interface ModelToolResultBlock {
  readonly type: "tool_result";
  readonly toolCallId: string;
  readonly name: string;
  readonly output: unknown;
  readonly isError: boolean;
}

export type ModelContentBlock = ModelTextBlock | ModelToolCallBlock | ModelToolResultBlock;

export interface ModelMessage {
  readonly role: ModelMessageRole;
  readonly content: readonly ModelContentBlock[];
}

export interface ModelToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface ModelRequest {
  readonly requestId: string;
  readonly provider: string;
  readonly model: string;
  readonly systemInstructions: string;
  readonly messages: readonly ModelMessage[];
  readonly tools: readonly ModelToolDefinition[];
  readonly maxOutputTokens: number;
  readonly signal?: AbortSignal;
}

export interface ModelUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export type ModelStopReason = "stop" | "tool_calls" | "length" | "cancelled";

export type ModelStreamEvent =
  | { readonly type: "started"; readonly providerResponseId?: string }
  | { readonly type: "text_delta"; readonly delta: string }
  | { readonly type: "reasoning_delta"; readonly delta: string }
  | {
      readonly type: "tool_call";
      readonly toolCallId: string;
      readonly name: string;
      readonly argumentsJson: string;
    }
  | { readonly type: "usage"; readonly usage: ModelUsage }
  | {
      readonly type: "completed";
      readonly stopReason: ModelStopReason;
      readonly providerResponseId?: string;
    };

export interface ModelAdapter {
  readonly providerId: string;
  stream(request: ModelRequest): AsyncIterable<ModelStreamEvent>;
}

export interface ModelAdapterResolution {
  readonly profile: string;
  readonly adapter: ModelAdapter;
  readonly provider: string;
  readonly model: string;
  readonly maxOutputTokens: number;
  readonly maxRetries: number;
}

export interface ModelAdapterResolver {
  resolve(profile: string): Promise<ModelAdapterResolution> | ModelAdapterResolution;
}
