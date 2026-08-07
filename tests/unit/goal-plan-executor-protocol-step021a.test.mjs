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

function status() { return { product: "OpenRill", version: "0.21.0-step021a", profile: "goal-executor", pid: 1, instanceId: "test", bind: "127.0.0.1", port: 0, startedAt: new Date(0).toISOString(), state: "READY", readiness: true }; }

test("STEP021A protocol exposes owner-scoped Goal execution start/get/resume/cancel and blocks generic Flow bypass", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step021a-protocol-"));
  const paths = resolveProfilePaths({ profile: "goal-executor", env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  try {
    let id = 0;
    const conversations = new ConversationService({ state, workspaceIds: ["alpha"], createId: () => `goal-protocol-${++id}` });
    const goals = new GoalService(state, { createId: () => `goal-protocol-${++id}` });
    const tasks = new TaskService(state, ["alpha"]);
    const flows = new TaskFlowService(state, tasks, ["alpha"]);
    const conversation = conversations.create({ workspaceId: "alpha" });
    const source = conversations.send({ workspaceId: "alpha", conversationId: conversation.conversationId, submissionKey: "source", text: "Create the goal." });
    const goal = goals.create({ workspaceId: "alpha", conversationId: conversation.conversationId, sourceRunId: source.run.runId, sourceAttemptId: source.run.currentAttemptId, objective: "Execute the protocol plan", steps: ["First", "Second"] });
    const scheduled = [];
    const factory = new TaskFlowControllerRuntimeFactory({
      state, conversations, tasks, taskFlows: flows,
      scheduleRun: (runId) => { scheduled.push(runId); return true; },
      cancelTask: (task) => tasks.cancel({ workspaceId: task.workspaceId, taskId: task.taskId }, (current) => {
        conversations.cancel({ workspaceId: current.workspaceId, conversationId: current.conversationId, runId: current.runId });
      }),
    });
    const executor = new GoalPlanExecutorService({ state, tasks, taskFlows: flows, runtimes: factory });
    const goalHooks = {
      start: (input) => executor.start(input),
      get: (input) => executor.get(input),
      resume: (input) => executor.resume(input),
      cancel: (input) => executor.cancel(input),
    };
    const flowHooks = {
      list: (input) => ({ items: flows.list(input) }),
      get: (input) => flows.get(input),
      create: (input) => factory.bind(input).createManaged(input),
      run: (input) => (executor.controllerForFlow(input.flowId, input) ?? factory.bind(input)).runTask(input),
      wait: (input) => (executor.controllerForFlow(input.flowId, input) ?? factory.bind(input)).setWaiting(input),
      resume: (input) => (executor.controllerForFlow(input.flowId, input) ?? factory.bind(input)).resume(input),
      finish: (input) => (executor.controllerForFlow(input.flowId, input) ?? factory.bind(input)).finish(input),
      fail: (input) => (executor.controllerForFlow(input.flowId, input) ?? factory.bind(input)).fail(input),
      cancel: (input) => {
        const flow = flows.get(input).flow;
        return (executor.controllerForFlow(input.flowId, { workspaceId: input.workspaceId, ownerKey: input.ownerKey, controllerId: flow.controllerId }) ?? factory.bind({ workspaceId: input.workspaceId, ownerKey: input.ownerKey, controllerId: flow.controllerId })).cancel(input);
      },
    };
    const registry = createDefaultOperationRegistry(
      status, conversations, () => {},
      { schedule: () => true, cancel: () => true, execute: async () => { throw new Error("not used"); } },
      undefined, undefined, undefined, undefined, undefined, flowHooks, goalHooks,
    );
    const capabilities = registry.capabilities().map((entry) => entry.name);
    for (const operation of ["goalExecution.start", "goalExecution.get", "goalExecution.resume", "goalExecution.cancel"]) assert.ok(capabilities.includes(operation));

    const owner = { workspaceId: "alpha", conversationId: conversation.conversationId, goalId: goal.goalId };
    const started = await registry.invoke("start", "goalExecution.start", { ...owner, expectedGoalRevision: goal.revision });
    assert.equal(started.ok, true);
    assert.equal(started.output.admitted, true);
    assert.equal(started.output.view.steps[0].status, "RUNNING");
    const execution = started.output.view.execution;
    const flow = started.output.view.flow.flow;

    const shown = await registry.invoke("get", "goalExecution.get", owner);
    assert.equal(shown.ok, true);
    assert.equal(shown.output.execution.flowId, execution.flowId);

    const bypass = await registry.invoke("bypass", "taskFlow.run", {
      workspaceId: "alpha", ownerKey: conversation.conversationId, controllerId: flow.controllerId,
      flowId: flow.flowId, expectedRevision: flow.revision,
      requestKey: "arbitrary", stepKey: "arbitrary", text: "Bypass the ordered Plan.",
    });
    assert.equal(bypass.ok, false);
    assert.equal(bypass.error.code, "CONFLICT");
    assert.equal(tasks.list({ workspaceId: "alpha" }).filter((task) => task.taskKind === "task_flow.child").length, 1);

    const denied = await registry.invoke("denied", "goalExecution.get", { ...owner, conversationId: "other-owner" });
    assert.equal(denied.ok, false);
    assert.equal(denied.error.code, "ACCESS_DENIED");

    const cancelled = await registry.invoke("cancel", "goalExecution.cancel", {
      ...owner, expectedExecutionRevision: shown.output.execution.revision, expectedFlowRevision: shown.output.flow.flow.revision,
    });
    assert.equal(cancelled.ok, true);
    assert.equal(cancelled.output.execution.status, "CANCELLED");
    assert.equal(cancelled.output.goal.status, "CANCELLED");
  } finally {
    state.close();
    await rm(root, { recursive: true, force: true });
  }
});
