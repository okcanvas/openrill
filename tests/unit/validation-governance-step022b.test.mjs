import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = async (path) => await readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const STEP = "STEP022B_DURABLE_CONNECTOR_RUNTIME_INGRESS_DELIVERY_AND_BINDING";
const VERSION = "0.23.0-step022b";
const BASELINE = "STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE";
const BASELINE_SHA = "4f763933b37235b2ed7f87f1c1922fc934fdf80bb4135b8e37b12b274f1a1ed5";

test("STEP022B preserves its immutable candidate identity and schema-25 evidence while the current STEP owns root source identity", async () => {
  const contract = JSON.parse(await read("config/step022b-live-marker-contract.json"));
  const packageScript = await read("scripts/package_step022b.py");
  const baseline = JSON.parse(await read("config/current-accepted-baseline.json"));
  assert.equal(contract.step, STEP); assert.equal(contract.version, VERSION); assert.match(packageScript, new RegExp(STEP)); assert.match(packageScript, /0\.23\.0-step022b/);
  assert.equal(baseline.step, BASELINE); assert.equal(baseline.version, "0.21.3-step021br2");
  assert.equal(baseline.checks, "82/82"); assert.equal(baseline.stateSchema, 24); assert.equal(baseline.zipSha256, BASELINE_SHA);
  const migrationsSource = await read("packages/state/src/migrations.ts");
  const currentSchema = Number(/OPENRILL_STATE_SCHEMA_VERSION = (\d+)/.exec(migrationsSource)?.[1] ?? -1);
  assert.ok(currentSchema >= 25); assert.match(await read("packages/state/migrations/025_durable_connector_ingress_delivery_binding.sql"), /CREATE TABLE connector_accounts/);
});

test("STEP022B schema 25 owns seven Connector ledgers with canonical Run references", async () => {
  const migration = await read("packages/state/migrations/025_durable_connector_ingress_delivery_binding.sql");
  for (const table of ["connector_accounts","connector_conversation_bindings","connector_ingress_events","connector_deliveries","connector_delivery_attempts","connector_delivery_receipts","connector_dead_letters"]) assert.match(migration, new RegExp(`CREATE TABLE ${table}`));
  assert.match(migration, /REFERENCES agent_runs/); assert.doesNotMatch(migration, /REFERENCES runs\b|REFERENCES workspaces\b/);
  assert.match(await read("packages/state/src/repository.ts"), /this\.connectors = new StateConnectorRepository\(database\)/);
});

test("STEP022B ingress and binding contracts are durable atomic and replay-closed", async () => {
  const service = await read("packages/connectors/src/service.ts");
  const conversations = await read("packages/conversations/src/service.ts");
  assert.match(service, /receiveIngress/); assert.match(service, /acknowledge: true/);
  assert.match(service, /adoptIngress/); assert.match(service, /createInTransaction/); assert.match(service, /sendInTransaction/);
  assert.match(service, /CONNECTOR_INGRESS_CONFLICT/); assert.match(conversations, /createInTransaction/);
});

test("STEP022B delivery separates logical identity attempts receipts and uncertain outcomes", async () => {
  const service = await read("packages/connectors/src/service.ts");
  const migration = await read("packages/state/migrations/025_durable_connector_ingress_delivery_binding.sql");
  assert.match(service, /markDeliveryDispatched/); assert.match(service, /completeDeliveryAccepted/); assert.match(service, /MAYBE_ACCEPTED/);
  assert.match(service, /uncertain \? "UNCERTAIN"/); assert.match(service, /providerConversationId/); assert.match(service, /providerThreadId/);
  assert.match(migration, /UNIQUE \(delivery_id, attempt_number\)/); assert.match(migration, /UNIQUE \(delivery_id, provider_message_id\)/);
});

test("STEP022B Extension registration is Host-owned exact lifecycle-scoped and immutable", async () => {
  const runtime = await read("packages/connectors/src/runtime.ts");
  const extension = await read("services/agent-host/src/extension-runtime.ts");
  assert.match(runtime, /signal\.aborted/); assert.match(runtime, /Object\.freeze/); assert.match(runtime, /bind\(adapter\)/);
  assert.match(extension, /registerConnector/); assert.match(extension, /connectorRegistry/); assert.match(extension, /connector capability must register an adapter with the Host/);
  assert.match(extension, /extension claimed undeclared capability/);
});

