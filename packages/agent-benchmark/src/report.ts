import type { BenchmarkSuiteResult } from "./types.js";

const SECRET_PATTERNS: readonly RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/giu,
  /\bsk-[A-Za-z0-9_-]{12,}\b/gu,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/giu,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*[^\s,;]+/giu,
];

export function sanitizeShareSafeText(input: string, forbiddenValues: readonly string[] = []): string {
  let result = input;
  for (const value of forbiddenValues.filter((item) => item.length > 0)) result = result.split(value).join("[REDACTED]");
  for (const pattern of SECRET_PATTERNS) result = result.replace(pattern, "[REDACTED]");
  return result;
}

export function formatBenchmarkJson(result: BenchmarkSuiteResult, forbiddenValues: readonly string[] = []): string {
  return sanitizeShareSafeText(`${JSON.stringify(result, null, 2)}\n`, forbiddenValues);
}

export function formatBenchmarkMarkdown(result: BenchmarkSuiteResult, forbiddenValues: readonly string[] = []): string {
  const lines = [
    `# OpenRill Agent Task Benchmark`,
    "",
    `- Profile: \`${result.profileId}\``,
    `- Provider mode: \`${result.providerMode}\``,
    `- Status: **${result.status}**`,
    `- Scenarios: ${result.scenarioCount}`,
    `- Attempts: ${result.passedAttempts}/${result.attemptCount} passed`,
    `- Reliability: ${(result.reliability * 100).toFixed(2)}%`,
    `- Usage: turns=${result.usage.turns}, modelCalls=${result.usage.modelCalls}, toolCalls=${result.usage.toolCalls}, inputTokens=${result.usage.inputTokens}, outputTokens=${result.usage.outputTokens}`,
    "",
    "| Scenario | Status | Reliability | Attempts | Usage (M/T) |",
    "| --- | --- | ---: | ---: | ---: |",
  ];
  for (const scenario of result.scenarios) {
    const usage = scenario.attempts.reduce((sum, attempt) => ({ modelCalls: sum.modelCalls + attempt.usage.modelCalls, toolCalls: sum.toolCalls + attempt.usage.toolCalls }), { modelCalls: 0, toolCalls: 0 });
    lines.push(`| \`${scenario.scenario.id}\` | ${scenario.status} | ${(scenario.reliability * 100).toFixed(2)}% | ${scenario.passedAttempts}/${scenario.attempts.length} | ${usage.modelCalls}/${usage.toolCalls} |`);
  }
  lines.push("", "## Failure summary", "");
  const failures = result.scenarios.flatMap((scenario) => scenario.attempts.filter((attempt) => attempt.failure).map((attempt) => ({ scenarioId: scenario.scenario.id, attempt })));
  if (failures.length === 0) lines.push("No failures.");
  else for (const failure of failures) lines.push(`- \`${failure.scenarioId}#${failure.attempt.repetition}\`: ${failure.attempt.failure!.class}/${failure.attempt.failure!.code} — ${failure.attempt.failure!.message}`);
  return sanitizeShareSafeText(`${lines.join("\n")}\n`, forbiddenValues);
}
