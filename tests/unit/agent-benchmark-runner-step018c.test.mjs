import test from "node:test";
import assert from "node:assert/strict";
import {
  formatBenchmarkJson,
  formatBenchmarkMarkdown,
  parseBenchmarkScenario,
  runBenchmarkSuite,
} from "../../packages/agent-benchmark/dist/index.js";

function scenario(overrides = {}) {
  return parseBenchmarkScenario({
    id: "runner-fixture",
    title: "Runner fixture",
    category: "fixture",
    risk: "low",
    executor: "runner-executor",
    coverage: { primary: ["fixture.runner"], secondary: ["fixture.proof"] },
    capabilities: ["fixture.execute"],
    objective: "Measure deterministic runner behavior.",
    successCriteria: ["The attempt is classified correctly."],
    budget: { maxDurationMs: 1000, maxTurns: 2, maxModelCalls: 2, maxToolCalls: 2, maxTotalTokens: 100 },
    defaultRepetitions: 2,
    ...overrides,
  });
}

const usage = { turns: 1, inputTokens: 4, outputTokens: 2, modelCalls: 1, toolCalls: 1 };

test("STEP018C runner aggregates repetitions, usage, reliability, and stable evidence digests", async () => {
  const result = await runBenchmarkSuite({
    profileId: "agent-core",
    scenarios: [scenario()],
    repetitions: 2,
    executors: { "runner-executor": async ({ repetition }) => ({ assertions: [{ name: "fixture.pass", passed: true }], usage, evidence: [{ kind: "fixture", label: "proof", value: { repetition } }] }) },
  });
  assert.equal(result.status, "PASS");
  assert.equal(result.attemptCount, 2);
  assert.equal(result.reliability, 1);
  assert.deepEqual(result.usage, { turns: 2, inputTokens: 8, outputTokens: 4, modelCalls: 2, toolCalls: 2 });
  assert.match(result.scenarios[0].attempts[0].evidence[0].sha256, /^[a-f0-9]{64}$/);
  assert.notEqual(result.scenarios[0].attempts[0].evidence[0].sha256, result.scenarios[0].attempts[1].evidence[0].sha256);
});

test("STEP018C runner classifies assertion and budget failures without a model judge", async () => {
  const assertion = await runBenchmarkSuite({
    profileId: "agent-core",
    scenarios: [scenario()],
    repetitions: 1,
    executors: { "runner-executor": async () => ({ assertions: [{ name: "fixture.expected", passed: false, detail: "missing" }], usage }) },
  });
  assert.equal(assertion.scenarios[0].attempts[0].failure.class, "ASSERTION");
  assert.equal(assertion.scenarios[0].attempts[0].failure.code, "fixture.expected");

  const budgetScenario = scenario({ budget: { maxDurationMs: 1000, maxTurns: 1, maxModelCalls: 1, maxToolCalls: 1, maxTotalTokens: 1 } });
  const budget = await runBenchmarkSuite({
    profileId: "agent-core",
    scenarios: [budgetScenario],
    repetitions: 1,
    executors: { "runner-executor": async () => ({ assertions: [{ name: "fixture.pass", passed: true }], usage }) },
  });
  assert.equal(budget.scenarios[0].attempts[0].failure.class, "BUDGET");
  assert.equal(budget.scenarios[0].attempts[0].failure.code, "budget.totalTokens");
});

test("STEP018C runner classifies runtime failures and continues with bounded evidence", async () => {
  const result = await runBenchmarkSuite({
    profileId: "agent-core",
    scenarios: [scenario()],
    repetitions: 1,
    executors: { "runner-executor": async () => { throw new Error("fixture runtime failure\nwith details"); } },
  });
  const attempt = result.scenarios[0].attempts[0];
  assert.equal(result.status, "FAIL");
  assert.equal(attempt.failure.class, "RUNTIME");
  assert.equal(attempt.failure.code, "SCENARIO_RUNTIME_ERROR");
  assert.equal(attempt.failure.message.includes("\n"), false);
  assert.equal(attempt.evidence.length, 0);
});

test("STEP018C share-safe reporters redact credentials while preserving status and digests", async () => {
  const secret = "Bearer STEP018C_TEST_SECRET_123456";
  const result = await runBenchmarkSuite({
    profileId: "agent-core",
    scenarios: [scenario()],
    repetitions: 1,
    executors: { "runner-executor": async () => ({ assertions: [{ name: "fixture.pass", passed: true, detail: secret }], usage, evidence: [{ kind: "fixture", label: "proof", value: { secret } }] }) },
  });
  const json = formatBenchmarkJson(result, [secret]);
  const markdown = formatBenchmarkMarkdown(result, [secret]);
  for (const artifact of [json, markdown]) {
    assert.equal(artifact.includes(secret), false);
    assert.equal(artifact.includes("PASS"), true);
  }
  assert.equal(json.includes("[REDACTED]"), true);
  assert.match(json, /"sha256": "[a-f0-9]{64}"/);
});
