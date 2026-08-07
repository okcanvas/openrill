import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { OPENRILL_STATE_SCHEMA_VERSION } from "../packages/state/dist/index.js";
const root = await mkdtemp(join(tmpdir(), "openrill-step010-live-"));
const profile = "live";
const workspaceRoot = join(root, "workspace");
const skillRoot = join(root, "managed-skills");
const skillDirectory = join(skillRoot, "immutable-live");
const instructionsPath = join(skillDirectory, "instructions.md");
const markerOne = `skill-one-${randomBytes(16).toString("hex")}`;
const markerTwo = `skill-two-${randomBytes(16).toString("hex")}`;
const apiSecret = randomBytes(32).toString("base64url");
await mkdir(join(workspaceRoot, "src"), { recursive: true });
await mkdir(skillDirectory, { recursive: true });
await writeFile(join(workspaceRoot, "src", "input.txt"), "skill live input\n", "utf8");
await writeFile(join(skillDirectory, "skill.yaml"), `id: immutable-live\nversion: 1.0.0\ndescription: Verify immutable Skill Run snapshots in the live Host.\nactivation:\n  - activate immutable skill\ninstructions: instructions.md\ntools:\n  - workspace.read\nresources:\ncompatibility:\n  minOpenRill: 0.10.0-step010\n`, "utf8");
await writeFile(instructionsPath, `Use ${markerOne} and read the requested workspace file.\n`, "utf8");

let requestCount = 0;
const requestBodies = [];
let authorization = "";

function writeSse(response, events) {
  response.writeHead(200, { "content-type": "text/event-stream" });
  for (const event of events) response.write(`data: ${JSON.stringify(event)}\n\n`);
  response.end();
}

function toolEvents(callId) {
  const argumentsJson = JSON.stringify({ path: "src/input.txt", maxLines: 4, maxBytes: 128 });
  return [
    { type: "response.created", response: { id: "step010-response-1" } },
    { type: "response.output_item.added", item: { type: "function_call", call_id: callId, name: "workspace.read", arguments: "" } },
    { type: "response.function_call_arguments.delta", call_id: callId, delta: argumentsJson },
    { type: "response.output_item.done", item: { type: "function_call", call_id: callId, name: "workspace.read", arguments: argumentsJson } },
    { type: "response.completed", response: { id: "step010-response-1", usage: { input_tokens: 7, output_tokens: 3, total_tokens: 10 } } },
  ];
}

function textEvents(id, text) {
  return [
    { type: "response.created", response: { id } },
    { type: "response.output_text.delta", delta: text },
    { type: "response.completed", response: { id, usage: { input_tokens: 7, output_tokens: 3, total_tokens: 10 } } },
  ];
}

const provider = createServer(async (request, response) => {
  authorization = String(request.headers.authorization ?? "");
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  requestBodies.push(body);
  requestCount += 1;
  const instructions = String(body.instructions ?? "");
  if (requestCount === 1) {
    if (!instructions.includes(markerOne) || instructions.includes(markerTwo)) throw new Error("first Run did not receive initial Skill instructions");
    await writeFile(instructionsPath, `Use ${markerTwo} and report the refreshed Skill.\n`, "utf8");
    writeSse(response, toolEvents("skill-read-1"));
    return;
  }
  if (requestCount === 2) {
    if (!instructions.includes(markerOne) || instructions.includes(markerTwo)) throw new Error("mid-Run Skill source edit changed current Run instructions");
    const outputs = Array.isArray(body.input) ? body.input.filter((item) => item?.type === "function_call_output") : [];
    if (outputs.length !== 1 || !String(outputs[0].output).includes("skill live input")) throw new Error("Skill Tool result was not returned to the model");
    writeSse(response, textEvents("step010-response-2", "First immutable Skill Run completed"));
    return;
  }
  if (requestCount === 3) {
    if (!instructions.includes(markerTwo) || instructions.includes(markerOne)) throw new Error("next Run did not refresh Skill instructions");
    writeSse(response, textEvents("step010-response-3", "Second refreshed Skill Run completed"));
    return;
  }
  response.writeHead(500, { "content-type": "text/plain" });
  response.end("unexpected provider request");
});
await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
const providerAddress = provider.address();

