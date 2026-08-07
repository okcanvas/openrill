import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { captureChildSpawnFailure, describeChromiumSpawnFailure, resolveChromiumExecutable } from "./chromium-executable.mjs";
import { attachBrowserPageEvidence, createBrowserPageEvidence, enableBrowserPageEvidence, waitForBrowserCondition } from "./browser-page-evidence.mjs";
import { DatabaseSync } from "node:sqlite";
import { closeServerAndWait, describeCleanupFailure, removeTreeWithRetries, terminateChildAndWait } from "./live-fixture-cleanup.mjs";
import { getLoopbackJson } from "./live-loopback-http.mjs";
import { OPENRILL_STATE_SCHEMA_VERSION } from "../packages/state/dist/index.js";

const root = await mkdtemp(join(tmpdir(), "openrill-step011-live-"));
const profile = "live";
const workspaceRoot = join(root, "ui-workspace");
const apiSecret = randomBytes(32).toString("base64url");
const processSecret = randomBytes(32).toString("hex");
const outputMarker = `ui-artifact-${randomBytes(12).toString("hex")}`;
const finalText = "OpenRill Control UI vertical slice completed";
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
function toolEvents(responseId, callId, name, argumentsValue) {
  const json = JSON.stringify(argumentsValue);
  const split = Math.ceil(json.length / 2);
  return [
    { type: "response.created", response: { id: responseId } },
    { type: "response.output_item.added", item: { type: "function_call", call_id: callId, name, arguments: "" } },
    { type: "response.function_call_arguments.delta", call_id: callId, delta: json.slice(0, split) },
    { type: "response.function_call_arguments.delta", call_id: callId, delta: json.slice(split) },
    { type: "response.output_item.done", item: { type: "function_call", call_id: callId, name, arguments: json } },
    { type: "response.completed", response: { id: responseId, usage: { input_tokens: 7, output_tokens: 4, total_tokens: 11 } } },
  ];
}
function toolOutputs(body) {
  return Array.isArray(body.input)
    ? body.input.filter((item) => item?.type === "function_call_output").map((item) => JSON.parse(item.output))
    : [];
}
const provider = createServer(async (request, response) => {
  authorization = String(request.headers.authorization ?? "");
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  providerBodies.push(body);
  providerRequests += 1;
  if (providerRequests === 1) {
    writeSse(response, toolEvents("step011-response-1", "ui-process-1", "process.run", {
      command: {
        kind: "argv",
        executable: process.execPath,
        args: ["-e", "console.log(process.env.UI_CHECK?.length ? 'ui-process-approved' : 'secret-missing')"],
      },
      env: { secrets: { UI_CHECK: { kind: "env", key: "OPENRILL_STEP011_PROCESS_SECRET" } } },
      background: false,
    }));
    return;
  }
  if (providerRequests === 2) {
    const output = toolOutputs(body).at(-1);
    if (output?.name !== "process.run" || output.isError || output.output?.status !== "EXITED" || !String(output.output?.stdout).includes("ui-process-approved")) {
      throw new Error(`approved process output missing: ${JSON.stringify(output)}`);
    }
    writeSse(response, toolEvents("step011-response-2", "ui-write-1", "workspace.write", {
      path: "ui-result.txt",
      content: `${outputMarker}\n`,
      expectedRevision: "MISSING",
    }));
    return;
  }
  if (providerRequests === 3) {
    const output = toolOutputs(body).at(-1);
    if (output?.name !== "workspace.write" || output.isError || output.output?.artifact?.kind !== "FILE_CHANGE") {
      throw new Error(`workspace write output missing: ${JSON.stringify(output)}`);
    }
    writeSse(response, [
      { type: "response.created", response: { id: "step011-response-3" } },
      { type: "response.output_text.delta", delta: finalText.slice(0, 18) },
      { type: "response.output_text.delta", delta: finalText.slice(18) },
      { type: "response.completed", response: { id: "step011-response-3", usage: { input_tokens: 7, output_tokens: 5, total_tokens: 12 } } },
    ]);
    return;
  }
  response.writeHead(500, { "content-type": "text/plain" });
  response.end("unexpected provider request");
});
await new Promise((resolveListen) => provider.listen(0, "127.0.0.1", resolveListen));
const providerAddress = provider.address();

