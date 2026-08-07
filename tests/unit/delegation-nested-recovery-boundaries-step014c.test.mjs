import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const root=new URL("../../",import.meta.url);
const text=(path)=>readFile(new URL(path,root),"utf8");

test("STEP014C owns schema 14 reservation release without rewriting migrations 012 or 013",async()=>{const migrations=await text("packages/state/src/migrations.ts");const sql=await text("packages/state/migrations/014_delegation_reservation_release_and_recovery.sql");assert.match(migrations,/OPENRILL_STATE_SCHEMA_VERSION = (?:1[4-9]|[2-9]\d+) as const/);for(const token of ["run_delegation_budget_reservations","RESERVED","RELEASED","delegated_used_input_tokens","delegated_used_output_tokens"])assert.ok(sql.includes(token),token);assert.ok((await text("packages/state/migrations/012_delegation_graph_budget_foundation.sql")).includes("CREATE TABLE run_delegations"));assert.ok((await text("packages/state/migrations/013_delegation_result_delivery.sql")).includes("CREATE TABLE run_delegation_result_deliveries"));});

test("reservation release is exactly-once and charges parent actual usage rather than reserved maxima",async()=>{const repository=await text("packages/state/src/delegation-repository.ts");for(const token of ["WHERE delegation_id=? AND status='RESERVED'","delegated_used_turns=delegated_used_turns+?","delegated_used_input_tokens=delegated_used_input_tokens+?","delegated_used_output_tokens=delegated_used_output_tokens+?","delegation budget release conflicts with durable charge"])assert.ok(repository.includes(token),token);});

test("nested delegation remains bounded by depth and inherited Tool scope",async()=>{const tools=await text("packages/tools-delegation/src/index.ts");for(const token of ["maxNestedDepth","maxActiveChildren","maxTotalChildren","parent scope does not permit nested delegation","agent.spawn and agent.wait are controlled by maxNestedDepth"])assert.ok(tools.includes(token),token);assert.match(tools,/additionalProperties: false/);});

test("Kernel total budgets include completed descendant usage",async()=>{const kernel=await text("packages/agent-kernel/src/kernel.ts");for(const token of ["delegatedUsedTurns","delegatedUsedInputTokens","delegatedUsedOutputTokens","delegatedUsedModelCalls","delegatedUsedToolCalls"])assert.ok(kernel.includes(token),token);});

test("Host startup reconciles terminal children and reschedules runnable children",async()=>{const lifecycle=await text("services/agent-host/src/lifecycle.ts");assert.ok(lifecycle.includes("delegations.reconcileTerminalChildren()"));assert.ok(lifecycle.includes("delegations.runnableChildRunIds()"));assert.ok(lifecycle.includes("runCoordinator.ensureScheduled(childRunId)"));});

test("Host timeout and cancellation cascade clean descendant resources deepest-first",async()=>{const lifecycle=await text("services/agent-host/src/lifecycle.ts");for(const token of ["delegations.cancellationOrder(runId)","delegations.subtreeCancellationOrder(childRunId)","cancelOwnedResources(entry.childRunId)","DELEGATION_TIMEOUT","PARENT_CANCELLED"])assert.ok(lifecycle.includes(token),token);});

test("STEP014C historical protocol and Control UI exclusion remains documented without freezing STEP014D",async()=>{const plan=await text("docs/plans/STEP014C_BOUNDED_NESTED_DELEGATION_PARALLELISM_AND_RESTART_RECOVERY.md");assert.match(plan,/protocol|Control UI/i);assert.match(plan,/excluded|제외|not added/i);const migration=await text("packages/state/migrations/014_delegation_reservation_release_and_recovery.sql");assert.ok(migration.includes("run_delegation_budget_reservations"));});

test("STEP014B historical gates retain feature ownership without freezing current schema",async()=>{const runtime=await text("tests/unit/delegation-execution-step014b.test.mjs");const boundaries=await text("tests/unit/delegation-execution-boundaries-step014b.test.mjs");assert.ok(runtime.includes("schemaVersion>=13"));assert.ok(runtime.includes("m.version===13"));assert.equal(boundaries.includes("OPENRILL_STATE_SCHEMA_VERSION = 13 as const"),false);});


test("STEP014C identity is retained without owning the mutable current package generators",async()=>{const plan=await text("docs/plans/STEP014C_BOUNDED_NESTED_DELEGATION_PARALLELISM_AND_RESTART_RECOVERY.md");assert.ok(plan.includes("0.14.2-step014c"));const rootPackage=JSON.parse(await text("package.json"));assert.notEqual(rootPackage.version,"0.14.2-step014c");for(const path of ["scripts/generate_package_manifest.py","scripts/verify_package_manifest.py","scripts/verify_source_version_alignment.py"]){const body=await text(path);assert.ok(body.includes(rootPackage.version),path);}});
