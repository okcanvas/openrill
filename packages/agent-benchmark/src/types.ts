export type BenchmarkRisk = "low" | "medium" | "high";
export type BenchmarkAttemptStatus = "PASS" | "FAIL";
export type BenchmarkFailureClass = "ASSERTION" | "BUDGET" | "TIMEOUT" | "RUNTIME";

export interface BenchmarkBudget {
  readonly maxDurationMs: number;
  readonly maxTurns: number;
  readonly maxModelCalls: number;
  readonly maxToolCalls: number;
  readonly maxTotalTokens: number;
}

export interface BenchmarkCoverage {
  readonly primary: readonly string[];
  readonly secondary: readonly string[];
}

export interface BenchmarkScenarioDefinition {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly risk: BenchmarkRisk;
  readonly executor: string;
  readonly coverage: BenchmarkCoverage;
  readonly capabilities: readonly string[];
  readonly objective: string;
  readonly successCriteria: readonly string[];
  readonly budget: BenchmarkBudget;
  readonly defaultRepetitions: number;
}

export interface BenchmarkTaxonomyProfile {
  readonly coverageIds: readonly string[];
}

export interface BenchmarkTaxonomy {
  readonly schemaVersion: 1;
  readonly profiles: Readonly<Record<string, BenchmarkTaxonomyProfile>>;
}

export interface BenchmarkAssertion {
  readonly name: string;
  readonly passed: boolean;
  readonly detail?: string;
}

export interface BenchmarkUsage {
  readonly turns: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly modelCalls: number;
  readonly toolCalls: number;
}

export interface BenchmarkEvidence {
  readonly kind: string;
  readonly label: string;
  readonly value: unknown;
}

export interface BenchmarkObservation {
  readonly assertions: readonly BenchmarkAssertion[];
  readonly usage: BenchmarkUsage;
  readonly evidence?: readonly BenchmarkEvidence[];
}

export interface BenchmarkExecutionContext {
  readonly scenario: BenchmarkScenarioDefinition;
  readonly repetition: number;
  readonly signal: AbortSignal;
}

export type BenchmarkScenarioExecutor = (
  context: BenchmarkExecutionContext,
) => Promise<BenchmarkObservation>;

export interface BenchmarkAttemptResult {
  readonly scenarioId: string;
  readonly repetition: number;
  readonly status: BenchmarkAttemptStatus;
  readonly elapsedMs: number;
  readonly assertions: readonly BenchmarkAssertion[];
  readonly usage: BenchmarkUsage;
  readonly evidence: readonly {
    readonly kind: string;
    readonly label: string;
    readonly sha256: string;
  }[];
  readonly failure: null | {
    readonly class: BenchmarkFailureClass;
    readonly code: string;
    readonly message: string;
  };
}

export interface BenchmarkScenarioResult {
  readonly scenario: BenchmarkScenarioDefinition;
  readonly attempts: readonly BenchmarkAttemptResult[];
  readonly passedAttempts: number;
  readonly failedAttempts: number;
  readonly reliability: number;
  readonly status: BenchmarkAttemptStatus;
}

export interface BenchmarkSuiteResult {
  readonly schemaVersion: 1;
  readonly profileId: string;
  readonly providerMode: "SCRIPTED_LOCAL";
  readonly startedAt: string;
  readonly completedAt: string;
  readonly scenarioCount: number;
  readonly attemptCount: number;
  readonly passedAttempts: number;
  readonly failedAttempts: number;
  readonly reliability: number;
  readonly status: BenchmarkAttemptStatus;
  readonly usage: BenchmarkUsage;
  readonly scenarios: readonly BenchmarkScenarioResult[];
}
