import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import {
  applyStateMigrations,
  loadStateMigrations,
  openOpenRillStateDatabase,
} from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import {
  ConnectorAdapterRegistry,
  ConnectorDeliveryError,
  ConnectorError,
  ConnectorIngressError,
  ConnectorRuntimeService,
} from "../../packages/connectors/dist/index.js";

function ids(prefix = "id") {
  let value = 0;
  return () => `${prefix}-${++value}`;
}

async function fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "openrill-step022b-"));
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") };
  const paths = resolveProfilePaths({ profile: "connector", env });
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  let now = 1_000;
  const nowFn = () => now;
  const advance = (delta) => { now += delta; return now; };
  const createId = ids("step022b");
  const conversations = new ConversationService({ state, workspaceIds: ["alpha"], now: nowFn, createId });
  const service = new ConnectorRuntimeService({
    state,
    conversations,
    workspaceIds: ["alpha"],
    now: nowFn,
    createId,
    ingressLeaseMs: options.ingressLeaseMs ?? 100,
    deliveryLeaseMs: options.deliveryLeaseMs ?? 100,
    maxDeliveryAttempts: options.maxDeliveryAttempts ?? 2,
  });
  service.registerAccount({ connectorId: "fixture", accountId: "main", workspaceId: "alpha", extensionId: "fixture.extension" });
  return {
    root, state, conversations, service, now: nowFn, advance,
    cleanup: async () => { if (state.isOpen()) state.close(); await rm(root, { recursive: true, force: true }); },
  };
}

function ingressInput(eventId = "event-1", payload = { text: "hello" }) {
  return { accountId: "main", externalEventId: eventId, laneKey: "channel:one", payloadVersion: 1, payload };
}

function adoptRoute() {
  return { workspaceId: "alpha", externalScopeId: "team:one", externalConversationId: "channel:one", externalThreadId: "thread:root", title: "Fixture channel" };
}

async function adoptedConversation(f, eventId = "event-1") {
  f.service.receiveIngress("fixture", ingressInput(eventId));
  const claim = f.service.claimIngress("fixture", "main");
  assert.ok(claim);
  return f.service.adoptIngress(claim, adoptRoute(), `message:${eventId}`);
}

test("STEP022B schema 25 adds durable Connector account, binding, ingress, delivery, attempt, receipt, and dead-letter ledgers", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  try {
    const migrations = await loadStateMigrations();
    applyStateMigrations(database, migrations.slice(0, 24), { profile: "step022b-upgrade", now: () => 10 });
    assert.equal(database.prepare("PRAGMA user_version").get().user_version, 24);
    applyStateMigrations(database, migrations.slice(0, 25), { profile: "step022b-upgrade", now: () => 20 });
    assert.equal(database.prepare("PRAGMA user_version").get().user_version, 25);
    const tables = database.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'connector_%' ORDER BY name").all().map((row) => row.name);
    assert.deepEqual(tables, [
      "connector_accounts",
      "connector_conversation_bindings",
      "connector_dead_letters",
      "connector_deliveries",
      "connector_delivery_attempts",
      "connector_delivery_receipts",
      "connector_ingress_events",
    ]);
    applyStateMigrations(database, migrations, { profile: "step022b-upgrade", now: () => 30 });
    assert.ok(database.prepare("PRAGMA user_version").get().user_version >= 25);
  } finally {
    database.close();
  }
});

test("STEP022B ingress admission is durable before ACK, exact replay is idempotent, and conflicting reuse fails closed", async () => {
  const f = await fixture();
  try {
    const first = f.service.receiveIngress("fixture", ingressInput());
    assert.equal(first.acknowledge, true);
    assert.equal(first.replayed, false);
    assert.equal(first.ingress.status, "RECEIVED");
    const persisted = f.state.transaction((repositories) => repositories.connectors.getIngress(first.ingress.ingressId));
    assert.equal(persisted.externalEventId, "event-1");
    const replay = f.service.receiveIngress("fixture", ingressInput());
    assert.equal(replay.replayed, true);
    assert.equal(replay.ingress.ingressId, first.ingress.ingressId);
    assert.throws(
      () => f.service.receiveIngress("fixture", ingressInput("event-1", { text: "changed" })),
      (error) => error instanceof ConnectorError && error.code === "CONNECTOR_INGRESS_CONFLICT",
    );
  } finally {
    await f.cleanup();
  }
});

