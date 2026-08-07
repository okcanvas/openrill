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
import { ModelAdapterError } from "../../packages/model-adapter/dist/index.js";
import { readHostMetadata, startLocalHost } from "../../services/agent-host/dist/index.js";

const CONTROLLER_TOOLS = [
  "task_flow.block", "task_flow.cancel", "task_flow.fail", "task_flow.finish",
  "task_flow.get", "task_flow.run", "task_flow.wait",
];
function io() { const stdout = []; const stderr = []; return { stdout, stderr, adapter: { stdout: (v) => stdout.push(v), stderr: (v) => stderr.push(v) } }; }
function cliRuntime(env, cwd, provider, input = "") { return { env, cwd: () => cwd, platform: process.platform, readStdin: async () => input, osSecretProvider: provider, onSignal() {}, offSignal() {} }; }
function resolver(adapter) { return { resolve: () => ({ profile: "default", adapter, provider: "fixture", model: "fixture-model", maxOutputTokens: 256, maxRetries: 0 }) }; }
async function connect(host, id) { const metadata = await readHostMetadata(host.paths); assert.ok(metadata); const client = new LocalCliProtocolClient(metadata, id, process.platform); await client.connect(); return client; }
async function waitFor(predicate, timeoutMs = 8_000) { const deadline = Date.now() + timeoutMs; while (Date.now() < deadline) { const value = await predicate(); if (value) return value; await new Promise((resolve) => setTimeout(resolve, 25)); } throw new Error(`condition not reached within ${timeoutMs}ms`); }
async function setup(root, profile, workspace, env, secrets) {
  const output = io();
  const code = await runCli(["setup", "--profile", profile, "--workspace", workspace, "--workspace-id", "default", "--provider", "default", "--endpoint", "http://127.0.0.1:1/v1", "--model", "fixture-model", "--api-key-stdin", "--json"], output.adapter, cliRuntime(env, root, secrets, "fixture-key\n"));
  assert.equal(code, 0, output.stderr.join("\n"));
  const paths = resolveProfilePaths({ profile, env, platform: process.platform });
  const loaded = await loadOpenRillConfig({ paths: resolveConfigPaths(paths, { platform: process.platform }), env, platform: process.platform, osSecretProvider: secrets });
  return { paths, config: loaded.config };
}
function toolResult(request, name) {
  for (const message of request.messages) for (const block of message.content) if (block.type === "tool_result" && block.name === name) return block;
  return null;
}
function controllerAdapter(options = {}) {
  const requests = [];
  let providerResponse = 0;
  return {
    requests,
    adapter: {
      providerId: "fixture",
      async *stream(request) {
        requests.push(request);
        const names = request.tools.map((tool) => tool.name).sort();
        const controller = names.includes("task_flow.get");
        if (!controller) {
          assert.equal(names.some((name) => name.startsWith("task_flow.")), false, "normal child Run must not see controller tools");
          yield { type: "started", providerResponseId: `child-${++providerResponse}` };
          yield { type: "text_delta", delta: options.childText ?? "Final child deliverable: all requested work is complete." };
          yield { type: "completed", stopReason: "stop" };
          return;
        }
        assert.deepEqual(names, CONTROLLER_TOOLS);
        const get = toolResult(request, "task_flow.get");
        const decisionName = options.decision === "block" ? "task_flow.block" : "task_flow.finish";
        const decision = toolResult(request, decisionName);
        if (!get) {
          yield { type: "started", providerResponseId: `wake-get-${++providerResponse}` };
          yield { type: "tool_call", toolCallId: `get-${providerResponse}`, name: "task_flow.get", argumentsJson: "{}" };
          yield { type: "completed", stopReason: "tool_calls" };
          return;
        }
        if (!decision) {
          options.onAfterGet?.(request);
          if (options.blockAfterGet) {
            yield { type: "started", providerResponseId: `wake-block-${++providerResponse}` };
            options.onBlocked?.();
            await new Promise((resolve) => {
              if (request.signal?.aborted) return resolve();
              request.signal?.addEventListener("abort", resolve, { once: true });
            });
            throw new ModelAdapterError("MODEL_ABORTED", "Host shutdown interrupted controller wake", false);
          }
          const revision = get.output.flow.revision;
          if (options.decision === "block") {
            const blocked = get.output.tasks.find((link) => link.task?.terminalOutcome === "BLOCKED");
            assert.ok(blocked, "controller must receive the BLOCKED semantic Task projection");
            yield { type: "started", providerResponseId: `wake-block-decision-${++providerResponse}` };
            yield { type: "tool_call", toolCallId: `block-${providerResponse}`, name: "task_flow.block", argumentsJson: JSON.stringify({ expectedRevision: revision, blockedTaskId: blocked.task.taskId, blockedSummary: blocked.task.terminalSummary, currentStep: get.output.flow.currentStep }) };
          } else {
            yield { type: "started", providerResponseId: `wake-finish-${++providerResponse}` };
            yield { type: "tool_call", toolCallId: `finish-${providerResponse}`, name: "task_flow.finish", argumentsJson: JSON.stringify({ expectedRevision: revision, state: { completionDelivery: true } }) };
          }
          yield { type: "completed", stopReason: "tool_calls" };
          return;
        }
        yield { type: "started", providerResponseId: `wake-done-${++providerResponse}` };
        yield { type: "text_delta", delta: options.decision === "block"
          ? "The durable Task Flow was blocked because the child produced no final deliverable."
          : "The durable Task Flow was finished from the delivered child result." };
        yield { type: "completed", stopReason: "stop" };
      },
    },
  };
}
async function createAndRun(client, suffix = "one") {
  const conversation = await client.call("conversation.create", { workspaceId: "default", modelProfile: "default", title: `Delivery ${suffix}` }, 5_000);
  const bound = { workspaceId: "default", ownerKey: conversation.conversationId, controllerId: "tests/step020e-controller" };
  const created = await client.call("taskFlow.create", { ...bound, requestKey: `flow-${suffix}`, goal: "Complete one child and continue durably", currentStep: "child" }, 5_000);
  const admitted = await client.call("taskFlow.run", { ...bound, flowId: created.flow.flowId, expectedRevision: created.flow.revision, requestKey: `child-${suffix}`, stepKey: "child", text: "Produce the final child deliverable." }, 5_000);
  return { conversation, bound, created, admitted };
}

