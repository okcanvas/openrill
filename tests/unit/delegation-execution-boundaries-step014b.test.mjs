import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
const ROOT=new URL("../../",import.meta.url);const text=(p)=>readFile(new URL(p,ROOT),"utf8");
async function filesUnder(relative){const out=[];async function walk(url,prefix=""){for(const e of await readdir(url,{withFileTypes:true})){if(["dist","node_modules",".artifacts"].includes(e.name))continue;const n=new URL(`${e.name}${e.isDirectory()?"/":""}`,url);const name=`${prefix}${e.name}`;if(e.isDirectory())await walk(n,`${name}/`);else out.push([name,await readFile(n,"utf8")]);}}await walk(new URL(relative,ROOT));return out;}

test("STEP014B owns schema 13 result delivery without rewriting migration 012",async()=>{const migrations=await text("packages/state/src/migrations.ts");const sql=await text("packages/state/migrations/013_delegation_result_delivery.sql");assert.match(migrations,/OPENRILL_STATE_SCHEMA_VERSION = (?:1[3-9]|[2-9][0-9]) as const/);assert.ok(sql.includes("CREATE TABLE run_delegation_result_deliveries"));for(const token of ["UNIQUE (parent_run_id, parent_tool_call_id)","CHECK (tool_name = 'agent.wait')","PENDING","DELIVERED"])assert.ok(sql.includes(token),token);assert.ok((await text("packages/state/migrations/012_delegation_graph_budget_foundation.sql")).includes("CREATE TABLE run_delegations"));});

test("STEP014B publishes only agent.spawn and agent.wait as closed delegation schemas",async()=>{const source=await text("packages/tools-delegation/src/index.ts");assert.ok(source.includes('name: "agent.spawn"'));assert.ok(source.includes('name: "agent.wait"'));assert.equal((source.match(/additionalProperties: false/g)??[]).length>=2,true);assert.equal(/agent\.(?:cancel|list|inspect|delegate)/.test(source),false);});

test("child Tool scope is enforced at model declaration and dispatch",async()=>{const kernel=await text("packages/agent-kernel/src/kernel.ts");const errors=await text("packages/agent-kernel/src/errors.ts");assert.ok(kernel.includes("modelToolDefinitions"));assert.ok(kernel.includes("allowedToolNames.has(definition.name)"));assert.ok(kernel.includes("AGENT_TOOL_NOT_ALLOWED"));assert.ok(errors.includes("AGENT_TOOL_NOT_ALLOWED"));});

test("Host wires delegation Tools, child completion, parent resume, and child Skill isolation",async()=>{const host=await text("services/agent-host/src/lifecycle.ts");for(const token of ["new DelegationService","registerDelegationTools","ensureScheduled","completeChild","completion.resumeParent","runCoordinator?.resume","budget?.parentRunId","DEFAULT_AGENT_SYSTEM_INSTRUCTIONS"])assert.ok(host.includes(token),token);assert.ok((await text("services/agent-host/package.json")).includes("@openrill/tools-delegation"));});

test("durable wait owns ABORTED rollover and exactly-once checkpoint delivery",async()=>{const service=await text("packages/conversations/src/service.ts");const delegation=await text("packages/conversations/src/delegation.ts");for(const token of ["DELEGATION_WAIT","WAITING_DELEGATION","recoveryState: \"RESUMABLE\""])assert.ok(service.includes(token),token);for(const token of ["getResultDeliveryByToolCall","tool-complete:","checkpoint:tool:","markResultDelivered","delegation.resolved"])assert.ok(delegation.includes(token),token);});

test("parent result is bounded and excludes raw child transcript and reasoning",async()=>{const source=await text("packages/conversations/src/delegation.ts");assert.ok(source.includes("MAX_PARENT_RESULT_SUMMARY_CHARS = 8_192"));assert.ok(source.includes("MAX_PARENT_RESULT_ARTIFACTS = 32"));assert.equal(/reasoningSummary.*DelegationTerminalResult|rawTranscript|childTranscript/i.test(source),false);assert.ok(source.includes("taskSha256"));});

test("STEP014B historical protocol and UI exclusion remains documented without freezing the current surface",async()=>{const plan=await text("docs/plans/STEP014B_SINGLE_CHILD_DELEGATED_EXECUTION_AND_DURABLE_PARENT_RESUME.md");assert.match(plan,/protocol|Control UI/i);assert.match(plan,/no detached, nested, parallel, Protocol, UI/i);const tools=await text("packages/tools-delegation/src/index.ts");assert.ok(tools.includes('name: "agent.spawn"'));assert.ok(tools.includes('name: "agent.wait"'));});

test("STEP014B retained feature identity does not own the mutable accepted baseline",async()=>{const accepted=JSON.parse(await text("config/current-accepted-baseline.json"));assert.equal(typeof accepted.step,"string");assert.equal(typeof accepted.checks,"string");assert.ok((await text("docs/plans/STEP014B_SINGLE_CHILD_DELEGATED_EXECUTION_AND_DURABLE_PARENT_RESUME.md")).includes("0.14.1-step014b"));});

test("STEP014B issue records and recurrence gates are complete",async()=>{const registry=await text("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");const gates=await text("docs/testing/RECURRENCE_PREVENTION_GATES.md");for(let n=129;n<=136;n++){const id=`OR-ISSUE-${n}`;assert.ok(registry.includes(id),id);assert.ok(gates.includes(id),id);assert.ok((await text(`reference/validation/STEP014B_OR_ISSUE_${n}.md`)).includes(id));}});

test("tools-delegation is part of the zero-dist TypeScript build graph before Host",async()=>{
  const build=JSON.parse(await text("tsconfig.build.json"));
  const paths=build.references.map((entry)=>entry.path);
  const delegated=paths.indexOf("packages/tools-delegation");
  const host=paths.indexOf("services/agent-host");
  assert.ok(delegated>=0);
  assert.ok(host>delegated);
  const hostManifest=JSON.parse(await text("services/agent-host/package.json"));
  assert.equal(hostManifest.dependencies["@openrill/tools-delegation"],"workspace:*");
  const lock=await text("pnpm-lock.yaml");
  const importer=lock.split("  services/agent-host:")[1]?.split("\n  skills/builtin:")[0] ?? "";
  assert.ok(importer.includes("'@openrill/tools-delegation':"));
  assert.ok(importer.includes("version: link:../../packages/tools-delegation"));
});