const env = {
  ...process.env,
  OPENRILL_DATA_ROOT: join(root, "data"),
  OPENRILL_CONFIG_ROOT: join(root, "config"),
  OPENRILL_STEP011_PROVIDER_TOKEN: apiSecret,
  OPENRILL_STEP011_PROCESS_SECRET: processSecret,
  NO_COLOR: "1",
  NODE_DISABLE_COLORS: "1",
  TERM: "dumb",
};
const configPath = join(env.OPENRILL_CONFIG_ROOT, profile, "agent.yaml");
await mkdir(dirname(configPath), { recursive: true });
await writeFile(configPath, `version: 1\nhost:\n  bind: 127.0.0.1\n  port: 0\nmodelProviders:\n  default:\n    type: openai-responses\n    endpoint: http://127.0.0.1:${providerAddress.port}/v1\n    apiKey:\n      kind: env\n      key: OPENRILL_STEP011_PROVIDER_TOKEN\n    model: fixture-model\n    maxOutputTokens: 128\n    maxRetries: 1\nworkspaces:\n  - id: main\n    path: ${JSON.stringify(workspaceRoot)}\nexecution:\n  approvalMode: ask\n  defaultTimeoutMs: 5000\n  approvalTimeoutMs: 120000\n`, "utf8");

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
  const spawnState = captureChildSpawnFailure(browser, {
    executable: resolvedBrowser.executable,
    onDiagnostic: (detail) => { output += `${detail}\n`; },
  });
  const activePort = join(userData, "DevToolsActivePort");
  let port;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (spawnState.failure) throw new Error(describeChromiumSpawnFailure(spawnState.failure, resolvedBrowser.executable), { cause: spawnState.failure });
    if (browser.exitCode !== null) throw new Error(`Chromium exited ${browser.exitCode} executable=${JSON.stringify(resolvedBrowser.executable)} source=${resolvedBrowser.source}: ${output}`);
    try { port = Number((await readFile(activePort, "utf8")).split(/\r?\n/, 1)[0]); break; }
    catch { await new Promise((resolveWait) => setTimeout(resolveWait, 25)); }
  }
  if (!port) throw new Error(`Chromium DevTools port timeout: ${output}`);
  let target;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const targets = (await getLoopbackJson(`http://127.0.0.1:${port}/json/list`, { label: "step011-chromium-targets", expectedStatus: 200, maxBytes: 1024 * 1024 })).json;
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
  return { browser, cdp, evidence, output: () => output };
}

async function evaluate(cdp, expression) {
  const result = await cdp.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(`browser evaluation failed: ${JSON.stringify(result.exceptionDetails)}`);
  return result.result?.value;
}
async function waitFor(cdp, expression, description, timeoutMs = 12_000, evidence = createBrowserPageEvidence()) {
  return await waitForBrowserCondition(cdp, expression, description, { timeoutMs, evidence });
}

function approvalWaitLedgerEvidence() {
  const dbPath = join(env.OPENRILL_DATA_ROOT, profile, "state", "agent.db");
  try {
    const database = new DatabaseSync(dbPath, { readOnly: true, timeout: 500 });
    try {
      return {
        providerRequests,
        approvals: database.prepare("SELECT request_id requestId,run_id runId,status,version,tool_name toolName,created_at createdAt,expires_at expiresAt FROM approval_requests ORDER BY created_at,request_id").all(),
        runs: database.prepare("SELECT run_id runId,status,recovery_state recoveryState,updated_at updatedAt FROM agent_runs ORDER BY created_at,run_id").all(),
      };
    } finally { database.close(); }
  } catch (error) {
    return { providerRequests, ledgerReadError: error instanceof Error ? error.message : String(error) };
  }
}

async function waitForPendingApproval(cdp, evidence) {
  try {
    return await waitFor(cdp, `document.querySelector('[data-testid="approval-allow-once"]')`, "pending approval rendered", 12_000, evidence);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error([
      message,
      "OPENRILL_APPROVAL_WAIT_EVIDENCE_BEGIN",
      JSON.stringify(approvalWaitLedgerEvidence(), null, 2),
      "OPENRILL_APPROVAL_WAIT_EVIDENCE_END",
    ].join("\n"), { cause: error });
  }
}

