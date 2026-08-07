export type SandboxErrorCode =
  | "SANDBOX_WORKSPACE_INVALID"
  | "SANDBOX_READ_WRITE_DENIED"
  | "SANDBOX_EXTRA_BIND_DENIED"
  | "SANDBOX_DOCKER_SOCKET_DENIED"
  | "SANDBOX_NETWORK_DENIED"
  | "SANDBOX_HOST_FALLBACK_DENIED"
  | "SANDBOX_BACKEND_UNAVAILABLE"
  | "SANDBOX_IMAGE_NOT_PINNED"
  | "SANDBOX_DOCKER_PATH_UNSUPPORTED"
  | "SANDBOX_START_FAILED"
  | "SANDBOX_EXEC_INVALID"
  | "SANDBOX_EXEC_FAILED"
  | "SANDBOX_CLOSED";

export class SandboxError extends Error {
  public constructor(
    public readonly code: SandboxErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SandboxError";
  }
}
