import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { TaskService } from "../../packages/tasks/dist/index.js";
import { AutomationConversationExecutor } from "../../services/agent-host/dist/automation-conversation-executor.js";

test("STEP020A automation execution reclassifies the linked Conversation Run Task instead of creating a second ledger", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step020a-automation-"));
  const paths = resolveProfilePaths({ profile: "task-automation", env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  let n = 0;
  let clock = 2000;
  const now = () => ++clock;
  const conversations = new ConversationService({ state, workspaceIds: ["alpha"], createId: () => `automation-${++n}`, now });
  const tasks = new TaskService(state, ["alpha"]);
  let boundRunId = null;
  const coordinator = {
    cancel: () => true,
    async executeUntilTerminal(runId) {
      conversations.transitionRun({ runId, status: "RUNNING" });
      conversations.transitionRun({ runId, status: "COMPLETED" });
      return { status: "COMPLETED" };
    },
  };
  const executor = new AutomationConversationExecutor({ conversations, coordinator, tasks, now, publishNotice: () => {} });
  const controller = new AbortController();
  try {
    const result = await executor.execute({
      job: { config: { name: "nightly audit", conversationTemplate: { workspaceId: "alpha", prompt: "audit durable state", modelProfile: "default" } } },
      run: { automationRunId: "automation-run-1", runId: null },
      signal: controller.signal,
      bindRunId(runId) { boundRunId = runId; return { automationRunId: "automation-run-1", runId }; },
    });
    assert.equal(result.status, "SUCCEEDED");
    assert.equal(result.runId, boundRunId);
    const items = tasks.list({ workspaceId: "alpha" });
    assert.equal(items.length, 1);
    assert.equal(items[0].runtime, "AUTOMATION");
    assert.equal(items[0].taskKind, "automation.run");
    assert.equal(items[0].sourceId, "automation-run-1");
    assert.equal(items[0].status, "SUCCEEDED");
  } finally {
    state.close();
    await rm(root, { recursive: true, force: true });
  }
});
