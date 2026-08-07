export type StateDatabaseErrorCode =
  | "STATE_SQLITE_UNAVAILABLE"
  | "STATE_MIGRATION_SET_INVALID"
  | "STATE_MIGRATION_DRIFT"
  | "STATE_SCHEMA_NEWER"
  | "STATE_SCHEMA_INCONSISTENT"
  | "STATE_OWNERSHIP_MISMATCH"
  | "STATE_INTEGRITY_FAILED"
  | "STATE_BUSY"
  | "STATE_CONFLICT"
  | "STATE_TRANSACTION_ASYNC"
  | "STATE_CLOSED"
  | "STATE_BACKUP_FAILED";

export class StateDatabaseError extends Error {
  public constructor(
    public readonly code: StateDatabaseErrorCode,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StateDatabaseError";
  }
}
