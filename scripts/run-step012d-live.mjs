import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { captureChildSpawnFailure, describeChromiumSpawnFailure, resolveChromiumExecutable } from "./chromium-executable.mjs";
import { attachBrowserPageEvidence, createBrowserPageEvidence, enableBrowserPageEvidence, waitForBrowserCondition } from "./browser-page-evidence.mjs";
import { closeServerAndWait, removeTreeWithRetries, terminateChildAndWait } from "./live-fixture-cleanup.mjs";
import { waitForReadyHostMetadata } from "./live-host-ready.mjs";
import { getLoopbackJson } from "./live-loopback-http.mjs";
import { verifyServedVueRuntime } from "./live-vue-static.mjs";
import { OPENRILL_STATE_SCHEMA_VERSION } from "../packages/state/dist/index.js";

const root = await mkdtemp(join(tmpdir(), "openrill-step012d-live-"));
const profile = "live";
const workspaceRoot = join(root, "automation-workspace");
const apiSecret = randomBytes(32).toString("base64url");
const finalText = `STEP012D automation completed ${randomBytes(8).toString("hex")}`;
const automationName = `Windows UI automation ${randomBytes(4).toString("hex")}`;
const renamedAutomation = `${automationName} updated`;
const vueVendorRoot = resolve(process.env.OPENRILL_VUE_RUNTIME_VENDOR_DIR ?? "apps/agent-web/public/vendor");
const vueRuntimePath = resolve(vueVendorRoot, "vue.runtime.global.prod.js");
const vueLockPath = resolve(vueVendorRoot, "vue.runtime.lock.json");
const vueRuntime = await readFile(vueRuntimePath);
const vueLock = JSON.parse(await readFile(vueLockPath, "utf8"));
const vueSha256 = createHash("sha256").update(vueRuntime).digest("hex");
if (vueLock.version !== "3.5.40" || vueLock.fileSha256 !== vueSha256 || vueRuntime.length < 80_000) {
  throw new Error(`packaged Vue runtime contract failed: ${JSON.stringify({ lock: vueLock, bytes: vueRuntime.length, sha256: vueSha256 })}`);
}
await mkdir(workspaceRoot, { recursive: true });

let providerRequests = 0;
let authorization = "";
const providerBodies = [];
function writeSse(response, events) {
  response.writeHead(200, { "content-type": "text/event-stream" });
  for (const event of events) response.write(`data: ${JSON.stringify(event)}\n\n`);
  response.end();
}
const provider = createServer(async (request, response) => {
  authorization = String(request.headers.authorization ?? "");
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  providerBodies.push(body);
  providerRequests += 1;
  if (providerRequests !== 1) {
    response.writeHead(500, { "content-type": "text/plain" });
    response.end("unexpected duplicate model execution");
    return;
  }
  writeSse(response, [
    { type: "response.created", response: { id: "step012d-response-1" } },
    { type: "response.output_text.delta", delta: finalText.slice(0, Math.ceil(finalText.length / 2)) },
    { type: "response.output_text.delta", delta: finalText.slice(Math.ceil(finalText.length / 2)) },
    { type: "response.completed", response: { id: "step012d-response-1", usage: { input_tokens: 9, output_tokens: 7, total_tokens: 16 } } },
  ]);
});
await new Promise((resolveListen) => provider.listen(0, "127.0.0.1", resolveListen));
const providerAddress = provider.address();

const env = {
  ...process.env,
  OPENRILL_DATA_ROOT: join(root, "data"),
  OPENRILL_CONFIG_ROOT: join(root, "config"),
  OPENRILL_STEP012D_PROVIDER_TOKEN: apiSecret,
  NO_COLOR: "1",
  NODE_DISABLE_COLORS: "1",
  TERM: "dumb",
};
const configPath = join(env.OPENRILL_CONFIG_ROOT, profile, "agent.yaml");
await mkdir(dirname(configPath), { recursive: true });
await writeFile(configPath, `version: 1\nhost:\n  bind: 127.0.0.1\n  port: 0\nmodelProviders:\n  default:\n    type: openai-responses\n    endpoint: http://127.0.0.1:${providerAddress.port}/v1\n    apiKey:\n      kind: env\n      key: OPENRILL_STEP012D_PROVIDER_TOKEN\n    model: fixture-model\n    maxOutputTokens: 128\n    maxRetries: 1\nworkspaces:\n  - id: main\n    path: ${JSON.stringify(workspaceRoot)}\nautomation:\n  enabled: true\nexecution:\n  approvalMode: deny\n  defaultTimeoutMs: 5000\n  approvalTimeoutMs: 120000\n`, "utf8");

