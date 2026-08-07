import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = async (relative) => readFile(new URL(relative, root), "utf8");

const focusedFiles = [
  "browser-observation-step013b1.test.mjs",
  "browser-playwright-boundaries-step013b1.test.mjs",
  "browser-runtime-step013a.test.mjs",
  "browser-runtime-boundaries-step013a.test.mjs",
];

test("STEP013B1A corrective commands remain available without freezing the current release version", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  const historicalPlan = await read("docs/plans/STEP013B1A_WINDOWS_DETERMINISTIC_FOCUSED_TEST_REPORTER_ALIGNMENT.md");
  assert.match(historicalPlan, /version=0\.13\.6-step013b1a/);
  assert.equal(packageJson.scripts["acceptance:step013b1a"], "python scripts/run_step013b1a_acceptance.py");
  assert.equal(
    packageJson.scripts["package:step013b1a"],
    "python scripts/package_step013b1a.py --output ../openrill-step013b1a-windows-deterministic-focused-test-reporter-alignment-v1.zip",
  );
});

test("all STEP013B1 focused Node test commands select TAP explicitly", async () => {
  for (const runner of ["scripts/run_step013b1_acceptance.py", "scripts/run_step013b1a_acceptance.py"]) {
    const source = await read(runner);
    for (const file of focusedFiles) {
      const command = `["node", "--test", "--test-concurrency=1", "--test-reporter=tap", "tests/unit/${file}"]`;
      assert.ok(source.includes(command), `${runner} must own TAP for ${file}`);
    }
  }
});

test("explicit TAP reporter emits the summary contract parsed by acceptance", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openrill-step013b1a-reporter-"));
  const fixture = join(directory, "fixture.test.mjs");
  try {
    await writeFile(fixture, 'import test from "node:test"; import assert from "node:assert/strict"; test("pass", () => assert.equal(1, 1));\n', "utf8");
    const childEnv = { ...process.env, NO_COLOR: "1", NODE_DISABLE_COLORS: "1" };
    delete childEnv.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=tap", fixture], {
      encoding: "utf8",
      shell: false,
      env: childEnv,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /# tests 1(?:\r?\n)/);
    assert.match(result.stdout, /# pass 1(?:\r?\n)/);
    assert.match(result.stdout, /# fail 0(?:\r?\n)/);
    assert.match(result.stdout, /# skipped 0(?:\r?\n)/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("OR-ISSUE-096 evidence, registry, and recurrence gate are retained", async () => {
  const evidence = await read("reference/validation/STEP013B1_WINDOWS_FOCUSED_TEST_DEFAULT_REPORTER_FALSE_NEGATIVE.md");
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const nestedEvidence = await read("reference/validation/STEP013B1A_NESTED_NODE_TEST_CONTEXT_REPORTER_CAPTURE.md");
  const recurrence = await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  for (const text of [evidence, registry, recurrence]) assert.match(text, /OR-ISSUE-096/);
  for (const text of [nestedEvidence, registry, recurrence]) assert.match(text, /OR-ISSUE-097/);
  assert.match(evidence, /checks=78\/82 state=FAILED/);
  assert.match(evidence, /focused-browser-observation/);
  assert.match(evidence, /ℹ tests 5/);
  assert.match(recurrence, /--test-reporter=tap/);
  assert.match(nestedEvidence, /NODE_TEST_CONTEXT=child-v8/);
});
