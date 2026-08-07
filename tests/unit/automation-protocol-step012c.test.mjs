import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase, OPENRILL_STATE_SCHEMA_VERSION } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import {
  AutomationDefinitionService,
  AutomationError,
  AutomationScheduler,
} from "../../packages/automation/dist/index.js";
import {
  validateAutomationCreateInput,
  validateAutomationUpdateInput,
  validateAutomationRunNowInput,
} from "../../packages/protocol/dist/index.js";
import { createScriptedModelAdapter, ModelAdapterError } from "../../packages/model-adapter/dist/index.js";
import { ToolRegistry } from "../../packages/tool-runtime/dist/index.js";
import { AgentRunCoordinator } from "../../services/agent-host/dist/run-coordinator.js";
import { AutomationConversationExecutor } from "../../services/agent-host/dist/automation-conversation-executor.js";
import { createDefaultOperationRegistry } from "../../services/agent-host/dist/transport/operation-registry.js";

function jobInput(name = "daily") {
  return {
    name,
    enabled: false,
    schedule: { kind: "at", at: "1970-01-01T00:00:00.000Z" },
    timezone: "UTC",
    conversationTemplate: { workspaceId: "alpha", prompt: "produce the automation result", modelProfile: "default" },
    catchUpPolicy: { kind: "RUN_ONCE" },
    failurePolicy: { backoffMs: 0, maxConsecutiveFailures: 3, autoDisable: false },
  };
}

async function fixture(profile) {
  const root = await mkdtemp(join(tmpdir(), `openrill-step012c-${profile}-`));
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") };
  const paths = resolveProfilePaths({ profile, env });
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  let id = 0;
  return {
    root,
    state,
    service: new AutomationDefinitionService({ state, now: () => 1_000, createId: () => `${profile}-${++id}` }),
    cleanup: async () => { state.close(); await rm(root, { recursive: true, force: true }); },
  };
}

test("schema 9 gives manual run requests durable replay identity and collision-safe occurrence time", async () => {
  const f = await fixture("manual");
  try {
    assert.ok(OPENRILL_STATE_SCHEMA_VERSION >= 9);
    const job = f.service.create(jobInput());
    const scheduled = f.service.reserveRun(job.jobId, 1_000).run;
    assert.equal(scheduled.triggerKind, "SCHEDULED");
    const first = f.service.runNow(job.jobId, "manual-request-1");
    const replay = f.service.runNow(job.jobId, "manual-request-1");
    assert.equal(first.created, true);
    assert.equal(replay.created, false);
    assert.equal(replay.run.automationRunId, first.run.automationRunId);
    assert.equal(first.run.triggerKind, "MANUAL");
    assert.equal(first.run.requestKey, "manual-request-1");
    assert.equal(first.run.scheduledFor, 1_001);
    const other = f.service.create(jobInput("other"));
    assert.throws(
      () => f.service.runNow(other.jobId, "manual-request-1"),
      (error) => error instanceof AutomationError && error.code === "AUTOMATION_REQUEST_CONFLICT",
    );
  } finally { await f.cleanup(); }
});

test("Automation protocol validators are closed at top-level and nested boundaries", () => {
  assert.equal(validateAutomationCreateInput(jobInput()).ok, true);
  assert.equal(validateAutomationCreateInput({ ...jobInput(), unknown: true }).ok, false);
  assert.equal(validateAutomationCreateInput({ ...jobInput(), schedule: { kind: "cron", expression: "0 9 * * *", extra: 1 } }).ok, false);
  assert.equal(validateAutomationUpdateInput({ jobId: "job-1", expectedRevision: 1, patch: { enabled: true } }).ok, true);
  assert.equal(validateAutomationUpdateInput({ jobId: "job-1", expectedRevision: 1, patch: {} }).ok, false);
  assert.equal(validateAutomationRunNowInput({ jobId: "job-1", requestKey: "manual-1" }).ok, true);
  assert.equal(validateAutomationRunNowInput({ jobId: "job-1", requestKey: "manual 1" }).ok, false);
});

test("operation registry exposes Automation permissions and maps domain conflicts", async () => {
  const operations = [];
  const registry = createDefaultOperationRegistry(
    () => ({ product: "OpenRill", version: "test", profile: "test", pid: 1, instanceId: "i", bind: "127.0.0.1", port: 1, startedAt: new Date(0).toISOString(), state: "READY", readiness: true }),
    { create() {}, list() {}, get() {}, send() {}, cancel() {} },
    undefined,
    undefined,
    undefined,
    undefined,
    {
      create: () => ({ jobId: "job-1", revision: 1 }),
      list: () => ({ items: [] }),
      get: () => ({ jobId: "job-1" }),
      update: () => { throw new AutomationError("AUTOMATION_REVISION_CONFLICT", "stale revision"); },
      runNow: () => ({ created: true, run: { automationRunId: "run-1" } }),
      history: () => ({ items: [] }),
    },
  );
  operations.push(...registry.capabilities().filter((item) => item.name.startsWith("automation.")));
  assert.deepEqual(operations, [
    { name: "automation.create", permission: "automation.write" },
    { name: "automation.get", permission: "automation.read" },
    { name: "automation.history", permission: "automation.read" },
    { name: "automation.list", permission: "automation.read" },
    { name: "automation.run_now", permission: "automation.execute" },
    { name: "automation.update", permission: "automation.write" },
  ]);
  const conflict = await registry.invoke("c1", "automation.update", { jobId: "job-1", expectedRevision: 1, patch: { enabled: true } });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error.code, "CONFLICT");
});

