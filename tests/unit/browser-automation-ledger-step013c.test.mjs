import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase, OPENRILL_STATE_SCHEMA_VERSION } from "../../packages/state/dist/index.js";
import { ConversationError, ConversationService } from "../../packages/conversations/dist/index.js";
import { AutomationDefinitionService } from "../../packages/automation/dist/index.js";
import { registerBrowserTools } from "../../packages/browser-runtime/dist/index.js";
import { ToolRegistry } from "../../packages/tool-runtime/dist/index.js";
import { AutomationConversationExecutor } from "../../services/agent-host/dist/automation-conversation-executor.js";
import { StateBrowserToolLedger } from "../../services/agent-host/dist/browser-operation-ledger.js";
import { createScriptedModelAdapter } from "../../packages/model-adapter/dist/index.js";
import { executeAgentRun } from "../../packages/agent-kernel/dist/index.js";

function jobInput() {
  return {
    name: "browser automation",
    enabled: false,
    schedule: { kind: "at", at: "1970-01-01T00:00:00.000Z" },
    timezone: "UTC",
    conversationTemplate: { workspaceId: "alpha", prompt: "inspect fixture", modelProfile: "default" },
    catchUpPolicy: { kind: "RUN_ONCE" },
    failurePolicy: { backoffMs: 0, maxConsecutiveFailures: 3, autoDisable: false },
  };
}

async function fixture(profile = "browser-ledger") {
  const root = await mkdtemp(join(tmpdir(), `openrill-step013c-${profile}-`));
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") };
  const paths = resolveProfilePaths({ profile, env });
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  state.transaction((repositories) => repositories.workspaces.upsertWorkspace({
    workspaceId: "alpha", displayName: "Alpha", canonicalRoot: root, rootRevision: "0".repeat(64),
    accessMode: "READ_WRITE", trustState: "CONFIGURED_LOCAL", updatedAt: 1,
  }));
  const conversations = new ConversationService({ state, workspaceIds: ["alpha"], now: () => 100 });
  const conversation = conversations.create({ workspaceId: "alpha", modelProfile: "default" });
  const sent = conversations.send({ workspaceId: "alpha", conversationId: conversation.conversationId, submissionKey: "s1", text: "run" });
  const execution = conversations.startExecution({
    runId: sent.run.runId,
    providerId: "fixture",
    modelId: "fixture",
    budget: { maxTurns: 8, maxModelCalls: 8, maxToolCalls: 16, maxOutputTokens: 256 },
  });
  return {
    root, env, paths, state, conversations, conversation, runId: sent.run.runId,
    attemptId: execution.attempt.attemptId,
    cleanup: async () => { if (state.isOpen()) state.close(); await rm(root, { recursive: true, force: true }); },
  };
}

test("schema 11 persists Browser operation lifecycle and deduplicated evidence without raw input", async () => {
  const f = await fixture("schema-ledger");
  try {
    assert.ok(OPENRILL_STATE_SCHEMA_VERSION >= 11);
    const ledger = new StateBrowserToolLedger(f.state);
    const context = {
      runId: f.runId, attemptId: f.attemptId, workspaceId: "alpha",
      conversationId: f.conversation.conversationId, toolCallId: "browser-call-1",
    };
    ledger.begin({
      operationId: "operation-1", context, toolName: "browser.evidence",
      inputSha256: "a".repeat(64), sessionId: "session-1", pageId: "page-1", startedAt: 10,
    });
    ledger.complete({
      operationId: "operation-1", status: "SUCCEEDED", errorCode: null,
      documentGeneration: 3, url: "https://example.com/path?redacted", artifactId: null,
      evidenceEvents: [
        { sequence: 1, at: 11, kind: "console", level: "log", text: "hello" },
        { sequence: 1, at: 11, kind: "console", level: "log", text: "hello" },
        { sequence: 2, at: 12, kind: "network", method: "GET", url: "https://example.com/api?redacted", resourceType: "fetch", ok: true },
      ],
      completedAt: 20,
    });
    const operation = f.state.transaction((repositories) => repositories.browser.getOperation("operation-1"));
    assert.equal(operation.status, "SUCCEEDED");
    assert.equal(operation.inputSha256, "a".repeat(64));
    assert.equal(operation.url, "https://example.com/path?redacted");
    assert.deepEqual(
      f.state.transaction((repositories) => repositories.browser.listOperationEvents("operation-1")).map((event) => event.eventType),
      ["STARTED", "SUCCEEDED"],
    );
    const evidence = f.state.transaction((repositories) => repositories.browser.listEvidence(f.runId));
    assert.deepEqual(evidence.map((event) => [event.sequence, event.kind]), [[1, "console"], [2, "network"]]);
    assert.equal(JSON.stringify(operation).includes("hello"), false);
    assert.equal(JSON.stringify(evidence).includes("hello"), false);
    assert.match(evidence[0].payload.text.sha256, /^[0-9a-f]{64}$/);
    assert.equal(evidence[0].payload.text.length, 5);
  } finally { await f.cleanup(); }
});

