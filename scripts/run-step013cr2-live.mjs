import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import { resolveProfilePaths } from "../packages/config/dist/index.js";
import { AutomationDefinitionService } from "../packages/automation/dist/index.js";
import { openOpenRillStateDatabase, resolveStatePaths } from "../packages/state/dist/index.js";
import { closeServerAndWait, describeCleanupFailure, removeTreeWithRetries } from "./live-fixture-cleanup.mjs";
import { assertInterruptedModelInvocation } from "./recovery-live-assertions.mjs";

const marker = `openrill-step013cr2-${randomUUID()}`;
const profile = "step013cr2-live";
const timeoutMs = 45_000;

function sse(response, events) {
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
  for (const event of events) response.write(`data: ${JSON.stringify(event)}\n\n`);
  response.end();
}
function toolEvents(requestNumber, name, args) {
  const callId = `step013cr2-call-${requestNumber}-${name.replace(/[^a-z]/g, "-")}`;
  return [
    { type: "response.created", response: { id: `response-${requestNumber}` } },
    { type: "response.output_item.added", item: { type: "function_call", id: callId, call_id: callId, name, arguments: "" } },
    { type: "response.output_item.done", item: { type: "function_call", id: callId, call_id: callId, name, arguments: JSON.stringify(args) } },
    { type: "response.completed", response: { id: `response-${requestNumber}`, usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
  ];
}
function finalEvents(requestNumber) {
  return [
    { type: "response.created", response: { id: `response-${requestNumber}` } },
    { type: "response.output_text.delta", delta: "STEP013CR2 autonomous browser run completed" },
    { type: "response.completed", response: { id: `response-${requestNumber}`, usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
  ];
}
function outputs(body) {
  const items = Array.isArray(body?.input) ? body.input : [];
  return items.flatMap((item) => {
    if (!item || item.type !== "function_call_output" || typeof item.output !== "string") return [];
    try { return [JSON.parse(item.output)]; } catch { return []; }
  });
}
function outputErrorCode(result) {
  return result?.isError === true && result.output?.error && typeof result.output.error.code === "string"
    ? result.output.error.code : null;
}

async function startFixtureServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/page") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(`<!doctype html><html><head><title>STEP013CR2 fixture</title></head><body><h1>Automation Browser</h1><p>restart recovery</p><script>console.log("step013cr2-console");fetch("/api?token=secret-step013cr2");</script></body></html>`);
      return;
    }
    if (url.pathname === "/api") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end('{"ok":true}');
      return;
    }
    response.writeHead(404); response.end("not found");
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  return { server, origin: `http://127.0.0.1:${address.port}`, close: () => closeServerAndWait(server) };
}

async function startModelServer(fixtureUrl) {
  let requestNumber = 0;
  let releaseBlocked;
  let signalBlocked;
  const blocked = new Promise((resolve) => { signalBlocked = resolve; });
  const released = new Promise((resolve) => { releaseBlocked = resolve; });
  let blockSecond = true;
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/responses") { response.writeHead(404); response.end(); return; }
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw || "{}");
    requestNumber += 1;
    const current = requestNumber;
    const results = outputs(body);
    if (current === 2 && blockSecond) {
      signalBlocked();
      await released;
      if (response.destroyed) return;
    }
    const staleSnapshot = results.findLast?.((result) => result?.name === "browser.snapshot" && outputErrorCode(result) === "BROWSER_SESSION_NOT_FOUND")
      ?? [...results].reverse().find((result) => result?.name === "browser.snapshot" && outputErrorCode(result) === "BROWSER_SESSION_NOT_FOUND");
    const opens = results.filter((result) => result?.name === "browser.open" && result.isError !== true);
    const latestOpen = opens.at(-1)?.output;
    const screenshot = [...results].reverse().find((result) => result?.name === "browser.screenshot" && result.isError !== true);
    const evidence = [...results].reverse().find((result) => result?.name === "browser.evidence" && result.isError !== true);
    if (!latestOpen) {
      sse(response, toolEvents(current, "browser.open", { url: fixtureUrl }));
    } else if (!staleSnapshot && opens.length === 1) {
      sse(response, toolEvents(current, "browser.snapshot", { sessionId: latestOpen.sessionId, pageId: latestOpen.pageId }));
    } else if (opens.length === 1) {
      sse(response, toolEvents(current, "browser.open", { url: fixtureUrl }));
    } else if (!screenshot) {
      sse(response, toolEvents(current, "browser.screenshot", { sessionId: latestOpen.sessionId, pageId: latestOpen.pageId, format: "png" }));
    } else if (!evidence) {
      sse(response, toolEvents(current, "browser.evidence", { sessionId: latestOpen.sessionId, pageId: latestOpen.pageId, limit: 50 }));
    } else {
      sse(response, finalEvents(current));
    }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  return {
    server,
    endpoint: `http://127.0.0.1:${address.port}`,
    blocked,
    release() { blockSecond = false; releaseBlocked(); },
    requestCount: () => requestNumber,
    close: () => closeServerAndWait(server),
  };
}

