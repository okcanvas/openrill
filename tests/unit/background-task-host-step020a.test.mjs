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
  return {
    env,
    cwd: () => cwd,
    platform: process.platform,
    readStdin: async () => input,
    osSecretProvider: provider,
    onSignal() {},
    offSignal() {},
  };
}

function resolver(adapter) {
  return {
    resolve: () => ({
      profile: "default",
      adapter,
      provider: "fixture",
      model: "fixture-model",
      maxOutputTokens: 256,
      maxRetries: 0,
    }),
  };
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
    "setup", "--profile", profile,
    "--workspace", workspace,
    "--workspace-id", "default",
    "--provider", "default",
    "--endpoint", "http://127.0.0.1:1/v1",
    "--model", "fixture-model",
    "--api-key-stdin", "--json",
  ], setup.adapter, runtime(env, root, secrets, "fixture-key\n"));
  assert.equal(setupCode, 0, setup.stderr.join("\n"));
  const paths = resolveProfilePaths({ profile, env, platform: process.platform });
  const loaded = await loadOpenRillConfig({
    paths: resolveConfigPaths(paths, { platform: process.platform }),
    env,
    platform: process.platform,
    osSecretProvider: secrets,
  });
  return { paths, loaded };
}

test("STEP020A detached Host restart preserves one Task identity and reaches SUCCEEDED without client resubmission", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step020a-task-resume-"));
  const workspace = join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  const profile = "step020a-task-resume";
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config"), NO_COLOR: "1" };
  const secrets = createEphemeralOsSecretProviderForTests();
  let host = null;
  let client = null;
  try {
    const { loaded } = await setupProfile(root, profile, workspace, env, secrets);
    let blockedResolve;
    const blocked = new Promise((resolve) => { blockedResolve = resolve; });
    let turn = 0;
    const firstAdapter = {
      providerId: "fixture",
      async *stream(request) {
        turn += 1;
        if (turn === 1) {
          yield {
            type: "tool_call",
            toolCallId: "step020a-goal-create",
            name: "goal.create",
            argumentsJson: JSON.stringify({ objective: "Resume durable background task", steps: ["Checkpoint", "Finish"] }),
          };
          yield { type: "completed", stopReason: "tool_calls" };
          return;
        }
        yield { type: "started", providerResponseId: "step020a-blocked" };
        blockedResolve();
        await new Promise((resolve) => {
          if (request.signal?.aborted) return resolve();
          request.signal?.addEventListener("abort", resolve, { once: true });
        });
        throw new ModelAdapterError("MODEL_ABORTED", "Host restart interrupted the model", false);
      },
    };
    host = await startLocalHost({
      profile, port: 0, env, config: loaded.config, configRoot: resolveProfilePaths({ profile, env, platform: process.platform }).configRoot,
      workspaceIds: ["default"], osSecretProvider: secrets, modelResolver: resolver(firstAdapter),
    });
    await host.ready;
    client = await connect(host, "step020a-task-resume-before");
    const conversation = await client.call("conversation.create", { workspaceId: "default", modelProfile: "default", title: "Task restart" }, 5_000);
    const sent = await client.call("conversation.send", {
      workspaceId: "default", conversationId: conversation.conversationId,
      submissionKey: "step020a-task-restart-send", text: "Create a checkpoint and finish after restart.",
    }, 5_000);
    const runId = sent.run.runId;
    const listed = await waitFor(async () => {
      const output = await client.call("task.list", { workspaceId: "default", limit: 20 }, 5_000);
      return output.items.find((item) => item.runId === runId && item.status === "RUNNING") ?? null;
    });
    assert.equal(listed.runtime, "CONVERSATION");
    const taskId = listed.taskId;
    const before = await client.call("task.get", { workspaceId: "default", taskId }, 5_000);
    assert.equal(before.task.runId, runId);
    assert.equal(before.task.status, "RUNNING");

    client.close(); client = null;
    await blocked;
    await host.close("step020a-live-restart"); host = null;

    const secondAdapter = createScriptedModelAdapter({ turns: [{ kind: "events", events: [
      { type: "text_delta", delta: "durable Task resumed and completed" },
      { type: "completed", stopReason: "stop" },
    ] }] });
    host = await startLocalHost({
      profile, port: 0, env, config: loaded.config, configRoot: resolveProfilePaths({ profile, env, platform: process.platform }).configRoot,
      workspaceIds: ["default"], osSecretProvider: secrets, modelResolver: resolver(secondAdapter),
    });
    await host.ready;
    client = await connect(host, "step020a-task-resume-after");
    const completed = await waitFor(async () => {
      const output = await client.call("task.get", { workspaceId: "default", taskId }, 5_000);
      return output.task.status === "SUCCEEDED" ? output : null;
    });
    assert.equal(completed.task.taskId, taskId);
    assert.equal(completed.task.runId, runId);
    assert.equal(completed.task.recoveryState, "NONE");
    assert.equal(completed.task.terminalSummary, "Completed");
    assert.ok(completed.events.some((event) => event.eventType === "task.succeeded"));
    const conversationView = await client.call("conversation.get", { workspaceId: "default", conversationId: conversation.conversationId }, 5_000);
    assert.equal(conversationView.runs.find((candidate) => candidate.runId === runId)?.status, "COMPLETED");
  } finally {
    client?.close();
    await host?.close("step020a-task-resume-cleanup");
    await rm(root, { recursive: true, force: true });
  }
});

