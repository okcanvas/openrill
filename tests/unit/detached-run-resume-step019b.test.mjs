import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { GoalService } from "../../packages/goals/dist/index.js";
import { ModelAdapterError, createScriptedModelAdapter } from "../../packages/model-adapter/dist/index.js";
import { ToolRegistry } from "../../packages/tool-runtime/dist/index.js";
import { AgentRunCoordinator } from "../../services/agent-host/dist/index.js";

const EXECUTION_BUDGET = {
  maxTurns: 8,
  maxModelCalls: 10,
  maxToolCalls: 16,
  maxOutputTokens: 128,
  maxTotalTokens: 4096,
  maxDurationMs: 60_000,
};

function resolver(adapter) {
  return {
    resolve: () => ({
      profile: "default",
      adapter,
      provider: "fixture",
      model: "fixture-model",
      maxOutputTokens: 128,
      maxRetries: 0,
    }),
  };
}

async function fixture(name) {
  const root = await mkdtemp(join(tmpdir(), `openrill-step019b-${name}-`));
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") };
  const state = await openOpenRillStateDatabase({ profilePaths: resolveProfilePaths({ profile: name, env }) });
  let sequence = 0;
  let clock = 1_000;
  const conversations = new ConversationService({
    state,
    workspaceIds: ["alpha"],
    createId: () => `${name}-${++sequence}`,
    now: () => ++clock,
  });
  const conversation = conversations.create({ workspaceId: "alpha", modelProfile: "default" });
  const sent = conversations.send({
    workspaceId: "alpha",
    conversationId: conversation.conversationId,
    submissionKey: `${name}-submission`,
    text: "perform one durable side effect and finish later",
  });
  return {
    root,
    state,
    conversations,
    run: sent.run,
    cleanup: async () => {
      if (state.isOpen()) state.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

function blockingAdapter(onStarted) {
  return {
    providerId: "fixture",
    async *stream(request) {
      yield { type: "started", providerResponseId: "blocked-response" };
      onStarted(request);
      await new Promise((resolve) => {
        if (request.signal?.aborted) return resolve();
        request.signal?.addEventListener("abort", resolve, { once: true });
      });
      throw new ModelAdapterError("MODEL_ABORTED", "blocked model request was aborted", false);
    },
  };
}

test("STEP019B prepares a fresh Attempt before recovered Run preparation", async () => {
  const f = await fixture("attempt");
  try {
    const first = f.conversations.startExecution({
      runId: f.run.runId,
      providerId: "fixture",
      modelId: "fixture-model",
      budget: EXECUTION_BUDGET,
    });
    f.conversations.appendEvent({
      runId: f.run.runId,
      attemptId: first.attempt.attemptId,
      eventType: "run.checkpoint",
      payload: { kind: "fixture" },
      idempotencyKey: "checkpoint:fixture",
    });
    const [recovered] = f.conversations.recoverIncompleteRuns();
    assert.equal(recovered.status, "CREATED");
    assert.equal(recovered.recoveryState, "RESUMABLE");
    assert.equal(f.conversations.executionContext(f.run.runId).attempt.status, "ABORTED");

    const prepared = f.conversations.prepareExecutionAttempt(f.run.runId);
    assert.equal(prepared.run.status, "CREATED");
    assert.equal(prepared.run.recoveryState, "RESUMABLE");
    assert.equal(prepared.attempt.attemptNumber, 2);
    assert.equal(prepared.attempt.status, "CREATED");
    assert.notEqual(prepared.attempt.attemptId, first.attempt.attemptId);
    const event = f.conversations.events(f.run.runId).find((candidate) => candidate.eventType === "run.attempt.prepared");
    assert.equal(event.attemptId, prepared.attempt.attemptId);
    assert.equal(event.payload.previousAttemptId, first.attempt.attemptId);
    assert.equal(event.payload.previousRecoveryReason, "HOST_RESTART");
  } finally {
    await f.cleanup();
  }
});

test("STEP019B graceful Host shutdown retains a checkpointed Run and resumes without repeating the Tool", async () => {
  const f = await fixture("resume");
  let firstCoordinator;
  let secondCoordinator;
  try {
    let toolExecutions = 0;
    const tools = new ToolRegistry();
    tools.register({
      name: "fixture.effect",
      description: "one durable fixture side effect",
      inputSchema: { type: "object", additionalProperties: false },
      validateInput: (input) => input !== null && typeof input === "object" && !Array.isArray(input),
      execute: () => {
        toolExecutions += 1;
        return { output: { execution: toolExecutions }, isError: false };
      },
    });

    let secondRequestStarted;
    const secondRequest = new Promise((resolve) => { secondRequestStarted = resolve; });
    let requestNumber = 0;
    const firstAdapter = {
      providerId: "fixture",
      async *stream(request) {
        requestNumber += 1;
        if (requestNumber === 1) {
          yield { type: "tool_call", toolCallId: "durable-effect-1", name: "fixture.effect", argumentsJson: "{}" };
          yield { type: "completed", stopReason: "tool_calls" };
          return;
        }
        yield* blockingAdapter(secondRequestStarted).stream(request);
      },
    };
    firstCoordinator = new AgentRunCoordinator({
      conversations: f.conversations,
      models: resolver(firstAdapter),
      tools,
      publishNotice: () => {},
    });
    assert.equal(firstCoordinator.schedule(f.run.runId), true);
    await secondRequest;
    await firstCoordinator.close();
    firstCoordinator = null;

    const interrupted = f.conversations.executionContext(f.run.runId);
    assert.equal(interrupted.run.status, "CREATED");
    assert.equal(interrupted.run.recoveryState, "RESUMABLE");
    assert.equal(interrupted.attempt.status, "ABORTED");
    assert.equal(interrupted.attempt.recoveryReason, "HOST_SHUTDOWN");
    assert.equal(toolExecutions, 1);
    assert.equal(f.conversations.runnableRunIds().includes(f.run.runId), true);
    assert.equal(f.conversations.events(f.run.runId).some((event) => event.eventType === "run.interrupted"), true);

    const resumedRequests = [];
    const resumedAdapter = createScriptedModelAdapter({
      onRequest: (request) => resumedRequests.push(request),
      turns: [{ kind: "events", events: [
        { type: "text_delta", delta: "resumed and completed" },
        { type: "completed", stopReason: "stop" },
      ] }],
    });
    secondCoordinator = new AgentRunCoordinator({
      conversations: f.conversations,
      models: resolver(resumedAdapter),
      tools,
      publishNotice: () => {},
    });
    const completed = await secondCoordinator.executeUntilTerminal(f.run.runId);
    assert.equal(completed.status, "COMPLETED");
    const terminal = f.conversations.executionContext(f.run.runId);
    assert.equal(terminal.run.status, "COMPLETED");
    assert.equal(terminal.attempt.attemptNumber, 2);
    assert.equal(toolExecutions, 1);
    assert.equal(resumedRequests.length, 1);
    assert.equal(resumedRequests[0].messages.some((message) => message.role === "tool" && message.content[0]?.toolCallId === "durable-effect-1"), true);
  } finally {
    await firstCoordinator?.close();
    await secondCoordinator?.close();
    await f.cleanup();
  }
});


test("STEP019B graceful Host shutdown fails closed when no durable checkpoint exists", async () => {
  const f = await fixture("non-resumable");
  let coordinator;
  try {
    let requestStarted;
    const entered = new Promise((resolve) => { requestStarted = resolve; });
    coordinator = new AgentRunCoordinator({
      conversations: f.conversations,
      models: resolver(blockingAdapter(requestStarted)),
      tools: new ToolRegistry(),
      publishNotice: () => {},
    });
    assert.equal(coordinator.schedule(f.run.runId), true);
    await entered;
    await coordinator.close();
    coordinator = null;
    const terminal = f.conversations.executionContext(f.run.runId);
    assert.equal(terminal.run.status, "FAILED");
    assert.equal(terminal.run.recoveryState, "NON_RESUMABLE");
    assert.equal(terminal.attempt.status, "ABORTED");
    assert.equal(terminal.attempt.recoveryReason, "HOST_SHUTDOWN");
    assert.equal(f.conversations.runnableRunIds().includes(f.run.runId), false);
  } finally {
    await coordinator?.close();
    await f.cleanup();
  }
});

test("STEP019B read-only Goal context does not create a continuation event", async () => {
  const f = await fixture("goal-read");
  try {
    let goalId = 0;
    const goals = new GoalService(f.state, { createId: () => `goal-read-${++goalId}`, now: () => f.conversations.currentTime() });
    const provenance = {
      workspaceId: "alpha",
      conversationId: f.run.conversationId,
      sourceRunId: f.run.runId,
      sourceAttemptId: f.run.currentAttemptId,
    };
    const created = goals.create({ ...provenance, objective: "Wait for approval without advancing continuation", steps: ["Receive approval"] });
    const prepared = goals.prepareContext(provenance);
    assert.match(prepared, /Continuation turn: 1/);
    const before = goals.current({ workspaceId: "alpha", conversationId: f.run.conversationId });
    const readOnly = goals.readContext({ workspaceId: "alpha", conversationId: f.run.conversationId });
    const after = goals.current({ workspaceId: "alpha", conversationId: f.run.conversationId });
    assert.match(readOnly, /Continuation turn: 1/);
    assert.equal(after.goal.goalId, created.goalId);
    assert.equal(after.goal.continuationCount, 1);
    assert.equal(after.recentEvents.filter((event) => event.eventType === "goal.continued").length, before.recentEvents.filter((event) => event.eventType === "goal.continued").length);
  } finally {
    await f.cleanup();
  }
});

test("STEP019B operator cancellation remains terminal and is never converted to resumable interruption", async () => {
  const f = await fixture("cancel");
  let coordinator;
  try {
    let requestStarted;
    const entered = new Promise((resolve) => { requestStarted = resolve; });
    coordinator = new AgentRunCoordinator({
      conversations: f.conversations,
      models: resolver(blockingAdapter(requestStarted)),
      tools: new ToolRegistry(),
      publishNotice: () => {},
    });
    const resultPromise = coordinator.executeUntilTerminal(f.run.runId);
    await entered;
    assert.equal(coordinator.cancel(f.run.runId), true);
    const result = await resultPromise;
    assert.equal(result.status, "CANCELLED");
    const terminal = f.conversations.executionContext(f.run.runId);
    assert.equal(terminal.run.status, "CANCELLED");
    assert.equal(terminal.run.recoveryState, "NONE");
    assert.equal(f.conversations.runnableRunIds().includes(f.run.runId), false);
  } finally {
    await coordinator?.close();
    await f.cleanup();
  }
});
