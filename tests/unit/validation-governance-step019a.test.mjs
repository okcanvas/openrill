import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = async (path) => await readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const STEP = "STEP019A_DURABLE_GOAL_PLAN_AND_LONG_RUNNING_TASK_STATE";
const VERSION = "0.19.0-step019a";
const BASELINE = "STEP019A_DURABLE_GOAL_PLAN_AND_LONG_RUNNING_TASK_STATE";
const CHECKS = "38/38";
const SHA = "453eb9166858e4766343edec74a33b01d64b15b5e48decff7bb03d2f092368e6";

test("STEP019A owns immutable Windows acceptance evidence without freezing mutable current identity", async () => {
  const evidence = await read("reference/validation/STEP019A_WINDOWS_GOAL_LIVE_ACCEPTANCE.md");
  assert.match(evidence, /STEP019A_DURABLE_GOAL_PLAN_AND_LONG_RUNNING_TASK_STATE/);
  assert.match(evidence, /version=0\.19\.0-step019a/);
  assert.match(evidence, /checks=38\/38/);
  assert.match(evidence, /state=PASSED/);
  assert.match(evidence, new RegExp(SHA));
});

test("STEP019A OpenClaw audit pins exact answer-key source and adopted/deferred boundaries", async () => {
  const audit = await read("docs/research/OPENCLAW_GOAL_TASK_FLOW_CODE_AUDIT.md");
  for (const path of ["docs/tools/goal.md","src/config/sessions/goals.ts","src/agents/tools/goal-tools.ts","src/auto-reply/reply/commands-goal.ts","docs/automation/tasks.md","docs/automation/taskflow.md","qa/scenarios/goals/goal-context-next-turn.yaml"]) assert.match(audit, new RegExp(path.replaceAll("/", "\\/").replaceAll(".", "\\.")));
  for (const digest of ["1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82","cd24d3c8930de8a1effce1cc8050b0aab5961ea06e9ba9ad55f0f0f63e7f8081","acc9cc4ac52c40eb7c223f8a7dce9d446cea55f8433b8e777c8560266c87be56"]) assert.match(audit, new RegExp(digest));
  assert.match(audit, /not imported as an OpenRill Product dependency/i);
  assert.match(audit, /does not implement OpenClaw Task Flow as a detached workflow controller/i);
});

test("STEP019A State migration and repository own durable goal, plan and event state", async () => {
  const migration = await read("packages/state/migrations/017_durable_goal_plan_state.sql");
  const repository = await read("packages/state/src/goal-repository.ts");
  const stateIndex = await read("packages/state/src/index.ts");
  const migrations = await read("packages/state/src/migrations.ts");
  for (const table of ["agent_goals","agent_goal_plan_steps","agent_goal_events"]) assert.match(migration, new RegExp(table));
  assert.match(migration, /UNIQUE.*conversation_id|unique/si);
  assert.match(repository, /compareAndSwap|updateGoal|expectedRevision/i);
  assert.match(repository, /appendEvent/);
  assert.match(stateIndex, /OPENRILL_STATE_SCHEMA_VERSION/);
  const schema = migrations.match(/OPENRILL_STATE_SCHEMA_VERSION = (\d+)/);
  assert.ok(schema);
  assert.ok(Number(schema[1]) >= 17);
});

test("STEP019A service enforces ordering, CAS, blocker recurrence and proven completion", async () => {
  const service = await read("packages/goals/src/service.ts");
  for (const token of ["GOAL_REVISION_CONFLICT","GOAL_COMPLETION_UNPROVEN","consecutiveBlockerCount","prepareContext","goal.continued"]) assert.match(service, new RegExp(token));
  assert.match(service, /count === 3|count >= 3|count > 2/);
  assert.match(service, /previous|prior|ordinal/i);
  assert.match(service, /steps\.some\(\(step\) => step.status !== "COMPLETED"\)/);
});

test("STEP019A tools and Host use existing registry with root-only restart context", async () => {
  const tools = await read("packages/tools-goals/src/index.ts");
  const host = await read("services/agent-host/src/lifecycle.ts");
  const discovery = await read("packages/tool-discovery/src/index.ts");
  for (const name of ["goal.create","goal.get","plan.set","plan.update","goal.report_blocker","goal.control","goal.complete"]) {
    assert.match(tools, new RegExp(name.replace(".", "\\.")));
    assert.match(discovery, new RegExp(name.replace(".", "\\.")));
  }
  assert.match(host, /registerGoalTools/);
  assert.match(host, /goalService\?\.prepareContext/);
  assert.match(host, /resolveRunPreparation/);
  assert.match(host, /budget\?\.parentRunId/);
});