test("STEP022B adoption atomically creates one binding, Conversation, Message, Run, and replays the same external event without duplicate admission", async () => {
  const f = await fixture();
  try {
    const admitted = f.service.receiveIngress("fixture", ingressInput());
    const claim = f.service.claimIngress("fixture", "main");
    assert.ok(claim);
    const adopted = f.service.adoptIngress(claim, adoptRoute(), "hello from connector");
    assert.equal(adopted.replayed, false);
    const replay = f.service.adoptIngress(claim, adoptRoute(), "hello from connector");
    assert.equal(replay.replayed, true);
    assert.equal(replay.messageId, adopted.messageId);
    assert.equal(replay.runId, adopted.runId);
    const view = f.conversations.get({ workspaceId: "alpha", conversationId: adopted.conversationId });
    assert.equal(view.messages.length, 1);
    assert.equal(view.runs.length, 1);
    const counts = f.state.transaction((repositories) => ({
      bindings: repositories.connectors.getBindingByRoute({ connectorId: "fixture", accountId: "main", externalScopeId: "team:one", externalConversationId: "channel:one", externalThreadId: "thread:root" }) ? 1 : 0,
      ingress: repositories.connectors.getIngress(admitted.ingress.ingressId),
    }));
    assert.equal(counts.bindings, 1);
    assert.equal(counts.ingress.status, "ADOPTED");
  } finally {
    await f.cleanup();
  }
});

test("STEP022B expired ingress claims are safely reclaimed because submission identity remains durable", async () => {
  const f = await fixture();
  try {
    f.service.receiveIngress("fixture", ingressInput());
    const first = f.service.claimIngress("fixture", "main");
    assert.ok(first);
    f.advance(101);
    assert.equal(f.service.recoverExpiredIngressClaims(), 1);
    const second = f.service.claimIngress("fixture", "main");
    assert.ok(second);
    assert.notEqual(second.claimToken, first.claimToken);
    const adopted = f.service.adoptIngress(second, adoptRoute(), "recovered");
    assert.ok(adopted.runId);
    assert.throws(
      () => f.service.ignoreIngress(first, "stale"),
      (error) => error instanceof ConnectorError && ["CONNECTOR_INGRESS_STATE_INVALID", "CONNECTOR_INGRESS_CLAIM_LOST"].includes(error.code),
    );
  } finally {
    await f.cleanup();
  }
});

