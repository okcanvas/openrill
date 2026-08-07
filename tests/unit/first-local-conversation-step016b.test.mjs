import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli, parseCliOptions } from "../../apps/agent-cli/dist/index.js";
import {
  createEphemeralOsSecretProviderForTests,
  resolveProfilePaths,
} from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";

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

async function startResponsesFixture(options = {}) {
  const requests = [];
  const expectedAuthorization = options.expectedAuthorization ?? "Bearer fixture-key";
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const bodyText = Buffer.concat(chunks).toString("utf8");
    requests.push({ url: request.url, authorization: request.headers.authorization ?? null, bodyText });
    if (request.headers.authorization !== expectedAuthorization) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "fixture authorization rejected" } }));
      return;
    }
    response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" });
    const text = options.text ?? "OPENRILL_FIRST_LOCAL_CONVERSATION_OK";
    const frames = [
      { type: "response.created", response: { id: "resp_step016b_fixture" } },
      { type: "response.output_text.delta", delta: text },
      { type: "response.completed", response: { id: "resp_step016b_fixture", usage: { input_tokens: 7, output_tokens: 5, total_tokens: 12 } } },
    ];
    for (const frame of frames) response.write(`data: ${JSON.stringify(frame)}\n\n`);
    response.end();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  return {
    endpoint: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: async () => await new Promise((resolve) => server.close(() => resolve())),
  };
}

async function configureProfile({ root, profile, endpoint, secretValue }) {
  const workspace = join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config"), NO_COLOR: "1" };
  const secrets = createEphemeralOsSecretProviderForTests();
  const output = io();
  const code = await runCli([
    "setup", "--profile", profile, "--workspace", workspace,
    "--workspace-id", "default", "--provider", "default",
    "--endpoint", endpoint, "--model", "fixture-model", "--api-key-stdin", "--json",
  ], output.adapter, runtime(env, root, secrets, `${secretValue}\n`));
  assert.equal(code, 0, output.stderr.join("\n"));
  return { workspace, env, secrets };
}

test("STEP016B ask reads stdin and rejects prompt argv or setup mutation options", () => {
  const parsed = parseCliOptions(["ask", "--profile", "local", "--workspace-id", "default", "--provider", "default", "--timeout-ms", "30000", "--json"]);
  assert.equal(parsed.command, "ask");
  assert.equal(parsed.timeoutMs, 30000);
  assert.throws(() => parseCliOptions(["ask", "--endpoint", "https://example.invalid/v1"]), /ask accepts only/);
  assert.throws(() => parseCliOptions(["ask", "literal prompt"]), /unknown option/);
});

test("STEP016B runs a durable first local Conversation through the real Host and Responses adapter", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step016b-conversation-"));
  const fixture = await startResponsesFixture();
  try {
    const { env, secrets } = await configureProfile({ root, profile: "first-run", endpoint: fixture.endpoint, secretValue: "fixture-key" });
    const output = io();
    const prompt = "Return one bounded fixture response without tools.";
    const code = await runCli([
      "ask", "--profile", "first-run", "--workspace-id", "default", "--provider", "default", "--timeout-ms", "30000", "--json",
    ], output.adapter, runtime(env, root, secrets, `${prompt}\n`));
    assert.equal(code, 0, output.stderr.join("\n"));
    assert.equal(output.stdout.length, 1);
    const result = JSON.parse(output.stdout[0]);
    assert.equal(result.completed, true);
    assert.equal(result.status, "COMPLETED");
    assert.equal(result.assistantText, "OPENRILL_FIRST_LOCAL_CONVERSATION_OK");
    assert.equal(result.usage.modelCalls, 1);
    assert.equal(result.persisted, true);
    assert.equal(result.hostMode, "EPHEMERAL");
    assert.equal(output.stdout[0].includes(prompt), false);
    assert.equal(output.stdout[0].includes("fixture-key"), false);
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0].authorization, "Bearer fixture-key");
    const requestBody = JSON.parse(fixture.requests[0].bodyText);
    assert.equal(requestBody.model, "fixture-model");
    assert.equal(requestBody.input.some((item) => item.role === "user" && item.content === prompt), true);

    const profilePaths = resolveProfilePaths({ profile: "first-run", env, platform: process.platform });
    const database = await openOpenRillStateDatabase({ profilePaths });
    try {
      const evidence = database.transaction((repositories) => {
        const conversations = repositories.conversations.listConversations("default", 10);
        assert.equal(conversations.length, 1);
        const conversation = conversations[0];
        const messages = repositories.conversations.listMessages(conversation.conversationId);
        const runs = repositories.conversations.listRuns(conversation.conversationId);
        const invocations = repositories.conversations.listModelInvocations(runs[0].runId);
        return { conversation, messages, runs, invocations };
      });
      assert.deepEqual(evidence.messages.map((item) => item.role), ["user", "assistant"]);
      assert.equal(evidence.runs[0].status, "COMPLETED");
      assert.equal(evidence.invocations.length, 1);
      assert.equal(evidence.invocations[0].status, "COMPLETED");
    } finally {
      database.close({ checkpointMode: "TRUNCATE" });
    }
  } finally {
    await fixture.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("STEP016B preserves typed model authentication failure without leaking prompt or secret", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step016b-auth-"));
  const fixture = await startResponsesFixture({ expectedAuthorization: "Bearer expected-key" });
  try {
    const { env, secrets } = await configureProfile({ root, profile: "auth-failure", endpoint: fixture.endpoint, secretValue: "wrong-key" });
    const output = io();
    const prompt = "sensitive-prompt-that-must-not-be-printed";
    const code = await runCli(["ask", "--profile", "auth-failure", "--json", "--timeout-ms", "30000"], output.adapter, runtime(env, root, secrets, `${prompt}\n`));
    assert.equal(code, 31);
    const result = JSON.parse(output.stdout[0]);
    assert.equal(result.status, "FAILED");
    assert.equal(result.terminalReason, "MODEL_AUTH_FAILED");
    assert.equal(result.failure.code, "MODEL_AUTH_FAILED");
    assert.match(result.failure.message, /model HTTP 401/);
    const visible = `${output.stdout.join("\n")}\n${output.stderr.join("\n")}`;
    assert.equal(visible.includes(prompt), false);
    assert.equal(visible.includes("wrong-key"), false);
  } finally {
    await fixture.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("STEP016B rejects empty stdin before starting a Host", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step016b-empty-"));
  const fixture = await startResponsesFixture();
  try {
    const { env, secrets } = await configureProfile({ root, profile: "empty", endpoint: fixture.endpoint, secretValue: "fixture-key" });
    const output = io();
    let starts = 0;
    const code = await runCli(["ask", "--profile", "empty"], output.adapter, {
      ...runtime(env, root, secrets, " \n"),
      startHost: async () => { starts += 1; throw new Error("must not start"); },
    });
    assert.equal(code, 2);
    assert.equal(starts, 0);
    assert.match(output.stderr.join("\n"), /non-empty prompt on stdin/);
  } finally {
    await fixture.close();
    await rm(root, { recursive: true, force: true });
  }
});
