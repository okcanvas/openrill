import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("STEP013B1 keeps Playwright in the concrete adapter package", async () => {
  const runtimeManifest = JSON.parse(await read("packages/browser-runtime/package.json"));
  const adapterManifest = JSON.parse(await read("packages/browser-playwright/package.json"));
  const hostManifest = JSON.parse(await read("services/agent-host/package.json"));

  const runtimeDependencies = {
    ...(runtimeManifest.dependencies ?? {}),
    ...(runtimeManifest.devDependencies ?? {}),
    ...(runtimeManifest.optionalDependencies ?? {}),
  };
  assert.equal(Object.keys(runtimeDependencies).some((name) => /playwright|puppeteer/i.test(name)), false);
  assert.equal(adapterManifest.dependencies["playwright-core"], "1.62.0");
  assert.equal(adapterManifest.dependencies["@openrill/browser-runtime"], "workspace:*");
  assert.equal(hostManifest.dependencies["@openrill/browser-playwright"], "workspace:*");
});

test("STEP013B1 preserves concrete adapter metadata before provider-neutral widening", async () => {
  const lifecycle = await read("services/agent-host/src/lifecycle.ts");
  const concreteCreation = lifecycle.indexOf("const defaultBrowserDriver = createPlaywrightBrowserDriver");
  const metadataRead = lifecycle.indexOf("defaultBrowserDriver.executable.executablePath");
  const interfaceAssignment = lifecycle.indexOf("resolvedBrowserDriver = defaultBrowserDriver");
  assert.notEqual(concreteCreation, -1);
  assert.notEqual(metadataRead, -1);
  assert.notEqual(interfaceAssignment, -1);
  assert.ok(concreteCreation < metadataRead, "concrete driver must exist before adapter metadata is read");
  assert.ok(concreteCreation < interfaceAssignment, "concrete driver must be created before widening");
  assert.equal(lifecycle.includes("resolvedBrowserDriver.executable"), false);
});

test("STEP013B1 retires normally closed processes from driver ownership", async () => {
  const driver = await read("packages/browser-playwright/src/driver.ts");
  assert.match(driver, /#retire\(\): void/);
  assert.match(driver, /finally \{\s*this\.#retire\(\);\s*\}/s);
  assert.match(driver, /new PlaywrightProcessHandle\(browser, \(retired\) => this\.#processes\.delete\(retired\)\)/);
  assert.match(driver, /public get activeProcessCount\(\): number \{ return this\.#processes\.size; \}/);
});

test("STEP013B1 closes a browser that resolves after launch abort", async () => {
  const driver = await read("packages/browser-playwright/src/driver.ts");
  assert.match(driver, /const closeLateLaunch = \(\) => \{/);
  assert.match(driver, /launched\.then\(\(lateBrowser\) => lateBrowser\.close\(\)\)\.catch\(\(\) => undefined\)/);
  assert.match(driver, /withAbort\(launched, options\.signal, closeLateLaunch\)/);
});

test("STEP013B1 retains six closed browser tools without protocol or schema migration", async () => {
  const tools = await read("packages/browser-runtime/src/tools.ts");
  const operationRegistry = await read("services/agent-host/src/transport/operation-registry.ts");
  const migrations = await read("packages/state/src/migrations.ts");
  const lifecycle = await read("services/agent-host/src/lifecycle.ts");

  const registered = [...tools.matchAll(/(?:registry\.register|register)\(tool\(\s*"(browser\.[a-z]+)"/g)].map((match) => match[1]);
  assert.deepEqual(registered.slice(0, 6), [
    "browser.status",
    "browser.open",
    "browser.list",
    "browser.navigate",
    "browser.snapshot",
    "browser.close",
  ]);
  assert.equal((tools.match(/additionalProperties: false/g) ?? []).length >= 6, true);
  assert.equal(operationRegistry.includes("browser."), false);
  const currentSchema = Number(/OPENRILL_STATE_SCHEMA_VERSION = (\d+) as const/.exec(migrations)?.[1]);
  assert.ok(currentSchema >= 9);
  assert.match(lifecycle, /registerBrowserTools\(tools, browserRuntime(?:,|\))/);
});
