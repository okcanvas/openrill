import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

test("STEP016AR1 aggregate executes the current AR1 Windows DPAPI live fixture", async () => {
  const runner = await read("scripts/run_step016ar1_acceptance.py");
  const liveBlock = runner.slice(runner.indexOf("if args.require_windows_dpapi_live"));
  assert.match(liveBlock, /scripts\/run-step016ar1-windows-dpapi-live\.mjs/);
  assert.doesNotMatch(liveBlock, /scripts\/run-step016a-windows-dpapi-live\.mjs/);
});

test("STEP016AR1 live fixture and aggregate own the same marker identity", async () => {
  const runner = await read("scripts/run_step016ar1_acceptance.py");
  const fixture = await read("scripts/run-step016ar1-windows-dpapi-live.mjs");
  for (const token of [
    "STEP016AR1_WINDOWS_DPAPI_ENCODED_COMMAND_ARGUMENT_TRANSPORT_ALIGNMENT",
    "0.16.1-step016ar1",
  ]) {
    assert.match(runner, new RegExp(token.replaceAll(".", "\\.")));
    assert.match(fixture, new RegExp(token.replaceAll(".", "\\.")));
  }
  assert.match(runner, /^SCHEMA = 15$/m);
  assert.match(fixture, /^const SCHEMA = 15;$/m);
});

test("the first Windows AR1 DPAPI result is retained as a Harness false negative", async () => {
  const evidence = await read("reference/validation/STEP016AR1_WINDOWS_DPAPI_LIVE_ATTEMPT_1.md");
  assert.match(evidence, /windows-dpapi-live state=PASS/);
  assert.match(evidence, /STEP016A_LOCAL_SETUP_DOCTOR_AND_WINDOWS_DPAPI_SECRET_FOUNDATION checks=12\/12 state=PASSED/);
  assert.match(evidence, /aggregate.*68\/69.*FAILED/is);
  assert.match(evidence, /owner_dimension=HARNESS/);
});

test("OR-ISSUE-207 is connected to registry, recurrence gates, and handoff", async () => {
  for (const relative of [
    "reference/validation/STEP016AR1_OR_ISSUE_207.md",
    "docs/governance/ENGINEERING_ISSUE_REGISTRY.md",
    "docs/testing/RECURRENCE_PREVENTION_GATES.md",
    "HANDOFF.md",
  ]) {
    assert.match(await read(relative), /OR-ISSUE-207/, relative);
  }
});