function markerProcessIds() {
  if (process.platform === "win32") {
    const script = ["$needle=$env:OPENRILL_BROWSER_MARKER;", "Get-CimInstance Win32_Process |", "Where-Object { $_.CommandLine -and $_.CommandLine.Contains($needle) } |", "ForEach-Object { $_.ProcessId }"].join(" ");
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", env: { ...process.env, OPENRILL_BROWSER_MARKER: marker }, windowsHide: true });
    if (result.error || result.status !== 0) throw new Error(`failed to inspect Windows Chromium processes: ${result.error?.message ?? result.stderr}`);
    return result.stdout.split(/\r?\n/).map((value) => Number.parseInt(value.trim(), 10)).filter(Number.isInteger);
  }
  const result = spawnSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`failed to inspect Chromium processes: ${result.error?.message ?? result.stderr}`);
  return result.stdout.split(/\r?\n/).flatMap((line) => {
    if (!line.includes(marker)) return [];
    const match = line.trim().match(/^(\d+)\s+/); return match ? [Number.parseInt(match[1], 10)] : [];
  });
}
async function waitForOrphanZero() {
  const deadline = Date.now() + 10_000;
  let ids = markerProcessIds();
  while (ids.length > 0 && Date.now() < deadline) { await delay(100); ids = markerProcessIds(); }
  return ids;
}

function spawnChild(env) {
  const child = spawn(process.execPath, [join(import.meta.dirname, "run-step013cr2-host-child.mjs")], { cwd: join(import.meta.dirname, ".."), env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let output = "";
  child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
  child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
  const exited = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal, output })));
  return { child, exited, output: () => output };
}
async function waitFor(predicate, label, timeout = timeoutMs) {
  const deadline = Date.now() + timeout;
  let value;
  while (Date.now() < deadline) {
    value = await predicate();
    if (value) return value;
    await delay(100);
  }
  throw new Error(`timeout waiting for ${label}; last=${JSON.stringify(value)}`);
}
async function forceKill(child) {
  if (process.platform === "win32") {
    const result = spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { encoding: "utf8", windowsHide: true });
    if (result.status !== 0 && child.exitCode === null) throw new Error(`taskkill failed: ${result.stderr || result.stdout}`);
  } else {
    child.kill("SIGKILL");
  }
}
async function gracefulStop(child, exited) {
  child.stdin?.write("CLOSE\n");
  child.stdin?.end();
  const result = await Promise.race([exited, delay(10_000).then(() => null)]);
  if (!result) { await forceKill(child); return exited; }
  return result;
}
function queryOne(databasePath, sql, ...params) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try { return db.prepare(sql).get(...params); } finally { db.close(); }
}
function queryAll(databasePath, sql, ...params) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try { return db.prepare(sql).all(...params); } finally { db.close(); }
}

