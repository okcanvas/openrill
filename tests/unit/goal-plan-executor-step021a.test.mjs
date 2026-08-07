import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase, OPENRILL_STATE_SCHEMA_VERSION } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { GoalService } from "../../packages/goals/dist/index.js";
import { TaskService } from "../../packages/tasks/dist/index.js";
import { TaskFlowControllerRuntimeFactory, TaskFlowService } from "../../packages/task-flows/dist/index.js";
import { GoalExecutorError, GoalPlanExecutorService } from "../../packages/goal-executor/dist/index.js";

async function fixture(name, stepTitles = ["Produce the first artifact", "Verify the final artifact"]) {
  const root = await mkdtemp(join(tmpdir(), `openrill-step021a-${name}-`));
  const paths = resolveProfilePaths({ profile: `step021a-${name}`, env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  let clock = 30_000;
  let id = 0;
  const now = () => ++clock;
  const state = await openOpenRillStateDatabase({ profilePaths: paths, now });
  const conversations = new ConversationService({ state, workspaceIds: ["alpha"], createId: () => `${name}-${++id}`, now });
  const goals = new GoalService(state, { createId: () => `${name}-goal-${++id}`, now });
  const tasks = new TaskService(state, ["alpha"]);
  const flows = new TaskFlowService(state, tasks, ["alpha"], now);
  const conversation = conversations.create({ workspaceId: "alpha", title: "Goal executor owner" });
  const source = conversations.send({ workspaceId: "alpha", conversationId: conversation.conversationId, submissionKey: `${name}-source`, text: "Create the durable Goal." });
  const goal = goals.create({
    workspaceId: "alpha", conversationId: conversation.conversationId,
    sourceRunId: source.run.runId, sourceAttemptId: source.run.currentAttemptId,
    objective: "Complete the ordered durable plan", steps: stepTitles,
  });
  const scheduled = [];
  const runtimes = new TaskFlowControllerRuntimeFactory({
    state, conversations, tasks, taskFlows: flows, now,
    scheduleRun: (runId) => { scheduled.push(runId); return true; },
    cancelTask: (task) => tasks.cancel({ workspaceId: task.workspaceId, taskId: task.taskId }, (current) => {
      conversations.cancel({ workspaceId: current.workspaceId, conversationId: current.conversationId, runId: current.runId });
    }),
  });
  const executor = new GoalPlanExecutorService({ state, tasks, taskFlows: flows, runtimes, now });
  return {
    root, paths, state, conversations, goals, tasks, flows, conversation, source, goal, scheduled, runtimes, executor, now,
    cleanup: async () => { if (state.isOpen()) state.close(); await rm(root, { recursive: true, force: true }); },
  };
}

function completeTask(f, taskId, text) {
  const task = f.tasks.get({ workspaceId: "alpha", taskId }).task;
  f.conversations.transitionRun({ runId: task.runId, status: "RUNNING" });
  f.conversations.transitionRun({ runId: task.runId, status: "COMPLETED", taskCompletionText: text });
  return f.tasks.get({ workspaceId: "alpha", taskId }).task;
}

function nextStepState(view) {
  const state = view.flow.flow.state;
  assert.equal(state?.kind, "goal-plan-executor");
  assert.ok(state.nextStep);
  return state.nextStep;
}

test("STEP021A schema 23 creates one durable Goal execution, Flow, and first child admission with exact replay", async () => {
  const f = await fixture("start");
  try {
    assert.ok(OPENRILL_STATE_SCHEMA_VERSION >= 23);
    const first = f.executor.start({ workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: f.goal.goalId, expectedGoalRevision: f.goal.revision });
    assert.equal(first.replayed, false);
    assert.equal(first.admitted, true);
    assert.equal(first.scheduled, true);
    assert.equal(first.view.execution.status, "RUNNING");
    assert.equal(first.view.steps[0].status, "RUNNING");
    assert.equal(first.view.steps[1].status, "PENDING");
    assert.equal(first.view.flow.tasks.length, 1);
    assert.equal(first.view.flow.tasks[0].taskId, first.view.steps[0].currentTaskId);
    assert.equal(first.view.goal.planRevision, first.view.execution.planRevision);
    assert.equal(f.scheduled.length, 1);

    const replay = f.executor.start({ workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: f.goal.goalId, expectedGoalRevision: f.goal.revision });
    assert.equal(replay.replayed, true);
    assert.equal(replay.view.execution.flowId, first.view.execution.flowId);
    assert.equal(replay.view.steps[0].currentTaskId, first.view.steps[0].currentTaskId);
    assert.equal(replay.view.flow.tasks.length, 1);
    assert.equal(f.tasks.list({ workspaceId: "alpha" }).filter((task) => task.taskKind === "task_flow.child").length, 1);
  } finally { await f.cleanup(); }
});

test("STEP021A semantic completion advances exactly one ordered Step and controller admission returns the same single child result", async () => {
  const f = await fixture("advance");
  try {
    const started = f.executor.start({ workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: f.goal.goalId, expectedGoalRevision: f.goal.revision });
    const firstTaskId = started.view.steps[0].currentTaskId;
    const terminal = completeTask(f, firstTaskId, "Final artifact: step one completed with evidence.");
    assert.equal(terminal.terminalOutcome, "SUCCEEDED");
    const advanced = f.executor.reconcileTask(firstTaskId);
    assert.equal(advanced.steps[0].status, "SUCCEEDED");
    assert.equal(advanced.steps[1].status, "READY");
    assert.equal(advanced.flow.tasks.length, 1);

    const controller = f.executor.controllerForFlow(advanced.execution.flowId);
    assert.ok(controller);
    const next = nextStepState(advanced);
    const child = controller.runTask({
      flowId: advanced.execution.flowId,
      expectedRevision: advanced.flow.flow.revision,
      requestKey: next.requestKey,
      stepKey: next.stepKey,
      text: next.text,
    });
    assert.equal(child.replayed, false);
    assert.equal(child.task.taskId, f.executor.get({ workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: f.goal.goalId }).steps[1].currentTaskId);
    assert.equal(f.tasks.list({ workspaceId: "alpha" }).filter((task) => task.taskKind === "task_flow.child").length, 2);

    const replay = controller.runTask({
      flowId: advanced.execution.flowId,
      expectedRevision: advanced.flow.flow.revision,
      requestKey: next.requestKey,
      stepKey: next.stepKey,
      text: next.text,
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.task.taskId, child.task.taskId);
    assert.equal(f.tasks.list({ workspaceId: "alpha" }).filter((task) => task.taskKind === "task_flow.child").length, 2);
  } finally { await f.cleanup(); }
});

test("STEP021A BLOCKED completion stops later admission and explicit resume creates a new Task attempt for the same Step", async () => {
  const f = await fixture("blocked", ["Resolve the blocking input", "Publish the result"]);
  try {
    const started = f.executor.start({ workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: f.goal.goalId, expectedGoalRevision: f.goal.revision });
    const taskId = started.view.steps[0].currentTaskId;
    const terminal = completeTask(f, taskId, "확인해 보겠습니다.");
    assert.equal(terminal.terminalOutcome, "BLOCKED");
    const blocked = f.executor.reconcileTask(taskId);
    assert.equal(blocked.execution.status, "BLOCKED");
    assert.equal(blocked.goal.status, "BLOCKED");
    assert.equal(blocked.steps[0].status, "BLOCKED");
    assert.equal(blocked.steps[1].status, "PENDING");
    assert.equal(blocked.flow.tasks.length, 1);
    assert.equal(f.executor.advance({ workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: f.goal.goalId }).action, "BLOCKED");

    const blocker = blocked.blockers.find((entry) => entry.status === "OPEN");
    assert.ok(blocker);
    const resumed = f.executor.resolveBlocker({
      workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: f.goal.goalId,
      blockerId: blocker.blockerId, expectedBlockerRevision: blocker.revision,
      expectedExecutionRevision: blocked.execution.revision, expectedFlowRevision: blocked.flow.flow.revision,
      resolvedBy: "step021a-history", resolution: "Historical explicit resume now records blocker resolution.",
    });
    assert.equal(resumed.action, "ADMITTED");
    assert.equal(resumed.view.goal.status, "ACTIVE");
    assert.equal(resumed.view.steps[0].attemptCount, 2);
    assert.notEqual(resumed.view.steps[0].currentTaskId, taskId);
    assert.equal(resumed.view.steps[1].status, "PENDING");
    assert.equal(resumed.view.flow.tasks.length, 2);
  } finally { await f.cleanup(); }
});

test("STEP021A child admission rollback leaves no orphan Run, Task, Flow link, or Step binding", async () => {
  const f = await fixture("rollback", ["Atomic child"]);
  try {
    const external = new DatabaseSync(f.state.diagnostics().databasePath);
    try {
      external.exec(`CREATE TRIGGER reject_step021a_step_update BEFORE UPDATE ON agent_goal_step_executions WHEN NEW.status = 'RUNNING' BEGIN SELECT RAISE(ABORT, 'reject step021a projection'); END;`);
    } finally { external.close(); }
    assert.throws(
      () => f.executor.start({ workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: f.goal.goalId, expectedGoalRevision: f.goal.revision }),
      /reject step021a projection/,
    );
    const view = f.executor.get({ workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: f.goal.goalId });
    assert.equal(view.execution.status, "QUEUED");
    assert.equal(view.steps[0].status, "READY");
    assert.equal(view.steps[0].currentTaskId, null);
    assert.equal(view.flow.tasks.length, 0);
    assert.equal(f.tasks.list({ workspaceId: "alpha" }).filter((task) => task.taskKind === "task_flow.child").length, 0);

    const external2 = new DatabaseSync(f.state.diagnostics().databasePath);
    try { external2.exec("DROP TRIGGER reject_step021a_step_update"); } finally { external2.close(); }
    const recovered = f.executor.advance({ workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: f.goal.goalId });
    assert.equal(recovered.action, "ADMITTED");
    assert.equal(recovered.view.flow.tasks.length, 1);
  } finally { await f.cleanup(); }
});

test("STEP021A all required Steps must semantically succeed before Goal and Flow completion", async () => {
  const f = await fixture("finish", ["Only required step"]);
  try {
    const started = f.executor.start({ workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: f.goal.goalId, expectedGoalRevision: f.goal.revision });
    assert.throws(
      () => f.executor.finish({ workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: f.goal.goalId, expectedExecutionRevision: started.view.execution.revision, expectedFlowRevision: started.view.flow.flow.revision }),
      (error) => error instanceof GoalExecutorError && error.code === "GOAL_EXECUTION_STATE_INVALID",
    );
    const taskId = started.view.steps[0].currentTaskId;
    completeTask(f, taskId, "Final deliverable produced and verified.");
    const readyToFinish = f.executor.reconcileTask(taskId);
    assert.equal(readyToFinish.steps[0].status, "SUCCEEDED");
    const completed = f.executor.finish({
      workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: f.goal.goalId,
      expectedExecutionRevision: readyToFinish.execution.revision, expectedFlowRevision: readyToFinish.flow.flow.revision,
    });
    assert.equal(completed.execution.status, "SUCCEEDED");
    assert.equal(completed.flow.flow.status, "SUCCEEDED");
    assert.equal(completed.goal.status, "COMPLETED");
  } finally { await f.cleanup(); }
});

test("STEP021A restart recovery preserves the same Goal, Flow, Step, Task, and does not duplicate admission", async () => {
  const f = await fixture("restart", ["Restart-safe child"]);
  try {
    const started = f.executor.start({ workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: f.goal.goalId, expectedGoalRevision: f.goal.revision });
    const identity = {
      flowId: started.view.execution.flowId,
      taskId: started.view.steps[0].currentTaskId,
      runId: started.view.flow.tasks[0].task.runId,
    };
    f.state.close();
    const state2 = await openOpenRillStateDatabase({ profilePaths: f.paths, now: f.now });
    try {
      const conversations2 = new ConversationService({ state: state2, workspaceIds: ["alpha"], now: f.now });
      const tasks2 = new TaskService(state2, ["alpha"]);
      const flows2 = new TaskFlowService(state2, tasks2, ["alpha"], f.now);
      const scheduled2 = [];
      const runtimes2 = new TaskFlowControllerRuntimeFactory({ state: state2, conversations: conversations2, tasks: tasks2, taskFlows: flows2, now: f.now, scheduleRun: (runId) => { scheduled2.push(runId); return true; } });
      const executor2 = new GoalPlanExecutorService({ state: state2, tasks: tasks2, taskFlows: flows2, runtimes: runtimes2, now: f.now });
      const recovery = executor2.recover();
      assert.equal(recovery.scanned, 1);
      const restored = executor2.get({ workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: f.goal.goalId });
      assert.equal(restored.execution.flowId, identity.flowId);
      assert.equal(restored.steps[0].currentTaskId, identity.taskId);
      assert.equal(restored.flow.tasks[0].task.runId, identity.runId);
      assert.equal(restored.flow.tasks.length, 1);
      assert.equal(tasks2.list({ workspaceId: "alpha" }).filter((task) => task.taskKind === "task_flow.child").length, 1);
      assert.deepEqual(scheduled2, []);
    } finally { state2.close(); }
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test("STEP021A restart reconciles a terminal child but leaves the next READY Step for the durable controller decision", async () => {
  const f = await fixture("restart-terminal", ["Complete before restart", "Continue only after controller wake"]);
  try {
    const started = f.executor.start({ workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: f.goal.goalId, expectedGoalRevision: f.goal.revision });
    const firstTaskId = started.view.steps[0].currentTaskId;
    completeTask(f, firstTaskId, "Final deliverable completed before Host restart.");
    f.state.close();
    const state2 = await openOpenRillStateDatabase({ profilePaths: f.paths, now: f.now });
    try {
      const conversations2 = new ConversationService({ state: state2, workspaceIds: ["alpha"], now: f.now });
      const tasks2 = new TaskService(state2, ["alpha"]);
      const flows2 = new TaskFlowService(state2, tasks2, ["alpha"], f.now);
      const scheduled2 = [];
      const runtimes2 = new TaskFlowControllerRuntimeFactory({ state: state2, conversations: conversations2, tasks: tasks2, taskFlows: flows2, now: f.now, scheduleRun: (runId) => { scheduled2.push(runId); return true; } });
      const executor2 = new GoalPlanExecutorService({ state: state2, tasks: tasks2, taskFlows: flows2, runtimes: runtimes2, now: f.now });
      const recovery = executor2.recover();
      assert.equal(recovery.reconciled, 1);
      assert.equal(recovery.admitted, 0);
      assert.deepEqual(scheduled2, []);
      const restored = executor2.get({ workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: f.goal.goalId });
      assert.deepEqual(restored.steps.map((step) => step.status), ["SUCCEEDED", "READY"]);
      assert.equal(restored.flow.tasks.length, 1);
      assert.equal(restored.execution.status, "RUNNING");
    } finally { state2.close(); }
  } finally { await rm(f.root, { recursive: true, force: true }); }
});


test("STEP021A execution ownership blocks generic Goal and Plan mutations while the executor is active", async () => {
  const f = await fixture("owned-mutation", ["Execution-owned step"]);
  try {
    const started = f.executor.start({ workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: f.goal.goalId, expectedGoalRevision: f.goal.revision });
    const current = f.goals.current({ workspaceId: "alpha", conversationId: f.conversation.conversationId }).goal;
    const expectOwned = (operation) => assert.throws(operation, (error) => error?.code === "GOAL_EXECUTION_ACTIVE");
    expectOwned(() => f.goals.setPlan({
      workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: current.goalId,
      expectedGoalRevision: current.revision, steps: ["Replacement step"],
    }));
    expectOwned(() => f.goals.updateStep({
      workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: current.goalId,
      expectedGoalRevision: current.revision, stepId: current.steps[0].stepId,
      expectedStepRevision: current.steps[0].revision, status: "COMPLETED", note: "bypass",
    }));
    expectOwned(() => f.goals.reportBlocker({
      workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: current.goalId,
      expectedGoalRevision: current.revision, note: "generic blocker bypass",
    }));
    expectOwned(() => f.goals.control({
      workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: current.goalId,
      expectedGoalRevision: current.revision, action: "CANCEL",
    }));
    expectOwned(() => f.goals.complete({
      workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: current.goalId,
      expectedGoalRevision: current.revision,
    }));
    const after = f.executor.get({ workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: f.goal.goalId });
    assert.equal(after.execution.status, "RUNNING");
    assert.equal(after.goal.status, "ACTIVE");
    assert.equal(after.steps[0].currentTaskId, started.view.steps[0].currentTaskId);
    assert.equal(after.flow.tasks.length, 1);
  } finally { await f.cleanup(); }
});

test("STEP021A restart recovery projects a Flow cancellation that committed before Goal cancellation projection", async () => {
  const f = await fixture("cancel-recovery", ["Cancelable child", "Never admitted"]);
  try {
    const started = f.executor.start({ workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: f.goal.goalId, expectedGoalRevision: f.goal.revision });
    const base = f.runtimes.bind({
      workspaceId: "alpha", ownerKey: f.conversation.conversationId, controllerId: started.view.execution.controllerId,
    });
    base.cancel({ flowId: started.view.execution.flowId, expectedRevision: started.view.flow.flow.revision });
    const split = f.executor.get({ workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: f.goal.goalId });
    assert.equal(split.flow.flow.status, "CANCELLED");
    assert.equal(split.execution.status, "RUNNING");
    assert.equal(split.goal.status, "ACTIVE");

    f.state.close();
    const state2 = await openOpenRillStateDatabase({ profilePaths: f.paths, now: f.now });
    try {
      const conversations2 = new ConversationService({ state: state2, workspaceIds: ["alpha"], now: f.now });
      const tasks2 = new TaskService(state2, ["alpha"]);
      const flows2 = new TaskFlowService(state2, tasks2, ["alpha"], f.now);
      const runtimes2 = new TaskFlowControllerRuntimeFactory({
        state: state2, conversations: conversations2, tasks: tasks2, taskFlows: flows2, now: f.now, scheduleRun: () => true,
      });
      const executor2 = new GoalPlanExecutorService({ state: state2, tasks: tasks2, taskFlows: flows2, runtimes: runtimes2, now: f.now });
      const recovery = executor2.recover();
      assert.equal(recovery.scanned, 1);
      assert.equal(recovery.reconciled, 1);
      assert.equal(recovery.failed, 0);
      const restored = executor2.get({ workspaceId: "alpha", conversationId: f.conversation.conversationId, goalId: f.goal.goalId });
      assert.equal(restored.execution.status, "CANCELLED");
      assert.equal(restored.goal.status, "CANCELLED");
      assert.deepEqual(restored.steps.map((step) => step.status), ["CANCELLED", "CANCELLED"]);
      const cancelEvents = state2.transaction((repositories) => repositories.goals.listEvents(f.goal.goalId, 100))
        .filter((event) => event.eventType === "goal.execution.cancelled");
      assert.equal(cancelEvents.length, 1);
    } finally { state2.close(); }
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
