import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase, OPENRILL_STATE_SCHEMA_VERSION } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { GoalError, GoalService } from "../../packages/goals/dist/index.js";
import { createGoalTools } from "../../packages/tools-goals/dist/index.js";

async function fixture(name) {
  const root = await mkdtemp(join(tmpdir(), `openrill-step019a-${name}-`));
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") };
  const paths = resolveProfilePaths({ profile: name, env });
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  let now = 1000;
  let id = 0;
  const conversations = new ConversationService({ state, workspaceIds: ["alpha", "beta"], now: () => ++now, createId: () => `conversation-id-${++id}` });
  const goals = new GoalService(state, { now: () => ++now, createId: () => `goal-id-${++id}` });
  const conversation = conversations.create({ workspaceId: "alpha", modelProfile: "default" });
  const sent = conversations.send({ workspaceId: "alpha", conversationId: conversation.conversationId, submissionKey: `${name}-submission`, text: "Create a durable goal." });
  return {
    root, paths, state, conversations, goals, conversation, sent,
    provenance: { workspaceId: "alpha", conversationId: conversation.conversationId, sourceRunId: sent.run.runId, sourceAttemptId: sent.run.currentAttemptId },
    cleanup: async () => { if (state.isOpen()) state.close({ checkpointMode: "TRUNCATE" }); await rm(root, { recursive: true, force: true }); },
  };
}

function expectCode(code) {
  return (error) => error instanceof GoalError && error.code === code;
}

test("STEP019A schema 17 introduction persists a revisioned ordered plan and evidence ledger", async () => {
  const f = await fixture("goal-plan");
  try {
    assert.ok(OPENRILL_STATE_SCHEMA_VERSION >= 17);
    assert.equal(f.state.schemaVersion, OPENRILL_STATE_SCHEMA_VERSION);
    const created = f.goals.create({
      ...f.provenance,
      objective: "Ship a verified release",
      steps: ["Inspect current state", "Apply the bounded change", "Run acceptance evidence"],
    });
    assert.equal(created.status, "ACTIVE");
    assert.equal(created.steps.length, 3);
    assert.equal(created.revision, 1);
    assert.equal(created.steps[0].status, "PENDING");

    assert.throws(() => f.goals.updateStep({
      ...f.provenance,
      goalId: created.goalId,
      stepId: created.steps[1].stepId,
      expectedGoalRevision: created.revision,
      expectedStepRevision: created.steps[1].revision,
      status: "IN_PROGRESS",
    }), expectCode("GOAL_PLAN_INVALID"));

    const firstStarted = f.goals.updateStep({
      ...f.provenance,
      goalId: created.goalId,
      stepId: created.steps[0].stepId,
      expectedGoalRevision: created.revision,
      expectedStepRevision: created.steps[0].revision,
      status: "IN_PROGRESS",
      note: "Inspection started",
    });
    assert.equal(firstStarted.steps[0].status, "IN_PROGRESS");
    assert.equal(firstStarted.planRevision, 2);

    assert.throws(() => f.goals.updateStep({
      ...f.provenance,
      goalId: created.goalId,
      stepId: created.steps[0].stepId,
      expectedGoalRevision: created.revision,
      expectedStepRevision: created.steps[0].revision,
      status: "COMPLETED",
    }), expectCode("GOAL_REVISION_CONFLICT"));

    const firstDone = f.goals.updateStep({
      ...f.provenance,
      goalId: firstStarted.goalId,
      stepId: firstStarted.steps[0].stepId,
      expectedGoalRevision: firstStarted.revision,
      expectedStepRevision: firstStarted.steps[0].revision,
      status: "COMPLETED",
      note: "Current state inspected",
    });
    assert.equal(firstDone.steps[0].status, "COMPLETED");
    assert.throws(() => f.goals.complete({ ...f.provenance, goalId: firstDone.goalId, expectedGoalRevision: firstDone.revision }), expectCode("GOAL_COMPLETION_UNPROVEN"));

    let current = firstDone;
    for (const step of current.steps.slice(1)) {
      current = f.goals.updateStep({
        ...f.provenance,
        goalId: current.goalId,
        stepId: step.stepId,
        expectedGoalRevision: current.revision,
        expectedStepRevision: step.revision,
        status: "COMPLETED",
        note: `Evidence for ${step.title}`,
      });
    }
    const completed = f.goals.complete({ ...f.provenance, goalId: current.goalId, expectedGoalRevision: current.revision, note: "All acceptance evidence passed" });
    assert.equal(completed.status, "COMPLETED");
    assert.equal(completed.steps.every((step) => step.status === "COMPLETED"), true);
    const view = f.goals.current({ workspaceId: "alpha", conversationId: f.conversation.conversationId });
    assert.equal(view.goal.status, "COMPLETED");
    assert.equal(view.recentEvents.some((event) => event.eventType === "goal.completed"), true);
  } finally {
    await f.cleanup();
  }
});

