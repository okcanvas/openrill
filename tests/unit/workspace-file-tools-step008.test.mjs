import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { OPENRILL_STATE_SCHEMA_VERSION, openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ToolRegistry } from "../../packages/tool-runtime/dist/index.js";
import { createWorkspaceArtifactStore, registerWorkspaceFileTools } from "../../packages/tools-files/dist/index.js";
import { createWorkspaceCatalog, WorkspaceError } from "../../packages/workspace/dist/index.js";

const context = { runId: "run-test", attemptId: "attempt-test", workspaceId: "main" };

async function fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "openrill-step008-"));
  const workspaceRoot = join(root, "작업 공간");
  const outsideRoot = join(root, "outside");
  const artifactRoot = join(root, "artifacts");
  await mkdir(join(workspaceRoot, "src"), { recursive: true });
  await mkdir(outsideRoot, { recursive: true });
  const registrations = options.registrations ?? [{ id: "main", path: workspaceRoot, displayName: "Main Workspace" }];
  const catalog = await createWorkspaceCatalog(registrations);
  const metadata = [];
  const artifacts = createWorkspaceArtifactStore({
    rootDirectory: artifactRoot,
    metadataSink: { recordArtifact(value) { metadata.push(value); } },
    createId: (() => { let i = 0; return () => `artifact-${++i}`; })(),
    now: () => 1700000000000,
  });
  const registry = new ToolRegistry();
  registerWorkspaceFileTools(registry, { workspaces: catalog, artifacts, limits: options.limits });
  return {
    root,
    workspaceRoot,
    outsideRoot,
    artifactRoot,
    catalog,
    metadata,
    registry,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

async function execute(f, name, input, override = {}) {
  return f.registry.execute(name, input, { ...context, ...override });
}

function errorCode(result) {
  return result.output?.error?.code;
}

test("catalog exposes stable workspace identity without public absolute paths", async () => {
  const f = await fixture();
  try {
    const listed = f.catalog.list();
    assert.equal(listed.length, 1);
    assert.deepEqual(Object.keys(listed[0]).sort(), ["accessMode", "displayName", "rootRevision", "trustState", "workspaceId"]);
    assert.equal(listed[0].rootRevision.length, 64);
    assert.equal(JSON.stringify(listed).includes(f.workspaceRoot), false);
    await assert.rejects(
      createWorkspaceCatalog([{ id: "one", path: f.workspaceRoot }, { id: "two", path: f.workspaceRoot }]),
      (error) => error instanceof WorkspaceError && error.code === "WORKSPACE_DUPLICATE_ROOT",
    );
  } finally { await f.cleanup(); }
});

test("registry contains exactly the six STEP008 file tools", async () => {
  const f = await fixture();
  try {
    assert.deepEqual(f.registry.definitions().map((item) => item.name), [
      "workspace.list", "workspace.patch", "workspace.read", "workspace.search", "workspace.stat", "workspace.write",
    ]);
  } finally { await f.cleanup(); }
});

test("path grammar denies absolute paths, traversal, ignored roots, and secret-like files", async () => {
  const f = await fixture();
  try {
    for (const [path, code] of [
      ["../outside.txt", "WORKSPACE_PATH_ESCAPE"],
      [join(f.workspaceRoot, "src", "a.txt"), "WORKSPACE_PATH_INVALID"],
      [".git/config", "WORKSPACE_PATH_DENIED"],
      ["src/.env.production", "WORKSPACE_SECRET_PATH_DENIED"],
      ["src/id_ed25519", "WORKSPACE_SECRET_PATH_DENIED"],
      ["secrets/data.txt", "WORKSPACE_SECRET_PATH_DENIED"],
    ]) {
      const result = await execute(f, "workspace.read", { path });
      assert.equal(result.isError, true, path);
      assert.equal(errorCode(result), code, path);
    }
  } finally { await f.cleanup(); }
});

test("read-only workspace rejects writes before filesystem mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step008-ro-"));
  const workspaceRoot = join(root, "workspace");
  await mkdir(workspaceRoot);
  const f = await fixture({ registrations: [{ id: "main", path: workspaceRoot, readOnly: true }] });
  try {
    const result = await execute(f, "workspace.write", { path: "new.txt", content: "denied", expectedRevision: "MISSING" });
    assert.equal(errorCode(result), "WORKSPACE_ACCESS_DENIED");
    await assert.rejects(stat(join(workspaceRoot, "new.txt")), { code: "ENOENT" });
  } finally { await f.cleanup(); await rm(root, { recursive: true, force: true }); }
});