test("STEP022B accepted outbound delivery persists attempt and provider receipt atomically and replays the same receipt", async () => {
  const f = await fixture();
  try {
    const adopted = await adoptedConversation(f);
    const queued = f.service.enqueueDelivery("fixture", {
      accountId: "main", conversationId: adopted.conversationId, runId: adopted.runId,
      targetKey: "channel:one", threadKey: "thread:root", payloadVersion: 1,
      payload: { text: "reply" }, idempotencyKey: "reply:event-1",
    });
    assert.equal(queued.replayed, false);
    const queueReplay = f.service.enqueueDelivery("fixture", {
      accountId: "main", conversationId: adopted.conversationId, runId: adopted.runId,
      targetKey: "channel:one", threadKey: "thread:root", payloadVersion: 1,
      payload: { text: "reply" }, idempotencyKey: "reply:event-1",
    });
    assert.equal(queueReplay.replayed, true);
    const claim = f.service.claimDelivery("fixture", "main");
    assert.ok(claim);
    const dispatched = f.service.markDeliveryDispatched(claim);
    const completed = f.service.completeDeliveryAccepted(dispatched, {
      providerMessageId: "provider-post-1",
      providerConversationId: "channel:one",
      providerThreadId: "thread:root",
      receipt: { postId: "provider-post-1", accepted: true },
    });
    assert.equal(completed.delivery.status, "DELIVERED");
    assert.equal(completed.replayed, false);
    const replay = f.service.completeDeliveryAccepted(dispatched, {
      providerMessageId: "provider-post-1",
      providerConversationId: "channel:one",
      providerThreadId: "thread:root",
      receipt: { postId: "provider-post-1", accepted: true },
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.receipt.receiptId, completed.receipt.receiptId);
  } finally {
    await f.cleanup();
  }
});

test("STEP022B definitive rejection creates a new bounded attempt while maybe-accepted delivery is quarantined without automatic replay", async () => {
  const f = await fixture({ maxDeliveryAttempts: 2 });
  try {
    const adopted = await adoptedConversation(f);
    f.service.enqueueDelivery("fixture", {
      accountId: "main", conversationId: adopted.conversationId,
      targetKey: "channel:one", payloadVersion: 1, payload: { text: "retry" }, idempotencyKey: "retry-1",
    });
    let claim = f.service.claimDelivery("fixture", "main");
    assert.ok(claim);
    claim = f.service.markDeliveryDispatched(claim);
    const retry = f.service.failDelivery(claim, { errorCode: "RATE_LIMIT", summary: "provider rejected", certainty: "REJECTED", retryable: true, retryAfterMs: 0 });
    assert.equal(retry.status, "PENDING");
    const second = f.service.claimDelivery("fixture", "main");
    assert.ok(second);
    assert.equal(second.attempt.attemptNumber, 2);
    const dispatched = f.service.markDeliveryDispatched(second);
    const dead = f.service.failDelivery(dispatched, { errorCode: "RATE_LIMIT", summary: "still rejected", certainty: "REJECTED", retryable: true, retryAfterMs: 0 });
    assert.equal(dead.status, "DEAD");

    f.service.enqueueDelivery("fixture", {
      accountId: "main", conversationId: adopted.conversationId,
      targetKey: "channel:one", payloadVersion: 1, payload: { text: "uncertain" }, idempotencyKey: "uncertain-1",
    });
    let uncertainClaim = f.service.claimDelivery("fixture", "main");
    assert.ok(uncertainClaim);
    uncertainClaim = f.service.markDeliveryDispatched(uncertainClaim);
    const uncertain = f.service.failDelivery(uncertainClaim, { errorCode: "SOCKET_RESET", summary: "provider may have accepted", certainty: "MAYBE_ACCEPTED", retryable: true });
    assert.equal(uncertain.status, "UNCERTAIN");
    assert.equal(f.service.claimDelivery("fixture", "main"), null);
    const letters = f.service.listDeadLetters({ connectorId: "fixture", accountId: "main" });
    assert.deepEqual(letters.map((item) => item.subjectId).sort(), [dead.deliveryId, uncertain.deliveryId].sort());
  } finally {
    await f.cleanup();
  }
});

test("STEP022B restart recovery safely returns pre-dispatch claims to pending but isolates post-dispatch claims as uncertain", async () => {
  const f = await fixture();
  try {
    const adopted = await adoptedConversation(f);
    for (const key of ["before", "after"]) {
      f.service.enqueueDelivery("fixture", {
        accountId: "main", conversationId: adopted.conversationId,
        targetKey: "channel:one", payloadVersion: 1, payload: { text: key }, idempotencyKey: key,
      });
    }
    const before = f.service.claimDelivery("fixture", "main");
    assert.ok(before);
    f.advance(101);
    assert.deepEqual(f.service.recoverExpiredDeliveryClaims(), { safe: 1, uncertain: 0 });
    const reclaimed = f.service.claimDelivery("fixture", "main");
    assert.ok(reclaimed);
    assert.equal(reclaimed.delivery.deliveryId, before.delivery.deliveryId);
    f.service.completeDeliverySuppressed(f.service.markDeliveryDispatched(reclaimed), "fixture cleanup");

    const after = f.service.claimDelivery("fixture", "main");
    assert.ok(after);
    f.service.markDeliveryDispatched(after);
    f.advance(101);
    assert.deepEqual(f.service.recoverExpiredDeliveryClaims(), { safe: 0, uncertain: 1 });
    const persisted = f.service.listDeliveries({ status: "UNCERTAIN" });
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].deliveryId, after.delivery.deliveryId);
  } finally {
    await f.cleanup();
  }
});

test("STEP022B adapter registry owns normalized ingress and default post-dispatch exceptions become uncertain", async () => {
  const f = await fixture();
  const controller = new AbortController();
  try {
    let mode = "message";
    const adapter = {
      connectorId: "adapter",
      normalizeIngress: async (claim) => {
        if (mode === "retry") throw new ConnectorIngressError("TEMPORARY", "temporary", true);
        return { kind: "message", route: { ...adoptRoute(), externalConversationId: claim.ingress.laneKey }, text: "adapter message" };
      },
      deliver: async () => { throw new Error("socket closed after request"); },
    };
    const service = new ConnectorRuntimeService({
      state: f.state, conversations: f.conversations, workspaceIds: ["alpha"], now: f.now,
      createId: ids("adapter"), ingressLeaseMs: 100, deliveryLeaseMs: 100,
    });
    const registry = new ConnectorAdapterRegistry({ service, now: f.now });
    const port = registry.register("adapter.extension", adapter, controller.signal);
    port.registerAccount({ accountId: "main", workspaceId: "alpha" });
    port.receiveIngress({ accountId: "main", externalEventId: "adapter-event", laneKey: "channel:adapter", payloadVersion: 1, payload: { text: "hello" } });
    assert.deepEqual(await port.drainIngress({ accountId: "main" }), { processed: 1, adopted: 1, ignored: 0, retried: 0, dead: 0 });
    const adopted = service.listIngress({ connectorId: "adapter", status: "ADOPTED" })[0];
    port.enqueueDelivery({ accountId: "main", conversationId: adopted.bindingId ? f.state.transaction((r) => r.connectors.getBinding(adopted.bindingId).conversationId) : "", targetKey: "channel:adapter", payloadVersion: 1, payload: { text: "reply" }, idempotencyKey: "adapter-reply" });
    assert.deepEqual(await port.drainDeliveries({ accountId: "main" }), { processed: 1, delivered: 0, suppressed: 0, retried: 0, uncertain: 1, dead: 0 });
    assert.equal(service.listDeliveries({ connectorId: "adapter" })[0].status, "UNCERTAIN");
    controller.abort();
    assert.throws(() => port.receiveIngress({ accountId: "main", externalEventId: "after-abort", laneKey: "x", payloadVersion: 1, payload: {} }), (error) => error instanceof ConnectorError && error.code === "CONNECTOR_NOT_REGISTERED");
  } finally {
    controller.abort();
    await f.cleanup();
  }
});

