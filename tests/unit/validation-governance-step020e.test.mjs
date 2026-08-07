import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read=async(path)=>await readFile(new URL(`../../${path}`,import.meta.url),"utf8");
const STEP="STEP020E_DURABLE_TASK_COMPLETION_DELIVERY_CONTROLLER_WAKE_AND_REQUIRED_COMPLETION_SEMANTICS";
const VERSION="0.20.5-step020e";
const LIVE="STEP020E_H1_DURABLE_COMPLETION_DELIVERY_CONTROLLER_WAKE_RESTART_AND_SEMANTICS";

test("STEP020E retains immutable source-package identity and exact blocked Windows evidence",async()=>{
  const acceptance=await read("reference/validation/STEP020E_LOCAL_SOURCE_PACKAGE_ACCEPTANCE.md");
  assert.match(acceptance,new RegExp(STEP)); assert.match(acceptance,new RegExp(VERSION.replaceAll(".","\\."))); assert.match(acceptance,/49\/49/);
  const failure=await read("reference/validation/STEP020E_WINDOWS_COMPLETION_LIVE_FAILURE.md");
  assert.match(failure,/49\/50 FAILED/); assert.match(failure,/PROTOCOL_CONNECT_FAILED/); assert.match(failure,new RegExp(LIVE));
});

test("STEP020E completion-delivery implementation and focused evidence remain retained",async()=>{
  const task=await read("packages/state/src/task-repository.ts"); const delivery=await read("packages/task-flows/src/completion-delivery.ts");
  assert.match(task,/resolveRequiredTaskCompletion/); assert.match(task,/INSERT INTO task_completion_deliveries/);
  assert.match(delivery,/SESSION_QUEUED/); assert.match(delivery,/CONTROLLER_DECISION_REQUIRED/);
  const host=await read("tests/unit/task-completion-host-step020e.test.mjs"); assert.match(host,/same queued controller wake Run/); assert.match(host,/durably blocks the Flow/);
});

test("STEP020E historical runner and package entrypoints remain available",async()=>{
  const scripts=JSON.parse(await read("package.json")).scripts;
  assert.equal(scripts["acceptance:step020e"],"python scripts/run_step020e_acceptance.py");
  assert.equal(scripts["acceptance:step020e:live"],"python scripts/run_step020e_acceptance.py --require-windows-completion-live");
  assert.equal(scripts["completion-live:step020e"],"node scripts/run-step020e-completion-live.mjs");
  for(const file of ["scripts/run_step020e_acceptance.py","scripts/run-step020e-completion-live.mjs","scripts/package_step020e.py"]){const body=await read(file);assert.match(body,new RegExp(STEP));assert.match(body,new RegExp(VERSION.replaceAll(".","\\.")));}
});
