export type HostErrorCode =
  | "HOST_ALREADY_RUNNING"
  | "HOST_LOCK_UNVERIFIED"
  | "HOST_STARTUP_FAILED"
  | "HOST_CONTROL_UNAVAILABLE"
  | "HOST_CONVERSATION_FAILED"
  | "HOST_INVALID_METADATA";

export class HostLifecycleError extends Error {
  public constructor(
    public readonly code: HostErrorCode,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "HostLifecycleError";
  }
}
