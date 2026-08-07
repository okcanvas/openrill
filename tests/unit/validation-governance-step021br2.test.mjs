import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = async (path) => await readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const STEP = "STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE";
const VERSION = "0.21.3-step021br2";
const BASELINE = "STEP021A_DURABLE_GOAL_PLAN_TO_TASK_FLOW_EXECUTOR_FOUNDATION";
const LIVE = "STEP021BR2_H1_WINDOWS_TAP_SUMMARY_PARSER_AND_PLAN_REVISION_RESTART";

test("STEP021BR2 retains immutable Windows 82/82 acceptance while the current source may advance", async () => {
  const contract = JSON.parse(await read("config/step021br2-live-marker-contract.json"));
  const evidence = await read("reference/validation/STEP021BR2_WINDOWS_TAP_SUMMARY_LIVE_ACCEPTANCE.md");
  const baseline = JSON.parse(await read("config/current-accepted-baseline.json"));
  assert.equal(contract.step, STEP);
  assert.equal(contract.version, VERSION);
  assert.match(evidence, /CHECKS=82\/82/);
  assert.match(evidence, /WINDOWS_TAP_SUMMARY_LIVE=PASSED/);
  assert.equal(typeof baseline.step, "string");
  assert.ok(baseline.stateSchema >= 24);
})

test("STEP021BR2 shared TAP parser uses structured integer lines without dynamic numeric RegExp strings", async () => {
  const body = await read("scripts/node-tap-summary.mjs");
  assert.match(body, /split\(\/\\r\\n\|\\n\|\\r\//);
  assert.match(body, /\[0-9\]\+/);
  assert.match(body, /tests\|pass\|fail\|cancelled\|skipped\|todo/);
  assert.doesNotMatch(body, /new RegExp/);
});

test("STEP021BR2 repairs the historical STEP021BR1 live Harness through the shared parser", async () => {
  const body = await read("scripts/run-step021br1-plan-revision-corrective-live.mjs");
  assert.match(body, /from "\.\/node-tap-summary\.mjs"/);
  assert.match(body, /parseNodeTapSummary\(focused\.output\)/);
  assert.doesNotMatch(body, /matchAll\(new RegExp/);
});

test("STEP021BR2 parser regression covers LF, Windows CRLF, indentation, and missing values", async () => {
  const body = await read("tests/unit/node-tap-summary-step021br2.test.mjs");
  assert.match(body, /LF line endings/);
  assert.match(body, /Windows CRLF line endings/);
  assert.match(body, /harmless indentation/);
  assert.match(body, /negative sentinels/);
});

test("STEP021BR2 preserves exact actual Windows failure evidence", async () => {
  const body = await read("reference/validation/STEP021BR1_WINDOWS_TAP_SUMMARY_PARSER_FAILURE.md");
  assert.match(body, /AGGREGATE=67\/68 FAILED/);
  assert.match(body, /INNER_HARNESS=20\/24 FAILED/);
  assert.match(body, /FOCUSED_NODE_TESTS=22\/22 PASSED/);
  for (const name of ["focused-tests", "focused-pass", "focused-fail", "focused-skipped"]) {
    assert.match(body, new RegExp(`check=${name} detail=-1`));
  }
});

test("STEP021BR2 independently records OR-ISSUE-306 and its recurrence gate", async () => {
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates = await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  const issue = await read("reference/validation/STEP021BR2_OR_ISSUE_306.md");
  for (const body of [registry, gates, issue]) assert.match(body, /OR-ISSUE-306/);
  assert.match(issue, /\(d\+\)/);
  assert.match(issue, /22 focused Product tests passed/);
});

test("STEP021BR2 root continuation and package entrypoints are self-contained", async () => {
  for (const file of ["README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md", "PROJECT.md", "ARCHITECTURE.md"]) {
    const body = await read(file);
    assert.match(body, new RegExp(STEP));
    assert.match(body, /0\.21\.3-step021br2/);
    assert.match(body, new RegExp(BASELINE));
    assert.match(body, /OR-ISSUE-306/);
    assert.match(body, /22\/22 PASSED/);
  }
  const scripts = JSON.parse(await read("package.json")).scripts;
  assert.equal(scripts["acceptance:step021br2"], "python scripts/run_step021br2_acceptance.py");
  assert.equal(scripts["acceptance:step021br2:live"], "python scripts/run_step021br2_acceptance.py --require-windows-tap-summary-live");
  assert.equal(scripts["windows-tap-summary-live:step021br2"], "node scripts/run-step021br2-windows-tap-summary-live.mjs");
  assert.equal(scripts["package:step021br2"], "python scripts/package_step021br2.py --output ../openrill-step021br2-windows-tap-summary-parser-closure-v1.zip");
});

test("STEP021BR2 has one structured 28-check Windows live contract", async () => {
  const contract = JSON.parse(await read("config/step021br2-live-marker-contract.json"));
  assert.equal(contract.step, STEP);
  assert.equal(contract.version, VERSION);
  assert.equal(contract.schema, 24);
  assert.equal(contract.expectedChecks, "28/28");
  assert.equal(contract.liveHarness, LIVE);
  assert.equal(contract.fields.tap_summary, "LINE_BASED_INTEGER");
  assert.equal(contract.fields.line_endings, "LF_CRLF");
  assert.equal(contract.fields.numeric_escape, "REGEXP_STRING_REMOVED");
});

test("STEP021BR2 current live Harness checks parser self-tests and retained Product behavior", async () => {
  const body = await read("scripts/run-step021br2-windows-tap-summary-live.mjs");
  assert.match(body, /tap-parser-lf/);
  assert.match(body, /tap-parser-crlf/);
  assert.match(body, /tap\.tests === 26/);
  assert.match(body, /Host restart reruns a changed completed Step/);
  assert.match(body, /open blocker beyond the first 200 historical ledger rows/);
});