test("STEP022B adapter can explicitly classify a pre-send failure for safe retry", async () => {
  const f = await fixture();
  const controller = new AbortController();
  try {
    const service = new ConnectorRuntimeService({ state: f.state, conversations: f.conversations, workspaceIds: ["alpha"], now: f.now, createId: ids("safe"), maxDeliveryAttempts: 2 });
    let sends = 0;
    const registry = new ConnectorAdapterRegistry({ service, now: f.now });
    const port = registry.register("safe.extension", {
      connectorId: "safe",
      normalizeIngress: () => ({ kind: "ignored", reason: "unused" }),
      deliver: () => {
        sends += 1;
        if (sends === 1) throw new ConnectorDeliveryError("DNS_FAILURE", "request was not sent", "NOT_SENT", true);
        return { kind: "accepted", receipt: { providerMessageId: "safe-post", receipt: { ok: true } } };
      },
    }, controller.signal);
    port.registerAccount({ accountId: "main", workspaceId: "alpha" });
    const conversation = f.conversations.create({ workspaceId: "alpha" });
    port.enqueueDelivery({ accountId: "main", conversationId: conversation.conversationId, targetKey: "user:one", payloadVersion: 1, payload: { text: "safe" }, idempotencyKey: "safe-delivery" });
    assert.deepEqual(await port.drainDeliveries({ accountId: "main", limit: 1 }), { processed: 1, delivered: 0, suppressed: 0, retried: 1, uncertain: 0, dead: 0 });
    f.advance(1_000);
    assert.deepEqual(await port.drainDeliveries({ accountId: "main", limit: 1 }), { processed: 1, delivered: 1, suppressed: 0, retried: 0, uncertain: 0, dead: 0 });
    assert.equal(service.listDeliveries({ connectorId: "safe" })[0].status, "DELIVERED");
  } finally {
    controller.abort();
    await f.cleanup();
  }
});

test("STEP022B Connector account identity cannot be rebound to a different Extension owner", async () => {
  const f = await fixture();
  try {
    const replay = f.service.registerAccount({ connectorId: "fixture", accountId: "main", workspaceId: "alpha", extensionId: "fixture.extension" });
    assert.equal(replay.revision, 2);
    assert.throws(
      () => f.service.registerAccount({ connectorId: "fixture", accountId: "main", workspaceId: "alpha", extensionId: "takeover.extension" }),
      (error) => error instanceof ConnectorError && error.code === "CONNECTOR_BINDING_CONFLICT",
    );
    const account = f.service.listAccounts("fixture")[0];
    assert.equal(account.extensionId, "fixture.extension");
    assert.equal(account.revision, 2);
  } finally {
    await f.cleanup();
  }
});

