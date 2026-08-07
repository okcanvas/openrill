import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { BrowserRuntime, registerBrowserTools } from "../packages/browser-runtime/dist/index.js";
import { createPlaywrightBrowserDriver } from "../packages/browser-playwright/dist/index.js";
import { ToolRegistry } from "../packages/tool-runtime/dist/index.js";
import { createWorkspaceArtifactStore } from "../packages/tools-files/dist/index.js";

const marker = `openrill-step013b3-${randomUUID()}`;
const context = {
  runId: "step013b3-live-run",
  attemptId: "step013b3-live-attempt",
  workspaceId: "step013b3-live-workspace",
  conversationId: "step013b3-live-conversation",
  toolCallId: "step013b3-live-tool",
};
const SMALL_DOWNLOAD = Buffer.from("OpenRill STEP013B3 bounded download\n", "utf8");
const BIG_DOWNLOAD = Buffer.alloc(96 * 1024, 0x42);
const LONG_PAGE_TITLE = "T".repeat(5_000);

function fixturePage() {
  return `<!doctype html><html><head><title>${LONG_PAGE_TITLE}</title></head><body>
    <main>
      <h1>Browser Artifact fixture</h1>
      <a aria-label="Download fixture" href="/download">Download fixture</a>
      <a aria-label="Download oversized fixture" href="/big-download">Download oversized fixture</a>
      <p id="ready">ready=yes</p>
    </main>
    <script>
      console.log("step013b3-console-ready");
      fetch("/api?token=secret-step013b3").then(() => console.info("step013b3-fetch-complete"));
      fetch("/missing?token=secret-step013b3").catch(() => undefined);
      setTimeout(() => { throw new Error("step013b3-page-error"); }, 25);
    </script>
  </body></html>`;
}

async function startFixtureServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/page") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; style-src 'unsafe-inline'",
      });
      response.end(fixturePage());
      return;
    }
    if (url.pathname === "/api") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end('{"ok":true}');
      return;
    }
    if (url.pathname === "/download") {
      response.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": 'attachment; filename="fixture.txt"',
        "content-length": SMALL_DOWNLOAD.byteLength,
        "cache-control": "no-store",
      });
      response.end(SMALL_DOWNLOAD);
      return;
    }
    if (url.pathname === "/big-download") {
      response.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-disposition": 'attachment; filename="oversized.bin"',
        "content-length": BIG_DOWNLOAD.byteLength,
        "cache-control": "no-store",
      });
      response.end(BIG_DOWNLOAD);
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    response.end("not found");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
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
  assert.equal(result.isError, false, `${name} returned Tool error: ${JSON.stringify(result.output)}`);
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

async function waitForEvidence(tools, sessionId, pageId) {
  const deadline = Date.now() + 5_000;
  let evidence;
  while (Date.now() < deadline) {
    evidence = requireSuccess(await tools.execute("browser.evidence", { sessionId, pageId, limit: 50 }, context), "browser.evidence");
    const kinds = new Set(evidence.events.map((event) => event.kind));
    const text = JSON.stringify(evidence.events);
    if (kinds.has("console") && kinds.has("page_error") && kinds.has("network") && text.includes("step013b3-page-error")) return evidence;
    await delay(50);
  }
  throw new Error(`bounded Browser evidence did not become complete: ${JSON.stringify(evidence)}`);
}

const fixtureServer = await startFixtureServer();
const artifactRoot = await mkdtemp(join(tmpdir(), "openrill-step013b3-artifacts-"));
const metadata = [];
let artifactSequence = 0;
const artifacts = createWorkspaceArtifactStore({
  rootDirectory: artifactRoot,
  createId: () => `artifact-${++artifactSequence}`,
  metadataSink: { recordArtifact: (value) => metadata.push(value) },
});
const launchArgs = [
  "--disable-background-networking",
  "--disable-component-update",
  "--no-first-run",
  `--openrill-step013b3-marker=${marker}`,
  ...(typeof process.getuid === "function" && process.getuid() === 0 ? ["--no-sandbox"] : []),
];
const driver = createPlaywrightBrowserDriver({
  ...(process.env.OPENRILL_BROWSER_EXECUTABLE ? { executablePath: process.env.OPENRILL_BROWSER_EXECUTABLE } : {}),
  launchArgs,
});
const runtime = new BrowserRuntime({
  driver,
  artifacts,
  executablePath: driver.executable.executablePath,
  headless: true,
  limits: {
    maxSessions: 1,
    maxPagesPerSession: 1,
    launchTimeoutMs: 20_000,
    actionTimeoutMs: 10_000,
    idleTimeoutMs: 60_000,
    sweepIntervalMs: 60_000,
  },
  outputLimits: {
    maxScreenshotBytes: 2 * 1024 * 1024,
    maxDownloadBytes: 64 * 1024,
    maxEvidenceEvents: 50,
  },
  policy: {
    navigation: { allowPrivateNetwork: false, allowedHostnames: ["127.0.0.1"] },
    popup: "DENY",
    download: "EXPLICIT_ARTIFACT_ONLY",
    persistentStorage: "DENY",
    dialog: "BLOCK_AND_DISMISS",
  },
});
const tools = new ToolRegistry();
registerBrowserTools(tools, runtime);

