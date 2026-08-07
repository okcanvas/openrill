import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { BrowserRuntime, BrowserRuntimeError, registerBrowserTools } from "../packages/browser-runtime/dist/index.js";
import { createPlaywrightBrowserDriver } from "../packages/browser-playwright/dist/index.js";
import { ToolRegistry } from "../packages/tool-runtime/dist/index.js";

const marker = `openrill-step013b1-${randomUUID()}`;
const context = {
  runId: "step013b1-live-run",
  attemptId: "step013b1-live-attempt",
  workspaceId: "step013b1-live-workspace",
  conversationId: "step013b1-live-conversation",
  toolCallId: "step013b1-live-tool",
};

function fixture(pathname) {
  if (pathname === "/one") {
    return `<!doctype html><html><head><title>OpenRill Fixture One</title></head><body><main><h1>First document</h1><button type="button">Continue</button><p>Read-only browser observation one.</p></main></body></html>`;
  }
  if (pathname === "/two") {
    return `<!doctype html><html><head><title>OpenRill Fixture Two</title></head><body><main><h1>Second document</h1><button type="button">Finish</button><p>Read-only browser observation two.</p></main></body></html>`;
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
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
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
    if (result.error || result.status !== 0) {
      throw new Error(`failed to inspect Windows Chromium processes: ${result.error?.message ?? result.stderr}`);
    }
    return result.stdout.split(/\r?\n/).map((value) => Number.parseInt(value.trim(), 10)).filter(Number.isInteger);
  }
  const result = spawnSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`failed to inspect Chromium processes: ${result.error?.message ?? result.stderr}`);
  }
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

const fixtureServer = await startFixtureServer();
const launchArgs = [
  "--disable-background-networking",
  "--disable-component-update",
  "--no-first-run",
  `--openrill-step013b1-marker=${marker}`,
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
  },
});
const tools = new ToolRegistry();
registerBrowserTools(tools, runtime);

let primaryError;
try {
  const initialStatus = requireSuccess(await tools.execute("browser.status", {}, context), "browser.status");
  assert.equal(initialStatus.sessionCount, 0);

  const opened = requireSuccess(await tools.execute("browser.open", {}, context), "browser.open");
  const listed = requireSuccess(await tools.execute("browser.list", {}, context), "browser.list");
  assert.equal(listed.sessions.length, 1);
  assert.equal(listed.sessions[0].pages.length, 1);
  assert.equal(driver.activeProcessCount, 1);
  assert.ok(markerProcessIds().length >= 1, "Chromium process marker was not visible after launch");

  const firstNavigation = requireSuccess(await tools.execute("browser.navigate", {
    sessionId: opened.sessionId,
    pageId: opened.pageId,
    url: `${fixtureServer.origin}/one`,
  }, context), "browser.navigate:first");
  const first = requireSuccess(await tools.execute("browser.snapshot", {
    sessionId: opened.sessionId,
    pageId: opened.pageId,
  }, context), "browser.snapshot:first");
  assert.equal(first.url, `${fixtureServer.origin}/one`);
  assert.equal(first.title, "OpenRill Fixture One");
  assert.match(first.text, /Read-only browser observation one/);
  const continueElement = first.elements.find((element) => element.role === "button" && element.name === "Continue");
  assert.ok(continueElement?.ref, "snapshot must expose role/name/ref for Continue button");
  assert.equal(first.documentGeneration, firstNavigation.documentGeneration);
  runtime.assertElementRefCurrent(opened.sessionId, opened.pageId, continueElement.ref);

  const secondNavigation = requireSuccess(await tools.execute("browser.navigate", {
    sessionId: opened.sessionId,
    pageId: opened.pageId,
    url: `${fixtureServer.origin}/two`,
  }, context), "browser.navigate:second");
  assert.ok(secondNavigation.documentGeneration > first.documentGeneration);
  assert.throws(
    () => runtime.assertElementRefCurrent(opened.sessionId, opened.pageId, continueElement.ref),
    (error) => error instanceof BrowserRuntimeError && error.code === "BROWSER_STALE_REF",
  );

  const second = requireSuccess(await tools.execute("browser.snapshot", {
    sessionId: opened.sessionId,
    pageId: opened.pageId,
  }, context), "browser.snapshot:second");
  assert.equal(second.title, "OpenRill Fixture Two");
  assert.ok(second.documentGeneration > first.documentGeneration);
  assert.ok(second.elements.some((element) => element.role === "button" && element.name === "Finish"));
  assert.equal(second.elements.some((element) => element.ref === continueElement.ref), false);

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
  const orphanIds = await waitForOrphanZero().catch((error) => {
    cleanupErrors.push(error);
    return [];
  });
  if (orphanIds.length > 0) cleanupErrors.push(new Error(`Chromium orphan marker processes remain: ${orphanIds.join(",")}`));
  if (primaryError) {
    if (cleanupErrors.length > 0) primaryError.cleanupErrors = cleanupErrors;
    throw primaryError;
  }
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, "STEP013B1 cleanup failed");
}

console.log(`OPENRILL_STEP013B1_LIVE_PASS executable=${driver.executable.source} tools=6 stale_ref=BROWSER_STALE_REF process_count=0 chromium_orphan=0`);
