import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalCliProtocolClient } from "../apps/agent-cli/dist/local-protocol-client.js";
import { validateAndMaterializeConfig } from "../packages/config/dist/index.js";
import { OPENRILL_STATE_SCHEMA_VERSION } from "../packages/state/dist/index.js";
import { readHostMetadata, startLocalHost } from "../services/agent-host/dist/index.js";
import { parseNodeTapSummary } from "./node-tap-summary.mjs";
import { loadStep022aLiveMarkerContract, renderStep022aLiveMarker } from "./step022a-live-marker.mjs";

const contract = await loadStep022aLiveMarkerContract();
if (process.platform !== "win32") throw new Error("OPENRILL_STEP022A_WINDOWS_REQUIRED");

function spawnCapture(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, NO_COLOR: "1", NODE_DISABLE_COLORS: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code: code ?? 1, output }));
  });
}

async function connect(host, clientId) {
  const metadata = await readHostMetadata(host.paths);
  if (!metadata) throw new Error("STEP022A_HOST_METADATA_MISSING");
  const client = new LocalCliProtocolClient(metadata, clientId, process.platform);
  const accepted = await client.connect();
  return { client, accepted };
}

async function writeLiveExtension(configRoot) {
  const directory = join(configRoot, "extensions with spaces", "live.local");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "openrill.extension.json"), JSON.stringify({
    schemaVersion: 1,
    id: "live.local",
    displayName: "STEP022A Live Local",
    version: "1.0.0",
    entry: "index.mjs",
    compatibility: { apiVersion: 1, host: { minInclusive: "0.22.0-step022a", maxExclusive: "0.23.0" } },
    capabilities: [{ kind: "tool", id: "live-local" }],
    configSchema: { additionalProperties: false, fields: [{ key: "token", kind: "secret", required: true }] },
  }, null, 2));
  await writeFile(join(directory, "index.mjs"), `
    export default { async activate(context) {
      globalThis.__step022aWindowsEvents ??= [];
      const token = await context.resolveSecret("token");
      globalThis.__step022aWindowsEvents.push("activate:" + context.extensionId + ":secret=" + (token.length > 20));
      context.claimCapability({ kind: "tool", id: "live-local" });
      return { deactivate(reason) { globalThis.__step022aWindowsEvents.push("deactivate:" + reason); } };
    } };
  `);
}

const tests = [
  "tests/unit/extension-contract-step022a.test.mjs",
  "tests/unit/extension-runtime-step022a.test.mjs",
  "tests/unit/extension-protocol-step022a.test.mjs",
  "tests/unit/extension-host-step022a.test.mjs",
];
const focused = await spawnCapture(["--test", "--test-concurrency=1", "--test-reporter=tap", ...tests]);
const tap = parseNodeTapSummary(focused.output);
const pkg = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../package.json", import.meta.url), "utf8"));
const checks = [];
const check = (name, value, detail = "") => checks.push({ name, passed: Boolean(value), detail });
check("platform", process.platform === "win32", process.platform);
check("focused-exit", focused.code === 0, String(focused.code));
check("focused-tests", tap.tests === 14, String(tap.tests));
check("focused-pass", tap.pass === 14, String(tap.pass));
check("focused-fail", tap.fail === 0, String(tap.fail));
check("focused-cancelled", tap.cancelled === 0, String(tap.cancelled));
check("focused-skipped", tap.skipped === 0, String(tap.skipped));
check("focused-todo", tap.todo === 0, String(tap.todo));
check("schema", Number(OPENRILL_STATE_SCHEMA_VERSION) === Number(contract.schema), String(OPENRILL_STATE_SCHEMA_VERSION));
check("version", pkg.version === contract.version, String(pkg.version));
check("manifest-closed", focused.output.includes("manifest is closed, bounded"));
check("deterministic-activation", focused.output.includes("discovers deterministically"));
check("duplicate-capability", focused.output.includes("duplicate capabilities are blocked"));
check("invalid-root-redaction", focused.output.includes("without fake capabilities or filesystem path disclosure"));
check("secret-reference", focused.output.includes("resolved only during activation"));
check("failure-isolation", focused.output.includes("activation failure is isolated"));
check("lifecycle-timeout", focused.output.includes("activation timeout"));
check("error-spoofing", focused.output.includes("cannot spoof Host module-contract errors"));
check("protocol-closed", focused.output.includes("inputs are closed"));
check("protocol-four", focused.output.includes("four exact Extension operations"));
check("host-restart-focused", focused.output.includes("restarts without duplicate registration"));

