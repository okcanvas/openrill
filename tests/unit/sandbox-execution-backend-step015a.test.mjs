import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { createWorkspaceCatalog } from "../../packages/workspace/dist/index.js";
import {
  SandboxError,
  createHostExecutionBackend,
  prepareExecutionBackendRequest,
  selectExecutionBackend,
} from "../../packages/sandbox/dist/index.js";
import {
  createDockerExecutionBackend,
} from "../../packages/sandbox-docker/dist/index.js";

const PINNED_IMAGE = `openrill/sandbox@sha256:${"a".repeat(64)}`;

async function workspaceFixture(readOnly = false) {
  const root = await mkdtemp(join(tmpdir(), "openrill-step015a-"));
  const workspaceRoot = join(root, "workspace");
  await mkdir(join(workspaceRoot, "nested"), { recursive: true });
  const catalog = await createWorkspaceCatalog([{ id: "main", path: workspaceRoot, readOnly }]);
  return { root, workspaceRoot, catalog, cleanup: () => rm(root, { recursive: true, force: true }) };
}

class FakeDockerCli {
  calls = [];
  queue = [];
  enqueue(result) { this.queue.push(result); }
  async run(args, options = {}) {
    this.calls.push({ args: [...args], options: { ...options } });
    const next = this.queue.shift();
    if (next instanceof Error) throw next;
    return next ?? { exitCode: 0, stdout: "", stderr: "" };
  }
}

function assertSandboxError(code) {
  return (error) => error instanceof SandboxError && error.code === code;
}

test("workspace authority defaults to read-only, network none, and no fallback", async () => {
  const f = await workspaceFixture();
  try {
    const prepared = await prepareExecutionBackendRequest(f.catalog, { workspaceId: "main" });
    assert.equal(prepared.workspaceAuthority.canonicalRoot, f.workspaceRoot);
    assert.equal(prepared.workspaceAuthority.mountMode, "READ_ONLY");
    assert.equal(prepared.workspaceAuthority.containerPath, "/workspace");
    assert.equal(prepared.networkMode, "NONE");
    assert.equal(prepared.fallback, "DENY");
  } finally { await f.cleanup(); }
});

test("read-only workspace cannot be widened to read-write", async () => {
  const f = await workspaceFixture(true);
  try {
    await assert.rejects(
      prepareExecutionBackendRequest(f.catalog, { workspaceId: "main", mountMode: "READ_WRITE" }),
      assertSandboxError("SANDBOX_READ_WRITE_DENIED"),
    );
  } finally { await f.cleanup(); }
});

test("extra binds and Docker socket are denied before backend startup", async () => {
  const f = await workspaceFixture();
  try {
    await assert.rejects(
      prepareExecutionBackendRequest(f.catalog, {
        workspaceId: "main",
        extraHostBinds: [{ source: f.root, target: "/host", mode: "READ_ONLY" }],
      }),
      assertSandboxError("SANDBOX_EXTRA_BIND_DENIED"),
    );
    await assert.rejects(
      prepareExecutionBackendRequest(f.catalog, { workspaceId: "main", mountDockerSocket: true }),
      assertSandboxError("SANDBOX_DOCKER_SOCKET_DENIED"),
    );
  } finally { await f.cleanup(); }
});

test("network and host fallback require independent explicit policy", async () => {
  const f = await workspaceFixture();
  try {
    await assert.rejects(
      prepareExecutionBackendRequest(f.catalog, { workspaceId: "main", networkMode: "OUTBOUND" }),
      assertSandboxError("SANDBOX_NETWORK_DENIED"),
    );
    await assert.rejects(
      prepareExecutionBackendRequest(f.catalog, { workspaceId: "main", fallback: "HOST" }),
      assertSandboxError("SANDBOX_HOST_FALLBACK_DENIED"),
    );
    const prepared = await prepareExecutionBackendRequest(
      f.catalog,
      { workspaceId: "main", networkMode: "OUTBOUND", fallback: "HOST" },
      { allowOutboundNetwork: true, allowHostFallback: true },
    );
    assert.equal(prepared.networkMode, "OUTBOUND");
    assert.equal(prepared.fallback, "HOST");
  } finally { await f.cleanup(); }
});

