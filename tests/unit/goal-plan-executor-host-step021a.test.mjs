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
import { ModelAdapterError } from "../../packages/model-adapter/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { GoalService } from "../../packages/goals/dist/index.js";
import { readHostMetadata, startLocalHost } from "../../services/agent-host/dist/index.js";

const CONTROLLER_TOOLS = [
  "task_flow.block", "task_flow.cancel", "task_flow.fail", "task_flow.finish",
  "task_flow.get", "task_flow.run", "task_flow.wait",
];
function io() { const stdout = []; const stderr = []; return { stdout, stderr, adapter: { stdout: (v) => stdout.push(v), stderr: (v) => stderr.push(v) } }; }
function cliRuntime(env, cwd, provider, input = "") { return { env, cwd: () => cwd, platform: process.platform, readStdin: async () => input, osSecretProvider: provider, onSignal() {}, offSignal() {} }; }
function resolver(adapter) { return { resolve: () => ({ profile: "default", adapter, provider: "fixture", model: "fixture-model", maxOutputTokens: 256, maxRetries: 0 }) }; }
async function connect(host, id) { const metadata = await readHostMetadata(host.paths); assert.ok(metadata); const client = new LocalCliProtocolClient(metadata, id, process.platform); await client.connect(); return client; }
async function waitFor(predicate, timeoutMs = 12_000) { const deadline = Date.now() + timeoutMs; while (Date.now() < deadline) { const value = await predicate(); if (value) return value; await new Promise((resolve) => setTimeout(resolve, 25)); } throw new Error(`condition not reached within ${timeoutMs}ms`); }
async function setup(root, profile, workspace, env, secrets) {
  const output = io();
  const code = await runCli(["setup", "--profile", profile, "--workspace", workspace, "--workspace-id", "default", "--provider", "default", "--endpoint", "http://127.0.0.1:1/v1", "--model", "fixture-model", "--api-key-stdin", "--json"], output.adapter, cliRuntime(env, root, secrets, "fixture-key\n"));
  assert.equal(code, 0, output.stderr.join("\n"));
  const paths = resolveProfilePaths({ profile, env, platform: process.platform });
  const loaded = await loadOpenRillConfig({ paths: resolveConfigPaths(paths, { platform: process.platform }), env, platform: process.platform, osSecretProvider: secrets });
  return { paths, config: loaded.config };
}
function lastToolResult(request, name) {
  for (let messageIndex = request.messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const content = request.messages[messageIndex].content;
    for (let blockIndex = content.length - 1; blockIndex >= 0; blockIndex -= 1) {
      const block = content[blockIndex];
      if (block.type === "tool_result" && block.name === name) return block;
    }
  }
  return null;
}
function goalExecutorAdapter(options = {}) {
  const requests = [];
  let response = 0;
  let childOrdinal = 0;
  const childStates = new Map();
  const controllerStates = new Map();
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
          const childRunId = request.requestId.split(":", 1)[0];
          let phase = childStates.get(childRunId);
          if (!phase) {
            childOrdinal += 1;
            phase = options.blockChildOrdinal === childOrdinal ? "CHECKPOINT" : "COMPLETE";
            childStates.set(childRunId, phase);
          }
          if (phase === "CHECKPOINT") {
            childStates.set(childRunId, "BLOCK");
            yield { type: "started", providerResponseId: `goal-child-checkpoint-${++response}` };
            yield { type: "tool_call", toolCallId: `${childRunId}-workspace-${response}`, name: "workspace.list", argumentsJson: JSON.stringify({ path: "" }) };
            yield { type: "completed", stopReason: "tool_calls" };
            return;
          }
          if (phase === "BLOCK") {
            assert.ok(lastToolResult(request, "workspace.list"), "blocked child requires a durable Tool checkpoint");
            options.onChildBlocked?.(childRunId);
            await new Promise((resolve) => {
              if (request.signal?.aborted) return resolve();
              request.signal?.addEventListener("abort", resolve, { once: true });
            });
            throw new ModelAdapterError("MODEL_ABORTED", "Host shutdown interrupted the active Goal Plan child", false);
          }
          childStates.set(childRunId, "DONE");
          yield { type: "started", providerResponseId: `goal-child-${++response}` };
          yield { type: "text_delta", delta: `Final deliverable for ordered Plan child ${childOrdinal}.` };
          yield { type: "completed", stopReason: "stop" };
          return;
        }
        assert.deepEqual(names, CONTROLLER_TOOLS);
        const wakeRunId = request.requestId.split(":", 1)[0];
        const phase = controllerStates.get(wakeRunId) ?? "GET";
        if (phase === "GET") {
          controllerStates.set(wakeRunId, "DECIDE");
          yield { type: "started", providerResponseId: `goal-wake-get-${++response}` };
          yield { type: "tool_call", toolCallId: `${wakeRunId}-get-${response}`, name: "task_flow.get", argumentsJson: "{}" };
          yield { type: "completed", stopReason: "tool_calls" };
          return;
        }
        if (phase === "DECIDE") {
          const get = lastToolResult(request, "task_flow.get");
          assert.ok(get, "controller decision requires the current wake Run task_flow.get result");
          const revision = get.output.flow.revision;
          const next = get.output.flow.state?.nextStep;
          controllerStates.set(wakeRunId, next ? "RAN" : "FINISHED");
          yield { type: "started", providerResponseId: `goal-wake-decision-${++response}` };
          if (next) {
            yield {
              type: "tool_call",
              toolCallId: `${wakeRunId}-run-${response}`,
              name: "task_flow.run",
              argumentsJson: JSON.stringify({ expectedRevision: revision, requestKey: next.requestKey, stepKey: next.stepKey, text: next.text }),
            };
          } else {
            yield {
              type: "tool_call",
              toolCallId: `${wakeRunId}-finish-${response}`,
              name: "task_flow.finish",
              argumentsJson: JSON.stringify({ expectedRevision: revision, state: { goalExecutorCompleted: true } }),
            };
          }
          yield { type: "completed", stopReason: "tool_calls" };
          return;
        }
        yield { type: "started", providerResponseId: `goal-wake-done-${++response}` };
        yield { type: "text_delta", delta: phase === "RAN" ? "The next durable Plan step was admitted." : "The durable Goal Plan execution was completed." };
        yield { type: "completed", stopReason: "stop" };
      },
    },
  };
}

