import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../apps/agent-cli/dist/index.js";
import {
  createEphemeralOsSecretProviderForTests,
  loadOpenRillConfig,
  resolveConfigPaths,
  resolveProfilePaths,
} from "../../packages/config/dist/index.js";
import { createScriptedModelAdapter } from "../../packages/model-adapter/dist/index.js";
import { startLocalHost } from "../../services/agent-host/dist/index.js";

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

function resolver(adapter) {
  return { resolve: () => ({ profile: "default", adapter, provider: "fixture", model: "fixture-model", maxOutputTokens: 256, maxRetries: 0 }) };
}

test("STEP018A Host exposes memory tools and recalls across durable Conversations", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step018a-host-memory-"));
  const workspace = join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  const profile = "step018a-memory-host";
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config"), NO_COLOR: "1" };
  const secrets = createEphemeralOsSecretProviderForTests();
  const setup = io();
  let host = null;
  try {
    const setupCode = await runCli([
      "setup", "--profile", profile, "--workspace", workspace, "--workspace-id", "default",
      "--provider", "default", "--endpoint", "http://127.0.0.1:1/v1", "--model", "fixture-model", "--api-key-stdin", "--json",
    ], setup.adapter, runtime(env, root, secrets, "fixture-key\n"));
    assert.equal(setupCode, 0, setup.stderr.join("\n"));
    const paths = resolveProfilePaths({ profile, env, platform: process.platform });
    const loaded = await loadOpenRillConfig({
      paths: resolveConfigPaths(paths, { platform: process.platform }),
      env,
      platform: process.platform,
      osSecretProvider: secrets,
    });
    const requests = [];
    const adapter = createScriptedModelAdapter({
      onRequest: (request) => requests.push(request),
      turns: [
        { kind: "events", events: [
          { type: "tool_call", toolCallId: "host-remember", name: "memory.remember", argumentsJson: JSON.stringify({ text: "The deployment region is ap-northeast-2.", kind: "FACT" }) },
          { type: "completed", stopReason: "tool_calls" },
        ] },
        { kind: "events", events: [
          { type: "text_delta", delta: "Stored." },
          { type: "completed", stopReason: "stop" },
        ] },
        { kind: "events", events: [
          { type: "tool_call", toolCallId: "host-search", name: "memory.search", argumentsJson: JSON.stringify({ query: "deployment region" }) },
          { type: "completed", stopReason: "tool_calls" },
        ] },
        { kind: "events", events: [
          { type: "text_delta", delta: "The deployment region is ap-northeast-2." },
          { type: "completed", stopReason: "stop" },
        ] },
      ],
    });
    let nextId = 0;
    host = await startLocalHost({
      profile,
      port: 0,
      env,
      config: loaded.config,
      configRoot: paths.configRoot,
      workspaceIds: ["default"],
      osSecretProvider: secrets,
      modelResolver: resolver(adapter),
      createInstanceId: () => `instance-${++nextId}`,
    });
    await host.ready;
    const first = await host.runConversation({ workspaceId: "default", text: "Remember the deployment region.", submissionKey: "memory-host-first" });
    assert.equal(first.status, "COMPLETED");
    const second = await host.runConversation({ workspaceId: "default", text: "Which deployment region did I ask you to remember?", submissionKey: "memory-host-second" });
    assert.equal(second.status, "COMPLETED");
    assert.equal(second.assistantText, "The deployment region is ap-northeast-2.");
    assert.equal(requests[0].tools.some((tool) => tool.name === "memory.remember"), true);
    assert.equal(requests[2].tools.some((tool) => tool.name === "memory.search"), true);
    assert.match(requests[0].systemInstructions, /## Durable Memory/);
    const searchResult = requests[3].messages.find((message) => message.role === "tool");
    assert.equal(searchResult.content[0].output.results[0].text, "The deployment region is ap-northeast-2.");
  } finally {
    await host?.close("step018a-test");
    await rm(root, { recursive: true, force: true });
  }
});
