import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read=(path)=>readFile(new URL(`../../${path}`,import.meta.url),"utf8");

test("STEP014DR1 retains immutable correction identity and entrypoints without freezing the current release",async()=>{
  const root=JSON.parse(await read("package.json"));
  const plan=await read("docs/plans/STEP014DR1_SOURCE_ROOT_ARCHIVE_BOUNDARY_AND_EXTERNAL_MODEL_FAILURE_DIAGNOSTICS.md");
  assert.match(plan,/version=0\.14\.4-step014dr1/);
  assert.notEqual(root.version,"0.14.4-step014dr1");
  assert.equal(root.scripts["acceptance:step014d"],"python scripts/run_step014d_acceptance.py");
  assert.equal(root.scripts["acceptance:step014dr1"],"python scripts/run_step014dr1_acceptance.py");
  assert.match(root.scripts["package:step014dr1"],/openrill-step014dr1-source-root-archive-boundary-external-model-failure-diagnostics-v1\.zip/);
});

test("STEP014DR1 live failure path emits typed privacy-safe database diagnostics before cleanup",async()=>{
  const live=await read("scripts/run-step014d-live.mjs");
  const helper=await read("scripts/step014dr1-live-diagnostics.mjs");
  assert.match(live,/collectExternalModelRunDiagnostics/);
  assert.match(live,/OPENRILL_STEP014DR1_ROOT_FAILURE_DIAGNOSTICS/);
  assert.ok(live.indexOf("formatExternalModelRunDiagnostics") < live.indexOf("await rm(root"));
  for(const token of ["modelInvocations","latestEvents","runFailure","messageSha256","messageLength"])assert.ok(helper.includes(token),token);
  assert.doesNotMatch(helper,/conversation_messages|arguments_json|reasoning|transcript/i);
});

test("STEP014DR1 source-root boundary rejects release archives without weakening package manifest exactness",async()=>{
  const boundary=await read("scripts/check_source_root_boundary.py");
  const generator=await read("scripts/generate_package_manifest.py");
  const verifier=await read("scripts/verify_package_manifest.py");
  assert.match(boundary,/move_archives_outside_source_root/);
  assert.match(boundary,/openrill-step/);
  assert.doesNotMatch(generator,/\.zip/);
  assert.doesNotMatch(verifier,/\.zip/);
});

test("OR-ISSUE-157 through OR-ISSUE-160 are documented and gated",async()=>{
  const registry=await read("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const gates=await read("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  for(let n=157;n<=160;n+=1){const id=`OR-ISSUE-${n}`;assert.ok(registry.includes(id),id);assert.ok(gates.includes(id),id);assert.ok((await read(`reference/validation/STEP014DR1_OR_ISSUE_${n}.md`)).includes(id),id);}
});
