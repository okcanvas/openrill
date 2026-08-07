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
import {
  TOOL_CALL_NAME,
  TOOL_DESCRIBE_NAME,
  TOOL_DISCOVERY_SYSTEM_INSTRUCTIONS,
  TOOL_SEARCH_NAME,
  registerToolDiscoveryTools,
  resolveToolDiscoveryView,
} from "../../packages/tool-discovery/dist/index.js";

const resolver = (adapter) => ({ resolve: () => ({ profile: "default", adapter, provider: "fixture", model: "fixture-model", maxOutputTokens: 128, maxRetries: 0 }) });

test("STEP018B Agent discovers and executes a hidden Tool through the compact bridge", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step018b-agent-tool-discovery-"));
  const paths = resolveProfilePaths({ profile: "tool-discovery", env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  try {
    const conversations = new ConversationService({ state, workspaceIds: ["alpha"] });
    const conversation = conversations.create({ workspaceId: "alpha", modelProfile: "default" });
    const sent = conversations.send({ workspaceId: "alpha", conversationId: conversation.conversationId, submissionKey: "discover", text: "Take a screenshot." });
    const registry = new ToolRegistry();
    for (const name of ["workspace.list", "workspace.stat", "workspace.read", "workspace.search", "memory.search", "memory.get", "process.run"]) {
      registry.register({ name, description: name, inputSchema: { type: "object", additionalProperties: false }, validateInput: (input) => input && typeof input === "object", execute: () => ({ output: { ok: true }, isError: false }) });
    }
    let screenshotCalls = 0;
    registry.register({
      name: "browser.page.screenshot",
      description: "Capture a screenshot of the active browser page",
      inputSchema: { type: "object", properties: { pageId: { type: "string" } }, required: ["pageId"], additionalProperties: false },
      validateInput: (input) => input && typeof input === "object" && typeof input.pageId === "string",
      execute: () => { screenshotCalls += 1; return { output: { artifactId: "shot-1" }, isError: false }; },
    });
    for (let index = 0; index < 8; index += 1) {
      registry.register({ name: `extra.tool.${index}`, description: `Extra capability ${index}`, inputSchema: { type: "object", additionalProperties: false }, validateInput: (input) => input && typeof input === "object", execute: () => ({ output: { index }, isError: false }) });
    }
    registerToolDiscoveryTools(registry);
    const view = resolveToolDiscoveryView(registry);
    assert.equal(view.compacted, true);
    const requests = [];
    const adapter = createScriptedModelAdapter({
      onRequest: (request) => requests.push(request),
      turns: [
        { kind: "events", events: [
          { type: "tool_call", toolCallId: "search", name: TOOL_SEARCH_NAME, argumentsJson: JSON.stringify({ query: "browser screenshot" }) },
          { type: "completed", stopReason: "tool_calls" },
        ] },
        { kind: "events", events: [
          { type: "tool_call", toolCallId: "describe", name: TOOL_DESCRIBE_NAME, argumentsJson: JSON.stringify({ name: "browser.page.screenshot" }) },
          { type: "completed", stopReason: "tool_calls" },
        ] },
        { kind: "events", events: [
          { type: "tool_call", toolCallId: "call", name: TOOL_CALL_NAME, argumentsJson: JSON.stringify({ name: "browser.page.screenshot", arguments: { pageId: "page-1" } }) },
          { type: "completed", stopReason: "tool_calls" },
        ] },
        { kind: "events", events: [
          { type: "text_delta", delta: "Screenshot captured." },
          { type: "completed", stopReason: "stop" },
        ] },
      ],
    });
    const result = await executeAgentRun({
      runId: sent.run.runId,
      conversations,
      modelAdapters: resolver(adapter),
      tools: registry,
      modelToolNames: view.visibleNames,
      systemInstructions: `You are OpenRill.${TOOL_DISCOVERY_SYSTEM_INSTRUCTIONS}`,
    });
    assert.equal(result.status, "COMPLETED");
    assert.equal(screenshotCalls, 1);
    assert.equal(requests[0].tools.some((tool) => tool.name === "browser.page.screenshot"), false);
    assert.equal(requests[0].tools.some((tool) => tool.name === TOOL_SEARCH_NAME), true);
    assert.equal(requests[2].messages.some((message) => message.role === "tool" && message.content[0].name === TOOL_DESCRIBE_NAME), true);
  } finally {
    state.close({ checkpointMode: "TRUNCATE" });
    await rm(root, { recursive: true, force: true });
  }
});
