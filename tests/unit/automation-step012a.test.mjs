import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import {
  AutomationDefinitionService,
  AutomationError,
  computeNextScheduledFor,
  normalizeSchedule,
  normalizeTimezone,
} from "../../packages/automation/dist/index.js";
import {
  OPENRILL_STATE_SCHEMA_VERSION,
  applyStateMigrations,
  loadStateMigrations,
  openOpenRillStateDatabase,
} from "../../packages/state/dist/index.js";

async function fixture(profile = "automation") {
  const root = await mkdtemp(join(tmpdir(), "openrill-step012a-"));
  const profilePaths = resolveProfilePaths({
    profile,
    env: {
      OPENRILL_DATA_ROOT: join(root, "data"),
      OPENRILL_CONFIG_ROOT: join(root, "config"),
    },
  });
  const state = await openOpenRillStateDatabase({ profilePaths, busyTimeoutMs: 2_000 });
  let sequence = 0;
  let now = Date.parse("2026-08-02T00:00:00.000Z");
  const service = new AutomationDefinitionService({
    state,
    now: () => now,
    createId: () => `automation-${++sequence}`,
  });
  return {
    root,
    profilePaths,
    state,
    service,
    setNow(value) { now = value; },
    cleanup: async () => {
      state.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

function jobInput(overrides = {}) {
  return {
    name: "Daily review",
    enabled: true,
    schedule: { kind: "cron", expression: "0 9 * * 1-5" },
    timezone: "Asia/Seoul",
    conversationTemplate: {
      workspaceId: "main",
      prompt: "Review the project status.",
      modelProfile: "default",
      title: "Daily project review",
    },
    catchUpPolicy: { kind: "RUN_ONCE" },
    failurePolicy: {
      backoffMs: 60_000,
      maxConsecutiveFailures: 3,
      autoDisable: true,
    },
    ...overrides,
  };
}

function workerInsert(databasePath, runId, gate) {
  const source = String.raw`
    const { parentPort, workerData } = require("node:worker_threads");
    const { DatabaseSync } = require("node:sqlite");
    const gate = new Int32Array(workerData.gate);
    Atomics.add(gate, 0, 1);
    Atomics.notify(gate, 0);
    Atomics.wait(gate, 1, 0);
    const db = new DatabaseSync(workerData.databasePath, {
      timeout: 2000,
      enableForeignKeyConstraints: true,
    });
    try {
      db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 2000;");
      const result = db.prepare(
        "INSERT INTO automation_runs (automation_run_id,job_id,scheduled_for,claimed_at,lease_owner,lease_expires_at,run_id,status,attempt,error_code,created_at,updated_at) VALUES (?,?,?,NULL,NULL,NULL,NULL,'PENDING',0,NULL,?,?) ON CONFLICT(job_id,scheduled_for) DO NOTHING"
      ).run(workerData.runId, "automation-1", 1785715200000, 1, 1);
      parentPort.postMessage({ ok: true, changes: Number(result.changes) });
    } catch (error) {
      parentPort.postMessage({ ok: false, error: String(error && error.stack || error) });
    } finally {
      db.close();
    }
  `;
  return new Promise((resolve, reject) => {
    const worker = new Worker(source, {
      eval: true,
      workerData: { databasePath, runId, gate },
    });
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`worker exited ${code}`));
    });
  });
}

