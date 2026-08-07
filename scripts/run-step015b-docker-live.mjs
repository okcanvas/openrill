import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../packages/config/dist/index.js";
import { ConversationService } from "../packages/conversations/dist/index.js";
import { ApprovalService } from "../packages/approval/dist/index.js";
import { createHostExecutionBackend } from "../packages/sandbox/dist/index.js";
import { createDockerExecutionBackend, createNodeDockerCli } from "../packages/sandbox-docker/dist/index.js";
import { openOpenRillStateDatabase } from "../packages/state/dist/index.js";
import { ProcessManager } from "../packages/tools-process/dist/index.js";
import { createWorkspaceCatalog } from "../packages/workspace/dist/index.js";
import { sameDockerContainerId } from "./lib/docker-container-id-evidence.mjs";

const STEP = "STEP015B_PROCESS_TOOL_DOCKER_BACKEND_INTEGRATION_AND_LIVE_CONFINEMENT";
const image = process.env.OPENRILL_STEP015B_DOCKER_IMAGE;
if (!image) throw new Error("OPENRILL_STEP015B_DOCKER_IMAGE is required and must be digest-pinned");
if (!/^[^\s@]+@sha256:[a-f0-9]{64}$/.test(image)) throw new Error("OPENRILL_STEP015B_DOCKER_IMAGE must be pinned by sha256 digest");

const profile = `step015b-live-${process.pid}`;
const root = await mkdtemp(join(tmpdir(), "openrill-step015b-docker-live-"));
const workspaceRoot = join(root, "workspace");
const processRoot = join(root, "processes");
const cli = createNodeDockerCli(process.env.OPENRILL_STEP015B_DOCKER_EXECUTABLE ?? "docker");
let state;
const managers = [];
let checks = 0;

