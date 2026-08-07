import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const retainedTest = readFileSync(new URL("./acceptance-stage-runner-step013ar3.test.mjs", import.meta.url), "utf8");

test("stage-runner fixture imports the helper by explicit file identity", () => {
  assert.match(retainedTest, /spec_from_file_location/);
  assert.match(retainedTest, /sys\.modules\[spec\.name\]=module/);
  assert.match(retainedTest, /spec\.loader\.exec_module\(module\)/);
  assert.doesNotMatch(retainedTest, /from scripts\.acceptance_stage_runner import run_stage/);
});

test("stage-runner fixture is independent of cwd and implicit Python path", () => {
  assert.match(retainedTest, /mkdtempSync/);
  assert.match(retainedTest, /PYTHONSAFEPATH: "1"/);
  assert.match(retainedTest, /\["-P", "-c", script, helperPath\]/);
  assert.doesNotMatch(retainedTest, /cwd: new URL\("\.\.\/\.\."/);
});
