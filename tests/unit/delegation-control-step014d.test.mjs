import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ConversationService, DelegationService } from "../../packages/conversations/dist/index.js";
import {
  validateDelegationListInput,
  validateDelegationGetInput,
  validateDelegationCancelInput,
} from "../../packages/protocol/dist/index.js";
import { createDefaultOperationRegistry } from "../../services/agent-host/dist/transport/operation-registry.js";

function ids(prefix="step014d") { let value=0; return ()=>`${prefix}-${++value}`; }
const executionBudget={maxTurns:8,maxModelCalls:8,maxToolCalls:8,maxOutputTokens:128,maxTotalTokens:2_000,maxDurationMs:60_000};
const rootBudget={...executionBudget,maxDelegationDepth:2,maxActiveChildren:2,maxTotalChildren:4};
async function fixture(name) {
  const root=await mkdtemp(join(tmpdir(),`openrill-step014d-${name}-`));
  const paths=resolveProfilePaths({profile:name,env:{OPENRILL_DATA_ROOT:join(root,"data"),OPENRILL_CONFIG_ROOT:join(root,"config")}});
  const state=await openOpenRillStateDatabase({profilePaths:paths});
  const createId=ids(name); let clock=10_000; const now=()=>clock;
  const conversations=new ConversationService({state,workspaceIds:["alpha"],createId,now});
  const delegations=new DelegationService({state,workspaceIds:["alpha"],createId,now});
  const conversation=conversations.create({workspaceId:"alpha",modelProfile:"default",title:"root"});
  const sent=conversations.send({workspaceId:"alpha",conversationId:conversation.conversationId,submissionKey:"root",text:"root task"});
  delegations.configureRootBudget({runId:sent.run.runId,budget:rootBudget,scope:{workspaceIds:["alpha"],skillIds:[],toolNames:["agent.spawn","agent.wait"]}});
  return {root,state,conversations,delegations,run:sent.run,now,setNow:(value)=>{clock=value;},cleanup:async()=>{if(state.isOpen())state.close();await rm(root,{recursive:true,force:true});}};
}
function spawn(f,key="child") {
  return f.delegations.createDelegatedRun({
    parentRunId:f.run.runId,parentAttemptId:f.run.currentAttemptId,idempotencyKey:key,task:`private ${key} task`,workspaceId:"alpha",
    budget:{maxTurns:3,maxModelCalls:3,maxToolCalls:2,maxOutputTokens:64,maxTotalTokens:300,maxDurationMs:10_000,maxDelegationDepth:1,maxActiveChildren:1,maxTotalChildren:1},
    scope:{workspaceIds:["alpha"],skillIds:[],toolNames:["agent.wait"]},expectedOutput:"TEXT",parentToolCallId:`spawn-${key}`,
  });
}
function complete(f, childRunId, text="bounded result") {
  const budget=f.delegations.budget(childRunId);
  f.conversations.startExecution({runId:childRunId,providerId:"fixture",modelId:"fixture",budget:{maxTurns:budget.maxTurns,maxModelCalls:budget.maxModelCalls,maxToolCalls:budget.maxToolCalls,maxOutputTokens:budget.maxOutputTokens,maxTotalTokens:budget.maxTotalTokens,maxDurationMs:budget.maxDurationMs}});
  f.conversations.appendExecutionMessage({runId:childRunId,role:"assistant",content:{type:"assistant",text,reasoningSummary:"private reasoning",toolCalls:[]}});
  f.conversations.completeExecution(childRunId,{turns:1,inputTokens:4,outputTokens:3,modelCalls:1,toolCalls:0},"stop");
  return f.delegations.completeChild(childRunId);
}

test("delegation Protocol inputs are closed and bounded",()=>{
  assert.equal(validateDelegationListInput({limit:200}).ok,true);
  assert.equal(validateDelegationListInput({rootRunId:"root-1",parentRunId:"parent-1"}).ok,false);
  assert.equal(validateDelegationListInput({limit:201}).ok,false);
  assert.equal(validateDelegationListInput({status:"UNKNOWN"}).ok,false);
  assert.equal(validateDelegationGetInput({delegationId:"delegation-1"}).ok,true);
  assert.equal(validateDelegationGetInput({delegationId:"delegation-1",extra:true}).ok,false);
  assert.equal(validateDelegationCancelInput({delegationId:"delegation-1"}).ok,true);
});