test("Browser Tool ledger hashes raw input and redacts URL credentials, query, and fragment", async () => {
  const starts = [];
  const completions = [];
  const tools = new ToolRegistry();
  const runtime = {
    async openOwnedPage(_owner, url) {
      return { sessionId: "session", pageId: "page", documentGeneration: 1, url };
    },
  };
  registerBrowserTools(tools, runtime, {
    now: (() => { let now = 0; return () => ++now; })(),
    createOperationId: () => "operation-redaction",
    ledger: { begin: (input) => starts.push(input), complete: (input) => completions.push(input) },
  });
  const secretUrl = "https://user:password@example.com/path?token=secret#fragment";
  const result = await tools.execute("browser.open", { url: secretUrl }, {
    runId: "run", attemptId: "attempt", workspaceId: "alpha", conversationId: "conversation", toolCallId: "call",
  });
  assert.equal(result.isError, false);
  assert.equal(starts.length, 1);
  assert.match(starts[0].inputSha256, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(starts[0]).includes("password"), false);
  assert.equal(JSON.stringify(starts[0]).includes("secret"), false);
  assert.equal(completions[0].url, "https://example.com/path?redacted");
});

test("restart recovery marks unfinished Browser operations interrupted", async () => {
  const f = await fixture("interrupted");
  try {
    const ledger = new StateBrowserToolLedger(f.state);
    ledger.begin({
      operationId: "operation-interrupted",
      context: { runId: f.runId, attemptId: f.attemptId, workspaceId: "alpha", conversationId: f.conversation.conversationId, toolCallId: "call-interrupted" },
      toolName: "browser.click", inputSha256: "b".repeat(64), sessionId: "session-old", pageId: "page-old", startedAt: 10,
    });
    const recovered = f.state.transaction((repositories) => repositories.browser.recoverInterruptedOperations({ recoveredAt: 30 }));
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].status, "INTERRUPTED");
    assert.equal(recovered[0].errorCode, "BROWSER_INTERRUPTED_BY_RESTART");
    assert.deepEqual(
      f.state.transaction((repositories) => repositories.browser.listOperationEvents("operation-interrupted")).map((event) => event.eventType),
      ["STARTED", "INTERRUPTED"],
    );
  } finally { await f.cleanup(); }
});

