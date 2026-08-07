import { createHash } from "node:crypto";
import { chmod, mkdir, stat } from "node:fs/promises";
import { basename, dirname, resolve, toNamespacedPath } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import type { OpenRillProfilePaths } from "@openrill/config";
import { StateDatabaseError } from "./errors.js";
import { assertStateIntegrity, inspectStateIntegrity } from "./integrity.js";
import {
  OPENRILL_STATE_SCHEMA_VERSION,
  applyStateMigrations,
  loadStateMigrations,
  readAppliedStateMigrations,
  readStateIdentity,
} from "./migrations.js";
import { resolveStatePaths } from "./paths.js";
import { StateRepositories, runStateRepositoryTransaction } from "./repository.js";
import type {
  AppliedStateMigration,
  OpenRillStatePaths,
  StateBackupResult,
  StateCheckpointMode,
  StateCheckpointResult,
  StateDatabaseDiagnostics,
  StateHealthCheckRecord,
  StateHealthStatus,
  StateIdentity,
  StateMigration,
} from "./types.js";

export const DEFAULT_STATE_BUSY_TIMEOUT_MS = 1500 as const;
export const STATE_WAL_AUTOCHECKPOINT_PAGES = 1000 as const;
export const STATE_JOURNAL_SIZE_LIMIT_BYTES = 64 * 1024 * 1024;

function resolveSqliteLocation(pathname: string): string {
  const absolute = resolve(pathname);
  return process.platform === "win32" ? toNamespacedPath(absolute) : absolute;
}

function pragmaNumber(database: DatabaseSync, pragma: string): number {
  const row = database.prepare(`PRAGMA ${pragma};`).get() as Record<string, unknown> | undefined;
  const value = row?.[pragma] ?? (row ? Object.values(row)[0] : undefined);
  if (typeof value !== "number") {
    throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", `SQLite PRAGMA ${pragma} did not return a number`);
  }
  return value;
}

function pragmaString(database: DatabaseSync, pragma: string): string {
  const row = database.prepare(`PRAGMA ${pragma};`).get() as Record<string, unknown> | undefined;
  const value = row?.[pragma] ?? (row ? Object.values(row)[0] : undefined);
  if (typeof value !== "string") {
    throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", `SQLite PRAGMA ${pragma} did not return a string`);
  }
  return value;
}

function isSqliteBusy(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; errcode?: unknown };
  if (record.code === "ERR_SQLITE_ERROR" && typeof record.errcode === "number") {
    return (record.errcode & 0xff) === 5 || (record.errcode & 0xff) === 6;
  }
  return record.code === "SQLITE_BUSY" || record.code === "SQLITE_LOCKED";
}

function configureConnection(database: DatabaseSync, busyTimeoutMs: number): void {
  database.exec(`
    PRAGMA busy_timeout = ${busyTimeoutMs};
    PRAGMA foreign_keys = ON;
    PRAGMA trusted_schema = OFF;
    PRAGMA synchronous = NORMAL;
    PRAGMA wal_autocheckpoint = ${STATE_WAL_AUTOCHECKPOINT_PAGES};
    PRAGMA journal_size_limit = ${STATE_JOURNAL_SIZE_LIMIT_BYTES};
  `);
  const row = database.prepare("PRAGMA journal_mode = WAL;").get() as { journal_mode?: unknown } | undefined;
  if (String(row?.journal_mode ?? "").toLowerCase() !== "wal") {
    throw new StateDatabaseError(
      "STATE_SCHEMA_INCONSISTENT",
      `OpenRill state database requires WAL journal mode; got ${String(row?.journal_mode ?? "missing")}`,
    );
  }
}

function checkpoint(database: DatabaseSync, mode: StateCheckpointMode): StateCheckpointResult {
  const allowed: readonly StateCheckpointMode[] = ["PASSIVE", "FULL", "RESTART", "TRUNCATE"];
  if (!allowed.includes(mode)) throw new TypeError(`invalid SQLite checkpoint mode: ${mode}`);
  const row = database.prepare(`PRAGMA wal_checkpoint(${mode});`).get() as Record<string, unknown> | undefined;
  const values = row ? Object.values(row) : [];
  const busy = Number(row?.busy ?? values[0] ?? 0);
  const logFrames = Number(row?.log ?? values[1] ?? 0);
  const checkpointedFrames = Number(row?.checkpointed ?? values[2] ?? 0);
  return { busy, logFrames, checkpointedFrames };
}

