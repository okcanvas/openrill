import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { TaskService } from "../../packages/tasks/dist/index.js";
import { TaskFlowService } from "../../packages/task-flows/dist/index.js";
import { createDefaultOperationRegistry } from "../../services/agent-host/dist/transport/operation-registry.js";

function status() { return { product: "OpenRill", version: "0.20.1-step020b", profile: "flow-protocol", pid: 1, instanceId: "test", bind: "127.0.0.1", port: 0, startedAt: new Date(0).toISOString(), state: "READY", readiness: true }; }

test("STEP020B local protocol closes taskFlow.list, taskFlow.get, and taskFlow.cancel", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step020b-protocol-"));
  const paths = resolveProfilePaths({ profile: "flow-protocol", env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  try {
    let id = 0;
    const conversations = new ConversationService({ state, workspaceIds: ["alpha"], createId: () => `flow-${++id}` });
    const tasks = new TaskService(state, ["alpha"]);
    const flows = new TaskFlowService(state, tasks, ["alpha"]);
    const conversation = conversations.create({ workspaceId: "alpha" });
    const sent = conversations.send({ workspaceId: "alpha", conversationId: conversation.conversationId, submissionKey: "one", text: "flow child" });
    const task = tasks.getByRun({ workspaceId: "alpha", runId: sent.run.runId });
    const ownerKey = conversation.conversationId;
    let flow = flows.create({ workspaceId: "alpha", ownerKey, controllerId: "tests/protocol", goal: "Inspect and cancel", status: "RUNNING" });
    flow = flows.linkTask({ workspaceId: "alpha", ownerKey, flowId: flow.flowId, taskId: task.taskId, expectedRevision: flow.revision, stepKey: "child" }).flow;
    const cancelTask = (current) => tasks.cancel({ workspaceId: current.workspaceId, taskId: current.taskId }, (owned) => conversations.cancel({ workspaceId: owned.workspaceId, conversationId: owned.conversationId, runId: owned.runId }));
    const registry = createDefaultOperationRegistry(
      status, conversations, () => {},
      { schedule: () => true, cancel: () => true, execute: async () => { throw new Error("not used"); } },
      undefined, undefined, undefined, undefined, undefined,
      {
        list: (input) => ({ items: flows.list(input) }),
        get: (input) => flows.get(input),
        cancel: (input) => flows.cancel(input, cancelTask),
      },
    );
    const capabilities = registry.capabilities().map((entry) => entry.name);
    assert.ok(capabilities.includes("taskFlow.list"));
    assert.ok(capabilities.includes("taskFlow.get"));
    assert.ok(capabilities.includes("taskFlow.cancel"));
    const invalid = await registry.invoke("bad", "taskFlow.list", { workspaceId: "alpha", extra: true });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error.code, "INVALID_INPUT");
    const listed = await registry.invoke("list", "taskFlow.list", { workspaceId: "alpha", ownerKey });
    assert.equal(listed.ok, true);
    assert.equal(listed.output.items[0].flowId, flow.flowId);
    const detail = await registry.invoke("get", "taskFlow.get", { workspaceId: "alpha", ownerKey, flowId: flow.flowId });
    assert.equal(detail.ok, true);
    assert.equal(detail.output.tasks[0].taskId, task.taskId);
    const cancelled = await registry.invoke("cancel", "taskFlow.cancel", { workspaceId: "alpha", ownerKey, flowId: flow.flowId, expectedRevision: flow.revision });
    assert.equal(cancelled.ok, true);
    assert.equal(cancelled.output.flow.flow.status, "CANCELLED");
    assert.equal(cancelled.output.affectedTasks, 1);
    const conflict = await registry.invoke("conflict", "taskFlow.cancel", { workspaceId: "alpha", ownerKey, flowId: "missing", expectedRevision: 1 });
    assert.equal(conflict.ok, false);
    assert.equal(conflict.error.code, "NOT_FOUND");
  } finally {
    state.close();
    await rm(root, { recursive: true, force: true });
  }
});
