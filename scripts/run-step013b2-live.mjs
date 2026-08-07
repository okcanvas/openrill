import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { BrowserRuntime, registerBrowserTools } from "../packages/browser-runtime/dist/index.js";
import { createPlaywrightBrowserDriver } from "../packages/browser-playwright/dist/index.js";
import { ToolRegistry } from "../packages/tool-runtime/dist/index.js";

const marker = `openrill-step013b2-${randomUUID()}`;
const context = {
  runId: "step013b2-live-run",
  attemptId: "step013b2-live-attempt",
  workspaceId: "step013b2-live-workspace",
  conversationId: "step013b2-live-conversation",
  toolCallId: "step013b2-live-tool",
};

function fixture(pathname) {
  if (pathname === "/form") {
    return `<!doctype html><html><head><title>OpenRill Interaction Form</title></head><body>
      <main><h1>Interaction form</h1>
        <form action="/after" method="get">
          <label>Name <input aria-label="Name" name="name" oninput="document.getElementById('name-state').textContent='name='+this.value"></label>
          <p id="name-state">name=</p>
          <label>Choice <select aria-label="Choice" name="choice" onchange="document.getElementById('choice-state').textContent='choice='+this.value"><option value="a">Alpha</option><option value="b">Beta</option></select></label>
          <p id="choice-state">choice=a</p>
          <button type="button" aria-label="Click me" onclick="document.getElementById('click-state').textContent='clicked=yes'">Click me</button>
          <p id="click-state">clicked=no</p>
          <button type="button" aria-label="Blocked navigation" onclick="location.href='http://127.0.0.2/openrill-blocked'">Blocked navigation</button>
          <button type="submit" aria-label="Continue">Continue</button>
        </form>
        <p id="key-state">key=none</p>
        <script>addEventListener('keydown',event=>{document.getElementById('key-state').textContent='key='+event.key})</script>
      </main>
    </body></html>`;
  }
  if (pathname === "/after") {
    return `<!doctype html><html><head><title>OpenRill Interaction Result</title></head><body><main>
      <h1>Interaction completed</h1><p>Action-triggered navigation reached the second document.</p>
      <button type="button" aria-label="Open dialog" onclick="confirm('Proceed with OpenRill?')">Open dialog</button>
      <button type="button" aria-label="Finish" onclick="document.getElementById('finish-state').textContent='finished=yes'">Finish</button>
      <p id="finish-state">finished=no</p>
    </main></body></html>`;
  }
  return null;
}

async function startFixtureServer() {
  const server = createServer((request, response) => {
    const page = fixture(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    if (!page) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
      return;
    }
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action 'self'",
    });
    response.end(page);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function markerProcessIds() {
  if (process.platform === "win32") {
    const script = [
      "$needle=$env:OPENRILL_BROWSER_MARKER;",
      "Get-CimInstance Win32_Process |",
      "Where-Object { $_.CommandLine -and $_.CommandLine.Contains($needle) } |",
      "ForEach-Object { $_.ProcessId }",
    ].join(" ");
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      encoding: "utf8",
      env: { ...process.env, OPENRILL_BROWSER_MARKER: marker },
      windowsHide: true,
    });
    if (result.error || result.status !== 0) throw new Error(`failed to inspect Windows Chromium processes: ${result.error?.message ?? result.stderr}`);
    return result.stdout.split(/\r?\n/).map((value) => Number.parseInt(value.trim(), 10)).filter(Number.isInteger);
  }
  const result = spawnSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`failed to inspect Chromium processes: ${result.error?.message ?? result.stderr}`);
  return result.stdout.split(/\r?\n/).flatMap((line) => {
    if (!line.includes(marker)) return [];
    const match = line.trim().match(/^(\d+)\s+/);
    return match ? [Number.parseInt(match[1], 10)] : [];
  });
}

async function waitForOrphanZero() {
  const deadline = Date.now() + 5_000;
  let ids = markerProcessIds();
  while (ids.length > 0 && Date.now() < deadline) {
    await delay(100);
    ids = markerProcessIds();
  }
  return ids;
}

