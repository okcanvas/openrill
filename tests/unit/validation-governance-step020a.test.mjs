import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = async (path) => await readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const STEP = "STEP020A_DURABLE_BACKGROUND_TASK_LEDGER_AND_RUNTIME_LIFECYCLE_FOUNDATION";
const VERSION = "0.20.0-step020a";
const SHA = "67ac1fa4a5067ff3070f0a990bfdfd262a6d956961ebd221432cdacf567c9a7f";

test("STEP020A owns immutable Windows acceptance evidence instead of mutable current identity", async () => {
  const evidence = await read("reference/validation/STEP020A_WINDOWS_TASK_LIVE_ACCEPTANCE.md");
  assert.match(evidence, new RegExp(STEP));
  assert.match(evidence, new RegExp(VERSION.replaceAll(".", "\\.")));
  assert.match(evidence, /checks=40\/40/);
  assert.match(evidence, /windows_task_live=PASSED/);
  assert.match(evidence, /STEP020A_H1_DURABLE_TASK_PROTOCOL_RESTART_AND_CANCELLATION/);
  assert.match(evidence, new RegExp(SHA));
  assert.match(evidence, /not reconstructed/i);
});

test("STEP020A source retains one Run-linked durable Task and terminal monotonicity", async () => {
  const migration = await read("packages/state/migrations/018_durable_background_task_ledger.sql");
  const conversation = await read("packages/state/src/conversation-repository.ts");
  const tasks = await read("packages/state/src/task-repository.ts");
  assert.match(migration, /CREATE TABLE background_tasks/);
  assert.match(migration, /run_id TEXT NOT NULL UNIQUE/);
  assert.match(conversation, /this\.#tasks\.createForRun/);
  assert.match(conversation, /this\.#tasks\.syncRunLifecycle/);
  assert.match(tasks, /TERMINAL\.has\(current\.status\)/);
});

test("STEP020A retains Task as ledger and owning-Run cancellation", async () => {
  const service = await read("packages/tasks/src/service.ts");
  for (const method of ["public list(", "public get(", "public getByRun(", "public classify(", "public cancel("]) assert.ok(service.includes(method));
  assert.match(service, /cancelRun\(current\)/);
  assert.doesNotMatch(service, /schedule\(/);
  assert.doesNotMatch(service, /execute\(/);
});

test("STEP020A retains Conversation Delegation Automation classification", async () => {
  const delegation = await read("packages/conversations/src/delegation.ts");
  const automation = await read("services/agent-host/src/automation-conversation-executor.ts");
  assert.match(delegation, /runtime: "DELEGATION"/);
  assert.match(delegation, /parentRunId: parentRun\.runId/);
  assert.match(automation, /runtime: "AUTOMATION"/);
  assert.doesNotMatch(automation, /createForRun/);
});

test("STEP020A retains exact Task protocol surface", async () => {
  const registry = await read("services/agent-host/src/transport/operation-registry.ts");
  for (const operation of ["task.list", "task.get", "task.cancel"]) assert.match(registry, new RegExp(operation.replace(".", "\\.")));
});

test("STEP020A OpenClaw audit retains Goal Plan Task Task Flow separation", async () => {
  const audit = await read("docs/research/STEP020A_OPENCLAW_BACKGROUND_TASK_REFERENCE_AUDIT.md");
  assert.match(audit, /Task is an activity ledger, not a scheduler/i);
  assert.match(audit, /Goal\/Plan, Task and Task Flow are separate concepts/i);
});

test("STEP020A focused Product evidence remains executable", async () => {
  const body = (await Promise.all([
    "tests/unit/background-task-ledger-step020a.test.mjs",
    "tests/unit/background-task-protocol-step020a.test.mjs",
    "tests/unit/background-task-automation-step020a.test.mjs",
    "tests/unit/background-task-host-step020a.test.mjs",
  ].map(read))).join("\n");
  assert.match(body, /parent linkage/);
  assert.match(body, /preserves one Task identity and reaches SUCCEEDED/);
  assert.match(body, /terminally cancels its owning Run and is replay-safe/);
});

test("STEP020A records OR-ISSUE-233 through OR-ISSUE-236 and recurrence gates", async () => {
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates = await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  for (const number of [233, 234, 235, 236]) {
    const token = `OR-ISSUE-${number}`;
    const issue = await read(`reference/validation/STEP020A_${token.replaceAll("-", "_")}.md`);
    for (const body of [issue, registry, gates]) assert.match(body, new RegExp(token));
  }
});

test("STEP020A retained runners own immutable STEP identity", async () => {
  for (const file of ["scripts/run_step020a_acceptance.py", "scripts/run-step020a-task-live.mjs", "scripts/package_step020a.py"]) {
    const body = await read(file);
    assert.match(body, new RegExp(STEP));
    assert.match(body, new RegExp(VERSION.replaceAll(".", "\\.")));
  }
});

test("STEP020A historical governance does not freeze mutable package baseline or schema", async () => {
  const source = await read("tests/unit/validation-governance-step020a.test.mjs");
  const migrations = await read("packages/state/src/migrations.ts");
  assert.doesNotMatch(source, /JSON\.parse\(await read\("package\.json"\)\)/);
  assert.doesNotMatch(source, /JSON\.parse\(await read\("config\/current-accepted-baseline\.json"\)\)/);
  const match = migrations.match(/OPENRILL_STATE_SCHEMA_VERSION = (\d+)/);
  assert.ok(match);
  assert.ok(Number(match[1]) >= 18);
});
