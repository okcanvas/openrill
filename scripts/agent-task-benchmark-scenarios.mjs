import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../packages/config/dist/index.js";
import { createWorkspaceCatalog } from "../packages/workspace/dist/index.js";
import { openOpenRillStateDatabase } from "../packages/state/dist/index.js";
import { ConversationService } from "../packages/conversations/dist/index.js";
import { createScriptedModelAdapter, ModelAdapterError } from "../packages/model-adapter/dist/index.js";
import { executeAgentRun } from "../packages/agent-kernel/dist/index.js";
import { ToolRegistry } from "../packages/tool-runtime/dist/index.js";
import { ApprovalService, ToolApprovalRequiredError } from "../packages/approval/dist/index.js";
import { MemoryService, MEMORY_SYSTEM_INSTRUCTIONS } from "../packages/memory/dist/index.js";
import { registerMemoryTools } from "../packages/tools-memory/dist/index.js";
import {
  TOOL_CALL_NAME,
  TOOL_DESCRIBE_NAME,
  TOOL_SEARCH_NAME,
  registerToolDiscoveryTools,
  resolveToolDiscoveryView,
} from "../packages/tool-discovery/dist/index.js";
import { formatBenchmarkJson, sanitizeShareSafeText } from "../packages/agent-benchmark/dist/index.js";

const usage = (inputTokens, outputTokens) => ({
  type: "usage",
  usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
});
const completed = (stopReason = "stop") => ({ type: "completed", stopReason });
const zeroUsage = () => ({ turns: 0, inputTokens: 0, outputTokens: 0, modelCalls: 0, toolCalls: 0 });
const snapshotRequest = (request) => JSON.parse(JSON.stringify({
  systemInstructions: request.systemInstructions,
  messages: request.messages,
  tools: request.tools,
  maxOutputTokens: request.maxOutputTokens,
}));
const resolver = (adapter, maxRetries = 0) => ({
  resolve: () => ({ profile: "default", adapter, provider: "scripted", model: "benchmark-scripted", maxOutputTokens: 256, maxRetries }),
});

function finalText(result) {
  const block = result.messages.at(-1)?.content.find((item) => item.type === "text");
  return block?.text ?? "";
}

