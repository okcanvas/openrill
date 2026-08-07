import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { ApprovalService } from "../../packages/approval/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ProcessManager } from "../../packages/tools-process/dist/index.js";
import { createWorkspaceCatalog } from "../../packages/workspace/dist/index.js";
import { removeTreeWithRetries } from "../../scripts/live-fixture-cleanup.mjs";
import { readFile } from "node:fs/promises";

function delayedChild(delayMs = 80) {
  const child = new EventEmitter();
  child.pid = 4242;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killCalls = 0;
  child.kill = () => {
    child.killCalls += 1;
    setTimeout(() => {
      child.stdout.end("closed\n");
      child.stderr.end();
      child.emit("close", null, "SIGTERM");
    }, delayMs);
    return true;
  };
  return child;
}

async function fixture(delayMs = 80) {
  const root = await mkdtemp(join(tmpdir(), "openrill-step011r7-"));
  const workspaceRoot = join(root, "workspace");
  await mkdir(workspaceRoot);
  const paths = resolveProfilePaths({
    profile: "step011r7",
    env: {
      OPENRILL_DATA_ROOT: join(root, "data"),
      OPENRILL_CONFIG_ROOT: join(root, "config"),
    },
  });
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  const catalog = await createWorkspaceCatalog([{ id: "main", path: workspaceRoot }]);
  const descriptor = catalog.internal("main");
  state.transaction((repositories) => repositories.workspaces.upsertWorkspace({
    workspaceId: descriptor.workspaceId,
    displayName: descriptor.displayName,
    canonicalRoot: descriptor.canonicalRoot,
    rootRevision: descriptor.rootRevision,
    accessMode: descriptor.accessMode,
    trustState: descriptor.trustState,
    updatedAt: Date.now(),
  }));
  const conversations = new ConversationService({ state, workspaceIds: ["main"] });
  const conversation = conversations.create({ workspaceId: "main" });
  const sent = conversations.send({
    workspaceId: "main",
    conversationId: conversation.conversationId,
    submissionKey: "step011r7-close",
    text: "run background process",
  });
  const execution = conversations.executionContext(sent.run.runId);
  const child = delayedChild(delayMs);
  const approvals = new ApprovalService({ state });
  const manager = new ProcessManager({
    state,
    workspaces: catalog,
    approvals,
    policy: { defaultDecision: "ALLOW" },
    rootDirectory: join(root, "processes"),
    configRoot: root,
    spawnProcess: () => child,
  });
  const context = {
    runId: sent.run.runId,
    attemptId: execution.attempt.attemptId,
    conversationId: conversation.conversationId,
    workspaceId: "main",
    toolCallId: "tool-step011r7-close",
  };
  return { root, state, manager, child, context };
}

async function cleanup(f) {
  await f.manager.close();
  if (f.state.isOpen()) f.state.close();
  await removeTreeWithRetries(f.root);
}

test("ProcessManager.close waits for delayed background child quiescence", async () => {
  const f = await fixture();
  try {
    const result = await f.manager.run({
      command: { kind: "argv", executable: process.execPath, args: ["-e", "setInterval(()=>{},1000)"] },
      background: true,
    }, f.context);
    assert.equal(result.isError, false);
    let settled = false;
    const closing = f.manager.close().then(() => { settled = true; });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(settled, false);
    assert.equal(f.state.isOpen(), true);
    await closing;
    assert.equal(settled, true);
    assert.equal(f.child.killCalls, 1);
  } finally {
    await cleanup(f);
  }
});

test("delayed child close preserves the durable CANCELLED terminal state", async () => {
  const f = await fixture();
  try {
    const result = await f.manager.run({
      command: { kind: "argv", executable: process.execPath, args: ["-e", "setInterval(()=>{},1000)"] },
      background: true,
    }, f.context);
    const processId = result.output.processId;
    assert.equal(f.manager.cancel({ processId }).output.status, "CANCELLED");
    await f.manager.close();
    assert.equal(f.manager.list().find((item) => item.processId === processId).status, "CANCELLED");
  } finally {
    await cleanup(f);
  }
});

test("Host shutdown awaits active Runs, BrowserRuntime, and ProcessManager before closing SQLite", async () => {
  const source = await readFile(new URL("../../services/agent-host/src/lifecycle.ts", import.meta.url), "utf8");
  const coordinator = source.indexOf("await runCoordinator?.close()");
  const drains = source.indexOf("const drains = await Promise.allSettled([");
  const browser = source.indexOf("browserRuntime?.close()", drains);
  const manager = source.indexOf("processManager?.close()", drains);
  const database = source.indexOf('stateDatabase.close({ checkpointMode: "TRUNCATE" })', drains);
  assert.ok(coordinator >= 0 && drains > coordinator);
  assert.ok(browser > drains && manager > drains && database > browser && database > manager);
});

test("STEP009 fixture awaits child quiescence and retries Windows tree removal", async () => {
  const source = await readFile(new URL("./process-approval-step009.test.mjs", import.meta.url), "utf8");
  assert.match(source, /await manager\.close\(\)/);
  assert.match(source, /await f\.manager\.close\(\)/);
  assert.match(source, /removeTreeWithRetries/);
  assert.doesNotMatch(source, /manager\.close\(\); state\.close\(\)/);
});
