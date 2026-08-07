import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import {
  OPENRILL_STATE_SCHEMA_VERSION,
  StateDatabaseError,
  applyStateMigrations,
  loadStateMigrations,
  openOpenRillStateDatabase,
  resolveStatePaths,
} from "../../packages/state/dist/index.js";
import { startLocalHost } from "../../services/agent-host/dist/index.js";

async function fixture(profile = "state", busyTimeoutMs = 1500) {
  const root = await mkdtemp(join(tmpdir(), "openrill-state-step005-"));
  const env = {
    OPENRILL_DATA_ROOT: join(root, "data"),
    OPENRILL_CONFIG_ROOT: join(root, "config"),
  };
  const profilePaths = resolveProfilePaths({ profile, env });
  const state = await openOpenRillStateDatabase({ profilePaths, busyTimeoutMs });
  return {
    root,
    env,
    profilePaths,
    state,
    cleanup: async () => {
      state.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

function rawDatabase(path, options = {}) {
  return new DatabaseSync(path, { enableForeignKeyConstraints: true, timeout: 500, ...options });
}

function checksum(sql) {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

test("state paths are profile-scoped and use target-platform semantics", () => {
  const winProfile = resolveProfilePaths({
    profile: "alpha",
    platform: "win32",
    homeDir: "C:\\Users\\Test",
    env: { LOCALAPPDATA: "C:\\Local", APPDATA: "C:\\Roaming" },
  });
  const unixProfile = resolveProfilePaths({
    profile: "alpha",
    platform: "linux",
    homeDir: "/home/test",
    env: {},
  });
  assert.deepEqual(resolveStatePaths(winProfile, { platform: "win32" }), {
    stateDir: "C:\\Local\\OpenRill\\alpha\\state",
    databasePath: "C:\\Local\\OpenRill\\alpha\\state\\agent.db",
    backupsDir: "C:\\Local\\OpenRill\\alpha\\state\\backups",
  });
  assert.deepEqual(resolveStatePaths(unixProfile, { platform: "linux" }), {
    stateDir: "/home/test/.local/share/openrill/alpha/state",
    databasePath: "/home/test/.local/share/openrill/alpha/state/agent.db",
    backupsDir: "/home/test/.local/share/openrill/alpha/state/backups",
  });
});

test("fresh open applies immutable migrations and configures WAL foreign keys and bounded busy timeout", async () => {
  const f = await fixture("fresh", 321);
  try {
    assert.equal(f.state.schemaVersion, OPENRILL_STATE_SCHEMA_VERSION);
    assert.deepEqual(f.state.appliedMigrations.map((item) => item.version), Array.from({ length: OPENRILL_STATE_SCHEMA_VERSION }, (_, index) => index + 1));
    assert.deepEqual(f.state.identity(), {
      product: "OpenRill",
      profile: "fresh",
      schemaVersion: OPENRILL_STATE_SCHEMA_VERSION,
      createdAt: f.state.identity().createdAt,
      updatedAt: f.state.identity().updatedAt,
    });
    const diagnostics = f.state.diagnostics({ full: true });
    assert.equal(diagnostics.healthy, true);
    assert.equal(diagnostics.journalMode, "wal");
    assert.equal(diagnostics.foreignKeys, true);
    assert.equal(diagnostics.synchronous, 1);
    assert.equal(diagnostics.busyTimeoutMs, 321);
    await access(f.state.paths.databasePath);
  } finally {
    await f.cleanup();
  }
});

test("second open is a migration no-op and preserves the ledger timestamps", async () => {
  const f = await fixture("noop");
  try {
    const first = f.state.appliedMigrations.map((item) => ({ ...item }));
    f.state.close();
    const reopened = await openOpenRillStateDatabase({ profilePaths: f.profilePaths });
    try {
      assert.deepEqual(reopened.appliedMigrations, first);
      assert.equal(reopened.identity().profile, "noop");
    } finally {
      reopened.close();
    }
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("the same migration runner performs a sequential upgrade fixture", async () => {
  const migrations = await loadStateMigrations();
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON;");
    assert.deepEqual(applyStateMigrations(database, migrations.slice(0, 1), { profile: "upgrade", now: () => 10 }).map((item) => item.version), [1]);
    assert.equal(database.prepare("PRAGMA user_version").get().user_version, 1);
    assert.deepEqual(applyStateMigrations(database, migrations, { profile: "upgrade", now: () => 20 }).map((item) => item.version), migrations.map((item) => item.version));
    assert.equal(database.prepare("PRAGMA user_version").get().user_version, OPENRILL_STATE_SCHEMA_VERSION);
  } finally {
    database.close();
  }
});

test("applied migration checksum drift is rejected before schema exposure", async () => {
  const migrations = await loadStateMigrations();
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON;");
    applyStateMigrations(database, migrations, { profile: "drift", now: () => 1 });
    const changedSql = `${migrations[1].sql}\n-- changed`;
    const drifted = migrations.map((migration, index) => index === 1 ? { ...migration, sql: changedSql, checksum: checksum(changedSql) } : migration);
    assert.throws(
      () => applyStateMigrations(database, drifted, { profile: "drift", now: () => 2 }),
      (error) => error instanceof StateDatabaseError && error.code === "STATE_MIGRATION_DRIFT",
    );
  } finally {
    database.close();
  }
});

test("a database from a newer schema version is refused", async () => {
  const migrations = await loadStateMigrations();
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`PRAGMA user_version = ${OPENRILL_STATE_SCHEMA_VERSION + 1};`);
    assert.throws(
      () => applyStateMigrations(database, migrations, { profile: "future" }),
      (error) => error instanceof StateDatabaseError && error.code === "STATE_SCHEMA_NEWER",
    );
  } finally {
    database.close();
  }
});

test("foreign key enforcement prevents identity from referencing an unknown migration", async () => {
  const f = await fixture("foreign-key");
  try {
    const database = rawDatabase(f.state.paths.databasePath);
    try {
      assert.throws(
        () => database.prepare("UPDATE state_identity SET schema_version = 999 WHERE id = 1").run(),
        /FOREIGN KEY constraint failed/i,
      );
    } finally {
      database.close();
    }
  } finally {
    await f.cleanup();
  }
});

test("repository transaction rolls back thrown and asynchronous callbacks", async () => {
  const f = await fixture("transaction");
  try {
    assert.throws(() => f.state.transaction((repository) => {
      repository.recordHealthCheck({ checkName: "rolled-back", status: "ok", details: {}, checkedAt: 1 });
      throw new Error("rollback");
    }), /rollback/);
    assert.equal(f.state.readHealthCheck("rolled-back"), null);

    assert.throws(
      () => f.state.transaction((repository) => {
        repository.recordHealthCheck({ checkName: "async", status: "ok", details: {}, checkedAt: 2 });
        return Promise.resolve("not allowed");
      }),
      (error) => error instanceof StateDatabaseError && error.code === "STATE_TRANSACTION_ASYNC",
    );
    assert.equal(f.state.readHealthCheck("async"), null);
  } finally {
    await f.cleanup();
  }
});

test("concurrent writer contention fails within the configured busy bound", async () => {
  const f = await fixture("busy", 80);
  const blocker = rawDatabase(f.state.paths.databasePath, { timeout: 0 });
  try {
    blocker.exec("PRAGMA journal_mode = WAL; BEGIN IMMEDIATE;");
    const started = Date.now();
    assert.throws(
      () => f.state.transaction((repository) => {
        repository.recordHealthCheck({ checkName: "blocked", status: "ok", details: {}, checkedAt: 1 });
      }),
      (error) => error instanceof StateDatabaseError && error.code === "STATE_BUSY",
    );
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 50, `busy wait too short: ${elapsed}`);
    assert.ok(elapsed < 1000, `busy wait unbounded: ${elapsed}`);
  } finally {
    try { blocker.exec("ROLLBACK;"); } catch {}
    blocker.close();
    await f.cleanup();
  }
});

test("foreign key corruption is detected on the next open", async () => {
  const f = await fixture("integrity");
  try {
    f.state.close();
    const corrupt = new DatabaseSync(f.state.paths.databasePath);
    try {
      corrupt.exec("PRAGMA foreign_keys = OFF; UPDATE state_identity SET schema_version = 999 WHERE id = 1;");
    } finally {
      corrupt.close();
    }
    await assert.rejects(
      () => openOpenRillStateDatabase({ profilePaths: f.profilePaths }),
      (error) => error instanceof StateDatabaseError && error.code === "STATE_INTEGRITY_FAILED",
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("online backup includes committed WAL state and passes full integrity", async () => {
  const f = await fixture("backup");
  try {
    f.state.recordHealthCheck({ checkName: "backup-proof", status: "ok", details: { durable: true }, checkedAt: 5 });
    const result = await f.state.backup({ now: () => new Date("2026-08-01T00:00:00.000Z") });
    assert.equal(result.integrity.healthy, true);
    assert.match(result.sha256, /^[0-9a-f]{64}$/);
    assert.ok(result.bytes > 0);
    const copy = new DatabaseSync(result.destination, { readOnly: true });
    try {
      const row = copy.prepare("SELECT details_json FROM state_health_checks WHERE check_name = 'backup-proof'").get();
      assert.deepEqual(JSON.parse(row.details_json), { durable: true });
    } finally {
      copy.close();
    }
  } finally {
    await f.cleanup();
  }
});

test("Host readiness requires migrated state and shutdown closes the database before releasing the profile", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-state-host-step005-"));
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") };
  const host = await startLocalHost({ profile: "host-state", port: 0, env });
  try {
    await host.ready;
    const statePaths = resolveStatePaths(host.paths);
    await access(statePaths.databasePath);
    await host.close("unit");
    const reopened = await openOpenRillStateDatabase({ profilePaths: host.paths });
    try {
      assert.equal(reopened.identity().profile, "host-state");
      assert.equal(reopened.diagnostics().healthy, true);
    } finally {
      reopened.close();
    }
  } finally {
    await host.close("cleanup").catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});
