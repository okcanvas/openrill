import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { TaskMaintenanceService, TaskService } from "../../packages/tasks/dist/index.js";
import { LocalCliProtocolClient } from "../../apps/agent-cli/dist/local-protocol-client.js";
import { readHostMetadata, startLocalHost } from "../../services/agent-host/dist/index.js";

async function seed(root, profile, terminalAt = 1_000) {
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config"), NO_COLOR: "1" };
  const paths = resolveProfilePaths({ profile, env, platform: process.platform });
  let seq = 0;
  const state = await openOpenRillStateDatabase({ profilePaths: paths, now: () => terminalAt });
  const conversations = new ConversationService({ state, workspaceIds: ["default"], now: () => terminalAt, createId: () => `step023a-host-${++seq}` });
  const tasks = new TaskService(state, ["default"]);
  const conversation = conversations.create({ workspaceId: "default", title: "retention host" });
  const sent = conversations.send({ workspaceId: "default", conversationId: conversation.conversationId, submissionKey: "retention-host", text: "terminal" });
  conversations.transitionRun({ runId: sent.run.runId, status: "RUNNING" });
  conversations.transitionRun({ runId: sent.run.runId, status: "COMPLETED" });
  const maintenance = new TaskMaintenanceService({ state, workspaceIds: ["default"], now: () => terminalAt, runtimeAuthorityAvailable: () => false });
  maintenance.reconcile({ workspaceId: "default", mode: "APPLY", includeRetention: false });
  const task = tasks.getByRun({ workspaceId: "default", runId: sent.run.runId });
  state.close();
  return { env, paths, task };
}

async function connect(host) {
  const metadata = await readHostMetadata(host.paths); assert.ok(metadata);
  const client = new LocalCliProtocolClient(metadata, "step023a-maintenance-host", process.platform);
  await client.connect(); return client;
}

test("STEP023A Local Protocol exposes closed retention preview/prune/tombstone operations without raw payload history", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step023a-host-protocol-"));
  const profile = "step023a-maintenance-protocol";
  const seeded = await seed(root, profile);
  const clock = 1_000 + 31 * 24 * 60 * 60_000;
  let host = null; let client = null;
  try {
    host = await startLocalHost({ profile, env: seeded.env, port: 0, workspaceIds: ["default"], now: () => clock, maintenanceAutoArm: false });
    await host.ready; client = await connect(host);
    const previewBeforeSchedule = await client.call("maintenance.retention.preview", { workspaceId: "default" }, 5_000);
    assert.equal(previewBeforeSchedule.scanned, 0);
    const applied = await client.call("maintenance.retention.prune", { workspaceId: "default" }, 5_000);
    assert.equal(applied.state, "COMPLETED"); assert.equal(applied.scheduled.tasks, 1); assert.equal(applied.prunedByKind.TASK, 1);
    const tombstones = await client.call("maintenance.retention.tombstones", { workspaceId: "default", entityKind: "TASK" }, 5_000);
    assert.equal(tombstones.items.length, 1); assert.equal(tombstones.items[0].entityId, seeded.task.taskId);
    assert.deepEqual(Object.keys(tombstones.items[0]).sort(), ["cleanupAfter","entityId","entityKind","metadataHash","prunedAt","sourceRef","terminalAt","terminalStatus","workspaceId"].sort());
    await assert.rejects(() => client.call("maintenance.retention.prune", { workspaceId: "default", extra: true }, 5_000));
  } finally { client?.close(); await host?.close("step023a-host-protocol"); await rm(root, { recursive: true, force: true }); }
});

test("STEP023A Host-owned initial periodic sweep physically prunes due history and restart does not duplicate tombstones", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step023a-host-sweep-"));
  const profile = "step023a-maintenance-sweep";
  const seeded = await seed(root, profile);
  const clock = 1_000 + 31 * 24 * 60 * 60_000;
  let host = null;
  try {
    host = await startLocalHost({ profile, env: seeded.env, port: 0, workspaceIds: ["default"], now: () => clock });
    await host.ready; await host.close("step023a-first"); host = null;
    let state = await openOpenRillStateDatabase({ profilePaths: seeded.paths, now: () => clock });
    let snapshot = state.transaction((r) => ({ task: r.tasks.get(seeded.task.taskId), tombstones: r.retention.listTombstones({ workspaceId: "default", entityKind: "TASK", limit: 10 }) }));
    state.close();
    assert.equal(snapshot.task, null); assert.equal(snapshot.tombstones.length, 1);

    host = await startLocalHost({ profile, env: seeded.env, port: 0, workspaceIds: ["default"], now: () => clock });
    await host.ready; await host.close("step023a-second"); host = null;
    state = await openOpenRillStateDatabase({ profilePaths: seeded.paths, now: () => clock });
    snapshot = state.transaction((r) => ({ task: r.tasks.get(seeded.task.taskId), tombstones: r.retention.listTombstones({ workspaceId: "default", entityKind: "TASK", limit: 10 }) }));
    state.close();
    assert.equal(snapshot.task, null); assert.equal(snapshot.tombstones.length, 1);
  } finally { await host?.close("step023a-host-sweep"); await rm(root, { recursive: true, force: true }); }
});
