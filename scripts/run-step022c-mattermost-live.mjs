import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { LocalCliProtocolClient } from "../apps/agent-cli/dist/local-protocol-client.js";
import { validateAndMaterializeConfig } from "../packages/config/dist/index.js";
import { createScriptedModelAdapter } from "../packages/model-adapter/dist/index.js";
import { OPENRILL_STATE_SCHEMA_VERSION } from "../packages/state/dist/index.js";
import { readHostMetadata, startLocalHost } from "../services/agent-host/dist/index.js";
import { parseNodeTapSummary } from "./node-tap-summary.mjs";
import { loadStep022cLiveMarkerContract, renderStep022cLiveMarker } from "./step022c-live-marker.mjs";

const contract = await loadStep022cLiveMarkerContract();
if (process.platform !== "win32") throw new Error("OPENRILL_STEP022C_WINDOWS_REQUIRED");

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`OPENRILL_STEP022C_REQUIRED_ENV_MISSING:${name}`);
  return value;
}

const baseUrl = requiredEnv("OPENRILL_MATTERMOST_BASE_URL").replace(/\/+$/, "").replace(/\/api\/v4$/i, "");
const botToken = requiredEnv("OPENRILL_MATTERMOST_BOT_TOKEN");
const userToken = requiredEnv("OPENRILL_MATTERMOST_TEST_USER_TOKEN");
const channelId = requiredEnv("OPENRILL_MATTERMOST_TEST_CHANNEL_ID");
const allowPrivateNetwork = process.env.OPENRILL_MATTERMOST_ALLOW_PRIVATE_NETWORK === "1";
const apiBase = `${baseUrl}/api/v4`;

