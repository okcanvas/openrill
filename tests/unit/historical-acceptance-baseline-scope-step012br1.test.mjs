import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function source(relative) {
  return readFile(resolve(root, relative), "utf8");
}

test("historical STEP011 acceptance delegates mutable root baseline ownership", async () => {
  const runner = await source("scripts/run_step011_acceptance.py");
  assert.match(runner, /baseline-current-release-step/);
  assert.match(runner, /RELEASE_STEP in text/);
  assert.match(runner, /baseline-current-release-version/);
  assert.doesNotMatch(runner, /baseline-next:/);
  assert.doesNotMatch(runner, /"STEP012_AUTOMATION_SCHEDULER" in text/);
});

test("historical STEP011 acceptance retains evidence without claiming current baseline", async () => {
  const runner = await source("scripts/run_step011_acceptance.py");
  assert.match(runner, /baseline-step011-history/);
  assert.match(runner, /"STEP011R8" in text and "198\/198" in text/);
  assert.match(runner, /baseline-step011-current-claim-zero/);
});

test("all nested historical runners delegate mutable next-cut ownership", async () => {
  for (const relative of [
    "scripts/run_step011_acceptance.py",
    "scripts/run_step012ar1_acceptance.py",
    "scripts/run_step012b_acceptance.py",
    "scripts/run_step012br1_acceptance.py",
  ]) {
    const runner = await source(relative);
    assert.doesNotMatch(runner, /check\(f?"baseline-next:/, relative);
  }
  const current = await source("scripts/run_step012c_acceptance.py");
  assert.match(current, /baseline-next/);
  assert.match(current, /STEP012D/);
});

test("current root documents own the current release and canonical accepted baseline while historical evidence stays dedicated", async () => {
  const manifest = JSON.parse(await source("PACKAGE_MANIFEST.json"));
  const accepted = JSON.parse(await source("config/current-accepted-baseline.json"));
  assert.ok(Number.isInteger(accepted.schemaVersion) && accepted.schemaVersion >= 1);
  assert.match(accepted.zipSha256, /^[a-f0-9]{64}$/);
  assert.equal(await source(accepted.evidence).then((text) => text.includes(accepted.step)), true);
  for (const relative of ["README.md", "HANDOFF.md", "PLANS.md", "ROADMAP.md", "VALIDATION.md"]) {
    const text = await source(relative);
    assert.match(text, new RegExp(manifest.step), relative);
    assert.match(text, new RegExp(accepted.step), relative);
    assert.match(text, new RegExp(accepted.checks.replace("/", "\\/")), relative);
    assert.match(text, new RegExp(accepted.zipSha256), relative);
  }
  const dr4 = await source("reference/validation/STEP012DR4_WINDOWS_LIVE_ACCEPTED.md");
  assert.match(dr4, /STEP012DR4_AUTOMATION_HISTORY_ROW_SELECTOR_ISOLATION/);
  assert.match(dr4, /180\/180/);
  assert.match(dr4, /STEP012D Automation Control UI vertical slice/);
  const cr1 = await source("reference/validation/STEP012CR1_WINDOWS_LIVE_ACCEPTED.md");
  assert.match(cr1, /STEP012CR1_HISTORICAL_BROWSER_REGRESSION_OWNERSHIP/);
  assert.match(cr1, /101\/101/);
  const br1 = await source("reference/validation/STEP012BR1_WINDOWS_LIVE_ACCEPTED.md");
  assert.match(br1, /STEP012BR1_HISTORICAL_ACCEPTANCE_BASELINE_OWNERSHIP/);
  assert.match(br1, /187\/187/);
  const step011 = await source("reference/validation/STEP011R8_WINDOWS_LIVE_ACCEPTED.md");
  assert.match(step011, /STEP011R8_APPROVAL_CREATION_NOTICE_AND_UI_LIST_REFRESH/);
  assert.match(step011, /198\/198/);
});

test("historical AR1 retains immutable history without owning current accepted baseline", async () => {
  const runner = await source("scripts/run_step012ar1_acceptance.py");
  assert.doesNotMatch(runner, /baseline-accepted-step/);
  assert.doesNotMatch(runner, /baseline-accepted-sha/);
  assert.doesNotMatch(runner, /baseline-feature:/);
  assert.match(runner, /baseline-ar1-step-history/);
  assert.match(runner, /baseline-ar1-feature-history/);
});

test("historical STEP012B validates executor invariants instead of deferred syntax", async () => {
  const runner = await source("scripts/run_step012b_acceptance.py");
  assert.match(runner, /let executor = options\.automationExecutor/);
  assert.match(runner, /state: stateDatabase, executor, ownerId/);
  assert.doesNotMatch(runner, /executor: options\.automationExecutor/);
  assert.doesNotMatch(runner, /STEP012C owns Conversation Run integration/);
});