async function seedGoal(paths) {
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  try {
    let id = 0;
    const conversations = new ConversationService({ state, workspaceIds: ["default"], createId: () => `step021a-host-${++id}` });
    const goals = new GoalService(state, { createId: () => `step021a-goal-${++id}` });
    const conversation = conversations.create({ workspaceId: "default", modelProfile: "default", title: "Goal Plan executor Host" });
    const source = conversations.send({ workspaceId: "default", conversationId: conversation.conversationId, submissionKey: "step021a-goal-source", text: "Create the durable ordered Goal." });
    conversations.transitionRun({ runId: source.run.runId, status: "RUNNING" });
    conversations.transitionRun({ runId: source.run.runId, status: "COMPLETED", taskCompletionText: "Durable Goal source recorded." });
    const goal = goals.create({
      workspaceId: "default",
      conversationId: conversation.conversationId,
      sourceRunId: source.run.runId,
      sourceAttemptId: source.run.currentAttemptId,
      objective: "Produce and verify two ordered deliverables",
      steps: ["Produce the first deliverable", "Verify the second deliverable"],
    });
    return { conversation, goal };
  } finally {
    state.close();
  }
}

test("STEP021A Host closes the ordered Goal Plan loop through child completion delivery and controller decisions", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step021a-host-"));
  const workspace = join(root, "workspace"); await mkdir(workspace, { recursive: true });
  const profile = "step021a-host";
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config"), NO_COLOR: "1" };
  const secrets = createEphemeralOsSecretProviderForTests();
  let host = null; let client = null;
  try {
    const configured = await setup(root, profile, workspace, env, secrets);
    const seeded = await seedGoal(configured.paths);
    const model = goalExecutorAdapter();
    host = await startLocalHost({ profile, port: 0, env, config: configured.config, configRoot: configured.paths.configRoot, workspaceIds: ["default"], osSecretProvider: secrets, modelResolver: resolver(model.adapter) });
    await host.ready; client = await connect(host, "step021a-host");
    const started = await client.call("goalExecution.start", {
      workspaceId: "default",
      conversationId: seeded.conversation.conversationId,
      goalId: seeded.goal.goalId,
      expectedGoalRevision: seeded.goal.revision,
    }, 5_000);
    assert.equal(started.admitted, true);
    assert.equal(started.view.steps[0].status, "RUNNING");
    const completed = await waitFor(async () => {
      const view = await client.call("goalExecution.get", {
        workspaceId: "default",
        conversationId: seeded.conversation.conversationId,
        goalId: seeded.goal.goalId,
      }, 5_000);
      return view.execution.status === "SUCCEEDED" ? view : null;
    });
    assert.equal(completed.goal.status, "COMPLETED");
    assert.deepEqual(completed.steps.map((step) => step.status), ["SUCCEEDED", "SUCCEEDED"]);
    assert.equal(completed.flow.flow.status, "SUCCEEDED");
    assert.equal(completed.flow.tasks.filter((entry) => entry.task.taskKind === "task_flow.child").length, 2);
    assert.equal(new Set(completed.flow.tasks.map((entry) => entry.task.taskId)).size, completed.flow.tasks.length);
    assert.equal(model.requests.filter((request) => request.tools.some((tool) => tool.name === "task_flow.run")).length >= 1, true);
    assert.equal(model.requests.filter((request) => request.tools.some((tool) => tool.name === "task_flow.finish")).length >= 1, true);
  } finally {
    client?.close(); await host?.close("step021a-host-cleanup"); await rm(root, { recursive: true, force: true });
  }
});