test("backend selection never silently falls back to host", () => {
  assert.equal(selectExecutionBackend("DOCKER", true, "DENY"), "DOCKER");
  assert.equal(selectExecutionBackend("DOCKER", false, "HOST"), "HOST");
  assert.equal(selectExecutionBackend("HOST", false, "DENY"), "HOST");
  assert.throws(() => selectExecutionBackend("DOCKER", false, "DENY"), assertSandboxError("SANDBOX_BACKEND_UNAVAILABLE"));
});

test("Host backend executes argv in the resolved workspace and never claims sandboxing", async () => {
  const f = await workspaceFixture();
  try {
    const prepared = await prepareExecutionBackendRequest(f.catalog, { workspaceId: "main", mountMode: "READ_WRITE" });
    const backend = createHostExecutionBackend({ workspaces: f.catalog, createId: () => "host-1", now: () => 1700000000000 });
    const handle = await backend.prepare(prepared);
    const result = await handle.exec({ executable: process.execPath, args: ["-e", "console.log(process.cwd())"], cwd: "nested" });
    assert.equal(result.exitCode, 0);
    assert.equal(result.timedOut, false);
    assert.match(result.stdout, new RegExp(`${basename(f.workspaceRoot)}[\\\\/]nested`));
    assert.equal(handle.kind, "HOST");
    assert.equal(handle.capabilities.sandboxed, false);
    assert.equal(handle.confinementProof.sandboxed, false);
    await handle.close();
    await handle.close();
  } finally { await f.cleanup(); }
});

test("Host backend delegates cwd confinement to WorkspaceCatalog", async () => {
  const f = await workspaceFixture();
  try {
    const prepared = await prepareExecutionBackendRequest(f.catalog, { workspaceId: "main" });
    const handle = await createHostExecutionBackend({ workspaces: f.catalog }).prepare(prepared);
    await assert.rejects(
      handle.exec({ executable: process.execPath, args: ["-e", "process.exit(0)"], cwd: "../escape" }),
      (error) => error?.code === "WORKSPACE_PATH_ESCAPE",
    );
    await handle.close();
  } finally { await f.cleanup(); }
});

test("Docker backend requires an immutable image digest", () => {
  assert.throws(
    () => createDockerExecutionBackend({ image: "openrill/sandbox:latest", profile: "default" }),
    assertSandboxError("SANDBOX_IMAGE_NOT_PINNED"),
  );
});

test("Docker create plan is deny-by-default and returns a sandboxed confinement proof", async () => {
  const f = await workspaceFixture();
  const cli = new FakeDockerCli();
  cli.enqueue({ exitCode: 0, stdout: "container-1\n", stderr: "" });
  cli.enqueue({ exitCode: 0, stdout: "container-1\n", stderr: "" });
  try {
    const prepared = await prepareExecutionBackendRequest(f.catalog, { workspaceId: "main" });
    const backend = createDockerExecutionBackend({ cli, image: PINNED_IMAGE, profile: "unit", createId: () => "handle-1", now: () => 1700000000000 });
    const handle = await backend.prepare(prepared);
    const create = cli.calls[0].args;
    assert.equal(create[0], "create");
    assert.deepEqual(create.slice(create.indexOf("--network"), create.indexOf("--network") + 2), ["--network", "none"]);
    assert.ok(create.includes("--read-only"));
    assert.deepEqual(create.slice(create.indexOf("--cap-drop"), create.indexOf("--cap-drop") + 2), ["--cap-drop", "ALL"]);
    assert.deepEqual(create.slice(create.indexOf("--security-opt"), create.indexOf("--security-opt") + 2), ["--security-opt", "no-new-privileges"]);
    const mount = create[create.indexOf("--mount") + 1];
    assert.match(mount, /target=\/workspace,readonly$/);
    assert.doesNotMatch(create.join(" "), /docker\.sock/i);
    assert.equal(handle.confinementProof.sandboxed, true);
    assert.equal(handle.confinementProof.extraHostBinds, false);
    assert.equal(handle.confinementProof.dockerSocketMounted, false);
    cli.enqueue({ exitCode: 0, stdout: "container-1\n", stderr: "" });
    await handle.close();
  } finally { await f.cleanup(); }
});