test("public delegation views expose bounded relation, usage, and event metadata without task or transcript",async()=>{
  const f=await fixture("public");
  try {
    const child=spawn(f);
    f.delegations.transitionDelegation({delegationId:child.delegation.delegationId,status:"RUNNING"});
    const view=f.delegations.getPublic(child.delegation.delegationId);
    assert.equal(view.parentRunId,f.run.runId);
    assert.equal(view.childRunId,child.delegation.childRunId);
    assert.equal(view.status,"RUNNING");
    assert.deepEqual(view.events.map((event)=>Object.keys(event).sort()),view.events.map(()=>["emittedAt","eventType","sequence"]));
    const json=JSON.stringify(view);
    assert.doesNotMatch(json,/private child task|taskSha256|reasoning|transcript|payload/i);
    assert.equal(f.delegations.listPublic({rootRunId:f.run.runId,limit:10}).length,1);
  } finally { await f.cleanup(); }
});

test("terminal public view exposes bounded result, artifacts, usage, and typed error only",async()=>{
  const f=await fixture("terminal");
  try {
    const child=spawn(f);
    f.delegations.transitionDelegation({delegationId:child.delegation.delegationId,status:"RUNNING"});
    complete(f,child.delegation.childRunId,"child answer");
    const view=f.delegations.getPublic(child.delegation.delegationId);
    assert.equal(view.status,"COMPLETED");
    assert.equal(view.summary,"child answer");
    assert.deepEqual(view.usage,{turns:1,inputTokens:4,outputTokens:3,modelCalls:1,toolCalls:0});
    assert.equal(view.errorCode,null);
    assert.doesNotMatch(JSON.stringify(view),/private reasoning/);
  } finally { await f.cleanup(); }
});

test("delegation operations publish three capabilities and preserve hook outputs",async()=>{
  const calls=[];
  const hooks={
    list:(input)=>{calls.push(["list",input]);return {items:[]};},
    get:(input)=>{calls.push(["get",input]);return {delegationId:input.delegationId,events:[]};},
    cancel:(input)=>{calls.push(["cancel",input]);return {delegation:{delegationId:input.delegationId},affectedRuns:2,replayed:false};},
  };
  const conversations={};
  const registry=createDefaultOperationRegistry(()=>({product:"OpenRill",version:"test",profile:"test",pid:1,instanceId:"instance",bind:"127.0.0.1",port:1,startedAt:new Date(0).toISOString(),state:"READY",readiness:true}),conversations,undefined,undefined,undefined,undefined,undefined,hooks);
  const capabilities=registry.capabilities().filter((item)=>item.name.startsWith("delegation."));
  assert.deepEqual(capabilities,[
    {name:"delegation.cancel",permission:"delegation.write"},
    {name:"delegation.get",permission:"delegation.read"},
    {name:"delegation.list",permission:"delegation.read"},
  ]);
  assert.equal((await registry.invoke("1","delegation.list",{limit:10})).ok,true);
  assert.equal((await registry.invoke("2","delegation.get",{delegationId:"delegation-1"})).ok,true);
  assert.equal((await registry.invoke("3","delegation.cancel",{delegationId:"delegation-1"})).ok,true);
  assert.deepEqual(calls.map(([name])=>name),["list","get","cancel"]);
});

test("operator cancellation returns a terminal bounded view and replay is idempotent",async()=>{
  const f=await fixture("cancel");
  try {
    const child=spawn(f);
    const active=f.delegations.subtreeCancellationOrder(child.delegation.childRunId);
    assert.equal(active.length,1);
    const completion=f.delegations.terminateChild(child.delegation.childRunId,"CANCELLED","OPERATOR_CANCELLED");
    assert.equal(completion.result.errorCode,"OPERATOR_CANCELLED");
    const view=f.delegations.getPublic(child.delegation.delegationId);
    assert.equal(view.status,"CANCELLED");
    assert.equal(view.errorCode,"OPERATOR_CANCELLED");
    const eventsBefore=f.delegations.events(child.delegation.delegationId).length;
    const replay=f.delegations.terminateChild(child.delegation.childRunId,"CANCELLED","OPERATOR_CANCELLED");
    assert.equal(replay.result.errorCode,"OPERATOR_CANCELLED");
    assert.equal(f.delegations.events(child.delegation.delegationId).length,eventsBefore);
  } finally { await f.cleanup(); }
});