test("STEP019A focused Product proves SQLite and Host restart continuation", async () => {
  const stateTest = await read("tests/unit/goal-plan-step019a.test.mjs");
  const hostTest = await read("tests/unit/goal-host-step019a.test.mjs");
  assert.match(stateTest, /checkpointMode: "TRUNCATE"/);
  assert.match(stateTest, /GOAL_COMPLETION_UNPROVEN/);
  assert.match(stateTest, /Database maintenance window is closed/);
  assert.match(hostTest, /await host\.close\("restart-goal-test"\)/);
  assert.match(hostTest, /## Active Goal Context/);
  assert.match(hostTest, /name === "goal\.get"/);
});

test("STEP019A records OR-ISSUE-226 and verifies links against the current root", async () => {
  const issue = await read("reference/validation/STEP019A_OR_ISSUE_226.md");
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates = await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  const verifier = await read("scripts/verify_workspace_module_links.py");
  for (const body of [issue,registry,gates]) assert.match(body,/OR-ISSUE-226/);
  assert.match(verifier, /outside_root/);
  assert.match(verifier, /wrong_target/);
});

test("STEP019A records OR-ISSUE-227 and selects exact temporal Tool evidence", async () => {
  const issue = await read("reference/validation/STEP019A_OR_ISSUE_227.md");
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates = await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  const hostTest = await read("tests/unit/goal-host-step019a.test.mjs");
  for (const body of [issue,registry,gates]) assert.match(body,/OR-ISSUE-227/);
  assert.match(hostTest, /message\.content\[0\]\?\.name === "goal\.get"/);
});

test("STEP019A historical STEP018C governance no longer freezes mutable current identity", async () => {
  const historical = await read("tests/unit/validation-governance-step018c.test.mjs");
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  assert.match(historical, /immutable Windows acceptance evidence/);
  assert.match(registry, /OR-ISSUE-208 recurrence note — STEP019A/);
});

test("STEP019A records OR-ISSUE-228 and removes historical exact schema ownership", async () => {
  const issue=await read("reference/validation/STEP019A_OR_ISSUE_228.md");
  const registry=await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates=await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  const memoryTest=await read("tests/unit/memory-step018a.test.mjs");
  for (const body of [issue,registry,gates]) assert.match(body,/OR-ISSUE-228/);
  assert.match(memoryTest,/OPENRILL_STATE_SCHEMA_VERSION >= 16/);
  assert.match(memoryTest,/f\.state\.schemaVersion, OPENRILL_STATE_SCHEMA_VERSION/);
});

test("STEP019A immutable evidence retains exact accepted identity", async () => {
  const evidence=await read("reference/validation/STEP019A_WINDOWS_GOAL_LIVE_ACCEPTANCE.md");
  assert.match(evidence,new RegExp(STEP));
  assert.match(evidence,new RegExp(CHECKS.replace("/","\/")));
  assert.match(evidence,new RegExp(SHA));
});

test("STEP019A acceptance, live and package runners own exact identity", async () => {
  const acceptance=await read("scripts/run_step019a_acceptance.py");
  const live=await read("scripts/run-step019a-goal-live.mjs");
  const pack=await read("scripts/package_step019a.py");
  for (const body of [acceptance,live,pack]) { assert.match(body,new RegExp(STEP)); assert.match(body,new RegExp(VERSION)); }
  assert.match(acceptance,/--require-windows-goal-live/);
  assert.match(acceptance,/windows-goal-live/);
  assert.match(live,/goal-host-step019a\.test\.mjs/);
});

test("STEP019A historical runners retain immutable STEP019A identity", async () => {
  for (const body of [await read("scripts/run_step019a_acceptance.py"), await read("scripts/run-step019a-goal-live.mjs"), await read("scripts/package_step019a.py")]) {
    assert.match(body,new RegExp(STEP)); assert.match(body,new RegExp(VERSION));
  }
});

test("STEP019A plan records its original unsupported execution breadth", async () => {
  const plan=await read("docs/plans/STEP019A_DURABLE_GOAL_PLAN_AND_LONG_RUNNING_TASK_STATE.md");
  assert.match(plan,/No detached task executor/);
  assert.match(plan,/external model, Browser live, Mattermost, or Connector/i);
});