function requireSuccess(result, name) {
  assert.equal(result.isError, false, `${name} returned tool error: ${JSON.stringify(result.output)}`);
  return result.output;
}
function requireError(result, code, name) {
  assert.equal(result.isError, true, `${name} unexpectedly succeeded: ${JSON.stringify(result.output)}`);
  assert.equal(result.output.error.code, code, `${name} returned wrong error: ${JSON.stringify(result.output)}`);
  return result.output.error;
}
function findRef(snapshot, role, name) {
  const element = snapshot.elements.find((candidate) => candidate.role === role && candidate.name === name);
  assert.ok(element?.ref, `snapshot missing ${role}/${name}: ${JSON.stringify(snapshot.elements)}`);
  return element.ref;
}

const fixtureServer = await startFixtureServer();
const launchArgs = [
  "--disable-background-networking",
  "--disable-component-update",
  "--no-first-run",
  `--openrill-step013b2-marker=${marker}`,
  ...(typeof process.getuid === "function" && process.getuid() === 0 ? ["--no-sandbox"] : []),
];
const driver = createPlaywrightBrowserDriver({
  ...(process.env.OPENRILL_BROWSER_EXECUTABLE ? { executablePath: process.env.OPENRILL_BROWSER_EXECUTABLE } : {}),
  launchArgs,
});
const runtime = new BrowserRuntime({
  driver,
  executablePath: driver.executable.executablePath,
  headless: true,
  limits: {
    maxSessions: 1,
    maxPagesPerSession: 2,
    launchTimeoutMs: 20_000,
    actionTimeoutMs: 10_000,
    idleTimeoutMs: 60_000,
    sweepIntervalMs: 60_000,
  },
  policy: {
    navigation: { allowPrivateNetwork: false, allowedHostnames: ["127.0.0.1"] },
    popup: "DENY",
    download: "DENY",
    persistentStorage: "DENY",
    dialog: "BLOCK_AND_DISMISS",
  },
});
const tools = new ToolRegistry();
registerBrowserTools(tools, runtime);

