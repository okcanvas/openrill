import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { TaskService } from "../../packages/tasks/dist/index.js";
import { createDefaultOperationRegistry } from "../../services/agent-host/dist/transport/operation-registry.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "openrill-step020a-protocol-"));
  const paths = resolveProfilePaths({ profile: "task-protocol", env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  let n = 0;
  const conversations = new ConversationService({ state, workspaceIds: ["alpha"], createId: () => `protocol-${++n}` });
  const tasks = new TaskService(state, ["alpha"]);
  const conversation = conversations.create({ workspaceId: "alpha" });
  const sent = conversations.send({ workspaceId: "alpha", conversationId: conversation.conversationId, submissionKey: "send", text: "protocol task" });
  const task = tasks.getByRun({ workspaceId: "alpha", runId: sent.run.runId });
  return { root, state, conversations, tasks, sent, task, cleanup: async () => { state.close(); await rm(root, { recursive: true, force: true }); } };
}

function status() {
  return { product: "OpenRill", version: "0.20.0-step020a", profile: "task-protocol", pid: 1, instanceId: "test", bind: "127.0.0.1", port: 0, startedAt: new Date(0).toISOString(), state: "READY", readiness: true };
}

test("STEP020A local protocol exposes task.list, task.get, and task.cancel as closed operations", async () => {
  const f = await fixture();
  try {
    const registry = createDefaultOperationRegistry(
      status,
      f.conversations,
      () => {},
      { schedule: () => true, cancel: () => true, execute: async () => { throw new Error("not used"); } },
      undefined,
      undefined,
      undefined,
      undefined,
      {
        list: (input) => ({ items: f.tasks.list(input) }),
        get: (input) => f.tasks.get(input),
        cancel: (input) => f.tasks.cancel(input, (task) => f.conversations.cancel({ workspaceId: task.workspaceId, conversationId: task.conversationId, runId: task.runId })),
      },
    );
    const capabilities = registry.capabilities().map((item) => item.name);
    for (const operation of ["task.list", "task.get", "task.cancel"]) assert.ok(capabilities.includes(operation));

    const listed = await registry.invoke("list", "task.list", { workspaceId: "alpha" });
    assert.equal(listed.ok, true);
    assert.equal(listed.output.items[0].taskId, f.task.taskId);

    const invalid = await registry.invoke("invalid", "task.list", { workspaceId: "alpha", unknown: true });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error.code, "INVALID_INPUT");

    const got = await registry.invoke("get", "task.get", { workspaceId: "alpha", taskId: f.task.taskId });
    assert.equal(got.ok, true);
    assert.equal(got.output.task.runId, f.sent.run.runId);
    assert.ok(got.output.events.length >= 1);

    const cancelled = await registry.invoke("cancel", "task.cancel", { workspaceId: "alpha", taskId: f.task.taskId });
    assert.equal(cancelled.ok, true);
    assert.equal(cancelled.output.status, "CANCELLED");
  } finally { await f.cleanup(); }
});
