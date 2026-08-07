import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = async (path) => await readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const STEP="STEP020BR1_TASK_FLOW_OWNER_SCOPE_AND_CANCEL_ADMISSION_CLOSURE";
const VERSION="0.20.2-step020br1";
const SHA="5ed9f739ce3244c4f3c0ff583fdc05dcecdf11d0dfe1d9db69c77de4b28fa747";

test("STEP020BR1 owns immutable Windows owner/admission acceptance evidence", async () => {
  const evidence=await read("reference/validation/STEP020BR1_WINDOWS_TASK_FLOW_OWNER_LIVE_ACCEPTANCE.md");
  assert.match(evidence,new RegExp(STEP)); assert.match(evidence,new RegExp(VERSION.replaceAll(".","\\.")));
  assert.match(evidence,/checks=35\/35/); assert.match(evidence,/windows_task_flow_owner_live=PASSED/);
  assert.match(evidence,/STEP020BR1_H1_TASK_FLOW_OWNER_SCOPE_CANCEL_ADMISSION_AND_RESTART/); assert.match(evidence,new RegExp(SHA));
});

test("STEP020BR1 schema 20 owner migration remains retained", async () => {
  const migrations=await read("packages/state/src/migrations.ts"); const sql=await read("packages/state/migrations/020_task_flow_owner_scope_and_cancel_admission.sql");
  const match=migrations.match(/OPENRILL_STATE_SCHEMA_VERSION = (\d+)/); assert.ok(match && Number(match[1])>=20);
  assert.match(sql,/ADD COLUMN owner_key TEXT/); assert.match(sql,/legacy:/); assert.match(sql,/task_flows_owner_required_insert/);
});

test("STEP020BR1 Conversation owner and cancel admission rules remain active", async () => {
  const service=await read("packages/task-flows/src/service.ts");
  assert.match(service,/task\.conversationId !== fresh\.ownerKey/); assert.match(service,/task flow cancellation has already been requested/); assert.match(service,/public getByTask/);
});

test("STEP020BR1 focused correction evidence remains executable", async () => {
  const body=await read("tests/unit/task-flow-owner-scope-step020br1.test.mjs");
  for(const token of ["backfills single-owner flows","cross-owner Task admission fails closed","cancellation request closes new Task admission","exact link replay","terminal same-owner Task"]) assert.match(body,new RegExp(token));
});

test("STEP020BR1 OR-ISSUE-240 and OR-ISSUE-241 remain documented", async () => {
  const registry=await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md"); const gates=await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  for(const number of [240,241]) { const token=`OR-ISSUE-${number}`; const issue=await read(`reference/validation/STEP020BR1_${token.replaceAll("-","_")}.md`); for(const body of [issue,registry,gates]) assert.match(body,new RegExp(token)); }
});

test("STEP020BR1 OpenClaw owner/admission audit remains retained", async () => {
  const audit=await read("docs/research/STEP020BR1_OPENCLAW_OWNER_AND_ADMISSION_REAUDIT.md");
  assert.match(audit,/runtime-taskflow\.ts/); assert.match(audit,/task-flow-owner-access\.ts/); assert.match(audit,/cancelRequestedAt/);
});

test("STEP020BR1 retained runners own immutable STEP identity without freezing current package", async () => {
  for(const file of ["scripts/run_step020br1_acceptance.py","scripts/run-step020br1-task-flow-owner-live.mjs","scripts/package_step020br1.py"]) { const body=await read(file); assert.match(body,new RegExp(STEP)); assert.match(body,new RegExp(VERSION.replaceAll(".","\\."))); }
  const source=await read("tests/unit/validation-governance-step020br1.test.mjs");
  assert.doesNotMatch(source,/JSON\.parse\(await read\("package\.json"\)\)/); assert.doesNotMatch(source,/JSON\.parse\(await read\("config\/current-accepted-baseline\.json"\)\)/);
});
