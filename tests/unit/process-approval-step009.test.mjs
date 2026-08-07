import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ToolRegistry } from "../../packages/tool-runtime/dist/index.js";
import { ApprovalError, ApprovalService, ToolApprovalRequiredError, matchExecutionPolicy } from "../../packages/approval/dist/index.js";
import { ProcessManager, registerProcessTools } from "../../packages/tools-process/dist/index.js";
import { createWorkspaceCatalog } from "../../packages/workspace/dist/index.js";
import { removeTreeWithRetries } from "../../scripts/live-fixture-cleanup.mjs";

async function fixture(policy = { defaultDecision: "PROMPT" }, env = {}, approvalOptions = {}) {
  const root = await mkdtemp(join(tmpdir(), "openrill-step009-"));
  const workspaceRoot = join(root, "workspace");
  await mkdir(workspaceRoot);
  const paths = resolveProfilePaths({ profile: "step009", env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  const state = await openOpenRillStateDatabase({ profilePaths: paths, now: () => Date.now() });
  const catalog = await createWorkspaceCatalog([{ id: "main", path: workspaceRoot }]);
  const descriptor = catalog.internal("main");
  state.transaction((repositories) => repositories.workspaces.upsertWorkspace({
    workspaceId: descriptor.workspaceId, displayName: descriptor.displayName, canonicalRoot: descriptor.canonicalRoot,
    rootRevision: descriptor.rootRevision, accessMode: descriptor.accessMode, trustState: descriptor.trustState, updatedAt: Date.now(),
  }));
  const conversations = new ConversationService({ state, workspaceIds: ["main"] });
  const conversation = conversations.create({ workspaceId: "main" });
  let id = 0;
  const approvals = new ApprovalService({ state, createId: () => `approval-id-${++id}`, timeoutMs: approvalOptions.timeoutMs ?? 5_000, ...(approvalOptions.now ? { now: approvalOptions.now } : {}) });
  const manager = new ProcessManager({ state, workspaces: catalog, approvals, policy, rootDirectory: join(root, "processes"), configRoot: root, env, ...(approvalOptions.now ? { now: approvalOptions.now } : {}) });
  const registry = new ToolRegistry(); registerProcessTools(registry, manager);
  const nextContext = (key = `submission-${++id}`) => {
    const sent = conversations.send({ workspaceId: "main", conversationId: conversation.conversationId, submissionKey: key, text: "run process" });
    const execution = conversations.executionContext(sent.run.runId);
    return { runId: sent.run.runId, attemptId: execution.attempt.attemptId, conversationId: conversation.conversationId, workspaceId: "main", toolCallId: `tool-${++id}` };
  };
  return { root, paths, workspaceRoot, catalog, state, approvals, manager, registry, conversation, nextContext, cleanup: async () => { await manager.close(); if (state.isOpen()) state.close(); await removeTreeWithRetries(root); } };
}
const nodeCommand = (script, extra = {}) => ({ command: { kind: "argv", executable: process.execPath, args: ["-e", script] }, ...extra });

async function waitForProcessText(manager, processId, expected, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  let lastText = "";
  let lastStatus = "UNKNOWN";
  while (Date.now() <= deadline) {
    const tail = await manager.tail({ processId });
    assert.equal(tail.isError, false);
    lastText = tail.output.text;
    if (lastText.includes(expected)) return tail;
    lastStatus = manager.list().find((item) => item.processId === processId)?.status ?? "MISSING";
    if (!["STARTING", "RUNNING"].includes(lastStatus)) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`process stdout did not contain ${JSON.stringify(expected)} within ${timeoutMs}ms; status=${lastStatus}; tail=${JSON.stringify(lastText)}`);
}

 test("ordered execution policy distinguishes argv and shell", () => {
  const policy = { defaultDecision: "DENY", rules: [{ decision: "ALLOW", toolName: "process.run", commandKind: "argv", executable: process.execPath }] };
  assert.equal(matchExecutionPolicy(policy, { toolName: "process.run", commandKind: "argv", executable: process.execPath, workspaceId: "main" }).decision, "ALLOW");
  assert.equal(matchExecutionPolicy(policy, { toolName: "process.run", commandKind: "shell", executable: "/bin/sh", workspaceId: "main" }).decision, "DENY");
});

test("registry exposes exactly four STEP009 process tools", async () => {
  const f = await fixture(); try {
    assert.deepEqual(f.registry.definitions().map((item) => item.name), ["process.cancel", "process.list", "process.run", "process.tail"]);
  } finally { await f.cleanup(); }
});

test("DENY policy starts no process", async () => {
  const f = await fixture({ defaultDecision: "DENY" }); try {
    const result = await f.registry.execute("process.run", nodeCommand("console.log('forbidden')"), f.nextContext());
    assert.equal(result.isError, true); assert.equal(result.output.error.code, "PROCESS_POLICY_DENIED");
    assert.equal(f.manager.list().length, 0);
  } finally { await f.cleanup(); }
});

test("PROMPT persists before execution, approval consumes once, and output is durable", async () => {
  const f = await fixture(); try {
    const context = f.nextContext();
    await assert.rejects(f.registry.execute("process.run", nodeCommand("console.log('승인됨')"), context), ToolApprovalRequiredError);
    assert.equal(f.manager.list().length, 0);
    const request = f.approvals.list("PENDING")[0]; assert.equal(request.status, "PENDING");
    f.approvals.resolve({ requestId: request.requestId, expectedVersion: request.version, decision: "allow_once" });
    const executed = await f.manager.executeApproved(request.requestId);
    assert.equal(executed.result.isError, false); assert.match(executed.result.output.stdout, /승인됨/);
    assert.equal(f.approvals.get(request.requestId).status, "CONSUMED");
    await assert.rejects(f.manager.executeApproved(request.requestId), (error) => error instanceof ApprovalError && error.code === "APPROVAL_STATE_INVALID");
    assert.equal(f.manager.list().length, 1);
  } finally { await f.cleanup(); }
});

test("allow_for_conversation grants only the same policy fingerprint", async () => {
  const f = await fixture(); try {
    await assert.rejects(f.manager.run(nodeCommand("console.log('first')"), f.nextContext()), ToolApprovalRequiredError);
    const request = f.approvals.list("PENDING")[0];
    f.approvals.resolve({ requestId: request.requestId, expectedVersion: request.version, decision: "allow_for_conversation" });
    await f.manager.executeApproved(request.requestId);
    const second = await f.manager.run(nodeCommand("console.log('second')"), f.nextContext());
    assert.equal(second.isError, false); assert.match(second.output.stdout, /second/);
    await assert.rejects(f.manager.run({ command: { kind: "shell", script: "echo shell" } }, f.nextContext()), ToolApprovalRequiredError);
  } finally { await f.cleanup(); }
});

test("background process can be listed, tailed, and cancelled without EXITED overwrite", async () => {
  const f = await fixture({ defaultDecision: "ALLOW" }); try {
    const result = await f.manager.run(nodeCommand("setTimeout(()=>console.log('ready'),250); setInterval(()=>{},1000)", { background: true }), f.nextContext());
    const processId = result.output.processId;
    const tail = await waitForProcessText(f.manager, processId, "ready");
    assert.match(tail.output.text, /ready/);
    const cancelled = f.manager.cancel({ processId }); assert.equal(cancelled.output.status, "CANCELLED");
    assert.equal(f.manager.list().find((item) => item.processId === processId).status, "CANCELLED");
  } finally { await f.cleanup(); }
});

test("SecretRef is resolved at execution but literal secret is absent from SQLite", async () => {
  const secret = randomBytes(32).toString("hex");
  const f = await fixture({ defaultDecision: "ALLOW" }, { STEP009_SECRET: secret });
  try {
    const result = await f.manager.run(nodeCommand("console.log(process.env.CHECK?.length === 64 ? 'ok' : 'bad')", { env: { secrets: { CHECK: { kind: "env", key: "STEP009_SECRET" } } } }), f.nextContext());
    assert.match(result.output.stdout, /ok/);
    const databasePath = f.state.paths.databasePath;
    f.state.close();
    const bytes = await readFile(databasePath);
    assert.equal(bytes.includes(Buffer.from(secret)), false);
  } finally { await f.manager.close(); if (f.state.isOpen()) f.state.close(); await removeTreeWithRetries(f.root); }
});

test("operator deny and cancellation leave process count at zero", async () => {
  const f = await fixture(); try {
    await assert.rejects(f.manager.run(nodeCommand("console.log('denied')"), f.nextContext()), ToolApprovalRequiredError);
    const denied = f.approvals.list("PENDING")[0];
    const deniedResult = f.approvals.resolve({ requestId: denied.requestId, expectedVersion: denied.version, decision: "deny" });
    assert.equal(deniedResult.request.status, "DENIED");
    assert.equal(f.manager.list().length, 0);

    await assert.rejects(f.manager.run(nodeCommand("console.log('cancelled')"), f.nextContext()), ToolApprovalRequiredError);
    const pending = f.approvals.list("PENDING")[0];
    assert.equal(f.approvals.cancel(pending.requestId).status, "CANCELLED");
    assert.equal(f.manager.list().length, 0);
  } finally { await f.cleanup(); }
});

test("concurrent decisions have one winner and binding mismatch is rejected", async () => {
  const f = await fixture(); try {
    await assert.rejects(f.manager.run(nodeCommand("console.log('race')"), f.nextContext()), ToolApprovalRequiredError);
    const request = f.approvals.list("PENDING")[0];
    const outcomes = await Promise.allSettled([
      Promise.resolve().then(() => f.approvals.resolve({ requestId: request.requestId, expectedVersion: request.version, decision: "allow_once" })),
      Promise.resolve().then(() => f.approvals.resolve({ requestId: request.requestId, expectedVersion: request.version, decision: "deny" })),
    ]);
    assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter((item) => item.status === "rejected").length, 1);
    const resolved = f.approvals.get(request.requestId);
    assert.equal(resolved.status, "APPROVED");
    assert.throws(
      () => f.approvals.consume({ requestId: request.requestId, expectedVersion: resolved.version, bindingDigest: `${resolved.bindingDigest}-changed` }),
      (error) => error instanceof ApprovalError && error.code === "APPROVAL_BINDING_MISMATCH",
    );
    assert.equal(f.manager.list().length, 0);
  } finally { await f.cleanup(); }
});

test("pending approval expires without process execution", async () => {
  let now = 10_000;
  const f = await fixture({ defaultDecision: "PROMPT" }, {}, { timeoutMs: 50, now: () => now });
  try {
    await assert.rejects(f.manager.run(nodeCommand("console.log('expired')"), f.nextContext()), ToolApprovalRequiredError);
    const request = f.approvals.list("PENDING")[0];
    now = request.expiresAt;
    assert.deepEqual(f.approvals.expirePending(), [request.requestId]);
    assert.equal(f.approvals.get(request.requestId).status, "EXPIRED");
    assert.equal(f.manager.list().length, 0);
  } finally { await f.cleanup(); }
});

test("pending approval survives database restart", async () => {
  const f = await fixture();
  let reopened;
  try {
    await assert.rejects(f.manager.run(nodeCommand("console.log('restart')"), f.nextContext()), ToolApprovalRequiredError);
    const request = f.approvals.list("PENDING")[0];
    f.state.close();
    reopened = await openOpenRillStateDatabase({ profilePaths: f.paths, now: () => Date.now() });
    const approvals = new ApprovalService({ state: reopened });
    const afterRestart = approvals.get(request.requestId);
    assert.equal(afterRestart.status, "PENDING");
    assert.equal(afterRestart.bindingDigest, request.bindingDigest);
  } finally {
    reopened?.close();
    await f.cleanup();
  }
});

test("startup recovery marks durable active processes orphaned", async () => {
  const policy = { defaultDecision: "ALLOW" };
  const f = await fixture(policy);
  let recoveryManager;
  try {
    const result = await f.manager.run(nodeCommand("setInterval(()=>{},1000)", { background: true }), f.nextContext());
    const processId = result.output.processId;
    await f.manager.close();
    f.state.transaction((repositories) => repositories.approvalProcess.updateProcess({ processId, status: "RUNNING", endedAt: null, updatedAt: Date.now() }));
    recoveryManager = new ProcessManager({ state: f.state, workspaces: f.catalog, approvals: f.approvals, policy, rootDirectory: join(f.root, "processes"), configRoot: f.root });
    assert.deepEqual(recoveryManager.recoverOrphans(), [processId]);
    assert.equal(recoveryManager.list().find((item) => item.processId === processId).status, "ORPHANED");
  } finally {
    recoveryManager?.close();
    await f.cleanup();
  }
});