test("symlink or junction escape is denied", async (t) => {
  const f = await fixture();
  try {
    await writeFile(join(f.outsideRoot, "outside.txt"), "outside\n", "utf8");
    try {
      await symlink(f.outsideRoot, join(f.workspaceRoot, "escape"), process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (error?.code === "EPERM") { t.skip("host does not permit symlink/junction creation"); return; }
      throw error;
    }
    const result = await execute(f, "workspace.read", { path: "escape/outside.txt" });
    assert.equal(errorCode(result), "WORKSPACE_SYMLINK_ESCAPE");
  } finally { await f.cleanup(); }
});

test("list filters ignored and secret-like entries", async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.workspaceRoot, ".git"));
    await writeFile(join(f.workspaceRoot, ".env"), "SECRET=x", "utf8");
    await writeFile(join(f.workspaceRoot, "visible.txt"), "ok", "utf8");
    const result = await execute(f, "workspace.list", { path: "." });
    assert.equal(result.isError, false);
    assert.deepEqual(result.output.entries.map((entry) => entry.name), ["src", "visible.txt"]);
    assert.equal(result.output.omittedByPolicy, 2);
  } finally { await f.cleanup(); }
});

test("bounded read rejects binary content and records full-output artifact when truncated", async () => {
  const f = await fixture({ limits: { maxReadBytes: 16, maxReadLines: 2 } });
  try {
    await writeFile(join(f.workspaceRoot, "src", "binary.bin"), Buffer.from([0, 1, 2]));
    const binary = await execute(f, "workspace.read", { path: "src/binary.bin" });
    assert.equal(errorCode(binary), "WORKSPACE_BINARY_FILE_DENIED");

    await writeFile(join(f.workspaceRoot, "src", "long.txt"), "one\ntwo\nthree\nfour\n", "utf8");
    const result = await execute(f, "workspace.read", { path: "src/long.txt", maxLines: 2, maxBytes: 16 });
    assert.equal(result.output.content, "one\ntwo");
    assert.equal(result.output.truncated, true);
    assert.deepEqual(result.output.artifact, { artifactId: "artifact-1", kind: "READ_OUTPUT" });
    assert.equal(f.metadata.length, 1);
    assert.equal(await readFile(join(f.artifactRoot, "artifact-1", "content.txt"), "utf8"), "one\ntwo\nthree\nfour\n");
  } finally { await f.cleanup(); }
});

test("atomic write uses optimistic revision and persists a change artifact", async () => {
  const f = await fixture();
  try {
    const created = await execute(f, "workspace.write", { path: "src/hello.txt", content: "hello\n", expectedRevision: "MISSING" });
    assert.equal(created.isError, false);
    assert.match(created.output.revision, /^sha256:[0-9a-f]{64}$/);
    assert.equal(await readFile(join(f.workspaceRoot, "src", "hello.txt"), "utf8"), "hello\n");
    assert.deepEqual(created.output.artifact, { artifactId: "artifact-1", kind: "FILE_CHANGE" });
    assert.match(await readFile(join(f.artifactRoot, "artifact-1", "change.patch"), "utf8"), /\+hello/);

    const conflict = await execute(f, "workspace.write", { path: "src/hello.txt", content: "corrupt\n", expectedRevision: "MISSING" });
    assert.equal(errorCode(conflict), "WORKSPACE_REVISION_CONFLICT");
    assert.equal(await readFile(join(f.workspaceRoot, "src", "hello.txt"), "utf8"), "hello\n");
    assert.equal(f.metadata.length, 1);
  } finally { await f.cleanup(); }
});


test("concurrent writes to one path serialize and allow only one expected revision", async () => {
  const f = await fixture();
  try {
    const [left, right] = await Promise.all([
      execute(f, "workspace.write", { path: "src/race.txt", content: "left\n", expectedRevision: "MISSING" }),
      execute(f, "workspace.write", { path: "src/race.txt", content: "right\n", expectedRevision: "MISSING" }),
    ]);
    const results = [left, right];
    assert.equal(results.filter((item) => !item.isError).length, 1);
    assert.equal(results.filter((item) => errorCode(item) === "WORKSPACE_REVISION_CONFLICT").length, 1);
    assert.ok(["left\n", "right\n"].includes(await readFile(join(f.workspaceRoot, "src", "race.txt"), "utf8")));
    assert.equal(f.metadata.length, 1);
  } finally { await f.cleanup(); }
});

test("write does not create missing parent directories", async () => {
  const f = await fixture();
  try {
    const result = await execute(f, "workspace.write", { path: "missing/deep.txt", content: "x", expectedRevision: "MISSING" });
    assert.equal(errorCode(result), "WORKSPACE_FILE_NOT_FOUND");
    await assert.rejects(stat(join(f.workspaceRoot, "missing")), { code: "ENOENT" });
  } finally { await f.cleanup(); }
});

