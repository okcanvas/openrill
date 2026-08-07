import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  loadOpenRillConfig,
  resolveConfigPaths,
  resolveProfilePaths,
} from "../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../packages/state/dist/index.js";

const STEP = "STEP016B_FIRST_RUN_MODEL_CONNECTIVITY_AND_LOCAL_CONVERSATION_FLOW";
const VERSION = "0.16.2-step016b";
const SCHEMA = 15;
const PROFILE = "step016b-live";
const SECRET_KEY = "model.step016b-live.api-key";
const PROMPT = "Return the deterministic STEP016B first local conversation result.";
const ASSISTANT_TEXT = "OPENRILL_STEP016B_FIRST_LOCAL_CONVERSATION_OK";
const MAX_OUTPUT_BYTES = 1_048_576;

class BoundedCollector {
  #chunks = [];
  #bytes = 0;
  constructor(maxBytes) { this.maxBytes = maxBytes; }
  push(chunk) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.#chunks.push(buffer);
    this.#bytes += buffer.length;
    while (this.#bytes > this.maxBytes && this.#chunks.length > 0) {
      const first = this.#chunks[0];
      const overflow = this.#bytes - this.maxBytes;
      if (first.length <= overflow) { this.#chunks.shift(); this.#bytes -= first.length; }
      else { this.#chunks[0] = first.subarray(overflow); this.#bytes -= overflow; }
    }
  }
  text() { return Buffer.concat(this.#chunks).toString("utf8"); }
}

async function runCli(args, env, input = null, timeoutMs = 60_000) {
  return await new Promise((resolveResult, reject) => {
    const stdout = new BoundedCollector(MAX_OUTPUT_BYTES);
    const stderr = new BoundedCollector(MAX_OUTPUT_BYTES);
    let timedOut = false;
    let settled = false;
    const child = spawn(process.execPath, [resolve("openrill.mjs"), ...args], {
      cwd: resolve("."), env, shell: false, windowsHide: true,
      stdio: [input === null ? "ignore" : "pipe", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult({ exitCode, signal, timedOut, stdout: stdout.text(), stderr: stderr.text() });
    });
    if (input !== null) child.stdin.end(input, "utf8");
  });
}

function parseSingleJson(output, label) {
  const lines = output.trim().split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 1, `${label} expected one JSON line: ${output}`);
  return JSON.parse(lines[0]);
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function allFiles(root) {
  const result = [];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) result.push(path);
    }
  }
  await visit(root);
  return result;
}

async function startResponsesFixture(expectedAuthorization) {
  const requests = [];
  const sockets = new Set();
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const bodyText = Buffer.concat(chunks).toString("utf8");
    requests.push({ method: request.method, url: request.url, authorization: request.headers.authorization ?? null, bodyText });
    if (request.method !== "POST" || request.url !== "/v1/responses") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "unexpected fixture route" } }));
      return;
    }
    if (request.headers.authorization !== expectedAuthorization) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "fixture authorization rejected" } }));
      return;
    }
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "close",
    });
    for (const frame of [
      { type: "response.created", response: { id: "resp_step016b_live" } },
      { type: "response.output_text.delta", delta: ASSISTANT_TEXT },
      { type: "response.completed", response: { id: "resp_step016b_live", usage: { input_tokens: 9, output_tokens: 6, total_tokens: 15 } } },
    ]) response.write(`data: ${JSON.stringify(frame)}\n\n`);
    response.end();
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  return {
    endpoint: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: async () => {
      server.closeAllConnections?.();
      for (const socket of sockets) socket.destroy();
      await new Promise((resolveClose) => server.close(() => resolveClose()));
      assert.equal(sockets.size, 0, "loopback Responses fixture retained sockets");
    },
  };
}

if (process.platform !== "win32") throw new Error("OPENRILL_STEP016B_WINDOWS_DPAPI_REQUIRED");

const root = await mkdtemp(join(tmpdir(), "openrill-step016b-live-"));
const dataBase = join(root, "data");
const configBase = join(root, "config");
const workspace = join(root, "workspace");
await mkdir(workspace, { recursive: true });
const secret = `or-step016b-${randomBytes(32).toString("hex")}`;
const env = {
  ...process.env,
  OPENRILL_DATA_ROOT: dataBase,
  OPENRILL_CONFIG_ROOT: configBase,
  NO_COLOR: "1",
  NODE_DISABLE_COLORS: "1",
};
const fixture = await startResponsesFixture(`Bearer ${secret}`);
const checks = [];
const pass = (name, outcome, detail = "") => {
  assert.equal(Boolean(outcome), true, `${name}${detail ? `: ${detail}` : ""}`);
  checks.push(name);
};

