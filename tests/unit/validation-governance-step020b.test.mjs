import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = async (path) => await readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const STEP = "STEP020B_DURABLE_TASK_FLOW_REGISTRY_AND_CONTROLLER_LIFECYCLE_FOUNDATION";
const VERSION = "0.20.1-step020b";
const SHA = "e24cebe0b8fbb966dc942c0f5df0509b21e4e0a5d583ed6f807f0128c5894751";

test("STEP020B owns immutable Windows Task Flow acceptance evidence", async () => {
  const evidence = await read("reference/validation/STEP020B_WINDOWS_TASK_FLOW_LIVE_ACCEPTANCE.md");
  assert.match(evidence, new RegExp(STEP));
  assert.match(evidence, new RegExp(VERSION.replaceAll(".", "\\.")));
  assert.match(evidence, /checks=37\/37/);
  assert.match(evidence, /windows_task_flow_live=PASSED/);
  assert.match(evidence, /STEP020B_H1_TASK_FLOW_PROTOCOL_RESTART_REVISION_AND_CANCELLATION/);
  assert.match(evidence, new RegExp(SHA));
});

test("STEP020B schema 19 Flow, Task link, and append-only event foundation is retained", async () => {
  const migrations = await read("packages/state/src/migrations.ts");
  const sql = await read("packages/state/migrations/019_durable_task_flow_registry.sql");
  const match = migrations.match(/OPENRILL_STATE_SCHEMA_VERSION = (\d+)/);
  assert.ok(match && Number(match[1]) >= 19);
  for (const table of ["task_flows", "task_flow_tasks", "task_flow_events"]) assert.match(sql, new RegExp(`CREATE TABLE ${table}`));
  assert.match(sql, /task_id TEXT NOT NULL UNIQUE/);
  assert.doesNotMatch(sql, /workspace_id[^\n]*REFERENCES workspace_registrations/);
});

test("STEP020B controller lifecycle revision CAS and monotone terminals remain executable", async () => {
  const service = await read("packages/task-flows/src/service.ts");
  for (const method of ["public create(", "public linkTask(", "public start(", "public setWaiting(", "public setBlocked(", "public resume(", "public finish(", "public fail(", "public cancel("]) assert.ok(service.includes(method));
  assert.match(service, /TASK_FLOW_REVISION_CONFLICT/);
  assert.match(service, /terminal task flow/i);
  assert.match(service, /cancel\.requested/);
  assert.match(service, /cancelTask\(entry\.task\)/);
});

test("STEP020B protocol list get cancel surface remains closed", async () => {
  const registry = await read("services/agent-host/src/transport/operation-registry.ts");
  for (const operation of ["taskFlow.list", "taskFlow.get", "taskFlow.cancel"]) assert.match(registry, new RegExp(operation.replace(".", "\\.")));
});

test("STEP020B OpenClaw source audit and concept separation remain retained", async () => {
  const audit = await read("docs/research/STEP020B_OPENCLAW_TASK_FLOW_REFERENCE_AUDIT.md");
  assert.match(audit, /openclaw-main\.zip/);
  assert.match(audit, /controller-owned orchestration state/i);
  assert.match(audit, /does not autonomously convert Plan Steps into Tasks/i);
});

test("STEP020B focused Product evidence remains executable after correction", async () => {
  const body = (await Promise.all(["tests/unit/task-flow-registry-step020b.test.mjs","tests/unit/task-flow-protocol-step020b.test.mjs","tests/unit/task-flow-host-step020b.test.mjs"].map(read))).join("\n");
  assert.match(body, /revision-CAS across waiting, blocked, resume, and success/);
  assert.match(body, /terminally cancels all active child Tasks/);
  assert.match(body, /Host restart preserves Task Flow identity/);
});

test("STEP020B OR-ISSUE-237 through OR-ISSUE-239 remain documented", async () => {
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates = await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  for (const number of [237,238,239]) {
    const token=`OR-ISSUE-${number}`;
    const issue=await read(`reference/validation/STEP020B_${token.replaceAll("-","_")}.md`);
    for (const body of [issue,registry,gates]) assert.match(body,new RegExp(token));
  }
});

test("STEP020B retained runners own immutable STEP identity without freezing current package", async () => {
  for (const file of ["scripts/run_step020b_acceptance.py","scripts/run-step020b-task-flow-live.mjs","scripts/package_step020b.py"]) {
    const body=await read(file); assert.match(body,new RegExp(STEP)); assert.match(body,new RegExp(VERSION.replaceAll(".","\\.")));
  }
  const source=await read("tests/unit/validation-governance-step020b.test.mjs");
  assert.doesNotMatch(source,/JSON\.parse\(await read\("package\.json"\)\)/);
  assert.doesNotMatch(source,/JSON\.parse\(await read\("config\/current-accepted-baseline\.json"\)\)/);
});
