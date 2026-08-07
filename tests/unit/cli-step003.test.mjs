import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCliOptions, runCli } from "../../apps/agent-cli/dist/index.js";

function runtime(env) {
  return { env, onSignal() {}, offSignal() {} };
}

test("STEP003 CLI exposes explicit config subcommands and rejects lifecycle-only options", () => {
  assert.equal(parseCliOptions(["config", "path"]).configAction, "path");
  assert.equal(parseCliOptions(["config", "validate"]).configAction, "validate");
  assert.equal(parseCliOptions(["config", "show"]).configAction, "show");
  assert.equal(parseCliOptions(["config", "init"]).configAction, "init");
  assert.throws(() => parseCliOptions(["config", "show", "--port", "9"]));
});

test("config init, validate, show, and duplicate init are closed and redacted", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-cli-config-"));
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") };
  try {
    let stdout=[]; let stderr=[];
    assert.equal(await runCli(["config", "init", "--profile", "cli", "--json"], { stdout:v=>stdout.push(v), stderr:v=>stderr.push(v) }, runtime(env)), 0);
    assert.equal(stderr.length, 0);
    assert.equal(typeof JSON.parse(stdout[0]).sourceRevision, "string");

    stdout=[]; stderr=[];
    assert.equal(await runCli(["config", "validate", "--profile", "cli", "--json"], { stdout:v=>stdout.push(v), stderr:v=>stderr.push(v) }, runtime(env)), 0);
    assert.equal(JSON.parse(stdout[0]).valid, true);

    stdout=[]; stderr=[];
    assert.equal(await runCli(["config", "show", "--profile", "cli", "--json"], { stdout:v=>stdout.push(v), stderr:v=>stderr.push(v) }, runtime(env)), 0);
    const shown = JSON.parse(stdout[0]);
    assert.equal(shown.recovery, "SOURCE");
    assert.equal(shown.config, undefined);

    stdout=[]; stderr=[];
    assert.equal(await runCli(["config", "init", "--profile", "cli"], { stdout:v=>stdout.push(v), stderr:v=>stderr.push(v) }, runtime(env)), 21);
    assert.match(stderr[0], /already exists/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
