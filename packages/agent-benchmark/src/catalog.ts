import type {
  BenchmarkBudget,
  BenchmarkCoverage,
  BenchmarkRisk,
  BenchmarkScenarioDefinition,
  BenchmarkTaxonomy,
} from "./types.js";

const ID_PATTERN = /^[a-z][a-z0-9-]{2,95}$/;
const COVERAGE_PATTERN = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;
const EXECUTOR_PATTERN = /^[a-z][a-z0-9-]{2,95}$/;
const RISKS = new Set<BenchmarkRisk>(["low", "medium", "high"]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, label: string, max = 500): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new TypeError(`${label} must contain 1-${max} characters`);
  }
  return value.trim();
}

function stringList(value: unknown, label: string, pattern?: RegExp): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError(`${label} must be a non-empty array`);
  const result = value.map((item, index) => text(item, `${label}[${index}]`, 300));
  if (new Set(result).size !== result.length) throw new TypeError(`${label} contains duplicates`);
  if (pattern && result.some((item) => !pattern.test(item))) throw new TypeError(`${label} contains an invalid identifier`);
  return result;
}

function positiveInteger(value: unknown, label: string, max: number): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > max) {
    throw new TypeError(`${label} must be an integer between 1 and ${max}`);
  }
  return Number(value);
}

function parseCoverage(value: unknown): BenchmarkCoverage {
  const source = record(value);
  if (!source) throw new TypeError("coverage must be an object");
  const primary = stringList(source.primary, "coverage.primary", COVERAGE_PATTERN);
  const secondary = source.secondary === undefined
    ? []
    : stringList(source.secondary, "coverage.secondary", COVERAGE_PATTERN);
  if (primary.some((item) => secondary.includes(item))) throw new TypeError("coverage primary and secondary overlap");
  return { primary, secondary };
}

function parseBudget(value: unknown): BenchmarkBudget {
  const source = record(value);
  if (!source) throw new TypeError("budget must be an object");
  return {
    maxDurationMs: positiveInteger(source.maxDurationMs, "budget.maxDurationMs", 900_000),
    maxTurns: positiveInteger(source.maxTurns, "budget.maxTurns", 128),
    maxModelCalls: positiveInteger(source.maxModelCalls, "budget.maxModelCalls", 128),
    maxToolCalls: positiveInteger(source.maxToolCalls, "budget.maxToolCalls", 256),
    maxTotalTokens: positiveInteger(source.maxTotalTokens, "budget.maxTotalTokens", 1_000_000),
  };
}

export function parseBenchmarkScenario(value: unknown, sourcePath = "<memory>"): BenchmarkScenarioDefinition {
  const source = record(value);
  if (!source) throw new TypeError(`benchmark scenario must be an object: ${sourcePath}`);
  const id = text(source.id, "id", 96);
  if (!ID_PATTERN.test(id)) throw new TypeError(`invalid scenario id: ${id}`);
  const risk = text(source.risk, "risk", 16) as BenchmarkRisk;
  if (!RISKS.has(risk)) throw new TypeError(`invalid risk: ${risk}`);
  const executor = text(source.executor, "executor", 96);
  if (!EXECUTOR_PATTERN.test(executor)) throw new TypeError(`invalid executor: ${executor}`);
  return {
    id,
    title: text(source.title, "title", 160),
    category: text(source.category, "category", 96),
    risk,
    executor,
    coverage: parseCoverage(source.coverage),
    capabilities: stringList(source.capabilities, "capabilities", /^[a-z][a-z0-9_.-]{1,127}$/),
    objective: text(source.objective, "objective", 1_000),
    successCriteria: stringList(source.successCriteria, "successCriteria"),
    budget: parseBudget(source.budget),
    defaultRepetitions: positiveInteger(source.defaultRepetitions, "defaultRepetitions", 20),
  };
}

export function buildBenchmarkCatalog(entries: readonly { readonly sourcePath: string; readonly value: unknown }[]): readonly BenchmarkScenarioDefinition[] {
  const scenarios = entries.map((entry) => parseBenchmarkScenario(entry.value, entry.sourcePath));
  const ids = new Set<string>();
  const primaryOwners = new Map<string, string>();
  for (const scenario of scenarios) {
    if (ids.has(scenario.id)) throw new TypeError(`duplicate benchmark scenario id: ${scenario.id}`);
    ids.add(scenario.id);
    for (const coverageId of scenario.coverage.primary) {
      const owner = primaryOwners.get(coverageId);
      if (owner) throw new TypeError(`duplicate primary coverage owner: ${coverageId} (${owner}, ${scenario.id})`);
      primaryOwners.set(coverageId, scenario.id);
    }
  }
  return [...scenarios].sort((left, right) => left.id.localeCompare(right.id));
}

export function parseBenchmarkTaxonomy(value: unknown): BenchmarkTaxonomy {
  const source = record(value);
  if (!source || source.schemaVersion !== 1) throw new TypeError("benchmark taxonomy schemaVersion must be 1");
  const rawProfiles = record(source.profiles);
  if (!rawProfiles || Object.keys(rawProfiles).length === 0) throw new TypeError("benchmark taxonomy profiles are required");
  const profiles: Record<string, { readonly coverageIds: readonly string[] }> = {};
  for (const [profileId, raw] of Object.entries(rawProfiles)) {
    if (!ID_PATTERN.test(profileId)) throw new TypeError(`invalid benchmark profile id: ${profileId}`);
    const profile = record(raw);
    if (!profile) throw new TypeError(`benchmark profile must be an object: ${profileId}`);
    profiles[profileId] = { coverageIds: stringList(profile.coverageIds, `${profileId}.coverageIds`, COVERAGE_PATTERN) };
  }
  return { schemaVersion: 1, profiles };
}

export function resolveBenchmarkProfile(
  catalog: readonly BenchmarkScenarioDefinition[],
  taxonomy: BenchmarkTaxonomy,
  profileId: string,
): readonly BenchmarkScenarioDefinition[] {
  const profile = taxonomy.profiles[profileId];
  if (!profile) throw new TypeError(`benchmark profile not found: ${profileId}`);
  const selected = catalog.filter((scenario) => scenario.coverage.primary.some((id) => profile.coverageIds.includes(id)));
  const fulfilled = new Set(selected.flatMap((scenario) => scenario.coverage.primary));
  const missing = profile.coverageIds.filter((coverageId) => !fulfilled.has(coverageId));
  if (missing.length > 0) throw new TypeError(`benchmark profile has uncovered primary coverage: ${missing.join(", ")}`);
  return selected;
}
