import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const STEP="STEP020BR1_TASK_FLOW_OWNER_SCOPE_AND_CANCEL_ADMISSION_CLOSURE";
const VERSION="0.20.2-step020br1";
const SCHEMA=20;
const LIVE_HARNESS="STEP020BR1_H1_TASK_FLOW_OWNER_SCOPE_CANCEL_ADMISSION_AND_RESTART";
if (process.platform !== "win32") throw new Error("OPENRILL_STEP020BR1_WINDOWS_REQUIRED");

function spawnCapture(args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:process.cwd(),env:{...process.env,NO_COLOR:"1",NODE_DISABLE_COLORS:"1"},stdio:["ignore","pipe","pipe"]});let output="";child.stdout.setEncoding("utf8");child.stderr.setEncoding("utf8");child.stdout.on("data",c=>{output+=c;process.stdout.write(c)});child.stderr.on("data",c=>{output+=c;process.stderr.write(c)});child.once("error",reject);child.once("exit",code=>resolve({code:code??1,output}));});}
const tests=["tests/unit/task-flow-owner-scope-step020br1.test.mjs","tests/unit/task-flow-registry-step020b.test.mjs","tests/unit/task-flow-protocol-step020b.test.mjs","tests/unit/task-flow-host-step020b.test.mjs"];
const focused=await spawnCapture(["--test","--test-concurrency=1","--test-reporter=tap",...tests]);
const tap=(name)=>Number([...focused.output.matchAll(new RegExp(`^# ${name} (\\d+)$`,"gm"))].at(-1)?.[1]??-1);
const checks=[]; const check=(name,value,detail="")=>checks.push({name,passed:Boolean(value),detail});
check("platform",process.platform==="win32",process.platform); check("focused-exit",focused.code===0,String(focused.code));
check("focused-tests",tap("tests")===10,String(tap("tests"))); check("focused-pass",tap("pass")===10,String(tap("pass"))); check("focused-fail",tap("fail")===0,String(tap("fail"))); check("focused-skipped",tap("skipped")===0,String(tap("skipped")));
const stateRuntime=await import(new URL("../packages/state/dist/index.js",import.meta.url));
const pkg=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
check("schema",Number(stateRuntime.OPENRILL_STATE_SCHEMA_VERSION)===SCHEMA,String(stateRuntime.OPENRILL_STATE_SCHEMA_VERSION)); check("version",pkg.version===VERSION,String(pkg.version));
check("owner",focused.output.includes("cross-owner Task admission fails closed")); check("migration",focused.output.includes("backfills single-owner flows")); check("cancel-admission",focused.output.includes("cancellation request closes new Task admission")); check("replay",focused.output.includes("preserving exact link replay")); check("restart",focused.output.includes("Host restart preserves Task Flow identity")); check("protocol",focused.output.includes("taskFlow.list, taskFlow.get, and taskFlow.cancel"));
const passed=checks.filter(i=>i.passed).length; const state=passed===checks.length?"PASSED":"FAILED";
console.log(`${STEP} checks=${passed}/${checks.length} state=${state} version=${VERSION} schema=${SCHEMA} owner=CONVERSATION_SCOPED migration=LEGACY_ISOLATED admission=CANCEL_REQUEST_CLOSED replay=EXACT_LINK_STABLE reverse=TASK_TO_FLOW restart=FLOW_IDENTITY_STABLE executor=DEFERRED provider=SCRIPTED_LOCAL live_harness=${LIVE_HARNESS}`);
for(const item of checks.filter(i=>!i.passed)) console.error(`OPENRILL_STEP020BR1_LIVE_FAILURE check=${item.name} detail=${item.detail}`);
if(state!=="PASSED") process.exitCode=1;
