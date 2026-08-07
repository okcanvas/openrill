import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalCliProtocolClient } from "../apps/agent-cli/dist/local-protocol-client.js";
import { readHostMetadata, startLocalHost } from "../services/agent-host/dist/index.js";
import { validateAndMaterializeConfig } from "../packages/config/dist/index.js";
import { OPENRILL_STATE_SCHEMA_VERSION } from "../packages/state/dist/index.js";
import { parseNodeTapSummary } from "./node-tap-summary.mjs";
import { loadStep022bLiveMarkerContract, renderStep022bLiveMarker } from "./step022b-live-marker.mjs";

const contract = await loadStep022bLiveMarkerContract();
if (process.platform !== "win32") throw new Error("OPENRILL_STEP022B_WINDOWS_REQUIRED");

function spawnCapture(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: process.cwd(), env: { ...process.env, NO_COLOR: "1", NODE_DISABLE_COLORS: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code: code ?? 1, output }));
  });
}

async function connect(host, id) {
  const metadata = await readHostMetadata(host.paths);
  if (!metadata) throw new Error("STEP022B_HOST_METADATA_MISSING");
  const client = new LocalCliProtocolClient(metadata, id, process.platform);
  const accepted = await client.connect();
  return { client, accepted };
}

async function writeConnectorExtension(configRoot) {
  const directory = join(configRoot, "extensions with spaces", "live.connector");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "openrill.extension.json"), JSON.stringify({
    schemaVersion: 1,
    id: "live.connector",
    displayName: "STEP022B Live Connector",
    version: "1.0.0",
    entry: "index.mjs",
    compatibility: { apiVersion: 1, host: { minInclusive: "0.23.0-step022b", maxExclusive: "0.24.0" } },
    capabilities: [{ kind: "connector", id: "fixture" }],
    configSchema: { additionalProperties: false, fields: [] },
  }, null, 2));
  await writeFile(join(directory, "index.mjs"), `
    export default { activate(context) {
      globalThis.__step022bWindowsEvents ??= [];
      const port = context.registerConnector({
        connectorId: "fixture",
        normalizeIngress(claim) {
          return { kind: "message", route: { workspaceId: "default", externalScopeId: "team:one", externalConversationId: claim.ingress.laneKey }, text: String(claim.ingress.payload.text) };
        },
        deliver() {
          return { kind: "accepted", receipt: { providerMessageId: "fixture-post-1", providerConversationId: "channel:one", receipt: { accepted: true, privateToken: "receipt-secret" } } };
        },
      });
      port.registerAccount({ accountId: "main", workspaceId: "default" });
      globalThis.__step022bWindowsPort = port;
      globalThis.__step022bWindowsEvents.push("activate");
      return { deactivate(reason) { globalThis.__step022bWindowsEvents.push("deactivate:" + reason); } };
    } };
  `);
}