async function click(cdp, selector) {
  const clicked = await evaluate(cdp, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!(element instanceof HTMLElement)) return false; element.click(); return true; })()`);
  if (!clicked) throw new Error(`browser selector not clickable: ${selector}`);
}
async function input(cdp, selector, value) {
  const changed = await evaluate(cdp, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!(element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement)) return false; element.value = ${JSON.stringify(value)}; element.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  if (!changed) throw new Error(`browser input not found: ${selector}`);
}

let host;
let browser;
let primaryFailure = null;
try {
  host = await launchHost();
  const base = `http://127.0.0.1:${host.metadata.port}`;
  const launched = await launchBrowser(`${base}/#/conversations`);
  browser = launched.browser;
  const { cdp, evidence } = launched;
  await waitFor(cdp, `document.querySelector('[data-testid="connection-state"]')?.textContent === 'CONNECTED'`, "Vue UI connected", 12_000, evidence);
  const framework = await evaluate(cdp, `({ vueVersion: window.Vue?.version, framework: document.querySelector('[data-testid="app-shell"]')?.getAttribute('data-framework') })`);
  if (framework.vueVersion !== "3.5.40" || framework.framework !== "vue-3") throw new Error(`actual Vue runtime mismatch: ${JSON.stringify(framework)}`);

  await click(cdp, `[data-testid="new-conversation"]`);
  await waitFor(cdp, `!document.querySelector('[data-testid="composer"]')?.disabled`, "conversation composer enabled", 12_000, evidence);
  await input(cdp, `[data-testid="composer"]`, "Run the approved UI process and write the result artifact");
  await click(cdp, `[data-testid="send-message"]`);
  await waitFor(cdp, `document.querySelector('[data-testid="submit-state"]')?.textContent?.includes('SENT')`, "message submitted", 12_000, evidence);
  await click(cdp, `[data-testid="nav-approvals"]`);
  await waitForPendingApproval(cdp, evidence);
  const requestId = await evaluate(cdp, `document.querySelector('[data-testid^="approval-"][data-request-id]')?.getAttribute('data-request-id')`);
  if (!requestId) throw new Error("approval deep-link identity missing");
  await evaluate(cdp, `location.hash = '#/approvals/${requestId}'`);
  await waitFor(cdp, `document.querySelector('[data-request-id="${requestId}"]')?.classList.contains('selected')`, "approval deep link selected", 12_000, evidence);
  await click(cdp, `[data-testid="approval-allow-once"]`);

  await click(cdp, `[data-testid="nav-conversations"]`);
  await waitFor(cdp, `document.querySelector('[data-testid="transcript"]')?.textContent?.includes(${JSON.stringify(finalText)})`, "final streamed text rendered", 18_000, evidence);
  const textCardCount = await evaluate(cdp, `Array.from(document.querySelectorAll('[data-testid="card-text"]')).filter((node) => node.textContent?.includes(${JSON.stringify(finalText)})).length`);
  if (textCardCount !== 1) throw new Error(`final text card duplication: ${textCardCount}`);

  await click(cdp, `[data-testid="nav-artifacts"]`);
  await waitFor(cdp, `document.querySelector('[data-testid="artifact-file"]')`, "artifact link rendered", 12_000, evidence);
  await click(cdp, `[data-testid="artifact-file"]`);
  await waitFor(cdp, `document.querySelector('[data-testid="artifact-content"]')?.textContent?.includes(${JSON.stringify(outputMarker)})`, "artifact content opened", 12_000, evidence);
  const landmarkState = await evaluate(cdp, `({ banner: !!document.querySelector('[role="banner"]'), nav: !!document.querySelector('nav[aria-label]'), main: !!document.querySelector('main'), dialog: !!document.querySelector('[role="dialog"][aria-modal="true"]') })`);
  if (!Object.values(landmarkState).every(Boolean)) throw new Error(`accessibility landmarks missing: ${JSON.stringify(landmarkState)}`);

  const cursorBefore = await evaluate(cdp, `Number(Object.entries(localStorage).find(([key]) => key.startsWith('openrill.ui.cursor.'))?.[1] ?? -1)`);
  if (!Number.isSafeInteger(cursorBefore) || cursorBefore < 1) throw new Error(`reconnect cursor missing: ${cursorBefore}`);
  await cdp.call("Page.reload", { ignoreCache: true });
  await waitFor(cdp, `document.querySelector('[data-testid="connection-state"]')?.textContent === 'CONNECTED'`, "reloaded UI reconnected", 12_000, evidence);
  const reconnectState = await evaluate(cdp, `({ cursor: Number(Object.entries(localStorage).find(([key]) => key.startsWith('openrill.ui.cursor.'))?.[1] ?? -1), route: location.hash, tokenPersisted: Object.keys(localStorage).some((key) => /token|secret|credential/i.test(key)) })`);
  if (reconnectState.cursor < cursorBefore || reconnectState.tokenPersisted) throw new Error(`reconnect/localStorage contract failed: ${JSON.stringify({ cursorBefore, reconnectState })}`);

  await cdp.call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const mobile = await evaluate(cdp, `({ width: document.documentElement.scrollWidth, viewport: innerWidth, nav: !!document.querySelector('[data-testid="nav-conversations"]') })`);
  if (mobile.width > mobile.viewport + 2 || !mobile.nav) throw new Error(`mobile width smoke failed: ${JSON.stringify(mobile)}`);
  await cdp.call("Emulation.clearDeviceMetricsOverride");
  cdp.close();
  await terminateChildAndWait(browser, { label: "Chromium" });
  browser = null;

  await stopHost(host.child);
  const dbPath = join(env.OPENRILL_DATA_ROOT, profile, "state", "agent.db");
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const identity = db.prepare("SELECT schema_version schemaVersion FROM state_identity WHERE id=1").get();
  const approval = db.prepare("SELECT status,decision FROM approval_requests ORDER BY created_at DESC LIMIT 1").get();
  const attempt = db.prepare("SELECT status,model_call_count modelCalls,tool_call_count toolCalls FROM run_attempts ORDER BY created_at DESC LIMIT 1").get();
  const artifact = db.prepare("SELECT kind,operation,relative_path relativePath FROM workspace_artifacts ORDER BY created_at DESC LIMIT 1").get();
  const processes = db.prepare("SELECT count(*) count FROM process_records WHERE status='EXITED' AND exit_code=0").get();
  db.close();
  if (identity.schemaVersion !== OPENRILL_STATE_SCHEMA_VERSION || approval.status !== "CONSUMED" || approval.decision !== "allow_once") throw new Error(`approval/schema ledger mismatch: ${JSON.stringify({ identity, approval })}`);
  if (attempt.status !== "COMPLETED" || attempt.modelCalls !== 3 || attempt.toolCalls !== 2) throw new Error(`attempt ledger mismatch: ${JSON.stringify(attempt)}`);
  if (artifact.kind !== "FILE_CHANGE" || artifact.operation !== "WRITE" || artifact.relativePath !== "ui-result.txt" || processes.count !== 1) throw new Error(`artifact/process ledger mismatch: ${JSON.stringify({ artifact, processes })}`);
  if (providerRequests !== 3 || authorization !== `Bearer ${apiSecret}` || providerBodies.some((body) => body.store !== false)) throw new Error("provider boundary mismatch");
  const dbBytes = await readFile(dbPath);
  if (dbBytes.includes(Buffer.from(apiSecret)) || dbBytes.includes(Buffer.from(processSecret))) throw new Error("secret literal leaked into SQLite");
  if (evidence.entries.length) throw new Error(`browser runtime errors: ${JSON.stringify(evidence.entries.slice(0, 5))}`);
  process.stdout.write(`OPENRILL_STEP011_LIVE_PASS schema=${OPENRILL_STATE_SCHEMA_VERSION} framework=VUE_3 ui=VERTICAL_SLICE approval=ALLOW_ONCE artifact=OPENED reconnect=CURSOR_RESUME mobile=PASS modelCalls=3 toolCalls=2 secret=POINT_OF_USE\n`);
} catch (error) {
  primaryFailure = error;
  throw error;
} finally {
  const cleanupFailures = [];
  try { await terminateChildAndWait(browser, { label: "Chromium" }); }
  catch (error) { cleanupFailures.push(error); }
  try { await terminateChildAndWait(host?.child, { label: "OpenRill Host" }); }
  catch (error) { cleanupFailures.push(error); }
  try { await closeServerAndWait(provider); }
  catch (error) { cleanupFailures.push(error); }
  try { await removeTreeWithRetries(root); }
  catch (error) { cleanupFailures.push(error); }
  if (cleanupFailures.length > 0) {
    const detail = cleanupFailures.map(describeCleanupFailure).join(" | ");
    if (primaryFailure) process.stderr.write(`OPENRILL_STEP011_CLEANUP_AFTER_FAILURE ${detail}\n`);
    else throw new AggregateError(cleanupFailures, `STEP011 live cleanup failed: ${detail}`);
  }
}
