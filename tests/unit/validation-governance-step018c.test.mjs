import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = async (path) => await readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const STEP = "STEP018C_AGENT_TASK_CAPABILITY_BENCHMARK";
const VERSION = "0.18.2-step018c";
const BASELINE = "STEP018B_SKILL_OPERATIONS_AND_STRUCTURED_TOOL_DISCOVERY";
const CHECKS = "WINDOWS_AGENT_CAPABILITY_32/32";
const SHA = "1cbe66542c9a41a71567e9c7b0978cbc5ba7afba906ebe158721d7c1b2bc2831";

test("STEP018C owns immutable Windows acceptance evidence without freezing mutable current identity", async () => {
  const evidence = await read("reference/validation/STEP018C_WINDOWS_AGENT_BENCHMARK_LIVE_ACCEPTANCE.md");
  assert.match(evidence, /STEP018C_AGENT_TASK_CAPABILITY_BENCHMARK/);
  assert.match(evidence, /version=0\.18\.2-step018c/);
  assert.match(evidence, /checks=36\/36 state=PASSED/);
  assert.match(evidence, /WINDOWS_AGENT_BENCHMARK_36\/36/);
  assert.match(evidence, /ebc745a8f109cc4dc6cc3d37ea9992adfeb0a7fb3d49920bc22892110a07809d/);
});

test("STEP018C OpenClaw audit cites exact benchmark answer-key paths and hashes", async () => {
  const audit = await read("docs/research/OPENCLAW_PERSONAL_AGENT_BENCHMARK_PACK_CODE_AUDIT.md");
  for (const path of [
    "docs/concepts/personal-agent-benchmark-pack.md",
    "qa/scenarios/personal/approval-denial-stop.yaml",
    "qa/scenarios/personal/memory-preference-recall.yaml",
    "qa/scenarios/personal/no-fake-progress.yaml",
    "extensions/qa-lab/src/scenario.ts",
    "extensions/qa-lab/src/self-check-scenario.ts",
  ]) assert.match(audit, new RegExp(path.replaceAll("/", "\\/").replaceAll(".", "\\.")));
  for (const digest of [
    "1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82",
    "832e5ab0ba9052f161bcef35a5445dc32efc46e796574397e154be70ea608341",
    "bb79f06d3f69f5c33c94612cf3ac9e807e4f0ff425ec4f3f203702e996beb8a8",
  ]) assert.match(audit, new RegExp(digest));
  assert.match(audit, /imports no OpenClaw Product dependency/i);
});

test("STEP018C catalog and taxonomy own ten unique primary semantic behaviors", async () => {
  const index = JSON.parse(await read("benchmarks/agent-tasks/index.json"));
  const taxonomy = JSON.parse(await read("benchmarks/agent-tasks/taxonomy.json"));
  assert.equal(index.scenarioFiles.length, 10);
  assert.equal(taxonomy.profiles["agent-core"].coverageIds.length, 10);
  assert.equal(new Set(taxonomy.profiles["agent-core"].coverageIds).size, 10);
});

test("STEP018C runner uses deterministic local scoring, budgets, evidence digests and redaction", async () => {
  const runner = await read("packages/agent-benchmark/src/runner.ts");
  const report = await read("packages/agent-benchmark/src/report.ts");
  assert.match(runner, /BenchmarkFailureClass/);
  assert.match(runner, /ASSERTION_FAILED|ASSERTION/);
  assert.match(runner, /budget\.duration/);
  assert.match(runner, /createHash\("sha256"\)/);
  assert.match(report, /sanitizeShareSafeText/);
  assert.match(report, /PRIVATE KEY/);
  assert.equal(runner.includes("llm judge"), false);
});

