import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const STEP="STEP020D_TASK_AND_TASK_FLOW_RECONCILIATION_LOST_AND_RETENTION_FOUNDATION";
const VERSION="0.20.4-step020d";
const SCHEMA=21;
const LIVE_HARNESS="STEP020D_H1_TASK_FLOW_MAINTENANCE_RECONCILIATION_LOST_AND_RETENTION";
if(process.platform!=="win32") throw new Error("OPENRILL_STEP020D_WINDOWS_REQUIRED");
function spawnCapture(args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:process.cwd(),env:{...process.env,NO_COLOR:"1",NODE_DISABLE_COLORS:"1"},stdio:["ignore","pipe","pipe"]});let output="";child.stdout.setEncoding("utf8");child.stderr.setEncoding("utf8");child.stdout.on("data",c=>{output+=c;process.stdout.write(c)});child.stderr.on("data",c=>{output+=c;process.stderr.write(c)});child.once("error",reject);child.once("exit",code=>resolve({code:code??1,output}));});}
const tests=[
  "tests/unit/task-maintenance-step020d.test.mjs",
  "tests/unit/task-flow-maintenance-step020d.test.mjs",
  "tests/unit/maintenance-protocol-step020d.test.mjs",
  "tests/unit/maintenance-host-step020d.test.mjs",
];
const focused=await spawnCapture(["--test","--test-concurrency=1","--test-reporter=tap",...tests]);
const tap=(name)=>Number([...focused.output.matchAll(new RegExp(`^# ${name} (\\d+)$`,"gm"))].at(-1)?.[1]??-1);
const checks=[]; const check=(name,value,detail="")=>checks.push({name,passed:Boolean(value),detail});
check("platform",process.platform==="win32",process.platform);
check("focused-exit",focused.code===0,String(focused.code));
check("focused-tests",tap("tests")===8,String(tap("tests")));
check("focused-pass",tap("pass")===8,String(tap("pass")));
check("focused-fail",tap("fail")===0,String(tap("fail")));
check("focused-skipped",tap("skipped")===0,String(tap("skipped")));
const stateRuntime=await import(new URL("../packages/state/dist/index.js",import.meta.url));
const pkg=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
check("schema",Number(stateRuntime.OPENRILL_STATE_SCHEMA_VERSION)===SCHEMA,String(stateRuntime.OPENRILL_STATE_SCHEMA_VERSION));
check("version",pkg.version===VERSION,String(pkg.version));
check("task-projection",focused.output.includes("projects authoritative terminal Run state"));
check("authority-lost",focused.output.includes("runtime authority loss fails the owning Run"));
check("expected-idle",focused.output.includes("expected-idle Runs are not LOST"));
check("flow-cancellation",focused.output.includes("replays stuck cancellation"));
check("controller-owned",focused.output.includes("normal all-terminal Flow remains controller-owned"));
check("active-retention-protection",focused.output.includes("terminal Flow with active child stays report-only"));
check("closed-protocol",focused.output.includes("local protocol exposes closed Task and Task Flow audit"));
check("host-start",focused.output.includes("Host-start reconciliation repairs Task projection"));
const passed=checks.filter(i=>i.passed).length; const state=passed===checks.length?"PASSED":"FAILED";
console.log(`${STEP} checks=${passed}/${checks.length} state=${state} version=${VERSION} schema=${SCHEMA} maintenance=AUDIT_RECONCILE_RETENTION authority=RUN_RUNTIME_SOT lost=RECOVERY_GRACE_RUNTIME_AUTHORITY startup=SAFE_RECONCILE_NO_RETENTION flow=CONTROLLER_OWNED_OUTCOME cancellation=STUCK_REPLAY_FINALIZE retention=PREVIEW_SCHEDULE_NO_PRUNE idempotency=REPEATED_APPLY_STABLE plan_executor=DEFERRED provider=SCRIPTED_LOCAL live_harness=${LIVE_HARNESS}`);
for(const item of checks.filter(i=>!i.passed)) console.error(`OPENRILL_STEP020D_LIVE_FAILURE check=${item.name} detail=${item.detail}`);
if(state!=="PASSED") process.exitCode=1;
