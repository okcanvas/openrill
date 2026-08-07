import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { GoalService } from "../../packages/goals/dist/index.js";
import { TaskService } from "../../packages/tasks/dist/index.js";
import { TaskFlowControllerRuntimeFactory, TaskFlowService } from "../../packages/task-flows/dist/index.js";
import { GoalPlanExecutorService } from "../../packages/goal-executor/dist/index.js";
import { createDefaultOperationRegistry } from "../../services/agent-host/dist/transport/operation-registry.js";

function status() { return { product: "OpenRill", version: "0.21.2-step021br1", profile: "goal-revision", pid: 1, instanceId: "test", bind: "127.0.0.1", port: 0, startedAt: new Date(0).toISOString(), state: "READY", readiness: true }; }

function transitionTask(f, taskId, status, text = null) {
  const task = f.tasks.get({ workspaceId: "alpha", taskId }).task;
  f.conversations.transitionRun({ runId: task.runId, status: "RUNNING" });
  if (status === "COMPLETED") f.conversations.transitionRun({ runId: task.runId, status, taskCompletionText: text });
  else f.conversations.transitionRun({ runId: task.runId, status, payload: { errorCode: "PROTOCOL_FAILURE" } });
  return f.executor.reconcileTask(taskId);
}

test("STEP021BR1 protocol closes changed-Step adoption, blocker resolution, retry, and closed input validation", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step021b-protocol-"));
  const paths = resolveProfilePaths({ profile: "step021b-protocol", env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  try {
    let id = 0;
    const conversations = new ConversationService({ state, workspaceIds: ["alpha"], createId: () => `step021b-protocol-${++id}` });
    const goals = new GoalService(state, { createId: () => `step021b-goal-${++id}` });
    const tasks = new TaskService(state, ["alpha"]);
    const flows = new TaskFlowService(state, tasks, ["alpha"]);
    const conversation = conversations.create({ workspaceId: "alpha" });
    const source = conversations.send({ workspaceId: "alpha", conversationId: conversation.conversationId, submissionKey: "source", text: "Create Goal" });
    const goal = goals.create({ workspaceId: "alpha", conversationId: conversation.conversationId, sourceRunId: source.run.runId, sourceAttemptId: source.run.currentAttemptId, objective: "Protocol revision Goal", steps: ["Stable first", "Mutable second"] });
    const scheduled = [];
    const runtimes = new TaskFlowControllerRuntimeFactory({
      state, conversations, tasks, taskFlows: flows,
      scheduleRun: (runId) => { scheduled.push(runId); return true; },
      cancelTask: (task) => tasks.cancel({ workspaceId: task.workspaceId, taskId: task.taskId }, (current) => conversations.cancel({ workspaceId: current.workspaceId, conversationId: current.conversationId, runId: current.runId })),
    });
    const executor = new GoalPlanExecutorService({ state, tasks, taskFlows: flows, runtimes, createId: () => `step021b-blocker-${++id}` });
    const goalHooks = {
      start: (input) => executor.start(input), get: (input) => executor.get(input),
      revisePlan: (input) => executor.revisePlan(input), adoptPlanRevision: (input) => executor.adoptPlanRevision(input),
      retry: (input) => executor.retry(input), resolveBlocker: (input) => executor.resolveBlocker(input),
      resume: (input) => executor.resume(input), cancel: (input) => executor.cancel(input),
    };
    const registry = createDefaultOperationRegistry(
      status, conversations, () => {},
      { schedule: () => true, cancel: () => true, execute: async () => { throw new Error("not used"); } },
      undefined, undefined, undefined, undefined, undefined, undefined, goalHooks,
    );
    const capabilities = registry.capabilities().map((entry) => entry.name);
    for (const operation of ["goalExecution.revisePlan", "goalExecution.adoptPlanRevision", "goalExecution.retry", "goalExecution.resolveBlocker"]) assert.ok(capabilities.includes(operation));

    const owner = { workspaceId: "alpha", conversationId: conversation.conversationId, goalId: goal.goalId };
    const started = await registry.invoke("start", "goalExecution.start", { ...owner, expectedGoalRevision: goal.revision });
    assert.equal(started.ok, true);
    const revisedInput = {
      ...owner,
      expectedGoalRevision: started.output.view.goal.revision,
      expectedExecutionRevision: started.output.view.execution.revision,
      expectedPlanRevision: 1,
      steps: [
        { stepId: started.output.view.steps[0].stepId, ordinal: 1, title: "Stable first revised meaning", required: true, retryMode: "MANUAL", maxAttempts: 2 },
        { stepId: started.output.view.steps[1].stepId, ordinal: 2, title: "Mutable second revised", required: true, retryMode: "MANUAL", maxAttempts: 4 },
        { stepId: "protocol-third", ordinal: 3, title: "New third", required: true, retryMode: "MANUAL", maxAttempts: 2 },
      ],
    };
    const invalid = await registry.invoke("invalid", "goalExecution.revisePlan", { ...revisedInput, extra: true });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error.code, "INVALID_INPUT");
    const revised = await registry.invoke("revise", "goalExecution.revisePlan", revisedInput);
    assert.equal(revised.ok, true);
    assert.equal(revised.output.planRevision, 2);

    const afterFirst = transitionTask({ tasks, conversations, executor }, started.output.view.steps[0].currentTaskId, "COMPLETED", "Concrete first deliverable.");
    const waiting = executor.wait({ ...owner, expectedExecutionRevision: afterFirst.execution.revision, expectedFlowRevision: afterFirst.flow.flow.revision, wait: { reason: "adopt current revision" } });
    const adopted = await registry.invoke("adopt", "goalExecution.adoptPlanRevision", {
      ...owner, targetPlanRevision: 2,
      expectedExecutionRevision: waiting.execution.revision,
      expectedFlowRevision: waiting.flow.flow.revision,
    });
    assert.equal(adopted.ok, true);
    assert.equal(adopted.output.view.execution.planRevision, 2);
    assert.deepEqual(adopted.output.view.steps.map((step) => step.status), ["RUNNING", "PENDING", "PENDING"]);
    assert.equal(adopted.output.view.steps[0].attemptCount, 1);
    assert.notEqual(adopted.output.view.steps[0].currentTaskId, started.output.view.steps[0].currentTaskId);
    const afterChangedFirst = transitionTask({ tasks, conversations, executor }, adopted.output.view.steps[0].currentTaskId, "COMPLETED", "Concrete revised first deliverable.");
    assert.equal(afterChangedFirst.steps[1].status, "READY");
    const next = afterChangedFirst.flow.flow.state.nextStep;
    assert.ok(next);
    const controller = executor.controllerForFlow(afterChangedFirst.execution.flowId);
    assert.ok(controller);
    controller.runTask({
      flowId: afterChangedFirst.execution.flowId,
      expectedRevision: afterChangedFirst.flow.flow.revision,
      requestKey: next.requestKey,
      stepKey: next.stepKey,
      text: next.text,
    });
    const secondAdmitted = executor.get(owner);

    let blocked = transitionTask({ tasks, conversations, executor }, secondAdmitted.steps[1].currentTaskId, "COMPLETED", "확인해 보겠습니다.");
    const outputBlocker = blocked.blockers.find((entry) => entry.status === "OPEN");
    assert.ok(outputBlocker);
    const resolved = await registry.invoke("resolve", "goalExecution.resolveBlocker", {
      ...owner, blockerId: outputBlocker.blockerId, expectedBlockerRevision: outputBlocker.revision,
      expectedExecutionRevision: blocked.execution.revision, expectedFlowRevision: blocked.flow.flow.revision,
      resolvedBy: "operator:protocol", resolution: "Dependency supplied.",
    });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.output.view.steps[1].attemptCount, 2);

    blocked = transitionTask({ tasks, conversations, executor }, resolved.output.view.steps[1].currentTaskId, "FAILED");
    const failureBlocker = blocked.blockers.find((entry) => entry.status === "OPEN");
    assert.ok(failureBlocker);
    const retried = await registry.invoke("retry", "goalExecution.retry", {
      ...owner, blockerId: failureBlocker.blockerId, expectedBlockerRevision: failureBlocker.revision,
      expectedExecutionRevision: blocked.execution.revision, expectedFlowRevision: blocked.flow.flow.revision,
      requestedBy: "operator:protocol", reason: "Retry after transient protocol fixture failure.",
    });
    assert.equal(retried.ok, true);
    assert.equal(retried.output.view.steps[1].attemptCount, 3);
    assert.equal(tasks.list({ workspaceId: "alpha" }).filter((task) => task.taskKind === "task_flow.child").length, 5);
  } finally {
    state.close();
    await rm(root, { recursive: true, force: true });
  }
});
