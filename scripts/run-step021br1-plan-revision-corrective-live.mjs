import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { loadStep021br1LiveMarkerContract, renderStep021br1LiveMarker } from "./step021br1-live-marker.mjs";
import { parseNodeTapSummary } from "./node-tap-summary.mjs";
const contract=await loadStep021br1LiveMarkerContract();
if(process.platform!=="win32") throw new Error("OPENRILL_STEP021BR1_WINDOWS_REQUIRED");
function spawnCapture(args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:process.cwd(),env:{...process.env,NO_COLOR:"1",NODE_DISABLE_COLORS:"1"},stdio:["ignore","pipe","pipe"]});let output="";child.stdout.setEncoding("utf8");child.stderr.setEncoding("utf8");child.stdout.on("data",c=>{output+=c;process.stdout.write(c)});child.stderr.on("data",c=>{output+=c;process.stderr.write(c)});child.once("error",reject);child.once("exit",code=>resolve({code:code??1,output}));});}
const tests=[
 "tests/unit/goal-plan-executor-step021a.test.mjs","tests/unit/goal-plan-executor-protocol-step021a.test.mjs","tests/unit/goal-plan-executor-host-step021a.test.mjs",
 "tests/unit/goal-plan-revision-retry-step021b.test.mjs","tests/unit/goal-plan-revision-migration-step021b.test.mjs","tests/unit/goal-plan-revision-retry-protocol-step021b.test.mjs","tests/unit/goal-plan-revision-host-step021b.test.mjs",
];
const focused=await spawnCapture(["--test","--test-concurrency=1","--test-reporter=tap",...tests]);
const tapSummary=parseNodeTapSummary(focused.output);
const tap=(name)=>tapSummary[name]??-1;
const checks=[];const check=(name,value,detail="")=>checks.push({name,passed:Boolean(value),detail});
check("platform",process.platform==="win32",process.platform);check("focused-exit",focused.code===0,String(focused.code));
check("focused-tests",tap("tests")===22,String(tap("tests")));check("focused-pass",tap("pass")===22,String(tap("pass")));check("focused-fail",tap("fail")===0,String(tap("fail")));check("focused-skipped",tap("skipped")===0,String(tap("skipped")));
const stateRuntime=await import(new URL("../packages/state/dist/index.js",import.meta.url));const pkg=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
check("schema",Number(stateRuntime.OPENRILL_STATE_SCHEMA_VERSION)===Number(contract.schema),String(stateRuntime.OPENRILL_STATE_SCHEMA_VERSION));check("version",pkg.version===contract.version,String(pkg.version));
check("immutable-snapshot",focused.output.includes("pins active execution to an immutable Plan snapshot"));
check("revision-replay",focused.output.includes("newer revision is created and replayed"));
check("stable-adoption",focused.output.includes("explicit adoption preserves completed stable Steps"));
check("changed-step-reset",focused.output.includes("changed completed Step is reset"));
check("pinned-projection-isolation",focused.output.includes("pinned completion cannot contaminate the current Plan"));
check("open-blocker-unbounded",focused.output.includes("open blocker beyond the first 200 historical ledger rows"));
check("blocker-ledger",focused.output.includes("creates a durable blocker"));
check("manual-retry",focused.output.includes("failed Step retries are manual"));
check("retry-limit",focused.output.includes("stop at the durable maxAttempts limit"));
check("stale-decision",focused.output.includes("stale controller decision snapshot is rejected"));
check("migration",focused.output.includes("schema 24 snapshots the active Plan revision"));
check("closed-protocol",focused.output.includes("closed input validation"));
check("host-changed-reexecution",focused.output.includes("Host restart reruns a changed completed Step"));
check("host-no-duplicate-four",focused.output.includes("preserves duplicate-free revision adoption"));
check("step021a-loop",focused.output.includes("closes the ordered Goal Plan loop"));
check("step021a-restart",focused.output.includes("Host restart resumes the same active Plan Step Task"));
const passed=checks.filter(i=>i.passed).length;const state=passed===checks.length?"PASSED":"FAILED";
console.log(renderStep021br1LiveMarker(contract,{passed,total:checks.length,state}));
for(const item of checks.filter(i=>!i.passed))console.error(`OPENRILL_STEP021BR1_LIVE_FAILURE check=${item.name} detail=${item.detail}`);
if(state!=="PASSED")process.exitCode=1;
