import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("STEP013B2 keeps interaction ownership provider-neutral", async () => {
  const types = await read("packages/browser-runtime/src/types.ts");
  const runtimeManifest = JSON.parse(await read("packages/browser-runtime/package.json"));
  assert.match(types, /export type BrowserPageAction =/);
  assert.match(types, /act\(action: BrowserPageAction/);
  assert.match(types, /assertNavigationAllowed: \(url: string\) => Promise<void>/);
  const dependencies = {
    ...(runtimeManifest.dependencies ?? {}),
    ...(runtimeManifest.devDependencies ?? {}),
    ...(runtimeManifest.optionalDependencies ?? {}),
  };
  assert.equal(Object.keys(dependencies).some((name) => /playwright|puppeteer/i.test(name)), false);
});

test("STEP013B2 maps Playwright AI refs to actionable aria-ref locators", async () => {
  const driver = await read("packages/browser-playwright/src/driver.ts");
  assert.match(driver, /ariaSnapshot\(\{ mode: "ai", timeout: options\.timeoutMs \}\)/);
  assert.match(driver, /elementId: `aria:\$\{ref\}`/);
  assert.match(driver, /page\.locator\(`aria-ref=\$\{ref\}`\)/);
  assert.match(driver, /MAX_ELEMENTS = 500/);
  assert.match(driver, /MAX_TEXT_CHARS = 20_000/);
});

test("STEP013B2 guards top-level navigation requests before dispatch", async () => {
  const driver = await read("packages/browser-playwright/src/driver.ts");
  const route = driver.indexOf('context.route("**/*"');
  const guard = driver.indexOf("await options.assertNavigationAllowed(request.url())");
  const proceed = driver.indexOf("await route.continue()", guard);
  const abort = driver.indexOf('await route.abort("blockedbyclient")', guard);
  assert.ok(route >= 0 && route < guard);
  assert.ok(guard < proceed);
  assert.ok(guard < abort);
  assert.match(driver, /request\.isNavigationRequest\(\)/);
  assert.match(driver, /frame\.parentFrame\(\) !== null/);
});

test("STEP013B2 blocks and safely dismisses modal dialogs", async () => {
  const driver = await read("packages/browser-playwright/src/driver.ts");
  const runtime = await read("packages/browser-runtime/src/runtime.ts");
  const errors = await read("packages/browser-runtime/src/errors.ts");
  assert.match(driver, /const settled = dialog\.dismiss\(\)/);
  assert.match(driver, /dialog: outcome\.dialog\.observation/);
  assert.match(runtime, /"BROWSER_DIALOG_BLOCKED"/);
  assert.match(runtime, /action\.dialog_blocked/);
  assert.match(errors, /\| "BROWSER_DIALOG_BLOCKED"/);
});

test("STEP013B2 publishes exactly six additional closed tools without schema migration", async () => {
  const tools = await read("packages/browser-runtime/src/tools.ts");
  const operationRegistry = await read("services/agent-host/src/transport/operation-registry.ts");
  const migrations = await read("packages/state/src/migrations.ts");
  const registered = [...tools.matchAll(/(?:registry\.register|register)\(tool\(\s*"(browser\.[a-z]+)"/g)].map((match) => match[1]);
  assert.deepEqual(registered.slice(0, 12), [
    "browser.status",
    "browser.open",
    "browser.list",
    "browser.navigate",
    "browser.snapshot",
    "browser.close",
    "browser.click",
    "browser.type",
    "browser.press",
    "browser.select",
    "browser.fill",
    "browser.wait",
  ]);
  assert.equal((tools.match(/additionalProperties: false/g) ?? []).length >= 12, true);
  assert.equal(operationRegistry.includes("browser."), false);
  const currentSchema = Number(/OPENRILL_STATE_SCHEMA_VERSION = (\d+) as const/.exec(migrations)?.[1]);
  assert.ok(currentSchema >= 9);
});

test("stale-ref recovery is fail-closed and never auto-dispatches an action", async () => {
  const runtime = await read("packages/browser-runtime/src/runtime.ts");
  const tools = await read("packages/browser-runtime/src/tools.ts");
  const resolveIndex = tools.indexOf("resolveOwnedElementRef");
  const actIndex = tools.indexOf("runtime.actOwned", resolveIndex);
  assert.ok(resolveIndex >= 0 && resolveIndex < actIndex);
  assert.match(runtime, /recoverySnapshot/);
  assert.match(runtime, /use recoverySnapshot refs and retry/);
  assert.match(runtime, /action\.stale_ref_recovered/);
});

test("historical STEP013B1 tests and runners retain the feature prefix without freezing additions", async () => {
  const observation = await read("tests/unit/browser-observation-step013b1.test.mjs");
  const boundaries = await read("tests/unit/browser-playwright-boundaries-step013b1.test.mjs");
  const runner = await read("scripts/run_step013b1_acceptance.py");
  const correctiveRunner = await read("scripts/run_step013b1a_acceptance.py");
  assert.match(observation, /names\.filter/);
  assert.match(boundaries, /registered\.slice\(0, 6\)/);
  assert.match(runner, /registered_browser_tools\[:6\]/);
  assert.match(correctiveRunner, /registered_browser_tools\[:6\]/);
  assert.equal(observation.includes("assert.deepEqual(tools.definitions().map"), false);
  const reporterTest = await read("tests/unit/focused-test-reporter-step013b1a.test.mjs");
  assert.equal(reporterTest.includes('assert.equal(packageJson.version, "0.13.6-step013b1a")'), false);
  const baselineScope = await read("tests/unit/historical-acceptance-baseline-scope-step012br1.test.mjs");
  assert.match(baselineScope, /config\/current-accepted-baseline\.json/);
  assert.equal(baselineScope.includes("STEP013AR4_ACCEPTANCE_STAGE_RUNNER_FIXTURE_IMPORT_ALIGNMENT"), false);
});
