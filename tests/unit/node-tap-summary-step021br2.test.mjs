import test from "node:test";
import assert from "node:assert/strict";
import { nodeTapSummaryPassed, parseNodeTapSummary } from "../../scripts/node-tap-summary.mjs";

const summaryLines = [
  "1..22",
  "# tests 22",
  "# suites 0",
  "# pass 22",
  "# fail 0",
  "# cancelled 0",
  "# skipped 0",
  "# todo 0",
  "# duration_ms 7108.6522",
];

test("STEP021BR2 parses Node TAP summary with LF line endings", () => {
  assert.deepEqual(parseNodeTapSummary(summaryLines.join("\n")), {
    tests: 22,
    pass: 22,
    fail: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0,
  });
});

test("STEP021BR2 parses Node TAP summary with Windows CRLF line endings", () => {
  assert.deepEqual(parseNodeTapSummary(summaryLines.join("\r\n") + "\r\n"), {
    tests: 22,
    pass: 22,
    fail: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0,
  });
});

test("STEP021BR2 line parser accepts harmless indentation but rejects prose lookalikes", () => {
  const output = [
    "  # tests 22",
    "comment # pass 99",
    "  # pass 22  ",
    "# fail 0",
    "# cancelled 0",
    "# skipped 0",
    "# todo 0",
  ].join("\r\n");
  const result = nodeTapSummaryPassed(output, 22);
  assert.equal(result.passed, true);
  assert.equal(result.summary.pass, 22);
});

test("STEP021BR2 missing summary values remain explicit negative sentinels", () => {
  assert.deepEqual(parseNodeTapSummary("TAP version 13\r\n1..0\r\n"), {
    tests: -1,
    pass: -1,
    fail: -1,
    cancelled: -1,
    skipped: -1,
    todo: -1,
  });
});
