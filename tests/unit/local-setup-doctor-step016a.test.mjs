import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCliOptions, runCli } from "../../apps/agent-cli/dist/index.js";
import { createEphemeralOsSecretProviderForTests } from "../../packages/config/dist/index.js";

function io() {
  const stdout = [];
  const stderr = [];
  return { stdout, stderr, adapter: { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) } };
}

function runtime(env, cwd, provider, input = "") {
  return {
    env,
    cwd: () => cwd,
    platform: process.platform,
    readStdin: async () => input,
    osSecretProvider: provider,
    onSignal() {},
    offSignal() {},
  };
}

test("STEP016A CLI setup and doctor close a local Host profile without persisting the API key", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step016a-setup-"));
  const workspace = join(root, "workspace");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(workspace);
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") };
  const secrets = createEphemeralOsSecretProviderForTests();
  try {
    const output = io();
    const code = await runCli([
      "setup", "--profile", "local", "--workspace", workspace,
      "--endpoint", "https://example.invalid/v1", "--model", "fixture-model",
      "--api-key-stdin", "--json",
    ], output.adapter, runtime(env, root, secrets, "actual-api-key\n"));
    assert.equal(code, 0, output.stderr.join("\n"));
    const setup = JSON.parse(output.stdout[0]);
    assert.equal(setup.configured, true);
    assert.equal(setup.execution.backend, "host");
    assert.equal(await secrets.get("model.default.api-key"), "actual-api-key");

    const source = await readFile(setup.sourcePath, "utf8");
    assert.equal(source.includes("actual-api-key"), false);
    assert.match(source, /kind: os/);
    assert.match(source, /workspace/);

    const diagnosed = io();
    const doctorCode = await runCli(["doctor", "--profile", "local", "--json"], diagnosed.adapter, runtime(env, root, secrets));
    assert.equal(doctorCode, 0, diagnosed.stderr.join("\n"));
    const doctor = JSON.parse(diagnosed.stdout[0]);
    assert.equal(doctor.ready, true);
    assert.equal(doctor.checks.some((check) => check.name === "execution.backend" && check.state === "PASS" && /sandboxed=false/.test(check.detail)), true);
    assert.equal(doctor.checks.some((check) => check.name.includes("apiKey") && check.state === "PASS"), true);

    const duplicate = io();
    assert.equal(await runCli([
      "setup", "--profile", "local", "--workspace", workspace,
      "--endpoint", "https://example.invalid/v1", "--model", "fixture-model", "--api-key-stdin",
    ], duplicate.adapter, runtime(env, root, secrets, "replacement\n")), 21);
    assert.equal(await secrets.get("model.default.api-key"), "actual-api-key");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("STEP016A setup rolls back the prior OS secret when config validation fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step016a-rollback-"));
  const workspace = join(root, "workspace");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(workspace);
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") };
  const secrets = createEphemeralOsSecretProviderForTests({ "model.default.api-key": "prior-secret" });
  try {
    const output = io();
    const code = await runCli([
      "setup", "--profile", "rollback", "--workspace", workspace,
      "--endpoint", "https://example.invalid/v1", "--model", "fixture-model",
      "--backend", "docker", "--docker-image", "not-digest-pinned",
      "--api-key-stdin", "--force",
    ], output.adapter, runtime(env, root, secrets, "new-secret\n"));
    assert.equal(code, 20);
    assert.equal(await secrets.get("model.default.api-key"), "prior-secret");
    assert.equal(output.stderr.some((line) => /setup failed/.test(line)), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("STEP016A doctor uses the configured Docker backend doctor without running a browser", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step016a-docker-doctor-"));
  const workspace = join(root, "workspace");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(workspace);
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") };
  const secrets = createEphemeralOsSecretProviderForTests();
  const image = `fixture/image@sha256:${"a".repeat(64)}`;
  try {
    const configured = io();
    assert.equal(await runCli([
      "setup", "--profile", "docker", "--workspace", workspace,
      "--endpoint", "https://example.invalid/v1", "--model", "fixture-model",
      "--backend", "docker", "--docker-image", image, "--api-key-stdin",
    ], configured.adapter, runtime(env, root, secrets, "docker-key\n")), 0);

    const diagnosed = io();
    let observedImage = null;
    const doctorRuntime = {
      ...runtime(env, root, secrets),
      dockerDoctor: async (options) => { observedImage = options.image; return { available: true, detail: "fixture-daemon" }; },
    };
    assert.equal(await runCli(["doctor", "--profile", "docker", "--json"], diagnosed.adapter, doctorRuntime), 0);
    assert.equal(observedImage, image);
    const payload = JSON.parse(diagnosed.stdout[0]);
    assert.equal(payload.checks.some((check) => check.name === "execution.backend" && /fixture-daemon/.test(check.detail)), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("STEP016A CLI never accepts a literal API key argument", () => {
  assert.equal(parseCliOptions(["setup", "--endpoint", "https://example.invalid/v1", "--model", "fixture"]).command, "setup");
  assert.throws(() => parseCliOptions(["setup", "--api-key", "plaintext"]), /unknown option/);
  assert.throws(() => parseCliOptions(["doctor", "--workspace", "."]), /doctor accepts only/);
});
