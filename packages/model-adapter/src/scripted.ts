import { ModelAdapterError } from "./errors.js";
import type { ModelAdapter, ModelRequest, ModelStreamEvent } from "./types.js";

export type ScriptedModelTurn =
  | { readonly kind: "events"; readonly events: readonly ModelStreamEvent[] }
  | { readonly kind: "error"; readonly error: ModelAdapterError };

export interface ScriptedModelAdapterOptions {
  readonly providerId?: string;
  readonly turns: readonly ScriptedModelTurn[];
  readonly onRequest?: (request: ModelRequest, turnIndex: number) => void;
}

export function createScriptedModelAdapter(options: ScriptedModelAdapterOptions): ModelAdapter {
  let cursor = 0;
  return {
    providerId: options.providerId ?? "scripted",
    async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
      if (request.signal?.aborted) {
        throw new ModelAdapterError("MODEL_ABORTED", "model request was aborted", false);
      }
      const index = cursor++;
      options.onRequest?.(request, index);
      const turn = options.turns[index];
      if (!turn) {
        throw new ModelAdapterError(
          "MODEL_PROVIDER_FAILED",
          `scripted model turn ${index} is not configured`,
          false,
        );
      }
      if (turn.kind === "error") throw turn.error;
      for (const event of turn.events) {
        if (request.signal?.aborted) {
          throw new ModelAdapterError("MODEL_ABORTED", "model request was aborted", false);
        }
        yield event;
      }
    },
  };
}