function pass(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

function managerFor({ workspaces, approvals, backend, mountMode, networkMode }) {
  const manager = new ProcessManager({
    state,
    workspaces,
    approvals,
    policy: { defaultDecision: "ALLOW" },
    rootDirectory: processRoot,
    configRoot: root,
    backendRouting: {
      preferred: "DOCKER",
      host: createHostExecutionBackend({ workspaces }),
      docker: backend,
      mountMode,
      networkMode,
      fallback: "DENY",
    },
  });
  managers.push(manager);
  return manager;
}

try {
  await mkdir(workspaceRoot, { recursive: true });
  await writeFile(join(workspaceRoot, "input.txt"), "openrill-docker-live\n", "utf8");
  const workspaces = await createWorkspaceCatalog([{ id: "main", path: workspaceRoot }]);
  const descriptor = workspaces.internal("main");
  const profilePaths = resolveProfilePaths({
    profile,
    env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") },
  });
  state = await openOpenRillStateDatabase({ profilePaths });
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
  let sequence = 0;
  const approvals = new ApprovalService({ state, createId: () => `step015b-live-${++sequence}` });
  const context = () => {
    const sent = conversations.send({
      workspaceId: "main",
      conversationId: conversation.conversationId,
      submissionKey: `submission-${++sequence}`,
      text: "docker live confinement",
    });
    const execution = conversations.executionContext(sent.run.runId);
    return {
      runId: sent.run.runId,
      attemptId: execution.attempt.attemptId,
      conversationId: conversation.conversationId,
      workspaceId: "main",
      toolCallId: `tool-${++sequence}`,
    };
  };

  const backend = createDockerExecutionBackend({ cli, image, profile });
  const doctor = await backend.doctor();
  pass(doctor.available, `Docker unavailable: ${doctor.detail}`);

  await backend.pruneStale();
  const stale = await cli.run([
    "create",
    "--label", "openrill.managed=true",
    "--label", `openrill.profile=${profile}`,
    image,
    "sh", "-lc", "exit 0",
  ], { timeoutMs: 30_000, maxOutputBytes: 65_536 });
  pass(!stale.timedOut && stale.exitCode === 0 && stale.stdout.trim().length > 0, stale.stderr || "failed to create stale fixture");
  const staleId = stale.stdout.trim();
  const pruned = await backend.pruneStale();
  const staleRemaining = await cli.run([
    "ps", "-aq", "--no-trunc",
    "--filter", `id=${staleId}`,
  ], { timeoutMs: 30_000, maxOutputBytes: 65_536 });
  const pruneIdentityMatched = pruned.some((id) => sameDockerContainerId(staleId, id));
  pass(
    pruneIdentityMatched
      && !staleRemaining.timedOut
      && staleRemaining.exitCode === 0
      && staleRemaining.stdout.trim() === "",
    `exact-profile stale prune evidence mismatch created=${staleId} pruned=${JSON.stringify(pruned)} remaining=${JSON.stringify(staleRemaining.stdout.trim())} stderr=${JSON.stringify(staleRemaining.stderr.trim())}`,
  );

  const readOnly = managerFor({ workspaces, approvals, backend, mountMode: "READ_ONLY", networkMode: "NONE" });
  const readResult = await readOnly.run({ command: { kind: "shell", script: "cat input.txt" } }, context());
  pass(readResult.isError === false && /openrill-docker-live/.test(readResult.output.stdout), JSON.stringify(readResult.output));
  pass(readResult.output.backend === "DOCKER" && readResult.output.sandboxed === true, "Docker confinement proof missing");
  const readRow = readOnly.list().find((row) => row.processId === readResult.output.processId);
  pass(readRow?.backendKind === "DOCKER" && readRow?.confinement?.networkMode === "NONE", "durable backend proof missing");

  const deniedWrite = await readOnly.run({ command: { kind: "shell", script: "printf blocked > blocked.txt" } }, context());
  pass(deniedWrite.isError === true && deniedWrite.output.exitCode !== 0, "read-only workspace write unexpectedly succeeded");
  await assert.rejects(access(join(workspaceRoot, "blocked.txt")), (error) => error?.code === "ENOENT");
  checks += 1;

  const noNetwork = await readOnly.run({ command: { kind: "shell", script: "test ! -e /sys/class/net/eth0 && echo network-none" } }, context());
  pass(noNetwork.isError === false && /network-none/.test(noNetwork.output.stdout), JSON.stringify(noNetwork.output));
  await readOnly.close();

  const readWrite = managerFor({ workspaces, approvals, backend, mountMode: "READ_WRITE", networkMode: "NONE" });
  const writeResult = await readWrite.run({ command: { kind: "shell", script: "printf durable > created.txt" } }, context());
  pass(writeResult.isError === false, JSON.stringify(writeResult.output));
  pass(await readFile(join(workspaceRoot, "created.txt"), "utf8") === "durable", "read-write workspace output missing");

  const timedOut = await readWrite.run({ command: { kind: "shell", script: "sleep 30" }, timeoutMs: 200 }, context());
  pass(timedOut.isError === true && timedOut.output.timedOut === true && timedOut.output.status === "CANCELLED", JSON.stringify(timedOut.output));

  const background = await readWrite.run({ command: { kind: "shell", script: "while :; do sleep 1; done" }, background: true }, context());
  pass(background.isError === false && background.output.status === "RUNNING", JSON.stringify(background.output));
  const cancelled = readWrite.cancel({ processId: background.output.processId });
  pass(cancelled.isError === false && cancelled.output.status === "CANCELLED", JSON.stringify(cancelled.output));
  await readWrite.close();
  pass(readWrite.list().find((row) => row.processId === background.output.processId)?.status === "CANCELLED", "background cancellation was overwritten");

  const outbound = managerFor({ workspaces, approvals, backend, mountMode: "READ_ONLY", networkMode: "OUTBOUND" });
  const outboundResult = await outbound.run({ command: { kind: "shell", script: "test -e /sys/class/net/eth0 && echo outbound-network-attached" } }, context());
  pass(outboundResult.isError === false && /outbound-network-attached/.test(outboundResult.output.stdout), JSON.stringify(outboundResult.output));
  await outbound.close();

  const remaining = await cli.run([
    "ps", "-aq",
    "--filter", "label=openrill.managed=true",
    "--filter", `label=openrill.profile=${profile}`,
  ], { timeoutMs: 30_000, maxOutputBytes: 65_536 });
  pass(!remaining.timedOut && remaining.exitCode === 0 && remaining.stdout.trim() === "", remaining.stderr || `containers remain: ${remaining.stdout}`);

  console.log(`${STEP} checks=${checks}/${checks} state=PASSED schema=15 backend=DOCKER process_tool=INTEGRATED read_only=ENFORCED read_write=PASSED network_none=PASSED outbound_bridge=PASSED timeout=PASSED cancel=PASSED cleanup=QUIESCENT stale_prune=PASSED container_id_evidence=PREFIX_NORMALIZED_AND_ABSENCE_VERIFIED browser=NOT_RUN`);
} finally {
  for (const manager of managers.reverse()) await manager.close().catch(() => undefined);
  if (state?.isOpen()) state.close();
  await cli.run([
    "ps", "-aq",
    "--filter", "label=openrill.managed=true",
    "--filter", `label=openrill.profile=${profile}`,
  ], { timeoutMs: 10_000, maxOutputBytes: 65_536 }).then(async (result) => {
    const ids = result.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    for (const id of ids) await cli.run(["rm", "-f", id], { timeoutMs: 10_000, maxOutputBytes: 65_536 }).catch(() => undefined);
  }).catch(() => undefined);
  await rm(root, { recursive: true, force: true });
}