test("STEP020E Host delivers terminal child output, exposes controller-only tools to the wake Run, and finishes the Flow", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step020e-host-"));
  const workspace = join(root, "workspace"); await mkdir(workspace, { recursive: true });
  const profile = "step020e-host";
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config"), NO_COLOR: "1" };
  const secrets = createEphemeralOsSecretProviderForTests();
  let host = null; let client = null;
  try {
    const configured = await setup(root, profile, workspace, env, secrets);
    const model = controllerAdapter();
    host = await startLocalHost({ profile, port: 0, env, config: configured.config, configRoot: configured.paths.configRoot, workspaceIds: ["default"], osSecretProvider: secrets, modelResolver: resolver(model.adapter) });
    await host.ready; client = await connect(host, "step020e-host");
    const record = await createAndRun(client);
    const terminal = await waitFor(async () => {
      const task = await client.call("task.get", { workspaceId: "default", taskId: record.admitted.task.taskId }, 5_000);
      return task.task.deliveryStatus === "DELIVERED" ? task : null;
    });
    assert.equal(terminal.task.status, "SUCCEEDED");
    assert.equal(terminal.task.terminalOutcome, "SUCCEEDED");
    assert.equal(terminal.deliveries.length, 1);
    assert.equal(terminal.deliveries[0].deliveryStatus, "DELIVERED");
    assert.ok(terminal.deliveries[0].systemMessageId);
    assert.ok(terminal.deliveries[0].wakeRunId);
    const flow = await client.call("taskFlow.get", { workspaceId: "default", ownerKey: record.bound.ownerKey, flowId: record.created.flow.flowId }, 5_000);
    assert.equal(flow.flow.status, "SUCCEEDED");
    assert.ok(flow.events.some((event) => event.eventType === "taskFlow.controller.wake.queued"));
    assert.ok(flow.events.some((event) => event.eventType === "taskFlow.controller.wake.delivered"));
    assert.ok(model.requests.some((request) => request.tools.some((tool) => tool.name === "task_flow.finish")));
  } finally {
    client?.close(); await host?.close("step020e-host-cleanup"); await rm(root, { recursive: true, force: true });
  }
});


