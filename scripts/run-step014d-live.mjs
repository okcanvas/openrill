import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectExternalModelRunDiagnostics, formatExternalModelRunDiagnostics } from "./step014dr1-live-diagnostics.mjs";
import { startLocalHost } from "../services/agent-host/dist/index.js";
import { LocalProtocolClient } from "../apps/agent-web/dist/api/local-protocol-client.js";
import { captureChildSpawnFailure, describeChromiumSpawnFailure, resolveChromiumExecutable } from "./chromium-executable.mjs";
import { CONTROL_UI_MODULE_ENTRYPOINT, controlUiModuleEntrypointFromHtml } from "./control-ui-static-contract.mjs";
import { getLoopbackJson, getLoopbackText } from "./live-loopback-http.mjs";


class CdpClient {
  #socket; #nextId=1; #pending=new Map();
  constructor(url){this.url=url;}
  async connect(){
    this.#socket=new WebSocket(this.url);
    await new Promise((resolve,reject)=>{this.#socket.addEventListener("open",resolve,{once:true});this.#socket.addEventListener("error",reject,{once:true});});
    this.#socket.addEventListener("message",event=>{
      const message=JSON.parse(String(event.data));
      if(!message.id)return;
      const pending=this.#pending.get(message.id);if(!pending)return;this.#pending.delete(message.id);
      if(message.error)pending.reject(new Error(`${pending.method}:${message.error.message}`));else pending.resolve(message.result??{});
    });
  }
  call(method,params={}){const id=this.#nextId++;return new Promise((resolve,reject)=>{this.#pending.set(id,{resolve,reject,method});this.#socket.send(JSON.stringify({id,method,params}));});}
  close(){this.#socket?.close();}
}
async function waitUntil(predicate,description,timeoutMs=20_000){
  const deadline=Date.now()+timeoutMs;let detail;
  while(Date.now()<deadline){try{const value=await predicate();if(value)return value;detail=value;}catch(error){detail=error;}await wait(100);}
  throw new Error(`OPENRILL_STEP014D_WAIT_TIMEOUT:${description}:${detail instanceof Error?detail.message:JSON.stringify(detail)}`);
}
async function launchUiBrowser(url,userData){
  const resolved=await resolveChromiumExecutable();
  const child=spawn(resolved.executable,["--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage","--disable-background-networking","--disable-component-update","--disable-default-apps","--no-first-run","--no-default-browser-check","--remote-debugging-port=0",`--user-data-dir=${userData}`,"about:blank"],{stdio:["ignore","pipe","pipe"]});
  let output="";child.stdout.on("data",chunk=>{output+=chunk;});child.stderr.on("data",chunk=>{output+=chunk;});
  const spawnState=captureChildSpawnFailure(child,{executable:resolved.executable,onDiagnostic:detail=>{output+=`${detail}\n`;}});
  const activePort=join(userData,"DevToolsActivePort");
  const port=await waitUntil(async()=>{
    if(spawnState.failure)throw new Error(describeChromiumSpawnFailure(spawnState.failure,resolved.executable),{cause:spawnState.failure});
    if(child.exitCode!==null)throw new Error(`Chromium exited ${child.exitCode}:${output}`);
    try{return Number((await readFile(activePort,"utf8")).split(/\r?\n/,1)[0])||false;}catch{return false;}
  },"chromium-devtools-port",30_000);
  const target=await waitUntil(async()=>{const targets=(await getLoopbackJson(`http://127.0.0.1:${port}/json/list`,{label:"step014d-chromium-targets",expectedStatus:200,maxBytes:1024*1024})).json;return targets.find(item=>item.type==="page"&&item.webSocketDebuggerUrl)||false;},"chromium-page-target",10_000);
  const cdp=new CdpClient(target.webSocketDebuggerUrl);await cdp.connect();await cdp.call("Page.enable");await cdp.call("Runtime.enable");
  const navigation=await cdp.call("Page.navigate",{url});if(navigation.errorText)throw new Error(`OPENRILL_STEP014D_UI_NAVIGATION_FAILED:${navigation.errorText}`);
  return {child,cdp,executable:resolved};
}
async function evaluate(cdp,expression){const result=await cdp.call("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw new Error(`OPENRILL_STEP014D_UI_EVALUATION_FAILED:${JSON.stringify(result.exceptionDetails)}`);return result.result?.value;}
async function closeUiBrowser(browser){
  if(!browser)return;browser.cdp.close();
  if(browser.child.exitCode===null)browser.child.kill();
  await waitUntil(()=>browser.child.exitCode!==null,"chromium-exit",10_000).catch(()=>undefined);
  if(browser.child.exitCode===null&&process.platform==="win32")await new Promise(resolve=>{const killer=spawn("taskkill",["/PID",String(browser.child.pid),"/T","/F"],{stdio:"ignore"});killer.once("exit",resolve);});
  if(browser.child.exitCode===null)throw new Error(`OPENRILL_STEP014D_CHROMIUM_ORPHAN:${browser.child.pid}`);
}

const required=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`OPENRILL_STEP014D_PREREQUISITE_MISSING:${name}`);return value;};
const apiKey=required("OPENAI_API_KEY");
const model=required("OPENRILL_STEP014D_MODEL");
const endpoint=(process.env.OPENRILL_STEP014D_ENDPOINT?.trim()||"https://api.openai.com/v1").replace(/\/$/,"");
const root=await mkdtemp(join(tmpdir(),"openrill-step014d-live-"));
const workspace=join(root,"workspace");
await mkdir(workspace,{recursive:true});
const profile="step014d-live";
const env={...process.env,OPENRILL_DATA_ROOT:join(root,"data"),OPENRILL_CONFIG_ROOT:join(root,"config"),OPENAI_API_KEY:apiKey,NO_COLOR:"1",NODE_DISABLE_COLORS:"1",TERM:"dumb"};
const config={
  version:1,host:{bind:"127.0.0.1",port:0},
  modelProviders:{default:{type:"openai-responses",endpoint,apiKey:{kind:"env",key:"OPENAI_API_KEY"},model,maxOutputTokens:512,maxRetries:1}},
  workspaces:[{id:"alpha",path:workspace,readOnly:false}],
  execution:{approvalMode:"deny",defaultTimeoutMs:10_000,approvalTimeoutMs:10_000},
  skills:{roots:[],enabled:[]},automation:{enabled:false},
  browser:{enabled:false,headless:true,launchTimeoutMs:20_000,actionTimeoutMs:10_000,idleTimeoutMs:60_000,sweepIntervalMs:60_000,maxSessions:1,maxPagesPerSession:1,allowPrivateNetwork:false,allowedHostnames:[]},
  ui:{openOnStart:false},
};
let host; let client; let uiBrowser; let rootRunId = null;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  host=await startLocalHost({profile,bind:"127.0.0.1",port:0,force:true,forceMinimumAgeMs:0,env,config,configRoot:env.OPENRILL_CONFIG_ROOT});
  await host.ready;
  const bootstrap=(await getLoopbackJson(`http://127.0.0.1:${host.port}/ui/bootstrap`,{label:"step014d-ui-bootstrap",expectedStatus:200,maxBytes:1024*1024})).json;
  client=new LocalProtocolClient({url:`ws://127.0.0.1:${host.port}/protocol`,token:bootstrap.protocol.token,clientId:"step014d-live",clientVersion:"0.14.3-step014d",platform:process.platform});
  const accepted=await client.connect();
  const capabilities=new Set(accepted.capabilities.operations.map(item=>item.name));
  for(const operation of ["delegation.list","delegation.get","delegation.cancel"])assert.ok(capabilities.has(operation),operation);
  const conversation=await client.call("conversation.create",{workspaceId:"alpha",title:"STEP014D external delegated work"},"step014d:create");
  const prompt=[
    "This is a strict delegated-work acceptance. Use tools, do not simulate them in prose.",
    "First call agent.spawn twice without waiting.",
    "Child A task: Return exactly CHILD_ALPHA.",
    "Child B must be created with maxNestedDepth=1. Its task: call agent.spawn once for a grandchild whose task is Return exactly GRAND_BETA; call agent.wait for that grandchild; then return exactly CHILD_BETA: GRAND_BETA.",
    "After both direct children were spawned, call agent.wait for each direct child.",
    "Finally return one concise line containing PARENT_COMBINED, CHILD_ALPHA, CHILD_BETA, and GRAND_BETA.",
  ].join("\n");
  const sent=await client.call("conversation.send",{workspaceId:"alpha",conversationId:conversation.conversationId,submissionKey:"step014d:send",text:prompt},"step014d:send");
  rootRunId=sent.run.runId;
  let view; let items=[];
  const deadline=Date.now()+180_000;
  while(Date.now()<deadline){
    view=await client.call("conversation.get",{workspaceId:"alpha",conversationId:conversation.conversationId},`step014d:get:${Date.now()}`);
    items=(await client.call("delegation.list",{rootRunId,limit:20},`step014d:list:${Date.now()}`)).items;
    const run=view.runs.find(item=>item.runId===rootRunId);
    if(run?.status==="COMPLETED"&&items.every(item=>["COMPLETED","FAILED","CANCELLED","TIMED_OUT"].includes(item.status)))break;
    if(run&&["FAILED","CANCELLED"].includes(run.status))throw new Error(`OPENRILL_STEP014D_ROOT_RUN_FAILED:${JSON.stringify({status:run.status,items:items.map(item=>({depth:item.depth,status:item.status,errorCode:item.errorCode}))})}`);
    await wait(500);
  }
  const rootRun=view?.runs.find(item=>item.runId===rootRunId);
  assert.equal(rootRun?.status,"COMPLETED",`root run did not complete: ${JSON.stringify(rootRun)}`);
  assert.ok(items.filter(item=>item.depth===1).length>=2,JSON.stringify(items.map(item=>({depth:item.depth,status:item.status}))));
  assert.ok(items.some(item=>item.depth===2),JSON.stringify(items.map(item=>({depth:item.depth,status:item.status}))));
  assert.ok(items.every(item=>item.status==="COMPLETED"),JSON.stringify(items.map(item=>({depth:item.depth,status:item.status,errorCode:item.errorCode}))));
  for(const item of items){
    const detail=await client.call("delegation.get",{delegationId:item.delegationId},`step014d:detail:${item.delegationId}`);
    assert.equal(detail.delegationId,item.delegationId);
    assert.ok(Array.isArray(detail.events));
    assert.equal(JSON.stringify(detail).includes("taskSha256"),false);
    assert.equal(JSON.stringify(detail).includes("reasoning"),false);
  }
  const finalAssistant=[...view.messages].reverse().find(message=>message.role==="assistant"&&message.content?.type==="assistant"&&message.content.text)?.content.text??"";
  for(const marker of ["PARENT_COMBINED","CHILD_ALPHA","CHILD_BETA","GRAND_BETA"])assert.ok(finalAssistant.includes(marker),`missing ${marker}: ${finalAssistant}`);
  const uiBase=`http://127.0.0.1:${host.port}`;
  const indexResponse=await getLoopbackText(`${uiBase}/`,{label:"step014d-ui-index",expectedStatus:200,maxBytes:1024*1024});
  const servedEntrypoint=controlUiModuleEntrypointFromHtml(indexResponse.text);
  assert.equal(servedEntrypoint,CONTROL_UI_MODULE_ENTRYPOINT);
  const appResponse=await getLoopbackText(new URL(servedEntrypoint,uiBase),{label:"step014d-ui-module",expectedStatus:200,maxBytes:4*1024*1024});
  const appSource=appResponse.text;
  for(const marker of ["delegation.list","delegation.get","delegation.cancel","Cancel subtree"])assert.ok(appSource.includes(marker),marker);

  const chromiumRoot=join(root,"chromium");await mkdir(chromiumRoot,{recursive:true});
  uiBrowser=await launchUiBrowser(`http://127.0.0.1:${host.port}/`,chromiumRoot);
  await waitUntil(()=>evaluate(uiBrowser.cdp,`Boolean(document.querySelector('[data-testid="nav-delegations"]'))`),"delegation-nav");
  assert.equal(await evaluate(uiBrowser.cdp,`(()=>{document.querySelector('[data-testid="nav-delegations"]').click();return true;})()`),true);
  await waitUntil(()=>evaluate(uiBrowser.cdp,`document.querySelectorAll('[data-testid^="delegation-"][data-depth]').length>=${items.length}`),"delegation-tree-render");
  assert.equal(await evaluate(uiBrowser.cdp,`(()=>{const row=document.querySelector('[data-testid^="delegation-"][data-depth]');if(!row)return false;row.click();return true;})()`),true);
  await waitUntil(()=>evaluate(uiBrowser.cdp,`Boolean(document.querySelector('[data-testid="delegation-detail"]')?.textContent?.includes('Usage'))`),"delegation-detail-render");
  const rendered=await evaluate(uiBrowser.cdp,`({rows:document.querySelectorAll('[data-testid^="delegation-"][data-depth]').length,depth2:document.querySelectorAll('[data-depth="2"]').length,detail:document.querySelector('[data-testid="delegation-detail"]')?.textContent??'',body:document.body.textContent??''})`);
  assert.ok(rendered.rows>=items.length,JSON.stringify(rendered));assert.ok(rendered.depth2>=1,JSON.stringify(rendered));
  for(const privateMarker of ["taskSha256","reasoning","Raw child transcript"])assert.equal(rendered.body.includes(privateMarker),false,privateMarker);
  await closeUiBrowser(uiBrowser);uiBrowser=undefined;
  console.log(`STEP014D_EXTERNAL_MODEL_DELEGATED_WORK_PASS model=${model} root_run=${rootRunId} delegations=${items.length} depth2=${items.filter(item=>item.depth===2).length} protocol=3 ui=CHROMIUM_TREE_AND_BOUNDED_DETAIL chromium_orphan=0`);
} catch (error) {
  if (rootRunId) {
    const databasePath = join(env.OPENRILL_DATA_ROOT, profile, "state", "agent.db");
    try {
      const diagnostics = collectExternalModelRunDiagnostics(databasePath, rootRunId);
      process.stderr.write(`${formatExternalModelRunDiagnostics({
        model,
        endpointOrigin: new URL(endpoint).origin,
        ...diagnostics,
      })}\n`);
    } catch (diagnosticError) {
      process.stderr.write(`OPENRILL_STEP014DR1_ROOT_FAILURE_DIAGNOSTICS_UNAVAILABLE ${JSON.stringify({
        name: diagnosticError instanceof Error ? diagnosticError.name : "UnknownError",
        message: diagnosticError instanceof Error ? diagnosticError.message.slice(0, 512) : String(diagnosticError).slice(0, 512),
      })}\n`);
    }
  }
  throw error;
} finally {
  await closeUiBrowser(uiBrowser).catch(()=>undefined);
  client?.close();
  await host?.close("step014d-live").catch(()=>undefined);
  await host?.closed.catch(()=>undefined);
  await rm(root,{recursive:true,force:true}).catch(()=>undefined);
}