test("post-checkpoint model request crash stays resumable and closes the stale model invocation", async () => {
  const f = await fixture("model-request-recovery");
  try {
    f.conversations.appendEvent({
      runId: f.runId, attemptId: f.attemptId, eventType: "run.checkpoint",
      payload: { kind: "tool.completed", toolCallId: "browser-open" }, idempotencyKey: "checkpoint:browser-open",
    });
    const invocation = f.conversations.startModelInvocation({
      runId: f.runId, attemptId: f.attemptId, turnNumber: 2, requestNumber: 2,
      providerId: "fixture", modelId: "fixture", requestHash: "c".repeat(64),
    });
    f.conversations.appendEvent({
      runId: f.runId, attemptId: f.attemptId, eventType: "model.requested",
      payload: { turn: 2, requestNumber: 2 }, idempotencyKey: "model-request:2",
    });
    const [recovered] = f.conversations.recoverIncompleteRuns();
    assert.deepEqual([recovered.status, recovered.recoveryState], ["CREATED", "RESUMABLE"]);
    const recoveredContext = f.conversations.executionContext(f.runId);
    assert.equal(recoveredContext.run.currentAttemptId, f.attemptId);
    assert.equal(recoveredContext.attempt.status, "ABORTED");
    assert.equal(recoveredContext.attempt.recoveryReason, "HOST_RESTART");
    const staleInvocation = f.conversations.modelInvocations(f.runId).find((item) => item.invocationId === invocation.invocationId);
    assert.equal(staleInvocation.status, "FAILED");
    assert.equal(staleInvocation.errorCode, "MODEL_INTERRUPTED_BY_RESTART");

    const resumed = await executeAgentRun({
      runId: f.runId,
      conversations: f.conversations,
      modelAdapters: {
        resolve: () => ({
          profile: "default",
          adapter: createScriptedModelAdapter({ turns: [{ kind: "events", events: [
            { type: "text_delta", delta: "recovered" },
            { type: "completed", stopReason: "stop" },
          ] }] }),
          provider: "fixture", model: "fixture", maxOutputTokens: 128, maxRetries: 0,
        }),
      },
      tools: new ToolRegistry(),
    });
    assert.equal(resumed.status, "COMPLETED");
    const completedContext = f.conversations.executionContext(f.runId);
    assert.notEqual(completedContext.attempt.attemptId, f.attemptId);
    assert.equal(completedContext.attempt.attemptNumber, 2);
    assert.equal(completedContext.attempt.status, "COMPLETED");
  } finally { await f.cleanup(); }
});

test("expired Automation RUNNING work requeues only when the linked Agent Run is resumable", async () => {
  const f = await fixture("automation-recovery");
  try {
    f.conversations.appendEvent({
      runId: f.runId, attemptId: f.attemptId, eventType: "run.checkpoint",
      payload: { kind: "tool.completed", toolCallId: "browser-open" }, idempotencyKey: "checkpoint:browser-open",
    });
    f.conversations.recoverIncompleteRuns();
    const definitions = new AutomationDefinitionService({ state: f.state, now: () => 100, createId: () => "automation-job" });
    const job = definitions.create(jobInput());
    const reserved = definitions.runNow(job.jobId, "request-1").run;
    f.state.transaction((repositories) => {
      repositories.automations.claimRun({ automationRunId: reserved.automationRunId, leaseOwner: "owner-old", claimedAt: 100, leaseExpiresAt: 200 });
      repositories.automations.markRunRunning({ automationRunId: reserved.automationRunId, leaseOwner: "owner-old", runningAt: 100, leaseExpiresAt: 200 });
      repositories.automations.bindRunId({ automationRunId: reserved.automationRunId, leaseOwner: "owner-old", runId: f.runId, boundAt: 100 });
    });
    const result = f.state.transaction((repositories) => repositories.automations.recoverExpiredRuns({ now: 201 }));
    assert.deepEqual(result.failed, []);
    assert.equal(result.requeued.length, 1);
    assert.equal(result.requeued[0].status, "PENDING");
    assert.equal(result.requeued[0].runId, f.runId);
  } finally { await f.cleanup(); }
});