async function launchHost() {
  const child = spawn(process.execPath, ["openrill.mjs", "start", "--profile", profile], { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const metadataPath = join(env.OPENRILL_DATA_ROOT, profile, "runtime", "host.json");
  const metadata = await waitForReadyHostMetadata({ metadataPath, child, output: () => output });
  return { child, metadata, output: () => output };
}
async function stopHost(child) {
  const command = spawn(process.execPath, ["openrill.mjs", "stop", "--profile", profile, "--json"], { cwd: process.cwd(), env, stdio: "ignore" });
  await new Promise((resolveExit, reject) => command.once("exit", (code) => code === 0 ? resolveExit() : reject(new Error(`stop exit ${code}`))));
  if (child.exitCode === null) await new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error("Host exit timeout")); }, 5000);
    child.once("exit", () => { clearTimeout(timer); resolveExit(); });
  });
}

class CdpClient {
  #socket;
  #nextId = 1;
  #pending = new Map();
  #listeners = new Map();
  constructor(url) { this.url = url; }
  async connect() {
    this.#socket = new WebSocket(this.url);
    await new Promise((resolveOpen, reject) => {
      this.#socket.addEventListener("open", resolveOpen, { once: true });
      this.#socket.addEventListener("error", reject, { once: true });
    });
    this.#socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.#pending.get(message.id);
        if (!pending) return;
        this.#pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result ?? {});
        return;
      }
      for (const listener of this.#listeners.get(message.method) ?? []) listener(message.params ?? {});
    });
  }
  on(method, listener) {
    const entries = this.#listeners.get(method) ?? [];
    entries.push(listener);
    this.#listeners.set(method, entries);
  }
  call(method, params = {}) {
    const id = this.#nextId++;
    return new Promise((resolveCall, reject) => {
      this.#pending.set(id, { resolve: resolveCall, reject, method });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.#socket?.close(); }
}

async function launchBrowser(url) {
  const userData = join(root, "chromium");
  await mkdir(userData, { recursive: true });
  const resolvedBrowser = await resolveChromiumExecutable();
  const browser = spawn(resolvedBrowser.executable, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--disable-background-networking", "--disable-component-update", "--disable-default-apps",
    "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0",
    `--user-data-dir=${userData}`, "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  browser.stdout.on("data", (chunk) => { output += chunk; });
  browser.stderr.on("data", (chunk) => { output += chunk; });
  const spawnState = captureChildSpawnFailure(browser, { executable: resolvedBrowser.executable, onDiagnostic: (detail) => { output += `${detail}\n`; } });
  const activePort = join(userData, "DevToolsActivePort");
  let port;
  for (let attempt = 0; attempt < 320; attempt += 1) {
    if (spawnState.failure) throw new Error(describeChromiumSpawnFailure(spawnState.failure, resolvedBrowser.executable), { cause: spawnState.failure });
    if (browser.exitCode !== null) throw new Error(`Chromium exited ${browser.exitCode}: ${output}`);
    try { port = Number((await readFile(activePort, "utf8")).split(/\r?\n/, 1)[0]); break; }
    catch { await new Promise((resolveWait) => setTimeout(resolveWait, 25)); }
  }
  if (!port) throw new Error(`Chromium DevTools port timeout: ${output}`);
  let target;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const targets = (await getLoopbackJson(`http://127.0.0.1:${port}/json/list`, { label: "step012d-chromium-targets", expectedStatus: 200, maxBytes: 1024 * 1024 })).json;
    target = targets.find((item) => item.type === "page");
    if (target?.webSocketDebuggerUrl) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  if (!target?.webSocketDebuggerUrl) throw new Error(`Chromium page target missing: ${output}`);
  const cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  const evidence = attachBrowserPageEvidence(cdp, createBrowserPageEvidence());
  await enableBrowserPageEvidence(cdp);
  const navigation = await cdp.call("Page.navigate", { url });
  if (navigation.errorText) throw new Error(`Chromium navigation failed: ${navigation.errorText}`);
  return { browser, cdp, evidence };
}
async function evaluate(cdp, expression) {
  const result = await cdp.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(`browser evaluation failed: ${JSON.stringify(result.exceptionDetails)}`);
  return result.result?.value;
}
async function waitFor(cdp, expression, description, timeoutMs, evidence) {
  return await waitForBrowserCondition(cdp, expression, description, { timeoutMs, evidence });
}

function redactSecrets(value) {
  return String(value ?? "")
    .replaceAll(apiSecret, "<REDACTED>")
    .replace(/[A-Za-z0-9_-]{32,}/g, "<REDACTED_TOKEN>");
}
async function readStartupEvidence(base, host, cdp) {
  let currentMetadata = null;
  let bootstrap = null;
  let uiState = null;
  try {
    const raw = JSON.parse(await readFile(join(env.OPENRILL_DATA_ROOT, profile, "runtime", "host.json"), "utf8"));
    currentMetadata = { state: raw.state, readiness: raw.readiness, port: raw.port, version: raw.version, profile: raw.profile };
  } catch (error) { currentMetadata = { error: error instanceof Error ? error.message : String(error) }; }
  try {
    const response = await getLoopbackJson(`${base}/ui/bootstrap`, { label: "step012d-startup-bootstrap", maxBytes: 1024 * 1024 });
    const payload = response.json;
    bootstrap = { status: response.status, product: payload.product, version: payload.version, profile: payload.profile, protocolPath: payload.protocol?.path, workspaceCount: Array.isArray(payload.workspaces) ? payload.workspaces.length : null };
  } catch (error) { bootstrap = { error: error instanceof Error ? error.message : String(error) }; }
  try {
    uiState = await evaluate(cdp, `({ connection: document.querySelector('[data-testid="connection-state"]')?.textContent ?? null, startupPhase: document.querySelector('[data-testid="startup-phase"]')?.textContent ?? null, alert: document.querySelector('[role="alert"]')?.textContent ?? null, appShell: !!document.querySelector('[data-testid="app-shell"]') })`);
  } catch (error) { uiState = { error: error instanceof Error ? error.message : String(error) }; }
  return { currentMetadata, bootstrap, uiState, hostOutput: redactSecrets(host.output()).slice(-4000) };
}
async function waitForAutomationUiReady(base, host, cdp, evidence, description) {
  try {
    return await waitFor(cdp, `document.querySelector('[data-testid="connection-state"]')?.textContent === 'CONNECTED' && document.querySelector('[data-testid="startup-phase"]')?.textContent === 'READY'`, description, 30_000, evidence);
  } catch (error) {
    const startup = await readStartupEvidence(base, host, cdp);
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nOPENRILL_STEP012D_STARTUP_EVIDENCE_BEGIN\n${JSON.stringify(startup, null, 2)}\nOPENRILL_STEP012D_STARTUP_EVIDENCE_END`);
  }
}

async function click(cdp, selector) {
  const clicked = await evaluate(cdp, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!(element instanceof HTMLElement)) return false; element.click(); return true; })()`);
  if (!clicked) throw new Error(`browser selector not clickable: ${selector}`);
}
async function setControl(cdp, selector, value) {
  const changed = await evaluate(cdp, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return false; element.value = ${JSON.stringify(value)}; element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  if (!changed) throw new Error(`browser control not found: ${selector}`);
}

let host;
let browser;
let primaryFailure = null;
try {
  host = await launchHost();
  const base = `http://127.0.0.1:${host.metadata.port}`;
  await verifyServedVueRuntime({ baseUrl: base, vendorRoot: vueVendorRoot });
  const launched = await launchBrowser(`${base}/#/automations`);
  browser = launched.browser;
  const { cdp, evidence } = launched;
  await waitForAutomationUiReady(base, host, cdp, evidence, "Automation UI ready");
  const framework = await evaluate(cdp, `({ vueVersion: window.Vue?.version, framework: document.querySelector('[data-testid="app-shell"]')?.getAttribute('data-framework'), route: location.hash })`);
  if (framework.vueVersion !== "3.5.40" || framework.framework !== "vue-3" || framework.route !== "#/automations") throw new Error(`Automation UI framework/route mismatch: ${JSON.stringify(framework)}`);

  await click(cdp, `[data-testid="automation-new"]`);
  await setControl(cdp, `[data-testid="automation-name"]`, automationName);
  await setControl(cdp, `[data-testid="automation-prompt"]`, "Produce the deterministic STEP012D completion message");
  await setControl(cdp, `[data-testid="automation-interval-minutes"]`, "60");
  await click(cdp, `[data-testid="automation-save"]`);
  await waitFor(cdp, `document.querySelector('[data-testid="automation-action-state"]')?.textContent === 'CREATED'`, "Automation created", 12_000, evidence);
  await waitFor(cdp, `document.querySelector('[data-testid="automation-summary"]')?.textContent?.includes('DISABLED')`, "Created Automation selected", 12_000, evidence);

  await click(cdp, `[data-testid="automation-run-now"]`);
  await waitFor(cdp, `document.querySelector('[data-testid="automation-action-state"]')?.textContent === 'RUN_CREATED'`, "Manual Automation created", 18_000, evidence);
  await waitFor(cdp, `document.querySelector('[data-testid="automation-history"]')?.textContent?.includes('SUCCEEDED')`, "Automation history refreshed by domain notice", 18_000, evidence);
  const firstHistory = await evaluate(cdp, `({ rows: document.querySelectorAll('[data-testid^="automation-history-row-"]').length, text: document.querySelector('[data-testid="automation-history"]')?.textContent ?? '' })`);
  if (firstHistory.rows !== 1 || !firstHistory.text.includes("MANUAL") || !firstHistory.text.includes("SUCCEEDED")) throw new Error(`Automation first history mismatch: ${JSON.stringify(firstHistory)}`);

  await click(cdp, `[data-testid="automation-replay-run"]`);
  await waitFor(cdp, `document.querySelector('[data-testid="automation-action-state"]')?.textContent === 'RUN_REPLAYED'`, "Durable manual request replayed", 12_000, evidence);
  const replayHistoryRows = await evaluate(cdp, `document.querySelectorAll('[data-testid^="automation-history-row-"]').length`);
  if (replayHistoryRows !== 1) throw new Error(`Durable manual replay duplicated history: ${replayHistoryRows}`);

  await click(cdp, `[data-testid="automation-toggle"]`);
  await waitFor(cdp, `document.querySelector('[data-testid="automation-action-state"]')?.textContent === 'ENABLED' && document.querySelector('[data-testid="automation-summary"]')?.textContent?.includes('ENABLED')`, "Automation enabled", 12_000, evidence);
  await setControl(cdp, `[data-testid="automation-name"]`, renamedAutomation);
  await click(cdp, `[data-testid="automation-save"]`);
  await waitFor(cdp, `document.querySelector('[data-testid="automation-action-state"]')?.textContent === 'UPDATED'`, "Automation updated", 12_000, evidence);
  await waitFor(cdp, `document.querySelector('.automation-list')?.textContent?.includes(${JSON.stringify(renamedAutomation)})`, "Automation list notice refresh", 12_000, evidence);
  await click(cdp, `[data-testid="automation-toggle"]`);
  await waitFor(cdp, `document.querySelector('[data-testid="automation-action-state"]')?.textContent === 'DISABLED'`, "Automation disabled", 12_000, evidence);

  await cdp.call("Page.reload", { ignoreCache: true });
  await waitForAutomationUiReady(base, host, cdp, evidence, "Reloaded Automation UI ready");
  await waitFor(cdp, `document.querySelector('.automation-list')?.textContent?.includes(${JSON.stringify(renamedAutomation)})`, "Automation persisted after reload", 12_000, evidence);
  const reloadState = await evaluate(cdp, `({ route: location.hash, tokenPersisted: Object.keys(localStorage).some((key) => /token|secret|credential/i.test(key)), error: document.querySelector('[role="alert"]')?.textContent ?? null })`);
  if (reloadState.route !== "#/automations" || reloadState.tokenPersisted || reloadState.error) throw new Error(`Automation reload contract failed: ${JSON.stringify(reloadState)}`);

  await cdp.call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const mobile = await evaluate(cdp, `({ width: document.documentElement.scrollWidth, viewport: innerWidth, nav: !!document.querySelector('[data-testid="nav-automations"]'), editor: !!document.querySelector('.automation-editor') })`);
  if (mobile.width > mobile.viewport + 2 || !mobile.nav || !mobile.editor) throw new Error(`Automation mobile smoke failed: ${JSON.stringify(mobile)}`);
  await cdp.call("Emulation.clearDeviceMetricsOverride");
  cdp.close();
  await terminateChildAndWait(browser, { label: "Chromium" });
  browser = null;

  await stopHost(host.child);
  const dbPath = join(env.OPENRILL_DATA_ROOT, profile, "state", "agent.db");
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const identity = db.prepare("SELECT schema_version schemaVersion FROM state_identity WHERE id=1").get();
  const job = db.prepare("SELECT job_id jobId,name,enabled,revision,schedule_type scheduleType,schedule_payload_json schedulePayload FROM automation_jobs ORDER BY created_at DESC LIMIT 1").get();
  const runs = db.prepare("SELECT automation_run_id automationRunId,status,trigger_kind triggerKind,request_key requestKey,run_id runId,attempt FROM automation_runs WHERE job_id=? ORDER BY created_at").all(job.jobId);
  const agentRun = db.prepare("SELECT status,conversation_id conversationId FROM agent_runs WHERE run_id=?").get(runs[0].runId);
  const conversation = db.prepare("SELECT title,workspace_id workspaceId FROM conversations WHERE conversation_id=?").get(agentRun.conversationId);
  const assistant = db.prepare("SELECT content_json content FROM conversation_messages WHERE conversation_id=? AND role='assistant' ORDER BY sequence DESC LIMIT 1").get(agentRun.conversationId);
  db.close();
  const schedulePayload = JSON.parse(job.schedulePayload);
  const assistantContent = JSON.parse(assistant.content);
  if (identity.schemaVersion !== OPENRILL_STATE_SCHEMA_VERSION) throw new Error(`schema mismatch: ${JSON.stringify(identity)}`);
  if (job.name !== renamedAutomation || job.enabled !== 0 || job.revision !== 4 || job.scheduleType !== "INTERVAL" || schedulePayload.everyMs !== 3_600_000) throw new Error(`Automation job ledger mismatch: ${JSON.stringify({ job, schedulePayload })}`);
  if (runs.length !== 1 || runs[0].status !== "SUCCEEDED" || runs[0].triggerKind !== "MANUAL" || !runs[0].requestKey || !runs[0].runId || runs[0].attempt !== 1) throw new Error(`Automation run ledger mismatch: ${JSON.stringify(runs)}`);
  if (agentRun.status !== "COMPLETED" || conversation.workspaceId !== "main" || !String(assistantContent.text ?? "").includes(finalText)) throw new Error(`Conversation Run ledger mismatch: ${JSON.stringify({ agentRun, conversation, assistantContent })}`);
  if (providerRequests !== 1 || authorization !== `Bearer ${apiSecret}` || providerBodies.some((body) => body.store !== false)) throw new Error(`Provider/idempotency boundary mismatch: ${JSON.stringify({ providerRequests, authorization, bodies: providerBodies.length })}`);
  const dbBytes = await readFile(dbPath);
  if (dbBytes.includes(Buffer.from(apiSecret))) throw new Error("provider secret leaked into SQLite");
  if (evidence.entries.length) throw new Error(`browser runtime errors: ${JSON.stringify(evidence.entries.slice(0, 8))}`);
  process.stdout.write(`OPENRILL_STEP012D_LIVE_PASS schema=${OPENRILL_STATE_SCHEMA_VERSION} framework=VUE_3 automation=CREATE_UPDATE_ENABLE_DISABLE_RUN_NOW_HISTORY replay=DURABLE notices=JOB_RUN_REFRESH conversation=COMPLETED browser=CHROMIUM mobile=PASS modelCalls=1 secret=POINT_OF_USE\n`);
} catch (error) {
  primaryFailure = error;
  throw error;
} finally {
  const cleanupFailures = [];
  try { await terminateChildAndWait(browser, { label: "Chromium" }); } catch (error) { cleanupFailures.push(error); }
  try { await terminateChildAndWait(host?.child, { label: "OpenRill Host" }); } catch (error) { cleanupFailures.push(error); }
  try { await closeServerAndWait(provider); } catch (error) { cleanupFailures.push(error); }
  try { await removeTreeWithRetries(root); } catch (error) { cleanupFailures.push(error); }
  if (cleanupFailures.length > 0) {
    const detail = cleanupFailures.map((error) => error instanceof Error ? error.message : String(error)).join(" | ");
    if (primaryFailure) process.stderr.write(`OPENRILL_STEP012D_CLEANUP_AFTER_FAILURE ${detail}\n`);
    else throw new AggregateError(cleanupFailures, `STEP012D live cleanup failed: ${detail}`);
  }
}
