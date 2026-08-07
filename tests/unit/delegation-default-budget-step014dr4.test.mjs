import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ConversationService, DelegationService } from "../../packages/conversations/dist/index.js";
import { createScriptedModelAdapter } from "../../packages/model-adapter/dist/index.js";
import { executeAgentRun } from "../../packages/agent-kernel/dist/index.js";
import { ToolRegistry } from "../../packages/tool-runtime/dist/index.js";
import { registerDelegationTools } from "../../packages/tools-delegation/dist/index.js";
import { collectExternalModelRunDiagnostics } from "../../scripts/step014dr1-live-diagnostics.mjs";

function ids(prefix) { let value = 0; return () => `${prefix}-${++value}`; }
async function fixture(name) {
  const root = await mkdtemp(join(tmpdir(), `openrill-step014dr4-${name}-`));
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") };
  const paths = resolveProfilePaths({ profile: name, env });
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  let clock = 10_000;
  const now = () => clock;
  const createId = ids(name);
  const conversations = new ConversationService({ state, workspaceIds: ["alpha"], createId, now });
  const delegations = new DelegationService({ state, workspaceIds: ["alpha"], createId, now });
  const conversation = conversations.create({ workspaceId: "alpha", modelProfile: "default" });
  const sent = conversations.send({ workspaceId: "alpha", conversationId: conversation.conversationId, submissionKey: "root", text: "root" });
  return {
    root, paths, state, conversations, delegations, run: sent.run, now,
    cleanup: async () => { if (state.isOpen()) state.close(); await rm(root, { recursive: true, force: true }); },
  };
}

const rootBudget = {
  maxTurns: 8, maxModelCalls: 10, maxToolCalls: 16, maxOutputTokens: 512,
  maxTotalTokens: 65_536, maxDurationMs: 300_000,
  maxDelegationDepth: 2, maxActiveChildren: 4, maxTotalChildren: 8,
};

function configureRoot(f) {
  f.delegations.configureRootBudget({
    runId: f.run.runId,
    budget: rootBudget,
    scope: { workspaceIds: ["alpha"], skillIds: [], toolNames: ["agent.spawn", "agent.wait"] },
  });
}

function budgetShape(budget) {
  return {
    maxTurns: budget.maxTurns,
    maxModelCalls: budget.maxModelCalls,
    maxToolCalls: budget.maxToolCalls,
    maxTotalTokens: budget.maxTotalTokens,
    maxDelegationDepth: budget.maxDelegationDepth,
  };
}

test("default child reservations fit two parallel children after the root's first model turn", async () => {
  const f = await fixture("parallel-defaults");
  try {
    configureRoot(f);
    f.conversations.startExecution({
      runId: f.run.runId, providerId: "fixture", modelId: "fixture",
      budget: { maxTurns: 8, maxModelCalls: 10, maxToolCalls: 16, maxOutputTokens: 512, maxTotalTokens: 65_536, maxDurationMs: 300_000 },
    });
    const tools = new ToolRegistry();
    registerDelegationTools(tools, { delegations: f.delegations, scheduleChild: () => true, now: f.now });

    f.conversations.updateExecutionUsage(f.run.runId, { turns: 1, inputTokens: 1_149, outputTokens: 111, modelCalls: 1, toolCalls: 1 });
    const alpha = await tools.execute("agent.spawn", { task: "Return CHILD_ALPHA" }, {
      runId: f.run.runId, attemptId: f.run.currentAttemptId, workspaceId: "alpha", toolCallId: "spawn-alpha",
    });
    assert.equal(alpha.isError, false, JSON.stringify(alpha));

    f.conversations.updateExecutionUsage(f.run.runId, { turns: 1, inputTokens: 1_149, outputTokens: 111, modelCalls: 1, toolCalls: 2 });
    const beta = await tools.execute("agent.spawn", { task: "Create one grandchild", maxNestedDepth: 1 }, {
      runId: f.run.runId, attemptId: f.run.currentAttemptId, workspaceId: "alpha", toolCallId: "spawn-beta",
    });
    assert.equal(beta.isError, false, JSON.stringify(beta));

    const alphaBudget = f.delegations.budget(alpha.output.childRunId);
    const betaBudget = f.delegations.budget(beta.output.childRunId);
    assert.deepEqual(budgetShape(alphaBudget), {
      maxTurns: 2, maxModelCalls: 2, maxToolCalls: 4, maxTotalTokens: 8_192, maxDelegationDepth: 1,
    });
    assert.deepEqual(budgetShape(betaBudget), {
      maxTurns: 4, maxModelCalls: 5, maxToolCalls: 8, maxTotalTokens: 8_192, maxDelegationDepth: 2,
    });
  } finally { await f.cleanup(); }
});

