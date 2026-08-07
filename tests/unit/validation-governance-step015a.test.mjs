import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

test("STEP014 closure records independent Product, UI, and Harness dimensions", async () => {
  const accepted = JSON.parse(await read("config/current-accepted-baseline.json"));
  const closure = await read("docs/plans/STEP014_PRODUCT_ACCEPTANCE_CLOSURE.md");
  assert.equal(accepted.acceptanceModel, "DIMENSIONAL");
  assert.equal(accepted.dimensions.productCore, "ACCEPTED");
  assert.match(closure, /Product core is closed and accepted/);
  assert.match(closure, /privacy-safe Control UI rendering/);
  assert.match(closure, /Chromium automation lifecycle/);
  assert.match(closure, /OR-ISSUE-190/);
  assert.match(closure, /OR-ISSUE-191/);
});

test("raw Windows evidence preserves successful delegation and both remaining failures", async () => {
  const evidence = await read("reference/validation/STEP014DR8_WINDOWS_357_OF_358_EVIDENCE.txt");
  assert.match(evidence, /external-model-parallel-live state=PASS/);
  assert.match(evidence, /checks=357\/358 state=FAILED/);
  assert.match(evidence, /AssertionError \[ERR_ASSERTION\]: Raw child transcript/);
  assert.match(evidence, /OPENRILL_STEP014DR8_CHROMIUM_ORPHAN:11420/);
});

test("practical validation policy separates Product, optional UI, Harness, and Package", async () => {
  const policy = await read("docs/governance/PRACTICAL_VALIDATION_AND_FAILURE_ASSET_GOVERNANCE.md");
  for (const token of ["PRODUCT_CORE", "OPTIONAL_UI", "HARNESS", "PACKAGE", "Stop-loss rule", "NOT_RECORDED"]) {
    assert.match(policy, new RegExp(token));
  }
  assert.match(policy, /Browser\s+failure must not block a non-UI runtime STEP/);
});

test("STEP015A acceptance excludes browser and previous STEP014 live aggregates", async () => {
  const runner = await read("scripts/run_step015a_acceptance.py");
  const stages = runner.slice(runner.indexOf("STAGES:"), runner.indexOf("def read_utf8"));
  assert.doesNotMatch(stages, /run_step014dr8_acceptance|deterministic-nested-control-ui-live|external-model-parallel-live/);
  assert.doesNotMatch(stages, /playwright|chromium|browser-live/i);
  assert.match(stages, /focused-sandbox/);
  assert.match(stages, /canonical-suite/);
});

test("STEP014 closure failures are issue assets with recurrence gates", async () => {
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates = await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  for (const number of [190, 191, 192, 193, 194, 195, 196]) {
    const issue = `OR-ISSUE-${number}`;
    assert.match(registry, new RegExp(issue));
    assert.ok(await read([194, 195, 196].includes(number) ? `reference/validation/STEP015A_OR_ISSUE_${number}.md` : `reference/validation/STEP014_OR_ISSUE_${number}.md`).then((text) => text.includes(issue)));
  }
  assert.match(gates, /Independent acceptance dimensions/);
  assert.match(gates, /One-correction stop-loss/);
});

test("STEP015A time ledger does not invent unknown human duration", async () => {
  const plan = await read("docs/plans/STEP015A_EXECUTION_BACKEND_CONTRACT_AND_DOCKER_CONFINEMENT_PLAN_FOUNDATION.md");
  assert.match(plan, /started_at=2026-08-04T21:01:00\+09:00/);
  assert.match(plan, /human_work_minutes=NOT_RECORDED/);
  assert.match(plan, /automated_run_seconds=\d+\.\d+/);
});

test("current handoff keeps retained STEP014 UI and Harness backlog visible while proceeding", async () => {
  const handoff = await read("HANDOFF.md");
  assert.match(handoff, /OR-ISSUE-190/);
  assert.match(handoff, /OR-ISSUE-191/);
  assert.match(handoff, /retained/i);
});
