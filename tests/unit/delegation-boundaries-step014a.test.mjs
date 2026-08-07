import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("../../", import.meta.url);
const text = async (relative) => readFile(new URL(relative, ROOT), "utf8");

async function filesUnder(relative) {
  const root = new URL(relative, ROOT);
  const out = [];
  async function walk(url, prefix = "") {
    for (const entry of await readdir(url, { withFileTypes: true })) {
      if (["dist", "node_modules", ".artifacts"].includes(entry.name)) continue;
      const next = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, url);
      const name = join(prefix, entry.name).replaceAll("\\", "/");
      if (entry.isDirectory()) await walk(next, name);
      else out.push([name, await readFile(next, "utf8")]);
    }
  }
  await walk(root);
  return out;
}

test("STEP014A owns schema 12 and immutable delegation foundation tables", async () => {
  const migrations = await text("packages/state/src/migrations.ts");
  const sql = await text("packages/state/migrations/012_delegation_graph_budget_foundation.sql");
  const currentSchema = Number(/OPENRILL_STATE_SCHEMA_VERSION = (\d+) as const/.exec(migrations)?.[1]);
  assert.ok(currentSchema >= 12);
  for (const table of ["run_budget_envelopes", "run_delegations", "run_delegation_events", "run_delegation_waits"]) {
    assert.ok(sql.includes(`CREATE TABLE ${table}`), table);
  }
  assert.ok(sql.includes("state TEXT NOT NULL CHECK (state = 'WAITING_DELEGATION')"));
  assert.ok(sql.includes("task_sha256"));
  assert.equal(/task_(?:text|json)|raw_task|prompt_json/i.test(sql), false);
});

test("observed budget evidence is not rejected by ceiling CHECKs", async () => {
  const sql = await text("packages/state/migrations/012_delegation_graph_budget_foundation.sql");
  for (const forbidden of [
    "used_turns <= max_turns",
    "used_model_calls <= max_model_calls",
    "used_tool_calls <= max_tool_calls",
    "used_input_tokens + used_output_tokens <= max_total_tokens",
  ]) assert.equal(sql.includes(forbidden), false, forbidden);
  const conversations = await text("packages/state/src/conversation-repository.ts");
  const matches = conversations.match(/SELECT COALESCE\(SUM\(used_turns\),0\) turns/g) ?? [];
  assert.equal(matches.length, 2);
});

test("delegation service owns atomic identity, scope subset, transitions, waits, and cancellation order", async () => {
  const source = await text("packages/conversations/src/delegation.ts");
  for (const token of [
    "DELEGATION_SCOPE_ESCALATION", "DELEGATION_DEPTH_EXCEEDED", "DELEGATION_ACTIVE_CHILD_LIMIT",
    "DELEGATION_TOTAL_CHILD_LIMIT", "DELEGATION_BUDGET_EXCEEDED", "DELEGATION_TIME_BUDGET_EXCEEDED",
    "transitionDelegation", "cancellationOrder", "WAITING_DELEGATION", "taskSha256",
  ]) assert.ok(source.includes(token), token);
  assert.ok(source.includes("this.options.state.transaction"));
});

test("Agent Kernel owns cumulative token and wall-clock enforcement", async () => {
  const kernel = await text("packages/agent-kernel/src/kernel.ts");
  const errors = await text("packages/agent-kernel/src/errors.ts");
  assert.ok(kernel.includes("maxTotalTokens"));
  assert.ok(kernel.includes("maxDurationMs"));
  assert.ok(kernel.includes("AGENT_TOTAL_TOKEN_BUDGET_EXCEEDED"));
  assert.ok(kernel.includes("AGENT_TIME_BUDGET_EXCEEDED"));
  assert.ok(errors.includes("AGENT_TOTAL_TOKEN_BUDGET_EXCEEDED"));
  assert.ok(errors.includes("AGENT_TIME_BUDGET_EXCEEDED"));
  assert.ok(kernel.includes("options.conversations.currentTime()"));
});

