import test from "node:test";
import assert from "node:assert/strict";
import { ConnectorAdapterRegistry } from "../../packages/connectors/dist/index.js";
import {
  validateConnectorStatusInput,
  validateConnectorDoctorInput,
} from "../../packages/protocol/dist/index.js";
import { createDefaultOperationRegistry } from "../../services/agent-host/dist/transport/operation-registry.js";

const hostStatus = () => ({ product: "OpenRill", version: "0.24.0-step022c", profile: "test", pid: 1, instanceId: "instance", bind: "127.0.0.1", port: 1, startedAt: new Date(0).toISOString(), state: "READY", readiness: true });

function registry(hooks) {
  return createDefaultOperationRegistry(hostStatus, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, hooks);
}

function adapter(overrides = {}) {
  return {
    connectorId: "mattermost",
    normalizeIngress() { return { kind: "ignored", reason: "unused" }; },
    deliver() { return { kind: "suppressed", reason: "unused" }; },
    status() {
      return {
        connectorId: "mattermost", accountId: "main", state: "CONNECTED", healthy: true, reconnectAttempt: 0,
        lastConnectedAt: 1, lastEventAt: 2, lastIngressAt: 3, lastDeliveryAt: 4, lastErrorCode: null,
        baseUrl: "https://private.example", token: "private-token",
      };
    },
    doctor() {
      return {
        connectorId: "mattermost", accountId: "main", ok: true,
        checks: [{ name: "authentication", state: "PASSED", code: null, detail: "private-token" }],
        baseUrl: "https://private.example",
      };
    },
    ...overrides,
  };
}

test("STEP022C Connector registry reconstructs closed public status and doctor outputs", async () => {
  const controller = new AbortController();
  const adapters = new ConnectorAdapterRegistry({ service: {} });
  adapters.register("openrill.connector.mattermost", adapter(), controller.signal);
  assert.deepEqual(adapters.status("mattermost"), {
    connectorId: "mattermost", accountId: "main", state: "CONNECTED", healthy: true, reconnectAttempt: 0,
    lastConnectedAt: 1, lastEventAt: 2, lastIngressAt: 3, lastDeliveryAt: 4, lastErrorCode: null,
  });
  assert.deepEqual(await adapters.doctor("mattermost"), {
    connectorId: "mattermost", accountId: "main", ok: true,
    checks: [{ name: "authentication", state: "PASSED", code: null }],
  });
  assert.equal(JSON.stringify(adapters.status("mattermost")).includes("private"), false);
  assert.equal(JSON.stringify(await adapters.doctor("mattermost")).includes("private"), false);
  controller.abort();
});

test("STEP022C Connector registry rejects forged observability identity and inconsistent doctor summary", async () => {
  const first = new ConnectorAdapterRegistry({ service: {} });
  first.register("extension.one", adapter({ status() { return { ...adapter().status(), connectorId: "other" }; } }), new AbortController().signal);
  assert.throws(() => first.status("mattermost"), (error) => error.code === "CONNECTOR_INVALID_ARGUMENT");

  const second = new ConnectorAdapterRegistry({ service: {} });
  second.register("extension.two", adapter({ doctor() { return { connectorId: "mattermost", accountId: "main", ok: true, checks: [{ name: "websocket", state: "FAILED", code: "FAILED" }] }; } }), new AbortController().signal);
  await assert.rejects(() => second.doctor("mattermost"), (error) => error.code === "CONNECTOR_INVALID_ARGUMENT");
});

test("STEP022C Connector status and doctor inputs are exact identity contracts", () => {
  assert.deepEqual(validateConnectorStatusInput({ connectorId: "mattermost" }), { ok: true, value: { connectorId: "mattermost" } });
  assert.deepEqual(validateConnectorDoctorInput({ connectorId: "mattermost" }), { ok: true, value: { connectorId: "mattermost" } });
  assert.equal(validateConnectorStatusInput({}).ok, false);
  assert.equal(validateConnectorDoctorInput({ connectorId: "mattermost", extra: true }).ok, false);
  assert.equal(validateConnectorStatusInput({ connectorId: "bad id" }).ok, false);
});

test("STEP022C Local Protocol exposes closed connector.status and connector.doctor operations", async () => {
  const calls = [];
  const hooks = {
    listAccounts: () => ({ items: [] }), listIngress: () => ({ items: [] }), listDeliveries: () => ({ items: [] }), listDeadLetters: () => ({ items: [] }),
    status(input) { calls.push(["status", input]); return { connectorId: input.connectorId, accountId: "main", state: "CONNECTED", healthy: true, reconnectAttempt: 0, lastConnectedAt: 1, lastEventAt: 2, lastIngressAt: 3, lastDeliveryAt: 4, lastErrorCode: null }; },
    doctor(input) { calls.push(["doctor", input]); return { connectorId: input.connectorId, accountId: "main", ok: true, checks: [{ name: "authentication", state: "PASSED", code: null }] }; },
  };
  const operations = registry(hooks);
  assert.deepEqual(operations.capabilities().filter((item) => item.name.startsWith("connector.")), [
    { name: "connector.account.list", permission: "connector.read" },
    { name: "connector.deadLetter.list", permission: "connector.read" },
    { name: "connector.delivery.list", permission: "connector.read" },
    { name: "connector.doctor", permission: "connector.read" },
    { name: "connector.ingress.list", permission: "connector.read" },
    { name: "connector.status", permission: "connector.read" },
  ]);
  assert.equal((await operations.invoke("status", "connector.status", { connectorId: "mattermost" })).ok, true);
  assert.equal((await operations.invoke("doctor", "connector.doctor", { connectorId: "mattermost" })).ok, true);
  assert.equal((await operations.invoke("bad", "connector.status", {})).error.code, "INVALID_INPUT");
  assert.deepEqual(calls, [["status", { connectorId: "mattermost" }], ["doctor", { connectorId: "mattermost" }]]);
});
