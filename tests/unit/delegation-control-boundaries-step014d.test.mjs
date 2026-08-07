import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read=(path)=>readFile(new URL(`../../${path}`,import.meta.url),"utf8");

test("STEP014D adds only three closed delegation Protocol operations",async()=>{
  const protocol=await read("packages/protocol/src/delegation-operations.ts");
  const validation=await read("packages/protocol/src/validation.ts");
  const registry=await read("services/agent-host/src/transport/operation-registry.ts");
  for(const name of ["delegation.list","delegation.get","delegation.cancel"]) assert.match(registry,new RegExp(`name: \\"${name.replace(".","\\.")}\\"`));
  assert.doesNotMatch(registry,/delegation\.(spawn|wait|transcript|reasoning|raw)/);
  assert.match(validation,/rootRunId or parentRunId, not both/);
  assert.match(protocol,/readonly events: readonly PublicDelegationEventView\[\]/);
});

test("Control UI owns a parent-child delegated-work route with bounded fields and operator cancel",async()=>{
  const app=await read("apps/agent-web/src/browser-app.ts");
  const css=await read("apps/agent-web/public/assets/app.css");
  assert.match(app,/"delegations"/);
  assert.match(app,/delegation\.list/);
  assert.match(app,/delegation\.get/);
  assert.match(app,/delegation\.cancel/);
  assert.match(app,/Raw child transcripts are not exposed/);
  assert.match(app,/selected\.usage\.turns/);
  assert.match(app,/selected\.artifacts/);
  assert.match(app,/Cancel subtree/);
  assert.doesNotMatch(app,/child\.transcript|child\.reasoning|taskSha256/);
  assert.match(css,/\.delegation-layout/);
});

test("Host operator cancellation reuses deepest-first resource cleanup and publishes bounded notice",async()=>{
  const host=await read("services/agent-host/src/lifecycle.ts");
  assert.match(host,/subtreeCancellationOrder\(before\.childRunId\)/);
  assert.match(host,/terminateDelegationOrder\(order, "CANCELLED", "OPERATOR_CANCELLED"\)/);
  assert.match(host,/protocol\.publishNotice\("delegation\.updated"/);
  assert.doesNotMatch(host,/rawTask|rawTranscript|reasoning/);
});

test("public service projection strips event payload and bounds event history",async()=>{
  const delegation=await read("packages/conversations/src/delegation.ts");
  assert.match(delegation,/listEvents\(delegation\.delegationId\)\.slice\(-100\)/);
  assert.match(delegation,/sequence: event\.sequence, eventType: event\.eventType, emittedAt: event\.emittedAt/);
});

test("STEP014D live fixture requires explicit model and renders served Control UI in Chromium", async () => {
  const live = await read("scripts/run-step014d-live.mjs");
  for (const token of [
    'required("OPENAI_API_KEY")', 'required("OPENRILL_STEP014D_MODEL")',
    "resolveChromiumExecutable", 'nav-delegations',
    'delegation-tree-render', 'delegation-detail-render',
    "chromium_orphan=0",
  ]) assert.ok(live.includes(token), token);
  assert.equal(/model\s*=\s*["'](?:gpt|o[1345])[^"']*["']/i.test(live), false);
});

test("STEP014D retains immutable acceptance and package entrypoints after corrective ownership advances", async () => {
  const rootPackage = JSON.parse(await read("package.json"));
  assert.equal(rootPackage.scripts["acceptance:step014d"], "python scripts/run_step014d_acceptance.py");
  assert.equal(rootPackage.scripts["package:step014d"], "python scripts/package_step014d.py --output ../openrill-step014d-delegated-work-control-ui-windows-vertical-slice-v1.zip");
  assert.ok((await read("docs/plans/STEP014D_DELEGATED_WORK_CONTROL_UI_AND_WINDOWS_VERTICAL_SLICE.md")).includes("STEP014D_DELEGATED_WORK_CONTROL_UI_AND_WINDOWS_VERTICAL_SLICE"));
});

test("OR-ISSUE-146 through OR-ISSUE-156 are documented and gated", async () => {
  const registry = await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates = await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  for (let number = 146; number <= 156; number += 1) {
    const id = `OR-ISSUE-${number}`;
    assert.ok(registry.includes(id), id);
    assert.ok(gates.includes(id), id);
    assert.ok((await read(`reference/validation/STEP014D_OR_ISSUE_${number}.md`)).includes(id), id);
  }
});
