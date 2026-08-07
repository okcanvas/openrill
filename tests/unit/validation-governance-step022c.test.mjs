import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = async (path) => await readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const STEP = "STEP022C_MATTERMOST_REAL_CONNECTOR_DURABLE_VERTICAL_SLICE";
const VERSION = "0.24.0-step022c";
const BASELINE = "STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE";
const BASELINE_SHA = "4f763933b37235b2ed7f87f1c1922fc934fdf80bb4135b8e37b12b274f1a1ed5";

test("STEP022C preserves immutable candidate identity and schema-25 evidence while the current STEP owns root source identity", async () => {
  const pkg = JSON.parse(await read("package.json"));
  const contract = JSON.parse(await read("config/step022c-live-marker-contract.json"));
  const baseline = JSON.parse(await read("config/current-accepted-baseline.json"));
  assert.equal(pkg.name, "openrill"); assert.equal(contract.step, STEP); assert.equal(contract.version, VERSION); assert.equal(contract.schema, 25);
  assert.equal(baseline.step, BASELINE); assert.equal(baseline.version, "0.21.3-step021br2");
  assert.equal(baseline.checks, "82/82"); assert.equal(baseline.stateSchema, 24); assert.equal(baseline.zipSha256, BASELINE_SHA);
  const currentSchema = Number(/OPENRILL_STATE_SCHEMA_VERSION = (\d+)/.exec(await read("packages/state/src/migrations.ts"))?.[1] ?? -1);
  assert.ok(currentSchema >= 25);
});

test("STEP022C Mattermost Extension is closed compatible and resolves the bot token only as a secret", async () => {
  const manifest = JSON.parse(await read("connectors/mattermost/openrill.extension.json"));
  assert.equal(manifest.id, "openrill.connector.mattermost");
  assert.deepEqual(manifest.capabilities, [{ kind: "connector", id: "mattermost" }]);
  assert.equal(manifest.configSchema.additionalProperties, false);
  const token = manifest.configSchema.fields.find((field) => field.key === "botToken");
  assert.deepEqual({ kind: token.kind, required: token.required }, { kind: "secret", required: true });
  assert.match(await read("connectors/mattermost/src/extension.ts"), /resolveSecret\("botToken"\)/);
});

test("STEP022C transport owns guarded REST WebSocket reconnect and exact DM mention thread routing", async () => {
  const client = await read("connectors/mattermost/src/client.ts");
  const runtime = await read("connectors/mattermost/src/runtime.ts");
  const normalize = await read("connectors/mattermost/src/normalize.ts");
  assert.match(client, /\/users\/me/); assert.match(client, /\/posts/); assert.match(client, /MAX_SUCCESS_BYTES/); assert.match(client, /MAYBE_ACCEPTED/);
  assert.match(runtime, /authentication_challenge/); assert.match(runtime, /RECONNECT_WAIT/); assert.match(runtime, /ingress-persist-failed/);
  assert.match(normalize, /channel_type/); assert.match(normalize, /mentionPattern/); assert.match(normalize, /externalThreadId/);
  assert.match(normalize, /broadcast channel does not match/); assert.match(normalize, /broadcast user does not match/);
});

test("STEP022C Host schedules adopted Runs and projects terminal assistant output to one durable delivery", async () => {
  const registry = await read("packages/connectors/src/runtime.ts");
  const service = await read("packages/connectors/src/service.ts");
  const host = await read("services/agent-host/src/lifecycle.ts");
  assert.match(registry, /onRunAdmitted/); assert.match(host, /runCoordinator\?\.schedule\(input\.runId\)/); assert.match(host, /connector\.run\.admitted/);
  assert.match(service, /projectRunOutput/); assert.match(service, /run:\$\{runId\}:assistant-final:v1/); assert.match(service, /recoverRunOutputs/);
  assert.match(host, /connectorRuntime\.projectRunOutput\(result\.runId\)/); assert.match(host, /connectorRuntime\.recoverRunOutputs\(\)/);
});

test("STEP022C status doctor and receipt outputs are closed identity-checked and redacted", async () => {
  const runtime = await read("packages/connectors/src/runtime.ts");
  const protocol = await read("services/agent-host/src/transport/operation-registry.ts");
  const state = await read("packages/state/src/connector-repository.ts");
  assert.match(runtime, /normalizePublicStatus/); assert.match(runtime, /normalizeDoctorResult/); assert.match(runtime, /identity does not match registration/);
  for (const op of ["connector.status","connector.doctor"]) assert.match(protocol, new RegExp(op.replace(".", "\\.")));
  assert.match(state, /getReceiptByDelivery/);
  assert.doesNotMatch(await read("packages/protocol/src/connector-operations.ts"), /botToken|baseUrl|websocketUrl/);
});

