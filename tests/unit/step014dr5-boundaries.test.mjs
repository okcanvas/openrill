import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("STEP014DR5 retains the completed nested delegation proof and changes only UI entrypoint verification", async () => {
  const live = await read("scripts/run-step014d-live.mjs");
  for (const token of ["items.filter(item=>item.depth===1).length>=2", "items.some(item=>item.depth===2)", "CONTROL_UI_MODULE_ENTRYPOINT", "delegation-tree-render", "delegation-detail-render"]) assert.ok(live.includes(token), token);
});

test("STEP014DR5 does not create a compatibility alias for the invalid historical asset path", async () => {
  const server = await read("services/agent-host/src/control-server.ts");
  const live = await read("scripts/run-step014d-live.mjs");
  assert.equal(server.includes('"/assets/app.js"'), false);
  assert.equal(live.includes("/assets/app.js"), false);
});

test("STEP014DR5 static contract is owned by index, build, and live validation without schema or Protocol changes", async () => {
  const contract = await read("scripts/control-ui-static-contract.mjs");
  const index = await read("apps/agent-web/public/index.html");
  assert.match(contract, /CONTROL_UI_MODULE_ENTRYPOINT = "\/assets\/web\/browser-app\.js"/);
  assert.match(index, /type="module" src="\/assets\/web\/browser-app\.js"/);
  const migrations = await read("packages/state/src/migrations.ts");
  assert.match(migrations, /OPENRILL_STATE_SCHEMA_VERSION = (?:1[4-9]|[2-9]\d+) as const/);
});

test("STEP014DR5 documents the Windows 404 false negative and recurrence gate", async () => {
  for (const path of ["reference/validation/STEP014DR5_OR_ISSUE_173.md", "docs/governance/ENGINEERING_ISSUE_REGISTRY.md", "docs/testing/RECURRENCE_PREVENTION_GATES.md"]) {
    assert.ok((await read(path)).includes("OR-ISSUE-173"), path);
  }
});
