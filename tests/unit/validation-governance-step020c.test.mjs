import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = async (path) => await readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const STEP="STEP020C_BOUND_TASK_FLOW_CONTROLLER_RUNTIME_AND_ATOMIC_CHILD_TASK_ADMISSION";
const VERSION="0.20.3-step020c";
const ZIP_SHA="7aa16634fb7ef9fcbf498e8dd7e200c29ba1cf403dc5de870e6359035c0a3ca5";
const LIVE="STEP020C_H1_BOUND_CONTROLLER_ATOMIC_CHILD_ADMISSION_RESTART_AND_CANCELLATION";

test("STEP020C owns immutable Windows 43/43 acceptance evidence", async () => {
  const evidence=await read("reference/validation/STEP020C_WINDOWS_BOUND_CONTROLLER_LIVE_ACCEPTANCE.md");
  for(const token of [STEP,VERSION,"checks=43/43","windows_bound_controller_live=PASSED",`live_harness=${LIVE}`,"promotion=READY",ZIP_SHA]) assert.match(evidence,new RegExp(token.replaceAll(".","\\.")));
});

test("STEP020C source keeps atomic Conversation composition and bound runtime", async () => {
  const service=await read("packages/conversations/src/service.ts"); const runtime=await read("packages/task-flows/src/controller-runtime.ts");
  assert.match(service,/public sendInTransaction/); assert.match(service,/#sendWithRepositories/);
  assert.match(runtime,/class BoundTaskFlowControllerRuntime/); assert.match(runtime,/class TaskFlowControllerRuntimeFactory/);
  assert.match(runtime,/workspaceId: input\.workspaceId/); assert.match(runtime,/ownerKey: input\.ownerKey/); assert.match(runtime,/controllerId: input\.controllerId/);
  assert.doesNotMatch(runtime,/new BoundTaskFlowControllerRuntime\(\{ \.\.\.this\.options, \.\.\.input \}\)/);
});

test("STEP020C child admission commits Run Task link revision and event together", async () => {
  const body=await read("packages/task-flows/src/controller-runtime.ts");
  assert.match(body,/this\.#state\.transaction/); assert.match(body,/sendInTransaction\(repositories/); assert.match(body,/classifyRun/); assert.match(body,/taskFlows\.linkTask/);
  assert.match(body,/taskFlow\.task\.admitted/); assert.match(body,/const scheduled = schedulable \? this\.#scheduleRun/);
});

test("STEP020C public protocol retains closed controller operations", async () => {
  const registry=await read("services/agent-host/src/transport/operation-registry.ts"); const validation=await read("packages/protocol/src/validation.ts");
  for(const operation of ["taskFlow.create","taskFlow.run","taskFlow.wait","taskFlow.resume","taskFlow.finish","taskFlow.fail"]) assert.match(registry,new RegExp(operation.replace(".","\\.")));
  for(const validator of ["validateTaskFlowCreateInput","validateTaskFlowRunInput","validateTaskFlowWaitInput","validateTaskFlowResumeInput","validateTaskFlowFinishInput","validateTaskFlowFailInput"]) assert.match(validation,new RegExp(validator));
});

test("STEP020C focused evidence retains rollback restart replay and cancellation", async () => {
  const runtime=await read("tests/unit/task-flow-controller-runtime-step020c.test.mjs"); const protocol=await read("tests/unit/task-flow-controller-protocol-step020c.test.mjs"); const host=await read("tests/unit/task-flow-controller-host-step020c.test.mjs");
  assert.match(runtime,/post-Run admission failure rolls back/); assert.match(runtime,/completed replay does not|terminalReplay/);
  assert.match(protocol,/protocol exposes bound create\/run\/wait\/resume\/finish\/fail/); assert.match(host,/atomic child Task/); assert.match(host,/exact replay survives restart/); assert.match(host,/cancellation cascades/);
});

test("STEP020C records OR-ISSUE-242 through OR-ISSUE-246 independently", async () => {
  const registry=await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md"); const gates=await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  for(const number of [242,243,244,245,246]) { const token=`OR-ISSUE-${number}`; const issue=await read(`reference/validation/STEP020C_${token.replaceAll("-","_")}.md`); for(const body of [issue,registry,gates]) assert.match(body,new RegExp(token)); }
});

test("STEP020C Fresh dependency helper retains target-root confinement", async () => {
  const helper=await read("scripts/materialize_resolved_dependencies_for_fresh_verify.py");
  assert.match(helper,/source_modules\.is_symlink\(\)/); assert.match(helper,/resolved\.relative_to\(target_root\)/); assert.match(helper,/copytree\(source_modules, target_modules, symlinks=True\)/);
});

test("STEP020C clean build dependency order remains valid", async () => {
  const build=JSON.parse(await read("tsconfig.build.json")); const paths=build.references.map((entry)=>entry.path);
  assert.ok(paths.indexOf("packages/conversations") < paths.indexOf("packages/task-flows"));
  const pkg=JSON.parse(await read("packages/task-flows/package.json")); assert.equal(pkg.dependencies["@openrill/conversations"],"workspace:*");
});

test("STEP020C OpenClaw audit preserves executor separation", async () => {
  const audit=await read("docs/research/STEP020C_OPENCLAW_BOUND_CONTROLLER_RUNTIME_AND_TASK_ADMISSION_AUDIT.md"); const plan=await read("docs/plans/STEP020C_BOUND_TASK_FLOW_CONTROLLER_RUNTIME_AND_ATOMIC_CHILD_TASK_ADMISSION.md");
  for(const token of ["runtime-taskflow.ts","task-executor.ts","task-flow-owner-access.ts"]) assert.match(audit,new RegExp(token.replace(".","\\.")));
  assert.match(audit,/one SQLite transaction/); assert.match(plan,/existing Run coordinator/); assert.match(plan,/autonomous Plan-to-Task/);
});

test("STEP020C historical runners retain exact immutable identity", async () => {
  for(const file of ["scripts/run_step020c_acceptance.py","scripts/run-step020c-bound-controller-live.mjs","scripts/package_step020c.py"]) { const body=await read(file); assert.match(body,new RegExp(STEP)); assert.match(body,new RegExp(VERSION.replaceAll(".","\\."))); }
  const live=await read("scripts/run-step020c-bound-controller-live.mjs"); assert.match(live,new RegExp(LIVE));
});
