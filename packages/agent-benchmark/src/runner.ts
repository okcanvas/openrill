import { createHash } from "node:crypto";
import type {
  BenchmarkAssertion,
  BenchmarkAttemptResult,
  BenchmarkEvidence,
  BenchmarkFailureClass,
  BenchmarkObservation,
  BenchmarkScenarioDefinition,
  BenchmarkScenarioExecutor,
  BenchmarkScenarioResult,
  BenchmarkSuiteResult,
  BenchmarkUsage,
} from "./types.js";

const ZERO_USAGE: BenchmarkUsage = { turns: 0, inputTokens: 0, outputTokens: 0, modelCalls: 0, toolCalls: 0 };

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const source = value as Record<string, unknown>;
  return `{${Object.keys(source).sort().map((key) => `${JSON.stringify(key)}:${canonical(source[key])}`).join(",")}}`;
}

function digestEvidence(evidence: readonly BenchmarkEvidence[] | undefined): BenchmarkAttemptResult["evidence"] {
  return (evidence ?? []).map((item) => ({
    kind: item.kind,
    label: item.label,
    sha256: createHash("sha256").update(canonical(item.value)).digest("hex"),
  }));
}

function safeMessage(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return text.replace(/\s+/gu, " ").slice(0, 500);
}

function budgetAssertions(scenario: BenchmarkScenarioDefinition, elapsedMs: number, usage: BenchmarkUsage): BenchmarkAssertion[] {
  const totalTokens = usage.inputTokens + usage.outputTokens;
  return [
    { name: "budget.duration", passed: elapsedMs <= scenario.budget.maxDurationMs, detail: `${elapsedMs}/${scenario.budget.maxDurationMs}` },
    { name: "budget.turns", passed: usage.turns <= scenario.budget.maxTurns, detail: `${usage.turns}/${scenario.budget.maxTurns}` },
    { name: "budget.modelCalls", passed: usage.modelCalls <= scenario.budget.maxModelCalls, detail: `${usage.modelCalls}/${scenario.budget.maxModelCalls}` },
    { name: "budget.toolCalls", passed: usage.toolCalls <= scenario.budget.maxToolCalls, detail: `${usage.toolCalls}/${scenario.budget.maxToolCalls}` },
    { name: "budget.totalTokens", passed: totalTokens <= scenario.budget.maxTotalTokens, detail: `${totalTokens}/${scenario.budget.maxTotalTokens}` },
  ];
}

function failureClass(assertions: readonly BenchmarkAssertion[], timedOut: boolean): BenchmarkFailureClass {
  if (timedOut) return "TIMEOUT";
  if (assertions.some((item) => item.name.startsWith("budget.") && !item.passed)) return "BUDGET";
  return "ASSERTION";
}

function addUsage(left: BenchmarkUsage, right: BenchmarkUsage): BenchmarkUsage {
  return {
    turns: left.turns + right.turns,
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    modelCalls: left.modelCalls + right.modelCalls,
    toolCalls: left.toolCalls + right.toolCalls,
  };
}

