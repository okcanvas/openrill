import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { assertInterruptedModelInvocation } from "../../scripts/recovery-live-assertions.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const source = async (relative) => readFile(join(ROOT, relative), "utf8");

test("SQLite null-prototype invocation rows are validated by field values", () => {
  const row = Object.assign(Object.create(null), {
    status: "FAILED",
    errorCode: "MODEL_INTERRUPTED_BY_RESTART",
  });
  assert.doesNotThrow(() => assertInterruptedModelInvocation(row));
});

test("interrupted invocation assertion rejects missing and wrong values", () => {
  assert.throws(() => assertInterruptedModelInvocation(null), /row missing/);
  assert.throws(() => assertInterruptedModelInvocation(Object.assign(Object.create(null), { status: "STARTED", errorCode: "MODEL_INTERRUPTED_BY_RESTART" })), /status mismatch/);
  assert.throws(() => assertInterruptedModelInvocation(Object.assign(Object.create(null), { status: "FAILED", errorCode: "OTHER" })), /error code mismatch/);
});

test("STEP013CR2 live fixture uses prototype-neutral invocation validation", async () => {
  const live = await source("scripts/run-step013cr2-live.mjs");
  assert.match(live, /assertInterruptedModelInvocation\(invocation\)/);
  assert.doesNotMatch(live, /deep(?:Strict)?Equal\(invocation/);
});

test("STEP013CR2 records the Windows null-prototype false negative and recurrence gate", async () => {
  const registry = await source("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const recurrence = await source("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  const evidence = await source("reference/validation/STEP013CR1_WINDOWS_LIVE_NULL_PROTOTYPE_ASSERTION_FAILURE.md");
  assert.match(registry, /OR-ISSUE-118/);
  assert.match(recurrence, /OR-ISSUE-118/);
  assert.match(evidence, /Object: null prototype/);
  assert.match(evidence, /MODEL_INTERRUPTED_BY_RESTART/);
});


test("STEP013CR2 focused stage owns a bounded timeout", async () => {
  const runner = await source("scripts/run_step013cr2_acceptance.py");
  assert.match(runner, /"focused-sqlite-row-assertion": 120/);
  assert.match(runner, /\("focused-sqlite-row-assertion", \["node", "--test"/);
});


test("STEP013CR2 acceptance predicates follow their current owners", async () => {
  const runner = await source("scripts/run_step013cr2_acceptance.py");
  assert.match(runner, /live-model-interruption", "MODEL_INTERRUPTED_BY_RESTART" in recovery_assertions/);
  assert.match(runner, /if f'\(\"\{stage_name\}\"' in line and "--test-reporter=tap" in line/);
  assert.match(runner, /focused-test-reporter[\s\S]*tap_pass\(output, 4\)/);
  assert.match(runner, /focused-sqlite-row-assertion[\s\S]*tap_pass\(output, 6\)/);
});



test("current package manifest identity is owned by the current root package, not a historical accepted step", async () => {
  const generator = await source("scripts/generate_package_manifest.py");
  const verifier = await source("scripts/verify_package_manifest.py");
  const manifest = JSON.parse(await source("PACKAGE_MANIFEST.json"));
  const rootPackage = JSON.parse(await source("package.json"));
  for (const text of [generator, verifier]) {
    assert.ok(text.includes(`VERSION = "${rootPackage.version}"`));
    assert.ok(text.includes(`STEP = "${manifest.step}"`));
  }
  assert.equal(manifest.version, rootPackage.version);
  assert.notEqual(manifest.step, "STEP013B3_BROWSER_ARTIFACTS_AND_BOUNDED_EVIDENCE");
});
