import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = async (path) => await readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const STEP = "STEP019B_DETACHED_RUN_AND_HOST_RESTART_AUTO_RESUME_FOUNDATION";
const VERSION = "0.19.1-step019b";
const SHA = "9b9a9f4fc1eea913b4cc42bfd698e367bbfd71945ccb5c02db8e82bca831f6fc";

test("STEP019B owns immutable Windows acceptance evidence instead of mutable current identity", async () => {
  const evidence = await read("reference/validation/STEP019B_WINDOWS_DETACHED_LIVE_ACCEPTANCE.md");
  assert.match(evidence, new RegExp(STEP));
  assert.match(evidence, new RegExp(VERSION.replaceAll(".", "\\.")));
  assert.match(evidence, /checks=36\/36/);
  assert.match(evidence, /windows_detached_live=PASSED/);
  assert.match(evidence, /STEP019B_H1_DETACHED_PROTOCOL_HOST_RESTART_AUTO_RESUME/);
  assert.match(evidence, new RegExp(SHA));
  assert.match(evidence, /not reconstructed/i);
});

test("STEP019B source retains durable CREATED root discovery and fresh Attempt preparation", async () => {
  const repository = await read("packages/state/src/conversation-repository.ts");
  const service = await read("packages/conversations/src/service.ts");
  assert.match(repository, /listCreatedRuns\(\)/);
  assert.match(repository, /status='CREATED'/);
  assert.match(service, /prepareExecutionAttempt\(runId: string\)/);
  assert.match(service, /run\.attempt\.prepared/);
  assert.match(service, /previousAttemptId/);
  assert.match(service, /runnableRunIds\(\)/);
  assert.match(service, /interruptExecution\(runId: string/);
  assert.match(service, /checkpointRecoverable \? "CREATED" : "FAILED"/);
  assert.match(service, /HOST_SHUTDOWN/);
});

test("STEP019B Kernel and Coordinator retain Host interruption versus operator cancellation", async () => {
  const types = await read("packages/agent-kernel/src/types.ts");
  const errors = await read("packages/agent-kernel/src/errors.ts");
  const kernel = await read("packages/agent-kernel/src/kernel.ts");
  const coordinator = await read("services/agent-host/src/run-coordinator.ts");
  assert.match(types, /OPENRILL_AGENT_HOST_SHUTDOWN/);
  assert.match(types, /"INTERRUPTED"/);
  assert.match(errors, /AGENT_HOST_SHUTDOWN/);
  assert.match(kernel, /interruptExecution\(options\.runId, "HOST_SHUTDOWN"\)/);
  assert.match(kernel, /HOST_SHUTDOWN_RESUMABLE/);
  assert.match(kernel, /AGENT_CANCELLED/);
  assert.match(coordinator, /prepareExecutionAttempt\(runId\)/);
  assert.ok(coordinator.indexOf("prepareExecutionAttempt(runId)") < coordinator.indexOf("resolveRunPreparation?.(runId)"));
  assert.match(coordinator, /abort\(AGENT_HOST_SHUTDOWN_ABORT_REASON\)/);
  assert.match(coordinator, /result\.status === "INTERRUPTED"/);
});

test("STEP019B Host startup retains root auto-scheduling without stealing Delegation ownership", async () => {
  const host = await read("services/agent-host/src/lifecycle.ts");
  assert.match(host, /conversations\.recoverIncompleteRuns\(\)/);
  assert.match(host, /conversations\.runnableRunIds\(\)/);
  assert.match(host, /budget\?\.parentRunId/);
  assert.match(host, /delegations\.waitState\(runId\)/);
  assert.match(host, /runCoordinator\.ensureScheduled\(runId\)/);
});

test("STEP019B approval resume retains read-only Goal context", async () => {
  const goals = await read("packages/goals/src/service.ts");
  const host = await read("services/agent-host/src/lifecycle.ts");
  assert.match(goals, /readContext\(input:/);
  assert.match(host, /execution\.run\.status === "WAITING_APPROVAL"/);
  assert.match(host, /goalService\?\.readContext/);
  assert.match(host, /goalService\?\.prepareContext/);
});

test("STEP019B focused Product evidence remains executable", async () => {
  const unit = await read("tests/unit/detached-run-resume-step019b.test.mjs");
  const host = await read("tests/unit/detached-host-resume-step019b.test.mjs");
  assert.match(unit, /CREATED/);
  assert.match(unit, /RESUMABLE/);
  assert.match(unit, /toolExecutions, 1/);
  assert.match(unit, /operator cancellation remains terminal/);
  assert.match(host, /conversation\.send/);
  assert.match(host, /client\.close\(\)/);
  assert.match(host, /await host\.close\("step019b-live-restart"\)/);
  assert.match(host, /conversation\.get/);
  assert.doesNotMatch(host, /conversation\.execute/);
  assert.match(host, /sourceAttemptId/);
});

test("STEP019B records OR-ISSUE-230 through OR-ISSUE-232 and recurrence gates", async () => {
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates = await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  for (const number of [230, 231, 232]) {
    const token = `OR-ISSUE-${number}`;
    const issue = await read(`reference/validation/STEP019B_${token.replaceAll("-", "_")}.md`);
    for (const body of [issue, registry, gates]) assert.match(body, new RegExp(token));
  }
});

test("STEP019B retained runners own immutable STEP identity", async () => {
  for (const file of [
    "scripts/run_step019b_acceptance.py",
    "scripts/run-step019b-detached-live.mjs",
    "scripts/package_step019b.py",
  ]) {
    const body = await read(file);
    assert.match(body, new RegExp(STEP));
    assert.match(body, new RegExp(VERSION.replaceAll(".", "\\.")));
  }
});

test("STEP019B plan retains narrow restart-safe scope", async () => {
  const plan = await read("docs/plans/STEP019B_DETACHED_RUN_AND_HOST_RESTART_AUTO_RESUME_FOUNDATION.md");
  assert.match(plan, /needs no migration/i);
  assert.match(plan, /not a general workflow engine/i);
  assert.match(plan, /arbitrary instruction-pointer checkpoint/i);
  assert.match(plan, /external model, Browser live, Mattermost and Connector/i);
});

test("STEP019B historical governance does not freeze mutable package, baseline, or schema", async () => {
  const source = await read("tests/unit/validation-governance-step019b.test.mjs");
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const migrations = await read("packages/state/src/migrations.ts");
  assert.doesNotMatch(source, /JSON\.parse\(await read\("package\.json"\)\)/);
  assert.doesNotMatch(source, /JSON\.parse\(await read\("config\/current-accepted-baseline\.json"\)\)/);
  assert.match(registry, /OR-ISSUE-208 recurrence note — STEP020A/);
  const match = migrations.match(/OPENRILL_STATE_SCHEMA_VERSION = (\d+)/);
  assert.ok(match);
  assert.ok(Number(match[1]) >= 17);
});