async function withFixture(label, workspaceIds, run) {
  const root = await mkdtemp(join(tmpdir(), `openrill-step018c-${label}-`));
  const paths = resolveProfilePaths({ profile: label, env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  try {
    const conversations = new ConversationService({ state, workspaceIds });
    return await run({ root, paths, state, conversations });
  } finally {
    if (state.isOpen()) state.close({ checkpointMode: "TRUNCATE" });
    await rm(root, { recursive: true, force: true });
  }
}

function createRun(conversations, workspaceId, text, submissionKey, modelProfile = "default") {
  const conversation = conversations.create({ workspaceId, modelProfile });
  return conversations.send({ workspaceId, conversationId: conversation.conversationId, submissionKey, text });
}

async function memoryPreferenceRecall(context) {
  return withFixture(`memory-${context.repetition}`, ["alpha"], async ({ state, conversations }) => {
    const memoryId = `memory-port-${context.repetition}`;
    const memory = new MemoryService(state, { createId: () => memoryId });
    const tools = new ToolRegistry();
    registerMemoryTools(tools, memory);
    const first = createRun(conversations, "alpha", "Remember that the project default port is 8084.", `remember-${context.repetition}`);
    const rememberAdapter = createScriptedModelAdapter({ turns: [
      { kind: "events", events: [
        { type: "tool_call", toolCallId: "remember", name: "memory.remember", argumentsJson: JSON.stringify({ text: "The project default port is 8084.", kind: "PREFERENCE" }) },
        usage(20, 2), completed("tool_calls"),
      ] },
      { kind: "events", events: [{ type: "text_delta", delta: "Remembered." }, usage(8, 2), completed()] },
    ] });
    const remembered = await executeAgentRun({ runId: first.run.runId, conversations, modelAdapters: resolver(rememberAdapter), tools, systemInstructions: MEMORY_SYSTEM_INSTRUCTIONS, signal: context.signal });
    const second = createRun(conversations, "alpha", "What is the project default port?", `recall-${context.repetition}`);
    const requests = [];
    const recallAdapter = createScriptedModelAdapter({ onRequest: (request) => requests.push(snapshotRequest(request)), turns: [
      { kind: "events", events: [{ type: "tool_call", toolCallId: "search", name: "memory.search", argumentsJson: JSON.stringify({ query: "project default port" }) }, usage(18, 2), completed("tool_calls")] },
      { kind: "events", events: [{ type: "tool_call", toolCallId: "get", name: "memory.get", argumentsJson: JSON.stringify({ memoryId }) }, usage(16, 2), completed("tool_calls")] },
      { kind: "events", events: [{ type: "text_delta", delta: "The project default port is 8084." }, usage(14, 7), completed()] },
    ] });
    const recalled = await executeAgentRun({ runId: second.run.runId, conversations, modelAdapters: resolver(recallAdapter), tools, systemInstructions: MEMORY_SYSTEM_INSTRUCTIONS, signal: context.signal });
    const record = memory.get({ workspaceId: "alpha", memoryId });
    const searchResult = requests[1]?.messages.find((message) => message.role === "tool")?.content[0]?.output;
    return {
      assertions: [
        { name: "remember.completed", passed: remembered.status === "COMPLETED", detail: remembered.status },
        { name: "recall.completed", passed: recalled.status === "COMPLETED", detail: recalled.status },
        { name: "recall.answer-grounded", passed: finalText(recalled) === "The project default port is 8084." },
        { name: "recall.search-before-get", passed: requests.length === 3 && JSON.stringify(searchResult).includes(memoryId) },
        { name: "recall.provenance", passed: record.provenance.conversationId === first.conversation.conversationId && record.provenance.runId === first.run.runId },
      ],
      usage: {
        turns: remembered.usage.turns + recalled.usage.turns,
        inputTokens: remembered.usage.inputTokens + recalled.usage.inputTokens,
        outputTokens: remembered.usage.outputTokens + recalled.usage.outputTokens,
        modelCalls: remembered.usage.modelCalls + recalled.usage.modelCalls,
        toolCalls: remembered.usage.toolCalls + recalled.usage.toolCalls,
      },
      evidence: [{ kind: "memory", label: "durable-memory-record", value: { memoryId, contentHash: record.contentHash, provenance: record.provenance } }],
    };
  });
}

async function redactionNoSecretLeak(context) {
  return withFixture(`redaction-${context.repetition}`, ["alpha"], async ({ conversations }) => {
    const fakeSecret = `api_key=STEP018C_FAKE_SECRET_${context.repetition}_123456789`;
    const sent = createRun(conversations, "alpha", `Do not repeat this fake credential: ${fakeSecret}. Reply SAFE_ONLY.`, `redaction-${context.repetition}`);
    const adapter = createScriptedModelAdapter({ turns: [{ kind: "events", events: [{ type: "text_delta", delta: "SAFE_ONLY" }, usage(22, 2), completed()] }] });
    const result = await executeAgentRun({ runId: sent.run.runId, conversations, modelAdapters: resolver(adapter), tools: new ToolRegistry(), signal: context.signal });
    const answer = finalText(result);
    const shareSafe = sanitizeShareSafeText(`status=PASS ${fakeSecret}`, [fakeSecret]);
    return {
      assertions: [
        { name: "redaction.completed", passed: result.status === "COMPLETED", detail: result.status },
        { name: "redaction.exact-safe-marker", passed: answer === "SAFE_ONLY", detail: answer },
        { name: "redaction.no-secret-assistant", passed: !answer.includes(fakeSecret) },
        { name: "redaction.share-safe", passed: shareSafe.includes("status=PASS") && !shareSafe.includes(fakeSecret) },
      ],
      usage: result.usage,
      evidence: [{ kind: "privacy", label: "assistant-output", value: { answerSha256Input: answer, secretPresent: answer.includes(fakeSecret) } }],
    };
  });
}

function registerReadTool(registry, marker, counter) {
  registry.register({
    name: "workspace.read",
    description: "Read a bounded workspace fixture",
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
    validateInput: (input) => input && typeof input === "object" && typeof input.path === "string",
    execute: () => { counter.count += 1; return { output: { text: marker, path: "fixture.txt" }, isError: false }; },
  });
}

async function toolSafetyFollowthrough(context) {
  return withFixture(`safe-tool-${context.repetition}`, ["alpha"], async ({ conversations }) => {
    const marker = `SAFE_READ_EVIDENCE_${context.repetition}`;
    const counter = { count: 0 };
    const tools = new ToolRegistry();
    registerReadTool(tools, marker, counter);
    const sent = createRun(conversations, "alpha", "Read fixture.txt and report the marker.", `safe-tool-${context.repetition}`);
    const requests = [];
    const adapter = createScriptedModelAdapter({ onRequest: (request) => requests.push(snapshotRequest(request)), turns: [
      { kind: "events", events: [{ type: "tool_call", toolCallId: "read", name: "workspace.read", argumentsJson: JSON.stringify({ path: "fixture.txt" }) }, usage(12, 2), completed("tool_calls")] },
      { kind: "events", events: [{ type: "text_delta", delta: `Read evidence: ${marker}` }, usage(10, 6), completed()] },
    ] });
    const result = await executeAgentRun({ runId: sent.run.runId, conversations, modelAdapters: resolver(adapter), tools, signal: context.signal });
    const secondHasTool = requests[1]?.messages.some((message) => message.role === "tool" && JSON.stringify(message).includes(marker)) ?? false;
    return {
      assertions: [
        { name: "safe-tool.completed", passed: result.status === "COMPLETED", detail: result.status },
        { name: "safe-tool.executed-once", passed: counter.count === 1, detail: String(counter.count) },
        { name: "safe-tool.grounded-answer", passed: finalText(result).includes(marker) },
        { name: "safe-tool.evidence-before-answer", passed: secondHasTool },
      ],
      usage: result.usage,
      evidence: [{ kind: "tool", label: "workspace-read", value: { executions: counter.count, markerObserved: secondHasTool } }],
    };
  });
}

async function approvalDenialStop(context) {
  return withFixture(`approval-${context.repetition}`, ["alpha"], async ({ root, state, conversations }) => {
    const workspaceRoot = join(root, "workspace-alpha");
    await mkdir(workspaceRoot, { recursive: true });
    const catalog = await createWorkspaceCatalog([{ id: "alpha", path: workspaceRoot }]);
    const descriptor = catalog.internal("alpha");
    state.transaction((repositories) => repositories.workspaces.upsertWorkspace({
      workspaceId: descriptor.workspaceId, displayName: descriptor.displayName, canonicalRoot: descriptor.canonicalRoot,
      rootRevision: descriptor.rootRevision, accessMode: descriptor.accessMode, trustState: descriptor.trustState, updatedAt: Date.now(),
    }));
    const approvals = new ApprovalService({ state, createId: (() => { let id = 0; return () => `approval-${context.repetition}-${++id}`; })() });
    const tools = new ToolRegistry();
    let executed = 0;
    const schema = { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false };
    tools.register({
      name: "sensitive.read",
      description: "Read a sensitive fixture only after approval",
      inputSchema: schema,
      validateInput: (input) => input && typeof input === "object" && typeof input.path === "string",
      execute: (input, toolContext) => {
        const decision = approvals.authorizeOrRequest({
          runId: toolContext.runId,
          attemptId: toolContext.attemptId,
          conversationId: toolContext.conversationId,
          workspaceId: toolContext.workspaceId,
          toolCallId: toolContext.toolCallId,
          toolName: "sensitive.read",
          input,
          toolSchema: schema,
          policySubject: { toolName: "sensitive.read", workspaceId: toolContext.workspaceId },
          policy: { defaultDecision: "PROMPT" },
          summary: { path: input.path },
          continuation: { path: input.path },
        });
        if (decision.decision === "PROMPT") throw new ToolApprovalRequiredError(decision.request);
        if (decision.decision === "DENY") return { output: { error: { code: "APPROVAL_DENIED" } }, isError: true };
        executed += 1;
        return { output: { text: "SENSITIVE_DATA" }, isError: false };
      },
    });
    const sent = createRun(conversations, "alpha", "Read sensitive.txt.", `approval-${context.repetition}`);
    const adapter = createScriptedModelAdapter({ turns: [{ kind: "events", events: [{ type: "tool_call", toolCallId: "sensitive", name: "sensitive.read", argumentsJson: JSON.stringify({ path: "sensitive.txt" }) }, usage(12, 2), completed("tool_calls")] }] });
    const result = await executeAgentRun({ runId: sent.run.runId, conversations, modelAdapters: resolver(adapter), tools, signal: context.signal });
    const pending = approvals.list("PENDING");
    const denied = pending[0] ? approvals.resolve({ requestId: pending[0].requestId, expectedVersion: pending[0].version, decision: "deny" }).request : null;
    return {
      assertions: [
        { name: "approval.waiting", passed: result.status === "WAITING_APPROVAL", detail: result.status },
        { name: "approval.durable-request", passed: pending.length === 1, detail: String(pending.length) },
        { name: "approval.denied", passed: denied?.status === "DENIED", detail: denied?.status ?? "missing" },
        { name: "approval.no-execution", passed: executed === 0, detail: String(executed) },
        { name: "approval.no-extra-model-call", passed: result.usage.modelCalls === 1, detail: String(result.usage.modelCalls) },
      ],
      usage: result.usage,
      evidence: [{ kind: "approval", label: "denial", value: { requestId: denied?.requestId ?? null, status: denied?.status ?? null, executed } }],
    };
  });
}

async function taskFollowthroughStatus(context) {
  return withFixture(`task-status-${context.repetition}`, ["alpha"], async ({ conversations }) => {
    const tools = new ToolRegistry();
    let calls = 0;
    tools.register({
      name: "task.status",
      description: "Return proof-backed task status counts",
      inputSchema: { type: "object", additionalProperties: false },
      validateInput: (input) => input && typeof input === "object",
      execute: () => { calls += 1; return { output: { pending: 1, blocked: 1, done: 2, evidenceId: `status-${context.repetition}` }, isError: false }; },
    });
    const sent = createRun(conversations, "alpha", "Report pending, blocked, and done work.", `task-status-${context.repetition}`);
    const adapter = createScriptedModelAdapter({ turns: [
      { kind: "events", events: [{ type: "tool_call", toolCallId: "status", name: "task.status", argumentsJson: "{}" }, usage(10, 2), completed("tool_calls")] },
      { kind: "events", events: [{ type: "text_delta", delta: "pending=1 blocked=1 done=2" }, usage(10, 6), completed()] },
    ] });
    const result = await executeAgentRun({ runId: sent.run.runId, conversations, modelAdapters: resolver(adapter), tools, signal: context.signal });
    const answer = finalText(result);
    return {
      assertions: [
        { name: "task-status.completed", passed: result.status === "COMPLETED", detail: result.status },
        { name: "task-status.tool-first", passed: calls === 1, detail: String(calls) },
        { name: "task-status.pending", passed: answer.includes("pending=1") },
        { name: "task-status.blocked", passed: answer.includes("blocked=1") },
        { name: "task-status.done", passed: answer.includes("done=2") },
      ],
      usage: result.usage,
      evidence: [{ kind: "task-status", label: "status-counts", value: { pending: 1, blocked: 1, done: 2 } }],
    };
  });
}

async function shareSafeDiagnosticsArtifact(context) {
  const fakeSecret = `Bearer STEP018C_DIAGNOSTIC_SECRET_${context.repetition}_123456`;
  const mini = {
    schemaVersion: 1,
    profileId: "diagnostic-fixture",
    providerMode: "SCRIPTED_LOCAL",
    startedAt: "2026-08-05T00:00:00.000Z",
    completedAt: "2026-08-05T00:00:01.000Z",
    scenarioCount: 1,
    attemptCount: 1,
    passedAttempts: 1,
    failedAttempts: 0,
    reliability: 1,
    status: "PASS",
    usage: zeroUsage(),
    scenarios: [{
      scenario: context.scenario,
      attempts: [{ scenarioId: context.scenario.id, repetition: 1, status: "PASS", elapsedMs: 1, assertions: [{ name: "fixture", passed: true, detail: fakeSecret }], usage: zeroUsage(), evidence: [{ kind: "fixture", label: "digest", sha256: "0".repeat(64) }], failure: null }],
      passedAttempts: 1,
      failedAttempts: 0,
      reliability: 1,
      status: "PASS",
    }],
  };
  const artifact = formatBenchmarkJson(mini, [fakeSecret]);
  return {
    assertions: [
      { name: "diagnostics.status-preserved", passed: artifact.includes('"status": "PASS"') },
      { name: "diagnostics.digest-preserved", passed: artifact.includes("0".repeat(64)) },
      { name: "diagnostics.secret-removed", passed: !artifact.includes(fakeSecret) && artifact.includes("[REDACTED]") },
      { name: "diagnostics.bounded", passed: artifact.length < 25_000, detail: String(artifact.length) },
    ],
    usage: zeroUsage(),
    evidence: [{ kind: "diagnostic", label: "share-safe-artifact", value: { length: artifact.length, redacted: !artifact.includes(fakeSecret) } }],
  };
}

async function noFakeProgress(context) {
  return withFixture(`no-fake-progress-${context.repetition}`, ["alpha"], async ({ conversations }) => {
    const marker = `PROOF_${context.repetition}`;
    const counter = { count: 0 };
    const tools = new ToolRegistry();
    registerReadTool(tools, marker, counter);
    const sent = createRun(conversations, "alpha", "Complete the review only after reading fixture.txt.", `no-fake-progress-${context.repetition}`);
    const requests = [];
    const adapter = createScriptedModelAdapter({ onRequest: (request) => requests.push(snapshotRequest(request)), turns: [
      { kind: "events", events: [{ type: "tool_call", toolCallId: "proof", name: "workspace.read", argumentsJson: JSON.stringify({ path: "fixture.txt" }) }, usage(12, 2), completed("tool_calls")] },
      { kind: "events", events: [{ type: "text_delta", delta: `COMPLETE_AFTER_EVIDENCE ${marker}` }, usage(12, 5), completed()] },
    ] });
    const result = await executeAgentRun({ runId: sent.run.runId, conversations, modelAdapters: resolver(adapter), tools, signal: context.signal });
    const firstAssistant = result.messages.find((message) => message.role === "assistant");
    const firstText = firstAssistant?.content.find((item) => item.type === "text")?.text ?? "";
    const secondHasEvidence = requests[1]?.messages.some((message) => message.role === "tool" && JSON.stringify(message).includes(marker)) ?? false;
    return {
      assertions: [
        { name: "no-fake-progress.completed", passed: result.status === "COMPLETED", detail: result.status },
        { name: "no-fake-progress.no-early-text", passed: firstText.length === 0, detail: firstText },
        { name: "no-fake-progress.tool-evidence", passed: counter.count === 1 && secondHasEvidence },
        { name: "no-fake-progress.final-after-evidence", passed: finalText(result).startsWith("COMPLETE_AFTER_EVIDENCE") },
      ],
      usage: result.usage,
      evidence: [{ kind: "grounding", label: "completion-order", value: { firstTextLength: firstText.length, toolExecutions: counter.count, secondHasEvidence } }],
    };
  });
}

async function failureRecovery(context) {
  return withFixture(`failure-recovery-${context.repetition}`, ["alpha"], async ({ conversations }) => {
    const sent = createRun(conversations, "alpha", "Return RECOVERED.", `recovery-${context.repetition}`);
    const adapter = createScriptedModelAdapter({ turns: [
      { kind: "error", error: new ModelAdapterError("MODEL_TRANSPORT_FAILED", "temporary benchmark transport failure", true) },
      { kind: "events", events: [{ type: "text_delta", delta: "RECOVERED" }, usage(8, 2), completed()] },
    ] });
    const result = await executeAgentRun({ runId: sent.run.runId, conversations, modelAdapters: resolver(adapter, 1), tools: new ToolRegistry(), signal: context.signal });
    const invocations = conversations.modelInvocations(sent.run.runId);
    return {
      assertions: [
        { name: "recovery.completed", passed: result.status === "COMPLETED", detail: result.status },
        { name: "recovery.answer", passed: finalText(result) === "RECOVERED", detail: finalText(result) },
        { name: "recovery.invocations", passed: invocations.length === 2, detail: String(invocations.length) },
        { name: "recovery.failed-then-completed", passed: invocations[0]?.status === "FAILED" && invocations[1]?.status === "COMPLETED", detail: invocations.map((item) => item.status).join(",") },
        { name: "recovery.budget", passed: result.usage.modelCalls === 2, detail: String(result.usage.modelCalls) },
      ],
      usage: result.usage,
      evidence: [{ kind: "recovery", label: "model-invocations", value: invocations.map((item) => ({ requestNumber: item.requestNumber, status: item.status, errorCode: item.errorCode })) }],
    };
  });
}

async function toolDiscoveryHiddenCall(context) {
  return withFixture(`tool-discovery-${context.repetition}`, ["alpha"], async ({ conversations }) => {
    const registry = new ToolRegistry();
    for (const name of ["workspace.list", "workspace.stat", "workspace.read", "workspace.search", "memory.remember", "memory.search", "memory.get", "memory.forget", "process.run"]) {
      registry.register({ name, description: name, inputSchema: { type: "object", additionalProperties: false }, validateInput: (input) => input && typeof input === "object", execute: () => ({ output: { ok: true }, isError: false }) });
    }
    let hiddenCalls = 0;
    registry.register({
      name: "browser.screenshot",
      description: "Capture a screenshot of the active page",
      inputSchema: { type: "object", properties: { pageId: { type: "string" } }, required: ["pageId"], additionalProperties: false },
      validateInput: (input) => input && typeof input === "object" && typeof input.pageId === "string",
      execute: () => { hiddenCalls += 1; return { output: { artifactId: `shot-${context.repetition}` }, isError: false }; },
    });
    for (let i = 0; i < 8; i += 1) registry.register({ name: `extra.tool.${i}`, description: `Extra capability ${i}`, inputSchema: { type: "object", additionalProperties: false }, validateInput: (input) => input && typeof input === "object", execute: () => ({ output: { i }, isError: false }) });
    registerToolDiscoveryTools(registry);
    const view = resolveToolDiscoveryView(registry);
    const sent = createRun(conversations, "alpha", "Capture a browser screenshot.", `tool-discovery-${context.repetition}`);
    const requests = [];
    const adapter = createScriptedModelAdapter({ onRequest: (request) => requests.push(snapshotRequest(request)), turns: [
      { kind: "events", events: [{ type: "tool_call", toolCallId: "search", name: TOOL_SEARCH_NAME, argumentsJson: JSON.stringify({ query: "browser screenshot" }) }, usage(12, 2), completed("tool_calls")] },
      { kind: "events", events: [{ type: "tool_call", toolCallId: "describe", name: TOOL_DESCRIBE_NAME, argumentsJson: JSON.stringify({ name: "browser.screenshot" }) }, usage(12, 2), completed("tool_calls")] },
      { kind: "events", events: [{ type: "tool_call", toolCallId: "call", name: TOOL_CALL_NAME, argumentsJson: JSON.stringify({ name: "browser.screenshot", arguments: { pageId: "page-1" } }) }, usage(12, 2), completed("tool_calls")] },
      { kind: "events", events: [{ type: "text_delta", delta: "Screenshot captured." }, usage(10, 4), completed()] },
    ] });
    const result = await executeAgentRun({ runId: sent.run.runId, conversations, modelAdapters: resolver(adapter), tools: registry, modelToolNames: view.visibleNames, signal: context.signal });
    const firstVisible = requests[0]?.tools.map((tool) => tool.name) ?? [];
    const searchOutput = requests[1]?.messages.find((message) => message.role === "tool")?.content[0]?.output;
    const describeOutput = requests[2]?.messages.find((message) => message.role === "tool" && message.content[0]?.toolCallId === "describe")?.content[0]?.output;
    return {
      assertions: [
        { name: "tool-discovery.compacted", passed: view.compacted && !view.visibleNames.includes("browser.screenshot") },
        { name: "tool-discovery.hidden-from-schema", passed: !firstVisible.includes("browser.screenshot") },
        { name: "tool-discovery.search-found", passed: JSON.stringify(searchOutput).includes("browser.screenshot") },
        { name: "tool-discovery.describe-schema", passed: JSON.stringify(describeOutput).includes("pageId") },
        { name: "tool-discovery.executed-once", passed: hiddenCalls === 1, detail: String(hiddenCalls) },
        { name: "tool-discovery.completed", passed: result.status === "COMPLETED", detail: result.status },
      ],
      usage: result.usage,
      evidence: [{ kind: "tool-discovery", label: "catalog-view", value: { catalogSize: view.catalogSize, visibleNames: view.visibleNames, hiddenTarget: "browser.screenshot", hiddenCalls } }],
    };
  });
}

async function delegationScopePreserved(context) {
  const registry = new ToolRegistry();
  let allowedCalls = 0;
  let deniedCalls = 0;
  registry.register({ name: "workspace.read", description: "Allowed read", inputSchema: { type: "object", additionalProperties: false }, validateInput: (input) => input && typeof input === "object", execute: () => { allowedCalls += 1; return { output: { ok: true }, isError: false }; } });
  registry.register({ name: "process.run", description: "Denied process", inputSchema: { type: "object", additionalProperties: false }, validateInput: (input) => input && typeof input === "object", execute: () => { deniedCalls += 1; return { output: { ran: true }, isError: false }; } });
  registerToolDiscoveryTools(registry);
  const base = { runId: `delegated-${context.repetition}`, attemptId: `attempt-${context.repetition}`, workspaceId: "alpha", conversationId: `conversation-${context.repetition}`, allowedToolNames: ["workspace.read", TOOL_SEARCH_NAME, TOOL_DESCRIBE_NAME, TOOL_CALL_NAME] };
  const allowed = await registry.execute(TOOL_CALL_NAME, { name: "workspace.read", arguments: {} }, { ...base, toolCallId: "allowed" });
  const denied = await registry.execute(TOOL_CALL_NAME, { name: "process.run", arguments: {} }, { ...base, toolCallId: "denied" });
  return {
    assertions: [
      { name: "delegation.allowed-executed", passed: !allowed.isError && allowedCalls === 1, detail: String(allowedCalls) },
      { name: "delegation.denied-result", passed: denied.isError && JSON.stringify(denied.output).includes("TOOL_NOT_ALLOWED") },
      { name: "delegation.denied-not-executed", passed: deniedCalls === 0, detail: String(deniedCalls) },
      { name: "delegation.scope-unchanged", passed: base.allowedToolNames.length === 4 },
    ],
    usage: { turns: 0, inputTokens: 0, outputTokens: 0, modelCalls: 0, toolCalls: 2 },
    evidence: [{ kind: "delegation", label: "tool-scope", value: { allowedToolNames: base.allowedToolNames, allowedCalls, deniedCalls, deniedError: denied.output } }],
  };
}

export const STEP018C_BENCHMARK_EXECUTORS = {
  "memory-preference-recall": memoryPreferenceRecall,
  "redaction-no-secret-leak": redactionNoSecretLeak,
  "tool-safety-followthrough": toolSafetyFollowthrough,
  "approval-denial-stop": approvalDenialStop,
  "task-followthrough-status": taskFollowthroughStatus,
  "share-safe-diagnostics-artifact": shareSafeDiagnosticsArtifact,
  "no-fake-progress": noFakeProgress,
  "failure-recovery": failureRecovery,
  "tool-discovery-hidden-call": toolDiscoveryHiddenCall,
  "delegation-scope-preserved": delegationScopePreserved,
};
