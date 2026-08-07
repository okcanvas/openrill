import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inspectRuntime, isDirectExecution, parseVersion } from "../../openrill.mjs";

test("version parsing is deterministic", () => {
  assert.deepEqual(parseVersion("22.16.0"), { major: 22, minor: 16, patch: 0 });
});

test("current runtime exposes required foundation capabilities", () => {
  const result = inspectRuntime();
  assert.equal(result.versionSupported, true);
  assert.equal(result.sqliteAvailable, true);
});

test("direct execution uses a canonical file URL instead of URL scheme guessing", () => {
  const argv1 = resolve("openrill.mjs");
  const moduleUrl = pathToFileURL(argv1).href;
  assert.equal(isDirectExecution(moduleUrl, argv1), true);
  assert.equal(isDirectExecution(moduleUrl, resolve("not-openrill.mjs")), false);
});