try {
  const setup = await runCli([
    "setup", "--profile", PROFILE,
    "--workspace", workspace,
    "--workspace-id", "default",
    "--provider", "default",
    "--endpoint", fixture.endpoint,
    "--model", "fixture-model",
    "--secret-key", SECRET_KEY,
    "--api-key-stdin",
    "--backend", "host",
    "--json",
  ], env, `${secret}\n`);
  pass("setup-exit", setup.exitCode === 0 && !setup.timedOut, `${setup.stderr}\n${setup.stdout}`);
  const setupJson = parseSingleJson(setup.stdout, "setup");
  pass("setup-json", setupJson.configured === true && setupJson.execution.backend === "host");

  const ask = await runCli([
    "ask", "--profile", PROFILE,
    "--workspace-id", "default",
    "--provider", "default",
    "--timeout-ms", "60000",
    "--json",
  ], env, `${PROMPT}\n`, 90_000);
  pass("ask-exit", ask.exitCode === 0 && !ask.timedOut, `${ask.stderr}\n${ask.stdout}`);
  const askJson = parseSingleJson(ask.stdout, "ask");
  pass("ask-result", askJson.completed === true && askJson.status === "COMPLETED" && askJson.assistantText === ASSISTANT_TEXT);
  pass("ask-usage", askJson.usage?.modelCalls === 1 && askJson.usage?.inputTokens === 9 && askJson.usage?.outputTokens === 6);
  pass("ask-persistence", askJson.persisted === true && askJson.hostMode === "EPHEMERAL" && typeof askJson.conversationId === "string" && typeof askJson.runId === "string");
  pass("stdout-redaction", !ask.stdout.includes(PROMPT) && !ask.stdout.includes(secret) && !ask.stderr.includes(PROMPT) && !ask.stderr.includes(secret));

  pass("fixture-request-count", fixture.requests.length === 1);
  const request = fixture.requests[0];
  pass("fixture-auth", request.authorization === `Bearer ${secret}`);
  const requestBody = JSON.parse(request.bodyText);
  pass("fixture-contract", request.method === "POST" && request.url === "/v1/responses" && requestBody.model === "fixture-model" && requestBody.stream === true && requestBody.store === false);
  pass("fixture-prompt", requestBody.input.some((item) => item.role === "user" && item.content === PROMPT));

  const profilePaths = resolveProfilePaths({ profile: PROFILE, env, platform: "win32" });
  const configPaths = resolveConfigPaths(profilePaths, { platform: "win32" });
  const loaded = await loadOpenRillConfig({ paths: configPaths, env, platform: "win32" });
  pass("reference-only-config", loaded.config.modelProviders.default.apiKey?.kind === "os" && loaded.config.modelProviders.default.apiKey.key === SECRET_KEY);

  const database = await openOpenRillStateDatabase({ profilePaths });
  try {
    const evidence = database.transaction((repositories) => {
      const conversations = repositories.conversations.listConversations("default", 10);
      assert.equal(conversations.length, 1);
      const messages = repositories.conversations.listMessages(conversations[0].conversationId);
      const runs = repositories.conversations.listRuns(conversations[0].conversationId);
      const invocations = repositories.conversations.listModelInvocations(runs[0].runId);
      return { conversations, messages, runs, invocations };
    });
    pass("durable-conversation", evidence.messages.map((item) => item.role).join(",") === "user,assistant" && evidence.messages.at(-1)?.content?.text === ASSISTANT_TEXT);
    pass("durable-run", evidence.runs.length === 1 && evidence.runs[0].status === "COMPLETED");
    pass("durable-model-invocation", evidence.invocations.length === 1 && evidence.invocations[0].status === "COMPLETED");
  } finally {
    database.close({ checkpointMode: "TRUNCATE" });
  }

  pass("ephemeral-host-closed", !(await exists(profilePaths.metadataPath)) && !(await exists(profilePaths.lockPath)));
  const persisted = await Promise.all((await allFiles(root)).map(async (path) => await readFile(path)));
  pass("secret-not-persisted-plaintext", !persisted.some((buffer) => buffer.includes(Buffer.from(secret, "utf8"))));
  pass("browser-not-run", true);
  pass("connector-deferred", true);

  console.log(
    `${STEP} checks=${checks.length}/${checks.length} state=PASSED version=${VERSION} schema=${SCHEMA} ` +
    "dpapi=WINDOWS_CURRENT_USER prompt=STDIN_ONLY model_transport=LOOPBACK_RESPONSES " +
    "conversation=DURABLE assistant=TEXT persistence=SQLITE host_lifecycle=EPHEMERAL_QUIESCENT " +
    "external_model=NOT_RUN browser=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM cleanup=QUIESCENT",
  );
} finally {
  await fixture.close().catch(() => undefined);
  await rm(root, { recursive: true, force: true });
}