const env = {
  ...process.env,
  OPENRILL_DATA_ROOT: join(root, "data"),
  OPENRILL_CONFIG_ROOT: join(root, "config"),
  OPENRILL_STEP010_PROVIDER_TOKEN: apiSecret,
  NO_COLOR: "1",
  NODE_DISABLE_COLORS: "1",
  TERM: "dumb",
};
const configPath = join(env.OPENRILL_CONFIG_ROOT, profile, "agent.yaml");
await mkdir(dirname(configPath), { recursive: true });
await writeFile(configPath, `version: 1\nhost:\n  bind: 127.0.0.1\n  port: 0\nmodelProviders:\n  default:\n    type: openai-responses\n    endpoint: http://127.0.0.1:${providerAddress.port}/v1\n    apiKey:\n      kind: env\n      key: OPENRILL_STEP010_PROVIDER_TOKEN\n    model: fixture-model\n    maxOutputTokens: 128\n    maxRetries: 1\nworkspaces:\n  - id: main\n    path: ${JSON.stringify(workspaceRoot)}\nskills:\n  roots:\n    - ${JSON.stringify(skillRoot)}\n  enabled:\n    - immutable-live\n`, "utf8");

function collector(socket) {
  const queued = [];
  const waiters = [];
  socket.addEventListener("message", (event) => {
    const frame = JSON.parse(String(event.data));
    const index = waiters.findIndex((waiter) => waiter.predicate(frame));
    if (index >= 0) {
      const [waiter] = waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(frame);
    } else queued.push(frame);
  });
  return (predicate = () => true, timeoutMs = 5000) => {
    const index = queued.findIndex(predicate);
    if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("frame timeout")), timeoutMs);
      waiters.push({ predicate, resolve, reject, timer });
    });
  };
}

async function launch() {
  const child = spawn(process.execPath, ["openrill.mjs", "start", "--profile", profile], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const metadataPath = join(env.OPENRILL_DATA_ROOT, profile, "runtime", "host.json");
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Host exited ${child.exitCode}: ${output}`);
    try { return { child, metadata: JSON.parse(await readFile(metadataPath, "utf8")), output: () => output }; }
    catch { await new Promise((resolve) => setTimeout(resolve, 25)); }
  }
  throw new Error(`Host metadata timeout: ${output}`);
}

async function connect(metadata) {
  const socket = new WebSocket(`ws://127.0.0.1:${metadata.port}/protocol`, "openrill.local.v1");
  const next = collector(socket);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.send(JSON.stringify({
    type: "open", minProtocol: 1, maxProtocol: 1,
    client: { id: "step010-live", version: "1", platform: process.platform, kind: "test" },
    credential: { kind: "profile-token", token: metadata.protocolToken },
  }));
  await next((frame) => frame.type === "accepted");
  return { socket, next };
}

async function call(connection, callId, operation, input) {
  connection.socket.send(JSON.stringify({ type: "call", callId, idempotencyKey: callId, operation, input }));
  const result = await connection.next((frame) => frame.type === "result" && frame.callId === callId);
  if (!result.ok) throw new Error(`${operation} failed: ${JSON.stringify(result)}`);
  return result.output;
}

async function waitRun(connection, workspaceId, conversationId, runId) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const view = await call(connection, `get-${runId}-${attempt}`, "conversation.get", { workspaceId, conversationId });
    const run = view.runs.find((item) => item.runId === runId);
    if (run?.status === "COMPLETED") return view;
    if (run?.status === "FAILED" || run?.status === "CANCELLED") throw new Error(`Run failed: ${JSON.stringify(run)}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Run completion timeout: ${runId}`);
}

async function stop(child) {
  const command = spawn(process.execPath, ["openrill.mjs", "stop", "--profile", profile, "--json"], { cwd: process.cwd(), env, stdio: "ignore" });
  await new Promise((resolve, reject) => command.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`stop exit ${code}`))));
  if (child.exitCode === null) await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error("Host exit timeout")); }, 5000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