test("STEP021A Host restart resumes the same active Plan Step Task and does not admit a duplicate child", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step021a-restart-"));
  const workspace = join(root, "workspace"); await mkdir(workspace, { recursive: true });
  const profile = "step021a-restart";
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config"), NO_COLOR: "1" };
  const secrets = createEphemeralOsSecretProviderForTests();
  let host = null; let client = null;
  try {
    const configured = await setup(root, profile, workspace, env, secrets);
    const seeded = await seedGoal(configured.paths);
    let blockedRunId = null;
    const firstModel = goalExecutorAdapter({ blockChildOrdinal: 2, onChildBlocked: (runId) => { blockedRunId = runId; } });
    host = await startLocalHost({ profile, port: 0, env, config: configured.config, configRoot: configured.paths.configRoot, workspaceIds: ["default"], osSecretProvider: secrets, modelResolver: resolver(firstModel.adapter) });
    await host.ready; client = await connect(host, "step021a-restart-before");
    await client.call("goalExecution.start", {
      workspaceId: "default", conversationId: seeded.conversation.conversationId,
      goalId: seeded.goal.goalId, expectedGoalRevision: seeded.goal.revision,
    }, 5_000);
    await waitFor(() => blockedRunId, 12_000);
    const before = await client.call("goalExecution.get", {
      workspaceId: "default", conversationId: seeded.conversation.conversationId, goalId: seeded.goal.goalId,
    }, 5_000);
    assert.deepEqual(before.steps.map((step) => step.status), ["SUCCEEDED", "RUNNING"]);
    const secondTaskId = before.steps[1].currentTaskId;
    assert.ok(secondTaskId);
    const secondBefore = await client.call("task.get", { workspaceId: "default", taskId: secondTaskId }, 5_000);
    const secondRunId = secondBefore.task.runId;
    assert.equal(before.flow.tasks.filter((entry) => entry.task.taskKind === "task_flow.child").length, 2);
    client.close(); client = null;
    await host.close("step021a-restart-boundary"); host = null;

    const secondModel = goalExecutorAdapter();
    host = await startLocalHost({ profile, port: 0, env, config: configured.config, configRoot: configured.paths.configRoot, workspaceIds: ["default"], osSecretProvider: secrets, modelResolver: resolver(secondModel.adapter) });
    await host.ready; client = await connect(host, "step021a-restart-after");
    const completed = await waitFor(async () => {
      const view = await client.call("goalExecution.get", {
        workspaceId: "default", conversationId: seeded.conversation.conversationId, goalId: seeded.goal.goalId,
      }, 5_000);
      return view.execution.status === "SUCCEEDED" ? view : null;
    }, 15_000);
    assert.equal(completed.goal.status, "COMPLETED");
    assert.equal(completed.steps[1].currentTaskId, secondTaskId);
    const secondAfter = await client.call("task.get", { workspaceId: "default", taskId: secondTaskId }, 5_000);
    assert.equal(secondAfter.task.runId, secondRunId);
    assert.equal(secondAfter.task.status, "SUCCEEDED");
    assert.equal(completed.flow.tasks.filter((entry) => entry.task.taskKind === "task_flow.child").length, 2);
    assert.equal(new Set(completed.flow.tasks.map((entry) => entry.task.taskId)).size, completed.flow.tasks.length);
  } finally {
    client?.close(); await host?.close("step021a-restart-cleanup"); await rm(root, { recursive: true, force: true });
  }
});
