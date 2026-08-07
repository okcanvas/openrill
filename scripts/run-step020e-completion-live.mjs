import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const STEP="STEP020E_DURABLE_TASK_COMPLETION_DELIVERY_CONTROLLER_WAKE_AND_REQUIRED_COMPLETION_SEMANTICS";
const VERSION="0.20.5-step020e";
const SCHEMA=22;
const LIVE_HARNESS="STEP020E_H1_DURABLE_COMPLETION_DELIVERY_CONTROLLER_WAKE_RESTART_AND_SEMANTICS";
if(process.platform!=="win32") throw new Error("OPENRILL_STEP020E_WINDOWS_REQUIRED");
function spawnCapture(args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:process.cwd(),env:{...process.env,NO_COLOR:"1",NODE_DISABLE_COLORS:"1"},stdio:["ignore","pipe","pipe"]});let output="";child.stdout.setEncoding("utf8");child.stderr.setEncoding("utf8");child.stdout.on("data",c=>{output+=c;process.stdout.write(c)});child.stderr.on("data",c=>{output+=c;process.stderr.write(c)});child.once("error",reject);child.once("exit",code=>resolve({code:code??1,output}));});}
const tests=[
  "tests/unit/task-completion-delivery-step020e.test.mjs",
  "tests/unit/task-completion-host-step020e.test.mjs",
  "tests/unit/task-completion-migration-step020e.test.mjs",
];
const focused=await spawnCapture(["--test","--test-concurrency=1","--test-reporter=tap",...tests]);
const tap=(name)=>Number([...focused.output.matchAll(new RegExp(`^# ${name} (\\d+)$`,"gm"))].at(-1)?.[1]??-1);
const checks=[]; const check=(name,value,detail="")=>checks.push({name,passed:Boolean(value),detail});
check("platform",process.platform==="win32",process.platform);
check("focused-exit",focused.code===0,String(focused.code));
check("focused-tests",tap("tests")===10,String(tap("tests")));
check("focused-pass",tap("pass")===10,String(tap("pass")));
check("focused-fail",tap("fail")===0,String(tap("fail")));
check("focused-skipped",tap("skipped")===0,String(tap("skipped")));
const stateRuntime=await import(new URL("../packages/state/dist/index.js",import.meta.url));
const pkg=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
check("schema",Number(stateRuntime.OPENRILL_STATE_SCHEMA_VERSION)===SCHEMA,String(stateRuntime.OPENRILL_STATE_SCHEMA_VERSION));
check("version",pkg.version===VERSION,String(pkg.version));
check("required-semantics",focused.output.includes("distinguishes concrete deliverables from empty and progress-only output"));
check("atomic-intent",focused.output.includes("atomically records semantic outcome and durable delivery intent"));
check("rollback",focused.output.includes("rolls back Run and Task terminal state together"));
check("durable-drain",focused.output.includes("survives reopen"));
check("decision-required",focused.output.includes("without a successful controller decision fails delivery"));
check("cancellation-suppression",focused.output.includes("suppresses controller wake"));
check("upgrade-backfill",focused.output.includes("backfills only safely-owned active terminal child Tasks"));
check("host-finish",focused.output.includes("finishes the Flow"));
check("host-block",focused.output.includes("durably blocks the Flow"));
check("host-restart",focused.output.includes("same queued controller wake Run"));
const passed=checks.filter(i=>i.passed).length; const state=passed===checks.length?"PASSED":"FAILED";
console.log(`${STEP} checks=${passed}/${checks.length} state=${state} version=${VERSION} schema=${SCHEMA} delivery=DURABLE_TASK_EVENT semantics=REQUIRED_COMPLETION controller=OWNER_CONVERSATION_WAKE queue=SYSTEM_MESSAGE_WAKE_RUN restart=PENDING_DRAIN_IDENTITY_STABLE scope=CONTROLLER_TOOLS_DURABLE decision=EXPLICIT_TOOL_REQUIRED migration=TERMINAL_CHILD_SAFE_BACKFILL flow=CONTROLLER_OWNED_OUTCOME plan_executor=DEFERRED provider=SCRIPTED_LOCAL live_harness=${LIVE_HARNESS}`);
for(const item of checks.filter(i=>!i.passed)) console.error(`OPENRILL_STEP020E_LIVE_FAILURE check=${item.name} detail=${item.detail}`);
if(state!=="PASSED") process.exitCode=1;
