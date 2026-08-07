import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ConfigValidationError, resolveProfilePaths, validateAndMaterializeConfig } from "../../packages/config/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { ApprovalService } from "../../packages/approval/dist/index.js";
import { applyStateMigrations, loadStateMigrations, openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { createHostExecutionBackend } from "../../packages/sandbox/dist/index.js";
import { ProcessManager } from "../../packages/tools-process/dist/index.js";
import { createWorkspaceCatalog } from "../../packages/workspace/dist/index.js";

const PINNED_IMAGE = `openrill/runtime@sha256:${"b".repeat(64)}`;

class FakeBackend {
  constructor(kind, { available = true, sandboxed = kind === "DOCKER", mode = "immediate" } = {}) {
    this.kind = kind;
    this.available = available;
    this.mode = mode;
    this.capabilities = {
      isolatedFilesystem: sandboxed,
      isolatedProcessNamespace: sandboxed,
      networkControl: sandboxed,
      resourceLimits: sandboxed,
      sandboxed,
    };
    this.doctorCalls = 0;
    this.prepareCalls = 0;
    this.execCalls = [];
    this.cancelCalls = 0;
    this.closeCalls = 0;
    this.#resolveActive = null;
  }
  #resolveActive;
  async doctor() {
    this.doctorCalls += 1;
    return { kind: this.kind, available: this.available, detail: this.available ? "available" : "unavailable" };
  }
  async prepare(request) {
    this.prepareCalls += 1;
    this.request = request;
    const backend = this;
    return {
      id: `${this.kind.toLowerCase()}-handle-1`,
      kind: this.kind,
      capabilities: this.capabilities,
      workspaceAuthority: request.workspaceAuthority,
      confinementProof: {
        backend: this.kind,
        sandboxed: this.capabilities.sandboxed,
        workspaceAuthority: request.workspaceAuthority,
        networkMode: request.networkMode,
        extraHostBinds: false,
        dockerSocketMounted: false,
      },
      createdAt: 100,
      async exec(input) {
        backend.execCalls.push(input);
        input.onStarted?.(backend.kind === "HOST" ? { pid: 777 } : { runtimeId: "container-1" });
        input.onStdout?.(Buffer.from(`${backend.kind.toLowerCase()}-stream\n`));
        if (backend.mode === "background") {
          return await new Promise((resolve) => {
            backend.#resolveActive = () => resolve({
              exitCode: null,
              signal: "SIGTERM",
              timedOut: false,
              cancelled: true,
              stdout: `${backend.kind.toLowerCase()}-stream\n`,
              stderr: "",
              stdoutTruncated: false,
              stderrTruncated: false,
            });
          });
        }
        return {
          exitCode: 0,
          signal: null,
          timedOut: false,
          cancelled: false,
          stdout: `${backend.kind.toLowerCase()}-stream\n`,
          stderr: "",
          stdoutTruncated: false,
          stderrTruncated: false,
        };
      },
      async cancel() {
        backend.cancelCalls += 1;
        backend.#resolveActive?.();
        backend.#resolveActive = null;
      },
      async close() { backend.closeCalls += 1; },
    };
  }
}

