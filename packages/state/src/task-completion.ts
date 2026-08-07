export interface RequiredTaskCompletionResult {
  readonly terminalOutcome: "SUCCEEDED" | "BLOCKED";
  readonly terminalSummary: string;
  readonly normalizedOutput: string;
}

const ENGLISH_PROGRESS_ONLY = /^(?:i(?:'|’)?ll|i will|i(?:'|’)?m|i am|i(?:'|’)?m going to|i am going to|let me|i need to)\s+(?:now\s+)?(?:analyz(?:e|ing)|apply|check(?:ing)?|continue|debug(?:ging)?|follow(?:ing)?\s+up|inspect(?:ing)?|investigat(?:e|ing)|look(?:ing)?(?:\s+into)?|map(?:ping)?|open(?:ing)?|read(?:ing)?|report(?:ing)?(?:\s+back)?|review(?:ing)?|run(?:ning)?|start(?:ing)?|test(?:ing)?|trace|trac(?:e|ing)|try(?:ing)?|update|verify(?:ing)?|work(?:ing)?)/i;
const BARE_ENGLISH_PROGRESS_ONLY = /^(?:analyz(?:e|ing)|check(?:ing)?|debug(?:ging)?|inspect(?:ing)?|investigat(?:e|ing)|look(?:ing)?\s+into|map(?:ping)?|read(?:ing)?|report(?:ing)?\s+back|review(?:ing)?|run(?:ning)?|test(?:ing)?|trac(?:e|ing)|verify(?:ing)?|work(?:ing)?\s+on)\b/i;
const KOREAN_PROGRESS_ONLY = /^(?:이제\s+|먼저\s+|계속\s+|다음으로\s+)?(?:확인|검토|분석|점검|조사|추적|테스트|실행|진행|작업|수정|적용|정리|살펴보)(?:해\s*보겠습니다|하겠습니다|하겠어요|해보겠습니다|할게요|중입니다|하고\s*있습니다|해보죠)[.!…\s]*$/;
const FOLLOW_UP_PREFIX = /^(?:after(?:wards|\s+that)?|from\s+there|next|once\s+(?:done|that(?:'|’)?s\s+done|that\s+is\s+done)|then)[,.\s]+/i;

function normalize(value: string | null | undefined): string {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

function firstMeaningfulLine(value: string): string {
  return value.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
}

function isProgressOnly(value: string): boolean {
  const line = firstMeaningfulLine(value).replace(/^[-*#>\s]+/, "").trim();
  if (!line) return false;
  if (KOREAN_PROGRESS_ONLY.test(line)) return true;
  const withoutFollowUp = line.replace(FOLLOW_UP_PREFIX, "");
  return ENGLISH_PROGRESS_ONLY.test(withoutFollowUp) || BARE_ENGLISH_PROGRESS_ONLY.test(withoutFollowUp);
}

export function resolveRequiredTaskCompletion(output: string | null | undefined): RequiredTaskCompletionResult {
  const normalizedOutput = normalize(output);
  if (!normalizedOutput) {
    return {
      terminalOutcome: "BLOCKED",
      terminalSummary: "Required completion did not produce a final deliverable.",
      normalizedOutput,
    };
  }
  if (isProgressOnly(normalizedOutput)) {
    return {
      terminalOutcome: "BLOCKED",
      terminalSummary: "Required completion ended with progress-only text, not a final deliverable.",
      normalizedOutput,
    };
  }
  return {
    terminalOutcome: "SUCCEEDED",
    terminalSummary: "Completed with a final deliverable.",
    normalizedOutput,
  };
}