const root = await mkdtemp(join(tmpdir(), "openrill-step013cr2-live-"));
const workspacePath = join(root, "workspace");
await mkdir(workspacePath, { recursive: true });
const envRoot = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") };
const profilePaths = resolveProfilePaths({ profile, env: envRoot });
const databasePath = resolveStatePaths(profilePaths).databasePath;
const fixture = await startFixtureServer();
const model = await startModelServer(`${fixture.origin}/page`);
let first;
let second;
let primaryError;
try {
  const state = await openOpenRillStateDatabase({ profilePaths });
  const definitions = new AutomationDefinitionService({ state });
  const job = definitions.create({
    name: "STEP013CR2 autonomous browser",
    enabled: false,
    schedule: { kind: "at", at: "1970-01-01T00:00:00.000Z" },
    timezone: "UTC",
    conversationTemplate: { workspaceId: "alpha", prompt: "Inspect the deterministic Browser fixture and persist bounded evidence.", modelProfile: "default" },
    catchUpPolicy: { kind: "RUN_ONCE" },
    failurePolicy: { backoffMs: 0, maxConsecutiveFailures: 3, autoDisable: false },
  });
  const scheduled = definitions.runNow(job.jobId, "step013cr2-live-request").run;
  const automationRunId = scheduled.automationRunId;
  state.close();

  const childEnv = {
    ...process.env,
    ...envRoot,
    OPENRILL_STEP013CR2_PROFILE: profile,
    OPENRILL_STEP013CR2_WORKSPACE: workspacePath,
    OPENRILL_STEP013CR2_MODEL_ENDPOINT: model.endpoint,
    OPENRILL_STEP013CR2_BROWSER_MARKER: marker,
  };
  first = spawnChild(childEnv);
  await Promise.race([model.blocked, first.exited.then((result) => { throw new Error(`first Host exited before crash point: ${JSON.stringify(result)}`); }), delay(timeoutMs).then(() => { throw new Error("timeout waiting for blocked post-checkpoint model request"); })]);
  const runningBeforeCrash = queryOne(databasePath, "SELECT status,run_id runId FROM automation_runs WHERE automation_run_id=?", automationRunId);
  assert.equal(runningBeforeCrash.status, "RUNNING");
  assert.ok(runningBeforeCrash.runId);
  const runId = runningBeforeCrash.runId;
  const latestBeforeCrash = queryOne(databasePath, "SELECT event_type eventType FROM run_events WHERE run_id=? ORDER BY sequence DESC LIMIT 1", runId);
  assert.equal(latestBeforeCrash.eventType, "model.requested");
  assert.equal(queryOne(databasePath, "SELECT COUNT(*) count FROM run_events WHERE run_id=? AND event_type='run.checkpoint'", runId).count, 1);
  const preCrashOperations = queryAll(databasePath, "SELECT tool_name toolName,status,error_code errorCode FROM browser_operations WHERE run_id=?", runId);
  assert.equal(
    preCrashOperations.filter((row) => row.toolName === "browser.open" && row.status === "SUCCEEDED").length,
    1,
    `browser.open ledger missing; operations=${JSON.stringify(preCrashOperations)}`,
  );

  await forceKill(first.child);
  await first.exited;
  model.release();
  await delay(1_800);

  second = spawnChild(childEnv);
  const terminal = await waitFor(() => {
    const row = queryOne(databasePath, "SELECT status,run_id runId,error_code errorCode,attempt FROM automation_runs WHERE automation_run_id=?", automationRunId);
    return row?.status === "SUCCEEDED" || row?.status === "FAILED" ? row : null;
  }, "terminal Automation Browser run");
  if (terminal.status !== "SUCCEEDED") {
    const diagnostics = {
      automationRun: terminal,
      agentRun: queryOne(databasePath, "SELECT status,recovery_state recoveryState,current_attempt_id currentAttemptId,last_event_sequence lastEventSequence FROM agent_runs WHERE run_id=?", runId),
      attempts: queryAll(databasePath, "SELECT attempt_number attemptNumber,status,recovery_reason recoveryReason,terminal_reason terminalReason FROM run_attempts WHERE run_id=? ORDER BY attempt_number", runId),
      latestEvents: queryAll(databasePath, "SELECT sequence,event_type eventType,attempt_id attemptId FROM run_events WHERE run_id=? ORDER BY sequence DESC LIMIT 20", runId),
      modelInvocations: queryAll(databasePath, "SELECT request_number requestNumber,turn_number turnNumber,status,error_code errorCode FROM model_invocations WHERE run_id=? ORDER BY request_number", runId),
      browserOperations: queryAll(databasePath, "SELECT tool_name toolName,status,error_code errorCode FROM browser_operations WHERE run_id=? ORDER BY started_at,operation_id", runId),
    };
    process.stderr.write(`OPENRILL_STEP013CR2_RECOVERY_DIAGNOSTICS ${JSON.stringify(diagnostics)}\n`);
  }
  assert.equal(terminal.status, "SUCCEEDED", `automation failed: ${JSON.stringify(terminal)}\n${second.output()}`);
  assert.equal(terminal.runId, runId, "restart created a second Agent Run");
  assert.equal(terminal.attempt, 2, "automation run was not reclaimed after restart");

  const agentRun = queryOne(databasePath, "SELECT status,recovery_state recoveryState FROM agent_runs WHERE run_id=?", runId);
  assert.equal(agentRun.status, "COMPLETED");
  const operations = queryAll(databasePath, "SELECT tool_name toolName,status,error_code errorCode,artifact_id artifactId,input_sha256 inputSha256 FROM browser_operations WHERE run_id=? ORDER BY started_at,operation_id", runId);
  assert.ok(operations.filter((row) => row.toolName === "browser.open" && row.status === "SUCCEEDED").length >= 2, JSON.stringify(operations));
  assert.ok(operations.some((row) => row.toolName === "browser.snapshot" && row.status === "FAILED" && row.errorCode === "BROWSER_SESSION_NOT_FOUND"), JSON.stringify(operations));
  assert.ok(operations.some((row) => row.toolName === "browser.screenshot" && row.status === "SUCCEEDED" && row.artifactId), JSON.stringify(operations));
  assert.ok(operations.some((row) => row.toolName === "browser.evidence" && row.status === "SUCCEEDED"), JSON.stringify(operations));
  assert.ok(operations.every((row) => /^[0-9a-f]{64}$/.test(row.inputSha256)));
  const invocation = queryOne(databasePath, "SELECT status,error_code errorCode FROM model_invocations WHERE run_id=? AND request_number=2", runId);
  assertInterruptedModelInvocation(invocation);
  const evidence = queryAll(databasePath, "SELECT kind,payload_json payloadJson FROM browser_evidence_events WHERE run_id=? ORDER BY sequence", runId);
  assert.ok(evidence.length >= 1);
  const durableText = JSON.stringify({ operations, evidence });
  assert.doesNotMatch(durableText, /secret-step013cr2/);
  assert.doesNotMatch(durableText, /fixture-key/);
  assert.equal(queryOne(databasePath, "SELECT COUNT(*) count FROM browser_operations WHERE run_id=? AND status='STARTED'", runId).count, 0);

  const stopped = await gracefulStop(second.child, second.exited);
  assert.equal(stopped.code, 0, `second Host did not close cleanly: ${JSON.stringify(stopped)}`);
  second = null;
  const orphanIds = await waitForOrphanZero();
  assert.deepEqual(orphanIds, []);
  console.log(`OPENRILL_STEP013CR2_LIVE_PASS automation=BROWSER_RUN ledger=ACTION_EVIDENCE recovery=RESUME_AND_REOPEN model_requests=${model.requestCount()} process_count=0 chromium_orphan=0`);
} catch (error) {
  primaryError = error;
} finally {
  const cleanupFailures = [];
  if (first?.child.exitCode === null) {
    try { await forceKill(first.child); await first.exited; } catch (error) { cleanupFailures.push(error); }
  }
  if (second?.child.exitCode === null) {
    try { await gracefulStop(second.child, second.exited); } catch (error) { cleanupFailures.push(error); }
  }
  model.release();
  try { await closeServerAndWait(model.server); } catch (error) { cleanupFailures.push(error); }
  try { await closeServerAndWait(fixture.server); } catch (error) { cleanupFailures.push(error); }
  try { await removeTreeWithRetries(root); } catch (error) { cleanupFailures.push(error); }
  if (cleanupFailures.length > 0) {
    const detail = cleanupFailures.map(describeCleanupFailure).join(" | ");
    if (primaryError) process.stderr.write(`OPENRILL_STEP013CR2_CLEANUP_AFTER_FAILURE ${detail}\n`);
    else primaryError = new AggregateError(cleanupFailures, `STEP013CR2 live cleanup failed: ${detail}`);
  }
}
if (primaryError) throw primaryError;
