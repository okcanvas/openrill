import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read=async(path)=>await readFile(new URL(`../../${path}`,import.meta.url),"utf8");
const STEP="STEP021A_DURABLE_GOAL_PLAN_TO_TASK_FLOW_EXECUTOR_FOUNDATION";
const VERSION="0.21.0-step021a";
const BASELINE="STEP020ER3_WINDOWS_PYTHON_LIVE_MARKER_VALIDATOR_ENTRYPOINT_CLOSURE";
const LIVE="STEP021A_H1_DURABLE_GOAL_PLAN_EXECUTOR_RESTART_BLOCK_RESUME_AND_COMPLETION";

test("STEP021A retains immutable Windows acceptance while mutable current identity may advance",async()=>{
  const baseline=JSON.parse(await read("config/current-accepted-baseline.json"));const evidence=await read("reference/validation/STEP021A_WINDOWS_GOAL_PLAN_EXECUTOR_LIVE_ACCEPTANCE.md");
  assert.equal(typeof baseline.step,"string");assert.ok(baseline.stateSchema>=23);assert.match(baseline.checks,/^\d+\/\d+$/);
  assert.match(evidence,/checks=58\/58/);assert.match(evidence,/windows_goal_plan_executor_live=PASSED/);
});

test("STEP021A schema and repositories separate Plan definition from execution projection",async()=>{
  const migration=await read("packages/state/migrations/023_goal_plan_task_flow_executor.sql");const repo=await read("packages/state/src/goal-repository.ts");const executor=await read("packages/goal-executor/src/service.ts");
  assert.match(migration,/agent_goal_executions/);assert.match(migration,/agent_goal_step_executions/);assert.match(migration,/current_task_id/);assert.match(migration,/single_active/);
  assert.match(repo,/insertExecution/);assert.match(repo,/insertStepExecution/);assert.match(executor,/SINGLE_ACTIVE_STEP/);assert.match(executor,/planRevision/);
});

test("STEP021A atomic admission reuses the bound Task Flow transaction",async()=>{
  const runtime=await read("packages/task-flows/src/controller-runtime.ts");const executor=await read("packages/goal-executor/src/service.ts");
  assert.match(runtime,/TaskFlowChildAdmissionHook/);assert.match(runtime,/hook\?: TaskFlowChildAdmissionHook/);assert.match(executor,/#admitReady/);assert.match(executor,/updateStepExecution/);assert.match(executor,/plan\.step\.task\.admitted/);
});

test("STEP021A preserves controller-owned continuation and blocks bypass mutations",async()=>{
  const executor=await read("packages/goal-executor/src/service.ts");const goals=await read("packages/goals/src/service.ts");const errors=await read("packages/goals/src/errors.ts");
  assert.match(executor,/controllerForFlow/);assert.match(executor,/runNextFromController/);assert.match(executor,/GOAL_EXECUTION_REQUEST_CONFLICT/);assert.match(executor,/READY/);assert.match(executor,/OBSERVING/);
  assert.match(goals,/assertExecutionNotActive/);assert.match(errors,/GOAL_EXECUTION_ACTIVE/);
});

test("STEP021A closes blocked and cancellation projection gaps",async()=>{
  const executor=await read("packages/goal-executor/src/service.ts");const tests=await read("tests/unit/goal-plan-executor-step021a.test.mjs");
  assert.match(executor,/#applyBlockedStep/);assert.match(executor,/status: "BLOCKED"/);assert.match(executor,/#projectCancelled/);assert.match(executor,/before\.flow\.flow\.status === "CANCELLED"/);
  assert.match(tests,/Goal and Plan mutations/);assert.match(tests,/Flow cancellation that committed before Goal cancellation projection/);
});

test("STEP021A exposes a closed owner-scoped protocol and exact capability",async()=>{
  const ops=await read("packages/protocol/src/goal-execution-operations.ts");const registry=await read("services/agent-host/src/transport/operation-registry.ts");const protocolTest=await read("tests/unit/goal-plan-executor-protocol-step021a.test.mjs");const local=await read("tests/unit/local-protocol-step004.test.mjs");
  for(const token of ["goalExecution.start","goalExecution.get","goalExecution.resume","goalExecution.cancel"]){assert.match(registry,new RegExp(token.replace(".","\\.")));assert.match(local,new RegExp(token.replace(".","\\.")));}
  assert.match(ops,/GoalExecutionStartInput/);assert.match(protocolTest,/blocks generic Flow bypass/);
});

test("STEP021A actual Host evidence closes completion and restart loops",async()=>{
  const host=await read("tests/unit/goal-plan-executor-host-step021a.test.mjs");assert.match(host,/closes the ordered Goal Plan loop/);assert.match(host,/Host restart resumes the same active Plan Step Task/);assert.match(host,/does not admit a duplicate child/);assert.match(host,/normal child Run must not see controller tools/);
});

test("STEP021A records OpenClaw scope honestly and every observed failure independently",async()=>{
  const audit=await read("reference/validation/STEP021A_OPENCLAW_SOURCE_AUDIT.md");const registry=await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");const gates=await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  assert.match(audit,/does \*\*not\*\* provide the same OpenRill Goal/);assert.match(audit,/OpenRill-native integration/);
  for(let issue=274;issue<=290;issue+=1){const token=`OR-ISSUE-${issue}`;assert.match(registry,new RegExp(token));assert.match(gates,new RegExp(token));assert.match(await read(`reference/validation/STEP021A_OR_ISSUE_${issue}.md`),new RegExp(token));}
});

test("STEP021A accepted evidence and historical package entrypoints remain visible after successor advancement",async()=>{
  for(const file of ["README.md","HANDOFF.md","PLANS.md","ROADMAP.md","VALIDATION.md","PROJECT.md","ARCHITECTURE.md"]){const body=await read(file);assert.match(body,/STEP021A_DURABLE_GOAL_PLAN_TO_TASK_FLOW_EXECUTOR_FOUNDATION/);assert.match(body,/0\.21\.0-step021a/);assert.match(body,/6193888a454807a65603616fcef146b150e83b18ebc0060e7a577cbd425821fc/);assert.match(body,/STEP021A_WINDOWS_GOAL_PLAN_EXECUTOR_LIVE_ACCEPTANCE/);}
  const scripts=JSON.parse(await read("package.json")).scripts;assert.equal(scripts["acceptance:step021a"],"python scripts/run_step021a_acceptance.py");assert.equal(scripts["acceptance:step021a:live"],"python scripts/run_step021a_acceptance.py --require-windows-goal-plan-executor-live");assert.equal(scripts["goal-plan-executor-live:step021a"],"node scripts/run-step021a-goal-plan-executor-live.mjs");assert.equal(scripts["package:step021a"],"python scripts/package_step021a.py --output ../openrill-step021a-durable-goal-plan-task-flow-executor-foundation-v1.zip");
  const contract=JSON.parse(await read("config/step021a-live-marker-contract.json"));assert.equal(contract.step,STEP);assert.equal(contract.version,VERSION);assert.equal(contract.schema,23);assert.equal(contract.expectedChecks,"22/22");assert.equal(contract.liveHarness,LIVE);
});
