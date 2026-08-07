import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import {
  AutomationDefinitionService,
  AutomationError,
  AutomationScheduler,
} from "../../packages/automation/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { startLocalHost } from "../../services/agent-host/dist/index.js";

async function fixture(profile = "scheduler") {
  const root = await mkdtemp(join(tmpdir(), "openrill-step012b-"));
  const env = {
    OPENRILL_DATA_ROOT: join(root, "data"),
    OPENRILL_CONFIG_ROOT: join(root, "config"),
  };
  const profilePaths = resolveProfilePaths({ profile, env });
  const state = await openOpenRillStateDatabase({ profilePaths, busyTimeoutMs: 2_000 });
  let now = 0;
  let jobSequence = 0;
  let runSequence = 0;
  const definitions = new AutomationDefinitionService({
    state,
    now: () => now,
    createId: () => `job-${++jobSequence}`,
  });
  const scheduler = (executor, overrides = {}) => new AutomationScheduler({
    state,
    executor,
    ownerId: overrides.ownerId ?? "scheduler-owner",
    now: () => now,
    createId: () => `scheduled-run-${++runSequence}`,
    autoArm: false,
    leaseDurationMs: 1_000,
    renewIntervalMs: 100,
    ...overrides,
  });
  return {
    root,
    env,
    profilePaths,
    state,
    definitions,
    scheduler,
    setNow(value) { now = value; },
    cleanup: async () => {
      if (state.isOpen()) state.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

function jobInput(name, catchUpPolicy, overrides = {}) {
  return {
    name,
    enabled: true,
    schedule: { kind: "interval", everyMs: 1_000, anchorMs: 1_000 },
    timezone: "UTC",
    conversationTemplate: { workspaceId: "main", prompt: `Run ${name}` },
    catchUpPolicy,
    failurePolicy: { backoffMs: 0, maxConsecutiveFailures: 3, autoDisable: false },
    ...overrides,
  };
}

function hostConfig(automationEnabled) {
  return {
    version: 1,
    host: { bind: "127.0.0.1", port: 0 },
    modelProviders: {},
    workspaces: [],
    execution: { approvalMode: "ask", defaultTimeoutMs: 120_000, approvalTimeoutMs: 120_000 },
    skills: { roots: [], enabled: [] },
    automation: { enabled: automationEnabled },
    browser: { enabled: false, headless: true, launchTimeoutMs: 30_000, actionTimeoutMs: 15_000, idleTimeoutMs: 300_000, sweepIntervalMs: 30_000, maxSessions: 4, maxPagesPerSession: 8, allowPrivateNetwork: false, allowedHostnames: [] },
    ui: { openOnStart: false },
  };
}

async function waitFor(promise, timeoutMs = 2_000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timed out")), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

test("startup catch-up applies SKIP, RUN_ONCE, and bounded oldest-first policies", async () => {
  const f = await fixture("catch-up");
  const executed = [];
  const scheduler = f.scheduler(async ({ job, run }) => {
    executed.push([job.config.name, run.scheduledFor]);
    return { status: "SUCCEEDED" };
  });
  try {
    const skipped = f.definitions.create(jobInput("skip", { kind: "SKIP" }));
    const once = f.definitions.create(jobInput("once", { kind: "RUN_ONCE" }));
    const bounded = f.definitions.create(jobInput("bounded", { kind: "BOUNDED", limit: 2 }));
    f.setNow(5_500);
    await scheduler.start();
    const result = await scheduler.wake();
    assert.deepEqual(result, {
      materializedRuns: 0,
      skippedRuns: 0,
      claimedRuns: 3,
      succeededRuns: 3,
      failedRuns: 0,
    });
    assert.deepEqual(executed, [
      ["once", 1_000],
      ["bounded", 1_000],
      ["bounded", 2_000],
    ]);
    assert.deepEqual(f.definitions.listRuns(skipped.jobId).map((run) => [run.scheduledFor, run.status, run.errorCode]), [
      [1_000, "SKIPPED", "AUTOMATION_CATCH_UP_SKIPPED"],
    ]);
    assert.equal(f.definitions.get(skipped.jobId).runtime.nextScheduledFor, 6_000);
    assert.equal(f.definitions.get(once.jobId).runtime.nextScheduledFor, 6_000);
    assert.equal(f.definitions.get(bounded.jobId).runtime.nextScheduledFor, 6_000);
  } finally {
    await scheduler.close();
    await f.cleanup();
  }
});

test("regular wake materializes one due occurrence and advances from the scheduled anchor", async () => {
  const f = await fixture("regular");
  const seen = [];
  const scheduler = f.scheduler(async ({ run }) => {
    seen.push(run.scheduledFor);
    return { status: "SUCCEEDED" };
  });
  try {
    const job = f.definitions.create(jobInput("regular", { kind: "RUN_ONCE" }));
    await scheduler.start();
    f.setNow(1_000);
    const result = await scheduler.wake();
    assert.equal(result.materializedRuns, 1);
    assert.equal(result.claimedRuns, 1);
    assert.deepEqual(seen, [1_000]);
    assert.equal(f.definitions.get(job.jobId).runtime.nextScheduledFor, 2_000);
    assert.equal(f.definitions.get(job.jobId).runtime.lastScheduledFor, 1_000);
  } finally {
    await scheduler.close();
    await f.cleanup();
  }
});

test("scheduler renews the owned lease while the executor remains active", async () => {
  const f = await fixture("renewal");
  const timers = [];
  let enteredResolve;
  const entered = new Promise((resolve) => { enteredResolve = resolve; });
  let releaseResolve;
  const release = new Promise((resolve) => { releaseResolve = resolve; });
  const scheduler = f.scheduler(async () => {
    enteredResolve();
    await release;
    return { status: "SUCCEEDED" };
  }, {
    setTimer(callback, delayMs) {
      const handle = { callback, delayMs, cleared: false, unref() {} };
      timers.push(handle);
      return handle;
    },
    clearTimer(handle) { handle.cleared = true; },
  });
  try {
    f.definitions.create(jobInput("renew", { kind: "RUN_ONCE" }));
    await scheduler.start();
    f.setNow(1_000);
    const waking = scheduler.wake();
    await entered;
    const firstRenewal = timers.find((timer) => !timer.cleared && timer.delayMs === 100);
    assert.ok(firstRenewal);
    f.setNow(1_500);
    firstRenewal.callback();
    const run = f.state.transaction((repositories) => repositories.automations.listClaimableRuns(10));
    assert.equal(run.length, 0);
    const stored = f.definitions.listRuns("job-1")[0];
    assert.equal(stored.status, "RUNNING");
    assert.equal(stored.leaseExpiresAt, 2_500);
    releaseResolve();
    await waking;
    assert.equal(f.definitions.listRuns("job-1")[0].status, "SUCCEEDED");
  } finally {
    releaseResolve?.();
    await scheduler.close();
    await f.cleanup();
  }
});

test("failed executor outcomes are durable and increment runtime failure state", async () => {
  const f = await fixture("failure-outcome");
  const scheduler = f.scheduler(async () => ({ status: "FAILED", errorCode: "TEST_EXECUTION_FAILED" }));
  try {
    const job = f.definitions.create(jobInput("failure", { kind: "RUN_ONCE" }));
    await scheduler.start();
    f.setNow(1_000);
    const result = await scheduler.wake();
    assert.equal(result.failedRuns, 1);
    assert.deepEqual(
      f.definitions.listRuns(job.jobId).map((run) => [run.status, run.errorCode]),
      [["FAILED", "TEST_EXECUTION_FAILED"]],
    );
    assert.equal(f.definitions.get(job.jobId).runtime.consecutiveFailures, 1);
    assert.equal(f.definitions.get(job.jobId).runtime.lastScheduledFor, 1_000);
  } finally {
    await scheduler.close();
    await f.cleanup();
  }
});

test("two scheduler owners have exactly one transactional claim winner", async () => {
  const f = await fixture("claim-winner");
  let secondState;
  try {
    const job = f.definitions.create(jobInput("claim", { kind: "RUN_ONCE" }, { enabled: false }));
    const reserved = f.definitions.reserveRun(job.jobId, 1_000).run;
    secondState = await openOpenRillStateDatabase({ profilePaths: f.profilePaths, busyTimeoutMs: 2_000 });
    const [first, second] = await Promise.all([
      new Promise((resolve) => setImmediate(() => resolve(f.state.transaction((repositories) => repositories.automations.claimRun({
        automationRunId: reserved.automationRunId,
        leaseOwner: "owner-a",
        claimedAt: 10,
        leaseExpiresAt: 1_010,
      }))))),
      new Promise((resolve) => setImmediate(() => resolve(secondState.transaction((repositories) => repositories.automations.claimRun({
        automationRunId: reserved.automationRunId,
        leaseOwner: "owner-b",
        claimedAt: 10,
        leaseExpiresAt: 1_010,
      }))))),
    ]);
    assert.equal([first, second].filter(Boolean).length, 1);
    assert.equal(f.definitions.listRuns(job.jobId)[0].status, "CLAIMED");
    assert.equal(f.definitions.listRuns(job.jobId)[0].attempt, 1);
  } finally {
    secondState?.close();
    await f.cleanup();
  }
});

test("lease ownership gates running, renewal, and terminal commit", async () => {
  const f = await fixture("lease-owner");
  try {
    const job = f.definitions.create(jobInput("lease", { kind: "RUN_ONCE" }, { enabled: false }));
    const reserved = f.definitions.reserveRun(job.jobId, 1_000).run;
    const claimed = f.state.transaction((repositories) => repositories.automations.claimRun({
      automationRunId: reserved.automationRunId,
      leaseOwner: "owner-a",
      claimedAt: 10,
      leaseExpiresAt: 1_010,
    }));
    assert.equal(claimed.status, "CLAIMED");
    const running = f.state.transaction((repositories) => repositories.automations.markRunRunning({
      automationRunId: reserved.automationRunId,
      leaseOwner: "owner-a",
      runningAt: 20,
      leaseExpiresAt: 1_020,
    }));
    assert.equal(running.status, "RUNNING");
    assert.equal(f.state.transaction((repositories) => repositories.automations.renewRunLease({
      automationRunId: reserved.automationRunId,
      leaseOwner: "owner-b",
      renewedAt: 30,
      leaseExpiresAt: 1_030,
    })), null);
    assert.equal(f.state.transaction((repositories) => repositories.automations.finishRun({
      automationRunId: reserved.automationRunId,
      leaseOwner: "owner-b",
      status: "SUCCEEDED",
      runId: null,
      errorCode: null,
      terminalAt: 40,
    })), null);
    const renewed = f.state.transaction((repositories) => repositories.automations.renewRunLease({
      automationRunId: reserved.automationRunId,
      leaseOwner: "owner-a",
      renewedAt: 30,
      leaseExpiresAt: 1_030,
    }));
    assert.equal(renewed.leaseExpiresAt, 1_030);
    const finished = f.state.transaction((repositories) => repositories.automations.finishRun({
      automationRunId: reserved.automationRunId,
      leaseOwner: "owner-a",
      status: "SUCCEEDED",
      runId: null,
      errorCode: null,
      terminalAt: 40,
    }));
    assert.equal(finished.status, "SUCCEEDED");
    assert.equal(finished.leaseOwner, null);
  } finally {
    await f.cleanup();
  }
});

test("restart recovery requeues expired claims and fails interrupted running work", async () => {
  const f = await fixture("restart-recovery");
  const scheduler = f.scheduler(async () => ({ status: "SUCCEEDED" }));
  try {
    const claimedJob = f.definitions.create(jobInput("claimed", { kind: "RUN_ONCE" }, { enabled: false }));
    const runningJob = f.definitions.create(jobInput("running", { kind: "RUN_ONCE" }, { enabled: false }));
    const claimedRun = f.definitions.reserveRun(claimedJob.jobId, 1_000).run;
    const runningRun = f.definitions.reserveRun(runningJob.jobId, 2_000).run;
    f.state.transaction((repositories) => {
      repositories.automations.claimRun({
        automationRunId: claimedRun.automationRunId,
        leaseOwner: "dead-owner",
        claimedAt: 10,
        leaseExpiresAt: 100,
      });
      repositories.automations.claimRun({
        automationRunId: runningRun.automationRunId,
        leaseOwner: "dead-owner",
        claimedAt: 10,
        leaseExpiresAt: 100,
      });
      repositories.automations.markRunRunning({
        automationRunId: runningRun.automationRunId,
        leaseOwner: "dead-owner",
        runningAt: 20,
        leaseExpiresAt: 100,
      });
    });
    f.setNow(101);
    await scheduler.start();
    assert.equal(scheduler.status().recoveredClaims, 1);
    assert.equal(scheduler.status().interruptedRuns, 1);
    assert.equal(f.definitions.listRuns(claimedJob.jobId)[0].status, "PENDING");
    assert.deepEqual(
      f.definitions.listRuns(runningJob.jobId).map((run) => [run.status, run.errorCode]),
      [["FAILED", "AUTOMATION_INTERRUPTED_BY_RESTART"]],
    );
    assert.equal(f.definitions.get(runningJob.jobId).runtime.consecutiveFailures, 1);
  } finally {
    await scheduler.close();
    await f.cleanup();
  }
});

test("async close waits for in-flight executor quiescence before state may close", async () => {
  const f = await fixture("close-quiescence");
  let enteredResolve;
  const entered = new Promise((resolve) => { enteredResolve = resolve; });
  let releaseResolve;
  const release = new Promise((resolve) => { releaseResolve = resolve; });
  const scheduler = f.scheduler(async () => {
    enteredResolve();
    await release;
    return { status: "SUCCEEDED" };
  });
  try {
    f.definitions.create(jobInput("close", { kind: "RUN_ONCE" }));
    await scheduler.start();
    f.setNow(1_000);
    const waking = scheduler.wake();
    await entered;
    let closed = false;
    const closing = scheduler.close().then(() => { closed = true; });
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(closed, false);
    assert.equal(f.state.isOpen(), true);
    releaseResolve();
    await Promise.all([waking, closing]);
    assert.equal(closed, true);
    assert.equal(scheduler.status().state, "CLOSED");
    await assert.rejects(
      () => scheduler.wake(),
      (error) => error instanceof AutomationError && error.code === "AUTOMATION_SCHEDULER_CLOSED",
    );
  } finally {
    releaseResolve?.();
    await scheduler.close();
    await f.cleanup();
  }
});

test("Host scheduler is fail-closed without an executor and executes persisted due work when injected", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step012b-host-"));
  const env = {
    OPENRILL_DATA_ROOT: join(root, "data"),
    OPENRILL_CONFIG_ROOT: join(root, "config"),
  };
  const profilePaths = resolveProfilePaths({ profile: "host-automation", env });
  let state = await openOpenRillStateDatabase({ profilePaths });
  try {
    const definitions = new AutomationDefinitionService({
      state,
      now: () => 0,
      createId: () => "host-job",
    });
    definitions.create(jobInput("host", { kind: "RUN_ONCE" }, {
      schedule: { kind: "at", at: "1970-01-01T00:00:01.000Z" },
    }));
  } finally {
    state.close();
  }
  await assert.rejects(
    () => startLocalHost({
      profile: "host-automation",
      port: 0,
      env,
      config: hostConfig(true),
      now: () => 2_000,
    }),
    (error) => /configured model providers or an injected Automation executor/.test(String(error.cause?.message ?? error.message)),
  );
  let executeResolve;
  const executed = new Promise((resolve) => { executeResolve = resolve; });
  const host = await startLocalHost({
    profile: "host-automation",
    port: 0,
    env,
    config: hostConfig(true),
    now: () => 2_000,
    automationLeaseDurationMs: 1_000,
    automationRenewIntervalMs: 100,
    readyDelayMs: 60_000,
    automationExecutor: async ({ job, run }) => {
      executeResolve([job.jobId, run.scheduledFor]);
      return { status: "SUCCEEDED" };
    },
  });
  const readiness = assert.rejects(host.ready, /Host stopped before readiness/);
  try {
    assert.deepEqual(await waitFor(executed), ["host-job", 1_000]);
  } finally {
    await host.close();
    await readiness;
  }
  state = await openOpenRillStateDatabase({ profilePaths });
  try {
    assert.deepEqual(
      state.transaction((repositories) => repositories.automations.listRuns("host-job")).map((run) => run.status),
      ["SUCCEEDED"],
    );
  } finally {
    state.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("STEP012B scheduler package stays below Protocol, UI, and Conversation/model execution boundaries", async () => {
  const schedulerSource = await readFile(new URL("../../packages/automation/src/scheduler.ts", import.meta.url), "utf8");
  assert.doesNotMatch(schedulerSource, /@openrill\/(?:protocol|conversations|model-adapter|model-openai-responses|web)/);
  assert.doesNotMatch(schedulerSource, /ConversationService|AgentRunCoordinator|modelProviders|process\.run|document\.|window\.|location\./);
  assert.match(schedulerSource, /executor:\s*\(context: AutomationExecutionContext\)/);
  const lifecycleSource = await readFile(new URL("../../services/agent-host/src/lifecycle.ts", import.meta.url), "utf8");
  const schedulerClose = lifecycleSource.indexOf("await automationScheduler?.close()");
  const coordinatorClose = lifecycleSource.indexOf("await runCoordinator?.close()");
  const databaseClose = lifecycleSource.indexOf('stateDatabase.close({ checkpointMode: "TRUNCATE" })');
  assert.ok(schedulerClose >= 0 && schedulerClose < coordinatorClose && coordinatorClose < databaseClose);
});
