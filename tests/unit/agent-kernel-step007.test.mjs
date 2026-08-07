import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { createScriptedModelAdapter, ModelAdapterError } from "../../packages/model-adapter/dist/index.js";
import { executeAgentRun } from "../../packages/agent-kernel/dist/index.js";
import { ToolRegistry } from "../../packages/tool-runtime/dist/index.js";

async function fixture(turns, configureTools=()=>{}) {
  const root=await mkdtemp(join(tmpdir(),"openrill-step007-"));
  const env={OPENRILL_DATA_ROOT:join(root,"data"),OPENRILL_CONFIG_ROOT:join(root,"config")};
  const paths=resolveProfilePaths({profile:"kernel",env});
  const state=await openOpenRillStateDatabase({profilePaths:paths});
  const conversations=new ConversationService({state,workspaceIds:["alpha"]});
  const conversation=conversations.create({workspaceId:"alpha",modelProfile:"default"});
  const sent=conversations.send({workspaceId:"alpha",conversationId:conversation.conversationId,submissionKey:"s1",text:"hello"});
  const adapter=createScriptedModelAdapter({turns});
  const tools=new ToolRegistry(); configureTools(tools);
  return {root,state,conversations,runId:sent.run.runId,adapter,tools,cleanup:async()=>{state.close();await rm(root,{recursive:true,force:true});}};
}
const resolver=(adapter,maxRetries=0)=>({resolve:()=>({profile:"default",adapter,provider:"fixture",model:"fixture-model",maxOutputTokens:128,maxRetries})});

test("text-only model stream completes a durable run",async()=>{const f=await fixture([{kind:"events",events:[{type:"started",providerResponseId:"r1"},{type:"text_delta",delta:"done"},{type:"usage",usage:{inputTokens:3,outputTokens:1,totalTokens:4}},{type:"completed",stopReason:"stop",providerResponseId:"r1"}]}]);try{const out=await executeAgentRun({runId:f.runId,conversations:f.conversations,modelAdapters:resolver(f.adapter),tools:f.tools});assert.equal(out.status,"COMPLETED");const view=f.conversations.executionContext(f.runId);assert.equal(view.run.status,"COMPLETED");assert.equal(view.attempt.modelCallCount,1);assert.equal(view.messages.at(-1).content.text,"done");assert.equal(f.conversations.modelInvocations(f.runId).length,1);}finally{await f.cleanup();}});

test("tool calls execute sequentially and feed results into the next turn",async()=>{const order=[];const f=await fixture([{kind:"events",events:[{type:"tool_call",toolCallId:"c1",name:"echo",argumentsJson:'{"value":"x"}'},{type:"completed",stopReason:"tool_calls"}]},{kind:"events",events:[{type:"text_delta",delta:"finished"},{type:"completed",stopReason:"stop"}]}],tools=>tools.register({name:"echo",description:"echo",inputSchema:{type:"object"},validateInput:x=>x&&typeof x==="object"&&typeof x.value==="string",execute:x=>{order.push(x.value);return{output:{echo:x.value},isError:false};}}));try{const out=await executeAgentRun({runId:f.runId,conversations:f.conversations,modelAdapters:resolver(f.adapter),tools:f.tools});assert.equal(out.status,"COMPLETED");assert.deepEqual(order,["x"]);assert.equal(out.usage.toolCalls,1);assert.equal(out.usage.modelCalls,2);}finally{await f.cleanup();}});

test("retryable failure before output is retried and counted",async()=>{const f=await fixture([{kind:"error",error:new ModelAdapterError("MODEL_TRANSPORT_FAILED","temporary",true)},{kind:"events",events:[{type:"text_delta",delta:"ok"},{type:"completed",stopReason:"stop"}]}]);try{const out=await executeAgentRun({runId:f.runId,conversations:f.conversations,modelAdapters:resolver(f.adapter,1),tools:f.tools});assert.equal(out.status,"COMPLETED");assert.equal(out.usage.modelCalls,2);assert.deepEqual(f.conversations.modelInvocations(f.runId).map(x=>x.status),["FAILED","COMPLETED"]);}finally{await f.cleanup();}});

test("model call budget fails closed",async()=>{const f=await fixture([{kind:"error",error:new ModelAdapterError("MODEL_TRANSPORT_FAILED","temporary",true)},{kind:"events",events:[{type:"completed",stopReason:"stop"}]}]);try{const out=await executeAgentRun({runId:f.runId,conversations:f.conversations,modelAdapters:resolver(f.adapter,1),tools:f.tools,budget:{maxModelCalls:1}});assert.equal(out.status,"FAILED");assert.equal(out.terminalReason,"AGENT_MODEL_CALL_BUDGET_EXCEEDED");}finally{await f.cleanup();}});
