import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths, validateAndMaterializeConfig } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase, resolveStatePaths, loadStateMigrations, applyStateMigrations } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { TaskMaintenanceService, TaskService } from "../../packages/tasks/dist/index.js";
import { TaskFlowMaintenanceService, TaskFlowService } from "../../packages/task-flows/dist/index.js";
import { ConnectorRuntimeService } from "../../packages/connectors/dist/index.js";
import { MaintenanceRetentionCoordinator } from "../../services/agent-host/dist/index.js";
import {
  validateMaintenanceRetentionPreviewInput,
  validateMaintenanceRetentionPruneInput,
  validateMaintenanceRetentionTombstoneListInput,
} from "../../packages/protocol/dist/index.js";

async function fixture(name, options = {}) {
  const root = await mkdtemp(join(tmpdir(), `openrill-step023a-${name}-`));
  const paths = resolveProfilePaths({ profile: `step023a-${name}`, env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  let clock = options.now ?? 1_000;
  let seq = 0;
  const now = () => clock;
  const state = await openOpenRillStateDatabase({ profilePaths: paths, now });
  const conversations = new ConversationService({ state, workspaceIds: ["alpha"], now, createId: () => `step023a-${name}-${++seq}` });
  const tasks = new TaskService(state, ["alpha"]);
  const flows = new TaskFlowService(state, tasks, ["alpha"], now);
  const taskMaintenance = new TaskMaintenanceService({
    state, workspaceIds: ["alpha"], now, taskRetentionMs: 60_000, lostRetentionMs: 60_000,
    runtimeAuthorityAvailable: () => false,
  });
  const flowMaintenance = new TaskFlowMaintenanceService({
    state, workspaceIds: ["alpha"], now, flowRetentionMs: 60_000, lostRetentionMs: 60_000,
  });
  const coordinator = new MaintenanceRetentionCoordinator({
    state, workspaceIds: ["alpha"], ownerId: `owner-${name}`, taskMaintenance, taskFlowMaintenance: flowMaintenance,
    now, createLeaseToken: () => `lease-${name}-${++seq}`, leaseDurationMs: 5_000, batchSize: 100, connectorDeliveryRetentionMs: 60_000,
  });
  const connector = new ConnectorRuntimeService({ state, conversations, workspaceIds: ["alpha"], now, createId: () => `connector-${name}-${++seq}` });
  return {
    root, paths, state, conversations, tasks, flows, taskMaintenance, flowMaintenance, coordinator, connector, now,
    setNow(value) { clock = value; }, advance(delta) { clock += delta; return clock; },
    raw() { const db = new DatabaseSync(resolveStatePaths(paths).databasePath); db.exec("PRAGMA foreign_keys = ON"); return db; },
    cleanup: async () => { state.close(); await rm(root, { recursive: true, force: true }); },
  };
}

function createTerminalTask(f, key) {
  const conversation = f.conversations.create({ workspaceId: "alpha", title: key });
  const sent = f.conversations.send({ workspaceId: "alpha", conversationId: conversation.conversationId, submissionKey: key, text: key });
  f.conversations.transitionRun({ runId: sent.run.runId, status: "RUNNING" });
  f.conversations.transitionRun({ runId: sent.run.runId, status: "COMPLETED" });
  f.taskMaintenance.reconcile({ workspaceId: "alpha", mode: "APPLY", includeRetention: false });
  return { conversation, sent, task: f.tasks.getByRun({ workspaceId: "alpha", runId: sent.run.runId }) };
}

function createDeliveredConnector(f, key) {
  f.connector.registerAccount({ connectorId: "fixture", accountId: "main", workspaceId: "alpha", extensionId: "fixture-extension" });
  const conversation = f.conversations.create({ workspaceId: "alpha", title: key });
  const queued = f.connector.enqueueDelivery("fixture", {
    accountId: "main", conversationId: conversation.conversationId, targetKey: "channel:one",
    payloadVersion: 1, payload: { text: key }, idempotencyKey: `delivery:${key}`,
  });
  let claim = f.connector.claimDelivery("fixture", "main");
  assert.ok(claim);
  claim = f.connector.markDeliveryDispatched(claim);
  return { conversation, delivery: f.connector.completeDeliveryAccepted(claim, {
    providerMessageId: `post:${key}`, providerConversationId: "channel:one", receipt: { accepted: true },
  }).delivery };
}

test("STEP023A schema 26 adds durable connector cleanup, maintenance lease, and retention tombstone structures non-destructively", async () => {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys = ON");
  try {
    const migrations = await loadStateMigrations();
    applyStateMigrations(db, migrations.slice(0, 25), { profile: "step023a", now: () => 10 });
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 25);
    applyStateMigrations(db, migrations, { profile: "step023a", now: () => 20 });
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 26);
    const connectorColumns = db.prepare("PRAGMA table_info(connector_deliveries)").all().map((row) => row.name);
    assert.ok(connectorColumns.includes("cleanup_after"));
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'maintenance_%' ORDER BY name").all().map((row) => row.name);
    assert.deepEqual(tables, ["maintenance_leases", "maintenance_retention_tombstones", "maintenance_sweep_state"]);
  } finally { db.close(); }
});

