import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../apps/agent-cli/dist/index.js";
import { createEphemeralOsSecretProviderForTests, loadOpenRillConfig, resolveConfigPaths, resolveProfilePaths } from "../../packages/config/dist/index.js";
import { createScriptedModelAdapter } from "../../packages/model-adapter/dist/index.js";
import { startLocalHost } from "../../services/agent-host/dist/index.js";

function io() { const stdout = []; const stderr = []; return { stdout, stderr, adapter: { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) } }; }
function runtime(env, cwd, provider, input = "") { return { env, cwd: () => cwd, platform: process.platform, readStdin: async () => input, osSecretProvider: provider, onSignal() {}, offSignal() {} }; }
function resolver(adapter) { return { resolve: () => ({ profile: "default", adapter, provider: "fixture", model: "fixture-model", maxOutputTokens: 256, maxRetries: 0 }) }; }

test("STEP019A Host injects durable active-goal context after restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step019a-host-goal-"));
  const workspace = join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  const profile = "step019a-goal-host";
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config"), NO_COLOR: "1" };
  const secrets = createEphemeralOsSecretProviderForTests();
  const setup = io();
  let host = null;
  try {
    const setupCode = await runCli(["setup", "--profile", profile, "--workspace", workspace, "--workspace-id", "default", "--provider", "default", "--endpoint", "http://127.0.0.1:1/v1", "--model", "fixture-model", "--api-key-stdin", "--json"], setup.adapter, runtime(env, root, secrets, "fixture-key\n"));
    assert.equal(setupCode, 0, setup.stderr.join("\n"));
    const paths = resolveProfilePaths({ profile, env, platform: process.platform });
    const loaded = await loadOpenRillConfig({ paths: resolveConfigPaths(paths, { platform: process.platform }), env, platform: process.platform, osSecretProvider: secrets });
    const firstRequests = [];
    const firstAdapter = createScriptedModelAdapter({
      onRequest: (request) => firstRequests.push(request),
      turns: [
        { kind: "events", events: [
          { type: "tool_call", toolCallId: "create-goal", name: "goal.create", argumentsJson: JSON.stringify({ objective: "Prepare a verified release", steps: ["Inspect current state", "Run acceptance"] }) },
          { type: "completed", stopReason: "tool_calls" },
        ] },
        { kind: "events", events: [{ type: "text_delta", delta: "Goal created." }, { type: "completed", stopReason: "stop" }] },
      ],
    });
    host = await startLocalHost({ profile, port: 0, env, config: loaded.config, configRoot: paths.configRoot, workspaceIds: ["default"], osSecretProvider: secrets, modelResolver: resolver(firstAdapter) });
    await host.ready;
    const first = await host.runConversation({ workspaceId: "default", text: "Track this as a durable goal.", submissionKey: "goal-host-first" });
    assert.equal(first.status, "COMPLETED");
    const conversationId = first.conversationId;
    assert.equal(firstRequests[0].tools.some((tool) => tool.name === "goal.create"), true);
    assert.match(firstRequests[0].systemInstructions, /## Durable Goal and Plan/);
    await host.close("restart-goal-test");
    host = null;

    const secondRequests = [];
    const secondAdapter = createScriptedModelAdapter({
      onRequest: (request) => secondRequests.push(request),
      turns: [
        { kind: "events", events: [{ type: "tool_call", toolCallId: "get-goal", name: "goal.get", argumentsJson: "{}" }, { type: "completed", stopReason: "tool_calls" }] },
        { kind: "events", events: [{ type: "text_delta", delta: "Continuing the first unfinished step." }, { type: "completed", stopReason: "stop" }] },
      ],
    });
    host = await startLocalHost({ profile, port: 0, env, config: loaded.config, configRoot: paths.configRoot, workspaceIds: ["default"], osSecretProvider: secrets, modelResolver: resolver(secondAdapter) });
    await host.ready;
    const second = await host.runConversation({ workspaceId: "default", conversationId, text: "Continue.", submissionKey: "goal-host-second" });
    assert.equal(second.status, "COMPLETED");
    assert.match(secondRequests[0].systemInstructions, /## Active Goal Context/);
    assert.match(secondRequests[0].systemInstructions, /Prepare a verified release/);
    assert.match(secondRequests[0].systemInstructions, /1\. \[PENDING\] Inspect current state/);
    const goalToolResult = secondRequests[1].messages.find((message) => message.role === "tool" && message.content[0]?.name === "goal.get");
    assert.equal(goalToolResult.content[0].output.goal.objective, "Prepare a verified release");
    assert.equal(goalToolResult.content[0].output.goal.continuationCount, 1);
  } finally {
    await host?.close("step019a-test");
    await rm(root, { recursive: true, force: true });
  }
});
