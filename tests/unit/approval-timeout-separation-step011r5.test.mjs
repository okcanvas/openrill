import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateAndMaterializeConfig } from "../../packages/config/dist/index.js";

const root = new URL("../../", import.meta.url);

async function source(relative) {
  return readFile(new URL(relative, root), "utf8");
}

test("execution config materializes independent process and approval timeouts", () => {
  const config = validateAndMaterializeConfig({
    version: 1,
    execution: {
      approvalMode: "ask",
      defaultTimeoutMs: 5_000,
      approvalTimeoutMs: 120_000,
    },
  });
  assert.equal(config.execution.defaultTimeoutMs, 5_000);
  assert.equal(config.execution.approvalTimeoutMs, 120_000);
});

test("execution timeout defaults remain explicit and backward compatible", () => {
  const config = validateAndMaterializeConfig({ version: 1 });
  assert.equal(config.execution.approvalMode, "ask");
  assert.equal(config.execution.defaultTimeoutMs, 120_000);
  assert.equal(config.execution.approvalTimeoutMs, 120_000);
});

test("host lifecycle wires approval and process clocks to different config fields", async () => {
  const lifecycle = await source("services/agent-host/src/lifecycle.ts");
  assert.match(lifecycle, /timeoutMs:\s*options\.config\?\.execution\.approvalTimeoutMs\s*\?\?\s*120_000/);
  assert.match(lifecycle, /defaultTimeoutMs:\s*options\.config\.execution\.defaultTimeoutMs/);
  assert.doesNotMatch(lifecycle, /timeoutMs:\s*options\.config\?\.execution\.defaultTimeoutMs/);
});

test("STEP011 browser fixture keeps a short process timeout and a human approval window", async () => {
  const live = await source("scripts/run-step011-live.mjs");
  assert.match(live, /defaultTimeoutMs: 5000\\n  approvalTimeoutMs: 120000/);
  assert.doesNotMatch(live, /approvalMode: ask\\n  defaultTimeoutMs: 5000\\n`/);
});
