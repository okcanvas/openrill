import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (relative) => await readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

test("STEP014DR7 aggregate regressed the already-closed Vue vendor materialization chain", async () => {
  const runner = await read("scripts/run_step014dr7_acceptance.py");
  const workspace = await read("scripts/workspace-runner.mjs");
  const index = await read("apps/agent-web/public/index.html");
  const live = await read("scripts/run-step014dr7-deterministic-nested-ui-live.mjs");
  assert.match(index, /\/vendor\/vue\.runtime\.global\.prod\.js/);
  assert.match(workspace, /if \(externalVendorRoot\)/);
  assert.doesNotMatch(runner, /vue-runtime-acquisition/);
  assert.doesNotMatch(runner, /OPENRILL_VUE_RUNTIME_VENDOR_DIR/);
  assert.doesNotMatch(live, /verifyServedVueRuntime/);
});

test("STEP014DR8 acquires and re-verifies exact Vue before vendor-aware build", async () => {
  const runner = await read("scripts/run_step014dr8_acceptance.py");
  const stageBlock = runner.slice(runner.indexOf("STAGES:"), runner.indexOf("def read_utf8"));
  const acquisition = stageBlock.indexOf('"vue-runtime-acquisition"');
  const reextract = stageBlock.indexOf('"vue-runtime-reextract"');
  const verify = stageBlock.indexOf('"vue-runtime-byte-verification"');
  const build = stageBlock.indexOf('"focused-build"');
  assert.ok(acquisition >= 0 && acquisition < reextract && reextract < verify && verify < build);
  assert.match(runner, /OPENRILL_VUE_RUNTIME_VENDOR_DIR/);
  assert.match(runner, /VENDOR_ENV_STAGES/);
  assert.match(runner, /verify-step014dr8-vue-runtime\.mjs/);
  const verifier = await read("scripts/verify-step014dr8-vue-runtime.mjs");
  for (const token of ["primary.lock.schemaVersion", 'primary.lock.package, "vue"', "primary.lock.archiveFile", "primary.lock.licenseFile"]) {
    assert.ok(verifier.includes(token), token);
  }
});

test("STEP014DR8 deterministic UI verifies served Vue and preserves browser bootstrap evidence", async () => {
  const live = await read("scripts/run-step014dr8-deterministic-nested-ui-live.mjs");
  for (const token of [
    "verifyServedVueRuntime",
    "attachBrowserPageEvidence",
    "enableBrowserPageEvidence",
    "waitForBrowserCondition",
    "navigation.errorText",
    "OPENRILL_STEP014DR8_UI_NAVIGATION_FAILED",
    "startup-phase",
    "vue_runtime=VERIFIED",
    "browser_evidence=CLEAN",
    "await closeBrowser({ child, cdp })",
    "OPENRILL_STEP014DR8_BROWSER_LAUNCH_CLEANUP_FAILED",
    "chromium-taskkill-exit",
    "let primaryError;",
    "const cleanupFailures = []",
    "OPENRILL_STEP014DR8_BODY_AND_CLEANUP_FAILED",
    "OPENRILL_STEP014DR8_CLEANUP_FAILED",
  ]) assert.ok(live.includes(token), token);
  assert.doesNotMatch(live, /await closeBrowser\(browser\)\.catch\(\(\) => undefined\)/);
  assert.doesNotMatch(live, /await host\?\.close\("step014dr8-ui-live"\)\.catch\(\(\) => undefined\)/);
  assert.ok(live.indexOf("verifyServedVueRuntime") < live.indexOf("browser = await launch"));
  const external = await read("scripts/run-step014dr8-external-model-live.mjs");
  assert.match(external, /clientVersion:"0\.14\.11-step014dr8"/);
  assert.match(live, /clientVersion: "0\.14\.11-step014dr8"/);
  const lifecycle = await read("scripts/check_live_acceptance_lifecycle.py");
  assert.match(lifecycle, /run-step014dr8-external-model-live\.mjs/);
  assert.match(lifecycle, /run-step014dr8-deterministic-nested-ui-live\.mjs/);
  assert.match(lifecycle, /current-partial-launch-cleanup/);
});

test("STEP014DR8 remains schema-14 acceptance-only correction", async () => {
  const migrations = await read("packages/state/src/migrations.ts");
  const plan = await read("docs/plans/STEP014DR8_VUE_RUNTIME_MATERIALIZATION_AND_BROWSER_BOOTSTRAP_EVIDENCE_CLOSURE.md");
  assert.match(migrations, /OPENRILL_STATE_SCHEMA_VERSION = (?:1[4-9]|[2-9]\d+) as const/);
  assert.match(plan, /no migration or schema change/);
  assert.match(plan, /no delegation runtime, Protocol, Tool, budget or Control UI product change/);
  const historical = await read("tests/unit/step014dr7-boundaries.test.mjs");
  assert.doesNotMatch(historical, /assert\.equal\(pkg\.version,"0\.14\.10-step014dr7"\)/);
  assert.match(historical, /assert\.notEqual\(pkg\.version,"0\.14\.10-step014dr7"\)/);
});
