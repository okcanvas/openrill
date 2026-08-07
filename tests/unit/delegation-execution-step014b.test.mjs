import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
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

function ids(prefix="step014b") { let n=0; return ()=>`${prefix}-${++n}`; }
const executionBudget={maxTurns:8,maxModelCalls:10,maxToolCalls:16,maxOutputTokens:128,maxTotalTokens:4096,maxDurationMs:60_000};
const rootBudget={...executionBudget,maxDelegationDepth:1,maxActiveChildren:1,maxTotalChildren:1};
async function fixture(name="delegation") {
  const root=await mkdtemp(join(tmpdir(),`openrill-step014b-${name}-`));
  const env={OPENRILL_DATA_ROOT:join(root,"data"),OPENRILL_CONFIG_ROOT:join(root,"config")};
  const state=await openOpenRillStateDatabase({profilePaths:resolveProfilePaths({profile:name,env})});
  const createId=ids(name); const now=()=>1000;
  const conversations=new ConversationService({state,workspaceIds:["alpha"],createId,now});
  const delegations=new DelegationService({state,workspaceIds:["alpha"],createId,now});
  const conversation=conversations.create({workspaceId:"alpha",modelProfile:"default"});
  const sent=conversations.send({workspaceId:"alpha",conversationId:conversation.conversationId,submissionKey:"root",text:"root task"});
  return {root,state,conversations,delegations,run:sent.run,now,cleanup:async()=>{if(state.isOpen())state.close();await rm(root,{recursive:true,force:true});}};
}
function configureRoot(f,tools=["agent.spawn","agent.wait","echo"]) { return f.delegations.configureRootBudget({runId:f.run.runId,budget:rootBudget,scope:{workspaceIds:["alpha"],skillIds:[],toolNames:tools}}); }
const resolver=(adapter)=>({resolve:()=>({profile:"default",adapter,provider:"fixture",model:"fixture",maxOutputTokens:128,maxRetries:0})});
function childInput(f, parentAttemptId=f.run.currentAttemptId) { return {parentRunId:f.run.runId,parentAttemptId,idempotencyKey:"child",task:"do child work",workspaceId:"alpha",budget:{maxTurns:2,maxModelCalls:2,maxToolCalls:1,maxOutputTokens:64,maxTotalTokens:256,maxDurationMs:30_000,maxDelegationDepth:0,maxActiveChildren:0,maxTotalChildren:0},scope:{workspaceIds:["alpha"],skillIds:[],toolNames:["echo"]},expectedOutput:"TEXT",parentToolCallId:"spawn-call"}; }

async function prepareWaitingParent(f) {
  configureRoot(f,["agent.wait","echo"]);
  const child=f.delegations.createDelegatedRun(childInput(f,f.run.currentAttemptId));
  f.delegations.transitionDelegation({delegationId:child.delegation.delegationId,status:"RUNNING"});
  const adapter=createScriptedModelAdapter({turns:[{kind:"events",events:[{type:"tool_call",toolCallId:"wait-call",name:"agent.wait",argumentsJson:JSON.stringify({delegationId:child.delegation.delegationId})},{type:"completed",stopReason:"tool_calls"}]}]});
  const tools=new ToolRegistry(); registerDelegationTools(tools,{delegations:f.delegations,scheduleChild:()=>true,now:f.now});
  const result=await executeAgentRun({runId:f.run.runId,conversations:f.conversations,delegations:f.delegations,modelAdapters:resolver(adapter),tools});
  return {child,result,tools};
}

