import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../apps/agent-cli/dist/index.js";
import { LocalCliProtocolClient } from "../../apps/agent-cli/dist/local-protocol-client.js";
import {
  createEphemeralOsSecretProviderForTests,
  loadOpenRillConfig,
  resolveConfigPaths,
  resolveProfilePaths,
} from "../../packages/config/dist/index.js";
import { ModelAdapterError, createScriptedModelAdapter } from "../../packages/model-adapter/dist/index.js";
import { readHostMetadata, startLocalHost } from "../../services/agent-host/dist/index.js";

function io() {
  const stdout = [];
  const stderr = [];
  return { stdout, stderr, adapter: { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) } };
}
function runtime(env, cwd, provider, input = "") {
  return { env, cwd: () => cwd, platform: process.platform, readStdin: async () => input, osSecretProvider: provider, onSignal() {}, offSignal() {} };
}
function resolver(adapter) {
  return { resolve: () => ({ profile: "default", adapter, provider: "fixture", model: "fixture-model", maxOutputTokens: 256, maxRetries: 0 }) };
}
async function connect(host, clientId) {
  const metadata = await readHostMetadata(host.paths);
  assert.ok(metadata);
  const client = new LocalCliProtocolClient(metadata, clientId, process.platform);
  await client.connect();
  return client;
}
async function waitFor(predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`condition not reached within ${timeoutMs}ms`);
}
async function setupProfile(root, profile, workspace, env, secrets) {
  const setup = io();
  const setupCode = await runCli([
    "setup", "--profile", profile, "--workspace", workspace, "--workspace-id", "default",
    "--provider", "default", "--endpoint", "http://127.0.0.1:1/v1", "--model", "fixture-model",
    "--api-key-stdin", "--json",
  ], setup.adapter, runtime(env, root, secrets, "fixture-key\n"));
  assert.equal(setupCode, 0, setup.stderr.join("\n"));
  const paths = resolveProfilePaths({ profile, env, platform: process.platform });
  const loaded = await loadOpenRillConfig({ paths: resolveConfigPaths(paths, { platform: process.platform }), env, platform: process.platform, osSecretProvider: secrets });
  return { paths, loaded };
}

const identity = (ownerKey) => ({ workspaceId: "default", ownerKey, controllerId: "tests/step020c-controller" });

test("STEP020C Host controller creates and executes an atomic child Task, then exact replay survives restart without terminal reschedule", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step020c-flow-host-"));
  const workspace = join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  const profile = "step020c-flow-host";
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config"), NO_COLOR: "1" };
  const secrets = createEphemeralOsSecretProviderForTests();
  let host = null;
  let client = null;
  try {
    const { paths, loaded } = await setupProfile(root, profile, workspace, env, secrets);
    const adapter = createScriptedModelAdapter({ turns: [{ kind: "events", events: [
      { type: "text_delta", delta: "managed child completed" },
      { type: "completed", stopReason: "stop" },
    ] }] });
    host = await startLocalHost({ profile, port: 0, env, config: loaded.config, configRoot: paths.configRoot, workspaceIds: ["default"], osSecretProvider: secrets, modelResolver: resolver(adapter) });
    await host.ready;
    client = await connect(host, "step020c-before-restart");
    const conversation = await client.call("conversation.create", { workspaceId: "default", modelProfile: "default", title: "Bound Flow controller" }, 5_000);
    const bound = identity(conversation.conversationId);
    const createInput = { ...bound, requestKey: "managed-flow", goal: "Execute one managed durable child", currentStep: "child-one", state: { businessState: "must-not-shadow-state-database" } };
    const created = await client.call("taskFlow.create", createInput, 5_000);
    assert.equal(created.replayed, false);
    assert.equal(created.flow.ownerKey, conversation.conversationId);
    assert.equal(created.flow.controllerId, bound.controllerId);

    const admitted = await client.call("taskFlow.run", {
      ...bound, flowId: created.flow.flowId, expectedRevision: created.flow.revision,
      requestKey: "child-one", stepKey: "child-one", text: "Complete the managed durable child.",
    }, 5_000);
    assert.equal(admitted.replayed, false);
    assert.equal(admitted.scheduled, true);
    assert.equal(admitted.flow.flow.status, "RUNNING");
    assert.equal(admitted.task.runtime, "CONVERSATION");
    assert.equal(admitted.task.taskKind, "task_flow.child");
    assert.equal(admitted.task.sourceId, created.flow.flowId);

    const completed = await waitFor(async () => {
      const value = await client.call("task.get", { workspaceId: "default", taskId: admitted.task.taskId }, 5_000);
      return value.task.status === "SUCCEEDED" ? value : null;
    });
    assert.equal(completed.task.runId, admitted.run.runId);
    const flowBeforeFinish = await client.call("taskFlow.get", { workspaceId: "default", ownerKey: bound.ownerKey, flowId: created.flow.flowId }, 5_000);
    assert.equal(flowBeforeFinish.tasks.length, 1);
    assert.equal(flowBeforeFinish.tasks[0].taskId, admitted.task.taskId);
    assert.ok(flowBeforeFinish.events.some((event) => event.eventType === "taskFlow.task.admitted"));
    const finished = await client.call("taskFlow.finish", { ...bound, flowId: created.flow.flowId, expectedRevision: flowBeforeFinish.flow.revision, state: { completedTaskId: admitted.task.taskId } }, 5_000);
    assert.equal(finished.status, "SUCCEEDED");

    client.close(); client = null;
    await host.close("step020c-restart"); host = null;

    host = await startLocalHost({ profile, port: 0, env, config: loaded.config, configRoot: paths.configRoot, workspaceIds: ["default"], osSecretProvider: secrets, modelResolver: resolver(createScriptedModelAdapter({ turns: [] })) });
    await host.ready;
    client = await connect(host, "step020c-after-restart");
    const createReplay = await client.call("taskFlow.create", createInput, 5_000);
    assert.equal(createReplay.replayed, true);
    assert.equal(createReplay.flow.flowId, created.flow.flowId);
    assert.equal(createReplay.flow.status, "SUCCEEDED");
    const childReplay = await client.call("taskFlow.run", {
      ...bound, flowId: created.flow.flowId, expectedRevision: created.flow.revision,
      requestKey: "child-one", stepKey: "child-one", text: "Complete the managed durable child.",
    }, 5_000);
    assert.equal(childReplay.replayed, true);
    assert.equal(childReplay.run.runId, admitted.run.runId);
    assert.equal(childReplay.task.taskId, admitted.task.taskId);
    assert.equal(childReplay.run.status, "COMPLETED");
    assert.equal(childReplay.scheduled, false);
  } finally {
    client?.close();
    await host?.close("step020c-flow-host-cleanup");
    await rm(root, { recursive: true, force: true });
  }
});

