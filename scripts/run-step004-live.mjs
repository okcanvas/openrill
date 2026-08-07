import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = await mkdtemp(join(tmpdir(), "openrill-step004-live-"));
const env = { ...process.env, OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config"), NO_COLOR: "1", NODE_DISABLE_COLORS: "1" };
const profile = "live";
const child = spawn(process.execPath, ["openrill.mjs", "start", "--profile", profile, "--port", "0"], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
let output = ""; child.stdout.on("data", (chunk) => { output += chunk.toString("utf8"); }); child.stderr.on("data", (chunk) => { output += chunk.toString("utf8"); });
const metadataPath = join(env.OPENRILL_DATA_ROOT, profile, "runtime", "host.json");
async function waitMetadata() { for (let i=0;i<100;i+=1) { try { return JSON.parse(await readFile(metadataPath,"utf8")); } catch {} await new Promise(r=>setTimeout(r,25)); } throw new Error(`metadata timeout: ${output}`); }
function collect(ws) { const q=[]; const waits=[]; ws.addEventListener("message",e=>{ const f=JSON.parse(String(e.data)); const i=waits.findIndex(w=>w.p(f)); if(i>=0){const [w]=waits.splice(i,1);clearTimeout(w.t);w.r(f);}else q.push(f);}); return (p=()=>true)=>{const i=q.findIndex(p);if(i>=0)return Promise.resolve(q.splice(i,1)[0]);return new Promise((r,j)=>{const t=setTimeout(()=>j(new Error("frame timeout")),1500);waits.push({p,r,j,t});});}; }
async function open(url,token) { const ws=new WebSocket(url,"openrill.local.v1"); const next=collect(ws); await new Promise((r,j)=>{ws.addEventListener("open",r,{once:true});ws.addEventListener("error",j,{once:true});}); ws.send(JSON.stringify({type:"open",minProtocol:1,maxProtocol:1,client:{id:"step004-live",version:"1",platform:process.platform,kind:"test"},credential:{kind:"profile-token",token}})); return {ws,next}; }
try {
  const metadata=await waitMetadata(); const url=`ws://127.0.0.1:${metadata.port}/protocol`;
  const good=await open(url,metadata.protocolToken); const accepted=await good.next(f=>f.type==="accepted"); if(accepted.protocol!==1) throw new Error("protocol mismatch");
  good.ws.send(JSON.stringify({type:"call",callId:"live-call",idempotencyKey:"live-key",operation:"diagnostics.ping",input:{echo:"live"}}));
  const result=await good.next(f=>f.type==="result"&&f.callId==="live-call"); if(!result.ok||result.output.echo!=="live") throw new Error("call failed"); good.ws.close();
  const bad=await open(url,"x".repeat(32)); const rejection=await bad.next(f=>f.type==="rejected"); if(rejection.code!=="AUTH_FAILED") throw new Error("bad token accepted");
  const stop=spawn(process.execPath,["openrill.mjs","stop","--profile",profile,"--json"],{cwd:process.cwd(),env,stdio:["ignore","pipe","pipe"]}); await new Promise((r,j)=>{stop.once("exit",c=>c===0?r():j(new Error(`stop exit ${c}`)));stop.once("error",j);});
  if (child.exitCode === null) await new Promise((r,j)=>{const t=setTimeout(()=>{child.kill();j(new Error("host exit timeout"));},3000);child.once("exit",()=>{clearTimeout(t);r();});});
  process.stdout.write("OPENRILL_STEP004_LIVE_PASS protocol=1 auth=PROFILE_TOKEN call=CORRELATED\n");
} finally { child.kill(); await rm(root,{recursive:true,force:true}); }
