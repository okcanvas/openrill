import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read=async(path)=>await readFile(new URL(`../../${path}`,import.meta.url),"utf8");
const STEP="STEP021B_DURABLE_PLAN_REVISION_RETRY_AND_BLOCKER_RESOLUTION_CLOSURE";
const VERSION="0.21.1-step021b";
const BASELINE="STEP021A_DURABLE_GOAL_PLAN_TO_TASK_FLOW_EXECUTOR_FOUNDATION";
const LIVE="STEP021B_H1_PLAN_REVISION_ADOPTION_RETRY_BLOCKER_AND_RESTART";

test("STEP021B remains an immutable predecessor while STEP021A is the official accepted baseline",async()=>{
  const baseline=JSON.parse(await read("config/current-accepted-baseline.json"));const plan=await read("docs/plans/STEP021B_DURABLE_PLAN_REVISION_RETRY_AND_BLOCKER_RESOLUTION_CLOSURE.md");
  assert.match(plan,new RegExp(STEP));assert.match(plan,/0\.21\.1-step021b/);assert.equal(typeof baseline.step,"string");assert.ok(baseline.stateSchema>=24);assert.match(baseline.checks,/^\d+\/\d+$/);
});

test("STEP021B schema 24 stores immutable Plan snapshots, retry policy, blockers, and decision revisions",async()=>{
  const migration=await read("packages/state/migrations/024_goal_plan_revision_retry_blocker.sql");
  for(const token of ["agent_goal_plan_revision_steps","retry_mode","max_attempts","agent_goal_step_blockers","controller_execution_revision","controller_step_revision","controller_flow_revision"]) assert.match(migration,new RegExp(token));
  assert.match(migration,/WHERE e\.status IN \('BLOCKED', 'FAILED'\)/);
});

test("STEP021B executor remains pinned and requires explicit adoption",async()=>{
  const executor=await read("packages/goal-executor/src/service.ts");
  assert.match(executor,/listPlanRevisionSteps\(goalId, execution\.planRevision\)/);assert.match(executor,/revisePlan/);assert.match(executor,/adoptPlanRevision/);assert.match(executor,/target Plan revision must be the current newer Goal Plan revision/);assert.match(executor,/preservedSteps/);
  assert.doesNotMatch(executor,/execution\.planRevision !== goal\.planRevision \|\| execution\.controllerId/);
});

test("STEP021B blocker and bounded manual retry cannot be bypassed by generic resume",async()=>{
  const executor=await read("packages/goal-executor/src/service.ts");const tests=await read("tests/unit/goal-plan-revision-retry-step021b.test.mjs");
  assert.match(executor,/GOAL_EXECUTION_BLOCKER_REQUIRED/);assert.match(executor,/GOAL_EXECUTION_RETRY_LIMIT/);assert.match(executor,/retryMode !== "MANUAL"/);assert.match(executor,/#recordBlocker/);assert.match(tests,/only explicit resolution admits a new attempt/);assert.match(tests,/stop at the durable maxAttempts limit/);
});

test("STEP021B stale controller decisions bind execution Step and Flow revisions",async()=>{
  const migration=await read("packages/state/migrations/024_goal_plan_revision_retry_blocker.sql");const delivery=await read("packages/task-flows/src/completion-delivery.ts");const executor=await read("packages/goal-executor/src/service.ts");
  assert.match(migration,/controller_execution_revision/);assert.match(delivery,/expectedExecutionRevision/);assert.match(delivery,/expectedStepRevision/);assert.match(delivery,/expectedFlowRevision/);assert.match(executor,/GOAL_EXECUTION_STALE_DECISION/);
});

test("STEP021B exposes four closed owner-scoped operations and exact capability",async()=>{
  const validation=await read("packages/protocol/src/validation.ts");const registry=await read("services/agent-host/src/transport/operation-registry.ts");const local=await read("tests/unit/local-protocol-step004.test.mjs");
  for(const token of ["goalExecution.revisePlan","goalExecution.adoptPlanRevision","goalExecution.retry","goalExecution.resolveBlocker"]){assert.match(registry,new RegExp(token.replace(".","\\.")));assert.match(local,new RegExp(token.replace(".","\\.")));}
  assert.match(validation,/goalExecution\.revisePlan input must be a closed object/);assert.match(validation,/goalExecution\.retry input must be a closed object/);
});

test("STEP021B migration protocol and Host evidence cover restart adoption and replay",async()=>{
  assert.match(await read("tests/unit/goal-plan-revision-migration-step021b.test.mjs"),/non-destructively/);
  assert.match(await read("tests/unit/goal-plan-revision-retry-protocol-step021b.test.mjs"),/closed input validation/);
  const host=await read("tests/unit/goal-plan-revision-host-step021b.test.mjs");assert.match(host,/Host restart reruns a changed completed Step/);assert.match(host,/preserves duplicate-free revision adoption/);
});

test("STEP021B records OpenClaw scope honestly and every observed failure independently",async()=>{
  const audit=await read("reference/validation/STEP021B_OPENCLAW_SOURCE_AUDIT.md");const registry=await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");const gates=await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  assert.match(audit,/do \*\*not\*\* provide OpenRill's Goal/);assert.match(audit,/OpenRill-native layer/);
  for(let issue=291;issue<=302;issue+=1){const token=`OR-ISSUE-${issue}`;assert.match(registry,new RegExp(token));assert.match(gates,new RegExp(token));assert.match(await read(`reference/validation/STEP021B_OR_ISSUE_${issue}.md`),new RegExp(token));}
});

test("STEP021B historical package scripts and evidence remain self-contained",async()=>{
  const plan=await read("docs/plans/STEP021B_DURABLE_PLAN_REVISION_RETRY_AND_BLOCKER_RESOLUTION_CLOSURE.md");const registry=await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");assert.match(plan,new RegExp(STEP));assert.match(plan,/0\.21\.1-step021b/);assert.match(registry,/OR-ISSUE-291/);assert.match(registry,/OR-ISSUE-302/);
  const scripts=JSON.parse(await read("package.json")).scripts;assert.equal(scripts["acceptance:step021b"],"python scripts/run_step021b_acceptance.py");assert.equal(scripts["acceptance:step021b:live"],"python scripts/run_step021b_acceptance.py --require-windows-goal-plan-revision-live");assert.equal(scripts["plan-revision-live:step021b"],"node scripts/run-step021b-plan-revision-live.mjs");assert.equal(scripts["package:step021b"],"python scripts/package_step021b.py --output ../openrill-step021b-durable-plan-revision-retry-blocker-resolution-closure-v1.zip");
  const contract=JSON.parse(await read("config/step021b-live-marker-contract.json"));assert.equal(contract.step,STEP);assert.equal(contract.version,VERSION);assert.equal(contract.schema,24);assert.equal(contract.expectedChecks,"24/24");assert.equal(contract.liveHarness,LIVE);
});
