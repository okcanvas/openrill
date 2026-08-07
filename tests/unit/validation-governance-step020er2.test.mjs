import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read=async(path)=>await readFile(new URL(`../../${path}`,import.meta.url),"utf8");
const STEP="STEP020ER2_WINDOWS_COMPLETION_LIVE_MARKER_CONTRACT_ALIGNMENT";
const VERSION="0.20.7-step020er2";
const ACCEPTED="STEP020ER3_WINDOWS_PYTHON_LIVE_MARKER_VALIDATOR_ENTRYPOINT_CLOSURE";
const CURRENT_BASELINE="STEP021A_DURABLE_GOAL_PLAN_TO_TASK_FLOW_EXECUTOR_FOUNDATION";
const LIVE="STEP020ER2_H1_WINDOWS_COMPLETION_LIVE_MARKER_CONTRACT_ALIGNMENT";

test("STEP020ER2 retains immutable marker-alignment evidence while the accepted baseline may advance",async()=>{
  const baseline=JSON.parse(await read("config/current-accepted-baseline.json")); const scripts=JSON.parse(await read("package.json")).scripts;
  assert.equal(typeof baseline.step,"string"); assert.match(baseline.checks,/^\d+\/\d+$/);
  assert.match(await read(baseline.evidence),/PASSED/);
  assert.equal(scripts["acceptance:step020er2"],"python scripts/run_step020er2_acceptance.py");
  assert.equal(scripts["completion-marker-live:step020er2"],"node scripts/run-step020er2-completion-marker-live.mjs");
});

test("STEP020ER2 uses one JSON source for the complete live marker contract",async()=>{
  const contract=JSON.parse(await read("config/step020er2-live-marker-contract.json"));
  assert.equal(contract.step,STEP); assert.equal(contract.version,VERSION); assert.equal(contract.schema,22); assert.equal(contract.expectedChecks,"23/23"); assert.equal(contract.liveHarness,LIVE);
  assert.equal(contract.fields.queue,"SYSTEM_MESSAGE_WAKE_RUN"); assert.equal(contract.fields.migration,"TERMINAL_CHILD_SAFE_BACKFILL"); assert.equal(contract.fields.validation,"FIELD_SET_NOT_WHOLE_STRING");
  const live=await read("scripts/run-step020er2-completion-marker-live.mjs"); const aggregate=await read("scripts/run_step020er2_acceptance.py");
  assert.match(live,/loadStep020er2LiveMarkerContract/); assert.match(live,/renderStep020er2LiveMarker/); assert.match(aggregate,/validate_live_output/);
  assert.doesNotMatch(aggregate,/marker in result\.output/);
});

test("STEP020ER2 tests accept field reordering and reject missing required fields",async()=>{
  const body=await read("tests/unit/live-marker-contract-step020er2.test.mjs");
  assert.match(body,/independent of field order/); assert.match(body,/missing queue or migration field/); assert.match(body,/queue=SYSTEM_MESSAGE_WAKE_RUN/); assert.match(body,/migration=TERMINAL_CHILD_SAFE_BACKFILL/);
});

test("STEP020ER2 records the exact successful-inner failed-aggregate Windows evidence",async()=>{
  const failure=await read("reference/validation/STEP020ER1_WINDOWS_LIVE_MARKER_CONTRACT_FAILURE.md"); const issue=await read("reference/validation/STEP020ER2_OR_ISSUE_270.md"); const ownership=await read("reference/validation/STEP020ER2_OR_ISSUE_271.md"); const registry=await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md"); const gates=await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  assert.match(failure,/59\/60 FAILED/); assert.match(failure,/21\/21 PASSED/); assert.match(failure,/queue=SYSTEM_MESSAGE_WAKE_RUN/); assert.match(failure,/migration=TERMINAL_CHILD_SAFE_BACKFILL/);
  for(const body of [issue,registry,gates]) assert.match(body,/OR-ISSUE-270/); for(const body of [ownership,registry,gates]) assert.match(body,/OR-ISSUE-271/);
});

test("STEP020ER2 preserves completion semantics and bounded Local Protocol retry without Product mutation",async()=>{
  const retry=await read("apps/agent-cli/src/local-protocol-client.ts"); const delivery=await read("packages/task-flows/src/completion-delivery.ts"); const migrations=await read("packages/state/src/migrations.ts");
  assert.match(retry,/PROTOCOL_CONNECT_FAILED/); assert.match(retry,/PROTOCOL_CONNECTION_CLOSED/); assert.match(retry,/PROTOCOL_CONNECT_TIMEOUT/);
  assert.match(delivery,/CONTROLLER_DECISION_REQUIRED/); assert.match(delivery,/SESSION_QUEUED/); const schema=Number(/OPENRILL_STATE_SCHEMA_VERSION = (\d+)/.exec(migrations)?.[1]); assert.ok(schema >= 22); assert.match(await read("packages/state/migrations/022_durable_task_completion_delivery_and_controller_wake.sql"),/task_completion_deliveries/);
});

test("STEP020ER2 root continuation retains its failed-marker evidence after current identity advances",async()=>{
  for(const file of ["README.md","HANDOFF.md","PLANS.md","ROADMAP.md","VALIDATION.md","PROJECT.md","ARCHITECTURE.md"]){const body=await read(file);assert.match(body,/STEP020ER1 59\/60 Windows LIVE FAILED/);assert.match(body,/OR-ISSUE-270/);assert.match(body,/STEP020ER2 54\/57 Windows LIVE FAILED/);assert.match(body,new RegExp(ACCEPTED));}
});

test("STEP020ER2 package scripts expose deterministic and Windows LIVE entrypoints",async()=>{
  const scripts=JSON.parse(await read("package.json")).scripts;
  assert.equal(scripts["acceptance:step020er2"],"python scripts/run_step020er2_acceptance.py");
  assert.equal(scripts["acceptance:step020er2:live"],"python scripts/run_step020er2_acceptance.py --require-windows-completion-marker-live");
  assert.equal(scripts["completion-marker-live:step020er2"],"node scripts/run-step020er2-completion-marker-live.mjs");
});
