import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createOsSecretProvider, resolveProfilePaths } from "../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../packages/state/dist/index.js";
import { waitForChildClose } from "./live-child-close.mjs";
import { evaluateLiveOutputPrivacy } from "./live-output-privacy.mjs";

const STEP = "STEP016C_LOCAL_MULTI_TURN_CONTINUATION_AND_RUNNING_HOST_ATTACHMENT";
const VERSION = "0.16.3-step016c";
const SCHEMA = 15;
const PROFILE = "step016c-live";
const SECRET_KEY = "model.step016c-live.api-key";
const MAX_OUTPUT_BYTES = 1_048_576;
const LIVE_HARNESS = "STEP016C_H2_AUTHORIZED_HISTORY_SECRET_REDACTION_ALIGNMENT";
const phase = (name, state, detail = "") => console.log(`OPENRILL_STEP016C_LIVE_PHASE name=${name} state=${state}${detail ? ` detail=${detail}` : ""}`);

class Collector {
  chunks=[]; bytes=0;
  push(chunk){const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);this.chunks.push(b);this.bytes+=b.length;while(this.bytes>MAX_OUTPUT_BYTES&&this.chunks.length){const f=this.chunks[0],o=this.bytes-MAX_OUTPUT_BYTES;if(f.length<=o){this.chunks.shift();this.bytes-=f.length;}else{this.chunks[0]=f.subarray(o);this.bytes-=o;}}}
  text(){return Buffer.concat(this.chunks).toString("utf8");}
}

async function runCli(args, env, input=null, timeoutMs=90_000){
  return await new Promise((resolveResult,reject)=>{
    const stdout=new Collector(),stderr=new Collector();let settled=false,timedOut=false;
    const child=spawn(process.execPath,[resolve("openrill.mjs"),...args],{cwd:resolve("."),env,shell:false,windowsHide:true,stdio:[input===null?"ignore":"pipe","pipe","pipe"]});
    child.stdout.on("data",c=>stdout.push(c));child.stderr.on("data",c=>stderr.push(c));
    const timer=setTimeout(()=>{timedOut=true;child.kill();},timeoutMs);
    child.once("error",e=>{if(settled)return;settled=true;clearTimeout(timer);reject(e);});
    child.once("close",(exitCode,signal)=>{if(settled)return;settled=true;clearTimeout(timer);resolveResult({exitCode,signal,timedOut,stdout:stdout.text(),stderr:stderr.text()});});
    if(input!==null)child.stdin.end(input,"utf8");
  });
}

async function startForegroundHost(env){
  const stdout=new Collector(),stderr=new Collector();
  const child=spawn(process.execPath,[resolve("openrill.mjs"),"start","--profile",PROFILE,"--port","0","--json"],{cwd:resolve("."),env,shell:false,windowsHide:true,stdio:["ignore","pipe","pipe"]});
  child.stdout.on("data",c=>stdout.push(c));child.stderr.on("data",c=>stderr.push(c));
  const deadline=Date.now()+30_000;
  while(Date.now()<deadline){
    const lines=stdout.text().trim().split(/\r?\n/).filter(Boolean);
    if(lines.length){
      try { const ready=JSON.parse(lines[0]); if(ready.readiness===true)return{child,ready,stdout,stderr}; } catch {}
    }
    if(child.exitCode!==null)throw new Error(`Host exited before READY: ${stderr.text()} ${stdout.text()}`);
    await new Promise(r=>setTimeout(r,50));
  }
  child.kill();throw new Error(`Host READY timeout: ${stderr.text()} ${stdout.text()}`);
}

function oneJson(result,label){const lines=result.stdout.trim().split(/\r?\n/).filter(Boolean);assert.equal(lines.length,1,`${label}: ${result.stdout} ${result.stderr}`);return JSON.parse(lines[0]);}
async function exists(path){try{await access(path);return true;}catch{return false;}}