let primaryError;
try {
  assert.equal(tools.definitions().filter((definition) => definition.name.startsWith("browser.")).length, 12);
  const opened = requireSuccess(await tools.execute("browser.open", { url: `${fixtureServer.origin}/form` }, context), "browser.open");
  assert.equal(driver.activeProcessCount, 1);
  assert.ok(markerProcessIds().length >= 1, "Chromium process marker was not visible after launch");

  const first = requireSuccess(await tools.execute("browser.snapshot", { sessionId: opened.sessionId, pageId: opened.pageId }, context), "browser.snapshot:first");
  const nameRef = findRef(first, "textbox", "Name");
  const choiceRef = findRef(first, "combobox", "Choice");
  const clickRef = findRef(first, "button", "Click me");
  const continueRef = findRef(first, "button", "Continue");

  requireSuccess(await tools.execute("browser.type", { sessionId: opened.sessionId, pageId: opened.pageId, ref: nameRef, text: "Kim" }, context), "browser.type");
  requireSuccess(await tools.execute("browser.fill", { sessionId: opened.sessionId, pageId: opened.pageId, ref: nameRef, value: "Wonsig" }, context), "browser.fill");
  requireSuccess(await tools.execute("browser.select", { sessionId: opened.sessionId, pageId: opened.pageId, ref: choiceRef, values: ["b"] }, context), "browser.select");
  requireSuccess(await tools.execute("browser.click", { sessionId: opened.sessionId, pageId: opened.pageId, ref: clickRef }, context), "browser.click:state");
  requireSuccess(await tools.execute("browser.press", { sessionId: opened.sessionId, pageId: opened.pageId, key: "Escape" }, context), "browser.press");
  requireSuccess(await tools.execute("browser.wait", { sessionId: opened.sessionId, pageId: opened.pageId, ref: nameRef }, context), "browser.wait:ref");
  requireSuccess(await tools.execute("browser.wait", { sessionId: opened.sessionId, pageId: opened.pageId, timeMs: 1 }, context), "browser.wait:time");
  requireSuccess(await tools.execute("browser.wait", { sessionId: opened.sessionId, pageId: opened.pageId, url: `${fixtureServer.origin}/form` }, context), "browser.wait:url");

  const mutated = requireSuccess(await tools.execute("browser.snapshot", { sessionId: opened.sessionId, pageId: opened.pageId }, context), "browser.snapshot:mutated");
  assert.match(mutated.text, /name=Wonsig/);
  assert.match(mutated.text, /choice=b/);
  assert.match(mutated.text, /clicked=yes/);
  assert.match(mutated.text, /key=Escape/);

  const blockedPage = requireSuccess(await tools.execute("browser.open", { url: `${fixtureServer.origin}/form` }, context), "browser.open:blocked");
  const blockedSnapshot = requireSuccess(await tools.execute("browser.snapshot", { sessionId: blockedPage.sessionId, pageId: blockedPage.pageId }, context), "browser.snapshot:blocked");
  const blockedRef = findRef(blockedSnapshot, "button", "Blocked navigation");
  requireError(
    await tools.execute("browser.click", { sessionId: blockedPage.sessionId, pageId: blockedPage.pageId, ref: blockedRef }, context),
    "BROWSER_NAVIGATION_BLOCKED",
    "browser.click:blocked-navigation",
  );
  requireSuccess(await tools.execute("browser.close", { sessionId: blockedPage.sessionId, pageId: blockedPage.pageId }, context), "browser.close:blocked-page");

  const navigated = requireSuccess(await tools.execute("browser.click", { sessionId: opened.sessionId, pageId: opened.pageId, ref: continueRef }, context), "browser.click:navigate");
  assert.equal(navigated.navigated, true);
  assert.equal(navigated.url.startsWith(`${fixtureServer.origin}/after`), true);
  assert.ok(navigated.pageState);
  assert.equal(navigated.pageState.title, "OpenRill Interaction Result");
  assert.ok(navigated.documentGeneration > first.documentGeneration);

  const stale = requireError(
    await tools.execute("browser.click", { sessionId: opened.sessionId, pageId: opened.pageId, ref: continueRef }, context),
    "BROWSER_STALE_REF",
    "browser.click:stale",
  );
  assert.ok(stale.recoverySnapshot);
  assert.equal(stale.recoverySnapshot.documentGeneration, navigated.documentGeneration);
  const dialogRef = findRef(stale.recoverySnapshot, "button", "Open dialog");
  const finishRef = findRef(stale.recoverySnapshot, "button", "Finish");

  const dialog = requireError(
    await tools.execute("browser.click", { sessionId: opened.sessionId, pageId: opened.pageId, ref: dialogRef }, context),
    "BROWSER_DIALOG_BLOCKED",
    "browser.click:dialog",
  );
  assert.equal(dialog.dialog.type, "confirm");
  assert.equal(dialog.dialog.message, "Proceed with OpenRill?");

  requireSuccess(await tools.execute("browser.click", { sessionId: opened.sessionId, pageId: opened.pageId, ref: finishRef }, context), "browser.click:after-dialog");
  const finalSnapshot = requireSuccess(await tools.execute("browser.snapshot", { sessionId: opened.sessionId, pageId: opened.pageId }, context), "browser.snapshot:final");
  assert.match(finalSnapshot.text, /finished=yes/);

  requireSuccess(await tools.execute("browser.close", { sessionId: opened.sessionId }, context), "browser.close");
  const finalStatus = requireSuccess(await tools.execute("browser.status", {}, context), "browser.status:final");
  assert.equal(finalStatus.sessionCount, 0);
} catch (error) {
  primaryError = error;
} finally {
  const cleanupErrors = [];
  await runtime.close().catch((error) => cleanupErrors.push(error));
  await fixtureServer.close().catch((error) => cleanupErrors.push(error));
  if (driver.activeProcessCount !== 0) cleanupErrors.push(new Error(`adapter active process count is ${driver.activeProcessCount}`));
  const orphanIds = await waitForOrphanZero().catch((error) => { cleanupErrors.push(error); return []; });
  if (orphanIds.length > 0) cleanupErrors.push(new Error(`Chromium orphan marker processes remain: ${orphanIds.join(",")}`));
  if (primaryError) {
    if (cleanupErrors.length > 0) primaryError.cleanupErrors = cleanupErrors;
    throw primaryError;
  }
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, "STEP013B2 cleanup failed");
}

console.log(`OPENRILL_STEP013B2_LIVE_PASS executable=${driver.executable.source} tools=12 actions=6 navigation_state=INLINE stale_ref_recovery=SNAPSHOT dialog=BLOCK_AND_DISMISS process_count=0 chromium_orphan=0`);