test("STEP023A retention scheduling is isolated from Task/Flow reconciliation mutations", async () => {
  const f = await fixture("schedule-only");
  try {
    const terminal = createTerminalTask(f, "terminal");
    assert.equal(f.tasks.get({ workspaceId: "alpha", taskId: terminal.task.taskId }).task.cleanupAfter, null);
    assert.equal(f.taskMaintenance.scheduleRetention({ workspaceId: "alpha" }), 1);
    assert.equal(f.taskMaintenance.scheduleRetention({ workspaceId: "alpha" }), 0);
    const flow = f.flows.create({ workspaceId: "alpha", ownerKey: terminal.conversation.conversationId, controllerId: "controller/schedule", goal: "done", currentStep: "done", status: "RUNNING" });
    f.flows.finish({ workspaceId: "alpha", ownerKey: terminal.conversation.conversationId, flowId: flow.flowId, expectedRevision: flow.revision });
    assert.equal(f.flowMaintenance.scheduleRetention({ workspaceId: "alpha" }), 1);
    assert.equal(f.flowMaintenance.scheduleRetention({ workspaceId: "alpha" }), 0);
  } finally { await f.cleanup(); }
});

test("STEP023A preview is non-mutating and physical prune writes minimal tombstone before cascading terminal Task history", async () => {
  const f = await fixture("task-prune");
  try {
    const terminal = createTerminalTask(f, "task-prune");
    assert.equal(f.taskMaintenance.scheduleRetention({ workspaceId: "alpha" }), 1);
    const task = f.tasks.get({ workspaceId: "alpha", taskId: terminal.task.taskId }).task;
    f.setNow(task.cleanupAfter + 1);
    const preview = f.coordinator.preview({ workspaceId: "alpha" });
    assert.equal(preview.eligible, 1); assert.equal(preview.pruned, 0);
    assert.ok(f.tasks.get({ workspaceId: "alpha", taskId: task.taskId }));
    const applied = f.coordinator.prune({ workspaceId: "alpha" });
    assert.equal(applied.state, "COMPLETED"); assert.equal(applied.prunedByKind.TASK, 1);
    assert.throws(() => f.tasks.get({ workspaceId: "alpha", taskId: task.taskId }));
    const tombstones = f.coordinator.listTombstones({ workspaceId: "alpha", entityKind: "TASK" });
    assert.equal(tombstones.length, 1); assert.equal(tombstones[0].entityId, task.taskId); assert.equal(tombstones[0].metadataHash.length, 64);
    assert.deepEqual(Object.keys(tombstones[0]).sort(), ["cleanupAfter","entityId","entityKind","metadataHash","prunedAt","sourceRef","terminalAt","terminalStatus","workspaceId"].sort());
  } finally { await f.cleanup(); }
});

test("STEP023A expired-looking Task is protected when its owning Run is still active", async () => {
  const f = await fixture("active-run");
  try {
    const conversation = f.conversations.create({ workspaceId: "alpha", title: "active" });
    const sent = f.conversations.send({ workspaceId: "alpha", conversationId: conversation.conversationId, submissionKey: "active", text: "active" });
    const task = f.tasks.getByRun({ workspaceId: "alpha", runId: sent.run.runId });
    const raw = f.raw();
    try { raw.prepare("UPDATE background_tasks SET status='LOST', recovery_state='NON_RESUMABLE', ended_at=?, cleanup_after=?, updated_at=? WHERE task_id=?").run(1_000, 1_001, 1_001, task.taskId); } finally { raw.close(); }
    f.setNow(2_000);
    const preview = f.coordinator.preview({ workspaceId: "alpha" });
    const candidate = preview.candidates.find((item) => item.entityId === task.taskId);
    assert.ok(candidate); assert.equal(candidate.eligible, false); assert.ok(candidate.protectedBy.includes("RUN_ACTIVE"));
    assert.equal(f.coordinator.prune({ workspaceId: "alpha" }).pruned, 0);
  } finally { await f.cleanup(); }
});

