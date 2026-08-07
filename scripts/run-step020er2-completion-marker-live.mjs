import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { loadStep020er2LiveMarkerContract, renderStep020er2LiveMarker } from "./step020er2-live-marker.mjs";

const contract = await loadStep020er2LiveMarkerContract();
if(process.platform!=="win32") throw new Error("OPENRILL_STEP020ER2_WINDOWS_REQUIRED");
function spawnCapture(args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:process.cwd(),env:{...process.env,NO_COLOR:"1",NODE_DISABLE_COLORS:"1"},stdio:["ignore","pipe","pipe"]});let output="";child.stdout.setEncoding("utf8");child.stderr.setEncoding("utf8");child.stdout.on("data",c=>{output+=c;process.stdout.write(c)});child.stderr.on("data",c=>{output+=c;process.stderr.write(c)});child.once("error",reject);child.once("exit",code=>resolve({code:code??1,output}));});}
const tests=[
  "tests/unit/live-marker-contract-step020er2.test.mjs",
  "tests/unit/local-cli-protocol-retry-step020er1.test.mjs",
  "tests/unit/task-completion-delivery-step020e.test.mjs",
  "tests/unit/task-completion-host-step020e.test.mjs",
  "tests/unit/task-completion-migration-step020e.test.mjs",
];
const focused=await spawnCapture(["--test","--test-concurrency=1","--test-reporter=tap",...tests]);
const tap=(name)=>Number([...focused.output.matchAll(new RegExp(`^# ${name} (\\d+)$`,"gm"))].at(-1)?.[1]??-1);
const checks=[]; const check=(name,value,detail="")=>checks.push({name,passed:Boolean(value),detail});
check("platform",process.platform==="win32",process.platform);
check("focused-exit",focused.code===0,String(focused.code));
check("focused-tests",tap("tests")===16,String(tap("tests")));
check("focused-pass",tap("pass")===16,String(tap("pass")));
check("focused-fail",tap("fail")===0,String(tap("fail")));
check("focused-skipped",tap("skipped")===0,String(tap("skipped")));
const stateRuntime=await import(new URL("../packages/state/dist/index.js",import.meta.url));
const pkg=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
check("schema",Number(stateRuntime.OPENRILL_STATE_SCHEMA_VERSION)===Number(contract.schema),String(stateRuntime.OPENRILL_STATE_SCHEMA_VERSION));
check("version",pkg.version===contract.version,String(pkg.version));
check("marker-contract-identity",contract.step==="STEP020ER2_WINDOWS_COMPLETION_LIVE_MARKER_CONTRACT_ALIGNMENT"&&contract.expectedChecks==="23/23"&&contract.liveHarness==="STEP020ER2_H1_WINDOWS_COMPLETION_LIVE_MARKER_CONTRACT_ALIGNMENT");
check("marker-contract-required-fields",contract.fields.queue==="SYSTEM_MESSAGE_WAKE_RUN"&&contract.fields.migration==="TERMINAL_CHILD_SAFE_BACKFILL"&&contract.fields.validation==="FIELD_SET_NOT_WHOLE_STRING");
check("transient-retry",focused.output.includes("retries a transient restart connection refusal"));
check("bounded-timeout",focused.output.includes("keeps the retry loop bounded"));
check("identity-fail-fast",focused.output.includes("does not retry a Host identity mismatch"));
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
console.log(renderStep020er2LiveMarker(contract,{passed,total:checks.length,state}));
for(const item of checks.filter(i=>!i.passed)) console.error(`OPENRILL_STEP020ER2_LIVE_FAILURE check=${item.name} detail=${item.detail}`);
if(state!=="PASSED") process.exitCode=1;
