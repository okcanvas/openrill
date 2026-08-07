import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase, OPENRILL_STATE_SCHEMA_VERSION } from "../../packages/state/dist/index.js";
import { MemoryError, MemoryService } from "../../packages/memory/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { createMemoryTools } from "../../packages/tools-memory/dist/index.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "openrill-step018a-memory-"));
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") };
  const paths = resolveProfilePaths({ profile: "memory", env });
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  let now = 100;
  let id = 0;
  const memory = new MemoryService(state, { now: () => ++now, createId: () => `memory-${++id}` });
  return { root, paths, state, memory, cleanup: async () => { state.close(); await rm(root, { recursive: true, force: true }); } };
}

test("STEP018A state schema 16 materializes durable memory and FTS5", async () => {
  const f = await fixture();
  try {
    assert.ok(OPENRILL_STATE_SCHEMA_VERSION >= 16);
    assert.equal(f.state.schemaVersion, OPENRILL_STATE_SCHEMA_VERSION);
    const diagnostics = f.state.diagnostics({ full: true });
    assert.equal(diagnostics.healthy, true);
    const created = f.memory.remember({
      workspaceId: "alpha",
      text: "The project default HTTP port is 8084.",
      kind: "FACT",
      sourceConversationId: null,
      sourceRunId: null,
    });
    assert.equal(created.replayed, false);
    assert.equal(created.record.memoryId, "memory-1");
    assert.equal(created.record.kind, "FACT");

    const replay = f.memory.remember({ workspaceId: "alpha", text: "The project default HTTP port is 8084.", kind: "FACT" });
    assert.equal(replay.replayed, true);
    assert.equal(replay.record.memoryId, created.record.memoryId);
    assert.equal(f.memory.list({ workspaceId: "alpha" }).length, 1);

    const search = f.memory.search({ workspaceId: "alpha", query: "default port 8084" });
    assert.equal(search.mode, "SQLITE_FTS5_LEXICAL");
    assert.equal(search.results.length, 1);
    assert.equal(search.results[0].memoryId, created.record.memoryId);
    assert.match(search.results[0].excerpt, /8084/);
    assert.equal(f.memory.search({ workspaceId: "beta", query: "default port" }).results.length, 0);

    const exact = f.memory.get({ workspaceId: "alpha", memoryId: created.record.memoryId });
    assert.equal(exact.text, "The project default HTTP port is 8084.");
    assert.equal(exact.provenance.conversationId, null);

    const forgotten = f.memory.forget({ workspaceId: "alpha", memoryId: created.record.memoryId });
    assert.equal(forgotten.memoryId, created.record.memoryId);
    assert.equal(f.memory.search({ workspaceId: "alpha", query: "8084" }).results.length, 0);
    assert.throws(
      () => f.memory.get({ workspaceId: "alpha", memoryId: created.record.memoryId }),
      (error) => error instanceof MemoryError && error.code === "MEMORY_NOT_FOUND",
    );
  } finally {
    await f.cleanup();
  }
});

test("STEP018A memory survives database restart and remains workspace-isolated", async () => {
  const f = await fixture();
  try {
    const created = f.memory.remember({ workspaceId: "alpha", text: "Use UTC timestamps in audit reports.", kind: "PREFERENCE" });
    f.state.close({ checkpointMode: "TRUNCATE" });
    const reopened = await openOpenRillStateDatabase({ profilePaths: f.paths });
    try {
      const memory = new MemoryService(reopened);
      assert.equal(memory.get({ workspaceId: "alpha", memoryId: created.record.memoryId }).text, "Use UTC timestamps in audit reports.");
      assert.equal(memory.search({ workspaceId: "beta", query: "UTC timestamps" }).results.length, 0);
    } finally {
      reopened.close({ checkpointMode: "TRUNCATE" });
    }
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("STEP018A rejects credentials and invalid query expansion", async () => {
  const f = await fixture();
  try {
    assert.throws(
      () => f.memory.remember({ workspaceId: "alpha", text: "api_key=sk-1234567890abcdefghijklmnop" }),
      (error) => error instanceof MemoryError && error.code === "MEMORY_SENSITIVE_CONTENT_REJECTED",
    );
    assert.throws(
      () => f.memory.search({ workspaceId: "alpha", query: "!!!" }),
      (error) => error instanceof MemoryError && error.code === "MEMORY_QUERY_INVALID",
    );
  } finally {
    await f.cleanup();
  }
});

test("STEP018A tool boundary preserves provenance, typed errors, and exact workspace scope", async () => {
  const f = await fixture();
  try {
    const tools = Object.fromEntries(createMemoryTools(f.memory).map((tool) => [tool.name, tool]));
    const conversations = new ConversationService({ state: f.state, workspaceIds: ["alpha", "beta"] });
    const conversation = conversations.create({ workspaceId: "alpha", modelProfile: "default" });
    const sent = conversations.send({ workspaceId: "alpha", conversationId: conversation.conversationId, submissionKey: "memory-tool", text: "remember Bluebird" });
    const context = { runId: sent.run.runId, attemptId: "attempt-1", workspaceId: "alpha", conversationId: conversation.conversationId, toolCallId: "call-1" };
    const remembered = await tools["memory.remember"].execute({ text: "The release train is called Bluebird.", kind: "DECISION" }, context);
    assert.equal(remembered.isError, false);
    assert.equal(remembered.output.record.provenance.runId, sent.run.runId);
    assert.equal(remembered.output.record.provenance.conversationId, conversation.conversationId);

    const search = await tools["memory.search"].execute({ query: "Bluebird release" }, context);
    assert.equal(search.isError, false);
    assert.equal(search.output.results.length, 1);

    const crossWorkspace = await tools["memory.get"].execute({ memoryId: remembered.output.record.memoryId }, { ...context, workspaceId: "beta" });
    assert.equal(crossWorkspace.isError, true);
    assert.equal(crossWorkspace.output.error.code, "MEMORY_NOT_FOUND");
  } finally {
    await f.cleanup();
  }
});
