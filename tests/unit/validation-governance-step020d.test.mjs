import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = async (path) => await readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const STEP="STEP020D_TASK_AND_TASK_FLOW_RECONCILIATION_LOST_AND_RETENTION_FOUNDATION";
const VERSION="0.20.4-step020d";
const ZIP_SHA="5a3b83b35e52176fad6b5525991e2da7eaf1ab16aac25c566d4a63027518b450";
const LIVE="STEP020D_H1_TASK_FLOW_MAINTENANCE_RECONCILIATION_LOST_AND_RETENTION";

test("STEP020D owns immutable Windows 53/53 maintenance acceptance evidence", async () => {
  const evidence=await read("reference/validation/STEP020D_WINDOWS_MAINTENANCE_LIVE_ACCEPTANCE.md");
  for(const token of [STEP,VERSION,"checks=53/53","windows_maintenance_live=PASSED",`live_harness=${LIVE}`,"promotion=READY",ZIP_SHA]) assert.match(evidence,new RegExp(token.replaceAll(".","\\.")));
});

test("STEP020D schema 21 adds non-destructive cleanup scheduling", async () => {
  const migrations=await read("packages/state/src/migrations.ts"); const sql=await read("packages/state/migrations/021_task_and_flow_maintenance_retention.sql");
  const match=migrations.match(/OPENRILL_STATE_SCHEMA_VERSION = (\d+)/); assert.ok(match && Number(match[1])>=21);
  assert.match(sql,/ALTER TABLE background_tasks\s+ADD COLUMN cleanup_after/); assert.match(sql,/ALTER TABLE task_flows\s+ADD COLUMN cleanup_after/);
  assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM/i);
});

test("STEP020D keeps Run runtime as SOT and defines authority-loss LOST", async () => {
  const task=await read("packages/tasks/src/maintenance.ts"); const conversation=await read("packages/conversations/src/service.ts"); const migration=await read("packages/state/migrations/018_durable_background_task_ledger.sql");
  assert.match(migration,/REFERENCES agent_runs\(run_id\) ON DELETE CASCADE/);
  for(const token of ["runtimeAuthorityAvailable","isRunActive","isRunExpectedIdle","markRunLost","authorityGraceMs"]) assert.match(task,new RegExp(token));
  assert.match(conversation,/markExecutionLost/); assert.match(conversation,/RUNTIME_AUTHORITY_LOST/); assert.match(conversation,/NON_RESUMABLE/);
});

test("STEP020D Task audit reconcile and retention preserve active authority", async () => {
  const body=await read("packages/tasks/src/maintenance.ts");
  for(const token of ["TASK_RUN_STATUS_DRIFT","TASK_TERMINAL_RUN_ACTIVE","RUNTIME_AUTHORITY_MISSING","MARK_RUNTIME_LOST","SCHEDULE_RETENTION"]) assert.match(body,new RegExp(token));
  assert.match(body,/TERMINAL_RUN\.has\(run\.status\)/); assert.match(body,/listRetentionCandidates/); assert.doesNotMatch(body,/DELETE FROM background_tasks/);
});

test("STEP020D Flow maintenance keeps normal completion controller-owned", async () => {
  const body=await read("packages/task-flows/src/maintenance.ts");
  for(const token of ["FLOW_CANCEL_STUCK","FLOW_CANCEL_FINALIZATION_PENDING","FLOW_ALL_CHILDREN_TERMINAL_ACTIVE","FLOW_TERMINAL_WITH_ACTIVE_TASK","REPLAY_CANCELLATION","FINALIZE_CANCELLED"]) assert.match(body,new RegExp(token));
  assert.match(body,/repairPolicy: "REPORT_ONLY"/); assert.doesNotMatch(body,/status:\s*"SUCCEEDED"/); assert.doesNotMatch(body,/DELETE FROM task_flows/);
});

test("STEP020D Host-start reconciliation disables retention scheduling", async () => {
  const body=await read("services/agent-host/src/lifecycle.ts");
  assert.match(body,/new TaskMaintenanceService/); assert.match(body,/new TaskFlowMaintenanceService/);
  assert.match(body,/includeRetention: false/); assert.match(body,/maintenance\.reconciled/);
});