test("STEP022B registered Connector adapter behavior is snapshotted against later object mutation", async () => {
  const f = await fixture();
  const controller = new AbortController();
  try {
    const conversation = f.conversations.create({ workspaceId: "alpha" });
    const adapter = {
      connectorId: "snapshot",
      normalizeIngress() { return { kind: "ignored", reason: "snapshot" }; },
      deliver() { return { kind: "accepted", receipt: { providerMessageId: "snapshot-post", receipt: { ok: true } } }; },
    };
    const service = new ConnectorRuntimeService({ state: f.state, conversations: f.conversations, workspaceIds: ["alpha"], now: f.now, createId: ids("snapshot") });
    const registry = new ConnectorAdapterRegistry({ service, now: f.now });
    const port = registry.register("snapshot.extension", adapter, controller.signal);
    port.registerAccount({ accountId: "main", workspaceId: "alpha" });
    adapter.connectorId = "mutated";
    adapter.deliver = () => { throw new Error("mutated behavior must not run"); };
    port.enqueueDelivery({ accountId: "main", conversationId: conversation.conversationId, targetKey: "user:one", payloadVersion: 1, payload: { text: "snapshot" }, idempotencyKey: "snapshot-delivery" });
    assert.deepEqual(await port.drainDeliveries({ accountId: "main" }), { processed: 1, delivered: 1, suppressed: 0, retried: 0, uncertain: 0, dead: 0 });
    assert.equal(registry.list()[0].adapter.connectorId, "snapshot");
  } finally {
    controller.abort();
    await f.cleanup();
  }
});

test("STEP022B adopted ingress replay rejects changed route or text instead of silently reusing prior admission", async () => {
  const f = await fixture();
  try {
    f.service.receiveIngress("fixture", ingressInput());
    const claim = f.service.claimIngress("fixture", "main");
    assert.ok(claim);
    f.service.adoptIngress(claim, adoptRoute(), "original text");
    assert.throws(
      () => f.service.adoptIngress(claim, { ...adoptRoute(), externalThreadId: "thread:changed" }, "original text"),
      (error) => error instanceof ConnectorError && error.code === "CONNECTOR_INGRESS_CONFLICT",
    );
    assert.throws(
      () => f.service.adoptIngress(claim, adoptRoute(), "changed text"),
      (error) => error instanceof ConnectorError && error.code === "CONNECTOR_INGRESS_CONFLICT",
    );
  } finally {
    await f.cleanup();
  }
});

test("STEP022B accepted receipt replay compares provider conversation and thread identities", async () => {
  const f = await fixture();
  try {
    const adopted = await adoptedConversation(f);
    const queued = f.service.enqueueDelivery("fixture", {
      accountId: "main", conversationId: adopted.conversationId, targetKey: "channel:one", payloadVersion: 1,
      payload: { text: "receipt" }, idempotencyKey: "receipt-identities",
    });
    const claim = f.service.claimDelivery("fixture", "main");
    assert.ok(claim);
    const dispatched = f.service.markDeliveryDispatched(claim);
    f.service.completeDeliveryAccepted(dispatched, {
      providerMessageId: "post-one", providerConversationId: "channel:one", providerThreadId: "thread:one", receipt: { ok: true },
    });
    assert.throws(
      () => f.service.completeDeliveryAccepted(dispatched, {
        providerMessageId: "post-one", providerConversationId: "channel:one", providerThreadId: "thread:two", receipt: { ok: true },
      }),
      (error) => error instanceof ConnectorError && error.code === "CONNECTOR_RECEIPT_CONFLICT",
    );
    assert.equal(f.service.listDeliveries({ connectorId: "fixture" })[0].deliveryId, queued.delivery.deliveryId);
  } finally {
    await f.cleanup();
  }
});

test("STEP022B Connector ledger service rejects invalid connector and account filters before repository access", async () => {
  const f = await fixture();
  try {
    for (const invoke of [
      () => f.service.listIngress({ connectorId: "../escape" }),
      () => f.service.listDeliveries({ accountId: "bad account" }),
      () => f.service.listDeadLetters({ connectorId: "" }),
    ]) {
      assert.throws(invoke, (error) => error instanceof ConnectorError && error.code === "CONNECTOR_INVALID_ARGUMENT");
    }
  } finally {
    await f.cleanup();
  }
});

test("STEP022B Connector registry rejects an already-aborted activation signal without leaving a zombie registration", async () => {
  const f = await fixture();
  const controller = new AbortController();
  controller.abort();
  try {
    const service = new ConnectorRuntimeService({ state: f.state, conversations: f.conversations, workspaceIds: ["alpha"], now: f.now, createId: ids("aborted") });
    const registry = new ConnectorAdapterRegistry({ service, now: f.now });
    assert.throws(
      () => registry.register("aborted.extension", {
        connectorId: "aborted",
        normalizeIngress() { return { kind: "ignored", reason: "none" }; },
        deliver() { return { kind: "suppressed", reason: "none" }; },
      }, controller.signal),
      (error) => error instanceof ConnectorError && error.code === "CONNECTOR_NOT_REGISTERED",
    );
    assert.equal(registry.list().length, 0);
  } finally {
    await f.cleanup();
  }
});