test("the nested child default still leaves capacity for one grandchild and a resume turn", async () => {
  const f = await fixture("nested-defaults");
  try {
    configureRoot(f);
    f.conversations.startExecution({
      runId: f.run.runId, providerId: "fixture", modelId: "fixture",
      budget: { maxTurns: 8, maxModelCalls: 10, maxToolCalls: 16, maxOutputTokens: 512, maxTotalTokens: 65_536, maxDurationMs: 300_000 },
    });
    const tools = new ToolRegistry();
    registerDelegationTools(tools, { delegations: f.delegations, scheduleChild: () => true, now: f.now });
    f.conversations.updateExecutionUsage(f.run.runId, { turns: 1, inputTokens: 100, outputTokens: 20, modelCalls: 1, toolCalls: 1 });
    const beta = await tools.execute("agent.spawn", { task: "nested child", maxNestedDepth: 1 }, {
      runId: f.run.runId, attemptId: f.run.currentAttemptId, workspaceId: "alpha", toolCallId: "spawn-beta",
    });
    assert.equal(beta.isError, false, JSON.stringify(beta));

    const child = f.conversations.executionContext(beta.output.childRunId);
    const childBudget = f.delegations.budget(beta.output.childRunId);
    f.conversations.startExecution({
      runId: beta.output.childRunId, providerId: "fixture", modelId: "fixture",
      budget: {
        maxTurns: childBudget.maxTurns, maxModelCalls: childBudget.maxModelCalls,
        maxToolCalls: childBudget.maxToolCalls, maxOutputTokens: childBudget.maxOutputTokens,
        maxTotalTokens: childBudget.maxTotalTokens, maxDurationMs: childBudget.maxDurationMs,
      },
    });
    f.conversations.updateExecutionUsage(beta.output.childRunId, { turns: 1, inputTokens: 100, outputTokens: 20, modelCalls: 1, toolCalls: 1 });
    const grand = await tools.execute("agent.spawn", { task: "grandchild" }, {
      runId: beta.output.childRunId, attemptId: child.run.currentAttemptId, workspaceId: "alpha", toolCallId: "spawn-grand",
    });
    assert.equal(grand.isError, false, JSON.stringify(grand));
    const grandBudget = f.delegations.budget(grand.output.childRunId);
    assert.deepEqual(budgetShape(grandBudget), {
      maxTurns: 2, maxModelCalls: 2, maxToolCalls: 4, maxTotalTokens: 4_096, maxDelegationDepth: 2,
    });
    const reservation = f.state.transaction((repositories) => repositories.delegations.reservationSummary(beta.output.childRunId));
    assert.equal(childBudget.maxTurns - 1 - reservation.reservedTurns, 1);
    assert.equal(childBudget.maxModelCalls - 1 - reservation.reservedModelCalls, 2);
  } finally { await f.cleanup(); }
});

test("typed Tool error codes are persisted and exposed without Tool arguments or results", async () => {
  const f = await fixture("typed-tool-error");
  try {
    const tools = new ToolRegistry();
    tools.register({
      name: "fixture.error",
      description: "Return one typed error",
      inputSchema: { type: "object", additionalProperties: false },
      validateInput: () => true,
      execute: () => ({ output: { error: { code: "DELEGATION_BUDGET_EXCEEDED", message: "private detail" } }, isError: true }),
    });
    const adapter = createScriptedModelAdapter({ turns: [
      { kind: "events", events: [
        { type: "tool_call", toolCallId: "error-call", name: "fixture.error", argumentsJson: "{}" },
        { type: "completed", stopReason: "tool_calls" },
      ] },
      { kind: "events", events: [
        { type: "text_delta", delta: "done" },
        { type: "completed", stopReason: "stop" },
      ] },
    ] });
    const result = await executeAgentRun({
      runId: f.run.runId,
      conversations: f.conversations,
      modelAdapters: { resolve: () => ({ profile: "default", adapter, provider: "fixture", model: "fixture", maxOutputTokens: 128, maxRetries: 0 }) },
      tools,
    });
    assert.equal(result.status, "COMPLETED");
    const diagnostics = collectExternalModelRunDiagnostics(f.state.diagnostics().databasePath, f.run.runId);
    const completed = diagnostics.recentToolEvents.find((event) => event.eventType === "tool.completed");
    assert.deepEqual(completed, {
      sequence: completed.sequence,
      eventType: "tool.completed",
      name: "fixture.error",
      toolCallId: "error-call",
      isError: true,
      errorCode: "DELEGATION_BUDGET_EXCEEDED",
    });
    const serialized = JSON.stringify(diagnostics);
    assert.equal(serialized.includes("private detail"), false);
    assert.equal(serialized.includes("argumentsJson"), false);
  } finally { await f.cleanup(); }
});