const root = await mkdtemp(join(tmpdir(), "OpenRill STEP022A Live "));
const configRoot = join(root, "config root with spaces");
const secret = randomBytes(32).toString("base64url");
const env = {
  ...process.env,
  OPENRILL_DATA_ROOT: join(root, "data root with spaces"),
  OPENRILL_CONFIG_ROOT: configRoot,
  STEP022A_WINDOWS_TOKEN: secret,
};
const config = validateAndMaterializeConfig({
  version: 1,
  extensions: {
    roots: ["extensions with spaces/live.local"],
    enabled: ["live.local"],
    settings: { "live.local": { values: {}, secrets: { token: { kind: "env", key: "STEP022A_WINDOWS_TOKEN" } } } },
  },
});
globalThis.__step022aWindowsEvents = [];
let firstHost; let secondHost; let firstClient; let secondClient;
try {
  await writeLiveExtension(configRoot);
  check("path-with-spaces", root.includes(" "), root);
  firstHost = await startLocalHost({ profile: "step022a live", port: 0, env, config, configRoot });
  const firstReady = await firstHost.ready;
  check("first-host-ready", firstReady.state === "READY", firstReady.state);
  const firstConnection = await connect(firstHost, "step022a-live-first");
  firstClient = firstConnection.client;
  const operationNames = firstConnection.accepted.capabilities.operations.map((item) => item.name);
  for (const name of ["extension.list", "extension.get", "extension.enable", "extension.disable"]) {
    check(`operation-${name.split(".")[1]}`, operationNames.includes(name), operationNames.join(","));
  }
  let listed = await firstClient.call("extension.list", {}, 5_000);
  check("first-list-one", listed.items.length === 1, String(listed.items.length));
  check("first-ready", listed.items[0]?.state === "READY", String(listed.items[0]?.state));
  check("first-sequence", listed.items[0]?.activationSequence === 1, String(listed.items[0]?.activationSequence));
  check("secret-not-public", !JSON.stringify(listed).includes(secret));
  check("path-not-public", !JSON.stringify(listed).includes(root));
  const got = await firstClient.call("extension.get", { extensionId: "live.local" }, 5_000);
  check("get-ready", got.state === "READY", got.state);
  const disabled = await firstClient.call("extension.disable", { extensionId: "live.local" }, 5_000);
  check("disable-state", disabled.state === "DISABLED", disabled.state);
  const enabled = await firstClient.call("extension.enable", { extensionId: "live.local" }, 5_000);
  check("enable-state", enabled.state === "READY", enabled.state);
  firstClient.close(); firstClient = null;
  await firstHost.close("step022a-live-first-close"); firstHost = null;
  check("first-close", globalThis.__step022aWindowsEvents.includes("deactivate:host-stopping"), JSON.stringify(globalThis.__step022aWindowsEvents));

  secondHost = await startLocalHost({ profile: "step022a live", port: 0, env, config, configRoot });
  const secondReady = await secondHost.ready;
  check("second-host-ready", secondReady.state === "READY", secondReady.state);
  ({ client: secondClient } = await connect(secondHost, "step022a-live-second"));
  listed = await secondClient.call("extension.list", {}, 5_000);
  check("second-list-one", listed.items.length === 1, String(listed.items.length));
  check("second-sequence", listed.items[0]?.activationSequence === 1, String(listed.items[0]?.activationSequence));
  check("second-capability-one", listed.items[0]?.capabilities.length === 1, String(listed.items[0]?.capabilities.length));
  check("restart-no-duplicate", listed.items[0]?.extensionId === "live.local" && listed.items[0]?.capabilities[0]?.id === "live-local", JSON.stringify(listed.items));
  secondClient.close(); secondClient = null;
  await secondHost.close("step022a-live-second-close"); secondHost = null;
  const expectedEvents = [
    "activate:live.local:secret=true",
    "deactivate:runtime-disable",
    "activate:live.local:secret=true",
    "deactivate:host-stopping",
    "activate:live.local:secret=true",
    "deactivate:host-stopping",
  ];
  check("event-order", JSON.stringify(globalThis.__step022aWindowsEvents) === JSON.stringify(expectedEvents), JSON.stringify(globalThis.__step022aWindowsEvents));
  check("second-close", globalThis.__step022aWindowsEvents.at(-1) === "deactivate:host-stopping", JSON.stringify(globalThis.__step022aWindowsEvents));
} catch (error) {
  check("live-fixture", false, error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  firstClient?.close(); secondClient?.close();
  await firstHost?.close("step022a-live-cleanup").catch(() => undefined);
  await secondHost?.close("step022a-live-cleanup").catch(() => undefined);
  delete globalThis.__step022aWindowsEvents;
  await rm(root, { recursive: true, force: true });
}

const passed = checks.filter((item) => item.passed).length;
const state = passed === checks.length && checks.length === 43 ? "PASSED" : "FAILED";
console.log(renderStep022aLiveMarker(contract, { passed, total: checks.length, state }));
for (const item of checks.filter((entry) => !entry.passed)) console.error(`OPENRILL_STEP022A_LIVE_FAILURE check=${item.name} detail=${item.detail}`);
if (checks.length !== 43) console.error(`OPENRILL_STEP022A_LIVE_FAILURE check=contract-count detail=${checks.length}`);
if (state !== "PASSED") process.exitCode = 1;
