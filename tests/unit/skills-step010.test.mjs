import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { AgentRunCoordinator, SkillRunService } from "../../services/agent-host/dist/index.js";
import {
  discoverSkills,
  selectActivatedSkills,
  SkillError,
  SkillSnapshotStore,
} from "../../packages/skills/dist/index.js";
import { OPENRILL_STATE_SCHEMA_VERSION, openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ToolRegistry } from "../../packages/tool-runtime/dist/index.js";
import { createWorkspaceCatalog } from "../../packages/workspace/dist/index.js";

async function writeSkill(root, options = {}) {
  const directory = join(root, options.directory ?? options.id ?? "sample-skill");
  await mkdir(join(directory, "resources"), { recursive: true });
  const id = options.id ?? "sample-skill";
  const version = options.version ?? "1.0.0";
  const instructions = options.instructionsPath ?? "instructions.md";
  const activation = options.activation ?? ["use sample skill"];
  const tools = options.tools ?? ["workspace.read"];
  const resources = options.resources ?? ["resources/guide.md"];
  const lines = [
    `id: ${id}`,
    `version: ${version}`,
    `description: ${options.description ?? "A deterministic test Skill."}`,
    "activation:",
    ...activation.map((item) => `  - ${item}`),
    `instructions: ${instructions}`,
    "tools:",
    ...tools.map((item) => `  - ${item}`),
    "resources:",
    ...resources.map((item) => `  - ${item}`),
    "compatibility:",
    "  minOpenRill: 0.10.0-step010",
  ];
  await writeFile(join(directory, "skill.yaml"), `${lines.join("\n")}\n`, "utf8");
  if (!options.skipInstructions) await writeFile(join(directory, instructions), options.instructionsText ?? "Follow the immutable Skill instructions.\n", "utf8");
  for (const resource of resources) {
    if (!resource.includes("..") && !options.skipResources) {
      await mkdir(join(directory, resource, ".."), { recursive: true });
      await writeFile(join(directory, resource), `resource:${id}\n`, "utf8");
    }
  }
  return directory;
}

function memorySink() {
  const sources = new Map();
  const diagnostics = new Map();
  const contexts = new Map();
  const snapshots = new Map();
  return {
    sources, diagnostics, contexts, snapshots,
    replaceSourceDiscovery(source, values) { sources.set(source.sourceKey, source); diagnostics.set(source.sourceKey, [...values]); },
    insertRunContext(context) {
      const existing = contexts.get(context.runId);
      if (existing) return existing;
      contexts.set(context.runId, context);
      return context;
    },
    getRunContext(runId) { return contexts.get(runId) ?? null; },
    insertSnapshot(snapshot) {
      const key = `${snapshot.runId}:${snapshot.skillId}`;
      const existing = snapshots.get(key);
      if (existing) return existing;
      snapshots.set(key, snapshot);
      return snapshot;
    },
    listRunSnapshots(runId) { return [...snapshots.values()].filter((item) => item.runId === runId).sort((a, b) => a.skillId.localeCompare(b.skillId)); },
  };
}

const availableTools = ["workspace.list", "workspace.read", "workspace.search"];