test("STEP019A blocker recurrence, explicit resume, and context continuation are durable", async () => {
  const f = await fixture("goal-resume");
  try {
    let goal = f.goals.create({ ...f.provenance, objective: "Finish the migration", steps: ["Run the migration"] });
    for (let count = 1; count <= 3; count += 1) {
      goal = f.goals.reportBlocker({ ...f.provenance, goalId: goal.goalId, expectedGoalRevision: goal.revision, note: "Database maintenance window is closed" });
      assert.equal(goal.consecutiveBlockerCount, count);
      assert.equal(goal.status, count === 3 ? "BLOCKED" : "ACTIVE");
    }
    assert.equal(f.goals.prepareContext({ ...f.provenance, sourceRunId: f.sent.run.runId, sourceAttemptId: f.sent.run.currentAttemptId }), null);
    goal = f.goals.control({ ...f.provenance, goalId: goal.goalId, expectedGoalRevision: goal.revision, action: "RESUME", note: "Maintenance window opened" });
    assert.equal(goal.status, "ACTIVE");
    assert.equal(goal.consecutiveBlockerCount, 0);
    const context = f.goals.prepareContext({ ...f.provenance, sourceRunId: f.sent.run.runId, sourceAttemptId: f.sent.run.currentAttemptId });
    assert.match(context, /Active Goal Context/);
    assert.match(context, /Finish the migration/);
    assert.match(context, /1\. \[PENDING\] Run the migration/);
    assert.match(context, /Continuation turn: 1/);

    f.state.close({ checkpointMode: "TRUNCATE" });
    const reopened = await openOpenRillStateDatabase({ profilePaths: f.paths });
    try {
      const durable = new GoalService(reopened).current({ workspaceId: "alpha", conversationId: f.conversation.conversationId });
      assert.equal(durable.goal.status, "ACTIVE");
      assert.equal(durable.goal.continuationCount, 1);
      assert.equal(durable.recentEvents.some((event) => event.eventType === "goal.continued"), true);
    } finally {
      reopened.close({ checkpointMode: "TRUNCATE" });
    }
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("STEP019A goal tools enforce real provenance and exact workspace scope", async () => {
  const f = await fixture("goal-tools");
  try {
    const tools = Object.fromEntries(createGoalTools(f.goals).map((tool) => [tool.name, tool]));
    const context = { runId: f.sent.run.runId, attemptId: f.sent.run.currentAttemptId, workspaceId: "alpha", conversationId: f.conversation.conversationId, toolCallId: "goal-call" };
    const created = await tools["goal.create"].execute({ objective: "Produce the evidence bundle", steps: ["Collect evidence", "Verify evidence"] }, context);
    assert.equal(created.isError, false);
    assert.equal(created.output.provenance.runId, f.sent.run.runId);
    const shown = await tools["goal.get"].execute({}, context);
    assert.equal(shown.isError, false);
    assert.equal(shown.output.goal.objective, "Produce the evidence bundle");

    const crossWorkspace = await tools["goal.get"].execute({}, { ...context, workspaceId: "beta" });
    assert.equal(crossWorkspace.isError, true);
    assert.equal(crossWorkspace.output.error.code, "GOAL_PROVENANCE_INVALID");

    const fakeAttempt = await tools["goal.create"].execute({ objective: "Invalid provenance" }, { ...context, conversationId: f.conversation.conversationId, attemptId: "missing-attempt" });
    assert.equal(fakeAttempt.isError, true);
    assert.equal(fakeAttempt.output.error.code, "GOAL_PROVENANCE_INVALID");
  } finally {
    await f.cleanup();
  }
});