test("STEP020D public protocol owns six closed maintenance operations", async () => {
  const registry=await read("services/agent-host/src/transport/operation-registry.ts"); const validation=await read("packages/protocol/src/validation.ts");
  for(const operation of ["task.audit","task.reconcile","task.retention.preview","taskFlow.audit","taskFlow.reconcile","taskFlow.retention.preview"]) assert.match(registry,new RegExp(operation.replaceAll(".","\\.")));
  for(const validator of ["validateTaskAuditInput","validateTaskReconcileInput","validateTaskRetentionPreviewInput","validateTaskFlowAuditInput","validateTaskFlowReconcileInput","validateTaskFlowRetentionPreviewInput"]) assert.match(validation,new RegExp(validator));
  assert.match(validation,/PREVIEW/); assert.match(validation,/APPLY/);
});

test("STEP020D focused evidence proves repairs safety protocol and Host startup", async () => {
  const task=await read("tests/unit/task-maintenance-step020d.test.mjs"); const flow=await read("tests/unit/task-flow-maintenance-step020d.test.mjs"); const protocol=await read("tests/unit/maintenance-protocol-step020d.test.mjs"); const host=await read("tests/unit/maintenance-host-step020d.test.mjs");
  assert.match(task,/runtime authority loss/); assert.match(task,/expected-idle Runs are not LOST/); assert.match(task,/transitionRun\(\{ runId: record\.sent\.run\.runId, status: "RUNNING"/);
  assert.match(flow,/replays stuck cancellation/); assert.match(flow,/controller-owned/); assert.match(flow,/outside retention candidates/);
  assert.match(protocol,/task\.retention\.preview/); assert.match(host,/Host-start reconciliation/); assert.match(host,/cleanupAfter, null/);
});

test("STEP020D records OR-ISSUE-247 through OR-ISSUE-258 independently", async () => {
  const registry=await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md"); const gates=await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  for(const number of [247,248,249,250,251,252,253,254,255,256,257,258]) { const token=`OR-ISSUE-${number}`; const issue=await read(`reference/validation/STEP020D_${token.replaceAll("-","_")}.md`); for(const body of [issue,registry,gates]) assert.match(body,new RegExp(token)); }
});

test("STEP020D OpenClaw audit and plan preserve conservative ownership", async () => {
  const audit=await read("docs/research/STEP020D_OPENCLAW_TASK_AND_FLOW_MAINTENANCE_AUDIT.md"); const plan=await read("docs/plans/STEP020D_TASK_AND_TASK_FLOW_RECONCILIATION_LOST_AND_RETENTION_FOUNDATION.md");
  for(const token of ["task-registry.audit.ts","task-registry.maintenance.ts","task-flow-registry.audit.ts","task-flow-registry.maintenance.ts"]) assert.match(audit,new RegExp(token.replaceAll(".","\\.")));
  assert.match(audit,/ON DELETE CASCADE/); assert.match(audit,/no row is pruned|only adds `cleanup_after`/i);
  assert.match(plan,/Run\/runtime = execution lifecycle Source of Truth/); assert.match(plan,/Physical deletion is absent/); assert.match(plan,/autonomous Plan/);
});

test("STEP020D remains visible as the accepted baseline in current continuation documents", async () => {
  for(const file of ["README.md","HANDOFF.md","PLANS.md","ROADMAP.md","VALIDATION.md","PROJECT.md","ARCHITECTURE.md"]) { const body=await read(file); assert.match(body,new RegExp(STEP)); assert.match(body,new RegExp(VERSION.replaceAll(".","\\."))); assert.match(body,new RegExp(ZIP_SHA)); assert.match(body,/OR-ISSUE-247/); assert.match(body,/OR-ISSUE-251/); }
});

test("STEP020D historical runners retain exact immutable identity", async () => {
  for(const file of ["scripts/run_step020d_acceptance.py","scripts/run-step020d-maintenance-live.mjs","scripts/package_step020d.py"]) { const body=await read(file); assert.match(body,new RegExp(STEP)); assert.match(body,new RegExp(VERSION.replaceAll(".","\\."))); }
  const live=await read("scripts/run-step020d-maintenance-live.mjs"); assert.match(live,new RegExp(LIVE));
});

test("STEP020D package scripts expose deterministic acceptance and Windows live entrypoints", async () => {
  const scripts=JSON.parse(await read("package.json")).scripts;
  assert.equal(scripts["acceptance:step020d"],"python scripts/run_step020d_acceptance.py");
  assert.equal(scripts["acceptance:step020d:live"],"python scripts/run_step020d_acceptance.py --require-windows-maintenance-live");
  assert.equal(scripts["maintenance-live:step020d"],"node scripts/run-step020d-maintenance-live.mjs");
});
