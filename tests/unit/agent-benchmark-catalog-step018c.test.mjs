import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildBenchmarkCatalog,
  parseBenchmarkScenario,
  parseBenchmarkTaxonomy,
  resolveBenchmarkProfile,
} from "../../packages/agent-benchmark/dist/index.js";

const ROOT = new URL("../../", import.meta.url);

async function loadCatalog() {
  const root = new URL("benchmarks/agent-tasks/", ROOT);
  const index = JSON.parse(await readFile(new URL("index.json", root), "utf8"));
  const entries = await Promise.all(index.scenarioFiles.map(async (relative) => ({
    sourcePath: join("benchmarks", "agent-tasks", relative).replaceAll("\\", "/"),
    value: JSON.parse(await readFile(new URL(relative, root), "utf8")),
  })));
  const catalog = buildBenchmarkCatalog(entries);
  const taxonomy = parseBenchmarkTaxonomy(JSON.parse(await readFile(new URL("taxonomy.json", root), "utf8")));
  return { catalog, taxonomy };
}

function scenario(overrides = {}) {
  return {
    id: "fixture-scenario",
    title: "Fixture scenario",
    category: "fixture",
    risk: "low",
    executor: "fixture-executor",
    coverage: { primary: ["fixture.primary"], secondary: ["fixture.secondary"] },
    capabilities: ["fixture.tool"],
    objective: "Exercise one deterministic fixture behavior.",
    successCriteria: ["The fixture passes."],
    budget: { maxDurationMs: 1000, maxTurns: 2, maxModelCalls: 2, maxToolCalls: 2, maxTotalTokens: 100 },
    defaultRepetitions: 2,
    ...overrides,
  };
}

test("STEP018C catalog resolves ten single-behavior scenarios with complete primary coverage", async () => {
  const { catalog, taxonomy } = await loadCatalog();
  const selected = resolveBenchmarkProfile(catalog, taxonomy, "agent-core");
  assert.equal(catalog.length, 10);
  assert.equal(selected.length, 10);
  const primary = selected.flatMap((item) => item.coverage.primary);
  assert.equal(new Set(primary).size, 10);
  assert.deepEqual(new Set(primary), new Set(taxonomy.profiles["agent-core"].coverageIds));
  assert.equal(selected.every((item) => item.coverage.primary.length === 1), true);
});

test("STEP018C catalog rejects duplicate scenario and primary coverage ownership", () => {
  assert.throws(() => buildBenchmarkCatalog([
    { sourcePath: "a.json", value: scenario() },
    { sourcePath: "b.json", value: scenario({ title: "Duplicate" }) },
  ]), /duplicate benchmark scenario id/);
  assert.throws(() => buildBenchmarkCatalog([
    { sourcePath: "a.json", value: scenario() },
    { sourcePath: "b.json", value: scenario({ id: "fixture-second", coverage: { primary: ["fixture.primary"], secondary: ["fixture.other"] } }) },
  ]), /duplicate primary coverage owner/);
});

test("STEP018C scenario parser fails closed on invalid identifiers and budgets", () => {
  assert.throws(() => parseBenchmarkScenario(scenario({ id: "INVALID" })), /invalid scenario id/);
  assert.throws(() => parseBenchmarkScenario(scenario({ coverage: { primary: ["not-valid"], secondary: [] } })), /invalid identifier/);
  assert.throws(() => parseBenchmarkScenario(scenario({ budget: { ...scenario().budget, maxDurationMs: 0 } })), /budget\.maxDurationMs/);
});

test("STEP018C taxonomy rejects uncovered semantic coverage", () => {
  const catalog = buildBenchmarkCatalog([{ sourcePath: "fixture.json", value: scenario() }]);
  const taxonomy = parseBenchmarkTaxonomy({ schemaVersion: 1, profiles: { "agent-core": { coverageIds: ["fixture.primary", "fixture.missing"] } } });
  assert.throws(() => resolveBenchmarkProfile(catalog, taxonomy, "agent-core"), /uncovered primary coverage: fixture\.missing/);
});
