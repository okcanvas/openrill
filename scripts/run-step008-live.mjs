import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { OPENRILL_STATE_SCHEMA_VERSION } from "../packages/state/dist/index.js";
const root = await mkdtemp(join(tmpdir(), "openrill-step008-live-"));
const profile = "live";
const workspaceRoot = join(root, "워크스페이스-긴-경로", "가".repeat(80));
const secretValue = `fixture-${randomBytes(32).toString("hex")}`;
await mkdir(join(workspaceRoot, "src"), { recursive: true });
await writeFile(join(workspaceRoot, "src", "input.txt"), "first line\nsecond line\nthird line\n", "utf8");

let providerRequests = 0;
let authorization = "";
const requestBodies = [];

function writeSse(response, events) {
  response.writeHead(200, { "content-type": "text/event-stream" });
  for (const event of events) response.write(`data: ${JSON.stringify(event)}\n\n`);
  response.end();
}

function toolEvents(requestNumber, callId, name, argumentsValue) {
  const argumentsJson = JSON.stringify(argumentsValue);
  return [
    { type: "response.created", response: { id: `response-${requestNumber}` } },
    { type: "response.output_item.added", item: { type: "function_call", call_id: callId, name, arguments: "" } },
    { type: "response.function_call_arguments.delta", call_id: callId, delta: argumentsJson.slice(0, Math.ceil(argumentsJson.length / 2)) },
    { type: "response.function_call_arguments.delta", call_id: callId, delta: argumentsJson.slice(Math.ceil(argumentsJson.length / 2)) },
    { type: "response.output_item.done", item: { type: "function_call", call_id: callId, name, arguments: argumentsJson } },
    { type: "response.completed", response: { id: `response-${requestNumber}`, usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 } } },
  ];
}

function toolOutputs(body) {
  return Array.isArray(body.input)
    ? body.input.filter((item) => item?.type === "function_call_output").map((item) => JSON.parse(item.output))
    : [];
}