async function fixture({ readOnly = false, preferred = "DOCKER", fallback = "DENY", mountMode, docker, host, useActualHost = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "openrill-step015b-"));
  const workspaceRoot = join(root, "workspace");
  await mkdir(workspaceRoot);
  const paths = resolveProfilePaths({
    profile: "step015b",
    env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") },
  });
  const state = await openOpenRillStateDatabase({ profilePaths: paths, now: () => Date.now() });
  const workspaces = await createWorkspaceCatalog([{ id: "main", path: workspaceRoot, readOnly }]);
  const descriptor = workspaces.internal("main");
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
  let id = 0;
  const approvals = new ApprovalService({ state, createId: () => `approval-${++id}` });
  const hostBackend = useActualHost ? createHostExecutionBackend({ workspaces }) : host ?? new FakeBackend("HOST", { sandboxed: false });
  const dockerBackend = docker ?? new FakeBackend("DOCKER");
  const processRoot = join(root, "processes");
  const manager = new ProcessManager({
    state,
    workspaces,
    approvals,
    policy: { defaultDecision: "ALLOW" },
    rootDirectory: processRoot,
    configRoot: root,
    createId: () => `process-${++id}`,
    backendRouting: {
      preferred,
      host: hostBackend,
      docker: dockerBackend,
      mountMode: mountMode ?? (readOnly ? "READ_ONLY" : "READ_WRITE"),
      networkMode: "NONE",
      fallback,
    },
  });
  const context = () => {
    const sent = conversations.send({
      workspaceId: "main",
      conversationId: conversation.conversationId,
      submissionKey: `submission-${++id}`,
      text: "run",
    });
    const execution = conversations.executionContext(sent.run.runId);
    return {
      runId: sent.run.runId,
      attemptId: execution.attempt.attemptId,
      conversationId: conversation.conversationId,
      workspaceId: "main",
      toolCallId: `tool-${++id}`,
    };
  };
  return {
    root,
    state,
    manager,
    processRoot,
    workspaces,
    host: hostBackend,
    docker: dockerBackend,
    context,
    cleanup: async () => {
      await manager.close().catch(() => undefined);
      if (state.isOpen()) state.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

const command = { command: { kind: "argv", executable: "node", args: ["-e", "console.log('ok')"] } };

test("execution config defaults to Host with deny/read-only/network-none and requires a digest for Docker", () => {
  const config = validateAndMaterializeConfig({ version: 1 });
  assert.deepEqual(config.execution, {
    approvalMode: "ask",
    defaultTimeoutMs: 120_000,
    approvalTimeoutMs: 120_000,
    backend: "host",
    fallback: "deny",
    mountMode: "readOnly",
    networkMode: "none",
    docker: { executable: "docker", memoryBytes: 536_870_912, pidsLimit: 256 },
  });
  assert.throws(
    () => validateAndMaterializeConfig({ version: 1, execution: { backend: "docker", docker: { image: "openrill/runtime:latest" } } }),
    (error) => error instanceof ConfigValidationError && error.issues.some((issue) => issue.path === "execution.docker.image" && issue.code === "DIGEST"),
  );
  const docker = validateAndMaterializeConfig({ version: 1, execution: { backend: "docker", docker: { image: PINNED_IMAGE } } });
  assert.equal(docker.execution.docker.image, PINNED_IMAGE);
});

test("ProcessManager selects Docker and durably records backend identity plus confinement proof", async () => {
  const f = await fixture();
  try {
    const result = await f.manager.run(command, f.context());
    assert.equal(result.isError, false);
    assert.equal(result.output.backend, "DOCKER");
    assert.equal(result.output.sandboxed, true);
    assert.match(result.output.stdout, /docker-stream/);
    const row = f.manager.list()[0];
    assert.equal(row.backendKind, "DOCKER");
    assert.equal(row.backendHandleId, "docker-handle-1");
    assert.equal(row.sandboxed, true);
    assert.equal(row.confinement.backend, "DOCKER");
    assert.equal(row.confinement.workspaceAuthority.mountMode, "READ_WRITE");
    assert.equal(f.host.prepareCalls, 0);
    assert.equal(f.docker.prepareCalls, 1);
    assert.equal(f.docker.closeCalls, 1);
  } finally { await f.cleanup(); }
});

test("unavailable Docker with fallback denied fails closed without a durable process or empty process directory", async () => {
  const f = await fixture({ docker: new FakeBackend("DOCKER", { available: false }), fallback: "DENY" });
  try {
    const result = await f.manager.run(command, f.context());
    assert.equal(result.isError, true);
    assert.equal(result.output.error.code, "PROCESS_BACKEND_UNAVAILABLE");
    assert.equal(result.output.error.causeCode, "SANDBOX_BACKEND_UNAVAILABLE");
    assert.equal(f.manager.list().length, 0);
    await assert.rejects(access(f.processRoot), (error) => error?.code === "ENOENT");
    assert.equal(f.host.prepareCalls, 0);
  } finally { await f.cleanup(); }
});

test("explicit Host fallback is observable and never claims sandboxing", async () => {
  const f = await fixture({ docker: new FakeBackend("DOCKER", { available: false }), fallback: "HOST" });
  try {
    const result = await f.manager.run(command, f.context());
    assert.equal(result.isError, false);
    assert.equal(result.output.backend, "HOST");
    assert.equal(result.output.sandboxed, false);
    const row = f.manager.list()[0];
    assert.equal(row.backendKind, "HOST");
    assert.equal(row.sandboxed, false);
    assert.equal(row.confinement.sandboxed, false);
    assert.equal(f.host.prepareCalls, 1);
  } finally { await f.cleanup(); }
});

test("read-only workspace authority cannot be widened by Process backend routing", async () => {
  const f = await fixture({ readOnly: true, mountMode: "READ_WRITE" });
  try {
    const result = await f.manager.run(command, f.context());
    assert.equal(result.isError, true);
    assert.equal(result.output.error.code, "PROCESS_CONFINEMENT_DENIED");
    assert.equal(result.output.error.causeCode, "SANDBOX_READ_WRITE_DENIED");
    assert.equal(f.manager.list().length, 0);
    assert.equal(f.docker.prepareCalls, 0);
  } finally { await f.cleanup(); }
});



test("the actual Host backend is used through Product ProcessManager routing without a sandbox claim", async () => {
  const f = await fixture({ preferred: "HOST", useActualHost: true });
  try {
    const result = await f.manager.run({ command: { kind: "argv", executable: process.execPath, args: ["-e", "console.log('host-product-route')"] } }, f.context());
    assert.equal(result.isError, false, JSON.stringify(result.output));
    assert.equal(result.output.backend, "HOST");
    assert.equal(result.output.sandboxed, false);
    assert.match(result.output.stdout, /host-product-route/);
    assert.equal(f.manager.list()[0].backendKind, "HOST");
  } finally { await f.cleanup(); }
});

test("secret resolution fails before backend prepare and leaves no process lifecycle artifact", async () => {
  const f = await fixture();
  try {
    const result = await f.manager.run({
      ...command,
      env: { secrets: { MISSING: { kind: "file", key: "missing-secret" } } },
    }, f.context());
    assert.equal(result.isError, true);
    assert.equal(result.output.error.code, "PROCESS_ENVIRONMENT_RESOLUTION_FAILED");
    assert.equal(f.docker.prepareCalls, 0);
    assert.equal(f.manager.list().length, 0);
    await assert.rejects(access(f.processRoot), (error) => error?.code === "ENOENT");
  } finally { await f.cleanup(); }
});

test("background Docker cancellation remains durable and close waits for backend cleanup", async () => {
  const docker = new FakeBackend("DOCKER", { mode: "background" });
  const f = await fixture({ docker });
  try {
    const result = await f.manager.run({ ...command, background: true }, f.context());
    assert.equal(result.isError, false);
    assert.equal(result.output.status, "RUNNING");
    const cancelled = f.manager.cancel({ processId: result.output.processId });
    assert.equal(cancelled.output.status, "CANCELLED");
    await f.manager.close();
    const row = f.manager.list().find((item) => item.processId === result.output.processId);
    assert.equal(row.status, "CANCELLED");
    assert.equal(docker.cancelCalls, 1);
    assert.equal(docker.closeCalls, 1);
  } finally { await f.cleanup(); }
});

test("schema 15 preserves pre-existing process rows with explicit Host non-sandbox defaults", async () => {
  const migrations = await loadStateMigrations();
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = OFF;");
    applyStateMigrations(database, migrations.slice(0, 14), { profile: "upgrade", now: () => 10 });
    database.prepare(`INSERT INTO process_records (
      process_id,tool_execution_id,run_id,attempt_id,workspace_id,tool_call_id,mode,command_kind,
      command_display,cwd_relative,status,pid,stdout_path,stderr_path,exit_code,exit_signal,started_at,ended_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "legacy-process","legacy-tool","legacy-run","legacy-attempt","legacy-workspace","legacy-call","FOREGROUND","ARGV",
      "node",".","EXITED",null,"stdout","stderr",0,null,10,11,11,
    );
    database.exec(migrations[14].sql);
    const row = database.prepare("SELECT backend_kind,sandboxed,backend_handle_id,confinement_json FROM process_records WHERE process_id='legacy-process'").get();
    assert.deepEqual({ ...row }, { backend_kind: "HOST", sandboxed: 0, backend_handle_id: null, confinement_json: null });
  } finally { database.close(); }
});
