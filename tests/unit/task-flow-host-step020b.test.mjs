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
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { TaskService } from "../../packages/tasks/dist/index.js";
import { TaskFlowService } from "../../packages/task-flows/dist/index.js";
import { createScriptedModelAdapter } from "../../packages/model-adapter/dist/index.js";
import { readHostMetadata, startLocalHost } from "../../services/agent-host/dist/index.js";

function io() {
  const stdout = [];
  const stderr = [];
  return { stdout, stderr, adapter: { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) } };
}
function runtime(env, cwd, provider, input = "") {
  return { env, cwd: () => cwd, platform: process.platform, readStdin: async () => input, osSecretProvider: provider, onSignal() {}, offSignal() {} };
}
function resolver() {
  return { resolve: () => ({ profile: "default", adapter: createScriptedModelAdapter({ turns: [] }), provider: "fixture", model: "fixture-model", maxOutputTokens: 256, maxRetries: 0 }) };
}
async function connect(host, clientId) {
  const metadata = await readHostMetadata(host.paths);
  assert.ok(metadata);
  const client = new LocalCliProtocolClient(metadata, clientId, process.platform);
  await client.connect();
  return client;
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

test("STEP020B Host restart preserves Task Flow identity and protocol cancellation finalizes it", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step020b-flow-host-"));
  const workspace = join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  const profile = "step020b-flow-host";
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config"), NO_COLOR: "1" };
  const secrets = createEphemeralOsSecretProviderForTests();
  let host = null;
  let client = null;
  try {
    const { paths, loaded } = await setupProfile(root, profile, workspace, env, secrets);
    const state = await openOpenRillStateDatabase({ profilePaths: paths });
    let flowId;
    let taskId;
    let ownerKey;
    try {
      let id = 0;
      const conversations = new ConversationService({ state, workspaceIds: ["default"], createId: () => `flow-host-${++id}` });
      const tasks = new TaskService(state, ["default"]);
      const flows = new TaskFlowService(state, tasks, ["default"]);
      const conversation = conversations.create({ workspaceId: "default", modelProfile: "default" });
      ownerKey = conversation.conversationId;
      const sent = conversations.send({ workspaceId: "default", conversationId: conversation.conversationId, submissionKey: "seed", text: "completed child retained by flow" });
      conversations.transitionRun({ runId: sent.run.runId, status: "RUNNING" });
      conversations.transitionRun({ runId: sent.run.runId, status: "COMPLETED" });
      const task = tasks.getByRun({ workspaceId: "default", runId: sent.run.runId });
      let flow = flows.create({ workspaceId: "default", ownerKey, controllerId: "tests/host-restart", goal: "Retain durable flow across host restart", status: "RUNNING" });
      flow = flows.linkTask({ workspaceId: "default", ownerKey, flowId: flow.flowId, taskId: task.taskId, expectedRevision: flow.revision, stepKey: "completed" }).flow;
      flow = flows.setWaiting({ workspaceId: "default", ownerKey, flowId: flow.flowId, expectedRevision: flow.revision, currentStep: "await-operator", wait: { kind: "operator" } });
      flowId = flow.flowId;
      taskId = task.taskId;
    } finally {
      state.close();
    }

    host = await startLocalHost({ profile, port: 0, env, config: loaded.config, configRoot: paths.configRoot, workspaceIds: ["default"], osSecretProvider: secrets, modelResolver: resolver() });
    await host.ready;
    client = await connect(host, "step020b-before-restart");
    const before = await client.call("taskFlow.get", { workspaceId: "default", ownerKey, flowId }, 5_000);
    assert.equal(before.flow.flowId, flowId);
    assert.equal(before.flow.status, "WAITING");
    assert.equal(before.tasks[0].taskId, taskId);
    const revision = before.flow.revision;
    client.close(); client = null;
    await host.close("step020b-restart"); host = null;

    host = await startLocalHost({ profile, port: 0, env, config: loaded.config, configRoot: paths.configRoot, workspaceIds: ["default"], osSecretProvider: secrets, modelResolver: resolver() });
    await host.ready;
    client = await connect(host, "step020b-after-restart");
    const after = await client.call("taskFlow.get", { workspaceId: "default", ownerKey, flowId }, 5_000);
    assert.equal(after.flow.flowId, flowId);
    assert.equal(after.flow.revision, revision);
    assert.equal(after.flow.status, "WAITING");
    const listed = await client.call("taskFlow.list", { workspaceId: "default", ownerKey, status: "WAITING" }, 5_000);
    assert.ok(listed.items.some((flow) => flow.flowId === flowId));
    const cancelled = await client.call("taskFlow.cancel", { workspaceId: "default", ownerKey, flowId, expectedRevision: revision }, 5_000);
    assert.equal(cancelled.flow.flow.status, "CANCELLED");
    assert.equal(cancelled.affectedTasks, 0);
    assert.equal(cancelled.replayed, false);
    const replay = await client.call("taskFlow.cancel", { workspaceId: "default", ownerKey, flowId, expectedRevision: cancelled.flow.flow.revision }, 5_000);
    assert.equal(replay.replayed, true);
    assert.equal(replay.flow.flow.status, "CANCELLED");
  } finally {
    client?.close();
    await host?.close("step020b-cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
