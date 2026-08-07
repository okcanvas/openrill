import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read=(path)=>readFile(new URL(`../../${path}`,import.meta.url),"utf8");

test("STEP014DR2 retains its entrypoints without freezing later current identity",async()=>{
  const root=JSON.parse(await read("package.json"));
  const plan=await read("docs/plans/STEP014DR2_OPENAI_RESPONSES_FUNCTION_NAME_ALIAS_AND_CANONICAL_TOOL_ROUND_TRIP.md");
  assert.match(plan,/0\.14\.5-step014dr2/);
  assert.notEqual(root.version,"0.14.5-step014dr2");
  assert.match(root.version,/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/);
  assert.equal(root.scripts["acceptance:step014dr1"],"python scripts/run_step014dr1_acceptance.py");
  assert.equal(root.scripts["acceptance:step014dr2"],"python scripts/run_step014dr2_acceptance.py");
  assert.match(root.scripts["package:step014dr2"],/openrill-step014dr2-openai-responses-function-name-alias-canonical-tool-round-trip-v1\.zip/);
});

test("OpenAI adapter owns provider-safe deterministic aliases and canonical reverse mapping",async()=>{
  const source=await read("packages/model-openai-responses/src/index.ts");
  for(const token of ["OPENAI_FUNCTION_NAME","hashedAlias","canonicalToProvider","providerToCanonical","canonicalToolName","providerToolName"])assert.ok(source.includes(token),token);
  assert.match(source,/\^\[A-Za-z0-9_-\]\{1,64\}\$/);
  assert.match(source,/createHash\("sha256"\)/);
  assert.match(source,/MODEL_STREAM_INVALID/);
});

test("STEP014DR2 retains schema, delegation surface, diagnostics and archive boundary",async()=>{
  const migrations=await read("packages/state/src/migrations.ts");
  const tools=await read("packages/tools-delegation/src/index.ts");
  const registry=await read("services/agent-host/src/transport/operation-registry.ts");
  const live=await read("scripts/run-step014d-live.mjs");
  const boundary=await read("scripts/check_source_root_boundary.py");
  assert.match(migrations,/OPENRILL_STATE_SCHEMA_VERSION = (?:1[4-9]|[2-9]\d+) as const/);
  for(const name of ["agent.spawn","agent.wait"])assert.ok(tools.includes(`name: "${name}"`),name);
  for(const name of ["delegation.list","delegation.get","delegation.cancel"])assert.ok(registry.includes(`name: "${name}"`),name);
  assert.match(live,/OPENRILL_STEP014DR1_ROOT_FAILURE_DIAGNOSTICS/);
  assert.match(boundary,/move_archives_outside_source_root/);
});

test("OR-ISSUE-161 through OR-ISSUE-163 are documented and gated",async()=>{
  const registry=await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates=await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  for(let n=161;n<=163;n+=1){const id=`OR-ISSUE-${n}`;assert.ok(registry.includes(id),id);assert.ok(gates.includes(id),id);assert.ok((await read(`reference/validation/STEP014DR2_OR_ISSUE_${n}.md`)).includes(id),id);}
});
