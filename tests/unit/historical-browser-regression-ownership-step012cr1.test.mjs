import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const root = new URL("../../", import.meta.url);
const text = async (relative) => readFile(new URL(relative, root), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("accepted STEP012BR1 browser evidence remains immutable", async () => {
  const baseline = JSON.parse(await text("reference/validation/STEP012BR1_BROWSER_SURFACE_BASELINE.json"));
  assert.equal(baseline.acceptedStep, "STEP012BR1_HISTORICAL_ACCEPTANCE_BASELINE_OWNERSHIP");
  assert.equal(baseline.acceptedZipSha256, "b90721d4d24f7467355f1f2dcd7e94d65f03517a7f60ff8208fa0c915f6ccbde");
  assert.equal(Object.keys(baseline.browserSurfaceSha256).length, 6);
  for (const value of Object.values(baseline.browserSurfaceSha256)) assert.match(value, /^[a-f0-9]{64}$/);
});

test("STEP012D browser changes fail closed under the historical no-impact verifier", () => {
  const result = spawnSync("python", ["scripts/verify_historical_browser_no_impact.py"], {
    cwd: new URL("../../", import.meta.url), encoding: "utf8",
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /OPENRILL_HISTORICAL_BROWSER_NO_IMPACT_FAIL/);
  assert.match(result.stdout, /browser_surface:apps\/agent-web\/src\/browser-app\.ts/);
  assert.match(result.stdout, /browser_surface:apps\/agent-web\/public\/assets\/app\.css/);
});

test("STEP012C delegated mode is explicit and default remains Chromium", async () => {
  const source = await text("scripts/run_step012c_acceptance.py");
  assert.match(source, /OPENRILL_BROWSER_REGRESSION_MODE/);
  assert.match(source, /accepted-no-impact/);
  assert.match(source, /ACCEPTED_BASELINE_NO_IMPACT/);
  assert.match(source, /else 'CHROMIUM'/);
  assert.match(source, /run_step012br1_acceptance\.py/);
});

test("STEP012D owns the next actual browser vertical slice", async () => {
  const plan = await text("reference/validation/STEP012C_WINDOWS_HISTORICAL_BROWSER_RUNTIME_OWNERSHIP.md");
  const gates = await text("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  assert.match(plan, /STEP012D.*actual Chromium/s);
  assert.match(gates, /STEP012D.*actual Windows Chromium vertical slice/s);
});
