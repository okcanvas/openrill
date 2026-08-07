import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read=async(path)=>await readFile(new URL(`../../${path}`,import.meta.url),"utf8");
const STEP="STEP020ER3_WINDOWS_PYTHON_LIVE_MARKER_VALIDATOR_ENTRYPOINT_CLOSURE";
const VERSION="0.20.8-step020er3";
const LIVE="STEP020ER3_H1_WINDOWS_PYTHON_VALIDATOR_ENTRYPOINT_AND_COMPLETION";
const CURRENT_BASELINE="STEP021A_DURABLE_GOAL_PLAN_TO_TASK_FLOW_EXECUTOR_FOUNDATION";

test("STEP020ER3 retains its immutable Windows 66/66 acceptance while current identity may advance",async()=>{
  const baseline=JSON.parse(await read("config/current-accepted-baseline.json"));
  const evidence=await read("reference/validation/STEP020ER3_WINDOWS_PYTHON_VALIDATOR_LIVE_ACCEPTANCE.md");
  assert.equal(typeof baseline.step,"string");assert.match(baseline.checks,/^\d+\/\d+$/);assert.ok(baseline.stateSchema>=23);
  assert.match(await read(baseline.evidence),/PASSED/);
  assert.match(evidence,/66\/66/);assert.match(evidence,/windows_python_validator_live=PASSED/);assert.match(evidence,new RegExp(LIVE));assert.match(evidence,/277\.045/);
});

test("STEP020ER3 invokes the Python validator by absolute file entrypoint without python -c",async()=>{
  const testBody=await read("tests/unit/python-live-marker-validator-entrypoint-step020er3.test.mjs");
  const validator=await read("scripts/step020er3_live_marker.py");
  assert.match(testBody,/fileURLToPath/);assert.match(testBody,/step020er3_live_marker\.py/);assert.match(testBody,/--validate-stdin/);
  assert.doesNotMatch(testBody,/\["-c"/);assert.doesNotMatch(testBody,/from scripts\.step020er3_live_marker/);
  assert.match(validator,/if __name__ == "__main__"/);assert.match(validator,/sys\.stdin\.read/);
});

test("STEP020ER3 proves cwd and shadow-package independence",async()=>{
  const body=await read("tests/unit/python-live-marker-validator-entrypoint-step020er3.test.mjs");const verifier=await read("scripts/verify_step020er3_python_validator_entrypoint.py");
  assert.match(body,/external cwd without PYTHONPATH/);assert.match(body,/shadow scripts package/);assert.match(verifier,/TemporaryDirectory/);assert.match(verifier,/sys\.executable/);assert.match(verifier,/ABSOLUTE_FILE_ENTRYPOINT/);
});

test("STEP020ER3 records the exact Windows ER2 validator import failure",async()=>{
  const failure=await read("reference/validation/STEP020ER2_WINDOWS_PYTHON_VALIDATOR_ENTRYPOINT_FAILURE.md");const issue=await read("reference/validation/STEP020ER3_OR_ISSUE_272.md");const precision=await read("reference/validation/STEP020ER3_OR_ISSUE_273.md");const registry=await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");const gates=await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  for(const body of [failure,issue]){assert.match(body,/54\/57 FAILED/);assert.match(body,/20\/23 FAILED/);assert.match(body,/ModuleNotFoundError/);assert.match(body,/scripts\.step020er2_live_marker/);}for(const body of [issue,registry,gates])assert.match(body,/OR-ISSUE-272/);for(const body of [precision,registry,gates])assert.match(body,/OR-ISSUE-273/);
});

test("STEP020ER3 preserves the structured marker contract and completion Product path",async()=>{
  const contract=JSON.parse(await read("config/step020er3-live-marker-contract.json"));assert.equal(contract.step,STEP);assert.equal(contract.version,VERSION);assert.equal(contract.schema,22);assert.equal(contract.expectedChecks,"26/26");assert.equal(contract.liveHarness,LIVE);assert.equal(contract.fields.source,"ABSOLUTE_FILE_ENTRYPOINT");assert.equal(contract.fields.validation,"NO_PYTHONPATH_ASSUMPTION");
  const retry=await read("apps/agent-cli/src/local-protocol-client.ts");const delivery=await read("packages/task-flows/src/completion-delivery.ts");assert.match(retry,/PROTOCOL_CONNECT_TIMEOUT/);assert.match(delivery,/CONTROLLER_DECISION_REQUIRED/);
});

test("STEP020ER3 package scripts remain reachable as immutable historical entrypoints",async()=>{
  const scripts=JSON.parse(await read("package.json")).scripts;assert.equal(scripts["acceptance:step020er3"],"python scripts/run_step020er3_acceptance.py");assert.equal(scripts["acceptance:step020er3:live"],"python scripts/run_step020er3_acceptance.py --require-windows-python-validator-live");assert.equal(scripts["python-validator-live:step020er3"],"node scripts/run-step020er3-python-validator-live.mjs");
});
