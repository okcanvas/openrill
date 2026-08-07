import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { DatabaseSync } from "node:sqlite";
import { StateDatabaseError } from "./errors.js";
import { assertStateIntegrity } from "./integrity.js";
import { runImmediateStateTransaction } from "./transaction.js";
import type { AppliedStateMigration, StateIdentity, StateMigration } from "./types.js";

export const OPENRILL_STATE_SCHEMA_VERSION = 26 as const;
const MIGRATION_FILE_PATTERN = /^(\d{3})_([a-z0-9_]+)\.sql$/;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function loadStateMigrations(
  directoryUrl: URL = new URL("./migrations/", import.meta.url),
): Promise<readonly StateMigration[]> {
  const entries = (await readdir(directoryUrl, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && MIGRATION_FILE_PATTERN.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  const migrations: StateMigration[] = [];
  for (const entry of entries) {
    const match = MIGRATION_FILE_PATTERN.exec(entry.name)!;
    const version = Number(match[1]);
    const sql = await readFile(new URL(entry.name, directoryUrl), "utf8");
    migrations.push({ version, name: match[2]!, checksum: sha256(sql), sql });
  }
  assertStateMigrationSet(migrations);
  return migrations;
}

export function assertStateMigrationSet(migrations: readonly StateMigration[]): void {
  if (migrations.length === 0) {
    throw new StateDatabaseError("STATE_MIGRATION_SET_INVALID", "OpenRill state migration set is empty");
  }
  const versions = new Set<number>();
  const names = new Set<string>();
  migrations.forEach((migration, index) => {
    const expectedVersion = index + 1;
    if (migration.version !== expectedVersion || !Number.isInteger(migration.version)) {
      throw new StateDatabaseError(
        "STATE_MIGRATION_SET_INVALID",
        `OpenRill state migrations must be contiguous from 1; expected ${expectedVersion}, found ${migration.version}`,
      );
    }
    if (!/^[a-z0-9_]+$/.test(migration.name) || versions.has(migration.version) || names.has(migration.name)) {
      throw new StateDatabaseError(
        "STATE_MIGRATION_SET_INVALID",
        `OpenRill state migration identity is invalid or duplicated: ${migration.version}_${migration.name}`,
      );
    }
    if (!/^[0-9a-f]{64}$/.test(migration.checksum) || migration.checksum !== sha256(migration.sql)) {
      throw new StateDatabaseError(
        "STATE_MIGRATION_SET_INVALID",
        `OpenRill state migration checksum is invalid: ${migration.version}_${migration.name}`,
      );
    }
    versions.add(migration.version);
    names.add(migration.name);
  });
}

export function ensureMigrationLedger(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER NOT NULL PRIMARY KEY CHECK (version > 0),
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL CHECK (length(checksum) = 64),
      applied_at INTEGER NOT NULL
    ) STRICT;
  `);
}

export function readAppliedStateMigrations(database: DatabaseSync): readonly AppliedStateMigration[] {
  ensureMigrationLedger(database);
  const rows = database.prepare(`
    SELECT version, name, checksum, applied_at AS appliedAt
    FROM schema_migrations
    ORDER BY version
  `).all() as unknown as readonly AppliedStateMigration[];
  return rows.map((row) => ({
    version: row.version,
    name: row.name,
    checksum: row.checksum,
    appliedAt: row.appliedAt,
  }));
}

function readUserVersion(database: DatabaseSync): number {
  const row = database.prepare("PRAGMA user_version;").get() as { user_version?: unknown } | undefined;
  const value = row?.user_version;
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "SQLite user_version is invalid");
  }
  return value as number;
}

function tableExists(database: DatabaseSync, tableName: string): boolean {
  return Boolean(
    database.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ? LIMIT 1")
      .get(tableName),
  );
}

function reconcileStateIdentity(
  database: DatabaseSync,
  profile: string,
  schemaVersion: number,
  now: number,
): void {
  if (!tableExists(database, "state_identity")) return;
  const existing = database.prepare(`
    SELECT product, profile, schema_version AS schemaVersion,
           created_at AS createdAt, updated_at AS updatedAt
    FROM state_identity WHERE id = 1
  `).get() as StateIdentity | undefined;
  if (!existing) {
    database.prepare(`
      INSERT INTO state_identity
        (id, product, profile, schema_version, created_at, updated_at)
      VALUES (1, 'OpenRill', ?, ?, ?, ?)
    `).run(profile, schemaVersion, now, now);
    return;
  }
  if (existing.product !== "OpenRill" || existing.profile !== profile) {
    throw new StateDatabaseError(
      "STATE_OWNERSHIP_MISMATCH",
      `OpenRill state database belongs to product=${existing.product} profile=${existing.profile}; requested profile=${profile}`,
    );
  }
  database.prepare(`
    UPDATE state_identity
    SET schema_version = ?, updated_at = ?
    WHERE id = 1
  `).run(schemaVersion, now);
}

export function readStateIdentity(database: DatabaseSync): StateIdentity {
  const row = database.prepare(`
    SELECT product, profile, schema_version AS schemaVersion,
           created_at AS createdAt, updated_at AS updatedAt
    FROM state_identity WHERE id = 1
  `).get() as StateIdentity | undefined;
  if (!row || row.product !== "OpenRill") {
    throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "OpenRill state identity row is missing or invalid");
  }
  return {
    product: row.product,
    profile: row.profile,
    schemaVersion: row.schemaVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function applyStateMigrations(
  database: DatabaseSync,
  migrations: readonly StateMigration[],
  options: { readonly profile: string; readonly now?: () => number },
): readonly AppliedStateMigration[] {
  assertStateMigrationSet(migrations);
  ensureMigrationLedger(database);
  const now = options.now ?? Date.now;
  const currentVersion = readUserVersion(database);
  const targetVersion = migrations[migrations.length - 1]!.version;
  if (currentVersion > targetVersion) {
    throw new StateDatabaseError(
      "STATE_SCHEMA_NEWER",
      `OpenRill state database schema ${currentVersion} is newer than supported schema ${targetVersion}`,
    );
  }

  const applied = readAppliedStateMigrations(database);
  const migrationByVersion = new Map(migrations.map((migration) => [migration.version, migration]));
  for (const row of applied) {
    const expected = migrationByVersion.get(row.version);
    if (!expected || expected.name !== row.name || expected.checksum !== row.checksum) {
      throw new StateDatabaseError(
        "STATE_MIGRATION_DRIFT",
        `OpenRill state migration drift at version ${row.version}: stored=${row.name}:${row.checksum} expected=${expected ? `${expected.name}:${expected.checksum}` : "missing"}`,
      );
    }
  }
  const highestApplied = applied.at(-1)?.version ?? 0;
  if (highestApplied !== currentVersion) {
    throw new StateDatabaseError(
      "STATE_SCHEMA_INCONSISTENT",
      `OpenRill state migration ledger version ${highestApplied} does not match SQLite user_version ${currentVersion}`,
    );
  }

  if (currentVersion > 0 && currentVersion < targetVersion) {
    assertStateIntegrity(database, { full: true });
  }

  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;
    runImmediateStateTransaction(database, () => {
      database.exec(migration.sql);
      const appliedAt = now();
      database.prepare(`
        INSERT INTO schema_migrations (version, name, checksum, applied_at)
        VALUES (?, ?, ?, ?)
      `).run(migration.version, migration.name, migration.checksum, appliedAt);
      reconcileStateIdentity(database, options.profile, migration.version, appliedAt);
      database.exec(`PRAGMA user_version = ${migration.version};`);
    });
  }

  const finalVersion = readUserVersion(database);
  if (finalVersion !== targetVersion) {
    throw new StateDatabaseError(
      "STATE_SCHEMA_INCONSISTENT",
      `OpenRill state database ended at schema ${finalVersion}; expected ${targetVersion}`,
    );
  }
  const identity = readStateIdentity(database);
  if (identity.profile !== options.profile || identity.schemaVersion !== targetVersion) {
    throw new StateDatabaseError(
      "STATE_OWNERSHIP_MISMATCH",
      `OpenRill state identity mismatch after migration: profile=${identity.profile} schema=${identity.schemaVersion}`,
    );
  }
  return readAppliedStateMigrations(database);
}
