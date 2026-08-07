import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const STEP="STEP020C_BOUND_TASK_FLOW_CONTROLLER_RUNTIME_AND_ATOMIC_CHILD_TASK_ADMISSION";
const VERSION="0.20.3-step020c";
const SCHEMA=20;
const LIVE_HARNESS="STEP020C_H1_BOUND_CONTROLLER_ATOMIC_CHILD_ADMISSION_RESTART_AND_CANCELLATION";
if(process.platform!=="win32") throw new Error("OPENRILL_STEP020C_WINDOWS_REQUIRED");
function spawnCapture(args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:process.cwd(),env:{...process.env,NO_COLOR:"1",NODE_DISABLE_COLORS:"1"},stdio:["ignore","pipe","pipe"]});let output="";child.stdout.setEncoding("utf8");child.stderr.setEncoding("utf8");child.stdout.on("data",c=>{output+=c;process.stdout.write(c)});child.stderr.on("data",c=>{output+=c;process.stderr.write(c)});child.once("error",reject);child.once("exit",code=>resolve({code:code??1,output}));});}
const tests=[
  "tests/unit/task-flow-controller-runtime-step020c.test.mjs",
  "tests/unit/task-flow-controller-protocol-step020c.test.mjs",
  "tests/unit/task-flow-controller-host-step020c.test.mjs",
  "tests/unit/task-flow-owner-scope-step020br1.test.mjs",
  "tests/unit/task-flow-registry-step020b.test.mjs",
  "tests/unit/task-flow-protocol-step020b.test.mjs",
  "tests/unit/task-flow-host-step020b.test.mjs",
];
const focused=await spawnCapture(["--test","--test-concurrency=1","--test-reporter=tap",...tests]);
const tap=(name)=>Number([...focused.output.matchAll(new RegExp(`^# ${name} (\\d+)$`,"gm"))].at(-1)?.[1]??-1);
const checks=[]; const check=(name,value,detail="")=>checks.push({name,passed:Boolean(value),detail});
check("platform",process.platform==="win32",process.platform); check("focused-exit",focused.code===0,String(focused.code));
check("focused-tests",tap("tests")===18,String(tap("tests"))); check("focused-pass",tap("pass")===18,String(tap("pass"))); check("focused-fail",tap("fail")===0,String(tap("fail"))); check("focused-skipped",tap("skipped")===0,String(tap("skipped")));
const stateRuntime=await import(new URL("../packages/state/dist/index.js",import.meta.url)); const pkg=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
check("schema",Number(stateRuntime.OPENRILL_STATE_SCHEMA_VERSION)===SCHEMA,String(stateRuntime.OPENRILL_STATE_SCHEMA_VERSION)); check("version",pkg.version===VERSION,String(pkg.version));
check("managed-create",focused.output.includes("deterministic managed Flow"));
check("atomic-admission",focused.output.includes("atomically creates Run, Task, classification, Flow link"));
check("rollback",focused.output.includes("post-Run admission failure rolls back"));
check("protocol",focused.output.includes("protocol exposes bound create/run/wait/resume/finish/fail"));
check("host-execution",focused.output.includes("Host controller creates and executes an atomic child Task"));
check("restart-replay",focused.output.includes("exact replay survives restart without terminal reschedule"));
check("cancellation",focused.output.includes("Host Flow cancellation cascades to an admitted child"));
const passed=checks.filter(i=>i.passed).length; const state=passed===checks.length?"PASSED":"FAILED";
console.log(`${STEP} checks=${passed}/${checks.length} state=${state} version=${VERSION} schema=${SCHEMA} controller=CONVERSATION_BOUND flow=DETERMINISTIC_MANAGED admission=ATOMIC_RUN_TASK_FLOW execution=HOST_SCHEDULED replay=IDENTITY_STABLE_TERMINAL_NOT_RESCHEDULED restart=RUNTIME_REBOUND cancellation=CHILD_CASCADE executor=EXISTING_RUN_COORDINATOR plan_executor=DEFERRED provider=SCRIPTED_LOCAL live_harness=${LIVE_HARNESS}`);
for(const item of checks.filter(i=>!i.passed)) console.error(`OPENRILL_STEP020C_LIVE_FAILURE check=${item.name} detail=${item.detail}`);
if(state!=="PASSED") process.exitCode=1;