test("production Automation executor binds AgentRun before execution and commits terminal linkage", async () => {
  const f = await fixture("executor");
  const notices = [];
  try {
    const conversations = new ConversationService({ state: f.state, workspaceIds: ["alpha"], now: () => 1_000 });
    const adapter = createScriptedModelAdapter({ turns: [{ kind: "events", events: [
      { type: "text_delta", delta: "automation complete" },
      { type: "completed", stopReason: "stop" },
    ] }] });
    const coordinator = new AgentRunCoordinator({
      conversations,
      models: { resolve: () => ({ profile: "default", adapter, provider: "fixture", model: "fixture-model", maxOutputTokens: 128, maxRetries: 0 }) },
      tools: new ToolRegistry(),
      publishNotice: (topic, data) => notices.push([topic, data]),
    });
    const executor = new AutomationConversationExecutor({ conversations, coordinator, publishNotice: (topic, data) => notices.push([topic, data]) });
    const job = f.service.create(jobInput());
    const manual = f.service.runNow(job.jobId, "execute-1").run;
    const scheduler = new AutomationScheduler({
      state: f.state,
      ownerId: "owner-step012c",
      now: () => 1_000,
      autoArm: false,
      executor: (context) => executor.execute(context),
      onRunUpdated: (run) => notices.push(["automation.run.updated", run]),
    });
    await scheduler.start();
    const result = await scheduler.wake();
    assert.equal(result.succeededRuns, 1);
    const stored = f.service.listRuns(job.jobId)[0];
    assert.equal(stored.automationRunId, manual.automationRunId);
    assert.equal(stored.status, "SUCCEEDED");
    assert.ok(stored.runId);
    const execution = conversations.executionContext(stored.runId);
    assert.equal(execution.run.status, "COMPLETED");
    assert.equal(execution.messages[0].content.text, "produce the automation result");
    assert.equal(execution.messages.at(-1).content.text, "automation complete");
    assert.ok(notices.some(([topic, data]) => topic === "automation.run.updated" && data.runId === stored.runId && data.status === "RUNNING"));
    assert.ok(notices.some(([topic, data]) => topic === "automation.run.updated" && data.runId === stored.runId && data.status === "SUCCEEDED"));
    await scheduler.close();
    await coordinator.close();
  } finally { await f.cleanup(); }
});

test("scheduler close aborts a production Conversation Run before SQLite shutdown", async () => {
  const f = await fixture("abort");
  try {
    const conversations = new ConversationService({ state: f.state, workspaceIds: ["alpha"], now: Date.now });
    let enteredResolve;
    const entered = new Promise((resolve) => { enteredResolve = resolve; });
    const adapter = {
      providerId: "fixture",
      async *stream(request) {
        yield { type: "started", providerResponseId: "slow" };
        enteredResolve();
        await new Promise((resolve) => {
          if (request.signal?.aborted) return resolve();
          request.signal?.addEventListener("abort", resolve, { once: true });
        });
        throw new ModelAdapterError("MODEL_ABORTED", "aborted by scheduler close", false);
      },
    };
    const coordinator = new AgentRunCoordinator({
      conversations,
      models: { resolve: () => ({ profile: "default", adapter, provider: "fixture", model: "fixture-model", maxOutputTokens: 128, maxRetries: 0 }) },
      tools: new ToolRegistry(), publishNotice: () => {},
    });
    const executor = new AutomationConversationExecutor({ conversations, coordinator, publishNotice: () => {} });
    const job = f.service.create(jobInput("abort"));
    f.service.runNow(job.jobId, "abort-1");
    const scheduler = new AutomationScheduler({ state: f.state, ownerId: "owner-abort", autoArm: false, executor: (context) => executor.execute(context) });
    await scheduler.start();
    const wake = scheduler.wake();
    await entered;
    const close = scheduler.close();
    await close;
    await wake;
    const stored = f.service.listRuns(job.jobId)[0];
    assert.equal(stored.status, "FAILED");
    assert.ok(["AUTOMATION_AGENT_RUN_CANCELLED", "AUTOMATION_HOST_SHUTDOWN"].includes(stored.errorCode));
    await coordinator.close();
  } finally { await f.cleanup(); }
});