let host;
try {
  host = await launch();
  const connection = await connect(host.metadata);
  const created = await call(connection, "create", "conversation.create", { workspaceId: "main", modelProfile: "default", title: "Skill live" });
  const firstSend = await call(connection, "send-one", "conversation.send", { workspaceId: "main", conversationId: created.conversationId, submissionKey: "skill-live-one", text: "Please activate immutable skill" });
  const firstView = await waitRun(connection, "main", created.conversationId, firstSend.run.runId);
  if (!firstView.messages.some((message) => message.role === "assistant" && message.content?.text === "First immutable Skill Run completed")) throw new Error("first Skill assistant result missing");
  const secondSend = await call(connection, "send-two", "conversation.send", { workspaceId: "main", conversationId: created.conversationId, submissionKey: "skill-live-two", text: "Please activate immutable skill again" });
  const secondView = await waitRun(connection, "main", created.conversationId, secondSend.run.runId);
  if (!secondView.messages.some((message) => message.role === "assistant" && message.content?.text === "Second refreshed Skill Run completed")) throw new Error("second Skill assistant result missing");
  connection.socket.close();
  await stop(host.child);

  if (requestCount !== 3 || authorization !== `Bearer ${apiSecret}`) throw new Error("provider requests or point-of-use SecretRef failed");
  if (requestBodies.some((body) => body.store !== false)) throw new Error("provider request did not set store=false");
  const databasePath = join(env.OPENRILL_DATA_ROOT, profile, "state", "agent.db");
  const database = new DatabaseSync(databasePath, { readOnly: true });
  const identity = database.prepare("SELECT schema_version schemaVersion FROM state_identity WHERE id=1").get();
  const contexts = database.prepare("SELECT run_id runId,catalog_hash catalogHash,selected_skill_ids_json selectedIds FROM skill_run_contexts ORDER BY resolved_at,run_id").all();
  const snapshots = database.prepare("SELECT run_id runId,skill_id skillId,content_hash contentHash,storage_path storagePath FROM skill_snapshots ORDER BY captured_at,run_id").all();
  const sourceCount = database.prepare("SELECT count(*) count FROM skill_sources").get().count;
  const diagnostics = database.prepare("SELECT count(*) count FROM skill_validation_diagnostics").get().count;
  database.close();
  if (identity?.schemaVersion !== OPENRILL_STATE_SCHEMA_VERSION) throw new Error(`schema mismatch: ${JSON.stringify(identity)}`);
  if (contexts.length !== 2 || snapshots.length !== 2 || sourceCount < 1 || diagnostics !== 0) throw new Error(`Skill ledger mismatch: ${JSON.stringify({ contexts, snapshots, sourceCount, diagnostics })}`);
  if (snapshots[0].contentHash === snapshots[1].contentHash) throw new Error("next Run Skill content hash did not change");
  const firstSnapshotInstructions = await readFile(join(env.OPENRILL_DATA_ROOT, profile, "state", snapshots[0].storagePath, "instructions.md"), "utf8");
  const secondSnapshotInstructions = await readFile(join(env.OPENRILL_DATA_ROOT, profile, "state", snapshots[1].storagePath, "instructions.md"), "utf8");
  if (!firstSnapshotInstructions.includes(markerOne) || firstSnapshotInstructions.includes(markerTwo)) throw new Error("first immutable snapshot content mismatch");
  if (!secondSnapshotInstructions.includes(markerTwo) || secondSnapshotInstructions.includes(markerOne)) throw new Error("second refreshed snapshot content mismatch");
  const databaseBytes = await readFile(databasePath);
  if (databaseBytes.includes(Buffer.from(apiSecret, "utf8"))) throw new Error("provider Secret leaked into SQLite");
  process.stdout.write(`OPENRILL_STEP010_LIVE_PASS schema=${OPENRILL_STATE_SCHEMA_VERSION} skills=DISCOVERED precedence=WORKSPACE_USER_BUNDLED snapshot=IMMUTABLE midRun=IGNORED nextRun=REFRESHED modelCalls=3 toolCalls=1 secret=POINT_OF_USE
`);
} finally {
  host?.child.kill();
  await new Promise((resolve) => provider.close(resolve));
  await rm(root, { recursive: true, force: true });
}