let primaryError;
try {
  assert.equal(tools.definitions().filter((definition) => definition.name.startsWith("browser.")).length, 15);
  const opened = requireSuccess(await tools.execute("browser.open", { url: `${fixtureServer.origin}/page` }, context), "browser.open");
  assert.equal(driver.activeProcessCount, 1);
  assert.ok(markerProcessIds().length >= 1, "Chromium process marker was not visible after launch");

  const snapshot = requireSuccess(await tools.execute("browser.snapshot", { sessionId: opened.sessionId, pageId: opened.pageId }, context), "browser.snapshot");
  const downloadRef = findRef(snapshot, "link", "Download fixture");
  const oversizedRef = findRef(snapshot, "link", "Download oversized fixture");

  const screenshot = requireSuccess(await tools.execute("browser.screenshot", {
    sessionId: opened.sessionId,
    pageId: opened.pageId,
    format: "png",
  }, context), "browser.screenshot");
  assert.equal(screenshot.artifact.kind, "BROWSER_SCREENSHOT");
  assert.equal(screenshot.artifact.mediaType, "image/png");
  const screenshotBytes = await readFile(join(artifactRoot, screenshot.artifact.artifactId, screenshot.artifact.fileName));
  assert.deepEqual([...screenshotBytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(screenshotBytes.byteLength, screenshot.artifact.sizeBytes);
  const screenshotSource = JSON.parse(await readFile(join(artifactRoot, screenshot.artifact.artifactId, "source.json"), "utf8"));
  assert.equal(screenshotSource.title.length, 4_096);
  assert.equal(screenshotSource.title, LONG_PAGE_TITLE.slice(0, 4_096));

  const download = requireSuccess(await tools.execute("browser.download", {
    sessionId: opened.sessionId,
    pageId: opened.pageId,
    ref: downloadRef,
  }, context), "browser.download");
  assert.equal(download.artifact.kind, "BROWSER_DOWNLOAD");
  assert.equal(download.artifact.fileName, "fixture.txt");
  assert.deepEqual(await readFile(join(artifactRoot, download.artifact.artifactId, download.artifact.fileName)), SMALL_DOWNLOAD);
  assert.equal(metadata.length, 2);

  const metadataBeforeOversized = metadata.length;
  requireError(await tools.execute("browser.download", {
    sessionId: opened.sessionId,
    pageId: opened.pageId,
    ref: oversizedRef,
  }, context), "BROWSER_OUTPUT_TOO_LARGE", "browser.download:oversized");
  assert.equal(metadata.length, metadataBeforeOversized, "oversized download committed Artifact metadata");

  const evidence = await waitForEvidence(tools, opened.sessionId, opened.pageId);
  assert.ok(evidence.events.length <= 50);
  assert.ok(evidence.nextSequence >= evidence.events.at(-1).sequence);
  const evidenceText = JSON.stringify(evidence.events);
  assert.match(evidenceText, /step013b3-console-ready/);
  assert.match(evidenceText, /step013b3-page-error/);
  assert.match(evidenceText, /"kind":"network"/);
  assert.match(evidenceText, /\?redacted/);
  assert.doesNotMatch(evidenceText, /secret-step013b3/);
  assert.doesNotMatch(evidenceText, /postData|headersArray|allHeaders/);

  const cursor = requireSuccess(await tools.execute("browser.evidence", {
    sessionId: opened.sessionId,
    pageId: opened.pageId,
    afterSequence: evidence.nextSequence,
    limit: 10,
  }, context), "browser.evidence:cursor");
  assert.equal(cursor.nextSequence, evidence.nextSequence);
  assert.equal(cursor.events.length, 0);

  requireSuccess(await tools.execute("browser.close", { sessionId: opened.sessionId }, context), "browser.close");
  assert.equal(requireSuccess(await tools.execute("browser.status", {}, context), "browser.status").sessionCount, 0);
} catch (error) {
  primaryError = error;
} finally {
  const cleanupErrors = [];
  await runtime.close().catch((error) => cleanupErrors.push(error));
  await fixtureServer.close().catch((error) => cleanupErrors.push(error));
  await rm(artifactRoot, { recursive: true, force: true }).catch((error) => cleanupErrors.push(error));
  if (driver.activeProcessCount !== 0) cleanupErrors.push(new Error(`adapter active process count is ${driver.activeProcessCount}`));
  const orphanIds = await waitForOrphanZero().catch((error) => { cleanupErrors.push(error); return []; });
  if (orphanIds.length > 0) cleanupErrors.push(new Error(`Chromium orphan marker processes remain: ${orphanIds.join(",")}`));
  if (primaryError) {
    if (cleanupErrors.length > 0) primaryError.cleanupErrors = cleanupErrors;
    throw primaryError;
  }
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, "STEP013B3 cleanup failed");
}

console.log(`OPENRILL_STEP013B3_LIVE_PASS executable=${driver.executable.source} tools=15 artifacts=SCREENSHOT_DOWNLOAD evidence=CONSOLE_PAGE_ERROR_NETWORK bounds=ENFORCED process_count=0 chromium_orphan=0`);
