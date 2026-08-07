import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const STEP="STEP019A_DURABLE_GOAL_PLAN_AND_LONG_RUNNING_TASK_STATE";
const VERSION="0.19.0-step019a";
const SCHEMA=17;
const LIVE_HARNESS="STEP019A_H1_STATE_SCHEMA_SOURCE_OF_TRUTH_ALIGNMENT";
if (process.platform !== "win32") throw new Error("OPENRILL_STEP019A_WINDOWS_REQUIRED");

function spawnCapture(args) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,args,{cwd:process.cwd(),env:{...process.env,NO_COLOR:"1",NODE_DISABLE_COLORS:"1"},stdio:["ignore","pipe","pipe"]});
    let output="";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data",chunk=>{output+=chunk;process.stdout.write(chunk);});
    child.stderr.on("data",chunk=>{output+=chunk;process.stderr.write(chunk);});
    child.once("error",reject); child.once("exit",code=>resolve({code:code??1,output}));
  });
}
const checks=[]; const check=(name,value,detail="")=>checks.push({name,passed:Boolean(value),detail});
const tests=["tests/unit/goal-plan-step019a.test.mjs","tests/unit/goal-host-step019a.test.mjs"];
const focused=await spawnCapture(["--test","--test-concurrency=1","--test-reporter=tap",...tests]);
const tap=(name)=>Number([...focused.output.matchAll(new RegExp(`^# ${name} (\\d+)$`,"gm"))].at(-1)?.[1]??-1);
check("platform",process.platform==="win32",process.platform);
check("focused-exit",focused.code===0,String(focused.code));
check("focused-tests",tap("tests")===4,String(tap("tests")));
check("focused-pass",tap("pass")===4,String(tap("pass")));
check("focused-fail",tap("fail")===0,String(tap("fail")));
check("focused-skipped",tap("skipped")===0,String(tap("skipped")));
const stateRuntime=await import(new URL("../packages/state/dist/index.js",import.meta.url));
const runtimeSchema=Number(stateRuntime.OPENRILL_STATE_SCHEMA_VERSION);
const pkg=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
check("schema",runtimeSchema===SCHEMA,String(runtimeSchema));
check("version",pkg.version===VERSION,String(pkg.version));
check("no-external-model",!focused.output.includes("OPENAI_API_KEY")&&!focused.output.includes("Bearer "));
check("host-restart-evidence",focused.output.includes("STEP019A Host injects durable active-goal context after restart"));
const passed=checks.filter(x=>x.passed).length; const state=passed===checks.length?"PASSED":"FAILED";
console.log(`${STEP} checks=${passed}/${checks.length} state=${state} version=${VERSION} schema=${SCHEMA} goal=DURABLE_CONVERSATION plan=REVISIONED_ORDERED task_state=CHECKPOINTED_PROGRESS continuation=HOST_RESTART_INJECTED blocker=THREE_CONSECUTIVE completion=ALL_STEPS_REQUIRED provider=SCRIPTED_LOCAL live_harness=${LIVE_HARNESS} openclaw_reference=GOAL_TASK_FLOW_SOURCE_AUDITED external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM cleanup=QUIESCENT`);
for(const item of checks.filter(x=>!x.passed)) console.log(`OPENRILL_STEP019A_LIVE_FAILURE check=${item.name} detail=${item.detail}`);
if(state!=="PASSED") process.exitCode=1;