test("STEP022C focused tests cover the real vertical slice with exactly 24 tests", async () => {
  const files = ["mattermost-client-step022c.test.mjs","mattermost-routing-step022c.test.mjs","connector-run-output-step022c.test.mjs","mattermost-runtime-step022c.test.mjs","mattermost-extension-step022c.test.mjs","connector-observability-step022c.test.mjs","mattermost-host-step022c.test.mjs"];
  let count = 0; let combined = "";
  for (const file of files) { const body = await read(`tests/unit/${file}`); combined += body; count += [...body.matchAll(/^test\(/gm)].length; }
  assert.equal(count, 24);
  for (const phrase of ["POST transport ambiguity becomes MAYBE_ACCEPTED","channel mention routes to one channel Conversation","reconnect replay of the same Mattermost post","startup recovery replays completed connector Run projection","Host runs Mattermost ingress through Agent completion"]) assert.match(combined, new RegExp(phrase));
});

test("STEP022C records OpenClaw Mattermost answer-key evidence and OR-ISSUE-341 through 365 independently", async () => {
  const audit = await read("docs/research/STEP022C_OPENCLAW_MATTERMOST_CONNECTOR_AUDIT.md");
  for (const path of ["monitor-websocket.ts","monitor-ingress.ts","reply-delivery.ts","target-resolution.ts","thread-participation.ts","probe.ts"]) assert.match(audit, new RegExp(path.replace(".", "\\.")));
  assert.match(audit, /1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82/); assert.match(audit, /COPYING=NONE/);
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md"); const gates = await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  for (let number = 341; number <= 365; number += 1) {
    const token = `OR-ISSUE-${number}`; assert.match(registry, new RegExp(token)); assert.match(gates, /STEP022C Mattermost real vertical gate/);
    assert.match(await read(`reference/validation/STEP022C_OR_ISSUE_${number}.md`), new RegExp(token));
  }
});

test("STEP022C package entrypoints and 56-check real Mattermost Windows contract are exact", async () => {
  const scripts = JSON.parse(await read("package.json")).scripts;
  assert.equal(scripts["acceptance:step022c"], "python scripts/run_step022c_acceptance.py");
  assert.equal(scripts["acceptance:step022c:live"], "python scripts/run_step022c_acceptance.py --require-windows-mattermost-live");
  assert.equal(scripts["mattermost-live:step022c"], "node scripts/run-step022c-mattermost-live.mjs");
  assert.equal(scripts["package:step022c"], "python scripts/package_step022c.py --output ../openrill-step022c-mattermost-real-connector-durable-vertical-slice-v1.zip");
  const contract = JSON.parse(await read("config/step022c-live-marker-contract.json"));
  assert.equal(contract.step, STEP); assert.equal(contract.version, VERSION); assert.equal(contract.schema, 25); assert.equal(contract.expectedChecks, "56/56");
  assert.equal(contract.liveHarness, "STEP022C_H1_REAL_MATTERMOST_DM_MENTION_THREAD_DELIVERY_AND_RESTART");
});

test("STEP022C Windows Harness requires real Mattermost separate actors path spaces receipt and duplicate-free restart", async () => {
  const body = await read("scripts/run-step022c-mattermost-live.mjs");
  for (const name of ["OPENRILL_MATTERMOST_BASE_URL","OPENRILL_MATTERMOST_BOT_TOKEN","OPENRILL_MATTERMOST_TEST_USER_TOKEN","OPENRILL_MATTERMOST_TEST_CHANNEL_ID"]) assert.match(body, new RegExp(name));
  assert.match(body, /process\.platform !== "win32"/); assert.match(body, /OpenRill STEP022C Mattermost Live/); assert.match(body, /separate-actors/);
  assert.match(body, /remote-reply-visible/); assert.match(body, /restart-remote-reply-once/); assert.match(body, /LIVE_CHECK_NAMES/); assert.match(body, /expectedChecks/);
});

test("STEP022C root continuation documents preserve exact candidate and official baseline identities", async () => {
  for (const file of ["README.md","HANDOFF.md","PLANS.md","ROADMAP.md","VALIDATION.md","PROJECT.md","ARCHITECTURE.md","AGENTS.md","CONTRIBUTING.md","DECISIONS.md","GLOSSARY.md","NOTICE.md","SECURITY.md"]) {
    const body = await read(file);
    assert.match(body, new RegExp(STEP)); assert.match(body, /0\.24\.0-step022c/); assert.match(body, /STATE_SCHEMA=25/);
    assert.match(body, new RegExp(BASELINE)); assert.match(body, /82\/82/); assert.match(body, new RegExp(BASELINE_SHA)); assert.match(body, /WINDOWS_MATTERMOST_REAL_LIVE_PENDING/);
  }
});

test("STEP022C immutable package script retains candidate identity while mutable manifest tools remain owned by the current STEP", async () => {
  const packageScript = await read("scripts/package_step022c.py"); assert.match(packageScript, new RegExp(STEP)); assert.match(packageScript, /0\.24\.0-step022c/);
  for (const file of ["scripts/generate_package_manifest.py","scripts/verify_package_manifest.py"]) assert.match(await read(file), /VERSION = /);
});
