import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read=async(path)=>await readFile(new URL(`../../${path}`,import.meta.url),"utf8");
const STEP="STEP020ER1_WINDOWS_LOCAL_PROTOCOL_RESTART_CONNECT_RETRY_CLOSURE";
const VERSION="0.20.6-step020er1";
const ACCEPTED="STEP020ER3_WINDOWS_PYTHON_LIVE_MARKER_VALIDATOR_ENTRYPOINT_CLOSURE";
const CURRENT_BASELINE="STEP021A_DURABLE_GOAL_PLAN_TO_TASK_FLOW_EXECUTOR_FOUNDATION";
const LIVE="STEP020ER1_H1_WINDOWS_LOCAL_PROTOCOL_RESTART_CONNECT_RETRY_AND_COMPLETION";

test("STEP020ER1 retains immutable corrective evidence while the current accepted baseline may advance",async()=>{
  const evidence=await read("reference/validation/STEP020ER1_LOCAL_SOURCE_PACKAGE_ACCEPTANCE.md"); const baseline=JSON.parse(await read("config/current-accepted-baseline.json"));
  assert.match(evidence,new RegExp(STEP)); assert.match(evidence,new RegExp(VERSION.replaceAll(".","\\.")));
  assert.equal(typeof baseline.step,"string"); assert.match(baseline.checks,/^\d+\/\d+$/);
  assert.match(await read(baseline.evidence),/PASSED/);
});

test("STEP020ER1 retries only retryable pre-accept transport failures within one caller deadline",async()=>{
  const body=await read("apps/agent-cli/src/local-protocol-client.ts");
  assert.match(body,/const deadline = Date\.now\(\) \+ timeoutMs/);
  assert.match(body,/PROTOCOL_CONNECT_FAILED/); assert.match(body,/PROTOCOL_CONNECTION_CLOSED/);
  assert.match(body,/Math\.min\(25 \* \(2 \*\*/); assert.match(body,/PROTOCOL_CONNECT_TIMEOUT/);
  assert.match(body,/this\.#socket === socket/);
  assert.doesNotMatch(body,/PROTOCOL_HOST_IDENTITY_MISMATCH[^\n]*retryable\s*=\s*true/);
});

test("STEP020ER1 focused evidence covers delayed availability bounded timeout and identity fail-fast",async()=>{
  const body=await read("tests/unit/local-cli-protocol-retry-step020er1.test.mjs");
  assert.match(body,/transient restart connection refusal/); assert.match(body,/bounded by the caller connect timeout/); assert.match(body,/does not retry a Host identity mismatch/);
  const completion=await read("tests/unit/task-completion-host-step020e.test.mjs"); assert.match(completion,/same queued controller wake Run/);
});

test("STEP020ER1 records exact failed STEP020E Windows evidence and OR-ISSUE-269",async()=>{
  const failure=await read("reference/validation/STEP020E_WINDOWS_COMPLETION_LIVE_FAILURE.md");
  assert.match(failure,/49\/50 FAILED/); assert.match(failure,/PROTOCOL_CONNECT_FAILED/); assert.match(failure,/9\/10/);
  const issue=await read("reference/validation/STEP020ER1_OR_ISSUE_269.md"); const registry=await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md"); const gates=await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  for(const body of [issue,registry,gates]) assert.match(body,/OR-ISSUE-269/);
});

test("STEP020ER1 preserves STEP020E completion delivery and schema 22 contracts",async()=>{
  const migration=await read("packages/state/migrations/022_durable_task_completion_delivery_and_controller_wake.sql");
  const delivery=await read("packages/task-flows/src/completion-delivery.ts");
  assert.match(migration,/task_completion_deliveries/); assert.match(delivery,/CONTROLLER_DECISION_REQUIRED/); assert.match(delivery,/SESSION_QUEUED/);
  const migrations=await read("packages/state/src/migrations.ts"); const schema=Number(/OPENRILL_STATE_SCHEMA_VERSION = (\d+)/.exec(migrations)?.[1]); assert.ok(schema >= 22); assert.match(migration,/task_completion_deliveries/);
});

test("STEP020ER1 root continuation preserves its failed predecessor and retry evidence without owning current identity",async()=>{
  for(const file of ["README.md","HANDOFF.md","PLANS.md","ROADMAP.md","VALIDATION.md","PROJECT.md","ARCHITECTURE.md"]){const body=await read(file);assert.match(body,new RegExp(ACCEPTED));assert.match(body,/STEP020ER1 59\/60 Windows LIVE FAILED/);assert.match(body,/OR-ISSUE-270/);}
  const issue=await read("reference/validation/STEP020ER1_OR_ISSUE_269.md"); assert.match(issue,/OR-ISSUE-269/); assert.match(issue,new RegExp(LIVE));
});

test("STEP020ER1 immutable runners retain historical identity while mutable manifest ownership advances",async()=>{
  for(const file of ["scripts/run_step020er1_acceptance.py","scripts/run-step020er1-completion-retry-live.mjs","scripts/package_step020er1.py"]){const body=await read(file);assert.match(body,new RegExp(STEP));assert.match(body,new RegExp(VERSION.replaceAll(".","\\.")));}
  const live=await read("scripts/run-step020er1-completion-retry-live.mjs"); assert.match(live,new RegExp(LIVE));
  for(const file of ["scripts/generate_package_manifest.py","scripts/verify_package_manifest.py","scripts/verify_source_version_alignment.py"]){const body=await read(file);assert.doesNotMatch(body,new RegExp(STEP));assert.doesNotMatch(body,new RegExp(VERSION.replaceAll(".","\\.")));}
});

test("STEP020ER1 package scripts expose deterministic and Windows LIVE entrypoints",async()=>{
  const scripts=JSON.parse(await read("package.json")).scripts;
  assert.equal(scripts["acceptance:step020er1"],"python scripts/run_step020er1_acceptance.py");
  assert.equal(scripts["acceptance:step020er1:live"],"python scripts/run_step020er1_acceptance.py --require-windows-completion-retry-live");
  assert.equal(scripts["completion-retry-live:step020er1"],"node scripts/run-step020er1-completion-retry-live.mjs");
});