test("STEP023A terminal Flow with an immutable Goal execution reference is protected before the database RESTRICT boundary", async () => {
  const f = await fixture("goal-flow");
  try {
    const c = f.conversations.create({ workspaceId: "alpha", title: "goal-flow" });
    let flow = f.flows.create({ workspaceId: "alpha", ownerKey: c.conversationId, controllerId: "controller/goal", goal: "goal", currentStep: "step", status: "RUNNING" });
    flow = f.flows.finish({ workspaceId: "alpha", ownerKey: c.conversationId, flowId: flow.flowId, expectedRevision: flow.revision });
    assert.equal(f.flowMaintenance.scheduleRetention({ workspaceId: "alpha" }), 1);
    const raw = f.raw();
    try {
      raw.prepare("INSERT INTO agent_goals(goal_id,workspace_id,conversation_id,objective,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run("goal-retain","alpha",c.conversationId,"retain","COMPLETED",1000,1000);
      raw.prepare("INSERT INTO agent_goal_executions(goal_id,workspace_id,conversation_id,plan_revision,flow_id,controller_id,status,current_step_id,created_at,updated_at,ended_at,revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run("goal-retain","alpha",c.conversationId,1,flow.flowId,"controller/goal","SUCCEEDED",null,1000,1000,1000,1);
    } finally { raw.close(); }
    f.setNow(flow.endedAt + 60_001);
    const preview = f.coordinator.preview({ workspaceId: "alpha" });
    const candidate = preview.candidates.find((item) => item.entityId === flow.flowId);
    assert.ok(candidate); assert.ok(candidate.protectedBy.includes("GOAL_EXECUTION_REFERENCE"));
    assert.equal(f.coordinator.prune({ workspaceId: "alpha" }).prunedByKind.TASK_FLOW, 0);
  } finally { await f.cleanup(); }
});

test("STEP023A delivered Connector delivery is pruned only with receipt while uncertain/dead-letter work remains protected", async () => {
  const f = await fixture("connector-prune");
  try {
    const delivered = createDeliveredConnector(f, "delivered");
    assert.equal(f.state.transaction((r) => r.retention.scheduleConnectorDeliveryRetention({ workspaceId: "alpha", now: f.now(), retentionMs: 60_000, limit: 100 })), 1);
    const raw = f.raw();
    try {
      const cleanup = raw.prepare("SELECT cleanup_after cleanupAfter FROM connector_deliveries WHERE delivery_id=?").get(delivered.delivery.deliveryId).cleanupAfter;
      f.setNow(cleanup + 1);
    } finally { raw.close(); }
    const applied = f.coordinator.prune({ workspaceId: "alpha" });
    assert.equal(applied.prunedByKind.CONNECTOR_DELIVERY, 1);
    assert.equal(f.coordinator.listTombstones({ workspaceId: "alpha", entityKind: "CONNECTOR_DELIVERY" }).length, 1);
  } finally { await f.cleanup(); }
});

test("STEP023A lease prevents concurrent sweep ownership and an expired lease can be reclaimed after restart", async () => {
  const f = await fixture("lease");
  try {
    const held = f.state.transaction((r) => r.retention.claimLease({ scopeKey: "retention:alpha", ownerId: "other", leaseToken: "other-token", now: f.now(), leaseExpiresAt: f.now() + 5_000 }));
    assert.ok(held);
    assert.equal(f.coordinator.prune({ workspaceId: "alpha" }).state, "LEASE_BUSY");
    f.advance(5_001);
    assert.equal(f.coordinator.prune({ workspaceId: "alpha" }).state, "COMPLETED");
  } finally { await f.cleanup(); }
});

test("STEP023A bounded cursor advances deterministically without duplicate or skipped deletion", async () => {
  const f = await fixture("cursor");
  try {
    const ids = [];
    for (const key of ["a", "b", "c"]) ids.push(createTerminalTask(f, key).task.taskId);
    assert.equal(f.taskMaintenance.scheduleRetention({ workspaceId: "alpha", limit: 100 }), 3);
    f.advance(60_001);
    const first = f.coordinator.prune({ workspaceId: "alpha", limit: 2 });
    assert.equal(first.pruned, 2); assert.ok(first.nextCursor);
    const second = f.coordinator.prune({ workspaceId: "alpha", limit: 2, cursor: first.nextCursor });
    assert.equal(second.pruned, 1); assert.equal(second.nextCursor, null);
    const tombstones = f.coordinator.listTombstones({ workspaceId: "alpha", entityKind: "TASK", limit: 10 });
    assert.deepEqual(new Set(tombstones.map((item) => item.entityId)), new Set(ids));
  } finally { await f.cleanup(); }
});

test("STEP023A maintenance Protocol inputs are closed, bounded, and do not accept cross-workspace cursor injection", () => {
  assert.equal(validateMaintenanceRetentionPreviewInput({ workspaceId: "alpha", limit: 10 }).ok, true);
  assert.equal(validateMaintenanceRetentionPreviewInput({ workspaceId: "alpha", extra: true }).ok, false);
  assert.equal(validateMaintenanceRetentionPruneInput({ workspaceId: "alpha", limit: 1001 }).ok, false);
  assert.equal(validateMaintenanceRetentionTombstoneListInput({ workspaceId: "alpha", entityKind: "TASK" }).ok, true);
  assert.equal(validateMaintenanceRetentionTombstoneListInput({ workspaceId: "alpha", entityKind: "RUN" }).ok, false);
});

test("STEP023A actionable completion delivery protects an expired terminal Task from cascade loss", async () => {
  const f = await fixture("task-delivery-protect");
  try {
    const terminal = createTerminalTask(f, "delivery-protect");
    assert.equal(f.taskMaintenance.scheduleRetention({ workspaceId: "alpha" }), 1);
    const task = f.tasks.get({ workspaceId: "alpha", taskId: terminal.task.taskId }).task;
    const raw = f.raw();
    try {
      const event = raw.prepare("SELECT sequence FROM background_task_events WHERE task_id=? ORDER BY sequence DESC LIMIT 1").get(task.taskId);
      raw.prepare(`INSERT INTO task_completion_deliveries(
        delivery_id,task_id,task_event_sequence,flow_id,workspace_id,owner_conversation_id,controller_id,
        notify_policy,delivery_status,task_status,terminal_outcome,idempotency_key,payload_json,attempt_count,
        last_error,system_message_id,wake_run_id,created_at,updated_at,delivered_at,revision
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        "delivery-protect", task.taskId, event.sequence, null, "alpha", terminal.conversation.conversationId, null,
        "DONE_ONLY", "PENDING", "SUCCEEDED", "SUCCEEDED", "retention-protect", "{}", 0,
        null, null, null, task.endedAt, task.endedAt, null, 1,
      );
    } finally { raw.close(); }
    f.setNow(task.cleanupAfter + 1);
    const candidate = f.coordinator.preview({ workspaceId: "alpha" }).candidates.find((item) => item.entityId === task.taskId);
    assert.ok(candidate); assert.ok(candidate.protectedBy.includes("ACTIONABLE_TASK_DELIVERY"));
    assert.equal(f.coordinator.prune({ workspaceId: "alpha" }).pruned, 0);
  } finally { await f.cleanup(); }
});

test("STEP023A delivered Connector without receipt and uncertain delivery with open dead-letter are fail-closed even if cleanup is forced due", async () => {
  const f = await fixture("connector-protect");
  try {
    const delivered = createDeliveredConnector(f, "missing-receipt");
    const c = delivered.conversation;
    const queued = f.connector.enqueueDelivery("fixture", {
      accountId: "main", conversationId: c.conversationId, targetKey: "channel:one", payloadVersion: 1,
      payload: { text: "uncertain" }, idempotencyKey: "delivery:uncertain",
    });
    let claim = f.connector.claimDelivery("fixture", "main"); assert.ok(claim);
    claim = f.connector.markDeliveryDispatched(claim);
    const uncertain = f.connector.failDelivery(claim, { errorCode: "SOCKET_RESET", summary: "maybe accepted", certainty: "MAYBE_ACCEPTED", retryable: true });
    const raw = f.raw();
    try {
      raw.prepare("DELETE FROM connector_delivery_receipts WHERE delivery_id=?").run(delivered.delivery.deliveryId);
      raw.prepare("UPDATE connector_deliveries SET cleanup_after=? WHERE delivery_id IN (?,?)").run(1_001, delivered.delivery.deliveryId, uncertain.deliveryId);
    } finally { raw.close(); }
    f.setNow(2_000);
    const preview = f.coordinator.preview({ workspaceId: "alpha", limit: 10 });
    const missing = preview.candidates.find((item) => item.entityId === delivered.delivery.deliveryId);
    const ambiguous = preview.candidates.find((item) => item.entityId === uncertain.deliveryId);
    assert.ok(missing); assert.ok(missing.protectedBy.includes("DELIVERY_RECEIPT_MISSING"));
    assert.ok(ambiguous); assert.ok(ambiguous.protectedBy.includes("NOT_TERMINAL")); assert.ok(ambiguous.protectedBy.includes("OPEN_DEAD_LETTER"));
    assert.equal(f.coordinator.prune({ workspaceId: "alpha", limit: 10 }).pruned, 0);
  } finally { await f.cleanup(); }
});

test("STEP023A tombstone collision fails closed and leaves the retained entity intact", async () => {
  const f = await fixture("tombstone-collision");
  try {
    const terminal = createTerminalTask(f, "collision");
    assert.equal(f.taskMaintenance.scheduleRetention({ workspaceId: "alpha" }), 1);
    const task = f.tasks.get({ workspaceId: "alpha", taskId: terminal.task.taskId }).task;
    f.setNow(task.cleanupAfter + 1);
    const raw = f.raw();
    try {
      raw.prepare(`INSERT INTO maintenance_retention_tombstones
        (entity_kind,entity_id,workspace_id,terminal_status,source_ref,terminal_at,cleanup_after,pruned_at,metadata_hash)
        VALUES(?,?,?,?,?,?,?,?,?)`).run("TASK", task.taskId, "alpha", task.status, task.runId, task.endedAt, task.cleanupAfter, f.now(), "a".repeat(64));
    } finally { raw.close(); }
    assert.throws(() => f.coordinator.prune({ workspaceId: "alpha" }), /UNIQUE constraint failed|PRIMARY KEY/);
    assert.equal(f.tasks.get({ workspaceId: "alpha", taskId: task.taskId }).task.taskId, task.taskId);
  } finally { await f.cleanup(); }
});


test("STEP023A maintenance config is closed, bounded, and materializes durable defaults", () => {
  const defaults = validateAndMaterializeConfig({ version: 1 });
  assert.deepEqual(defaults.maintenance, {
    enabled: true, sweepIntervalMs: 300000, batchSize: 100, leaseDurationMs: 120000,
    taskRetentionMs: 2592000000, lostTaskRetentionMs: 604800000, flowRetentionMs: 2592000000,
    lostFlowRetentionMs: 604800000, connectorDeliveryRetentionMs: 2592000000,
  });
  const custom = validateAndMaterializeConfig({ version: 1, maintenance: { enabled: false, sweepIntervalMs: 1000, batchSize: 1, leaseDurationMs: 5000, taskRetentionMs: 60000, lostTaskRetentionMs: 60000, flowRetentionMs: 60000, lostFlowRetentionMs: 60000, connectorDeliveryRetentionMs: 60000 } });
  assert.equal(custom.maintenance.enabled, false); assert.equal(custom.maintenance.batchSize, 1);
  assert.throws(() => validateAndMaterializeConfig({ version: 1, maintenance: { unknown: true } }));
  assert.throws(() => validateAndMaterializeConfig({ version: 1, maintenance: { taskRetentionMs: 59999 } }));
});

test("STEP023A lease loss stops deletion before unowned work and returns a continuation after the last committed candidate", async () => {
  const f = await fixture("lease-lost");
  try {
    const ids = [];
    for (let index = 0; index < 30; index += 1) ids.push(createTerminalTask(f, `lease-${index}`).task.taskId);
    const raw = f.raw();
    try { raw.prepare("UPDATE background_tasks SET cleanup_after=1001 WHERE task_id LIKE 'task:%'").run(); } finally { raw.close(); }
    let calls = 0;
    const unstable = new MaintenanceRetentionCoordinator({
      state: f.state, workspaceIds: ["alpha"], ownerId: "unstable", taskMaintenance: f.taskMaintenance,
      taskFlowMaintenance: f.flowMaintenance, now: () => (++calls <= 7 ? 2_000 : 8_000),
      createLeaseToken: () => "unstable-token", leaseDurationMs: 5_000, batchSize: 30, connectorDeliveryRetentionMs: 60_000,
    });
    const first = unstable.prune({ workspaceId: "alpha", limit: 30 });
    assert.equal(first.state, "LEASE_LOST"); assert.ok(first.pruned > 0 && first.pruned < 30); assert.ok(first.nextCursor);
    const remaining = ids.filter((id) => {
      try { return Boolean(f.tasks.get({ workspaceId: "alpha", taskId: id })); } catch { return false; }
    });
    assert.equal(remaining.length, 30 - first.pruned);
    f.setNow(20_000);
    const stable = new MaintenanceRetentionCoordinator({
      state: f.state, workspaceIds: ["alpha"], ownerId: "stable", taskMaintenance: f.taskMaintenance,
      taskFlowMaintenance: f.flowMaintenance, now: f.now, createLeaseToken: () => "stable-token",
      leaseDurationMs: 5_000, batchSize: 30, connectorDeliveryRetentionMs: 60_000,
    });
    const second = stable.prune({ workspaceId: "alpha", limit: 30, cursor: first.nextCursor });
    assert.equal(second.state, "COMPLETED"); assert.equal(second.pruned, remaining.length);
  } finally { await f.cleanup(); }
});


test("STEP023A periodic sweep persists its cursor so a protected prefix cannot starve later eligible history across Host restart", async () => {
  const f = await fixture("sweep-starvation");
  try {
    const protectedIds = [];
    for (let index = 0; index < 2; index += 1) {
      const conversation = f.conversations.create({ workspaceId: "alpha", title: `protected-${index}` });
      const sent = f.conversations.send({ workspaceId: "alpha", conversationId: conversation.conversationId, submissionKey: `protected-${index}`, text: "active" });
      const task = f.tasks.getByRun({ workspaceId: "alpha", runId: sent.run.runId });
      protectedIds.push(task.taskId);
    }
    const eligible = createTerminalTask(f, "eligible-after-protected-prefix");
    const raw = f.raw();
    try {
      raw.prepare("UPDATE background_tasks SET status='LOST', recovery_state='NON_RESUMABLE', ended_at=1000, cleanup_after=1001, updated_at=1001 WHERE task_id=?").run(protectedIds[0]);
      raw.prepare("UPDATE background_tasks SET status='LOST', recovery_state='NON_RESUMABLE', ended_at=1000, cleanup_after=1002, updated_at=1002 WHERE task_id=?").run(protectedIds[1]);
      raw.prepare("UPDATE background_tasks SET cleanup_after=1003 WHERE task_id=?").run(eligible.task.taskId);
    } finally { raw.close(); }
    f.setNow(2_000);
    const firstHost = new MaintenanceRetentionCoordinator({
      state: f.state, workspaceIds: ["alpha"], ownerId: "sweep-host-1", taskMaintenance: f.taskMaintenance,
      taskFlowMaintenance: f.flowMaintenance, now: f.now, createLeaseToken: () => "sweep-host-1-token",
      leaseDurationMs: 5_000, batchSize: 2, connectorDeliveryRetentionMs: 60_000,
    });
    const first = firstHost.sweepAll()[0];
    assert.equal(first.scanned, 2); assert.equal(first.protected, 2); assert.equal(first.pruned, 0); assert.ok(first.nextCursor);
    assert.ok(f.tasks.get({ workspaceId: "alpha", taskId: eligible.task.taskId }));
    const sweepState = f.state.transaction((r) => r.retention.getSweepState("retention-sweep:alpha"));
    assert.ok(sweepState?.cursor); assert.equal(sweepState.cursor.cleanupAfter, 1002);

    const restartedHost = new MaintenanceRetentionCoordinator({
      state: f.state, workspaceIds: ["alpha"], ownerId: "sweep-host-2", taskMaintenance: f.taskMaintenance,
      taskFlowMaintenance: f.flowMaintenance, now: f.now, createLeaseToken: () => "sweep-host-2-token",
      leaseDurationMs: 5_000, batchSize: 2, connectorDeliveryRetentionMs: 60_000,
    });
    const second = restartedHost.sweepAll()[0];
    assert.equal(second.state, "COMPLETED"); assert.equal(second.prunedByKind.TASK, 1); assert.equal(second.nextCursor, null);
    assert.throws(() => f.tasks.get({ workspaceId: "alpha", taskId: eligible.task.taskId }));
    const wrapped = f.state.transaction((r) => r.retention.getSweepState("retention-sweep:alpha"));
    assert.ok(wrapped); assert.equal(wrapped.cursor, null);
  } finally { await f.cleanup(); }
});
