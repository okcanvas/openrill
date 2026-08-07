import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = async (path) => await readFile(resolve(ROOT, path), "utf8");

test("STEP022CR2 integrates the real Mattermost Testbed into the single OpenRill root without changing Product identity", async () => {
  const pkg = JSON.parse(await read("package.json"));
  const contract = JSON.parse(await read("config/step022c-live-marker-contract.json"));
  assert.equal(pkg.name, "openrill"); assert.equal(contract.version, "0.24.0-step022c"); assert.equal(contract.schema, 25);
  assert.equal(pkg.scripts["mattermost:testbed:live"], "node testbeds/mattermost/scripts/run-step022c-live.mjs");
  assert.equal(pkg.scripts["acceptance:step022c:live"], "python scripts/run_step022c_acceptance.py --require-windows-mattermost-live");
  assert.equal(pkg.scripts["acceptance:step022cr2"], "python scripts/run_step022cr2_acceptance.py");
  const runner = await read("testbeds/mattermost/scripts/run-step022c-live.mjs");
  assert.match(runner, /resolve\(testbedRoot, "\.\.", "\.\."\)/u); assert.doesNotMatch(runner, /process\.argv\[2\]|OpenRillRoot|OPENRILL_STEP022C_ROOT/u);
  const compose = await read("testbeds/mattermost/docker-compose.yml");
  assert.match(compose, /mattermost\/mattermost-team-edition:11\.7\.7/u); assert.doesNotMatch(compose, /:latest/u); assert.match(compose, /127\.0\.0\.1:/u);
});

test("STEP022CR2 records the path shell image and cwd failures and every root handoff names the zero-argument entrypoints", async () => {
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md"); const gates = await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  for (let number = 366; number <= 371; number += 1) {
    const token = `OR-ISSUE-${number}`; assert.match(registry, new RegExp(token)); assert.match(gates, /STEP022CR2 integrated Mattermost Testbed gate/u);
    assert.match(await read(`reference/validation/STEP022CR2_OR_ISSUE_${number}.md`), new RegExp(token));
  }
  for (const file of ["README.md","HANDOFF.md","PLANS.md","ROADMAP.md","VALIDATION.md","PROJECT.md","ARCHITECTURE.md","AGENTS.md","CONTRIBUTING.md","DECISIONS.md","GLOSSARY.md","NOTICE.md","SECURITY.md"]) {
    const body = await read(file); assert.match(body, /STEP022CR2_INTEGRATED_MATTERMOST_TESTBED_SINGLE_ROOT_BOOTSTRAP/u); assert.match(body, /EXTERNAL_OPENRILL_ROOT_ARGUMENT=FORBIDDEN/u); assert.match(body, /start-and-run-step022c-live\.cmd/u);
  }
});
