import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = async (path) => await readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("STEP018B immutable Windows acceptance evidence remains exact after later promotion", async () => {
  const evidence = await read("reference/validation/STEP018B_WINDOWS_AGENT_CAPABILITY_LIVE_ACCEPTANCE.md");
  assert.match(evidence, /STEP018B_SKILL_OPERATIONS_AND_STRUCTURED_TOOL_DISCOVERY checks=32\/32 state=PASSED/);
  assert.match(evidence, /version=0\.18\.1-step018b schema=16/);
  assert.match(evidence, /1cbe66542c9a41a71567e9c7b0978cbc5ba7afba906ebe158721d7c1b2bc2831/);
});

test("STEP018B OpenClaw audit cites exact Skill and Tool Search source paths", async () => {
  const audit = await read("docs/research/OPENCLAW_SKILL_AND_TOOL_SEARCH_CODE_AUDIT.md");
  for (const path of [
    "src/cli/skills-cli.ts",
    "src/skills/discovery/status.ts",
    "src/skills/config/mutations.ts",
    "src/agents/tool-search-types.ts",
    "src/agents/tool-search.ts",
    "src/agents/tool-search-ranking.ts",
    "src/agents/tool-search-runtime.ts",
  ]) assert.match(audit, new RegExp(path.replaceAll("/", "\\/").replaceAll(".", "\\.")));
  assert.match(audit, /imports no OpenClaw Product dependency/i);
});

test("STEP018B Tool discovery controls use the existing registry and preserve delegated scope", async () => {
  const discovery = await read("packages/tool-discovery/src/index.ts");
  assert.match(discovery, /tool\.search/);
  assert.match(discovery, /tool\.describe/);
  assert.match(discovery, /tool\.call/);
  assert.match(discovery, /registry\.execute/);
  assert.match(discovery, /context\.allowedToolNames/);
  assert.match(discovery, /TOOL_CALL_RECURSION_DENIED/);
});

test("STEP018B Skill operations are profile-sensitive and atomic", async () => {
  const operations = await read("apps/agent-cli/src/skill-operations.ts");
  assert.match(operations, /resolveConfiguredProductToolNames/);
  assert.match(operations, /browserEnabled: loaded\.config\.browser\.enabled/);
  assert.match(operations, /writeOpenRillConfig/);
  assert.match(operations, /expectedRevision: loaded\.sourceRevision/);
});

test("STEP018B active Skill tools are promoted without changing child durable scope", async () => {
  const lifecycle = await read("services/agent-host/src/lifecycle.ts");
  const kernel = await read("packages/agent-kernel/src/kernel.ts");
  assert.match(lifecycle, /resolveToolDiscoveryView/);
  assert.match(lifecycle, /preferredToolNames/);
  assert.match(kernel, /allowedToolNames.*modelToolNames|modelToolNames.*allowedToolNames/s);
});

test("STEP018B records OR-ISSUE-220 and retains strict manifest parsing", async () => {
  const issue = await read("reference/validation/STEP018B_OR_ISSUE_220.md");
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates = await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  for (const body of [issue, registry, gates]) assert.match(body, /OR-ISSUE-220/);
  assert.match(issue, /correctly failed closed/i);
  assert.match(gates, /Browser-required Skills fail closed/);
});


test("STEP018B records Host runtime identity drift without owning later current version", async () => {
  const issue = await read("reference/validation/STEP018B_OR_ISSUE_221.md");
  const evidence = await read("reference/validation/STEP018B_WINDOWS_AGENT_CAPABILITY_LIVE_ACCEPTANCE.md");
  assert.match(issue, /OPENRILL_SOURCE_VERSION_ALIGNMENT_FAIL/);
  assert.match(evidence, /version=0\.18\.1-step018b/);
});

test("STEP018B records historical Skill preparation callback alignment", async () => {
  const issue = await read("reference/validation/STEP018B_OR_ISSUE_222.md");
  const historical = await read("tests/unit/skills-step010.test.mjs");
  assert.match(issue, /resolveSystemInstructions/);
  assert.match(historical, /resolveRunPreparation/);
  assert.equal(historical.includes("resolveSystemInstructions:"), false);
});


test("STEP018B preserves all accepted explicit Memory tools in the core direct set", async () => {
  const discovery = await read("packages/tool-discovery/src/index.ts");
  const issue = await read("reference/validation/STEP018B_OR_ISSUE_223.md");
  const direct = discovery.slice(discovery.indexOf("DEFAULT_DIRECT_TOOL_NAMES"), discovery.indexOf("] as const;", discovery.indexOf("DEFAULT_DIRECT_TOOL_NAMES")));
  for (const tool of ["memory.remember", "memory.search", "memory.get", "memory.forget"]) {
    assert.equal(direct.includes(`"${tool}"`), true);
    assert.equal(issue.includes(tool), true);
  }
});

test("STEP018B accepted identity remains dynamically visible in later root handoff documents", async () => {
  const baseline = JSON.parse(await read("config/current-accepted-baseline.json"));
  for (const file of ["README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"]) {
    const body = await read(file);
    assert.match(body, new RegExp(baseline.step));
    assert.match(body, new RegExp(baseline.zipSha256));
  }
});

test("STEP018B explicitly defers speculative Plugin and Connector breadth", async () => {
  const handoff = await read("HANDOFF.md");
  const plan = await read("docs/plans/STEP018B_SKILL_OPERATIONS_AND_STRUCTURED_TOOL_DISCOVERY.md");
  assert.match(handoff, /Plugin runtime are deferred|Plugin marketplace/);
  assert.match(handoff, /Mattermost and Connector work remains speculative and deferred/);
  assert.match(plan, /Plugin runtime or remote plugin installation/);
});
