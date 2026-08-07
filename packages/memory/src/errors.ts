export type MemoryErrorCode =
  | "MEMORY_TEXT_INVALID"
  | "MEMORY_QUERY_INVALID"
  | "MEMORY_NOT_FOUND"
  | "MEMORY_SENSITIVE_CONTENT_REJECTED";

export class MemoryError extends Error {
  public constructor(public readonly code: MemoryErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MemoryError";
  }
}