const focusedTests = [
  "tests/unit/connector-runtime-step022b.test.mjs",
  "tests/unit/extension-connector-step022b.test.mjs",
  "tests/unit/connector-protocol-step022b.test.mjs",
  "tests/unit/connector-host-step022b.test.mjs",
];
const focused = await spawnCapture(["--test", "--test-concurrency=1", "--test-reporter=tap", ...focusedTests]);
const tap = parseNodeTapSummary(focused.output);
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const checks = [];
const check = (name, value, detail = "") => checks.push({ name, passed: Boolean(value), detail: String(detail) });
check("platform", process.platform === "win32", process.platform);
check("focused-exit", focused.code === 0, focused.code);
check("focused-tests", tap.tests === 21, tap.tests);
check("focused-pass", tap.pass === 21, tap.pass);
check("focused-fail", tap.fail === 0, tap.fail);
check("focused-cancelled", tap.cancelled === 0, tap.cancelled);
check("focused-skipped", tap.skipped === 0, tap.skipped);
check("focused-todo", tap.todo === 0, tap.todo);
check("schema", Number(OPENRILL_STATE_SCHEMA_VERSION) === Number(contract.schema), OPENRILL_STATE_SCHEMA_VERSION);
check("version", pkg.version === contract.version, pkg.version);
for (const [name, text] of [
  ["schema-ledgers", "schema 25 adds durable Connector account"],
  ["ingress-persist", "ingress admission is durable before ACK"],
  ["binding-atomic", "atomically creates one binding"],
  ["ingress-reclaim", "expired ingress claims are safely reclaimed"],
  ["receipt-atomic", "persists attempt and provider receipt atomically"],
  ["uncertain-no-replay", "maybe-accepted delivery is quarantined"],
  ["delivery-recovery", "pre-dispatch claims to pending but isolates post-dispatch"],
  ["adapter-default-uncertain", "default post-dispatch exceptions become uncertain"],
  ["pre-send-retry", "pre-send failure for safe retry"],
  ["account-owner", "cannot be rebound to a different Extension owner"],
  ["adapter-snapshot", "behavior is snapshotted"],
  ["ingress-replay-conflict", "rejects changed route or text"],
  ["receipt-identity", "compares provider conversation and thread identities"],
  ["filter-validation", "rejects invalid connector and account filters"],
  ["aborted-signal", "already-aborted activation signal"],
  ["extension-register", "requires one real Host adapter registration"],
  ["claim-only-rejected", "cannot become READY through claimCapability"],
  ["manifest-mismatch", "not declared by its manifest"],
  ["protocol-closed", "inputs are closed, bounded"],
  ["protocol-four", "four exact read-only Connector ledger operations"],
  ["host-restart-focused", "restarts duplicate-free"],
]) check(name, focused.output.includes(text));

