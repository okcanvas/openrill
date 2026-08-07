import test from "node:test";
import assert from "node:assert/strict";
import {
  validateConnectorAccountListInput,
  validateConnectorIngressListInput,
  validateConnectorDeliveryListInput,
  validateConnectorDeadLetterListInput,
} from "../../packages/protocol/dist/index.js";
import { createDefaultOperationRegistry } from "../../services/agent-host/dist/transport/operation-registry.js";

const status = () => ({ product: "OpenRill", version: "0.23.0-step022b", profile: "test", pid: 1, instanceId: "instance", bind: "127.0.0.1", port: 1, startedAt: new Date(0).toISOString(), state: "READY", readiness: true });

function registry(hooks) {
  return createDefaultOperationRegistry(status, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, hooks);
}

test("STEP022B Connector protocol list inputs are closed, bounded, and status-specific", () => {
  assert.deepEqual(validateConnectorAccountListInput({}), { ok: true, value: {} });
  assert.equal(validateConnectorAccountListInput({ connectorId: "mattermost" }).ok, true);
  assert.equal(validateConnectorAccountListInput({ accountId: "main" }).ok, false);
  assert.equal(validateConnectorIngressListInput({ connectorId: "mattermost", accountId: "main", status: "ADOPTED", limit: 100 }).ok, true);
  assert.equal(validateConnectorIngressListInput({ status: "DELIVERED" }).ok, false);
  assert.equal(validateConnectorDeliveryListInput({ status: "UNCERTAIN", limit: 1000 }).ok, true);
  assert.equal(validateConnectorDeliveryListInput({ status: "CLAIMED" }).ok, false);
  assert.equal(validateConnectorDeadLetterListInput({ status: "OPEN" }).ok, true);
  assert.equal(validateConnectorDeadLetterListInput({ status: "DEAD", extra: true }).ok, false);
  assert.equal(validateConnectorIngressListInput({ limit: 1001 }).ok, false);
});

test("STEP022B Local Protocol retains its four read-only Connector ledger operations as later operations are added", async () => {
  const calls = [];
  const hooks = {
    listAccounts: (input) => { calls.push(["accounts", input]); return { items: [{ connectorId: "fixture", accountId: "main" }] }; },
    listIngress: (input) => { calls.push(["ingress", input]); return { items: [{ ingressId: "ingress-1", status: "ADOPTED" }] }; },
    listDeliveries: (input) => { calls.push(["deliveries", input]); return { items: [{ deliveryId: "delivery-1", status: "DELIVERED" }] }; },
    listDeadLetters: (input) => { calls.push(["dead", input]); return { items: [{ deadLetterId: "dead-1", status: "OPEN" }] }; },
  };
  const operations = registry(hooks);
  const connectorCapabilities = operations.capabilities().filter((item) => item.name.startsWith("connector."));
  for (const capability of [
    { name: "connector.account.list", permission: "connector.read" },
    { name: "connector.deadLetter.list", permission: "connector.read" },
    { name: "connector.delivery.list", permission: "connector.read" },
    { name: "connector.ingress.list", permission: "connector.read" },
  ]) assert.ok(connectorCapabilities.some((item) => item.name === capability.name && item.permission === capability.permission));
  assert.equal((await operations.invoke("1", "connector.account.list", { connectorId: "fixture" })).ok, true);
  assert.equal((await operations.invoke("2", "connector.ingress.list", { status: "ADOPTED" })).ok, true);
  assert.equal((await operations.invoke("3", "connector.delivery.list", { status: "DELIVERED" })).ok, true);
  assert.equal((await operations.invoke("4", "connector.deadLetter.list", { status: "OPEN" })).ok, true);
  assert.equal((await operations.invoke("5", "connector.delivery.list", { status: "CLAIMED" })).error.code, "INVALID_INPUT");
  assert.deepEqual(calls, [
    ["accounts", { connectorId: "fixture" }],
    ["ingress", { status: "ADOPTED" }],
    ["deliveries", { status: "DELIVERED" }],
    ["dead", { status: "OPEN" }],
  ]);
});