test("STEP022B Local Protocol exposes four closed redacted read-only Connector operations", async () => {
  const validation = await read("packages/protocol/src/validation.ts");
  const registry = await read("services/agent-host/src/transport/operation-registry.ts");
  const lifecycle = await read("services/agent-host/src/lifecycle.ts");
  const server = await read("services/agent-host/src/transport/protocol-server.ts");
  for (const op of ["connector.account.list","connector.ingress.list","connector.delivery.list","connector.deadLetter.list"]) assert.match(registry, new RegExp(op.replace(".", "\\.")));
  for (const validator of ["validateConnectorAccountListInput","validateConnectorIngressListInput","validateConnectorDeliveryListInput","validateConnectorDeadLetterListInput"]) assert.match(validation, new RegExp(validator));
  assert.match(lifecycle, /lastErrorSummary: _lastErrorSummary/); assert.match(lifecycle, /summary: _summary/);
  assert.match(server, /connector\.recovered/);
});

test("STEP022B focused tests cover all durable Connector and Host boundaries", async () => {
  const files = ["connector-runtime-step022b.test.mjs","extension-connector-step022b.test.mjs","connector-protocol-step022b.test.mjs","connector-host-step022b.test.mjs"];
  let count = 0; let combined = "";
  for (const file of files) { const body = await read(`tests/unit/${file}`); combined += body; count += [...body.matchAll(/^test\(/gm)].length; }
  assert.equal(count, 21);
  for (const phrase of ["durable before ACK","atomically creates one binding","maybe-accepted delivery is quarantined","already-aborted activation signal","retains its four read-only Connector ledger operations","restarts duplicate-free"]) assert.match(combined, new RegExp(phrase));
});

test("STEP022B records OpenClaw answer-key boundaries and OR-ISSUE-322 through 340 independently", async () => {
  const audit = await read("docs/research/STEP022B_OPENCLAW_DURABLE_CONNECTOR_INGRESS_DELIVERY_AUDIT.md");
  assert.match(audit, /monitor-ingress\.ts/); assert.match(audit, /reply-delivery\.ts/); assert.match(audit, /UNCERTAIN/);
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates = await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  for (let number = 322; number <= 340; number += 1) {
    const token = `OR-ISSUE-${number}`;
    assert.match(registry, new RegExp(token)); assert.match(gates, /STEP022B Durable Connector gate/);
    assert.match(await read(`reference/validation/STEP022B_OR_ISSUE_${number}.md`), new RegExp(token));
  }
});

test("STEP022B package entrypoints and 50-check Windows contract are exact", async () => {
  const scripts = JSON.parse(await read("package.json")).scripts;
  assert.equal(scripts["acceptance:step022b"], "python scripts/run_step022b_acceptance.py");
  assert.equal(scripts["acceptance:step022b:live"], "python scripts/run_step022b_acceptance.py --require-windows-connector-live");
  assert.equal(scripts["windows-connector-live:step022b"], "node scripts/run-step022b-windows-connector-live.mjs");
  assert.equal(scripts["package:step022b"], "python scripts/package_step022b.py --output ../openrill-step022b-durable-connector-runtime-ingress-delivery-binding-v1.zip");
  const contract = JSON.parse(await read("config/step022b-live-marker-contract.json"));
  assert.equal(contract.step, STEP); assert.equal(contract.version, VERSION); assert.equal(contract.schema, 25);
  assert.equal(contract.expectedChecks, "50/50"); assert.equal(contract.liveHarness, "STEP022B_H1_DURABLE_CONNECTOR_INGRESS_DELIVERY_RECEIPT_AND_RESTART");
});

test("STEP022B root continuation documents preserve exact candidate and official baseline identities", async () => {
  for (const file of ["README.md","HANDOFF.md","PLANS.md","ROADMAP.md","VALIDATION.md","PROJECT.md","ARCHITECTURE.md","AGENTS.md","CONTRIBUTING.md","DECISIONS.md","GLOSSARY.md","NOTICE.md","SECURITY.md"]) {
    const body = await read(file);
    assert.match(body, new RegExp(STEP)); assert.match(body, /0\.23\.0-step022b/); assert.match(body, /STATE_SCHEMA=25/);
    assert.match(body, new RegExp(BASELINE)); assert.match(body, /82\/82/); assert.match(body, new RegExp(BASELINE_SHA));
    assert.match(body, /WINDOWS_CONNECTOR_RUNTIME_LIVE_PENDING/);
  }
});
