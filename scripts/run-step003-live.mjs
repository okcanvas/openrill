import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = await mkdtemp(join(tmpdir(), "openrill-step003-live-"));
const secretValue = "step003-live-secret-value";
const env = {
  ...process.env,
  OPENRILL_DATA_ROOT: join(root, "data"),
  OPENRILL_CONFIG_ROOT: join(root, "config"),
  OPENAI_API_KEY: secretValue,
};

const run = (args) => new Promise((resolve) => {
  const child = spawn(process.execPath, ["openrill.mjs", ...args], {
    cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"],
  });
  let out = ""; let err = "";
  child.stdout.on("data", (chunk) => { out += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk) => { err += chunk.toString("utf8"); });
  child.on("exit", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
});

let host;
try {
  const init = await run(["config", "init", "--profile", "live", "--json"]);
  if (init.code !== 0) throw new Error(`config init failed: ${JSON.stringify(init)}`);

  const pathResult = await run(["config", "path", "--profile", "live", "--json"]);
  if (pathResult.code !== 0) throw new Error(`config path failed: ${JSON.stringify(pathResult)}`);
  const paths = JSON.parse(pathResult.out);
  await writeFile(paths.sourcePath, [
    "version: 1",
    "host:",
    "  bind: 127.0.0.1",
    "  port: 0",
    "modelProviders:",
    "  openai:",
    "    type: openai",
    "    apiKey:",
    "      kind: env",
    "      key: OPENAI_API_KEY",
    "execution:",
    "  approvalMode: ask",
    "",
  ].join("\n"), "utf8");

  const validate = await run(["config", "validate", "--profile", "live", "--json"]);
  if (validate.code !== 0 || JSON.parse(validate.out).recovery !== "SOURCE") {
    throw new Error(`config validate failed: ${JSON.stringify(validate)}`);
  }

  const show = await run(["config", "show", "--profile", "live", "--json"]);
  if (show.code !== 0 || show.out.includes(secretValue) || show.out.includes("OPENAI_API_KEY")) {
    throw new Error(`config show is not redacted: ${JSON.stringify(show)}`);
  }
  const shown = JSON.parse(show.out);
  if (shown.redactedConfig.modelProviders.openai.apiKey.key !== "<redacted>") {
    throw new Error("redacted key missing");
  }

  host = spawn(process.execPath, ["openrill.mjs", "start", "--profile", "live", "--json"], {
    cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"],
  });
  const hostExit = new Promise((resolveExit) => host.once("exit", resolveExit));
  let buffer = ""; let ready;
  const readyPromise = new Promise((resolveReady, rejectReady) => {
    const timer = setTimeout(() => rejectReady(new Error("Host ready timeout")), 10_000);
    host.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const line = buffer.split(/\r?\n/).find((value) => value.trim().startsWith("{"));
      if (!line || ready) return;
      clearTimeout(timer);
      try { ready = JSON.parse(line); resolveReady(ready); } catch (error) { rejectReady(error); }
    });
    host.stderr.on("data", (chunk) => process.stderr.write(chunk));
    host.on("exit", (code) => {
      if (!ready) {
        clearTimeout(timer);
        rejectReady(new Error(`Host exited before ready code=${code}`));
      }
    });
  });
  const readyPayload = await readyPromise;
  if (readyPayload.state !== "READY" || readyPayload.port <= 0 || readyPayload.configRecovery !== "SOURCE") {
    throw new Error(`invalid Host config-ready payload: ${JSON.stringify(readyPayload)}`);
  }

  const stop = await run(["stop", "--profile", "live", "--json"]);
  if (stop.code !== 0 || JSON.parse(stop.out).reason !== "STOPPED") throw new Error(`stop failed: ${JSON.stringify(stop)}`);
  if (await hostExit !== 0) throw new Error("Host exited non-zero");

  const persisted = [
    await readFile(paths.materializedPath, "utf8"),
    await readFile(paths.lastKnownGoodPath, "utf8"),
  ];
  const journalNames = await readdir(paths.journalDir);
  for (const name of journalNames) persisted.push(await readFile(join(paths.journalDir, name), "utf8"));
  if (persisted.some((content) => content.includes(secretValue))) throw new Error("secret value persisted");

  process.stdout.write(`OPENRILL_STEP003_LIVE_PASS profile=live port=${readyPayload.port} config=${readyPayload.configRevision}\n`);
} finally {
  if (host?.exitCode === null) host.kill();
  await rm(root, { recursive: true, force: true });
}
