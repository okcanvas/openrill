import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { createScriptedModelAdapter } from "../../packages/model-adapter/dist/index.js";
import { executeAgentRun } from "../../packages/agent-kernel/dist/index.js";
import { ToolRegistry } from "../../packages/tool-runtime/dist/index.js";
import { MemoryService, MEMORY_SYSTEM_INSTRUCTIONS } from "../../packages/memory/dist/index.js";
import { registerMemoryTools } from "../../packages/tools-memory/dist/index.js";

function resolver(adapter) {
  return { resolve: () => ({ profile: "default", adapter, provider: "fixture", model: "fixture-model", maxOutputTokens: 256, maxRetries: 0 }) };
}

async function createRun(conversations, workspaceId, text, key) {
  const conversation = conversations.create({ workspaceId, modelProfile: "default" });
  return conversations.send({ workspaceId, conversationId: conversation.conversationId, submissionKey: key, text });
}

test("STEP018A agent explicitly remembers in one Conversation and recalls in another", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step018a-agent-memory-"));
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") };
  const paths = resolveProfilePaths({ profile: "agent-memory", env });
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  try {
    const conversations = new ConversationService({ state, workspaceIds: ["alpha", "beta"] });
    const memory = new MemoryService(state, { createId: () => "memory-port-8084", now: (() => { let now = 1000; return () => ++now; })() });
    const tools = new ToolRegistry();
    registerMemoryTools(tools, memory);
    const requests = [];

    const first = await createRun(conversations, "alpha", "Remember that the project default port is 8084.", "remember-1");
    const rememberAdapter = createScriptedModelAdapter({
      onRequest: (request) => requests.push(request),
      turns: [
        { kind: "events", events: [
          { type: "tool_call", toolCallId: "remember-call", name: "memory.remember", argumentsJson: JSON.stringify({ text: "The project default port is 8084.", kind: "FACT" }) },
          { type: "completed", stopReason: "tool_calls" },
        ] },
        { kind: "events", events: [
          { type: "text_delta", delta: "Remembered." },
          { type: "completed", stopReason: "stop" },
        ] },
      ],
    });
    const remembered = await executeAgentRun({
      runId: first.run.runId,
      conversations,
      modelAdapters: resolver(rememberAdapter),
      tools,
      systemInstructions: `You are OpenRill.\n\n${MEMORY_SYSTEM_INSTRUCTIONS}`,
    });
    assert.equal(remembered.status, "COMPLETED");
    assert.equal(memory.list({ workspaceId: "alpha" }).length, 1);
    assert.match(requests[0].systemInstructions, /memory\.remember/);
    assert.equal(requests[0].tools.some((tool) => tool.name === "memory.search"), true);

    const second = await createRun(conversations, "alpha", "What is the project default port?", "recall-1");
    const recallRequests = [];
    const recallAdapter = createScriptedModelAdapter({
      onRequest: (request) => recallRequests.push(request),
      turns: [
        { kind: "events", events: [
          { type: "tool_call", toolCallId: "search-call", name: "memory.search", argumentsJson: JSON.stringify({ query: "project default port" }) },
          { type: "completed", stopReason: "tool_calls" },
        ] },
        { kind: "events", events: [
          { type: "tool_call", toolCallId: "get-call", name: "memory.get", argumentsJson: JSON.stringify({ memoryId: "memory-port-8084" }) },
          { type: "completed", stopReason: "tool_calls" },
        ] },
        { kind: "events", events: [
          { type: "text_delta", delta: "The project default port is 8084." },
          { type: "completed", stopReason: "stop" },
        ] },
      ],
    });
    const recalled = await executeAgentRun({
      runId: second.run.runId,
      conversations,
      modelAdapters: resolver(recallAdapter),
      tools,
      systemInstructions: `You are OpenRill.\n\n${MEMORY_SYSTEM_INSTRUCTIONS}`,
    });
    assert.equal(recalled.status, "COMPLETED");
    assert.equal(recalled.messages.at(-1).content[0].text, "The project default port is 8084.");
    const searchToolResult = recallRequests[1].messages.find((message) => message.role === "tool");
    assert.equal(searchToolResult.content[0].output.results[0].memoryId, "memory-port-8084");
    const getToolResults = recallRequests[2].messages.filter((message) => message.role === "tool");
    assert.equal(getToolResults.at(-1).content[0].output.text, "The project default port is 8084.");

    const other = await createRun(conversations, "beta", "What is the project default port?", "recall-beta");
    const otherAdapter = createScriptedModelAdapter({ turns: [
      { kind: "events", events: [
        { type: "tool_call", toolCallId: "search-beta", name: "memory.search", argumentsJson: JSON.stringify({ query: "project default port" }) },
        { type: "completed", stopReason: "tool_calls" },
      ] },
      { kind: "events", events: [
        { type: "text_delta", delta: "No workspace memory found." },
        { type: "completed", stopReason: "stop" },
      ] },
    ] });
    const isolated = await executeAgentRun({ runId: other.run.runId, conversations, modelAdapters: resolver(otherAdapter), tools, systemInstructions: MEMORY_SYSTEM_INSTRUCTIONS });
    assert.equal(isolated.status, "COMPLETED");
    const betaTool = isolated.messages.find((message) => message.role === "tool");
    assert.deepEqual(betaTool.content[0].output.results, []);
  } finally {
    state.close({ checkpointMode: "TRUNCATE" });
    await rm(root, { recursive: true, force: true });
  }
});
