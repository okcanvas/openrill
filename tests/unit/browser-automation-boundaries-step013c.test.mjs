import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

test("STEP013C owns schema 11 and an append-only Browser Automation ledger migration", async () => {
  const migrations = await source("packages/state/src/migrations.ts");
  const migration = await source("packages/state/migrations/011_browser_automation_ledger.sql");
  assert.match(migrations, /OPENRILL_STATE_SCHEMA_VERSION = (?:1[1-9]|[2-9][0-9]+) as const/);
  for (const table of ["browser_operations", "browser_operation_events", "browser_evidence_events"]) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table}\\b`));
  }
  assert.match(migration, /ON browser_operations\(run_id, tool_call_id\)/);
  assert.match(migration, /status IN \('STARTED', 'SUCCEEDED', 'FAILED', 'INTERRUPTED'\)/);
});

test("durable Browser rows store hashes and safe terminal metadata, not raw Tool input", async () => {
  const migration = await source("packages/state/migrations/011_browser_automation_ledger.sql");
  const repository = await source("packages/state/src/browser-repository.ts");
  const ledger = await source("services/agent-host/src/browser-operation-ledger.ts");
  assert.match(migration, /input_sha256 TEXT NOT NULL CHECK \(length\(input_sha256\) = 64\)/);
  assert.doesNotMatch(migration, /input_json|arguments_json|raw_input|text_value/);
  assert.match(repository, /browser tool call identity conflict/);
  assert.match(ledger, /createHash\("sha256"\)/);
  assert.match(ledger, /durableEvidencePayload/);
  assert.match(ledger, /parsed\.search = parsed\.search \? "\?redacted" : ""/);
});

test("Browser Tool registration retains the accepted 15-tool surface and adds only ledger wrapping", async () => {
  const tools = await source("packages/browser-runtime/src/tools.ts");
  const names = [...tools.matchAll(/tool\(\s*"(browser\.[a-z]+)"/g)].map((match) => match[1]);
  assert.deepEqual(names, [
    "browser.status", "browser.open", "browser.list", "browser.navigate", "browser.snapshot", "browser.close",
    "browser.click", "browser.type", "browser.press", "browser.select", "browser.fill", "browser.wait",
    "browser.screenshot", "browser.download", "browser.evidence",
  ]);
  assert.match(tools, /inputSha256: sha256\(input\)/);
  assert.match(tools, /registry\.register\(withLedger\(definition, options\)\)/);
  assert.doesNotMatch(tools, /playwright|puppeteer/i);
});

test("Host recovery orders interrupted Browser operations before Agent and Automation recovery", async () => {
  const lifecycle = await source("services/agent-host/src/lifecycle.ts");
  const browserIndex = lifecycle.indexOf("repositories.browser.recoverInterruptedOperations");
  const conversationIndex = lifecycle.indexOf("conversations.recoverIncompleteRuns()");
  const schedulerIndex = lifecycle.indexOf("await automationScheduler?.start()");
  assert.ok(browserIndex >= 0 && browserIndex < conversationIndex && conversationIndex < schedulerIndex);
  assert.match(lifecycle, /new StateBrowserToolLedger\(stateDatabase\)/);
});

test("post-checkpoint model request is restart-safe but partial provider output is not", async () => {
  const conversations = await source("packages/conversations/src/service.ts");
  assert.match(conversations, /SAFE_AFTER_CHECKPOINT = new Set\(\["model\.requested", "model\.retry"\]\)/);
  assert.match(conversations, /hasRecoverableCheckpoint\(events\)/);
  assert.doesNotMatch(conversations, /SAFE_AFTER_CHECKPOINT[^;]+model\.text_delta/s);
  assert.match(conversations, /recoverStartedModelInvocations/);
  const state = await source("packages/state/src/conversation-repository.ts");
  assert.match(state, /MODEL_INTERRUPTED_BY_RESTART/);
});

test("Automation restart requeues only a linked resumable Agent Run and preserves run identity", async () => {
  const repository = await source("packages/state/src/automation-repository.ts");
  const executor = await source("services/agent-host/src/automation-conversation-executor.ts");
  assert.match(repository, /linked\?\.recoveryState === "RESUMABLE"/);
  assert.match(repository, /linked\.status === "CREATED" \|\| linked\.status === "WAITING_APPROVAL"/);
  assert.match(executor, /let runId: string \| null = context\.run\.runId/);
  assert.match(executor, /automation\.run\.resuming/);
  assert.match(executor, /executeUntilTerminal\(runId\)/);
});

test("completed Tool calls own deterministic restart checkpoints", async () => {
  const kernel = await source("packages/agent-kernel/src/kernel.ts");
  assert.match(kernel, /eventType: "run\.checkpoint"/);
  assert.match(kernel, /kind: "tool\.completed"/);
  assert.match(kernel, /kind: "tool\.replayed"/);
  assert.match(kernel, /checkpoint:tool:/);
});

test("STEP013C live fixture forces a Host crash and proves resume, reopen, Artifact, evidence, and orphan zero", async () => {
  const live = await source("scripts/run-step013c-live.mjs");
  const child = await source("scripts/run-step013c-host-child.mjs");
  for (const token of [
    "forceKill(first.child)", "MODEL_INTERRUPTED_BY_RESTART", "BROWSER_SESSION_NOT_FOUND",
    "browser.screenshot", "browser.evidence", "attempt, 2", "process_count=0 chromium_orphan=0",
  ]) assert.ok(live.includes(token), token);
  assert.match(child, /automationLeaseDurationMs: 1_500/);
  assert.match(child, /automationRenewIntervalMs: 500/);
  assert.match(child, /createPlaywrightBrowserDriver/);
  assert.match(child, /line\.trim\(\) === "CLOSE"/);
  assert.match(live, /stdio: \["pipe", "pipe", "pipe"\]/);
  assert.match(live, /child\.stdin\?\.write\("CLOSE\\n"\)/);
  assert.match(live, /removeTreeWithRetries\(root\)/);
  assert.match(live, /OPENRILL_STEP013C_CLEANUP_AFTER_FAILURE/);
});

test("STEP013C does not add Browser protocol operations or deferred unsafe surfaces", async () => {
  const protocol = await source("services/agent-host/src/transport/operation-registry.ts");
  const tools = await source("packages/browser-runtime/src/tools.ts");
  const registry = await source("docs/governance/ENGINEERING_ISSUE_REGISTRY.md");
  const recurrence = await source("docs/testing/RECURRENCE_PREVENTION_GATES.md");
  const issue113 = await source("reference/validation/STEP013C_ROOT_DOCUMENT_ACCEPTED_CHECK_IDENTITY_OMISSION.md");
  assert.doesNotMatch(protocol, /browser\./);
  for (const deferred of ["browser.evaluate", "browser.batch", "browser.upload", "browser.pdf"]) {
    assert.ok(!tools.includes(`"${deferred}"`), deferred);
  }
  assert.match(registry, /OR-ISSUE-113/);
  assert.match(recurrence, /OR-ISSUE-113/);
  assert.match(issue113, /accepted step, checks, and SHA/);
});


test("restart recovery retains the ABORTED attempt pointer for deterministic rollover", async () => {
  const conversations = await source("packages/conversations/src/service.ts");
  const executor = await source("services/agent-host/src/automation-conversation-executor.ts");
  assert.match(conversations, /const currentAttemptId = run\.currentAttemptId/);
  assert.doesNotMatch(conversations, /currentAttemptId = null/);
  assert.match(conversations, /attempt\.status === "ABORTED"/);
  assert.match(executor, /AUTOMATION_CONVERSATION_\$\{error\.code\}/);
});


test("STEP013CR1 live diagnostics never print raw conversation messages or Tool inputs", async () => {
  const live = await source("scripts/run-step013cr1-live.mjs");
  assert.match(live, /OPENRILL_STEP013CR1_RECOVERY_DIAGNOSTICS/);
  assert.doesNotMatch(live, /preCrashMessages|content_json contentJson|conversation_messages/);
  assert.match(live, /tool_name toolName,status,error_code errorCode/);
  assert.match(live, /SELECT sequence,event_type eventType,attempt_id attemptId/);
});