test("Automation Conversation executor resumes the linked Agent Run without creating a second conversation", async () => {
  let creates = 0;
  let sends = 0;
  const notices = [];
  const executor = new AutomationConversationExecutor({
    conversations: {
      create() { creates += 1; throw new Error("must not create"); },
      send() { sends += 1; throw new Error("must not send"); },
      cancel() {},
    },
    coordinator: {
      cancel() { return true; },
      async executeUntilTerminal(runId) { assert.equal(runId, "agent-run-existing"); return { runId, status: "COMPLETED", terminalReason: "stop", usage: {}, messages: [] }; },
    },
    publishNotice: (topic, data) => notices.push([topic, data]),
  });
  const result = await executor.execute({
    job: { jobId: "job", revision: 1, config: jobInput(), runtime: { nextScheduledFor: null, lastScheduledFor: null, consecutiveFailures: 0 }, createdAt: 1, updatedAt: 1 },
    run: { automationRunId: "automation-run", jobId: "job", scheduledFor: 1, triggerKind: "MANUAL", requestKey: "request", claimedAt: 1, leaseOwner: "owner", leaseExpiresAt: 100, runId: "agent-run-existing", status: "RUNNING", attempt: 2, errorCode: null, createdAt: 1, updatedAt: 1 },
    bindRunId() { throw new Error("must not bind twice"); },
    signal: new AbortController().signal,
  });
  assert.deepEqual(result, { status: "SUCCEEDED", runId: "agent-run-existing" });
  assert.equal(creates, 0);
  assert.equal(sends, 0);
  assert.equal(notices[0][0], "automation.run.resuming");
});

test("completed Browser tool calls write a resumable Run checkpoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step013c-checkpoint-"));
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") };
  const state = await openOpenRillStateDatabase({ profilePaths: resolveProfilePaths({ profile: "checkpoint", env }) });
  const conversations = new ConversationService({ state, workspaceIds: ["alpha"] });
  const conversation = conversations.create({ workspaceId: "alpha", modelProfile: "default" });
  const sent = conversations.send({ workspaceId: "alpha", conversationId: conversation.conversationId, submissionKey: "s", text: "go" });
  const adapter = createScriptedModelAdapter({ turns: [
    { kind: "events", events: [{ type: "tool_call", toolCallId: "browser-status", name: "browser.status", argumentsJson: "{}" }, { type: "completed", stopReason: "tool_calls" }] },
    { kind: "events", events: [{ type: "text_delta", delta: "done" }, { type: "completed", stopReason: "stop" }] },
  ] });
  const tools = new ToolRegistry();
  tools.register({ name: "browser.status", description: "status", inputSchema: { type: "object" }, validateInput: (value) => value && typeof value === "object", execute: () => ({ output: { state: "READY" }, isError: false }) });
  try {
    const result = await executeAgentRun({
      runId: sent.run.runId,
      conversations,
      modelAdapters: { resolve: () => ({ profile: "default", adapter, provider: "fixture", model: "fixture", maxOutputTokens: 128, maxRetries: 0 }) },
      tools,
    });
    assert.equal(result.status, "COMPLETED");
    const events = conversations.events(sent.run.runId);
    const checkpoint = events.find((event) => event.eventType === "run.checkpoint");
    assert.deepEqual(checkpoint.payload, { kind: "tool.completed", toolCallId: "browser-status", name: "browser.status", isError: false, errorCode: null });
  } finally { state.close(); await rm(root, { recursive: true, force: true }); }
});


test("Automation executor preserves typed Conversation recovery failures", async () => {
  const executor = new AutomationConversationExecutor({
    conversations: { create() { throw new Error("not used"); }, send() { throw new Error("not used"); }, cancel() {} },
    coordinator: {
      cancel() { return false; },
      executeUntilTerminal() { return Promise.reject(new ConversationError("RUN_STATE_INVALID", "run has no current attempt")); },
    },
    publishNotice() {},
  });
  const result = await executor.execute({
    job: { jobId: "job", revision: 1, config: jobInput(), runtime: { nextScheduledFor: null, lastScheduledFor: null, consecutiveFailures: 0 }, createdAt: 1, updatedAt: 1 },
    run: { automationRunId: "automation-run", jobId: "job", scheduledFor: 1, triggerKind: "MANUAL", requestKey: "request", claimedAt: 1, leaseOwner: "owner", leaseExpiresAt: 100, runId: "agent-run-existing", status: "RUNNING", attempt: 2, errorCode: null, createdAt: 1, updatedAt: 1 },
    bindRunId() { throw new Error("must not bind twice"); },
    signal: new AbortController().signal,
  });
  assert.deepEqual(result, {
    status: "FAILED",
    errorCode: "AUTOMATION_CONVERSATION_RUN_STATE_INVALID",
    runId: "agent-run-existing",
  });
});