test("Docker exec is argv-only, bounded, workspace-relative, and cleanup is idempotent", async () => {
  const f = await workspaceFixture();
  const cli = new FakeDockerCli();
  cli.enqueue({ exitCode: 0, stdout: "container-2\n", stderr: "" });
  cli.enqueue({ exitCode: 0, stdout: "container-2\n", stderr: "" });
  try {
    const prepared = await prepareExecutionBackendRequest(f.catalog, { workspaceId: "main", mountMode: "READ_WRITE" });
    const handle = await createDockerExecutionBackend({ cli, image: PINNED_IMAGE, profile: "unit", createId: () => "handle-2" }).prepare(prepared);
    cli.enqueue({ exitCode: 0, stdout: "0123456789", stderr: "warn" });
    const result = await handle.exec({ executable: "node", args: ["script.js"], cwd: "nested", env: { B: "2", A: "1" }, maxOutputBytes: 4 });
    const exec = cli.calls[2].args;
    assert.deepEqual(exec.slice(0, 3), ["exec", "--workdir", "/workspace/nested"]);
    assert.deepEqual(exec.slice(3, 7), ["--env", "A=1", "--env", "B=2"]);
    assert.deepEqual(exec.slice(-3), ["container-2", "node", "script.js"]);
    assert.equal(result.stdout, "6789");
    assert.equal(result.stdoutTruncated, true);
    await assert.rejects(handle.exec({ executable: "node", cwd: "../escape" }), assertSandboxError("SANDBOX_EXEC_INVALID"));
    cli.enqueue({ exitCode: 0, stdout: "container-2\n", stderr: "" });
    await handle.close();
    await handle.close();
    assert.equal(cli.calls.filter((call) => call.args[0] === "rm").length, 1);
  } finally { await f.cleanup(); }
});

test("Docker start failure removes the created container before returning the cause", async () => {
  const f = await workspaceFixture();
  const cli = new FakeDockerCli();
  cli.enqueue({ exitCode: 0, stdout: "container-3\n", stderr: "" });
  cli.enqueue({ exitCode: 1, stdout: "", stderr: "start denied" });
  cli.enqueue({ exitCode: 0, stdout: "container-3\n", stderr: "" });
  try {
    const prepared = await prepareExecutionBackendRequest(f.catalog, { workspaceId: "main" });
    const backend = createDockerExecutionBackend({ cli, image: PINNED_IMAGE, profile: "unit" });
    await assert.rejects(backend.prepare(prepared), assertSandboxError("SANDBOX_START_FAILED"));
    assert.deepEqual(cli.calls.at(-1).args, ["rm", "-f", "container-3"]);
  } finally { await f.cleanup(); }
});

test("Docker doctor and prune are bounded to exact OpenRill profile labels", async () => {
  const cli = new FakeDockerCli();
  cli.enqueue({ exitCode: 0, stdout: "27.5.1\n", stderr: "" });
  cli.enqueue({ exitCode: 0, stdout: "a\nb\n", stderr: "" });
  cli.enqueue({ exitCode: 0, stdout: "a\n", stderr: "" });
  cli.enqueue({ exitCode: 0, stdout: "b\n", stderr: "" });
  const backend = createDockerExecutionBackend({ cli, image: PINNED_IMAGE, profile: "profile-a" });
  const availability = await backend.doctor();
  assert.deepEqual(availability, { kind: "DOCKER", available: true, detail: "27.5.1" });
  const pruned = await backend.pruneStale();
  assert.deepEqual(pruned, ["a", "b"]);
  assert.deepEqual(cli.calls[1].args, [
    "ps", "-aq",
    "--filter", "label=openrill.managed=true",
    "--filter", "label=openrill.profile=profile-a",
  ]);
  assert.deepEqual(cli.calls[2].args, ["rm", "-f", "a"]);
  assert.deepEqual(cli.calls[3].args, ["rm", "-f", "b"]);
});