test("STEP020E Host delivers progress-only completion as BLOCKED and the controller durably blocks the Flow", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step020e-blocked-"));
  const workspace = join(root, "workspace"); await mkdir(workspace, { recursive: true });
  const profile = "step020e-blocked";
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config"), NO_COLOR: "1" };
  const secrets = createEphemeralOsSecretProviderForTests();
  let host = null; let client = null;
  try {
    const configured = await setup(root, profile, workspace, env, secrets);
    const model = controllerAdapter({ childText: "확인해 보겠습니다.", decision: "block" });
    host = await startLocalHost({ profile, port: 0, env, config: configured.config, configRoot: configured.paths.configRoot, workspaceIds: ["default"], osSecretProvider: secrets, modelResolver: resolver(model.adapter) });
    await host.ready; client = await connect(host, "step020e-blocked");
    const record = await createAndRun(client, "blocked");
    const terminal = await waitFor(async () => {
      const task = await client.call("task.get", { workspaceId: "default", taskId: record.admitted.task.taskId }, 5_000);
      return task.task.deliveryStatus === "DELIVERED" ? task : null;
    });
    assert.equal(terminal.task.status, "SUCCEEDED");
    assert.equal(terminal.task.terminalOutcome, "BLOCKED");
    assert.match(terminal.task.terminalSummary, /progress-only/);
    const flow = await client.call("taskFlow.get", { workspaceId: "default", ownerKey: record.bound.ownerKey, flowId: record.created.flow.flowId }, 5_000);
    assert.equal(flow.flow.status, "BLOCKED");
    assert.equal(flow.flow.blockedTaskId, record.admitted.task.taskId);
    assert.ok(model.requests.some((request) => request.tools.some((tool) => tool.name === "task_flow.block")));
  } finally {
    client?.close(); await host?.close("step020e-blocked-cleanup"); await rm(root, { recursive: true, force: true });
  }
});

test("STEP020E Host restart resumes the same queued controller wake Run after a durable Tool checkpoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step020e-restart-"));
  const workspace = join(root, "workspace"); await mkdir(workspace, { recursive: true });
  const profile = "step020e-restart";
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config"), NO_COLOR: "1" };
  const secrets = createEphemeralOsSecretProviderForTests();
  let host = null; let client = null;
  try {
    const configured = await setup(root, profile, workspace, env, secrets);
    let blockedResolve;
    const blocked = new Promise((resolve) => { blockedResolve = resolve; });
    const firstModel = controllerAdapter({ blockAfterGet: true, onBlocked: () => blockedResolve() });
    host = await startLocalHost({ profile, port: 0, env, config: configured.config, configRoot: configured.paths.configRoot, workspaceIds: ["default"], osSecretProvider: secrets, modelResolver: resolver(firstModel.adapter) });
    await host.ready; client = await connect(host, "step020e-restart-before");
    const record = await createAndRun(client, "restart");
    await blocked;
    const queued = await waitFor(async () => {
      const task = await client.call("task.get", { workspaceId: "default", taskId: record.admitted.task.taskId }, 5_000);
      return task.deliveries[0]?.deliveryStatus === "SESSION_QUEUED" ? task : null;
    });
    const wakeRunId = queued.deliveries[0].wakeRunId;
    assert.ok(wakeRunId);
    client.close(); client = null;
    await host.close("step020e-restart-boundary"); host = null;

    const secondModel = controllerAdapter();
    host = await startLocalHost({ profile, port: 0, env, config: configured.config, configRoot: configured.paths.configRoot, workspaceIds: ["default"], osSecretProvider: secrets, modelResolver: resolver(secondModel.adapter) });
    await host.ready; client = await connect(host, "step020e-restart-after");
    const delivered = await waitFor(async () => {
      const task = await client.call("task.get", { workspaceId: "default", taskId: record.admitted.task.taskId }, 5_000);
      return task.task.deliveryStatus === "DELIVERED" ? task : null;
    }, 12_000);
    assert.equal(delivered.deliveries[0].wakeRunId, wakeRunId);
    assert.equal(delivered.deliveries[0].attemptCount, 1);
    const flow = await client.call("taskFlow.get", { workspaceId: "default", ownerKey: record.bound.ownerKey, flowId: record.created.flow.flowId }, 5_000);
    assert.equal(flow.flow.status, "SUCCEEDED");
  } finally {
    client?.close(); await host?.close("step020e-restart-cleanup"); await rm(root, { recursive: true, force: true });
  }
});