async function startFixture(expectedAuth){
  const requests=[];const sockets=new Set();
  const server=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(Buffer.isBuffer(c)?c:Buffer.from(c));const body=JSON.parse(Buffer.concat(chunks).toString("utf8"));requests.push({auth:req.headers.authorization??null,body});
    if(req.headers.authorization!==expectedAuth){res.writeHead(401,{"content-type":"application/json"});res.end(JSON.stringify({error:{message:"bad auth"}}));return;}
    const text=`OPENRILL_STEP016C_LIVE_TURN_${requests.length}`;res.writeHead(200,{"content-type":"text/event-stream; charset=utf-8","cache-control":"no-cache",connection:"close"});
    for(const frame of [{type:"response.created",response:{id:`resp016c${requests.length}`}},{type:"response.output_text.delta",delta:text},{type:"response.completed",response:{id:`resp016c${requests.length}`,usage:{input_tokens:10+requests.length,output_tokens:4,total_tokens:14+requests.length}}}])res.write(`data: ${JSON.stringify(frame)}\n\n`);res.end();});
  server.on("connection",s=>{sockets.add(s);s.once("close",()=>sockets.delete(s));});
  await new Promise((r,j)=>{server.once("error",j);server.listen(0,"127.0.0.1",r);});const a=server.address();assert.equal(typeof a,"object");
  return{endpoint:`http://127.0.0.1:${a.port}/v1`,requests,close:async()=>{server.closeAllConnections?.();for(const s of sockets)s.destroy();await new Promise(r=>server.close(()=>r()));assert.equal(sockets.size,0);}};
}

