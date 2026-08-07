const SUMMARY_KEYS = Object.freeze(["tests", "pass", "fail", "cancelled", "skipped", "todo"]);

export function parseNodeTapSummary(output) {
  const counts = Object.fromEntries(SUMMARY_KEYS.map((key) => [key, -1]));
  for (const rawLine of String(output).split(/\r\n|\n|\r/)) {
    const match = /^\s*#\s+(tests|pass|fail|cancelled|skipped|todo)\s+([0-9]+)\s*$/.exec(rawLine);
    if (!match) continue;
    counts[match[1]] = Number(match[2]);
  }
  return Object.freeze(counts);
}

export function nodeTapSummaryPassed(output, expectedTests) {
  const summary = parseNodeTapSummary(output);
  return {
    summary,
    passed:
      summary.tests === expectedTests &&
      summary.pass === expectedTests &&
      summary.fail === 0 &&
      summary.cancelled === 0 &&
      summary.skipped === 0,
  };
}
