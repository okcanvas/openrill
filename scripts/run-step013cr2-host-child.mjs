import process from "node:process";
import { createPlaywrightBrowserDriver } from "../packages/browser-playwright/dist/index.js";
import { startLocalHost } from "../services/agent-host/dist/index.js";

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name}`);
  return value;
};

const profile = required("OPENRILL_STEP013CR2_PROFILE");
const workspacePath = required("OPENRILL_STEP013CR2_WORKSPACE");
const modelEndpoint = required("OPENRILL_STEP013CR2_MODEL_ENDPOINT");
const marker = required("OPENRILL_STEP013CR2_BROWSER_MARKER");
const env = {
  ...process.env,
  OPENRILL_DATA_ROOT: required("OPENRILL_DATA_ROOT"),
  OPENRILL_CONFIG_ROOT: required("OPENRILL_CONFIG_ROOT"),
  OPENRILL_STEP013CR2_API_KEY: "fixture-key",
};
const launchArgs = [
  "--disable-background-networking",
  "--disable-component-update",
  "--no-first-run",
  `--openrill-step013cr2-marker=${marker}`,
  ...(typeof process.getuid === "function" && process.getuid() === 0 ? ["--no-sandbox"] : []),
];
const driver = createPlaywrightBrowserDriver({
  ...(process.env.OPENRILL_BROWSER_EXECUTABLE ? { executablePath: process.env.OPENRILL_BROWSER_EXECUTABLE } : {}),
  launchArgs,
  env,
});
const config = {
  version: 1,
  host: { bind: "127.0.0.1", port: 0 },
  modelProviders: {
    default: {
      type: "openai-responses",
      endpoint: modelEndpoint,
      apiKey: { kind: "env", key: "OPENRILL_STEP013CR2_API_KEY" },
      model: "step013cr2-fixture",
      maxOutputTokens: 256,
      maxRetries: 0,
    },
  },
  workspaces: [{ id: "alpha", path: workspacePath, readOnly: false }],
  execution: { approvalMode: "deny", defaultTimeoutMs: 10_000, approvalTimeoutMs: 10_000 },
  skills: { roots: [], enabled: [] },
  automation: { enabled: true },
  browser: {
    enabled: true,
    headless: true,
    launchTimeoutMs: 20_000,
    actionTimeoutMs: 10_000,
    idleTimeoutMs: 60_000,
    sweepIntervalMs: 60_000,
    maxSessions: 1,
    maxPagesPerSession: 1,
    allowPrivateNetwork: false,
    allowedHostnames: ["127.0.0.1"],
  },
  ui: { openOnStart: false },
};

const host = await startLocalHost({
  profile,
  bind: "127.0.0.1",
  port: 0,
  force: true,
  forceMinimumAgeMs: 0,
  env,
  config,
  configRoot: env.OPENRILL_CONFIG_ROOT,
  browserDriver: driver,
  automationLeaseDurationMs: 1_500,
  automationRenewIntervalMs: 500,
});
await host.ready;
console.log(`OPENRILL_STEP013CR2_CHILD_READY pid=${process.pid} port=${host.port} browser_processes=${driver.activeProcessCount}`);

let closing = false;
let releaseKeepAlive;
const keepAlive = new Promise((resolve) => { releaseKeepAlive = resolve; });
const close = async (reason) => {
  if (closing) return;
  closing = true;
  try {
    await host.close(reason);
    await host.closed;
    console.log(`OPENRILL_STEP013CR2_CHILD_CLOSED pid=${process.pid} browser_processes=${driver.activeProcessCount}`);
    process.exitCode = 0;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    releaseKeepAlive();
  }
};
let stdinBuffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdinBuffer += chunk;
  if (stdinBuffer.split(/\r?\n/).some((line) => line.trim() === "CLOSE")) void close("stdin-close");
});
process.on("SIGTERM", () => { void close("sigterm"); });
process.on("SIGINT", () => { void close("sigint"); });
await keepAlive;