test("STEP014A historical exclusion remains documented without freezing the current Tool surface", async () => {
  const plan = await text("docs/plans/STEP014A_DURABLE_DELEGATION_GRAPH_BUDGET_ENVELOPE_AND_WAIT_STATE_FOUNDATION.md");
  assert.ok(plan.includes("agent.spawn"));
  assert.ok(plan.includes("agent.wait"));
  assert.match(plan, /excluded|제외|not added/i);
  const browserTools = [...(await text("packages/browser-runtime/src/tools.ts")).matchAll(/tool\(\s*"(browser\.[a-z]+)"/g)].map((m) => m[1]);
  assert.equal(browserTools.length, 15);
});

test("accepted baseline and current package identities are separate and exact", async () => {
  const accepted = JSON.parse(await text("config/current-accepted-baseline.json"));
  assert.equal(typeof accepted.step, "string");
  assert.equal(typeof accepted.version, "string");
  assert.equal(typeof accepted.checks, "string");
  assert.match(accepted.zipSha256, /^[a-f0-9]{64}$/);
  assert.equal(typeof accepted.evidence, "string");
  const rootPackage = JSON.parse(await text("package.json"));
  const generator = await text("scripts/generate_package_manifest.py");
  const verifier = await text("scripts/verify_package_manifest.py");
  for (const source of [generator, verifier]) {
    assert.ok(source.includes(`VERSION = "${rootPackage.version}"`));
  }
});

test("OpenClaw delegated-work evidence is pinned without source coupling", async () => {
  const audit = await text("reference/openclaw/STEP014A_DELEGATED_WORK_SOURCE_AUDIT.md");
  for (const hash of [
    "1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82",
    "9fa23d8651e2991bf224676a7ceda7cc960ad3e1ddced721670040b8b48b90df",
    "30126778789afb1b6923a83b0df364f180e9dc64224c6059b459ba758d7b9918",
    "c51a30ccd51b3bc0b2de522eb46ac019f4f1de6f960b95fdde77090e5d2e5b80",
    "39c8e0047e7cb83762d74f3958d7edd5b1660022a2732e70195227f12ba95985",
  ]) assert.ok(audit.includes(hash), hash);
  const imports = (await filesUnder("packages/")).filter(([, body]) => /from\s+["'][^"']*openclaw|require\([^)]*openclaw/i.test(body));
  assert.deepEqual(imports, []);
});

test("OR-ISSUE-122 through OR-ISSUE-128 are documented and gated", async () => {
  const registry = await text("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates = await text("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  for (const issue of ["OR-ISSUE-122", "OR-ISSUE-123", "OR-ISSUE-124", "OR-ISSUE-125", "OR-ISSUE-126", "OR-ISSUE-127", "OR-ISSUE-128"]) {
    assert.ok(registry.includes(issue));
    assert.ok(gates.includes(issue));
  }
  assert.ok((await text("reference/validation/STEP014A_BUDGET_OVERSHOOT_EVIDENCE_CONSTRAINT.md")).includes("AGENT_TOTAL_TOKEN_BUDGET_EXCEEDED"));
  assert.ok((await text("reference/validation/STEP014A_RESTART_ATTEMPT_TURN_AGGREGATION.md")).includes("SUM"));
  assert.ok((await text("reference/validation/STEP014A_HISTORICAL_CURRENT_IDENTITY_OWNERSHIP_DRIFT.md")).includes("mutable current"));
  assert.ok((await text("reference/validation/STEP014A_LEGACY_EXECUTION_BUDGET_DEFAULT_ALIGNMENT.md")).includes("65,536"));
  assert.ok((await text("reference/validation/STEP014A_DURABLE_DEADLINE_CLOCK_DOMAIN_ALIGNMENT.md")).includes("currentTime"));
  assert.ok((await text("reference/validation/STEP014A_ACCEPTANCE_RUNNER_SOURCE_INVENTORY_ALIGNMENT.md")).includes("registry.ts"));
  assert.ok((await text("reference/validation/STEP014A_CANONICAL_TEST_FILE_ENUMERATION.md")).includes("UNIT_TEST_FILES"));
});

test("STEP014A acceptance source predicates derive existing Tool Runtime files", async () => {
  const runner = await text("scripts/run_step014a_acceptance.py");
  assert.equal(runner.includes('read_utf8("packages/tool-runtime/src/registry.ts")'), false);
  assert.match(runner, /\(ROOT \/ "packages\/tool-runtime\/src"\)\.glob\("\*\.ts"\)/);
  const staticReads = [...runner.matchAll(/read_utf8\("([^"]+)"\)/g)].map((match) => match[1]);
  for (const relative of staticReads) {
    await assert.doesNotReject(() => text(relative), relative);
  }
});

test("STEP014A canonical stage expands sorted unit files without shell wildcard semantics", async () => {
  const runner = await text("scripts/run_step014a_acceptance.py");
  assert.match(runner, /UNIT_TEST_FILES = \[path\.relative_to\(ROOT\)\.as_posix\(\) for path in sorted\(/);
  const canonicalLine = runner.split("\n").find((line) => line.includes('("canonical-suite"')) ?? "";
  assert.ok(canonicalLine.includes("*UNIT_TEST_FILES"));
  assert.equal(canonicalLine.includes("tests/unit/*.test.mjs"), false);
});