function spawnCapture(args) {
  return new Promise((resolveSpawn, reject) => {
    const child = spawn(process.execPath, args, { cwd: process.cwd(), env: { ...process.env, NO_COLOR: "1", NODE_DISABLE_COLORS: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => resolveSpawn({ code: code ?? 1, output }));
  });
}

async function api(token, path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${apiBase}${path}`, { ...init, headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`MATTERMOST_LIVE_API_REJECTED:${response.status}:${path}`);
  if (!text) return null;
  try { return JSON.parse(text); } catch { throw new Error(`MATTERMOST_LIVE_RESPONSE_INVALID:${path}`); }
}

async function createPost(token, body) {
  return await api(token, "/posts", { method: "POST", body: JSON.stringify(body) });
}

async function deletePost(token, postId) {
  if (!postId) return;
  await api(token, `/posts/${encodeURIComponent(postId)}`, { method: "DELETE" }).catch(() => undefined);
}

async function channelPosts(since) {
  return await api(botToken, `/channels/${encodeURIComponent(channelId)}/posts?since=${since}`);
}

async function waitFor(predicate, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`STEP022C_LIVE_TIMEOUT:${timeoutMs}`);
}

async function connect(host, id) {
  const metadata = await readHostMetadata(host.paths);
  if (!metadata) throw new Error("STEP022C_HOST_METADATA_MISSING");
  const client = new LocalCliProtocolClient(metadata, id, process.platform);
  const accepted = await client.connect();
  return { client, accepted };
}

function resolver(adapter) {
  return { resolve: () => ({ profile: "default", adapter, provider: "fixture", model: "fixture-model", maxOutputTokens: 256, maxRetries: 0 }) };
}

async function writeMattermostExtension(configRoot) {
  const directory = join(configRoot, "extensions with spaces", "mattermost");
  await mkdir(join(directory, "dist"), { recursive: true });
  const manifest = JSON.parse(await readFile(resolve("connectors/mattermost/openrill.extension.json"), "utf8"));
  await writeFile(join(directory, "openrill.extension.json"), JSON.stringify(manifest, null, 2));
  const extensionUrl = pathToFileURL(resolve("connectors/mattermost/dist/extension.js")).href;
  await writeFile(join(directory, "dist", "extension.js"), `export { default } from ${JSON.stringify(extensionUrl)};\n`);
}

const focusedTests = [
  "tests/unit/mattermost-client-step022c.test.mjs",
  "tests/unit/mattermost-routing-step022c.test.mjs",
  "tests/unit/connector-run-output-step022c.test.mjs",
  "tests/unit/mattermost-runtime-step022c.test.mjs",
  "tests/unit/mattermost-extension-step022c.test.mjs",
  "tests/unit/connector-observability-step022c.test.mjs",
  "tests/unit/mattermost-host-step022c.test.mjs",
];
const focused = await spawnCapture(["--test", "--test-concurrency=1", "--test-reporter=tap", ...focusedTests]);
const tap = parseNodeTapSummary(focused.output);
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const checks = [];
const checkNames = new Set();
const check = (name, value, detail = "") => {
  if (checkNames.has(name)) throw new Error(`OPENRILL_STEP022C_DUPLICATE_CHECK:${name}`);
  checkNames.add(name);
  checks.push({ name, passed: Boolean(value), detail: String(detail) });
};
const LIVE_CHECK_NAMES = [
  "bot-auth", "user-auth", "separate-actors", "channel-id", "path-with-spaces",
  "first-host-ready", "connector-operations", "connector-connected", "status-redacted",
  "doctor-passed", "doctor-redacted", "root-post-created", "request-post-created",
  "ingress-adopted", "unmentioned-root-ignored", "delivery-delivered", "remote-reply-visible",
  "one-conversation", "run-completed", "assistant-output", "second-host-ready",
  "restart-ingress-once", "restart-delivery-once", "restart-remote-reply-once", "restart-connected",
];

check("platform", process.platform === "win32", process.platform);
check("focused-exit", focused.code === 0, focused.code);
check("focused-tests", tap.tests === 24, tap.tests);
check("focused-pass", tap.pass === 24, tap.pass);
check("focused-fail", tap.fail === 0, tap.fail);
check("focused-cancelled", tap.cancelled === 0, tap.cancelled);
check("focused-skipped", tap.skipped === 0, tap.skipped);
check("focused-todo", tap.todo === 0, tap.todo);
check("schema", Number(OPENRILL_STATE_SCHEMA_VERSION) === Number(contract.schema), OPENRILL_STATE_SCHEMA_VERSION);
check("version", pkg.version === contract.version, pkg.version);
for (const [name, phrase] of [
  ["url-boundary", "URL normalization closes credentials"],
  ["rest-auth", "REST client authenticates"],
  ["uncertain-send", "POST transport ambiguity becomes MAYBE_ACCEPTED"],
  ["api-rejection", "explicit Mattermost API rejection remains REJECTED"],
  ["mention-routing", "channel mention routes to one channel Conversation"],
  ["direct-thread", "direct message bypasses mention requirement"],
  ["ignored-events", "self, system, unmentioned, empty"],
  ["broadcast-identity", "broadcast identity must match"],
  ["websocket-auth", "authenticates WebSocket, persists posted event"],
  ["reconnect-dedupe", "reconnect replay of the same Mattermost post"],
  ["outbound-receipt", "stores exact Mattermost receipt"],
  ["doctor-probe", "doctor proves config, REST authentication"],
  ["persist-reconnect", "persistence failure is retried and forces reconnect"],
  ["run-projection", "completed Connector Run projects one idempotent durable delivery"],
  ["run-recovery", "startup recovery replays completed connector Run projection"],
  ["observability-closed", "reconstructs closed public status and doctor outputs"],
  ["observability-forgery", "rejects forged observability identity"],
  ["protocol-observability", "exposes closed connector.status and connector.doctor"],
  ["extension-activation", "actual Extension activation registers one adapter"],
  ["host-vertical", "Host runs Mattermost ingress through Agent completion"],
]) check(name, focused.output.includes(phrase));

const root = await mkdtemp(join(tmpdir(), "OpenRill STEP022C Mattermost Live "));
const configRoot = join(root, "config root with spaces");
const workspace = join(root, "workspace with spaces");
const profile = "step022c-mattermost-live";
const env = { ...process.env, OPENRILL_DATA_ROOT: join(root, "data root with spaces"), OPENRILL_CONFIG_ROOT: configRoot };
const nonce = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const requestText = `STEP022C request ${nonce}`;
const replyText = `STEP022C_REPLY_${nonce}`;
const since = Date.now() - 5_000;
let rootPost = null;
let requestPost = null;
let botReply = null;
let first = null;
let second = null;
let client = null;
let liveFailure = null;
try {
  await mkdir(workspace, { recursive: true });
  await writeMattermostExtension(configRoot);
  const bot = await api(botToken, "/users/me");
  const user = await api(userToken, "/users/me");
  check("bot-auth", typeof bot?.id === "string" && typeof bot?.username === "string", bot?.id ?? "missing");
  check("user-auth", typeof user?.id === "string" && typeof user?.username === "string", user?.id ?? "missing");
  check("separate-actors", bot?.id !== user?.id, `${bot?.id === user?.id}`);
  check("channel-id", channelId.length > 0 && channelId.length <= 256 && !/\s/.test(channelId), channelId.length);
  check("path-with-spaces", root.includes(" ") && configRoot.includes(" ") && workspace.includes(" "));

  const config = validateAndMaterializeConfig({
    version: 1,
    modelProviders: { default: { type: "fixture" } },
    workspaces: [{ id: "default", path: workspace }],
    extensions: {
      roots: ["extensions with spaces/mattermost"], enabled: ["openrill.connector.mattermost"],
      settings: { "openrill.connector.mattermost": {
        values: { accountId: "main", workspaceId: "default", baseUrl, requireMention: true, allowPrivateNetwork, requestTimeoutMs: 30_000, reconnectMinMs: 250, reconnectMaxMs: 5_000, pumpIntervalMs: 100 },
        secrets: { botToken: { kind: "env", key: "OPENRILL_MATTERMOST_BOT_TOKEN" } },
      } },
    },
  });
  const adapter = createScriptedModelAdapter({ turns: [{ kind: "events", events: [
    { type: "text_delta", delta: replyText },
    { type: "completed", stopReason: "stop" },
  ] }] });
  first = await startLocalHost({ profile, port: 0, env, config, configRoot, workspaceIds: ["default"], modelResolver: resolver(adapter) });
  const ready = await first.ready;
  check("first-host-ready", ready.state === "READY", ready.state);
  let connected = await connect(first, "step022c-live-first"); client = connected.client;
  const connectorOps = connected.accepted.capabilities.operations.filter((item) => item.name.startsWith("connector.")).map((item) => item.name);
  check("connector-operations", JSON.stringify(connectorOps) === JSON.stringify(["connector.account.list","connector.deadLetter.list","connector.delivery.list","connector.doctor","connector.ingress.list","connector.status"]), connectorOps.join(","));
  const status = await client.call("connector.status", { connectorId: "mattermost" }, 10_000);
  check("connector-connected", status.state === "CONNECTED" && status.healthy === true && status.accountId === "main", JSON.stringify(status));
  check("status-redacted", !JSON.stringify(status).includes(baseUrl) && !JSON.stringify(status).includes(botToken), JSON.stringify(status));
  const doctor = await client.call("connector.doctor", { connectorId: "mattermost" }, 30_000);
  check("doctor-passed", doctor.ok === true && doctor.checks.every((item) => item.state === "PASSED"), JSON.stringify(doctor));
  check("doctor-redacted", !Object.hasOwn(doctor, "baseUrl") && !JSON.stringify(doctor).includes(botToken), JSON.stringify(doctor));

  rootPost = await createPost(userToken, { channel_id: channelId, message: `STEP022C root ${nonce}` });
  check("root-post-created", typeof rootPost?.id === "string" && rootPost.channel_id === channelId, rootPost?.id ?? "missing");
  requestPost = await createPost(userToken, { channel_id: channelId, root_id: rootPost.id, message: `@${bot.username} ${requestText}` });
  check("request-post-created", typeof requestPost?.id === "string" && requestPost.root_id === rootPost.id, requestPost?.id ?? "missing");

  const adopted = await waitFor(async () => {
    const value = await client.call("connector.ingress.list", { connectorId: "mattermost", status: "ADOPTED", limit: 100 }, 10_000);
    return value.items.find((item) => item.externalEventId === requestPost.id) ?? null;
  });
  check("ingress-adopted", adopted.runId && adopted.messageId && adopted.bindingId, JSON.stringify(adopted));
  const ignored = await client.call("connector.ingress.list", { connectorId: "mattermost", status: "IGNORED", limit: 100 }, 10_000);
  check("unmentioned-root-ignored", ignored.items.some((item) => item.externalEventId === rootPost.id), JSON.stringify(ignored.items.map((item) => item.externalEventId)));

  const delivered = await waitFor(async () => {
    const value = await client.call("connector.delivery.list", { connectorId: "mattermost", status: "DELIVERED", limit: 100 }, 10_000);
    return value.items.find((item) => item.runId === adopted.runId) ?? null;
  });
  check("delivery-delivered", delivered.attemptCount === 1 && delivered.targetKey === channelId && delivered.threadKey === rootPost.id, JSON.stringify(delivered));
  const remote = await waitFor(async () => {
    const page = await channelPosts(since);
    const posts = page?.posts && typeof page.posts === "object" ? Object.values(page.posts) : [];
    return posts.find((post) => post?.message === replyText && post?.root_id === rootPost.id && post?.user_id === bot.id) ?? null;
  });
  botReply = remote;
  check("remote-reply-visible", botReply.channel_id === channelId && botReply.root_id === rootPost.id && botReply.message === replyText, JSON.stringify({ id: botReply.id, channel_id: botReply.channel_id, root_id: botReply.root_id }));
  const conversations = await client.call("conversation.list", { workspaceId: "default" }, 10_000);
  check("one-conversation", conversations.items.length === 1, conversations.items.length);
  const detail = await client.call("conversation.get", { workspaceId: "default", conversationId: conversations.items[0].conversationId }, 10_000);
  check("run-completed", detail.runs.some((run) => run.runId === adopted.runId && run.status === "COMPLETED"), JSON.stringify(detail.runs));
  check("assistant-output", detail.messages.some((message) => message.role === "assistant" && message.content?.text === replyText), "assistant-output-missing");

  client.close(); client = null;
  await first.close("step022c-live-restart"); first = null;
  second = await startLocalHost({ profile, port: 0, env, config, configRoot, workspaceIds: ["default"], modelResolver: resolver(createScriptedModelAdapter({ turns: [] })) });
  const ready2 = await second.ready;
  check("second-host-ready", ready2.state === "READY", ready2.state);
  connected = await connect(second, "step022c-live-second"); client = connected.client;
  const ingress2 = await client.call("connector.ingress.list", { connectorId: "mattermost", limit: 100 }, 10_000);
  const deliveries2 = await client.call("connector.delivery.list", { connectorId: "mattermost", limit: 100 }, 10_000);
  check("restart-ingress-once", ingress2.items.filter((item) => item.externalEventId === requestPost.id).length === 1, ingress2.items.length);
  check("restart-delivery-once", deliveries2.items.filter((item) => item.runId === adopted.runId).length === 1, deliveries2.items.length);
  const page2 = await channelPosts(since);
  const remoteReplies = page2?.posts && typeof page2.posts === "object" ? Object.values(page2.posts).filter((post) => post?.message === replyText && post?.root_id === rootPost.id && post?.user_id === bot.id) : [];
  check("restart-remote-reply-once", remoteReplies.length === 1, remoteReplies.length);
  const status2 = await client.call("connector.status", { connectorId: "mattermost" }, 10_000);
  check("restart-connected", status2.state === "CONNECTED" && status2.healthy === true, JSON.stringify(status2));
} catch (error) {
  liveFailure = error instanceof Error ? error.stack ?? error.message : String(error);
} finally {
  client?.close();
  await first?.close("step022c-live-cleanup").catch(() => undefined);
  await second?.close("step022c-live-cleanup").catch(() => undefined);
  await deletePost(botToken, botReply?.id);
  await deletePost(userToken, requestPost?.id);
  await deletePost(userToken, rootPost?.id);
  await rm(root, { recursive: true, force: true });
}
for (const name of LIVE_CHECK_NAMES) {
  if (!checkNames.has(name)) check(name, false, liveFailure ?? "STEP022C_LIVE_CHECK_NOT_REACHED");
}
check(
  "mattermost-live-vertical",
  liveFailure === null && LIVE_CHECK_NAMES.every((name) => checks.find((item) => item.name === name)?.passed === true),
  liveFailure ?? "complete",
);

const passed = checks.filter((item) => item.passed).length;
const expectedTotal = Number(String(contract.expectedChecks).split("/")[1]);
const state = passed === checks.length && checks.length === expectedTotal ? "PASSED" : "FAILED";
console.log(renderStep022cLiveMarker(contract, { passed, total: checks.length, state }));
for (const item of checks.filter((entry) => !entry.passed)) console.error(`OPENRILL_STEP022C_LIVE_FAILURE check=${item.name} detail=${item.detail}`);
if (checks.length !== expectedTotal) console.error(`OPENRILL_STEP022C_LIVE_FAILURE check=contract-count detail=${checks.length}`);
if (state !== "PASSED") process.exitCode = 1;
