import type { DatabaseSync } from "node:sqlite";
import { StateDatabaseError } from "./errors.js";

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(value && typeof (value as { then?: unknown }).then === "function");
}

export function runImmediateStateTransaction<T>(database: DatabaseSync, operation: () => T): T {
  database.exec("BEGIN IMMEDIATE;");
  try {
    const result = operation();
    if (isPromiseLike(result)) {
      throw new StateDatabaseError(
        "STATE_TRANSACTION_ASYNC",
        "OpenRill SQLite transactions must be synchronous; Promise returns are not supported.",
      );
    }
    database.exec("COMMIT;");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK;");
    } catch {
      // Preserve the original failure. SQLite may already have rolled back a failed statement.
    }
    throw error;
  }
}
