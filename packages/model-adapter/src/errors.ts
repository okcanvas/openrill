export type ModelAdapterErrorCode =
  | "MODEL_ABORTED"
  | "MODEL_AUTH_FAILED"
  | "MODEL_RATE_LIMITED"
  | "MODEL_TRANSPORT_FAILED"
  | "MODEL_INVALID_REQUEST"
  | "MODEL_STREAM_INVALID"
  | "MODEL_PROVIDER_FAILED"
  | "MODEL_PROFILE_NOT_FOUND"
  | "MODEL_PROVIDER_UNSUPPORTED"
  | "MODEL_PROFILE_INVALID";

export class ModelAdapterError extends Error {
  public constructor(
    public readonly code: ModelAdapterErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ModelAdapterError";
  }
}

export function classifyHttpModelError(status: number, message: string): ModelAdapterError {
  if (status === 401 || status === 403) {
    return new ModelAdapterError("MODEL_AUTH_FAILED", message, false, status);
  }
  if (status === 408 || status === 409 || status === 429 || status >= 500) {
    return new ModelAdapterError(
      status === 429 ? "MODEL_RATE_LIMITED" : "MODEL_TRANSPORT_FAILED",
      message,
      true,
      status,
    );
  }
  return new ModelAdapterError("MODEL_INVALID_REQUEST", message, false, status);
}
