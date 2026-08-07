import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const root = await mkdtemp(join(tmpdir(), "openrill-step002-live-"));
const env = { ...process.env, OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") };
const run = (args) => new Promise((resolve) => {
  const child=spawn(process.execPath,["openrill.mjs",...args],{cwd:process.cwd(),env,stdio:["ignore","pipe","pipe"]});
  let out="",err=""; child.stdout.on("data",c=>out+=c); child.stderr.on("data",c=>err+=c);
  child.on("exit",code=>resolve({code,out:out.trim(),err:err.trim()}));
});
const host=spawn(process.execPath,["openrill.mjs","start","--profile","live","--port","0","--json"],{cwd:process.cwd(),env,stdio:["ignore","pipe","pipe"]});
const hostExit = new Promise((resolve) => host.once("exit", resolve));
let buffer=""; let ready;
const readyPromise=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error("Host ready timeout")),10000);
  host.stdout.on("data",chunk=>{ buffer+=chunk.toString("utf8"); const line=buffer.split(/\r?\n/).find(v=>v.trim().startsWith("{")); if(line){clearTimeout(timer); try{ready=JSON.parse(line); resolve(ready);}catch(e){reject(e);}} });
  host.stderr.on("data",chunk=>process.stderr.write(chunk));
  host.on("exit",code=>{if(!ready){clearTimeout(timer);reject(new Error(`Host exited before ready code=${code}`));}});
});
try {
  const statusReady=await readyPromise;
  if(statusReady.state!=="READY" || statusReady.port<=0) throw new Error("invalid ready payload");
  const status=await run(["status","--profile","live","--json"]);
  if(status.code!==0 || JSON.parse(status.out).status.instanceId!==statusReady.instanceId) throw new Error(`status failed ${JSON.stringify(status)}`);
  const stop=await run(["stop","--profile","live","--json"]);
  if(stop.code!==0 || JSON.parse(stop.out).reason!=="STOPPED") throw new Error(`stop failed ${JSON.stringify(stop)}`);
  const exitCode=await hostExit;
  if(exitCode!==0) throw new Error(`Host exit code ${exitCode}`);
  const stopAgain=await run(["stop","--profile","live","--json"]);
  if(stopAgain.code!==0 || JSON.parse(stopAgain.out).reason!=="ALREADY_STOPPED") throw new Error("second stop not idempotent");
  process.stdout.write(`OPENRILL_STEP002_LIVE_PASS profile=live port=${statusReady.port} instance=${statusReady.instanceId}\n`);
} finally { if(host.exitCode===null) host.kill(); await rm(root,{recursive:true,force:true}); }
