import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadStep020er2LiveMarkerContract, renderStep020er2LiveMarker } from "../../scripts/step020er2-live-marker.mjs";

const ROOT=fileURLToPath(new URL("../../",import.meta.url));
const VALIDATOR=fileURLToPath(new URL("../../scripts/step020er2_live_marker.py",import.meta.url));
const runPythonValidation=(marker)=>new Promise((resolve,reject)=>{
  const child=spawn("python",[VALIDATOR,"--validate-stdin"],{cwd:ROOT,stdio:["pipe","pipe","pipe"]});
  let output=""; child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
  child.stdout.on("data",chunk=>output+=chunk); child.stderr.on("data",chunk=>output+=chunk);
  child.once("error",reject); child.once("exit",exitCode=>resolve({exitCode,output}));
  child.stdin.end(marker+"\n");
});

test("STEP020ER2 shared contract renders every required completion marker field",async()=>{
  const contract=await loadStep020er2LiveMarkerContract();
  const marker=renderStep020er2LiveMarker(contract,{passed:23,total:23,state:"PASSED"});
  for(const token of [
    "queue=SYSTEM_MESSAGE_WAKE_RUN",
    "migration=TERMINAL_CHILD_SAFE_BACKFILL",
    "validation=FIELD_SET_NOT_WHOLE_STRING",
    `live_harness=${contract.liveHarness}`,
  ]) assert.ok(marker.includes(token),token);
});

test("STEP020ER2 aggregate parser accepts the shared rendered marker independent of field order",async()=>{
  const contract=await loadStep020er2LiveMarkerContract();
  const marker=renderStep020er2LiveMarker(contract,{passed:23,total:23,state:"PASSED"});
  const [step,...tokens]=marker.split(" ");
  const reordered=[step,...tokens.slice().reverse()].join(" ");
  const result=await runPythonValidation(reordered);
  assert.equal(result.exitCode,0,result.output);
  assert.match(result.output,/PASS/);
});

test("STEP020ER2 aggregate parser rejects a missing queue or migration field",async()=>{
  const contract=await loadStep020er2LiveMarkerContract();
  const marker=renderStep020er2LiveMarker(contract,{passed:23,total:23,state:"PASSED"});
  const broken=marker.replace(" queue=SYSTEM_MESSAGE_WAKE_RUN","").replace(" migration=TERMINAL_CHILD_SAFE_BACKFILL","");
  const result=await runPythonValidation(broken);
  assert.notEqual(result.exitCode,0,result.output);
  assert.match(result.output,/queue/);
  assert.match(result.output,/migration/);
});