async function executeAttempt(input: {
  readonly scenario: BenchmarkScenarioDefinition;
  readonly executor: BenchmarkScenarioExecutor;
  readonly repetition: number;
  readonly now: () => number;
}): Promise<BenchmarkAttemptResult> {
  const started = input.now();
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;
  let timedOut = false;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error(`benchmark scenario timed out after ${input.scenario.budget.maxDurationMs}ms`));
      }, input.scenario.budget.maxDurationMs);
    });
    const observation = await Promise.race([
      input.executor({ scenario: input.scenario, repetition: input.repetition, signal: controller.signal }),
      timeoutPromise,
    ]) as BenchmarkObservation;
    const elapsedMs = Math.max(0, input.now() - started);
    const assertions = [...observation.assertions, ...budgetAssertions(input.scenario, elapsedMs, observation.usage)];
    const passed = assertions.every((item) => item.passed);
    return {
      scenarioId: input.scenario.id,
      repetition: input.repetition,
      status: passed ? "PASS" : "FAIL",
      elapsedMs,
      assertions,
      usage: observation.usage,
      evidence: digestEvidence(observation.evidence),
      failure: passed ? null : {
        class: failureClass(assertions, false),
        code: assertions.find((item) => !item.passed)?.name ?? "ASSERTION_FAILED",
        message: assertions.filter((item) => !item.passed).map((item) => `${item.name}:${item.detail ?? "failed"}`).join("; ").slice(0, 500),
      },
    };
  } catch (error) {
    const elapsedMs = Math.max(0, input.now() - started);
    return {
      scenarioId: input.scenario.id,
      repetition: input.repetition,
      status: "FAIL",
      elapsedMs,
      assertions: budgetAssertions(input.scenario, elapsedMs, ZERO_USAGE),
      usage: ZERO_USAGE,
      evidence: [],
      failure: {
        class: timedOut ? "TIMEOUT" : "RUNTIME",
        code: timedOut ? "SCENARIO_TIMEOUT" : "SCENARIO_RUNTIME_ERROR",
        message: safeMessage(error),
      },
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function runBenchmarkSuite(input: {
  readonly profileId: string;
  readonly scenarios: readonly BenchmarkScenarioDefinition[];
  readonly executors: Readonly<Record<string, BenchmarkScenarioExecutor>>;
  readonly repetitions?: number;
  readonly scenarioIds?: readonly string[];
  readonly now?: () => number;
}): Promise<BenchmarkSuiteResult> {
  const now = input.now ?? Date.now;
  const startedAt = new Date(now()).toISOString();
  const selectedIds = input.scenarioIds ? new Set(input.scenarioIds) : null;
  const selected = selectedIds ? input.scenarios.filter((scenario) => selectedIds.has(scenario.id)) : [...input.scenarios];
  if (selected.length === 0) throw new TypeError("benchmark suite has no selected scenarios");
  if (selectedIds) {
    const known = new Set(input.scenarios.map((scenario) => scenario.id));
    const unknown = [...selectedIds].filter((id) => !known.has(id));
    if (unknown.length > 0) throw new TypeError(`unknown benchmark scenarios: ${unknown.join(", ")}`);
  }
  const scenarioResults: BenchmarkScenarioResult[] = [];
  let totalUsage = ZERO_USAGE;
  let passedAttempts = 0;
  let failedAttempts = 0;
  for (const scenario of selected) {
    const executor = input.executors[scenario.executor];
    if (!executor) throw new TypeError(`benchmark executor not registered: ${scenario.executor}`);
    const repetitions = input.repetitions ?? scenario.defaultRepetitions;
    if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 20) throw new TypeError("benchmark repetitions must be between 1 and 20");
    const attempts: BenchmarkAttemptResult[] = [];
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const attempt = await executeAttempt({ scenario, executor, repetition, now });
      attempts.push(attempt);
      totalUsage = addUsage(totalUsage, attempt.usage);
      if (attempt.status === "PASS") passedAttempts += 1;
      else failedAttempts += 1;
    }
    const scenarioPassed = attempts.filter((attempt) => attempt.status === "PASS").length;
    scenarioResults.push({
      scenario,
      attempts,
      passedAttempts: scenarioPassed,
      failedAttempts: attempts.length - scenarioPassed,
      reliability: scenarioPassed / attempts.length,
      status: scenarioPassed === attempts.length ? "PASS" : "FAIL",
    });
  }
  const attemptCount = passedAttempts + failedAttempts;
  return {
    schemaVersion: 1,
    profileId: input.profileId,
    providerMode: "SCRIPTED_LOCAL",
    startedAt,
    completedAt: new Date(now()).toISOString(),
    scenarioCount: scenarioResults.length,
    attemptCount,
    passedAttempts,
    failedAttempts,
    reliability: passedAttempts / attemptCount,
    status: failedAttempts === 0 ? "PASS" : "FAIL",
    usage: totalUsage,
    scenarios: scenarioResults,
  };
}