if(process.platform!=="win32")throw new Error("OPENRILL_STEP016C_WINDOWS_DPAPI_REQUIRED");
const root=await mkdtemp(join(tmpdir(),"openrill-step016c-live-"));const workspace=join(root,"workspace");await mkdir(workspace,{recursive:true});
const env={...process.env,OPENRILL_DATA_ROOT:join(root,"data"),OPENRILL_CONFIG_ROOT:join(root,"config"),NO_COLOR:"1",NODE_DISABLE_COLORS:"1"};
const secret=`or-step016c-${randomBytes(32).toString("hex")}`;const fixture=await startFixture(`Bearer ${secret}`);const checks=[];const pass=(n,v,d="")=>{assert.equal(Boolean(v),true,`${n}${d?`: ${d}`:""}`);checks.push(n);};let host=null;
try{
  phase("setup","START");
  const setup=await runCli(["setup","--profile",PROFILE,"--workspace",workspace,"--workspace-id","default","--provider","default","--endpoint",fixture.endpoint,"--model","fixture-model","--secret-key",SECRET_KEY,"--api-key-stdin","--backend","host","--json"],env,`${secret}\n`);
  pass("setup",setup.exitCode===0&&!setup.timedOut,`${setup.stderr} ${setup.stdout}`);phase("setup","PASS");
  phase("host-start","START");host=await startForegroundHost(env);pass("host-ready",host.ready.readiness===true&&host.ready.profile===PROFILE);phase("host-start","PASS");
  phase("multi-turn","START");
  const firstPrompt="STEP016C live first turn";const firstResult=await runCli(["ask","--profile",PROFILE,"--json"],env,`${firstPrompt}\n`);pass("first-exit",firstResult.exitCode===0,`${firstResult.stderr} ${firstResult.stdout}`);const first=oneJson(firstResult,"first");
  pass("first-attached",first.hostMode==="RUNNING_ATTACHED"&&first.attachedInstanceId===host.ready.instanceId);pass("first-result",first.assistantText==="OPENRILL_STEP016C_LIVE_TURN_1");
  const secondPrompt="STEP016C live second turn";const secondResult=await runCli(["ask","--profile",PROFILE,"--conversation-id",first.conversationId,"--json"],env,`${secondPrompt}\n`);pass("second-exit",secondResult.exitCode===0,`${secondResult.stderr} ${secondResult.stdout}`);const second=oneJson(secondResult,"second");
  pass("same-conversation",second.conversationId===first.conversationId&&second.messageCount===4);pass("second-attached",second.hostMode==="RUNNING_ATTACHED"&&second.attachedInstanceId===host.ready.instanceId);pass("second-result",second.assistantText==="OPENRILL_STEP016C_LIVE_TURN_2");
  pass("fixture-count",fixture.requests.length===2);pass("fixture-auth",fixture.requests.every(r=>r.auth===`Bearer ${secret}`));
  const secondInput=fixture.requests[1].body.input;pass("history-users",secondInput.filter(x=>x.role==="user").map(x=>x.content).join("|")===`${firstPrompt}|${secondPrompt}`);pass("history-assistant",secondInput.some(x=>x.role==="assistant"&&x.content==="OPENRILL_STEP016C_LIVE_TURN_1"));
  phase("discovery","START");
  const list=await runCli(["conversation","list","--profile",PROFILE,"--json"],env);pass("list-exit",list.exitCode===0);const listed=oneJson(list,"list");pass("list-attached",listed.hostMode==="RUNNING_ATTACHED"&&listed.items.length===1&&listed.items[0].conversationId===first.conversationId);
  const show=await runCli(["conversation","show",first.conversationId,"--profile",PROFILE,"--json"],env);pass("show-exit",show.exitCode===0);const shown=oneJson(show,"show");pass("show-history",shown.conversation.messages.length===4&&shown.conversation.runs.length===2);phase("discovery","PASS");
  const status=await runCli(["status","--profile",PROFILE,"--json"],env);pass("host-preserved",status.exitCode===0&&oneJson(status,"status").running===true);
  const paths=resolveProfilePaths({profile:PROFILE,env,platform:"win32"});const db=await openOpenRillStateDatabase({profilePaths:paths});try{const e=db.transaction(r=>{const c=r.conversations.listConversations("default",10)[0];return{m:r.conversations.listMessages(c.conversationId),runs:r.conversations.listRuns(c.conversationId)}});pass("durable-multi-turn",e.m.length===4&&e.runs.length===2&&e.runs.every(x=>x.status==="COMPLETED"));}finally{db.close({checkpointMode:"TRUNCATE"});}
  phase("host-stop","START");
  const stop=await runCli(["stop","--profile",PROFILE,"--timeout-ms","10000","--json"],env);pass("stop",stop.exitCode===0,`${stop.stderr} ${stop.stdout}`);
  const hostExit=await waitForChildClose(host.child,{label:"step016c-host-stop",timeoutMs:15_000});
  pass("host-exit",hostExit.exitCode===0,`exitCode=${hostExit.exitCode} signal=${hostExit.signal}`);pass("host-clean",!(await exists(paths.metadataPath))&&!(await exists(paths.lockPath)));phase("host-stop","PASS");
  const privacy=evaluateLiveOutputPrivacy({
    secret,
    prompts:[firstPrompt,secondPrompt],
    transientOutputs:[setup,firstResult,secondResult,list,status,stop].map(x=>`${x.stdout}\n${x.stderr}`).concat(`${host.stdout.text()}\n${host.stderr.text()}`),
    authorizedHistoryOutputs:[`${show.stdout}\n${show.stderr}`],
  });
  pass("secret-redaction",privacy.secretRedacted);
  pass("prompt-not-echoed",privacy.promptsNotEchoedOutsideHistory);
  pass("authorized-history-visible",privacy.authorizedHistoryContainsPrompts);
  console.log(`${STEP} checks=${checks.length}/${checks.length} state=PASSED version=${VERSION} schema=${SCHEMA} live_harness=${LIVE_HARNESS} dpapi=WINDOWS_CURRENT_USER host=RUNNING_ATTACHED multi_turn=DURABLE_HISTORY continuation=PROTOCOL_EXECUTE discovery=LIST_SHOW host_ownership=PRESERVED redaction=SECRET_ONLY_HISTORY_AUTHORIZED external_model=NOT_RUN browser=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM cleanup=QUIESCENT`);
}finally{
  if(host && host.child.exitCode===null && host.child.signalCode===null){host.child.kill();await waitForChildClose(host.child,{label:"step016c-finally-kill",timeoutMs:10_000}).catch(()=>undefined);}
  await createOsSecretProvider({configRoot:join(env.OPENRILL_CONFIG_ROOT,PROFILE),platform:"win32",env}).delete(SECRET_KEY).catch(()=>undefined);
  await fixture.close().catch(()=>undefined);await rm(root,{recursive:true,force:true});
}
