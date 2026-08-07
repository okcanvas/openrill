import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli, parseCliOptions } from "../../apps/agent-cli/dist/index.js";
import {
  createEphemeralOsSecretProviderForTests,
  loadOpenRillConfig,
  resolveConfigPaths,
  resolveProfilePaths,
} from "../../packages/config/dist/index.js";
import { inspectLocalHost, startLocalHost } from "../../services/agent-host/dist/index.js";

function io() {
  const stdout = [];
  const stderr = [];
  return { stdout, stderr, adapter: { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) } };
}

function runtime(env, cwd, provider, input = "") {
  return {
    env,
    cwd: () => cwd,
    platform: process.platform,
    readStdin: async () => input,
    osSecretProvider: provider,
    onSignal() {},
    offSignal() {},
  };
}

async function startResponsesFixture() {
  const requests = [];
  const sockets = new Set();
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const bodyText = Buffer.concat(chunks).toString("utf8");
    requests.push({ authorization: request.headers.authorization ?? null, body: JSON.parse(bodyText) });
    const text = `OPENRILL_STEP016C_TURN_${requests.length}`;
    response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "close" });
    for (const frame of [
      { type: "response.created", response: { id: `resp_step016c_${requests.length}` } },
      { type: "response.output_text.delta", delta: text },
      { type: "response.completed", response: { id: `resp_step016c_${requests.length}`, usage: { input_tokens: 10 + requests.length, output_tokens: 3, total_tokens: 13 + requests.length } } },
    ]) response.write(`data: ${JSON.stringify(frame)}\n\n`);
    response.end();
  });
  server.on("connection", (socket) => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.equal(typeof address, "object");
  return {
    endpoint: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: async () => {
      server.closeAllConnections?.();
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

async function configureProfile(root, profile, endpoint) {
  const workspace = join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config"), NO_COLOR: "1" };
  const secrets = createEphemeralOsSecretProviderForTests();
  const output = io();
  const code = await runCli([
    "setup", "--profile", profile, "--workspace", workspace, "--workspace-id", "default",
    "--provider", "default", "--endpoint", endpoint, "--model", "fixture-model", "--api-key-stdin", "--json",
  ], output.adapter, runtime(env, root, secrets, "fixture-key\n"));
  assert.equal(code, 0, output.stderr.join("\n"));
  return { workspace, env, secrets };
}

function parseJson(output) {
  assert.equal(output.stdout.length, 1, output.stderr.join("\n"));
  return JSON.parse(output.stdout[0]);
}

function userInputs(request) {
  return request.body.input.filter((item) => item.role === "user").map((item) => item.content);
}
function assistantInputs(request) {
  return request.body.input.filter((item) => item.role === "assistant").map((item) => item.content);
}

test("STEP016C CLI parses continuation and Conversation discovery without prompt argv", () => {
  const ask = parseCliOptions(["ask", "--conversation-id", "conversation-1", "--timeout-ms", "30000", "--json"]);
  assert.equal(ask.command, "ask");
  assert.equal(ask.conversationId, "conversation-1");
  assert.throws(() => parseCliOptions(["ask", "--conversation-id", "conversation-1", "--provider", "other"]), /does not accept --provider/);
  const list = parseCliOptions(["conversation", "list", "--workspace-id", "default", "--limit", "10", "--json"]);
  assert.equal(list.conversationAction, "list");
  assert.equal(list.conversationLimit, 10);
  const show = parseCliOptions(["conversation", "show", "conversation-1", "--json"]);
  assert.equal(show.conversationAction, "show");
  assert.equal(show.conversationId, "conversation-1");
  assert.throws(() => parseCliOptions(["conversation", "show"]), /requires a conversation id/);
});

test("STEP016C continues one durable Conversation across separate ephemeral Host lifecycles", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step016c-ephemeral-"));
  const fixture = await startResponsesFixture();
  try {
    const { env, secrets } = await configureProfile(root, "step016c-ephemeral", fixture.endpoint);
    const firstOut = io();
    const firstPrompt = "first durable turn";
    assert.equal(await runCli(["ask", "--profile", "step016c-ephemeral", "--json"], firstOut.adapter, runtime(env, root, secrets, `${firstPrompt}\n`)), 0, firstOut.stderr.join("\n"));
    const first = parseJson(firstOut);
    assert.equal(first.hostMode, "EPHEMERAL");
    assert.equal(first.assistantText, "OPENRILL_STEP016C_TURN_1");

    const secondOut = io();
    const secondPrompt = "second durable turn";
    assert.equal(await runCli(["ask", "--profile", "step016c-ephemeral", "--conversation-id", first.conversationId, "--json"], secondOut.adapter, runtime(env, root, secrets, `${secondPrompt}\n`)), 0, secondOut.stderr.join("\n"));
    const second = parseJson(secondOut);
    assert.equal(second.hostMode, "EPHEMERAL");
    assert.equal(second.conversationId, first.conversationId);
    assert.equal(second.messageCount, 4);
    assert.equal(second.assistantText, "OPENRILL_STEP016C_TURN_2");
    assert.deepEqual(userInputs(fixture.requests[1]), [firstPrompt, secondPrompt]);
    assert.deepEqual(assistantInputs(fixture.requests[1]), ["OPENRILL_STEP016C_TURN_1"]);
  } finally {
    await fixture.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("STEP016C attaches to a READY running Host, preserves it, and exposes list/show", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step016c-attached-"));
  const fixture = await startResponsesFixture();
  let host = null;
  try {
    const profile = "step016c-attached";
    const { env, secrets } = await configureProfile(root, profile, fixture.endpoint);
    const paths = resolveProfilePaths({ profile, env, platform: process.platform });
    const loaded = await loadOpenRillConfig({ paths: resolveConfigPaths(paths, { platform: process.platform }), env, platform: process.platform, osSecretProvider: secrets });
    host = await startLocalHost({ profile, port: 0, env, config: loaded.config, configRoot: paths.configRoot, workspaceIds: ["default"], osSecretProvider: secrets });
    await host.ready;

    const firstOut = io();
    assert.equal(await runCli(["ask", "--profile", profile, "--json"], firstOut.adapter, runtime(env, root, secrets, "attached turn one\n")), 0, firstOut.stderr.join("\n"));
    const first = parseJson(firstOut);
    assert.equal(first.hostMode, "RUNNING_ATTACHED");
    assert.equal(first.attachedInstanceId, host.status().instanceId);
    assert.equal((await inspectLocalHost(paths)).running, true);

    const secondOut = io();
    assert.equal(await runCli(["ask", "--profile", profile, "--conversation-id", first.conversationId, "--json"], secondOut.adapter, runtime(env, root, secrets, "attached turn two\n")), 0, secondOut.stderr.join("\n"));
    const second = parseJson(secondOut);
    assert.equal(second.hostMode, "RUNNING_ATTACHED");
    assert.equal(second.conversationId, first.conversationId);
    assert.equal((await inspectLocalHost(paths)).running, true);

    const listOut = io();
    assert.equal(await runCli(["conversation", "list", "--profile", profile, "--json"], listOut.adapter, runtime(env, root, secrets)), 0, listOut.stderr.join("\n"));
    const listed = parseJson(listOut);
    assert.equal(listed.hostMode, "RUNNING_ATTACHED");
    assert.equal(listed.items.length, 1);
    assert.equal(listed.items[0].conversationId, first.conversationId);

    const showOut = io();
    assert.equal(await runCli(["conversation", "show", first.conversationId, "--profile", profile, "--json"], showOut.adapter, runtime(env, root, secrets)), 0, showOut.stderr.join("\n"));
    const shown = parseJson(showOut);
    assert.equal(shown.conversation.messages.length, 4);
    assert.equal(shown.conversation.runs.length, 2);
    assert.equal((await inspectLocalHost(paths)).running, true);
  } finally {
    await host?.close("step016c-test-complete");
    await fixture.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("STEP016C rejects cross-workspace continuation through the existing Conversation boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step016c-workspace-"));
  const fixture = await startResponsesFixture();
  try {
    const { env, secrets } = await configureProfile(root, "step016c-workspace", fixture.endpoint);
    const firstOut = io();
    assert.equal(await runCli(["ask", "--profile", "step016c-workspace", "--json"], firstOut.adapter, runtime(env, root, secrets, "workspace turn\n")), 0);
    const first = parseJson(firstOut);
    const output = io();
    const code = await runCli(["ask", "--profile", "step016c-workspace", "--workspace-id", "other", "--conversation-id", first.conversationId, "--json"], output.adapter, runtime(env, root, secrets, "blocked turn\n"));
    assert.equal(code, 22);
    assert.match(output.stderr.join("\n"), /workspace is not configured/);
    assert.equal(fixture.requests.length, 1);
  } finally {
    await fixture.close();
    await rm(root, { recursive: true, force: true });
  }
});