const root = await mkdtemp(join(tmpdir(), "OpenRill STEP022B Live "));
const configRoot = join(root, "config root with spaces");
const env = { ...process.env, OPENRILL_DATA_ROOT: join(root, "data root with spaces"), OPENRILL_CONFIG_ROOT: configRoot };
const config = validateAndMaterializeConfig({ version: 1, extensions: { roots: ["extensions with spaces/live.connector"], enabled: ["live.connector"] } });
globalThis.__step022bWindowsEvents = [];
let first; let second; let client;
try {
  await writeConnectorExtension(configRoot);
  check("path-with-spaces", root.includes(" "), root);
  first = await startLocalHost({ profile: "step022b live", port: 0, env, config, configRoot, workspaceIds: ["default"] });
  const firstReady = await first.ready;
  check("first-host-ready", firstReady.state === "READY", firstReady.state);
  let connected = await connect(first, "step022b-live-first"); client = connected.client;
  check("connector-notice-capability", connected.accepted.capabilities.notices.includes("connector.recovered"), connected.accepted.capabilities.notices.join(","));
  const connectorOps = connected.accepted.capabilities.operations.filter((item) => item.name.startsWith("connector.")).map((item) => item.name);
  check("connector-operations", JSON.stringify(connectorOps) === JSON.stringify(["connector.account.list","connector.deadLetter.list","connector.delivery.list","connector.ingress.list"]), connectorOps.join(","));
  const accounts = await client.call("connector.account.list", {}, 5_000);
  check("account-list", accounts.items.length === 1 && accounts.items[0].status === "ENABLED", JSON.stringify(accounts));
  const port = globalThis.__step022bWindowsPort;
  const admitted = port.receiveIngress({ accountId: "main", externalEventId: "event-1", laneKey: "channel:one", payloadVersion: 1, payload: { text: "private inbound text", token: "ingress-secret" } });
  check("ingress-ack", admitted.acknowledge === true, JSON.stringify(admitted));
  const drained = await port.drainIngress({ accountId: "main" });
  check("ingress-drain", drained.processed === 1 && drained.adopted === 1, JSON.stringify(drained));
  const ingress = await client.call("connector.ingress.list", {}, 5_000);
  check("ingress-status", ingress.items.length === 1 && ingress.items[0].status === "ADOPTED", JSON.stringify(ingress));
  check("ingress-redaction", ingress.items.length === 1 && !Object.hasOwn(ingress.items[0], "payload") && !Object.hasOwn(ingress.items[0], "claimToken") && !Object.hasOwn(ingress.items[0], "lastErrorSummary") && !JSON.stringify(ingress).includes("ingress-secret"), JSON.stringify(ingress));
  const conversations = await client.call("conversation.list", { workspaceId: "default" }, 5_000);
  const conversationId = conversations.items?.[0]?.conversationId;
  check("conversation-adopted", conversations.items?.length === 1 && typeof conversationId === "string", JSON.stringify(conversations));
  port.enqueueDelivery({ accountId: "main", conversationId, targetKey: "channel:one", payloadVersion: 1, payload: { text: "private outbound text", token: "delivery-secret" }, idempotencyKey: "reply-1" });
  const delivered = await port.drainDeliveries({ accountId: "main" });
  check("delivery-drain", delivered.processed === 1 && delivered.delivered === 1, JSON.stringify(delivered));
  const deliveries = await client.call("connector.delivery.list", {}, 5_000);
  check("delivery-status", deliveries.items.length === 1 && deliveries.items[0].status === "DELIVERED", JSON.stringify(deliveries));
  check("delivery-redaction", deliveries.items.length === 1 && deliveries.items[0].status === "DELIVERED" && !Object.hasOwn(deliveries.items[0], "payload") && !Object.hasOwn(deliveries.items[0], "claimToken") && !Object.hasOwn(deliveries.items[0], "lastErrorSummary") && !JSON.stringify(deliveries).includes("delivery-secret"), JSON.stringify(deliveries));
  client.close(); client = null;
  await first.close("step022b-first-close"); first = null;
  check("first-port-unregistered", (() => { try { port.receiveIngress({ accountId: "main", externalEventId: "event-2", laneKey: "channel:one", payloadVersion: 1, payload: {} }); return false; } catch (error) { return error?.code === "CONNECTOR_NOT_REGISTERED"; } })());

  second = await startLocalHost({ profile: "step022b live", port: 0, env, config, configRoot, workspaceIds: ["default"] });
  const secondReady = await second.ready;
  check("second-host-ready", secondReady.state === "READY", secondReady.state);
  connected = await connect(second, "step022b-live-second"); client = connected.client;
  const accounts2 = await client.call("connector.account.list", {}, 5_000);
  check("restart-account-revision", accounts2.items.length === 1 && accounts2.items[0].revision === 2, JSON.stringify(accounts2));
  check("restart-ingress-once", (await client.call("connector.ingress.list", {}, 5_000)).items.length === 1);
  const deliveries2 = await client.call("connector.delivery.list", {}, 5_000);
  check("restart-delivery-once", deliveries2.items.length === 1 && deliveries2.items[0].status === "DELIVERED", JSON.stringify(deliveries2));
  client.close(); client = null;
  await second.close("step022b-second-close"); second = null;
  check("lifecycle-order", JSON.stringify(globalThis.__step022bWindowsEvents) === JSON.stringify(["activate","deactivate:host-stopping","activate","deactivate:host-stopping"]), JSON.stringify(globalThis.__step022bWindowsEvents));
} catch (error) {
  check("live-fixture", false, error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  client?.close();
  await first?.close("step022b-live-cleanup").catch(() => undefined);
  await second?.close("step022b-live-cleanup").catch(() => undefined);
  delete globalThis.__step022bWindowsPort; delete globalThis.__step022bWindowsEvents;
  await rm(root, { recursive: true, force: true });
}

const passed = checks.filter((item) => item.passed).length;
const state = passed === checks.length && checks.length === 50 ? "PASSED" : "FAILED";
console.log(renderStep022bLiveMarker(contract, { passed, total: checks.length, state }));
for (const item of checks.filter((entry) => !entry.passed)) console.error(`OPENRILL_STEP022B_LIVE_FAILURE check=${item.name} detail=${item.detail}`);
if (checks.length !== 50) console.error(`OPENRILL_STEP022B_LIVE_FAILURE check=contract-count detail=${checks.length}`);
if (state !== "PASSED") process.exitCode = 1;
