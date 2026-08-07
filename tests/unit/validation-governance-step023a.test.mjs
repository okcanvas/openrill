import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const read = async (path) => readFile(resolve(ROOT, path), "utf8");

test("STEP023A plan, contract, OpenClaw audit, and GitHub publication boundary are durable continuation assets", async () => {
  const [plan, contract, audit, github, attributes, ignore] = await Promise.all([
    read("docs/plans/STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE.md"),
    read("docs/contracts/MAINTENANCE_RETENTION.md"),
    read("docs/research/STEP023A_OPENCLAW_MAINTENANCE_REFERENCE_AUDIT.md"),
    read("GITHUB_PUBLISHING.md"),
    read(".gitattributes"),
    read(".gitignore"),
  ]);
  assert.match(plan, /STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE/);
  assert.match(plan, /0\.25\.0-step023a/); assert.match(plan, /STATE_SCHEMA=26/);
  assert.match(plan, /MATTERMOST_CONNECTOR=PREPARING_LIVE_PENDING_NON_BLOCKING/);
  for (const token of ["maintenance_sweep_state", "Tombstone-before-delete", "UNCERTAIN", "maintenanceAutoArm=false"]) assert.ok(contract.includes(token), token);
  for (const path of ["src/tasks/task-registry.maintenance.ts", "extensions/browser/src/browser/session-tab-cleanup.ts", "extensions/browser/src/browser/session-tab-registry.sqlite.test.ts"]) assert.ok(audit.includes(path), path);
  for (const token of ["STEP023AR1_GITHUB_PUBLISHING_SOURCE_HYGIENE_AND_EOL_CONTRACT_CLOSURE", "PRIVATE_UNTIL_OPENRILL_LICENSE_IS_SELECTED", "git push -u origin main"]) assert.ok(github.includes(token), token);
  assert.ok(attributes.includes("* -text")); for (const name of ["start-and-run-step022c-live.cmd", "start-mattermost-testbed.cmd", "reset-mattermost-testbed.cmd", "stop-mattermost-testbed.cmd"]) assert.ok(attributes.includes(`${name} text eol=crlf`), name);
  for (const token of [".env.*", "!**/.env.example", "*.pem", "*.key", "*.p12", "*.pfx"]) assert.ok(ignore.includes(token), token);
  const fresh = await read("scripts/verify_step023a_fresh.py"); for (const token of ["extract.parent.mkdir", "z.extractall(extract)", "run_checked(command,extract)", "REPACK_NOT_BYTE_IDENTICAL"]) assert.ok(fresh.includes(token), token);
});

