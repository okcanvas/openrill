import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const browser = await readFile(new URL("../../apps/agent-web/src/browser-app.ts", import.meta.url), "utf8");
const live = await readFile(new URL("../../scripts/run-step012d-live.mjs", import.meta.url), "utf8");

test("Automation history rows use a dedicated testid namespace", () => {
  assert.match(browser, /data-testid": `automation-history-row-\$\{run\.automationRunId\}`/);
  assert.doesNotMatch(browser, /data-testid": `automation-run-\$\{run\.automationRunId\}`/);
});

test("run-now action cannot match the history row selector", () => {
  assert.match(browser, /data-testid": "automation-run-now"/);
  assert.doesNotMatch("automation-run-now", /^automation-history-row-/);
});

test("actual Chromium counts only dedicated history rows", () => {
  const matches = live.match(/document\.querySelectorAll\('\[data-testid\^="automation-history-row-"\]'\)\.length/g) ?? [];
  assert.equal(matches.length, 2);
  assert.doesNotMatch(live, /querySelectorAll\('\[data-testid\^="automation-run-"\]'\)/);
});

test("actual Chromium retains an independent exact SQLite run-count assertion", () => {
  assert.match(live, /if \(runs\.length !== 1 \|\| runs\[0\]\.status !== "SUCCEEDED"/);
  assert.match(live, /providerRequests !== 1/);
});