test("patch is all-or-nothing and then applies exact replacements", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.workspaceRoot, "src", "patch.txt"), "alpha\nbeta\n", "utf8");
    const current = await execute(f, "workspace.stat", { path: "src/patch.txt" });
    const revision = current.output.revision;
    const conflict = await execute(f, "workspace.patch", {
      path: "src/patch.txt", expectedRevision: revision,
      replacements: [{ oldText: "alpha", newText: "ALPHA" }, { oldText: "missing", newText: "X" }],
    });
    assert.equal(errorCode(conflict), "WORKSPACE_PATCH_CONFLICT");
    assert.equal(await readFile(join(f.workspaceRoot, "src", "patch.txt"), "utf8"), "alpha\nbeta\n");

    const applied = await execute(f, "workspace.patch", {
      path: "src/patch.txt", expectedRevision: revision,
      replacements: [{ oldText: "alpha", newText: "ALPHA" }, { oldText: "beta", newText: "BETA" }],
    });
    assert.equal(applied.isError, false);
    assert.equal(applied.output.replacementsApplied, 2);
    assert.equal(await readFile(join(f.workspaceRoot, "src", "patch.txt"), "utf8"), "ALPHA\nBETA\n");
  } finally { await f.cleanup(); }
});

test("search is literal, bounded, deterministic, and skips binary/denied content", async () => {
  const f = await fixture({ limits: { maxSearchFiles: 10, maxSearchMatches: 1, maxSearchBytes: 1024 } });
  try {
    await writeFile(join(f.workspaceRoot, "src", "a.txt"), "Needle one\nneedle two\n", "utf8");
    await writeFile(join(f.workspaceRoot, "src", "b.bin"), Buffer.from([0, 78, 0]));
    await writeFile(join(f.workspaceRoot, "src", ".env"), "needle secret", "utf8");
    const result = await execute(f, "workspace.search", { path: "src", query: "needle", caseSensitive: false, maxMatches: 1 });
    assert.equal(result.output.matches.length, 1);
    assert.deepEqual(result.output.matches[0].ref, { workspaceId: "main", relativePath: "src/a.txt" });
    assert.equal(result.output.skippedBinary, 0);
    assert.equal(result.output.truncated, true);
    assert.deepEqual(result.output.artifact, { artifactId: "artifact-1", kind: "SEARCH_OUTPUT" });
  } finally { await f.cleanup(); }
});

test("current schema stores workspace registrations and run-bound artifact metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step008-state-"));
  const workspaceRoot = join(root, "workspace");
  await mkdir(workspaceRoot);
  const paths = resolveProfilePaths({ profile: "state", env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  const state = await openOpenRillStateDatabase({ profilePaths: paths, now: () => 1700000000000 });
  try {
    assert.equal(state.schemaVersion, OPENRILL_STATE_SCHEMA_VERSION);
    const conversations = new ConversationService({ state, workspaceIds: ["main"], now: () => 1700000000000 });
    const conversation = conversations.create({ workspaceId: "main" });
    const sent = conversations.send({ workspaceId: "main", conversationId: conversation.conversationId, submissionKey: "step008", text: "test" });
    const execution = conversations.executionContext(sent.run.runId);
    state.transaction((repositories) => {
      repositories.workspaces.upsertWorkspace({
        workspaceId: "main", displayName: "Main", canonicalRoot: workspaceRoot,
        rootRevision: "a".repeat(64), accessMode: "READ_WRITE", trustState: "CONFIGURED_LOCAL", updatedAt: 1700000000000,
      });
      repositories.workspaces.insertArtifact({
        artifactId: "artifact-ledger", runId: sent.run.runId, attemptId: execution.attempt.attemptId,
        workspaceId: "main", kind: "FILE_CHANGE", relativePath: "src/a.txt", operation: "WRITE",
        beforeSha256: null, afterSha256: `sha256:${"b".repeat(64)}`, storagePath: join(root, "artifact-ledger"),
        sizeBytes: 12, createdAt: 1700000000001,
      });
    });
    const stored = state.transaction((repositories) => ({
      workspace: repositories.workspaces.getWorkspace("main"),
      artifacts: repositories.workspaces.listArtifacts(sent.run.runId),
    }));
    assert.equal(stored.workspace.accessMode, "READ_WRITE");
    assert.equal(stored.artifacts.length, 1);
    assert.equal(stored.artifacts[0].attemptId, execution.attempt.attemptId);
  } finally { state.close(); await rm(root, { recursive: true, force: true }); }
});
