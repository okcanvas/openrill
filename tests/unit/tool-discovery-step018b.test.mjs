import test from "node:test";
import assert from "node:assert/strict";
import { ToolRegistry } from "../../packages/tool-runtime/dist/index.js";
import {
  DEFAULT_DIRECT_TOOL_NAMES,
  TOOL_CALL_NAME,
  TOOL_DESCRIBE_NAME,
  TOOL_SEARCH_NAME,
  registerToolDiscoveryTools,
  resolveToolDiscoveryView,
} from "../../packages/tool-discovery/dist/index.js";

function register(registry, name, description = name, execute = (input) => ({ output: { name, input }, isError: false })) {
  registry.register({
    name,
    description,
    inputSchema: { type: "object", properties: { value: { type: "string" } }, additionalProperties: false },
    validateInput: (input) => input && typeof input === "object" && !Array.isArray(input),
    execute,
  });
}

function fixture() {
  const registry = new ToolRegistry();
  for (const name of DEFAULT_DIRECT_TOOL_NAMES) register(registry, name);
  register(registry, "workspace.patch", "Apply a precise patch to a workspace file");
  register(registry, "browser.page.screenshot", "Capture a screenshot of the current browser page");
  register(registry, "agent.spawn", "Delegate a bounded task to a child Agent");
  register(registry, "automation.create", "Create a scheduled durable automation");
  register(registry, "workspace.write", "Write or replace one workspace file");
  register(registry, "process.tail", "Read bounded output from a running process");
  registerToolDiscoveryTools(registry);
  return registry;
}

const context = { runId: "run-1", attemptId: "attempt-1", workspaceId: "alpha", conversationId: "conversation-1", toolCallId: "call-1" };

test("STEP018B compacts a large catalog while retaining controls and Skill-preferred schemas", () => {
  const registry = fixture();
  const view = resolveToolDiscoveryView(registry, { preferredToolNames: ["workspace.patch"] });
  assert.equal(view.compacted, true);
  assert.equal(view.visibleNames.includes("workspace.patch"), true);
  assert.equal(view.visibleNames.includes("browser.page.screenshot"), false);
  assert.equal(view.visibleNames.includes(TOOL_SEARCH_NAME), true);
  assert.equal(view.visibleNames.includes(TOOL_DESCRIBE_NAME), true);
  assert.equal(view.visibleNames.includes(TOOL_CALL_NAME), true);
});

test("STEP018B tool.search ranks capability intent without returning full schemas", async () => {
  const registry = fixture();
  const result = await registry.execute(TOOL_SEARCH_NAME, { query: "modify a file precisely", limit: 3 }, context);
  assert.equal(result.isError, false);
  assert.equal(result.output.results[0].name, "workspace.patch");
  assert.equal("inputSchema" in result.output.results[0], false);
});

test("STEP018B tool.describe returns one exact schema and unknown tools fail typed", async () => {
  const registry = fixture();
  const described = await registry.execute(TOOL_DESCRIBE_NAME, { name: "browser.page.screenshot" }, context);
  assert.equal(described.isError, false);
  assert.equal(described.output.name, "browser.page.screenshot");
  assert.equal(described.output.inputSchema.additionalProperties, false);
  const missing = await registry.execute(TOOL_DESCRIBE_NAME, { name: "missing.tool" }, context);
  assert.equal(missing.isError, true);
  assert.equal(missing.output.error.code, "TOOL_NOT_FOUND");
});

test("STEP018B tool.call executes a hidden target with the original execution context", async () => {
  const registry = fixture();
  const called = await registry.execute(TOOL_CALL_NAME, { name: "workspace.patch", arguments: { value: "x" } }, context);
  assert.equal(called.isError, false);
  assert.equal(called.output.tool, "workspace.patch");
  assert.equal(called.output.result.name, "workspace.patch");
  const recursive = await registry.execute(TOOL_CALL_NAME, { name: TOOL_CALL_NAME, arguments: {} }, context);
  assert.equal(recursive.isError, true);
  assert.equal(recursive.output.error.code, "TOOL_CALL_RECURSION_DENIED");
});

test("STEP018B tool.call cannot bypass a durable delegated Tool scope", async () => {
  const registry = fixture();
  const denied = await registry.execute(TOOL_CALL_NAME, { name: "workspace.patch", arguments: {} }, {
    ...context,
    allowedToolNames: ["workspace.read"],
  });
  assert.equal(denied.isError, true);
  assert.equal(denied.output.error.code, "TOOL_NOT_ALLOWED");
  const allowed = await registry.execute(TOOL_CALL_NAME, { name: "workspace.patch", arguments: {} }, {
    ...context,
    allowedToolNames: ["workspace.patch"],
  });
  assert.equal(allowed.isError, false);
});
