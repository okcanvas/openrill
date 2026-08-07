import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const root = await mkdtemp(join(tmpdir(), "openrill-step007-live-"));
const profile = "live";
let providerRequests = 0;
let authorization = "";
const provider = createServer(async (request, response) => {
  authorization = String(request.headers.authorization ?? "");
  await new Promise((resolve) => {
    request.resume();
    request.on("end", resolve);
  });
  providerRequests += 1;
  response.writeHead(200, { "content-type": "text/event-stream" });
  for (const event of [
    { type: "response.created", response: { id: `response-${providerRequests}` } },
    { type: "response.output_text.delta", delta: "OpenRill live model response" },
    { type: "response.completed", response: { id: `response-${providerRequests}`, usage: { input_tokens: 5, output_tokens: 4, total_tokens: 9 } } },
  ]) response.write(`data: ${JSON.stringify(event)}\n\n`);
  response.end();
});
await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
const providerAddress = provider.address();
const env = {
  ...process.env,
  OPENRILL_DATA_ROOT: join(root, "data"),
  OPENRILL_CONFIG_ROOT: join(root, "config"),
  OPENRILL_STEP007_API_KEY: "live-secret-value",
  NO_COLOR: "1",
  NODE_DISABLE_COLORS: "1",
};
const source = join(env.OPENRILL_CONFIG_ROOT, profile, "agent.yaml");
await mkdir(dirname(source), { recursive: true });
await writeFile(source, `version: 1\nhost:\n  bind: 127.0.0.1\n  port: 0\nmodelProviders:\n  default:\n    type: openai-responses\n    endpoint: http://127.0.0.1:${providerAddress.port}/v1\n    apiKey:\n      kind: env\n      key: OPENRILL_STEP007_API_KEY\n    model: fixture-model\n    maxOutputTokens: 128\n    maxRetries: 1\nworkspaces:\n  - id: alpha\n    path: .\n`, "utf8");

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
  return (predicate = () => true, timeoutMs = 4000) => {
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
  for (let attempt = 0; attempt < 200; attempt += 1) {
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
    client: { id: "step007-live", version: "1", platform: process.platform, kind: "test" },
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
  const created = await call(connection, "create", "conversation.create", { workspaceId: "alpha", modelProfile: "default", title: "Live model" });
  const sent = await call(connection, "send", "conversation.send", { workspaceId: "alpha", conversationId: created.conversationId, submissionKey: "live-send", text: "answer through the configured model" });
  let view;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    view = await call(connection, `get-${attempt}`, "conversation.get", { workspaceId: "alpha", conversationId: created.conversationId });
    const run = view.runs.find((item) => item.runId === sent.run.runId);
    if (run?.status === "COMPLETED") break;
    if (run?.status === "FAILED" || run?.status === "CANCELLED") throw new Error(`run terminal failure: ${JSON.stringify(run)}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const run = view.runs.find((item) => item.runId === sent.run.runId);
  const assistant = view.messages.find((item) => item.role === "assistant");
  if (run?.status !== "COMPLETED") throw new Error(`run did not complete: ${JSON.stringify(view)}`);
  if (assistant?.content?.text !== "OpenRill live model response") throw new Error(`assistant result missing: ${JSON.stringify(view.messages)}`);
  if (providerRequests !== 1 || authorization !== "Bearer live-secret-value") throw new Error("provider request or point-of-use secret resolution failed");
  connection.socket.close();
  await stop(host.child);
  process.stdout.write("OPENRILL_STEP007_LIVE_PASS schema=7 provider=OPENAI_RESPONSES run=COMPLETED assistant=PERSISTED secret=POINT_OF_USE\n");
} finally {
  host?.child.kill();
  await new Promise((resolve) => provider.close(resolve));
  await rm(root, { recursive: true, force: true });
}
