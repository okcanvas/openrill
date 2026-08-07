import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { TaskService } from "../../packages/tasks/dist/index.js";
import { TaskFlowControllerRuntimeFactory, TaskFlowService } from "../../packages/task-flows/dist/index.js";
import { createDefaultOperationRegistry } from "../../services/agent-host/dist/transport/operation-registry.js";

function status() { return { product: "OpenRill", version: "0.20.3-step020c", profile: "flow-controller", pid: 1, instanceId: "test", bind: "127.0.0.1", port: 0, startedAt: new Date(0).toISOString(), state: "READY", readiness: true }; }

test("STEP020C protocol exposes bound create/run/wait/resume/finish/fail controller operations", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step020c-protocol-"));
  const paths = resolveProfilePaths({ profile: "flow-controller", env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  try {
    let id = 0;
    const conversations = new ConversationService({ state, workspaceIds: ["alpha"], createId: () => `controller-${++id}` });
    const tasks = new TaskService(state, ["alpha"]);
    const flows = new TaskFlowService(state, tasks, ["alpha"]);
    const ownerKey = conversations.create({ workspaceId: "alpha" }).conversationId;
    const scheduled = [];
    const factory = new TaskFlowControllerRuntimeFactory({ state, conversations, tasks, taskFlows: flows, scheduleRun: (runId) => { scheduled.push(runId); return true; } });
    const bind = (input) => factory.bind(input);
    const hooks = {
      list: (input) => ({ items: flows.list(input) }),
      get: (input) => flows.get(input),
      create: (input) => bind(input).createManaged(input),
      run: (input) => bind(input).runTask(input),
      wait: (input) => bind(input).setWaiting(input),
      resume: (input) => bind(input).resume(input),
      finish: (input) => bind(input).finish(input),
      fail: (input) => bind(input).fail(input),
      cancel: () => { throw new Error("not used"); },
    };
    const registry = createDefaultOperationRegistry(
      status, conversations, () => {},
      { schedule: () => true, cancel: () => true, execute: async () => { throw new Error("not used"); } },
      undefined, undefined, undefined, undefined, undefined, hooks,
    );
    const capabilities = registry.capabilities().map((entry) => entry.name);
    for (const operation of ["taskFlow.create", "taskFlow.run", "taskFlow.wait", "taskFlow.resume", "taskFlow.finish", "taskFlow.fail"]) assert.ok(capabilities.includes(operation));

    const identity = { workspaceId: "alpha", ownerKey, controllerId: "protocol/controller" };
    const created = await registry.invoke("create", "taskFlow.create", { ...identity, requestKey: "flow", goal: "Protocol managed flow", currentStep: "one", state: { count: 0 } });
    assert.equal(created.ok, true);
    assert.equal(created.output.replayed, false);
    const flowId = created.output.flow.flowId;
    const run = await registry.invoke("run", "taskFlow.run", { ...identity, flowId, expectedRevision: created.output.flow.revision, requestKey: "child", stepKey: "one", text: "execute protocol child" });
    assert.equal(run.ok, true);
    assert.equal(run.output.scheduled, true);
    assert.equal(run.output.flow.flow.status, "RUNNING");
    assert.deepEqual(scheduled, [run.output.run.runId]);

    const waiting = await registry.invoke("wait", "taskFlow.wait", { ...identity, flowId, expectedRevision: run.output.flow.flow.revision, currentStep: "review", wait: { kind: "operator" } });
    assert.equal(waiting.ok, true);
    assert.equal(waiting.output.status, "WAITING");
    const resumed = await registry.invoke("resume", "taskFlow.resume", { ...identity, flowId, expectedRevision: waiting.output.revision, status: "RUNNING", currentStep: "review" });
    assert.equal(resumed.ok, true);
    assert.equal(resumed.output.status, "RUNNING");
    const finished = await registry.invoke("finish", "taskFlow.finish", { ...identity, flowId, expectedRevision: resumed.output.revision, state: { count: 1 } });
    assert.equal(finished.ok, true);
    assert.equal(finished.output.status, "SUCCEEDED");

    const replay = await registry.invoke("replay", "taskFlow.create", { ...identity, requestKey: "flow", goal: "Protocol managed flow", currentStep: "one", state: { count: 0 } });
    assert.equal(replay.ok, true);
    assert.equal(replay.output.replayed, true);
    assert.equal(replay.output.flow.status, "SUCCEEDED");

    const denied = await registry.invoke("denied", "taskFlow.wait", { ...identity, controllerId: "protocol/other", flowId, expectedRevision: finished.output.revision });
    assert.equal(denied.ok, false);
    assert.equal(denied.error.code, "ACCESS_DENIED");
    const invalid = await registry.invoke("invalid", "taskFlow.run", { ...identity, flowId, expectedRevision: 1, requestKey: "bad", stepKey: "one", text: "x", extra: true });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error.code, "INVALID_INPUT");
  } finally {
    state.close();
    await rm(root, { recursive: true, force: true });
  }
});