test("STEP020C Host Flow cancellation cascades to an admitted child and closes subsequent admission", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step020c-flow-cancel-"));
  const workspace = join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  const profile = "step020c-flow-cancel";
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config"), NO_COLOR: "1" };
  const secrets = createEphemeralOsSecretProviderForTests();
  let host = null;
  let client = null;
  try {
    const { paths, loaded } = await setupProfile(root, profile, workspace, env, secrets);
    let startedResolve;
    const started = new Promise((resolve) => { startedResolve = resolve; });
    const adapter = {
      providerId: "fixture",
      async *stream(request) {
        yield { type: "started", providerResponseId: "step020c-blocked-child" };
        startedResolve();
        await new Promise((resolve) => {
          if (request.signal?.aborted) return resolve();
          request.signal?.addEventListener("abort", resolve, { once: true });
        });
        throw new ModelAdapterError("MODEL_ABORTED", "Flow cancellation interrupted child", false);
      },
    };
    host = await startLocalHost({ profile, port: 0, env, config: loaded.config, configRoot: paths.configRoot, workspaceIds: ["default"], osSecretProvider: secrets, modelResolver: resolver(adapter) });
    await host.ready;
    client = await connect(host, "step020c-cancel");
    const conversation = await client.call("conversation.create", { workspaceId: "default", modelProfile: "default", title: "Flow cancellation" }, 5_000);
    const bound = identity(conversation.conversationId);
    const created = await client.call("taskFlow.create", { ...bound, requestKey: "cancel-flow", goal: "Cancel an active managed child" }, 5_000);
    const admitted = await client.call("taskFlow.run", { ...bound, flowId: created.flow.flowId, expectedRevision: created.flow.revision, requestKey: "active-child", stepKey: "active", text: "Remain active until the Flow is cancelled." }, 5_000);
    await started;
    const cancelled = await client.call("taskFlow.cancel", { workspaceId: "default", ownerKey: bound.ownerKey, flowId: created.flow.flowId, expectedRevision: admitted.flow.flow.revision }, 5_000);
    assert.equal(cancelled.flow.flow.status, "CANCELLED");
    assert.equal(cancelled.affectedTasks, 1);
    const cancelledTask = await waitFor(async () => {
      const value = await client.call("task.get", { workspaceId: "default", taskId: admitted.task.taskId }, 5_000);
      return value.task.status === "CANCELLED" ? value.task : null;
    });
    assert.equal(cancelledTask.runId, admitted.run.runId);
    const replay = await client.call("taskFlow.run", { ...bound, flowId: created.flow.flowId, expectedRevision: created.flow.revision, requestKey: "active-child", stepKey: "active", text: "Remain active until the Flow is cancelled." }, 5_000);
    assert.equal(replay.replayed, true);
    assert.equal(replay.task.status, "CANCELLED");
    assert.equal(replay.scheduled, false);
    await assert.rejects(
      client.call("taskFlow.run", { ...bound, flowId: created.flow.flowId, expectedRevision: cancelled.flow.flow.revision, requestKey: "new-child", stepKey: "new", text: "This child must not be admitted." }, 5_000),
      (error) => error?.code === "INVALID_STATE",
    );
  } finally {
    client?.close();
    await host?.close("step020c-flow-cancel-cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
