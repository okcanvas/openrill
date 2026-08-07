import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase, OPENRILL_STATE_SCHEMA_VERSION } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { GoalService } from "../../packages/goals/dist/index.js";
import { TaskService } from "../../packages/tasks/dist/index.js";
import { TaskFlowControllerRuntimeFactory, TaskFlowService } from "../../packages/task-flows/dist/index.js";
import { GoalExecutorError, GoalPlanExecutorService } from "../../packages/goal-executor/dist/index.js";

async function fixture(name, titles = ["Step one", "Step two"]) {
  const root = await mkdtemp(join(tmpdir(), `openrill-step021b-${name}-`));
  const paths = resolveProfilePaths({ profile: `step021b-${name}`, env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  let clock = 70_000;
  let id = 0;
  const now = () => ++clock;
  const state = await openOpenRillStateDatabase({ profilePaths: paths, now });
  const conversations = new ConversationService({ state, workspaceIds: ["alpha"], createId: () => `${name}-${++id}`, now });
  const goals = new GoalService(state, { createId: () => `${name}-goal-${++id}`, now });
  const tasks = new TaskService(state, ["alpha"]);
  const flows = new TaskFlowService(state, tasks, ["alpha"], now);
  const conversation = conversations.create({ workspaceId: "alpha", title: "STEP021B owner" });
  const source = conversations.send({ workspaceId: "alpha", conversationId: conversation.conversationId, submissionKey: `${name}-source`, text: "Create Goal" });
  const goal = goals.create({ workspaceId: "alpha", conversationId: conversation.conversationId, sourceRunId: source.run.runId, sourceAttemptId: source.run.currentAttemptId, objective: "Revision and retry Goal", steps: titles });
  const scheduled = [];
  const runtimes = new TaskFlowControllerRuntimeFactory({
    state, conversations, tasks, taskFlows: flows, now,
    scheduleRun: (runId) => { scheduled.push(runId); return true; },
    cancelTask: (task) => tasks.cancel({ workspaceId: task.workspaceId, taskId: task.taskId }, (current) => conversations.cancel({ workspaceId: current.workspaceId, conversationId: current.conversationId, runId: current.runId })),
  });
  const executor = new GoalPlanExecutorService({ state, tasks, taskFlows: flows, runtimes, now, createId: () => `${name}-blocker-${++id}` });
  const owner = { workspaceId: "alpha", conversationId: conversation.conversationId, goalId: goal.goalId };
  return { root, paths, state, conversations, goals, tasks, flows, conversation, goal, scheduled, runtimes, executor, owner, now, cleanup: async () => { if (state.isOpen()) state.close(); await rm(root, { recursive: true, force: true }); } };
}

function finishTask(f, taskId, text) {
  const task = f.tasks.get({ workspaceId: "alpha", taskId }).task;
  f.conversations.transitionRun({ runId: task.runId, status: "RUNNING" });
  f.conversations.transitionRun({ runId: task.runId, status: "COMPLETED", taskCompletionText: text });
  return f.executor.reconcileTask(taskId);
}

function failTask(f, taskId, code = "TEST_FAILURE") {
  const task = f.tasks.get({ workspaceId: "alpha", taskId }).task;
  f.conversations.transitionRun({ runId: task.runId, status: "RUNNING" });
  f.conversations.transitionRun({ runId: task.runId, status: "FAILED", payload: { errorCode: code } });
  return f.executor.reconcileTask(taskId);
}

function draft(view, third = true) {
  const steps = [
    { stepId: view.steps[0].stepId, ordinal: 1, title: view.steps[0].title, required: true, retryMode: "MANUAL", maxAttempts: 3 },
    { stepId: view.steps[1].stepId, ordinal: 2, title: "Step two revised", required: true, retryMode: "MANUAL", maxAttempts: 4 },
  ];
  if (third) steps.push({ stepId: "step-new-revision", ordinal: 3, title: "New revision step", required: true, retryMode: "MANUAL", maxAttempts: 2 });
  return steps;
}

test("STEP021B schema 24 pins active execution to an immutable Plan snapshot while a newer revision is created and replayed", async () => {
  const f = await fixture("pin");
  try {
    assert.ok(OPENRILL_STATE_SCHEMA_VERSION >= 24);
    const started = f.executor.start({ ...f.owner, expectedGoalRevision: f.goal.revision });
    const revised = f.executor.revisePlan({
      ...f.owner,
      expectedGoalRevision: started.view.goal.revision,
      expectedExecutionRevision: started.view.execution.revision,
      expectedPlanRevision: started.view.goal.planRevision,
      steps: draft(started.view),
    });
    assert.equal(revised.replayed, false);
    assert.equal(revised.planRevision, 2);
    const pinned = f.executor.get(f.owner);
    assert.equal(pinned.execution.planRevision, 1);
    assert.equal(pinned.goal.planRevision, 2);
    assert.deepEqual(pinned.steps.map((step) => step.title), ["Step one", "Step two"]);
    const restarted = f.executor.start({ ...f.owner, expectedGoalRevision: pinned.goal.revision });
    assert.equal(restarted.replayed, true);
    assert.equal(restarted.view.execution.planRevision, 1);
    assert.equal(restarted.view.goal.planRevision, 2);
    assert.equal(f.tasks.list({ workspaceId: "alpha" }).filter((task) => task.taskKind === "task_flow.child").length, 1);
    const replay = f.executor.revisePlan({
      ...f.owner,
      expectedGoalRevision: started.view.goal.revision,
      expectedExecutionRevision: started.view.execution.revision,
      expectedPlanRevision: 1,
      steps: draft(started.view),
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.planRevision, 2);
    const snapshots = f.state.transaction((repositories) => ({
      one: repositories.goals.listPlanRevisionSteps(f.goal.goalId, 1),
      two: repositories.goals.listPlanRevisionSteps(f.goal.goalId, 2),
    }));
    assert.deepEqual(snapshots.one.map((step) => step.title), ["Step one", "Step two"]);
    assert.deepEqual(snapshots.two.map((step) => step.title), ["Step one", "Step two revised", "New revision step"]);
  } finally { await f.cleanup(); }
});

test("STEP021B explicit adoption preserves completed stable Steps and admits the first unfinished Step from the new revision", async () => {
  const f = await fixture("adopt");
  try {
    const started = f.executor.start({ ...f.owner, expectedGoalRevision: f.goal.revision });
    const revised = f.executor.revisePlan({ ...f.owner, expectedGoalRevision: started.view.goal.revision, expectedExecutionRevision: started.view.execution.revision, expectedPlanRevision: 1, steps: draft(started.view) });
    const afterFirst = finishTask(f, started.view.steps[0].currentTaskId, "Concrete deliverable for first stable Step.");
    const waiting = f.executor.wait({ ...f.owner, expectedExecutionRevision: afterFirst.execution.revision, expectedFlowRevision: afterFirst.flow.flow.revision, wait: { reason: "adopt revision 2" } });
    const adopted = f.executor.adoptPlanRevision({ ...f.owner, targetPlanRevision: revised.planRevision, expectedExecutionRevision: waiting.execution.revision, expectedFlowRevision: waiting.flow.flow.revision });
    assert.equal(adopted.replayed, false);
    assert.equal(adopted.planRevision, 2);
    assert.equal(adopted.view.execution.planRevision, 2);
    assert.deepEqual(adopted.view.steps.map((step) => step.status), ["SUCCEEDED", "RUNNING", "PENDING"]);
    assert.equal(adopted.view.steps[1].title, "Step two revised");
    assert.equal(adopted.view.steps[0].attemptCount, 1);
    assert.equal(adopted.view.steps[1].attemptCount, 1);
    assert.equal(adopted.view.flow.tasks.length, 2);
  } finally { await f.cleanup(); }
});

test("STEP021B BLOCKED completion creates a durable blocker and only explicit resolution admits a new attempt", async () => {
  const f = await fixture("blocker", ["Resolve dependency", "Publish"]);
  try {
    const started = f.executor.start({ ...f.owner, expectedGoalRevision: f.goal.revision });
    const blocked = finishTask(f, started.view.steps[0].currentTaskId, "확인해 보겠습니다.");
    assert.equal(blocked.execution.status, "BLOCKED");
    assert.equal(blocked.blockers.length, 1);
    assert.equal(blocked.blockers[0].status, "OPEN");
    assert.equal(blocked.blockers[0].blockerType, "TASK_OUTPUT");
    assert.throws(() => f.executor.resume({ ...f.owner, expectedExecutionRevision: blocked.execution.revision, expectedFlowRevision: blocked.flow.flow.revision }), (error) => error instanceof GoalExecutorError && error.code === "GOAL_EXECUTION_BLOCKER_REQUIRED");
    const resolved = f.executor.resolveBlocker({
      ...f.owner,
      blockerId: blocked.blockers[0].blockerId,
      expectedBlockerRevision: blocked.blockers[0].revision,
      expectedExecutionRevision: blocked.execution.revision,
      expectedFlowRevision: blocked.flow.flow.revision,
      resolvedBy: "operator:test",
      resolution: "Dependency supplied and verified.",
    });
    assert.equal(resolved.blocker.status, "RESOLVED");
    assert.equal(resolved.action, "ADMITTED");
    assert.equal(resolved.view.steps[0].attemptCount, 2);
    assert.notEqual(resolved.view.steps[0].currentTaskId, started.view.steps[0].currentTaskId);
  } finally { await f.cleanup(); }
});

test("STEP021B failed Step retries are manual, create new Task attempts, and stop at the durable maxAttempts limit", async () => {
  const f = await fixture("retry", ["Retryable work"]);
  try {
    let view = f.executor.start({ ...f.owner, expectedGoalRevision: f.goal.revision }).view;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      view = failTask(f, view.steps[0].currentTaskId, "RETRYABLE_TEST_FAILURE");
      assert.equal(view.execution.status, "BLOCKED");
      assert.equal(view.steps[0].status, "FAILED");
      const blocker = view.blockers.find((item) => item.status === "OPEN");
      assert.ok(blocker);
      if (attempt < 3) {
        const retried = f.executor.retry({
          ...f.owner,
          blockerId: blocker.blockerId,
          expectedBlockerRevision: blocker.revision,
          expectedExecutionRevision: view.execution.revision,
          expectedFlowRevision: view.flow.flow.revision,
          requestedBy: "operator:test",
          reason: `manual retry ${attempt + 1}`,
        });
        assert.equal(retried.action, "ADMITTED");
        view = retried.view;
        assert.equal(view.steps[0].attemptCount, attempt + 1);
      } else {
        assert.equal(blocker.blockerType, "RETRY_LIMIT");
        assert.throws(() => f.executor.retry({
          ...f.owner,
          blockerId: blocker.blockerId,
          expectedBlockerRevision: blocker.revision,
          expectedExecutionRevision: view.execution.revision,
          expectedFlowRevision: view.flow.flow.revision,
          requestedBy: "operator:test",
          reason: "must be rejected",
        }), (error) => error instanceof GoalExecutorError && error.code === "GOAL_EXECUTION_RETRY_LIMIT");
      }
    }
    assert.equal(f.tasks.list({ workspaceId: "alpha" }).filter((task) => task.taskKind === "task_flow.child").length, 3);
  } finally { await f.cleanup(); }
});

test("STEP021B stale controller decision snapshot is rejected before child admission", async () => {
  const f = await fixture("stale");
  try {
    const started = f.executor.start({ ...f.owner, expectedGoalRevision: f.goal.revision });
    const afterFirst = finishTask(f, started.view.steps[0].currentTaskId, "First Step deliverable.");
    const current = afterFirst.steps.find((step) => step.stepId === afterFirst.execution.currentStepId);
    const controller = f.executor.controllerForFlow(afterFirst.execution.flowId, {
      workspaceId: "alpha",
      ownerKey: f.conversation.conversationId,
      controllerId: afterFirst.execution.controllerId,
      expectedExecutionRevision: afterFirst.execution.revision,
      expectedStepRevision: current.revision,
      expectedFlowRevision: afterFirst.flow.flow.revision,
      deliveryId: "stale-test",
    });
    const waiting = f.executor.wait({ ...f.owner, expectedExecutionRevision: afterFirst.execution.revision, expectedFlowRevision: afterFirst.flow.flow.revision, wait: { reason: "state changed after wake snapshot" } });
    const next = afterFirst.flow.flow.state.nextStep;
    assert.throws(() => controller.runTask({ flowId: afterFirst.execution.flowId, expectedRevision: waiting.flow.flow.revision, requestKey: next.requestKey, stepKey: next.stepKey, text: next.text }), (error) => error instanceof GoalExecutorError && error.code === "GOAL_EXECUTION_STALE_DECISION");
    assert.equal(f.tasks.list({ workspaceId: "alpha" }).filter((task) => task.taskKind === "task_flow.child").length, 1);
  } finally { await f.cleanup(); }
});

test("STEP021BR1 changed completed Step is reset, pinned completion cannot contaminate the current Plan, and adoption admits a new first attempt", async () => {
  const f = await fixture("changed-completed");
  try {
    const started = f.executor.start({ ...f.owner, expectedGoalRevision: f.goal.revision });
    const originalTaskId = started.view.steps[0].currentTaskId;
    const revised = f.executor.revisePlan({
      ...f.owner,
      expectedGoalRevision: started.view.goal.revision,
      expectedExecutionRevision: started.view.execution.revision,
      expectedPlanRevision: 1,
      steps: [
        { stepId: started.view.steps[0].stepId, ordinal: 1, title: "Step one revised meaning", required: true, retryMode: "MANUAL", maxAttempts: 2 },
        { stepId: started.view.steps[1].stepId, ordinal: 2, title: started.view.steps[1].title, required: true, retryMode: "MANUAL", maxAttempts: 3 },
      ],
    });
    const afterRevision = f.state.transaction((repositories) => repositories.goals.listSteps(f.goal.goalId));
    assert.equal(afterRevision[0].title, "Step one revised meaning");
    assert.equal(afterRevision[0].status, "PENDING");
    assert.equal(afterRevision[0].sourceRunId, null);

    const afterOldCompletion = finishTask(f, originalTaskId, "Deliverable for the old revision meaning.");
    assert.equal(afterOldCompletion.execution.planRevision, 1);
    assert.equal(afterOldCompletion.steps[0].title, "Step one");
    assert.equal(afterOldCompletion.steps[0].status, "SUCCEEDED");
    const currentPlan = f.state.transaction((repositories) => repositories.goals.listSteps(f.goal.goalId));
    assert.equal(currentPlan[0].title, "Step one revised meaning");
    assert.equal(currentPlan[0].status, "PENDING");
    assert.equal(currentPlan[0].note, null);
    assert.equal(currentPlan[0].sourceRunId, null);

    const waiting = f.executor.wait({ ...f.owner, expectedExecutionRevision: afterOldCompletion.execution.revision, expectedFlowRevision: afterOldCompletion.flow.flow.revision, wait: { reason: "adopt changed completed Step" } });
    const adopted = f.executor.adoptPlanRevision({ ...f.owner, targetPlanRevision: revised.planRevision, expectedExecutionRevision: waiting.execution.revision, expectedFlowRevision: waiting.flow.flow.revision });
    assert.equal(adopted.view.steps[0].title, "Step one revised meaning");
    assert.equal(adopted.view.steps[0].status, "RUNNING");
    assert.equal(adopted.view.steps[0].attemptCount, 1);
    assert.equal(adopted.view.steps[0].lastTerminalOutcome, null);
    assert.equal(adopted.view.steps[0].lastSummary, null);
    assert.notEqual(adopted.view.steps[0].currentTaskId, originalTaskId);
    assert.equal(adopted.view.steps[1].status, "PENDING");
  } finally { await f.cleanup(); }
});

test("STEP021BR1 adoption rejects an open blocker beyond the first 200 historical ledger rows", async () => {
  const f = await fixture("blocker-existence");
  try {
    const started = f.executor.start({ ...f.owner, expectedGoalRevision: f.goal.revision });
    const revised = f.executor.revisePlan({ ...f.owner, expectedGoalRevision: started.view.goal.revision, expectedExecutionRevision: started.view.execution.revision, expectedPlanRevision: 1, steps: draft(started.view) });
    const afterFirst = finishTask(f, started.view.steps[0].currentTaskId, "First Step complete.");
    const waiting = f.executor.wait({ ...f.owner, expectedExecutionRevision: afterFirst.execution.revision, expectedFlowRevision: afterFirst.flow.flow.revision, wait: { reason: "open blocker existence guard" } });
    f.state.transaction((repositories) => {
      for (let index = 1; index <= 201; index += 1) {
        const open = index === 201;
        repositories.goals.insertBlocker({
          blockerId: `blocker-history-${String(index).padStart(3, "0")}`,
          goalId: f.goal.goalId,
          stepId: waiting.execution.currentStepId,
          planRevision: 1,
          taskId: null,
          blockerType: "OPERATOR",
          fingerprint: String(index).padStart(64, "0"),
          summary: `historical blocker ${index}`,
          evidence: { index },
          status: open ? "OPEN" : "RESOLVED",
          occurrenceCount: 1,
          createdAt: index,
          updatedAt: index,
          resolvedAt: open ? null : index,
          resolvedBy: open ? null : "operator:test",
          resolution: open ? null : "resolved",
          revision: 1,
        });
      }
    });
    const presentation = f.state.transaction((repositories) => repositories.goals.listBlockers(f.goal.goalId, 1, 200));
    assert.equal(presentation.length, 200);
    assert.equal(presentation.some((blocker) => blocker.status === "OPEN"), false);
    assert.throws(() => f.executor.adoptPlanRevision({ ...f.owner, targetPlanRevision: revised.planRevision, expectedExecutionRevision: waiting.execution.revision, expectedFlowRevision: waiting.flow.flow.revision }), (error) => error instanceof GoalExecutorError && error.code === "GOAL_EXECUTION_BLOCKER_REQUIRED");
  } finally { await f.cleanup(); }
});