test("migration 013 owns exactly-once delegation result delivery",async()=>{const f=await fixture("schema");try{assert.ok(f.state.schemaVersion>=13);assert.ok(f.state.appliedMigrations.some(m=>m.version===13&&m.name==="delegation_result_delivery"));const db=new DatabaseSync(f.state.diagnostics().databasePath,{readOnly:true});try{assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='run_delegation_result_deliveries'").get().name,"run_delegation_result_deliveries");}finally{db.close();}}finally{await f.cleanup();}});

test("agent.spawn and agent.wait publish two small closed schemas",async()=>{const f=await fixture("schemas");try{const tools=new ToolRegistry();registerDelegationTools(tools,{delegations:f.delegations,scheduleChild:()=>true,now:f.now});assert.deepEqual(tools.definitions().map(x=>x.name),["agent.spawn","agent.wait"]);for(const definition of tools.definitions())assert.equal(definition.inputSchema.additionalProperties,false);}finally{await f.cleanup();}});

test("agent.spawn creates one bounded child, schedules non-blocking, and never returns task text",async()=>{const f=await fixture("spawn");try{configureRoot(f);const started=f.conversations.startExecution({runId:f.run.runId,providerId:"fixture",modelId:"fixture",budget:executionBudget});const scheduled=[];const tools=new ToolRegistry();registerDelegationTools(tools,{delegations:f.delegations,scheduleChild:(runId)=>{scheduled.push(runId);return true;},now:f.now});const result=await tools.execute("agent.spawn",{task:"secret delegated task",toolNames:["echo"]},{runId:f.run.runId,attemptId:started.attempt.attemptId,workspaceId:"alpha",conversationId:started.conversation.conversationId,toolCallId:"spawn-1"});assert.equal(result.isError,false);assert.equal(scheduled.length,1);assert.equal(JSON.stringify(result.output).includes("secret delegated task"),false);const delegation=f.delegations.get(result.output.delegationId);assert.equal(delegation.status,"RUNNING");assert.deepEqual(delegation.toolNames,["echo"]);assert.equal(f.conversations.executionContext(delegation.childRunId).messages[0].content.text,"secret delegated task");}finally{await f.cleanup();}});

test("delegated Run model schema and dispatch both enforce durable Tool scope",async()=>{const f=await fixture("scope");try{configureRoot(f,["echo","forbidden"]);const parent=f.conversations.startExecution({runId:f.run.runId,providerId:"fixture",modelId:"fixture",budget:executionBudget});const child=f.delegations.createDelegatedRun(childInput(f,parent.attempt.attemptId));f.delegations.transitionDelegation({delegationId:child.delegation.delegationId,status:"RUNNING"});let visible=[];const adapter={async *stream(request){visible=request.tools.map(x=>x.name);yield {type:"tool_call",toolCallId:"bad",name:"forbidden",argumentsJson:"{}"};yield {type:"completed",stopReason:"tool_calls"};}};const tools=new ToolRegistry();for(const name of ["echo","forbidden"])tools.register({name,description:name,inputSchema:{type:"object",additionalProperties:false},validateInput:x=>x&&typeof x==="object",execute:()=>({output:{ok:true},isError:false})});const out=await executeAgentRun({runId:child.delegation.childRunId,conversations:f.conversations,delegations:f.delegations,modelAdapters:resolver(adapter),tools});assert.deepEqual(visible,["echo"]);assert.equal(out.status,"FAILED");assert.equal(out.terminalReason,"AGENT_TOOL_NOT_ALLOWED");}finally{await f.cleanup();}});

test("agent.wait durably pauses parent with ABORTED attempt and pending delivery",async()=>{const f=await fixture("wait");try{const {child,result}=await prepareWaitingParent(f);assert.equal(result.status,"WAITING_DELEGATION");const context=f.conversations.executionContext(f.run.runId);assert.equal(context.run.status,"CREATED");assert.equal(context.run.recoveryState,"RESUMABLE");assert.equal(context.attempt.status,"ABORTED");assert.equal(context.attempt.recoveryReason,"DELEGATION_WAIT");assert.equal(f.delegations.waitState(f.run.runId).state,"WAITING_DELEGATION");const delivery=f.state.transaction(r=>r.delegations.getResultDelivery(child.delegation.delegationId));assert.equal(delivery.status,"PENDING");assert.equal(delivery.parentToolCallId,"wait-call");}finally{await f.cleanup();}});

test("child terminal result is inserted exactly once and clears WAITING_DELEGATION",async()=>{const f=await fixture("delivery");try{const {child}=await prepareWaitingParent(f);const childContext=f.conversations.startExecution({runId:child.delegation.childRunId,providerId:"fixture",modelId:"fixture",budget:{maxTurns:2,maxModelCalls:2,maxToolCalls:1,maxOutputTokens:64,maxTotalTokens:256,maxDurationMs:30_000}});f.conversations.appendExecutionMessage({runId:child.delegation.childRunId,role:"assistant",content:{type:"assistant",text:"child result",reasoningSummary:null,toolCalls:[]}});f.conversations.completeExecution(child.delegation.childRunId,{turns:1,inputTokens:2,outputTokens:2,modelCalls:1,toolCalls:0},"stop");const first=f.delegations.completeChild(child.delegation.childRunId);const replay=f.delegations.completeChild(child.delegation.childRunId);assert.equal(first.resumeParent,true);assert.equal(replay.replayed,true);assert.equal(f.delegations.waitState(f.run.runId),null);const messages=f.conversations.executionContext(f.run.runId).messages.filter(m=>m.role==="tool"&&m.content.toolCallId==="wait-call");assert.equal(messages.length,1);assert.equal(messages[0].content.output.summary,"child result");const checkpoints=f.conversations.events(f.run.runId).filter(e=>e.eventType==="run.checkpoint"&&e.payload.toolCallId==="wait-call");assert.equal(checkpoints.length,1);void childContext;}finally{await f.cleanup();}});

test("parent resumes as attempt 2 from durable child result",async()=>{const f=await fixture("resume");try{const {child,tools}=await prepareWaitingParent(f);f.conversations.startExecution({runId:child.delegation.childRunId,providerId:"fixture",modelId:"fixture",budget:{maxTurns:2,maxModelCalls:2,maxToolCalls:1,maxOutputTokens:64,maxTotalTokens:256,maxDurationMs:30_000}});f.conversations.appendExecutionMessage({runId:child.delegation.childRunId,role:"assistant",content:{type:"assistant",text:"bounded child answer",reasoningSummary:null,toolCalls:[]}});f.conversations.completeExecution(child.delegation.childRunId,{turns:1,inputTokens:1,outputTokens:1,modelCalls:1,toolCalls:0},"stop");assert.equal(f.delegations.completeChild(child.delegation.childRunId).resumeParent,true);const adapter=createScriptedModelAdapter({turns:[{kind:"events",events:[{type:"text_delta",delta:"parent complete"},{type:"completed",stopReason:"stop"}]}]});const out=await executeAgentRun({runId:f.run.runId,conversations:f.conversations,delegations:f.delegations,modelAdapters:resolver(adapter),tools});assert.equal(out.status,"COMPLETED");const current=f.conversations.executionContext(f.run.runId);assert.equal(current.attempt.attemptNumber,2);assert.equal(current.messages.at(-1).content.text,"parent complete");}finally{await f.cleanup();}});

test("terminal child can be read immediately without pausing parent",async()=>{const f=await fixture("terminal");try{configureRoot(f);const parent=f.conversations.startExecution({runId:f.run.runId,providerId:"fixture",modelId:"fixture",budget:executionBudget});const child=f.delegations.createDelegatedRun(childInput(f,parent.attempt.attemptId));f.delegations.transitionDelegation({delegationId:child.delegation.delegationId,status:"RUNNING"});f.conversations.startExecution({runId:child.delegation.childRunId,providerId:"fixture",modelId:"fixture",budget:{maxTurns:2,maxModelCalls:2,maxToolCalls:1,maxOutputTokens:64,maxTotalTokens:256,maxDurationMs:30_000}});f.conversations.completeExecution(child.delegation.childRunId,{turns:1,inputTokens:0,outputTokens:0,modelCalls:1,toolCalls:0},"stop");f.delegations.completeChild(child.delegation.childRunId);const tools=new ToolRegistry();registerDelegationTools(tools,{delegations:f.delegations,scheduleChild:()=>true,now:f.now});const result=await tools.execute("agent.wait",{delegationId:child.delegation.delegationId},{runId:f.run.runId,attemptId:parent.attempt.attemptId,workspaceId:"alpha",conversationId:parent.conversation.conversationId,toolCallId:"terminal-wait"});assert.equal(result.isError,false);assert.equal(result.output.status,"COMPLETED");assert.equal(f.delegations.waitState(f.run.runId),null);}finally{await f.cleanup();}});

import { AgentRunCoordinator } from "../../services/agent-host/dist/index.js";

test("AgentRunCoordinator executes one child and resumes the same parent exactly once",async()=>{const f=await fixture("coordinator");let coordinator;try{
  const tools=new ToolRegistry();
  registerDelegationTools(tools,{delegations:f.delegations,scheduleChild:(runId)=>coordinator.ensureScheduled(runId),now:f.now});
  const adapter={providerId:"fixture",async *stream(request){
    const userText=request.messages.flatMap(m=>m.content).find(b=>b.type==="text")?.text ?? "";
    const toolResults=request.messages.flatMap(m=>m.content).filter(b=>b.type==="tool_result");
    if(userText==="delegated task") { await new Promise(r=>setTimeout(r,30)); yield {type:"text_delta",delta:"child evidence"}; yield {type:"completed",stopReason:"stop"}; return; }
    const spawnResult=toolResults.find(b=>b.name==="agent.spawn"); const waitResult=toolResults.find(b=>b.name==="agent.wait");
    if(!spawnResult){yield {type:"tool_call",toolCallId:"spawn-e2e",name:"agent.spawn",argumentsJson:JSON.stringify({task:"delegated task"})};yield {type:"completed",stopReason:"tool_calls"};return;}
    if(!waitResult){yield {type:"tool_call",toolCallId:"wait-e2e",name:"agent.wait",argumentsJson:JSON.stringify({delegationId:spawnResult.output.delegationId})};yield {type:"completed",stopReason:"tool_calls"};return;}
    yield {type:"text_delta",delta:`parent used ${waitResult.output.summary}`};yield {type:"completed",stopReason:"stop"};
  }};
  coordinator=new AgentRunCoordinator({
    conversations:f.conversations,delegations:f.delegations,tools,
    models:{resolve:()=>({profile:"default",adapter,provider:"fixture",model:"fixture",maxOutputTokens:128,maxRetries:0})},
    publishNotice(){},
    onRunTerminal:(result)=>{const completion=f.delegations.completeChild(result.runId);if(completion?.resumeParent)coordinator.resume(completion.parentRunId);},
  });
  const result=await coordinator.executeUntilTerminal(f.run.runId);
  assert.equal(result.status,"COMPLETED");
  const parent=f.conversations.executionContext(f.run.runId);assert.equal(parent.attempt.attemptNumber,2);assert.equal(parent.messages.at(-1).content.text,"parent used child evidence");
  const db=new DatabaseSync(f.state.diagnostics().databasePath,{readOnly:true});const attempts=db.prepare("SELECT attempt_number attemptNumber,status,recovery_reason recoveryReason FROM run_attempts WHERE run_id=? ORDER BY attempt_number").all(f.run.runId);db.close();assert.deepEqual(attempts.map(a=>[a.attemptNumber,a.status,a.recoveryReason]),[[1,"ABORTED","DELEGATION_WAIT"],[2,"COMPLETED",null]]);
  const descendants=f.delegations.descendants(f.run.runId);assert.equal(descendants.length,1);assert.equal(descendants[0].status,"COMPLETED");
  assert.equal(parent.messages.filter(m=>m.role==="tool"&&m.content.name==="agent.wait").length,1);
}finally{await coordinator?.close();await f.cleanup();}});