test("STEP018C executes actual accepted Product services with a scripted local model", async () => {
  const scenarios = await read("scripts/agent-task-benchmark-scenarios.mjs");
  for (const token of ["openOpenRillStateDatabase", "ConversationService", "executeAgentRun", "ApprovalService", "MemoryService", "ToolRegistry", "registerToolDiscoveryTools", "createScriptedModelAdapter"]) assert.match(scenarios, new RegExp(token));
  assert.match(scenarios, /snapshotRequest/);
  assert.equal(scenarios.includes("OpenAI"), false);
});

test("STEP018C records OR-ISSUE-224 temporal request snapshot prevention", async () => {
  const issue = await read("reference/validation/STEP018C_OR_ISSUE_224.md");
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates = await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  const source = await read("scripts/agent-task-benchmark-scenarios.mjs");
  for (const body of [issue, registry, gates]) assert.match(body, /OR-ISSUE-224/);
  assert.match(source, /requests\.push\(snapshotRequest\(request\)\)/);
  assert.match(source, /toolCallId === "describe"/);
});

test("STEP018C records OR-ISSUE-225 authoritative Workspace fixture prevention", async () => {
  const issue = await read("reference/validation/STEP018C_OR_ISSUE_225.md");
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates = await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  const source = await read("scripts/agent-task-benchmark-scenarios.mjs");
  for (const body of [issue, registry, gates]) assert.match(body, /OR-ISSUE-225/);
  assert.match(issue, /FAIL_CLOSED_CORRECT/);
  assert.match(source, /repositories\.workspaces\.upsertWorkspace/);
});

test("STEP018C historical STEP018B governance no longer freezes mutable current identity", async () => {
  const historical = await read("tests/unit/validation-governance-step018b.test.mjs");
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  assert.equal(historical.includes('assert.equal(pkg.version, "0.18.1-step018b")'), false);
  assert.equal(historical.includes('assert.equal(baseline.step, "STEP018A_'), false);
  assert.match(registry, /OR-ISSUE-208 recurrence note — STEP018C/);
});

test("STEP018C immutable handoff evidence retains its exact accepted identity", async () => {
  const evidence = await read("reference/validation/STEP018C_WINDOWS_AGENT_BENCHMARK_LIVE_ACCEPTANCE.md");
  const plan = await read("docs/plans/STEP018C_AGENT_TASK_CAPABILITY_BENCHMARK.md");
  for (const body of [evidence, plan]) assert.match(body, /STEP018C_AGENT_TASK_CAPABILITY_BENCHMARK/);
  assert.match(evidence, /checks=36\/36 state=PASSED/);
  assert.match(evidence, /ebc745a8f109cc4dc6cc3d37ea9992adfeb0a7fb3d49920bc22892110a07809d/);
});

test("STEP018C acceptance and live runners require repeated local benchmark evidence", async () => {
  const acceptance = await read("scripts/run_step018c_acceptance.py");
  const live = await read("scripts/run-step018c-agent-benchmark-live.mjs");
  assert.match(acceptance, /--require-windows-benchmark-live/);
  assert.match(acceptance, /windows-agent-benchmark-live/);
  assert.match(live, /--repetitions", "2"/);
  assert.match(live, /checks=20\\\/20 state=PASSED/);
  assert.match(live, /STEP018C_FAKE_SECRET/);
});

test("STEP018C deterministic package runner retains immutable historical identity", async () => {
  const pack = await read("scripts/package_step018c.py");
  assert.match(pack, /OPENRILL_STEP018C_PACKAGE_PASS/);
  const evidence = await read("reference/validation/STEP018C_LOCAL_SOURCE_PACKAGE_ACCEPTANCE.md");
  assert.match(evidence, /STEP018C_AGENT_TASK_CAPABILITY_BENCHMARK/);
});

test("STEP018C immutable plan explicitly defers unsupported live integrations and subjective judging", async () => {
  const plan = await read("docs/plans/STEP018C_AGENT_TASK_CAPABILITY_BENCHMARK.md");
  assert.match(plan, /no LLM judge/i);
  assert.match(plan, /Connector implementation without a real system contract/);
  assert.match(plan, /External model|external model/);
});
