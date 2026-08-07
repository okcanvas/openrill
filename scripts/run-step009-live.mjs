import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { OPENRILL_STATE_SCHEMA_VERSION } from "../packages/state/dist/index.js";
const root = await mkdtemp(join(tmpdir(), "openrill-step009-live-"));
const profile = "live";
const workspaceRoot = join(root, "프로세스-워크스페이스", "나".repeat(60));
const apiSecret = `api-${randomBytes(32).toString("hex")}`;
const processSecret = `process-${randomBytes(32).toString("hex")}`;
await mkdir(workspaceRoot, { recursive: true });
let providerRequests = 0;
let authorization = "";
const requestBodies = [];

function writeSse(response, events) {
  response.writeHead(200, { "content-type": "text/event-stream" });
  for (const event of events) response.write(`data: ${JSON.stringify(event)}\n\n`);
  response.end();
}
function toolEvents(callId, name, argumentsValue) {
  const json = JSON.stringify(argumentsValue);
  return [
    { type: "response.created", response: { id: "response-1" } },
    { type: "response.output_item.added", item: { type: "function_call", call_id: callId, name, arguments: "" } },
    { type: "response.function_call_arguments.delta", call_id: callId, delta: json.slice(0, Math.ceil(json.length / 2)) },
    { type: "response.function_call_arguments.delta", call_id: callId, delta: json.slice(Math.ceil(json.length / 2)) },
    { type: "response.output_item.done", item: { type: "function_call", call_id: callId, name, arguments: json } },
    { type: "response.completed", response: { id: "response-1", usage: { input_tokens: 6, output_tokens: 3, total_tokens: 9 } } },
  ];
}
function toolOutputs(body) {
  return Array.isArray(body.input) ? body.input.filter((item) => item?.type === "function_call_output").map((item) => JSON.parse(item.output)) : [];
}
const provider = createServer(async (request, response) => {
  authorization = String(request.headers.authorization ?? "");
  const chunks = []; for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  requestBodies.push(body); providerRequests += 1;
  const toolNames = Array.isArray(body.tools) ? body.tools.map((tool) => tool.name).sort() : [];
  const expected = ["process.cancel", "process.list", "process.run", "process.tail", "workspace.list", "workspace.patch", "workspace.read", "workspace.search", "workspace.stat", "workspace.write"];
  if (JSON.stringify(toolNames) !== JSON.stringify(expected)) { response.writeHead(500); response.end(`unexpected tools ${JSON.stringify(toolNames)}`); return; }
  if (providerRequests === 1) {
    writeSse(response, toolEvents("process-call-1", "process.run", {
      command: { kind: "argv", executable: process.execPath, args: ["-e", "console.log(process.env.CHECK?.startsWith('process-') ? '프로세스 승인 실행' : 'secret-missing')"] },
      env: { secrets: { CHECK: { kind: "env", key: "OPENRILL_STEP009_PROCESS_SECRET" } } },
      background: false,
    }));
    return;
  }
  if (providerRequests === 2) {
    const output = toolOutputs(body).at(-1);
    if (output?.name !== "process.run" || output.isError || output.output?.status !== "EXITED" || !String(output.output?.stdout).includes("프로세스 승인 실행")) {
      throw new Error(`approved process result missing: ${JSON.stringify(output)}`);
    }
    writeSse(response, [
      { type: "response.created", response: { id: "response-2" } },
      { type: "response.output_text.delta", delta: "Approved process completed" },
      { type: "response.completed", response: { id: "response-2", usage: { input_tokens: 5, output_tokens: 4, total_tokens: 9 } } },
    ]);
    return;
  }
  response.writeHead(500); response.end("unexpected provider request");
});
await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
const providerAddress = provider.address();
const env = { ...process.env, OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config"), OPENRILL_STEP009_API_KEY: apiSecret, OPENRILL_STEP009_PROCESS_SECRET: processSecret, NO_COLOR: "1", NODE_DISABLE_COLORS: "1", TERM: "dumb" };
const source = join(env.OPENRILL_CONFIG_ROOT, profile, "agent.yaml");
await mkdir(dirname(source), { recursive: true });
await writeFile(source, `version: 1\nhost:\n  bind: 127.0.0.1\n  port: 0\nmodelProviders:\n  default:\n    type: openai-responses\n    endpoint: http://127.0.0.1:${providerAddress.port}/v1\n    apiKey:\n      kind: env\n      key: OPENRILL_STEP009_API_KEY\n    model: fixture-model\n    maxOutputTokens: 128\n    maxRetries: 1\nworkspaces:\n  - id: main\n    path: ${JSON.stringify(workspaceRoot)}\nexecution:\n  approvalMode: ask\n  defaultTimeoutMs: 5000\n`, "utf8");

function collector(socket) {
  const queued = [], waiters = [];
  socket.addEventListener("message", (event) => { const frame = JSON.parse(String(event.data)); const index = waiters.findIndex((w) => w.predicate(frame)); if (index >= 0) { const [w] = waiters.splice(index, 1); clearTimeout(w.timer); w.resolve(frame); } else queued.push(frame); });
  return (predicate = () => true, timeoutMs = 7000) => { const index = queued.findIndex(predicate); if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]); return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("frame timeout")), timeoutMs); waiters.push({ predicate, resolve, reject, timer }); }); };
}
async function launch() {
  const child = spawn(process.execPath, ["openrill.mjs", "start", "--profile", profile], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
  let output = ""; child.stdout.on("data", (c) => { output += c; }); child.stderr.on("data", (c) => { output += c; });
  const metadataPath = join(env.OPENRILL_DATA_ROOT, profile, "runtime", "host.json");
  for (let i = 0; i < 240; i += 1) { if (child.exitCode !== null) throw new Error(`Host exited ${child.exitCode}: ${output}`); try { return { child, metadata: JSON.parse(await readFile(metadataPath, "utf8")), output: () => output }; } catch { await new Promise((r) => setTimeout(r, 25)); } }
  throw new Error(`Host metadata timeout: ${output}`);
}
async function connect(metadata) {
  const socket = new WebSocket(`ws://127.0.0.1:${metadata.port}/protocol`, "openrill.local.v1"); const next = collector(socket);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.send(JSON.stringify({ type: "open", minProtocol: 1, maxProtocol: 1, client: { id: "step009-live", version: "1", platform: process.platform, kind: "test" }, credential: { kind: "profile-token", token: metadata.protocolToken } }));
  const accepted = await next((f) => f.type === "accepted");
  for (const name of ["approval.get", "approval.list", "approval.resolve", "approval.cancel"]) if (!accepted.capabilities.operations.some((item) => item.name === name)) throw new Error(`missing capability ${name}`);
  return { socket, next };
}
async function call(connection, callId, operation, input) {
  connection.socket.send(JSON.stringify({ type: "call", callId, idempotencyKey: callId, operation, input }));
  const result = await connection.next((f) => f.type === "result" && f.callId === callId);
  if (!result.ok) throw new Error(`${operation} failed: ${JSON.stringify(result)}`); return result.output;
}
async function stop(child) {
  const command = spawn(process.execPath, ["openrill.mjs", "stop", "--profile", profile, "--json"], { cwd: process.cwd(), env, stdio: "ignore" });
  await new Promise((resolve, reject) => command.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`stop exit ${code}`))));
  if (child.exitCode === null) await new Promise((resolve, reject) => { const timer = setTimeout(() => { child.kill(); reject(new Error("Host exit timeout")); }, 5000); child.once("exit", () => { clearTimeout(timer); resolve(); }); });
}
let host;
try {
  host = await launch(); const connection = await connect(host.metadata);
  const created = await call(connection, "create", "conversation.create", { workspaceId: "main", modelProfile: "default", title: "Approval live" });
  const sent = await call(connection, "send", "conversation.send", { workspaceId: "main", conversationId: created.conversationId, submissionKey: "live-send", text: "Run the approved process" });
  let waiting = false;
  for (let i = 0; i < 240; i += 1) { const view = await call(connection, `wait-${i}`, "conversation.get", { workspaceId: "main", conversationId: created.conversationId }); const run = view.runs.find((item) => item.runId === sent.run.runId); if (run?.status === "WAITING_APPROVAL") { waiting = true; break; } if (["FAILED", "CANCELLED", "COMPLETED"].includes(run?.status)) throw new Error(`unexpected pre-approval terminal: ${JSON.stringify(run)}\n${host.output()}`); await new Promise((r) => setTimeout(r, 25)); }
  if (!waiting) throw new Error(`run never waited for approval: ${host.output()}`);
  const pending = await call(connection, "approval-list", "approval.list", { status: "PENDING" });
  if (pending.items.length !== 1) throw new Error(`pending approval mismatch: ${JSON.stringify(pending)}`);
  const request = pending.items[0];
  const dbPath = join(env.OPENRILL_DATA_ROOT, profile, "state", "agent.db");
  let check = new DatabaseSync(dbPath, { readOnly: true });
  if (check.prepare("SELECT count(*) count FROM process_records").get().count !== 0) throw new Error("process started before approval"); check.close();
  const resolved = await call(connection, "approval-resolve", "approval.resolve", { requestId: request.requestId, expectedVersion: request.version, decision: "allow_once" });
  if (resolved.request.status !== "CONSUMED") throw new Error(`approval was not consumed: ${JSON.stringify(resolved)}`);
  let finalView;
  for (let i = 0; i < 240; i += 1) { finalView = await call(connection, `done-${i}`, "conversation.get", { workspaceId: "main", conversationId: created.conversationId }); const run = finalView.runs.find((item) => item.runId === sent.run.runId); if (run?.status === "COMPLETED") break; if (["FAILED", "CANCELLED"].includes(run?.status)) throw new Error(`run terminal failure: ${JSON.stringify(run)}\n${host.output()}`); await new Promise((r) => setTimeout(r, 25)); }
  const run = finalView.runs.find((item) => item.runId === sent.run.runId);
  if (run?.status !== "COMPLETED" || !finalView.messages.some((item) => item.role === "assistant" && item.content?.text === "Approved process completed")) throw new Error(`resumed result missing: ${JSON.stringify(finalView)}\n${host.output()}`);
  if (providerRequests !== 2 || authorization !== `Bearer ${apiSecret}` || requestBodies.some((body) => body.store !== false)) throw new Error("provider/secret contract failed");
  connection.socket.close(); await stop(host.child);
  check = new DatabaseSync(dbPath, { readOnly: true });
  const identity = check.prepare("SELECT schema_version schemaVersion FROM state_identity WHERE id=1").get();
  const approval = check.prepare("SELECT status,decision,consumed_at consumedAt FROM approval_requests WHERE request_id=?").get(request.requestId);
  const tool = check.prepare("SELECT status,error_code errorCode FROM tool_calls WHERE run_id=?").get(sent.run.runId);
  const processRow = check.prepare("SELECT status,command_kind commandKind,cwd_relative cwdRelative,exit_code exitCode FROM process_records WHERE run_id=?").get(sent.run.runId);
  const attempt = check.prepare("SELECT status,model_call_count modelCalls,tool_call_count toolCalls FROM run_attempts WHERE run_id=?").get(sent.run.runId);
  check.close();
  if (identity.schemaVersion !== OPENRILL_STATE_SCHEMA_VERSION || approval.status !== "CONSUMED" || approval.decision !== "allow_once" || !approval.consumedAt) throw new Error(`approval ledger mismatch ${JSON.stringify({identity,approval})}`);
  if (tool.status !== "COMPLETED" || tool.errorCode !== null || processRow.status !== "EXITED" || processRow.commandKind !== "ARGV" || processRow.cwdRelative !== "" || processRow.exitCode !== 0) throw new Error(`process ledger mismatch ${JSON.stringify({tool,processRow})}`);
  if (attempt.status !== "COMPLETED" || attempt.modelCalls !== 2 || attempt.toolCalls !== 1) throw new Error(`attempt mismatch ${JSON.stringify(attempt)}`);
  const bytes = await readFile(dbPath); if (bytes.includes(Buffer.from(apiSecret)) || bytes.includes(Buffer.from(processSecret))) throw new Error("secret literal leaked into SQLite");
  process.stdout.write(`OPENRILL_STEP009_LIVE_PASS schema=${OPENRILL_STATE_SCHEMA_VERSION} approval=WAIT_RESUME decision=ALLOW_ONCE process=ARGV_FOREGROUND toolCalls=1 modelCalls=2 secret=POINT_OF_USE
`);
} finally {
  host?.child.kill(); await new Promise((resolve) => provider.close(resolve)); await rm(root, { recursive: true, force: true });
}