const provider = createServer(async (request, response) => {
  authorization = String(request.headers.authorization ?? "");
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  requestBodies.push(body);
  providerRequests += 1;
  const toolNames = Array.isArray(body.tools) ? body.tools.map((tool) => tool.name).sort() : [];
  const expectedTools = ["process.cancel", "process.list", "process.run", "process.tail", "workspace.list", "workspace.patch", "workspace.read", "workspace.search", "workspace.stat", "workspace.write"];
  if (JSON.stringify(toolNames) !== JSON.stringify(expectedTools)) {
    response.writeHead(500, { "content-type": "text/plain" });
    response.end(`unexpected tools: ${JSON.stringify(toolNames)}`);
    return;
  }
  const outputs = toolOutputs(body);
  if (providerRequests === 1) {
    writeSse(response, toolEvents(1, "read-1", "workspace.read", { path: "src/input.txt", maxLines: 1, maxBytes: 64 }));
    return;
  }
  if (providerRequests === 2) {
    const readOutput = outputs.at(-1);
    if (readOutput?.name !== "workspace.read" || readOutput.isError || readOutput.output?.content !== "first line") {
      throw new Error(`read result was not returned to model: ${JSON.stringify(readOutput)}`);
    }
    writeSse(response, toolEvents(2, "write-1", "workspace.write", { path: "src/output.txt", content: "draft\n", expectedRevision: "MISSING" }));
    return;
  }
  if (providerRequests === 3) {
    const writeOutput = outputs.at(-1);
    if (writeOutput?.name !== "workspace.write" || writeOutput.isError || !/^sha256:[0-9a-f]{64}$/.test(writeOutput.output?.revision ?? "")) {
      throw new Error(`write result was not returned to model: ${JSON.stringify(writeOutput)}`);
    }
    writeSse(response, toolEvents(3, "patch-1", "workspace.patch", {
      path: "src/output.txt",
      expectedRevision: writeOutput.output.revision,
      replacements: [{ oldText: "draft", newText: "final" }],
    }));
    return;
  }
  if (providerRequests === 4) {
    const patchOutput = outputs.at(-1);
    if (patchOutput?.name !== "workspace.patch" || patchOutput.isError || patchOutput.output?.replacementsApplied !== 1) {
      throw new Error(`patch result was not returned to model: ${JSON.stringify(patchOutput)}`);
    }
    writeSse(response, [
      { type: "response.created", response: { id: "response-4" } },
      { type: "response.output_text.delta", delta: "Workspace file tools completed" },
      { type: "response.completed", response: { id: "response-4", usage: { input_tokens: 5, output_tokens: 4, total_tokens: 9 } } },
    ]);
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
  OPENRILL_STEP008_API_KEY: secretValue,
  NO_COLOR: "1",
  NODE_DISABLE_COLORS: "1",
  TERM: "dumb",
};
const source = join(env.OPENRILL_CONFIG_ROOT, profile, "agent.yaml");
await mkdir(dirname(source), { recursive: true });
await writeFile(source, `version: 1\nhost:\n  bind: 127.0.0.1\n  port: 0\nmodelProviders:\n  default:\n    type: openai-responses\n    endpoint: http://127.0.0.1:${providerAddress.port}/v1\n    apiKey:\n      kind: env\n      key: OPENRILL_STEP008_API_KEY\n    model: fixture-model\n    maxOutputTokens: 128\n    maxRetries: 1\nworkspaces:\n  - id: main\n    path: ${JSON.stringify(workspaceRoot)}\n`, "utf8");

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
  const child = spawn(process.execPath, ["openrill.mjs", "start", "--profile", profile], {
    cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"],
  });
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
    client: { id: "step008-live", version: "1", platform: process.platform, kind: "test" },
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

async function stop(child) {
  const command = spawn(process.execPath, ["openrill.mjs", "stop", "--profile", profile, "--json"], {
    cwd: process.cwd(), env, stdio: "ignore",
  });
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
  const created = await call(connection, "create", "conversation.create", { workspaceId: "main", modelProfile: "default", title: "Workspace live" });
  const sent = await call(connection, "send", "conversation.send", { workspaceId: "main", conversationId: created.conversationId, submissionKey: "live-send", text: "Read, write, and patch the configured workspace" });
  let view;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    view = await call(connection, `get-${attempt}`, "conversation.get", { workspaceId: "main", conversationId: created.conversationId });
    const run = view.runs.find((item) => item.runId === sent.run.runId);
    if (run?.status === "COMPLETED") break;
    if (run?.status === "FAILED" || run?.status === "CANCELLED") throw new Error(`run terminal failure: ${JSON.stringify(run)}\n${host.output()}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const run = view.runs.find((item) => item.runId === sent.run.runId);
  const assistant = view.messages.find((item) => item.role === "assistant" && item.content?.text === "Workspace file tools completed");
  if (run?.status !== "COMPLETED") throw new Error(`run did not complete: ${JSON.stringify(view)}\n${host.output()}`);
  if (!assistant) throw new Error(`assistant result missing: ${JSON.stringify(view.messages)}`);
  if (providerRequests !== 4 || authorization !== `Bearer ${secretValue}`) throw new Error("provider request count or point-of-use secret resolution failed");
  if (requestBodies.some((body) => body.store !== false)) throw new Error("provider request did not set store=false");
  if (await readFile(join(workspaceRoot, "src", "output.txt"), "utf8") !== "final\n") throw new Error("workspace patch output mismatch");
  connection.socket.close();
  await stop(host.child);

  const databasePath = join(env.OPENRILL_DATA_ROOT, profile, "state", "agent.db");
  const database = new DatabaseSync(databasePath, { readOnly: true });
  const identity = database.prepare("SELECT schema_version AS schemaVersion FROM state_identity WHERE id = 1").get();
  const workspace = database.prepare("SELECT workspace_id AS workspaceId, access_mode AS accessMode, trust_state AS trustState FROM workspace_registrations WHERE workspace_id = 'main'").get();
  const attempt = database.prepare("SELECT model_call_count AS modelCalls, tool_call_count AS toolCalls, status FROM run_attempts WHERE run_id = ?").get(sent.run.runId);
  const artifacts = database.prepare("SELECT kind, operation, relative_path AS relativePath FROM workspace_artifacts WHERE run_id = ? ORDER BY created_at, artifact_id").all(sent.run.runId);
  database.close();
  if (identity?.schemaVersion !== OPENRILL_STATE_SCHEMA_VERSION) throw new Error(`schema mismatch: ${JSON.stringify(identity)}`);
  if (workspace?.workspaceId !== "main" || workspace.accessMode !== "READ_WRITE" || workspace.trustState !== "CONFIGURED_LOCAL") throw new Error(`workspace ledger mismatch: ${JSON.stringify(workspace)}`);
  if (attempt?.status !== "COMPLETED" || attempt.modelCalls !== 4 || attempt.toolCalls !== 3) throw new Error(`attempt ledger mismatch: ${JSON.stringify(attempt)}`);
  if (artifacts.length !== 3 || artifacts.map((item) => item.operation).join(",") !== "READ,WRITE,PATCH") throw new Error(`artifact ledger mismatch: ${JSON.stringify(artifacts)}`);
  for (const row of artifacts) {
    if (row.relativePath && row.relativePath.includes(workspaceRoot)) throw new Error("artifact public reference leaked absolute root");
  }
  const databaseBytes = await readFile(databasePath);
  if (databaseBytes.includes(Buffer.from(secretValue, "utf8"))) throw new Error("secret value leaked into SQLite state");
  const artifactRoot = join(env.OPENRILL_DATA_ROOT, profile, "state", "workspace-artifacts");
  const artifactRootStat = await stat(artifactRoot);
  if (!artifactRootStat.isDirectory()) throw new Error("artifact root missing");
  process.stdout.write(`OPENRILL_STEP008_LIVE_PASS schema=${OPENRILL_STATE_SCHEMA_VERSION} workspace=CONFINED tools=READ_WRITE_PATCH artifacts=3 modelCalls=4 toolCalls=3 unicode=PASS secret=POINT_OF_USE
`);
} finally {
  host?.child.kill();
  await new Promise((resolve) => provider.close(resolve));
  await rm(root, { recursive: true, force: true });
}