test("STEP023A issue registry and recurrence gates retain OR-ISSUE-376 through OR-ISSUE-410", async () => {
  const [registry, gates] = await Promise.all([read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md"), read("docs/testing/RECURRENCE_PREVENTION_GATES.md")]);
  for (let n = 376; n <= 410; n += 1) {
    const issue = `OR-ISSUE-${n}`;
    assert.ok(registry.includes(issue), issue); assert.ok(gates.includes(issue), issue);
    const evidence = await read(n <= 404 ? `reference/validation/STEP023A_OR_ISSUE_${n}.md` : `reference/validation/STEP023AR1_OR_ISSUE_${n}.md`);
    assert.ok(evidence.includes(issue), issue);
  }
});

test("STEP023A schema 26 owns lease, durable sweep cursor, tombstone, and Connector cleanup state", async () => {
  const migration = await read("packages/state/migrations/026_periodic_maintenance_physical_retention.sql");
  for (const token of ["ADD COLUMN cleanup_after", "CREATE TABLE maintenance_leases", "CREATE TABLE maintenance_sweep_state", "CREATE TABLE maintenance_retention_tombstones", "cursor_cleanup_after", "revision INTEGER NOT NULL DEFAULT 1"]) assert.ok(migration.includes(token), token);
  const migrations = await read("packages/state/src/migrations.ts"); assert.match(migrations, /OPENRILL_STATE_SCHEMA_VERSION = 26/);
});

test("STEP023A repository rechecks protection and inserts tombstone before root delete", async () => {
  const source = await read("packages/state/src/retention-repository.ts");
  for (const token of ["RUN_ACTIVE", "ACTIONABLE_TASK_DELIVERY", "GOAL_EXECUTION_REFERENCE", "OPEN_DEAD_LETTER", "DELIVERY_RECEIPT_MISSING", "maintenance_retention_tombstones", "ownsLease", "getSweepState", "advanceSweepState"]) assert.ok(source.includes(token), token);
  assert.doesNotMatch(source, /maintenance_retention_tombstones[\\s\\S]{0,300}ON CONFLICT/);
  const tombstone = source.indexOf("INSERT INTO maintenance_retention_tombstones");
  const dynamicDelete = source.indexOf("DELETE FROM ${table}", tombstone);
  assert.ok(tombstone >= 0 && dynamicDelete > tombstone);
});

test("STEP023A scheduling is separate from reconciliation and queries unscheduled terminal candidates directly", async () => {
  const [taskMaintenance, flowMaintenance, taskRepo, flowRepo] = await Promise.all([
    read("packages/tasks/src/maintenance.ts"), read("packages/task-flows/src/maintenance.ts"), read("packages/state/src/task-repository.ts"), read("packages/state/src/task-flow-repository.ts"),
  ]);
  assert.match(taskMaintenance, /public scheduleRetention/); assert.match(flowMaintenance, /public scheduleRetention/);
  assert.match(taskRepo, /listRetentionSchedulingCandidates/); assert.match(taskRepo, /cleanup_after IS NULL/);
  assert.match(flowRepo, /listRetentionSchedulingCandidates/); assert.match(flowRepo, /cleanup_after IS NULL/);
});

test("STEP023A Host periodic sweep owns lease-aware prune, persisted continuation, and timer shutdown", async () => {
  const [coordinator, lifecycle] = await Promise.all([read("services/agent-host/src/maintenance-retention.ts"), read("services/agent-host/src/lifecycle.ts")]);
  for (const token of ["claimLease", "ownsLease", "LEASE_LOST", "retention-sweep:", "getSweepState", "advanceSweepState", "scheduleRetention"]) assert.ok(coordinator.includes(token), token);
  assert.match(lifecycle, /maintenanceAutoArm/); assert.match(lifecycle, /maintenance\?\.sweepIntervalMs/); assert.match(lifecycle, /clearInterval\(maintenanceSweepTimer\)/);
});

test("STEP023A public Protocol is closed to preview, prune, and tombstones", async () => {
  const [ops, validation, registry] = await Promise.all([read("packages/protocol/src/maintenance-operations.ts"), read("packages/protocol/src/validation.ts"), read("services/agent-host/src/transport/operation-registry.ts")]);
  for (const operation of ["maintenance.retention.preview", "maintenance.retention.prune", "maintenance.retention.tombstones"]) assert.ok(registry.includes(operation), operation);
  assert.match(validation, /validateMaintenanceRetentionPreviewInput/); assert.match(validation, /validateMaintenanceRetentionPruneInput/); assert.match(validation, /validateMaintenanceRetentionTombstoneListInput/);
  assert.doesNotMatch(ops, /payload|receiptBody|claimToken/);
});

test("STEP023A current source identity advances while accepted baseline and Mattermost promotion remain separate", async () => {
  const pkg = JSON.parse(await read("package.json")); assert.equal(pkg.version, "0.25.0-step023a"); assert.match(pkg.description, /STEP023A/);
  for (const file of ["scripts/generate_package_manifest.py", "scripts/verify_package_manifest.py"]) { const body = await read(file); assert.match(body, /STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE/); assert.match(body, /0\.25\.0-step023a/); }
  const baseline = JSON.parse(await read("config/current-accepted-baseline.json"));
  assert.equal(baseline.step, "STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE"); assert.equal(baseline.version, "0.21.3-step021br2"); assert.equal(baseline.stateSchema, 24);
  const roadmap = await read("docs/plans/STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE.md"); assert.match(roadmap, /Mattermost.*PREPARING|MATTERMOST_CONNECTOR=PREPARING/);
});
