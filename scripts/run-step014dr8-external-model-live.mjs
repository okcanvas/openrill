import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectExternalModelRunDiagnostics, formatExternalModelRunDiagnostics } from "./step014dr1-live-diagnostics.mjs";
import { startLocalHost } from "../services/agent-host/dist/index.js";
import { LocalProtocolClient } from "../apps/agent-web/dist/api/local-protocol-client.js";
import { getLoopbackJson } from "./live-loopback-http.mjs";

const required=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`OPENRILL_STEP014D_PREREQUISITE_MISSING:${name}`);return value;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const apiKey=required("OPENAI_API_KEY");
const model=required("OPENRILL_STEP014D_MODEL");
const endpoint=(process.env.OPENRILL_STEP014D_ENDPOINT?.trim()||"https://api.openai.com/v1").replace(/\/$/,"");
const root=await mkdtemp(join(tmpdir(),"openrill-step014dr8-model-live-"));
const workspace=join(root,"workspace");await mkdir(workspace,{recursive:true});
const profile="step014dr8-model-live";
const env={...process.env,OPENRILL_DATA_ROOT:join(root,"data"),OPENRILL_CONFIG_ROOT:join(root,"config"),OPENAI_API_KEY:apiKey,NO_COLOR:"1",NODE_DISABLE_COLORS:"1",TERM:"dumb"};
const config={version:1,host:{bind:"127.0.0.1",port:0},modelProviders:{default:{type:"openai-responses",endpoint,apiKey:{kind:"env",key:"OPENAI_API_KEY"},model,maxOutputTokens:512,maxRetries:1}},workspaces:[{id:"alpha",path:workspace,readOnly:false}],execution:{approvalMode:"deny",defaultTimeoutMs:10_000,approvalTimeoutMs:10_000},skills:{roots:[],enabled:[]},automation:{enabled:false},browser:{enabled:false,headless:true,launchTimeoutMs:20_000,actionTimeoutMs:10_000,idleTimeoutMs:60_000,sweepIntervalMs:60_000,maxSessions:1,maxPagesPerSession:1,allowPrivateNetwork:false,allowedHostnames:[]},ui:{openOnStart:false}};
let host;let client;let rootRunId=null;
try{
  host=await startLocalHost({profile,bind:"127.0.0.1",port:0,force:true,forceMinimumAgeMs:0,env,config,configRoot:env.OPENRILL_CONFIG_ROOT});await host.ready;
  const bootstrap=(await getLoopbackJson(`http://127.0.0.1:${host.port}/ui/bootstrap`,{label:"step014dr8-model-bootstrap",expectedStatus:200,maxBytes:1024*1024})).json;
  client=new LocalProtocolClient({url:`ws://127.0.0.1:${host.port}/protocol`,token:bootstrap.protocol.token,clientId:"step014dr8-model-live",clientVersion:"0.14.11-step014dr8",platform:process.platform});
  const accepted=await client.connect();const capabilities=new Set(accepted.capabilities.operations.map(item=>item.name));for(const operation of ["delegation.list","delegation.get"])assert.ok(capabilities.has(operation),operation);
  const conversation=await client.call("conversation.create",{workspaceId:"alpha",title:"STEP014DR8 external parallel delegated work"},"step014dr8:create");
  const prompt=[
    "This is a strict delegated-work acceptance. Use tools, do not simulate them in prose.",
    "Call agent.spawn twice without waiting.",
    "Child A task: Return exactly CHILD_ALPHA.",
    "Child B task: Return exactly CHILD_BETA.",
    "After both direct children were spawned, call agent.wait for each direct child.",
    "Finally return one concise line containing PARENT_COMBINED, CHILD_ALPHA, and CHILD_BETA.",
  ].join("\n");
  const sent=await client.call("conversation.send",{workspaceId:"alpha",conversationId:conversation.conversationId,submissionKey:"step014dr8:send",text:prompt},"step014dr8:send");rootRunId=sent.run.runId;
  let view;let items=[];const deadline=Date.now()+180_000;
  while(Date.now()<deadline){view=await client.call("conversation.get",{workspaceId:"alpha",conversationId:conversation.conversationId},`step014dr8:get:${Date.now()}`);items=(await client.call("delegation.list",{rootRunId,limit:20},`step014dr8:list:${Date.now()}`)).items;const run=view.runs.find(item=>item.runId===rootRunId);if(run?.status==="COMPLETED"&&items.length>=2&&items.every(item=>["COMPLETED","FAILED","CANCELLED","TIMED_OUT"].includes(item.status)))break;if(run&&["FAILED","CANCELLED"].includes(run.status))throw new Error(`OPENRILL_STEP014DR8_ROOT_RUN_FAILED:${JSON.stringify({status:run.status,items:items.map(item=>({depth:item.depth,status:item.status,errorCode:item.errorCode}))})}`);await wait(500);}
  const rootRun=view?.runs.find(item=>item.runId===rootRunId);assert.equal(rootRun?.status,"COMPLETED",`root run did not complete: ${JSON.stringify(rootRun)}`);
  const direct=items.filter(item=>item.depth===1);assert.ok(direct.length>=2,JSON.stringify(items.map(item=>({depth:item.depth,status:item.status}))));assert.ok(items.every(item=>item.status==="COMPLETED"),JSON.stringify(items.map(item=>({depth:item.depth,status:item.status,errorCode:item.errorCode}))));
  for(const item of direct){const detail=await client.call("delegation.get",{delegationId:item.delegationId},`step014dr8:detail:${item.delegationId}`);assert.equal(detail.delegationId,item.delegationId);assert.equal(JSON.stringify(detail).includes("taskSha256"),false);assert.equal(JSON.stringify(detail).includes("reasoning"),false);}
  const finalAssistant=[...view.messages].reverse().find(message=>message.role==="assistant"&&message.content?.type==="assistant"&&message.content.text)?.content.text??"";for(const marker of ["PARENT_COMBINED","CHILD_ALPHA","CHILD_BETA"])assert.ok(finalAssistant.includes(marker),`missing ${marker}: ${finalAssistant}`);
  console.log(`STEP014DR8_EXTERNAL_MODEL_PARALLEL_PASS model=${model} root_run=${rootRunId} direct_children=${direct.length} delegations=${items.length}`);
}catch(error){if(rootRunId){const databasePath=join(env.OPENRILL_DATA_ROOT,profile,"state","agent.db");try{const diagnostics=collectExternalModelRunDiagnostics(databasePath,rootRunId);process.stderr.write(`${formatExternalModelRunDiagnostics({model,endpointOrigin:new URL(endpoint).origin,...diagnostics})}\n`);}catch(diagnosticError){process.stderr.write(`OPENRILL_STEP014DR1_ROOT_FAILURE_DIAGNOSTICS_UNAVAILABLE ${JSON.stringify({name:diagnosticError instanceof Error?diagnosticError.name:"UnknownError",message:diagnosticError instanceof Error?diagnosticError.message.slice(0,512):String(diagnosticError).slice(0,512)})}\n`);}}throw error;}finally{client?.close();await host?.close("step014dr8-model-live").catch(()=>undefined);await host?.closed.catch(()=>undefined);await rm(root,{recursive:true,force:true}).catch(()=>undefined);}
