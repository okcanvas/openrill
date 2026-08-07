import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { loadStep021aLiveMarkerContract, renderStep021aLiveMarker } from "./step021a-live-marker.mjs";
const contract=await loadStep021aLiveMarkerContract();
if(process.platform!=="win32") throw new Error("OPENRILL_STEP021A_WINDOWS_REQUIRED");
function spawnCapture(args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:process.cwd(),env:{...process.env,NO_COLOR:"1",NODE_DISABLE_COLORS:"1"},stdio:["ignore","pipe","pipe"]});let output="";child.stdout.setEncoding("utf8");child.stderr.setEncoding("utf8");child.stdout.on("data",c=>{output+=c;process.stdout.write(c)});child.stderr.on("data",c=>{output+=c;process.stderr.write(c)});child.once("error",reject);child.once("exit",code=>resolve({code:code??1,output}));});}
const tests=[
 "tests/unit/goal-plan-executor-step021a.test.mjs",
 "tests/unit/goal-plan-executor-protocol-step021a.test.mjs",
 "tests/unit/goal-plan-executor-host-step021a.test.mjs",
];
const focused=await spawnCapture(["--test","--test-concurrency=1","--test-reporter=tap",...tests]);
const tap=(name)=>Number([...focused.output.matchAll(new RegExp(`^# ${name} (\\d+)$`,"gm"))].at(-1)?.[1]??-1);
const checks=[];const check=(name,value,detail="")=>checks.push({name,passed:Boolean(value),detail});
check("platform",process.platform==="win32",process.platform);check("focused-exit",focused.code===0,String(focused.code));
check("focused-tests",tap("tests")===12,String(tap("tests")));check("focused-pass",tap("pass")===12,String(tap("pass")));check("focused-fail",tap("fail")===0,String(tap("fail")));check("focused-skipped",tap("skipped")===0,String(tap("skipped")));
const stateRuntime=await import(new URL("../packages/state/dist/index.js",import.meta.url));const pkg=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
check("schema",Number(stateRuntime.OPENRILL_STATE_SCHEMA_VERSION)===Number(contract.schema),String(stateRuntime.OPENRILL_STATE_SCHEMA_VERSION));check("version",pkg.version===contract.version,String(pkg.version));
check("start",focused.output.includes("creates one durable Goal execution, Flow, and first child admission"));
check("replay",focused.output.includes("exact replay"));
check("semantic",focused.output.includes("semantic completion advances exactly one ordered Step"));
check("blocked",focused.output.includes("BLOCKED completion stops later admission"));
check("resume",focused.output.includes("explicit resume creates a new Task attempt"));
check("rollback",focused.output.includes("rollback leaves no orphan Run, Task, Flow link, or Step binding"));
check("completion-guard",focused.output.includes("all required Steps must semantically succeed"));
check("active-restart",focused.output.includes("restart recovery preserves the same Goal, Flow, Step, Task"));
check("controller-restart",focused.output.includes("leaves the next READY Step for the durable controller decision"));
check("mutation-ownership",focused.output.includes("blocks generic Goal and Plan mutations"));
check("cancel-recovery",focused.output.includes("projects a Flow cancellation that committed before Goal cancellation projection"));
check("protocol",focused.output.includes("owner-scoped Goal execution start/get/resume/cancel"));
check("host-loop",focused.output.includes("closes the ordered Goal Plan loop"));
check("host-restart",focused.output.includes("Host restart resumes the same active Plan Step Task"));
const passed=checks.filter(i=>i.passed).length;const state=passed===checks.length?"PASSED":"FAILED";
console.log(renderStep021aLiveMarker(contract,{passed,total:checks.length,state}));
for(const item of checks.filter(i=>!i.passed))console.error(`OPENRILL_STEP021A_LIVE_FAILURE check=${item.name} detail=${item.detail}`);
if(state!=="PASSED")process.exitCode=1;
