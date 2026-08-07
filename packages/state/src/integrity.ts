import type { DatabaseSync } from "node:sqlite";
import { StateDatabaseError } from "./errors.js";
import type { StateIntegrityResult } from "./types.js";

function pragmaRows(database: DatabaseSync, pragma: "quick_check" | "integrity_check"): string[] {
  try {
    const rows = database.prepare(`PRAGMA ${pragma};`).all() as Array<Record<string, unknown>>;
    return rows.map((row) => String(row[pragma] ?? Object.values(row)[0] ?? "missing"));
  } catch (error) {
    throw new StateDatabaseError(
      "STATE_INTEGRITY_FAILED",
      `SQLite ${pragma} could not run`,
      error,
    );
  }
}

export function inspectStateIntegrity(
  database: DatabaseSync,
  options: { readonly full?: boolean } = {},
): StateIntegrityResult {
  const quickCheck = pragmaRows(database, "quick_check");
  const integrityCheck = options.full === true ? pragmaRows(database, "integrity_check") : null;
  let foreignKeyViolations: Array<Readonly<Record<string, unknown>>>;
  try {
    foreignKeyViolations = database.prepare("PRAGMA foreign_key_check;").all() as Array<
      Readonly<Record<string, unknown>>
    >;
  } catch (error) {
    throw new StateDatabaseError(
      "STATE_INTEGRITY_FAILED",
      "SQLite foreign_key_check could not run",
      error,
    );
  }
  const healthy =
    quickCheck.length === 1
    && quickCheck[0] === "ok"
    && (integrityCheck === null || (integrityCheck.length === 1 && integrityCheck[0] === "ok"))
    && foreignKeyViolations.length === 0;
  return { healthy, quickCheck, integrityCheck, foreignKeyViolations };
}

export function assertStateIntegrity(
  database: DatabaseSync,
  options: { readonly full?: boolean; readonly databasePath?: string } = {},
): StateIntegrityResult {
  const result = inspectStateIntegrity(database, options);
  if (!result.healthy) {
    const details = [
      `quick=${result.quickCheck.join(";")}`,
      result.integrityCheck ? `integrity=${result.integrityCheck.join(";")}` : null,
      result.foreignKeyViolations.length > 0
        ? `foreignKeys=${JSON.stringify(result.foreignKeyViolations.slice(0, 5))}`
        : null,
    ].filter(Boolean).join(" ");
    throw new StateDatabaseError(
      "STATE_INTEGRITY_FAILED",
      `OpenRill state database integrity failed${options.databasePath ? ` at ${options.databasePath}` : ""}: ${details}`,
    );
  }
  return result;
}