async function catalogFixture() {
  const root = await mkdtemp(join(tmpdir(), "openrill-step010-catalog-"));
  const bundled = join(root, "bundled");
  const managed = join(root, "managed");
  const workspace = join(root, "workspace");
  await Promise.all([mkdir(bundled), mkdir(managed), mkdir(join(workspace, "skills"), { recursive: true })]);
  return { root, bundled, managed, workspace, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test("valid Skill discovery exposes metadata and loads content only at snapshot", async () => {
  const f = await catalogFixture();
  try {
    const directory = await writeSkill(f.bundled, { id: "lazy-skill" });
    await writeFile(join(directory, "instructions.md"), Buffer.from([0xff, 0xfe, 0xfd]));
    const catalog = await discoverSkills({ bundledRoots: [f.bundled], availableTools, currentVersion: "0.10.0-step010" });
    assert.equal(catalog.entries.length, 1);
    assert.equal("instructions" in catalog.entries[0], false);
    assert.deepEqual(selectActivatedSkills(catalog, "Please USE SAMPLE SKILL now").map((entry) => entry.skillId), ["lazy-skill"]);
    const sink = memorySink();
    const store = new SkillSnapshotStore({ rootDirectory: join(f.root, "state"), metadataSink: sink });
    await assert.rejects(store.capture("run-lazy", catalog.entries[0]), (error) => error instanceof SkillError && error.code === "SKILL_BINARY_CONTENT_DENIED");
  } finally { await f.cleanup(); }
});

test("invalid manifest, missing instructions, resource escape, and unavailable tools isolate only the bad Skill", async () => {
  const f = await catalogFixture();
  try {
    await writeSkill(f.bundled, { id: "valid-skill" });
    await writeSkill(f.bundled, { id: "Invalid_ID", directory: "bad-id" });
    await writeSkill(f.bundled, { id: "bad-version", version: "v1", directory: "bad-version" });
    await writeSkill(f.bundled, { id: "missing-instructions", directory: "missing", skipInstructions: true });
    await writeSkill(f.bundled, { id: "escape-resource", directory: "escape", resources: ["../outside.md"] });
    await writeSkill(f.bundled, { id: "missing-tool", directory: "missing-tool", tools: ["process.run"] });
    const catalog = await discoverSkills({ bundledRoots: [f.bundled], availableTools, currentVersion: "0.10.0-step010" });
    assert.deepEqual(catalog.entries.map((entry) => entry.skillId), ["valid-skill"]);
    assert.deepEqual(new Set(catalog.diagnostics.map((item) => item.code)), new Set([
      "SKILL_ID_INVALID",
      "SKILL_VERSION_INVALID",
      "SKILL_INSTRUCTIONS_MISSING",
      "SKILL_RESOURCE_ESCAPE",
      "SKILL_REQUIRED_TOOL_UNAVAILABLE",
    ]));
  } finally { await f.cleanup(); }
});

test("resource symlink escape is rejected", async () => {
  const f = await catalogFixture();
  try {
    const directory = await writeSkill(f.bundled, { id: "symlink-skill", resources: [], skipResources: true });
    const outsideDirectory = join(f.root, "outside-resource");
    await mkdir(outsideDirectory);
    await writeFile(join(outsideDirectory, "outside.md"), "outside\n", "utf8");
    await symlink(
      outsideDirectory,
      join(directory, "resources", "escape"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const manifest = await readFile(join(directory, "skill.yaml"), "utf8");
    await writeFile(
      join(directory, "skill.yaml"),
      manifest.replace("resources:\n", "resources:\n  - resources/escape/outside.md\n"),
      "utf8",
    );
    const catalog = await discoverSkills({ bundledRoots: [f.bundled], availableTools, currentVersion: "0.10.0-step010" });
    assert.equal(catalog.entries.length, 0);
    assert.equal(catalog.diagnostics[0].code, "SKILL_SYMLINK_ESCAPE");
  } finally { await f.cleanup(); }
});

test("workspace precedence wins and shadow diagnostics remain durable", async () => {
  const f = await catalogFixture();
  const sink = memorySink();
  try {
    await writeSkill(f.bundled, { id: "same-skill", instructionsText: "bundled\n" });
    await writeSkill(f.managed, { id: "same-skill", instructionsText: "managed\n" });
    await writeSkill(join(f.workspace, "skills"), { id: "same-skill", instructionsText: "workspace\n" });
    const catalog = await discoverSkills({
      bundledRoots: [f.bundled],
      managedUserRoots: [f.managed],
      workspaceRoot: f.workspace,
      workspaceId: "main",
      availableTools,
      currentVersion: "0.10.0-step010",
      metadataSink: sink,
    });
    assert.equal(catalog.entries[0].source.type, "WORKSPACE");
    assert.equal(catalog.shadowed.length, 2);
    assert.equal(catalog.diagnostics.filter((item) => item.code === "SKILL_SHADOWED").length, 2);
    assert.equal([...sink.diagnostics.values()].flat().filter((item) => item.code === "SKILL_SHADOWED").length, 2);
  } finally { await f.cleanup(); }
});

test("Run snapshot ignores mid-Run edits and next Run captures a new hash", async () => {
  const f = await catalogFixture();
  const sink = memorySink();
  try {
    const directory = await writeSkill(f.bundled, { id: "snapshot-skill", instructionsText: "version one\n" });
    const catalogOne = await discoverSkills({ bundledRoots: [f.bundled], availableTools, currentVersion: "0.10.0-step010" });
    const store = new SkillSnapshotStore({ rootDirectory: join(f.root, "state"), metadataSink: sink, now: () => 1700000000000 });
    const first = await store.capture("run-one", catalogOne.entries[0]);
    await writeFile(join(directory, "instructions.md"), "version two\n", "utf8");
    const sameRun = await store.loadRun("run-one");
    assert.equal(sameRun[0].instructions, "version one\n");
    assert.equal(sameRun[0].contentHash, first.contentHash);
    const catalogTwo = await discoverSkills({ bundledRoots: [f.bundled], availableTools, currentVersion: "0.10.0-step010" });
    const second = await store.capture("run-two", catalogTwo.entries[0]);
    assert.equal(second.instructions, "version two\n");
    assert.notEqual(second.contentHash, first.contentHash);
  } finally { await f.cleanup(); }
});

test("Host SkillRunService persists schema-7 source, diagnostics, context, snapshots, and same-Run reuse", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step010-host-"));
  const workspaceRoot = join(root, "workspace");
  const managedRoot = join(root, "managed-skills");
  await mkdir(workspaceRoot, { recursive: true });
  const skillDirectory = await writeSkill(managedRoot, { id: "host-skill", activation: ["activate host skill"], instructionsText: "host version one\n", tools: ["workspace.read"] });
  const paths = resolveProfilePaths({ profile: "step010", env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  try {
    assert.equal(state.schemaVersion, OPENRILL_STATE_SCHEMA_VERSION);
    const workspaces = await createWorkspaceCatalog([{ id: "main", path: workspaceRoot }]);
    const internal = workspaces.internal("main");
    state.transaction((repositories) => repositories.workspaces.upsertWorkspace({
      workspaceId: internal.workspaceId,
      displayName: internal.displayName,
      canonicalRoot: internal.canonicalRoot,
      rootRevision: internal.rootRevision,
      accessMode: internal.accessMode,
      trustState: internal.trustState,
      updatedAt: Date.now(),
    }));
    const conversations = new ConversationService({ state, workspaceIds: ["main"] });
    const tools = new ToolRegistry();
    tools.register({ name: "workspace.read", description: "test", inputSchema: {}, validateInput: () => true, execute: () => ({ output: {}, isError: false }) });
    const service = new SkillRunService({
      state,
      conversations,
      tools,
      workspaces,
      bundledRoots: [],
      managedUserRoots: [managedRoot],
      enabledSkillIds: [],
      snapshotRoot: state.paths.stateDir,
      currentVersion: "0.10.0-step010",
      now: () => 1700000000000,
    });
    const conversation = conversations.create({ workspaceId: "main" });
    const firstSend = conversations.send({ workspaceId: "main", conversationId: conversation.conversationId, submissionKey: "one", text: "Please activate host skill" });
    const first = await service.resolveForRun(firstSend.run.runId, "base");
    assert.equal(first.reused, false);
    assert.equal(first.snapshots[0].instructions, "host version one\n");
    await writeFile(join(skillDirectory, "instructions.md"), "host version two\n", "utf8");
    const reused = await service.resolveForRun(firstSend.run.runId, "base");
    assert.equal(reused.reused, true);
    assert.equal(reused.snapshots[0].instructions, "host version one\n");
    const secondSend = conversations.send({ workspaceId: "main", conversationId: conversation.conversationId, submissionKey: "two", text: "Again activate host skill" });
    const second = await service.resolveForRun(secondSend.run.runId, "base");
    assert.equal(second.snapshots[0].instructions, "host version two\n");
    assert.notEqual(second.snapshots[0].contentHash, first.snapshots[0].contentHash);
    const ledger = state.transaction((repositories) => ({
      sources: repositories.skills.listSources(),
      contexts: [repositories.skills.getRunContext(firstSend.run.runId), repositories.skills.getRunContext(secondSend.run.runId)],
      firstSnapshots: repositories.skills.listRunSnapshots(firstSend.run.runId),
    }));
    assert.equal(ledger.sources.length, 1);
    assert.equal(ledger.contexts.every(Boolean), true);
    assert.equal(ledger.firstSnapshots.length, 1);
    assert.equal(conversations.events(firstSend.run.runId).some((event) => event.eventType === "skill.snapshot.captured"), true);
  } finally {
    state.close();
    await rm(root, { recursive: true, force: true });
  }
});


test("enabled Skill allowlist gates activation without invalidating discovery", async () => {
  const f = await catalogFixture();
  try {
    await writeSkill(f.bundled, { id: "enabled-skill", activation: ["activate enabled"] });
    await writeSkill(f.bundled, { id: "disabled-skill", activation: ["activate disabled"] });
    const catalog = await discoverSkills({
      bundledRoots: [f.bundled],
      availableTools,
      enabledSkillIds: ["enabled-skill"],
      currentVersion: "0.10.0-step010",
    });
    assert.equal(catalog.entries.length, 2);
    assert.equal(catalog.entries.find((entry) => entry.skillId === "disabled-skill")?.enabled, false);
    assert.deepEqual(selectActivatedSkills(catalog, "activate enabled and activate disabled").map((entry) => entry.skillId), ["enabled-skill"]);
  } finally { await f.cleanup(); }
});

test("source revision changes when discovered manifest metadata changes", async () => {
  const f = await catalogFixture();
  const sink = memorySink();
  try {
    const directory = await writeSkill(f.bundled, { id: "revision-skill", description: "revision one" });
    await discoverSkills({ bundledRoots: [f.bundled], availableTools, currentVersion: "0.10.0-step010", metadataSink: sink });
    const first = [...sink.sources.values()][0].rootRevision;
    const manifest = await readFile(join(directory, "skill.yaml"), "utf8");
    await writeFile(join(directory, "skill.yaml"), manifest.replace("revision one", "revision two"), "utf8");
    await discoverSkills({ bundledRoots: [f.bundled], availableTools, currentVersion: "0.10.0-step010", metadataSink: sink });
    const second = [...sink.sources.values()][0].rootRevision;
    assert.notEqual(second, first);
  } finally { await f.cleanup(); }
});

test("deleted original Skill remains readable from immutable Run snapshot", async () => {
  const f = await catalogFixture();
  const sink = memorySink();
  try {
    const directory = await writeSkill(f.bundled, { id: "deleted-source-skill", instructionsText: "retained snapshot\n" });
    const catalog = await discoverSkills({ bundledRoots: [f.bundled], availableTools, currentVersion: "0.10.0-step010" });
    const store = new SkillSnapshotStore({ rootDirectory: join(f.root, "state"), metadataSink: sink });
    await store.capture("run-deleted", catalog.entries[0]);
    await rm(directory, { recursive: true, force: true });
    const loaded = await store.loadRun("run-deleted");
    assert.equal(loaded[0].instructions, "retained snapshot\n");
  } finally { await f.cleanup(); }
});

test("concurrent same-Run capture serializes to one durable immutable snapshot", async () => {
  const f = await catalogFixture();
  const sink = memorySink();
  try {
    await writeSkill(f.bundled, { id: "concurrent-skill" });
    const catalog = await discoverSkills({ bundledRoots: [f.bundled], availableTools, currentVersion: "0.10.0-step010" });
    const store = new SkillSnapshotStore({ rootDirectory: join(f.root, "state"), metadataSink: sink });
    const [left, right] = await Promise.all([
      store.capture("run-concurrent", catalog.entries[0]),
      store.capture("run-concurrent", catalog.entries[0]),
    ]);
    assert.equal(left.snapshotId, right.snapshotId);
    assert.equal(sink.listRunSnapshots("run-concurrent").length, 1);
  } finally { await f.cleanup(); }
});

test("Skill preparation failure durably fails the Run before model execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step010-preparation-failure-"));
  const paths = resolveProfilePaths({ profile: "step010-failure", env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  try {
    const conversations = new ConversationService({ state, workspaceIds: ["main"] });
    const conversation = conversations.create({ workspaceId: "main" });
    const sent = conversations.send({ workspaceId: "main", conversationId: conversation.conversationId, submissionKey: "failure", text: "trigger" });
    const coordinator = new AgentRunCoordinator({
      conversations,
      models: { resolve: () => { throw new Error("model resolver must not run"); } },
      tools: new ToolRegistry(),
      publishNotice: () => undefined,
      resolveRunPreparation: async () => { throw new Error("snapshot source changed"); },
    });
    assert.equal(coordinator.schedule(sent.run.runId), true);
    await coordinator.close();
    const execution = conversations.executionContext(sent.run.runId);
    assert.equal(execution.run.status, "FAILED");
    assert.equal(execution.attempt.status, "FAILED");
    assert.equal(execution.attempt.terminalReason, "SKILL_PREPARATION_FAILED");
  } finally {
    state.close();
    await rm(root, { recursive: true, force: true });
  }
});
