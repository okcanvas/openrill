import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../apps/agent-cli/dist/index.js";
import { LocalCliProtocolClient } from "../../apps/agent-cli/dist/local-protocol-client.js";
import {
  createEphemeralOsSecretProviderForTests,
  loadOpenRillConfig,
  resolveConfigPaths,
  resolveProfilePaths,
} from "../../packages/config/dist/index.js";
import { ModelAdapterError, createScriptedModelAdapter } from "../../packages/model-adapter/dist/index.js";
import { readHostMetadata, startLocalHost } from "../../services/agent-host/dist/index.js";

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
  return {
    resolve: () => ({
      profile: "default",
      adapter,
      provider: "fixture",
      model: "fixture-model",
      maxOutputTokens: 256,
      maxRetries: 0,
    }),
  };
}

async function connect(host) {
  const metadata = await readHostMetadata(host.paths);
  assert.ok(metadata);
  const client = new LocalCliProtocolClient(metadata, "step019b-test", process.platform);
  await client.connect();
  return client;
}

async function waitFor(predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`condition not reached within ${timeoutMs}ms`);
}

test("STEP019B detached protocol Run auto-resumes after Host restart without a second client execution request", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step019b-host-resume-"));
  const workspace = join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  const profile = "step019b-host-resume";
  const env = {
    OPENRILL_DATA_ROOT: join(root, "data"),
    OPENRILL_CONFIG_ROOT: join(root, "config"),
    NO_COLOR: "1",
  };
  const secrets = createEphemeralOsSecretProviderForTests();
  const setup = io();
  let host = null;
  let client = null;
  try {
    const setupCode = await runCli([
      "setup", "--profile", profile,
      "--workspace", workspace,
      "--workspace-id", "default",
      "--provider", "default",
      "--endpoint", "http://127.0.0.1:1/v1",
      "--model", "fixture-model",
      "--api-key-stdin", "--json",
    ], setup.adapter, runtime(env, root, secrets, "fixture-key\n"));
    assert.equal(setupCode, 0, setup.stderr.join("\n"));
    const paths = resolveProfilePaths({ profile, env, platform: process.platform });
    const loaded = await loadOpenRillConfig({
      paths: resolveConfigPaths(paths, { platform: process.platform }),
      env,
      platform: process.platform,
      osSecretProvider: secrets,
    });

    let blockedResolve;
    const blocked = new Promise((resolve) => { blockedResolve = resolve; });
    let requestNumber = 0;
    const firstAdapter = {
      providerId: "fixture",
      async *stream(request) {
        requestNumber += 1;
        if (requestNumber === 1) {
          yield {
            type: "tool_call",
            toolCallId: "create-goal-before-restart",
            name: "goal.create",
            argumentsJson: JSON.stringify({
              objective: "Resume this detached release task",
              steps: ["Persist a checkpoint", "Finish after Host restart"],
            }),
          };
          yield { type: "completed", stopReason: "tool_calls" };
          return;
        }
        yield { type: "started", providerResponseId: "blocked-before-restart" };
        blockedResolve(request);
        await new Promise((resolve) => {
          if (request.signal?.aborted) return resolve();
          request.signal?.addEventListener("abort", resolve, { once: true });
        });
        throw new ModelAdapterError("MODEL_ABORTED", "Host restart interrupted the model", false);
      },
    };

    host = await startLocalHost({
      profile,
      port: 0,
      env,
      config: loaded.config,
      configRoot: paths.configRoot,
      workspaceIds: ["default"],
      osSecretProvider: secrets,
      modelResolver: resolver(firstAdapter),
    });
    await host.ready;
    client = await connect(host);
    const conversation = await client.call("conversation.create", { workspaceId: "default", modelProfile: "default", title: "Detached restart" }, 5_000, "step019b-create");
    const sent = await client.call("conversation.send", {
      workspaceId: "default",
      conversationId: conversation.conversationId,
      submissionKey: "step019b-detached-send",
      text: "Create the goal, checkpoint it, and continue after restart.",
    }, 5_000, "step019b-send");
    assert.equal(sent.run.status, "CREATED");
    const runId = sent.run.runId;
    const conversationId = conversation.conversationId;

    client.close();
    client = null;
    await blocked;
    await host.close("step019b-live-restart");
    host = null;

    const resumedRequests = [];
    const secondAdapter = createScriptedModelAdapter({
      onRequest: (request) => resumedRequests.push(request),
      turns: [{ kind: "events", events: [
        { type: "text_delta", delta: "detached run resumed automatically and completed" },
        { type: "completed", stopReason: "stop" },
      ] }],
    });
    host = await startLocalHost({
      profile,
      port: 0,
      env,
      config: loaded.config,
      configRoot: paths.configRoot,
      workspaceIds: ["default"],
      osSecretProvider: secrets,
      modelResolver: resolver(secondAdapter),
    });
    await host.ready;
    client = await connect(host);
    const completed = await waitFor(async () => {
      const view = await client.call("conversation.get", { workspaceId: "default", conversationId }, 5_000);
      const run = view.runs.find((candidate) => candidate.runId === runId);
      return run?.status === "COMPLETED" ? { view, run } : null;
    });
    assert.equal(completed.run.status, "COMPLETED");
    assert.equal(completed.view.messages.at(-1).content.text, "detached run resumed automatically and completed");
    assert.equal(resumedRequests.length, 1);
    assert.match(resumedRequests[0].systemInstructions, /## Active Goal Context/);
    assert.match(resumedRequests[0].systemInstructions, /Resume this detached release task/);

    client.close();
    client = null;
    await host.close("step019b-test-complete");
    host = null;

    const databasePath = join(paths.dataRoot, "state", "agent.db");
    const db = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const attempts = db.prepare("SELECT attempt_number attemptNumber, status, recovery_reason recoveryReason FROM run_attempts WHERE run_id = ? ORDER BY attempt_number").all(runId);
      assert.equal(attempts.length, 2);
      assert.deepEqual(attempts.map((attempt) => attempt.attemptNumber), [1, 2]);
      assert.equal(attempts[0].status, "ABORTED");
      assert.equal(attempts[0].recoveryReason, "HOST_SHUTDOWN");
      assert.equal(attempts[1].status, "COMPLETED");
      const continued = db.prepare("SELECT source_attempt_id sourceAttemptId FROM agent_goal_events WHERE event_type = 'goal.continued' ORDER BY sequence DESC LIMIT 1").get();
      const secondAttempt = db.prepare("SELECT attempt_id attemptId FROM run_attempts WHERE run_id = ? AND attempt_number = 2").get(runId);
      assert.equal(continued.sourceAttemptId, secondAttempt.attemptId);
    } finally {
      db.close();
    }
  } finally {
    client?.close();
    await host?.close("step019b-test-cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
