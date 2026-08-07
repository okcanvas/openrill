export interface OpenRillStatePaths {
  readonly stateDir: string;
  readonly databasePath: string;
  readonly backupsDir: string;
}

export interface StateMigration {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
  readonly sql: string;
}

export interface AppliedStateMigration {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
  readonly appliedAt: number;
}

export interface StateIdentity {
  readonly product: "OpenRill";
  readonly profile: string;
  readonly schemaVersion: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type StateHealthStatus = "ok" | "warning" | "failed";

export interface StateHealthCheckRecord {
  readonly checkName: string;
  readonly status: StateHealthStatus;
  readonly details: unknown;
  readonly checkedAt: number;
}

export interface StateIntegrityResult {
  readonly healthy: boolean;
  readonly quickCheck: readonly string[];
  readonly integrityCheck: readonly string[] | null;
  readonly foreignKeyViolations: readonly Readonly<Record<string, unknown>>[];
}

export interface StateDatabaseDiagnostics extends StateIntegrityResult {
  readonly databasePath: string;
  readonly schemaVersion: number;
  readonly journalMode: string;
  readonly synchronous: number;
  readonly foreignKeys: boolean;
  readonly busyTimeoutMs: number;
  readonly appliedMigrations: readonly AppliedStateMigration[];
}

export type StateCheckpointMode = "PASSIVE" | "FULL" | "RESTART" | "TRUNCATE";

export interface StateCheckpointResult {
  readonly busy: number;
  readonly logFrames: number;
  readonly checkpointedFrames: number;
}

export interface StateBackupResult {
  readonly destination: string;
  readonly pages: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly integrity: StateIntegrityResult;
}
