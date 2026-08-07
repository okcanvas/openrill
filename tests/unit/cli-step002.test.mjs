import test from "node:test";
import assert from "node:assert/strict";
import { parseCliOptions, runCli } from "../../apps/agent-cli/dist/index.js";

test("STEP002 CLI parses lifecycle commands without opening hidden background mode", () => {
  assert.equal(parseCliOptions(["start", "--profile", "Work", "--port", "0"]).command, "start");
  assert.equal(parseCliOptions(["run"]).command, "run");
  assert.throws(() => parseCliOptions(["start", "--background"]));
});

test("status on a missing profile is explicit and machine-readable", async () => {
  const stdout=[]; const stderr=[];
  const code = await runCli(["status", "--profile", "missing", "--json"], { stdout:v=>stdout.push(v), stderr:v=>stderr.push(v) }, {
    env: { OPENRILL_DATA_ROOT: "/tmp/openrill-cli-missing", OPENRILL_CONFIG_ROOT: "/tmp/openrill-cli-missing-config" },
    onSignal() {}, offSignal() {},
  });
  assert.equal(code, 3);
  assert.equal(stderr.length, 0);
  assert.equal(JSON.parse(stdout[0]).reason, "STOPPED");
});

test("SIGINT and SIGTERM converge on one idempotent graceful shutdown path", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "openrill-cli-signal-"));
  const listeners = new Map();
  const stdout=[]; const stderr=[];
  const execution = runCli(["start", "--profile", "signal", "--port", "0"], {
    stdout: value => { stdout.push(value); if (value.includes("Host READY")) { listeners.get("SIGINT")?.(); listeners.get("SIGTERM")?.(); } },
    stderr: value => stderr.push(value),
  }, {
    env: { OPENRILL_DATA_ROOT: join(root,"data"), OPENRILL_CONFIG_ROOT: join(root,"config") },
    onSignal: (signal, listener) => listeners.set(signal, listener),
    offSignal: (signal) => listeners.delete(signal),
  });
  assert.equal(await execution, 0);
  assert.equal(stderr.length, 0);
  assert.equal(stdout.filter(value => value.includes("Host STOPPED")).length, 1);
  await rm(root, { recursive: true, force: true });
});

test("a signal accepted before Host handle creation prevents startup", async () => {
  const stdout=[]; const stderr=[];
  const code = await runCli(["start", "--profile", "pre-signal", "--port", "0"], {
    stdout: value => stdout.push(value), stderr: value => stderr.push(value),
  }, {
    env: { OPENRILL_DATA_ROOT: "/tmp/openrill-pre-signal", OPENRILL_CONFIG_ROOT: "/tmp/openrill-pre-signal-config" },
    onSignal: (signal, listener) => { if (signal === "SIGINT") listener(); },
    offSignal() {},
  });
  assert.equal(code, 0);
  assert.equal(stdout.length, 0);
  assert.equal(stderr.length, 0);
});