test("schema 9 retains automation domain tables and adds protocol run linkage", async () => {
  assert.ok(OPENRILL_STATE_SCHEMA_VERSION >= 9);
  const migrations = await loadStateMigrations();
  assert.ok(migrations.length >= 9);
  assert.equal(migrations[7].name, "automation_domain_persistence");
  assert.equal(migrations[8].name, "automation_protocol_run_linkage");

  const database = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
  try {
    applyStateMigrations(database, migrations.slice(0, 7), { profile: "upgrade", now: () => 10 });
    assert.equal(database.prepare("PRAGMA user_version").get().user_version, 7);
    assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE name='automation_jobs'").get().count, 0);
    applyStateMigrations(database, migrations.slice(0, 8), { profile: "upgrade", now: () => 20 });
    assert.equal(database.prepare("PRAGMA user_version").get().user_version, 8);
    assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE name='automation_jobs'").get().count, 1);
    assert.equal(database.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE name='automation_runs'").get().count, 1);
    applyStateMigrations(database, migrations.slice(0, 9), { profile: "upgrade", now: () => 30 });
    assert.equal(database.prepare("PRAGMA user_version").get().user_version, 9);
    const columns = database.prepare("PRAGMA table_info(automation_runs)").all().map((row) => row.name);
    assert.ok(columns.includes("trigger_kind"));
    assert.ok(columns.includes("request_key"));
  } finally {
    database.close();
  }
});

test("at schedules require exact absolute future timestamps and normalize to UTC", async () => {
  assert.deepEqual(normalizeSchedule({ kind: "at", at: "2026-08-03T09:00:00+09:00" }), {
    kind: "at",
    at: "2026-08-03T00:00:00.000Z",
  });
  const f = await fixture("at-policy");
  try {
    assert.throws(
      () => f.service.create(jobInput({ schedule: { kind: "at", at: "2026-08-01T00:00:00Z" } })),
      (error) => error instanceof AutomationError && error.code === "AUTOMATION_SCHEDULE_IN_PAST",
    );
    assert.throws(
      () => normalizeSchedule({ kind: "at", at: "2026-02-30T10:00:00Z" }),
      (error) => error instanceof AutomationError && error.code === "AUTOMATION_INVALID_SCHEDULE",
    );
  } finally {
    await f.cleanup();
  }
});

test("disabled one-shot jobs may preserve a past absolute schedule but enabling remains fail-closed", async () => {
  const f = await fixture("disabled-past");
  try {
    const created = f.service.create(jobInput({
      enabled: false,
      schedule: { kind: "at", at: "2026-08-01T00:00:00Z" },
    }));
    assert.equal(created.config.enabled, false);
    assert.equal(created.runtime.nextScheduledFor, null);
    assert.equal(created.config.schedule.at, "2026-08-01T00:00:00.000Z");
    assert.throws(
      () => f.service.update(created.jobId, created.revision, { enabled: true }),
      (error) => error instanceof AutomationError && error.code === "AUTOMATION_SCHEDULE_IN_PAST",
    );
    assert.equal(f.service.get(created.jobId).revision, created.revision);
  } finally {
    await f.cleanup();
  }
});

test("interval next occurrence uses anchor arithmetic without cumulative drift", () => {
  const schedule = { kind: "interval", everyMs: 90_000, anchorMs: 1_000 };
  assert.equal(computeNextScheduledFor(schedule, "UTC", 999), 1_000);
  assert.equal(computeNextScheduledFor(schedule, "UTC", 1_000), 91_000);
  assert.equal(computeNextScheduledFor(schedule, "UTC", 1_000 + 90_000 * 1_000_000 + 17), 1_000 + 90_000 * 1_000_001);
});

test("cron computes known UTC and Asia Seoul fixtures with Vixie day semantics", () => {
  assert.equal(
    computeNextScheduledFor(
      { kind: "cron", expression: "0 9 * * 1-5" },
      "UTC",
      Date.parse("2026-08-07T09:00:00.000Z"),
    ),
    Date.parse("2026-08-10T09:00:00.000Z"),
  );
  assert.equal(
    computeNextScheduledFor(
      { kind: "cron", expression: "0 9 * * *" },
      "Asia/Seoul",
      Date.parse("2026-08-02T00:01:00.000Z"),
    ),
    Date.parse("2026-08-03T00:00:00.000Z"),
  );
  assert.equal(normalizeTimezone("Asia/Seoul"), "Asia/Seoul");
});

test("cron accepts Sunday as either 0 or 7 without corrupting ranges", () => {
  const after = Date.parse("2026-08-02T00:01:00.000Z");
  assert.equal(
    computeNextScheduledFor({ kind: "cron", expression: "0 9 * * 0" }, "UTC", after),
    Date.parse("2026-08-02T09:00:00.000Z"),
  );
  assert.equal(
    computeNextScheduledFor({ kind: "cron", expression: "0 9 * * 7" }, "UTC", after),
    Date.parse("2026-08-02T09:00:00.000Z"),
  );
  assert.equal(
    computeNextScheduledFor({ kind: "cron", expression: "0 9 * * 6-7" }, "UTC", after),
    Date.parse("2026-08-02T09:00:00.000Z"),
  );
});

test("DST spring gaps are skipped and fall repeated wall minutes are distinct instants", () => {
  assert.equal(
    computeNextScheduledFor(
      { kind: "cron", expression: "30 2 * * *" },
      "America/New_York",
      Date.parse("2026-03-07T07:31:00.000Z"),
    ),
    Date.parse("2026-03-09T06:30:00.000Z"),
  );
  assert.equal(
    computeNextScheduledFor(
      { kind: "cron", expression: "30 1 * * *" },
      "America/New_York",
      Date.parse("2026-11-01T05:00:00.000Z"),
    ),
    Date.parse("2026-11-01T05:30:00.000Z"),
  );
  assert.equal(
    computeNextScheduledFor(
      { kind: "cron", expression: "30 1 * * *" },
      "America/New_York",
      Date.parse("2026-11-01T05:30:00.000Z"),
    ),
    Date.parse("2026-11-01T06:30:00.000Z"),
  );
});

test("invalid timezone and unsupported cron grammar fail closed", () => {
  assert.throws(
    () => normalizeTimezone("Mars/Olympus"),
    (error) => error instanceof AutomationError && error.code === "AUTOMATION_INVALID_TIMEZONE",
  );
  for (const expression of ["* * * *", "0 0 JAN * *", "0 0 1-5/0 * *", "0 0 5-1 * *", "0 0 1 * MON"]) {
    assert.throws(
      () => computeNextScheduledFor({ kind: "cron", expression }, "UTC", 1),
      (error) => error instanceof AutomationError && error.code === "AUTOMATION_INVALID_SCHEDULE",
      expression,
    );
  }
});

test("job config revision and runtime state mutate through separate repository paths", async () => {
  const f = await fixture("separation");
  try {
    const created = f.service.create(jobInput());
    assert.equal(created.revision, 1);
    assert.equal(created.runtime.consecutiveFailures, 0);
    const runtime = f.service.updateRuntime({
      jobId: created.jobId,
      nextScheduledFor: created.runtime.nextScheduledFor + 86_400_000,
      lastScheduledFor: created.runtime.nextScheduledFor,
      consecutiveFailures: 2,
    });
    assert.equal(runtime.revision, 1);
    assert.equal(runtime.config.name, "Daily review");
    assert.equal(runtime.runtime.consecutiveFailures, 2);

    f.setNow(Date.parse("2026-08-02T01:00:00.000Z"));
    const updated = f.service.update(created.jobId, 1, { name: "Renamed review" });
    assert.equal(updated.revision, 2);
    assert.equal(updated.config.name, "Renamed review");
    assert.equal(updated.runtime.lastScheduledFor, runtime.runtime.lastScheduledFor);
    assert.equal(updated.runtime.consecutiveFailures, 2);
  } finally {
    await f.cleanup();
  }
});

test("stale config revision is rejected without changing runtime or config", async () => {
  const f = await fixture("revision");
  try {
    const created = f.service.create(jobInput());
    const updated = f.service.update(created.jobId, 1, { enabled: false });
    assert.equal(updated.revision, 2);
    assert.equal(updated.runtime.nextScheduledFor, null);
    assert.throws(
      () => f.service.update(created.jobId, 1, { name: "stale" }),
      (error) => error instanceof AutomationError && error.code === "AUTOMATION_REVISION_CONFLICT",
    );
    assert.equal(f.service.get(created.jobId).config.name, "Daily review");
  } finally {
    await f.cleanup();
  }
});

test("conversation template, catch-up, and failure policy are validated and detached", async () => {
  const f = await fixture("validation");
  try {
    const input = jobInput({
      catchUpPolicy: { kind: "BOUNDED", limit: 4 },
      conversationTemplate: { workspaceId: "main", prompt: "Original" },
    });
    const created = f.service.create(input);
    input.conversationTemplate.prompt = "Mutated";
    assert.equal(f.service.get(created.jobId).config.conversationTemplate.prompt, "Original");
    assert.deepEqual(created.config.catchUpPolicy, { kind: "BOUNDED", limit: 4 });
    assert.throws(
      () => f.service.create(jobInput({ catchUpPolicy: { kind: "BOUNDED", limit: 0 } })),
      (error) => error instanceof AutomationError && error.code === "AUTOMATION_INVALID_ARGUMENT",
    );
  } finally {
    await f.cleanup();
  }
});

test("same job and scheduled_for produces exactly one AutomationRun identity", async () => {
  const f = await fixture("idempotency");
  try {
    const job = f.service.create(jobInput());
    const first = f.service.reserveRun(job.jobId, job.runtime.nextScheduledFor);
    const second = f.service.reserveRun(job.jobId, job.runtime.nextScheduledFor);
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.run.automationRunId, first.run.automationRunId);
    assert.equal(f.service.listRuns(job.jobId).length, 1);
  } finally {
    await f.cleanup();
  }
});

