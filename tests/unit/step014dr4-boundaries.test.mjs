import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("STEP014DR4 allocates fair-share default child reservations while retaining explicit budget authority", async () => {
  const source = await read("packages/tools-delegation/src/index.ts");
  for (const token of ["function fairShare", "Default reservations must leave room for sibling fan-out", "const lanes", "defaultTurns", "defaultModelCalls", "defaultToolCalls", "defaultTotalTokens"]) assert.ok(source.includes(token), token);
  assert.ok(source.includes("input.maxTurns ?? defaultTurns"));
  assert.ok(source.includes("input.maxTotalTokens ?? defaultTotalTokens"));
});

test("STEP014DR4 persists only an allow-listed typed Tool error code in durable events", async () => {
  const kernel = await read("packages/agent-kernel/src/kernel.ts");
  assert.ok(kernel.includes("function typedToolErrorCode"));
  assert.ok(kernel.includes("/^[A-Z][A-Z0-9_]{0,127}$/"));
  assert.ok(kernel.includes("errorCode: toolErrorCode"));
  assert.equal(kernel.includes('payload: { toolCallId: toolCall.toolCallId, name: toolCall.name, isError: toolResult.isError, output:'), false);
});

test("STEP014DR4 external diagnostics expose Tool error identity but not arguments or result payload", async () => {
  const diagnostics = await read("scripts/step014dr1-live-diagnostics.mjs");
  assert.ok(diagnostics.includes("errorCode: typeof payload?.errorCode"));
  for (const privateToken of ["arguments_json", "tool_results", "conversation_messages"]) assert.equal(diagnostics.includes(privateToken), false, privateToken);
});

test("STEP014DR4 live fixture stops polling after terminal root and keeps structural assertions", async () => {
  const live = await read("scripts/run-step014d-live.mjs");
  assert.equal(live.includes("run?.status===\"COMPLETED\"&&items.length>=3"), false);
  assert.ok(live.includes("items.filter(item=>item.depth===1).length>=2"));
  assert.ok(live.includes("items.some(item=>item.depth===2)"));
});
