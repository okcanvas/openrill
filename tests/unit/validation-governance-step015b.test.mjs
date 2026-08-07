import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

test("STEP015B keeps Docker live promotion separate from source/package acceptance", async () => {
  const plan = await read("docs/plans/STEP015B_PROCESS_TOOL_DOCKER_BACKEND_INTEGRATION_AND_LIVE_CONFINEMENT.md");
  assert.match(plan, /Docker live promotion/);
  assert.match(plan, /Local source acceptance does not claim Docker live/);
  assert.match(plan, /browser=NOT_IN_SCOPE/);
});

test("STEP015B acceptance contains no browser stage and requires an explicit live flag", async () => {
  const runner = await read("scripts/run_step015b_acceptance.py");
  const stages = runner.slice(runner.indexOf("BASE_STAGES:"), runner.indexOf("def read_utf8"));
  assert.doesNotMatch(stages, /chromium|playwright|control-ui|browser-live/i);
  assert.match(runner, /--require-docker-live/);
  assert.match(runner, /OPENRILL_STEP015B_DOCKER_IMAGE/);
  assert.match(runner, /DOCKER_LIVE_PENDING/);
});

test("OR-ISSUE-197 is retained as a Product integration failure asset and gate", async () => {
  const issue = await read("reference/validation/STEP015B_OR_ISSUE_197.md");
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates = await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  assert.match(issue, /OR-ISSUE-197/);
  assert.match(issue, /workspace-root cwd/);
  assert.match(registry, /OR-ISSUE-197/);
  assert.match(gates, /OR-ISSUE-197/);
});

test("STEP015B immutable real-Docker evidence remains accepted after later baseline promotion", async () => {
  const current = JSON.parse(await read("config/current-accepted-baseline.json"));
  const evidence = await read("reference/validation/STEP015B_WINDOWS_DOCKER_LIVE_ACCEPTANCE.md");
  assert.equal(current.acceptanceModel, "DIMENSIONAL");
  assert.match(evidence, /STEP015B_PROCESS_TOOL_DOCKER_BACKEND_INTEGRATION_AND_LIVE_CONFINEMENT/);
  assert.match(evidence, /checks=64\/64 state=PASSED/);
  assert.match(evidence, /docker_live=PASSED/);
  assert.match(evidence, /promotion=READY/);
  assert.match(evidence, /1990b189166a2547e0ae5aa81479591914b302e816bb088fd56e4a44f9ffd4db/);
});

test("STEP015B time ledger preserves unknown human effort and records measured automation only", async () => {
  const plan = await read("docs/plans/STEP015B_PROCESS_TOOL_DOCKER_BACKEND_INTEGRATION_AND_LIVE_CONFINEMENT.md");
  assert.match(plan, /started_at=2026-08-04T21:38:00\+09:00/);
  assert.match(plan, /human_work_minutes=NOT_RECORDED/);
  assert.match(plan, /automated_run_seconds=(?:TO_BE_MEASURED|\d+\.\d+)/);
});


test("OR-ISSUE-198 keeps zero-dist execution-backend build order explicit", async () => {
  const config = JSON.parse(await read("tsconfig.build.json"));
  const paths = config.references.map((entry) => entry.path);
  const sandbox = paths.indexOf("packages/sandbox");
  const docker = paths.indexOf("packages/sandbox-docker");
  const processTools = paths.indexOf("packages/tools-process");
  const host = paths.indexOf("services/agent-host");
  assert.ok(sandbox >= 0 && sandbox < docker);
  assert.ok(docker < processTools);
  assert.ok(processTools < host);
  const issue = await read("reference/validation/STEP015B_OR_ISSUE_198.md");
  assert.match(issue, /OR-ISSUE-198/);
  assert.match(issue, /stale sandbox output/);
});


test("OR-ISSUE-199 prevents historical tests from freezing extensible current config objects", async () => {
  const historical = await read("tests/unit/approval-timeout-separation-step011r5.test.mjs");
  assert.doesNotMatch(historical, /deepEqual\(config\.execution/);
  for (const field of ["approvalMode", "defaultTimeoutMs", "approvalTimeoutMs"]) {
    assert.match(historical, new RegExp(`config\\.execution\\.${field}`));
  }
  const issue = await read("reference/validation/STEP015B_OR_ISSUE_199.md");
  assert.match(issue, /OR-ISSUE-199/);
  assert.match(issue, /complete execution config object/);
});


test("OR-ISSUE-200 separates historical migration ownership from current schema ownership", async () => {
  const historical = await read("tests/unit/delegation-nested-recovery-boundaries-step014c.test.mjs");
  assert.doesNotMatch(historical, /OPENRILL_STATE_SCHEMA_VERSION = 14 as const/);
  assert.match(historical, /1\[4-9\]/);
  assert.match(historical, /014_delegation_reservation_release_and_recovery\.sql/);
  const issue = await read("reference/validation/STEP015B_OR_ISSUE_200.md");
  assert.match(issue, /OR-ISSUE-200/);
  assert.match(issue, /mutable current State schema/);
});


test("OR-ISSUE-201 sweeps exact schema-14 ownership across historical tests", async () => {
  const unitRoot = new URL("./", import.meta.url);
  const entries = await readdir(unitRoot, { withFileTypes: true });
  const offenders = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".test.mjs") || entry.name === "validation-governance-step015b.test.mjs") continue;
    const body = await read(`tests/unit/${entry.name}`);
    if (/assert\.match\([^;]*OPENRILL_STATE_SCHEMA_VERSION = 14 as const/.test(body) ||
        /assert\.(?:equal|strictEqual)\([^)]*schemaVersion\s*,\s*14\)/.test(body) ||
        /appliedMigrations\.at\(-1\)\.name[^;]*delegation_reservation_release_and_recovery/.test(body)) {
      offenders.push(entry.name);
    }
  }
  assert.deepEqual(offenders, []);
  const issue = await read("reference/validation/STEP015B_OR_ISSUE_201.md");
  assert.match(issue, /OR-ISSUE-201/);
  assert.match(issue, /repository-wide search/i);
});


test("OR-ISSUE-202 keeps immutable accepted-baseline evidence in current root handoff documents", async () => {
  const accepted = JSON.parse(await read("config/current-accepted-baseline.json"));
  for (const relative of ["README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"]) {
    const body = await read(relative);
    assert.match(body, new RegExp(accepted.checks.replace("/", "\\/")), relative);
    assert.match(body, new RegExp(accepted.zipSha256), relative);
  }
  const issue = await read("reference/validation/STEP015B_OR_ISSUE_202.md");
  assert.match(issue, /OR-ISSUE-202/);
});


test("OR-ISSUE-203 prevents full-id versus short-id stale-prune false failures", async () => {
  const live = await read("scripts/run-step015b-docker-live.mjs");
  const helper = await read("scripts/lib/docker-container-id-evidence.mjs");
  const issue = await read("reference/validation/STEP015B_OR_ISSUE_203.md");
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates = await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  assert.match(live, /sameDockerContainerId/);
  assert.match(live, /--no-trunc/);
  assert.match(live, /staleRemaining\.stdout\.trim\(\) === ""/);
  assert.match(helper, /startsWith/);
  assert.match(issue, /OR-ISSUE-203/);
  assert.match(issue, /full container ID/i);
  assert.match(registry, /OR-ISSUE-203/);
  assert.match(gates, /OR-ISSUE-203/);
});