test("two simultaneous SQLite writers have one scheduled_for winner", async () => {
  const f = await fixture("concurrent-run");
  try {
    const job = f.service.create(jobInput({ schedule: { kind: "at", at: "2026-08-03T00:00:00Z" } }));
    assert.equal(job.jobId, "automation-1");
    f.state.checkpoint("FULL");
    const shared = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
    const gate = new Int32Array(shared);
    const left = workerInsert(f.state.paths.databasePath, "worker-left", shared);
    const right = workerInsert(f.state.paths.databasePath, "worker-right", shared);
    while (Atomics.load(gate, 0) < 2) Atomics.wait(gate, 0, Atomics.load(gate, 0), 100);
    Atomics.store(gate, 1, 1);
    Atomics.notify(gate, 1, 2);
    const results = await Promise.all([left, right]);
    assert.equal(results.every((result) => result.ok), true, JSON.stringify(results));
    assert.deepEqual(results.map((result) => result.changes).sort(), [0, 1]);
    const count = f.state.transaction((repositories) => repositories.automations.listRuns(job.jobId).length);
    assert.equal(count, 1);
  } finally {
    await f.cleanup();
  }
});

test("STEP012A package has no timer, model, protocol operation, or UI side effect", async () => {
  const source = [
    await readFile(new URL("../../packages/automation/src/schedule.ts", import.meta.url), "utf8"),
    await readFile(new URL("../../packages/automation/src/service.ts", import.meta.url), "utf8"),
  ].join("\n");
  assert.doesNotMatch(source, /\bset(?:Timeout|Interval)\s*\(/);
  assert.doesNotMatch(source, /@openrill\/(?:agent-kernel|conversations|model-|web)/);
  assert.doesNotMatch(source, /automation\.(?:create|list|get|update|run_now|history)/);
});