async function hardenPath(pathname: string, mode: number): Promise<void> {
  if (process.platform === "win32") return;
  await chmod(pathname, mode);
}

function timestampForFilename(date: Date): string {
  return date.toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
}

export interface OpenRillStateDatabase {
  readonly paths: OpenRillStatePaths;
  readonly schemaVersion: number;
  readonly appliedMigrations: readonly AppliedStateMigration[];
  readonly identity: () => StateIdentity;
  readonly recordHealthCheck: (input: {
    readonly checkName: string;
    readonly status: StateHealthStatus;
    readonly details: unknown;
    readonly checkedAt?: number;
  }) => void;
  readonly readHealthCheck: (checkName: string) => StateHealthCheckRecord | null;
  readonly transaction: <T>(callback: (repositories: StateRepositories) => T) => T;
  readonly diagnostics: (options?: { readonly full?: boolean }) => StateDatabaseDiagnostics;
  readonly checkpoint: (mode?: StateCheckpointMode) => StateCheckpointResult;
  readonly backup: (options?: { readonly destination?: string; readonly now?: () => Date }) => Promise<StateBackupResult>;
  readonly close: (options?: { readonly checkpointMode?: StateCheckpointMode }) => void;
  readonly isOpen: () => boolean;
}

class OpenRillStateDatabaseImpl implements OpenRillStateDatabase {
  public readonly schemaVersion = OPENRILL_STATE_SCHEMA_VERSION;
  private readonly repositories: StateRepositories;

  public constructor(
    public readonly paths: OpenRillStatePaths,
    private readonly database: DatabaseSync,
    public readonly appliedMigrations: readonly AppliedStateMigration[],
    private readonly busyTimeoutMs: number,
  ) {
    this.repositories = new StateRepositories(database);
  }

  private assertOpen(): void {
    if (!this.database.isOpen) {
      throw new StateDatabaseError("STATE_CLOSED", "OpenRill state database is closed");
    }
  }

  public identity = (): StateIdentity => {
    this.assertOpen();
    return this.repositories.readIdentity();
  };

  public recordHealthCheck = (input: {
    readonly checkName: string;
    readonly status: StateHealthStatus;
    readonly details: unknown;
    readonly checkedAt?: number;
  }): void => {
    this.assertOpen();
    this.repositories.recordHealthCheck({ ...input, checkedAt: input.checkedAt ?? Date.now() });
  };

  public readHealthCheck = (checkName: string): StateHealthCheckRecord | null => {
    this.assertOpen();
    return this.repositories.readHealthCheck(checkName);
  };

  public transaction = <T>(callback: (repositories: StateRepositories) => T): T => {
    this.assertOpen();
    try {
      return runStateRepositoryTransaction(this.database, callback);
    } catch (error) {
      if (isSqliteBusy(error)) {
        throw new StateDatabaseError(
          "STATE_BUSY",
          `OpenRill state database remained busy after ${this.busyTimeoutMs}ms`,
          error,
        );
      }
      throw error;
    }
  };

  public diagnostics = (options: { readonly full?: boolean } = {}): StateDatabaseDiagnostics => {
    this.assertOpen();
    const integrity = inspectStateIntegrity(this.database, options);
    return {
      ...integrity,
      databasePath: this.paths.databasePath,
      schemaVersion: pragmaNumber(this.database, "user_version"),
      journalMode: pragmaString(this.database, "journal_mode").toLowerCase(),
      synchronous: pragmaNumber(this.database, "synchronous"),
      foreignKeys: pragmaNumber(this.database, "foreign_keys") === 1,
      busyTimeoutMs: pragmaNumber(this.database, "busy_timeout"),
      appliedMigrations: readAppliedStateMigrations(this.database),
    };
  };

  public checkpoint = (mode: StateCheckpointMode = "PASSIVE"): StateCheckpointResult => {
    this.assertOpen();
    return checkpoint(this.database, mode);
  };

