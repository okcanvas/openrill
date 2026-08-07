import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = async (path) => await readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const HARNESS = "STEP019A_H1_STATE_SCHEMA_SOURCE_OF_TRUTH_ALIGNMENT";

test("STEP019A H1 historical live runner reads the built State runtime schema owner", async () => {
  const live = await read("scripts/run-step019a-goal-live.mjs");
  assert.match(live, /packages\/state\/dist\/index\.js/);
  assert.match(live, /OPENRILL_STATE_SCHEMA_VERSION/);
  assert.match(live, /runtimeSchema===SCHEMA/);
  assert.doesNotMatch(live, /packages\/state\/src\/index\.ts/);
});

test("STEP019A H1 historical acceptance requires the exact corrected Harness", async () => {
  const acceptance = await read("scripts/run_step019a_acceptance.py");
  assert.match(acceptance, new RegExp(HARNESS));
  assert.match(acceptance, /checks=10\/10 state=PASSED/);
});

test("STEP019A H1 retains the failed attempt and OR-ISSUE-229", async () => {
  const attempt = await read("reference/validation/STEP019A_WINDOWS_GOAL_LIVE_ATTEMPT_1.md");
  const issue = await read("reference/validation/STEP019A_OR_ISSUE_229.md");
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates = await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  assert.match(attempt, /checks=33\/34/);
  assert.match(attempt, /check=schema detail=/);
  for (const body of [issue, registry, gates]) assert.match(body, /OR-ISSUE-229/);
});

test("STEP019A H1 promoted evidence preserves Product identity and exact ZIP", async () => {
  const evidence = await read("reference/validation/STEP019A_WINDOWS_GOAL_LIVE_ACCEPTANCE.md");
  assert.match(evidence, new RegExp(HARNESS));
  assert.match(evidence, /0\.19\.0-step019a/);
  assert.match(evidence, /state_schema=17/);
  assert.match(evidence, /453eb9166858e4766343edec74a33b01d64b15b5e48decff7bb03d2f092368e6/);
});
