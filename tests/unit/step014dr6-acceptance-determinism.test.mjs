import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedDeterministicNestedDelegationFixture } from "../../scripts/step014dr6-deterministic-nested-fixture.mjs";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { DelegationService } from "../../packages/conversations/dist/index.js";

test("deterministic nested fixture creates two direct children and one depth-2 grandchild",async()=>{const root=await mkdtemp(join(tmpdir(),"openrill-step014dr6-test-"));const env={OPENRILL_DATA_ROOT:join(root,"data"),OPENRILL_CONFIG_ROOT:join(root,"config")};try{const seeded=await seedDeterministicNestedDelegationFixture({profile:"fixture",env,workspaceId:"alpha"});const state=await openOpenRillStateDatabase({profilePaths:resolveProfilePaths({profile:"fixture",env})});try{const delegations=new DelegationService({state,workspaceIds:["alpha"]});const items=delegations.listPublic({rootRunId:seeded.rootRunId,limit:20});assert.equal(items.length,3);assert.equal(items.filter(item=>item.depth===1).length,2);assert.equal(items.filter(item=>item.depth===2).length,1);assert.ok(items.every(item=>item.status==="COMPLETED"));}finally{state.close();}}finally{await rm(root,{recursive:true,force:true});}});

test("external-model stage requires direct parallel delegation but not stochastic nested Tool choice",async()=>{const source=await import("node:fs/promises").then(fs=>fs.readFile(new URL("../../scripts/run-step014dr6-external-model-live.mjs",import.meta.url),"utf8"));assert.match(source,/Call agent\.spawn twice without waiting/);assert.match(source,/direct\.length>=2/);assert.doesNotMatch(source,/maxNestedDepth|grandchild|depth===2|resolveChromiumExecutable/);});

test("deterministic nested UI stage owns depth-2 and Chromium evidence without an external API key",async()=>{const source=await import("node:fs/promises").then(fs=>fs.readFile(new URL("../../scripts/run-step014dr6-deterministic-nested-ui-live.mjs",import.meta.url),"utf8"));assert.match(source,/seedDeterministicNestedDelegationFixture/);assert.match(source,/depth===2/);assert.match(source,/resolveChromiumExecutable/);assert.match(source,/chromium_orphan=0/);assert.doesNotMatch(source,/required\("OPENAI_API_KEY"\)/);});

test("DR6 acceptance separates external model and deterministic nested UI stages",async()=>{const source=await import("node:fs/promises").then(fs=>fs.readFile(new URL("../../scripts/run_step014dr6_acceptance.py",import.meta.url),"utf8"));assert.match(source,/external-model-parallel-live/);assert.match(source,/deterministic-nested-control-ui-live/);assert.doesNotMatch(source,/external-model-control-ui-live/);});
