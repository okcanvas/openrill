import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = async (path) => await readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("STEP018A retains immutable Windows memory acceptance evidence", async () => {
  const evidence = await read("reference/validation/STEP018A_WINDOWS_MEMORY_LIVE_ACCEPTANCE.md");
  assert.match(evidence, /STEP018A_DURABLE_AGENT_MEMORY_AND_CONTEXT_RECALL_FOUNDATION/);
  assert.match(evidence, /checks=33\/33 state=PASSED/);
  assert.match(evidence, /c9e5350dd5bd791a4e3412090e0c76cc0f0ac2bbfc9ed383e98666a1d42fb5c8/);
});

test("STEP018A records the exact OpenClaw memory source baseline and inspected paths", async () => {
  const source = await read("reference/openclaw/OPENCLAW_SOURCE_BASELINE.md");
  const audit = await read("docs/research/OPENCLAW_MEMORY_CODE_AUDIT.md");
  assert.match(source, /1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82/);
  assert.match(source, /commit_sha=NOT_PRESENT_IN_ARCHIVE/);
  assert.match(audit, /extensions\/memory-core\/src\/tools\.ts/);
  assert.match(audit, /search before exact read/i);
  assert.match(audit, /SQLite FTS5 lexical retrieval/);
});

test("STEP018A schema and Host integration remain explicit", async () => {
  const migration = await read("packages/state/migrations/016_durable_agent_memory.sql");
  const lifecycle = await read("services/agent-host/src/lifecycle.ts");
  assert.match(migration, /CREATE VIRTUAL TABLE memory_records_fts USING fts5/);
  assert.match(lifecycle, /registerMemoryTools/);
  assert.match(lifecycle, /MEMORY_SYSTEM_INSTRUCTIONS/);
});

test("STEP018A memory tools remain bounded, scoped and sensitive-content safe", async () => {
  const service = await read("packages/memory/src/service.ts");
  const tools = await read("packages/tools-memory/src/index.ts");
  assert.match(service, /maxResults: 10/);
  assert.match(service, /MEMORY_SENSITIVE_CONTENT_REJECTED/);
  assert.match(tools, /workspaceId: workspace\(context\)/);
  for (const tool of ["memory.remember", "memory.search", "memory.get", "memory.forget"]) assert.match(tools, new RegExp(tool.replace(".", "\\.")));
});

test("STEP018A retains its provenance failure asset and deferred distribution branch", async () => {
  assert.match(await read("reference/validation/STEP018A_OR_ISSUE_219.md"), /foreign keys/);
  assert.match(await read("reference/validation/STEP017A_DEFERRED_BRANCH_ASSET.md"), /DEFERRED_NOT_PROMOTED/);
});
