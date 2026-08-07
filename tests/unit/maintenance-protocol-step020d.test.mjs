import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { TaskMaintenanceService, TaskService } from "../../packages/tasks/dist/index.js";
import { TaskFlowMaintenanceService, TaskFlowService } from "../../packages/task-flows/dist/index.js";
import { createDefaultOperationRegistry } from "../../services/agent-host/dist/transport/operation-registry.js";

function status() { return { product: "OpenRill", version: "0.20.4-step020d", profile: "maintenance-protocol", pid: 1, instanceId: "test", bind: "127.0.0.1", port: 0, startedAt: new Date(0).toISOString(), state: "READY", readiness: true }; }

test("STEP020D local protocol exposes closed Task and Task Flow audit, reconcile, and retention preview operations", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step020d-protocol-"));
  const paths = resolveProfilePaths({ profile: "maintenance-protocol", env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  try {
    let id = 0;
    const conversations = new ConversationService({ state, workspaceIds: ["alpha"], createId: () => `maintenance-${++id}` });
    const tasks = new TaskService(state, ["alpha"]);
    const flows = new TaskFlowService(state, tasks, ["alpha"]);
    const conversation = conversations.create({ workspaceId: "alpha" });
    const sent = conversations.send({ workspaceId: "alpha", conversationId: conversation.conversationId, submissionKey: "one", text: "maintenance child" });
    const task = tasks.getByRun({ workspaceId: "alpha", runId: sent.run.runId });
    let flow = flows.create({ workspaceId: "alpha", ownerKey: conversation.conversationId, controllerId: "tests/maintenance", goal: "maintenance", status: "RUNNING" });
    flow = flows.linkTask({ workspaceId: "alpha", ownerKey: conversation.conversationId, flowId: flow.flowId, taskId: task.taskId, expectedRevision: flow.revision }).flow;
    const cancelTask = (current) => tasks.cancel({ workspaceId: current.workspaceId, taskId: current.taskId }, (owned) => conversations.cancel({ workspaceId: owned.workspaceId, conversationId: owned.conversationId, runId: owned.runId }));
    const taskMaintenance = new TaskMaintenanceService({ state, workspaceIds: ["alpha"], runtimeAuthorityAvailable: () => false });
    const flowMaintenance = new TaskFlowMaintenanceService({ state, workspaceIds: ["alpha"], cancelFlow: (input) => flows.cancel(input, cancelTask) });
    const registry = createDefaultOperationRegistry(
      status, conversations, () => {},
      { schedule: () => true, cancel: () => true, execute: async () => { throw new Error("not used"); } },
      undefined, undefined, undefined, undefined,
      {
        list: (input) => ({ items: tasks.list(input) }),
        get: (input) => tasks.get(input),
        cancel: (input) => tasks.cancel(input, cancelTask),
        audit: (input) => taskMaintenance.audit(input),
        reconcile: (input) => taskMaintenance.reconcile(input),
        retentionPreview: (input) => taskMaintenance.retentionPreview(input),
      },
      {
        list: (input) => ({ items: flows.list(input) }),
        get: (input) => flows.get(input),
        create: () => { throw new Error("not used"); },
        run: () => { throw new Error("not used"); },
        wait: () => { throw new Error("not used"); },
        resume: () => { throw new Error("not used"); },
        finish: () => { throw new Error("not used"); },
        fail: () => { throw new Error("not used"); },
        cancel: (input) => flows.cancel(input, cancelTask),
        audit: (input) => flowMaintenance.audit(input),
        reconcile: (input) => flowMaintenance.reconcile(input),
        retentionPreview: (input) => flowMaintenance.retentionPreview(input),
      },
    );
    const capabilities = registry.capabilities().map((entry) => entry.name);
    for (const operation of ["task.audit", "task.reconcile", "task.retention.preview", "taskFlow.audit", "taskFlow.reconcile", "taskFlow.retention.preview"]) assert.ok(capabilities.includes(operation), operation);

    const taskAudit = await registry.invoke("task-audit", "task.audit", { workspaceId: "alpha" });
    assert.equal(taskAudit.ok, true);
    assert.ok(Array.isArray(taskAudit.output.findings));
    const taskPreview = await registry.invoke("task-preview", "task.reconcile", { workspaceId: "alpha", mode: "PREVIEW" });
    assert.equal(taskPreview.ok, true);
    assert.equal(taskPreview.output.mode, "PREVIEW");
    const taskRetention = await registry.invoke("task-retention", "task.retention.preview", { workspaceId: "alpha" });
    assert.equal(taskRetention.ok, true);
    assert.equal(taskRetention.output.candidates.length, 0);

    const flowAudit = await registry.invoke("flow-audit", "taskFlow.audit", { workspaceId: "alpha", ownerKey: conversation.conversationId });
    assert.equal(flowAudit.ok, true);
    assert.ok(Array.isArray(flowAudit.output.findings));
    const flowPreview = await registry.invoke("flow-preview", "taskFlow.reconcile", { workspaceId: "alpha", ownerKey: conversation.conversationId, mode: "PREVIEW" });
    assert.equal(flowPreview.ok, true);
    assert.equal(flowPreview.output.mode, "PREVIEW");
    const flowRetention = await registry.invoke("flow-retention", "taskFlow.retention.preview", { workspaceId: "alpha", ownerKey: conversation.conversationId });
    assert.equal(flowRetention.ok, true);
    assert.equal(flowRetention.output.candidates.length, 0);

    for (const [operation, input] of [
      ["task.audit", { workspaceId: "alpha", unknown: true }],
      ["task.reconcile", { workspaceId: "alpha", mode: "UNSAFE" }],
      ["taskFlow.audit", { workspaceId: "alpha", ownerKey: conversation.conversationId, unknown: true }],
      ["taskFlow.reconcile", { workspaceId: "alpha", ownerKey: conversation.conversationId, mode: "UNSAFE" }],
    ]) {
      const invalid = await registry.invoke(`invalid-${operation}`, operation, input);
      assert.equal(invalid.ok, false);
      assert.equal(invalid.error.code, "INVALID_INPUT");
    }
  } finally {
    state.close();
    await rm(root, { recursive: true, force: true });
  }
});
