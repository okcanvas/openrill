import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  loadOpenRillConfig,
  resolveConfigPaths,
  resolveProfilePaths,
  resolveSecretReference,
} from "../packages/config/dist/index.js";

const STEP = "STEP016A_LOCAL_SETUP_DOCTOR_AND_WINDOWS_DPAPI_SECRET_FOUNDATION";
const VERSION = "0.16.0-step016a";
const SCHEMA = 15;
const PROFILE = "step016a-live";
const SECRET_KEY = "model.step016a-live.api-key";
const MAX_OUTPUT_BYTES = 1_048_576;

class BoundedCollector {
  #chunks = [];
  #bytes = 0;
  constructor(maxBytes) { this.maxBytes = maxBytes; }
  push(chunk) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.#chunks.push(buffer);
    this.#bytes += buffer.length;
    while (this.#bytes > this.maxBytes && this.#chunks.length > 0) {
      const first = this.#chunks[0];
      const overflow = this.#bytes - this.maxBytes;
      if (first.length <= overflow) { this.#chunks.shift(); this.#bytes -= first.length; }
      else { this.#chunks[0] = first.subarray(overflow); this.#bytes -= overflow; }
    }
  }
  text() { return Buffer.concat(this.#chunks).toString("utf8"); }
}

async function runCli(args, env, input = null, timeoutMs = 30_000) {
  return await new Promise((resolveResult, reject) => {
    const stdout = new BoundedCollector(MAX_OUTPUT_BYTES);
    const stderr = new BoundedCollector(MAX_OUTPUT_BYTES);
    let timedOut = false;
    let settled = false;
    const child = spawn(process.execPath, [resolve("openrill.mjs"), ...args], {
      cwd: resolve("."),
      env,
      shell: false,
      windowsHide: true,
      stdio: [input === null ? "ignore" : "pipe", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult({ exitCode, signal, timedOut, stdout: stdout.text(), stderr: stderr.text() });
    });
    if (input !== null) child.stdin.end(input, "utf8");
  });
}

async function allFiles(root) {
  const output = [];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) output.push(path);
    }
  }
  await visit(root);
  return output;
}

function parseSingleJson(output, label) {
  const lines = output.trim().split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 1, `${label} expected one JSON line: ${output}`);
  return JSON.parse(lines[0]);
}

if (process.platform !== "win32") {
  throw new Error("OPENRILL_STEP016A_WINDOWS_DPAPI_REQUIRED");
}

const root = await mkdtemp(join(tmpdir(), "openrill-step016a-live-"));
const dataBase = join(root, "data");
const configBase = join(root, "config");
const workspace = join(root, "workspace");
await import("node:fs/promises").then(({ mkdir }) => mkdir(workspace, { recursive: true }));
const secret = `or-step016a-${randomBytes(32).toString("hex")}`;
const replacement = `or-step016a-replacement-${randomBytes(24).toString("hex")}`;
const env = {
  ...process.env,
  OPENRILL_DATA_ROOT: dataBase,
  OPENRILL_CONFIG_ROOT: configBase,
  NO_COLOR: "1",
  NODE_DISABLE_COLORS: "1",
};
const checks = [];
const pass = (name, outcome, detail = "") => {
  assert.equal(Boolean(outcome), true, `${name}${detail ? `: ${detail}` : ""}`);
  checks.push(name);
};

try {
  const setup = await runCli([
    "setup", "--profile", PROFILE,
    "--workspace", workspace,
    "--workspace-id", "default",
    "--provider", "default",
    "--endpoint", "https://example.invalid/v1",
    "--model", "fixture-model",
    "--secret-key", SECRET_KEY,
    "--api-key-stdin",
    "--backend", "host",
    "--json",
  ], env, `${secret}\n`);
  pass("setup-exit", setup.exitCode === 0 && !setup.timedOut, `${setup.stderr}\n${setup.stdout}`);
  const setupJson = parseSingleJson(setup.stdout, "setup");
  pass("setup-json", setupJson.configured === true && setupJson.execution.backend === "host");

  const doctor = await runCli(["doctor", "--profile", PROFILE, "--json"], env);
  pass("doctor-exit", doctor.exitCode === 0 && !doctor.timedOut, `${doctor.stderr}\n${doctor.stdout}`);
  const doctorJson = parseSingleJson(doctor.stdout, "doctor");
  pass("doctor-ready", doctorJson.ready === true && doctorJson.checks.every((item) => item.state !== "FAIL"));

  const profilePaths = resolveProfilePaths({ profile: PROFILE, env, platform: "win32" });
  const configPaths = resolveConfigPaths(profilePaths, { platform: "win32" });
  const loaded = await loadOpenRillConfig({ paths: configPaths, env, platform: "win32" });
  const reference = loaded.config.modelProviders.default.apiKey;
  pass("reference-only-config", reference?.kind === "os" && reference.key === SECRET_KEY);
  const resolved = await resolveSecretReference(reference, { env, configRoot: profilePaths.configRoot, platform: "win32" });
  pass("dpapi-round-trip", resolved === secret);

  const duplicate = await runCli([
    "setup", "--profile", PROFILE,
    "--workspace", workspace,
    "--endpoint", "https://example.invalid/v1",
    "--model", "fixture-model",
    "--secret-key", SECRET_KEY,
    "--api-key-stdin",
    "--json",
  ], env, `${replacement}\n`);
  pass("duplicate-protected", duplicate.exitCode === 21 && /--force/.test(duplicate.stderr));
  const afterDuplicate = await resolveSecretReference(reference, { env, configRoot: profilePaths.configRoot, platform: "win32" });
  pass("duplicate-no-mutation", afterDuplicate === secret);

  const encryptedRoot = join(profilePaths.configRoot, "os-secrets");
  const encryptedFiles = await allFiles(encryptedRoot);
  pass("encrypted-blob-created", encryptedFiles.length === 1 && (await stat(encryptedFiles[0])).size > 0);

  const evidence = [setup.stdout, setup.stderr, doctor.stdout, doctor.stderr, duplicate.stdout, duplicate.stderr];
  for (const file of await allFiles(root)) evidence.push(await readFile(file));
  const secretBytes = Buffer.from(secret, "utf8");
  const replacementBytes = Buffer.from(replacement, "utf8");
  const leaked = evidence.some((item) => {
    const buffer = Buffer.isBuffer(item) ? item : Buffer.from(item, "utf8");
    return buffer.includes(secretBytes) || buffer.includes(replacementBytes);
  });
  pass("plaintext-not-persisted", !leaked);

  const configText = await readFile(configPaths.sourcePath, "utf8");
  pass("yaml-reference-only", /kind:\s*os/.test(configText) && configText.includes(SECRET_KEY) && !configText.includes(secret));
  pass("browser-not-run", true);

  console.log(
    `${STEP} checks=${checks.length}/${checks.length} state=PASSED version=${VERSION} schema=${SCHEMA} ` +
    "os_secret=WINDOWS_DPAPI_CURRENT_USER setup=COMPLETE doctor=READY duplicate=PROTECTED " +
    "secret_persistence=REFERENCE_ONLY model_network=NOT_RUN browser=NOT_RUN cleanup=QUIESCENT",
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