test("STEP020A task.cancel terminally cancels its owning Run and is replay-safe", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step020a-task-cancel-"));
  const workspace = join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  const profile = "step020a-task-cancel";
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config"), NO_COLOR: "1" };
  const secrets = createEphemeralOsSecretProviderForTests();
  let host = null;
  let client = null;
  try {
    const { loaded } = await setupProfile(root, profile, workspace, env, secrets);
    let startedResolve;
    const started = new Promise((resolve) => { startedResolve = resolve; });
    const adapter = {
      providerId: "fixture",
      async *stream(request) {
        yield { type: "started", providerResponseId: "step020a-cancel-blocked" };
        startedResolve();
        await new Promise((resolve) => {
          if (request.signal?.aborted) return resolve();
          request.signal?.addEventListener("abort", resolve, { once: true });
        });
        throw new ModelAdapterError("MODEL_ABORTED", "operator cancelled", false);
      },
    };
    host = await startLocalHost({
      profile, port: 0, env, config: loaded.config, configRoot: resolveProfilePaths({ profile, env, platform: process.platform }).configRoot,
      workspaceIds: ["default"], osSecretProvider: secrets, modelResolver: resolver(adapter),
    });
    await host.ready;
    client = await connect(host, "step020a-task-cancel");
    const conversation = await client.call("conversation.create", { workspaceId: "default", modelProfile: "default", title: "Task cancel" }, 5_000);
    const sent = await client.call("conversation.send", {
      workspaceId: "default", conversationId: conversation.conversationId,
      submissionKey: "step020a-task-cancel-send", text: "Keep running until cancelled.",
    }, 5_000);
    await started;
    const task = await waitFor(async () => {
      const output = await client.call("task.list", { workspaceId: "default", status: "RUNNING", limit: 20 }, 5_000);
      return output.items.find((item) => item.runId === sent.run.runId) ?? null;
    });
    const cancelled = await client.call("task.cancel", { workspaceId: "default", taskId: task.taskId }, 5_000);
    assert.equal(cancelled.status, "CANCELLED");
    const replay = await client.call("task.cancel", { workspaceId: "default", taskId: task.taskId }, 5_000);
    assert.equal(replay.status, "CANCELLED");
    assert.equal(replay.taskId, task.taskId);
    const view = await client.call("conversation.get", { workspaceId: "default", conversationId: conversation.conversationId }, 5_000);
    assert.equal(view.runs.find((candidate) => candidate.runId === sent.run.runId)?.status, "CANCELLED");
    const detail = await client.call("task.get", { workspaceId: "default", taskId: task.taskId }, 5_000);
    assert.equal(detail.task.errorCode, "OPERATOR_CANCELLED");
    assert.ok(detail.events.some((event) => event.eventType === "task.cancelled"));
  } finally {
    client?.close();
    await host?.close("step020a-task-cancel-cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
