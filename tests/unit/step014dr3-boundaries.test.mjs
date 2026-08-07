import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const root=new URL("../../",import.meta.url);
const read=relative=>readFile(new URL(relative,root),"utf8");

test("STEP014DR3 Windows hidden failure hash exactly identifies a blank Tool name dispatch",()=>{
  const message="tool not found: ";
  assert.equal(message.length,16);
  assert.equal(createHash("sha256").update(message).digest("hex"),"45600058b9dfe037667b24cb7c9aec83965189c5de30f5a57504f5407d04f806");
});

test("STEP014DR3 adapter binds item and call identities into one accumulator",async()=>{
  const source=await read("packages/model-openai-responses/src/index.ts");
  for(const token of ["ToolAccumulatorState","byIdentity","resolveToolAccumulator","call_id","item_id","itemId","callId"])assert.match(source,new RegExp(token));
  assert.doesNotMatch(source,/const callId = readString\([^\n]+"call_id"\) \?\? readString\([^\n]+"item_id"\)/);
});

test("STEP014DR3 adapter rejects empty names and identity collisions before dispatch",async()=>{
  const source=await read("packages/model-openai-responses/src/index.ts");
  assert.match(source,/completed function call has no name/);
  assert.match(source,/function-call identities resolve to different calls/);
  assert.match(source,/MODEL_STREAM_INVALID/);
});

test("STEP014DR3 diagnostics expose Tool identity without Tool payload",async()=>{
  const source=await read("scripts/step014dr1-live-diagnostics.mjs");
  for(const token of ["recentToolEvents","tool.started","tool.completed","tool.replayed","toolCallId","name","isError"])assert.match(source,new RegExp(token.replace(".","\\.")));
  assert.doesNotMatch(source,/arguments_json|conversation_messages|tool_results|reasoning|transcript/i);
});