  public backup = async (
    options: { readonly destination?: string; readonly now?: () => Date } = {},
  ): Promise<StateBackupResult> => {
    this.assertOpen();
    const destination = resolve(
      options.destination
        ?? resolve(this.paths.backupsDir, `agent-${timestampForFilename((options.now ?? (() => new Date()))())}.db`),
    );
    if (destination === resolve(this.paths.databasePath)) {
      throw new StateDatabaseError("STATE_BACKUP_FAILED", "State backup destination must differ from the source database");
    }
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    this.checkpoint("PASSIVE");
    let pages: number;
    try {
      pages = await backup(this.database, resolveSqliteLocation(destination), { rate: 100 });
    } catch (error) {
      throw new StateDatabaseError("STATE_BACKUP_FAILED", `OpenRill state backup failed: ${destination}`, error);
    }
    await hardenPath(destination, 0o600);
    const copy = new DatabaseSync(resolveSqliteLocation(destination), {
      readOnly: true,
      enableForeignKeyConstraints: true,
      timeout: this.busyTimeoutMs,
    });
    let integrity;
    try {
      integrity = assertStateIntegrity(copy, { full: true, databasePath: destination });
    } finally {
      copy.close();
    }
    const bytes = (await stat(destination)).size;
    const content = await import("node:fs/promises").then(({ readFile }) => readFile(destination));
    return {
      destination,
      pages,
      bytes,
      sha256: createHash("sha256").update(content).digest("hex"),
      integrity,
    };
  };

  public close = (options: { readonly checkpointMode?: StateCheckpointMode } = {}): void => {
    if (!this.database.isOpen) return;
    try {
      checkpoint(this.database, options.checkpointMode ?? "TRUNCATE");
    } finally {
      this.database.close();
    }
  };

  public isOpen = (): boolean => this.database.isOpen;
}

export async function openOpenRillStateDatabase(options: {
  readonly profilePaths: OpenRillProfilePaths;
  readonly platform?: NodeJS.Platform;
  readonly busyTimeoutMs?: number;
  readonly migrations?: readonly StateMigration[];
  readonly migrationDirectoryUrl?: URL;
  readonly now?: () => number;
}): Promise<OpenRillStateDatabase> {
  const busyTimeoutMs = options.busyTimeoutMs ?? DEFAULT_STATE_BUSY_TIMEOUT_MS;
  if (!Number.isInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 120_000) {
    throw new TypeError(`invalid state busy timeout: ${busyTimeoutMs}`);
  }
  const paths = resolveStatePaths(options.profilePaths, {
    ...(options.platform !== undefined ? { platform: options.platform } : {}),
  });
  await mkdir(paths.stateDir, { recursive: true, mode: 0o700 });
  await mkdir(paths.backupsDir, { recursive: true, mode: 0o700 });
  await hardenPath(paths.stateDir, 0o700);
  await hardenPath(paths.backupsDir, 0o700);

  let database: DatabaseSync;
  try {
    database = new DatabaseSync(resolveSqliteLocation(paths.databasePath), {
      timeout: busyTimeoutMs,
      enableForeignKeyConstraints: true,
      enableDoubleQuotedStringLiterals: false,
      allowExtension: false,
    });
  } catch (error) {
    throw new StateDatabaseError(
      "STATE_SQLITE_UNAVAILABLE",
      `OpenRill could not open the state database: ${paths.databasePath}`,
      error,
    );
  }

  try {
    configureConnection(database, busyTimeoutMs);
    const migrations = options.migrations
      ?? await loadStateMigrations(options.migrationDirectoryUrl);
    const currentVersion = pragmaNumber(database, "user_version");
    if (currentVersion > 0) {
      assertStateIntegrity(database, {
        full: currentVersion < migrations.length,
        databasePath: paths.databasePath,
      });
    }
    const appliedMigrations = applyStateMigrations(database, migrations, {
      profile: options.profilePaths.profile,
      ...(options.now !== undefined ? { now: options.now } : {}),
    });
    assertStateIntegrity(database, { databasePath: paths.databasePath });
    await hardenPath(paths.databasePath, 0o600);
    const identity = readStateIdentity(database);
    if (identity.schemaVersion !== OPENRILL_STATE_SCHEMA_VERSION) {
      throw new StateDatabaseError(
        "STATE_SCHEMA_INCONSISTENT",
        `OpenRill state identity schema ${identity.schemaVersion} does not match ${OPENRILL_STATE_SCHEMA_VERSION}`,
      );
    }
    return new OpenRillStateDatabaseImpl(paths, database, appliedMigrations, busyTimeoutMs);
  } catch (error) {
    try {
      database.close();
    } catch {
      // Preserve the original startup failure.
    }
    throw error;
  }
}
